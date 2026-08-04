// src/routes/chart-of-accounts.routes.js
const express = require('express');
const { authenticate, authorize } = require('../middleware/auth');
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

// Full 120-account construction COA — covers all standard accounts for BCIM ERP
const STANDARD_COA = [
  // ── ASSETS ─────────────────────────────────────────────────────────────────
  { code: '1000', name: 'Cash in Hand',                        account_type: 'asset',     sub_type: 'Current Asset' },
  { code: '1010', name: 'Bank Accounts',                       account_type: 'asset',     sub_type: 'Current Asset' },
  { code: '1015', name: 'Fixed Deposits / FDR',               account_type: 'asset',     sub_type: 'Current Asset' },
  { code: '1020', name: 'CC / OD Account',                    account_type: 'asset',     sub_type: 'Current Asset' },
  { code: '1050', name: 'Petty Cash (Project Sites)',          account_type: 'asset',     sub_type: 'Current Asset' },
  { code: '1100', name: 'Accounts Receivable',                 account_type: 'asset',     sub_type: 'Current Asset' },
  { code: '1150', name: 'Advance to Vendors/Subcontractors',  account_type: 'asset',     sub_type: 'Current Asset' },
  { code: '1200', name: 'Inventory / Stores',                  account_type: 'asset',     sub_type: 'Current Asset' },
  { code: '1250', name: 'Employee Loans & Advances',           account_type: 'asset',     sub_type: 'Current Asset' },
  { code: '1300', name: 'Input GST / ITC',                    account_type: 'asset',     sub_type: 'Tax Asset' },
  { code: '1310', name: 'TCS Receivable',                     account_type: 'asset',     sub_type: 'Tax Asset' },
  { code: '1311', name: 'TDS Receivable',                     account_type: 'asset',     sub_type: 'Tax Asset' },
  { code: '1320', name: 'Advance Tax Paid',                   account_type: 'asset',     sub_type: 'Tax Asset' },
  { code: '1330', name: 'GST Refund Receivable',              account_type: 'asset',     sub_type: 'Tax Asset' },
  { code: '1350', name: 'Security Deposits & EMD Paid',       account_type: 'asset',     sub_type: 'Current Asset' },
  { code: '1360', name: 'Mobilization Advance Recoverable',   account_type: 'asset',     sub_type: 'Current Asset' },
  { code: '1370', name: 'Unbilled Revenue / WIP',             account_type: 'asset',     sub_type: 'Current Asset' },
  { code: '1400', name: 'Prepaid Expenses',                   account_type: 'asset',     sub_type: 'Current Asset' },
  { code: '1500', name: 'Plant & Machinery',                  account_type: 'asset',     sub_type: 'Fixed Asset' },
  { code: '1510', name: 'Office Equipment',                   account_type: 'asset',     sub_type: 'Fixed Asset' },
  { code: '1520', name: 'Vehicles',                           account_type: 'asset',     sub_type: 'Fixed Asset' },
  { code: '1530', name: 'Furniture & Fixtures',               account_type: 'asset',     sub_type: 'Fixed Asset' },
  { code: '1540', name: 'Tools & Tackles',                    account_type: 'asset',     sub_type: 'Fixed Asset' },
  { code: '1550', name: 'Capital Work in Progress (CWIP)',    account_type: 'asset',     sub_type: 'Fixed Asset' },

  // ── LIABILITIES ──────────────────────────────────────────────────────────────
  { code: '2000', name: 'Accounts Payable',                        account_type: 'liability', sub_type: 'Current Liability' },
  { code: '2010', name: 'Goods Received Not Invoiced (GRIN)',      account_type: 'liability', sub_type: 'Current Liability' },
  { code: '2050', name: 'Client Advances (Advance from Customers)',account_type: 'liability', sub_type: 'Current Liability' },
  { code: '2060', name: 'Performance Guarantee / BG Received',    account_type: 'liability', sub_type: 'Current Liability' },
  { code: '2070', name: 'Security Deposit Received',               account_type: 'liability', sub_type: 'Current Liability' },
  { code: '2100', name: 'Output GST Payable',                      account_type: 'liability', sub_type: 'Tax Liability' },
  { code: '2200', name: 'TDS Payable',                             account_type: 'liability', sub_type: 'Tax Liability' },
  { code: '2300', name: 'Retention Payable',                        account_type: 'liability', sub_type: 'Current Liability' },
  { code: '2400', name: 'Salary Payable',                           account_type: 'liability', sub_type: 'Current Liability' },
  { code: '2410', name: 'EPF Payable',                              account_type: 'liability', sub_type: 'Current Liability' },
  { code: '2420', name: 'ESI Payable',                              account_type: 'liability', sub_type: 'Current Liability' },
  { code: '2430', name: 'Professional Tax Payable',                 account_type: 'liability', sub_type: 'Tax Liability' },
  { code: '2440', name: 'Employee Deductions Payable',              account_type: 'liability', sub_type: 'Current Liability' },
  { code: '2450', name: 'Insurance Premium Payable',               account_type: 'liability', sub_type: 'Current Liability' },
  { code: '2460', name: 'Labour Welfare Fund Payable',             account_type: 'liability', sub_type: 'Current Liability' },
  { code: '2500', name: 'Term Loans',                               account_type: 'liability', sub_type: 'Long-term Liability' },
  { code: '2510', name: 'Bank Overdraft / CC Facility',            account_type: 'liability', sub_type: 'Current Liability' },
  { code: '2520', name: 'Unsecured Loans (Director/Partner)',      account_type: 'liability', sub_type: 'Long-term Liability' },
  { code: '2530', name: 'Income Tax Provision',                    account_type: 'liability', sub_type: 'Tax Liability' },
  { code: '2540', name: 'Gratuity Provision',                      account_type: 'liability', sub_type: 'Provision' },
  { code: '2550', name: 'Leave Encashment Provision',              account_type: 'liability', sub_type: 'Provision' },
  { code: '2560', name: 'Bonus / Ex-Gratia Provision',            account_type: 'liability', sub_type: 'Provision' },
  { code: '2570', name: 'Advance Billing / Deferred Revenue',     account_type: 'liability', sub_type: 'Current Liability' },

  // ── EQUITY ───────────────────────────────────────────────────────────────────
  { code: '3000', name: "Owner's Capital",   account_type: 'equity', sub_type: 'Capital' },
  { code: '3100', name: 'Retained Earnings', account_type: 'equity', sub_type: 'Capital' },

  // ── INCOME ───────────────────────────────────────────────────────────────────
  { code: '4000', name: 'Contract Revenue',                  account_type: 'income', sub_type: 'Operating Income' },
  { code: '4050', name: 'Price Variation / Escalation Claims',account_type: 'income', sub_type: 'Operating Income' },
  { code: '4100', name: 'Other Income',                      account_type: 'income', sub_type: 'Other Income' },
  { code: '4110', name: 'Plant Hire Income',                 account_type: 'income', sub_type: 'Other Income' },
  { code: '4120', name: 'Material Recovery / Scrap Sales',   account_type: 'income', sub_type: 'Other Income' },
  { code: '4130', name: 'Interest Income',                   account_type: 'income', sub_type: 'Other Income' },
  { code: '4140', name: 'Profit on Asset Sale',              account_type: 'income', sub_type: 'Other Income' },
  { code: '4150', name: 'Miscellaneous Income',              account_type: 'income', sub_type: 'Other Income' },
  { code: '4160', name: 'Tender / Bid Fee Recovery',         account_type: 'income', sub_type: 'Other Income' },

  // ── DIRECT PROJECT COSTS — Material ──────────────────────────────────────────
  { code: '5000', name: 'Material Cost',               account_type: 'expense', sub_type: 'Direct Cost - Material' },
  { code: '5010', name: 'Cement',                      account_type: 'expense', sub_type: 'Direct Cost - Material' },
  { code: '5020', name: 'Steel / Reinforcement',       account_type: 'expense', sub_type: 'Direct Cost - Material' },
  { code: '5030', name: 'Aggregate / Sand / Metal',    account_type: 'expense', sub_type: 'Direct Cost - Material' },
  { code: '5040', name: 'Ready Mix Concrete (RMC)',     account_type: 'expense', sub_type: 'Direct Cost - Material' },
  { code: '5050', name: 'Bricks & Blocks',              account_type: 'expense', sub_type: 'Direct Cost - Material' },
  { code: '5060', name: 'Bitumen / Asphalt',            account_type: 'expense', sub_type: 'Direct Cost - Material' },
  { code: '5070', name: 'Pipes & Fittings',             account_type: 'expense', sub_type: 'Direct Cost - Material' },
  { code: '5080', name: 'Electrical Material',          account_type: 'expense', sub_type: 'Direct Cost - Material' },
  { code: '5090', name: 'Hardware & Fasteners',         account_type: 'expense', sub_type: 'Direct Cost - Material' },

  // ── DIRECT PROJECT COSTS — Sub-contractor ────────────────────────────────────
  { code: '5100', name: 'Subcontractor / Labour',      account_type: 'expense', sub_type: 'Direct Cost - Sub-contractor' },
  { code: '5150', name: 'Civil Sub-contractor',        account_type: 'expense', sub_type: 'Direct Cost - Sub-contractor' },
  { code: '5160', name: 'Electrical Sub-contractor',   account_type: 'expense', sub_type: 'Direct Cost - Sub-contractor' },
  { code: '5170', name: 'Plumbing / MEP Sub-contractor',account_type: 'expense', sub_type: 'Direct Cost - Sub-contractor' },

  // ── DIRECT PROJECT COSTS — Equipment ─────────────────────────────────────────
  { code: '5200', name: 'Equipment Hire',                   account_type: 'expense', sub_type: 'Direct Cost - Equipment' },
  { code: '5210', name: 'DG Set Hire',                      account_type: 'expense', sub_type: 'Direct Cost - Equipment' },
  { code: '5220', name: 'Crane & Heavy Equipment Hire',     account_type: 'expense', sub_type: 'Direct Cost - Equipment' },
  { code: '5230', name: 'Dewatering / Pumping Charges',     account_type: 'expense', sub_type: 'Direct Cost - Equipment' },

  // ── DIRECT PROJECT COSTS — Specialised Work ──────────────────────────────────
  { code: '5300', name: 'Testing & Quality Control',    account_type: 'expense', sub_type: 'Direct Cost - QC' },
  { code: '5400', name: 'Survey & Setting Out Charges', account_type: 'expense', sub_type: 'Direct Cost - QC' },
  { code: '5500', name: 'Scaffolding & Shuttering Hire',account_type: 'expense', sub_type: 'Direct Cost - Equipment' },
  { code: '5600', name: 'Explosive & Blasting Charges', account_type: 'expense', sub_type: 'Direct Cost - Specialised' },
  { code: '5700', name: 'Formwork & Centering',         account_type: 'expense', sub_type: 'Direct Cost - Specialised' },

  // ── INDIRECT / SITE OVERHEAD ──────────────────────────────────────────────────
  { code: '6000', name: 'Salaries & Wages',             account_type: 'expense', sub_type: 'Payroll' },
  { code: '6010', name: 'EPF Employer Contribution',    account_type: 'expense', sub_type: 'Payroll' },
  { code: '6020', name: 'ESI Employer Contribution',    account_type: 'expense', sub_type: 'Payroll' },
  { code: '6025', name: 'Gratuity Expense',             account_type: 'expense', sub_type: 'Payroll' },
  { code: '6027', name: 'Bonus / Ex-Gratia',            account_type: 'expense', sub_type: 'Payroll' },
  { code: '6029', name: 'Leave Encashment Expense',     account_type: 'expense', sub_type: 'Payroll' },
  { code: '6030', name: 'Fuel Expense',                 account_type: 'expense', sub_type: 'Site Indirect' },
  { code: '6040', name: 'Safety Expense',               account_type: 'expense', sub_type: 'Site Indirect' },
  { code: '6050', name: 'Stationery Expense',           account_type: 'expense', sub_type: 'Site Indirect' },
  { code: '6060', name: 'Pantry / Site Welfare',        account_type: 'expense', sub_type: 'Site Indirect' },
  { code: '6070', name: 'Transport / Conveyance',       account_type: 'expense', sub_type: 'Site Indirect' },
  { code: '6080', name: 'Utilities Expense',            account_type: 'expense', sub_type: 'Site Indirect' },
  { code: '6085', name: 'Supervision Charges',          account_type: 'expense', sub_type: 'Site Indirect' },
  { code: '6090', name: 'Accommodation / Labour Camp',  account_type: 'expense', sub_type: 'Site Indirect' },
  { code: '6095', name: 'Site Security Charges',        account_type: 'expense', sub_type: 'Site Indirect' },
  { code: '6100', name: 'Office & Admin Expenses',      account_type: 'expense', sub_type: 'Site Indirect' },
  { code: '6115', name: 'Communication & Telephone',    account_type: 'expense', sub_type: 'Site Indirect' },
  { code: '6125', name: 'Repairs & Maintenance - Plant',account_type: 'expense', sub_type: 'Site Indirect' },
  { code: '6127', name: 'Repairs & Maintenance - Site', account_type: 'expense', sub_type: 'Site Indirect' },
  { code: '6135', name: 'Insurance Premium',            account_type: 'expense', sub_type: 'Site Indirect' },
  { code: '6145', name: 'Professional & Consultant Fees',account_type: 'expense', sub_type: 'Site Indirect' },
  { code: '6155', name: 'Tools & Tackles Expenses',     account_type: 'expense', sub_type: 'Site Indirect' },
  { code: '6165', name: 'Water Charges',                account_type: 'expense', sub_type: 'Site Indirect' },
  { code: '6175', name: 'Medical & First Aid Expenses', account_type: 'expense', sub_type: 'Site Indirect' },
  { code: '6185', name: 'Labour Welfare Expenses',      account_type: 'expense', sub_type: 'Site Indirect' },
  { code: '6195', name: 'Miscellaneous Site Expenses',  account_type: 'expense', sub_type: 'Site Indirect' },

  // ── HEAD OFFICE / ADMIN ──────────────────────────────────────────────────────
  { code: '6200', name: 'Bank Charges & Interest',          account_type: 'expense', sub_type: 'HO / Admin' },
  { code: '6210', name: 'Depreciation - Plant & Machinery', account_type: 'expense', sub_type: 'HO / Admin' },
  { code: '6220', name: 'Depreciation - Vehicles',          account_type: 'expense', sub_type: 'HO / Admin' },
  { code: '6240', name: 'Interest on Term Loans',           account_type: 'expense', sub_type: 'HO / Admin' },
  { code: '6250', name: 'Travel & Stay (Outstation)',        account_type: 'expense', sub_type: 'HO / Admin' },
  { code: '6260', name: 'Audit & Professional Fees (HO)',   account_type: 'expense', sub_type: 'HO / Admin' },
  { code: '6270', name: 'Legal Expenses',                   account_type: 'expense', sub_type: 'HO / Admin' },
  { code: '6280', name: 'Tender & Bid Expenses',            account_type: 'expense', sub_type: 'HO / Admin' },
  { code: '6290', name: 'Training & Development',           account_type: 'expense', sub_type: 'HO / Admin' },
  { code: '6300', name: 'Stamp Duty & Registration',        account_type: 'expense', sub_type: 'HO / Admin' },
  { code: '6310', name: 'Entertainment & Business Dev',     account_type: 'expense', sub_type: 'HO / Admin' },
  { code: '6320', name: 'CSR Expenses',                     account_type: 'expense', sub_type: 'HO / Admin' },
  { code: '6330', name: 'Foreign Exchange Loss',            account_type: 'expense', sub_type: 'HO / Admin' },
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
    const { account_type, search, project_id } = req.query;
    const conditions = ['company_id = $1'];
    const params = [req.user.company_id];
    let p = 1;

    if (account_type) { conditions.push(`account_type = $${++p}`); params.push(account_type); }
    if (search) { conditions.push(`(code ILIKE $${++p} OR name ILIKE $${p})`); params.push(`%${search}%`); }

    // Project-scoped balances exclude the company-wide opening_balance (it's not
    // attributable to any one project) and restrict the movement to that
    // project's own journal entries instead of every entry on the account.
    let projectClause = '';
    if (project_id) { projectClause = ` AND je.project_id = $${++p}`; params.push(project_id); }
    const openingTerm = project_id ? '0' : 'COALESCE(ca.opening_balance, 0)';

    const rows = await query(
      `SELECT ca.*,
              ${openingTerm}
              + CASE WHEN ca.account_type IN ('asset','expense')  THEN  1 ELSE -1 END
                * COALESCE(
                    (SELECT SUM(jel.debit) - SUM(jel.credit)
                     FROM journal_entry_lines jel
                     JOIN journal_entries je ON je.id = jel.journal_entry_id
                     WHERE jel.account_id = ca.id
                       AND je.company_id  = ca.company_id
                       AND je.status = 'posted'${projectClause}),
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
    const { project_id } = req.query;
    const acc = await query(`SELECT * FROM chart_of_accounts WHERE id = $1 AND company_id = $2`, [req.params.id, req.user.company_id]);
    if (!acc.rows.length) return res.status(404).json({ error: 'Account not found' });
    const account = acc.rows[0];
    const sign = ['asset', 'expense'].includes(account.account_type) ? 1 : -1;

    const params = [req.params.id, req.user.company_id];
    let projectClause = '';
    if (project_id) { params.push(project_id); projectClause = ` AND je.project_id = $${params.length}`; }

    const r = await query(
      `SELECT jel.id, jel.debit, jel.credit, jel.description,
              je.id AS journal_entry_id, je.entry_no, je.entry_date, je.narration
       FROM journal_entry_lines jel
       JOIN journal_entries je ON je.id = jel.journal_entry_id
       WHERE jel.account_id = $1 AND je.company_id = $2 AND je.status = 'posted'${projectClause}
       ORDER BY je.entry_date ASC, je.created_at ASC`,
      params
    );

    // Project-scoped drill-down starts from zero — the account's opening_balance
    // is a company-wide figure, not attributable to any single project.
    let balance = project_id ? 0 : parseFloat(account.opening_balance || 0);
    const transactions = r.rows.map(row => {
      balance += (parseFloat(row.debit) - parseFloat(row.credit)) * sign;
      return { ...row, running_balance: balance };
    });

    res.json({ data: { account, opening_balance: project_id ? 0 : parseFloat(account.opening_balance || 0), transactions, closing_balance: balance } });
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
router.post('/seed', authenticate, authorize('super_admin','admin','accountant','finance_manager'), async (req, res) => {
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
router.post('/', authenticate, authorize('super_admin','admin','accountant','finance_manager'), async (req, res) => {
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
router.put('/:id', authenticate, authorize('super_admin','admin','accountant','finance_manager'), async (req, res) => {
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

// ── BULK OPENING BALANCE UPDATE ───────────────────────────────────────────────
// Body: { balances: [{ code: '1100', opening_balance: 50000 }, ...] }
// Idempotent — safe to re-run. Only finance_manager/admin can call.
router.post('/opening-balances', authenticate, authorize('super_admin','admin','finance_manager'), async (req, res) => {
  try {
    const { balances } = req.body;
    if (!Array.isArray(balances) || !balances.length)
      return res.status(400).json({ error: 'balances array required' });
    const results = [];
    for (const { code, opening_balance } of balances) {
      if (!code || opening_balance == null) continue;
      const r = await query(
        `UPDATE chart_of_accounts SET opening_balance = $1, updated_at = NOW()
         WHERE company_id = $2 AND code = $3 RETURNING code, name, opening_balance`,
        [parseFloat(opening_balance), req.user.company_id, code]
      );
      if (r.rows[0]) results.push(r.rows[0]);
    }
    res.json({ updated: results.length, data: results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE ───────────────────────────────────────────────────────────────────
router.delete('/:id', authenticate, authorize('super_admin','admin','accountant','finance_manager'), async (req, res) => {
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
