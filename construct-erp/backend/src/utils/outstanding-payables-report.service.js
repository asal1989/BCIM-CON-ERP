// src/utils/outstanding-payables-report.service.js
// Sends a per-project Outstanding Payables Report — certified bills not yet
// fully paid (same "outstanding" definition as GET /tqs/bills/ap-aging) —
// as an HTML table in the email body. Runs daily at 9:00 AM IST by default.
// Modeled directly on manpower-client-report.service.js's config-table +
// scheduler pattern.

const cron = require('node-cron');
const logger = require('./logger');
const { query } = require('../config/database');
const { sendMail } = require('../services/mail.service');
const { runSchemaInit } = require('./schemaInit');
const { billOutstandingSql } = require('../services/tqsLiability.service');

const DEFAULT_CRON = '0 9 * * *';
const TZ = process.env.OUTSTANDING_PAYABLES_REPORT_TZ || process.env.TZ || 'Asia/Kolkata';
const DEFAULT_COMPANY_ID = process.env.MANPOWER_REPORT_COMPANY_ID || '83b84668-7840-444e-8df9-350202e7bca0';

// ── outstanding_payables_report_configs — one row per project. recipients is
// a fixed comma-separated email list; notify_roles additionally resolves to
// every active user in those roles at send time (so e.g. a new procurement
// manager is included automatically without editing the config), same
// pattern as sendBillPaidEmail's BILL_PAID_FIXED_EMAILS + _NOTIFY_ROLES. ────
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

// Seed the config the user actually asked for: LANCO Hills - LH 10, daily to
// procurement_manager role + prithivi@bcim.in/it@bcim.in. Only runs once
// ever — later edits/deletes via the settings UI are not overwritten.
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
  return Math.round(Number(value || 0)).toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
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

// Same "outstanding" definition as GET /tqs/bills/ap-aging: certified (qs or
// accounts stage) bills with a non-zero certified_net, scoped to one project.
async function fetchOutstandingPayables(companyId, projectId) {
  const { rows } = await query(`
    SELECT
      b.sl_number, b.vendor_name, b.inv_number, b.inv_date, b.po_number, b.bill_type,
      u.qs_certified_date, u.certified_net, COALESCE(u.paid_amount, 0) AS paid_amount,
      ${billOutstandingSql('b', 'u')} AS balance,
      u.pc_number,
      EXTRACT(DAY FROM NOW() - u.qs_certified_date)::INT AS days_outstanding
    FROM tqs_bills b
    LEFT JOIN tqs_bill_updates u ON u.bill_id = b.id
    WHERE b.company_id = $1 AND b.project_id = $2 AND b.is_deleted = FALSE
      AND b.workflow_status IN ('qs','accounts')
      AND COALESCE(u.certified_net, 0) > 0
    ORDER BY days_outstanding DESC NULLS LAST
  `, [companyId, projectId]);
  return rows;
}

function buildEmailHtml({ companyName, projectName, dateStr, rows, totalOutstanding }) {
  const th = `padding:9px 12px;background:#1B3A6B;color:#fff;font-size:11px;font-weight:700;text-align:left;white-space:nowrap;border:1px solid #16305a`;
  const td = `padding:8px 12px;font-size:12px;color:#1e293b;border:1px solid #e2e8f0;vertical-align:middle`;

  const rowsHtml = rows.map((r, i) => {
    const days = r.days_outstanding ?? 0;
    const ageColor = days > 90 ? '#dc2626' : days > 60 ? '#d97706' : days > 30 ? '#ca8a04' : '#16a34a';
    return `
    <tr style="background:${i % 2 === 0 ? '#fff' : '#f8fafc'}">
      <td style="${td}">${r.sl_number || '—'}</td>
      <td style="${td}">${r.vendor_name || '—'}</td>
      <td style="${td}">${r.inv_number || '—'}</td>
      <td style="${td}">${r.pc_number || '—'}</td>
      <td style="${td};text-align:right">${inr(r.certified_net)}</td>
      <td style="${td};text-align:right">${inr(r.paid_amount)}</td>
      <td style="${td};text-align:right;font-weight:700;color:#1B3A6B">${inr(r.balance)}</td>
      <td style="${td};text-align:center;font-weight:700;color:${ageColor}">${days}</td>
    </tr>`;
  }).join('');

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#e8edf5;font-family:Arial,Helvetica,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#e8edf5;padding:28px 0">
<tr><td align="center">
<table width="760" cellpadding="0" cellspacing="0" style="max-width:760px;width:100%;border-collapse:collapse">

  <tr><td style="background:#1B3A6B;height:5px;border-radius:8px 8px 0 0;font-size:1px;line-height:1px">&nbsp;</td></tr>

  <tr>
    <td style="background:#1B3A6B;padding:20px 28px">
      <table width="100%" cellpadding="0" cellspacing="0"><tr>
        <td>
          <p style="color:rgba(255,255,255,0.7);font-size:10px;margin:0 0 2px;letter-spacing:0.08em;text-transform:uppercase">Bill Tracker</p>
          <p style="color:#fff;font-size:15px;font-weight:800;margin:0;letter-spacing:0.3px">OUTSTANDING PAYABLES REPORT — ${dateStr}</p>
        </td>
        <td align="right">
          <div style="background:rgba(255,255,255,0.15);border-radius:10px;padding:10px 18px;text-align:center;min-width:100px">
            <div style="color:#fff;font-size:20px;font-weight:800;line-height:1">${inr(totalOutstanding)}</div>
            <div style="color:rgba(255,255,255,0.8);font-size:10px;font-weight:700;letter-spacing:0.05em;text-transform:uppercase;margin-top:2px">Total Due</div>
          </div>
        </td>
      </tr></table>
    </td>
  </tr>

  <tr>
    <td style="background:#fff;padding:22px 24px">
      <p style="margin:0 0 6px;font-size:13px;color:#475569">Dear Team,</p>
      <p style="font-size:13px;color:#475569;margin:8px 0 16px">
        Please find below the outstanding payables for <strong>${projectName}</strong> as of <strong>${dateStr}</strong> —
        certified bills not yet fully paid, sorted by days outstanding.
      </p>

      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
        <tr>
          <th style="${th}">SL No.</th>
          <th style="${th}">Vendor</th>
          <th style="${th}">Invoice No.</th>
          <th style="${th}">PC No.</th>
          <th style="${th};text-align:right">Certified</th>
          <th style="${th};text-align:right">Paid</th>
          <th style="${th};text-align:right">Balance Due</th>
          <th style="${th};text-align:center">Days</th>
        </tr>
        ${rowsHtml || `<tr><td colspan="8" style="${td};text-align:center;color:#94a3b8">No outstanding payables — everything certified is paid.</td></tr>`}
        <tr style="background:#eef2f7">
          <td colspan="6" style="${td};font-weight:800;text-align:right">Total Outstanding</td>
          <td style="${td};text-align:right;font-weight:900;color:#1B3A6B">${inr(totalOutstanding)}</td>
          <td style="${td}"></td>
        </tr>
      </table>

      <p style="font-size:12.5px;color:#64748b;margin:20px 0 0">
        Please reach out if you need clarification on any bill's certification or payment status.
      </p>
    </td>
  </tr>

  <tr>
    <td style="background:#f8fafc;padding:18px 24px;border-top:1px solid #e2e8f0">
      <p style="margin:0 0 4px;font-size:12px;color:#64748b">Best regards,</p>
      <p style="margin:0 0 16px;font-size:12px;color:#1e293b"><strong>${companyName}</strong></p>
      <p style="margin:0;color:#94a3b8;font-size:11px">Automated report · ${new Date().toLocaleString('en-IN', { timeZone: TZ })}</p>
    </td>
  </tr>

  <tr><td style="background:#1B3A6B;height:4px;border-radius:0 0 8px 8px;font-size:1px;line-height:1px">&nbsp;</td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;
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
  const dateStr = new Date(targetDate + 'T00:00:00').toLocaleDateString('en-IN', {
    weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
  });

  const rows = await fetchOutstandingPayables(companyId, projectId);
  const totalOutstanding = rows.reduce((s, r) => s + parseFloat(r.balance || 0), 0);

  const html = buildEmailHtml({ companyName, projectName, dateStr, rows, totalOutstanding });
  const subject = `Outstanding Payables Report — ${projectName} — ${dateStr}`;

  const mailResult = await sendMail({ to: recipients, subject, html })
    .catch(e => ({ sent: false, error: e.message }));

  logger.info(`Outstanding payables report [${projectName}] ${targetDate}: ${rows.length} bills, ${inr(totalOutstanding)} outstanding → ${recipients.join(', ')}`);
  return { ok: true, ran_at: new Date().toISOString(), date: targetDate, bill_count: rows.length, total_outstanding: totalOutstanding, recipients, mail: mailResult, manual, project_name: projectName };
}

// ── Runs every enabled project config, one email each ─────────────────────
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

// ── Scheduler ───────────────────────────────────────────────────────────────
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
