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

const sendViaGraph = async ({ to, cc, subject, html, text }) => {
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

const sendMail = async ({ to, cc, subject, html, text }) => {
  let recipients = filterAlertRecipients({ recipients: normalizeRecipients(to), subject });
  let ccRecipients = filterAlertRecipients({ recipients: normalizeRecipients(cc), subject });
  recipients = recipients.filter(email => !isBlockedEmail(email));
  ccRecipients = ccRecipients.filter(email => !isBlockedEmail(email));
  if (!recipients.length) return { sent: false, reason: 'No recipients' };

  const results = [];
  for (const recipient of recipients) {
    if (isGraphConfigured()) {
      try {
        await sendViaGraph({ to: recipient, cc: ccRecipients, subject, html, text });
        results.push({ to: recipient, sent: true, provider: 'graph' });
        continue;
      } catch (err) {
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
        });
        results.push({ to: recipient, sent: true, provider: 'smtp' });
        continue;
      } catch (err) {
        console.error('[mail] SMTP failed:', err.message);
        results.push({ to: recipient, sent: false, reason: `SMTP error: ${err.message}` });
        continue;
      }
    }

    console.warn(`[mail] No provider configured. Email not sent to ${recipient}: ${subject}`);
    results.push({ to: recipient, sent: false, reason: 'No mail provider configured (Graph or SMTP)' });
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

const sendWelcomeLoginMail = async ({ to, name, role, loginUrl, resetUrl }) => {
  const displayName = name || 'User';
  const displayRole = role || '';

  const subject = 'BCIM ERP Login Access Details';

  const text = [
    `Dear ${displayName},`,
    '',
    'Your BCIM ConstructERP login access details are provided below.',
    'Please use the password reset link to set or reset your password before logging in.',
    '',
    `Login Page : ${loginUrl}`,
    `Username   : ${to}`,
    `Role       : ${displayRole}`,
    '',
    `Set / Reset Password: ${resetUrl}`,
    '',
    '— BCIM Engineering',
  ].join('\n');

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#0f172a">
      <div style="background:#0a2057;padding:24px 32px;border-radius:8px 8px 0 0">
        <p style="color:#cbd5e1;font-size:12px;margin:0 0 4px;letter-spacing:0.05em;text-transform:uppercase">BCIM ENGINEERING PRIVATE LIMITED</p>
        <h2 style="color:#ffffff;margin:0;font-size:22px;font-weight:700">ConstructERP Login Access</h2>
      </div>
      <div style="background:#ffffff;padding:28px 32px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 8px 8px">
        <p style="margin-top:0">Dear <strong>${displayName}</strong>,</p>
        <p style="color:#475569;line-height:1.6">
          Your BCIM ConstructERP login access details are provided below.
          Please use the password reset link to set or reset your password before logging in.
        </p>
        <table style="width:100%;border-collapse:collapse;margin:20px 0;font-size:14px">
          <tr>
            <td style="padding:11px 14px;border:1px solid #e2e8f0;background:#f8fafc;width:34%;font-weight:600;color:#0f172a">Login Page</td>
            <td style="padding:11px 14px;border:1px solid #e2e8f0"><a href="${loginUrl}" style="color:#0a2057;text-decoration:none">${loginUrl}</a></td>
          </tr>
          <tr>
            <td style="padding:11px 14px;border:1px solid #e2e8f0;background:#f8fafc;font-weight:600;color:#0f172a">Username</td>
            <td style="padding:11px 14px;border:1px solid #e2e8f0">${to}</td>
          </tr>
          <tr>
            <td style="padding:11px 14px;border:1px solid #e2e8f0;background:#f8fafc;font-weight:600;color:#0f172a">Role</td>
            <td style="padding:11px 14px;border:1px solid #e2e8f0">${displayRole}</td>
          </tr>
        </table>
        <p style="text-align:center;margin:28px 0">
          <a href="${resetUrl}"
             style="display:inline-block;background:#0a2057;color:#ffffff;text-decoration:none;
                    padding:13px 36px;border-radius:6px;font-weight:700;font-size:15px">
            Set / Reset Password
          </a>
        </p>
        <hr style="border:none;border-top:1px solid #e2e8f0;margin:20px 0">
        <p style="font-size:12px;color:#94a3b8;margin-bottom:0;text-align:center">
          The password reset link expires in <strong>24 hours</strong>.
        </p>
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
