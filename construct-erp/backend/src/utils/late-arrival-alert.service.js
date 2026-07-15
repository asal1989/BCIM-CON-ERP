// src/utils/late-arrival-alert.service.js
// Sends individual late-arrival warning emails to employees who checked in late.
// Can be triggered manually via API or scheduled via cron.

const fs   = require('fs');
const path = require('path');
const cron = require('node-cron');
const logger = require('./logger');
const { query } = require('../config/database');
const { sendMail } = require('../services/mail.service');

const ERP_URL = process.env.API_BASE_URL || 'https://erp.bcim.in';
// Daily late-arrival sweep — 11:00 AM IST by default, after morning punches
// have synced from the biometric devices. Override with env vars.
const DEFAULT_CRON = '0 11 * * *';

// Embed BCIM logo as base64 so it renders even when external images are blocked
let LOGO_SRC = `${ERP_URL}/bcim-logo.png`;
try {
  const logoPath = path.join(__dirname, '../../../frontend/public/bcim-logo.png');
  const b64 = fs.readFileSync(logoPath).toString('base64');
  LOGO_SRC = `data:image/png;base64,${b64}`;
} catch (_) { /* fall back to hosted URL */ }

// ── HTML email template ───────────────────────────────────────────────────────
function buildLateEmail({ employeeName, employeeCode, date, checkInTime, lateMinutes, shiftStart, companyName, managerName }) {
  const lateHrs  = Math.floor(lateMinutes / 60);
  const lateMins = lateMinutes % 60;
  const lateStr  = lateHrs > 0 ? `${lateHrs}h ${lateMins}m` : `${lateMins} min`;
  const dateStr  = new Date(date).toLocaleDateString('en-IN', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });

  const subject = `Late Arrival Notice — ${dateStr}`;

  const row = (label, value, valueStyle = '') =>
    `<tr>
       <td style="padding:10px 16px;color:#64748b;font-size:13px;border-bottom:1px solid #f1f5f9;width:42%">${label}</td>
       <td style="padding:10px 16px;font-size:13px;font-weight:600;border-bottom:1px solid #f1f5f9;${valueStyle}">${value}</td>
     </tr>`;

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#e8edf5;font-family:Arial,Helvetica,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#e8edf5;padding:28px 0">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;border-collapse:collapse">

  <!-- ── TOP ACCENT BAR ── -->
  <tr>
    <td style="background:#1a56db;height:5px;border-radius:8px 8px 0 0;font-size:1px;line-height:1px">&nbsp;</td>
  </tr>

  <!-- ── HEADER ── -->
  <tr>
    <td style="background:#1e3a8a;padding:0">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <!-- Logo + Company name -->
          <td style="padding:22px 24px 18px;vertical-align:middle">
            <table cellpadding="0" cellspacing="0">
              <tr>
                <td style="background:#ffffff;border-radius:6px;padding:7px 12px;vertical-align:middle">
                  <img src="${LOGO_SRC}" alt="BCIM" height="36" style="display:block;height:36px;max-width:110px;border:0">
                </td>
                <td style="padding-left:16px;vertical-align:middle">
                  <p style="margin:0;color:#ffffff;font-size:16px;font-weight:700;line-height:1.3">${companyName.toUpperCase()}</p>
                  <p style="margin:4px 0 0;color:#93c5fd;font-size:11px;font-weight:600;letter-spacing:1.5px">HR DEPARTMENT</p>
                </td>
              </tr>
            </table>
          </td>
          <!-- Late badge - solid red, no rgba -->
          <td align="right" style="padding:22px 24px 18px;vertical-align:middle">
            <table cellpadding="0" cellspacing="0" style="background:#b91c1c;border-radius:8px">
              <tr>
                <td style="padding:10px 20px;text-align:center">
                  <p style="margin:0;color:#ffffff;font-size:24px;font-weight:900;line-height:1;letter-spacing:-0.5px">${lateStr}</p>
                  <p style="margin:5px 0 0;color:#fecaca;font-size:10px;font-weight:700;letter-spacing:2.5px">LATE</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <!-- Title strip - solid darker blue, no rgba -->
        <tr>
          <td colspan="2" style="background:#1e40af;padding:10px 24px;border-top:1px solid #3b82f6">
            <p style="margin:0;color:#ffffff;font-size:12px;font-weight:700;letter-spacing:1px">&#9888; LATE ARRIVAL NOTICE</p>
          </td>
        </tr>
      </table>
    </td>
  </tr>

  <!-- ── BODY ── -->
  <tr>
    <td style="background:#ffffff;padding:28px 24px 20px">

      <p style="margin:0 0 6px;font-size:15px;color:#1e293b;font-weight:400">
        Dear <strong style="color:#0f172a">${employeeName}</strong>,
      </p>
      <p style="margin:0 0 24px;font-size:14px;color:#475569;line-height:1.75">
        Our records show that you arrived
        <strong style="color:#b91c1c">${lateStr} late</strong>
        to work on <strong style="color:#0f172a">${dateStr}</strong>.
        Please ensure punctuality going forward.
      </p>

      <!-- Details table -->
      <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #cbd5e1;border-radius:8px;border-collapse:collapse;margin-bottom:24px;overflow:hidden">
        <tr>
          <td colspan="2" style="background:#1e3a8a;padding:10px 16px">
            <p style="margin:0;color:#bfdbfe;font-size:11px;font-weight:700;letter-spacing:1.5px">ATTENDANCE DETAILS</p>
          </td>
        </tr>
        <tr>
          <td style="padding:10px 16px;color:#64748b;font-size:13px;border-bottom:1px solid #f1f5f9;width:42%;background:#f8fafc">Employee Name</td>
          <td style="padding:10px 16px;font-size:13px;font-weight:600;border-bottom:1px solid #f1f5f9;color:#0f172a">${employeeName}</td>
        </tr>
        <tr>
          <td style="padding:10px 16px;color:#64748b;font-size:13px;border-bottom:1px solid #f1f5f9;background:#f8fafc">Employee Code</td>
          <td style="padding:10px 16px;font-size:13px;font-weight:600;border-bottom:1px solid #f1f5f9;color:#334155">${employeeCode || '—'}</td>
        </tr>
        <tr>
          <td style="padding:10px 16px;color:#64748b;font-size:13px;border-bottom:1px solid #f1f5f9;background:#f8fafc">Date</td>
          <td style="padding:10px 16px;font-size:13px;font-weight:600;border-bottom:1px solid #f1f5f9;color:#0f172a">${dateStr}</td>
        </tr>
        ${shiftStart ? `<tr>
          <td style="padding:10px 16px;color:#64748b;font-size:13px;border-bottom:1px solid #f1f5f9;background:#f8fafc">Shift Start Time</td>
          <td style="padding:10px 16px;font-size:13px;font-weight:600;border-bottom:1px solid #f1f5f9;color:#1d4ed8">${shiftStart}</td>
        </tr>` : ''}
        <tr>
          <td style="padding:10px 16px;color:#64748b;font-size:13px;border-bottom:1px solid #f1f5f9;background:#f8fafc">Actual Check-in</td>
          <td style="padding:10px 16px;font-size:14px;font-weight:700;border-bottom:1px solid #f1f5f9;color:#b91c1c">${checkInTime}</td>
        </tr>
        <tr>
          <td style="padding:10px 16px;color:#64748b;font-size:13px;background:#f8fafc">Late By</td>
          <td style="padding:10px 16px">
            <table cellpadding="0" cellspacing="0" style="background:#fee2e2;border-radius:20px">
              <tr><td style="padding:4px 14px;color:#b91c1c;font-size:12px;font-weight:700">${lateStr}</td></tr>
            </table>
          </td>
        </tr>
      </table>

      <!-- Warning box - solid yellow, no rgba -->
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px">
        <tr>
          <td style="background:#fefce8;border-left:4px solid #ca8a04;padding:14px 16px">
            <p style="margin:0;font-size:13px;color:#713f12;line-height:1.65">
              <strong>Please Note:</strong> Repeated late arrivals may impact your attendance record,
              performance evaluation, and salary calculations as per company policy.
              If you have a valid reason, please submit an
              <strong>Attendance Regularization</strong> request via the ESS portal.
            </p>
          </td>
        </tr>
      </table>

      <!-- CTA button - solid color, no gradient -->
      <p style="margin:0 0 8px;font-size:13px;color:#475569">View your attendance or submit a regularization request:</p>
      <table cellpadding="0" cellspacing="0" style="margin-bottom:28px">
        <tr>
          <td style="background:#1e3a8a;border-radius:6px">
            <a href="${ERP_URL}/ess"
               style="display:inline-block;color:#ffffff;padding:12px 28px;text-decoration:none;font-weight:700;font-size:13px;letter-spacing:0.3px">
              View My Attendance &rarr;
            </a>
          </td>
        </tr>
      </table>

    </td>
  </tr>

  <!-- ── FOOTER ── -->
  <tr>
    <td style="background:#f8fafc;padding:20px 24px;border-top:1px solid #e2e8f0">
      ${managerName ? `<p style="margin:0 0 16px;font-size:12px;color:#64748b;background:#ffffff;border:1px solid #e2e8f0;border-radius:6px;padding:10px 14px">
        This notice has also been shared with your reporting manager <strong style="color:#334155">${managerName}</strong>.
      </p>` : ''}

      <p style="margin:0 0 2px;font-size:13px;color:#64748b">Regards,</p>
      <p style="margin:0 0 20px;font-size:13px;color:#0f172a">
        <strong style="color:#1e3a8a">HR Department</strong><br>
        <strong>${companyName}</strong>
      </p>

      <table width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #e2e8f0;padding-top:16px">
        <tr>
          <td style="vertical-align:middle">
            <img src="${LOGO_SRC}" alt="BCIM" height="20" style="display:inline-block;height:20px;vertical-align:middle;border:0">
            <span style="color:#94a3b8;font-size:11px;margin-left:8px;vertical-align:middle">${companyName}</span>
          </td>
          <td align="right" style="vertical-align:middle">
            <span style="color:#94a3b8;font-size:11px">Automated &bull; Do not reply &bull;
              <a href="mailto:hr@bcim.in" style="color:#1d4ed8;text-decoration:none">hr@bcim.in</a>
            </span>
          </td>
        </tr>
      </table>
    </td>
  </tr>

  <!-- Bottom accent bar - solid color, no gradient -->
  <tr>
    <td style="background:#1e3a8a;height:4px;border-radius:0 0 8px 8px;font-size:1px;line-height:1px">&nbsp;</td>
  </tr>

</table>
</td></tr>
</table>
</body>
</html>`;

  const text = [
    `Late Arrival Notice — ${companyName}`,
    '',
    `Dear ${employeeName},`,
    '',
    `You arrived ${lateStr} late on ${dateStr}.`,
    `Check-in time: ${checkInTime}${shiftStart ? ` (Shift starts: ${shiftStart})` : ''}`,
    '',
    'Please ensure punctuality. If you have a valid reason, submit an Attendance Regularization request via ESS portal.',
    '',
    `ESS Portal: ${ERP_URL}/ess`,
    '',
    'Regards,',
    'HR Department',
    companyName,
  ].join('\n');

  return { subject, html, text };
}

// ── Core function: send late alerts for a given date ─────────────────────────
async function sendLateArrivalAlerts({ date, companyId, minLateMinutes = 5, overrideRecipients, dryRun = false } = {}) {
  const targetDate = date || new Date().toISOString().slice(0, 10);

  // Get company info
  const companyFilter = companyId ? `WHERE id = '${companyId}'` : `WHERE COALESCE(is_active, TRUE) = TRUE`;
  const companies = await query(`SELECT id, name FROM companies ${companyFilter}`);

  const results = [];

  for (const company of companies.rows) {
    // Get late employees for the date
    const { rows: lateEmps } = await query(`
      SELECT
        a.id, a.user_id, a.attendance_date, a.in_time AS check_in, a.late_minutes,
        u.name AS employee_name, u.email AS employee_email, u.employee_code,
        s.start_time AS shift_start,
        m.name AS manager_name, m.email AS manager_email
      FROM hr_attendance a
      JOIN users u ON u.id = a.user_id
      LEFT JOIN employee_profiles ep ON ep.user_id = a.user_id
      LEFT JOIN users m ON m.id = ep.reporting_manager_id
      -- Shift start (optional, for display) comes from the active assignment in
      -- hr_employee_shifts, not employee_profiles (which has no shift column).
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
        AND u.email IS NOT NULL
      ORDER BY a.late_minutes DESC
    `, [company.id, targetDate, minLateMinutes]);

    const sent = [], failed = [];

    for (const emp of lateEmps) {
      try {
        const mail = buildLateEmail({
          employeeName: emp.employee_name,
          employeeCode: emp.employee_code,
          date:         emp.attendance_date,
          checkInTime:  emp.check_in,
          lateMinutes:  emp.late_minutes,
          shiftStart:   emp.shift_start,
          companyName:  company.name,
          managerName:  emp.manager_name,
        });

        const to = overrideRecipients
          ? (Array.isArray(overrideRecipients) ? overrideRecipients : [overrideRecipients])
          : [emp.employee_email].filter(Boolean);

        if (!dryRun && to.length) {
          await sendMail({ to, ...mail });
        }

        sent.push({ employee: emp.employee_name, email: emp.employee_email, lateMinutes: emp.late_minutes });
      } catch (e) {
        failed.push({ employee: emp.employee_name, error: e.message });
      }
    }

    results.push({ company: company.name, date: targetDate, sent: sent.length, failed: failed.length, employees: sent, errors: failed });
  }

  return { ok: true, date: targetDate, results };
}

// ── Scheduled automation: runs every day and emails whoever came in late ──────
function initLateArrivalAlert() {
  if (String(process.env.HR_LATE_ALERT_ENABLED || 'true').toLowerCase() === 'false') {
    logger.info('Late-arrival alert scheduler disabled (HR_LATE_ALERT_ENABLED=false)');
    return;
  }
  const schedule = process.env.HR_LATE_ALERT_CRON || DEFAULT_CRON;
  const minLateMinutes = parseInt(process.env.HR_LATE_ALERT_MIN_MINUTES, 10) || 5;

  cron.schedule(schedule, () => {
    logger.info('Scheduled late-arrival alert triggered');
    // No companyId → sweeps every active company for today's date.
    sendLateArrivalAlerts({ minLateMinutes })
      .then((r) => {
        const total = (r.results || []).reduce((s, x) => s + (x.sent || 0), 0);
        logger.info(`Late-arrival alerts sent: ${total} across ${r.results?.length || 0} company(ies)`);
      })
      .catch((err) => logger.error(`Late-arrival alert failed: ${err.message}`));
  }, { timezone: process.env.HR_LATE_ALERT_TZ || process.env.TZ || 'Asia/Kolkata' });

  logger.info(`Late-arrival alert scheduler initialized (${schedule}, ≥${minLateMinutes} min)`);
}

module.exports = { sendLateArrivalAlerts, buildLateEmail, initLateArrivalAlert };
