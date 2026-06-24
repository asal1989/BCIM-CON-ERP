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

// ─── 16. CHEQUE / CASH STATEMENT ────────────────────────────────────────────

router.get('/cheque-cash-statement', async (req, res) => {
  try {
    const { month, year } = req.query;
    if (!month || !year) return res.status(400).json({ error: 'month and year required' });

    const { rows } = await query(
      `SELECT p.id, u.employee_code, u.name,
              dep.name AS department,
              p.payment_mode,
              ep.cheque_no,
              p.net_pay,
              p.status
       FROM hr_monthly_payroll p
       JOIN users u ON u.id = p.user_id
       LEFT JOIN employee_profiles ep ON ep.user_id = u.id
       LEFT JOIN hr_departments dep ON dep.id = ep.department_id
       WHERE p.company_id = $1 AND p.month = $2 AND p.year = $3
         AND p.payment_mode IN ('cheque','cash')
       ORDER BY p.payment_mode, u.name`,
      [req.user.company_id, parseInt(month), parseInt(year)]
    );

    res.json({ data: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── 17. SALARY REVISION ANALYTICS ──────────────────────────────────────────

router.get('/salary-revision-analytics', async (req, res) => {
  try {
    const year = parseInt(req.query.year) || new Date().getFullYear();

    // Overall summary
    const sumQ = await query(
      `SELECT COUNT(DISTINCT u.id) AS total_employees,
              COUNT(es.id) FILTER (WHERE EXTRACT(YEAR FROM es.effective_from) = $2) AS total_revised,
              AVG(CASE WHEN prev.ctc_annual > 0
                       THEN (es.ctc_annual - prev.ctc_annual) / prev.ctc_annual * 100
                       END) AS avg_hike_pct,
              AVG(es.ctc_annual) AS avg_revised_ctc
       FROM users u
       LEFT JOIN hr_employee_salaries es ON es.user_id = u.id
       LEFT JOIN LATERAL (
         SELECT ctc_annual FROM hr_employee_salaries s2
         WHERE s2.user_id = u.id AND s2.effective_from < es.effective_from
         ORDER BY s2.effective_from DESC LIMIT 1
       ) prev ON true
       WHERE u.company_id = $1 AND u.is_active = TRUE AND u.role = 'employee'`,
      [req.user.company_id, year]
    );

    // CTC band distribution (all active employees, latest salary)
    const bandQ = await query(
      `WITH latest AS (
         SELECT DISTINCT ON (user_id) ctc_annual
         FROM hr_employee_salaries
         WHERE company_id = $1
         ORDER BY user_id, effective_from DESC
       )
       SELECT
         CASE
           WHEN ctc_annual < 300000   THEN 'Below ₹3L'
           WHEN ctc_annual < 600000   THEN '₹3L – ₹6L'
           WHEN ctc_annual < 1000000  THEN '₹6L – ₹10L'
           WHEN ctc_annual < 1500000  THEN '₹10L – ₹15L'
           WHEN ctc_annual < 2500000  THEN '₹15L – ₹25L'
           ELSE 'Above ₹25L'
         END AS band,
         COUNT(*) AS count
       FROM latest
       GROUP BY band
       ORDER BY MIN(ctc_annual)`,
      [req.user.company_id]
    );

    const totalEmp = parseInt(bandQ.rows.reduce((s, r) => s + parseInt(r.count), 0)) || 1;
    const bands = bandQ.rows.map(r => ({
      band: r.band,
      count: parseInt(r.count),
      pct: ((parseInt(r.count) / totalEmp) * 100).toFixed(1),
    }));

    // Monthly revision count for the year
    const monthlyQ = await query(
      `SELECT EXTRACT(MONTH FROM effective_from) AS mo, COUNT(*) AS count
       FROM hr_employee_salaries
       WHERE company_id = $1 AND EXTRACT(YEAR FROM effective_from) = $2
       GROUP BY mo ORDER BY mo`,
      [req.user.company_id, year]
    );
    const MONTH_LABELS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const monthly = MONTH_LABELS.map((label, i) => {
      const rec = monthlyQ.rows.find(r => parseInt(r.mo) === i + 1);
      return { month_label: label, count: rec ? parseInt(rec.count) : 0 };
    });

    // Recent revisions (top 20)
    const recentQ = await query(
      `SELECT es.id, u.name, u.employee_code, dep.name AS department,
              es.ctc_annual AS revised_ctc, es.effective_from AS effective_date,
              prev.ctc_annual AS previous_ctc
       FROM hr_employee_salaries es
       JOIN users u ON u.id = es.user_id
       LEFT JOIN employee_profiles ep ON ep.user_id = u.id
       LEFT JOIN hr_departments dep ON dep.id = ep.department_id
       LEFT JOIN LATERAL (
         SELECT ctc_annual FROM hr_employee_salaries s2
         WHERE s2.user_id = es.user_id AND s2.effective_from < es.effective_from
         ORDER BY s2.effective_from DESC LIMIT 1
       ) prev ON true
       WHERE es.company_id = $1 AND EXTRACT(YEAR FROM es.effective_from) = $2
       ORDER BY es.effective_from DESC LIMIT 20`,
      [req.user.company_id, year]
    );

    const s = sumQ.rows[0];
    res.json({
      data: {
        summary: {
          total_employees: parseInt(s.total_employees) || 0,
          total_revised:   parseInt(s.total_revised)   || 0,
          avg_hike_pct:    parseFloat(s.avg_hike_pct)  || 0,
          avg_revised_ctc: parseFloat(s.avg_revised_ctc) || 0,
        },
        bands,
        monthly,
        top_earners: recentQ.rows,
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── 18. STOP SALARY PROCESSING ──────────────────────────────────────────────

const initStopSalary = async () => {
  await query(`
    CREATE TABLE IF NOT EXISTS hr_salary_stops (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id  UUID REFERENCES companies(id) ON DELETE CASCADE,
      user_id     UUID REFERENCES users(id) ON DELETE CASCADE,
      reason      TEXT NOT NULL,
      remarks     TEXT,
      added_by    UUID REFERENCES users(id),
      created_at  TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(user_id, company_id)
    )
  `);
};
initStopSalary().catch(() => {});

router.get('/stop-salary', async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT ss.id, u.employee_code, u.name,
              dep.name AS department,
              ss.reason, ss.remarks,
              ab.name AS added_by,
              ss.created_at
       FROM hr_salary_stops ss
       JOIN users u ON u.id = ss.user_id
       LEFT JOIN employee_profiles ep ON ep.user_id = u.id
       LEFT JOIN hr_departments dep ON dep.id = ep.department_id
       LEFT JOIN users ab ON ab.id = ss.added_by
       WHERE ss.company_id = $1
       ORDER BY ss.created_at DESC`,
      [req.user.company_id]
    );
    res.json({ data: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/stop-salary', async (req, res) => {
  try {
    const { employee_id, reason, remarks } = req.body;
    if (!employee_id || !reason) return res.status(400).json({ error: 'employee_id and reason required' });

    const { rows } = await query(
      `INSERT INTO hr_salary_stops (company_id, user_id, reason, remarks, added_by)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (user_id, company_id) DO UPDATE SET reason=$3, remarks=$4, added_by=$5, created_at=NOW()
       RETURNING *`,
      [req.user.company_id, employee_id, reason, remarks || null, req.user.id]
    );
    res.status(201).json({ data: rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/stop-salary/:id', async (req, res) => {
  try {
    await query(`DELETE FROM hr_salary_stops WHERE id=$1 AND company_id=$2`, [req.params.id, req.user.company_id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── 19. ARREARS ─────────────────────────────────────────────────────────────

const initArrears = async () => {
  await query(`
    CREATE TABLE IF NOT EXISTS hr_arrears (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id  UUID REFERENCES companies(id) ON DELETE CASCADE,
      user_id     UUID REFERENCES users(id) ON DELETE CASCADE,
      month       INT NOT NULL,
      year        INT NOT NULL,
      amount      NUMERIC(12,2) NOT NULL DEFAULT 0,
      description TEXT,
      updated_by  UUID REFERENCES users(id),
      updated_at  TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(user_id, month, year)
    )
  `);
};
initArrears().catch(() => {});

router.get('/arrears', async (req, res) => {
  try {
    const { month, year } = req.query;
    if (!month || !year) return res.status(400).json({ error: 'month and year required' });

    const { rows } = await query(
      `SELECT u.id, u.employee_code, u.name,
              dep.name AS department,
              COALESCE(a.amount, 0) AS amount,
              a.description
       FROM users u
       LEFT JOIN employee_profiles ep ON ep.user_id = u.id
       LEFT JOIN hr_departments dep ON dep.id = ep.department_id
       LEFT JOIN hr_arrears a ON a.user_id = u.id AND a.month = $2 AND a.year = $3 AND a.company_id = $1
       WHERE u.company_id = $1 AND u.is_active = TRUE AND u.role = 'employee'
       ORDER BY dep.name NULLS LAST, u.name`,
      [req.user.company_id, parseInt(month), parseInt(year)]
    );

    res.json({ data: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/arrears', async (req, res) => {
  try {
    const { month, year, entries } = req.body;
    if (!month || !year || !Array.isArray(entries)) return res.status(400).json({ error: 'month, year, entries required' });

    for (const e of entries) {
      if (!e.employee_id) continue;
      await query(
        `INSERT INTO hr_arrears (company_id, user_id, month, year, amount, updated_by)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (user_id, month, year) DO UPDATE SET amount=$5, updated_by=$6, updated_at=NOW()`,
        [req.user.company_id, e.employee_id, month, year, parseFloat(e.amount) || 0, req.user.id]
      );
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── 20. OVERTIME REGISTER ───────────────────────────────────────────────────

const initOvertime = async () => {
  await query(`
    CREATE TABLE IF NOT EXISTS hr_overtime (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id  UUID REFERENCES companies(id) ON DELETE CASCADE,
      user_id     UUID REFERENCES users(id) ON DELETE CASCADE,
      month       INT NOT NULL,
      year        INT NOT NULL,
      ot_hours    NUMERIC(6,2) NOT NULL DEFAULT 0,
      ot_rate     NUMERIC(10,2) NOT NULL DEFAULT 0,
      updated_by  UUID REFERENCES users(id),
      updated_at  TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(user_id, month, year)
    )
  `);
};
initOvertime().catch(() => {});

router.get('/overtime', async (req, res) => {
  try {
    const { month, year } = req.query;
    if (!month || !year) return res.status(400).json({ error: 'month and year required' });

    const { rows } = await query(
      `SELECT u.id, u.employee_code, u.name,
              dep.name AS department,
              COALESCE(ot.ot_hours, 0) AS ot_hours,
              COALESCE(ot.ot_rate, 0)  AS ot_rate
       FROM users u
       LEFT JOIN employee_profiles ep ON ep.user_id = u.id
       LEFT JOIN hr_departments dep ON dep.id = ep.department_id
       LEFT JOIN hr_overtime ot ON ot.user_id = u.id AND ot.month = $2 AND ot.year = $3 AND ot.company_id = $1
       WHERE u.company_id = $1 AND u.is_active = TRUE AND u.role = 'employee'
       ORDER BY dep.name NULLS LAST, u.name`,
      [req.user.company_id, parseInt(month), parseInt(year)]
    );

    res.json({ data: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/overtime', async (req, res) => {
  try {
    const { month, year, entries } = req.body;
    if (!month || !year || !Array.isArray(entries)) return res.status(400).json({ error: 'month, year, entries required' });

    for (const e of entries) {
      if (!e.employee_id) continue;
      await query(
        `INSERT INTO hr_overtime (company_id, user_id, month, year, ot_hours, ot_rate, updated_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (user_id, month, year) DO UPDATE SET ot_hours=$5, ot_rate=$6, updated_by=$7, updated_at=NOW()`,
        [req.user.company_id, e.employee_id, month, year, parseFloat(e.ot_hours) || 0, parseFloat(e.ot_rate) || 0, req.user.id]
      );
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── 21. PF YTD STATEMENT ────────────────────────────────────────────────────

router.get('/pf-ytd/:empId', async (req, res) => {
  try {
    const { empId } = req.params;
    const year = parseInt(req.query.year) || new Date().getFullYear();

    const empCheck = await query(`SELECT id FROM users WHERE id=$1 AND company_id=$2`, [empId, req.user.company_id]);
    if (!empCheck.rows.length) return res.status(404).json({ error: 'Employee not found' });

    const fy = fyMonths(year);
    const monthly = [];

    for (const { month, year: my } of fy) {
      const { rows } = await query(
        `SELECT basic, pf_employee, pf_employer, gross_earnings AS gross
         FROM hr_monthly_payroll
         WHERE user_id=$1 AND month=$2 AND year=$3`,
        [empId, month, my]
      );
      if (rows.length) {
        const r = rows[0];
        const pfWages  = Math.min(parseFloat(r.basic) || 0, 15000);
        const empPF    = parseFloat(r.pf_employee) || 0;
        const erTotal  = parseFloat(r.pf_employer) || 0;
        const eps      = Math.round(pfWages * 0.0833);
        const epf      = Math.max(0, erTotal - eps);
        monthly.push({ pf_wages: pfWages, pf_employee: empPF, pf_employer: erTotal, eps_employer: eps, epf_employer: epf });
      } else {
        monthly.push({ pf_wages: 0, pf_employee: 0, pf_employer: 0, eps_employer: 0, epf_employer: 0 });
      }
    }

    res.json({ data: { monthly } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── 22. REIMBURSEMENT STATEMENT ─────────────────────────────────────────────

router.get('/reimbursement-statement/:empId', async (req, res) => {
  try {
    const { empId } = req.params;
    const year = parseInt(req.query.year) || new Date().getFullYear();

    const empCheck = await query(`SELECT id FROM users WHERE id=$1 AND company_id=$2`, [empId, req.user.company_id]);
    if (!empCheck.rows.length) return res.status(404).json({ error: 'Employee not found' });

    // Pull from hr_expense_claims table (existing)
    const { rows } = await query(
      `SELECT ec.id, ec.claim_date, ec.category, ec.description, ec.amount, ec.status, ec.approved_date AS paid_date
       FROM hr_expense_claims ec
       WHERE ec.user_id = $1 AND ec.company_id = $2
         AND EXTRACT(YEAR FROM ec.claim_date) = $3
       ORDER BY ec.claim_date DESC`,
      [empId, req.user.company_id, year]
    ).catch(() => ({ rows: [] }));

    res.json({ data: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── 23. CTC PAYSLIP ─────────────────────────────────────────────────────────

router.get('/ctc-payslip/:empId', async (req, res) => {
  try {
    const { empId } = req.params;
    const { month, year } = req.query;
    if (!month || !year) return res.status(400).json({ error: 'month and year required' });

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

    const prQ = await query(
      `SELECT * FROM hr_monthly_payroll WHERE user_id=$1 AND month=$2 AND year=$3`,
      [empId, parseInt(month), parseInt(year)]
    );
    if (!prQ.rows.length) return res.json({ data: null });

    const p = prQ.rows[0];
    const emp = empQ.rows[0];

    const gross      = parseFloat(p.gross_earnings) || 0;
    const pfEmp      = parseFloat(p.pf_employee)    || 0;
    const pfEr       = parseFloat(p.pf_employer)    || 0;
    const esiEmp     = parseFloat(p.esi_employee)   || 0;
    const esiEr      = parseFloat(p.esi_employer)   || 0;
    const pt         = parseFloat(p.pt)             || 0;
    const tds        = parseFloat(p.tds)            || 0;
    const basic      = parseFloat(p.basic)          || 0;
    const gratuity   = Math.round(basic / 26 * 15 / 12); // monthly gratuity accrual

    const totalDeductions   = parseFloat(p.total_deductions) || 0;
    const totalEmployerCost = pfEr + esiEr + gratuity;
    const ctc               = gross + totalEmployerCost;

    res.json({
      data: {
        ...emp,
        employee_code:    p.employee_code || emp.employee_code,
        working_days:     p.working_days,
        paid_days:        p.paid_days,
        basic,
        hra:              parseFloat(p.hra) || 0,
        conveyance:       parseFloat(p.conveyance) || 0,
        medical:          parseFloat(p.medical) || 0,
        special_allowance:parseFloat(p.special_allowance) || 0,
        other_earnings:   parseFloat(p.other_earnings) || 0,
        gross_earnings:   gross,
        pf_employee:      pfEmp,
        pf_employer:      pfEr,
        esi_employee:     esiEmp,
        esi_employer:     esiEr,
        pt,
        tds,
        gratuity,
        total_deductions: totalDeductions,
        net_pay:          parseFloat(p.net_pay) || 0,
        total_employer_cost: totalEmployerCost,
        ctc,
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── 24. ACTIVE EMPLOYEES LIST (helper for dropdowns) ────────────────────────

router.get('/employees/active', async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT u.id, u.name, u.employee_code,
              dep.name AS department
       FROM users u
       LEFT JOIN employee_profiles ep ON ep.user_id = u.id
       LEFT JOIN hr_departments dep ON dep.id = ep.department_id
       WHERE u.company_id = $1 AND u.is_active = TRUE AND u.role = 'employee'
       ORDER BY u.name`,
      [req.user.company_id]
    );
    res.json({ data: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// COMPLIANCE ROUTES
// ═══════════════════════════════════════════════════════════════════════════

// ─── COMPLIANCE STATUS DASHBOARD ────────────────────────────────────────────
router.get('/compliance/status', async (req, res) => {
  try {
    // Returns a simple status map — extend with real due-date logic as needed
    const m = new Date().getMonth() + 1;
    const y = new Date().getFullYear();
    // Check if payroll was run this month
    const { rows: prRows } = await query(
      `SELECT COUNT(*) AS cnt FROM hr_monthly_payroll WHERE company_id=$1 AND month=$2 AND year=$3`,
      [req.user.company_id, m, y]
    );
    const hasPayroll = parseInt(prRows[0].cnt) > 0;
    res.json({
      data: {
        pf:               hasPayroll ? 'ok'  : 'due',
        esi:              hasPayroll ? 'ok'  : 'due',
        professional_tax: hasPayroll ? 'ok'  : 'due',
        tds:              hasPayroll ? 'ok'  : 'na',
        gratuity:         'na',
        bonus:            'na',
        lwf:              'na',
        minimum_wages:    hasPayroll ? 'ok'  : 'na',
        statutory_regs:   'na',
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── PF COMPLIANCE ───────────────────────────────────────────────────────────
router.get('/compliance/pf', async (req, res) => {
  try {
    const { month, year } = req.query;
    if (!month || !year) return res.status(400).json({ error: 'month and year required' });

    const { rows } = await query(
      `SELECT u.id, u.employee_code, u.name,
              ep.uan,
              COALESCE(p.basic, 0) AS gross_wages,
              LEAST(COALESCE(p.basic, 0), 15000) AS pf_wages,
              COALESCE(p.pf_employee, 0)  AS pf_employee,
              COALESCE(p.pf_employer, 0)  AS pf_employer,
              COALESCE(p.gross_earnings, 0) AS gross_wages_full,
              ROUND(LEAST(COALESCE(p.basic,0),15000)*0.0833) AS eps,
              GREATEST(0, COALESCE(p.pf_employer,0) - ROUND(LEAST(COALESCE(p.basic,0),15000)*0.0833)) AS epf_employer
       FROM hr_monthly_payroll p
       JOIN users u ON u.id = p.user_id
       LEFT JOIN employee_profiles ep ON ep.user_id = u.id
       WHERE p.company_id=$1 AND p.month=$2 AND p.year=$3
         AND (p.pf_employee > 0 OR p.pf_employer > 0)
       ORDER BY u.name`,
      [req.user.company_id, parseInt(month), parseInt(year)]
    );

    res.json({ data: { employees: rows, summary: {} } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── ESI COMPLIANCE ──────────────────────────────────────────────────────────
router.get('/compliance/esi', async (req, res) => {
  try {
    const { month, year } = req.query;
    if (!month || !year) return res.status(400).json({ error: 'month and year required' });

    const { rows } = await query(
      `SELECT u.id, u.employee_code, u.name,
              ep.ip_no,
              COALESCE(p.gross_earnings, 0) AS gross_salary,
              COALESCE(p.gross_earnings, 0) AS esi_wages,
              COALESCE(p.esi_employee, 0)   AS esi_employee,
              COALESCE(p.esi_employer, 0)   AS esi_employer
       FROM hr_monthly_payroll p
       JOIN users u ON u.id = p.user_id
       LEFT JOIN employee_profiles ep ON ep.user_id = u.id
       WHERE p.company_id=$1 AND p.month=$2 AND p.year=$3
         AND (p.esi_employee > 0 OR p.esi_employer > 0)
       ORDER BY u.name`,
      [req.user.company_id, parseInt(month), parseInt(year)]
    );

    res.json({ data: { employees: rows } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── PROFESSIONAL TAX ─────────────────────────────────────────────────────────
router.get('/compliance/professional-tax', async (req, res) => {
  try {
    const { month, year } = req.query;
    if (!month || !year) return res.status(400).json({ error: 'month and year required' });

    const { rows } = await query(
      `SELECT u.id, u.employee_code, u.name,
              dep.name AS department,
              COALESCE(p.gross_earnings, 0) AS gross_salary,
              COALESCE(p.pt, 0) AS pt
       FROM hr_monthly_payroll p
       JOIN users u ON u.id = p.user_id
       LEFT JOIN employee_profiles ep ON ep.user_id = u.id
       LEFT JOIN hr_departments dep ON dep.id = ep.department_id
       WHERE p.company_id=$1 AND p.month=$2 AND p.year=$3
       ORDER BY dep.name NULLS LAST, u.name`,
      [req.user.company_id, parseInt(month), parseInt(year)]
    );

    res.json({ data: { employees: rows } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── TDS COMPLIANCE ───────────────────────────────────────────────────────────
router.get('/compliance/tds', async (req, res) => {
  try {
    const { quarter, year } = req.query;
    if (!quarter || !year) return res.status(400).json({ error: 'quarter and year required' });

    const qtr = parseInt(quarter);
    const yr  = parseInt(year);
    // Q1=Apr-Jun, Q2=Jul-Sep, Q3=Oct-Dec, Q4=Jan-Mar
    const monthRanges = { 1:[4,5,6], 2:[7,8,9], 3:[10,11,12], 4:[1,2,3] };
    const months = monthRanges[qtr] || [];
    const qtrYear = qtr === 4 ? yr + 1 : yr;

    const { rows } = await query(
      `SELECT u.id, u.employee_code, u.name,
              ep.pan,
              SUM(p.gross_earnings) AS gross_salary,
              50000 AS standard_deduction,
              0 AS chapter_vi_a,
              GREATEST(0, SUM(p.gross_earnings) - 50000) AS taxable_income,
              SUM(p.tds) AS tds_deducted,
              SUM(p.tds) AS tds_annual,
              FALSE AS form16_issued
       FROM hr_monthly_payroll p
       JOIN users u ON u.id = p.user_id
       LEFT JOIN employee_profiles ep ON ep.user_id = u.id
       WHERE p.company_id=$1
         AND p.month = ANY($2) AND p.year=$3
       GROUP BY u.id, u.employee_code, u.name, ep.pan
       ORDER BY u.name`,
      [req.user.company_id, months, qtrYear]
    );

    res.json({ data: { employees: rows } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GRATUITY ─────────────────────────────────────────────────────────────────
router.get('/compliance/gratuity', async (req, res) => {
  try {
    const year = parseInt(req.query.year) || new Date().getFullYear();
    const asOf = new Date(year, 11, 31); // Dec 31 of the year

    const { rows } = await query(
      `SELECT u.id, u.employee_code, u.name,
              ep.date_of_joining AS doj,
              EXTRACT(EPOCH FROM ($2::date - ep.date_of_joining::date)) / (365.25*86400) AS years_of_service,
              COALESCE(es.basic_monthly, 0) AS last_basic,
              ROUND(
                COALESCE(es.basic_monthly,0) * 15 *
                GREATEST(0, EXTRACT(EPOCH FROM ($2::date - ep.date_of_joining::date)) / (365.25*86400))
                / 26
              ) AS gratuity_amount
       FROM users u
       JOIN employee_profiles ep ON ep.user_id = u.id
       LEFT JOIN LATERAL (
         SELECT basic_monthly FROM hr_employee_salaries
         WHERE user_id = u.id AND company_id = u.company_id
         ORDER BY effective_from DESC LIMIT 1
       ) es ON true
       WHERE u.company_id=$1 AND u.is_active=TRUE AND u.role='employee'
         AND ep.date_of_joining IS NOT NULL
       ORDER BY years_of_service DESC`,
      [req.user.company_id, asOf.toISOString().split('T')[0]]
    );

    const result = rows.map(r => ({
      ...r,
      years_of_service: parseFloat(r.years_of_service) || 0,
      gratuity_amount: Math.min(parseFloat(r.gratuity_amount) || 0, 2000000),
      eligible: (parseFloat(r.years_of_service) || 0) >= 5,
    }));

    res.json({ data: result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── BONUS ────────────────────────────────────────────────────────────────────
router.get('/compliance/bonus', async (req, res) => {
  try {
    const year = parseInt(req.query.year) || new Date().getFullYear();
    // FY Apr-Mar
    const months = [4,5,6,7,8,9,10,11,12,1,2,3];
    const y1 = year, y2 = year + 1;

    const { rows } = await query(
      `SELECT u.id, u.employee_code, u.name,
              SUM(p.basic) AS annual_basic,
              COUNT(p.id) AS months_worked,
              COUNT(p.id)*26 AS days_worked
       FROM users u
       LEFT JOIN hr_monthly_payroll p ON p.user_id = u.id
         AND ((p.year=$2 AND p.month >= 4) OR (p.year=$3 AND p.month <= 3))
       WHERE u.company_id=$1 AND u.is_active=TRUE AND u.role='employee'
       GROUP BY u.id, u.employee_code, u.name
       ORDER BY u.name`,
      [req.user.company_id, y1, y2]
    );

    const result = rows.map(r => {
      const annualBasic  = parseFloat(r.annual_basic) || 0;
      const bonusWages   = Math.min(annualBasic, 7000 * 12);
      const eligible     = annualBasic / 12 <= 21000;
      const bonusAmount  = eligible ? Math.round(bonusWages * 0.0833) : 0;
      return { ...r, annual_basic: annualBasic, bonus_wages: bonusWages, bonus_amount: bonusAmount, eligible };
    });

    res.json({ data: result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── LWF ──────────────────────────────────────────────────────────────────────
router.get('/compliance/lwf', async (req, res) => {
  try {
    const { period, year } = req.query;

    const { rows } = await query(
      `SELECT u.id, u.employee_code, u.name,
              dep.name AS department,
              COALESCE(es.basic_monthly, 0) + COALESCE(es.hra_monthly, 0) AS gross_salary,
              6  AS lwf_employee,
              12 AS lwf_employer
       FROM users u
       LEFT JOIN employee_profiles ep ON ep.user_id = u.id
       LEFT JOIN hr_departments dep ON dep.id = ep.department_id
       LEFT JOIN LATERAL (
         SELECT basic_monthly, hra_monthly FROM hr_employee_salaries
         WHERE user_id = u.id AND company_id = u.company_id
         ORDER BY effective_from DESC LIMIT 1
       ) es ON true
       WHERE u.company_id=$1 AND u.is_active=TRUE AND u.role='employee'
       ORDER BY dep.name NULLS LAST, u.name`,
      [req.user.company_id]
    );

    res.json({ data: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── MINIMUM WAGES ────────────────────────────────────────────────────────────
router.get('/compliance/minimum-wages', async (req, res) => {
  try {
    const { month, year } = req.query;
    if (!month || !year) return res.status(400).json({ error: 'month and year required' });

    // Minimum wages by category (Maharashtra 2024 — update as needed)
    const MW = { Unskilled: 11136, 'Semi-skilled': 12364, Skilled: 13657, 'Highly Skilled': 15270 };

    const { rows } = await query(
      `SELECT u.id, u.employee_code, u.name,
              dep.name AS department,
              ep.wage_category,
              p.basic AS actual_basic
       FROM hr_monthly_payroll p
       JOIN users u ON u.id = p.user_id
       LEFT JOIN employee_profiles ep ON ep.user_id = u.id
       LEFT JOIN hr_departments dep ON dep.id = ep.department_id
       WHERE p.company_id=$1 AND p.month=$2 AND p.year=$3
       ORDER BY dep.name NULLS LAST, u.name`,
      [req.user.company_id, parseInt(month), parseInt(year)]
    );

    const result = rows.map(r => {
      const category = r.wage_category || 'Unskilled';
      const minWage  = MW[category] || MW.Unskilled;
      const actual   = parseFloat(r.actual_basic) || 0;
      return {
        ...r,
        wage_category: category,
        min_wage: minWage,
        actual_basic: actual,
        compliance_status: actual >= minWage ? 'ok' : 'violation',
      };
    });

    res.json({ data: result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── STATUTORY REGISTERS ──────────────────────────────────────────────────────
router.get('/compliance/statutory-registers', async (req, res) => {
  try {
    const { register, month, year } = req.query;
    if (!register) return res.status(400).json({ error: 'register type required' });

    let rows = [];

    if (register === 'form_c' || register === 'muster_roll') {
      // Register of Adult Workers / Muster Roll
      const result = await query(
        `SELECT u.employee_code AS "Emp Code", u.name AS "Name",
                ep.date_of_joining AS "DOJ",
                dep.name AS "Department", des.name AS "Designation",
                'Adult' AS "Category",
                ep.father_name AS "Father/Husband Name"
         FROM users u
         LEFT JOIN employee_profiles ep ON ep.user_id = u.id
         LEFT JOIN hr_departments dep ON dep.id = ep.department_id
         LEFT JOIN hr_designations des ON des.id = ep.designation_id
         WHERE u.company_id=$1 AND u.is_active=TRUE AND u.role='employee'
         ORDER BY u.name`,
        [req.user.company_id]
      );
      rows = result.rows;
    } else if (register === 'form_14') {
      // Register of Wages
      const result = await query(
        `SELECT u.employee_code AS "Emp Code", u.name AS "Name",
                p.basic AS "Basic", p.hra AS "HRA",
                p.gross_earnings AS "Gross",
                p.total_deductions AS "Deductions",
                p.net_pay AS "Net Pay",
                p.working_days AS "Days Worked"
         FROM hr_monthly_payroll p
         JOIN users u ON u.id = p.user_id
         WHERE p.company_id=$1 AND p.month=$2 AND p.year=$3
         ORDER BY u.name`,
        [req.user.company_id, parseInt(month)||new Date().getMonth()+1, parseInt(year)||new Date().getFullYear()]
      );
      rows = result.rows;
    } else if (register === 'overtime') {
      const result = await query(
        `SELECT u.employee_code AS "Emp Code", u.name AS "Name",
                ot.ot_hours AS "OT Hours", ot.ot_rate AS "Rate/hr",
                ROUND(ot.ot_hours * ot.ot_rate) AS "OT Amount"
         FROM hr_overtime ot
         JOIN users u ON u.id = ot.user_id
         WHERE ot.company_id=$1 AND ot.month=$2 AND ot.year=$3
         ORDER BY u.name`,
        [req.user.company_id, parseInt(month)||new Date().getMonth()+1, parseInt(year)||new Date().getFullYear()]
      );
      rows = result.rows;
    } else {
      // Generic employee list for other registers
      const result = await query(
        `SELECT u.employee_code AS "Emp Code", u.name AS "Name",
                dep.name AS "Department", des.name AS "Designation",
                ep.date_of_joining AS "Date of Joining"
         FROM users u
         LEFT JOIN employee_profiles ep ON ep.user_id = u.id
         LEFT JOIN hr_departments dep ON dep.id = ep.department_id
         LEFT JOIN hr_designations des ON des.id = ep.designation_id
         WHERE u.company_id=$1 AND u.is_active=TRUE AND u.role='employee'
         ORDER BY u.name`,
        [req.user.company_id]
      );
      rows = result.rows;
    }

    res.json({ data: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── PHASE 2-4: EMPLOYEE INFORMATION & ADMIN ────────────────────────────────

// ── Position History ─────────────────────────────────────────────────────────
router.get('/position-history/:empId', async (req, res) => {
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS hr_position_history (
        id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id    UUID REFERENCES companies(id) ON DELETE CASCADE,
        user_id       UUID REFERENCES users(id) ON DELETE CASCADE,
        effective_date DATE NOT NULL,
        designation   TEXT,
        department    TEXT,
        location      TEXT,
        grade         TEXT,
        reason        TEXT,
        remarks       TEXT,
        change_type   TEXT DEFAULT 'Promotion',
        created_by    UUID REFERENCES users(id),
        created_at    TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    const { rows } = await query(
      `SELECT ph.*, u.name AS created_by_name
       FROM hr_position_history ph
       LEFT JOIN users u ON u.id = ph.created_by
       WHERE ph.user_id = $1 AND ph.company_id = $2
       ORDER BY ph.effective_date DESC`,
      [req.params.empId, req.user.company_id]
    );
    res.json({ data: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/position-history/:empId', async (req, res) => {
  try {
    const { effective_date, designation, department, location, grade, reason, remarks, change_type } = req.body;
    const { rows } = await query(
      `INSERT INTO hr_position_history (company_id, user_id, effective_date, designation, department, location, grade, reason, remarks, change_type, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [req.user.company_id, req.params.empId, effective_date, designation, department, location, grade, reason, remarks, change_type || 'Promotion', req.user.id]
    );
    res.json({ data: rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/position-history/:empId/:id', async (req, res) => {
  try {
    await query(`DELETE FROM hr_position_history WHERE id=$1 AND company_id=$2`, [req.params.id, req.user.company_id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Employee Segments ─────────────────────────────────────────────────────────
router.get('/segments', async (req, res) => {
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS hr_employee_segments (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id  UUID REFERENCES companies(id) ON DELETE CASCADE,
        name        TEXT NOT NULL,
        description TEXT,
        filter_json JSONB DEFAULT '{}',
        emp_count   INT DEFAULT 0,
        created_by  UUID REFERENCES users(id),
        created_at  TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(company_id, name)
      )
    `);
    const { rows } = await query(
      `SELECT * FROM hr_employee_segments WHERE company_id=$1 ORDER BY name`,
      [req.user.company_id]
    );
    res.json({ data: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/segments', async (req, res) => {
  try {
    const { name, description, filter_json } = req.body;
    const { rows } = await query(
      `INSERT INTO hr_employee_segments (company_id, name, description, filter_json, created_by)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [req.user.company_id, name, description, JSON.stringify(filter_json || {}), req.user.id]
    );
    res.json({ data: rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/segments/:id', async (req, res) => {
  try {
    const { name, description, filter_json } = req.body;
    const { rows } = await query(
      `UPDATE hr_employee_segments SET name=$1, description=$2, filter_json=$3 WHERE id=$4 AND company_id=$5 RETURNING *`,
      [name, description, JSON.stringify(filter_json || {}), req.params.id, req.user.company_id]
    );
    res.json({ data: rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/segments/:id', async (req, res) => {
  try {
    await query(`DELETE FROM hr_employee_segments WHERE id=$1 AND company_id=$2`, [req.params.id, req.user.company_id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Employee Filters ──────────────────────────────────────────────────────────
router.get('/filters', async (req, res) => {
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS hr_employee_filters (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id  UUID REFERENCES companies(id) ON DELETE CASCADE,
        name        TEXT NOT NULL,
        filter_json JSONB DEFAULT '{}',
        is_shared   BOOLEAN DEFAULT FALSE,
        created_by  UUID REFERENCES users(id),
        created_at  TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    const { rows } = await query(
      `SELECT f.*, u.name AS owner FROM hr_employee_filters f
       LEFT JOIN users u ON u.id = f.created_by
       WHERE f.company_id=$1 ORDER BY f.name`,
      [req.user.company_id]
    );
    res.json({ data: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/filters', async (req, res) => {
  try {
    const { name, filter_json, is_shared } = req.body;
    const { rows } = await query(
      `INSERT INTO hr_employee_filters (company_id, name, filter_json, is_shared, created_by)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [req.user.company_id, name, JSON.stringify(filter_json || {}), is_shared || false, req.user.id]
    );
    res.json({ data: rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/filters/:id', async (req, res) => {
  try {
    const { name, filter_json, is_shared } = req.body;
    const { rows } = await query(
      `UPDATE hr_employee_filters SET name=$1, filter_json=$2, is_shared=$3 WHERE id=$4 AND company_id=$5 RETURNING *`,
      [name, JSON.stringify(filter_json || {}), is_shared, req.params.id, req.user.company_id]
    );
    res.json({ data: rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/filters/:id', async (req, res) => {
  try {
    await query(`DELETE FROM hr_employee_filters WHERE id=$1 AND company_id=$2`, [req.params.id, req.user.company_id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Bulletin Board ────────────────────────────────────────────────────────────
router.get('/bulletins', async (req, res) => {
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS hr_bulletins (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id  UUID REFERENCES companies(id) ON DELETE CASCADE,
        title       TEXT NOT NULL,
        body        TEXT,
        category    TEXT DEFAULT 'General',
        priority    TEXT DEFAULT 'Normal' CHECK (priority IN ('Normal','High','Urgent')),
        expiry_date DATE,
        is_active   BOOLEAN DEFAULT TRUE,
        created_by  UUID REFERENCES users(id),
        created_at  TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    const { rows } = await query(
      `SELECT b.*, u.name AS author FROM hr_bulletins b
       LEFT JOIN users u ON u.id = b.created_by
       WHERE b.company_id=$1 ORDER BY b.created_at DESC`,
      [req.user.company_id]
    );
    res.json({ data: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/bulletins', async (req, res) => {
  try {
    const { title, body, category, priority, expiry_date } = req.body;
    const { rows } = await query(
      `INSERT INTO hr_bulletins (company_id, title, body, category, priority, expiry_date, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [req.user.company_id, title, body, category || 'General', priority || 'Normal', expiry_date || null, req.user.id]
    );
    res.json({ data: rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/bulletins/:id', async (req, res) => {
  try {
    const { title, body, category, priority, expiry_date, is_active } = req.body;
    const { rows } = await query(
      `UPDATE hr_bulletins SET title=$1,body=$2,category=$3,priority=$4,expiry_date=$5,is_active=$6
       WHERE id=$7 AND company_id=$8 RETURNING *`,
      [title, body, category, priority, expiry_date || null, is_active, req.params.id, req.user.company_id]
    );
    res.json({ data: rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/bulletins/:id', async (req, res) => {
  try {
    await query(`DELETE FROM hr_bulletins WHERE id=$1 AND company_id=$2`, [req.params.id, req.user.company_id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Contract Details ──────────────────────────────────────────────────────────
router.get('/contracts', async (req, res) => {
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS hr_contracts (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id      UUID REFERENCES companies(id) ON DELETE CASCADE,
        firm_name       TEXT NOT NULL,
        nature_of_work  TEXT,
        contractor_code TEXT,
        start_date      DATE,
        end_date        DATE,
        emp_count       INT DEFAULT 0,
        pf_code         TEXT,
        esi_code        TEXT,
        status          TEXT DEFAULT 'Active' CHECK (status IN ('Active','Expired','Terminated')),
        created_by      UUID REFERENCES users(id),
        created_at      TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    const { rows } = await query(
      `SELECT * FROM hr_contracts WHERE company_id=$1 ORDER BY created_at DESC`,
      [req.user.company_id]
    );
    res.json({ data: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/contracts', async (req, res) => {
  try {
    const { firm_name, nature_of_work, contractor_code, start_date, end_date, emp_count, pf_code, esi_code, status } = req.body;
    const { rows } = await query(
      `INSERT INTO hr_contracts (company_id, firm_name, nature_of_work, contractor_code, start_date, end_date, emp_count, pf_code, esi_code, status, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [req.user.company_id, firm_name, nature_of_work, contractor_code, start_date || null, end_date || null, emp_count || 0, pf_code, esi_code, status || 'Active', req.user.id]
    );
    res.json({ data: rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/contracts/:id', async (req, res) => {
  try {
    const { firm_name, nature_of_work, contractor_code, start_date, end_date, emp_count, pf_code, esi_code, status } = req.body;
    const { rows } = await query(
      `UPDATE hr_contracts SET firm_name=$1,nature_of_work=$2,contractor_code=$3,start_date=$4,end_date=$5,emp_count=$6,pf_code=$7,esi_code=$8,status=$9
       WHERE id=$10 AND company_id=$11 RETURNING *`,
      [firm_name, nature_of_work, contractor_code, start_date || null, end_date || null, emp_count || 0, pf_code, esi_code, status, req.params.id, req.user.company_id]
    );
    res.json({ data: rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/contracts/:id', async (req, res) => {
  try {
    await query(`DELETE FROM hr_contracts WHERE id=$1 AND company_id=$2`, [req.params.id, req.user.company_id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Letter Templates ──────────────────────────────────────────────────────────
router.get('/letter-templates', async (req, res) => {
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS hr_letter_templates_v2 (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id  UUID REFERENCES companies(id) ON DELETE CASCADE,
        name        TEXT NOT NULL,
        type        TEXT DEFAULT 'Appointment',
        body        TEXT,
        variables   TEXT[],
        is_active   BOOLEAN DEFAULT TRUE,
        created_by  UUID REFERENCES users(id),
        created_at  TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(company_id, name)
      )
    `);
    const { rows } = await query(
      `SELECT * FROM hr_letter_templates_v2 WHERE company_id=$1 ORDER BY name`,
      [req.user.company_id]
    );
    res.json({ data: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/letter-templates', async (req, res) => {
  try {
    const { name, type, body, variables } = req.body;
    const { rows } = await query(
      `INSERT INTO hr_letter_templates_v2 (company_id, name, type, body, variables, created_by)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [req.user.company_id, name, type || 'Appointment', body, variables || [], req.user.id]
    );
    res.json({ data: rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/letter-templates/:id', async (req, res) => {
  try {
    const { name, type, body, variables, is_active } = req.body;
    const { rows } = await query(
      `UPDATE hr_letter_templates_v2 SET name=$1,type=$2,body=$3,variables=$4,is_active=$5
       WHERE id=$6 AND company_id=$7 RETURNING *`,
      [name, type, body, variables, is_active, req.params.id, req.user.company_id]
    );
    res.json({ data: rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/letter-templates/:id', async (req, res) => {
  try {
    await query(`DELETE FROM hr_letter_templates_v2 WHERE id=$1 AND company_id=$2`, [req.params.id, req.user.company_id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Company Policies ──────────────────────────────────────────────────────────
router.get('/policies', async (req, res) => {
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS hr_company_policies (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id  UUID REFERENCES companies(id) ON DELETE CASCADE,
        name        TEXT NOT NULL,
        category    TEXT DEFAULT 'General',
        description TEXT,
        file_url    TEXT,
        is_active   BOOLEAN DEFAULT TRUE,
        published_at TIMESTAMPTZ,
        created_by  UUID REFERENCES users(id),
        created_at  TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    const { rows } = await query(
      `SELECT p.*, u.name AS uploaded_by_name FROM hr_company_policies p
       LEFT JOIN users u ON u.id = p.created_by
       WHERE p.company_id=$1 ORDER BY p.created_at DESC`,
      [req.user.company_id]
    );
    res.json({ data: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/policies', async (req, res) => {
  try {
    const { name, category, description } = req.body;
    const { rows } = await query(
      `INSERT INTO hr_company_policies (company_id, name, category, description, created_by)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [req.user.company_id, name, category || 'General', description, req.user.id]
    );
    res.json({ data: rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/policies/:id', async (req, res) => {
  try {
    await query(`DELETE FROM hr_company_policies WHERE id=$1 AND company_id=$2`, [req.params.id, req.user.company_id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Identity Verification ─────────────────────────────────────────────────────
router.get('/identity-verification', async (req, res) => {
  try {
    const { search, status } = req.query;
    let sql = `
      SELECT u.id, u.name, u.employee_code,
             e.pan_number, e.aadhaar_number AS aadhaar,
             e.bank_account_number AS bank_account,
             COALESCE(iv.pan_status, 'Pending')     AS pan_status,
             COALESCE(iv.aadhaar_status, 'Pending') AS aadhaar_status,
             COALESCE(iv.bank_status, 'Pending')    AS bank_status,
             iv.id AS iv_id
      FROM users u
      LEFT JOIN hr_employee_details e ON e.user_id = u.id
      LEFT JOIN (
        SELECT DISTINCT ON (user_id) * FROM hr_identity_verifications
        ORDER BY user_id, updated_at DESC
      ) iv ON iv.user_id = u.id
      WHERE u.company_id=$1 AND u.role='employee' AND u.is_active=TRUE`;
    const params = [req.user.company_id];
    if (search) { params.push(`%${search}%`); sql += ` AND (u.name ILIKE $${params.length} OR u.employee_code ILIKE $${params.length})`; }
    sql += ` ORDER BY u.name`;
    const { rows } = await query(sql, params);
    res.json({ data: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch('/identity-verification/:id', async (req, res) => {
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS hr_identity_verifications (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id  UUID REFERENCES companies(id) ON DELETE CASCADE,
        user_id     UUID REFERENCES users(id) ON DELETE CASCADE,
        pan_status      TEXT DEFAULT 'Pending',
        aadhaar_status  TEXT DEFAULT 'Pending',
        bank_status     TEXT DEFAULT 'Pending',
        updated_by  UUID REFERENCES users(id),
        updated_at  TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    const { status } = req.body;
    // Determine which field to update based on request
    const { field } = req.body; // 'pan_status' | 'aadhaar_status' | 'bank_status'
    const validFields = ['pan_status', 'aadhaar_status', 'bank_status'];
    if (!validFields.includes(field)) {
      // Legacy: update all to status
      await query(
        `INSERT INTO hr_identity_verifications (company_id, user_id, pan_status, aadhaar_status, bank_status, updated_by)
         VALUES ($1,$2,$3,$3,$3,$4)
         ON CONFLICT (user_id) DO UPDATE SET pan_status=$3, aadhaar_status=$3, bank_status=$3, updated_by=$4, updated_at=NOW()`,
        [req.user.company_id, req.params.id, status, req.user.id]
      );
    } else {
      await query(
        `INSERT INTO hr_identity_verifications (company_id, user_id, ${field}, updated_by)
         VALUES ($1,$2,$3,$4)
         ON CONFLICT (user_id) DO UPDATE SET ${field}=$3, updated_by=$4, updated_at=NOW()`,
        [req.user.company_id, req.params.id, status, req.user.id]
      );
    }
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Mass Communication ────────────────────────────────────────────────────────
router.get('/mass-communication', async (req, res) => {
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS hr_mass_communications (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id  UUID REFERENCES companies(id) ON DELETE CASCADE,
        subject     TEXT NOT NULL,
        body        TEXT,
        channel     TEXT DEFAULT 'Notification' CHECK (channel IN ('Notification','Email','Both')),
        recipient_type TEXT DEFAULT 'All',
        recipient_ids  UUID[],
        sent_count  INT DEFAULT 0,
        status      TEXT DEFAULT 'Sent',
        sent_by     UUID REFERENCES users(id),
        sent_at     TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    const { rows } = await query(
      `SELECT mc.*, u.name AS sender FROM hr_mass_communications mc
       LEFT JOIN users u ON u.id = mc.sent_by
       WHERE mc.company_id=$1 ORDER BY mc.sent_at DESC`,
      [req.user.company_id]
    );
    res.json({ data: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/mass-communication', async (req, res) => {
  try {
    const { subject, body, channel, recipient_type } = req.body;
    const countResult = await query(
      `SELECT COUNT(*) FROM users WHERE company_id=$1 AND role='employee' AND is_active=TRUE`,
      [req.user.company_id]
    );
    const sent_count = parseInt(countResult.rows[0].count);
    const { rows } = await query(
      `INSERT INTO hr_mass_communications (company_id, subject, body, channel, recipient_type, sent_count, sent_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [req.user.company_id, subject, body, channel || 'Notification', recipient_type || 'All', sent_count, req.user.id]
    );
    res.json({ data: rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Data Drive ────────────────────────────────────────────────────────────────
router.get('/data-drive', async (req, res) => {
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS hr_data_drives (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id  UUID REFERENCES companies(id) ON DELETE CASCADE,
        drive_type  TEXT NOT NULL CHECK (drive_type IN ('Aadhaar','Bank Details','PAN','Vaccination')),
        title       TEXT NOT NULL,
        deadline    DATE,
        response_count INT DEFAULT 0,
        total_emp   INT DEFAULT 0,
        status      TEXT DEFAULT 'Active',
        created_by  UUID REFERENCES users(id),
        created_at  TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    const { rows } = await query(
      `SELECT dd.*, u.name AS created_by_name FROM hr_data_drives dd
       LEFT JOIN users u ON u.id = dd.created_by
       WHERE dd.company_id=$1 ORDER BY dd.created_at DESC`,
      [req.user.company_id]
    );
    res.json({ data: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/data-drive', async (req, res) => {
  try {
    const { drive_type, title, deadline } = req.body;
    const countResult = await query(
      `SELECT COUNT(*) FROM users WHERE company_id=$1 AND role='employee' AND is_active=TRUE`,
      [req.user.company_id]
    );
    const total_emp = parseInt(countResult.rows[0].count);
    const { rows } = await query(
      `INSERT INTO hr_data_drives (company_id, drive_type, title, deadline, total_emp, created_by)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [req.user.company_id, drive_type, title, deadline || null, total_emp, req.user.id]
    );
    res.json({ data: rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/data-drive/:id', async (req, res) => {
  try {
    await query(`DELETE FROM hr_data_drives WHERE id=$1 AND company_id=$2`, [req.params.id, req.user.company_id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Separation ───────────────────────────────────────────────────────────────
router.get('/separation/:empId', async (req, res) => {
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS hr_separation (
        id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id        UUID REFERENCES companies(id) ON DELETE CASCADE,
        employee_id       UUID NOT NULL,
        resignation_date  DATE,
        last_working_day  DATE,
        reason            TEXT,
        remarks           TEXT,
        clearance_status  TEXT DEFAULT 'Pending',
        created_at        TIMESTAMPTZ DEFAULT NOW(),
        updated_at        TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(company_id, employee_id)
      )
    `);
    const { rows } = await query(
      `SELECT * FROM hr_separation WHERE company_id=$1 AND employee_id=$2 LIMIT 1`,
      [req.user.company_id, req.params.empId]
    );
    res.json({ data: rows[0] || null });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/separation/:empId', async (req, res) => {
  try {
    const { resignation_date, last_working_day, reason, remarks, clearance_status } = req.body;
    const { rows } = await query(
      `INSERT INTO hr_separation (company_id, employee_id, resignation_date, last_working_day, reason, remarks, clearance_status)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (company_id, employee_id) DO UPDATE
         SET resignation_date=$3, last_working_day=$4, reason=$5, remarks=$6,
             clearance_status=COALESCE($7, hr_separation.clearance_status), updated_at=NOW()
       RETURNING *`,
      [req.user.company_id, req.params.empId, resignation_date, last_working_day, reason, remarks, clearance_status || 'Pending']
    );
    res.json({ data: rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Bulk Document Upload ──────────────────────────────────────────────────────
router.get('/bulk-document-upload/history', async (req, res) => {
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS hr_bulk_document_uploads (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id  UUID REFERENCES companies(id) ON DELETE CASCADE,
        file_name   TEXT,
        doc_type    TEXT,
        total       INT DEFAULT 0,
        success     INT DEFAULT 0,
        failed      INT DEFAULT 0,
        status      TEXT DEFAULT 'Completed',
        created_at  TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    const { rows } = await query(
      `SELECT * FROM hr_bulk_document_uploads WHERE company_id=$1 ORDER BY created_at DESC LIMIT 50`,
      [req.user.company_id]
    );
    res.json({ data: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/bulk-document-upload', async (req, res) => {
  try {
    const file_name = req.files?.documents?.[0]?.originalname || req.body.file_name || 'upload.zip';
    const doc_type  = req.body.doc_type || 'Other';
    const { rows } = await query(
      `INSERT INTO hr_bulk_document_uploads (company_id, file_name, doc_type, total, success, failed, status)
       VALUES ($1,$2,$3,0,0,0,'Completed') RETURNING *`,
      [req.user.company_id, file_name, doc_type]
    );
    res.json({ data: rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Bulk Photo Upload ─────────────────────────────────────────────────────────
router.get('/bulk-photo-upload/history', async (req, res) => {
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS hr_bulk_photo_uploads (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id  UUID REFERENCES companies(id) ON DELETE CASCADE,
        file_name   TEXT,
        total       INT DEFAULT 0,
        success     INT DEFAULT 0,
        failed      INT DEFAULT 0,
        status      TEXT DEFAULT 'Completed',
        created_at  TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    const { rows } = await query(
      `SELECT * FROM hr_bulk_photo_uploads WHERE company_id=$1 ORDER BY created_at DESC LIMIT 50`,
      [req.user.company_id]
    );
    res.json({ data: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/bulk-photo-upload', async (req, res) => {
  try {
    const file_name = req.files?.photos?.[0]?.originalname || req.body.file_name || 'photos.zip';
    const { rows } = await query(
      `INSERT INTO hr_bulk_photo_uploads (company_id, file_name, total, success, failed, status)
       VALUES ($1,$2,0,0,0,'Completed') RETURNING *`,
      [req.user.company_id, file_name]
    );
    res.json({ data: rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
