// src/routes/liability-register.routes.js
// Vendor-wise Liability Register - Tally-style payables ledger
const express = require('express');
const { authenticate, authorize } = require('../middleware/auth');
const { loadProjectScope, userCanAccessProject } = require('../middleware/projectScope');
const { query } = require('../config/database');
const { runSchemaInit } = require('../utils/schemaInit');
const { runLiabilityAutomation } = require('../utils/liability-automation.service');
const {
  advanceSourceSql,
  billCreditSql,
  billSourceSql,
  getVendorLiabilitySummary,
  normalizeAccountType,
} = require('../services/tqsLiability.service');

const router = express.Router();
router.use(authenticate);
router.use(loadProjectScope);

// ── Migration gate: ensure tds_amount exists on tqs_advances before any query
let _tdsMigrationDone = false;
let _tdsMigrationPromise = null;
async function ensureTdsColumn() {
  if (_tdsMigrationDone) return;
  if (!_tdsMigrationPromise) {
    _tdsMigrationPromise = query(
      `ALTER TABLE tqs_advances ADD COLUMN IF NOT EXISTS tds_amount NUMERIC(15,2) DEFAULT 0`
    ).then(() => { _tdsMigrationDone = true; })
     .catch(e => { console.warn('[liability-register] tds_amount migration:', e.message); _tdsMigrationDone = true; });
  }
  return _tdsMigrationPromise;
}
runSchemaInit('liability_register_tds', ensureTdsColumn);
router.use(async (_req, _res, next) => { await ensureTdsColumn(); next(); });

// POST /tqs/liability-register/automation/run - manual liability alert trigger
router.post(
  '/automation/run',
  authorize('super_admin', 'admin', 'accounts_manager', 'finance_manager', 'procurement_manager'),
  async (_req, res) => {
    try {
      const result = await runLiabilityAutomation({ manual: true });
      res.json(result);
    } catch (err) {
      console.error('[liability-register] automation/run:', err.message, err.stack);
      res.status(500).json({ error: err.message });
    }
  }
);

// GET /tqs/liability-register - centralized vendor payable summary
router.get('/', async (req, res) => {
  try {
    const { project_id, from_date, to_date, search, source_type, bill_type } = req.query;
    if (project_id && project_id.trim() && !userCanAccessProject(req, project_id)) {
      return res.status(403).json({ error: 'Access denied for this project.' });
    }
    const rows = await getVendorLiabilitySummary({
      companyId: req.user.company_id,
      projectId: project_id,
      projectIds: !project_id && !req.isGlobalRole ? (req.allowedProjectIds || []) : undefined,
      fromDate: from_date,
      toDate: to_date,
      search,
      sourceType: source_type,
      billType: bill_type,
    });
    res.json(rows);
  } catch (err) {
    console.error('[liability-register] GET /:', err.message, err.stack);
    res.status(500).json({ error: err.message });
  }
});

// GET /tqs/liability-register/ledger - chronological debit/credit ledger
router.get('/ledger', async (req, res) => {
  try {
    const { vendor_name, project_id, from_date, to_date, source_type, bill_type } = req.query;
    const accountType = normalizeAccountType(source_type || bill_type);
    if (!vendor_name) return res.status(400).json({ error: 'vendor_name is required' });
    if (project_id && project_id.trim() && !userCanAccessProject(req, project_id)) {
      return res.status(403).json({ error: 'Access denied for this project.' });
    }

    const params = [req.user.company_id, vendor_name];

    let billProjectFilter = '';
    let advProjectFilter = '';
    let avProjectFilter = '';
    let scProjectFilter = '';
    if (project_id && project_id.trim()) {
      params.push(project_id);
      const pn = params.length;
      billProjectFilter = `AND b.project_id = $${pn}`;
      advProjectFilter = `AND a.project_id = $${pn}`;
      avProjectFilter = `AND av.project_id = $${pn}`;
      scProjectFilter = `AND sb.project_id = $${pn}`;
    } else if (!req.isGlobalRole) {
      const allowed = req.allowedProjectIds || [];
      if (allowed.length === 0) {
        billProjectFilter = 'AND FALSE';
        advProjectFilter = 'AND FALSE';
        avProjectFilter = 'AND FALSE';
        scProjectFilter = 'AND FALSE';
      } else {
        params.push(allowed);
        const pn = params.length;
        billProjectFilter = `AND b.project_id = ANY($${pn}::uuid[])`;
        advProjectFilter = `AND a.project_id = ANY($${pn}::uuid[])`;
        avProjectFilter = `AND av.project_id = ANY($${pn}::uuid[])`;
        scProjectFilter = `AND sb.project_id = ANY($${pn}::uuid[])`;
      }
    }

    // SC bills are neither PO nor WO — include in the unfiltered "All" view
    // and the dedicated "SC" tab.
    const scLedgerGate = (accountType === 'all' || accountType === 'sc') ? '' : 'AND FALSE';

    let billTypeFilter = '';
    let advSourceFilter = '';
    let avSourceFilter = '';
    if (accountType === 'po' || accountType === 'wo') {
      billTypeFilter = `AND ${billSourceSql(accountType, 'b')}`;
      advSourceFilter = `AND ${advanceSourceSql(accountType, 'a')}`;
      avSourceFilter = `AND ${advanceSourceSql(accountType, 'av')}`;
    } else if (accountType === 'sc') {
      // SC tab shows only subcontractor entries — exclude PO/WO bill rows.
      billTypeFilter = 'AND FALSE';
      advSourceFilter = 'AND FALSE';
      avSourceFilter = 'AND FALSE';
    }

    const advanceCreditSql = `
      CASE WHEN EXISTS (
        SELECT 1
        FROM tqs_advances a
        WHERE a.company_id = $1
          AND LOWER(TRIM(a.vendor_name)) = LOWER(TRIM($2))
          ${advProjectFilter}
          ${advSourceFilter}
      )
      THEN COALESCE(u.advance_recovered, 0)
      ELSE 0
      END
    `;

    let dateWhere = '';
    if (from_date && to_date) {
      params.push(from_date, to_date);
      dateWhere = `WHERE (txn_date IS NULL OR txn_date BETWEEN $${params.length - 1} AND $${params.length})`;
    } else if (from_date) {
      params.push(from_date);
      dateWhere = `WHERE (txn_date IS NULL OR txn_date >= $${params.length})`;
    } else if (to_date) {
      params.push(to_date);
      dateWhere = `WHERE (txn_date IS NULL OR txn_date <= $${params.length})`;
    }

    const { rows } = await query(`
      SELECT * FROM (
        SELECT
          b.inv_date AS txn_date,
          'Invoice' AS entry_type,
          b.sl_number AS vch_number,
          b.inv_number AS invoice_ref,
          'Bill Received: ' || b.sl_number
            || CASE WHEN b.po_number IS NOT NULL THEN ' | PO: ' || b.po_number ELSE '' END
            || CASE WHEN b.work_desc IS NOT NULL THEN ' - ' || LEFT(b.work_desc, 60) ELSE '' END AS narration,
          p.name AS project_name,
          NULL::numeric AS debit_amount,
          ${billCreditSql('b', 'u', advanceCreditSql)} AS credit_amount,
          b.workflow_status,
          b.id::text AS source_id,
          b.bill_type,
          ${billCreditSql('b', 'u', advanceCreditSql)} AS invoice_gross,
          b.inv_date AS invoice_date
        FROM tqs_bills b
        LEFT JOIN tqs_bill_updates u ON u.bill_id = b.id
        LEFT JOIN projects p ON p.id = b.project_id
        WHERE (b.company_id = $1 OR b.company_id IS NULL)
          AND LOWER(TRIM(b.vendor_name)) = LOWER(TRIM($2))
          AND b.is_deleted = FALSE
          ${billProjectFilter}
          ${billTypeFilter}

        UNION ALL

        SELECT
          COALESCE(u.qs_certified_date, u.handed_over_accounts_date, b.updated_at::date),
          'TDS Deduction',
          COALESCE(u.pc_number, '-'),
          b.inv_number,
          'TDS Deducted on: ' || b.inv_number
            || CASE WHEN u.pc_number IS NOT NULL THEN ' (PC: ' || u.pc_number || ')' ELSE '' END,
          p.name,
          u.tds_deduction,
          NULL::numeric,
          b.workflow_status,
          b.id::text,
          b.bill_type,
          NULL::numeric,
          b.inv_date
        FROM tqs_bills b
        JOIN tqs_bill_updates u ON u.bill_id = b.id
        LEFT JOIN projects p ON p.id = b.project_id
        WHERE (b.company_id = $1 OR b.company_id IS NULL)
          AND LOWER(TRIM(b.vendor_name)) = LOWER(TRIM($2))
          AND b.is_deleted = FALSE
          AND COALESCE(u.tds_deduction, 0) > 0
          ${billProjectFilter}
          ${billTypeFilter}

        UNION ALL

        SELECT
          COALESCE(u.qs_certified_date, u.handed_over_accounts_date, b.updated_at::date),
          'Other Deduction',
          COALESCE(u.pc_number, '-'),
          b.inv_number,
          'Deductions on: ' || b.inv_number,
          p.name,
          u.other_deductions,
          NULL::numeric,
          b.workflow_status,
          b.id::text,
          b.bill_type,
          NULL::numeric,
          b.inv_date
        FROM tqs_bills b
        JOIN tqs_bill_updates u ON u.bill_id = b.id
        LEFT JOIN projects p ON p.id = b.project_id
        WHERE (b.company_id = $1 OR b.company_id IS NULL)
          AND LOWER(TRIM(b.vendor_name)) = LOWER(TRIM($2))
          AND b.is_deleted = FALSE
          AND COALESCE(u.other_deductions, 0) > 0
          ${billProjectFilter}
          ${billTypeFilter}

        UNION ALL

        -- ⚠️ Advance Recovery row REMOVED — recoveries are not separate Dr entries
        -- in the vendor ledger; they simply reduce the payment line below.
        -- The original advance (tqs_advances) is already debited via "Advance Given".

        SELECT
          u.payment_date,
          'Payment',
          COALESCE(u.reference_number, u.pc_number, '-'),
          b.inv_number,
          'Payment for Invoice: ' || b.inv_number
            || CASE WHEN u.reference_number IS NOT NULL THEN ' (UTR: ' || u.reference_number || ')' ELSE '' END
            || CASE WHEN u.bank_name IS NOT NULL THEN ' | ' || u.bank_name ELSE '' END
            || CASE WHEN u.payment_mode IS NOT NULL THEN ' / ' || u.payment_mode ELSE '' END,
          p.name,
          u.paid_amount,
          NULL::numeric,
          b.workflow_status,
          b.id::text,
          b.bill_type,
          NULL::numeric,
          b.inv_date
        FROM tqs_bills b
        JOIN tqs_bill_updates u ON u.bill_id = b.id
        LEFT JOIN projects p ON p.id = b.project_id
        WHERE (b.company_id = $1 OR b.company_id IS NULL)
          AND LOWER(TRIM(b.vendor_name)) = LOWER(TRIM($2))
          AND b.is_deleted = FALSE
          AND COALESCE(u.paid_amount, 0) > 0
          ${billProjectFilter}
          ${billTypeFilter}

        UNION ALL

        SELECT
          a.payment_date,
          'Advance Given',
          COALESCE(a.reference_number, '-'),
          COALESCE(a.po_number, a.wo_number, '-'),
          'Advance Payment'
            || CASE WHEN a.wo_number IS NOT NULL THEN ' - WO: ' || a.wo_number
                    WHEN a.po_number IS NOT NULL THEN ' - PO: ' || a.po_number
                    ELSE '' END
            || CASE WHEN a.reference_number IS NOT NULL THEN ' (UTR: ' || a.reference_number || ')' ELSE '' END
            || CASE WHEN a.bank_name IS NOT NULL THEN ' | ' || a.bank_name ELSE '' END
            || CASE WHEN a.payment_mode IS NOT NULL THEN ' / ' || a.payment_mode ELSE '' END,
          p.name,
          a.amount,
          NULL::numeric,
          'advance',
          a.id::text,
          'advance',
          NULL::numeric,
          NULL::date
        FROM tqs_advances a
        LEFT JOIN projects p ON p.id = a.project_id
        WHERE a.company_id = $1
          AND LOWER(TRIM(a.vendor_name)) = LOWER(TRIM($2))
          ${advProjectFilter}
          ${advSourceFilter}

        UNION ALL

        -- Procurement Advance Tracker (tqs_advance_vouchers) — disbursed WO/PO advances
        SELECT
          av.pay_date,
          'Advance Given',
          COALESCE(av.voucher_number, av.sl_number, '-'),
          COALESCE(av.wo_number, av.po_number, '-'),
          'Advance Payment'
            || CASE WHEN av.wo_number IS NOT NULL THEN ' - WO: ' || av.wo_number
                    WHEN av.po_number IS NOT NULL THEN ' - PO: ' || av.po_number
                    ELSE '' END
            || CASE WHEN av.voucher_number IS NOT NULL THEN ' (Voucher: ' || av.voucher_number || ')' ELSE '' END
            || CASE WHEN av.remarks IS NOT NULL THEN ' | ' || av.remarks ELSE '' END,
          p2.name,
          av.paid_amount,
          NULL::numeric,
          'advance',
          av.id::text,
          'advance',
          NULL::numeric
        FROM tqs_advance_vouchers av
        LEFT JOIN projects p2 ON p2.id = av.project_id
        WHERE av.company_id = $1
          AND LOWER(TRIM(av.vendor_name)) = LOWER(TRIM($2))
          AND av.is_deleted = FALSE
          AND COALESCE(av.paid_amount, 0) > 0
          ${avProjectFilter}
          ${avSourceFilter}

        -- ⚠️ TDS on advance is NOT a vendor-ledger entry — it's between
        -- the company and the tax department. The advance gross is already
        -- shown as Dr above; net cash out (gross - tds) is what actually went
        -- to the vendor. We don't post a separate TDS row here.

        UNION ALL

        -- Subcontractor RA bill (sc_bills) — Credit = net payable owed to the SC
        SELECT
          sb.bill_date,
          'SC Bill',
          sb.bill_number,
          sb.bill_number,
          'SC RA Bill: ' || sb.bill_number
            || CASE WHEN wo.wo_number IS NOT NULL THEN ' | WO: ' || wo.wo_number ELSE '' END,
          p.name,
          NULL::numeric,
          COALESCE(sb.net_payable, 0),
          sb.status,
          sb.id::text,
          'sc',
          COALESCE(sb.net_payable, 0)
        FROM sc_bills sb
        JOIN sc_subcontractors sc ON sc.id = sb.sc_id
        LEFT JOIN sc_work_orders wo ON wo.id = sb.wo_id
        LEFT JOIN projects p ON p.id = sb.project_id
        WHERE sb.company_id = $1
          AND LOWER(TRIM(sc.name)) = LOWER(TRIM($2))
          AND LOWER(COALESCE(sb.status, '')) <> 'rejected'
          ${scProjectFilter}
          ${scLedgerGate}

        UNION ALL

        -- Subcontractor payments (sc_payments) — Debit = amount paid to the SC
        SELECT
          sp.payment_date,
          'Payment',
          COALESCE(sp.utr_number, sp.reference_no, sp.voucher_number, '-'),
          sb.bill_number,
          'Payment for SC Bill: ' || sb.bill_number
            || CASE WHEN sp.utr_number IS NOT NULL THEN ' (UTR: ' || sp.utr_number || ')' ELSE '' END
            || CASE WHEN sp.bank_name IS NOT NULL THEN ' | ' || sp.bank_name ELSE '' END
            || CASE WHEN sp.payment_mode IS NOT NULL THEN ' / ' || sp.payment_mode ELSE '' END,
          p.name,
          sp.amount,
          NULL::numeric,
          sb.status,
          sb.id::text,
          'sc',
          NULL::numeric
        FROM sc_payments sp
        JOIN sc_bills sb ON sb.id = sp.bill_id
        JOIN sc_subcontractors sc ON sc.id = sb.sc_id
        LEFT JOIN projects p ON p.id = sb.project_id
        WHERE sp.company_id = $1
          AND LOWER(TRIM(sc.name)) = LOWER(TRIM($2))
          AND COALESCE(sp.amount, 0) > 0
          ${scProjectFilter}
          ${scLedgerGate}
      ) ledger
      ${dateWhere}
      ORDER BY txn_date ASC NULLS FIRST, entry_type ASC
    `, params);

    const round2 = (v) => Math.round(parseFloat(v) * 100) / 100;
    let balance = 0;
    const ledger = rows.map(r => {
      const cr = round2(r.credit_amount || 0);
      const dr = round2(r.debit_amount || 0);
      balance = Math.round((balance + cr - dr) * 100) / 100;
      return {
        ...r,
        credit_amount: r.credit_amount == null ? null : cr,
        debit_amount: r.debit_amount == null ? null : dr,
        invoice_gross: r.invoice_gross == null ? null : round2(r.invoice_gross),
        running_balance: balance,
      };
    });

    const totalCr = ledger.reduce((s, r) => s + (r.credit_amount || 0), 0);
    const totalDr = ledger.reduce((s, r) => s + (r.debit_amount || 0), 0);
    const closingBalance = totalCr - totalDr;

    res.json({
      vendor_name,
      ledger,
      totals: {
        total_credit: totalCr,
        total_debit: totalDr,
        closing_balance: Math.abs(closingBalance) <= 5 ? 0 : closingBalance,
      },
    });
  } catch (err) {
    console.error('[liability-register] GET /ledger:', err.message, '\n', err.stack);
    res.status(500).json({ error: err.message });
  }
});

// PATCH /tqs/liability-register/advance/:id — edit advance amount + TDS
//
// Ledger rows tagged 'Advance Given' now come from two tables (tqs_advances,
// uuid ids; tqs_advance_vouchers, integer ids) but look identical to the
// frontend, so the id's own format is the only signal for which table to hit.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

router.patch('/advance/:id', async (req, res) => {
  try {
    const { amount, tds_amount, payment_date, reference_number, remarks } = req.body;
    const isVoucher = !UUID_RE.test(req.params.id);

    if (isVoucher) {
      // Advance Tracker (tqs_advance_vouchers) — no tds_amount/reference_number
      // column on this table, so those two fields are accepted but ignored here.
      const existing = await query(
        `SELECT id, project_id FROM tqs_advance_vouchers WHERE id = $1::int AND company_id = $2`,
        [req.params.id, req.user.company_id]
      );
      if (!existing.rows.length) return res.status(404).json({ error: 'Advance not found' });
      if (!userCanAccessProject(req, existing.rows[0].project_id)) {
        return res.status(403).json({ error: 'Access denied for this project.' });
      }
      const { rows } = await query(
        `UPDATE tqs_advance_vouchers
         SET paid_amount = COALESCE($1, paid_amount),
             pay_date    = COALESCE($2, pay_date),
             remarks     = COALESCE($3, remarks),
             updated_at  = NOW()
         WHERE id = $4::int AND company_id = $5
         RETURNING *`,
        [
          amount != null ? parseFloat(amount) : null,
          payment_date || null,
          remarks != null ? remarks : null,
          req.params.id,
          req.user.company_id,
        ]
      );
      if (!rows.length) return res.status(404).json({ error: 'Advance not found' });
      return res.json({ data: rows[0] });
    }

    const existing = await query(
      `SELECT id, project_id
       FROM tqs_advances
       WHERE id = $1 AND company_id = $2`,
      [req.params.id, req.user.company_id]
    );
    if (!existing.rows.length) return res.status(404).json({ error: 'Advance not found' });
    if (!userCanAccessProject(req, existing.rows[0].project_id)) {
      return res.status(403).json({ error: 'Access denied for this project.' });
    }

    const { rows } = await query(
      `UPDATE tqs_advances
       SET amount            = COALESCE($1, amount),
           tds_amount        = COALESCE($2, tds_amount),
           payment_date      = COALESCE($3, payment_date),
           reference_number  = COALESCE($4, reference_number),
           remarks           = COALESCE($5, remarks),
           updated_at        = NOW()
       WHERE id = $6 AND company_id = $7
       RETURNING *`,
      [
        amount     != null ? parseFloat(amount)     : null,
        tds_amount != null ? parseFloat(tds_amount) : null,
        payment_date      || null,
        reference_number  || null,
        remarks           != null ? remarks : null,
        req.params.id,
        req.user.company_id,
      ]
    );
    if (!rows.length) return res.status(404).json({ error: 'Advance not found' });
    res.json({ data: rows[0] });
  } catch (err) {
    console.error('[liability-register] PATCH /advance:', err.message, err.stack);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
