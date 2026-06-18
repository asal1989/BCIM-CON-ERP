// src/routes/quality-audit.routes.js
// Quality Audits + Audit Findings (auto-NCR on major non-conformance)

const express = require('express');
const router  = express.Router();
const dayjs   = require('dayjs');
const { query } = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');
const { loadProjectScope, appendProjectScope } = require('../middleware/projectScope');
const { createNotification } = require('../controllers/notification.controller');

router.use(authenticate);
router.use(loadProjectScope);

// MAX-based (avoids number reuse when a record is deleted)
async function nextAudit(companyId, db = query) {
  const r = await db(`SELECT COALESCE(MAX(CAST(REGEXP_REPLACE(audit_number, '^.*-', '') AS INTEGER)), 0) AS last_seq
                      FROM quality_audits WHERE company_id=$1 AND audit_number ~ '[0-9]+$'`, [companyId]);
  return `AUD-${dayjs().year()}-${String(parseInt(r.rows[0].last_seq, 10) + 1).padStart(4, '0')}`;
}

// ═══════════════════════════════════════════════════════════════
// AUDITS
// ═══════════════════════════════════════════════════════════════

// GET /quality/audits
router.get('/', async (req, res) => {
  try {
    const { project_id, status, audit_type, search } = req.query;
    let sql = `
      SELECT a.*, p.name AS project_name, u.name AS created_by_name,
             (SELECT COUNT(*) FROM quality_audit_findings f WHERE f.audit_id = a.id) AS finding_count,
             (SELECT COUNT(*) FROM quality_audit_findings f WHERE f.audit_id = a.id AND f.status IN ('open','in_progress')) AS open_findings,
             (SELECT COUNT(*) FROM quality_audit_findings f WHERE f.audit_id = a.id AND f.finding_type IN ('major_nc','minor_nc')) AS nc_count
        FROM quality_audits a
        JOIN projects p ON a.project_id = p.id
        LEFT JOIN users u ON a.created_by = u.id
       WHERE a.company_id = $1`;
    let params = [req.user.company_id];
    let idx = 2;
    if (project_id) { sql += ` AND a.project_id = $${idx++}`; params.push(project_id); }
    if (status)      { sql += ` AND a.status = $${idx++}`; params.push(status); }
    if (audit_type)  { sql += ` AND a.audit_type = $${idx++}`; params.push(audit_type); }
    if (search) {
      sql += ` AND (a.audit_number ILIKE $${idx} OR a.scope ILIKE $${idx} OR a.auditor_name ILIKE $${idx})`;
      params.push(`%${search}%`); idx++;
    }
    ({ sql, params } = appendProjectScope(req, sql, params, 'a'));
    sql += ' ORDER BY a.created_at DESC';
    res.json({ data: (await query(sql, params)).rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /quality/audits/:id  — with findings
router.get('/:id', async (req, res) => {
  try {
    const a = await query(`
      SELECT a.*, p.name AS project_name, u.name AS created_by_name
        FROM quality_audits a
        JOIN projects p ON a.project_id = p.id
        LEFT JOIN users u ON a.created_by = u.id
       WHERE a.id = $1 AND a.company_id = $2`,
      [req.params.id, req.user.company_id]);
    if (!a.rows.length) return res.status(404).json({ error: 'Audit not found' });

    const findings = await query(`
      SELECT f.*, u1.name AS assigned_to_name, u2.name AS closed_by_name, n.ncr_number
        FROM quality_audit_findings f
        LEFT JOIN users u1 ON f.assigned_to = u1.id
        LEFT JOIN users u2 ON f.closed_by = u2.id
        LEFT JOIN quality_ncrs n ON f.ncr_id = n.id
       WHERE f.audit_id = $1 ORDER BY f.created_at`, [req.params.id]);

    res.json({ data: { ...a.rows[0], findings: findings.rows } });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /quality/audits
router.post('/', async (req, res) => {
  try {
    const { project_id, audit_type, audit_standard, scope, audit_date,
            auditor_name, auditor_company } = req.body;
    if (!project_id) return res.status(400).json({ error: 'project_id is required' });
    const audit_number = await nextAudit(req.user.company_id);
    const r = await query(`
      INSERT INTO quality_audits
        (project_id, company_id, audit_number, audit_type, audit_standard, scope,
         audit_date, auditor_name, auditor_company, created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [project_id, req.user.company_id, audit_number, audit_type || 'internal',
       audit_standard || null, scope || null, audit_date || null,
       auditor_name || null, auditor_company || null, req.user.id]);
    res.status(201).json({ data: r.rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /quality/audits/:id
router.put('/:id', async (req, res) => {
  try {
    const { audit_type, audit_standard, scope, audit_date, auditor_name,
            auditor_company, summary, overall_rating } = req.body;
    const r = await query(`
      UPDATE quality_audits SET
        audit_type=$1, audit_standard=$2, scope=$3, audit_date=$4,
        auditor_name=$5, auditor_company=$6, summary=$7, overall_rating=$8, updated_at=NOW()
      WHERE id=$9 AND company_id=$10 RETURNING *`,
      [audit_type || 'internal', audit_standard || null, scope || null,
       audit_date || null, auditor_name || null, auditor_company || null,
       summary || null, overall_rating || null, req.params.id, req.user.company_id]);
    if (!r.rows.length) return res.status(404).json({ error: 'Audit not found' });
    res.json({ data: r.rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PATCH /quality/audits/:id/status  — start / complete / close
router.patch('/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    if (!['scheduled','in_progress','completed','closed'].includes(status))
      return res.status(400).json({ error: 'Invalid status' });
    const r = await query(
      `UPDATE quality_audits SET status=$1, updated_at=NOW() WHERE id=$2 AND company_id=$3 RETURNING *`,
      [status, req.params.id, req.user.company_id]);
    if (!r.rows.length) return res.status(404).json({ error: 'Audit not found' });
    res.json({ data: r.rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PATCH /quality/audits/:id/attachments
router.patch('/:id/attachments', async (req, res) => {
  try {
    const r = await query(
      `UPDATE quality_audits SET attachments=$1, updated_at=NOW() WHERE id=$2 AND company_id=$3 RETURNING *`,
      [JSON.stringify(req.body.attachments || []), req.params.id, req.user.company_id]);
    res.json({ data: r.rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /quality/audits/:id
router.delete('/:id', authorize('admin', 'super_admin'), async (req, res) => {
  try {
    const r = await query(
      `DELETE FROM quality_audits WHERE id=$1 AND company_id=$2 AND status='scheduled' RETURNING id`,
      [req.params.id, req.user.company_id]);
    if (!r.rows.length) return res.status(404).json({ error: 'Audit not found or already in progress' });
    res.json({ message: 'Deleted' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════════
// AUDIT FINDINGS
// ═══════════════════════════════════════════════════════════════

// GET /quality/audits/:id/findings
router.get('/:id/findings', async (req, res) => {
  try {
    const r = await query(`
      SELECT f.*, u1.name AS assigned_to_name, n.ncr_number
        FROM quality_audit_findings f
        LEFT JOIN users u1 ON f.assigned_to = u1.id
        LEFT JOIN quality_ncrs n ON f.ncr_id = n.id
       WHERE f.audit_id = $1 ORDER BY f.created_at`, [req.params.id]);
    res.json({ data: r.rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /quality/audits/:id/findings  — auto-create NCR if major_nc
router.post('/:id/findings', async (req, res) => {
  try {
    const { finding_type, clause_reference, description, location,
            assigned_to, target_date } = req.body;
    if (!description) return res.status(400).json({ error: 'description is required' });

    // get audit for project context
    const auditRes = await query(
      'SELECT * FROM quality_audits WHERE id=$1 AND company_id=$2',
      [req.params.id, req.user.company_id]);
    if (!auditRes.rows.length) return res.status(404).json({ error: 'Audit not found' });
    const audit = auditRes.rows[0];

    // finding sequence number within audit
    const cnt = (await query(`SELECT COALESCE(MAX(CAST(REGEXP_REPLACE(finding_number, '^.*-', '') AS INTEGER)), 0) AS last_seq
                              FROM quality_audit_findings WHERE audit_id=$1 AND finding_number ~ '[0-9]+$'`, [req.params.id])).rows[0].last_seq;
    const finding_number = `F-${String(parseInt(cnt) + 1).padStart(2, '0')}`;

    const f = await query(`
      INSERT INTO quality_audit_findings
        (audit_id, finding_number, finding_type, clause_reference, description,
         location, assigned_to, target_date)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [req.params.id, finding_number, finding_type || 'observation',
       clause_reference || null, description, location || null,
       assigned_to || null, target_date || null]);
    let finding = f.rows[0];

    // Auto-create NCR for major non-conformance
    if (finding_type === 'major_nc') {
      const ncnt = (await query(`SELECT COALESCE(MAX(CAST(REGEXP_REPLACE(ncr_number, '^.*-', '') AS INTEGER)), 0) AS last_seq
                                 FROM quality_ncrs WHERE project_id=$1 AND ncr_number ~ '[0-9]+$'`, [audit.project_id])).rows[0].last_seq;
      const ncrNum = `NCR-${dayjs().year()}-${String(parseInt(ncnt) + 1).padStart(4, '0')}`;
      // Severity: major_nc → 'major'. Could be escalated to 'critical' by the engineer later.
      const ncrSeverity = 'major';
      const ncr = await query(`
        INSERT INTO quality_ncrs
          (project_id, ncr_number, title, description, raised_by, assigned_to,
           severity, issue_type, priority, status, source)
        VALUES ($1,$2,$3,$4,$5,$6,$7,'audit','high','open','audit_finding')
        RETURNING *`,
        [audit.project_id, ncrNum,
         `Audit Finding ${finding_number} — ${audit.audit_number}`,
         `${clause_reference ? '[' + clause_reference + '] ' : ''}${description}`,
         req.user.id, assigned_to || null, ncrSeverity]);
      await query('UPDATE quality_audit_findings SET ncr_id=$1 WHERE id=$2', [ncr.rows[0].id, finding.id]);
      finding.ncr_id = ncr.rows[0].id;
      finding.ncr_number = ncrNum;

      try {
        await createNotification({
          company_id: req.user.company_id,
          target_role: 'project_manager',
          type: 'quality_alert',
          severity: 'warning',
          title: 'Major Non-Conformance — NCR Auto-Created',
          message: `${ncrNum} from audit ${audit.audit_number}: ${description.slice(0,80)}`,
          link: '/quality/ncr',
          related_type: 'audit',
          related_id: req.params.id,
        });
      } catch (e) { /* best-effort */ }
    }

    res.status(201).json({ data: finding });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /quality/audits/:id/findings/:fid
router.put('/:id/findings/:fid', async (req, res) => {
  try {
    const { finding_type, clause_reference, description, location,
            assigned_to, target_date, response, status } = req.body;
    const r = await query(`
      UPDATE quality_audit_findings SET
        finding_type=$1, clause_reference=$2, description=$3, location=$4,
        assigned_to=$5, target_date=$6, response=$7, status=COALESCE($8,status), updated_at=NOW()
      WHERE id=$9 AND audit_id=$10 RETURNING *`,
      [finding_type || 'observation', clause_reference || null, description,
       location || null, assigned_to || null, target_date || null,
       response || null, status || null, req.params.fid, req.params.id]);
    if (!r.rows.length) return res.status(404).json({ error: 'Finding not found' });
    res.json({ data: r.rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PATCH /quality/audits/:id/findings/:fid/close
router.patch('/:id/findings/:fid/close', async (req, res) => {
  try {
    const { response } = req.body;
    const r = await query(`
      UPDATE quality_audit_findings SET
        status='closed', response=COALESCE($1,response),
        closed_by=$2, closed_at=NOW(), updated_at=NOW()
      WHERE id=$3 AND audit_id=$4 RETURNING *`,
      [response || null, req.user.id, req.params.fid, req.params.id]);
    if (!r.rows.length) return res.status(404).json({ error: 'Finding not found' });
    res.json({ data: r.rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /quality/audits/:id/findings/:fid
router.delete('/:id/findings/:fid', async (req, res) => {
  try {
    await query('DELETE FROM quality_audit_findings WHERE id=$1 AND audit_id=$2',
      [req.params.fid, req.params.id]);
    res.json({ message: 'Deleted' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
