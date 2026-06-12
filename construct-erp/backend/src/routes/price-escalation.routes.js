// src/routes/price-escalation.routes.js — Price Escalation Tracker
// Per-supplier-invoice rate-variation records (RMC / Steel / other), grouped by RA bill.
const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const { query } = require('../config/database');
const { runSchemaInit } = require('../utils/schemaInit');
router.use(authenticate);

const ensureTable = async () => {
  await query(`
    CREATE TABLE IF NOT EXISTS price_escalations (
      id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id     UUID,
      project_id     UUID REFERENCES projects(id) ON DELETE CASCADE,
      ra_no          VARCHAR(40),
      esc_type       VARCHAR(20)  NOT NULL DEFAULT 'rmc',  -- rmc | steel | other
      material       VARCHAR(60),                          -- M10/M30 grade or 8MM/12MM dia
      supplier       VARCHAR(200),
      invoice_no     VARCHAR(100),
      invoice_date   DATE,
      unit           VARCHAR(20),                          -- Cum | MT
      received_qty   NUMERIC(15,3) DEFAULT 0,
      consumed_qty   NUMERIC(15,3) DEFAULT 0,
      base_rate      NUMERIC(15,2) DEFAULT 0,
      approved_rate  NUMERIC(15,2) DEFAULT 0,
      purchase_rate  NUMERIC(15,2) DEFAULT 0,
      rate_diff      NUMERIC(15,2) DEFAULT 0,               -- effective per-unit variation
      amount         NUMERIC(15,2) DEFAULT 0,               -- consumed_qty * rate_diff
      remarks        TEXT,
      created_by     UUID,
      created_at     TIMESTAMPTZ DEFAULT NOW(),
      updated_at     TIMESTAMPTZ DEFAULT NOW()
    )`);
  await query(`CREATE INDEX IF NOT EXISTS idx_price_esc_project ON price_escalations(project_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_price_esc_ra ON price_escalations(project_id, ra_no)`);
};
runSchemaInit('price_escalations', ensureTable);

// GET / — list (filters: project_id, ra_no, esc_type)
router.get('/', async (req, res) => {
  try {
    const { project_id, ra_no, esc_type } = req.query;
    const params = [req.user.company_id];
    let sql = `
      SELECT pe.*, p.name AS project_name, u.name AS created_by_name
      FROM price_escalations pe
      LEFT JOIN projects p ON p.id = pe.project_id
      LEFT JOIN users u ON u.id = pe.created_by
      WHERE (pe.company_id = $1 OR pe.company_id IS NULL)`;
    let i = 2;
    if (project_id) { sql += ` AND pe.project_id = $${i++}`; params.push(project_id); }
    if (ra_no)      { sql += ` AND pe.ra_no = $${i++}`;      params.push(ra_no); }
    if (esc_type)   { sql += ` AND pe.esc_type = $${i++}`;   params.push(esc_type); }
    sql += ` ORDER BY pe.esc_type, pe.invoice_date NULLS LAST, pe.created_at`;
    const { rows } = await query(sql, params);
    res.json({ data: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /stats — totals (optional ?project_id= & ?ra_no=)
router.get('/stats', async (req, res) => {
  try {
    const { project_id, ra_no } = req.query;
    const params = [req.user.company_id];
    let where = 'WHERE (company_id = $1 OR company_id IS NULL)';
    let i = 2;
    if (project_id) { where += ` AND project_id = $${i++}`; params.push(project_id); }
    if (ra_no)      { where += ` AND ra_no = $${i++}`;      params.push(ra_no); }
    const { rows } = await query(`
      SELECT
        COALESCE(SUM(amount),0)                                          AS net_escalation,
        COALESCE(SUM(CASE WHEN esc_type='rmc'   THEN amount ELSE 0 END),0) AS rmc_total,
        COALESCE(SUM(CASE WHEN esc_type='steel' THEN amount ELSE 0 END),0) AS steel_total,
        COALESCE(SUM(CASE WHEN esc_type NOT IN('rmc','steel') THEN amount ELSE 0 END),0) AS other_total,
        COUNT(*)                                                         AS line_count
      FROM price_escalations ${where}`, params);
    res.json({ data: rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

const rolesWrite = ['super_admin','admin','finance_manager','accountant','qs_engineer','billing_engineer','project_manager','contracts_manager'];

// POST / — create one line
router.post('/', authorize(...rolesWrite), async (req, res) => {
  try {
    const b = req.body;
    const consumed = parseFloat(b.consumed_qty || 0);
    const diff = b.rate_diff !== undefined ? parseFloat(b.rate_diff)
               : parseFloat(b.approved_rate || 0) - parseFloat(b.base_rate || 0);
    const amount = b.amount !== undefined ? parseFloat(b.amount) : consumed * diff;
    const { rows } = await query(`
      INSERT INTO price_escalations
        (company_id, project_id, ra_no, esc_type, material, supplier, invoice_no, invoice_date,
         unit, received_qty, consumed_qty, base_rate, approved_rate, purchase_rate, rate_diff, amount, remarks, created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) RETURNING *`,
      [req.user.company_id, b.project_id || null, b.ra_no || null, b.esc_type || 'rmc', b.material || null,
       b.supplier || null, b.invoice_no || null, b.invoice_date || null, b.unit || null,
       parseFloat(b.received_qty || 0), consumed, parseFloat(b.base_rate || 0),
       parseFloat(b.approved_rate || 0), parseFloat(b.purchase_rate || 0), diff, amount, b.remarks || null, req.user.id]);
    res.status(201).json({ data: rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /bulk — create many lines in one call (used for RA-sheet import)
router.post('/bulk', authorize(...rolesWrite), async (req, res) => {
  try {
    const { lines = [] } = req.body;
    if (!Array.isArray(lines) || !lines.length) return res.status(400).json({ error: 'No lines provided.' });
    let inserted = 0;
    for (const b of lines) {
      const consumed = parseFloat(b.consumed_qty || 0);
      const diff = b.rate_diff !== undefined ? parseFloat(b.rate_diff)
                 : parseFloat(b.approved_rate || 0) - parseFloat(b.base_rate || 0);
      const amount = b.amount !== undefined ? parseFloat(b.amount) : consumed * diff;
      await query(`
        INSERT INTO price_escalations
          (company_id, project_id, ra_no, esc_type, material, supplier, invoice_no, invoice_date,
           unit, received_qty, consumed_qty, base_rate, approved_rate, purchase_rate, rate_diff, amount, remarks, created_by)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
        [req.user.company_id, b.project_id || null, b.ra_no || null, b.esc_type || 'rmc', b.material || null,
         b.supplier || null, b.invoice_no || null, b.invoice_date || null, b.unit || null,
         parseFloat(b.received_qty || 0), consumed, parseFloat(b.base_rate || 0),
         parseFloat(b.approved_rate || 0), parseFloat(b.purchase_rate || 0), diff, amount, b.remarks || null, req.user.id]);
      inserted++;
    }
    res.status(201).json({ data: { inserted } });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /:id
router.put('/:id', authorize(...rolesWrite), async (req, res) => {
  try {
    const fields = ['ra_no','esc_type','material','supplier','invoice_no','invoice_date','unit',
      'received_qty','consumed_qty','base_rate','approved_rate','purchase_rate','rate_diff','amount','remarks'];
    const updates = []; const params = []; let i = 1;
    for (const f of fields) {
      if (req.body[f] !== undefined) { updates.push(`${f} = $${i++}`); params.push(req.body[f]); }
    }
    if (!updates.length) return res.status(400).json({ error: 'No fields to update.' });
    params.push(req.params.id, req.user.company_id);
    const { rows } = await query(
      `UPDATE price_escalations SET ${updates.join(', ')}, updated_at = NOW()
       WHERE id = $${i++} AND (company_id = $${i} OR company_id IS NULL) RETURNING *`, params);
    if (!rows[0]) return res.status(404).json({ error: 'Not found.' });
    res.json({ data: rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /:id
router.delete('/:id', authorize('super_admin','admin','finance_manager','qs_engineer','project_manager'), async (req, res) => {
  try {
    const { rowCount } = await query(
      `DELETE FROM price_escalations WHERE id = $1 AND (company_id = $2 OR company_id IS NULL)`,
      [req.params.id, req.user.company_id]);
    if (!rowCount) return res.status(404).json({ error: 'Not found.' });
    res.json({ message: 'Deleted.' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
