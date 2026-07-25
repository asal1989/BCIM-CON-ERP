// src/utils/manpower-client-report.service.js
// Sends the Overall Daily Manpower Report to the client every morning,
// as an HTML summary in the email body plus a PDF attachment.
// Runs at 10:00 AM IST by default.

const fs   = require('fs');
const path = require('path');
const cron = require('node-cron');
const PDFDocument = require('pdfkit');
const logger = require('./logger');
const { query } = require('../config/database');
const { sendMail } = require('../services/mail.service');

const DEFAULT_CRON = '0 10 * * *';
const TZ      = process.env.MANPOWER_REPORT_TZ || process.env.TZ || 'Asia/Kolkata';
const ERP_URL = process.env.API_BASE_URL || 'https://erp.bcim.in';

// Same site-bucket logic as GET /hr-admin/attendance/manpower-report — kept in
// sync manually since this runs standalone via cron, not as an HTTP request.
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

let LOGO_PATH = path.join(__dirname, '../../../frontend/public/bcim-logo.png');
let LOGO_SRC = `${ERP_URL}/bcim-logo.png`;
try {
  const b64 = fs.readFileSync(LOGO_PATH).toString('base64');
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

// ── Fetch + pivot manpower data (same shape as the live report endpoint) ─────
async function fetchManpowerData(companyId, projectId, targetDate) {
  let projectFilter = '';
  const params = [companyId, targetDate];
  if (projectId === 'HEAD_OFFICE') {
    projectFilter = ' AND ep.project_id IS NULL';
  } else if (projectId) {
    projectFilter = ' AND ep.project_id = $3';
    params.push(projectId);
  }

  const { rows } = await query(`
    SELECT
      COALESCE(ep.contractor_name,
        CASE WHEN COALESCE(ep.employee_category,'staff') = 'workman'
             THEN 'BCIM WORKERS' ELSE 'BCIM STAFF' END) AS company,
      COALESCE(des.name, u.designation, '—')       AS designation,
      COALESCE(a.site, '')                              AS site,
      COALESCE(a.shift, 'DAY')                          AS shift,
      COUNT(*)::int                                     AS headcount
    FROM hr_attendance a
    JOIN users u                  ON u.id = a.user_id
    LEFT JOIN employee_profiles ep ON ep.user_id = u.id
    LEFT JOIN hr_designations des  ON des.id = ep.designation_id
    WHERE a.company_id = $1 AND a.attendance_date = $2 AND a.status = 'present'
      ${projectFilter}
    GROUP BY
      COALESCE(ep.contractor_name,
        CASE WHEN COALESCE(ep.employee_category,'staff') = 'workman'
             THEN 'BCIM WORKERS' ELSE 'BCIM STAFF' END),
      COALESCE(des.name, u.designation, '—'),
      a.site, a.shift
  `, params);

  const companyMap = {};
  const companyOrder = [];
  for (const r of rows) {
    if (!companyMap[r.company]) { companyMap[r.company] = 0; companyOrder.push(r.company); }
    companyMap[r.company] += r.headcount;
  }
  const companySummary = companyOrder
    .map(c => ({ company: c, total: companyMap[c] }))
    .sort((a, b) => b.total - a.total);
  const grandTotal = companySummary.reduce((s, c) => s + c.total, 0);

  return { rows, companySummary, grandTotal };
}

// ── Build the client-facing HTML email body ───────────────────────────────────
function buildEmailHtml({ companyName, projectName, dateStr, companySummary, grandTotal }) {
  const th = `padding:9px 12px;background:#1B3A6B;color:#fff;font-size:11px;font-weight:700;text-align:left;white-space:nowrap;border:1px solid #16305a`;
  const td = `padding:8px 12px;font-size:12px;color:#1e293b;border:1px solid #e2e8f0;vertical-align:middle`;

  const rowsHtml = companySummary.map((c, i) => `
    <tr style="background:${i % 2 === 0 ? '#fff' : '#f8fafc'}">
      <td style="${td}">${c.company}</td>
      <td style="${td};text-align:right;font-weight:700;color:#1B3A6B">${c.total}</td>
      <td style="${td};text-align:right;color:#64748b">${grandTotal ? ((c.total / grandTotal) * 100).toFixed(1) : '0.0'}%</td>
    </tr>`).join('');

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#e8edf5;font-family:Arial,Helvetica,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#e8edf5;padding:28px 0">
<tr><td align="center">
<table width="680" cellpadding="0" cellspacing="0" style="max-width:680px;width:100%;border-collapse:collapse">

  <tr><td style="background:#1B3A6B;height:5px;border-radius:8px 8px 0 0;font-size:1px;line-height:1px">&nbsp;</td></tr>

  <tr>
    <td style="background:#1B3A6B;padding:20px 28px">
      <table width="100%" cellpadding="0" cellspacing="0"><tr>
        <td>
          <p style="color:rgba(255,255,255,0.7);font-size:10px;margin:0 0 2px;letter-spacing:0.08em;text-transform:uppercase">Daily Site Report</p>
          <p style="color:#fff;font-size:15px;font-weight:800;margin:0;letter-spacing:0.3px">MANPOWER DEPLOYMENT — ${dateStr}</p>
        </td>
        <td align="right">
          <div style="background:rgba(255,255,255,0.15);border-radius:10px;padding:10px 18px;text-align:center;min-width:60px">
            <div style="color:#fff;font-size:28px;font-weight:800;line-height:1">${grandTotal}</div>
            <div style="color:rgba(255,255,255,0.8);font-size:10px;font-weight:700;letter-spacing:0.05em;text-transform:uppercase;margin-top:2px">Total</div>
          </div>
        </td>
      </tr></table>
    </td>
  </tr>

  <tr>
    <td style="background:#fff;padding:22px 24px">
      <p style="margin:0 0 6px;font-size:13px;color:#475569">Dear Sir/Madam,</p>
      <p style="font-size:13px;color:#475569;margin:8px 0 16px">
        Please find below the manpower deployment summary for <strong>${projectName}</strong> as of <strong>${dateStr}</strong>.
        The detailed trade-wise and designation-wise breakup is attached as a PDF.
      </p>

      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
        <tr>
          <th style="${th}">Company</th>
          <th style="${th};text-align:right">Headcount</th>
          <th style="${th};text-align:right">% of Total</th>
        </tr>
        ${rowsHtml}
        <tr style="background:#eef2f7">
          <td style="${td};font-weight:800">Grand Total</td>
          <td style="${td};text-align:right;font-weight:900;color:#1B3A6B">${grandTotal}</td>
          <td style="${td};text-align:right;font-weight:700">100%</td>
        </tr>
      </table>

      <p style="font-size:12.5px;color:#64748b;margin:20px 0 0">
        Please reach out if you need any clarification on deployment numbers or specific trade allocation.
      </p>
    </td>
  </tr>

  <tr>
    <td style="background:#f8fafc;padding:18px 24px;border-top:1px solid #e2e8f0">
      <p style="margin:0 0 4px;font-size:12px;color:#64748b">Best regards,</p>
      <p style="margin:0 0 16px;font-size:12px;color:#1e293b"><strong>${companyName}</strong></p>
      <table width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #e2e8f0;padding-top:14px">
        <tr>
          <td><img src="${LOGO_SRC}" alt="BCIM" height="18" style="display:inline-block;height:18px;border:0"></td>
          <td align="right">
            <span style="color:#94a3b8;font-size:11px">Automated report · ${new Date().toLocaleString('en-IN', { timeZone: TZ })}</span>
          </td>
        </tr>
      </table>
    </td>
  </tr>

  <tr><td style="background:#1B3A6B;height:4px;border-radius:0 0 8px 8px;font-size:1px;line-height:1px">&nbsp;</td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;
}

// ── Build the detailed PDF attachment (Company > Designation, headcount) ─────
function buildPdfBuffer({ companyName, projectName, dateStr, rows, companySummary, grandTotal }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 40 });
    const chunks = [];
    doc.on('data', c => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // Header
    try { doc.image(LOGO_PATH, 40, 36, { height: 34 }); } catch (_) {}
    doc.fontSize(8).fillColor('#555').text(companyName.toUpperCase(), 90, 40, { characterSpacing: 1 });
    doc.fontSize(15).fillColor('#1B3A6B').font('Helvetica-Bold').text('OVERALL DAILY MANPOWER REPORT', 90, 52);
    doc.fontSize(9).fillColor('#444').font('Helvetica').text(`${projectName} · ${dateStr}`, 90, 72);
    doc.moveTo(40, 92).lineTo(555, 92).lineWidth(2).strokeColor('#1B3A6B').stroke();

    // Company summary table
    let y = 110;
    doc.fontSize(11).fillColor('#1B3A6B').font('Helvetica-Bold').text('Company-wise Summary', 40, y);
    y += 20;
    doc.fontSize(9).font('Helvetica-Bold');
    doc.rect(40, y, 515, 18).fill('#1B3A6B');
    doc.fillColor('#fff').text('Company', 46, y + 5).text('Headcount', 380, y + 5, { width: 80, align: 'right' }).text('%', 470, y + 5, { width: 75, align: 'right' });
    y += 18;
    doc.font('Helvetica').fontSize(9);
    companySummary.forEach((c, i) => {
      const bg = i % 2 === 0 ? '#ffffff' : '#f3f6fb';
      doc.rect(40, y, 515, 16).fill(bg);
      doc.fillColor('#0f172a').text(c.company, 46, y + 4)
        .text(String(c.total), 380, y + 4, { width: 80, align: 'right' })
        .text(grandTotal ? `${((c.total / grandTotal) * 100).toFixed(1)}%` : '0%', 470, y + 4, { width: 75, align: 'right' });
      y += 16;
    });
    doc.rect(40, y, 515, 18).fill('#eef2f7');
    doc.font('Helvetica-Bold').fillColor('#1B3A6B')
      .text('Grand Total', 46, y + 5)
      .text(String(grandTotal), 380, y + 5, { width: 80, align: 'right' })
      .text('100%', 470, y + 5, { width: 75, align: 'right' });
    y += 34;

    // Detailed pivot: Company / Designation / Site / Shift / Headcount
    doc.fontSize(11).fillColor('#1B3A6B').font('Helvetica-Bold').text('Detailed Breakdown', 40, y);
    y += 20;
    doc.fontSize(8).font('Helvetica-Bold');
    doc.rect(40, y, 515, 16).fill('#1B3A6B');
    doc.fillColor('#fff')
      .text('Company', 46, y + 4, { width: 130 })
      .text('Designation', 176, y + 4, { width: 150 })
      .text('Site', 326, y + 4, { width: 90 })
      .text('Shift', 416, y + 4, { width: 60 })
      .text('Count', 476, y + 4, { width: 70, align: 'right' });
    y += 16;
    doc.font('Helvetica').fontSize(8);
    rows
      .sort((a, b) => a.company.localeCompare(b.company) || a.designation.localeCompare(b.designation))
      .forEach((r, i) => {
        if (y > 780) { doc.addPage(); y = 40; }
        const bg = i % 2 === 0 ? '#ffffff' : '#f3f6fb';
        doc.rect(40, y, 515, 14).fill(bg);
        const bucket = bucketSite(r.site);
        doc.fillColor('#1e293b')
          .text(r.company, 46, y + 3, { width: 130 })
          .text(r.designation, 176, y + 3, { width: 150 })
          .text(bucket.label, 326, y + 3, { width: 90 })
          .text(r.shift, 416, y + 3, { width: 60 })
          .text(String(r.headcount), 476, y + 3, { width: 70, align: 'right' });
        y += 14;
      });

    doc.fontSize(7).fillColor('#94a3b8')
      .text(`Automated report · Generated ${new Date().toLocaleString('en-IN', { timeZone: TZ })}`, 40, 800, { width: 515, align: 'center' });

    doc.end();
  });
}

// ── Main runner ───────────────────────────────────────────────────────────────
async function runManpowerClientReport({ date, manual = false, recipients: recipientOverride } = {}) {
  const targetDate = date || todayIST();
  const companyId  = process.env.MANPOWER_REPORT_COMPANY_ID || '83b84668-7840-444e-8df9-350202e7bca0';
  const projectId  = process.env.MANPOWER_REPORT_PROJECT_ID || '8bf8a91c-f64c-478a-b6f2-39ed621d9436';
  const projectName = process.env.MANPOWER_REPORT_PROJECT_NAME || 'DQS Towers';

  const recipients = recipientOverride
    ? parseEmails(Array.isArray(recipientOverride) ? recipientOverride.join(',') : recipientOverride)
    : parseEmails(process.env.MANPOWER_REPORT_CLIENT_EMAILS);

  if (!recipients.length) {
    logger.warn('Manpower client report: no recipients configured (set MANPOWER_REPORT_CLIENT_EMAILS)');
    return { ok: false, reason: 'No recipients configured' };
  }

  const companyRes = await query(`SELECT name FROM companies WHERE id=$1`, [companyId]);
  const companyName = companyRes.rows[0]?.name || 'BCIM';
  const dateStr = fmtDateLong(targetDate);

  const { rows, companySummary, grandTotal } = await fetchManpowerData(companyId, projectId, targetDate);

  if (!rows.length) {
    logger.warn(`Manpower client report: no present-attendance data for ${targetDate} — skipping send`);
    return { ok: false, reason: 'No attendance data for date', date: targetDate };
  }

  const html = buildEmailHtml({ companyName, projectName, dateStr, companySummary, grandTotal });
  const pdfBuffer = await buildPdfBuffer({ companyName, projectName, dateStr, rows, companySummary, grandTotal });

  const subject = `Daily Manpower Report — ${projectName} — ${dateStr}`;
  const attachments = [{
    filename: `Manpower-Report-${targetDate}.pdf`,
    content: pdfBuffer.toString('base64'),
    contentType: 'application/pdf',
  }];

  const mailResult = await sendMail({ to: recipients, subject, html, attachments })
    .catch(e => ({ sent: false, error: e.message }));

  logger.info(`Manpower client report [${projectName}] ${targetDate}: ${grandTotal} deployed → ${recipients.join(', ')}`);
  return { ok: true, ran_at: new Date().toISOString(), date: targetDate, grandTotal, recipients, mail: mailResult, manual };
}

// ── Scheduler ─────────────────────────────────────────────────────────────────
function initManpowerClientReport() {
  if (String(process.env.MANPOWER_REPORT_ENABLED || 'true').toLowerCase() === 'false') {
    logger.info('Manpower client-report scheduler disabled (MANPOWER_REPORT_ENABLED=false)');
    return;
  }
  const schedule = process.env.MANPOWER_REPORT_CRON || DEFAULT_CRON;

  cron.schedule(schedule, () => {
    logger.info('Manpower client report: running daily send');
    runManpowerClientReport()
      .then(r => logger.info(`Manpower client report result: ${JSON.stringify({ ok: r.ok, reason: r.reason, grandTotal: r.grandTotal })}`))
      .catch(err => logger.error('Manpower client report failed:', err.message));
  }, { timezone: TZ });

  logger.info(`Manpower client-report scheduler initialized (${schedule} ${TZ})`);
}

module.exports = { runManpowerClientReport, initManpowerClientReport };
