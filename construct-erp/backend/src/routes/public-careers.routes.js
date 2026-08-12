// public-careers.routes.js — unauthenticated public API for website careers page
//
// Repointed from the legacy hr_job_openings/hr_candidates tables (a separate,
// unused mini-module) to the real, actively-developed ATS schema
// (hr_job_postings/hr_applicants — see hr-recruitment.routes.js), so a job
// posted in the real Recruitment page actually shows up here, and a public
// applicant actually shows up in the real Candidates tab. The old tables are
// left in place untouched as a historical record, just no longer read here.
const express = require('express');
const router  = express.Router();
const crypto  = require('crypto');
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');
const { query } = require('../config/database');

// Same convention as hr-recruitment.routes.js's own resume uploads — disk
// file + resume_url, not a BYTEA blob in the DB.
const uploadDir = path.join(__dirname, '../../uploads/hr-resumes');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
const resumeUpload = multer({
  storage: multer.diskStorage({
    destination: (_, __, cb) => cb(null, uploadDir),
    filename:    (_, f, cb)  => cb(null, `${Date.now()}-${f.originalname}`),
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = ['application/pdf', 'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    cb(null, ok.includes(file.mimetype));
  },
});

async function requireApiKey(req, res, next) {
  const raw = req.headers['x-api-key'] ||
              (req.headers['authorization'] || '').replace(/^Bearer\s+/i, '');
  if (!raw) return res.status(401).json({ error: 'API key required (X-Api-Key header)' });

  const hash = crypto.createHash('sha256').update(raw).digest('hex');
  let rows;
  try {
    ({ rows } = await query(
      `SELECT id, company_id, scopes FROM api_keys
       WHERE key_hash=$1 AND revoked_at IS NULL`,
      [hash]
    ));
  } catch (e) {
    return res.status(500).json({ error: 'Auth check failed' });
  }
  if (!rows.length) return res.status(401).json({ error: 'Invalid or revoked API key' });

  query(`UPDATE api_keys SET last_used_at=NOW() WHERE id=$1`, [rows[0].id]).catch(() => {});
  req.apiKey    = rows[0];
  req.company_id = rows[0].company_id;
  next();
}

// GET /api/public/careers/jobs
router.get('/jobs', requireApiKey, async (req, res) => {
  try {
    const { rows } = await query(
      // department/designation are plain text on hr_job_postings (no FK
      // join needed, unlike the old hr_job_openings). job_code has no
      // equivalent column on the new table — kept in the response shape as
      // null rather than dropping the key, so an existing external consumer
      // reading it doesn't break, it just renders blank.
      `SELECT j.id, j.title, NULL AS job_code, j.work_location,
              j.vacancies, j.description, j.status, j.created_at,
              j.department, j.designation
       FROM hr_job_postings j
       WHERE j.company_id=$1 AND j.status='open' AND j.is_public_listed = true
       ORDER BY j.created_at DESC`,
      [req.company_id]
    );
    res.json({ data: rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/public/careers/apply  (multipart/form-data)
router.post('/apply', requireApiKey, resumeUpload.single('resume'), async (req, res) => {
  try {
    const { job_id, name, email, phone, experience_years, current_company, expected_ctc, note } = req.body;
    if (!name?.trim())
      return res.status(400).json({ error: 'name is required' });

    if (job_id) {
      const jobCheck = await query(
        `SELECT id FROM hr_job_postings WHERE id=$1 AND company_id=$2 AND status='open'`,
        [job_id, req.company_id]
      );
      if (!jobCheck.rows.length)
        return res.status(404).json({ error: 'Job not found or no longer open' });
    }

    const resume = req.file;
    const resume_url = resume ? `/uploads/hr-resumes/${resume.filename}` : null;
    const { rows } = await query(
      // job_id is nullable on hr_applicants — a candidate can submit a
      // general application not tied to any specific opening.
      `INSERT INTO hr_applicants
         (company_id, job_id, name, email, phone, experience_years,
          current_company, expected_ctc, source, resume_url, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'portal',$9,$10) RETURNING id`,
      [
        req.company_id, job_id || null, name.trim(),
        email || null, phone || null,
        experience_years ? Number(experience_years) : 0,
        current_company || null, expected_ctc || null,
        resume_url,
        note?.trim() || null,
      ]
    );
    res.status(201).json({ data: { id: rows[0].id } });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
