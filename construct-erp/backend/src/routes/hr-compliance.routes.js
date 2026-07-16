// hr-compliance.routes.js — Statutory Compliance Reports
// Mounted at /api/v1/hr-admin/compliance
// Reports: PF, ESI, PT, Muster Roll, Wage Register, Employment Register, Income Tax

'use strict';
const express = require('express');
const router  = express.Router();
const { authenticate, authorize }  = require('../middleware/auth');
const { query }                    = require('../config/database');

const HR_ROLES = ['super_admin', 'admin', 'hr', 'hr_admin', 'hr_manager'];

router.use(authenticate);
router.use(authorize(...HR_ROLES));

// ─── helpers ──────────────────────────────────────────────────────────────────
const PF_WAGE_CEILING = 15000;   // PF applies on basic up to ₹15,000
const ESI_WAGE_CEILING = 21000;  // ESI applies if gross ≤ ₹21,000

function pfCalc(basic, applicable) {
  if (!applicable) return { emp: 0, eps: 0, epf: 0, admin: 0, total_employer: 0 };
  const wage  = Math.min(parseFloat(basic) || 0, PF_WAGE_CEILING);
  const emp   = Math.round(wage * 0.12);
  const eps   = Math.min(Math.round(wage * 0.0833), 1250);
  const epf   = Math.round(wage * 0.0367);
  const admin = Math.round(wage * 0.005);
  return { emp, eps, epf, admin, total_employer: eps + epf + admin };
}

function esiCalc(gross, applicable) {
  if (!applicable) return { emp: 0, employer: 0 };
  const g = parseFloat(gross) || 0;
  if (g > ESI_WAGE_CEILING) return { emp: 0, employer: 0 };
  return {
    emp:      Math.round(g * 0.0075),
    employer: Math.round(g * 0.0325),
  };
}

function ptCalc(gross, state) {
  const g = parseFloat(gross) || 0;
  // Karnataka slab (most common; can be overridden by state param)
  if (state === 'MH') {
    // Maharashtra slab
    if (g <= 7500)  return 0;
    if (g <= 10000) return 175;
    return 200; // ₹200/month (₹2,500 in Feb else ₹200)
  }
  // Default: Karnataka
  if (g <= 15000)  return 0;
  if (g <= 20000)  return 150;
  return 200;
}

function daysInMonth(month, year) {
  return new Date(year, month, 0).getDate();
}

// ── Base employee + salary join ───────────────────────────────────────────────
const EMP_SALARY_SQL = `
  SELECT
    u.id,
    u.name,
    u.employee_code,
    u.email,
    COALESCE(dep.name,'Unassigned')       AS department,
    COALESCE(des.name,'')                  AS designation,
    ep.date_of_joining,
    ep.date_of_birth,
    ep.gender,
    ep.father_name,
    ep.pan_number,
    ep.aadhaar_number,
    ep.uan_number,
    ep.pf_account_number,
    ep.esi_number,
    ep.bank_name,
    ep.bank_account_number,
    ep.bank_ifsc,
    ep.work_location,
    ep.employment_status,
    ep.employment_type,
    ep.date_of_leaving,
    COALESCE(es.basic,0)          AS basic,
    COALESCE(es.hra,0)            AS hra,
    COALESCE(es.conveyance,0)     AS conveyance,
    COALESCE(es.medical,0)        AS medical,
    COALESCE(es.special_allowance,0) AS special_allowance,
    COALESCE(es.other_allowance,0)   AS other_allowance,
    COALESCE(es.gross_monthly,0)  AS gross_monthly,
    COALESCE(es.pf_applicable,true)  AS pf_applicable,
    COALESCE(es.esi_applicable,true) AS esi_applicable,
    COALESCE(es.pt_applicable,true)  AS pt_applicable
  FROM users u
  LEFT JOIN employee_profiles ep ON ep.user_id = u.id
  LEFT JOIN hr_departments dep ON dep.id = ep.department_id
  LEFT JOIN hr_designations des ON des.id = ep.designation_id
  LEFT JOIN LATERAL (
    SELECT * FROM hr_employee_salaries
    WHERE user_id = u.id
    ORDER BY effective_from DESC NULLS LAST
    LIMIT 1
  ) es ON TRUE
  WHERE u.company_id = $1
    AND u.is_active = TRUE
    AND u.role NOT IN ('super_admin','vendor','customer','contractor')
    AND COALESCE(ep.employment_status,'active') = 'active'
`;

/* ═══════════════════════════════════════════════════════
   GET /compliance/pf-register?month=6&year=2026&dept=
   PF Monthly Register — EPF, EPS, Admin charges
══════════════════════════════════════════════════════ */
router.get('/pf-register', async (req, res) => {
  const { month = new Date().getMonth() + 1, year = new Date().getFullYear(), dept } = req.query;
  try {
    let sql = EMP_SALARY_SQL + ' AND COALESCE(es.pf_applicable,true) = TRUE';
    const params = [req.user.company_id];
    if (dept) { sql += ` AND dep.id = $${params.length + 1}`; params.push(dept); }
    sql += ' ORDER BY dep.name, u.name';

    const { rows } = await query(sql, params);
    let sno = 1;
    const data = rows.map(r => {
      const pf = pfCalc(r.basic, r.pf_applicable);
      return {
        sno: sno++,
        employee_code:    r.employee_code,
        name:             r.name,
        father_name:      r.father_name || '',
        uan_number:       r.uan_number  || '',
        pf_account_number:r.pf_account_number || '',
        aadhaar_number:   r.aadhaar_number || '',
        department:       r.department,
        designation:      r.designation,
        date_of_joining:  r.date_of_joining,
        gross_monthly:    parseFloat(r.gross_monthly),
        basic:            parseFloat(r.basic),
        pf_wage:          Math.min(parseFloat(r.basic), PF_WAGE_CEILING),
        emp_pf:           pf.emp,
        eps:              pf.eps,
        epf_employer:     pf.epf,
        admin_charges:    pf.admin,
        total_employer:   pf.total_employer,
        total_monthly:    pf.emp + pf.total_employer,
      };
    });

    const totals = data.reduce((acc, r) => ({
      basic:          acc.basic + r.basic,
      pf_wage:        acc.pf_wage + r.pf_wage,
      emp_pf:         acc.emp_pf + r.emp_pf,
      eps:            acc.eps + r.eps,
      epf_employer:   acc.epf_employer + r.epf_employer,
      admin_charges:  acc.admin_charges + r.admin_charges,
      total_employer: acc.total_employer + r.total_employer,
      total_monthly:  acc.total_monthly + r.total_monthly,
    }), { basic:0, pf_wage:0, emp_pf:0, eps:0, epf_employer:0, admin_charges:0, total_employer:0, total_monthly:0 });

    res.json({ data, totals, month, year, count: data.length });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ═══════════════════════════════════════════════════════
   GET /compliance/esi-register?month=&year=&dept=
   ESI Monthly Register
══════════════════════════════════════════════════════ */
router.get('/esi-register', async (req, res) => {
  const { month = new Date().getMonth() + 1, year = new Date().getFullYear(), dept } = req.query;
  try {
    let sql = EMP_SALARY_SQL + ` AND COALESCE(es.esi_applicable,true) = TRUE
      AND COALESCE(es.gross_monthly,0) <= ${ESI_WAGE_CEILING}`;
    const params = [req.user.company_id];
    if (dept) { sql += ` AND dep.id = $${params.length + 1}`; params.push(dept); }
    sql += ' ORDER BY dep.name, u.name';

    const { rows } = await query(sql, params);
    let sno = 1;
    const data = rows.map(r => {
      const esi = esiCalc(r.gross_monthly, r.esi_applicable);
      return {
        sno:            sno++,
        employee_code:  r.employee_code,
        name:           r.name,
        esi_number:     r.esi_number || '',
        aadhaar_number: r.aadhaar_number || '',
        department:     r.department,
        designation:    r.designation,
        date_of_joining:r.date_of_joining,
        gross_monthly:  parseFloat(r.gross_monthly),
        emp_esi:        esi.emp,
        employer_esi:   esi.employer,
        total_esi:      esi.emp + esi.employer,
      };
    });

    const totals = data.reduce((acc, r) => ({
      gross_monthly: acc.gross_monthly + r.gross_monthly,
      emp_esi:       acc.emp_esi + r.emp_esi,
      employer_esi:  acc.employer_esi + r.employer_esi,
      total_esi:     acc.total_esi + r.total_esi,
    }), { gross_monthly:0, emp_esi:0, employer_esi:0, total_esi:0 });

    res.json({ data, totals, month, year, count: data.length });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ═══════════════════════════════════════════════════════
   GET /compliance/pt-register?month=&year=&state=KA
   Professional Tax Register
══════════════════════════════════════════════════════ */
router.get('/pt-register', async (req, res) => {
  const { month = new Date().getMonth() + 1, year = new Date().getFullYear(), state = 'KA' } = req.query;
  try {
    let sql = EMP_SALARY_SQL + ' AND COALESCE(es.pt_applicable,true) = TRUE ORDER BY dep.name, u.name';
    const { rows } = await query(sql, [req.user.company_id]);

    let sno = 1;
    const data = rows
      .map(r => {
        const pt = ptCalc(r.gross_monthly, state);
        return {
          sno:            sno++,
          employee_code:  r.employee_code,
          name:           r.name,
          department:     r.department,
          designation:    r.designation,
          pan_number:     r.pan_number || '',
          gross_monthly:  parseFloat(r.gross_monthly),
          pt_amount:      pt,
        };
      })
      .filter(r => r.pt_amount > 0);

    const totals = data.reduce((acc, r) => ({
      gross_monthly: acc.gross_monthly + r.gross_monthly,
      pt_amount:     acc.pt_amount + r.pt_amount,
    }), { gross_monthly:0, pt_amount:0 });

    res.json({ data, totals, month, year, state, count: data.length });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ═══════════════════════════════════════════════════════
   GET /compliance/employment-register?status=active
   Register of Employees — Form 29 / Employment Register
══════════════════════════════════════════════════════ */
router.get('/employment-register', async (req, res) => {
  const { status = 'active' } = req.query;
  try {
    const sql = `
      SELECT
        u.id, u.name, u.employee_code, u.email,
        ep.date_of_joining, ep.date_of_birth, ep.gender, ep.father_name,
        ep.pan_number, ep.aadhaar_number, ep.uan_number, ep.pf_account_number,
        ep.esi_number, ep.bank_account_number, ep.bank_ifsc, ep.bank_name,
        ep.work_location, ep.employment_type, ep.employment_status,
        ep.date_of_leaving, ep.leaving_reason, ep.permanent_address,
        COALESCE(dep.name,'Unassigned') AS department,
        COALESCE(des.name,'')           AS designation,
        COALESCE(des.grade,'')          AS grade
      FROM users u
      LEFT JOIN employee_profiles ep ON ep.user_id = u.id
      LEFT JOIN hr_departments dep ON dep.id = ep.department_id
      LEFT JOIN hr_designations des ON des.id = ep.designation_id
      WHERE u.company_id = $1
        AND u.is_active = TRUE
        AND u.role NOT IN ('super_admin','vendor','customer','contractor')
        AND ($2 = 'all' OR COALESCE(ep.employment_status,'active') = $2)
      ORDER BY dep.name, u.name
    `;
    const { rows } = await query(sql, [req.user.company_id, status]);
    res.json({ data: rows.map((r, i) => ({ sno: i + 1, ...r })), count: rows.length });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ═══════════════════════════════════════════════════════
   GET /compliance/muster-roll?month=&year=
   Monthly Attendance Muster Roll
══════════════════════════════════════════════════════ */
router.get('/muster-roll', async (req, res) => {
  const { month = new Date().getMonth() + 1, year = new Date().getFullYear(), dept } = req.query;
  const m = parseInt(month); const y = parseInt(year);
  const totalDays = daysInMonth(m, y);

  try {
    // Get active employees
    let empSql = `
      SELECT u.id, u.name, u.employee_code,
        COALESCE(dep.name,'Unassigned') AS department
      FROM users u
      LEFT JOIN employee_profiles ep ON ep.user_id = u.id
      LEFT JOIN hr_departments dep ON dep.id = ep.department_id
      WHERE u.company_id = $1
        AND u.is_active = TRUE
        AND u.role NOT IN ('super_admin','vendor','customer','contractor')
        AND COALESCE(ep.employment_status,'active') = 'active'
    `;
    const params = [req.user.company_id];
    if (dept) { empSql += ` AND dep.id = $${params.length + 1}`; params.push(dept); }
    empSql += ' ORDER BY dep.name, u.name';
    const { rows: employees } = await query(empSql, params);

    // Get attendance for this month
    const from = `${y}-${String(m).padStart(2,'0')}-01`;
    const to   = `${y}-${String(m).padStart(2,'0')}-${String(totalDays).padStart(2,'0')}`;
    const { rows: att } = await query(
      `SELECT user_id, attendance_date::TEXT AS date, status, in_time, out_time
       FROM hr_attendance
       WHERE company_id = $1 AND attendance_date BETWEEN $2 AND $3`,
      [req.user.company_id, from, to]
    );

    // Build lookup
    const attMap = {};
    att.forEach(a => {
      if (!attMap[a.user_id]) attMap[a.user_id] = {};
      attMap[a.user_id][a.date] = a;
    });

    // Days array
    const days = Array.from({ length: totalDays }, (_, i) => {
      const d = i + 1;
      const dateStr = `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      const dow = new Date(dateStr).getDay();
      return { day: d, date: dateStr, is_sunday: dow === 0 };
    });

    const data = employees.map((emp, idx) => {
      const empAtt = attMap[emp.id] || {};
      let present = 0, absent = 0, half_day = 0, leave = 0;
      const dailyStatus = days.map(d => {
        const a = empAtt[d.date];
        if (!a) {
          if (d.is_sunday) return 'WO'; // Week Off
          absent++;
          return 'A';
        }
        const s = a.status || 'present';
        if (s === 'present') { present++; return 'P'; }
        if (s === 'half_day') { half_day++; return 'HD'; }
        if (s === 'absent')  { absent++;   return 'A'; }
        if (s === 'leave')   { leave++;    return 'L'; }
        return s.charAt(0).toUpperCase();
      });

      return {
        sno:          idx + 1,
        employee_code: emp.employee_code,
        name:          emp.name,
        department:    emp.department,
        days:          dailyStatus,
        present,
        half_day,
        leave,
        absent,
        total_working: present + half_day * 0.5,
      };
    });

    res.json({ data, days, month: m, year: y, total_days: totalDays, count: data.length });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ═══════════════════════════════════════════════════════
   GET /compliance/wage-register?month=&year=
   Monthly Wage Register
══════════════════════════════════════════════════════ */
router.get('/wage-register', async (req, res) => {
  const { month = new Date().getMonth() + 1, year = new Date().getFullYear(), dept } = req.query;
  try {
    let sql = EMP_SALARY_SQL;
    const params = [req.user.company_id];
    if (dept) { sql += ` AND dep.id = $${params.length + 1}`; params.push(dept); }
    sql += ' ORDER BY dep.name, u.name';
    const { rows } = await query(sql, params);

    let sno = 1;
    const data = rows.map(r => {
      const pf  = pfCalc(r.basic, r.pf_applicable);
      const esi = esiCalc(r.gross_monthly, r.esi_applicable);
      const pt  = ptCalc(r.gross_monthly, 'KA');
      const total_deductions = pf.emp + esi.emp + pt;
      const net_pay = Math.max(0, parseFloat(r.gross_monthly) - total_deductions);
      return {
        sno:            sno++,
        employee_code:  r.employee_code,
        name:           r.name,
        father_name:    r.father_name || '',
        department:     r.department,
        designation:    r.designation,
        bank_account:   r.bank_account_number || '',
        bank_ifsc:      r.bank_ifsc || '',
        bank_name:      r.bank_name || '',
        date_of_joining:r.date_of_joining,
        basic:          parseFloat(r.basic),
        hra:            parseFloat(r.hra),
        conveyance:     parseFloat(r.conveyance),
        medical:        parseFloat(r.medical),
        special_allowance: parseFloat(r.special_allowance),
        other_allowance:   parseFloat(r.other_allowance),
        gross:          parseFloat(r.gross_monthly),
        pf_deduction:   pf.emp,
        esi_deduction:  esi.emp,
        pt_deduction:   pt,
        total_deductions,
        net_pay,
        employer_pf:    pf.total_employer,
        employer_esi:   esi.employer,
      };
    });

    const totals = data.reduce((acc, r) => ({
      basic:          acc.basic + r.basic,
      gross:          acc.gross + r.gross,
      pf_deduction:   acc.pf_deduction + r.pf_deduction,
      esi_deduction:  acc.esi_deduction + r.esi_deduction,
      pt_deduction:   acc.pt_deduction + r.pt_deduction,
      total_deductions: acc.total_deductions + r.total_deductions,
      net_pay:        acc.net_pay + r.net_pay,
      employer_pf:    acc.employer_pf + r.employer_pf,
      employer_esi:   acc.employer_esi + r.employer_esi,
    }), { basic:0,gross:0,pf_deduction:0,esi_deduction:0,pt_deduction:0,total_deductions:0,net_pay:0,employer_pf:0,employer_esi:0 });

    res.json({ data, totals, month, year, count: data.length });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ═══════════════════════════════════════════════════════
   GET /compliance/income-tax-register?year=2026
   Income Tax Register — employee-wise TDS estimate
══════════════════════════════════════════════════════ */
router.get('/income-tax-register', async (req, res) => {
  const { year = new Date().getFullYear() } = req.query;
  // Financial year: Apr (year-1) to Mar (year)
  try {
    const sql = EMP_SALARY_SQL + ' ORDER BY dep.name, u.name';
    const { rows } = await query(sql, [req.user.company_id]);

    let sno = 1;
    const data = rows.map(r => {
      const annualGross = parseFloat(r.gross_monthly) * 12;
      const annualBasic = parseFloat(r.basic) * 12;
      const pf          = pfCalc(r.basic, r.pf_applicable);
      const annualPF    = pf.emp * 12;
      // Standard deduction ₹50,000
      const std_deduction = 50000;
      const taxable_income = Math.max(0, annualGross - annualPF - std_deduction);
      // New regime slabs (FY 2024-25)
      let estimated_tax = 0;
      if (taxable_income > 1500000)       estimated_tax = 150000 + (taxable_income - 1500000) * 0.30;
      else if (taxable_income > 1200000)  estimated_tax = 90000  + (taxable_income - 1200000) * 0.20;
      else if (taxable_income > 900000)   estimated_tax = 45000  + (taxable_income -  900000) * 0.15;
      else if (taxable_income > 600000)   estimated_tax = 15000  + (taxable_income -  600000) * 0.10;
      else if (taxable_income > 300000)   estimated_tax =          (taxable_income -  300000) * 0.05;
      // Rebate u/s 87A — no tax if taxable income ≤ 7 lakh
      if (taxable_income <= 700000) estimated_tax = 0;
      const monthly_tds = Math.round(estimated_tax / 12);

      return {
        sno:              sno++,
        employee_code:    r.employee_code,
        name:             r.name,
        pan_number:       r.pan_number || '',
        department:       r.department,
        designation:      r.designation,
        gross_monthly:    parseFloat(r.gross_monthly),
        annual_gross:     annualGross,
        annual_pf:        annualPF,
        std_deduction,
        taxable_income,
        estimated_annual_tax: Math.round(estimated_tax),
        monthly_tds,
      };
    });

    const totals = data.reduce((acc, r) => ({
      annual_gross:          acc.annual_gross + r.annual_gross,
      taxable_income:        acc.taxable_income + r.taxable_income,
      estimated_annual_tax:  acc.estimated_annual_tax + r.estimated_annual_tax,
      monthly_tds:           acc.monthly_tds + r.monthly_tds,
    }), { annual_gross:0, taxable_income:0, estimated_annual_tax:0, monthly_tds:0 });

    res.json({ data, totals, financial_year: `${parseInt(year) - 1}-${year}`, count: data.length });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ─── init new compliance tables ────────────────────────────────────────────── */
const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];

(async () => {
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS hr_labour_licenses (
        id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id        UUID NOT NULL,
        license_type      TEXT NOT NULL,
        license_name      TEXT,
        license_number    TEXT,
        issuing_authority TEXT,
        issue_date        DATE,
        expiry_date       DATE,
        alert_days        INT DEFAULT 30,
        renewal_cost      NUMERIC(12,2),
        status            TEXT DEFAULT 'active',
        notes             TEXT,
        file_url          TEXT,
        created_by        UUID REFERENCES users(id),
        created_at        TIMESTAMPTZ DEFAULT NOW(),
        updated_at        TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await query(`ALTER TABLE employee_documents ADD COLUMN IF NOT EXISTS expiry_date DATE`);
    await query(`ALTER TABLE employee_documents ADD COLUMN IF NOT EXISTS alert_days INT DEFAULT 30`);
    await query(`ALTER TABLE employee_documents ADD COLUMN IF NOT EXISTS issued_date DATE`);
    await query(`ALTER TABLE employee_documents ADD COLUMN IF NOT EXISTS document_number TEXT`);
  } catch (e) { console.error('[hr-compliance] table init:', e.message); }
})();

/* ═══════════════════════════════════════════════════════
   Labour Licenses CRUD
   GET    /compliance/labour-licenses
   POST   /compliance/labour-licenses
   PUT    /compliance/labour-licenses/:id
   DELETE /compliance/labour-licenses/:id
══════════════════════════════════════════════════════ */
router.get('/labour-licenses', async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT * FROM hr_labour_licenses WHERE company_id = $1 ORDER BY expiry_date NULLS LAST, license_type`,
      [req.user.company_id]
    );
    const today = new Date(); today.setHours(0,0,0,0);
    const data = rows.map(r => {
      const exp = r.expiry_date ? new Date(r.expiry_date) : null;
      const daysLeft = exp ? Math.ceil((exp - today) / 86400000) : null;
      return { ...r, days_remaining: daysLeft, is_expired: daysLeft !== null && daysLeft < 0, expiring_soon: daysLeft !== null && daysLeft >= 0 && daysLeft <= (r.alert_days || 30) };
    });
    res.json({ data, count: data.length });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/labour-licenses', async (req, res) => {
  const { license_type, license_name, license_number, issuing_authority, issue_date, expiry_date, alert_days, renewal_cost, status, notes, file_url } = req.body;
  try {
    const { rows } = await query(
      `INSERT INTO hr_labour_licenses (company_id, license_type, license_name, license_number, issuing_authority, issue_date, expiry_date, alert_days, renewal_cost, status, notes, file_url, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [req.user.company_id, license_type, license_name, license_number, issuing_authority, issue_date||null, expiry_date||null, alert_days||30, renewal_cost||null, status||'active', notes, file_url, req.user.id]
    );
    res.json({ data: rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/labour-licenses/:id', async (req, res) => {
  const { license_type, license_name, license_number, issuing_authority, issue_date, expiry_date, alert_days, renewal_cost, status, notes, file_url } = req.body;
  try {
    const { rows } = await query(
      `UPDATE hr_labour_licenses SET license_type=$1, license_name=$2, license_number=$3, issuing_authority=$4,
         issue_date=$5, expiry_date=$6, alert_days=$7, renewal_cost=$8, status=$9, notes=$10, file_url=$11, updated_at=NOW()
       WHERE id=$12 AND company_id=$13 RETURNING *`,
      [license_type, license_name, license_number, issuing_authority, issue_date||null, expiry_date||null, alert_days||30, renewal_cost||null, status, notes, file_url, req.params.id, req.user.company_id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json({ data: rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/labour-licenses/:id', async (req, res) => {
  try {
    await query(`DELETE FROM hr_labour_licenses WHERE id=$1 AND company_id=$2`, [req.params.id, req.user.company_id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ═══════════════════════════════════════════════════════
   GET  /compliance/document-expiry?filter=all|expiring|expired
   PUT  /compliance/document-expiry/:id
   Employee document expiry tracking
══════════════════════════════════════════════════════ */
router.get('/document-expiry', async (req, res) => {
  const { filter = 'all' } = req.query;
  try {
    const { rows } = await query(
      `SELECT ed.id, ed.doc_type, ed.doc_name, ed.document_number, ed.issued_date,
              ed.expiry_date, ed.alert_days, ed.file_url, ed.uploaded_at,
              u.name AS employee_name, u.employee_code,
              COALESCE(dep.name,'Unassigned') AS department
       FROM employee_documents ed
       JOIN users u ON u.id = ed.user_id
       LEFT JOIN employee_profiles ep ON ep.user_id = u.id
       LEFT JOIN hr_departments dep ON dep.id = ep.department_id
       WHERE u.company_id = $1 AND u.is_active = TRUE
       ORDER BY ed.expiry_date NULLS LAST, u.name`,
      [req.user.company_id]
    );
    const today = new Date(); today.setHours(0,0,0,0);
    const all = rows.map(r => {
      const exp = r.expiry_date ? new Date(r.expiry_date) : null;
      const daysLeft = exp ? Math.ceil((exp - today) / 86400000) : null;
      return { ...r, days_remaining: daysLeft, is_expired: daysLeft !== null && daysLeft < 0, expiring_soon: daysLeft !== null && daysLeft >= 0 && daysLeft <= (r.alert_days || 30) };
    });
    const data = filter === 'expiring' ? all.filter(r => r.expiring_soon && !r.is_expired)
               : filter === 'expired'  ? all.filter(r => r.is_expired)
               : all;
    res.json({ data, count: data.length, total: all.length });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/document-expiry/:id', async (req, res) => {
  const { expiry_date, alert_days, document_number, issued_date } = req.body;
  try {
    const { rows } = await query(
      `UPDATE employee_documents SET expiry_date=$1, alert_days=$2, document_number=$3, issued_date=$4 WHERE id=$5 RETURNING *`,
      [expiry_date||null, alert_days||30, document_number, issued_date||null, req.params.id]
    );
    res.json({ data: rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ═══════════════════════════════════════════════════════
   GET /compliance/compliance-calendar?month=&year=
   Statutory compliance due dates for selected month
══════════════════════════════════════════════════════ */
router.get('/compliance-calendar', async (req, res) => {
  const { month = new Date().getMonth() + 1, year = new Date().getFullYear() } = req.query;
  const m = parseInt(month); const y = parseInt(year);
  const prevM = m === 1 ? 12 : m - 1;
  const prevMonthName = MONTH_NAMES[prevM - 1];

  const tasks = [
    { id:1, category:'TDS',   task:`TDS Challan — ${prevMonthName} salary`,      due_day: 7,  description:'Deposit TDS on salary via TRACES / NSDL challan (Form 281)' },
    { id:2, category:'WAGES', task:`Wage Payment — ${MONTH_NAMES[m-1]}`,         due_day: 7,  description:'Monthly salary disbursement (on or before 7th for ≤1,000 employees, else 10th)' },
    { id:3, category:'PF',    task:`EPF Challan — ${prevMonthName} contribution`, due_day:15,  description:'Employee + Employer PF (EPF+EPS+Admin charges) via EPFO Unified Portal' },
    { id:4, category:'PT',    task:`Prof. Tax — ${prevMonthName} (Karnataka)`,   due_day:20,  description:'Monthly Professional Tax payment to Commercial Taxes Department' },
    { id:5, category:'ESI',   task:`ESI Challan — ${prevMonthName} contribution`, due_day:21, description:'Employee (0.75%) + Employer (3.25%) ESI via ESIC Self-Service Portal' },
  ];
  if (m === 4) {
    tasks.push({ id:6, category:'PF',  task:'PF Annual Return (Form 3A / 6A)',  due_day:30, description:'Annual PF returns for the previous FY on EPFO portal' });
    tasks.push({ id:7, category:'PT',  task:'PT Annual Return — Karnataka',      due_day:30, description:'Annual PT statement and payment to Commercial Taxes Dept' });
  }
  if (m === 7)  tasks.push({ id:8,  category:'TDS', task:'TDS Q1 Return (Form 24Q)',  due_day:31, description:'Quarterly TDS return for April–June' });
  if (m === 10) tasks.push({ id:9,  category:'TDS', task:'TDS Q2 Return (Form 24Q)',  due_day:31, description:'Quarterly TDS return for July–September' });
  if (m === 11) tasks.push({ id:10, category:'ESI', task:'ESI Annual Accident Return (Form 1-B)', due_day:11, description:'Annual return of accidents under ESI Act' });
  if (m === 1)  tasks.push({ id:11, category:'TDS', task:'TDS Q3 Return (Form 24Q)',  due_day:15, description:'Quarterly TDS return for October–December' });

  tasks.sort((a, b) => a.due_day - b.due_day);

  const today = new Date(); today.setHours(0,0,0,0);
  const enriched = tasks.map(t => {
    const due = new Date(y, m - 1, t.due_day);
    const diff = Math.ceil((due - today) / 86400000);
    return { ...t, due_date: due.toISOString().split('T')[0], days_remaining: diff, overdue: diff < 0, due_soon: diff >= 0 && diff <= 3 };
  });
  res.json({ data: enriched, month: m, year: y, month_name: MONTH_NAMES[m - 1] });
});

/* ═══════════════════════════════════════════════════════
   GET /compliance/departments  (for filter dropdowns)
══════════════════════════════════════════════════════ */
router.get('/departments', async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT id, name FROM hr_departments WHERE company_id=$1 ORDER BY name`,
      [req.user.company_id]
    );
    res.json({ data: rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ═══════════════════════════════════════════════════════
   GET /compliance/bocw-register
   BOCW (Building & Other Construction Workers) Register
══════════════════════════════════════════════════════ */
router.get('/bocw-register', async (req, res) => {
  const { project_id } = req.query;
  try {
    let sql = `
      SELECT w.id, w.worker_code, w.name, w.skill_type, w.bocw_number,
             w.state_of_origin, w.daily_rate, w.joined_date, w.is_active,
             w.aadhaar_last4, w.gang_name,
             COALESCE(v.name,'Direct / Own') AS contractor_name,
             COALESCE(p.name,'—') AS project_name
      FROM workers w
      LEFT JOIN vendors v ON v.id = w.contractor_id
      LEFT JOIN projects p ON p.id = w.project_id
      WHERE w.company_id = $1
    `;
    const params = [req.user.company_id];
    if (project_id) { sql += ` AND w.project_id = $${params.length+1}`; params.push(project_id); }
    sql += ' ORDER BY w.name';
    const { rows } = await query(sql, params);
    const registered   = rows.filter(r => r.bocw_number).length;
    const unregistered = rows.length - registered;
    res.json({ data: rows, total: rows.length, registered, unregistered });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ═══════════════════════════════════════════════════════
   GET /compliance/bocw-cess?year=
   BOCW Welfare Cess records (1% of construction cost)
   + CRUD for cess payment tracking
══════════════════════════════════════════════════════ */
router.get('/bocw-cess', async (req, res) => {
  try {
    await query(`CREATE TABLE IF NOT EXISTS bocw_cess_records (
      id SERIAL PRIMARY KEY,
      company_id INT,
      year INT,
      project_name TEXT,
      construction_cost NUMERIC(15,2) DEFAULT 0,
      cess_rate NUMERIC(5,3) DEFAULT 1.0,
      cess_amount NUMERIC(15,2) DEFAULT 0,
      paid_amount NUMERIC(15,2) DEFAULT 0,
      payment_date DATE,
      challan_number TEXT,
      notes TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`);
    const { year = new Date().getFullYear() } = req.query;
    const { rows } = await query(
      `SELECT * FROM bocw_cess_records WHERE company_id=$1 AND year=$2 ORDER BY project_name`,
      [req.user.company_id, year]
    );
    const totals = rows.reduce((a,r) => ({
      construction_cost: a.construction_cost + parseFloat(r.construction_cost||0),
      cess_amount: a.cess_amount + parseFloat(r.cess_amount||0),
      paid_amount: a.paid_amount + parseFloat(r.paid_amount||0),
    }), { construction_cost:0, cess_amount:0, paid_amount:0 });
    res.json({ data: rows, totals, year });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/bocw-cess', async (req, res) => {
  const { year, project_name, construction_cost, cess_rate=1.0, paid_amount=0, payment_date, challan_number, notes } = req.body;
  const cess = parseFloat(construction_cost||0) * parseFloat(cess_rate) / 100;
  try {
    const { rows } = await query(
      `INSERT INTO bocw_cess_records (company_id,year,project_name,construction_cost,cess_rate,cess_amount,paid_amount,payment_date,challan_number,notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [req.user.company_id, year, project_name, construction_cost, cess_rate, cess, paid_amount, payment_date||null, challan_number||null, notes||null]
    );
    res.status(201).json({ data: rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/bocw-cess/:id', async (req, res) => {
  const { project_name, construction_cost, cess_rate=1.0, paid_amount, payment_date, challan_number, notes } = req.body;
  const cess = parseFloat(construction_cost||0) * parseFloat(cess_rate) / 100;
  try {
    const { rows } = await query(
      `UPDATE bocw_cess_records SET project_name=$1,construction_cost=$2,cess_rate=$3,cess_amount=$4,paid_amount=$5,payment_date=$6,challan_number=$7,notes=$8 WHERE id=$9 RETURNING *`,
      [project_name, construction_cost, cess_rate, cess, paid_amount, payment_date||null, challan_number||null, notes||null, req.params.id]
    );
    res.json({ data: rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/bocw-cess/:id', async (req, res) => {
  try {
    await query('DELETE FROM bocw_cess_records WHERE id=$1 AND company_id=$2', [req.params.id, req.user.company_id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ═══════════════════════════════════════════════════════
   GET /compliance/gratuity?dept=
   Gratuity Liability — employees with ≥5 years service
   Formula: (Last Basic / 26) × 15 × completed years
══════════════════════════════════════════════════════ */
router.get('/gratuity', async (req, res) => {
  const { dept, min_years = 1 } = req.query;
  try {
    let sql = EMP_SALARY_SQL;
    const params = [req.user.company_id];
    if (dept) { sql += ` AND dep.id = $${params.length+1}`; params.push(dept); }
    sql += ' ORDER BY ep.date_of_joining, u.name';
    const { rows } = await query(sql, params);

    const today = new Date();
    const data = rows
      .map(r => {
        const doj = r.date_of_joining ? new Date(r.date_of_joining) : null;
        if (!doj) return null;
        const yearsDecimal = (today - doj) / (1000 * 60 * 60 * 24 * 365.25);
        const completedYears = Math.floor(yearsDecimal);
        const basic = parseFloat(r.basic) || 0;
        // Gratuity = (Basic / 26) × 15 × completed years (capped at 20L)
        const gratuity = Math.min(Math.round((basic / 26) * 15 * completedYears), 2000000);
        const eligible = completedYears >= 5;
        if (parseFloat(min_years) > 0 && yearsDecimal < parseFloat(min_years)) return null;
        return {
          employee_code:   r.employee_code,
          name:            r.name,
          department:      r.department,
          designation:     r.designation,
          date_of_joining: r.date_of_joining,
          years_decimal:   Math.round(yearsDecimal * 10) / 10,
          completed_years: completedYears,
          basic,
          gratuity_liability: gratuity,
          eligible,
        };
      })
      .filter(Boolean)
      .sort((a,b) => b.years_decimal - a.years_decimal);

    const totals = {
      total: data.length,
      eligible: data.filter(r => r.eligible).length,
      total_liability: data.filter(r => r.eligible).reduce((s,r) => s + r.gratuity_liability, 0),
      potential_liability: data.reduce((s,r) => s + r.gratuity_liability, 0),
    };
    res.json({ data, totals });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ═══════════════════════════════════════════════════════
   GET /compliance/bonus?year=
   Bonus Register — Payment of Bonus Act
   8.33% min to 20% max of annual wages (or ₹7,000/month floor)
   Eligible: employees with ≥1 year service earning ≤₹21,000/month
══════════════════════════════════════════════════════ */
router.get('/bonus', async (req, res) => {
  const { year = new Date().getFullYear(), bonus_pct = 8.33, dept } = req.query;
  try {
    let sql = EMP_SALARY_SQL;
    const params = [req.user.company_id];
    if (dept) { sql += ` AND dep.id = $${params.length+1}`; params.push(dept); }
    sql += ' ORDER BY dep.name, u.name';
    const { rows } = await query(sql, params);

    const today = new Date();
    const pct = Math.max(8.33, Math.min(20, parseFloat(bonus_pct)));
    const data = rows.map(r => {
      const doj = r.date_of_joining ? new Date(r.date_of_joining) : null;
      const yearsService = doj ? (today - doj) / (1000 * 60 * 60 * 24 * 365.25) : 0;
      const eligible = yearsService >= 1 && parseFloat(r.gross_monthly||0) <= 21000;
      const basicMonthly = parseFloat(r.basic) || 0;
      // Bonus basis: basic+DA or ₹7,000 whichever higher, annual
      const bonusBasis = Math.max(basicMonthly, 7000) * 12;
      const bonusAmount = eligible ? Math.round(bonusBasis * pct / 100) : 0;
      return {
        employee_code:   r.employee_code,
        name:            r.name,
        department:      r.department,
        designation:     r.designation,
        date_of_joining: r.date_of_joining,
        years_service:   Math.round(yearsService * 10) / 10,
        gross_monthly:   parseFloat(r.gross_monthly||0),
        basic_monthly:   basicMonthly,
        bonus_basis:     eligible ? bonusBasis : 0,
        bonus_pct:       eligible ? pct : 0,
        bonus_amount:    bonusAmount,
        eligible,
        ineligible_reason: !eligible ? (yearsService < 1 ? 'Service < 1 year' : 'Gross > ₹21,000') : null,
      };
    });

    const totals = {
      total: data.length,
      eligible: data.filter(r => r.eligible).length,
      total_bonus: data.reduce((s,r) => s + r.bonus_amount, 0),
    };
    res.json({ data, totals, bonus_pct: pct, year });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ═══════════════════════════════════════════════════════
   GET /compliance/lwf-register?year=
   Labour Welfare Fund Register — Karnataka
   Employee: ₹20 | Employer: ₹40 | Due: January (annual)
══════════════════════════════════════════════════════ */
router.get('/lwf-register', async (req, res) => {
  const { year = new Date().getFullYear() } = req.query;
  try {
    const { rows } = await query(EMP_SALARY_SQL + ' ORDER BY u.name', [req.user.company_id]);
    let sno = 1;
    const data = rows.map(r => ({
      sno: sno++,
      employee_code: r.employee_code,
      name:          r.name,
      department:    r.department,
      designation:   r.designation,
      gross_monthly: parseFloat(r.gross_monthly||0),
      emp_lwf:       20,
      employer_lwf:  40,
      total_lwf:     60,
    }));
    const totals = {
      total: data.length,
      emp_lwf:      data.length * 20,
      employer_lwf: data.length * 40,
      total_lwf:    data.length * 60,
    };
    res.json({ data, totals, year, due_month: 'January', state: 'Karnataka' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ═══════════════════════════════════════════════════════
   GET /compliance/min-wages?state=KA&category=skilled
   Minimum Wages Compliance Check
══════════════════════════════════════════════════════ */
const MIN_WAGES = {
  KA: { unskilled: 12000, semi_skilled: 14000, skilled: 16000, highly_skilled: 20000 },
  MH: { unskilled: 13000, semi_skilled: 15000, skilled: 17500, highly_skilled: 22000 },
  DL: { unskilled: 16064, semi_skilled: 17693, skilled: 19473, highly_skilled: 21443 },
  TN: { unskilled: 11000, semi_skilled: 13000, skilled: 15000, highly_skilled: 18000 },
};

router.get('/min-wages', async (req, res) => {
  const { state = 'KA', dept } = req.query;
  try {
    let sql = EMP_SALARY_SQL;
    const params = [req.user.company_id];
    if (dept) { sql += ` AND dep.id = $${params.length+1}`; params.push(dept); }
    sql += ' ORDER BY dep.name, u.name';
    const { rows } = await query(sql, params);

    const wages = MIN_WAGES[state] || MIN_WAGES.KA;
    let sno = 1;
    const data = rows.map(r => {
      const basic = parseFloat(r.basic||0);
      // Simple heuristic: map designation to category
      const desig = (r.designation||'').toLowerCase();
      let category = 'skilled';
      if (/helper|office boy|peon|sweeper/i.test(desig)) category = 'unskilled';
      else if (/junior|trainee|assistant|jr\./i.test(desig)) category = 'semi_skilled';
      else if (/senior|manager|director|head|chief|gm|vp/i.test(desig)) category = 'highly_skilled';
      const minWage = wages[category];
      const compliant = basic >= minWage;
      const shortfall = compliant ? 0 : minWage - basic;
      return {
        sno: sno++,
        employee_code: r.employee_code,
        name:          r.name,
        department:    r.department,
        designation:   r.designation,
        category,
        basic,
        min_wage:      minWage,
        compliant,
        shortfall,
      };
    });

    const violations = data.filter(r => !r.compliant);
    res.json({ data, violations_count: violations.length, total: data.length, state, wages });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ═══════════════════════════════════════════════════════
   GET /compliance/ecr-file?month=&year=
   PF ECR (Electronic Challan-cum-Return) file generator
   Returns text content in EPFO ECR v2 format
══════════════════════════════════════════════════════ */
router.get('/ecr-file', async (req, res) => {
  const { month = new Date().getMonth() + 1, year = new Date().getFullYear() } = req.query;
  try {
    const { rows } = await query(
      EMP_SALARY_SQL + ' AND COALESCE(es.pf_applicable,true) = TRUE ORDER BY u.name',
      [req.user.company_id]
    );
    // ECR v2 format: UAN#MEMBER_NAME#GROSS_WAGES#EPF_WAGES#EPS_WAGES#EE_SHARE#ER_SHARE#NCP_DAYS#REFUND_OF_ADVANCES
    const lines = ['#~#'];
    rows.forEach(r => {
      const pf = pfCalc(r.basic, true);
      const uan = r.uan_number || '0';
      const name = (r.name || '').toUpperCase().replace(/[^A-Z ]/g,'').trim();
      const gross = Math.round(parseFloat(r.gross_monthly)||0);
      const pfWage = Math.min(Math.round(parseFloat(r.basic)||0), PF_WAGE_CEILING);
      lines.push([uan, name, gross, pfWage, pfWage, pf.emp, pf.epf, 0, 0].join('#~#'));
    });
    lines.push('#~#');
    const content = lines.join('\n');
    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Content-Disposition', `attachment; filename="ECR_${String(month).padStart(2,'0')}_${year}.txt"`);
    res.send(content);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ═══════════════════════════════════════════════════════
   Challan Filing Tracker — CRUD
   Track PF ECR, ESI, PT, TDS, Bonus, BOCW cess filings
══════════════════════════════════════════════════════ */
const ensureChallanTable = () => query(`
  CREATE TABLE IF NOT EXISTS compliance_challan_filings (
    id SERIAL PRIMARY KEY,
    company_id INT,
    challan_type TEXT NOT NULL,
    period_month INT,
    period_year INT NOT NULL,
    amount NUMERIC(15,2) DEFAULT 0,
    filed_on DATE,
    reference_number TEXT,
    mode TEXT DEFAULT 'online',
    bank TEXT,
    notes TEXT,
    filed_by TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )
`);

router.get('/challan-filings', async (req, res) => {
  const { year = new Date().getFullYear(), type } = req.query;
  try {
    await ensureChallanTable();
    let sql = `SELECT * FROM compliance_challan_filings WHERE company_id=$1 AND period_year=$2`;
    const params = [req.user.company_id, year];
    if (type) { sql += ` AND challan_type=$${params.length+1}`; params.push(type); }
    sql += ' ORDER BY period_year DESC, period_month DESC, challan_type';
    const { rows } = await query(sql, params);
    res.json({ data: rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/challan-filings', async (req, res) => {
  const { challan_type, period_month, period_year, amount, filed_on, reference_number, mode, bank, notes } = req.body;
  try {
    await ensureChallanTable();
    const { rows } = await query(
      `INSERT INTO compliance_challan_filings (company_id,challan_type,period_month,period_year,amount,filed_on,reference_number,mode,bank,notes,filed_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [req.user.company_id, challan_type, period_month||null, period_year, amount||0, filed_on||null, reference_number||null, mode||'online', bank||null, notes||null, req.user.name||null]
    );
    res.status(201).json({ data: rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/challan-filings/:id', async (req, res) => {
  const { amount, filed_on, reference_number, mode, bank, notes } = req.body;
  try {
    const { rows } = await query(
      `UPDATE compliance_challan_filings SET amount=$1,filed_on=$2,reference_number=$3,mode=$4,bank=$5,notes=$6,updated_at=NOW() WHERE id=$7 RETURNING *`,
      [amount||0, filed_on||null, reference_number||null, mode||'online', bank||null, notes||null, req.params.id]
    );
    res.json({ data: rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/challan-filings/:id', async (req, res) => {
  try {
    await query('DELETE FROM compliance_challan_filings WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ═══════════════════════════════════════════════════════
   GET /compliance/clra-register
   Contract Labour (Regulation & Abolition) Register
   — workers grouped by contractor
══════════════════════════════════════════════════════ */
router.get('/clra-register', async (req, res) => {
  const { project_id } = req.query;
  try {
    let sql = `
      SELECT w.id, w.worker_code, w.name, w.skill_type, w.bocw_number,
             w.daily_rate, w.joined_date, w.is_active, w.state_of_origin,
             w.gang_name, w.aadhaar_last4,
             COALESCE(v.name,'—') AS contractor_name,
             COALESCE(p.name,'—') AS project_name
      FROM workers w
      LEFT JOIN vendors v ON v.id = w.contractor_id
      LEFT JOIN projects p ON p.id = w.project_id
      WHERE w.is_active = true
    `;
    const params = [];
    if (project_id) { sql += ` AND w.project_id = $${params.length+1}`; params.push(project_id); }
    sql += ' ORDER BY v.name NULLS LAST, w.name';
    const { rows } = await query(sql, params);

    // Group by contractor
    const grouped = {};
    rows.forEach(r => {
      const key = r.contractor_name;
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(r);
    });
    const contractors = Object.entries(grouped).map(([name, workers]) => ({
      contractor_name: name,
      worker_count: workers.length,
      workers,
    }));
    res.json({ data: rows, contractors, total: rows.length });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ═══════════════════════════════════════════════════════
   GET /compliance/hr-checklist
   Aggregated HR Admin checklist — payroll, compliance, employee alerts, expiry
══════════════════════════════════════════════════════ */
router.get('/hr-checklist', async (req, res) => {
  try {
    const companyId = req.user.company_id;
    const today = new Date(); today.setHours(0,0,0,0);
    const month = today.getMonth() + 1;
    const year  = today.getFullYear();
    const prevM = month === 1 ? 12 : month - 1;
    const prevY = month === 1 ? year - 1 : year;

    const [
      payrollStatus, probation, lifecyclePending,
      licenseExpiry, docExpiry, leavesPending,
      expensesPending, newJoiners, exitsPending,
      lopCount, stopSalaryCount, activeLoansCount,
      payslipsSent, totalActiveEmp, salaryMissingCount,
    ] = await Promise.all([
      // 1. Payroll status for PREVIOUS month (in July we process June payroll)
      query(`
        SELECT status, COUNT(*)::int AS count, SUM(net_pay)::numeric AS total_net
        FROM hr_monthly_payroll
        WHERE company_id=$1 AND month=$2 AND year=$3
        GROUP BY status`, [companyId, prevM, prevY]),

      // 2. Probation reviews due within 30 days
      query(`
        SELECT u.id, u.name, u.employee_code, ep.probation_end_date,
               dep.name AS department_name, des.name AS designation_name,
               (ep.probation_end_date - CURRENT_DATE) AS days_left
        FROM users u
        JOIN employee_profiles ep ON ep.user_id = u.id
        LEFT JOIN hr_departments dep ON dep.id = ep.department_id
        LEFT JOIN hr_designations des ON des.id = ep.designation_id
        WHERE u.company_id=$1 AND COALESCE(ep.employment_status,'active')='active'
          AND ep.probation_end_date IS NOT NULL
          AND ep.probation_end_date BETWEEN CURRENT_DATE AND CURRENT_DATE + 30
        ORDER BY ep.probation_end_date`, [companyId]),

      // 3. Pending lifecycle checklist items (onboarding/exit)
      query(`
        SELECT elc.stage, elc.title, elc.owner_department, elc.status,
               u.name AS employee_name, u.employee_code
        FROM employee_lifecycle_checklist elc
        JOIN users u ON u.id = elc.user_id
        WHERE u.company_id=$1 AND elc.status='pending'
        ORDER BY elc.stage, u.name
        LIMIT 50`, [companyId]),

      // 4. Labour licence expiry within 60 days
      query(`
        SELECT licence_type, licence_number, expiry_date, authority,
               (expiry_date - CURRENT_DATE) AS days_left
        FROM hr_labour_licenses
        WHERE company_id=$1 AND expiry_date IS NOT NULL
          AND expiry_date BETWEEN CURRENT_DATE AND CURRENT_DATE + 60
        ORDER BY expiry_date`, [companyId]).catch(() => ({ rows: [] })),

      // 5. Employee document expiry within 30 days
      query(`
        SELECT u.name AS employee_name, u.employee_code, d.doc_type, d.doc_name, d.expiry_date,
               (d.expiry_date - CURRENT_DATE) AS days_left
        FROM employee_documents d
        JOIN users u ON u.id = d.user_id
        WHERE u.company_id=$1 AND d.expiry_date IS NOT NULL
          AND d.expiry_date BETWEEN CURRENT_DATE AND CURRENT_DATE + 30
        ORDER BY d.expiry_date`, [companyId]).catch(() => ({ rows: [] })),

      // 6. Pending leave requests
      query(`
        SELECT COUNT(*)::int AS count
        FROM hr_leave_requests lr
        JOIN users u ON u.id = lr.user_id
        WHERE u.company_id=$1 AND lr.status='pending'`, [companyId]).catch(() => ({ rows: [{ count: 0 }] })),

      // 7. Pending expense claims
      query(`
        SELECT COUNT(*)::int AS count
        FROM hr_expense_claims ec
        JOIN users u ON u.id = ec.user_id
        WHERE u.company_id=$1 AND ec.status='submitted'`, [companyId]).catch(() => ({ rows: [{ count: 0 }] })),

      // 8. New joiners in the PAYROLL month (previous month — June when in July)
      query(`
        SELECT u.id, u.name, u.employee_code, ep.date_of_joining,
               dep.name AS department_name
        FROM users u
        JOIN employee_profiles ep ON ep.user_id = u.id
        LEFT JOIN hr_departments dep ON dep.id = ep.department_id
        WHERE u.company_id=$1
          AND EXTRACT(MONTH FROM ep.date_of_joining) = $2
          AND EXTRACT(YEAR  FROM ep.date_of_joining) = $3
        ORDER BY ep.date_of_joining DESC`, [companyId, prevM, prevY]),

      // 9. Exit pending (resigned but not fully settled)
      query(`
        SELECT u.id, u.name, u.employee_code, ep.date_of_leaving,
               dep.name AS department_name, ep.leaving_reason
        FROM users u
        JOIN employee_profiles ep ON ep.user_id = u.id
        LEFT JOIN hr_departments dep ON dep.id = ep.department_id
        WHERE u.company_id=$1 AND ep.employment_status IN ('resigned','terminated')
          AND (ep.date_of_leaving IS NULL OR ep.date_of_leaving >= CURRENT_DATE - 30)
        ORDER BY ep.date_of_leaving`, [companyId]),

      // 10. LOP entries recorded for PREVIOUS month
      query(`
        SELECT COUNT(*)::int AS count, SUM(lop_days)::numeric AS total_lop
        FROM hr_lop_days
        WHERE company_id=$1 AND month=$2 AND year=$3`,
        [companyId, prevM, prevY]).catch(() => ({ rows: [{ count: 0, total_lop: 0 }] })),

      // 11. Employees on stop-salary
      query(`
        SELECT COUNT(*)::int AS count FROM hr_stop_salary WHERE company_id=$1`,
        [companyId]).catch(() => ({ rows: [{ count: 0 }] })),

      // 12. Active loans with pending balance
      query(`
        SELECT COUNT(DISTINCT user_id)::int AS count
        FROM hr_loans
        WHERE company_id=$1 AND status='approved' AND balance_amount > 0`,
        [companyId]).catch(() => ({ rows: [{ count: 0 }] })),

      // 13. Payslips already generated/sent for PREVIOUS month
      query(`
        SELECT COUNT(*)::int AS count
        FROM hr_monthly_payroll
        WHERE company_id=$1 AND month=$2 AND year=$3 AND payslip_generated=TRUE`,
        [companyId, prevM, prevY]).catch(() => ({ rows: [{ count: 0 }] })),

      // 14. Total active employees (for checklist completeness checks)
      query(`
        SELECT COUNT(*)::int AS count
        FROM users u
        JOIN employee_profiles ep ON ep.user_id = u.id
        WHERE u.company_id=$1 AND COALESCE(ep.employment_status,'active')='active'`,
        [companyId]).catch(() => ({ rows: [{ count: 0 }] })),

      // 15. Active employees without a salary structure assigned
      query(`
        SELECT COUNT(*)::int AS count
        FROM users u
        JOIN employee_profiles ep ON ep.user_id = u.id
        LEFT JOIN hr_employee_salaries es ON es.user_id = u.id AND es.is_current = TRUE
        WHERE u.company_id=$1 AND COALESCE(ep.employment_status,'active')='active'
          AND es.id IS NULL`,
        [companyId]).catch(() => ({ rows: [{ count: 0 }] })),
    ]);

    // Compliance calendar for this month
    const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    const prevMonthName = MONTH_NAMES[prevM - 1];
    const complianceTasks = [
      { id:1, category:'TDS',   task:`TDS Challan — ${prevMonthName}`,         due_day:7,  description:'Deposit TDS on salary (Form 281)' },
      { id:2, category:'WAGES', task:`Wage Payment — ${MONTH_NAMES[month-1]}`, due_day:7,  description:'Monthly salary disbursement' },
      { id:3, category:'PF',    task:`EPF Challan — ${prevMonthName}`,         due_day:15, description:'PF contributions via EPFO portal' },
      { id:4, category:'PT',    task:`Prof. Tax — ${prevMonthName}`,           due_day:20, description:'PT payment to Commercial Taxes Dept' },
      { id:5, category:'ESI',   task:`ESI Challan — ${prevMonthName}`,         due_day:21, description:'ESI contributions via ESIC portal' },
    ].map(t => {
      const due = new Date(year, month - 1, t.due_day);
      const diff = Math.ceil((due - today) / 86400000);
      return { ...t, due_date: due.toISOString().split('T')[0], days_remaining: diff, overdue: diff < 0, due_soon: diff >= 0 && diff <= 3 };
    });

    // Payroll summary
    const payrollRows = payrollStatus.rows;
    const totalEmp   = payrollRows.reduce((s, r) => s + r.count, 0);
    const paid       = payrollRows.find(r => r.status === 'paid');
    const approved   = payrollRows.find(r => r.status === 'approved');
    const pending    = payrollRows.find(r => ['draft','pending_approval'].includes(r.status));
    const totalActive = totalActiveEmp.rows[0]?.count || 0;

    res.json({
      month, year, month_name: MONTH_NAMES[month - 1],
      payroll_month: prevM, payroll_year: prevY, payroll_month_name: MONTH_NAMES[prevM - 1],
      payroll: {
        total_employees:     totalEmp,
        total_active:        totalActive,
        paid_count:          paid?.count || 0,
        approved_count:      approved?.count || 0,
        pending_count:       pending?.count || 0,
        net_pay_total:       parseFloat(paid?.total_net || approved?.total_net || 0),
        lop_entries:         lopCount.rows[0]?.count || 0,
        lop_total_days:      parseFloat(lopCount.rows[0]?.total_lop || 0),
        stop_salary_count:   stopSalaryCount.rows[0]?.count || 0,
        active_loans_count:  activeLoansCount.rows[0]?.count || 0,
        payslips_sent:       payslipsSent.rows[0]?.count || 0,
        salary_missing:      salaryMissingCount.rows[0]?.count || 0,
        status: totalEmp === 0 ? 'not_run'
               : paid?.count === totalEmp ? 'paid'
               : approved?.count >= 1 ? 'approved'
               : 'pending',
      },
      compliance_tasks: complianceTasks,
      probation_due:    probation.rows,
      lifecycle_pending: lifecyclePending.rows,
      license_expiry:   licenseExpiry.rows,
      doc_expiry:       docExpiry.rows,
      leaves_pending:   leavesPending.rows[0]?.count || 0,
      expenses_pending: expensesPending.rows[0]?.count || 0,
      new_joiners:      newJoiners.rows,
      exits_pending:    exitsPending.rows,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /compliance/celebrations — today's birthdays & anniversaries ──────────
router.get('/celebrations', async (req, res) => {
  try {
    const { getTodayCelebrations } = require('../utils/hr-birthday-anniversary.service');
    const data = await getTodayCelebrations(req.user.company_id);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /compliance/celebrations/trigger — manually trigger greetings ────────
router.post('/celebrations/trigger', async (req, res) => {
  try {
    const { runBirthdayAnniversary } = require('../utils/hr-birthday-anniversary.service');
    const result = await runBirthdayAnniversary();
    res.json({ ok: true, message: 'Birthday/anniversary greetings sent', result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /compliance/celebrations/test-email — send sample greeting to any email
router.post('/celebrations/test-email', async (req, res) => {
  try {
    const { type = 'birthday', email, name = 'Raja', years = 3 } = req.body;
    if (!email) return res.status(400).json({ error: 'email is required' });

    const { sendMail } = require('../services/mail.service');
    const companyRes = await query('SELECT name FROM companies WHERE id = $1', [req.user.company_id]);
    const companyName = companyRes.rows[0]?.name || 'BCIM Construction';

    // Import template builders from the service
    const svc = require('../utils/hr-birthday-anniversary.service');
    const html    = type === 'anniversary' ? svc.anniversaryEmailHtml(name, years, companyName) : svc.birthdayEmailHtml(name, companyName);
    const subject = type === 'anniversary'
      ? `🏆 Happy ${svc.ORDINAL(years)} Work Anniversary, ${name}! — ${companyName}`
      : `🎂 Happy Birthday, ${name}! — ${companyName}`;

    await sendMail({ to: email, subject, html });
    res.json({ ok: true, sent_to: email, type, subject });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
