// hr-onboarding-training.routes.js — Onboarding > Training Assignment
// Deliberately separate from hr-training.routes.js (the ongoing HR Admin >
// Training & Development module) — this one is scoped to induction/safety/
// compliance training tied to onboarding, with its own courses, quiz engine
// and certificates, per the user's explicit module split.
const express = require('express');
const router = express.Router();
const { query } = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');
const { runSchemaInit } = require('../utils/schemaInit');
const { sendMail } = require('../services/mail.service');
const QRCode = require('qrcode');
const crypto = require('crypto');

const HR_ROLES = ['super_admin', 'admin', 'hr_admin', 'hr_manager'];
const HR_ALL   = [...HR_ROLES, 'hr', 'manager', 'department_head'];
const CATEGORIES = ['mandatory', 'safety', 'department', 'project', 'compliance'];

router.use(authenticate);
router.use(authorize(...HR_ALL));

runSchemaInit('hr-onboarding-training-v1', async () => {
  await query(`
    CREATE TABLE IF NOT EXISTS training_ob_courses (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id UUID NOT NULL,
      category VARCHAR(20) NOT NULL CHECK (category IN ('mandatory','safety','department','project','compliance')),
      name TEXT NOT NULL,
      description TEXT,
      department_id UUID REFERENCES hr_departments(id),
      project_id UUID REFERENCES projects(id),
      trainer_id UUID,
      duration_hours NUMERIC(5,1),
      pass_percentage INT DEFAULT 70,
      validity_months INT,
      is_active BOOLEAN DEFAULT TRUE,
      created_by UUID REFERENCES users(id),
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS training_ob_trainers (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id UUID NOT NULL,
      name TEXT NOT NULL,
      specialization TEXT,
      phone TEXT,
      email TEXT,
      active BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await query(`ALTER TABLE training_ob_courses ADD COLUMN IF NOT EXISTS trainer_id UUID REFERENCES training_ob_trainers(id)`);
  await query(`
    CREATE TABLE IF NOT EXISTS training_ob_questions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      course_id UUID NOT NULL REFERENCES training_ob_courses(id) ON DELETE CASCADE,
      question TEXT NOT NULL,
      options JSONB NOT NULL,
      correct_index INT NOT NULL,
      marks INT DEFAULT 1,
      sort_order INT DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS training_ob_assignments (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id UUID NOT NULL,
      course_id UUID NOT NULL REFERENCES training_ob_courses(id),
      user_id UUID NOT NULL REFERENCES users(id),
      assigned_by UUID REFERENCES users(id),
      assigned_date DATE DEFAULT CURRENT_DATE,
      due_date DATE,
      status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending','in_progress','completed','failed','expired')),
      started_at TIMESTAMPTZ,
      completed_at TIMESTAMPTZ,
      reminder_sent_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(course_id, user_id)
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_ob_train_assign_user ON training_ob_assignments(user_id, status)`);
  await query(`
    CREATE TABLE IF NOT EXISTS training_ob_attempts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      assignment_id UUID NOT NULL REFERENCES training_ob_assignments(id) ON DELETE CASCADE,
      attempt_no INT NOT NULL,
      score NUMERIC(6,2),
      total_marks NUMERIC(6,2),
      percentage NUMERIC(5,2),
      passed BOOLEAN,
      answers JSONB,
      attempted_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS training_ob_certificates (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      assignment_id UUID NOT NULL UNIQUE REFERENCES training_ob_assignments(id) ON DELETE CASCADE,
      certificate_number TEXT NOT NULL UNIQUE,
      issued_date DATE DEFAULT CURRENT_DATE,
      valid_until DATE,
      qr_data_url TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
});

async function resolveTargetUsers(req, target_type, target_ids) {
  const cid = req.user.company_id;
  const base = `
    SELECT u.id FROM users u
    LEFT JOIN employee_profiles ep ON ep.user_id = u.id
    WHERE u.company_id = $1 AND u.is_active = TRUE
  `;
  switch (target_type) {
    case 'individual':
      return target_ids;
    case 'department':
      return (await query(`${base} AND ep.department_id = ANY($2::uuid[])`, [cid, target_ids])).rows.map(r => r.id);
    case 'project':
      return (await query(`${base} AND ep.project_id = ANY($2::uuid[])`, [cid, target_ids])).rows.map(r => r.id);
    case 'designation':
      return (await query(`${base} AND ep.designation_id = ANY($2::uuid[])`, [cid, target_ids])).rows.map(r => r.id);
    case 'location':
      return (await query(`${base} AND ep.work_location = ANY($2::text[])`, [cid, target_ids])).rows.map(r => r.id);
    case 'new_joiners': {
      const days = parseInt(target_ids?.[0], 10) || 30;
      return (await query(`${base} AND ep.date_of_joining >= CURRENT_DATE - ($2::int * INTERVAL '1 day')`, [cid, days])).rows.map(r => r.id);
    }
    default:
      return [];
  }
}

// ── Dashboard ────────────────────────────────────────────────────────────
router.get('/dashboard', async (req, res) => {
  try {
    const cid = req.user.company_id;
    const { rows } = await query(`
      SELECT
        COUNT(*) FILTER (WHERE a.status = 'pending')                                          AS pending,
        COUNT(*)                                                                                AS assigned,
        COUNT(*) FILTER (WHERE a.status = 'completed')                                          AS completed,
        COUNT(*) FILTER (WHERE a.status NOT IN ('completed') AND a.due_date < CURRENT_DATE)     AS overdue,
        COUNT(*) FILTER (WHERE c.category = 'safety' AND a.status <> 'completed')               AS safety_pending,
        COUNT(*) FILTER (WHERE c.category = 'compliance' AND a.status <> 'completed')           AS compliance_pending
      FROM training_ob_assignments a
      JOIN training_ob_courses c ON c.id = a.course_id
      WHERE a.company_id = $1
    `, [cid]);
    const certRes = await query(`
      SELECT COUNT(*) AS n FROM training_ob_certificates cert
      JOIN training_ob_assignments a ON a.id = cert.assignment_id
      WHERE a.company_id = $1
    `, [cid]);
    const s = rows[0] || {};
    const completionRate = s.assigned > 0 ? Math.round((Number(s.completed) / Number(s.assigned)) * 100) : 0;
    res.json({ data: {
      pending_employees: Number(s.pending) || 0,
      assigned: Number(s.assigned) || 0,
      completed: Number(s.completed) || 0,
      overdue: Number(s.overdue) || 0,
      certificates_issued: Number(certRes.rows[0]?.n) || 0,
      safety_pending: Number(s.safety_pending) || 0,
      compliance_pending: Number(s.compliance_pending) || 0,
      avg_completion_rate: completionRate,
    }});
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Courses ──────────────────────────────────────────────────────────────
router.get('/courses', async (req, res) => {
  try {
    const { category } = req.query;
    const params = [req.user.company_id];
    let filter = '';
    if (category) { filter = ' AND c.category=$2'; params.push(category); }
    const { rows } = await query(`
      SELECT c.*, dep.name AS department_name, proj.name AS project_name, tr.name AS trainer_name,
             (SELECT COUNT(*) FROM training_ob_assignments a WHERE a.course_id=c.id) AS assignment_count
      FROM training_ob_courses c
      LEFT JOIN hr_departments dep ON dep.id = c.department_id
      LEFT JOIN projects proj      ON proj.id = c.project_id
      LEFT JOIN training_ob_trainers tr ON tr.id = c.trainer_id
      WHERE c.company_id=$1 AND c.is_active=TRUE ${filter}
      ORDER BY c.category, c.name
    `, params);
    res.json({ data: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/courses', authorize(...HR_ROLES), async (req, res) => {
  try {
    const { category, name, description, department_id, project_id, trainer_id, duration_hours, pass_percentage, validity_months } = req.body;
    if (!category || !CATEGORIES.includes(category)) return res.status(400).json({ error: 'Valid category is required' });
    if (!name) return res.status(400).json({ error: 'Course name is required' });
    const { rows } = await query(`
      INSERT INTO training_ob_courses
        (company_id, category, name, description, department_id, project_id, trainer_id, duration_hours, pass_percentage, validity_months, created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *
    `, [req.user.company_id, category, name, description || null, department_id || null, project_id || null,
        trainer_id || null, duration_hours || null, pass_percentage || 70, validity_months || null, req.user.id]);
    res.status(201).json({ data: rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/courses/:id', authorize(...HR_ROLES), async (req, res) => {
  try {
    const { name, description, department_id, project_id, trainer_id, duration_hours, pass_percentage, validity_months, is_active } = req.body;
    const { rows } = await query(`
      UPDATE training_ob_courses SET
        name=COALESCE($1,name), description=COALESCE($2,description),
        department_id=$3, project_id=$4, trainer_id=$5,
        duration_hours=COALESCE($6,duration_hours), pass_percentage=COALESCE($7,pass_percentage),
        validity_months=$8, is_active=COALESCE($9,is_active)
      WHERE id=$10 AND company_id=$11 RETURNING *
    `, [name, description, department_id || null, project_id || null, trainer_id || null,
        duration_hours, pass_percentage, validity_months, is_active, req.params.id, req.user.company_id]);
    if (!rows.length) return res.status(404).json({ error: 'Course not found' });
    res.json({ data: rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Questions (per course) ──────────────────────────────────────────────
router.get('/courses/:id/questions', async (req, res) => {
  try {
    const { rows } = await query(`SELECT * FROM training_ob_questions WHERE course_id=$1 ORDER BY sort_order, created_at`, [req.params.id]);
    res.json({ data: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/courses/:id/questions', authorize(...HR_ROLES), async (req, res) => {
  try {
    const { question, options, correct_index, marks } = req.body;
    if (!question || !Array.isArray(options) || options.length < 2) return res.status(400).json({ error: 'Question and at least 2 options are required' });
    if (correct_index == null || correct_index < 0 || correct_index >= options.length) return res.status(400).json({ error: 'correct_index must point to a valid option' });
    const { rows } = await query(`
      INSERT INTO training_ob_questions (course_id, question, options, correct_index, marks)
      VALUES ($1,$2,$3,$4,$5) RETURNING *
    `, [req.params.id, question, JSON.stringify(options), correct_index, marks || 1]);
    res.status(201).json({ data: rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/questions/:qid', authorize(...HR_ROLES), async (req, res) => {
  try {
    await query(`DELETE FROM training_ob_questions WHERE id=$1`, [req.params.qid]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Assignments ──────────────────────────────────────────────────────────
router.get('/assignments', async (req, res) => {
  try {
    const { status, category, department_id, project_id, overdue } = req.query;
    const params = [req.user.company_id];
    let filters = '';
    if (status)   { params.push(status); filters += ` AND a.status=$${params.length}`; }
    if (category) { params.push(category); filters += ` AND c.category=$${params.length}`; }
    if (department_id) { params.push(department_id); filters += ` AND ep.department_id=$${params.length}`; }
    if (project_id)     { params.push(project_id); filters += ` AND ep.project_id=$${params.length}`; }
    if (overdue === 'true') filters += ` AND a.status <> 'completed' AND a.due_date < CURRENT_DATE`;

    const { rows } = await query(`
      SELECT a.*, u.name AS employee_name, u.employee_code,
             dep.name AS department_name, proj.name AS project_name,
             c.name AS course_name, c.category, c.pass_percentage,
             cert.certificate_number
      FROM training_ob_assignments a
      JOIN users u ON u.id = a.user_id
      LEFT JOIN employee_profiles ep ON ep.user_id = u.id
      LEFT JOIN hr_departments dep   ON dep.id = ep.department_id
      LEFT JOIN projects proj        ON proj.id = ep.project_id
      JOIN training_ob_courses c     ON c.id = a.course_id
      LEFT JOIN training_ob_certificates cert ON cert.assignment_id = a.id
      WHERE a.company_id = $1 ${filters}
      ORDER BY a.due_date NULLS LAST, a.created_at DESC
    `, params);
    res.json({ data: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/assign', authorize(...HR_ROLES), async (req, res) => {
  try {
    const { course_id, target_type, target_ids, due_date } = req.body;
    if (!course_id || !target_type) return res.status(400).json({ error: 'course_id and target_type are required' });
    const userIds = await resolveTargetUsers(req, target_type, target_ids || []);
    if (!userIds.length) return res.status(400).json({ error: 'No employees matched this target' });

    const { rows } = await query(`
      INSERT INTO training_ob_assignments (company_id, course_id, user_id, assigned_by, due_date)
      SELECT $1, $2, uid, $3, $4 FROM UNNEST($5::uuid[]) AS uid
      ON CONFLICT (course_id, user_id) DO UPDATE SET due_date=EXCLUDED.due_date
      RETURNING *
    `, [req.user.company_id, course_id, req.user.id, due_date || null, userIds]);
    res.status(201).json({ data: rows, count: rows.length });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch('/assignments/:id/start', async (req, res) => {
  try {
    const { rows } = await query(`
      UPDATE training_ob_assignments SET status='in_progress', started_at=COALESCE(started_at, NOW())
      WHERE id=$1 AND company_id=$2 RETURNING *
    `, [req.params.id, req.user.company_id]);
    if (!rows.length) return res.status(404).json({ error: 'Assignment not found' });
    res.json({ data: rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch('/assignments/:id/reassign', authorize(...HR_ROLES), async (req, res) => {
  try {
    const { due_date } = req.body;
    const { rows } = await query(`
      UPDATE training_ob_assignments SET status='pending', started_at=NULL, completed_at=NULL, due_date=COALESCE($1,due_date)
      WHERE id=$2 AND company_id=$3 RETURNING *
    `, [due_date || null, req.params.id, req.user.company_id]);
    if (!rows.length) return res.status(404).json({ error: 'Assignment not found' });
    res.json({ data: rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch('/assignments/:id/extend', authorize(...HR_ROLES), async (req, res) => {
  try {
    const { due_date } = req.body;
    if (!due_date) return res.status(400).json({ error: 'due_date is required' });
    const { rows } = await query(`
      UPDATE training_ob_assignments SET due_date=$1 WHERE id=$2 AND company_id=$3 RETURNING *
    `, [due_date, req.params.id, req.user.company_id]);
    if (!rows.length) return res.status(404).json({ error: 'Assignment not found' });
    res.json({ data: rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/assignments/:id/remind', authorize(...HR_ROLES), async (req, res) => {
  try {
    const { rows } = await query(`
      SELECT a.*, u.name AS employee_name, u.email, c.name AS course_name
      FROM training_ob_assignments a
      JOIN users u ON u.id = a.user_id
      JOIN training_ob_courses c ON c.id = a.course_id
      WHERE a.id=$1 AND a.company_id=$2
    `, [req.params.id, req.user.company_id]);
    if (!rows.length) return res.status(404).json({ error: 'Assignment not found' });
    const a = rows[0];
    if (a.email) {
      await sendMail({
        to: a.email,
        subject: `Reminder: Complete "${a.course_name}" training`,
        html: `<p>Hi ${a.employee_name},</p><p>This is a reminder to complete your assigned training <strong>${a.course_name}</strong>${a.due_date ? ` by <strong>${new Date(a.due_date).toLocaleDateString('en-IN')}</strong>` : ''}.</p>`,
      }).catch(() => {});
    }
    await query(`UPDATE training_ob_assignments SET reminder_sent_at=NOW() WHERE id=$1`, [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Quiz submission → completion + certificate ──────────────────────────
router.post('/assignments/:id/submit-quiz', async (req, res) => {
  try {
    const { answers } = req.body; // [{question_id, selected_index}]
    const aRes = await query(`
      SELECT a.*, c.pass_percentage, c.validity_months, c.name AS course_name
      FROM training_ob_assignments a JOIN training_ob_courses c ON c.id = a.course_id
      WHERE a.id=$1 AND a.company_id=$2
    `, [req.params.id, req.user.company_id]);
    if (!aRes.rows.length) return res.status(404).json({ error: 'Assignment not found' });
    const assignment = aRes.rows[0];

    const qRes = await query(`SELECT * FROM training_ob_questions WHERE course_id=$1`, [assignment.course_id]);
    const questions = qRes.rows;
    let score = 0, totalMarks = 0;
    for (const q of questions) {
      totalMarks += q.marks;
      const given = (answers || []).find(a => a.question_id === q.id);
      if (given && Number(given.selected_index) === q.correct_index) score += q.marks;
    }
    const percentage = totalMarks > 0 ? (score / totalMarks) * 100 : 100;
    const passed = percentage >= (assignment.pass_percentage || 70);

    const attemptNoRes = await query(`SELECT COUNT(*) AS n FROM training_ob_attempts WHERE assignment_id=$1`, [req.params.id]);
    const attemptNo = Number(attemptNoRes.rows[0].n) + 1;
    await query(`
      INSERT INTO training_ob_attempts (assignment_id, attempt_no, score, total_marks, percentage, passed, answers)
      VALUES ($1,$2,$3,$4,$5,$6,$7)
    `, [req.params.id, attemptNo, score, totalMarks, percentage, passed, JSON.stringify(answers || [])]);

    let certificate = null;
    if (passed) {
      await query(`UPDATE training_ob_assignments SET status='completed', completed_at=NOW() WHERE id=$1`, [req.params.id]);
      const existingCert = await query(`SELECT * FROM training_ob_certificates WHERE assignment_id=$1`, [req.params.id]);
      if (existingCert.rows.length) {
        certificate = existingCert.rows[0];
      } else {
        const certNumber = `TRN-${new Date().getFullYear()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
        const validUntil = assignment.validity_months
          ? new Date(Date.now() + assignment.validity_months * 30 * 86400000).toISOString().slice(0, 10)
          : null;
        const qrDataUrl = await QRCode.toDataURL(`${certNumber}|${req.params.id}`, { width: 200, margin: 1 });
        const certRes = await query(`
          INSERT INTO training_ob_certificates (assignment_id, certificate_number, valid_until, qr_data_url)
          VALUES ($1,$2,$3,$4) RETURNING *
        `, [req.params.id, certNumber, validUntil, qrDataUrl]);
        certificate = certRes.rows[0];
      }
    } else {
      await query(`UPDATE training_ob_assignments SET status='failed' WHERE id=$1`, [req.params.id]);
    }

    res.json({ data: { score, totalMarks, percentage: Math.round(percentage * 100) / 100, passed, attemptNo, certificate } });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/assignments/:id/attempts', async (req, res) => {
  try {
    const { rows } = await query(`SELECT * FROM training_ob_attempts WHERE assignment_id=$1 ORDER BY attempt_no`, [req.params.id]);
    res.json({ data: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Certificates ─────────────────────────────────────────────────────────
router.get('/certificates/:assignmentId', async (req, res) => {
  try {
    const { rows } = await query(`
      SELECT cert.*, u.name AS employee_name, u.employee_code, c.name AS course_name,
             comp.name AS company_name
      FROM training_ob_certificates cert
      JOIN training_ob_assignments a ON a.id = cert.assignment_id
      JOIN users u ON u.id = a.user_id
      JOIN training_ob_courses c ON c.id = a.course_id
      LEFT JOIN companies comp ON comp.id = a.company_id
      WHERE cert.assignment_id=$1 AND a.company_id=$2
    `, [req.params.assignmentId, req.user.company_id]);
    if (!rows.length) return res.status(404).json({ error: 'Certificate not found' });
    res.json({ data: rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── History ──────────────────────────────────────────────────────────────
router.get('/history/:userId', async (req, res) => {
  try {
    const { rows } = await query(`
      SELECT a.*, c.name AS course_name, c.category, tr.name AS trainer_name,
             (SELECT MAX(percentage) FROM training_ob_attempts att WHERE att.assignment_id=a.id) AS best_score,
             cert.certificate_number, cert.valid_until
      FROM training_ob_assignments a
      JOIN training_ob_courses c ON c.id = a.course_id
      LEFT JOIN training_ob_trainers tr ON tr.id = c.trainer_id
      LEFT JOIN training_ob_certificates cert ON cert.assignment_id = a.id
      WHERE a.user_id=$1 AND a.company_id=$2 AND a.status IN ('completed','failed','expired')
      ORDER BY a.completed_at DESC NULLS LAST, a.created_at DESC
    `, [req.params.userId, req.user.company_id]);
    res.json({ data: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Reports ──────────────────────────────────────────────────────────────
router.get('/reports/:key', async (req, res) => {
  try {
    const cid = req.user.company_id;
    const key = req.params.key;
    let sql, params = [cid];
    const baseSelect = `
      SELECT a.status, a.due_date, a.completed_at, u.name AS employee_name, u.employee_code,
             dep.name AS department_name, proj.name AS project_name, c.name AS course_name, c.category
      FROM training_ob_assignments a
      JOIN users u ON u.id = a.user_id
      LEFT JOIN employee_profiles ep ON ep.user_id = u.id
      LEFT JOIN hr_departments dep ON dep.id = ep.department_id
      LEFT JOIN projects proj ON proj.id = ep.project_id
      JOIN training_ob_courses c ON c.id = a.course_id
      WHERE a.company_id = $1
    `;
    if (key === 'pending') sql = `${baseSelect} AND a.status IN ('pending','in_progress') ORDER BY a.due_date`;
    else if (key === 'completed') sql = `${baseSelect} AND a.status='completed' ORDER BY a.completed_at DESC`;
    else if (key === 'safety-compliance') sql = `${baseSelect} AND c.category IN ('safety','compliance') ORDER BY a.status, a.due_date`;
    else if (key === 'certificate-expiry') {
      sql = `
        SELECT cert.certificate_number, cert.valid_until, u.name AS employee_name, u.employee_code, c.name AS course_name
        FROM training_ob_certificates cert
        JOIN training_ob_assignments a ON a.id = cert.assignment_id
        JOIN users u ON u.id = a.user_id
        JOIN training_ob_courses c ON c.id = a.course_id
        WHERE a.company_id=$1 AND cert.valid_until IS NOT NULL
        ORDER BY cert.valid_until ASC
      `;
    } else if (key === 'department-wise') {
      sql = `
        SELECT dep.name AS department_name, COUNT(*) AS total,
               COUNT(*) FILTER (WHERE a.status='completed') AS completed
        FROM training_ob_assignments a
        JOIN employee_profiles ep ON ep.user_id = a.user_id
        LEFT JOIN hr_departments dep ON dep.id = ep.department_id
        WHERE a.company_id=$1 GROUP BY dep.name ORDER BY dep.name
      `;
    } else if (key === 'project-wise') {
      sql = `
        SELECT proj.name AS project_name, COUNT(*) AS total,
               COUNT(*) FILTER (WHERE a.status='completed') AS completed
        FROM training_ob_assignments a
        JOIN employee_profiles ep ON ep.user_id = a.user_id
        LEFT JOIN projects proj ON proj.id = ep.project_id
        WHERE a.company_id=$1 GROUP BY proj.name ORDER BY proj.name
      `;
    } else if (key === 'employee-register') sql = `${baseSelect} ORDER BY u.name, c.category`;
    else return res.status(400).json({ error: 'Unknown report key' });

    const { rows } = await query(sql, params);
    res.json({ data: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Settings — Trainers master ──────────────────────────────────────────
router.get('/trainers', async (req, res) => {
  try {
    const { rows } = await query(`SELECT * FROM training_ob_trainers WHERE company_id=$1 AND active=TRUE ORDER BY name`, [req.user.company_id]);
    res.json({ data: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});
router.post('/trainers', authorize(...HR_ROLES), async (req, res) => {
  try {
    const { name, specialization, phone, email } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });
    const { rows } = await query(`
      INSERT INTO training_ob_trainers (company_id, name, specialization, phone, email)
      VALUES ($1,$2,$3,$4,$5) RETURNING *
    `, [req.user.company_id, name, specialization || null, phone || null, email || null]);
    res.status(201).json({ data: rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});
router.delete('/trainers/:id', authorize(...HR_ROLES), async (req, res) => {
  try {
    await query(`UPDATE training_ob_trainers SET active=FALSE WHERE id=$1 AND company_id=$2`, [req.params.id, req.user.company_id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
