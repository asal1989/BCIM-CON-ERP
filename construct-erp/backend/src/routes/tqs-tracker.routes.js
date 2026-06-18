const express = require('express');
const router = express.Router();
const { query } = require('../config/database');
const { authenticate } = require('../middleware/auth');
const { runSchemaInit } = require('../utils/schemaInit');

router.use(authenticate);

// ── Table creation ────────────────────────────────────────────────────────────
async function ensureTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS tqs_material_tracker (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id UUID,
      project_id UUID REFERENCES projects(id),
      tracker_no TEXT UNIQUE,

      -- Stage I: Material Request
      mr_date DATE,
      material_head TEXT,
      material_description TEXT,
      unit TEXT,
      required_qty NUMERIC(14,3),
      pm_certification_date DATE,
      qs_certification_date DATE,

      -- Stage II: Purchase Order
      vendor_name TEXT,
      po_number TEXT,
      po_date DATE,
      ordered_qty NUMERIC(14,3),
      unit_price NUMERIC(14,2),
      basic_value NUMERIC(14,2),
      gst_amount NUMERIC(14,2) DEFAULT 0,
      total_po_value NUMERIC(14,2),

      -- Stage III: Material Receipt (Store)
      supplier_invoice_no TEXT,
      supplier_invoice_date DATE,
      supplier_invoice_qty NUMERIC(14,3),
      material_received_qty NUMERIC(14,3),
      invoice_forwarded_ho_date DATE,

      -- Stage IV: QS Certification
      invoice_received_qs_date DATE,
      qty_certified_qs NUMERIC(14,3),
      basic_certified_amount NUMERIC(14,2),
      mob_advance NUMERIC(14,2) DEFAULT 0,
      tds_deduction NUMERIC(14,2) DEFAULT 0,
      retention NUMERIC(14,2) DEFAULT 0,
      total_certified_amount NUMERIC(14,2),
      certified_to_accounts_date DATE,

      -- Meta
      current_stage TEXT DEFAULT 'I',
      remarks TEXT,
      created_by UUID,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
}

async function ensureTrackerSchema() {
  await ensureTable();

// ── Migrations: add any missing columns from older table versions ──────────────
  const alts = [
    `ALTER TABLE tqs_material_tracker ADD COLUMN IF NOT EXISTS company_id UUID`,
    `ALTER TABLE tqs_material_tracker ADD COLUMN IF NOT EXISTS mr_date DATE`,
    `ALTER TABLE tqs_material_tracker ADD COLUMN IF NOT EXISTS material_head TEXT`,
    `ALTER TABLE tqs_material_tracker ADD COLUMN IF NOT EXISTS required_qty NUMERIC(14,3)`,
    `ALTER TABLE tqs_material_tracker ADD COLUMN IF NOT EXISTS pm_certification_date DATE`,
    `ALTER TABLE tqs_material_tracker ADD COLUMN IF NOT EXISTS qs_certification_date DATE`,
    `ALTER TABLE tqs_material_tracker ADD COLUMN IF NOT EXISTS po_date DATE`,
    `ALTER TABLE tqs_material_tracker ADD COLUMN IF NOT EXISTS ordered_qty NUMERIC(14,3)`,
    `ALTER TABLE tqs_material_tracker ADD COLUMN IF NOT EXISTS unit_price NUMERIC(14,2)`,
    `ALTER TABLE tqs_material_tracker ADD COLUMN IF NOT EXISTS basic_value NUMERIC(14,2)`,
    `ALTER TABLE tqs_material_tracker ADD COLUMN IF NOT EXISTS gst_amount NUMERIC(14,2) DEFAULT 0`,
    `ALTER TABLE tqs_material_tracker ADD COLUMN IF NOT EXISTS total_po_value NUMERIC(14,2)`,
    `ALTER TABLE tqs_material_tracker ADD COLUMN IF NOT EXISTS supplier_invoice_no TEXT`,
    `ALTER TABLE tqs_material_tracker ADD COLUMN IF NOT EXISTS supplier_invoice_date DATE`,
    `ALTER TABLE tqs_material_tracker ADD COLUMN IF NOT EXISTS supplier_invoice_qty NUMERIC(14,3)`,
    `ALTER TABLE tqs_material_tracker ADD COLUMN IF NOT EXISTS material_received_qty NUMERIC(14,3)`,
    `ALTER TABLE tqs_material_tracker ADD COLUMN IF NOT EXISTS invoice_forwarded_ho_date DATE`,
    `ALTER TABLE tqs_material_tracker ADD COLUMN IF NOT EXISTS invoice_received_qs_date DATE`,
    `ALTER TABLE tqs_material_tracker ADD COLUMN IF NOT EXISTS qty_certified_qs NUMERIC(14,3)`,
    `ALTER TABLE tqs_material_tracker ADD COLUMN IF NOT EXISTS basic_certified_amount NUMERIC(14,2)`,
    `ALTER TABLE tqs_material_tracker ADD COLUMN IF NOT EXISTS mob_advance NUMERIC(14,2) DEFAULT 0`,
    `ALTER TABLE tqs_material_tracker ADD COLUMN IF NOT EXISTS total_certified_amount NUMERIC(14,2)`,
    `ALTER TABLE tqs_material_tracker ADD COLUMN IF NOT EXISTS certified_to_accounts_date DATE`,
    `ALTER TABLE tqs_material_tracker ADD COLUMN IF NOT EXISTS current_stage TEXT DEFAULT 'I'`,
  ];
  for (const s of alts) { try { await query(s); } catch(e) { /* column may already exist */ } }
  // Backfill company_id from linked project
  try {
    await query(`
      UPDATE tqs_material_tracker t SET company_id = p.company_id
      FROM projects p WHERE t.project_id = p.id AND t.company_id IS NULL
    `);
  } catch(e) {}
}
runSchemaInit('tqs_material_tracker', ensureTrackerSchema);

// ── Auto-number ───────────────────────────────────────────────────────────────
async function nextTrackerNo() {
  // MAX-based so a deleted tracker row never causes the next number to collide
  const yr = new Date().getFullYear();
  const { rows } = await query(
    `SELECT COALESCE(MAX(CAST(REGEXP_REPLACE(tracker_no, '^.*-', '') AS INTEGER)), 0) AS last_seq
     FROM tqs_material_tracker WHERE tracker_no LIKE $1`,
    [`MT-${yr}-%`]
  );
  const n = parseInt(rows[0].last_seq, 10) + 1;
  return `MT-${yr}-${String(n).padStart(4, '0')}`;
}

// ── Fields allowed for insert/update ─────────────────────────────────────────
const ALLOWED_FIELDS = [
  'project_id', 'mr_date', 'material_head', 'material_description', 'unit', 'required_qty',
  'pm_certification_date', 'qs_certification_date',
  'vendor_name', 'po_number', 'po_date', 'ordered_qty', 'unit_price',
  'basic_value', 'gst_amount', 'total_po_value',
  'supplier_invoice_no', 'supplier_invoice_date', 'supplier_invoice_qty',
  'material_received_qty', 'invoice_forwarded_ho_date',
  'invoice_received_qs_date', 'qty_certified_qs', 'basic_certified_amount',
  'mob_advance', 'tds_deduction', 'retention', 'total_certified_amount',
  'certified_to_accounts_date', 'current_stage', 'remarks',
];

// ── GET /tqs/material-tracker ─────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { project_id, stage, search } = req.query;
    const conditions = [`t.company_id = $1`];
    const vals = [req.user.company_id];
    let i = 2;
    if (project_id) { conditions.push(`t.project_id = $${i++}`); vals.push(project_id); }
    if (stage)      { conditions.push(`t.current_stage = $${i++}`); vals.push(stage); }
    if (search) {
      conditions.push(`(t.material_description ILIKE $${i} OR t.tracker_no ILIKE $${i} OR t.vendor_name ILIKE $${i} OR t.po_number ILIKE $${i} OR t.material_head ILIKE $${i})`);
      vals.push(`%${search}%`); i++;
    }
    const { rows } = await query(
      `SELECT t.*, p.name AS project_name
       FROM tqs_material_tracker t
       LEFT JOIN projects p ON p.id = t.project_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY t.created_at DESC`,
      vals
    );
    res.json({ data: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /tqs/material-tracker/lifecycle (live cross-module view) ──────────────
router.get('/lifecycle', async (req, res) => {
  try {
    const { project_id, search } = req.query;
    const conditions = [`p.company_id = $1`];
    const vals = [req.user.company_id];
    let i = 2;
    if (project_id) { conditions.push(`mr.project_id = $${i++}`); vals.push(project_id); }
    if (search) {
      conditions.push(`(mi.material_name ILIKE $${i} OR mr.serial_no_formatted ILIKE $${i} OR po.po_number ILIKE $${i} OR v.name ILIKE $${i} OR b.inv_number ILIKE $${i})`);
      vals.push(`%${search}%`); i++;
    }
    const where = 'WHERE ' + conditions.join(' AND ');
    const { rows } = await query(`
      SELECT
        mr.id AS mrs_id, mr.serial_no_formatted AS mr_number, mr.status AS mr_status,
        mr.created_at AS mr_date, mr.required_by, mr.priority,
        mi.id AS item_id, mi.material_name, mi.quantity AS mr_qty, mi.unit, mi.purpose,
        p.id AS project_id, p.name AS project_name, p.project_code,
        po.id AS po_id, po.po_number, po.status AS po_status, po.grand_total AS po_value, po.po_date,
        v.name AS vendor_name,
        g.id AS grn_id, g.grn_number, g.quality_status AS grn_status, g.grn_date,
        b.id AS bill_id, b.inv_number AS invoice_number, b.inv_date AS invoice_date,
        b.total_amount AS invoice_amount, b.workflow_status AS invoice_status,
        CASE
          WHEN b.id IS NOT NULL AND b.workflow_status IN ('qs','procurement','accounts','paid') THEN 'invoice_authorized'
          WHEN b.id IS NOT NULL THEN 'invoiced'
          WHEN g.id IS NOT NULL AND g.quality_status = 'approved' THEN 'grn_approved'
          WHEN g.id IS NOT NULL THEN 'grn_pending'
          WHEN po.id IS NOT NULL AND po.status = 'approved' THEN 'po_approved'
          WHEN po.id IS NOT NULL THEN 'po_pending'
          WHEN mr.status IN ('approved_md','issued') THEN 'mr_approved'
          ELSE 'mr_pending'
        END AS lifecycle_stage
      FROM material_requisitions mr
      JOIN projects p ON p.id = mr.project_id
      JOIN mrs_items mi ON mi.mrs_id = mr.id
      LEFT JOIN po_items poi ON poi.material_name = mi.material_name
                             AND poi.po_id IN (SELECT po2.id FROM purchase_orders po2 WHERE po2.project_id = mr.project_id)
      LEFT JOIN purchase_orders po ON po.id = poi.po_id
      LEFT JOIN vendors v ON v.id = po.vendor_id
      LEFT JOIN grn_items gi ON gi.material_name = mi.material_name
                             AND gi.grn_id IN (SELECT g2.id FROM grn g2 WHERE g2.project_id = mr.project_id AND (g2.po_id = po.id OR g2.po_id IS NULL))
      LEFT JOIN grn g ON g.id = gi.grn_id
      LEFT JOIN tqs_bills b ON b.po_number = po.po_number
                            AND b.project_id = mr.project_id
                            AND b.company_id = p.company_id
                            AND b.is_deleted = FALSE
      ${where}
      ORDER BY mr.created_at DESC, mi.sort_order
    `, vals);
    res.json({ data: rows });
  } catch (err) {
    console.error('[lifecycle]', err);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /tqs/material-tracker ────────────────────────────────────────────────
router.post('/', async (req, res) => {
  try {
    const tracker_no = await nextTrackerNo();
    const cols = ['tracker_no', 'company_id', 'created_by'];
    const placeholders = ['$1', '$2', '$3'];
    const vals = [tracker_no, req.user.company_id, req.user.id];
    let i = 4;
    for (const f of ALLOWED_FIELDS) {
      if (req.body[f] !== undefined && req.body[f] !== '') {
        cols.push(f);
        placeholders.push(`$${i++}`);
        vals.push(req.body[f]);
      }
    }
    const { rows } = await query(
      `INSERT INTO tqs_material_tracker (${cols.join(',')}) VALUES (${placeholders.join(',')}) RETURNING *`,
      vals
    );
    res.status(201).json({ data: rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ── PUT /tqs/material-tracker/:id ────────────────────────────────────────────
router.put('/:id', async (req, res) => {
  try {
    const check = await query(
      `SELECT id FROM tqs_material_tracker WHERE id = $1 AND company_id = $2`,
      [req.params.id, req.user.company_id]
    );
    if (!check.rows.length) return res.status(404).json({ error: 'Not found' });

    const sets = [];
    const vals = [];
    let i = 1;
    for (const key of ALLOWED_FIELDS) {
      if (req.body[key] !== undefined) {
        sets.push(`${key} = $${i++}`);
        vals.push(req.body[key] === '' ? null : req.body[key]);
      }
    }
    if (!sets.length) return res.status(400).json({ error: 'No fields to update' });
    sets.push(`updated_at = NOW()`);
    vals.push(req.params.id);
    const { rows } = await query(
      `UPDATE tqs_material_tracker SET ${sets.join(', ')} WHERE id = $${i} RETURNING *`,
      vals
    );
    res.json({ data: rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /tqs/material-tracker/:id ─────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    const result = await query(
      `DELETE FROM tqs_material_tracker WHERE id = $1 AND company_id = $2 RETURNING id`,
      [req.params.id, req.user.company_id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Not found or access denied' });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
