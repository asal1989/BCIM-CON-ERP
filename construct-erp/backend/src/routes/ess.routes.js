const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { authenticate } = require('../middleware/auth');
const { query } = require('../config/database');
const { runSchemaInit } = require('../utils/schemaInit');

const router = express.Router();
router.use(authenticate);

const uploadDir = path.join(__dirname, '../../uploads/hr-docs');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadDir),
    filename: (_req, file, cb) => cb(null, `${Date.now()}-${file.originalname.replace(/\s+/g, '_')}`),
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
});

const ownUser = (req) => req.user.id;
const ownCompany = (req) => req.user.company_id;
const managerRoles = [
  'super_admin',
  'admin',
  'hr',
  'hr_admin',
  'hr_manager',
  'project_manager',
  'project_head',
  'department_head',
];

runSchemaInit('ess-mobile', async () => {
  await query(`
    CREATE TABLE IF NOT EXISTS hr_attendance_correction_requests (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id UUID REFERENCES companies(id),
      user_id UUID REFERENCES users(id),
      attendance_id UUID,
      attendance_date DATE NOT NULL,
      requested_status TEXT,
      requested_in_time TIME,
      requested_out_time TIME,
      reason TEXT,
      status TEXT DEFAULT 'pending',
      actioned_by UUID REFERENCES users(id),
      actioned_at TIMESTAMPTZ,
      rejection_reason TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
});

function requireManager(req, res, next) {
  const normalizedRole = String(req.user.role || '').trim().toLowerCase().replace(/[^\w-]/g, '');
  if (managerRoles.includes(normalizedRole)) return next();
  return res.status(403).json({ error: `Manager access required. Your role: ${normalizedRole || 'unknown'}` });
}

function workingDays(fromDate, toDate, halfDay) {
  if (halfDay) return 0.5;
  const from = new Date(fromDate);
  const to = new Date(toDate);
  let count = 0;
  const cur = new Date(from);
  while (cur <= to) {
    if (cur.getDay() !== 0) count += 1;
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}

router.get('/summary', async (req, res) => {
  try {
    const month = parseInt(req.query.month, 10) || new Date().getMonth() + 1;
    const year = parseInt(req.query.year, 10) || new Date().getFullYear();
    const userId = ownUser(req);
    const companyId = ownCompany(req);

    const [profile, attendance, leave, payroll, notifications] = await Promise.all([
      query(
        `SELECT u.id, u.name, u.email, u.employee_code, u.role,
                dep.name AS department_name, des.name AS designation_name,
                ep.work_location, ep.date_of_joining, ep.employment_status
         FROM users u
         LEFT JOIN employee_profiles ep ON ep.user_id = u.id
         LEFT JOIN hr_departments dep ON dep.id = ep.department_id
         LEFT JOIN hr_designations des ON des.id = ep.designation_id
         WHERE u.id = $1 AND u.company_id = $2`,
        [userId, companyId]
      ),
      query(
        `SELECT
           COUNT(*) FILTER (WHERE status='present') AS present,
           COUNT(*) FILTER (WHERE status='absent') AS absent,
           COUNT(*) FILTER (WHERE status='half_day') AS half_day,
           COUNT(*) FILTER (WHERE status='leave') AS on_leave,
           COUNT(*) FILTER (WHERE status='holiday') AS holidays,
           COUNT(*) FILTER (WHERE status='week_off') AS week_off,
           COALESCE(SUM(late_minutes),0) AS late_minutes
         FROM hr_attendance
         WHERE company_id = $1 AND user_id = $2
           AND EXTRACT(MONTH FROM attendance_date) = $3
           AND EXTRACT(YEAR FROM attendance_date) = $4`,
        [companyId, userId, month, year]
      ),
      query(
        `SELECT
           COUNT(*) FILTER (WHERE status='pending') AS pending,
           COUNT(*) FILTER (WHERE status='approved') AS approved,
           COUNT(*) FILTER (WHERE status='rejected') AS rejected,
           COUNT(*) FILTER (WHERE status='cancelled') AS cancelled
         FROM hr_leave_requests
         WHERE company_id = $1 AND user_id = $2`,
        [companyId, userId]
      ),
      query(
        `SELECT id, month, year, net_pay, gross_earnings, total_deductions, status, payment_date
         FROM hr_monthly_payroll
         WHERE company_id = $1 AND user_id = $2 AND month = $3 AND year = $4
         LIMIT 1`,
        [companyId, userId, month, year]
      ),
      query(
        `SELECT COUNT(*)::int AS unread
         FROM notifications
         WHERE company_id = $1
           AND (user_id = $2 OR user_id IS NULL)
           AND COALESCE(is_read, false) = false`,
        [companyId, userId]
      ).catch(() => ({ rows: [{ unread: 0 }] })),
    ]);

    res.json({
      data: {
        profile: profile.rows[0] || null,
        attendance: attendance.rows[0] || {},
        leave: leave.rows[0] || {},
        payroll: payroll.rows[0] || null,
        notifications: notifications.rows[0] || { unread: 0 },
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/attendance', async (req, res) => {
  try {
    const month = parseInt(req.query.month, 10) || new Date().getMonth() + 1;
    const year = parseInt(req.query.year, 10) || new Date().getFullYear();
    const { rows } = await query(
      `SELECT id, attendance_date, status, in_time, out_time, late_minutes, early_exit_minutes, source, remarks
       FROM hr_attendance
       WHERE company_id = $1 AND user_id = $2
         AND EXTRACT(MONTH FROM attendance_date) = $3
         AND EXTRACT(YEAR FROM attendance_date) = $4
       ORDER BY attendance_date DESC`,
      [ownCompany(req), ownUser(req), month, year]
    );
    res.json({ data: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/attendance/corrections', async (req, res) => {
  try {
    const { attendance_id, attendance_date, requested_status, requested_in_time, requested_out_time, reason } = req.body;
    if (!attendance_date || !reason) {
      return res.status(400).json({ error: 'Attendance date and reason are required' });
    }
    const { rows } = await query(
      `INSERT INTO hr_attendance_correction_requests
       (company_id, user_id, attendance_id, attendance_date, requested_status, requested_in_time, requested_out_time, reason)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING *`,
      [
        ownCompany(req),
        ownUser(req),
        attendance_id || null,
        attendance_date,
        requested_status || null,
        requested_in_time || null,
        requested_out_time || null,
        reason,
      ]
    );
    res.status(201).json({ data: rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/attendance/corrections', async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT cr.*, u.name AS employee_name, u.employee_code, ab.name AS actioned_by_name
       FROM hr_attendance_correction_requests cr
       JOIN users u ON u.id = cr.user_id
       LEFT JOIN users ab ON ab.id = cr.actioned_by
       WHERE cr.company_id = $1 AND cr.user_id = $2
       ORDER BY cr.created_at DESC`,
      [ownCompany(req), ownUser(req)]
    );
    res.json({ data: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/leave/balances', async (req, res) => {
  try {
    const year = parseInt(req.query.year, 10) || new Date().getFullYear();
    const { rows: types } = await query(
      `SELECT * FROM hr_leave_types WHERE company_id = $1 AND is_active = TRUE ORDER BY name`,
      [ownCompany(req)]
    );

    for (const type of types) {
      await query(
        `INSERT INTO hr_leave_balances (user_id, leave_type_id, year, accrued, closing_balance)
         VALUES ($1,$2,$3,$4,$4)
         ON CONFLICT (user_id, leave_type_id, year) DO NOTHING`,
        [ownUser(req), type.id, year, type.days_per_year]
      );
    }

    const { rows } = await query(
      `SELECT lb.*, lt.name AS leave_type_name, lt.code, lt.is_paid
       FROM hr_leave_balances lb
       JOIN hr_leave_types lt ON lt.id = lb.leave_type_id
       WHERE lb.user_id = $1 AND lb.year = $2 AND lt.is_active = TRUE
       ORDER BY lt.name`,
      [ownUser(req), year]
    );
    res.json({ data: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/leave/requests', async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT lr.*, lt.name AS leave_type_name, lt.code AS leave_code, ab.name AS actioned_by_name
       FROM hr_leave_requests lr
       JOIN hr_leave_types lt ON lt.id = lr.leave_type_id
       LEFT JOIN users ab ON ab.id = lr.actioned_by
       WHERE lr.company_id = $1 AND lr.user_id = $2
       ORDER BY lr.applied_at DESC`,
      [ownCompany(req), ownUser(req)]
    );
    res.json({ data: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/leave/requests', async (req, res) => {
  try {
    const { leave_type_id, from_date, to_date, half_day, half_day_session, reason } = req.body;
    if (!leave_type_id || !from_date || !to_date) {
      return res.status(400).json({ error: 'Leave type, from date and to date are required' });
    }

    const days = workingDays(from_date, to_date, half_day);
    const year = new Date(from_date).getFullYear();
    const balance = await query(
      `SELECT closing_balance FROM hr_leave_balances WHERE user_id = $1 AND leave_type_id = $2 AND year = $3`,
      [ownUser(req), leave_type_id, year]
    );
    const type = await query(`SELECT is_paid FROM hr_leave_types WHERE id = $1 AND company_id = $2`, [leave_type_id, ownCompany(req)]);
    if (!type.rows.length) return res.status(404).json({ error: 'Leave type not found' });

    const available = parseFloat(balance.rows[0]?.closing_balance || 0);
    if (type.rows[0].is_paid && available < days) {
      return res.status(400).json({ error: `Insufficient leave balance. Available: ${available}, Requested: ${days}` });
    }

    const { rows } = await query(
      `INSERT INTO hr_leave_requests
       (company_id, user_id, leave_type_id, from_date, to_date, days, half_day, half_day_session, reason)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING *`,
      [ownCompany(req), ownUser(req), leave_type_id, from_date, to_date, days, Boolean(half_day), half_day_session || null, reason || null]
    );
    res.status(201).json({ data: rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/leave/requests/:id/cancel', async (req, res) => {
  try {
    const { rows } = await query(
      `UPDATE hr_leave_requests
       SET status = 'cancelled'
       WHERE id = $1 AND company_id = $2 AND user_id = $3 AND status = 'pending'
       RETURNING *`,
      [req.params.id, ownCompany(req), ownUser(req)]
    );
    if (!rows.length) return res.status(400).json({ error: 'Cannot cancel this request' });
    res.json({ data: rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/payslips', async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT id, month, year, working_days, paid_days, lop_days,
              gross_earnings, total_deductions, net_pay, status, payment_date
       FROM hr_monthly_payroll
       WHERE company_id = $1 AND user_id = $2 AND status IN ('approved','paid')
       ORDER BY year DESC, month DESC`,
      [ownCompany(req), ownUser(req)]
    );
    res.json({ data: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/payslips/:id', async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT p.*, u.name AS employee_name, u.employee_code, u.email,
              ep.pan_number, ep.uan_number, ep.bank_name, ep.bank_account_number, ep.bank_ifsc,
              ep.date_of_joining, dep.name AS department_name, des.name AS designation_name,
              c.name AS company_name
       FROM hr_monthly_payroll p
       JOIN users u ON u.id = p.user_id
       LEFT JOIN employee_profiles ep ON ep.user_id = u.id
       LEFT JOIN hr_departments dep ON dep.id = ep.department_id
       LEFT JOIN hr_designations des ON des.id = ep.designation_id
       LEFT JOIN companies c ON c.id = p.company_id
       WHERE p.id = $1 AND p.company_id = $2 AND p.user_id = $3 AND p.status IN ('approved','paid')`,
      [req.params.id, ownCompany(req), ownUser(req)]
    );
    if (!rows.length) return res.status(404).json({ error: 'Payslip not found' });
    res.json({ data: rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/manager/leave-requests', requireManager, async (req, res) => {
  try {
    const status = req.query.status || 'pending';
    const { rows } = await query(
      `SELECT lr.*, u.name AS employee_name, u.employee_code,
              lt.name AS leave_type_name, lt.code AS leave_code
       FROM hr_leave_requests lr
       JOIN users u ON u.id = lr.user_id
       JOIN hr_leave_types lt ON lt.id = lr.leave_type_id
       WHERE lr.company_id = $1
         AND ($2::text = 'all' OR lr.status = $2::text)
       ORDER BY lr.applied_at DESC`,
      [ownCompany(req), status]
    );
    res.json({ data: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/manager/leave-requests/:id/:action', requireManager, async (req, res) => {
  const { action } = req.params;
  if (!['approve', 'reject'].includes(action)) {
    return res.status(400).json({ error: 'Invalid leave action' });
  }

  const client = await require('../config/database').pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `UPDATE hr_leave_requests
       SET status = $1,
           actioned_by = $2,
           actioned_at = NOW(),
           rejection_reason = CASE WHEN $1 = 'rejected' THEN $3 ELSE rejection_reason END
       WHERE id = $4 AND company_id = $5 AND status = 'pending'
       RETURNING *`,
      [action === 'approve' ? 'approved' : 'rejected', ownUser(req), req.body.rejection_reason || null, req.params.id, ownCompany(req)]
    );
    if (!rows.length) throw new Error('Pending leave request not found');

    const leave = rows[0];
    if (action === 'approve') {
      const year = new Date(leave.from_date).getFullYear();
      await client.query(
        `UPDATE hr_leave_balances
         SET taken = taken + $1,
             closing_balance = opening_balance + accrued + carry_forwarded - (taken + $1)
         WHERE user_id = $2 AND leave_type_id = $3 AND year = $4`,
        [leave.days, leave.user_id, leave.leave_type_id, year]
      );

      const from = new Date(leave.from_date);
      const to = new Date(leave.to_date);
      const cur = new Date(from);
      while (cur <= to) {
        if (cur.getDay() !== 0) {
          await client.query(
            `INSERT INTO hr_attendance (user_id, company_id, attendance_date, status, leave_request_id, source, remarks)
             VALUES ($1,$2,$3,'leave',$4,'ess_leave','Approved leave')
             ON CONFLICT (user_id, attendance_date)
             DO UPDATE SET status='leave', leave_request_id=$4, source='ess_leave', remarks='Approved leave'`,
            [leave.user_id, leave.company_id, cur.toISOString().slice(0, 10), leave.id]
          );
        }
        cur.setDate(cur.getDate() + 1);
      }
    }

    await client.query('COMMIT');
    res.json({ data: leave });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

router.get('/manager/attendance-corrections', requireManager, async (req, res) => {
  try {
    const status = req.query.status || 'pending';
    const { rows } = await query(
      `SELECT cr.*, u.name AS employee_name, u.employee_code
       FROM hr_attendance_correction_requests cr
       JOIN users u ON u.id = cr.user_id
       WHERE cr.company_id = $1
         AND ($2::text = 'all' OR cr.status = $2::text)
       ORDER BY cr.created_at DESC`,
      [ownCompany(req), status]
    );
    res.json({ data: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/manager/attendance-corrections/:id/:action', requireManager, async (req, res) => {
  const { action } = req.params;
  if (!['approve', 'reject'].includes(action)) {
    return res.status(400).json({ error: 'Invalid correction action' });
  }

  const client = await require('../config/database').pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `UPDATE hr_attendance_correction_requests
       SET status = $1,
           actioned_by = $2,
           actioned_at = NOW(),
           rejection_reason = CASE WHEN $1 = 'rejected' THEN $3 ELSE rejection_reason END,
           updated_at = NOW()
       WHERE id = $4 AND company_id = $5 AND status = 'pending'
       RETURNING *`,
      [action === 'approve' ? 'approved' : 'rejected', ownUser(req), req.body.rejection_reason || null, req.params.id, ownCompany(req)]
    );
    if (!rows.length) throw new Error('Pending correction request not found');

    const correction = rows[0];
    if (action === 'approve') {
      await client.query(
        `INSERT INTO hr_attendance
         (user_id, company_id, attendance_date, status, in_time, out_time, source, remarks)
         VALUES ($1,$2,$3,$4,$5,$6,'ess_correction',$7)
         ON CONFLICT (user_id, attendance_date)
         DO UPDATE SET status=$4, in_time=$5, out_time=$6, source='ess_correction', remarks=$7`,
        [
          correction.user_id,
          correction.company_id,
          correction.attendance_date,
          correction.requested_status || 'present',
          correction.requested_in_time || null,
          correction.requested_out_time || null,
          correction.reason || 'Approved attendance correction',
        ]
      );
    }
    await client.query('COMMIT');
    res.json({ data: correction });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

router.get('/assets/lookup', async (req, res) => {
  try {
    const code = String(req.query.code || '').trim();
    if (!code) return res.status(400).json({ error: 'Asset code is required' });
    const like = `%${code}%`;

    const asset = await query(
      `SELECT 'asset' AS source, a.id, a.asset_code,
              a.asset_name, a.asset_type,
              a.status, a.purchase_value, a.purchase_value AS book_value,
              a.serial_number, p.name AS project_name
       FROM assets a
       LEFT JOIN projects p ON p.id = a.current_location
       WHERE a.company_id = $1
         AND (a.asset_code ILIKE $2 OR a.serial_number ILIKE $2 OR a.asset_name ILIKE $2)
       LIMIT 1`,
      [ownCompany(req), like]
    ).catch(() => ({ rows: [] }));

    if (asset.rows.length) return res.json({ data: asset.rows[0] });

    const it = await query(
      `SELECT 'it_asset' AS source, a.id, a.asset_tag AS asset_code,
              TRIM(CONCAT_WS(' ', a.brand, a.model)) AS asset_name,
              a.asset_type, a.status, a.purchase_cost AS purchase_value,
              a.purchase_cost AS book_value, a.serial_number, p.name AS project_name,
              a.os, a.processor, a.ram_gb, a.storage_gb, a.assigned_to_name
       FROM it_assets a
       LEFT JOIN projects p ON p.id = a.location_project_id
       WHERE a.company_id = $1
         AND (a.asset_tag ILIKE $2 OR a.serial_number ILIKE $2 OR a.model ILIKE $2)
       LIMIT 1`,
      [ownCompany(req), like]
    ).catch(() => ({ rows: [] }));

    if (!it.rows.length) return res.status(404).json({ error: 'Asset not found' });
    res.json({ data: it.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/notifications', async (req, res) => {
  try {
    const persisted = await query(
      `SELECT id, title, body, type, is_read, created_at
       FROM notifications
       WHERE company_id = $1 AND (user_id = $2 OR user_id IS NULL)
       ORDER BY created_at DESC
       LIMIT 50`,
      [ownCompany(req), ownUser(req)]
    ).catch(() => ({ rows: [] }));

    const liveItems = [];
    const pendingLeave = await query(
      `SELECT COUNT(*)::int AS count FROM hr_leave_requests
       WHERE company_id = $1 AND user_id = $2 AND status = 'pending'`,
      [ownCompany(req), ownUser(req)]
    );
    if (pendingLeave.rows[0]?.count) {
      liveItems.push({
        id: 'ess-leave-pending',
        title: `${pendingLeave.rows[0].count} leave request pending`,
        body: 'Your leave request is awaiting approval',
        type: 'leave',
        is_read: false,
        created_at: new Date().toISOString(),
      });
    }

    res.json({ data: [...liveItems, ...persisted.rows] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/documents', async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT id, doc_type, doc_name, file_url, uploaded_at
       FROM employee_documents
       WHERE user_id = $1
       ORDER BY uploaded_at DESC`,
      [ownUser(req)]
    );
    res.json({ data: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/documents', upload.single('file'), async (req, res) => {
  try {
    const { doc_type = 'employee_document', doc_name } = req.body;
    const fileUrl = req.file ? `/uploads/hr-docs/${req.file.filename}` : req.body.file_url;
    if (!fileUrl) return res.status(400).json({ error: 'Document file is required' });

    const { rows } = await query(
      `INSERT INTO employee_documents (user_id, doc_type, doc_name, file_url, uploaded_by)
       VALUES ($1,$2,$3,$4,$5)
       RETURNING *`,
      [ownUser(req), doc_type, doc_name || req.file?.originalname || doc_type, fileUrl, ownUser(req)]
    );
    await query(
      `INSERT INTO employee_timeline
       (user_id, company_id, event_type, title, description, created_by)
       VALUES ($1,$2,'document','Document uploaded',$3,$4)`,
      [ownUser(req), ownCompany(req), doc_name || req.file?.originalname || doc_type, ownUser(req)]
    ).catch(() => null);
    res.status(201).json({ data: rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/onboarding', async (req, res) => {
  try {
    const items = [
      { stage: 'onboarding', item_key: 'offer_acceptance', title: 'Offer acceptance received', owner_department: 'HR' },
      { stage: 'onboarding', item_key: 'joining_documents', title: 'Joining documents collected', owner_department: 'HR' },
      { stage: 'onboarding', item_key: 'id_card', title: 'ID card issued', owner_department: 'Admin' },
      { stage: 'onboarding', item_key: 'asset_issue', title: 'Laptop / assets issued', owner_department: 'Admin / IT' },
      { stage: 'onboarding', item_key: 'email_setup', title: 'Email and ERP access created', owner_department: 'IT' },
      { stage: 'onboarding', item_key: 'bank_pf_esi', title: 'Bank, PF and ESI details verified', owner_department: 'HR / Accounts' },
      { stage: 'onboarding', item_key: 'safety_induction', title: 'Safety / site induction completed', owner_department: 'HSE / Projects' },
    ];
    for (const item of items) {
      await query(
        `INSERT INTO employee_lifecycle_checklist
         (user_id, company_id, stage, item_key, title, owner_department)
         VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (user_id, stage, item_key) DO NOTHING`,
        [ownUser(req), ownCompany(req), item.stage, item.item_key, item.title, item.owner_department]
      );
    }

    const { rows } = await query(
      `SELECT lc.*, u.name AS completed_by_name
       FROM employee_lifecycle_checklist lc
       LEFT JOIN users u ON u.id = lc.completed_by
       WHERE lc.user_id = $1 AND lc.company_id = $2 AND lc.stage = 'onboarding'
       ORDER BY lc.created_at ASC`,
      [ownUser(req), ownCompany(req)]
    );
    res.json({ data: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/onboarding/:id', async (req, res) => {
  try {
    const { status = 'completed', remarks } = req.body;
    const { rows } = await query(
      `UPDATE employee_lifecycle_checklist
       SET status = $1,
           remarks = $2,
           completed_at = CASE WHEN $1 = 'completed' THEN NOW() ELSE NULL END,
           completed_by = CASE WHEN $1 = 'completed' THEN $3 ELSE NULL END
       WHERE id = $4 AND user_id = $5 AND company_id = $6
       RETURNING *`,
      [status, remarks || null, ownUser(req), req.params.id, ownUser(req), ownCompany(req)]
    );
    if (!rows.length) return res.status(404).json({ error: 'Checklist item not found' });
    res.json({ data: rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
