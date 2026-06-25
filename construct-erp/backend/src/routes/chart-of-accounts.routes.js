// src/routes/chart-of-accounts.routes.js
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
    CREATE TABLE IF NOT EXISTS chart_of_accounts (
      id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
      company_id      UUID NOT NULL,
      code            TEXT NOT NULL,
      name            TEXT NOT NULL,
      account_type    TEXT NOT NULL, -- asset | liability | equity | income | expense
      sub_type        TEXT,
      opening_balance NUMERIC(16,2) DEFAULT 0,
      is_active       BOOLEAN DEFAULT true,
      created_at      TIMESTAMPTZ DEFAULT NOW(),
      updated_at      TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (company_id, code)
    )
  `);

  await safe(`CREATE INDEX IF NOT EXISTS idx_coa_company ON chart_of_accounts(company_id)`);
  await safe(`CREATE INDEX IF NOT EXISTS idx_coa_type    ON chart_of_accounts(account_type)`);

  // Backfill any STANDARD_COA codes missing for companies that already had a COA
  // seeded before those codes existed (e.g. the new 60xx expense split codes).
  try {
    for (const acc of STANDARD_COA) {
      await query(
        `INSERT INTO chart_of_accounts (company_id, code, name, account_type, sub_type)
         SELECT c.id, $1, $2, $3, $4 FROM companies c
         WHERE EXISTS (SELECT 1 FROM chart_of_accounts WHERE company_id = c.id)
         ON CONFLICT (company_id, code) DO NOTHING`,
        [acc.code, acc.name, acc.account_type, acc.sub_type]
      );
    }
  } catch (_) {}

  console.log('[ChartOfAccounts] Schema OK');
})();

// Standard ~20-account starter COA
const STANDARD_COA = [
  { code: '1000', name: 'Cash in Hand',            account_type: 'asset',     sub_type: 'Current Asset' },
  { code: '1010', name: 'Bank Accounts',           account_type: 'asset',     sub_type: 'Current Asset' },
  { code: '1100', name: 'Accounts Receivable',     account_type: 'asset',     sub_type: 'Current Asset' },
  { code: '1150', name: 'Advance to Vendors/Subcontractors', account_type: 'asset', sub_type: 'Current Asset' },
  { code: '1200', name: 'Inventory / Stores',      account_type: 'asset',     sub_type: 'Current Asset' },
  { code: '1300', name: 'Input GST / ITC',         account_type: 'asset',     sub_type: 'Current Asset' },
  { code: '1500', name: 'Plant & Machinery',       account_type: 'asset',     sub_type: 'Fixed Asset' },
  { code: '1510', name: 'Office Equipment',        account_type: 'asset',     sub_type: 'Fixed Asset' },
  { code: '2000', name: 'Accounts Payable',        account_type: 'liability', sub_type: 'Current Liability' },
  { code: '2010', name: 'Goods Received Not Invoiced (GRIN)', account_type: 'liability', sub_type: 'Current Liability' },
  { code: '2100', name: 'Output GST Payable',      account_type: 'liability', sub_type: 'Current Liability' },
  { code: '2200', name: 'TDS Payable',             account_type: 'liability', sub_type: 'Current Liability' },
  { code: '2300', name: 'Retention Payable',        account_type: 'liability', sub_type: 'Current Liability' },
  { code: '2400', name: 'Salary Payable',           account_type: 'liability', sub_type: 'Current Liability' },
  { code: '2410', name: 'EPF Payable',              account_type: 'liability', sub_type: 'Current Liability' },
  { code: '2420', name: 'ESI Payable',              account_type: 'liability', sub_type: 'Current Liability' },
  { code: '2430', name: 'Professional Tax Payable', account_type: 'liability', sub_type: 'Current Liability' },
  { code: '2440', name: 'Employee Deductions Payable', account_type: 'liability', sub_type: 'Current Liability' },
  { code: '2500', name: 'Term Loans',               account_type: 'liability', sub_type: 'Long-term Liability' },
  { code: '3000', name: "Owner's Capital",         account_type: 'equity',    sub_type: 'Capital' },
  { code: '3100', name: 'Retained Earnings',       account_type: 'equity',    sub_type: 'Capital' },
  { code: '4000', name: 'Contract Revenue',        account_type: 'income',    sub_type: 'Operating Income' },
  { code: '4100', name: 'Other Income',            account_type: 'income',    sub_type: 'Other Income' },
  { code: '5000', name: 'Material Cost',           account_type: 'expense',   sub_type: 'Direct Cost' },
  { code: '5100', name: 'Subcontractor / Labour',  account_type: 'expense',   sub_type: 'Direct Cost' },
  { code: '5200', name: 'Equipment Hire',          account_type: 'expense',   sub_type: 'Direct Cost' },
  { code: '6000', name: 'Salaries & Wages',           account_type: 'expense',   sub_type: 'Indirect Expense' },
  { code: '6010', name: 'EPF Employer Contribution',  account_type: 'expense',   sub_type: 'Indirect Expense' },
  { code: '6020', name: 'ESI Employer Contribution',  account_type: 'expense',   sub_type: 'Indirect Expense' },
  { code: '6030', name: 'Fuel Expense',                account_type: 'expense',   sub_type: 'Indirect Expense' },
  { code: '6040', name: 'Safety Expense',              account_type: 'expense',   sub_type: 'Indirect Expense' },
  { code: '6050', name: 'Stationery Expense',          account_type: 'expense',   sub_type: 'Indirect Expense' },
  { code: '6060', name: 'Pantry / Site Welfare',       account_type: 'expense',   sub_type: 'Indirect Expense' },
  { code: '6070', name: 'Transport / Conveyance',      account_type: 'expense',   sub_type: 'Indirect Expense' },
  { code: '6080', name: 'Utilities Expense',           account_type: 'expense',   sub_type: 'Indirect Expense' },
  { code: '6100', name: 'Office & Admin Expenses',    account_type: 'expense',   sub_type: 'Indirect Expense' },
  { code: '6200', name: 'Bank Charges & Interest', account_type: 'expense',   sub_type: 'Indirect Expense' },
];

// ── helper: compute running balance for an account from posted journal lines ──
async function getAccountBalance(accountId, companyId) {
  const acc = await query(`SELECT * FROM chart_of_accounts WHERE id = $1 AND company_id = $2`, [accountId, companyId]);
  if (!acc.rows.length) return null;
  const account = acc.rows[0];
  const sign = ['asset', 'expense'].includes(account.account_type) ? 1 : -1;
  const r = await query(
    `SELECT COALESCE(SUM(jel.debit),0) AS debit, COALESCE(SUM(jel.credit),0) AS credit
     FROM journal_entry_lines jel
     JOIN journal_entries je ON je.id = jel.journal_entry_id
     WHERE jel.account_id = $1 AND je.company_id = $2 AND je.status = 'posted'`,
    [accountId, companyId]
  );
  const { debit, credit } = r.rows[0];
  const movement = (parseFloat(debit) - parseFloat(credit)) * sign;
  return parseFloat(account.opening_balance || 0) + movement;
}

// ── LIST ─────────────────────────────────────────────────────────────────────
router.get('/', authenticate, async (req, res) => {
  try {
    const { account_type, search } = req.query;
    const conditions = ['company_id = $1'];
    const params = [req.user.company_id];
    let p = 1;

    if (account_type) { conditions.push(`account_type = $${++p}`); params.push(account_type); }
    if (search) { conditions.push(`(code ILIKE $${++p} OR name ILIKE $${p})`); params.push(`%${search}%`); }

    const rows = await query(
      `SELECT ca.*,
              COALESCE(ca.opening_balance, 0)
              + CASE WHEN ca.account_type IN ('asset','expense')  THEN  1 ELSE -1 END
                * COALESCE(
                    (SELECT SUM(jel.debit) - SUM(jel.credit)
                     FROM journal_entry_lines jel
                     JOIN journal_entries je ON je.id = jel.journal_entry_id
                     WHERE jel.account_id = ca.id
                       AND je.company_id  = ca.company_id
                       AND je.status = 'posted'),
                    0)
              AS balance
       FROM chart_of_accounts ca
       WHERE ${conditions.join(' AND ')} ORDER BY ca.code ASC`,
      params
    );

    res.json({ data: rows.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── ACCOUNT TRANSACTIONS (posted journal lines + running balance) ────────────
router.get('/:id/transactions', authenticate, async (req, res) => {
  try {
    const acc = await query(`SELECT * FROM chart_of_accounts WHERE id = $1 AND company_id = $2`, [req.params.id, req.user.company_id]);
    if (!acc.rows.length) return res.status(404).json({ error: 'Account not found' });
    const account = acc.rows[0];
    const sign = ['asset', 'expense'].includes(account.account_type) ? 1 : -1;

    const r = await query(
      `SELECT jel.id, jel.debit, jel.credit, jel.description,
              je.id AS journal_entry_id, je.entry_no, je.entry_date, je.narration
       FROM journal_entry_lines jel
       JOIN journal_entries je ON je.id = jel.journal_entry_id
       WHERE jel.account_id = $1 AND je.company_id = $2 AND je.status = 'posted'
       ORDER BY je.entry_date ASC, je.created_at ASC`,
      [req.params.id, req.user.company_id]
    );

    let balance = parseFloat(account.opening_balance || 0);
    const transactions = r.rows.map(row => {
      balance += (parseFloat(row.debit) - parseFloat(row.credit)) * sign;
      return { ...row, running_balance: balance };
    });

    res.json({ data: { account, opening_balance: parseFloat(account.opening_balance || 0), transactions, closing_balance: balance } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── TAX SUMMARY (monthly GST/TDS movement for return filing) ──────────────────
router.get('/tax/monthly-summary', authenticate, async (req, res) => {
  try {
    const { year } = req.query;
    const yr = parseInt(year) || new Date().getFullYear();

    const r = await query(
      `SELECT to_char(je.entry_date, 'YYYY-MM') AS month,
              coa.code,
              SUM(jel.debit) AS debit, SUM(jel.credit) AS credit
       FROM journal_entry_lines jel
       JOIN journal_entries je ON je.id = jel.journal_entry_id
       JOIN chart_of_accounts coa ON coa.id = jel.account_id
       WHERE je.company_id = $1 AND je.status = 'posted'
         AND coa.code IN ('2100','1300','2200')
         AND EXTRACT(YEAR FROM je.entry_date) = $2
       GROUP BY 1, 2
       ORDER BY 1`,
      [req.user.company_id, yr]
    );

    const months = {};
    r.rows.forEach(row => {
      const m = months[row.month] ||= { month: row.month, output_gst: 0, input_gst: 0, tds_payable: 0 };
      const net = parseFloat(row.credit) - parseFloat(row.debit);
      if (row.code === '2100') m.output_gst += net;     // liability: credit increases
      if (row.code === '1300') m.input_gst += -net;     // asset: debit increases
      if (row.code === '2200') m.tds_payable += net;    // liability
    });

    const data = Object.values(months).map(m => ({ ...m, net_gst_payable: m.output_gst - m.input_gst }));
    res.json({ data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── SEED standard COA (only if empty) ─────────────────────────────────────────
router.post('/seed', authenticate, async (req, res) => {
  try {
    const existing = await query(`SELECT COUNT(*) FROM chart_of_accounts WHERE company_id = $1`, [req.user.company_id]);
    if (parseInt(existing.rows[0].count) > 0) {
      return res.status(400).json({ error: 'Chart of Accounts already has entries' });
    }
    for (const acc of STANDARD_COA) {
      await query(
        `INSERT INTO chart_of_accounts (company_id, code, name, account_type, sub_type)
         VALUES ($1,$2,$3,$4,$5)`,
        [req.user.company_id, acc.code, acc.name, acc.account_type, acc.sub_type]
      );
    }
    const rows = await query(`SELECT * FROM chart_of_accounts WHERE company_id = $1 ORDER BY code ASC`, [req.user.company_id]);
    res.status(201).json({ data: rows.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── CREATE ───────────────────────────────────────────────────────────────────
router.post('/', authenticate, async (req, res) => {
  try {
    const { code, name, account_type, sub_type, opening_balance } = req.body;
    if (!code || !name || !account_type) {
      return res.status(400).json({ error: 'code, name and account_type are required' });
    }
    const allowed = ['asset', 'liability', 'equity', 'income', 'expense'];
    if (!allowed.includes(account_type)) {
      return res.status(400).json({ error: `account_type must be one of: ${allowed.join(', ')}` });
    }
    const result = await query(
      `INSERT INTO chart_of_accounts (company_id, code, name, account_type, sub_type, opening_balance)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [req.user.company_id, code, name, account_type, sub_type || null, parseFloat(opening_balance) || 0]
    );
    res.status(201).json({ data: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Account code already exists' });
    res.status(500).json({ error: err.message });
  }
});

// ── UPDATE ───────────────────────────────────────────────────────────────────
router.put('/:id', authenticate, async (req, res) => {
  try {
    const { code, name, account_type, sub_type, opening_balance, is_active } = req.body;
    const result = await query(
      `UPDATE chart_of_accounts SET
        code = COALESCE($1, code), name = COALESCE($2, name),
        account_type = COALESCE($3, account_type), sub_type = COALESCE($4, sub_type),
        opening_balance = COALESCE($5, opening_balance),
        is_active = COALESCE($6, is_active), updated_at = NOW()
       WHERE id = $7 AND company_id = $8 RETURNING *`,
      [code, name, account_type, sub_type, opening_balance != null ? parseFloat(opening_balance) : null, is_active, req.params.id, req.user.company_id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Account not found' });
    res.json({ data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE ───────────────────────────────────────────────────────────────────
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const used = await query(`SELECT 1 FROM journal_entry_lines WHERE account_id = $1 LIMIT 1`, [req.params.id]);
    if (used.rows.length) return res.status(400).json({ error: 'Account has journal entries and cannot be deleted' });
    const result = await query(`DELETE FROM chart_of_accounts WHERE id = $1 AND company_id = $2`, [req.params.id, req.user.company_id]);
    if (!result.rowCount) return res.status(404).json({ error: 'Account not found' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
