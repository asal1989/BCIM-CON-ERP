// src/routes/hr-appraisals.routes.js
// Annual performance reviews, KRA scoring, increment management
const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const { query } = require('../config/database');
const { runSchemaInit } = require('../utils/schemaInit');

router.use(authenticate);

// Roles allowed to view/create/edit ANY appraisal in the company. A plain
// employee may still view/acknowledge their OWN appraisal (checked per-route
// below) — this file previously had no authorization at all, letting any
// authenticated employee read or edit anyone else's appraisal.
const HR_ROLES = ['super_admin', 'admin', 'hr', 'hr_admin', 'hr_manager', 'manager', 'department_head', 'project_manager'];
const isHrRole = (role) => HR_ROLES.includes(role);

const initTable = async () => {
  await query(`
    CREATE TABLE IF NOT EXISTS hr_appraisals (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id UUID REFERENCES companies(id),
      user_id UUID REFERENCES users(id),
      review_period TEXT,
      review_period_type TEXT DEFAULT 'monthly',
      appraisal_year INT,
      review_date DATE,
      reviewer_id UUID REFERENCES users(id),
      kra_score NUMERIC(5,2),
      kra_scores JSONB,
      overall_rating TEXT,
      increment_pct NUMERIC(5,2) DEFAULT 0,
      increment_amount NUMERIC(12,2) DEFAULT 0,
      new_ctc NUMERIC(14,2),
      comments TEXT,
      strengths TEXT,
      improvements TEXT,
      training_required TEXT,
      status TEXT DEFAULT 'draft',
      acknowledged_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  // add columns if upgrading from old schema
  await query(`ALTER TABLE hr_appraisals ADD COLUMN IF NOT EXISTS kra_scores JSONB`).catch(()=>{});
  await query(`ALTER TABLE hr_appraisals ADD COLUMN IF NOT EXISTS appraisal_year INT`).catch(()=>{});
  await query(`ALTER TABLE hr_appraisals ADD COLUMN IF NOT EXISTS review_period_type TEXT DEFAULT 'monthly'`).catch(()=>{});
  await query(`ALTER TABLE hr_appraisals ADD COLUMN IF NOT EXISTS strengths TEXT`).catch(()=>{});
  await query(`ALTER TABLE hr_appraisals ADD COLUMN IF NOT EXISTS improvements TEXT`).catch(()=>{});
  await query(`ALTER TABLE hr_appraisals ADD COLUMN IF NOT EXISTS training_required TEXT`).catch(()=>{});
};
runSchemaInit('hr-appraisals', initTable);

router.get('/', authorize(...HR_ROLES), async (req, res) => {
  try {
    const { user_id, review_period, status } = req.query;
    let sql = `
      SELECT a.*, u.name as employee_name, u.employee_code,
             r.name as reviewer_name, dep.name as department_name
      FROM hr_appraisals a
      JOIN users u ON u.id = a.user_id
      LEFT JOIN users r ON r.id = a.reviewer_id
      LEFT JOIN employee_profiles ep ON ep.user_id = u.id
      LEFT JOIN hr_departments dep ON dep.id = ep.department_id
      WHERE a.company_id = $1`;
    const params = [req.user.company_id];
    let idx = 2;
    if (user_id)       { sql += ` AND a.user_id=$${idx}`;       params.push(user_id);       idx++; }
    if (review_period) { sql += ` AND a.review_period=$${idx}`;  params.push(review_period); idx++; }
    if (status)        { sql += ` AND a.status=$${idx}`;         params.push(status);        idx++; }
    sql += ' ORDER BY a.created_at DESC';
    const { rows } = await query(sql, params);
    res.json({ data: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/:id', async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT a.*, u.name as employee_name, u.employee_code, r.name as reviewer_name
       FROM hr_appraisals a
       JOIN users u ON u.id = a.user_id
       LEFT JOIN users r ON r.id = a.reviewer_id
       WHERE a.id=$1 AND a.company_id=$2`,
      [req.params.id, req.user.company_id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    // An employee may view their own appraisal; anyone else needs an HR role.
    if (rows[0].user_id !== req.user.id && !isHrRole(req.user.role)) {
      return res.status(403).json({ error: 'Not authorized to view this appraisal' });
    }
    res.json({ data: rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', authorize(...HR_ROLES), async (req, res) => {
  try {
    const {
      user_id, review_period, review_period_type, appraisal_year, review_date, reviewer_id,
      kra_score, kra_scores, overall_rating, rating,
      increment_pct, increment_percentage, increment_amount, new_ctc,
      comments, strengths, improvements, training_required
    } = req.body;
    const { rows } = await query(
      `INSERT INTO hr_appraisals
       (company_id, user_id, review_period, review_period_type, appraisal_year, review_date, reviewer_id,
        kra_score, kra_scores, overall_rating, increment_pct, increment_amount, new_ctc,
        comments, strengths, improvements, training_required)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING *`,
      [req.user.company_id, user_id, review_period || null, review_period_type || 'monthly',
       appraisal_year || new Date().getFullYear(), review_date || null,
       reviewer_id || req.user.id,
       kra_score || null, kra_scores ? JSON.stringify(kra_scores) : null,
       overall_rating || rating || null,
       increment_pct || increment_percentage || 0, increment_amount || 0, new_ctc || null,
       comments || null, strengths || null, improvements || null, training_required || null]
    );
    res.status(201).json({ data: rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/:id', authorize(...HR_ROLES), async (req, res) => {
  try {
    const {
      review_date, review_period_type, appraisal_year,
      kra_score, kra_scores, overall_rating, rating,
      increment_pct, increment_percentage, increment_amount, new_ctc,
      comments, strengths, improvements, training_required, status
    } = req.body;
    const { rows } = await query(
      `UPDATE hr_appraisals SET review_date=$1, review_period_type=$2, appraisal_year=$3,
         kra_score=$4, kra_scores=$5, overall_rating=$6,
         increment_pct=$7, increment_amount=$8, new_ctc=$9,
         comments=$10, strengths=$11, improvements=$12, training_required=$13, status=$14
       WHERE id=$15 AND company_id=$16 RETURNING *`,
      [review_date || null, review_period_type || 'monthly',
       appraisal_year || new Date().getFullYear(),
       kra_score || null, kra_scores ? JSON.stringify(kra_scores) : null,
       overall_rating || rating || null,
       increment_pct || increment_percentage || 0, increment_amount || 0, new_ctc || null,
       comments || null, strengths || null, improvements || null, training_required || null,
       status || 'draft', req.params.id, req.user.company_id]
    );
    res.json({ data: rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch('/:id/acknowledge', async (req, res) => {
  try {
    const { rows } = await query(
      `UPDATE hr_appraisals SET status='acknowledged', acknowledged_at=NOW()
       WHERE id=$1 AND company_id=$2 AND user_id=$3 RETURNING *`,
      [req.params.id, req.user.company_id, req.user.id]
    );
    if (!rows.length) return res.status(403).json({ error: 'Cannot acknowledge this appraisal' });
    res.json({ data: rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;

