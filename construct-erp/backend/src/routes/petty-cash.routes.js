// src/routes/petty-cash.routes.js  — Complete Petty Cash Management Module
const express = require('express');
const { authenticate, authorize } = require('../middleware/auth');
const { query } = require('../config/database');
const { runSchemaInit } = require('../utils/schemaInit');
const { postAutoJournalStandalone } = require('../services/journalAutoPost');
const router = express.Router();
router.use(authenticate);

// ── Schema Init ────────────────────────────────────────────────────────────────
runSchemaInit('petty_cash_v2', async () => {
  const safe = sql => query(sql).catch(e => console.warn('[pc-schema]', e.message));

  // Master: Cash Accounts
  await safe(`CREATE TABLE IF NOT EXISTS pc_accounts (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id      UUID NOT NULL,
    account_name    VARCHAR(200) NOT NULL,
    account_code    VARCHAR(50),
    project_id      UUID REFERENCES projects(id),
    site_location   VARCHAR(200),
    initial_balance NUMERIC(14,2) DEFAULT 0,
    current_balance NUMERIC(14,2) DEFAULT 0,
    credit_limit    NUMERIC(14,2) DEFAULT 10000,
    gl_account_code VARCHAR(50),
    custodian_id    UUID,
    status          VARCHAR(20) DEFAULT 'active',
    created_by      UUID,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
  )`);

  // Master: Custodians
  await safe(`CREATE TABLE IF NOT EXISTS pc_custodians (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id        UUID NOT NULL,
    custodian_name    VARCHAR(200) NOT NULL,
    employee_code     VARCHAR(50),
    designation       VARCHAR(100),
    project_id        UUID REFERENCES projects(id),
    site_location     VARCHAR(200),
    spending_limit    NUMERIC(14,2) DEFAULT 5000,
    current_holding   NUMERIC(14,2) DEFAULT 0,
    contact_number    VARCHAR(20),
    status            VARCHAR(20) DEFAULT 'active',
    user_id           UUID REFERENCES users(id),
    created_by        UUID,
    created_at        TIMESTAMPTZ DEFAULT NOW(),
    updated_at        TIMESTAMPTZ DEFAULT NOW()
  )`);

  // Master: Expense Categories
  await safe(`CREATE TABLE IF NOT EXISTS pc_expense_categories (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id       UUID NOT NULL,
    category_code    VARCHAR(50),
    category_name    VARCHAR(200) NOT NULL,
    construction_type VARCHAR(100),
    gl_account       VARCHAR(50),
    requires_receipt BOOLEAN DEFAULT false,
    is_active        BOOLEAN DEFAULT true,
    created_at       TIMESTAMPTZ DEFAULT NOW()
  )`);

  // Seed default categories once — check any row with that code exists (nil or real company)
  await safe(`INSERT INTO pc_expense_categories (company_id, category_code, category_name, construction_type, requires_receipt)
    SELECT '00000000-0000-0000-0000-000000000000'::uuid, code, name, ctype, req FROM (VALUES
      ('FUEL',  'Fuel & Lubricants',        'Vehicle',   true),
      ('LABW',  'Labour Welfare',           'Labour',    false),
      ('LOCM',  'Local Material Purchase',  'Material',  true),
      ('VEHI',  'Vehicle Expenses',         'Vehicle',   true),
      ('SITE',  'Site Consumables',         'Site',      false),
      ('TRVL',  'Travel & Conveyance',      'General',   false),
      ('MEAL',  'Meals & Refreshments',     'General',   false),
      ('EMRG',  'Emergency Expenses',       'General',   false),
      ('UTIL',  'Utilities & Services',     'General',   false),
      ('MISC',  'Miscellaneous',            'General',   false)
    ) AS t(code,name,ctype,req)
    WHERE NOT EXISTS (SELECT 1 FROM pc_expense_categories WHERE category_code = t.code)`);

  // Clean up any duplicate default categories created by prior bug
  await safe(`DELETE FROM pc_expense_categories a
    USING pc_expense_categories b
    WHERE a.company_id = '00000000-0000-0000-0000-000000000000'
      AND b.company_id = '00000000-0000-0000-0000-000000000000'
      AND a.category_code = b.category_code
      AND a.created_at > b.created_at`);

  // Transaction: Requests
  await safe(`CREATE TABLE IF NOT EXISTS pc_requests (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id       UUID NOT NULL,
    request_number   VARCHAR(50) NOT NULL,
    project_id       UUID REFERENCES projects(id),
    site_location    VARCHAR(200),
    custodian_id     UUID REFERENCES pc_custodians(id),
    account_id       UUID REFERENCES pc_accounts(id),
    purpose          TEXT NOT NULL,
    amount_requested NUMERIC(14,2) NOT NULL,
    amount_approved  NUMERIC(14,2),
    amount_issued    NUMERIC(14,2),
    priority         VARCHAR(20) DEFAULT 'normal',
    status           VARCHAR(30) DEFAULT 'draft',
    required_by_date DATE,
    requested_by     UUID REFERENCES users(id),
    requested_at     TIMESTAMPTZ,
    reviewed_by      UUID REFERENCES users(id),
    reviewed_at      TIMESTAMPTZ,
    review_remarks   TEXT,
    approved_by      UUID REFERENCES users(id),
    approved_at      TIMESTAMPTZ,
    approval_remarks TEXT,
    rejected_by      UUID REFERENCES users(id),
    rejected_at      TIMESTAMPTZ,
    rejection_reason TEXT,
    issued_by        UUID REFERENCES users(id),
    issued_at        TIMESTAMPTZ,
    payment_mode     VARCHAR(50),
    reference_number VARCHAR(100),
    remarks          TEXT,
    created_by       UUID REFERENCES users(id),
    created_at       TIMESTAMPTZ DEFAULT NOW(),
    updated_at       TIMESTAMPTZ DEFAULT NOW()
  )`);
  await safe(`CREATE UNIQUE INDEX IF NOT EXISTS idx_pc_requests_num ON pc_requests(company_id, request_number)`);

  // Transaction: Expenses
  await safe(`CREATE TABLE IF NOT EXISTS pc_expenses (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id     UUID NOT NULL,
    voucher_number VARCHAR(50) NOT NULL,
    request_id     UUID REFERENCES pc_requests(id),
    project_id     UUID REFERENCES projects(id),
    site_location  VARCHAR(200),
    custodian_id   UUID REFERENCES pc_custodians(id),
    category_id    UUID REFERENCES pc_expense_categories(id),
    expense_date   DATE NOT NULL,
    description    TEXT NOT NULL,
    amount         NUMERIC(14,2) NOT NULL,
    payment_mode   VARCHAR(50),
    bill_number    VARCHAR(100),
    bill_date      DATE,
    vendor_name    VARCHAR(200),
    status         VARCHAR(30) DEFAULT 'draft',
    submitted_by   UUID REFERENCES users(id),
    submitted_at   TIMESTAMPTZ,
    approved_by    UUID REFERENCES users(id),
    approved_at    TIMESTAMPTZ,
    rejected_by    UUID REFERENCES users(id),
    rejected_at    TIMESTAMPTZ,
    rejection_reason TEXT,
    remarks        TEXT,
    created_by     UUID REFERENCES users(id),
    created_at     TIMESTAMPTZ DEFAULT NOW(),
    updated_at     TIMESTAMPTZ DEFAULT NOW()
  )`);
  await safe(`CREATE UNIQUE INDEX IF NOT EXISTS idx_pc_expenses_num ON pc_expenses(company_id, voucher_number)`);

  // Transaction: Settlements
  await safe(`CREATE TABLE IF NOT EXISTS pc_settlements (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id        UUID NOT NULL,
    settlement_number VARCHAR(50) NOT NULL,
    project_id        UUID REFERENCES projects(id),
    custodian_id      UUID REFERENCES pc_custodians(id),
    account_id        UUID REFERENCES pc_accounts(id),
    settlement_date   DATE NOT NULL,
    period_from       DATE,
    period_to         DATE,
    opening_balance   NUMERIC(14,2) DEFAULT 0,
    total_issued      NUMERIC(14,2) DEFAULT 0,
    total_expenses    NUMERIC(14,2) DEFAULT 0,
    total_returned    NUMERIC(14,2) DEFAULT 0,
    closing_balance   NUMERIC(14,2) DEFAULT 0,
    variance          NUMERIC(14,2) DEFAULT 0,
    status            VARCHAR(30) DEFAULT 'draft',
    settled_by        UUID REFERENCES users(id),
    settled_at        TIMESTAMPTZ,
    verified_by       UUID REFERENCES users(id),
    verified_at       TIMESTAMPTZ,
    remarks           TEXT,
    created_by        UUID REFERENCES users(id),
    created_at        TIMESTAMPTZ DEFAULT NOW(),
    updated_at        TIMESTAMPTZ DEFAULT NOW()
  )`);

  // Transaction: Transfers
  await safe(`CREATE TABLE IF NOT EXISTS pc_transfers (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id      UUID NOT NULL,
    transfer_number VARCHAR(50) NOT NULL,
    from_account_id UUID REFERENCES pc_accounts(id),
    to_account_id   UUID REFERENCES pc_accounts(id),
    from_project_id UUID REFERENCES projects(id),
    to_project_id   UUID REFERENCES projects(id),
    from_site       VARCHAR(200),
    to_site         VARCHAR(200),
    amount          NUMERIC(14,2) NOT NULL,
    transfer_date   DATE NOT NULL,
    purpose         TEXT,
    status          VARCHAR(30) DEFAULT 'draft',
    approved_by     UUID REFERENCES users(id),
    approved_at     TIMESTAMPTZ,
    remarks         TEXT,
    created_by      UUID REFERENCES users(id),
    created_at      TIMESTAMPTZ DEFAULT NOW()
  )`);

  // Transaction: Adjustments
  await safe(`CREATE TABLE IF NOT EXISTS pc_adjustments (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id       UUID NOT NULL,
    adjustment_number VARCHAR(50) NOT NULL,
    account_id       UUID REFERENCES pc_accounts(id),
    project_id       UUID REFERENCES projects(id),
    adjustment_date  DATE NOT NULL,
    adjustment_type  VARCHAR(10) NOT NULL CHECK (adjustment_type IN ('credit','debit')),
    amount           NUMERIC(14,2) NOT NULL,
    reason           TEXT NOT NULL,
    status           VARCHAR(30) DEFAULT 'draft',
    approved_by      UUID REFERENCES users(id),
    approved_at      TIMESTAMPTZ,
    remarks          TEXT,
    created_by       UUID REFERENCES users(id),
    created_at       TIMESTAMPTZ DEFAULT NOW()
  )`);

  // Audit Log
  await safe(`CREATE TABLE IF NOT EXISTS pc_audit_log (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id   UUID NOT NULL,
    entity_type  VARCHAR(50),
    entity_id    UUID,
    action       VARCHAR(50),
    old_status   VARCHAR(30),
    new_status   VARCHAR(30),
    remarks      TEXT,
    performed_by UUID REFERENCES users(id),
    performed_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  // Legacy migration: keep old petty_cash_entries table
  await safe(`CREATE TABLE IF NOT EXISTS petty_cash_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), company_id UUID, project_id UUID,
    entry_type VARCHAR(20), entry_date DATE, category VARCHAR(100), description TEXT,
    amount DECIMAL(12,2), voucher_number VARCHAR(50), received_by VARCHAR(100),
    remarks TEXT, created_by UUID, created_at TIMESTAMPTZ DEFAULT NOW()
  )`);
});

// ── Helpers ────────────────────────────────────────────────────────────────────
async function nextSeq(table, prefix, companyId) {
  const col = table === 'pc_requests' ? 'request_number'
            : table === 'pc_expenses' ? 'voucher_number'
            : table === 'pc_settlements' ? 'settlement_number'
            : table === 'pc_transfers'   ? 'transfer_number'
            : 'adjustment_number';
  const yr = new Date().getFullYear().toString().slice(2);
  const { rows } = await query(
    `SELECT COUNT(*)::int AS cnt FROM ${table} WHERE company_id=$1 AND ${col} LIKE $2`,
    [companyId, `${prefix}/${yr}/%`]
  );
  const seq = String(rows[0].cnt + 1).padStart(4, '0');
  return `${prefix}/${yr}/${seq}`;
}

async function auditLog(companyId, entityType, entityId, action, oldStatus, newStatus, remarks, performedBy) {
  await query(
    `INSERT INTO pc_audit_log (company_id,entity_type,entity_id,action,old_status,new_status,remarks,performed_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [companyId, entityType, entityId, action, oldStatus, newStatus, remarks, performedBy]
  ).catch(() => {});
}

// ── DASHBOARD ──────────────────────────────────────────────────────────────────
router.get('/dashboard', async (req, res) => {
  try {
    const { project_id } = req.query;
    const cid = req.user.company_id;
    const projFilter = project_id ? `AND project_id = '${project_id}'` : '';

    const [balance, pending, monthly, siteWise, categories, recentReq, recentExp] = await Promise.all([
      // Cash balance across all accounts
      query(`SELECT COALESCE(SUM(current_balance),0) AS total_balance,
               COUNT(*) AS account_count FROM pc_accounts
             WHERE company_id=$1 AND status='active' ${projFilter}`, [cid]),
      // Pending approvals
      query(`SELECT
               COUNT(*) FILTER (WHERE status='submitted') AS pending_requests,
               COUNT(*) FILTER (WHERE status='submitted') AS pending_expenses
             FROM pc_requests WHERE company_id=$1 ${projFilter}`, [cid]),
      // Monthly expenses (last 6 months)
      query(`SELECT TO_CHAR(expense_date,'YYYY-MM') AS month,
               SUM(amount) AS total
             FROM pc_expenses
             WHERE company_id=$1 AND status='approved'
               AND expense_date >= CURRENT_DATE - INTERVAL '6 months'
               ${projFilter}
             GROUP BY 1 ORDER BY 1`, [cid]),
      // Site-wise utilization
      query(`SELECT COALESCE(site_location,'Unknown') AS site,
               SUM(amount) AS total, COUNT(*) AS count
             FROM pc_expenses
             WHERE company_id=$1 AND status='approved'
               AND expense_date >= DATE_TRUNC('month',CURRENT_DATE)
               ${projFilter}
             GROUP BY 1 ORDER BY 2 DESC LIMIT 8`, [cid]),
      // Category breakdown
      query(`SELECT c.category_name, SUM(e.amount) AS total, COUNT(e.id) AS count
             FROM pc_expenses e
             JOIN pc_expense_categories c ON c.id = e.category_id
             WHERE e.company_id=$1 AND e.status='approved'
               AND e.expense_date >= DATE_TRUNC('month',CURRENT_DATE)
               ${projFilter}
             GROUP BY c.category_name ORDER BY 2 DESC LIMIT 6`, [cid]),
      // Recent requests
      query(`SELECT r.*, p.name AS project_name,
               COALESCE(u.name, r.requested_by::text) AS requestor_name
             FROM pc_requests r
             LEFT JOIN projects p ON p.id = r.project_id
             LEFT JOIN users u ON u.id = r.requested_by
             WHERE r.company_id=$1
             ORDER BY r.created_at DESC LIMIT 5`, [cid]),
      // Recent expenses
      query(`SELECT e.*, c.category_name, p.name AS project_name
             FROM pc_expenses e
             LEFT JOIN pc_expense_categories c ON c.id = e.category_id
             LEFT JOIN projects p ON p.id = e.project_id
             WHERE e.company_id=$1
             ORDER BY e.created_at DESC LIMIT 5`, [cid]),
    ]);

    const pendingExpQ = await query(
      `SELECT COUNT(*) AS cnt FROM pc_expenses WHERE company_id=$1 AND status='submitted' ${projFilter}`, [cid]
    );

    res.json({
      balance: balance.rows[0],
      pending_requests: Number(pending.rows[0]?.pending_requests || 0),
      pending_expenses: Number(pendingExpQ.rows[0]?.cnt || 0),
      monthly_trend: monthly.rows,
      site_wise: siteWise.rows,
      categories: categories.rows,
      recent_requests: recentReq.rows,
      recent_expenses: recentExp.rows,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── MASTERS: Accounts ──────────────────────────────────────────────────────────
router.get('/accounts', async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT a.*, p.name AS project_name,
         c.custodian_name, c.designation
       FROM pc_accounts a
       LEFT JOIN projects p ON p.id = a.project_id
       LEFT JOIN pc_custodians c ON c.id = a.custodian_id
       WHERE a.company_id=$1 ORDER BY a.account_name`, [req.user.company_id]);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/accounts', async (req, res) => {
  try {
    const { account_name, account_code, project_id, site_location, initial_balance, credit_limit, gl_account_code, custodian_id } = req.body;
    if (!account_name) return res.status(400).json({ error: 'account_name required' });
    const { rows: [row] } = await query(
      `INSERT INTO pc_accounts (company_id,account_name,account_code,project_id,site_location,initial_balance,current_balance,credit_limit,gl_account_code,custodian_id,created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$6,$7,$8,$9,$10) RETURNING *`,
      [req.user.company_id, account_name, account_code||null, project_id||null, site_location||null,
       Number(initial_balance)||0, Number(credit_limit)||10000, gl_account_code||null, custodian_id||null, req.user.id]
    );
    res.status(201).json(row);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch('/accounts/:id', async (req, res) => {
  try {
    const { account_name, site_location, credit_limit, custodian_id, status } = req.body;
    const { rows: [row] } = await query(
      `UPDATE pc_accounts SET
         account_name=COALESCE($1,account_name), site_location=COALESCE($2,site_location),
         credit_limit=COALESCE($3,credit_limit), custodian_id=COALESCE($4,custodian_id),
         status=COALESCE($5,status), updated_at=NOW()
       WHERE id=$6 AND company_id=$7 RETURNING *`,
      [account_name, site_location, credit_limit, custodian_id, status, req.params.id, req.user.company_id]
    );
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json(row);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── MASTERS: Custodians ────────────────────────────────────────────────────────
router.get('/custodians', async (req, res) => {
  try {
    const cid = req.user.company_id;
    let { rows } = await query(
      `SELECT c.*, p.name AS project_name FROM pc_custodians c
       LEFT JOIN projects p ON p.id = c.project_id
       WHERE c.company_id=$1 ORDER BY c.custodian_name`, [cid]);

    // Auto-seed from active users when no custodians exist yet
    if (rows.length === 0) {
      const users = await query(
        `SELECT id, employee_code, name, designation, department, phone
         FROM users WHERE company_id=$1 AND is_active=true ORDER BY name`, [cid]);
      for (const u of users.rows) {
        await query(
          `INSERT INTO pc_custodians (company_id, custodian_name, employee_code, designation, contact_number, created_by)
           VALUES ($1,$2,$3,$4,$5,$6)
           ON CONFLICT DO NOTHING`,
          [cid, u.name, u.employee_code || null, u.designation || u.department || null, u.phone || null, req.user.id]
        ).catch(() => {});
      }
      const refreshed = await query(
        `SELECT c.*, p.name AS project_name FROM pc_custodians c
         LEFT JOIN projects p ON p.id = c.project_id
         WHERE c.company_id=$1 ORDER BY c.custodian_name`, [cid]);
      rows = refreshed.rows;
    }

    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/custodians', async (req, res) => {
  try {
    let { custodian_name, employee_code, designation, project_id, site_location, spending_limit, contact_number, user_id } = req.body;

    // If linked to a real user account, pull authoritative identity fields from there
    if (user_id) {
      const { rows: [u] } = await query(
        `SELECT name, employee_code, designation, department, phone FROM users WHERE id=$1 AND company_id=$2`,
        [user_id, req.user.company_id]
      );
      if (!u) return res.status(400).json({ error: 'Linked user not found' });
      custodian_name  = custodian_name  || u.name;
      employee_code   = employee_code   || u.employee_code;
      designation      = designation     || u.designation || u.department;
      contact_number  = contact_number  || u.phone;
    }

    if (!custodian_name) return res.status(400).json({ error: 'custodian_name required' });
    const { rows: [row] } = await query(
      `INSERT INTO pc_custodians (company_id,custodian_name,employee_code,designation,project_id,site_location,spending_limit,contact_number,user_id,created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [req.user.company_id, custodian_name, employee_code||null, designation||null, project_id||null,
       site_location||null, Number(spending_limit)||5000, contact_number||null, user_id||null, req.user.id]
    );
    res.status(201).json(row);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch('/custodians/:id', async (req, res) => {
  try {
    const { custodian_name, designation, site_location, spending_limit, status, user_id, employee_code, contact_number } = req.body;
    const { rows: [row] } = await query(
      `UPDATE pc_custodians SET
         custodian_name=COALESCE($1,custodian_name), designation=COALESCE($2,designation),
         site_location=COALESCE($3,site_location), spending_limit=COALESCE($4,spending_limit),
         status=COALESCE($5,status), user_id=COALESCE($6,user_id),
         employee_code=COALESCE($7,employee_code), contact_number=COALESCE($8,contact_number),
         updated_at=NOW()
       WHERE id=$9 AND company_id=$10 RETURNING *`,
      [custodian_name, designation, site_location, spending_limit, status, user_id, employee_code, contact_number,
       req.params.id, req.user.company_id]
    );
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json(row);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── MASTERS: Categories ────────────────────────────────────────────────────────
router.get('/categories', async (req, res) => {
  try {
    // DISTINCT ON category_code: prefer company-owned rows over nil-UUID defaults
    // ORDER BY company_id DESC puts real UUIDs before the nil UUID
    const { rows } = await query(
      `SELECT DISTINCT ON (COALESCE(category_code, category_name)) *
       FROM pc_expense_categories
       WHERE (company_id=$1 OR company_id='00000000-0000-0000-0000-000000000000')
         AND is_active = true
       ORDER BY COALESCE(category_code, category_name),
                (company_id = $1)::int DESC,
                created_at ASC`,
      [req.user.company_id]);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/categories', async (req, res) => {
  try {
    const { category_code, category_name, construction_type, gl_account, requires_receipt } = req.body;
    if (!category_name) return res.status(400).json({ error: 'category_name required' });
    const { rows: [row] } = await query(
      `INSERT INTO pc_expense_categories (company_id,category_code,category_name,construction_type,gl_account,requires_receipt)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [req.user.company_id, category_code||null, category_name, construction_type||null, gl_account||null, !!requires_receipt]
    );
    res.status(201).json(row);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch('/categories/:id', async (req, res) => {
  try {
    const { category_name, category_code, construction_type, gl_account, requires_receipt, is_active } = req.body;
    const { rows: [row] } = await query(
      `UPDATE pc_expense_categories SET
         category_name=COALESCE($1,category_name),
         category_code=COALESCE($2,category_code),
         construction_type=COALESCE($3,construction_type),
         gl_account=COALESCE($4,gl_account),
         requires_receipt=COALESCE($5,requires_receipt),
         is_active=COALESCE($6,is_active)
       WHERE id=$7 AND (company_id=$8 OR company_id='00000000-0000-0000-0000-000000000000') RETURNING *`,
      [category_name, category_code, construction_type, gl_account,
       requires_receipt != null ? !!requires_receipt : null,
       is_active != null ? !!is_active : null,
       req.params.id, req.user.company_id]
    );
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json(row);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Topup a cash account balance directly (admin action)
router.post('/accounts/:id/topup', async (req, res) => {
  try {
    const { amount, remarks } = req.body;
    if (!amount || Number(amount) <= 0) return res.status(400).json({ error: 'amount required' });
    const { rows: [row] } = await query(
      `UPDATE pc_accounts SET current_balance=current_balance+$1,updated_at=NOW()
       WHERE id=$2 AND company_id=$3 RETURNING *`,
      [Number(amount), req.params.id, req.user.company_id]
    );
    if (!row) return res.status(404).json({ error: 'Not found' });
    await auditLog(req.user.company_id, 'pc_account', row.id, 'topup', null, null, `Top-up ₹${amount}${remarks ? ' — ' + remarks : ''}`, req.user.id);
    res.json(row);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── TRANSACTIONS: Requests ─────────────────────────────────────────────────────
router.get('/requests', async (req, res) => {
  try {
    const { project_id, status, from_date, to_date, custodian_id } = req.query;
    const params = [req.user.company_id];
    let where = 'r.company_id=$1';
    if (project_id)  { params.push(project_id);  where += ` AND r.project_id=$${params.length}`; }
    if (status)      { params.push(status);       where += ` AND r.status=$${params.length}`; }
    if (custodian_id){ params.push(custodian_id); where += ` AND r.custodian_id=$${params.length}`; }
    if (from_date)   { params.push(from_date);    where += ` AND r.created_at::date>=$${params.length}`; }
    if (to_date)     { params.push(to_date);      where += ` AND r.created_at::date<=$${params.length}`; }
    const { rows } = await query(
      `SELECT r.*, p.name AS project_name, c.custodian_name,
         u1.name AS requested_by_name, u2.name AS approved_by_name
       FROM pc_requests r
       LEFT JOIN projects p ON p.id = r.project_id
       LEFT JOIN pc_custodians c ON c.id = r.custodian_id
       LEFT JOIN users u1 ON u1.id = r.requested_by
       LEFT JOIN users u2 ON u2.id = r.approved_by
       WHERE ${where} ORDER BY r.created_at DESC`, params);
    res.json({ data: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/requests', async (req, res) => {
  try {
    const { project_id, site_location, custodian_id, account_id, purpose, amount_requested, priority, required_by_date, remarks } = req.body;
    if (!purpose || !amount_requested) return res.status(400).json({ error: 'purpose and amount_requested required' });
    const request_number = await nextSeq('pc_requests', 'PCR', req.user.company_id);
    const { rows: [row] } = await query(
      `INSERT INTO pc_requests (company_id,request_number,project_id,site_location,custodian_id,account_id,purpose,amount_requested,priority,required_by_date,remarks,status,requested_by,requested_at,created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'draft',$12,NOW(),$12) RETURNING *`,
      [req.user.company_id, request_number, project_id||null, site_location||null, custodian_id||null,
       account_id||null, purpose, Number(amount_requested), priority||'normal', required_by_date||null, remarks||null, req.user.id]
    );
    await auditLog(req.user.company_id, 'pc_request', row.id, 'created', null, 'draft', null, req.user.id);
    res.status(201).json(row);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch('/requests/:id', async (req, res) => {
  try {
    const { purpose, amount_requested, priority, required_by_date, site_location, remarks } = req.body;
    const { rows: [row] } = await query(
      `UPDATE pc_requests SET
         purpose=COALESCE($1,purpose), amount_requested=COALESCE($2,amount_requested),
         priority=COALESCE($3,priority), required_by_date=COALESCE($4,required_by_date),
         site_location=COALESCE($5,site_location), remarks=COALESCE($6,remarks), updated_at=NOW()
       WHERE id=$7 AND company_id=$8 AND status='draft' RETURNING *`,
      [purpose, amount_requested, priority, required_by_date, site_location, remarks, req.params.id, req.user.company_id]
    );
    if (!row) return res.status(404).json({ error: 'Not found or not editable' });
    res.json(row);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Submit a draft request
router.post('/requests/:id/submit', async (req, res) => {
  try {
    const { rows: [row] } = await query(
      `UPDATE pc_requests SET status='submitted', requested_at=NOW(), updated_at=NOW()
       WHERE id=$1 AND company_id=$2 AND status='draft' RETURNING *`,
      [req.params.id, req.user.company_id]
    );
    if (!row) return res.status(404).json({ error: 'Not found or not in draft' });
    await auditLog(req.user.company_id, 'pc_request', row.id, 'submitted', 'draft', 'submitted', null, req.user.id);
    res.json(row);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Approve / Reject request
router.post('/requests/:id/approve', async (req, res) => {
  try {
    const { action, amount_approved, remarks } = req.body; // action: 'approve' | 'reject'
    if (!['approve', 'reject'].includes(action)) return res.status(400).json({ error: 'action must be approve or reject' });
    const newStatus = action === 'approve' ? 'approved' : 'rejected';
    const { rows: [row] } = await query(
      `UPDATE pc_requests SET
         status=$1, amount_approved=$2,
         approved_by=$3, approved_at=NOW(),
         approval_remarks=$4, rejection_reason=$5, updated_at=NOW()
       WHERE id=$6 AND company_id=$7 AND status='submitted' RETURNING *`,
      [newStatus, amount_approved||null, req.user.id, action==='approve'?remarks:null, action==='reject'?remarks:null, req.params.id, req.user.company_id]
    );
    if (!row) return res.status(404).json({ error: 'Not found or not pending' });
    await auditLog(req.user.company_id, 'pc_request', row.id, action, 'submitted', newStatus, remarks, req.user.id);
    res.json(row);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Issue cash against approved request
router.post('/requests/:id/issue', async (req, res) => {
  try {
    const { amount_issued, payment_mode, reference_number, remarks } = req.body;
    if (!amount_issued) return res.status(400).json({ error: 'amount_issued required' });
    const { rows: [row] } = await query(
      `UPDATE pc_requests SET
         status='issued', amount_issued=$1, payment_mode=$2,
         reference_number=$3, issued_by=$4, issued_at=NOW(),
         remarks=COALESCE($5,remarks), updated_at=NOW()
       WHERE id=$6 AND company_id=$7 AND status='approved' RETURNING *`,
      [Number(amount_issued), payment_mode||'cash', reference_number||null, req.user.id, remarks, req.params.id, req.user.company_id]
    );
    if (!row) return res.status(404).json({ error: 'Not found or not approved' });
    // Update custodian holding
    if (row.custodian_id) {
      await query(`UPDATE pc_custodians SET current_holding=current_holding+$1,updated_at=NOW() WHERE id=$2`,
        [Number(amount_issued), row.custodian_id]).catch(()=>{});
    }
    // Deduct from account balance
    if (row.account_id) {
      await query(`UPDATE pc_accounts SET current_balance=current_balance-$1,updated_at=NOW() WHERE id=$2`,
        [Number(amount_issued), row.account_id]).catch(()=>{});
    }
    await auditLog(req.user.company_id, 'pc_request', row.id, 'issued', 'approved', 'issued', `Issued ₹${amount_issued}`, req.user.id);
    res.json(row);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── TRANSACTIONS: Expenses ─────────────────────────────────────────────────────
router.get('/expenses', async (req, res) => {
  try {
    const { project_id, custodian_id, category_id, status, from_date, to_date } = req.query;
    const params = [req.user.company_id];
    let where = 'e.company_id=$1';
    if (project_id)  { params.push(project_id);  where += ` AND e.project_id=$${params.length}`; }
    if (custodian_id){ params.push(custodian_id); where += ` AND e.custodian_id=$${params.length}`; }
    if (category_id) { params.push(category_id); where += ` AND e.category_id=$${params.length}`; }
    if (status)      { params.push(status);       where += ` AND e.status=$${params.length}`; }
    if (from_date)   { params.push(from_date);    where += ` AND e.expense_date>=$${params.length}`; }
    if (to_date)     { params.push(to_date);      where += ` AND e.expense_date<=$${params.length}`; }
    const { rows } = await query(
      `SELECT e.*, c.category_name, c.construction_type,
         cust.custodian_name, p.name AS project_name,
         u1.name AS submitted_by_name, u2.name AS approved_by_name
       FROM pc_expenses e
       LEFT JOIN pc_expense_categories c ON c.id = e.category_id
       LEFT JOIN pc_custodians cust ON cust.id = e.custodian_id
       LEFT JOIN projects p ON p.id = e.project_id
       LEFT JOIN users u1 ON u1.id = e.submitted_by
       LEFT JOIN users u2 ON u2.id = e.approved_by
       WHERE ${where} ORDER BY e.expense_date DESC, e.created_at DESC`, params);
    res.json({ data: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/expenses', async (req, res) => {
  try {
    const { request_id, project_id, site_location, custodian_id, category_id,
            expense_date, description, amount, payment_mode, bill_number, bill_date, vendor_name, remarks } = req.body;
    if (!expense_date || !description || !amount) return res.status(400).json({ error: 'expense_date, description, amount required' });
    const voucher_number = await nextSeq('pc_expenses', 'PCE', req.user.company_id);
    const { rows: [row] } = await query(
      `INSERT INTO pc_expenses (company_id,voucher_number,request_id,project_id,site_location,custodian_id,category_id,expense_date,description,amount,payment_mode,bill_number,bill_date,vendor_name,remarks,status,created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,'draft',$16) RETURNING *`,
      [req.user.company_id, voucher_number, request_id||null, project_id||null, site_location||null,
       custodian_id||null, category_id||null, expense_date, description, Number(amount),
       payment_mode||'cash', bill_number||null, bill_date||null, vendor_name||null, remarks||null, req.user.id]
    );
    res.status(201).json(row);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch('/expenses/:id', async (req, res) => {
  try {
    const { description, amount, category_id, expense_date, bill_number, vendor_name, remarks } = req.body;
    const { rows: [row] } = await query(
      `UPDATE pc_expenses SET
         description=COALESCE($1,description), amount=COALESCE($2,amount),
         category_id=COALESCE($3,category_id), expense_date=COALESCE($4,expense_date),
         bill_number=COALESCE($5,bill_number), vendor_name=COALESCE($6,vendor_name),
         remarks=COALESCE($7,remarks), updated_at=NOW()
       WHERE id=$8 AND company_id=$9 AND status='draft' RETURNING *`,
      [description, amount, category_id, expense_date, bill_number, vendor_name, remarks, req.params.id, req.user.company_id]
    );
    if (!row) return res.status(404).json({ error: 'Not found or not editable' });
    res.json(row);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/expenses/:id/submit', async (req, res) => {
  try {
    const { rows: [row] } = await query(
      `UPDATE pc_expenses SET status='submitted',submitted_by=$1,submitted_at=NOW(),updated_at=NOW()
       WHERE id=$2 AND company_id=$3 AND status='draft' RETURNING *`,
      [req.user.id, req.params.id, req.user.company_id]
    );
    if (!row) return res.status(404).json({ error: 'Not found or not in draft' });
    await auditLog(req.user.company_id, 'pc_expense', row.id, 'submitted', 'draft', 'submitted', null, req.user.id);
    res.json(row);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/expenses/:id/approve', async (req, res) => {
  try {
    const { action, remarks } = req.body;
    if (!['approve', 'reject'].includes(action)) return res.status(400).json({ error: 'invalid action' });
    const newStatus = action === 'approve' ? 'approved' : 'rejected';
    const { rows: [row] } = await query(
      `UPDATE pc_expenses SET
         status=$1, approved_by=$2, approved_at=NOW(),
         rejection_reason=$3, updated_at=NOW()
       WHERE id=$4 AND company_id=$5 AND status='submitted' RETURNING *`,
      [newStatus, req.user.id, action==='reject'?remarks:null, req.params.id, req.user.company_id]
    );
    if (!row) return res.status(404).json({ error: 'Not found or not pending' });
    // Update custodian holding on approval
    if (action === 'approve' && row.custodian_id) {
      await query(`UPDATE pc_custodians SET current_holding=GREATEST(0,current_holding-$1),updated_at=NOW() WHERE id=$2`,
        [row.amount, row.custodian_id]).catch(()=>{});
    }
    await auditLog(req.user.company_id, 'pc_expense', row.id, action, 'submitted', newStatus, remarks, req.user.id);

    // Auto-post JV on approval: Dr Expense A/c (category GL or fallback), Cr Cash in Hand (1000)
    if (action === 'approve') {
      const catRow = row.category_id
        ? await query(`SELECT category_name, gl_account FROM pc_expense_categories WHERE id=$1`, [row.category_id]).then(r => r.rows[0])
        : null;
      // Use category GL account if it's a valid 4-digit COA code, else fallback to 6100
      const expCode = catRow?.gl_account?.match(/^\d{4}$/) ? catRow.gl_account : '6100';
      const catName = catRow?.category_name || 'Petty Cash Expense';
      postAutoJournalStandalone({
        companyId: req.user.company_id,
        userId:    req.user.id,
        entryDate: row.expense_date,
        reference: row.voucher_number,
        narration: `Petty cash — ${row.description}`,
        source:    'auto_petty_cash',
        lines: [
          { code: expCode, debit:  row.amount, description: `${catName}: ${row.description}` },
          { code: '1000',  credit: row.amount, description: `Petty cash paid — ${row.voucher_number}` },
        ],
      }).catch(() => {});
    }

    res.json(row);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/expenses/:id', async (req, res) => {
  try {
    const { rowCount } = await query(
      `DELETE FROM pc_expenses WHERE id=$1 AND company_id=$2 AND status='draft'`,
      [req.params.id, req.user.company_id]
    );
    if (!rowCount) return res.status(404).json({ error: 'Not found or not deletable' });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── TRANSACTIONS: Settlements ──────────────────────────────────────────────────
router.get('/settlements', async (req, res) => {
  try {
    const { project_id, custodian_id, status } = req.query;
    const params = [req.user.company_id];
    let where = 's.company_id=$1';
    if (project_id)  { params.push(project_id);  where += ` AND s.project_id=$${params.length}`; }
    if (custodian_id){ params.push(custodian_id); where += ` AND s.custodian_id=$${params.length}`; }
    if (status)      { params.push(status);       where += ` AND s.status=$${params.length}`; }
    const { rows } = await query(
      `SELECT s.*, p.name AS project_name, c.custodian_name,
         u.name AS settled_by_name
       FROM pc_settlements s
       LEFT JOIN projects p ON p.id = s.project_id
       LEFT JOIN pc_custodians c ON c.id = s.custodian_id
       LEFT JOIN users u ON u.id = s.settled_by
       WHERE ${where} ORDER BY s.created_at DESC`, params);
    res.json({ data: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/settlements', async (req, res) => {
  try {
    const { project_id, custodian_id, account_id, settlement_date, period_from, period_to,
            opening_balance, total_issued, total_expenses, total_returned, remarks } = req.body;
    if (!settlement_date) return res.status(400).json({ error: 'settlement_date required' });
    const settlement_number = await nextSeq('pc_settlements', 'PCS', req.user.company_id);
    const closing = (Number(opening_balance)||0) + (Number(total_issued)||0) - (Number(total_expenses)||0) - (Number(total_returned)||0);
    const variance = closing - (Number(total_returned)||0);
    const { rows: [row] } = await query(
      `INSERT INTO pc_settlements (company_id,settlement_number,project_id,custodian_id,account_id,settlement_date,period_from,period_to,opening_balance,total_issued,total_expenses,total_returned,closing_balance,variance,remarks,status,settled_by,settled_at,created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,'draft',$16,NOW(),$16) RETURNING *`,
      [req.user.company_id, settlement_number, project_id||null, custodian_id||null, account_id||null,
       settlement_date, period_from||null, period_to||null, Number(opening_balance)||0,
       Number(total_issued)||0, Number(total_expenses)||0, Number(total_returned)||0,
       closing, variance, remarks||null, req.user.id]
    );
    res.status(201).json(row);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/settlements/:id/verify', async (req, res) => {
  try {
    const { remarks } = req.body;
    const { rows: [row] } = await query(
      `UPDATE pc_settlements SET status='verified',verified_by=$1,verified_at=NOW(),remarks=COALESCE($2,remarks),updated_at=NOW()
       WHERE id=$3 AND company_id=$4 AND status='draft' RETURNING *`,
      [req.user.id, remarks, req.params.id, req.user.company_id]
    );
    if (!row) return res.status(404).json({ error: 'Not found' });
    await auditLog(req.user.company_id, 'pc_settlement', row.id, 'verified', 'draft', 'verified', remarks, req.user.id);
    res.json(row);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── TRANSACTIONS: Transfers ────────────────────────────────────────────────────
router.get('/transfers', async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT t.*, fa.account_name AS from_account, ta.account_name AS to_account,
         fp.name AS from_project, tp.name AS to_project, u.name AS created_by_name
       FROM pc_transfers t
       LEFT JOIN pc_accounts fa ON fa.id = t.from_account_id
       LEFT JOIN pc_accounts ta ON ta.id = t.to_account_id
       LEFT JOIN projects fp ON fp.id = t.from_project_id
       LEFT JOIN projects tp ON tp.id = t.to_project_id
       LEFT JOIN users u ON u.id = t.created_by
       WHERE t.company_id=$1 ORDER BY t.created_at DESC`, [req.user.company_id]);
    res.json({ data: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/transfers', async (req, res) => {
  try {
    const { from_account_id, to_account_id, from_project_id, to_project_id, from_site, to_site, amount, transfer_date, purpose, remarks } = req.body;
    if (!amount || !transfer_date) return res.status(400).json({ error: 'amount and transfer_date required' });
    const transfer_number = await nextSeq('pc_transfers', 'PCT', req.user.company_id);
    const { rows: [row] } = await query(
      `INSERT INTO pc_transfers (company_id,transfer_number,from_account_id,to_account_id,from_project_id,to_project_id,from_site,to_site,amount,transfer_date,purpose,status,remarks,created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'draft',$12,$13) RETURNING *`,
      [req.user.company_id, transfer_number, from_account_id||null, to_account_id||null,
       from_project_id||null, to_project_id||null, from_site||null, to_site||null,
       Number(amount), transfer_date, purpose||null, remarks||null, req.user.id]
    );
    res.status(201).json(row);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/transfers/:id/approve', async (req, res) => {
  try {
    const { rows: [row] } = await query(
      `UPDATE pc_transfers SET status='approved',approved_by=$1,approved_at=NOW()
       WHERE id=$2 AND company_id=$3 AND status='draft' RETURNING *`,
      [req.user.id, req.params.id, req.user.company_id]
    );
    if (!row) return res.status(404).json({ error: 'Not found' });
    // Update balances
    if (row.from_account_id)
      await query(`UPDATE pc_accounts SET current_balance=current_balance-$1,updated_at=NOW() WHERE id=$2`,
        [row.amount, row.from_account_id]).catch(()=>{});
    if (row.to_account_id)
      await query(`UPDATE pc_accounts SET current_balance=current_balance+$1,updated_at=NOW() WHERE id=$2`,
        [row.amount, row.to_account_id]).catch(()=>{});
    res.json(row);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── TRANSACTIONS: Adjustments ──────────────────────────────────────────────────
router.get('/adjustments', async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT a.*, acct.account_name, p.name AS project_name, u.name AS created_by_name
       FROM pc_adjustments a
       LEFT JOIN pc_accounts acct ON acct.id = a.account_id
       LEFT JOIN projects p ON p.id = a.project_id
       LEFT JOIN users u ON u.id = a.created_by
       WHERE a.company_id=$1 ORDER BY a.created_at DESC`, [req.user.company_id]);
    res.json({ data: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/adjustments', async (req, res) => {
  try {
    const { account_id, project_id, adjustment_date, adjustment_type, amount, reason, remarks } = req.body;
    if (!adjustment_type || !amount || !reason) return res.status(400).json({ error: 'adjustment_type, amount, reason required' });
    const adjustment_number = await nextSeq('pc_adjustments', 'PCA', req.user.company_id);
    const { rows: [row] } = await query(
      `INSERT INTO pc_adjustments (company_id,adjustment_number,account_id,project_id,adjustment_date,adjustment_type,amount,reason,remarks,status,created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'draft',$10) RETURNING *`,
      [req.user.company_id, adjustment_number, account_id||null, project_id||null,
       adjustment_date||new Date().toISOString().slice(0,10), adjustment_type, Number(amount), reason, remarks||null, req.user.id]
    );
    res.status(201).json(row);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/adjustments/:id/approve', async (req, res) => {
  try {
    const { rows: [row] } = await query(
      `UPDATE pc_adjustments SET status='approved',approved_by=$1,approved_at=NOW()
       WHERE id=$2 AND company_id=$3 AND status='draft' RETURNING *`,
      [req.user.id, req.params.id, req.user.company_id]
    );
    if (!row) return res.status(404).json({ error: 'Not found' });
    if (row.account_id) {
      const delta = row.adjustment_type === 'credit' ? row.amount : -row.amount;
      await query(`UPDATE pc_accounts SET current_balance=current_balance+$1,updated_at=NOW() WHERE id=$2`,
        [delta, row.account_id]).catch(()=>{});
    }
    res.json(row);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── APPROVALS QUEUE ────────────────────────────────────────────────────────────
router.get('/approvals/pending', async (req, res) => {
  try {
    const cid = req.user.company_id;
    const [requests, expenses] = await Promise.all([
      query(`SELECT r.*, p.name AS project_name, c.custodian_name, u.name AS requested_by_name
             FROM pc_requests r
             LEFT JOIN projects p ON p.id=r.project_id
             LEFT JOIN pc_custodians c ON c.id=r.custodian_id
             LEFT JOIN users u ON u.id=r.requested_by
             WHERE r.company_id=$1 AND r.status='submitted'
             ORDER BY CASE WHEN r.priority='emergency' THEN 0 WHEN r.priority='urgent' THEN 1 ELSE 2 END, r.requested_at`, [cid]),
      query(`SELECT e.*, c.category_name, p.name AS project_name, cust.custodian_name, u.name AS submitted_by_name
             FROM pc_expenses e
             LEFT JOIN pc_expense_categories c ON c.id=e.category_id
             LEFT JOIN projects p ON p.id=e.project_id
             LEFT JOIN pc_custodians cust ON cust.id=e.custodian_id
             LEFT JOIN users u ON u.id=e.submitted_by
             WHERE e.company_id=$1 AND e.status='submitted'
             ORDER BY e.submitted_at`, [cid]),
    ]);
    res.json({ requests: requests.rows, expenses: expenses.rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── REPORTS ────────────────────────────────────────────────────────────────────
router.get('/reports/cash-book', async (req, res) => {
  try {
    const { project_id, from_date, to_date, account_id } = req.query;
    const params = [req.user.company_id];
    let where = 'company_id=$1';
    if (project_id) { params.push(project_id); where += ` AND project_id=$${params.length}`; }
    if (from_date)  { params.push(from_date);  where += ` AND expense_date>=$${params.length}`; }
    if (to_date)    { params.push(to_date);    where += ` AND expense_date<=$${params.length}`; }

    const expenses = await query(
      `SELECT e.expense_date AS txn_date, 'Expense' AS txn_type, e.voucher_number AS ref_number,
         e.description, e.amount AS debit, 0 AS credit, c.category_name, e.site_location,
         p.name AS project_name, cust.custodian_name
       FROM pc_expenses e
       LEFT JOIN pc_expense_categories c ON c.id=e.category_id
       LEFT JOIN projects p ON p.id=e.project_id
       LEFT JOIN pc_custodians cust ON cust.id=e.custodian_id
       WHERE e.${where} AND e.status='approved' ORDER BY e.expense_date`, params);

    const issues = await query(
      `SELECT r.issued_at::date AS txn_date, 'Cash Issue' AS txn_type, r.request_number AS ref_number,
         r.purpose AS description, 0 AS debit, r.amount_issued AS credit, NULL AS category_name,
         r.site_location, p.name AS project_name, c.custodian_name
       FROM pc_requests r
       LEFT JOIN projects p ON p.id=r.project_id
       LEFT JOIN pc_custodians c ON c.id=r.custodian_id
       WHERE r.${where} AND r.status='issued' ORDER BY r.issued_at`, params);

    const rows = [...expenses.rows, ...issues.rows].sort((a, b) =>
      new Date(a.txn_date) - new Date(b.txn_date));

    // running balance
    let balance = 0;
    const withBalance = rows.map(r => {
      balance += Number(r.credit) - Number(r.debit);
      return { ...r, running_balance: balance };
    });

    res.json({ data: withBalance });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/reports/expense-register', async (req, res) => {
  try {
    const { project_id, custodian_id, category_id, from_date, to_date, status } = req.query;
    const params = [req.user.company_id];
    let where = 'e.company_id=$1';
    if (project_id)  { params.push(project_id);  where += ` AND e.project_id=$${params.length}`; }
    if (custodian_id){ params.push(custodian_id); where += ` AND e.custodian_id=$${params.length}`; }
    if (category_id) { params.push(category_id); where += ` AND e.category_id=$${params.length}`; }
    if (from_date)   { params.push(from_date);    where += ` AND e.expense_date>=$${params.length}`; }
    if (to_date)     { params.push(to_date);      where += ` AND e.expense_date<=$${params.length}`; }
    if (status)      { params.push(status);       where += ` AND e.status=$${params.length}`; }
    const { rows } = await query(
      `SELECT e.*, c.category_name, c.construction_type, p.name AS project_name,
         cust.custodian_name, u.name AS submitted_by_name
       FROM pc_expenses e
       LEFT JOIN pc_expense_categories c ON c.id=e.category_id
       LEFT JOIN projects p ON p.id=e.project_id
       LEFT JOIN pc_custodians cust ON cust.id=e.custodian_id
       LEFT JOIN users u ON u.id=e.submitted_by
       WHERE ${where} ORDER BY e.expense_date DESC`, params);
    res.json({ data: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/reports/site-wise', async (req, res) => {
  try {
    const { from_date, to_date } = req.query;
    const params = [req.user.company_id];
    let where = 'e.company_id=$1 AND e.status=\'approved\'';
    if (from_date) { params.push(from_date); where += ` AND e.expense_date>=$${params.length}`; }
    if (to_date)   { params.push(to_date);   where += ` AND e.expense_date<=$${params.length}`; }
    const { rows } = await query(
      `SELECT COALESCE(e.site_location,'Unassigned') AS site_location,
         p.name AS project_name, COUNT(*)::int AS expense_count,
         SUM(e.amount) AS total_amount,
         MAX(e.expense_date) AS last_expense_date
       FROM pc_expenses e
       LEFT JOIN projects p ON p.id=e.project_id
       WHERE ${where}
       GROUP BY COALESCE(e.site_location,'Unassigned'), p.name
       ORDER BY SUM(e.amount) DESC`, params);
    res.json({ data: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/reports/custodian-wise', async (req, res) => {
  try {
    const { from_date, to_date, project_id } = req.query;
    const params = [req.user.company_id];
    let where = 'e.company_id=$1 AND e.status=\'approved\'';
    if (project_id) { params.push(project_id); where += ` AND e.project_id=$${params.length}`; }
    if (from_date)  { params.push(from_date);  where += ` AND e.expense_date>=$${params.length}`; }
    if (to_date)    { params.push(to_date);    where += ` AND e.expense_date<=$${params.length}`; }
    const { rows } = await query(
      `SELECT cust.custodian_name, cust.designation, cust.site_location,
         p.name AS project_name, COUNT(e.id)::int AS expense_count,
         SUM(e.amount) AS total_expenses, cust.spending_limit, cust.current_holding
       FROM pc_expenses e
       JOIN pc_custodians cust ON cust.id=e.custodian_id
       LEFT JOIN projects p ON p.id=e.project_id
       WHERE ${where}
       GROUP BY cust.id, cust.custodian_name, cust.designation, cust.site_location, p.name, cust.spending_limit, cust.current_holding
       ORDER BY SUM(e.amount) DESC`, params);
    res.json({ data: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/reports/category-wise', async (req, res) => {
  try {
    const { from_date, to_date, project_id } = req.query;
    const params = [req.user.company_id];
    let where = 'e.company_id=$1 AND e.status=\'approved\'';
    if (project_id) { params.push(project_id); where += ` AND e.project_id=$${params.length}`; }
    if (from_date)  { params.push(from_date);  where += ` AND e.expense_date>=$${params.length}`; }
    if (to_date)    { params.push(to_date);    where += ` AND e.expense_date<=$${params.length}`; }
    const { rows } = await query(
      `SELECT c.category_name, c.construction_type,
         COUNT(e.id)::int AS expense_count, SUM(e.amount) AS total_amount,
         ROUND(SUM(e.amount)*100.0/NULLIF(SUM(SUM(e.amount)) OVER (),0),1) AS pct_of_total
       FROM pc_expenses e
       JOIN pc_expense_categories c ON c.id=e.category_id
       WHERE ${where}
       GROUP BY c.category_name, c.construction_type
       ORDER BY SUM(e.amount) DESC`, params);
    res.json({ data: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/reports/pending-settlement', async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT cust.custodian_name, cust.site_location, p.name AS project_name,
         cust.current_holding,
         COUNT(e.id)::int AS unapproved_expenses,
         COALESCE(SUM(e.amount) FILTER (WHERE e.status='draft'), 0) AS draft_amount,
         COALESCE(SUM(e.amount) FILTER (WHERE e.status='submitted'), 0) AS pending_amount
       FROM pc_custodians cust
       LEFT JOIN projects p ON p.id=cust.project_id
       LEFT JOIN pc_expenses e ON e.custodian_id=cust.id AND e.status IN ('draft','submitted')
       WHERE cust.company_id=$1 AND cust.status='active' AND cust.current_holding > 0
       GROUP BY cust.id, cust.custodian_name, cust.site_location, p.name, cust.current_holding
       ORDER BY cust.current_holding DESC`, [req.user.company_id]);
    res.json({ data: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/reports/audit-trail', async (req, res) => {
  try {
    const { entity_type, from_date, to_date } = req.query;
    const params = [req.user.company_id];
    let where = 'a.company_id=$1';
    if (entity_type) { params.push(entity_type); where += ` AND a.entity_type=$${params.length}`; }
    if (from_date)   { params.push(from_date);   where += ` AND a.performed_at::date>=$${params.length}`; }
    if (to_date)     { params.push(to_date);     where += ` AND a.performed_at::date<=$${params.length}`; }
    const { rows } = await query(
      `SELECT a.*, u.name AS performed_by_name
       FROM pc_audit_log a
       LEFT JOIN users u ON u.id=a.performed_by
       WHERE ${where} ORDER BY a.performed_at DESC LIMIT 500`, params);
    res.json({ data: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Legacy compatibility
router.get('/summary', async (req, res) => {
  const { project_id, from_date, to_date } = req.query;
  let sql = `SELECT COALESCE(SUM(CASE WHEN entry_type='expense' THEN amount ELSE 0 END),0) AS total_expenses,
               COALESCE(SUM(CASE WHEN entry_type='replenishment' THEN amount ELSE 0 END),0) AS total_replenishment,
               COUNT(CASE WHEN entry_type='expense' THEN 1 END)::INT AS expense_count
             FROM petty_cash_entries e WHERE company_id=$1`;
  const params = [req.user.company_id]; let i = 2;
  if (project_id) { sql += ` AND project_id=$${i++}`; params.push(project_id); }
  if (from_date)  { sql += ` AND entry_date>=$${i++}`; params.push(from_date); }
  if (to_date)    { sql += ` AND entry_date<=$${i++}`; params.push(to_date); }
  const r = await query(sql, params).catch(() => ({ rows: [{}] }));
  res.json({ data: r.rows[0] });
});

module.exports = router;
