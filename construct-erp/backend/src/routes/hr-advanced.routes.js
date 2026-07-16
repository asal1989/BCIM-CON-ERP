// src/routes/hr-advanced.routes.js
// HR & Admin advanced workflows: recruitment, roster, regularization, leave automation, compliance
const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { query } = require('../config/database');
const { runSchemaInit } = require('../utils/schemaInit');

router.use(authenticate);

const HR_ACCESS_ROLES = new Set([
  'super_admin',
  'admin',
  'hr',
  'hr_admin',
  'hr_manager',
  'manager',
  'project_manager',
  'project_head',
  'department_head',
]);

const FULL_HR_ROLES = new Set(['super_admin', 'admin', 'hr', 'hr_admin', 'hr_manager']);

function hasHrAccess(req) {
  return HR_ACCESS_ROLES.has(String(req.user?.role || '').trim().toLowerCase());
}

// Returns null for full HR admins (no restriction); returns the caller's
// project_id for project/dept roles so all queries scope to their project.
async function getProjectScope(req) {
  const role = String(req.user?.role || '').toLowerCase();
  if (FULL_HR_ROLES.has(role)) return null;
  const r = await query(
    `SELECT project_id FROM employee_profiles WHERE user_id=$1`,
    [req.user.id]
  );
  return r.rows[0]?.project_id || null;
}

// ESS-facing paths that any authenticated employee may call (self-service only).
// Everything else in this router is HR-admin-only.
const ESS_OPEN = [
  { path: '/policies',               method: 'GET'  },  // read published policies
  { path: '/policies/',              method: 'POST' },  // acknowledge a policy
  { path: '/service-requests',       method: 'GET'  },  // employee views own requests
  { path: '/service-requests',       method: 'POST' },  // employee creates request
  { path: '/regularizations',        method: 'POST' },  // employee submits correction
  { path: '/payroll-compliance/tax-declarations', method: 'GET'  }, // employee reads own decl.
  { path: '/payroll-compliance/tax-declarations', method: 'POST' }, // employee submits decl.
  { path: '/performance/goals',      method: 'GET'  },  // employee views own goals
];

router.use((req, res, next) => {
  if (hasHrAccess(req)) return next();
  const role = String(req.user?.role || '').trim().toLowerCase();
  const isEssAllowed = ESS_OPEN.some(
    ({ path, method }) => req.path.startsWith(path) && req.method === method
  );
  if (isEssAllowed) return next();
  return res.status(403).json({
    error: `HR Admin access denied. Your role (${req.user?.role}) does not have permission.`,
  });
});

const initTables = async () => {
  await query(`
    CREATE TABLE IF NOT EXISTS hr_job_openings (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id UUID REFERENCES companies(id),
      job_code TEXT,
      title TEXT NOT NULL,
      department_id UUID,
      designation_id UUID,
      location TEXT,
      vacancies INT DEFAULT 1,
      status TEXT DEFAULT 'open',
      description TEXT,
      created_by UUID REFERENCES users(id),
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS hr_candidates (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id UUID REFERENCES companies(id),
      job_id UUID REFERENCES hr_job_openings(id),
      name TEXT NOT NULL,
      email TEXT,
      phone TEXT,
      current_company TEXT,
      experience_years NUMERIC(5,2) DEFAULT 0,
      expected_ctc NUMERIC(14,2) DEFAULT 0,
      status TEXT DEFAULT 'applied',
      source TEXT,
      notes TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS hr_interviews (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id UUID REFERENCES companies(id),
      candidate_id UUID REFERENCES hr_candidates(id),
      interview_date TIMESTAMPTZ,
      interview_round TEXT,
      interviewer_id UUID REFERENCES users(id),
      mode TEXT,
      status TEXT DEFAULT 'scheduled',
      feedback TEXT,
      rating NUMERIC(4,2),
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS hr_offer_letters (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id UUID REFERENCES companies(id),
      candidate_id UUID REFERENCES hr_candidates(id),
      offered_ctc NUMERIC(14,2) DEFAULT 0,
      joining_date DATE,
      status TEXT DEFAULT 'draft',
      remarks TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS hr_shifts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id UUID REFERENCES companies(id),
      shift_code TEXT,
      name TEXT NOT NULL,
      start_time TIME NOT NULL,
      end_time TIME NOT NULL,
      grace_minutes INT DEFAULT 0,
      weekly_offs TEXT DEFAULT 'Sunday',
      is_active BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(company_id, shift_code)
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS hr_rosters (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id UUID REFERENCES companies(id),
      user_id UUID REFERENCES users(id),
      shift_id UUID REFERENCES hr_shifts(id),
      roster_date DATE NOT NULL,
      project_id UUID,
      remarks TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(user_id, roster_date)
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS hr_attendance_correction_requests (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id UUID REFERENCES companies(id),
      user_id UUID REFERENCES users(id),
      attendance_id UUID,
      attendance_date DATE NOT NULL,
      requested_status TEXT DEFAULT 'present',
      requested_in_time TIME,
      requested_out_time TIME,
      reason TEXT,
      status TEXT DEFAULT 'pending',
      actioned_by UUID REFERENCES users(id),
      actioned_at TIMESTAMPTZ,
      rejection_reason TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS hr_leave_accrual_policies (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id UUID REFERENCES companies(id),
      leave_type_id UUID REFERENCES hr_leave_types(id),
      accrual_frequency TEXT DEFAULT 'monthly',
      accrual_days NUMERIC(6,2) DEFAULT 0,
      effective_from DATE DEFAULT CURRENT_DATE,
      is_active BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS hr_payroll_compliance_settings (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id UUID REFERENCES companies(id) UNIQUE,
      pf_enabled BOOLEAN DEFAULT TRUE,
      esi_enabled BOOLEAN DEFAULT TRUE,
      pt_enabled BOOLEAN DEFAULT TRUE,
      lwf_enabled BOOLEAN DEFAULT FALSE,
      pf_ceiling NUMERIC(14,2) DEFAULT 15000,
      esi_ceiling NUMERIC(14,2) DEFAULT 21000,
      pt_state TEXT DEFAULT 'Karnataka',
      tan_number TEXT,
      pf_establishment_code TEXT,
      esi_employer_code TEXT,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS hr_tax_declarations (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id UUID REFERENCES companies(id),
      user_id UUID REFERENCES users(id),
      financial_year TEXT NOT NULL,
      declared_amount NUMERIC(14,2) DEFAULT 0,
      approved_amount NUMERIC(14,2) DEFAULT 0,
      status TEXT DEFAULT 'submitted',
      remarks TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS hr_training_programs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id UUID REFERENCES companies(id),
      title TEXT NOT NULL,
      category TEXT,
      trainer TEXT,
      training_date DATE,
      duration_hours NUMERIC(6,2) DEFAULT 0,
      mode TEXT DEFAULT 'classroom',
      status TEXT DEFAULT 'planned',
      description TEXT,
      created_by UUID REFERENCES users(id),
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS hr_training_nominations (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id UUID REFERENCES companies(id),
      program_id UUID REFERENCES hr_training_programs(id),
      user_id UUID REFERENCES users(id),
      status TEXT DEFAULT 'nominated',
      attendance_status TEXT DEFAULT 'pending',
      score NUMERIC(6,2),
      remarks TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(program_id, user_id)
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS hr_performance_goals (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id UUID REFERENCES companies(id),
      user_id UUID REFERENCES users(id),
      period TEXT NOT NULL,
      goal_title TEXT NOT NULL,
      metric TEXT,
      target_value NUMERIC(14,2) DEFAULT 0,
      achieved_value NUMERIC(14,2) DEFAULT 0,
      weightage NUMERIC(5,2) DEFAULT 0,
      rating NUMERIC(4,2),
      status TEXT DEFAULT 'draft',
      manager_remarks TEXT,
      created_by UUID REFERENCES users(id),
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS hr_employee_cases (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id UUID REFERENCES companies(id),
      user_id UUID REFERENCES users(id),
      case_type TEXT DEFAULT 'grievance',
      severity TEXT DEFAULT 'medium',
      title TEXT NOT NULL,
      description TEXT,
      status TEXT DEFAULT 'open',
      action_taken TEXT,
      raised_by UUID REFERENCES users(id),
      assigned_to UUID REFERENCES users(id),
      closed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS hr_exit_cases (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id UUID REFERENCES companies(id),
      user_id UUID REFERENCES users(id),
      resignation_date DATE,
      last_working_date DATE,
      reason TEXT,
      notice_days INT DEFAULT 0,
      status TEXT DEFAULT 'initiated',
      handover_status TEXT DEFAULT 'pending',
      asset_clearance_status TEXT DEFAULT 'pending',
      finance_clearance_status TEXT DEFAULT 'pending',
      final_settlement_amount NUMERIC(14,2) DEFAULT 0,
      remarks TEXT,
      created_by UUID REFERENCES users(id),
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS hr_letter_templates (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id UUID REFERENCES companies(id),
      template_code TEXT,
      title TEXT NOT NULL,
      letter_type TEXT DEFAULT 'general',
      body TEXT NOT NULL,
      status TEXT DEFAULT 'active',
      created_by UUID REFERENCES users(id),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(company_id, template_code)
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS hr_letter_issues (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id UUID REFERENCES companies(id),
      template_id UUID REFERENCES hr_letter_templates(id),
      user_id UUID REFERENCES users(id),
      letter_no TEXT,
      issue_date DATE DEFAULT CURRENT_DATE,
      status TEXT DEFAULT 'issued',
      body TEXT NOT NULL,
      remarks TEXT,
      created_by UUID REFERENCES users(id),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(company_id, letter_no)
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS hr_policy_documents (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id UUID REFERENCES companies(id),
      policy_code TEXT,
      title TEXT NOT NULL,
      category TEXT DEFAULT 'HR',
      version TEXT DEFAULT '1.0',
      effective_date DATE DEFAULT CURRENT_DATE,
      body TEXT NOT NULL,
      status TEXT DEFAULT 'published',
      created_by UUID REFERENCES users(id),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(company_id, policy_code, version)
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS hr_policy_acknowledgements (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id UUID REFERENCES companies(id),
      policy_id UUID REFERENCES hr_policy_documents(id),
      user_id UUID REFERENCES users(id),
      status TEXT DEFAULT 'acknowledged',
      remarks TEXT,
      acknowledged_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(policy_id, user_id)
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS hr_service_requests (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id UUID REFERENCES companies(id),
      request_no TEXT,
      user_id UUID REFERENCES users(id),
      request_type TEXT DEFAULT 'general',
      priority TEXT DEFAULT 'normal',
      subject TEXT NOT NULL,
      description TEXT,
      status TEXT DEFAULT 'open',
      assigned_to UUID REFERENCES users(id),
      resolution TEXT,
      closed_at TIMESTAMPTZ,
      created_by UUID REFERENCES users(id),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(company_id, request_no)
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS hr_employee_segments (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id UUID REFERENCES companies(id),
      name TEXT NOT NULL,
      description TEXT,
      criteria JSONB DEFAULT '{}',
      color TEXT DEFAULT '#2563EB',
      created_by UUID REFERENCES users(id),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS hr_employee_filters (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id UUID REFERENCES companies(id),
      name TEXT NOT NULL,
      description TEXT,
      filters JSONB DEFAULT '{}',
      is_shared BOOLEAN DEFAULT FALSE,
      created_by UUID REFERENCES users(id),
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
};

runSchemaInit('hr-advanced', initTables);

const companyId = (req) => req.user.company_id;

router.get('/recruitment/jobs', async (req, res) => {
  const { status } = req.query;
  const params = [companyId(req)];
  let sql = `
    SELECT j.*, d.name AS department_name, ds.name AS designation_name, u.name AS created_by_name,
           COUNT(c.id)::int AS candidates_count
    FROM hr_job_openings j
    LEFT JOIN hr_departments d ON d.id = j.department_id
    LEFT JOIN hr_designations ds ON ds.id = j.designation_id
    LEFT JOIN users u ON u.id = j.created_by
    LEFT JOIN hr_candidates c ON c.job_id = j.id
    WHERE j.company_id = $1`;
  if (status) {
    params.push(status);
    sql += ` AND j.status = $${params.length}`;
  }
  sql += ' GROUP BY j.id, d.name, ds.name, u.name ORDER BY j.created_at DESC';
  const { rows } = await query(sql, params);
  res.json({ data: rows });
});

router.post('/recruitment/jobs', async (req, res) => {
  const { job_code, title, department_id, designation_id, location, vacancies, status, description } = req.body;
  const { rows } = await query(
    `INSERT INTO hr_job_openings
     (company_id, job_code, title, department_id, designation_id, location, vacancies, status, description, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
    [companyId(req), job_code || null, title, department_id || null, designation_id || null, location || null,
      vacancies || 1, status || 'open', description || null, req.user.id]
  );
  res.status(201).json({ data: rows[0] });
});

router.patch('/recruitment/jobs/:id', async (req, res) => {
  const { job_code, title, department_id, designation_id, location, vacancies, status, description } = req.body;
  const { rows } = await query(
    `UPDATE hr_job_openings
     SET job_code=COALESCE($1, job_code), title=COALESCE($2, title), department_id=COALESCE($3, department_id),
         designation_id=COALESCE($4, designation_id), location=COALESCE($5, location),
         vacancies=COALESCE($6, vacancies), status=COALESCE($7, status), description=COALESCE($8, description)
     WHERE id=$9 AND company_id=$10 RETURNING *`,
    [job_code, title, department_id, designation_id, location, vacancies, status, description, req.params.id, companyId(req)]
  );
  res.json({ data: rows[0] });
});

router.get('/recruitment/candidates', async (req, res) => {
  const { job_id, status } = req.query;
  const params = [companyId(req)];
  let sql = `
    SELECT c.*, j.title AS job_title, j.job_code,
           COALESCE(json_agg(DISTINCT i.*) FILTER (WHERE i.id IS NOT NULL), '[]') AS interviews,
           COALESCE(json_agg(DISTINCT o.*) FILTER (WHERE o.id IS NOT NULL), '[]') AS offers
    FROM hr_candidates c
    LEFT JOIN hr_job_openings j ON j.id = c.job_id
    LEFT JOIN hr_interviews i ON i.candidate_id = c.id
    LEFT JOIN hr_offer_letters o ON o.candidate_id = c.id
    WHERE c.company_id = $1`;
  if (job_id) {
    params.push(job_id);
    sql += ` AND c.job_id = $${params.length}`;
  }
  if (status) {
    params.push(status);
    sql += ` AND c.status = $${params.length}`;
  }
  sql += ' GROUP BY c.id, j.title, j.job_code ORDER BY c.created_at DESC';
  const { rows } = await query(sql, params);
  res.json({ data: rows });
});

router.post('/recruitment/candidates', async (req, res) => {
  const { job_id, name, email, phone, current_company, experience_years, expected_ctc, status, source, notes } = req.body;
  const { rows } = await query(
    `INSERT INTO hr_candidates
     (company_id, job_id, name, email, phone, current_company, experience_years, expected_ctc, status, source, notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
    [companyId(req), job_id || null, name, email || null, phone || null, current_company || null,
      experience_years || 0, expected_ctc || 0, status || 'applied', source || null, notes || null]
  );
  res.status(201).json({ data: rows[0] });
});

router.patch('/recruitment/candidates/:id', async (req, res) => {
  const { status, notes, expected_ctc } = req.body;
  const { rows } = await query(
    `UPDATE hr_candidates SET status=COALESCE($1,status), notes=COALESCE($2,notes), expected_ctc=COALESCE($3,expected_ctc)
     WHERE id=$4 AND company_id=$5 RETURNING *`,
    [status, notes, expected_ctc, req.params.id, companyId(req)]
  );
  res.json({ data: rows[0] });
});

router.post('/recruitment/candidates/:id/interviews', async (req, res) => {
  const { interview_date, interview_round, interviewer_id, mode, status, feedback, rating } = req.body;
  const { rows } = await query(
    `INSERT INTO hr_interviews
     (company_id, candidate_id, interview_date, interview_round, interviewer_id, mode, status, feedback, rating)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [companyId(req), req.params.id, interview_date || null, interview_round || 'Round 1',
      interviewer_id || null, mode || 'in-person', status || 'scheduled', feedback || null, rating || null]
  );
  res.status(201).json({ data: rows[0] });
});

router.post('/recruitment/candidates/:id/offer', async (req, res) => {
  const { offered_ctc, joining_date, status, remarks } = req.body;
  const { rows } = await query(
    `INSERT INTO hr_offer_letters (company_id, candidate_id, offered_ctc, joining_date, status, remarks)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [companyId(req), req.params.id, offered_ctc || 0, joining_date || null, status || 'draft', remarks || null]
  );
  await query(`UPDATE hr_candidates SET status='offered' WHERE id=$1 AND company_id=$2`, [req.params.id, companyId(req)]);
  res.status(201).json({ data: rows[0] });
});

router.patch('/recruitment/offers/:id', async (req, res) => {
  const { status, remarks, joining_date } = req.body;
  const { rows } = await query(
    `UPDATE hr_offer_letters
     SET status=COALESCE($1,status), remarks=COALESCE($2,remarks), joining_date=COALESCE($3,joining_date)
     WHERE id=$4 AND company_id=$5 RETURNING *`,
    [status, remarks, joining_date, req.params.id, companyId(req)]
  );
  res.json({ data: rows[0] });
});

router.get('/shifts', async (req, res) => {
  const { rows } = await query(
    `SELECT * FROM hr_shifts WHERE company_id=$1 ORDER BY is_active DESC, name`,
    [companyId(req)]
  );
  res.json({ data: rows });
});

router.post('/shifts', async (req, res) => {
  const { shift_code, name, start_time, end_time, grace_minutes, weekly_offs, is_active } = req.body;
  const { rows } = await query(
    `INSERT INTO hr_shifts (company_id, shift_code, name, start_time, end_time, grace_minutes, weekly_offs, is_active)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [companyId(req), shift_code || null, name, start_time, end_time, grace_minutes || 0,
      weekly_offs || 'Sunday', is_active !== false]
  );
  res.status(201).json({ data: rows[0] });
});

router.patch('/shifts/:id', async (req, res) => {
  const { shift_code, name, start_time, end_time, grace_minutes, weekly_offs, is_active } = req.body;
  const { rows } = await query(
    `UPDATE hr_shifts
     SET shift_code=COALESCE($1,shift_code), name=COALESCE($2,name), start_time=COALESCE($3,start_time),
         end_time=COALESCE($4,end_time), grace_minutes=COALESCE($5,grace_minutes),
         weekly_offs=COALESCE($6,weekly_offs), is_active=COALESCE($7,is_active)
     WHERE id=$8 AND company_id=$9 RETURNING *`,
    [shift_code, name, start_time, end_time, grace_minutes, weekly_offs, is_active, req.params.id, companyId(req)]
  );
  res.json({ data: rows[0] });
});

router.get('/rosters', async (req, res) => {
  const { month, year, user_id } = req.query;
  const m = parseInt(month, 10) || new Date().getMonth() + 1;
  const y = parseInt(year, 10) || new Date().getFullYear();
  const params = [companyId(req), m, y];
  let sql = `
    SELECT r.*, u.name AS employee_name, u.employee_code, s.name AS shift_name, s.start_time, s.end_time, p.name AS project_name
    FROM hr_rosters r
    JOIN users u ON u.id = r.user_id
    LEFT JOIN hr_shifts s ON s.id = r.shift_id
    LEFT JOIN projects p ON p.id = r.project_id
    WHERE r.company_id=$1 AND EXTRACT(MONTH FROM r.roster_date)=$2 AND EXTRACT(YEAR FROM r.roster_date)=$3`;
  if (user_id) {
    params.push(user_id);
    sql += ` AND r.user_id=$${params.length}`;
  }
  sql += ' ORDER BY r.roster_date DESC, u.name';
  const { rows } = await query(sql, params);
  res.json({ data: rows });
});

router.post('/rosters', async (req, res) => {
  const { user_id, shift_id, roster_date, project_id, remarks } = req.body;
  const { rows } = await query(
    `INSERT INTO hr_rosters (company_id, user_id, shift_id, roster_date, project_id, remarks)
     VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (user_id, roster_date)
     DO UPDATE SET shift_id=$3, project_id=$5, remarks=$6
     RETURNING *`,
    [companyId(req), user_id, shift_id, roster_date, project_id || null, remarks || null]
  );
  res.status(201).json({ data: rows[0] });
});

router.get('/regularizations', async (req, res) => {
  const { status } = req.query;
  const params = [companyId(req)];
  let sql = `
    SELECT r.*, u.name AS employee_name, u.employee_code, a.name AS actioned_by_name
    FROM hr_attendance_correction_requests r
    JOIN users u ON u.id = r.user_id
    LEFT JOIN users a ON a.id = r.actioned_by
    WHERE r.company_id=$1`;
  if (status) {
    params.push(status);
    sql += ` AND r.status=$${params.length}`;
  }
  sql += ' ORDER BY r.created_at DESC';
  const { rows } = await query(sql, params);
  res.json({ data: rows });
});

router.post('/regularizations', async (req, res) => {
  try {
    const { user_id, attendance_id, attendance_date, requested_status, requested_in_time, requested_out_time, reason } = req.body;
    if (!attendance_date) return res.status(400).json({ error: 'Attendance date is required' });
    const { rows } = await query(
      `INSERT INTO hr_attendance_correction_requests
       (company_id, user_id, attendance_id, attendance_date, requested_status, requested_in_time, requested_out_time, reason)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [companyId(req), hasHrAccess(req) ? (user_id || req.user.id) : req.user.id, attendance_id || null, attendance_date,
        requested_status || 'present', requested_in_time || null, requested_out_time || null, reason || null]
    );
    res.status(201).json({ data: rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/regularizations/:id/:action', async (req, res) => {
  const action = req.params.action;
  if (!['approve', 'reject'].includes(action)) return res.status(400).json({ error: 'Invalid action' });

  const existing = await query(
    `SELECT * FROM hr_attendance_correction_requests WHERE id=$1 AND company_id=$2`,
    [req.params.id, companyId(req)]
  );
  if (!existing.rows[0]) return res.status(404).json({ error: 'Regularization request not found' });

  const rec = existing.rows[0];
  if (action === 'approve') {
    await query(
      `INSERT INTO hr_attendance
       (user_id, company_id, attendance_date, status, in_time, out_time, source, remarks)
       VALUES ($1,$2,$3,$4,$5,$6,'regularization','Approved attendance correction')
       ON CONFLICT (user_id, attendance_date)
       DO UPDATE SET status=$4, in_time=$5, out_time=$6, source='regularization', remarks='Approved attendance correction'`,
      [rec.user_id, companyId(req), rec.attendance_date, rec.requested_status, rec.requested_in_time, rec.requested_out_time]
    );
  }

  const { rows } = await query(
    `UPDATE hr_attendance_correction_requests
     SET status=$1, actioned_by=$2, actioned_at=NOW(), rejection_reason=$3, updated_at=NOW()
     WHERE id=$4 AND company_id=$5 RETURNING *`,
    [action === 'approve' ? 'approved' : 'rejected', req.user.id, req.body.rejection_reason || null, req.params.id, companyId(req)]
  );
  res.json({ data: rows[0] });
});

router.get('/leave-policies', async (req, res) => {
  const { rows } = await query(
    `SELECT p.*, lt.name AS leave_type_name, lt.code AS leave_code
     FROM hr_leave_accrual_policies p
     JOIN hr_leave_types lt ON lt.id = p.leave_type_id
     WHERE p.company_id=$1 ORDER BY p.created_at DESC`,
    [companyId(req)]
  );
  res.json({ data: rows });
});

router.post('/leave-policies', async (req, res) => {
  const { leave_type_id, accrual_frequency, accrual_days, effective_from, is_active } = req.body;
  const { rows } = await query(
    `INSERT INTO hr_leave_accrual_policies
     (company_id, leave_type_id, accrual_frequency, accrual_days, effective_from, is_active)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [companyId(req), leave_type_id, accrual_frequency || 'monthly', accrual_days || 0,
      effective_from || new Date().toISOString().slice(0, 10), is_active !== false]
  );
  res.status(201).json({ data: rows[0] });
});

router.patch('/leave-policies/:id', async (req, res) => {
  const { accrual_frequency, accrual_days, effective_from, is_active } = req.body;
  const { rows } = await query(
    `UPDATE hr_leave_accrual_policies
     SET accrual_frequency=COALESCE($1,accrual_frequency), accrual_days=COALESCE($2,accrual_days),
         effective_from=COALESCE($3,effective_from), is_active=COALESCE($4,is_active)
     WHERE id=$5 AND company_id=$6 RETURNING *`,
    [accrual_frequency, accrual_days, effective_from, is_active, req.params.id, companyId(req)]
  );
  res.json({ data: rows[0] });
});

router.post('/leave-policies/accrue', async (req, res) => {
  const year = parseInt(req.body.year, 10) || new Date().getFullYear();
  const policies = await query(
    `SELECT * FROM hr_leave_accrual_policies WHERE company_id=$1 AND is_active=TRUE`,
    [companyId(req)]
  );
  const employees = await query(
    `SELECT id FROM users WHERE company_id=$1 AND is_active=TRUE`,
    [companyId(req)]
  );

  let changed = 0;
  for (const policy of policies.rows) {
    for (const emp of employees.rows) {
      await query(
        `INSERT INTO hr_leave_balances (user_id, leave_type_id, year, accrued, closing_balance)
         VALUES ($1,$2,$3,$4,$4)
         ON CONFLICT (user_id, leave_type_id, year)
         DO UPDATE SET accrued = hr_leave_balances.accrued + $4,
                       closing_balance = hr_leave_balances.opening_balance + hr_leave_balances.accrued + $4 + hr_leave_balances.carry_forwarded - hr_leave_balances.taken`,
        [emp.id, policy.leave_type_id, year, Number(policy.accrual_days || 0)]
      );
      changed += 1;
    }
  }
  res.json({ year, policies: policies.rows.length, employees: employees.rows.length, entries: changed });
});

router.get('/payroll-compliance/settings', async (req, res) => {
  const { rows } = await query(
    `SELECT * FROM hr_payroll_compliance_settings WHERE company_id=$1`,
    [companyId(req)]
  );
  res.json({ data: rows[0] || null });
});

router.post('/payroll-compliance/settings', async (req, res) => {
  const {
    pf_enabled, esi_enabled, pt_enabled, lwf_enabled, pf_ceiling, esi_ceiling,
    pt_state, tan_number, pf_establishment_code, esi_employer_code,
  } = req.body;
  const { rows } = await query(
    `INSERT INTO hr_payroll_compliance_settings
     (company_id, pf_enabled, esi_enabled, pt_enabled, lwf_enabled, pf_ceiling, esi_ceiling,
      pt_state, tan_number, pf_establishment_code, esi_employer_code)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     ON CONFLICT (company_id)
     DO UPDATE SET pf_enabled=$2, esi_enabled=$3, pt_enabled=$4, lwf_enabled=$5,
                   pf_ceiling=$6, esi_ceiling=$7, pt_state=$8, tan_number=$9,
                   pf_establishment_code=$10, esi_employer_code=$11, updated_at=NOW()
     RETURNING *`,
    [companyId(req), pf_enabled !== false, esi_enabled !== false, pt_enabled !== false, lwf_enabled === true,
      pf_ceiling || 15000, esi_ceiling || 21000, pt_state || 'Karnataka', tan_number || null,
      pf_establishment_code || null, esi_employer_code || null]
  );
  res.json({ data: rows[0] });
});

router.get('/payroll-compliance/tax-declarations', async (req, res) => {
  const fy = req.query.financial_year || `${new Date().getFullYear()}-${String(new Date().getFullYear() + 1).slice(-2)}`;
  const params = [companyId(req), fy];
  let sql = `SELECT t.*, u.name AS employee_name, u.employee_code
     FROM hr_tax_declarations t
     JOIN users u ON u.id = t.user_id
     WHERE t.company_id=$1 AND t.financial_year=$2`;
  if (!hasHrAccess(req)) { params.push(req.user.id); sql += ` AND t.user_id=$${params.length}`; }
  sql += ' ORDER BY t.created_at DESC';
  const { rows } = await query(sql, params);
  res.json({ data: rows });
});

router.post('/payroll-compliance/tax-declarations', async (req, res) => {
  const { user_id, financial_year, declared_amount, approved_amount, status, remarks } = req.body;
  const isHr = hasHrAccess(req);
  const { rows } = await query(
    `INSERT INTO hr_tax_declarations
     (company_id, user_id, financial_year, declared_amount, approved_amount, status, remarks)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [companyId(req), isHr ? (user_id || req.user.id) : req.user.id, financial_year,
      declared_amount || 0,
      isHr ? (approved_amount || 0) : 0,
      isHr ? (status || 'submitted') : 'submitted',
      remarks || null]
  );
  res.status(201).json({ data: rows[0] });
});

router.patch('/payroll-compliance/tax-declarations/:id', async (req, res) => {
  const { approved_amount, status, remarks } = req.body;
  const { rows } = await query(
    `UPDATE hr_tax_declarations
     SET approved_amount=COALESCE($1, approved_amount), status=COALESCE($2, status), remarks=COALESCE($3, remarks)
     WHERE id=$4 AND company_id=$5 RETURNING *`,
    [approved_amount, status, remarks, req.params.id, companyId(req)]
  );
  res.json({ data: rows[0] });
});

router.get('/training/programs', async (req, res) => {
  const { status } = req.query;
  const params = [companyId(req)];
  let sql = `
    SELECT p.*, u.name AS created_by_name,
           COUNT(n.id)::int AS nominated_count,
           COUNT(n.id) FILTER (WHERE n.attendance_status='attended')::int AS attended_count
    FROM hr_training_programs p
    LEFT JOIN users u ON u.id = p.created_by
    LEFT JOIN hr_training_nominations n ON n.program_id = p.id
    WHERE p.company_id=$1`;
  if (status) {
    params.push(status);
    sql += ` AND p.status=$${params.length}`;
  }
  sql += ' GROUP BY p.id, u.name ORDER BY COALESCE(p.training_date, p.created_at::date) DESC';
  const { rows } = await query(sql, params);
  res.json({ data: rows });
});

router.post('/training/programs', async (req, res) => {
  const { title, category, trainer, training_date, duration_hours, mode, status, description } = req.body;
  const { rows } = await query(
    `INSERT INTO hr_training_programs
     (company_id, title, category, trainer, training_date, duration_hours, mode, status, description, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
    [companyId(req), title, category || null, trainer || null, training_date || null,
      duration_hours || 0, mode || 'classroom', status || 'planned', description || null, req.user.id]
  );
  res.status(201).json({ data: rows[0] });
});

router.patch('/training/programs/:id', async (req, res) => {
  const { status, training_date, trainer, description } = req.body;
  const { rows } = await query(
    `UPDATE hr_training_programs
     SET status=COALESCE($1,status), training_date=COALESCE($2,training_date),
         trainer=COALESCE($3,trainer), description=COALESCE($4,description)
     WHERE id=$5 AND company_id=$6 RETURNING *`,
    [status, training_date, trainer, description, req.params.id, companyId(req)]
  );
  res.json({ data: rows[0] });
});

router.get('/training/nominations', async (req, res) => {
  const { program_id } = req.query;
  const params = [companyId(req)];
  let sql = `
    SELECT n.*, p.title AS program_title, u.name AS employee_name, u.employee_code
    FROM hr_training_nominations n
    JOIN hr_training_programs p ON p.id = n.program_id
    JOIN users u ON u.id = n.user_id
    WHERE n.company_id=$1`;
  if (program_id) {
    params.push(program_id);
    sql += ` AND n.program_id=$${params.length}`;
  }
  sql += ' ORDER BY n.created_at DESC';
  const { rows } = await query(sql, params);
  res.json({ data: rows });
});

router.post('/training/nominations', async (req, res) => {
  const { program_id, user_id, status, attendance_status, score, remarks } = req.body;
  const { rows } = await query(
    `INSERT INTO hr_training_nominations
     (company_id, program_id, user_id, status, attendance_status, score, remarks)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT (program_id, user_id)
     DO UPDATE SET status=$4, attendance_status=$5, score=$6, remarks=$7
     RETURNING *`,
    [companyId(req), program_id, user_id, status || 'nominated', attendance_status || 'pending', score || null, remarks || null]
  );
  res.status(201).json({ data: rows[0] });
});

router.get('/performance/goals', async (req, res) => {
  const { user_id, period, status } = req.query;
  const params = [companyId(req)];
  let sql = `
    SELECT g.*, u.name AS employee_name, u.employee_code, c.name AS created_by_name
    FROM hr_performance_goals g
    JOIN users u ON u.id = g.user_id
    LEFT JOIN users c ON c.id = g.created_by
    WHERE g.company_id=$1`;
  if (user_id) { params.push(user_id); sql += ` AND g.user_id=$${params.length}`; }
  if (period) { params.push(period); sql += ` AND g.period=$${params.length}`; }
  if (status) { params.push(status); sql += ` AND g.status=$${params.length}`; }
  sql += ' ORDER BY g.created_at DESC';
  const { rows } = await query(sql, params);
  res.json({ data: rows });
});

router.post('/performance/goals', async (req, res) => {
  const { user_id, period, goal_title, metric, target_value, weightage, status } = req.body;
  const { rows } = await query(
    `INSERT INTO hr_performance_goals
     (company_id, user_id, period, goal_title, metric, target_value, weightage, status, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [companyId(req), user_id, period, goal_title, metric || null, target_value || 0, weightage || 0, status || 'draft', req.user.id]
  );
  res.status(201).json({ data: rows[0] });
});

router.patch('/performance/goals/:id', async (req, res) => {
  const { achieved_value, rating, status, manager_remarks } = req.body;
  const { rows } = await query(
    `UPDATE hr_performance_goals
     SET achieved_value=COALESCE($1,achieved_value), rating=COALESCE($2,rating),
         status=COALESCE($3,status), manager_remarks=COALESCE($4,manager_remarks)
     WHERE id=$5 AND company_id=$6 RETURNING *`,
    [achieved_value, rating, status, manager_remarks, req.params.id, companyId(req)]
  );
  res.json({ data: rows[0] });
});

router.get('/employee-cases', async (req, res) => {
  const { case_type, status } = req.query;
  const params = [companyId(req)];
  let sql = `
    SELECT c.*, u.name AS employee_name, u.employee_code, r.name AS raised_by_name, a.name AS assigned_to_name
    FROM hr_employee_cases c
    JOIN users u ON u.id = c.user_id
    LEFT JOIN users r ON r.id = c.raised_by
    LEFT JOIN users a ON a.id = c.assigned_to
    WHERE c.company_id=$1`;
  if (case_type) { params.push(case_type); sql += ` AND c.case_type=$${params.length}`; }
  if (status) { params.push(status); sql += ` AND c.status=$${params.length}`; }
  sql += ' ORDER BY c.created_at DESC';
  const { rows } = await query(sql, params);
  res.json({ data: rows });
});

router.post('/employee-cases', async (req, res) => {
  const { user_id, case_type, severity, title, description, assigned_to } = req.body;
  const { rows } = await query(
    `INSERT INTO hr_employee_cases
     (company_id, user_id, case_type, severity, title, description, raised_by, assigned_to)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [companyId(req), user_id, case_type || 'grievance', severity || 'medium', title, description || null, req.user.id, assigned_to || null]
  );
  res.status(201).json({ data: rows[0] });
});

router.patch('/employee-cases/:id', async (req, res) => {
  const { status, action_taken, assigned_to } = req.body;
  const { rows } = await query(
    `UPDATE hr_employee_cases
     SET status=COALESCE($1,status), action_taken=COALESCE($2,action_taken),
         assigned_to=COALESCE($3,assigned_to),
         closed_at=CASE WHEN $1='closed' THEN NOW() ELSE closed_at END
     WHERE id=$4 AND company_id=$5 RETURNING *`,
    [status, action_taken, assigned_to, req.params.id, companyId(req)]
  );
  res.json({ data: rows[0] });
});

router.get('/exits', async (req, res) => {
  const { status } = req.query;
  const params = [companyId(req)];
  let sql = `
    SELECT e.*, u.name AS employee_name, u.employee_code
    FROM hr_exit_cases e
    JOIN users u ON u.id = e.user_id
    WHERE e.company_id=$1`;
  if (status) { params.push(status); sql += ` AND e.status=$${params.length}`; }
  sql += ' ORDER BY e.created_at DESC';
  const { rows } = await query(sql, params);
  res.json({ data: rows });
});

router.post('/exits', async (req, res) => {
  const { user_id, resignation_date, last_working_date, reason, notice_days, remarks } = req.body;
  const { rows } = await query(
    `INSERT INTO hr_exit_cases
     (company_id, user_id, resignation_date, last_working_date, reason, notice_days, remarks, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [companyId(req), user_id, resignation_date || null, last_working_date || null, reason || null, notice_days || 0, remarks || null, req.user.id]
  );
  res.status(201).json({ data: rows[0] });
});

router.patch('/exits/:id', async (req, res) => {
  const {
    status, handover_status, asset_clearance_status, finance_clearance_status,
    final_settlement_amount, remarks,
  } = req.body;
  const { rows } = await query(
    `UPDATE hr_exit_cases
     SET status=COALESCE($1,status), handover_status=COALESCE($2,handover_status),
         asset_clearance_status=COALESCE($3,asset_clearance_status),
         finance_clearance_status=COALESCE($4,finance_clearance_status),
         final_settlement_amount=COALESCE($5,final_settlement_amount),
         remarks=COALESCE($6,remarks)
     WHERE id=$7 AND company_id=$8 RETURNING *`,
    [status, handover_status, asset_clearance_status, finance_clearance_status, final_settlement_amount, remarks, req.params.id, companyId(req)]
  );
  res.json({ data: rows[0] });
});

router.get('/letters/templates', async (req, res) => {
  const { status, letter_type } = req.query;
  const params = [companyId(req)];
  let sql = `
    SELECT t.*, u.name AS created_by_name
    FROM hr_letter_templates t
    LEFT JOIN users u ON u.id = t.created_by
    WHERE t.company_id=$1`;
  if (status) { params.push(status); sql += ` AND t.status=$${params.length}`; }
  if (letter_type) { params.push(letter_type); sql += ` AND t.letter_type=$${params.length}`; }
  sql += ' ORDER BY t.created_at DESC';
  const { rows } = await query(sql, params);
  res.json({ data: rows });
});

router.post('/letters/templates', async (req, res) => {
  const { template_code, title, letter_type, body, status } = req.body;
  const { rows } = await query(
    `INSERT INTO hr_letter_templates
     (company_id, template_code, title, letter_type, body, status, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT (company_id, template_code)
     DO UPDATE SET title=$3, letter_type=$4, body=$5, status=$6
     RETURNING *`,
    [companyId(req), template_code || null, title, letter_type || 'general', body, status || 'active', req.user.id]
  );
  res.status(201).json({ data: rows[0] });
});

router.get('/letters/issues', async (req, res) => {
  const { user_id, letter_type, status } = req.query;
  const params = [companyId(req)];
  let sql = `
    SELECT i.*, u.name AS employee_name, u.employee_code, t.title AS template_title, t.letter_type
    FROM hr_letter_issues i
    JOIN users u ON u.id = i.user_id
    LEFT JOIN hr_letter_templates t ON t.id = i.template_id
    WHERE i.company_id=$1`;
  if (user_id) { params.push(user_id); sql += ` AND i.user_id=$${params.length}`; }
  if (letter_type) { params.push(letter_type); sql += ` AND t.letter_type=$${params.length}`; }
  if (status) { params.push(status); sql += ` AND i.status=$${params.length}`; }
  sql += ' ORDER BY i.issue_date DESC, i.created_at DESC';
  const { rows } = await query(sql, params);
  res.json({ data: rows });
});

router.post('/letters/issues', async (req, res) => {
  const { template_id, user_id, letter_no, issue_date, body, status, remarks } = req.body;
  const no = letter_no || `HRL-${Date.now()}`;
  const { rows } = await query(
    `INSERT INTO hr_letter_issues
     (company_id, template_id, user_id, letter_no, issue_date, body, status, remarks, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [companyId(req), template_id || null, user_id, no, issue_date || new Date().toISOString().slice(0, 10),
      body, status || 'issued', remarks || null, req.user.id]
  );
  res.status(201).json({ data: rows[0] });
});

router.get('/policies', async (req, res) => {
  const { status, category } = req.query;
  const params = [companyId(req)];
  let sql = `
    SELECT p.*, u.name AS created_by_name,
           COUNT(a.id)::int AS acknowledged_count
    FROM hr_policy_documents p
    LEFT JOIN users u ON u.id = p.created_by
    LEFT JOIN hr_policy_acknowledgements a ON a.policy_id = p.id
    WHERE p.company_id=$1`;
  if (status) { params.push(status); sql += ` AND p.status=$${params.length}`; }
  if (category) { params.push(category); sql += ` AND p.category=$${params.length}`; }
  sql += ' GROUP BY p.id, u.name ORDER BY p.effective_date DESC, p.created_at DESC';
  const { rows } = await query(sql, params);
  res.json({ data: rows });
});

router.post('/policies', async (req, res) => {
  const { policy_code, title, category, version, effective_date, body, status } = req.body;
  const { rows } = await query(
    `INSERT INTO hr_policy_documents
     (company_id, policy_code, title, category, version, effective_date, body, status, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     ON CONFLICT (company_id, policy_code, version)
     DO UPDATE SET title=$3, category=$4, effective_date=$6, body=$7, status=$8
     RETURNING *`,
    [companyId(req), policy_code || null, title, category || 'HR', version || '1.0',
      effective_date || new Date().toISOString().slice(0, 10), body, status || 'published', req.user.id]
  );
  res.status(201).json({ data: rows[0] });
});

router.patch('/policies/:id', async (req, res) => {
  const { policy_code, title, category, version, effective_date, body, status } = req.body;
  try {
    const { rows } = await query(
      `UPDATE hr_policy_documents SET policy_code=$1,title=$2,category=$3,version=$4,effective_date=$5,body=$6,status=$7,updated_at=NOW()
       WHERE id=$8 AND company_id=$9 RETURNING *`,
      [policy_code||null, title, category||'HR', version||'1.0', effective_date||new Date().toISOString().slice(0,10), body, status||'published', req.params.id, companyId(req)]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json({ data: rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/policies/:id', async (req, res) => {
  try {
    await query(`DELETE FROM hr_policy_documents WHERE id=$1 AND company_id=$2`, [req.params.id, companyId(req)]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/policies/acknowledgements', async (req, res) => {
  const { policy_id, user_id } = req.query;
  const params = [companyId(req)];
  let sql = `
    SELECT a.*, p.title AS policy_title, p.version, u.name AS employee_name, u.employee_code
    FROM hr_policy_acknowledgements a
    JOIN hr_policy_documents p ON p.id = a.policy_id
    JOIN users u ON u.id = a.user_id
    WHERE a.company_id=$1`;
  if (policy_id) { params.push(policy_id); sql += ` AND a.policy_id=$${params.length}`; }
  const scopedUserId = hasHrAccess(req) ? user_id : req.user.id;
  if (scopedUserId) { params.push(scopedUserId); sql += ` AND a.user_id=$${params.length}`; }
  sql += ' ORDER BY a.acknowledged_at DESC';
  const { rows } = await query(sql, params);
  res.json({ data: rows });
});

router.post('/policies/:id/acknowledge', async (req, res) => {
  const { user_id, remarks } = req.body;
  const { rows } = await query(
    `INSERT INTO hr_policy_acknowledgements
     (company_id, policy_id, user_id, remarks)
     VALUES ($1,$2,$3,$4)
     ON CONFLICT (policy_id, user_id)
     DO UPDATE SET status='acknowledged', remarks=$4, acknowledged_at=NOW()
     RETURNING *`,
    [companyId(req), req.params.id, user_id || req.user.id, remarks || null]
  );
  res.status(201).json({ data: rows[0] });
});

router.get('/service-requests', async (req, res) => {
  const { status, request_type, user_id } = req.query;
  const params = [companyId(req)];
  let sql = `
    SELECT r.*, u.name AS employee_name, u.employee_code, a.name AS assigned_to_name, c.name AS created_by_name
    FROM hr_service_requests r
    JOIN users u ON u.id = r.user_id
    LEFT JOIN users a ON a.id = r.assigned_to
    LEFT JOIN users c ON c.id = r.created_by
    WHERE r.company_id=$1`;
  if (status) { params.push(status); sql += ` AND r.status=$${params.length}`; }
  if (request_type) { params.push(request_type); sql += ` AND r.request_type=$${params.length}`; }
  const scopedUserId = hasHrAccess(req) ? user_id : req.user.id;
  if (scopedUserId) { params.push(scopedUserId); sql += ` AND r.user_id=$${params.length}`; }
  sql += ' ORDER BY r.created_at DESC';
  const { rows } = await query(sql, params);
  res.json({ data: rows });
});

router.post('/service-requests', async (req, res) => {
  const { user_id, request_no, request_type, priority, subject, description, assigned_to } = req.body;
  const no = request_no || `HRS-${Date.now()}`;
  const { rows } = await query(
    `INSERT INTO hr_service_requests
     (company_id, request_no, user_id, request_type, priority, subject, description, assigned_to, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [companyId(req), no, user_id || req.user.id, request_type || 'general', priority || 'normal',
      subject, description || null, assigned_to || null, req.user.id]
  );
  res.status(201).json({ data: rows[0] });
});

router.patch('/service-requests/:id', async (req, res) => {
  const { status, priority, assigned_to, resolution } = req.body;
  const { rows } = await query(
    `UPDATE hr_service_requests
     SET status=COALESCE($1,status), priority=COALESCE($2,priority),
         assigned_to=COALESCE($3,assigned_to), resolution=COALESCE($4,resolution),
         closed_at=CASE WHEN $1 IN ('closed','resolved','cancelled') THEN NOW() ELSE closed_at END,
         updated_at=NOW()
     WHERE id=$5 AND company_id=$6 RETURNING *`,
    [status, priority, assigned_to, resolution, req.params.id, companyId(req)]
  );
  res.json({ data: rows[0] });
});

router.get('/analytics/summary', async (req, res) => {
  try {
    const safe = (q, params, fallback) => query(q, params).catch(() => ({ rows: [fallback] }));
    const cid = companyId(req);
    const projectId = await getProjectScope(req);

    // For project-scoped roles, count only employees in their project
    const empFilter = projectId !== null
      ? `SELECT COUNT(u.*)::int AS total, COUNT(u.*) FILTER (WHERE u.is_active=TRUE)::int AS active
         FROM users u JOIN employee_profiles ep ON ep.user_id=u.id
         WHERE u.company_id=$1 AND ep.project_id=$2`
      : `SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE is_active=TRUE)::int AS active FROM users WHERE company_id=$1`;

    const [
      employees,
      recruitment,
      attendanceCorrections,
      training,
      cases,
      exits,
      goals,
      letters,
      policies,
      serviceRequests,
    ] = await Promise.all([
      projectId !== null
        ? query(empFilter, [cid, projectId])
        : query(empFilter, [cid]),
      safe(`SELECT COUNT(*)::int AS open_jobs FROM hr_job_openings WHERE company_id=$1 AND status='open'`, [cid], { open_jobs: 0 }),
      safe(`SELECT COUNT(*)::int AS pending FROM hr_attendance_correction_requests WHERE company_id=$1 AND status='pending'`, [cid], { pending: 0 }),
      safe(`SELECT COUNT(*)::int AS planned FROM hr_training_programs WHERE company_id=$1 AND status IN ('planned','scheduled')`, [cid], { planned: 0 }),
      safe(`SELECT COUNT(*)::int AS open_cases FROM hr_employee_cases WHERE company_id=$1 AND status='open'`, [cid], { open_cases: 0 }),
      safe(`SELECT COUNT(*)::int AS active_exits FROM hr_exit_cases WHERE company_id=$1 AND status NOT IN ('closed','cancelled')`, [cid], { active_exits: 0 }),
      safe(`SELECT COUNT(*)::int AS goals, COALESCE(AVG(rating),0)::numeric(5,2) AS avg_rating FROM hr_performance_goals WHERE company_id=$1`, [cid], { goals: 0, avg_rating: 0 }),
      safe(`SELECT COUNT(*)::int AS issued_letters FROM hr_letter_issues WHERE company_id=$1`, [cid], { issued_letters: 0 }),
      safe(`
        SELECT COUNT(*)::int AS published_policies, COUNT(a.id)::int AS acknowledgements
        FROM hr_policy_documents p
        LEFT JOIN hr_policy_acknowledgements a ON a.policy_id = p.id
        WHERE p.company_id=$1 AND p.status='published'`, [cid], { published_policies: 0, acknowledgements: 0 }),
      safe(`SELECT COUNT(*)::int AS open_requests FROM hr_service_requests WHERE company_id=$1 AND status IN ('open','in_progress')`, [cid], { open_requests: 0 }),
    ]);

    const deptParams = projectId !== null ? [cid, projectId] : [cid];
    const deptExtra  = projectId !== null ? ` AND ep.project_id=$2` : '';
    const departments = await query(
      `SELECT COALESCE(d.name,'Unassigned') AS department, COUNT(u.id)::int AS headcount
       FROM users u
       LEFT JOIN employee_profiles ep ON ep.user_id = u.id
       LEFT JOIN hr_departments d ON d.id = ep.department_id
       WHERE u.company_id=$1 AND u.is_active=TRUE${deptExtra}
       GROUP BY COALESCE(d.name,'Unassigned')
       ORDER BY headcount DESC`,
      deptParams
    );

    res.json({
      data: {
        employees: employees.rows[0],
        recruitment: recruitment.rows[0],
        attendanceCorrections: attendanceCorrections.rows[0],
        training: training.rows[0],
        cases: cases.rows[0],
        exits: exits.rows[0],
        goals: goals.rows[0],
        letters: letters.rows[0],
        policies: policies.rows[0],
        serviceRequests: serviceRequests.rows[0],
        departments: departments.rows,
      },
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── HR Analytics Charts ───────────────────────────────────────────────────────
// Years in service, age distribution, location headcount, monthly additions & attrition
router.get('/analytics/charts', async (req, res) => {
  try {
    const cid = companyId(req);

    const [yearsInService, ageDist, locationDist, additionsAttrition] = await Promise.all([

      // Years in service buckets
      query(`
        SELECT
          CASE
            WHEN yrs < 1  THEN '< 1'
            WHEN yrs < 2  THEN '1-2'
            WHEN yrs < 3  THEN '2-3'
            WHEN yrs < 4  THEN '3-4'
            WHEN yrs < 5  THEN '4-5'
            WHEN yrs < 6  THEN '5-6'
            WHEN yrs < 7  THEN '6-7'
            WHEN yrs < 8  THEN '7-8'
            WHEN yrs < 9  THEN '8-9'
            WHEN yrs < 10 THEN '9-10'
            ELSE '> 10'
          END AS bucket,
          COUNT(*)::int AS count
        FROM (
          SELECT EXTRACT(EPOCH FROM (NOW() - ep.date_of_joining)) / 86400 / 365 AS yrs
          FROM users u
          JOIN employee_profiles ep ON ep.user_id = u.id
          WHERE u.company_id = $1 AND u.is_active = TRUE AND ep.date_of_joining IS NOT NULL
            AND ep.employment_status = 'active'
        ) t
        GROUP BY bucket
        ORDER BY MIN(yrs)`,
        [cid]),

      // Age distribution buckets
      query(`
        SELECT
          CASE
            WHEN age < 20  THEN '< 20'
            WHEN age < 25  THEN '20-25'
            WHEN age < 30  THEN '25-30'
            WHEN age < 35  THEN '30-35'
            WHEN age < 40  THEN '35-40'
            WHEN age < 45  THEN '40-45'
            WHEN age < 50  THEN '45-50'
            ELSE '> 50'
          END AS bucket,
          COUNT(*)::int AS count
        FROM (
          SELECT DATE_PART('year', AGE(ep.date_of_birth)) AS age
          FROM users u
          JOIN employee_profiles ep ON ep.user_id = u.id
          WHERE u.company_id = $1 AND u.is_active = TRUE AND ep.date_of_birth IS NOT NULL
            AND ep.employment_status = 'active'
        ) t
        GROUP BY bucket
        ORDER BY MIN(age)`,
        [cid]),

      // Employee count by location
      query(`
        SELECT COALESCE(NULLIF(TRIM(ep.work_location),''), 'Not Set') AS location,
               COUNT(*)::int AS count
        FROM users u
        JOIN employee_profiles ep ON ep.user_id = u.id
        WHERE u.company_id = $1 AND u.is_active = TRUE AND ep.employment_status = 'active'
        GROUP BY COALESCE(NULLIF(TRIM(ep.work_location),''), 'Not Set')
        ORDER BY count DESC
        LIMIT 10`,
        [cid]),

      // Monthly additions & attrition — last 12 months
      query(`
        WITH months AS (
          SELECT generate_series(
            DATE_TRUNC('month', NOW()) - INTERVAL '11 months',
            DATE_TRUNC('month', NOW()),
            '1 month'::interval
          ) AS mo
        ),
        joined AS (
          SELECT DATE_TRUNC('month', ep.date_of_joining) AS mo, COUNT(*)::int AS cnt
          FROM employee_profiles ep
          JOIN users u ON u.id = ep.user_id
          WHERE u.company_id = $1 AND ep.date_of_joining IS NOT NULL
            AND ep.date_of_joining >= NOW() - INTERVAL '12 months'
          GROUP BY 1
        ),
        left_co AS (
          SELECT DATE_TRUNC('month', ep.date_of_leaving) AS mo, COUNT(*)::int AS cnt
          FROM employee_profiles ep
          JOIN users u ON u.id = ep.user_id
          WHERE u.company_id = $1 AND ep.date_of_leaving IS NOT NULL
            AND ep.date_of_leaving >= NOW() - INTERVAL '12 months'
          GROUP BY 1
        )
        SELECT TO_CHAR(m.mo, 'Mon-YYYY') AS month,
               COALESCE(j.cnt, 0) AS joined,
               COALESCE(l.cnt, 0) AS resigned
        FROM months m
        LEFT JOIN joined   j ON j.mo = m.mo
        LEFT JOIN left_co  l ON l.mo = m.mo
        ORDER BY m.mo`,
        [cid]),
    ]);

    res.json({
      data: {
        years_in_service:     yearsInService.rows,
        age_distribution:     ageDist.rows,
        location_headcount:   locationDist.rows,
        additions_attrition:  additionsAttrition.rows,
      },
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Employee Segments ─────────────────────────────────────────────────────────
router.get('/segments', async (req, res) => {
  if (!hasHrAccess(req)) return res.status(403).json({ error: 'Forbidden' });
  try {
    const { rows } = await query(
      `SELECT s.*, u.name AS created_by_name FROM hr_employee_segments s
       LEFT JOIN users u ON u.id = s.created_by
       WHERE s.company_id=$1 ORDER BY s.created_at DESC`,
      [companyId(req)]
    );
    res.json({ data: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/segments', async (req, res) => {
  if (!hasHrAccess(req)) return res.status(403).json({ error: 'Forbidden' });
  const { name, description, criteria, color } = req.body;
  try {
    const { rows } = await query(
      `INSERT INTO hr_employee_segments (company_id, name, description, criteria, color, created_by)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [companyId(req), name, description||null, JSON.stringify(criteria||{}), color||'#2563EB', req.user.id]
    );
    res.status(201).json({ data: rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch('/segments/:id', async (req, res) => {
  if (!hasHrAccess(req)) return res.status(403).json({ error: 'Forbidden' });
  const { name, description, criteria, color } = req.body;
  try {
    const { rows } = await query(
      `UPDATE hr_employee_segments SET name=COALESCE($1,name), description=COALESCE($2,description),
       criteria=COALESCE($3,criteria), color=COALESCE($4,color), updated_at=NOW()
       WHERE id=$5 AND company_id=$6 RETURNING *`,
      [name, description, criteria ? JSON.stringify(criteria) : null, color, req.params.id, companyId(req)]
    );
    res.json({ data: rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/segments/:id', async (req, res) => {
  if (!hasHrAccess(req)) return res.status(403).json({ error: 'Forbidden' });
  try {
    await query(`DELETE FROM hr_employee_segments WHERE id=$1 AND company_id=$2`, [req.params.id, companyId(req)]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Employee Filters ──────────────────────────────────────────────────────────
router.get('/emp-filters', async (req, res) => {
  if (!hasHrAccess(req)) return res.status(403).json({ error: 'Forbidden' });
  try {
    const { rows } = await query(
      `SELECT f.*, u.name AS created_by_name FROM hr_employee_filters f
       LEFT JOIN users u ON u.id = f.created_by
       WHERE f.company_id=$1 ORDER BY f.created_at DESC`,
      [companyId(req)]
    );
    res.json({ data: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/emp-filters', async (req, res) => {
  if (!hasHrAccess(req)) return res.status(403).json({ error: 'Forbidden' });
  const { name, description, filters, is_shared } = req.body;
  try {
    const { rows } = await query(
      `INSERT INTO hr_employee_filters (company_id, name, description, filters, is_shared, created_by)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [companyId(req), name, description||null, JSON.stringify(filters||{}), is_shared||false, req.user.id]
    );
    res.status(201).json({ data: rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/emp-filters/:id', async (req, res) => {
  if (!hasHrAccess(req)) return res.status(403).json({ error: 'Forbidden' });
  try {
    await query(`DELETE FROM hr_employee_filters WHERE id=$1 AND company_id=$2`, [req.params.id, companyId(req)]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Org chart — all active employees with their reporting manager
router.get('/org-chart', async (req, res) => {
  if (!hasHrAccess(req)) return res.status(403).json({ error: 'Forbidden' });
  try {
    const { rows } = await query(`
      SELECT
        u.id,
        u.name,
        u.email,
        u.role,
        COALESCE(u.employee_code, '')             AS employee_code,
        ep.reporting_manager_id,
        COALESCE(ep.work_location, '')            AS work_location,
        COALESCE(ep.employment_type, '')          AS employment_type,
        COALESCE(ep.profile_photo_url, '')        AS profile_photo_url,
        COALESCE(dep.name, 'Unassigned')          AS department,
        COALESCE(des.name, '')                    AS designation,
        COALESCE(des.grade, '')                   AS grade
      FROM users u
      LEFT JOIN employee_profiles ep ON ep.user_id = u.id
      LEFT JOIN hr_departments dep ON dep.id = ep.department_id
      LEFT JOIN hr_designations des ON des.id = ep.designation_id
      WHERE u.company_id = $1
        AND u.is_active = TRUE
        AND u.role NOT IN ('super_admin','vendor','customer','contractor')
      ORDER BY COALESCE(dep.name,'Unassigned'), u.name
    `, [req.user.company_id]);
    res.json({ success: true, data: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Employee Master Reports ────────────────────────────────────────────────────

// Add date_of_confirmation column if it doesn't exist (idempotent)
query(`ALTER TABLE employee_profiles ADD COLUMN IF NOT EXISTS date_of_confirmation DATE`).catch(() => {});

// GET /confirmation-report — employees on probation with status
router.get('/confirmation-report', async (req, res) => {
  if (!hasHrAccess(req)) return res.status(403).json({ error: 'Forbidden' });
  try {
    const { department_id, status, from_date, to_date } = req.query;
    const params = [req.user.company_id];
    let where = `u.company_id = $1 AND u.is_active = TRUE AND ep.probation_end_date IS NOT NULL`;

    if (department_id) { params.push(department_id); where += ` AND ep.department_id = $${params.length}`; }
    if (from_date)     { params.push(from_date);     where += ` AND ep.probation_end_date >= $${params.length}`; }
    if (to_date)       { params.push(to_date);       where += ` AND ep.probation_end_date <= $${params.length}`; }

    const { rows } = await query(`
      SELECT
        u.id,
        u.name,
        u.employee_code,
        u.email,
        ep.date_of_joining,
        ep.probation_end_date,
        ep.date_of_confirmation,
        ep.employment_type,
        ep.employment_status,
        ep.work_location,
        dep.name                              AS department,
        des.name                              AS designation,
        mgr.name                              AS reporting_manager,
        (ep.probation_end_date - CURRENT_DATE)::int AS days_left,
        CASE
          WHEN ep.date_of_confirmation IS NOT NULL          THEN 'confirmed'
          WHEN ep.probation_end_date < CURRENT_DATE - 7    THEN 'overdue'
          WHEN ep.probation_end_date <= CURRENT_DATE + 30  THEN 'due_soon'
          ELSE 'upcoming'
        END AS confirmation_status
      FROM users u
      LEFT JOIN employee_profiles ep  ON ep.user_id = u.id
      LEFT JOIN hr_departments    dep ON dep.id = ep.department_id
      LEFT JOIN hr_designations   des ON des.id = ep.designation_id
      LEFT JOIN users             mgr ON mgr.id = ep.reporting_manager_id
      WHERE ${where}
      ORDER BY
        CASE
          WHEN ep.date_of_confirmation IS NOT NULL THEN 4
          WHEN ep.probation_end_date < CURRENT_DATE - 7   THEN 1
          WHEN ep.probation_end_date <= CURRENT_DATE + 30 THEN 2
          ELSE 3
        END,
        ep.probation_end_date ASC
    `, params);

    // Filter by status after query (simpler than nested CASE in WHERE)
    const filtered = status
      ? rows.filter(r => r.confirmation_status === status)
      : rows;

    // Summary counts
    const summary = {
      total:     rows.length,
      overdue:   rows.filter(r => r.confirmation_status === 'overdue').length,
      due_soon:  rows.filter(r => r.confirmation_status === 'due_soon').length,
      upcoming:  rows.filter(r => r.confirmation_status === 'upcoming').length,
      confirmed: rows.filter(r => r.confirmation_status === 'confirmed').length,
    };

    res.json({ success: true, data: filtered, summary });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PATCH /employees/:id/confirm — mark employee as confirmed
router.patch('/employees/:id/confirm', async (req, res) => {
  if (!hasHrAccess(req)) return res.status(403).json({ error: 'Forbidden' });
  try {
    const { id } = req.params;
    const { date_of_confirmation } = req.body;
    const confirmDate = date_of_confirmation || new Date().toISOString().slice(0, 10);
    const { rows } = await query(`
      UPDATE employee_profiles
         SET date_of_confirmation = $1, updated_at = NOW()
       WHERE user_id = $2
         AND (SELECT company_id FROM users WHERE id = $2) = $3
      RETURNING user_id, date_of_confirmation
    `, [confirmDate, id, req.user.company_id]);
    if (!rows.length) return res.status(404).json({ error: 'Employee not found' });
    res.json({ success: true, data: rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
