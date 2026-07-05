// planning-p6.routes.js — P6-style planning extensions
// WBS, Dependencies, Resources, Baselines, EVM, Risk, MRP, CPM

const express = require('express');
const router  = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const { runCPM, offsetToDate }    = require('../services/cpm.service');
const { calcEVM, aggregateEVM }   = require('../services/evm.service');
const db = () => require('../config/database').pool;

router.use(authenticate);

const PLANNERS = ['super_admin','admin','project_manager','site_engineer','planning_engineer'];
const MANAGERS = ['super_admin','admin','project_manager','managing_director'];
const ADMINS   = ['super_admin','admin'];

const cid = (req) => req.user.company_id;

// ════════════════════════════════════════════════════════════════════
// PROJECT PHASES
// ════════════════════════════════════════════════════════════════════
router.get('/phases', async (req, res) => {
  try {
    const { project_id } = req.query;
    const params = []; let where = '';
    if (project_id) { params.push(project_id); where = 'WHERE pp.project_id = $1'; }
    const r = await db().query(`
      SELECT pp.*, p.name AS project_name,
        (SELECT COUNT(*) FROM project_activities a WHERE a.phase_id = pp.id) AS activity_count
      FROM project_phases pp
      JOIN projects p ON p.id = pp.project_id
      ${where}
      ORDER BY pp.sequence_no, pp.phase_code`, params);
    res.json({ data: r.rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/phases', authorize(...PLANNERS), async (req, res) => {
  try {
    const { project_id, phase_code, phase_name, description, planned_start, planned_end, sequence_no } = req.body;
    if (!project_id || !phase_code || !phase_name) return res.status(400).json({ error: 'project_id, phase_code, phase_name required' });
    const r = await db().query(`
      INSERT INTO project_phases (project_id,phase_code,phase_name,description,planned_start,planned_end,sequence_no)
      VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [project_id, phase_code, phase_name, description||null, planned_start||null, planned_end||null, sequence_no||1]);
    res.status(201).json({ data: r.rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/phases/:id', authorize(...PLANNERS), async (req, res) => {
  try {
    const { phase_name, description, planned_start, planned_end, actual_start, actual_end, sequence_no, status } = req.body;
    const r = await db().query(`
      UPDATE project_phases SET phase_name=$1,description=$2,planned_start=$3,planned_end=$4,
        actual_start=$5,actual_end=$6,sequence_no=$7,status=COALESCE($8,status)
      WHERE id=$9 RETURNING *`,
      [phase_name, description||null, planned_start||null, planned_end||null,
       actual_start||null, actual_end||null, sequence_no||1, status||null, req.params.id]);
    if (!r.rows.length) return res.status(404).json({ error: 'Phase not found' });
    res.json({ data: r.rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/phases/:id', authorize(...ADMINS), async (req, res) => {
  try {
    await db().query(`DELETE FROM project_phases WHERE id=$1`, [req.params.id]);
    res.json({ message: 'Deleted' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ════════════════════════════════════════════════════════════════════
// WBS — Work Breakdown Structure
// ════════════════════════════════════════════════════════════════════
router.get('/wbs', async (req, res) => {
  try {
    const { project_id } = req.query;
    if (!project_id) return res.status(400).json({ error: 'project_id required' });
    const r = await db().query(`
      WITH RECURSIVE wbs_tree AS (
        SELECT w.*, 0 AS depth
        FROM wbs_items w WHERE w.project_id=$1 AND w.parent_id IS NULL
        UNION ALL
        SELECT w.*, t.depth+1
        FROM wbs_items w JOIN wbs_tree t ON w.parent_id = t.id
      )
      SELECT wt.*,
        (SELECT COUNT(*) FROM project_activities a WHERE a.wbs_id = wt.id) AS activity_count,
        (SELECT COUNT(*) FROM wbs_items c WHERE c.parent_id = wt.id) AS child_count
      FROM wbs_tree wt ORDER BY wt.wbs_code`, [project_id]);
    res.json({ data: r.rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/wbs', authorize(...PLANNERS), async (req, res) => {
  try {
    const { project_id, parent_id, phase_id, wbs_code, wbs_name, description, sequence_no } = req.body;
    if (!project_id || !wbs_code || !wbs_name) return res.status(400).json({ error: 'project_id, wbs_code, wbs_name required' });
    // Calculate level
    let level = 1;
    if (parent_id) {
      const p = await db().query('SELECT level FROM wbs_items WHERE id=$1', [parent_id]);
      if (p.rows.length) level = p.rows[0].level + 1;
    }
    const r = await db().query(`
      INSERT INTO wbs_items (project_id,parent_id,phase_id,wbs_code,wbs_name,description,level,sequence_no)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [project_id, parent_id||null, phase_id||null, wbs_code, wbs_name, description||null, level, sequence_no||1]);
    res.status(201).json({ data: r.rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/wbs/:id', authorize(...PLANNERS), async (req, res) => {
  try {
    const { wbs_name, description, planned_start, planned_end, planned_cost, sequence_no } = req.body;
    const r = await db().query(`
      UPDATE wbs_items SET wbs_name=$1,description=$2,planned_start=$3,planned_end=$4,
        planned_cost=$5,sequence_no=$6,updated_at=NOW()
      WHERE id=$7 RETURNING *`,
      [wbs_name, description||null, planned_start||null, planned_end||null,
       planned_cost||0, sequence_no||1, req.params.id]);
    if (!r.rows.length) return res.status(404).json({ error: 'WBS item not found' });
    res.json({ data: r.rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/wbs/:id', authorize(...ADMINS), async (req, res) => {
  try {
    await db().query(`DELETE FROM wbs_items WHERE id=$1`, [req.params.id]);
    res.json({ message: 'Deleted' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ════════════════════════════════════════════════════════════════════
// ACTIVITY DEPENDENCIES
// ════════════════════════════════════════════════════════════════════
router.get('/dependencies', async (req, res) => {
  try {
    const { project_id, activity_id } = req.query;
    if (!project_id) return res.status(400).json({ error: 'project_id required' });
    let sql = `
      SELECT d.*,
        ap.activity_code AS pred_code, ap.activity_name AS pred_name,
        as2.activity_code AS succ_code, as2.activity_name AS succ_name
      FROM activity_dependencies d
      JOIN project_activities ap  ON ap.id = d.predecessor_id
      JOIN project_activities as2 ON as2.id = d.successor_id
      WHERE d.project_id=$1`;
    const params = [project_id];
    if (activity_id) { sql += ` AND (d.predecessor_id=$2 OR d.successor_id=$2)`; params.push(activity_id); }
    sql += ' ORDER BY ap.activity_code';
    res.json({ data: (await db().query(sql, params)).rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/dependencies', authorize(...PLANNERS), async (req, res) => {
  try {
    const { project_id, predecessor_id, successor_id, dependency_type, lag_days } = req.body;
    if (!project_id || !predecessor_id || !successor_id) return res.status(400).json({ error: 'project_id, predecessor_id, successor_id required' });
    if (predecessor_id === successor_id) return res.status(400).json({ error: 'Cannot link an activity to itself' });
    const r = await db().query(`
      INSERT INTO activity_dependencies (project_id, predecessor_id, successor_id, dependency_type, lag_days)
      VALUES ($1,$2,$3,$4,$5)
      ON CONFLICT (predecessor_id, successor_id) DO UPDATE SET
        dependency_type=EXCLUDED.dependency_type, lag_days=EXCLUDED.lag_days
      RETURNING *`, [project_id, predecessor_id, successor_id, dependency_type||'FS', lag_days||0]);
    res.status(201).json({ data: r.rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/dependencies/:id', authorize(...PLANNERS), async (req, res) => {
  try {
    await db().query(`DELETE FROM activity_dependencies WHERE id=$1`, [req.params.id]);
    res.json({ message: 'Deleted' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ════════════════════════════════════════════════════════════════════
// CPM CALCULATION
// ════════════════════════════════════════════════════════════════════
router.post('/cpm/calculate', authorize(...PLANNERS), async (req, res) => {
  try {
    const { project_id } = req.body;
    if (!project_id) return res.status(400).json({ error: 'project_id required' });

    const [acts, deps] = await Promise.all([
      db().query(`SELECT * FROM project_activities WHERE project_id=$1 AND status != 'cancelled'`, [project_id]),
      db().query(`SELECT * FROM activity_dependencies WHERE project_id=$1`, [project_id]),
    ]);

    if (!acts.rows.length) return res.json({ message: 'No activities', data: [] });

    // Find project start date
    const dates = acts.rows.map(a => a.baseline_start_date).filter(Boolean);
    const projectStart = dates.reduce((min, d) => d < min ? d : min, dates[0]);

    const cpmResult = runCPM(acts.rows, deps.rows, projectStart);

    // Update activities in DB with CPM results
    const updates = [];
    cpmResult.forEach((r, id) => {
      updates.push(
        db().query(`
          UPDATE project_activities SET
            early_start   = $1,
            early_finish  = $2,
            late_start    = $3,
            late_finish   = $4,
            total_float   = $5,
            free_float    = $6,
            is_critical_path = $7,
            slack_days    = $5,
            updated_at    = NOW()
          WHERE id=$8`,
          [
            offsetToDate(projectStart, r.es),
            offsetToDate(projectStart, r.ef),
            offsetToDate(projectStart, r.ls),
            offsetToDate(projectStart, r.lf),
            r.totalFloat, r.freeFloat, r.isCritical, id
          ])
      );
    });
    await Promise.all(updates);

    // Save CPM results summary
    const criticalIds = [...cpmResult.entries()]
      .filter(([, r]) => r.isCritical).map(([id]) => id);
    const projectDuration = Math.max(...[...cpmResult.values()].map(r => r.ef));

    await db().query(`
      INSERT INTO cpm_results (project_id, project_duration, critical_path_activities, data_date)
      VALUES ($1,$2,$3,CURRENT_DATE)
      ON CONFLICT DO NOTHING`,
      [project_id, projectDuration, criticalIds]);

    res.json({
      message: 'CPM calculated',
      data: {
        project_duration: projectDuration,
        critical_count: criticalIds.length,
        total_activities: acts.rows.length,
        critical_path: criticalIds,
      }
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ════════════════════════════════════════════════════════════════════
// RESOURCES
// ════════════════════════════════════════════════════════════════════
router.get('/resources', async (req, res) => {
  try {
    const { type } = req.query;
    let sql = `SELECT * FROM resources WHERE company_id=$1 AND is_active=true`;
    const params = [cid(req)];
    if (type) { sql += ` AND resource_type=$2`; params.push(type); }
    sql += ' ORDER BY resource_type, resource_name';
    res.json({ data: (await db().query(sql, params)).rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/resources', authorize(...ADMINS), async (req, res) => {
  try {
    const { resource_code, resource_name, resource_type, unit, unit_cost, max_units, calendar, description } = req.body;
    const r = await db().query(`
      INSERT INTO resources (company_id,resource_code,resource_name,resource_type,unit,unit_cost,max_units,calendar,description)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [cid(req), resource_code, resource_name, resource_type||'manpower',
       unit||'nos', unit_cost||0, max_units||null, calendar||'6day', description||null]);
    res.status(201).json({ data: r.rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/resources/:id', authorize(...ADMINS), async (req, res) => {
  try {
    const { resource_name, resource_type, unit, unit_cost, max_units, description, is_active } = req.body;
    const r = await db().query(`
      UPDATE resources SET resource_name=$1,resource_type=$2,unit=$3,unit_cost=$4,
        max_units=$5,description=$6,is_active=COALESCE($7,is_active)
      WHERE id=$8 AND company_id=$9 RETURNING *`,
      [resource_name, resource_type, unit, unit_cost||0, max_units||null, description||null, is_active, req.params.id, cid(req)]);
    if (!r.rows.length) return res.status(404).json({ error: 'Resource not found' });
    res.json({ data: r.rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ════════════════════════════════════════════════════════════════════
// ACTIVITY RESOURCES (allocation)
// ════════════════════════════════════════════════════════════════════
router.get('/activity-resources', async (req, res) => {
  try {
    const { project_id, activity_id } = req.query;
    let sql = `
      SELECT ar.*, r.resource_name, r.resource_type, r.unit, r.unit_cost,
             a.activity_code, a.activity_name
      FROM activity_resources ar
      JOIN resources r ON r.id = ar.resource_id
      JOIN project_activities a ON a.id = ar.activity_id
      WHERE ar.project_id=$1`;
    const params = [project_id]; let i = 2;
    if (activity_id) { sql += ` AND ar.activity_id=$${i++}`; params.push(activity_id); }
    sql += ' ORDER BY a.activity_code, r.resource_type';
    res.json({ data: (await db().query(sql, params)).rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/activity-resources', authorize(...PLANNERS), async (req, res) => {
  try {
    const { project_id, activity_id, resource_id, planned_qty, units_per_day, planned_cost, start_date, end_date, notes } = req.body;
    const r = await db().query(`
      INSERT INTO activity_resources (project_id,activity_id,resource_id,planned_qty,units_per_day,planned_cost,start_date,end_date,notes)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      ON CONFLICT (activity_id, resource_id) DO UPDATE SET
        planned_qty=$4, units_per_day=$5, planned_cost=$6, start_date=$7, end_date=$8, notes=$9, updated_at=NOW()
      RETURNING *`,
      [project_id, activity_id, resource_id, planned_qty||0, units_per_day||1, planned_cost||0, start_date||null, end_date||null, notes||null]);
    res.status(201).json({ data: r.rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.patch('/activity-resources/:id/actual', authorize(...PLANNERS), async (req, res) => {
  try {
    const { actual_qty, actual_cost } = req.body;
    const r = await db().query(`
      UPDATE activity_resources SET actual_qty=$1, actual_cost=$2, updated_at=NOW()
      WHERE id=$3 RETURNING *`, [actual_qty||0, actual_cost||0, req.params.id]);
    res.json({ data: r.rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Resource histogram — utilisation by week
router.get('/resource-histogram', async (req, res) => {
  try {
    const { project_id, resource_id } = req.query;
    if (!project_id) return res.status(400).json({ error: 'project_id required' });
    let sql = `
      SELECT r.resource_name, r.resource_type, r.unit, r.max_units,
             ar.start_date, ar.end_date, ar.units_per_day, ar.planned_qty,
             a.activity_code, a.activity_name, a.baseline_start_date, a.baseline_end_date
      FROM activity_resources ar
      JOIN resources r ON r.id = ar.resource_id
      JOIN project_activities a ON a.id = ar.activity_id
      WHERE ar.project_id=$1`;
    const params = [project_id];
    if (resource_id) { sql += ` AND ar.resource_id=$2`; params.push(resource_id); }
    const { rows } = await db().query(sql, params);
    res.json({ data: rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ════════════════════════════════════════════════════════════════════
// BASELINES
// ════════════════════════════════════════════════════════════════════
router.get('/baselines', async (req, res) => {
  try {
    const { project_id } = req.query;
    if (!project_id) return res.status(400).json({ error: 'project_id required' });
    const r = await db().query(`
      SELECT b.*, u.name AS created_by_name
      FROM planning_baselines b
      LEFT JOIN users u ON u.id = b.created_by
      WHERE b.project_id=$1 ORDER BY b.created_at DESC`, [project_id]);
    res.json({ data: r.rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/baselines', authorize(...MANAGERS), async (req, res) => {
  try {
    const { project_id, baseline_name, baseline_type, description } = req.body;
    if (!project_id || !baseline_name) return res.status(400).json({ error: 'project_id, baseline_name required' });

    // Snapshot current activities
    const acts = await db().query(`SELECT * FROM project_activities WHERE project_id=$1 AND status != 'cancelled'`, [project_id]);
    const totCost = acts.rows.reduce((s, a) => s + parseFloat(a.budget_at_completion||0), 0);
    const starts  = acts.rows.map(a => a.baseline_start_date).filter(Boolean);
    const ends    = acts.rows.map(a => a.baseline_end_date).filter(Boolean);
    const planStart  = starts.length ? starts.reduce((m, d) => d < m ? d : m, starts[0]) : null;
    const planFinish = ends.length   ? ends.reduce((m, d) => d > m ? d : m, ends[0])     : null;

    const bl = await db().query(`
      INSERT INTO planning_baselines (project_id,baseline_name,baseline_type,description,
        snapshot_date,total_activities,total_cost,planned_start,planned_finish,created_by)
      VALUES ($1,$2,$3,$4,CURRENT_DATE,$5,$6,$7,$8,$9) RETURNING *`,
      [project_id, baseline_name, baseline_type||'original', description||null,
       acts.rows.length, totCost, planStart||null, planFinish||null, req.user.id]);

    // Insert snapshot rows
    if (acts.rows.length) {
      const values = acts.rows.map(a =>
        `('${bl.rows[0].id}','${a.id}','${a.activity_code}','${(a.activity_name||'').replace(/'/g,"''")}',
          ${a.baseline_start_date ? `'${a.baseline_start_date}'` : 'NULL'},
          ${a.baseline_end_date   ? `'${a.baseline_end_date}'`   : 'NULL'},
          ${a.baseline_duration||0}, ${a.progress_pct||0},
          ${a.planned_value||0}, ${a.budget_at_completion||0},
          ${a.is_critical_path||false}, ${a.total_float||0})`
      ).join(',');
      await db().query(`
        INSERT INTO baseline_activities
          (baseline_id,activity_id,activity_code,activity_name,planned_start,planned_finish,
           duration,progress_pct,planned_value,budget_at_completion,is_critical_path,total_float)
        VALUES ${values}`);
    }

    res.status(201).json({ data: bl.rows[0], activities_snapped: acts.rows.length });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Compare baseline vs current
router.get('/baselines/:id/compare', async (req, res) => {
  try {
    const r = await db().query(`
      SELECT ba.*,
        a.baseline_start_date AS current_start, a.baseline_end_date AS current_end,
        a.progress_pct AS current_progress, a.status AS current_status,
        a.actual_start_date, a.actual_end_date, a.is_critical_path,
        -- Variance
        CASE WHEN ba.planned_start IS NOT NULL AND a.baseline_start_date IS NOT NULL
          THEN a.baseline_start_date - ba.planned_start END AS start_variance_days,
        CASE WHEN ba.planned_finish IS NOT NULL AND a.baseline_end_date IS NOT NULL
          THEN a.baseline_end_date - ba.planned_finish END AS finish_variance_days
      FROM baseline_activities ba
      JOIN project_activities a ON a.id = ba.activity_id
      WHERE ba.baseline_id=$1
      ORDER BY ba.activity_code`, [req.params.id]);
    res.json({ data: r.rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ════════════════════════════════════════════════════════════════════
// EVM
// ════════════════════════════════════════════════════════════════════
router.get('/evm', async (req, res) => {
  try {
    const { project_id } = req.query;
    if (!project_id) return res.status(400).json({ error: 'project_id required' });
    const acts = await db().query(`SELECT * FROM project_activities WHERE project_id=$1 AND status != 'cancelled'`, [project_id]);
    const evm = aggregateEVM(acts.rows);
    // History
    const history = await db().query(`
      SELECT * FROM evm_snapshots WHERE project_id=$1 ORDER BY snapshot_date ASC LIMIT 20`, [project_id]);
    res.json({ data: { ...evm, history: history.rows } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/evm/snapshot', authorize(...PLANNERS), async (req, res) => {
  try {
    const { project_id, snapshot_date } = req.body;
    if (!project_id) return res.status(400).json({ error: 'project_id required' });
    const acts = await db().query(`SELECT * FROM project_activities WHERE project_id=$1 AND status != 'cancelled'`, [project_id]);
    const evm = aggregateEVM(acts.rows);
    const date = snapshot_date || new Date().toISOString().slice(0, 10);
    const r = await db().query(`
      INSERT INTO evm_snapshots (project_id,snapshot_date,planned_value,earned_value,actual_cost,
        budget_at_completion,spi,cpi,sv,cv,eac,etc,vac,percent_complete,created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
      ON CONFLICT (project_id,snapshot_date) DO UPDATE SET
        planned_value=$3,earned_value=$4,actual_cost=$5,budget_at_completion=$6,
        spi=$7,cpi=$8,sv=$9,cv=$10,eac=$11,etc=$12,vac=$13,percent_complete=$14
      RETURNING *`,
      [project_id, date, evm.pv, evm.ev, evm.ac, evm.bac,
       evm.spi, evm.cpi, evm.sv, evm.cv, evm.eac, evm.etc, evm.vac,
       evm.percent_complete, req.user.id]);
    res.status(201).json({ data: r.rows[0], evm });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Update activity EVM values
router.patch('/activities/:id/evm', authorize(...PLANNERS), async (req, res) => {
  try {
    const { planned_value, earned_value, actual_cost, budget_at_completion } = req.body;
    const r = await db().query(`
      UPDATE project_activities SET
        planned_value=$1, earned_value=$2, actual_cost=$3,
        budget_at_completion=COALESCE($4,budget_at_completion), updated_at=NOW()
      WHERE id=$5 RETURNING id,activity_code,planned_value,earned_value,actual_cost,budget_at_completion`,
      [planned_value||0, earned_value||0, actual_cost||0, budget_at_completion||null, req.params.id]);
    res.json({ data: r.rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ════════════════════════════════════════════════════════════════════
// RISK REGISTER
// ════════════════════════════════════════════════════════════════════
router.get('/risks', async (req, res) => {
  try {
    const { project_id, status, risk_level } = req.query;
    if (!project_id) return res.status(400).json({ error: 'project_id required' });
    let sql = `
      SELECT r.*, u.name AS created_by_name,
        a.activity_code AS linked_activity_code, a.activity_name AS linked_activity_name
      FROM risk_register r
      LEFT JOIN users u ON u.id = r.created_by
      LEFT JOIN project_activities a ON a.id = r.linked_activity_id
      WHERE r.project_id=$1`;
    const params = [project_id]; let i = 2;
    if (status)     { sql += ` AND r.status=$${i++}`; params.push(status); }
    if (risk_level) { sql += ` AND r.risk_level=$${i++}`; params.push(risk_level); }
    sql += ' ORDER BY r.risk_score DESC, r.created_at DESC';
    res.json({ data: (await db().query(sql, params)).rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/risks', authorize(...PLANNERS), async (req, res) => {
  try {
    const { project_id, risk_title, description, category, probability, impact,
            response_strategy, mitigation_plan, contingency_plan,
            owner, due_date, linked_activity_id, cost_impact, schedule_impact_days } = req.body;
    if (!project_id || !risk_title) return res.status(400).json({ error: 'project_id, risk_title required' });
    const p = parseInt(probability||3), imp = parseInt(impact||3);
    const score = p * imp;
    const risk_level = score >= 20 ? 'critical' : score >= 12 ? 'high' : score >= 6 ? 'medium' : 'low';
    // Auto-generate risk code
    const cnt = (await db().query(`SELECT COALESCE(MAX(CAST(REGEXP_REPLACE(risk_code, '^.*-', '') AS INTEGER)), 0) AS last_seq
                                   FROM risk_register WHERE project_id=$1 AND risk_code ~ '[0-9]+$'`, [project_id])).rows[0].last_seq;
    const risk_code = `RISK-${String(parseInt(cnt)+1).padStart(3,'0')}`;
    const r = await db().query(`
      INSERT INTO risk_register (project_id,risk_code,risk_title,description,category,probability,impact,
        risk_level,response_strategy,mitigation_plan,contingency_plan,owner,due_date,
        linked_activity_id,cost_impact,schedule_impact_days,created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING *`,
      [project_id, risk_code, risk_title, description||null, category||'other',
       p, imp, risk_level, response_strategy||'mitigate',
       mitigation_plan||null, contingency_plan||null, owner||null, due_date||null,
       linked_activity_id||null, cost_impact||0, schedule_impact_days||0, req.user.id]);
    res.status(201).json({ data: r.rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/risks/:id', authorize(...PLANNERS), async (req, res) => {
  try {
    const { risk_title, description, category, probability, impact,
            response_strategy, mitigation_plan, contingency_plan,
            owner, due_date, status, cost_impact, schedule_impact_days } = req.body;
    const p = parseInt(probability||3), imp = parseInt(impact||3);
    const score = p * imp;
    const risk_level = score >= 20 ? 'critical' : score >= 12 ? 'high' : score >= 6 ? 'medium' : 'low';
    const r = await db().query(`
      UPDATE risk_register SET risk_title=$1,description=$2,category=$3,probability=$4,impact=$5,
        risk_level=$6,response_strategy=$7,mitigation_plan=$8,contingency_plan=$9,
        owner=$10,due_date=$11,status=COALESCE($12,status),cost_impact=$13,
        schedule_impact_days=$14,updated_at=NOW()
      WHERE id=$15 RETURNING *`,
      [risk_title, description||null, category||'other', p, imp, risk_level,
       response_strategy||'mitigate', mitigation_plan||null, contingency_plan||null,
       owner||null, due_date||null, status||null, cost_impact||0, schedule_impact_days||0, req.params.id]);
    if (!r.rows.length) return res.status(404).json({ error: 'Risk not found' });
    res.json({ data: r.rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/risks/:id', authorize(...MANAGERS), async (req, res) => {
  try {
    await db().query(`DELETE FROM risk_register WHERE id=$1`, [req.params.id]);
    res.json({ message: 'Deleted' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ════════════════════════════════════════════════════════════════════
// MATERIAL REQUIREMENTS PLAN (MRP)
// ════════════════════════════════════════════════════════════════════
router.get('/mrp', async (req, res) => {
  try {
    const { project_id, status } = req.query;
    if (!project_id) return res.status(400).json({ error: 'project_id required' });
    let sql = `
      SELECT m.*, a.activity_code, a.activity_name, a.baseline_start_date
      FROM material_requirements m
      LEFT JOIN project_activities a ON a.id = m.activity_id
      WHERE m.project_id=$1`;
    const params = [project_id];
    if (status) { sql += ` AND m.status=$2`; params.push(status); }
    sql += ' ORDER BY m.required_date ASC NULLS LAST, m.material_name';
    const { rows } = await db().query(sql, params);

    // Compute shortage
    const data = rows.map(r => ({
      ...r,
      shortage_qty: Math.max(0, parseFloat(r.planned_qty||0) - parseFloat(r.ordered_qty||0)),
      pending_receipt: Math.max(0, parseFloat(r.ordered_qty||0) - parseFloat(r.received_qty||0)),
    }));
    res.json({ data });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/mrp', authorize(...PLANNERS), async (req, res) => {
  try {
    const { project_id, activity_id, material_name, material_code, specification,
            unit, boq_qty, planned_qty, unit_rate, required_date, vendor_name, notes } = req.body;
    if (!project_id || !material_name) return res.status(400).json({ error: 'project_id, material_name required' });
    const r = await db().query(`
      INSERT INTO material_requirements (project_id,activity_id,material_name,material_code,
        specification,unit,boq_qty,planned_qty,unit_rate,required_date,vendor_name,notes)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [project_id, activity_id||null, material_name, material_code||null,
       specification||null, unit||'nos', boq_qty||0, planned_qty||0,
       unit_rate||0, required_date||null, vendor_name||null, notes||null]);
    res.status(201).json({ data: r.rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.patch('/mrp/:id', authorize(...PLANNERS), async (req, res) => {
  try {
    const { ordered_qty, received_qty, consumed_qty, status, vendor_name, unit_rate } = req.body;
    const r = await db().query(`
      UPDATE material_requirements SET
        ordered_qty=COALESCE($1,ordered_qty), received_qty=COALESCE($2,received_qty),
        consumed_qty=COALESCE($3,consumed_qty), status=COALESCE($4,status),
        vendor_name=COALESCE($5,vendor_name), unit_rate=COALESCE($6,unit_rate),
        updated_at=NOW()
      WHERE id=$7 RETURNING *`,
      [ordered_qty, received_qty, consumed_qty, status, vendor_name, unit_rate, req.params.id]);
    if (!r.rows.length) return res.status(404).json({ error: 'MRP item not found' });
    res.json({ data: r.rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/mrp/:id', authorize(...ADMINS), async (req, res) => {
  try {
    await db().query(`DELETE FROM material_requirements WHERE id=$1`, [req.params.id]);
    res.json({ message: 'Deleted' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ════════════════════════════════════════════════════════════════════
// BOQ CHAPTER LINK — tag activities to a BOQ chapter, then pull budgets
// from the BOQ Budget Breakdown chapter totals instead of re-entering them
// ════════════════════════════════════════════════════════════════════

// GET /planning-p6/boq-chapters?project_id= — chapters available to tag activities with
// NOTE: chapter_no is NOT unique on its own in this data (many BOQs re-use "01" etc.
// for every chapter), so chapters are identified by the (chapter_no, chapter_name)
// pair. `key` is the composite identifier stored in project_activities.boq_chapter_no.
router.get('/boq-chapters', async (req, res) => {
  try {
    const { project_id } = req.query;
    if (!project_id) return res.status(400).json({ error: 'project_id required' });
    const r = await db().query(`
      SELECT chapter_no, chapter_name, COUNT(*) AS item_count
      FROM boq_items
      WHERE project_id = $1 AND is_active = true AND chapter_no IS NOT NULL
      GROUP BY chapter_no, chapter_name
      ORDER BY chapter_no, chapter_name
    `, [project_id]);
    const data = r.rows.map(row => ({
      ...row,
      key: `${row.chapter_no}::${row.chapter_name || ''}`,
    }));
    res.json({ data });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PATCH /planning-p6/activities/:id/boq-chapter — tag one activity to a BOQ chapter
router.patch('/activities/:id/boq-chapter', authorize(...PLANNERS), async (req, res) => {
  try {
    const { boq_chapter_no } = req.body;
    const r = await db().query(
      `UPDATE project_activities SET boq_chapter_no = $1, updated_at = NOW() WHERE id = $2
       RETURNING id, activity_code, boq_chapter_no`,
      [boq_chapter_no || null, req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Activity not found' });
    res.json({ data: r.rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /planning-p6/sync-budget-from-boq — one-time pull: for every activity
// tagged with a BOQ chapter, set budget_at_completion to that chapter's total
// budget (SUM of boq_item_budget_breakdown across all items in the chapter),
// split proportionally by each activity's planned_quantity share within the
// chapter. Only touches budget_at_completion — leaves planned_value/
// earned_value/actual_cost untouched (those are separate EVM inputs).
router.post('/sync-budget-from-boq', authorize(...PLANNERS), async (req, res) => {
  try {
    const { project_id } = req.body;
    if (!project_id) return res.status(400).json({ error: 'project_id required' });

    const chapterBudgets = await db().query(`
      SELECT bi.chapter_no, bi.chapter_name, COALESCE(SUM(bib.budgeted_amount), 0) AS chapter_budget
      FROM boq_items bi
      LEFT JOIN boq_item_budget_breakdown bib ON bib.boq_item_id = bi.id AND bib.project_id = bi.project_id
      WHERE bi.project_id = $1 AND bi.is_active = true AND bi.chapter_no IS NOT NULL
      GROUP BY bi.chapter_no, bi.chapter_name
    `, [project_id]);
    const budgetByChapter = {};
    chapterBudgets.rows.forEach(r => {
      const key = `${r.chapter_no}::${r.chapter_name || ''}`;
      budgetByChapter[key] = parseFloat(r.chapter_budget) || 0;
    });

    const acts = await db().query(`
      SELECT id, boq_chapter_no, COALESCE(planned_quantity, 0) AS planned_quantity
      FROM project_activities
      WHERE project_id = $1 AND boq_chapter_no IS NOT NULL
    `, [project_id]);

    const byChapter = {};
    acts.rows.forEach(a => {
      (byChapter[a.boq_chapter_no] ||= []).push(a);
    });

    let updated = 0;
    let skippedNoQty = 0;
    let equalSplitCount = 0;
    const untaggedChapters = [];

    for (const [chapterNo, chapterActs] of Object.entries(byChapter)) {
      const chapterBudget = budgetByChapter[chapterNo];
      if (chapterBudget === undefined) { untaggedChapters.push(chapterNo); continue; }

      const totalQty = chapterActs.reduce((s, a) => s + parseFloat(a.planned_quantity || 0), 0);
      // No activity in this chapter has a planned quantity to split by —
      // fall back to an equal share per activity rather than skipping them.
      if (totalQty <= 0) {
        const share = chapterBudget / chapterActs.length;
        for (const a of chapterActs) {
          await db().query(
            `UPDATE project_activities SET budget_at_completion = $1, updated_at = NOW() WHERE id = $2`,
            [share, a.id]
          );
          updated++; equalSplitCount++;
        }
        continue;
      }

      for (const a of chapterActs) {
        const qty = parseFloat(a.planned_quantity || 0);
        if (qty <= 0) { skippedNoQty++; continue; }
        const share = chapterBudget * (qty / totalQty);
        await db().query(
          `UPDATE project_activities SET budget_at_completion = $1, updated_at = NOW() WHERE id = $2`,
          [share, a.id]
        );
        updated++;
      }
    }

    res.json({
      data: {
        updated,
        skipped_no_quantity: skippedNoQty,
        equal_split_count: equalSplitCount,
        chapters_not_found_in_boq: untaggedChapters,
      },
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ════════════════════════════════════════════════════════════════════
// AUTO-MATCH BOQ CHAPTERS — text-similarity suggestions between activity
// names/codes and BOQ chapter vocabulary, for manual review before applying.
// ════════════════════════════════════════════════════════════════════

const STOPWORDS = new Set([
  'and','the','for','of','at','in','on','to','with','all','a','an','as','per','etc',
  'works','work','floor','level','st','nd','rd','th','no','ii','iii','including',
]);

// Bridges vocabulary gaps between terse activity names and broad BOQ chapter
// names (e.g. an activity called "Debris Removal" should match a chapter
// named "Demolition Works").
const SYNONYM_GROUPS = [
  ['demolition','demolish','debris','dismantle','dismantling','dismantled','removal','breaking','break'],
  ['blockwork','block','masonry','brickwork','brick','blocks'],
  ['plastering','plaster','rendering','render'],
  ['waterproofing','waterproof','wp','membrane'],
  ['screed','topping','flooring'],
  ['scaffolding','scaffold','staging','safety','net'],
  ['concrete','rcc','pcc','concreting','cc'],
  ['excavation','excavate','earthwork','digging'],
  ['electrical','wiring','conduit'],
  ['plumbing','sanitary','drainage','pipe','piping'],
  ['painting','paint','putty'],
  ['tiling','tile','tiles'],
  ['miscellaneous','other','sundry','general'],
];
const synonymOf = new Map();
SYNONYM_GROUPS.forEach(group => group.forEach(w => synonymOf.set(w, group[0])));

function tokenize(text) {
  if (!text) return [];
  return String(text)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !STOPWORDS.has(w) && isNaN(Number(w)))
    .map(w => synonymOf.get(w) || w);
}

// GET /planning-p6/auto-match-boq-chapters?project_id= — propose BOQ chapter
// matches for activities that don't have one yet. Preview only; nothing is
// written. Client reviews and calls apply-boq-chapter-matches to commit.
router.get('/auto-match-boq-chapters', async (req, res) => {
  try {
    const { project_id } = req.query;
    if (!project_id) return res.status(400).json({ error: 'project_id required' });

    const chapterRows = await db().query(`
      SELECT chapter_no, chapter_name, STRING_AGG(DISTINCT description, ' ') AS item_text
      FROM boq_items
      WHERE project_id = $1 AND is_active = true AND chapter_no IS NOT NULL
      GROUP BY chapter_no, chapter_name
    `, [project_id]);

    if (chapterRows.rows.length === 0) {
      return res.json({ data: { matches: [], chapters_considered: 0 } });
    }

    const chapters = chapterRows.rows.map(row => {
      const key = `${row.chapter_no}::${row.chapter_name || ''}`;
      const nameTokens = new Set(tokenize(row.chapter_name));
      // Only take the first ~40 words of item text per chapter — enough
      // vocabulary signal without either the description dominating
      // scoring or the query becoming expensive on very long BOQ text.
      const itemTokens = new Set(tokenize(String(row.item_text || '').split(/\s+/).slice(0, 400).join(' ')));
      return { key, chapter_no: row.chapter_no, chapter_name: row.chapter_name, nameTokens, itemTokens };
    });

    const acts = await db().query(`
      SELECT id, activity_code, activity_name
      FROM project_activities
      WHERE project_id = $1 AND boq_chapter_no IS NULL
      ORDER BY activity_code
    `, [project_id]);

    const matches = [];
    for (const a of acts.rows) {
      const actTokens = new Set([...tokenize(a.activity_name), ...tokenize(a.activity_code)]);
      if (actTokens.size === 0) continue;

      const scored = chapters.map(ch => {
        let score = 0;
        for (const t of actTokens) {
          if (ch.nameTokens.has(t)) score += 3;      // chapter-name hit: strong signal
          else if (ch.itemTokens.has(t)) score += 1;  // BOQ item vocabulary hit: weak signal
        }
        return { chapter: ch, score };
      }).sort((x, y) => y.score - x.score);

      const best = scored[0];
      if (!best || best.score === 0) continue;
      const runnerUp = scored[1];
      const confidence = runnerUp && runnerUp.score > 0 && runnerUp.score === best.score ? 'low' : best.score >= 5 ? 'high' : best.score >= 3 ? 'medium' : 'low';

      matches.push({
        activity_id: a.id,
        activity_code: a.activity_code,
        activity_name: a.activity_name,
        boq_chapter_key: best.chapter.key,
        chapter_no: best.chapter.chapter_no,
        chapter_name: best.chapter.chapter_name,
        confidence,
        score: best.score,
        alternatives: scored.slice(1, 3).filter(s => s.score > 0).map(s => ({
          boq_chapter_key: s.chapter.key, chapter_name: s.chapter.chapter_name, score: s.score,
        })),
      });
    }

    res.json({
      data: {
        matches,
        chapters_considered: chapters.length,
        unmatched_activity_count: acts.rows.length - matches.length,
      },
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /planning-p6/apply-boq-chapter-matches — bulk-commit a reviewed set
// of { activity_id, boq_chapter_key } pairs (as returned by auto-match above,
// possibly edited/filtered by the user first).
router.post('/apply-boq-chapter-matches', authorize(...PLANNERS), async (req, res) => {
  try {
    const { matches } = req.body;
    if (!Array.isArray(matches) || matches.length === 0) {
      return res.status(400).json({ error: 'matches array required' });
    }
    let applied = 0;
    for (const m of matches) {
      if (!m.activity_id || !m.boq_chapter_key) continue;
      await db().query(
        `UPDATE project_activities SET boq_chapter_no = $1, updated_at = NOW() WHERE id = $2`,
        [m.boq_chapter_key, m.activity_id]
      );
      applied++;
    }
    res.json({ data: { applied } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ════════════════════════════════════════════════════════════════════
// P6 DASHBOARD — SPI, CPI, critical path, milestones, risks
// ════════════════════════════════════════════════════════════════════
router.get('/p6-dashboard', async (req, res) => {
  try {
    const { project_id } = req.query;
    if (!project_id) return res.status(400).json({ error: 'project_id required' });

    const [acts, deps, risks, mrp, milestones, baselineList, evmHist] = await Promise.all([
      db().query(`SELECT * FROM project_activities WHERE project_id=$1 AND status != 'cancelled'`, [project_id]),
      db().query(`SELECT * FROM activity_dependencies WHERE project_id=$1`, [project_id]),
      db().query(`SELECT status, risk_level, COUNT(*) AS c FROM risk_register WHERE project_id=$1 GROUP BY status, risk_level`, [project_id]),
      db().query(`SELECT status, COUNT(*) AS c, SUM(planned_qty*unit_rate) AS value FROM material_requirements WHERE project_id=$1 GROUP BY status`, [project_id]),
      db().query(`SELECT * FROM project_milestones WHERE project_id=$1 ORDER BY target_date ASC`, [project_id]),
      db().query(`SELECT id, baseline_name, snapshot_date FROM planning_baselines WHERE project_id=$1 ORDER BY created_at DESC LIMIT 1`, [project_id]),
      db().query(`SELECT * FROM evm_snapshots WHERE project_id=$1 ORDER BY snapshot_date DESC LIMIT 12`, [project_id]),
    ]);

    const evm = aggregateEVM(acts.rows);
    const criticalCount = acts.rows.filter(a => a.is_critical_path).length;
    const delayedCount  = acts.rows.filter(a => a.status === 'delayed').length;
    const statusBreak   = {};
    acts.rows.forEach(a => { statusBreak[a.status] = (statusBreak[a.status]||0) + 1; });

    const upcomingMilestones = milestones.rows.filter(m => !m.is_achieved).slice(0, 5);
    const overdueMilestones  = milestones.rows.filter(m => !m.is_achieved && new Date(m.target_date) < new Date());

    const riskMatrix = {};
    risks.rows.forEach(r => { riskMatrix[r.risk_level] = (riskMatrix[r.risk_level]||0) + parseInt(r.c); });

    const mrpShortage = mrp.rows.filter(r => r.status === 'pending').length;

    res.json({
      data: {
        evm,
        activities: {
          total: acts.rows.length,
          critical: criticalCount,
          delayed: delayedCount,
          breakdown: statusBreak,
        },
        milestones: {
          total: milestones.rows.length,
          achieved: milestones.rows.filter(m => m.is_achieved).length,
          overdue: overdueMilestones.length,
          upcoming: upcomingMilestones,
        },
        risks: { ...riskMatrix, total: risks.rows.reduce((s,r)=>s+parseInt(r.c),0) },
        mrp: { shortage_items: mrpShortage },
        baseline: baselineList.rows[0] || null,
        evm_history: evmHist.rows.reverse(),
      }
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
