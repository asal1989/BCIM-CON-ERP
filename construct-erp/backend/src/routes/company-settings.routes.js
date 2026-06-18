// src/routes/company-settings.routes.js — Company Profile, FY, Currency, Payment Terms, Tax Rates
const express = require('express');
const { authenticate } = require('../middleware/auth');
const { query } = require('../config/database');
const router = express.Router();

// ── Auto-migrate ─────────────────────────────────────────────────────────────
(async () => {
  try {
    await query(`ALTER TABLE companies ADD COLUMN IF NOT EXISTS settings JSONB DEFAULT '{}'::jsonb`);
    // Force-correct BCIM registered address and GSTIN on every startup
    // Targets any company row that is BCIM (by name or any known GSTIN variant)
    await query(`
      UPDATE companies SET
        address = '#11, B Wing, Divyasree Chambers, O''Shaughnessy Road',
        city    = 'Bangalore',
        state   = 'Karnataka',
        pincode = '560025',
        gstin   = '29AAHCB6485A1ZL'
      WHERE name ILIKE '%BCIM%'
         OR gstin IN ('29AAXCB2929P1Z1', '36AAHCB6485A1ZQ', '29AAHCB6485A1ZL')
         OR address ILIKE '%Jayanagar%'
         OR address ILIKE '%Shaughnessy%'
    `);
    // Remove internal email mistakenly saved on vendor records
    await query(`UPDATE vendors SET email = NULL WHERE email = 'dheenabcim@gmail.com'`);
    console.log('[CompanySettings] Schema OK');
  } catch (_) {}
})();

const DEFAULT_SETTINGS = {
  fy_start_month: 4,            // April
  currency: 'INR',
  currency_symbol: '₹',
  payment_terms_days: 30,
  tax_rates: [
    { name: 'GST 18%', rate: 18 },
    { name: 'GST 12%', rate: 12 },
    { name: 'GST 5%',  rate: 5 },
    { name: 'GST 0%',  rate: 0 },
  ],
};

// ── GET company profile + settings ────────────────────────────────────────────
router.get('/', authenticate, async (req, res) => {
  try {
    const r = await query(`SELECT * FROM companies WHERE id = $1`, [req.user.company_id]);
    if (!r.rows.length) return res.status(404).json({ error: 'Company not found' });
    const company = r.rows[0];
    res.json({ data: { ...company, settings: { ...DEFAULT_SETTINGS, ...(company.settings || {}) } } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── UPDATE company profile fields ───────────────────────────────────────────
router.put('/profile', authenticate, async (req, res) => {
  try {
    const { name, gstin, pan, cin, address, city, state, pincode, phone, email } = req.body;
    const r = await query(
      `UPDATE companies SET
         name = COALESCE($1, name), gstin = $2, pan = $3, cin = $4,
         address = $5, city = $6, state = $7, pincode = $8, phone = $9, email = $10,
         updated_at = NOW()
       WHERE id = $11 RETURNING *`,
      [name, gstin || null, pan || null, cin || null, address || null, city || null,
       state || null, pincode || null, phone || null, email || null, req.user.company_id]
    );
    res.json({ data: r.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── UPDATE settings (FY, currency, payment terms, tax rates) ─────────────────
router.put('/settings', authenticate, async (req, res) => {
  try {
    const existing = await query(`SELECT settings FROM companies WHERE id = $1`, [req.user.company_id]);
    const merged = { ...DEFAULT_SETTINGS, ...(existing.rows[0]?.settings || {}), ...req.body };
    const r = await query(
      `UPDATE companies SET settings = $1, updated_at = NOW() WHERE id = $2 RETURNING settings`,
      [JSON.stringify(merged), req.user.company_id]
    );
    res.json({ data: r.rows[0].settings });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
