// hr-phase5.routes.js — Payroll sub-pages backend (Phase 5)
// Mounted at /api/hr in server.js
// Covers: salary revisions, LOP, statements, JV, bank transfer, hold salary,
//         YTD, IT declaration/statement, loan statement, pay item groups,
//         payroll repository, payslip templates

const express = require('express');
const router  = express.Router();
const { authenticate }  = require('../middleware/auth');
const { query }         = require('../config/database');
const { runSchemaInit } = require('../utils/schemaInit');

router.use(authenticate);

// ─── SCHEMA INIT ────────────────────────────────────────────────────────────

const initTables = async () => {
  // LOP entries (editable before payroll run, distinct from hr_monthly_payroll.lop_days)
  await query(`
    CREATE TABLE IF NOT EXISTS hr_lop_entries (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id  UUID REFERENCES companies(id) ON DELETE CASCADE,
      user_id     UUID REFERENCES users(id) ON DELETE CASCADE,
      month       INT NOT NULL,
      year        INT NOT NULL,
      lop_days    NUMERIC(5,2) NOT NULL DEFAULT 0,
      updated_by  UUID REFERENCES users(id),
      updated_at  TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(user_id, month, year)
    )
  `);

  // Salary holds — employees excluded from a payroll run
  await query(`
    CREATE TABLE IF NOT EXISTS hr_salary_holds (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id  UUID REFERENCES companies(id) ON DELETE CASCADE,
      user_id     UUID REFERENCES users(id) ON DELETE CASCADE,
      month       INT NOT NULL,
      year        INT NOT NULL,
      reason      TEXT NOT NULL,
      remarks     TEXT,
      added_by    UUID REFERENCES users(id),
      created_at  TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(user_id, month, year)
    )
  `);

  // IT declarations — per employee per financial year
  await query(`
    CREATE TABLE IF NOT EXISTS hr_it_declarations (
      id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id   UUID REFERENCES companies(id) ON DELETE CASCADE,
      user_id      UUID REFERENCES users(id) ON DELETE CASCADE,
      financial_year INT NOT NULL,
      declarations JSONB NOT NULL DEFAULT '{}',
      updated_at   TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(user_id, financial_year)
    )
  `);

  // Pay item groups — named groupings for earnings/deductions
  await query(`
    CREATE TABLE IF NOT EXISTS hr_pay_item_groups (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id  UUID REFERENCES companies(id) ON DELETE CASCADE,
      name        TEXT NOT NULL,
      type        TEXT NOT NULL DEFAULT 'Earning' CHECK (type IN ('Earning','Deduction','Reimbursement')),
      description TEXT,
      item_count  INT DEFAULT 0,
      created_at  TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(company_id, name)
    )
  `);

  // Payslip templates
  await query(`
    CREATE TABLE IF NOT EXISTS hr_payslip_templates (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id    UUID REFERENCES companies(id) ON DELETE CASCADE,
      name          TEXT NOT NULL,
      description   TEXT,
      preview_color TEXT DEFAULT '#7C3AED',
      is_active     BOOLEAN DEFAULT FALSE,
      is_system     BOOLEAN DEFAULT TRUE,
      created_at    TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(company_id, name)
    )
  `);
};

runSchemaInit('hr-phase5', initTables);

// ─── HELPER ─────────────────────────────────────────────────────────────────

// Indian FY months: Apr(m=4,y) … Mar(m=3, y+1)
function fyMonths(startYear) {
  const months = [];
  for (let m = 4; m <= 12; m++) months.push({ month: m, year: startYear });
  for (let m = 1; m <=  3; m++) months.push({ month: m, year: startYear + 1 });
  return months;
}

// Compute income tax on new regime (India FY 2025-26)
function computeNewRegimeTax(taxableIncome) {
  const slabs = [
    { limit: 300000,  rate: 0    },
    { limit: 700000,  rate: 0.05 },
    { limit: 1000000, rate: 0.10 },
    { limit: 1200000, rate: 0.15 },
    { limit: 1500000, rate: 0.20 },
    { limit: Infinity, rate: 0.30 },
  ];
  let tax = 0;
  let prev = 0;
  for (const slab of slabs) {
    if (taxableIncome <= prev) break;
    const taxable = Math.min(taxableIncome, slab.limit) - prev;
    tax += taxable * slab.rate;
    prev = slab.limit;
  }
  // Rebate u/s 87A: full tax relief if taxable income ≤ 7,00,000
  if (taxableIncome <= 700000) tax = 0;
  return Math.round(tax);
}

// ─── 1. SALARY REVISION HISTORY ─────────────────────────────────────────────

router.get('/salary-revisions/:empId', async (req, res) => {
  try {
    const { empId } = req.params;

    // Verify employee belongs to company
    const empCheck = await query(
      `SELECT id, name FROM users WHERE id = $1 AND company_id = $2`,
      [empId, req.user.company_id]
    );
    if (!empCheck.rows.length) return res.status(404).json({ error: 'Employee not found' });

    // All salary records ordered oldest first so we can compute previous CTC
    const { rows } = await query(
      `SELECT es.id, es.effective_from, es.effective_to,
              es.ctc_annual, es.gross_monthly,
              es.basic, es.hra, es.special_allowance,
              u.name AS revised_by,
              es.created_at
       FROM hr_employee_salaries es
       LEFT JOIN users u ON u.id = es.updated_by
       WHERE es.user_id = $1
       ORDER BY es.effective_from ASC`,
      [empId]
    );

    // Annotate with previous CTC for % change display
    const revisions = rows.map((r, i) => ({
      id:            r.id,
      effective_date: r.effective_from,
      effective_to:   r.effective_to,
      previous_ctc:   i === 0 ? null : rows[i - 1].ctc_annual,
      revised_ctc:    r.ctc_annual,
      gross_monthly:  r.gross_monthly,
      reason:         r.reason || null,
      revised_by:     r.revised_by || 'HR Admin',
    }));

    // Return newest first for the UI
    res.json({ data: revisions.reverse() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── 2. LOP DAYS ─────────────────────────────────────────────────────────────

// GET active employees with LOP entries for the month
router.get('/lop-days', async (req, res) => {
  try {
    const { month, year } = req.query;
    if (!month || !year) return res.status(400).json({ error: 'month and year required' });

    const { rows } = await query(
      `SELECT u.id, u.name, u.employee_code,
              dep.name AS department,
              COALESCE(lop.lop_days, 0) AS lop_days,
              26 AS working_days
       FROM users u
       LEFT JOIN employee_profiles ep ON ep.user_id = u.id
       LEFT JOIN hr_departments dep ON dep.id = ep.department_id
       LEFT JOIN hr_lop_entries lop
              ON lop.user_id = u.id
             AND lop.month = $2 AND lop.year = $3
             AND lop.company_id = $1
       WHERE u.company_id = $1 AND u.is_active = TRUE AND u.role = 'employee'
       ORDER BY dep.name NULLS LAST, u.name`,
      [req.user.company_id, parseInt(month), parseInt(year)]
    );

    res.json({ data: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST — save LOP entries (bulk upsert)
router.post('/lop-days', async (req, res) => {
  try {
    const { month, year, entries } = req.body;
    if (!month || !year || !Array.isArray(entries)) {
      return res.status(400).json({ error: 'month, year and entries[] required' });
    }

    for (const e of entries) {
      if (!e.employee_id) continue;
      await query(
        `INSERT INTO hr_lop_entries (company_id, user_id, month, year, lop_days, updated_by)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (user_id, month, year) DO UPDATE
           SET lop_days = $5, updated_by = $6, updated_at = NOW()`,
        [req.user.company_id, e.employee_id, month, year,
         parseFloat(e.lop_days) || 0, req.user.id]
      );
    }

    res.json({ success: true, saved: entries.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── 3. QUICK SALARY STATEMENT ───────────────────────────────────────────────

router.get('/salary-statement/:empId', async (req, res) => {
  try {
    const { empId } = req.params;
    const { month, year } = req.query;
    if (!month || !year) return res.status(400).json({ error: 'month and year required' });

    // Get employee info
    const empQ = await query(
      `SELECT u.name, u.employee_code,
              dep.name AS department, des.name AS designation
       FROM users u
       LEFT JOIN employee_profiles ep ON ep.user_id = u.id
       LEFT JOIN hr_departments dep ON dep.id = ep.department_id
       LEFT JOIN hr_designations des ON des.id = ep.designation_id
       WHERE u.id = $1 AND u.company_id = $2`,
      [empId, req.user.company_id]
    );
    if (!empQ.rows.length) return res.status(404).json({ error: 'Employee not found' });
    const emp = empQ.rows[0];

    // Get payroll record for that month
    const prQ = await query(
      `SELECT * FROM hr_monthly_payroll
       WHERE user_id = $1 AND month = $2 AND year = $3`,
      [empId, parseInt(month), parseInt(year)]
    );

    if (!prQ.rows.length) {
      // No payroll run yet — return salary structure as estimate
      const salQ = await query(
        `SELECT * FROM hr_employee_salaries
         WHERE user_id = $1
           AND effective_from <= make_date($2, $3, 1)
           AND (effective_to IS NULL OR effective_to >= make_date($2, $3, 1))
         ORDER BY effective_from DESC LIMIT 1`,
        [empId, parseInt(year), parseInt(month)]
      );

      if (!salQ.rows.length) return res.json({ data: null });
      const s = salQ.rows[0];

      return res.json({
        data: {
          ...emp,
          status: 'estimate',
          earnings: [
            { name: 'Basic Salary',       amount: parseFloat(s.basic) || 0 },
            { name: 'HRA',                amount: parseFloat(s.hra) || 0 },
            { name: 'Conveyance',         amount: parseFloat(s.conveyance) || 0 },
            { name: 'Medical Allowance',  amount: parseFloat(s.medical) || 0 },
            { name: 'Special Allowance',  amount: parseFloat(s.special_allowance) || 0 },
            { name: 'Other Allowances',   amount: parseFloat(s.other_allowance) || 0 },
          ].filter(e => e.amount > 0),
          deductions: [
            { name: 'PF (Employee)',      amount: s.pf_applicable ? Math.min(parseFloat(s.basic) * 0.12, 1800) : 0 },
            { name: 'ESI (Employee)',     amount: s.esi_applicable && parseFloat(s.gross_monthly) <= 21000 ? Math.round(parseFloat(s.gross_monthly) * 0.0075) : 0 },
          ].filter(d => d.amount > 0),
        }
      });
    }

    const p = prQ.rows[0];
    return res.json({
      data: {
        ...emp,
        status: p.status,
        working_days: p.working_days,
        paid_days: p.paid_days,
        lop_days: p.lop_days,
        earnings: [
          { name: 'Basic Salary',       amount: parseFloat(p.basic) || 0 },
          { name: 'HRA',                amount: parseFloat(p.hra) || 0 },
          { name: 'Conveyance',         amount: parseFloat(p.conveyance) || 0 },
          { name: 'Medical Allowance',  amount: parseFloat(p.medical) || 0 },
          { name: 'Special Allowance',  amount: parseFloat(p.special_allowance) || 0 },
          { name: 'Other Earnings',     amount: parseFloat(p.other_earnings) || 0 },
        ].filter(e => e.amount > 0),
        deductions: [
          { name: 'PF (Employee)',      amount: parseFloat(p.pf_employee) || 0 },
          { name: 'ESI (Employee)',     amount: parseFloat(p.esi_employee) || 0 },
          { name: 'Professional Tax',   amount: parseFloat(p.pt) || 0 },
          { name: 'TDS',                amount: parseFloat(p.tds) || 0 },
          { name: 'Loan Deduction',     amount: parseFloat(p.loan_deduction) || 0 },
          { name: 'Advance Deduction',  amount: parseFloat(p.advance_deduction) || 0 },
          { name: 'Other Deductions',   amount: parseFloat(p.other_deductions) || 0 },
        ].filter(d => d.amount > 0),
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── 4. PAYROLL STATEMENT ────────────────────────────────────────────────────

router.get('/payroll-statement', async (req, res) => {
  try {
    const { month, year } = req.query;
    if (!month || !year) return res.status(400).json({ error: 'month and year required' });

    const { rows } = await query(
      `SELECT p.id, u.employee_code, u.name,
              dep.name AS department,
              p.working_days, p.paid_days, p.lop_days,
              p.gross_earnings,
              p.pf_employee AS pf,
              p.esi_employee AS esi,
              p.tds,
              p.loan_deduction + p.advance_deduction + p.other_deductions AS other_deductions,
              p.total_deductions,
              p.net_pay,
              p.status, p.payment_date, p.payment_mode
       FROM hr_monthly_payroll p
       JOIN users u ON u.id = p.user_id
       LEFT JOIN employee_profiles ep ON ep.user_id = u.id
       LEFT JOIN hr_departments dep ON dep.id = ep.department_id
       WHERE p.company_id = $1 AND p.month = $2 AND p.year = $3
       ORDER BY dep.name NULLS LAST, u.name`,
      [req.user.company_id, parseInt(month), parseInt(year)]
    );

    res.json({ data: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── 5. PAYROLL DIFFERENCES ──────────────────────────────────────────────────

router.get('/payroll-differences', async (req, res) => {
  try {
    let { month, year } = req.query;
    month = parseInt(month);
    year  = parseInt(year);
    if (!month || !year) return res.status(400).json({ error: 'month and year required' });

    const prevMonth = month === 1 ? 12 : month - 1;
    const prevYear  = month === 1 ? year - 1 : year;

    const { rows } = await query(
      `SELECT u.id, u.employee_code, u.name,
              dep.name AS department,
              curr.gross_earnings AS curr_gross,
              curr.net_pay        AS curr_net,
              curr.lop_days       AS curr_lop,
              prev.gross_earnings AS prev_gross,
              prev.net_pay        AS prev_net,
              prev.lop_days       AS prev_lop
       FROM users u
       LEFT JOIN employee_profiles ep ON ep.user_id = u.id
       LEFT JOIN hr_departments dep ON dep.id = ep.department_id
       LEFT JOIN hr_monthly_payroll curr
              ON curr.user_id = u.id AND curr.month = $2 AND curr.year = $3 AND curr.company_id = $1
       LEFT JOIN hr_monthly_payroll prev
              ON prev.user_id = u.id AND prev.month = $4 AND prev.year = $5 AND prev.company_id = $1
       WHERE u.company_id = $1 AND u.is_active = TRUE AND u.role = 'employee'
         AND (curr.id IS NOT NULL OR prev.id IS NOT NULL)
       ORDER BY dep.name NULLS LAST, u.name`,
      [req.user.company_id, month, year, prevMonth, prevYear]
    );

    res.json({ data: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── 6. ACCOUNTS JV ─────────────────────────────────────────────────────────

router.get('/accounts-jv', async (req, res) => {
  try {
    const { month, year } = req.query;
    if (!month || !year) return res.status(400).json({ error: 'month and year required' });

    const { rows } = await query(
      `SELECT
         SUM(gross_earnings)   AS total_gross,
         SUM(pf_employee)      AS total_pf_emp,
         SUM(pf_employer)      AS total_pf_er,
         SUM(esi_employee)     AS total_esi_emp,
         SUM(esi_employer)     AS total_esi_er,
         SUM(pt)               AS total_pt,
         SUM(tds)              AS total_tds,
         SUM(loan_deduction + advance_deduction + other_deductions) AS total_other,
         SUM(net_pay)          AS total_net
       FROM hr_monthly_payroll
       WHERE company_id = $1 AND month = $2 AND year = $3`,
      [req.user.company_id, parseInt(month), parseInt(year)]
    );

    if (!rows.length || !rows[0].total_gross) {
      return res.json({ data: null });
    }

    const t = rows[0];
    const gross   = parseFloat(t.total_gross)   || 0;
    const pfEmp   = parseFloat(t.total_pf_emp)  || 0;
    const pfEr    = parseFloat(t.total_pf_er)   || 0;
    const esiEmp  = parseFloat(t.total_esi_emp) || 0;
    const esiEr   = parseFloat(t.total_esi_er)  || 0;
    const pt      = parseFloat(t.total_pt)      || 0;
    const tds     = parseFloat(t.total_tds)     || 0;
    const other   = parseFloat(t.total_other)   || 0;
    const net     = parseFloat(t.total_net)     || 0;

    const MONTHS = ['','January','February','March','April','May','June',
                    'July','August','September','October','November','December'];

    const jv = {
      jv_date:   new Date().toISOString().split('T')[0],
      narration: `Salary for ${MONTHS[parseInt(month)]} ${year}`,
      entries: [
        { account_code: '5100', account_name: 'Salaries & Wages',     type: 'Dr', amount: gross + pfEr + esiEr, cost_centre: 'HR' },
        { account_code: '2210', account_name: 'PF Payable (Employee)', type: 'Cr', amount: pfEmp,  cost_centre: 'HR' },
        { account_code: '2210', account_name: 'PF Payable (Employer)', type: 'Cr', amount: pfEr,   cost_centre: 'HR' },
        { account_code: '2220', account_name: 'ESI Payable (Employee)',type: 'Cr', amount: esiEmp, cost_centre: 'HR' },
        { account_code: '2220', account_name: 'ESI Payable (Employer)',type: 'Cr', amount: esiEr,  cost_centre: 'HR' },
        { account_code: '2230', account_name: 'PT Payable',           type: 'Cr', amount: pt,     cost_centre: 'HR' },
        { account_code: '2240', account_name: 'TDS Payable (Salaries)',type: 'Cr', amount: tds,    cost_centre: 'HR' },
        { account_code: '2250', account_name: 'Other Deductions Payable', type: 'Cr', amount: other, cost_centre: 'HR' },
        { account_code: '2200', account_name: 'Net Salary Payable',   type: 'Cr', amount: net,    cost_centre: 'HR' },
      ].filter(e => e.amount > 0),
    };

    res.json({ data: jv });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/accounts-jv/export', async (req, res) => {
  // Placeholder — returns a mock download URL; real Excel export can be added later
  res.json({ success: true, download_url: null, message: 'JV export queued' });
});

// ─── 7. BANK TRANSFER ────────────────────────────────────────────────────────

router.get('/bank-transfer', async (req, res) => {
  try {
    const { month, year } = req.query;
    if (!month || !year) return res.status(400).json({ error: 'month and year required' });

    const { rows } = await query(
      `SELECT p.id, u.employee_code, u.name,
              ep.bank_name, ep.bank_account_number AS bank_account,
              ep.ifsc_code,
              p.net_pay,
              p.status,
              CASE WHEN p.status = 'paid' THEN 'Transferred' ELSE 'Pending' END AS transfer_status
       FROM hr_monthly_payroll p
       JOIN users u ON u.id = p.user_id
       LEFT JOIN employee_profiles ep ON ep.user_id = u.id
       WHERE p.company_id = $1 AND p.month = $2 AND p.year = $3
         AND p.status IN ('approved','paid')
       ORDER BY u.name`,
      [req.user.company_id, parseInt(month), parseInt(year)]
    );

    res.json({ data: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/bank-transfer/generate', async (req, res) => {
  // Placeholder — real NEFT file generation (fixed-width text) can be added
  res.json({ success: true, download_url: null, message: 'Bank transfer file generated' });
});

// ─── 8. HOLD SALARY ──────────────────────────────────────────────────────────

router.get('/hold-salary', async (req, res) => {
  try {
    const { month, year } = req.query;
    if (!month || !year) return res.status(400).json({ error: 'month and year required' });

    const { rows } = await query(
      `SELECT h.id, u.employee_code, u.name,
              dep.name AS department,
              h.reason, h.remarks,
              ab.name AS added_by,
              h.created_at
       FROM hr_salary_holds h
       JOIN users u ON u.id = h.user_id
       LEFT JOIN employee_profiles ep ON ep.user_id = u.id
       LEFT JOIN hr_departments dep ON dep.id = ep.department_id
       LEFT JOIN users ab ON ab.id = h.added_by
       WHERE h.company_id = $1 AND h.month = $2 AND h.year = $3
       ORDER BY h.created_at DESC`,
      [req.user.company_id, parseInt(month), parseInt(year)]
    );

    res.json({ data: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/hold-salary', async (req, res) => {
  try {
    const { employee_id, month, year, reason, remarks } = req.body;
    if (!employee_id || !month || !year || !reason) {
      return res.status(400).json({ error: 'employee_id, month, year and reason required' });
    }

    const { rows } = await query(
      `INSERT INTO hr_salary_holds (company_id, user_id, month, year, reason, remarks, added_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (user_id, month, year) DO UPDATE
         SET reason = $5, remarks = $6, added_by = $7, created_at = NOW()
       RETURNING *`,
      [req.user.company_id, employee_id, month, year, reason, remarks || null, req.user.id]
    );

    res.status(201).json({ data: rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/hold-salary/:id', async (req, res) => {
  try {
    await query(
      `DELETE FROM hr_salary_holds WHERE id = $1 AND company_id = $2`,
      [req.params.id, req.user.company_id]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── 9. YTD SUMMARY ─────────────────────────────────────────────────────────

router.get('/ytd-summary/:empId', async (req, res) => {
  try {
    const { empId } = req.params;
    const year = parseInt(req.query.year) || new Date().getFullYear();

    const empCheck = await query(
      `SELECT id FROM users WHERE id = $1 AND company_id = $2`,
      [empId, req.user.company_id]
    );
    if (!empCheck.rows.length) return res.status(404).json({ error: 'Employee not found' });

    const fy = fyMonths(year);
    const monthly = [];

    for (const { month, year: my } of fy) {
      const { rows } = await query(
        `SELECT basic, hra, conveyance, medical, special_allowance, other_earnings,
                gross_earnings AS gross,
                pf_employee AS pf, esi_employee AS esi, pt, tds,
                loan_deduction + advance_deduction + other_deductions AS other,
                net_pay AS net
         FROM hr_monthly_payroll
         WHERE user_id = $1 AND month = $2 AND year = $3`,
        [empId, month, my]
      );
      if (rows.length) {
        const r = rows[0];
        monthly.push({
          gross: parseFloat(r.gross) || 0,
          basic: parseFloat(r.basic) || 0,
          hra:   parseFloat(r.hra)   || 0,
          pf:    parseFloat(r.pf)    || 0,
          esi:   parseFloat(r.esi)   || 0,
          tds:   parseFloat(r.tds)   || 0,
          other: parseFloat(r.other) || 0,
          net:   parseFloat(r.net)   || 0,
        });
      } else {
        monthly.push({ gross: 0, basic: 0, hra: 0, pf: 0, esi: 0, tds: 0, other: 0, net: 0 });
      }
    }

    res.json({ data: { monthly } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── 10. IT STATEMENT ────────────────────────────────────────────────────────

router.get('/it-statement/:empId', async (req, res) => {
  try {
    const { empId } = req.params;
    const year = parseInt(req.query.year) || new Date().getFullYear();

    const empCheck = await query(
      `SELECT id FROM users WHERE id = $1 AND company_id = $2`,
      [empId, req.user.company_id]
    );
    if (!empCheck.rows.length) return res.status(404).json({ error: 'Employee not found' });

    // Sum payroll for the FY (Apr–Mar)
    const { rows: pr } = await query(
      `SELECT
         SUM(basic)           AS basic,
         SUM(hra)             AS hra,
         SUM(conveyance)      AS conveyance,
         SUM(medical)         AS medical,
         SUM(special_allowance) AS special_allowances,
         SUM(other_earnings)  AS other_allowances,
         SUM(gross_earnings)  AS gross_income,
         SUM(tds)             AS tds_deducted,
         SUM(pf_employee)     AS pf_employee
       FROM hr_monthly_payroll
       WHERE user_id = $1
         AND (
           (month >= 4 AND year = $2) OR
           (month <= 3 AND year = $2 + 1)
         )`,
      [empId, year]
    );

    // IT declarations for this FY
    const { rows: decl } = await query(
      `SELECT declarations FROM hr_it_declarations
       WHERE user_id = $1 AND financial_year = $2`,
      [empId, year]
    );
    const d = decl.length ? decl[0].declarations : {};

    const gross = parseFloat(pr[0]?.gross_income) || 0;
    const basic = parseFloat(pr[0]?.basic) || 0;
    const hra   = parseFloat(pr[0]?.hra)   || 0;
    const tds   = parseFloat(pr[0]?.tds_deducted) || 0;
    const pfEmp = parseFloat(pr[0]?.pf_employee)  || 0;

    // HRA exemption (simplified: 40% of basic for non-metro)
    const hraExemption = Math.min(hra, basic * 0.40);

    // Standard deduction under new regime: ₹75,000
    const stdDeduction = 75000;

    // Chapter VI-A (only applies under old regime — we'll compute but present)
    const d80C = Math.min(
      Object.entries(d)
        .filter(([k]) => ['PPF','ELSS Mutual Funds','LIC Premium','NSC','Tuition Fees',
                          'Home Loan Principal','Tax Saver FD','EPF (Employee)','ULIP','SSY (Sukanya Samriddhi)']
          .includes(k))
        .reduce((s, [, v]) => s + (parseFloat(v) || 0), 0),
      150000
    );
    const d80D   = Math.min(Object.entries(d).filter(([k]) => ['Self & Family Premium','Parents Premium'].includes(k)).reduce((s,[,v])=>s+(parseFloat(v)||0),0), 25000);
    const d80E   = parseFloat(d['Education Loan Interest'] || 0);
    const dNPS   = Math.min(parseFloat(d['NPS 80CCD(1B)'] || 0), 50000);
    const dOther = (parseFloat(d['80G (Donations)'] || 0)) + (parseFloat(d['80TTA (Savings Interest)'] || 0));
    const totalCh6a = d80C + d80D + d80E + dNPS + dOther;

    // Taxable income (new regime — no Ch.VI deductions except std deduction)
    const taxableIncome = Math.max(0, gross - stdDeduction);
    const tax = computeNewRegimeTax(taxableIncome);
    const cess = Math.round(tax * 0.04);
    const totalTax = tax + cess;
    const balanceTax = totalTax - tds;

    res.json({
      data: {
        basic:               parseFloat(pr[0]?.basic) || 0,
        hra:                 hra,
        special_allowances:  parseFloat(pr[0]?.special_allowances) || 0,
        other_allowances:    parseFloat(pr[0]?.other_allowances) || 0,
        bonus:               0,
        gross_income:        gross,
        hra_exemption:       hraExemption,
        lta:                 0,
        total_exemptions:    hraExemption,
        income_after_exemptions: gross - hraExemption,
        professional_tax:    0,
        deduction_80c:       d80C,
        deduction_80d:       d80D,
        deduction_80e:       d80E,
        deduction_nps:       dNPS,
        total_ch6a:          totalCh6a,
        taxable_income:      taxableIncome,
        tax_on_income:       tax,
        surcharge:           0,
        cess:                cess,
        rebate_87a:          0,
        total_tax:           totalTax,
        tds_deducted:        tds,
        balance_tax:         balanceTax,
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── 11. IT DECLARATION ──────────────────────────────────────────────────────

router.get('/it-declaration/:empId', async (req, res) => {
  try {
    const { empId } = req.params;
    const year = parseInt(req.query.year) || new Date().getFullYear();

    const { rows } = await query(
      `SELECT declarations FROM hr_it_declarations
       WHERE user_id = $1 AND company_id = $2 AND financial_year = $3`,
      [empId, req.user.company_id, year]
    );

    res.json({ data: rows.length ? rows[0].declarations : {} });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/it-declaration/:empId', async (req, res) => {
  try {
    const { empId } = req.params;
    const { declarations } = req.body;
    const year = parseInt(req.query.year) || new Date().getFullYear();

    const { rows } = await query(
      `INSERT INTO hr_it_declarations (company_id, user_id, financial_year, declarations)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, financial_year) DO UPDATE
         SET declarations = $4, updated_at = NOW()
       RETURNING *`,
      [req.user.company_id, empId, year, JSON.stringify(declarations || {})]
    );

    res.json({ data: rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── 12. LOAN STATEMENT ──────────────────────────────────────────────────────

router.get('/loan-statement/:empId', async (req, res) => {
  try {
    const { empId } = req.params;

    const empCheck = await query(
      `SELECT id FROM users WHERE id = $1 AND company_id = $2`,
      [empId, req.user.company_id]
    );
    if (!empCheck.rows.length) return res.status(404).json({ error: 'Employee not found' });

    const { rows } = await query(
      `SELECT id, loan_type, amount, reason, requested_date AS disbursement_date,
              emi_amount, emi_months, balance_amount, repaid_amount,
              status, disbursed_date,
              CASE WHEN emi_amount > 0 THEN CEIL(amount / emi_amount) ELSE 0 END AS total_emis
       FROM hr_loans
       WHERE user_id = $1 AND company_id = $2 AND status = 'approved'
       ORDER BY requested_date DESC`,
      [empId, req.user.company_id]
    );

    // Build repayment schedule for each loan
    const loans = rows.map(loan => {
      const schedule = [];
      const emi    = parseFloat(loan.emi_amount) || 0;
      const total  = parseFloat(loan.amount) || 0;
      const repaid = parseFloat(loan.repaid_amount) || 0;
      const start  = loan.disbursed_date ? new Date(loan.disbursed_date) : new Date(loan.disbursement_date);

      let balance = total;
      let monthsPaid = emi > 0 ? Math.floor(repaid / emi) : 0;

      for (let i = 0; i < Math.max(parseInt(loan.total_emis), monthsPaid + 1) && i < 60; i++) {
        const d = new Date(start);
        d.setMonth(d.getMonth() + i + 1);
        const monthLabel = d.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
        const payment = Math.min(emi, balance);
        balance = Math.max(0, balance - payment);
        schedule.push({
          month:     monthLabel,
          emi:       payment,
          principal: payment,
          interest:  0,
          balance:   balance,
          status:    i < monthsPaid ? 'Paid' : 'Pending',
        });
        if (balance <= 0) break;
      }

      return {
        id:                loan.id,
        loan_type:         loan.loan_type || 'Loan/Advance',
        loan_no:           loan.id.slice(0, 8).toUpperCase(),
        amount:            total,
        disbursement_date: loan.disbursement_date,
        paid:              repaid,
        emi_amount:        emi,
        schedule,
      };
    });

    res.json({ data: loans });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── 13. PAY ITEM GROUPS ─────────────────────────────────────────────────────

router.get('/pay-item-groups', async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT * FROM hr_pay_item_groups
       WHERE company_id = $1 ORDER BY type, name`,
      [req.user.company_id]
    );
    res.json({ data: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/pay-item-groups', async (req, res) => {
  try {
    const { name, type, description } = req.body;
    if (!name) return res.status(400).json({ error: 'name required' });

    const { rows } = await query(
      `INSERT INTO hr_pay_item_groups (company_id, name, type, description)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [req.user.company_id, name, type || 'Earning', description || null]
    );
    res.status(201).json({ data: rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ error: 'Group name already exists' });
    res.status(500).json({ error: err.message });
  }
});

router.put('/pay-item-groups/:id', async (req, res) => {
  try {
    const { name, type, description } = req.body;
    const { rows } = await query(
      `UPDATE hr_pay_item_groups SET name=$1, type=$2, description=$3
       WHERE id=$4 AND company_id=$5 RETURNING *`,
      [name, type, description, req.params.id, req.user.company_id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json({ data: rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/pay-item-groups/:id', async (req, res) => {
  try {
    await query(
      `DELETE FROM hr_pay_item_groups WHERE id=$1 AND company_id=$2`,
      [req.params.id, req.user.company_id]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── 14. PAYROLL REPOSITORY ──────────────────────────────────────────────────

router.get('/payroll-repository', async (req, res) => {
  try {
    const year = parseInt(req.query.year) || new Date().getFullYear();

    const { rows } = await query(
      `SELECT month, year,
              COUNT(*)                  AS employee_count,
              MAX(status)               AS status,
              SUM(gross_earnings)       AS gross_total,
              SUM(net_pay)             AS net_total,
              MAX(working_days)         AS working_days,
              MAX(updated_at)           AS finalized_on
       FROM hr_monthly_payroll
       WHERE company_id = $1
         AND ((month >= 1 AND year = $2) OR (year = $2))
       GROUP BY month, year
       ORDER BY year, month`,
      [req.user.company_id, year]
    );

    // Map status: if all are 'paid' → 'Finalized', any 'approved' → 'Processing', else 'Pending'
    const data = rows.map(r => ({
      month:          parseInt(r.month),
      year:           parseInt(r.year),
      employee_count: parseInt(r.employee_count),
      status:         r.status === 'paid' ? 'Finalized' : r.status === 'approved' ? 'Processing' : 'Pending',
      gross_total:    parseFloat(r.gross_total) || 0,
      net_total:      parseFloat(r.net_total)   || 0,
      working_days:   r.working_days,
      finalized_on:   r.finalized_on,
    }));

    res.json({ data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── 15. PAYSLIP TEMPLATES ───────────────────────────────────────────────────

const DEFAULT_TEMPLATES = [
  { name: 'Classic',   description: 'Traditional two-column layout with company logo header', preview_color: '#7C3AED', is_active: true  },
  { name: 'Modern',    description: 'Clean flat design with highlighted net pay section',      preview_color: '#2563EB', is_active: false },
  { name: 'Compact',   description: 'Single page, condensed for low-detail payslips',         preview_color: '#059669', is_active: false },
  { name: 'Detailed',  description: 'Full A4 with detailed breakdowns, annexures supported',   preview_color: '#D97706', is_active: false },
];

router.get('/payslip-templates', async (req, res) => {
  try {
    // Ensure defaults exist
    for (const t of DEFAULT_TEMPLATES) {
      await query(
        `INSERT INTO hr_payslip_templates (company_id, name, description, preview_color, is_active)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (company_id, name) DO NOTHING`,
        [req.user.company_id, t.name, t.description, t.preview_color, t.is_active]
      );
    }

    const { rows } = await query(
      `SELECT * FROM hr_payslip_templates WHERE company_id=$1 ORDER BY created_at`,
      [req.user.company_id]
    );
    res.json({ data: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/payslip-templates/:id/activate', async (req, res) => {
  try {
    // Deactivate all, then activate the selected one
    await query(
      `UPDATE hr_payslip_templates SET is_active=FALSE WHERE company_id=$1`,
      [req.user.company_id]
    );
    const { rows } = await query(
      `UPDATE hr_payslip_templates SET is_active=TRUE WHERE id=$1 AND company_id=$2 RETURNING *`,
      [req.params.id, req.user.company_id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Template not found' });
    res.json({ data: rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
