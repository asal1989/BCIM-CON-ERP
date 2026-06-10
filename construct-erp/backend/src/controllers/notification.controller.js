// backend/src/controllers/notification.controller.js
const { query } = require('../config/database');
const { sendMail } = require('../services/mail.service');
const { sendPushToUser, sendPushToRole } = require('../services/fcm.service');
const { isBlockedEmail } = require('../config/notification-blocklist');

const FRONTEND_URL = (process.env.PUBLIC_FRONTEND_URL || process.env.FRONTEND_URL || 'http://bcim.ddns.net:3000').replace(/\/$/, '');

/**
 * Resolve email recipients for a notification target.
 * - user_id: that user only
 * - target_role: all active users with that role in the company
 * Returns array of { email, name }.
 */
async function resolveRecipients({ company_id, user_id, target_role }) {
  try {
    if (user_id) {
      const r = await query(
        `SELECT email, name FROM users
         WHERE id = $1 AND company_id = $2 AND is_active = TRUE AND email IS NOT NULL`,
        [user_id, company_id]
      );
      return r.rows;
    }
    if (target_role) {
      const r = await query(
        `SELECT email, name FROM users
         WHERE company_id = $1 AND role = $2 AND is_active = TRUE AND email IS NOT NULL`,
        [company_id, target_role]
      );
      return r.rows;
    }
    return [];
  } catch (err) {
    console.error('[notification] resolveRecipients failed:', err.message);
    return [];
  }
}

function buildEmailHtml({ title, message, link, severity }) {
  const accent = severity === 'critical' ? '#dc2626' : severity === 'warning' ? '#d97706' : '#0a2057';
  const fullLink = link?.startsWith('http') ? link : (link ? `${FRONTEND_URL}${link}` : null);
  return `
    <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;color:#0f172a">
      <div style="background:${accent};padding:18px 28px;border-radius:8px 8px 0 0">
        <h2 style="color:#ffffff;margin:0;font-size:18px">${title}</h2>
      </div>
      <div style="background:#f8fafc;padding:24px 28px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 8px 8px">
        ${message ? `<p style="margin:0 0 16px;color:#334155;line-height:1.5">${message}</p>` : ''}
        ${fullLink ? `<p style="text-align:center;margin:20px 0">
          <a href="${fullLink}" style="display:inline-block;background:${accent};color:#ffffff;text-decoration:none;padding:10px 24px;border-radius:6px;font-weight:600;font-size:14px">
            Open in ConstructERP
          </a>
        </p>` : ''}
        <hr style="border:none;border-top:1px solid #e2e8f0;margin:18px 0">
        <p style="font-size:11px;color:#94a3b8;margin:0">
          This is an automated notification from BCIM ConstructERP. To stop receiving these,
          update your notification preferences in the app.
        </p>
      </div>
    </div>
  `;
}

/**
 * Create one notification. Safe to call from anywhere.
 * @param {object} opts
 *   - company_id (required)
 *   - user_id (optional) - target a specific user
 *   - target_role (optional) - if no user_id, broadcast to a role
 *   - type, title, message, link, severity, related_type, related_id
 *   - sendEmail (optional, default false) - also email the resolved recipient(s)
 */
async function createNotification(opts) {
  // Skip entirely for users on the global notification blocklist
  if (opts.user_id) {
    try {
      const r = await query('SELECT email FROM users WHERE id = $1', [opts.user_id]);
      if (isBlockedEmail(r.rows[0]?.email)) return;
    } catch (_) {}
  }

  try {
    await query(
      `INSERT INTO notifications
        (company_id, user_id, target_role, type, title, message, link, severity, related_type, related_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        opts.company_id, opts.user_id || null, opts.target_role || null,
        opts.type, opts.title, opts.message || null, opts.link || null,
        opts.severity || 'info', opts.related_type || null, opts.related_id || null,
      ]
    );
  } catch (err) {
    // Never let a notification failure break the parent request
    // eslint-disable-next-line no-console
    console.error('[notification] failed to create:', err.message);
  }

  // FCM push notification — fire and forget
  try {
    const pushPayload = {
      title: opts.title,
      body: opts.message || opts.title,
      data: {
        type: opts.type || '',
        link: opts.link || '',
        related_id: opts.related_id || '',
      },
    };
    if (opts.user_id) {
      sendPushToUser(opts.user_id, pushPayload).catch(() => {});
    } else if (opts.target_role) {
      sendPushToRole(opts.company_id, opts.target_role, pushPayload).catch(() => {});
    }
  } catch (_) {}

  // Optional email fan-out — runs after DB insert so a mail failure can't undo the notification
  if (opts.sendEmail) {
    try {
      const recipients = await resolveRecipients(opts);
      if (recipients.length === 0) return;
      const html = buildEmailHtml(opts);
      const text = `${opts.title}\n\n${opts.message || ''}\n\n${opts.link ? `${FRONTEND_URL}${opts.link}` : ''}`;
      // Don't await — fire and forget. Mail can take seconds.
      for (const r of recipients) {
        sendMail({ to: r.email, subject: opts.title, html, text }).catch(err => {
          console.error('[notification] email failed for', r.email, ':', err.message);
        });
      }
    } catch (err) {
      console.error('[notification] email fan-out failed:', err.message);
    }
  }
}

// GET /api/v1/notifications?limit=20&unread_only=true
async function list(req, res) {
  try {
    const { limit = 20, unread_only } = req.query;
    let sql = `
      SELECT * FROM notifications
      WHERE company_id = $1
        AND (user_id = $2 OR target_role = $3 OR (user_id IS NULL AND target_role IS NULL))
    `;
    const params = [req.user.company_id, req.user.id, req.user.role];
    let i = 4;
    if (unread_only === 'true') sql += ` AND is_read = FALSE`;
    sql += ` ORDER BY created_at DESC LIMIT $${i++}`;
    params.push(Math.min(parseInt(limit, 10) || 20, 100));
    const result = await query(sql, params);

    const unreadResult = await query(
      `SELECT COUNT(*)::int AS unread
       FROM notifications
       WHERE company_id = $1
         AND is_read = FALSE
         AND (user_id = $2 OR target_role = $3 OR (user_id IS NULL AND target_role IS NULL))`,
      [req.user.company_id, req.user.id, req.user.role]
    );

    res.json({ data: result.rows, unread: unreadResult.rows[0].unread });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// PATCH /api/v1/notifications/:id/read
async function markRead(req, res) {
  try {
    const result = await query(
      `UPDATE notifications SET is_read = TRUE, read_at = NOW()
       WHERE id = $1 AND company_id = $2
         AND (user_id = $3 OR target_role = $4 OR (user_id IS NULL AND target_role IS NULL))
       RETURNING id`,
      [req.params.id, req.user.company_id, req.user.id, req.user.role]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Notification not found' });
    res.json({ message: 'Marked read' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// POST /api/v1/notifications/mark-all-read
async function markAllRead(req, res) {
  try {
    await query(
      `UPDATE notifications SET is_read = TRUE, read_at = NOW()
       WHERE company_id = $1 AND is_read = FALSE
         AND (user_id = $2 OR target_role = $3 OR (user_id IS NULL AND target_role IS NULL))`,
      [req.user.company_id, req.user.id, req.user.role]
    );
    res.json({ message: 'All marked read' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

module.exports = { createNotification, list, markRead, markAllRead };
