// src/routes/hireLog.routes.js — Hire/Rental Usage Tracker
// Dedicated screen for equipment-hire Work Orders (cranes, forklifts, etc.)
// billed per usage category (e.g. "Upto 3 Hours", "After 3 Hours", "For 1 Day")
// across many invoices over the WO's lifetime, tracking both what the vendor
// invoiced and what the site engineer certified — separate from the generic
// BOQ-quantity Raise Bill flow which assumes a single fixed quantity per item.
const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const { query, withTransaction } = require('../config/database');
const { runSchemaInit } = require('../utils/schemaInit');

router.use(authenticate);
const CID = req => req.user.company_id;
const PLANNER = ['super_admin', 'admin', 'project_manager', 'site_engineer', 'qs_engineer', 'procurement_manager'];

runSchemaInit('hire_log_tables', async () => {
  await query(`ALTER TABLE sc_wo_items ADD COLUMN IF NOT EXISTS equipment_group VARCHAR(200)`);
  await query(`ALTER TABLE sc_wo_items ADD COLUMN IF NOT EXISTS usage_category VARCHAR(100)`);
  await query(`ALTER TABLE sc_wo_items ADD COLUMN IF NOT EXISTS category_order INTEGER DEFAULT 0`);

  await query(`
    CREATE TABLE IF NOT EXISTS wo_hire_log (
      id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id   UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      wo_id        UUID NOT NULL REFERENCES sc_work_orders(id) ON DELETE CASCADE,
      bill_no      VARCHAR(60),
      bill_month   VARCHAR(30),
      bill_date    DATE,
      status       VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','billed')),
      sc_bill_id   UUID REFERENCES sc_bills(id),
      created_by   UUID REFERENCES users(id),
      created_at   TIMESTAMPTZ DEFAULT NOW(),
      updated_at   TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_hire_log_wo ON wo_hire_log(wo_id)`);

  await query(`
    CREATE TABLE IF NOT EXISTS wo_hire_log_lines (
      id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      log_id           UUID NOT NULL REFERENCES wo_hire_log(id) ON DELETE CASCADE,
      wo_item_id       UUID NOT NULL REFERENCES sc_wo_items(id),
      invoice_hours    NUMERIC(10,3) DEFAULT 0,
      certified_hours  NUMERIC(10,3) DEFAULT 0
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_hire_log_lines_log ON wo_hire_log_lines(log_id)`);
});

// GET /hire-log/work-orders — WOs that have at least one categorized item (eligible for the tracker)
router.get('/work-orders', async (req, res) => {
  try {
    const params = [CID(req)];
    const projectFilter = req.query.project_id
      ? ` AND wo.project_id = $${params.push(req.query.project_id)}`
      : '';
    const rows = await query(`
      SELECT DISTINCT wo.id, wo.wo_number, wo.subject, sc.name AS sc_name, p.name AS project_name
      FROM sc_work_orders wo
      JOIN sc_wo_items i ON i.wo_id = wo.id
      JOIN sc_subcontractors sc ON sc.id = wo.sc_id
      JOIN projects p ON p.id = wo.project_id
      WHERE wo.company_id = $1 AND i.usage_category IS NOT NULL${projectFilter}
      ORDER BY wo.wo_number
    `, params);
    res.json({ data: rows.rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /hire-log/:woId — equipment groups (with categories/rates) + log entries + totals
router.get('/:woId', async (req, res) => {
  try {
    const woRes = await query(
      `SELECT wo.*, sc.name AS sc_name, p.name AS project_name
       FROM sc_work_orders wo
       JOIN sc_subcontractors sc ON sc.id = wo.sc_id
       JOIN projects p ON p.id = wo.project_id
       WHERE wo.id = $1 AND wo.company_id = $2`,
      [req.params.woId, CID(req)]
    );
    if (!woRes.rows.length) return res.status(404).json({ error: 'Work order not found' });

    const itemsRes = await query(
      `SELECT id, description, unit, rate, qty, billed_qty, balance_qty, equipment_group, usage_category, category_order, sequence_no
       FROM sc_wo_items WHERE wo_id = $1 ORDER BY equipment_group, category_order, sequence_no`,
      [req.params.woId]
    );

    const groupsMap = new Map();
    for (const it of itemsRes.rows) {
      if (!it.usage_category) continue; // uncategorized items don't show in the tracker
      const g = it.equipment_group || 'General';
      if (!groupsMap.has(g)) groupsMap.set(g, []);
      groupsMap.get(g).push(it);
    }
    const equipmentGroups = [...groupsMap.entries()].map(([equipment_group, categories]) => ({ equipment_group, categories }));

    const logRes = await query(
      `SELECT l.*, b.bill_number AS sc_bill_number, b.net_payable AS sc_bill_net
       FROM wo_hire_log l
       LEFT JOIN sc_bills b ON b.id = l.sc_bill_id
       WHERE l.wo_id = $1 AND l.company_id = $2
       ORDER BY l.bill_date ASC NULLS LAST, l.created_at ASC`,
      [req.params.woId, CID(req)]
    );
    const logIds = logRes.rows.map(r => r.id);
    let linesByLog = new Map();
    if (logIds.length) {
      const linesRes = await query(
        `SELECT * FROM wo_hire_log_lines WHERE log_id = ANY($1::uuid[])`,
        [logIds]
      );
      for (const ln of linesRes.rows) {
        if (!linesByLog.has(ln.log_id)) linesByLog.set(ln.log_id, []);
        linesByLog.get(ln.log_id).push(ln);
      }
    }
    const entries = logRes.rows.map(l => ({ ...l, lines: linesByLog.get(l.id) || [] }));

    // Totals per item across all entries
    const totals = {};
    for (const e of entries) {
      for (const ln of e.lines) {
        if (!totals[ln.wo_item_id]) totals[ln.wo_item_id] = { invoice_hours: 0, certified_hours: 0 };
        totals[ln.wo_item_id].invoice_hours += parseFloat(ln.invoice_hours || 0);
        totals[ln.wo_item_id].certified_hours += parseFloat(ln.certified_hours || 0);
      }
    }

    res.json({ data: { wo: woRes.rows[0], equipmentGroups, entries, totals } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /hire-log/:woId — add a new bill row
router.post('/:woId', authorize(...PLANNER), async (req, res) => {
  try {
    const { bill_no, bill_month, bill_date, lines } = req.body;
    if (!Array.isArray(lines) || !lines.length) return res.status(400).json({ error: 'At least one line is required' });

    const result = await withTransaction(async (client) => {
      const logRes = await client.query(
        `INSERT INTO wo_hire_log (company_id, wo_id, bill_no, bill_month, bill_date, created_by)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
        [CID(req), req.params.woId, bill_no || null, bill_month || null, bill_date || null, req.user.id]
      );
      const log = logRes.rows[0];

      for (const ln of lines) {
        if (!ln.wo_item_id) continue;
        const inv = parseFloat(ln.invoice_hours || 0);
        const cert = parseFloat(ln.certified_hours || 0);
        if (!inv && !cert) continue;
        await client.query(
          `INSERT INTO wo_hire_log_lines (log_id, wo_item_id, invoice_hours, certified_hours) VALUES ($1,$2,$3,$4)`,
          [log.id, ln.wo_item_id, inv, cert]
        );
      }
      return log;
    });

    res.status(201).json({ data: result });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PATCH /hire-log/:woId/:entryId — edit a draft row
router.patch('/:woId/:entryId', authorize(...PLANNER), async (req, res) => {
  try {
    const existing = await query(`SELECT status FROM wo_hire_log WHERE id=$1 AND wo_id=$2 AND company_id=$3`,
      [req.params.entryId, req.params.woId, CID(req)]);
    if (!existing.rows.length) return res.status(404).json({ error: 'Entry not found' });
    if (existing.rows[0].status === 'billed') return res.status(400).json({ error: 'Cannot edit — already billed' });

    const { bill_no, bill_month, bill_date, lines } = req.body;
    await withTransaction(async (client) => {
      await client.query(
        `UPDATE wo_hire_log SET bill_no=$1, bill_month=$2, bill_date=$3, updated_at=NOW() WHERE id=$4`,
        [bill_no || null, bill_month || null, bill_date || null, req.params.entryId]
      );
      if (Array.isArray(lines)) {
        await client.query(`DELETE FROM wo_hire_log_lines WHERE log_id=$1`, [req.params.entryId]);
        for (const ln of lines) {
          if (!ln.wo_item_id) continue;
          const inv = parseFloat(ln.invoice_hours || 0);
          const cert = parseFloat(ln.certified_hours || 0);
          if (!inv && !cert) continue;
          await client.query(
            `INSERT INTO wo_hire_log_lines (log_id, wo_item_id, invoice_hours, certified_hours) VALUES ($1,$2,$3,$4)`,
            [req.params.entryId, ln.wo_item_id, inv, cert]
          );
        }
      }
    });
    res.json({ message: 'Updated' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE /hire-log/:woId/:entryId
router.delete('/:woId/:entryId', authorize(...PLANNER), async (req, res) => {
  try {
    const existing = await query(`SELECT status FROM wo_hire_log WHERE id=$1 AND wo_id=$2 AND company_id=$3`,
      [req.params.entryId, req.params.woId, CID(req)]);
    if (!existing.rows.length) return res.status(404).json({ error: 'Entry not found' });
    if (existing.rows[0].status === 'billed') return res.status(400).json({ error: 'Cannot delete — already billed' });
    await query(`DELETE FROM wo_hire_log WHERE id=$1`, [req.params.entryId]);
    res.json({ message: 'Deleted' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PATCH /hire-log/:woId/:entryId/mark-billed — link a tracker row to the sc_bill created from it
router.patch('/:woId/:entryId/mark-billed', authorize(...PLANNER), async (req, res) => {
  try {
    const { sc_bill_id } = req.body;
    if (!sc_bill_id) return res.status(400).json({ error: 'sc_bill_id required' });
    const r = await query(
      `UPDATE wo_hire_log SET status='billed', sc_bill_id=$1, updated_at=NOW()
       WHERE id=$2 AND wo_id=$3 AND company_id=$4 RETURNING *`,
      [sc_bill_id, req.params.entryId, req.params.woId, CID(req)]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Entry not found' });
    res.json({ data: r.rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PATCH /hire-log/:woId/items/:itemId/categorize — tag a wo_item with equipment_group/usage_category
router.patch('/:woId/items/:itemId/categorize', authorize(...PLANNER), async (req, res) => {
  try {
    const { equipment_group, usage_category, category_order } = req.body;
    const r = await query(
      `UPDATE sc_wo_items SET equipment_group=$1, usage_category=$2, category_order=$3
       WHERE id=$4 AND wo_id=$5 RETURNING *`,
      [equipment_group || null, usage_category || null, category_order || 0, req.params.itemId, req.params.woId]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Item not found' });
    res.json({ data: r.rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
