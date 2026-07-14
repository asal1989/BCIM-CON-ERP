// src/utils/late-arrival-alert.service.js
// Sends individual late-arrival warning emails to employees who checked in late.
// Can be triggered manually via API or scheduled via cron.

const { query } = require('../config/db');
const { sendMail } = require('../services/mail.service');

const ERP_URL = process.env.API_BASE_URL || 'https://erp.bcim.in';

// ── HTML email template ───────────────────────────────────────────────────────
function buildLateEmail({ employeeName, employeeCode, date, checkInTime, lateMinutes, shiftStart, companyName, managerName }) {
  const lateHrs  = Math.floor(lateMinutes / 60);
  const lateMins = lateMinutes % 60;
  const lateStr  = lateHrs > 0 ? `${lateHrs}h ${lateMins}m` : `${lateMins} minutes`;
  const dateStr  = new Date(date).toLocaleDateString('en-IN', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });

  const subject = `Late Arrival Notice — ${dateStr}`;

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#1e293b">

      <!-- Header -->
      <div style="background:linear-gradient(135deg,#0f2a52,#1e3a8a);padding:20px 24px;border-radius:10px 10px 0 0">
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td>
              <h2 style="margin:0;color:#fff;font-size:18px;font-weight:700">Late Arrival Notice</h2>
              <p style="margin:4px 0 0;color:#93c5fd;font-size:12px">${companyName} &bull; HR Department</p>
            </td>
            <td align="right">
              <div style="background:rgba(255,255,255,0.15);border-radius:8px;padding:8px 14px;text-align:center">
                <div style="color:#fbbf24;font-size:22px;font-weight:900;line-height:1">${lateStr}</div>
                <div style="color:#bfdbfe;font-size:10px;font-weight:600;letter-spacing:1px;margin-top:2px">LATE</div>
              </div>
            </td>
          </tr>
        </table>
      </div>

      <!-- Body -->
      <div style="background:#fff;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 10px 10px;padding:24px">

        <p style="margin:0 0 16px;font-size:14px;color:#475569">
          Dear <strong style="color:#0f172a">${employeeName}</strong>,
        </p>

        <p style="margin:0 0 20px;font-size:14px;color:#475569;line-height:1.6">
          Our records indicate that you arrived <strong style="color:#dc2626">${lateStr} late</strong> to work on
          <strong style="color:#0f172a">${dateStr}</strong>. We kindly request you to ensure punctuality going forward.
        </p>

        <!-- Detail box -->
        <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px;margin-bottom:20px">
          <table width="100%" cellpadding="0" cellspacing="0" style="font-size:13px">
            <tr>
              <td style="color:#64748b;padding:6px 0;width:45%">Employee Name</td>
              <td style="color:#0f172a;font-weight:700;padding:6px 0">${employeeName}</td>
            </tr>
            <tr style="border-top:1px solid #f1f5f9">
              <td style="color:#64748b;padding:6px 0">Employee Code</td>
              <td style="color:#0f172a;font-weight:600;padding:6px 0">${employeeCode || '—'}</td>
            </tr>
            <tr style="border-top:1px solid #f1f5f9">
              <td style="color:#64748b;padding:6px 0">Date</td>
              <td style="color:#0f172a;font-weight:600;padding:6px 0">${dateStr}</td>
            </tr>
            ${shiftStart ? `
            <tr style="border-top:1px solid #f1f5f9">
              <td style="color:#64748b;padding:6px 0">Shift Start Time</td>
              <td style="color:#0f172a;font-weight:600;padding:6px 0">${shiftStart}</td>
            </tr>` : ''}
            <tr style="border-top:1px solid #f1f5f9">
              <td style="color:#64748b;padding:6px 0">Actual Check-in</td>
              <td style="color:#dc2626;font-weight:700;padding:6px 0">${checkInTime}</td>
            </tr>
            <tr style="border-top:1px solid #f1f5f9">
              <td style="color:#64748b;padding:6px 0">Late By</td>
              <td style="padding:6px 0">
                <span style="background:#fee2e2;color:#dc2626;font-weight:700;font-size:12px;padding:3px 10px;border-radius:20px">${lateStr}</span>
              </td>
            </tr>
          </table>
        </div>

        <!-- Note -->
        <div style="background:#fffbeb;border-left:4px solid #f59e0b;border-radius:0 6px 6px 0;padding:12px 16px;margin-bottom:20px">
          <p style="margin:0;font-size:13px;color:#92400e;line-height:1.5">
            <strong>Please Note:</strong> Repeated late arrivals may impact your attendance record,
            performance evaluation, and salary calculations as per company policy.
            If you have a valid reason for this late arrival, please submit an
            <strong>Attendance Regularization</strong> request through the ESS portal.
          </p>
        </div>

        <!-- CTA -->
        <p style="margin:0 0 20px;font-size:13px;color:#475569">
          You can submit a regularization request or view your attendance record by clicking the button below:
        </p>
        <p style="margin:0 0 24px">
          <a href="${ERP_URL}/ess" style="display:inline-block;background:#0f2a52;color:#fff;padding:11px 22px;border-radius:8px;text-decoration:none;font-weight:700;font-size:13px">
            View My Attendance →
          </a>
        </p>

        ${managerName ? `<p style="margin:0 0 8px;font-size:13px;color:#64748b">This notice has been sent to you and your reporting manager <strong>${managerName}</strong>.</p>` : ''}

        <p style="margin:0;font-size:13px;color:#475569">
          Regards,<br/>
          <strong>HR Department</strong><br/>
          ${companyName}
        </p>

        <hr style="border:none;border-top:1px solid #f1f5f9;margin:20px 0"/>
        <p style="margin:0;font-size:10px;color:#94a3b8">
          This is an automated notification from BCIM ERP. Please do not reply to this email.
          For queries, contact HR at <a href="mailto:hr@bcim.in" style="color:#3b82f6">hr@bcim.in</a>.
        </p>
      </div>
    </div>`;

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
        a.id, a.user_id, a.attendance_date, a.check_in, a.late_minutes,
        u.name AS employee_name, u.email AS employee_email, u.employee_code,
        COALESCE(ep.shift_start_time, s.start_time) AS shift_start,
        m.name AS manager_name, m.email AS manager_email
      FROM hr_attendance a
      JOIN users u ON u.id = a.user_id
      LEFT JOIN employee_profiles ep ON ep.user_id = a.user_id
      LEFT JOIN hr_shifts s ON s.id = ep.shift_id
      LEFT JOIN users m ON m.id = ep.reporting_manager_id
      WHERE a.company_id = $1
        AND a.attendance_date = $2
        AND a.late_minutes >= $3
        AND a.status = 'present'
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
          : [emp.employee_email, emp.manager_email].filter(Boolean);

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

module.exports = { sendLateArrivalAlerts, buildLateEmail };
