// src/routes/hr-employee-background.routes.js
// Employee Management gaps: Family Details, Education, Experience, Skills,
// Certifications, Emergency Contacts (multi), and Role/Employment History.
// Six of these are structurally identical one-to-many child records off an
// employee, so they share one CRUD builder instead of six near-duplicate
// route blocks. Mounted at the same /hr-admin/employees prefix as
// hr-employees.routes.js (kept in its own file — that one is already large).
const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const { query } = require('../config/database');
const { runSchemaInit } = require('../utils/schemaInit');

router.use(authenticate);
router.use(authorize('super_admin', 'admin', 'hr', 'hr_admin', 'hr_manager'));

// ── Schema ───────────────────────────────────────────────────────────────
runSchemaInit('hr-employee-background-v1', async () => {
  await query(`
    CREATE TABLE IF NOT EXISTS employee_family_members (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      company_id UUID REFERENCES companies(id),
      name TEXT NOT NULL,
      relation TEXT NOT NULL,
      date_of_birth DATE,
      occupation TEXT,
      is_dependent BOOLEAN DEFAULT TRUE,
      phone TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS employee_education (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      company_id UUID REFERENCES companies(id),
      qualification TEXT NOT NULL,
      institution TEXT,
      board_university TEXT,
      year_of_passing INT,
      percentage TEXT,
      specialization TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS employee_experience (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      company_id UUID REFERENCES companies(id),
      company_name TEXT NOT NULL,
      designation TEXT,
      from_date DATE,
      to_date DATE,
      responsibilities TEXT,
      reason_for_leaving TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS employee_skills (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      company_id UUID REFERENCES companies(id),
      skill_name TEXT NOT NULL,
      proficiency TEXT DEFAULT 'intermediate' CHECK (proficiency IN ('beginner','intermediate','advanced','expert')),
      years_of_experience NUMERIC(4,1),
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS employee_certifications (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      company_id UUID REFERENCES companies(id),
      certificate_name TEXT NOT NULL,
      issuing_authority TEXT,
      certificate_number TEXT,
      issue_date DATE,
      expiry_date DATE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS employee_emergency_contacts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      company_id UUID REFERENCES companies(id),
      name TEXT NOT NULL,
      relation TEXT,
      phone TEXT NOT NULL,
      alternate_phone TEXT,
      address TEXT,
      priority_order INT DEFAULT 1,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS employee_role_history (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      company_id UUID REFERENCES companies(id),
      from_designation TEXT,
      to_designation TEXT,
      from_department TEXT,
      to_department TEXT,
      effective_date DATE NOT NULL,
      reason TEXT,
      created_by UUID REFERENCES users(id),
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_role_history_user ON employee_role_history(user_id, effective_date DESC)`);
});

async function getScopedEmployee(req, userId) {
  const { rows } = await query(`SELECT id FROM users WHERE id=$1 AND company_id=$2`, [userId, req.user.company_id]);
  if (!rows.length) { const e = new Error('Employee not found'); e.statusCode = 404; throw e; }
}

// ── Generic CRUD for the six simple child-record resources ─────────────
// [urlSegment, table, requiredCols, allCols, orderBy]
const RESOURCES = [
  {
    path: 'family', table: 'employee_family_members', required: ['name', 'relation'],
    cols: ['name', 'relation', 'date_of_birth', 'occupation', 'is_dependent', 'phone'],
    orderBy: 'created_at ASC',
  },
  {
    path: 'education', table: 'employee_education', required: ['qualification'],
    cols: ['qualification', 'institution', 'board_university', 'year_of_passing', 'percentage', 'specialization'],
    orderBy: 'year_of_passing DESC NULLS LAST, created_at DESC',
  },
  {
    path: 'experience', table: 'employee_experience', required: ['company_name'],
    cols: ['company_name', 'designation', 'from_date', 'to_date', 'responsibilities', 'reason_for_leaving'],
    orderBy: 'from_date DESC NULLS LAST, created_at DESC',
  },
  {
    path: 'skills', table: 'employee_skills', required: ['skill_name'],
    cols: ['skill_name', 'proficiency', 'years_of_experience'],
    orderBy: 'created_at ASC',
  },
  {
    path: 'certifications', table: 'employee_certifications', required: ['certificate_name'],
    cols: ['certificate_name', 'issuing_authority', 'certificate_number', 'issue_date', 'expiry_date'],
    orderBy: 'issue_date DESC NULLS LAST, created_at DESC',
  },
  {
    path: 'emergency-contacts', table: 'employee_emergency_contacts', required: ['name', 'phone'],
    cols: ['name', 'relation', 'phone', 'alternate_phone', 'address', 'priority_order'],
    orderBy: 'priority_order ASC, created_at ASC',
  },
];

for (const r of RESOURCES) {
  // LIST
  router.get(`/:id/${r.path}`, async (req, res) => {
    try {
      await getScopedEmployee(req, req.params.id);
      const { rows } = await query(
        `SELECT * FROM ${r.table} WHERE user_id=$1 ORDER BY ${r.orderBy}`,
        [req.params.id]
      );
      res.json({ data: rows });
    } catch (err) { res.status(err.statusCode || 500).json({ error: err.message }); }
  });

  // CREATE
  router.post(`/:id/${r.path}`, async (req, res) => {
    try {
      await getScopedEmployee(req, req.params.id);
      for (const f of r.required) {
        if (!req.body[f]) return res.status(400).json({ error: `${f} is required` });
      }
      const cols = r.cols.filter(c => req.body[c] !== undefined);
      const placeholders = cols.map((_, i) => `$${i + 3}`).join(',');
      const { rows } = await query(
        `INSERT INTO ${r.table} (user_id, company_id, ${cols.join(',')})
         VALUES ($1,$2,${placeholders}) RETURNING *`,
        [req.params.id, req.user.company_id, ...cols.map(c => req.body[c])]
      );
      res.status(201).json({ data: rows[0] });
    } catch (err) { res.status(err.statusCode || 500).json({ error: err.message }); }
  });

  // UPDATE
  router.put(`/:id/${r.path}/:recordId`, async (req, res) => {
    try {
      await getScopedEmployee(req, req.params.id);
      const cols = r.cols.filter(c => req.body[c] !== undefined);
      if (!cols.length) return res.status(400).json({ error: 'No fields to update' });
      const setClause = cols.map((c, i) => `${c}=$${i + 3}`).join(',');
      const { rows } = await query(
        `UPDATE ${r.table} SET ${setClause} WHERE id=$1 AND user_id=$2 RETURNING *`,
        [req.params.recordId, req.params.id, ...cols.map(c => req.body[c])]
      );
      if (!rows.length) return res.status(404).json({ error: 'Record not found' });
      res.json({ data: rows[0] });
    } catch (err) { res.status(err.statusCode || 500).json({ error: err.message }); }
  });

  // DELETE
  router.delete(`/:id/${r.path}/:recordId`, async (req, res) => {
    try {
      await getScopedEmployee(req, req.params.id);
      const { rows } = await query(
        `DELETE FROM ${r.table} WHERE id=$1 AND user_id=$2 RETURNING id`,
        [req.params.recordId, req.params.id]
      );
      if (!rows.length) return res.status(404).json({ error: 'Record not found' });
      res.json({ success: true });
    } catch (err) { res.status(err.statusCode || 500).json({ error: err.message }); }
  });
}

// ── Role / Employment History (its own shape — a change record, not a
// standalone entity, so it doesn't fit the generic builder above) ───────
router.get('/:id/role-history', async (req, res) => {
  try {
    await getScopedEmployee(req, req.params.id);
    const { rows } = await query(`
      SELECT h.*, c.name AS created_by_name
      FROM employee_role_history h
      LEFT JOIN users c ON c.id = h.created_by
      WHERE h.user_id = $1
      ORDER BY h.effective_date DESC, h.created_at DESC
    `, [req.params.id]);
    res.json({ data: rows });
  } catch (err) { res.status(err.statusCode || 500).json({ error: err.message }); }
});

router.post('/:id/role-history', async (req, res) => {
  try {
    await getScopedEmployee(req, req.params.id);
    const { from_designation, to_designation, from_department, to_department, effective_date, reason } = req.body;
    if (!effective_date) return res.status(400).json({ error: 'Effective date is required' });
    const { rows } = await query(`
      INSERT INTO employee_role_history
        (user_id, company_id, from_designation, to_designation, from_department, to_department, effective_date, reason, created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *
    `, [req.params.id, req.user.company_id, from_designation || null, to_designation || null,
        from_department || null, to_department || null, effective_date, reason || null, req.user.id]);
    res.status(201).json({ data: rows[0] });
  } catch (err) { res.status(err.statusCode || 500).json({ error: err.message }); }
});

router.delete('/:id/role-history/:recordId', async (req, res) => {
  try {
    await getScopedEmployee(req, req.params.id);
    const { rows } = await query(
      `DELETE FROM employee_role_history WHERE id=$1 AND user_id=$2 RETURNING id`,
      [req.params.recordId, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Record not found' });
    res.json({ success: true });
  } catch (err) { res.status(err.statusCode || 500).json({ error: err.message }); }
});

module.exports = router;
