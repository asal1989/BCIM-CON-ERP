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

router.use(authenticate);
router.use(authorize('super_admin', 'admin', 'hr', 'hr_admin', 'hr_manager'));

// ─── Multer setup ─────────────────────────────────────────────────────────────
const uploadDir = path.join(__dirname, '../../uploads/hr-docs');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename:    (req, file, cb) => cb(null, `${Date.now()}-${file.originalname.replace(/\s+/g, '_')}`),
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

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
  await query(`ALTER TABLE employee_profiles ADD COLUMN IF NOT EXISTS reporting_manager_id UUID REFERENCES users(id)`);
  await query(`ALTER TABLE employee_profiles ADD COLUMN IF NOT EXISTS work_location TEXT`);
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
         ep.employment_type, ep.reporting_manager_id, mgr.name as reporting_manager_name,
         ep.work_location, ep.probation_end_date, ep.notice_period_days,
         ep.date_of_leaving, ep.leaving_reason, ep.employment_status, ep.profile_photo_url,
         dep.name as department_name, des.name as designation_name, des.grade
  FROM users u
  LEFT JOIN employee_profiles ep ON ep.user_id = u.id
  LEFT JOIN hr_departments dep ON dep.id = ep.department_id
  LEFT JOIN hr_designations des ON des.id = ep.designation_id
  LEFT JOIN users mgr ON mgr.id = ep.reporting_manager_id
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
const LIFECYCLE_ITEMS = [
  { stage: 'onboarding', item_key: 'offer_acceptance', title: 'Offer acceptance received', owner_department: 'HR' },
  { stage: 'onboarding', item_key: 'joining_documents', title: 'Joining documents collected', owner_department: 'HR' },
  { stage: 'onboarding', item_key: 'id_card', title: 'ID card issued', owner_department: 'Admin' },
  { stage: 'onboarding', item_key: 'asset_issue', title: 'Laptop / assets issued', owner_department: 'Admin / IT' },
  { stage: 'onboarding', item_key: 'email_setup', title: 'Email and ERP access created', owner_department: 'IT' },
  { stage: 'onboarding', item_key: 'bank_pf_esi', title: 'Bank, PF and ESI details verified', owner_department: 'HR / Accounts' },
  { stage: 'onboarding', item_key: 'safety_induction', title: 'Safety / site induction completed', owner_department: 'HSE / Projects' },
  { stage: 'exit', item_key: 'resignation_acceptance', title: 'Resignation / exit approval recorded', owner_department: 'HR' },
  { stage: 'exit', item_key: 'knowledge_handover', title: 'Work handover completed', owner_department: 'Reporting Manager' },
  { stage: 'exit', item_key: 'asset_return', title: 'Company assets returned', owner_department: 'Admin / IT' },
  { stage: 'exit', item_key: 'dues_clearance', title: 'Advance / loan / dues clearance checked', owner_department: 'Accounts' },
  { stage: 'exit', item_key: 'access_disable', title: 'ERP, email and system access disabled', owner_department: 'IT' },
  { stage: 'exit', item_key: 'final_settlement', title: 'Full and final settlement processed', owner_department: 'Accounts / HR' },
  { stage: 'exit', item_key: 'relieving_letter', title: 'Relieving / experience letter issued', owner_department: 'HR' },
];

async function ensureLifecycleChecklist(companyId, userId) {
  for (const item of LIFECYCLE_ITEMS) {
    await query(
      `INSERT INTO employee_lifecycle_checklist
       (user_id, company_id, stage, item_key, title, owner_department)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (user_id, stage, item_key) DO NOTHING`,
      [userId, companyId, item.stage, item.item_key, item.title, item.owner_department]
    );
  }
}

// LIST
// ═══════════════════════════════════════════════════════════
router.get('/', async (req, res) => {
  try {
    const { search, department_id, employment_status, employment_type, no_profile } = req.query;
    let sql = `${employeeSelect} WHERE u.company_id = $1`;
    const params = [req.user.company_id];
    let idx = 2;

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
        sql += ` AND ep.employment_status = $${idx}`;
        params.push(employment_status); idx++;
      }
      if (employment_type) {
        sql += ` AND ep.employment_type = $${idx}`;
        params.push(employment_type); idx++;
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
         lc.created_at ASC`,
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
      name, email, phone, role, employee_code,
      // Profile fields
      department_id, designation_id, date_of_joining, date_of_birth, gender,
      father_name, mother_name, marital_status, blood_group, nationality,
      pan_number, aadhaar_number, uan_number, pf_account_number, esi_number,
      bank_name, bank_account_number, bank_ifsc,
      permanent_address, current_address,
      emergency_contact_name, emergency_contact_phone,
      employment_type, probation_end_date, notice_period_days,
      reporting_manager_id, work_location,
    } = req.body;

    // Generate employee code if not provided
    const code = employee_code || await generateEmpCode(req.user.company_id);

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
        emergency_contact_name, emergency_contact_phone, employment_type,
        reporting_manager_id, work_location, probation_end_date, notice_period_days)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29)`,
      [userId, req.user.company_id, department_id || null, designation_id || null,
       date_of_joining || null, date_of_birth || null, gender || null,
       father_name || null, mother_name || null, marital_status || null,
       blood_group || null, nationality || 'Indian', pan_number || null,
       aadhaar_number || null, uan_number || null, pf_account_number || null,
       esi_number || null, bank_name || null, bank_account_number || null,
       bank_ifsc || null, permanent_address || null, current_address || null,
       emergency_contact_name || null, emergency_contact_phone || null,
       employment_type || 'permanent', reporting_manager_id || null, work_location || null,
       probation_end_date || null, notice_period_days || 30]
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

    await client.query('COMMIT');

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
      name, email, phone, role,
      department_id, designation_id, date_of_joining, date_of_birth, gender,
      father_name, mother_name, marital_status, blood_group, nationality,
      pan_number, aadhaar_number, uan_number, pf_account_number, esi_number,
      bank_name, bank_account_number, bank_ifsc, permanent_address, current_address,
      emergency_contact_name, emergency_contact_phone, employment_type,
      probation_end_date, notice_period_days, reporting_manager_id, work_location,
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

    await client.query(
      `UPDATE users SET name=$1, email=$2, phone=$3, role=$4, designation=$5, department=$6
       WHERE id=$7 AND company_id=$8`,
      [name, email, phone || null, role || 'viewer', desigName, deptName,
       req.params.id, req.user.company_id]
    );

    await client.query(
      `INSERT INTO employee_profiles
       (user_id, company_id, department_id, designation_id, date_of_joining, date_of_birth,
        gender, father_name, mother_name, marital_status, blood_group, nationality,
        pan_number, aadhaar_number, uan_number, pf_account_number, esi_number,
        bank_name, bank_account_number, bank_ifsc, permanent_address, current_address,
        emergency_contact_name, emergency_contact_phone, employment_type,
        reporting_manager_id, work_location, probation_end_date, notice_period_days, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,NOW())
       ON CONFLICT (user_id) DO UPDATE SET
         department_id=$3, designation_id=$4, date_of_joining=$5, date_of_birth=$6,
         gender=$7, father_name=$8, mother_name=$9, marital_status=$10, blood_group=$11,
         nationality=$12, pan_number=$13, aadhaar_number=$14, uan_number=$15,
         pf_account_number=$16, esi_number=$17, bank_name=$18, bank_account_number=$19,
         bank_ifsc=$20, permanent_address=$21, current_address=$22,
         emergency_contact_name=$23, emergency_contact_phone=$24, employment_type=$25,
         reporting_manager_id=$26, work_location=$27,
         probation_end_date=$28, notice_period_days=$29, updated_at=NOW()`,
      [req.params.id, req.user.company_id, department_id || null, designation_id || null,
       date_of_joining || null, date_of_birth || null, gender || null,
       father_name || null, mother_name || null, marital_status || null,
       blood_group || null, nationality || 'Indian', pan_number || null,
       aadhaar_number || null, uan_number || null, pf_account_number || null,
       esi_number || null, bank_name || null, bank_account_number || null,
       bank_ifsc || null, permanent_address || null, current_address || null,
       emergency_contact_name || null, emergency_contact_phone || null,
       employment_type || 'permanent', reporting_manager_id || null, work_location || null,
       probation_end_date || null, notice_period_days || 30]
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

// ═══════════════════════════════════════════════════════════
// UPDATE STATUS (exit / terminate etc)
// ═══════════════════════════════════════════════════════════
router.patch('/:id/status', async (req, res) => {
  try {
    const { employment_status, date_of_leaving, leaving_reason, is_active } = req.body;
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
    const { status, remarks, due_date } = req.body;
    const nextStatus = status || 'pending';
    const { rows } = await query(
      `UPDATE employee_lifecycle_checklist
       SET status=$1,
           remarks=$2,
           due_date=$3,
           completed_at=CASE WHEN $1 = 'done' THEN NOW() ELSE NULL END,
           completed_by=CASE WHEN $1 = 'done' THEN $4 ELSE NULL END,
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

    res.json({ data: rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DOCUMENTS
// ═══════════════════════════════════════════════════════════
router.post('/:id/documents', upload.single('file'), async (req, res) => {
  try {
    const { doc_type, doc_name } = req.body;
    const fileUrl = req.file ? `/uploads/hr-docs/${req.file.filename}` : req.body.file_url;
    const { rows } = await query(
      `INSERT INTO employee_documents (user_id, doc_type, doc_name, file_url, uploaded_by)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [req.params.id, doc_type, doc_name || req.file?.originalname, fileUrl, req.user.id]
    );
    await query(
      `INSERT INTO employee_timeline
       (user_id, company_id, event_type, title, description, created_by)
       VALUES ($1,$2,'document','Document uploaded',$3,$4)`,
      [req.params.id, req.user.company_id, doc_name || req.file?.originalname || doc_type, req.user.id]
    );
    res.status(201).json({ data: rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id/documents/:docId', async (req, res) => {
  try {
    const { rows } = await query(
      `DELETE FROM employee_documents WHERE id=$1 AND user_id=$2 RETURNING file_url`,
      [req.params.docId, req.params.id]
    );
    if (rows[0]?.file_url) {
      const fp = path.join(__dirname, '../..', rows[0].file_url);
      if (fs.existsSync(fp)) fs.unlinkSync(fp);
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

module.exports = router;

