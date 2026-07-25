// src/utils/manpower-client-report.service.js
// Sends the Overall Daily Manpower Report to the client every morning,
// as an HTML summary in the email body plus a PDF attachment.
// Runs at 10:00 AM IST by default.

const fs   = require('fs');
const path = require('path');
const cron = require('node-cron');
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

  const companyTotal = new Map();
  const companyDesigs = new Map();
  const companyOrder = [];
  for (const r of rows) {
    if (!companyTotal.has(r.company)) { companyTotal.set(r.company, 0); companyDesigs.set(r.company, new Set()); companyOrder.push(r.company); }
    companyTotal.set(r.company, companyTotal.get(r.company) + r.headcount);
    companyDesigs.get(r.company).add(r.designation);
  }
  const companySummary = companyOrder
    .map(c => ({ company: c, designations: companyDesigs.get(c).size, total: companyTotal.get(c) }))
    .sort((a, b) => b.total - a.total);
  const grandTotal = companySummary.reduce((s, c) => s + c.total, 0);

  return { rows, companySummary, grandTotal };
}

// ── Pivot raw rows into { columns, companyGroups, grandTotal } — same shape
// the live Manpower Report page builds client-side, reused here so the PDF
// matches exactly (Company merged rows > Designation, Site x Shift columns).
function buildPivot(rows, grandTotal) {
  const colSet = new Map(); // bucketKey -> { label, shifts:Set }
  for (const r of rows) {
    const bucket = bucketSite(r.site);
    if (!colSet.has(bucket.key)) colSet.set(bucket.key, { label: bucket.label, shifts: new Set() });
    colSet.get(bucket.key).shifts.add(r.shift);
  }
  const bucketOrder = [...SITE_BUCKETS.map(b => b.key), 'other'];
  const columns = bucketOrder
    .filter(k => colSet.has(k))
    .map(k => ({ key: k, label: colSet.get(k).label, shifts: [...colSet.get(k).shifts].sort() }));

  const byCompany = new Map();
  for (const r of rows) {
    if (!byCompany.has(r.company)) byCompany.set(r.company, new Map());
    const desigMap = byCompany.get(r.company);
    if (!desigMap.has(r.designation)) desigMap.set(r.designation, { cells: {}, total: 0 });
    const bucket = bucketSite(r.site);
    const cellKey = `${bucket.key}|${r.shift}`;
    const entry = desigMap.get(r.designation);
    entry.cells[cellKey] = (entry.cells[cellKey] || 0) + r.headcount;
    entry.total += r.headcount;
  }

  const companyGroups = [...byCompany.entries()].map(([company, desigMap]) => {
    const designationRows = [...desigMap.entries()]
      .map(([designation, d]) => ({ designation, cells: d.cells, total: d.total }))
      .sort((a, b) => a.designation.localeCompare(b.designation));
    const subtotal = designationRows.reduce((s, d) => s + d.total, 0);
    return { company, designationRows, subtotal };
  }).sort((a, b) => b.subtotal - a.subtotal);

  const colTotal = (colKey, shift) => rows
    .filter(r => bucketSite(r.site).key === colKey && r.shift === shift)
    .reduce((s, r) => s + r.headcount, 0);

  return { columns, companyGroups, grandTotal, colTotal };
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

// ── Build the PDF attachment by rendering HTML (same layout as the live
// Manpower Report print view) through headless Chromium — merged company
// cells, Site x Shift pivot columns, grand totals, signature footer.
function escapeHtml(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function buildPdfHtml({ companyName, projectName, dateStr, dateISO, companySummary, grandTotal, pivot }) {
  const { columns, companyGroups, colTotal } = pivot;
  const printedAt = new Date().toLocaleString('en-IN', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true });
  const reportDateShort = new Date(dateISO + 'T00:00:00').toLocaleDateString('en-GB');

  const summaryRows = companySummary.map(c => `
    <tr>
      <td class="lft bold">${escapeHtml(c.company)}</td>
      <td class="ctr">${c.designations}</td>
      <td class="ctr bold navy">${c.total}</td>
      <td class="ctr">${grandTotal ? ((c.total / grandTotal) * 100).toFixed(1) : '0.0'}%</td>
    </tr>`).join('');

  const totalCols = columns.reduce((n, c) => n + c.shifts.length, 0);

  const pivotHeaderTop = `
    <th class="lft" rowspan="2" style="min-width:150px">Company</th>
    <th class="lft" rowspan="2" style="min-width:170px">Designation</th>
    ${columns.map(c => `<th colspan="${c.shifts.length}">${escapeHtml(c.label)}</th>`).join('')}
    <th class="ctr" rowspan="2">Total</th>`;
  const pivotHeaderSub = columns.flatMap(c => c.shifts.map(s => `<th class="ctr sub">${escapeHtml(s)}</th>`)).join('');

  const pivotBody = companyGroups.map(g => {
    const rowsHtml = g.designationRows.map((d, i) => `
      <tr>
        ${i === 0 ? `<td class="lft bold company-cell" rowspan="${g.designationRows.length}">${escapeHtml(g.company)}</td>` : ''}
        <td class="lft">${escapeHtml(d.designation)}</td>
        ${columns.flatMap(c => c.shifts.map(s => {
          const v = d.cells[`${c.key}|${s}`];
          return `<td class="ctr">${v || '—'}</td>`;
        })).join('')}
        <td class="ctr bold navy total-cell">${d.total}</td>
      </tr>`).join('');
    return rowsHtml;
  }).join('');

  const grandTotalRow = `
    <tr class="grand-total-row">
      <td class="lft bold" colspan="2">Grand Total</td>
      ${columns.flatMap(c => c.shifts.map(s => `<td class="ctr bold">${colTotal(c.key, s) || '—'}</td>`)).join('')}
      <td class="ctr bold navy">${grandTotal}</td>
    </tr>`;

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color:#1e293b; margin:0; padding:24px 28px; font-size:9.5pt; }
  .header { display:flex; align-items:center; border-bottom:3px solid #1B3A6B; padding-bottom:10px; margin-bottom:16px; }
  .header img { height:46px; margin-right:16px; }
  .header-center { flex:1; text-align:center; }
  .company-name { font-size:8pt; font-weight:700; letter-spacing:2px; color:#555; }
  .report-title { font-size:16pt; font-weight:800; color:#1B3A6B; letter-spacing:0.5px; margin:2px 0; }
  .project-line { font-size:8.5pt; color:#555; }
  .header-right { text-align:right; font-size:7.5pt; color:#444; line-height:1.6; white-space:nowrap; }
  .header-right .badge { display:inline-block; background:#1B3A6B; color:#fff; font-weight:800; font-size:9pt; padding:3px 10px; border-radius:3px; margin-top:2px; }
  .section-title { font-size:9.5pt; font-weight:800; color:#1B3A6B; letter-spacing:0.5px; text-transform:uppercase; margin:14px 0 6px; }
  table { width:100%; border-collapse:collapse; margin-bottom:4px; }
  th, td { border:1px solid #cbd5e1; padding:4px 8px; font-size:8.5pt; }
  th { background:#1B3A6B; color:#fff; font-weight:700; text-align:left; text-transform:uppercase; font-size:7.5pt; letter-spacing:0.3px; }
  th.sub { font-size:7pt; background:#2c4d82; }
  td.lft { text-align:left; }
  td.ctr, th.ctr { text-align:center; }
  td.bold { font-weight:700; }
  td.navy { color:#1B3A6B; }
  tbody tr:nth-child(even) td { background:#F3F6FB; }
  .company-cell { background:#EEF2FF !important; vertical-align:top; }
  .total-cell { background:#DBEAFE !important; }
  .grand-total-row td { background:#E8EEF7 !important; border-top:2px solid #1B3A6B; font-size:9pt; }
  .sig-section { margin-top:36px; page-break-inside:avoid; }
  .sig-row { display:flex; justify-content:space-between; gap:16px; }
  .sig-col { flex:1; text-align:center; }
  .sig-line { border-bottom:1.5px solid #333; height:34px; margin-bottom:6px; }
  .sig-role { font-size:8pt; font-weight:700; color:#1B3A6B; }
  .sig-name { font-size:7.5pt; color:#555; margin-top:2px; }
  .sig-date { font-size:7.5pt; color:#888; margin-top:2px; }
  .footer-note { text-align:center; margin-top:14px; padding-top:10px; border-top:1px solid #e2e8f0; font-size:7pt; color:#94a3b8; }
</style></head>
<body>

  <div class="header">
    <img src="${LOGO_SRC}" alt="BCIM" />
    <div class="header-center">
      <div class="company-name">${escapeHtml(companyName.toUpperCase())}</div>
      <div class="report-title">OVERALL DAILY MANPOWER REPORT</div>
      <div class="project-line">PROJECT: ${escapeHtml(projectName.toUpperCase())}</div>
    </div>
    <div class="header-right">
      REPORT DATE: ${reportDateShort}<br>
      PRINTED: ${printedAt}<br>
      <span class="badge">TOTAL PRESENT: ${grandTotal}</span>
    </div>
  </div>

  <div class="section-title">Company-wise Present Summary</div>
  <table>
    <thead><tr>
      <th class="lft">Company / Contractor</th>
      <th class="ctr">No. of Designations</th>
      <th class="ctr">Total Present</th>
      <th class="ctr">% of Total</th>
    </tr></thead>
    <tbody>
      ${summaryRows}
      <tr class="grand-total-row">
        <td class="lft bold">Grand Total</td>
        <td class="ctr bold">${companySummary.reduce((s, c) => s + c.designations, 0)}</td>
        <td class="ctr bold navy">${grandTotal}</td>
        <td class="ctr bold">100%</td>
      </tr>
    </tbody>
  </table>

  <div class="section-title">Detailed Manpower — Site &times; Shift</div>
  <table>
    <thead>
      <tr>${pivotHeaderTop}</tr>
      <tr>${pivotHeaderSub}</tr>
    </thead>
    <tbody>
      ${pivotBody}
      ${grandTotalRow}
    </tbody>
  </table>

  <div class="sig-section">
    <div class="sig-row">
      <div class="sig-col"><div class="sig-line"></div><div class="sig-role">PREPARED BY</div><div class="sig-name">HR Executive</div><div class="sig-date">Date: ____________</div></div>
      <div class="sig-col"><div class="sig-line"></div><div class="sig-role">VERIFIED BY</div><div class="sig-name">HR Manager</div><div class="sig-date">Date: ____________</div></div>
      <div class="sig-col"><div class="sig-line"></div><div class="sig-role">SITE INCHARGE</div><div class="sig-name">Project Manager</div><div class="sig-date">Date: ____________</div></div>
      <div class="sig-col"><div class="sig-line"></div><div class="sig-role">APPROVED BY</div><div class="sig-name">Management / Director</div><div class="sig-date">Date: ____________</div></div>
    </div>
    <div class="footer-note">SYSTEM-GENERATED REPORT &nbsp;|&nbsp; ${escapeHtml(companyName.toUpperCase())} &nbsp;|&nbsp; ${printedAt}</div>
  </div>

</body></html>`;
}

async function buildPdfBuffer({ companyName, projectName, dateStr, dateISO, rows, companySummary, grandTotal }) {
  const puppeteer = require('puppeteer');
  const { resolveChromiumPath } = require('./chromium-resolver');

  const pivot = buildPivot(rows, grandTotal);
  const html = buildPdfHtml({ companyName, projectName, dateStr, dateISO, companySummary, grandTotal, pivot });

  const executablePath = resolveChromiumPath();
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: executablePath || undefined,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'load' });
    const buffer = await page.pdf({
      format: 'A4',
      landscape: true,
      printBackground: true,
      margin: { top: '10mm', bottom: '10mm', left: '8mm', right: '8mm' },
    });
    return buffer;
  } finally {
    await browser.close();
  }
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
  const pdfBuffer = await buildPdfBuffer({ companyName, projectName, dateStr, dateISO: targetDate, rows, companySummary, grandTotal });

  const subject = `Daily Manpower Report — ${projectName} — ${dateStr}`;
  const attachments = [{
    filename: `Manpower-Report-${targetDate}.pdf`,
    base64: pdfBuffer.toString('base64'),
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
