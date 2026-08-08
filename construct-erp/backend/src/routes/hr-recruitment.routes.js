// hr-recruitment.routes.js — Recruitment & ATS
const express = require('express');
const router  = express.Router();
const { query } = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { sendMail } = require('../services/mail.service');

const HR_ROLES = ['super_admin','admin','hr_admin','hr_manager'];
const HR_ALL   = [...HR_ROLES, 'hr', 'manager', 'department_head'];

const uploadDir = path.join(__dirname, '../../../uploads/hr-resumes');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
const upload = multer({
  storage: multer.diskStorage({
    destination: (_, __, cb) => cb(null, uploadDir),
    filename:    (_, f, cb)  => cb(null, `${Date.now()}-${f.originalname}`)
  }),
  limits: { fileSize: 10*1024*1024 }
});

;(async () => {
  const safe = async sql => { try { await query(sql); } catch(_) {} };
  await safe(`CREATE TABLE IF NOT EXISTS hr_job_postings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL,
    title VARCHAR(200) NOT NULL,
    department VARCHAR(100),
    designation VARCHAR(100),
    vacancies INT DEFAULT 1,
    experience_min NUMERIC(4,1) DEFAULT 0,
    experience_max NUMERIC(4,1),
    qualification VARCHAR(200),
    job_type VARCHAR(30) DEFAULT 'full_time'
      CHECK (job_type IN ('full_time','part_time','contract','intern','apprentice')),
    work_location VARCHAR(200),
    salary_min NUMERIC(12,2),
    salary_max NUMERIC(12,2),
    description TEXT,
    responsibilities TEXT,
    skills_required TEXT,
    status VARCHAR(20) DEFAULT 'open' CHECK (status IN ('open','on_hold','closed','filled')),
    closing_date DATE,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`);
  await safe(`CREATE TABLE IF NOT EXISTS hr_applicants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL,
    job_id UUID NOT NULL REFERENCES hr_job_postings(id) ON DELETE CASCADE,
    name VARCHAR(200) NOT NULL,
    email VARCHAR(200),
    phone VARCHAR(30),
    experience_years NUMERIC(4,1) DEFAULT 0,
    current_company VARCHAR(200),
    current_designation VARCHAR(200),
    current_ctc NUMERIC(12,2),
    expected_ctc NUMERIC(12,2),
    notice_period_days INT DEFAULT 0,
    qualification VARCHAR(200),
    resume_url TEXT,
    source VARCHAR(30) DEFAULT 'portal'
      CHECK (source IN ('referral','portal','walk_in','consultant','campus','linkedin','other')),
    referred_by VARCHAR(200),
    status VARCHAR(30) DEFAULT 'applied'
      CHECK (status IN ('applied','shortlisted','interview_scheduled','interview_done','selected','offer_sent','offer_accepted','offer_declined','joined','rejected','on_hold')),
    rejection_reason TEXT,
    notes TEXT,
    applied_on DATE DEFAULT CURRENT_DATE,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`);
  await safe(`CREATE TABLE IF NOT EXISTS hr_interviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL,
    applicant_id UUID NOT NULL REFERENCES hr_applicants(id) ON DELETE CASCADE,
    round INT DEFAULT 1,
    interview_type VARCHAR(30) DEFAULT 'face_to_face'
      CHECK (interview_type IN ('face_to_face','video','telephonic','technical','hr')),
    interviewer_id UUID REFERENCES users(id),
    interviewer_name VARCHAR(200),
    scheduled_on TIMESTAMPTZ,
    venue_or_link TEXT,
    result VARCHAR(20) CHECK (result IN ('pass','fail','hold','no_show')),
    rating INT CHECK (rating BETWEEN 1 AND 5),
    feedback TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  // ── Job Requisition — the approval workflow that precedes a job opening ──
  await safe(`CREATE TABLE IF NOT EXISTS hr_job_requisitions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL,
    requisition_no TEXT UNIQUE,
    project_id UUID REFERENCES projects(id),
    department VARCHAR(100),
    position VARCHAR(200) NOT NULL,
    vacancies INT DEFAULT 1,
    employment_type VARCHAR(30) DEFAULT 'full_time',
    salary_budget_min NUMERIC(12,2),
    salary_budget_max NUMERIC(12,2),
    experience_required VARCHAR(100),
    qualification VARCHAR(200),
    required_skills TEXT,
    hiring_reason TEXT,
    priority VARCHAR(20) DEFAULT 'medium' CHECK (priority IN ('low','medium','high','urgent')),
    expected_joining_date DATE,
    status VARCHAR(30) DEFAULT 'pending_hr_review'
      CHECK (status IN ('pending_hr_review','pending_management_approval','approved','rejected','converted')),
    raised_by UUID REFERENCES users(id),
    hr_reviewed_by UUID REFERENCES users(id),
    hr_reviewed_at TIMESTAMPTZ,
    hr_remarks TEXT,
    management_approved_by UUID REFERENCES users(id),
    management_approved_at TIMESTAMPTZ,
    management_remarks TEXT,
    rejection_reason TEXT,
    job_id UUID REFERENCES hr_job_postings(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`);
  await safe(`ALTER TABLE hr_job_postings ADD COLUMN IF NOT EXISTS requisition_id UUID REFERENCES hr_job_requisitions(id)`);

  // ── Interview evaluation — structured scores alongside the existing
  // free-text feedback/rating (rating doubles as "Overall Rating"). ────────
  await safe(`ALTER TABLE hr_interviews ADD COLUMN IF NOT EXISTS technical_knowledge INT CHECK (technical_knowledge BETWEEN 1 AND 5)`);
  await safe(`ALTER TABLE hr_interviews ADD COLUMN IF NOT EXISTS communication_score INT CHECK (communication_score BETWEEN 1 AND 5)`);
  await safe(`ALTER TABLE hr_interviews ADD COLUMN IF NOT EXISTS experience_score INT CHECK (experience_score BETWEEN 1 AND 5)`);
  await safe(`ALTER TABLE hr_interviews ADD COLUMN IF NOT EXISTS problem_solving_score INT CHECK (problem_solving_score BETWEEN 1 AND 5)`);
  await safe(`ALTER TABLE hr_interviews ADD COLUMN IF NOT EXISTS behaviour_score INT CHECK (behaviour_score BETWEEN 1 AND 5)`);
  await safe(`ALTER TABLE hr_interviews ADD COLUMN IF NOT EXISTS safety_awareness_score INT CHECK (safety_awareness_score BETWEEN 1 AND 5)`);
  await safe(`ALTER TABLE hr_interviews ADD COLUMN IF NOT EXISTS recommendation VARCHAR(20) CHECK (recommendation IN ('hire','hold','reject'))`);

  // ── Candidate Approval — sequential multi-stage sign-off ─────────────────
  await safe(`CREATE TABLE IF NOT EXISTS hr_candidate_approvals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL,
    applicant_id UUID NOT NULL REFERENCES hr_applicants(id) ON DELETE CASCADE,
    stage VARCHAR(30) NOT NULL CHECK (stage IN ('hr','department_manager','project_manager','hr_head')),
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
    approver_id UUID REFERENCES users(id),
    approved_at TIMESTAMPTZ,
    remarks TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(applicant_id, stage)
  )`);

  // ── Offer Management ──────────────────────────────────────────────────────
  await safe(`CREATE TABLE IF NOT EXISTS hr_offers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL,
    applicant_id UUID NOT NULL REFERENCES hr_applicants(id) ON DELETE CASCADE,
    position VARCHAR(200),
    department VARCHAR(100),
    salary NUMERIC(12,2),
    allowances NUMERIC(12,2) DEFAULT 0,
    joining_bonus NUMERIC(12,2) DEFAULT 0,
    probation_months INT DEFAULT 3,
    notice_buyout NUMERIC(12,2) DEFAULT 0,
    joining_date DATE,
    status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft','pending_approval','sent','accepted','declined')),
    created_by UUID REFERENCES users(id),
    sent_at TIMESTAMPTZ,
    responded_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  // ── Joining Tracker — offer acceptance through to employee record ────────
  await safe(`CREATE TABLE IF NOT EXISTS hr_joining_tracker (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL,
    applicant_id UUID NOT NULL REFERENCES hr_applicants(id) ON DELETE CASCADE UNIQUE,
    offer_id UUID REFERENCES hr_offers(id),
    offer_accepted_at TIMESTAMPTZ,
    documents_submitted BOOLEAN DEFAULT FALSE,
    documents_submitted_at TIMESTAMPTZ,
    background_verification_status VARCHAR(20) DEFAULT 'pending' CHECK (background_verification_status IN ('pending','verified','failed','not_required')),
    medical_clearance_status VARCHAR(20) DEFAULT 'pending' CHECK (medical_clearance_status IN ('pending','cleared','failed','not_required')),
    joining_confirmed BOOLEAN DEFAULT FALSE,
    joining_confirmed_at TIMESTAMPTZ,
    employee_user_id UUID REFERENCES users(id),
    hr_owner UUID REFERENCES users(id),
    pending_tasks TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  // ── Phase 2: Offer Letter, Talent Pool, Settings masters ────────────────
  await safe(`ALTER TABLE hr_offers ADD COLUMN IF NOT EXISTS letter_html TEXT`);
  await safe(`ALTER TABLE hr_offers ADD COLUMN IF NOT EXISTS letter_sent_at TIMESTAMPTZ`);
  await safe(`ALTER TABLE hr_offers ADD COLUMN IF NOT EXISTS reporting_manager TEXT`);
  await safe(`ALTER TABLE hr_offers ADD COLUMN IF NOT EXISTS terms TEXT`);

  await safe(`CREATE TABLE IF NOT EXISTS hr_talent_pool (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL,
    name VARCHAR(200) NOT NULL,
    email VARCHAR(200),
    phone VARCHAR(30),
    category VARCHAR(100),
    experience_years NUMERIC(4,1) DEFAULT 0,
    current_company VARCHAR(200),
    qualification VARCHAR(200),
    resume_url TEXT,
    notes TEXT,
    added_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  // Settings masters — flat lookup lists, editable without a code change.
  await safe(`CREATE TABLE IF NOT EXISTS hr_recruitment_sources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL,
    name VARCHAR(100) NOT NULL,
    active BOOLEAN DEFAULT TRUE,
    UNIQUE(company_id, name)
  )`);
  await safe(`CREATE TABLE IF NOT EXISTS hr_recruitment_skills (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL,
    name VARCHAR(100) NOT NULL,
    active BOOLEAN DEFAULT TRUE,
    UNIQUE(company_id, name)
  )`);
  await safe(`CREATE TABLE IF NOT EXISTS hr_job_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL,
    name VARCHAR(100) NOT NULL,
    active BOOLEAN DEFAULT TRUE,
    UNIQUE(company_id, name)
  )`);

  // Seed talent pool categories as job categories too, matching the spec's
  // construction-specific role list — safe to re-run (ON CONFLICT DO NOTHING).
  const DEFAULT_CATEGORIES = ['Civil Engineers', 'Site Engineers', 'QA/QC Engineers', 'Safety Officers', 'Quantity Surveyors', 'Store Keepers', 'Equipment Operators', 'Electricians', 'Welders'];
  for (const cat of DEFAULT_CATEGORIES) {
    await safe(`INSERT INTO hr_job_categories (company_id, name) SELECT id, '${cat.replace(/'/g, "''")}' FROM companies ON CONFLICT DO NOTHING`);
  }
})();

const APPROVAL_STAGES = ['hr', 'department_manager', 'project_manager', 'hr_head'];
const APPROVAL_STAGE_LABEL = { hr: 'HR', department_manager: 'Department Manager', project_manager: 'Project Manager', hr_head: 'HR Head' };

async function nextRequisitionNo(companyId) {
  const { rows } = await query(`SELECT COUNT(*)::int AS cnt FROM hr_job_requisitions WHERE company_id=$1`, [companyId]);
  const yr = new Date().getFullYear();
  return `REQ-${yr}-${String(rows[0].cnt + 1).padStart(4, '0')}`;
}

// Recomputed on every read rather than stored, so a stage added later
// (e.g. a joining tracker row created before offer_id existed) doesn't
// need a backfill migration to stay accurate.
function joiningProgress(t) {
  const steps = [
    !!t.offer_accepted_at, t.documents_submitted,
    ['verified', 'not_required'].includes(t.background_verification_status),
    ['cleared', 'not_required'].includes(t.medical_clearance_status),
    t.joining_confirmed, !!t.employee_user_id,
  ];
  return Math.round((steps.filter(Boolean).length / steps.length) * 100);
}

router.use(authenticate);

// ── Job Postings ──────────────────────────────────────────────────────────────
router.get('/jobs', authorize(...HR_ALL), async (req, res) => {
  const { status, department } = req.query;
  const conds = ['j.company_id=$1']; const params=[req.user.company_id]; let i=2;
  if (status)     { conds.push(`j.status=$${i++}`); params.push(status); }
  if (department) { conds.push(`j.department ILIKE $${i++}`); params.push(`%${department}%`); }
  const { rows } = await query(
    `SELECT j.*,
       (SELECT COUNT(*) FROM hr_applicants a WHERE a.job_id=j.id) as applicant_count,
       (SELECT COUNT(*) FROM hr_applicants a WHERE a.job_id=j.id AND a.status='shortlisted') as shortlisted_count,
       (SELECT COUNT(*) FROM hr_applicants a WHERE a.job_id=j.id AND a.status IN ('selected','offer_sent','offer_accepted','joined')) as selected_count
     FROM hr_job_postings j WHERE ${conds.join(' AND ')} ORDER BY j.created_at DESC`,
    params
  );
  res.json({ data: rows });
});

router.post('/jobs', authorize(...HR_ROLES), async (req, res) => {
  const d = req.body;
  const { rows } = await query(
    `INSERT INTO hr_job_postings(company_id,title,department,designation,vacancies,
       experience_min,experience_max,qualification,job_type,work_location,salary_min,salary_max,
       description,responsibilities,skills_required,status,closing_date,created_by)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) RETURNING *`,
    [req.user.company_id,d.title,d.department,d.designation,d.vacancies||1,
     d.experience_min||0,d.experience_max||null,d.qualification,d.job_type||'full_time',
     d.work_location,d.salary_min||null,d.salary_max||null,
     d.description,d.responsibilities,d.skills_required,d.status||'open',d.closing_date||null,req.user.id]
  );
  res.json({ data: rows[0] });
});

router.put('/jobs/:id', authorize(...HR_ROLES), async (req, res) => {
  const d = req.body;
  const { rows } = await query(
    `UPDATE hr_job_postings SET title=$1,department=$2,designation=$3,vacancies=$4,
       experience_min=$5,experience_max=$6,qualification=$7,job_type=$8,work_location=$9,
       salary_min=$10,salary_max=$11,description=$12,responsibilities=$13,skills_required=$14,
       status=$15,closing_date=$16
     WHERE id=$17 AND company_id=$18 RETURNING *`,
    [d.title,d.department,d.designation,d.vacancies||1,
     d.experience_min||0,d.experience_max||null,d.qualification,d.job_type,d.work_location,
     d.salary_min||null,d.salary_max||null,d.description,d.responsibilities,d.skills_required,
     d.status,d.closing_date||null,req.params.id,req.user.company_id]
  );
  res.json({ data: rows[0] });
});

// ── Applicants ────────────────────────────────────────────────────────────────
router.get('/applicants', authorize(...HR_ALL), async (req, res) => {
  const { job_id, status, search } = req.query;
  const conds = ['a.company_id=$1']; const params=[req.user.company_id]; let i=2;
  if (job_id) { conds.push(`a.job_id=$${i++}`); params.push(job_id); }
  if (status) { conds.push(`a.status=$${i++}`); params.push(status); }
  if (search) { conds.push(`(a.name ILIKE $${i} OR a.email ILIKE $${i} OR a.phone ILIKE $${i})`); params.push(`%${search}%`); i++; }
  const { rows } = await query(
    `SELECT a.*, j.title as job_title, j.department
     FROM hr_applicants a JOIN hr_job_postings j ON j.id=a.job_id
     WHERE ${conds.join(' AND ')} ORDER BY a.applied_on DESC`,
    params
  );
  res.json({ data: rows });
});

router.get('/applicants/:id', authorize(...HR_ALL), async (req, res) => {
  const { rows } = await query(
    `SELECT a.*, j.title as job_title FROM hr_applicants a JOIN hr_job_postings j ON j.id=a.job_id
     WHERE a.id=$1 AND a.company_id=$2`,
    [req.params.id, req.user.company_id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Not found' });
  const { rows: interviews } = await query(
    `SELECT i.*, u.name as interviewer_name FROM hr_interviews i
     LEFT JOIN users u ON u.id=i.interviewer_id WHERE i.applicant_id=$1 ORDER BY i.scheduled_on`,
    [req.params.id]
  );
  res.json({ data: { ...rows[0], interviews } });
});

router.post('/applicants', authorize(...HR_ALL), upload.single('resume'), async (req, res) => {
  const d = req.body;
  const resume_url = req.file ? `/uploads/hr-resumes/${req.file.filename}` : null;
  const { rows } = await query(
    `INSERT INTO hr_applicants(company_id,job_id,name,email,phone,experience_years,
       current_company,current_designation,current_ctc,expected_ctc,notice_period_days,
       qualification,source,referred_by,resume_url,notes,applied_on,created_by)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) RETURNING *`,
    [req.user.company_id,d.job_id,d.name,d.email,d.phone,d.experience_years||0,
     d.current_company,d.current_designation,d.current_ctc||null,d.expected_ctc||null,
     d.notice_period_days||0,d.qualification,d.source||'portal',d.referred_by,
     resume_url,d.notes,d.applied_on||new Date().toISOString().split('T')[0],req.user.id]
  );
  res.json({ data: rows[0] });
});

router.patch('/applicants/:id/status', authorize(...HR_ROLES), async (req, res) => {
  const { status, rejection_reason, notes } = req.body;
  const { rows } = await query(
    `UPDATE hr_applicants SET status=$1,rejection_reason=$2,notes=COALESCE($3,notes),updated_at=NOW()
     WHERE id=$4 AND company_id=$5 RETURNING *`,
    [status, rejection_reason||null, notes, req.params.id, req.user.company_id]
  );
  res.json({ data: rows[0] });
});

// ── Interviews ────────────────────────────────────────────────────────────────
router.post('/applicants/:id/interviews', authorize(...HR_ROLES), async (req, res) => {
  const d = req.body;
  const { rows } = await query(
    `INSERT INTO hr_interviews(company_id,applicant_id,round,interview_type,interviewer_id,
       interviewer_name,scheduled_on,venue_or_link,feedback)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [req.user.company_id,req.params.id,d.round||1,d.interview_type||'face_to_face',
     d.interviewer_id||null,d.interviewer_name,d.scheduled_on,d.venue_or_link,d.feedback]
  );
  // Update applicant status
  await query(`UPDATE hr_applicants SET status='interview_scheduled',updated_at=NOW() WHERE id=$1 AND status NOT IN ('rejected','selected')`, [req.params.id]);
  res.json({ data: rows[0] });
});

router.patch('/interviews/:id', authorize(...HR_ROLES), async (req, res) => {
  const {
    result, rating, feedback, scheduled_on,
    technical_knowledge, communication_score, experience_score,
    problem_solving_score, behaviour_score, safety_awareness_score, recommendation,
  } = req.body;
  const { rows } = await query(
    `UPDATE hr_interviews SET
       result=COALESCE($1,result), rating=COALESCE($2,rating), feedback=COALESCE($3,feedback),
       scheduled_on=COALESCE($4,scheduled_on),
       technical_knowledge=COALESCE($5,technical_knowledge), communication_score=COALESCE($6,communication_score),
       experience_score=COALESCE($7,experience_score), problem_solving_score=COALESCE($8,problem_solving_score),
       behaviour_score=COALESCE($9,behaviour_score), safety_awareness_score=COALESCE($10,safety_awareness_score),
       recommendation=COALESCE($11,recommendation)
     WHERE id=$12 AND company_id=$13 RETURNING *`,
    [result || null, rating ?? null, feedback || null, scheduled_on || null,
     technical_knowledge ?? null, communication_score ?? null, experience_score ?? null,
     problem_solving_score ?? null, behaviour_score ?? null, safety_awareness_score ?? null,
     recommendation || null, req.params.id, req.user.company_id]
  );
  res.json({ data: rows[0] });
});

// Pipeline summary
router.get('/pipeline', authorize(...HR_ALL), async (req, res) => {
  const { rows } = await query(
    `SELECT j.title, j.department, j.vacancies, j.status as job_status,
       COUNT(a.id) FILTER (WHERE a.status='applied') as applied,
       COUNT(a.id) FILTER (WHERE a.status='shortlisted') as shortlisted,
       COUNT(a.id) FILTER (WHERE a.status IN ('interview_scheduled','interview_done')) as interviewing,
       COUNT(a.id) FILTER (WHERE a.status IN ('selected','offer_sent','offer_accepted')) as offered,
       COUNT(a.id) FILTER (WHERE a.status='joined') as joined,
       COUNT(a.id) FILTER (WHERE a.status='rejected') as rejected
     FROM hr_job_postings j
     LEFT JOIN hr_applicants a ON a.job_id=j.id
     WHERE j.company_id=$1 AND j.status='open'
     GROUP BY j.id ORDER BY j.created_at DESC`,
    [req.user.company_id]
  );
  res.json({ data: rows });
});

// ── Job Requisitions ──────────────────────────────────────────────────────
router.get('/requisitions', authorize(...HR_ALL), async (req, res) => {
  const { status } = req.query;
  const conds = ['r.company_id=$1']; const params = [req.user.company_id]; let i = 2;
  if (status) { conds.push(`r.status=$${i++}`); params.push(status); }
  const { rows } = await query(`
    SELECT r.*, p.name AS project_name, u.name AS raised_by_name,
           hru.name AS hr_reviewed_by_name, mgu.name AS management_approved_by_name
    FROM hr_job_requisitions r
    LEFT JOIN projects p ON p.id = r.project_id
    LEFT JOIN users u ON u.id = r.raised_by
    LEFT JOIN users hru ON hru.id = r.hr_reviewed_by
    LEFT JOIN users mgu ON mgu.id = r.management_approved_by
    WHERE ${conds.join(' AND ')} ORDER BY r.created_at DESC
  `, params);
  res.json({ data: rows });
});

router.post('/requisitions', authorize(...HR_ALL), async (req, res) => {
  const d = req.body;
  if (!d.position) return res.status(400).json({ error: 'Position is required' });
  const requisition_no = await nextRequisitionNo(req.user.company_id);
  const { rows } = await query(`
    INSERT INTO hr_job_requisitions
      (company_id, requisition_no, project_id, department, position, vacancies, employment_type,
       salary_budget_min, salary_budget_max, experience_required, qualification, required_skills,
       hiring_reason, priority, expected_joining_date, raised_by)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING *
  `, [req.user.company_id, requisition_no, d.project_id || null, d.department, d.position, d.vacancies || 1,
      d.employment_type || 'full_time', d.salary_budget_min || null, d.salary_budget_max || null,
      d.experience_required, d.qualification, d.required_skills, d.hiring_reason,
      d.priority || 'medium', d.expected_joining_date || null, req.user.id]);
  res.status(201).json({ data: rows[0] });
});

router.patch('/requisitions/:id/hr-review', authorize(...HR_ROLES), async (req, res) => {
  const { action, remarks } = req.body; // 'approve' | 'reject'
  if (!['approve', 'reject'].includes(action)) return res.status(400).json({ error: 'Invalid action' });
  const status = action === 'approve' ? 'pending_management_approval' : 'rejected';
  const { rows } = await query(`
    UPDATE hr_job_requisitions SET status=$1, hr_reviewed_by=$2, hr_reviewed_at=NOW(), hr_remarks=$3,
      rejection_reason = CASE WHEN $1='rejected' THEN $3 ELSE rejection_reason END
    WHERE id=$4 AND company_id=$5 AND status='pending_hr_review' RETURNING *
  `, [status, req.user.id, remarks || null, req.params.id, req.user.company_id]);
  if (!rows.length) return res.status(404).json({ error: 'Requisition not found or not pending HR review' });
  res.json({ data: rows[0] });
});

router.patch('/requisitions/:id/management-approval', authorize(...HR_ROLES, 'managing_director', 'director', 'md', 'ceo', 'management'), async (req, res) => {
  const { action, remarks } = req.body;
  if (!['approve', 'reject'].includes(action)) return res.status(400).json({ error: 'Invalid action' });
  const status = action === 'approve' ? 'approved' : 'rejected';
  const { rows } = await query(`
    UPDATE hr_job_requisitions SET status=$1, management_approved_by=$2, management_approved_at=NOW(), management_remarks=$3,
      rejection_reason = CASE WHEN $1='rejected' THEN $3 ELSE rejection_reason END
    WHERE id=$4 AND company_id=$5 AND status='pending_management_approval' RETURNING *
  `, [status, req.user.id, remarks || null, req.params.id, req.user.company_id]);
  if (!rows.length) return res.status(404).json({ error: 'Requisition not found or not pending management approval' });
  res.json({ data: rows[0] });
});

router.post('/requisitions/:id/convert-to-opening', authorize(...HR_ROLES), async (req, res) => {
  const reqRes = await query(`SELECT * FROM hr_job_requisitions WHERE id=$1 AND company_id=$2`, [req.params.id, req.user.company_id]);
  const r = reqRes.rows[0];
  if (!r) return res.status(404).json({ error: 'Requisition not found' });
  if (r.status !== 'approved') return res.status(400).json({ error: 'Only an approved requisition can be converted to a job opening' });

  const jobRes = await query(`
    INSERT INTO hr_job_postings
      (company_id, title, department, vacancies, qualification, job_type, salary_min, salary_max,
       skills_required, status, requisition_id, created_by)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'open',$10,$11) RETURNING *
  `, [req.user.company_id, r.position, r.department, r.vacancies, r.qualification, r.employment_type,
      r.salary_budget_min, r.salary_budget_max, r.required_skills, r.id, req.user.id]);

  await query(`UPDATE hr_job_requisitions SET status='converted', job_id=$1 WHERE id=$2`, [jobRes.rows[0].id, r.id]);
  res.status(201).json({ data: jobRes.rows[0] });
});

// ── Candidate Approval workflow ───────────────────────────────────────────
router.get('/applicants/:id/approvals', authorize(...HR_ALL), async (req, res) => {
  const { rows } = await query(`
    SELECT a.*, u.name AS approver_name
    FROM hr_candidate_approvals a LEFT JOIN users u ON u.id = a.approver_id
    WHERE a.applicant_id=$1 AND a.company_id=$2
  `, [req.params.id, req.user.company_id]);
  // Stable stage order regardless of insertion order.
  const byStage = Object.fromEntries(rows.map(r => [r.stage, r]));
  res.json({ data: APPROVAL_STAGES.map(s => byStage[s] || { stage: s, status: 'not_started', label: APPROVAL_STAGE_LABEL[s] }) });
});

router.post('/applicants/:id/approvals/start', authorize(...HR_ROLES), async (req, res) => {
  for (const stage of APPROVAL_STAGES) {
    await query(`
      INSERT INTO hr_candidate_approvals (company_id, applicant_id, stage)
      VALUES ($1,$2,$3) ON CONFLICT (applicant_id, stage) DO NOTHING
    `, [req.user.company_id, req.params.id, stage]);
  }
  res.status(201).json({ message: 'Approval workflow started' });
});

router.patch('/applicants/:id/approvals/:stage', authorize(...HR_ALL), async (req, res) => {
  const { stage } = req.params;
  if (!APPROVAL_STAGES.includes(stage)) return res.status(400).json({ error: 'Invalid stage' });
  const { action, remarks } = req.body;
  if (!['approve', 'reject'].includes(action)) return res.status(400).json({ error: 'Invalid action' });
  const status = action === 'approve' ? 'approved' : 'rejected';

  const { rows } = await query(`
    UPDATE hr_candidate_approvals SET status=$1, approver_id=$2, approved_at=NOW(), remarks=$3
    WHERE applicant_id=$4 AND stage=$5 AND company_id=$6 RETURNING *
  `, [status, req.user.id, remarks || null, req.params.id, stage, req.user.company_id]);
  if (!rows.length) return res.status(404).json({ error: 'Approval stage not found — has the workflow been started?' });

  if (status === 'rejected') {
    await query(`UPDATE hr_applicants SET status='rejected', rejection_reason=$1, updated_at=NOW() WHERE id=$2`, [remarks || `Rejected at ${APPROVAL_STAGE_LABEL[stage]} stage`, req.params.id]);
  } else if (stage === 'hr_head') {
    // Last stage approved — candidate is fully cleared for an offer.
    await query(`UPDATE hr_applicants SET status='selected', updated_at=NOW() WHERE id=$1`, [req.params.id]);
  }
  res.json({ data: rows[0] });
});

// ── Offer Management ───────────────────────────────────────────────────────
router.get('/applicants/:id/offers', authorize(...HR_ALL), async (req, res) => {
  const { rows } = await query(`SELECT * FROM hr_offers WHERE applicant_id=$1 AND company_id=$2 ORDER BY created_at DESC`, [req.params.id, req.user.company_id]);
  res.json({ data: rows });
});

router.post('/applicants/:id/offers', authorize(...HR_ROLES), async (req, res) => {
  const d = req.body;
  const { rows } = await query(`
    INSERT INTO hr_offers
      (company_id, applicant_id, position, department, salary, allowances, joining_bonus,
       probation_months, notice_buyout, joining_date, status, created_by)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'draft',$11) RETURNING *
  `, [req.user.company_id, req.params.id, d.position, d.department, d.salary || null,
      d.allowances || 0, d.joining_bonus || 0, d.probation_months || 3, d.notice_buyout || 0,
      d.joining_date || null, req.user.id]);
  res.status(201).json({ data: rows[0] });
});

router.patch('/offers/:id', authorize(...HR_ROLES), async (req, res) => {
  const { status, salary, allowances, joining_bonus, probation_months, notice_buyout, joining_date } = req.body;
  const sets = []; const params = []; let i = 1;
  const add = (col, val) => { if (val !== undefined) { sets.push(`${col}=$${i++}`); params.push(val); } };
  add('salary', salary); add('allowances', allowances); add('joining_bonus', joining_bonus);
  add('probation_months', probation_months); add('notice_buyout', notice_buyout); add('joining_date', joining_date);
  if (status) {
    sets.push(`status=$${i++}`); params.push(status);
    if (status === 'sent') { sets.push(`sent_at=NOW()`); }
    if (['accepted', 'declined'].includes(status)) { sets.push(`responded_at=NOW()`); }
  }
  if (!sets.length) return res.status(400).json({ error: 'No fields to update' });
  params.push(req.params.id, req.user.company_id);
  const { rows } = await query(`UPDATE hr_offers SET ${sets.join(',')} WHERE id=$${i++} AND company_id=$${i} RETURNING *`, params);
  if (!rows.length) return res.status(404).json({ error: 'Offer not found' });

  if (status === 'sent') await query(`UPDATE hr_applicants SET status='offer_sent', updated_at=NOW() WHERE id=$1`, [rows[0].applicant_id]);
  if (status === 'accepted') {
    await query(`UPDATE hr_applicants SET status='offer_accepted', updated_at=NOW() WHERE id=$1`, [rows[0].applicant_id]);
    // Auto-open a joining tracker row the moment an offer is accepted.
    await query(`
      INSERT INTO hr_joining_tracker (company_id, applicant_id, offer_id, offer_accepted_at, hr_owner)
      VALUES ($1,$2,$3,NOW(),$4) ON CONFLICT (applicant_id) DO UPDATE SET offer_id=$3, offer_accepted_at=NOW()
    `, [req.user.company_id, rows[0].applicant_id, rows[0].id, req.user.id]);
  }
  if (status === 'declined') await query(`UPDATE hr_applicants SET status='offer_declined', updated_at=NOW() WHERE id=$1`, [rows[0].applicant_id]);

  res.json({ data: rows[0] });
});

// ── Joining Tracker ────────────────────────────────────────────────────────
router.get('/joining-tracker', authorize(...HR_ALL), async (req, res) => {
  const { rows } = await query(`
    SELECT t.*, a.name AS candidate_name, a.email, a.phone, o.position, o.department, o.joining_date,
           hu.name AS hr_owner_name, eu.name AS employee_name
    FROM hr_joining_tracker t
    JOIN hr_applicants a ON a.id = t.applicant_id
    LEFT JOIN hr_offers o ON o.id = t.offer_id
    LEFT JOIN users hu ON hu.id = t.hr_owner
    LEFT JOIN users eu ON eu.id = t.employee_user_id
    WHERE t.company_id=$1 ORDER BY t.created_at DESC
  `, [req.user.company_id]);
  res.json({ data: rows.map(t => ({ ...t, progress_pct: joiningProgress(t) })) });
});

router.patch('/joining-tracker/:id', authorize(...HR_ROLES), async (req, res) => {
  const { documents_submitted, background_verification_status, medical_clearance_status,
          joining_confirmed, employee_user_id, hr_owner, pending_tasks } = req.body;
  const sets = ['updated_at=NOW()']; const params = []; let i = 1;
  const add = (col, val) => { if (val !== undefined) { sets.push(`${col}=$${i++}`); params.push(val); } };
  add('documents_submitted', documents_submitted);
  if (documents_submitted === true) sets.push('documents_submitted_at=NOW()');
  add('background_verification_status', background_verification_status);
  add('medical_clearance_status', medical_clearance_status);
  add('joining_confirmed', joining_confirmed);
  if (joining_confirmed === true) sets.push('joining_confirmed_at=NOW()');
  add('employee_user_id', employee_user_id);
  add('hr_owner', hr_owner);
  add('pending_tasks', pending_tasks);

  params.push(req.params.id, req.user.company_id);
  const { rows } = await query(`UPDATE hr_joining_tracker SET ${sets.join(',')} WHERE id=$${i++} AND company_id=$${i} RETURNING *`, params);
  if (!rows.length) return res.status(404).json({ error: 'Joining tracker record not found' });

  if (employee_user_id) {
    await query(`UPDATE hr_applicants SET status='joined', updated_at=NOW() WHERE id=$1`, [rows[0].applicant_id]);
  }
  res.json({ data: { ...rows[0], progress_pct: joiningProgress(rows[0]) } });
});

// ── Offer Letter (print/email — matches the HTML-letter + browser-print
// pattern already used elsewhere in this app, rather than a new PDF
// pipeline) ────────────────────────────────────────────────────────────
function buildOfferLetterHtml({ company, applicant, offer }) {
  const inr = (v) => `₹${Number(v || 0).toLocaleString('en-IN')}`;
  const today = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' });
  return `
  <div style="font-family:Arial,sans-serif;max-width:680px;margin:0 auto;color:#0f172a">
    <div style="border-bottom:3px solid #1B3A6B;padding-bottom:14px;margin-bottom:20px">
      <h2 style="margin:0;color:#1B3A6B">${company.name || 'BCIM'}</h2>
      <p style="margin:2px 0 0;font-size:12px;color:#555">${company.address || ''}</p>
    </div>
    <p>Date: ${today}</p>
    <p>Dear <strong>${applicant.name}</strong>,</p>
    <p>We are pleased to offer you the position of <strong>${offer.position || 'the discussed role'}</strong>
       ${offer.department ? `in the <strong>${offer.department}</strong> department` : ''} at ${company.name || 'our company'}.
       Please find the terms of your offer below:</p>
    <table style="width:100%;border-collapse:collapse;font-size:14px;margin:16px 0">
      <tr><td style="padding:8px;border:1px solid #e2e8f0;background:#f8fafc;font-weight:600;width:40%">Position</td><td style="padding:8px;border:1px solid #e2e8f0">${offer.position || '—'}</td></tr>
      <tr><td style="padding:8px;border:1px solid #e2e8f0;background:#f8fafc;font-weight:600">Annual CTC</td><td style="padding:8px;border:1px solid #e2e8f0">${inr(offer.salary)}</td></tr>
      <tr><td style="padding:8px;border:1px solid #e2e8f0;background:#f8fafc;font-weight:600">Allowances</td><td style="padding:8px;border:1px solid #e2e8f0">${inr(offer.allowances)}</td></tr>
      ${Number(offer.joining_bonus) > 0 ? `<tr><td style="padding:8px;border:1px solid #e2e8f0;background:#f8fafc;font-weight:600">Joining Bonus</td><td style="padding:8px;border:1px solid #e2e8f0">${inr(offer.joining_bonus)}</td></tr>` : ''}
      <tr><td style="padding:8px;border:1px solid #e2e8f0;background:#f8fafc;font-weight:600">Probation Period</td><td style="padding:8px;border:1px solid #e2e8f0">${offer.probation_months || 3} months</td></tr>
      <tr><td style="padding:8px;border:1px solid #e2e8f0;background:#f8fafc;font-weight:600">Date of Joining</td><td style="padding:8px;border:1px solid #e2e8f0">${offer.joining_date ? new Date(offer.joining_date).toLocaleDateString('en-IN') : 'To be confirmed'}</td></tr>
      ${offer.reporting_manager ? `<tr><td style="padding:8px;border:1px solid #e2e8f0;background:#f8fafc;font-weight:600">Reporting Manager</td><td style="padding:8px;border:1px solid #e2e8f0">${offer.reporting_manager}</td></tr>` : ''}
    </table>
    ${offer.terms ? `<p style="font-size:13px;color:#334155"><strong>Terms &amp; Conditions:</strong><br>${offer.terms.replace(/\n/g, '<br>')}</p>` : ''}
    <p>Please confirm your acceptance of this offer at the earliest. We look forward to welcoming you to the team.</p>
    <p style="margin-top:24px">Regards,<br><strong>${company.name || 'HR Team'}</strong></p>
  </div>`;
}

router.post('/offers/:id/letter', authorize(...HR_ROLES), async (req, res) => {
  try {
    const { rows } = await query(`SELECT o.*, a.name, a.email FROM hr_offers o JOIN hr_applicants a ON a.id=o.applicant_id WHERE o.id=$1 AND o.company_id=$2`, [req.params.id, req.user.company_id]);
    if (!rows.length) return res.status(404).json({ error: 'Offer not found' });
    const offer = rows[0];
    const { reporting_manager, terms } = req.body;
    if (reporting_manager !== undefined || terms !== undefined) {
      await query(`UPDATE hr_offers SET reporting_manager=COALESCE($1,reporting_manager), terms=COALESCE($2,terms) WHERE id=$3`, [reporting_manager || null, terms || null, req.params.id]);
      Object.assign(offer, { reporting_manager: reporting_manager || offer.reporting_manager, terms: terms || offer.terms });
    }
    const companyRes = await query(`SELECT name, address FROM companies WHERE id=$1`, [req.user.company_id]);
    const html = buildOfferLetterHtml({ company: companyRes.rows[0] || {}, applicant: { name: offer.name, email: offer.email }, offer });
    await query(`UPDATE hr_offers SET letter_html=$1 WHERE id=$2`, [html, req.params.id]);
    res.json({ data: { html } });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/offers/:id/send-letter', authorize(...HR_ROLES), async (req, res) => {
  try {
    const { rows } = await query(`SELECT o.*, a.name, a.email FROM hr_offers o JOIN hr_applicants a ON a.id=o.applicant_id WHERE o.id=$1 AND o.company_id=$2`, [req.params.id, req.user.company_id]);
    if (!rows.length) return res.status(404).json({ error: 'Offer not found' });
    const offer = rows[0];
    if (!offer.email) return res.status(400).json({ error: 'Candidate has no email on file' });
    if (!offer.letter_html) return res.status(400).json({ error: 'Generate the letter first' });

    const result = await sendMail({ to: offer.email, subject: `Offer of Employment — ${offer.position || 'BCIM'}`, html: offer.letter_html });
    await query(`UPDATE hr_offers SET letter_sent_at=NOW(), status=CASE WHEN status='draft' THEN 'sent' ELSE status END, sent_at=COALESCE(sent_at, NOW()) WHERE id=$1`, [req.params.id]);
    await query(`UPDATE hr_applicants SET status=CASE WHEN status NOT IN ('offer_accepted','offer_declined','joined') THEN 'offer_sent' ELSE status END, updated_at=NOW() WHERE id=$1`, [offer.applicant_id]);
    res.json({ message: result.sent ? 'Offer letter emailed' : 'Mail not sent — check mail settings', sent: !!result.sent });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Talent Pool ────────────────────────────────────────────────────────
router.get('/talent-pool', authorize(...HR_ALL), async (req, res) => {
  try {
    const { category, search } = req.query;
    const conds = ['company_id=$1']; const params = [req.user.company_id]; let i = 2;
    if (category) { conds.push(`category=$${i++}`); params.push(category); }
    if (search) { conds.push(`(name ILIKE $${i} OR email ILIKE $${i})`); params.push(`%${search}%`); i++; }
    const { rows } = await query(`SELECT * FROM hr_talent_pool WHERE ${conds.join(' AND ')} ORDER BY created_at DESC`, params);
    res.json({ data: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/talent-pool', authorize(...HR_ALL), async (req, res) => {
  try {
    const d = req.body;
    if (!d.name) return res.status(400).json({ error: 'Name is required' });
    const { rows } = await query(`
      INSERT INTO hr_talent_pool (company_id, name, email, phone, category, experience_years, current_company, qualification, resume_url, notes, added_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *
    `, [req.user.company_id, d.name, d.email || null, d.phone || null, d.category || null, d.experience_years || 0, d.current_company || null, d.qualification || null, d.resume_url || null, d.notes || null, req.user.id]);
    res.status(201).json({ data: rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/talent-pool/:id', authorize(...HR_ROLES), async (req, res) => {
  try {
    const { rows } = await query(`DELETE FROM hr_talent_pool WHERE id=$1 AND company_id=$2 RETURNING id`, [req.params.id, req.user.company_id]);
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Move a talent-pool contact into the real ATS pipeline once a matching opening exists.
router.post('/talent-pool/:id/convert', authorize(...HR_ROLES), async (req, res) => {
  try {
    const { job_id } = req.body;
    if (!job_id) return res.status(400).json({ error: 'job_id is required' });
    const pool = await query(`SELECT * FROM hr_talent_pool WHERE id=$1 AND company_id=$2`, [req.params.id, req.user.company_id]);
    if (!pool.rows.length) return res.status(404).json({ error: 'Not found' });
    const p = pool.rows[0];
    const { rows } = await query(`
      INSERT INTO hr_applicants (company_id, job_id, name, email, phone, experience_years, current_company, qualification, resume_url, source, notes, created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'referral',$10,$11) RETURNING *
    `, [req.user.company_id, job_id, p.name, p.email, p.phone, p.experience_years, p.current_company, p.qualification, p.resume_url, `From Talent Pool: ${p.notes || ''}`, req.user.id]);
    res.status(201).json({ data: rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Recruitment Settings — masters (sources, skills, job categories) ─────
function masterCrud(table, path) {
  router.get(`/settings/${path}`, authorize(...HR_ALL), async (req, res) => {
    try {
      const { rows } = await query(`SELECT * FROM ${table} WHERE company_id=$1 ORDER BY name`, [req.user.company_id]);
      res.json({ data: rows });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });
  router.post(`/settings/${path}`, authorize(...HR_ROLES), async (req, res) => {
    try {
      if (!req.body.name) return res.status(400).json({ error: 'Name is required' });
      const { rows } = await query(`INSERT INTO ${table} (company_id, name) VALUES ($1,$2) ON CONFLICT (company_id, name) DO UPDATE SET active=TRUE RETURNING *`, [req.user.company_id, req.body.name]);
      res.status(201).json({ data: rows[0] });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });
  router.delete(`/settings/${path}/:id`, authorize(...HR_ROLES), async (req, res) => {
    try {
      await query(`UPDATE ${table} SET active=FALSE WHERE id=$1 AND company_id=$2`, [req.params.id, req.user.company_id]);
      res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });
}
masterCrud('hr_recruitment_sources', 'sources');
masterCrud('hr_recruitment_skills', 'skills');
masterCrud('hr_job_categories', 'job-categories');

module.exports = router;
