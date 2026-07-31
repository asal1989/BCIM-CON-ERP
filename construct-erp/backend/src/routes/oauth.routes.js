// oauth.routes.js — the ERP as a minimal OpenID Connect provider, so external
// tools (currently: Mattermost) can offer "Log in with BCIM ERP" instead of a
// separate password. Deliberately single-client: no client-management UI,
// just one relying party configured via env vars. Add more clients later by
// widening OAUTH_CLIENTS into a small table if a second integration ever
// needs one — not worth the complexity for one.
//
// Endpoints:
//   POST /api/v1/oauth/exchange   — called by the frontend's /oauth/authorize
//                                    bridge page (already holds a normal ERP
//                                    JWT) to mint a one-time code and hand
//                                    back the redirect URL to send the
//                                    browser to.
//   POST /api/v1/oauth/token      — server-to-server, called by the relying
//                                    party (Mattermost) to exchange the code.
//   GET  /api/v1/oauth/userinfo   — server-to-server, standard OIDC userinfo.
const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { authenticate } = require('../middleware/auth');
const { query } = require('../config/database');
const { runSchemaInit } = require('../utils/schemaInit');

runSchemaInit('oauth_codes', async () => {
  await query(`
    CREATE TABLE IF NOT EXISTS oauth_codes (
      code          TEXT PRIMARY KEY,
      user_id       UUID NOT NULL REFERENCES users(id),
      client_id     TEXT NOT NULL,
      redirect_uri  TEXT NOT NULL,
      scope         TEXT,
      nonce         TEXT,
      expires_at    TIMESTAMPTZ NOT NULL,
      used          BOOLEAN DEFAULT FALSE,
      created_at    TIMESTAMPTZ DEFAULT NOW()
    )
  `);
});

runSchemaInit('oauth_access_tokens', async () => {
  await query(`
    CREATE TABLE IF NOT EXISTS oauth_access_tokens (
      token         TEXT PRIMARY KEY,
      user_id       UUID NOT NULL REFERENCES users(id),
      client_id     TEXT NOT NULL,
      expires_at    TIMESTAMPTZ NOT NULL,
      created_at    TIMESTAMPTZ DEFAULT NOW()
    )
  `);
});

// Single relying party, configured entirely via env vars — no DB row, no
// admin UI. MATTERMOST_OAUTH_REDIRECT_URIS is comma-separated to allow both
// the /login/openid/complete and /signup/openid/complete callbacks Mattermost
// uses depending on whether the account already exists.
function getClient(clientId) {
  const id = process.env.MATTERMOST_OAUTH_CLIENT_ID;
  const secret = process.env.MATTERMOST_OAUTH_CLIENT_SECRET;
  const redirectUris = (process.env.MATTERMOST_OAUTH_REDIRECT_URIS || '')
    .split(',').map(s => s.trim()).filter(Boolean);
  if (!id || !secret || !redirectUris.length) return null;
  if (clientId && clientId !== id) return null;
  return { id, secret, redirectUris };
}

router.post('/exchange', authenticate, async (req, res) => {
  try {
    const { client_id, redirect_uri, state, scope, nonce, response_type } = req.body;
    if (response_type && response_type !== 'code') {
      return res.status(400).json({ error: 'unsupported_response_type' });
    }
    const client = getClient(client_id);
    if (!client) return res.status(400).json({ error: 'invalid_client' });
    if (!client.redirectUris.includes(redirect_uri)) {
      return res.status(400).json({ error: 'invalid_redirect_uri' });
    }

    const code = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 1000); // single-use, 60s window
    await query(
      `INSERT INTO oauth_codes (code, user_id, client_id, redirect_uri, scope, nonce, expires_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [code, req.user.id, client_id, redirect_uri, scope || 'openid', nonce || null, expiresAt]
    );

    const url = new URL(redirect_uri);
    url.searchParams.set('code', code);
    if (state) url.searchParams.set('state', state);
    res.json({ redirect: url.toString() });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/token', async (req, res) => {
  try {
    let { grant_type, code, redirect_uri, client_id, client_secret } = req.body;

    // Mattermost (like most OIDC clients) sends client credentials via HTTP
    // Basic auth rather than the request body — support both.
    const authHeader = req.headers.authorization;
    if ((!client_id || !client_secret) && authHeader?.startsWith('Basic ')) {
      const decoded = Buffer.from(authHeader.slice(6), 'base64').toString('utf8');
      const idx = decoded.indexOf(':');
      client_id = decoded.slice(0, idx);
      client_secret = decoded.slice(idx + 1);
    }

    if (grant_type !== 'authorization_code') {
      return res.status(400).json({ error: 'unsupported_grant_type' });
    }
    const client = getClient(client_id);
    if (!client || client.secret !== client_secret) {
      return res.status(401).json({ error: 'invalid_client' });
    }

    const codeRes = await query(`SELECT * FROM oauth_codes WHERE code=$1`, [code]);
    const row = codeRes.rows[0];
    const valid = row && !row.used && row.client_id === client_id
      && row.redirect_uri === redirect_uri && new Date(row.expires_at) > new Date();
    if (!valid) return res.status(400).json({ error: 'invalid_grant' });

    // Mark used immediately — codes are single-use regardless of outcome below.
    await query(`UPDATE oauth_codes SET used=TRUE WHERE code=$1`, [code]);

    const userRes = await query(`SELECT id, name, email, employee_code FROM users WHERE id=$1`, [row.user_id]);
    const u = userRes.rows[0];
    if (!u) return res.status(400).json({ error: 'invalid_grant' });

    const accessToken = crypto.randomBytes(32).toString('hex');
    const tokenExpiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 min — userinfo is called immediately after
    await query(
      `INSERT INTO oauth_access_tokens (token, user_id, client_id, expires_at) VALUES ($1,$2,$3,$4)`,
      [accessToken, u.id, client_id, tokenExpiresAt]
    );

    const nowSec = Math.floor(Date.now() / 1000);
    const idToken = jwt.sign({
      iss: process.env.OAUTH_ISSUER || 'https://erp.bcim.in',
      sub: u.id,
      aud: client_id,
      exp: nowSec + 600,
      iat: nowSec,
      email: u.email,
      email_verified: true,
      name: u.name,
      preferred_username: u.employee_code || u.email,
      ...(row.nonce ? { nonce: row.nonce } : {}),
    }, process.env.JWT_SECRET, { algorithm: 'HS256' });

    res.json({
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: 600,
      id_token: idToken,
      scope: row.scope || 'openid',
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/userinfo', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) return res.status(401).json({ error: 'invalid_token' });
    const token = authHeader.slice(7);

    const tRes = await query(`SELECT * FROM oauth_access_tokens WHERE token=$1`, [token]);
    const row = tRes.rows[0];
    if (!row || new Date(row.expires_at) < new Date()) return res.status(401).json({ error: 'invalid_token' });

    const userRes = await query(`SELECT id, name, email, employee_code FROM users WHERE id=$1`, [row.user_id]);
    const u = userRes.rows[0];
    if (!u) return res.status(401).json({ error: 'invalid_token' });

    res.json({
      sub: u.id,
      email: u.email,
      email_verified: true,
      name: u.name,
      preferred_username: u.employee_code || u.email,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
