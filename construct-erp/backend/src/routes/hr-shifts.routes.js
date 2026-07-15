// hr-shifts.routes.js — Shift Management, Overtime & Comp-off
const express = require('express');
const router  = express.Router();
const { query } = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');

const HR_ROLES = ['super_admin','admin','hr_admin','hr_manager'];
const HR_ALL   = [...HR_ROLES, 'hr', 'manager', 'department_head'];

// ── Auto-migrate ──────────────────────────────────────────────────────────────
;(async () => {
  const safe = async sql => { try { await query(sql); } catch(_) {} };
  await safe(`CREATE TABLE IF NOT EXISTS hr_shifts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL,
    name VARCHAR(100) NOT NULL,
    shift_code VARCHAR(20),
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    break_minutes INT DEFAULT 30,
    is_night_shift BOOLEAN DEFAULT FALSE,
    grace_minutes INT DEFAULT 10,
    ot_after_minutes INT DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`);
  // Add columns that may be missing on existing deployments
  await safe(`ALTER TABLE hr_shifts ADD COLUMN IF NOT EXISTS break_minutes INT DEFAULT 30`);
  await safe(`ALTER TABLE hr_shifts ADD COLUMN IF NOT EXISTS is_night_shift BOOLEAN DEFAULT FALSE`);
  await safe(`ALTER TABLE hr_shifts ADD COLUMN IF NOT EXISTS ot_after_minutes INT DEFAULT 0`);
  await safe(`ALTER TABLE hr_shifts ADD COLUMN IF NOT EXISTS grace_minutes INT DEFAULT 10`);
  await safe(`CREATE TABLE IF NOT EXISTS hr_employee_shifts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL,
    employee_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    shift_id UUID NOT NULL REFERENCES hr_shifts(id),
    effective_from DATE NOT NULL,
    effective_to DATE,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`);
  await safe(`CREATE TABLE IF NOT EXISTS hr_overtime (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL,
    employee_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    ot_date DATE NOT NULL,
    ot_hours NUMERIC(5,2) NOT NULL DEFAULT 0,
    ot_rate_multiplier NUMERIC(4,2) DEFAULT 1.5,
    ot_amount NUMERIC(12,2) DEFAULT 0,
    remarks TEXT,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','paid')),
    approved_by UUID REFERENCES users(id),
    approved_at TIMESTAMPTZ,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`);
  await safe(`CREATE TABLE IF NOT EXISTS hr_comp_off (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL,
    employee_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    worked_on DATE NOT NULL,
    expiry_date DATE,
    reason TEXT,
    status VARCHAR(20) DEFAULT 'available' CHECK (status IN ('available','used','expired')),
    used_on DATE,
    approved_by UUID REFERENCES users(id),
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`);
})();

router.use(authenticate);

// ── Shifts ────────────────────────────────────────────────────────────────────
router.get('/shifts', authorize(...HR_ALL), async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT id, company_id, name, shift_code AS code, start_time, end_time,
              break_minutes, is_night_shift, grace_minutes, ot_after_minutes,
              is_active AS active, created_at
       FROM hr_shifts WHERE company_id=$1 ORDER BY name`,
      [req.user.company_id]
    );
    res.json({ data: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/shifts', authorize(...HR_ROLES), async (req, res) => {
  try {
    const { name, code, start_time, end_time, break_minutes, is_night_shift, grace_minutes, ot_after_minutes } = req.body;
    if (!name || !start_time || !end_time) return res.status(400).json({ error: 'name, start_time and end_time are required' });
    const { rows } = await query(
      `INSERT INTO hr_shifts(company_id,name,shift_code,start_time,end_time,break_minutes,is_night_shift,grace_minutes,ot_after_minutes)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [req.user.company_id, name, code||null, start_time, end_time,
       parseInt(break_minutes)||30, is_night_shift||false,
       parseInt(grace_minutes)||10, parseInt(ot_after_minutes)||480]
    );
    res.json({ data: rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/shifts/:id', authorize(...HR_ROLES), async (req, res) => {
  try {
    const { name, code, start_time, end_time, break_minutes, is_night_shift, grace_minutes, ot_after_minutes, active } = req.body;
    const { rows } = await query(
      `UPDATE hr_shifts SET name=$1,shift_code=$2,start_time=$3,end_time=$4,break_minutes=$5,is_night_shift=$6,grace_minutes=$7,ot_after_minutes=$8,is_active=$9
       WHERE id=$10 AND company_id=$11 RETURNING *`,
      [name, code||null, start_time, end_time,
       parseInt(break_minutes)||30, is_night_shift||false,
       parseInt(grace_minutes)||10, parseInt(ot_after_minutes)||480,
       active!==false, req.params.id, req.user.company_id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Shift not found' });
    res.json({ data: rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/shifts/:id', authorize(...HR_ROLES), async (req, res) => {
  try {
    await query(`DELETE FROM hr_shifts WHERE id=$1 AND company_id=$2`, [req.params.id, req.user.company_id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Employee Shift Assignment ─────────────────────────────────────────────────
router.get('/employee-shifts', authorize(...HR_ALL), async (req, res) => {
  try {
    const { employee_id } = req.query;
    const { rows } = await query(
      `SELECT es.*, s.name as shift_name, s.start_time, s.end_time,
              e.name as employee_name, e.employee_code as emp_code
       FROM hr_employee_shifts es
       JOIN hr_shifts s ON s.id=es.shift_id
       JOIN users e ON e.id=es.employee_id
       WHERE es.company_id=$1 ${employee_id ? 'AND es.employee_id=$2' : ''}
       ORDER BY es.effective_from DESC`,
      employee_id ? [req.user.company_id, employee_id] : [req.user.company_id]
    );
    res.json({ data: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/employee-shifts', authorize(...HR_ROLES), async (req, res) => {
  try {
    const { employee_id, shift_id, effective_from, effective_to } = req.body;
    if (!employee_id || !shift_id || !effective_from) return res.status(400).json({ error: 'employee_id, shift_id and effective_from are required' });
    const { rows } = await query(
      `INSERT INTO hr_employee_shifts(company_id,employee_id,shift_id,effective_from,effective_to,created_by)
       VALUES($1,$2,$3,$4,$5,$6) RETURNING *`,
      [req.user.company_id, employee_id, shift_id, effective_from, effective_to||null, req.user.id]
    );
    res.json({ data: rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/employee-shifts/:id', authorize(...HR_ROLES), async (req, res) => {
  try {
    await query(`DELETE FROM hr_employee_shifts WHERE id=$1 AND company_id=$2`, [req.params.id, req.user.company_id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Bulk-assign a shift to all active employees in a project (or HO/no-project)
router.post('/employee-shifts/bulk-assign', authorize(...HR_ROLES), async (req, res) => {
  try {
    const { project_id, shift_id, effective_from, effective_to } = req.body;
    if (!shift_id || !effective_from) return res.status(400).json({ error: 'shift_id and effective_from required' });

    const isNone = !project_id || project_id === 'none';
    const empSql = isNone
      ? `SELECT u.id FROM users u JOIN employee_profiles ep ON ep.user_id=u.id WHERE u.company_id=$1 AND u.is_active=true AND ep.project_id IS NULL`
      : `SELECT u.id FROM users u JOIN employee_profiles ep ON ep.user_id=u.id WHERE u.company_id=$1 AND u.is_active=true AND ep.project_id=$2`;
    const { rows: emps } = await query(empSql, isNone ? [req.user.company_id] : [req.user.company_id, project_id]);

    let assigned = 0;
    for (const emp of emps) {
      await query(
        `UPDATE hr_employee_shifts SET effective_to=$1 WHERE employee_id=$2 AND company_id=$3 AND effective_to IS NULL AND effective_from < $1`,
        [effective_from, emp.id, req.user.company_id]
      );
      await query(
        `INSERT INTO hr_employee_shifts(company_id,employee_id,shift_id,effective_from,effective_to,created_by)
         VALUES($1,$2,$3,$4,$5,$6)`,
        [req.user.company_id, emp.id, shift_id, effective_from, effective_to||null, req.user.id]
      );
      assigned++;
    }
    res.json({ data: { assigned } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Overtime ──────────────────────────────────────────────────────────────────
router.get('/overtime', authorize(...HR_ALL), async (req, res) => {
  try {
    const { employee_id, month, status } = req.query;
    const conds = ['o.company_id=$1']; const params = [req.user.company_id]; let i = 2;
    if (employee_id) { conds.push(`o.employee_id=$${i++}`); params.push(employee_id); }
    if (month)       { conds.push(`to_char(o.ot_date,'YYYY-MM')=$${i++}`); params.push(month); }
    if (status)      { conds.push(`o.status=$${i++}`); params.push(status); }
    const { rows } = await query(
      `SELECT o.*, e.name AS full_name, e.employee_code AS emp_code
       FROM hr_overtime o JOIN users e ON e.id=o.employee_id
       WHERE ${conds.join(' AND ')} ORDER BY o.ot_date DESC`,
      params
    );
    res.json({ data: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/overtime', authorize(...HR_ALL), async (req, res) => {
  try {
    const { employee_id, ot_date, ot_hours, ot_rate_multiplier, ot_amount, remarks } = req.body;
    const { rows } = await query(
      `INSERT INTO hr_overtime(company_id,employee_id,ot_date,ot_hours,ot_rate_multiplier,ot_amount,remarks,created_by)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [req.user.company_id, employee_id, ot_date, ot_hours, ot_rate_multiplier||1.5, ot_amount||0, remarks, req.user.id]
    );
    res.json({ data: rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/overtime/:id/approve', authorize(...HR_ROLES), async (req, res) => {
  try {
    const { rows } = await query(
      `UPDATE hr_overtime SET status='approved',approved_by=$1,approved_at=NOW()
       WHERE id=$2 AND company_id=$3 RETURNING *`,
      [req.user.id, req.params.id, req.user.company_id]
    );
    res.json({ data: rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/overtime/:id/reject', authorize(...HR_ROLES), async (req, res) => {
  try {
    const { rows } = await query(
      `UPDATE hr_overtime SET status='rejected',approved_by=$1,approved_at=NOW()
       WHERE id=$2 AND company_id=$3 RETURNING *`,
      [req.user.id, req.params.id, req.user.company_id]
    );
    res.json({ data: rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Comp-off ──────────────────────────────────────────────────────────────────
router.get('/comp-off', authorize(...HR_ALL), async (req, res) => {
  try {
    const { employee_id } = req.query;
    const { rows } = await query(
      `SELECT c.*, e.name AS full_name, e.employee_code AS emp_code
       FROM hr_comp_off c JOIN users e ON e.id=c.employee_id
       WHERE c.company_id=$1 ${employee_id ? 'AND c.employee_id=$2' : ''}
       ORDER BY c.worked_on DESC`,
      employee_id ? [req.user.company_id, employee_id] : [req.user.company_id]
    );
    res.json({ data: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/comp-off', authorize(...HR_ALL), async (req, res) => {
  try {
    const { employee_id, worked_on, reason, expiry_date } = req.body;
    const { rows } = await query(
      `INSERT INTO hr_comp_off(company_id,employee_id,worked_on,reason,expiry_date,created_by)
       VALUES($1,$2,$3,$4,$5,$6) RETURNING *`,
      [req.user.company_id, employee_id, worked_on, reason, expiry_date||null, req.user.id]
    );
    res.json({ data: rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/comp-off/:id/approve', authorize(...HR_ROLES), async (req, res) => {
  try {
    const { rows } = await query(
      `UPDATE hr_comp_off SET status='available',approved_by=$1
       WHERE id=$2 AND company_id=$3 RETURNING *`,
      [req.user.id, req.params.id, req.user.company_id]
    );
    res.json({ data: rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
