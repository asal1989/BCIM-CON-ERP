// src/routes/hr-leave.routes.js
// Leave balances, requests, approval workflow
const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { query } = require('../config/database');
const { runSchemaInit } = require('../utils/schemaInit');
const { notifyLeaveRequested, notifyLeaveApproved, notifyLeaveRejected } = require('../services/notif.helper');

router.use(authenticate);

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
       WHERE lb.user_id=$1 AND lb.year=$2
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
    let sql = `
      SELECT lr.*, u.name as employee_name, u.employee_code,
             lt.name as leave_type_name, lt.code as leave_code,
             ab.name as actioned_by_name
      FROM hr_leave_requests lr
      JOIN users u ON u.id = lr.user_id
      JOIN hr_leave_types lt ON lt.id = lr.leave_type_id
      LEFT JOIN users ab ON ab.id = lr.actioned_by
      WHERE lr.company_id = $1`;
    const params = [req.user.company_id];
    let idx = 2;

    if (user_id) { sql += ` AND lr.user_id=$${idx}`; params.push(user_id); idx++; }
    if (status)  { sql += ` AND lr.status=$${idx}`;  params.push(status);  idx++; }
    if (from_date) { sql += ` AND lr.from_date >= $${idx}`; params.push(from_date); idx++; }
    if (to_date)   { sql += ` AND lr.to_date <= $${idx}`;   params.push(to_date);   idx++; }

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

    const { rows: lr } = await client.query(
      `UPDATE hr_leave_requests SET status='approved', actioned_by=$1, actioned_at=NOW()
       WHERE id=$2 AND company_id=$3 RETURNING *`,
      [req.user.id, req.params.id, req.user.company_id]
    );
    if (!lr.length) throw new Error('Leave request not found');

    const req_ = lr[0];
    const yr = new Date(req_.from_date).getFullYear();

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

