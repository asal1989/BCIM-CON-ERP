// src/utils/timesheet-report.service.js
// Sends the Daily Timesheet Report (per-employee attendance, in/out, late
// minutes, hours) as an HTML summary + PDF attachment — same shape as
// manpower-client-report.service.js, but per-employee detail rather than a
// headcount pivot. Runs at 09:30 AM IST by default.

const path = require('path');
const cron = require('node-cron');
const PDFDocument = require('pdfkit');
const logger = require('./logger');
const { query } = require('../config/database');
const { sendMail } = require('../services/mail.service');
const { runSchemaInit } = require('./schemaInit');

const DEFAULT_CRON = '30 9 * * *';
const TZ      = process.env.TIMESHEET_REPORT_TZ || process.env.TZ || 'Asia/Kolkata';
const LOGO_PATH = path.join(__dirname, '../../../frontend/public/bcim-logo.png');

// ── timesheet_report_configs — one row per (project, category) that should
// get its own daily email + recipient list. ─────────────────────────────────
async function initConfigTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS timesheet_report_configs (
      id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id   UUID NOT NULL REFERENCES companies(id),
      project_id   TEXT,                 -- real project UUID as text, 'HEAD_OFFICE', or NULL for all projects
      project_name TEXT NOT NULL,
      category     TEXT NOT NULL DEFAULT 'staff',  -- staff | labour | all
      recipients   TEXT NOT NULL,
      enabled      BOOLEAN DEFAULT true,
      created_by   UUID REFERENCES users(id),
      created_at   TIMESTAMPTZ DEFAULT NOW(),
      updated_at   TIMESTAMPTZ DEFAULT NOW()
    )
  `);
}
runSchemaInit('timesheet-report-configs', initConfigTable);

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

// ── Fetch attendance rows — same query shape as GET /timesheet-report in
// hr-attendance.routes.js, factored out here so the scheduled/manual send
// and the live report page can never drift out of sync with each other. ────
async function fetchTimesheetReport({ companyId, date, category = 'staff', projectId }) {
  const reportDate = date || todayIST();

  let categoryFilter = '';
  if (category === 'staff') categoryFilter = ` AND COALESCE(ep.employee_category, 'staff') = 'staff'`;
  else if (category === 'labour') categoryFilter = ` AND ep.employee_category = 'workman'`;

  const [companyRes, projectRes, holidayRes] = await Promise.all([
    query(`SELECT name FROM companies WHERE id=$1`, [companyId]),
    projectId && projectId !== 'HEAD_OFFICE'
      ? query(`SELECT name, project_code FROM projects WHERE id=$1`, [projectId])
      : Promise.resolve({ rows: [] }),
    query(`SELECT name FROM hr_holidays WHERE company_id=$1 AND holiday_date::date=$2::date LIMIT 1`, [companyId, reportDate])
      .catch(() => ({ rows: [] })),
  ]);
  const companyName = companyRes.rows[0]?.name || 'BCIM';
  const projectName = projectId === 'HEAD_OFFICE' ? 'Head Office' : (projectRes.rows[0]?.name || (projectId ? null : 'All Projects'));
  const projectCode = projectId === 'HEAD_OFFICE' ? 'HO' : (projectRes.rows[0]?.project_code || null);
  const holidayName = holidayRes.rows[0]?.name || null;
  const isSunday     = new Date(reportDate + 'T00:00:00').getDay() === 0;
  const noRecordStatus = holidayName ? 'holiday' : (isSunday ? 'week_off' : 'absent');

  let deptFilter = '';
  const staffParams = [companyId, reportDate];
  let idx = 3;
  let projectFilter = '';
  if (projectId === 'HEAD_OFFICE') {
    projectFilter = ' AND ep.project_id IS NULL';
  } else if (projectId) {
    projectFilter = ` AND ep.project_id = $${idx}`;
    staffParams.push(projectId);
    idx++;
  }

  const staffRows = (await query(`
    SELECT
      u.employee_code                     AS emp_id,
      u.name,
      COALESCE(des.name, u.designation, '—')             AS designation,
      COALESCE(dep.name, u.department, '—')              AS department,
      CASE
          WHEN ep.contractor_name IS NOT NULL AND TRIM(ep.contractor_name) <> ''
               AND UPPER(TRIM(ep.contractor_name)) <> 'BCIM'
            THEN ep.contractor_name
          WHEN COALESCE(ep.employee_category,'staff') = 'workman' THEN 'BCIM WORKERS'
          ELSE 'BCIM STAFF'
        END AS company,
      ep.trade                            AS trade,
      COALESCE(proj.name, 'Head Office')  AS project_name,
      COALESCE(a.status, '${noRecordStatus}') AS attendance_status,
      TO_CHAR(a.in_time,  'HH12:MI AM')  AS in_time,
      TO_CHAR(a.out_time, 'HH12:MI AM')  AS out_time,
      a.late_minutes,
      CASE WHEN COALESCE(ep.employment_status,'active') = 'active'
           THEN 'ACTIVE' ELSE 'INACTIVE' END AS status,
      CASE WHEN a.in_time IS NOT NULL AND a.out_time IS NOT NULL AND a.out_time > a.in_time
           THEN ROUND(EXTRACT(EPOCH FROM (a.out_time - a.in_time)) / 3600.0, 1)
           ELSE 0 END                     AS hours_worked,
      CASE WHEN a.in_time IS NOT NULL AND a.out_time IS NOT NULL AND a.out_time > a.in_time
           THEN GREATEST(0, ROUND(EXTRACT(EPOCH FROM (a.out_time - a.in_time)) / 3600.0 - 9, 1))
           ELSE 0 END                     AS overtime_hours
    FROM users u
    LEFT JOIN employee_profiles ep   ON ep.user_id = u.id
    LEFT JOIN hr_departments dep     ON dep.id = ep.department_id
    LEFT JOIN hr_designations des    ON des.id = ep.designation_id
    LEFT JOIN projects proj          ON proj.id = ep.project_id
    LEFT JOIN hr_attendance a        ON a.user_id = u.id
                                   AND a.attendance_date = $2
                                   AND a.company_id = $1
    WHERE u.company_id = $1 AND u.is_active = TRUE
      ${categoryFilter} ${deptFilter} ${projectFilter}
    ORDER BY proj.name NULLS LAST, dep.name NULLS LAST, u.name
  `, staffParams)).rows;

  let scRows = [];
  if (category === 'labour' || category === 'all') {
    const scParams = [companyId, reportDate];
    let scProjectFilter = '';
    if (projectId === 'HEAD_OFFICE') {
      scProjectFilter = ' AND 1=0';
    } else if (projectId) {
      scProjectFilter = ` AND w.project_id = $3`;
      scParams.push(projectId);
    }
    scRows = (await query(`
      SELECT
        w.worker_code                       AS emp_id,
        w.worker_name                       AS name,
        w.skill_type                        AS designation,
        'CIVIL'                             AS department,
        sc.name                             AS company,
        w.skill_type                        AS trade,
        COALESCE(p.name, 'Head Office')     AS project_name,
        COALESCE(a.status, '${noRecordStatus}') AS attendance_status,
        TO_CHAR(a.in_time,  'HH12:MI AM')   AS in_time,
        TO_CHAR(a.out_time, 'HH12:MI AM')   AS out_time,
        0                                   AS late_minutes,
        CASE WHEN w.status = 'active' THEN 'ACTIVE' ELSE 'INACTIVE' END AS status,
        COALESCE(a.hours_worked, 0)         AS hours_worked,
        GREATEST(0, COALESCE(a.hours_worked,0) - 8) AS overtime_hours
      FROM sc_workers w
      LEFT JOIN sc_subcontractors sc ON sc.id = w.sc_id
      LEFT JOIN projects p           ON p.id  = w.project_id
      LEFT JOIN sc_attendance a      ON a.worker_id = w.id
                                   AND a.attendance_date = $2
                                   AND a.company_id = $1
      WHERE w.company_id = $1 AND w.status = 'active' ${scProjectFilter}
      ORDER BY sc.name, w.worker_name
    `, scParams)).rows;
  }

  const rows = [...staffRows, ...scRows];
  const present  = rows.filter(r => r.attendance_status === 'present').length;
  const half     = rows.filter(r => r.attendance_status === 'half_day').length;
  const absent   = rows.filter(r => r.attendance_status === 'absent').length;
  const leave    = rows.filter(r => r.attendance_status === 'leave').length;
  const week_off = rows.filter(r => r.attendance_status === 'week_off').length;
  const holiday  = rows.filter(r => r.attendance_status === 'holiday').length;
  const late     = rows.filter(r => (r.late_minutes || 0) > 0).length;
  const expected = Math.max(0, rows.length - week_off - holiday);
  const attendancePct = expected > 0 ? Math.round(((present + half * 0.5) / expected) * 100) : 0;

  return {
    rows, companyName, projectName, projectCode, holidayName, isSunday,
    summary: { total: rows.length, present, half, absent, leave, week_off, holiday, late, expected, attendancePct },
  };
}

// ── HTML email body ───────────────────────────────────────────────────────
function buildEmailHtml({ companyName, projectName, dateStr, summary, rows }) {
  const th = `padding:9px 12px;background:#1B3A6B;color:#fff;font-size:11px;font-weight:700;text-align:left;white-space:nowrap;border:1px solid #16305a`;
  const td = `padding:8px 12px;font-size:12px;color:#1e293b;border:1px solid #e2e8f0;vertical-align:middle`;

  const deptMap = new Map();
  for (const r of rows) {
    const d = r.department || 'Unknown';
    if (!deptMap.has(d)) deptMap.set(d, { present: 0, absent: 0, total: 0 });
    const e = deptMap.get(d);
    e.total++;
    if (r.attendance_status === 'present') e.present++;
    else if (r.attendance_status === 'absent') e.absent++;
  }
  const deptRows = [...deptMap.entries()].sort((a, b) => b[1].total - a[1].total).slice(0, 10);

  const statCard = (label, val, color) => `
    <td align="center" style="padding:0 6px">
      <div style="background:${color}12;border:1px solid ${color}30;border-radius:10px;padding:10px 6px">
        <div style="font-size:20px;font-weight:800;color:${color}">${val}</div>
        <div style="font-size:9px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.04em;margin-top:2px">${label}</div>
      </div>
    </td>`;

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
      <p style="color:rgba(255,255,255,0.7);font-size:10px;margin:0 0 2px;letter-spacing:0.08em;text-transform:uppercase">Daily Site Report</p>
      <p style="color:#fff;font-size:15px;font-weight:800;margin:0;letter-spacing:0.3px">DAILY TIMESHEET / ATTENDANCE — ${dateStr}</p>
    </td>
  </tr>

  <tr>
    <td style="background:#fff;padding:22px 24px">
      <p style="margin:0 0 6px;font-size:13px;color:#475569">Dear Sir/Madam,</p>
      <p style="font-size:13px;color:#475569;margin:8px 0 16px">
        Please find below the attendance summary for <strong>${projectName}</strong> as of <strong>${dateStr}</strong>.
        The detailed employee-wise timesheet is attached as a PDF.
      </p>

      <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:18px"><tr>
        ${statCard('Present', summary.present, '#16a34a')}
        ${statCard('Absent', summary.absent, '#dc2626')}
        ${statCard('Half Day', summary.half, '#6366f1')}
        ${statCard('Leave', summary.leave, '#d97706')}
        ${statCard('Late', summary.late, '#ea580c')}
      </tr></table>

      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:16px">
        <tr>
          <td style="${td};font-weight:700">Total Strength</td>
          <td style="${td};text-align:right;font-weight:800;color:#1B3A6B">${summary.total}</td>
        </tr>
        ${summary.week_off > 0 ? `<tr><td style="${td}">Week Off</td><td style="${td};text-align:right;font-weight:700">${summary.week_off}</td></tr>` : ''}
        ${summary.holiday > 0 ? `<tr><td style="${td}">Holiday</td><td style="${td};text-align:right;font-weight:700">${summary.holiday}</td></tr>` : ''}
        <tr style="background:#eef2f7">
          <td style="${td};font-weight:800">Attendance Rate (of expected)</td>
          <td style="${td};text-align:right;font-weight:900;color:#1B3A6B">${summary.attendancePct}%</td>
        </tr>
      </table>

      ${deptRows.length ? `
      <p style="font-size:11px;font-weight:800;color:#64748b;text-transform:uppercase;letter-spacing:0.06em;margin:0 0 8px">Department Breakdown</p>
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
        <tr><th style="${th}">Department</th><th style="${th};text-align:right">Present</th><th style="${th};text-align:right">Absent</th><th style="${th};text-align:right">Total</th></tr>
        ${deptRows.map(([dept, d], i) => `
        <tr style="background:${i % 2 === 0 ? '#fff' : '#f8fafc'}">
          <td style="${td}">${dept}</td>
          <td style="${td};text-align:right;color:#16a34a;font-weight:700">${d.present}</td>
          <td style="${td};text-align:right;color:#dc2626;font-weight:700">${d.absent}</td>
          <td style="${td};text-align:right;font-weight:700">${d.total}</td>
        </tr>`).join('')}
      </table>` : ''}

      <p style="font-size:12.5px;color:#64748b;margin:20px 0 0">
        Please reach out if you need any clarification on attendance or the attached timesheet.
      </p>
    </td>
  </tr>

  <tr>
    <td style="background:#f8fafc;padding:18px 24px;border-top:1px solid #e2e8f0">
      <p style="margin:0 0 4px;font-size:12px;color:#64748b">Best regards,</p>
      <p style="margin:0;font-size:12px;color:#1e293b"><strong>${companyName}</strong></p>
      <p style="margin:14px 0 0;color:#94a3b8;font-size:11px">Automated report · ${new Date().toLocaleString('en-IN', { timeZone: TZ })}</p>
    </td>
  </tr>

  <tr><td style="background:#1B3A6B;height:4px;border-radius:0 0 8px 8px;font-size:1px;line-height:1px">&nbsp;</td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;
}

// ── PDF attachment — one row per employee, grouped by department, drawn
// natively with pdfkit for the same reason manpower's report is (Chromium on
// the build image renders no glyphs — see that file's comment). ────────────
function buildPdfBuffer({ companyName, projectName, dateStr, dateISO, rows, summary }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A3', layout: 'landscape', margin: 0 });
    const chunks = [];
    doc.on('data', c => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const PAGE_W = doc.page.width, PAGE_H = doc.page.height;
    const LEFT = 28, RIGHT = PAGE_W - 28, W = RIGHT - LEFT, BOTTOM = PAGE_H - 30;
    const NAVY = '#1B3A6B', NAVY2 = '#2C4D82', ZEBRA = '#F3F6FB', BORDER = '#C8D2E0',
          DEPT_BG = '#EEF2FF', GT_BG = '#E8EEF7', TXT = '#1E293B', MUTED = '#9CA3AF';

    const printedAt = new Date().toLocaleString('en-IN', {
      timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true,
    });
    const reportDateShort = new Date(dateISO + 'T00:00:00').toLocaleDateString('en-GB');

    function cell(text, x, y, w, h, o = {}) {
      const size = o.size || 6.5;
      if (o.bg) doc.rect(x, y, w, h).fill(o.bg);
      doc.font(o.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(size).fillColor(o.color || TXT)
        .text(String(text ?? ''), x + 3, y + (h - size) / 2 - 0.5, { width: w - 6, align: o.align || 'left', lineBreak: false, ellipsis: true });
    }
    function grid(x, y, w, h) { doc.rect(x, y, w, h).lineWidth(0.4).strokeColor(BORDER).stroke(); }

    function drawPageHeader() {
      const top = 24;
      try { doc.image(LOGO_PATH, LEFT, top, { height: 24 }); } catch (_) {}
      doc.font('Helvetica').fontSize(6.5).fillColor('#666')
        .text(companyName.toUpperCase(), LEFT, top, { width: W, align: 'center', characterSpacing: 2, lineBreak: false });
      doc.font('Helvetica-Bold').fontSize(13).fillColor(NAVY)
        .text('DAILY TIMESHEET / ATTENDANCE REPORT', LEFT, top + 10, { width: W, align: 'center', lineBreak: false });
      doc.font('Helvetica').fontSize(7).fillColor('#555')
        .text(`PROJECT: ${String(projectName || 'All Projects').toUpperCase()}`, LEFT, top + 27, { width: W, align: 'center', lineBreak: false });
      doc.font('Helvetica').fontSize(6.5).fillColor('#444')
        .text(`REPORT DATE: ${reportDateShort}`, RIGHT - 200, top, { width: 200, align: 'right', lineBreak: false })
        .text(`PRINTED: ${printedAt}`, RIGHT - 200, top + 8, { width: 200, align: 'right', lineBreak: false });

      const badge = `P ${summary.present} · A ${summary.absent} · HD ${summary.half} · L ${summary.leave}${summary.week_off ? ` · WO ${summary.week_off}` : ''}`;
      doc.font('Helvetica-Bold').fontSize(7);
      const bw = doc.widthOfString(badge) + 16;
      doc.roundedRect(RIGHT - bw, top + 17, bw, 14, 2).fill(NAVY);
      doc.fillColor('#fff').text(badge, RIGHT - bw, top + 21, { width: bw, align: 'center', lineBreak: false });

      doc.moveTo(LEFT, top + 40).lineTo(RIGHT, top + 40).lineWidth(1.6).strokeColor(NAVY).stroke();
      return top + 48;
    }

    // Column layout: fixed-weight columns scaled to fill W
    const COLS = [
      { key: 'emp_id',      label: 'EMP ID',  w: 0.09 },
      { key: 'name',        label: 'NAME',    w: 0.15 },
      { key: 'designation', label: 'DESIG.',  w: 0.11 },
      { key: 'company',     label: 'COMPANY', w: 0.14 },
      { key: 'status_pill', label: 'P/A',     w: 0.05, align: 'center' },
      { key: 'in_time',     label: 'IN',      w: 0.08, align: 'center' },
      { key: 'out_time',    label: 'OUT',     w: 0.08, align: 'center' },
      { key: 'late_minutes',label: 'LATE',    w: 0.06, align: 'center' },
      { key: 'hours_worked',label: 'HRS',     w: 0.06, align: 'center' },
      { key: 'overtime_hours', label: 'OT',   w: 0.06, align: 'center' },
      { key: 'status',      label: 'STATUS',  w: 0.12, align: 'center' },
    ];
    const DEPT_W = 130;
    const bodyW = W - DEPT_W;
    const cols = COLS.map(c => ({ ...c, px: bodyW * c.w }));
    const HDR_H = 16, RH = 12;

    function drawTableHeader(yy) {
      doc.rect(LEFT, yy, W, HDR_H).fill(NAVY);
      cell('DEPARTMENT', LEFT, yy, DEPT_W, HDR_H, { bold: true, color: '#fff', size: 6.5 });
      let xx = LEFT + DEPT_W;
      cols.forEach(c => { cell(c.label, xx, yy, c.px, HDR_H, { bold: true, color: '#fff', size: 6.5, align: c.align || 'left' }); xx += c.px; });
      return yy + HDR_H;
    }

    // group + paginate
    const deptGroups = new Map();
    for (const r of rows) {
      const d = r.department || 'Unknown';
      if (!deptGroups.has(d)) deptGroups.set(d, []);
      deptGroups.get(d).push(r);
    }
    const flatRows = [];
    for (const [dept, rs] of deptGroups) for (const r of rs) flatRows.push({ dept, r });

    const CONT_TOP = 72 + HDR_H;
    const pages = [];
    { let cur = [], yy = 72 + HDR_H;
      for (const fr of flatRows) { if (yy + RH > BOTTOM) { pages.push(cur); cur = []; yy = CONT_TOP; } cur.push(fr); yy += RH; }
      pages.push(cur);
    }

    let lastY = 72;
    pages.forEach((pageRows, pi) => {
      let ry;
      if (pi === 0) { ry = drawTableHeader(drawPageHeader()); }
      else { doc.addPage(); ry = drawTableHeader(drawPageHeader()); }

      let rowY = ry;
      pageRows.forEach(({ r }, i) => {
        const bg = i % 2 ? ZEBRA : '#ffffff';
        const isLate = Number(r.late_minutes) > 0;
        let xx = LEFT + DEPT_W;
        const vals = {
          emp_id: r.emp_id || '—', name: r.name, designation: r.designation,
          company: r.company, status_pill: (r.attendance_status || '?')[0]?.toUpperCase() || '?',
          in_time: r.in_time || '—', out_time: r.out_time || '—',
          late_minutes: isLate ? `${r.late_minutes}m` : '—',
          hours_worked: r.hours_worked > 0 ? r.hours_worked : '—',
          overtime_hours: r.overtime_hours > 0 ? `+${r.overtime_hours}` : '—',
          status: r.status,
        };
        cols.forEach(c => {
          cell(vals[c.key], xx, rowY, c.px, RH, {
            bg, align: c.align || 'left',
            color: c.key === 'late_minutes' && isLate ? '#DC2626' : (c.key === 'status' && r.status === 'ACTIVE' ? '#15803D' : TXT),
            bold: c.key === 'name' || (c.key === 'late_minutes' && isLate),
          });
          grid(xx, rowY, c.px, RH);
          xx += c.px;
        });
        rowY += RH;
      });

      // merged department cells
      let idx = 0, segY = ry;
      while (idx < pageRows.length) {
        let j = idx;
        while (j < pageRows.length && pageRows[j].dept === pageRows[idx].dept) j++;
        const segH = (j - idx) * RH;
        cell(pageRows[idx].dept, LEFT, segY, DEPT_W, segH, { bg: DEPT_BG, bold: true, size: 6.5 });
        grid(LEFT, segY, DEPT_W, segH);
        segY += segH; idx = j;
      }
      lastY = rowY;
    });

    // grand total + signature footer
    let gy = lastY + 6;
    if (gy + 60 > BOTTOM) { doc.addPage(); gy = drawPageHeader() + 6; }
    cell('GRAND TOTAL', LEFT, gy, DEPT_W, 15, { bg: GT_BG, bold: true, size: 7 });
    grid(LEFT, gy, DEPT_W, 15);
    cell(`Total ${rows.length}  ·  P ${summary.present}  ·  A ${summary.absent}  ·  HD ${summary.half}  ·  L ${summary.leave}${summary.week_off ? `  ·  WO ${summary.week_off}` : ''}  ·  Attendance ${summary.attendancePct}%`,
      LEFT + DEPT_W, gy, W - DEPT_W, 15, { bg: GT_BG, bold: true, size: 7, color: NAVY });
    grid(LEFT + DEPT_W, gy, W - DEPT_W, 15);

    let sy = gy + 32;
    if (sy + 60 > BOTTOM) { doc.addPage(); drawPageHeader(); sy = 100; }
    doc.moveTo(LEFT, sy).lineTo(RIGHT, sy).lineWidth(0.5).strokeColor('#DDDDDD').stroke();
    sy += 16;
    const sigs = [['PREPARED BY', 'HR Executive'], ['VERIFIED BY', 'HR Manager'], ['SITE INCHARGE', 'Project Manager'], ['APPROVED BY', 'Management / Director']];
    const sw = W / 4;
    sigs.forEach(([role, name], i) => {
      const sx = LEFT + i * sw;
      doc.moveTo(sx + 24, sy + 26).lineTo(sx + sw - 24, sy + 26).lineWidth(1).strokeColor('#333333').stroke();
      doc.font('Helvetica-Bold').fontSize(7).fillColor(NAVY).text(role, sx, sy + 32, { width: sw, align: 'center', lineBreak: false });
      doc.font('Helvetica').fontSize(6.5).fillColor('#555').text(name, sx, sy + 41, { width: sw, align: 'center', lineBreak: false });
      doc.font('Helvetica').fontSize(6.5).fillColor('#888').text('Date: ____________', sx, sy + 50, { width: sw, align: 'center', lineBreak: false });
    });
    doc.font('Helvetica').fontSize(6).fillColor('#AAAAAA')
      .text(`SYSTEM-GENERATED REPORT  |  ${companyName.toUpperCase()}  |  ${printedAt}`, LEFT, sy + 66, { width: W, align: 'center', lineBreak: false });

    doc.end();
  });
}

// ── Main runner — sends ONE config's report to ONE recipient list ───────────
async function runTimesheetReport({
  date, manual = false, recipients: recipientOverride,
  company_id: companyIdOverride, project_id: projectIdOverride, project_name: projectNameOverride,
  category = 'staff',
} = {}) {
  const targetDate = date || todayIST();
  const companyId  = companyIdOverride;
  if (!companyId) return { ok: false, reason: 'No company_id provided' };

  const recipients = recipientOverride
    ? parseEmails(Array.isArray(recipientOverride) ? recipientOverride.join(',') : recipientOverride)
    : [];
  if (!recipients.length) {
    logger.warn(`Timesheet report [${projectNameOverride || projectIdOverride}]: no recipients configured`);
    return { ok: false, reason: 'No recipients configured', project_name: projectNameOverride };
  }

  const { rows, companyName, projectName, summary } = await fetchTimesheetReport({
    companyId, date: targetDate, category, projectId: projectIdOverride,
  });
  const finalProjectName = projectNameOverride || projectName;
  const dateStr = fmtDateLong(targetDate);

  if (!rows.length) {
    logger.warn(`Timesheet report [${finalProjectName}]: no employees for ${targetDate} — skipping send`);
    return { ok: false, reason: 'No employees found for this date/category/project', date: targetDate, project_name: finalProjectName };
  }

  const html = buildEmailHtml({ companyName, projectName: finalProjectName, dateStr, summary, rows });
  const pdfBuffer = await buildPdfBuffer({ companyName, projectName: finalProjectName, dateStr, dateISO: targetDate, rows, summary });

  const subject = `Daily Timesheet Report — ${finalProjectName} — ${dateStr}`;
  const attachments = [{
    filename: `Timesheet-Report-${targetDate}.pdf`,
    base64: pdfBuffer.toString('base64'),
    contentType: 'application/pdf',
  }];

  const mailResult = await sendMail({ to: recipients, subject, html, attachments })
    .catch(e => ({ sent: false, error: e.message }));

  logger.info(`Timesheet report [${finalProjectName}] ${targetDate}: ${summary.present}/${summary.total} present → ${recipients.join(', ')}`);
  return { ok: true, ran_at: new Date().toISOString(), date: targetDate, summary, recipients, mail: mailResult, manual, project_name: finalProjectName };
}

async function runAllTimesheetReports(date) {
  const { rows: configs } = await query(
    `SELECT * FROM timesheet_report_configs WHERE enabled=true ORDER BY project_name`
  );
  if (!configs.length) return { ok: false, reason: 'No project configs configured', results: [] };

  const results = [];
  for (const cfg of configs) {
    const result = await runTimesheetReport({
      date, company_id: cfg.company_id, project_id: cfg.project_id,
      project_name: cfg.project_name, category: cfg.category, recipients: cfg.recipients,
    }).catch(e => ({ ok: false, reason: e.message, project_name: cfg.project_name }));
    results.push(result);
  }
  return { ok: true, results };
}

function initTimesheetReport() {
  if (String(process.env.TIMESHEET_REPORT_ENABLED || 'true').toLowerCase() === 'false') {
    logger.info('Timesheet report scheduler disabled (TIMESHEET_REPORT_ENABLED=false)');
    return;
  }
  const schedule = process.env.TIMESHEET_REPORT_CRON || DEFAULT_CRON;
  cron.schedule(schedule, () => {
    logger.info('Timesheet report: running daily send for all project configs');
    runAllTimesheetReports()
      .then(r => logger.info(`Timesheet report results: ${JSON.stringify(r.results?.map(x => ({ project: x.project_name, ok: x.ok, reason: x.reason })))}`))
      .catch(err => logger.error('Timesheet report failed:', err.message));
  }, { timezone: TZ });
  logger.info(`Timesheet report scheduler initialized (${schedule} ${TZ})`);
}

module.exports = { fetchTimesheetReport, runTimesheetReport, runAllTimesheetReports, initTimesheetReport };
