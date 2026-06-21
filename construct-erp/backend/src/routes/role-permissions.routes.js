// src/routes/role-permissions.routes.js — Administration: Roles & Module Access
// ADDITIVE manager only — this does NOT replace the existing authorize()
// string-role checks used throughout the backend (hundreds of routes rely
// on them). It gives admins a real screen to manage each role's default
// `accessible_modules` (the array already enforced by RequireModule on the
// frontend) instead of editing it ad hoc per user, plus a one-click way to
// re-apply a role's defaults to everyone currently holding that role.
const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const { query } = require('../config/database');
const { runSchemaInit } = require('../utils/schemaInit');
const { logAudit } = require('../utils/auditLog');

router.use(authenticate);
router.use(authorize('super_admin', 'admin'));

// Canonical module list — union of every nav group label (Layout.jsx) and every
// string passed to RequireModule/RequireAnyModule in App.js, including the
// legacy "Finance" alias still checked by a couple of routes after the Finance
// module was merged into Accounts.
const ALL_MODULES = [
  'Overview', 'Planning', 'Procurement', 'Tender Management', 'Stores',
  'QS & Billing', 'Accounts', 'Finance', 'HR & Admin', 'Bill Tracker',
  'Quality (QA/QC)', 'HSE & Safety', 'Assets & IT', 'Plant & Machinery',
  'Hire & Rental', 'DMS', 'Subcontractors', 'Administration',
  'Automation Ideas', 'Approval Engine', 'Reports',
];

const DEFAULT_PRESETS = {
  management:          ['Overview','Planning','Procurement','Stores','Subcontractors','QS & Billing','Finance','Bill Tracker','Quality (QA/QC)','HSE & Safety','Reports','Documents','Automation Ideas','Approval Engine'],
  project_manager:     ['Overview','Planning','Procurement','Stores','Subcontractors','QS & Billing','Quality (QA/QC)','HSE & Safety','Reports'],
  site_engineer:       ['Overview','Planning','Stores','Subcontractors','Quality (QA/QC)','HSE & Safety'],
  qs_engineer:         ['Overview','Subcontractors','QS & Billing','Bill Tracker','Reports'],
  billing_engineer:    ['Overview','QS & Billing','Finance','Bill Tracker','Reports'],
  procurement_manager: ['Overview','Procurement','Stores','Finance','Reports'],
  purchase_executive:  ['Overview','Procurement','Stores'],
  stores_manager:      ['Overview','Stores','Procurement','Quality (QA/QC)'],
  store_keeper:        ['Overview','Stores'],
  accountant:          ['Overview','Finance','Procurement','QS & Billing','Bill Tracker','Reports'],
  accounts_manager:    ['Overview','Finance','Procurement','QS & Billing','Bill Tracker','Reports'],
  finance_manager:     ['Overview','Finance','Procurement','QS & Billing','Bill Tracker','Reports'],
  hse_officer:         ['Overview','HSE & Safety','Reports'],
  quality_manager:     ['Overview','Quality (QA/QC)','Stores','Reports'],
  qa_qc_engineer:      ['Overview','Quality (QA/QC)','Stores'],
  hr:                  ['Overview','HR & Admin','Administration','Reports'],
  document_controller: ['Overview','DMS','Planning','Quality (QA/QC)','HSE & Safety'],
  employee:            ['Overview'],
  viewer:              ['Overview','Reports'],
};

runSchemaInit('role_module_defaults', async () => {
  await query(`
    CREATE TABLE IF NOT EXISTS role_module_defaults (
      company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      role VARCHAR(80) NOT NULL,
      modules TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
      updated_by UUID REFERENCES users(id),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      PRIMARY KEY (company_id, role)
    )
  `);
});

// GET /role-permissions/modules — canonical module list for the matrix columns
router.get('/modules', (req, res) => {
  res.json({ data: ALL_MODULES });
});

// GET /role-permissions — every role in use by this company's users, joined
// with saved defaults (falling back to the hardcoded preset, then empty)
router.get('/', async (req, res) => {
  try {
    const rolesRes = await query(
      `SELECT role, COUNT(*) AS user_count
       FROM users WHERE company_id = $1 AND role IS NOT NULL
       GROUP BY role ORDER BY role`,
      [req.user.company_id]
    );
    const savedRes = await query(
      `SELECT role, modules, updated_at FROM role_module_defaults WHERE company_id = $1`,
      [req.user.company_id]
    );
    const savedByRole = new Map(savedRes.rows.map(r => [r.role, r]));

    const data = rolesRes.rows.map(r => {
      const saved = savedByRole.get(r.role);
      return {
        role: r.role,
        user_count: parseInt(r.user_count, 10),
        modules: saved ? saved.modules : (DEFAULT_PRESETS[r.role] || []),
        is_saved: !!saved,
        updated_at: saved?.updated_at || null,
      };
    });
    res.json({ data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /role-permissions/:role — save the module list for a role
router.put('/:role', async (req, res) => {
  try {
    const { modules } = req.body;
    if (!Array.isArray(modules)) return res.status(400).json({ error: 'modules must be an array' });
    const clean = modules.filter(m => ALL_MODULES.includes(m));

    const r = await query(
      `INSERT INTO role_module_defaults (company_id, role, modules, updated_by, updated_at)
       VALUES ($1,$2,$3,$4,NOW())
       ON CONFLICT (company_id, role) DO UPDATE SET modules = $3, updated_by = $4, updated_at = NOW()
       RETURNING *`,
      [req.user.company_id, req.params.role, clean, req.user.id]
    );
    await logAudit(req, { action: 'update', tableName: 'role_module_defaults', newValues: { role: req.params.role, modules: clean } });
    res.json({ data: r.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /role-permissions/:role/apply — push this role's saved modules onto every
// user currently holding that role (opt-in; does not happen automatically)
router.post('/:role/apply', async (req, res) => {
  try {
    const saved = await query(
      `SELECT modules FROM role_module_defaults WHERE company_id = $1 AND role = $2`,
      [req.user.company_id, req.params.role]
    );
    const modules = saved.rows[0]?.modules || DEFAULT_PRESETS[req.params.role] || [];

    const r = await query(
      `UPDATE users SET accessible_modules = $1, updated_at = NOW()
       WHERE company_id = $2 AND role = $3
       RETURNING id`,
      [modules, req.user.company_id, req.params.role]
    );
    await logAudit(req, { action: 'apply_role_defaults', tableName: 'users', newValues: { role: req.params.role, modules, affected_users: r.rows.length } });
    res.json({ message: `Applied to ${r.rows.length} user(s)`, affected: r.rows.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
