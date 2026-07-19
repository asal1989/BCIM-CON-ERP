const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { authenticate } = require('../middleware/auth');
const { query } = require('../config/database');
const { runSchemaInit } = require('../utils/schemaInit');
const { sendMail } = require('../services/mail.service');

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
    if (WORK_WEEK_DAYS.includes(cur.getDay())) count += 1;
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}

const fmtDate = (d) => d ? String(d).slice(0, 10) : '';
const ERP_URL = (process.env.PUBLIC_FRONTEND_URL || process.env.FRONTEND_URL || 'https://erp.bcim.in').replace(/\/$/, '');

function mailHeader(title) {
  return `<div style="background:#1e3a5f;padding:18px 28px;border-radius:8px 8px 0 0"><h2 style="color:#fff;margin:0;font-size:17px">${title}</h2></div>`;
}
function mailFooter() {
  return `<hr style="border:none;border-top:1px solid #e2e8f0;margin:18px 0"><p style="font-size:12px;color:#94a3b8;margin:0">— BCIM ConstructERP</p>`;
}
function mailRow(k, v) {
  return `<tr><td style="padding:8px 12px;border:1px solid #e2e8f0;background:#f8fafc;font-weight:600;width:36%">${k}</td><td style="padding:8px 12px;border:1px solid #e2e8f0">${v}</td></tr>`;
}
function mailWrap(header, body) {
  return `<div style="font-family:Arial,sans-serif;max-width:540px;margin:0 auto;color:#0f172a">${header}<div style="background:#fff;padding:22px 28px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 8px 8px">${body}${mailFooter()}</div></div>`;
}
function statusBadge(status) {
  const color = status === 'approved' ? '#16a34a' : '#dc2626';
  return `<span style="display:inline-block;background:${color};color:#fff;padding:2px 10px;border-radius:12px;font-size:12px;font-weight:700">${status.toUpperCase()}</span>`;
}

async function notifyHR(subject, html) {
  const to = process.env.HR_NOTIFY_EMAIL || 'surendra@bcim.in';
  sendMail({ to, subject, html }).catch(e => console.error('[ESS mail] HR notify error:', e.message));
}

// Work-week days: 1=Mon … 6=Sat. Construction sites typically work 6 days.
// Change to [1,2,3,4,5] here (and in the approval loop below) for a 5-day week.
const WORK_WEEK_DAYS = [1, 2, 3, 4, 5, 6];

async function notifyEmployee(userId, companyId, subject, html) {
  try {
    const { rows } = await query(`SELECT email FROM users WHERE id=$1 AND company_id=$2 AND email IS NOT NULL`, [userId, companyId]);
    if (!rows[0]?.email) return;
    sendMail({ to: rows[0].email, subject, html }).catch(e => console.error('[ESS mail] Employee notify error:', e.message));
  } catch (e) { console.error('[ESS mail] notifyEmployee error:', e.message); }
}

router.get('/summary', async (req, res) => {
  try {
    const month = parseInt(req.query.month, 10) || new Date().getMonth() + 1;
    const year = parseInt(req.query.year, 10) || new Date().getFullYear();
    const userId = ownUser(req);
    const companyId = ownCompany(req);

    const [profile, attendance, leave, payroll, notifications] = await Promise.all([
      // Dashboard summary: only non-sensitive identity fields.
      // Statutory/bank/contact details are behind GET /ess/profile/full.
      query(
        `SELECT u.id, u.name, u.email, u.employee_code, u.role, u.phone,
                dep.name AS department_name, des.name AS designation_name,
                ep.work_location, ep.date_of_joining, ep.date_of_confirmation,
                ep.employment_status, ep.employment_type, ep.employee_category,
                ep.profile_photo_url, ep.gender,
                mgr.name AS reporting_manager_name
         FROM users u
         LEFT JOIN employee_profiles ep ON ep.user_id = u.id
         LEFT JOIN hr_departments dep ON dep.id = ep.department_id
         LEFT JOIN hr_designations des ON des.id = ep.designation_id
         LEFT JOIN users mgr ON mgr.id = ep.reporting_manager_id
         WHERE u.id = $1 AND u.company_id = $2`,
        [userId, companyId]
      ),
      query(
        `WITH reconciled AS (
           -- ESSL records with approved leave overlay
           SELECT
             CASE WHEN lr.id IS NOT NULL AND a.status IN ('absent','half_day') THEN 'leave' ELSE a.status END AS status,
             a.late_minutes
           FROM hr_attendance a
           LEFT JOIN hr_leave_requests lr
             ON  lr.user_id = a.user_id AND lr.company_id = a.company_id
             AND lr.status = 'approved'
             AND a.attendance_date BETWEEN lr.from_date AND lr.to_date
           WHERE a.company_id = $1 AND a.user_id = $2
             AND EXTRACT(MONTH FROM a.attendance_date) = $3
             AND EXTRACT(YEAR  FROM a.attendance_date) = $4
           UNION ALL
           -- Approved leave days with no ESSL record
           SELECT 'leave' AS status, 0 AS late_minutes
           FROM hr_leave_requests lr
           CROSS JOIN generate_series(lr.from_date, lr.to_date, '1 day'::interval) d
           WHERE lr.company_id = $1 AND lr.user_id = $2 AND lr.status = 'approved'
             AND EXTRACT(MONTH FROM d) = $3 AND EXTRACT(YEAR FROM d) = $4
             AND NOT EXISTS (
               SELECT 1 FROM hr_attendance a2
               WHERE a2.user_id = $2 AND a2.company_id = $1 AND a2.attendance_date = d::date
             )
         )
         SELECT
           COUNT(*) FILTER (WHERE status='present')  AS present,
           COUNT(*) FILTER (WHERE status='absent')   AS absent,
           COUNT(*) FILTER (WHERE status='half_day') AS half_day,
           COUNT(*) FILTER (WHERE status='leave')    AS on_leave,
           COUNT(*) FILTER (WHERE status='holiday')  AS holidays,
           COUNT(*) FILTER (WHERE status='week_off') AS week_off,
           COALESCE(SUM(late_minutes),0)             AS late_minutes
         FROM reconciled`,
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

    // Pending correction count for dashboard action card
    const attRow = attendance.rows[0] || {};
    const pendingCorr = await query(
      `SELECT COUNT(*)::int AS cnt FROM hr_attendance_correction_requests
       WHERE company_id=$1 AND user_id=$2 AND status='pending'`,
      [companyId, userId]
    ).catch(() => ({ rows: [{ cnt: 0 }] }));

    res.json({
      data: {
        profile: profile.rows[0] || null,
        attendance: { ...attRow, pending_corrections: pendingCorr.rows[0]?.cnt || 0 },
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
    const month     = parseInt(req.query.month, 10) || new Date().getMonth() + 1;
    const year      = parseInt(req.query.year,  10) || new Date().getFullYear();
    const userId    = ownUser(req);
    const companyId = ownCompany(req);

    // ESSL attendance records, with approved leave overlaid:
    // - If ESSL recorded absent/half_day but there's an approved leave for that date → show as 'leave'
    // - If there's an approved leave date with no ESSL record at all → synthesise a 'leave' row
    const { rows: attRows } = await query(`
      SELECT
        a.id,
        a.attendance_date,
        CASE
          WHEN lr.id IS NOT NULL AND a.status IN ('absent','half_day') THEN 'leave'
          ELSE a.status
        END                      AS status,
        a.in_time,
        a.out_time,
        a.late_minutes,
        a.early_exit_minutes,
        a.source,
        a.remarks,
        lt.name                  AS leave_type_name,
        lr.id                    AS leave_request_id
      FROM hr_attendance a
      LEFT JOIN hr_leave_requests lr
        ON  lr.user_id    = a.user_id
        AND lr.company_id = a.company_id
        AND lr.status     = 'approved'
        AND a.attendance_date BETWEEN lr.from_date AND lr.to_date
      LEFT JOIN hr_leave_types lt ON lt.id = lr.leave_type_id
      WHERE a.company_id = $1
        AND a.user_id    = $2
        AND EXTRACT(MONTH FROM a.attendance_date) = $3
        AND EXTRACT(YEAR  FROM a.attendance_date) = $4
    `, [companyId, userId, month, year]);

    // Also add approved-leave days that have no ESSL record (pre-approved or holiday coverage)
    const { rows: leaveOnlyRows } = await query(`
      SELECT DISTINCT
        NULL::uuid               AS id,
        d::date                  AS attendance_date,
        'leave'                  AS status,
        NULL::time               AS in_time,
        NULL::time               AS out_time,
        0                        AS late_minutes,
        0                        AS early_exit_minutes,
        'leave_request'          AS source,
        lr.reason                AS remarks,
        lt.name                  AS leave_type_name,
        lr.id                    AS leave_request_id
      FROM hr_leave_requests lr
      JOIN hr_leave_types lt ON lt.id = lr.leave_type_id
      CROSS JOIN generate_series(lr.from_date, lr.to_date, '1 day'::interval) d
      WHERE lr.company_id = $1
        AND lr.user_id    = $2
        AND lr.status     = 'approved'
        AND EXTRACT(MONTH FROM d) = $3
        AND EXTRACT(YEAR  FROM d) = $4
    `, [companyId, userId, month, year]);

    // Merge: ESSL records take precedence; add leave-only rows for dates not already covered
    const coveredDates = new Set(attRows.map(r => String(r.attendance_date).slice(0, 10)));
    const extras = leaveOnlyRows.filter(r => !coveredDates.has(String(r.attendance_date).slice(0, 10)));
    const combined = [...attRows, ...extras].sort((a, b) =>
      String(b.attendance_date).localeCompare(String(a.attendance_date))
    );

    res.json({ data: combined });
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

    // Notify HR about new correction request
    const empName = req.user.name || req.user.email;
    notifyHR(ownCompany(req),
      `Attendance Correction Request: ${empName} — ${fmtDate(attendance_date)}`,
      mailWrap(
        mailHeader('Attendance Correction Request'),
        `<p style="margin-top:0"><strong>${empName}</strong> has submitted an attendance correction request.</p>
        <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:14px">
          ${mailRow('Employee', empName)}
          ${mailRow('Date', fmtDate(attendance_date))}
          ${mailRow('Requested Status', requested_status || '—')}
          ${mailRow('In Time', requested_in_time || '—')}
          ${mailRow('Out Time', requested_out_time || '—')}
          ${mailRow('Reason', reason)}
        </table>
        <p>Please review and action this request in the <a href="${ERP_URL}/ess-portal" style="color:#1e3a5f;font-weight:600">ESS Manager Desk</a>.</p>`
      )
    );
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

    if (types.length) {
      await query(
        `INSERT INTO hr_leave_balances (user_id, leave_type_id, year, accrued, closing_balance)
         SELECT $1, lid, $2, dpd, dpd
         FROM unnest($3::uuid[], $4::numeric[]) AS u(lid, dpd)
         ON CONFLICT (user_id, leave_type_id, year) DO NOTHING`,
        [ownUser(req), year, types.map(t => t.id), types.map(t => t.days_per_year)]
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
    const type = await query(`SELECT is_paid, name FROM hr_leave_types WHERE id = $1 AND company_id = $2`, [leave_type_id, ownCompany(req)]);
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

    // Notify HR about new leave application
    const leaveTypeName = type.rows[0]?.name || 'Leave';
    const empName = req.user.name || req.user.email;
    notifyHR(
      `Leave Request: ${empName} — ${leaveTypeName} (${fmtDate(from_date)} to ${fmtDate(to_date)})`,
      mailWrap(
        mailHeader('New Leave Request'),
        `<p style="margin-top:0"><strong>${empName}</strong> has applied for leave.</p>
        <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:14px">
          ${mailRow('Employee', empName)}
          ${mailRow('Leave Type', leaveTypeName)}
          ${mailRow('From', fmtDate(from_date))}
          ${mailRow('To', fmtDate(to_date))}
          ${mailRow('Days', half_day ? '0.5 (Half Day)' : days)}
          ${mailRow('Reason', reason || '—')}
        </table>
        <p>Please review and action this request in the <a href="${ERP_URL}/ess-portal" style="color:#1e3a5f;font-weight:600">ESS Manager Desk</a>.</p>`
      )
    );
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
       ORDER BY lr.applied_at DESC
       LIMIT 200`,
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

      const leaveDates = [];
      const cur = new Date(leave.from_date);
      const toD = new Date(leave.to_date);
      while (cur <= toD) {
        if (WORK_WEEK_DAYS.includes(cur.getDay())) leaveDates.push(cur.toISOString().slice(0, 10));
        cur.setDate(cur.getDate() + 1);
      }
      if (leaveDates.length) {
        await client.query(
          `INSERT INTO hr_attendance (user_id, company_id, attendance_date, status, leave_request_id, source, remarks)
           SELECT $1, $2, d::date, 'leave', $3, 'ess_leave', 'Approved leave'
           FROM unnest($4::date[]) AS d
           ON CONFLICT (user_id, attendance_date)
           DO UPDATE SET status='leave', leave_request_id=$3, source='ess_leave', remarks='Approved leave'`,
          [leave.user_id, leave.company_id, leave.id, leaveDates]
        );
      }
    }

    await client.query('COMMIT');
    res.json({ data: leave });

    // Notify employee of leave decision
    const ltRes = await query(`SELECT name FROM hr_leave_types WHERE id=$1`, [leave.leave_type_id]).catch(() => ({ rows: [] }));
    const ltName = ltRes.rows[0]?.name || 'Leave';
    const actionWord = action === 'approve' ? 'Approved' : 'Rejected';
    const accentColor = action === 'approve' ? '#16a34a' : '#dc2626';
    notifyEmployee(leave.user_id, leave.company_id,
      `Your ${ltName} request has been ${actionWord}`,
      mailWrap(
        `<div style="background:${accentColor};padding:18px 28px;border-radius:8px 8px 0 0"><h2 style="color:#fff;margin:0;font-size:17px">Leave Request ${actionWord}</h2></div>`,
        `<p style="margin-top:0">Your leave request has been <strong>${actionWord.toLowerCase()}</strong>.</p>
        <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:14px">
          ${mailRow('Leave Type', ltName)}
          ${mailRow('From', fmtDate(leave.from_date))}
          ${mailRow('To', fmtDate(leave.to_date))}
          ${mailRow('Days', leave.days)}
          ${mailRow('Status', statusBadge(action === 'approve' ? 'approved' : 'rejected'))}
          ${leave.rejection_reason ? mailRow('Reason', leave.rejection_reason) : ''}
        </table>
        <p>View your leave history in the <a href="${ERP_URL}/ess-portal" style="color:#1e3a5f;font-weight:600">ESS Portal</a>.</p>`
      )
    );
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
       ORDER BY cr.created_at DESC
       LIMIT 200`,
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

    // Notify employee of correction decision
    const corrActionWord = action === 'approve' ? 'Approved' : 'Rejected';
    const corrAccent = action === 'approve' ? '#16a34a' : '#dc2626';
    notifyEmployee(correction.user_id, correction.company_id,
      `Your attendance correction for ${fmtDate(correction.attendance_date)} has been ${corrActionWord}`,
      mailWrap(
        `<div style="background:${corrAccent};padding:18px 28px;border-radius:8px 8px 0 0"><h2 style="color:#fff;margin:0;font-size:17px">Attendance Correction ${corrActionWord}</h2></div>`,
        `<p style="margin-top:0">Your attendance correction request has been <strong>${corrActionWord.toLowerCase()}</strong>.</p>
        <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:14px">
          ${mailRow('Date', fmtDate(correction.attendance_date))}
          ${mailRow('Requested Status', correction.requested_status || '—')}
          ${mailRow('In Time', correction.requested_in_time || '—')}
          ${mailRow('Out Time', correction.requested_out_time || '—')}
          ${mailRow('Status', statusBadge(action === 'approve' ? 'approved' : 'rejected'))}
          ${correction.rejection_reason ? mailRow('Reason', correction.rejection_reason) : ''}
        </table>
        <p>View your attendance in the <a href="${ERP_URL}/ess-portal" style="color:#1e3a5f;font-weight:600">ESS Portal</a>.</p>`
      )
    );
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

// ── Recent biometric swipes from ESSL device logs ────────────────────────────
router.get('/swipes', async (req, res) => {
  try {
    const userId    = ownUser(req);
    const companyId = ownCompany(req);
    const days      = Math.min(parseInt(req.query.days, 10) || 30, 90);

    // Get the logged-in user's employee_code
    const userRow = await query(
      `SELECT employee_code FROM users WHERE id = $1 AND company_id = $2`,
      [userId, companyId]
    );
    const empCode = userRow.rows[0]?.employee_code;
    if (!empCode) return res.json({ data: [] });

    const { rows } = await query(
      `SELECT swipe_time, direction, source
       FROM essl_device_logs
       WHERE company_id = $1
         AND LOWER(TRIM(emp_code)) = LOWER(TRIM($2))
         AND swipe_time >= NOW() - ($3 || ' days')::interval
       ORDER BY swipe_time DESC
       LIMIT 200`,
      [companyId, empCode, days]
    );
    res.json({ data: rows });
  } catch (err) {
    // essl_device_logs may not exist on setups without ESSL integration
    if (err.message?.includes('does not exist')) return res.json({ data: [] });
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
       WHERE user_id = $1 AND company_id = $2
       ORDER BY uploaded_at DESC`,
      [ownUser(req), ownCompany(req)]
    );
    res.json({ data: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/documents', upload.single('file'), async (req, res) => {
  try {
    const { doc_type = 'employee_document', doc_name } = req.body;
    if (!req.file) return res.status(400).json({ error: 'Document file is required' });
    const fileUrl = `/uploads/hr-docs/${req.file.filename}`;

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

// ── Team-today widgets ───────────────────────────────────────────────────────
// "On leave today" and "birthdays today" are people-directory data, so they're
// gated to HR roles + super_admin. The next company holiday is public and
// returned for everyone.
const HR_VIEW_ROLES = ['super_admin', 'admin', 'hr', 'hr_admin', 'hr_manager'];
router.get('/team-today', async (req, res) => {
  try {
    const companyId = ownCompany(req);
    const isHrView = HR_VIEW_ROLES.includes(String(req.user.role || '').toLowerCase());

    const nextHoliday = await query(
      `SELECT name, holiday_date FROM hr_holidays
       WHERE company_id = $1 AND holiday_date >= CURRENT_DATE
       ORDER BY holiday_date ASC LIMIT 1`,
      [companyId]
    ).catch(() => ({ rows: [] }));

    let onLeaveToday = [];
    let birthdaysToday = [];
    if (isHrView) {
      const leave = await query(
        `SELECT u.name, lt.name AS leave_type
         FROM hr_leave_requests lr
         JOIN users u ON u.id = lr.user_id
         LEFT JOIN hr_leave_types lt ON lt.id = lr.leave_type_id
         WHERE lr.company_id = $1 AND lr.status = 'approved'
           AND CURRENT_DATE BETWEEN lr.from_date AND lr.to_date
         ORDER BY u.name LIMIT 12`,
        [companyId]
      ).catch(() => ({ rows: [] }));
      onLeaveToday = leave.rows;

      const bdays = await query(
        `SELECT u.name
         FROM employee_profiles ep
         JOIN users u ON u.id = ep.user_id
         WHERE ep.company_id = $1 AND u.is_active = true
           AND ep.date_of_birth IS NOT NULL
           AND EXTRACT(MONTH FROM ep.date_of_birth) = EXTRACT(MONTH FROM CURRENT_DATE)
           AND EXTRACT(DAY   FROM ep.date_of_birth) = EXTRACT(DAY   FROM CURRENT_DATE)
         ORDER BY u.name LIMIT 12`,
        [companyId]
      ).catch(() => ({ rows: [] }));
      birthdaysToday = bdays.rows;
    }

    res.json({ data: { is_hr_view: isHrView, on_leave_today: onLeaveToday, birthdays_today: birthdaysToday, next_holiday: nextHoliday.rows[0] || null } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Profile photo ────────────────────────────────────────────────────────────
// Stored as a base64 data URI in employee_profiles.profile_photo_url (same
// pattern as signature_url), so it renders directly in an <img> without hitting
// the JWT-protected /uploads static route. The client downscales before upload,
// but we still cap the payload here as a safety net.
router.post('/profile/photo', async (req, res) => {
  try {
    const { photo } = req.body || {};
    if (!photo || typeof photo !== 'string' || !/^data:image\/(png|jpe?g|webp|gif);base64,/i.test(photo)) {
      return res.status(400).json({ error: 'A valid image is required.' });
    }
    // base64 adds ~33% overhead; this cap corresponds to ~1.5 MB of actual image data
    if (photo.length > Math.ceil(2 * 1024 * 1024 * 4 / 3)) {
      return res.status(400).json({ error: 'Image is too large. Please choose a smaller photo.' });
    }
    const { rows } = await query(
      `INSERT INTO employee_profiles (user_id, company_id, profile_photo_url, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (user_id) DO UPDATE
         SET profile_photo_url = EXCLUDED.profile_photo_url, updated_at = NOW()
       RETURNING profile_photo_url`,
      [ownUser(req), ownCompany(req), photo]
    );
    res.json({ data: { profile_photo_url: rows[0].profile_photo_url } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/profile/photo', async (req, res) => {
  try {
    await query(
      `UPDATE employee_profiles SET profile_photo_url = NULL, updated_at = NOW() WHERE user_id = $1 AND company_id = $2`,
      [ownUser(req), ownCompany(req)]
    );
    res.json({ data: { profile_photo_url: null } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Full profile including statutory/bank/contact PII — separate from /summary dashboard data.
router.get('/profile/full', async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT u.id, u.name, u.email, u.employee_code, u.role, u.phone,
              dep.name AS department_name, des.name AS designation_name,
              ep.work_location, ep.date_of_joining, ep.date_of_confirmation,
              ep.employment_status, ep.employment_type, ep.employee_category,
              ep.profile_photo_url, ep.gender, ep.date_of_birth, ep.blood_group,
              ep.marital_status, ep.nationality, ep.father_name,
              ep.current_address, ep.permanent_address,
              ep.emergency_contact_name, ep.emergency_contact_phone,
              ep.bank_name, ep.bank_ifsc,
              RIGHT(ep.bank_account_number, 4) AS bank_account_last4,
              ep.pan_number, ep.uan_number, ep.pf_account_number, ep.esi_number,
              mgr.name AS reporting_manager_name
       FROM users u
       LEFT JOIN employee_profiles ep ON ep.user_id = u.id
       LEFT JOIN hr_departments dep ON dep.id = ep.department_id
       LEFT JOIN hr_designations des ON des.id = ep.designation_id
       LEFT JOIN users mgr ON mgr.id = ep.reporting_manager_id
       WHERE u.id = $1 AND u.company_id = $2`,
      [ownUser(req), ownCompany(req)]
    );
    if (!rows.length) return res.status(404).json({ error: 'Profile not found' });
    res.json({ data: rows[0] });
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
    await query(
      `INSERT INTO employee_lifecycle_checklist
       (user_id, company_id, stage, item_key, title, owner_department)
       SELECT $1, $2, u.stage, u.item_key, u.title, u.owner_dept
       FROM unnest($3::text[], $4::text[], $5::text[], $6::text[]) AS u(stage, item_key, title, owner_dept)
       ON CONFLICT (user_id, stage, item_key) DO NOTHING`,
      [ownUser(req), ownCompany(req),
       items.map(i => i.stage), items.map(i => i.item_key),
       items.map(i => i.title), items.map(i => i.owner_department)]
    );

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

router.patch('/onboarding/:id', requireManager, async (req, res) => {
  try {
    const { status = 'completed', remarks } = req.body;
    const { rows } = await query(
      `UPDATE employee_lifecycle_checklist
       SET status = $1,
           remarks = $2,
           completed_at = CASE WHEN $1 = 'completed' THEN NOW() ELSE NULL END,
           completed_by = CASE WHEN $1 = 'completed' THEN $3::uuid ELSE NULL END
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
