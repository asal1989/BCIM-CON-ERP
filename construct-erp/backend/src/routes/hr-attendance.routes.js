// src/routes/hr-attendance.routes.js
// Salaried employee attendance (separate from site workers)
const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const { query } = require('../config/database');
const { runSchemaInit } = require('../utils/schemaInit');

router.use(authenticate);
router.use(authorize('super_admin', 'admin', 'hr', 'hr_admin', 'hr_manager', 'manager', 'department_head', 'project_manager', 'project_head'));

// Full HR roles see all employees; project/dept roles see only their project
const FULL_HR_ROLES = new Set(['super_admin', 'admin', 'hr', 'hr_admin', 'hr_manager']);

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
// /summary — grouped by department for a date range, includes staff + SC workers
router.get('/summary', async (req, res) => {
  try {
    const { from, to, project_id } = req.query;
    const cid = req.user.company_id;
    const scopeProject = await getProjectScope(req);
    const effProject = scopeProject !== null ? scopeProject : (project_id || null);

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
    const scopeProject = await getProjectScope(req);
    const effProject = scopeProject !== null ? scopeProject : (project_id || null);

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
      WHERE u.company_id = $1 AND u.is_active = TRUE`;
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

    // For project-scoped roles use their project; for HR roles use explicit filter if provided
    const scopeProjectId = await getProjectScope(req);
    const effectiveProjectId = scopeProjectId !== null ? scopeProjectId : (project_id || null);

    let deptFilter = '';
    let projectFilter = '';
    const params = [cid, reportDate];
    let idx = 3;
    if (department_id) {
      deptFilter = ` AND ep.department_id = $${idx}`;
      params.push(department_id);
      idx++;
    }
    if (effectiveProjectId) {
      projectFilter = ` AND ep.project_id = $${idx}`;
      params.push(effectiveProjectId);
      idx++;
    }

    // Fetch company name and project name for the print header
    const [companyRes, projectRes] = await Promise.all([
      query(`SELECT name FROM companies WHERE id=$1`, [cid]),
      effectiveProjectId
        ? query(`SELECT name, project_code FROM projects WHERE id=$1`, [effectiveProjectId])
        : Promise.resolve({ rows: [] }),
    ]);
    const companyName  = companyRes.rows[0]?.name  || 'BCIM';
    const projectName  = projectRes.rows[0]?.name  || null;
    const projectCode  = projectRes.rows[0]?.project_code || null;

    // ── Staff query ─────────────────────────────────────────────────────────────
    const staffParams = [...params];
    const staffRows = category !== 'labour' ? (await query(`
      SELECT
        u.employee_code                     AS emp_id,
        u.name,
        COALESCE(des.name, u.designation, '—')             AS designation,
        COALESCE(dep.name, u.department, '—')              AS department,
        'BCIM STAFF'                        AS company,
        COALESCE(a.status, 'absent')        AS attendance_status,
        TO_CHAR(a.in_time,  'HH12:MI AM')  AS in_time,
        TO_CHAR(a.out_time, 'HH12:MI AM')  AS out_time,
        a.late_minutes,
        a.remarks                           AS reason,
        COALESCE(ep.work_location, '—')    AS location,
        'DAY'                               AS shift,
        CASE WHEN COALESCE(ep.employment_status,'active') = 'active'
             THEN 'ACTIVE' ELSE 'INACTIVE' END AS status,
        u.id::text                          AS user_id,
        'staff'                             AS row_type
      FROM users u
      LEFT JOIN employee_profiles ep   ON ep.user_id = u.id
      LEFT JOIN hr_departments dep     ON dep.id = ep.department_id
      LEFT JOIN hr_designations des    ON des.id = ep.designation_id
      LEFT JOIN hr_attendance a        ON a.user_id = u.id
                                     AND a.attendance_date = $2
                                     AND a.company_id = $1
      WHERE u.company_id = $1
        AND u.is_active = TRUE
        ${roleFilter}
        ${deptFilter}
        ${projectFilter}
      ORDER BY dep.name NULLS LAST, u.name
    `, staffParams)).rows : [];

    // ── SC Workers (Labour) query ─────────────────────────────────────────────
    let scRows = [];
    if (category === 'labour' || category === 'all') {
      const scParams = [cid, reportDate];
      let scProjectFilter = '';
      let scPIdx = 3;
      if (effectiveProjectId) {
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
          COALESCE(a.status, 'absent')        AS attendance_status,
          TO_CHAR(a.in_time,  'HH12:MI AM')   AS in_time,
          TO_CHAR(a.out_time, 'HH12:MI AM')   AS out_time,
          0                                   AS late_minutes,
          a.remarks                           AS reason,
          COALESCE(p.name, '—')              AS location,
          'DAY'                               AS shift,
          CASE WHEN w.status = 'active' THEN 'ACTIVE' ELSE 'INACTIVE' END AS status,
          w.id::text                          AS user_id,
          'labour'                            AS row_type
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

    const present = rows.filter(r => r.attendance_status === 'present').length;
    const half    = rows.filter(r => r.attendance_status === 'half_day').length;
    const absent  = rows.filter(r => r.attendance_status === 'absent').length;
    const leave   = rows.filter(r => r.attendance_status === 'leave').length;

    res.json({
      data:        rows,
      date:        reportDate,
      companyName,
      projectName,
      projectCode,
      summary: { total: rows.length, present, half, absent, leave },
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════
// GET /monthly-report  ?year=2026&month=7&project_id=&department_id=
// Returns one row per (employee, date) for the whole month
// ═══════════════════════════════════════════════════════════
router.get('/monthly-report', async (req, res) => {
  try {
    const { year, month, project_id, department_id } = req.query;
    const cid = req.user.company_id;
    if (!year || !month) return res.status(400).json({ error: 'year and month required' });

    const y = parseInt(year), m = parseInt(month);
    const from = `${y}-${String(m).padStart(2,'0')}-01`;
    const lastDay = new Date(y, m, 0).getDate();
    const to = `${y}-${String(m).padStart(2,'0')}-${String(lastDay).padStart(2,'0')}`;

    const scopeProjectId = await getProjectScope(req);
    const effProject = scopeProjectId !== null ? scopeProjectId : (project_id || null);

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
        COALESCE(dep.name, u.department, '—')  AS department,
        a.attendance_date::text                AS attendance_date,
        COALESCE(a.status, 'absent')           AS attendance_status,
        TO_CHAR(a.in_time,  'HH12:MI AM')     AS in_time,
        TO_CHAR(a.out_time, 'HH12:MI AM')     AS out_time,
        COALESCE(a.late_minutes, 0)            AS late_minutes,
        'staff'                                AS row_type
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
        ${deptFilter}
        ${projFilter}
      ORDER BY dep.name NULLS LAST, u.name, a.attendance_date
    `, staffParams);

    // SC workers from sc_attendance
    const scParams = [cid, from, to];
    let scProjFilter = '';
    let scIdx = 4;
    if (effProject) { scProjFilter = ` AND w.project_id=$${scIdx++}`; scParams.push(effProject); }

    const scRes = await query(`
      SELECT
        w.worker_code                          AS emp_id,
        w.worker_name                          AS name,
        COALESCE(w.skill_type, '—')           AS designation,
        COALESCE(sc.name, 'SC Worker')         AS department,
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
    `, scParams);

    res.json({ data: [...staffRes.rows, ...scRes.rows] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/:id', async (req, res) => {
  try {
    const { status, in_time, out_time, late_minutes, remarks } = req.body;
    const { rows } = await query(
      `UPDATE hr_attendance SET status=$1, in_time=$2, out_time=$3, late_minutes=$4, remarks=$5
       WHERE id=$6 AND company_id=$7 RETURNING *`,
      [status, in_time || null, out_time || null, late_minutes || 0, remarks || null,
       req.params.id, req.user.company_id]
    );
    res.json({ data: rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════
// UPSERT SINGLE (by user_id + date)
// ═══════════════════════════════════════════════════════════
router.post('/', async (req, res) => {
  try {
    const { user_id, attendance_date, status, in_time, out_time, late_minutes, remarks } = req.body;
    const { rows } = await query(
      `INSERT INTO hr_attendance (user_id, company_id, attendance_date, status, in_time, out_time, late_minutes, remarks)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (user_id, attendance_date)
       DO UPDATE SET status=$4, in_time=$5, out_time=$6, late_minutes=$7, remarks=$8
       RETURNING *`,
      [user_id, req.user.company_id, attendance_date, status || 'present',
       in_time || null, out_time || null, late_minutes || 0, remarks || null]
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

// ═══════════════════════════════════════════════════════════
// RECALCULATE ATTENDANCE
// POST /hr-admin/attendance/recalculate  { from, to }
// Re-derives status/late_minutes for each day in range from raw punches
// ═══════════════════════════════════════════════════════════
router.post('/recalculate', async (req, res) => {
  try {
    const { from, to } = req.body;
    if (!from || !to) return res.status(400).json({ error: 'from and to dates are required' });
    if (from > to)    return res.status(400).json({ error: 'from must be before to' });

    const cid = req.user.company_id;

    // For each hr_attendance record in range, recalculate status based on punch logs
    const result = await query(`
      UPDATE hr_attendance ha
      SET
        status = CASE
          WHEN NOT EXISTS (
            SELECT 1 FROM hr_attendance_logs l
            WHERE l.user_id = ha.user_id AND l.log_date = ha.attendance_date
          ) THEN 'absent'
          WHEN ha.status = 'absent' THEN 'present'
          ELSE ha.status
        END,
        updated_at = NOW()
      FROM users u
      WHERE ha.user_id = u.id
        AND u.company_id = $1
        AND ha.attendance_date BETWEEN $2 AND $3
      RETURNING ha.id
    `, [cid, from, to]);

    res.json({ updated: result.rows.length, from, to });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;

