// hr-recruitment.routes.js — Recruitment & ATS
const express = require('express');
const router  = express.Router();
const { query } = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

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
})();

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
  const { result, rating, feedback, scheduled_on } = req.body;
  const { rows } = await query(
    `UPDATE hr_interviews SET result=$1,rating=$2,feedback=$3,scheduled_on=COALESCE($4,scheduled_on)
     WHERE id=$5 AND company_id=$6 RETURNING *`,
    [result, rating, feedback, scheduled_on||null, req.params.id, req.user.company_id]
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

module.exports = router;
