// src/routes/hr-attendance.routes.js
// Salaried employee attendance (separate from site workers)
const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const { query } = require('../config/database');
const { runSchemaInit } = require('../utils/schemaInit');

router.use(authenticate);
router.use(authorize('super_admin', 'admin', 'hr', 'hr_admin', 'hr_manager', 'manager', 'department_head', 'project_manager', 'project_head'));

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
    const { user_id, month, year, department_id, date } = req.query;

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
      // single-date mode for daily punch view
      sql += ` AND a.attendance_date = $${idx}`; params.push(date); idx++;
    } else {
      const m = parseInt(month) || new Date().getMonth() + 1;
      const y = parseInt(year)  || new Date().getFullYear();
      sql += ` AND EXTRACT(MONTH FROM a.attendance_date) = $${idx} AND EXTRACT(YEAR FROM a.attendance_date) = $${idx+1}`;
      params.push(m, y); idx += 2;
    }

    if (user_id)      { sql += ` AND a.user_id=$${idx}`;       params.push(user_id);      idx++; }
    if (department_id){ sql += ` AND ep.department_id=$${idx}`; params.push(department_id); idx++; }

    sql += ' ORDER BY u.name, a.attendance_date';
    const { rows } = await query(sql, params);
    res.json({ data: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════
// SUMMARY — per employee for a month
// ═══════════════════════════════════════════════════════════
router.get('/summary', async (req, res) => {
  try {
    const { month, year, department_id } = req.query;
    const m = parseInt(month) || new Date().getMonth() + 1;
    const y = parseInt(year)  || new Date().getFullYear();

    let sql = `
      SELECT u.id as user_id, u.name, u.employee_code,
             ep.department_id, dep.name as department_name,
             COUNT(a.id) as total_marked,
             COUNT(a.id) FILTER (WHERE a.status='present')   as present,
             COUNT(a.id) FILTER (WHERE a.status='absent')    as absent,
             COUNT(a.id) FILTER (WHERE a.status='half_day')  as half_day,
             COUNT(a.id) FILTER (WHERE a.status='leave')     as on_leave,
             COUNT(a.id) FILTER (WHERE a.status='holiday')   as holidays,
             COUNT(a.id) FILTER (WHERE a.status='week_off')  as week_off,
             SUM(a.late_minutes) as total_late_minutes
      FROM users u
      LEFT JOIN employee_profiles ep ON ep.user_id = u.id
      LEFT JOIN hr_departments dep ON dep.id = ep.department_id
      LEFT JOIN hr_attendance a ON a.user_id = u.id
        AND EXTRACT(MONTH FROM a.attendance_date) = $2
        AND EXTRACT(YEAR  FROM a.attendance_date) = $3
      WHERE u.company_id = $1 AND u.is_active = TRUE`;
    const params = [req.user.company_id, m, y];
    let idx = 4;

    if (department_id) { sql += ` AND ep.department_id=$${idx}`; params.push(department_id); idx++; }

    sql += ' GROUP BY u.id, u.name, u.employee_code, dep.name ORDER BY u.name';
    const { rows } = await query(sql, params);
    res.json({ data: rows });
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
    const { rows } = await query(
      `SELECT attendance_date,
              COUNT(*) FILTER (WHERE status='present')  AS present,
              COUNT(*) FILTER (WHERE status='absent')   AS absent,
              COUNT(*) FILTER (WHERE status='leave')    AS on_leave
       FROM hr_attendance
       WHERE company_id=$1
         AND EXTRACT(MONTH FROM attendance_date)=$2
         AND EXTRACT(YEAR  FROM attendance_date)=$3
       GROUP BY attendance_date
       ORDER BY attendance_date`,
      [req.user.company_id, m, y]
    );
    res.json({ data: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════
// DEPARTMENT SUMMARY — per-department attendance rollup for the month
// ═══════════════════════════════════════════════════════════
router.get('/department-summary', async (req, res) => {
  try {
    const { month, year } = req.query;
    const m = parseInt(month) || new Date().getMonth() + 1;
    const y = parseInt(year)  || new Date().getFullYear();
    const { rows } = await query(
      `SELECT COALESCE(dep.name, 'Unassigned') AS department_name,
              COUNT(DISTINCT u.id)                                       AS headcount,
              COUNT(a.id) FILTER (WHERE a.status='present')              AS present,
              COUNT(a.id) FILTER (WHERE a.status='absent')               AS absent,
              COUNT(a.id) FILTER (WHERE a.status='leave')                AS on_leave
       FROM users u
       LEFT JOIN employee_profiles ep ON ep.user_id = u.id
       LEFT JOIN hr_departments dep ON dep.id = ep.department_id
       LEFT JOIN hr_attendance a ON a.user_id = u.id
         AND EXTRACT(MONTH FROM a.attendance_date)=$2
         AND EXTRACT(YEAR  FROM a.attendance_date)=$3
       WHERE u.company_id=$1 AND u.is_active=TRUE
       GROUP BY dep.name
       ORDER BY headcount DESC`,
      [req.user.company_id, m, y]
    );
    res.json({ data: rows });
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

module.exports = router;

