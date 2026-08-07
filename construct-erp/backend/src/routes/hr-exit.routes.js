// src/routes/hr-exit.routes.js — Exit Management pipeline
// Resignation -> Notice Period -> Clearance (dept sign-off) -> Asset Return
// (reuses existing hr_employee_assets return tracking) -> Exit Interview ->
// hands off to the existing Full & Final Settlement flow (hr-fnf.routes.js,
// already comprehensive — gratuity calc, journal posting, accounts notify —
// not duplicated here).
const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const { query } = require('../config/database');
const { runSchemaInit } = require('../utils/schemaInit');

const HR_ROLES = ['super_admin', 'admin', 'hr_admin', 'hr_manager'];
const HR_ALL = [...HR_ROLES, 'hr', 'manager'];

router.use(authenticate);

const CLEARANCE_DEPTS = ['IT', 'Admin', 'Finance', 'HR', 'Stores', 'Project'];

runSchemaInit('hr-exit-management-v1', async () => {
  await query(`
    CREATE TABLE IF NOT EXISTS hr_exit_requests (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id UUID NOT NULL,
      employee_id UUID NOT NULL REFERENCES users(id),
      exit_reason VARCHAR(50) DEFAULT 'resignation'
        CHECK (exit_reason IN ('resignation','termination','retirement','absconding','end_of_contract','death')),
      resignation_date DATE NOT NULL,
      reason_details TEXT,
      notice_period_days INT DEFAULT 30,
      proposed_last_working_day DATE,
      confirmed_last_working_day DATE,
      status VARCHAR(30) DEFAULT 'submitted' CHECK (status IN (
        'submitted','manager_approved','notice_period','clearance_pending',
        'clearance_done','fnf_linked','exited','withdrawn','rejected'
      )),
      approved_by UUID REFERENCES users(id),
      approved_at TIMESTAMPTZ,
      rejection_reason TEXT,
      fnf_id UUID REFERENCES hr_fnf_settlements(id),
      created_by UUID REFERENCES users(id),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS hr_exit_clearance (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      exit_request_id UUID NOT NULL REFERENCES hr_exit_requests(id) ON DELETE CASCADE,
      department VARCHAR(30) NOT NULL,
      status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending','cleared','issues')),
      cleared_by UUID REFERENCES users(id),
      cleared_at TIMESTAMPTZ,
      remarks TEXT,
      UNIQUE(exit_request_id, department)
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS hr_exit_interviews (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      exit_request_id UUID NOT NULL REFERENCES hr_exit_requests(id) ON DELETE CASCADE UNIQUE,
      conducted_by UUID REFERENCES users(id),
      interview_date DATE,
      primary_reason TEXT,
      satisfaction_rating INT CHECK (satisfaction_rating BETWEEN 1 AND 5),
      would_recommend BOOLEAN,
      feedback TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
});

async function getScoped(req, id) {
  const { rows } = await query(`SELECT * FROM hr_exit_requests WHERE id=$1 AND company_id=$2`, [id, req.user.company_id]);
  if (!rows.length) { const e = new Error('Exit request not found'); e.statusCode = 404; throw e; }
  return rows[0];
}

// Progress % across the pipeline's real stages — computed, not stored, so it
// can't silently drift the way a stored value would as new stages get added.
function exitProgress(status) {
  const order = ['submitted', 'manager_approved', 'notice_period', 'clearance_pending', 'clearance_done', 'fnf_linked', 'exited'];
  const idx = order.indexOf(status);
  if (status === 'withdrawn' || status === 'rejected') return 0;
  return idx < 0 ? 0 : Math.round((idx / (order.length - 1)) * 100);
}

router.get('/', authorize(...HR_ALL), async (req, res) => {
  try {
    const { status } = req.query;
    const conds = ['e.company_id=$1']; const params = [req.user.company_id]; let i = 2;
    if (status) { conds.push(`e.status=$${i++}`); params.push(status); }
    const { rows } = await query(`
      SELECT e.*, u.name AS employee_name, u.employee_code, ep.department_id, dep.name AS department_name,
             des.name AS designation_name,
             (SELECT COUNT(*) FROM hr_exit_clearance c WHERE c.exit_request_id=e.id AND c.status='cleared')::int AS clearance_done_count,
             (SELECT COUNT(*) FROM hr_exit_clearance c WHERE c.exit_request_id=e.id)::int AS clearance_total_count,
             (SELECT COUNT(*) FROM hr_employee_assets a WHERE a.user_id=e.employee_id AND a.status='assigned')::int AS assets_pending_return
      FROM hr_exit_requests e
      JOIN users u ON u.id = e.employee_id
      LEFT JOIN employee_profiles ep ON ep.user_id = u.id
      LEFT JOIN hr_departments dep ON dep.id = ep.department_id
      LEFT JOIN hr_designations des ON des.id = ep.designation_id
      WHERE ${conds.join(' AND ')} ORDER BY e.created_at DESC
    `, params);
    res.json({ data: rows.map(r => ({ ...r, progress_pct: exitProgress(r.status) })) });
  } catch (err) { res.status(err.statusCode || 500).json({ error: err.message }); }
});

router.get('/:id', authorize(...HR_ALL), async (req, res) => {
  try {
    const e = await getScoped(req, req.params.id);
    const clearance = await query(`SELECT c.*, u.name AS cleared_by_name FROM hr_exit_clearance c LEFT JOIN users u ON u.id=c.cleared_by WHERE c.exit_request_id=$1 ORDER BY c.department`, [req.params.id]);
    const interview = await query(`SELECT i.*, u.name AS conducted_by_name FROM hr_exit_interviews i LEFT JOIN users u ON u.id=i.conducted_by WHERE i.exit_request_id=$1`, [req.params.id]);
    const assets = await query(`SELECT id, asset_name, asset_code, status FROM hr_employee_assets WHERE user_id=$1 AND status != 'returned'`, [e.employee_id]);
    res.json({ data: { ...e, progress_pct: exitProgress(e.status), clearance: clearance.rows, interview: interview.rows[0] || null, pending_assets: assets.rows } });
  } catch (err) { res.status(err.statusCode || 500).json({ error: err.message }); }
});

router.post('/', authorize(...HR_ALL), async (req, res) => {
  try {
    const d = req.body;
    if (!d.employee_id || !d.resignation_date) return res.status(400).json({ error: 'Employee and resignation date are required' });
    const npd = d.notice_period_days ?? 30;
    const proposedLwd = d.proposed_last_working_day || new Date(new Date(d.resignation_date).getTime() + npd * 86400000).toISOString().slice(0, 10);
    const { rows } = await query(`
      INSERT INTO hr_exit_requests (company_id, employee_id, exit_reason, resignation_date, reason_details, notice_period_days, proposed_last_working_day, created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *
    `, [req.user.company_id, d.employee_id, d.exit_reason || 'resignation', d.resignation_date, d.reason_details || null, npd, proposedLwd, req.user.id]);
    res.status(201).json({ data: rows[0] });
  } catch (err) { res.status(err.statusCode || 500).json({ error: err.message }); }
});

router.patch('/:id/manager-approval', authorize(...HR_ALL), async (req, res) => {
  try {
    const { action, confirmed_last_working_day, rejection_reason } = req.body;
    if (!['approve', 'reject'].includes(action)) return res.status(400).json({ error: 'Invalid action' });
    if (action === 'reject') {
      const { rows } = await query(`UPDATE hr_exit_requests SET status='rejected', rejection_reason=$1, updated_at=NOW() WHERE id=$2 AND company_id=$3 AND status='submitted' RETURNING *`, [rejection_reason || null, req.params.id, req.user.company_id]);
      if (!rows.length) return res.status(404).json({ error: 'Not found or not pending' });
      return res.json({ data: rows[0] });
    }
    const { rows } = await query(`
      UPDATE hr_exit_requests SET status='notice_period', approved_by=$1, approved_at=NOW(),
        confirmed_last_working_day=COALESCE($2, proposed_last_working_day), updated_at=NOW()
      WHERE id=$3 AND company_id=$4 AND status='submitted' RETURNING *
    `, [req.user.id, confirmed_last_working_day || null, req.params.id, req.user.company_id]);
    if (!rows.length) return res.status(404).json({ error: 'Not found or not pending' });

    // Auto-open clearance rows for every department once notice period starts.
    for (const dept of CLEARANCE_DEPTS) {
      await query(`INSERT INTO hr_exit_clearance (exit_request_id, department) VALUES ($1,$2) ON CONFLICT (exit_request_id, department) DO NOTHING`, [req.params.id, dept]);
    }
    res.json({ data: rows[0] });
  } catch (err) { res.status(err.statusCode || 500).json({ error: err.message }); }
});

router.post('/:id/start-clearance', authorize(...HR_ROLES), async (req, res) => {
  try {
    await getScoped(req, req.params.id);
    await query(`UPDATE hr_exit_requests SET status='clearance_pending', updated_at=NOW() WHERE id=$1 AND status='notice_period'`, [req.params.id]);
    for (const dept of CLEARANCE_DEPTS) {
      await query(`INSERT INTO hr_exit_clearance (exit_request_id, department) VALUES ($1,$2) ON CONFLICT (exit_request_id, department) DO NOTHING`, [req.params.id, dept]);
    }
    res.json({ message: 'Clearance started' });
  } catch (err) { res.status(err.statusCode || 500).json({ error: err.message }); }
});

router.patch('/:id/clearance/:department', authorize(...HR_ALL), async (req, res) => {
  try {
    const { status, remarks } = req.body;
    if (!['cleared', 'issues'].includes(status)) return res.status(400).json({ error: 'Invalid status' });
    const { rows } = await query(`
      UPDATE hr_exit_clearance SET status=$1, cleared_by=$2, cleared_at=NOW(), remarks=$3
      WHERE exit_request_id=$4 AND department=$5 RETURNING *
    `, [status, req.user.id, remarks || null, req.params.id, req.params.department]);
    if (!rows.length) return res.status(404).json({ error: 'Clearance row not found' });

    // All departments cleared -> advance the pipeline automatically.
    const remaining = await query(`SELECT COUNT(*)::int AS cnt FROM hr_exit_clearance WHERE exit_request_id=$1 AND status != 'cleared'`, [req.params.id]);
    if (remaining.rows[0].cnt === 0) {
      await query(`UPDATE hr_exit_requests SET status='clearance_done', updated_at=NOW() WHERE id=$1 AND company_id=$2`, [req.params.id, req.user.company_id]);
    }
    res.json({ data: rows[0] });
  } catch (err) { res.status(err.statusCode || 500).json({ error: err.message }); }
});

router.post('/:id/interview', authorize(...HR_ALL), async (req, res) => {
  try {
    await getScoped(req, req.params.id);
    const { interview_date, primary_reason, satisfaction_rating, would_recommend, feedback } = req.body;
    const { rows } = await query(`
      INSERT INTO hr_exit_interviews (exit_request_id, conducted_by, interview_date, primary_reason, satisfaction_rating, would_recommend, feedback)
      VALUES ($1,$2,$3,$4,$5,$6,$7)
      ON CONFLICT (exit_request_id) DO UPDATE SET
        conducted_by=$2, interview_date=$3, primary_reason=$4, satisfaction_rating=$5, would_recommend=$6, feedback=$7
      RETURNING *
    `, [req.params.id, req.user.id, interview_date || null, primary_reason || null, satisfaction_rating || null, would_recommend ?? null, feedback || null]);
    res.status(201).json({ data: rows[0] });
  } catch (err) { res.status(err.statusCode || 500).json({ error: err.message }); }
});

// Links (does not duplicate) the existing FnF flow — creates a draft
// hr_fnf_settlements row via the same table hr-fnf.routes.js already owns,
// and points this exit request at it.
router.post('/:id/link-fnf', authorize(...HR_ROLES), async (req, res) => {
  try {
    const e = await getScoped(req, req.params.id);
    if (e.status !== 'clearance_done') return res.status(400).json({ error: 'Clearance must be complete before starting Full & Final settlement' });
    if (e.fnf_id) return res.status(400).json({ error: 'Already linked to an FnF settlement' });

    const { rows } = await query(`
      INSERT INTO hr_fnf_settlements (company_id, employee_id, last_working_day, exit_reason, notice_period_days, created_by)
      VALUES ($1,$2,$3,$4,$5,$6) RETURNING id
    `, [req.user.company_id, e.employee_id, e.confirmed_last_working_day || e.proposed_last_working_day, e.exit_reason, e.notice_period_days, req.user.id]);

    const updated = await query(`UPDATE hr_exit_requests SET status='fnf_linked', fnf_id=$1, updated_at=NOW() WHERE id=$2 RETURNING *`, [rows[0].id, req.params.id]);
    res.status(201).json({ data: updated.rows[0], fnf_id: rows[0].id });
  } catch (err) { res.status(err.statusCode || 500).json({ error: err.message }); }
});

// Final step — call once the linked FnF settlement is actually paid
// (checked live, not trusted from the client) and the employee record itself
// should be deactivated. Mirrors the existing deactivate flow in
// hr-employees.routes.js (employment_status='terminated', is_active=false)
// rather than duplicating that logic.
router.post('/:id/complete', authorize(...HR_ROLES), async (req, res) => {
  try {
    const e = await getScoped(req, req.params.id);
    if (!e.fnf_id) return res.status(400).json({ error: 'No linked FnF settlement' });
    const fnf = await query(`SELECT status FROM hr_fnf_settlements WHERE id=$1`, [e.fnf_id]);
    if (fnf.rows[0]?.status !== 'paid') return res.status(400).json({ error: 'Linked FnF settlement has not been paid yet' });

    await query(`UPDATE hr_exit_requests SET status='exited', updated_at=NOW() WHERE id=$1`, [req.params.id]);
    await query(`
      UPDATE employee_profiles SET employment_status='resigned', date_of_leaving=$1
      WHERE user_id=$2 AND company_id=$3
    `, [e.confirmed_last_working_day || e.proposed_last_working_day, e.employee_id, req.user.company_id]);
    await query(`UPDATE users SET is_active=FALSE WHERE id=$1 AND company_id=$2`, [e.employee_id, req.user.company_id]);

    res.json({ message: 'Exit completed — employee record deactivated' });
  } catch (err) { res.status(err.statusCode || 500).json({ error: err.message }); }
});

router.patch('/:id/withdraw', authorize(...HR_ALL), async (req, res) => {
  try {
    const { rows } = await query(`
      UPDATE hr_exit_requests SET status='withdrawn', updated_at=NOW()
      WHERE id=$1 AND company_id=$2 AND status NOT IN ('exited','fnf_linked') RETURNING *
    `, [req.params.id, req.user.company_id]);
    if (!rows.length) return res.status(400).json({ error: 'Cannot withdraw — settlement already in progress or already exited' });
    res.json({ data: rows[0] });
  } catch (err) { res.status(err.statusCode || 500).json({ error: err.message }); }
});

module.exports = router;
