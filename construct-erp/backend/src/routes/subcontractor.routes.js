// src/routes/subcontractor.routes.js
const express = require('express');
const multer = require('multer');
const router = express.Router();
const ctrl = require('../controllers/subcontractor.controller');
const { authenticate, authorize } = require('../middleware/auth');
const { query, withTransaction } = require('../config/database');
const { extractWO } = require('../services/woExtraction.service');
const { getNextDqsNumber } = require('../services/documentNumber.service');
const { logAudit } = require('../utils/auditLog');
const { sendMail } = require('../services/mail.service');
const { runSchemaInit } = require('../utils/schemaInit');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// Ensure columns linking a Work Order to its source Material Requisition(s) exist
runSchemaInit('work_orders_mrs_columns', async () => {
  await query(`
    ALTER TABLE work_orders
      ADD COLUMN IF NOT EXISTS mrs_id UUID REFERENCES material_requisitions(id),
      ADD COLUMN IF NOT EXISTS mrs_ids UUID[]
  `);
});

// Ensure sc_attendance cannot have duplicate (worker_id, attendance_date) pairs
// which would silently double payroll SUM aggregations.
runSchemaInit('sc_attendance_unique_worker_date', async () => {
  await query(`
    ALTER TABLE sc_attendance
      ADD CONSTRAINT IF NOT EXISTS sc_attendance_worker_date_unique
      UNIQUE (worker_id, attendance_date)
  `);
});

// Work Order amendments — a manual, dated log of scope/value changes against
// an existing WO (extension of time, price variation, scope change), mirroring
// the client_wo_amendments pattern used for client-side work orders.
runSchemaInit('wo_amendments', async () => {
  await query(`
    CREATE TABLE IF NOT EXISTS wo_amendments (
      id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      wo_id               UUID NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
      company_id          UUID NOT NULL,
      amendment_number    INTEGER,
      amendment_date      DATE,
      description         TEXT NOT NULL,
      amount_change       NUMERIC(15,2) DEFAULT 0,
      revised_order_value NUMERIC(15,2),
      created_by          UUID REFERENCES users(id),
      created_at          TIMESTAMPTZ DEFAULT NOW()
    )
  `);
});

// Public verification endpoint (no auth — QR scan)
router.get('/public/verify/:id', async (req, res) => {
  try {
    const result = await query(
      `SELECT wo.*, v.name AS contractor_name, p.name AS project_name, p.project_code,
              u.name AS created_by_name
       FROM work_orders wo
       LEFT JOIN vendors v ON wo.vendor_id = v.id
       LEFT JOIN projects p ON wo.project_id = p.id
       LEFT JOIN users u ON wo.created_by = u.id
       WHERE wo.id = $1`, [req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Work Order not found' });
    const items = await query(`SELECT * FROM wo_items WHERE wo_id = $1 ORDER BY sort_order`, [req.params.id]);
    res.json({ data: { ...result.rows[0], items: items.rows } });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.use(authenticate);

// Editing/deleting a work order is restricted to procurement, super admin & MD users
const PROCUREMENT_ROLES = ['super_admin', 'procurement_manager', 'procurement', 'managing_director'];

// Dashboard
router.get('/dashboard', ctrl.getDashboard);

// Subcontractor master list
router.get('/list', ctrl.listSubcontractors);

// Labour / worker attendance
router.get('/workers', ctrl.listWorkers);
router.post('/workers', authorize('super_admin', 'admin', 'project_manager', 'site_engineer'), ctrl.createWorker);
router.get('/labour-attendance', ctrl.listLabourAttendance);
router.post('/labour-attendance', authorize('super_admin', 'admin', 'project_manager', 'site_engineer'), ctrl.createLabourAttendance);

// Settings
router.get('/settings', ctrl.getSettings);
router.patch('/settings', authorize('super_admin', 'admin', 'project_manager'), ctrl.updateSettings);

// Documents (vendor-scoped)
router.get('/documents/expiring', ctrl.listExpiringDocuments);
router.get('/:vendorId/documents', ctrl.listDocuments);
router.post('/:vendorId/documents', authorize('super_admin', 'admin', 'project_manager', 'accountant'), ctrl.createDocument);
router.delete('/:vendorId/documents/:docId', authorize('super_admin', 'admin', 'project_manager'), ctrl.deleteDocument);

// Work Orders
router.get('/work-orders', ctrl.getWorkOrders);
router.post('/work-orders', authorize('super_admin', 'admin', 'project_manager', 'procurement_manager'), ctrl.createWorkOrder);
router.get('/work-orders/:id', ctrl.getWorkOrder);
router.patch('/work-orders/:id', authorize(...PROCUREMENT_ROLES), ctrl.updateWorkOrder);
router.delete('/work-orders/:id', authorize(...PROCUREMENT_ROLES), (req, res) => {
  res.status(403).json({ error: 'Deletion of Work Orders is not permitted. Work Orders are permanent financial records.' });
});

// ── WO Amendments — add a dated amendment/variation entry against a WO ─────
const WO_AMEND_ROLES = [...PROCUREMENT_ROLES, 'admin', 'management', 'project_manager', 'purchase_executive', 'contracts_manager'];
router.post('/work-orders/:id/amendments', authorize(...WO_AMEND_ROLES), async (req, res) => {
  try {
    const company_id = req.user.company_id;
    const { description, amount_change, amendment_date } = req.body;
    if (!description?.trim()) return res.status(400).json({ error: 'Description required' });

    const { rows: wo } = await query(
      `SELECT wo.*, wo.total_value AS contract_value
       FROM work_orders wo
       JOIN projects p ON p.id = wo.project_id
       WHERE wo.id=$1 AND p.company_id=$2`,
      [req.params.id, company_id]
    );
    if (!wo.length) return res.status(404).json({ error: 'Work order not found' });

    const { rows: last } = await query(
      `SELECT MAX(amendment_number) AS mx FROM wo_amendments WHERE wo_id=$1`, [req.params.id]);
    const amendNum = (last[0].mx || 0) + 1;

    const { rows: prev } = await query(
      `SELECT revised_order_value FROM wo_amendments WHERE wo_id=$1 ORDER BY created_at DESC LIMIT 1`,
      [req.params.id]);
    const baseValue = prev.length ? Number(prev[0].revised_order_value) : Number(wo[0].contract_value);
    const revised = baseValue + Number(amount_change || 0);

    const { rows } = await query(`
      INSERT INTO wo_amendments
        (wo_id, company_id, amendment_number, amendment_date, description, amount_change, revised_order_value, created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [req.params.id, company_id, amendNum, amendment_date || null, description.trim(),
       Number(amount_change || 0), revised, req.user.id]
    );
    res.status(201).json({ data: rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/work-orders/:id/amendments/:aid', authorize(...WO_AMEND_ROLES), async (req, res) => {
  try {
    await query(
      `DELETE FROM wo_amendments WHERE id=$1 AND wo_id=$2 AND company_id=$3`,
      [req.params.aid, req.params.id, req.user.company_id]);
    res.json({ message: 'Deleted' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── WO Amendments Register — every amendment across all work orders ────────
router.get('/wo-amendments', async (req, res) => {
  try {
    const { project_id, vendor_id, search } = req.query;
    const params = [req.user.company_id];
    let i = 2;
    let sql = `
      SELECT a.*, wo.wo_number, wo.total_value AS wo_order_value,
             p.name AS project_name, p.id AS project_id,
             v.name AS vendor_name, v.id AS vendor_id,
             cu.name AS created_by_name
      FROM wo_amendments a
      JOIN work_orders wo ON wo.id = a.wo_id
      JOIN projects p ON p.id = wo.project_id
      LEFT JOIN vendors v ON v.id = wo.vendor_id
      LEFT JOIN users cu ON cu.id = a.created_by
      WHERE a.company_id = $1
    `;
    if (project_id) { sql += ` AND wo.project_id = $${i++}`; params.push(project_id); }
    if (vendor_id)  { sql += ` AND wo.vendor_id = $${i++}`;  params.push(vendor_id); }
    if (search) {
      sql += ` AND (wo.wo_number ILIKE $${i} OR COALESCE(v.name,'') ILIKE $${i} OR a.description ILIKE $${i})`;
      params.push(`%${search}%`); i++;
    }
    sql += ' ORDER BY a.amendment_date DESC NULLS LAST, a.created_at DESC';
    const result = await query(sql, params);
    res.json({ data: result.rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PATCH /work-orders/:id/approve — Stage 1 (Procurement): draft/pending → submitted
router.patch('/work-orders/:id/approve', authorize('super_admin', 'admin', 'project_manager', 'procurement_manager'), async (req, res) => {
  try {
    const result = await query(
      `UPDATE work_orders SET status='submitted', updated_at=NOW()
       WHERE id=$1 AND status IN ('pending','draft')
         AND project_id IN (SELECT id FROM projects WHERE company_id=$2)
       RETURNING *`,
      [req.params.id, req.user.company_id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Work order not found or not in pending/draft status' });
    res.json({ data: result.rows[0], message: 'Work Order procurement approved' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PATCH /work-orders/:id/md-approve — Stage 2 (MD): submitted → approved
router.patch('/work-orders/:id/md-approve', authorize('super_admin', 'admin', 'managing_director', 'md', 'ceo'), async (req, res) => {
  try {
    const result = await query(
      `UPDATE work_orders SET status='approved', updated_at=NOW()
       WHERE id=$1 AND status = 'submitted'
         AND project_id IN (SELECT id FROM projects WHERE company_id=$2)
       RETURNING *`,
      [req.params.id, req.user.company_id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Work order not found or not awaiting MD approval' });
    res.json({ data: result.rows[0], message: 'Work Order MD authorized' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PATCH /work-orders/:id/reject — reject a WO, with a mandatory reason
router.patch('/work-orders/:id/reject', authorize('super_admin', 'admin', 'project_manager', 'procurement_manager', 'managing_director', 'md', 'ceo'), async (req, res) => {
  try {
    const reason = (req.body?.reason || '').trim();
    if (!reason) return res.status(400).json({ error: 'A rejection reason is required.' });
    const result = await query(
      `UPDATE work_orders SET status='rejected', rejection_reason=$3, updated_at=NOW()
       WHERE id=$1 AND project_id IN (SELECT id FROM projects WHERE company_id=$2)
       RETURNING *`,
      [req.params.id, req.user.company_id, reason]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Work order not found' });
    res.json({ data: result.rows[0], message: 'Work Order rejected' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PATCH /work-orders/:id/terminate — close a WO mid-way when vendor abandons work
router.patch('/work-orders/:id/terminate', authorize('super_admin', 'admin', 'project_manager', 'procurement_manager', 'managing_director', 'md', 'ceo'), async (req, res) => {
  try {
    const reason = (req.body?.reason || '').trim();
    if (!reason) return res.status(400).json({ error: 'A termination reason is required.' });
    const result = await query(
      `UPDATE work_orders
       SET status='terminated', rejection_reason=$3, updated_at=NOW()
       WHERE id=$1
         AND project_id IN (SELECT id FROM projects WHERE company_id=$2)
         AND status NOT IN ('terminated','closed','rejected')
       RETURNING *, (SELECT name FROM projects WHERE id=project_id) AS project_name,
                    (SELECT name FROM users WHERE id=vendor_id) AS vendor_name_resolved`,
      [req.params.id, req.user.company_id, reason]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Work order not found or already closed/terminated.' });

    const wo = result.rows[0];
    res.json({ data: wo, message: 'Work Order terminated' });

    // Fire-and-forget email to MD, Procurement, Super Admin
    (async () => {
      try {
        const { rows: recipients } = await query(
          `SELECT DISTINCT email, name FROM users
           WHERE company_id=$1
             AND role IN ('managing_director','md','ceo','procurement_manager','super_admin')
             AND is_active=TRUE AND email IS NOT NULL`,
          [req.user.company_id]
        );
        if (!recipients.length) return;

        const terminatedBy = req.user.name || req.user.email || 'System';
        const vendorName   = wo.vendor_name || wo.vendor_name_resolved || '—';
        const woValue      = Number(wo.total_value || wo.contract_amount || 0).toLocaleString('en-IN');
        const projectName  = wo.project_name || '—';
        const erp = process.env.API_BASE_URL || 'https://erp.bcim.in';

        await sendMail({
          to: recipients.map(r => r.email),
          subject: `⚠ Work Order Terminated — ${wo.wo_number || wo.id}`,
          html: `
<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:24px 0">
<tr><td align="center">
<table width="580" cellpadding="0" cellspacing="0" style="max-width:580px;width:100%;border-collapse:collapse">
  <tr><td style="background:#7c2d12;height:4px;border-radius:6px 6px 0 0;font-size:1px">&nbsp;</td></tr>
  <tr><td style="background:#1e3a8a;padding:20px 24px">
    <p style="margin:0;color:#fff;font-size:15px;font-weight:700">BCIM CONSTRUCTIONS</p>
    <p style="margin:4px 0 0;color:#93c5fd;font-size:11px;font-weight:600;letter-spacing:1px">WORK ORDER — TERMINATION NOTICE</p>
  </td></tr>
  <tr><td style="background:#fff;padding:24px">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;margin-bottom:20px">
      <tr><td style="background:#ea580c;padding:8px 16px;border-radius:7px 7px 0 0">
        <p style="margin:0;color:#fff;font-size:11px;font-weight:700;letter-spacing:1px">TERMINATED WORK ORDER</p>
      </td></tr>
      <tr><td style="padding:16px">
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="padding:6px 0;color:#64748b;font-size:12px;width:40%">WO Number</td>
            <td style="padding:6px 0;font-size:13px;font-weight:700;color:#0f172a">${wo.wo_number || wo.id}</td>
          </tr>
          <tr>
            <td style="padding:6px 0;color:#64748b;font-size:12px;border-top:1px solid #f1f5f9">Vendor</td>
            <td style="padding:6px 0;font-size:13px;font-weight:600;color:#0f172a;border-top:1px solid #f1f5f9">${vendorName}</td>
          </tr>
          <tr>
            <td style="padding:6px 0;color:#64748b;font-size:12px;border-top:1px solid #f1f5f9">Project</td>
            <td style="padding:6px 0;font-size:13px;font-weight:600;color:#0f172a;border-top:1px solid #f1f5f9">${projectName}</td>
          </tr>
          <tr>
            <td style="padding:6px 0;color:#64748b;font-size:12px;border-top:1px solid #f1f5f9">Contract Value</td>
            <td style="padding:6px 0;font-size:13px;font-weight:700;color:#b91c1c;border-top:1px solid #f1f5f9">₹${woValue}</td>
          </tr>
          <tr>
            <td style="padding:6px 0;color:#64748b;font-size:12px;border-top:1px solid #f1f5f9">Terminated By</td>
            <td style="padding:6px 0;font-size:13px;color:#0f172a;border-top:1px solid #f1f5f9">${terminatedBy}</td>
          </tr>
        </table>
      </td></tr>
    </table>

    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px">
      <tr><td style="background:#fef9c3;border-left:4px solid #ca8a04;padding:12px 14px">
        <p style="margin:0;font-size:12px;font-weight:700;color:#713f12">Reason for Termination</p>
        <p style="margin:6px 0 0;font-size:13px;color:#78350f;line-height:1.6">${reason}</p>
      </td></tr>
    </table>

    <table cellpadding="0" cellspacing="0">
      <tr><td style="background:#1e3a8a;border-radius:6px">
        <a href="${erp}/work-orders" style="display:inline-block;color:#fff;padding:10px 22px;text-decoration:none;font-weight:700;font-size:12px">
          View Work Order in ERP →
        </a>
      </td></tr>
    </table>
  </td></tr>
  <tr><td style="background:#f8fafc;padding:14px 24px;border-top:1px solid #e2e8f0">
    <p style="margin:0;font-size:11px;color:#94a3b8">Automated alert · BCIM ERP · <a href="mailto:hr@bcim.in" style="color:#3b82f6;text-decoration:none">hr@bcim.in</a></p>
  </td></tr>
  <tr><td style="background:#1e3a8a;height:4px;border-radius:0 0 6px 6px;font-size:1px">&nbsp;</td></tr>
</table>
</td></tr></table>
</body></html>`,
          text: `Work Order Terminated\n\nWO: ${wo.wo_number || wo.id}\nVendor: ${vendorName}\nProject: ${projectName}\nValue: ₹${woValue}\nTerminated by: ${terminatedBy}\n\nReason: ${reason}\n\nView: ${erp}/work-orders`,
        });
      } catch (mailErr) {
        console.error('WO termination email failed:', mailErr.message);
      }
    })();
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Measurements (MB)
router.get('/measurements', ctrl.getMeasurements);
router.post('/measurements', authorize('super_admin', 'admin', 'project_manager', 'site_engineer'), ctrl.createMeasurement);

// Billing
router.post('/bills', authorize('super_admin', 'admin', 'accountant'), ctrl.createBill);
router.get('/bills', ctrl.getBills);
router.get('/bills/:id', ctrl.getBill);
router.patch('/bills/:id', authorize('super_admin', 'admin', 'accountant'), ctrl.updateBill);

// Bill approval workflow
router.post('/bills/:id/approve', ctrl.approveBill);
router.post('/bills/:id/reject',  ctrl.rejectBill);
router.get('/bills/:id/approvals', ctrl.getBillApprovals);

// Advances
router.get('/advances', async (req, res) => {
  try {
    const { project_id, vendor_id, wo_id } = req.query;
    const conds = [`pr.company_id = $1`];
    const params = [req.user.company_id];
    let i = 2;
    if (project_id) { conds.push(`a.project_id = $${i++}`); params.push(project_id); }
    if (vendor_id)  { conds.push(`a.vendor_id  = $${i++}`); params.push(vendor_id); }
    if (wo_id)      { conds.push(`a.wo_id      = $${i++}`); params.push(wo_id); }

    const result = await query(`
      SELECT a.*,
             v.name          AS vendor_name,
             wo.wo_number,
             pr.name         AS project_name,
             (a.amount - a.recovered_amount) AS outstanding
        FROM subcontractor_advances a
        JOIN vendors     v  ON v.id  = a.vendor_id
        JOIN work_orders wo ON wo.id = a.wo_id
        JOIN projects    pr ON pr.id = a.project_id
       WHERE ${conds.join(' AND ')}
       ORDER BY a.advance_date DESC, a.id DESC
    `, params);
    res.json({ data: result.rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/advances', authorize('super_admin', 'admin', 'project_manager', 'accountant'), async (req, res) => {
  try {
    const { wo_id, vendor_id, project_id, advance_type, amount, advance_date, notes, payment_mode, payment_ref } = req.body;
    if (!wo_id)                  return res.status(400).json({ error: 'wo_id required' });
    if (!vendor_id)              return res.status(400).json({ error: 'vendor_id required' });
    if (!project_id)             return res.status(400).json({ error: 'project_id required' });
    if (!amount || isNaN(amount)) return res.status(400).json({ error: 'amount required' });

    const result = await query(`
      INSERT INTO subcontractor_advances
        (company_id, project_id, wo_id, vendor_id, advance_type, amount, advance_date, notes, payment_mode, payment_ref, created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
      RETURNING *
    `, [
      req.user.company_id, project_id, wo_id, vendor_id,
      advance_type || 'mobilization',
      parseFloat(amount),
      advance_date || new Date().toISOString().split('T')[0],
      notes || null, payment_mode || null, payment_ref || null,
      req.user.id,
    ]);
    res.status(201).json({ data: result.rows[0], message: 'Advance recorded' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch('/advances/:id/recover', authorize('super_admin', 'admin', 'accountant'), async (req, res) => {
  try {
    const { recovery_amount, notes } = req.body;
    if (!recovery_amount || isNaN(recovery_amount)) return res.status(400).json({ error: 'recovery_amount required' });

    const existing = await query(
      `SELECT a.* FROM subcontractor_advances a
         JOIN projects p ON p.id = a.project_id
        WHERE a.id = $1 AND p.company_id = $2`,
      [req.params.id, req.user.company_id]
    );
    if (!existing.rows[0]) return res.status(404).json({ error: 'Advance not found' });

    const adv = existing.rows[0];
    const newRecovered = parseFloat(adv.recovered_amount || 0) + parseFloat(recovery_amount);
    const capped       = Math.min(newRecovered, parseFloat(adv.amount));
    const status       = capped >= parseFloat(adv.amount) ? 'fully_recovered' : 'partially_recovered';

    const result = await query(`
      UPDATE subcontractor_advances
         SET recovered_amount = $1, recovery_status = $2,
             notes = COALESCE($3, notes), updated_at = NOW()
       WHERE id = $4 RETURNING *
    `, [capped, status, notes || null, req.params.id]);
    res.json({ data: result.rows[0], message: 'Recovery recorded' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Retention releases
router.get('/retention-releases', async (req, res) => {
  try {
    const { project_id, vendor_id } = req.query;
    const conds = [`pr.company_id = $1`];
    const params = [req.user.company_id];
    let i = 2;
    if (project_id) { conds.push(`rr.project_id = $${i++}`); params.push(project_id); }
    if (vendor_id)  { conds.push(`rr.vendor_id  = $${i++}`); params.push(vendor_id); }

    const result = await query(`
      SELECT rr.*, v.name AS vendor_name, pr.name AS project_name, wo.wo_number
        FROM subcontractor_retention_releases rr
        JOIN vendors  v  ON v.id  = rr.vendor_id
        JOIN projects pr ON pr.id = rr.project_id
        LEFT JOIN work_orders wo ON wo.id = rr.wo_id
       WHERE ${conds.join(' AND ')}
       ORDER BY rr.release_date DESC, rr.id DESC
    `, params);
    res.json({ data: result.rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/retention-releases', authorize('super_admin', 'admin', 'accountant'), async (req, res) => {
  try {
    const { project_id, vendor_id, wo_id, amount, release_date, notes } = req.body;
    if (!project_id) return res.status(400).json({ error: 'project_id required' });
    if (!vendor_id)  return res.status(400).json({ error: 'vendor_id required' });
    if (!amount || isNaN(amount)) return res.status(400).json({ error: 'amount required' });

    const result = await query(`
      INSERT INTO subcontractor_retention_releases
        (company_id, project_id, vendor_id, wo_id, amount, release_date, notes, created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *
    `, [
      req.user.company_id, project_id, vendor_id,
      wo_id || null,
      parseFloat(amount),
      release_date || new Date().toISOString().split('T')[0],
      notes || null,
      req.user.id,
    ]);
    res.status(201).json({ data: result.rows[0], message: 'Retention released' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Retention summary (held vs released per vendor)
router.get('/retention-summary', async (req, res) => {
  try {
    const { project_id } = req.query;
    const conds = [`p.company_id = $1`];
    const params = [req.user.company_id];
    if (project_id) { conds.push(`b.project_id = $2`); params.push(project_id); }

    const result = await query(`
      SELECT v.id AS vendor_id, v.name AS vendor_name,
             COALESCE(SUM(b.retention_amount), 0)  AS retention_held,
             COALESCE(SUM(b.security_amount), 0)   AS security_held,
             COALESCE(
               (SELECT SUM(rr.amount)
                  FROM subcontractor_retention_releases rr
                 WHERE rr.vendor_id = v.id
                   AND rr.company_id = $1
                   ${project_id ? 'AND rr.project_id = $2' : ''}
               ), 0)                               AS retention_released,
             COALESCE(SUM(b.retention_amount), 0)
               - COALESCE(
                   (SELECT SUM(rr.amount)
                      FROM subcontractor_retention_releases rr
                     WHERE rr.vendor_id = v.id
                       AND rr.company_id = $1
                       ${project_id ? 'AND rr.project_id = $2' : ''}
                   ), 0)                           AS net_locked
        FROM subcontractor_bills b
        JOIN projects p  ON p.id  = b.project_id
        JOIN work_orders wo ON wo.id = b.wo_id
        JOIN vendors v   ON v.id  = wo.vendor_id
       WHERE ${conds.join(' AND ')}
       GROUP BY v.id, v.name
       ORDER BY net_locked DESC
    `, params);
    res.json({ data: result.rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Reports
router.get('/reports/ledger',             ctrl.reportLedger);
router.get('/reports/deduction-summary',  ctrl.reportDeductionSummary);
router.get('/reports/wo-utilization',     ctrl.reportWOUtilization);

// Subcontractor portal (vendor-restricted)
router.get('/portal/my-bills', ctrl.portalMyBills);

// POST /subcontractors/work-orders/import/preview
router.post('/work-orders/import/preview', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No PDF file uploaded' });
    if (req.file.mimetype !== 'application/pdf') return res.status(400).json({ error: 'Only PDF files are supported' });
    const result = await extractWO(req.file.buffer);
    res.json(result);
  } catch (err) {
    console.error('[WO Import Preview]:', err.message);
    res.status(500).json({ error: err.message || 'Failed to parse PDF' });
  }
});

// POST /subcontractors/work-orders/import/confirm
router.post('/work-orders/import/confirm', async (req, res) => {
  try {
    const { project_id, vendor_id, header = {}, items = [] } = req.body;
    if (!project_id || !vendor_id) return res.status(400).json({ error: 'Project and Vendor are required' });

    const result = await withTransaction(async (client) => {
      const projRes = await client.query('SELECT project_code FROM projects WHERE id = $1', [project_id]);
      const wo_number = String(header.wo_number || '').trim().toUpperCase()
        || await getNextDqsNumber(client, 'work_orders', projRes.rows[0]?.project_code);

      // Calculate total from items
      let total_value = parseFloat(header.total_value) || 0;
      const processedItems = (items || []).map(it => ({
        description: it.description || 'Item',
        unit: it.unit || 'LS',
        quantity: parseFloat(it.quantity) || 0,
        rate: parseFloat(it.rate) || 0,
        remarks: it.remarks || '',
      }));
      if (!total_value && processedItems.length) {
        total_value = processedItems.reduce((s, it) => s + it.quantity * it.rate, 0);
      }

      const subject = header.subject || 'Imported Work Order';
      const scope = header.scope_of_work || '';
      const dup = await client.query('SELECT id FROM work_orders WHERE UPPER(TRIM(wo_number)) = $1', [wo_number]);
      if (dup.rows.length) throw new Error(`Work Order ${wo_number} already exists`);

      const woRow = await client.query(
        `INSERT INTO work_orders
           (project_id, vendor_id, wo_number, subject, scope_of_work,
            work_description, start_date, end_date, total_value, contract_amount,
            status, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$9,'draft',$10) RETURNING id, wo_number`,
        [
          project_id, vendor_id, wo_number,
          subject,
          scope,
          scope || subject,
          header.start_date || header.wo_date || null, header.end_date || null,
          total_value,
          req.user.id,
        ]
      );
      const wo_id = woRow.rows[0].id;

      for (const it of processedItems) {
        await client.query(
          `INSERT INTO work_order_items (wo_id, description, unit, quantity, rate, remarks)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [wo_id, it.description, it.unit, parseFloat(it.quantity) || 0, parseFloat(it.rate) || 0, it.remarks || null]
        );
      }

      return woRow.rows[0];
    });

    res.json({ success: true, wo_number: result.wo_number, id: result.id });
  } catch (err) {
    console.error('[WO Import Confirm]:', err.message);
    res.status(500).json({ error: err.message || 'Failed to save Work Order' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /subcontractors/work-orders/import/template — download Excel template
router.get('/work-orders/import/template', (req, res) => {
  try {
    const XLSX = require('xlsx');
    const headers = [
      'WO Number *', 'Vendor Name *', 'Project Name *',
      'Subject / Scope *', 'Start Date (dd-mm-yyyy)', 'End Date (dd-mm-yyyy)',
      'Total Value (₹) *', 'Status (draft/pending/approved)',
      'Scope of Work / Description',
    ];
    const sample = [
      'WO-2025-001', 'ABC Contractors Pvt Ltd', 'Residential Apartments - Yelahanka',
      'External Plaster Work - Block B', '01-04-2025', '30-06-2025',
      '450000', 'approved', 'Complete external plaster for Block B as per drawings',
    ];
    const ws = XLSX.utils.aoa_to_sheet([headers, sample]);
    ws['!cols'] = headers.map(() => ({ wch: 30 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Work Orders');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Disposition', 'attachment; filename="WO_Import_Template.xlsx"');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buf);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /subcontractors/work-orders/import/excel — upload Excel, preview rows
const multerMem2 = require('multer')({ storage: require('multer').memoryStorage() });
router.post('/work-orders/import/excel', multerMem2.single('file'), async (req, res) => {
  try {
    const XLSX = require('xlsx');
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const parseDate = (v) => {
      if (!v) return null;
      if (v instanceof Date) return v.toISOString().slice(0, 10);
      const s = String(v).trim();
      const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
      if (m) {
        const yr = m[3].length === 2 ? '20' + m[3] : m[3];
        return `${yr}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
      }
      const d = new Date(s);
      return isNaN(d) ? null : d.toISOString().slice(0, 10);
    };

    const wb = XLSX.read(req.file.buffer, { type: 'buffer', cellDates: true });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });

    // Fetch vendors + projects for matching
    const vendorsRes  = await query(`SELECT id, name FROM vendors   WHERE company_id=$1 AND is_active=TRUE`, [req.user.company_id]);
    const projectsRes = await query(`SELECT id, name FROM projects   WHERE company_id=$1`, [req.user.company_id]);
    const vendorMap   = Object.fromEntries(vendorsRes.rows.map(v => [v.name.toLowerCase(), v.id]));
    const projectMap  = Object.fromEntries(projectsRes.rows.map(p => [p.name.toLowerCase(), p.id]));

    const preview = [], errors = [];
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const rowNum = i + 2;
      const woNum    = String(r['WO Number *'] || r['WO Number'] || '').trim();
      const vName    = String(r['Vendor Name *'] || r['Vendor Name'] || '').trim();
      const pName    = String(r['Project Name *'] || r['Project Name'] || '').trim();
      const subject  = String(r['Subject / Scope *'] || r['Subject'] || '').trim();
      const totalVal = parseFloat(r['Total Value (₹) *'] || r['Total Value'] || 0);

      if (!woNum)    { errors.push({ row: rowNum, reason: 'WO Number required' });   continue; }
      if (!vName)    { errors.push({ row: rowNum, reason: 'Vendor Name required' }); continue; }
      if (!pName)    { errors.push({ row: rowNum, reason: 'Project Name required' }); continue; }
      if (!totalVal) { errors.push({ row: rowNum, reason: 'Total Value required' });  continue; }

      // Fuzzy vendor match
      const vendorId = vendorMap[vName.toLowerCase()] ||
        Object.entries(vendorMap).find(([k]) => k.includes(vName.toLowerCase()) || vName.toLowerCase().includes(k))?.[1];
      const projectId = projectMap[pName.toLowerCase()] ||
        Object.entries(projectMap).find(([k]) => k.includes(pName.toLowerCase()) || pName.toLowerCase().includes(k))?.[1];

      preview.push({
        row: rowNum, wo_number: woNum,
        vendor_name: vName, vendor_id: vendorId || null,
        project_name: pName, project_id: projectId || null,
        subject,
        start_date: parseDate(r['Start Date (dd-mm-yyyy)'] || r['Start Date']),
        end_date:   parseDate(r['End Date (dd-mm-yyyy)']   || r['End Date']),
        total_value: totalVal,
        status:      ['draft','pending','approved'].includes(String(r['Status (draft/pending/approved)'] || r['Status'] || '').toLowerCase()) ? String(r['Status (draft/pending/approved)'] || r['Status']).toLowerCase() : 'approved',
        scope_of_work: String(r['Scope of Work / Description'] || r['Scope of Work'] || '').trim(),
        vendor_matched: !!vendorId,
        project_matched: !!projectId,
      });
    }

    res.json({
      preview,
      errors,
      vendors: vendorsRes.rows,
      projects: projectsRes.rows,
      summary: { total: rows.length, valid: preview.length, error_count: errors.length },
    });
  } catch (err) {
    console.error('[WO Excel Import]:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /subcontractors/work-orders/bulk-import
// Bulk-insert historical Work Orders.
// Body: { project_id, records: [{ wo_number, vendor_id, wo_date, start_date,
//          end_date, subject, total_value, status }] }
// Returns: { created, skipped, errors: [{wo_number, reason}] }
// ─────────────────────────────────────────────────────────────────────────────
router.post('/work-orders/bulk-import', async (req, res) => {
  try {
    const { project_id, records = [] } = req.body;
    if (!project_id)     return res.status(400).json({ error: 'project_id is required' });
    if (!records.length) return res.status(400).json({ error: 'No records provided' });

    let created = 0, skipped = 0;
    const errors = [];

    for (const rec of records) {
      try {
        const woNumber = String(rec.wo_number || '').trim().toUpperCase();
        if (!woNumber) { errors.push({ wo_number: '?', reason: 'wo_number missing' }); continue; }
        if (!rec.vendor_id) { errors.push({ wo_number: woNumber, reason: 'vendor_id missing' }); continue; }

        // Check duplicate after normalizing case/spacing so re-imports stay idempotent.
        const dup = await query('SELECT id FROM work_orders WHERE UPPER(TRIM(wo_number)) = $1', [woNumber]);
        if (dup.rows.length) { skipped++; continue; }

        const subject = rec.subject || woNumber;
        const totalValue = parseFloat(rec.total_value) || 0;
        await query(
          `INSERT INTO work_orders
             (project_id, vendor_id, wo_number, subject, scope_of_work,
              work_description, start_date, end_date, total_value, contract_amount,
              status, created_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$9,$10,$11)`,
          [
            project_id, rec.vendor_id, woNumber,
            subject,
            rec.scope_of_work || '',
            rec.scope_of_work || subject,
            rec.start_date || rec.wo_date || null,
            rec.end_date   || null,
            totalValue,
            rec.status || 'approved',
            req.user.id,
          ]
        );
        created++;
      } catch (e) {
        errors.push({ wo_number: rec.wo_number || '?', reason: e.message });
      }
    }

    res.json({ created, skipped, errors });
  } catch (err) {
    console.error('[WO Bulk Import]:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
