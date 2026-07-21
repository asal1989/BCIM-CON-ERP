// src/utils/hr-absent-summary.service.js
// Sends a daily summary of ALL absent employees to HR Admin Manager.
// Runs at 10:30 AM IST by default (after morning attendance is marked).

const fs   = require('fs');
const path = require('path');
const cron = require('node-cron');
const logger = require('./logger');
const { query } = require('../config/database');
const { sendMail } = require('../services/mail.service');

// Default: 10:30 AM IST every weekday. Override via HR_ABSENT_SUMMARY_CRON env var.
const DEFAULT_CRON = '30 10 * * 1-6';

function getDefaultRecipients() {
  return process.env.HR_ABSENT_SUMMARY_EMAILS ||
    process.env.HR_LATE_SUMMARY_EMAILS ||
    'raja@bcim.in,surendra@bcim.in,it@bcim.in';
}

const TZ      = process.env.HR_ABSENT_SUMMARY_TZ || process.env.TZ || 'Asia/Kolkata';
const ERP_URL = process.env.API_BASE_URL || 'https://erp.bcim.in';

let LOGO_SRC = `${ERP_URL}/bcim-logo.png`;
try {
  const b64 = fs.readFileSync(path.join(__dirname, '../../../frontend/public/bcim-logo.png')).toString('base64');
  LOGO_SRC = `data:image/png;base64,${b64}`;
} catch (_) {}

function parseEmails(value) {
  return String(value || '').split(/[;,]/).map(v => v.trim()).filter(Boolean);
}

function todayIST() {
  return new Date().toLocaleDateString('en-CA', { timeZone: TZ });
}

function fmtDateLong(d) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-IN', {
    weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
  });
}

// ── Fetch today's absent employees ───────────────────────────────────────────
async function fetchAbsentEmployees(companyId, targetDate) {
  // Employees explicitly marked absent
  const { rows: absentRows } = await query(`
    SELECT
      u.name              AS employee_name,
      u.employee_code     AS emp_id,
      u.email             AS email,
      dep.name            AS department,
      COALESCE(des.name, u.designation) AS designation,
      COALESCE(c.name, 'BCIM')          AS company_name,
      COALESCE(proj.name, 'Head Office / General') AS project_name,
      proj.project_code,
      a.status,
      a.remarks
    FROM hr_attendance a
    JOIN users u ON u.id = a.user_id
    JOIN companies c ON c.id = a.company_id
    LEFT JOIN employee_profiles ep ON ep.user_id = a.user_id
    LEFT JOIN hr_departments   dep ON dep.id = ep.department_id
    LEFT JOIN hr_designations  des ON des.id = ep.designation_id
    LEFT JOIN projects         proj ON proj.id = ep.project_id
    WHERE a.company_id = $1
      AND a.attendance_date = $2
      AND a.status IN ('absent', 'on_leave', 'half_day')
      AND u.is_active = TRUE
    ORDER BY proj.name NULLS LAST, u.name
  `, [companyId, targetDate]);
  return absentRows;
}

// ── Status label & color ─────────────────────────────────────────────────────
function statusBadge(status) {
  const map = {
    absent:   { bg: '#fee2e2', color: '#b91c1c', label: 'Absent' },
    on_leave: { bg: '#fef9c3', color: '#92400e', label: 'On Leave' },
    half_day: { bg: '#ffedd5', color: '#c2410c', label: 'Half Day' },
  };
  const s = map[status] || { bg: '#f1f5f9', color: '#475569', label: status };
  return `<span style="background:${s.bg};color:${s.color};border-radius:12px;padding:3px 10px;font-size:11px;font-weight:800">${s.label}</span>`;
}

// ── Build HTML email ──────────────────────────────────────────────────────────
function buildAbsentEmail(companyName, rows, targetDate) {
  const dateStr = fmtDateLong(targetDate);
  const th = `padding:9px 12px;background:#7c3aed;color:#fff;font-size:11px;font-weight:700;text-align:left;white-space:nowrap;border:1px solid #6d28d9`;
  const td = `padding:8px 12px;font-size:12px;color:#1e293b;border:1px solid #e2e8f0;vertical-align:middle`;

  // Group by project
  const projectMap = new Map();
  rows.forEach(r => {
    const key = r.project_name || 'Head Office / General';
    if (!projectMap.has(key)) projectMap.set(key, []);
    projectMap.get(key).push(r);
  });

  let globalIdx = 0;
  let rowsHtml = '';
  for (const [projectName, pRows] of projectMap) {
    const absentCount  = pRows.filter(r => r.status === 'absent').length;
    const leaveCount   = pRows.filter(r => r.status === 'on_leave').length;
    const halfDayCount = pRows.filter(r => r.status === 'half_day').length;
    const tagParts = [];
    if (absentCount)  tagParts.push(`${absentCount} absent`);
    if (leaveCount)   tagParts.push(`${leaveCount} on leave`);
    if (halfDayCount) tagParts.push(`${halfDayCount} half day`);

    rowsHtml += `
      <tr>
        <td colspan="7" style="padding:10px 14px;background:#6d28d9;border:1px solid #7c3aed">
          <table width="100%" cellpadding="0" cellspacing="0"><tr>
            <td><span style="color:#fff;font-size:12px;font-weight:800;letter-spacing:0.5px">📍 ${projectName}</span></td>
            <td align="right"><span style="background:#dc2626;color:#fff;border-radius:10px;padding:2px 10px;font-size:11px;font-weight:700">${tagParts.join(' · ')}</span></td>
          </tr></table>
        </td>
      </tr>`;

    pRows.forEach((r, i) => {
      globalIdx++;
      rowsHtml += `
        <tr style="background:${i % 2 === 0 ? '#fff' : '#f8fafc'}">
          <td style="${td};text-align:center;color:#94a3b8;font-size:11px">${globalIdx}</td>
          <td style="${td};font-weight:700;color:#0f172a">${r.employee_name}</td>
          <td style="${td};color:#475569">${r.emp_id || '—'}</td>
          <td style="${td}">${r.designation || '—'}</td>
          <td style="${td}">${r.department || '—'}</td>
          <td style="${td};font-size:11px">
            <span style="background:${r.company_name?.toLowerCase().includes('bcim') ? '#dbeafe' : '#ffedd5'};
              color:${r.company_name?.toLowerCase().includes('bcim') ? '#1d4ed8' : '#c2410c'};
              border-radius:3px;padding:1px 6px;font-weight:700;font-size:10px">${r.company_name}</span>
          </td>
          <td style="${td};text-align:center">${statusBadge(r.status)}</td>
        </tr>`;
    });
  }

  const absentTotal   = rows.filter(r => r.status === 'absent').length;
  const leaveTotal    = rows.filter(r => r.status === 'on_leave').length;
  const halfDayTotal  = rows.filter(r => r.status === 'half_day').length;

  const subject = rows.length > 0
    ? `🚫 Absent Report — ${rows.length} employee(s) — ${dateStr}`
    : `✅ Full Attendance — ${dateStr}`;

  const headerBg = rows.length > 0 ? '#6d28d9' : '#15803d';

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#e8edf5;font-family:Arial,Helvetica,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#e8edf5;padding:28px 0">
<tr><td align="center">
<table width="720" cellpadding="0" cellspacing="0" style="max-width:720px;width:100%;border-collapse:collapse">

  <tr><td style="background:${headerBg};height:5px;border-radius:8px 8px 0 0;font-size:1px;line-height:1px">&nbsp;</td></tr>

  <!-- HEADER -->
  <tr>
    <td style="background:${headerBg};padding:20px 28px">
      <table width="100%" cellpadding="0" cellspacing="0"><tr>
        <td>
          <p style="color:rgba(255,255,255,0.7);font-size:10px;margin:0 0 2px;letter-spacing:0.08em;text-transform:uppercase">HR Attendance Monitoring</p>
          <p style="color:#fff;font-size:15px;font-weight:800;margin:0;letter-spacing:0.3px">🚫 DAILY ABSENT REPORT &nbsp;·&nbsp; ${dateStr}</p>
        </td>
        <td align="right" style="padding-left:16px">
          <div style="background:rgba(255,255,255,0.15);border-radius:10px;padding:10px 18px;text-align:center;min-width:60px">
            <div style="color:#fff;font-size:28px;font-weight:800;line-height:1">${rows.length}</div>
            <div style="color:rgba(255,255,255,0.8);font-size:10px;font-weight:700;letter-spacing:0.05em;text-transform:uppercase;margin-top:2px">${rows.length === 1 ? 'Employee' : 'Employees'}</div>
          </div>
        </td>
      </tr></table>
    </td>
  </tr>

  <!-- BODY -->
  <tr>
    <td style="background:#fff;padding:22px 24px">
      <p style="margin:0 0 6px;font-size:13px;color:#475569">Dear HR Admin / Senior Manager,</p>

      ${rows.length === 0 ? `
        <p style="color:#15803d;font-size:14px;font-weight:700;margin:12px 0">
          All employees are present on ${dateStr}. No absences to report.
        </p>` : `
        <p style="font-size:13px;color:#475569;margin:8px 0 16px">
          The following <strong>${rows.length} employee(s)</strong> are absent / on leave today.
          ${absentTotal   ? `<span style="color:#b91c1c"><strong>${absentTotal}</strong> absent</span>` : ''}
          ${absentTotal && (leaveTotal || halfDayTotal) ? ' · ' : ''}
          ${leaveTotal    ? `<span style="color:#92400e"><strong>${leaveTotal}</strong> on leave</span>` : ''}
          ${leaveTotal && halfDayTotal ? ' · ' : ''}
          ${halfDayTotal  ? `<span style="color:#c2410c"><strong>${halfDayTotal}</strong> half day</span>` : ''}
        </p>

        <div style="overflow-x:auto">
        <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;min-width:600px">
          <tr>
            <th style="${th};width:36px">#</th>
            <th style="${th}">Employee</th>
            <th style="${th}">ID</th>
            <th style="${th}">Designation</th>
            <th style="${th}">Department</th>
            <th style="${th}">Company</th>
            <th style="${th};text-align:center">Status</th>
          </tr>
          ${rowsHtml}
        </table>
        </div>`}

      <!-- CTA -->
      <table cellpadding="0" cellspacing="0" style="margin-top:22px">
        <tr>
          <td style="background:#6d28d9;border-radius:6px">
            <a href="${ERP_URL}/hr-admin/attendance"
               style="display:inline-block;color:#fff;padding:11px 26px;text-decoration:none;font-weight:700;font-size:13px">
              Open Attendance Report →
            </a>
          </td>
        </tr>
      </table>
    </td>
  </tr>

  <!-- FOOTER -->
  <tr>
    <td style="background:#f8fafc;padding:18px 24px;border-top:1px solid #e2e8f0">
      <p style="margin:0 0 4px;font-size:12px;color:#64748b">Regards,</p>
      <p style="margin:0 0 16px;font-size:12px;color:#1e293b">
        <strong>HR Attendance Monitoring System</strong><br>
        <strong>${companyName}</strong>
      </p>
      <table width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #e2e8f0;padding-top:14px">
        <tr>
          <td>
            <img src="${LOGO_SRC}" alt="BCIM" height="18" style="display:inline-block;height:18px;border:0">
            <span style="color:#94a3b8;font-size:11px;margin-left:8px">${companyName}</span>
          </td>
          <td align="right">
            <span style="color:#94a3b8;font-size:11px">
              Automated report · ${new Date().toLocaleString('en-IN', { timeZone: TZ })} ·
              <a href="mailto:it@bcim.in" style="color:#6d28d9;text-decoration:none">it@bcim.in</a>
            </span>
          </td>
        </tr>
      </table>
    </td>
  </tr>

  <tr><td style="background:#6d28d9;height:4px;border-radius:0 0 8px 8px;font-size:1px;line-height:1px">&nbsp;</td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;

  const text = [
    `Daily Absent Report — ${dateStr}`,
    `Company: ${companyName}`,
    '',
    rows.length === 0
      ? 'All employees are present. No absences to report.'
      : `${rows.length} employee(s) absent / on leave:`,
    '',
    ...rows.map((r, i) =>
      `${i + 1}. ${r.employee_name} (${r.emp_id || '—'}) — ${r.department || '—'} — ${r.status}`
    ),
    '',
    `View full report: ${ERP_URL}/hr-admin/attendance`,
  ].join('\n');

  return { subject, html, text };
}

// ── Main runner ───────────────────────────────────────────────────────────────
async function runAbsentSummary({ date, manual = false, recipients: recipientOverride } = {}) {
  const targetDate = date || todayIST();
  const recipients = recipientOverride
    ? parseEmails(Array.isArray(recipientOverride) ? recipientOverride.join(',') : recipientOverride)
    : parseEmails(getDefaultRecipients());

  if (!recipients.length) {
    logger.warn('HR absent summary: no recipients configured');
    return { ok: false, reason: 'No recipients' };
  }

  const companies = await query(`SELECT id, name FROM companies WHERE COALESCE(is_active, TRUE) = TRUE`);
  const results   = [];

  for (const co of companies.rows) {
    const absentRows = await fetchAbsentEmployees(co.id, targetDate);
    const { subject, html, text } = buildAbsentEmail(co.name, absentRows, targetDate);

    const mailResult = await sendMail({ to: recipients, subject, html, text })
      .catch(e => ({ sent: false, error: e.message }));

    logger.info(`HR absent summary [${co.name}]: ${absentRows.length} absent employee(s) → ${recipients.join(', ')}`);
    results.push({ company: co.name, date: targetDate, absent: absentRows.length, recipients, mail: mailResult, manual });
  }

  return { ok: true, ran_at: new Date().toISOString(), results };
}

// ── Scheduler ─────────────────────────────────────────────────────────────────
function initAbsentSummary() {
  if (String(process.env.HR_ABSENT_SUMMARY_ENABLED || 'true').toLowerCase() === 'false') {
    logger.info('HR absent-summary scheduler disabled (HR_ABSENT_SUMMARY_ENABLED=false)');
    return;
  }
  const schedule = process.env.HR_ABSENT_SUMMARY_CRON || DEFAULT_CRON;

  cron.schedule(schedule, () => {
    logger.info('HR absent-summary: running daily report');
    runAbsentSummary()
      .then(r => {
        const total = (r.results || []).reduce((s, x) => s + (x.absent || 0), 0);
        logger.info(`HR absent-summary sent: ${total} absent employee(s) reported`);
      })
      .catch(err => logger.error('HR absent-summary failed:', err.message));
  }, { timezone: TZ });

  logger.info(`HR absent-summary scheduler initialized (${schedule})`);
}

module.exports = { runAbsentSummary, initAbsentSummary };
