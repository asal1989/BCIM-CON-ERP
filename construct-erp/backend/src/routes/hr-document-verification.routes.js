// src/routes/hr-document-verification.routes.js
// Document Verification — HR Admin → Onboarding. Phase 1: taxonomy, upload
// linkage, Pending/Verified/Rejected queues, verify/reject actions, and a
// basic per-document audit trail. Expiry tracking, OCR extraction, bulk
// actions, templates and multi-format reports are explicitly out of scope
// for this phase — see the Settings/Reports pages for placeholders.
const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const { query } = require('../config/database');
const { runSchemaInit } = require('../utils/schemaInit');
const hrEmployees = require('./hr-employees.routes');

router.use(authenticate);
router.use(authorize('super_admin', 'admin', 'hr', 'hr_admin', 'hr_manager'));

const SYSTEM_ACCOUNT_EMAILS = hrEmployees.SYSTEM_ACCOUNT_EMAILS || [];

// ── Schema ───────────────────────────────────────────────────────────────
runSchemaInit('hr-document-verification-v1', async () => {
  await query(`
    CREATE TABLE IF NOT EXISTS document_categories (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      code TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      sort_order INT DEFAULT 0
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS document_types (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      category_id UUID NOT NULL REFERENCES document_categories(id) ON DELETE CASCADE,
      code TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      mandatory BOOLEAN DEFAULT FALSE,
      sort_order INT DEFAULT 0,
      active BOOLEAN DEFAULT TRUE
    )
  `);
  await query(`ALTER TABLE employee_documents ADD COLUMN IF NOT EXISTS document_type_id UUID REFERENCES document_types(id)`);
  await query(`
    CREATE TABLE IF NOT EXISTS document_verification_history (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      document_id UUID NOT NULL REFERENCES employee_documents(id) ON DELETE CASCADE,
      action TEXT NOT NULL CHECK (action IN ('uploaded','verified','rejected','resubmitted')),
      actor_id UUID REFERENCES users(id),
      remarks TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_docverify_history_doc ON document_verification_history(document_id, created_at DESC)`);

  // Seed taxonomy — idempotent via ON CONFLICT, safe to leave in place
  // permanently rather than gating behind the once-only migration guard,
  // so a future code-level addition to CATEGORIES/TYPES still lands.
  const CATEGORIES = [
    ['identity_proof', 'Personal Identity', 1],
    ['address_proof',  'Address Proof', 2],
    ['education',      'Educational Documents', 3],
    ['employment',     'Employment Documents', 4],
    ['statutory',       'Statutory Documents', 5],
    ['medical',         'Medical Documents', 6],
    ['site',            'Construction Site Documents', 7],
    ['company',         'Company Documents', 8],
  ];
  for (const [code, name, sort_order] of CATEGORIES) {
    await query(
      `INSERT INTO document_categories (code, name, sort_order) VALUES ($1,$2,$3)
       ON CONFLICT (code) DO UPDATE SET name=EXCLUDED.name, sort_order=EXCLUDED.sort_order`,
      [code, name, sort_order]
    );
  }
  const catId = {};
  const catRows = await query(`SELECT id, code FROM document_categories`);
  catRows.rows.forEach(r => { catId[r.code] = r.id; });

  // [category, code, name, mandatory]. Codes 'pan'/'aadhaar' intentionally
  // match the simple strings hr-onboarding.routes.js's REQUIRED_DOC_TYPES
  // already uses, so the Onboarding Dashboard's Missing Documents KPI and
  // this module count the same uploads instead of diverging.
  const TYPES = [
    ['identity_proof', 'aadhaar',                 'Aadhaar Card', true],
    ['identity_proof', 'pan',                      'PAN Card', true],
    ['identity_proof', 'passport',                 'Passport', false],
    ['identity_proof', 'voter_id',                 'Voter ID', false],
    ['identity_proof', 'driving_licence',          'Driving Licence', false],

    // Aadhaar/Passport above already double as address proof — not repeated
    // here to avoid two rows meaning the same physical document.
    ['address_proof', 'electricity_bill',          'Electricity Bill', false],
    ['address_proof', 'rental_agreement',          'Rental Agreement', false],
    ['address_proof', 'bank_statement',             'Bank Statement', false],

    ['education', 'sslc_certificate',              'SSLC / 10th Certificate', false],
    ['education', 'hsc_certificate',                'HSC / 12th Certificate', false],
    ['education', 'diploma_certificate',            'Diploma', false],
    ['education', 'degree_certificate',             'Degree Certificate', false],
    ['education', 'pg_certificate',                  'Post Graduation', false],
    ['education', 'technical_certificate',           'Technical Certificates', false],

    ['employment', 'resume',                        'Resume', false],
    ['employment', 'previous_offer_letter',          'Previous Offer Letter', false],
    ['employment', 'experience_certificate',         'Experience Certificate', false],
    ['employment', 'relieving_letter',               'Relieving Letter', false],
    ['employment', 'salary_slips',                   'Salary Slips', false],
    ['employment', 'service_certificate',            'Service Certificate', false],

    ['statutory', 'uan',                             'UAN', false],
    ['statutory', 'pf_declaration',                  'PF Declaration', false],
    ['statutory', 'esi_card',                        'ESI Card', false],
    ['statutory', 'nomination_form',                 'Nomination Form', false],
    ['statutory', 'bank_passbook',                   'Bank Passbook', false],
    ['statutory', 'cancelled_cheque',                'Cancelled Cheque', false],

    ['medical', 'medical_fitness_certificate',       'Medical Fitness Certificate', false],
    ['medical', 'blood_group_report',                'Blood Group Report', false],
    ['medical', 'vaccination_certificate',           'Vaccination Certificate', false],
    ['medical', 'health_insurance',                  'Health Insurance', false],

    ['site', 'safety_induction_certificate',         'Safety Induction Certificate', false],
    ['site', 'trade_license',                        'Trade License', false],
    ['site', 'skill_certificate',                    'Skill Certificate', false],
    ['site', 'equipment_operator_license',           'Equipment Operator License', false],
    ['site', 'height_work_certificate',              'Height Work Certificate', false],
    ['site', 'welding_certificate',                  'Welding Certificate', false],
    ['site', 'crane_operator_license',               'Crane Operator License', false],

    ['company', 'nda',                               'NDA', false],
    ['company', 'appointment_letter',                'Appointment Letter', false],
    ['company', 'code_of_conduct',                   'Code of Conduct', false],
    ['company', 'hr_policy_acceptance',              'HR Policy Acceptance', false],
    ['company', 'confidentiality_agreement',         'Confidentiality Agreement', false],
  ];
  let sort = 0;
  for (const [catCode, code, name, mandatory] of TYPES) {
    sort += 1;
    await query(
      `INSERT INTO document_types (category_id, code, name, mandatory, sort_order) VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (code) DO UPDATE SET name=EXCLUDED.name, mandatory=EXCLUDED.mandatory`,
      [catId[catCode], code, name, mandatory, sort]
    );
  }
});

// ── GET /taxonomy — categories with nested types ────────────────────────
router.get('/taxonomy', async (req, res) => {
  try {
    const cats = await query(`SELECT id, code, name FROM document_categories ORDER BY sort_order`);
    const types = await query(`SELECT id, category_id, code, name, mandatory FROM document_types WHERE active = TRUE ORDER BY sort_order`);
    const data = cats.rows.map(c => ({
      ...c,
      types: types.rows.filter(t => t.category_id === c.id),
    }));
    res.json({ data });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── GET /dashboard — KPI counts ─────────────────────────────────────────
router.get('/dashboard', async (req, res) => {
  try {
    const cid = req.user.company_id;
    const counts = await query(`
      SELECT ed.verification_status, COUNT(*)::int AS cnt
      FROM employee_documents ed
      JOIN users u ON u.id = ed.user_id
      WHERE u.company_id = $1 AND u.email != ALL($2::text[])
      GROUP BY ed.verification_status
    `, [cid, SYSTEM_ACCOUNT_EMAILS]);

    const byStatus = { pending: 0, verified: 0, rejected: 0 };
    counts.rows.forEach(r => { byStatus[r.verification_status] = r.cnt; });

    const today = await query(`
      SELECT COUNT(*)::int AS cnt FROM employee_documents ed
      JOIN users u ON u.id = ed.user_id
      WHERE u.company_id = $1 AND u.email != ALL($2::text[])
        AND ed.verified_at::date = CURRENT_DATE
    `, [cid, SYSTEM_ACCOUNT_EMAILS]);

    // Missing = active employees x mandatory types they have zero upload for.
    const missing = await query(`
      SELECT COUNT(*)::int AS cnt FROM (
        SELECT u.id, dt.id AS type_id
        FROM users u
        CROSS JOIN document_types dt
        LEFT JOIN employee_profiles ep ON ep.user_id = u.id
        WHERE u.company_id = $1 AND u.is_active = TRUE
          AND u.email != ALL($2::text[])
          AND dt.mandatory = TRUE
          AND COALESCE(ep.employment_status, 'active') NOT IN ('resigned','terminated','absconded')
          AND NOT EXISTS (
            SELECT 1 FROM employee_documents ed
            WHERE ed.user_id = u.id AND ed.document_type_id = dt.id
          )
      ) missing_rows
    `, [cid, SYSTEM_ACCOUNT_EMAILS]);

    res.json({
      data: {
        pending: byStatus.pending || 0,
        verified: byStatus.verified || 0,
        rejected: byStatus.rejected || 0,
        missing: missing.rows[0]?.cnt || 0,
        verified_today: today.rows[0]?.cnt || 0,
      },
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── GET /queue — Pending / Verified / Rejected lists ────────────────────
router.get('/queue', async (req, res) => {
  try {
    const { status = 'pending', search, department_id, project_id } = req.query;
    if (!['pending', 'verified', 'rejected'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }
    const params = [req.user.company_id, SYSTEM_ACCOUNT_EMAILS, status];
    let sql = `
      SELECT ed.id, ed.doc_type, ed.doc_name, ed.file_url, ed.uploaded_at, ed.verification_status,
             ed.verified_at, ed.rejection_reason,
             dt.name AS document_type_name, dc.name AS category_name,
             u.id AS user_id, u.name AS employee_name, u.employee_code,
             dep.name AS department_name, proj.name AS project_name,
             vb.name AS verified_by_name
      FROM employee_documents ed
      JOIN users u ON u.id = ed.user_id
      LEFT JOIN document_types dt ON dt.id = ed.document_type_id
      LEFT JOIN document_categories dc ON dc.id = dt.category_id
      LEFT JOIN employee_profiles ep ON ep.user_id = u.id
      LEFT JOIN hr_departments dep ON dep.id = ep.department_id
      LEFT JOIN projects proj ON proj.id = ep.project_id
      LEFT JOIN users vb ON vb.id = ed.verified_by
      WHERE u.company_id = $1 AND u.email != ALL($2::text[]) AND ed.verification_status = $3
    `;
    let idx = 4;
    if (search)        { sql += ` AND (u.name ILIKE $${idx} OR u.employee_code ILIKE $${idx})`; params.push(`%${search}%`); idx++; }
    if (department_id) { sql += ` AND ep.department_id = $${idx}`; params.push(department_id); idx++; }
    if (project_id)     { sql += ` AND ep.project_id = $${idx}`; params.push(project_id); idx++; }
    sql += ` ORDER BY ed.uploaded_at DESC LIMIT 500`;

    const { rows } = await query(sql, params);
    res.json({ data: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── GET /employee/:userId — category-grouped status for one employee ───
router.get('/employee/:userId', async (req, res) => {
  try {
    const emp = await query(
      `SELECT id, name, employee_code FROM users WHERE id = $1 AND company_id = $2`,
      [req.params.userId, req.user.company_id]
    );
    if (!emp.rows.length) return res.status(404).json({ error: 'Employee not found' });

    const cats = await query(`SELECT id, code, name, sort_order FROM document_categories ORDER BY sort_order`);
    const types = await query(`SELECT id, category_id, code, name, mandatory FROM document_types WHERE active = TRUE ORDER BY sort_order`);
    const docs = await query(`
      SELECT ed.*, vb.name AS verified_by_name
      FROM employee_documents ed
      LEFT JOIN users vb ON vb.id = ed.verified_by
      WHERE ed.user_id = $1
      ORDER BY ed.uploaded_at DESC
    `, [req.params.userId]);

    // A type can have multiple uploads over time (resubmission) — take latest.
    const latestByType = {};
    docs.rows.forEach(d => {
      if (!d.document_type_id) return;
      if (!latestByType[d.document_type_id] || new Date(d.uploaded_at) > new Date(latestByType[d.document_type_id].uploaded_at)) {
        latestByType[d.document_type_id] = d;
      }
    });

    const data = cats.rows.map(c => ({
      ...c,
      types: types.rows.filter(t => t.category_id === c.id).map(t => {
        const doc = latestByType[t.id];
        return {
          ...t,
          status: doc ? doc.verification_status : 'missing',
          document: doc || null,
        };
      }),
    }));

    // Uploads with no document_type_id (legacy / free-text uploads) — surfaced
    // separately so nothing silently disappears from the employee's file list.
    const unclassified = docs.rows.filter(d => !d.document_type_id);

    res.json({ data: { employee: emp.rows[0], categories: data, unclassified } });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── PATCH /:id/verify ────────────────────────────────────────────────────
router.patch('/:id/verify', async (req, res) => {
  try {
    const { rows } = await query(`
      UPDATE employee_documents ed SET verification_status='verified', verified_by=$1, verified_at=NOW(), rejection_reason=NULL
      FROM users u
      WHERE ed.id=$2 AND ed.user_id=u.id AND u.company_id=$3
      RETURNING ed.*
    `, [req.user.id, req.params.id, req.user.company_id]);
    if (!rows.length) return res.status(404).json({ error: 'Document not found' });

    await query(
      `INSERT INTO document_verification_history (document_id, action, actor_id) VALUES ($1,'verified',$2)`,
      [req.params.id, req.user.id]
    );
    res.json({ data: rows[0], message: 'Document verified' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── PATCH /:id/reject ─────────────────────────────────────────────────────
router.patch('/:id/reject', async (req, res) => {
  try {
    const { rejection_reason } = req.body;
    if (!rejection_reason) return res.status(400).json({ error: 'Rejection reason is required' });

    const { rows } = await query(`
      UPDATE employee_documents ed SET verification_status='rejected', verified_by=$1, verified_at=NOW(), rejection_reason=$2
      FROM users u
      WHERE ed.id=$3 AND ed.user_id=u.id AND u.company_id=$4
      RETURNING ed.*
    `, [req.user.id, rejection_reason, req.params.id, req.user.company_id]);
    if (!rows.length) return res.status(404).json({ error: 'Document not found' });

    await query(
      `INSERT INTO document_verification_history (document_id, action, actor_id, remarks) VALUES ($1,'rejected',$2,$3)`,
      [req.params.id, req.user.id, rejection_reason]
    );
    res.json({ data: rows[0], message: 'Document rejected' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── GET /:id/history — audit trail for one document ─────────────────────
router.get('/:id/history', async (req, res) => {
  try {
    const { rows } = await query(`
      SELECT h.*, a.name AS actor_name
      FROM document_verification_history h
      LEFT JOIN users a ON a.id = h.actor_id
      WHERE h.document_id = $1
      ORDER BY h.created_at DESC
    `, [req.params.id]);
    res.json({ data: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
