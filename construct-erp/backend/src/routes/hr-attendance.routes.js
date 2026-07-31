// src/routes/hr-attendance.routes.js
// Salaried employee attendance (separate from site workers)
const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const { query } = require('../config/database');
const { runSchemaInit } = require('../utils/schemaInit');

router.use(authenticate);
router.use(authorize('super_admin', 'admin', 'hr', 'hr_admin', 'hr_manager', 'manager', 'department_head', 'project_manager', 'project_head',
  'managing_director', 'director', 'ceo', 'cfo', 'md'));

// Full HR roles see all employees; project/dept roles see only their project
const FULL_HR_ROLES = new Set(['super_admin', 'admin', 'hr', 'hr_admin', 'hr_manager',
  'managing_director', 'director', 'ceo', 'cfo', 'md']);

// These two (MD + Head Office management) don't punch a biometric device, so
// on any day with no hr_attendance row for them the daily register would
// otherwise default them to "absent". Always show them as present instead.
const ALWAYS_PRESENT_USER_IDS = [
  '042f1671-14c9-40a3-b40c-d213a30ec258', // A.STEPHEN, Managing Director
  '4b7b60a8-2cae-49bd-937d-86a55bfb1601', // Sam S Nathan, Head Office Management
];

async function getProjectScope(req) {
  const role = String(req.user?.role || '').toLowerCase();
  if (FULL_HR_ROLES.has(role)) return null; // no restriction
  // Look up the caller's own project_id from their employee profile
  const r = await query(
    `SELECT project_id FROM employee_profiles WHERE user_id=$1`,
    [req.user.id]
  );
  return r.rows[0]?.project_id || null; // null = unassigned, still restrict to NULL
}

// ─── Auto-create table ────────────────────────────────────────────────────────
const initTable = async () => {
  await query(`
    CREATE TABLE IF NOT EXISTS hr_attendance (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID REFERENCES users(id),
      company_id UUID REFERENCES companies(id),
      attendance_date DATE NOT NULL,
      status TEXT DEFAULT 'present',
      in_time TIME,
      out_time TIME,
      late_minutes INT DEFAULT 0,
      early_exit_minutes INT DEFAULT 0,
      source TEXT DEFAULT 'manual',
      leave_request_id UUID,
      remarks TEXT,
      UNIQUE(user_id, attendance_date)
    )
  `);
  await query(`
    CREATE INDEX IF NOT EXISTS idx_hr_attendance_user_date
    ON hr_attendance(user_id, attendance_date)
  `);
  await query(`
    CREATE INDEX IF NOT EXISTS idx_hr_attendance_company_date
    ON hr_attendance(company_id, attendance_date)
  `);
};
runSchemaInit('hr-attendance', initTable);

// Day-specific muster fields from the site's Daily Labour Report (Trade/Company
// are per-employee and live on employee_profiles; these vary day to day)
runSchemaInit('hr_attendance_muster_columns', async () => {
  await query(`ALTER TABLE hr_attendance ADD COLUMN IF NOT EXISTS shift          VARCHAR(20) DEFAULT 'DAY'`);
  await query(`ALTER TABLE hr_attendance ADD COLUMN IF NOT EXISTS site           VARCHAR(150)`);
  await query(`ALTER TABLE hr_attendance ADD COLUMN IF NOT EXISTS eng_fm_ch_cm   VARCHAR(150)`);
  await query(`ALTER TABLE hr_attendance ADD COLUMN IF NOT EXISTS incharge_name  VARCHAR(150)`);
  await query(`ALTER TABLE hr_attendance ADD COLUMN IF NOT EXISTS tower_incharge VARCHAR(150)`);
});

// ═══════════════════════════════════════════════════════════
// GET — monthly grid (company-wide or per user)
// ═══════════════════════════════════════════════════════════
router.get('/', async (req, res) => {
  try {
    const { user_id, month, year, department_id, date, project_id } = req.query;
    // explicit filter wins; otherwise auto-scope by role
    const projectId = project_id || await getProjectScope(req);

    let sql = `
      SELECT a.*, u.name as employee_name, u.employee_code,
             ep.department_id, dep.name as department_name
      FROM hr_attendance a
      JOIN users u ON u.id = a.user_id
      LEFT JOIN employee_profiles ep ON ep.user_id = u.id
      LEFT JOIN hr_departments dep ON dep.id = ep.department_id
      WHERE a.company_id = $1`;
    const params = [req.user.company_id];
    let idx = 2;

    if (date) {
      sql += ` AND a.attendance_date = $${idx}`; params.push(date); idx++;
    } else {
      const m = parseInt(month) || new Date().getMonth() + 1;
      const y = parseInt(year)  || new Date().getFullYear();
      sql += ` AND EXTRACT(MONTH FROM a.attendance_date) = $${idx} AND EXTRACT(YEAR FROM a.attendance_date) = $${idx+1}`;
      params.push(m, y); idx += 2;
    }

    if (user_id)      { sql += ` AND a.user_id=$${idx}`;       params.push(user_id);      idx++; }
    if (department_id){ sql += ` AND ep.department_id=$${idx}`; params.push(department_id); idx++; }
    if (projectId !== null) { sql += ` AND ep.project_id=$${idx}`; params.push(projectId); idx++; }

    sql += ' ORDER BY u.name, a.attendance_date';
    const { rows } = await query(sql, params);
    res.json({ data: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════
// SUMMARY — per employee for a month
// ═══════════════════════════════════════════════════════════
// /summary — per-employee monthly summary (month/year) OR department-grouped (from/to)
router.get('/summary', async (req, res) => {
  try {
    const { month, year, from, to, department_id, project_id } = req.query;
    const cid = req.user.company_id;
    // explicit filter wins; otherwise auto-scope by role — see GET '/' above
    const scopeProject = await getProjectScope(req);
    const effProject = project_id || scopeProject;

    // ── Per-employee mode (Attendance page sends month/year) ──
    if (month || year) {
      const m = parseInt(month) || new Date().getMonth() + 1;
      const y = parseInt(year)  || new Date().getFullYear();

      const params = [cid, m, y];
      let deptFilter = '', projFilter = '';
      let idx = 4;
      if (department_id) { deptFilter = ` AND ep.department_id=$${idx++}`; params.push(department_id); }
      if (effProject)    { projFilter = ` AND ep.project_id=$${idx++}`;    params.push(effProject); }

      const { rows } = await query(`
        SELECT u.id AS user_id,
               u.name,
               u.employee_code,
               ep.department_id,
               COALESCE(dep.name, u.department, '—') AS department_name,
               COUNT(*) FILTER (WHERE a.status='present')  AS present,
               COUNT(*) FILTER (WHERE a.status='absent')   AS absent,
               COUNT(*) FILTER (WHERE a.status='half_day') AS half_day,
               COUNT(*) FILTER (WHERE a.status='leave')    AS on_leave,
               COUNT(*)                                    AS total_marked
        FROM users u
        LEFT JOIN employee_profiles ep ON ep.user_id = u.id
        LEFT JOIN hr_departments dep   ON dep.id = ep.department_id
        LEFT JOIN hr_attendance a      ON a.user_id = u.id
                                      AND a.company_id = $1
                                      AND EXTRACT(MONTH FROM a.attendance_date) = $2
                                      AND EXTRACT(YEAR  FROM a.attendance_date) = $3
        WHERE u.company_id = $1
          AND u.is_active = TRUE
          AND COALESCE(ep.employment_status, 'active') NOT IN ('resigned','terminated','absconded')
          ${deptFilter}
          ${projFilter}
        GROUP BY u.id, u.name, u.employee_code, ep.department_id, dep.name, u.department
        ORDER BY dep.name NULLS LAST, u.name
      `, params);

      return res.json({ data: rows });
    }

    // ── Department-grouped mode (reports send from/to) ──
    const fromDate = from || new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0,10);
    const toDate   = to   || new Date().toISOString().slice(0,10);

    const staffParams = [cid, fromDate, toDate];
    let staffProjFilter = '';
    if (effProject) { staffProjFilter = ` AND ep.project_id=$4`; staffParams.push(effProject); }

    const scParams = [cid, fromDate, toDate];
    let scProjFilter = '';
    if (effProject) { scProjFilter = ` AND w.project_id=$4`; scParams.push(effProject); }

    const [staffRes, scRes] = await Promise.all([
      query(`
        SELECT COALESCE(dep.name, 'Unassigned')         AS label,
               COUNT(*) FILTER (WHERE a.status='present')  AS present,
               COUNT(*) FILTER (WHERE a.status='absent')   AS absent,
               COUNT(*) FILTER (WHERE a.status='leave')    AS leave,
               COUNT(*) FILTER (WHERE a.status='half_day') AS half_day,
               COUNT(*)                                    AS total
        FROM hr_attendance a
        JOIN users u ON u.id = a.user_id
        LEFT JOIN employee_profiles ep ON ep.user_id = u.id
        LEFT JOIN hr_departments dep   ON dep.id = ep.department_id
        WHERE a.company_id=$1 AND a.attendance_date BETWEEN $2 AND $3
          AND COALESCE(ep.employment_status, 'active') NOT IN ('resigned','terminated','absconded')
          AND NOT EXISTS (SELECT 1 FROM sc_workers w WHERE w.company_id = u.company_id AND w.worker_code = u.employee_code)
        ${staffProjFilter}
        GROUP BY dep.name ORDER BY dep.name
      `, staffParams),
      query(`
        SELECT COALESCE(sc.name, 'SC Workers')           AS label,
               COUNT(*) FILTER (WHERE a.status='present')  AS present,
               COUNT(*) FILTER (WHERE a.status='absent')   AS absent,
               0                                           AS leave,
               COUNT(*) FILTER (WHERE a.status='half_day') AS half_day,
               COUNT(*)                                    AS total
        FROM sc_attendance a
        JOIN sc_workers w ON w.id = a.worker_id
        LEFT JOIN sc_subcontractors sc ON sc.id = w.sc_id
        WHERE a.company_id=$1 AND a.attendance_date BETWEEN $2 AND $3
        ${scProjFilter}
        GROUP BY sc.name ORDER BY sc.name
      `, scParams),
    ]);

    res.json({ data: [...staffRes.rows, ...scRes.rows] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// /yearly-summary — per-employee monthly breakdown for a full year (staff + SC workers)
router.get('/yearly-summary', async (req, res) => {
  try {
    const { year } = req.query;
    const y = parseInt(year) || new Date().getFullYear();
    const cid = req.user.company_id;
    const scopeProject = await getProjectScope(req);

    let staffProjFilter = '', scProjFilter = '';
    const staffParams = [cid, y];
    const scParams    = [cid, y];
    if (scopeProject !== null) {
      staffProjFilter = ` AND ep.project_id=$3`; staffParams.push(scopeProject);
      scProjFilter    = ` AND w.project_id=$3`;  scParams.push(scopeProject);
    }

    const [staffRes, scRes] = await Promise.all([
      query(`
        SELECT u.employee_code AS emp_key,
               EXTRACT(MONTH FROM a.attendance_date)::int AS month_num,
               COUNT(*) FILTER (WHERE a.status='present')  AS present,
               COUNT(*) FILTER (WHERE a.status='absent')   AS absent,
               COUNT(*) FILTER (WHERE a.status='leave')    AS leave
        FROM hr_attendance a
        JOIN users u ON u.id = a.user_id
        LEFT JOIN employee_profiles ep ON ep.user_id = u.id
        WHERE a.company_id=$1 AND EXTRACT(YEAR FROM a.attendance_date)=$2
        ${staffProjFilter}
        GROUP BY u.employee_code, EXTRACT(MONTH FROM a.attendance_date)
      `, staffParams),
      query(`
        SELECT w.worker_code AS emp_key,
               EXTRACT(MONTH FROM a.attendance_date)::int AS month_num,
               COUNT(*) FILTER (WHERE a.status='present')  AS present,
               COUNT(*) FILTER (WHERE a.status='absent')   AS absent,
               0                                           AS leave
        FROM sc_attendance a
        JOIN sc_workers w ON w.id = a.worker_id
        WHERE a.company_id=$1 AND EXTRACT(YEAR FROM a.attendance_date)=$2
        ${scProjFilter}
        GROUP BY w.worker_code, EXTRACT(MONTH FROM a.attendance_date)
      `, scParams),
    ]);

    // Build keyed object: { empKey: { monthNum: { present, absent, leave } } }
    const result = {};
    [...staffRes.rows, ...scRes.rows].forEach(r => {
      if (!result[r.emp_key]) result[r.emp_key] = {};
      result[r.emp_key][r.month_num] = {
        present: parseInt(r.present)||0,
        absent:  parseInt(r.absent)||0,
        leave:   parseInt(r.leave)||0,
      };
    });
    res.json({ data: result });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════
// DAILY TREND — present-count per day for the month (dashboard chart)
// ═══════════════════════════════════════════════════════════
router.get('/daily-trend', async (req, res) => {
  try {
    const { month, year } = req.query;
    const m = parseInt(month) || new Date().getMonth() + 1;
    const y = parseInt(year)  || new Date().getFullYear();
    const projectId = await getProjectScope(req);

    let sql, params;
    if (projectId !== null) {
      // scoped: join employee_profiles to filter by project
      sql = `SELECT a.attendance_date,
                    COUNT(*) FILTER (WHERE a.status='present') AS present,
                    COUNT(*) FILTER (WHERE a.status='absent')  AS absent,
                    COUNT(*) FILTER (WHERE a.status='leave')   AS on_leave
             FROM hr_attendance a
             JOIN employee_profiles ep ON ep.user_id = a.user_id
             WHERE a.company_id=$1
               AND EXTRACT(MONTH FROM a.attendance_date)=$2
               AND EXTRACT(YEAR  FROM a.attendance_date)=$3
               AND ep.project_id=$4
             GROUP BY a.attendance_date ORDER BY a.attendance_date`;
      params = [req.user.company_id, m, y, projectId];
    } else {
      sql = `SELECT attendance_date,
                    COUNT(*) FILTER (WHERE status='present') AS present,
                    COUNT(*) FILTER (WHERE status='absent')  AS absent,
                    COUNT(*) FILTER (WHERE status='leave')   AS on_leave
             FROM hr_attendance
             WHERE company_id=$1
               AND EXTRACT(MONTH FROM attendance_date)=$2
               AND EXTRACT(YEAR  FROM attendance_date)=$3
             GROUP BY attendance_date ORDER BY attendance_date`;
      params = [req.user.company_id, m, y];
    }
    const { rows } = await query(sql, params);
    res.json({ data: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════
// DEPARTMENT SUMMARY — per-department attendance rollup for the month
// ═══════════════════════════════════════════════════════════
router.get('/department-summary', async (req, res) => {
  try {
    const { from, to, project_id } = req.query;
    const cid = req.user.company_id;
    // explicit filter wins; otherwise auto-scope by role — see GET '/' above
    const scopeProject = await getProjectScope(req);
    const effProject = project_id || scopeProject;

    const fromDate = from || new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0,10);
    const toDate   = to   || new Date().toISOString().slice(0,10);

    const staffParams = [cid, fromDate, toDate];
    let staffProjFilter = '';
    if (effProject) { staffProjFilter = ` AND ep.project_id=$4`; staffParams.push(effProject); }

    const scParams = [cid, fromDate, toDate];
    let scProjFilter = '';
    if (effProject) { scProjFilter = ` AND w.project_id=$4`; scParams.push(effProject); }

    const [staffRes, scRes] = await Promise.all([
      query(`
        SELECT COALESCE(dep.name, 'Unassigned')          AS department,
               COUNT(*) FILTER (WHERE a.status='present')  AS present,
               COUNT(*) FILTER (WHERE a.status='absent')   AS absent,
               COUNT(*) FILTER (WHERE a.status='leave')    AS leave,
               COUNT(*) FILTER (WHERE a.status='half_day') AS half_day,
               COUNT(*)                                    AS total
        FROM hr_attendance a
        JOIN users u ON u.id = a.user_id AND u.is_active=TRUE
        LEFT JOIN employee_profiles ep ON ep.user_id = u.id
        LEFT JOIN hr_departments dep   ON dep.id = ep.department_id
        WHERE a.company_id=$1 AND a.attendance_date BETWEEN $2 AND $3
          AND COALESCE(ep.employment_status, 'active') NOT IN ('resigned','terminated','absconded')
          AND NOT EXISTS (SELECT 1 FROM sc_workers w WHERE w.company_id = u.company_id AND w.worker_code = u.employee_code)
        ${staffProjFilter}
        GROUP BY dep.name ORDER BY dep.name
      `, staffParams),
      query(`
        SELECT COALESCE(sc.name, 'SC Workers')           AS department,
               COUNT(*) FILTER (WHERE a.status='present')  AS present,
               COUNT(*) FILTER (WHERE a.status='absent')   AS absent,
               0                                           AS leave,
               COUNT(*) FILTER (WHERE a.status='half_day') AS half_day,
               COUNT(*)                                    AS total
        FROM sc_attendance a
        JOIN sc_workers w ON w.id = a.worker_id AND w.status='active'
        LEFT JOIN sc_subcontractors sc ON sc.id = w.sc_id
        WHERE a.company_id=$1 AND a.attendance_date BETWEEN $2 AND $3
        ${scProjFilter}
        GROUP BY sc.name ORDER BY sc.name
      `, scParams),
    ]);

    res.json({ data: [...staffRes.rows, ...scRes.rows] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════
// BULK MARK — mark attendance for a date (one or all employees)
// ═══════════════════════════════════════════════════════════
router.post('/bulk', async (req, res) => {
  try {
    const { attendance_date, records } = req.body;
    // records: [{ user_id, status, in_time, out_time, remarks }]
    const inserted = [];
    for (const rec of records) {
      const { rows } = await query(
        `INSERT INTO hr_attendance (user_id, company_id, attendance_date, status, in_time, out_time, remarks)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT (user_id, attendance_date)
         DO UPDATE SET status=$4, in_time=$5, out_time=$6, remarks=$7
         RETURNING *`,
        [rec.user_id, req.user.company_id, attendance_date,
         rec.status || 'present', rec.in_time || null, rec.out_time || null, rec.remarks || null]
      );
      inserted.push(rows[0]);
    }
    res.status(201).json({ data: inserted, count: inserted.length });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════
// UPDATE SINGLE RECORD
// ═══════════════════════════════════════════════════════════
router.post('/month-baseline', async (req, res) => {
  try {
    const { month, year, department_id, overwrite = false } = req.body;
    const m = parseInt(month);
    const y = parseInt(year);

    if (!m || !y || m < 1 || m > 12) {
      return res.status(400).json({ error: 'Valid month and year are required' });
    }

    let employeeSql = `
      SELECT u.id
      FROM users u
      LEFT JOIN employee_profiles ep ON ep.user_id = u.id
      WHERE u.company_id = $1 AND u.is_active = TRUE
        AND COALESCE(ep.employment_status, 'active') NOT IN ('resigned','terminated','absconded')`;
    const employeeParams = [req.user.company_id];

    if (department_id) {
      employeeSql += ' AND ep.department_id = $2';
      employeeParams.push(department_id);
    }

    const employees = await query(employeeSql, employeeParams);
    const holidays = await query(
      `SELECT holiday_date::date AS holiday_date
       FROM hr_holidays
       WHERE company_id = $1
         AND EXTRACT(MONTH FROM holiday_date) = $2
         AND EXTRACT(YEAR FROM holiday_date) = $3`,
      [req.user.company_id, m, y]
    );

    const holidaySet = new Set(
      holidays.rows.map((h) => new Date(h.holiday_date).toISOString().slice(0, 10))
    );
    const daysInMonth = new Date(y, m, 0).getDate();
    let changed = 0;

    // Fetch all approved leaves for this month across all employees so baseline
    // does not overwrite approved leave days with "present".
    const leaveQ = await query(
      `SELECT user_id, from_date::date AS from_date, to_date::date AS to_date
       FROM hr_leave_requests
       WHERE company_id = $1 AND status = 'approved'
         AND from_date <= make_date($2, $3, $4) AND to_date >= make_date($2, $3, 1)`,
      [req.user.company_id, y, m, daysInMonth]
    );
    const approvedLeaveSet = new Set();
    for (const lr of leaveQ.rows) {
      const from = new Date(lr.from_date);
      const to   = new Date(lr.to_date);
      for (const cur = new Date(from); cur <= to; cur.setDate(cur.getDate() + 1)) {
        const ds = cur.toISOString().slice(0, 10);
        if (ds.startsWith(`${y}-${String(m).padStart(2, '0')}`)) {
          approvedLeaveSet.add(`${lr.user_id}|${ds}`);
        }
      }
    }

    for (const emp of employees.rows) {
      for (let d = 1; d <= daysInMonth; d++) {
        const dateStr = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const day = new Date(y, m - 1, d).getDay();
        const onLeave = approvedLeaveSet.has(`${emp.id}|${dateStr}`);
        const status = day === 0 ? 'week_off' : holidaySet.has(dateStr) ? 'holiday' : onLeave ? 'leave' : 'present';
        const inTime = status === 'present' ? '09:30' : null;
        const outTime = status === 'present' ? '18:00' : null;

        const sql = overwrite
          ? `INSERT INTO hr_attendance (user_id, company_id, attendance_date, status, in_time, out_time, source, remarks)
             VALUES ($1,$2,$3,$4,$5,$6,'baseline','Monthly baseline')
             ON CONFLICT (user_id, attendance_date)
             DO UPDATE SET status=$4, in_time=$5, out_time=$6, source='baseline', remarks='Monthly baseline'
             RETURNING id`
          : `INSERT INTO hr_attendance (user_id, company_id, attendance_date, status, in_time, out_time, source, remarks)
             VALUES ($1,$2,$3,$4,$5,$6,'baseline','Monthly baseline')
             ON CONFLICT (user_id, attendance_date) DO NOTHING
             RETURNING id`;

        const result = await query(sql, [emp.id, req.user.company_id, dateStr, status, inTime, outTime]);
        changed += result.rowCount || 0;
      }
    }

    res.status(201).json({
      count: changed,
      employees: employees.rows.length,
      month: m,
      year: y,
      overwrite: Boolean(overwrite),
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /hr-admin/attendance/month-baseline — revert a bulk baseline run
// Removes all source='baseline' records for month/year EXCEPT for employees
// matching keep_name (partial case-insensitive name match).
router.delete('/month-baseline', async (req, res) => {
  try {
    const { month, year, keep_name } = req.body;
    const m = parseInt(month);
    const y = parseInt(year);
    if (!m || !y) return res.status(400).json({ error: 'month and year are required' });

    let keepId = null;
    if (keep_name) {
      const { rows } = await query(
        `SELECT id FROM users WHERE company_id=$1 AND LOWER(name) LIKE $2 AND is_active=TRUE LIMIT 1`,
        [req.user.company_id, `%${keep_name.toLowerCase()}%`]
      );
      if (rows.length) keepId = rows[0].id;
    }

    const result = await query(
      `DELETE FROM hr_attendance
       WHERE company_id = $1
         AND source = 'baseline'
         AND EXTRACT(MONTH FROM attendance_date) = $2
         AND EXTRACT(YEAR  FROM attendance_date) = $3
         ${keepId ? 'AND user_id != $4' : ''}`,
      keepId ? [req.user.company_id, m, y, keepId] : [req.user.company_id, m, y]
    );

    res.json({
      deleted: result.rowCount,
      kept_employee: keepId ? keep_name : null,
      month: m,
      year: y,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════
// GET /timesheet-report — Daily site timesheet (Overall sheet format)
// ?date=YYYY-MM-DD&category=staff|labour|all&department_id=
// ═══════════════════════════════════════════════════════════
router.get('/timesheet-report', async (req, res) => {
  try {
    const { date, category = 'staff', department_id, project_id } = req.query;
    const reportDate = date || new Date().toISOString().slice(0, 10);
    const cid = req.user.company_id;

    let roleFilter = '';
    // No role filter — all active employees appear in the timesheet regardless of system role

    // BCIM Staff (office/management) vs BCIM Workers (direct-hire labour) are both
    // rows in users/employee_profiles, distinguished only by employee_category.
    let categoryFilter = '';
    if (category === 'staff') {
      categoryFilter = ` AND COALESCE(ep.employee_category, 'staff') = 'staff'`;
    } else if (category === 'labour') {
      categoryFilter = ` AND ep.employee_category = 'workman'`;
    }
    // category === 'all' → no filter, every employee_category included

    // For project-scoped roles use their project; for HR roles use explicit filter if provided
    const scopeProjectId = await getProjectScope(req);
    const effectiveProjectId = project_id || scopeProjectId;

    let deptFilter = '';
    let projectFilter = '';
    const params = [cid, reportDate];
    let idx = 3;
    if (department_id) {
      deptFilter = ` AND ep.department_id = $${idx}`;
      params.push(department_id);
      idx++;
    }
    if (effectiveProjectId === 'HEAD_OFFICE') {
      projectFilter = ` AND ep.project_id IS NULL`;
    } else if (effectiveProjectId) {
      projectFilter = ` AND ep.project_id = $${idx}`;
      params.push(effectiveProjectId);
      idx++;
    }

    // Fetch company name and project name for the print header
    const [companyRes, projectRes] = await Promise.all([
      query(`SELECT name FROM companies WHERE id=$1`, [cid]),
      effectiveProjectId && effectiveProjectId !== 'HEAD_OFFICE'
        ? query(`SELECT name, project_code FROM projects WHERE id=$1`, [effectiveProjectId])
        : Promise.resolve({ rows: [] }),
    ]);
    const companyName  = companyRes.rows[0]?.name  || 'BCIM';
    const projectName  = effectiveProjectId === 'HEAD_OFFICE' ? 'Head Office' : (projectRes.rows[0]?.name || null);
    const projectCode  = effectiveProjectId === 'HEAD_OFFICE' ? 'HO' : (projectRes.rows[0]?.project_code || null);

    // Is the report date a public holiday?
    const holidayRes = await query(
      `SELECT name FROM hr_holidays WHERE company_id=$1 AND holiday_date::date=$2::date LIMIT 1`,
      [cid, reportDate]
    ).catch(() => ({ rows: [] }));
    const holidayName = holidayRes.rows[0]?.name || null;
    const isSunday    = new Date(reportDate + 'T00:00:00').getDay() === 0;
    // Employees with no punch on a Sunday/holiday are week_off/holiday, not absent
    const noRecordStatus = holidayName ? 'holiday' : (isSunday ? 'week_off' : 'absent');

    // ── Staff query ─────────────────────────────────────────────────────────────
    const staffParams = [...params, ALWAYS_PRESENT_USER_IDS];
    const alwaysPresentIdx = staffParams.length;
    const staffRows = (await query(`
      SELECT
        u.employee_code                     AS emp_id,
        u.name,
        COALESCE(des.name, u.designation, '—')             AS designation,
        COALESCE(dep.name, u.department, '—')              AS department,
        CASE
          WHEN ep.contractor_name IS NOT NULL AND TRIM(ep.contractor_name) <> ''
               AND UPPER(TRIM(ep.contractor_name)) <> 'BCIM'
            THEN ep.contractor_name
          WHEN COALESCE(ep.employee_category,'staff') = 'workman' THEN 'BCIM WORKERS'
          ELSE 'BCIM STAFF'
        END AS company,
        ep.trade                            AS trade,
        COALESCE(proj.name, 'Head Office')  AS project_name,
        COALESCE(proj.id::text, 'HEAD_OFFICE') AS project_id,
        CASE
          WHEN a.status IS NOT NULL THEN a.status
          WHEN u.id = ANY($${alwaysPresentIdx}::uuid[]) THEN 'present'
          ELSE '${noRecordStatus}'
        END AS attendance_status,
        TO_CHAR(a.in_time,  'HH12:MI AM')  AS in_time,
        TO_CHAR(a.out_time, 'HH12:MI AM')  AS out_time,
        a.late_minutes,
        a.remarks                           AS reason,
        -- ep.work_location is free text set manually alongside project_id and
        -- goes stale on transfer (10 employees currently show a work_location
        -- string from a project they were moved off months ago). proj.name is
        -- always in sync with the current assignment, so prefer it; only fall
        -- back to the stale text for anyone with no project_id (e.g. Head
        -- Office staff, where work_location legitimately isn't a project name).
        COALESCE(a.site, proj.name, ep.work_location, '—') AS location,
        COALESCE(a.shift, 'DAY')            AS shift,
        a.eng_fm_ch_cm                      AS eng_fm_ch_cm,
        a.incharge_name                     AS incharge_name,
        a.tower_incharge                    AS tower_incharge,
        CASE WHEN COALESCE(ep.employment_status,'active') = 'active'
             THEN 'ACTIVE' ELSE 'INACTIVE' END AS status,
        u.id::text                          AS user_id,
        CASE WHEN COALESCE(ep.employee_category,'staff') = 'workman'
             THEN 'workman' ELSE 'staff' END AS row_type,
        CASE WHEN a.in_time IS NOT NULL AND a.out_time IS NOT NULL AND a.out_time > a.in_time
             THEN ROUND(EXTRACT(EPOCH FROM (a.out_time - a.in_time)) / 3600.0, 1)
             ELSE 0 END                     AS hours_worked,
        CASE WHEN a.in_time IS NOT NULL AND a.out_time IS NOT NULL AND a.out_time > a.in_time
             THEN GREATEST(0, ROUND(EXTRACT(EPOCH FROM (a.out_time - a.in_time)) / 3600.0 - 9, 1))
             ELSE 0 END                     AS overtime_hours
      FROM users u
      LEFT JOIN employee_profiles ep   ON ep.user_id = u.id
      LEFT JOIN hr_departments dep     ON dep.id = ep.department_id
      LEFT JOIN hr_designations des    ON des.id = ep.designation_id
      LEFT JOIN projects proj          ON proj.id = ep.project_id
      LEFT JOIN hr_attendance a        ON a.user_id = u.id
                                     AND a.attendance_date = $2
                                     AND a.company_id = $1
      WHERE u.company_id = $1
        AND u.is_active = TRUE
        AND COALESCE(ep.employment_status, 'active') NOT IN ('resigned','terminated','absconded')
        -- This report unions staff with sc_workers below. ~80 site labourers
        -- exist in BOTH tables, so without this they print twice and inflate
        -- headcount and man-hours. When someone is on the SC roster, the SC
        -- query owns them; drop them here rather than relying on their HR
        -- status happening to be non-active.
        AND NOT EXISTS (
          SELECT 1 FROM sc_workers w
          WHERE w.company_id = u.company_id AND w.worker_code = u.employee_code
        )
        ${roleFilter}
        ${categoryFilter}
        ${deptFilter}
        ${projectFilter}
      ORDER BY proj.name NULLS LAST, dep.name NULLS LAST, u.name
    `, staffParams)).rows;

    // ── SC Workers (Labour) query ─────────────────────────────────────────────
    let scRows = [];
    if (category === 'labour' || category === 'all') {
      const scParams = [cid, reportDate];
      let scProjectFilter = '';
      let scPIdx = 3;
      if (effectiveProjectId === 'HEAD_OFFICE') {
        scProjectFilter = ' AND 1=0'; // no SC workers in head office
      } else if (effectiveProjectId) {
        scProjectFilter = ` AND w.project_id = $${scPIdx++}`;
        scParams.push(effectiveProjectId);
      }
      scRows = (await query(`
        SELECT
          w.worker_code                       AS emp_id,
          w.worker_name                       AS name,
          w.skill_type                        AS designation,
          'CIVIL'                             AS department,
          sc.name                             AS company,
          w.skill_type                        AS trade,
          COALESCE(p.name, 'Head Office')        AS project_name,
          COALESCE(p.id::text, 'HEAD_OFFICE')    AS project_id,
          COALESCE(a.status, '${noRecordStatus}') AS attendance_status,
          TO_CHAR(a.in_time,  'HH12:MI AM')      AS in_time,
          TO_CHAR(a.out_time, 'HH12:MI AM')      AS out_time,
          0                                      AS late_minutes,
          a.remarks                              AS reason,
          COALESCE(p.name, '—')                AS location,
          'DAY'                                  AS shift,
          NULL::text                             AS eng_fm_ch_cm,
          NULL::text                             AS incharge_name,
          NULL::text                             AS tower_incharge,
          CASE WHEN w.status = 'active' THEN 'ACTIVE' ELSE 'INACTIVE' END AS status,
          w.id::text                             AS user_id,
          'labour'                               AS row_type,
          COALESCE(a.hours_worked, 0)            AS hours_worked,
          GREATEST(0, COALESCE(a.hours_worked,0) - 8) AS overtime_hours
        FROM sc_workers w
        LEFT JOIN sc_subcontractors sc ON sc.id = w.sc_id
        LEFT JOIN projects p           ON p.id  = w.project_id
        LEFT JOIN sc_attendance a      ON a.worker_id = w.id
                                     AND a.attendance_date = $2
                                     AND a.company_id = $1
        WHERE w.company_id = $1
          AND w.status = 'active'
          ${scProjectFilter}
        ORDER BY sc.name, w.worker_name
      `, scParams)).rows;
    }

    const rows = [...staffRows, ...scRows];

    const present  = rows.filter(r => r.attendance_status === 'present').length;
    const half     = rows.filter(r => r.attendance_status === 'half_day').length;
    const absent   = rows.filter(r => r.attendance_status === 'absent').length;
    const leave    = rows.filter(r => r.attendance_status === 'leave').length;
    const week_off = rows.filter(r => r.attendance_status === 'week_off').length;
    const holiday  = rows.filter(r => r.attendance_status === 'holiday').length;
    const late     = rows.filter(r => (r.late_minutes || 0) > 0).length;

    res.json({
      data:        rows,
      date:        reportDate,
      companyName,
      projectName,
      projectCode,
      holidayName,
      isSunday,
      summary: { total: rows.length, present, half, absent, leave, week_off, holiday, late },
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /timesheet-report/test-email — sends today's timesheet PDF+summary to
// the LOGGED-IN USER's own email only, never to the real recipient list,
// purely to preview what the automated send will look like.
router.post('/timesheet-report/test-email', async (req, res) => {
  try {
    if (!req.user.email) return res.status(400).json({ error: 'Your account has no email address on file.' });
    const { runTimesheetReport } = require('../utils/timesheet-report.service');
    const result = await runTimesheetReport({
      date: req.body.date,
      manual: true,
      recipients: [req.user.email],
      company_id: req.user.company_id,
      project_id: req.body.project_id,
      project_name: req.body.project_name,
      category: req.body.category || 'staff',
    });
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /timesheet-report/send-to-client — super_admin only. Sends the
// currently-viewed report (date/project/category as shown on screen) straight
// to a client-supplied recipient list, on demand — distinct from the
// scheduled per-project configs, which need to be set up ahead of time.
router.post('/timesheet-report/send-to-client', authorize('super_admin'), async (req, res) => {
  try {
    const { date, project_id, project_name, category, recipients } = req.body;
    const recipientList = String(recipients || '').split(/[;,]/).map(v => v.trim()).filter(Boolean);
    if (!recipientList.length) return res.status(400).json({ error: 'At least one recipient email is required' });

    const { runTimesheetReport } = require('../utils/timesheet-report.service');
    const result = await runTimesheetReport({
      date,
      manual: true,
      recipients: recipientList,
      company_id: req.user.company_id,
      project_id,
      project_name,
      category: category || 'staff',
    });
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════
// Timesheet report project configs — one row per (project, category) that
// should get its own daily automated email + recipient list.
// ═══════════════════════════════════════════════════════════
router.get('/timesheet-report/configs', async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT * FROM timesheet_report_configs WHERE company_id=$1 ORDER BY project_name`,
      [req.user.company_id]
    );
    res.json({ data: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/timesheet-report/configs', async (req, res) => {
  try {
    const { project_id, project_name, category = 'staff', recipients, enabled = true } = req.body;
    if (!project_name || !recipients) return res.status(400).json({ error: 'project_name and recipients are required' });
    const { rows } = await query(
      `INSERT INTO timesheet_report_configs (company_id, project_id, project_name, category, recipients, enabled, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [req.user.company_id, project_id || null, project_name, category, recipients, enabled, req.user.id]
    );
    res.status(201).json({ data: rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/timesheet-report/configs/:id', async (req, res) => {
  try {
    const { project_id, project_name, category, recipients, enabled } = req.body;
    const { rows } = await query(
      `UPDATE timesheet_report_configs
       SET project_id=COALESCE($1,project_id), project_name=COALESCE($2,project_name),
           category=COALESCE($3,category), recipients=COALESCE($4,recipients),
           enabled=COALESCE($5,enabled), updated_at=NOW()
       WHERE id=$6 AND company_id=$7 RETURNING *`,
      [project_id, project_name, category, recipients, enabled, req.params.id, req.user.company_id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Config not found' });
    res.json({ data: rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /timesheet-report/configs/:id/send-now — sends today's report to the
// config's REAL recipients immediately, rather than waiting for the
// scheduled automated send. Distinct from /test-email, which always
// redirects to the caller's own inbox.
router.post('/timesheet-report/configs/:id/send-now', async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT * FROM timesheet_report_configs WHERE id=$1 AND company_id=$2`,
      [req.params.id, req.user.company_id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Config not found' });
    const cfg = rows[0];

    const { runTimesheetReport } = require('../utils/timesheet-report.service');
    const result = await runTimesheetReport({
      date: req.body.date,
      manual: true,
      company_id: cfg.company_id,
      project_id: cfg.project_id,
      project_name: cfg.project_name,
      category: cfg.category,
      recipients: cfg.recipients,
    });
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/timesheet-report/configs/:id', async (req, res) => {
  try {
    const { rowCount } = await query(
      `DELETE FROM timesheet_report_configs WHERE id=$1 AND company_id=$2`,
      [req.params.id, req.user.company_id]
    );
    if (!rowCount) return res.status(404).json({ error: 'Config not found' });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════
// GET /manpower-report  ?date=YYYY-MM-DD&project_id=
// Overall Daily Manpower Report — pivot of Company × Designation
// against Site × Shift, headcount = present employees that day.
// ═══════════════════════════════════════════════════════════
const SITE_BUCKETS = [
  { key: 'tower',  label: 'Tower',  match: s => s.includes('tower') },
  { key: 'stp',    label: 'STP',    match: s => s.includes('stp') },
  { key: 'ug',     label: 'UG',     match: s => s.includes('ug') },
  { key: 'store',  label: 'Store',  match: s => s.includes('store') },
  { key: 'labour', label: 'Labour', match: s => s.includes('labour') || s.includes('camp') },
  { key: 'staff',  label: 'Staff',  match: s => s.includes('staff') || s === '' || s === '—' },
];
function bucketSite(raw) {
  const s = String(raw || '').trim().toLowerCase();
  for (const b of SITE_BUCKETS) if (b.match(s)) return b;
  return { key: 'other', label: 'Other' };
}

router.get('/manpower-report', async (req, res) => {
  try {
    const { date, project_id } = req.query;
    const reportDate = date || new Date().toISOString().slice(0, 10);
    const cid = req.user.company_id;

    const scopeProjectId = await getProjectScope(req);
    const effectiveProjectId = project_id || scopeProjectId;

    // ── ERP users (BCIM staff + direct-hire workmen) ─────────────────────────
    const staffParams = [cid, reportDate];
    let staffProjectFilter = '';
    if (effectiveProjectId === 'HEAD_OFFICE') {
      staffProjectFilter = ' AND ep.project_id IS NULL';
    } else if (effectiveProjectId) {
      staffProjectFilter = ' AND ep.project_id = $3';
      staffParams.push(effectiveProjectId);
    }

    const staffRes = await query(`
      SELECT
        UPPER(TRIM(CASE
          WHEN ep.contractor_name IS NOT NULL AND TRIM(ep.contractor_name) <> ''
               AND UPPER(TRIM(ep.contractor_name)) <> 'BCIM'
            THEN ep.contractor_name
          WHEN COALESCE(ep.employee_category,'staff') = 'workman' THEN 'BCIM WORKERS'
          ELSE 'BCIM STAFF'
        END)) AS company,
        COALESCE(des.name, u.designation, '—')       AS designation,
        COALESCE(a.site, '')                              AS site,
        COALESCE(a.shift, 'DAY')                          AS shift,
        COUNT(*)::int                                     AS headcount
      FROM hr_attendance a
      JOIN users u                  ON u.id = a.user_id
      LEFT JOIN employee_profiles ep ON ep.user_id = u.id
      LEFT JOIN hr_designations des  ON des.id = ep.designation_id
      WHERE a.company_id = $1 AND a.attendance_date = $2 AND a.status = 'present'
        ${staffProjectFilter}
      GROUP BY
        UPPER(TRIM(CASE
          WHEN ep.contractor_name IS NOT NULL AND TRIM(ep.contractor_name) <> ''
               AND UPPER(TRIM(ep.contractor_name)) <> 'BCIM'
            THEN ep.contractor_name
          WHEN COALESCE(ep.employee_category,'staff') = 'workman' THEN 'BCIM WORKERS'
          ELSE 'BCIM STAFF'
        END)),
        COALESCE(des.name, u.designation, '—'),
        a.site, a.shift
    `, staffParams);

    const rows = staffRes.rows;

    // Pivot in JS: rows keyed by company+designation, columns = site bucket + shift
    const rowMap = {};
    const colSet = {};       // bucketKey -> { label, shifts:Set }
    for (const r of rows) {
      const bucket = bucketSite(r.site);
      if (!colSet[bucket.key]) colSet[bucket.key] = { label: bucket.label, shifts: new Set() };
      colSet[bucket.key].shifts.add(r.shift);

      const rowKey = `${r.company}||${r.designation}`;
      if (!rowMap[rowKey]) rowMap[rowKey] = { company: r.company, designation: r.designation, cells: {}, total: 0 };
      const cellKey = `${bucket.key}|${r.shift}`;
      rowMap[rowKey].cells[cellKey] = (rowMap[rowKey].cells[cellKey] || 0) + r.headcount;
      rowMap[rowKey].total += r.headcount;
    }

    // Order columns: Tower, STP, UG, Store, Labour, Staff, Other (skip buckets with no data)
    const bucketOrder = [...SITE_BUCKETS.map(b => b.key), 'other'];
    const columns = bucketOrder
      .filter(k => colSet[k])
      .map(k => ({ key: k, label: colSet[k].label, shifts: [...colSet[k].shifts].sort() }));

    // Order rows: by company (first-seen order), then designation (first-seen order)
    const companyOrder = [];
    for (const r of rows) if (!companyOrder.includes(r.company)) companyOrder.push(r.company);
    const dataRows = Object.values(rowMap).sort((a, b) => {
      const ci = companyOrder.indexOf(a.company) - companyOrder.indexOf(b.company);
      return ci !== 0 ? ci : 0;
    });

    const grandTotal = dataRows.reduce((s, r) => s + r.total, 0);

    res.json({ date: reportDate, columns, rows: dataRows, grandTotal });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /manpower-report/test-email — sends today's manpower report PDF+summary
// to the LOGGED-IN USER's own email only, never to the real client list, purely
// to preview what the automated 10 AM send will look like.
// Optional project_id/project_name in the body previews a specific project's
// config instead of the legacy env-configured default.
router.post('/manpower-report/test-email', async (req, res) => {
  try {
    if (!req.user.email) return res.status(400).json({ error: 'Your account has no email address on file.' });
    const { runManpowerClientReport } = require('../utils/manpower-client-report.service');
    const result = await runManpowerClientReport({
      date: req.body.date,
      manual: true,
      recipients: [req.user.email],
      project_id: req.body.project_id,
      project_name: req.body.project_name,
    });
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════
// Manpower report project configs — one row per project that should get
// its own daily automated email + recipient list.
// ═══════════════════════════════════════════════════════════
router.get('/manpower-report/configs', async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT * FROM manpower_report_configs WHERE company_id=$1 ORDER BY project_name`,
      [req.user.company_id]
    );
    res.json({ data: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/manpower-report/configs', async (req, res) => {
  try {
    const { project_id, project_name, recipients, enabled = true } = req.body;
    if (!project_name || !recipients) return res.status(400).json({ error: 'project_name and recipients are required' });
    const { rows } = await query(
      `INSERT INTO manpower_report_configs (company_id, project_id, project_name, recipients, enabled, created_by)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [req.user.company_id, project_id || null, project_name, recipients, enabled, req.user.id]
    );
    res.status(201).json({ data: rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/manpower-report/configs/:id', async (req, res) => {
  try {
    const { project_id, project_name, recipients, enabled } = req.body;
    const { rows } = await query(
      `UPDATE manpower_report_configs
       SET project_id=COALESCE($1,project_id), project_name=COALESCE($2,project_name),
           recipients=COALESCE($3,recipients), enabled=COALESCE($4,enabled), updated_at=NOW()
       WHERE id=$5 AND company_id=$6 RETURNING *`,
      [project_id, project_name, recipients, enabled, req.params.id, req.user.company_id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Config not found' });
    res.json({ data: rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /manpower-report/configs/:id/send-now — sends today's report to the
// config's REAL recipients immediately, rather than waiting for the 10 AM
// automated send. Distinct from /test-email, which always redirects to the
// caller's own inbox.
router.post('/manpower-report/configs/:id/send-now', async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT * FROM manpower_report_configs WHERE id=$1 AND company_id=$2`,
      [req.params.id, req.user.company_id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Config not found' });
    const cfg = rows[0];

    const { runManpowerClientReport } = require('../utils/manpower-client-report.service');
    const result = await runManpowerClientReport({
      date: req.body.date,
      manual: true,
      company_id: cfg.company_id,
      project_id: cfg.project_id,
      project_name: cfg.project_name,
      recipients: cfg.recipients,
    });
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/manpower-report/configs/:id', async (req, res) => {
  try {
    const { rowCount } = await query(
      `DELETE FROM manpower_report_configs WHERE id=$1 AND company_id=$2`,
      [req.params.id, req.user.company_id]
    );
    if (!rowCount) return res.status(404).json({ error: 'Config not found' });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════
// GET /monthly-report  ?year=2026&month=7&project_id=&department_id=
// Returns one row per (employee, date) for the whole month
// ═══════════════════════════════════════════════════════════
router.get('/monthly-report', async (req, res) => {
  try {
    const { year, month, project_id, department_id, category = 'all' } = req.query;
    const cid = req.user.company_id;
    if (!year || !month) return res.status(400).json({ error: 'year and month required' });

    const y = parseInt(year), m = parseInt(month);
    const from = `${y}-${String(m).padStart(2,'0')}-01`;
    const lastDay = new Date(y, m, 0).getDate();
    const to = `${y}-${String(m).padStart(2,'0')}-${String(lastDay).padStart(2,'0')}`;

    const scopeProjectId = await getProjectScope(req);
    const effProject = project_id || scopeProjectId;

    // BCIM Staff (office/management) vs BCIM Workers (direct-hire labour) are both
    // rows in users/employee_profiles, distinguished only by employee_category.
    let categoryFilter = '';
    if (category === 'staff') {
      categoryFilter = ` AND COALESCE(ep.employee_category, 'staff') = 'staff'`;
    } else if (category === 'labour') {
      categoryFilter = ` AND ep.employee_category = 'workman'`;
    }
    // category === 'all' → no filter, every employee_category included

    const staffParams = [cid, from, to];
    let deptFilter = '', projFilter = '';
    let idx = 4;
    if (department_id) { deptFilter = ` AND ep.department_id=$${idx++}`; staffParams.push(department_id); }
    if (effProject)    { projFilter = ` AND ep.project_id=$${idx++}`;    staffParams.push(effProject); }

    const staffRes = await query(`
      SELECT
        u.employee_code                        AS emp_id,
        u.name,
        COALESCE(des.name, u.designation, '—') AS designation,
        COALESCE(dep.name, u.department,
          CASE WHEN COALESCE(ep.employee_category,'staff') = 'workman'
               THEN 'BCIM Workers' ELSE '—' END)  AS department,
        CASE
          WHEN ep.contractor_name IS NOT NULL AND TRIM(ep.contractor_name) <> ''
               AND UPPER(TRIM(ep.contractor_name)) <> 'BCIM'
            THEN ep.contractor_name
          WHEN COALESCE(ep.employee_category,'staff') = 'workman' THEN 'BCIM WORKERS'
          ELSE 'BCIM STAFF'
        END AS company,
        a.attendance_date::text                AS attendance_date,
        COALESCE(a.status, 'absent')           AS attendance_status,
        TO_CHAR(a.in_time,  'HH12:MI AM')     AS in_time,
        TO_CHAR(a.out_time, 'HH12:MI AM')     AS out_time,
        COALESCE(a.late_minutes, 0)            AS late_minutes,
        CASE WHEN COALESCE(ep.employee_category,'staff') = 'workman'
             THEN 'workman' ELSE 'staff' END    AS row_type
      FROM users u
      LEFT JOIN employee_profiles ep  ON ep.user_id = u.id
      LEFT JOIN hr_departments dep    ON dep.id = ep.department_id
      LEFT JOIN hr_designations des   ON des.id = ep.designation_id
      JOIN hr_attendance a
        ON a.user_id = u.id
       AND a.company_id = $1
       AND a.attendance_date BETWEEN $2 AND $3
      WHERE u.company_id = $1
        AND u.is_active = TRUE
        AND COALESCE(ep.employment_status, 'active') NOT IN ('resigned','terminated','absconded')
        -- unioned with sc_attendance below; drop the SC-roster duplicates
        AND NOT EXISTS (
          SELECT 1 FROM sc_workers w
          WHERE w.company_id = u.company_id AND w.worker_code = u.employee_code
        )
        ${categoryFilter}
        ${deptFilter}
        ${projFilter}
      ORDER BY dep.name NULLS LAST, u.name, a.attendance_date
    `, staffParams);

    // SC workers from sc_attendance
    const scParams = [cid, from, to];
    let scProjFilter = '';
    let scIdx = 4;
    if (effProject) { scProjFilter = ` AND w.project_id=$${scIdx++}`; scParams.push(effProject); }

    const scRes = (category === 'labour' || category === 'all') ? await query(`
      SELECT
        w.worker_code                          AS emp_id,
        w.worker_name                          AS name,
        COALESCE(w.skill_type, '—')           AS designation,
        COALESCE(sc.name, 'SC Worker')         AS department,
        COALESCE(sc.name, 'SC Worker')         AS company,
        a.attendance_date::text                AS attendance_date,
        COALESCE(a.status, 'absent')           AS attendance_status,
        TO_CHAR(a.in_time,  'HH12:MI AM')     AS in_time,
        TO_CHAR(a.out_time, 'HH12:MI AM')     AS out_time,
        0                                      AS late_minutes,
        'labour'                               AS row_type
      FROM sc_workers w
      JOIN sc_attendance a
        ON a.worker_id = w.id
       AND a.company_id = $1
       AND a.attendance_date BETWEEN $2 AND $3
      LEFT JOIN sc_subcontractors sc ON sc.id = w.sc_id
      WHERE w.company_id = $1
        AND w.status = 'active'
        ${scProjFilter}
      ORDER BY sc.name NULLS LAST, w.worker_name, a.attendance_date
    `, scParams) : { rows: [] };

    // Holidays for the month
    const holidayRes = await query(
      `SELECT holiday_date::text AS date, name AS holiday_name
       FROM hr_holidays
       WHERE company_id=$1 AND holiday_date BETWEEN $2 AND $3`,
      [cid, from, to]
    );

    res.json({
      data:     [...staffRes.rows, ...scRes.rows],
      holidays: holidayRes.rows,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/:id', async (req, res) => {
  try {
    const { status, in_time, out_time, late_minutes, remarks, shift, site, eng_fm_ch_cm, incharge_name, tower_incharge } = req.body;
    const { rows } = await query(
      `UPDATE hr_attendance SET status=$1, in_time=$2, out_time=$3, late_minutes=$4, remarks=$5,
         shift=COALESCE($8,shift), site=COALESCE($9,site), eng_fm_ch_cm=COALESCE($10,eng_fm_ch_cm),
         incharge_name=COALESCE($11,incharge_name), tower_incharge=COALESCE($12,tower_incharge)
       WHERE id=$6 AND company_id=$7 RETURNING *`,
      [status, in_time || null, out_time || null, late_minutes || 0, remarks || null,
       req.params.id, req.user.company_id,
       shift || null, site || null, eng_fm_ch_cm || null, incharge_name || null, tower_incharge || null]
    );
    res.json({ data: rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════
// UPSERT SINGLE (by user_id + date)
// ═══════════════════════════════════════════════════════════
router.post('/', async (req, res) => {
  try {
    const { user_id, attendance_date, status, in_time, out_time, late_minutes, remarks,
      shift, site, eng_fm_ch_cm, incharge_name, tower_incharge } = req.body;
    const { rows } = await query(
      `INSERT INTO hr_attendance (user_id, company_id, attendance_date, status, in_time, out_time, late_minutes, remarks,
         shift, site, eng_fm_ch_cm, incharge_name, tower_incharge)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       ON CONFLICT (user_id, attendance_date)
       DO UPDATE SET status=$4, in_time=$5, out_time=$6, late_minutes=$7, remarks=$8,
         shift=COALESCE($9,hr_attendance.shift), site=COALESCE($10,hr_attendance.site),
         eng_fm_ch_cm=COALESCE($11,hr_attendance.eng_fm_ch_cm),
         incharge_name=COALESCE($12,hr_attendance.incharge_name),
         tower_incharge=COALESCE($13,hr_attendance.tower_incharge)
       RETURNING *`,
      [user_id, req.user.company_id, attendance_date, status || 'present',
       in_time || null, out_time || null, late_minutes || 0, remarks || null,
       shift || null, site || null, eng_fm_ch_cm || null, incharge_name || null, tower_incharge || null]
    );
    res.status(201).json({ data: rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════
// LATE ARRIVAL EMAIL ALERTS
// POST /hr-admin/attendance/late-alerts/run
// ═══════════════════════════════════════════════════════════
router.post('/late-alerts/run', async (req, res) => {
  try {
    const { sendLateArrivalAlerts } = require('../utils/late-arrival-alert.service');
    const { date, minLateMinutes, dryRun } = req.body;
    const result = await sendLateArrivalAlerts({
      date,
      companyId: req.user.company_id,
      minLateMinutes: minLateMinutes ?? 5,
      dryRun: dryRun ?? false,
    });
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /hr-admin/attendance/late-alerts/test
// Sends ONE sample late-arrival email to the logged-in user, using their own
// most recent late record (or representative sample data if they have none) —
// purely to preview the alert in your inbox. Never emails anyone else.
router.post('/late-alerts/test', async (req, res) => {
  try {
    const { buildLateEmail } = require('../utils/late-arrival-alert.service');
    const { sendMail } = require('../services/mail.service');

    if (!req.user.email) return res.status(400).json({ error: 'Your account has no email address on file.' });

    // Most recent real late record for the caller, if any.
    const { rows } = await query(`
      SELECT a.attendance_date, a.in_time, a.late_minutes,
             u.name AS employee_name, u.employee_code, c.name AS company_name
      FROM hr_attendance a
      JOIN users u ON u.id = a.user_id
      LEFT JOIN companies c ON c.id = a.company_id
      WHERE a.user_id = $1 AND COALESCE(a.late_minutes, 0) > 0
      ORDER BY a.attendance_date DESC
      LIMIT 1
    `, [req.user.id]);

    const rec = rows[0];
    const usedRealRecord = !!rec;

    // Fall back to a representative sample so the preview always renders.
    const companyRes = rec ? null : await query(`SELECT name FROM companies WHERE id = $1`, [req.user.company_id]);
    const data = rec ? {
      employeeName: rec.employee_name,
      employeeCode: rec.employee_code,
      date:         rec.attendance_date,
      checkInTime:  rec.in_time,
      lateMinutes:  rec.late_minutes,
      companyName:  rec.company_name || 'BCIM',
    } : {
      employeeName: req.user.name || 'Employee',
      employeeCode: req.user.employee_code || '—',
      date:         new Date().toISOString().slice(0, 10),
      checkInTime:  '09:55',
      lateMinutes:  25,
      companyName:  companyRes?.rows?.[0]?.name || 'BCIM',
    };

    const mail = buildLateEmail(data);
    await sendMail({ to: req.user.email, subject: `[TEST] ${mail.subject}`, html: mail.html, text: mail.text });

    res.json({
      ok: true,
      sentTo: req.user.email,
      usedRealRecord,
      basedOn: usedRealRecord
        ? { date: data.date, lateMinutes: data.lateMinutes, checkIn: data.checkInTime }
        : 'sample data (no late record found on your attendance)',
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════
// LATE SUMMARY — HR Manager daily digest (manual trigger)
// POST /hr-admin/attendance/late-summary/run
// Body: { date?, recipients? }   (optional overrides)
// ═══════════════════════════════════════════════════════════
router.post('/late-summary/run', authorize('super_admin','admin','hr','hr_admin','hr_manager'), async (req, res) => {
  try {
    const { runLateSummary } = require('../utils/hr-late-summary.service');
    const { date, recipients } = req.body;
    const result = await runLateSummary({ date: date || undefined, manual: true, recipients: recipients || undefined });
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════
// ABSENT SUMMARY — HR Manager daily digest (manual trigger)
// POST /hr-admin/attendance/absent-summary/run
// Body: { date?, recipients? }   (optional overrides)
// ═══════════════════════════════════════════════════════════
router.post('/absent-summary/run', authorize('super_admin','admin','hr','hr_admin','hr_manager'), async (req, res) => {
  try {
    const { runAbsentSummary } = require('../utils/hr-absent-summary.service');
    const { date, recipients } = req.body;
    const result = await runAbsentSummary({ date: date || undefined, manual: true, recipients: recipients || undefined });
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════
// RECALCULATE ATTENDANCE
// POST /hr-admin/attendance/recalculate  { from, to }
// Re-derives status/late_minutes from stored in_time/out_time for both staff and SC workers
// ═══════════════════════════════════════════════════════════
router.post('/recalculate', async (req, res) => {
  try {
    const { from, to } = req.body;
    if (!from || !to) return res.status(400).json({ error: 'from and to dates are required' });
    if (from > to)    return res.status(400).json({ error: 'from must be before to' });

    const cid = req.user.company_id;

    // Staff — re-derive status and late_minutes from in_time/out_time
    // Leave/holiday/week_off records are preserved
    const staffResult = await query(`
      UPDATE hr_attendance ha
      SET
        status = CASE
          WHEN ha.status IN ('leave','holiday','week_off') THEN ha.status
          WHEN ha.in_time IS NOT NULL AND ha.out_time IS NOT NULL
               AND ha.out_time != ha.in_time THEN 'present'
          WHEN ha.in_time IS NOT NULL OR ha.out_time IS NOT NULL THEN 'present'
          ELSE 'absent'
        END,
        late_minutes = CASE
          WHEN ha.status IN ('leave','holiday','week_off') THEN ha.late_minutes
          WHEN ha.in_time IS NOT NULL THEN
            GREATEST(0, EXTRACT(EPOCH FROM (
              ha.in_time::time - COALESCE(
                (SELECT (hs.start_time + (COALESCE(hs.grace_minutes,0) * INTERVAL '1 minute'))::time
                 FROM hr_employee_shifts es
                 JOIN hr_shifts hs ON hs.id = es.shift_id
                 WHERE es.employee_id = ha.user_id
                   AND es.effective_from <= ha.attendance_date
                   AND (es.effective_to IS NULL OR es.effective_to >= ha.attendance_date)
                 ORDER BY es.effective_from DESC LIMIT 1),
                '09:30:00'::time
              )
            )) / 60)::int
          ELSE 0
        END
      FROM users u
      WHERE ha.user_id = u.id
        AND u.company_id = $1
        AND ha.attendance_date BETWEEN $2 AND $3
      RETURNING ha.id
    `, [cid, from, to]);

    // SC workers — re-derive status and hours_worked from in_time/out_time
    const scResult = await query(`
      UPDATE sc_attendance sa
      SET
        status = CASE
          WHEN sa.in_time IS NOT NULL AND sa.out_time IS NOT NULL
               AND sa.out_time != sa.in_time THEN 'present'
          WHEN sa.in_time IS NOT NULL OR sa.out_time IS NOT NULL THEN 'present'
          ELSE sa.status
        END,
        hours_worked = CASE
          WHEN sa.in_time IS NOT NULL AND sa.out_time IS NOT NULL
               AND sa.out_time != sa.in_time THEN
            LEAST(12.0, ROUND(EXTRACT(EPOCH FROM (sa.out_time - sa.in_time)) / 3600.0, 2))
          ELSE sa.hours_worked
        END
      FROM sc_workers w
      WHERE sa.worker_id = w.id
        AND w.company_id = $1
        AND sa.attendance_date BETWEEN $2 AND $3
      RETURNING sa.id
    `, [cid, from, to]);

    res.json({
      updated:       staffResult.rows.length + scResult.rows.length,
      staff_updated: staffResult.rows.length,
      sc_updated:    scResult.rows.length,
      from, to,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;

