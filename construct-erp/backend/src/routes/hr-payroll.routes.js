// src/routes/hr-payroll.routes.js
// Monthly payroll: generate draft, review, approve, pay → Finance linkage
const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const { query, withTransaction } = require('../config/database');
const { runSchemaInit } = require('../utils/schemaInit');
const { postAutoJournalStandalone } = require('../services/journalAutoPost');

// Public verification endpoint (no auth — QR scan).
// Deliberately returns NO salary amounts: this URL is printed on every payslip
// as a QR code, so anyone the paper passes through (bank clerk, landlord,
// visa office) can open it. Verification only needs to confirm the document
// is genuine — identity + period + issuing company — not expose pay figures.
router.get('/public/verify/:id', async (req, res) => {
  try {
    const result = await query(
      `SELECT mp.id, mp.month, mp.year, mp.employee_code, mp.status,
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
    res.json({ data: { ...result.rows[0], verified: true } });
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
    await query(`ALTER TABLE hr_monthly_payroll ADD COLUMN IF NOT EXISTS ${col}`).catch(() => {});
  }
};
runSchemaInit('hr-payroll', initTable);

// Itemised CTC component columns. Registered as its OWN schema-init task, not
// appended to initTable above: runSchemaInit records each name in
// schema_migrations and never re-runs it, so anything added to the already-applied
// 'hr-payroll' task would silently never execute on an existing deployment.
//
// Before this, everything beyond basic/hra/conveyance/medical/special collapsed
// into the single `other_earnings` bucket, so a payslip could not show what the
// employee is actually paid for. These mirror the components on
// hr_employee_salaries and are pro-rated for attendance at run time.
const initPayrollCtcColumns = async () => {
  for (const col of [
    'da NUMERIC(12,2) DEFAULT 0',
    'washing_allowance NUMERIC(12,2) DEFAULT 0',
    'lta NUMERIC(12,2) DEFAULT 0',
    'mobile_allowance NUMERIC(12,2) DEFAULT 0',
    'project_allowance NUMERIC(12,2) DEFAULT 0',
    'city_special_allowance NUMERIC(12,2) DEFAULT 0',
    'accommodation_allowance NUMERIC(12,2) DEFAULT 0',
    'food_allowance NUMERIC(12,2) DEFAULT 0',
    'transport_allowance NUMERIC(12,2) DEFAULT 0',
    'conveyance_allowance NUMERIC(12,2) DEFAULT 0',
    'incentive NUMERIC(12,2) DEFAULT 0',
    // Employer-side CTC components. `employer_pf_ctc` is the CTC-charged figure
    // (PF + EDLI + admin); the pre-existing `pf_employer` stays the statutory
    // calc and the two are deliberately kept separate.
    'employer_pf_ctc NUMERIC(12,2) DEFAULT 0',
    'gratuity NUMERIC(12,2) DEFAULT 0',
    'edli NUMERIC(12,2) DEFAULT 0',
    'epf_admin NUMERIC(12,2) DEFAULT 0',
    // Recoveries that existed on the pay sheet but nowhere in the ERP.
    'mess_deduction NUMERIC(12,2) DEFAULT 0',
    'accommodation_deduction NUMERIC(12,2) DEFAULT 0',
    // Attendance detail, so the payroll row is self-explaining without having
    // to re-query hr_attendance months later.
    'absent_days NUMERIC(5,1) DEFAULT 0',
    'cl_availed NUMERIC(5,1) DEFAULT 0',
    'sl_availed NUMERIC(5,1) DEFAULT 0',
    'el_availed NUMERIC(5,1) DEFAULT 0',
    'total_leave_availed NUMERIC(5,1) DEFAULT 0',
    // Unprorated gross for this month, for reference against the pro-rated one.
    'full_gross NUMERIC(12,2) DEFAULT 0',
  ]) {
    await query(`ALTER TABLE hr_monthly_payroll ADD COLUMN IF NOT EXISTS ${col}`);
  }
};
runSchemaInit('hr-payroll-ctc-columns', initPayrollCtcColumns);

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

// Professional Tax — uses the company's own hr_pt_slabs table. PT varies by
// state, so a company with no slabs configured gets ZERO PT deducted (not a
// silently-applied Maharashtra default) — the /run response surfaces a
// pt_warning telling the preparer to configure slabs under HR Masters.
function calcPT(gross, month, applicable, ptSlabs) {
  if (!applicable) return 0;
  if (!ptSlabs || !ptSlabs.length) return 0;
  const g = parseFloat(gross);
  // slabs are [{salary_from, salary_to, pt_amount}] ordered by salary_from ASC —
  // matches the hr_pt_slabs schema actually created in hr-salary.routes.js.
  // There is no per-February override column, so PT is flat across all months.
  const slab = ptSlabs.find(s =>
    g > parseFloat(s.salary_from) &&
    (s.salary_to === null || g <= parseFloat(s.salary_to))
  );
  if (!slab) return 0;
  return parseFloat(slab.pt_amount);
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
    const { month, year, status, user_id, project_id } = req.query;
    const m = parseInt(month) || new Date().getMonth() + 1;
    const y = parseInt(year)  || new Date().getFullYear();

    let sql = `
      SELECT p.*, u.name as employee_name, u.employee_code,
             dep.name as department_name, des.name as designation_name,
             ep.project_id, proj.name as project_name
      FROM hr_monthly_payroll p
      JOIN users u ON u.id = p.user_id
      LEFT JOIN employee_profiles ep ON ep.user_id = u.id
      LEFT JOIN hr_departments dep ON dep.id = ep.department_id
      LEFT JOIN hr_designations des ON des.id = ep.designation_id
      LEFT JOIN projects proj ON proj.id = ep.project_id
      WHERE p.company_id = $1 AND p.month = $2 AND p.year = $3`;
    const params = [req.user.company_id, m, y];
    let idx = 4;

    if (status)     { sql += ` AND p.status=$${idx}`;      params.push(status);     idx++; }
    if (user_id)    { sql += ` AND p.user_id=$${idx}`;     params.push(user_id);    idx++; }
    if (project_id) { sql += ` AND ep.project_id=$${idx}`; params.push(project_id); idx++; }

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
// UUID-constrained so it no longer swallows the static /lop and /stop-salary
// routes registered below it (Express matches in registration order).
// ═══════════════════════════════════════════════════════════
router.get('/:id([0-9a-fA-F-]{36})', async (req, res) => {
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
    const { month, year, user_id, project_id } = req.body;
    const m = parseInt(month);
    const y = parseInt(year);
    const workDays = workingDaysInMonth(m, y);

    // Get active employee(s) with salary — optionally scoped to one employee or project
    // LATERAL picks the single most-recent salary row effective for this month,
    // so a mid-month salary update never causes duplicate rows per employee.
    let employeeSql = `
      SELECT u.id as user_id,
              u.name as employee_name,
              es.basic, es.hra, es.conveyance, es.medical,
              es.special_allowance, es.other_allowance, es.gross_monthly,
              es.pf_applicable, es.esi_applicable, es.pt_applicable,
              es.vda, es.washing_allowance, es.lta, es.mobile_allowance,
              es.project_allowance, es.city_special_allowance, es.accommodation_allowance,
              es.food_allowance, es.transport_allowance, es.conveyance_allowance,
              es.incentive, es.employer_pf, es.gratuity, es.edli, es.epf_admin,
              es.mess_deduction, es.accommodation_deduction
       FROM users u
       JOIN LATERAL (
         SELECT basic, hra, conveyance, medical, special_allowance, other_allowance,
                gross_monthly, pf_applicable, esi_applicable, pt_applicable,
                vda, washing_allowance, lta, mobile_allowance,
                project_allowance, city_special_allowance, accommodation_allowance,
                food_allowance, transport_allowance, conveyance_allowance,
                incentive, employer_pf, gratuity, edli, epf_admin,
                mess_deduction, accommodation_deduction
         FROM hr_employee_salaries
         WHERE user_id = u.id
           AND effective_from <= make_date($3,$1,1)
           AND (effective_to IS NULL OR effective_to >= make_date($3,$1,1))
         ORDER BY effective_from DESC, created_at DESC, id DESC
         LIMIT 1
       ) es ON TRUE
       LEFT JOIN employee_profiles ep ON ep.user_id = u.id
       WHERE u.company_id = $2
         -- Include a now-terminated/resigned employee if they still have
         -- attendance recorded in this payroll month, so leaving mid-month
         -- (or after) doesn't silently drop them from the run they actually
         -- worked in — full & final settlement still owes them that pay.
         AND (
           u.is_active = TRUE
           OR EXISTS (
             SELECT 1 FROM hr_attendance ha
             WHERE ha.user_id = u.id
               AND EXTRACT(MONTH FROM ha.attendance_date) = $1
               AND EXTRACT(YEAR FROM ha.attendance_date) = $3
           )
         )
         AND u.id NOT IN (SELECT user_id FROM hr_stop_salary WHERE company_id = $2)`;
    const employeeParams = [m, req.user.company_id, y];
    let epIdx = 4;
    if (user_id)    { employeeSql += ` AND u.id = $${epIdx}`;          employeeParams.push(user_id);    epIdx++; }
    if (project_id) { employeeSql += ` AND ep.project_id = $${epIdx}`; employeeParams.push(project_id); epIdx++; }
    const employees = await query(employeeSql, employeeParams);

    const stoppedRes = await query(
      `SELECT u.name FROM hr_stop_salary ss JOIN users u ON u.id = ss.user_id WHERE ss.company_id = $1`,
      [req.user.company_id]
    );
    const stoppedNames = stoppedRes.rows.map(r => r.name);

    if (!employees.rows.length) {
      return res.status(400).json({
        error: user_id    ? 'No active salary record found for this employee in the selected month.'
             : project_id ? 'No active employees with salary found for the selected project.'
             : 'No active employee salaries configured. Assign employee salaries before payroll generation.',
      });
    }

    // Load company PT slabs once for the run
    const ptSlabsResult = await query(
      `SELECT salary_from, salary_to, pt_amount FROM hr_pt_slabs
       WHERE company_id=$1 AND active=TRUE ORDER BY salary_from ASC`,
      [req.user.company_id]
    );
    const ptSlabs = ptSlabsResult.rows;

    // Identify employees with no salary record (LATERAL gives us only matched ones;
    // we do a separate check to surface missing-salary employees explicitly)
    const allActiveParams = [req.user.company_id, m, y];
    let allActiveIdx = 4;
    let allActiveSql = `
       SELECT u.id, u.name FROM users u
       LEFT JOIN employee_profiles ep ON ep.user_id = u.id
       WHERE u.company_id=$1
         AND (
           u.is_active = TRUE
           OR EXISTS (
             SELECT 1 FROM hr_attendance ha
             WHERE ha.user_id = u.id
               AND EXTRACT(MONTH FROM ha.attendance_date) = $2
               AND EXTRACT(YEAR FROM ha.attendance_date) = $3
           )
         )
       AND u.id NOT IN (SELECT user_id FROM hr_stop_salary WHERE company_id=$1)`;
    if (user_id)    { allActiveSql += ` AND u.id=$${allActiveIdx}`;          allActiveParams.push(user_id);    allActiveIdx++; }
    if (project_id) { allActiveSql += ` AND ep.project_id=$${allActiveIdx}`; allActiveParams.push(project_id); allActiveIdx++; }
    const allActive = await query(allActiveSql, allActiveParams);
    const foundIds = new Set(employees.rows.map(e => e.user_id));
    const missingSalary = allActive.rows.filter(u => !foundIds.has(u.id)).map(u => u.name);

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
      const absentDays = parseFloat(a.absent || 0);

      // CL/SL/EL availed this month — reported on the pay sheet alongside LOP so
      // the reviewer can see WHY paid days differ from working days. Counted from
      // approved leave requests overlapping the payroll month rather than from
      // hr_attendance, which records only a generic 'leave' status without type.
      const leaveByType = await query(
        `SELECT lt.code, COALESCE(SUM(lr.days),0) AS days
           FROM hr_leave_requests lr
           JOIN hr_leave_types lt ON lt.id = lr.leave_type_id
          WHERE lr.user_id = $1 AND lr.status = 'approved'
            AND lr.from_date <= make_date($3, $2, 1) + INTERVAL '1 month' - INTERVAL '1 day'
            AND lr.to_date   >= make_date($3, $2, 1)
          GROUP BY lt.code`,
        [emp.user_id, m, y]
      );
      const leaveDays = Object.fromEntries(leaveByType.rows.map(r => [r.code, parseFloat(r.days || 0)]));
      const clAvailed = leaveDays.CL || 0;
      const slAvailed = leaveDays.SL || 0;
      const elAvailed = leaveDays.EL || 0;
      const totalLeaveAvailed = clAvailed + slAvailed + elAvailed;

      // Manual LOP adjustments (hr_lop_days) — 'lop'/'retrospective' add extra
      // unpaid days beyond what attendance alone shows; 'reversal' cancels LOP
      // back out (e.g. a regularization approved after the attendance baseline
      // was already marked). These previously had no effect on payroll at all.
      const manualLopRes = await query(
        `SELECT type, COALESCE(SUM(lop_days),0) AS days FROM hr_lop_days
          WHERE company_id=$1 AND user_id=$2 AND month=$3 AND year=$4
          GROUP BY type`,
        [req.user.company_id, emp.user_id, m, y]
      );
      let manualLopDelta = 0;
      for (const r of manualLopRes.rows) {
        const days = parseFloat(r.days || 0);
        manualLopDelta += r.type === 'reversal' ? -days : days;
      }

      const lopDays = Math.max(0, workDays - paidDays + manualLopDelta);
      const effectivePaidDays = Math.max(0, workDays - lopDays);

      // Pro-rate salary if LOP (cap at 1.0 — Sunday/holiday swipes can push paidDays > workDays)
      const lopFactor = workDays > 0 ? Math.min(1, effectivePaidDays / workDays) : 1;
      const pro   = (v) => Math.round(parseFloat(v || 0) * lopFactor);
      const basic = pro(emp.basic);
      const hra   = pro(emp.hra);
      const conv  = pro(emp.conveyance);
      const med   = pro(emp.medical);
      const spec  = pro(emp.special_allowance);

      // Every other CTC component, pro-rated on the same LOP factor so the
      // itemised payslip lines always reconcile to the pro-rated gross.
      const da        = pro(emp.vda);
      const washing   = pro(emp.washing_allowance);
      const lta       = pro(emp.lta);
      const mobile    = pro(emp.mobile_allowance);
      const project   = pro(emp.project_allowance);
      const citySpec  = pro(emp.city_special_allowance);
      const accom     = pro(emp.accommodation_allowance);
      const food      = pro(emp.food_allowance);
      const transport = pro(emp.transport_allowance);
      const convAllow = pro(emp.conveyance_allowance);
      const incentive = pro(emp.incentive);
      // Employer-side CTC figures — informational on the payslip, never deducted
      // from the employee, so they follow the same proration as the earnings.
      const employerPfCtc = pro(emp.employer_pf);
      const gratuity      = pro(emp.gratuity);
      const edli          = pro(emp.edli);
      const epfAdmin      = pro(emp.epf_admin);
      // Gross = the configured monthly gross (gross_monthly), pro-rated for
      // attendance, PLUS incentive. gross_monthly includes every other BCIM
      // earning component (project/accommodation/food/transport/LTA/etc) but
      // NOT incentive — the salary edit screen's own net-pay formula adds
      // incentive on top of gross_monthly, confirming it's additional, not
      // included. Without adding it here, `itemised` below (which does
      // include incentive) exceeded `gross`, so the Math.max(0, ...) clamp
      // on `other` silently absorbed the whole incentive amount out of the
      // payslip. Summing only basic+hra+medical+special dropped the other
      // allowances entirely and understated gross (e.g. ₹27,613 instead of
      // the configured ₹53,886) — component sum is only a legacy fallback
      // for rows with no gross_monthly set.
      const componentSum = basic + hra + conv + med + spec
        + Math.round(parseFloat(emp.other_allowance || 0) * lopFactor);
      const grossMonthly = Math.round(parseFloat(emp.gross_monthly || 0) * lopFactor);
      const gross = (grossMonthly > 0 ? grossMonthly : componentSum) + incentive;
      // Unprorated entitlement, kept for reference so a reviewer can see at a
      // glance how much LOP cost the employee without recomputing it.
      const fullGross = Math.round(parseFloat(emp.gross_monthly || 0));
      // "Other" is now only the genuine remainder — everything the itemised
      // component columns above don't already account for. Before those columns
      // existed this bucket absorbed the whole allowance structure, which is why
      // payslips could not break the pay down.
      const itemised = basic + hra + conv + med + spec + da + washing + lta + mobile
        + project + citySpec + accom + food + transport + convAllow + incentive;
      const other = Math.max(0, gross - itemised);

      // Statutory deductions
      // ESI eligibility is assessed on configured gross_monthly (not pro-rated),
      // per India ESI Act — eligibility is fixed at contribution period start.
      const esiEligible = emp.esi_applicable && parseFloat(emp.gross_monthly || 0) <= ESI_CEILING;
      const pf  = calcPF(basic, emp.pf_applicable);
      const esi = calcESI(gross, esiEligible);
      const pt  = calcPT(gross, m, emp.pt_applicable, ptSlabs);

      // Loan deduction (active loans)
      const loanQ = await query(
        `SELECT COALESCE(SUM(emi_amount),0) as total_emi
         FROM hr_loans WHERE user_id=$1 AND status='approved' AND balance_amount>0`,
        [emp.user_id]
      );
      const loanDed = parseFloat(loanQ.rows[0].total_emi || 0);

      // Upsert payroll record (skip if already approved/paid)
      const existing = await query(
        `SELECT id, status, tds, advance_deduction, other_deductions FROM hr_monthly_payroll WHERE user_id=$1 AND month=$2 AND year=$3`,
        [emp.user_id, m, y]
      );
      if (existing.rows.length && ['approved','paid'].includes(existing.rows[0].status)) {
        generated.push({ user_id: emp.user_id, skipped: true, status: existing.rows[0].status });
        continue;
      }
      // Preserve manually entered TDS/advance from a previous draft so re-runs don't wipe them
      const prevTds = parseFloat(existing.rows[0]?.tds || 0);
      const prevAdv = parseFloat(existing.rows[0]?.advance_deduction || 0)
                    + parseFloat(existing.rows[0]?.other_deductions || 0);

      // Accommodation/mess recoveries are FLAT, never pro-rated: verified on the
      // Jul-2026 pay sheet, where every employee carrying LOP (3, 6, 2 days …)
      // was still recovered the full standard ₹4,000–4,500 accommodation and
      // ₹3,250 mess. They are a fixed facility charge, not an earned amount.
      const messDed  = parseFloat(emp.mess_deduction || 0);
      const accomDed = parseFloat(emp.accommodation_deduction || 0);

      const totalDed = pf.emp + esi.emp + pt + loanDed + prevTds + prevAdv + messDed + accomDed;
      const netPay   = gross - totalDed;

      // Built from a keyed map rather than a positional list: this row now carries
      // 45+ columns, and hand-numbering $1…$45 twice (once for VALUES, once for
      // the ON CONFLICT SET) is exactly where a silent column-shift bug would hide
      // in payroll figures. company_id/user_id/month/year are the conflict key and
      // are written on insert only.
      const payrollRow = {
        working_days: workDays, paid_days: effectivePaidDays, lop_days: lopDays,
        basic, hra, conveyance: conv, medical: med, special_allowance: spec,
        da, washing_allowance: washing, lta, mobile_allowance: mobile,
        project_allowance: project, city_special_allowance: citySpec,
        accommodation_allowance: accom, food_allowance: food,
        transport_allowance: transport, conveyance_allowance: convAllow,
        incentive,
        other_earnings: other, gross_earnings: gross, full_gross: fullGross,
        employer_pf_ctc: employerPfCtc, gratuity, edli, epf_admin: epfAdmin,
        pf_employee: pf.emp, pf_employer: pf.er,
        esi_employee: esi.emp, esi_employer: esi.er, pt,
        loan_deduction: loanDed,
        mess_deduction: messDed, accommodation_deduction: accomDed,
        absent_days: absentDays, cl_availed: clAvailed, sl_availed: slAvailed,
        el_availed: elAvailed, total_leave_availed: totalLeaveAvailed,
        total_deductions: totalDed, net_pay: netPay,
        status: 'draft',
      };
      const keyCols = ['company_id', 'user_id', 'month', 'year'];
      const keyVals = [req.user.company_id, emp.user_id, m, y];
      const dataCols = Object.keys(payrollRow);
      const allCols  = [...keyCols, ...dataCols];
      const allVals  = [...keyVals, ...dataCols.map(c => payrollRow[c])];
      const placeholders = allCols.map((_, i) => `$${i + 1}`).join(',');
      const updateSet = dataCols
        .map(c => `${c}=$${keyCols.length + dataCols.indexOf(c) + 1}`)
        .join(', ');

      const { rows } = await query(
        `INSERT INTO hr_monthly_payroll (${allCols.join(',')})
         VALUES (${placeholders})
         ON CONFLICT (user_id, month, year) DO UPDATE SET ${updateSet}
         RETURNING *`,
        allVals
      );
      generated.push(rows[0]);
    }

    res.status(201).json({
      data: generated,
      count: generated.length,
      month: m,
      year: y,
      ...(missingSalary.length ? { missing_salary_employees: missingSalary } : {}),
      ...(stoppedNames.length ? { stopped_salary_employees: stoppedNames } : {}),
      ...(ptSlabs.length === 0 ? { pt_warning: 'No PT slabs configured for this company — Professional Tax was not deducted for anyone this run. Configure PT slabs under HR Masters.' } : {}),
    });
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

    const totalDed = parseFloat(p.pf_employee || 0) + parseFloat(p.esi_employee || 0) + parseFloat(p.pt || 0) +
                     parseFloat(loan_deduction ?? p.loan_deduction ?? 0) + parseFloat(advance_deduction ?? p.advance_deduction ?? 0) +
                     parseFloat(tds ?? p.tds ?? 0) + parseFloat(other_deductions ?? p.other_deductions ?? 0);
    const netPay = parseFloat(p.gross_earnings || 0) - totalDed;

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

    // Mark all records paid atomically so a mid-loop failure doesn't leave some paid, some not
    await withTransaction(async (client) => {
      for (const p of approved.rows) {
        await client.query(
          `UPDATE hr_monthly_payroll SET status='paid', payment_date=$1, payment_mode=$2, payment_ref=$3
           WHERE id=$4`,
          [payment_date, payment_mode || 'bank_transfer', payment_ref || null, p.id]
        );
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
        results.push({ id: p.id, employee_name: p.employee_name, net_pay: p.net_pay });
      }
    });

    // Finance payment records are best-effort (outside the main transaction)
    for (const p of approved.rows) {
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
              ep.date_of_joining, ep.work_location, dep.name as department_name, des.name as designation_name,
              c.name as company_name,
              m.basic AS m_basic, m.vda AS m_da, m.hra AS m_hra,
              m.conveyance_allowance AS m_conveyance_allowance, m.medical AS m_medical,
              m.washing_allowance AS m_washing_allowance, m.lta AS m_lta,
              m.mobile_allowance AS m_mobile_allowance, m.project_allowance AS m_project_allowance,
              m.city_special_allowance AS m_city_special_allowance,
              m.accommodation_allowance AS m_accommodation_allowance, m.food_allowance AS m_food_allowance,
              m.transport_allowance AS m_transport_allowance, m.special_allowance AS m_special_allowance,
              m.incentive AS m_incentive, m.gross_monthly AS m_gross_monthly
       FROM hr_monthly_payroll p
       JOIN users u ON u.id = p.user_id
       LEFT JOIN employee_profiles ep ON ep.user_id = u.id
       LEFT JOIN hr_departments dep ON dep.id = ep.department_id
       LEFT JOIN hr_designations des ON des.id = ep.designation_id
       LEFT JOIN companies c ON c.id = p.company_id
       -- "Master" figures: the entitled (unprorated) salary in force for this
       -- payroll month, matching the "Master" column on the real BCIM payslip
       -- alongside the pro-rated "Actual" figures already on p.*.
       LEFT JOIN hr_employee_salaries m ON m.user_id = p.user_id
         AND m.effective_from <= make_date(p.year, p.month, 1) + INTERVAL '1 month' - INTERVAL '1 day'
         AND (m.effective_to IS NULL OR m.effective_to >= make_date(p.year, p.month, 1))
       WHERE p.id = $1 AND p.company_id = $2
       ORDER BY m.effective_from DESC
       LIMIT 1`,
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

// Form 16 / TDS Summary — annual salary & TDS per employee for a financial year
// FY runs April–March; pass year=2025 for FY 2024-25
router.get('/reports/form16', async (req, res) => {
  try {
    const fy = parseInt(req.query.year) || new Date().getFullYear();
    const { user_id } = req.query;
    // FY April(fy-1) to March(fy)
    const fyStart = { month: 4, year: fy - 1 };
    const fyEnd   = { month: 3, year: fy };

    const { project_id } = req.query;

    // Build params array: $1=company_id, then optional filters, then $N/$N+1 for FY years
    const params = [req.user.company_id];
    let extraCond = '';
    if (user_id)    { params.push(user_id);    extraCond += ` AND p.user_id=$${params.length}`;       }
    if (project_id) { params.push(project_id); extraCond += ` AND ep.project_id=$${params.length}`;   }
    params.push(fyStart.year, fyEnd.year);
    const fyStartIdx = params.length - 1;  // index of fyStart.year (1-based)
    const fyEndIdx   = params.length;      // index of fyEnd.year   (1-based)

    const { rows } = await query(`
      SELECT
        p.user_id,
        u.name          AS full_name,
        u.employee_code AS emp_code,
        ep.pan_number,
        ep.uan_number,
        dep.name        AS department,
        des.name        AS designation,
        -- earnings
        SUM(p.basic)             AS total_basic,
        SUM(p.hra)               AS total_hra,
        SUM(p.conveyance)        AS total_conveyance,
        SUM(p.medical)           AS total_medical,
        SUM(p.special_allowance) AS total_special,
        SUM(p.other_earnings)    AS total_other_earnings,
        SUM(p.gross_earnings)    AS total_gross,
        -- deductions
        SUM(p.pf_employee)       AS total_pf_employee,
        SUM(p.esi_employee)      AS total_esi_employee,
        SUM(p.pt)                AS total_pt,
        SUM(p.tds)               AS total_tds,
        SUM(p.loan_deduction)    AS total_loan_deduction,
        SUM(p.total_deductions)  AS total_deductions,
        SUM(p.net_pay)           AS total_net_pay,
        -- employer
        SUM(p.pf_employer)       AS total_pf_employer,
        SUM(p.esi_employer)      AS total_esi_employer,
        -- attendance
        SUM(p.working_days)      AS total_working_days,
        SUM(p.paid_days)         AS total_paid_days,
        SUM(p.lop_days)          AS total_lop_days,
        COUNT(*)::int            AS months_processed
      FROM hr_monthly_payroll p
      JOIN users u ON u.id = p.user_id
      LEFT JOIN employee_profiles ep ON ep.user_id = p.user_id
      LEFT JOIN hr_departments dep ON dep.id = ep.department_id
      LEFT JOIN hr_designations des ON des.id = ep.designation_id
      WHERE p.company_id = $1
        AND p.status IN ('approved','paid')
        AND (
          (p.year = $${fyStartIdx} AND p.month >= 4) OR
          (p.year = $${fyEndIdx}   AND p.month <= 3)
        )
        ${extraCond}
      GROUP BY p.user_id, u.name, u.employee_code, ep.pan_number, ep.uan_number, dep.name, des.name
      ORDER BY u.name`,
      params
    );

    // Compute derived TDS fields
    const STANDARD_DEDUCTION = 75000; // Budget 2024: raised from ₹50,000 to ₹75,000 (new tax regime)
    const data = rows.map(r => {
      const gross         = parseFloat(r.total_gross || 0);
      const pfDed         = parseFloat(r.total_pf_employee || 0);
      const taxableIncome = Math.max(0, gross - pfDed - STANDARD_DEDUCTION);
      const estimatedTax  = parseFloat(r.total_tds || 0);
      return {
        ...r,
        taxable_income:    Math.round(taxableIncome),
        estimated_tax:     Math.round(estimatedTax),
        standard_deduction: STANDARD_DEDUCTION,
        financial_year:   `${fyStart.year}-${String(fyEnd.year).slice(-2)}`,
      };
    });

    res.json({ data, financial_year: `${fyStart.year}-${String(fyEnd.year).slice(-2)}`, fy_year: fy });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Bank Transfer File — NEFT/RTGS format for salary disbursement
// Returns CSV/text suitable for bank portal upload for a given month/year
router.get('/reports/bank-transfer', async (req, res) => {
  try {
    const month = parseInt(req.query.month) || new Date().getMonth() + 1;
    const year  = parseInt(req.query.year)  || new Date().getFullYear();
    const fmt   = (req.query.format || 'csv').toLowerCase(); // csv | text

    const { rows } = await query(`
      SELECT
        u.name          AS employee_name,
        u.employee_code AS emp_code,
        ep.bank_name,
        ep.bank_account_number AS account_number,
        ep.bank_ifsc    AS ifsc_code,
        ep.pan_number,
        p.net_pay,
        p.basic, p.gross_earnings, p.total_deductions,
        p.payment_mode, p.payment_ref, p.status
      FROM hr_monthly_payroll p
      JOIN users u ON u.id = p.user_id
      LEFT JOIN employee_profiles ep ON ep.user_id = p.user_id
      WHERE p.company_id = $1 AND p.month = $2 AND p.year = $3
        AND p.status IN ('approved','paid')
        AND ep.bank_account_number IS NOT NULL
        AND ep.bank_account_number != ''
        AND ep.bank_ifsc IS NOT NULL
        AND ep.bank_ifsc != ''
      ORDER BY u.name`,
      [req.user.company_id, month, year]
    );

    if (!rows.length) return res.status(404).json({ error: 'No payroll records with bank details found for this period' });

    const totalAmount = rows.reduce((s, r) => s + parseFloat(r.net_pay || 0), 0);
    const monthName   = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][month - 1];

    if (fmt === 'text') {
      // Generic NEFT bulk payment text format (tab-delimited, widely accepted)
      const header = `NEFT BULK SALARY TRANSFER\tMonth: ${monthName} ${year}\tTotal: ${totalAmount.toFixed(2)}\tCount: ${rows.length}`;
      const lines  = [
        header,
        'Sr No\tBeneficiary Name\tAccount Number\tIFSC Code\tAmount\tRemarks',
        ...rows.map((r, i) => [
          i + 1,
          r.employee_name,
          r.account_number,
          r.ifsc_code,
          parseFloat(r.net_pay || 0).toFixed(2),
          `Salary ${monthName} ${year} - ${r.emp_code}`,
        ].join('\t')),
        `\t\t\t\tTOTAL: ${totalAmount.toFixed(2)}\t`,
      ];
      res.setHeader('Content-Type', 'text/plain');
      res.setHeader('Content-Disposition', `attachment; filename="salary_neft_${monthName}_${year}.txt"`);
      return res.send(lines.join('\n'));
    }

    // Default: CSV (works with most bank portals — SBI, HDFC, ICICI, Axis)
    const csvHeader = 'Sr No,Beneficiary Name,Account Number,IFSC Code,Amount,Remittance Info,Bank Name,Employee Code,PAN';
    const csvRows   = rows.map((r, i) => [
      i + 1,
      `"${r.employee_name}"`,
      r.account_number,
      r.ifsc_code,
      parseFloat(r.net_pay || 0).toFixed(2),
      `"Salary ${monthName} ${year}"`,
      `"${r.bank_name || ''}"`,
      r.emp_code || '',
      r.pan_number || '',
    ].join(','));
    const totalRow  = `,,,,${totalAmount.toFixed(2)},"TOTAL (${rows.length} employees)",,`;

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="salary_transfer_${monthName}_${year}.csv"`);
    res.send([csvHeader, ...csvRows, totalRow].join('\n'));
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

