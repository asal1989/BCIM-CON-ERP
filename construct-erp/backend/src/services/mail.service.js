// src/services/mail.service.js
// Sends transactional email via Microsoft Graph API (preferred)
// Falls back to nodemailer SMTP if Graph is not configured.

const nodemailer = require('nodemailer');
const { isBlockedEmail } = require('../config/notification-blocklist');

// ─────────────────────────────────────────────────────────────────────────────
// Microsoft Graph API helpers
// Reuses the same Azure AD app registration as OneDrive integration.
// Required app permission: Microsoft Graph → Mail.Send (Application, not Delegated)
// ─────────────────────────────────────────────────────────────────────────────

const isGraphConfigured = () =>
  Boolean(
    (process.env.AZURE_CLIENT_ID     || process.env.ONEDRIVE_CLIENT_ID)     &&
    (process.env.AZURE_CLIENT_SECRET || process.env.ONEDRIVE_CLIENT_SECRET) &&
    (process.env.AZURE_TENANT_ID     || process.env.ONEDRIVE_TENANT_ID)     &&
    (process.env.MAIL_FROM           || process.env.ONEDRIVE_USER_EMAIL)
  );

/**
 * Obtain a short-lived access token using Azure AD client-credentials flow.
 * Scope: https://graph.microsoft.com/.default  (picks up app permissions)
 */
const getGraphToken = async () => {
  const tenantId  = process.env.AZURE_TENANT_ID     || process.env.ONEDRIVE_TENANT_ID;
  const clientId  = process.env.AZURE_CLIENT_ID     || process.env.ONEDRIVE_CLIENT_ID;
  const clientSec = process.env.AZURE_CLIENT_SECRET || process.env.ONEDRIVE_CLIENT_SECRET;

  const url  = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    grant_type:    'client_credentials',
    client_id:     clientId,
    client_secret: clientSec,
    scope:         'https://graph.microsoft.com/.default',
  });

  const res  = await fetch(url, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    body.toString(),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(
      data.error_description || data.error ||
      `Azure token request failed (HTTP ${res.status})`
    );
  }
  return data.access_token;
};

/**
 * Send one email via Microsoft Graph  POST /users/{sender}/sendMail
 */
const normalizeRecipients = (value) => {
  if (Array.isArray(value)) return value.map(v => String(v || '').trim()).filter(Boolean);
  return String(value || '').split(/[;,]/).map(v => v.trim()).filter(Boolean);
};

const alertSubjectPattern = /\b(alert|warning|exceeded|over|pending|approval|required|notify|notification|aging|limit|low stock|due)\b/i;

const filterAlertRecipients = ({ recipients, subject }) => {
  if (!alertSubjectPattern.test(String(subject || ''))) return recipients;
  const excluded = new Set(normalizeRecipients(
    process.env.ALERT_EXCLUDE_EMAILS ||
    process.env.MAIL_ALERT_EXCLUDE_EMAILS ||
    ''
  ).map(email => email.toLowerCase()));
  if (!excluded.size) return recipients;
  return recipients.filter(email => !excluded.has(String(email).toLowerCase()));
};

const sendViaGraph = async ({ to, cc, subject, html, text, attachments = [] }) => {
  const token  = await getGraphToken();
  const sender = process.env.MAIL_FROM || process.env.ONEDRIVE_USER_EMAIL;

  console.log(`[mail] Graph → FROM: ${sender}  TO: ${to}  SUBJECT: ${subject}`);

  const payload = {
    message: {
      subject,
      body: {
        contentType: html ? 'HTML' : 'Text',
        content:     html  || text || '',
      },
      toRecipients: [{ emailAddress: { address: to } }],
      ccRecipients: normalizeRecipients(cc).map(address => ({ emailAddress: { address } })),
      attachments: attachments.map(a => ({
        '@odata.type':  '#microsoft.graph.fileAttachment',
        name:           a.filename,
        contentType:    a.contentType || 'application/octet-stream',
        contentBytes:   a.base64,
      })),
    },
    saveToSentItems: false,
  };

  const res = await fetch(
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(sender)}/sendMail`,
    {
      method:  'POST',
      headers: {
        Authorization:  `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    }
  );

  console.log(`[mail] Graph response: HTTP ${res.status}`);

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    console.error(`[mail] Graph error detail:`, JSON.stringify(err));
    throw new Error(
      err?.error?.message ||
      `Graph sendMail failed (HTTP ${res.status})`
    );
  }
  // 202 Accepted — no body
};

// ─────────────────────────────────────────────────────────────────────────────
// SMTP fallback (nodemailer)
// ─────────────────────────────────────────────────────────────────────────────

const isSmtpConfigured = () =>
  Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);

const getTransport = () =>
  nodemailer.createTransport({
    host:   process.env.SMTP_HOST,
    port:   parseInt(process.env.SMTP_PORT || '587', 10),
    secure: String(process.env.SMTP_SECURE || '').toLowerCase() === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

const sendMail = async ({ to, cc, subject, html, text, attachments = [] }) => {
  let recipients = filterAlertRecipients({ recipients: normalizeRecipients(to), subject });
  let ccRecipients = filterAlertRecipients({ recipients: normalizeRecipients(cc), subject });
  recipients = recipients.filter(email => !isBlockedEmail(email));
  ccRecipients = ccRecipients.filter(email => !isBlockedEmail(email));
  if (!recipients.length) return { sent: false, reason: 'No recipients' };

  const results = [];
  for (const recipient of recipients) {
    let lastErr = null;
    if (isGraphConfigured()) {
      try {
        await sendViaGraph({ to: recipient, cc: ccRecipients, subject, html, text, attachments });
        results.push({ to: recipient, sent: true, provider: 'graph' });
        continue;
      } catch (err) {
        lastErr = err;
        console.error('[mail] Graph API failed:', err.message);
      }
    }

    if (isSmtpConfigured()) {
      try {
        const transporter = getTransport();
        await transporter.sendMail({
          from: process.env.SMTP_FROM || process.env.SMTP_USER,
          to: recipient,
          cc: ccRecipients,
          subject,
          text,
          html,
          attachments: attachments.map(a => ({
            filename:    a.filename,
            content:     Buffer.from(a.base64, 'base64'),
            contentType: a.contentType || 'application/octet-stream',
          })),
        });
        results.push({ to: recipient, sent: true, provider: 'smtp' });
        continue;
      } catch (err) {
        console.error('[mail] SMTP failed:', err.message);
        results.push({ to: recipient, sent: false, reason: `SMTP error: ${err.message}` });
        continue;
      }
    }

    const reason = lastErr
      ? `Graph API error: ${lastErr.message}`
      : 'No mail provider configured (Graph or SMTP)';
    console.warn(`[mail] Email not sent to ${recipient}: ${reason}`);
    results.push({ to: recipient, sent: false, reason });
  }

  const sent = results.some(r => r.sent);
  return { sent, results, reason: sent ? undefined : (results[0]?.reason || 'Email not sent') };
};

// ─────────────────────────────────────────────────────────────────────────────
// Password-reset email
// ─────────────────────────────────────────────────────────────────────────────

const sendPasswordResetMail = async ({ to, name, resetUrl }) => {
  const displayName = name || 'User';

  const subject = 'BCIM Construct ERP — Password Reset';

  const text = [
    `Hello ${displayName},`,
    '',
    'A password reset was requested for your BCIM Construct ERP account.',
    `Reset your password here: ${resetUrl}`,
    '',
    'This link expires in 30 minutes.',
    'If you did not request this, you can safely ignore this email.',
    '',
    '— BCIM Engineering',
  ].join('\n');

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;color:#0f172a">
      <div style="background:#0a2057;padding:24px 32px;border-radius:8px 8px 0 0">
        <h2 style="color:#ffffff;margin:0;font-size:20px">🔑 Password Reset Request</h2>
      </div>
      <div style="background:#f8fafc;padding:28px 32px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 8px 8px">
        <p style="margin-top:0">Hello <strong>${displayName}</strong>,</p>
        <p>A password reset was requested for your <strong>BCIM Construct ERP</strong> account.</p>
        <p>Click the button below to set a new password:</p>
        <p style="text-align:center;margin:28px 0">
          <a href="${resetUrl}"
             style="display:inline-block;background:#0a2057;color:#ffffff;text-decoration:none;
                    padding:12px 28px;border-radius:6px;font-weight:700;font-size:15px">
            Reset My Password
          </a>
        </p>
        <p style="font-size:13px;color:#64748b">
          Or copy this link into your browser:<br>
          <span style="word-break:break-all;color:#0a2057">${resetUrl}</span>
        </p>
        <hr style="border:none;border-top:1px solid #e2e8f0;margin:20px 0">
        <p style="font-size:12px;color:#94a3b8;margin-bottom:0">
          ⏱ This link expires in <strong>30 minutes</strong>.<br>
          If you did not request this, you can safely ignore this email.
        </p>
      </div>
    </div>
  `;

  // ── 1. Try Microsoft Graph ────────────────────────────────────────────────
  if (isGraphConfigured()) {
    try {
      await sendViaGraph({ to, subject, html, text });
      console.log(`[mail] Graph API → sent to ${to}`);
      return { sent: true, provider: 'graph' };
    } catch (err) {
      console.error('[mail] Graph API failed:', err.message);
      // fall through to SMTP, but remember the error
      const graphErr = err.message;

      // ── 2. Try SMTP ─────────────────────────────────────────────────────
      if (isSmtpConfigured()) {
        try {
          const transporter = getTransport();
          await transporter.sendMail({
            from:    process.env.SMTP_FROM || process.env.SMTP_USER,
            to,
            subject,
            text,
            html,
          });
          console.log(`[mail] SMTP → sent to ${to}`);
          return { sent: true, provider: 'smtp' };
        } catch (smtpErr) {
          console.error('[mail] SMTP failed:', smtpErr.message);
          return { sent: false, reason: `Graph failed: ${graphErr} | SMTP failed: ${smtpErr.message}` };
        }
      }

      return { sent: false, reason: `Graph API error: ${graphErr}` };
    }
  }

  // ── 2. Try SMTP (Graph not configured) ───────────────────────────────────
  if (isSmtpConfigured()) {
    try {
      const transporter = getTransport();
      await transporter.sendMail({
        from:    process.env.SMTP_FROM || process.env.SMTP_USER,
        to,
        subject,
        text,
        html,
      });
      console.log(`[mail] SMTP → sent to ${to}`);
      return { sent: true, provider: 'smtp' };
    } catch (err) {
      console.error('[mail] SMTP failed:', err.message);
      return { sent: false, reason: `SMTP error: ${err.message}` };
    }
  }

  // ── 3. Neither configured ─────────────────────────────────────────────────
  const missing = [];
  if (!process.env.ONEDRIVE_CLIENT_ID && !process.env.AZURE_CLIENT_ID) missing.push('ONEDRIVE_CLIENT_ID');
  if (!process.env.ONEDRIVE_CLIENT_SECRET && !process.env.AZURE_CLIENT_SECRET) missing.push('ONEDRIVE_CLIENT_SECRET');
  if (!process.env.ONEDRIVE_TENANT_ID && !process.env.AZURE_TENANT_ID) missing.push('ONEDRIVE_TENANT_ID');
  if (!process.env.ONEDRIVE_USER_EMAIL && !process.env.MAIL_FROM) missing.push('ONEDRIVE_USER_EMAIL');
  const reason = missing.length
    ? `Graph not configured — missing Railway variables: ${missing.join(', ')}`
    : 'No mail provider configured (Graph or SMTP)';
  console.warn(`[mail] ${reason}. Reset link for ${to}: ${resetUrl}`);
  return { sent: false, reason };
};

// ─────────────────────────────────────────────────────────────────────────────
// Welcome / login-access email — sent when a new user account is created
// ─────────────────────────────────────────────────────────────────────────────

// Department-specific access content. Keyed by normalized department keywords;
// returns the modules, key features, approval limits and guide slug shown in
// the welcome email. Falls back to a sensible general profile.
const DEPT_CONTENT = [
  {
    key: 'operations', match: ['project','site','operation','planning','execution','civil','construction','survey'],
    label: 'Operations',
    modules: [['Material Requisitions','Create, Edit, View'],['Daily Progress Report','Create, View'],['Work Orders','View, Approve'],['Measurements / BOQ','Create, View']],
    features: ['Material Requisitions (create & track)','Site Progress & DPR','Work Orders (view & approve)','Reports & Analytics'],
    guide: 'operations',
  },
  {
    key: 'engineering', match: ['engineer','technical','design','qa','qc','quality','structural','mep','drawing','architect'],
    label: 'Engineering & Technical',
    modules: [['BOQ & Estimation','Create, Edit, View'],['Drawings','View, Download'],['QA / QC Checklists','Create, Approve'],['Measurements','Create, View']],
    features: ['BOQ & Estimation','Drawing register','QA/QC inspections','Measurement sheets','Reports & Analytics'],
    guide: 'engineering',
  },
  {
    key: 'hse', match: ['safety','hse','environment','ehs','health','fire'],
    label: 'Safety & HSE',
    modules: [['Safety Inspections','Create, Edit, View'],['Incident Reports','Create, Approve'],['Compliance Register','View, Download']],
    features: ['Safety inspections & audits','Incident & near-miss logging','Toolbox talks','Compliance reports'],
    guide: 'hse',
  },
  {
    key: 'plant', match: ['plant','machine','equipment','workshop','mechanical','vehicle','fleet'],
    label: 'Plant & Machinery',
    modules: [['Equipment Register','Create, Edit, View'],['Deployment & Logs','Create, View'],['Fuel & Maintenance','Create, Approve']],
    features: ['Equipment register','Deployment & daily logs','Fuel consumption','Maintenance schedules','Hire & rental'],
    guide: 'plant',
  },
  {
    key: 'procurement', match: ['purchase','procurement','store','material','supply','warehouse','inventory','subcontract'],
    label: 'Procurement & Store',
    modules: [['Purchase Orders','Create, Approve'],['Vendors','Create, Edit, View'],['GRN / Goods Receipt','Create, View'],['Stock & Inventory','Create, Edit']],
    features: ['Purchase Orders (create & approve)','Vendor management','GRN & material inward','Stock & Inventory','Reports & Analytics'],
    guide: 'procurement',
  },
  {
    key: 'finance', match: ['finance','account','billing','cost','commercial','audit','tax'],
    label: 'Finance & Accounts',
    modules: [['Bills & Payments','Process, Approve'],['Budget Tracking','View, Edit'],['Chart of Accounts','Create, View'],['Reports & Analytics','View, Download']],
    features: ['Bills & Payments (process & manage)','Budget tracking','Project cost control','Financial reports & dashboards'],
    guide: 'finance',
  },
  {
    key: 'hr', match: ['hr','human resource','admin','it ','information technology','legal','compliance','secretar'],
    label: 'HR & Administration',
    modules: [['Employees','Create, Edit, View'],['Attendance & Leave','View, Approve'],['Payroll','Process, View'],['HR Reports','View, Download']],
    features: ['Employee management','Attendance & leave','Payroll processing','Compliance & statutory reports'],
    guide: 'hr',
  },
  {
    key: 'bd', match: ['business','marketing','sales','bd','client','crm','tender'],
    label: 'Business Development',
    modules: [['Tenders','Create, Edit, View'],['Clients','Create, View'],['Quotations','Create, Approve']],
    features: ['Tender management','Client & CRM','Quotations & estimates','Reports & Analytics'],
    guide: 'business-development',
  },
];

const GENERAL_CONTENT = {
  label: 'General',
  modules: [['Dashboard','View'],['Reports','View, Download'],['My Profile','Edit, View']],
  features: ['Dashboards','Reports & Analytics','Notifications','My profile'],
  guide: 'getting-started',
};

const getDeptContent = (department = '') => {
  const d = String(department).toLowerCase();
  for (const c of DEPT_CONTENT) {
    if (c.match.some(m => d.includes(m.trim()))) return c;
  }
  return GENERAL_CONTENT;
};

const sendWelcomeLoginMail = async ({ to, name, role, department, company, loginUrl, resetUrl }) => {
  const displayName = name || 'User';
  const displayRole = role || 'User';
  const displayCompany = company || 'BCIM Engineering Private Limited';
  const c = getDeptContent(department);
  const displayDept = department || c.label;

  const base = (loginUrl || 'https://erp.bcim.in').replace(/\/(login)?$/, '');
  const dashboardUrl = `${base}/dashboard`;
  const reportsUrl   = `${base}/hr-admin/reports`;
  const approvalsUrl = `${base}/approvals`;
  const guideUrl     = `${base}/help/${c.guide}`;
  const supportPhone = process.env.SUPPORT_PHONE || '+91 80 4710 0000';
  const supportHours = 'Mon–Fri, 9:00 AM – 6:00 PM IST';

  const subject = `Welcome to BCIM ConstructERP — Login Access for ${displayName}`;

  // ── Plain-text version ──────────────────────────────────────────────────────
  const text = [
    `Dear ${displayName},`,
    '',
    'Welcome to BCIM ConstructERP! Your account has been successfully created and is ready to use.',
    '',
    'ACCOUNT DETAILS:',
    `  Username      : ${to}`,
    `  Access Portal : ${loginUrl}`,
    `  Company       : ${displayCompany}`,
    `  Department    : ${displayDept}`,
    `  Role          : ${displayRole}`,
    '',
    'FIRST LOGIN — SET YOUR PASSWORD:',
    `  1. Open ${loginUrl}`,
    `  2. Click this secure link to set your password: ${resetUrl}`,
    '     (the link expires in 24 hours)',
    '  3. Choose a strong password (min 8 characters with uppercase, numbers & symbols)',
    '  4. Complete your profile information',
    '',
    `WHAT YOU CAN ACCESS (as ${displayRole} in ${displayDept}):`,
    ...c.modules.map(([m, p]) => `  • ${m} (${p})`),
    '',
    'KEY FEATURES YOU\'LL USE:',
    ...c.features.map(f => `  • ${f}`),
    '',
    'YOUR FIRST STEPS:',
    '  1. Complete your password setup',
    '  2. Update your profile picture and contact info',
    '  3. Review the dashboard tutorial (shown on first login)',
    `  4. Read the user guide for your department: ${guideUrl}`,
    '',
    'QUICK SHORTCUTS:',
    `  Dashboard         : ${dashboardUrl}`,
    `  My Reports        : ${reportsUrl}`,
    `  Approvals Pending : ${approvalsUrl}`,
    '',
    'SECURITY REMINDERS:',
    '  • Never share your password   • Log out after each session',
    '  • Change your password regularly   • Report suspicious activity immediately',
    '',
    'SYSTEM DETAILS:',
    '  Browser   : Chrome, Firefox or Safari (latest versions)',
    '  Internet  : Works best with 5 Mbps+ connection',
    '  Timezone  : IST (Indian Standard Time)',
    '',
    'GETTING HELP:',
    '  Email support : support@bcim.in',
    `  Phone support : ${supportPhone} (${supportHours})`,
    '  Help centre   : Click the ? icon on any page',
    '',
    '— BCIM Engineering',
  ].join('\n');

  // ── HTML version ────────────────────────────────────────────────────────────
  const row = (k, v) =>
    `<tr>
      <td style="padding:10px 14px;border:1px solid #e2e8f0;background:#f8fafc;width:38%;font-weight:600;color:#0f172a">${k}</td>
      <td style="padding:10px 14px;border:1px solid #e2e8f0;color:#0f172a">${v}</td>
    </tr>`;

  const sectionTitle = (t) =>
    `<p style="margin:26px 0 10px;font-size:13px;font-weight:700;letter-spacing:0.04em;color:#0a2057;text-transform:uppercase;border-bottom:2px solid #e2e8f0;padding-bottom:6px">${t}</p>`;

  const bullet = (txt) =>
    `<li style="margin:5px 0;color:#475569;line-height:1.5">${txt}</li>`;

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#0f172a">
      <div style="background:#0a2057;padding:24px 32px;border-radius:8px 8px 0 0">
        <p style="color:#cbd5e1;font-size:12px;margin:0 0 4px;letter-spacing:0.05em;text-transform:uppercase">${displayCompany}</p>
        <h2 style="color:#ffffff;margin:0;font-size:22px;font-weight:700">Welcome to ConstructERP</h2>
      </div>

      <div style="background:#ffffff;padding:28px 32px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 8px 8px">
        <p style="margin-top:0">Dear <strong>${displayName}</strong>,</p>
        <p style="color:#475569;line-height:1.6">
          Welcome to <strong>BCIM ConstructERP</strong>! Your account has been successfully
          created and is ready to use. Your access details are below.
        </p>

        ${sectionTitle('Account Details')}
        <table style="width:100%;border-collapse:collapse;font-size:14px">
          ${row('Username', to)}
          ${row('Access Portal', `<a href="${loginUrl}" style="color:#0a2057;text-decoration:none">${loginUrl}</a>`)}
          ${row('Company', displayCompany)}
          ${row('Department', displayDept)}
          ${row('Role', displayRole)}
        </table>

        ${sectionTitle('First Login — Set Your Password')}
        <ol style="margin:0;padding-left:20px;font-size:14px;color:#475569;line-height:1.6">
          <li>Open the access portal above.</li>
          <li>Click the button below to set your password.</li>
          <li>Choose a strong password (min 8 chars with uppercase, numbers &amp; symbols).</li>
          <li>Complete your profile information.</li>
        </ol>
        <p style="text-align:center;margin:22px 0">
          <a href="${resetUrl}"
             style="display:inline-block;background:#0a2057;color:#ffffff;text-decoration:none;
                    padding:13px 36px;border-radius:6px;font-weight:700;font-size:15px">
            Set My Password
          </a>
        </p>
        <p style="font-size:12px;color:#94a3b8;text-align:center;margin:0 0 6px">
          This secure link expires in <strong>24 hours</strong>.
        </p>

        ${sectionTitle(`What You Can Access — ${displayDept}`)}
        <table style="width:100%;border-collapse:collapse;font-size:14px">
          ${c.modules.map(([m, p]) => `
            <tr>
              <td style="padding:9px 14px;border:1px solid #e2e8f0;font-weight:600;color:#0f172a">${m}</td>
              <td style="padding:9px 14px;border:1px solid #e2e8f0;color:#475569">${p}</td>
            </tr>`).join('')}
        </table>

        ${sectionTitle('Key Features You\'ll Use')}
        <ul style="margin:0;padding-left:20px;font-size:14px">
          ${c.features.map(bullet).join('')}
        </ul>

        ${sectionTitle('Your First Steps')}
        <ol style="margin:0;padding-left:20px;font-size:14px;color:#475569;line-height:1.6">
          <li>Complete your password setup.</li>
          <li>Update your profile picture and contact info.</li>
          <li>Review the dashboard tutorial (shown on first login).</li>
          <li>Read the <a href="${guideUrl}" style="color:#0a2057;text-decoration:none">user guide for your department</a>.</li>
        </ol>

        ${sectionTitle('Quick Shortcuts')}
        <p style="font-size:14px;line-height:1.9;margin:0">
          <a href="${dashboardUrl}" style="color:#0a2057;text-decoration:none">Dashboard</a> &nbsp;·&nbsp;
          <a href="${reportsUrl}" style="color:#0a2057;text-decoration:none">My Reports</a> &nbsp;·&nbsp;
          <a href="${approvalsUrl}" style="color:#0a2057;text-decoration:none">Approvals Pending</a>
        </p>

        ${sectionTitle('Security Reminders')}
        <ul style="margin:0;padding-left:20px;font-size:14px">
          ${bullet('Never share your password.')}
          ${bullet('Change your password regularly.')}
          ${bullet('Log out after each session.')}
          ${bullet('Report suspicious activity immediately.')}
        </ul>

        ${sectionTitle('System Details')}
        <table style="width:100%;border-collapse:collapse;font-size:14px">
          ${row('Browser', 'Chrome, Firefox or Safari (latest versions)')}
          ${row('Internet', 'Works best with a 5 Mbps+ connection')}
          ${row('Timezone', 'IST (Indian Standard Time)')}
        </table>

        ${sectionTitle('Getting Help')}
        <p style="font-size:14px;color:#475569;line-height:1.7;margin:0">
          <strong>Email support:</strong> <a href="mailto:support@bcim.in" style="color:#0a2057;text-decoration:none">support@bcim.in</a><br>
          <strong>Phone support:</strong> ${supportPhone} <span style="color:#94a3b8">(${supportHours})</span><br>
          <strong>In-app help:</strong> Click the <strong>?</strong> icon on any page.
        </p>

        <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0 14px">
        <p style="font-size:12px;color:#94a3b8;margin:0">— BCIM Engineering · ConstructERP</p>
      </div>
    </div>
  `;

  return sendMail({ to, subject, html, text });
};

// ─────────────────────────────────────────────────────────────────────────────
// Test helper — used by /api/mail/test endpoint
// ─────────────────────────────────────────────────────────────────────────────
const sendTestMail = async (to) => {
  const baseUrl = (
    process.env.PUBLIC_FRONTEND_URL ||
    process.env.FRONTEND_URL ||
    'http://bcim.ddns.net:3000'
  ).replace(/\/$/, '');
  return sendPasswordResetMail({
    to,
    name: 'Admin',
    resetUrl: `${baseUrl}/reset-password?token=TEST_TOKEN`,
  });
};

module.exports = { sendMail, sendPasswordResetMail, sendWelcomeLoginMail, sendTestMail, isGraphConfigured, isSmtpConfigured };
