// src/routes/hr-loans.routes.js
// Loan & Advance requests, EMI tracking, approval
const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const { query } = require('../config/database');
const { runSchemaInit } = require('../utils/schemaInit');
const { notifyLoanRequested, notifyLoanApproved, notifyLoanRejected } = require('../services/notif.helper');
const { postAutoJournalStandalone } = require('../services/journalAutoPost');
const { sendMail } = require('../services/mail.service');

router.use(authenticate);
router.use(authorize('super_admin', 'admin', 'hr', 'hr_admin', 'hr_manager'));

// ─── Auto-create table ────────────────────────────────────────────────────────
const initTable = async () => {
  await query(`
    CREATE TABLE IF NOT EXISTS hr_loans (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id UUID REFERENCES companies(id),
      user_id UUID REFERENCES users(id),
      loan_type TEXT DEFAULT 'advance',
      amount NUMERIC(12,2),
      reason TEXT,
      requested_date DATE DEFAULT CURRENT_DATE,
      status TEXT DEFAULT 'pending',
      approved_by UUID REFERENCES users(id),
      approved_at TIMESTAMPTZ,
      disbursed_date DATE,
      emi_amount NUMERIC(12,2),
      emi_months INT,
      balance_amount NUMERIC(12,2) DEFAULT 0,
      repaid_amount NUMERIC(12,2) DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
};
runSchemaInit('hr-loans', initTable);

router.get('/', async (req, res) => {
  try {
    const { user_id, status, loan_type } = req.query;
    let sql = `
      SELECT l.*, u.name as employee_name, u.employee_code, ab.name as approved_by_name
      FROM hr_loans l
      JOIN users u ON u.id = l.user_id
      LEFT JOIN users ab ON ab.id = l.approved_by
      WHERE l.company_id = $1`;
    const params = [req.user.company_id];
    let idx = 2;
    if (user_id)   { sql += ` AND l.user_id=$${idx}`;   params.push(user_id);   idx++; }
    if (status)    { sql += ` AND l.status=$${idx}`;     params.push(status);    idx++; }
    if (loan_type) { sql += ` AND l.loan_type=$${idx}`;  params.push(loan_type); idx++; }
    sql += ' ORDER BY l.created_at DESC';
    const { rows } = await query(sql, params);
    res.json({ data: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', async (req, res) => {
  try {
    const { user_id, loan_type, amount, reason, emi_amount, emi_months } = req.body;
    const uid = user_id || req.user.id;
    const { rows } = await query(
      `INSERT INTO hr_loans (company_id, user_id, loan_type, amount, reason, emi_amount, emi_months, balance_amount)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$4) RETURNING *`,
      [req.user.company_id, uid, loan_type || 'advance', amount, reason || null,
       emi_amount || null, emi_months || null]
    );
    notifyLoanRequested(req.user.company_id, rows[0], req.user.name);
    res.status(201).json({ data: rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch('/:id/approve', async (req, res) => {
  try {
    const { emi_amount, emi_months, disbursed_date } = req.body;
    const { rows } = await query(
      `UPDATE hr_loans SET status='approved', approved_by=$1, approved_at=NOW(),
         emi_amount=COALESCE($2, emi_amount), emi_months=COALESCE($3, emi_months),
         disbursed_date=$4
       WHERE id=$5 AND company_id=$6 AND status='pending' RETURNING *`,
      [req.user.id, emi_amount || null, emi_months || null, disbursed_date || null,
       req.params.id, req.user.company_id]
    );
    if (!rows.length) return res.status(400).json({ error: 'Not found or already actioned' });
    const loan = rows[0];
    notifyLoanApproved(req.user.company_id, loan, loan.user_id, req.user.name);

    // Journal: Dr Employee Loans & Advances (1250) / Cr Bank (1010)
    const amt = parseFloat(loan.amount || 0);
    if (amt > 0) {
      postAutoJournalStandalone({
        companyId: req.user.company_id, userId: req.user.id,
        entryDate: loan.disbursed_date || new Date().toISOString().slice(0, 10),
        reference: `LOAN-${loan.id.slice(0, 8)}`,
        narration: `Loan disbursed — ${loan.loan_type} (${loan.reason || 'advance'})`,
        source: 'auto_hr_loan',
        lines: [
          { code: '1250', debit:  amt, description: `Employee loan disbursed` },
          { code: '1010', credit: amt, description: `Bank payment — loan` },
        ],
      }).catch(() => {});

      // Notify accounts team
      notifyAccountsDept(req.user.company_id, `Loan Disbursed ₹${Math.round(amt).toLocaleString('en-IN')}`,
        `Employee loan approved and disbursed. Type: ${loan.loan_type}. EMI: ₹${emi_amount||0} × ${emi_months||0} months.`,
        '/accounts/journal-entries').catch(() => {});
    }

    res.json({ data: loan });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch('/:id/reject', async (req, res) => {
  try {
    const { rows } = await query(
      `UPDATE hr_loans SET status='rejected', approved_by=$1, approved_at=NOW()
       WHERE id=$2 AND company_id=$3 AND status='pending' RETURNING *`,
      [req.user.id, req.params.id, req.user.company_id]
    );
    if (rows.length) notifyLoanRejected(req.user.company_id, rows[0], rows[0].user_id, req.user.name);
    res.json({ data: rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Record EMI repayment
router.patch('/:id/repay', async (req, res) => {
  try {
    const { amount } = req.body;
    const { rows } = await query(
      `UPDATE hr_loans SET repaid_amount = repaid_amount + $1,
         balance_amount = balance_amount - $1,
         status = CASE WHEN balance_amount - $1 <= 0 THEN 'closed' ELSE status END
       WHERE id=$2 AND company_id=$3 RETURNING *`,
      [amount, req.params.id, req.user.company_id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });

    // Journal: Dr Bank (1010) / Cr Employee Loans & Advances (1250) — loan recovered
    const repaid = parseFloat(amount || 0);
    if (repaid > 0) {
      postAutoJournalStandalone({
        companyId: req.user.company_id, userId: req.user.id,
        entryDate: new Date().toISOString().slice(0, 10),
        reference: `LOAN-REP-${req.params.id.slice(0, 8)}`,
        narration: `EMI repayment — loan recovery`,
        source: 'auto_hr_loan',
        lines: [
          { code: '1010', debit:  repaid, description: `EMI received` },
          { code: '1250', credit: repaid, description: `Employee loan reduced` },
        ],
      }).catch(() => {});
    }

    res.json({ data: rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Accounts-team push notification helper ─────────────────────────────────────
async function notifyAccountsDept(companyId, subject, body, link = '/accounts') {
  try {
    const { rows } = await query(
      `SELECT email FROM users WHERE company_id=$1 AND role IN ('accountant','accounts','super_admin','admin') AND is_active=true AND email IS NOT NULL`,
      [companyId]
    );
    const emails = rows.map(r => r.email).filter(Boolean);
    if (!emails.length) return;
    await sendMail({
      to: emails,
      subject: `[Accounts] ${subject}`,
      html: `<p style="font-family:Arial,sans-serif;font-size:13px">${body}</p><p style="font-size:11px;color:#64748b">View in ERP: <a href="${link}">${link}</a></p>`,
      text: body,
    });
  } catch (_) {}
}

module.exports = router;

