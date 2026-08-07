// src/routes/hr-onboarding.routes.js
// Onboarding Dashboard — command-center view over the existing
// employee_lifecycle_checklist (stage='onboarding') tracker + employee
// documents/assets/training, all real data, no fabricated numbers.
const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const { query } = require('../config/database');
const hrEmployees = require('./hr-employees.routes');
const notif = require('../services/notif.helper');

router.use(authenticate);
router.use(authorize('super_admin', 'admin', 'hr', 'hr_admin', 'hr_manager'));

const SYSTEM_ACCOUNT_EMAILS = hrEmployees.SYSTEM_ACCOUNT_EMAILS || [];
const ensureLifecycleChecklist = hrEmployees.ensureLifecycleChecklist;

// Population window — employees who joined within this many days, OR whose
// onboarding checklist isn't 100% done yet regardless of join date, are
// considered part of the "active onboarding" population.
const ONBOARDING_WINDOW_DAYS = 180;

// Used for the "Missing Documents" KPI. Not split by employee_category yet
// (workmen may legitimately lack education/experience docs) — flagged as a
// non-blocking follow-up in the plan, left as one list for now.
const REQUIRED_DOC_TYPES = ['pan', 'aadhaar', 'photo', 'education', 'experience', 'bank_proof'];

// ─── Training schema resolution ────────────────────────────────────────────
// Two incompatible hr_training_programs schemas exist in the codebase
// (hr-training.routes.js's CREATE TABLE never actually ran — the table
// already existed with hr-advanced.routes.js's shape). Probe live columns
// once and memoize rather than guessing which is deployed.
let trainingSchemaPromise = null;
async function resolveTrainingSchema() {
  if (trainingSchemaPromise) return trainingSchemaPromise;
  trainingSchemaPromise = (async () => {
    try {
      const { rows } = await query(`
        SELECT
          EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='hr_training_nominations' AND column_name='user_id') AS has_nominations_user,
          EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='hr_training_participants' AND column_name='employee_id') AS has_participants_emp,
          EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='hr_training_programs' AND column_name='start_date') AS has_start_date
      `);
      const r = rows[0] || {};
      if (r.has_nominations_user) {
        return {
          available: true,
          table: 'hr_training_nominations',
          empCol: 'user_id',
          completedExpr: `attendance_status = 'completed'`,
          certExpr: null, // this schema has no certificate_issued column
        };
      }
      if (r.has_participants_emp) {
        return {
          available: true,
          table: 'hr_training_participants',
          empCol: 'employee_id',
          completedExpr: `attended = TRUE`,
          certExpr: `certificate_issued = TRUE`,
        };
      }
      return { available: false };
    } catch {
      return { available: false };
    }
  })();
  return trainingSchemaPromise;
}

// ─── reconcileDerived ───────────────────────────────────────────────────────
// Auto-ticks checklist items that have a real, independently-verifiable data
// source, guarded by status<>'done' so a manual completion is never
// overwritten. Also stamps onboarding_completed_at once, when every
// onboarding item is done and it wasn't stamped already. Scoped to a list of
// user_ids when given (per-employee tracker) or the whole company otherwise.
async function reconcileDerived(companyId, userIds = null) {
  const scope = userIds && userIds.length ? `AND lc.user_id = ANY($2::uuid[])` : '';
  const params = userIds && userIds.length ? [companyId, userIds] : [companyId];

  // profile_basics
  await query(`
    UPDATE employee_lifecycle_checklist lc SET status='done', completed_at=NOW(), updated_at=NOW()
    FROM employee_profiles ep
    WHERE lc.user_id = ep.user_id AND lc.company_id = $1 AND lc.stage='onboarding'
      AND lc.item_key='profile_basics' AND lc.status <> 'done' ${scope}
      AND ep.department_id IS NOT NULL AND ep.designation_id IS NOT NULL AND ep.date_of_joining IS NOT NULL
  `, params);

  // profile_photo
  await query(`
    UPDATE employee_lifecycle_checklist lc SET status='done', completed_at=NOW(), updated_at=NOW()
    FROM employee_profiles ep
    WHERE lc.user_id = ep.user_id AND lc.company_id = $1 AND lc.stage='onboarding'
      AND lc.item_key='profile_photo' AND lc.status <> 'done' ${scope}
      AND ep.profile_photo_url IS NOT NULL AND ep.profile_photo_url <> ''
  `, params);

  // bank_pf_esi
  await query(`
    UPDATE employee_lifecycle_checklist lc SET status='done', completed_at=NOW(), updated_at=NOW()
    FROM employee_profiles ep
    WHERE lc.user_id = ep.user_id AND lc.company_id = $1 AND lc.stage='onboarding'
      AND lc.item_key='bank_pf_esi' AND lc.status <> 'done' ${scope}
      AND ep.bank_account_number IS NOT NULL AND ep.bank_account_number <> ''
      AND ep.bank_ifsc IS NOT NULL AND ep.bank_ifsc <> ''
  `, params);

  // joining_documents — any document at all
  await query(`
    UPDATE employee_lifecycle_checklist lc SET status='done', completed_at=NOW(), updated_at=NOW()
    WHERE lc.company_id = $1 AND lc.stage='onboarding' AND lc.item_key='joining_documents'
      AND lc.status <> 'done' ${scope}
      AND EXISTS (SELECT 1 FROM employee_documents d WHERE d.user_id = lc.user_id)
  `, params);

  // doc_verify_pan / doc_verify_aadhaar — a verified document of that type
  await query(`
    UPDATE employee_lifecycle_checklist lc SET status='done', completed_at=NOW(), updated_at=NOW()
    WHERE lc.company_id = $1 AND lc.stage='onboarding' AND lc.item_key='doc_verify_pan'
      AND lc.status <> 'done' ${scope}
      AND EXISTS (SELECT 1 FROM employee_documents d WHERE d.user_id = lc.user_id AND d.doc_type='pan' AND d.verification_status='verified')
  `, params);
  await query(`
    UPDATE employee_lifecycle_checklist lc SET status='done', completed_at=NOW(), updated_at=NOW()
    WHERE lc.company_id = $1 AND lc.stage='onboarding' AND lc.item_key='doc_verify_aadhaar'
      AND lc.status <> 'done' ${scope}
      AND EXISTS (SELECT 1 FROM employee_documents d WHERE d.user_id = lc.user_id AND d.doc_type='aadhaar' AND d.verification_status='verified')
  `, params);

  // asset_issue — a laptop currently assigned
  await query(`
    UPDATE employee_lifecycle_checklist lc SET status='done', completed_at=NOW(), updated_at=NOW()
    WHERE lc.company_id = $1 AND lc.stage='onboarding' AND lc.item_key='asset_issue'
      AND lc.status <> 'done' ${scope}
      AND EXISTS (SELECT 1 FROM hr_employee_assets a WHERE a.employee_id = lc.user_id AND a.category='laptop' AND a.status='assigned')
  `, params);

  // policy_ack — at least one policy acknowledged
  await query(`
    UPDATE employee_lifecycle_checklist lc SET status='done', completed_at=NOW(), updated_at=NOW()
    WHERE lc.company_id = $1 AND lc.stage='onboarding' AND lc.item_key='policy_ack'
      AND lc.status <> 'done' ${scope}
      AND EXISTS (SELECT 1 FROM hr_policy_acknowledgements pa WHERE pa.user_id = lc.user_id)
  `, params);

  // confirmation
  await query(`
    UPDATE employee_lifecycle_checklist lc SET status='done', completed_at=NOW(), updated_at=NOW()
    FROM employee_profiles ep
    WHERE lc.user_id = ep.user_id AND lc.company_id = $1 AND lc.stage='onboarding'
      AND lc.item_key='confirmation' AND lc.status <> 'done' ${scope}
      AND ep.date_of_confirmation IS NOT NULL
  `, params);

  // training_assigned — nominated/scheduled for any training program
  const ts = await resolveTrainingSchema();
  if (ts.available) {
    await query(`
      UPDATE employee_lifecycle_checklist lc SET status='done', completed_at=NOW(), updated_at=NOW()
      WHERE lc.company_id = $1 AND lc.stage='onboarding' AND lc.item_key='training_assigned'
        AND lc.status <> 'done' ${scope}
        AND EXISTS (SELECT 1 FROM ${ts.table} t WHERE t.${ts.empCol} = lc.user_id)
    `, params);
  }

  // Stamp onboarding_completed_at once all onboarding items are done.
  await query(`
    UPDATE employee_profiles ep SET onboarding_completed_at = NOW()
    WHERE ep.onboarding_completed_at IS NULL AND ep.company_id = $1
      ${userIds && userIds.length ? 'AND ep.user_id = ANY($2::uuid[])' : ''}
      AND EXISTS (SELECT 1 FROM employee_lifecycle_checklist lc WHERE lc.user_id = ep.user_id AND lc.stage='onboarding')
      AND NOT EXISTS (
        SELECT 1 FROM employee_lifecycle_checklist lc
        WHERE lc.user_id = ep.user_id AND lc.stage='onboarding' AND lc.status <> 'done'
      )
  `, params);
}

// ─── Shared population CTE ──────────────────────────────────────────────────
// $1 = company_id, $2 = system account emails array
function basePopulationSQL(extraWhere = '') {
  return `
    WITH checklist_stats AS (
      SELECT user_id,
             COUNT(*)::int AS total_items,
             COUNT(*) FILTER (WHERE status='done')::int AS done_items
      FROM employee_lifecycle_checklist
      WHERE stage='onboarding'
      GROUP BY user_id
    ),
    next_action AS (
      SELECT DISTINCT ON (user_id) user_id, title AS next_action_title, due_date AS next_action_due
      FROM employee_lifecycle_checklist
      WHERE stage='onboarding' AND status <> 'done'
      ORDER BY user_id, sort_order ASC
    ),
    base AS (
      SELECT
        u.id, u.employee_code, u.name, u.email, u.phone,
        ep.department_id, dep.name AS department_name,
        ep.designation_id, des.name AS designation_name,
        ep.reporting_manager_id, mgr.name AS reporting_manager_name,
        ep.date_of_joining, ep.probation_end_date, ep.date_of_confirmation,
        ep.employment_status, ep.employee_category, ep.profile_photo_url,
        ep.onboarding_started_at, ep.onboarding_completed_at,
        COALESCE(cs.total_items, 0) AS total_items,
        COALESCE(cs.done_items, 0) AS done_items,
        CASE WHEN COALESCE(cs.total_items, 0) = 0 THEN 0
             ELSE ROUND(cs.done_items * 100.0 / cs.total_items)::int END AS progress_pct,
        CASE
          WHEN COALESCE(cs.total_items, 0) = 0 THEN 'not_started'
          WHEN cs.done_items >= cs.total_items THEN 'completed'
          WHEN cs.done_items = 0 THEN 'not_started'
          ELSE 'in_progress'
        END AS onboarding_status,
        na.next_action_title, na.next_action_due
      FROM users u
      JOIN employee_profiles ep ON ep.user_id = u.id
      LEFT JOIN hr_departments dep ON dep.id = ep.department_id
      LEFT JOIN hr_designations des ON des.id = ep.designation_id
      LEFT JOIN users mgr ON mgr.id = ep.reporting_manager_id
      LEFT JOIN checklist_stats cs ON cs.user_id = u.id
      LEFT JOIN next_action na ON na.user_id = u.id
      WHERE u.company_id = $1
        AND u.email != ALL($2::text[])
        AND COALESCE(ep.employment_status, 'active') = 'active'
        AND (
          ep.date_of_joining >= CURRENT_DATE - INTERVAL '${ONBOARDING_WINDOW_DAYS} days'
          OR ep.onboarding_completed_at IS NULL
        )
        ${extraWhere}
    )
  `;
}

async function seedMissingChecklists(companyId) {
  // Safety net for employees created via a path other than POST
  // /hr-admin/employees (e.g. bulk import), who never got eager-seeded.
  const { rows } = await query(
    `SELECT u.id FROM users u
     JOIN employee_profiles ep ON ep.user_id = u.id
     WHERE u.company_id = $1 AND COALESCE(ep.employment_status,'active')='active'
       AND NOT EXISTS (SELECT 1 FROM employee_lifecycle_checklist lc WHERE lc.user_id = u.id AND lc.stage='onboarding')`,
    [companyId]
  );
  for (const r of rows) {
    await ensureLifecycleChecklist(companyId, r.id, query);
  }
}

// ═══════════════════════════════════════════════════════════
// GET /summary
// ═══════════════════════════════════════════════════════════
router.get('/summary', async (req, res) => {
  try {
    const companyId = req.user.company_id;
    await seedMissingChecklists(companyId);
    await reconcileDerived(companyId);

    const { rows: population } = await query(
      `${basePopulationSQL()} SELECT * FROM base`,
      [companyId, SYSTEM_ACCOUNT_EMAILS]
    );

    const total = population.length;
    const completed = population.filter(p => p.onboarding_status === 'completed').length;
    const inProgress = population.filter(p => p.onboarding_status === 'in_progress').length;
    const notStarted = population.filter(p => p.onboarding_status === 'not_started').length;
    const overallProgress = total ? Math.round(population.reduce((s, p) => s + p.progress_pct, 0) / total) : 0;

    const newJoiners30 = population.filter(p => p.date_of_joining && (Date.now() - new Date(p.date_of_joining).getTime()) <= 30 * 86400000).length;

    const overdueTasks = await query(
      `SELECT COUNT(*)::int AS cnt FROM employee_lifecycle_checklist lc
       JOIN employee_profiles ep ON ep.user_id = lc.user_id
       WHERE lc.company_id = $1 AND lc.stage='onboarding' AND lc.status <> 'done'
         AND lc.due_date IS NOT NULL AND lc.due_date < CURRENT_DATE`,
      [companyId]
    );

    const probationDue = population.filter(p => p.probation_end_date && !p.date_of_confirmation
      && new Date(p.probation_end_date) <= new Date(Date.now() + 30 * 86400000)).length;

    // ── KPI groups ──
    const userIds = population.map(p => p.id);
    const idsParam = userIds.length ? userIds : ['00000000-0000-0000-0000-000000000000'];

    // Documents
    const docStats = await query(
      `SELECT
         COUNT(*) FILTER (WHERE d.verification_status='pending')::int AS pending_verification,
         COUNT(*) FILTER (WHERE d.verification_status='verified')::int AS verified,
         COUNT(*) FILTER (WHERE d.verification_status='rejected')::int AS rejected
       FROM employee_documents d WHERE d.user_id = ANY($1::uuid[])`,
      [idsParam]
    );
    const missingDocsRes = await query(
      `SELECT u.id FROM users u WHERE u.id = ANY($1::uuid[])
         AND (SELECT COUNT(DISTINCT doc_type) FROM employee_documents d WHERE d.user_id = u.id AND d.doc_type = ANY($2::text[])) < $3`,
      [idsParam, REQUIRED_DOC_TYPES, REQUIRED_DOC_TYPES.length]
    );

    // IT / assets
    const assetStats = await query(
      `SELECT
         COUNT(DISTINCT u.id) FILTER (WHERE EXISTS (SELECT 1 FROM hr_employee_assets a WHERE a.employee_id=u.id AND a.category='laptop' AND a.status='assigned'))::int AS laptop_assigned,
         COUNT(DISTINCT u.id) FILTER (WHERE NOT EXISTS (SELECT 1 FROM hr_employee_assets a WHERE a.employee_id=u.id AND a.category='laptop' AND a.status='assigned'))::int AS laptop_pending,
         COUNT(DISTINCT u.id) FILTER (WHERE EXISTS (SELECT 1 FROM hr_employee_assets a WHERE a.employee_id=u.id AND a.category='mobile' AND a.status='assigned'))::int AS mobile_assigned,
         COUNT(DISTINCT u.id) FILTER (WHERE EXISTS (SELECT 1 FROM hr_employee_assets a WHERE a.employee_id=u.id AND a.category='access_card' AND a.status='assigned'))::int AS access_card_assigned
       FROM (SELECT unnest($1::uuid[]) AS id) u`,
      [idsParam]
    );
    const emailStats = await query(
      `SELECT
         COUNT(*) FILTER (WHERE item_key='email_setup' AND status='done')::int AS email_done,
         COUNT(*) FILTER (WHERE item_key='email_setup' AND status<>'done')::int AS email_pending,
         COUNT(*) FILTER (WHERE item_key='erp_login' AND status='done')::int AS erp_done,
         COUNT(*) FILTER (WHERE item_key='erp_login' AND status<>'done')::int AS erp_pending,
         COUNT(*) FILTER (WHERE item_key='access_permissions' AND status='done')::int AS access_done,
         COUNT(*) FILTER (WHERE item_key='access_permissions' AND status<>'done')::int AS access_pending,
         COUNT(*) FILTER (WHERE item_key='id_card' AND status='done')::int AS id_card_done,
         COUNT(*) FILTER (WHERE item_key='id_card' AND status<>'done')::int AS id_card_pending
       FROM employee_lifecycle_checklist WHERE user_id = ANY($1::uuid[]) AND stage='onboarding'`,
      [idsParam]
    );

    // Training
    const ts = await resolveTrainingSchema();
    let trainingStats = { assigned: 0, completed: 0, certificates: null };
    if (ts.available) {
      const r = await query(
        `SELECT
           COUNT(DISTINCT ${ts.empCol})::int AS assigned,
           COUNT(DISTINCT ${ts.empCol}) FILTER (WHERE ${ts.completedExpr})::int AS completed
           ${ts.certExpr ? `, COUNT(*) FILTER (WHERE ${ts.certExpr})::int AS certificates` : ''}
         FROM ${ts.table} WHERE ${ts.empCol} = ANY($1::uuid[])`,
        [idsParam]
      );
      trainingStats = {
        assigned: r.rows[0]?.assigned || 0,
        completed: r.rows[0]?.completed || 0,
        certificates: ts.certExpr ? (r.rows[0]?.certificates || 0) : null,
      };
    }

    // Probation
    const probRows = population.filter(p => p.probation_end_date);
    const probOverdue = probRows.filter(p => !p.date_of_confirmation && new Date(p.probation_end_date) < new Date(Date.now() - 7 * 86400000)).length;
    const probDueSoon = probRows.filter(p => !p.date_of_confirmation && new Date(p.probation_end_date) >= new Date(Date.now() - 7 * 86400000) && new Date(p.probation_end_date) <= new Date(Date.now() + 30 * 86400000)).length;
    const probConfirmed = probRows.filter(p => p.date_of_confirmation).length;

    // ── Alerts (computed live from current counts, not the notifications table) ──
    const alerts = [];
    if (overdueTasks.rows[0].cnt > 0) alerts.push({ severity: 'critical', message: `${overdueTasks.rows[0].cnt} onboarding task(s) overdue`, link: '/hr-admin/onboarding/tasks' });
    if (missingDocsRes.rows.length > 0) alerts.push({ severity: 'warning', message: `${missingDocsRes.rows.length} employee(s) missing required documents`, link: '/hr-admin/onboarding' });
    if (probOverdue > 0) alerts.push({ severity: 'critical', message: `${probOverdue} probation review(s) overdue`, link: '/hr-admin/onboarding' });
    if (emailStats.rows[0].email_pending > 0) alerts.push({ severity: 'warning', message: `${emailStats.rows[0].email_pending} employee(s) awaiting email setup`, link: '/hr-admin/onboarding' });

    res.json({
      data: {
        metrics: {
          total_in_onboarding: total,
          completed,
          in_progress: inProgress,
          not_started: notStarted,
          new_joiners_30d: newJoiners30,
          overdue_tasks: overdueTasks.rows[0].cnt,
          probation_due_30d: probationDue,
        },
        overall_progress_pct: overallProgress,
        kpis: {
          employee_status: { total, completed, in_progress: inProgress, not_started: notStarted },
          documents: {
            pending_verification: docStats.rows[0].pending_verification,
            verified: docStats.rows[0].verified,
            rejected: docStats.rows[0].rejected,
            missing_required: missingDocsRes.rows.length,
          },
          it: {
            laptop_assigned: assetStats.rows[0].laptop_assigned,
            laptop_pending: assetStats.rows[0].laptop_pending,
            mobile_assigned: assetStats.rows[0].mobile_assigned,
            access_card_assigned: assetStats.rows[0].access_card_assigned,
            email_pending: emailStats.rows[0].email_pending,
            erp_login_pending: emailStats.rows[0].erp_pending,
            access_permissions_pending: emailStats.rows[0].access_pending,
            id_card_pending: emailStats.rows[0].id_card_pending,
          },
          training: {
            assigned: trainingStats.assigned,
            completed: trainingStats.completed,
            certificates_issued: trainingStats.certificates,
          },
          probation: {
            overdue: probOverdue,
            due_soon: probDueSoon,
            confirmed: probConfirmed,
          },
        },
        alerts,
      },
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════
// GET /employees — Recent Joiners / filtered list
// ═══════════════════════════════════════════════════════════
router.get('/employees', async (req, res) => {
  try {
    const companyId = req.user.company_id;
    const { search, department_id, status, from_date, to_date, limit, offset } = req.query;
    let extraWhere = '';
    const params = [companyId, SYSTEM_ACCOUNT_EMAILS];
    let idx = 3;

    if (search) { extraWhere += ` AND (u.name ILIKE $${idx} OR u.employee_code ILIKE $${idx})`; params.push(`%${search}%`); idx++; }
    if (department_id) { extraWhere += ` AND ep.department_id = $${idx}`; params.push(department_id); idx++; }
    if (from_date) { extraWhere += ` AND ep.date_of_joining >= $${idx}`; params.push(from_date); idx++; }
    if (to_date) { extraWhere += ` AND ep.date_of_joining <= $${idx}`; params.push(to_date); idx++; }

    let sql = `${basePopulationSQL(extraWhere)} SELECT * FROM base`;
    if (status) {
      sql += ` WHERE onboarding_status = $${idx}`;
      params.push(status); idx++;
    }
    sql += ` ORDER BY date_of_joining DESC NULLS LAST`;
    const lim = Math.min(parseInt(limit) || 50, 200);
    const off = parseInt(offset) || 0;
    sql += ` LIMIT ${lim} OFFSET ${off}`;

    const { rows } = await query(sql, params);
    res.json({ data: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════
// GET /employees/:id/tracker
// ═══════════════════════════════════════════════════════════
router.get('/employees/:id/tracker', async (req, res) => {
  try {
    const companyId = req.user.company_id;
    const userId = req.params.id;
    await ensureLifecycleChecklist(companyId, userId, query);
    await reconcileDerived(companyId, [userId]);

    const { rows } = await query(
      `${basePopulationSQL('AND u.id = $3')} SELECT * FROM base`,
      [companyId, SYSTEM_ACCOUNT_EMAILS, userId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Employee not found or not in onboarding population' });

    const checklist = await query(
      `SELECT lc.*, u.name as completed_by_name, au.name as assigned_to_name
       FROM employee_lifecycle_checklist lc
       LEFT JOIN users u ON u.id = lc.completed_by
       LEFT JOIN users au ON au.id = lc.assigned_to
       WHERE lc.user_id = $1 AND lc.company_id = $2 AND lc.stage = 'onboarding'
       ORDER BY lc.sort_order ASC`,
      [userId, companyId]
    );
    const documents = await query(
      `SELECT d.*, u.name as verified_by_name FROM employee_documents d
       LEFT JOIN users u ON u.id = d.verified_by
       WHERE d.user_id = $1 ORDER BY d.uploaded_at DESC`,
      [userId]
    );
    const assets = await query(
      `SELECT * FROM hr_employee_assets WHERE employee_id = $1 ORDER BY created_at DESC`,
      [userId]
    );
    const ts = await resolveTrainingSchema();
    let training = [];
    if (ts.available) {
      const r = await query(
        `SELECT t.*, p.title as program_title FROM ${ts.table} t
         JOIN hr_training_programs p ON p.id = t.program_id
         WHERE t.${ts.empCol} = $1 ORDER BY t.created_at DESC`,
        [userId]
      );
      training = r.rows;
    }
    const timeline = await query(
      `SELECT t.*, u.name as created_by_name FROM employee_timeline t
       LEFT JOIN users u ON u.id = t.created_by
       WHERE t.user_id = $1 ORDER BY t.event_date DESC, t.created_at DESC LIMIT 50`,
      [userId]
    );

    // Group checklist by stage_group for the 8-node stepper
    const stages = {};
    for (const item of checklist.rows) {
      const g = item.stage_group || 'other';
      if (!stages[g]) stages[g] = [];
      stages[g].push(item);
    }

    res.json({
      data: {
        ...rows[0],
        checklist: checklist.rows,
        stages,
        documents: documents.rows,
        assets: assets.rows,
        training,
        timeline: timeline.rows,
      },
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════
// GET /tasks — pending items grouped by item_key
// ═══════════════════════════════════════════════════════════
router.get('/tasks', async (req, res) => {
  try {
    const companyId = req.user.company_id;
    const { rows } = await query(
      `SELECT lc.item_key, lc.title, lc.stage_group, lc.owner_department,
              COUNT(*)::int AS pending_count,
              COUNT(*) FILTER (WHERE lc.due_date IS NOT NULL AND lc.due_date < CURRENT_DATE)::int AS overdue_count
       FROM employee_lifecycle_checklist lc
       JOIN employee_profiles ep ON ep.user_id = lc.user_id
       JOIN users u ON u.id = lc.user_id
       WHERE lc.company_id = $1 AND lc.stage = 'onboarding' AND lc.status <> 'done'
         AND COALESCE(ep.employment_status,'active') = 'active'
         AND u.email != ALL($2::text[])
       GROUP BY lc.item_key, lc.title, lc.stage_group, lc.owner_department
       ORDER BY overdue_count DESC, pending_count DESC`,
      [companyId, SYSTEM_ACCOUNT_EMAILS]
    );
    res.json({ data: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════
// GET /tasks/:item_key/employees — drill-down
// ═══════════════════════════════════════════════════════════
router.get('/tasks/:item_key/employees', async (req, res) => {
  try {
    const companyId = req.user.company_id;
    const { rows } = await query(
      `SELECT u.id, u.name, u.employee_code, u.email, dep.name as department_name,
              lc.due_date, lc.status, lc.owner_department, lc.remarks
       FROM employee_lifecycle_checklist lc
       JOIN users u ON u.id = lc.user_id
       LEFT JOIN employee_profiles ep ON ep.user_id = u.id
       LEFT JOIN hr_departments dep ON dep.id = ep.department_id
       WHERE lc.company_id = $1 AND lc.stage = 'onboarding' AND lc.status <> 'done'
         AND lc.item_key = $2
         AND COALESCE(ep.employment_status,'active') = 'active'
         AND u.email != ALL($3::text[])
       ORDER BY lc.due_date ASC NULLS LAST, u.name`,
      [companyId, req.params.item_key, SYSTEM_ACCOUNT_EMAILS]
    );
    res.json({ data: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════
// GET /probation/upcoming
// ═══════════════════════════════════════════════════════════
router.get('/probation/upcoming', async (req, res) => {
  try {
    const companyId = req.user.company_id;
    const days = Math.min(parseInt(req.query.days) || 60, 365);
    const { rows } = await query(
      `SELECT u.id, u.name, u.employee_code, u.email, ep.probation_end_date,
              ep.date_of_confirmation,
              (ep.probation_end_date - CURRENT_DATE)::int AS days_left,
              dep.name as department_name, des.name as designation_name
       FROM users u
       JOIN employee_profiles ep ON ep.user_id = u.id
       LEFT JOIN hr_departments dep ON dep.id = ep.department_id
       LEFT JOIN hr_designations des ON des.id = ep.designation_id
       WHERE u.company_id = $1
         AND COALESCE(ep.employment_status,'active') = 'active'
         AND u.email != ALL($2::text[])
         AND ep.probation_end_date IS NOT NULL
         AND ep.date_of_confirmation IS NULL
         AND ep.probation_end_date BETWEEN CURRENT_DATE AND CURRENT_DATE + $3::int
       ORDER BY ep.probation_end_date ASC`,
      [companyId, SYSTEM_ACCOUNT_EMAILS, days]
    );
    res.json({ data: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════
// CHARTS
// ═══════════════════════════════════════════════════════════
router.get('/charts/joining-trend', async (req, res) => {
  try {
    const companyId = req.user.company_id;
    const months = Math.min(parseInt(req.query.months) || 6, 24);
    const { rows } = await query(
      `SELECT to_char(date_trunc('month', ep.date_of_joining), 'Mon YYYY') AS month,
              date_trunc('month', ep.date_of_joining) AS month_sort,
              COUNT(*)::int AS joiners
       FROM employee_profiles ep
       JOIN users u ON u.id = ep.user_id
       WHERE ep.company_id = $1 AND u.email != ALL($2::text[])
         AND ep.date_of_joining >= date_trunc('month', CURRENT_DATE) - INTERVAL '${months - 1} months'
       GROUP BY 1, 2 ORDER BY 2`,
      [companyId, SYSTEM_ACCOUNT_EMAILS]
    );
    res.json({ data: rows.map(r => ({ month: r.month, joiners: r.joiners })) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/charts/onboarding-completion', async (req, res) => {
  try {
    const companyId = req.user.company_id;
    const { rows } = await query(
      `${basePopulationSQL()} SELECT onboarding_status, COUNT(*)::int as cnt FROM base GROUP BY onboarding_status`,
      [companyId, SYSTEM_ACCOUNT_EMAILS]
    );
    res.json({ data: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/charts/training-progress', async (req, res) => {
  try {
    const companyId = req.user.company_id;
    const ts = await resolveTrainingSchema();
    if (!ts.available) return res.json({ data: [], available: false });
    const { rows } = await query(
      `${basePopulationSQL()} , t AS (
         SELECT b.id,
                EXISTS (SELECT 1 FROM ${ts.table} tt WHERE tt.${ts.empCol}=b.id) as assigned,
                EXISTS (SELECT 1 FROM ${ts.table} tt WHERE tt.${ts.empCol}=b.id AND ${ts.completedExpr}) as completed
         FROM base b
       )
       SELECT
         COUNT(*) FILTER (WHERE NOT assigned)::int AS not_assigned,
         COUNT(*) FILTER (WHERE assigned AND NOT completed)::int AS in_progress,
         COUNT(*) FILTER (WHERE completed)::int AS completed
       FROM t`,
      [companyId, SYSTEM_ACCOUNT_EMAILS]
    );
    res.json({ data: rows[0], available: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/charts/probation-status', async (req, res) => {
  try {
    const companyId = req.user.company_id;
    const { rows } = await query(
      `${basePopulationSQL()} SELECT
         COUNT(*) FILTER (WHERE probation_end_date IS NOT NULL AND date_of_confirmation IS NULL AND probation_end_date < CURRENT_DATE - 7)::int AS overdue,
         COUNT(*) FILTER (WHERE probation_end_date IS NOT NULL AND date_of_confirmation IS NULL AND probation_end_date >= CURRENT_DATE - 7 AND probation_end_date <= CURRENT_DATE + 30)::int AS due_soon,
         COUNT(*) FILTER (WHERE probation_end_date IS NOT NULL AND date_of_confirmation IS NULL AND probation_end_date > CURRENT_DATE + 30)::int AS upcoming,
         COUNT(*) FILTER (WHERE date_of_confirmation IS NOT NULL)::int AS confirmed
       FROM base`,
      [companyId, SYSTEM_ACCOUNT_EMAILS]
    );
    res.json({ data: rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════
// GET /reports/:key
// ═══════════════════════════════════════════════════════════
const REPORTS = {
  new_joiners: {
    label: 'New Joiners',
    sql: () => `${basePopulationSQL()} SELECT employee_code, name, email, department_name, designation_name, date_of_joining, progress_pct, onboarding_status FROM base ORDER BY date_of_joining DESC`,
  },
  pending_onboarding: {
    label: 'Pending Onboarding',
    sql: () => `${basePopulationSQL()} SELECT employee_code, name, email, department_name, progress_pct, onboarding_status, next_action_title FROM base WHERE onboarding_status <> 'completed' ORDER BY progress_pct ASC`,
  },
  missing_documents: {
    label: 'Missing Documents',
    sql: () => `${basePopulationSQL()} SELECT b.employee_code, b.name, b.email, b.department_name,
      (SELECT string_agg(DISTINCT dt, ', ') FROM unnest(ARRAY['${REQUIRED_DOC_TYPES.join("','")}']) dt
        WHERE dt NOT IN (SELECT doc_type FROM employee_documents d WHERE d.user_id = b.id)) AS missing_doc_types
      FROM base b
      WHERE (SELECT COUNT(DISTINCT doc_type) FROM employee_documents d WHERE d.user_id = b.id AND d.doc_type = ANY(ARRAY['${REQUIRED_DOC_TYPES.join("','")}'])) < ${REQUIRED_DOC_TYPES.length}`,
  },
  asset_allocation: {
    label: 'Asset Allocation',
    sql: () => `${basePopulationSQL()} SELECT b.employee_code, b.name, b.department_name,
      (SELECT string_agg(a.asset_name || ' (' || a.category || ')', ', ') FROM hr_employee_assets a WHERE a.employee_id = b.id AND a.status='assigned') AS assets
      FROM base b`,
  },
  probation: {
    label: 'Probation Status',
    sql: () => `${basePopulationSQL()} SELECT employee_code, name, department_name, probation_end_date, date_of_confirmation FROM base WHERE probation_end_date IS NOT NULL ORDER BY probation_end_date ASC`,
  },
  confirmation: {
    label: 'Confirmation Status',
    sql: () => `${basePopulationSQL()} SELECT employee_code, name, department_name, date_of_joining, date_of_confirmation FROM base WHERE date_of_confirmation IS NOT NULL ORDER BY date_of_confirmation DESC`,
  },
};
REPORTS.training_completion = {
  label: 'Training Completion',
  sql: async () => {
    const ts = await resolveTrainingSchema();
    if (!ts.available) return null;
    return `${basePopulationSQL()} SELECT b.employee_code, b.name, b.department_name,
      EXISTS (SELECT 1 FROM ${ts.table} t WHERE t.${ts.empCol}=b.id) as assigned,
      EXISTS (SELECT 1 FROM ${ts.table} t WHERE t.${ts.empCol}=b.id AND ${ts.completedExpr}) as completed
      FROM base b`;
  },
};

router.get('/reports/:key', async (req, res) => {
  try {
    const report = REPORTS[req.params.key];
    if (!report) return res.status(404).json({ error: 'Unknown report' });
    const companyId = req.user.company_id;
    const sqlOrFn = typeof report.sql === 'function' && report.sql.constructor.name === 'AsyncFunction'
      ? await report.sql()
      : report.sql();
    if (!sqlOrFn) return res.json({ data: [], label: report.label, available: false });
    const { rows } = await query(sqlOrFn, [companyId, SYSTEM_ACCOUNT_EMAILS]);
    res.json({ data: rows, label: report.label, available: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
