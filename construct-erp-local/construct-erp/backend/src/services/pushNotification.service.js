// src/services/pushNotification.service.js
// Sends push notifications to mobile devices via Expo's push API.
//
// Device tokens are registered by the mobile app at POST /notifications/devices
// and stored in notification_device_tokens (company_id, user_id, platform,
// token, enabled). That table existed for a while with nothing consuming it —
// this service is what actually turns a stored token into a delivered push.
const { Expo } = require('expo-server-sdk');
const { query } = require('../config/database');

const expo = new Expo();

/**
 * Send a push notification to every enabled device registered for the given
 * user ids. Safe to call from anywhere — never throws, matches the pattern
 * of notification.controller.js's createNotification (never let a
 * notification-delivery failure break the caller's request).
 */
async function sendPushToUsers(userIds, { title, body, data = {} }) {
  const ids = [...new Set((userIds || []).filter(Boolean))];
  if (!ids.length) return;

  try {
    const { rows: tokens } = await query(
      `SELECT DISTINCT token FROM notification_device_tokens
       WHERE user_id = ANY($1) AND enabled = TRUE`,
      [ids]
    );
    if (!tokens.length) return;

    const messages = [];
    for (const { token } of tokens) {
      if (!Expo.isExpoPushToken(token)) continue;
      messages.push({ to: token, sound: 'default', title, body, data, priority: 'high' });
    }
    if (!messages.length) return;

    const chunks = expo.chunkPushNotifications(messages);
    for (const chunk of chunks) {
      try {
        const receipts = await expo.sendPushNotificationsAsync(chunk);
        // Drop tokens Expo reports as permanently invalid (app uninstalled, etc.)
        const deadTokens = [];
        receipts.forEach((r, i) => {
          if (r.status === 'error' && r.details?.error === 'DeviceNotRegistered') {
            deadTokens.push(chunk[i].to);
          }
        });
        if (deadTokens.length) {
          await query(`DELETE FROM notification_device_tokens WHERE token = ANY($1)`, [deadTokens]).catch(() => {});
        }
      } catch (err) {
        console.error('[push] chunk send failed:', err.message);
      }
    }
  } catch (err) {
    console.error('[push] sendPushToUsers failed:', err.message);
  }
}

/**
 * Push to every active user with the given role(s) in a company — mirrors
 * how createNotification resolves target_role for email/in-app.
 */
async function sendPushToRole(company_id, role, payload) {
  try {
    const { rows } = await query(
      `SELECT id FROM users WHERE company_id = $1 AND role = $2 AND is_active = TRUE`,
      [company_id, role]
    );
    await sendPushToUsers(rows.map(r => r.id), payload);
  } catch (err) {
    console.error('[push] sendPushToRole failed:', err.message);
  }
}

module.exports = { sendPushToUsers, sendPushToRole };
