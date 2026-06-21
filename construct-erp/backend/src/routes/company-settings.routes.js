// src/routes/company-settings.routes.js — Company Profile, FY, Currency, Payment Terms, Tax Rates
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { authenticate } = require('../middleware/auth');
const { query } = require('../config/database');
const { logAudit } = require('../utils/auditLog');
const router = express.Router();

// ── Auto-migrate ─────────────────────────────────────────────────────────────
(async () => {
  try {
    await query(`ALTER TABLE companies ADD COLUMN IF NOT EXISTS settings JSONB DEFAULT '{}'::jsonb`);
    console.log('[CompanySettings] Schema OK');
  } catch (_) {}
})();

// ── Logo upload ──────────────────────────────────────────────────────────────
const uploadDir = path.join(__dirname, '../../uploads/company');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => cb(null, `${req.user.company_id}-${Date.now()}${path.extname(file.originalname)}`),
});
const upload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!/^image\/(png|jpe?g|svg\+xml|webp)$/.test(file.mimetype)) return cb(new Error('Logo must be an image (PNG, JPG, SVG or WebP)'));
    cb(null, true);
  },
});

router.post('/logo', authenticate, upload.single('logo'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const logoUrl = `/uploads/company/${req.file.filename}`;
    const r = await query(
      `UPDATE companies SET logo_url = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
      [logoUrl, req.user.company_id]
    );
    await logAudit(req, { action: 'update', tableName: 'companies', recordId: req.user.company_id, newValues: { logo_url: logoUrl } });
    res.json({ data: r.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

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
    const before = await query(
      `SELECT name, gstin, pan, cin, address, city, state, pincode, phone, email FROM companies WHERE id = $1`,
      [req.user.company_id]
    );
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
    await logAudit(req, {
      action: 'update', tableName: 'companies', recordId: req.user.company_id,
      oldValues: before.rows[0],
      newValues: { name, gstin, pan, cin, address, city, state, pincode, phone, email },
    });
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
