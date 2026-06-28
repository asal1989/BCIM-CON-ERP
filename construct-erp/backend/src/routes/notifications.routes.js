// src/routes/notifications.routes.js
// Aggregates live alerts from existing tables + persistent notifications.
const express = require('express');
const { authenticate } = require('../middleware/auth');
const { query } = require('../config/database');
const persistedCtrl = require('../controllers/notification.controller');
const { getVendorLiabilitySummary } = require('../services/tqsLiability.service');
const { runSchemaInit } = require('../utils/schemaInit');
const { sendPushToUser } = require('../services/fcm.service');
const router = express.Router();
router.use(authenticate);

runSchemaInit('notification-devices', async () => {
  await query(`
    CREATE TABLE IF NOT EXISTS notification_device_tokens (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id UUID REFERENCES companies(id),
      user_id UUID REFERENCES users(id),
      platform TEXT,
      token TEXT NOT NULL,
      enabled BOOLEAN DEFAULT TRUE,
      last_seen_at TIMESTAMPTZ DEFAULT NOW(),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(user_id, token)
    )
  `);
});

// ── Persistent notifications (table-backed) ──────────────────────────────────
router.get('/persistent', persistedCtrl.list);
router.patch('/:id/read', persistedCtrl.markRead);
router.post('/mark-all-read', persistedCtrl.markAllRead);

router.post('/devices', async (req, res) => {
  try {
    const { token, platform = 'android', enabled = true } = req.body;
    if (!token) return res.status(400).json({ error: 'Device token is required' });
    const { rows } = await query(
      `INSERT INTO notification_device_tokens (company_id, user_id, platform, token, enabled, last_seen_at)
       VALUES ($1,$2,$3,$4,$5,NOW())
       ON CONFLICT (user_id, token)
       DO UPDATE SET platform=$3, enabled=$5, last_seen_at=NOW()
       RETURNING id, platform, enabled, last_seen_at`,
      [req.user.company_id, req.user.id, platform, token, Boolean(enabled)]
    );
    res.status(201).json({ data: rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Test push — sends a real FCM notification to the calling user's devices ──
// GET /notifications/test-push  → diagnostic (shows config status + token count)
// POST /notifications/test-push → actually sends a test notification
router.get('/test-push', async (req, res) => {
  try {
    const fcmConfigured = !!process.env.FIREBASE_SERVICE_ACCOUNT;
    const { rows } = await query(
      `SELECT id, platform, LEFT(token,20)||'…' AS token_preview, enabled, last_seen_at
       FROM notification_device_tokens WHERE user_id=$1`,
      [req.user.id]
    );
    res.json({
      fcm_configured: fcmConfigured,
      registered_devices: rows.length,
      devices: rows,
      hint: fcmConfigured
        ? 'FCM is configured. POST to this endpoint to send a test push.'
        : 'FIREBASE_SERVICE_ACCOUNT env var is NOT set — pushes are disabled. Add it in Railway → Variables.',
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/test-push', async (req, res) => {
  try {
    if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
      return res.status(503).json({
        error: 'FIREBASE_SERVICE_ACCOUNT env var is not set on the server. Add your Firebase service account JSON as this variable in Railway → Variables, then redeploy.',
      });
    }
    const { rows } = await query(
      'SELECT COUNT(*) FROM notification_device_tokens WHERE user_id=$1 AND enabled=TRUE',
      [req.user.id]
    );
    const deviceCount = parseInt(rows[0].count);
    if (deviceCount === 0) {
      return res.status(404).json({
        error: 'No registered devices for your account. Open the ERP app on your phone — the device registers automatically on login.',
      });
    }
    await sendPushToUser(req.user.id, {
      title: '🔔 BCIM ERP — Test Notification',
      body: `Push notifications are working! Sent at ${new Date().toLocaleTimeString('en-IN')}.`,
      data: { link: '/dashboard' },
    });
    res.json({ sent: true, device_count: deviceCount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Helper: safe count query — returns 0 on missing table / column
async function safeCount(sql, params) {
  try {
    const r = await query(sql, params);
    return parseInt(r.rows[0]?.count || 0);
  } catch (_) { return 0; }
}

// Helper: safe rows query
async function safeRows(sql, params) {
  try {
    const r = await query(sql, params);
    return r.rows;
  } catch (_) { return []; }
}

// GET /notifications  — live alert feed for the logged-in company
router.get('/', async (req, res) => {
  try {
    const cid = req.user.company_id;
    const items = [];

    // ── 1. GRNs pending stores verification ──────────────────────────────────
    const pendingGrns = await safeCount(
      `SELECT COUNT(*) FROM grn g
       JOIN projects p ON g.project_id = p.id
       WHERE p.company_id = $1 AND g.quality_status = 'pending'`,
      [cid]
    );
    if (pendingGrns > 0) {
      items.push({
        id: 'grn-pending',
        type: 'grn',
        severity: 'warning',
        icon: 'package',
        title: `${pendingGrns} GRN${pendingGrns > 1 ? 's' : ''} Awaiting Verification`,
        body: 'Stores team needs to verify receipt',
        link: '/stores/grn',
        category: 'Stores',
      });
    }

    // ── 2. GRNs stores-verified but not QC-approved ───────────────────────────
    const verifiedGrns = await safeCount(
      `SELECT COUNT(*) FROM grn g
       JOIN projects p ON g.project_id = p.id
       WHERE p.company_id = $1 AND g.quality_status = 'verified_stores'`,
      [cid]
    );
    if (verifiedGrns > 0) {
      items.push({
        id: 'grn-verified',
        type: 'grn',
        severity: 'info',
        icon: 'package-check',
        title: `${verifiedGrns} GRN${verifiedGrns > 1 ? 's' : ''} Pending Final Approval`,
        body: 'Verified by stores — awaiting QC / accounts approval',
        link: '/stores/grn',
        category: 'Stores',
      });
    }

    // ── 3. Out-of-stock materials ─────────────────────────────────────────────
    const outOfStock = await safeCount(
      `SELECT COUNT(*) FROM inventory i
       JOIN projects p ON i.project_id = p.id
       WHERE p.company_id = $1 AND i.closing_stock <= 0`,
      [cid]
    );
    if (outOfStock > 0) {
      items.push({
        id: 'stock-zero',
        type: 'stock',
        severity: 'error',
        icon: 'alert-triangle',
        title: `${outOfStock} Material${outOfStock > 1 ? 's' : ''} Out of Stock`,
        body: 'Closing stock is zero — raise MRS or GRN immediately',
        link: '/stores/ledger',
        category: 'Stores',
      });
    }

    // ── 4. Pending vendor invoices ────────────────────────────────────────────
    const pendingInvoices = await safeCount(
      `SELECT COUNT(*) FROM invoices i
       JOIN projects p ON i.project_id = p.id
       WHERE p.company_id = $1 AND i.status IN ('pending','submitted')`,
      [cid]
    );
    if (pendingInvoices > 0) {
      items.push({
        id: 'invoice-pending',
        type: 'invoice',
        severity: 'warning',
        icon: 'file-text',
        title: `${pendingInvoices} Invoice${pendingInvoices > 1 ? 's' : ''} Pending Approval`,
        body: 'Vendor invoices awaiting verification / authorization',
        link: '/finance/invoices',
        category: 'Finance',
      });
    }

    // ── 5. Pending MRS (material requisitions) ────────────────────────────────
    const pendingMrs = await safeCount(
      `SELECT COUNT(*) FROM material_requisitions m
       JOIN projects p ON m.project_id = p.id
       WHERE p.company_id = $1 AND m.status = 'pending'`,
      [cid]
    );
    if (pendingMrs > 0) {
      items.push({
        id: 'mrs-pending',
        type: 'mrs',
        severity: 'info',
        icon: 'clipboard-list',
        title: `${pendingMrs} Material Requisition${pendingMrs > 1 ? 's' : ''} Pending`,
        body: 'MRS raised by site — awaiting stores / procurement action',
        link: '/stores/mrs',
        category: 'Stores',
      });
    }

    // ── 6. Pending leave requests ─────────────────────────────────────────────
    const pendingLeaves = await safeCount(
      `SELECT COUNT(*) FROM hr_leave_requests hl
       JOIN users u ON hl.user_id = u.id
       WHERE u.company_id = $1 AND hl.status = 'pending'`,
      [cid]
    );
    if (pendingLeaves > 0) {
      items.push({
        id: 'leave-pending',
        type: 'leave',
        severity: 'info',
        icon: 'calendar-off',
        title: `${pendingLeaves} Leave Request${pendingLeaves > 1 ? 's' : ''} Pending`,
        body: 'Employee leave applications awaiting approval',
        link: '/hr-admin/leaves',
        category: 'HR',
      });
    }

    // ── 7. Open IT support tickets ────────────────────────────────────────────
    const openTickets = await safeCount(
      `SELECT COUNT(*) FROM it_tickets t
       JOIN users u ON t.raised_by = u.id
       WHERE u.company_id = $1 AND t.status IN ('open','in_progress')`,
      [cid]
    );
    if (openTickets > 0) {
      items.push({
        id: 'tickets-open',
        type: 'ticket',
        severity: 'info',
        icon: 'ticket',
        title: `${openTickets} Help Desk Ticket${openTickets > 1 ? 's' : ''} Open`,
        body: 'IT support tickets awaiting resolution',
        link: '/it/tickets',
        category: 'IT',
      });
    }

    // ── 8. Expiring permits (within 3 days) ───────────────────────────────────
    const expiringPermits = await safeCount(
      `SELECT COUNT(*) FROM permits pt
       JOIN projects p ON pt.project_id = p.id
       WHERE p.company_id = $1
         AND pt.status = 'approved'
         AND pt.valid_to BETWEEN NOW() AND NOW() + INTERVAL '3 days'`,
      [cid]
    );
    if (expiringPermits > 0) {
      items.push({
        id: 'permits-expiring',
        type: 'permit',
        severity: 'error',
        icon: 'key',
        title: `${expiringPermits} Work Permit${expiringPermits > 1 ? 's' : ''} Expiring Soon`,
        body: 'Permits expiring within 3 days — renew before work stops',
        link: '/hse/permits',
        category: 'HSE',
      });
    }

    // ── 9. Open snags ─────────────────────────────────────────────────────────
    const openSnags = await safeRows(
      `SELECT COUNT(*) AS count
       FROM snag_items si
       JOIN projects p ON si.project_id = p.id
       WHERE p.company_id = $1 AND si.status IN ('open','in_progress')`,
      [cid]
    );
    const snagCount = parseInt(openSnags[0]?.count || 0);
    if (snagCount > 0) {
      items.push({
        id: 'snags-open',
        type: 'snag',
        severity: 'warning',
        icon: 'hammer',
        title: `${snagCount} Open Snag${snagCount > 1 ? 's' : ''}`,
        body: 'Quality snags not yet resolved on site',
        link: '/quality/snags',
        category: 'Quality',
      });
    }

    // ── 10. POs with no delivery (overdue) ────────────────────────────────────
    const overduePOs = await safeCount(
      `SELECT COUNT(*) FROM purchase_orders po
       JOIN projects p ON po.project_id = p.id
       WHERE p.company_id = $1
         AND po.status NOT IN ('closed','cancelled')
         AND po.delivery_date < NOW() - INTERVAL '1 day'`,
      [cid]
    );
    if (overduePOs > 0) {
      items.push({
        id: 'po-overdue',
        type: 'po',
        severity: 'error',
        icon: 'truck',
        title: `${overduePOs} Purchase Order${overduePOs > 1 ? 's' : ''} Overdue`,
        body: 'Expected delivery date has passed — follow up with vendor',
        link: '/procurement/po',
        category: 'Procurement',
      });
    }

    // ── 11. Persisted notifications targeted at this user/role ──────────────
    const liabilityRows = await getVendorLiabilitySummary({ companyId: cid }).catch(() => []);
    const liabilityOver90 = liabilityRows.filter(r => Number(r.payable_90_plus || 0) > 0);
    if (liabilityOver90.length > 0) {
      const amount = liabilityOver90.reduce((sum, r) => sum + Number(r.payable_90_plus || 0), 0);
      items.push({
        id: 'liability-over90',
        type: 'liability',
        severity: 'error',
        icon: 'alert-triangle',
        title: `${liabilityOver90.length} Vendor Liabilit${liabilityOver90.length > 1 ? 'ies' : 'y'} Over 90 Days`,
        body: `90+ days payable Rs ${Math.round(amount).toLocaleString('en-IN')} - review Liability Register`,
        link: '/tqs/liability-register',
        category: 'Bill Tracker',
      });
    }

    const persistedRows = await safeRows(
      `SELECT * FROM notifications
       WHERE company_id = $1
         AND is_read = FALSE
         AND (user_id = $2 OR target_role = $3 OR (user_id IS NULL AND target_role IS NULL))
       ORDER BY created_at DESC
       LIMIT 30`,
      [cid, req.user.id, req.user.role]
    );
    persistedRows.forEach(n => {
      items.push({
        id: `persist-${n.id}`,
        type: n.type,
        severity: n.severity || 'info',
        icon: n.severity === 'critical' ? 'alert-triangle' : 'bell',
        title: n.title,
        body: n.message,
        link: n.link,
        category: n.type === 'liability_aging' ? 'Bill Tracker' : 'Subcontractor',
        persisted_id: n.id,
        created_at: n.created_at,
      });
    });

    res.json({ count: items.length, items });
  } catch (err) {
    console.error('Notifications error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
