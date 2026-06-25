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

    const advanceActuals = await query(`
      SELECT NULL::uuid AS boq_item_id, 'Sub Con' AS cost_head, SUM(paid_amount) AS actual
      FROM tqs_advance_vouchers
      WHERE project_id = $1 AND status IN ('issued','partial','recovered') AND is_deleted = false
      GROUP BY cost_head
    `, [project_id]);

    const tqsActuals = await query(`
      SELECT li.boq_item_id, li.cost_head, SUM(li.basic_amount) AS actual
      FROM tqs_bill_line_items li
      JOIN tqs_bills tb ON tb.id = li.bill_id
      WHERE tb.project_id = $1 AND tb.workflow_status = 'paid' AND li.boq_item_id IS NOT NULL
      GROUP BY li.boq_item_id, li.cost_head
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
    const addActual = (rows, isAdvance = false) => {
      for (const row of rows) {
        const itemId = row.boq_item_id;
        const amt = parseFloat(row.actual) || 0;
        if (!row.cost_head || !BOQ_COST_HEADS.includes(row.cost_head)) {
          unallocated[itemId] = (unallocated[itemId] || 0) + amt;
          continue;
        }
        if (!byItem[itemId]) byItem[itemId] = {};
        if (!byItem[itemId][row.cost_head]) byItem[itemId][row.cost_head] = { pct: 0, amount: 0, actual: 0, advance: 0, invoiced: 0 };
        if (isAdvance) {
          byItem[itemId][row.cost_head].advance += amt;
        } else {
          byItem[itemId][row.cost_head].invoiced += amt;
          byItem[itemId][row.cost_head].actual += amt;
        }
      }
    };
    addActual(raActuals.rows, false);
    addActual(scActuals.rows, false);
    addActual(tqsActuals.rows, false);
    addActual(advanceActuals.rows, true);

    const data = items.rows.map(item => ({
      ...item,
      breakdown: byItem[item.id] || {},
      unallocated_actual: unallocated[item.id] || 0,
    }));

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

module.exports = router;
