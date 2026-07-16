// src/routes/hr-evaluations.routes.js
// Structured staff performance evaluation with KRA/KPI scoring
const express = require('express');
const router  = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const { query } = require('../config/database');
const { runSchemaInit } = require('../utils/schemaInit');

router.use(authenticate);
router.use(authorize('super_admin', 'admin', 'hr', 'hr_admin', 'hr_manager', 'manager', 'department_head'));

const DEFAULT_KRAS = [
  { kra: 'Punctuality',                     weight: 10 },
  { kra: 'Discipline',                      weight: 15 },
  { kra: 'Safety / HSE',                    weight: 20 },
  { kra: 'Housekeeping',                    weight: 15 },
  { kra: 'Quality Assurance',               weight: 20 },
  { kra: 'On-Time Target / Goal Achievement', weight: 20 },
];

const initTable = async () => {
  await query(`
    CREATE TABLE IF NOT EXISTS hr_performance_evaluations (
      id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id               UUID REFERENCES companies(id),
      employee_id              UUID REFERENCES users(id),
      evaluator_id             UUID REFERENCES users(id),
      eval_period              TEXT,
      eval_date                DATE,
      department               TEXT,
      designation              TEXT,
      kra_scores               JSONB DEFAULT '[]',
      self_total               NUMERIC(6,2),
      manager_total            NUMERIC(6,2),
      overall_rating           TEXT,
      strengths                TEXT,
      areas_of_improvement     TEXT,
      goals_next_period        TEXT,
      increment_recommended    NUMERIC(5,2) DEFAULT 0,
      review_type              TEXT DEFAULT 'monthly',
      project_site             TEXT,
      training_required        TEXT,
      comments_remarks         TEXT,
      status                   TEXT DEFAULT 'draft',
      self_submitted_at        TIMESTAMPTZ,
      manager_reviewed_at      TIMESTAMPTZ,
      approved_at              TIMESTAMPTZ,
      acknowledged_at          TIMESTAMPTZ,
      created_at               TIMESTAMPTZ DEFAULT NOW(),
      updated_at               TIMESTAMPTZ DEFAULT NOW()
    )
  `);
};
runSchemaInit('hr-performance-evaluations', initTable);

const ratingLabel = (score) => {
  if (score >= 90) return 'Outstanding';
  if (score >= 80) return 'Very Good';
  if (score >= 70) return 'Good';
  if (score >= 60) return 'Satisfactory';
  return 'Needs Improvement';
};

router.get('/kra-template', (req, res) => {
  res.json({ data: DEFAULT_KRAS });
});

router.get('/', async (req, res) => {
  try {
    const { employee_id, eval_period, status } = req.query;
    let sql = `
      SELECT e.*,
             u.name  AS employee_name, u.employee_code,
             ev.name AS evaluator_name,
             des.name AS emp_designation,
             dep.name AS dept_name
      FROM hr_performance_evaluations e
      JOIN users u ON u.id = e.employee_id
      LEFT JOIN users ev ON ev.id = e.evaluator_id
      LEFT JOIN employee_profiles ep ON ep.user_id = u.id
      LEFT JOIN hr_designations des ON des.id = ep.designation_id
      LEFT JOIN hr_departments dep ON dep.id = ep.department_id
      WHERE e.company_id = $1`;
    const params = [req.user.company_id];
    let idx = 2;
    if (employee_id) { sql += ` AND e.employee_id = $${idx}`; params.push(employee_id); idx++; }
    if (eval_period) { sql += ` AND e.eval_period = $${idx}`;  params.push(eval_period); idx++; }
    if (status)      { sql += ` AND e.status = $${idx}`;       params.push(status);      idx++; }
    sql += ' ORDER BY e.created_at DESC';
    const { rows } = await query(sql, params);
    res.json({ data: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/:id', async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT e.*,
              u.name  AS employee_name, u.employee_code,
              ev.name AS evaluator_name,
              des.name AS emp_designation,
              dep.name AS dept_name
       FROM hr_performance_evaluations e
       JOIN users u ON u.id = e.employee_id
       LEFT JOIN users ev ON ev.id = e.evaluator_id
       LEFT JOIN employee_profiles ep ON ep.user_id = u.id
       LEFT JOIN hr_designations des ON des.id = ep.designation_id
       LEFT JOIN hr_departments dep ON dep.id = ep.department_id
       WHERE e.id = $1 AND e.company_id = $2`,
      [req.params.id, req.user.company_id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json({ data: rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', async (req, res) => {
  try {
    const {
      employee_id, eval_period, eval_date, evaluator_id,
      kra_scores, self_total, manager_total,
      strengths, areas_of_improvement, goals_next_period,
      increment_recommended, review_type, project_site,
      training_required, comments_remarks,
    } = req.body;
    const rating = ratingLabel(parseFloat(manager_total || self_total || 0));
    const { rows } = await query(
      `INSERT INTO hr_performance_evaluations
         (company_id, employee_id, evaluator_id, eval_period, eval_date,
          kra_scores, self_total, manager_total, overall_rating,
          strengths, areas_of_improvement, goals_next_period, increment_recommended,
          review_type, project_site, training_required, comments_remarks)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING *`,
      [
        req.user.company_id, employee_id, evaluator_id || req.user.id,
        eval_period || null, eval_date || null,
        JSON.stringify(kra_scores || []),
        self_total || null, manager_total || null, rating,
        strengths || null, areas_of_improvement || null,
        goals_next_period || null, increment_recommended || 0,
        review_type || 'monthly', project_site || null,
        training_required || null, comments_remarks || null,
      ]
    );
    res.status(201).json({ data: rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/:id', async (req, res) => {
  try {
    const {
      eval_date, kra_scores, self_total, manager_total,
      strengths, areas_of_improvement, goals_next_period,
      increment_recommended, status, review_type, project_site,
      training_required, comments_remarks,
    } = req.body;
    const rating = ratingLabel(parseFloat(manager_total || self_total || 0));
    const { rows } = await query(
      `UPDATE hr_performance_evaluations SET
         eval_date=$1, kra_scores=$2, self_total=$3, manager_total=$4,
         overall_rating=$5, strengths=$6, areas_of_improvement=$7,
         goals_next_period=$8, increment_recommended=$9, status=$10,
         review_type=$11, project_site=$12, training_required=$13,
         comments_remarks=$14, updated_at=NOW()
       WHERE id=$15 AND company_id=$16 RETURNING *`,
      [
        eval_date || null, JSON.stringify(kra_scores || []),
        self_total || null, manager_total || null, rating,
        strengths || null, areas_of_improvement || null,
        goals_next_period || null, increment_recommended || 0,
        status || 'draft',
        review_type || 'monthly', project_site || null,
        training_required || null, comments_remarks || null,
        req.params.id, req.user.company_id,
      ]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json({ data: rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch('/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    const tsField = {
      self_submitted:   'self_submitted_at',
      manager_reviewed: 'manager_reviewed_at',
      approved:         'approved_at',
      acknowledged:     'acknowledged_at',
    }[status];
    const sql = tsField
      ? `UPDATE hr_performance_evaluations SET status=$1, ${tsField}=NOW(), updated_at=NOW() WHERE id=$2 AND company_id=$3 RETURNING *`
      : `UPDATE hr_performance_evaluations SET status=$1, updated_at=NOW() WHERE id=$2 AND company_id=$3 RETURNING *`;
    const { rows } = await query(sql, [status, req.params.id, req.user.company_id]);
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json({ data: rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id', async (req, res) => {
  try {
    const { rows } = await query(
      `DELETE FROM hr_performance_evaluations WHERE id=$1 AND company_id=$2 AND status='draft' RETURNING id`,
      [req.params.id, req.user.company_id]
    );
    if (!rows.length) return res.status(400).json({ error: 'Only draft evaluations can be deleted' });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
