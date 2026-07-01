// src/routes/dpr.routes.js
const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { query } = require('../config/database');

// Public verification endpoint (no auth — QR scan)
router.get('/public/verify/:id', async (req, res) => {
  try {
    const result = await query(
      `SELECT d.*, p.name AS project_name, p.project_code, u.name AS submitted_by_name
       FROM daily_progress_reports d
       LEFT JOIN projects p ON d.project_id = p.id
       LEFT JOIN users u ON d.submitted_by = u.id
       WHERE d.id = $1`, [req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'DPR not found' });
    res.json({ data: result.rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.use(authenticate);

router.get('/', async (req, res) => {
  try {
    const { project_id, from_date, to_date } = req.query;
    let sql = `SELECT d.*, p.name AS project_name, u.name AS submitted_by_name
               FROM daily_progress_reports d
               JOIN projects p ON d.project_id = p.id
               LEFT JOIN users u ON d.submitted_by = u.id
               WHERE p.company_id = $1`;
    const params = [req.user.company_id];
    let i = 2;
    if (project_id) { sql += ` AND d.project_id = $${i++}`; params.push(project_id); }
    if (from_date)  { sql += ` AND d.report_date >= $${i++}`; params.push(from_date); }
    if (to_date)    { sql += ` AND d.report_date <= $${i++}`; params.push(to_date); }
    sql += ' ORDER BY d.report_date DESC';
    res.json({ data: (await query(sql, params)).rows });
  } catch (err) {
    console.error('dpr GET /:', err.message);
    res.status(500).json({ error: 'Failed to fetch DPRs' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const r = await query(
      `SELECT d.*, p.name AS project_name, u.name AS submitted_by_name
       FROM daily_progress_reports d
       JOIN projects p ON d.project_id = p.id
       LEFT JOIN users u ON d.submitted_by = u.id
       WHERE d.id = $1 AND p.company_id = $2`,
      [req.params.id, req.user.company_id]
    );
    if (!r.rows[0]) return res.status(404).json({ error: 'DPR not found' });
    res.json(r.rows[0]);
  } catch (err) {
    console.error('dpr GET /:id:', err.message);
    res.status(500).json({ error: 'Failed to fetch DPR' });
  }
});

router.post('/', async (req, res) => {
  try {
    // Support both frontend field names: activities/workers/materials AND work_done/material_consumed/equipment_status
    const {
      project_id, report_date, weather, issues_faced, next_day_plan,
      site_conditions, prepared_by, status,
      activities, workers, materials,                           // DPRCreate field names
      work_done, material_consumed, equipment_status,           // legacy field names
      issues, tomorrow_plan, site_photos,
    } = req.body;

    if (!project_id || !report_date) {
      return res.status(400).json({ error: 'project_id and report_date are required' });
    }

    const projCheck = await query(`SELECT 1 FROM projects WHERE id = $1 AND company_id = $2`, [project_id, req.user.company_id]);
    if (!projCheck.rows.length) return res.status(403).json({ error: 'Invalid project for this company' });

    const dprNum       = `DPR-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`;
    const workDone     = work_done     || activities || [];
    const matConsumed  = material_consumed || materials || [];
    const eqStatus     = equipment_status  || workers  || [];
    const issueText    = issues    || issues_faced   || '';
    const tomorrowText = tomorrow_plan || next_day_plan || '';

    const r = await query(
      `INSERT INTO daily_progress_reports
         (project_id, dpr_number, report_date, weather, work_done, material_consumed,
          equipment_status, issues, tomorrow_plan, site_photos, submitted_by, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING *`,
      [
        project_id, dprNum, report_date, weather,
        JSON.stringify(workDone), JSON.stringify(matConsumed), JSON.stringify(eqStatus),
        issueText, tomorrowText, site_photos || [], req.user.id, status || 'submitted',
      ]
    );
    res.status(201).json({ data: r.rows[0] });
  } catch (err) {
    console.error('dpr POST /:', err.message);
    res.status(500).json({ error: 'Failed to create DPR' });
  }
});

module.exports = router;
