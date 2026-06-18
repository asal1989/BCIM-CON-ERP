// src/routes/quality-mir.routes.js
// Material Inspection Request (MIR) + Material Test Certificates (MTC)

const express = require('express');
const dayjs   = require('dayjs');
const { query } = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');
const { loadProjectScope, appendProjectScope } = require('../middleware/projectScope');

// ── helpers ──────────────────────────────────────────────────────────────────
// MAX-based (avoids number reuse when a record is deleted; pass a txn client when available)
async function nextMIR(projectId, db = query) {
  const r = await db(`SELECT COALESCE(MAX(CAST(REGEXP_REPLACE(mir_number, '^.*-', '') AS INTEGER)), 0) AS last_seq
                      FROM quality_mir WHERE project_id=$1 AND mir_number ~ '[0-9]+$'`, [projectId]);
  return `MIR-${dayjs().year()}-${String(parseInt(r.rows[0].last_seq, 10) + 1).padStart(4, '0')}`;
}
async function nextMTC(projectId, db = query) {
  const r = await db(`SELECT COALESCE(MAX(CAST(REGEXP_REPLACE(mtc_number, '^.*-', '') AS INTEGER)), 0) AS last_seq
                      FROM quality_mtc WHERE project_id=$1 AND mtc_number ~ '[0-9]+$'`, [projectId]);
  return `MTC-${dayjs().year()}-${String(parseInt(r.rows[0].last_seq, 10) + 1).padStart(4, '0')}`;
}

// Compute auto_result from test_parameters array
function computeAutoResult(testParameters) {
  if (!Array.isArray(testParameters) || !testParameters.length) return 'pending';
  const hasAny = testParameters.some(p => p.actual != null && p.actual !== '');
  if (!hasAny) return 'pending';
  const anyFail = testParameters.some(p => {
    if (p.actual == null || p.actual === '') return false;
    const val = parseFloat(p.actual);
    if (isNaN(val)) return false;
    if (p.required_min != null && val < parseFloat(p.required_min)) return true;
    if (p.required_max != null && val > parseFloat(p.required_max)) return true;
    return false;
  });
  return anyFail ? 'fail' : 'pass';
}

// ═══════════════════════════════════════════════════════════════
// MIR ROUTER
// ═══════════════════════════════════════════════════════════════
const mirRouter = express.Router();
mirRouter.use(authenticate);
mirRouter.use(loadProjectScope);

// GET /quality/mir
mirRouter.get('/', async (req, res) => {
  try {
    const { project_id, status, search } = req.query;
    let sql = `
      SELECT m.*, p.name AS project_name,
             v.name AS vendor_name_resolved,
             u1.name AS raised_by_name,
             u2.name AS inspected_by_name,
             u3.name AS approved_by_name,
             (SELECT COUNT(*) FROM quality_mir_lab_tests ml WHERE ml.mir_id = m.id) AS lab_test_count,
             (SELECT COUNT(*) FROM quality_mtc mt WHERE mt.mir_id = m.id) AS mtc_count
        FROM quality_mir m
        JOIN projects p ON m.project_id = p.id
        LEFT JOIN vendors v ON m.vendor_id = v.id
        LEFT JOIN users u1 ON m.raised_by = u1.id
        LEFT JOIN users u2 ON m.inspected_by = u2.id
        LEFT JOIN users u3 ON m.approved_by = u3.id
       WHERE p.company_id = $1`;
    let params = [req.user.company_id];
    let idx = 2;
    if (project_id) { sql += ` AND m.project_id = $${idx++}`; params.push(project_id); }
    if (status)      { sql += ` AND m.status = $${idx++}`; params.push(status); }
    if (search) {
      sql += ` AND (m.mir_number ILIKE $${idx} OR m.material_name ILIKE $${idx} OR m.vendor_name ILIKE $${idx})`;
      params.push(`%${search}%`); idx++;
    }
    ({ sql, params } = appendProjectScope(req, sql, params, 'm'));
    sql += ' ORDER BY m.created_at DESC';
    res.json({ data: (await query(sql, params)).rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /quality/mir/:id  — with linked lab tests and MTCs
mirRouter.get('/:id', async (req, res) => {
  try {
    const mir = await query(`
      SELECT m.*, p.name AS project_name,
             v.name AS vendor_name_resolved,
             u1.name AS raised_by_name,
             u2.name AS inspected_by_name,
             u3.name AS approved_by_name,
             c.name AS checklist_name
        FROM quality_mir m
        JOIN projects p ON m.project_id = p.id
        LEFT JOIN vendors v ON m.vendor_id = v.id
        LEFT JOIN users u1 ON m.raised_by = u1.id
        LEFT JOIN users u2 ON m.inspected_by = u2.id
        LEFT JOIN users u3 ON m.approved_by = u3.id
        LEFT JOIN quality_checklists c ON m.checklist_id = c.id
       WHERE m.id = $1 AND p.company_id = $2`,
      [req.params.id, req.user.company_id]);
    if (!mir.rows.length) return res.status(404).json({ error: 'MIR not found' });

    const labTests = await query(`
      SELECT lt.*, ml.linked_at
        FROM quality_lab_tests lt
        JOIN quality_mir_lab_tests ml ON ml.lab_test_id = lt.id
       WHERE ml.mir_id = $1 ORDER BY lt.created_at DESC`, [req.params.id]);

    const mtcs = await query(`
      SELECT mt.*, v.name AS vendor_name
        FROM quality_mtc mt
        LEFT JOIN vendors v ON mt.vendor_id = v.id
       WHERE mt.mir_id = $1 ORDER BY mt.created_at DESC`, [req.params.id]);

    res.json({ data: { ...mir.rows[0], lab_tests: labTests.rows, mtcs: mtcs.rows } });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /quality/mir
mirRouter.post('/', async (req, res) => {
  try {
    const {
      project_id, material_name, material_code, vendor_id, vendor_name,
      delivery_date, delivery_location, quantity, unit,
      purchase_order_ref, grn_ref, checklist_id, mtc_required,
      traceability_ref, remarks, attachments
    } = req.body;
    if (!project_id || !material_name) return res.status(400).json({ error: 'project_id and material_name are required' });

    const mir_number = await nextMIR(project_id);
    const r = await query(`
      INSERT INTO quality_mir
        (project_id, mir_number, material_name, material_code, vendor_id, vendor_name,
         delivery_date, delivery_location, quantity, unit, purchase_order_ref, grn_ref,
         checklist_id, mtc_required, traceability_ref, remarks, attachments, raised_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
      RETURNING *`,
      [project_id, mir_number, material_name, material_code || null,
       vendor_id || null, vendor_name || null, delivery_date || null,
       delivery_location || null, quantity || null, unit || null,
       purchase_order_ref || null, grn_ref || null, checklist_id || null,
       mtc_required || false, traceability_ref || null,
       remarks || null, JSON.stringify(attachments || []), req.user.id]);
    res.status(201).json({ data: r.rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /quality/mir/:id
mirRouter.put('/:id', async (req, res) => {
  try {
    const {
      material_name, material_code, vendor_id, vendor_name,
      delivery_date, delivery_location, quantity, unit,
      purchase_order_ref, grn_ref, checklist_id, checklist_responses,
      mtc_required, traceability_ref, remarks, inspection_date
    } = req.body;
    const r = await query(`
      UPDATE quality_mir SET
        material_name=$1, material_code=$2, vendor_id=$3, vendor_name=$4,
        delivery_date=$5, delivery_location=$6, quantity=$7, unit=$8,
        purchase_order_ref=$9, grn_ref=$10, checklist_id=$11,
        checklist_responses=$12, mtc_required=$13, traceability_ref=$14,
        remarks=$15, inspection_date=$16, updated_at=NOW()
      WHERE id=$17 AND status IN ('pending','inspecting')
        AND project_id IN (SELECT id FROM projects WHERE company_id=$18)
      RETURNING *`,
      [material_name, material_code || null, vendor_id || null, vendor_name || null,
       delivery_date || null, delivery_location || null, quantity || null, unit || null,
       purchase_order_ref || null, grn_ref || null, checklist_id || null,
       JSON.stringify(checklist_responses || {}), mtc_required || false,
       traceability_ref || null, remarks || null, inspection_date || null,
       req.params.id, req.user.company_id]);
    if (!r.rows.length) return res.status(404).json({ error: 'MIR not found or cannot edit in current status' });
    res.json({ data: r.rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PATCH /quality/mir/:id/start-inspection
mirRouter.patch('/:id/start-inspection', async (req, res) => {
  try {
    const r = await query(`
      UPDATE quality_mir SET status='inspecting', inspected_by=$1, inspection_date=CURRENT_DATE, updated_at=NOW()
      WHERE id=$2 AND status='pending'
        AND project_id IN (SELECT id FROM projects WHERE company_id=$3)
      RETURNING *`,
      [req.user.id, req.params.id, req.user.company_id]);
    if (!r.rows.length) return res.status(404).json({ error: 'MIR not found or already inspected' });
    res.json({ data: r.rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PATCH /quality/mir/:id/approve
mirRouter.patch('/:id/approve',
  authorize('admin', 'super_admin', 'managing_director', 'director', 'project_manager', 'site_engineer'),
  async (req, res) => {
    try {
      const { conditions_of_approval } = req.body;
      const status = conditions_of_approval ? 'conditionally_approved' : 'approved';
      const r = await query(`
        UPDATE quality_mir SET
          status=$1, approved_by=$2, approval_date=CURRENT_DATE,
          conditions_of_approval=$3, updated_at=NOW()
        WHERE id=$4 AND status IN ('pending','inspecting')
          AND project_id IN (SELECT id FROM projects WHERE company_id=$5)
        RETURNING *`,
        [status, req.user.id, conditions_of_approval || null,
         req.params.id, req.user.company_id]);
      if (!r.rows.length) return res.status(404).json({ error: 'MIR not found' });
      res.json({ data: r.rows[0] });
    } catch (err) { res.status(500).json({ error: err.message }); }
  }
);

// PATCH /quality/mir/:id/reject
mirRouter.patch('/:id/reject',
  authorize('admin', 'super_admin', 'managing_director', 'director', 'project_manager', 'site_engineer'),
  async (req, res) => {
    try {
      const { rejection_reason } = req.body;
      const r = await query(`
        UPDATE quality_mir SET status='rejected', rejection_reason=$1, updated_at=NOW()
        WHERE id=$2 AND status IN ('pending','inspecting')
          AND project_id IN (SELECT id FROM projects WHERE company_id=$3)
        RETURNING *`,
        [rejection_reason || null, req.params.id, req.user.company_id]);
      if (!r.rows.length) return res.status(404).json({ error: 'MIR not found' });
      res.json({ data: r.rows[0] });
    } catch (err) { res.status(500).json({ error: err.message }); }
  }
);

// PATCH /quality/mir/:id/attachments
mirRouter.patch('/:id/attachments', async (req, res) => {
  try {
    const r = await query(`
      UPDATE quality_mir SET attachments=$1, updated_at=NOW()
      WHERE id=$2 AND project_id IN (SELECT id FROM projects WHERE company_id=$3) RETURNING *`,
      [JSON.stringify(req.body.attachments || []), req.params.id, req.user.company_id]);
    res.json({ data: r.rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /quality/mir/:id/link-lab-test
mirRouter.post('/:id/link-lab-test', async (req, res) => {
  try {
    const { lab_test_id } = req.body;
    await query(
      `INSERT INTO quality_mir_lab_tests (mir_id, lab_test_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
      [req.params.id, lab_test_id]);
    res.status(201).json({ message: 'Linked' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /quality/mir/:id  — only pending
mirRouter.delete('/:id', authorize('admin', 'super_admin'), async (req, res) => {
  try {
    const r = await query(`
      DELETE FROM quality_mir WHERE id=$1 AND status='pending'
        AND project_id IN (SELECT id FROM projects WHERE company_id=$2) RETURNING id`,
      [req.params.id, req.user.company_id]);
    if (!r.rows.length) return res.status(404).json({ error: 'MIR not found or cannot delete in current status' });
    res.json({ message: 'Deleted' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════════
// MTC ROUTER
// ═══════════════════════════════════════════════════════════════
const mtcRouter = express.Router();
mtcRouter.use(authenticate);
mtcRouter.use(loadProjectScope);

// GET /quality/mtc
mtcRouter.get('/', async (req, res) => {
  try {
    const { project_id, status, auto_result, search } = req.query;
    let sql = `
      SELECT mt.*, p.name AS project_name,
             v.name AS vendor_name_resolved,
             m.mir_number,
             u1.name AS created_by_name,
             u2.name AS reviewed_by_name
        FROM quality_mtc mt
        JOIN projects p ON mt.project_id = p.id
        LEFT JOIN vendors v ON mt.vendor_id = v.id
        LEFT JOIN quality_mir m ON mt.mir_id = m.id
        LEFT JOIN users u1 ON mt.created_by = u1.id
        LEFT JOIN users u2 ON mt.reviewed_by = u2.id
       WHERE p.company_id = $1`;
    let params = [req.user.company_id];
    let idx = 2;
    if (project_id)  { sql += ` AND mt.project_id = $${idx++}`; params.push(project_id); }
    if (status)       { sql += ` AND mt.status = $${idx++}`; params.push(status); }
    if (auto_result)  { sql += ` AND mt.auto_result = $${idx++}`; params.push(auto_result); }
    if (search) {
      sql += ` AND (mt.internal_ref ILIKE $${idx} OR mt.mtc_number ILIKE $${idx} OR mt.material_name ILIKE $${idx})`;
      params.push(`%${search}%`); idx++;
    }
    ({ sql, params } = appendProjectScope(req, sql, params, 'mt'));
    sql += ' ORDER BY mt.created_at DESC';
    res.json({ data: (await query(sql, params)).rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /quality/mtc/:id
mtcRouter.get('/:id', async (req, res) => {
  try {
    const mtc = await query(`
      SELECT mt.*, p.name AS project_name,
             v.name AS vendor_name_resolved, m.mir_number,
             u1.name AS created_by_name, u2.name AS reviewed_by_name
        FROM quality_mtc mt
        JOIN projects p ON mt.project_id = p.id
        LEFT JOIN vendors v ON mt.vendor_id = v.id
        LEFT JOIN quality_mir m ON mt.mir_id = m.id
        LEFT JOIN users u1 ON mt.created_by = u1.id
        LEFT JOIN users u2 ON mt.reviewed_by = u2.id
       WHERE mt.id = $1 AND p.company_id = $2`,
      [req.params.id, req.user.company_id]);
    if (!mtc.rows.length) return res.status(404).json({ error: 'MTC not found' });

    const labTests = await query(`
      SELECT lt.* FROM quality_lab_tests lt
        JOIN quality_mtc_lab_tests ml ON ml.lab_test_id = lt.id
       WHERE ml.mtc_id = $1 ORDER BY lt.created_at DESC`, [req.params.id]);

    res.json({ data: { ...mtc.rows[0], lab_tests: labTests.rows } });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /quality/mtc
mtcRouter.post('/', async (req, res) => {
  try {
    const {
      project_id, mtc_number, material_name, material_grade,
      manufacturer, heat_number, batch_number, quantity, unit,
      test_lab, nabl_accredited, iso_certified, accreditation_no,
      cert_date, expiry_date, applicable_spec, test_parameters,
      mir_id, vendor_id, attachments
    } = req.body;
    if (!project_id || !material_name || !mtc_number)
      return res.status(400).json({ error: 'project_id, mtc_number and material_name are required' });

    const internal_ref = await nextMTC(project_id);
    const params_json  = Array.isArray(test_parameters) ? test_parameters : [];
    const auto_result  = computeAutoResult(params_json);

    const r = await query(`
      INSERT INTO quality_mtc
        (project_id, mtc_number, internal_ref, material_name, material_grade,
         manufacturer, heat_number, batch_number, quantity, unit, test_lab,
         nabl_accredited, iso_certified, accreditation_no, cert_date, expiry_date,
         applicable_spec, test_parameters, auto_result, mir_id, vendor_id,
         attachments, created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)
      RETURNING *`,
      [project_id, mtc_number, internal_ref, material_name, material_grade || null,
       manufacturer || null, heat_number || null, batch_number || null,
       quantity || null, unit || null, test_lab || null,
       nabl_accredited || false, iso_certified || false, accreditation_no || null,
       cert_date || null, expiry_date || null, applicable_spec || null,
       JSON.stringify(params_json), auto_result,
       mir_id || null, vendor_id || null,
       JSON.stringify(attachments || []), req.user.id]);
    res.status(201).json({ data: r.rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /quality/mtc/:id
mtcRouter.put('/:id', async (req, res) => {
  try {
    const {
      mtc_number, material_name, material_grade, manufacturer,
      heat_number, batch_number, quantity, unit, test_lab,
      nabl_accredited, iso_certified, accreditation_no,
      cert_date, expiry_date, applicable_spec, test_parameters, mir_id, vendor_id
    } = req.body;
    const params_json = Array.isArray(test_parameters) ? test_parameters : [];
    const auto_result = computeAutoResult(params_json);

    const r = await query(`
      UPDATE quality_mtc SET
        mtc_number=$1, material_name=$2, material_grade=$3, manufacturer=$4,
        heat_number=$5, batch_number=$6, quantity=$7, unit=$8, test_lab=$9,
        nabl_accredited=$10, iso_certified=$11, accreditation_no=$12,
        cert_date=$13, expiry_date=$14, applicable_spec=$15,
        test_parameters=$16, auto_result=$17, mir_id=$18, vendor_id=$19,
        updated_at=NOW()
      WHERE id=$20 AND status IN ('pending_review','conditional')
        AND project_id IN (SELECT id FROM projects WHERE company_id=$21)
      RETURNING *`,
      [mtc_number, material_name, material_grade || null, manufacturer || null,
       heat_number || null, batch_number || null, quantity || null, unit || null,
       test_lab || null, nabl_accredited || false, iso_certified || false,
       accreditation_no || null, cert_date || null, expiry_date || null,
       applicable_spec || null, JSON.stringify(params_json), auto_result,
       mir_id || null, vendor_id || null, req.params.id, req.user.company_id]);
    if (!r.rows.length) return res.status(404).json({ error: 'MTC not found or cannot edit reviewed MTC' });
    res.json({ data: r.rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PATCH /quality/mtc/:id/review  — accept or reject
mtcRouter.patch('/:id/review',
  authorize('admin', 'super_admin', 'managing_director', 'director', 'project_manager'),
  async (req, res) => {
    try {
      const { action, review_remarks } = req.body; // action: 'accepted' | 'rejected' | 'conditional'
      if (!['accepted','rejected','conditional'].includes(action))
        return res.status(400).json({ error: 'action must be accepted, rejected, or conditional' });
      const r = await query(`
        UPDATE quality_mtc SET
          status=$1, reviewed_by=$2, reviewed_at=NOW(), review_remarks=$3, updated_at=NOW()
        WHERE id=$4 AND status='pending_review'
          AND project_id IN (SELECT id FROM projects WHERE company_id=$5)
        RETURNING *`,
        [action, req.user.id, review_remarks || null, req.params.id, req.user.company_id]);
      if (!r.rows.length) return res.status(404).json({ error: 'MTC not found or already reviewed' });
      res.json({ data: r.rows[0] });
    } catch (err) { res.status(500).json({ error: err.message }); }
  }
);

// PATCH /quality/mtc/:id/attachments
mtcRouter.patch('/:id/attachments', async (req, res) => {
  try {
    const r = await query(`
      UPDATE quality_mtc SET attachments=$1, updated_at=NOW()
      WHERE id=$2 AND project_id IN (SELECT id FROM projects WHERE company_id=$3) RETURNING *`,
      [JSON.stringify(req.body.attachments || []), req.params.id, req.user.company_id]);
    res.json({ data: r.rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /quality/mtc/:id/link-lab-test
mtcRouter.post('/:id/link-lab-test', async (req, res) => {
  try {
    const { lab_test_id } = req.body;
    await query(
      `INSERT INTO quality_mtc_lab_tests (mtc_id, lab_test_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
      [req.params.id, lab_test_id]);
    res.status(201).json({ message: 'Linked' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /quality/mtc/:id
mtcRouter.delete('/:id', authorize('admin', 'super_admin'), async (req, res) => {
  try {
    const r = await query(`
      DELETE FROM quality_mtc WHERE id=$1 AND status='pending_review'
        AND project_id IN (SELECT id FROM projects WHERE company_id=$2) RETURNING id`,
      [req.params.id, req.user.company_id]);
    if (!r.rows.length) return res.status(404).json({ error: 'MTC not found or cannot delete reviewed MTC' });
    res.json({ message: 'Deleted' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = { mirRouter, mtcRouter };
