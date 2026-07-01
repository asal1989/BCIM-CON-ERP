// src/routes/hr-payroll.routes.js
// Monthly payroll: generate draft, review, approve, pay → Finance linkage
const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const { query, withTransaction } = require('../config/database');
const { runSchemaInit } = require('../utils/schemaInit');
const { postAutoJournalStandalone } = require('../services/journalAutoPost');

// Public verification endpoint (no auth — QR scan)
router.get('/public/verify/:id', async (req, res) => {
  try {
    const result = await query(
      `SELECT mp.id, mp.month, mp.year, mp.employee_code, mp.basic, mp.hra,
              mp.gross_earnings, mp.total_deductions, mp.net_pay, mp.status,
              e.name AS employee_name, d.name AS department_name, des.name AS designation_name,
              c.name AS company_name
       FROM hr_monthly_payroll mp
       LEFT JOIN hr_employees e ON mp.employee_id = e.id
       LEFT JOIN hr_departments d ON e.department_id = d.id
       LEFT JOIN hr_designations des ON e.designation_id = des.id
       LEFT JOIN companies c ON mp.company_id = c.id
       WHERE mp.id = $1`, [req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Payslip not found' });
    res.json({ data: result.rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.use(authenticate);
router.use(authorize('super_admin', 'admin', 'hr_admin', 'hr_manager'));

// ─── Auto-create table ────────────────────────────────────────────────────────
const initTable = async () => {
  await query(`
    CREATE TABLE IF NOT EXISTS hr_monthly_payroll (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id UUID REFERENCES companies(id),
      user_id UUID REFERENCES users(id),
      month INT NOT NULL,
      year INT NOT NULL,
      working_days INT,
      paid_days NUMERIC(5,1),
      lop_days NUMERIC(5,1) DEFAULT 0,
      basic NUMERIC(12,2) DEFAULT 0,
      hra NUMERIC(12,2) DEFAULT 0,
      conveyance NUMERIC(12,2) DEFAULT 0,
      medical NUMERIC(12,2) DEFAULT 0,
      special_allowance NUMERIC(12,2) DEFAULT 0,
      other_earnings NUMERIC(12,2) DEFAULT 0,
      gross_earnings NUMERIC(12,2) DEFAULT 0,
      pf_employee NUMERIC(12,2) DEFAULT 0,
      pf_employer NUMERIC(12,2) DEFAULT 0,
      esi_employee NUMERIC(12,2) DEFAULT 0,
      esi_employer NUMERIC(12,2) DEFAULT 0,
      pt NUMERIC(12,2) DEFAULT 0,
      tds NUMERIC(12,2) DEFAULT 0,
      loan_deduction NUMERIC(12,2) DEFAULT 0,
      advance_deduction NUMERIC(12,2) DEFAULT 0,
      other_deductions NUMERIC(12,2) DEFAULT 0,
      total_deductions NUMERIC(12,2) DEFAULT 0,
      net_pay NUMERIC(12,2) DEFAULT 0,
      status TEXT DEFAULT 'draft',
      submitted_for_review_at TIMESTAMPTZ,
      reviewed_by UUID REFERENCES users(id),
      reviewed_at TIMESTAMPTZ,
      review_remarks TEXT,
      payment_date DATE,
      payment_mode TEXT,
      payment_ref TEXT,
      payslip_generated BOOLEAN DEFAULT FALSE,
      remarks TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(user_id, month, year)
    )
  `);
  await query(`
    CREATE INDEX IF NOT EXISTS idx_hr_payroll_company_month_year
    ON hr_monthly_payroll(company_id, month, year)
  `);
  // Migration: add review columns if they don't exist yet
  for (const col of [
    'submitted_for_review_at TIMESTAMPTZ',
    'reviewed_by UUID',
    'reviewed_at TIMESTAMPTZ',
    'review_remarks TEXT',
  ]) {
    const colName = col.split(' ')[0];
    await query(`ALTER TABLE hr_monthly_payroll ADD COLUMN IF NOT EXISTS ${col}`).catch(() => {});
  }
};
runSchemaInit('hr-payroll', initTable);

// ─── Statutory calc helpers ──────────────────────────────────────────────────
const PF_CEILING  = 15000;
const ESI_CEILING = 21000;
const PF_RATE_EMP = 0.12;
const PF_RATE_ER  = 0.12;
const ESI_RATE_EMP = 0.0075;
const ESI_RATE_ER  = 0.0325;

function calcPF(basic, applicable) {
  if (!applicable) return { emp: 0, er: 0 };
  const pfWage = Math.min(parseFloat(basic), PF_CEILING);
  return { emp: Math.round(pfWage * PF_RATE_EMP), er: Math.round(pfWage * PF_RATE_ER) };
}

function calcESI(gross, applicable) {
  if (!applicable || parseFloat(gross) > ESI_CEILING) return { emp: 0, er: 0 };
  return {
    emp: Math.round(parseFloat(gross) * ESI_RATE_EMP),
    er:  Math.round(parseFloat(gross) * ESI_RATE_ER),
  };
}

// Professional Tax — Maharashtra slab (configurable per state)
function calcPT(gross, month, applicable) {
  if (!applicable) return 0;
  const g = parseFloat(gross);
  if (g <= 7500) return 0;
  // Feb = 300, rest = 200 (Maharashtra default)
  if (g <= 10000) return month === 2 ? 300 : 175;
  return month === 2 ? 300 : 200;
}

// Working days in a month (Mon–Sat)
function workingDaysInMonth(month, year) {
  const days = new Date(year, month, 0).getDate(); // total days
  let count = 0;
  for (let d = 1; d <= days; d++) {
    const wd = new Date(year, month - 1, d).getDay();
    if (wd !== 0) count++; // exclude Sundays
  }
  return count;
}

// ═══════════════════════════════════════════════════════════
// LIST
// ═══════════════════════════════════════════════════════════
router.get('/', async (req, res) => {
  try {
    const { month, year, status, user_id } = req.query;
    const m = parseInt(month) || new Date().getMonth() + 1;
    const y = parseInt(year)  || new Date().getFullYear();

    let sql = `
      SELECT p.*, u.name as employee_name, u.employee_code,
             dep.name as department_name, des.name as designation_name
      FROM hr_monthly_payroll p
      JOIN users u ON u.id = p.user_id
      LEFT JOIN employee_profiles ep ON ep.user_id = u.id
      LEFT JOIN hr_departments dep ON dep.id = ep.department_id
      LEFT JOIN hr_designations des ON des.id = ep.designation_id
      WHERE p.company_id = $1 AND p.month = $2 AND p.year = $3`;
    const params = [req.user.company_id, m, y];
    let idx = 4;

    if (status)  { sql += ` AND p.status=$${idx}`;  params.push(status);  idx++; }
    if (user_id) { sql += ` AND p.user_id=$${idx}`; params.push(user_id); idx++; }

    sql += ' ORDER BY u.name';
    const { rows } = await query(sql, params);

    // Summary totals
    const totals = rows.reduce((acc, r) => ({
      gross_earnings:   acc.gross_earnings   + parseFloat(r.gross_earnings || 0),
      total_deductions: acc.total_deductions + parseFloat(r.total_deductions || 0),
      net_pay:          acc.net_pay          + parseFloat(r.net_pay || 0),
      pf_employee:      acc.pf_employee      + parseFloat(r.pf_employee || 0),
      pf_employer:      acc.pf_employer      + parseFloat(r.pf_employer || 0),
      esi_employee:     acc.esi_employee     + parseFloat(r.esi_employee || 0),
      esi_employer:     acc.esi_employer     + parseFloat(r.esi_employer || 0),
      tds:              acc.tds              + parseFloat(r.tds || 0),
    }), {
      gross_earnings: 0,
      total_deductions: 0,
      net_pay: 0,
      pf_employee: 0,
      pf_employer: 0,
      esi_employee: 0,
      esi_employer: 0,
      tds: 0,
    });

    res.json({ data: rows, totals });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════
// GET SINGLE (payslip data)
// ═══════════════════════════════════════════════════════════
router.get('/:id', async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT p.*, u.name as employee_name, u.employee_code, u.email,
              ep.pan_number, ep.uan_number, ep.bank_name, ep.bank_account_number, ep.bank_ifsc,
              ep.date_of_joining, dep.name as department_name, des.name as designation_name
       FROM hr_monthly_payroll p
       JOIN users u ON u.id = p.user_id
       LEFT JOIN employee_profiles ep ON ep.user_id = u.id
       LEFT JOIN hr_departments dep ON dep.id = ep.department_id
       LEFT JOIN hr_designations des ON des.id = ep.designation_id
       WHERE p.id = $1 AND p.company_id = $2`,
      [req.params.id, req.user.company_id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Payroll record not found' });
    res.json({ data: rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════
// GENERATE PAYROLL (POST /run)
// ═══════════════════════════════════════════════════════════
router.post('/run', async (req, res) => {
  try {
    const { month, year, user_id } = req.body;
    const m = parseInt(month);
    const y = parseInt(year);
    const workDays = workingDaysInMonth(m, y);

    // Get active employee(s) with salary — optionally scoped to one employee
    let employeeSql = `
      SELECT u.id as user_id,
              u.name as employee_name,
              es.basic, es.hra, es.conveyance, es.medical,
              es.special_allowance, es.other_allowance, es.gross_monthly,
              es.pf_applicable, es.esi_applicable, es.pt_applicable
       FROM users u
       JOIN hr_employee_salaries es ON es.user_id = u.id
         AND es.effective_from <= make_date($3,$1,1)
         AND (es.effective_to IS NULL OR es.effective_to >= make_date($3,$1,1))
       WHERE u.company_id = $2 AND u.is_active = TRUE`;
    const employeeParams = [m, req.user.company_id, y];
    if (user_id) {
      employeeSql += ` AND u.id = $4`;
      employeeParams.push(user_id);
    }
    const employees = await query(employeeSql, employeeParams);

    if (!employees.rows.length) {
      return res.status(400).json({
        error: user_id
          ? 'No active salary record found for this employee in the selected month.'
          : 'No active employee salaries configured. Assign employee salaries before payroll generation.',
      });
    }

    const attendanceMissing = [];
    for (const emp of employees.rows) {
      const attCheck = await query(
        `SELECT COUNT(*)::int AS total_marked
         FROM hr_attendance
         WHERE user_id = $1
           AND EXTRACT(MONTH FROM attendance_date) = $2
           AND EXTRACT(YEAR FROM attendance_date) = $3`,
        [emp.user_id, m, y]
      );
      if (!attCheck.rows[0].total_marked) attendanceMissing.push(emp.employee_name);
    }

    if (attendanceMissing.length) {
      return res.status(400).json({
        error: `Attendance not marked for ${attendanceMissing.length} employee(s). Mark monthly attendance baseline first.`,
        missing_employees: attendanceMissing.slice(0, 20),
      });
    }

    const generated = [];
    for (const emp of employees.rows) {
      // Count attendance for the month
      const att = await query(
        `SELECT
           COUNT(*) FILTER (WHERE status='present')  as present,
           COUNT(*) FILTER (WHERE status='half_day') as half_day,
           COUNT(*) FILTER (WHERE status='absent')   as absent,
           COUNT(*) FILTER (WHERE status='leave')    as on_leave
         FROM hr_attendance
         WHERE user_id=$1
           AND EXTRACT(MONTH FROM attendance_date)=$2
           AND EXTRACT(YEAR  FROM attendance_date)=$3`,
        [emp.user_id, m, y]
      );
      const a = att.rows[0];
      const paidDays = parseFloat(a.present || 0) + parseFloat(a.half_day || 0) * 0.5 + parseFloat(a.on_leave || 0);
      const lopDays  = workDays - paidDays;

      // Pro-rate salary if LOP
      const lopFactor = workDays > 0 ? paidDays / workDays : 1;
      const basic = Math.round(parseFloat(emp.basic || 0) * lopFactor);
      const hra   = Math.round(parseFloat(emp.hra   || 0) * lopFactor);
      const conv  = Math.round(parseFloat(emp.conveyance || 0) * lopFactor);
      const med   = Math.round(parseFloat(emp.medical || 0) * lopFactor);
      const spec  = Math.round(parseFloat(emp.special_allowance || 0) * lopFactor);
      const other = Math.round(parseFloat(emp.other_allowance || 0) * lopFactor);
      const gross = basic + hra + conv + med + spec + other;

      // Statutory deductions
      const pf  = calcPF(basic, emp.pf_applicable);
      const esi = calcESI(gross, emp.esi_applicable);
      const pt  = calcPT(gross, m, emp.pt_applicable);

      // Loan deduction (active loans)
      const loanQ = await query(
        `SELECT COALESCE(SUM(emi_amount),0) as total_emi
         FROM hr_loans WHERE user_id=$1 AND status='approved' AND balance_amount>0`,
        [emp.user_id]
      );
      const loanDed = parseFloat(loanQ.rows[0].total_emi || 0);

      const totalDed = pf.emp + esi.emp + pt + loanDed;
      const netPay   = gross - totalDed;

      // Upsert payroll record (skip if already approved/paid)
      const existing = await query(
        `SELECT id, status FROM hr_monthly_payroll WHERE user_id=$1 AND month=$2 AND year=$3`,
        [emp.user_id, m, y]
      );
      if (existing.rows.length && ['approved','paid'].includes(existing.rows[0].status)) {
        generated.push({ user_id: emp.user_id, skipped: true, status: existing.rows[0].status });
        continue;
      }

      const { rows } = await query(
        `INSERT INTO hr_monthly_payroll
         (company_id, user_id, month, year, working_days, paid_days, lop_days,
          basic, hra, conveyance, medical, special_allowance, gross_earnings,
          pf_employee, pf_employer, esi_employee, esi_employer, pt, loan_deduction,
          total_deductions, net_pay)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
         ON CONFLICT (user_id, month, year) DO UPDATE SET
           working_days=$5, paid_days=$6, lop_days=$7,
           basic=$8, hra=$9, conveyance=$10, medical=$11, special_allowance=$12, gross_earnings=$13,
           pf_employee=$14, pf_employer=$15, esi_employee=$16, esi_employer=$17, pt=$18,
           loan_deduction=$19, total_deductions=$20, net_pay=$21, status='draft'
         RETURNING *`,
        [req.user.company_id, emp.user_id, m, y, workDays, paidDays, Math.max(0, lopDays),
         basic, hra, conv, med, spec, gross,
         pf.emp, pf.er, esi.emp, esi.er, pt, loanDed,
         totalDed, netPay]
      );
      generated.push(rows[0]);
    }

    res.status(201).json({ data: generated, count: generated.length, month: m, year: y });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════
// UPDATE (edit TDS / other deductions before approval)
// ═══════════════════════════════════════════════════════════
router.put('/:id', async (req, res) => {
  try {
    const { tds, other_deductions, loan_deduction, advance_deduction, remarks } = req.body;
    const existing = await query(`SELECT * FROM hr_monthly_payroll WHERE id=$1`, [req.params.id]);
    const p = existing.rows[0];
    if (!p) return res.status(404).json({ error: 'Not found' });
    if (p.status !== 'draft') return res.status(400).json({ error: 'Can only edit draft payroll' });

    const totalDed = parseFloat(p.pf_employee) + parseFloat(p.esi_employee) + parseFloat(p.pt) +
                     parseFloat(loan_deduction ?? p.loan_deduction) + parseFloat(advance_deduction ?? p.advance_deduction) +
                     parseFloat(tds ?? p.tds) + parseFloat(other_deductions ?? p.other_deductions);
    const netPay = parseFloat(p.gross_earnings) - totalDed;

    const { rows } = await query(
      `UPDATE hr_monthly_payroll
       SET tds=$1, other_deductions=$2, loan_deduction=$3, advance_deduction=$4,
           total_deductions=$5, net_pay=$6, remarks=$7
       WHERE id=$8 AND company_id=$9 RETURNING *`,
      [tds ?? p.tds, other_deductions ?? p.other_deductions, loan_deduction ?? p.loan_deduction,
       advance_deduction ?? p.advance_deduction, totalDed, netPay, remarks ?? p.remarks,
       req.params.id, req.user.company_id]
    );
    res.json({ data: rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════
// DELETE — remove a single draft payroll record
// ═══════════════════════════════════════════════════════════
router.delete('/:id', async (req, res) => {
  try {
    const { rows } = await query(
      `DELETE FROM hr_monthly_payroll WHERE id=$1 AND company_id=$2 AND status='draft' RETURNING id, status`,
      [req.params.id, req.user.company_id]
    );
    if (!rows.length) return res.status(400).json({ error: 'Only draft payroll records can be deleted' });
    res.json({ deleted: true, id: rows[0].id });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════
// SUBMIT FOR REVIEW (hr_admin → pending_approval)
// ═══════════════════════════════════════════════════════════
router.patch('/:id/submit', async (req, res) => {
  try {
    const { rows } = await query(
      `UPDATE hr_monthly_payroll
         SET status='pending_approval', submitted_for_review_at=NOW()
       WHERE id=$1 AND company_id=$2 AND status='draft' RETURNING *`,
      [req.params.id, req.user.company_id]
    );
    if (!rows.length) return res.status(400).json({ error: 'Only draft payroll can be submitted for review' });
    res.json({ data: rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// BULK SUBMIT FOR REVIEW (all drafts for month/year)
router.post('/bulk-submit', async (req, res) => {
  try {
    const { month, year } = req.body;
    const { rows } = await query(
      `UPDATE hr_monthly_payroll
         SET status='pending_approval', submitted_for_review_at=NOW()
       WHERE company_id=$1 AND month=$2 AND year=$3 AND status='draft'
       RETURNING id`,
      [req.user.company_id, parseInt(month), parseInt(year)]
    );
    res.json({ submitted: rows.length });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════
// APPROVE single (manager only — pending_approval → approved)
// ═══════════════════════════════════════════════════════════
router.patch('/:id/approve', async (req, res) => {
  try {
    const { review_remarks } = req.body;
    const { rows } = await query(
      `UPDATE hr_monthly_payroll
         SET status='approved', reviewed_by=$1, reviewed_at=NOW(), review_remarks=$2
       WHERE id=$3 AND company_id=$4 AND status='pending_approval' RETURNING *`,
      [req.user.id, review_remarks || null, req.params.id, req.user.company_id]
    );
    if (!rows.length) return res.status(400).json({ error: 'Payroll must be in pending_approval status to approve' });
    res.json({ data: rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// BULK APPROVE (all pending_approval for month/year)
router.post('/bulk-approve', async (req, res) => {
  try {
    const { month, year, review_remarks } = req.body;
    const { rows } = await query(
      `UPDATE hr_monthly_payroll
         SET status='approved', reviewed_by=$1, reviewed_at=NOW(), review_remarks=$2
       WHERE company_id=$3 AND month=$4 AND year=$5 AND status='pending_approval'
       RETURNING id`,
      [req.user.id, review_remarks || null, req.user.company_id, parseInt(month), parseInt(year)]
    );
    res.json({ approved: rows.length });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// REJECT — send back to draft with remarks
router.patch('/:id/reject', async (req, res) => {
  try {
    const { review_remarks } = req.body;
    const { rows } = await query(
      `UPDATE hr_monthly_payroll
         SET status='draft', reviewed_by=$1, reviewed_at=NOW(), review_remarks=$2
       WHERE id=$3 AND company_id=$4 AND status='pending_approval' RETURNING *`,
      [req.user.id, review_remarks || null, req.params.id, req.user.company_id]
    );
    if (!rows.length) return res.status(400).json({ error: 'Payroll must be pending_approval to reject' });
    res.json({ data: rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════
// BULK PAY — mark month as paid + create Finance payment records
// ═══════════════════════════════════════════════════════════
router.post('/bulk-pay', async (req, res) => {
  try {
    const { month, year, payment_date, payment_mode, payment_ref } = req.body;
    const m = parseInt(month);
    const y = parseInt(year);

    // Get all approved payroll records for this month
    const approved = await query(
      `SELECT p.*, u.name as employee_name
       FROM hr_monthly_payroll p JOIN users u ON u.id = p.user_id
       WHERE p.company_id=$1 AND p.month=$2 AND p.year=$3 AND p.status='approved'`,
      [req.user.company_id, m, y]
    );

    if (!approved.rows.length) {
      return res.status(400).json({ error: 'No approved payroll records for this month' });
    }

    const results = [];
    const totals = {
      gross: 0, netPay: 0, tds: 0,
      pfEmp: 0, pfEr: 0, esiEmp: 0, esiEr: 0, pt: 0,
      loanAdv: 0,
    };

    for (const p of approved.rows) {
      // Mark payroll as paid
      await query(
        `UPDATE hr_monthly_payroll SET status='paid', payment_date=$1, payment_mode=$2, payment_ref=$3
         WHERE id=$4`,
        [payment_date, payment_mode || 'bank_transfer', payment_ref || null, p.id]
      );

      // Accumulate totals for consolidated JV
      totals.gross   += parseFloat(p.gross_earnings  || 0);
      totals.netPay  += parseFloat(p.net_pay         || 0);
      totals.tds     += parseFloat(p.tds             || 0);
      totals.pfEmp   += parseFloat(p.pf_employee     || 0);
      totals.pfEr    += parseFloat(p.pf_employer     || 0);
      totals.esiEmp  += parseFloat(p.esi_employee    || 0);
      totals.esiEr   += parseFloat(p.esi_employer    || 0);
      totals.pt      += parseFloat(p.pt              || 0);
      totals.loanAdv += parseFloat(p.loan_deduction  || 0)
                      + parseFloat(p.advance_deduction || 0)
                      + parseFloat(p.other_deductions  || 0);

      // Auto-create Finance payment record
      try {
        await query(
          `INSERT INTO payments (company_id, project_id, entity_name, amount, tds_deducted, net_amount,
             payment_date, payment_mode, source, remarks)
           VALUES ($1, NULL, $2, $3, $4, $5, $6, $7, 'hr_payroll', $8)`,
          [req.user.company_id, p.employee_name,
           p.gross_earnings, p.tds, p.net_pay,
           payment_date, payment_mode || 'bank_transfer',
           `Salary ${new Date(y, m-1).toLocaleString('default',{month:'long'})} ${y}`]
        );
      } catch (e) {
        console.warn('Finance payment insert skipped:', e.message);
      }
      results.push({ id: p.id, employee_name: p.employee_name, net_pay: p.net_pay });
    }

    // ── Consolidated monthly salary JV ────────────────────────────────────────
    if (totals.gross > 0) {
      const monthLabel = new Date(y, m - 1).toLocaleString('default', { month: 'long' }) + ' ' + y;
      const reference  = `SALARY-${y}-${String(m).padStart(2, '0')}`;
      const lines = [
        { code: '6000', debit: Math.round(totals.gross * 100) / 100, description: `Salaries ${monthLabel}` },
      ];
      if (totals.pfEr   > 0) lines.push({ code: '6010', debit: Math.round(totals.pfEr  * 100) / 100, description: 'EPF Employer Contribution' });
      if (totals.esiEr  > 0) lines.push({ code: '6020', debit: Math.round(totals.esiEr * 100) / 100, description: 'ESI Employer Contribution' });
      if (totals.netPay > 0) lines.push({ code: '2400', credit: Math.round(totals.netPay * 100) / 100, description: 'Net Salary Payable' });
      if (totals.tds    > 0) lines.push({ code: '2200', credit: Math.round(totals.tds   * 100) / 100, description: 'TDS on Salary (192B)' });
      const totalPf = totals.pfEmp + totals.pfEr;
      if (totalPf       > 0) lines.push({ code: '2410', credit: Math.round(totalPf      * 100) / 100, description: 'EPF Payable' });
      const totalEsi = totals.esiEmp + totals.esiEr;
      if (totalEsi      > 0) lines.push({ code: '2420', credit: Math.round(totalEsi     * 100) / 100, description: 'ESI Payable' });
      if (totals.pt     > 0) lines.push({ code: '2430', credit: Math.round(totals.pt    * 100) / 100, description: 'Professional Tax Payable' });
      if (totals.loanAdv > 0) lines.push({ code: '2440', credit: Math.round(totals.loanAdv * 100) / 100, description: 'Loan / Advance Recovery' });

      postAutoJournalStandalone({
        companyId: req.user.company_id,
        userId:    req.user.id,
        entryDate: payment_date || new Date().toISOString().slice(0, 10),
        reference,
        narration: `Salary payroll — ${monthLabel} (${results.length} employees)`,
        source:    'auto_hr_salary',
        lines,
      }).catch(() => {});
    }

    res.json({ data: results, count: results.length });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════
// PAYSLIP HTML (for print page)
// ═══════════════════════════════════════════════════════════
router.get('/:id/payslip', async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT p.*, u.name as employee_name, u.employee_code, u.email,
              ep.pan_number, ep.uan_number, ep.bank_name, ep.bank_account_number, ep.bank_ifsc,
              ep.date_of_joining, dep.name as department_name, des.name as designation_name,
              c.name as company_name
       FROM hr_monthly_payroll p
       JOIN users u ON u.id = p.user_id
       LEFT JOIN employee_profiles ep ON ep.user_id = u.id
       LEFT JOIN hr_departments dep ON dep.id = ep.department_id
       LEFT JOIN hr_designations des ON des.id = ep.designation_id
       LEFT JOIN companies c ON c.id = p.company_id
       WHERE p.id = $1 AND p.company_id = $2`,
      [req.params.id, req.user.company_id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Payroll not found' });
    res.json({ data: rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════
// STATUTORY REPORTS
// ═══════════════════════════════════════════════════════════

// PF ECR (EPFO format)
router.get('/reports/pf-ecr', async (req, res) => {
  try {
    const { month, year } = req.query;
    const { rows } = await query(
      `SELECT u.name, ep.uan_number, ep.pf_account_number,
              p.basic, p.pf_employee, p.pf_employer,
              (p.pf_employee + p.pf_employer) as total_pf
       FROM hr_monthly_payroll p
       JOIN users u ON u.id = p.user_id
       LEFT JOIN employee_profiles ep ON ep.user_id = u.id
       WHERE p.company_id=$1 AND p.month=$2 AND p.year=$3 AND p.status IN ('approved','paid')
       ORDER BY u.name`,
      [req.user.company_id, month, year]
    );
    res.json({ data: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ESI Return
router.get('/reports/esi-return', async (req, res) => {
  try {
    const { month, year } = req.query;
    const { rows } = await query(
      `SELECT u.name, ep.esi_number,
              p.gross_earnings, p.esi_employee, p.esi_employer,
              (p.esi_employee + p.esi_employer) as total_esi
       FROM hr_monthly_payroll p
       JOIN users u ON u.id = p.user_id
       LEFT JOIN employee_profiles ep ON ep.user_id = u.id
       WHERE p.company_id=$1 AND p.month=$2 AND p.year=$3
         AND p.esi_employee > 0 AND p.status IN ('approved','paid')
       ORDER BY u.name`,
      [req.user.company_id, month, year]
    );
    res.json({ data: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Form 16 / TDS Summary
router.get('/reports/form16', async (req, res) => {
  try {
    const { year, user_id } = req.query;
    const fy_start = `${parseInt(year)-1}-04-01`;
    const fy_end   = `${year}-03-31`;
    const conds = [`p.company_id=$1`, `p.pay_period_start>=$2`, `p.pay_period_end<=$3`, `p.status='approved'`];
    const params = [req.user.company_id, fy_start, fy_end]; let i=4;
    if (user_id) { conds.push(`p.user_id=$${i++}`); params.push(user_id); }
    const { rows } = await query(
      `SELECT p.user_id, u.name AS full_name, u.employee_code AS emp_code, ep.pan_number,
              SUM(p.basic_pay) as total_basic,
              SUM(p.hra) as total_hra,
              SUM(p.gross_pay) as total_gross,
              SUM(COALESCE(p.pf_employee,0)) as total_pf,
              SUM(COALESCE(p.professional_tax,0)) as total_pt,
              SUM(COALESCE(p.tds,0)) as total_tds,
              SUM(p.net_pay) as total_net,
              COUNT(*) as months_paid
       FROM hr_payroll_runs p
       JOIN users u ON u.id=p.user_id
       LEFT JOIN employee_profiles ep ON ep.user_id=p.user_id
       WHERE ${conds.join(' AND ')}
       GROUP BY p.user_id, u.name, u.employee_code, ep.pan_number
       ORDER BY u.name`,
      params
    );
    res.json({ data: rows, financial_year: `${parseInt(year)-1}-${year}` });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Attrition & joining trend (monthly for last 12 months)
router.get('/reports/attrition', async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT to_char(series, 'YYYY-MM') as month,
        (SELECT COUNT(*) FROM employee_profiles WHERE company_id=$1
          AND to_char(date_of_joining,'YYYY-MM')=to_char(series,'YYYY-MM')) as joined,
        (SELECT COUNT(*) FROM employee_profiles WHERE company_id=$1
          AND to_char(date_of_leaving,'YYYY-MM')=to_char(series,'YYYY-MM')) as left_count
       FROM generate_series(
         date_trunc('month', NOW()) - INTERVAL '11 months',
         date_trunc('month', NOW()), INTERVAL '1 month'
       ) AS series
       ORDER BY series`,
      [req.user.company_id]
    );
    res.json({ data: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Headcount report
router.get('/reports/headcount', async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT dep.name as department,
              COUNT(u.id) as total,
              COUNT(u.id) FILTER (WHERE ep.employment_status='active')     as active,
              COUNT(u.id) FILTER (WHERE ep.employment_status='resigned')   as resigned,
              COUNT(u.id) FILTER (WHERE ep.employment_type='permanent')    as permanent,
              COUNT(u.id) FILTER (WHERE ep.employment_type='contract')     as contract,
              COUNT(u.id) FILTER (WHERE ep.employment_type='probation')    as probation
       FROM users u
       LEFT JOIN employee_profiles ep ON ep.user_id = u.id
       LEFT JOIN hr_departments dep ON dep.id = ep.department_id
       WHERE u.company_id = $1
       GROUP BY dep.name ORDER BY dep.name`,
      [req.user.company_id]
    );
    res.json({ data: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════
// LOP DAYS — Loss of Pay entries per employee per month
// ═══════════════════════════════════════════════════════════
const initLopTable = async () => {
  await query(`
    CREATE TABLE IF NOT EXISTS hr_lop_days (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id UUID REFERENCES companies(id),
      user_id UUID REFERENCES users(id),
      month INT NOT NULL,
      year INT NOT NULL,
      lop_days NUMERIC(5,2) DEFAULT 0,
      type TEXT NOT NULL DEFAULT 'lop',  -- lop | reversal | retrospective
      reason TEXT,
      created_by UUID REFERENCES users(id),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_hr_lop_company ON hr_lop_days(company_id, month, year)`);
};
runSchemaInit('hr-lop-days', initLopTable);

// GET /hr-admin/payroll/lop?month=&year=&type=
router.get('/lop', async (req, res) => {
  try {
    const { month, year, type } = req.query;
    const m = parseInt(month) || new Date().getMonth() + 1;
    const y = parseInt(year)  || new Date().getFullYear();
    const t = type || 'lop';
    const { rows } = await query(
      `SELECT l.*, u.name as employee_name, u.employee_code,
              dep.name as department_name
       FROM hr_lop_days l
       JOIN users u ON u.id = l.user_id
       LEFT JOIN employee_profiles ep ON ep.user_id = u.id
       LEFT JOIN hr_departments dep ON dep.id = ep.department_id
       WHERE l.company_id = $1 AND l.month = $2 AND l.year = $3 AND l.type = $4
       ORDER BY u.name`,
      [req.user.company_id, m, y, t]
    );
    res.json({ data: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /hr-admin/payroll/lop — upsert: one row per (user, month, year, type)
router.post('/lop', async (req, res) => {
  try {
    const { user_id, month, year, lop_days, type = 'lop', reason } = req.body;
    if (!user_id || !month || !year) return res.status(400).json({ error: 'user_id, month, year required' });
    const { rows } = await query(
      `INSERT INTO hr_lop_days (company_id, user_id, month, year, lop_days, type, reason, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT DO NOTHING
       RETURNING *`,
      [req.user.company_id, user_id, month, year, lop_days || 0, type, reason || '', req.user.id]
    );
    if (rows.length === 0) {
      // update existing
      const { rows: u } = await query(
        `UPDATE hr_lop_days SET lop_days=$1, reason=$2, updated_at=NOW()
         WHERE company_id=$3 AND user_id=$4 AND month=$5 AND year=$6 AND type=$7
         RETURNING *`,
        [lop_days || 0, reason || '', req.user.company_id, user_id, month, year, type]
      );
      return res.json({ data: u[0] });
    }
    res.json({ data: rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /hr-admin/payroll/lop/:id
router.delete('/lop/:id', async (req, res) => {
  try {
    await query(`DELETE FROM hr_lop_days WHERE id=$1 AND company_id=$2`, [req.params.id, req.user.company_id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════
// STOP SALARY PROCESSING — flag employees to exclude from payroll run
// ═══════════════════════════════════════════════════════════
const initStopSalaryTable = async () => {
  await query(`
    CREATE TABLE IF NOT EXISTS hr_stop_salary (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id UUID REFERENCES companies(id),
      user_id UUID REFERENCES users(id),
      remarks TEXT,
      stopped_by UUID REFERENCES users(id),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(company_id, user_id)
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_hr_stop_salary_company ON hr_stop_salary(company_id)`);
};
runSchemaInit('hr-stop-salary', initStopSalaryTable);

// GET /hr-admin/payroll/stop-salary
router.get('/stop-salary', async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT s.*, u.name as employee_name, u.employee_code,
              dep.name as department_name, des.name as designation_name,
              su.name as stopped_by_name
       FROM hr_stop_salary s
       JOIN users u ON u.id = s.user_id
       LEFT JOIN employee_profiles ep ON ep.user_id = u.id
       LEFT JOIN hr_departments dep ON dep.id = ep.department_id
       LEFT JOIN hr_designations des ON des.id = ep.designation_id
       LEFT JOIN users su ON su.id = s.stopped_by
       WHERE s.company_id = $1
       ORDER BY u.name`,
      [req.user.company_id]
    );
    res.json({ data: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /hr-admin/payroll/stop-salary
router.post('/stop-salary', async (req, res) => {
  try {
    const { user_id, remarks } = req.body;
    if (!user_id) return res.status(400).json({ error: 'user_id required' });
    const { rows } = await query(
      `INSERT INTO hr_stop_salary (company_id, user_id, remarks, stopped_by)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (company_id, user_id) DO UPDATE SET remarks=$3, stopped_by=$4
       RETURNING *`,
      [req.user.company_id, user_id, remarks || '', req.user.id]
    );
    res.json({ data: rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /hr-admin/payroll/stop-salary/:id
router.delete('/stop-salary/:id', async (req, res) => {
  try {
    await query(`DELETE FROM hr_stop_salary WHERE id=$1 AND company_id=$2`, [req.params.id, req.user.company_id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;

