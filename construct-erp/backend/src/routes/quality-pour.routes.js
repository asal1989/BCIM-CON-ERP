// src/routes/quality-pour.routes.js
// Pour Card Management — pre/post-pour checklists, cube test linkage,
// auto-NCR on failed 28-day strength, stays open until certs verified.

const express = require('express');
const router  = express.Router();
const dayjs   = require('dayjs');
const { query } = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');
const { loadProjectScope, appendProjectScope } = require('../middleware/projectScope');
const { createNotification } = require('../controllers/notification.controller');

router.use(authenticate);
router.use(loadProjectScope);

// ── helpers ──────────────────────────────────────────────────────────────────
// MAX-based (avoids number reuse when a record is deleted)
async function nextPourCard(projectId, db = query) {
  const r = await db(`SELECT COALESCE(MAX(CAST(REGEXP_REPLACE(pour_card_number, '^.*-', '') AS INTEGER)), 0) AS last_seq
                      FROM quality_pour_cards WHERE project_id=$1 AND pour_card_number ~ '[0-9]+$'`, [projectId]);
  return `PC-${dayjs().year()}-${String(parseInt(r.rows[0].last_seq, 10) + 1).padStart(4, '0')}`;
}

// Grade "M30" -> 30
function gradeToFck(grade) {
  if (!grade) return null;
  const m = String(grade).match(/M\s*(\d+)/i);
  return m ? parseFloat(m[1]) : null;
}

/**
 * Shared: evaluate a 28-day cube result against the pour's target strength.
 * Auto-creates an NCR (and notifications) if it fails the IS 456 0.85·fck rule.
 * Marks the pour card rejected on fail, or closed when ALL its cube tests pass.
 * Exported so quality.routes.js lab-test PATCH can reuse it.
 */
async function evaluateCubeResultAndChain({ labTestId, companyId, userId }) {
  const ltRes = await query('SELECT * FROM quality_lab_tests WHERE id=$1', [labTestId]);
  if (!ltRes.rows.length) return { evaluated: false };
  const test = ltRes.rows[0];
  if (!test.pour_card_id) return { evaluated: false };

  const pcRes = await query('SELECT * FROM quality_pour_cards WHERE id=$1', [test.pour_card_id]);
  const pour  = pcRes.rows[0];
  if (!pour) return { evaluated: false };

  const result28 = test.result_28day != null ? parseFloat(test.result_28day) : null;
  const fck = gradeToFck(pour.concrete_grade) || (test.target_strength != null ? parseFloat(test.target_strength) : null);

  let ncrId = test.ncr_id;
  let failed = false;

  if (result28 != null && fck != null) {
    const minAccept = fck * 0.85;            // IS 456 individual-cube acceptance
    failed = result28 < minAccept;

    if (failed && !test.auto_ncr_created) {
      // create NCR
      const cnt = (await query(
        `SELECT COALESCE(MAX(CAST(REGEXP_REPLACE(ncr_number, '^.*-', '') AS INTEGER)), 0) AS last_seq
         FROM quality_ncrs WHERE project_id=$1 AND ncr_number ~ '[0-9]+$'`, [test.project_id])).rows[0].last_seq;
      const ncrNum = `NCR-${dayjs().year()}-${String(parseInt(cnt) + 1).padStart(4, '0')}`;
      const severity = result28 < fck * 0.75 ? 'critical' : 'major';
      const ncr = await query(`
        INSERT INTO quality_ncrs
          (project_id, ncr_number, title, description, raised_by,
           severity, issue_type, priority, status, source, pour_card_id)
        VALUES ($1,$2,$3,$4,$5,$6,'lab_failure','high','open','lab_failure',$7)
        RETURNING *`,
        [test.project_id, ncrNum,
         `Cube Test Failure — ${pour.pour_card_number}`,
         `28-day strength ${result28} MPa is below the acceptance minimum ` +
           `${minAccept.toFixed(1)} MPa (0.85 × ${fck} for ${pour.concrete_grade || 'target'}). ` +
           `Pour Card: ${pour.pour_card_number} — ${pour.pour_description}. Lab Test: ${test.test_number}.`,
         userId, severity, test.pour_card_id]);
      ncrId = ncr.rows[0].id;

      await query(
        'UPDATE quality_lab_tests SET is_failed=true, auto_ncr_created=true, ncr_id=$1 WHERE id=$2',
        [ncrId, labTestId]);
      await query(
        "UPDATE quality_pour_cards SET ncr_id=$1, status='rejected', updated_at=NOW() WHERE id=$2",
        [ncrId, test.pour_card_id]);

      // notify QA managers
      try {
        await createNotification({
          company_id: companyId,
          target_role: 'project_manager',
          type: 'quality_alert',
          severity: 'critical',
          title: 'Cube Test Failed — NCR Auto-Created',
          message: `${ncrNum}: 28-day strength ${result28} MPa < ${minAccept.toFixed(1)} MPa for ${pour.pour_card_number}`,
          link: '/quality/ncr',
          related_type: 'pour_card',
          related_id: test.pour_card_id,
        });
      } catch (e) { /* notification best-effort */ }
    }
  }

  // Re-check whether ALL cube tests for this pour have passed
  const sibs = await query(
    'SELECT result_status, result_28day, is_failed FROM quality_lab_tests WHERE pour_card_id=$1',
    [test.pour_card_id]);
  const anyFailed   = sibs.rows.some(t => t.is_failed);
  const anyPending  = sibs.rows.some(t => !t.result_status || t.result_status === 'pending');
  const allPassed   = sibs.rows.length > 0 && sibs.rows.every(t => t.result_status === 'pass');

  if (!anyFailed && allPassed && !anyPending) {
    await query(
      "UPDATE quality_pour_cards SET all_certs_verified=true, status='closed', updated_at=NOW() WHERE id=$1 AND status != 'rejected'",
      [test.pour_card_id]);
  }

  return { evaluated: true, failed, ncrId };
}

// ═══════════════════════════════════════════════════════════════
// POUR CARD ROUTES
// ═══════════════════════════════════════════════════════════════

// GET /quality/pour-cards
router.get('/', async (req, res) => {
  try {
    const { project_id, status, pour_type, search } = req.query;
    let sql = `
      SELECT pc.*, p.name AS project_name,
             u1.name AS created_by_name,
             u2.name AS pre_pour_approved_by_name,
             u3.name AS site_engineer_name,
             d.drawing_number,
             n.ncr_number,
             (SELECT COUNT(*) FROM quality_lab_tests lt WHERE lt.pour_card_id = pc.id) AS cube_test_count,
             (SELECT COUNT(*) FROM quality_lab_tests lt WHERE lt.pour_card_id = pc.id AND lt.result_status='pass') AS cube_pass_count
        FROM quality_pour_cards pc
        JOIN projects p ON pc.project_id = p.id
        LEFT JOIN users u1 ON pc.created_by = u1.id
        LEFT JOIN users u2 ON pc.pre_pour_approved_by = u2.id
        LEFT JOIN users u3 ON pc.site_engineer_id = u3.id
        LEFT JOIN quality_drawings d ON pc.drawing_id = d.id
        LEFT JOIN quality_ncrs n ON pc.ncr_id = n.id
       WHERE p.company_id = $1`;
    let params = [req.user.company_id];
    let idx = 2;
    if (project_id) { sql += ` AND pc.project_id = $${idx++}`; params.push(project_id); }
    if (status)      { sql += ` AND pc.status = $${idx++}`; params.push(status); }
    if (pour_type)   { sql += ` AND pc.pour_type = $${idx++}`; params.push(pour_type); }
    if (search) {
      sql += ` AND (pc.pour_card_number ILIKE $${idx} OR pc.pour_description ILIKE $${idx} OR pc.location ILIKE $${idx})`;
      params.push(`%${search}%`); idx++;
    }
    ({ sql, params } = appendProjectScope(req, sql, params, 'pc'));
    sql += ' ORDER BY pc.created_at DESC';
    res.json({ data: (await query(sql, params)).rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /quality/pour-cards/:id  — with cube tests + linked checklists
router.get('/:id', async (req, res) => {
  try {
    const pc = await query(`
      SELECT pc.*, p.name AS project_name,
             u1.name AS created_by_name,
             u2.name AS pre_pour_approved_by_name,
             u3.name AS post_pour_signed_by_name,
             u4.name AS site_engineer_name,
             d.drawing_number, n.ncr_number,
             prc.name AS pre_pour_checklist_name, prc.items AS pre_pour_checklist_items,
             poc.name AS post_pour_checklist_name, poc.items AS post_pour_checklist_items,
             r.rfi_number
        FROM quality_pour_cards pc
        JOIN projects p ON pc.project_id = p.id
        LEFT JOIN users u1 ON pc.created_by = u1.id
        LEFT JOIN users u2 ON pc.pre_pour_approved_by = u2.id
        LEFT JOIN users u3 ON pc.post_pour_signed_by = u3.id
        LEFT JOIN users u4 ON pc.site_engineer_id = u4.id
        LEFT JOIN quality_drawings d ON pc.drawing_id = d.id
        LEFT JOIN quality_ncrs n ON pc.ncr_id = n.id
        LEFT JOIN quality_checklists prc ON pc.pre_pour_checklist_id = prc.id
        LEFT JOIN quality_checklists poc ON pc.post_pour_checklist_id = poc.id
        LEFT JOIN quality_rfis r ON pc.rfi_id = r.id
       WHERE pc.id = $1 AND p.company_id = $2`,
      [req.params.id, req.user.company_id]);
    if (!pc.rows.length) return res.status(404).json({ error: 'Pour card not found' });

    const cubes = await query(`
      SELECT lt.*, n.ncr_number
        FROM quality_lab_tests lt
        LEFT JOIN quality_ncrs n ON lt.ncr_id = n.id
       WHERE lt.pour_card_id = $1 ORDER BY lt.created_at DESC`, [req.params.id]);

    res.json({ data: { ...pc.rows[0], cube_tests: cubes.rows } });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /quality/pour-cards
router.post('/', async (req, res) => {
  try {
    const {
      project_id, pour_description, pour_type, concrete_grade, location,
      drawing_ref, drawing_id, planned_pour_date, volume_planned,
      pre_pour_checklist_id, post_pour_checklist_id, rfi_id,
      cube_sets_required, site_engineer_id, contractor_rep, remarks
    } = req.body;
    if (!project_id || !pour_description)
      return res.status(400).json({ error: 'project_id and pour_description are required' });

    const pour_card_number = await nextPourCard(project_id);
    const r = await query(`
      INSERT INTO quality_pour_cards
        (project_id, pour_card_number, pour_description, pour_type, concrete_grade,
         location, drawing_ref, drawing_id, planned_pour_date, volume_planned,
         pre_pour_checklist_id, post_pour_checklist_id, rfi_id, cube_sets_required,
         site_engineer_id, contractor_rep, remarks, created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
      RETURNING *`,
      [project_id, pour_card_number, pour_description, pour_type || 'slab',
       concrete_grade || null, location || null, drawing_ref || null,
       drawing_id || null, planned_pour_date || null, volume_planned || null,
       pre_pour_checklist_id || null, post_pour_checklist_id || null,
       rfi_id || null, cube_sets_required || 3, site_engineer_id || null,
       contractor_rep || null, remarks || null, req.user.id]);
    res.status(201).json({ data: r.rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /quality/pour-cards/:id
router.put('/:id', async (req, res) => {
  try {
    const {
      pour_description, pour_type, concrete_grade, location, drawing_ref,
      drawing_id, planned_pour_date, volume_planned, volume_actual,
      pre_pour_checklist_id, post_pour_checklist_id, rfi_id,
      cube_sets_required, cube_sets_taken, site_engineer_id, contractor_rep, remarks
    } = req.body;
    const r = await query(`
      UPDATE quality_pour_cards SET
        pour_description=$1, pour_type=$2, concrete_grade=$3, location=$4,
        drawing_ref=$5, drawing_id=$6, planned_pour_date=$7, volume_planned=$8,
        volume_actual=$9, pre_pour_checklist_id=$10, post_pour_checklist_id=$11,
        rfi_id=$12, cube_sets_required=$13, cube_sets_taken=$14,
        site_engineer_id=$15, contractor_rep=$16, remarks=$17, updated_at=NOW()
      WHERE id=$18 AND status NOT IN ('closed')
        AND project_id IN (SELECT id FROM projects WHERE company_id=$19)
      RETURNING *`,
      [pour_description, pour_type || 'slab', concrete_grade || null, location || null,
       drawing_ref || null, drawing_id || null, planned_pour_date || null,
       volume_planned || null, volume_actual || null, pre_pour_checklist_id || null,
       post_pour_checklist_id || null, rfi_id || null, cube_sets_required || 3,
       cube_sets_taken || 0, site_engineer_id || null, contractor_rep || null,
       remarks || null, req.params.id, req.user.company_id]);
    if (!r.rows.length) return res.status(404).json({ error: 'Pour card not found or already closed' });
    res.json({ data: r.rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PATCH /quality/pour-cards/:id/pre-pour-approve
router.patch('/:id/pre-pour-approve',
  authorize('admin', 'super_admin', 'managing_director', 'director', 'project_manager', 'site_engineer'),
  async (req, res) => {
    try {
      const { pre_pour_responses, decision } = req.body; // decision: 'approved' | 'rejected'
      const status = decision === 'rejected' ? 'rejected' : 'approved';
      const r = await query(`
        UPDATE quality_pour_cards SET
          pre_pour_responses=$1, pre_pour_status=$2,
          pre_pour_approved_by=$3, pre_pour_approved_at=NOW(), updated_at=NOW()
        WHERE id=$4 AND project_id IN (SELECT id FROM projects WHERE company_id=$5)
        RETURNING *`,
        [JSON.stringify(pre_pour_responses || {}), status,
         req.user.id, req.params.id, req.user.company_id]);
      if (!r.rows.length) return res.status(404).json({ error: 'Pour card not found' });
      res.json({ data: r.rows[0] });
    } catch (err) { res.status(500).json({ error: err.message }); }
  }
);

// PATCH /quality/pour-cards/:id/start-pour
router.patch('/:id/start-pour', async (req, res) => {
  try {
    // Guard: pre-pour must be approved
    const chk = await query('SELECT pre_pour_status FROM quality_pour_cards WHERE id=$1 AND project_id IN (SELECT id FROM projects WHERE company_id=$2)',
      [req.params.id, req.user.company_id]);
    if (!chk.rows.length) return res.status(404).json({ error: 'Pour card not found' });
    if (chk.rows[0].pre_pour_status !== 'approved')
      return res.status(400).json({ error: 'Pre-pour checklist must be approved before starting the pour' });

    const { volume_actual } = req.body;
    const r = await query(`
      UPDATE quality_pour_cards SET
        status='poured', actual_pour_start=NOW(),
        volume_actual=COALESCE($1, volume_actual), updated_at=NOW()
      WHERE id=$2 RETURNING *`,
      [volume_actual || null, req.params.id]);
    res.json({ data: r.rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PATCH /quality/pour-cards/:id/post-pour-sign
router.patch('/:id/post-pour-sign', async (req, res) => {
  try {
    const { post_pour_responses, volume_actual, cube_sets_taken } = req.body;
    const r = await query(`
      UPDATE quality_pour_cards SET
        post_pour_responses=$1, post_pour_status='completed',
        post_pour_signed_by=$2, post_pour_signed_at=NOW(),
        actual_pour_end=NOW(), status='certs_pending',
        volume_actual=COALESCE($3, volume_actual),
        cube_sets_taken=COALESCE($4, cube_sets_taken), updated_at=NOW()
      WHERE id=$5 AND status='poured'
        AND project_id IN (SELECT id FROM projects WHERE company_id=$6)
      RETURNING *`,
      [JSON.stringify(post_pour_responses || {}), req.user.id,
       volume_actual || null, cube_sets_taken || null,
       req.params.id, req.user.company_id]);
    if (!r.rows.length) return res.status(404).json({ error: 'Pour card not in poured state' });
    res.json({ data: r.rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /quality/pour-cards/:id/link-lab-test
router.post('/:id/link-lab-test', async (req, res) => {
  try {
    const { lab_test_id } = req.body;
    await query('UPDATE quality_lab_tests SET pour_card_id=$1 WHERE id=$2', [req.params.id, lab_test_id]);
    res.status(201).json({ message: 'Linked' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /quality/pour-cards/:id/lab-tests
router.get('/:id/lab-tests', async (req, res) => {
  try {
    const r = await query(`
      SELECT lt.*, n.ncr_number FROM quality_lab_tests lt
        LEFT JOIN quality_ncrs n ON lt.ncr_id = n.id
       WHERE lt.pour_card_id=$1 ORDER BY lt.created_at DESC`, [req.params.id]);
    res.json({ data: r.rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PATCH /quality/pour-cards/:id/attachments
router.patch('/:id/attachments', async (req, res) => {
  try {
    const r = await query(`
      UPDATE quality_pour_cards SET attachments=$1, updated_at=NOW()
      WHERE id=$2 AND project_id IN (SELECT id FROM projects WHERE company_id=$3) RETURNING *`,
      [JSON.stringify(req.body.attachments || []), req.params.id, req.user.company_id]);
    res.json({ data: r.rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /quality/pour-cards/:id  — only pre_pour
router.delete('/:id', authorize('admin', 'super_admin'), async (req, res) => {
  try {
    const r = await query(`
      DELETE FROM quality_pour_cards WHERE id=$1 AND status='pre_pour'
        AND project_id IN (SELECT id FROM projects WHERE company_id=$2) RETURNING id`,
      [req.params.id, req.user.company_id]);
    if (!r.rows.length) return res.status(404).json({ error: 'Pour card not found or cannot delete after pour started' });
    res.json({ message: 'Deleted' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
module.exports.evaluateCubeResultAndChain = evaluateCubeResultAndChain;
