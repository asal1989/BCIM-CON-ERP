// src/routes/bank-accounts.routes.js
const express = require('express');
const { authenticate } = require('../middleware/auth');
const { query } = require('../config/database');
const router = express.Router();

// ── Auto-migrate ─────────────────────────────────────────────────────────────
(async () => {
  const safe = async (sql) => {
    try { await query(sql); } catch (_) {}
  };

  await safe(`
    CREATE TABLE IF NOT EXISTS bank_accounts (
      id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
      company_id      UUID NOT NULL,
      account_name    TEXT NOT NULL,
      bank_name       TEXT NOT NULL,
      account_number  TEXT,
      ifsc_code       TEXT,
      branch          TEXT,
      account_type    TEXT DEFAULT 'current', -- current | savings | cc | od
      opening_balance NUMERIC(16,2) DEFAULT 0,
      is_active       BOOLEAN DEFAULT true,
      created_at      TIMESTAMPTZ DEFAULT NOW(),
      updated_at      TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await safe(`CREATE INDEX IF NOT EXISTS idx_bank_accounts_company ON bank_accounts(company_id)`);

  console.log('[BankAccounts] Schema OK');
})();

// ── LIST ─────────────────────────────────────────────────────────────────────
router.get('/', authenticate, async (req, res) => {
  try {
    const rows = await query(
      `SELECT * FROM bank_accounts WHERE company_id = $1 AND is_active = true ORDER BY created_at ASC`,
      [req.user.company_id]
    );
    res.json({ data: rows.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── CREATE ───────────────────────────────────────────────────────────────────
router.post('/', authenticate, async (req, res) => {
  try {
    const { account_name, bank_name, account_number, ifsc_code, branch, account_type, opening_balance } = req.body;
    if (!account_name || !bank_name) return res.status(400).json({ error: 'account_name and bank_name are required' });

    const result = await query(
      `INSERT INTO bank_accounts (company_id, account_name, bank_name, account_number, ifsc_code, branch, account_type, opening_balance)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [req.user.company_id, account_name, bank_name, account_number || null, ifsc_code || null, branch || null, account_type || 'current', parseFloat(opening_balance) || 0]
    );
    res.status(201).json({ data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── UPDATE ───────────────────────────────────────────────────────────────────
router.put('/:id', authenticate, async (req, res) => {
  try {
    const { account_name, bank_name, account_number, ifsc_code, branch, account_type, opening_balance, is_active } = req.body;
    const result = await query(
      `UPDATE bank_accounts SET
        account_name = COALESCE($1, account_name), bank_name = COALESCE($2, bank_name),
        account_number = COALESCE($3, account_number), ifsc_code = COALESCE($4, ifsc_code),
        branch = COALESCE($5, branch), account_type = COALESCE($6, account_type),
        opening_balance = COALESCE($7, opening_balance), is_active = COALESCE($8, is_active),
        updated_at = NOW()
       WHERE id = $9 AND company_id = $10 RETURNING *`,
      [account_name, bank_name, account_number, ifsc_code, branch, account_type, opening_balance != null ? parseFloat(opening_balance) : null, is_active, req.params.id, req.user.company_id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Bank account not found' });
    res.json({ data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE (soft) ────────────────────────────────────────────────────────────
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const result = await query(
      `UPDATE bank_accounts SET is_active = false, updated_at = NOW() WHERE id = $1 AND company_id = $2`,
      [req.params.id, req.user.company_id]
    );
    if (!result.rowCount) return res.status(404).json({ error: 'Bank account not found' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
