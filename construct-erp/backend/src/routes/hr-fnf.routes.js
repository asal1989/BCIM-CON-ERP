// hr-fnf.routes.js — Full & Final Settlement
const express = require('express');
const router  = express.Router();
const { query } = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');
const { postAutoJournalStandalone } = require('../services/journalAutoPost');
const { sendMail } = require('../services/mail.service');

const HR_ROLES = ['super_admin','admin','hr_admin','hr_manager'];
const HR_ALL   = [...HR_ROLES, 'hr', 'manager'];

;(async () => {
  const safe = async sql => { try { await query(sql); } catch(_) {} };
  await safe(`CREATE TABLE IF NOT EXISTS hr_fnf_settlements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL,
    employee_id UUID NOT NULL REFERENCES users(id),
    last_working_day DATE NOT NULL,
    exit_reason VARCHAR(50) DEFAULT 'resignation'
      CHECK (exit_reason IN ('resignation','termination','retirement','absconding','end_of_contract','death')),
    notice_period_days INT DEFAULT 0,
    notice_served_days INT DEFAULT 0,
    notice_recovery_days INT DEFAULT 0,
    notice_recovery_amount NUMERIC(12,2) DEFAULT 0,
    days_payable INT DEFAULT 0,
    basic_for_days NUMERIC(12,2) DEFAULT 0,
    earned_leave_days NUMERIC(8,3) DEFAULT 0,
    earned_leave_amount NUMERIC(12,2) DEFAULT 0,
    gratuity_eligible BOOLEAN DEFAULT FALSE,
    gratuity_amount NUMERIC(12,2) DEFAULT 0,
    bonus_amount NUMERIC(12,2) DEFAULT 0,
    arrears NUMERIC(12,2) DEFAULT 0,
    pf_employee_deduction NUMERIC(12,2) DEFAULT 0,
    esi_employee_deduction NUMERIC(12,2) DEFAULT 0,
    pt_deduction NUMERIC(12,2) DEFAULT 0,
    tds_deduction NUMERIC(12,2) DEFAULT 0,
    loan_recovery NUMERIC(12,2) DEFAULT 0,
    advance_recovery NUMERIC(12,2) DEFAULT 0,
    other_deductions NUMERIC(12,2) DEFAULT 0,
    other_deduction_remarks TEXT,
    gross_earnings NUMERIC(12,2) GENERATED ALWAYS AS (
      basic_for_days + earned_leave_amount + gratuity_amount + bonus_amount + arrears
    ) STORED,
    total_deductions NUMERIC(12,2) GENERATED ALWAYS AS (
      notice_recovery_amount + pf_employee_deduction + esi_employee_deduction +
      pt_deduction + tds_deduction + loan_recovery + advance_recovery + other_deductions
    ) STORED,
    net_payable NUMERIC(12,2) DEFAULT 0,
    payment_date DATE,
    payment_mode VARCHAR(30),
    payment_reference VARCHAR(100),
    status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft','approved','paid','cancelled')),
    approved_by UUID REFERENCES users(id),
    approved_at TIMESTAMPTZ,
    remarks TEXT,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`);
})();

router.use(authenticate);

router.get('/', authorize(...HR_ALL), async (req, res) => {
  const { status, employee_id } = req.query;
  const conds = ['f.company_id=$1']; const params=[req.user.company_id]; let i=2;
  if (status)      { conds.push(`f.status=$${i++}`); params.push(status); }
  if (employee_id) { conds.push(`f.employee_id=$${i++}`); params.push(employee_id); }
  const { rows } = await query(
    `SELECT f.*, e.name AS full_name, e.employee_code AS emp_code, e.designation, e.department,
            ep.date_of_joining, u.name as approved_by_name
     FROM hr_fnf_settlements f
     JOIN users e ON e.id=f.employee_id
     LEFT JOIN employee_profiles ep ON ep.user_id=e.id
     LEFT JOIN users u ON u.id=f.approved_by
     WHERE ${conds.join(' AND ')} ORDER BY f.created_at DESC`,
    params
  );
  res.json({ data: rows });
});

router.get('/:id', authorize(...HR_ALL), async (req, res) => {
  const { rows } = await query(
    `SELECT f.*, e.name AS full_name, e.employee_code AS emp_code, e.designation, e.department,
            ep.date_of_joining, es.gross_monthly AS basic_salary, es.pf_applicable, es.esi_applicable
     FROM hr_fnf_settlements f
     JOIN users e ON e.id=f.employee_id
     LEFT JOIN employee_profiles ep ON ep.user_id=e.id
     LEFT JOIN hr_employee_salaries es ON es.user_id=e.id AND es.effective_to IS NULL
     WHERE f.id=$1 AND f.company_id=$2`,
    [req.params.id, req.user.company_id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Not found' });
  res.json({ data: rows[0] });
});

router.post('/', authorize(...HR_ROLES), async (req, res) => {
  const d = req.body;
  const net = (
    (parseFloat(d.basic_for_days)||0) +
    (parseFloat(d.earned_leave_amount)||0) +
    (parseFloat(d.gratuity_amount)||0) +
    (parseFloat(d.bonus_amount)||0) +
    (parseFloat(d.arrears)||0) -
    (parseFloat(d.notice_recovery_amount)||0) -
    (parseFloat(d.pf_employee_deduction)||0) -
    (parseFloat(d.esi_employee_deduction)||0) -
    (parseFloat(d.pt_deduction)||0) -
    (parseFloat(d.tds_deduction)||0) -
    (parseFloat(d.loan_recovery)||0) -
    (parseFloat(d.advance_recovery)||0) -
    (parseFloat(d.other_deductions)||0)
  );
  const { rows } = await query(
    `INSERT INTO hr_fnf_settlements(
       company_id,employee_id,last_working_day,exit_reason,
       notice_period_days,notice_served_days,notice_recovery_days,notice_recovery_amount,
       days_payable,basic_for_days,earned_leave_days,earned_leave_amount,
       gratuity_eligible,gratuity_amount,bonus_amount,arrears,
       pf_employee_deduction,esi_employee_deduction,pt_deduction,tds_deduction,
       loan_recovery,advance_recovery,other_deductions,other_deduction_remarks,
       net_payable,remarks,created_by
     ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27)
     RETURNING *`,
    [req.user.company_id, d.employee_id, d.last_working_day, d.exit_reason||'resignation',
     d.notice_period_days||0, d.notice_served_days||0, d.notice_recovery_days||0, d.notice_recovery_amount||0,
     d.days_payable||0, d.basic_for_days||0, d.earned_leave_days||0, d.earned_leave_amount||0,
     d.gratuity_eligible||false, d.gratuity_amount||0, d.bonus_amount||0, d.arrears||0,
     d.pf_employee_deduction||0, d.esi_employee_deduction||0, d.pt_deduction||0, d.tds_deduction||0,
     d.loan_recovery||0, d.advance_recovery||0, d.other_deductions||0, d.other_deduction_remarks||null,
     net, d.remarks||null, req.user.id]
  );
  res.json({ data: rows[0] });
});

router.put('/:id', authorize(...HR_ROLES), async (req, res) => {
  const d = req.body;
  const net = (
    (parseFloat(d.basic_for_days)||0) +
    (parseFloat(d.earned_leave_amount)||0) +
    (parseFloat(d.gratuity_amount)||0) +
    (parseFloat(d.bonus_amount)||0) +
    (parseFloat(d.arrears)||0) -
    (parseFloat(d.notice_recovery_amount)||0) -
    (parseFloat(d.pf_employee_deduction)||0) -
    (parseFloat(d.esi_employee_deduction)||0) -
    (parseFloat(d.pt_deduction)||0) -
    (parseFloat(d.tds_deduction)||0) -
    (parseFloat(d.loan_recovery)||0) -
    (parseFloat(d.advance_recovery)||0) -
    (parseFloat(d.other_deductions)||0)
  );
  const { rows } = await query(
    `UPDATE hr_fnf_settlements SET
       last_working_day=$1, exit_reason=$2,
       notice_period_days=$3, notice_served_days=$4, notice_recovery_days=$5, notice_recovery_amount=$6,
       days_payable=$7, basic_for_days=$8, earned_leave_days=$9, earned_leave_amount=$10,
       gratuity_eligible=$11, gratuity_amount=$12, bonus_amount=$13, arrears=$14,
       pf_employee_deduction=$15, esi_employee_deduction=$16, pt_deduction=$17, tds_deduction=$18,
       loan_recovery=$19, advance_recovery=$20, other_deductions=$21, other_deduction_remarks=$22,
       net_payable=$23, remarks=$24, updated_at=NOW()
     WHERE id=$25 AND company_id=$26 AND status='draft' RETURNING *`,
    [d.last_working_day, d.exit_reason||'resignation',
     d.notice_period_days||0, d.notice_served_days||0, d.notice_recovery_days||0, d.notice_recovery_amount||0,
     d.days_payable||0, d.basic_for_days||0, d.earned_leave_days||0, d.earned_leave_amount||0,
     d.gratuity_eligible||false, d.gratuity_amount||0, d.bonus_amount||0, d.arrears||0,
     d.pf_employee_deduction||0, d.esi_employee_deduction||0, d.pt_deduction||0, d.tds_deduction||0,
     d.loan_recovery||0, d.advance_recovery||0, d.other_deductions||0, d.other_deduction_remarks||null,
     net, d.remarks||null, req.params.id, req.user.company_id]
  );
  res.json({ data: rows[0] });
});

router.patch('/:id/approve', authorize(...HR_ROLES), async (req, res) => {
  const { rows } = await query(
    `UPDATE hr_fnf_settlements SET status='approved',approved_by=$1,approved_at=NOW()
     WHERE id=$2 AND company_id=$3 AND status='draft' RETURNING *`,
    [req.user.id, req.params.id, req.user.company_id]
  );
  res.json({ data: rows[0] });
});

router.patch('/:id/pay', authorize(...HR_ROLES), async (req, res) => {
  const { payment_date, payment_mode, payment_reference } = req.body;
  const { rows } = await query(
    `UPDATE hr_fnf_settlements SET status='paid',payment_date=$1,payment_mode=$2,payment_reference=$3
     WHERE id=$4 AND company_id=$5 AND status='approved' RETURNING *`,
    [payment_date, payment_mode, payment_reference, req.params.id, req.user.company_id]
  );
  if (!rows.length) return res.status(400).json({ error: 'Not found or not in approved status' });
  const fnf = rows[0];

  // Journal: Dr Salaries & Wages (6000) / Cr Bank (1010) — net amount paid
  const net = parseFloat(fnf.net_payable || 0);
  if (net > 0) {
    const lines = [
      { code: '6000', debit: net, description: `FnF settlement — ${fnf.exit_reason}` },
      { code: '1010', credit: net, description: `Bank payment — FnF` },
    ];
    // Extra gratuity expense line if applicable
    const gratuity = parseFloat(fnf.gratuity_amount || 0);
    if (gratuity > 0 && fnf.gratuity_eligible) {
      lines[0].debit = net - gratuity; // Salaries portion
      lines.splice(1, 0, { code: '6000', debit: gratuity, description: 'Gratuity expense' });
    }
    postAutoJournalStandalone({
      companyId: req.user.company_id, userId: req.user.id,
      entryDate: payment_date || new Date().toISOString().slice(0, 10),
      reference: `FNF-${fnf.id.slice(0, 8)}`,
      narration: `Full & Final settlement payment — ${fnf.exit_reason}`,
      source: 'auto_hr_fnf',
      lines,
    }).catch(() => {});

    notifyAccountsDept(req.user.company_id,
      `FnF Settlement Paid ₹${Math.round(net).toLocaleString('en-IN')}`,
      `Full & Final settlement paid. Exit reason: ${fnf.exit_reason}. Net payable: ₹${Math.round(net).toLocaleString('en-IN')}.`,
      '/accounts/journal-entries').catch(() => {});
  }

  res.json({ data: fnf });
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

// Gratuity calculator helper
router.get('/calculate-gratuity', authorize(...HR_ALL), async (req, res) => {
  const { employee_id, last_working_day } = req.query;
  const { rows } = await query(
    `SELECT ep.date_of_joining,
            (SELECT gross_monthly FROM hr_employee_salaries WHERE user_id=ep.user_id AND effective_to IS NULL ORDER BY effective_from DESC LIMIT 1) AS basic_salary
     FROM employee_profiles ep WHERE ep.user_id=$1 AND ep.company_id=$2`,
    [employee_id, req.user.company_id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Employee not found' });
  const { date_of_joining, basic_salary } = rows[0];
  const doj = new Date(date_of_joining);
  const lwd = new Date(last_working_day);
  const yearsOfService = (lwd - doj) / (365.25 * 24 * 3600 * 1000);
  const gratuity = yearsOfService >= 5
    ? Math.round((parseFloat(basic_salary) / 26) * 15 * Math.floor(yearsOfService))
    : 0;
  res.json({ data: { years_of_service: parseFloat(yearsOfService.toFixed(2)), gratuity_amount: gratuity, eligible: yearsOfService >= 5 } });
});

module.exports = router;
