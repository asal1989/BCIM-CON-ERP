// backend/src/routes/mail.routes.js — admin-only mail diagnostics
const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const { query } = require('../config/database');
const { sendTestMail, sendMail, sendWelcomeLoginMail, isGraphConfigured, isSmtpConfigured } = require('../services/mail.service');
const { createPasswordResetToken, getResetBaseUrl } = require('../controllers/auth.controller');

router.use(authenticate);
router.use(authorize('super_admin', 'admin'));

// GET /api/v1/mail/status — what's configured (no secrets)
router.get('/status', (req, res) => {
  res.json({
    graph_configured: isGraphConfigured(),
    smtp_configured:  isSmtpConfigured(),
    mail_from: process.env.MAIL_FROM || process.env.ONEDRIVE_USER_EMAIL || null,
    azure_tenant_set: Boolean(process.env.AZURE_TENANT_ID || process.env.ONEDRIVE_TENANT_ID),
    azure_client_set: Boolean(process.env.AZURE_CLIENT_ID || process.env.ONEDRIVE_CLIENT_ID),
    azure_secret_set: Boolean(process.env.AZURE_CLIENT_SECRET || process.env.ONEDRIVE_CLIENT_SECRET),
    smtp_host: process.env.SMTP_HOST || null,
  });
});

// POST /api/v1/mail/test  body: { to }
router.post('/test', async (req, res) => {
  const { to } = req.body;
  if (!to) return res.status(400).json({ error: 'to is required' });
  try {
    const result = await sendTestMail(to);
    res.json(result);
  } catch (err) {
    res.status(500).json({ sent: false, error: err.message });
  }
});

// POST /api/v1/mail/send  body: { to, subject, html, text }
// Generic admin send — useful for verifying notification template renders
router.post('/send', async (req, res) => {
  const { to, subject, html, text } = req.body;
  if (!to || !subject) return res.status(400).json({ error: 'to and subject required' });
  try {
    const result = await sendMail({ to, subject, html, text });
    res.json(result);
  } catch (err) {
    res.status(500).json({ sent: false, error: err.message });
  }
});

// POST /api/v1/mail/welcome  body: { to }
// Resends the "Login Access Details" welcome email (with a fresh password-reset
// link) to an existing user, looked up by email.
router.post('/welcome', async (req, res) => {
  const { to } = req.body;
  if (!to) return res.status(400).json({ error: 'to is required' });
  try {
    const { rows } = await query(
      `SELECT u.id, u.name, u.email, u.role,
              COALESCE(dep.name, u.department, '') AS department,
              COALESCE(co.name, '')               AS company
         FROM users u
         LEFT JOIN employee_profiles ep ON ep.user_id = u.id
         LEFT JOIN hr_departments    dep ON dep.id = ep.department_id
         LEFT JOIN companies         co ON co.id = u.company_id
        WHERE LOWER(u.email) = LOWER($1)
        LIMIT 1`,
      [to]
    );
    if (!rows.length) return res.status(404).json({ error: `No user found with email ${to}` });
    const user = rows[0];

    const baseUrl  = getResetBaseUrl();
    const token    = await createPasswordResetToken(user.id);
    const result   = await sendWelcomeLoginMail({
      to:         user.email,
      name:       user.name,
      role:       user.role,
      department: user.department,
      company:    user.company,
      loginUrl:   `${baseUrl}/login`,
      resetUrl:   `${baseUrl}/reset-password?token=${token}`,
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ sent: false, error: err.message });
  }
});

// POST /api/v1/mail/erp-daily-report
// Sends today's ERP development activity report to MD + IT
router.post('/erp-daily-report', async (req, res) => {
  try {
    const RECIPIENTS = ['stephen@bcim.in', 'it@bcim.in'];
    const today = new Date();
    const dateStr = today.toLocaleDateString('en-IN', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    });
    const todayISO = today.toISOString().split('T')[0];

    // Read today's git commits
    let commits = [];
    try {
      const { execSync } = require('child_process');
      const log = execSync(
        `git log --since="${todayISO} 00:00:00 +0530" --format="%h|||%s|||%ai" --no-merges`,
        { encoding: 'utf8', cwd: process.cwd() }
      ).trim();
      if (log) {
        commits = log.split('\n').map(line => {
          const [hash, subject, date] = line.split('|||');
          return { hash: (hash || '').trim(), subject: (subject || '').trim(), date: (date || '').trim() };
        }).filter(c => c.subject);
      }
    } catch (_) {}

    // Also query today's ERP activity
    const cid = req.user.company_id;
    const [scBills, tqsBills, mrsList, poList] = await Promise.all([
      query(`SELECT COUNT(*)::int AS cnt, COALESCE(SUM(net_payable),0)::numeric AS total
               FROM sc_bills WHERE company_id=$1 AND created_at::date = $2`, [cid, todayISO]),
      query(`SELECT COUNT(*)::int AS cnt, COALESCE(SUM(total_amount),0)::numeric AS total
               FROM tqs_bills WHERE company_id=$1 AND created_at::date = $2 AND is_deleted=false`, [cid, todayISO]),
      query(`SELECT COUNT(*)::int AS cnt FROM material_requests WHERE company_id=$1 AND created_at::date = $2`, [cid, todayISO]),
      query(`SELECT COUNT(*)::int AS cnt, COALESCE(SUM(grand_total),0)::numeric AS total
               FROM purchase_orders WHERE company_id=$1 AND created_at::date = $2`, [cid, todayISO]),
    ]);

    const inr = v => Number(v || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 });
    const stat = (label, val) => `
      <td style="text-align:center;padding:16px 20px;border-right:1px solid #e2e8f0">
        <div style="font-size:22px;font-weight:700;color:#0a2057">${val}</div>
        <div style="font-size:11px;color:#64748b;margin-top:4px;text-transform:uppercase;letter-spacing:0.04em">${label}</div>
      </td>`;

    const commitRow = ({ hash, subject }) => {
      const typeMatch = subject.match(/^(feat|fix|refactor|chore|docs|style|test)\(([^)]+)\):\s*/i);
      const type = typeMatch?.[1]?.toLowerCase();
      const scope = typeMatch?.[2];
      const msg = typeMatch ? subject.replace(typeMatch[0], '') : subject;
      const badge = {
        feat:     { bg: '#dcfce7', color: '#15803d', label: 'NEW' },
        fix:      { bg: '#fee2e2', color: '#dc2626', label: 'FIX' },
        refactor: { bg: '#e0f2fe', color: '#0284c7', label: 'REFACTOR' },
      }[type] || { bg: '#f1f5f9', color: '#475569', label: 'UPDATE' };

      return `<tr style="border-bottom:1px solid #f1f5f9">
        <td style="padding:10px 16px;width:60px;text-align:center">
          <span style="display:inline-block;padding:2px 7px;border-radius:4px;font-size:10px;font-weight:700;background:${badge.bg};color:${badge.color}">${badge.label}</span>
        </td>
        <td style="padding:10px 16px;font-size:13px;color:#0f172a">
          ${scope ? `<span style="color:#64748b;font-size:11px">[${scope}]</span> ` : ''}${msg}
        </td>
        <td style="padding:10px 16px;font-family:monospace;font-size:11px;color:#94a3b8;white-space:nowrap">${hash}</td>
      </tr>`;
    };

    const subject = `BCIM ConstructERP — Daily Update · ${dateStr}`;
    const html = `
<div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;color:#0f172a">
  <div style="background:linear-gradient(135deg,#0a2057 0%,#1e3a8a 100%);padding:28px 32px;border-radius:8px 8px 0 0">
    <p style="color:#93c5fd;font-size:11px;margin:0 0 4px;letter-spacing:0.06em;text-transform:uppercase">BCIM Engineering Private Limited</p>
    <h2 style="color:#ffffff;margin:0;font-size:20px;font-weight:700">ConstructERP — Daily Update Report</h2>
    <p style="color:#93c5fd;font-size:13px;margin:6px 0 0">${dateStr}</p>
  </div>

  <div style="background:#f8fafc;border:1px solid #e2e8f0;border-top:none;padding:0">

    <!-- Activity summary -->
    <div style="padding:20px 24px 4px">
      <p style="font-size:11px;font-weight:700;letter-spacing:0.05em;color:#0a2057;text-transform:uppercase;margin:0 0 12px;border-bottom:2px solid #e2e8f0;padding-bottom:6px">Today's ERP Activity</p>
    </div>
    <table style="width:100%;border-collapse:collapse;border-bottom:1px solid #e2e8f0;background:#fff">
      <tr>
        ${stat('SC Bills Raised', scBills.rows[0].cnt > 0 ? `${scBills.rows[0].cnt} <span style="font-size:13px;color:#64748b">· ₹${inr(scBills.rows[0].total)}</span>` : '—')}
        ${stat('TQS Bills', tqsBills.rows[0].cnt > 0 ? `${tqsBills.rows[0].cnt} <span style="font-size:13px;color:#64748b">· ₹${inr(tqsBills.rows[0].total)}</span>` : '—')}
        ${stat('MRS Raised', mrsList.rows[0].cnt || '—')}
        ${stat('POs Created', poList.rows[0].cnt > 0 ? `${poList.rows[0].cnt} <span style="font-size:13px;color:#64748b">· ₹${inr(poList.rows[0].total)}</span>` : '—')}
      </tr>
    </table>

    <!-- Dev changes -->
    ${commits.length > 0 ? `
    <div style="padding:20px 24px 4px">
      <p style="font-size:11px;font-weight:700;letter-spacing:0.05em;color:#0a2057;text-transform:uppercase;margin:0 0 12px;border-bottom:2px solid #e2e8f0;padding-bottom:6px">
        System Changes Deployed Today (${commits.length})
      </p>
    </div>
    <div style="background:#fff;border-bottom:1px solid #e2e8f0">
      <table style="width:100%;border-collapse:collapse">
        ${commits.map(commitRow).join('')}
      </table>
    </div>` : ''}

    <div style="padding:16px 24px">
      <p style="font-size:12px;color:#94a3b8;margin:0">
        Auto-generated by BCIM ConstructERP &nbsp;·&nbsp; ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST
      </p>
    </div>
  </div>
</div>`;

    const result = await sendMail({ to: RECIPIENTS, subject, html });
    res.json({ ...result, sent_to: RECIPIENTS, commits: commits.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
