// api-keys.routes.js — manage read-only API keys for external integrations
const express = require('express');
const router  = express.Router();
const crypto  = require('crypto');
const { query } = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');

const ADMIN_ROLES = ['super_admin', 'admin'];

;(async () => {
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS api_keys (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id  UUID NOT NULL,
        name        VARCHAR(100) NOT NULL,
        key_prefix  VARCHAR(16) NOT NULL,
        key_hash    TEXT NOT NULL UNIQUE,
        scopes      TEXT[] DEFAULT '{careers:read}',
        created_by  UUID REFERENCES users(id),
        created_at  TIMESTAMPTZ DEFAULT NOW(),
        last_used_at TIMESTAMPTZ,
        revoked_at  TIMESTAMPTZ
      )
    `);
  } catch (e) {
    console.error('[API-Keys] Table init:', e.message);
  }
})();

// Generate a new API key — raw key returned ONCE, never stored
router.post('/', authenticate, authorize(...ADMIN_ROLES), async (req, res) => {
  try {
    const { name, scopes = ['careers:read'] } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'Key name is required' });

    const raw    = 'ck_' + crypto.randomBytes(32).toString('base64url');
    const prefix = raw.slice(0, 14) + '…';
    const hash   = crypto.createHash('sha256').update(raw).digest('hex');

    const { rows } = await query(
      `INSERT INTO api_keys (company_id, name, key_prefix, key_hash, scopes, created_by)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, name, key_prefix, scopes, created_at`,
      [req.user.company_id, name.trim(), prefix, hash, scopes, req.user.id]
    );

    res.status(201).json({ data: { ...rows[0], raw_key: raw } });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// List keys — never exposes the actual key value
router.get('/', authenticate, authorize(...ADMIN_ROLES), async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT id, name, key_prefix, scopes, created_at, last_used_at, revoked_at
       FROM api_keys WHERE company_id=$1 ORDER BY created_at DESC`,
      [req.user.company_id]
    );
    res.json({ data: rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Revoke a key
router.delete('/:id', authenticate, authorize(...ADMIN_ROLES), async (req, res) => {
  try {
    const { rowCount } = await query(
      `UPDATE api_keys SET revoked_at=NOW()
       WHERE id=$1 AND company_id=$2 AND revoked_at IS NULL`,
      [req.params.id, req.user.company_id]
    );
    if (!rowCount) return res.status(404).json({ error: 'Key not found or already revoked' });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
