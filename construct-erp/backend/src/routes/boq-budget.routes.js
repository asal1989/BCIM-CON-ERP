const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { query, withTransaction } = require('../config/database');
const { loadProjectScope, userCanAccessProject } = require('../middleware/projectScope');
const { runSchemaInit } = require('../utils/schemaInit');
const { BOQ_COST_HEADS } = require('../constants/boqCostHeads');

runSchemaInit('boq_item_budget_breakdown', async () => {
  await query(`
    CREATE TABLE IF NOT EXISTS boq_item_budget_breakdown (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      boq_item_id UUID NOT NULL REFERENCES boq_items(id) ON DELETE CASCADE,
      project_id UUID NOT NULL REFERENCES projects(id),
      cost_head TEXT NOT NULL,
      budgeted_pct NUMERIC(6,3) DEFAULT 0,
      budgeted_amount NUMERIC(16,2) DEFAULT 0,
      created_by UUID,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (boq_item_id, cost_head)
    )
  `);
});

runSchemaInit('project_costhead_budgets', async () => {
  await query(`
    CREATE TABLE IF NOT EXISTS project_costhead_budgets (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      cost_head TEXT NOT NULL,
      budget_amount NUMERIC(16,2) DEFAULT 0,
      created_by UUID,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (project_id, cost_head)
    )
  `);
});

router.use(authenticate);
router.use(loadProjectScope);

// GET /boq-budget/:project_id — BOQ items + breakdown pivoted per item
router.get('/:project_id', async (req, res) => {
  try {
    const { project_id } = req.params;
    const proj = await query(`SELECT id FROM projects WHERE id=$1 AND company_id=$2`, [project_id, req.user.company_id]);
    if (!proj.rows.length) return res.status(404).json({ error: 'Project not found' });
    if (!userCanAccessProject(req, project_id)) {
      return res.status(403).json({ error: 'You do not have access to this project.' });
    }

    const items = await query(`
      SELECT b.id, b.chapter_no, b.chapter_name, b.item_no, b.description, b.unit, b.quantity, b.rate,
             ROUND((b.quantity * b.rate)::numeric, 2) AS amount
      FROM boq_items b
      WHERE b.project_id = $1 AND b.is_active = true
      ORDER BY b.chapter_no, b.item_no
    `, [project_id]);

    const breakdown = await query(`
      SELECT boq_item_id, cost_head, budgeted_pct, budgeted_amount
      FROM boq_item_budget_breakdown
      WHERE project_id = $1
    `, [project_id]);

    const raActuals = await query(`
      SELECT rbi.boq_item_id, rbi.cost_head, SUM(rbi.current_qty * rbi.rate) AS actual
      FROM ra_bill_items rbi
      JOIN ra_bills rb ON rb.id = rbi.ra_bill_id
      WHERE rb.project_id = $1 AND rb.status IN ('certified','paid')
      GROUP BY rbi.boq_item_id, rbi.cost_head
    `, [project_id]);

    const scActuals = await query(`
      SELECT swi.boq_item_id, bi.cost_head, SUM(bi.curr_qty * bi.rate) AS actual
      FROM sc_bill_items bi
      JOIN sc_bills sb ON sb.id = bi.bill_id
      JOIN sc_wo_items swi ON swi.id = bi.wo_item_id
      WHERE sb.project_id = $1 AND sb.status IN ('approved','paid') AND swi.boq_item_id IS NOT NULL
      GROUP BY swi.boq_item_id, bi.cost_head
    `, [project_id]);

    // Link advances to BOQ items via: advance.wo_number → sc_work_orders → sc_wo_items.boq_item_id
    // When one WO has multiple BOQ-linked items, split the advance proportionally by item amount.
    // Fallback: advances whose WO has no BOQ-linked items are linked via vendor_id → boq_sc_mapping.
    const advanceActuals = await query(`
      WITH wo_linked AS (
        -- Advances whose WO has at least one BOQ-linked item
        SELECT
          av.id AS advance_id,
          wi.boq_item_id,
          av.paid_amount * (wi.qty * wi.rate) / NULLIF(tot.total_amount, 0) AS share
        FROM tqs_advance_vouchers av
        JOIN sc_work_orders wo
          ON wo.wo_number = av.wo_number AND wo.project_id = $1
        JOIN sc_wo_items wi
          ON wi.wo_id = wo.id AND wi.boq_item_id IS NOT NULL
        JOIN (
          SELECT wo2.wo_number, SUM(wi2.qty * wi2.rate) AS total_amount
          FROM sc_work_orders wo2
          JOIN sc_wo_items wi2 ON wi2.wo_id = wo2.id AND wi2.boq_item_id IS NOT NULL
          WHERE wo2.project_id = $1
          GROUP BY wo2.wo_number
        ) tot ON tot.wo_number = wo.wo_number
        WHERE av.project_id = $1
          AND av.status IN ('issued','partial','recovered')
          AND av.is_deleted = false
          AND av.paid_amount > 0
      ),
      sc_linked AS (
        -- Fallback: advances not covered by wo_linked, linked via vendor_id → boq_sc_mapping
        SELECT
          av.id AS advance_id,
          m.boq_item_id,
          av.paid_amount * m.sc_amount / NULLIF(tot2.total_sc, 0) AS share
        FROM tqs_advance_vouchers av
        JOIN boq_sc_mapping m
          ON m.sc_id = av.vendor_id AND m.project_id = $1 AND m.status != 'cancelled'
        JOIN (
          SELECT m2.sc_id, SUM(m2.sc_amount) AS total_sc
          FROM boq_sc_mapping m2
          WHERE m2.project_id = $1 AND m2.status != 'cancelled'
          GROUP BY m2.sc_id
        ) tot2 ON tot2.sc_id = m.sc_id
        WHERE av.project_id = $1
          AND av.status IN ('issued','partial','recovered')
          AND av.is_deleted = false
          AND av.paid_amount > 0
          AND av.vendor_id IS NOT NULL
          AND av.id NOT IN (SELECT DISTINCT advance_id FROM wo_linked)
      )
      SELECT boq_item_id, 'Sub Con' AS cost_head, SUM(share) AS actual
      FROM (
        SELECT advance_id, boq_item_id, share FROM wo_linked
        UNION ALL
        SELECT advance_id, boq_item_id, share FROM sc_linked
      ) combined
      WHERE boq_item_id IS NOT NULL
      GROUP BY boq_item_id
    `, [project_id]);

    // Material lines rarely map to a single BOQ item (a cement PO can feed
    // dozens of items), so unlike RA/SC actuals this is NOT filtered to
    // boq_item_id IS NOT NULL — lines with a cost_head but no specific BOQ
    // item still come through and get rolled up at the project level below.
    const tqsActuals = await query(`
      SELECT li.boq_item_id, li.cost_head, SUM(li.basic_amount) AS actual
      FROM tqs_bill_line_items li
      JOIN tqs_bills tb ON tb.id = li.bill_id
      WHERE tb.project_id = $1 AND tb.workflow_status = 'paid'
      GROUP BY li.boq_item_id, li.cost_head
    `, [project_id]);

    // Stores petty cash approved purchases — rolled up by cost_head at project level
    const spcActuals = await query(`
      SELECT si.cost_head, NULL::uuid AS boq_item_id, SUM(si.total_amount) AS actual
      FROM stores_petty_cash_items si
      JOIN stores_petty_cash_entries se ON se.id = si.entry_id
      WHERE se.project_id = $1 AND se.status = 'Approved' AND si.cost_head IS NOT NULL
      GROUP BY si.cost_head
    `, [project_id]);

    const byItem = {};
    for (const row of breakdown.rows) {
      if (!byItem[row.boq_item_id]) byItem[row.boq_item_id] = {};
      byItem[row.boq_item_id][row.cost_head] = {
        pct: parseFloat(row.budgeted_pct) || 0,
        amount: parseFloat(row.budgeted_amount) || 0,
        actual: 0,
        advance: 0,
        invoiced: 0,
      };
    }

    const unallocated = {};
    // Cost-head spend with no specific BOQ item to attach to (material POs
    // tagged by cost head only) rolls up here instead of disappearing.
    const projectLevel = {};
    const addActual = (rows, isAdvance = false) => {
      for (const row of rows) {
        const itemId = row.boq_item_id;
        const amt = parseFloat(row.actual) || 0;
        if (!row.cost_head || !BOQ_COST_HEADS.includes(row.cost_head)) {
          if (itemId) unallocated[itemId] = (unallocated[itemId] || 0) + amt;
          continue;
        }
        const bucket = itemId ? (byItem[itemId] ||= {}) : projectLevel;
        if (!bucket[row.cost_head]) bucket[row.cost_head] = { pct: 0, amount: 0, actual: 0, advance: 0, invoiced: 0 };
        if (isAdvance) {
          bucket[row.cost_head].advance += amt;
        } else {
          bucket[row.cost_head].invoiced += amt;
          bucket[row.cost_head].actual += amt;
        }
      }
    };
    addActual(raActuals.rows, false);
    addActual(scActuals.rows, false);
    addActual(tqsActuals.rows, false);
    addActual(spcActuals.rows, false);
    addActual(advanceActuals.rows, true);

    const data = items.rows.map(item => ({
      ...item,
      breakdown: byItem[item.id] || {},
      unallocated_actual: unallocated[item.id] || 0,
    }));

    if (Object.keys(projectLevel).length) {
      data.push({
        id: 'project-level-unlinked',
        chapter_no: null,
        chapter_name: null,
        item_no: '—',
        description: 'Unlinked material / procurement spend — cost-head spend not tied to a specific BOQ item',
        unit: null,
        quantity: null,
        rate: null,
        amount: 0,
        breakdown: projectLevel,
        unallocated_actual: 0,
      });
    }

    res.json({ data, cost_heads: BOQ_COST_HEADS });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /boq-budget/item/:boq_item_id — upsert all 16 entries for one BOQ item
router.put('/item/:boq_item_id', async (req, res) => {
  try {
    const { boq_item_id } = req.params;
    const { entries } = req.body;
    if (!Array.isArray(entries) || !entries.length) {
      return res.status(400).json({ error: 'entries array is required' });
    }

    const itemR = await query(`
      SELECT b.*, p.company_id, ROUND((b.quantity * b.rate)::numeric, 2) AS amount
      FROM boq_items b JOIN projects p ON p.id = b.project_id
      WHERE b.id = $1
    `, [boq_item_id]);
    if (!itemR.rows.length || itemR.rows[0].company_id !== req.user.company_id) {
      return res.status(404).json({ error: 'BOQ item not found' });
    }
    const boqItem = itemR.rows[0];
    if (!userCanAccessProject(req, boqItem.project_id)) {
      return res.status(403).json({ error: 'You do not have access to this project.' });
    }

    const itemAmount = parseFloat(boqItem.amount) || 0;
    let totalAmount = 0;

    const result = await withTransaction(async (client) => {
      const saved = [];
      for (const entry of entries) {
        const cost_head = String(entry.cost_head || '').trim();
        if (!BOQ_COST_HEADS.includes(cost_head)) continue;

        let pct = entry.pct != null ? parseFloat(entry.pct) : null;
        let amount = entry.amount != null ? parseFloat(entry.amount) : null;

        // Derive whichever field wasn't supplied from the BOQ item's total amount
        if (amount == null && pct != null) {
          amount = itemAmount > 0 ? (pct / 100) * itemAmount : 0;
        } else if (pct == null && amount != null) {
          pct = itemAmount > 0 ? (amount / itemAmount) * 100 : 0;
        }
        amount = amount || 0;
        pct = pct || 0;
        totalAmount += amount;

        const r = await client.query(`
          INSERT INTO boq_item_budget_breakdown (boq_item_id, project_id, cost_head, budgeted_pct, budgeted_amount, created_by)
          VALUES ($1,$2,$3,$4,$5,$6)
          ON CONFLICT (boq_item_id, cost_head)
          DO UPDATE SET budgeted_pct = $4, budgeted_amount = $5, updated_at = NOW()
          RETURNING *
        `, [boq_item_id, boqItem.project_id, cost_head, pct, amount, req.user.id]);
        saved.push(r.rows[0]);
      }
      return saved;
    });

    res.json({
      data: result,
      item_amount: itemAmount,
      total_budgeted: Math.round(totalAmount * 100) / 100,
      over_budget: itemAmount > 0 && totalAmount > itemAmount + 0.01,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /boq-budget/:project_id/costhead-summary
// Returns each cost head with its budget (from project_costhead_budgets)
// and actual spend (aggregated from all transaction tables).
router.get('/:project_id/costhead-summary', async (req, res) => {
  try {
    const { project_id } = req.params;
    const proj = await query(`SELECT id FROM projects WHERE id=$1 AND company_id=$2`, [project_id, req.user.company_id]);
    if (!proj.rows.length) return res.status(404).json({ error: 'Project not found' });
    if (!userCanAccessProject(req, project_id)) return res.status(403).json({ error: 'Access denied' });

    // Saved budgets
    const budgets = await query(
      `SELECT cost_head, budget_amount FROM project_costhead_budgets WHERE project_id=$1`,
      [project_id]
    );

    // Actuals: RA bills (certified/paid)
    const raActuals = await query(`
      SELECT rbi.cost_head, SUM(rbi.current_qty * rbi.rate) AS actual
      FROM ra_bill_items rbi JOIN ra_bills rb ON rb.id = rbi.ra_bill_id
      WHERE rb.project_id=$1 AND rb.status IN ('certified','paid')
      GROUP BY rbi.cost_head`, [project_id]);

    // Actuals: SC bills (approved/paid)
    const scActuals = await query(`
      SELECT bi.cost_head, SUM(bi.curr_qty * bi.rate) AS actual
      FROM sc_bill_items bi JOIN sc_bills sb ON sb.id = bi.bill_id
      WHERE sb.project_id=$1 AND sb.status IN ('approved','paid')
      GROUP BY bi.cost_head`, [project_id]);

    // Actuals: TQS material bills (paid)
    const tqsActuals = await query(`
      SELECT li.cost_head, SUM(li.basic_amount) AS actual
      FROM tqs_bill_line_items li JOIN tqs_bills tb ON tb.id = li.bill_id
      WHERE tb.project_id=$1 AND tb.workflow_status='paid' AND li.cost_head IS NOT NULL
      GROUP BY li.cost_head`, [project_id]);

    // Advances
    const advActuals = await query(`
      SELECT 'Sub Con' AS cost_head, SUM(paid_amount) AS actual
      FROM tqs_advance_vouchers
      WHERE project_id=$1 AND status IN ('issued','partial','recovered')
        AND is_deleted=false AND paid_amount>0`, [project_id]);

    // Petty cash
    const spcActuals = await query(`
      SELECT si.cost_head, SUM(si.total_amount) AS actual
      FROM stores_petty_cash_items si
      JOIN stores_petty_cash_entries se ON se.id = si.entry_id
      WHERE se.project_id=$1 AND se.status='Approved' AND si.cost_head IS NOT NULL
      GROUP BY si.cost_head`, [project_id]);

    // Merge actuals by cost head
    const actualMap = {};
    for (const rows of [raActuals.rows, scActuals.rows, tqsActuals.rows, advActuals.rows, spcActuals.rows]) {
      for (const r of rows) {
        if (!r.cost_head) continue;
        actualMap[r.cost_head] = (actualMap[r.cost_head] || 0) + parseFloat(r.actual || 0);
      }
    }

    const budgetMap = {};
    for (const b of budgets.rows) budgetMap[b.cost_head] = parseFloat(b.budget_amount || 0);

    // Build result for all known cost heads + any extra heads with actuals
    const allHeads = new Set([...BOQ_COST_HEADS, ...Object.keys(actualMap), ...Object.keys(budgetMap)]);
    const data = [...allHeads].map(head => ({
      cost_head: head,
      budget: budgetMap[head] || 0,
      actual: actualMap[head] || 0,
      balance: (budgetMap[head] || 0) - (actualMap[head] || 0),
    }));

    // Sort by BOQ_COST_HEADS order, then extras at end
    data.sort((a, b) => {
      const ia = BOQ_COST_HEADS.indexOf(a.cost_head);
      const ib = BOQ_COST_HEADS.indexOf(b.cost_head);
      if (ia === -1 && ib === -1) return a.cost_head.localeCompare(b.cost_head);
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    });

    res.json({ data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /boq-budget/:project_id/costhead-budget
// Upsert budget amount for a single cost head at project level.
router.put('/:project_id/costhead-budget', async (req, res) => {
  try {
    const { project_id } = req.params;
    const { cost_head, budget_amount } = req.body;
    if (!cost_head) return res.status(400).json({ error: 'cost_head is required' });

    const proj = await query(`SELECT id FROM projects WHERE id=$1 AND company_id=$2`, [project_id, req.user.company_id]);
    if (!proj.rows.length) return res.status(404).json({ error: 'Project not found' });
    if (!userCanAccessProject(req, project_id)) return res.status(403).json({ error: 'Access denied' });

    const r = await query(`
      INSERT INTO project_costhead_budgets (project_id, cost_head, budget_amount, created_by)
      VALUES ($1,$2,$3,$4)
      ON CONFLICT (project_id, cost_head)
      DO UPDATE SET budget_amount=$3, updated_at=NOW()
      RETURNING *`,
      [project_id, cost_head, parseFloat(budget_amount) || 0, req.user.id]
    );
    res.json({ data: r.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /boq-budget/:project_id/chapter-budget
// Set a total budget for a whole chapter at once.
// Distributes the amount proportionally across all items in the chapter
// by their BOQ value, saving to the specified cost_head (default: 'Sub Con').
router.post('/:project_id/chapter-budget', async (req, res) => {
  try {
    const { project_id } = req.params;
    const { chapter_name, chapter_no, total_budget, cost_head = 'Sub Con' } = req.body;

    if (!BOQ_COST_HEADS.includes(cost_head)) {
      return res.status(400).json({ error: `Invalid cost_head. Must be one of: ${BOQ_COST_HEADS.join(', ')}` });
    }
    if (total_budget == null || isNaN(parseFloat(total_budget))) {
      return res.status(400).json({ error: 'total_budget is required' });
    }

    const proj = await query(`SELECT id FROM projects WHERE id=$1 AND company_id=$2`, [project_id, req.user.company_id]);
    if (!proj.rows.length) return res.status(404).json({ error: 'Project not found' });
    if (!userCanAccessProject(req, project_id)) {
      return res.status(403).json({ error: 'You do not have access to this project.' });
    }

    // Fetch all items in this chapter
    let itemsQ;
    if (chapter_name) {
      itemsQ = await query(
        `SELECT id, ROUND((quantity*rate)::numeric,2) AS amount
         FROM boq_items WHERE project_id=$1 AND is_active=true
         AND LOWER(TRIM(chapter_name)) = LOWER(TRIM($2))`,
        [project_id, chapter_name]
      );
    } else {
      itemsQ = await query(
        `SELECT id, ROUND((quantity*rate)::numeric,2) AS amount
         FROM boq_items WHERE project_id=$1 AND is_active=true AND chapter_no=$2`,
        [project_id, chapter_no]
      );
    }

    const chapterItems = itemsQ.rows;
    if (!chapterItems.length) return res.status(404).json({ error: 'No items found for this chapter' });

    const chapterTotal = chapterItems.reduce((s, i) => s + parseFloat(i.amount || 0), 0);
    const budget = parseFloat(total_budget);

    const saved = await withTransaction(async (client) => {
      const results = [];
      for (const item of chapterItems) {
        const itemAmt = parseFloat(item.amount || 0);
        // Proportional share; if chapterTotal is 0 split evenly
        const share = chapterTotal > 0
          ? (itemAmt / chapterTotal) * budget
          : budget / chapterItems.length;
        const pct = itemAmt > 0 ? (share / itemAmt) * 100 : 0;

        const r = await client.query(`
          INSERT INTO boq_item_budget_breakdown
            (boq_item_id, project_id, cost_head, budgeted_pct, budgeted_amount, created_by)
          VALUES ($1,$2,$3,$4,$5,$6)
          ON CONFLICT (boq_item_id, cost_head)
          DO UPDATE SET budgeted_pct=$4, budgeted_amount=$5, updated_at=NOW()
          RETURNING *`,
          [item.id, project_id, cost_head, pct, share, req.user.id]
        );
        results.push(r.rows[0]);
      }
      return results;
    });

    res.json({ data: saved, items_updated: saved.length, total_budget: budget, cost_head });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
