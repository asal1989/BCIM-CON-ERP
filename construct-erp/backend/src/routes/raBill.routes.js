// src/routes/raBill.routes.js — Client Billing (RA Bills)
const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const { query, withTransaction } = require('../config/database');
const { runSchemaInit } = require('../utils/schemaInit');
const { loadProjectScope, appendProjectScope } = require('../middleware/projectScope');
const { logAudit } = require('../utils/auditLog');
router.use(authenticate);
router.use(loadProjectScope);

// Ensure new columns exist on live DB (idempotent)
const ensureRaBillCols = async () => {
  const alters = [
    `ALTER TABLE ra_bills ADD COLUMN IF NOT EXISTS contractor_name VARCHAR(200)`,
    `ALTER TABLE ra_bills ADD COLUMN IF NOT EXISTS contractor_gstin VARCHAR(15)`,
    `ALTER TABLE ra_bills ADD COLUMN IF NOT EXISTS contractor_pan VARCHAR(10)`,
    `ALTER TABLE ra_bills ADD COLUMN IF NOT EXISTS work_description TEXT`,
    `ALTER TABLE ra_bills ADD COLUMN IF NOT EXISTS price_escalation NUMERIC(15,2) DEFAULT 0`,
    `ALTER TABLE ra_bills ADD COLUMN IF NOT EXISTS certified_by UUID`,
    `ALTER TABLE ra_bills ADD COLUMN IF NOT EXISTS certified_date TIMESTAMPTZ`,
    `ALTER TABLE ra_bills ADD COLUMN IF NOT EXISTS client_tds_amount NUMERIC(15,2) DEFAULT 0`,
    `ALTER TABLE ra_bills ADD COLUMN IF NOT EXISTS amount_received NUMERIC(15,2) DEFAULT 0`,
    `ALTER TABLE ra_bills ADD COLUMN IF NOT EXISTS company_id UUID`,
    `ALTER TABLE ra_bills ADD COLUMN IF NOT EXISTS adhoc_advance_recovery NUMERIC(15,2) DEFAULT 0`,
    `ALTER TABLE ra_bills ADD COLUMN IF NOT EXISTS wo_number VARCHAR(100) DEFAULT ''`,
  ];
  for (const sql of alters) {
    try { await query(sql); } catch (_) {}
  }
  // Ensure status constraint includes 'draft' and 'verified' (production DB may have old constraint)
  try {
    await query(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.check_constraints
          WHERE constraint_schema = current_schema()
            AND constraint_name = 'ra_bills_status_check'
            AND check_clause LIKE '%draft%'
        ) THEN
          ALTER TABLE ra_bills DROP CONSTRAINT IF EXISTS ra_bills_status_check;
          ALTER TABLE ra_bills ADD CONSTRAINT ra_bills_status_check
            CHECK (status IN ('draft','submitted','verified','certified','rejected','paid'));
        END IF;
      END $$
    `);
  } catch (_) {}
};
runSchemaInit('ra_bills', ensureRaBillCols);

// GET /ra-bills
router.get('/', async (req, res) => {
  try {
    const { project_id, status } = req.query;
    let sql = `
      SELECT rb.*, p.name as project_name,
             u.name as created_by_name,
             v.name as verified_by_name,
             cert.name as certified_by_name
      FROM ra_bills rb
      JOIN projects p ON rb.project_id = p.id
      LEFT JOIN users u ON rb.created_by = u.id
      LEFT JOIN users v ON rb.verified_by = v.id
      LEFT JOIN users cert ON rb.certified_by = cert.id
      WHERE p.company_id = $1`;
    let params = [req.user.company_id]; let i = 2;
    if (project_id) { sql += ` AND rb.project_id = $${i++}`; params.push(project_id); }
    if (status)     { sql += ` AND rb.status = $${i++}`;     params.push(status); }
    ({ sql, params } = appendProjectScope(req, sql, params, 'rb'));
    sql += ' ORDER BY rb.bill_date DESC, rb.created_at DESC';
    const result = await query(sql, params);
    res.json({ data: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /ra-bills/previous-stats
router.get('/previous-stats', async (req, res) => {
  try {
    const { project_id, boq_item_id } = req.query;
    const projectCheck = await query(
      `SELECT 1 FROM projects WHERE id = $1 AND company_id = $2 LIMIT 1`,
      [project_id, req.user.company_id]
    );
    if (projectCheck && projectCheck.rowCount !== undefined && !projectCheck.rowCount) {
      return res.status(400).json({ error: 'Invalid project for this company' });
    }
    const result = await query(
      `SELECT SUM(rbi.current_qty) as total_prev_qty, SUM(rbi.amount) as total_prev_amount
       FROM ra_bill_items rbi
       JOIN ra_bills rb ON rbi.ra_bill_id = rb.id
       JOIN projects p ON rb.project_id = p.id
       WHERE rb.project_id = $1 AND p.company_id = $3
         AND rbi.boq_item_id = $2 AND rb.status IN ('certified','paid')`,
      [project_id, boq_item_id, req.user.company_id]
    );
    res.json({ data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /ra-bills
router.post('/', authorize('super_admin','admin','qs_engineer','project_manager'), async (req, res) => {
  try {
    const {
      project_id, bill_number, bill_date, work_description,
      bill_period_from, bill_period_to,
      gross_amount, gst_rate, gst_amount,
      retention_percent, mobilization_advance_recovery, adhoc_advance_recovery,
      material_recovery_steel, material_recovery_cement,
      price_escalation, other_deductions,
      tds_rate, items, remarks,
      contractor_name, contractor_gstin, contractor_pan, wo_number,
    } = req.body;

    const projectCheck = await query(
      `SELECT 1 FROM projects WHERE id = $1 AND company_id = $2 LIMIT 1`,
      [project_id, req.user.company_id]
    );
    if (projectCheck && projectCheck.rowCount !== undefined && !projectCheck.rowCount) {
      return res.status(400).json({ error: 'Invalid project for this company' });
    }

    const billStatus = req.body.status === 'draft' ? 'draft' : 'submitted';

    const result = await withTransaction(async (client) => {
      // Retention is charged on gross + price escalation (escalation is part of the certified value)
      const retention_amount = (parseFloat(gross_amount) + parseFloat(price_escalation || 0)) * (parseFloat(retention_percent || 0) / 100);
      const tds_amount       = parseFloat(gross_amount) * (parseFloat(tds_rate || 0) / 100);
      const total_deductions =
        retention_amount +
        parseFloat(mobilization_advance_recovery || 0) +
        parseFloat(adhoc_advance_recovery || 0) +
        parseFloat(material_recovery_steel || 0) +
        parseFloat(material_recovery_cement || 0) +
        parseFloat(other_deductions || 0) +
        tds_amount;
      const gross_with_gst = parseFloat(gross_amount) + parseFloat(gst_amount || 0);
      const net_payable    = gross_with_gst - total_deductions + parseFloat(price_escalation || 0);

      const header = await client.query(
        `INSERT INTO ra_bills
           (project_id, bill_number, bill_date, work_description,
            bill_period_from, bill_period_to,
            gross_amount, gst_rate, gst_amount, gross_with_gst,
            retention_pct, retention_amount,
            mobilization_advance_recovery, adhoc_advance_recovery,
            material_recovery_steel, material_recovery_cement,
            price_escalation, other_deductions,
            tds_rate, tds_amount,
            total_deductions, net_payable, status, created_by, remarks,
            contractor_name, contractor_gstin, contractor_pan, wo_number)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29)
         RETURNING *`,
        [
          project_id, bill_number, bill_date, work_description || null,
          bill_period_from || null, bill_period_to || null,
          gross_amount, parseFloat(gst_rate || 18), gst_amount, gross_with_gst,
          retention_percent, retention_amount,
          mobilization_advance_recovery || 0, adhoc_advance_recovery || 0,
          material_recovery_steel || 0, material_recovery_cement || 0,
          price_escalation || 0, other_deductions || 0,
          tds_rate || 2, tds_amount,
          total_deductions, net_payable, billStatus, req.user.id, remarks,
          contractor_name || 'Client', contractor_gstin || null, contractor_pan || null,
          wo_number || null,
        ]
      );
      const billId = header.rows[0].id;

      for (const it of (items || [])) {
        const itemCheck = await client.query(
          `SELECT COALESCE(b.current_quantity, b.quantity) AS boq_qty,
                  b.amendment_ref
             FROM boq_items b
             JOIN projects p ON b.project_id = p.id
            WHERE b.id = $1 AND b.project_id = $2 AND p.company_id = $3
            LIMIT 1`,
          [it.boq_item_id, project_id, req.user.company_id]
        );
        if (!itemCheck.rowCount) {
          throw new Error('Invalid BOQ item for this project');
        }
        const boqQty = parseFloat(itemCheck.rows[0].boq_qty || 0);
        const prevRes = await client.query(
          `SELECT COALESCE(SUM(current_qty),0) as prev_qty FROM ra_bill_items rbi
           JOIN ra_bills rb ON rbi.ra_bill_id = rb.id
           WHERE rb.project_id = $1 AND rbi.boq_item_id = $2 AND rb.status IN ('certified','paid')`,
          [project_id, it.boq_item_id]
        );
        const prevQty    = parseFloat(prevRes.rows[0].prev_qty);
        const currentQty = parseFloat(it.current_qty);
        if (boqQty > 0 && prevQty + currentQty > boqQty + 0.001) {
          throw new Error(
            `BOQ quantity exceeded for item ${it.boq_item_id}: ` +
            `BOQ=${boqQty}, already certified=${prevQty}, this bill=${currentQty} ` +
            `(total ${prevQty + currentQty} > ${boqQty})`
          );
        }
        await client.query(
          `INSERT INTO ra_bill_items
             (ra_bill_id, boq_item_id, prev_certified_qty, current_qty, cumulative_qty, rate)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [billId, it.boq_item_id, prevQty, currentQty, prevQty + currentQty, it.rate]
        );
      }
      return header.rows[0];
    });

    res.status(201).json({ data: result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /ra-bills/:id
router.get('/:id', async (req, res) => {
  try {
    const headerRes = await query(
      `SELECT rb.*,
              p.name as project_name, p.contract_value as total_contract_value,
              u.name  as submitted_by_name,
              v.name  as verified_by_name,
              cert.name as certified_by_name
       FROM ra_bills rb
       JOIN projects p ON rb.project_id = p.id
       LEFT JOIN users u    ON rb.created_by  = u.id
       LEFT JOIN users v    ON rb.verified_by  = v.id
       LEFT JOIN users cert ON rb.certified_by = cert.id
       WHERE rb.id = $1 AND p.company_id = $2`,
      [req.params.id, req.user.company_id]
    );
    if (!headerRes.rows.length) return res.status(404).json({ error: 'Bill not found' });

    const itemRes = await query(
      `SELECT rbi.*, b.chapter_no, b.chapter_name, b.item_no, b.sr_no,
              b.description, b.unit,
              b.quantity    AS boq_qty,
              b.rate        AS boq_rate,
              COALESCE(b.current_quantity, b.quantity) AS revised_boq_qty,
              COALESCE(b.current_rate, b.rate)         AS revised_boq_rate,
              b.amendment_ref
       FROM ra_bill_items rbi
       JOIN boq_items b ON rbi.boq_item_id = b.id
       WHERE rbi.ra_bill_id = $1
       ORDER BY b.chapter_no, b.item_no`,
      [req.params.id]
    );

    res.json({ data: { ...headerRes.rows[0], items: itemRes.rows } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /ra-bills/:id/verify
router.patch('/:id/verify', authorize('super_admin','admin','qs_engineer','project_manager'), async (req, res) => {
  try {
    const check = await query(
      `SELECT rb.id FROM ra_bills rb JOIN projects p ON rb.project_id=p.id
       WHERE rb.id=$1 AND p.company_id=$2 AND rb.status='submitted'`,
      [req.params.id, req.user.company_id]
    );
    if (!check.rows.length) return res.status(400).json({ error: 'Bill not found or not in submitted status' });
    const result = await query(
      `UPDATE ra_bills SET status='verified', verified_by=$1, updated_at=NOW() WHERE id=$2 RETURNING *`,
      [req.user.id, req.params.id]
    );
    await logAudit(req, { action: 'verify', tableName: 'ra_bills', recordId: req.params.id, newValues: { bill_number: result.rows[0].bill_number, status: 'verified' } });
    res.json({ data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /ra-bills/:id/approve (certify)
router.patch('/:id/approve', authorize('super_admin','admin','project_manager'), async (req, res) => {
  try {
    const result = await query(
      `UPDATE ra_bills rb
       SET status='certified', certified_by=$1, certified_date=NOW(), updated_at=NOW()
       FROM projects p
       WHERE rb.id=$2 AND rb.project_id=p.id AND p.company_id=$3 AND rb.status='verified'
       RETURNING rb.*`,
      [req.user.id, req.params.id, req.user.company_id]
    );
    if (!result.rows.length) return res.status(400).json({ error: 'Bill not found or not in verified status' });
    await logAudit(req, { action: 'approve', tableName: 'ra_bills', recordId: req.params.id, newValues: { bill_number: result.rows[0].bill_number, status: 'certified', net_payable: result.rows[0].net_payable } });
    res.json({ data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /ra-bills/:id/reject
router.patch('/:id/reject', authorize('super_admin','admin','qs_engineer','project_manager'), async (req, res) => {
  try {
    const { remarks } = req.body;
    const result = await query(
      `UPDATE ra_bills rb
       SET status='rejected', remarks=COALESCE($1, rb.remarks), updated_at=NOW()
       FROM projects p
       WHERE rb.id=$2 AND rb.project_id=p.id AND p.company_id=$3 AND rb.status IN ('submitted','verified')
       RETURNING rb.*`,
      [remarks || null, req.params.id, req.user.company_id]
    );
    if (!result.rows.length) return res.status(400).json({ error: 'Bill not found or not rejectable' });
    await logAudit(req, { action: 'reject', tableName: 'ra_bills', recordId: req.params.id, newValues: { bill_number: result.rows[0].bill_number, status: 'rejected', remarks: result.rows[0].remarks } });
    res.json({ data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /ra-bills/:id/pay — Finance marks certified bill as paid
router.patch('/:id/pay', authorize('super_admin','admin','accountant'), async (req, res) => {
  try {
    const { payment_date, payment_mode, payment_ref, client_tds_amount, amount_received } = req.body;
    if (!payment_date || !payment_mode || !payment_ref)
      return res.status(400).json({ error: 'payment_date, payment_mode and payment_ref are required.' });

    const check = await query(
      `SELECT rb.id FROM ra_bills rb JOIN projects p ON rb.project_id=p.id
       WHERE rb.id=$1 AND p.company_id=$2 AND rb.status='certified'`,
      [req.params.id, req.user.company_id]
    );
    if (!check.rows.length) return res.status(400).json({ error: 'Bill not found or not in certified status.' });

    const result = await query(
      `UPDATE ra_bills
         SET status='paid',
             payment_date=$1, payment_mode=$2, payment_ref=$3,
             client_tds_amount=$4, amount_received=$5,
             updated_at=NOW()
       WHERE id=$6 RETURNING *`,
      [payment_date, payment_mode, payment_ref,
       parseFloat(client_tds_amount || 0), parseFloat(amount_received || 0),
       req.params.id]
    );
    await logAudit(req, {
      action: 'pay', tableName: 'ra_bills', recordId: req.params.id,
      newValues: { bill_number: result.rows[0].bill_number, amount_received, payment_date, payment_mode, payment_ref },
    });
    res.json({ data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /ra-bills/:id (draft/rejected only)
router.delete('/:id', authorize('super_admin','admin','qs_engineer'), async (req, res) => {
  try {
    const result = await query(
      `DELETE FROM ra_bills rb USING projects p
       WHERE rb.project_id=p.id AND rb.id=$1 AND p.company_id=$2 AND rb.status IN ('draft','rejected')
       RETURNING rb.id, rb.bill_number, rb.gross_amount, rb.status`,
      [req.params.id, req.user.company_id]
    );
    if (!result.rows.length) return res.status(400).json({ error: 'Bill not found or cannot be deleted' });
    await logAudit(req, { action: 'delete', tableName: 'ra_bills', recordId: req.params.id, oldValues: result.rows[0] });
    res.json({ message: 'Bill deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
