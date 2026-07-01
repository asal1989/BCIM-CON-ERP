// src/routes/ewayBill.routes.js — E-Way Bill tracking (inter-state stock transfer)
const express = require('express');
const router  = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const { query } = require('../config/database');
const { runSchemaInit } = require('../utils/schemaInit');

// Public verification endpoint (no auth — QR scan)
router.get('/public/verify/:id', async (req, res) => {
  try {
    const result = await query(
      `SELECT e.*, p.name AS project_name, p.project_code
       FROM eway_bills e
       LEFT JOIN projects p ON e.project_id = p.id
       WHERE e.id = $1`, [req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'E-Way Bill not found' });
    res.json({ data: result.rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.use(authenticate);
const CID = req => req.user.company_id;

const WRITE_ROLES = ['super_admin','admin','accountant','procurement_manager','project_manager','site_engineer','qs_engineer'];

// ── Schema ────────────────────────────────────────────────────────────────────
runSchemaInit('eway_bills_table', async () => {
  await query(`
    CREATE TABLE IF NOT EXISTS eway_bills (
      id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id            UUID NOT NULL,
      project_id            UUID REFERENCES projects(id),
      ewb_no                VARCHAR(30) NOT NULL,
      ewb_date              DATE NOT NULL,
      valid_until           DATE NOT NULL,
      transaction_type      VARCHAR(40) DEFAULT 'Stock Transfer',
      sub_type              VARCHAR(40) DEFAULT 'Branch Transfer',
      doc_type              VARCHAR(40) DEFAULT 'Delivery Challan',
      doc_no                VARCHAR(50),
      doc_date              DATE,
      from_gstin            VARCHAR(15),
      from_name             VARCHAR(200),
      from_address          TEXT,
      from_city             VARCHAR(100),
      from_state            VARCHAR(50),
      from_pincode          VARCHAR(10),
      to_gstin              VARCHAR(15),
      to_name               VARCHAR(200),
      to_address            TEXT,
      to_city               VARCHAR(100),
      to_state              VARCHAR(50),
      to_pincode            VARCHAR(10),
      transport_mode        VARCHAR(20) DEFAULT 'Road',
      vehicle_no            VARCHAR(20),
      transporter_name      VARCHAR(200),
      transporter_gstin     VARCHAR(15),
      distance_km           INTEGER,
      total_taxable_value   NUMERIC(14,2) DEFAULT 0,
      total_igst            NUMERIC(14,2) DEFAULT 0,
      total_value           NUMERIC(14,2) DEFAULT 0,
      items                 JSONB DEFAULT '[]',
      status                VARCHAR(20) DEFAULT 'active'
                              CHECK (status IN ('active','cancelled','expired')),
      remarks               TEXT,
      created_by            UUID REFERENCES users(id),
      created_at            TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_ewb_company ON eway_bills(company_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_ewb_status  ON eway_bills(status)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_ewb_date    ON eway_bills(ewb_date)`);
});

// ── GET /eway-bills ───────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { status, project_id, from_date, to_date, search } = req.query;
    const params = [CID(req)];
    const wheres = ['e.company_id = $1'];

    if (status)     { params.push(status);      wheres.push(`e.status = $${params.length}`); }
    if (project_id) { params.push(project_id);  wheres.push(`e.project_id = $${params.length}`); }
    if (from_date)  { params.push(from_date);   wheres.push(`e.ewb_date >= $${params.length}`); }
    if (to_date)    { params.push(to_date);      wheres.push(`e.ewb_date <= $${params.length}`); }
    if (search) {
      params.push(`%${search}%`);
      wheres.push(`(e.ewb_no ILIKE $${params.length} OR e.vehicle_no ILIKE $${params.length} OR e.from_name ILIKE $${params.length} OR e.to_name ILIKE $${params.length})`);
    }

    const rows = await query(`
      SELECT e.*,
             p.name AS project_name,
             u.full_name AS created_by_name
      FROM   eway_bills e
      LEFT JOIN projects p ON p.id = e.project_id
      LEFT JOIN users    u ON u.id = e.created_by
      WHERE  ${wheres.join(' AND ')}
      ORDER  BY e.ewb_date DESC, e.created_at DESC
    `, params);

    res.json({ data: rows.rows });
  } catch (err) {
    console.error('[eway-bills] list error', err);
    res.status(500).json({ error: 'Failed to fetch e-way bills' });
  }
});

// ── GET /eway-bills/:id ───────────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const { rows } = await query(`
      SELECT e.*,
             p.name AS project_name,
             u.full_name AS created_by_name
      FROM   eway_bills e
      LEFT JOIN projects p ON p.id = e.project_id
      LEFT JOIN users    u ON u.id = e.created_by
      WHERE  e.id = $1 AND e.company_id = $2
    `, [req.params.id, CID(req)]);

    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json({ data: rows[0] });
  } catch (err) {
    console.error('[eway-bills] get error', err);
    res.status(500).json({ error: 'Failed to fetch e-way bill' });
  }
});

// ── POST /eway-bills ──────────────────────────────────────────────────────────
router.post('/', authorize(...WRITE_ROLES), async (req, res) => {
  try {
    const {
      ewb_no, ewb_date, valid_until,
      transaction_type, sub_type, doc_type, doc_no, doc_date,
      from_gstin, from_name, from_address, from_city, from_state, from_pincode,
      to_gstin, to_name, to_address, to_city, to_state, to_pincode,
      transport_mode, vehicle_no, transporter_name, transporter_gstin, distance_km,
      items = [], status = 'active', remarks, project_id,
    } = req.body;

    if (!ewb_no)    return res.status(400).json({ error: 'E-Way Bill number is required' });
    if (!/^\d{12}$/.test(ewb_no.trim())) return res.status(400).json({ error: 'E-Way Bill number must be exactly 12 digits' });
    if (!ewb_date)  return res.status(400).json({ error: 'Date is required' });
    if (!valid_until) return res.status(400).json({ error: 'Valid Until date is required' });
    if (!items.length) return res.status(400).json({ error: 'At least one item is required' });

    const total_taxable_value = items.reduce((s, i) => s + (Number(i.taxable_value) || 0), 0);
    const total_igst          = items.reduce((s, i) => s + (Number(i.igst_amount)   || 0), 0);
    const total_value         = total_taxable_value + total_igst;

    const { rows } = await query(`
      INSERT INTO eway_bills (
        company_id, project_id, ewb_no, ewb_date, valid_until,
        transaction_type, sub_type, doc_type, doc_no, doc_date,
        from_gstin, from_name, from_address, from_city, from_state, from_pincode,
        to_gstin, to_name, to_address, to_city, to_state, to_pincode,
        transport_mode, vehicle_no, transporter_name, transporter_gstin, distance_km,
        total_taxable_value, total_igst, total_value,
        items, status, remarks, created_by
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
        $11,$12,$13,$14,$15,$16,
        $17,$18,$19,$20,$21,$22,
        $23,$24,$25,$26,$27,
        $28,$29,$30,
        $31,$32,$33,$34
      ) RETURNING *
    `, [
      CID(req), project_id || null, ewb_no.trim(), ewb_date, valid_until,
      transaction_type || 'Stock Transfer', sub_type || 'Branch Transfer',
      doc_type || 'Delivery Challan', doc_no || null, doc_date || null,
      from_gstin || null, from_name || null, from_address || null, from_city || null, from_state || null, from_pincode || null,
      to_gstin || null, to_name || null, to_address || null, to_city || null, to_state || null, to_pincode || null,
      transport_mode || 'Road', vehicle_no || null, transporter_name || null, transporter_gstin || null, distance_km || null,
      total_taxable_value, total_igst, total_value,
      JSON.stringify(items), status, remarks || null, req.user.id,
    ]);

    res.status(201).json({ data: rows[0] });
  } catch (err) {
    console.error('[eway-bills] create error', err);
    res.status(500).json({ error: 'Failed to create e-way bill' });
  }
});

// ── PATCH /eway-bills/:id/cancel ──────────────────────────────────────────────
router.patch('/:id/cancel', authorize(...WRITE_ROLES), async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT id, status FROM eway_bills WHERE id = $1 AND company_id = $2`,
      [req.params.id, CID(req)]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    if (rows[0].status === 'cancelled') return res.status(400).json({ error: 'Already cancelled' });

    const { rows: updated } = await query(
      `UPDATE eway_bills SET status = 'cancelled' WHERE id = $1 RETURNING *`,
      [req.params.id]
    );
    res.json({ data: updated[0] });
  } catch (err) {
    console.error('[eway-bills] cancel error', err);
    res.status(500).json({ error: 'Failed to cancel e-way bill' });
  }
});

module.exports = router;
