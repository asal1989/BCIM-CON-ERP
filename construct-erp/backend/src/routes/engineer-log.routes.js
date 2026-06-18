// src/routes/engineer-log.routes.js — Engineer Daily Activity Log
const express = require('express');
const { authenticate } = require('../middleware/auth');
const { query, withTransaction } = require('../config/database');
const router = express.Router();
router.use(authenticate);

const MANAGER_ROLES = new Set([
  'super_admin',
  'superadmin',
  'admin',
  'manager',
  'director',
  'pm',
  'project_manager',
  'planning_manager',
  'planning_head',
  'site_manager',
]);

const canManageLogs = (req) => MANAGER_ROLES.has(String(req.user?.role || '').toLowerCase());

/* ── Auto-migrate ──────────────────────────────────────────────────────── */
(async () => {
  const safe = async (sql) => { try { await query(sql); } catch {} };
  await safe(`
    CREATE TABLE IF NOT EXISTS engineer_daily_logs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id UUID NOT NULL REFERENCES companies(id),
      project_id UUID NOT NULL REFERENCES projects(id),
      log_date DATE NOT NULL DEFAULT CURRENT_DATE,
      engineer_id UUID NOT NULL REFERENCES users(id),
      log_number VARCHAR(30),
      weather VARCHAR(20) DEFAULT 'sunny',
      site_conditions VARCHAR(200),
      manpower_count INTEGER DEFAULT 0,
      manpower_breakdown JSONB,
      general_remarks TEXT,
      issues TEXT,
      next_day_plan TEXT,
      status VARCHAR(20) DEFAULT 'submitted',
      reviewed_by UUID REFERENCES users(id),
      reviewed_at TIMESTAMPTZ,
      review_remarks TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )`);
  // Add manpower_breakdown column to existing tables
  await safe(`ALTER TABLE engineer_daily_logs ADD COLUMN IF NOT EXISTS manpower_breakdown JSONB`);
  await safe(`
    CREATE TABLE IF NOT EXISTS engineer_log_activities (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      log_id UUID NOT NULL REFERENCES engineer_daily_logs(id) ON DELETE CASCADE,
      activity_name VARCHAR(300) NOT NULL,
      location VARCHAR(200),
      unit VARCHAR(30) DEFAULT 'Nos',
      planned_qty NUMERIC(14,3) DEFAULT 0,
      achieved_qty NUMERIC(14,3) DEFAULT 0,
      status VARCHAR(30) DEFAULT 'in_progress',
      remarks TEXT,
      sort_order INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`);
  await safe(`ALTER TABLE engineer_log_activities ADD COLUMN IF NOT EXISTS activity_id UUID REFERENCES project_activities(id)`);
  await safe(`CREATE INDEX IF NOT EXISTS idx_edl_company  ON engineer_daily_logs(company_id)`);
  await safe(`CREATE INDEX IF NOT EXISTS idx_edl_engineer ON engineer_daily_logs(engineer_id)`);
  await safe(`CREATE INDEX IF NOT EXISTS idx_edl_date     ON engineer_daily_logs(log_date)`);
  await safe(`CREATE INDEX IF NOT EXISTS idx_ela_log      ON engineer_log_activities(log_id)`);
  await safe(`CREATE INDEX IF NOT EXISTS idx_ela_activity ON engineer_log_activities(activity_id)`);
  await safe(`CREATE UNIQUE INDEX IF NOT EXISTS uq_engineer_daily_logs_number ON engineer_daily_logs(company_id, log_number)`);
  console.log('[EngineerLog] schema OK');
})();

/* ── Number generator ───────────────────────────────────────────────────── */
async function nextLogNumber(client, companyId) {
  const { rows } = await client.query(
    `SELECT COALESCE(MAX(CAST(REGEXP_REPLACE(log_number, '^EL-', '') AS INTEGER)), 0) AS last_seq
     FROM engineer_daily_logs WHERE company_id=$1 AND log_number LIKE 'EL-%'`,
    [companyId]
  );
  return `EL-${String(parseInt(rows[0].last_seq) + 1).padStart(4, '0')}`;
}

/* ── Progress sync ──────────────────────────────────────────────────────── */
async function syncActivityProgress(client, activityIds) {
  const ids = [...new Set(activityIds.filter(Boolean))];
  if (!ids.length) return;
  for (const aid of ids) {
    // Sum achieved qty across all submitted/reviewed logs for this planning activity
    const r = await client.query(`
      SELECT
        COALESCE(SUM(ela.achieved_qty), 0) AS total_achieved,
        COALESCE(MAX(ela.planned_qty),  0) AS log_planned
      FROM engineer_log_activities ela
      JOIN engineer_daily_logs edl ON edl.id = ela.log_id
      WHERE ela.activity_id = $1
        AND edl.status IN ('submitted', 'reviewed')
    `, [aid]);

    const pa = await client.query(
      `SELECT planned_quantity FROM project_activities WHERE id = $1`, [aid]
    );
    if (!pa.rows.length) continue;

    const totalAchieved = parseFloat(r.rows[0].total_achieved) || 0;
    // Prefer the activity's own planned_quantity; fall back to the log entry's planned_qty
    const planned = parseFloat(pa.rows[0].planned_quantity) || parseFloat(r.rows[0].log_planned) || 0;
    if (!planned) continue;

    const pct = Math.min(100, Math.round((totalAchieved / planned) * 100));

    await client.query(`
      UPDATE project_activities SET
        progress_pct    = $1,
        actual_quantity = $2,
        actual_start_date = COALESCE(actual_start_date, (
          SELECT MIN(edl.log_date)
          FROM engineer_log_activities ela2
          JOIN engineer_daily_logs edl ON edl.id = ela2.log_id
          WHERE ela2.activity_id = $3 AND edl.status IN ('submitted','reviewed')
        )),
        status = CASE
          WHEN status = 'cancelled' THEN status
          WHEN $1 >= 100 THEN 'completed'
          WHEN $1 > 0    THEN 'in_progress'
          ELSE status
        END,
        updated_at = NOW()
      WHERE id = $3
    `, [pct, totalAchieved, aid]);
  }
}

/* ── GET /  — list logs (own or all for manager) ──────────────────────── */
router.get('/', async (req, res) => {
  try {
    const cid = req.user.company_id;
    const uid = req.user.id;
    const { project_id, engineer_id, date_from, date_to, status, search, limit = 100, offset = 0 } = req.query;

    let where = ['l.company_id = $1'];
    const params = [cid];
    let p = 2;

    // Non-admin engineers only see their own logs
    const isManager = canManageLogs(req);
    if (!isManager && !engineer_id) {
      where.push(`l.engineer_id = $${p++}`); params.push(uid);
    }
    if (engineer_id) { where.push(`l.engineer_id = $${p++}`); params.push(engineer_id); }
    if (project_id)  { where.push(`l.project_id = $${p++}`);  params.push(project_id); }
    if (status)      { where.push(`l.status = $${p++}`);       params.push(status); }
    if (date_from)   { where.push(`l.log_date >= $${p++}`);    params.push(date_from); }
    if (date_to)     { where.push(`l.log_date <= $${p++}`);    params.push(date_to); }
    if (search) {
      where.push(`(
        l.log_number ILIKE $${p}
        OR p.name ILIKE $${p}
        OR u.name ILIKE $${p}
        OR COALESCE(l.general_remarks, '') ILIKE $${p}
        OR EXISTS (
          SELECT 1 FROM engineer_log_activities a
          WHERE a.log_id = l.id AND a.activity_name ILIKE $${p}
        )
      )`);
      params.push(`%${search}%`);
      p++;
    }

    const rows = await query(`
      SELECT l.*,
        p.name  AS project_name, p.project_code,
        u.name  AS engineer_name, u.email AS engineer_email,
        rv.name AS reviewed_by_name,
        (SELECT COUNT(*) FROM engineer_log_activities WHERE log_id = l.id) AS activity_count,
        (SELECT COUNT(*) FROM engineer_log_activities WHERE log_id = l.id AND status = 'completed') AS completed_count
      FROM engineer_daily_logs l
      JOIN projects p ON p.id = l.project_id
      JOIN users u    ON u.id = l.engineer_id
      LEFT JOIN users rv ON rv.id = l.reviewed_by
      WHERE ${where.join(' AND ')}
      ORDER BY l.log_date DESC, l.created_at DESC
      LIMIT $${p++} OFFSET $${p++}
    `, [...params, parseInt(limit), parseInt(offset)]);

    res.json({ data: rows.rows });
  } catch (e) {
    console.error('[EngineerLog list]', e);
    res.status(500).json({ error: e.message });
  }
});

/* ── GET /stats ──────────────────────────────────────────────────────────── */
router.get('/stats', async (req, res) => {
  try {
    const cid = req.user.company_id;
    const uid = req.user.id;
    const { project_id } = req.query;
    const isManager = canManageLogs(req);
    const params = [cid];
    const where = ['l.company_id = $1'];
    const activityWhere = ['ll.company_id = $1'];

    if (!isManager) {
      params.push(uid);
      where.push(`l.engineer_id = $${params.length}`);
      activityWhere.push(`ll.engineer_id = $${params.length}`);
    }

    if (project_id) {
      params.push(project_id);
      where.push(`l.project_id = $${params.length}`);
      activityWhere.push(`ll.project_id = $${params.length}`);
    }

    const r = await query(`
      SELECT
        COUNT(*)                                          AS total_logs,
        COUNT(*) FILTER (WHERE l.log_date = CURRENT_DATE)  AS today,
        COUNT(*) FILTER (WHERE l.log_date >= date_trunc('month', CURRENT_DATE)) AS this_month,
        COUNT(*) FILTER (WHERE l.status = 'submitted')    AS pending_review,
        (SELECT COUNT(*) FROM engineer_log_activities a
          JOIN engineer_daily_logs ll ON ll.id = a.log_id
          WHERE ${activityWhere.join(' AND ')}
          AND ll.log_date >= date_trunc('month', CURRENT_DATE)
          AND a.status = 'completed') AS activities_completed,
        (SELECT COUNT(*) FROM engineer_log_activities a
          JOIN engineer_daily_logs ll ON ll.id = a.log_id
          WHERE ${activityWhere.join(' AND ')}
          AND ll.log_date >= date_trunc('month', CURRENT_DATE)) AS activities_total
      FROM engineer_daily_logs l
      WHERE ${where.join(' AND ')}
    `, params);

    res.json({ data: r.rows[0] });
  } catch (e) {
    console.error('[EngineerLog stats]', e);
    res.status(500).json({ error: e.message });
  }
});

/* ── GET /:id ──────────────────────────────────────────────────────────── */
router.get('/:id', async (req, res) => {
  try {
    const cid = req.user.company_id;
    const r = await query(`
      SELECT l.*,
        p.name AS project_name, p.project_code,
        u.name AS engineer_name, u.email AS engineer_email,
        rv.name AS reviewed_by_name
      FROM engineer_daily_logs l
      JOIN projects p ON p.id = l.project_id
      JOIN users u    ON u.id = l.engineer_id
      LEFT JOIN users rv ON rv.id = l.reviewed_by
      WHERE l.id = $1 AND l.company_id = $2
    `, [req.params.id, cid]);

    if (!r.rows.length) return res.status(404).json({ error: 'Log not found' });

    const acts = await query(
      `SELECT * FROM engineer_log_activities WHERE log_id = $1 ORDER BY sort_order, created_at`,
      [req.params.id]
    );

    res.json({ data: { ...r.rows[0], activities: acts.rows } });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* ── POST /  — create log ─────────────────────────────────────────────── */
router.post('/', async (req, res) => {
  try {
    const cid = req.user.company_id;
    const uid = req.user.id;
    const {
      project_id, log_date, weather = 'sunny', site_conditions,
      manpower_breakdown, general_remarks, issues, next_day_plan,
      activities = [], status = 'submitted'
    } = req.body;

    if (!project_id) return res.status(400).json({ error: 'Project is required' });

    // Calculate total manpower from breakdown
    const mb = manpower_breakdown || { company: 0, subcontractors: [], nmr: 0 };
    const scTotal = (mb.subcontractors || []).reduce((s, x) => s + (parseInt(x.count) || 0), 0);
    const manpower_count = (parseInt(mb.company) || 0) + scTotal + (parseInt(mb.nmr) || 0);

    const result = await withTransaction(async (client) => {
      const log_number = await nextLogNumber(client, cid);

      // Check if engineer already submitted for this date + project
      const existing = await client.query(
        `SELECT id FROM engineer_daily_logs WHERE project_id=$1 AND engineer_id=$2 AND log_date=$3`,
        [project_id, uid, log_date || new Date().toISOString().slice(0, 10)]
      );
      if (existing.rows.length) {
        throw Object.assign(new Error('You already submitted a log for this project on this date'), { status: 400 });
      }

      const ins = await client.query(`
        INSERT INTO engineer_daily_logs
          (company_id, project_id, log_date, engineer_id, log_number,
           weather, site_conditions, manpower_count, manpower_breakdown,
           general_remarks, issues, next_day_plan, status)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *
      `, [cid, project_id, log_date || new Date().toISOString().slice(0, 10), uid,
          log_number, weather, site_conditions || null, manpower_count,
          JSON.stringify(mb), general_remarks || null, issues || null,
          next_day_plan || null, status]);

      const logId = ins.rows[0].id;

      const linkedActivityIds = [];
      for (let i = 0; i < activities.length; i++) {
        const a = activities[i];
        if (!a.activity_name?.trim()) continue;
        await client.query(`
          INSERT INTO engineer_log_activities
            (log_id, activity_id, activity_name, location, unit, planned_qty, achieved_qty, status, remarks, sort_order)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
        `, [logId, a.activity_id || null, a.activity_name, a.location || null, a.unit || 'Nos',
            parseFloat(a.planned_qty) || 0, parseFloat(a.achieved_qty) || 0,
            a.status || 'in_progress', a.remarks || null, i + 1]);
        if (a.activity_id) linkedActivityIds.push(a.activity_id);
      }

      await syncActivityProgress(client, linkedActivityIds);
      return ins.rows[0];
    });

    res.status(201).json({ data: result, message: `Log ${result.log_number} submitted successfully` });
  } catch (e) {
    console.error('[EngineerLog create]', e);
    res.status(e.status || 500).json({ error: e.message });
  }
});

/* ── PUT /:id  — update (own log, submitted status) ─────────────────────── */
router.put('/:id', async (req, res) => {
  try {
    const cid = req.user.company_id;
    const uid = req.user.id;

    const existing = await query(
      `SELECT * FROM engineer_daily_logs WHERE id=$1 AND company_id=$2`, [req.params.id, cid]
    );
    if (!existing.rows.length) return res.status(404).json({ error: 'Not found' });
    if (existing.rows[0].engineer_id !== uid && !canManageLogs(req))
      return res.status(403).json({ error: 'Cannot edit another engineer\'s log' });
    if (existing.rows[0].status === 'reviewed')
      return res.status(400).json({ error: 'Cannot edit a reviewed log' });

    const {
      weather, site_conditions, manpower_breakdown,
      general_remarks, issues, next_day_plan, activities = []
    } = req.body;

    const mb = manpower_breakdown || { company: 0, subcontractors: [], nmr: 0 };
    const scTotal = (mb.subcontractors || []).reduce((s, x) => s + (parseInt(x.count) || 0), 0);
    const manpower_count = (parseInt(mb.company) || 0) + scTotal + (parseInt(mb.nmr) || 0);

    await withTransaction(async (client) => {
      await client.query(`
        UPDATE engineer_daily_logs SET
          weather=$1, site_conditions=$2, manpower_count=$3, manpower_breakdown=$4,
          general_remarks=$5, issues=$6, next_day_plan=$7, updated_at=NOW()
        WHERE id=$8
      `, [weather, site_conditions || null, manpower_count, JSON.stringify(mb),
          general_remarks || null, issues || null, next_day_plan || null, req.params.id]);

      const linkedActivityIds = [];
      if (activities.length) {
        await client.query(`DELETE FROM engineer_log_activities WHERE log_id=$1`, [req.params.id]);
        for (let i = 0; i < activities.length; i++) {
          const a = activities[i];
          if (!a.activity_name?.trim()) continue;
          await client.query(`
            INSERT INTO engineer_log_activities
              (log_id, activity_id, activity_name, location, unit, planned_qty, achieved_qty, status, remarks, sort_order)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
          `, [req.params.id, a.activity_id || null, a.activity_name, a.location || null, a.unit || 'Nos',
              parseFloat(a.planned_qty) || 0, parseFloat(a.achieved_qty) || 0,
              a.status || 'in_progress', a.remarks || null, i + 1]);
          if (a.activity_id) linkedActivityIds.push(a.activity_id);
        }
        await syncActivityProgress(client, linkedActivityIds);
      }
    });

    res.json({ message: 'Log updated' });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

/* ── POST /:id/review  — manager reviews ─────────────────────────────────── */
router.post('/:id/review', async (req, res) => {
  try {
    const cid = req.user.company_id;
    const uid = req.user.id;
    const { review_remarks } = req.body;

    if (!canManageLogs(req)) {
      return res.status(403).json({ error: 'Only managers can review engineer logs' });
    }

    const r = await query(`
      UPDATE engineer_daily_logs SET
        status='reviewed', reviewed_by=$1, reviewed_at=NOW(),
        review_remarks=$2, updated_at=NOW()
      WHERE id=$3 AND company_id=$4 AND status='submitted'
      RETURNING log_number
    `, [uid, review_remarks || null, req.params.id, cid]);

    if (!r.rows.length) return res.status(400).json({ error: 'Log not found or not in submitted state' });
    res.json({ message: `${r.rows[0].log_number} reviewed` });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
