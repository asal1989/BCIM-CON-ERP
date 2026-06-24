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

module.exports = router;
