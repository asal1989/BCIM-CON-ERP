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

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

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
router.delete('/work-orders/:id', authorize(...PROCUREMENT_ROLES), async (req, res) => {
  try {
    const before = await query(`SELECT wo_number, subject, status, total_value FROM work_orders WHERE id = $1`, [req.params.id]);
    const result = await query(
      `DELETE FROM work_orders WHERE id = $1 AND project_id IN (SELECT id FROM projects WHERE company_id = $2) RETURNING id`,
      [req.params.id, req.user.company_id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Work Order not found' });
    await logAudit(req, { action: 'delete', tableName: 'work_orders', recordId: req.params.id, oldValues: before.rows[0] });
    res.json({ message: 'Work Order deleted' });
  } catch (err) {
    if (err.code === '23503') return res.status(409).json({ error: 'Cannot delete — this Work Order has linked bills or measurements' });
    res.status(500).json({ error: err.message });
  }
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
