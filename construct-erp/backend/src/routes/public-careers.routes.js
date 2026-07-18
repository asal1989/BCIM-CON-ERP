// public-careers.routes.js — unauthenticated public API for website careers page
const express = require('express');
const router  = express.Router();
const crypto  = require('crypto');
const multer  = require('multer');
const { query } = require('../config/database');

// Ensure resume columns exist
(async () => {
  await query(`
    ALTER TABLE hr_candidates
      ADD COLUMN IF NOT EXISTS resume_filename  VARCHAR(255),
      ADD COLUMN IF NOT EXISTS resume_data      BYTEA,
      ADD COLUMN IF NOT EXISTS resume_mimetype  VARCHAR(100),
      ADD COLUMN IF NOT EXISTS cover_note       TEXT
  `);
})().catch(() => {});

const resumeUpload = multer({
  storage: multer.memoryStorage(),
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
      `SELECT j.id, j.title, j.job_code, j.location AS work_location,
              j.vacancies, j.description, j.status, j.created_at,
              d.name AS department, des.name AS designation
       FROM hr_job_openings j
       LEFT JOIN hr_departments d   ON d.id = j.department_id
       LEFT JOIN hr_designations des ON des.id = j.designation_id
       WHERE j.company_id=$1 AND j.status='open'
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
        `SELECT id FROM hr_job_openings WHERE id=$1 AND company_id=$2 AND status='open'`,
        [job_id, req.company_id]
      );
      if (!jobCheck.rows.length)
        return res.status(404).json({ error: 'Job not found or no longer open' });
    }

    const resume = req.file;
    const { rows } = await query(
      `INSERT INTO hr_candidates
         (company_id, job_id, name, email, phone, experience_years,
          current_company, expected_ctc, source,
          resume_filename, resume_data, resume_mimetype, cover_note)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'portal',$9,$10,$11,$12) RETURNING id`,
      [
        req.company_id, job_id || null, name.trim(),
        email || null, phone || null,
        experience_years ? Number(experience_years) : 0,
        current_company || null, expected_ctc || null,
        resume?.originalname ?? null,
        resume?.buffer ?? null,
        resume?.mimetype ?? null,
        note?.trim() || null,
      ]
    );
    res.status(201).json({ data: { id: rows[0].id } });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
