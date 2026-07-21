// src/routes/tqs-bills.routes.js
const express = require('express');
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');
const wa      = require('../services/whatsapp.service');
const { authenticate } = require('../middleware/auth');
const { loadProjectScope, userCanAccessProject, applyProjectScope, scopedProjectIds } = require('../middleware/projectScope');
const { query, withTransaction } = require('../config/database');
const { uploadToOneDrive, getFreshDownloadUrl, isConfigured } = require('../services/onedrive.service');
const {
  billOutstandingSql,
  getVendorLiabilitySummary,
} = require('../services/tqsLiability.service');
const { sendMail } = require('../services/mail.service');
const logger = require('../utils/logger');
const { runSchemaInit } = require('../utils/schemaInit');
const { postAutoJournal, postAutoJournalStandalone } = require('../services/journalAutoPost');
const { BOQ_COST_HEADS, classifyItemCostHead } = require('../constants/boqCostHeads');


const router = express.Router();

// Public verification endpoint (no auth — QR scan)
router.get('/public/verify/:id', async (req, res) => {
  try {
    const result = await query(
      `SELECT b.*, v.name AS vendor_name, p.name AS project_name, p.project_code,
              u.name AS created_by_name
       FROM tqs_bills b
       LEFT JOIN vendors v ON b.vendor_id = v.id
       LEFT JOIN projects p ON b.project_id = p.id
       LEFT JOIN users u ON b.created_by = u.id
       WHERE b.id = $1`, [req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Bill not found' });
    res.json({ data: result.rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.use(authenticate);
router.use(loadProjectScope);

// If this bill formalizes a GRN that already got a provisional "goods received,
// not invoiced" JV (posted at QC approval before any bill existed), the bill's
// JV must clear that liability (2010) instead of re-booking the expense — else
// the same goods cost is counted twice. Returns null when no provisional JV
// applies, so the caller falls back to its normal expense code.
async function resolveGrinClearingCode(companyId, grnId) {
  if (!grnId) return null;
  try {
    const grnRow = await query(`SELECT grn_number FROM grn WHERE id = $1`, [grnId]);
    const grnNumber = grnRow.rows[0]?.grn_number;
    if (!grnNumber) return null;
    const je = await query(
      `SELECT 1 FROM journal_entries WHERE company_id = $1 AND source = 'auto_grn_provisional' AND reference = $2 LIMIT 1`,
      [companyId, grnNumber]
    );
    return je.rows.length ? '2010' : null;
  } catch (_) {
    return null;
  }
}

const STAGE_DEPT_RULES = {
  stores:           ['store'],
  document_control: ['document controller', 'document', 'controller', 'doc'],
  qs:               ['qs', 'quantity'],
  accounts:         ['account', 'finance'],
  procurement:      ['procure', 'purchase'],
  qs_sign:          ['qs', 'quantity'],
  payment:          ['account', 'finance'],
};

// Roles that are granted access to specific stages regardless of department
const STAGE_ROLE_RULES = {
  stores:           ['stores_manager', 'store_keeper'],
  document_control: ['document_controller'],
  qs:               ['qs_engineer', 'billing_engineer', 'contracts_manager'],
  accounts:         ['accountant', 'accounts_manager', 'finance_manager'],
  procurement:      ['procurement_manager', 'purchase_executive'],
  qs_sign:          ['qs_engineer', 'billing_engineer', 'contracts_manager'],
  payment:          ['accountant', 'accounts_manager', 'finance_manager'],
};

const DQS_FULL_ACCESS_ROLES = [
  'super_admin', 'admin', 'management', 'project_manager',
  'planning_engineer', 'site_engineer',
  'tender_manager', 'hr', 'it_admin',
];

const PO_ALERT_THRESHOLD_PCT = Number(process.env.PO_ALERT_THRESHOLD_PCT || 90);

async function getAccessibleBill(req, billId, client = { query }) {
  const { rows } = await client.query(
    `SELECT id, project_id, company_id, vendor_id, vendor_name, bill_type, sl_number, inv_number
     FROM tqs_bills
     WHERE id = $1 AND (company_id = $2 OR company_id IS NULL) AND is_deleted = FALSE`,
    [billId, req.user.company_id]
  );
  const bill = rows[0];
  if (!bill) {
    const err = new Error('Bill not found');
    err.statusCode = 404;
    throw err;
  }
  if (!userCanAccessProject(req, bill.project_id)) {
    const err = new Error('Access denied for this project.');
    err.statusCode = 403;
    throw err;
  }
  return bill;
}

async function getAccessibleAdvance(req, advanceId, client = { query }) {
  const { rows } = await client.query(
    `SELECT id, project_id, company_id
     FROM tqs_advances
     WHERE id = $1 AND company_id = $2`,
    [advanceId, req.user.company_id]
  );
  const advance = rows[0];
  if (!advance) {
    const err = new Error('Advance not found');
    err.statusCode = 404;
    throw err;
  }
  if (!userCanAccessProject(req, advance.project_id)) {
    const err = new Error('Access denied for this project.');
    err.statusCode = 403;
    throw err;
  }
  return advance;
}

function canAccessTqsStage(user, stage) {
  if (!user) return false;
  // Full-access roles bypass all stage checks
  if (DQS_FULL_ACCESS_ROLES.includes(user.role)) return true;
  // Role-based stage access (e.g. qs_engineer → qs stage)
  const roleRules = STAGE_ROLE_RULES[stage] || [];
  if (roleRules.includes(user.role)) return true;
  // Department-name fallback (catches custom role names as long as department is set)
  const dept = String(user.department || '').toLowerCase();
  const deptTokens = STAGE_DEPT_RULES[stage] || [];
  return deptTokens.some(token => dept.includes(token));
}

function requireDateFields(body, fields) {
  const missing = fields.find(field => !body[field.key]);
  if (missing) {
    const err = new Error(`${missing.label} is mandatory.`);
    err.statusCode = 400;
    throw err;
  }
}

function requireTqsStageAccess(stage) {
  return (req, res, next) => {
    if (canAccessTqsStage(req.user, stage)) return next();
    return res.status(403).json({ error: 'Access denied for your department.' });
  };
}

// ── Multer storage for bill file attachments ───────────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '../../uploads/tqs-bills', req.params.id || 'tmp');
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${Date.now()}-${safe}`);
  },
});
const upload = multer({ storage, limits: { fileSize: 20 * 1024 * 1024 } });

async function getBillProjectName(billId) {
  let projectName = 'General';
  const pr = await query(`
    SELECT p.name FROM projects p
    JOIN tqs_bills b ON b.project_id = p.id
    WHERE b.id = $1
  `, [billId]);
  if (pr.rows.length) projectName = pr.rows[0].name;
  return projectName;
}

// ── Auto-create tables ─────────────────────────────────────────────────────
async function ensureTables() {
  await query(`
    CREATE TABLE IF NOT EXISTS tqs_bills (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id      UUID,
      project_id      UUID,
      sl_number       TEXT UNIQUE NOT NULL,
      vendor_id       UUID,
      vendor_name     TEXT,
      po_number       TEXT,
      po_date         DATE,
      inv_number      TEXT,
      inv_date        DATE,
      inv_month       TEXT,
      received_date   DATE,
      basic_amount    NUMERIC(14,2) DEFAULT 0,
      cgst_pct        NUMERIC(5,2)  DEFAULT 0,
      cgst_amt        NUMERIC(14,2) DEFAULT 0,
      sgst_pct        NUMERIC(5,2)  DEFAULT 0,
      sgst_amt        NUMERIC(14,2) DEFAULT 0,
      igst_pct        NUMERIC(5,2)  DEFAULT 0,
      igst_amt        NUMERIC(14,2) DEFAULT 0,
      gst_amount      NUMERIC(14,2) DEFAULT 0,
      transport_charges NUMERIC(14,2) DEFAULT 0,
      other_charges   NUMERIC(14,2) DEFAULT 0,
      total_amount    NUMERIC(14,2) DEFAULT 0,
      bill_type       TEXT DEFAULT 'po',
      workflow_status TEXT DEFAULT 'pending',
      remarks         TEXT,
      is_deleted      BOOLEAN DEFAULT FALSE,
      created_by      UUID,
      created_at      TIMESTAMPTZ DEFAULT NOW(),
      updated_at      TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS tqs_bill_updates (
      bill_id           UUID PRIMARY KEY REFERENCES tqs_bills(id) ON DELETE CASCADE,
      store_recv_date   DATE,
      dc_number         TEXT,
      vehicle_number    TEXT,
      inspection_status TEXT,
      received_by       TEXT,
      sent_to_ho_date   DATE,
      store_remarks     TEXT,
      ho_received_date  DATE,
      handed_over_qs_date DATE,
      document_controller_remarks TEXT,
      qs_received_date  DATE,
      qs_certified_date DATE,
      handed_over_accounts_date DATE,
      qs_gross          NUMERIC(14,2),
      qs_tax            NUMERIC(14,2),
      qs_total          NUMERIC(14,2),
      advance_recovered NUMERIC(14,2) DEFAULT 0,
      credit_note_amt   NUMERIC(14,2) DEFAULT 0,
      retention_money   NUMERIC(14,2) DEFAULT 0,
      tds_deduction     NUMERIC(14,2) DEFAULT 0,
      other_deductions  NUMERIC(14,2) DEFAULT 0,
      total_deductions  NUMERIC(14,2) DEFAULT 0,
      certified_net     NUMERIC(14,2),
      qs_remarks        TEXT,
      accts_received_from_qs_date DATE,
      accts_jv_date     DATE,
      accts_remarks     TEXT,
      proc_received_from_accounts_date DATE,
      proc_handed_over_to_accounts_date DATE,
      procurement_remarks TEXT,
      qs_sign_received_from_procurement_date DATE,
      payment_status    TEXT DEFAULT 'pending',
      paid_amount       NUMERIC(14,2) DEFAULT 0,
      balance_to_pay    NUMERIC(14,2),
      payment_date      DATE,
      updated_at        TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS tqs_bill_line_items (
      id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      bill_id      UUID REFERENCES tqs_bills(id) ON DELETE CASCADE,
      item_name    TEXT,
      unit         TEXT,
      quantity     NUMERIC(14,3),
      rate         NUMERIC(14,2),
      basic_amount NUMERIC(14,2),
      gst_pct      NUMERIC(5,2) DEFAULT 18,
      gst_amount   NUMERIC(14,2),
      total_amount NUMERIC(14,2),
      sort_order   INT DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS tqs_bill_files (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      bill_id     UUID REFERENCES tqs_bills(id) ON DELETE CASCADE,
      file_name   TEXT,
      file_size   INT,
      file_type   TEXT,
      local_url   TEXT,
      onedrive_id      TEXT,
      onedrive_url     TEXT,
      onedrive_web_url TEXT,
      uploaded_by UUID,
      uploaded_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS tqs_bill_history (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      bill_id     UUID REFERENCES tqs_bills(id) ON DELETE CASCADE,
      dept        TEXT,
      action      TEXT,
      changed_by  UUID,
      ts          TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  // Add columns introduced after initial migration
  const alterBills = [
    `ALTER TABLE tqs_bills ADD COLUMN IF NOT EXISTS work_desc TEXT`,
    `ALTER TABLE tqs_bills ADD COLUMN IF NOT EXISTS tax_mode TEXT DEFAULT 'intrastate'`,
    `ALTER TABLE tqs_bills ADD COLUMN IF NOT EXISTS credit_note_num TEXT`,
    `ALTER TABLE tqs_bills ADD COLUMN IF NOT EXISTS credit_note_val NUMERIC(14,2) DEFAULT 0`,
    `ALTER TABLE tqs_bills ADD COLUMN IF NOT EXISTS tcs_pct NUMERIC(6,3) DEFAULT 0`,
    `ALTER TABLE tqs_bills ADD COLUMN IF NOT EXISTS tcs_amt NUMERIC(14,2) DEFAULT 0`,
    `ALTER TABLE tqs_bills ADD COLUMN IF NOT EXISTS transport_gst_pct NUMERIC(5,2) DEFAULT 0`,
    `ALTER TABLE tqs_bills ADD COLUMN IF NOT EXISTS transport_gst_amt NUMERIC(14,2) DEFAULT 0`,
    `ALTER TABLE tqs_bills ADD COLUMN IF NOT EXISTS transport_desc TEXT`,
    `ALTER TABLE tqs_bills ADD COLUMN IF NOT EXISTS other_charges_desc TEXT`,
    // ── Cross-module linkage (procurement) ─────────────────────────
    `ALTER TABLE tqs_bills ADD COLUMN IF NOT EXISTS po_id UUID`,
    `ALTER TABLE tqs_bills ADD COLUMN IF NOT EXISTS grn_id UUID`,
    // ── Work order number ───────────────────────────────────────────
    `ALTER TABLE tqs_bills ADD COLUMN IF NOT EXISTS wo_number TEXT`,
    // ── Hire/Rental bill fields ─────────────────────────────────────
    `ALTER TABLE tqs_bills ADD COLUMN IF NOT EXISTS hire_period_from DATE`,
    `ALTER TABLE tqs_bills ADD COLUMN IF NOT EXISTS hire_period_to DATE`,
    `ALTER TABLE tqs_bills ADD COLUMN IF NOT EXISTS equipment_type TEXT`,
  ];
  const alterItems = [
    `ALTER TABLE tqs_bill_line_items ADD COLUMN IF NOT EXISTS category TEXT`,
    `ALTER TABLE tqs_bill_line_items ADD COLUMN IF NOT EXISTS item_code TEXT`,
    `ALTER TABLE tqs_bill_line_items ADD COLUMN IF NOT EXISTS gst_mode TEXT DEFAULT 'intrastate'`,
    `ALTER TABLE tqs_bill_line_items ADD COLUMN IF NOT EXISTS cgst_pct NUMERIC(5,2) DEFAULT 0`,
    `ALTER TABLE tqs_bill_line_items ADD COLUMN IF NOT EXISTS cgst_amt NUMERIC(14,2) DEFAULT 0`,
    `ALTER TABLE tqs_bill_line_items ADD COLUMN IF NOT EXISTS sgst_pct NUMERIC(5,2) DEFAULT 0`,
    `ALTER TABLE tqs_bill_line_items ADD COLUMN IF NOT EXISTS sgst_amt NUMERIC(14,2) DEFAULT 0`,
    `ALTER TABLE tqs_bill_line_items ADD COLUMN IF NOT EXISTS igst_pct NUMERIC(5,2) DEFAULT 0`,
    `ALTER TABLE tqs_bill_line_items ADD COLUMN IF NOT EXISTS igst_amt NUMERIC(14,2) DEFAULT 0`,
    `ALTER TABLE tqs_bill_line_items ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(14,2) DEFAULT 0`,
    // PO linkage — tracks which PO line item this bill line is drawn against
    `ALTER TABLE tqs_bill_line_items ADD COLUMN IF NOT EXISTS po_item_id UUID`,
    `ALTER TABLE tqs_bill_line_items ADD COLUMN IF NOT EXISTS wo_item_id UUID`,
    // BOQ linkage — tags this line item to a BOQ item + cost sub-heading for budget-vs-actual tracking
    `ALTER TABLE tqs_bill_line_items ADD COLUMN IF NOT EXISTS boq_item_id UUID`,
    `ALTER TABLE tqs_bill_line_items ADD COLUMN IF NOT EXISTS cost_head TEXT`,
    // Chapter-only linkage — for lines with no PO/BOQ item at all (direct bills), lets
    // Budget Breakdown attribute the spend to a chapter without a specific item match.
    `ALTER TABLE tqs_bill_line_items ADD COLUMN IF NOT EXISTS boq_chapter TEXT`,
    // Thumb rule — unit conversion audit trail (e.g. PO in Sqm, vendor invoices in Nos)
    `ALTER TABLE tqs_bill_line_items ADD COLUMN IF NOT EXISTS physical_qty NUMERIC(14,3)`,
    `ALTER TABLE tqs_bill_line_items ADD COLUMN IF NOT EXISTS physical_unit VARCHAR(30)`,
    `ALTER TABLE tqs_bill_line_items ADD COLUMN IF NOT EXISTS conversion_factor NUMERIC(14,6) DEFAULT 1`,
  ];
  const alterUpdates = [
    `ALTER TABLE tqs_bill_updates ADD COLUMN IF NOT EXISTS ra_sequence INT DEFAULT 1`,
    `ALTER TABLE tqs_bill_updates ADD COLUMN IF NOT EXISTS ra_bill_number TEXT`,
    `ALTER TABLE tqs_bill_updates ADD COLUMN IF NOT EXISTS previous_certified_amount NUMERIC(14,2) DEFAULT 0`,
    `ALTER TABLE tqs_bill_updates ADD COLUMN IF NOT EXISTS cumulative_certified_amount NUMERIC(14,2) DEFAULT 0`,
    `ALTER TABLE tqs_bill_updates ADD COLUMN IF NOT EXISTS is_final_bill BOOLEAN DEFAULT FALSE`,
    `ALTER TABLE tqs_bill_updates ADD COLUMN IF NOT EXISTS pc_number TEXT`,
    `ALTER TABLE tqs_bill_updates ADD COLUMN IF NOT EXISTS pc_generated_at TIMESTAMPTZ`,
    `ALTER TABLE tqs_bill_updates ADD COLUMN IF NOT EXISTS pc_qs_sig_img TEXT`,
    `ALTER TABLE tqs_bill_updates ADD COLUMN IF NOT EXISTS pc_qs_signed_by TEXT`,
    `ALTER TABLE tqs_bill_updates ADD COLUMN IF NOT EXISTS pc_qs_signed_at TIMESTAMPTZ`,
    `ALTER TABLE tqs_bill_updates ADD COLUMN IF NOT EXISTS pc_pm_sig_img TEXT`,
    `ALTER TABLE tqs_bill_updates ADD COLUMN IF NOT EXISTS pc_pm_signed_by TEXT`,
    `ALTER TABLE tqs_bill_updates ADD COLUMN IF NOT EXISTS pc_pm_signed_at TIMESTAMPTZ`,
    `ALTER TABLE tqs_bill_updates ADD COLUMN IF NOT EXISTS pc_accts_sig_img TEXT`,
    `ALTER TABLE tqs_bill_updates ADD COLUMN IF NOT EXISTS pc_accts_signed_by TEXT`,
    `ALTER TABLE tqs_bill_updates ADD COLUMN IF NOT EXISTS pc_accts_signed_at TIMESTAMPTZ`,
    `ALTER TABLE tqs_bill_updates ADD COLUMN IF NOT EXISTS sent_to_ho_date DATE`,
    `ALTER TABLE tqs_bill_updates ADD COLUMN IF NOT EXISTS ho_received_date DATE`,
    `ALTER TABLE tqs_bill_updates ADD COLUMN IF NOT EXISTS handed_over_qs_date DATE`,
    `ALTER TABLE tqs_bill_updates ADD COLUMN IF NOT EXISTS document_controller_remarks TEXT`,
    `ALTER TABLE tqs_bill_updates ADD COLUMN IF NOT EXISTS handed_over_accounts_date DATE`,
    // ── Finance linkage ──
    `ALTER TABLE tqs_bill_updates ADD COLUMN IF NOT EXISTS payment_mode TEXT`,
    `ALTER TABLE tqs_bill_updates ADD COLUMN IF NOT EXISTS reference_number TEXT`,
    `ALTER TABLE tqs_bill_updates ADD COLUMN IF NOT EXISTS bank_name TEXT`,
    `ALTER TABLE tqs_bill_updates ADD COLUMN IF NOT EXISTS finance_payment_id UUID`,
    `ALTER TABLE tqs_bill_updates ADD COLUMN IF NOT EXISTS qs_summary_template JSONB DEFAULT '[]'::jsonb`,
    `ALTER TABLE tqs_bill_updates ADD COLUMN IF NOT EXISTS qs_ra_items JSONB DEFAULT '[]'::jsonb`,
    `ALTER TABLE tqs_bill_updates ADD COLUMN IF NOT EXISTS ra_cgst_pct NUMERIC(5,2) DEFAULT 9`,
    `ALTER TABLE tqs_bill_updates ADD COLUMN IF NOT EXISTS ra_sgst_pct NUMERIC(5,2) DEFAULT 9`,
    `ALTER TABLE tqs_bill_updates ADD COLUMN IF NOT EXISTS ra_igst_pct NUMERIC(5,2) DEFAULT 0`,
    `ALTER TABLE tqs_bill_updates ADD COLUMN IF NOT EXISTS accts_received_from_qs_date DATE`,
    `ALTER TABLE tqs_bill_updates ADD COLUMN IF NOT EXISTS proc_received_from_accounts_date DATE`,
    `ALTER TABLE tqs_bill_updates ADD COLUMN IF NOT EXISTS proc_handed_over_to_accounts_date DATE`,
    `ALTER TABLE tqs_bill_updates ADD COLUMN IF NOT EXISTS procurement_remarks TEXT`,
    `ALTER TABLE tqs_bill_updates ADD COLUMN IF NOT EXISTS qs_sign_received_from_procurement_date DATE`,
    // ── QS MD-Signature stage ──
    `ALTER TABLE tqs_bill_updates ADD COLUMN IF NOT EXISTS qs_sign_date DATE`,
    `ALTER TABLE tqs_bill_updates ADD COLUMN IF NOT EXISTS qs_sign_handed_to_accounts_date DATE`,
    `ALTER TABLE tqs_bill_updates ADD COLUMN IF NOT EXISTS qs_sign_remarks TEXT`,
  ];
  // ── Advance payments table ───────────────────────────────────────────────
  await query(`
    CREATE TABLE IF NOT EXISTS tqs_advances (
      id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id       UUID,
      project_id       UUID,
      vendor_id        UUID,
      vendor_name      TEXT NOT NULL,
      wo_number        TEXT,
      po_number        TEXT,
      amount           NUMERIC(14,2) NOT NULL,
      recovered_amount NUMERIC(14,2) DEFAULT 0,
      payment_date     DATE,
      payment_mode     TEXT,
      reference_number TEXT,
      bank_name        TEXT,
      remarks          TEXT,
      finance_payment_id UUID,
      created_by       UUID,
      created_at       TIMESTAMPTZ DEFAULT NOW()
    )
  `).catch(() => {});

  // ── Extend payments table to accept DQS-originated records ──────────────
  const alterPayments = [
    `ALTER TABLE payments ADD COLUMN IF NOT EXISTS tqs_bill_id UUID`,
    `ALTER TABLE payments ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'manual'`,
    // Drop the narrow check constraint so RTGS/NEFT/Cheque etc. are accepted
    `ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_payment_mode_check`,
  ];
  const alterFiles = [
    `ALTER TABLE tqs_bill_files ADD COLUMN IF NOT EXISTS onedrive_id TEXT`,
    `ALTER TABLE tqs_bill_files ADD COLUMN IF NOT EXISTS onedrive_url TEXT`,
    `ALTER TABLE tqs_bill_files ADD COLUMN IF NOT EXISTS onedrive_web_url TEXT`,
  ];
  // ── Extend tqs_advances with tracker-specific columns ─────────────────────
  const alterAdvances = [
    `ALTER TABLE tqs_advances ADD COLUMN IF NOT EXISTS voucher_number TEXT`,
    `ALTER TABLE tqs_advances ADD COLUMN IF NOT EXISTS voucher_date DATE`,
    `ALTER TABLE tqs_advances ADD COLUMN IF NOT EXISTS po_date DATE`,
    `ALTER TABLE tqs_advances ADD COLUMN IF NOT EXISTS order_value NUMERIC(14,2) DEFAULT 0`,
    `ALTER TABLE tqs_advances ADD COLUMN IF NOT EXISTS qs_handover_date DATE`,
    `ALTER TABLE tqs_advances ADD COLUMN IF NOT EXISTS acct_received_date DATE`,
    `ALTER TABLE tqs_advances ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'Pending'`,
    `ALTER TABLE tqs_advances ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()`,
  ];
  for (const sql of [...alterBills, ...alterItems, ...alterUpdates, ...alterPayments, ...alterFiles, ...alterAdvances]) {
    await query(sql).catch(() => {}); // ignore if already exists
  }
  await query(`
    CREATE INDEX IF NOT EXISTS idx_tqs_bills_vendor_invoice_norm
    ON tqs_bills (company_id, LOWER(BTRIM(COALESCE(vendor_name, ''))), LOWER(BTRIM(COALESCE(inv_number, ''))))
    WHERE is_deleted = FALSE AND inv_number IS NOT NULL AND BTRIM(inv_number) <> ''
  `).catch(() => {});
}
runSchemaInit('dqs_bills', ensureTables);

// One-time repair (idempotent, re-runs every boot but only touches rows still
// broken): fixes tqs_bill_line_items whose po_item_id points at a po_items
// row that no longer exists. Editing a PO used to delete all its po_items and
// re-insert them with brand new ids on every edit (fixed in
// PATCH /purchase-orders/:id, which now re-points live), silently orphaning
// any bill line already billed against the old ids — bills edited/created
// before that fix stay broken until repaired here. Re-links to the current
// po_items row within the same PO by normalized material name, only when
// exactly one candidate matches (prefix-tolerant either direction).
runSchemaInit('tqs_bill_line_items_po_item_repair_orphaned', async () => {
  await query(`
    UPDATE tqs_bill_line_items li
    SET po_item_id = sub.pi_id
    FROM (
      SELECT li2.id AS line_id, MIN(pi.id::text)::uuid AS pi_id
      FROM tqs_bill_line_items li2
      JOIN tqs_bills tb ON tb.id = li2.bill_id
      JOIN po_items pi
        ON pi.po_id = tb.po_id
       AND length(regexp_replace(lower(trim(li2.item_name)), '[^a-z0-9]+', '', 'g')) >= 3
       AND length(regexp_replace(lower(trim(pi.material_name)), '[^a-z0-9]+', '', 'g')) >= 3
       AND (
         regexp_replace(lower(trim(li2.item_name)), '[^a-z0-9]+', '', 'g')
           LIKE regexp_replace(lower(trim(pi.material_name)), '[^a-z0-9]+', '', 'g') || '%'
         OR regexp_replace(lower(trim(pi.material_name)), '[^a-z0-9]+', '', 'g')
           LIKE regexp_replace(lower(trim(li2.item_name)), '[^a-z0-9]+', '', 'g') || '%'
       )
      WHERE li2.po_item_id IS NOT NULL
        AND tb.po_id IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM po_items existing WHERE existing.id = li2.po_item_id)
      GROUP BY li2.id
      HAVING COUNT(DISTINCT pi.id) = 1
    ) sub
    WHERE li.id = sub.line_id
  `).catch(() => {});
});

// ── Helper: generate SL number ─────────────────────────────────────────────
async function nextSlNumber(billType = 'po', companyId) {
  // Use MAX aggregate across ALL bills so we never collide with earlier high-numbered bills
  const res = await query(
    `SELECT COALESCE(MAX(CAST(REGEXP_REPLACE(sl_number, '[^0-9]', '', 'g') AS INTEGER)), 0) AS max_num
     FROM tqs_bills
     WHERE sl_number ~ '[0-9]'${companyId ? ' AND company_id = $1' : ''}`,
    companyId ? [companyId] : []
  );
  const next = (Number(res.rows[0]?.max_num) || 0) + 1;
  if (billType === 'wo')   return `WO-${next}`;
  if (billType === 'hire') return `HIRE-${next}`;
  return `P0-${next}`;
}

// ── Helper: log history ────────────────────────────────────────────────────
const normInvoiceText = (value) => String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
const runDbQuery = (db, sql, params) => (typeof db === 'function' ? db(sql, params) : db.query(sql, params));

async function assertNoDuplicateInvoice(db, { companyId, vendorName, invNumber, excludeId = null }) {
  const vendorKey = normInvoiceText(vendorName);
  const invKey = normInvoiceText(invNumber);
  if (!vendorKey || !invKey) return;

  if (db !== query) {
    await runDbQuery(
      db,
      `SELECT pg_advisory_xact_lock(hashtextextended($1, 0)::bigint)`,
      [`${companyId || 'no-company'}|${vendorKey}|${invKey}`]
    );
  }

  const params = [companyId, vendorKey, invKey];
  let excludeSql = '';
  if (excludeId) {
    params.push(excludeId);
    excludeSql = `AND id <> $${params.length}`;
  }

  const { rows } = await runDbQuery(db, `
    SELECT id, sl_number, vendor_name, inv_number
    FROM tqs_bills
    WHERE is_deleted = FALSE
      AND ($1::uuid IS NULL OR company_id = $1)
      AND LOWER(BTRIM(COALESCE(vendor_name, ''))) = $2
      AND LOWER(BTRIM(COALESCE(inv_number, ''))) = $3
      ${excludeSql}
    LIMIT 1
  `, params);

  if (rows.length) {
    const existing = rows[0];
    const err = new Error(
      `Duplicate invoice number "${invNumber}" already exists for ${existing.vendor_name || vendorName} in DQS Bills (SL ${existing.sl_number}).`
    );
    err.statusCode = 409;
    throw err;
  }
}

async function assertPoAmountWithinLimit(db, { companyId, poId, poNumber, newTotalAmount, excludeBillId = null }) {
  const incoming = Number(newTotalAmount || 0);
  if (incoming <= 0 && !poId && !poNumber) return;

  const poParams = [companyId];
  let poWhere = `p.company_id = $1`;
  if (poId) {
    poParams.push(poId);
    poWhere += ` AND po.id = $${poParams.length}`;
  } else if (poNumber) {
    poParams.push(poNumber);
    poWhere += ` AND po.po_number = $${poParams.length}`;
  } else {
    return;
  }

  const poRes = await runDbQuery(db, `
    SELECT po.id, po.po_number, COALESCE(po.grand_total, 0) AS grand_total
    FROM purchase_orders po
    JOIN projects p ON p.id = po.project_id
    WHERE ${poWhere}
    LIMIT 1
    FOR UPDATE OF po
  `, poParams);

  const po = poRes.rows[0];
  if (!po) return;

  const billParams = [companyId, po.id, po.po_number];
  let excludeSql = '';
  if (excludeBillId) {
    billParams.push(excludeBillId);
    excludeSql = `AND id <> $${billParams.length}`;
  }

  const billedRes = await runDbQuery(db, `
    SELECT COALESCE(SUM(total_amount), 0) AS billed_amount
    FROM tqs_bills
    WHERE company_id = $1
      AND is_deleted = FALSE
      AND workflow_status NOT IN ('rejected')
      AND (po_id = $2 OR (po_id IS NULL AND po_number = $3))
      ${excludeSql}
  `, billParams);

  const poTotal = Number(po.grand_total || 0);
  const alreadyBilled = Number(billedRes.rows[0]?.billed_amount || 0);
  const projected = alreadyBilled + incoming;

  if (poTotal > 0 && projected > poTotal + 0.01) {
    const err = new Error(
      `PO amount exceeded for ${po.po_number}. PO value ${inrText(poTotal)}, already billed ${inrText(alreadyBilled)}, this bill ${inrText(incoming)}, exceeds by ${inrText(projected - poTotal)}.`
    );
    err.statusCode = 400;
    throw err;
  }
}

async function logHistory(billId, dept, action, userId) {
  await query(
    `INSERT INTO tqs_bill_history (bill_id, dept, action, changed_by) VALUES ($1,$2,$3,$4)`,
    [billId, dept, action, userId]
  );
}

// ── Helper: generate PC number ─────────────────────────────────────────────
const inrText = (value) =>
  Math.round(Number(value || 0)).toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });

const numValue = (v) => parseFloat(v || 0) || 0;

// Fixed recipients always notified on bill payment
const BILL_PAID_FIXED_EMAILS = ['it@bcim.in'];

// Roles whose members are notified on bill payment
const BILL_PAID_NOTIFY_ROLES = ['qs_engineer', 'procurement_manager', 'purchase_manager', 'procurement_officer'];

async function sendBillPaidEmail({ bill, paidAmount, paymentDate, paymentMode, referenceNumber, actorName, companyId }) {
  try {
    // Fetch role-based recipients (procurement + QS teams)
    const roleRows = await query(
      `SELECT DISTINCT email, name FROM users
       WHERE company_id = $1
         AND role = ANY($2::text[])
         AND is_active = TRUE
         AND email IS NOT NULL`,
      [companyId, BILL_PAID_NOTIFY_ROLES]
    );
    const roleEmails = roleRows.rows.map(r => r.email);
    const toList = [...new Set([...BILL_PAID_FIXED_EMAILS, ...roleEmails])];

    const billRef  = bill.sl_number || bill.inv_number || bill.id;
    const vendor   = bill.vendor_name || '—';
    const project  = bill.project_name || bill.project_id || '—';
    const amount   = inrText(paidAmount || bill.total_amount);
    const pDate    = paymentDate ? new Date(paymentDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
    const mode     = paymentMode || '—';
    const ref      = referenceNumber || '—';
    const actor    = actorName || 'System';

    const subject = `✅ Bill Paid — ${billRef} | ${vendor} | ${amount}`;
    const html = `
      <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#0f172a">
        <div style="background:#15803d;padding:18px 28px;border-radius:8px 8px 0 0">
          <h2 style="color:#fff;margin:0;font-size:18px">✅ Bill Payment Confirmed</h2>
        </div>
        <div style="background:#f8fafc;padding:24px 28px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 8px 8px">
          <table style="width:100%;border-collapse:collapse;font-size:14px">
            <tr><td style="padding:8px 0;color:#64748b;width:140px">Bill Reference</td><td style="padding:8px 0;font-weight:700">${billRef}</td></tr>
            <tr><td style="padding:8px 0;color:#64748b">Vendor</td><td style="padding:8px 0">${vendor}</td></tr>
            <tr><td style="padding:8px 0;color:#64748b">Project</td><td style="padding:8px 0">${project}</td></tr>
            <tr><td style="padding:8px 0;color:#64748b">Amount Paid</td><td style="padding:8px 0;font-weight:700;color:#15803d;font-size:16px">${amount}</td></tr>
            <tr><td style="padding:8px 0;color:#64748b">Payment Date</td><td style="padding:8px 0">${pDate}</td></tr>
            <tr><td style="padding:8px 0;color:#64748b">Payment Mode</td><td style="padding:8px 0">${mode}</td></tr>
            <tr><td style="padding:8px 0;color:#64748b">Reference No.</td><td style="padding:8px 0">${ref}</td></tr>
            <tr><td style="padding:8px 0;color:#64748b">Actioned By</td><td style="padding:8px 0">${actor}</td></tr>
          </table>
          <hr style="border:none;border-top:1px solid #e2e8f0;margin:18px 0">
          <p style="font-size:11px;color:#94a3b8;margin:0">
            This is an automated notification from BCIM ConstructERP – Bill Tracker.
          </p>
        </div>
      </div>`;

    await sendMail({ to: toList, subject, html });
    console.log(`[bill-paid-email] Sent to: ${toList.join(', ')}`);
  } catch (err) {
    console.error('[bill-paid-email] Failed to send:', err.message);
  }
}
const roundMoney = (v) => Math.round(numValue(v) * 100) / 100;
const billPayableCap = (bill = {}) => {
  const gross = numValue(bill.total_amount);
  const deductions = numValue(bill.tds_deduction) + numValue(bill.other_deductions) + numValue(bill.advance_recovered);
  const netFromGross = Math.max(0, gross - deductions);
  const certified = numValue(bill.certified_net);
  if (certified > 0 && (!gross || certified <= gross + 0.01)) return roundMoney(certified);
  if (gross > 0) return roundMoney(netFromGross);
  return roundMoney(certified);
};

async function getPoAlertRecipients(companyId) {
  const configured = String(process.env.PO_ALERT_EMAILS || process.env.ALERT_EMAILS || '')
    .split(',')
    .map(s => s.trim().toLowerCase())
    .filter(Boolean);
  const excluded = new Set(String(process.env.PO_ALERT_EXCLUDE_EMAILS || '')
    .split(',')
    .map(s => s.trim().toLowerCase())
    .filter(Boolean));

  const { rows } = await query(`
    SELECT DISTINCT LOWER(email) AS email
    FROM users
    WHERE company_id = $1
      AND is_active = TRUE
      AND email IS NOT NULL
      AND BTRIM(email) <> ''
      AND (
        role IN ('super_admin','admin','procurement_manager','project_manager','accountant')
        OR LOWER(COALESCE(department, '')) LIKE ANY(ARRAY['%procurement%','%purchase%','%accounts%','%finance%'])
      )
  `, [companyId]);

  return [...new Set([...configured, ...rows.map(r => r.email).filter(Boolean)])]
    .filter(email => !excluded.has(email));
}

async function maybeSendPoConsumptionAlert({ companyId, poId, bill }) {
  if (!poId) return;

  const { rows } = await query(`
    WITH po_totals AS (
      SELECT po.id, po.po_number, po.po_date, po.grand_total, po.project_id,
             COALESCE(v.name, $3) AS vendor_name,
             p.name AS project_name
      FROM purchase_orders po
      LEFT JOIN vendors v ON v.id = po.vendor_id
      LEFT JOIN projects p ON p.id = po.project_id
      WHERE po.id = $1
    ),
    bill_totals AS (
      SELECT COALESCE(SUM(total_amount), 0) AS billed_amount
      FROM tqs_bills
      WHERE po_id = $1
        AND company_id = $2
        AND is_deleted = FALSE
        AND workflow_status NOT IN ('rejected')
    ),
    item_totals AS (
      SELECT
        COALESCE(SUM(pi.quantity), 0) AS ordered_qty,
        COALESCE(SUM(COALESCE(inv.invoiced_qty, 0)), 0) AS invoiced_qty,
        COALESCE(SUM(GREATEST(pi.quantity - COALESCE(inv.invoiced_qty, 0), 0)), 0) AS remaining_qty
      FROM po_items pi
      LEFT JOIN (
        SELECT li.po_item_id, SUM(li.quantity) AS invoiced_qty
        FROM tqs_bill_line_items li
        JOIN tqs_bills b ON b.id = li.bill_id
        WHERE b.po_id = $1
          AND b.company_id = $2
          AND b.is_deleted = FALSE
          AND b.workflow_status NOT IN ('rejected')
          AND li.po_item_id IS NOT NULL
        GROUP BY li.po_item_id
      ) inv ON inv.po_item_id = pi.id
      WHERE pi.po_id = $1
    )
    SELECT po_totals.*, bill_totals.billed_amount,
           item_totals.ordered_qty, item_totals.invoiced_qty, item_totals.remaining_qty
    FROM po_totals, bill_totals, item_totals
  `, [poId, companyId, bill.vendor_name || 'Vendor']);

  const po = rows[0];
  if (!po) return;

  const poAmount = Number(po.grand_total || 0);
  const billedAmount = Number(po.billed_amount || 0);
  const amountPct = poAmount > 0 ? Math.round((billedAmount / poAmount) * 100) : 0;
  const orderedQty = Number(po.ordered_qty || 0);
  const invoicedQty = Number(po.invoiced_qty || 0);
  const qtyPct = orderedQty > 0 ? Math.round((invoicedQty / orderedQty) * 100) : 0;
  const amountOver = poAmount > 0 && billedAmount >= poAmount;
  const qtyOver = orderedQty > 0 && Number(po.remaining_qty || 0) <= 0;
  const nearLimit = amountPct >= PO_ALERT_THRESHOLD_PCT || qtyPct >= PO_ALERT_THRESHOLD_PCT;

  if (!amountOver && !qtyOver && !nearLimit) return;

  const recipients = await getPoAlertRecipients(companyId);
  if (!recipients.length) {
    logger.warn(`[po-alert] No email recipients configured for PO ${po.po_number}`);
    return;
  }

  const amountNearLimit = amountPct >= PO_ALERT_THRESHOLD_PCT;
  const qtyNearLimit = qtyPct >= PO_ALERT_THRESHOLD_PCT;
  const triggerParts = [];
  if (amountOver) triggerParts.push('Amount limit reached');
  else if (amountNearLimit) triggerParts.push(`Amount ${PO_ALERT_THRESHOLD_PCT}% warning`);
  if (qtyOver) triggerParts.push('Quantity limit reached');
  else if (qtyNearLimit) triggerParts.push(`Quantity ${PO_ALERT_THRESHOLD_PCT}% warning`);
  const triggerLabel = triggerParts.join(' + ') || `${PO_ALERT_THRESHOLD_PCT}% warning`;
  const severity = amountOver || qtyOver ? 'LIMIT REACHED' : `${PO_ALERT_THRESHOLD_PCT}% WARNING`;
  const subjectPrefix = amountOver || qtyOver
    ? 'PO LIMIT REACHED'
    : amountNearLimit && qtyNearLimit
      ? `PO Amount & Quantity ${PO_ALERT_THRESHOLD_PCT}% WARNING`
      : qtyNearLimit
        ? `PO Quantity ${PO_ALERT_THRESHOLD_PCT}% WARNING`
        : `PO Amount ${PO_ALERT_THRESHOLD_PCT}% WARNING`;
  const subject = `${subjectPrefix}: ${po.po_number}`;
  const text = [
    `Purchase Order alert: ${po.po_number}`,
    `Alert Trigger: ${triggerLabel}`,
    `Vendor: ${po.vendor_name || '-'}`,
    `Project: ${po.project_name || '-'}`,
    `Triggered by DQS Bill: ${bill.sl_number || '-'} / Invoice ${bill.inv_number || '-'}`,
    `PO Amount: ${inrText(poAmount)}`,
    `Billed Amount: ${inrText(billedAmount)} (${amountPct}%)`,
    `Ordered Qty: ${orderedQty}`,
    `Invoiced Qty: ${invoicedQty} (${qtyPct}%)`,
    `Remaining Qty: ${po.remaining_qty || 0}`,
  ].join('\n');

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:680px;color:#0f172a">
      <h2 style="margin:0 0 12px;color:#b91c1c">Purchase Order ${severity}</h2>
      <p style="padding:10px 12px;background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;color:#9a3412">
        <strong>Alert Trigger:</strong> ${triggerLabel}
      </p>
      <p><strong>PO:</strong> ${po.po_number}<br>
         <strong>Vendor:</strong> ${po.vendor_name || '-'}<br>
         <strong>Project:</strong> ${po.project_name || '-'}<br>
         <strong>DQS Bill:</strong> ${bill.sl_number || '-'} / Invoice ${bill.inv_number || '-'}</p>
      <table style="border-collapse:collapse;width:100%;font-size:14px">
        <tr><td style="padding:8px;border:1px solid #e2e8f0">PO Amount</td><td style="padding:8px;border:1px solid #e2e8f0">${inrText(poAmount)}</td></tr>
        <tr><td style="padding:8px;border:1px solid #e2e8f0">Billed Amount</td><td style="padding:8px;border:1px solid #e2e8f0">${inrText(billedAmount)} (${amountPct}%)</td></tr>
        <tr><td style="padding:8px;border:1px solid #e2e8f0">Ordered Qty</td><td style="padding:8px;border:1px solid #e2e8f0">${orderedQty}</td></tr>
        <tr><td style="padding:8px;border:1px solid #e2e8f0">Invoiced Qty</td><td style="padding:8px;border:1px solid #e2e8f0">${invoicedQty} (${qtyPct}%)</td></tr>
        <tr><td style="padding:8px;border:1px solid #e2e8f0">Remaining Qty</td><td style="padding:8px;border:1px solid #e2e8f0">${po.remaining_qty || 0}</td></tr>
      </table>
    </div>
  `;

  const mailResult = await sendMail({ to: recipients, subject, text, html });
  logger.info(`[po-alert] ${subject} -> ${mailResult.sent ? 'sent' : mailResult.reason}`);
}

async function nextPCNumber() {
  const yr = new Date().getFullYear();
  const { rows } = await query(
    `SELECT COUNT(*) AS cnt FROM tqs_bill_updates WHERE pc_number LIKE $1`,
    [`PC-${yr}-%`]
  );
  const n = parseInt(rows[0].cnt, 10) + 1;
  return `PC-${yr}-${String(n).padStart(4, '0')}`;
}

// ── GET /tqs/bills/lookup/po-balance ─────────────────────────────────────
// Per PO item: ordered qty, GRN-received qty, already-invoiced qty, remaining
router.get('/lookup/po-balance', async (req, res) => {
  try {
    const { po_id } = req.query;
    if (!po_id) return res.status(400).json({ error: 'po_id required' });

    const { rows } = await query(`
      SELECT
        pi.id                                           AS po_item_id,
        pi.material_name                                AS item_name,
        pi.unit,
        pi.quantity                                     AS ordered_qty,
        COALESCE(grn_agg.received_qty, 0)               AS received_qty,
        -- Thumb rule audit trail (NULL when no conversion was used)
        grn_agg.physical_qty,
        grn_agg.physical_unit,
        grn_agg.conversion_factor,
        COALESCE(inv_direct_agg.invoiced_qty, 0) + COALESCE(inv_legacy_agg.invoiced_qty, 0) AS invoiced_qty,
        GREATEST(0,
          pi.quantity
          - COALESCE(inv_direct_agg.invoiced_qty, 0)
          - COALESCE(inv_legacy_agg.invoiced_qty, 0)
        )                                               AS remaining_qty
      FROM po_items pi
      JOIN purchase_orders po ON po.id = pi.po_id
      -- Sum GRN quantities for approved GRNs linked to this PO
      -- Fallback by material_name+unit handles GRNs where po_item_id was not set
      -- (including thumb-rule entries — gi.unit is always PO unit after conversion)
      LEFT JOIN (
        SELECT
          gi.po_item_id,
          LOWER(TRIM(COALESCE(gi.material_name, ''))) AS mat_name,
          COALESCE(gi.unit, '')                        AS unit,
          SUM(gi.quantity_received)                    AS received_qty,
          SUM(gi.physical_qty)                         AS physical_qty,
          MAX(gi.physical_unit)                        AS physical_unit,
          MAX(gi.conversion_factor)                    AS conversion_factor
        FROM grn_items gi
        JOIN grn g ON g.id = gi.grn_id
        WHERE g.po_id = $1 AND g.quality_status = 'approved'
        GROUP BY gi.po_item_id,
                 LOWER(TRIM(COALESCE(gi.material_name, ''))),
                 COALESCE(gi.unit, '')
      ) grn_agg ON (
        grn_agg.po_item_id = pi.id
        OR (
          grn_agg.po_item_id IS NULL
          AND grn_agg.mat_name = LOWER(TRIM(COALESCE(pi.material_name, '')))
          AND grn_agg.unit    = COALESCE(pi.unit, '')
        )
      )
      -- Sum already-invoiced quantities from non-deleted DQS bills
      LEFT JOIN (
        SELECT li.po_item_id, SUM(li.quantity) AS invoiced_qty
        FROM tqs_bill_line_items li
        JOIN tqs_bills b ON b.id = li.bill_id
        WHERE li.po_item_id IS NOT NULL
          AND b.is_deleted = FALSE
        GROUP BY li.po_item_id
      ) inv_direct_agg ON inv_direct_agg.po_item_id = pi.id
      LEFT JOIN (
        SELECT
          COALESCE(b.po_id, po2.id) AS po_id,
          LOWER(TRIM(COALESCE(li.item_name, ''))) AS item_name,
          COALESCE(li.unit, '') AS unit,
          SUM(li.quantity) AS invoiced_qty
        FROM tqs_bill_line_items li
        JOIN tqs_bills b ON b.id = li.bill_id
        LEFT JOIN purchase_orders po2 ON po2.po_number = b.po_number
        WHERE li.po_item_id IS NULL
          AND b.is_deleted = FALSE
          AND COALESCE(b.bill_type, 'po') <> 'wo'
        GROUP BY COALESCE(b.po_id, po2.id), LOWER(TRIM(COALESCE(li.item_name, ''))), COALESCE(li.unit, '')
      ) inv_legacy_agg
        ON inv_legacy_agg.po_id = pi.po_id
       AND inv_legacy_agg.item_name = LOWER(TRIM(COALESCE(pi.material_name, '')))
       AND inv_legacy_agg.unit = COALESCE(pi.unit, '')
      WHERE pi.po_id = $1
      ORDER BY pi.id
    `, [po_id]);

    res.json({ data: rows });
  } catch (err) {
    console.error(err);
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

// ── GET /tqs/bills/lookup/pos ─────────────────────────────────────────────
// Returns approved POs from the procurement module, optionally filtered by project.
// Includes is_fully_billed, billed_amount, remaining_amount so the UI can warn
// staff when a PO has been completely consumed.
router.get('/lookup/pos', async (req, res) => {
  try {
    const { project_id, vendor_id, vendor_name } = req.query;
    let sql = `
      SELECT
        po.id, po.po_number, po.po_date,
        po.grand_total AS total_amount,
        po.project_id, po.vendor_id,
        v.name  AS vendor_name,
        p.name  AS project_name,
        -- Total invoiced (non-rejected, non-deleted bills) against this PO
        COALESCE((
          SELECT SUM(b.total_amount)
          FROM tqs_bills b
          WHERE b.po_id = po.id
            AND b.is_deleted = FALSE
            AND b.workflow_status NOT IN ('rejected')
        ), 0) AS billed_amount,
        -- Fully billed = no po_item still has remaining qty > 0.001
        -- Must exclude line items that belong to soft-deleted bills
        NOT EXISTS (
          SELECT 1 FROM po_items pi
          WHERE pi.po_id = po.id
            AND pi.quantity > COALESCE((
              SELECT SUM(tli.quantity)
              FROM tqs_bill_line_items tli
              JOIN tqs_bills b ON b.id = tli.bill_id
                AND b.is_deleted = FALSE
                AND b.workflow_status NOT IN ('rejected')
              WHERE tli.po_item_id = pi.id
            ), 0) + 0.001
        ) AS is_fully_billed
      FROM purchase_orders po
      LEFT JOIN vendors v ON v.id = po.vendor_id
      LEFT JOIN projects p ON p.id = po.project_id
      WHERE p.company_id = $1
        AND po.status IN ('approved','sent','part_received','fully_received')
    `;
    const params = [req.user.company_id];
    let i = 2;
    const scopeConds = [];
    applyProjectScope(req, scopeConds, params, 'po', project_id);
    if (scopeConds.length) sql += scopeConds.map(c => ` AND ${c}`).join('');
    i = params.length + 1;
    if (vendor_id)    { sql += ` AND po.vendor_id  = $${i++}`; params.push(vendor_id); }
    else if (vendor_name) { sql += ` AND v.name ILIKE $${i++}`; params.push(vendor_name); }
    sql += ` ORDER BY po.po_date DESC NULLS LAST LIMIT 500`;
    const r = await query(sql, params);
    res.json({ data: r.rows });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

// ── GET /tqs/bills/lookup/grns ────────────────────────────────────────────
// Returns QC-approved GRNs (ready for invoicing) for a given PO or project.
router.get('/lookup/wos', async (req, res) => {
  try {
    const { project_id, vendor_id, vendor_name } = req.query;
    // Build vendor sub-filter: WO's own vendor OR bills from this vendor reference the WO.
    // This handles the case where a WO was registered under a slightly different vendor record
    // (e.g. "Pragati Roadlines" vs "Pragathi Road Lines") but the bills are correctly linked.
    const params = [req.user.company_id];
    let i = 2;
    let vendorSubfilter = '';
    if (vendor_id) {
      vendorSubfilter = `AND (
        wo.vendor_id = $${i}
        OR EXISTS (
          SELECT 1 FROM tqs_bills bv
          WHERE bv.wo_number = wo.wo_number
            AND bv.company_id = $1
            AND bv.is_deleted = FALSE
            AND bv.vendor_id = $${i}
        )
      )`;
      params.push(vendor_id); i++;
    } else if (vendor_name) {
      vendorSubfilter = `AND (
        v.name ILIKE $${i}
        OR EXISTS (
          SELECT 1 FROM tqs_bills bv
          WHERE bv.wo_number = wo.wo_number
            AND bv.company_id = $1
            AND bv.is_deleted = FALSE
            AND bv.vendor_name ILIKE $${i}
        )
      )`;
      params.push(vendor_name); i++;
    }

    let sql = `
      SELECT
        wo.id, wo.wo_number, wo.start_date AS wo_date,
        COALESCE(wo.total_value, wo.contract_amount, 0) AS total_amount,
        wo.project_id, wo.vendor_id,
        COALESCE(wo.subject, wo.work_description, wo.scope_of_work) AS subject,
        v.name AS vendor_name, p.name AS project_name,
        -- Total invoiced (non-rejected, non-deleted bills) against this WO
        COALESCE((
          SELECT SUM(b.total_amount)
          FROM tqs_bills b
          WHERE b.wo_number = wo.wo_number
            AND b.bill_type = 'wo'
            AND b.is_deleted = FALSE
            AND b.workflow_status NOT IN ('rejected')
        ), 0) AS billed_amount,
        -- Fully billed = WO has line items AND none have remaining qty > 0.001
        -- Excludes line items from soft-deleted bills
        (
          EXISTS (SELECT 1 FROM work_order_items wi2 WHERE wi2.wo_id = wo.id)
          AND NOT EXISTS (
            SELECT 1 FROM work_order_items wi
            WHERE wi.wo_id = wo.id
              AND wi.quantity > COALESCE((
                SELECT SUM(tli.quantity)
                FROM tqs_bill_line_items tli
                JOIN tqs_bills b ON b.id = tli.bill_id
                  AND b.is_deleted = FALSE
                  AND b.workflow_status NOT IN ('rejected')
                WHERE tli.wo_item_id = wi.id
              ), 0) + 0.001
          )
        ) AS is_fully_billed
      FROM work_orders wo
      LEFT JOIN vendors v ON v.id = wo.vendor_id
      LEFT JOIN projects p ON p.id = wo.project_id
      WHERE p.company_id = $1
        AND COALESCE(wo.status, 'approved') IN ('approved','active','completed','closed')
        ${vendorSubfilter}
    `;
    const scopeConds = [];
    applyProjectScope(req, scopeConds, params, 'wo', project_id);
    if (scopeConds.length) sql += scopeConds.map(c => ` AND ${c}`).join('');
    i = params.length + 1;
    sql += ` ORDER BY wo.start_date DESC NULLS LAST, wo.wo_number ASC LIMIT 500`;
    const r = await query(sql, params);
    res.json({ data: r.rows });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

router.get('/lookup/grns', async (req, res) => {
  try {
    const { project_id, po_id } = req.query;
    let sql = `
      SELECT g.id, g.grn_number, g.serial_no_formatted, g.grn_date, g.total_quantity,
             g.vendor_id, g.po_id, v.name AS vendor_name
      FROM grn g
      LEFT JOIN vendors v ON v.id = g.vendor_id
      LEFT JOIN projects p ON p.id = g.project_id
      WHERE p.company_id = $1 AND g.quality_status = 'approved'
    `;
    const params = [req.user.company_id];
    let i = 2;
    const scopeConds = [];
    applyProjectScope(req, scopeConds, params, 'g', project_id);
    if (scopeConds.length) sql += scopeConds.map(c => ` AND ${c}`).join('');
    i = params.length + 1;
    if (po_id)      { sql += ` AND g.po_id = $${i++}`;      params.push(po_id); }
    sql += ` ORDER BY g.grn_date DESC LIMIT 200`;
    const r = await query(sql, params);
    res.json({ data: r.rows });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

// ── GET /tqs/bills/cash-flow ─────────────────────────────────────────────────
// Monthly cash flow: billed, in-process, paid, pending per month
router.get('/cash-flow', async (req, res) => {
  try {
    const { project_id, from_date, to_date } = req.query;
    const cid = req.user.company_id;
    const params = [cid];
    let idx = 2;
    const conds = [`b.company_id = $1`, `b.is_deleted = FALSE`, `b.inv_date IS NOT NULL`];
    applyProjectScope(req, conds, params, 'b', project_id);
    idx = params.length + 1;
    if (from_date)  { conds.push(`b.inv_date >= $${idx++}`);  params.push(from_date); }
    if (to_date)    { conds.push(`b.inv_date <= $${idx++}`);  params.push(to_date); }

    const monthly = await query(`
      SELECT
        TO_CHAR(b.inv_date, 'YYYY-MM')   AS month,
        TO_CHAR(b.inv_date, 'Mon YYYY')  AS month_label,
        COUNT(b.id)::int                 AS bill_count,
        SUM(COALESCE(b.basic_amount,0))  AS gross_billed,
        SUM(COALESCE(b.gst_amount,0))    AS gst_amount,
        SUM(COALESCE(b.basic_amount,0) + COALESCE(b.gst_amount,0)) AS total_billed,
        SUM(CASE WHEN b.workflow_status = 'paid'
              THEN COALESCE(u.certified_net, b.basic_amount, 0) ELSE 0 END) AS paid,
        SUM(CASE WHEN b.workflow_status NOT IN ('pending','paid')
              THEN COALESCE(u.certified_net, b.basic_amount, 0) ELSE 0 END) AS in_process,
        SUM(CASE WHEN b.workflow_status = 'pending'
              THEN COALESCE(u.certified_net, b.basic_amount, 0) ELSE 0 END) AS pending,
        SUM(COALESCE(u.retention_money,0))  AS retention_held,
        SUM(COALESCE(u.advance_recovered,0)) AS advance_recovered,
        SUM(COALESCE(u.total_deductions,0))  AS total_deductions,
        -- Net payable = only unpaid bills (pending + in-process)
        SUM(CASE WHEN b.workflow_status != 'paid'
              THEN COALESCE(u.certified_net, b.basic_amount, 0) ELSE 0 END) AS net_payable,
        COUNT(CASE WHEN b.workflow_status = 'paid'    THEN 1 END)::int AS paid_count,
        COUNT(CASE WHEN b.workflow_status = 'pending' THEN 1 END)::int AS pending_count,
        COUNT(CASE WHEN b.workflow_status NOT IN ('pending','paid') THEN 1 END)::int AS in_process_count
      FROM tqs_bills b
      LEFT JOIN tqs_bill_updates u ON u.bill_id = b.id
      WHERE ${conds.join(' AND ')}
      GROUP BY 1, 2
      ORDER BY 1
    `, params);

    const summary = monthly.rows.reduce((acc, r) => ({
      total_bills:        acc.total_bills        + r.bill_count,
      total_billed:       acc.total_billed       + parseFloat(r.total_billed||0),
      total_paid:         acc.total_paid         + parseFloat(r.paid||0),
      total_pending:      acc.total_pending      + parseFloat(r.pending||0),
      in_process:         acc.in_process         + parseFloat(r.in_process||0),
      total_deductions:   acc.total_deductions   + parseFloat(r.total_deductions||0),
      total_retention:    acc.total_retention    + parseFloat(r.retention_held||0),
      total_net_payable:  acc.total_net_payable  + parseFloat(r.net_payable||0),
      paid_count:         acc.paid_count         + (r.paid_count||0),
      pending_count:      acc.pending_count      + (r.pending_count||0),
      in_process_count:   acc.in_process_count   + (r.in_process_count||0),
    }), { total_bills:0, total_billed:0, total_paid:0, total_pending:0, in_process:0,
          total_deductions:0, total_retention:0, total_net_payable:0,
          paid_count:0, pending_count:0, in_process_count:0 });

    res.json({ data: monthly.rows, summary });
  } catch (err) {
    console.error('[Cash Flow]', err.message);
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

// ── GET /tqs/bills/ap-aging ────────────────────────────────────────────────
// ── GET /tqs/bills/deduction-register ────────────────────────────────────────
// Groups all WO bills by WO number / vendor and aggregates deductions
router.get('/deduction-register', async (req, res) => {
  try {
    const { project_id, vendor_id, from_date, to_date } = req.query;
    const params = [req.user.company_id];
    let idx = 2;
    const conds = [`b.company_id = $1`, `b.is_deleted = FALSE`];

    applyProjectScope(req, conds, params, 'b', project_id);
    idx = params.length + 1;
    if (vendor_id)  { conds.push(`b.vendor_id = $${idx++}`);  params.push(vendor_id); }
    if (from_date)  { conds.push(`b.inv_date >= $${idx++}`);  params.push(from_date); }
    if (to_date)    { conds.push(`b.inv_date <= $${idx++}`);  params.push(to_date); }

    const rows = await query(`
      SELECT
        CASE WHEN b.bill_type = 'wo' THEN b.wo_number ELSE b.po_number END AS wo_number,
        b.vendor_name,
        b.vendor_id,
        p.name                                     AS project_name,
        COUNT(b.id)::int                           AS bill_count,
        SUM(COALESCE(b.basic_amount,0))            AS gross_billed,
        SUM(COALESCE(b.gst_amount,0))              AS gst_amount,
        SUM(COALESCE(b.basic_amount,0) + COALESCE(b.gst_amount,0)) AS total_amount,
        SUM(COALESCE(u.retention_money,0))         AS retention_held,
        SUM(COALESCE(u.advance_recovered,0))       AS advance_recovered,
        SUM(COALESCE(u.tds_deduction,0))           AS tds_deducted,
        SUM(COALESCE(u.credit_note_amt,0))         AS credit_notes,
        SUM(COALESCE(u.other_deductions,0))        AS other_deductions,
        SUM(COALESCE(u.total_deductions,0))        AS total_deductions,
        SUM(CASE WHEN b.workflow_status != 'paid' THEN COALESCE(u.certified_net,0) ELSE 0 END) AS net_payable,
        SUM(CASE WHEN b.workflow_status='paid' THEN COALESCE(u.certified_net,0) ELSE 0 END) AS total_paid,
        MIN(b.inv_date)                            AS first_bill_date,
        MAX(b.inv_date)                            AS last_bill_date
      FROM tqs_bills b
      LEFT JOIN tqs_bill_updates u ON u.bill_id = b.id
      LEFT JOIN projects p ON p.id = b.project_id
      WHERE ${conds.join(' AND ')}
        AND b.bill_type = 'wo'
      GROUP BY CASE WHEN b.bill_type = 'wo' THEN b.wo_number ELSE b.po_number END,
               b.vendor_name, b.vendor_id, p.name
      ORDER BY gross_billed DESC
    `, params);

    const summary = rows.rows.reduce((acc, r) => ({
      total_gross:      acc.total_gross      + parseFloat(r.gross_billed||0),
      total_retention:  acc.total_retention  + parseFloat(r.retention_held||0),
      total_advance:    acc.total_advance    + parseFloat(r.advance_recovered||0),
      total_tds:        acc.total_tds        + parseFloat(r.tds_deducted||0),
      total_deductions: acc.total_deductions + parseFloat(r.total_deductions||0),
      total_net:        acc.total_net        + parseFloat(r.net_payable||0),
      total_paid:       acc.total_paid       + parseFloat(r.total_paid||0),
    }), { total_gross:0, total_retention:0, total_advance:0, total_tds:0, total_deductions:0, total_net:0, total_paid:0 });

    res.json({ data: rows.rows, summary });
  } catch (err) {
    console.error('[Deduction Register]', err.message);
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

// Accounts Payable aging — certified bills not yet fully paid
router.get('/ap-aging', async (req, res) => {
  try {
    const { project_id } = req.query;
    let conditions = [`b.company_id = $1`, `b.is_deleted = FALSE`,
                      `b.workflow_status IN ('qs','accounts')`,
                      `COALESCE(u.certified_net, 0) > 0`];
    const params = [req.user.company_id];
    applyProjectScope(req, conditions, params, 'b', project_id);

    const { rows } = await query(`
      SELECT
        b.id, b.sl_number, b.vendor_name, b.inv_number, b.inv_date,
        b.po_number, b.bill_type,
        p.name                                                   AS project_name,
        u.qs_certified_date,
        u.certified_net,
        COALESCE(u.paid_amount, 0)                               AS paid_amount,
        ${billOutstandingSql('b', 'u')}                          AS balance,
        u.payment_status,
        u.pc_number,
        u.pc_qs_signed_at,
        u.pc_pm_signed_at,
        u.pc_accts_signed_at,
        EXTRACT(DAY FROM NOW() - u.qs_certified_date)::INT       AS days_outstanding,
        CASE
          WHEN u.qs_certified_date IS NULL                                       THEN 'unscheduled'
          WHEN EXTRACT(DAY FROM NOW() - u.qs_certified_date) <= 30              THEN '0-30'
          WHEN EXTRACT(DAY FROM NOW() - u.qs_certified_date) <= 60              THEN '31-60'
          WHEN EXTRACT(DAY FROM NOW() - u.qs_certified_date) <= 90              THEN '61-90'
          ELSE '90+'
        END                                                       AS aging_bucket
      FROM tqs_bills b
      LEFT JOIN tqs_bill_updates u ON u.bill_id = b.id
      LEFT JOIN projects p          ON p.id     = b.project_id
      WHERE ${conditions.join(' AND ')}
      ORDER BY days_outstanding DESC NULLS LAST
    `, params);
    res.json({ data: rows });
  } catch (err) {
    console.error(err);
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

// ── GET /tqs/bills/untagged-items ──────────────────────────────────────────
// Line items with no cost head, grouped by description so they can be
// bulk-tagged in one action instead of opening each bill individually.
// MUST be defined before /:id routes so Express doesn't swallow it as a param
router.get('/untagged-items', async (req, res) => {
  try {
    const { project_id } = req.query;
    let conditions = [`b.company_id = $1`, `b.is_deleted = FALSE`, `li.cost_head IS NULL`];
    const params = [req.user.company_id];
    applyProjectScope(req, conditions, params, 'b', project_id);

    const { rows } = await query(`
      SELECT li.item_name AS description,
             COUNT(*)::int AS item_count,
             SUM(li.basic_amount) AS total_basic,
             array_agg(li.id) AS line_item_ids,
             array_agg(DISTINCT b.sl_number) AS bill_numbers
      FROM tqs_bill_line_items li
      JOIN tqs_bills b ON b.id = li.bill_id
      WHERE ${conditions.join(' AND ')}
      GROUP BY li.item_name
      ORDER BY SUM(li.basic_amount) DESC
    `, params);
    res.json({ data: rows });
  } catch (err) {
    console.error(err);
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

// ── POST /tqs/bills/bulk-tag-cost-head ─────────────────────────────────────
// Applies one cost head to a set of line items in a single action.
router.post('/bulk-tag-cost-head', async (req, res) => {
  try {
    const { line_item_ids, cost_head } = req.body;
    if (!Array.isArray(line_item_ids) || !line_item_ids.length) {
      return res.status(400).json({ error: 'line_item_ids required' });
    }
    if (!BOQ_COST_HEADS.includes(cost_head)) {
      return res.status(400).json({ error: 'Invalid cost head' });
    }
    // Scope to this company's own bills only.
    const { rows } = await query(`
      UPDATE tqs_bill_line_items li
      SET cost_head = $1
      FROM tqs_bills b
      WHERE li.bill_id = b.id AND b.company_id = $2 AND li.id = ANY($3::uuid[])
      RETURNING li.id
    `, [cost_head, req.user.company_id, line_item_ids]);
    res.json({ data: { tagged: rows.length } });
  } catch (err) {
    console.error(err);
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

// ── GET /tqs/bills/vendor-ledger ───────────────────────────────────────────
// Outstanding balance summary per vendor across all DQS bills
// MUST be defined before /:id routes so Express doesn't swallow it as a param
router.get('/vendor-ledger', async (req, res) => {
  try {
    const { project_id, vendor_id, bill_type, source_type } = req.query;
    const rows = await getVendorLiabilitySummary({
      companyId: req.user.company_id,
      projectId: project_id,
      projectIds: scopedProjectIds(req, project_id),
      vendorId: vendor_id,
      billType: bill_type,
      sourceType: source_type,
    });
    res.json({
      data: rows.map(row => ({
        ...row,
        outstanding: row.payable_balance,
        balance: row.net_balance,
        total_retention: 0,
      })),
    });
  } catch (err) {
    console.error(err);
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

// ── GET /tqs/bills/import/template  — download blank Excel template ────────
router.get('/import/template', (req, res) => {
  try {
    const XLSX = require('xlsx');
    const headers = [
      'Project Name *',
      'Bill Type * (po/wo)',
      'Vendor Name *',
      'PO Number',
      'PO Date (dd-mm-yyyy)',
      'Invoice Number *',
      'Invoice Date * (dd-mm-yyyy)',
      'Invoice Month (e.g. APRIL-2026)',
      'Received Date (dd-mm-yyyy)',
      'Work Description (WO only)',
      'Tax Mode (intrastate/interstate)',
      'Basic Amount *',
      'GST % (e.g. 18)',
      'Transport Charges',
      'Transport GST %',
      'Other Charges',
      'Remarks',
      'Status (pending/qs/accounts/paid)',
    ];
    const sample = [
      'Residential Apartments - Yelahanka',
      'po',
      'ABC Suppliers Pvt Ltd',
      'PO-2025-001',
      '01-04-2025',
      'INV-001',
      '05-04-2025',
      'APRIL-2025',
      '06-04-2025',
      '',
      'intrastate',
      '100000',
      '18',
      '0',
      '0',
      '0',
      '',
      'pending',
    ];
    const ws = XLSX.utils.aoa_to_sheet([headers, sample]);
    ws['!cols'] = headers.map(() => ({ wch: 28 }));
    // Style header row bold
    headers.forEach((_, c) => {
      const cell = XLSX.utils.encode_cell({ r: 0, c });
      if (!ws[cell]) return;
      ws[cell].s = { font: { bold: true }, fill: { fgColor: { rgb: '4F46E5' } } };
    });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Bills');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Disposition', 'attachment; filename="DQS_Bills_Import_Template.xlsx"');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buf);
  } catch (err) { res.status(err.statusCode || 500).json({ error: err.message }); }
});

// ── POST /tqs/bills/bulk-import — upload & process Excel ───────────────────
const multerMem = require('multer')({ storage: require('multer').memoryStorage() });
router.post('/bulk-import', multerMem.single('file'), async (req, res) => {
  try {
    const XLSX = require('xlsx');
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const { project_id } = req.body;
    if (!project_id) return res.status(400).json({ error: 'project_id required' });

    // Verify project belongs to company
    const proj = await query(
      `SELECT id, name FROM projects WHERE id=$1 AND company_id=$2`,
      [project_id, req.user.company_id]
    );
    if (!proj.rows.length) return res.status(404).json({ error: 'Project not found' });
    if (!userCanAccessProject(req, project_id)) {
      return res.status(403).json({ error: 'Access denied for this project.' });
    }

    const wb = XLSX.read(req.file.buffer, { type: 'buffer', cellDates: true });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });

    const parseDate = (v) => {
      if (!v) return null;
      if (v instanceof Date) return v.toISOString().slice(0, 10);
      const s = String(v).trim();
      // dd-mm-yyyy
      const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
      if (m) {
        const yr = m[3].length === 2 ? '20' + m[3] : m[3];
        return `${yr}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
      }
      const d = new Date(s);
      return isNaN(d) ? null : d.toISOString().slice(0, 10);
    };

    const created = [], skipped = [], errors = [];

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const rowNum = i + 2;

      const vendorName  = String(r['Vendor Name *'] || r['Vendor Name'] || '').trim();
      const invNumber   = String(r['Invoice Number *'] || r['Invoice Number'] || '').trim();
      const basicAmount = parseFloat(r['Basic Amount *'] || r['Basic Amount'] || 0);
      const billType    = String(r['Bill Type * (po/wo)'] || r['Bill Type'] || 'po').toLowerCase().trim();

      if (!vendorName)  { errors.push({ row: rowNum, reason: 'Vendor Name is required' }); continue; }
      if (!invNumber)   { errors.push({ row: rowNum, reason: 'Invoice Number is required' }); continue; }
      if (!basicAmount) { errors.push({ row: rowNum, reason: 'Basic Amount is required' }); continue; }
      if (!['po','wo'].includes(billType)) { errors.push({ row: rowNum, reason: `Invalid Bill Type "${billType}" — must be po or wo` }); continue; }

      // Duplicate check
      const dup = await query(
        `SELECT id FROM tqs_bills WHERE company_id=$1 AND project_id=$2 AND vendor_name ILIKE $3 AND inv_number=$4`,
        [req.user.company_id, project_id, vendorName, invNumber]
      );
      if (dup.rows.length) { skipped.push({ row: rowNum, reason: `Duplicate: ${vendorName} / ${invNumber}` }); continue; }

      // GST calculation
      const gstPct      = parseFloat(r['GST % (e.g. 18)'] || r['GST %'] || 0);
      const taxMode     = String(r['Tax Mode (intrastate/interstate)'] || r['Tax Mode'] || 'intrastate').toLowerCase().includes('inter') ? 'interstate' : 'intrastate';
      const gstAmt      = basicAmount * gstPct / 100;
      const cgstAmt     = taxMode === 'intrastate' ? gstAmt / 2 : 0;
      const sgstAmt     = taxMode === 'intrastate' ? gstAmt / 2 : 0;
      const igstAmt     = taxMode === 'interstate' ? gstAmt : 0;
      const transport   = parseFloat(r['Transport Charges'] || 0);
      const transportGstPct = parseFloat(r['Transport GST %'] || 0);
      const transportGstAmt = transport * transportGstPct / 100;
      const otherChg    = parseFloat(r['Other Charges'] || 0);
      const totalAmount = basicAmount + gstAmt + transport + transportGstAmt + otherChg;

      const statusRaw   = String(r['Status (pending/qs/accounts/paid)'] || r['Status'] || '').toLowerCase().trim();
      const validStatus = ['pending','stores','document_controller','qs','accounts','procurement','qs_sign','paid'];
      // WO bills default to 'stores'; PO bills default to 'pending'
      const statusDefault = billType === 'wo' ? 'stores' : 'pending';
      const status        = validStatus.includes(statusRaw) ? statusRaw : statusDefault;

      const slNumber = await nextSlNumber(billType, req.user.company_id);

      try {
        const billRes = await query(`
          INSERT INTO tqs_bills (
            company_id, project_id, sl_number, vendor_name,
            po_number, po_date, inv_number, inv_date, inv_month, received_date,
            bill_type, work_desc, tax_mode,
            basic_amount, cgst_pct, cgst_amt, sgst_pct, sgst_amt, igst_pct, igst_amt, gst_amount,
            transport_charges, transport_gst_pct, transport_gst_amt,
            other_charges, total_amount, remarks,
            workflow_status, created_by
          ) VALUES (
            $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,
            $14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29
          ) RETURNING id
        `, [
          req.user.company_id, project_id, slNumber, vendorName,
          String(r['PO Number'] || '').trim() || null,
          parseDate(r['PO Date (dd-mm-yyyy)'] || r['PO Date']),
          invNumber,
          parseDate(r['Invoice Date * (dd-mm-yyyy)'] || r['Invoice Date']),
          String(r['Invoice Month (e.g. APRIL-2026)'] || r['Invoice Month'] || '').trim() || null,
          parseDate(r['Received Date (dd-mm-yyyy)'] || r['Received Date']),
          billType,
          String(r['Work Description (WO only)'] || r['Work Description'] || '').trim() || null,
          taxMode,
          basicAmount, gstPct/2, cgstAmt, gstPct/2, sgstAmt, igstAmt > 0 ? gstPct : 0, igstAmt, gstAmt,
          transport, transportGstPct, transportGstAmt,
          otherChg, totalAmount,
          String(r['Remarks'] || '').trim() || null,
          status, req.user.id,
        ]);
        const billId = billRes.rows[0].id;

        // ── Create companion bill_updates row (required for PC tracking, certified amounts, etc.)
        const certifiedNet = ['qs', 'accounts', 'paid', 'procurement'].includes(status) ? totalAmount : 0;
        await query(
          `INSERT INTO tqs_bill_updates (bill_id, balance_to_pay, certified_net) VALUES ($1, $2, $3)`,
          [billId, totalAmount, certifiedNet]
        );

        // ── Auto-generate a PC number for bills already at accounts stage
        if (status === 'accounts') {
          const pcNum = await nextPCNumber();
          await query(
            `UPDATE tqs_bill_updates
             SET pc_number = $1, pc_generated_at = NOW(),
                 handed_over_accounts_date = COALESCE(handed_over_accounts_date, $2)
             WHERE bill_id = $3`,
            [pcNum, new Date().toISOString().slice(0, 10), billId]
          );
        }

        created.push({ row: rowNum, vendor: vendorName, inv: invNumber });
      } catch (err) {
        errors.push({ row: rowNum, reason: err.message });
      }
    }

    res.json({
      message: `Import complete: ${created.length} created, ${skipped.length} skipped, ${errors.length} errors`,
      created: created.length,
      skipped: skipped.length,
      errors,
      skipped_list: skipped,
    });
  } catch (err) { res.status(err.statusCode || 500).json({ error: err.message }); }
});

// ── GET /tqs/bills/advances — list advances ───────────────────────────────
router.get('/advances', async (req, res) => {
  try {
    const { project_id, vendor_id, search } = req.query;
    let conditions = [`a.company_id = $1`];
    const params   = [req.user.company_id];
    let i = 2;
    applyProjectScope(req, conditions, params, 'a', project_id);
    i = params.length + 1;
    if (vendor_id  && vendor_id.trim())  { conditions.push(`a.vendor_id  = $${i++}`); params.push(vendor_id); }
    if (search && search.trim()) {
      conditions.push(`(a.vendor_name ILIKE $${i} OR a.wo_number ILIKE $${i} OR a.po_number ILIKE $${i} OR a.voucher_number ILIKE $${i})`);
      params.push(`%${search.trim()}%`); i++;
    }

    const { rows } = await query(`
      SELECT a.*,
             p.name AS project_name,
             ROUND(a.amount - COALESCE(a.recovered_amount,0), 2) AS balance
      FROM tqs_advances a
      LEFT JOIN projects p ON p.id = a.project_id
      WHERE ${conditions.join(' AND ')}
      ORDER BY a.voucher_number ASC NULLS LAST, a.created_at DESC
    `, params);
    res.json({ data: rows });
  } catch (err) {
    console.error(err);
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

// ── GET /tqs/bills/advances/pending — unrecovered balance for a vendor ────
// Used by QS cert tab to auto-suggest advance_recovered amount
router.get('/advances/pending', async (req, res) => {
  try {
    const { vendor_id, vendor_name, wo_number, po_number, project_id } = req.query;
    // Combines both advance sources — an advance now lives in EITHER
    // tqs_advances OR tqs_advance_vouchers (the Procurement Advance Tracker),
    // never both: any advance migrated to the Tracker is removed from
    // tqs_advances at migration time, so summing both here can't double-count.
    // When a specific WO/PO is provided, match EXACTLY — do NOT include NULL-wo advances
    // (that caused all-vendor advances to be bundled into a single WO's pending total).
    let conditions = [`a.company_id = $1`, `a.amount > a.recovered_amount`];
    const params   = [req.user.company_id];
    let i = 2;
    applyProjectScope(req, conditions, params, 'a', project_id);
    i = params.length + 1;
    if (vendor_id && vendor_id.trim() && vendor_name) {
      conditions.push(`(a.vendor_id = $${i++} OR a.vendor_name ILIKE $${i++})`);
      params.push(vendor_id, `%${vendor_name}%`);
    } else if (vendor_id && vendor_id.trim()) {
      conditions.push(`(a.vendor_id = $${i++} OR a.vendor_id IS NULL)`);
      params.push(vendor_id);
    } else if (vendor_name) {
      conditions.push(`a.vendor_name ILIKE $${i++}`);
      params.push(`%${vendor_name}%`);
    }
    // Exact WO/PO match only — no NULL fallback when a specific number is requested
    if (wo_number) { conditions.push(`a.wo_number = $${i++}`); params.push(wo_number); }
    if (po_number) { conditions.push(`a.po_number = $${i++}`); params.push(po_number); }

    const r1 = await query(`
      SELECT
        SUM(a.amount)                          AS total_advanced,
        SUM(a.recovered_amount)                AS total_recovered,
        SUM(a.amount - a.recovered_amount)     AS pending_balance,
        json_agg(json_build_object(
          'id',               a.id,
          'source',           'bills',
          'amount',           a.amount,
          'recovered_amount', a.recovered_amount,
          'balance',          a.amount - a.recovered_amount,
          'payment_date',     a.payment_date,
          'wo_number',        a.wo_number,
          'reference_number', a.reference_number
        ) ORDER BY a.payment_date) AS advances
      FROM tqs_advances a
      WHERE ${conditions.join(' AND ')}
    `, params);

    // Same filters, against the Procurement Advance Tracker table.
    let vConditions = [`av.company_id = $1`, `av.is_deleted = FALSE`, `av.advance_value > av.recovered_amount`];
    const vParams   = [req.user.company_id];
    let vi = 2;
    applyProjectScope(req, vConditions, vParams, 'av', project_id);
    vi = vParams.length + 1;
    if (vendor_id && vendor_id.trim() && vendor_name) {
      vConditions.push(`(av.vendor_id = $${vi++} OR av.vendor_name ILIKE $${vi++})`);
      vParams.push(vendor_id, `%${vendor_name}%`);
    } else if (vendor_id && vendor_id.trim()) {
      vConditions.push(`(av.vendor_id = $${vi++} OR av.vendor_id IS NULL)`);
      vParams.push(vendor_id);
    } else if (vendor_name) {
      vConditions.push(`av.vendor_name ILIKE $${vi++}`);
      vParams.push(`%${vendor_name}%`);
    }
    if (wo_number) { vConditions.push(`av.wo_number = $${vi++}`); vParams.push(wo_number); }
    if (po_number) { vConditions.push(`av.po_number = $${vi++}`); vParams.push(po_number); }

    const r2 = await query(`
      SELECT
        SUM(COALESCE(av.paid_amount, av.advance_value))                      AS total_advanced,
        SUM(av.recovered_amount)                                              AS total_recovered,
        SUM(COALESCE(av.paid_amount, av.advance_value) - av.recovered_amount) AS pending_balance,
        json_agg(json_build_object(
          'id',               av.id,
          'source',           'voucher',
          'amount',           COALESCE(av.paid_amount, av.advance_value),
          'recovered_amount', av.recovered_amount,
          'balance',          COALESCE(av.paid_amount, av.advance_value) - av.recovered_amount,
          'payment_date',     av.pay_date,
          'wo_number',        av.wo_number,
          'reference_number', av.voucher_number
        ) ORDER BY av.pay_date) AS advances
      FROM tqs_advance_vouchers av
      WHERE ${vConditions.join(' AND ')}
    `, vParams);

    const totalAdvanced  = (parseFloat(r1.rows[0]?.total_advanced)  || 0) + (parseFloat(r2.rows[0]?.total_advanced)  || 0);
    const totalRecovered = (parseFloat(r1.rows[0]?.total_recovered) || 0) + (parseFloat(r2.rows[0]?.total_recovered) || 0);
    const pendingBalance = (parseFloat(r1.rows[0]?.pending_balance) || 0) + (parseFloat(r2.rows[0]?.pending_balance) || 0);
    const advances = [...(r1.rows[0]?.advances || []), ...(r2.rows[0]?.advances || [])].filter(Boolean);

    res.json({ data: { total_advanced: totalAdvanced, total_recovered: totalRecovered, pending_balance: pendingBalance, advances } });
  } catch (err) {
    console.error(err);
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

// ── POST /tqs/bills/advances — record an advance payment ─────────────────
router.post('/advances', async (req, res) => {
  try {
    const {
      project_id, vendor_id, vendor_name,
      wo_number, po_number,
      amount, payment_date, payment_mode, reference_number, bank_name, remarks,
      // tracker-specific
      voucher_number, voucher_date, po_date, order_value,
      qs_handover_date, acct_received_date, status,
    } = req.body;

    if (!vendor_name) return res.status(400).json({ error: 'vendor_name required' });
    if (project_id && !userCanAccessProject(req, project_id)) {
      return res.status(403).json({ error: 'Access denied for this project.' });
    }

    const result = await withTransaction(async (client) => {
      // 1. Insert advance record
      const adv = await client.query(`
        INSERT INTO tqs_advances
          (company_id, project_id, vendor_id, vendor_name, wo_number, po_number,
           amount, payment_date, payment_mode, reference_number, bank_name, remarks, created_by,
           voucher_number, voucher_date, po_date, order_value,
           qs_handover_date, acct_received_date, status)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
        RETURNING *
      `, [
        req.user.company_id, project_id || null, vendor_id || null, vendor_name,
        wo_number || null, po_number || null,
        parseFloat(amount || 0), payment_date || null,
        payment_mode || null, reference_number || null, bank_name || null,
        remarks || null, req.user.id,
        voucher_number || null, voucher_date || null, po_date || null,
        parseFloat(order_value || 0), qs_handover_date || null,
        acct_received_date || null, status || 'Pending',
      ]);
      const advance = adv.rows[0];

      // 2. Auto-create Finance payment record if project linked
      let finance_payment_id = null;
      if (project_id && payment_date) {
        const fp = await client.query(`
          INSERT INTO payments
            (project_id, payment_type, entity_name,
             amount, tds_deducted, net_amount,
             payment_date, payment_mode, reference_number, bank_name,
             cost_head, remarks, created_by, source)
          VALUES ($1,'vendor',$2,$3,0,$3,$4,$5,$6,$7,$8,$9,$10,'tqs_advance')
          RETURNING id
        `, [
          project_id, vendor_name,
          parseFloat(amount),
          payment_date,
          payment_mode || 'bank_transfer',
          reference_number || null,
          bank_name || null,
          (wo_number || po_number) ? `Advance — ${wo_number || po_number}` : 'Advance Payment',
          `Advance to ${vendor_name}${wo_number ? ` (WO: ${wo_number})` : ''}${po_number ? ` (PO: ${po_number})` : ''}`,
          req.user.id,
        ]);
        finance_payment_id = fp.rows[0].id;
        await client.query(
          `UPDATE tqs_advances SET finance_payment_id = $1 WHERE id = $2`,
          [finance_payment_id, advance.id]
        );
      }

      // 3. Auto-post JV: Dr Advance to Vendors/Subcontractors (1150), Cr Bank
      // (1010) — same treatment the Advance Tracker gives its vouchers, so the
      // GL / Chart of Accounts sees this cash-out too. Recovery clears against
      // AP later; this is not an expense yet.
      const amt = parseFloat(amount || 0);
      if (amt > 0) {
        const ref = advance.voucher_number || advance.reference_number || `ADV-${String(advance.id).slice(0, 8)}`;
        await postAutoJournal(client, {
          companyId: req.user.company_id,
          userId: req.user.id,
          entryDate: payment_date || new Date().toISOString().slice(0, 10),
          projectId: project_id || null,
          reference: ref,
          narration: `Advance paid — ${vendor_name} (${ref})`,
          source: 'auto_tqs_advance',
          lines: [
            { code: '1150', debit: amt, description: `Advance to ${vendor_name} — ${ref}` },
            { code: '1010', credit: amt, description: `Advance paid — ${ref}` },
          ],
        });
      }

      return { ...advance, finance_payment_id };
    });

    // WhatsApp notification (non-blocking)
    wa.notifyAdvanceCreated({
      voucherNumber: result.voucher_number,
      vendorName:    result.vendor_name,
      projectName:   null,           // project_id: result.project_id
      amount:        result.amount,
      paymentDate:   result.payment_date,
      woNumber:      result.wo_number,
      poNumber:      result.po_number,
      userId:        req.user.id,
    }).catch(e => console.error('[wa]', e.message));

    res.status(201).json({ data: result });
  } catch (err) {
    console.error(err);
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

// ── PATCH /tqs/bills/advances/:id/recover — mark advance as recovered ─────
router.patch('/advances/:id/recover', async (req, res) => {
  try {
    const { recovered_amount } = req.body;
    await getAccessibleAdvance(req, req.params.id);
    const { rows } = await query(`
      UPDATE tqs_advances SET recovered_amount = $1 WHERE id = $2 AND company_id = $3 RETURNING *
    `, [parseFloat(recovered_amount), req.params.id, req.user.company_id]);
    if (!rows.length) return res.status(404).json({ error: 'Advance not found' });
    res.json({ data: rows[0] });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

// ── PUT /tqs/bills/advances/:id — full update ─────────────────────────────
router.put('/advances/:id', async (req, res) => {
  try {
    const {
      vendor_name, wo_number, po_number,
      amount, payment_date, payment_mode, reference_number, bank_name, remarks,
      voucher_number, voucher_date, po_date, order_value,
      qs_handover_date, acct_received_date, status, recovered_amount,
    } = req.body;

    if (!vendor_name) return res.status(400).json({ error: 'vendor_name required' });
    await getAccessibleAdvance(req, req.params.id);

    // Old reference — the auto JV is keyed on it and must be replaced on edit
    const { rows: [oldAdv] } = await query(
      `SELECT id, voucher_number, reference_number, project_id FROM tqs_advances WHERE id = $1 AND company_id = $2`,
      [req.params.id, req.user.company_id]
    );

    const { rows } = await query(`
      UPDATE tqs_advances SET
        vendor_name       = $1,
        wo_number         = $2,
        po_number         = $3,
        amount            = $4,
        payment_date      = $5,
        payment_mode      = $6,
        reference_number  = $7,
        bank_name         = $8,
        remarks           = $9,
        voucher_number    = $10,
        voucher_date      = $11,
        po_date           = $12,
        order_value       = $13,
        qs_handover_date  = $14,
        acct_received_date = $15,
        status            = $16,
        recovered_amount  = $17
      WHERE id = $18 AND company_id = $19
      RETURNING *
    `, [
      vendor_name, wo_number || null, po_number || null,
      parseFloat(amount || 0), payment_date || null,
      payment_mode || null, reference_number || null, bank_name || null, remarks || null,
      voucher_number || null, voucher_date || null, po_date || null,
      parseFloat(order_value || 0), qs_handover_date || null,
      acct_received_date || null, status || 'Pending',
      parseFloat(recovered_amount || 0),
      req.params.id, req.user.company_id,
    ]);

    if (!rows.length) return res.status(404).json({ error: 'Advance not found' });

    // Replace the auto payment JV so the GL always mirrors the current values
    const updated = rows[0];
    const refOf = (a) => a.voucher_number || a.reference_number || `ADV-${String(a.id).slice(0, 8)}`;
    if (oldAdv) {
      await query(
        `DELETE FROM journal_entries WHERE company_id = $1 AND source = 'auto_tqs_advance' AND reference = $2`,
        [req.user.company_id, refOf(oldAdv)]
      ).catch(() => {});
    }
    const newAmt = parseFloat(updated.amount || 0);
    if (newAmt > 0) {
      await postAutoJournalStandalone({
        companyId: req.user.company_id,
        userId: req.user.id,
        entryDate: updated.payment_date || new Date().toISOString().slice(0, 10),
        projectId: updated.project_id || null,
        reference: refOf(updated),
        narration: `Advance paid — ${updated.vendor_name} (${refOf(updated)})`,
        source: 'auto_tqs_advance',
        lines: [
          { code: '1150', debit: newAmt, description: `Advance to ${updated.vendor_name} — ${refOf(updated)}` },
          { code: '1010', credit: newAmt, description: `Advance paid — ${refOf(updated)}` },
        ],
      });
    }

    res.json({ data: updated });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

// ── DELETE /tqs/bills/advances/:id ────────────────────────────────────────
router.delete('/advances/:id', async (req, res) => {
  try {
    await getAccessibleAdvance(req, req.params.id);
    const { rows } = await query(
      `DELETE FROM tqs_advances WHERE id = $1 AND company_id = $2 RETURNING id, voucher_number, reference_number`,
      [req.params.id, req.user.company_id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Advance not found' });
    // Remove the auto-posted payment JV so the GL doesn't keep a phantom advance
    const ref = rows[0].voucher_number || rows[0].reference_number || `ADV-${String(rows[0].id).slice(0, 8)}`;
    await query(
      `DELETE FROM journal_entries WHERE company_id = $1 AND source = 'auto_tqs_advance' AND reference = $2`,
      [req.user.company_id, ref]
    ).catch(() => {});
    res.json({ success: true });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

// ── GET /tqs/bills/concrete-tracker ─────────────────────────────────────────
// Returns pour cards + matched RMC bills + DPR daily concrete for a unified concrete view
router.get('/concrete-tracker', async (req, res) => {
  try {
    const { project_id, from_date, to_date } = req.query;
    const cid = req.user.company_id;

    // 1. Pour Cards
    const pcParams = [cid];
    let pcWhere = 'p.company_id = $1';
    let pcIdx = 2;
    if (project_id) { pcWhere += ` AND pc.project_id = $${pcIdx++}`; pcParams.push(project_id); }
    if (from_date)  { pcWhere += ` AND (pc.planned_pour_date >= $${pcIdx} OR pc.actual_pour_start >= $${pcIdx})`; pcParams.push(from_date); pcIdx++; }
    if (to_date)    { pcWhere += ` AND (pc.planned_pour_date <= $${pcIdx} OR pc.actual_pour_start <= $${pcIdx})`; pcParams.push(to_date); pcIdx++; }

    const pcRes = await query(`
      SELECT pc.id, pc.pour_card_number, pc.pour_description, pc.pour_type,
             pc.concrete_grade, pc.location, pc.drawing_ref,
             pc.planned_pour_date, pc.actual_pour_start, pc.actual_pour_end,
             pc.volume_planned, pc.volume_actual,
             pc.status, pc.contractor_rep, pc.remarks,
             pc.cube_sets_required, pc.cube_sets_taken,
             p.name AS project_name,
             u.name AS site_engineer_name,
             n.ncr_number,
             (SELECT COUNT(*) FROM quality_lab_tests lt WHERE lt.pour_card_id = pc.id) AS cube_test_count,
             (SELECT COUNT(*) FROM quality_lab_tests lt WHERE lt.pour_card_id = pc.id AND lt.result_status = 'pass') AS cube_pass_count
        FROM quality_pour_cards pc
        JOIN projects p ON pc.project_id = p.id
        LEFT JOIN users u ON pc.site_engineer_id = u.id
        LEFT JOIN quality_ncrs n ON pc.ncr_id = n.id
       WHERE ${pcWhere}
       ORDER BY COALESCE(pc.actual_pour_start, pc.planned_pour_date) DESC NULLS LAST
    `, pcParams);

    // 2. RMC / Concrete Bills — filter by work_desc OR vendor name containing concrete keywords
    const billParams = [cid];
    const billConds = [
      'b.is_deleted = FALSE',
      `(b.company_id = $1 OR b.company_id IS NULL)`,
      `(LOWER(COALESCE(b.work_desc,'')) ~ 'concrete|rmc|ready.?mix|cement|m\\d0'
        OR LOWER(COALESCE(b.vendor_name,'')) ~ 'concrete|rmc|ready.?mix|cement')`,
    ];
    let bIdx = 2;
    const bScope = [];
    applyProjectScope(req, bScope, billParams, 'b', project_id);
    bIdx = billParams.length + 1;
    if (bScope.length) billConds.push(...bScope);
    if (from_date) { billConds.push(`b.inv_date >= $${bIdx++}`); billParams.push(from_date); }
    if (to_date)   { billConds.push(`b.inv_date <= $${bIdx++}`); billParams.push(to_date); }

    const billRes = await query(`
      SELECT b.id, b.sl_number, b.vendor_name, b.vendor_id,
             b.po_number, b.po_date, b.inv_number, b.inv_date, b.inv_month,
             b.work_desc, b.basic_amount, b.gst_amount, b.total_amount,
             b.workflow_status, b.bill_type,
             u.paid_amount, u.balance_to_pay, u.certified_net,
             u.payment_status, u.payment_date, u.qs_certified_date,
             p.name AS project_name
        FROM tqs_bills b
        LEFT JOIN tqs_bill_updates u ON u.bill_id = b.id
        LEFT JOIN projects p ON p.id = b.project_id
       WHERE ${billConds.join(' AND ')}
       ORDER BY b.inv_date DESC NULLS LAST, b.created_at DESC
    `, billParams);

    // 3. DPR Concrete per day
    const dprParams = [cid];
    let dprWhere = 'd.project_id = (SELECT id FROM projects WHERE company_id = $1 LIMIT 1)';
    if (project_id) {
      dprWhere = 'd.project_id = $2';
      dprParams.push(project_id);
    }
    let dIdx = dprParams.length + 1;
    if (from_date) { dprWhere += ` AND d.report_date >= $${dIdx++}`; dprParams.push(from_date); }
    if (to_date)   { dprWhere += ` AND d.report_date <= $${dIdx++}`; dprParams.push(to_date); }

    let dprRows = [];
    try {
      const dprRes = await query(`
        SELECT d.report_date, d.material_consumed
          FROM daily_progress_reports d
         WHERE ${dprWhere}
         ORDER BY d.report_date DESC
      `, dprParams);

      dprRows = dprRes.rows.map(r => {
        const mc = r.material_consumed || {};
        const concrete = Array.isArray(mc.concrete_today) ? mc.concrete_today : [];
        return {
          report_date: r.report_date,
          grades: concrete.filter(c => c.grade && Number(c.qty) > 0),
          total_qty: concrete.reduce((s, c) => s + (Number(c.qty) || 0), 0),
        };
      }).filter(r => r.total_qty > 0);
    } catch (_) { /* DPR table may not exist in all environments */ }

    // 4. Summary aggregates
    const pours = pcRes.rows;
    const bills = billRes.rows;
    const summary = {
      total_pours:     pours.length,
      total_volume_planned: pours.reduce((s, p) => s + (Number(p.volume_planned) || 0), 0),
      total_volume_actual:  pours.reduce((s, p) => s + (Number(p.volume_actual)  || 0), 0),
      pours_closed:    pours.filter(p => p.status === 'closed').length,
      pours_active:    pours.filter(p => ['pre_pour','poured','curing','certs_pending'].includes(p.status)).length,
      total_bills:     bills.length,
      total_billed:    bills.reduce((s, b) => s + (Number(b.total_amount) || 0), 0),
      total_paid:      bills.reduce((s, b) => s + (Number(b.paid_amount)  || 0), 0),
      total_pending:   bills.reduce((s, b) => s + (Number(b.balance_to_pay) || 0), 0),
    };

    res.json({ data: { pour_cards: pours, bills: bills, dpr_daily: dprRows, summary } });
  } catch (err) {
    console.error('[concrete-tracker]', err.message);
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

// ── GET /tqs/bills ─────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { project_id, status, search, from_date, to_date, from, to, bill_type } = req.query;
    // accept either from_date/to_date or from/to aliases sent by the Reports Hub
    const dateFrom = from_date || from;
    const dateTo   = to_date   || to;

    let conditions = ['b.is_deleted = FALSE'];
    let params = [];
    let i = 1;

    if (req.user.company_id) {
      conditions.push(`(b.company_id = $${i++} OR b.company_id IS NULL)`);
      params.push(req.user.company_id);
    }
    applyProjectScope(req, conditions, params, 'b', project_id);
    i = params.length + 1;
    if (status)     { conditions.push(`b.workflow_status = $${i++}`); params.push(status); }
    if (bill_type)  { conditions.push(`b.bill_type = $${i++}`); params.push(bill_type); }
    if (dateFrom)   { conditions.push(`b.inv_date >= $${i++}`); params.push(dateFrom); }
    if (dateTo)     { conditions.push(`b.inv_date <= $${i++}`); params.push(dateTo); }
    if (search) {
      conditions.push(`(b.sl_number ILIKE $${i} OR b.inv_number ILIKE $${i} OR b.vendor_name ILIKE $${i})`);
      params.push(`%${search}%`); i++;
    }

    const result = await query(`
      SELECT b.*,
             u.payment_status, u.paid_amount, u.balance_to_pay, u.certified_net,
             COALESCE(u.qs_total, NULLIF(COALESCE(u.qs_gross, 0) + COALESCE(u.qs_tax, 0), 0), u.certified_net) AS certified_amount,
             u.pc_number, u.tds_deduction, u.payment_date,
             u.reference_number, u.bank_name, u.payment_mode,
             u.handed_over_accounts_date, u.qs_certified_date, u.pc_generated_at,
             ${billOutstandingSql('b', 'u')} AS liability_balance,
             ${billOutstandingSql('b', 'u')} AS balance_to_pay_display,
             p.name AS project_name
      FROM tqs_bills b
      LEFT JOIN tqs_bill_updates u ON u.bill_id = b.id
      LEFT JOIN projects p ON p.id = b.project_id
      WHERE ${conditions.join(' AND ')}
      ORDER BY b.inv_date DESC NULLS LAST, b.created_at DESC
    `, params);

    res.json({ data: result.rows });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

// ── POST /tqs/bills ────────────────────────────────────────────────────────
router.post('/', async (req, res) => {
  try {
    const {
      project_id, vendor_id, vendor_name,
      po_id, grn_id, po_number, po_date,
      inv_number, inv_date, inv_month, received_date, bill_type = 'po',
      work_desc, tax_mode = 'intrastate',
      hire_period_from, hire_period_to, equipment_type,
      basic_amount = 0, cgst_pct = 0, cgst_amt = 0,
      sgst_pct = 0, sgst_amt = 0, igst_pct = 0, igst_amt = 0,
      transport_charges = 0, transport_gst_pct = 0, transport_gst_amt = 0, transport_desc,
      other_charges = 0, other_charges_desc,
      credit_note_num, credit_note_val = 0,
      tcs_pct = 0,
      remarks, items = [],
    } = req.body;

    const gst_amount = parseFloat(cgst_amt) + parseFloat(sgst_amt) + parseFloat(igst_amt);
    const preTcsTotal = parseFloat(basic_amount) + gst_amount +
                         parseFloat(transport_charges) + parseFloat(transport_gst_amt) +
                         parseFloat(other_charges);
    // TCS is charged on the basic (ex-GST) amount only, not the full invoice value
    const tcs_amt = parseFloat(basic_amount) * (parseFloat(tcs_pct) || 0) / 100;
    const total_amount = preTcsTotal + tcs_amt;
    if (!project_id || !userCanAccessProject(req, project_id)) {
      return res.status(403).json({ error: 'Access denied for this project.' });
    }
    const sl_number = await nextSlNumber(bill_type, req.user.company_id);

    const result = await withTransaction(async (client) => {
      await assertNoDuplicateInvoice(client, {
        companyId: req.user.company_id,
        vendorName: vendor_name,
        invNumber: inv_number,
      });
      await assertPoAmountWithinLimit(client, {
        companyId: req.user.company_id,
        poId: po_id,
        poNumber: po_number,
        newTotalAmount: total_amount,
      });

      // WO bills start at Stores; Hire bills go straight to Accounts (no GRN/QS needed)
      const initialStatus = bill_type === 'wo' ? 'stores' : bill_type === 'hire' ? 'accounts' : 'pending';

      const bill = await client.query(`
        INSERT INTO tqs_bills (
          company_id, project_id, sl_number, vendor_id, vendor_name,
          po_id, grn_id, po_number, po_date, inv_number, inv_date, inv_month, received_date,
          bill_type, work_desc, tax_mode,
          basic_amount, cgst_pct, cgst_amt, sgst_pct, sgst_amt,
          igst_pct, igst_amt, gst_amount,
          transport_charges, transport_gst_pct, transport_gst_amt, transport_desc,
          other_charges, other_charges_desc,
          credit_note_num, credit_note_val,
          tcs_pct, tcs_amt,
          total_amount, remarks, workflow_status, created_by,
          hire_period_from, hire_period_to, equipment_type
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35,$36,$37,$38,$39,$40,$41)
        RETURNING *
      `, [
        req.user.company_id, project_id, sl_number, vendor_id || null, vendor_name,
        po_id || null, grn_id || null,
        po_number, po_date || null, inv_number, inv_date || null,
        inv_month, received_date || null,
        bill_type, work_desc || null, tax_mode,
        basic_amount, cgst_pct, cgst_amt, sgst_pct, sgst_amt,
        igst_pct, igst_amt, gst_amount,
        transport_charges, transport_gst_pct, transport_gst_amt, transport_desc || null,
        other_charges, other_charges_desc || null,
        credit_note_num || null, credit_note_val,
        parseFloat(tcs_pct) || 0, tcs_amt.toFixed(2),
        total_amount, remarks || null, initialStatus, req.user.id,
        hire_period_from || null, hire_period_to || null, equipment_type || null,
      ]);

      const billId = bill.rows[0].id;

      await client.query(
        `INSERT INTO tqs_bill_updates (bill_id, balance_to_pay) VALUES ($1, $2)`,
        [billId, total_amount]
      );

      // ── PO quantity guard ────────────────────────────────────────────────
      // For any line item that carries a po_item_id, check the remaining
      // invoiceable qty (min(ordered, GRN-received) − already invoiced).
      // Do this INSIDE the transaction so we lock against concurrent bills.
      const poItemIds = items.map(it => it.po_item_id).filter(Boolean);
      if (poItemIds.length) {
        const balRes = await client.query(`
          SELECT
            pi.id                                             AS po_item_id,
            pi.material_name                                  AS item_name,
            pi.quantity                                       AS ordered_qty,
            COALESCE(grn_agg.received_qty, 0)                 AS received_qty,
            COALESCE(inv_direct_agg.invoiced_qty, 0) + COALESCE(inv_legacy_agg.invoiced_qty, 0) AS invoiced_qty,
            GREATEST(0,
              pi.quantity
              - COALESCE(inv_direct_agg.invoiced_qty, 0)
              - COALESCE(inv_legacy_agg.invoiced_qty, 0)
            )                                                 AS remaining_qty
          FROM po_items pi
          JOIN purchase_orders po ON po.id = pi.po_id
          LEFT JOIN (
            SELECT gi.po_item_id, SUM(gi.quantity_received) AS received_qty
            FROM grn_items gi
            JOIN grn g ON g.id = gi.grn_id
            WHERE g.po_id = (SELECT po_id FROM po_items WHERE id = $1 LIMIT 1)
              AND g.quality_status = 'approved'
            GROUP BY gi.po_item_id
          ) grn_agg ON grn_agg.po_item_id = pi.id
          LEFT JOIN (
            SELECT li.po_item_id, SUM(li.quantity) AS invoiced_qty
            FROM tqs_bill_line_items li
            JOIN tqs_bills b ON b.id = li.bill_id
            WHERE li.po_item_id = ANY($2::uuid[])
              AND b.is_deleted = FALSE
            GROUP BY li.po_item_id
          ) inv_direct_agg ON inv_direct_agg.po_item_id = pi.id
          LEFT JOIN (
            SELECT
              COALESCE(b.po_id, po2.id) AS po_id,
              LOWER(TRIM(COALESCE(li.item_name, ''))) AS item_name,
              COALESCE(li.unit, '') AS unit,
              SUM(li.quantity) AS invoiced_qty
            FROM tqs_bill_line_items li
            JOIN tqs_bills b ON b.id = li.bill_id
            LEFT JOIN purchase_orders po2 ON po2.po_number = b.po_number
            WHERE li.po_item_id IS NULL
              AND b.is_deleted = FALSE
              AND COALESCE(b.bill_type, 'po') <> 'wo'
            GROUP BY COALESCE(b.po_id, po2.id), LOWER(TRIM(COALESCE(li.item_name, ''))), COALESCE(li.unit, '')
          ) inv_legacy_agg
            ON inv_legacy_agg.po_id = pi.po_id
           AND inv_legacy_agg.item_name = LOWER(TRIM(COALESCE(pi.material_name, '')))
           AND inv_legacy_agg.unit = COALESCE(pi.unit, '')
          WHERE pi.id = ANY($2::uuid[])
          FOR UPDATE OF pi
        `, [poItemIds[0], poItemIds]);

        const balMap = {};
        for (const row of balRes.rows) balMap[row.po_item_id] = row;

        for (const it of items) {
          if (!it.po_item_id) continue;
          const bal = balMap[it.po_item_id];
          if (!bal) continue;
          const requested = parseFloat(it.quantity || 0);
          const remaining = parseFloat(bal.remaining_qty);
          if (requested > remaining + 0.0001) {
            throw new Error(
              `Quantity exceeded for "${bal.item_name}": ` +
              `you entered ${requested} but only ${remaining} is available ` +
              `(ordered ${bal.ordered_qty}, GRN received ${bal.received_qty}, ` +
              `already invoiced ${bal.invoiced_qty}).`
            );
          }
        }
      }
      // ────────────────────────────────────────────────────────────────────

      const woItemIds = items.map(it => it.wo_item_id).filter(Boolean);
      if (woItemIds.length) {
        const balRes = await client.query(`
          SELECT
            woi.id AS wo_item_id,
            woi.description AS item_name,
            woi.quantity AS ordered_qty,
            COALESCE(sub_billed.billed_qty, 0) AS subcontractor_billed_qty,
            COALESCE(tqs_direct_billed.invoiced_qty, 0) + COALESCE(tqs_legacy_billed.invoiced_qty, 0) AS invoiced_qty,
            GREATEST(
              woi.quantity
                - COALESCE(sub_billed.billed_qty, 0)
                - COALESCE(tqs_direct_billed.invoiced_qty, 0)
                - COALESCE(tqs_legacy_billed.invoiced_qty, 0),
              0
            ) AS remaining_qty
          FROM work_order_items woi
          JOIN work_orders wo ON wo.id = woi.wo_id
          LEFT JOIN (
            SELECT bi.wo_item_id, SUM(bi.billed_qty) AS billed_qty
            FROM subcontractor_bill_items bi
            JOIN subcontractor_bills sb ON sb.id = bi.bill_id
            WHERE bi.wo_item_id = ANY($1::uuid[])
              AND sb.status <> 'rejected'
            GROUP BY bi.wo_item_id
          ) sub_billed ON sub_billed.wo_item_id = woi.id
          LEFT JOIN (
            SELECT li.wo_item_id, SUM(li.quantity) AS invoiced_qty
            FROM tqs_bill_line_items li
            JOIN tqs_bills b ON b.id = li.bill_id
            WHERE li.wo_item_id = ANY($1::uuid[])
              AND b.is_deleted = FALSE
            GROUP BY li.wo_item_id
          ) tqs_direct_billed ON tqs_direct_billed.wo_item_id = woi.id
          LEFT JOIN (
            SELECT
              COALESCE(b.wo_number, b.po_number) AS wo_number,
              LOWER(TRIM(COALESCE(li.item_name, ''))) AS item_name,
              COALESCE(li.unit, '') AS unit,
              SUM(li.quantity) AS invoiced_qty
            FROM tqs_bill_line_items li
            JOIN tqs_bills b ON b.id = li.bill_id
            WHERE li.wo_item_id IS NULL
              AND b.is_deleted = FALSE
              AND (LOWER(COALESCE(b.bill_type, '')) = 'wo' OR b.wo_number IS NOT NULL OR b.po_number ILIKE 'WO%')
            GROUP BY COALESCE(b.wo_number, b.po_number), LOWER(TRIM(COALESCE(li.item_name, ''))), COALESCE(li.unit, '')
          ) tqs_legacy_billed
            ON tqs_legacy_billed.wo_number = wo.wo_number
           AND tqs_legacy_billed.unit = COALESCE(woi.unit, '')
           AND (
             tqs_legacy_billed.item_name = LOWER(TRIM(COALESCE(woi.description, '')))
             OR (
               SELECT COUNT(*)
               FROM work_order_items same_unit
               WHERE same_unit.wo_id = wo.id
                 AND COALESCE(same_unit.unit, '') = COALESCE(woi.unit, '')
             ) = 1
           )
          WHERE woi.id = ANY($1::uuid[])
          FOR UPDATE OF woi
        `, [woItemIds]);

        const balMap = {};
        for (const row of balRes.rows) balMap[row.wo_item_id] = row;

        for (const it of items) {
          if (!it.wo_item_id) continue;
          const bal = balMap[it.wo_item_id];
          if (!bal) continue;
          const requested = parseFloat(it.quantity || 0);
          const remaining = parseFloat(bal.remaining_qty);
          if (requested > remaining + 0.0001) {
            throw new Error(
              `Quantity exceeded for "${bal.item_name}": ` +
              `you entered ${requested} but only ${remaining} is available ` +
              `(ordered ${bal.ordered_qty}, already invoiced ${bal.invoiced_qty}, ` +
              `subcontractor billed ${bal.subcontractor_billed_qty}).`
            );
          }
        }
      }

      // Material lines rarely map to one BOQ row, so cost head is usually set
      // at the PO level, not per line — default any blank line cost_head from
      // the linked PO so spend still rolls up under the right cost head.
      let poDefaultCostHead = null;
      if (po_id) {
        const poRes = await client.query(`SELECT cost_head FROM purchase_orders WHERE id = $1`, [po_id]);
        poDefaultCostHead = poRes.rows[0]?.cost_head || null;
      }

      for (let idx = 0; idx < items.length; idx++) {
        const it = items[idx];
        const gross = parseFloat(it.quantity || 0) * parseFloat(it.rate || 0);
        const discount = Math.abs(parseFloat(it.discount_amount || 0) || 0);
        const basic = Number.isFinite(parseFloat(it.basic_amount))
          ? parseFloat(it.basic_amount)
          : gross - discount;
        const gstPct = parseFloat(it.gst_pct || 18);
        const mode = it.gst_mode || tax_mode;
        let cgP = 0, sgP = 0, igP = 0, cgA = 0, sgA = 0, igA = 0;
        if (mode === 'interstate') { igP = gstPct; igA = basic * igP / 100; }
        else { cgP = gstPct / 2; sgP = gstPct / 2; cgA = basic * cgP / 100; sgA = basic * sgP / 100; }
        const gst_a = cgA + sgA + igA;
        const costHead = BOQ_COST_HEADS.includes(it.cost_head)
          ? it.cost_head
          : (poDefaultCostHead || classifyItemCostHead(it.item_name));
        await client.query(`
          INSERT INTO tqs_bill_line_items
            (bill_id, category, item_code, item_name, unit, quantity, rate,
             discount_amount, basic_amount, gst_pct, gst_mode,
             cgst_pct, cgst_amt, sgst_pct, sgst_amt, igst_pct, igst_amt,
             gst_amount, total_amount, sort_order, po_item_id, wo_item_id,
             physical_qty, physical_unit, conversion_factor, boq_item_id, cost_head)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27)
        `, [billId, it.category || null, it.item_code || null, it.item_name,
            it.unit, it.quantity, it.rate, discount, basic, gstPct, mode,
            cgP, cgA, sgP, sgA, igP, igA, gst_a, basic + gst_a, idx,
            it.po_item_id || null, it.wo_item_id || null,
            it.physical_qty    || null,
            it.physical_unit   || null,
            it.conversion_factor ? parseFloat(it.conversion_factor) : 1,
            it.boq_item_id || null, costHead]);
      }

      // ── AUTO-UPDATE STORE LEDGER ─────────────────────────────────────────────
      // For every line item that has a material name and quantity, upsert the
      // inventory (closing_stock += qty) and log a stock_transaction.
      // This runs for both PO and WO bills so the store ledger always reflects
      // materials received regardless of whether a formal GRN was raised.
      if (items.length && project_id) {
        for (const it of items) {
          if (!it.item_name || parseFloat(it.quantity || 0) <= 0) continue;
          const qty      = parseFloat(it.quantity);
          const unitRate = it.rate ? parseFloat(it.rate) : 0;
          const matName  = String(it.item_name).trim();
          const matUnit  = String(it.unit || '').trim() || 'Nos';
          const matCode  = it.item_code || null;
          const matCat   = it.category || null;

          // Upsert inventory row — unique on (project_id, material_name, site_location)
          // Default site_location to 'main' to match existing store ledger entries.
          const invRes = await client.query(`
            INSERT INTO inventory (project_id, material_name, material_code, unit, category,
                                   unit_rate, closing_stock, site_location, last_updated)
            VALUES ($1, $2, $3, $4, $5, $6, $7, 'main', NOW())
            ON CONFLICT (project_id, material_name, site_location)
            DO UPDATE SET
              closing_stock = inventory.closing_stock + $7,
              unit_rate     = CASE WHEN $6 > 0 THEN $6 ELSE inventory.unit_rate END,
              unit          = COALESCE($4, inventory.unit),
              category      = COALESCE($5, inventory.category),
              last_updated  = NOW()
            RETURNING id
          `, [project_id, matName, matCode, matUnit, matCat, unitRate, qty]);

          const inventoryId = invRes.rows[0]?.id;
          if (!inventoryId) continue;

          // Log stock transaction for audit trail
          await client.query(`
            INSERT INTO stock_transactions
              (project_id, inventory_id, transaction_type, quantity,
               reference_id, reference_number, remarks, transacted_by, transacted_at)
            VALUES ($1, $2, 'bill_receipt', $3, $4, $5, $6, $7, NOW())
          `, [
            project_id, inventoryId, qty,
            billId,
            sl_number,
            `Received via Invoice ${inv_number || ''} — ${vendor_name || ''}`,
            req.user.id,
          ]);
        }
      }
      // ─────────────────────────────────────────────────────────────────────────

      return bill.rows[0];
    });

    // logHistory uses the global pool (outside the transaction) so must run
    // after withTransaction commits — otherwise the FK on bill_id doesn't exist yet
    await logHistory(result.id, 'system', 'Bill created', req.user.id);
    maybeSendPoConsumptionAlert({
      companyId: req.user.company_id,
      poId: result.po_id,
      bill: result,
    }).catch(err => logger.warn(`[po-alert] ${err.message}`));

    res.status(201).json({ data: result });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

// ── PATCH /tqs/bills/:id/meta — update project, package description & (admin) workflow_status / inv_number
router.patch('/:id/meta', async (req, res) => {
  try {
    const { project_id, work_desc, workflow_status, inv_number, vendor_name, po_number, po_id } = req.body;
    await getAccessibleBill(req, req.params.id);
    if (project_id && !userCanAccessProject(req, project_id)) {
      return res.status(403).json({ error: 'Access denied for this project.' });
    }

    const VALID_STATUSES = ['pending','stores','document_controller','qs','accounts','procurement','qs_sign','paid'];
    const canOverrideStatus = req.user && DQS_FULL_ACCESS_ROLES.includes(req.user.role);

    if ((inv_number || vendor_name || po_number || po_id !== undefined) && canOverrideStatus) {
      const sets = [];
      const vals = [];
      if (inv_number)          { sets.push(`inv_number=$${sets.length+1}`);  vals.push(inv_number.trim()); }
      if (vendor_name)         { sets.push(`vendor_name=$${sets.length+1}`); vals.push(vendor_name.trim()); }
      if (po_number)           { sets.push(`po_number=$${sets.length+1}`);   vals.push(po_number.trim()); }
      if (po_id !== undefined) { sets.push(`po_id=$${sets.length+1}`);       vals.push(po_id || null); }
      sets.push(`updated_at=NOW()`);
      vals.push(req.params.id);
      await query(`UPDATE tqs_bills SET ${sets.join(', ')} WHERE id=$${vals.length}`, vals);
    } else if (workflow_status && canOverrideStatus && VALID_STATUSES.includes(workflow_status)) {
      await query(
        `UPDATE tqs_bills SET project_id=$1, work_desc=$2, workflow_status=$3, updated_at=NOW() WHERE id=$4`,
        [project_id || null, work_desc || null, workflow_status, req.params.id]
      );
      await logHistory(req.params.id, 'system', `Status manually set to "${workflow_status}" by admin`, req.user.id);
    } else {
      await query(`UPDATE tqs_bills SET project_id=$1, work_desc=$2, updated_at=NOW() WHERE id=$3`,
        [project_id || null, work_desc || null, req.params.id]);
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

// ── GET /tqs/bills/pc-pending — all PCs at accounts stage ─────────────────
router.get('/pc-pending', authenticate, async (req, res) => {
  try {
    const conditions = [
      `b.workflow_status IN ('accounts', 'partial', 'verified', 'authorized')`,
      `b.company_id = $1`,
      `b.is_deleted = FALSE`,
    ];
    const params = [req.user.company_id];
    applyProjectScope(req, conditions, params, 'b', req.query.project_id || null);
    const { rows } = await query(`
      SELECT
        COALESCE(u.pc_number, 'UNASSIGNED-' || b.id::text) AS pc_number,
        COALESCE(u.pc_number IS NOT NULL, FALSE)            AS has_pc,
        COUNT(*)                                            AS bill_count,
        ROUND(COALESCE(SUM(u.certified_net), SUM(b.total_amount))::numeric, 2)              AS total_certified,
        ROUND(SUM(COALESCE(u.paid_amount,0))::numeric, 2)                                   AS total_paid,
        ROUND(SUM(${billOutstandingSql('b', 'u')})::numeric, 2)                              AS balance_due,
        ROUND(SUM(COALESCE(u.tds_deduction,0))::numeric, 2)                                 AS total_tds,
        MAX(b.vendor_name)              AS vendor_name,
        (MAX(b.project_id::text))::uuid AS project_id,
        MIN(u.handed_over_accounts_date) AS accounts_since,
        -- Unrecovered advance balance for this vendor+project
        ROUND(COALESCE((
          SELECT SUM(GREATEST(0, a.amount - COALESCE(a.recovered_amount, 0)))
          FROM tqs_advances a
          WHERE a.company_id = $1
            AND LOWER(TRIM(a.vendor_name)) = LOWER(TRIM(MAX(b.vendor_name)))
            AND (a.project_id IS NULL OR a.project_id = (MAX(b.project_id::text))::uuid)
        ), 0)::numeric, 2) AS advance_balance,
        JSON_AGG(JSON_BUILD_OBJECT(
          'id',           b.id,
          'sl_number',    b.sl_number,
          'inv_number',   b.inv_number,
          'inv_date',     b.inv_date,
          'certified_net',COALESCE(u.certified_net, b.total_amount),
          'tds',          u.tds_deduction,
          'paid_amount',  u.paid_amount,
          'status',       b.workflow_status
        ) ORDER BY b.sl_number) AS bills
      FROM tqs_bills b
      LEFT JOIN tqs_bill_updates u ON u.bill_id = b.id
      WHERE ${conditions.join(' AND ')}
      GROUP BY COALESCE(u.pc_number, 'UNASSIGNED-' || b.id::text),
               COALESCE(u.pc_number IS NOT NULL, FALSE)
      ORDER BY MIN(b.updated_at)
    `, params);

    // Compute net_balance = balance_due - advance_balance (floor at 0)
    const data = rows.map(r => ({
      ...r,
      advance_balance: parseFloat(r.advance_balance || 0),
      net_balance: Math.max(0, parseFloat(r.balance_due || 0) - parseFloat(r.advance_balance || 0)),
    }));

    res.json({ data });
  } catch (err) {
    console.error(err);
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

// ── POST /tqs/bills/pc-payment — pay entire/partial PC ────────────────────
router.post('/pc-payment', authenticate, async (req, res) => {
  try {
    const { pc_number, paid_amount, payment_date, payment_mode, reference_number, bank_name, remarks } = req.body;
    if (!pc_number) return res.status(400).json({ error: 'pc_number is required' });

    // Fetch all bills under this PC — include already-partial ones too,
    // and fetch existing paid_amount for proper accumulation
    const { rows: bills } = await query(`
      SELECT b.id, b.project_id, b.vendor_name, b.bill_type, b.sl_number, b.inv_number,
             b.total_amount, u.certified_net, u.tds_deduction, u.other_deductions, u.advance_recovered,
             COALESCE(u.paid_amount, 0) AS existing_paid
      FROM tqs_bills b
      JOIN tqs_bill_updates u ON u.bill_id = b.id
      WHERE u.pc_number = $1
        AND b.workflow_status IN ('accounts', 'partial')
        AND b.is_deleted = FALSE
        AND b.company_id = $2
    `, [pc_number, req.user.company_id]);

    if (!bills.length) return res.status(404).json({ error: 'No pending bills found for this PC' });
    for (const bill of bills) {
      if (!userCanAccessProject(req, bill.project_id)) {
        return res.status(403).json({ error: 'Access denied for this project.' });
      }
    }

    const totalCertified = bills.reduce((s, b) => s + billPayableCap(b), 0);
    const totalTds       = bills.reduce((s, b) => s + parseFloat(b.tds_deduction  || 0), 0);
    const payAmt         = parseFloat(paid_amount) || totalCertified;

    await withTransaction(async (client) => {
      for (const bill of bills) {
        const cert         = billPayableCap(bill);
        const prevPaid     = parseFloat(bill.existing_paid  || 0);
        const remaining    = Math.max(0, cert - prevPaid);
        // Prorate this payment across bills by certified_net share
        const thisPayment  = totalCertified > 0
          ? Math.round((cert / totalCertified) * payAmt * 100) / 100
          : cert;
        if (thisPayment > remaining + 0.01) {
          const err = new Error(`Payment exceeds payable balance for ${bill.sl_number}. Remaining payable is ${inrText(remaining)}.`);
          err.statusCode = 400;
          throw err;
        }
        // Accumulate — add to whatever was already paid
        const totalBillPaid = Math.round((prevPaid + thisPayment) * 100) / 100;
        const billBal       = Math.max(0, cert - totalBillPaid);
        const billStatus    = billBal < 0.01 ? 'paid' : 'partial';

        await client.query(`
          UPDATE tqs_bill_updates SET
            paid_amount      = $1,
            balance_to_pay   = $2,
            payment_status   = $3,
            payment_date     = $4,
            payment_mode     = $5,
            reference_number = $6,
            bank_name        = $7,
            updated_at       = NOW()
          WHERE bill_id = $8
        `, [totalBillPaid, billBal, billStatus,
            payment_date || null, payment_mode || null,
            reference_number || null, bank_name || null,
            bill.id]);

        await client.query(
          `UPDATE tqs_bills SET workflow_status = $1, updated_at = NOW() WHERE id = $2`,
          [billStatus === 'paid' ? 'paid' : 'accounts', bill.id]
        );

        await logHistory(bill.id, 'accounts',
          `${prevPaid > 0 ? 'Partial' : 'PC'} payment — PC: ${pc_number} +₹${thisPayment} (total paid: ₹${totalBillPaid}, balance: ₹${billBal})${reference_number ? ' Ref:' + reference_number : ''}`,
          req.user.id);
      }

      // Record in Finance payments table
      if (payAmt > 0 && payment_date && bills[0].project_id) {
        const payType  = bills[0].bill_type === 'wo' ? 'subcontractor' : bills[0].bill_type === 'hire' ? 'vendor' : 'vendor';
        const costHead = bills[0].bill_type === 'wo' ? 'Subcontractor' : bills[0].bill_type === 'hire' ? 'Hire/Rental' : 'Material';
        const netPaid  = Math.max(0, payAmt - totalTds);
        await client.query(`
          INSERT INTO payments
            (project_id, payment_type, entity_name,
             amount, tds_deducted, net_amount,
             payment_date, payment_mode, reference_number, bank_name,
             cost_head, pc_number, remarks, created_by, source)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
        `, [
          bills[0].project_id, payType, bills[0].vendor_name,
          payAmt, totalTds, netPaid,
          payment_date,
          payment_mode || 'bank_transfer',
          reference_number || null,
          bank_name || null,
          costHead,
          pc_number,
          `PC: ${pc_number} — ${bills.length} bill${bills.length > 1 ? 's' : ''}${remarks ? ' — ' + remarks : ''}`,
          req.user.id, 'tqs',
        ]);
      }
    });

    // WhatsApp notification (non-blocking)
    const netPaid = Math.max(0, payAmt - totalTds);
    wa.notifyPaymentReceived({
      pcNumber:    pc_number,
      vendorName:  bills[0].vendor_name,
      projectName: null,           // project_id available: bills[0].project_id
      amount:      payAmt,
      tds:         totalTds,
      netPaid,
      utr:         reference_number,
      paymentDate: payment_date,
      billCount:   bills.length,
      userId:      req.user.id,
    }).catch(e => console.error('[wa]', e.message));

    res.json({ data: { pc_number, bills_updated: bills.length, total_paid: payAmt } });
  } catch (err) {
    console.error(err);
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

// ── GET /tqs/bills/export/excel — download all filtered bills as XLSX ────────
router.get('/export/excel', async (req, res) => {
  try {
    const XLSX = require('xlsx');
    const { project_id, status, search, bill_type, from_date, to_date, from, to } = req.query;
    const dateFrom = from_date || from;
    const dateTo   = to_date   || to;

    let conditions = ['b.is_deleted = FALSE'];
    let params = [];
    let i = 1;

    if (req.user.company_id) {
      conditions.push(`(b.company_id = $${i++} OR b.company_id IS NULL)`);
      params.push(req.user.company_id);
    }
    applyProjectScope(req, conditions, params, 'b', project_id);
    i = params.length + 1;
    if (status)     { conditions.push(`b.workflow_status = $${i++}`); params.push(status); }
    if (bill_type)  { conditions.push(`b.bill_type = $${i++}`); params.push(bill_type); }
    if (dateFrom)   { conditions.push(`b.inv_date >= $${i++}`); params.push(dateFrom); }
    if (dateTo)     { conditions.push(`b.inv_date <= $${i++}`); params.push(dateTo); }
    if (search) {
      conditions.push(`(b.sl_number ILIKE $${i} OR b.inv_number ILIKE $${i} OR b.vendor_name ILIKE $${i})`);
      params.push(`%${search}%`); i++;
    }

    const { rows } = await query(`
      SELECT b.id, b.sl_number, b.bill_type, b.vendor_name, b.vendor_id,
             b.po_number, b.wo_number, b.inv_number, b.inv_date, b.inv_month,
             b.basic_amount, b.gst_amount, b.cgst_amt, b.sgst_amt, b.igst_amt,
             b.transport_charges, b.other_charges, b.total_amount,
             b.workflow_status, b.remarks, b.project_id,
             b.created_at, b.updated_at,
             u.pc_number, u.certified_net, u.tds_deduction, u.balance_to_pay,
             u.paid_amount, u.payment_date, u.reference_number, u.bank_name, u.payment_mode,
             u.qs_certified_date, u.handed_over_accounts_date, u.pc_generated_at,
             u.other_deductions, u.advance_recovered,
             p.name AS project_name
      FROM tqs_bills b
      LEFT JOIN tqs_bill_updates u ON u.bill_id = b.id
      LEFT JOIN projects p ON p.id = b.project_id
      WHERE ${conditions.join(' AND ')}
      ORDER BY b.inv_date DESC NULLS LAST, b.created_at DESC
    `, params);

    const fmt = (v) => v ? Number(v) : 0;
    const fmtDate = (v) => v ? new Date(v).toLocaleDateString('en-IN') : '';

    const headers = [
      'SL No', 'Type', 'Vendor', 'PO/WO No', 'Invoice #', 'Invoice Date',
      'Basic (₹)', 'GST (₹)', 'Transport (₹)', 'Other (₹)', 'Total (₹)',
      'PC Number', 'Certified Net (₹)', 'TDS (₹)', 'Balance Due (₹)',
      'Paid Amount (₹)', 'Payment Date', 'UTR/Reference', 'Bank', 'Payment Mode',
      'QS Certified Date', 'Accounts Date', 'Stage', 'Project', 'Remarks',
    ];

    const dataRows = rows.map(r => [
      r.sl_number, r.bill_type === 'wo' ? 'WO' : 'PO', r.vendor_name,
      r.po_number || '', r.inv_number, fmtDate(r.inv_date),
      fmt(r.basic_amount), fmt(r.gst_amount), fmt(r.transport_charges),
      fmt(r.other_charges), fmt(r.total_amount),
      r.pc_number || '', fmt(r.certified_net), fmt(r.tds_deduction),
      fmt(r.balance_to_pay), fmt(r.paid_amount), fmtDate(r.payment_date),
      r.reference_number || '', r.bank_name || '', r.payment_mode || '',
      fmtDate(r.qs_certified_date), fmtDate(r.handed_over_accounts_date),
      r.workflow_status, r.project_name || '', r.remarks || '',
    ]);

    const ws = XLSX.utils.aoa_to_sheet([headers, ...dataRows]);
    ws['!cols'] = headers.map(() => ({ wch: 18 }));
    ws['!cols'][2] = { wch: 28 }; // Vendor wider
    ws['!cols'][11] = { wch: 22 }; // PC Number wider

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'DQS Bills');

    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const date = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Disposition', `attachment; filename="DQS_Bills_${date}.xlsx"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buf);
  } catch (err) {
    console.error(err);
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

// ── PATCH /tqs/bills/:id/advance-stage — move bill to the next workflow stage ─
const STAGE_ORDER      = ['pending', 'stores', 'document_controller', 'qs', 'accounts', 'procurement', 'qs_sign', 'paid'];
const HIRE_STAGE_ORDER = ['accounts', 'paid'];

router.patch('/:id/advance-stage', async (req, res) => {
  try {
    await getAccessibleBill(req, req.params.id);
    const { rows } = await query(
      `SELECT b.workflow_status, b.bill_type, b.total_amount, u.bill_id
       FROM tqs_bills b
       LEFT JOIN tqs_bill_updates u ON u.bill_id = b.id
       WHERE b.id = $1 AND b.company_id = $2 AND b.is_deleted = FALSE`,
      [req.params.id, req.user.company_id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Bill not found' });

    const current    = rows[0].workflow_status;
    const stageOrder = rows[0].bill_type === 'hire' ? HIRE_STAGE_ORDER : STAGE_ORDER;
    const idx = stageOrder.indexOf(current);
    if (idx === -1 || idx >= stageOrder.length - 1) {
      return res.status(400).json({ error: 'Bill is already at the final stage' });
    }

    const nextStage = stageOrder[idx + 1];

    // Update the bill stage
    await query(
      `UPDATE tqs_bills SET workflow_status = $1, updated_at = NOW() WHERE id = $2`,
      [nextStage, req.params.id]
    );

    // Ensure tqs_bill_updates row exists
    if (!rows[0].bill_id) {
      await query(
        `INSERT INTO tqs_bill_updates (bill_id, balance_to_pay, certified_net)
         VALUES ($1, $2, 0) ON CONFLICT (bill_id) DO NOTHING`,
        [req.params.id, rows[0].total_amount]
      );
    }

    // Auto-generate PC number when advancing to 'accounts'
    if (nextStage === 'accounts') {
      const pcNum = await nextPCNumber();
      await query(
        `UPDATE tqs_bill_updates
         SET pc_number = $1, pc_generated_at = NOW(),
             handed_over_accounts_date = COALESCE(handed_over_accounts_date, $2)
         WHERE bill_id = $3`,
        [pcNum, new Date().toISOString().slice(0, 10), req.params.id]
      );
    }

    await logHistory(req.params.id, nextStage, `Advanced to ${nextStage}`, req.user.id);

    // Return updated bill
    const updated = await query(
      `SELECT b.*, u.pc_number, u.payment_status, u.paid_amount, u.balance_to_pay,
              u.certified_net, u.tds_deduction, u.payment_date, u.reference_number,
              u.bank_name, u.payment_mode, u.handed_over_accounts_date, u.qs_certified_date,
              u.pc_generated_at,
              ${billOutstandingSql('b', 'u')} AS liability_balance,
              p.name AS project_name
       FROM tqs_bills b
       LEFT JOIN tqs_bill_updates u ON u.bill_id = b.id
       LEFT JOIN projects p ON p.id = b.project_id
       WHERE b.id = $1`,
      [req.params.id]
    );

    // WhatsApp notification (non-blocking)
    const b = updated.rows[0] || {};
    wa.notifyBillStageChanged({
      slNumber:    b.sl_number,
      vendorName:  b.vendor_name,
      fromStage:   current,
      toStage:     nextStage,
      projectName: b.project_name,
      amount:      b.total_amount,
      pcNumber:    b.pc_number,
      userId:      req.user.id,
    }).catch(e => console.error('[wa]', e.message));

    res.json({ data: updated.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

// ── GET /tqs/bills/check-duplicate ─────────────────────────────────────────
router.get('/check-duplicate', async (req, res) => {
  try {
    const { vendor_name, inv_number, exclude_id } = req.query;
    if (!vendor_name || !inv_number) return res.json({ data: [] });
    const params = [req.user.company_id, vendor_name.trim(), inv_number.trim().toUpperCase()];
    const where = [`b.company_id=$1`, `b.vendor_name ILIKE $2`, `UPPER(TRIM(b.inv_number))=$3`, `b.is_deleted=FALSE`];
    if (exclude_id) { where.push(`b.id <> $${params.length + 1}`); params.push(exclude_id); }
    const { rows } = await query(`
      SELECT b.id, b.sl_number, b.inv_number, b.inv_date, b.total_amount, b.workflow_status,
             p.name AS project_name
      FROM tqs_bills b
      LEFT JOIN projects p ON p.id = b.project_id
      WHERE ${where.join(' AND ')}
      ORDER BY b.created_at DESC LIMIT 5
    `, params);
    res.json({ data: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /tqs/bills/vendor-outstanding ──────────────────────────────────────
router.get('/vendor-outstanding', async (req, res) => {
  try {
    const { vendor_name, vendor_id } = req.query;
    if (!vendor_name && !vendor_id) return res.json({ data: null });
    const params = [req.user.company_id];
    const where = [`b.company_id=$1`, `b.is_deleted=FALSE`, `b.workflow_status NOT IN ('paid')`];
    if (vendor_id) { where.push(`b.vendor_id=$${params.length+1}`); params.push(vendor_id); }
    else { where.push(`b.vendor_name ILIKE $${params.length+1}`); params.push(vendor_name.trim()); }
    const { rows } = await query(`
      SELECT COUNT(*)::int AS bill_count,
             COALESCE(SUM(b.total_amount),0) AS total_invoiced,
             COALESCE(SUM(COALESCE(u.paid_amount,0)),0) AS total_paid,
             MIN(b.inv_date) AS oldest_inv_date,
             MAX(b.workflow_status) AS latest_status
      FROM tqs_bills b
      LEFT JOIN tqs_bill_updates u ON u.bill_id = b.id
      WHERE ${where.join(' AND ')}
    `, params);
    const r = rows[0];
    res.json({ data: { bill_count: r.bill_count, total_outstanding: r.total_invoiced - r.total_paid, oldest_inv_date: r.oldest_inv_date } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /tqs/bills/:id ─────────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const billConds = ['b.id = $1', 'b.is_deleted = FALSE', '(b.company_id = $2 OR b.company_id IS NULL)'];
    const billParams = [req.params.id, req.user.company_id];
    applyProjectScope(req, billConds, billParams, 'b', null);
    const [bill, updates, items, files, history] = await Promise.all([
      query(`
        SELECT b.*,
               ${billOutstandingSql('b', 'u')} AS liability_balance,
               p.name AS project_name,
               po.po_number    AS linked_po_number,
               po.grand_total  AS linked_po_total,
               g.grn_number    AS linked_grn_number,
               g.grn_date      AS linked_grn_date
        FROM tqs_bills b
        LEFT JOIN tqs_bill_updates u ON u.bill_id = b.id
        LEFT JOIN projects p         ON p.id  = b.project_id
        LEFT JOIN purchase_orders po ON po.id = b.po_id
        LEFT JOIN grn g              ON g.id  = b.grn_id
        WHERE ${billConds.join(' AND ')}
      `, billParams),
      query(`SELECT u.*, cb.certification_id FROM tqs_bill_updates u LEFT JOIN vendor_qs_certification_bills cb ON cb.bill_id = u.bill_id WHERE u.bill_id = $1 LIMIT 1`, [req.params.id]),
      query(`
        SELECT li.*,
               pi.material_name AS po_item_name,
               pi.quantity      AS po_ordered_qty,
               pi.rate          AS po_ordered_rate,
               pi.unit          AS po_ordered_unit,
               woi.description  AS wo_item_name,
               woi.quantity     AS wo_ordered_qty,
               woi.rate         AS wo_ordered_rate,
               woi.unit         AS wo_ordered_unit
        FROM tqs_bill_line_items li
        LEFT JOIN po_items pi ON pi.id = li.po_item_id
        LEFT JOIN work_order_items woi ON woi.id = li.wo_item_id
        WHERE li.bill_id = $1
        ORDER BY li.sort_order
      `, [req.params.id]),
      query(`SELECT * FROM tqs_bill_files WHERE bill_id = $1 ORDER BY uploaded_at DESC`, [req.params.id]),
      query(`SELECT h.*, u.name AS changed_by_name FROM tqs_bill_history h LEFT JOIN users u ON u.id = h.changed_by WHERE h.bill_id = $1 ORDER BY h.ts DESC`, [req.params.id]),
    ]);

    if (!bill.rows.length) return res.status(404).json({ error: 'Bill not found' });

    res.json({
      data: {
        ...bill.rows[0],
        bill_updates: updates.rows[0] || {},
        line_items:   items.rows,
        files:        files.rows,
        history:      history.rows,
      }
    });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

// ── PUT /tqs/bills/:id ─────────────────────────────────────────────────────
router.put('/:id', async (req, res) => {
  try {
    await getAccessibleBill(req, req.params.id);
    const allowed = [
      // Vendor & refs
      'vendor_name','vendor_id','po_id','grn_id','po_number','po_date','wo_number',
      // Invoice
      'inv_number','inv_date','inv_month','received_date',
      // Bill meta
      'bill_type','work_desc','tax_mode','remarks',
      // Hire / Rental
      'equipment_type','hire_period_from','hire_period_to',
      // Amounts & GST
      'basic_amount','cgst_pct','cgst_amt','sgst_pct','sgst_amt','igst_pct','igst_amt','gst_amount',
      // Transport
      'transport_charges','transport_gst_pct','transport_gst_amt','transport_desc',
      // Other charges
      'other_charges','other_charges_desc',
      // Credit note
      'credit_note_num','credit_note_val',
      // TCS
      'tcs_pct','tcs_amt',
      // Grand total
      'total_amount',
    ];
    const fields = req.body;
    // UUID columns — empty string must become NULL or Postgres throws "invalid input syntax for type uuid"
    const UUID_COLS = new Set(['vendor_id', 'po_id', 'grn_id']);
    let sets = [], params = [req.params.id, req.user.company_id], i = 3;
    Object.keys(fields).forEach(k => {
      if (!allowed.includes(k)) return;
      const v = fields[k];
      const sanitized = UUID_COLS.has(k) ? (v && String(v).trim() ? v : null) : v;
      sets.push(`${k} = $${i++}`);
      params.push(sanitized);
    });
    if (!sets.length) return res.status(400).json({ error: 'No valid fields' });

    const needsCurrentBill =
      Object.prototype.hasOwnProperty.call(fields, 'vendor_name') ||
      Object.prototype.hasOwnProperty.call(fields, 'inv_number') ||
      Object.prototype.hasOwnProperty.call(fields, 'po_id') ||
      Object.prototype.hasOwnProperty.call(fields, 'po_number') ||
      Object.prototype.hasOwnProperty.call(fields, 'total_amount');

    let currentBill = null;
    if (needsCurrentBill) {
      const current = await query(
        `SELECT id, vendor_name, inv_number, po_id, po_number, total_amount
         FROM tqs_bills
         WHERE id = $1 AND company_id = $2 AND is_deleted = FALSE`,
        [req.params.id, req.user.company_id]
      );
      if (!current.rows.length) return res.status(404).json({ error: 'Bill not found' });
      currentBill = current.rows[0];
    }

    if (Object.prototype.hasOwnProperty.call(fields, 'vendor_name') || Object.prototype.hasOwnProperty.call(fields, 'inv_number')) {
      await assertNoDuplicateInvoice(query, {
        companyId: req.user.company_id,
        vendorName: Object.prototype.hasOwnProperty.call(fields, 'vendor_name') ? fields.vendor_name : currentBill.vendor_name,
        invNumber: Object.prototype.hasOwnProperty.call(fields, 'inv_number') ? fields.inv_number : currentBill.inv_number,
        excludeId: req.params.id,
      });
    }

    if (Object.prototype.hasOwnProperty.call(fields, 'po_id') ||
        Object.prototype.hasOwnProperty.call(fields, 'po_number') ||
        Object.prototype.hasOwnProperty.call(fields, 'total_amount')) {
      await withTransaction(async (client) => {
        await assertPoAmountWithinLimit(client, {
          companyId: req.user.company_id,
          poId: Object.prototype.hasOwnProperty.call(fields, 'po_id') ? fields.po_id : currentBill.po_id,
          poNumber: Object.prototype.hasOwnProperty.call(fields, 'po_number') ? fields.po_number : currentBill.po_number,
          newTotalAmount: Object.prototype.hasOwnProperty.call(fields, 'total_amount') ? fields.total_amount : currentBill.total_amount,
          excludeBillId: req.params.id,
        });
      });
    }

    sets.push(`updated_at = NOW()`);
    const r = await query(`UPDATE tqs_bills SET ${sets.join(', ')} WHERE id = $1 AND company_id = $2 RETURNING *`, params);
    await logHistory(req.params.id, 'system', 'Bill updated', req.user.id);
    res.json({ data: r.rows[0] });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

// ── PATCH /tqs/bills/:id/line-items/:lineId/chapter ────────────────────────
// Tags a single bill line item to a BOQ chapter, for spend that has no PO/BOQ
// item to attach to (e.g. direct site-purchase bills for consumables, tools,
// safety gear) but should still roll into a chapter's Budget Breakdown total
// instead of sitting in the project-level "Unlinked Spend" bucket.
router.patch('/:id/line-items/:lineId/chapter', async (req, res) => {
  try {
    await getAccessibleBill(req, req.params.id);
    const { boq_chapter } = req.body;
    const r = await query(
      `UPDATE tqs_bill_line_items SET boq_chapter = $1
       WHERE id = $2 AND bill_id = $3 RETURNING id, boq_chapter`,
      [boq_chapter || null, req.params.lineId, req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Line item not found on this bill' });
    await logHistory(req.params.id, 'system',
      boq_chapter ? `Line item tagged to chapter "${boq_chapter}"` : 'Line item chapter tag cleared',
      req.user.id);
    res.json({ data: r.rows[0] });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

// ── PATCH /tqs/bills/:id/line-items/:lineId ────────────────────────────────
// Full edit of one bill line item — item name, unit, qty, rate, GST% + mode,
// cost head and BOQ item/chapter tags. Recomputes that line's CGST+SGST or
// IGST split, GST amount and total from the (possibly updated) gst_mode and
// gst_pct, so each line can carry its own GST rate independent of the rest
// of the bill. Does not touch po_item_id/wo_item_id linkage or re-validate
// PO/WO remaining-quantity balances — those stay as originally set.
router.patch('/:id/line-items/:lineId', async (req, res) => {
  try {
    await getAccessibleBill(req, req.params.id);
    const {
      item_name, category, unit, quantity, rate, discount_amount,
      gst_pct, gst_mode, cost_head, boq_item_id, boq_chapter,
    } = req.body;

    const existing = await query(
      `SELECT * FROM tqs_bill_line_items WHERE id = $1 AND bill_id = $2`,
      [req.params.lineId, req.params.id]
    );
    if (!existing.rows.length) return res.status(404).json({ error: 'Line item not found on this bill' });
    const line = existing.rows[0];

    const qty  = quantity      !== undefined ? parseFloat(quantity)      || 0 : parseFloat(line.quantity)      || 0;
    const rt   = rate          !== undefined ? parseFloat(rate)          || 0 : parseFloat(line.rate)          || 0;
    const disc = discount_amount !== undefined ? Math.abs(parseFloat(discount_amount) || 0) : parseFloat(line.discount_amount) || 0;
    const gstP = gst_pct       !== undefined ? parseFloat(gst_pct)       || 0 : parseFloat(line.gst_pct)        || 0;
    const gross = qty * rt;
    const basic = gross - disc;
    const mode  = gst_mode === 'interstate' || gst_mode === 'intrastate' ? gst_mode : (line.gst_mode || 'intrastate');
    let cgP = 0, sgP = 0, igP = 0, cgA = 0, sgA = 0, igA = 0;
    if (mode === 'interstate') { igP = gstP; igA = basic * igP / 100; }
    else { cgP = gstP / 2; sgP = gstP / 2; cgA = basic * cgP / 100; sgA = basic * sgP / 100; }
    const gstAmt = cgA + sgA + igA;
    const totalAmt = basic + gstAmt;

    const finalCostHead = cost_head !== undefined
      ? (BOQ_COST_HEADS.includes(cost_head) ? cost_head : null)
      : line.cost_head;

    const r = await query(`
      UPDATE tqs_bill_line_items SET
        item_name = $1, category = $2, unit = $3, quantity = $4, rate = $5,
        discount_amount = $6, basic_amount = $7, gst_pct = $8, gst_mode = $9,
        cgst_pct = $10, cgst_amt = $11, sgst_pct = $12, sgst_amt = $13,
        igst_pct = $14, igst_amt = $15, gst_amount = $16, total_amount = $17,
        cost_head = $18, boq_item_id = $19, boq_chapter = $20
      WHERE id = $21 AND bill_id = $22
      RETURNING *
    `, [
      item_name !== undefined ? item_name : line.item_name,
      category  !== undefined ? category  : line.category,
      unit      !== undefined ? unit      : line.unit,
      qty, rt, disc, basic, gstP, mode,
      cgP, cgA.toFixed(2), sgP, sgA.toFixed(2), igP, igA.toFixed(2),
      gstAmt.toFixed(2), totalAmt.toFixed(2),
      finalCostHead,
      boq_item_id !== undefined ? (boq_item_id || null) : line.boq_item_id,
      boq_chapter !== undefined ? (boq_chapter || null) : line.boq_chapter,
      req.params.lineId, req.params.id,
    ]);
    await logHistory(req.params.id, 'system', `Line item "${r.rows[0].item_name}" updated`, req.user.id);
    res.json({ data: r.rows[0] });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

// ── POST /tqs/bills/:id/line-items — add a new line to an existing bill ────
router.post('/:id/line-items', async (req, res) => {
  try {
    await getAccessibleBill(req, req.params.id);
    const {
      item_name = '', category, unit = '', quantity = 0, rate = 0,
      gst_pct = 0, gst_mode = 'intrastate', cost_head, boq_item_id, boq_chapter,
    } = req.body;

    const qty   = parseFloat(quantity) || 0;
    const rt    = parseFloat(rate)     || 0;
    const gstP  = parseFloat(gst_pct)  || 0;
    const basic = qty * rt;
    const mode  = gst_mode === 'interstate' ? 'interstate' : 'intrastate';
    let cgP = 0, sgP = 0, igP = 0, cgA = 0, sgA = 0, igA = 0;
    if (mode === 'interstate') { igP = gstP; igA = basic * igP / 100; }
    else { cgP = gstP / 2; sgP = gstP / 2; cgA = basic * cgP / 100; sgA = basic * sgP / 100; }
    const gstAmt   = cgA + sgA + igA;
    const totalAmt = basic + gstAmt;

    const r = await query(`
      INSERT INTO tqs_bill_line_items (
        bill_id, item_name, category, unit, quantity, rate, basic_amount,
        gst_pct, gst_mode, cgst_pct, cgst_amt, sgst_pct, sgst_amt,
        igst_pct, igst_amt, gst_amount, total_amount,
        cost_head, boq_item_id, boq_chapter
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20
      ) RETURNING *
    `, [
      req.params.id, item_name || 'New Item', category || null, unit, qty, rt, basic.toFixed(2),
      gstP, mode, cgP, cgA.toFixed(2), sgP, sgA.toFixed(2), igP, igA.toFixed(2),
      gstAmt.toFixed(2), totalAmt.toFixed(2),
      BOQ_COST_HEADS.includes(cost_head) ? cost_head : null,
      boq_item_id || null, boq_chapter || null,
    ]);
    await logHistory(req.params.id, 'system', `Line item "${r.rows[0].item_name}" added`, req.user.id);
    res.status(201).json({ data: r.rows[0] });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

// ── DELETE /tqs/bills/:id/line-items/:lineId ───────────────────────────────
router.delete('/:id/line-items/:lineId', async (req, res) => {
  try {
    await getAccessibleBill(req, req.params.id);
    const r = await query(
      `DELETE FROM tqs_bill_line_items WHERE id=$1 AND bill_id=$2 RETURNING id, item_name`,
      [req.params.lineId, req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Line item not found on this bill' });
    await logHistory(req.params.id, 'system', `Line item "${r.rows[0].item_name}" deleted`, req.user.id);
    res.json({ data: { deleted: true } });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

// ── PATCH /tqs/bills/:id/stores ────────────────────────────────────────────
router.patch('/:id/stores', requireTqsStageAccess('stores'), async (req, res) => {
  try {
      await getAccessibleBill(req, req.params.id);
      const { store_recv_date, dc_number, vehicle_number, inspection_status, received_by, sent_to_ho_date, store_remarks } = req.body;
      requireDateFields(req.body, [
        { key: 'store_recv_date', label: 'Received Date' },
        { key: 'sent_to_ho_date', label: 'Sent to HO Date' },
      ]);
      await query(`
        UPDATE tqs_bill_updates SET
          store_recv_date=$1, dc_number=$2, vehicle_number=$3,
          inspection_status=$4, received_by=$5, sent_to_ho_date=$6, store_remarks=$7, updated_at=NOW()
        WHERE bill_id=$8
      `, [store_recv_date, dc_number, vehicle_number, inspection_status, received_by, sent_to_ho_date, store_remarks, req.params.id]);
    await query(`UPDATE tqs_bills SET workflow_status='document_controller', updated_at=NOW() WHERE id=$1`, [req.params.id]);
    await logHistory(
      req.params.id,
      'stores',
      `Stores receipt updated${sent_to_ho_date ? `, sent to HO: ${sent_to_ho_date}` : ''}`,
      req.user.id
    );
    await logHistory(req.params.id, 'system', 'Moved to Document Controller', req.user.id);
    res.json({ message: 'Stores updated and forwarded to Document Controller' });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

// ── PATCH /tqs/bills/:id/document-control
router.patch('/:id/document-control', requireTqsStageAccess('document_control'), async (req, res) => {
  try {
    await getAccessibleBill(req, req.params.id);
    const {
      ho_received_date,
      handed_over_qs_date,
      document_controller_remarks,
    } = req.body;
    requireDateFields(req.body, [
      { key: 'ho_received_date', label: 'Date Received at HO' },
      { key: 'handed_over_qs_date', label: 'Date Handed Over to QS' },
    ]);

    await query(`
      UPDATE tqs_bill_updates SET
        ho_received_date=$1,
        handed_over_qs_date=$2,
        document_controller_remarks=$3,
        updated_at=NOW()
      WHERE bill_id=$4
    `, [ho_received_date || null, handed_over_qs_date || null, document_controller_remarks || null, req.params.id]);

    await query(`UPDATE tqs_bills SET workflow_status='qs', updated_at=NOW() WHERE id=$1`, [req.params.id]);
    await logHistory(
      req.params.id,
      'document_controller',
      `Document Controller updated${ho_received_date ? `, HO received: ${ho_received_date}` : ''}${handed_over_qs_date ? `, handed over to QS: ${handed_over_qs_date}` : ''}`,
      req.user.id
    );
    await logHistory(req.params.id, 'system', 'Moved to QS for Certification', req.user.id);
    res.json({ message: 'Document Controller updated and moved to QS' });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

// ── GET /tqs/bills/:id/ra-summary ─────────────────────────────────────────
// Returns prior certified bills for the same vendor + PO (RA sequence context)
router.get('/:id/ra-summary', async (req, res) => {
  try {
    await getAccessibleBill(req, req.params.id);
    const cur = await query(
      `SELECT vendor_name, po_number, project_id, company_id FROM tqs_bills WHERE id=$1 AND is_deleted=FALSE`,
      [req.params.id]
    );
    if (!cur.rows.length) return res.status(404).json({ error: 'Bill not found' });
    const { vendor_name, po_number, project_id, company_id } = cur.rows[0];

    if (!vendor_name || !po_number) {
      return res.json({ data: { previous_bills: [], previous_certified_total: 0, suggested_ra_sequence: 1 } });
    }

    const prev = await query(`
      SELECT b.id, b.sl_number, b.inv_number, b.inv_date,
             u.ra_sequence, u.ra_bill_number, u.certified_net,
             u.cumulative_certified_amount, b.workflow_status
      FROM tqs_bills b
      LEFT JOIN tqs_bill_updates u ON u.bill_id = b.id
      WHERE b.vendor_name = $1
        AND b.po_number   = $2
        AND b.company_id  = $3
        AND b.id         != $4
        AND b.project_id IS NOT DISTINCT FROM $5
        AND b.is_deleted  = FALSE
        AND b.workflow_status IN ('qs','accounts','paid')
      ORDER BY COALESCE(u.ra_sequence, 0) ASC, b.created_at ASC
    `, [vendor_name, po_number, company_id, req.params.id, project_id]);

    const previous_certified_total = prev.rows.reduce(
      (s, r) => s + parseFloat(r.certified_net || 0), 0
    );

    res.json({
      data: {
        previous_bills: prev.rows,
        previous_certified_total,
        suggested_ra_sequence: prev.rows.length + 1,
        vendor_name,
        po_number,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

// ── PATCH /tqs/bills/:id/qs ────────────────────────────────────────────────
router.patch('/:id/qs', requireTqsStageAccess('qs'), async (req, res) => {
  try {
    await getAccessibleBill(req, req.params.id);
    const {
      // QS Received/Certified Date now live on the Vendor QS Certification
      // record itself (see vendor-qs-certification.routes.js), and Handed to
      // Accounts Date is gone now that Accounts is no longer a routing gate —
      // none of the three are collected on this quick-cert form anymore, so
      // they're optional here and default to today if not supplied.
      qs_received_date, qs_certified_date, handed_over_accounts_date, qs_gross, qs_tax,
      advance_recovered = 0, credit_note_amt = 0,
      retention_money = 0, tds_deduction = 0, other_deductions = 0,
      qs_remarks,
      ra_sequence = 1, ra_bill_number, is_final_bill = false,
      qs_summary_template = [],
      qs_ra_items = [],
      cgst_pct: ra_cgst_pct = 9,
      sgst_pct: ra_sgst_pct = 9,
      igst_pct: ra_igst_pct = 0,
    } = req.body;
    const today = new Date().toISOString().slice(0, 10);
    const qsReceivedDate  = qs_received_date  || today;
    const qsCertifiedDate = qs_certified_date || today;
    const handedOverAccountsDate = handed_over_accounts_date || null;

    const n = (v) => parseFloat(v || 0) || 0;

    // ── Fetch bill base data early (needed for fallback & cumulative calc) ─
    const cur = await query(
      `SELECT vendor_id, vendor_name, wo_number, po_number, project_id, company_id,
              total_amount, basic_amount, gst_amount
       FROM tqs_bills WHERE id=$1`,
      [req.params.id]
    );
    const billTotalAmount = parseFloat(cur.rows[0]?.total_amount || 0);

    const normalizedQsRAItems = Array.isArray(qs_ra_items)
      ? qs_ra_items.map(row => {
          const qsPresQty = row.qs_pres_qty !== undefined && row.qs_pres_qty !== null && row.qs_pres_qty !== ''
            ? row.qs_pres_qty
            : row.inv_pres_qty;
          return { ...row, qs_pres_qty: qsPresQty ?? '' };
        })
      : [];
    const itemGross = normalizedQsRAItems.reduce(
      (sum, row) => sum + n(row.qs_pres_qty) * n(row.po_rate),
      0
    );
    // Fallback chain: RA item total → explicit qs_gross → bill total_amount
    // Prevents certified_net from being saved as 0 when the simple QS tab
    // (date-only form) is used without a full RA breakdown.
    const certifiedGross = itemGross > 0 ? itemGross
                         : n(qs_gross) > 0 ? n(qs_gross)
                         : billTotalAmount;
    const taxRate = n(ra_cgst_pct) + n(ra_sgst_pct) + n(ra_igst_pct);
    const certifiedTax = taxRate > 0 ? certifiedGross * taxRate / 100 : n(qs_tax);
    const qs_total        = certifiedGross + certifiedTax;
    const total_deductions = n(advance_recovered) + n(credit_note_amt) +
                             n(retention_money)   + n(tds_deduction) +
                             n(other_deductions);
    const certified_net   = Math.max(0, qs_total - total_deductions);

    // ── Fetch OLD advance_recovered before upsert (needed for diff calc) ──
    const oldUpdateRes = await query(
      `SELECT COALESCE(advance_recovered, 0) AS advance_recovered FROM tqs_bill_updates WHERE bill_id = $1`,
      [req.params.id]
    );
    const oldAdvanceRecovered = parseFloat(oldUpdateRes.rows[0]?.advance_recovered || 0);
    let previous_certified_amount = 0;
    if (cur.rows.length && cur.rows[0].vendor_name && cur.rows[0].po_number) {
      const { vendor_name, po_number, project_id, company_id } = cur.rows[0];
      const sumRes = await query(`
        SELECT COALESCE(SUM(u.certified_net), 0) AS total
        FROM tqs_bills b
        LEFT JOIN tqs_bill_updates u ON u.bill_id = b.id
        WHERE b.vendor_name = $1 AND b.po_number = $2
          AND b.company_id  = $3 AND b.id       != $4
          AND b.project_id IS NOT DISTINCT FROM $5
          AND b.is_deleted  = FALSE
          AND b.workflow_status IN ('qs','accounts','paid')
      `, [vendor_name, po_number, company_id, req.params.id, project_id]);
      previous_certified_amount = parseFloat(sumRes.rows[0]?.total || 0);
    }
    const cumulative_certified_amount = previous_certified_amount + certified_net;
    const raNum = ra_bill_number || `RA-${ra_sequence}`;

    await query(`
      INSERT INTO tqs_bill_updates (
        bill_id,
        qs_received_date, qs_certified_date, qs_gross, qs_tax, qs_total,
        advance_recovered, credit_note_amt, retention_money,
        tds_deduction, other_deductions, total_deductions,
        certified_net, qs_remarks,
        handed_over_accounts_date,
        ra_sequence, ra_bill_number, is_final_bill,
        previous_certified_amount, cumulative_certified_amount,
        qs_summary_template,
        qs_ra_items,
        ra_cgst_pct, ra_sgst_pct, ra_igst_pct,
        balance_to_pay,
        updated_at
      ) VALUES (
        $25,
        $1,$2,$3,$4,$5,
        $6,$7,$8,
        $9,$10,$11,
        $12,$13,
        $14,
        $15,$16,$17,
        $18,$19,
        $20,
        $21,
        $22,$23,$24,
        $12,
        NOW()
      )
      ON CONFLICT (bill_id) DO UPDATE SET
        qs_received_date=COALESCE(tqs_bill_updates.qs_received_date, EXCLUDED.qs_received_date),
        qs_certified_date=COALESCE(tqs_bill_updates.qs_certified_date, EXCLUDED.qs_certified_date),
        qs_gross=EXCLUDED.qs_gross,
        qs_tax=EXCLUDED.qs_tax,
        qs_total=EXCLUDED.qs_total,
        advance_recovered=EXCLUDED.advance_recovered,
        credit_note_amt=EXCLUDED.credit_note_amt,
        retention_money=EXCLUDED.retention_money,
        tds_deduction=EXCLUDED.tds_deduction,
        other_deductions=EXCLUDED.other_deductions,
        total_deductions=EXCLUDED.total_deductions,
        certified_net=EXCLUDED.certified_net,
        qs_remarks=EXCLUDED.qs_remarks,
        handed_over_accounts_date=COALESCE(tqs_bill_updates.handed_over_accounts_date, EXCLUDED.handed_over_accounts_date),
        ra_sequence=EXCLUDED.ra_sequence,
        ra_bill_number=EXCLUDED.ra_bill_number,
        is_final_bill=EXCLUDED.is_final_bill,
        previous_certified_amount=EXCLUDED.previous_certified_amount,
        cumulative_certified_amount=EXCLUDED.cumulative_certified_amount,
        qs_summary_template=EXCLUDED.qs_summary_template,
        qs_ra_items=EXCLUDED.qs_ra_items,
        ra_cgst_pct=EXCLUDED.ra_cgst_pct,
        ra_sgst_pct=EXCLUDED.ra_sgst_pct,
        ra_igst_pct=EXCLUDED.ra_igst_pct,
        balance_to_pay=EXCLUDED.balance_to_pay,
        updated_at=NOW()
    `, [qsReceivedDate, qsCertifiedDate, certifiedGross, certifiedTax, qs_total,
        advance_recovered, credit_note_amt, retention_money,
        tds_deduction, other_deductions, total_deductions, certified_net,
        qs_remarks, handedOverAccountsDate,
        ra_sequence, raNum, is_final_bill,
        previous_certified_amount, cumulative_certified_amount,
        JSON.stringify(qs_summary_template),
        JSON.stringify(normalizedQsRAItems),
        ra_cgst_pct, ra_sgst_pct, ra_igst_pct,
        req.params.id]);

    // QS now routes straight to Procurement — Accounts is no longer a
    // blocking waypoint here (they can record the JV date on /:id/accounts
    // at any time; see that route for details).
    await query(`UPDATE tqs_bills SET workflow_status='procurement', updated_at=NOW() WHERE id=$1`, [req.params.id]);

    // ── Sync advance_recovered back to advance tracker (diff-based) ──────
    // Use the DIFFERENCE between new and old advance_recovered so that
    // re-certifications don't double-count and reductions are reversed.
    const advanceDiff = n(advance_recovered) - oldAdvanceRecovered;
    if (advanceDiff !== 0) {
      const billInfo = cur.rows[0];
      if (billInfo) {
        const vWhere = billInfo.vendor_id
          ? `(vendor_id = $2 OR vendor_name ILIKE $3)`
          : `vendor_name ILIKE $2`;
        const vParams = billInfo.vendor_id
          ? [req.user.company_id, billInfo.vendor_id, `%${billInfo.vendor_name}%`]
          : [req.user.company_id, `%${billInfo.vendor_name}%`];

        if (advanceDiff > 0) {
          // ── INCREASE: allocate diff FIFO (oldest open advance first) ──
          const openTracker = await query(
            `SELECT id, advance_value - recovered_amount AS remaining
             FROM tqs_advance_vouchers
             WHERE company_id = $1 AND ${vWhere}
               AND advance_value > recovered_amount AND is_deleted = FALSE
             ORDER BY COALESCE(pay_date, created_at) ASC`,
            vParams
          );
          const openBills = await query(
            `SELECT id, amount - recovered_amount AS remaining
             FROM tqs_advances
             WHERE company_id = $1 AND ${vWhere}
               AND amount > recovered_amount
             ORDER BY COALESCE(payment_date, created_at) ASC`,
            vParams
          );

          let toAllocate = advanceDiff;
          for (const adv of openTracker.rows) {
            if (toAllocate <= 0) break;
            const apply = Math.min(toAllocate, parseFloat(adv.remaining));
            await query(
              `UPDATE tqs_advance_vouchers
               SET recovered_amount = recovered_amount + $1,
                   status = CASE WHEN advance_value <= recovered_amount + $1 THEN 'recovered' ELSE 'partial' END,
                   updated_at = NOW()
               WHERE id = $2`,
              [apply, adv.id]
            );
            toAllocate -= apply;
          }
          for (const adv of openBills.rows) {
            if (toAllocate <= 0) break;
            const apply = Math.min(toAllocate, parseFloat(adv.remaining));
            await query(
              `UPDATE tqs_advances SET recovered_amount = recovered_amount + $1 WHERE id = $2`,
              [apply, adv.id]
            );
            toAllocate -= apply;
          }
        } else {
          // ── DECREASE: reverse |diff| LIFO (most recently updated first) ──
          const toReverse = Math.abs(advanceDiff);
          const trackerRows = await query(
            `SELECT id, recovered_amount, advance_value
             FROM tqs_advance_vouchers
             WHERE company_id = $1 AND ${vWhere}
               AND recovered_amount > 0 AND is_deleted = FALSE
             ORDER BY COALESCE(updated_at, created_at) DESC`,
            vParams
          );
          const billRows = await query(
            `SELECT id, recovered_amount
             FROM tqs_advances
             WHERE company_id = $1 AND ${vWhere}
               AND recovered_amount > 0
             ORDER BY COALESCE(updated_at, created_at) DESC`,
            vParams
          );

          let remaining = toReverse;
          for (const v of trackerRows.rows) {
            if (remaining <= 0) break;
            const canReverse = Math.min(remaining, parseFloat(v.recovered_amount));
            const newRecovered = parseFloat(v.recovered_amount) - canReverse;
            const newStatus = newRecovered <= 0 ? 'issued'
                            : newRecovered < parseFloat(v.advance_value) ? 'partial'
                            : 'recovered';
            await query(
              `UPDATE tqs_advance_vouchers
               SET recovered_amount = $1, status = $2, updated_at = NOW()
               WHERE id = $3`,
              [newRecovered, newStatus, v.id]
            );
            remaining -= canReverse;
          }
          let remainingBills = toReverse;
          for (const adv of billRows.rows) {
            if (remainingBills <= 0) break;
            const canReverse = Math.min(remainingBills, parseFloat(adv.recovered_amount));
            await query(
              `UPDATE tqs_advances SET recovered_amount = recovered_amount - $1 WHERE id = $2`,
              [canReverse, adv.id]
            );
            remainingBills -= canReverse;
          }
        }
      }
    }

    await logHistory(req.params.id, 'qs',
      `QS certified (${raNum}) — Net: ₹${certified_net.toFixed(2)}, Cumulative: ₹${cumulative_certified_amount.toFixed(2)}${handed_over_accounts_date ? `, handed over to Accounts: ${handed_over_accounts_date}` : ''}`,
      req.user.id);
    await logHistory(req.params.id, 'system', 'Moved to Accounts', req.user.id);
    res.json({
      data: {
        certified_net, total_deductions, qs_total,
        qs_gross: certifiedGross, qs_tax: certifiedTax,
        ra_bill_number: raNum, ra_sequence,
        previous_certified_amount, cumulative_certified_amount,
      },
    });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

// ── POST /tqs/bills/:id/payment-certificate ────────────────────────────────
router.post('/:id/payment-certificate', async (req, res) => {
  try {
    await getAccessibleBill(req, req.params.id);
    // Check if a PC already exists — regenerate only if requested
    const existing = await query(`SELECT pc_number FROM tqs_bill_updates WHERE bill_id=$1`, [req.params.id]);
    let pc_number = existing.rows[0]?.pc_number;
    if (!pc_number) {
      pc_number = await nextPCNumber();
      await query(
        `UPDATE tqs_bill_updates SET pc_number=$1, pc_generated_at=NOW(), updated_at=NOW() WHERE bill_id=$2`,
        [pc_number, req.params.id]
      );
      await logHistory(req.params.id, 'qs', `Payment Certificate generated: ${pc_number}`, req.user.id);
    }
    res.status(201).json({ data: { pc_number } });
  } catch (err) {
    console.error(err);
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

// ── PATCH /tqs/bills/:id/payment-certificate/sign ─────────────────────────
router.patch('/:id/payment-certificate/sign', async (req, res) => {
  try {
    await getAccessibleBill(req, req.params.id);
    const { stage, sig_img, signed_by } = req.body;
    const validStages = ['qs', 'pm', 'accts'];
    if (!validStages.includes(stage)) {
      return res.status(400).json({ error: 'Invalid stage. Use: qs, pm, accts' });
    }
    await query(`
      UPDATE tqs_bill_updates SET
        pc_${stage}_sig_img   = $1,
        pc_${stage}_signed_by = $2,
        pc_${stage}_signed_at = NOW(),
        updated_at = NOW()
      WHERE bill_id = $3
    `, [sig_img, signed_by || 'User', req.params.id]);
    await logHistory(req.params.id, stage,
      `Payment Certificate signed (${stage.toUpperCase()}) by ${signed_by || 'User'}`,
      req.user.id);
    res.json({ message: `Signed by ${stage}` });
  } catch (err) {
    console.error(err);
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

// ── PATCH /tqs/bills/:id/payment ───────────────────────────────────────────
router.patch('/:id/accounts', requireTqsStageAccess('accounts'), async (req, res) => {
  try {
    await getAccessibleBill(req, req.params.id);
    const {
      accts_received_from_qs_date, accts_jv_date, accts_remarks,
      advance_recovered  = 0,
      tds_deduction      = 0,
      retention_money    = 0,
      other_deductions   = 0,
    } = req.body;
    // Received from QS Date is no longer collected on this simplified form —
    // only JV Date matters now (Accounts just confirms when they posted it).
    requireDateFields(req.body, [
      { key: 'accts_jv_date', label: 'JV Date (Accounts)' },
    ]);
    const acctsReceivedFromQsDate = accts_received_from_qs_date || new Date().toISOString().slice(0, 10);

    const n = (v) => parseFloat(v || 0) || 0;

    // Fetch bill base amounts for certified_net calculation
    const billRes = await query(
      `SELECT b.sl_number, b.bill_type, b.basic_amount, b.gst_amount, b.total_amount, b.tcs_amt,
              b.vendor_id, b.vendor_name, b.wo_number, b.po_number, b.project_id, b.grn_id, b.workflow_status
       FROM tqs_bills b WHERE b.id = $1`,
      [req.params.id]
    );
    const bill = billRes.rows[0] || {};
    const baseAmount    = n(bill.total_amount);
    const totalDed      = n(advance_recovered) + n(tds_deduction) + n(retention_money) + n(other_deductions);
    const certified_net = baseAmount - totalDed;

    await query(`
      INSERT INTO tqs_bill_updates (
        bill_id,
        accts_received_from_qs_date, accts_jv_date, accts_remarks,
        advance_recovered, tds_deduction, retention_money, other_deductions,
        total_deductions, certified_net, balance_to_pay,
        updated_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10,NOW())
      ON CONFLICT (bill_id) DO UPDATE SET
        accts_received_from_qs_date = COALESCE(tqs_bill_updates.accts_received_from_qs_date, EXCLUDED.accts_received_from_qs_date),
        accts_jv_date        = EXCLUDED.accts_jv_date,
        accts_remarks        = EXCLUDED.accts_remarks,
        advance_recovered    = EXCLUDED.advance_recovered,
        tds_deduction        = EXCLUDED.tds_deduction,
        retention_money      = EXCLUDED.retention_money,
        other_deductions     = EXCLUDED.other_deductions,
        total_deductions     = EXCLUDED.total_deductions,
        certified_net        = EXCLUDED.certified_net,
        balance_to_pay       = EXCLUDED.balance_to_pay,
        updated_at           = NOW()
    `, [
      req.params.id,
      acctsReceivedFromQsDate,
      accts_jv_date || null,
      accts_remarks || null,
      n(advance_recovered), n(tds_deduction), n(retention_money), n(other_deductions),
      totalDed, certified_net,
    ]);

    // Accounts JV entry no longer gates the workflow — QS already sends the
    // bill straight to Procurement. Only nudge it forward if it's somehow
    // still sitting at 'qs' (e.g. old bills mid-flight when this changed);
    // never rewind a bill that Procurement/QS Sign has already moved past.
    if (bill.workflow_status === 'qs') {
      await query(`UPDATE tqs_bills SET workflow_status='procurement', updated_at=NOW() WHERE id=$1`, [req.params.id]);
    }

    // ── Sync advance recovery to tracker (FIFO) ────────────────────────────
    if (n(advance_recovered) > 0 && bill.vendor_name) {
      const vWhere = bill.vendor_id
        ? `(vendor_id = $2 OR vendor_name ILIKE $3)`
        : `vendor_name ILIKE $2`;
      const vParams = bill.vendor_id
        ? [req.user.company_id, bill.vendor_id, `%${bill.vendor_name}%`]
        : [req.user.company_id, `%${bill.vendor_name}%`];

      const openTracker = await query(
        `SELECT id, advance_value - recovered_amount AS remaining
         FROM tqs_advance_vouchers
         WHERE company_id = $1 AND ${vWhere}
           AND advance_value > recovered_amount AND is_deleted = FALSE
         ORDER BY COALESCE(pay_date, created_at) ASC`,
        vParams
      );
      const openBills = await query(
        `SELECT id, amount - recovered_amount AS remaining
         FROM tqs_advances
         WHERE company_id = $1 AND ${vWhere}
           AND amount > recovered_amount
         ORDER BY COALESCE(payment_date, created_at) ASC`,
        vParams
      );

      let toAllocate = n(advance_recovered);
      for (const adv of openTracker.rows) {
        if (toAllocate <= 0) break;
        const apply = Math.min(toAllocate, parseFloat(adv.remaining));
        await query(
          `UPDATE tqs_advance_vouchers
           SET recovered_amount = recovered_amount + $1,
               status = CASE WHEN advance_value <= recovered_amount + $1 THEN 'recovered' ELSE 'partial' END,
               updated_at = NOW()
           WHERE id = $2`,
          [apply, adv.id]
        );
        toAllocate -= apply;
      }
      for (const adv of openBills.rows) {
        if (toAllocate <= 0) break;
        const apply = Math.min(toAllocate, parseFloat(adv.remaining));
        await query(
          `UPDATE tqs_advances SET recovered_amount = recovered_amount + $1 WHERE id = $2`,
          [apply, adv.id]
        );
        toAllocate -= apply;
      }
    }

    await logHistory(req.params.id, 'accounts',
      `Accounts processed — Advance Rec: ₹${n(advance_recovered).toFixed(0)}, TDS: ₹${n(tds_deduction).toFixed(0)}, Net: ₹${certified_net.toFixed(0)} → Procurement`,
      req.user.id);

    // ── Auto-post Journal Voucher for the booked bill ──────────────────────────
    // Dr Expense (subcontractor 5100 for WO / material 5000 for PO) + Dr Input GST,
    // Cr Accounts Payable (net of statutory withholdings) + Cr TDS + Cr Retention.
    // Idempotent: a re-submission replaces the prior auto JV so the GL stays in sync.
    try {
      const total     = n(bill.total_amount);
      const gst        = n(bill.gst_amount);
      const tcs         = n(bill.tcs_amt);
      const expenseBase = total - gst - tcs;       // basic + transport + other charges
      const tds         = n(tds_deduction);
      const retention   = n(retention_money);
      const apCredit    = total - tds - retention; // advance & other deductions settle via subledger/payment
      const isWO        = (bill.bill_type === 'wo') || (!!bill.wo_number && !bill.po_number);
      const grinCode    = await resolveGrinClearingCode(req.user.company_id, bill.grn_id);
      const expenseCode = grinCode || (isWO ? '5100' : '5000');
      const ref         = bill.sl_number || req.params.id;

      if (total > 0) {
        // Remove any prior auto JV for this bill so amounts always reflect the latest certification
        await query(
          `DELETE FROM journal_entries WHERE company_id = $1 AND source = 'auto_tqs_bill' AND reference = $2`,
          [req.user.company_id, ref]
        ).catch(() => {});

        const expenseLabel = grinCode ? 'GRIN clearing' : (isWO ? 'Subcontractor' : 'Material');
        const lines = [
          { code: expenseCode, debit: expenseBase, description: `${expenseLabel} — ${bill.vendor_name || ''} ${ref}` },
        ];
        if (gst > 0)       lines.push({ code: '1300', debit: gst, description: `Input GST / ITC — ${ref}` });
        if (tcs > 0)       lines.push({ code: '1310', debit: tcs, description: `TCS collected by vendor — ${ref}` });
        lines.push({ code: '2000', credit: apCredit, description: `Payable to ${bill.vendor_name || 'vendor'} — ${ref}` });
        if (tds > 0)       lines.push({ code: '2200', credit: tds, description: `TDS deducted — ${ref}` });
        if (retention > 0) lines.push({ code: '2300', credit: retention, description: `Retention withheld — ${ref}` });

        await postAutoJournalStandalone({
          companyId: req.user.company_id,
          userId:    req.user.id,
          entryDate: accts_jv_date,
          projectId: bill.project_id || null,
          reference: ref,
          narration: `Bill booking — ${bill.vendor_name || ''} (${ref})`,
          source:    'auto_tqs_bill',
          lines,
        });
      }
    } catch (_) { /* best-effort: never block the accounts stage over JV posting */ }

    res.json({ data: { workflow_status: 'procurement', certified_net, total_deductions: totalDed } });
  } catch (err) {
    console.error(err);
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

router.patch('/:id/procurement', requireTqsStageAccess('procurement'), async (req, res) => {
  try {
    await getAccessibleBill(req, req.params.id);
    const {
      proc_received_from_accounts_date,
      proc_handed_over_to_accounts_date,
      procurement_remarks,
    } = req.body;
    requireDateFields(req.body, [
      { key: 'proc_received_from_accounts_date', label: 'Received from Accounts Date' },
      { key: 'proc_handed_over_to_accounts_date', label: 'Handed to QS Date' },
    ]);

    // If this bill belongs to a PC with multiple invoices, apply dates to all of them
    const certRes = await query(`
      SELECT cb.bill_id FROM vendor_qs_certification_bills cb
      WHERE cb.certification_id = (
        SELECT cb2.certification_id FROM vendor_qs_certification_bills cb2 WHERE cb2.bill_id = $1 LIMIT 1
      )
    `, [req.params.id]);

    const billIds = certRes.rows.length > 0
      ? certRes.rows.map(r => r.bill_id)
      : [req.params.id];

    await query(`
      UPDATE tqs_bill_updates SET
        proc_received_from_accounts_date=$1,
        proc_handed_over_to_accounts_date=$2,
        procurement_remarks=$3,
        updated_at=NOW()
      WHERE bill_id = ANY($4::uuid[])
    `, [
      proc_received_from_accounts_date || null,
      proc_handed_over_to_accounts_date || null,
      procurement_remarks || null,
      billIds,
    ]);

    await query(`UPDATE tqs_bills SET workflow_status='qs_sign', updated_at=NOW() WHERE id = ANY($1::uuid[])`, [billIds]);

    for (const bid of billIds) {
      await logHistory(bid, 'procurement',
        `Received from Accounts: ${proc_received_from_accounts_date || '—'}, Handed to QS for MD Signature: ${proc_handed_over_to_accounts_date || '—'}${billIds.length > 1 ? ` (applied to all ${billIds.length} invoices in PC)` : ''}`,
        req.user.id);
      await logHistory(bid, 'system', 'Moved to QS for MD Signature', req.user.id);
    }

    res.json({ data: { workflow_status: 'qs_sign', bills_updated: billIds.length } });
  } catch (err) {
    console.error(err);
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

// ── PATCH /tqs/bills/:id/qs-sign — QS collects MD signature, hands to Accounts ─
router.patch('/:id/qs-sign', requireTqsStageAccess('qs_sign'), async (req, res) => {
  try {
    await getAccessibleBill(req, req.params.id);
    const {
      qs_sign_received_from_procurement_date,
      qs_sign_date,
      qs_sign_handed_to_accounts_date,
      qs_sign_remarks,
    } = req.body;
    requireDateFields(req.body, [
      { key: 'qs_sign_received_from_procurement_date', label: 'Received from Procurement Date' },
      { key: 'qs_sign_date', label: 'MD Signed Date' },
      { key: 'qs_sign_handed_to_accounts_date', label: 'Handed to Accounts Date' },
    ]);

    // If this bill belongs to a PC with multiple invoices, apply to all of them
    const certRes = await query(`
      SELECT cb.bill_id FROM vendor_qs_certification_bills cb
      WHERE cb.certification_id = (
        SELECT cb2.certification_id FROM vendor_qs_certification_bills cb2 WHERE cb2.bill_id = $1 LIMIT 1
      )
    `, [req.params.id]);

    const billIds = certRes.rows.length > 0
      ? certRes.rows.map(r => r.bill_id)
      : [req.params.id];

    for (const bid of billIds) {
      await query(`
        INSERT INTO tqs_bill_updates (bill_id, qs_sign_received_from_procurement_date, qs_sign_date, qs_sign_handed_to_accounts_date, qs_sign_remarks, updated_at)
        VALUES ($1, $2, $3, $4, $5, NOW())
        ON CONFLICT (bill_id) DO UPDATE SET
          qs_sign_received_from_procurement_date = COALESCE(EXCLUDED.qs_sign_received_from_procurement_date, tqs_bill_updates.qs_sign_received_from_procurement_date),
          qs_sign_date                    = COALESCE(EXCLUDED.qs_sign_date, tqs_bill_updates.qs_sign_date),
          qs_sign_handed_to_accounts_date = COALESCE(EXCLUDED.qs_sign_handed_to_accounts_date, tqs_bill_updates.qs_sign_handed_to_accounts_date),
          qs_sign_remarks                 = COALESCE(EXCLUDED.qs_sign_remarks, tqs_bill_updates.qs_sign_remarks),
          updated_at                      = NOW()
      `, [bid, qs_sign_received_from_procurement_date || null, qs_sign_date || null, qs_sign_handed_to_accounts_date || null, qs_sign_remarks || null]);
    }

    await query(`UPDATE tqs_bills SET workflow_status='accounts', updated_at=NOW() WHERE id = ANY($1::uuid[])`, [billIds]);

    const histNote = `Received from Procurement${qs_sign_received_from_procurement_date ? ` on ${qs_sign_received_from_procurement_date}` : ''}; MD Signature collected${qs_sign_date ? ` on ${qs_sign_date}` : ''}${qs_sign_handed_to_accounts_date ? `, handed to Accounts: ${qs_sign_handed_to_accounts_date}` : ''}${billIds.length > 1 ? ` (applied to all ${billIds.length} invoices in PC)` : ''}`;
    for (const bid of billIds) {
      await logHistory(bid, 'qs_sign', histNote, req.user.id);
      await logHistory(bid, 'system', 'Moved to Accounts for Payment', req.user.id);
    }

    res.json({ data: { workflow_status: 'accounts', bills_updated: billIds.length } });
  } catch (err) {
    console.error(err);
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

// ── PATCH /tqs/bills/:id/mark-paid — force-mark a bill as fully paid ─────────
router.patch('/:id/mark-paid', requireTqsStageAccess('payment'), async (req, res) => {
  try {
    await getAccessibleBill(req, req.params.id);
    await query(`
      UPDATE tqs_bill_updates SET payment_status='paid', balance_to_pay=0, updated_at=NOW()
      WHERE bill_id=$1
    `, [req.params.id]);
    await query(`UPDATE tqs_bills SET workflow_status='paid', updated_at=NOW() WHERE id=$1`, [req.params.id]);
    await logHistory(req.params.id, 'accounts', 'Manually marked as Fully Paid', req.user.id);

    // Send payment notification email
    const billRow = await query(
      `SELECT b.*, p.name AS project_name FROM tqs_bills b LEFT JOIN projects p ON p.id = b.project_id WHERE b.id=$1`,
      [req.params.id]
    );
    if (billRow.rows[0]) {
      sendBillPaidEmail({
        bill: billRow.rows[0],
        paidAmount: billRow.rows[0].total_amount,
        paymentDate: new Date().toISOString(),
        paymentMode: 'Manual mark',
        referenceNumber: null,
        actorName: req.user.name || req.user.email,
        companyId: req.user.company_id,
      }).catch(() => {});
    }

    res.json({ data: { workflow_status: 'paid', payment_status: 'paid' } });
  } catch (err) {
    console.error(err);
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

router.patch('/:id/payment', requireTqsStageAccess('payment'), async (req, res) => {
  try {
    await getAccessibleBill(req, req.params.id);
    const { paid_amount, payment_date, payment_mode, reference_number, bank_name } = req.body;
    requireDateFields(req.body, [
      { key: 'payment_date', label: 'Payment Date' },
    ]);

    const updRow = await query(
      `SELECT b.total_amount, u.certified_net, u.paid_amount, u.tds_deduction, u.other_deductions, u.advance_recovered
       FROM tqs_bills b
       LEFT JOIN tqs_bill_updates u ON u.bill_id=b.id
       WHERE b.id=$1`,
      [req.params.id]
    );
    const certified = billPayableCap(updRow.rows[0] || {});
    const tds       = parseFloat(updRow.rows[0]?.tds_deduction || 0);
    const new_paid  = parseFloat(paid_amount || 0);
    if (new_paid > certified + 0.01) {
      return res.status(400).json({ error: `Payment exceeds payable balance. Maximum payable is ${inrText(certified)}.` });
    }
    const balance   = certified - new_paid;
    const status    = balance <= 0 ? 'paid' : new_paid > 0 ? 'partial' : 'pending';

    // Fetch the parent bill for project + vendor info
    const billRow = await query(
      `SELECT b.*, p.name AS project_name FROM tqs_bills b LEFT JOIN projects p ON p.id = b.project_id WHERE b.id=$1`,
      [req.params.id]
    );
    if (!billRow.rows.length) return res.status(404).json({ error: 'Bill not found' });
    const bill = billRow.rows[0];

    const result = await withTransaction(async (client) => {
      // 1. Update tqs_bill_updates
      await client.query(`
        UPDATE tqs_bill_updates SET
          paid_amount=$1,   balance_to_pay=$2,   payment_status=$3,
          payment_date=$4,
          payment_mode=$5,  reference_number=$6, bank_name=$7,
          updated_at=NOW()
        WHERE bill_id=$8
      `, [new_paid, Math.max(0, balance), status,
          payment_date || null,
          payment_mode || null, reference_number || null, bank_name || null,
          req.params.id]);

      // 2. Advance workflow status
      const newWorkflow = status === 'paid' ? 'paid' : 'accounts';
      await client.query(`UPDATE tqs_bills SET workflow_status=$1, updated_at=NOW() WHERE id=$2`,
        [newWorkflow, req.params.id]);

      // 3. Auto-create Finance payment record when amount > 0 and project exists
      let finance_payment_id = null;
      if (new_paid > 0 && payment_date && bill.project_id) {
        const payType = bill.bill_type === 'wo' ? 'subcontractor' : 'vendor';
        const costHead = bill.bill_type === 'wo' ? 'Subcontractor' : 'Material';
        const netPaid = new_paid - tds;
        const fp = await client.query(`
          INSERT INTO payments
            (project_id, payment_type, entity_name,
             amount, tds_deducted, net_amount,
             payment_date, payment_mode, reference_number, bank_name,
             cost_head, remarks, created_by, tqs_bill_id, source)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
          RETURNING id
        `, [
          bill.project_id, payType, bill.vendor_name,
          new_paid, tds, Math.max(0, netPaid),
          payment_date,
          payment_mode || 'bank_transfer',
          reference_number || null,
          bank_name || null,
          costHead,
          `DQS Bill ${bill.sl_number} — Inv: ${bill.inv_number || '—'}`,
          req.user.id, req.params.id, 'tqs',
        ]);
        finance_payment_id = fp.rows[0].id;
        // Back-link on tqs_bill_updates
        await client.query(
          `UPDATE tqs_bill_updates SET finance_payment_id=$1 WHERE bill_id=$2`,
          [finance_payment_id, req.params.id]
        );
      }

      return { paid_amount: new_paid, balance_to_pay: Math.max(0, balance), payment_status: status, finance_payment_id };
    });

    await logHistory(req.params.id, 'accounts',
      `Payment recorded ₹${new_paid} (${status})${result.finance_payment_id ? ' → Finance entry created' : ''}`,
      req.user.id);

    // Send notification email when bill is fully paid
    if (status === 'paid') {
      sendBillPaidEmail({
        bill: { ...bill, project_name: bill.project_name || bill.project_id },
        paidAmount: new_paid,
        paymentDate: payment_date,
        paymentMode: payment_mode,
        referenceNumber: reference_number,
        actorName: req.user.name || req.user.email,
        companyId: req.user.company_id,
      }).catch(() => {});
    }

    res.json({ data: result });
  } catch (err) {
    console.error(err);
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

// ── POST /tqs/bills/:id/files/link — attach an existing OneDrive URL ──────
router.post('/:id/files/link', async (req, res) => {
  try {
    await getAccessibleBill(req, req.params.id);
    const { file_name, onedrive_web_url, remarks } = req.body;
    if (!file_name || !onedrive_web_url) return res.status(400).json({ error: 'file_name and onedrive_web_url are required' });
    const r = await query(`
      INSERT INTO tqs_bill_files (bill_id, file_name, file_type, local_url, onedrive_web_url, uploaded_by)
      VALUES ($1, $2, 'link', NULL, $3, $4) RETURNING *
    `, [req.params.id, file_name, onedrive_web_url, req.user.id]);
    await logHistory(req.params.id, 'system', `OneDrive link attached: ${file_name}`, req.user.id);
    res.status(201).json({ data: r.rows[0] });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

// ── POST /tqs/bills/:id/files ──────────────────────────────────────────────
router.post('/:id/files', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  try {
    await getAccessibleBill(req, req.params.id);
    const local_url = `/uploads/tqs-bills/${req.params.id}/${req.file.filename}`;
    const localPath = req.file.path;

    const projectName = await getBillProjectName(req.params.id);

    // Try OneDrive upload
    let onedriveData = null;
    try {
      logger.info(`☁ Attempting OneDrive sync for: ${req.file.originalname}`);
      onedriveData = await uploadToOneDrive(localPath, req.file.originalname, 'Vendor Invoices', projectName);
      if (onedriveData) logger.info('✅ OneDrive sync successful');
      else logger.warn('⚠️ OneDrive sync skipped (not configured)');
    } catch (odErr) {
      logger.error('❌ OneDrive upload failed:', odErr.message);
    }

    const r = await query(`
      INSERT INTO tqs_bill_files (
        bill_id, file_name, file_size, file_type, local_url,
        onedrive_id, onedrive_url, onedrive_web_url, uploaded_by
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *
    `, [
      req.params.id, req.file.originalname, req.file.size, req.file.mimetype, local_url,
      onedriveData?.onedrive_id || null,
      onedriveData?.onedrive_url || null,
      onedriveData?.onedrive_web_url || null,
      req.user.id
    ]);

    await logHistory(req.params.id, 'system', `File uploaded: ${req.file.originalname}`, req.user.id);

    res.status(201).json({
      data: r.rows[0],
      onedrive_synced: !!onedriveData,
      onedrive_configured: isConfigured(),
    });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

// ── DELETE /tqs/bills/:id/files/:fid ──────────────────────────────────────
router.post('/:id/files/:fid/sync-onedrive', async (req, res) => {
  try {
    await getAccessibleBill(req, req.params.id);
    const fileResult = await query(`
      SELECT f.*, b.company_id
      FROM tqs_bill_files f
      JOIN tqs_bills b ON b.id = f.bill_id
      WHERE f.id = $1 AND f.bill_id = $2 AND b.company_id = $3 AND b.is_deleted = FALSE
    `, [req.params.fid, req.params.id, req.user.company_id]);

    if (!fileResult.rows.length) {
      return res.status(404).json({ error: 'Attachment not found' });
    }

    const fileRow = fileResult.rows[0];
    if (fileRow.onedrive_web_url) {
      return res.json({
        data: fileRow,
        onedrive_synced: true,
        onedrive_configured: isConfigured(),
        message: 'Attachment already synced to OneDrive',
      });
    }

    if (!isConfigured()) {
      return res.status(400).json({ error: 'OneDrive is not configured on the server' });
    }

    const localRelative = (fileRow.local_url || '').replace(/^\/+/, '');
    const localPath = path.join(__dirname, '../../', localRelative);
    if (!localRelative || !fs.existsSync(localPath)) {
      return res.status(404).json({ error: 'Local attachment file not found for sync' });
    }

    const projectName = await getBillProjectName(req.params.id);
    const onedriveData = await uploadToOneDrive(localPath, fileRow.file_name, 'Vendor Invoices', projectName);

    const updated = await query(`
      UPDATE tqs_bill_files
      SET onedrive_id = $1,
          onedrive_url = $2,
          onedrive_web_url = $3
      WHERE id = $4
      RETURNING *
    `, [
      onedriveData?.onedrive_id || null,
      onedriveData?.onedrive_url || null,
      onedriveData?.onedrive_web_url || null,
      req.params.fid,
    ]);

    await logHistory(req.params.id, 'system', `Attachment synced to OneDrive: ${fileRow.file_name}`, req.user.id);

    res.json({
      data: updated.rows[0],
      onedrive_synced: !!onedriveData,
      onedrive_configured: isConfigured(),
      message: 'Attachment synced to OneDrive',
    });
  } catch (err) {
    logger.error('OneDrive re-sync failed:', err.message);
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

// ── GET /tqs/bills/:id/files/:fid/serve ──────────────────────────────────
// Streams the file to the browser. Local files served directly; OneDrive
// files proxied through the backend — no Microsoft login required.
router.get('/:id/files/:fid/serve', async (req, res) => {
  try {
    await getAccessibleBill(req, req.params.id);
    const r = await query(
      `SELECT * FROM tqs_bill_files WHERE id=$1 AND bill_id=$2`,
      [req.params.fid, req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'File not found' });
    const f = r.rows[0];

    const contentType = (f.file_type && f.file_type !== 'link')
      ? f.file_type : 'application/octet-stream';
    const safeFileName = encodeURIComponent(f.file_name || 'file');

    // 1. Local file still on disk — stream directly
    if (f.local_url) {
      const fullPath = path.join(__dirname, '../../', f.local_url);
      if (fs.existsSync(fullPath)) {
        res.setHeader('Content-Type', contentType);
        res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${safeFileName}`);
        return fs.createReadStream(fullPath).pipe(res);
      }
    }

    // 2. File is on OneDrive — fetch a fresh pre-signed URL and proxy it
    if (f.onedrive_id) {
      const downloadUrl = await getFreshDownloadUrl(f.onedrive_id);
      const https = require('https');
      const makeRequest = (url) => new Promise((resolve, reject) => {
        https.get(url, (odRes) => {
          // Follow up to one redirect (Graph CDN sometimes 302s)
          if (odRes.statusCode >= 300 && odRes.statusCode < 400 && odRes.headers.location) {
            return makeRequest(odRes.headers.location).then(resolve).catch(reject);
          }
          resolve(odRes);
        }).on('error', reject);
      });
      const odRes = await makeRequest(downloadUrl);
      res.setHeader('Content-Type', odRes.headers['content-type'] || contentType);
      res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${safeFileName}`);
      if (odRes.headers['content-length']) {
        res.setHeader('Content-Length', odRes.headers['content-length']);
      }
      return odRes.pipe(res);
    }

    return res.status(404).json({ error: 'File is no longer available in local storage or OneDrive' });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

// ── GET /tqs/bills/:id/files/:fid/preview-url ─────────────────────────────
// Returns a usable preview/download URL for the file.
// Priority: local file (if still on disk) → fresh OneDrive download URL → webUrl
router.get('/:id/files/:fid/preview-url', async (req, res) => {
  try {
    await getAccessibleBill(req, req.params.id);
    const r = await query(
      `SELECT * FROM tqs_bill_files WHERE id=$1 AND bill_id=$2`,
      [req.params.fid, req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'File not found' });
    const f = r.rows[0];

    // 1. Check if local file still exists on disk
    if (f.local_url) {
      const fullPath = path.join(__dirname, '../../', f.local_url);
      if (require('fs').existsSync(fullPath)) {
        return res.json({ url: f.local_url, type: 'local' });
      }
    }

    // 2. Try to get a fresh pre-authenticated download URL from OneDrive
    if (f.onedrive_id) {
      try {
        const downloadUrl = await getFreshDownloadUrl(f.onedrive_id);
        return res.json({ url: downloadUrl, type: 'onedrive_direct' });
      } catch (e) {
        // Fall through to webUrl
      }
    }

    // 3. Last resort: stored webUrl (may require Microsoft login)
    if (f.onedrive_web_url) {
      return res.json({ url: f.onedrive_web_url, type: 'onedrive_web' });
    }

    return res.status(404).json({ error: 'File is no longer accessible — it may have been removed from both local storage and OneDrive' });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

router.delete('/:id/files/:fid', async (req, res) => {
  try {
    await getAccessibleBill(req, req.params.id);
    const f = await query(`SELECT * FROM tqs_bill_files WHERE id=$1 AND bill_id=$2`, [req.params.fid, req.params.id]);
    if (f.rows.length && f.rows[0].local_url) {
      const fullPath = path.join(__dirname, '../../', f.rows[0].local_url);
      if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
    }
    await query(`DELETE FROM tqs_bill_files WHERE id=$1`, [req.params.fid]);
    res.json({ message: 'File deleted' });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

// ── DELETE /tqs/bills/:id ──────────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    await getAccessibleBill(req, req.params.id);
    // Fetch bill + its advance_recovered before soft-deleting
    const billRes = await query(
      `SELECT b.id, b.vendor_id, b.vendor_name, b.company_id, b.workflow_status,
              u.accts_jv_date, COALESCE(u.advance_recovered, 0) AS advance_recovered
       FROM tqs_bills b
       LEFT JOIN tqs_bill_updates u ON u.bill_id = b.id
       WHERE b.id=$1 AND b.company_id=$2 AND b.is_deleted=FALSE`,
      [req.params.id, req.user.company_id]
    );
    if (!billRes.rows.length) return res.status(404).json({ error: 'Bill not found' });
    const bill = billRes.rows[0];

    // Bills already booked to accounts (JV posted) or paid must not be deleted —
    // doing so would leave the GL journal entry orphaned with no matching bill.
    if (bill.accts_jv_date || bill.workflow_status === 'paid') {
      return res.status(400).json({ error: 'This bill has been booked to accounts and cannot be deleted. Reverse the journal entry first.' });
    }

    // Soft-delete the bill
    await query(
      `UPDATE tqs_bills SET is_deleted=TRUE, updated_at=NOW() WHERE id=$1 AND company_id=$2`,
      [req.params.id, req.user.company_id]
    );

    // ── Reverse advance recovery in the advance tracker ──────────────────
    // If this bill had advance_recovered > 0, we must reduce the recovered_amount
    // on tqs_advance_vouchers so the advance tracker stays correct.
    const toReverse = parseFloat(bill.advance_recovered) || 0;
    if (toReverse > 0) {
      const vWhere = bill.vendor_id
        ? `(vendor_id = $2 OR vendor_name ILIKE $3)`
        : `vendor_name ILIKE $2`;
      const vParams = bill.vendor_id
        ? [req.user.company_id, bill.vendor_id, `%${bill.vendor_name}%`]
        : [req.user.company_id, `%${bill.vendor_name}%`];

      // Fetch vouchers that have partial/full recovery, newest first (LIFO reversal)
      const vouchers = await query(
        `SELECT id, recovered_amount, advance_value
         FROM tqs_advance_vouchers
         WHERE company_id = $1 AND ${vWhere}
           AND recovered_amount > 0 AND is_deleted = FALSE
         ORDER BY COALESCE(updated_at, created_at) DESC`,
        vParams
      );

      let remaining = toReverse;
      for (const v of vouchers.rows) {
        if (remaining <= 0) break;
        const canReverse = Math.min(remaining, parseFloat(v.recovered_amount));
        const newRecovered = parseFloat(v.recovered_amount) - canReverse;
        const newStatus = newRecovered <= 0 ? 'issued'
                        : newRecovered < parseFloat(v.advance_value) ? 'partial'
                        : 'recovered';
        await query(
          `UPDATE tqs_advance_vouchers
           SET recovered_amount = $1,
               status = $2,
               updated_at = NOW()
           WHERE id = $3`,
          [newRecovered, newStatus, v.id]
        );
        remaining -= canReverse;
      }

      // Also reverse from tqs_advances (bill-workflow advance table)
      const advWhere = bill.vendor_id
        ? `(vendor_id = $2 OR vendor_name ILIKE $3)`
        : `vendor_name ILIKE $2`;
      const advParams = bill.vendor_id
        ? [req.user.company_id, bill.vendor_id, `%${bill.vendor_name}%`]
        : [req.user.company_id, `%${bill.vendor_name}%`];

      const openAdvances = await query(
        `SELECT id, recovered_amount FROM tqs_advances
         WHERE company_id = $1 AND ${advWhere} AND recovered_amount > 0
         ORDER BY COALESCE(updated_at, created_at) DESC`,
        advParams
      );
      let toReverseAdv = toReverse;
      for (const adv of openAdvances.rows) {
        if (toReverseAdv <= 0) break;
        const canReverse = Math.min(toReverseAdv, parseFloat(adv.recovered_amount));
        await query(
          `UPDATE tqs_advances SET recovered_amount = recovered_amount - $1 WHERE id = $2`,
          [canReverse, adv.id]
        );
        toReverseAdv -= canReverse;
      }
    }

    res.json({ message: 'Bill deleted' });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

// ── POST /tqs/bills/repair-certified-net ─────────────────────────────────────
// Fixes bills that went through QS stage but ended up with certified_net = 0
// (caused by the simple date-only QS tab not sending qs_gross).
// Sets certified_net = total_amount for affected bills, then recalculates
// balance_to_pay = certified_net - paid_amount.
// Safe to run multiple times — only touches records with certified_net = 0.
router.post('/repair-certified-net', async (req, res) => {
  try {
    const { company_id } = req.user;
    const conditions = [
      'b.company_id = $1',
      'b.is_deleted = FALSE',
      "b.workflow_status IN ('accounts','procurement','qs_sign','paid')",
      'COALESCE(u.certified_net, 0) = 0',
      'b.total_amount > 0',
    ];
    const params = [company_id];
    applyProjectScope(req, conditions, params, 'b', req.query.project_id || null);

    // Find all bills past QS stage with certified_net = 0 (or null)
    const toFix = await query(`
      SELECT b.id, b.sl_number, b.project_id, b.total_amount,
             COALESCE(u.paid_amount, 0) AS paid_amount,
             COALESCE(u.tds_deduction, 0) AS tds_deduction,
             COALESCE(u.advance_recovered, 0) AS advance_recovered,
             COALESCE(u.other_deductions, 0) AS other_deductions,
             COALESCE(u.retention_money, 0) AS retention_money
      FROM tqs_bills b
      JOIN tqs_bill_updates u ON u.bill_id = b.id
      WHERE ${conditions.join(' AND ')}
    `, params);

    if (!toFix.rows.length) {
      return res.json({ success: true, fixed: 0, message: 'No bills needed repair' });
    }

    let fixed = 0;
    for (const bill of toFix.rows) {
      const totalAmt     = parseFloat(bill.total_amount || 0);
      const deductions   = parseFloat(bill.tds_deduction || 0)
                         + parseFloat(bill.advance_recovered || 0)
                         + parseFloat(bill.other_deductions || 0)
                         + parseFloat(bill.retention_money || 0);
      const certNet      = Math.max(0, totalAmt - deductions);
      const paidAmt      = parseFloat(bill.paid_amount || 0);
      const balanceToPay = Math.max(0, certNet - paidAmt);

      await query(`
        UPDATE tqs_bill_updates
        SET certified_net  = $1,
            qs_gross       = CASE WHEN COALESCE(qs_gross, 0) = 0 THEN $2 ELSE qs_gross END,
            qs_total       = CASE WHEN COALESCE(qs_total, 0) = 0 THEN $2 ELSE qs_total END,
            balance_to_pay = $3,
            updated_at     = NOW()
        WHERE bill_id = $4
      `, [certNet, totalAmt, balanceToPay, bill.id]);

      await query(`
        INSERT INTO tqs_bill_history (bill_id, dept, action, changed_by)
        VALUES ($1, 'system', $2, $3)
      `, [
        bill.id,
        `Certified net repaired: ₹0 → ₹${certNet.toFixed(2)} (total_amount fallback)`,
        req.user.id,
      ]);

      fixed++;
    }

    res.json({
      success: true,
      fixed,
      message: `Repaired ${fixed} bill${fixed !== 1 ? 's' : ''} — certified_net set from total_amount`,
    });
  } catch (err) {
    console.error('[repair-certified-net]', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── POST /tqs/bills/backfill-jv ───────────────────────────────────────────────
// One-time backfill: post auto JVs for already-certified (accounts-processed)
// bills that don't have one yet. Idempotent — re-running skips bills already done.
// Body: { dry_run?: bool, project_id?: uuid, limit?: int }
router.post('/backfill-jv', async (req, res) => {
  try {
    const { company_id } = req.user;
    const dryRun = req.body?.dry_run === true || req.body?.dry_run === 'true';
    const limit  = Math.min(parseInt(req.body?.limit) || 5000, 5000);
    const nn = (v) => parseFloat(v || 0) || 0;

    const conditions = [
      'b.company_id = $1',
      'b.is_deleted = FALSE',
      'b.total_amount > 0',
      // Accounts has processed the bill (not merely sitting at QS/accounts inbox)
      "(u.accts_jv_date IS NOT NULL OR b.workflow_status IN ('procurement','qs_sign','paid'))",
      // No auto JV exists yet for this bill
      `NOT EXISTS (
         SELECT 1 FROM journal_entries je
         WHERE je.company_id = b.company_id
           AND je.source = 'auto_tqs_bill'
           AND je.reference = b.sl_number
       )`,
    ];
    const params = [company_id];
    applyProjectScope(req, conditions, params, 'b', req.body?.project_id || null);

    const candidates = await query(`
      SELECT b.id, b.sl_number, b.bill_type, b.total_amount, b.gst_amount, b.tcs_amt,
             b.vendor_name, b.wo_number, b.po_number, b.grn_id, b.project_id,
             COALESCE(u.tds_deduction, 0)   AS tds_deduction,
             COALESCE(u.retention_money, 0) AS retention_money,
             COALESCE(u.accts_jv_date, u.qs_certified_date, b.received_date, b.inv_date, CURRENT_DATE) AS jv_date
      FROM tqs_bills b
      JOIN tqs_bill_updates u ON u.bill_id = b.id
      WHERE ${conditions.join(' AND ')}
      ORDER BY b.created_at ASC
      LIMIT ${limit}
    `, params);

    if (dryRun) {
      const totalValue = candidates.rows.reduce((s, r) => s + nn(r.total_amount), 0);
      return res.json({
        success: true, dry_run: true,
        eligible: candidates.rows.length,
        total_value: totalValue,
        sample: candidates.rows.slice(0, 10).map(r => ({
          sl_number: r.sl_number, vendor: r.vendor_name, total: nn(r.total_amount), jv_date: r.jv_date,
        })),
        message: `${candidates.rows.length} bill(s) would get a JV (preview only — nothing posted).`,
      });
    }

    let posted = 0, skipped = 0;
    const failures = [];
    for (const bill of candidates.rows) {
      const total       = nn(bill.total_amount);
      const gst         = nn(bill.gst_amount);
      const tcs         = nn(bill.tcs_amt);
      const expenseBase = total - gst - tcs;
      const tds         = nn(bill.tds_deduction);
      const retention   = nn(bill.retention_money);
      const apCredit    = total - tds - retention;
      const isWO        = (bill.bill_type === 'wo') || (!!bill.wo_number && !bill.po_number);
      const grinCode    = await resolveGrinClearingCode(company_id, bill.grn_id);
      const expenseCode = grinCode || (isWO ? '5100' : '5000');
      const ref         = bill.sl_number;

      const expenseLabel = grinCode ? 'GRIN clearing' : (isWO ? 'Subcontractor' : 'Material');
      const lines = [
        { code: expenseCode, debit: expenseBase, description: `${expenseLabel} — ${bill.vendor_name || ''} ${ref}` },
      ];
      if (gst > 0)       lines.push({ code: '1300', debit: gst, description: `Input GST / ITC — ${ref}` });
      if (tcs > 0)       lines.push({ code: '1310', debit: tcs, description: `TCS collected by vendor — ${ref}` });
      lines.push({ code: '2000', credit: apCredit, description: `Payable to ${bill.vendor_name || 'vendor'} — ${ref}` });
      if (tds > 0)       lines.push({ code: '2200', credit: tds, description: `TDS deducted — ${ref}` });
      if (retention > 0) lines.push({ code: '2300', credit: retention, description: `Retention withheld — ${ref}` });

      const jeId = await postAutoJournalStandalone({
        companyId: company_id,
        userId:    req.user.id,
        entryDate: bill.jv_date,
        projectId: bill.project_id || null,
        reference: ref,
        narration: `Bill booking (backfill) — ${bill.vendor_name || ''} (${ref})`,
        source:    'auto_tqs_bill',
        lines,
      });
      if (jeId) posted++;
      else { skipped++; failures.push(ref); }
    }

    res.json({
      success: true,
      eligible: candidates.rows.length,
      posted,
      skipped,
      skipped_refs: failures.slice(0, 20),
      message: skipped
        ? `Posted ${posted} JV(s); skipped ${skipped} (Chart of Accounts may be missing codes — seed it and re-run).`
        : `Posted ${posted} JV(s) for previously-certified bills.`,
    });
  } catch (err) {
    console.error('[backfill-jv]', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;

