// src/routes/quality.routes.js
const express = require('express');
const router = express.Router();
const { query } = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');
const { loadProjectScope, appendProjectScope } = require('../middleware/projectScope');
const dayjs = require('dayjs');
const { notifyNcrRaised } = require('../services/notif.helper');
// Lazy-loaded at module level to avoid circular require at load time
// (quality-pour depends on quality.routes for the lab-test route, and vice-versa)
let _evaluateCubeResultAndChain = null;
function getEvaluateFn() {
  if (!_evaluateCubeResultAndChain) {
    _evaluateCubeResultAndChain = require('./quality-pour.routes').evaluateCubeResultAndChain;
  }
  return _evaluateCubeResultAndChain;
}

router.use(authenticate);
router.use(loadProjectScope);

async function tableExists(tableName) {
    const r = await query('SELECT to_regclass($1) AS table_name', [tableName]);
    return Boolean(r.rows[0]?.table_name);
}

// --- 1. Drawing Register (The Source of Truth) ---
router.get('/drawings', async (req, res) => {
    const { project_id } = req.query;
    let sql = `SELECT d.*, p.name as project_name 
               FROM quality_drawings d 
               JOIN projects p ON d.project_id = p.id 
               WHERE p.company_id = $1`;
    let params = [req.user.company_id];
    if (project_id) { sql += ` AND d.project_id = $2`; params.push(project_id); }
    ({ sql, params } = appendProjectScope(req, sql, params, 'd'));
    sql += ' ORDER BY d.drawing_number ASC';
    const r = await query(sql, params);
    res.json({ data: r.rows });
});

router.post('/drawings', authorize('admin', 'project_manager'), async (req, res) => {
    const { project_id, drawing_number, title, discipline, revision, status, file_path } = req.body;
    const r = await query(
        `INSERT INTO quality_drawings (project_id, drawing_number, title, discipline, revision, status, file_path)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
        [project_id, drawing_number, title, discipline, revision || '0', status || 'ifc', file_path]
    );
    res.status(201).json({ data: r.rows[0] });
});

// --- 2. Material Submittals ---
router.get('/submittals', async (req, res) => {
  try {
    const { project_id } = req.query;
    let sql = `SELECT s.*, p.name as project_name, v.name as vendor_name
               FROM quality_submittals s
               JOIN projects p ON s.project_id = p.id
               LEFT JOIN vendors v ON s.vendor_id = v.id
               WHERE p.company_id = $1`;
    let params = [req.user.company_id];
    if (project_id) { sql += ` AND s.project_id=$2`; params.push(project_id); }
    ({ sql, params } = appendProjectScope(req, sql, params, 's'));
    sql += ' ORDER BY s.created_at DESC';
    const r = await query(sql, params);
    res.json({ data: r.rows });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.post('/submittals', authorize('admin','super_admin','project_manager','site_engineer'), async (req, res) => {
  try {
    const { project_id, title, description, material_name, vendor_name, category,
            status, submitted_at, review_date, remarks } = req.body;
    if (!project_id || !title) return res.status(400).json({ error: 'project_id and title required' });
    // Auto-generate submittal number
    const cnt = (await query(`SELECT COALESCE(MAX(CAST(REGEXP_REPLACE(submittal_number, '^.*-', '') AS INTEGER)), 0) AS last_seq
                              FROM quality_submittals WHERE project_id=$1 AND submittal_number ~ '[0-9]+$'`,[project_id])).rows[0].last_seq;
    const submittal_number = `SUB-${String(parseInt(cnt)+1).padStart(3,'0')}`;
    const r = await query(`
      INSERT INTO quality_submittals (project_id, submittal_number, title, description,
        material_name, vendor_name, category, status, submitted_at, review_date, remarks, created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [project_id, submittal_number, title, description||null, material_name||null,
       vendor_name||null, category||'General', status||'pending',
       submitted_at||new Date().toISOString().slice(0,10),
       review_date||null, remarks||null, req.user.id]);
    res.status(201).json({ data: r.rows[0] });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.patch('/submittals/:id', authorize('admin','super_admin','project_manager'), async (req, res) => {
  try {
    const { status, review_date, remarks } = req.body;
    const r = await query(`
      UPDATE quality_submittals SET status=COALESCE($1,status),
        review_date=COALESCE($2,review_date), remarks=COALESCE($3,remarks)
      WHERE id=$4 RETURNING *`,
      [status, review_date||null, remarks||null, req.params.id]);
    res.json({ data: r.rows[0] });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// --- 2b. QA/QC Transmittals ---
router.get('/transmittals', async (req, res) => {
  try {
    const { project_id, status } = req.query;
    let sql = `SELECT t.*, p.name AS project_name, u.name AS created_by_name
               FROM quality_transmittals t
               JOIN projects p ON t.project_id=p.id
               LEFT JOIN users u ON u.id=t.created_by
               WHERE p.company_id=$1`;
    let params = [req.user.company_id]; let i=2;
    if (project_id) { sql += ` AND t.project_id=$${i++}`; params.push(project_id); }
    if (status)     { sql += ` AND t.status=$${i++}`;     params.push(status); }
    ({ sql, params } = appendProjectScope(req, sql, params, 't'));
    sql += ' ORDER BY t.transmittal_date DESC, t.created_at DESC';
    res.json({ data: (await query(sql, params)).rows });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.post('/transmittals', authorize('admin','super_admin','project_manager','site_engineer'), async (req, res) => {
  try {
    const { project_id, transmittal_date, to_party, to_contact, to_email, from_party,
            subject, purpose, delivery_method, documents, remarks } = req.body;
    if (!project_id || !to_party || !subject) return res.status(400).json({ error: 'project_id, to_party, subject required' });
    const cnt = (await query(`SELECT COALESCE(MAX(CAST(REGEXP_REPLACE(transmittal_no, '^.*-', '') AS INTEGER)), 0) AS last_seq
                              FROM quality_transmittals WHERE project_id=$1 AND transmittal_no ~ '[0-9]+$'`,[project_id])).rows[0].last_seq;
    const transmittal_no = `TRS-${String(parseInt(cnt)+1).padStart(3,'0')}`;
    const r = await query(`
      INSERT INTO quality_transmittals (project_id, transmittal_no, transmittal_date,
        to_party, to_contact, to_email, from_party, subject, purpose, delivery_method,
        documents, remarks, status, sent_date, created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'sent',$3,$13) RETURNING *`,
      [project_id, transmittal_no, transmittal_date||new Date().toISOString().slice(0,10),
       to_party, to_contact||null, to_email||null, from_party||'BCIM Engineering Pvt Ltd',
       subject, purpose||'information', delivery_method||'email',
       JSON.stringify(documents||[]), remarks||null, req.user.id]);
    res.status(201).json({ data: r.rows[0] });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.patch('/transmittals/:id/acknowledge', async (req, res) => {
  try {
    const { ack_date, ack_by, ack_remarks } = req.body;
    const r = await query(`
      UPDATE quality_transmittals SET status='acknowledged',
        ack_date=COALESCE($1,CURRENT_DATE), ack_by=$2, ack_remarks=$3, updated_at=NOW()
      WHERE id=$4 RETURNING *`,
      [ack_date||null, ack_by||null, ack_remarks||null, req.params.id]);
    res.json({ data: r.rows[0] });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.delete('/transmittals/:id', authorize('admin','super_admin'), async (req, res) => {
  try {
    await query('DELETE FROM quality_transmittals WHERE id=$1', [req.params.id]);
    res.json({ message: 'Deleted' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// --- 3. Enhanced RFI Sign-off ---
router.get('/rfi', async (req, res) => {
  try {
    if (!(await tableExists('quality_rfis'))) return res.json({ data: [] });
    const { project_id, status } = req.query;
    let sql = `SELECT q.*, p.name as project_name, u1.name as raised_by_name, u2.name as inspected_by_name,
               c.name as checklist_name, d.drawing_number, d.title as drawing_title,
               itp.itp_number, itp.title as itp_title,
               act.activity_name as itp_activity_name, act.point_type as itp_point_type
               FROM quality_rfis q
               JOIN projects p ON q.project_id = p.id
               LEFT JOIN users u1 ON q.raised_by = u1.id
               LEFT JOIN users u2 ON q.inspected_by = u2.id
               LEFT JOIN quality_checklists c ON q.checklist_id = c.id
               LEFT JOIN quality_drawings d ON q.drawing_id = d.id
               LEFT JOIN quality_itps itp ON q.itp_id = itp.id
               LEFT JOIN quality_itp_activities act ON q.itp_activity_id = act.id
               WHERE p.company_id = $1`;
    let params = [req.user.company_id];
    let i = 2;
    if (project_id) { sql += ` AND q.project_id = $${i++}`; params.push(project_id); }
    if (status) { sql += ` AND q.status = $${i++}`; params.push(status); }
    ({ sql, params } = appendProjectScope(req, sql, params, 'q'));
    sql += ' ORDER BY q.created_at DESC';
    res.json({ data: (await query(sql, params)).rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/rfi', async (req, res) => {
    const { project_id, checklist_id, drawing_id, location, activity_name, scheduled_at,
            inspection_type, itp_id, itp_activity_id, hold_point_type, stage } = req.body;
    const count = (await query(`SELECT COALESCE(MAX(CAST(REGEXP_REPLACE(q.rfi_number, '^.*-', '') AS INTEGER)), 0) AS last_seq
                                FROM quality_rfis q JOIN projects p ON q.project_id = p.id
                                WHERE p.company_id = $1 AND q.rfi_number ~ '[0-9]+$'`, [req.user.company_id])).rows[0].last_seq;
    const num = `RFI-${dayjs().year()}-${String(parseInt(count) + 1).padStart(4, '0')}`;
    // WIR number mirrors RFI for work-inspection requests at hold/witness points
    const wir = (hold_point_type === 'H' || hold_point_type === 'W')
      ? `WIR-${dayjs().year()}-${String(parseInt(count) + 1).padStart(4, '0')}` : null;
    const r = await query(
        `INSERT INTO quality_rfis
           (project_id, rfi_number, checklist_id, drawing_id, location, activity_name,
            scheduled_at, inspection_type, itp_id, itp_activity_id, hold_point_type,
            stage, wir_number, raised_by, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'raised') RETURNING *`,
        [project_id, num, checklist_id || null, drawing_id || null, location || null,
         activity_name, scheduled_at || null, inspection_type || 'internal',
         itp_id || null, itp_activity_id || null, hold_point_type || null,
         stage || null, wir, req.user.id]
    );
    res.status(201).json({ data: r.rows[0] });
});

router.patch('/rfi/:id/sign', async (req, res) => {
    const { role, name, sign_data } = req.body;
    const rfi = (await query('SELECT signatures FROM quality_rfis WHERE id=$1', [req.params.id])).rows[0];
    const sigs = rfi.signatures || [];
    sigs.push({ role, name, sign_data, date: new Date() });
    
    const r = await query(
        'UPDATE quality_rfis SET signatures=$1 WHERE id=$2 RETURNING *',
        [JSON.stringify(sigs), req.params.id]
    );
    res.json({ data: r.rows[0] });
});

router.patch('/rfi/:id/attachments', async (req, res) => {
    const { attachments } = req.body; // array of { url, name, size }
    const r = await query(
        'UPDATE quality_rfis SET attachments=$1, updated_at=NOW() WHERE id=$2 RETURNING *',
        [JSON.stringify(attachments || []), req.params.id]
    );
    res.json({ data: r.rows[0] });
});

router.patch('/rfi/:id/inspect', authorize('admin', 'quality_manager'), async (req, res) => {
    const { status, remarks } = req.body;
    const r = await query(
        `UPDATE quality_rfis SET status=$1, remarks=$2, inspected_by=$3, inspected_at=NOW()
         WHERE id=$4 RETURNING *`,
        [status, remarks || null, req.user.id, req.params.id]
    );
    res.json({ data: r.rows[0] });
});

// --- 4. Forensic NCR Lifecycle ---
router.get('/ncr', async (req, res) => {
  try {
    if (!(await tableExists('quality_ncrs'))) return res.json({ data: [] });
    const r = await query(
        `SELECT n.*, p.name as project_name, u1.name as raised_by_name, u2.name as assigned_to_name,
         r.rfi_number, r.activity_name as rfi_activity
         FROM quality_ncrs n
         JOIN projects p ON n.project_id = p.id
         LEFT JOIN users u1 ON n.raised_by = u1.id
         LEFT JOIN users u2 ON n.assigned_to = u2.id
         LEFT JOIN quality_rfis r ON n.rfi_id = r.id
         WHERE p.company_id = $1 ORDER BY n.created_at DESC`,
        [req.user.company_id]
    );
    res.json({ data: r.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/ncr', async (req, res) => {
    const { project_id, rfi_id, title, description, assigned_to, priority, issue_type, severity } = req.body;
    const count = (await query(`SELECT COALESCE(MAX(CAST(REGEXP_REPLACE(q.ncr_number, '^.*-', '') AS INTEGER)), 0) AS last_seq
                                FROM quality_ncrs q JOIN projects p ON q.project_id = p.id
                                WHERE p.company_id = $1 AND q.ncr_number ~ '[0-9]+$'`, [req.user.company_id])).rows[0].last_seq;
    const num = `NCR-${dayjs().year()}-${String(parseInt(count) + 1).padStart(4, '0')}`;
    
    const r = await query(
        `INSERT INTO quality_ncrs (project_id, ncr_number, rfi_id, title, description, raised_by, assigned_to, priority, issue_type, severity, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'open') RETURNING *`,
        [project_id, num, rfi_id || null, title, description, req.user.id, assigned_to || null, priority || 'medium', issue_type || 'quality', severity || 'minor']
    );
    // Notify PM and QS about new NCR
    notifyNcrRaised(req.user.company_id, r.rows[0], req.user.name);
    res.status(201).json({ data: r.rows[0] });
});

router.patch('/ncr/:id/attachments', async (req, res) => {
    const { attachments } = req.body;
    const r = await query(
        'UPDATE quality_ncrs SET attachments=$1, updated_at=NOW() WHERE id=$2 RETURNING *',
        [JSON.stringify(attachments || []), req.params.id]
    );
    res.json({ data: r.rows[0] });
});

router.patch('/ncr/:id/rca', async (req, res) => {
    try {
        const {
            rca_method, rca_details, rectification_plan, resolution_deadline,
            corrective_action, preventive_action, capa_due_date
        } = req.body;
        const r = await query(
            `UPDATE quality_ncrs SET
               rca_method=$1, rca_details=$2, rectification_plan=$3, resolution_deadline=$4,
               corrective_action=$5, preventive_action=$6, capa_due_date=$7,
               status='under_review', updated_at=NOW()
             WHERE id=$8 AND project_id IN (SELECT id FROM projects WHERE company_id=$9)
             RETURNING *`,
            [rca_method || null, JSON.stringify(rca_details || {}),
             rectification_plan || null, resolution_deadline || null,
             corrective_action || null, preventive_action || null,
             capa_due_date || null, req.params.id, req.user.company_id]
        );
        if (!r.rows.length) return res.status(404).json({ error: 'NCR not found' });
        res.json({ data: r.rows[0] });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch('/ncr/:id/verify', authorize('admin', 'hse_officer'), async (req, res) => {
    const { evidence_after, remarks } = req.body;
    const r = await query(
        `UPDATE quality_ncrs SET evidence_after=$1, status='closed', closed_at=NOW()
         WHERE id=$2 RETURNING *`,
        [JSON.stringify(evidence_after), req.params.id]
    );
    res.json({ data: r.rows[0] });
});

// --- 5. Shared Checklist API ---
router.get('/checklists', async (req, res) => {
    const r = await query('SELECT * FROM quality_checklists WHERE company_id=$1 AND is_active=true', [req.user.company_id]);
    res.json({ data: r.rows });
});

router.post('/checklists', authorize('admin', 'quality_manager'), async (req, res) => {
    const { name, category, items, use_as_pre_pour, use_as_post_pour, discipline } = req.body;
    const r = await query(
        `INSERT INTO quality_checklists
           (company_id, name, category, items, use_as_pre_pour, use_as_post_pour, discipline, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
        [req.user.company_id, name, category || 'general', JSON.stringify(items || []),
         use_as_pre_pour || false, use_as_post_pour || false, discipline || null, req.user.id]
    );
    res.status(201).json({ data: r.rows[0] });
});

// --- 6. Lab Tests ---
router.get('/lab-tests', async (req, res) => {
    const { project_id } = req.query;
    let sql = `SELECT l.*, p.name as project_name, u.name as requested_by_name 
               FROM quality_lab_tests l 
               JOIN projects p ON l.project_id = p.id 
               LEFT JOIN users u ON l.requested_by = u.id
               WHERE p.company_id = $1`;
    let params = [req.user.company_id];
    if (project_id) { sql += ` AND l.project_id = $2`; params.push(project_id); }
    ({ sql, params } = appendProjectScope(req, sql, params, 'l'));
    sql += ' ORDER BY l.created_at DESC';
    const r = await query(sql, params);
    res.json({ data: r.rows });
});

router.patch('/lab-tests/:id/attachments', async (req, res) => {
    const { attachments } = req.body;
    const r = await query(
        'UPDATE quality_lab_tests SET attachments=$1, updated_at=NOW() WHERE id=$2 RETURNING *',
        [JSON.stringify(attachments || []), req.params.id]
    );
    res.json({ data: r.rows[0] });
});

router.post('/lab-tests', async (req, res) => {
    const {
        project_id, material_name, material_type, test_name, lab_name,
        sample_location, batch_number, request_date, result_status, result_value,
        status, result, remarks, attachments
    } = req.body;
    const count = (await query(`SELECT COALESCE(MAX(CAST(REGEXP_REPLACE(l.test_number, '^.*-', '') AS INTEGER)), 0) AS last_seq
                                FROM quality_lab_tests l JOIN projects p ON l.project_id = p.id
                                WHERE p.company_id = $1 AND l.test_number ~ '[0-9]+$'`, [req.user.company_id])).rows[0].last_seq;
    const num = `LT-${dayjs().year()}-${String(parseInt(count) + 1).padStart(4, '0')}`;

    const r = await query(
        `INSERT INTO quality_lab_tests
           (project_id, test_number, material_name, material_type, test_name, lab_name,
            sample_location, batch_number, request_date, result_status, result_value,
            status, remarks, attachments, requested_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,
        [
            project_id, num,
            material_name || null, material_type || null,
            test_name, lab_name || null,
            sample_location || null, batch_number || null,
            request_date || new Date(),
            result_status || 'pending',
            result_value || null,
            status || 'pending',
            remarks || null,
            JSON.stringify(attachments || []),
            req.user.id
        ]
    );
    res.status(201).json({ data: r.rows[0] });
});

// PATCH /lab-tests/:id — full update incl. 7/28-day results + pour-card link.
// Triggers auto-NCR chain when a 28-day cube result fails acceptance.
router.patch('/lab-tests/:id', async (req, res) => {
    try {
        const {
            material_name, material_type, test_category, test_name, lab_name,
            sample_location, batch_number, request_date, result_status, result_value,
            status, remarks, target_strength, test_age_days,
            result_7day, result_28day, acceptance_criteria, pour_card_id
        } = req.body;

        // ownership check
        const own = await query(
            `SELECT l.id FROM quality_lab_tests l JOIN projects p ON l.project_id=p.id
             WHERE l.id=$1 AND p.company_id=$2`, [req.params.id, req.user.company_id]);
        if (!own.rows.length) return res.status(404).json({ error: 'Lab test not found' });

        const r = await query(
            `UPDATE quality_lab_tests SET
               material_name      = COALESCE($1, material_name),
               material_type      = COALESCE($2, material_type),
               test_category      = COALESCE($3, test_category),
               test_name          = COALESCE($4, test_name),
               lab_name           = COALESCE($5, lab_name),
               sample_location    = COALESCE($6, sample_location),
               batch_number       = COALESCE($7, batch_number),
               request_date       = COALESCE($8, request_date),
               result_status      = COALESCE($9, result_status),
               result_value       = COALESCE($10, result_value),
               status             = COALESCE($11, status),
               remarks            = COALESCE($12, remarks),
               target_strength    = COALESCE($13, target_strength),
               test_age_days      = COALESCE($14, test_age_days),
               result_7day        = COALESCE($15, result_7day),
               result_28day       = COALESCE($16, result_28day),
               acceptance_criteria= COALESCE($17, acceptance_criteria),
               pour_card_id       = COALESCE($18, pour_card_id),
               updated_at         = NOW()
             WHERE id=$19 RETURNING *`,
            [material_name ?? null, material_type ?? null, test_category ?? null,
             test_name ?? null, lab_name ?? null, sample_location ?? null,
             batch_number ?? null, request_date ?? null, result_status ?? null,
             result_value ?? null, status ?? null, remarks ?? null,
             target_strength ?? null, test_age_days ?? null,
             result_7day ?? null, result_28day ?? null,
             acceptance_criteria ?? null, pour_card_id ?? null, req.params.id]);

        // Auto-NCR chain when this lab test is tied to a pour card and has a 28-day result
        let chain = null;
        if (r.rows[0].pour_card_id && result_28day != null) {
            try {
                chain = await getEvaluateFn()({
                    labTestId: req.params.id,
                    companyId: req.user.company_id,
                    userId: req.user.id,
                });
            } catch (e) { /* chain best-effort */ }
        }

        // re-fetch to reflect any chain updates (is_failed, ncr_id)
        const fresh = await query('SELECT * FROM quality_lab_tests WHERE id=$1', [req.params.id]);
        res.json({ data: fresh.rows[0], chain });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- 7. Dashboard Stats ---
router.get('/stats', async (req, res) => {
  try {
    const { project_id } = req.query;
    const cid = req.user.company_id;
    const projClause = project_id ? 'AND project_id = $2' : '';
    const projParam  = project_id ? [cid, project_id] : [cid];
    const baseProj   = `project_id IN (SELECT id FROM projects WHERE company_id=$1)`;

    const safe = async (sql, params = projParam) => {
      try { return (await query(sql, params)).rows; } catch { return []; }
    };

    // RFI
    const rfi = await safe(`
      SELECT status, COUNT(*) AS c FROM quality_rfis
       WHERE ${baseProj} ${projClause} GROUP BY status`);
    // NCR
    const ncr = await safe(`
      SELECT status, severity, source, COUNT(*) AS c FROM quality_ncrs
       WHERE ${baseProj} ${projClause} GROUP BY status, severity, source`);
    // Lab tests
    const lab = await safe(`
      SELECT result_status, COUNT(*) AS c FROM quality_lab_tests
       WHERE ${baseProj} ${projClause} GROUP BY result_status`);
    // Pour cards
    const pour = await safe(`
      SELECT status, COUNT(*) AS c FROM quality_pour_cards
       WHERE ${baseProj} ${projClause} GROUP BY status`);
    // MIR
    const mir = await safe(`
      SELECT status, COUNT(*) AS c FROM quality_mir
       WHERE ${baseProj} ${projClause} GROUP BY status`);
    // MTC
    const mtc = await safe(`
      SELECT status, auto_result, COUNT(*) AS c FROM quality_mtc
       WHERE ${baseProj} ${projClause} GROUP BY status, auto_result`);
    // Snags
    const snag = await safe(`
      SELECT status, COUNT(*) AS c FROM snag_items
       WHERE ${baseProj} ${projClause} GROUP BY status`);
    // Audits
    const audit = await safe(`
      SELECT a.status, COUNT(*) AS c FROM quality_audits a
       WHERE a.company_id=$1 ${project_id ? 'AND a.project_id=$2' : ''} GROUP BY a.status`);
    // Open audit findings
    const findings = await safe(`
      SELECT f.status, f.finding_type, COUNT(*) AS c
        FROM quality_audit_findings f
        JOIN quality_audits a ON f.audit_id = a.id
       WHERE a.company_id=$1 ${project_id ? 'AND a.project_id=$2' : ''}
       GROUP BY f.status, f.finding_type`);

    const sumBy = (rows, key, val) => rows.filter(r => !val || r[key] === val)
      .reduce((s, r) => s + parseInt(r.c, 10), 0);

    const labPass = sumBy(lab, 'result_status', 'pass');
    const labTotal = lab.reduce((s, r) => s + parseInt(r.c, 10), 0);

    res.json({
      data: {
        rfi: {
          total: rfi.reduce((s,r)=>s+ +r.c,0),
          raised: sumBy(rfi,'status','raised'),
          approved: sumBy(rfi,'status','approved'),
          rejected: sumBy(rfi,'status','rejected'),
        },
        ncr: {
          total: ncr.reduce((s,r)=>s+ +r.c,0),
          open: sumBy(ncr,'status','open'),
          closed: sumBy(ncr,'status','closed'),
          critical: sumBy(ncr,'severity','critical'),
          auto_lab: sumBy(ncr,'source','lab_failure'),
          auto_audit: sumBy(ncr,'source','audit_finding'),
        },
        lab: {
          total: labTotal,
          pass: labPass,
          fail: sumBy(lab,'result_status','fail'),
          pending: sumBy(lab,'result_status','pending'),
          pass_rate: labTotal ? Math.round((labPass/labTotal)*100) : 0,
        },
        pour: {
          total: pour.reduce((s,r)=>s+ +r.c,0),
          certs_pending: sumBy(pour,'status','certs_pending'),
          closed: sumBy(pour,'status','closed'),
          rejected: sumBy(pour,'status','rejected'),
        },
        mir: {
          total: mir.reduce((s,r)=>s+ +r.c,0),
          pending: sumBy(mir,'status','pending'),
          approved: sumBy(mir,'status','approved') + sumBy(mir,'status','conditionally_approved'),
          rejected: sumBy(mir,'status','rejected'),
        },
        mtc: {
          total: mtc.reduce((s,r)=>s+ +r.c,0),
          pending_review: sumBy(mtc,'status','pending_review'),
          accepted: sumBy(mtc,'status','accepted'),
          fail: sumBy(mtc,'auto_result','fail'),
        },
        snag: {
          total: snag.reduce((s,r)=>s+ +r.c,0),
          open: sumBy(snag,'status','open'),
          closed: sumBy(snag,'status','closed'),
        },
        audit: {
          total: audit.reduce((s,r)=>s+ +r.c,0),
          completed: sumBy(audit,'status','completed') + sumBy(audit,'status','closed'),
          open_findings: findings.filter(f => ['open','in_progress'].includes(f.status)).reduce((s,r)=>s+ +r.c,0),
          major_nc: sumBy(findings,'finding_type','major_nc'),
        },
      }
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
