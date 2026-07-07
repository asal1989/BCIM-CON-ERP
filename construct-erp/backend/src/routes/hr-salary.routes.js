// src/routes/hr-salary.routes.js
// Salary structures, component templates, employee salary assignment
const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const { query } = require('../config/database');
const { runSchemaInit } = require('../utils/schemaInit');

router.use(authenticate);
router.use(authorize('super_admin', 'admin', 'hr_admin', 'hr_manager'));

// ─── Auto-create tables ───────────────────────────────────────────────────────
const initTables = async () => {
  await query(`
    CREATE TABLE IF NOT EXISTS hr_salary_structures (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id UUID REFERENCES companies(id),
      name TEXT NOT NULL,
      is_active BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS hr_salary_components (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      structure_id UUID REFERENCES hr_salary_structures(id) ON DELETE CASCADE,
      component_name TEXT NOT NULL,
      component_type TEXT NOT NULL,
      calc_type TEXT DEFAULT 'fixed',
      amount NUMERIC(12,2) DEFAULT 0,
      pct NUMERIC(5,2) DEFAULT 0,
      is_taxable BOOLEAN DEFAULT TRUE,
      sort_order INT DEFAULT 0
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS hr_employee_salaries (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID REFERENCES users(id),
      structure_id UUID REFERENCES hr_salary_structures(id),
      ctc_annual NUMERIC(14,2),
      basic NUMERIC(12,2),
      hra NUMERIC(12,2),
      conveyance NUMERIC(12,2),
      medical NUMERIC(12,2),
      special_allowance NUMERIC(12,2),
      other_allowance NUMERIC(12,2),
      gross_monthly NUMERIC(12,2),
      pf_applicable BOOLEAN DEFAULT TRUE,
      esi_applicable BOOLEAN DEFAULT TRUE,
      pt_applicable BOOLEAN DEFAULT TRUE,
      effective_from DATE NOT NULL,
      effective_to DATE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  // CTC breakup fields (BCIM Salary Structure formula — Basic/VDA driven allowances,
  // employer PF/gratuity, employee PF/PT, net pay). Added via ALTER so existing rows survive.
  const breakupCols = [
    ['vda', 'NUMERIC(12,2) DEFAULT 0'],
    ['lta', 'NUMERIC(12,2) DEFAULT 0'],
    ['education_allowance', 'NUMERIC(12,2) DEFAULT 0'],
    ['washing_allowance', 'NUMERIC(12,2) DEFAULT 0'],
    ['mobile_allowance', 'NUMERIC(12,2) DEFAULT 0'],
    ['project_allowance', 'NUMERIC(12,2) DEFAULT 0'],
    ['accommodation_allowance', 'NUMERIC(12,2) DEFAULT 0'],
    ['food_allowance', 'NUMERIC(12,2) DEFAULT 0'],
    ['transport_allowance', 'NUMERIC(12,2) DEFAULT 0'],
    ['employer_pf', 'NUMERIC(12,2) DEFAULT 0'],
    ['employee_pf', 'NUMERIC(12,2) DEFAULT 0'],
    ['gratuity', 'NUMERIC(12,2) DEFAULT 0'],
    ['pt_deduction', 'NUMERIC(12,2) DEFAULT 0'],
    ['net_pay_monthly', 'NUMERIC(12,2) DEFAULT 0'],
    ['mess_deduction', 'NUMERIC(12,2) DEFAULT 0'],
    ['incentive', 'NUMERIC(12,2) DEFAULT 0'],
    ['edli', 'NUMERIC(12,2) DEFAULT 0'],
    ['epf_admin', 'NUMERIC(12,2) DEFAULT 0'],
  ];
  for (const [col, def] of breakupCols) {
    await query(`ALTER TABLE hr_employee_salaries ADD COLUMN IF NOT EXISTS ${col} ${def}`).catch(() => {});
  }
};
runSchemaInit('hr-salary', initTables);

// ─── CTC Breakup calculator — BCIM Salary Structure (from GreytHR extract) ───
// Basic = max(40% of CTC, ₹15,000). Allowances are % of Basic (with caps),
// derived from the BCIM GreytHR salary structure for site staff. Special
// Allowance is the balancing figure: CTC − all fixed earnings − employer costs.
// Employer side: PF 12%, EDLI ₹75, EPF Admin ₹75, Gratuity 4.81%.
// Employee deductions: PF 12% (capped at ₹15,000 PF wage), PT ₹200.
const PF_WAGE_CEILING = 15000;
function calculateCTCBreakup(ctcMonthly, opts = {}) {
  const ctc = parseFloat(ctcMonthly) || 0;
  const ptDeduction = opts.pt_deduction ?? 200;
  const employeeLwf = opts.employee_lwf ?? 0;
  const employerLwf = opts.employer_lwf ?? 0;
  const employerEsic = opts.employer_esic ?? 0;
  const employeeEsic = opts.employee_esic ?? 0;

  // Basic: 40% of CTC, floor ₹15,000
  const basic = Math.round(Math.max(ctc * 0.40, 15000));

  // BCIM allowances (percentages calibrated to GreytHR structure for site staff)
  const hra                    = Math.round(basic * 0.20);                      // 20% of Basic
  const projectAllowance       = Math.round(Math.min(basic * 0.20, 7500));      // 20%, cap ₹7,500
  const accommodationAllowance = Math.round(Math.min(basic * 0.30, 50000));     // 30%
  const foodAllowance          = Math.round(Math.min(basic * 0.1867, 9000));    // ~18.67%, cap ₹9,000
  const transportAllowance     = Math.round(Math.min(basic * 0.0667, 35000));   // ~6.67%
  const lta                    = Math.round(basic * 0.0833);                    // 8.33% (annual LTA/12)
  const medicalAllowance       = Math.round(Math.min(basic * 0.05, 7500));      // 5%, cap ₹7,500
  const mobileAllowance        = Math.round(Math.min(basic * 0.0333, 500));     // cap ₹500
  const incentive              = Math.round(Math.min(basic * 0.1333, 5000));    // ~13.33%, cap ₹5,000
  const washingAllowance       = Math.round(Math.min(basic * 0.01, 2500));      // 1%
  const educationAllowance     = 0;  // not part of BCIM site staff structure

  // PF — capped at ₹15,000 PF wage ceiling
  const pfWage     = Math.min(basic, PF_WAGE_CEILING);
  const employerPf = Math.round(pfWage * 0.12);  // Employer PF 12%
  const employeePf = Math.round(pfWage * 0.12);  // Employee PF 12%
  const edli       = 75;                          // EDLI ₹75/month (fixed)
  const epfAdmin   = 75;                          // EPF Admin ₹75/month (fixed)
  const gratuity   = Math.round(basic * 0.0481);  // Gratuity 4.81%

  const earningsBeforeSpecial = basic + hra + projectAllowance + accommodationAllowance
    + foodAllowance + transportAllowance + lta + medicalAllowance
    + mobileAllowance + incentive + washingAllowance;

  // Special Allowance = CTC − fixed earnings − employer side costs
  const specialAllowance = Math.max(
    0,
    ctc - earningsBeforeSpecial - employerPf - edli - epfAdmin - gratuity - employerEsic - employerLwf
  );

  const grossSalary   = earningsBeforeSpecial + specialAllowance;
  const netPayMonthly = grossSalary - employeePf - ptDeduction - employeeEsic - employeeLwf;

  return {
    ctc_monthly: ctc, ctc_annual: ctc * 12,
    basic, vda: 0, hra,
    project_allowance: projectAllowance, accommodation_allowance: accommodationAllowance,
    food_allowance: foodAllowance, transport_allowance: transportAllowance,
    lta, medical_allowance: medicalAllowance, mobile_allowance: mobileAllowance,
    incentive, washing_allowance: washingAllowance,
    education_allowance: 0, special_allowance: specialAllowance,
    gross_monthly: grossSalary,
    employer_pf: employerPf, edli, epf_admin: epfAdmin, gratuity,
    employer_esic: employerEsic, employer_lwf: employerLwf,
    employee_pf: employeePf, pt_deduction: ptDeduction,
    employee_esic: employeeEsic, employee_lwf: employeeLwf,
    net_pay_monthly: netPayMonthly,
    ctc_reconciled: grossSalary + employerPf + edli + epfAdmin + gratuity + employerEsic + employerLwf,
  };
}

// POST /hr-admin/salary/calculate-breakup — stateless, returns the full
// component breakdown for a given monthly or annual CTC (no DB write).
router.post('/calculate-breakup', async (req, res) => {
  try {
    const { ctc_monthly, ctc_annual, ...overrides } = req.body;
    const monthly = ctc_monthly != null ? parseFloat(ctc_monthly) : parseFloat(ctc_annual || 0) / 12;
    if (!monthly || monthly <= 0) return res.status(400).json({ error: 'ctc_monthly or ctc_annual is required' });
    res.json({ data: calculateCTCBreakup(monthly, overrides) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════
// SALARY STRUCTURES
// ═══════════════════════════════════════════════════════════
router.get('/structures', async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT s.*, json_agg(c ORDER BY c.sort_order) FILTER (WHERE c.id IS NOT NULL) as components
       FROM hr_salary_structures s
       LEFT JOIN hr_salary_components c ON c.structure_id = s.id
       WHERE s.company_id = $1 AND s.is_active = TRUE
       GROUP BY s.id ORDER BY s.name`,
      [req.user.company_id]
    );
    res.json({ data: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/structures', async (req, res) => {
  const client = (await require('../config/database').pool.connect());
  try {
    await client.query('BEGIN');
    const { name, components = [] } = req.body;
    const { rows } = await client.query(
      `INSERT INTO hr_salary_structures (company_id, name) VALUES ($1,$2) RETURNING *`,
      [req.user.company_id, name]
    );
    const structure = rows[0];

    for (let i = 0; i < components.length; i++) {
      const c = components[i];
      await client.query(
        `INSERT INTO hr_salary_components (structure_id, component_name, component_type, calc_type, amount, pct, is_taxable, sort_order)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [structure.id, c.component_name, c.component_type, c.calc_type || 'fixed',
         c.amount || 0, c.pct || 0, c.is_taxable ?? true, i]
      );
    }
    await client.query('COMMIT');
    res.status(201).json({ data: structure });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

router.put('/structures/:id', async (req, res) => {
  const client = (await require('../config/database').pool.connect());
  try {
    await client.query('BEGIN');
    const { name, is_active, components = [] } = req.body;
    const { rows } = await client.query(
      `UPDATE hr_salary_structures SET name=$1, is_active=$2 WHERE id=$3 AND company_id=$4 RETURNING *`,
      [name, is_active ?? true, req.params.id, req.user.company_id]
    );

    if (components.length) {
      await client.query(`DELETE FROM hr_salary_components WHERE structure_id=$1`, [req.params.id]);
      for (let i = 0; i < components.length; i++) {
        const c = components[i];
        await client.query(
          `INSERT INTO hr_salary_components (structure_id, component_name, component_type, calc_type, amount, pct, is_taxable, sort_order)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [req.params.id, c.component_name, c.component_type, c.calc_type || 'fixed',
           c.amount || 0, c.pct || 0, c.is_taxable ?? true, i]
        );
      }
    }
    await client.query('COMMIT');
    res.json({ data: rows[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// ═══════════════════════════════════════════════════════════
// EMPLOYEE SALARY ASSIGNMENT
// ═══════════════════════════════════════════════════════════
router.get('/employee-salaries', async (req, res) => {
  try {
    const { user_id } = req.query;
    let sql = `
      SELECT es.*, u.name as employee_name, u.employee_code, s.name as structure_name
      FROM hr_employee_salaries es
      JOIN users u ON u.id = es.user_id
      LEFT JOIN hr_salary_structures s ON s.id = es.structure_id
      WHERE u.company_id = $1`;
    const params = [req.user.company_id];
    if (user_id) { sql += ` AND es.user_id = $2`; params.push(user_id); }
    sql += ' ORDER BY es.effective_from DESC';
    const { rows } = await query(sql, params);
    res.json({ data: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Get current salary for a specific employee
router.get('/employee-salaries/:userId/current', async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT es.*, s.name as structure_name
       FROM hr_employee_salaries es
       LEFT JOIN hr_salary_structures s ON s.id = es.structure_id
       WHERE es.user_id = $1 AND es.effective_from <= CURRENT_DATE
         AND (es.effective_to IS NULL OR es.effective_to >= CURRENT_DATE)
       ORDER BY es.effective_from DESC LIMIT 1`,
      [req.params.userId]
    );
    res.json({ data: rows[0] || null });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/employee-salaries', async (req, res) => {
  try {
    const {
      user_id, structure_id, ctc_annual, basic, hra, conveyance, medical,
      special_allowance, other_allowance, gross_monthly,
      pf_applicable, esi_applicable, pt_applicable, effective_from, effective_to,
      vda, lta, education_allowance, washing_allowance, mobile_allowance, project_allowance,
      accommodation_allowance, food_allowance, transport_allowance,
      employer_pf, employee_pf, gratuity, pt_deduction, net_pay_monthly, mess_deduction,
      incentive, edli, epf_admin,
    } = req.body;

    // Close any open salary record for this employee
    if (effective_from) {
      await query(
        `UPDATE hr_employee_salaries SET effective_to=$1
         WHERE user_id=$2 AND effective_to IS NULL AND effective_from < $1`,
        [effective_from, user_id]
      );
    }

    const { rows } = await query(
      `INSERT INTO hr_employee_salaries
       (user_id, structure_id, ctc_annual, basic, hra, conveyance, medical,
        special_allowance, other_allowance, gross_monthly,
        pf_applicable, esi_applicable, pt_applicable, effective_from, effective_to,
        vda, lta, education_allowance, washing_allowance, mobile_allowance, project_allowance,
        accommodation_allowance, food_allowance, transport_allowance,
        employer_pf, employee_pf, gratuity, pt_deduction, net_pay_monthly, mess_deduction,
        incentive, edli, epf_admin)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,
               $16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,
               $31,$32,$33) RETURNING *`,
      [user_id, structure_id || null, ctc_annual || null, basic || 0, hra || 0,
       conveyance || 0, medical || 0, special_allowance || 0, other_allowance || 0,
       gross_monthly || 0, pf_applicable ?? true, esi_applicable ?? true,
       pt_applicable ?? true, effective_from, effective_to || null,
       vda || 0, lta || 0, education_allowance || 0, washing_allowance || 0, mobile_allowance || 0, project_allowance || 0,
       accommodation_allowance || 0, food_allowance || 0, transport_allowance || 0,
       employer_pf || 0, employee_pf || 0, gratuity || 0, pt_deduction || 0, net_pay_monthly || 0, mess_deduction || 0,
       incentive || 0, edli || 0, epf_admin || 0]
    );
    res.status(201).json({ data: rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Professional Tax Slabs ────────────────────────────────────────────────────
;(async () => {
  const safe = async sql => { try { await query(sql); } catch(_) {} };
  await safe(`CREATE TABLE IF NOT EXISTS hr_pt_slabs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL,
    state VARCHAR(100) NOT NULL,
    gender VARCHAR(10) DEFAULT 'all' CHECK (gender IN ('all','male','female')),
    salary_from NUMERIC(12,2) NOT NULL DEFAULT 0,
    salary_to NUMERIC(12,2),
    pt_amount NUMERIC(8,2) NOT NULL DEFAULT 0,
    effective_year INT NOT NULL,
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`);
  await safe(`CREATE TABLE IF NOT EXISTS hr_salary_revisions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL,
    user_id UUID NOT NULL REFERENCES users(id),
    old_basic NUMERIC(12,2),
    new_basic NUMERIC(12,2),
    old_ctc NUMERIC(12,2),
    new_ctc NUMERIC(12,2),
    increment_pct NUMERIC(6,2),
    effective_from DATE NOT NULL,
    reason VARCHAR(50) DEFAULT 'annual_review'
      CHECK (reason IN ('annual_review','promotion','correction','market_correction','performance')),
    remarks TEXT,
    approved_by UUID REFERENCES users(id),
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`);
})();

router.get('/pt-slabs', async (req, res) => {
  const { rows } = await query(
    `SELECT * FROM hr_pt_slabs WHERE company_id=$1 ORDER BY state,salary_from`,
    [req.user.company_id]
  );
  res.json({ data: rows });
});

router.post('/pt-slabs', async (req, res) => {
  const { state,gender,salary_from,salary_to,pt_amount,effective_year } = req.body;
  const { rows } = await query(
    `INSERT INTO hr_pt_slabs(company_id,state,gender,salary_from,salary_to,pt_amount,effective_year)
     VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [req.user.company_id,state,gender||'all',salary_from||0,salary_to||null,pt_amount,effective_year||new Date().getFullYear()]
  );
  res.json({ data: rows[0] });
});

router.put('/pt-slabs/:id', async (req, res) => {
  const { state,gender,salary_from,salary_to,pt_amount,effective_year,active } = req.body;
  const { rows } = await query(
    `UPDATE hr_pt_slabs SET state=$1,gender=$2,salary_from=$3,salary_to=$4,pt_amount=$5,effective_year=$6,active=$7
     WHERE id=$8 AND company_id=$9 RETURNING *`,
    [state,gender,salary_from,salary_to||null,pt_amount,effective_year,active,req.params.id,req.user.company_id]
  );
  res.json({ data: rows[0] });
});

router.delete('/pt-slabs/:id', async (req, res) => {
  await query(`DELETE FROM hr_pt_slabs WHERE id=$1 AND company_id=$2`,[req.params.id,req.user.company_id]);
  res.json({ success: true });
});

// ── Salary Revisions ──────────────────────────────────────────────────────────
router.get('/revisions', async (req, res) => {
  const { user_id } = req.query;
  const { rows } = await query(
    `SELECT r.*, u.name AS full_name, u.employee_code AS emp_code, u.department, u.designation
     FROM hr_salary_revisions r
     JOIN users u ON u.id=r.user_id
     WHERE r.company_id=$1 ${user_id ? 'AND r.user_id=$2' : ''}
     ORDER BY r.effective_from DESC`,
    user_id ? [req.user.company_id, user_id] : [req.user.company_id]
  );
  res.json({ data: rows });
});

router.post('/revisions', async (req, res) => {
  const { user_id,old_basic,new_basic,old_ctc,new_ctc,effective_from,reason,remarks } = req.body;
  const inc_pct = old_basic > 0 ? ((new_basic - old_basic) / old_basic * 100).toFixed(2) : 0;
  const { rows } = await query(
    `INSERT INTO hr_salary_revisions(company_id,user_id,old_basic,new_basic,old_ctc,new_ctc,increment_pct,effective_from,reason,remarks,created_by)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
    [req.user.company_id,user_id,old_basic,new_basic,old_ctc||null,new_ctc||null,inc_pct,effective_from,reason||'annual_review',remarks,req.user.id]
  );
  res.json({ data: rows[0] });
});

module.exports = router;

