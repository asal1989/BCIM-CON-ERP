// public-careers.routes.js — unauthenticated public API for website careers page
const express = require('express');
const router  = express.Router();
const crypto  = require('crypto');
const { query } = require('../config/database');

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
      `SELECT id, title, department, designation, vacancies,
              experience_min, experience_max, qualification,
              job_type, work_location, description, responsibilities,
              skills_required, closing_date, created_at
       FROM hr_job_postings
       WHERE company_id=$1 AND status='open'
       ORDER BY created_at DESC`,
      [req.company_id]
    );
    res.json({ data: rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/public/careers/apply
router.post('/apply', requireApiKey, async (req, res) => {
  try {
    const {
      job_id, name, email, phone, experience_years,
      current_company, current_designation, qualification,
      expected_ctc, notice_period_days,
    } = req.body;
    if (!job_id || !name?.trim())
      return res.status(400).json({ error: 'job_id and name are required' });

    const jobCheck = await query(
      `SELECT id FROM hr_job_postings WHERE id=$1 AND company_id=$2 AND status='open'`,
      [job_id, req.company_id]
    );
    if (!jobCheck.rows.length)
      return res.status(404).json({ error: 'Job not found or no longer open' });

    const { rows } = await query(
      `INSERT INTO hr_applicants
         (company_id, job_id, name, email, phone, experience_years,
          current_company, current_designation, qualification,
          expected_ctc, notice_period_days, source)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'portal') RETURNING id`,
      [
        req.company_id, job_id, name.trim(),
        email || null, phone || null, experience_years || 0,
        current_company || null, current_designation || null,
        qualification || null, expected_ctc || null, notice_period_days || 0,
      ]
    );
    res.status(201).json({ data: { id: rows[0].id } });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
