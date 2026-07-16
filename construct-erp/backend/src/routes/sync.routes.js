// src/routes/sync.routes.js
// Public sync endpoint used by DQS Bill Tracker to pull shared reference data
// (vendors, projects) from ConstructERP without requiring JWT auth.
// Protected by a static API key set in .env: DQS_SYNC_KEY (legacy TQS_SYNC_KEY also accepted)

const express = require('express');
const { query } = require('../config/database');

const router = express.Router();

const DQS_SYNC_KEY = process.env.DQS_SYNC_KEY || process.env.TQS_SYNC_KEY;
if (!DQS_SYNC_KEY) {
  // Don't kill the whole server — just disable the sync endpoint and warn.
  // eslint-disable-next-line no-console
  console.warn('[sync.routes] DQS_SYNC_KEY/TQS_SYNC_KEY not set — /api/sync/* endpoints disabled.');
}

function requireSyncKey(req, res, next) {
  if (!DQS_SYNC_KEY) {
    return res.status(503).json({ ok: false, error: 'Sync endpoint disabled — DQS_SYNC_KEY not configured on server.' });
  }
  const key = req.headers['x-sync-key'];
  if (key !== DQS_SYNC_KEY) {
    return res.status(401).json({ ok: false, error: 'Invalid sync key' });
  }
  next();
}

// GET /api/sync/vendors
// Returns all active vendors for the given company_id
router.get('/vendors', requireSyncKey, async (req, res) => {
  try {
    const { company_id } = req.query;
    if (!company_id) return res.status(400).json({ ok: false, error: 'company_id required' });

    const result = await query(
      `SELECT
         id, vendor_code, name, gstin, pan, vendor_type,
         contact_person, phone, email, address, city, state
       FROM vendors
       WHERE company_id = $1 AND is_active = true
       ORDER BY name`,
      [company_id]
    );

    res.json({ ok: true, data: result.rows });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /api/sync/projects
// Returns active projects for the given company_id
router.get('/projects', requireSyncKey, async (req, res) => {
  try {
    const { company_id } = req.query;
    if (!company_id) return res.status(400).json({ ok: false, error: 'company_id required' });

    const result = await query(
      `SELECT id, project_code, project_name, location, status, start_date, end_date
       FROM projects
       WHERE company_id = $1 AND status != 'cancelled'
       ORDER BY project_name`,
      [company_id]
    );

    res.json({ ok: true, data: result.rows });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /api/sync/vendor
// DQS pushes a new vendor created in its UI to ConstructERP
router.post('/vendor', requireSyncKey, async (req, res) => {
  try {
    const { company_id, name, gstin, pan, vendor_type, contact_person, phone, email, address, city, state } = req.body;
    if (!company_id || !name) return res.status(400).json({ ok: false, error: 'company_id and name required' });

    // Upsert by GSTIN or name
    const existing = await query(
      `SELECT id FROM vendors WHERE company_id=$1 AND (gstin=$2 OR name=$3) LIMIT 1`,
      [company_id, gstin || '', name]
    );

    if (existing.rows[0]) {
      return res.json({ ok: true, action: 'exists', id: existing.rows[0].id });
    }

    const code = `VEN-DQS-${Date.now().toString().slice(-6)}`;
    const result = await query(
      `INSERT INTO vendors (company_id, vendor_code, name, gstin, pan, vendor_type, contact_person, phone, email, address, city, state)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
      [company_id, code, name, gstin || '', pan || '', vendor_type || 'material', contact_person || '', phone || '', email || '', address || '', city || '', state || '']
    );

    res.status(201).json({ ok: true, action: 'created', id: result.rows[0].id });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
