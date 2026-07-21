// src/utils/hr-late-summary.service.js
// Sends a daily 9 AM summary of ALL late arrivals to the HR Admin Manager.
// Different from late-arrival-alert.service.js which emails individual employees at 11 AM.

const fs   = require('fs');
const path = require('path');
const cron = require('node-cron');
const logger = require('./logger');
const { query } = require('../config/database');
const { sendMail } = require('../services/mail.service');

// Default: 9:45 AM IST every day. Override via HR_LATE_SUMMARY_CRON env var.
const DEFAULT_CRON     = '45 9 * * *';
const MIN_LATE_MINUTES = parseInt(process.env.HR_LATE_SUMMARY_MIN_MINUTES, 10) || 1;

// Read recipients fresh every call so Railway env var changes take effect without restart
function getDefaultRecipients() {
  return process.env.HR_LATE_SUMMARY_EMAILS || 'raja@bcim.in,surendra@bcim.in,it@bcim.in';
}
const TZ                 = process.env.HR_LATE_SUMMARY_TZ || process.env.TZ || 'Asia/Kolkata';
const ERP_URL            = process.env.API_BASE_URL || 'https://erp.bcim.in';

let LOGO_SRC = `${ERP_URL}/bcim-logo.png`;
try {
  const b64 = fs.readFileSync(path.join(__dirname, '../../../frontend/public/bcim-logo.png')).toString('base64');
  LOGO_SRC = `data:image/png;base64,${b64}`;
} catch (_) {}

function parseEmails(value) {
  return String(value || '').split(/[;,]/).map(v => v.trim()).filter(Boolean);
}

function fmtLate(mins) {
  const h = Math.floor(mins / 60), m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m} min`;
}

function todayIST() {
  return new Date().toLocaleDateString('en-CA', { timeZone: TZ }); // YYYY-MM-DD
}

function fmtDateLong(d) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-IN', {
    weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
  });
}

// ── Fetch today's late employees ─────────────────────────────────────────────
async function fetchLateArrivals(companyId, targetDate) {
  const { rows } = await query(`
    SELECT
      u.name            AS employee_name,
      u.employee_code   AS emp_id,
      dep.name          AS department,
      COALESCE(des.name, u.designation) AS designation,
      COALESCE(c.name, 'BCIM') AS company_name,
      COALESCE(proj.name, 'Head Office / General') AS project_name,
      proj.project_code,
      TO_CHAR(s.start_time, 'HH12:MI AM')  AS shift_start,
      TO_CHAR(a.in_time,   'HH12:MI AM')   AS in_time,
      a.late_minutes
    FROM hr_attendance a
    JOIN users u ON u.id = a.user_id
    JOIN companies c ON c.id = a.company_id
    LEFT JOIN employee_profiles ep ON ep.user_id = a.user_id
    LEFT JOIN hr_departments dep ON dep.id = ep.department_id
    LEFT JOIN hr_designations des ON des.id = ep.designation_id
    LEFT JOIN projects proj ON proj.id = ep.project_id
    LEFT JOIN LATERAL (
      SELECT hs.start_time
      FROM hr_employee_shifts es
      JOIN hr_shifts hs ON hs.id = es.shift_id
      WHERE es.employee_id = a.user_id
        AND es.effective_from <= a.attendance_date
        AND (es.effective_to IS NULL OR es.effective_to >= a.attendance_date)
      ORDER BY es.effective_from DESC
      LIMIT 1
    ) s ON TRUE
    WHERE a.company_id = $1
      AND a.attendance_date = $2
      AND a.late_minutes >= $3
      AND a.status IN ('present', 'half_day')
      AND u.is_active = TRUE
    ORDER BY proj.name NULLS LAST, a.late_minutes DESC
  `, [companyId, targetDate, MIN_LATE_MINUTES]);
  return rows;
}

// ── Build HTML summary email ──────────────────────────────────────────────────
function buildSummaryEmail(companyName, rows, targetDate) {
  const dateStr = fmtDateLong(targetDate);
  const th = `padding:9px 12px;background:#1e3a8a;color:#fff;font-size:11px;font-weight:700;text-align:left;white-space:nowrap;border:1px solid #1e40af`;
  const td = `padding:8px 12px;font-size:12px;color:#1e293b;border:1px solid #e2e8f0;vertical-align:middle`;
  const tdR = `${td};color:#b91c1c;font-weight:700;white-space:nowrap`;

  // Group rows by project
  const projectMap = new Map();
  rows.forEach(r => {
    const key = r.project_name || 'Head Office / General';
    if (!projectMap.has(key)) projectMap.set(key, []);
    projectMap.get(key).push(r);
  });

  let globalIdx = 0;
  let rowsHtml = '';
  for (const [projectName, pRows] of projectMap) {
    const lateCount = pRows.length;
    const maxLate   = Math.max(...pRows.map(r => parseInt(r.late_minutes) || 0));
    // Project header row
    rowsHtml += `
      <tr>
        <td colspan="9" style="padding:10px 14px;background:#1e3a8a;border:1px solid #1e40af">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td>
                <span style="color:#fff;font-size:12px;font-weight:800;letter-spacing:0.5px">
                  📍 ${projectName}
                </span>
              </td>
              <td align="right">
                <span style="background:#dc2626;color:#fff;border-radius:10px;padding:2px 10px;font-size:11px;font-weight:700">
                  ${lateCount} late · max ${fmtLate(maxLate)}
                </span>
              </td>
            </tr>
          </table>
        </td>
      </tr>`;
    // Employee rows under this project
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
              border-radius:3px;padding:1px 6px;font-weight:700;font-size:10px">
              ${r.company_name}
            </span>
          </td>
          <td style="${td};color:#475569;white-space:nowrap">${r.shift_start || '—'}</td>
          <td style="${tdR}">${r.in_time || '—'}</td>
          <td style="${tdR};text-align:center">
            <span style="background:#fee2e2;color:#b91c1c;border-radius:12px;padding:3px 10px;font-size:11px;font-weight:800">
              ${fmtLate(r.late_minutes)}
            </span>
          </td>
        </tr>`;
    });
  }

  const subject = rows.length > 0
    ? `⏰ Late Arrivals Report — ${rows.length} employee(s) — ${dateStr}`
    : `✅ No Late Arrivals — ${dateStr}`;

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#e8edf5;font-family:Arial,Helvetica,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#e8edf5;padding:28px 0">
<tr><td align="center">
<table width="720" cellpadding="0" cellspacing="0" style="max-width:720px;width:100%;border-collapse:collapse">

  <tr><td style="background:#1a56db;height:5px;border-radius:8px 8px 0 0;font-size:1px;line-height:1px">&nbsp;</td></tr>

  <!-- HEADER -->
  <tr>
    <td style="background:#1e3a8a;padding:0">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="padding:20px 24px 16px;vertical-align:middle">
            <table cellpadding="0" cellspacing="0">
              <tr>
                <td style="background:#fff;border-radius:6px;padding:6px 10px;vertical-align:middle">
                  <img src="${LOGO_SRC}" alt="BCIM" height="32" style="display:block;height:32px;border:0">
                </td>
                <td style="padding-left:14px;vertical-align:middle">
                  <p style="margin:0;color:#fff;font-size:15px;font-weight:700">${companyName}</p>
                  <p style="margin:3px 0 0;color:#93c5fd;font-size:10px;font-weight:600;letter-spacing:1.5px">HR ATTENDANCE MONITORING</p>
                </td>
              </tr>
            </table>
          </td>
          <td align="right" style="padding:20px 24px 16px;vertical-align:middle">
            <table cellpadding="0" cellspacing="0" style="background:${rows.length > 0 ? '#b91c1c' : '#15803d'};border-radius:8px">
              <tr>
                <td style="padding:10px 20px;text-align:center">
                  <p style="margin:0;color:#fff;font-size:28px;font-weight:900;line-height:1">${rows.length}</p>
                  <p style="margin:4px 0 0;color:${rows.length > 0 ? '#fecaca' : '#bbf7d0'};font-size:10px;font-weight:700;letter-spacing:2px">
                    ${rows.length > 0 ? 'LATE' : 'ON TIME'}
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td colspan="2" style="background:#1e40af;padding:10px 24px;border-top:1px solid #3b82f6">
            <p style="margin:0;color:#fff;font-size:12px;font-weight:700;letter-spacing:1px">
              ⏰ DAILY LATE ARRIVALS REPORT &nbsp;·&nbsp; ${dateStr}
            </p>
          </td>
        </tr>
      </table>
    </td>
  </tr>

  <!-- BODY -->
  <tr>
    <td style="background:#fff;padding:24px">
      <p style="margin:0 0 6px;font-size:14px;color:#1e293b">
        Dear <strong>HR Admin / Senior Manager</strong>,
      </p>
      <p style="margin:0 0 20px;font-size:13px;color:#475569;line-height:1.7">
        ${rows.length > 0
          ? `The following <strong style="color:#b91c1c">${rows.length} employee(s)</strong> recorded late check-ins on <strong>${dateStr}</strong>. Please review and take appropriate action as per company policy.`
          : `<strong style="color:#15803d">All employees checked in on time</strong> on ${dateStr}. No late arrivals to report.`}
      </p>

      ${rows.length > 0 ? `
      <!-- TABLE -->
      <!-- PROJECT SUMMARY CHIPS -->
      <div style="margin-bottom:14px;display:flex;flex-wrap:wrap;gap:8px">
        ${[...projectMap.entries()].map(([proj, pRows]) => `
          <span style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:20px;padding:4px 12px;font-size:11px;color:#1e40af;font-weight:700">
            📍 ${proj} &nbsp;·&nbsp; <span style="color:#dc2626">${pRows.length} late</span>
          </span>
        `).join('')}
      </div>

      <div style="overflow-x:auto">
        <table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;min-width:620px">
          <thead>
            <tr>
              <th style="${th};width:32px">#</th>
              <th style="${th}">Employee Name</th>
              <th style="${th}">EMP ID</th>
              <th style="${th}">Designation</th>
              <th style="${th}">Department</th>
              <th style="${th}">Company</th>
              <th style="${th}">Shift Start</th>
              <th style="${th}">Check-in</th>
              <th style="${th};text-align:center">Late By</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
          <tfoot>
            <tr style="background:#f0f7ff">
              <td colspan="7" style="${td};font-weight:700;color:#1e40af;border-top:2px solid #bfdbfe;text-align:right">
                Total Late: ${rows.length} employee(s) across ${projectMap.size} project(s)
              </td>
              <td colspan="2" style="${td};font-weight:700;color:#b91c1c;border-top:2px solid #bfdbfe;text-align:center">
                Max: ${fmtLate(Math.max(...rows.map(r => parseInt(r.late_minutes)||0)))}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      <!-- ACTION NOTE -->
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:20px">
        <tr>
          <td style="background:#fefce8;border-left:4px solid #ca8a04;padding:12px 16px;border-radius:0 4px 4px 0">
            <p style="margin:0;font-size:12px;color:#713f12;line-height:1.6">
              <strong>Action Required:</strong> Employees with repeated late arrivals should be counselled.
              Attendance regularization requests (if any) can be reviewed in the ESS portal.
            </p>
          </td>
        </tr>
      </table>
      ` : ''}

      <!-- CTA -->
      <table cellpadding="0" cellspacing="0" style="margin-top:22px">
        <tr>
          <td style="background:#1e3a8a;border-radius:6px">
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
              <a href="mailto:it@bcim.in" style="color:#1d4ed8;text-decoration:none">it@bcim.in</a>
            </span>
          </td>
        </tr>
      </table>
    </td>
  </tr>

  <tr><td style="background:#1e3a8a;height:4px;border-radius:0 0 8px 8px;font-size:1px;line-height:1px">&nbsp;</td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;

  const text = [
    `Daily Late Arrivals Report — ${dateStr}`,
    `Company: ${companyName}`,
    '',
    rows.length === 0
      ? 'All employees checked in on time. No late arrivals.'
      : `${rows.length} employee(s) arrived late:`,
    '',
    ...rows.map((r, i) =>
      `${i + 1}. ${r.employee_name} (${r.emp_id || '—'}) — ${r.department || '—'} — In: ${r.in_time || '—'} — Late by: ${fmtLate(r.late_minutes)}`
    ),
    '',
    `View full report: ${ERP_URL}/hr-admin/attendance`,
  ].join('\n');

  return { subject, html, text };
}

// ── Main runner ───────────────────────────────────────────────────────────────
async function runLateSummary({ date, manual = false, recipients: recipientOverride } = {}) {
  const targetDate = date || todayIST();
  const recipients = recipientOverride
    ? parseEmails(Array.isArray(recipientOverride) ? recipientOverride.join(',') : recipientOverride)
    : parseEmails(getDefaultRecipients());
  if (!recipients.length) {
    logger.warn('HR late summary: no recipients configured (HR_LATE_SUMMARY_EMAILS)');
    return { ok: false, reason: 'No recipients' };
  }

  const companies = await query(`SELECT id, name FROM companies WHERE COALESCE(is_active, TRUE) = TRUE`);
  const results   = [];

  for (const co of companies.rows) {
    // Recalculate late_minutes before querying (same as the individual alert does)
    await query(`
      UPDATE hr_attendance ha
      SET late_minutes = GREATEST(0, EXTRACT(EPOCH FROM (
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
      WHERE ha.attendance_date = $1
        AND ha.in_time IS NOT NULL
        AND ha.status IN ('present', 'half_day')
    `, [targetDate]).catch(e => logger.warn('late_minutes recalc skipped:', e.message));

    const lateRows = await fetchLateArrivals(co.id, targetDate);
    const { subject, html, text } = buildSummaryEmail(co.name, lateRows, targetDate);

    const mailResult = await sendMail({ to: recipients, subject, html, text })
      .catch(e => ({ sent: false, error: e.message }));

    logger.info(`HR late summary [${co.name}]: ${lateRows.length} late employee(s) → ${recipients.join(', ')}`);
    results.push({ company: co.name, date: targetDate, late: lateRows.length, recipients, mail: mailResult, manual });
  }

  return { ok: true, ran_at: new Date().toISOString(), results };
}

// ── Scheduler ─────────────────────────────────────────────────────────────────
function initLateSummary() {
  if (String(process.env.HR_LATE_SUMMARY_ENABLED || 'true').toLowerCase() === 'false') {
    logger.info('HR late-summary scheduler disabled (HR_LATE_SUMMARY_ENABLED=false)');
    return;
  }
  const schedule = process.env.HR_LATE_SUMMARY_CRON || DEFAULT_CRON;

  cron.schedule(schedule, () => {
    logger.info('HR late-summary: running 9 AM report');
    runLateSummary()
      .then(r => {
        const total = (r.results || []).reduce((s, x) => s + (x.late || 0), 0);
        logger.info(`HR late-summary sent: ${total} late employee(s) reported`);
      })
      .catch(err => logger.error(`HR late-summary failed: ${err.message}`));
  }, { timezone: TZ });

  logger.info(`HR late-summary scheduler initialized (${schedule}, tz=${TZ})`);
}

module.exports = { runLateSummary, initLateSummary };
