// src/utils/compliance-weekly-report.service.js — Weekly Statutory Compliance
// Status Report. Runs every Monday morning, well before noon, and lists
// every open (Pending/Overdue) compliance entry across all Projects/HO —
// due amount, paid, outstanding, penalty/interest, damages, delay days,
// status, reason for delay, action required and responsible person — so
// nothing gets missed until it's actually closed.
const cron = require('node-cron');
const logger = require('./logger');
const { query } = require('../config/database');
const { sendMail } = require('../services/mail.service');
const { runSchemaInit } = require('./schemaInit');

const DEFAULT_CRON = '0 9 * * 1'; // Monday 09:00 — comfortably before noon
const TZ = process.env.COMPLIANCE_REPORT_TZ || process.env.TZ || 'Asia/Kolkata';
const DEFAULT_COMPANY_ID = process.env.MANPOWER_REPORT_COMPANY_ID || '83b84668-7840-444e-8df9-350202e7bca0';

async function initConfigTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS compliance_report_configs (
      id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id   UUID NOT NULL,
      recipients   TEXT NOT NULL DEFAULT '',
      enabled      BOOLEAN DEFAULT true,
      created_at   TIMESTAMPTZ DEFAULT NOW(),
      updated_at   TIMESTAMPTZ DEFAULT NOW()
    )
  `);
}
runSchemaInit('compliance-report-configs-v1', initConfigTable);

function parseList(value) {
  return String(value || '').split(/[;,]/).map(v => v.trim()).filter(Boolean);
}
function inr(v) { return Math.round(Number(v || 0)).toLocaleString('en-IN'); }
function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}
function todayIST() {
  return new Date().toLocaleDateString('en-CA', { timeZone: TZ });
}

// A stored status only updates when someone edits that entry, so a Pending
// item just sits there even after its due date passes if nobody touches it
// — this computes the same live status compliance-tracker.routes.js uses,
// so the weekly report doesn't silently skip anything that's gone overdue
// with no stored update to trigger on.
const EFFECTIVE_STATUS_SQL = `
  CASE
    WHEN e.status IN ('Closed','Not Applicable','Paid') THEN e.status
    WHEN e.due_date IS NOT NULL AND e.due_date < CURRENT_DATE THEN 'Overdue'
    ELSE COALESCE(e.status, 'Pending')
  END`;

async function fetchOpenEntries(companyId) {
  const { rows } = await query(`
    SELECT e.*, o.category, o.title AS obligation_title, p.name AS project_name,
           ${EFFECTIVE_STATUS_SQL} AS status
    FROM compliance_entries e
    JOIN compliance_obligations o ON o.id = e.obligation_id
    LEFT JOIN projects p ON p.id = o.project_id
    WHERE e.company_id = $1 AND (${EFFECTIVE_STATUS_SQL}) IN ('Pending','Overdue')
    ORDER BY COALESCE(p.name, 'Head Office'), e.due_date NULLS LAST
  `, [companyId]);
  return rows;
}

function buildEmailHtml({ companyName, dateStr, entries }) {
  const th = `padding:7px 9px;background:#1B3A6B;color:#fff;font-size:10px;font-weight:700;text-align:left;white-space:nowrap;border:1px solid #16305a`;
  const td = `padding:6px 9px;font-size:11px;color:#1e293b;border:1px solid #e2e8f0;vertical-align:middle`;

  const totalOutstanding = entries.reduce((s, e) => s + Number(e.outstanding_amount || 0), 0);
  const totalPenalty = entries.reduce((s, e) => s + Number(e.penalty_interest || 0) + Number(e.damages_charges || 0), 0);
  const overdueCount = entries.filter(e => e.status === 'Overdue').length;

  const groups = {};
  entries.forEach(e => {
    const key = e.project_name || 'Head Office';
    (groups[key] = groups[key] || []).push(e);
  });

  const sections = Object.entries(groups).map(([projectName, rows]) => `
    <p style="font-size:13px;font-weight:700;color:#1e293b;margin:18px 0 6px">${projectName} (${rows.length})</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
      <tr>
        <th style="${th}">Category</th>
        <th style="${th}">Item</th>
        <th style="${th}">Due Date</th>
        <th style="${th};text-align:right">Due</th>
        <th style="${th};text-align:right">Paid</th>
        <th style="${th};text-align:right">Outstanding</th>
        <th style="${th};text-align:right">Penalty/Interest</th>
        <th style="${th};text-align:center">Delay Days</th>
        <th style="${th}">Status</th>
        <th style="${th}">Action Required</th>
        <th style="${th}">Responsible</th>
      </tr>
      ${rows.map((e, i) => `
      <tr style="background:${i % 2 === 0 ? '#fff' : '#f8fafc'}">
        <td style="${td}">${e.category}</td>
        <td style="${td}">${e.obligation_title}${e.period ? ` (${e.period})` : ''}</td>
        <td style="${td}">${fmtDate(e.due_date)}</td>
        <td style="${td};text-align:right">₹${inr(e.due_amount)}</td>
        <td style="${td};text-align:right">₹${inr(e.amount_paid)}</td>
        <td style="${td};text-align:right;font-weight:700;color:${Number(e.outstanding_amount) > 0 ? '#dc2626' : '#16a34a'}">₹${inr(e.outstanding_amount)}</td>
        <td style="${td};text-align:right">₹${inr(Number(e.penalty_interest || 0) + Number(e.damages_charges || 0))}</td>
        <td style="${td};text-align:center;color:${Number(e.delay_days) > 0 ? '#dc2626' : '#1e293b'}">${e.delay_days ?? '—'}</td>
        <td style="${td};font-weight:700;color:${e.status === 'Overdue' ? '#dc2626' : '#b45309'}">${e.status}</td>
        <td style="${td}">${e.action_required || '—'}</td>
        <td style="${td}">${e.responsible_person || '—'}</td>
      </tr>`).join('')}
    </table>`).join('');

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#e8edf5;font-family:Arial,Helvetica,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#e8edf5;padding:28px 0">
<tr><td align="center">
<table width="960" cellpadding="0" cellspacing="0" style="max-width:960px;width:100%;border-collapse:collapse">
  <tr><td style="background:#1B3A6B;height:5px;border-radius:8px 8px 0 0;font-size:1px">&nbsp;</td></tr>
  <tr>
    <td style="background:#1B3A6B;padding:20px 28px">
      <p style="color:rgba(255,255,255,0.7);font-size:10px;margin:0 0 2px;letter-spacing:0.08em;text-transform:uppercase">HR / Admin — Legal &amp; Statutory Compliance</p>
      <p style="color:#fff;font-size:16px;font-weight:800;margin:0">WEEKLY COMPLIANCE STATUS REPORT</p>
      <p style="color:rgba(255,255,255,0.65);font-size:11px;margin:2px 0 0;font-style:italic">All Projects &amp; Head Office — Pending &amp; Overdue Items</p>
    </td>
  </tr>
  <tr>
    <td style="background:#fff;padding:22px 24px">
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:16px">
        <tr>
          <th style="${th};text-align:center">Report Date</th>
          <th style="${th};text-align:center">Open Items</th>
          <th style="${th};text-align:center">Overdue</th>
          <th style="${th};text-align:center">Total Outstanding</th>
          <th style="${th};text-align:center">Total Penalty/Damages</th>
        </tr>
        <tr>
          <td style="${td};text-align:center;font-weight:700">${dateStr}</td>
          <td style="${td};text-align:center;font-weight:700">${entries.length}</td>
          <td style="${td};text-align:center;font-weight:900;color:#dc2626">${overdueCount}</td>
          <td style="${td};text-align:center;font-weight:900;color:#dc2626">₹${inr(totalOutstanding)}</td>
          <td style="${td};text-align:center;font-weight:900;color:#b45309">₹${inr(totalPenalty)}</td>
        </tr>
      </table>
      ${sections || `<p style="color:#94a3b8;font-size:13px">No pending or overdue compliance items — everything is closed.</p>`}
      <p style="font-size:12px;color:#64748b;margin:20px 0 0">Please ensure pending amounts, penalties, damages, interest and delay days are followed up until closure.</p>
    </td>
  </tr>
  <tr>
    <td style="background:#f8fafc;padding:16px 24px;border-top:1px solid #e2e8f0">
      <p style="margin:0 0 4px;font-size:12px;color:#64748b">Best regards,</p>
      <p style="margin:0 0 12px;font-size:12px;color:#1e293b"><strong>${companyName}</strong></p>
      <p style="margin:0;color:#94a3b8;font-size:11px">Generated on ${dateStr} · System-generated from the Compliance Tracker</p>
    </td>
  </tr>
  <tr><td style="background:#1B3A6B;height:4px;border-radius:0 0 8px 8px;font-size:1px">&nbsp;</td></tr>
</table>
</td></tr>
</table>
</body></html>`;
}

async function runComplianceWeeklyReport({ manual = false, recipients: recipientOverride, company_id: companyIdOverride } = {}) {
  const companyId = companyIdOverride || DEFAULT_COMPANY_ID;
  const dateStr = new Date(todayIST() + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

  const cfgRes = await query(`SELECT * FROM compliance_report_configs WHERE company_id=$1 AND enabled=true`, [companyId]);
  const configured = cfgRes.rows.flatMap(c => parseList(c.recipients));
  const recipients = [...new Set([...parseList(recipientOverride), ...configured])];

  if (!recipients.length) {
    logger.warn('Compliance weekly report: no recipients configured');
    return { ok: false, reason: 'No recipients configured' };
  }

  const companyRes = await query(`SELECT name FROM companies WHERE id=$1`, [companyId]);
  const companyName = companyRes.rows[0]?.name || 'BCIM';

  const entries = await fetchOpenEntries(companyId);
  const html = buildEmailHtml({ companyName, dateStr, entries });
  const subject = `Weekly Compliance Status Report — ${dateStr}`;

  const mailResult = await sendMail({ to: recipients, subject, html }).catch(e => ({ sent: false, error: e.message }));

  logger.info(`Compliance weekly report ${dateStr}: ${entries.length} open items → ${recipients.join(', ')}`);
  return { ok: true, ran_at: new Date().toISOString(), date: dateStr, entry_count: entries.length, recipients, mail: mailResult, manual };
}

function initComplianceWeeklyReport() {
  if (String(process.env.COMPLIANCE_REPORT_ENABLED || 'true').toLowerCase() === 'false') {
    logger.info('Compliance weekly report scheduler disabled (COMPLIANCE_REPORT_ENABLED=false)');
    return;
  }
  const schedule = process.env.COMPLIANCE_REPORT_CRON || DEFAULT_CRON;
  cron.schedule(schedule, () => {
    logger.info('Compliance weekly report: running Monday send');
    runComplianceWeeklyReport()
      .then(r => logger.info(`Compliance weekly report result: ${JSON.stringify({ ok: r.ok, count: r.entry_count, reason: r.reason })}`))
      .catch(err => logger.error('Compliance weekly report failed:', err.message));
  }, { timezone: TZ });
  logger.info(`Compliance weekly report scheduler initialized (${schedule} ${TZ})`);
}

module.exports = { runComplianceWeeklyReport, initComplianceWeeklyReport };
