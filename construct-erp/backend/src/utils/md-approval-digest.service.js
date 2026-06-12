// md-approval-digest.service.js — twice-daily email to the MD listing every
// document waiting for his authorization (POs, WOs, MRS).
const cron = require('node-cron');
const logger = require('./logger');
const { query } = require('../config/database');
const { sendMail } = require('../services/mail.service');

const DEFAULT_RECIPIENTS = 'stephen@bcim.in';
const DEFAULT_CRON = '0 9,21 * * *'; // 9:00 AM + 9:00 PM IST

const parseEmails = (value, fallback = '') =>
  String(value || fallback || '')
    .split(/[;,]/)
    .map(v => v.trim())
    .filter(Boolean);

const inr = (value) =>
  Number(value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtDate = (value) => (value ? new Date(value).toLocaleDateString('en-IN') : '-');

const daysPending = (value) => {
  if (!value) return '-';
  const days = Math.floor((Date.now() - new Date(value).getTime()) / 86400000);
  return days <= 0 ? 'Today' : days === 1 ? '1 day' : `${days} days`;
};

// ── MD-stage pending items (mirrors the /approvals/pending feed logic) ───────
async function fetchMdPending(companyId) {
  const pos = await query(`
    SELECT po.po_number AS ref_no, po.po_date AS doc_date, po.created_at,
           COALESCE(po.grand_total, 0) AS amount,
           v.name AS party_name, p.name AS project_name, u.name AS raised_by,
           po.status
    FROM purchase_orders po
    JOIN projects p ON p.id = po.project_id
    LEFT JOIN vendors v ON v.id = po.vendor_id
    LEFT JOIN users u ON u.id = po.created_by
    WHERE p.company_id = $1 AND po.status IN ('verified_audit', 'released_mgmt')
    ORDER BY po.created_at ASC`, [companyId]);

  const wos = await query(`
    SELECT wo.wo_number AS ref_no, wo.wo_date AS doc_date, wo.created_at,
           COALESCE(wo.contract_amount, wo.total_value, 0) AS amount,
           COALESCE(v.name, '-') AS party_name, p.name AS project_name, u.name AS raised_by,
           wo.status
    FROM work_orders wo
    JOIN projects p ON p.id = wo.project_id
    LEFT JOIN vendors v ON v.id = wo.vendor_id
    LEFT JOIN users u ON u.id = wo.created_by
    WHERE p.company_id = $1 AND wo.status IN ('submitted', 'active')
    ORDER BY wo.created_at ASC`, [companyId]);

  const mrs = await query(`
    SELECT COALESCE(mr.serial_no_formatted, mr.mrs_number) AS ref_no,
           mr.created_at AS doc_date, mr.created_at,
           0 AS amount,
           p.name AS party_name, p.name AS project_name, u.name AS raised_by,
           mr.status,
           (SELECT COUNT(*)::int FROM mrs_items mi WHERE mi.mrs_id = mr.id) AS item_count
    FROM material_requisitions mr
    JOIN projects p ON p.id = mr.project_id
    LEFT JOIN users u ON u.id = mr.raised_by
    WHERE p.company_id = $1 AND mr.status = 'approved_mgmt'
    ORDER BY mr.created_at ASC`, [companyId]);

  return { pos: pos.rows, wos: wos.rows, mrs: mrs.rows };
}

// ── Mail body ─────────────────────────────────────────────────────────────────
function buildMail({ companyName, pos, wos, mrs }) {
  const totalItems = pos.length + wos.length + mrs.length;
  const totalValue = [...pos, ...wos].reduce((s, r) => s + Number(r.amount || 0), 0);
  const now = new Date();
  const greeting = now.getHours() < 12 ? 'Good Morning' : 'Good Evening';

  const subject = `MD Approval Pending — ${totalItems} item${totalItems !== 1 ? 's' : ''} awaiting your authorization (Rs ${inr(totalValue)})`;

  const th = 'padding:8px;border:1px solid #dbe4f0;background:#0f2a52;color:#fff;font-size:11px;text-align:left;white-space:nowrap';
  const td = 'padding:8px;border:1px solid #dbe4f0;font-size:11px;vertical-align:top';

  const section = (title, rows, cols) => {
    if (!rows.length) return '';
    return `
      <p style="margin:18px 0 6px;font-size:13px;font-weight:800;color:#0f2a52;text-transform:uppercase;letter-spacing:0.04em">
        ${title} — ${rows.length} pending
      </p>
      <table style="width:100%;border-collapse:collapse">
        <thead><tr>${cols.map(c => `<th style="${th}">${c}</th>`).join('')}</tr></thead>
        <tbody>${rows.join('')}</tbody>
      </table>`;
  };

  const poRows = pos.map((r, i) => `
    <tr>
      <td style="${td}">${i + 1}</td>
      <td style="${td};font-family:monospace;font-weight:700">${r.ref_no || '-'}</td>
      <td style="${td}">${r.party_name || '-'}</td>
      <td style="${td}">${r.project_name || '-'}</td>
      <td style="${td};text-align:right;font-weight:700">Rs ${inr(r.amount)}</td>
      <td style="${td}">${fmtDate(r.doc_date)}</td>
      <td style="${td}">${r.raised_by || '-'}</td>
      <td style="${td};color:#b45309;font-weight:700">${daysPending(r.created_at)}</td>
    </tr>`);

  const woRows = wos.map((r, i) => `
    <tr>
      <td style="${td}">${i + 1}</td>
      <td style="${td};font-family:monospace;font-weight:700">${r.ref_no || '-'}</td>
      <td style="${td}">${r.party_name || '-'}</td>
      <td style="${td}">${r.project_name || '-'}</td>
      <td style="${td};text-align:right;font-weight:700">Rs ${inr(r.amount)}</td>
      <td style="${td}">${fmtDate(r.doc_date)}</td>
      <td style="${td}">${r.raised_by || '-'}</td>
      <td style="${td};color:#b45309;font-weight:700">${daysPending(r.created_at)}</td>
    </tr>`);

  const mrsRows = mrs.map((r, i) => `
    <tr>
      <td style="${td}">${i + 1}</td>
      <td style="${td};font-family:monospace;font-weight:700">${r.ref_no || '-'}</td>
      <td style="${td}">${r.project_name || '-'}</td>
      <td style="${td}">${r.item_count || 0} items</td>
      <td style="${td}">${fmtDate(r.doc_date)}</td>
      <td style="${td}">${r.raised_by || '-'}</td>
      <td style="${td};color:#b45309;font-weight:700">${daysPending(r.created_at)}</td>
    </tr>`);

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:860px;margin:0 auto;color:#13233f">
      <div style="background:linear-gradient(135deg,#0f2a52,#16386b);padding:18px 22px;border-radius:8px 8px 0 0">
        <h2 style="margin:0;color:#fff;font-size:18px">Approvals Awaiting Your Authorization</h2>
        <p style="margin:6px 0 0;color:#cfe0ff;font-size:12px">${companyName} • ${now.toLocaleDateString('en-IN')} ${now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}</p>
      </div>
      <div style="padding:20px 22px;border:1px solid #dbe4f0;border-top:none;border-radius:0 0 8px 8px;background:#fff">
        <p style="margin:0 0 14px;font-size:13px">${greeting} Sir,<br>The following documents are pending your approval in the ERP:</p>
        <table style="width:100%;border-collapse:collapse;margin-bottom:4px">
          <tr>
            <td style="padding:12px;border:1px solid #dbe4f0;background:#f6f9fc;font-weight:700">Total Pending</td>
            <td style="padding:12px;border:1px solid #dbe4f0;font-size:18px;font-weight:800">${totalItems}</td>
            <td style="padding:12px;border:1px solid #dbe4f0;background:#f6f9fc;font-weight:700">Purchase Orders</td>
            <td style="padding:12px;border:1px solid #dbe4f0;font-weight:800">${pos.length}</td>
            <td style="padding:12px;border:1px solid #dbe4f0;background:#f6f9fc;font-weight:700">Work Orders</td>
            <td style="padding:12px;border:1px solid #dbe4f0;font-weight:800">${wos.length}</td>
            <td style="padding:12px;border:1px solid #dbe4f0;background:#f6f9fc;font-weight:700">MRS</td>
            <td style="padding:12px;border:1px solid #dbe4f0;font-weight:800">${mrs.length}</td>
          </tr>
          <tr>
            <td style="padding:12px;border:1px solid #dbe4f0;background:#f6f9fc;font-weight:700">Total Value</td>
            <td colspan="7" style="padding:12px;border:1px solid #dbe4f0;font-size:16px;font-weight:800;color:#0f2a52">Rs ${inr(totalValue)}</td>
          </tr>
        </table>
        ${section('Purchase Orders — Awaiting MD Authorization', poRows, ['#', 'PO Number', 'Vendor', 'Project', 'Amount', 'PO Date', 'Raised By', 'Pending'])}
        ${section('Work Orders — Awaiting MD Authorization', woRows, ['#', 'WO Number', 'Contractor', 'Project', 'Amount', 'WO Date', 'Raised By', 'Pending'])}
        ${section('Material Requisitions — Awaiting MD Approval', mrsRows, ['#', 'MRS Number', 'Project', 'Items', 'Date', 'Raised By', 'Pending'])}
        <p style="margin:20px 0 0;font-size:12px">
          <a href="https://erp.bcim.in/approvals" style="display:inline-block;background:#0f2a52;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;font-weight:700">
            Open My Approvals Dashboard
          </a>
        </p>
        <p style="margin:16px 0 0;font-size:10px;color:#8aa0bf">Automated digest from BCIM ERP — sent at 9:00 AM and 9:00 PM daily when approvals are pending.</p>
      </div>
    </div>`;

  const text = [
    `${greeting} Sir,`,
    '',
    `${totalItems} document(s) are pending your approval (total Rs ${inr(totalValue)}):`,
    ...pos.map(r => `  PO ${r.ref_no} | ${r.party_name} | ${r.project_name} | Rs ${inr(r.amount)} | pending ${daysPending(r.created_at)}`),
    ...wos.map(r => `  WO ${r.ref_no} | ${r.party_name} | ${r.project_name} | Rs ${inr(r.amount)} | pending ${daysPending(r.created_at)}`),
    ...mrs.map(r => `  MRS ${r.ref_no} | ${r.project_name} | ${r.item_count} items | pending ${daysPending(r.created_at)}`),
    '',
    'Approve at: https://erp.bcim.in/approvals',
  ].join('\n');

  return { subject, html, text };
}

async function runMdApprovalDigest({ manual = false } = {}) {
  const recipients = parseEmails(process.env.MD_APPROVAL_DIGEST_EMAILS, DEFAULT_RECIPIENTS);
  if (!recipients.length) return { ok: false, reason: 'No recipients configured' };

  const companies = await query(`SELECT id, name FROM companies WHERE COALESCE(is_active, TRUE) = TRUE`);

  const results = [];
  for (const company of companies.rows) {
    const { pos, wos, mrs } = await fetchMdPending(company.id);
    const totalItems = pos.length + wos.length + mrs.length;
    if (!totalItems) {
      results.push({ company_id: company.id, company_name: company.name, items: 0, mail: { sent: false, reason: 'Nothing pending MD approval' } });
      continue;
    }
    const mail = await sendMail({ to: recipients, ...buildMail({ companyName: company.name, pos, wos, mrs }) });
    results.push({ company_id: company.id, company_name: company.name, items: totalItems, pos: pos.length, wos: wos.length, mrs: mrs.length, recipients, mail, manual });
  }

  return { ok: true, ran_at: new Date().toISOString(), companies_checked: companies.rows.length, results };
}

function initMdApprovalDigest() {
  const schedule = process.env.MD_APPROVAL_DIGEST_CRON || DEFAULT_CRON;
  cron.schedule(schedule, () => {
    logger.info('Scheduled MD approval digest triggered');
    runMdApprovalDigest().catch(err => logger.error(`MD approval digest failed: ${err.message}`));
  }, { timezone: process.env.MD_APPROVAL_DIGEST_TZ || process.env.TZ || 'Asia/Kolkata' });

  logger.info(`MD approval digest initialized (${schedule})`);
}

module.exports = { runMdApprovalDigest, initMdApprovalDigest };
