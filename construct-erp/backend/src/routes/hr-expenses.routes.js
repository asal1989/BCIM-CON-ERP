// src/routes/hr-expenses.routes.js
// Expense claim submission, approval, payment
const express = require('express');
const router = express.Router();
const multer = require('multer');
const path   = require('path');
const fs     = require('fs');
const { authenticate, authorize } = require('../middleware/auth');
const { query } = require('../config/database');
const { runSchemaInit } = require('../utils/schemaInit');
const { notifyExpenseSubmitted, notifyExpenseApproved, notifyExpenseRejected, notifyExpensePaid } = require('../services/notif.helper');
const { postAutoJournalStandalone } = require('../services/journalAutoPost');
const { sendMail } = require('../services/mail.service');

router.use(authenticate);
router.use(authorize('super_admin', 'admin', 'hr', 'hr_admin', 'hr_manager', 'manager'));

const uploadDir = path.join(__dirname, '../../uploads/expense-bills');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename:    (req, file, cb) => cb(null, `${Date.now()}-${file.originalname.replace(/\s+/g, '_')}`),
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

const initTable = async () => {
  await query(`
    CREATE TABLE IF NOT EXISTS hr_expense_claims (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id UUID REFERENCES companies(id),
      user_id UUID REFERENCES users(id),
      claim_date DATE DEFAULT CURRENT_DATE,
      expense_type TEXT,
      project_id UUID REFERENCES projects(id),
      amount NUMERIC(12,2),
      description TEXT,
      bill_url TEXT,
      status TEXT DEFAULT 'pending',
      approved_by UUID REFERENCES users(id),
      approved_at TIMESTAMPTZ,
      paid_date DATE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
};
runSchemaInit('hr-expenses', initTable);

router.get('/', async (req, res) => {
  try {
    const { user_id, status, expense_type, from_date, to_date } = req.query;
    let sql = `
      SELECT e.*, u.name as employee_name, u.employee_code,
             p.name as project_name, ab.name as approved_by_name
      FROM hr_expense_claims e
      JOIN users u ON u.id = e.user_id
      LEFT JOIN projects p ON p.id = e.project_id
      LEFT JOIN users ab ON ab.id = e.approved_by
      WHERE e.company_id = $1`;
    const params = [req.user.company_id];
    let idx = 2;
    if (user_id)     { sql += ` AND e.user_id=$${idx}`;       params.push(user_id);     idx++; }
    if (status)      { sql += ` AND e.status=$${idx}`;         params.push(status);      idx++; }
    if (expense_type){ sql += ` AND e.expense_type=$${idx}`;   params.push(expense_type);idx++; }
    if (from_date)   { sql += ` AND e.claim_date>=$${idx}`;    params.push(from_date);   idx++; }
    if (to_date)     { sql += ` AND e.claim_date<=$${idx}`;    params.push(to_date);     idx++; }
    sql += ' ORDER BY e.created_at DESC';
    const { rows } = await query(sql, params);
    res.json({ data: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', upload.single('bill'), async (req, res) => {
  try {
    const { user_id, claim_date, expense_type, project_id, amount, description } = req.body;
    const uid = user_id || req.user.id;
    const billUrl = req.file ? `/uploads/expense-bills/${req.file.filename}` : req.body.bill_url || null;
    const { rows } = await query(
      `INSERT INTO hr_expense_claims (company_id, user_id, claim_date, expense_type, project_id, amount, description, bill_url)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [req.user.company_id, uid, claim_date || new Date().toISOString().split('T')[0],
       expense_type || null, project_id || null, amount, description || null, billUrl]
    );
    notifyExpenseSubmitted(req.user.company_id, rows[0], req.user.name);
    res.status(201).json({ data: rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch('/:id/approve', async (req, res) => {
  try {
    const { rows } = await query(
      `UPDATE hr_expense_claims SET status='approved', approved_by=$1, approved_at=NOW()
       WHERE id=$2 AND company_id=$3 AND status='pending' RETURNING *`,
      [req.user.id, req.params.id, req.user.company_id]
    );
    if (!rows.length) return res.status(400).json({ error: 'Not found or already actioned' });
    notifyExpenseApproved(req.user.company_id, rows[0], rows[0].user_id, req.user.name);
    res.json({ data: rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch('/:id/reject', async (req, res) => {
  try {
    const { rows } = await query(
      `UPDATE hr_expense_claims SET status='rejected', approved_by=$1, approved_at=NOW()
       WHERE id=$2 AND company_id=$3 AND status='pending' RETURNING *`,
      [req.user.id, req.params.id, req.user.company_id]
    );
    if (rows.length) notifyExpenseRejected(req.user.company_id, rows[0], rows[0].user_id, req.user.name, req.body.reason || '');
    res.json({ data: rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch('/:id/pay', async (req, res) => {
  try {
    const { paid_date } = req.body;
    const { rows } = await query(
      `UPDATE hr_expense_claims SET status='paid', paid_date=$1
       WHERE id=$2 AND company_id=$3 AND status='approved' RETURNING *`,
      [paid_date || new Date().toISOString().split('T')[0], req.params.id, req.user.company_id]
    );
    if (!rows.length) return res.status(400).json({ error: 'Not found or not approved' });
    const claim = rows[0];
    notifyExpensePaid(req.user.company_id, claim, claim.user_id);

    // Journal: Dr Office & Admin Expenses (6100) / Cr Bank (1010)
    const amt = parseFloat(claim.total_amount || claim.amount || 0);
    if (amt > 0) {
      postAutoJournalStandalone({
        companyId: req.user.company_id, userId: req.user.id,
        entryDate: paid_date || new Date().toISOString().slice(0, 10),
        projectId: claim.project_id || null,
        reference: `EXP-${claim.id.slice(0, 8)}`,
        narration: `Employee expense reimbursed — ${claim.description || claim.claim_type || 'claim'}`,
        source: 'auto_hr_expense',
        lines: [
          { code: '6100', debit:  amt, description: `Expense claim — ${claim.claim_type || ''}` },
          { code: '1010', credit: amt, description: `Bank payment — expense reimbursement` },
        ],
      }).catch(() => {});

      notifyAccountsDept(req.user.company_id, `Expense Paid ₹${Math.round(amt).toLocaleString('en-IN')}`,
        `Employee expense claim approved and paid. Amount: ₹${Math.round(amt).toLocaleString('en-IN')}.`,
        '/accounts/journal-entries').catch(() => {});
    }

    res.json({ data: claim });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

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

