// src/routes/hr-document-verification.routes.js
// Document Verification — cross-employee views over employee_documents.
// Upload/verify/reject/delete actions themselves already exist on
// hr-employees.routes.js and are reused as-is (see api/client.js
// hrEmployeesAPI); this file adds the cross-employee list/aggregate
// endpoints that don't exist anywhere else: dashboard summary, pending
// queue, employee-wise register, rejected queue, and missing-documents
// queue.
const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const { query } = require('../config/database');
const hrEmployees = require('./hr-employees.routes');

router.use(authenticate);
router.use(authorize('super_admin', 'admin', 'hr', 'hr_admin', 'hr_manager'));

const SYSTEM_ACCOUNT_EMAILS = hrEmployees.SYSTEM_ACCOUNT_EMAILS || [];

// Canonical document-type catalog for this module — reconciles the two
// previously-inconsistent doc_type lists in the codebase (EmployeeDetailPage's
// upload dropdown and hr-onboarding.routes.js's REQUIRED_DOC_TYPES) into one
// set with category + required flags, WITHOUT renaming either list's actual
// doc_type strings (so historical rows keep matching both).
const DOCUMENT_CATALOG = [
  { doc_type: 'pan',            label: 'PAN Card',                category: 'personal',   required: true },
  { doc_type: 'aadhaar',        label: 'Aadhaar Card',             category: 'personal',   required: true },
  { doc_type: 'photo',          label: 'Photograph',               category: 'personal',   required: true },
  { doc_type: 'id_proof',       label: 'ID Proof',                 category: 'personal',   required: false },
  { doc_type: 'address_proof',  label: 'Address Proof',            category: 'personal',   required: false },
  { doc_type: 'education',      label: 'Educational Certificate',  category: 'education',  required: true },
  { doc_type: 'degree',         label: 'Degree Certificate',       category: 'education',  required: false },
  { doc_type: 'experience',     label: 'Experience Letter',        category: 'employment', required: true },
  { doc_type: 'offer_letter',   label: 'Offer Letter',             category: 'employment', required: false },
  { doc_type: 'joining_letter', label: 'Joining Letter',           category: 'employment', required: false },
  { doc_type: 'bank_proof',     label: 'Bank Proof',               category: 'employment', required: true },
  { doc_type: 'pf_form',        label: 'PF Form',                  category: 'compliance', required: false },
  { doc_type: 'esic_form',      label: 'ESIC Form',                category: 'compliance', required: false },
  { doc_type: 'medical',        label: 'Medical Certificate',      category: 'medical',    required: false },
  { doc_type: 'other',          label: 'Other',                    category: 'other',      required: false },
];
const CATALOG_BY_KEY = Object.fromEntries(DOCUMENT_CATALOG.map(d => [d.doc_type, d]));
const REQUIRED_TYPES = DOCUMENT_CATALOG.filter(d => d.required).map(d => d.doc_type);
function labelFor(docType) { return CATALOG_BY_KEY[docType]?.label || (docType || 'Document'); }
function categoryOf(docType) { return CATALOG_BY_KEY[docType]?.category || 'other'; }

function empFilters(req, params, idx) {
  let extraWhere = '';
  const { search, department_id } = req.query;
  if (search) { extraWhere += ` AND (u.name ILIKE $${idx} OR u.employee_code ILIKE $${idx})`; params.push(`%${search}%`); idx++; }
  if (department_id) { extraWhere += ` AND ep.department_id = $${idx}`; params.push(department_id); idx++; }
  return extraWhere;
}

// ═══════════════════════════════════════════════════════════
// GET /catalog — document type catalog (for upload dropdowns / legends)
// ═══════════════════════════════════════════════════════════
router.get('/catalog', (req, res) => {
  res.json({ data: DOCUMENT_CATALOG });
});

// ═══════════════════════════════════════════════════════════
// GET /summary — Dashboard
// ═══════════════════════════════════════════════════════════
router.get('/summary', async (req, res) => {
  try {
    const companyId = req.user.company_id;

    const docStats = await query(`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE d.verification_status='pending')::int AS pending,
        COUNT(*) FILTER (WHERE d.verification_status='verified')::int AS verified,
        COUNT(*) FILTER (WHERE d.verification_status='rejected')::int AS rejected
      FROM employee_documents d
      JOIN users u ON u.id = d.user_id
      WHERE u.company_id = $1 AND u.email != ALL($2::text[])
    `, [companyId, SYSTEM_ACCOUNT_EMAILS]);

    const { rows: population } = await query(`
      SELECT u.id FROM users u
      LEFT JOIN employee_profiles ep ON ep.user_id = u.id
      WHERE u.company_id = $1 AND u.email != ALL($2::text[])
        AND COALESCE(ep.employment_status, 'active') = 'active'
    `, [companyId, SYSTEM_ACCOUNT_EMAILS]);
    const idsParam = population.length ? population.map(p => p.id) : ['00000000-0000-0000-0000-000000000000'];

    const missingRes = await query(`
      SELECT id FROM (SELECT unnest($1::uuid[]) AS id) x
      WHERE (SELECT COUNT(DISTINCT doc_type) FROM employee_documents d WHERE d.user_id = x.id AND d.doc_type = ANY($2::text[])) < $3
    `, [idsParam, REQUIRED_TYPES, REQUIRED_TYPES.length]);

    const recent = await query(`
      SELECT t.id, t.event_type, t.title, t.description, t.created_at,
             u.name AS employee_name, u.employee_code, cu.name AS actor_name
      FROM employee_timeline t
      JOIN users u ON u.id = t.user_id
      LEFT JOIN users cu ON cu.id = t.created_by
      WHERE t.company_id = $1 AND t.event_type = 'document'
      ORDER BY t.created_at DESC LIMIT 15
    `, [companyId]);

    const total = docStats.rows[0].total;
    const verified = docStats.rows[0].verified;
    res.json({
      data: {
        total_documents: total,
        pending: docStats.rows[0].pending,
        verified,
        rejected: docStats.rows[0].rejected,
        missing_employees: missingRes.rows.length,
        verification_progress_pct: total ? Math.round((verified / total) * 100) : 0,
        recent_activity: recent.rows,
      },
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════
// GET /pending
// ═══════════════════════════════════════════════════════════
router.get('/pending', async (req, res) => {
  try {
    const companyId = req.user.company_id;
    const params = [companyId, SYSTEM_ACCOUNT_EMAILS];
    const extraWhere = empFilters(req, params, 3);
    const { rows } = await query(`
      SELECT d.*, u.name AS employee_name, u.employee_code, dep.name AS department_name
      FROM employee_documents d
      JOIN users u ON u.id = d.user_id
      LEFT JOIN employee_profiles ep ON ep.user_id = u.id
      LEFT JOIN hr_departments dep ON dep.id = ep.department_id
      WHERE u.company_id = $1 AND u.email != ALL($2::text[]) AND d.verification_status = 'pending' ${extraWhere}
      ORDER BY d.uploaded_at ASC
    `, params);
    res.json({ data: rows.map(r => ({ ...r, label: labelFor(r.doc_type), category: categoryOf(r.doc_type) })) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════
// GET /rejected
// ═══════════════════════════════════════════════════════════
router.get('/rejected', async (req, res) => {
  try {
    const companyId = req.user.company_id;
    const params = [companyId, SYSTEM_ACCOUNT_EMAILS];
    const extraWhere = empFilters(req, params, 3);
    const { rows } = await query(`
      SELECT d.*, u.name AS employee_name, u.employee_code, dep.name AS department_name, vu.name AS verified_by_name
      FROM employee_documents d
      JOIN users u ON u.id = d.user_id
      LEFT JOIN employee_profiles ep ON ep.user_id = u.id
      LEFT JOIN hr_departments dep ON dep.id = ep.department_id
      LEFT JOIN users vu ON vu.id = d.verified_by
      WHERE u.company_id = $1 AND u.email != ALL($2::text[]) AND d.verification_status = 'rejected' ${extraWhere}
      ORDER BY d.verified_at DESC NULLS LAST
    `, params);
    res.json({ data: rows.map(r => ({ ...r, label: labelFor(r.doc_type), category: categoryOf(r.doc_type) })) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════
// GET /missing — employees short of a required doc_type
// ═══════════════════════════════════════════════════════════
router.get('/missing', async (req, res) => {
  try {
    const companyId = req.user.company_id;
    const params = [companyId, SYSTEM_ACCOUNT_EMAILS];
    const extraWhere = empFilters(req, params, 3);
    const { rows: population } = await query(`
      SELECT u.id, u.employee_code, u.name, dep.name AS department_name
      FROM users u
      LEFT JOIN employee_profiles ep ON ep.user_id = u.id
      LEFT JOIN hr_departments dep ON dep.id = ep.department_id
      WHERE u.company_id = $1 AND u.email != ALL($2::text[])
        AND COALESCE(ep.employment_status, 'active') = 'active' ${extraWhere}
    `, params);
    if (!population.length) return res.json({ data: [] });

    const ids = population.map(p => p.id);
    const { rows: haveTypes } = await query(
      `SELECT user_id, array_agg(DISTINCT doc_type) AS types FROM employee_documents WHERE user_id = ANY($1::uuid[]) GROUP BY user_id`,
      [ids]
    );
    const haveMap = Object.fromEntries(haveTypes.map(r => [r.user_id, new Set(r.types)]));

    const data = population
      .map(emp => {
        const have = haveMap[emp.id] || new Set();
        const missing = REQUIRED_TYPES.filter(t => !have.has(t));
        return { ...emp, missing_types: missing.map(labelFor), missing_count: missing.length };
      })
      .filter(emp => emp.missing_count > 0)
      .sort((a, b) => b.missing_count - a.missing_count);

    res.json({ data });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════
// POST /missing/:id/remind — nudge one employee about missing documents
// ═══════════════════════════════════════════════════════════
router.post('/missing/:id/remind', async (req, res) => {
  try {
    const companyId = req.user.company_id;
    const empRes = await query(`SELECT id, name FROM users WHERE id=$1 AND company_id=$2`, [req.params.id, companyId]);
    if (!empRes.rows.length) return res.status(404).json({ error: 'Employee not found' });

    const { rows: docs } = await query(`SELECT doc_type FROM employee_documents WHERE user_id=$1`, [req.params.id]);
    const have = new Set(docs.map(d => d.doc_type));
    const missing = REQUIRED_TYPES.filter(t => !have.has(t)).map(labelFor);
    if (!missing.length) return res.status(400).json({ error: 'No missing required documents for this employee' });

    require('../services/notif.helper').notifyDocumentReminder(companyId, empRes.rows[0], missing);
    res.json({ data: { sent: true, missing_types: missing } });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════
// GET /employees — employee-wise register (aggregate counts)
// ═══════════════════════════════════════════════════════════
router.get('/employees', async (req, res) => {
  try {
    const companyId = req.user.company_id;
    const params = [companyId, SYSTEM_ACCOUNT_EMAILS];
    const extraWhere = empFilters(req, params, 3);
    const { rows } = await query(`
      SELECT u.id, u.employee_code, u.name, dep.name AS department_name, des.name AS designation_name,
        COUNT(d.id)::int AS total_docs,
        COUNT(d.id) FILTER (WHERE d.verification_status='pending')::int AS pending_docs,
        COUNT(d.id) FILTER (WHERE d.verification_status='verified')::int AS verified_docs,
        COUNT(d.id) FILTER (WHERE d.verification_status='rejected')::int AS rejected_docs
      FROM users u
      LEFT JOIN employee_profiles ep ON ep.user_id = u.id
      LEFT JOIN hr_departments dep ON dep.id = ep.department_id
      LEFT JOIN hr_designations des ON des.id = ep.designation_id
      LEFT JOIN employee_documents d ON d.user_id = u.id
      WHERE u.company_id = $1 AND u.email != ALL($2::text[])
        AND COALESCE(ep.employment_status, 'active') = 'active' ${extraWhere}
      GROUP BY u.id, u.employee_code, u.name, dep.name, des.name
      ORDER BY u.name
    `, params);
    res.json({ data: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════
// GET /employees/:id — full per-employee document list, grouped by category
// ═══════════════════════════════════════════════════════════
router.get('/employees/:id', async (req, res) => {
  try {
    const companyId = req.user.company_id;
    const empRes = await query(
      `SELECT u.id, u.employee_code, u.name, u.email, dep.name AS department_name, des.name AS designation_name
       FROM users u
       LEFT JOIN employee_profiles ep ON ep.user_id = u.id
       LEFT JOIN hr_departments dep ON dep.id = ep.department_id
       LEFT JOIN hr_designations des ON des.id = ep.designation_id
       WHERE u.id = $1 AND u.company_id = $2`,
      [req.params.id, companyId]
    );
    if (!empRes.rows.length) return res.status(404).json({ error: 'Employee not found' });

    const { rows: docs } = await query(
      `SELECT d.*, vu.name AS verified_by_name FROM employee_documents d
       LEFT JOIN users vu ON vu.id = d.verified_by
       WHERE d.user_id = $1 ORDER BY d.uploaded_at DESC`,
      [req.params.id]
    );
    const withMeta = docs.map(d => ({ ...d, label: labelFor(d.doc_type), category: categoryOf(d.doc_type) }));
    const categories = {};
    for (const d of withMeta) { (categories[d.category] ||= []).push(d); }
    const haveTypes = new Set(docs.map(d => d.doc_type));
    const missing_types = REQUIRED_TYPES.filter(t => !haveTypes.has(t)).map(labelFor);

    res.json({ data: { ...empRes.rows[0], documents: withMeta, categories, missing_types, document_catalog: DOCUMENT_CATALOG } });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.DOCUMENT_CATALOG = DOCUMENT_CATALOG;
module.exports = router;
