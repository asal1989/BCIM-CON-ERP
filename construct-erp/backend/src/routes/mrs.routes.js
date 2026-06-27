// src/routes/mrs.routes.js — Material Requisition Slips
const express = require('express');
const { authenticate } = require('../middleware/auth');
const { loadProjectScope, userCanAccessProject, appendProjectScope } = require('../middleware/projectScope');
const { query, withTransaction } = require('../config/database');
const { sendMail } = require('../services/mail.service');
const { createNotification } = require('../controllers/notification.controller');
const { sendPushToUsersByEmail, sendPushToUser } = require('../services/fcm.service');
const router = express.Router();

const DEFAULT_STORES_MRS_EMAILS = 'vijayan@bcim.in';
const DEFAULT_PROCUREMENT_MRS_EMAILS = 'bkmanjunath@bcim.in,praveen@bcim.in';
const DEFAULT_MGMT_NOTIFY_EMAILS = 'stephen@bcim.in,biswal@bcim.in,lathis@bcim.in';

const parseEmails = (value, fallback = '') =>
  String(value || fallback)
    .split(',')
    .map(s => s.trim().toLowerCase())
    .filter(Boolean);

const getPublicFrontendUrl = () => {
  const configured = process.env.PUBLIC_FRONTEND_URL || process.env.FRONTEND_URL || '';
  if (!configured || /localhost|127\.0\.0\.1/i.test(configured)) return 'http://bcim.ddns.net:3000';
  return configured.replace(/\/$/, '');
};

const esc = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const mrsRef = (mrs) => mrs.serial_no_formatted || mrs.mrs_number || mrs.id;

async function getActiveUsersByEmails(companyId, emails) {
  if (!emails.length) return [];
  const { rows } = await query(
    `SELECT id, name, email
     FROM users
     WHERE company_id = $1
       AND is_active = TRUE
       AND LOWER(email) = ANY($2::text[])`,
    [companyId, emails]
  );
  return rows;
}

function buildMRSMail({ title, message, mrs, actionLabel }) {
  const appUrl = getPublicFrontendUrl();
  const link = `${appUrl}/stores/mrs`;
  const ref = esc(mrsRef(mrs));
  const project = esc(mrs.project_name || mrs.head_office_project_name || '-');
  const raisedBy = esc(mrs.raised_by_name || mrs.raised_by_email || '-');
  const itemCount = Array.isArray(mrs.items) ? mrs.items.length : Number(mrs.item_count || 0);
  const text = [
    title,
    '',
    message,
    '',
    `MRS No: ${mrsRef(mrs)}`,
    `Project: ${mrs.project_name || mrs.head_office_project_name || '-'}`,
    `Department: ${mrs.department || '-'}`,
    `Raised By: ${mrs.raised_by_name || mrs.raised_by_email || '-'}`,
    `Items: ${itemCount}`,
    '',
    `Open ERP: ${link}`,
  ].join('\n');

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:680px;margin:0 auto;color:#0f172a">
      <div style="background:#0a2057;color:#fff;padding:18px 24px;border-radius:8px 8px 0 0">
        <h2 style="margin:0;font-size:18px">${esc(title)}</h2>
      </div>
      <div style="border:1px solid #dbe4f0;border-top:none;padding:22px 24px;border-radius:0 0 8px 8px;background:#f8fafc">
        <p style="margin:0 0 18px;line-height:1.5;color:#334155">${esc(message)}</p>
        <table style="border-collapse:collapse;width:100%;font-size:14px;background:#fff">
          <tr><td style="padding:9px;border:1px solid #e2e8f0;font-weight:700;width:150px">MRS No</td><td style="padding:9px;border:1px solid #e2e8f0">${ref}</td></tr>
          <tr><td style="padding:9px;border:1px solid #e2e8f0;font-weight:700">Project</td><td style="padding:9px;border:1px solid #e2e8f0">${project}</td></tr>
          <tr><td style="padding:9px;border:1px solid #e2e8f0;font-weight:700">Department</td><td style="padding:9px;border:1px solid #e2e8f0">${esc(mrs.department || '-')}</td></tr>
          <tr><td style="padding:9px;border:1px solid #e2e8f0;font-weight:700">Raised By</td><td style="padding:9px;border:1px solid #e2e8f0">${raisedBy}</td></tr>
          <tr><td style="padding:9px;border:1px solid #e2e8f0;font-weight:700">Items</td><td style="padding:9px;border:1px solid #e2e8f0">${itemCount}</td></tr>
        </table>
        <p style="margin:22px 0 0;text-align:center">
          <a href="${link}" style="display:inline-block;background:#0a2057;color:#fff;text-decoration:none;padding:11px 22px;border-radius:6px;font-weight:700">${esc(actionLabel || 'Open MRS')}</a>
        </p>
        <p style="margin:18px 0 0;font-size:11px;color:#64748b">This is an automated BCIM ERP notification.</p>
      </div>
    </div>
  `;
  return { subject: title, text, html, link: '/stores/mrs' };
}

async function sendMRSWorkflowNotification({ companyId, emails, title, message, mrs, severity = 'info', actionLabel }) {
  try {
    const recipients = [...new Set(emails)];
    if (!recipients.length) return;

    const users = await getActiveUsersByEmails(companyId, recipients);
    const mail = buildMRSMail({ title, message, mrs, actionLabel });

    for (const user of users) {
      await createNotification({
        company_id: companyId,
        user_id: user.id,
        type: 'mrs_workflow',
        title,
        message,
        link: mail.link,
        severity,
        related_type: 'material_requisition',
        related_id: mrs.id,
      });
    }

    const result = await sendMail({ to: recipients, subject: mail.subject, text: mail.text, html: mail.html });
    console.log(`[mrs-mail] ${title} -> ${result.sent ? 'sent' : result.reason}`);
  } catch (err) {
    console.error('[mrs-mail] notification failed:', err.message);
  }
}

function notifyStoresForNewMRS({ companyId, mrs }) {
  const emails = parseEmails(process.env.MRS_STORES_NOTIFY_EMAILS, DEFAULT_STORES_MRS_EMAILS);
  sendMRSWorkflowNotification({
    companyId,
    emails,
    title: `New MR Raised: ${mrsRef(mrs)}`,
    message: 'A new material requisition has been raised. Please check and complete Stores approval.',
    mrs,
    severity: 'warning',
    actionLabel: 'Review MR in Stores',
  });
}

// Notify procurement team + stephen when a new MRS is created
function notifyProcurementForNewMRS({ companyId, mrs }) {
  const procEmails = parseEmails(process.env.MRS_PROCUREMENT_NOTIFY_EMAILS, DEFAULT_PROCUREMENT_MRS_EMAILS);
  const mgmtEmails = parseEmails(process.env.MRS_MGMT_NOTIFY_EMAILS, DEFAULT_MGMT_NOTIFY_EMAILS);
  const emails = [...new Set([...procEmails, ...mgmtEmails])];
  sendMRSWorkflowNotification({
    companyId,
    emails,
    title: `New MR Raised: ${mrsRef(mrs)}`,
    message: `A new material requisition has been raised by ${mrs.raised_by_name || mrs.raised_by_email || 'site'}. Please review for procurement planning.`,
    mrs,
    severity: 'warning',
    actionLabel: 'View MR',
  });
}

// ── Notify MD (stephen) with full item details when a new MRS is created ──
const DEFAULT_MD_NOTIFY_EMAILS = 'stephen@bcim.in';

async function notifyMDForNewMRS({ mrs }) {
  try {
    const mdEmails = parseEmails(process.env.MRS_MD_NOTIFY_EMAILS, DEFAULT_MD_NOTIFY_EMAILS);
    if (!mdEmails.length) return;

    const appUrl = getPublicFrontendUrl();
    const ref     = esc(mrsRef(mrs));
    const project = esc(mrs.project_name || mrs.head_office_project_name || '-');
    const raisedBy = esc(mrs.raised_by_name || mrs.raised_by_email || '-');
    const dept     = esc(mrs.department || '-');
    const reqBy    = mrs.required_by ? new Date(mrs.required_by).toLocaleDateString('en-IN') : '-';
    const priority = esc((mrs.priority || 'normal').toUpperCase());
    const items    = Array.isArray(mrs.items) ? mrs.items : [];

    const itemRows = items.map((it, i) => `
      <tr style="background:${i % 2 === 0 ? '#ffffff' : '#f8fafc'}">
        <td style="padding:8px 10px;border:1px solid #e2e8f0;text-align:center;color:#64748b;font-size:13px">${i + 1}</td>
        <td style="padding:8px 10px;border:1px solid #e2e8f0;font-weight:600;font-size:13px">${esc(it.material_name || it.material || '-')}</td>
        <td style="padding:8px 10px;border:1px solid #e2e8f0;text-align:center;font-weight:700;color:#0a2057;font-size:13px">${it.quantity || it.qty || '-'}</td>
        <td style="padding:8px 10px;border:1px solid #e2e8f0;text-align:center;font-size:13px">${esc(it.unit || '-')}</td>
        <td style="padding:8px 10px;border:1px solid #e2e8f0;color:#475569;font-size:12px">${esc(it.purpose || '-')}</td>
      </tr>`).join('');

    const subject = `New MR Raised: ${mrsRef(mrs)} — ${project}`;

    const html = `
      <div style="font-family:Arial,sans-serif;max-width:700px;margin:0 auto;color:#0f172a">
        <div style="background:#0a2057;color:#fff;padding:20px 28px;border-radius:8px 8px 0 0">
          <p style="margin:0 0 4px;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#94a3b8">BCIM ENGINEERING — NEW MATERIAL REQUISITION</p>
          <h2 style="margin:0;font-size:20px;font-weight:700">${ref}</h2>
        </div>
        <div style="border:1px solid #dbe4f0;border-top:none;padding:24px 28px;background:#f8fafc;border-radius:0 0 8px 8px">
          <table style="border-collapse:collapse;width:100%;font-size:14px;background:#fff;margin-bottom:20px">
            <tr><td style="padding:9px 12px;border:1px solid #e2e8f0;font-weight:700;width:160px;background:#f1f5f9">Project</td><td style="padding:9px 12px;border:1px solid #e2e8f0">${project}</td></tr>
            <tr><td style="padding:9px 12px;border:1px solid #e2e8f0;font-weight:700;background:#f1f5f9">Department</td><td style="padding:9px 12px;border:1px solid #e2e8f0">${dept}</td></tr>
            <tr><td style="padding:9px 12px;border:1px solid #e2e8f0;font-weight:700;background:#f1f5f9">Raised By</td><td style="padding:9px 12px;border:1px solid #e2e8f0">${raisedBy}</td></tr>
            <tr><td style="padding:9px 12px;border:1px solid #e2e8f0;font-weight:700;background:#f1f5f9">Required By</td><td style="padding:9px 12px;border:1px solid #e2e8f0">${reqBy}</td></tr>
            <tr><td style="padding:9px 12px;border:1px solid #e2e8f0;font-weight:700;background:#f1f5f9">Priority</td><td style="padding:9px 12px;border:1px solid #e2e8f0"><span style="padding:2px 8px;border-radius:4px;background:${mrs.priority === 'urgent' ? '#fef2f2' : '#f0fdf4'};color:${mrs.priority === 'urgent' ? '#dc2626' : '#16a34a'};font-weight:700">${priority}</span></td></tr>
            <tr><td style="padding:9px 12px;border:1px solid #e2e8f0;font-weight:700;background:#f1f5f9">Total Items</td><td style="padding:9px 12px;border:1px solid #e2e8f0;font-weight:700;color:#0a2057">${items.length}</td></tr>
          </table>

          <h3 style="margin:0 0 10px;font-size:14px;font-weight:700;color:#0f172a;border-bottom:2px solid #0a2057;padding-bottom:6px">Material Items Requested</h3>
          <table style="border-collapse:collapse;width:100%;font-size:13px">
            <thead>
              <tr style="background:#0a2057;color:#fff">
                <th style="padding:9px 10px;border:1px solid #1e3a8a;width:36px">#</th>
                <th style="padding:9px 10px;border:1px solid #1e3a8a;text-align:left">Material Name</th>
                <th style="padding:9px 10px;border:1px solid #1e3a8a;width:60px">Qty</th>
                <th style="padding:9px 10px;border:1px solid #1e3a8a;width:60px">Unit</th>
                <th style="padding:9px 10px;border:1px solid #1e3a8a;text-align:left">Purpose</th>
              </tr>
            </thead>
            <tbody>${itemRows || '<tr><td colspan="5" style="padding:12px;text-align:center;color:#94a3b8">No items</td></tr>'}</tbody>
          </table>

          <p style="margin:22px 0 0;text-align:center">
            <a href="${appUrl}/stores/mrs" style="display:inline-block;background:#0a2057;color:#fff;text-decoration:none;padding:11px 28px;border-radius:6px;font-weight:700;font-size:14px">Open MRS in ERP</a>
          </p>
          <p style="margin:16px 0 0;font-size:11px;color:#94a3b8;text-align:center">Automated notification from BCIM ConstructERP</p>
        </div>
      </div>`;

    const text = [
      subject, '',
      `Project   : ${project}`,
      `Department: ${dept}`,
      `Raised By : ${raisedBy}`,
      `Required  : ${reqBy}`,
      `Priority  : ${priority}`,
      '',
      'Items:',
      ...items.map((it, i) => `  ${i+1}. ${it.material_name || it.material} — ${it.quantity || it.qty} ${it.unit}${it.purpose ? ` (${it.purpose})` : ''}`),
      '',
      `Open ERP: ${appUrl}/stores/mrs`,
    ].join('\n');

    const { sendMail } = require('../services/mail.service');
    const result = await sendMail({ to: mdEmails, subject, html, text });
    console.log(`[mrs-mail] MD notification for ${ref} → ${result.sent ? 'sent' : result.reason}`);
  } catch (err) {
    console.error('[mrs-mail] MD notification failed:', err.message);
  }
}

// ── Notify full team with item details when Project Head approves (approved_mgmt) ──
const DEFAULT_PH_APPROVED_EMAILS =
  'biswal@bcim.in,stephen@bcim.in,enosh@bcim.in,prithivi@bcim.in,jephins@bcim.in,' +
  'bkmanjunath@bcim.in,praveen@bcim.in,lingesh@bcim.in,vijayan@bcim.in';

async function notifyAfterProjectHeadApproval({ mrs }) {
  try {
    const emails = parseEmails(process.env.MRS_PH_APPROVED_EMAILS, DEFAULT_PH_APPROVED_EMAILS);
    if (!emails.length) return;

    // Fetch items from DB
    const itemsRes = await query(
      `SELECT material_name, quantity, unit, purpose FROM mrs_items WHERE mrs_id = $1 ORDER BY sort_order`,
      [mrs.id]
    );
    const items = itemsRes.rows;

    const appUrl  = getPublicFrontendUrl();
    const ref     = esc(mrsRef(mrs));
    const project = esc(mrs.project_name || mrs.head_office_project_name || '-');
    const raisedBy = esc(mrs.raised_by_name || mrs.raised_by_email || '-');
    const dept    = esc(mrs.department || '-');
    const reqBy   = mrs.required_by ? new Date(mrs.required_by).toLocaleDateString('en-IN') : '-';
    const priority = esc((mrs.priority || 'normal').toUpperCase());

    const itemRows = items.map((it, i) => `
      <tr style="background:${i % 2 === 0 ? '#ffffff' : '#f8fafc'}">
        <td style="padding:8px 10px;border:1px solid #e2e8f0;text-align:center;color:#64748b;font-size:13px">${i + 1}</td>
        <td style="padding:8px 10px;border:1px solid #e2e8f0;font-weight:600;font-size:13px">${esc(it.material_name || '-')}</td>
        <td style="padding:8px 10px;border:1px solid #e2e8f0;text-align:center;font-weight:700;color:#0a2057;font-size:13px">${it.quantity}</td>
        <td style="padding:8px 10px;border:1px solid #e2e8f0;text-align:center;font-size:13px">${esc(it.unit || '-')}</td>
        <td style="padding:8px 10px;border:1px solid #e2e8f0;color:#475569;font-size:12px">${esc(it.purpose || '-')}</td>
      </tr>`).join('');

    const subject = `MR Approved by Project Head: ${mrsRef(mrs)} — ${project}`;

    const html = `
      <div style="font-family:Arial,sans-serif;max-width:700px;margin:0 auto;color:#0f172a">
        <div style="background:#0a2057;color:#fff;padding:20px 28px;border-radius:8px 8px 0 0">
          <p style="margin:0 0 4px;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#94a3b8">BCIM ENGINEERING — MR APPROVED BY PROJECT HEAD</p>
          <h2 style="margin:0;font-size:20px;font-weight:700">${ref}</h2>
        </div>
        <div style="border:1px solid #dbe4f0;border-top:none;padding:24px 28px;background:#f8fafc;border-radius:0 0 8px 8px">
          <div style="background:#d1fae5;border:1px solid #6ee7b7;border-radius:6px;padding:10px 16px;margin-bottom:18px">
            <p style="margin:0;font-weight:700;color:#065f46;font-size:14px">✅ Project Head has approved this Material Requisition</p>
            <p style="margin:4px 0 0;font-size:12px;color:#047857">This MR is now pending Managing Director final authorization.</p>
          </div>
          <table style="border-collapse:collapse;width:100%;font-size:14px;background:#fff;margin-bottom:20px">
            <tr><td style="padding:9px 12px;border:1px solid #e2e8f0;font-weight:700;width:160px;background:#f1f5f9">MRS No</td><td style="padding:9px 12px;border:1px solid #e2e8f0;font-weight:700;color:#0a2057">${ref}</td></tr>
            <tr><td style="padding:9px 12px;border:1px solid #e2e8f0;font-weight:700;background:#f1f5f9">Project</td><td style="padding:9px 12px;border:1px solid #e2e8f0">${project}</td></tr>
            <tr><td style="padding:9px 12px;border:1px solid #e2e8f0;font-weight:700;background:#f1f5f9">Department</td><td style="padding:9px 12px;border:1px solid #e2e8f0">${dept}</td></tr>
            <tr><td style="padding:9px 12px;border:1px solid #e2e8f0;font-weight:700;background:#f1f5f9">Raised By</td><td style="padding:9px 12px;border:1px solid #e2e8f0">${raisedBy}</td></tr>
            <tr><td style="padding:9px 12px;border:1px solid #e2e8f0;font-weight:700;background:#f1f5f9">Required By</td><td style="padding:9px 12px;border:1px solid #e2e8f0">${reqBy}</td></tr>
            <tr><td style="padding:9px 12px;border:1px solid #e2e8f0;font-weight:700;background:#f1f5f9">Priority</td><td style="padding:9px 12px;border:1px solid #e2e8f0"><span style="padding:2px 8px;border-radius:4px;background:${mrs.priority === 'urgent' ? '#fef2f2' : '#f0fdf4'};color:${mrs.priority === 'urgent' ? '#dc2626' : '#16a34a'};font-weight:700">${priority}</span></td></tr>
            <tr><td style="padding:9px 12px;border:1px solid #e2e8f0;font-weight:700;background:#f1f5f9">Total Items</td><td style="padding:9px 12px;border:1px solid #e2e8f0;font-weight:700;color:#0a2057">${items.length}</td></tr>
          </table>

          <h3 style="margin:0 0 10px;font-size:14px;font-weight:700;color:#0f172a;border-bottom:2px solid #0a2057;padding-bottom:6px">Material Items</h3>
          <table style="border-collapse:collapse;width:100%;font-size:13px">
            <thead>
              <tr style="background:#0a2057;color:#fff">
                <th style="padding:9px 10px;border:1px solid #1e3a8a;width:36px">#</th>
                <th style="padding:9px 10px;border:1px solid #1e3a8a;text-align:left">Material Name</th>
                <th style="padding:9px 10px;border:1px solid #1e3a8a;width:60px">Qty</th>
                <th style="padding:9px 10px;border:1px solid #1e3a8a;width:60px">Unit</th>
                <th style="padding:9px 10px;border:1px solid #1e3a8a;text-align:left">Purpose</th>
              </tr>
            </thead>
            <tbody>${itemRows || '<tr><td colspan="5" style="padding:12px;text-align:center;color:#94a3b8">No items</td></tr>'}</tbody>
          </table>

          <p style="margin:22px 0 0;text-align:center">
            <a href="${appUrl}/stores/mrs" style="display:inline-block;background:#0a2057;color:#fff;text-decoration:none;padding:11px 28px;border-radius:6px;font-weight:700;font-size:14px">Open MRS in ERP</a>
          </p>
          <p style="margin:16px 0 0;font-size:11px;color:#94a3b8;text-align:center">Automated notification from BCIM ConstructERP</p>
        </div>
      </div>`;

    const text = [
      subject, '',
      '✅ Project Head has approved this Material Requisition.',
      'Pending Managing Director final authorization.',
      '',
      `MRS No    : ${mrsRef(mrs)}`,
      `Project   : ${project}`,
      `Department: ${dept}`,
      `Raised By : ${raisedBy}`,
      `Required  : ${reqBy}`,
      `Priority  : ${priority}`,
      '',
      'Items:',
      ...items.map((it, i) => `  ${i+1}. ${it.material_name} — ${it.quantity} ${it.unit}${it.purpose ? ` (${it.purpose})` : ''}`),
      '',
      `Open ERP: ${appUrl}/stores/mrs`,
    ].join('\n');

    const { sendMail } = require('../services/mail.service');
    const result = await sendMail({ to: emails, subject, html, text });
    console.log(`[mrs-mail] PH-approved notification for ${ref} → ${result.sent ? 'sent' : result.reason}`);
  } catch (err) {
    console.error('[mrs-mail] PH-approved notification failed:', err.message);
  }
}

// Notify procurement team + stephen when MRS is fully approved (approved_md)
function notifyProcurementAfterMDApproval({ companyId, mrs }) {
  const procEmails  = parseEmails(process.env.MRS_PROCUREMENT_NOTIFY_EMAILS, DEFAULT_PROCUREMENT_MRS_EMAILS);
  const mgmtEmails  = parseEmails(process.env.MRS_MGMT_NOTIFY_EMAILS, DEFAULT_MGMT_NOTIFY_EMAILS);
  const storesEmails = parseEmails(process.env.MRS_STORES_NOTIFY_EMAILS, DEFAULT_STORES_MRS_EMAILS);
  const emails = [...new Set([...procEmails, ...mgmtEmails, ...storesEmails])];
  sendMRSWorkflowNotification({
    companyId,
    emails,
    title: `MR Fully Approved: ${mrsRef(mrs)}`,
    message: 'The material requisition has completed all approvals (MD signed off). Procurement can proceed with RFQ / PO action.',
    mrs,
    severity: 'info',
    actionLabel: 'Open MR for Procurement',
  });
}
// Public Verification Endpoint (No Auth required for QR scanning)
router.get('/public/verify/:id', async (req, res) => {
  try {
    const mrs = await query(
      `SELECT mr.serial_no_formatted, mr.status, mr.created_at, mr.department,
              p.name AS project_name, p.project_code,
              u.name AS raised_by_name, u.signature_url AS raised_by_sig,
              sv.name AS stores_verified_name, sv.signature_url AS stores_verified_sig,
              mr.stores_approved_at,
              t.name AS verified_tower_name, t.signature_url AS verified_tower_sig,
              mr.verified_tower_mgr_at,
              pm.name AS approved_pm_name, pm.signature_url AS approved_pm_sig,
              mr.approved_pm_at,
              spm.name AS approved_srpm_name, spm.signature_url AS approved_srpm_sig,
              mr.approved_sr_pm_at,
              mgmt.name AS approved_mgmt_name, mgmt.signature_url AS approved_mgmt_sig,
              mr.approved_mgmt_at,
              md.name AS approved_md_name, md.signature_url AS approved_md_sig,
              mr.approved_md_at
       FROM material_requisitions mr
       JOIN projects p ON mr.project_id = p.id
       JOIN users u ON mr.raised_by = u.id
       LEFT JOIN users sv ON sv.id::text = mr.stores_approved_by
       LEFT JOIN users t ON mr.verified_tower_mgr_by = t.id
       LEFT JOIN users pm ON mr.approved_pm_by = pm.id
       LEFT JOIN users spm ON mr.approved_sr_pm_by = spm.id
       LEFT JOIN users mgmt ON mr.approved_mgmt_by = mgmt.id
       LEFT JOIN users md ON mr.approved_md_by = md.id
       WHERE mr.id = $1::uuid`,
      [req.params.id]
    );
    if (!mrs.rows.length) return res.status(404).json({ error: 'MRS not found' });
    
    const items = await query(
      `SELECT material_name, quantity, unit, sort_order FROM mrs_items WHERE mrs_id = $1::uuid ORDER BY sort_order`,
      [req.params.id]
    );
    res.json({
      data: {
        ...mrs.rows[0],
        mrs_workflow: { stages: normalizeStageIds(mrs.rows[0].mrs_workflow?.stages) },
        items: items.rows,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.use(authenticate);
router.use(loadProjectScope);

// Auto-add columns + per-project workflow config
(async () => {
  const safe = async (sql) => { try { await query(sql); } catch {} };
  await safe(`ALTER TABLE material_requisitions ADD COLUMN IF NOT EXISTS raised_sig_img TEXT`);
  await safe(`ALTER TABLE material_requisitions ADD COLUMN IF NOT EXISTS tower_sig_img TEXT`);
  await safe(`ALTER TABLE material_requisitions ADD COLUMN IF NOT EXISTS pm_sig_img TEXT`);
  await safe(`ALTER TABLE material_requisitions ADD COLUMN IF NOT EXISTS srpm_sig_img TEXT`);
  await safe(`ALTER TABLE material_requisitions ADD COLUMN IF NOT EXISTS mgmt_sig_img TEXT`);
  await safe(`ALTER TABLE material_requisitions ADD COLUMN IF NOT EXISTS md_sig_img TEXT`);
  await safe(`ALTER TABLE material_requisitions ADD COLUMN IF NOT EXISTS stores_approved_by UUID REFERENCES users(id)`);
  await safe(`ALTER TABLE material_requisitions ADD COLUMN IF NOT EXISTS stores_approved_at TIMESTAMPTZ`);
  await safe(`ALTER TABLE material_requisitions ADD COLUMN IF NOT EXISTS stores_sig_img TEXT`);
  // Per-project workflow config stored on the projects table
  await safe(`ALTER TABLE projects ADD COLUMN IF NOT EXISTS mrs_workflow JSONB`);
  // Optional per-project starting sequence (e.g. continue legacy paper numbering at 053)
  await safe(`ALTER TABLE projects ADD COLUMN IF NOT EXISTS mrs_start_seq INTEGER`);
  // Optional shared numbering pool: projects with the same mrs_seq_group share one
  // continuous MR serial counter (e.g. Yelahanka + DQS Towers number together).
  await safe(`ALTER TABLE projects ADD COLUMN IF NOT EXISTS mrs_seq_group TEXT`);
  // mrs_number now mirrors the project-scoped serial which can be longer than 30 chars
  await safe(`ALTER TABLE material_requisitions ALTER COLUMN mrs_number TYPE VARCHAR(60)`);
  // MD item-level authorization: which items to proceed, at what quantity
  await safe(`ALTER TABLE mrs_items ADD COLUMN IF NOT EXISTS md_approved_qty NUMERIC(12,3)`);
  await safe(`ALTER TABLE mrs_items ADD COLUMN IF NOT EXISTS md_included BOOLEAN DEFAULT TRUE`);
  // Reason captured when MD / Procurement cancel an item after full approval
  await safe(`ALTER TABLE mrs_items ADD COLUMN IF NOT EXISTS cancel_reason TEXT`);
  // New "Create Material Request" wizard fields (mockup parity)
  await safe(`ALTER TABLE material_requisitions ADD COLUMN IF NOT EXISTS mr_type TEXT`);
  await safe(`ALTER TABLE material_requisitions ADD COLUMN IF NOT EXISTS cost_center TEXT`);
  await safe(`ALTER TABLE material_requisitions ADD COLUMN IF NOT EXISTS wo_boq_reference TEXT`);
  await safe(`ALTER TABLE material_requisitions ADD COLUMN IF NOT EXISTS delivery_location TEXT`);
  await safe(`ALTER TABLE material_requisitions ADD COLUMN IF NOT EXISTS requester_employee_id TEXT`);
  await safe(`ALTER TABLE material_requisitions ADD COLUMN IF NOT EXISTS requester_contact TEXT`);
  await safe(`ALTER TABLE material_requisitions ADD COLUMN IF NOT EXISTS requester_email TEXT`);
  await safe(`ALTER TABLE material_requisitions ADD COLUMN IF NOT EXISTS justification TEXT`);
  await safe(`ALTER TABLE material_requisitions ADD COLUMN IF NOT EXISTS linked_activity TEXT`);
  await safe(`ALTER TABLE material_requisitions ADD COLUMN IF NOT EXISTS planned_usage_date DATE`);
  await safe(`ALTER TABLE material_requisitions ADD COLUMN IF NOT EXISTS special_handling TEXT`);
  await safe(`ALTER TABLE mrs_items ADD COLUMN IF NOT EXISTS item_code TEXT`);
  await safe(`ALTER TABLE mrs_items ADD COLUMN IF NOT EXISTS category TEXT`);
  await safe(`ALTER TABLE mrs_items ADD COLUMN IF NOT EXISTS est_rate NUMERIC(14,2)`);
  await safe(`ALTER TABLE mrs_items ADD COLUMN IF NOT EXISTS preferred_vendor_id UUID`);
  // Expand priority check from ('normal','urgent') → 4-value set matching the frontend.
  // Data must be migrated BEFORE re-adding the constraint so existing rows pass validation.
  // Drop the constraint FIRST (unconditionally) so inserts work even if a later step fails,
  // and normalize EVERY non-conforming value (normal/critical/NULL/legacy/typo) to 'medium'.
  await safe(`ALTER TABLE material_requisitions DROP CONSTRAINT IF EXISTS material_requisitions_priority_check`);
  await safe(`UPDATE material_requisitions SET priority = 'urgent' WHERE LOWER(priority) = 'critical'`);
  await safe(`UPDATE material_requisitions SET priority = 'medium'
              WHERE priority IS NULL OR priority NOT IN ('low','medium','high','urgent')`);
  await safe(`ALTER TABLE material_requisitions ALTER COLUMN priority SET DEFAULT 'medium'`);
  // request_date: the date the MRS was raised (user-entered, reliable vs auto created_at)
  await safe(`ALTER TABLE material_requisitions ADD COLUMN IF NOT EXISTS request_date DATE DEFAULT CURRENT_DATE`);
  // Back-fill: rows that got DEFAULT CURRENT_DATE but were actually created on a different date.
  // Condition: request_date = today AND created_at::date != today → old record that got the default, overwrite it.
  await safe(`UPDATE material_requisitions
              SET request_date = created_at::date
              WHERE request_date = CURRENT_DATE
                AND (created_at AT TIME ZONE 'Asia/Kolkata')::date != CURRENT_DATE`);
  // Re-add with explicit logging so a failure is visible in deploy logs (not swallowed).
  try {
    await query(`ALTER TABLE material_requisitions
      ADD CONSTRAINT material_requisitions_priority_check
      CHECK (priority IN ('low','medium','high','urgent'))`);
    console.log('[mrs] priority constraint updated → (low,medium,high,urgent)');
  } catch (e) {
    if (e.code === '42710' || /already exists/i.test(e.message)) {
      console.log('[mrs] priority constraint already present');
    } else {
      console.error('[mrs] priority constraint NOT applied:', e.message);
    }
  }
  // ── Auto-configure 3-stage workflow (Store Manager → PM → MD) for Yelahanka & DQS projects ──
  // Only sets workflow when no stages are already configured (safe to run on every deploy).
  try {
    const threeStage = JSON.stringify({ stages: ['stores-approve', 'approve-pm', 'approve-md'] });
    const r = await query(
      `UPDATE projects
         SET mrs_workflow = $1::jsonb
       WHERE (LOWER(name) LIKE '%yelahanka%' OR LOWER(name) LIKE '%dqs%' OR LOWER(name) LIKE '%tqs%')
         AND (mrs_workflow IS NULL
              OR mrs_workflow = 'null'::jsonb
              OR NOT (mrs_workflow ? 'stages'))`,
      [threeStage]
    );
    if (r.rowCount > 0) {
      console.log(`[mrs] 3-stage workflow (Store Mgr→PM→MD) set for ${r.rowCount} project(s) (Yelahanka/DQS)`);
    }
  } catch (e) {
    console.error('[mrs] project workflow init failed:', e.message);
  }

  // ── One-time: give DQS Tower its own MR numbering starting from 001 ────────────
  // Previously DQS Tower shared a mrs_seq_group with Yelahanka, so its MR numbers
  // continued from Yelahanka's counter. Clear the shared pool, reset start to 1,
  // and renumber existing DQS MRs in chronological order to -001, -002, …
  try {
    // 1. Reset project-level config
    const dqsProjects = await query(
      `UPDATE projects
          SET mrs_seq_group = NULL,
              mrs_start_seq = 1
        WHERE LOWER(name) LIKE '%dqs%'
        RETURNING id, name, project_code, mrs_prefix`
    );

    // 2. Renumber existing MRs for each DQS project in created_at order
    for (const proj of dqsProjects.rows) {
      const existing = await query(
        `SELECT id FROM material_requisitions
          WHERE project_id = $1
          ORDER BY created_at ASC, id ASC`,
        [proj.id]
      );
      if (!existing.rows.length) continue;

      const mrsPrefix = proj.mrs_prefix;
      const projectCode = proj.project_code || 'DQS';
      const sep = mrsPrefix && /[0-9]$/.test(mrsPrefix) ? '-' : '';
      const basePrefix = mrsPrefix ? `${mrsPrefix}${sep}` : `BCIM-${projectCode}-GEN-MR-`;

      for (let i = 0; i < existing.rows.length; i++) {
        const newSerial = `${basePrefix}${String(i + 1).padStart(3, '0')}`;
        await query(
          `UPDATE material_requisitions
              SET serial_no_formatted = $1, mrs_number = $1
            WHERE id = $2`,
          [newSerial, existing.rows[i].id]
        );
      }
      console.log(`[mrs] Renumbered ${existing.rows.length} DQS MR(s) for "${proj.name}" → ${basePrefix}001…`);
    }
  } catch (e) {
    console.error('[mrs] DQS Tower numbering reset failed:', e.message);
  }

  // ── One-time repair: LANCO LH10 runaway MR serials ───────────────────────────
  // The prefix "MR-LANCHO-HYD-LH10" ends in digits with no separator, so the
  // auto-numbering's trailing-digit read-back fused the prefix's "10" into the
  // sequence and the serial grew exponentially (LH10008 → LH1010009 → … → crash).
  // Renumber every non-conforming LH10 serial to the clean dashed format in
  // creation order, resuming after the already-correct "-007". Idempotent: the
  // regex guard skips rows already matching "…LH10-0NN", so this no-ops once healed.
  try {
    const r = await query(
      `WITH corrupt AS (
         SELECT id, ROW_NUMBER() OVER (ORDER BY created_at) AS rn
         FROM material_requisitions
         WHERE serial_no_formatted LIKE 'MR-LANCHO-HYD-LH10%'
           AND serial_no_formatted !~ '^MR-LANCHO-HYD-LH10-[0-9]{3}$'
       )
       UPDATE material_requisitions m
         SET serial_no_formatted = 'MR-LANCHO-HYD-LH10-' || LPAD((c.rn + 7)::text, 3, '0'),
             mrs_number          = 'MR-LANCHO-HYD-LH10-' || LPAD((c.rn + 7)::text, 3, '0'),
             updated_at = NOW()
       FROM corrupt c
       WHERE m.id = c.id`
    );
    if (r.rowCount > 0) {
      console.log(`[mrs] repaired ${r.rowCount} corrupt LH10 MR serial(s) → LH10-008…`);
    }
  } catch (e) {
    console.error('[mrs] LH10 serial repair failed:', e.message);
  }

  console.log('[mrs] schema OK');
})();

/* ── Master stage definitions (ALL possible stages, in order) ─────────────
   Each project's mrs_workflow.stages[] picks a SUBSET of these IDs.
   If a project has no workflow config → ALL stages apply (standard).
─────────────────────────────────────────────────────────────────────────── */
const ALL_STAGES = [
  { id: 'stores-approve', nextStatus: 'stores_verified', colBy: 'stores_approved_by', colAt: 'stores_approved_at', sigCol: 'stores_sig_img', label: 'Store Manager',      allowedRoles: ['stores_manager', 'store_keeper'] },
  { id: 'approve-pm',     nextStatus: 'approved_pm',     colBy: 'approved_pm_by',     colAt: 'approved_pm_at',     sigCol: 'pm_sig_img',     label: 'Project Manager',    allowedRoles: ['project_manager', 'pm', 'project_head'], legacyPrev: ['verified_tower'] },
  { id: 'approve-mgmt',   nextStatus: 'approved_mgmt',   colBy: 'approved_mgmt_by',   colAt: 'approved_mgmt_at',   sigCol: 'mgmt_sig_img',   label: 'Project Director',   allowedRoles: ['project_head', 'director', 'project_director', 'management', 'management_director'], legacyPrev: ['approved_srpm'] },
  { id: 'approve-md',     nextStatus: 'approved_md',     colBy: 'approved_md_by',     colAt: 'approved_md_at',     sigCol: 'md_sig_img',     label: 'Managing Director',  allowedRoles: ['managing_director', 'md', 'ceo'] },
];

// Roles that can bypass stage role restrictions (system admins)
const GLOBAL_ADMIN_ROLES = ['admin', 'super_admin'];
const DEFAULT_STAGE_IDS = ALL_STAGES.map(s => s.id);

/* Build a dynamic chain for a given list of enabled stage IDs.
   Returns an object keyed by stageId → { nextStatus, requiredPrev, colBy, colAt, sigCol }
*/
function buildChain(enabledStageIds) {
  const normalizedIds = normalizeStageIds(enabledStageIds);
  const enabled = ALL_STAGES.filter(s => normalizedIds.includes(s.id));
  const chain = {};
  enabled.forEach((stage, i) => {
    chain[stage.id] = {
      ...stage,
      requiredPrev: i === 0 ? 'pending' : enabled[i - 1].nextStatus,
    };
  });
  return chain;
}

function normalizeStageIds(stageIds) {
  if (!Array.isArray(stageIds) || !stageIds.length) return DEFAULT_STAGE_IDS;
  const valid = new Set(DEFAULT_STAGE_IDS);
  const normalized = stageIds.filter(id => valid.has(id));
  return normalized.length ? normalized : DEFAULT_STAGE_IDS;
}

/* Load project workflow from DB — returns array of stage IDs (or default = all) */
async function getProjectWorkflow(projectId) {
  try {
    const r = await query(`SELECT mrs_workflow FROM projects WHERE id = $1`, [projectId]);
    if (r.rows.length && r.rows[0].mrs_workflow?.stages?.length) {
      return normalizeStageIds(r.rows[0].mrs_workflow.stages);
    }
  } catch {}
  // Default: all stages
  return DEFAULT_STAGE_IDS;
}

// Keep legacy APPROVAL_STAGES for backward compatibility (used if stage route can't load project)
const APPROVAL_STAGES = buildChain(DEFAULT_STAGE_IDS);

// GET /stores/mrs
router.get('/', async (req, res) => {
  try {
    const { project_id, status } = req.query;
    let sql = `
      SELECT mr.*, p.name AS project_name,
             u.name AS raised_by_name, a.name AS approved_by_name
      FROM material_requisitions mr
      JOIN projects p ON mr.project_id = p.id
      JOIN users u ON mr.raised_by = u.id
      LEFT JOIN users a ON mr.approved_by = a.id
      WHERE p.company_id = $1`;
    let params = [req.user.company_id];
    let i = 2;
    if (project_id) { sql += ` AND mr.project_id = $${i++}`; params.push(project_id); }
    if (status)     { sql += ` AND mr.status = $${i++}`;     params.push(status); }
    // enforce project-level scope for non-global roles
    ({ sql, params } = appendProjectScope(req, sql, params, 'mr'));
    sql += ` ORDER BY mr.created_at DESC`;
    const result = await query(sql, params);

    // Fetch items for each MRS
    const ids = result.rows.map(r => r.id);
    let itemsMap = {};
    let poSet = new Set();
    if (ids.length) {
      const items = await query(
        `WITH direct AS (
           SELECT poi.mrs_item_id, SUM(poi.quantity) AS ordered_qty
           FROM po_items poi
           JOIN purchase_orders po ON po.id = poi.po_id
           WHERE po.status NOT IN ('rejected', 'cancelled')
           GROUP BY poi.mrs_item_id
         ),
         fallback_raw AS (
           -- Attribute each NULL-mrs_item_id PO line to every distinct MR it is
           -- header-linked to (mrs_id ∪ mrs_ids), de-duplicated so a PO carrying
           -- the same MR id in both columns can never be counted twice.
           SELECT linked_mrs_id AS mrs_id, poi.material_name, poi.quantity
           FROM po_items poi
           JOIN purchase_orders po ON po.id = poi.po_id
           CROSS JOIN LATERAL unnest(ARRAY(
             SELECT DISTINCT x FROM unnest(
               COALESCE(po.mrs_ids, ARRAY[]::uuid[])
               || CASE WHEN po.mrs_id IS NOT NULL THEN ARRAY[po.mrs_id] ELSE ARRAY[]::uuid[] END
             ) x
           )) AS linked_mrs_id
           WHERE poi.mrs_item_id IS NULL AND po.status NOT IN ('rejected', 'cancelled')
             AND (po.mrs_id = ANY($1::uuid[]) OR po.mrs_ids && $1::uuid[])
         ),
         fallback AS (
           SELECT mrs_id, regexp_replace(lower(trim(material_name)), '[^a-z0-9]+', '', 'g') AS mname, SUM(quantity) AS ordered_qty
           FROM fallback_raw
           WHERE mrs_id = ANY($1::uuid[])
           GROUP BY mrs_id, regexp_replace(lower(trim(material_name)), '[^a-z0-9]+', '', 'g')
         )
         SELECT mi.*, COALESCE(direct.ordered_qty, 0) + COALESCE(fallback.ordered_qty, 0) AS ordered_qty
         FROM mrs_items mi
         LEFT JOIN direct ON direct.mrs_item_id = mi.id
         LEFT JOIN fallback ON fallback.mrs_id = mi.mrs_id AND fallback.mname = regexp_replace(lower(trim(mi.material_name)), '[^a-z0-9]+', '', 'g')
         WHERE mi.mrs_id = ANY($1::uuid[]) ORDER BY mi.sort_order`,
        [ids]
      );
      items.rows.forEach(it => {
        if (!itemsMap[it.mrs_id]) itemsMap[it.mrs_id] = [];
        itemsMap[it.mrs_id].push(it);
      });

      const pos = await query(
        `SELECT DISTINCT mrs_id AS id FROM (
           SELECT mrs_id FROM purchase_orders WHERE mrs_id = ANY($1::uuid[])
           UNION ALL
           SELECT unnest(mrs_ids) AS mrs_id FROM purchase_orders WHERE mrs_ids && $1::uuid[]
         ) x WHERE mrs_id = ANY($1::uuid[])`,
        [ids]
      );
      poSet = new Set(pos.rows.map(r => r.id));
    }
    const data = result.rows.map(r => ({ ...r, items: itemsMap[r.id] || [], has_po: poSet.has(r.id) }));
    res.json({ data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /stores/mrs/:id
router.get('/:id', async (req, res) => {
  try {
    const mrs = await query(
      `SELECT mr.*,
              mr.tower_sig_img, mr.pm_sig_img, mr.srpm_sig_img, mr.mgmt_sig_img, mr.md_sig_img,
              p.name AS project_name, p.project_code, p.company_id, p.mrs_workflow,
              u.name AS raised_by_name, u.signature_url AS raised_by_sig,
              t.name AS verified_tower_name, t.signature_url AS verified_tower_sig,
              pm.name AS approved_pm_name, pm.signature_url AS approved_pm_sig,
              spm.name AS approved_srpm_name, spm.signature_url AS approved_srpm_sig,
              mgmt.name AS approved_mgmt_name, mgmt.signature_url AS approved_mgmt_sig,
              md.name AS approved_md_name, md.signature_url AS approved_md_sig,
              proc.name AS processed_by_name
       FROM material_requisitions mr
       JOIN projects p ON mr.project_id = p.id
       JOIN users u ON mr.raised_by = u.id
       LEFT JOIN users t ON mr.verified_tower_mgr_by = t.id
       LEFT JOIN users pm ON mr.approved_pm_by = pm.id
       LEFT JOIN users spm ON mr.approved_sr_pm_by = spm.id
       LEFT JOIN users mgmt ON mr.approved_mgmt_by = mgmt.id
       LEFT JOIN users md ON mr.approved_md_by = md.id
       LEFT JOIN users proc ON mr.processed_by = proc.id
       WHERE mr.id = $1`,
      [req.params.id]
    );
    if (!mrs.rows.length || mrs.rows[0].company_id !== req.user.company_id) {
      return res.status(404).json({ error: 'MRS not found' });
    }
    if (!userCanAccessProject(req, mrs.rows[0].project_id)) {
      return res.status(403).json({ error: 'You do not have access to this project.' });
    }
    const items = await query(
      `WITH direct AS (
         SELECT poi.mrs_item_id, SUM(poi.quantity) AS ordered_qty
         FROM po_items poi
         JOIN purchase_orders po ON po.id = poi.po_id
         WHERE po.status NOT IN ('rejected', 'cancelled')
         GROUP BY poi.mrs_item_id
       ),
       fallback AS (
         SELECT regexp_replace(lower(trim(poi.material_name)), '[^a-z0-9]+', '', 'g') AS mname, SUM(poi.quantity) AS ordered_qty
         FROM po_items poi
         JOIN purchase_orders po ON po.id = poi.po_id
         WHERE poi.mrs_item_id IS NULL AND po.status NOT IN ('rejected', 'cancelled')
           AND (po.mrs_id = $1 OR $1 = ANY(po.mrs_ids))
         GROUP BY regexp_replace(lower(trim(poi.material_name)), '[^a-z0-9]+', '', 'g')
       )
       SELECT mi.*,
              COALESCE(mi.md_approved_qty, mi.quantity) AS effective_qty,
              COALESCE(mi.md_included, TRUE) AS effective_included,
              COALESCE(direct.ordered_qty, 0) + COALESCE(fallback.ordered_qty, 0) AS ordered_qty
       FROM mrs_items mi
       LEFT JOIN direct ON direct.mrs_item_id = mi.id
       LEFT JOIN fallback ON fallback.mname = regexp_replace(lower(trim(mi.material_name)), '[^a-z0-9]+', '', 'g')
       WHERE mi.mrs_id = $1 ORDER BY mi.sort_order`,
      [req.params.id]
    );
    const linkedPos = await query(
      `SELECT po.id, po.po_number, po.serial_no_formatted, po.po_ref_no, po.status,
              po.po_date, po.grand_total, v.name AS vendor_name
       FROM purchase_orders po
       LEFT JOIN vendors v ON v.id = po.vendor_id
       WHERE po.mrs_id = $1 OR $1 = ANY(po.mrs_ids)
       ORDER BY po.created_at DESC`,
      [req.params.id]
    );
    res.json({
      data: {
        ...mrs.rows[0],
        mrs_workflow: { stages: normalizeStageIds(mrs.rows[0].mrs_workflow?.stages) },
        items: items.rows,
        linked_pos: linkedPos.rows,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /stores/mrs
router.post('/', async (req, res) => {
  try {
    const {
      project_id, department, head_office_project_name, site_incharge, required_by, priority, remarks, items,
      mr_type, cost_center, wo_boq_reference, delivery_location,
      requester_employee_id, requester_contact, requester_email,
      justification, linked_activity, planned_usage_date, special_handling,
      request_date,
    } = req.body;
    if (!project_id || !items?.length) {
      return res.status(400).json({ error: 'project_id and at least one item are required' });
    }
    if (!userCanAccessProject(req, project_id)) {
      return res.status(403).json({ error: 'You do not have access to this project.' });
    }

    // mrs_number carries a GLOBAL unique constraint, but each project's serial restarts
    // at -001. The old code set mrs_number = "MRS-<yr>-<seq>", so the first MR of every
    // project produced "MRS-<yr>-001" and collided across projects. We now use the
    // project-scoped serial (which embeds the project code) as the unique number, and
    // retry on the rare race where two concurrent submits grab the same sequence.
    let result;
    for (let attempt = 0; ; attempt++) {
      try {
        result = await withTransaction(async (client) => {
          // Verify project belongs to company
          const proj = await client.query(
            `SELECT id, name, project_code, mrs_prefix, mrs_start_seq, mrs_seq_group FROM projects WHERE id = $1 AND company_id = $2`,
            [project_id, req.user.company_id]
          );
          if (!proj.rows.length) throw Object.assign(new Error('Project not found'), { status: 404 });

          // A project may share one continuous MR numbering pool with others via
          // mrs_seq_group. Resolve the set of project_ids that share this sequence.
          const seqGroup = proj.rows[0].mrs_seq_group;
          let groupProjects;
          if (seqGroup) {
            groupProjects = (await client.query(
              `SELECT id, mrs_start_seq FROM projects WHERE company_id = $1 AND mrs_seq_group = $2`,
              [req.user.company_id, seqGroup]
            )).rows;
          } else {
            groupProjects = [{ id: proj.rows[0].id, mrs_start_seq: proj.rows[0].mrs_start_seq }];
          }
          const groupIds = groupProjects.map(r => r.id);

          // Highest trailing number used so far across the whole numbering pool
          const seqRes = await client.query(
            `SELECT COALESCE(MAX(
               CASE
                 WHEN serial_no_formatted ~ '[0-9]+$'
                 THEN CAST(REGEXP_REPLACE(serial_no_formatted, '^.*?([0-9]+)$', '\\1') AS BIGINT)
                 ELSE 0
               END
             ), 0) AS last_seq
             FROM material_requisitions
             WHERE project_id = ANY($1::uuid[])`,
            [groupIds]
          );
          // Continue from the highest configured starting number in the pool (legacy paper
          // numbering); +attempt bumps forward on a unique clash.
          const startSeq = Math.max(0, ...groupProjects.map(r => parseInt(r.mrs_start_seq) || 0));
          const nextSeq  = Math.max(parseInt(seqRes.rows[0].last_seq) + 1, startSeq) + attempt;
          const seq      = String(nextSeq).padStart(3, '0');

          // Use project-specific prefix if configured, otherwise fall back to default format
          const mrsPrefix = proj.rows[0].mrs_prefix;
          const deptCode  = (department || 'GEN').substring(0, 3).toUpperCase();
          const projectCode = proj.rows[0].project_code || 'PRJ';
          // If the custom prefix ends in a digit (e.g. "…LH10"), insert a "-" before the
          // sequence. Without it the seq digits fuse with the prefix's trailing digits, and
          // the next-number extraction (trailing-digit regex above) re-reads the whole run —
          // making the serial grow exponentially every time (LH10008 → LH1010009 → …).
          const sep = mrsPrefix && /[0-9]$/.test(mrsPrefix) ? '-' : '';
          const serial_no_formatted = mrsPrefix
            ? `${mrsPrefix}${sep}${seq}`
            : `BCIM-${projectCode}-${deptCode}-MR-${seq}`;
          // Globally-unique key = the project-scoped serial (embeds project identity)
          const mrs_number = serial_no_formatted;

          const mrs = await client.query(
            `INSERT INTO material_requisitions (
               project_id, mrs_number, serial_no_formatted, department,
               head_office_project_name, site_incharge, required_by,
               priority, remarks, raised_by, status,
               mr_type, cost_center, wo_boq_reference, delivery_location,
               requester_employee_id, requester_contact, requester_email,
               justification, linked_activity, planned_usage_date, special_handling,
               request_date
             )
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'pending',$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22) RETURNING *`,
            [
              project_id, mrs_number, serial_no_formatted, department,
              head_office_project_name || proj.rows[0].name,
              site_incharge, required_by, priority || 'medium', remarks, req.user.id,
              mr_type || null, cost_center || null, wo_boq_reference || null, delivery_location || null,
              requester_employee_id || null, requester_contact || null, requester_email || null,
              justification || null, linked_activity || null, planned_usage_date || null, special_handling || null,
              request_date || null,
            ]
          );

          // Insert items
          const inserted = [];
          for (let i = 0; i < items.length; i++) {
            const { material, qty, unit, purpose, item_code, category, est_rate, preferred_vendor_id } = items[i];
            if (!material || !qty || !unit) continue;
            const it = await client.query(
              `INSERT INTO mrs_items (mrs_id, material_name, quantity, unit, purpose, sort_order, item_code, category, est_rate, preferred_vendor_id)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
              [mrs.rows[0].id, material, parseFloat(qty), unit, purpose, i + 1, item_code || null, category || null, est_rate ? parseFloat(est_rate) : null, preferred_vendor_id || null]
            );
            inserted.push(it.rows[0]);
          }

          return {
            ...mrs.rows[0],
            project_name: proj.rows[0].name,
            raised_by_name: req.user.name || req.user.email,
            raised_by_email: req.user.email,
            items: inserted,
          };
        });
        break; // success
      } catch (err) {
        // 23505 = unique_violation on mrs_number — bump the sequence and retry a few times
        if (err.code === '23505' && attempt < 5) continue;
        throw err;
      }
    }

    notifyStoresForNewMRS({ companyId: req.user.company_id, mrs: result });
    notifyProcurementForNewMRS({ companyId: req.user.company_id, mrs: result });
    notifyMDForNewMRS({ mrs: result }); // Full item-detail email to MD (stephen)

    // Push notification to stores team
    const storesEmails = parseEmails(process.env.MRS_STORES_NOTIFY_EMAILS, DEFAULT_STORES_MRS_EMAILS);
    sendPushToUsersByEmail(req.user.company_id, storesEmails, {
      title: `New MR Raised: ${mrsRef(result)}`,
      body: `${result.raised_by_name || 'Site'} raised MR for ${result.project_name || 'a project'}. Needs stores approval.`,
      data: { link: '/stores/mrs', type: 'mr_raised', related_id: result.id },
    }).catch(() => {});

    res.status(201).json({ message: 'MRS submitted successfully', data: result });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// ── GET /stores/mrs/workflow-config  — list all projects with their workflow ──
router.get('/workflow-config', async (req, res) => {
  try {
    const r = await query(
      `SELECT id, name, project_code, mrs_workflow, mrs_prefix, mrs_seq_group, mrs_start_seq
       FROM projects WHERE company_id = $1 ORDER BY name`,
      [req.user.company_id]
    );
    // Attach resolved stage list to each project
    const projects = r.rows.map(p => ({
      ...p,
      stages: normalizeStageIds(p.mrs_workflow?.stages),
      is_custom: !!(p.mrs_workflow?.stages?.length),
    }));
    res.json({ data: { projects, allStages: ALL_STAGES.map(s => ({ id: s.id, label: s.label })) } });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── PUT /stores/mrs/workflow-config/:project_id  — save workflow for a project ──
router.put('/workflow-config/:project_id', async (req, res) => {
  try {
    const { stages } = req.body; // array of stage IDs in order, or null = reset to default
    const cid = req.user.company_id;

    // Validate
    if (stages !== null && stages !== undefined) {
      const valid = DEFAULT_STAGE_IDS;
      const invalid = stages.filter(s => !valid.includes(s));
      if (invalid.length) return res.status(400).json({ error: `Unknown stages: ${invalid.join(', ')}` });
      if (normalizeStageIds(stages).length < 1) return res.status(400).json({ error: 'At least one stage required' });
    }

    const workflow = stages ? { stages: normalizeStageIds(stages) } : null;
    const r = await query(
      `UPDATE projects SET mrs_workflow = $1 WHERE id = $2 AND company_id = $3 RETURNING name`,
      [workflow ? JSON.stringify(workflow) : null, req.params.project_id, cid]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Project not found' });

    res.json({ message: `Workflow updated for ${r.rows[0].name}` });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── PUT /stores/mrs/numbering-config/:project_id — set MR serial prefix / shared
//    numbering pool / starting number for a project (replaces hand-run SQL) ──
router.put('/numbering-config/:project_id', async (req, res) => {
  try {
    const { mrs_prefix, mrs_seq_group, mrs_start_seq } = req.body;
    const cid = req.user.company_id;
    const startSeq = mrs_start_seq === '' || mrs_start_seq == null ? null : parseInt(mrs_start_seq);
    if (startSeq != null && (isNaN(startSeq) || startSeq < 0)) {
      return res.status(400).json({ error: 'Start number must be a non-negative integer' });
    }
    const r = await query(
      `UPDATE projects
         SET mrs_prefix    = $1,
             mrs_seq_group = $2,
             mrs_start_seq = $3
       WHERE id = $4 AND company_id = $5
       RETURNING name, mrs_prefix, mrs_seq_group, mrs_start_seq`,
      [
        (mrs_prefix || '').trim() || null,
        (mrs_seq_group || '').trim() || null,
        startSeq,
        req.params.project_id, cid,
      ]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Project not found' });
    res.json({ message: `Numbering updated for ${r.rows[0].name}`, data: r.rows[0] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PATCH /stores/mrs/:id/reject — Anyone in the chain can reject
// NOTE: must be registered BEFORE /:id/:stage to avoid the wildcard swallowing it
router.patch('/:id/reject', async (req, res) => {
  try {
    const { remarks } = req.body;
    const mrs = await query(
      `SELECT mr.*, p.company_id FROM material_requisitions mr
       JOIN projects p ON mr.project_id = p.id WHERE mr.id = $1`,
      [req.params.id]
    );
    if (!mrs.rows.length || mrs.rows[0].company_id !== req.user.company_id) {
      return res.status(404).json({ error: 'MRS not found' });
    }
    if (!userCanAccessProject(req, mrs.rows[0].project_id)) {
      return res.status(403).json({ error: 'You do not have access to this project.' });
    }

    await query(
      `UPDATE material_requisitions
       SET status = 'rejected', rejected_by = $1, rejected_at = NOW(), remarks = $2, updated_at = NOW()
       WHERE id = $3`,
      [req.user.id, remarks || 'Rejected by workflow', req.params.id]
    );

    // Push to MR raiser that their MR was rejected
    if (mrs.rows[0].raised_by) {
      sendPushToUser(mrs.rows[0].raised_by, {
        title: `MR Rejected: ${mrsRef(mrs.rows[0])}`,
        body: `Your material request was rejected by ${req.user.name || req.user.email}. ${remarks ? `Reason: ${remarks}` : ''}`,
        data: { link: '/stores/mrs', type: 'mr_rejected', related_id: mrs.rows[0].id },
      }).catch(() => {});
    }

    res.json({ message: 'MRS rejected' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /stores/mrs/:id/renumber — fix/override an MR's serial number
// (e.g. correct a stray "-001" to "-053"). Both serial_no_formatted and the
// globally-unique mrs_number are updated together.
router.patch('/:id/renumber', async (req, res) => {
  try {
    const serial = String(req.body.serial || '').trim();
    if (!serial) return res.status(400).json({ error: 'serial is required' });

    const mrs = await query(
      `SELECT mr.id, p.company_id FROM material_requisitions mr
       JOIN projects p ON mr.project_id = p.id WHERE mr.id = $1`,
      [req.params.id]
    );
    if (!mrs.rows.length || mrs.rows[0].company_id !== req.user.company_id) {
      return res.status(404).json({ error: 'MRS not found' });
    }
    if (!userCanAccessProject(req, mrs.rows[0].project_id)) {
      return res.status(403).json({ error: 'You do not have access to this project.' });
    }

    try {
      const r = await query(
        `UPDATE material_requisitions
         SET serial_no_formatted = $1, mrs_number = $1, updated_at = NOW()
         WHERE id = $2 RETURNING serial_no_formatted`,
        [serial, req.params.id]
      );
      res.json({ message: `Serial updated to ${r.rows[0].serial_no_formatted}`, data: r.rows[0] });
    } catch (e) {
      if (e.code === '23505') return res.status(409).json({ error: `Serial "${serial}" is already in use` });
      throw e;
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /stores/mrs/:id/cancel-items — MD / Procurement drop specific items
// from an already-approved MR without rejecting the whole requisition.
// Cancelled items are excluded (md_included=false) and zero-balanced
// (md_approved_qty=0) so PO raising skips them; the row is kept for audit.
// NOTE: must be registered BEFORE /:id/:stage so the wildcard can't swallow it.
const CANCEL_ITEM_ROLES = ['managing_director', 'md', 'ceo', 'procurement_manager', 'procurement', 'admin', 'super_admin'];
router.patch('/:id/cancel-items', async (req, res) => {
  try {
    const { item_ids, reason } = req.body;
    if (!Array.isArray(item_ids) || !item_ids.length) {
      return res.status(400).json({ error: 'item_ids (a non-empty array) is required.' });
    }
    if (!CANCEL_ITEM_ROLES.includes((req.user.role || '').toLowerCase())) {
      return res.status(403).json({ error: 'Only the Managing Director or Procurement team can cancel approved items.' });
    }
    const mrs = await query(
      `SELECT mr.*, p.company_id FROM material_requisitions mr
       JOIN projects p ON mr.project_id = p.id WHERE mr.id = $1`,
      [req.params.id]
    );
    if (!mrs.rows.length || mrs.rows[0].company_id !== req.user.company_id) {
      return res.status(404).json({ error: 'MRS not found' });
    }
    if (!userCanAccessProject(req, mrs.rows[0].project_id)) {
      return res.status(403).json({ error: 'You do not have access to this project.' });
    }
    if (mrs.rows[0].status !== 'approved_md') {
      return res.status(400).json({ error: 'Items can only be cancelled on a fully-approved MR.' });
    }
    const upd = await query(
      `UPDATE mrs_items
       SET md_included = FALSE, md_approved_qty = 0, cancel_reason = $1
       WHERE mrs_id = $2 AND id = ANY($3::uuid[])
       RETURNING id`,
      [reason || null, req.params.id, item_ids]
    );
    res.json({ message: `${upd.rowCount} item(s) cancelled`, cancelled: upd.rowCount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /stores/mrs/:id — MD edits header fields and/or item details.
// Existing items are updated in place by id (never deleted/reinserted) because
// po_items.mrs_item_id references mrs_items.id without a FK — replacing rows
// would silently orphan that link and break ordered-qty tracking for any item
// already on a PO. New items (no id) are appended; existing items are never
// removed here (use /cancel-items for that, which is audit-tracked).
// NOTE: must be registered BEFORE /:id/:stage so the wildcard can't swallow it.
const MD_EDIT_ROLES = ['managing_director', 'super_admin'];
router.patch('/:id', async (req, res) => {
  try {
    if (!MD_EDIT_ROLES.includes((req.user.role || '').toLowerCase())) {
      return res.status(403).json({ error: 'Only the Managing Director can edit a Material Requisition.' });
    }
    const {
      department, head_office_project_name, site_incharge, required_by,
      priority, remarks, items,
    } = req.body;

    const mrs = await query(
      `SELECT mr.*, p.company_id FROM material_requisitions mr
       JOIN projects p ON mr.project_id = p.id WHERE mr.id = $1`,
      [req.params.id]
    );
    if (!mrs.rows.length || mrs.rows[0].company_id !== req.user.company_id) {
      return res.status(404).json({ error: 'MRS not found' });
    }
    if (!userCanAccessProject(req, mrs.rows[0].project_id)) {
      return res.status(403).json({ error: 'You do not have access to this project.' });
    }

    await withTransaction(async (client) => {
      await client.query(
        `UPDATE material_requisitions SET
           department = COALESCE($1, department),
           head_office_project_name = COALESCE($2, head_office_project_name),
           site_incharge = COALESCE($3, site_incharge),
           required_by = COALESCE($4, required_by),
           priority = COALESCE($5, priority),
           remarks = COALESCE($6, remarks)
         WHERE id = $7`,
        [department || null, head_office_project_name || null, site_incharge || null,
         required_by || null, priority || null, remarks || null, req.params.id]
      );

      if (Array.isArray(items)) {
        const maxSort = await client.query(
          `SELECT COALESCE(MAX(sort_order), 0) AS m FROM mrs_items WHERE mrs_id = $1`,
          [req.params.id]
        );
        let nextSort = parseInt(maxSort.rows[0].m) + 1;

        for (const it of items) {
          const { id, material, qty, unit, purpose, item_code, category, est_rate, preferred_vendor_id } = it;
          if (!material || !qty || !unit) continue;
          if (id) {
            await client.query(
              `UPDATE mrs_items SET
                 material_name = $1, quantity = $2, unit = $3, purpose = $4,
                 item_code = $5, category = $6, est_rate = $7, preferred_vendor_id = $8
               WHERE id = $9 AND mrs_id = $10`,
              [material, parseFloat(qty), unit, purpose || null, item_code || null,
               category || null, est_rate ? parseFloat(est_rate) : null,
               preferred_vendor_id || null, id, req.params.id]
            );
          } else {
            await client.query(
              `INSERT INTO mrs_items
                 (mrs_id, material_name, quantity, unit, purpose, sort_order, item_code, category, est_rate, preferred_vendor_id)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
              [req.params.id, material, parseFloat(qty), unit, purpose || null, nextSort++,
               item_code || null, category || null, est_rate ? parseFloat(est_rate) : null,
               preferred_vendor_id || null]
            );
          }
        }
      }
    });

    const full = await query(`SELECT * FROM material_requisitions WHERE id = $1`, [req.params.id]);
    const itemsRes = await query(`SELECT * FROM mrs_items WHERE mrs_id = $1 ORDER BY sort_order`, [req.params.id]);
    res.json({ data: { ...full.rows[0], items: itemsRes.rows } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PATCH /:id/:stage  — dynamic stage-based approval ─────────────────────
router.patch('/:id/:stage', async (req, res) => {
  try {
    const { stage } = req.params;
    const { remarks, purchase_data, signature_img } = req.body;

    // Load MRS + project
    const mrs = await query(
      `SELECT mr.*, p.company_id, p.mrs_workflow, p.name AS project_name,
              u.name AS raised_by_name, u.email AS raised_by_email
       FROM material_requisitions mr
       JOIN projects p ON mr.project_id = p.id
       LEFT JOIN users u ON u.id = mr.raised_by
       WHERE mr.id = $1`,
      [req.params.id]
    );
    if (!mrs.rows.length || mrs.rows[0].company_id !== req.user.company_id)
      return res.status(404).json({ error: 'MRS not found' });
    if (!userCanAccessProject(req, mrs.rows[0].project_id))
      return res.status(403).json({ error: 'You do not have access to this project.' });

    // Build dynamic chain for this project
    const enabledIds = normalizeStageIds(mrs.rows[0].mrs_workflow?.stages);
    const chain = buildChain(enabledIds);

    if (!chain[stage]) return res.status(400).json({ error: `Stage "${stage}" is not part of this project's approval workflow` });
    const cfg = chain[stage];
    const allowedPrev = [cfg.requiredPrev, ...(cfg.legacyPrev || [])];

    if (!allowedPrev.includes(mrs.rows[0].status)) {
      return res.status(400).json({
        error: `Cannot perform "${cfg.label}" — MRS is at "${mrs.rows[0].status}", expected "${cfg.requiredPrev}"`
      });
    }

    // Role check — only the designated role can approve each stage
    // (admin / super_admin bypass for system management)
    if (!GLOBAL_ADMIN_ROLES.includes(req.user.role)) {
      const userRole = (req.user.role || '').toLowerCase();
      const allowed  = cfg.allowedRoles || [];
      if (!allowed.includes(userRole)) {
        return res.status(403).json({
          error: `Only a ${cfg.label} can approve this stage. Your role (${req.user.role}) is not authorised for "${cfg.label}" approval.`
        });
      }
    }

    // Build dynamic SET clause
    let setSql = `status = $1, ${cfg.colBy} = $2, ${cfg.colAt} = NOW(), updated_at = NOW()`;
    const params = [cfg.nextStatus, req.user.id];

    if (remarks)       { setSql += `, remarks = $${params.length + 1}`;      params.push(remarks); }
    if (signature_img) { setSql += `, ${cfg.sigCol} = $${params.length + 1}`; params.push(signature_img); }

    if (stage === 'approve-md' && purchase_data) {
      const { received_date, po_no_date, expected_delivery } = purchase_data;
      setSql += `, purchase_received_date = $${params.length+1}, po_no_date = $${params.length+2}, expected_delivery_date = $${params.length+3}, processed_by = $${params.length+4}, processed_at = NOW()`;
      params.push(received_date, po_no_date, expected_delivery, req.user.id);
    }

    params.push(req.params.id);
    await query(`UPDATE material_requisitions SET ${setSql} WHERE id = $${params.length}`, params);

    // Save MD item-level selections (which items approved + at what qty)
    if (stage === 'approve-md' && Array.isArray(req.body.approved_items) && req.body.approved_items.length) {
      for (const ai of req.body.approved_items) {
        if (!ai.id) continue;
        await query(
          `UPDATE mrs_items
           SET md_approved_qty = $1, md_included = $2
           WHERE id = $3 AND mrs_id = $4`,
          [
            ai.qty != null ? parseFloat(ai.qty) : null,
            ai.included !== false,
            ai.id,
            req.params.id,
          ]
        );
      }
    }

    // Always push to MR raiser when any approval stage is done
    if (mrs.rows[0].raised_by) {
      const isFinalApproval = cfg.nextStatus === 'approved_md';
      sendPushToUser(mrs.rows[0].raised_by, {
        title: isFinalApproval
          ? `MR Fully Approved: ${mrsRef(mrs.rows[0])}`
          : `MR ${cfg.label}: ${mrsRef(mrs.rows[0])}`,
        body: isFinalApproval
          ? `Your material request for ${mrs.rows[0].project_name || 'the project'} has been fully approved.`
          : `${cfg.label} completed by ${req.user.name || req.user.email} for ${mrs.rows[0].project_name || 'the project'}.`,
        data: { link: '/stores/mrs', type: 'mr_approved', related_id: mrs.rows[0].id },
      }).catch(() => {});
    }

    // After PM approval — notify full team with item details.
    // In the standard 4-stage flow this fires at 'approved_mgmt' (Project Director stage);
    // in the 3-stage flow (SM→PM→MD), PM approval sets 'approved_pm' and MD is next,
    // so we fire the same notification then so MD knows their action is required.
    const pmApprovedAndMDIsNext =
      cfg.nextStatus === 'approved_pm' && !enabledIds.includes('approve-mgmt');
    if (cfg.nextStatus === 'approved_mgmt' || pmApprovedAndMDIsNext) {
      notifyAfterProjectHeadApproval({ mrs: { ...mrs.rows[0], status: cfg.nextStatus } });
    }

    if (cfg.nextStatus === 'approved_md') {
      const itemCount = await query(
        `SELECT COUNT(*)::int AS item_count FROM mrs_items WHERE mrs_id = $1::uuid`,
        [req.params.id]
      );
      notifyProcurementAfterMDApproval({
        companyId: req.user.company_id,
        mrs: {
          ...mrs.rows[0],
          status: cfg.nextStatus,
          item_count: itemCount.rows[0]?.item_count || 0,
        },
      });

      // Also push to procurement + management for final approval
      const procEmails = parseEmails(process.env.MRS_PROCUREMENT_NOTIFY_EMAILS, DEFAULT_PROCUREMENT_MRS_EMAILS);
      const mgmtEmails = parseEmails(process.env.MRS_MGMT_NOTIFY_EMAILS, DEFAULT_MGMT_NOTIFY_EMAILS);
      sendPushToUsersByEmail(req.user.company_id, [...new Set([...procEmails, ...mgmtEmails])], {
        title: `MR Fully Approved: ${mrsRef(mrs.rows[0])}`,
        body: `MR for ${mrs.rows[0].project_name || 'a project'} is MD-approved. Proceed with RFQ/PO.`,
        data: { link: '/stores/mrs', type: 'mr_final_approved', related_id: mrs.rows[0].id },
      }).catch(() => {});
    }

    res.json({ message: `MRS ${cfg.label} completed`, status: cfg.nextStatus });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /stores/mrs/:id — Only draft or rejected MRS can be deleted
router.delete('/:id', async (req, res) => {
  try {
    const mrs = await query(
      `SELECT mr.*, p.company_id FROM material_requisitions mr
       JOIN projects p ON mr.project_id = p.id WHERE mr.id = $1`,
      [req.params.id]
    );
    if (!mrs.rows.length || mrs.rows[0].company_id !== req.user.company_id) {
      return res.status(404).json({ error: 'MRS not found' });
    }
    const row = mrs.rows[0];
    if (!userCanAccessProject(req, row.project_id)) {
      return res.status(403).json({ error: 'You do not have access to this project.' });
    }
    // Delete items first (FK constraint), then the MRS
    await query(`DELETE FROM mrs_items WHERE mrs_id = $1`, [req.params.id]);
    await query(`DELETE FROM material_requisitions WHERE id = $1`, [req.params.id]);
    res.json({ message: 'MRS deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /stores/mrs/:id/resend-notify — admin can re-trigger MRS notification emails
router.post('/:id/resend-notify', async (req, res) => {
  try {
    const { authorize } = require('../middleware/auth');
    // Only admin / super_admin
    if (!['admin', 'super_admin'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Admin only' });
    }
    const mrs = await query(
      `SELECT mr.*, p.name AS project_name, p.company_id,
              u.name AS raised_by_name, u.email AS raised_by_email,
              (SELECT COUNT(*) FROM mrs_items WHERE mrs_id = mr.id) AS item_count
       FROM material_requisitions mr
       JOIN projects p ON mr.project_id = p.id
       JOIN users u ON mr.raised_by = u.id
       WHERE mr.id = $1`,
      [req.params.id]
    );
    if (!mrs.rows.length || mrs.rows[0].company_id !== req.user.company_id) {
      return res.status(404).json({ error: 'MRS not found' });
    }
    const mrsData = mrs.rows[0];
    notifyStoresForNewMRS({ companyId: req.user.company_id, mrs: mrsData });
    notifyProcurementForNewMRS({ companyId: req.user.company_id, mrs: mrsData });
    notifyMDForNewMRS({ mrs: mrsData });
    res.json({ message: `Notifications resent for ${mrsRef(mrsData)}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
