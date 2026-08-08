// hr-shifts.routes.js — Shift Management, Overtime & Comp-off
const express = require('express');
const router  = express.Router();
const { query } = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');

const HR_ROLES = ['super_admin','admin','hr_admin','hr_manager'];
const HR_ALL   = [...HR_ROLES, 'hr', 'manager', 'department_head'];

// ── Auto-migrate ──────────────────────────────────────────────────────────────
;(async () => {
  const safe = async sql => { try { await query(sql); } catch(_) {} };
  await safe(`CREATE TABLE IF NOT EXISTS hr_shifts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL,
    name VARCHAR(100) NOT NULL,
    shift_code VARCHAR(20),
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    break_minutes INT DEFAULT 30,
    is_night_shift BOOLEAN DEFAULT FALSE,
    grace_minutes INT DEFAULT 0,
    ot_after_minutes INT DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`);
  // Add columns that may be missing on existing deployments
  await safe(`ALTER TABLE hr_shifts ADD COLUMN IF NOT EXISTS break_minutes INT DEFAULT 30`);
  await safe(`ALTER TABLE hr_shifts ADD COLUMN IF NOT EXISTS is_night_shift BOOLEAN DEFAULT FALSE`);
  await safe(`ALTER TABLE hr_shifts ADD COLUMN IF NOT EXISTS ot_after_minutes INT DEFAULT 0`);
  await safe(`ALTER TABLE hr_shifts ADD COLUMN IF NOT EXISTS grace_minutes INT DEFAULT 0`);
  // 0=Sunday..6=Saturday. Previously the Shift Scheduler report hardcoded
  // Sunday as everyone's weekly off regardless of their actual assigned
  // shift — wrong for any shift with a different rest day.
  await safe(`ALTER TABLE hr_shifts ADD COLUMN IF NOT EXISTS weekly_off_day SMALLINT DEFAULT 0`);
  await safe(`CREATE TABLE IF NOT EXISTS hr_employee_shifts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL,
    employee_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    shift_id UUID NOT NULL REFERENCES hr_shifts(id),
    effective_from DATE NOT NULL,
    effective_to DATE,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`);
  await safe(`CREATE TABLE IF NOT EXISTS hr_overtime (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL,
    employee_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    ot_date DATE NOT NULL,
    ot_hours NUMERIC(5,2) NOT NULL DEFAULT 0,
    ot_rate_multiplier NUMERIC(4,2) DEFAULT 1.5,
    ot_amount NUMERIC(12,2) DEFAULT 0,
    remarks TEXT,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','paid')),
    approved_by UUID REFERENCES users(id),
    approved_at TIMESTAMPTZ,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`);
  // Add missing columns to existing tables (safe to run on every boot)
  await safe(`ALTER TABLE hr_shifts ADD COLUMN IF NOT EXISTS code VARCHAR(20)`);
  await safe(`ALTER TABLE hr_shifts ADD COLUMN IF NOT EXISTS grace_minutes INT DEFAULT 0`);
  await safe(`ALTER TABLE hr_shifts ADD COLUMN IF NOT EXISTS ot_after_minutes INT DEFAULT 0`);
  await safe(`ALTER TABLE hr_shifts ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT TRUE`);
  await safe(`ALTER TABLE hr_employee_shifts ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id)`);
  await safe(`CREATE TABLE IF NOT EXISTS hr_comp_off (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL,
    employee_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    worked_on DATE NOT NULL,
    expiry_date DATE,
    reason TEXT,
    status VARCHAR(20) DEFAULT 'available' CHECK (status IN ('available','used','expired')),
    used_on DATE,
    approved_by UUID REFERENCES users(id),
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`);
  // Named roster groups (e.g. "Site Morning") — a named shorthand for a
  // shift+department+week-off combo. Employee counts are NOT stored here;
  // they're computed live from hr_employee_shifts so they can't drift stale.
  await safe(`CREATE TABLE IF NOT EXISTS hr_roster_groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL,
    name VARCHAR(150) NOT NULL,
    shift_id UUID REFERENCES hr_shifts(id),
    department_id UUID,
    week_off VARCHAR(30) DEFAULT 'Sunday',
    status VARCHAR(20) DEFAULT 'Active' CHECK (status IN ('Active','Inactive')),
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`);
  // Period-based shift schedules (e.g. "Q1 2026 - Site A") — a shift applied
  // to a department for a fixed date window. Employee counts computed live.
  await safe(`CREATE TABLE IF NOT EXISTS hr_shift_schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL,
    schedule_name VARCHAR(150) NOT NULL,
    shift_id UUID REFERENCES hr_shifts(id),
    department_id UUID,
    from_date DATE NOT NULL,
    to_date DATE NOT NULL,
    status VARCHAR(20) DEFAULT 'Active' CHECK (status IN ('Active','Upcoming','Expired')),
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`);
  await safe(`CREATE TABLE IF NOT EXISTS hr_outdoor_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL,
    employee_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    entry_date DATE NOT NULL,
    purpose TEXT NOT NULL,
    location VARCHAR(200),
    out_time TIME,
    in_time TIME,
    status VARCHAR(20) DEFAULT 'Pending' CHECK (status IN ('Pending','Approved','Rejected')),
    approved_by UUID REFERENCES users(id),
    approved_at TIMESTAMPTZ,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`);
  await safe(`CREATE TABLE IF NOT EXISTS hr_geofences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL,
    name VARCHAR(150) NOT NULL,
    address TEXT,
    lat NUMERIC(10,6) NOT NULL,
    lng NUMERIC(10,6) NOT NULL,
    radius_metres INT DEFAULT 100,
    active BOOLEAN DEFAULT TRUE,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`);
})();

router.use(authenticate);

// Ensure extended columns exist — runs inline so it's guaranteed before any query
const ensureShiftColumns = async () => {
  const nc = s => query(s).catch(()=>{});
  await nc(`ALTER TABLE hr_shifts ADD COLUMN IF NOT EXISTS break_minutes INT DEFAULT 30`);
  await nc(`ALTER TABLE hr_shifts ADD COLUMN IF NOT EXISTS is_night_shift BOOLEAN DEFAULT FALSE`);
  await nc(`ALTER TABLE hr_shifts ADD COLUMN IF NOT EXISTS ot_after_minutes INT DEFAULT 0`);
  await nc(`ALTER TABLE hr_shifts ADD COLUMN IF NOT EXISTS grace_minutes INT DEFAULT 0`);
  await nc(`UPDATE hr_shifts SET is_active=TRUE WHERE is_active IS NULL`);
};
let columnsEnsured = false;
const ensureOnce = async () => { if (!columnsEnsured) { await ensureShiftColumns(); columnsEnsured = true; } };

// ── Shifts ────────────────────────────────────────────────────────────────────
router.get('/shifts', authorize(...HR_ALL), async (req, res) => {
  try {
    await ensureOnce();
    const { rows } = await query(
      `SELECT id, company_id, name, shift_code AS code, start_time, end_time,
              COALESCE(break_minutes,30) AS break_minutes,
              COALESCE(is_night_shift,false) AS is_night_shift,
              COALESCE(grace_minutes,0) AS grace_minutes,
              COALESCE(ot_after_minutes,0) AS ot_after_minutes,
              COALESCE(weekly_off_day,0) AS weekly_off_day,
              COALESCE(is_active,true) AS active, created_at
       FROM hr_shifts WHERE company_id=$1 ORDER BY name`,
      [req.user.company_id]
    );
    res.json({ data: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/shifts', authorize(...HR_ROLES), async (req, res) => {
  try {
    await ensureOnce();
    const { name, code, start_time, end_time, break_minutes, is_night_shift, ot_after_minutes, weekly_off_day } = req.body;
    if (!name || !start_time || !end_time) return res.status(400).json({ error: 'name, start_time and end_time are required' });
    // grace_minutes is hardcoded to 0 — no grace period, by policy. Late is
    // measured from the exact shift start time regardless of what a caller sends.
    const { rows } = await query(
      `INSERT INTO hr_shifts(company_id,name,shift_code,start_time,end_time,break_minutes,is_night_shift,grace_minutes,ot_after_minutes,weekly_off_day)
       VALUES($1,$2,$3,$4,$5,$6,$7,0,$8,$9) RETURNING *`,
      [req.user.company_id, name, code||null, start_time, end_time,
       parseInt(break_minutes)||30, is_night_shift||false, parseInt(ot_after_minutes)||0,
       weekly_off_day !== undefined ? parseInt(weekly_off_day) : 0]
    );
    res.json({ data: rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/shifts/:id', authorize(...HR_ROLES), async (req, res) => {
  try {
    await ensureOnce();
    const { name, code, start_time, end_time, break_minutes, is_night_shift, ot_after_minutes, active, weekly_off_day } = req.body;
    // grace_minutes hardcoded to 0 — see note in POST /shifts above.
    const { rows } = await query(
      `UPDATE hr_shifts SET name=$1,shift_code=$2,start_time=$3,end_time=$4,break_minutes=$5,is_night_shift=$6,grace_minutes=0,ot_after_minutes=$7,is_active=$8,weekly_off_day=$9
       WHERE id=$10 AND company_id=$11 RETURNING *`,
      [name, code||null, start_time, end_time,
       parseInt(break_minutes)||30, is_night_shift||false, parseInt(ot_after_minutes)||0,
       active!==false, weekly_off_day !== undefined ? parseInt(weekly_off_day) : 0,
       req.params.id, req.user.company_id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Shift not found' });
    res.json({ data: rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/shifts/:id', authorize(...HR_ROLES), async (req, res) => {
  try {
    await query(`DELETE FROM hr_shifts WHERE id=$1 AND company_id=$2`, [req.params.id, req.user.company_id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Employee Shift Assignment ─────────────────────────────────────────────────
router.get('/employee-shifts', authorize(...HR_ALL), async (req, res) => {
  try {
    const { employee_id } = req.query;
    const { rows } = await query(
      `SELECT es.*, s.name as shift_name, s.start_time, s.end_time,
              COALESCE(s.weekly_off_day,0) as weekly_off_day,
              e.name as employee_name, e.employee_code as emp_code
       FROM hr_employee_shifts es
       JOIN hr_shifts s ON s.id=es.shift_id
       JOIN users e ON e.id=es.employee_id
       WHERE es.company_id=$1 ${employee_id ? 'AND es.employee_id=$2' : ''}
       ORDER BY es.effective_from DESC`,
      employee_id ? [req.user.company_id, employee_id] : [req.user.company_id]
    );
    res.json({ data: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/employee-shifts', authorize(...HR_ROLES), async (req, res) => {
  try {
    const { employee_id, shift_id, effective_from, effective_to } = req.body;
    if (!employee_id || !shift_id || !effective_from) return res.status(400).json({ error: 'employee_id, shift_id and effective_from are required' });
    const { rows } = await query(
      `INSERT INTO hr_employee_shifts(company_id,employee_id,shift_id,effective_from,effective_to,created_by)
       VALUES($1,$2,$3,$4,$5,$6) RETURNING *`,
      [req.user.company_id, employee_id, shift_id, effective_from, effective_to||null, req.user.id]
    );
    res.json({ data: rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/employee-shifts/:id', authorize(...HR_ROLES), async (req, res) => {
  try {
    await query(`DELETE FROM hr_employee_shifts WHERE id=$1 AND company_id=$2`, [req.params.id, req.user.company_id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Bulk-assign a shift to all active employees in a project (or HO/no-project)
router.post('/employee-shifts/bulk-assign', authorize(...HR_ROLES), async (req, res) => {
  try {
    const { project_id, shift_id, effective_from, effective_to } = req.body;
    if (!shift_id || !effective_from) return res.status(400).json({ error: 'shift_id and effective_from required' });

    const isNone = !project_id || project_id === 'none';
    const empSql = isNone
      ? `SELECT u.id FROM users u JOIN employee_profiles ep ON ep.user_id=u.id WHERE u.company_id=$1 AND u.is_active=true AND ep.project_id IS NULL`
      : `SELECT u.id FROM users u JOIN employee_profiles ep ON ep.user_id=u.id WHERE u.company_id=$1 AND u.is_active=true AND ep.project_id=$2`;
    const { rows: emps } = await query(empSql, isNone ? [req.user.company_id] : [req.user.company_id, project_id]);

    let assigned = 0;
    for (const emp of emps) {
      await query(
        `UPDATE hr_employee_shifts SET effective_to=$1 WHERE employee_id=$2 AND company_id=$3 AND effective_to IS NULL AND effective_from < $1`,
        [effective_from, emp.id, req.user.company_id]
      );
      await query(
        `INSERT INTO hr_employee_shifts(company_id,employee_id,shift_id,effective_from,effective_to,created_by)
         VALUES($1,$2,$3,$4,$5,$6)`,
        [req.user.company_id, emp.id, shift_id, effective_from, effective_to||null, req.user.id]
      );
      assigned++;
    }
    res.json({ data: { assigned } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Current shift per active employee (latest assignment on/before today),
// reused by the Employee Shifts and Shift Calendar admin pages.
router.get('/employee-shifts/current', authorize(...HR_ALL), async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT u.id, u.employee_code AS emp_code, u.name, dep.name AS dept,
              s.id AS shift_id, s.name AS shift_name, s.start_time, s.end_time,
              es.effective_from AS effective
       FROM users u
       LEFT JOIN employee_profiles ep ON ep.user_id=u.id
       LEFT JOIN hr_departments dep ON dep.id=ep.department_id
       LEFT JOIN LATERAL (
         SELECT * FROM hr_employee_shifts
         WHERE employee_id=u.id AND effective_from<=CURRENT_DATE
         ORDER BY effective_from DESC LIMIT 1
       ) es ON true
       LEFT JOIN hr_shifts s ON s.id=es.shift_id
       WHERE u.company_id=$1 AND u.is_active=true
       ORDER BY u.name`,
      [req.user.company_id]
    );
    res.json({ data: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Roster Groups (named shift+department+week-off shorthand) ────────────────
router.get('/roster-groups', authorize(...HR_ALL), async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT rg.*, s.name AS shift_name, s.start_time, s.end_time, dep.name AS department_name,
              (SELECT COUNT(*) FROM users u
                 JOIN employee_profiles ep ON ep.user_id=u.id
                 LEFT JOIN LATERAL (
                   SELECT shift_id FROM hr_employee_shifts
                   WHERE employee_id=u.id AND effective_from<=CURRENT_DATE
                   ORDER BY effective_from DESC LIMIT 1
                 ) es ON true
               WHERE u.company_id=rg.company_id AND u.is_active=true
                 AND (rg.department_id IS NULL OR ep.department_id=rg.department_id)
                 AND es.shift_id=rg.shift_id) AS employees
       FROM hr_roster_groups rg
       LEFT JOIN hr_shifts s ON s.id=rg.shift_id
       LEFT JOIN hr_departments dep ON dep.id=rg.department_id
       WHERE rg.company_id=$1 ORDER BY rg.name`,
      [req.user.company_id]
    );
    res.json({ data: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/roster-groups', authorize(...HR_ROLES), async (req, res) => {
  try {
    const { name, shift_id, department_id, week_off, status } = req.body;
    if (!name || !shift_id) return res.status(400).json({ error: 'name and shift_id are required' });
    const { rows } = await query(
      `INSERT INTO hr_roster_groups(company_id,name,shift_id,department_id,week_off,status,created_by)
       VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [req.user.company_id, name, shift_id, department_id||null, week_off||'Sunday', status||'Active', req.user.id]
    );
    res.status(201).json({ data: rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/roster-groups/:id', authorize(...HR_ROLES), async (req, res) => {
  try {
    const { name, shift_id, department_id, week_off, status } = req.body;
    const { rows } = await query(
      `UPDATE hr_roster_groups SET name=$1,shift_id=$2,department_id=$3,week_off=$4,status=$5
       WHERE id=$6 AND company_id=$7 RETURNING *`,
      [name, shift_id, department_id||null, week_off||'Sunday', status||'Active', req.params.id, req.user.company_id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json({ data: rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/roster-groups/:id', authorize(...HR_ROLES), async (req, res) => {
  try {
    await query(`DELETE FROM hr_roster_groups WHERE id=$1 AND company_id=$2`, [req.params.id, req.user.company_id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Shift Schedules (period-based shift application to a department) ────────
router.get('/shift-schedules', authorize(...HR_ALL), async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT ss.*, s.name AS shift_name, s.start_time, s.end_time, dep.name AS department_name,
              (SELECT COUNT(*) FROM users u
                 JOIN employee_profiles ep ON ep.user_id=u.id
                 LEFT JOIN LATERAL (
                   SELECT shift_id FROM hr_employee_shifts
                   WHERE employee_id=u.id AND effective_from<=CURRENT_DATE
                   ORDER BY effective_from DESC LIMIT 1
                 ) es ON true
               WHERE u.company_id=ss.company_id AND u.is_active=true
                 AND (ss.department_id IS NULL OR ep.department_id=ss.department_id)
                 AND es.shift_id=ss.shift_id) AS employees
       FROM hr_shift_schedules ss
       LEFT JOIN hr_shifts s ON s.id=ss.shift_id
       LEFT JOIN hr_departments dep ON dep.id=ss.department_id
       WHERE ss.company_id=$1 ORDER BY ss.from_date DESC`,
      [req.user.company_id]
    );
    const today = new Date().toISOString().slice(0,10);
    const withStatus = rows.map(r => ({
      ...r,
      status: r.to_date < today ? 'Expired' : r.from_date > today ? 'Upcoming' : 'Active',
    }));
    res.json({ data: withStatus });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/shift-schedules', authorize(...HR_ROLES), async (req, res) => {
  try {
    const { schedule_name, shift_id, department_id, from_date, to_date } = req.body;
    if (!schedule_name || !shift_id || !from_date || !to_date) return res.status(400).json({ error: 'schedule_name, shift_id, from_date and to_date are required' });
    const { rows } = await query(
      `INSERT INTO hr_shift_schedules(company_id,schedule_name,shift_id,department_id,from_date,to_date,created_by)
       VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [req.user.company_id, schedule_name, shift_id, department_id||null, from_date, to_date, req.user.id]
    );
    res.status(201).json({ data: rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/shift-schedules/:id', authorize(...HR_ROLES), async (req, res) => {
  try {
    const { schedule_name, shift_id, department_id, from_date, to_date } = req.body;
    const { rows } = await query(
      `UPDATE hr_shift_schedules SET schedule_name=$1,shift_id=$2,department_id=$3,from_date=$4,to_date=$5
       WHERE id=$6 AND company_id=$7 RETURNING *`,
      [schedule_name, shift_id, department_id||null, from_date, to_date, req.params.id, req.user.company_id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json({ data: rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/shift-schedules/:id', authorize(...HR_ROLES), async (req, res) => {
  try {
    await query(`DELETE FROM hr_shift_schedules WHERE id=$1 AND company_id=$2`, [req.params.id, req.user.company_id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Outdoor / Field Duty Entries ──────────────────────────────────────────────
router.get('/outdoor-entries', authorize(...HR_ALL), async (req, res) => {
  try {
    const { status } = req.query;
    const conds = ['oe.company_id=$1']; const params = [req.user.company_id]; let i = 2;
    if (status) { conds.push(`oe.status=$${i++}`); params.push(status); }
    const { rows } = await query(
      `SELECT oe.*, u.name AS employee_name, u.employee_code, dep.name AS department_name
       FROM hr_outdoor_entries oe
       JOIN users u ON u.id=oe.employee_id
       LEFT JOIN employee_profiles ep ON ep.user_id=u.id
       LEFT JOIN hr_departments dep ON dep.id=ep.department_id
       WHERE ${conds.join(' AND ')} ORDER BY oe.entry_date DESC, oe.created_at DESC`,
      params
    );
    res.json({ data: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/outdoor-entries', authorize(...HR_ALL), async (req, res) => {
  try {
    const { employee_id, entry_date, purpose, location, out_time, in_time } = req.body;
    if (!employee_id || !entry_date || !purpose) return res.status(400).json({ error: 'employee_id, entry_date and purpose are required' });
    const { rows } = await query(
      `INSERT INTO hr_outdoor_entries(company_id,employee_id,entry_date,purpose,location,out_time,in_time,created_by)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [req.user.company_id, employee_id, entry_date, purpose, location||null, out_time||null, in_time||null, req.user.id]
    );
    res.status(201).json({ data: rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/outdoor-entries/:id/approve', authorize(...HR_ROLES), async (req, res) => {
  try {
    const { rows } = await query(
      `UPDATE hr_outdoor_entries SET status='Approved',approved_by=$1,approved_at=NOW()
       WHERE id=$2 AND company_id=$3 RETURNING *`,
      [req.user.id, req.params.id, req.user.company_id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json({ data: rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/outdoor-entries/:id/reject', authorize(...HR_ROLES), async (req, res) => {
  try {
    const { rows } = await query(
      `UPDATE hr_outdoor_entries SET status='Rejected',approved_by=$1,approved_at=NOW()
       WHERE id=$2 AND company_id=$3 RETURNING *`,
      [req.user.id, req.params.id, req.user.company_id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json({ data: rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Geofences ─────────────────────────────────────────────────────────────────
router.get('/geofences', authorize(...HR_ALL), async (req, res) => {
  try {
    const { rows } = await query(`SELECT * FROM hr_geofences WHERE company_id=$1 ORDER BY name`, [req.user.company_id]);
    res.json({ data: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/geofences', authorize(...HR_ROLES), async (req, res) => {
  try {
    const { name, address, lat, lng, radius_metres } = req.body;
    if (!name || lat === undefined || lng === undefined) return res.status(400).json({ error: 'name, lat and lng are required' });
    const { rows } = await query(
      `INSERT INTO hr_geofences(company_id,name,address,lat,lng,radius_metres,created_by)
       VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [req.user.company_id, name, address||null, lat, lng, parseInt(radius_metres)||100, req.user.id]
    );
    res.status(201).json({ data: rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/geofences/:id', authorize(...HR_ROLES), async (req, res) => {
  try {
    const { name, address, lat, lng, radius_metres, active } = req.body;
    const { rows } = await query(
      `UPDATE hr_geofences SET name=$1,address=$2,lat=$3,lng=$4,radius_metres=$5,active=$6
       WHERE id=$7 AND company_id=$8 RETURNING *`,
      [name, address||null, lat, lng, parseInt(radius_metres)||100, active!==false, req.params.id, req.user.company_id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json({ data: rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/geofences/:id/toggle', authorize(...HR_ROLES), async (req, res) => {
  try {
    const { rows } = await query(
      `UPDATE hr_geofences SET active=NOT active WHERE id=$1 AND company_id=$2 RETURNING *`,
      [req.params.id, req.user.company_id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json({ data: rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/geofences/:id', authorize(...HR_ROLES), async (req, res) => {
  try {
    await query(`DELETE FROM hr_geofences WHERE id=$1 AND company_id=$2`, [req.params.id, req.user.company_id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Overtime ──────────────────────────────────────────────────────────────────
router.get('/overtime', authorize(...HR_ALL), async (req, res) => {
  try {
    const { employee_id, month, status } = req.query;
    const conds = ['o.company_id=$1']; const params = [req.user.company_id]; let i = 2;
    if (employee_id) { conds.push(`o.employee_id=$${i++}`); params.push(employee_id); }
    if (month)       { conds.push(`to_char(o.ot_date,'YYYY-MM')=$${i++}`); params.push(month); }
    if (status)      { conds.push(`o.status=$${i++}`); params.push(status); }
    const { rows } = await query(
      `SELECT o.*, e.name AS full_name, e.employee_code AS emp_code
       FROM hr_overtime o JOIN users e ON e.id=o.employee_id
       WHERE ${conds.join(' AND ')} ORDER BY o.ot_date DESC`,
      params
    );
    res.json({ data: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/overtime', authorize(...HR_ALL), async (req, res) => {
  try {
    const { employee_id, ot_date, ot_hours, ot_rate_multiplier, ot_amount, remarks } = req.body;
    const { rows } = await query(
      `INSERT INTO hr_overtime(company_id,employee_id,ot_date,ot_hours,ot_rate_multiplier,ot_amount,remarks,created_by)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [req.user.company_id, employee_id, ot_date, ot_hours, ot_rate_multiplier||1.5, ot_amount||0, remarks, req.user.id]
    );
    res.json({ data: rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/overtime/:id/approve', authorize(...HR_ROLES), async (req, res) => {
  try {
    const { rows } = await query(
      `UPDATE hr_overtime SET status='approved',approved_by=$1,approved_at=NOW()
       WHERE id=$2 AND company_id=$3 RETURNING *`,
      [req.user.id, req.params.id, req.user.company_id]
    );
    res.json({ data: rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/overtime/:id/reject', authorize(...HR_ROLES), async (req, res) => {
  try {
    const { rows } = await query(
      `UPDATE hr_overtime SET status='rejected',approved_by=$1,approved_at=NOW()
       WHERE id=$2 AND company_id=$3 RETURNING *`,
      [req.user.id, req.params.id, req.user.company_id]
    );
    res.json({ data: rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Comp-off ──────────────────────────────────────────────────────────────────
router.get('/comp-off', authorize(...HR_ALL), async (req, res) => {
  try {
    const { employee_id } = req.query;
    const { rows } = await query(
      `SELECT c.*, e.name AS full_name, e.employee_code AS emp_code
       FROM hr_comp_off c JOIN users e ON e.id=c.employee_id
       WHERE c.company_id=$1 ${employee_id ? 'AND c.employee_id=$2' : ''}
       ORDER BY c.worked_on DESC`,
      employee_id ? [req.user.company_id, employee_id] : [req.user.company_id]
    );
    res.json({ data: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/comp-off', authorize(...HR_ALL), async (req, res) => {
  try {
    const { employee_id, worked_on, reason, expiry_date } = req.body;
    const { rows } = await query(
      `INSERT INTO hr_comp_off(company_id,employee_id,worked_on,reason,expiry_date,created_by)
       VALUES($1,$2,$3,$4,$5,$6) RETURNING *`,
      [req.user.company_id, employee_id, worked_on, reason, expiry_date||null, req.user.id]
    );
    res.json({ data: rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/comp-off/:id/approve', authorize(...HR_ROLES), async (req, res) => {
  try {
    const { rows } = await query(
      `UPDATE hr_comp_off SET status='available',approved_by=$1
       WHERE id=$2 AND company_id=$3 RETURNING *`,
      [req.user.id, req.params.id, req.user.company_id]
    );
    res.json({ data: rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
