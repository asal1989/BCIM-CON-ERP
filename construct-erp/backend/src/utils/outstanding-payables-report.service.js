// src/utils/outstanding-payables-report.service.js
// Sends the per-project Outstanding Payables Report — the SAME report as
// the manual PDF export on LiabilityRegisterPage.jsx's "Outstanding
// Payables" button (GET /tqs/liability-register → getVendorLiabilitySummary),
// not a separately-invented definition. First version of this file used the
// GET /ap-aging query instead, which is a materially different (and
// incomplete) view — no vendor grouping, no advances-given section, no TDS
// total — caught when the user compared it against a manually-exported PDF
// and the numbers didn't match. Runs daily at 9:00 AM IST by default.

const cron = require('node-cron');
const path = require('path');
const fs = require('fs');
const PDFDocument = require('pdfkit');
const logger = require('./logger');
const { query } = require('../config/database');
const { sendMail } = require('../services/mail.service');
const { runSchemaInit } = require('./schemaInit');
const { getVendorLiabilitySummary } = require('../services/tqsLiability.service');

const DEFAULT_CRON = '0 9 * * *';
const TZ = process.env.OUTSTANDING_PAYABLES_REPORT_TZ || process.env.TZ || 'Asia/Kolkata';
const DEFAULT_COMPANY_ID = process.env.MANPOWER_REPORT_COMPANY_ID || '83b84668-7840-444e-8df9-350202e7bca0';

async function initConfigTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS outstanding_payables_report_configs (
      id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id   UUID NOT NULL REFERENCES companies(id),
      project_id   UUID NOT NULL,
      project_name TEXT NOT NULL,
      recipients   TEXT NOT NULL DEFAULT '',
      notify_roles TEXT NOT NULL DEFAULT '',
      enabled      BOOLEAN DEFAULT true,
      created_by   UUID REFERENCES users(id),
      created_at   TIMESTAMPTZ DEFAULT NOW(),
      updated_at   TIMESTAMPTZ DEFAULT NOW()
    )
  `);
}
runSchemaInit('outstanding-payables-report-configs-v1', initConfigTable);

runSchemaInit('outstanding-payables-report-seed-lancho', async () => {
  await query(`
    INSERT INTO outstanding_payables_report_configs
      (company_id, project_id, project_name, recipients, notify_roles, enabled)
    VALUES ($1, $2, $3, $4, $5, true)
  `, [
    DEFAULT_COMPANY_ID,
    '310260ce-2166-4dd6-8472-aeb468e1f611',
    'LANCO Hills - LH 10',
    'prithivi@bcim.in,it@bcim.in',
    'procurement_manager',
  ]);
});

function parseList(value) {
  return String(value || '').split(/[;,]/).map(v => v.trim()).filter(Boolean);
}
function todayIST() {
  return new Date().toLocaleDateString('en-CA', { timeZone: TZ });
}
function inr(value) {
  return Math.round(Number(value || 0)).toLocaleString('en-IN');
}
function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

async function resolveRoleEmails(companyId, roles) {
  if (!roles.length) return [];
  const { rows } = await query(
    `SELECT DISTINCT email FROM users
     WHERE company_id=$1 AND role = ANY($2::text[]) AND is_active=TRUE AND email IS NOT NULL`,
    [companyId, roles]
  );
  return rows.map(r => r.email);
}

let LOGO_PATH = path.join(__dirname, '../../../frontend/public/bcim-logo.png');
let LOGO_SRC = null;
try { LOGO_SRC = `data:image/png;base64,${fs.readFileSync(LOGO_PATH).toString('base64')}`; } catch (_) {}

// ── Same row split as exportProjectStatement() on LiabilityRegisterPage ────
function splitRows(vendors) {
  const payableRows = vendors
    .filter(v => parseFloat(v.payable_balance || 0) > 0.5)
    .sort((a, b) => parseFloat(b.payable_balance) - parseFloat(a.payable_balance));
  const advanceRows = vendors
    .filter(v => parseFloat(v.total_advance_open || 0) > 0.5)
    .sort((a, b) => parseFloat(b.total_advance_open) - parseFloat(a.total_advance_open));
  const totals = {
    invoiced: vendors.reduce((s, v) => s + parseFloat(v.total_invoiced || 0), 0),
    paid:     vendors.reduce((s, v) => s + parseFloat(v.total_paid || 0), 0),
    tds:      vendors.reduce((s, v) => s + parseFloat(v.total_tds || 0), 0),
    payable:  payableRows.reduce((s, v) => s + parseFloat(v.payable_balance || 0), 0),
    advanceOpen: advanceRows.reduce((s, v) => s + parseFloat(v.total_advance_open || 0), 0),
  };
  return { payableRows, advanceRows, totals };
}

function buildEmailHtml({ companyName, projectName, dateStr, payableRows, advanceRows, totals }) {
  const th = `padding:8px 10px;background:#1B3A6B;color:#fff;font-size:11px;font-weight:700;text-align:left;white-space:nowrap;border:1px solid #16305a`;
  const td = `padding:7px 10px;font-size:12px;color:#1e293b;border:1px solid #e2e8f0;vertical-align:middle`;

  const payableHtml = payableRows.map((v, i) => `
    <tr style="background:${i % 2 === 0 ? '#fff' : '#f8fafc'}">
      <td style="${td}">${i + 1}</td>
      <td style="${td}">${v.vendor_name}</td>
      <td style="${td};text-align:center">${v.bill_count || 0}</td>
      <td style="${td};text-align:right">₹${inr(v.total_invoiced)}</td>
      <td style="${td};text-align:right">₹${inr(v.total_paid)}</td>
      <td style="${td};text-align:right;font-weight:700;color:#dc2626">₹${inr(v.payable_balance)}</td>
      <td style="${td};text-align:center">${fmtDate(v.last_activity_date)}</td>
    </tr>`).join('');

  const advanceHtml = advanceRows.length ? `
    <p style="font-size:13px;font-weight:700;color:#1e293b;margin:20px 0 6px">
      Advances Given &amp; Not Yet Adjusted (${advanceRows.length}) — for information, not part of the payable total above
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
      <tr>
        <th style="${th.replace('#1B3A6B', '#b45309').replace('#16305a', '#92400e')}">Sl</th>
        <th style="${th.replace('#1B3A6B', '#b45309').replace('#16305a', '#92400e')}">Vendor Name</th>
        <th style="${th.replace('#1B3A6B', '#b45309').replace('#16305a', '#92400e')};text-align:right">Advance Given</th>
        <th style="${th.replace('#1B3A6B', '#b45309').replace('#16305a', '#92400e')};text-align:right">Open Balance</th>
      </tr>
      ${advanceRows.map((v, i) => `
      <tr style="background:${i % 2 === 0 ? '#fff' : '#fef6e7'}">
        <td style="${td}">${i + 1}</td>
        <td style="${td}">${v.vendor_name}</td>
        <td style="${td};text-align:right">₹${inr(v.total_advance_given)}</td>
        <td style="${td};text-align:right;font-weight:700;color:#b45309">₹${inr(v.total_advance_open)}</td>
      </tr>`).join('')}
      <tr style="background:#fef3d0">
        <td colspan="3" style="${td};font-weight:800;text-align:right">Total Advance Open</td>
        <td style="${td};text-align:right;font-weight:900;color:#b45309">₹${inr(totals.advanceOpen)}</td>
      </tr>
    </table>` : '';

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#e8edf5;font-family:Arial,Helvetica,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#e8edf5;padding:28px 0">
<tr><td align="center">
<table width="780" cellpadding="0" cellspacing="0" style="max-width:780px;width:100%;border-collapse:collapse">

  <tr><td style="background:#1B3A6B;height:5px;border-radius:8px 8px 0 0;font-size:1px;line-height:1px">&nbsp;</td></tr>

  <tr>
    <td style="background:#1B3A6B;padding:20px 28px">
      <p style="color:rgba(255,255,255,0.7);font-size:10px;margin:0 0 2px;letter-spacing:0.08em;text-transform:uppercase">Bill Tracker — Liability Register</p>
      <p style="color:#fff;font-size:16px;font-weight:800;margin:0;letter-spacing:0.3px">OUTSTANDING PAYABLES REPORT</p>
      <p style="color:rgba(255,255,255,0.65);font-size:11px;margin:2px 0 0;font-style:italic">Vendor-wise Liability Summary — Prepared for Payment Processing</p>
    </td>
  </tr>

  <tr>
    <td style="background:#fff;padding:22px 24px">
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:16px">
        <tr>
          <td style="padding:8px 12px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px 0 0 6px;width:33%">
            <div style="font-size:9px;color:#64748b;font-weight:700;text-transform:uppercase">Project</div>
            <div style="font-size:13px;color:#0f172a;font-weight:700">${projectName}</div>
          </td>
          <td style="width:6px"></td>
          <td style="padding:8px 12px;background:#f8fafc;border:1px solid #e2e8f0;width:33%">
            <div style="font-size:9px;color:#64748b;font-weight:700;text-transform:uppercase">Report Date</div>
            <div style="font-size:13px;color:#0f172a;font-weight:700">${dateStr}</div>
          </td>
          <td style="width:6px"></td>
          <td style="padding:8px 12px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:0 6px 6px 0;width:33%">
            <div style="font-size:9px;color:#64748b;font-weight:700;text-transform:uppercase">Status</div>
            <div style="font-size:13px;color:#0f172a;font-weight:700">For Accounts Review</div>
          </td>
        </tr>
      </table>

      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:20px">
        <tr>
          <th style="${th};text-align:center">Total Invoiced</th>
          <th style="${th};text-align:center">Total Paid</th>
          <th style="${th};text-align:center">TDS Deducted</th>
          <th style="${th};text-align:center">Outstanding Payable</th>
        </tr>
        <tr>
          <td style="${td};text-align:center;font-weight:700">₹${inr(totals.invoiced)}</td>
          <td style="${td};text-align:center;font-weight:700">₹${inr(totals.paid)}</td>
          <td style="${td};text-align:center;font-weight:700">₹${inr(totals.tds)}</td>
          <td style="${td};text-align:center;font-weight:900;color:#dc2626;font-size:14px">₹${inr(totals.payable)}</td>
        </tr>
      </table>

      <p style="font-size:13px;font-weight:700;color:#1e293b;margin:0 0 6px">Vendors with Outstanding Balance (${payableRows.length})</p>
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
        <tr>
          <th style="${th}">Sl</th>
          <th style="${th}">Vendor Name</th>
          <th style="${th};text-align:center">Bills</th>
          <th style="${th};text-align:right">Invoiced</th>
          <th style="${th};text-align:right">Paid</th>
          <th style="${th};text-align:right">Outstanding</th>
          <th style="${th};text-align:center">Last Activity</th>
        </tr>
        ${payableHtml || `<tr><td colspan="7" style="${td};text-align:center;color:#94a3b8">No outstanding balance for any vendor.</td></tr>`}
        <tr style="background:#eef2f7">
          <td colspan="5" style="${td};font-weight:800;text-align:right">Total Outstanding</td>
          <td style="${td};text-align:right;font-weight:900;color:#1B3A6B">₹${inr(totals.payable)}</td>
          <td style="${td}"></td>
        </tr>
      </table>

      ${advanceHtml}

      <p style="font-size:12.5px;color:#64748b;margin:20px 0 0">
        Please reach out if you need clarification on any vendor's certification or payment status.
      </p>
    </td>
  </tr>

  <tr>
    <td style="background:#f8fafc;padding:18px 24px;border-top:1px solid #e2e8f0">
      <p style="margin:0 0 4px;font-size:12px;color:#64748b">Best regards,</p>
      <p style="margin:0 0 16px;font-size:12px;color:#1e293b"><strong>${companyName}</strong></p>
      <p style="margin:0;color:#94a3b8;font-size:11px">Generated on ${dateStr} · System-generated report from Bill Tracker — Liability Register</p>
    </td>
  </tr>

  <tr><td style="background:#1B3A6B;height:4px;border-radius:0 0 8px 8px;font-size:1px;line-height:1px">&nbsp;</td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;
}

// ── PDF attachment — mirrors the manual export's sections (letterhead, info
// cards, summary totals, vendor table, advances table, sign-off) so the
// emailed artifact matches what someone gets from the "Outstanding
// Payables" button on the Liability Register page. ────────────────────────
function buildPdfBuffer({ companyName, projectName, dateStr, payableRows, advanceRows, totals }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 36 });
    const chunks = [];
    doc.on('data', c => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const NAVY = '#1B3A6B', RED = '#dc2626', AMBER = '#b45309', MUTED = '#64748b', INK = '#0f172a', BORDER = '#d9e2ef';
    const L = doc.page.margins.left;
    const R = doc.page.width - doc.page.margins.right;
    const W = R - L;

    if (LOGO_SRC) { try { doc.image(LOGO_PATH, L, 30, { height: 26 }); } catch (_) {} }
    doc.font('Helvetica-Bold').fontSize(16).fillColor(NAVY).text('OUTSTANDING PAYABLES REPORT', L, 32, { width: W, align: 'center' });
    doc.font('Helvetica-Oblique').fontSize(8).fillColor(MUTED).text('Vendor-wise Liability Summary — Prepared for Payment Processing', L, 52, { width: W, align: 'center' });
    doc.moveTo(L, 68).lineTo(R, 68).lineWidth(1.5).strokeColor(NAVY).stroke();

    let y = 78;
    const cardW = (W - 12) / 3;
    [['PROJECT', projectName], ['REPORT DATE', dateStr], ['STATUS', 'For Accounts Review']].forEach(([label, value], i) => {
      const x = L + i * (cardW + 6);
      doc.rect(x, y, cardW, 30).fillAndStroke('#f7fafc', BORDER);
      doc.font('Helvetica-Bold').fontSize(6.5).fillColor(MUTED).text(label, x + 6, y + 5);
      doc.font('Helvetica-Bold').fontSize(9).fillColor(INK).text(String(value || '—'), x + 6, y + 15, { width: cardW - 12 });
    });
    y += 40;

    const sumColW = W / 4;
    doc.rect(L, y, W, 16).fill(NAVY);
    ['Total Invoiced', 'Total Paid', 'TDS Deducted', 'Outstanding Payable'].forEach((h, i) => {
      doc.font('Helvetica-Bold').fontSize(8).fillColor('#fff').text(h, L + i * sumColW, y + 4, { width: sumColW, align: 'center' });
    });
    y += 16;
    doc.rect(L, y, W, 18).stroke(BORDER);
    [inr(totals.invoiced), inr(totals.paid), inr(totals.tds), inr(totals.payable)].forEach((v, i) => {
      doc.font('Helvetica-Bold').fontSize(9).fillColor(i === 3 ? RED : INK).text(`Rs. ${v}`, L + i * sumColW, y + 5, { width: sumColW, align: 'center' });
    });
    y += 30;

    doc.font('Helvetica-Bold').fontSize(10).fillColor(INK).text(`Vendors with Outstanding Balance (${payableRows.length})`, L, y);
    y += 15;

    const cols = [
      { key: 'sl', label: 'Sl', w: 20, align: 'center' },
      { key: 'vendor_name', label: 'Vendor Name', w: W - 20 - 30 - 90 - 90 - 90 - 60, align: 'left' },
      { key: 'bill_count', label: 'Bills', w: 30, align: 'center' },
      { key: 'total_invoiced', label: 'Invoiced', w: 90, align: 'right' },
      { key: 'total_paid', label: 'Paid', w: 90, align: 'right' },
      { key: 'payable_balance', label: 'Outstanding', w: 90, align: 'right' },
      { key: 'last_activity_date', label: 'Last Activity', w: 60, align: 'center' },
    ];
    function drawRow(vals, opts = {}) {
      const rh = 14;
      if (y + rh > doc.page.height - 60) { doc.addPage(); y = 40; }
      let x = L;
      if (opts.bg) doc.rect(L, y, W, rh).fill(opts.bg);
      cols.forEach((c, i) => {
        doc.font(opts.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(7.5).fillColor(opts.color && i === 5 ? opts.color : INK)
          .text(String(vals[i] ?? ''), x + 2, y + 3, { width: c.w - 4, align: c.align, lineBreak: false, ellipsis: true });
        x += c.w;
      });
      y += rh;
    }
    doc.rect(L, y, W, 14).fill(NAVY);
    let hx = L;
    cols.forEach(c => { doc.font('Helvetica-Bold').fontSize(7).fillColor('#fff').text(c.label, hx + 2, y + 3, { width: c.w - 4, align: c.align, lineBreak: false }); hx += c.w; });
    y += 14;
    payableRows.forEach((v, i) => drawRow(
      [i + 1, v.vendor_name, v.bill_count || 0, `Rs.${inr(v.total_invoiced)}`, `Rs.${inr(v.total_paid)}`, `Rs.${inr(v.payable_balance)}`, fmtDate(v.last_activity_date)],
      { bg: i % 2 ? '#f5f8fc' : '#fff', color: RED }
    ));
    if (!payableRows.length) drawRow(['', 'No outstanding balance for any vendor.', '', '', '', '', '']);
    drawRow(['', 'TOTAL OUTSTANDING', '', '', '', `Rs.${inr(totals.payable)}`, ''], { bg: '#eef2f7', bold: true, color: NAVY });
    y += 16;

    if (advanceRows.length) {
      if (y > doc.page.height - 100) { doc.addPage(); y = 40; }
      doc.font('Helvetica-Bold').fontSize(10).fillColor(INK).text(`Advances Given & Not Yet Adjusted (${advanceRows.length}) — for information, not part of the payable total above`, L, y, { width: W });
      y += 18;
      const acols = [
        { label: 'Sl', w: 20, align: 'center' },
        { label: 'Vendor Name', w: W - 20 - 130 - 130, align: 'left' },
        { label: 'Advance Given', w: 130, align: 'right' },
        { label: 'Open Balance', w: 130, align: 'right' },
      ];
      doc.rect(L, y, W, 14).fill(AMBER);
      let ax = L;
      acols.forEach(c => { doc.font('Helvetica-Bold').fontSize(7).fillColor('#fff').text(c.label, ax + 2, y + 3, { width: c.w - 4, align: c.align, lineBreak: false }); ax += c.w; });
      y += 14;
      advanceRows.forEach((v, i) => {
        const rh = 14;
        if (y + rh > doc.page.height - 60) { doc.addPage(); y = 40; }
        if (i % 2) doc.rect(L, y, W, rh).fill('#fef6e7');
        let ax2 = L;
        const vals = [i + 1, v.vendor_name, `Rs.${inr(v.total_advance_given)}`, `Rs.${inr(v.total_advance_open)}`];
        acols.forEach((c, j) => {
          doc.font('Helvetica').fontSize(7.5).fillColor(j === 3 ? AMBER : INK).text(String(vals[j]), ax2 + 2, y + 3, { width: c.w - 4, align: c.align, lineBreak: false });
          ax2 += c.w;
        });
        y += rh;
      });
      doc.rect(L, y, W, 14).fill('#fef3d0');
      let fx = L;
      const fvals = ['', 'TOTAL ADVANCE OPEN', '', `Rs.${inr(totals.advanceOpen)}`];
      acols.forEach((c, j) => { doc.font('Helvetica-Bold').fontSize(7.5).fillColor(AMBER).text(fvals[j], fx + 2, y + 3, { width: c.w - 4, align: c.align, lineBreak: false }); fx += c.w; });
      y += 24;
    }

    if (y > doc.page.height - 120) { doc.addPage(); y = 40; }
    const bw = (W - 12) / 2;
    [['Prepared By (QS / Projects)'], ['Verified & Approved By (Accounts)']].forEach((b, i) => {
      const x = L + i * (bw + 12);
      doc.roundedRect(x, y, bw, 44, 3).stroke(BORDER);
      doc.font('Helvetica-Bold').fontSize(8).fillColor(INK).text(b[0], x + 6, y + 6);
      doc.font('Helvetica').fontSize(7).fillColor(MUTED).text('Name: ____________________', x + 6, y + 22);
      doc.font('Helvetica').fontSize(7).fillColor(MUTED).text('Signature / Date: ____________________', x + 6, y + 33);
    });
    y += 54;
    doc.font('Helvetica-Oblique').fontSize(7).fillColor(MUTED)
      .text(`Generated on ${dateStr} · System-generated report from Bill Tracker — Liability Register`, L, y, { width: W, align: 'center' });

    doc.end();
  });
}

// ── Main runner — sends ONE project's report ──────────────────────────────
async function runOutstandingPayablesReport({
  date, manual = false, recipients: recipientOverride,
  company_id: companyIdOverride, project_id: projectIdOverride, project_name: projectNameOverride,
  notify_roles: notifyRolesOverride,
} = {}) {
  const targetDate = date || todayIST();
  const companyId = companyIdOverride || DEFAULT_COMPANY_ID;
  const projectId = projectIdOverride;
  const projectName = projectNameOverride || 'Project';

  if (!projectId) return { ok: false, reason: 'No project_id configured', project_name: projectName };

  const fixedRecipients = recipientOverride
    ? parseList(Array.isArray(recipientOverride) ? recipientOverride.join(',') : recipientOverride)
    : [];
  const roleEmails = await resolveRoleEmails(companyId, parseList(notifyRolesOverride));
  const recipients = [...new Set([...fixedRecipients, ...roleEmails])];

  if (!recipients.length) {
    logger.warn(`Outstanding payables report [${projectName}]: no recipients configured`);
    return { ok: false, reason: 'No recipients configured', project_name: projectName };
  }

  const companyRes = await query(`SELECT name FROM companies WHERE id=$1`, [companyId]);
  const companyName = companyRes.rows[0]?.name || 'BCIM';
  const dateStr = new Date(targetDate + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

  const vendors = await getVendorLiabilitySummary({ companyId, projectId });
  const { payableRows, advanceRows, totals } = splitRows(vendors);

  const html = buildEmailHtml({ companyName, projectName, dateStr, payableRows, advanceRows, totals });
  const pdfBuffer = await buildPdfBuffer({ companyName, projectName, dateStr, payableRows, advanceRows, totals });
  const subject = `Outstanding Payables Report — ${projectName} — ${dateStr}`;
  const attachments = [{
    filename: `Outstanding_Payables_${projectName.replace(/[^a-z0-9]+/gi, '_')}_${targetDate}.pdf`,
    base64: pdfBuffer.toString('base64'),
    contentType: 'application/pdf',
  }];

  const mailResult = await sendMail({ to: recipients, subject, html, attachments })
    .catch(e => ({ sent: false, error: e.message }));

  logger.info(`Outstanding payables report [${projectName}] ${targetDate}: ${payableRows.length} vendors, Rs.${inr(totals.payable)} outstanding → ${recipients.join(', ')}`);
  return { ok: true, ran_at: new Date().toISOString(), date: targetDate, vendor_count: payableRows.length, total_outstanding: totals.payable, recipients, mail: mailResult, manual, project_name: projectName };
}

async function runAllOutstandingPayablesReports(date) {
  const { rows: configs } = await query(
    `SELECT * FROM outstanding_payables_report_configs WHERE enabled=true ORDER BY project_name`
  );
  if (!configs.length) {
    logger.warn('Outstanding payables report: no enabled project configs found — nothing to send');
    return { ok: false, reason: 'No project configs configured', results: [] };
  }

  const results = [];
  for (const cfg of configs) {
    const result = await runOutstandingPayablesReport({
      date,
      company_id: cfg.company_id,
      project_id: cfg.project_id,
      project_name: cfg.project_name,
      recipients: cfg.recipients,
      notify_roles: cfg.notify_roles,
    }).catch(e => ({ ok: false, reason: e.message, project_name: cfg.project_name }));
    results.push(result);
  }
  return { ok: true, results };
}

function initOutstandingPayablesReport() {
  if (String(process.env.OUTSTANDING_PAYABLES_REPORT_ENABLED || 'true').toLowerCase() === 'false') {
    logger.info('Outstanding payables report scheduler disabled (OUTSTANDING_PAYABLES_REPORT_ENABLED=false)');
    return;
  }
  const schedule = process.env.OUTSTANDING_PAYABLES_REPORT_CRON || DEFAULT_CRON;

  cron.schedule(schedule, () => {
    logger.info('Outstanding payables report: running daily send for all project configs');
    runAllOutstandingPayablesReports()
      .then(r => logger.info(`Outstanding payables report results: ${JSON.stringify(r.results?.map(x => ({ project: x.project_name, ok: x.ok, reason: x.reason, total: x.total_outstanding })))}`))
      .catch(err => logger.error('Outstanding payables report failed:', err.message));
  }, { timezone: TZ });

  logger.info(`Outstanding payables report scheduler initialized (${schedule} ${TZ})`);
}

module.exports = { runOutstandingPayablesReport, runAllOutstandingPayablesReports, initOutstandingPayablesReport };
