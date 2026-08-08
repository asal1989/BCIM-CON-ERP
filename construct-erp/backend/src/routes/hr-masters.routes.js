// src/routes/hr-masters.routes.js
// Departments, Designations, Leave Types, Holiday Calendar — simple CRUD
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
    CREATE TABLE IF NOT EXISTS hr_departments (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id UUID REFERENCES companies(id),
      name TEXT NOT NULL,
      head_user_id UUID REFERENCES users(id),
      is_active BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS hr_designations (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id UUID REFERENCES companies(id),
      name TEXT NOT NULL,
      department_id UUID REFERENCES hr_departments(id),
      grade TEXT,
      is_active BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS hr_holidays (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id UUID REFERENCES companies(id),
      holiday_date DATE NOT NULL,
      name TEXT NOT NULL,
      holiday_type TEXT DEFAULT 'national',
      year INT,
      UNIQUE(company_id, holiday_date)
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS hr_leave_types (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id UUID REFERENCES companies(id),
      name TEXT NOT NULL,
      code TEXT NOT NULL,
      days_per_year NUMERIC(5,1) DEFAULT 0,
      carry_forward BOOLEAN DEFAULT FALSE,
      max_carry_forward NUMERIC(5,1) DEFAULT 0,
      is_paid BOOLEAN DEFAULT TRUE,
      applicable_gender TEXT DEFAULT 'all',
      is_active BOOLEAN DEFAULT TRUE
    )
  `);
};
runSchemaInit('hr-masters', initTables);

// Separate migration key — 'hr-masters' already ran in production long
// before Organization Structure masters (Business Unit/Division/Grade/
// Cost Center) were added here, and runSchemaInit tasks execute exactly
// once ever, so these tables were never actually created on the live
// database (surfaced as "relation hr_cost_centers/hr_divisions does not
// exist" once the Organization Structure UI started calling these routes).
const initOrgStructureTables = async () => {
  await query(`
    CREATE TABLE IF NOT EXISTS hr_business_units (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id UUID REFERENCES companies(id),
      name TEXT NOT NULL,
      code TEXT,
      head_user_id UUID REFERENCES users(id),
      is_active BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS hr_divisions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id UUID REFERENCES companies(id),
      business_unit_id UUID REFERENCES hr_business_units(id),
      name TEXT NOT NULL,
      code TEXT,
      head_user_id UUID REFERENCES users(id),
      is_active BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS hr_grades (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id UUID REFERENCES companies(id),
      name TEXT NOT NULL,
      code TEXT,
      level INT,
      is_active BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS hr_cost_centers (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id UUID REFERENCES companies(id),
      department_id UUID REFERENCES hr_departments(id),
      name TEXT NOT NULL,
      code TEXT,
      budget_amount NUMERIC(14,2),
      is_active BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await query(`ALTER TABLE hr_departments ADD COLUMN IF NOT EXISTS division_id UUID REFERENCES hr_divisions(id)`);
};
runSchemaInit('hr-org-structure-masters-v1', initOrgStructureTables);

// ═══════════════════════════════════════════════════════════
// DEPARTMENTS
// ═══════════════════════════════════════════════════════════
router.get('/departments', async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT d.*, u.name as head_name, dv.name as division_name
       FROM hr_departments d
       LEFT JOIN users u ON u.id = d.head_user_id
       LEFT JOIN hr_divisions dv ON dv.id = d.division_id
       WHERE d.company_id = $1 AND d.is_active = TRUE
       ORDER BY d.name`,
      [req.user.company_id]
    );
    res.json({ data: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/departments', async (req, res) => {
  try {
    const { name, head_user_id, division_id } = req.body;
    const { rows } = await query(
      `INSERT INTO hr_departments (company_id, name, head_user_id, division_id)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [req.user.company_id, name, head_user_id || null, division_id || null]
    );
    res.status(201).json({ data: rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/departments/:id', async (req, res) => {
  try {
    const { name, head_user_id, is_active, division_id } = req.body;
    const { rows } = await query(
      `UPDATE hr_departments SET name=$1, head_user_id=$2, is_active=$3, division_id=$4
       WHERE id=$5 AND company_id=$6 RETURNING *`,
      [name, head_user_id || null, is_active ?? true, division_id || null, req.params.id, req.user.company_id]
    );
    res.json({ data: rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/departments/:id', async (req, res) => {
  try {
    await query(`UPDATE hr_departments SET is_active=FALSE WHERE id=$1 AND company_id=$2`,
      [req.params.id, req.user.company_id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════
// DESIGNATIONS
// ═══════════════════════════════════════════════════════════
router.get('/designations', async (req, res) => {
  try {
    const { department_id } = req.query;
    let sql = `SELECT d.*, dep.name as department_name
               FROM hr_designations d
               LEFT JOIN hr_departments dep ON dep.id = d.department_id
               WHERE d.company_id = $1 AND d.is_active = TRUE`;
    const params = [req.user.company_id];
    if (department_id) { sql += ` AND d.department_id = $2`; params.push(department_id); }
    sql += ' ORDER BY dep.name, d.name';
    const { rows } = await query(sql, params);
    res.json({ data: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/designations', async (req, res) => {
  try {
    const { name, department_id, grade } = req.body;
    const { rows } = await query(
      `INSERT INTO hr_designations (company_id, name, department_id, grade)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [req.user.company_id, name, department_id || null, grade || null]
    );
    res.status(201).json({ data: rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/designations/:id', async (req, res) => {
  try {
    const { name, department_id, grade, is_active } = req.body;
    const { rows } = await query(
      `UPDATE hr_designations SET name=$1, department_id=$2, grade=$3, is_active=$4
       WHERE id=$5 AND company_id=$6 RETURNING *`,
      [name, department_id || null, grade || null, is_active ?? true, req.params.id, req.user.company_id]
    );
    res.json({ data: rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/designations/:id', async (req, res) => {
  try {
    await query(`UPDATE hr_designations SET is_active=FALSE WHERE id=$1 AND company_id=$2`,
      [req.params.id, req.user.company_id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════
// LEAVE TYPES
// ═══════════════════════════════════════════════════════════
router.get('/leave-types', async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT * FROM hr_leave_types WHERE company_id=$1 AND is_active=TRUE ORDER BY name`,
      [req.user.company_id]
    );
    res.json({ data: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/leave-types', async (req, res) => {
  try {
    const { name, code, days_per_year, carry_forward, max_carry_forward, is_paid, applicable_gender } = req.body;
    const { rows } = await query(
      `INSERT INTO hr_leave_types (company_id, name, code, days_per_year, carry_forward, max_carry_forward, is_paid, applicable_gender)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [req.user.company_id, name, code, days_per_year || 0, carry_forward || false,
       max_carry_forward || 0, is_paid ?? true, applicable_gender || 'all']
    );
    res.status(201).json({ data: rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/leave-types/:id', async (req, res) => {
  try {
    const { name, code, days_per_year, carry_forward, max_carry_forward, is_paid, applicable_gender, is_active } = req.body;
    const { rows } = await query(
      `UPDATE hr_leave_types SET name=$1,code=$2,days_per_year=$3,carry_forward=$4,
       max_carry_forward=$5,is_paid=$6,applicable_gender=$7,is_active=$8
       WHERE id=$9 AND company_id=$10 RETURNING *`,
      [name, code, days_per_year, carry_forward, max_carry_forward, is_paid, applicable_gender,
       is_active ?? true, req.params.id, req.user.company_id]
    );
    res.json({ data: rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/leave-types/:id', async (req, res) => {
  try {
    await query(`UPDATE hr_leave_types SET is_active=FALSE WHERE id=$1 AND company_id=$2`,
      [req.params.id, req.user.company_id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════
// HOLIDAYS
// ═══════════════════════════════════════════════════════════
router.get('/holidays', async (req, res) => {
  try {
    const { year } = req.query;
    const yr = parseInt(year) || new Date().getFullYear();
    const { rows } = await query(
      `SELECT * FROM hr_holidays WHERE company_id=$1 AND year=$2 ORDER BY holiday_date`,
      [req.user.company_id, yr]
    );
    res.json({ data: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/holidays', async (req, res) => {
  try {
    const { holiday_date, name, holiday_type } = req.body;
    const year = new Date(holiday_date).getFullYear();
    const { rows } = await query(
      `INSERT INTO hr_holidays (company_id, holiday_date, name, holiday_type, year)
       VALUES ($1,$2,$3,$4,$5) ON CONFLICT (company_id, holiday_date)
       DO UPDATE SET name=EXCLUDED.name, holiday_type=EXCLUDED.holiday_type RETURNING *`,
      [req.user.company_id, holiday_date, name, holiday_type || 'national', year]
    );
    res.status(201).json({ data: rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/holidays/:id', async (req, res) => {
  try {
    const { holiday_date, name, holiday_type } = req.body;
    const year = new Date(holiday_date).getFullYear();
    const { rows } = await query(
      `UPDATE hr_holidays SET holiday_date=$1, name=$2, holiday_type=$3, year=$4
       WHERE id=$5 AND company_id=$6 RETURNING *`,
      [holiday_date, name, holiday_type, year, req.params.id, req.user.company_id]
    );
    res.json({ data: rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/holidays/:id', async (req, res) => {
  try {
    await query(`DELETE FROM hr_holidays WHERE id=$1 AND company_id=$2`,
      [req.params.id, req.user.company_id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════
// BUSINESS UNITS
// ═══════════════════════════════════════════════════════════
router.get('/business-units', async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT bu.*, u.name as head_name
       FROM hr_business_units bu
       LEFT JOIN users u ON u.id = bu.head_user_id
       WHERE bu.company_id = $1 AND bu.is_active = TRUE
       ORDER BY bu.name`,
      [req.user.company_id]
    );
    res.json({ data: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/business-units', async (req, res) => {
  try {
    const { name, code, head_user_id } = req.body;
    const { rows } = await query(
      `INSERT INTO hr_business_units (company_id, name, code, head_user_id)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [req.user.company_id, name, code || null, head_user_id || null]
    );
    res.status(201).json({ data: rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/business-units/:id', async (req, res) => {
  try {
    const { name, code, head_user_id, is_active } = req.body;
    const { rows } = await query(
      `UPDATE hr_business_units SET name=$1, code=$2, head_user_id=$3, is_active=$4
       WHERE id=$5 AND company_id=$6 RETURNING *`,
      [name, code || null, head_user_id || null, is_active ?? true, req.params.id, req.user.company_id]
    );
    res.json({ data: rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/business-units/:id', async (req, res) => {
  try {
    await query(`UPDATE hr_business_units SET is_active=FALSE WHERE id=$1 AND company_id=$2`,
      [req.params.id, req.user.company_id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════
// DIVISIONS
// ═══════════════════════════════════════════════════════════
router.get('/divisions', async (req, res) => {
  try {
    const { business_unit_id } = req.query;
    let sql = `SELECT dv.*, bu.name as business_unit_name, u.name as head_name
               FROM hr_divisions dv
               LEFT JOIN hr_business_units bu ON bu.id = dv.business_unit_id
               LEFT JOIN users u ON u.id = dv.head_user_id
               WHERE dv.company_id = $1 AND dv.is_active = TRUE`;
    const params = [req.user.company_id];
    if (business_unit_id) { sql += ` AND dv.business_unit_id = $2`; params.push(business_unit_id); }
    sql += ' ORDER BY bu.name, dv.name';
    const { rows } = await query(sql, params);
    res.json({ data: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/divisions', async (req, res) => {
  try {
    const { name, code, business_unit_id, head_user_id } = req.body;
    const { rows } = await query(
      `INSERT INTO hr_divisions (company_id, name, code, business_unit_id, head_user_id)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [req.user.company_id, name, code || null, business_unit_id || null, head_user_id || null]
    );
    res.status(201).json({ data: rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/divisions/:id', async (req, res) => {
  try {
    const { name, code, business_unit_id, head_user_id, is_active } = req.body;
    const { rows } = await query(
      `UPDATE hr_divisions SET name=$1, code=$2, business_unit_id=$3, head_user_id=$4, is_active=$5
       WHERE id=$6 AND company_id=$7 RETURNING *`,
      [name, code || null, business_unit_id || null, head_user_id || null, is_active ?? true, req.params.id, req.user.company_id]
    );
    res.json({ data: rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/divisions/:id', async (req, res) => {
  try {
    await query(`UPDATE hr_divisions SET is_active=FALSE WHERE id=$1 AND company_id=$2`,
      [req.params.id, req.user.company_id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════
// GRADES
// ═══════════════════════════════════════════════════════════
router.get('/grades', async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT * FROM hr_grades WHERE company_id=$1 AND is_active=TRUE ORDER BY level NULLS LAST, name`,
      [req.user.company_id]
    );
    res.json({ data: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/grades', async (req, res) => {
  try {
    const { name, code, level } = req.body;
    const { rows } = await query(
      `INSERT INTO hr_grades (company_id, name, code, level)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [req.user.company_id, name, code || null, level || null]
    );
    res.status(201).json({ data: rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/grades/:id', async (req, res) => {
  try {
    const { name, code, level, is_active } = req.body;
    const { rows } = await query(
      `UPDATE hr_grades SET name=$1, code=$2, level=$3, is_active=$4
       WHERE id=$5 AND company_id=$6 RETURNING *`,
      [name, code || null, level || null, is_active ?? true, req.params.id, req.user.company_id]
    );
    res.json({ data: rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/grades/:id', async (req, res) => {
  try {
    await query(`UPDATE hr_grades SET is_active=FALSE WHERE id=$1 AND company_id=$2`,
      [req.params.id, req.user.company_id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════
// COST CENTERS
// ═══════════════════════════════════════════════════════════
router.get('/cost-centers', async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT cc.*, d.name as department_name
       FROM hr_cost_centers cc
       LEFT JOIN hr_departments d ON d.id = cc.department_id
       WHERE cc.company_id=$1 AND cc.is_active=TRUE
       ORDER BY cc.name`,
      [req.user.company_id]
    );
    res.json({ data: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/cost-centers', async (req, res) => {
  try {
    const { name, code, department_id, budget_amount } = req.body;
    const { rows } = await query(
      `INSERT INTO hr_cost_centers (company_id, name, code, department_id, budget_amount)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [req.user.company_id, name, code || null, department_id || null, budget_amount || null]
    );
    res.status(201).json({ data: rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/cost-centers/:id', async (req, res) => {
  try {
    const { name, code, department_id, budget_amount, is_active } = req.body;
    const { rows } = await query(
      `UPDATE hr_cost_centers SET name=$1, code=$2, department_id=$3, budget_amount=$4, is_active=$5
       WHERE id=$6 AND company_id=$7 RETURNING *`,
      [name, code || null, department_id || null, budget_amount || null, is_active ?? true, req.params.id, req.user.company_id]
    );
    res.json({ data: rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/cost-centers/:id', async (req, res) => {
  try {
    await query(`UPDATE hr_cost_centers SET is_active=FALSE WHERE id=$1 AND company_id=$2`,
      [req.params.id, req.user.company_id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════
// REPORTING STRUCTURE
// ═══════════════════════════════════════════════════════════
router.get('/reporting-structure', async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT u.id as user_id, u.name, u.email,
              dep.name as department_name, des.name as designation_name,
              ep.reporting_manager_id, mgr.name as reporting_manager_name
       FROM users u
       JOIN employee_profiles ep ON ep.user_id = u.id
       LEFT JOIN hr_departments dep ON dep.id = ep.department_id
       LEFT JOIN hr_designations des ON des.id = ep.designation_id
       LEFT JOIN users mgr ON mgr.id = ep.reporting_manager_id
       WHERE ep.company_id = $1 AND ep.employment_status = 'active'
       ORDER BY u.name`,
      [req.user.company_id]
    );
    res.json({ data: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/reporting-structure/:userId', async (req, res) => {
  try {
    const { reporting_manager_id } = req.body;
    if (reporting_manager_id === req.params.userId) {
      return res.status(400).json({ error: 'An employee cannot report to themselves' });
    }
    const { rows } = await query(
      `UPDATE employee_profiles SET reporting_manager_id=$1, updated_at=NOW()
       WHERE user_id=$2 AND company_id=$3 RETURNING *`,
      [reporting_manager_id || null, req.params.userId, req.user.company_id]
    );
    res.json({ data: rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;

