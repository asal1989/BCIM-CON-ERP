// src/controllers/auth.controller.js
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const { query, withTransaction } = require('../config/database');
const { sendPasswordResetMail } = require('../services/mail.service');
const { canonicalizeRole } = require('../middleware/auth');

// Generate tokens
const generateTokens = (user) => {
  const payload = { id: user.id, role: user.role, company_id: user.company_id };
  const accessToken = jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '8h'
  });
  const refreshToken = jwt.sign({ id: user.id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d'
  });
  return { accessToken, refreshToken };
};

let passwordResetSchemaReady = false;
const ensurePasswordResetSchema = async () => {
  if (passwordResetSchemaReady) return;
  await query(`
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id UUID REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TIMESTAMPTZ NOT NULL,
      used_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user ON password_reset_tokens(user_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_expires ON password_reset_tokens(expires_at)`);
  passwordResetSchemaReady = true;
};

const hashResetToken    = (token) => crypto.createHash('sha256').update(token).digest('hex');
const hashRefreshToken  = (token) => crypto.createHash('sha256').update(token).digest('hex');

const getResetBaseUrl = () => (
  process.env.PUBLIC_FRONTEND_URL ||
  process.env.FRONTEND_URL ||
  'http://bcim.ddns.net:3000'
).replace(/\/$/, '');

// POST /api/v1/auth/register
const register = async (req, res) => {
  try {
    const {
      company_name, company_gstin, company_pan,
      name, phone, password, role = 'admin'
    } = req.body;
    const email = (req.body.email || '').trim().toLowerCase();

    // Check email exists
    const existing = await query('SELECT id FROM users WHERE LOWER(email) = $1', [email]);
    if (existing.rows[0]) {
      return res.status(409).json({ error: 'Email already registered.' });
    }

    const result = await withTransaction(async (client) => {
      // Create company
      const companyRes = await client.query(
        `INSERT INTO companies (name, gstin, pan) VALUES ($1, $2, $3) RETURNING id`,
        [company_name, company_gstin, company_pan]
      );
      const companyId = companyRes.rows[0].id;

      // Hash password
      const passwordHash = await bcrypt.hash(password, 10);
      const empCode = `EMP-${Date.now().toString().slice(-6)}`;

      // Create user
      const userRes = await client.query(
        `INSERT INTO users (company_id, employee_code, name, email, phone, password_hash, role)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, name, email, role, company_id`,
        [companyId, empCode, name, email, phone, passwordHash, role]
      );
      return userRes.rows[0];
    });

    const tokens = generateTokens(result);

    res.status(201).json({
      message: 'Registration successful',
      user: { id: result.id, name: result.name, email: result.email, role: result.role },
      ...tokens
    });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: err.message });
  }
};

// POST /api/v1/auth/login
const login = async (req, res) => {
  try {
    const { email, password } = req.body;
const normalizedEmail = (email || '').trim().toLowerCase();

    const result = await query(
      `SELECT u.id, u.name, u.email, u.role, u.designation, u.signature_url, u.password_hash, u.is_active,
              u.company_id, u.last_login, u.accessible_modules, u.accessible_menus,
              COALESCE((
                SELECT ARRAY_AGG(pm.project_id::text ORDER BY p.name)
                FROM project_members pm
                JOIN projects p ON p.id = pm.project_id
                WHERE pm.user_id = u.id AND p.company_id = u.company_id
              ), ARRAY[]::text[]) AS project_ids,
              c.name as company_name, c.gstin as company_gstin
       FROM users u JOIN companies c ON u.company_id = c.id
       WHERE LOWER(u.email) = $1`,
      [normalizedEmail]
    );

    const user = result.rows[0];
    if (!user) return res.status(401).json({ error: 'Invalid email or password.' });
    if (!user.is_active) return res.status(401).json({ error: 'Account deactivated.' });
    user.role = canonicalizeRole(user.role);

    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) return res.status(401).json({ error: 'Invalid email or password.' });

    // Update last login
    await query('UPDATE users SET last_login = NOW() WHERE id = $1', [user.id]);

    // Save hashed refresh token
    const tokens = generateTokens(user);
    await query(
      `INSERT INTO refresh_tokens (user_id, token, expires_at, login_at)
       VALUES ($1, $2, NOW() + INTERVAL '7 days', NOW())`,
      [user.id, hashRefreshToken(tokens.refreshToken)]
    );

    res.json({
      message: 'Login successful',
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        designation: user.designation,
        signature_url: user.signature_url,
        company_id: user.company_id,
        company_name: user.company_name,
        company_gstin: user.company_gstin,
        accessible_modules: user.accessible_modules,
        accessible_menus:   user.accessible_menus || null,
        project_ids: user.project_ids || [],
        // Server-derived privilege flags — never hardcoded in the frontend bundle
        can_access_executive_dashboard: req.user?.can_access_executive_dashboard,
        can_access_budget_breakdown:    req.user?.can_access_budget_breakdown,
      },
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken
    });
  } catch (err) {
    console.error('[LOGIN ERROR]', err.message, err.stack);
    res.status(500).json({ error: err.message });
  }
};

// POST /api/v1/auth/refresh
const refreshToken = async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) return res.status(401).json({ error: 'Refresh token required.' });

    const tokenHash = hashRefreshToken(refreshToken);
    const stored = await query(
      'SELECT * FROM refresh_tokens WHERE token = $1 AND expires_at > NOW()',
      [tokenHash]
    );
    if (!stored.rows[0]) {
      return res.status(401).json({ error: 'Session expired. Please log in again.', code: 'SESSION_EXPIRED' });
    }

    // No absolute session cutoff — a session lasts as long as the refresh
    // token row stays valid (expires_at, below), refreshed indefinitely on
    // activity. Previously this hard-capped every session at 8 hours
    // regardless of activity, which is the "session expired" users kept hitting.

    const decoded = jwt.verify(refreshToken, process.env.JWT_SECRET);
    const user = await query('SELECT * FROM users WHERE id = $1', [decoded.id]);
    user.rows[0].role = canonicalizeRole(user.rows[0].role);
    const tokens = generateTokens(user.rows[0]);

    // Rotate — keep the row's own expires_at window (7 days), same as login.
    await query('DELETE FROM refresh_tokens WHERE token = $1', [tokenHash]);
    await query(
      `INSERT INTO refresh_tokens (user_id, token, expires_at, login_at)
       VALUES ($1, $2, NOW() + INTERVAL '7 days', $3)`,
      [user.rows[0].id, hashRefreshToken(tokens.refreshToken), stored.rows[0].login_at]
    );

    res.json(tokens);
  } catch (err) {
    res.status(401).json({ error: 'Invalid refresh token.' });
  }
};

// POST /api/v1/auth/logout
const logout = async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (refreshToken) {
      await query('DELETE FROM refresh_tokens WHERE token = $1', [hashRefreshToken(refreshToken)]);
    }
    res.json({ message: 'Logged out successfully.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// GET /api/v1/auth/me
const getMe = async (req, res) => {
  try {
    const result = await query(
      `SELECT u.id, u.name, u.email, u.role, u.designation, u.phone,
              u.signature_url, u.accessible_modules, u.accessible_menus,
              COALESCE((
                SELECT ARRAY_AGG(pm.project_id::text ORDER BY p.name)
                FROM project_members pm
                JOIN projects p ON p.id = pm.project_id
                WHERE pm.user_id = u.id AND p.company_id = u.company_id
              ), ARRAY[]::text[]) AS project_ids,
              u.employee_code, u.last_login, u.created_at,
              c.name as company_name, c.gstin as company_gstin
       FROM users u JOIN companies c ON u.company_id = c.id
       WHERE u.id = $1`,
      [req.user.id]
    );
    // Attach server-derived privilege flags (computed in auth middleware)
    res.json({
      ...result.rows[0],
      can_access_executive_dashboard: req.user.can_access_executive_dashboard,
      can_access_budget_breakdown:    req.user.can_access_budget_breakdown,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// POST /api/v1/auth/change-password
const changePassword = async (req, res) => {
  try {
    const { current_password, new_password } = req.body;
    const user = await query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);

    const valid = await bcrypt.compare(current_password, user.rows[0].password_hash);
    if (!valid) return res.status(400).json({ error: 'Current password incorrect.' });

    const newHash = await bcrypt.hash(new_password, 10);
    await query('UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2',
      [newHash, req.user.id]);

    // Invalidate all refresh tokens
    await query('DELETE FROM refresh_tokens WHERE user_id = $1', [req.user.id]);

    res.json({ message: 'Password changed successfully. Please login again.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// POST /api/v1/auth/forgot-password
const forgotPassword = async (req, res) => {
  try {
    await ensurePasswordResetSchema();
    const email = String(req.body.email || '').trim().toLowerCase();
    if (!email) return res.status(400).json({ error: 'Email is required.' });

    const userRes = await query(
      `SELECT id, name, email, is_active FROM users WHERE LOWER(email) = $1 LIMIT 1`,
      [email]
    );

    // Do not reveal whether the email exists.
    const generic = { message: 'If this email exists, a reset link has been sent.' };
    const user = userRes.rows[0];
    if (!user || !user.is_active) return res.json(generic);

    await query(
      `UPDATE password_reset_tokens SET used_at = NOW() WHERE user_id = $1 AND used_at IS NULL`,
      [user.id]
    );

    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = hashResetToken(token);
    await query(
      `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
       VALUES ($1, $2, NOW() + INTERVAL '30 minutes')`,
      [user.id, tokenHash]
    );

    const resetUrl = `${getResetBaseUrl()}/reset-password?token=${token}`;
    const mailResult = await sendPasswordResetMail({ to: user.email, name: user.name, resetUrl });

    res.json({
      ...generic,
      ...(mailResult.sent ? {} : { mail_status: mailResult.reason }),
      ...(process.env.NODE_ENV === 'production' ? {} : { reset_link: resetUrl }),
    });
  } catch (err) {
    console.error('Forgot password error:', err);
    res.status(500).json({ error: err.message });
  }
};

// POST /api/v1/auth/reset-password
const resetPassword = async (req, res) => {
  try {
    await ensurePasswordResetSchema();
    const { token, new_password } = req.body;
    if (!token) return res.status(400).json({ error: 'Reset token is required.' });
    if (!new_password || new_password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters.' });
    }

    const tokenHash = hashResetToken(token);
    const tokenRes = await query(
      `SELECT prt.id, prt.user_id, u.is_active
       FROM password_reset_tokens prt
       JOIN users u ON u.id = prt.user_id
       WHERE prt.token_hash = $1
         AND prt.used_at IS NULL
         AND prt.expires_at > NOW()
       LIMIT 1`,
      [tokenHash]
    );

    const reset = tokenRes.rows[0];
    if (!reset || !reset.is_active) {
      return res.status(400).json({ error: 'Reset link is invalid or expired.' });
    }

    const passwordHash = await bcrypt.hash(new_password, 10);
    await withTransaction(async (client) => {
      await client.query('UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2', [passwordHash, reset.user_id]);
      await client.query('UPDATE password_reset_tokens SET used_at = NOW() WHERE id = $1', [reset.id]);
      await client.query('DELETE FROM refresh_tokens WHERE user_id = $1', [reset.user_id]);
    });

    res.json({ message: 'Password reset successfully. Please login with your new password.' });
  } catch (err) {
    console.error('Reset password error:', err);
    res.status(500).json({ error: err.message });
  }
};

// PUT /api/v1/auth/profile
const updateProfile = async (req, res) => {
  try {
    const { full_name, name, email, phone, mobile, designation, department, signature_url } = req.body;
    const resolvedName  = full_name || name;
    const resolvedPhone = phone || mobile;

    await query(
      `UPDATE users
       SET name        = COALESCE($1, name),
           email       = COALESCE($2, email),
           phone       = COALESCE($3, phone),
           designation = COALESCE($4, designation),
           department  = COALESCE($5, department),
           signature_url = COALESCE($6, signature_url),
           updated_at  = NOW()
       WHERE id = $7`,
      [resolvedName, email, resolvedPhone, designation, department, signature_url, req.user.id]
    );

    const result = await query(
      `SELECT u.id, u.name, u.email, u.role, u.designation, u.department, u.phone,
              u.signature_url, u.accessible_modules,
              COALESCE((
                SELECT ARRAY_AGG(pm.project_id::text ORDER BY p.name)
                FROM project_members pm
                JOIN projects p ON p.id = pm.project_id
                WHERE pm.user_id = u.id AND p.company_id = u.company_id
              ), ARRAY[]::text[]) AS project_ids,
              u.employee_code, u.last_login, u.created_at,
              c.name as company_name, c.gstin as company_gstin
       FROM users u JOIN companies c ON u.company_id = c.id
       WHERE u.id = $1`,
      [req.user.id]
    );

    res.json({ message: 'Profile updated successfully', user: result.rows[0] });
  } catch (err) {
    console.error('Update profile error:', err);
    res.status(500).json({ error: err.message });
  }
};

// PUT /api/v1/auth/company
const updateCompany = async (req, res) => {
  try {
    const {
      company_name, company_gstin, company_pan, company_cin,
      company_state, company_address, company_email, company_phone,
      // also accept without prefix
      name, gstin, pan, cin, state, address, email, phone
    } = req.body;

    await query(
      `UPDATE companies
       SET name       = COALESCE($1, name),
           gstin      = COALESCE($2, gstin),
           pan        = COALESCE($3, pan),
           cin        = COALESCE($4, cin),
           state      = COALESCE($5, state),
           address    = COALESCE($6, address),
           email      = COALESCE($7, email),
           phone      = COALESCE($8, phone),
           updated_at = NOW()
       WHERE id = $9`,
      [
        company_name    || name,
        company_gstin   || gstin,
        company_pan     || pan,
        company_cin     || cin,
        company_state   || state,
        company_address || address,
        company_email   || email,
        company_phone   || phone,
        req.user.company_id,
      ]
    );

    res.json({ message: 'Company details updated successfully' });
  } catch (err) {
    console.error('Update company error:', err);
    res.status(500).json({ error: err.message });
  }
};

// GET /api/v1/auth/profile  (alias for /me with more fields)
const getProfile = async (req, res) => {
  try {
    const result = await query(
      `SELECT u.id, u.name, u.email, u.role, u.designation, u.department, u.phone,
              u.signature_url, u.accessible_modules,
              COALESCE((
                SELECT ARRAY_AGG(pm.project_id::text ORDER BY p.name)
                FROM project_members pm
                JOIN projects p ON p.id = pm.project_id
                WHERE pm.user_id = u.id AND p.company_id = u.company_id
              ), ARRAY[]::text[]) AS project_ids,
              u.employee_code, u.last_login, u.created_at,
              c.id as company_id, c.name as company_name, c.gstin as company_gstin,
              c.pan as company_pan, c.cin as company_cin, c.state as company_state,
              c.address as company_address, c.email as company_email, c.phone as company_phone
       FROM users u JOIN companies c ON u.company_id = c.id
       WHERE u.id = $1`,
      [req.user.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Exported helper — creates a 24-hour password reset token for any user ID.
// Used by users.routes.js to send welcome emails when new accounts are created.
const createPasswordResetToken = async (userId) => {
  await ensurePasswordResetSchema();
  await query(
    `UPDATE password_reset_tokens SET used_at = NOW() WHERE user_id = $1 AND used_at IS NULL`,
    [userId]
  );
  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashResetToken(token);
  await query(
    `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
     VALUES ($1, $2, NOW() + INTERVAL '24 hours')`,
    [userId, tokenHash]
  );
  return token;
};

module.exports = { register, login, refreshToken, logout, getMe, getProfile, updateProfile, updateCompany, changePassword, forgotPassword, resetPassword, createPasswordResetToken, getResetBaseUrl };
