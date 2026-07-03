const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { query, withTransaction } = require('../config/database');
const { loadProjectScope, userCanAccessProject } = require('../middleware/projectScope');
const { runSchemaInit } = require('../utils/schemaInit');
const { BOQ_COST_HEADS, PROFIT_BASE_HEADS, PROFIT_PCT, CONTINGENCY_HEAD } = require('../constants/boqCostHeads');

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
      boq_amount NUMERIC(16,2) DEFAULT 0,
      created_by UUID,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (project_id, cost_head)
    )
  `);
  // Add boq_amount to existing tables (idempotent)
  await query(`ALTER TABLE project_costhead_budgets ADD COLUMN IF NOT EXISTS boq_amount NUMERIC(16,2) DEFAULT 0`).catch(() => {});
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
      SELECT swi.boq_item_id, COALESCE(bi.cost_head, 'Sub Con') AS cost_head, SUM(bi.curr_qty * bi.rate) AS actual
      FROM sc_bill_items bi
      JOIN sc_bills sb ON sb.id = bi.bill_id
      JOIN sc_wo_items swi ON swi.id = bi.wo_item_id
      WHERE sb.project_id = $1 AND sb.status IN ('approved','paid') AND swi.boq_item_id IS NOT NULL
      GROUP BY swi.boq_item_id, COALESCE(bi.cost_head, 'Sub Con')
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
    // Chapter inheritance: a bill line tagged with its own boq_chapter (set
    // directly on the line, e.g. for direct/no-PO bills) wins; otherwise a bill
    // line linked to a PO line (po_item_id) takes that PO line's chapter;
    // otherwise, if the bill's header PO has all its items under ONE chapter,
    // that chapter is used. Keeps cost-head-tagged invoices inside the chapter
    // chosen on the PO/line instead of pro-rating them across the whole project.
    const tqsActuals = await query(`
      SELECT li.boq_item_id, li.cost_head,
             COALESCE(li.boq_chapter, pi.boq_chapter, po_single.chapter) AS boq_chapter,
             SUM(li.basic_amount) AS actual
      FROM tqs_bill_line_items li
      JOIN tqs_bills tb ON tb.id = li.bill_id
      LEFT JOIN po_items pi ON pi.id = li.po_item_id
      LEFT JOIN (
        SELECT pi2.po_id, MIN(pi2.boq_chapter) AS chapter
        FROM po_items pi2
        WHERE pi2.boq_chapter IS NOT NULL
        GROUP BY pi2.po_id
        HAVING COUNT(DISTINCT pi2.boq_chapter) = 1
      ) po_single ON po_single.po_id = tb.po_id
      WHERE tb.project_id = $1 AND tb.is_deleted = FALSE
      GROUP BY li.boq_item_id, li.cost_head, COALESCE(li.boq_chapter, pi.boq_chapter, po_single.chapter)
    `, [project_id]);

    // Stores petty cash approved purchases — rolled up by cost_head at project level
    const spcActuals = await query(`
      SELECT si.cost_head, NULL::uuid AS boq_item_id, SUM(si.total_amount) AS actual
      FROM stores_petty_cash_items si
      JOIN stores_petty_cash_entries se ON se.id = si.entry_id
      WHERE se.project_id = $1 AND se.status = 'Approved' AND si.cost_head IS NOT NULL
      GROUP BY si.cost_head
    `, [project_id]);

    // Purchase Order spend — only the portion actually INVOICED against each PO
    // line item counts as "spent" (not the full committed order value). Invoiced
    // amount comes from TQS bill line items linked back via po_item_id; the
    // boq_item_id/cost_head tag is taken from the PO item itself (set at PO entry).
    // li.cost_head IS NULL guards against double-counting: bills whose line items
    // carry their own cost_head tag are already counted via tqsActuals above —
    // this only picks up the fallback case where the bill line wasn't tagged.
    const poActuals = await query(`
      SELECT pi.boq_item_id, pi.boq_chapter, pi.cost_head, SUM(li.basic_amount) AS actual
      FROM po_items pi
      JOIN purchase_orders po ON po.id = pi.po_id
      JOIN tqs_bill_line_items li ON li.po_item_id = pi.id
      JOIN tqs_bills tb ON tb.id = li.bill_id
      WHERE po.project_id = $1
        AND po.status NOT IN ('rejected', 'cancelled')
        AND pi.cost_head IS NOT NULL
        AND li.cost_head IS NULL
        AND tb.is_deleted = FALSE
        AND tb.workflow_status NOT IN ('rejected')
      GROUP BY pi.boq_item_id, pi.boq_chapter, pi.cost_head
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
    addActual(spcActuals.rows, false);
    addActual(advanceActuals.rows, true);

    // ── Project-level sources with no BOQ-item link ──────────────────────────
    // Mirrored 1:1 from the Budget Control (costhead-summary) aggregation so
    // both screens reconcile to the same Spent total. Each lands in the
    // project-level pool and gets pro-rated across items like other untagged
    // spend.
    // 1. Advance vouchers that can't be linked to any WO/BOQ item (the linkable
    //    ones are already in advanceActuals above).
    const unlinkableAdv = await query(`
      SELECT SUM(av.paid_amount) AS actual
      FROM tqs_advance_vouchers av
      WHERE av.project_id = $1 AND av.is_deleted = false
        AND av.status IN ('issued','partial','recovered') AND av.paid_amount > 0
        AND NOT EXISTS (
          SELECT 1 FROM sc_work_orders wo
          JOIN sc_wo_items wi ON wi.wo_id = wo.id AND wi.boq_item_id IS NOT NULL
          WHERE wo.wo_number = av.wo_number AND wo.project_id = $1
        )
        AND NOT EXISTS (
          SELECT 1 FROM boq_sc_mapping m
          WHERE m.sc_id = av.vendor_id AND m.project_id = $1 AND m.status != 'cancelled'
        )
    `, [project_id]);

    // 2. Subcontractor payments/advances recorded outside the WO-linked flow
    const scPayments = await query(
      `SELECT SUM(amount) AS actual FROM sc_payments WHERE project_id = $1`, [project_id]);
    const scAdvances = await query(
      `SELECT SUM(amount) AS actual FROM sc_advances WHERE project_id = $1 AND status NOT IN ('cancelled')`, [project_id]);

    // Stores Petty Cash contractor advances — same wo_number → BOQ-item routing
    // as tqs_advance_vouchers above (advanceActuals). Previously this summed
    // ALL such advances straight into the project-level "unlinked" bucket with
    // no attempt to trace them through the WO, so linking a WO's items to BOQ
    // never moved these advances out of "Unlinked Spend".
    let storePCAdvLinked = { rows: [] };
    let storePCAdvUnlinkable = { rows: [{ actual: 0 }] };
    try {
      storePCAdvLinked = await query(`
        WITH wo_linked AS (
          SELECT av.id AS advance_id, wi.boq_item_id,
                 av.amount * (wi.qty * wi.rate) / NULLIF(tot.total_amount, 0) AS share
          FROM stores_pc_sc_advances av
          JOIN sc_work_orders wo ON wo.wo_number = av.wo_number AND wo.project_id = $1
          JOIN sc_wo_items wi ON wi.wo_id = wo.id AND wi.boq_item_id IS NOT NULL
          JOIN (
            SELECT wo2.wo_number, SUM(wi2.qty * wi2.rate) AS total_amount
            FROM sc_work_orders wo2
            JOIN sc_wo_items wi2 ON wi2.wo_id = wo2.id AND wi2.boq_item_id IS NOT NULL
            WHERE wo2.project_id = $1
            GROUP BY wo2.wo_number
          ) tot ON tot.wo_number = wo.wo_number
          WHERE av.project_id = $1 AND av.status != 'cancelled'
        ),
        sc_linked AS (
          SELECT av.id AS advance_id, m.boq_item_id,
                 av.amount * m.sc_amount / NULLIF(tot2.total_sc, 0) AS share
          FROM stores_pc_sc_advances av
          JOIN boq_sc_mapping m ON m.sc_id = av.vendor_id AND m.project_id = $1 AND m.status != 'cancelled'
          JOIN (
            SELECT m2.sc_id, SUM(m2.sc_amount) AS total_sc
            FROM boq_sc_mapping m2 WHERE m2.project_id = $1 AND m2.status != 'cancelled'
            GROUP BY m2.sc_id
          ) tot2 ON tot2.sc_id = m.sc_id
          WHERE av.project_id = $1 AND av.status != 'cancelled' AND av.vendor_id IS NOT NULL
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
      storePCAdvUnlinkable = await query(`
        SELECT SUM(av.amount) AS actual
        FROM stores_pc_sc_advances av
        WHERE av.project_id = $1 AND av.status != 'cancelled'
          AND NOT EXISTS (
            SELECT 1 FROM sc_work_orders wo
            JOIN sc_wo_items wi ON wi.wo_id = wo.id AND wi.boq_item_id IS NOT NULL
            WHERE wo.wo_number = av.wo_number AND wo.project_id = $1
          )
          AND NOT EXISTS (
            SELECT 1 FROM boq_sc_mapping m
            WHERE m.sc_id = av.vendor_id AND m.project_id = $1 AND m.status != 'cancelled'
          )
      `, [project_id]);
    } catch (_) {}

    // 3. SC bill lines whose WO item has no BOQ link (scActuals above requires one)
    const scUnlinked = await query(`
      SELECT SUM(bi.curr_qty * bi.rate) AS actual
      FROM sc_bill_items bi
      JOIN sc_bills sb ON sb.id = bi.bill_id
      LEFT JOIN sc_wo_items swi ON swi.id = bi.wo_item_id
      WHERE sb.project_id = $1 AND sb.status IN ('approved','paid')
        AND (swi.id IS NULL OR swi.boq_item_id IS NULL)
    `, [project_id]);

    // 4. Petty cash whose item lines carry no cost head (entry total − tagged items)
    const spcRemainder = await query(`
      SELECT GREATEST(
        COALESCE((SELECT SUM(amount) FROM stores_petty_cash_entries WHERE project_id = $1 AND status = 'Approved'), 0)
        - COALESCE((SELECT SUM(si.total_amount) FROM stores_petty_cash_items si
                    JOIN stores_petty_cash_entries se ON se.id = si.entry_id
                    WHERE se.project_id = $1 AND se.status = 'Approved' AND si.cost_head IS NOT NULL), 0)
      , 0) AS actual
    `, [project_id]);

    // These sources have no BOQ/PO/chapter linkage at all, so they are NOT
    // pro-rated into items — they go straight to the dedicated "unlinked" row
    // (merged into remainderLevel below). This keeps per-item / per-chapter
    // Spent strictly following the PO cost-head + chapter mapping, while the
    // grand total still reconciles with Budget Control.
    const projectOnly = {};
    const bumpProjectOnly = (head, field, value) => {
      const amt = parseFloat(value) || 0;
      if (amt <= 0) return;
      const cell = (projectOnly[head] ||= { pct: 0, amount: 0, actual: 0, advance: 0, invoiced: 0 });
      cell[field] += amt;
      if (field === 'invoiced') cell.actual += amt;
    };
    bumpProjectOnly('Sub Con', 'advance', unlinkableAdv.rows[0]?.actual);
    bumpProjectOnly('Sub Con', 'advance', scAdvances.rows[0]?.actual);
    bumpProjectOnly('Sub Con', 'advance', storePCAdvUnlinkable.rows[0]?.actual);
    bumpProjectOnly('Sub Con', 'invoiced', scPayments.rows[0]?.actual);
    bumpProjectOnly('Sub Con', 'invoiced', scUnlinked.rows[0]?.actual);
    // 'Petty Cash' is not one of the 16 canonical heads — it's appended to the
    // cost_heads list in the response below so the frontend renders it.
    bumpProjectOnly('Petty Cash', 'invoiced', spcRemainder.rows[0]?.actual);
    // The portion of stores_pc_sc_advances that DID resolve to a BOQ item via
    // the WO (or boq_sc_mapping fallback) attaches directly, same as any other
    // advance — not lumped into the unlinked bucket.
    addActual(storePCAdvLinked.rows, true);

    // TQS-bill and PO spend — NO pro-rata anywhere. Every rupee lands exactly
    // where its PO/bill was tagged: a specific BOQ item, or (if only the PO's
    // chapter is known) a dedicated "chapter unlinked" row that keeps the
    // money inside the right chapter's total without guessing which specific
    // item it belongs to. Untagged-to-anything spend goes to the project-level
    // unlinked row. Nothing is estimated or distributed by budget/BOQ share.
    const chapterUnlinked = {}; // chapterName -> { costHead -> amount }
    const routeRow = (row) => {
      const amt = parseFloat(row.actual) || 0;
      if (!row.cost_head || !BOQ_COST_HEADS.includes(row.cost_head)) {
        if (row.boq_item_id) unallocated[row.boq_item_id] = (unallocated[row.boq_item_id] || 0) + amt;
        return;
      }
      if (row.boq_item_id) {
        addActual([row], false);
      } else if (row.boq_chapter) {
        const pool = (chapterUnlinked[row.boq_chapter] ||= {});
        pool[row.cost_head] = (pool[row.cost_head] || 0) + amt;
      } else {
        addActual([row], false);
      }
    };
    tqsActuals.rows.forEach(routeRow);
    poActuals.rows.forEach(routeRow);

    // Merge the never-distributed sources (advances, petty-cash remainder, SC
    // payments — from projectOnly above) with the truly-untagged TQS/PO spend
    // (from projectLevel) into one project-level unlinked bucket.
    const remainderLevel = {};
    for (const [head, cell] of Object.entries(projectLevel)) {
      const tgt = (remainderLevel[head] ||= { pct: 0, amount: 0, actual: 0, advance: 0, invoiced: 0 });
      tgt.advance  += cell.advance;
      tgt.invoiced += cell.invoiced;
      tgt.actual   += cell.actual;
    }
    for (const [head, cell] of Object.entries(projectOnly)) {
      const tgt = (remainderLevel[head] ||= { pct: 0, amount: 0, actual: 0, advance: 0, invoiced: 0 });
      tgt.advance  += cell.advance;
      tgt.invoiced += cell.invoiced;
      tgt.actual   += cell.actual;
    }

    const data = items.rows.map(item => ({
      ...item,
      breakdown: byItem[item.id] || {},
      unallocated_actual: unallocated[item.id] || 0,
    }));

    // One synthetic row per chapter that has PO/bill spend tagged to the
    // chapter but not to any specific item within it. Groups naturally under
    // that chapter (same chapter_name/chapter_no as its real items) via the
    // frontend's existing chapter-grouping — no distribution math involved.
    for (const [chapName, pool] of Object.entries(chapterUnlinked)) {
      const chapItems = items.rows.filter(r =>
        (r.chapter_name && r.chapter_name === chapName) || String(r.chapter_no) === chapName);
      const breakdown = {};
      for (const [head, amt] of Object.entries(pool)) {
        breakdown[head] = { pct: 0, amount: 0, actual: amt, advance: 0, invoiced: amt };
      }
      data.push({
        id: `chapter-unlinked-${chapName}`,
        chapter_no: chapItems[0]?.chapter_no ?? null,
        chapter_name: chapItems.length ? chapItems[0].chapter_name : chapName,
        item_no: '—',
        description: `Unlinked chapter spend — tagged to "${chapName}" on the PO but not to a specific BOQ item`,
        unit: null,
        quantity: null,
        rate: null,
        amount: 0,
        breakdown,
        unallocated_actual: 0,
      });
    }

    if (Object.keys(remainderLevel).length) {
      data.push({
        id: 'project-level-unlinked',
        chapter_no: null,
        chapter_name: null,
        item_no: '—',
        description: 'Unlinked project-level spend — advances, petty cash and cost-head spend not tied to any BOQ item or chapter',
        unit: null,
        quantity: null,
        rate: null,
        amount: 0,
        breakdown: remainderLevel,
        unallocated_actual: 0,
      });
    }

    // Non-canonical heads that received project-level spend (e.g. 'Petty Cash')
    // must appear in cost_heads or the frontend won't render/count them.
    const extraHeads = [...new Set([...Object.keys(projectLevel), ...Object.keys(remainderLevel)])]
      .filter(h => !BOQ_COST_HEADS.includes(h));
    res.json({ data, cost_heads: [...BOQ_COST_HEADS, ...extraHeads] });
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

// PUT /boq-budget/item/:boq_item_id/total — set total budget for a single item
// Distributes proportionally across existing cost-head entries; if none, uses "Sub Con".
router.put('/item/:boq_item_id/total', async (req, res) => {
  try {
    const { boq_item_id } = req.params;
    const total = parseFloat(req.body.total);
    if (isNaN(total) || total < 0) return res.status(400).json({ error: 'total must be a non-negative number' });

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

    const existingR = await query(
      `SELECT cost_head, budgeted_amount FROM boq_item_budget_breakdown WHERE boq_item_id = $1`,
      [boq_item_id]
    );
    const existing = existingR.rows;
    const existingTotal = existing.reduce((s, r) => s + parseFloat(r.budgeted_amount || 0), 0);

    const result = await withTransaction(async (client) => {
      const saved = [];
      if (!existing.length || existingTotal === 0) {
        // No breakdown yet — store full amount under "Sub Con"
        const pct = itemAmount > 0 ? (total / itemAmount) * 100 : 0;
        const r = await client.query(`
          INSERT INTO boq_item_budget_breakdown (boq_item_id, project_id, cost_head, budgeted_pct, budgeted_amount, created_by)
          VALUES ($1,$2,'Sub Con',$3,$4,$5)
          ON CONFLICT (boq_item_id, cost_head)
          DO UPDATE SET budgeted_pct=$3, budgeted_amount=$4, updated_at=NOW()
          RETURNING *
        `, [boq_item_id, boqItem.project_id, pct, total, req.user.id]);
        saved.push(r.rows[0]);
      } else {
        // Scale each existing cost-head proportionally
        const scaleFactor = total / existingTotal;
        for (const row of existing) {
          const newAmount = Math.round(parseFloat(row.budgeted_amount) * scaleFactor * 100) / 100;
          const pct = itemAmount > 0 ? (newAmount / itemAmount) * 100 : 0;
          const r = await client.query(`
            UPDATE boq_item_budget_breakdown
            SET budgeted_amount=$1, budgeted_pct=$2, updated_at=NOW()
            WHERE boq_item_id=$3 AND cost_head=$4
            RETURNING *
          `, [newAmount, pct, boq_item_id, row.cost_head]);
          if (r.rows[0]) saved.push(r.rows[0]);
        }
      }
      return saved;
    });

    res.json({ data: result, total_budgeted: total });
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

    // Saved budgets and manually-set BOQ allocations
    const budgets = await query(
      `SELECT cost_head, budget_amount, COALESCE(boq_amount, 0) AS boq_amount FROM project_costhead_budgets WHERE project_id=$1`,
      [project_id]
    );

    // ── "Bills Received" vs "Bills Paid" ────────────────────────────────────
    // Received = value of bills logged into the system (certified/approved,
    // or for TQS bills at any workflow stage — receiving a bill happens before
    // it's reviewed/approved). Paid = cash actually disbursed. Advances and
    // petty cash never had a "bill" to receive — they're cash paid out ahead
    // of/without one — so they only ever count under Paid, never Received.
    //
    // SC "Paid" uses sc_bills.paid_amount (the stored running total kept in
    // sync whenever a payment is recorded — see sc.routes.js) rather than
    // summing sc_payments separately, so a paid bill's value is never counted
    // twice (previously scActuals + scPayActuals both counted the same money).

    // Received: RA bills (certified/paid)
    const raActuals = await query(`
      SELECT rbi.cost_head, SUM(rbi.current_qty * rbi.rate) AS actual
      FROM ra_bill_items rbi JOIN ra_bills rb ON rb.id = rbi.ra_bill_id
      WHERE rb.project_id=$1 AND rb.status IN ('certified','paid')
      GROUP BY rbi.cost_head`, [project_id]);
    // Paid: RA bills fully paid only
    const raPaid = await query(`
      SELECT rbi.cost_head, SUM(rbi.current_qty * rbi.rate) AS actual
      FROM ra_bill_items rbi JOIN ra_bills rb ON rb.id = rbi.ra_bill_id
      WHERE rb.project_id=$1 AND rb.status = 'paid'
      GROUP BY rbi.cost_head`, [project_id]);

    // Received: SC bills — same statuses and cost-head attribution as the BOQ
    // item view (untagged lines default to "Sub Con") so both screens agree.
    const scActuals = await query(`
      SELECT COALESCE(bi.cost_head, 'Sub Con') AS cost_head, SUM(bi.curr_qty * bi.rate) AS actual
      FROM sc_bill_items bi JOIN sc_bills sb ON sb.id = bi.bill_id
      WHERE sb.project_id=$1 AND sb.status IN ('approved','paid')
      GROUP BY COALESCE(bi.cost_head, 'Sub Con')`, [project_id]);
    // Paid: actual cash paid against SC bills (mapped to "Sub Con" — SC bill
    // items are essentially all Sub Con, and paid_amount isn't split by head)
    const scPaid = await query(`
      SELECT 'Sub Con' AS cost_head, SUM(paid_amount) AS actual
      FROM sc_bills WHERE project_id=$1 AND paid_amount > 0`, [project_id]);

    // Received: TQS material bills — every logged bill, any workflow stage
    const tqsActuals = await query(`
      SELECT li.cost_head, SUM(li.basic_amount) AS actual
      FROM tqs_bill_line_items li JOIN tqs_bills tb ON tb.id = li.bill_id
      WHERE tb.project_id=$1 AND tb.is_deleted = FALSE AND li.cost_head IS NOT NULL
      GROUP BY li.cost_head`, [project_id]);
    // Paid: TQS bills marked fully paid only
    const tqsPaid = await query(`
      SELECT li.cost_head, SUM(li.basic_amount) AS actual
      FROM tqs_bill_line_items li JOIN tqs_bills tb ON tb.id = li.bill_id
      WHERE tb.project_id=$1 AND tb.is_deleted = FALSE AND li.cost_head IS NOT NULL
        AND tb.workflow_status = 'paid'
      GROUP BY li.cost_head`, [project_id]);

    // Paid only: SC advances (dedicated SC module) — cash out, no bill yet
    const advActuals = await query(`
      SELECT 'Sub Con' AS cost_head, SUM(amount) AS actual
      FROM sc_advances
      WHERE project_id=$1 AND status NOT IN ('cancelled')`, [project_id]);

    // Paid only: subcontractor advances via the Advance Tracker (TQS advance
    // vouchers). Only amounts actually paid out (paid_amount), excluding
    // pending/cancelled vouchers.
    const advTrackerActuals = await query(`
      SELECT 'Sub Con' AS cost_head, SUM(paid_amount) AS actual
      FROM tqs_advance_vouchers
      WHERE project_id=$1 AND is_deleted=false
        AND status IN ('issued','partial','recovered') AND paid_amount > 0`, [project_id]);

    // Paid only: petty cash — on Budget Control, the WHOLE approved petty-cash
    // total always shows under the single 'Petty Cash' row, regardless of any
    // cost head tagged on individual items. (The BOQ Item Breakdown screen still
    // traces tagged items to their specific cost head/BOQ item for that view —
    // this is Budget Control-specific, per explicit request to keep Petty Cash
    // as one bucket here.)
    const spcActuals = await query(`
      SELECT 'Petty Cash' AS cost_head, COALESCE(SUM(amount), 0) AS actual
      FROM stores_petty_cash_entries
      WHERE project_id=$1 AND status='Approved'`, [project_id]);
    const spcRemainder = { rows: [] };

    // Received: PO-tagged spend where the bill line itself wasn't cost-headed —
    // same fallback (and same dedup guard) as the BOQ item view.
    const poFallbackActuals = await query(`
      SELECT pi.cost_head, SUM(li.basic_amount) AS actual
      FROM po_items pi
      JOIN purchase_orders po ON po.id = pi.po_id
      JOIN tqs_bill_line_items li ON li.po_item_id = pi.id
      JOIN tqs_bills tb ON tb.id = li.bill_id
      WHERE po.project_id = $1
        AND po.status NOT IN ('rejected', 'cancelled')
        AND pi.cost_head IS NOT NULL
        AND li.cost_head IS NULL
        AND tb.is_deleted = FALSE
        AND tb.workflow_status NOT IN ('rejected')
      GROUP BY pi.cost_head`, [project_id]);
    // Paid: same PO fallback, restricted to bills marked fully paid
    const poFallbackPaid = await query(`
      SELECT pi.cost_head, SUM(li.basic_amount) AS actual
      FROM po_items pi
      JOIN purchase_orders po ON po.id = pi.po_id
      JOIN tqs_bill_line_items li ON li.po_item_id = pi.id
      JOIN tqs_bills tb ON tb.id = li.bill_id
      WHERE po.project_id = $1
        AND po.status NOT IN ('rejected', 'cancelled')
        AND pi.cost_head IS NOT NULL
        AND li.cost_head IS NULL
        AND tb.is_deleted = FALSE
        AND tb.workflow_status = 'paid'
      GROUP BY pi.cost_head`, [project_id]);

    // Paid only: contractor advances given through the Stores Petty Cash module
    let storePCAdvActuals = { rows: [] };
    try {
      storePCAdvActuals = await query(`
        SELECT 'Sub Con' AS cost_head, SUM(amount) AS actual
        FROM stores_pc_sc_advances
        WHERE project_id=$1 AND status != 'cancelled'`, [project_id]);
    } catch (_) {}

    // "Received" = value of bills logged (RA/SC/TQS/PO), any approval stage.
    const receivedMap = {};
    for (const rows of [raActuals.rows, scActuals.rows, tqsActuals.rows, poFallbackActuals.rows]) {
      for (const r of rows) {
        if (!r.cost_head) continue;
        receivedMap[r.cost_head] = (receivedMap[r.cost_head] || 0) + parseFloat(r.actual || 0);
      }
    }
    // "Paid" = cash actually disbursed: the paid portion of those same bills,
    // plus advances/petty cash (cash out with no corresponding bill received).
    const paidMap = {};
    for (const rows of [raPaid.rows, scPaid.rows, tqsPaid.rows, poFallbackPaid.rows, advActuals.rows, advTrackerActuals.rows, spcActuals.rows, spcRemainder.rows, storePCAdvActuals.rows]) {
      for (const r of rows) {
        if (!r.cost_head) continue;
        paidMap[r.cost_head] = (paidMap[r.cost_head] || 0) + parseFloat(r.actual || 0);
      }
    }
    // actualMap = total cost incurred (received bills + advances/petty cash that
    // have no bill of their own) — drives Profit/Contingency derivation below,
    // same total as before this Received/Paid split was added. Excludes
    // raPaid/scPaid/tqsPaid/poFallbackPaid since those are already inside
    // receivedMap (they're the paid subset of the same bills, not extra money).
    const actualMap = { ...receivedMap };
    for (const rows of [advActuals.rows, advTrackerActuals.rows, spcActuals.rows, spcRemainder.rows, storePCAdvActuals.rows]) {
      for (const r of rows) {
        if (!r.cost_head) continue;
        actualMap[r.cost_head] = (actualMap[r.cost_head] || 0) + parseFloat(r.actual || 0);
      }
    }

    const budgetMap = {};
    const boqManualMap = {};
    for (const b of budgets.rows) {
      budgetMap[b.cost_head] = parseFloat(b.budget_amount || 0);
      boqManualMap[b.cost_head] = parseFloat(b.boq_amount || 0);
    }

    // Total BOQ value (contract value) — used for Contingency calculation
    const boqTotalR = await query(
      `SELECT COALESCE(SUM(quantity * rate), 0) AS total FROM boq_items WHERE project_id=$1 AND is_active=true`,
      [project_id]
    );
    const totalBoqValue = parseFloat(boqTotalR.rows[0]?.total || 0);

    // Per-cost-head BOQ value from the BOQ items breakdown tab
    const boqBreakdownR = await query(
      `SELECT cost_head, COALESCE(SUM(budgeted_amount), 0) AS boq_value
       FROM boq_item_budget_breakdown WHERE project_id=$1 GROUP BY cost_head`,
      [project_id]
    );
    const boqValueMap = {};
    for (const r of boqBreakdownR.rows) boqValueMap[r.cost_head] = parseFloat(r.boq_value || 0);

    // Profit (head 19) = 10% of sum of heads 1-18 — derived, not stored
    const baseActual = PROFIT_BASE_HEADS.reduce((s, h) => s + (actualMap[h] || 0), 0);
    actualMap['Profit'] = baseActual * PROFIT_PCT;
    const baseBudget = PROFIT_BASE_HEADS.reduce((s, h) => s + (budgetMap[h] || 0), 0);
    if (baseBudget > 0) budgetMap['Profit'] = baseBudget * PROFIT_PCT;
    // Same derivation for the Received/Paid columns, so Profit/Contingency
    // show a sensible split there too instead of just under the combined total.
    const baseReceived = PROFIT_BASE_HEADS.reduce((s, h) => s + (receivedMap[h] || 0), 0);
    receivedMap['Profit'] = baseReceived * PROFIT_PCT;
    const basePaid = PROFIT_BASE_HEADS.reduce((s, h) => s + (paidMap[h] || 0), 0);
    paidMap['Profit'] = basePaid * PROFIT_PCT;

    // Contingency (head 20) = Total BOQ Value − sum(heads 1-18) − Profit
    // Represents the emergency reserve within the contract value.
    actualMap[CONTINGENCY_HEAD] = totalBoqValue - baseActual - actualMap['Profit'];
    receivedMap[CONTINGENCY_HEAD] = totalBoqValue - baseReceived - receivedMap['Profit'];
    paidMap[CONTINGENCY_HEAD] = totalBoqValue - basePaid - paidMap['Profit'];
    if (baseBudget > 0) {
      budgetMap[CONTINGENCY_HEAD] = totalBoqValue - baseBudget - budgetMap['Profit'];
    }

    // Months elapsed since first paid transaction — used for monthly run-rate (EAC)
    const firstTxnR = await query(`
      SELECT MIN(txn_date)::date AS first_date FROM (
        SELECT MIN(bill_date) AS txn_date FROM ra_bills WHERE project_id=$1 AND status IN ('certified','paid') AND bill_date IS NOT NULL
        UNION ALL
        SELECT MIN(inv_date)  AS txn_date FROM tqs_bills WHERE project_id=$1 AND is_deleted = FALSE AND inv_date IS NOT NULL
        UNION ALL
        SELECT MIN(entry_date) AS txn_date FROM stores_petty_cash_entries WHERE project_id=$1 AND status='Approved' AND entry_date IS NOT NULL
      ) d WHERE txn_date IS NOT NULL
    `, [project_id]);
    const firstDate = firstTxnR.rows[0]?.first_date;
    const monthsElapsed = firstDate
      ? Math.max(1, Math.round((Date.now() - new Date(firstDate).getTime()) / (30 * 24 * 3600 * 1000)))
      : 1;

    // Build result for all known cost heads + any extra heads with actuals
    const allHeads = new Set([...BOQ_COST_HEADS, ...Object.keys(actualMap), ...Object.keys(paidMap), ...Object.keys(budgetMap)]);
    const DERIVED_HEADS = new Set(['Profit', CONTINGENCY_HEAD]);
    const data = [...allHeads].map(head => ({
      cost_head: head,
      boq_value: boqValueMap[head] > 0 ? boqValueMap[head]
               : boqManualMap[head] > 0 ? boqManualMap[head]
               : (budgetMap[head] || 0),
      boq_source: boqValueMap[head] > 0 ? 'breakdown'
                : boqManualMap[head] > 0 ? 'manual'
                : budgetMap[head] > 0 ? 'budget'
                : 'none',
      budget: budgetMap[head] || 0,
      actual: actualMap[head] || 0,
      received: receivedMap[head] || 0,
      paid: paidMap[head] || 0,
      balance: (budgetMap[head] || 0) - (actualMap[head] || 0),
      derived: DERIVED_HEADS.has(head),
      monthly_avg: parseFloat(((actualMap[head] || 0) / monthsElapsed).toFixed(2)),
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

    res.json({ data, total_boq_value: totalBoqValue, months_elapsed: monthsElapsed });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /boq-budget/:project_id/costhead-drilldown?cost_head=Sub+Con
// Returns individual transactions that make up a cost head's actual expenditure.
router.get('/:project_id/costhead-drilldown', async (req, res) => {
  try {
    const { project_id } = req.params;
    const { cost_head, boq_item_id, chapter, unlinked } = req.query;
    if (!cost_head) return res.status(400).json({ error: 'cost_head is required' });
    const proj = await query(`SELECT id FROM projects WHERE id=$1 AND company_id=$2`, [project_id, req.user.company_id]);
    if (!proj.rows.length) return res.status(404).json({ error: 'Project not found' });
    if (!userCanAccessProject(req, project_id)) return res.status(403).json({ error: 'Access denied' });

    let rows = [];

    if (cost_head === 'Sub Con') {
      // SC bills — aggregate by bill using line items (same formula as costhead-summary)
      // Use LEFT JOIN so bills without a matching sc_subcontractors row still appear
      const scBills = await query(`
        SELECT sb.bill_number AS reference, sb.bill_date AS date,
               COALESCE(sc.name, sb.bill_number, 'Subcontractor') AS description,
               SUM(bi.curr_qty * bi.rate) AS amount, 'SC Bill' AS source
        FROM sc_bill_items bi
        JOIN sc_bills sb ON sb.id = bi.bill_id
        LEFT JOIN sc_subcontractors sc ON sc.id = sb.sc_id
        WHERE sb.project_id=$1 AND sb.status NOT IN ('draft','rejected','queried')
        GROUP BY sb.id, sb.bill_number, sb.bill_date, sc.name
        ORDER BY sb.bill_date`, [project_id]);
      rows.push(...scBills.rows);

      // SC payments — LEFT JOIN so payment rows aren't dropped by missing subcontractor
      const scPay = await query(`
        SELECT sp.reference_no AS reference, sp.payment_date AS date,
               COALESCE(sc.name, sb.bill_number, 'Payment') AS description,
               sp.amount, 'SC Payment' AS source
        FROM sc_payments sp
        LEFT JOIN sc_bills sb ON sb.id = sp.bill_id
        LEFT JOIN sc_subcontractors sc ON sc.id = sb.sc_id
        WHERE sp.project_id=$1
        ORDER BY sp.payment_date`, [project_id]);
      rows.push(...scPay.rows);

      // SC advances — LEFT JOIN for the same reason
      const scAdv = await query(`
        SELECT sa.advance_number AS reference, sa.advance_date AS date,
               COALESCE(sc.name, 'Advance') AS description, sa.amount, 'SC Advance' AS source
        FROM sc_advances sa
        LEFT JOIN sc_subcontractors sc ON sc.id = sa.sc_id
        WHERE sa.project_id=$1 AND sa.status NOT IN ('cancelled')
        ORDER BY sa.advance_date`, [project_id]);
      rows.push(...scAdv.rows);

      // Advance tracker (TQS advance vouchers - paid SC advances)
      const advTrk = await query(`
        SELECT voucher_number AS reference, pay_date AS date,
               vendor_name AS description, paid_amount AS amount, 'Advance Tracker' AS source
        FROM tqs_advance_vouchers
        WHERE project_id=$1 AND is_deleted=false
          AND status IN ('issued','partial','recovered') AND paid_amount > 0
        ORDER BY pay_date`, [project_id]);
      rows.push(...advTrk.rows);

      // Contractor advances given through Stores Petty Cash
      try {
        const storePCAdv = await query(`
          SELECT COALESCE(reference_number, wo_number, 'ADV') AS reference,
                 advance_date AS date, vendor_name AS description,
                 amount, 'Stores PC Advance' AS source
          FROM stores_pc_sc_advances
          WHERE project_id=$1 AND status != 'cancelled'
          ORDER BY advance_date`, [project_id]);
        rows.push(...storePCAdv.rows);
      } catch (_) {}

      // POs tagged as Sub Con — only the invoiced (billed) portion, not full order value
      const poSubCon = await query(`
        SELECT COALESCE(po.po_ref_no, po.po_number, 'PO') AS reference,
               tb.inv_date AS date,
               COALESCE(v.name, pi.material_name, 'Vendor') || ' — ' || COALESCE(tb.inv_number, 'Bill') AS description,
               li.basic_amount AS amount, 'Purchase Order' AS source
        FROM po_items pi
        JOIN purchase_orders po ON po.id = pi.po_id
        JOIN tqs_bill_line_items li ON li.po_item_id = pi.id
        JOIN tqs_bills tb ON tb.id = li.bill_id
        LEFT JOIN vendors v ON v.id = po.vendor_id
        WHERE po.project_id=$1 AND pi.cost_head='Sub Con'
          AND po.status NOT IN ('rejected','cancelled')
          AND li.cost_head IS NULL
          AND tb.is_deleted = FALSE AND tb.workflow_status NOT IN ('rejected')
        ORDER BY tb.inv_date`, [project_id]);
      rows.push(...poSubCon.rows);

    } else if (cost_head === 'Petty Cash') {
      // Budget Control shows the WHOLE approved petty-cash total under this one
      // row (see spcActuals in costhead-summary above), so the drilldown lists
      // every approved entry in full — no per-item cost-head subtraction.
      const pc = await query(`
        WITH item_desc AS (
          SELECT entry_id, STRING_AGG(material_name, ', ' ORDER BY sort_order) AS names
          FROM stores_petty_cash_items
          GROUP BY entry_id
        )
        SELECT COALESCE(se.je_reference, CAST(se.sl_no AS TEXT)) AS reference,
               se.entry_date AS date,
               COALESCE(d.names, se.supplier) AS description,
               se.amount AS amount,
               'Petty Cash' AS source
        FROM stores_petty_cash_entries se
        LEFT JOIN item_desc d ON d.entry_id = se.id
        WHERE se.project_id=$1 AND se.status='Approved'
        ORDER BY se.entry_date`, [project_id]);
      rows.push(...pc.rows);

    } else {
      // Scope, in order of precedence:
      //  - boq_item_id supplied → restrict to that one BOQ item (item-row drilldown)
      //  - chapter supplied     → restrict to that chapter's "unlinked chapter spend"
      //                            row (tagged to the chapter, not a specific item)
      //  - unlinked=1 supplied  → restrict to the true project-level unlinked bucket
      //                            (no BOQ item AND no chapter resolvable at all)
      //  - none supplied        → whole-project total for this cost head (used by
      //                            the Cost Head Budget tab's own drilldown)
      // Chapter resolution mirrors the exact logic used to build the summary
      // (tqsActuals/poActuals above) so a row's drilldown total always matches
      // the number shown on that row.
      const isUnlinked = unlinked === '1' || unlinked === 'true';

      let tqsFilter = '', poFilter = '', raFilter = '';
      let tqsParams = [project_id, cost_head], poParams = [project_id, cost_head], raParams = [project_id, cost_head];

      if (boq_item_id) {
        tqsFilter = ' AND li.boq_item_id=$3';
        poFilter  = ' AND pi.boq_item_id=$3';
        raFilter  = ' AND rbi.boq_item_id=$3';
        tqsParams = poParams = raParams = [project_id, cost_head, boq_item_id];
      } else if (chapter) {
        tqsFilter = ' AND li.boq_item_id IS NULL AND COALESCE(li.boq_chapter, pi.boq_chapter, po_single.chapter)=$3';
        poFilter  = ' AND pi.boq_item_id IS NULL AND pi.boq_chapter=$3';
        tqsParams = poParams = [project_id, cost_head, chapter];
        raFilter = ' AND FALSE'; // RA items carry no chapter tag — never part of a chapter-unlinked bucket
      } else if (isUnlinked) {
        tqsFilter = ' AND li.boq_item_id IS NULL AND COALESCE(li.boq_chapter, pi.boq_chapter, po_single.chapter) IS NULL';
        poFilter  = ' AND pi.boq_item_id IS NULL AND pi.boq_chapter IS NULL';
        raFilter  = ' AND rbi.boq_item_id IS NULL';
      }

      // TQS bill line items for this cost head — only paid bills or accounts-approved
      const tqs = await query(`
        SELECT tb.inv_number AS reference, COALESCE(tb.inv_date, tb.created_at) AS date,
               li.item_name AS description, li.basic_amount AS amount,
               'TQS Bill' AS source
        FROM tqs_bill_line_items li
        JOIN tqs_bills tb ON tb.id = li.bill_id
        LEFT JOIN po_items pi ON pi.id = li.po_item_id
        LEFT JOIN (
          SELECT pi2.po_id, MIN(pi2.boq_chapter) AS chapter
          FROM po_items pi2
          WHERE pi2.boq_chapter IS NOT NULL
          GROUP BY pi2.po_id
          HAVING COUNT(DISTINCT pi2.boq_chapter) = 1
        ) po_single ON po_single.po_id = tb.po_id
        WHERE tb.project_id=$1 AND li.cost_head=$2
          AND tb.is_deleted = FALSE
          ${tqsFilter}
        ORDER BY COALESCE(tb.inv_date, tb.created_at)`, tqsParams);
      rows.push(...tqs.rows);

      // RA bill items for this cost head — no chapter concept, so only relevant
      // for the item-level and true-unlinked scopes (excluded for chapter scope above)
      const ra = await query(`
        SELECT rb.bill_number AS reference, rb.bill_date AS date,
               COALESCE(bi.description, rb.bill_number, 'RA Bill Item') AS description,
               rbi.current_qty * rbi.rate AS amount,
               'RA Bill' AS source
        FROM ra_bill_items rbi
        JOIN ra_bills rb ON rb.id = rbi.ra_bill_id
        LEFT JOIN boq_items bi ON bi.id = rbi.boq_item_id
        WHERE rb.project_id=$1 AND rbi.cost_head=$2
          AND rb.status IN ('certified','paid')
          ${raFilter}
        ORDER BY rb.bill_date`, raParams);
      rows.push(...ra.rows);

      // PO line items tagged to this cost head — only the invoiced (billed) portion
      const poDrill = await query(`
        SELECT COALESCE(po.po_ref_no, po.po_number, 'PO') AS reference,
               tb.inv_date AS date,
               COALESCE(pi.material_name, v.name, 'PO Item') || ' — ' || COALESCE(tb.inv_number, 'Bill') AS description,
               li.basic_amount AS amount, 'Purchase Order' AS source
        FROM po_items pi
        JOIN purchase_orders po ON po.id = pi.po_id
        JOIN tqs_bill_line_items li ON li.po_item_id = pi.id
        JOIN tqs_bills tb ON tb.id = li.bill_id
        LEFT JOIN vendors v ON v.id = po.vendor_id
        WHERE po.project_id=$1 AND pi.cost_head=$2
          AND po.status NOT IN ('rejected','cancelled')
          AND li.cost_head IS NULL
          AND tb.is_deleted = FALSE AND tb.workflow_status NOT IN ('rejected')
          ${poFilter}
        ORDER BY tb.inv_date`, poParams);
      rows.push(...poDrill.rows);

      // Stores Petty Cash purchase items tagged directly to this cost head (e.g.
      // small Materials/Consumables or Safety Items buys). This table has no
      // boq_item_id or chapter column at all, so these can only ever be part of
      // the true project-level "unlinked" bucket or the whole-project total —
      // never an item- or chapter-specific drilldown. Without this, the summary
      // row's Spent figure (which does include these via spcActuals) had no
      // matching drilldown rows to show, since none of the other queries above
      // reach this table.
      if (!boq_item_id && !chapter) {
        const spc = await query(`
          SELECT COALESCE(se.je_reference, CAST(se.sl_no AS TEXT)) AS reference,
                 se.entry_date AS date, si.material_name AS description,
                 si.total_amount AS amount, 'Petty Cash' AS source
          FROM stores_petty_cash_items si
          JOIN stores_petty_cash_entries se ON se.id = si.entry_id
          WHERE se.project_id=$1 AND se.status='Approved' AND si.cost_head=$2
          ORDER BY se.entry_date`, [project_id, cost_head]);
        rows.push(...spc.rows);
      }
    }

    // Sort all by date
    rows.sort((a, b) => new Date(a.date || 0) - new Date(b.date || 0));
    res.json({ data: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /boq-budget/:project_id/items-drilldown?item_ids=uuid1,uuid2,...
// Returns every transaction (across all cost heads) tagged to any of the given
// BOQ items — used for the chapter-wise "Spent" drilldown, which spans however
// many cost heads a chapter's items happen to be tagged with.
router.get('/:project_id/items-drilldown', async (req, res) => {
  try {
    const { project_id } = req.params;
    const { item_ids, chapter } = req.query;
    if (!item_ids) return res.status(400).json({ error: 'item_ids is required' });
    const ids = String(item_ids).split(',').map(s => s.trim()).filter(Boolean);
    if (!ids.length) return res.json({ data: [] });

    const proj = await query(`SELECT id FROM projects WHERE id=$1 AND company_id=$2`, [project_id, req.user.company_id]);
    if (!proj.rows.length) return res.status(404).json({ error: 'Project not found' });
    if (!userCanAccessProject(req, project_id)) return res.status(403).json({ error: 'Access denied' });

    let rows = [];

    // Chapter-tagged spend (no BOQ item on the bill line): bill lines whose
    // chapter — resolved via the linked PO line, or the bill's single-chapter
    // PO — matches this chapter. Mirrors the attribution in the breakdown, so
    // the drilldown shows exactly the invoices counted in this chapter's Spent.
    if (chapter) {
      const chTqs = await query(`
        SELECT tb.inv_number AS reference, COALESCE(tb.inv_date, tb.created_at) AS date,
               li.item_name AS description, li.cost_head, li.basic_amount AS amount,
               'TQS Bill' AS source
        FROM tqs_bill_line_items li
        JOIN tqs_bills tb ON tb.id = li.bill_id
        LEFT JOIN po_items pi ON pi.id = li.po_item_id
        LEFT JOIN (
          SELECT pi2.po_id, MIN(pi2.boq_chapter) AS chapter
          FROM po_items pi2
          WHERE pi2.boq_chapter IS NOT NULL
          GROUP BY pi2.po_id
          HAVING COUNT(DISTINCT pi2.boq_chapter) = 1
        ) po_single ON po_single.po_id = tb.po_id
        WHERE tb.project_id=$1 AND tb.is_deleted = FALSE
          AND li.boq_item_id IS NULL AND li.cost_head IS NOT NULL
          AND COALESCE(li.boq_chapter, pi.boq_chapter, po_single.chapter) = $2
        ORDER BY COALESCE(tb.inv_date, tb.created_at)`, [project_id, chapter]);
      rows.push(...chTqs.rows);

      // PO lines tagged to this chapter (no item) — invoiced portion where the
      // bill line itself carries no cost head (counted under the PO's tag)
      const chPo = await query(`
        SELECT COALESCE(po.po_ref_no, po.po_number, 'PO') AS reference,
               tb.inv_date AS date,
               COALESCE(pi.material_name, 'PO Item') || ' — ' || COALESCE(tb.inv_number, 'Bill') AS description,
               pi.cost_head, li.basic_amount AS amount, 'Purchase Order' AS source
        FROM po_items pi
        JOIN purchase_orders po ON po.id = pi.po_id
        JOIN tqs_bill_line_items li ON li.po_item_id = pi.id
        JOIN tqs_bills tb ON tb.id = li.bill_id
        WHERE po.project_id=$1 AND po.status NOT IN ('rejected','cancelled')
          AND pi.boq_item_id IS NULL AND pi.boq_chapter = $2
          AND pi.cost_head IS NOT NULL AND li.cost_head IS NULL
          AND tb.is_deleted = FALSE AND tb.workflow_status NOT IN ('rejected')
        ORDER BY tb.inv_date`, [project_id, chapter]);
      rows.push(...chPo.rows);
    }

    // TQS bill line items tagged directly to any of these BOQ items
    const tqs = await query(`
      SELECT tb.inv_number AS reference, COALESCE(tb.inv_date, tb.created_at) AS date,
             li.item_name AS description, li.cost_head, li.basic_amount AS amount,
             'TQS Bill' AS source
      FROM tqs_bill_line_items li
      JOIN tqs_bills tb ON tb.id = li.bill_id
      WHERE tb.project_id=$1 AND tb.is_deleted = FALSE AND li.boq_item_id = ANY($2::uuid[])
      ORDER BY COALESCE(tb.inv_date, tb.created_at)`, [project_id, ids]);
    rows.push(...tqs.rows);

    // RA bill items tagged to any of these BOQ items
    const ra = await query(`
      SELECT rb.bill_number AS reference, rb.bill_date AS date,
             COALESCE(bi.description, rb.bill_number, 'RA Bill Item') AS description,
             rbi.cost_head, rbi.current_qty * rbi.rate AS amount, 'RA Bill' AS source
      FROM ra_bill_items rbi
      JOIN ra_bills rb ON rb.id = rbi.ra_bill_id
      LEFT JOIN boq_items bi ON bi.id = rbi.boq_item_id
      WHERE rb.project_id=$1 AND rb.status IN ('certified','paid') AND rbi.boq_item_id = ANY($2::uuid[])
      ORDER BY rb.bill_date`, [project_id, ids]);
    rows.push(...ra.rows);

    // SC bills — via work-order items linked to these BOQ items (Sub Con)
    const scBills = await query(`
      SELECT sb.bill_number AS reference, sb.bill_date AS date,
             COALESCE(sc.name, sb.bill_number, 'Subcontractor') AS description,
             'Sub Con' AS cost_head, SUM(bi.curr_qty * bi.rate) AS amount, 'SC Bill' AS source
      FROM sc_bill_items bi
      JOIN sc_bills sb ON sb.id = bi.bill_id
      JOIN sc_wo_items swi ON swi.id = bi.wo_item_id
      LEFT JOIN sc_subcontractors sc ON sc.id = sb.sc_id
      WHERE sb.project_id=$1 AND sb.status NOT IN ('draft','rejected','queried') AND swi.boq_item_id = ANY($2::uuid[])
      GROUP BY sb.id, sb.bill_number, sb.bill_date, sc.name
      ORDER BY sb.bill_date`, [project_id, ids]);
    rows.push(...scBills.rows);

    // Advance Tracker vouchers — same wo_linked/sc_linked share logic as the main
    // breakdown query, but returning one row per voucher (share amount) filtered
    // to these BOQ items, so the drilldown lists the actual advance vouchers.
    const advTrk = await query(`
      WITH wo_linked AS (
        SELECT av.id AS advance_id, av.voucher_number, av.pay_date, av.vendor_name,
               wi.boq_item_id,
               av.paid_amount * (wi.qty * wi.rate) / NULLIF(tot.total_amount, 0) AS share
        FROM tqs_advance_vouchers av
        JOIN sc_work_orders wo ON wo.wo_number = av.wo_number AND wo.project_id = $1
        JOIN sc_wo_items wi ON wi.wo_id = wo.id AND wi.boq_item_id IS NOT NULL
        JOIN (
          SELECT wo2.wo_number, SUM(wi2.qty * wi2.rate) AS total_amount
          FROM sc_work_orders wo2
          JOIN sc_wo_items wi2 ON wi2.wo_id = wo2.id AND wi2.boq_item_id IS NOT NULL
          WHERE wo2.project_id = $1
          GROUP BY wo2.wo_number
        ) tot ON tot.wo_number = wo.wo_number
        WHERE av.project_id = $1 AND av.status IN ('issued','partial','recovered')
          AND av.is_deleted = false AND av.paid_amount > 0
      ),
      sc_linked AS (
        SELECT av.id AS advance_id, av.voucher_number, av.pay_date, av.vendor_name,
               m.boq_item_id,
               av.paid_amount * m.sc_amount / NULLIF(tot2.total_sc, 0) AS share
        FROM tqs_advance_vouchers av
        JOIN boq_sc_mapping m ON m.sc_id = av.vendor_id AND m.project_id = $1 AND m.status != 'cancelled'
        JOIN (
          SELECT m2.sc_id, SUM(m2.sc_amount) AS total_sc
          FROM boq_sc_mapping m2
          WHERE m2.project_id = $1 AND m2.status != 'cancelled'
          GROUP BY m2.sc_id
        ) tot2 ON tot2.sc_id = m.sc_id
        WHERE av.project_id = $1 AND av.status IN ('issued','partial','recovered')
          AND av.is_deleted = false AND av.paid_amount > 0 AND av.vendor_id IS NOT NULL
          AND av.id NOT IN (SELECT DISTINCT advance_id FROM wo_linked)
      )
      SELECT voucher_number AS reference, pay_date AS date, vendor_name AS description,
             'Sub Con' AS cost_head, share AS amount, 'Advance Tracker' AS source
      FROM (
        SELECT * FROM wo_linked
        UNION ALL
        SELECT * FROM sc_linked
      ) combined
      WHERE boq_item_id = ANY($2::uuid[])
      ORDER BY pay_date`, [project_id, ids]);
    rows.push(...advTrk.rows);

    // PO line items — only the invoiced (billed) portion, tagged directly to these
    // BOQ items. li.cost_head IS NULL guards against double-counting bills that
    // already carry their own cost_head tag (picked up by the TQS query above).
    const poDrill = await query(`
      SELECT COALESCE(po.po_ref_no, po.po_number, 'PO') AS reference,
             tb.inv_date AS date,
             COALESCE(pi.material_name, v.name, 'PO Item') || ' — ' || COALESCE(tb.inv_number, 'Bill') AS description,
             pi.cost_head, li.basic_amount AS amount, 'Purchase Order' AS source
      FROM po_items pi
      JOIN purchase_orders po ON po.id = pi.po_id
      JOIN tqs_bill_line_items li ON li.po_item_id = pi.id
      JOIN tqs_bills tb ON tb.id = li.bill_id
      LEFT JOIN vendors v ON v.id = po.vendor_id
      WHERE po.project_id=$1 AND po.status NOT IN ('rejected','cancelled')
        AND pi.boq_item_id = ANY($2::uuid[]) AND li.cost_head IS NULL
        AND tb.is_deleted = FALSE AND tb.workflow_status NOT IN ('rejected')
      ORDER BY tb.inv_date`, [project_id, ids]);
    rows.push(...poDrill.rows);

    rows.sort((a, b) => new Date(a.date || 0) - new Date(b.date || 0));
    res.json({ data: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /boq-budget/:project_id/unlinked-lines?cost_head=Blocks
// Lists the TQS bill line items behind the project-level "Unlinked Spend"
// bucket — lines with a cost head but no BOQ item AND no chapter tag at all
// (direct/no-PO bills for consumables, tools, safety gear, etc). Returns the
// line item id + parent bill id so the frontend can tag each one to a chapter
// via PATCH /tqs/bills/:billId/line-items/:lineId/chapter.
router.get('/:project_id/unlinked-lines', async (req, res) => {
  try {
    const { project_id } = req.params;
    const { cost_head } = req.query;
    const proj = await query(`SELECT id FROM projects WHERE id=$1 AND company_id=$2`, [project_id, req.user.company_id]);
    if (!proj.rows.length) return res.status(404).json({ error: 'Project not found' });
    if (!userCanAccessProject(req, project_id)) return res.status(403).json({ error: 'Access denied' });

    const costHeadFilter = cost_head ? ' AND li.cost_head = $2' : '';
    const params = cost_head ? [project_id, cost_head] : [project_id];
    const rows = await query(`
      SELECT li.id AS line_id, tb.id AS bill_id,
             tb.inv_number AS reference, COALESCE(tb.inv_date, tb.created_at) AS date,
             li.item_name AS description, li.cost_head, li.basic_amount AS amount
      FROM tqs_bill_line_items li
      JOIN tqs_bills tb ON tb.id = li.bill_id
      LEFT JOIN po_items pi ON pi.id = li.po_item_id
      LEFT JOIN (
        SELECT pi2.po_id, MIN(pi2.boq_chapter) AS chapter
        FROM po_items pi2
        WHERE pi2.boq_chapter IS NOT NULL
        GROUP BY pi2.po_id
        HAVING COUNT(DISTINCT pi2.boq_chapter) = 1
      ) po_single ON po_single.po_id = tb.po_id
      WHERE tb.project_id = $1 AND tb.is_deleted = FALSE
        AND li.boq_item_id IS NULL AND li.cost_head IS NOT NULL
        AND COALESCE(li.boq_chapter, pi.boq_chapter, po_single.chapter) IS NULL
        ${costHeadFilter}
      ORDER BY COALESCE(tb.inv_date, tb.created_at)`, params);
    res.json({ data: rows.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /boq-budget/:project_id/prorated-pool?cost_head=Sub+Con
// Returns the actual project-wide transactions that were never tagged to a
// specific BOQ item under this cost head — the "pool" that the pro-rata
// engine splits across BOQ items by budget share. This lets a user trace
// where their item/chapter's estimated (≈) spend actually originated from.
router.get('/:project_id/prorated-pool', async (req, res) => {
  try {
    const { project_id } = req.params;
    const { cost_head } = req.query;
    if (!cost_head) return res.status(400).json({ error: 'cost_head is required' });
    const proj = await query(`SELECT id FROM projects WHERE id=$1 AND company_id=$2`, [project_id, req.user.company_id]);
    if (!proj.rows.length) return res.status(404).json({ error: 'Project not found' });
    if (!userCanAccessProject(req, project_id)) return res.status(403).json({ error: 'Access denied' });

    let rows = [];

    // TQS bill line items tagged only to a cost head, never a specific BOQ item
    const tqs = await query(`
      SELECT tb.inv_number AS reference, COALESCE(tb.inv_date, tb.created_at) AS date,
             li.item_name AS description, li.basic_amount AS amount, 'TQS Bill' AS source
      FROM tqs_bill_line_items li
      JOIN tqs_bills tb ON tb.id = li.bill_id
      WHERE tb.project_id=$1 AND tb.is_deleted = FALSE
        AND li.cost_head=$2 AND li.boq_item_id IS NULL
      ORDER BY COALESCE(tb.inv_date, tb.created_at)`, [project_id, cost_head]);
    rows.push(...tqs.rows);

    // RA bill items — rare to be untagged, but defensive
    const ra = await query(`
      SELECT rb.bill_number AS reference, rb.bill_date AS date,
             rb.bill_number AS description, rbi.current_qty * rbi.rate AS amount, 'RA Bill' AS source
      FROM ra_bill_items rbi
      JOIN ra_bills rb ON rb.id = rbi.ra_bill_id
      WHERE rb.project_id=$1 AND rb.status IN ('certified','paid')
        AND rbi.cost_head=$2 AND rbi.boq_item_id IS NULL
      ORDER BY rb.bill_date`, [project_id, cost_head]);
    rows.push(...ra.rows);

    // Stores petty cash — always project-level (no boq_item_id column at all)
    const spc = await query(`
      SELECT COALESCE(se.je_reference, CAST(se.sl_no AS TEXT)) AS reference,
             se.entry_date AS date, COALESCE(si.item_name, se.supplier, 'Petty cash item') AS description,
             si.total_amount AS amount, 'Petty Cash' AS source
      FROM stores_petty_cash_items si
      JOIN stores_petty_cash_entries se ON se.id = si.entry_id
      WHERE se.project_id=$1 AND se.status='Approved' AND si.cost_head=$2
      ORDER BY se.entry_date`, [project_id, cost_head]).catch(() => ({ rows: [] }));
    rows.push(...spc.rows);

    // PO line items tagged only to a cost head, never a specific BOQ item —
    // only the invoiced (billed) portion counts
    const po = await query(`
      SELECT COALESCE(po.po_ref_no, po.po_number, 'PO') AS reference,
             tb.inv_date AS date,
             COALESCE(pi.material_name, v.name, 'PO Item') || ' — ' || COALESCE(tb.inv_number, 'Bill') AS description,
             li.basic_amount AS amount, 'Purchase Order' AS source
      FROM po_items pi
      JOIN purchase_orders po ON po.id = pi.po_id
      JOIN tqs_bill_line_items li ON li.po_item_id = pi.id
      JOIN tqs_bills tb ON tb.id = li.bill_id
      LEFT JOIN vendors v ON v.id = po.vendor_id
      WHERE po.project_id=$1 AND po.status NOT IN ('rejected','cancelled')
        AND pi.cost_head=$2 AND pi.boq_item_id IS NULL AND li.cost_head IS NULL
        AND tb.is_deleted = FALSE AND tb.workflow_status NOT IN ('rejected')
      ORDER BY tb.inv_date`, [project_id, cost_head]);
    rows.push(...po.rows);

    rows.sort((a, b) => new Date(a.date || 0) - new Date(b.date || 0));
    res.json({ data: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /boq-budget/:project_id/costhead-monthly
// Returns monthly expenditure broken down by cost head for project analysis.
// Response: { months: ['2025-01','2025-02',...], data: [{ month, breakdown: { [cost_head]: amount } }] }
router.get('/:project_id/costhead-monthly', async (req, res) => {
  try {
    const { project_id } = req.params;
    const proj = await query(`SELECT id FROM projects WHERE id=$1 AND company_id=$2`, [project_id, req.user.company_id]);
    if (!proj.rows.length) return res.status(404).json({ error: 'Project not found' });
    if (!userCanAccessProject(req, project_id)) return res.status(403).json({ error: 'Access denied' });

    const raM = await query(`
      SELECT TO_CHAR(COALESCE(rb.bill_date, rb.created_at), 'YYYY-MM') AS month,
             rbi.cost_head, SUM(rbi.current_qty * rbi.rate) AS actual
      FROM ra_bill_items rbi JOIN ra_bills rb ON rb.id = rbi.ra_bill_id
      WHERE rb.project_id=$1 AND rb.status IN ('certified','paid') AND rbi.cost_head IS NOT NULL
      GROUP BY 1, 2`, [project_id]);

    const scM = await query(`
      SELECT TO_CHAR(COALESCE(sb.bill_date, sb.created_at), 'YYYY-MM') AS month,
             'Sub Con' AS cost_head, SUM(bi.curr_qty * bi.rate) AS actual
      FROM sc_bill_items bi JOIN sc_bills sb ON sb.id = bi.bill_id
      WHERE sb.project_id=$1 AND sb.status NOT IN ('draft','rejected','queried')
      GROUP BY 1`, [project_id]);

    const scPayM = await query(`
      SELECT TO_CHAR(COALESCE(payment_date, created_at), 'YYYY-MM') AS month,
             'Sub Con' AS cost_head, SUM(amount) AS actual
      FROM sc_payments
      WHERE project_id=$1
      GROUP BY 1`, [project_id]);

    const tqsM = await query(`
      SELECT TO_CHAR(COALESCE(tb.inv_date, tb.created_at), 'YYYY-MM') AS month,
             li.cost_head, SUM(li.basic_amount) AS actual
      FROM tqs_bill_line_items li JOIN tqs_bills tb ON tb.id = li.bill_id
      WHERE tb.project_id=$1 AND tb.is_deleted = FALSE AND li.cost_head IS NOT NULL
      GROUP BY 1, 2`, [project_id]);

    const advM = await query(`
      SELECT TO_CHAR(COALESCE(advance_date, created_at), 'YYYY-MM') AS month,
             'Sub Con' AS cost_head, SUM(amount) AS actual
      FROM sc_advances
      WHERE project_id=$1 AND status NOT IN ('cancelled')
      GROUP BY 1`, [project_id]);

    const advTrkM = await query(`
      SELECT TO_CHAR(COALESCE(pay_date, created_at), 'YYYY-MM') AS month,
             'Sub Con' AS cost_head, SUM(paid_amount) AS actual
      FROM tqs_advance_vouchers
      WHERE project_id=$1 AND is_deleted=false
        AND status IN ('issued','partial','recovered') AND paid_amount > 0
      GROUP BY 1`, [project_id]);

    const spcM = await query(`
      SELECT TO_CHAR(COALESCE(entry_date, created_at), 'YYYY-MM') AS month,
             'Petty Cash' AS cost_head, SUM(amount) AS actual
      FROM stores_petty_cash_entries
      WHERE project_id=$1 AND status='Approved'
      GROUP BY 1`, [project_id]);

    // Contractor advances through Stores Petty Cash — mapped to "Sub Con"
    let storePCAdvM = { rows: [] };
    try {
      storePCAdvM = await query(`
        SELECT TO_CHAR(COALESCE(advance_date, created_at), 'YYYY-MM') AS month,
               'Sub Con' AS cost_head, SUM(amount) AS actual
        FROM stores_pc_sc_advances
        WHERE project_id=$1 AND status != 'cancelled'
        GROUP BY 1`, [project_id]);
    } catch (_) {}

    // Merge all sources into { [month]: { [cost_head]: amount } }
    const monthly = {};
    for (const rows of [raM.rows, scM.rows, scPayM.rows, tqsM.rows, advM.rows, advTrkM.rows, spcM.rows, storePCAdvM.rows]) {
      for (const r of rows) {
        if (!r.month || !r.cost_head) continue;
        if (!monthly[r.month]) monthly[r.month] = {};
        monthly[r.month][r.cost_head] = (monthly[r.month][r.cost_head] || 0) + parseFloat(r.actual || 0);
      }
    }

    // Profit per month = 10% of sum of base heads for that month
    for (const month of Object.keys(monthly)) {
      const baseSum = PROFIT_BASE_HEADS.reduce((s, h) => s + (monthly[month][h] || 0), 0);
      if (baseSum > 0) monthly[month]['Profit'] = baseSum * PROFIT_PCT;
    }

    const months = Object.keys(monthly).sort();
    const data = months.map(month => ({ month, breakdown: monthly[month] }));
    res.json({ data, months });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /boq-budget/:project_id/costhead-budget
// Upsert budget amount for a single cost head at project level.
router.put('/:project_id/costhead-budget', async (req, res) => {
  try {
    const { project_id } = req.params;
    const { cost_head, budget_amount, boq_amount } = req.body;
    if (!cost_head) return res.status(400).json({ error: 'cost_head is required' });

    const proj = await query(`SELECT id FROM projects WHERE id=$1 AND company_id=$2`, [project_id, req.user.company_id]);
    if (!proj.rows.length) return res.status(404).json({ error: 'Project not found' });
    if (!userCanAccessProject(req, project_id)) return res.status(403).json({ error: 'Access denied' });

    const bAmt = budget_amount != null ? parseFloat(budget_amount) || 0 : null;
    const bBoq = boq_amount    != null ? parseFloat(boq_amount)    || 0 : null;
    const r = await query(`
      INSERT INTO project_costhead_budgets (project_id, cost_head, budget_amount, boq_amount, created_by)
      VALUES ($1, $2, COALESCE($3, 0), COALESCE($4, 0), $5)
      ON CONFLICT (project_id, cost_head) DO UPDATE SET
        budget_amount = CASE WHEN $3 IS NOT NULL THEN $3 ELSE project_costhead_budgets.budget_amount END,
        boq_amount    = CASE WHEN $4 IS NOT NULL THEN $4 ELSE project_costhead_budgets.boq_amount    END,
        updated_at    = NOW()
      RETURNING *`,
      [project_id, cost_head, bAmt, bBoq, req.user.id]
    );
    res.json({ data: r.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /boq-budget/:project_id/bulk-costhead-budget
// Accepts array of {cost_head, budget_amount} and upserts all at once.
router.post('/:project_id/bulk-costhead-budget', async (req, res) => {
  try {
    const { project_id } = req.params;
    const { entries } = req.body;
    if (!Array.isArray(entries) || !entries.length) {
      return res.status(400).json({ error: 'entries array required' });
    }
    const proj = await query(`SELECT id FROM projects WHERE id=$1 AND company_id=$2`, [project_id, req.user.company_id]);
    if (!proj.rows.length) return res.status(404).json({ error: 'Project not found' });
    if (!userCanAccessProject(req, project_id)) return res.status(403).json({ error: 'Access denied' });

    const saved = await withTransaction(async (client) => {
      const results = [];
      for (const e of entries) {
        if (!e.cost_head) continue;
        const r = await client.query(`
          INSERT INTO project_costhead_budgets (project_id, cost_head, budget_amount, created_by)
          VALUES ($1,$2,$3,$4)
          ON CONFLICT (project_id, cost_head)
          DO UPDATE SET budget_amount=$3, updated_at=NOW()
          RETURNING *`,
          [project_id, e.cost_head, parseFloat(e.budget_amount) || 0, req.user.id]
        );
        results.push(r.rows[0]);
      }
      return results;
    });
    res.json({ data: saved, count: saved.length });
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

// POST /boq-budget/:project_id/send-budget-alert
// Emails stephen@bcim.in and it@bcim.in with a summary of all cost heads
// that are >= 80% of their budget or over budget.
router.post('/:project_id/send-budget-alert', async (req, res) => {
  try {
    const { project_id } = req.params;
    const proj = await query(
      `SELECT p.id, p.name, p.client_name FROM projects p WHERE p.id=$1 AND p.company_id=$2`,
      [project_id, req.user.company_id]
    );
    if (!proj.rows.length) return res.status(404).json({ error: 'Project not found' });
    if (!userCanAccessProject(req, project_id)) return res.status(403).json({ error: 'Access denied' });
    const project = proj.rows[0];

    // Re-run costhead summary inline (simplified — same sources as GET endpoint)
    const budgets = await query(
      `SELECT cost_head, budget_amount FROM project_costhead_budgets WHERE project_id=$1`, [project_id]
    );
    const raA   = await query(`SELECT rbi.cost_head, SUM(rbi.current_qty*rbi.rate) AS actual FROM ra_bill_items rbi JOIN ra_bills rb ON rb.id=rbi.ra_bill_id WHERE rb.project_id=$1 AND rb.status IN ('certified','paid') GROUP BY rbi.cost_head`, [project_id]);
    const scA   = await query(`SELECT 'Sub Con' AS cost_head, SUM(bi.curr_qty*bi.rate) AS actual FROM sc_bill_items bi JOIN sc_bills sb ON sb.id=bi.bill_id WHERE sb.project_id=$1 AND sb.status NOT IN ('draft','rejected','queried')`, [project_id]);
    const tqsA  = await query(`SELECT li.cost_head, SUM(li.basic_amount) AS actual FROM tqs_bill_line_items li JOIN tqs_bills tb ON tb.id=li.bill_id WHERE tb.project_id=$1 AND tb.is_deleted = FALSE AND li.cost_head IS NOT NULL GROUP BY li.cost_head`, [project_id]);
    const spcA  = await query(`SELECT 'Petty Cash' AS cost_head, SUM(amount) AS actual FROM stores_petty_cash_entries WHERE project_id=$1 AND status='Approved'`, [project_id]);
    const advA  = await query(`SELECT 'Sub Con' AS cost_head, SUM(paid_amount) AS actual FROM tqs_advance_vouchers WHERE project_id=$1 AND is_deleted=false AND status IN ('issued','partial','recovered') AND paid_amount>0`, [project_id]);

    const actualMap = {};
    for (const rows of [raA.rows, scA.rows, tqsA.rows, spcA.rows, advA.rows]) {
      for (const r of rows) {
        if (!r.cost_head) continue;
        actualMap[r.cost_head] = (actualMap[r.cost_head] || 0) + parseFloat(r.actual || 0);
      }
    }
    const budgetMap = {};
    for (const b of budgets.rows) budgetMap[b.cost_head] = parseFloat(b.budget_amount || 0);

    // Build alert rows (heads with budget set and >= 80% used, or over budget)
    const alertRows = BOQ_COST_HEADS
      .map(head => ({
        head,
        budget: budgetMap[head] || 0,
        actual: actualMap[head] || 0,
        pct: budgetMap[head] > 0 ? ((actualMap[head] || 0) / budgetMap[head]) * 100 : 0,
      }))
      .filter(r => r.budget > 0 && r.pct >= 80)
      .sort((a, b) => b.pct - a.pct);

    if (!alertRows.length) {
      return res.json({ sent: false, reason: 'No cost heads at or above 80% budget utilisation.' });
    }

    const fmt = (v) => '₹' + Math.round(v).toLocaleString('en-IN');
    const rowsHtml = alertRows.map(r => {
      const over   = r.pct > 100;
      const near   = r.pct >= 80 && r.pct <= 100;
      const color  = over ? '#fef2f2' : '#fffbeb';
      const badge  = over
        ? `<span style="background:#fee2e2;color:#b91c1c;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:700;">OVER BUDGET</span>`
        : `<span style="background:#fef3c7;color:#92400e;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:700;">NEAR LIMIT</span>`;
      return `
        <tr style="background:${color};">
          <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-weight:600;">${r.head}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;text-align:right;">${fmt(r.budget)}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;text-align:right;font-weight:700;">${fmt(r.actual)}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;text-align:right;font-weight:700;color:${over ? '#b91c1c' : '#92400e'};">${r.pct.toFixed(1)}%</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;text-align:right;color:${over ? '#b91c1c' : '#78350f'};font-weight:600;">${fmt(r.actual - r.budget)}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;">${badge}</td>
        </tr>`;
    }).join('');

    const generatedAt = new Date().toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    const html = `
      <div style="font-family:Arial,sans-serif;max-width:700px;margin:0 auto;">
        <div style="height:4px;background:linear-gradient(90deg,#0B2E59,#2563eb);"></div>
        <div style="padding:20px 24px;background:#0B2E59;color:#fff;">
          <div style="font-size:20px;font-weight:900;">BCIM Engineering Pvt. Ltd.</div>
          <div style="font-size:12px;color:#93c5fd;margin-top:4px;">Budget Alert — ${project.name}${project.client_name ? ' · ' + project.client_name : ''}</div>
        </div>
        <div style="padding:16px 24px;background:#fff;">
          <p style="margin:0 0 12px;font-size:14px;color:#1e293b;">
            The following cost heads have reached <strong>80% or more</strong> of their allocated budget and require your attention.
          </p>
          <table style="width:100%;border-collapse:collapse;font-size:13px;">
            <thead>
              <tr style="background:#0B2E59;color:#fff;">
                <th style="padding:8px 12px;text-align:left;">Cost Head</th>
                <th style="padding:8px 12px;text-align:right;">Budget</th>
                <th style="padding:8px 12px;text-align:right;">Actual Spend</th>
                <th style="padding:8px 12px;text-align:right;">% Used</th>
                <th style="padding:8px 12px;text-align:right;">Over by</th>
                <th style="padding:8px 12px;text-align:left;">Status</th>
              </tr>
            </thead>
            <tbody>${rowsHtml}</tbody>
          </table>
          <p style="margin:16px 0 0;font-size:11px;color:#94a3b8;">Generated: ${generatedAt} · BCIM Construct-ERP · Confidential — Internal Use Only</p>
        </div>
      </div>`;

    const { sendMail } = require('../services/mail.service');
    const overCount  = alertRows.filter(r => r.pct > 100).length;
    const nearCount  = alertRows.length - overCount;
    const subjParts  = [];
    if (overCount) subjParts.push(`${overCount} over budget`);
    if (nearCount) subjParts.push(`${nearCount} near limit`);
    const subject = `[Budget Alert] ${project.name} — ${subjParts.join(', ')}`;

    const result = await sendMail({
      to: ['stephen@bcim.in', 'it@bcim.in'],
      subject,
      html,
    });

    res.json({ sent: true, alert_count: alertRows.length, over_count: overCount, near_count: nearCount, result });
  } catch (err) {
    console.error('[send-budget-alert]', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
