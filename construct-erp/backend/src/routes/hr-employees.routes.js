// src/routes/hr-employees.routes.js
// Employee CRUD + extended profile + documents
const express = require('express');
const router = express.Router();
const multer = require('multer');
const path   = require('path');
const fs     = require('fs');
const { authenticate, authorize } = require('../middleware/auth');
const { query } = require('../config/database');
const { runSchemaInit } = require('../utils/schemaInit');
const { uploadToSharePoint, deleteFromOneDrive } = require('../services/azureService');

// System/tenant admin logins that are not real employees — hidden from the
// general Employee List (they'd otherwise show as "NO HR PROFILE" cards or,
// for it@bcim.in, a staff card with no actual attendance to track). Kept
// as an explicit email list rather than a role/category rule so a future
// legitimate super_admin (e.g. an owner/director) never gets swept in.
const SYSTEM_ACCOUNT_EMAILS = ['admin@bcimengineering.onmicrosoft.com', 'it@bcim.in'];

const SHAREPOINT_ENABLED = !!(
  process.env.ONEDRIVE_TENANT_ID &&
  process.env.ONEDRIVE_CLIENT_ID &&
  process.env.ONEDRIVE_CLIENT_SECRET &&
  process.env.SHAREPOINT_SITE_ID
);
const { sendWelcomeLoginMail } = require('../services/mail.service');
const { createPasswordResetToken, getResetBaseUrl } = require('../controllers/auth.controller');

router.use(authenticate);
router.use(authorize('super_admin', 'admin', 'hr', 'hr_admin', 'hr_manager'));

// Fire-and-forget welcome email with a password-reset link — mirrors users.routes.js
const sendWelcomeMail = ({ id, name, email, role, department }) => {
  if (!email) return;
  const baseUrl = getResetBaseUrl();
  createPasswordResetToken(id)
    .then(token => sendWelcomeLoginMail({
      to:       email,
      name,
      role,
      department,
      loginUrl: baseUrl,
      resetUrl: `${baseUrl}/reset-password?token=${token}`,
    }))
    .then(r  => console.log(`[mail] Welcome email → ${email}: ${r.sent ? 'sent' : r.reason}`))
    .catch(e => console.error(`[mail] Welcome email failed for ${email}:`, e.message));
};

// ─── Multer setup ─────────────────────────────────────────────────────────────
const uploadDir = path.join(__dirname, '../../uploads/hr-docs');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename:    (req, file, cb) => cb(null, `${Date.now()}-${file.originalname.replace(/\s+/g, '_')}`),
});
const upload = multer({ storage, limits: { fileSize: 100 * 1024 * 1024 } });

// ─── Auto-create tables ───────────────────────────────────────────────────────
const initTables = async () => {
  await query(`
    CREATE TABLE IF NOT EXISTS employee_profiles (
      user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      company_id UUID REFERENCES companies(id),
      department_id UUID REFERENCES hr_departments(id),
      designation_id UUID REFERENCES hr_designations(id),
      date_of_joining DATE,
      date_of_birth DATE,
      gender TEXT,
      father_name TEXT,
      mother_name TEXT,
      marital_status TEXT,
      blood_group TEXT,
      nationality TEXT DEFAULT 'Indian',
      pan_number TEXT,
      aadhaar_number TEXT,
      uan_number TEXT,
      pf_account_number TEXT,
      esi_number TEXT,
      bank_name TEXT,
      bank_account_number TEXT,
      bank_ifsc TEXT,
      permanent_address TEXT,
      current_address TEXT,
      emergency_contact_name TEXT,
      emergency_contact_phone TEXT,
      employment_type TEXT DEFAULT 'permanent',
      reporting_manager_id UUID REFERENCES users(id),
      work_location TEXT,
      probation_end_date DATE,
      notice_period_days INT DEFAULT 30,
      date_of_leaving DATE,
      leaving_reason TEXT,
      employment_status TEXT DEFAULT 'active',
      profile_photo_url TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS employee_documents (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID REFERENCES users(id) ON DELETE CASCADE,
      doc_type TEXT NOT NULL,
      doc_name TEXT,
      file_url TEXT,
      uploaded_at TIMESTAMPTZ DEFAULT NOW(),
      uploaded_by UUID REFERENCES users(id)
    )
  `);
  await query(`ALTER TABLE employee_documents ADD COLUMN IF NOT EXISTS sharepoint_id TEXT`);
  await query(`ALTER TABLE employee_documents ADD COLUMN IF NOT EXISTS sharepoint_url TEXT`);
  await query(`ALTER TABLE employee_profiles ADD COLUMN IF NOT EXISTS reporting_manager_id UUID REFERENCES users(id)`);
  await query(`ALTER TABLE employee_profiles ADD COLUMN IF NOT EXISTS work_location TEXT`);
  await query(`ALTER TABLE employee_profiles ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id)`);
  // 'staff' = office/management employees, 'workman' = registered workmen/labour
  // (Form A — Employee Register category) — both live in the same rich profile
  // table so statutory fields (PAN/Aadhaar/UAN/ESI/bank) are never lost.
  await query(`ALTER TABLE employee_profiles ADD COLUMN IF NOT EXISTS employee_category TEXT DEFAULT 'staff'`);
  await query(`
    CREATE TABLE IF NOT EXISTS employee_timeline (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID REFERENCES users(id) ON DELETE CASCADE,
      company_id UUID REFERENCES companies(id),
      event_type TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      event_date DATE DEFAULT CURRENT_DATE,
      created_by UUID REFERENCES users(id),
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS employee_lifecycle_checklist (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID REFERENCES users(id) ON DELETE CASCADE,
      company_id UUID REFERENCES companies(id),
      stage TEXT NOT NULL,
      item_key TEXT NOT NULL,
      title TEXT NOT NULL,
      owner_department TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      remarks TEXT,
      due_date DATE,
      completed_at TIMESTAMPTZ,
      completed_by UUID REFERENCES users(id),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(user_id, stage, item_key)
    )
  `);
};
runSchemaInit('hr-employees', initTables);

// Add columns that may be missing from older deployments
runSchemaInit('hr-employees-cols-v2', async () => {
  const { query: q } = require('../config/database');
  await q(`ALTER TABLE employee_profiles ADD COLUMN IF NOT EXISTS employment_status TEXT DEFAULT 'active'`);
  await q(`ALTER TABLE employee_profiles ADD COLUMN IF NOT EXISTS date_of_leaving DATE`);
  await q(`ALTER TABLE employee_profiles ADD COLUMN IF NOT EXISTS leaving_reason TEXT`);
  await q(`ALTER TABLE employee_profiles ADD COLUMN IF NOT EXISTS profile_photo_url TEXT`);
  await q(`ALTER TABLE employee_profiles ADD COLUMN IF NOT EXISTS probation_end_date DATE`);
  await q(`ALTER TABLE employee_profiles ADD COLUMN IF NOT EXISTS notice_period_days INT DEFAULT 30`);
});

// Trade + contractor company for site labour — static per-employee attributes
// used by the Timesheet Report (from the Daily Labour Report format)
runSchemaInit('hr-employees-trade-contractor', async () => {
  const { query: q } = require('../config/database');
  await q(`ALTER TABLE employee_profiles ADD COLUMN IF NOT EXISTS trade            VARCHAR(100)`);
  await q(`ALTER TABLE employee_profiles ADD COLUMN IF NOT EXISTS contractor_name  VARCHAR(200)`);
});

runSchemaInit('hr-employees-docs-sharepoint', async () => {
  const { query: q } = require('../config/database');
  await q(`ALTER TABLE employee_documents ADD COLUMN IF NOT EXISTS sharepoint_id TEXT`);
  await q(`ALTER TABLE employee_documents ADD COLUMN IF NOT EXISTS sharepoint_url TEXT`);
});

// Document verification workflow (Onboarding Dashboard) — existing rows stay
// 'pending' since no verification actually happened for them historically.
runSchemaInit('hr-employees-doc-verification', async () => {
  const { query: q } = require('../config/database');
  await q(`ALTER TABLE employee_documents ADD COLUMN IF NOT EXISTS verification_status TEXT NOT NULL DEFAULT 'pending'`);
  await q(`ALTER TABLE employee_documents ADD COLUMN IF NOT EXISTS verified_by UUID REFERENCES users(id)`);
  await q(`ALTER TABLE employee_documents ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ`);
  await q(`ALTER TABLE employee_documents ADD COLUMN IF NOT EXISTS rejection_reason TEXT`);
  await q(`
    DO $$ BEGIN
      ALTER TABLE employee_documents ADD CONSTRAINT employee_documents_verification_status_check
        CHECK (verification_status IN ('pending','verified','rejected'));
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  `);
  await q(`CREATE INDEX IF NOT EXISTS idx_empdocs_user_status ON employee_documents(user_id, verification_status)`);
});

// Lifecycle checklist metadata (Onboarding Dashboard tracker) — sort_order is
// required so the expanded item list below renders in the intended sequence
// (GET /:id orders by created_at, which has no relation to onboarding stage order).
runSchemaInit('hr-lifecycle-v2-metadata', async () => {
  const { query: q } = require('../config/database');
  await q(`ALTER TABLE employee_lifecycle_checklist ADD COLUMN IF NOT EXISTS sort_order INT DEFAULT 999`);
  await q(`ALTER TABLE employee_lifecycle_checklist ADD COLUMN IF NOT EXISTS stage_group TEXT`);
  await q(`ALTER TABLE employee_lifecycle_checklist ADD COLUMN IF NOT EXISTS auto_source TEXT`);
  await q(`ALTER TABLE employee_lifecycle_checklist ADD COLUMN IF NOT EXISTS location TEXT`);
  await q(`ALTER TABLE employee_lifecycle_checklist ADD COLUMN IF NOT EXISTS assigned_to UUID REFERENCES users(id)`);
  await q(`CREATE INDEX IF NOT EXISTS idx_lifecycle_stage_status ON employee_lifecycle_checklist(company_id, stage, status)`);
  await q(`CREATE INDEX IF NOT EXISTS idx_lifecycle_user_stage ON employee_lifecycle_checklist(user_id, stage)`);
});

// Onboarding-state columns on employee_profiles — "in onboarding"/"completed"
// are otherwise derived at query time from checklist completion; these two
// timestamps just record when that derived state actually changed, for
// reporting (time-to-onboard) without re-deriving history.
runSchemaInit('hr-onboarding-state-v1', async () => {
  const { query: q } = require('../config/database');
  await q(`ALTER TABLE employee_profiles ADD COLUMN IF NOT EXISTS onboarding_completed_at TIMESTAMPTZ`);
  await q(`ALTER TABLE employee_profiles ADD COLUMN IF NOT EXISTS onboarding_started_at TIMESTAMPTZ`);
});

// Backfill the 12 new onboarding checklist items onto every existing employee
// (not just future hires, per confirmed product decision — their onboarding %
// will visibly dip until reconcileDerived() catches most items back up from
// real data) + refresh the email_setup title text on pre-existing rows, since
// ON CONFLICT DO NOTHING above never updates an already-seeded row's title.
runSchemaInit('hr-onboarding-backfill-checklist-v1', async () => {
  const { query: q } = require('../config/database');
  const { rows } = await q(`SELECT user_id, company_id FROM employee_profiles`);
  for (const r of rows) {
    await ensureLifecycleChecklist(r.company_id, r.user_id, q);
  }
  await q(`
    UPDATE employee_lifecycle_checklist
    SET title = 'Official email account created'
    WHERE stage = 'onboarding' AND item_key = 'email_setup' AND title = 'Email and ERP access created'
  `);
});

// The backfill migration above only INSERTs missing rows — it never touches
// rows that already existed for the 7 originally-shipped onboarding item_keys
// (they predate the sort_order/stage_group/auto_source columns, so those
// columns are still at their ALTER-time defaults: 999 / NULL / NULL). Refresh
// every onboarding row's metadata from LIFECYCLE_ITEMS regardless of when it
// was created.
runSchemaInit('hr-onboarding-backfill-metadata-fix-v1', async () => {
  const { query: q } = require('../config/database');
  for (const item of LIFECYCLE_ITEMS) {
    if (item.stage !== 'onboarding') continue;
    await q(
      `UPDATE employee_lifecycle_checklist
       SET stage_group = $1, sort_order = $2, auto_source = $3
       WHERE stage = 'onboarding' AND item_key = $4`,
      [item.stage_group || null, item.sort_order || 999, item.auto_source || null, item.item_key]
    );
  }
});

// ─── Helpers ──────────────────────────────────────────────────────────────────
const employeeSelect = `
  SELECT u.id, u.employee_code, u.name, u.email, u.phone, u.role, u.designation,
         u.department, u.is_active,
         (ep.user_id IS NOT NULL) AS has_profile,
         ep.department_id, ep.designation_id, ep.date_of_joining, ep.date_of_birth,
         ep.gender, ep.father_name, ep.mother_name, ep.marital_status, ep.blood_group,
         ep.nationality, ep.pan_number, ep.aadhaar_number, ep.uan_number,
         ep.pf_account_number, ep.esi_number, ep.bank_name, ep.bank_account_number,
         ep.bank_ifsc, ep.permanent_address, ep.current_address,
         ep.emergency_contact_name, ep.emergency_contact_phone,
         ep.employment_type, ep.employee_category, ep.reporting_manager_id, mgr.name as reporting_manager_name,
         ep.work_location, ep.project_id, proj.name as project_name, proj.project_code,
         ep.trade, ep.contractor_name,
         ep.probation_end_date, ep.notice_period_days,
         ep.date_of_leaving, ep.leaving_reason, ep.employment_status, ep.profile_photo_url,
         dep.name as department_name, des.name as designation_name, des.grade
  FROM users u
  LEFT JOIN employee_profiles ep ON ep.user_id = u.id
  LEFT JOIN hr_departments dep ON dep.id = ep.department_id
  LEFT JOIN hr_designations des ON des.id = ep.designation_id
  LEFT JOIN users mgr ON mgr.id = ep.reporting_manager_id
  LEFT JOIN projects proj ON proj.id = ep.project_id
`;

async function addTimeline(client, companyId, userId, eventType, title, description, actorId, eventDate = null) {
  await client.query(
    `INSERT INTO employee_timeline
     (user_id, company_id, event_type, title, description, event_date, created_by)
     VALUES ($1,$2,$3,$4,$5,COALESCE($6::date, CURRENT_DATE),$7)`,
    [userId, companyId, eventType, title, description || null, eventDate || null, actorId]
  );
}

// ═══════════════════════════════════════════════════════════
// Onboarding items carry stage_group (one of the 8 Onboarding Tracker steps:
// profile, documents, assets, email, training, orientation, probation,
// confirmation) + sort_order (render sequence) + auto_source (which real
// data source, if any, auto-ticks this item — see reconcileDerived() in
// hr-onboarding.routes.js). Never rename an item_key here — the UNIQUE
// constraint means a rename orphans existing rows and re-seeds a duplicate;
// only add new keys or change title text.
const LIFECYCLE_ITEMS = [
  { stage: 'onboarding', item_key: 'offer_acceptance',   title: 'Offer acceptance received',                 owner_department: 'HR',            stage_group: 'documents',   sort_order: 10,  auto_source: null },
  { stage: 'onboarding', item_key: 'joining_documents',  title: 'Joining documents collected',                owner_department: 'HR',            stage_group: 'documents',   sort_order: 20,  auto_source: 'any_doc' },
  { stage: 'onboarding', item_key: 'profile_basics',     title: 'Employee profile completed',                 owner_department: 'HR',            stage_group: 'profile',     sort_order: 30,  auto_source: 'profile' },
  { stage: 'onboarding', item_key: 'profile_photo',      title: 'Profile photo uploaded',                     owner_department: 'HR',            stage_group: 'profile',     sort_order: 40,  auto_source: 'photo' },
  { stage: 'onboarding', item_key: 'doc_verify_pan',     title: 'PAN card verified',                          owner_department: 'HR',            stage_group: 'documents',   sort_order: 50,  auto_source: 'doc:pan' },
  { stage: 'onboarding', item_key: 'doc_verify_aadhaar', title: 'Aadhaar card verified',                      owner_department: 'HR',            stage_group: 'documents',   sort_order: 60,  auto_source: 'doc:aadhaar' },
  { stage: 'onboarding', item_key: 'bank_pf_esi',        title: 'Bank, PF and ESI details verified',          owner_department: 'HR / Accounts', stage_group: 'documents',   sort_order: 70,  auto_source: 'bank' },
  { stage: 'onboarding', item_key: 'id_card',            title: 'ID card issued',                             owner_department: 'Admin',         stage_group: 'assets',      sort_order: 80,  auto_source: null },
  { stage: 'onboarding', item_key: 'asset_issue',        title: 'Laptop / assets issued',                     owner_department: 'Admin / IT',    stage_group: 'assets',      sort_order: 90,  auto_source: 'asset:laptop' },
  { stage: 'onboarding', item_key: 'email_setup',        title: 'Official email account created',             owner_department: 'IT',            stage_group: 'email',       sort_order: 100, auto_source: null },
  { stage: 'onboarding', item_key: 'erp_login',          title: 'ERP login account created',                  owner_department: 'IT',            stage_group: 'email',       sort_order: 110, auto_source: null },
  { stage: 'onboarding', item_key: 'access_permissions', title: 'System / module access permissions granted', owner_department: 'IT',            stage_group: 'email',       sort_order: 120, auto_source: null },
  { stage: 'onboarding', item_key: 'training_assigned',  title: 'Induction training assigned',                owner_department: 'HR',            stage_group: 'training',    sort_order: 130, auto_source: 'training' },
  { stage: 'onboarding', item_key: 'safety_induction',   title: 'Safety / site induction completed',          owner_department: 'HSE / Projects', stage_group: 'orientation', sort_order: 140, auto_source: null },
  { stage: 'onboarding', item_key: 'orientation',        title: 'Orientation session completed',              owner_department: 'HR',            stage_group: 'orientation', sort_order: 150, auto_source: null },
  { stage: 'onboarding', item_key: 'manager_intro',      title: 'Introduced to reporting manager and team',   owner_department: 'Reporting Manager', stage_group: 'orientation', sort_order: 160, auto_source: null },
  { stage: 'onboarding', item_key: 'policy_ack',         title: 'Company policies acknowledged',              owner_department: 'HR',            stage_group: 'orientation', sort_order: 170, auto_source: 'policy' },
  { stage: 'onboarding', item_key: 'probation_review',   title: 'Probation review scheduled',                 owner_department: 'Reporting Manager', stage_group: 'probation', sort_order: 180, auto_source: null },
  { stage: 'onboarding', item_key: 'confirmation',       title: 'Employment confirmed',                       owner_department: 'HR',            stage_group: 'confirmation', sort_order: 190, auto_source: 'confirmation' },
  { stage: 'exit', item_key: 'resignation_acceptance', title: 'Resignation / exit approval recorded', owner_department: 'HR' },
  { stage: 'exit', item_key: 'knowledge_handover', title: 'Work handover completed', owner_department: 'Reporting Manager' },
  { stage: 'exit', item_key: 'asset_return', title: 'Company assets returned', owner_department: 'Admin / IT' },
  { stage: 'exit', item_key: 'dues_clearance', title: 'Advance / loan / dues clearance checked', owner_department: 'Accounts' },
  { stage: 'exit', item_key: 'access_disable', title: 'ERP, email and system access disabled', owner_department: 'IT' },
  { stage: 'exit', item_key: 'final_settlement', title: 'Full and final settlement processed', owner_department: 'Accounts / HR' },
  { stage: 'exit', item_key: 'relieving_letter', title: 'Relieving / experience letter issued', owner_department: 'HR' },
];

// One bulk INSERT (unnest arrays) instead of one round-trip per item — matters
// for the one-time backfill migration, which calls this for every existing
// employee (216 employees x 19 items = 4104+ rows would otherwise mean 4104+
// sequential network round-trips to the DB).
async function ensureLifecycleChecklist(companyId, userId, exec = query) {
  const stages = LIFECYCLE_ITEMS.map(i => i.stage);
  const keys = LIFECYCLE_ITEMS.map(i => i.item_key);
  const titles = LIFECYCLE_ITEMS.map(i => i.title);
  const owners = LIFECYCLE_ITEMS.map(i => i.owner_department || null);
  const groups = LIFECYCLE_ITEMS.map(i => i.stage_group || null);
  const sorts = LIFECYCLE_ITEMS.map(i => i.sort_order || 999);
  const autos = LIFECYCLE_ITEMS.map(i => i.auto_source || null);
  await exec(
    `INSERT INTO employee_lifecycle_checklist
     (user_id, company_id, stage, item_key, title, owner_department, stage_group, sort_order, auto_source)
     SELECT $1, $2, s, k, t, o, g, so, a
     FROM unnest($3::text[], $4::text[], $5::text[], $6::text[], $7::text[], $8::int[], $9::text[])
       AS x(s, k, t, o, g, so, a)
     ON CONFLICT (user_id, stage, item_key) DO NOTHING`,
    [userId, companyId, stages, keys, titles, owners, groups, sorts, autos]
  );
}

// LIST
// ═══════════════════════════════════════════════════════════
router.get('/', async (req, res) => {
  try {
    const { search, department_id, employment_status, employment_type, no_profile, project_id } = req.query;
    let sql = `${employeeSelect} WHERE u.company_id = $1`;
    const params = [req.user.company_id];
    let idx = 2;

    if (SYSTEM_ACCOUNT_EMAILS.length) {
      sql += ` AND u.email != ALL($${idx}::text[])`;
      params.push(SYSTEM_ACCOUNT_EMAILS); idx++;
    }

    if (no_profile === 'true') {
      sql += ' AND ep.user_id IS NULL';
    } else {
      if (search) {
        sql += ` AND (u.name ILIKE $${idx} OR u.employee_code ILIKE $${idx} OR u.email ILIKE $${idx})`;
        params.push(`%${search}%`); idx++;
      }
      if (department_id) {
        sql += ` AND ep.department_id = $${idx}`;
        params.push(department_id); idx++;
      }
      if (employment_status) {
        sql += ` AND COALESCE(ep.employment_status, 'active') = $${idx}`;
        params.push(employment_status); idx++;
      }
      if (employment_type) {
        sql += ` AND ep.employment_type = $${idx}`;
        params.push(employment_type); idx++;
      }
      if (req.query.employee_category) {
        sql += ` AND ep.employee_category = $${idx}`;
        params.push(req.query.employee_category); idx++;
      }
      if (project_id === 'unassigned') {
        sql += ` AND ep.project_id IS NULL`;
      } else if (project_id) {
        sql += ` AND ep.project_id = $${idx}`;
        params.push(project_id); idx++;
      }
    }
    sql += ' ORDER BY u.name';

    const { rows } = await query(sql, params);
    res.json({ data: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════
router.get('/compliance/alerts', async (req, res) => {
  try {
    const companyId = req.user.company_id;
    const [probation, missingDocs, missingStatutory, exitPending] = await Promise.all([
      query(
        `SELECT u.id, u.name, u.employee_code, u.email, ep.probation_end_date,
                dep.name as department_name, des.name as designation_name,
                ep.probation_end_date - CURRENT_DATE as days_left
         FROM users u
         JOIN employee_profiles ep ON ep.user_id = u.id
         LEFT JOIN hr_departments dep ON dep.id = ep.department_id
         LEFT JOIN hr_designations des ON des.id = ep.designation_id
         WHERE u.company_id = $1
           AND COALESCE(ep.employment_status, 'active') = 'active'
           AND ep.probation_end_date IS NOT NULL
           AND ep.probation_end_date BETWEEN CURRENT_DATE - 15 AND CURRENT_DATE + 30
         ORDER BY ep.probation_end_date ASC`,
        [companyId]
      ),
      query(
        `SELECT u.id, u.name, u.employee_code, u.email,
                dep.name as department_name, des.name as designation_name,
                COUNT(d.id)::int as document_count
         FROM users u
         LEFT JOIN employee_profiles ep ON ep.user_id = u.id
         LEFT JOIN hr_departments dep ON dep.id = ep.department_id
         LEFT JOIN hr_designations des ON des.id = ep.designation_id
         LEFT JOIN employee_documents d ON d.user_id = u.id
         WHERE u.company_id = $1
           AND COALESCE(ep.employment_status, 'active') = 'active'
         GROUP BY u.id, u.name, u.employee_code, u.email, dep.name, des.name
         HAVING COUNT(d.id) = 0
         ORDER BY u.name
         LIMIT 25`,
        [companyId]
      ),
      query(
        `SELECT u.id, u.name, u.employee_code, u.email,
                dep.name as department_name, des.name as designation_name,
                ARRAY_REMOVE(ARRAY[
                  CASE WHEN NULLIF(ep.pan_number, '') IS NULL THEN 'PAN' END,
                  CASE WHEN NULLIF(ep.aadhaar_number, '') IS NULL THEN 'Aadhaar' END,
                  CASE WHEN NULLIF(ep.bank_account_number, '') IS NULL THEN 'Bank Account' END,
                  CASE WHEN NULLIF(ep.bank_ifsc, '') IS NULL THEN 'IFSC' END
                ], NULL) as missing_fields
         FROM users u
         LEFT JOIN employee_profiles ep ON ep.user_id = u.id
         LEFT JOIN hr_departments dep ON dep.id = ep.department_id
         LEFT JOIN hr_designations des ON des.id = ep.designation_id
         WHERE u.company_id = $1
           AND COALESCE(ep.employment_status, 'active') = 'active'
           AND (
             NULLIF(ep.pan_number, '') IS NULL OR
             NULLIF(ep.aadhaar_number, '') IS NULL OR
             NULLIF(ep.bank_account_number, '') IS NULL OR
             NULLIF(ep.bank_ifsc, '') IS NULL
           )
         ORDER BY u.name
         LIMIT 25`,
        [companyId]
      ),
      query(
        `SELECT u.id, u.name, u.employee_code, ep.employment_status,
                COUNT(lc.id) FILTER (WHERE lc.stage='exit' AND lc.status='pending')::int as pending_exit_items
         FROM users u
         JOIN employee_profiles ep ON ep.user_id = u.id
         LEFT JOIN employee_lifecycle_checklist lc ON lc.user_id = u.id AND lc.company_id = u.company_id
         WHERE u.company_id = $1
           AND COALESCE(ep.employment_status, 'active') IN ('resigned', 'terminated', 'inactive')
         GROUP BY u.id, u.name, u.employee_code, ep.employment_status
         HAVING COUNT(lc.id) FILTER (WHERE lc.stage='exit' AND lc.status='pending') > 0
         ORDER BY u.name
         LIMIT 25`,
        [companyId]
      ),
    ]);

    res.json({
      data: {
        probation_due: probation.rows,
        missing_documents: missingDocs.rows,
        missing_statutory: missingStatutory.rows,
        exit_pending: exitPending.rows,
      },
      totals: {
        probation_due: probation.rows.length,
        missing_documents: missingDocs.rows.length,
        missing_statutory: missingStatutory.rows.length,
        exit_pending: exitPending.rows.length,
      },
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET SINGLE (with documents)
// ═══════════════════════════════════════════════════════════
router.get('/:id', async (req, res) => {
  try {
    const { rows } = await query(
      `${employeeSelect} WHERE u.id = $1 AND u.company_id = $2`,
      [req.params.id, req.user.company_id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Employee not found' });

    await ensureLifecycleChecklist(req.user.company_id, req.params.id);

    const docs = await query(
      `SELECT * FROM employee_documents WHERE user_id = $1 ORDER BY uploaded_at DESC`,
      [req.params.id]
    );
    const timeline = await query(
      `SELECT t.*, u.name as created_by_name
       FROM employee_timeline t
       LEFT JOIN users u ON u.id = t.created_by
       WHERE t.user_id = $1
       ORDER BY t.event_date DESC, t.created_at DESC`,
      [req.params.id]
    );
    const lifecycle = await query(
      `SELECT lc.*, u.name as completed_by_name
       FROM employee_lifecycle_checklist lc
       LEFT JOIN users u ON u.id = lc.completed_by
       WHERE lc.user_id = $1 AND lc.company_id = $2
       ORDER BY
         CASE lc.stage WHEN 'onboarding' THEN 1 WHEN 'exit' THEN 2 ELSE 3 END,
         lc.sort_order ASC, lc.created_at ASC`,
      [req.params.id, req.user.company_id]
    );
    res.json({ data: { ...rows[0], documents: docs.rows, timeline: timeline.rows, lifecycle_checklist: lifecycle.rows } });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════
// CREATE (user + profile together)
// ═══════════════════════════════════════════════════════════
router.post('/', async (req, res) => {
  const client = (await require('../config/database').pool.connect());
  try {
    await client.query('BEGIN');

    const {
      // User fields
      name, phone, role, employee_code,
      // Profile fields
      department_id, designation_id, date_of_joining, date_of_birth, gender,
      father_name, mother_name, marital_status, blood_group, nationality,
      pan_number, aadhaar_number, uan_number, pf_account_number, esi_number,
      bank_name, bank_account_number, bank_ifsc,
      permanent_address, current_address,
      emergency_contact_name, emergency_contact_phone,
      employment_type, probation_end_date, notice_period_days,
      reporting_manager_id, work_location, project_id,
    } = req.body;

    const isWorker = req.body.employee_category === 'workman';
    // Workers may have no email; normalize empty string to null to avoid UNIQUE conflicts
    const email = req.body.email?.trim() || null;
    if (!isWorker && !email) return res.status(400).json({ error: 'Email is required for BCIM Staff' });
    if (!name) return res.status(400).json({ error: 'Name is required' });

    // Generate employee code if not provided
    const code = employee_code || await generateEmpCode(req.user.company_id);

    // Guard against re-creating the exact bug that caused 80 subcontractor
    // labourers to be double-counted on every timesheet: someone entering the
    // same worker into BOTH the HR employee master AND the SC Workers module
    // under the same code. If this code already belongs to an active SC
    // worker, this person almost certainly belongs in SC Workers, not here.
    const scClash = await client.query(
      `SELECT worker_name, sc.name AS contractor_name FROM sc_workers w
       LEFT JOIN sc_subcontractors sc ON sc.id = w.sc_id
       WHERE w.worker_code = $1 AND w.company_id = $2 AND w.status = 'active'`,
      [code, req.user.company_id]
    );
    if (scClash.rows.length) {
      await client.query('ROLLBACK');
      const c = scClash.rows[0];
      return res.status(409).json({
        error: `Code '${code}' already belongs to subcontractor labour "${c.worker_name}"${c.contractor_name ? ` (${c.contractor_name})` : ''} in SC Workers. If this is the same person, add them there instead of HR — entering them in both places double-counts them on every timesheet.`
      });
    }

    // Create user with a temporary password (emp code as password, they should change)
    const bcrypt = require('bcryptjs');
    const tempPassword = await bcrypt.hash(code, 10);

    // Get dept/desig names for denormalized user fields
    let deptName = '', desigName = '';
    if (department_id) {
      const dr = await client.query(`SELECT name FROM hr_departments WHERE id=$1`, [department_id]);
      deptName = dr.rows[0]?.name || '';
    }
    if (designation_id) {
      const dr = await client.query(`SELECT name FROM hr_designations WHERE id=$1`, [designation_id]);
      desigName = dr.rows[0]?.name || '';
    }

    const userRes = await client.query(
      `INSERT INTO users (company_id, employee_code, name, email, phone, role, designation, department, password_hash, is_active)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,TRUE) RETURNING id`,
      [req.user.company_id, code, name, email, phone || null,
       role || 'viewer', desigName, deptName, tempPassword]
    );
    const userId = userRes.rows[0].id;

    await client.query(
      `INSERT INTO employee_profiles
       (user_id, company_id, department_id, designation_id, date_of_joining, date_of_birth,
        gender, father_name, mother_name, marital_status, blood_group, nationality,
        pan_number, aadhaar_number, uan_number, pf_account_number, esi_number,
        bank_name, bank_account_number, bank_ifsc, permanent_address, current_address,
        emergency_contact_name, emergency_contact_phone, employment_type, employee_category,
        reporting_manager_id, work_location, project_id, probation_end_date, notice_period_days)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31)`,
      [userId, req.user.company_id, department_id || null, designation_id || null,
       date_of_joining || null, date_of_birth || null, gender || null,
       father_name || null, mother_name || null, marital_status || null,
       blood_group || null, nationality || 'Indian', pan_number || null,
       aadhaar_number || null, uan_number || null, pf_account_number || null,
       esi_number || null, bank_name || null, bank_account_number || null,
       bank_ifsc || null, permanent_address || null, current_address || null,
       emergency_contact_name || null, emergency_contact_phone || null,
       employment_type || 'permanent', req.body.employee_category || 'staff',
       reporting_manager_id || null, work_location || null,
       project_id || null, probation_end_date || null, notice_period_days || 30]
    );

    await addTimeline(
      client,
      req.user.company_id,
      userId,
      'joining',
      'Employee profile created',
      `${name} joined as ${desigName || 'employee'}${deptName ? ` in ${deptName}` : ''}.`,
      req.user.id,
      date_of_joining || null
    );

    // Eager-seed the onboarding checklist now, not lazily on first profile
    // view — otherwise brand-new hires are invisible on the Onboarding
    // Dashboard until someone happens to open their profile page.
    await ensureLifecycleChecklist(req.user.company_id, userId, client.query.bind(client));
    await client.query(
      `UPDATE employee_profiles SET onboarding_started_at = NOW() WHERE user_id = $1`,
      [userId]
    );

    await client.query('COMMIT');

    sendWelcomeMail({ id: userId, name, email, role: role || 'viewer', department: deptName });
    try {
      require('../services/notif.helper').notifyOnboardingStarted(req.user.company_id, { id: userId, name });
    } catch { /* best-effort */ }

    // Return full employee record
    const { rows } = await query(`${employeeSelect} WHERE u.id = $1`, [userId]);
    res.status(201).json({ data: rows[0], temp_password: code });
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23505') return res.status(400).json({ error: 'Employee with this email or code already exists' });
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// ═══════════════════════════════════════════════════════════
// UPDATE PROFILE
// ═══════════════════════════════════════════════════════════
router.put('/:id', async (req, res) => {
  const client = (await require('../config/database').pool.connect());
  try {
    await client.query('BEGIN');

    const {
      name, email, phone, role, employee_code,
      department_id, designation_id, date_of_joining, date_of_birth, gender,
      father_name, mother_name, marital_status, blood_group, nationality,
      pan_number, aadhaar_number, uan_number, pf_account_number, esi_number,
      bank_name, bank_account_number, bank_ifsc, permanent_address, current_address,
      emergency_contact_name, emergency_contact_phone, employment_type, employee_category,
      probation_end_date, notice_period_days, reporting_manager_id, work_location, project_id,
      date_of_leaving, leaving_reason, employment_status,
    } = req.body;

    let deptName = '', desigName = '';
    if (department_id) {
      const dr = await client.query(`SELECT name FROM hr_departments WHERE id=$1`, [department_id]);
      deptName = dr.rows[0]?.name || '';
    }
    if (designation_id) {
      const dr = await client.query(`SELECT name FROM hr_designations WHERE id=$1`, [designation_id]);
      desigName = dr.rows[0]?.name || '';
    }

    const prevStatusRes = await client.query(
      `SELECT employment_status FROM employee_profiles WHERE user_id=$1 AND company_id=$2`,
      [req.params.id, req.user.company_id]
    );
    const previousEmploymentStatus = prevStatusRes.rows[0]?.employment_status || null;

    // Guard: never let an HR employee-record edit silently downgrade a
    // super_admin. Editing it@bcim.in's (or any super_admin's) profile here
    // used to overwrite users.role with `role || 'viewer'`, stripping their
    // access until the next server restart re-ran the boot-time super_admin
    // self-heal. Protect the top-admin account (and any current super_admin)
    // by preserving super_admin regardless of the submitted role.
    const cur = await client.query(
      `SELECT email, role FROM users WHERE id=$1 AND company_id=$2`,
      [req.params.id, req.user.company_id]
    );
    const curEmail = String(cur.rows[0]?.email || '').toLowerCase();
    const isProtectedAdmin = curEmail === 'it@bcim.in' || cur.rows[0]?.role === 'super_admin';
    // Roles that HR can assign; super_admin is never assignable via this endpoint
    const ASSIGNABLE_ROLES = new Set(['viewer','employee','qs_engineer','site_engineer',
      'project_manager','project_head','department_head','hr','hr_manager','admin','hr_admin']);
    const requestedRole = role && ASSIGNABLE_ROLES.has(role) ? role : (cur.rows[0]?.role || 'employee');
    const effectiveRole = isProtectedAdmin ? 'super_admin' : requestedRole;
    const effectiveEmail = curEmail === 'it@bcim.in' ? cur.rows[0].email : email;

    // Only update employee_code if a non-empty value was submitted and it's not already taken
    let effectiveCode = null;
    if (employee_code && String(employee_code).trim()) {
      const trimmedCode = employee_code.trim();
      const codeCheck = await client.query(
        `SELECT id FROM users WHERE employee_code=$1 AND company_id=$2 AND id<>$3`,
        [trimmedCode, req.user.company_id, req.params.id]
      );
      if (codeCheck.rows.length > 0) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: `Employee code '${employee_code}' is already in use by another employee.` });
      }
      // Same cross-table guard as employee creation — see the comment there.
      const scClash = await client.query(
        `SELECT worker_name, sc.name AS contractor_name FROM sc_workers w
         LEFT JOIN sc_subcontractors sc ON sc.id = w.sc_id
         WHERE w.worker_code = $1 AND w.company_id = $2 AND w.status = 'active'`,
        [trimmedCode, req.user.company_id]
      );
      if (scClash.rows.length) {
        await client.query('ROLLBACK');
        const c = scClash.rows[0];
        return res.status(409).json({
          error: `Code '${trimmedCode}' already belongs to subcontractor labour "${c.worker_name}"${c.contractor_name ? ` (${c.contractor_name})` : ''} in SC Workers. Entering the same person in both places double-counts them on every timesheet.`
        });
      }
      effectiveCode = trimmedCode;
    }

    await client.query(
      `UPDATE users SET name=$1, email=$2, phone=$3, role=$4, designation=$5, department=$6
         ${effectiveCode ? ', employee_code=$9' : ''}
       WHERE id=$7 AND company_id=$8`,
      effectiveCode
        ? [name, effectiveEmail, phone || null, effectiveRole, desigName, deptName, req.params.id, req.user.company_id, effectiveCode]
        : [name, effectiveEmail, phone || null, effectiveRole, desigName, deptName, req.params.id, req.user.company_id]
    );

    await client.query(
      `INSERT INTO employee_profiles
       (user_id, company_id, department_id, designation_id, date_of_joining, date_of_birth,
        gender, father_name, mother_name, marital_status, blood_group, nationality,
        pan_number, aadhaar_number, uan_number, pf_account_number, esi_number,
        bank_name, bank_account_number, bank_ifsc, permanent_address, current_address,
        emergency_contact_name, emergency_contact_phone, employment_type, employee_category,
        reporting_manager_id, work_location, project_id, probation_end_date, notice_period_days,
        date_of_leaving, leaving_reason, employment_status, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,NOW())
       ON CONFLICT (user_id) DO UPDATE SET
         department_id=$3, designation_id=$4, date_of_joining=$5, date_of_birth=$6,
         gender=$7, father_name=$8, mother_name=$9, marital_status=$10, blood_group=$11,
         nationality=$12, pan_number=$13, aadhaar_number=$14, uan_number=$15,
         pf_account_number=$16, esi_number=$17, bank_name=$18, bank_account_number=$19,
         bank_ifsc=$20, permanent_address=$21, current_address=$22,
         emergency_contact_name=$23, emergency_contact_phone=$24, employment_type=$25,
         employee_category=$26, reporting_manager_id=$27, work_location=$28,
         project_id=$29, probation_end_date=$30, notice_period_days=$31,
         date_of_leaving=$32, leaving_reason=$33, employment_status=$34, updated_at=NOW()`,
      [req.params.id, req.user.company_id, department_id || null, designation_id || null,
       date_of_joining || null, date_of_birth || null, gender || null,
       father_name || null, mother_name || null, marital_status || null,
       blood_group || null, nationality || 'Indian', pan_number || null,
       aadhaar_number || null, uan_number || null, pf_account_number || null,
       esi_number || null, bank_name || null, bank_account_number || null,
       bank_ifsc || null, permanent_address || null, current_address || null,
       emergency_contact_name || null, emergency_contact_phone || null,
       employment_type || 'permanent', employee_category || 'staff',
       reporting_manager_id || null, work_location || null,
       project_id || null, probation_end_date || null, notice_period_days || 30,
       date_of_leaving || null, leaving_reason || null, employment_status || 'active']
    );

    await syncExitToWorkerRoster(
      (sql, params) => client.query(sql, params),
      req.params.id, req.user.company_id, employment_status, previousEmploymentStatus
    );

    await addTimeline(
      client,
      req.user.company_id,
      req.params.id,
      'profile_update',
      'Employee profile updated',
      'HR profile, reporting or statutory details were updated.',
      req.user.id
    );

    await client.query('COMMIT');
    const { rows } = await query(`${employeeSelect} WHERE u.id = $1`, [req.params.id]);
    res.json({ data: rows[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// Site workers exist twice: once in users/employee_profiles and again in
// sc_workers (subcontractor roster). Marking someone resigned in HR only
// touched the first, so the sc_workers copy kept status='active' and kept
// showing up in the daily timesheet and every other attendance report.
// Mirror any non-active employment_status onto both sc_workers and
// users.is_active so one HR action fully retires the person.
// 'inactive' is deliberately NOT an exit here. In this database it is an
// import artifact, not a status anyone set on purpose: all 41 people carrying
// it worked in the last 7 days, and none has a date_of_leaving. Treating it as
// an exit silently deactivated 41 working labourers across Bahulaya Buildcast,
// Habibur Rahaman and MD Faruk, emptying those contractors from the timesheet.
// Only the statuses that actually mean "gone" propagate.
const EXIT_STATUSES = ['resigned', 'terminated', 'absconded'];

async function syncExitToWorkerRoster(runner, userId, companyId, employmentStatus, previousEmploymentStatus) {
  if (!EXIT_STATUSES.includes(employmentStatus)) {
    // Only reactivate when this save is specifically undoing a previous exit
    // (e.g. an accidental "resigned" corrected back to "active"). Without
    // this, users.is_active stayed FALSE forever after such a correction —
    // the account was fully retired above, but nothing ever reversed that
    // half of it, so the person kept showing "active" in the employee list
    // while being invisible in every attendance query (which all require
    // users.is_active = TRUE). Gating on the *previous* status (rather than
    // reactivating any is_active=FALSE account on every save) avoids
    // silently undoing an unrelated deliberate account disable done via the
    // separate Users/admin page.
    if (previousEmploymentStatus && EXIT_STATUSES.includes(previousEmploymentStatus)) {
      await runner(
        `UPDATE users SET is_active=TRUE WHERE id=$1 AND company_id=$2 AND is_active=FALSE`,
        [userId, companyId]
      );
    }
    return;
  }

  const { rows } = await runner(
    `SELECT employee_code FROM users WHERE id=$1 AND company_id=$2`,
    [userId, companyId]
  );
  const code = rows[0]?.employee_code;
  if (code) {
    await runner(
      `UPDATE sc_workers SET status='inactive'
       WHERE company_id=$1 AND worker_code=$2 AND status='active'`,
      [companyId, code]
    );
  }
  await runner(
    `UPDATE users SET is_active=FALSE WHERE id=$1 AND company_id=$2`,
    [userId, companyId]
  );
}

// ═══════════════════════════════════════════════════════════
// UPDATE STATUS (exit / terminate etc)
// ═══════════════════════════════════════════════════════════
router.patch('/:id/status', async (req, res) => {
  try {
    const { employment_status, date_of_leaving, leaving_reason, is_active } = req.body;
    const prevStatusRes = await query(
      `SELECT employment_status FROM employee_profiles WHERE user_id=$1 AND company_id=$2`,
      [req.params.id, req.user.company_id]
    );
    const previousEmploymentStatus = prevStatusRes.rows[0]?.employment_status || null;
    await query(
      `UPDATE employee_profiles SET employment_status=$1, date_of_leaving=$2, leaving_reason=$3, updated_at=NOW()
       WHERE user_id=$4 AND company_id=$5`,
      [employment_status, date_of_leaving || null, leaving_reason || null,
       req.params.id, req.user.company_id]
    );
    if (is_active !== undefined) {
      await query(`UPDATE users SET is_active=$1 WHERE id=$2 AND company_id=$3`,
        [is_active, req.params.id, req.user.company_id]);
    }
    await syncExitToWorkerRoster(query, req.params.id, req.user.company_id, employment_status, previousEmploymentStatus);
    await query(
      `INSERT INTO employee_timeline
       (user_id, company_id, event_type, title, description, event_date, created_by)
       VALUES ($1,$2,$3,$4,$5,COALESCE($6::date, CURRENT_DATE),$7)`,
      [
        req.params.id,
        req.user.company_id,
        'status_change',
        `Employment status changed to ${employment_status}`,
        leaving_reason || null,
        date_of_leaving || null,
        req.user.id,
      ]
    );
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════
router.patch('/:id/lifecycle/:itemId', async (req, res) => {
  try {
    const { status, remarks, due_date, location, assigned_to } = req.body;
    const nextStatus = status || 'pending';
    const { rows } = await query(
      `UPDATE employee_lifecycle_checklist
       SET status=$1,
           remarks=$2,
           due_date=$3,
           location=COALESCE($8, location),
           assigned_to=COALESCE($9::uuid, assigned_to),
           completed_at=CASE WHEN $1 = 'done' THEN NOW() ELSE NULL END,
           completed_by=CASE WHEN $1 = 'done' THEN $4::uuid ELSE NULL END,
           updated_at=NOW()
       WHERE id=$5 AND user_id=$6 AND company_id=$7
       RETURNING *`,
      [
        nextStatus,
        remarks || null,
        due_date || null,
        req.user.id,
        req.params.itemId,
        req.params.id,
        req.user.company_id,
        location || null,
        assigned_to || null,
      ]
    );
    if (!rows.length) return res.status(404).json({ error: 'Checklist item not found' });

    await query(
      `INSERT INTO employee_timeline
       (user_id, company_id, event_type, title, description, created_by)
       VALUES ($1,$2,'lifecycle',$3,$4,$5)`,
      [
        req.params.id,
        req.user.company_id,
        `Lifecycle item ${nextStatus}`,
        `${rows[0].title}${remarks ? ` - ${remarks}` : ''}`,
        req.user.id,
      ]
    );

    // If this completed the onboarding checklist, stamp it + notify.
    if (rows[0].stage === 'onboarding' && nextStatus === 'done') {
      const remaining = await query(
        `SELECT COUNT(*)::int AS cnt FROM employee_lifecycle_checklist
         WHERE user_id=$1 AND company_id=$2 AND stage='onboarding' AND status <> 'done'`,
        [req.params.id, req.user.company_id]
      );
      if (remaining.rows[0].cnt === 0) {
        const stamped = await query(
          `UPDATE employee_profiles SET onboarding_completed_at = NOW()
           WHERE user_id=$1 AND onboarding_completed_at IS NULL RETURNING user_id`,
          [req.params.id]
        );
        if (stamped.rows.length) {
          const emp = await query(`SELECT name FROM users WHERE id=$1`, [req.params.id]);
          try {
            require('../services/notif.helper').notifyOnboardingCompleted(
              req.user.company_id,
              { id: req.params.id, name: emp.rows[0]?.name || 'An employee' }
            );
          } catch { /* notification is best-effort */ }
        }
      }
    }

    res.json({ data: rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Document verification (Onboarding Dashboard) — reuses the existing
// employee_documents upload flow, adding a verify/reject decision.
router.patch('/:id/documents/:docId/verify', async (req, res) => {
  try {
    const { verification_status, rejection_reason } = req.body;
    if (!['verified', 'rejected', 'pending'].includes(verification_status)) {
      return res.status(400).json({ error: 'verification_status must be verified, rejected, or pending' });
    }
    const { rows } = await query(
      `UPDATE employee_documents
       SET verification_status=$1, verified_by=$2, verified_at=NOW(),
           rejection_reason=CASE WHEN $1='rejected' THEN $3 ELSE NULL END
       WHERE id=$4 AND user_id=$5
       RETURNING *`,
      [verification_status, req.user.id, rejection_reason || null, req.params.docId, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Document not found' });

    await query(
      `INSERT INTO employee_timeline (user_id, company_id, event_type, title, description, created_by)
       VALUES ($1,$2,'document',$3,$4,$5)`,
      [req.params.id, req.user.company_id, `Document ${verification_status}`, rows[0].doc_name || rows[0].doc_type, req.user.id]
    );

    if (verification_status === 'rejected') {
      try {
        const emp = await query(`SELECT name FROM users WHERE id=$1`, [req.params.id]);
        require('../services/notif.helper').notifyDocumentRejected(
          req.user.company_id,
          { id: req.params.id, name: emp.rows[0]?.name || 'an employee' },
          rows[0].doc_name || rows[0].doc_type,
          rejection_reason
        );
      } catch { /* best-effort */ }
    }

    res.json({ data: rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DOCUMENTS
// ═══════════════════════════════════════════════════════════
router.post('/:id/documents', upload.single('file'), async (req, res) => {
  try {
    const { doc_type, doc_name, document_type_id } = req.body;
    const localUrl = req.file ? `/uploads/hr-docs/${req.file.filename}` : req.body.file_url;
    const displayName = doc_name || req.file?.originalname || doc_type;

    let spId = null, spUrl = null, fileUrl = localUrl;

    // Upload to SharePoint if configured; fall back to local on error
    if (SHAREPOINT_ENABLED && req.file) {
      try {
        const empRow = await query(`SELECT name, employee_code FROM users WHERE id=$1`, [req.params.id]);
        const emp = empRow.rows[0];
        const folderPath = `HR Documents/${emp?.employee_code || req.params.id} - ${(emp?.name || 'Employee').replace(/[<>:"|?*]/g,'_')}`;
        const fileBuffer = fs.readFileSync(req.file.path);
        const sp = await uploadToSharePoint(req.file.originalname, fileBuffer, folderPath);
        spId  = sp.id;
        spUrl = sp.webUrl;
        fileUrl = sp.downloadUrl || sp.webUrl;
        // Remove local copy after successful SP upload
        fs.unlink(req.file.path, () => {});
        console.log(`[HR-Docs] Uploaded to SharePoint: ${spUrl}`);
      } catch (spErr) {
        console.error('[HR-Docs] SharePoint upload failed, keeping local copy:', spErr.message);
        // fileUrl stays as localUrl — graceful fallback
      }
    }

    const { rows } = await query(
      `INSERT INTO employee_documents
         (user_id, doc_type, doc_name, file_url, sharepoint_id, sharepoint_url, uploaded_by, document_type_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [req.params.id, doc_type, displayName, fileUrl, spId, spUrl, req.user.id, document_type_id || null]
    );
    await query(
      `INSERT INTO employee_timeline
         (user_id, company_id, event_type, title, description, created_by)
       VALUES ($1,$2,'document','Document uploaded',$3,$4)`,
      [req.params.id, req.user.company_id, displayName, req.user.id]
    );
    // Best-effort — table may not exist yet if hr-document-verification hasn't
    // initialized on this instance; verification history isn't upload-blocking.
    query(
      `INSERT INTO document_verification_history (document_id, action, actor_id, remarks)
       VALUES ($1,'uploaded',$2,$3)`,
      [rows[0].id, req.user.id, displayName]
    ).catch(() => {});
    res.status(201).json({ data: rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id/documents/:docId', async (req, res) => {
  try {
    // Fetch before delete so we don't reference potentially-missing columns in RETURNING
    const sel = await query(
      `SELECT file_url,
              CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
                                WHERE table_name='employee_documents' AND column_name='sharepoint_id')
                   THEN (SELECT sharepoint_id::text FROM employee_documents WHERE id=$1)
                   ELSE NULL END AS sharepoint_id
       FROM employee_documents WHERE id=$1 AND user_id=$2`,
      [req.params.docId, req.params.id]
    );
    await query(
      `DELETE FROM employee_documents WHERE id=$1 AND user_id=$2`,
      [req.params.docId, req.params.id]
    );
    const rows = sel.rows;
    if (rows[0]) {
      const { file_url, sharepoint_id } = rows[0];
      if (sharepoint_id) {
        // Delete from SharePoint
        deleteFromOneDrive(sharepoint_id).catch(e =>
          console.error('[HR-Docs] SharePoint delete failed:', e.message)
        );
      } else if (file_url && file_url.startsWith('/uploads/')) {
        // Delete local file
        const fp = path.join(__dirname, '../..', file_url);
        if (fs.existsSync(fp)) fs.unlinkSync(fp);
      }
    }
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Helper: generate employee code ─────────────────────────────────────────
async function generateEmpCode(companyId) {
  const yr = new Date().getFullYear().toString().slice(-2);
  const { rows } = await query(
    `SELECT COUNT(*) as cnt FROM users WHERE company_id=$1`, [companyId]
  );
  const seq = String(parseInt(rows[0].cnt) + 1).padStart(3, '0');
  return `EMP${yr}${seq}`;
}

// Shared with hr-onboarding.routes.js so it doesn't duplicate this list/logic.
router.SYSTEM_ACCOUNT_EMAILS = SYSTEM_ACCOUNT_EMAILS;
router.ensureLifecycleChecklist = ensureLifecycleChecklist;
router.LIFECYCLE_ITEMS = LIFECYCLE_ITEMS;

module.exports = router;

