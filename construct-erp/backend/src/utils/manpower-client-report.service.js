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
const { runSchemaInit } = require('./schemaInit');

const DEFAULT_CRON = '0 10 * * *';
const TZ      = process.env.MANPOWER_REPORT_TZ || process.env.TZ || 'Asia/Kolkata';
const ERP_URL = process.env.API_BASE_URL || 'https://erp.bcim.in';
const DEFAULT_COMPANY_ID = process.env.MANPOWER_REPORT_COMPANY_ID || '83b84668-7840-444e-8df9-350202e7bca0';

// ── manpower_report_configs — one row per project that should get its own
// daily email + recipient list, so the report can cover any number of
// projects instead of the single hardcoded one this started as. ────────────
async function initConfigTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS manpower_report_configs (
      id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id   UUID NOT NULL REFERENCES companies(id),
      project_id   TEXT,                 -- real project UUID as text, 'HEAD_OFFICE', or NULL for all-projects-combined
      project_name TEXT NOT NULL,
      recipients   TEXT NOT NULL,
      enabled      BOOLEAN DEFAULT true,
      created_by   UUID REFERENCES users(id),
      created_at   TIMESTAMPTZ DEFAULT NOW(),
      updated_at   TIMESTAMPTZ DEFAULT NOW()
    )
  `);
}
runSchemaInit('manpower-report-configs', initConfigTable);

// One-time seed from the original env-based single-project setup, so the
// existing DQS Towers report keeps sending after this migration to
// per-project configs — only runs if there was a legacy env recipient list.
runSchemaInit('manpower-report-configs-seed-legacy', async () => {
  const legacyRecipients = process.env.MANPOWER_REPORT_CLIENT_EMAILS;
  if (!legacyRecipients) return;
  const projectId   = process.env.MANPOWER_REPORT_PROJECT_ID || '8bf8a91c-f64c-478a-b6f2-39ed621d9436';
  const projectName = process.env.MANPOWER_REPORT_PROJECT_NAME || 'DQS Towers';
  await query(
    `INSERT INTO manpower_report_configs (company_id, project_id, project_name, recipients)
     VALUES ($1,$2,$3,$4)`,
    [DEFAULT_COMPANY_ID, projectId, projectName, legacyRecipients]
  );
});

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

  const { rows: staffRows } = await query(`
    SELECT
      CASE
          WHEN ep.contractor_name IS NOT NULL AND TRIM(ep.contractor_name) <> ''
               AND UPPER(TRIM(ep.contractor_name)) <> 'BCIM'
            THEN ep.contractor_name
          WHEN COALESCE(ep.employee_category,'staff') = 'workman' THEN 'BCIM WORKERS'
          ELSE 'BCIM STAFF'
        END AS company,
      COALESCE(des.name, u.designation, '—')       AS designation,
      COALESCE(a.site, '')                              AS site,
      COALESCE(a.shift, 'DAY')                          AS shift,
      COUNT(*)::int                                     AS headcount
    FROM hr_attendance a
    JOIN users u                  ON u.id = a.user_id
    LEFT JOIN employee_profiles ep ON ep.user_id = u.id
    LEFT JOIN hr_designations des  ON des.id = ep.designation_id
    WHERE a.company_id = $1 AND a.attendance_date = $2 AND a.status = 'present'
      -- Same de-dup guard as GET /manpower-report: ~80 site labourers exist in
      -- BOTH users/hr_attendance and sc_workers/sc_attendance. When someone is
      -- on the SC roster, the SC query below owns them.
      AND NOT EXISTS (
        SELECT 1 FROM sc_workers w
        WHERE w.company_id = u.company_id AND w.worker_code = u.employee_code
      )
      ${projectFilter}
    GROUP BY
      CASE
          WHEN ep.contractor_name IS NOT NULL AND TRIM(ep.contractor_name) <> ''
               AND UPPER(TRIM(ep.contractor_name)) <> 'BCIM'
            THEN ep.contractor_name
          WHEN COALESCE(ep.employee_category,'staff') = 'workman' THEN 'BCIM WORKERS'
          ELSE 'BCIM STAFF'
        END,
      COALESCE(des.name, u.designation, '—'),
      a.site, a.shift
  `, params);

  const rows = [...staffRows, ...(await fetchScManpowerRows(companyId, projectId, targetDate))];

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

// ── SC/LC labour (subcontractor & labour-contractor site workers) ────────────
// Separate system (sc_workers/sc_attendance), not part of users/hr_attendance
// at all — must be fetched explicitly or Labour/LC contractor crews never
// appear in the client report. withProject prefixes company rows the same
// way fetchAllProjectsManpowerData does for staff, so the two sources merge
// cleanly under the "All Projects (combined)" config.
async function fetchScManpowerRows(companyId, projectId, targetDate, withProject = false) {
  let projectFilter = '';
  const params = [companyId, targetDate];
  if (projectId === 'HEAD_OFFICE') {
    projectFilter = ' AND 1=0'; // no SC/LC workers at head office
  } else if (projectId) {
    projectFilter = ' AND w.project_id = $3';
    params.push(projectId);
  }
  const { rows } = await query(`
    SELECT
      ${withProject ? "COALESCE(p.name, 'Head Office') AS project," : ''}
      UPPER(TRIM(COALESCE(sc.name, 'UNKNOWN CONTRACTOR'))) AS company,
      COALESCE(w.skill_type, '—')  AS designation,
      COALESCE(p.name, '')         AS site,
      'DAY'                        AS shift,
      COUNT(*)::int                AS headcount
    FROM sc_attendance a
    JOIN sc_workers w              ON w.id = a.worker_id
    LEFT JOIN sc_subcontractors sc ON sc.id = a.sc_id
    LEFT JOIN projects p           ON p.id = w.project_id
    WHERE a.company_id = $1 AND a.attendance_date = $2 AND a.status = 'present'
      ${projectFilter}
    GROUP BY ${withProject ? 'COALESCE(p.name, \'Head Office\'),' : ''}
      UPPER(TRIM(COALESCE(sc.name, 'UNKNOWN CONTRACTOR'))), COALESCE(w.skill_type, '—'), p.name
  `, params);
  return rows;
}

// ── Same as fetchManpowerData but for the "All Projects (combined)" config —
// prefixes each row's company label with its project name (e.g.
// "Tech-P3 — BCIM Staff") so the existing company-grouped PDF/email actually
// shows a real project-wise breakdown instead of merging every project's
// headcount into one undifferentiated total.
async function fetchAllProjectsManpowerData(companyId, targetDate) {
  const { rows: rawRows } = await query(`
    SELECT
      COALESCE(pr.name, 'Head Office')                  AS project,
      CASE
          WHEN ep.contractor_name IS NOT NULL AND TRIM(ep.contractor_name) <> ''
               AND UPPER(TRIM(ep.contractor_name)) <> 'BCIM'
            THEN ep.contractor_name
          WHEN COALESCE(ep.employee_category,'staff') = 'workman' THEN 'BCIM WORKERS'
          ELSE 'BCIM STAFF'
        END AS company,
      COALESCE(des.name, u.designation, '—')       AS designation,
      COALESCE(a.site, '')                              AS site,
      COALESCE(a.shift, 'DAY')                          AS shift,
      COUNT(*)::int                                     AS headcount
    FROM hr_attendance a
    JOIN users u                  ON u.id = a.user_id
    LEFT JOIN employee_profiles ep ON ep.user_id = u.id
    LEFT JOIN hr_designations des  ON des.id = ep.designation_id
    LEFT JOIN projects pr          ON pr.id = ep.project_id
    WHERE a.company_id = $1 AND a.attendance_date = $2 AND a.status = 'present'
    GROUP BY
      COALESCE(pr.name, 'Head Office'),
      CASE
          WHEN ep.contractor_name IS NOT NULL AND TRIM(ep.contractor_name) <> ''
               AND UPPER(TRIM(ep.contractor_name)) <> 'BCIM'
            THEN ep.contractor_name
          WHEN COALESCE(ep.employee_category,'staff') = 'workman' THEN 'BCIM WORKERS'
          ELSE 'BCIM STAFF'
        END,
      COALESCE(des.name, u.designation, '—'),
      a.site, a.shift
  `, [companyId, targetDate]);

  const scRawRows = await fetchScManpowerRows(companyId, null, targetDate, true);
  const allRawRows = [...rawRows, ...scRawRows];

  // Project-wise summary (its own table, shown first)
  const projectTotal = new Map();
  const projectOrder = [];
  for (const r of allRawRows) {
    if (!projectTotal.has(r.project)) { projectTotal.set(r.project, 0); projectOrder.push(r.project); }
    projectTotal.set(r.project, projectTotal.get(r.project) + r.headcount);
  }
  const projectSummary = projectOrder
    .map(p => ({ project: p, total: projectTotal.get(p) }))
    .sort((a, b) => b.total - a.total);

  // Compound "Project — Company" label reuses every existing company-grouped
  // pivot/PDF/email code path unchanged.
  const rows = allRawRows.map(r => ({ ...r, company: `${r.project} — ${r.company}` }));

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

  return { rows, companySummary, grandTotal, projectSummary };
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
function buildEmailHtml({ companyName, projectName, dateStr, companySummary, grandTotal, projectSummary }) {
  const th = `padding:9px 12px;background:#1B3A6B;color:#fff;font-size:11px;font-weight:700;text-align:left;white-space:nowrap;border:1px solid #16305a`;
  const td = `padding:8px 12px;font-size:12px;color:#1e293b;border:1px solid #e2e8f0;vertical-align:middle`;

  const rowsHtml = companySummary.map((c, i) => `
    <tr style="background:${i % 2 === 0 ? '#fff' : '#f8fafc'}">
      <td style="${td}">${c.company}</td>
      <td style="${td};text-align:right;font-weight:700;color:#1B3A6B">${c.total}</td>
      <td style="${td};text-align:right;color:#64748b">${grandTotal ? ((c.total / grandTotal) * 100).toFixed(1) : '0.0'}%</td>
    </tr>`).join('');

  const projectTableHtml = projectSummary ? `
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:20px">
        <tr>
          <th style="${th}">Project</th>
          <th style="${th};text-align:right">Headcount</th>
          <th style="${th};text-align:right">% of Total</th>
        </tr>
        ${projectSummary.map((p, i) => `
        <tr style="background:${i % 2 === 0 ? '#fff' : '#f8fafc'}">
          <td style="${td};font-weight:700">${p.project}</td>
          <td style="${td};text-align:right;font-weight:700;color:#1B3A6B">${p.total}</td>
          <td style="${td};text-align:right;color:#64748b">${grandTotal ? ((p.total / grandTotal) * 100).toFixed(1) : '0.0'}%</td>
        </tr>`).join('')}
      </table>` : '';

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

      ${projectTableHtml}

      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
        <tr>
          <th style="${th}">${projectSummary ? 'Project — Company' : 'Company'}</th>
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


// ── Build the PDF attachment natively with pdfkit ────────────────────────────
// Deliberately NOT rendered through headless Chromium: on the Nixpacks build
// image Chromium has no font packages installed, so every glyph rendered blank
// (borders and logo drew fine, all text vanished). pdfkit draws with the PDF
// base-14 fonts (Helvetica), which every PDF reader supplies itself — no
// browser, no system fonts, no extra build packages needed.
//
// Layout mirrors the reference report: merged company cells spanning their
// designation rows, Site x Shift pivot columns with DAY sub-headers, a repeated
// header + grand-total row on every page, and a signature footer.
function buildPdfBuffer({ companyName, projectName, dateStr, dateISO, rows, companySummary, grandTotal, projectSummary }) {
  const isProjectWise = !!projectSummary;
  return new Promise((resolve, reject) => {
    const pivot = buildPivot(rows, grandTotal);
    const { columns, companyGroups, colTotal } = pivot;

    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 0 });
    const chunks = [];
    doc.on('data', c => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const PAGE_W = doc.page.width;
    const PAGE_H = doc.page.height;
    const LEFT = 28;
    const RIGHT = PAGE_W - 28;
    const W = RIGHT - LEFT;
    const BOTTOM = PAGE_H - 30;

    const NAVY = '#1B3A6B', NAVY2 = '#2C4D82', ZEBRA = '#F3F6FB', BORDER = '#C8D2E0',
          COMPANY_BG = '#EEF2FF', TOTAL_BG = '#DBEAFE', GT_BG = '#E8EEF7',
          TXT = '#1E293B', MUTED = '#C9D2DE';

    const printedAt = new Date().toLocaleString('en-IN', {
      timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: true,
    });
    const reportDateShort = new Date(dateISO + 'T00:00:00').toLocaleDateString('en-GB');

    // ── primitives ──────────────────────────────────────────────────────────
    function cell(text, x, y, w, h, o = {}) {
      const size = o.size || 7.5;
      if (o.bg) doc.rect(x, y, w, h).fill(o.bg);
      doc.font(o.bold ? 'Helvetica-Bold' : 'Helvetica')
        .fontSize(size)
        .fillColor(o.color || TXT)
        .text(String(text ?? ''), x + 4, y + (h - size) / 2 - 0.5, {
          width: w - 8, align: o.align || 'left', lineBreak: false, ellipsis: true,
        });
    }
    function grid(x, y, w, h) {
      doc.rect(x, y, w, h).lineWidth(0.5).strokeColor(BORDER).stroke();
    }

    function drawPageHeader() {
      const top = 26;
      try { doc.image(LOGO_PATH, LEFT, top, { height: 26 }); } catch (_) {}

      doc.font('Helvetica').fontSize(7).fillColor('#666')
        .text(companyName.toUpperCase(), LEFT, top + 1,
          { width: W, align: 'center', characterSpacing: 2, lineBreak: false });
      doc.font('Helvetica-Bold').fontSize(14).fillColor(NAVY)
        .text('OVERALL DAILY MANPOWER REPORT', LEFT, top + 12,
          { width: W, align: 'center', lineBreak: false });
      doc.font('Helvetica').fontSize(7.5).fillColor('#555')
        .text(`PROJECT: ${String(projectName).toUpperCase()}`, LEFT, top + 30,
          { width: W, align: 'center', lineBreak: false });

      doc.font('Helvetica').fontSize(7).fillColor('#444')
        .text(`REPORT DATE: ${reportDateShort}`, RIGHT - 220, top, { width: 220, align: 'right', lineBreak: false })
        .text(`PRINTED: ${printedAt}`, RIGHT - 220, top + 9, { width: 220, align: 'right', lineBreak: false });

      const badge = `TOTAL PRESENT: ${grandTotal}`;
      doc.font('Helvetica-Bold').fontSize(8);
      const bw = doc.widthOfString(badge) + 18;
      doc.roundedRect(RIGHT - bw, top + 20, bw, 15, 2).fill(NAVY);
      doc.fillColor('#fff').text(badge, RIGHT - bw, top + 24, { width: bw, align: 'center', lineBreak: false });

      doc.moveTo(LEFT, top + 44).lineTo(RIGHT, top + 44).lineWidth(2).strokeColor(NAVY).stroke();
      return top + 54;
    }

    function sectionTitle(text, y) {
      doc.font('Helvetica-Bold').fontSize(8).fillColor(NAVY)
        .text(text.toUpperCase(), LEFT, y, { characterSpacing: 0.8, lineBreak: false });
      doc.moveTo(LEFT, y + 11).lineTo(RIGHT, y + 11).lineWidth(0.8).strokeColor(NAVY).stroke();
      return y + 17;
    }

    // ── page 1: header + company-wise summary ───────────────────────────────
    let y = drawPageHeader();
    y = sectionTitle(isProjectWise ? 'Project-wise Present Summary' : 'Company-wise Present Summary', y);

    const sCols = [
      { label: isProjectWise ? 'PROJECT — COMPANY / CONTRACTOR' : 'COMPANY / CONTRACTOR', w: 320, align: 'left' },
      { label: 'NO. OF DESIGNATIONS',  w: 150, align: 'center' },
      { label: 'TOTAL PRESENT',        w: 150, align: 'center' },
      { label: '% OF TOTAL',           w: W - 620, align: 'center' },
    ];
    const SH = 16;

    let x = LEFT;
    doc.rect(LEFT, y, W, SH).fill(NAVY);
    sCols.forEach(c => { cell(c.label, x, y, c.w, SH, { bold: true, color: '#fff', size: 7, align: c.align }); x += c.w; });
    y += SH;

    companySummary.forEach((c, i) => {
      x = LEFT;
      const bg = i % 2 ? ZEBRA : '#ffffff';
      const vals = [
        c.company,
        c.designations,
        c.total,
        grandTotal ? `${((c.total / grandTotal) * 100).toFixed(1)}%` : '0%',
      ];
      sCols.forEach((col, j) => {
        cell(vals[j], x, y, col.w, SH, {
          bg, align: col.align, bold: j === 0 || j === 2, color: j === 2 ? NAVY : TXT,
        });
        grid(x, y, col.w, SH);
        x += col.w;
      });
      y += SH;
    });

    x = LEFT;
    const gvals = ['GRAND TOTAL', companySummary.reduce((s, c) => s + c.designations, 0), grandTotal, '100%'];
    sCols.forEach((col, j) => {
      cell(gvals[j], x, y, col.w, SH, { bg: GT_BG, bold: true, align: col.align, color: j === 2 ? NAVY : TXT });
      grid(x, y, col.w, SH);
      x += col.w;
    });
    y += SH + 16;

    // ── detailed pivot table ────────────────────────────────────────────────
    y = sectionTitle('Detailed Manpower — Site x Shift', y);

    const flatShiftCols = columns.flatMap(c => c.shifts.map(s => ({ bucket: c.key, shift: s, key: `${c.key}|${s}` })));
    const C_COMPANY = 140, C_DESIG = 175, C_TOTAL = 75;
    const dynW = Math.max(42, (W - C_COMPANY - C_DESIG - C_TOTAL) / Math.max(1, flatShiftCols.length));
    const RH = 14, HDR1 = 15, HDR2 = 13, HDR_H = HDR1 + HDR2, GT_H = 16;

    function drawDetailHeader(yy) {
      doc.rect(LEFT, yy, W, HDR_H).fill(NAVY);
      cell(isProjectWise ? 'PROJECT / COMPANY' : 'COMPANY', LEFT, yy, C_COMPANY, HDR_H, { bold: true, color: '#fff', size: 7 });
      cell('DESIGNATION', LEFT + C_COMPANY, yy, C_DESIG, HDR_H, { bold: true, color: '#fff', size: 7 });
      let xx = LEFT + C_COMPANY + C_DESIG;
      columns.forEach(c => {
        const cw = dynW * c.shifts.length;
        cell(c.label.toUpperCase(), xx, yy, cw, HDR1, { bold: true, color: '#fff', size: 7, align: 'center' });
        doc.rect(xx, yy + HDR1, cw, HDR2).fill(NAVY2);
        let sx = xx;
        c.shifts.forEach(s => {
          cell(String(s).toUpperCase(), sx, yy + HDR1, dynW, HDR2, { bold: true, color: '#fff', size: 6.5, align: 'center' });
          sx += dynW;
        });
        xx += cw;
      });
      cell('TOTAL', xx, yy, C_TOTAL, HDR_H, { bold: true, color: '#fff', size: 7, align: 'center' });
      return yy + HDR_H;
    }

    // Flatten company groups, then pre-compute pagination so merged company
    // cells can be drawn per page-segment (a group split across a page break
    // gets its label redrawn on the next page).
    const flatRows = [];
    companyGroups.forEach(g => g.designationRows.forEach(d => flatRows.push({
      company: g.company, designation: d.designation, cells: d.cells, total: d.total,
    })));

    const CONT_TOP = 80 + HDR_H; // continuation pages: header(80) + table header
    const pages = [];
    {
      let cur = [];
      let yy = y + HDR_H;
      for (const r of flatRows) {
        if (yy + RH > BOTTOM - GT_H) { pages.push(cur); cur = []; yy = CONT_TOP; }
        cur.push(r);
        yy += RH;
      }
      pages.push(cur);
    }

    let lastRowY = y;
    pages.forEach((pageRows, pi) => {
      let ry;
      if (pi === 0) {
        ry = drawDetailHeader(y);
      } else {
        doc.addPage();
        ry = drawDetailHeader(drawPageHeader());
      }

      // designation + value cells
      let rowY = ry;
      pageRows.forEach((r, i) => {
        const bg = i % 2 ? ZEBRA : '#ffffff';
        cell(r.designation, LEFT + C_COMPANY, rowY, C_DESIG, RH, { bg });
        grid(LEFT + C_COMPANY, rowY, C_DESIG, RH);
        let xx = LEFT + C_COMPANY + C_DESIG;
        flatShiftCols.forEach(sc => {
          const v = r.cells[sc.key];
          cell(v || '—', xx, rowY, dynW, RH, { bg, align: 'center', bold: !!v, color: v ? TXT : MUTED });
          grid(xx, rowY, dynW, RH);
          xx += dynW;
        });
        cell(r.total, xx, rowY, C_TOTAL, RH, { bg: TOTAL_BG, align: 'center', bold: true, color: NAVY });
        grid(xx, rowY, C_TOTAL, RH);
        rowY += RH;
      });

      // merged company cells for each contiguous run on this page
      let idx = 0, segY = ry;
      while (idx < pageRows.length) {
        let j = idx;
        while (j < pageRows.length && pageRows[j].company === pageRows[idx].company) j++;
        const segH = (j - idx) * RH;
        cell(pageRows[idx].company, LEFT, segY, C_COMPANY, segH, { bg: COMPANY_BG, bold: true });
        grid(LEFT, segY, C_COMPANY, segH);
        segY += segH;
        idx = j;
      }

      // grand total row, repeated at the foot of every page
      cell('GRAND TOTAL', LEFT, rowY, C_COMPANY + C_DESIG, GT_H, { bg: GT_BG, bold: true, align: 'right', size: 8 });
      grid(LEFT, rowY, C_COMPANY + C_DESIG, GT_H);
      let gx = LEFT + C_COMPANY + C_DESIG;
      flatShiftCols.forEach(sc => {
        const t = colTotal(sc.bucket, sc.shift);
        cell(t || '—', gx, rowY, dynW, GT_H, { bg: GT_BG, align: 'center', bold: true, size: 8 });
        grid(gx, rowY, dynW, GT_H);
        gx += dynW;
      });
      cell(grandTotal, gx, rowY, C_TOTAL, GT_H, { bg: GT_BG, align: 'center', bold: true, color: NAVY, size: 8 });
      grid(gx, rowY, C_TOTAL, GT_H);
      rowY += GT_H;
      lastRowY = rowY;
    });

    // ── signature footer ────────────────────────────────────────────────────
    let sy = lastRowY + 20;
    if (sy + 70 > BOTTOM) { doc.addPage(); drawPageHeader(); sy = 100; }
    doc.moveTo(LEFT, sy).lineTo(RIGHT, sy).lineWidth(0.5).strokeColor('#DDDDDD').stroke();
    sy += 16;
    const sigs = [
      ['PREPARED BY', 'HR Executive'],
      ['VERIFIED BY', 'HR Manager'],
      ['SITE INCHARGE', 'Project Manager'],
      ['APPROVED BY', 'Management / Director'],
    ];
    const sw = W / 4;
    sigs.forEach(([role, name], i) => {
      const sx = LEFT + i * sw;
      doc.moveTo(sx + 24, sy + 26).lineTo(sx + sw - 24, sy + 26).lineWidth(1).strokeColor('#333333').stroke();
      doc.font('Helvetica-Bold').fontSize(7).fillColor(NAVY)
        .text(role, sx, sy + 32, { width: sw, align: 'center', lineBreak: false });
      doc.font('Helvetica').fontSize(6.5).fillColor('#555')
        .text(name, sx, sy + 41, { width: sw, align: 'center', lineBreak: false });
      doc.font('Helvetica').fontSize(6.5).fillColor('#888')
        .text('Date: ____________', sx, sy + 50, { width: sw, align: 'center', lineBreak: false });
    });
    doc.font('Helvetica').fontSize(6).fillColor('#AAAAAA')
      .text(`SYSTEM-GENERATED REPORT  |  ${companyName.toUpperCase()}  |  ${printedAt}`,
        LEFT, sy + 66, { width: W, align: 'center', lineBreak: false });

    doc.end();
  });
}

// ── Main runner — sends ONE project's report to ONE recipient list ───────────
async function runManpowerClientReport({
  date, manual = false, recipients: recipientOverride,
  company_id: companyIdOverride, project_id: projectIdOverride, project_name: projectNameOverride,
} = {}) {
  const targetDate = date || todayIST();
  const companyId  = companyIdOverride || DEFAULT_COMPANY_ID;
  const projectId  = projectIdOverride !== undefined ? projectIdOverride : (process.env.MANPOWER_REPORT_PROJECT_ID || '8bf8a91c-f64c-478a-b6f2-39ed621d9436');
  const projectName = projectNameOverride || process.env.MANPOWER_REPORT_PROJECT_NAME || 'DQS Towers';

  const recipients = recipientOverride
    ? parseEmails(Array.isArray(recipientOverride) ? recipientOverride.join(',') : recipientOverride)
    : parseEmails(process.env.MANPOWER_REPORT_CLIENT_EMAILS);

  if (!recipients.length) {
    logger.warn(`Manpower client report [${projectName}]: no recipients configured`);
    return { ok: false, reason: 'No recipients configured', project_name: projectName };
  }

  const companyRes = await query(`SELECT name FROM companies WHERE id=$1`, [companyId]);
  const companyName = companyRes.rows[0]?.name || 'BCIM';
  const dateStr = fmtDateLong(targetDate);

  const { rows, companySummary, grandTotal, projectSummary } = projectId === null
    ? await fetchAllProjectsManpowerData(companyId, targetDate)
    : await fetchManpowerData(companyId, projectId, targetDate);

  if (!rows.length) {
    logger.warn(`Manpower client report [${projectName}]: no present-attendance data for ${targetDate} — skipping send`);
    return { ok: false, reason: 'No attendance data for date', date: targetDate, project_name: projectName };
  }

  const html = buildEmailHtml({ companyName, projectName, dateStr, companySummary, grandTotal, projectSummary });
  const pdfBuffer = await buildPdfBuffer({ companyName, projectName, dateStr, dateISO: targetDate, rows, companySummary, grandTotal, projectSummary });

  const subject = `Daily Manpower Report — ${projectName} — ${dateStr}`;
  const attachments = [{
    filename: `Manpower-Report-${targetDate}.pdf`,
    base64: pdfBuffer.toString('base64'),
    contentType: 'application/pdf',
  }];

  const mailResult = await sendMail({ to: recipients, subject, html, attachments })
    .catch(e => ({ sent: false, error: e.message }));

  logger.info(`Manpower client report [${projectName}] ${targetDate}: ${grandTotal} deployed → ${recipients.join(', ')}`);
  return { ok: true, ran_at: new Date().toISOString(), date: targetDate, grandTotal, recipients, mail: mailResult, manual, project_name: projectName };
}

// ── Runs every enabled project config, one email each ────────────────────────
async function runAllManpowerClientReports(date) {
  const { rows: configs } = await query(
    `SELECT * FROM manpower_report_configs WHERE enabled=true ORDER BY project_name`
  );
  if (!configs.length) {
    logger.warn('Manpower client report: no enabled project configs found — nothing to send');
    return { ok: false, reason: 'No project configs configured', results: [] };
  }

  const results = [];
  for (const cfg of configs) {
    const result = await runManpowerClientReport({
      date,
      company_id: cfg.company_id,
      project_id: cfg.project_id,
      project_name: cfg.project_name,
      recipients: cfg.recipients,
    }).catch(e => ({ ok: false, reason: e.message, project_name: cfg.project_name }));
    results.push(result);
  }
  return { ok: true, results };
}

// ── Scheduler ─────────────────────────────────────────────────────────────────
function initManpowerClientReport() {
  if (String(process.env.MANPOWER_REPORT_ENABLED || 'true').toLowerCase() === 'false') {
    logger.info('Manpower client-report scheduler disabled (MANPOWER_REPORT_ENABLED=false)');
    return;
  }
  const schedule = process.env.MANPOWER_REPORT_CRON || DEFAULT_CRON;

  cron.schedule(schedule, () => {
    logger.info('Manpower client report: running daily send for all project configs');
    runAllManpowerClientReports()
      .then(r => logger.info(`Manpower client report results: ${JSON.stringify(r.results?.map(x => ({ project: x.project_name, ok: x.ok, reason: x.reason, grandTotal: x.grandTotal })))}`))
      .catch(err => logger.error('Manpower client report failed:', err.message));
  }, { timezone: TZ });

  logger.info(`Manpower client-report scheduler initialized (${schedule} ${TZ})`);
}

module.exports = { runManpowerClientReport, runAllManpowerClientReports, initManpowerClientReport };
