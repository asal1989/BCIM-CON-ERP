// backend/src/services/fcm.service.js
// Firebase Cloud Messaging — sends push notifications to registered Android devices
const { query } = require('../config/database');
const { isBlockedEmail, BLOCKED_EMAILS } = require('../config/notification-blocklist');

let _admin = null;
let _initAttempted = false;

function getAdmin() {
  if (_initAttempted) return _admin;
  _initAttempted = true;

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) {
    console.warn('[FCM] FIREBASE_SERVICE_ACCOUNT env var not set — push notifications disabled');
    return null;
  }

  try {
    const admin = require('firebase-admin');
    if (!admin.apps.length) {
      const serviceAccount = JSON.parse(raw);
      admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
      console.log('[FCM] Firebase Admin SDK initialized ✓');
    }
    _admin = admin;
    return _admin;
  } catch (err) {
    console.error('[FCM] Firebase init failed:', err.message);
    return null;
  }
}

/** Convert any data object to all-string values (FCM requirement) */
function stringifyData(data = {}) {
  const out = {};
  for (const [k, v] of Object.entries(data)) {
    out[k] = v == null ? '' : String(v);
  }
  return out;
}

/** Remove stale/invalid FCM tokens from the DB */
async function cleanInvalidToken(userId, token) {
  try {
    await query(
      'DELETE FROM notification_device_tokens WHERE user_id=$1 AND token=$2',
      [userId, token]
    );
  } catch (_) {}
}

const INVALID_TOKEN_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
  'messaging/invalid-argument',
]);

/**
 * Send push notification to ALL registered devices of a specific user.
 * @param {string} userId
 * @param {{ title: string, body: string, data?: object }} payload
 */
async function sendPushToUser(userId, payload) {
  const admin = getAdmin();
  if (!admin || !userId) return;

  try {
    const { rows } = await query(
      `SELECT t.token FROM notification_device_tokens t
       JOIN users u ON u.id = t.user_id
       WHERE t.user_id=$1 AND t.enabled=TRUE
         AND (u.email IS NULL OR LOWER(u.email) <> ALL($2::text[]))`,
      [userId, [...BLOCKED_EMAILS]]
    );
    if (!rows.length) return;

    const data = stringifyData(payload.data);
    const results = await Promise.allSettled(
      rows.map(({ token }) =>
        admin.messaging().send({
          token,
          notification: { title: payload.title, body: payload.body },
          data,
          android: {
            priority: 'high',
            notification: { channelId: 'erp-alerts', priority: 'high' },
          },
        })
      )
    );

    for (let i = 0; i < results.length; i++) {
      if (results[i].status === 'rejected') {
        const code = results[i].reason?.errorInfo?.code;
        if (INVALID_TOKEN_CODES.has(code)) {
          cleanInvalidToken(userId, rows[i].token);
        }
      }
    }
  } catch (err) {
    console.error('[FCM] sendPushToUser error:', err.message);
  }
}

/**
 * Send push notification to users found by their email addresses.
 * @param {string} companyId
 * @param {string[]} emails
 * @param {{ title: string, body: string, data?: object }} payload
 */
async function sendPushToUsersByEmail(companyId, emails, payload) {
  const admin = getAdmin();
  const filteredEmails = emails.filter(e => !isBlockedEmail(e));
  if (!admin || !filteredEmails.length) return;

  try {
    const { rows } = await query(
      `SELECT t.token, t.user_id
       FROM notification_device_tokens t
       JOIN users u ON t.user_id = u.id
       WHERE u.company_id = $1
         AND LOWER(u.email) = ANY($2::text[])
         AND u.is_active = TRUE
         AND t.enabled = TRUE`,
      [companyId, filteredEmails.map(e => e.toLowerCase())]
    );
    if (!rows.length) return;

    const data = stringifyData(payload.data);
    await Promise.allSettled(
      rows.map(({ token }) =>
        admin.messaging().send({
          token,
          notification: { title: payload.title, body: payload.body },
          data,
          android: {
            priority: 'high',
            notification: { channelId: 'erp-alerts', priority: 'high' },
          },
        })
      )
    );
  } catch (err) {
    console.error('[FCM] sendPushToUsersByEmail error:', err.message);
  }
}

/**
 * Send push notification to all active users with a specific role in the company.
 * @param {string} companyId
 * @param {string} role
 * @param {{ title: string, body: string, data?: object }} payload
 */
async function sendPushToRole(companyId, role, payload) {
  const admin = getAdmin();
  if (!admin) return;

  try {
    const { rows } = await query(
      `SELECT t.token
       FROM notification_device_tokens t
       JOIN users u ON t.user_id = u.id
       WHERE u.company_id = $1 AND u.role = $2
         AND u.is_active = TRUE AND t.enabled = TRUE
         AND (u.email IS NULL OR LOWER(u.email) <> ALL($3::text[]))`,
      [companyId, role, [...BLOCKED_EMAILS]]
    );
    if (!rows.length) return;

    const data = stringifyData(payload.data);
    await Promise.allSettled(
      rows.map(({ token }) =>
        admin.messaging().send({
          token,
          notification: { title: payload.title, body: payload.body },
          data,
          android: {
            priority: 'high',
            notification: { channelId: 'erp-alerts', priority: 'high' },
          },
        })
      )
    );
  } catch (err) {
    console.error('[FCM] sendPushToRole error:', err.message);
  }
}

module.exports = { sendPushToUser, sendPushToUsersByEmail, sendPushToRole };
