const express = require('express');
const router = express.Router();
const { query, withTransaction } = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');
const { loadProjectScope, userCanAccessProject } = require('../middleware/projectScope');
const { runSchemaInit } = require('../utils/schemaInit');
const { postAutoJournal, postAutoJournalStandalone } = require('../services/journalAutoPost');
const { notifyAdvanceCreated, notifyAdvanceProcurementApproved } = require('../services/notif.helper');

// Public verification endpoint (no auth — QR scan)
router.get('/public/verify/:id', async (req, res) => {
  try {
    const result = await query(
      `SELECT av.*, v.name AS vendor_name, p.name AS project_name, p.project_code,
              u.name AS created_by_name
       FROM tqs_advance_vouchers av
       LEFT JOIN vendors v ON av.vendor_id = v.id
       LEFT JOIN projects p ON av.project_id = p.id
       LEFT JOIN users u ON av.created_by = u.id
       WHERE av.id = $1`, [req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Advance Voucher not found' });
    res.json({ data: result.rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.use(authenticate);
router.use(loadProjectScope);

function applyProjectScope(req, wheres, params, alias = 'av', requestedProjectId = null) {
  if (requestedProjectId && String(requestedProjectId).trim()) {
    if (!userCanAccessProject(req, requestedProjectId)) {
      const err = new Error('Access denied for this project.');
      err.statusCode = 403;
      throw err;
    }
    params.push(requestedProjectId);
    wheres.push(`${alias}.project_id=$${params.length}`);
    return;
  }
  if (req.isGlobalRole) return;
  const allowed = req.allowedProjectIds || [];
  if (allowed.length === 0) {
    wheres.push('FALSE');
    return;
  }
  params.push(allowed);
  wheres.push(`${alias}.project_id = ANY($${params.length}::uuid[])`);
}

// ── Table creation ────────────────────────────────────────────────────────────
async function ensureTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS tqs_advance_vouchers (
      id              SERIAL PRIMARY KEY,
      company_id      UUID,
      project_id      UUID,
      sl_number       VARCHAR(40) UNIQUE,
      vendor_id       UUID,
      vendor_name     TEXT NOT NULL,
      work_desc       TEXT,
      wo_number       TEXT,
      po_number       TEXT,
      po_date         DATE,
      voucher_number  TEXT,
      voucher_date    DATE,
      proforma_invoice_date   DATE,
      proforma_invoice_number TEXT,
      ra_bill_no      TEXT,
      order_value     NUMERIC(15,2) DEFAULT 0,
      variation_value NUMERIC(15,2) DEFAULT 0,
      advance_value   NUMERIC(15,2) NOT NULL DEFAULT 0,
      advance_pct     NUMERIC(5,2)  DEFAULT 0,
      gross_certified_till_date NUMERIC(15,2) DEFAULT 0,
      mobilisation_advance_deduction NUMERIC(15,2) DEFAULT 0,
      retention_deduction NUMERIC(15,2) DEFAULT 0,
      other_deductions NUMERIC(15,2) DEFAULT 0,
      previous_certificates NUMERIC(15,2) DEFAULT 0,
      balance_to_finish NUMERIC(15,2) DEFAULT 0,
      current_net_payment_due NUMERIC(15,2) DEFAULT 0,
      amount_in_words TEXT,
      prepared_by_name TEXT,
      director_name TEXT,
      md_name TEXT,
      qs_handover_date     DATE,
      accts_received_date  DATE,
      status          VARCHAR(20)   NOT NULL DEFAULT 'pending',
      paid_amount     NUMERIC(15,2) DEFAULT 0,
      pay_date        DATE,
      recovered_amount NUMERIC(15,2) DEFAULT 0,
      remarks         TEXT,
      note            TEXT,
      is_deleted      BOOLEAN       DEFAULT FALSE,
      created_by      UUID,
      created_at      TIMESTAMPTZ   DEFAULT NOW(),
      updated_at      TIMESTAMPTZ   DEFAULT NOW()
    )
  `);

  // Add new columns to existing tables (safe — IF NOT EXISTS)
  await query(`ALTER TABLE tqs_advance_vouchers ADD COLUMN IF NOT EXISTS work_desc TEXT`);
  await query(`ALTER TABLE tqs_advance_vouchers ADD COLUMN IF NOT EXISTS proforma_invoice_date DATE`);
  await query(`ALTER TABLE tqs_advance_vouchers ADD COLUMN IF NOT EXISTS proforma_invoice_number TEXT`);
  await query(`ALTER TABLE tqs_advance_vouchers ADD COLUMN IF NOT EXISTS ra_bill_no TEXT`);
  await query(`ALTER TABLE tqs_advance_vouchers ADD COLUMN IF NOT EXISTS variation_value NUMERIC(15,2) DEFAULT 0`);
  await query(`ALTER TABLE tqs_advance_vouchers ADD COLUMN IF NOT EXISTS gross_certified_till_date NUMERIC(15,2) DEFAULT 0`);
  await query(`ALTER TABLE tqs_advance_vouchers ADD COLUMN IF NOT EXISTS mobilisation_advance_deduction NUMERIC(15,2) DEFAULT 0`);
  await query(`ALTER TABLE tqs_advance_vouchers ADD COLUMN IF NOT EXISTS retention_deduction NUMERIC(15,2) DEFAULT 0`);
  await query(`ALTER TABLE tqs_advance_vouchers ADD COLUMN IF NOT EXISTS other_deductions NUMERIC(15,2) DEFAULT 0`);
  await query(`ALTER TABLE tqs_advance_vouchers ADD COLUMN IF NOT EXISTS previous_certificates NUMERIC(15,2) DEFAULT 0`);
  await query(`ALTER TABLE tqs_advance_vouchers ADD COLUMN IF NOT EXISTS balance_to_finish NUMERIC(15,2) DEFAULT 0`);
  await query(`ALTER TABLE tqs_advance_vouchers ADD COLUMN IF NOT EXISTS current_net_payment_due NUMERIC(15,2) DEFAULT 0`);
  await query(`ALTER TABLE tqs_advance_vouchers ADD COLUMN IF NOT EXISTS amount_in_words TEXT`);
  await query(`ALTER TABLE tqs_advance_vouchers ADD COLUMN IF NOT EXISTS prepared_by_name TEXT`);
  await query(`ALTER TABLE tqs_advance_vouchers ADD COLUMN IF NOT EXISTS director_name TEXT`);
  await query(`ALTER TABLE tqs_advance_vouchers ADD COLUMN IF NOT EXISTS md_name TEXT`);
  await query(`ALTER TABLE tqs_advance_vouchers ADD COLUMN IF NOT EXISTS note TEXT`);
  await query(`ALTER TABLE tqs_advance_vouchers ADD COLUMN IF NOT EXISTS terms_conditions TEXT`);
  // ── Approval workflow: Procurement → Managing Director ──────────────────────
  await query(`ALTER TABLE tqs_advance_vouchers ADD COLUMN IF NOT EXISTS approval_status VARCHAR(24) NOT NULL DEFAULT 'pending'`);
  await query(`ALTER TABLE tqs_advance_vouchers ADD COLUMN IF NOT EXISTS procurement_approved_by UUID`);
  await query(`ALTER TABLE tqs_advance_vouchers ADD COLUMN IF NOT EXISTS procurement_approved_at TIMESTAMPTZ`);
  await query(`ALTER TABLE tqs_advance_vouchers ADD COLUMN IF NOT EXISTS md_approved_by UUID`);
  await query(`ALTER TABLE tqs_advance_vouchers ADD COLUMN IF NOT EXISTS md_approved_at TIMESTAMPTZ`);
  await query(`ALTER TABLE tqs_advance_vouchers ADD COLUMN IF NOT EXISTS rejected_by UUID`);
  await query(`ALTER TABLE tqs_advance_vouchers ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMPTZ`);
  await query(`ALTER TABLE tqs_advance_vouchers ADD COLUMN IF NOT EXISTS rejection_reason TEXT`);

  await query(`
    CREATE TABLE IF NOT EXISTS tqs_advance_recoveries (
      id          SERIAL PRIMARY KEY,
      advance_id  INTEGER NOT NULL REFERENCES tqs_advance_vouchers(id) ON DELETE CASCADE,
      bill_id     UUID,
      amount      NUMERIC(15,2) NOT NULL,
      recovery_date DATE NOT NULL,
      notes       TEXT,
      created_by  UUID,
      created_at  TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  // bill_id was originally created as INTEGER, but tqs_bills.id is UUID - the
  // mismatched type made every GET /:id 500 on the LEFT JOIN below. Table has
  // never had any rows with bill_id set, so this is a safe no-op-or-fix ALTER.
  await query(`ALTER TABLE tqs_advance_recoveries ALTER COLUMN bill_id TYPE UUID USING bill_id::text::uuid`);
}

runSchemaInit('tqs_advance_vouchers', ensureTable);

// ── Auto-number ───────────────────────────────────────────────────────────────
async function nextSlNumber() {
  const yr = new Date().getFullYear();
  const { rows } = await query(
    `SELECT COUNT(*) AS cnt FROM tqs_advance_vouchers WHERE sl_number LIKE $1`,
    [`AV-${yr}-%`]
  );
  const n = parseInt(rows[0].cnt, 10) + 1;
  return `AV-${yr}-${String(n).padStart(4, '0')}`;
}

// ── Helper: recalculate and update voucher status after recovery ──────────────
async function syncVoucherStatus(client, advanceId) {
  const { rows } = await client.query(
    `SELECT advance_value, recovered_amount FROM tqs_advance_vouchers WHERE id = $1`,
    [advanceId]
  );
  if (!rows.length) return;
  const { advance_value, recovered_amount } = rows[0];
  const adv = parseFloat(advance_value || 0);
  const rec = parseFloat(recovered_amount || 0);
  let status = 'issued';
  if (rec <= 0)        status = 'issued';
  else if (rec >= adv) status = 'recovered';
  else                 status = 'partial';
  await client.query(
    `UPDATE tqs_advance_vouchers SET status=$1, updated_at=NOW() WHERE id=$2`,
    [status, advanceId]
  );
}

// ── GET /tqs/advances/summary ─────────────────────────────────────────────────
router.get('/summary', async (req, res) => {
  try {
    const { company_id } = req.user;
    const { project_id } = req.query;
    const wheres = [`company_id=$1`, `is_deleted=FALSE`];
    const params = [company_id];
    applyProjectScope(req, wheres, params, 'tqs_advance_vouchers', project_id);
    const { rows } = await query(`
      SELECT
        COUNT(*)                                AS total_vouchers,
        COALESCE(SUM(order_value),0)            AS total_order_value,
        COALESCE(SUM(advance_value),0)          AS total_advance_value,
        COALESCE(SUM(CASE WHEN status IN ('issued','partial','recovered') THEN paid_amount ELSE 0 END),0) AS disbursed,
        COALESCE(SUM(CASE WHEN status='pending' THEN advance_value ELSE 0 END),0) AS pending_disbursement,
        COALESCE(SUM(recovered_amount),0)       AS total_recovered,
        COUNT(CASE WHEN status='pending'   THEN 1 END) AS count_pending,
        COUNT(CASE WHEN status='issued'    THEN 1 END) AS count_issued,
        COUNT(CASE WHEN status='partial'   THEN 1 END) AS count_partial,
        COUNT(CASE WHEN status='recovered' THEN 1 END) AS count_recovered
      FROM tqs_advance_vouchers WHERE ${wheres.join(' AND ')}
    `, params);
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    console.error('advance summary error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── GET /tqs/advances/lookup/vendors ─────────────────────────────────────────
router.get('/lookup/vendors', async (req, res) => {
  try {
    const { company_id } = req.user;
    const { search } = req.query;
    const rows = search
      ? (await query(`SELECT id, name, vendor_code FROM vendors WHERE company_id=$1 AND is_active=TRUE AND name ILIKE $2 ORDER BY name LIMIT 40`, [company_id, `%${search}%`])).rows
      : (await query(`SELECT id, name, vendor_code FROM vendors WHERE company_id=$1 AND is_active=TRUE ORDER BY name LIMIT 100`, [company_id])).rows;
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── GET /tqs/advances/lookup/wos ─────────────────────────────────────────────
router.get('/lookup/wos', async (req, res) => {
  try {
    const { company_id } = req.user;
    const { project_id, vendor_id } = req.query;
    const wheres = [`p.company_id=$1`, `COALESCE(wo.status,'') NOT IN ('cancelled','rejected')`];
    const params = [company_id];
    applyProjectScope(req, wheres, params, 'wo', project_id);
    if (vendor_id && String(vendor_id).trim()) {
      params.push(vendor_id);
      wheres.push(`wo.vendor_id=$${params.length}`);
    }
    const { rows } = await query(`
      SELECT wo.id, wo.wo_number, wo.subject, wo.total_value, wo.wo_date,
             wo.total_value AS basic_value,
             COALESCE(wo.total_value, 0) + COALESCE((
               SELECT SUM(COALESCE(woi.quantity,0) * COALESCE(woi.rate,0) * COALESCE(woi.gst_rate,0) / 100.0)
               FROM work_order_items woi WHERE woi.wo_id = wo.id
             ), 0) AS total_with_tax,
             v.name AS vendor_name, v.id AS vendor_id
      FROM work_orders wo
      LEFT JOIN vendors v ON v.id = wo.vendor_id
      LEFT JOIN projects p ON p.id = wo.project_id
      WHERE ${wheres.join(' AND ')}
      ORDER BY wo.wo_number DESC
      LIMIT 200
    `, params);
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── GET /tqs/advances/lookup/pos ──────────────────────────────────────────────
router.get('/lookup/pos', async (req, res) => {
  try {
    const { company_id } = req.user;
    const { project_id, vendor_id } = req.query;
    const wheres = [`p.company_id=$1`, `COALESCE(po.status,'') NOT IN ('cancelled','rejected')`];
    const params = [company_id];
    applyProjectScope(req, wheres, params, 'po', project_id);
    if (vendor_id && String(vendor_id).trim()) {
      params.push(vendor_id);
      wheres.push(`po.vendor_id=$${params.length}`);
    }
    const { rows } = await query(`
      SELECT po.id, COALESCE(po.po_number, po.serial_no_formatted) AS po_number,
             po.po_date, po.grand_total AS total_value,
             COALESCE(po.sub_total, po.grand_total) AS basic_value,
             COALESCE(po.grand_total, po.sub_total) AS total_with_tax,
             v.name AS vendor_name, v.id AS vendor_id
      FROM purchase_orders po
      LEFT JOIN vendors v ON v.id = po.vendor_id
      LEFT JOIN projects p ON p.id = po.project_id
      WHERE ${wheres.join(' AND ')}
      ORDER BY po.po_date DESC
      LIMIT 200
    `, params);
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── GET /tqs/advances/lookup/bills-by-vendor ─────────────────────────────────
router.get('/lookup/bills-by-vendor', async (req, res) => {
  try {
    const { company_id } = req.user;
    const { vendor_id, vendor_name, project_id } = req.query;
    const wheres = [`b.company_id=$1`, `b.is_deleted=FALSE`];
    const params = [company_id];

    applyProjectScope(req, wheres, params, 'b', project_id);
    if (vendor_id && vendor_id.trim()) {
      params.push(vendor_id); wheres.push(`b.vendor_id=$${params.length}`);
    } else if (vendor_name) {
      params.push(`%${vendor_name}%`); wheres.push(`b.vendor_name ILIKE $${params.length}`);
    }

    const { rows } = await query(`
      SELECT b.id, b.sl_number, b.inv_number, b.inv_date, b.total_amount,
             b.workflow_status, b.vendor_name,
             COALESCE(b.wo_number, b.po_number) AS ref_number
      FROM tqs_bills b
      WHERE ${wheres.join(' AND ')}
      ORDER BY b.inv_date DESC NULLS LAST
      LIMIT 100
    `, params);
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── GET /tqs/advances ─────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { company_id } = req.user;
    const { project_id, status, approval_status, search } = req.query;

    const wheres = [`av.company_id=$1`, `av.is_deleted=FALSE`];
    const params = [company_id];

    applyProjectScope(req, wheres, params, 'av', project_id);
    if (status && status !== 'all') { params.push(status); wheres.push(`av.status=$${params.length}`); }
    if (approval_status) { params.push(approval_status); wheres.push(`av.approval_status=$${params.length}`); }
    if (search) {
      params.push(`%${search}%`);
      wheres.push(`(av.vendor_name ILIKE $${params.length} OR av.wo_number ILIKE $${params.length} OR av.voucher_number ILIKE $${params.length} OR av.sl_number ILIKE $${params.length})`);
    }

    const { rows } = await query(`
      SELECT av.*,
             p.name AS project_name,
             pu.name AS procurement_approved_by_name,
             mu.name AS md_approved_by_name,
             ru.name AS rejected_by_name
      FROM tqs_advance_vouchers av
      LEFT JOIN projects p  ON p.id  = av.project_id
      LEFT JOIN users    pu ON pu.id = av.procurement_approved_by
      LEFT JOIN users    mu ON mu.id = av.md_approved_by
      LEFT JOIN users    ru ON ru.id = av.rejected_by
      WHERE ${wheres.join(' AND ')}
      ORDER BY av.created_at DESC
    `, params);

    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('advance list error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── POST /tqs/advances ────────────────────────────────────────────────────────
router.post('/', async (req, res) => {
  try {
    const { company_id, id: user_id } = req.user;
    const {
      project_id, vendor_id, vendor_name, work_desc, wo_number, po_number, po_date,
      voucher_number, voucher_date, proforma_invoice_date, proforma_invoice_number,
      ra_bill_no, order_value, variation_value, advance_value, advance_pct,
      gross_certified_till_date, mobilisation_advance_deduction, retention_deduction,
      other_deductions, previous_certificates, balance_to_finish, current_net_payment_due,
      amount_in_words, prepared_by_name, director_name, md_name,
      qs_handover_date, accts_received_date, remarks, note, terms_conditions,
    } = req.body;

    if (!vendor_name) return res.status(400).json({ success: false, message: 'vendor_name is required' });
    if (!advance_value || parseFloat(advance_value) <= 0)
      return res.status(400).json({ success: false, message: 'advance_value must be > 0' });

    const sl_number = await nextSlNumber();

    const { rows } = await query(`
      INSERT INTO tqs_advance_vouchers
        (company_id, project_id, sl_number, vendor_id, vendor_name, work_desc,
         wo_number, po_number, po_date,
         voucher_number, voucher_date, proforma_invoice_date, proforma_invoice_number,
         ra_bill_no, order_value, variation_value, advance_value, advance_pct,
         gross_certified_till_date, mobilisation_advance_deduction, retention_deduction,
         other_deductions, previous_certificates, balance_to_finish, current_net_payment_due,
         amount_in_words, prepared_by_name, director_name, md_name,
         qs_handover_date, accts_received_date, status, remarks, note, terms_conditions, created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,'pending',$32,$33,$34,$35)
      RETURNING *
    `, [
      company_id, project_id || null, sl_number, vendor_id || null, vendor_name,
      work_desc || null,
      wo_number || null, po_number || null, po_date || null,
      voucher_number || null, voucher_date || null,
      proforma_invoice_date || null, proforma_invoice_number || null,
      ra_bill_no || null,
      parseFloat(order_value || 0), parseFloat(variation_value || 0), parseFloat(advance_value),
      parseFloat(advance_pct || 0),
      parseFloat(gross_certified_till_date || advance_value || 0),
      parseFloat(mobilisation_advance_deduction || 0),
      parseFloat(retention_deduction || 0),
      parseFloat(other_deductions || 0),
      parseFloat(previous_certificates || 0),
      parseFloat(balance_to_finish || 0),
      parseFloat(current_net_payment_due || advance_value || 0),
      amount_in_words || null,
      prepared_by_name || null,
      director_name || null,
      md_name || null,
      qs_handover_date || null, accts_received_date || null,
      remarks || null, note || null, terms_conditions || null, user_id,
    ]);

    // Notify the Procurement team (email + in-app) that an advance awaits approval.
    try {
      const created = rows[0];
      let projectName = null;
      if (created.project_id) {
        const pr = await query('SELECT name FROM projects WHERE id=$1', [created.project_id]);
        projectName = pr.rows[0]?.name || null;
      }
      notifyAdvanceCreated(company_id, { ...created, project_name: projectName });
    } catch (_) {}

    res.status(201).json({ success: true, data: rows[0] });
  } catch (err) {
    console.error('advance create error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── GET /tqs/advances/:id ─────────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const { company_id } = req.user;
    const { id } = req.params;
    const wheres = [`av.id=$1`, `av.company_id=$2`, `av.is_deleted=FALSE`];
    const params = [id, company_id];
    applyProjectScope(req, wheres, params, 'av', null);

    const { rows: [voucher] } = await query(`
      SELECT av.*, p.name AS project_name
      FROM tqs_advance_vouchers av
      LEFT JOIN projects p ON p.id = av.project_id
      WHERE ${wheres.join(' AND ')}
    `, params);

    if (!voucher) return res.status(404).json({ success: false, message: 'Not found' });

    const { rows: recoveries } = await query(`
      SELECT r.*, b.sl_number AS bill_sl
      FROM tqs_advance_recoveries r
      LEFT JOIN tqs_bills b ON b.id = r.bill_id
      WHERE r.advance_id=$1
      ORDER BY r.recovery_date DESC
    `, [id]);

    res.json({ success: true, data: { ...voucher, recoveries } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── PUT /tqs/advances/:id ─────────────────────────────────────────────────────
router.put('/:id', async (req, res) => {
  try {
    const { company_id } = req.user;
    const { id } = req.params;
    const {
      vendor_id, vendor_name, project_id, work_desc, wo_number, po_number, po_date,
      voucher_number, voucher_date, proforma_invoice_date, proforma_invoice_number,
      ra_bill_no, order_value, variation_value, advance_value, advance_pct,
      gross_certified_till_date, mobilisation_advance_deduction, retention_deduction,
      other_deductions, previous_certificates, balance_to_finish, current_net_payment_due,
      amount_in_words, prepared_by_name, director_name, md_name,
      qs_handover_date, accts_received_date, remarks, note, terms_conditions,
    } = req.body;

    const { rows } = await query(`
      UPDATE tqs_advance_vouchers SET
        vendor_id=$1, vendor_name=$2, project_id=$3, work_desc=$4,
        wo_number=$5, po_number=$6, po_date=$7,
        voucher_number=$8, voucher_date=$9,
        proforma_invoice_date=$10, proforma_invoice_number=$11,
        ra_bill_no=$12, order_value=$13, variation_value=$14, advance_value=$15, advance_pct=$16,
        gross_certified_till_date=$17, mobilisation_advance_deduction=$18,
        retention_deduction=$19, other_deductions=$20, previous_certificates=$21,
        balance_to_finish=$22, current_net_payment_due=$23, amount_in_words=$24,
        prepared_by_name=$25, director_name=$26, md_name=$27,
        qs_handover_date=$28, accts_received_date=$29,
        remarks=$30, note=$31, terms_conditions=$32, updated_at=NOW()
      WHERE id=$33 AND company_id=$34 AND is_deleted=FALSE
      RETURNING *
    `, [
      vendor_id || null, vendor_name, project_id || null, work_desc || null,
      wo_number || null, po_number || null, po_date || null,
      voucher_number || null, voucher_date || null,
      proforma_invoice_date || null, proforma_invoice_number || null,
      ra_bill_no || null,
      parseFloat(order_value || 0), parseFloat(variation_value || 0),
      parseFloat(advance_value || 0), parseFloat(advance_pct || 0),
      parseFloat(gross_certified_till_date || advance_value || 0),
      parseFloat(mobilisation_advance_deduction || 0),
      parseFloat(retention_deduction || 0),
      parseFloat(other_deductions || 0),
      parseFloat(previous_certificates || 0),
      parseFloat(balance_to_finish || 0),
      parseFloat(current_net_payment_due || advance_value || 0),
      amount_in_words || null,
      prepared_by_name || null,
      director_name || null,
      md_name || null,
      qs_handover_date || null, accts_received_date || null,
      remarks || null, note || null, terms_conditions || null, id, company_id,
    ]);

    if (!rows.length) return res.status(404).json({ success: false, message: 'Not found' });
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── DELETE /tqs/advances/:id ──────────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    const { company_id } = req.user;
    await query(
      `UPDATE tqs_advance_vouchers SET is_deleted=TRUE, updated_at=NOW() WHERE id=$1 AND company_id=$2`,
      [req.params.id, company_id]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── Approval workflow: Procurement → Managing Director ───────────────────────
const PROCUREMENT_APPROVERS = ['super_admin', 'admin', 'procurement_manager', 'project_manager'];
const MD_APPROVERS = ['super_admin', 'admin', 'managing_director', 'md', 'ceo', 'director'];

// PATCH /tqs/advances/:id/approve-procurement — Stage 1 (Procurement team)
router.patch('/:id/approve-procurement', authorize(...PROCUREMENT_APPROVERS), async (req, res) => {
  try {
    const { company_id, id: user_id } = req.user;
    const { rows } = await query(
      `UPDATE tqs_advance_vouchers
          SET approval_status='procurement_approved',
              procurement_approved_by=$1, procurement_approved_at=NOW(),
              rejected_by=NULL, rejected_at=NULL, rejection_reason=NULL,
              updated_at=NOW()
        WHERE id=$2 AND company_id=$3 AND is_deleted=FALSE
          AND approval_status IN ('pending','rejected')
        RETURNING *`,
      [user_id, req.params.id, company_id]
    );
    if (!rows.length) return res.status(409).json({ success: false, message: 'Voucher not found or not awaiting procurement approval.' });
    // Notify the Managing Director (email + in-app) for final approval.
    try {
      const av = rows[0];
      let projectName = null;
      if (av.project_id) {
        const pr = await query('SELECT name FROM projects WHERE id=$1', [av.project_id]);
        projectName = pr.rows[0]?.name || null;
      }
      notifyAdvanceProcurementApproved(company_id, { ...av, project_name: projectName }, req.user.name);
    } catch (_) {}
    res.json({ success: true, data: rows[0], message: 'Advance approved by Procurement' });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// PATCH /tqs/advances/:id/approve-md — Stage 2 (Managing Director)
router.patch('/:id/approve-md', authorize(...MD_APPROVERS), async (req, res) => {
  try {
    const { company_id, id: user_id } = req.user;
    const { rows } = await query(
      `UPDATE tqs_advance_vouchers
          SET approval_status='approved',
              md_approved_by=$1, md_approved_at=NOW(), updated_at=NOW()
        WHERE id=$2 AND company_id=$3 AND is_deleted=FALSE
          AND approval_status='procurement_approved'
        RETURNING *`,
      [user_id, req.params.id, company_id]
    );
    if (!rows.length) return res.status(409).json({ success: false, message: 'Voucher must be approved by Procurement first.' });
    res.json({ success: true, data: rows[0], message: 'Advance approved by Managing Director' });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// PATCH /tqs/advances/:id/reject — either approver can reject (reason required)
router.patch('/:id/reject', authorize(...new Set([...PROCUREMENT_APPROVERS, ...MD_APPROVERS])), async (req, res) => {
  try {
    const { company_id, id: user_id } = req.user;
    const reason = (req.body?.reason || '').trim();
    if (!reason) return res.status(400).json({ success: false, message: 'A rejection reason is required.' });
    const { rows } = await query(
      `UPDATE tqs_advance_vouchers
          SET approval_status='rejected', rejected_by=$1, rejected_at=NOW(), rejection_reason=$2, updated_at=NOW()
        WHERE id=$3 AND company_id=$4 AND is_deleted=FALSE
          AND approval_status <> 'approved'
        RETURNING *`,
      [user_id, reason, req.params.id, company_id]
    );
    if (!rows.length) return res.status(409).json({ success: false, message: 'Voucher not found or already fully approved.' });
    res.json({ success: true, data: rows[0], message: 'Advance rejected' });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ── PATCH /tqs/advances/:id/issue — disburse the advance ─────────────────────
router.patch('/:id/issue', async (req, res) => {
  try {
    const { company_id, id: user_id } = req.user;
    const { id } = req.params;
    const { paid_amount, pay_date } = req.body;
    const paidAmt = parseFloat(paid_amount || 0);

    // Disbursement is gated on full approval (Procurement + Managing Director).
    const chk = await query(
      `SELECT approval_status FROM tqs_advance_vouchers WHERE id=$1 AND company_id=$2 AND is_deleted=FALSE`,
      [id, company_id]
    );
    if (!chk.rows.length) return res.status(404).json({ success: false, message: 'Not found' });
    if (chk.rows[0].approval_status !== 'approved') {
      return res.status(403).json({ success: false, message: 'Advance must be approved by Procurement and the Managing Director before it can be disbursed.' });
    }

    const { rows } = await query(`
      UPDATE tqs_advance_vouchers SET
        status='issued', paid_amount=$1, pay_date=$2, updated_at=NOW()
      WHERE id=$3 AND company_id=$4 AND is_deleted=FALSE
      RETURNING *
    `, [paidAmt, pay_date || null, id, company_id]);

    if (!rows.length) return res.status(404).json({ success: false, message: 'Not found' });
    const voucher = rows[0];

    // Auto-post: Dr Advance to Vendors/Subcontractors (1150), Cr Bank (1010).
    // Money is out but it's not an expense yet — it's recovered later against
    // the vendor's actual bill, at which point it clears against Accounts
    // Payable (see /:id/recover) instead of being expensed twice.
    if (paidAmt > 0) {
      const ref = voucher.voucher_number || voucher.sl_number;
      await postAutoJournalStandalone({
        companyId: company_id,
        userId: user_id,
        entryDate: pay_date || new Date().toISOString().slice(0, 10),
        projectId: voucher.project_id || null,
        reference: ref,
        narration: `Advance paid — ${voucher.vendor_name || ''} (${ref})`,
        source: 'auto_tqs_advance',
        lines: [
          { code: '1150', debit: paidAmt, description: `Advance to ${voucher.vendor_name || 'vendor'} — ${ref}` },
          { code: '1010', credit: paidAmt, description: `Advance paid — ${ref}` },
        ],
      });
    }

    res.json({ success: true, data: voucher });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── POST /tqs/advances/:id/recover — record a recovery ───────────────────────
router.post('/:id/recover', async (req, res) => {
  try {
    const { company_id, id: user_id } = req.user;
    const { id } = req.params;
    const { amount, recovery_date, bill_id, notes } = req.body;

    if (!amount || parseFloat(amount) <= 0)
      return res.status(400).json({ success: false, message: 'amount must be > 0' });
    if (!recovery_date)
      return res.status(400).json({ success: false, message: 'recovery_date is required' });

    await withTransaction(async (client) => {
      // Verify voucher belongs to company
      const { rows: [vch] } = await client.query(
        `SELECT id, project_id, vendor_name, voucher_number, sl_number, advance_value, recovered_amount FROM tqs_advance_vouchers WHERE id=$1 AND company_id=$2 AND is_deleted=FALSE FOR UPDATE`,
        [id, company_id]
      );
      if (!vch) throw Object.assign(new Error('Not found'), { status: 404 });

      // Insert recovery record
      await client.query(`
        INSERT INTO tqs_advance_recoveries (advance_id, bill_id, amount, recovery_date, notes, created_by)
        VALUES ($1,$2,$3,$4,$5,$6)
      `, [id, bill_id || null, parseFloat(amount), recovery_date, notes || null, user_id]);

      // Update cumulative recovered_amount
      await client.query(`
        UPDATE tqs_advance_vouchers
        SET recovered_amount = recovered_amount + $1, updated_at=NOW()
        WHERE id=$2
      `, [parseFloat(amount), id]);

      // Recalculate status
      await syncVoucherStatus(client, id);

      // Auto-post: Dr Accounts Payable (2000), Cr Advance to Vendors/Subcontractors
      // (1150) — clears part of the vendor's payable using the advance already
      // paid out, instead of that bill needing a fresh cash payment for this amount.
      const recAmt = parseFloat(amount);
      const ref = vch.voucher_number || vch.sl_number;
      await postAutoJournal(client, {
        companyId: company_id,
        userId: user_id,
        entryDate: recovery_date,
        projectId: vch.project_id || null,
        reference: ref,
        narration: `Advance recovery — ${vch.vendor_name || ''} (${ref})`,
        source: 'auto_tqs_advance_recovery',
        lines: [
          { code: '2000', debit: recAmt, description: `Advance recovered against bill — ${ref}` },
          { code: '1150', credit: recAmt, description: `Advance to ${vch.vendor_name || 'vendor'} — ${ref}` },
        ],
      });
    });

    // Return updated voucher
    const { rows: [updated] } = await query(
      `SELECT * FROM tqs_advance_vouchers WHERE id=$1`, [id]
    );
    res.json({ success: true, data: updated });
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({ success: false, message: err.message });
  }
});

// ── POST /tqs/advances/import — bulk import from Excel ────────────────────────
const multerMem = require('multer')({ storage: require('multer').memoryStorage() });
router.post('/import', multerMem.single('file'), async (req, res) => {
  try {
    const XLSX = require('xlsx');
    if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });
    const { company_id, id: user_id } = req.user;
    const { project_id } = req.body;

    const wb = XLSX.read(req.file.buffer, { type: 'buffer', cellDates: true });
    // Find the advance tracker sheet by name (partial match, case-insensitive)
    const sheetName = wb.SheetNames.find(n => n.toLowerCase().includes('advance tracker'))
      || wb.SheetNames.find(n => n.toLowerCase().includes('advance'))
      || wb.SheetNames[0];
    const ws = wb.Sheets[sheetName];

    // Sheet has 2 header rows (row 0 = section labels, row 1 = column names)
    // Use raw array mode and skip the first 2 rows
    const rawRows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
    const dataRows = rawRows.slice(2).filter(r => r[1] && String(r[1]).trim()); // skip empty vendor rows

    const parseDate = (v) => {
      if (!v) return null;
      if (v instanceof Date) return isNaN(v) ? null : v.toISOString().slice(0, 10);
      const s = String(v).trim();
      // dd.mm.yyyy
      const m = s.match(/^(\d{1,2})[.\-\/](\d{1,2})[.\-\/](\d{2,4})$/);
      if (m) {
        const yr = m[3].length === 2 ? '20' + m[3] : m[3];
        return `${yr}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
      }
      const d = new Date(s);
      return isNaN(d) ? null : d.toISOString().slice(0, 10);
    };

    const parseNum = (v) => { const n = parseFloat(v); return isNaN(n) ? 0 : n; };

    const created = [], skipped = [], errors = [];

    for (let i = 0; i < dataRows.length; i++) {
      const r = dataRows[i];
      const rowNum = i + 3; // 1-based, offset by 2 header rows

      // Column mapping (0-indexed):
      // 0=S.No, 1=Vendor Name, 2=PO/WO Number, 3=PO Date,
      // 4=Voucher Number, 5=Voucher Date, 6=Order Value, 7=GST Amount,
      // 8=Advance Value, 9=QS Handover Date, 10=Received from Procurement,
      // 11=Handed to Accounts, 12=Received from QS,
      // 13=Status (Paid/Not Paid), 14=Amount Paid, 15=Bank Ref, 16=Pay Date
      const vendorName    = String(r[1] || '').trim();
      const powoNumber    = String(r[2] || '').trim();
      const poDate        = parseDate(r[3]);
      const voucherNumber = String(r[4] || '').trim();
      const voucherDate   = parseDate(r[5]);
      const orderValue    = parseNum(r[6]);
      const advanceValue  = parseNum(r[8]);
      const qsHandover    = parseDate(r[9]);
      const acctReceived  = parseDate(r[12]);
      const statusRaw     = String(r[13] || '').trim().toLowerCase();
      const paidAmount    = parseNum(r[14]);
      const bankRef       = String(r[15] || '').trim();
      const payDate       = parseDate(r[16]);

      if (!vendorName) { errors.push({ row: rowNum, reason: 'Vendor Name is required' }); continue; }
      if (advanceValue <= 0) { errors.push({ row: rowNum, reason: 'Advance Value must be > 0' }); continue; }

      // Determine WO vs PO prefix
      const woNumber = powoNumber.toUpperCase().startsWith('WO') ? powoNumber : null;
      const poNumber = powoNumber.toUpperCase().startsWith('PO') ? powoNumber : (!woNumber ? powoNumber : null);

      // Derive status
      let status = 'pending';
      const statusIndicatesPaid = ['paid','issued','partial','recovered'].includes(statusRaw);
      if (statusIndicatesPaid || paidAmount > 0) status = 'issued';

      // If status says paid but Excel paid_amount column is empty, fall back to advance_value
      let effectivePaidAmount = paidAmount;
      let effectivePayDate = payDate;
      if (status === 'issued' && effectivePaidAmount <= 0) {
        effectivePaidAmount = advanceValue;
        effectivePayDate = effectivePayDate || voucherDate || poDate;
      }

      // Advance %
      const advancePct = orderValue > 0 ? parseFloat(((advanceValue / orderValue) * 100).toFixed(2)) : 0;

      // Build remarks with bank ref if present
      const remarks = bankRef ? `Bank Ref: ${bankRef}` : null;

      // Duplicate check by vendor + voucher number
      const dup = await query(
        `SELECT id FROM tqs_advance_vouchers WHERE company_id=$1 AND vendor_name ILIKE $2 AND voucher_number=$3 AND is_deleted=FALSE`,
        [company_id, vendorName, voucherNumber]
      );
      if (dup.rows.length) {
        skipped.push({ row: rowNum, reason: `Duplicate: ${vendorName} / voucher ${voucherNumber}` });
        continue;
      }

      try {
        const slNumber = await nextSlNumber();
        await query(`
          INSERT INTO tqs_advance_vouchers
            (company_id, project_id, sl_number, vendor_name, wo_number, po_number, po_date,
             voucher_number, voucher_date, order_value, advance_value, advance_pct,
             qs_handover_date, accts_received_date, status, paid_amount, pay_date,
             remarks, created_by)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
        `, [
          company_id, project_id || null, slNumber, vendorName,
          woNumber, poNumber, poDate,
          voucherNumber || null, voucherDate, orderValue, advanceValue, advancePct,
          qsHandover, acctReceived, status, effectivePaidAmount, effectivePayDate,
          remarks, user_id,
        ]);
        created.push({ row: rowNum, vendor: vendorName, voucher: voucherNumber });
      } catch (insertErr) {
        errors.push({ row: rowNum, reason: insertErr.message });
      }
    }

    res.json({
      success: true,
      summary: { created: created.length, skipped: skipped.length, errors: errors.length },
      created, skipped, errors,
    });
  } catch (err) {
    console.error('advance import error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── POST /tqs/advances/resync-from-bills ─────────────────────────────────────
// Recalculates recovered_amount on all advance vouchers from scratch using
// actual advance_recovered values stored in tqs_bill_updates (non-deleted bills).
// Safe to run multiple times — resets all vouchers then re-applies FIFO.
router.post('/resync-from-bills', async (req, res) => {
  try {
    const { company_id } = req.user;

    // 1a. Backfill paid_amount for vouchers that were previously marked issued/partial/recovered
    //     but never had paid_amount captured (common when imported from Excel).
    //     If a voucher had any recovery against it, the advance must have been paid.
    await query(
      `UPDATE tqs_advance_vouchers
       SET paid_amount = advance_value,
           pay_date    = COALESCE(pay_date, voucher_date, po_date, created_at::date),
           updated_at  = NOW()
       WHERE company_id = $1
         AND is_deleted = FALSE
         AND COALESCE(paid_amount, 0) = 0
         AND (status IN ('issued','partial','recovered') OR recovered_amount > 0)`,
      [company_id]
    );

    // 1b. Reset all vouchers for this company back to 0 recovered
    await query(
      `UPDATE tqs_advance_vouchers
       SET recovered_amount = 0,
           status = CASE WHEN paid_amount > 0 THEN 'issued' ELSE 'pending' END,
           updated_at = NOW()
       WHERE company_id = $1 AND is_deleted = FALSE`,
      [company_id]
    );

    // 2. Collect all advance_recovered amounts from non-deleted, QS-processed bills
    //    grouped by vendor (vendor_id preferred, vendor_name fallback), oldest bill first
    const billsRes = await query(
      `SELECT b.vendor_id, b.vendor_name, u.advance_recovered,
              b.created_at
       FROM tqs_bills b
       JOIN tqs_bill_updates u ON u.bill_id = b.id
       WHERE b.company_id = $1
         AND b.is_deleted = FALSE
         AND u.advance_recovered > 0
       ORDER BY b.created_at ASC`,
      [company_id]
    );

    let applied = 0;
    let skipped = 0;

    for (const bill of billsRes.rows) {
      const toAllocate = parseFloat(bill.advance_recovered || 0);
      if (toAllocate <= 0) continue;

      const vWhere = bill.vendor_id
        ? `(vendor_id = $2 OR vendor_name ILIKE $3)`
        : `vendor_name ILIKE $2`;
      const vParams = bill.vendor_id
        ? [company_id, bill.vendor_id, `%${bill.vendor_name}%`]
        : [company_id, `%${bill.vendor_name}%`];

      const openVouchers = await query(
        `SELECT id, advance_value, recovered_amount,
                advance_value - recovered_amount AS remaining
         FROM tqs_advance_vouchers
         WHERE company_id = $1 AND ${vWhere}
           AND advance_value > recovered_amount AND is_deleted = FALSE
         ORDER BY COALESCE(pay_date, created_at) ASC`,
        vParams
      );

      if (!openVouchers.rows.length) { skipped++; continue; }

      let remaining = toAllocate;
      for (const v of openVouchers.rows) {
        if (remaining <= 0) break;
        const apply = Math.min(remaining, parseFloat(v.remaining));
        const newRecovered = parseFloat(v.recovered_amount) + apply;
        const newStatus = newRecovered >= parseFloat(v.advance_value) ? 'recovered'
                        : newRecovered > 0 ? 'partial'
                        : 'issued';
        await query(
          `UPDATE tqs_advance_vouchers
           SET recovered_amount = $1, status = $2, updated_at = NOW()
           WHERE id = $3`,
          [newRecovered, newStatus, v.id]
        );
        remaining -= apply;
      }
      applied++;
    }

    res.json({
      success: true,
      message: `Resync complete. ${applied} bill recoveries applied, ${skipped} skipped (no matching voucher).`,
      applied,
      skipped,
    });
  } catch (err) {
    console.error('advance resync error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
