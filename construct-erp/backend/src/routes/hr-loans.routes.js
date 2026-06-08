// src/routes/hr-loans.routes.js
// Loan & Advance requests, EMI tracking, approval
const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { query } = require('../config/database');
const { runSchemaInit } = require('../utils/schemaInit');
const { notifyLoanRequested, notifyLoanApproved, notifyLoanRejected } = require('../services/notif.helper');

router.use(authenticate);

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
    notifyLoanApproved(req.user.company_id, rows[0], rows[0].user_id, req.user.name);
    res.json({ data: rows[0] });
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
    res.json({ data: rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;

