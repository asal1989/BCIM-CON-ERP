// backend/src/config/notification-blocklist.js
// Email addresses that must never receive ERP notifications/alerts (mail or push).
// Override/extend via the NOTIFY_BLOCKED_EMAILS env var (comma-separated).

const BLOCKED_EMAILS = new Set(
  (process.env.NOTIFY_BLOCKED_EMAILS || 'krishna@bcim.in,srinivasa@bcim.in')
    .split(',')
    .map(e => e.trim().toLowerCase())
    .filter(Boolean)
);

const isBlockedEmail = (email) =>
  !!email && BLOCKED_EMAILS.has(String(email).trim().toLowerCase());

module.exports = { BLOCKED_EMAILS, isBlockedEmail };
