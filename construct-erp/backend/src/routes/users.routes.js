// src/routes/users.routes.js — Team / User Management
const express = require('express');
const router  = express.Router();
const bcrypt  = require('bcryptjs');
const { query } = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');
const { runSchemaInit } = require('../utils/schemaInit');
const { sendWelcomeLoginMail } = require('../services/mail.service');
const { createPasswordResetToken, getResetBaseUrl } = require('../controllers/auth.controller');
const { logAudit } = require('../utils/auditLog');

// Fire-and-forget welcome email with a 24-hour password reset link
const sendWelcomeMail = (req, { id, name, email, role }) => {
  const baseUrl = getResetBaseUrl();
  createPasswordResetToken(id)
    .then(token => sendWelcomeLoginMail({
      to:       email,
      name,
      role,
      loginUrl: baseUrl,
      resetUrl: `${baseUrl}/reset-password?token=${token}`,
    }))
    .then(r  => console.log(`[mail] Welcome email → ${email}: ${r.sent ? 'sent' : r.reason}`))
    .catch(e => console.error(`[mail] Welcome email failed for ${email}:`, e.message));
};

// All routes require login; create/update/delete require admin
const auth  = authenticate;
const admin = [authenticate, authorize('admin', 'super_admin')];

let roleSchemaReady = false;
const ensureRoleSchema = async () => {
  if (roleSchemaReady) return;
  try {
    await query(`ALTER TABLE users ALTER COLUMN role TYPE VARCHAR(80)`);
    await query(`ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check`);
    await query(`ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IS NOT NULL AND BTRIM(role) <> '')`);
    roleSchemaReady = true;
  } catch (err) {
    console.warn('[users] role constraint migration skipped:', err.message);
  }
};

// Keep role storage flexible. Permissions are enforced by route authorize() calls
// and module access, while companies may use role names that differ by project.
runSchemaInit('users_role_schema', ensureRoleSchema);

// ── One-time module access grants ────────────────────────────────────────────
// Idempotent: only adds module if not already present for the specified email.
(async () => {
  const grants = [
    { email: 'bkmanjunath@bcim.in', module: 'Stores' },
  ];
  for (const { email, module } of grants) {
    try {
      const r = await query(
        `UPDATE users
           SET accessible_modules = ARRAY(
             SELECT DISTINCT unnest(COALESCE(accessible_modules, ARRAY[]::text[]) || ARRAY[$1])
           )
         WHERE LOWER(email) = $2
           AND NOT ($1 = ANY(COALESCE(accessible_modules, ARRAY[]::text[])))
         RETURNING id, name, email, accessible_modules`,
        [module, email.toLowerCase()]
      );
      if (r.rowCount > 0) {
        console.log(`[users] Granted "${module}" access to ${email}`);
      }
    } catch (e) {
      console.error(`[users] Module grant failed for ${email}:`, e.message);
    }
  }
})();

// ── One-time user seeds ───────────────────────────────────────────────────────
// Idempotent: only inserts if the email doesn't already exist for the company.
(async () => {
  const seeds = [
    {
      email:       'lokpratap@bcim.in',
      name:        'Lok Pratap',
      passwordHash: '$2a$10$DL5Tqc6SSIMqZ2MxwP11IuGdw/1egE230s36dO7Mv3muRk9ZkJqcy',
      role:        'accountant',
      department:  'Accounts',
      accessible_modules: ['Stores'],
    },
  ];
  for (const u of seeds) {
    try {
      const exists = await query(
        `SELECT id FROM users WHERE LOWER(email) = $1 LIMIT 1`,
        [u.email.toLowerCase()]
      );
      if (exists.rowCount > 0) continue;

      const company = await query(`SELECT id FROM companies WHERE LOWER(email_domain) = 'bcim.in' OR name ILIKE '%BCIM%' LIMIT 1`);
      if (!company.rowCount) { console.warn('[users] Seed: company not found, skipping', u.email); continue; }
      const companyId = company.rows[0].id;

      const empRow = await query(`SELECT COUNT(*) AS c FROM users WHERE company_id=$1`, [companyId]);
      const empCode = `EMP${String(parseInt(empRow.rows[0].c || 0) + 1).padStart(3, '0')}`;

      await query(
        `INSERT INTO users (company_id, employee_code, name, email, password_hash, role, department, accessible_modules, is_active)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,true)`,
        [companyId, empCode, u.name, u.email.toLowerCase(), u.passwordHash, u.role, u.department, u.accessible_modules]
      );
      console.log(`[users] Seeded user: ${u.email}`);
    } catch (e) {
      console.error(`[users] Seed failed for ${u.email}:`, e.message);
    }
  }
})();

const normalizeModules = (modules, fallback = []) => {
  const normalizeName = (name) => name === 'DQS Tracker' ? 'Bill Tracker' : name;
  if (modules === undefined || modules === null) return fallback;
  if (Array.isArray(modules)) return modules.map(String).map(normalizeName).filter(Boolean);
  if (typeof modules === 'string') {
    try {
      const parsed = JSON.parse(modules);
      return Array.isArray(parsed) ? parsed.map(String).map(normalizeName).filter(Boolean) : fallback;
    } catch {
      return fallback;
    }
  }
  return fallback;
};

const normalizeProjectIds = (projectIds) => {
  if (!Array.isArray(projectIds)) return [];
  const uuidLike = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return [...new Set(projectIds.map(String).map(v => v.trim()).filter(v => uuidLike.test(v)))];
};

const syncUserProjects = async (userId, companyId, projectIds, role = null) => {
  const ids = normalizeProjectIds(projectIds);
  await query('DELETE FROM project_members WHERE user_id = $1', [userId]);
  if (!ids.length) return;
  await query(
    `INSERT INTO project_members (project_id, user_id, role)
     SELECT p.id, $2, $4
     FROM projects p
     WHERE p.company_id = $3
       AND p.id = ANY($1::uuid[])`,
    [ids, userId, companyId, role || null]
  );
};

// GET /api/v1/users — list all users in this company
router.get('/', auth, async (req, res) => {
  try {
    const result = await query(
      `SELECT u.id, u.name, u.email, u.phone, u.role, u.designation, u.department,
              u.employee_code, u.is_active, u.last_login, u.created_at, u.accessible_modules,
              u.vendor_id, v.name AS vendor_name,
              COALESCE((
                SELECT ARRAY_AGG(pm.project_id::text ORDER BY p.name)
                FROM project_members pm
                JOIN projects p ON p.id = pm.project_id
                WHERE pm.user_id = u.id AND p.company_id = u.company_id
              ), ARRAY[]::text[]) AS project_ids,
              COALESCE((
                SELECT ARRAY_AGG(p.name ORDER BY p.name)
                FROM project_members pm
                JOIN projects p ON p.id = pm.project_id
                WHERE pm.user_id = u.id AND p.company_id = u.company_id
              ), ARRAY[]::text[]) AS project_names
       FROM users u
       LEFT JOIN vendors v ON u.vendor_id = v.id
       WHERE u.company_id = $1
       ORDER BY u.is_active DESC, u.name ASC`,
      [req.user.company_id]
    );
    res.json({ data: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/v1/users — create a new team member
router.post('/', admin, async (req, res) => {
  try {
    const { name, phone, password, role, designation, department, accessible_modules, vendor_id, project_ids } = req.body;
    const email = (req.body.email || '').trim().toLowerCase();

    if (!name || !email || !password || !role) {
      return res.status(400).json({ error: 'name, email, password and role are required' });
    }
    await ensureRoleSchema();

    const existing = await query('SELECT id FROM users WHERE LOWER(email) = $1', [email]);
    if (existing.rows[0]) {
      return res.status(409).json({ error: 'This email is already registered.' });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const empCode = `EMP-${Date.now().toString().slice(-6)}`;

    const result = await query(
      `INSERT INTO users
         (company_id, employee_code, name, email, phone, password_hash, role, designation, department, accessible_modules, vendor_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::text[], $11)
       RETURNING id, name, email, role, designation, department, employee_code, is_active, created_at, accessible_modules, vendor_id`,
      [req.user.company_id, empCode, name, email, phone || null,
       passwordHash, role, designation || null, department || null,
       normalizeModules(accessible_modules), vendor_id || null]
    );

    await syncUserProjects(result.rows[0].id, req.user.company_id, project_ids, role);

    await logAudit(req, { action: 'create', tableName: 'users', recordId: result.rows[0].id, newValues: result.rows[0] });
    sendWelcomeMail(req, result.rows[0]);
    res.status(201).json({ message: 'User created successfully', data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/v1/users/:id — update user details
router.put('/:id', admin, async (req, res) => {
  try {
    const { name, phone, role, designation, department, is_active, accessible_modules, vendor_id, project_ids } = req.body;
    const email = req.body.email ? req.body.email.trim().toLowerCase() : undefined;
    await ensureRoleSchema();

    // Ensure user belongs to this company
    const check = await query(
      'SELECT id, name, email, phone, role, designation, department, is_active, accessible_modules, vendor_id FROM users WHERE id = $1 AND company_id = $2',
      [req.params.id, req.user.company_id]
    );
    if (!check.rows[0]) return res.status(404).json({ error: 'User not found.' });
    const before = check.rows[0];

    const updated = await query(
      `UPDATE users SET
         name        = COALESCE($1, name),
         email       = COALESCE($2, email),
         phone       = COALESCE($3, phone),
         role        = COALESCE($4, role),
         designation = COALESCE($5, designation),
         department  = COALESCE($6, department),
         is_active   = COALESCE($7, is_active),
         accessible_modules = COALESCE($8::text[], accessible_modules),
         vendor_id   = $9,
         updated_at  = NOW()
       WHERE id = $10 AND company_id = $11
       RETURNING id, name, email, phone, role, designation, department, is_active, accessible_modules, vendor_id`,
      [name, email, phone, role, designation, department,
       is_active !== undefined ? is_active : null,
       accessible_modules !== undefined ? normalizeModules(accessible_modules) : null,
       vendor_id || null,
       req.params.id, req.user.company_id]
    );

    if (project_ids !== undefined) {
      await syncUserProjects(req.params.id, req.user.company_id, project_ids, role);
    }

    await logAudit(req, { action: 'update', tableName: 'users', recordId: req.params.id, oldValues: before, newValues: updated.rows[0] });
    res.json({ message: 'User updated successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/v1/users/:id/reset-password — admin resets a user's password
router.patch('/:id/reset-password', admin, async (req, res) => {
  try {
    const { new_password } = req.body;
    if (!new_password || new_password.length < 8)
      return res.status(400).json({ error: 'Password must be at least 8 characters.' });

    const check = await query(
      'SELECT id, name, email FROM users WHERE id = $1 AND company_id = $2',
      [req.params.id, req.user.company_id]
    );
    if (!check.rows[0]) return res.status(404).json({ error: 'User not found.' });

    const hash = await bcrypt.hash(new_password, 12);
    await query(
      'UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2',
      [hash, req.params.id]
    );
    // Invalidate sessions
    await query('DELETE FROM refresh_tokens WHERE user_id = $1', [req.params.id]);

    await logAudit(req, { action: 'reset_password', tableName: 'users', recordId: req.params.id, newValues: { name: check.rows[0].name, email: check.rows[0].email } });
    res.json({ message: 'Password reset successfully.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/v1/users/:id — deactivate (soft delete)
router.delete('/:id', admin, async (req, res) => {
  try {
    if (req.params.id === req.user.id)
      return res.status(400).json({ error: 'You cannot deactivate your own account.' });

    const check = await query(
      'SELECT id, name, email, role FROM users WHERE id = $1 AND company_id = $2',
      [req.params.id, req.user.company_id]
    );
    if (!check.rows[0]) return res.status(404).json({ error: 'User not found.' });

    await query(
      'UPDATE users SET is_active = false, updated_at = NOW() WHERE id = $1',
      [req.params.id]
    );
    await query('DELETE FROM refresh_tokens WHERE user_id = $1', [req.params.id]);

    await logAudit(req, { action: 'deactivate', tableName: 'users', recordId: req.params.id, oldValues: check.rows[0] });
    res.json({ message: 'User deactivated.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/v1/users/import/template — download blank XLSX template for bulk import
router.get('/import/template', admin, (req, res) => {
  try {
    const XLSX = require('xlsx');

    const headers = [
      'Full Name *', 'Email *', 'Password *', 'Mobile',
      'Role *', 'Department', 'Designation',
      'Modules (comma-separated)',
    ];

    const sampleRow = [
      'John Doe', 'john.doe@company.com', 'Pass@1234', '+91 98765 43210',
      'site_engineer', 'Civil & Structural', 'Senior Site Engineer',
      'Overview,Planning,Stores,Quality (QA/QC),HSE & Safety,Documents',
    ];

    const rolesNote = [
      'VALID ROLES (copy exactly into Role column):',
      'super_admin | admin | management | project_manager | planning_engineer | site_engineer',
      'qs_engineer | billing_engineer | contracts_manager | procurement_manager | purchase_executive',
      'stores_manager | store_keeper | accountant | accounts_manager | finance_manager',
      'hse_officer | safety_supervisor | quality_manager | qa_qc_engineer | hr',
      'document_controller | tender_manager | crm_manager | plant_manager | it_admin | employee | viewer',
    ];

    const modulesNote = [
      'AVAILABLE MODULES (comma-separated in Modules column):',
      'Overview | Planning | HR & Admin | Procurement | Stores | Subcontractors | QS & Billing',
      'Finance | Bill Tracker | Quality (QA/QC) | HSE & Safety | Reports | Assets & IT | Documents | Administration | Automation Ideas | Approval Engine',
    ];

    const wb = XLSX.utils.book_new();

    // ── Sheet 1: Members (the fillable sheet) ──────────────────────────────
    const wsData = [
      headers,
      sampleRow,
      // Two blank rows ready for data entry
      Array(headers.length).fill(''),
      Array(headers.length).fill(''),
    ];
    const ws = XLSX.utils.aoa_to_sheet(wsData);

    // Column widths
    ws['!cols'] = [
      { wch: 22 }, { wch: 30 }, { wch: 16 }, { wch: 18 },
      { wch: 22 }, { wch: 22 }, { wch: 26 }, { wch: 55 },
    ];

    // Style header row bold (xlsx community edition doesn't apply styles but the structure is set)
    XLSX.utils.book_append_sheet(wb, ws, 'Members');

    // ── Sheet 2: Reference (roles + modules cheat-sheet) ──────────────────
    const refData = [
      ['TEAM MEMBER IMPORT TEMPLATE — REFERENCE SHEET'],
      [''],
      ...rolesNote.map(l => [l]),
      [''],
      ...modulesNote.map(l => [l]),
      [''],
      ['NOTES:'],
      ['• Columns marked * are required. Rows with missing required fields will be skipped.'],
      ['• Password must be at least 8 characters.'],
      ['• Email must be unique — duplicate emails are skipped with an error note.'],
      ['• Modules column is optional — if blank, the role default modules are applied.'],
      ['• Do NOT change the column header row in the Members sheet.'],
    ];
    const wsRef = XLSX.utils.aoa_to_sheet(refData);
    wsRef['!cols'] = [{ wch: 90 }];
    XLSX.utils.book_append_sheet(wb, wsRef, 'Reference');

    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Disposition', 'attachment; filename="Team_Members_Import_Template.xlsx"');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buf);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/v1/users/bulk-import — import members from uploaded XLSX
router.post('/bulk-import', admin, async (req, res) => {
  try {
    const XLSX   = require('xlsx');
    const multer = require('multer');

    // Parse multipart in-memory
    const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

    upload.single('file')(req, res, async (err) => {
      if (err) return res.status(400).json({ error: err.message });
      if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });

      const wb  = XLSX.read(req.file.buffer, { type: 'buffer' });
      const ws  = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

      if (!rows.length) return res.status(400).json({ error: 'Spreadsheet is empty.' });

      // Find header row (first row that contains 'Full Name')
      let headerIdx = rows.findIndex(r => String(r[0] || '').toLowerCase().includes('full name'));
      if (headerIdx < 0) headerIdx = 0;

      const dataRows = rows.slice(headerIdx + 1).filter(r => r.some(c => String(c).trim()));

      const created = [], skipped = [];

      const ROLE_MODULE_PRESETS = {
        management: ['Overview','Planning','Procurement','Stores','Subcontractors','QS & Billing','Finance','Bill Tracker','Quality (QA/QC)','HSE & Safety','Reports','Documents','Automation Ideas','Approval Engine'],
        project_manager: ['Overview','Planning','Procurement','Stores','Subcontractors','QS & Billing','Quality (QA/QC)','HSE & Safety','Reports','Documents'],
        site_engineer: ['Overview','Planning','Stores','Subcontractors','Quality (QA/QC)','HSE & Safety','Documents'],
        qs_engineer: ['Overview','Subcontractors','QS & Billing','Bill Tracker','Reports','Documents'],
        billing_engineer: ['Overview','QS & Billing','Finance','Bill Tracker','Reports'],
        procurement_manager: ['Overview','Procurement','Stores','Finance','Reports','Documents'],
        purchase_executive: ['Overview','Procurement','Stores','Documents'],
        stores_manager: ['Overview','Stores','Procurement','Quality (QA/QC)','Documents'],
        store_keeper: ['Overview','Stores','Documents'],
        accountant: ['Overview','Finance','Procurement','QS & Billing','Bill Tracker','Reports'],
        accounts_manager: ['Overview','Finance','Procurement','QS & Billing','Bill Tracker','Reports'],
        finance_manager: ['Overview','Finance','Procurement','QS & Billing','Bill Tracker','Reports'],
        hse_officer: ['Overview','HSE & Safety','Documents','Reports'],
        quality_manager: ['Overview','Quality (QA/QC)','Stores','Documents','Reports'],
        qa_qc_engineer: ['Overview','Quality (QA/QC)','Stores','Documents'],
        hr: ['Overview','HR & Admin','Administration','Reports'],
        document_controller: ['Overview','Documents','Planning','Quality (QA/QC)','HSE & Safety'],
        employee: ['Overview','Documents'],
        viewer: ['Overview','Reports'],
      };

      for (let i = 0; i < dataRows.length; i++) {
        const row  = dataRows[i];
        const name        = String(row[0] || '').trim();
        const email       = String(row[1] || '').trim().toLowerCase();
        const password    = String(row[2] || '').trim();
        const phone       = String(row[3] || '').trim() || null;
        const role        = String(row[4] || '').trim() || 'employee';
        const department  = String(row[5] || '').trim() || null;
        const designation = String(row[6] || '').trim() || null;
        const modulesRaw  = String(row[7] || '').trim();

        const rowNum = headerIdx + i + 2;

        if (!name || !email || !password) {
          skipped.push({ row: rowNum, email: email || '—', reason: 'Missing required field (Name, Email or Password)' });
          continue;
        }
        if (password.length < 8) {
          skipped.push({ row: rowNum, email, reason: 'Password must be at least 8 characters' });
          continue;
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          skipped.push({ row: rowNum, email, reason: 'Invalid email format' });
          continue;
        }

        const existing = await query('SELECT id FROM users WHERE email = $1', [email]);
        if (existing.rows[0]) {
          skipped.push({ row: rowNum, email, reason: 'Email already registered' });
          continue;
        }

        // Resolve modules
        let modules;
        if (modulesRaw) {
          modules = modulesRaw.split(',').map(m => m.trim()).filter(Boolean);
        } else if (['admin', 'super_admin'].includes(role)) {
          modules = [];
        } else {
          modules = ROLE_MODULE_PRESETS[role] || ['Overview', 'Documents'];
        }

        try {
          const hash   = await bcrypt.hash(password, 12);
          const empCode = `EMP-${Date.now().toString().slice(-6)}`;

          const r = await query(
            `INSERT INTO users
               (company_id, employee_code, name, email, phone, password_hash, role, designation, department, accessible_modules)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::text[])
             RETURNING id, name, email, role, employee_code`,
            [req.user.company_id, empCode, name, email, phone,
             hash, role, designation, department, modules]
          );
          created.push({ row: rowNum, name, email, employee_code: r.rows[0].employee_code });
          sendWelcomeMail(req, { id: r.rows[0].id, name, email, role });
        } catch (insertErr) {
          skipped.push({ row: rowNum, email, reason: insertErr.message });
        }
      }

      res.json({
        message: `Import complete — ${created.length} created, ${skipped.length} skipped`,
        created,
        skipped,
        total_rows: dataRows.length,
      });
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

