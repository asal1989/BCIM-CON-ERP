// src/routes/payment.routes.js
const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const { query, withTransaction } = require('../config/database');
const { runSchemaInit } = require('../utils/schemaInit');
const { notifyPaymentRecorded } = require('../services/notif.helper');

router.use(authenticate);

// Ensure new columns exist on live DB (idempotent)
const ensurePaymentCols = async () => {
  const alters = [
    `ALTER TABLE payments ADD COLUMN IF NOT EXISTS cost_head    VARCHAR(100)`,
    `ALTER TABLE payments ADD COLUMN IF NOT EXISTS tqs_bill_id  UUID`,
    `ALTER TABLE payments ADD COLUMN IF NOT EXISTS pc_number    TEXT`,
    `ALTER TABLE payments ADD COLUMN IF NOT EXISTS source       TEXT DEFAULT 'manual'`,
    // Remove old check constraints that blocked RTGS/NEFT/IMPS payment modes
    // and the 'success'/'failed'/'refunded' status values that don't match the UI
    `ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_payment_mode_check`,
    `ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_status_check`,
    `ALTER TABLE payments ALTER COLUMN status SET DEFAULT 'paid'`,
    `ALTER TABLE payments ALTER COLUMN payment_mode TYPE VARCHAR(30)`,
    `ALTER TABLE payments ALTER COLUMN status TYPE VARCHAR(30)`,
  ];
  for (const sql of alters) {
    try { await query(sql); } catch (_) {}
  }
};
runSchemaInit('payments', ensurePaymentCols);

const n = (v) => parseFloat(v || 0) || 0;
const round2 = (v) => Math.round(n(v) * 100) / 100;
const billPayableCap = (bill = {}) => {
  const gross = n(bill.total_amount);
  const deductions = n(bill.tds_deduction) + n(bill.other_deductions) + n(bill.advance_recovered);
  const netFromGross = Math.max(0, gross - deductions);
  const certified = n(bill.certified_net);
  if (certified > 0 && (!gross || certified <= gross + 0.01)) return round2(certified);
  if (gross > 0) return round2(netFromGross);
  return round2(certified);
};

// ── GET /payments ─────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  const { project_id, payment_type, from_date, to_date } = req.query;
  let sql = `SELECT pay.*, p.name AS project_name
             FROM payments pay
             JOIN projects p ON pay.project_id = p.id
             WHERE p.company_id = $1`;
  const params = [req.user.company_id]; let i = 2;
  if (project_id)   { sql += ` AND pay.project_id   = $${i++}`; params.push(project_id); }
  if (payment_type) { sql += ` AND pay.payment_type = $${i++}`; params.push(payment_type); }
  if (from_date)    { sql += ` AND pay.payment_date >= $${i++}`; params.push(from_date); }
  if (to_date)      { sql += ` AND pay.payment_date <= $${i++}`; params.push(to_date); }
  sql += ' ORDER BY pay.payment_date DESC';
  const r = await query(sql, params);
  res.json({ data: r.rows, count: r.rowCount });
});

// ── POST /payments ────────────────────────────────────────────────────────
// Accepts optional tqs_bill_id / pc_number to sync back to DQS Tracker
router.post('/', authorize('super_admin', 'admin', 'accountant'), async (req, res) => {
  try {
    const {
      project_id, payment_type, entity_name, entity_pan, invoice_id,
      amount, tds_deducted, payment_date, payment_mode, reference_number,
      bank_name, remarks, cost_head,
      status,
      // DQS linkage (optional)
      tqs_bill_id,   // UUID of a single tqs_bill
      pc_number,     // payment-certificate number (covers multiple bills)
    } = req.body;

    const projectCheck = await query(
      `SELECT 1 FROM projects WHERE id = $1 AND company_id = $2 LIMIT 1`,
      [project_id, req.user.company_id]
    );
    if (!projectCheck.rowCount) {
      return res.status(400).json({ error: 'Invalid project for this company' });
    }

    const net  = parseFloat(amount) - parseFloat(tds_deducted || 0);
    const paid = parseFloat(amount);

    // Normalize payment mode — DB constraint uses lowercase values
    const MODE_MAP = {
      'RTGS': 'rtgs', 'NEFT': 'neft', 'IMPS': 'imps',
      'UPI': 'upi', 'Cheque': 'cheque', 'Cash': 'cash', 'DD': 'dd',
    };
    const normalizedMode = MODE_MAP[payment_mode] || (payment_mode || 'other').toLowerCase();

    const result = await withTransaction(async (client) => {
      // 1. Insert into payments table
      const ins = await client.query(
        `INSERT INTO payments
           (project_id, payment_type, entity_name, entity_pan, invoice_id,
            amount, tds_deducted, net_amount, payment_date, payment_mode,
            reference_number, bank_name, remarks, created_by, cost_head,
            tqs_bill_id, pc_number, source, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
         RETURNING *`,
        [
          project_id, payment_type, entity_name, entity_pan || null, invoice_id || null,
          paid, tds_deducted || 0, net, payment_date, normalizedMode,
          reference_number || null, bank_name || null, remarks || null,
          req.user.id, cost_head || null,
          tqs_bill_id || null, pc_number || null,
          (tqs_bill_id || pc_number) ? 'finance' : 'manual',
          status || 'paid',
        ]
      );
      const payment = ins.rows[0];

      // 2. ── Sync back to DQS Tracker ──────────────────────────────────────
      if (pc_number) {
        // Fetch all bills under this PC — include existing paid_amount for accumulation
        const { rows: bills } = await client.query(
          `SELECT b.id, b.project_id, b.total_amount,
                  u.certified_net,
                  u.tds_deduction,
                  u.other_deductions,
                  u.advance_recovered,
                  COALESCE(u.paid_amount, 0) AS existing_paid
           FROM tqs_bills b
           JOIN tqs_bill_updates u ON u.bill_id = b.id
           WHERE u.pc_number = $1
             AND b.company_id = $2
             AND b.is_deleted = FALSE`,
          [pc_number, req.user.company_id]
        );

        const totalCertified = bills.reduce((s, b) => s + billPayableCap(b), 0);

        for (const bill of bills) {
          const cert         = billPayableCap(bill);
          const prevPaid     = parseFloat(bill.existing_paid  || 0);
          const remaining    = Math.max(0, cert - prevPaid);
          // Prorate THIS payment across bills by certified net
          const thisPayment  = totalCertified > 0
            ? Math.round((cert / totalCertified) * paid * 100) / 100
            : cert;
          if (thisPayment > remaining + 0.01) {
            throw new Error(`Payment exceeds payable balance for DQS bill. Remaining payable is Rs ${remaining.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}.`);
          }
          // Accumulate: add this payment to whatever was previously paid
          const totalBillPaid = Math.round((prevPaid + thisPayment) * 100) / 100;
          const billBal       = Math.max(0, cert - totalBillPaid);
          const billStatus    = billBal < 0.01 ? 'paid' : 'partial';

          await client.query(
            `UPDATE tqs_bill_updates SET
               paid_amount        = $1,
               balance_to_pay     = $2,
               payment_status     = $3,
               payment_date       = $4,
               payment_mode       = $5,
               reference_number   = $6,
               bank_name          = $7,
               finance_payment_id = $8,
               updated_at         = NOW()
             WHERE bill_id = $9`,
            [totalBillPaid, billBal, billStatus,
             payment_date || null, payment_mode || null,
             reference_number || null, bank_name || null,
             payment.id, bill.id]
          );

          await client.query(
            `UPDATE tqs_bills SET workflow_status = $1, updated_at = NOW() WHERE id = $2`,
            [billStatus === 'paid' ? 'paid' : 'accounts', bill.id]
          );

          // History log — show incremental amount + running total
          await client.query(
            `INSERT INTO tqs_bill_history (bill_id, dept, action, changed_by)
             VALUES ($1, 'accounts', $2, $3)`,
            [bill.id,
             `${prevPaid > 0 ? 'Partial' : 'Finance'} payment — PC: ${pc_number} +₹${thisPayment} (total paid: ₹${totalBillPaid}, balance: ₹${billBal})${reference_number ? ' UTR:' + reference_number : ''}`,
             req.user.id]
          );
        }

      } else if (tqs_bill_id) {
        // Update single bill — accumulate paid_amount
        const { rows: bills } = await client.query(
          `SELECT b.id, b.total_amount,
                  u.certified_net, u.tds_deduction, u.other_deductions, u.advance_recovered,
                  COALESCE(u.paid_amount, 0) AS existing_paid
           FROM tqs_bills b
           JOIN tqs_bill_updates u ON u.bill_id = b.id
           WHERE b.id = $1 AND b.company_id = $2 AND b.is_deleted = FALSE`,
          [tqs_bill_id, req.user.company_id]
        );

        if (bills.length) {
          const bill          = bills[0];
          const cert          = billPayableCap(bill);
          const prevPaid      = parseFloat(bill.existing_paid || 0);
          const remaining     = Math.max(0, cert - prevPaid);
          if (paid > remaining + 0.01) {
            throw new Error(`Payment exceeds payable balance for DQS bill. Remaining payable is Rs ${remaining.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}.`);
          }
          const totalBillPaid = Math.round((prevPaid + paid) * 100) / 100;
          const billBal       = Math.max(0, cert - totalBillPaid);
          const billStatus    = billBal < 0.01 ? 'paid' : 'partial';

          await client.query(
            `UPDATE tqs_bill_updates SET
               paid_amount        = $1,
               balance_to_pay     = $2,
               payment_status     = $3,
               payment_date       = $4,
               payment_mode       = $5,
               reference_number   = $6,
               bank_name          = $7,
               finance_payment_id = $8,
               updated_at         = NOW()
             WHERE bill_id = $9`,
            [totalBillPaid, billBal, billStatus,
             payment_date || null, payment_mode || null,
             reference_number || null, bank_name || null,
             payment.id, bill.id]
          );

          await client.query(
            `UPDATE tqs_bills SET workflow_status = $1, updated_at = NOW() WHERE id = $2`,
            [billStatus === 'paid' ? 'paid' : 'accounts', bill.id]
          );

          await client.query(
            `INSERT INTO tqs_bill_history (bill_id, dept, action, changed_by)
             VALUES ($1, 'accounts', $2, $3)`,
            [bill.id,
             `${prevPaid > 0 ? 'Partial' : 'Finance'} payment +₹${paid} (total paid: ₹${totalBillPaid}, balance: ₹${billBal})${reference_number ? ' UTR:' + reference_number : ''}`,
             req.user.id]
          );
        }
      }

      return payment;
    });

    // Notify accounts team about the payment
    notifyPaymentRecorded(req.user.company_id, {
      ...result,
      vendor_name: entity_name,
    }, req.user.name);

    res.status(201).json({ data: result });
  } catch (err) {
    console.error('[payments] POST:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /payments/:id ──────────────────────────────────────────────────
router.delete('/:id', authorize('super_admin', 'admin'), async (req, res) => {
  try {
    await query(`DELETE FROM payments WHERE id = $1`, [req.params.id]);
    res.json({ message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /payments/tds-report ──────────────────────────────────────────────
router.get('/tds-report', async (req, res) => {
  const { year } = req.query;
  const r = await query(
    `SELECT entity_name, entity_pan,
       SUM(amount) AS gross_amount,
       SUM(tds_deducted) AS tds_deducted,
       SUM(net_amount) AS net_paid,
       COUNT(*) AS transaction_count,
       payment_mode,
       MIN(payment_date) AS first_payment,
       MAX(payment_date) AS last_payment
     FROM payments pay JOIN projects p ON pay.project_id = p.id
     WHERE p.company_id = $1 AND pay.tds_deducted > 0
       AND EXTRACT(YEAR FROM pay.payment_date) = $2
     GROUP BY entity_name, entity_pan, payment_mode
     ORDER BY tds_deducted DESC`,
    [req.user.company_id, year || new Date().getFullYear()]
  );
  const totals = await query(
    `SELECT SUM(tds_deducted) AS total_tds, SUM(amount) AS total_gross
     FROM payments pay JOIN projects p ON pay.project_id = p.id
     WHERE p.company_id = $1 AND EXTRACT(YEAR FROM pay.payment_date) = $2`,
    [req.user.company_id, year || new Date().getFullYear()]
  );
  res.json({ data: r.rows, totals: totals.rows[0] });
});

module.exports = router;
