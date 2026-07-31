// backend/src/config/notification-blocklist.js
// Email addresses blocked from most ERP notifications/alerts (mail, push,
// in-app) — EXCEPT the categories listed for that address, which still get
// through. E.g. krishna/srinivasa are blocked from everything except
// notifications about their OWN attendance, leave, and regularization
// requests (late-arrival alerts, leave approved/rejected, attendance
// correction decisions) — company-wide HR digests and every other alert
// type remain blocked for them.
//
// Add a fully-blocked (no exceptions) address via NOTIFY_BLOCKED_EMAILS env
// var (comma-separated). Edit BLOCKED_EMAILS below for a partial block.

const PERSONAL_ATTENDANCE_CATEGORIES = ['attendance', 'leave', 'regularization'];

const BLOCKED_EMAILS = {
  'krishna@bcim.in':   PERSONAL_ATTENDANCE_CATEGORIES,
  'srinivasa@bcim.in': PERSONAL_ATTENDANCE_CATEGORIES,
};

for (const email of (process.env.NOTIFY_BLOCKED_EMAILS || '')
  .split(',').map(e => e.trim().toLowerCase()).filter(Boolean)) {
  if (!(email in BLOCKED_EMAILS)) BLOCKED_EMAILS[email] = [];
}

/**
 * @param {string} email
 * @param {string} [category] — pass the notification's category (e.g.
 *   'attendance', 'leave', 'regularization') so an address with a partial
 *   block can still receive that category. Omitting it blocks everything
 *   for a listed address — callers must explicitly opt each event into a
 *   category rather than it being allowed by default.
 * @returns {boolean} true if this email must NOT receive this notification.
 */
function isBlockedEmail(email, category) {
  if (!email) return false;
  const key = String(email).trim().toLowerCase();
  if (!(key in BLOCKED_EMAILS)) return false;
  const allowed = BLOCKED_EMAILS[key];
  return !(category && allowed.includes(category));
}

module.exports = { BLOCKED_EMAILS, isBlockedEmail };
