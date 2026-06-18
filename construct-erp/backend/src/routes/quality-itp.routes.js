// src/routes/quality-itp.routes.js
// Inspection & Test Plans (ITP) + ITP Activities + Method Statements

const express  = require('express');
const router   = express.Router();
const dayjs    = require('dayjs');
const { query } = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');
const { loadProjectScope, appendProjectScope } = require('../middleware/projectScope');

router.use(authenticate);
router.use(loadProjectScope);

// ─── helpers ──────────────────────────────────────────────────────────────────
async function nextSeq(table, col, prefix, companyId) {
  const r = await query(
    `SELECT COUNT(*) FROM ${table} WHERE company_id = $1`, [companyId]
  );
  const n = parseInt(r.rows[0].count, 10) + 1;
  return `${prefix}-${dayjs().year()}-${String(n).padStart(4, '0')}`;
}

async function nextSeqProject(table, col, prefix, projectId) {
  const r = await query(
    `SELECT COUNT(*) FROM ${table} WHERE project_id = $1`, [projectId]
  );
  const n = parseInt(r.rows[0].count, 10) + 1;
  return `${prefix}-${dayjs().year()}-${String(n).padStart(4, '0')}`;
}

// ═══════════════════════════════════════════════════════════════
// ITP ROUTES
// ═══════════════════════════════════════════════════════════════

// GET /quality/itp  — list
router.get('/', async (req, res) => {
  try {
    const { project_id, discipline, status, search } = req.query;
    let sql = `
      SELECT i.*, p.name AS project_name,
             u1.name AS created_by_name, u2.name AS approved_by_name,
             (SELECT COUNT(*) FROM quality_itp_activities a WHERE a.itp_id = i.id) AS activity_count
        FROM quality_itps i
        JOIN projects p ON i.project_id = p.id
        LEFT JOIN users u1 ON i.created_by = u1.id
        LEFT JOIN users u2 ON i.approved_by = u2.id
       WHERE i.company_id = $1`;
    let params = [req.user.company_id];
    let idx = 2;
    if (project_id) { sql += ` AND i.project_id = $${idx++}`; params.push(project_id); }
    if (discipline)  { sql += ` AND i.discipline ILIKE $${idx++}`; params.push(`%${discipline}%`); }
    if (status)      { sql += ` AND i.status = $${idx++}`; params.push(status); }
    if (search)      { sql += ` AND (i.itp_number ILIKE $${idx} OR i.title ILIKE $${idx})`; params.push(`%${search}%`); idx++; }
    ({ sql, params } = appendProjectScope(req, sql, params, 'i'));
    sql += ' ORDER BY i.created_at DESC';
    const r = await query(sql, params);
    res.json({ data: r.rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /quality/itp/:id  — single with activities
router.get('/:id', async (req, res) => {
  try {
    const itp = await query(`
      SELECT i.*, p.name AS project_name,
             u1.name AS created_by_name, u2.name AS approved_by_name
        FROM quality_itps i
        JOIN projects p ON i.project_id = p.id
        LEFT JOIN users u1 ON i.created_by = u1.id
        LEFT JOIN users u2 ON i.approved_by = u2.id
       WHERE i.id = $1 AND i.company_id = $2`, [req.params.id, req.user.company_id]);
    if (!itp.rows.length) return res.status(404).json({ error: 'ITP not found' });

    const acts = await query(`
      SELECT a.*, c.name AS checklist_name
        FROM quality_itp_activities a
        LEFT JOIN quality_checklists c ON a.checklist_id = c.id
       WHERE a.itp_id = $1 AND a.is_active = true
       ORDER BY a.sequence_no`, [req.params.id]);

    res.json({ data: { ...itp.rows[0], activities: acts.rows } });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /quality/itp  — create
router.post('/', async (req, res) => {
  try {
    const { project_id, title, discipline, work_category, revision,
            description, applicable_codes, attachments } = req.body;
    if (!project_id || !title) return res.status(400).json({ error: 'project_id and title are required' });

    const itp_number = await nextSeqProject('quality_itps', 'itp_number', 'ITP', project_id);
    const r = await query(`
      INSERT INTO quality_itps
        (project_id, company_id, itp_number, title, discipline, work_category,
         revision, description, applicable_codes, attachments, created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
      RETURNING *`,
      [project_id, req.user.company_id, itp_number, title, discipline || null,
       work_category || null, revision || '0', description || null,
       applicable_codes || null, JSON.stringify(attachments || []), req.user.id]);
    res.status(201).json({ data: r.rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /quality/itp/:id  — update
router.put('/:id', async (req, res) => {
  try {
    const { title, discipline, work_category, revision,
            description, applicable_codes, attachments } = req.body;
    const r = await query(`
      UPDATE quality_itps SET
        title=$1, discipline=$2, work_category=$3, revision=$4,
        description=$5, applicable_codes=$6, attachments=$7, updated_at=NOW()
      WHERE id=$8 AND company_id=$9 AND status != 'superseded'
      RETURNING *`,
      [title, discipline || null, work_category || null, revision || '0',
       description || null, applicable_codes || null,
       JSON.stringify(attachments || []), req.params.id, req.user.company_id]);
    if (!r.rows.length) return res.status(404).json({ error: 'ITP not found or superseded' });
    res.json({ data: r.rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PATCH /quality/itp/:id/approve  — issue / approve
router.patch('/:id/approve', authorize('admin', 'super_admin', 'managing_director', 'director'), async (req, res) => {
  try {
    const r = await query(`
      UPDATE quality_itps SET status='issued', approved_by=$1, approved_at=NOW(), updated_at=NOW()
      WHERE id=$2 AND company_id=$3 RETURNING *`,
      [req.user.id, req.params.id, req.user.company_id]);
    if (!r.rows.length) return res.status(404).json({ error: 'ITP not found' });
    res.json({ data: r.rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PATCH /quality/itp/:id/supersede
router.patch('/:id/supersede', authorize('admin', 'super_admin', 'managing_director'), async (req, res) => {
  try {
    const r = await query(
      `UPDATE quality_itps SET status='superseded', updated_at=NOW() WHERE id=$1 AND company_id=$2 RETURNING *`,
      [req.params.id, req.user.company_id]);
    if (!r.rows.length) return res.status(404).json({ error: 'ITP not found' });
    res.json({ data: r.rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PATCH /quality/itp/:id/attachments
router.patch('/:id/attachments', async (req, res) => {
  try {
    const { attachments } = req.body;
    const r = await query(
      `UPDATE quality_itps SET attachments=$1, updated_at=NOW() WHERE id=$2 AND company_id=$3 RETURNING *`,
      [JSON.stringify(attachments || []), req.params.id, req.user.company_id]);
    res.json({ data: r.rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /quality/itp/:id  — only drafts
router.delete('/:id', authorize('admin', 'super_admin'), async (req, res) => {
  try {
    const r = await query(
      `DELETE FROM quality_itps WHERE id=$1 AND company_id=$2 AND status='draft' RETURNING id`,
      [req.params.id, req.user.company_id]);
    if (!r.rows.length) return res.status(404).json({ error: 'ITP not found or cannot delete issued/superseded ITPs' });
    res.json({ message: 'Deleted' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════════
// ITP ACTIVITIES
// ═══════════════════════════════════════════════════════════════

// GET /quality/itp/:id/activities
router.get('/:id/activities', async (req, res) => {
  try {
    const r = await query(`
      SELECT a.*, c.name AS checklist_name
        FROM quality_itp_activities a
        LEFT JOIN quality_checklists c ON a.checklist_id = c.id
       WHERE a.itp_id = $1 AND a.is_active = true
       ORDER BY a.sequence_no`, [req.params.id]);
    res.json({ data: r.rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /quality/itp/:id/activities
router.post('/:id/activities', async (req, res) => {
  try {
    const { activity_name, point_type, responsibility, sequence_no,
            applicable_spec, acceptance_criteria, checklist_id } = req.body;
    if (!activity_name) return res.status(400).json({ error: 'activity_name is required' });

    // auto-assign sequence_no if not given
    let seq = sequence_no;
    if (!seq) {
      const maxR = await query(
        'SELECT COALESCE(MAX(sequence_no), 0) AS max FROM quality_itp_activities WHERE itp_id=$1',
        [req.params.id]);
      seq = maxR.rows[0].max + 1;
    }
    const r = await query(`
      INSERT INTO quality_itp_activities
        (itp_id, sequence_no, activity_name, point_type, responsibility,
         applicable_spec, acceptance_criteria, checklist_id)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [req.params.id, seq, activity_name, point_type || 'R',
       responsibility || null, applicable_spec || null,
       acceptance_criteria || null, checklist_id || null]);
    res.status(201).json({ data: r.rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /quality/itp/:id/activities/:actId
router.put('/:id/activities/:actId', async (req, res) => {
  try {
    const { activity_name, point_type, responsibility, sequence_no,
            applicable_spec, acceptance_criteria, checklist_id } = req.body;
    const r = await query(`
      UPDATE quality_itp_activities SET
        activity_name=$1, point_type=$2, responsibility=$3, sequence_no=$4,
        applicable_spec=$5, acceptance_criteria=$6, checklist_id=$7
      WHERE id=$8 AND itp_id=$9 RETURNING *`,
      [activity_name, point_type || 'R', responsibility || null, sequence_no,
       applicable_spec || null, acceptance_criteria || null,
       checklist_id || null, req.params.actId, req.params.id]);
    if (!r.rows.length) return res.status(404).json({ error: 'Activity not found' });
    res.json({ data: r.rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /quality/itp/:id/activities/:actId  — soft delete
router.delete('/:id/activities/:actId', async (req, res) => {
  try {
    await query(
      'UPDATE quality_itp_activities SET is_active=false WHERE id=$1 AND itp_id=$2',
      [req.params.actId, req.params.id]);
    res.json({ message: 'Removed' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════════
// METHOD STATEMENTS
// ═══════════════════════════════════════════════════════════════

// GET /quality/itp/method-statements  — list all MS (mounted separately in server.js)
// These are exported as a separate mini-router so server.js can mount them
// at /api/v1/quality/method-statements

const msRouter = express.Router();
msRouter.use(authenticate);
msRouter.use(loadProjectScope);

msRouter.get('/', async (req, res) => {
  try {
    const { project_id, discipline, status, search } = req.query;
    let sql = `
      SELECT m.*, p.name AS project_name,
             u1.name AS created_by_name, u2.name AS submitted_by_name,
             u3.name AS approved_by_name, i.itp_number, i.title AS itp_title
        FROM quality_method_statements m
        JOIN projects p ON m.project_id = p.id
        LEFT JOIN users u1 ON m.created_by = u1.id
        LEFT JOIN users u2 ON m.submitted_by = u2.id
        LEFT JOIN users u3 ON m.approved_by = u3.id
        LEFT JOIN quality_itps i ON m.itp_id = i.id
       WHERE p.company_id = $1`;
    let params = [req.user.company_id];
    let idx = 2;
    if (project_id) { sql += ` AND m.project_id = $${idx++}`; params.push(project_id); }
    if (discipline)  { sql += ` AND m.discipline ILIKE $${idx++}`; params.push(`%${discipline}%`); }
    if (status)      { sql += ` AND m.status = $${idx++}`; params.push(status); }
    if (search)      {
      sql += ` AND (m.ms_number ILIKE $${idx} OR m.title ILIKE $${idx})`;
      params.push(`%${search}%`); idx++;
    }
    ({ sql, params } = appendProjectScope(req, sql, params, 'm'));
    sql += ' ORDER BY m.created_at DESC';
    const r = await query(sql, params);
    res.json({ data: r.rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

msRouter.get('/:id', async (req, res) => {
  try {
    const r = await query(`
      SELECT m.*, p.name AS project_name,
             u1.name AS created_by_name, u2.name AS approved_by_name,
             i.itp_number, i.title AS itp_title
        FROM quality_method_statements m
        JOIN projects p ON m.project_id = p.id
        LEFT JOIN users u1 ON m.created_by = u1.id
        LEFT JOIN users u2 ON m.approved_by = u2.id
        LEFT JOIN quality_itps i ON m.itp_id = i.id
       WHERE m.id = $1 AND p.company_id = $2`,
      [req.params.id, req.user.company_id]);
    if (!r.rows.length) return res.status(404).json({ error: 'Method Statement not found' });
    res.json({ data: r.rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

msRouter.post('/', async (req, res) => {
  try {
    const { project_id, title, discipline, work_type, revision, itp_id, attachments } = req.body;
    if (!project_id || !title) return res.status(400).json({ error: 'project_id and title are required' });
    const ms_number = await nextSeqProject('quality_method_statements', 'ms_number', 'MS', project_id);
    const r = await query(`
      INSERT INTO quality_method_statements
        (project_id, ms_number, title, discipline, work_type, revision, itp_id, attachments, created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [project_id, ms_number, title, discipline || null, work_type || null,
       revision || '0', itp_id || null, JSON.stringify(attachments || []), req.user.id]);
    res.status(201).json({ data: r.rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

msRouter.put('/:id', async (req, res) => {
  try {
    const { title, discipline, work_type, revision, itp_id, attachments } = req.body;
    const r = await query(`
      UPDATE quality_method_statements SET
        title=$1, discipline=$2, work_type=$3, revision=$4,
        itp_id=$5, attachments=$6, updated_at=NOW()
      WHERE id=$7 AND status IN ('draft','rejected')
        AND project_id IN (SELECT id FROM projects WHERE company_id=$8)
      RETURNING *`,
      [title, discipline || null, work_type || null, revision || '0',
       itp_id || null, JSON.stringify(attachments || []),
       req.params.id, req.user.company_id]);
    if (!r.rows.length) return res.status(404).json({ error: 'MS not found or cannot edit submitted/approved MS' });
    res.json({ data: r.rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

msRouter.patch('/:id/submit', async (req, res) => {
  try {
    const r = await query(`
      UPDATE quality_method_statements SET
        status='submitted', submitted_by=$1, updated_at=NOW()
      WHERE id=$2 AND status='draft'
        AND project_id IN (SELECT id FROM projects WHERE company_id=$3)
      RETURNING *`,
      [req.user.id, req.params.id, req.user.company_id]);
    if (!r.rows.length) return res.status(404).json({ error: 'MS not found or already submitted' });
    res.json({ data: r.rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

msRouter.patch('/:id/approve', authorize('admin', 'super_admin', 'managing_director', 'director', 'project_manager'), async (req, res) => {
  try {
    const r = await query(`
      UPDATE quality_method_statements SET
        status='approved', approved_by=$1, approved_at=NOW(), updated_at=NOW()
      WHERE id=$2 AND status='submitted'
        AND project_id IN (SELECT id FROM projects WHERE company_id=$3)
      RETURNING *`,
      [req.user.id, req.params.id, req.user.company_id]);
    if (!r.rows.length) return res.status(404).json({ error: 'MS not found or not in submitted state' });
    res.json({ data: r.rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

msRouter.patch('/:id/reject', authorize('admin', 'super_admin', 'managing_director', 'director', 'project_manager'), async (req, res) => {
  try {
    const { rejection_remarks } = req.body;
    const r = await query(`
      UPDATE quality_method_statements SET
        status='rejected', rejection_remarks=$1, updated_at=NOW()
      WHERE id=$2 AND status='submitted'
        AND project_id IN (SELECT id FROM projects WHERE company_id=$3)
      RETURNING *`,
      [rejection_remarks || null, req.params.id, req.user.company_id]);
    if (!r.rows.length) return res.status(404).json({ error: 'MS not found or not in submitted state' });
    res.json({ data: r.rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

msRouter.patch('/:id/attachments', async (req, res) => {
  try {
    const { attachments } = req.body;
    const r = await query(`
      UPDATE quality_method_statements SET attachments=$1, updated_at=NOW()
      WHERE id=$2 AND project_id IN (SELECT id FROM projects WHERE company_id=$3)
      RETURNING *`,
      [JSON.stringify(attachments || []), req.params.id, req.user.company_id]);
    res.json({ data: r.rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

msRouter.delete('/:id', authorize('admin', 'super_admin'), async (req, res) => {
  try {
    const r = await query(`
      DELETE FROM quality_method_statements
      WHERE id=$1 AND status='draft'
        AND project_id IN (SELECT id FROM projects WHERE company_id=$2)
      RETURNING id`,
      [req.params.id, req.user.company_id]);
    if (!r.rows.length) return res.status(404).json({ error: 'MS not found or cannot delete non-draft MS' });
    res.json({ message: 'Deleted' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = { itpRouter: router, msRouter };
