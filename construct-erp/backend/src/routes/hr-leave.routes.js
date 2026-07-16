// src/routes/hr-leave.routes.js
// Leave balances, requests, approval workflow
const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const { query } = require('../config/database');
const { runSchemaInit } = require('../utils/schemaInit');
const { notifyLeaveRequested, notifyLeaveApproved, notifyLeaveRejected } = require('../services/notif.helper');

router.use(authenticate);
router.use(authorize('super_admin', 'admin', 'hr', 'hr_admin', 'hr_manager', 'manager', 'department_head'));

const FULL_HR_ROLES_LEAVE = new Set(['super_admin', 'admin', 'hr', 'hr_admin', 'hr_manager']);
async function getProjectScopeLeave(req) {
  const role = String(req.user?.role || '').toLowerCase();
  if (FULL_HR_ROLES_LEAVE.has(role)) return null;
  const r = await query(`SELECT project_id FROM employee_profiles WHERE user_id=$1`, [req.user.id]);
  return r.rows[0]?.project_id || null;
}

// ─── Auto-create tables ───────────────────────────────────────────────────────
const initTables = async () => {
  await query(`
    CREATE TABLE IF NOT EXISTS hr_leave_balances (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID REFERENCES users(id),
      leave_type_id UUID REFERENCES hr_leave_types(id),
      year INT NOT NULL,
      opening_balance NUMERIC(5,1) DEFAULT 0,
      accrued NUMERIC(5,1) DEFAULT 0,
      taken NUMERIC(5,1) DEFAULT 0,
      carry_forwarded NUMERIC(5,1) DEFAULT 0,
      closing_balance NUMERIC(5,1) DEFAULT 0,
      UNIQUE(user_id, leave_type_id, year)
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS hr_leave_requests (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id UUID REFERENCES companies(id),
      user_id UUID REFERENCES users(id),
      leave_type_id UUID REFERENCES hr_leave_types(id),
      from_date DATE NOT NULL,
      to_date DATE NOT NULL,
      days NUMERIC(4,1),
      half_day BOOLEAN DEFAULT FALSE,
      half_day_session TEXT,
      reason TEXT,
      status TEXT DEFAULT 'pending',
      applied_at TIMESTAMPTZ DEFAULT NOW(),
      actioned_by UUID REFERENCES users(id),
      actioned_at TIMESTAMPTZ,
      rejection_reason TEXT
    )
  `);
  await query(`
    CREATE INDEX IF NOT EXISTS idx_hr_leave_requests_user_status
    ON hr_leave_requests(user_id, status, from_date)
  `);
};
runSchemaInit('hr-leave', initTables);

// ─── Helpers ──────────────────────────────────────────────────────────────────
// Count working days between two dates (excluding Sundays only — basic version)
function workingDays(fromDate, toDate, halfDay) {
  if (halfDay) return 0.5;
  const from = new Date(fromDate);
  const to   = new Date(toDate);
  let count  = 0;
  const cur  = new Date(from);
  while (cur <= to) {
    if (cur.getDay() !== 0) count++; // exclude Sundays
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}

// ═══════════════════════════════════════════════════════════
// LEAVE BALANCES — get per employee + year
// ═══════════════════════════════════════════════════════════
router.get('/balances', async (req, res) => {
  try {
    const { user_id, year } = req.query;
    const yr = parseInt(year) || new Date().getFullYear();
    const uid = user_id || req.user.id;

    // Get all leave types for company
    const types = await query(
      `SELECT * FROM hr_leave_types WHERE company_id=$1 AND is_active=TRUE`,
      [req.user.company_id]
    );

    // Upsert default balance rows for each type if not exists
    for (const lt of types.rows) {
      await query(
        `INSERT INTO hr_leave_balances (user_id, leave_type_id, year, accrued, closing_balance)
         VALUES ($1,$2,$3,$4,$4) ON CONFLICT (user_id, leave_type_id, year) DO NOTHING`,
        [uid, lt.id, yr, lt.days_per_year]
      );
    }

    const { rows } = await query(
      `SELECT lb.*, lt.name as leave_type_name, lt.code, lt.is_paid
       FROM hr_leave_balances lb
       JOIN hr_leave_types lt ON lt.id = lb.leave_type_id
       WHERE lb.user_id=$1 AND lb.year=$2 AND lt.is_active=TRUE
       ORDER BY lt.name`,
      [uid, yr]
    );
    res.json({ data: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Update balance manually (admin)
router.put('/balances/:id', async (req, res) => {
  try {
    const { opening_balance, accrued, carry_forwarded } = req.body;
    const { rows } = await query(
      `UPDATE hr_leave_balances
       SET opening_balance=$1, accrued=$2, carry_forwarded=$3,
           closing_balance=opening_balance+accrued+carry_forwarded-taken
       WHERE id=$4 RETURNING *`,
      [opening_balance, accrued, carry_forwarded, req.params.id]
    );
    res.json({ data: rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════
// LEAVE REQUESTS — list
// ═══════════════════════════════════════════════════════════
router.get('/requests', async (req, res) => {
  try {
    const { user_id, status, from_date, to_date } = req.query;
    const projectId = await getProjectScopeLeave(req);
    let sql = `
      SELECT lr.*, u.name as employee_name, u.employee_code,
             lt.name as leave_type_name, lt.code as leave_code,
             ab.name as actioned_by_name
      FROM hr_leave_requests lr
      JOIN users u ON u.id = lr.user_id
      LEFT JOIN employee_profiles ep ON ep.user_id = u.id
      JOIN hr_leave_types lt ON lt.id = lr.leave_type_id
      LEFT JOIN users ab ON ab.id = lr.actioned_by
      WHERE lr.company_id = $1`;
    const params = [req.user.company_id];
    let idx = 2;

    if (user_id) { sql += ` AND lr.user_id=$${idx}`; params.push(user_id); idx++; }
    if (status)  { sql += ` AND lr.status=$${idx}`;  params.push(status);  idx++; }
    if (from_date) { sql += ` AND lr.from_date >= $${idx}`; params.push(from_date); idx++; }
    if (to_date)   { sql += ` AND lr.to_date <= $${idx}`;   params.push(to_date);   idx++; }
    if (projectId !== null) { sql += ` AND ep.project_id=$${idx}`; params.push(projectId); idx++; }

    sql += ' ORDER BY lr.applied_at DESC';
    const { rows } = await query(sql, params);
    res.json({ data: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Submit leave request ─────────────────────────────────────────────────────
router.post('/requests', async (req, res) => {
  try {
    const { leave_type_id, from_date, to_date, half_day, half_day_session, reason, user_id } = req.body;
    const uid = user_id || req.user.id;
    const days = workingDays(from_date, to_date, half_day);

    // Check balance
    const yr = new Date(from_date).getFullYear();
    const bal = await query(
      `SELECT closing_balance FROM hr_leave_balances WHERE user_id=$1 AND leave_type_id=$2 AND year=$3`,
      [uid, leave_type_id, yr]
    );
    const available = parseFloat(bal.rows[0]?.closing_balance || 0);

    // Get leave type
    const lt = await query(`SELECT is_paid FROM hr_leave_types WHERE id=$1`, [leave_type_id]);
    const isPaid = lt.rows[0]?.is_paid;

    if (isPaid && available < days) {
      return res.status(400).json({ error: `Insufficient leave balance. Available: ${available}, Requested: ${days}` });
    }

    const { rows } = await query(
      `INSERT INTO hr_leave_requests
       (company_id, user_id, leave_type_id, from_date, to_date, days, half_day, half_day_session, reason)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [req.user.company_id, uid, leave_type_id, from_date, to_date, days,
       half_day || false, half_day_session || null, reason || null]
    );
    // Notify HR and PM about leave request
    const ltRes = await query(`SELECT name FROM hr_leave_types WHERE id=$1`, [leave_type_id]);
    notifyLeaveRequested(req.user.company_id, {
      ...rows[0],
      leave_type: ltRes.rows[0]?.name || 'Leave',
    }, req.user.name);
    res.status(201).json({ data: rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Approve ──────────────────────────────────────────────────────────────────
router.patch('/requests/:id/approve', async (req, res) => {
  const client = (await require('../config/database').pool.connect());
  try {
    await client.query('BEGIN');

    const { rows: existing } = await client.query(
      `SELECT * FROM hr_leave_requests WHERE id=$1 AND company_id=$2`,
      [req.params.id, req.user.company_id]
    );
    if (!existing.length) throw new Error('Leave request not found');
    if (existing[0].user_id === req.user.id) throw new Error('Cannot approve your own leave request');
    if (existing[0].status !== 'pending') throw new Error('Leave request is not pending');

    const req_ = existing[0];
    const yr = new Date(req_.from_date).getFullYear();

    // Check sufficient balance before deducting
    const ltInfo = await client.query(`SELECT is_paid FROM hr_leave_types WHERE id=$1`, [req_.leave_type_id]);
    if (ltInfo.rows[0]?.is_paid) {
      const bal = await client.query(
        `SELECT closing_balance FROM hr_leave_balances WHERE user_id=$1 AND leave_type_id=$2 AND year=$3`,
        [req_.user_id, req_.leave_type_id, yr]
      );
      const available = parseFloat(bal.rows[0]?.closing_balance || 0);
      if (available < req_.days) throw new Error(`Insufficient leave balance: ${available} available, ${req_.days} requested`);
    }

    const { rows: lr } = await client.query(
      `UPDATE hr_leave_requests SET status='approved', actioned_by=$1, actioned_at=NOW()
       WHERE id=$2 AND company_id=$3 RETURNING *`,
      [req.user.id, req.params.id, req.user.company_id]
    );

    // Deduct from balance
    await client.query(
      `UPDATE hr_leave_balances
       SET taken = taken + $1,
           closing_balance = opening_balance + accrued + carry_forwarded - (taken + $1)
       WHERE user_id=$2 AND leave_type_id=$3 AND year=$4`,
      [req_.days, req_.user_id, req_.leave_type_id, yr]
    );

    // Auto-create attendance records for leave days
    const from = new Date(req_.from_date);
    const to   = new Date(req_.to_date);
    const cur  = new Date(from);
    while (cur <= to) {
      if (cur.getDay() !== 0) { // skip Sundays
        await client.query(
          `INSERT INTO hr_attendance (user_id, company_id, attendance_date, status, leave_request_id)
           VALUES ($1,$2,$3,'leave',$4) ON CONFLICT (user_id, attendance_date) DO UPDATE SET status='leave', leave_request_id=$4`,
          [req_.user_id, req_.company_id, cur.toISOString().split('T')[0], req_.id]
        );
      }
      cur.setDate(cur.getDate() + 1);
    }

    await client.query('COMMIT');
    // Notify the employee their leave was approved
    notifyLeaveApproved(req_.company_id, req_, req_.user_id, req.user.name);
    res.json({ data: lr[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// ─── Reject ───────────────────────────────────────────────────────────────────
router.patch('/requests/:id/reject', async (req, res) => {
  try {
    const { rejection_reason } = req.body;
    const { rows } = await query(
      `UPDATE hr_leave_requests SET status='rejected', actioned_by=$1, actioned_at=NOW(), rejection_reason=$2
       WHERE id=$3 AND company_id=$4 RETURNING *`,
      [req.user.id, rejection_reason || null, req.params.id, req.user.company_id]
    );
    if (rows.length) notifyLeaveRejected(rows[0].company_id, rows[0], rows[0].user_id, req.user.name, rejection_reason);
    res.json({ data: rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Leave Encashment ──────────────────────────────────────────────────────────
;(async () => {
  const safe = async sql => { try { await query(sql); } catch(_) {} };
  await safe(`CREATE TABLE IF NOT EXISTS hr_leave_encashment (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL,
    user_id UUID NOT NULL REFERENCES users(id),
    leave_type_id UUID REFERENCES hr_leave_types(id),
    year INT NOT NULL,
    days_encashed NUMERIC(6,2) NOT NULL,
    amount NUMERIC(12,2) NOT NULL DEFAULT 0,
    basis VARCHAR(30) DEFAULT 'basic' CHECK (basis IN ('basic','gross')),
    paid_on DATE,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending','approved','paid','rejected')),
    approved_by UUID REFERENCES users(id),
    remarks TEXT,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`);
  await safe(`CREATE TABLE IF NOT EXISTS hr_leave_carryforward_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL,
    run_for_year INT NOT NULL,
    processed_at TIMESTAMPTZ DEFAULT NOW(),
    employees_processed INT DEFAULT 0,
    total_days_carried NUMERIC(10,2) DEFAULT 0,
    total_days_lapsed NUMERIC(10,2) DEFAULT 0,
    run_by UUID REFERENCES users(id)
  )`);
})();

router.get('/encashment', async (req, res) => {
  try {
    const { user_id, status } = req.query;
    const conds = ['e.company_id=$1']; const params=[req.user.company_id]; let i=2;
    if (user_id) { conds.push(`e.user_id=$${i++}`); params.push(user_id); }
    if (status)  { conds.push(`e.status=$${i++}`); params.push(status); }
    const { rows } = await query(
      `SELECT e.*, u.name AS full_name, lt.name as leave_type_name
       FROM hr_leave_encashment e JOIN users u ON u.id=e.user_id
       LEFT JOIN hr_leave_types lt ON lt.id=e.leave_type_id
       WHERE ${conds.join(' AND ')} ORDER BY e.created_at DESC`,
      params
    );
    res.json({ data: rows });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

router.post('/encashment', async (req, res) => {
  try {
    const { user_id,leave_type_id,year,days_encashed,amount,basis,remarks } = req.body;
    const { rows } = await query(
      `INSERT INTO hr_leave_encashment(company_id,user_id,leave_type_id,year,days_encashed,amount,basis,remarks,created_by)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [req.user.company_id,user_id,leave_type_id,year,days_encashed,amount||0,basis||'basic',remarks,req.user.id]
    );
    res.json({ data: rows[0] });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

router.patch('/encashment/:id/approve', async (req, res) => {
  try {
    const { rows } = await query(
      `UPDATE hr_leave_encashment SET status='approved',approved_by=$1
       WHERE id=$2 AND company_id=$3 RETURNING *`,
      [req.user.id, req.params.id, req.user.company_id]
    );
    res.json({ data: rows[0] });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

router.patch('/encashment/:id/pay', async (req, res) => {
  try {
    const { paid_on } = req.body;
    const { rows } = await query(
      `UPDATE hr_leave_encashment SET status='paid',paid_on=$1
       WHERE id=$2 AND company_id=$3 AND status='approved' RETURNING *`,
      [paid_on||new Date().toISOString().split('T')[0], req.params.id, req.user.company_id]
    );
    res.json({ data: rows[0] });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// ── Year-end Carry Forward ────────────────────────────────────────────────────
router.post('/carry-forward/run', async (req, res) => {
  try {
    const { year } = req.body; // year to process (e.g. 2024 carries to 2025)
    const { rows: types } = await query(
      `SELECT * FROM hr_leave_types WHERE company_id=$1 AND carry_forward=TRUE`,
      [req.user.company_id]
    );
    let totalDaysCarried = 0, totalDaysLapsed = 0, empCount = 0;
    for (const lt of types) {
      const maxCarry = lt.carry_forward_days || 0;
      const { rows: balances } = await query(
        `SELECT * FROM hr_leave_balances WHERE leave_type_id=$1 AND year=$2`,
        [lt.id, year]
      );
      for (const bal of balances) {
        const carry = Math.min(parseFloat(bal.balance||0), maxCarry);
        const lapsed = parseFloat(bal.balance||0) - carry;
        if (carry > 0) {
          await query(
            `INSERT INTO hr_leave_balances(user_id,leave_type_id,year,allocated,balance,company_id)
             VALUES($1,$2,$3,0,$4,$5)
             ON CONFLICT(user_id,leave_type_id,year) DO UPDATE SET balance=hr_leave_balances.balance+$4`,
            [bal.user_id, lt.id, parseInt(year)+1, carry, req.user.company_id]
          );
          totalDaysCarried += carry;
        }
        totalDaysLapsed += lapsed;
        empCount++;
      }
    }
    await query(
      `INSERT INTO hr_leave_carryforward_log(company_id,run_for_year,employees_processed,total_days_carried,total_days_lapsed,run_by)
       VALUES($1,$2,$3,$4,$5,$6)`,
      [req.user.company_id, year, empCount, totalDaysCarried, totalDaysLapsed, req.user.id]
    );
    res.json({ data: { year, employees_processed: empCount, total_days_carried: totalDaysCarried, total_days_lapsed: totalDaysLapsed } });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

router.get('/carry-forward/history', async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT l.*, u.name as run_by_name FROM hr_leave_carryforward_log l
       LEFT JOIN users u ON u.id=l.run_by WHERE l.company_id=$1 ORDER BY l.processed_at DESC`,
      [req.user.company_id]
    );
    res.json({ data: rows });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// ─── Cancel (by employee) ─────────────────────────────────────────────────────
router.patch('/requests/:id/cancel', async (req, res) => {
  try {
    const { rows } = await query(
      `UPDATE hr_leave_requests SET status='cancelled'
       WHERE id=$1 AND company_id=$2 AND user_id=$3 AND status='pending' RETURNING *`,
      [req.params.id, req.user.company_id, req.user.id]
    );
    if (!rows.length) return res.status(400).json({ error: 'Cannot cancel this request' });
    res.json({ data: rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;

