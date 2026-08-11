// src/utils/hr-mark-absent.service.js
// Nightly job: hr_attendance rows are otherwise only ever written reactively
// from an ESSL swipe (see hr-essl.routes.js) — an employee who never punched
// at all on a given day previously got NO row for that day, at all. That made
// them invisible to the Leave Calendar, payroll, and the absent-summary email
// alike, since none of those can distinguish "never checked" from "present".
// This job backfills a trailing window of days with an explicit status
// ('holiday' / 'week_off' / 'leave' / 'absent') for every active employee who
// still has no row for that date, so "absent" becomes a real, queryable fact.

const cron   = require('node-cron');
const logger = require('./logger');
const { query } = require('../config/database');

const TZ = process.env.HR_ABSENT_SUMMARY_TZ || process.env.TZ || 'Asia/Kolkata';
// 01:15 IST — after the ESSL agent's last sync of the previous day and before
// the 10:30 absent-summary email, so that email reflects real backfilled data.
const DEFAULT_CRON = process.env.HR_MARK_ABSENT_CRON || '15 1 * * *';
// Re-checks a trailing window (not just "yesterday") so a gap — agent
// downtime, a deploy, a missed run — self-heals within a few days without
// needing a separate manual backfill.
const BACKFILL_DAYS = parseInt(process.env.HR_MARK_ABSENT_BACKFILL_DAYS, 10) || 5;

function istDateStr(d) {
  return d.toLocaleDateString('en-CA', { timeZone: TZ });
}

async function markAbsentForCompany(companyId, dateStrs) {
  const { rows: emps } = await query(
    `SELECT u.id, ep.date_of_joining
     FROM users u
     JOIN employee_profiles ep ON ep.user_id = u.id
     WHERE u.company_id = $1 AND u.is_active = TRUE`,
    [companyId]
  );
  if (!emps.length) return 0;

  const { rows: shiftRows } = await query(`
    SELECT DISTINCT ON (es.employee_id) es.employee_id, COALESCE(hs.weekly_off_day, 0) AS weekly_off_day
    FROM hr_employee_shifts es
    JOIN hr_shifts hs ON hs.id = es.shift_id
    WHERE es.company_id = $1
      AND es.effective_from <= CURRENT_DATE
      AND (es.effective_to IS NULL OR es.effective_to >= CURRENT_DATE)
    ORDER BY es.employee_id, es.effective_from DESC
  `, [companyId]).catch(() => ({ rows: [] })); // no shift tables/assignments — everyone defaults to Sunday off
  const weeklyOffMap = {};
  for (const r of shiftRows) weeklyOffMap[r.employee_id] = r.weekly_off_day;

  const { rows: holidayRows } = await query(
    `SELECT holiday_date::text AS d FROM hr_holidays WHERE company_id = $1 AND holiday_date = ANY($2::date[])`,
    [companyId, dateStrs]
  );
  const holidaySet = new Set(holidayRows.map(r => r.d));

  const { rows: leaveRows } = await query(
    `SELECT user_id, from_date::text AS from_date, to_date::text AS to_date
     FROM hr_leave_requests
     WHERE company_id = $1 AND status = 'approved'
       AND to_date >= $2::date AND from_date <= $3::date`,
    [companyId, dateStrs[0], dateStrs[dateStrs.length - 1]]
  );
  const isOnApprovedLeave = (userId, dateStr) =>
    leaveRows.some(l => l.user_id === userId && dateStr >= l.from_date && dateStr <= l.to_date);

  const rowsToInsert = [];
  for (const emp of emps) {
    const joinDate  = emp.date_of_joining ? String(emp.date_of_joining).slice(0, 10) : null;
    const weeklyOff = weeklyOffMap[emp.id] ?? 0;
    for (const dateStr of dateStrs) {
      if (joinDate && dateStr < joinDate) continue; // don't mark absent before they joined
      const dow = new Date(dateStr + 'T00:00:00').getDay();
      let status;
      if (holidaySet.has(dateStr))                 status = 'holiday';
      else if (dow === weeklyOff)                  status = 'week_off';
      else if (isOnApprovedLeave(emp.id, dateStr))  status = 'leave';
      else                                          status = 'absent';
      rowsToInsert.push([emp.id, companyId, dateStr, status]);
    }
  }
  if (!rowsToInsert.length) return 0;

  const values = [];
  const params = [];
  rowsToInsert.forEach((row, i) => {
    const b = i * 4;
    values.push(`($${b + 1}::uuid,$${b + 2}::uuid,$${b + 3}::date,$${b + 4}::text)`);
    params.push(...row);
  });
  // ON CONFLICT DO NOTHING — never overwrite a real ESSL-derived row, only
  // fills in dates that genuinely have no attendance row at all yet.
  const { rowCount } = await query(
    `INSERT INTO hr_attendance (user_id, company_id, attendance_date, status, source)
     SELECT v.user_id, v.company_id, v.attendance_date, v.status, 'auto_absent'
     FROM (VALUES ${values.join(',')}) AS v(user_id, company_id, attendance_date, status)
     ON CONFLICT (user_id, attendance_date) DO NOTHING`,
    params
  );
  return rowCount;
}

async function runMarkAbsent({ days, manual = false } = {}) {
  const n = days || BACKFILL_DAYS;
  const dateStrs = [];
  const now = new Date();
  for (let i = 1; i <= n; i++) { // start at 1 — never touches today, which isn't over yet
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    dateStrs.push(istDateStr(d));
  }
  dateStrs.sort();

  const companies = await query(`SELECT id, name FROM companies WHERE COALESCE(is_active, TRUE) = TRUE`);
  const results = [];
  for (const co of companies.rows) {
    const inserted = await markAbsentForCompany(co.id, dateStrs).catch(e => {
      logger.error(`hr-mark-absent [${co.name}] failed:`, e.message);
      return 0;
    });
    results.push({ company: co.name, inserted });
  }
  return { ok: true, ran_at: new Date().toISOString(), date_range: [dateStrs[0], dateStrs[dateStrs.length - 1]], manual, results };
}

function initMarkAbsent() {
  if (String(process.env.HR_MARK_ABSENT_ENABLED || 'true').toLowerCase() === 'false') {
    logger.info('HR mark-absent scheduler disabled (HR_MARK_ABSENT_ENABLED=false)');
    return;
  }
  cron.schedule(DEFAULT_CRON, () => {
    logger.info('HR mark-absent: running nightly absence backfill');
    runMarkAbsent()
      .then(r => {
        const total = r.results.reduce((s, x) => s + (x.inserted || 0), 0);
        logger.info(`HR mark-absent: ${total} attendance row(s) inserted`);
      })
      .catch(err => logger.error('HR mark-absent failed:', err.message));
  }, { timezone: TZ });
  logger.info(`HR mark-absent scheduler initialized (${DEFAULT_CRON})`);
}

module.exports = { runMarkAbsent, initMarkAbsent };
