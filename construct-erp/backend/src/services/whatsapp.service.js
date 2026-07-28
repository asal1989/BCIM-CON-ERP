// src/services/whatsapp.service.js
// Twilio WhatsApp notifications for BCIM Construct ERP
// All functions are fire-and-forget — they never throw and never block the HTTP response.

const { query } = require('../config/database');

// ── Configuration ─────────────────────────────────────────────────────────
const isConfigured = () =>
  Boolean(
    process.env.TWILIO_ACCOUNT_SID &&
    process.env.TWILIO_AUTH_TOKEN &&
    process.env.TWILIO_WHATSAPP_FROM
  );

let _client = null;
const getClient = () => {
  if (!_client) {
    const twilio = require('twilio');
    _client = twilio(
      process.env.TWILIO_ACCOUNT_SID,
      process.env.TWILIO_AUTH_TOKEN
    );
  }
  return _client;
};

const fromNumber = () => `whatsapp:${process.env.TWILIO_WHATSAPP_FROM}`;

// ── Phone normalisation ────────────────────────────────────────────────────
// Accepts 10-digit Indian numbers, +91XXXXXXXXXX, or full E.164
const formatPhone = (phone) => {
  if (!phone) return null;
  const digits = String(phone).replace(/\D/g, '');
  if (digits.length === 10) return `whatsapp:+91${digits}`;
  if (digits.length === 12 && digits.startsWith('91')) return `whatsapp:+${digits}`;
  if (digits.length > 10) return `whatsapp:+${digits}`;
  return null;
};

// Admin numbers come from env: WHATSAPP_ADMIN_NUMBERS=+91XXXXXXXXXX,+91XXXXXXXXXX
const getAdminNumbers = () => {
  const raw = process.env.WHATSAPP_ADMIN_NUMBERS || '';
  return raw
    .split(',')
    .map(n => n.trim())
    .filter(Boolean)
    .map(formatPhone)
    .filter(Boolean);
};

// ── Core send ─────────────────────────────────────────────────────────────
const sendWhatsApp = async (to, body) => {
  if (!isConfigured()) {
    console.log(`[whatsapp] Not configured — skipping. To: ${to}`);
    return;
  }
  try {
    const c = getClient();
    const msg = await c.messages.create({ from: fromNumber(), to, body });
    console.log(`[whatsapp] Sent ${msg.sid} → ${to}`);
  } catch (err) {
    console.error(`[whatsapp] Failed to send to ${to}: ${err.message}`);
  }
};

// Send to multiple recipients (deduped), ignore nulls
const sendToMany = async (phones, body) => {
  const unique = [...new Set(phones.filter(Boolean))];
  if (!unique.length) return;
  await Promise.all(unique.map(p => sendWhatsApp(p, body)));
};

// ── Helper: look up a user's phone ────────────────────────────────────────
const getUserPhone = async (userId) => {
  if (!userId) return null;
  try {
    const { rows } = await query(
      'SELECT phone FROM users WHERE id = $1',
      [userId]
    );
    return rows[0]?.phone ? formatPhone(rows[0].phone) : null;
  } catch {
    return null;
  }
};

// ── Helper: look up phone numbers for everyone holding any of the given
// roles (case-insensitive) at this company. Used to notify "whoever is next
// in an approval chain" without hardcoding a person — add/remove someone
// from that role and notifications follow automatically.
const getPhonesByRole = async (companyId, roles) => {
  if (!companyId || !roles?.length) return [];
  try {
    const { rows } = await query(
      `SELECT phone FROM users
       WHERE company_id = $1 AND phone IS NOT NULL
         AND LOWER(role) = ANY($2::text[])`,
      [companyId, roles.map(r => String(r).toLowerCase())]
    );
    return rows.map(r => formatPhone(r.phone)).filter(Boolean);
  } catch {
    return [];
  }
};

// ── Helper: format INR ─────────────────────────────────────────────────────
const inr = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

// ══════════════════════════════════════════════════════════════════════════
// Event Notifications
// ══════════════════════════════════════════════════════════════════════════

/**
 * Bill moved to a new workflow stage via Advance Stage or manual update.
 */
const notifyBillStageChanged = async ({
  slNumber, vendorName, fromStage, toStage,
  projectName, userId, amount, pcNumber,
}) => {
  const STAGE_LABELS = {
    pending:             '📥 Pending',
    stores:              '🏪 Stores',
    document_controller: '📁 Document Control',
    qs:                  '📐 QS',
    accounts:            '🧾 Accounts',
    procurement:         '📦 Procurement',
    paid:                '✅ Paid',
  };
  const lines = [
    `🏗️ *BCIM DQS — Bill Stage Update*`,
    `Bill: *${slNumber}*`,
    `Vendor: ${vendorName}`,
    `Project: ${projectName || 'N/A'}`,
    `Amount: ${inr(amount)}`,
    `Stage: ${STAGE_LABELS[fromStage] || fromStage} ➜ *${STAGE_LABELS[toStage] || toStage}*`,
  ];
  if (pcNumber) lines.push(`PC Number: ${pcNumber}`);

  const userPhone = await getUserPhone(userId);
  await sendToMany([...getAdminNumbers(), userPhone], lines.join('\n'));
};

/**
 * PC payment processed (one or more bills paid).
 */
const notifyPaymentReceived = async ({
  pcNumber, vendorName, projectName,
  amount, tds, netPaid, utr,
  paymentDate, billCount, userId,
}) => {
  const lines = [
    `💰 *BCIM DQS — Payment Processed*`,
    `PC: *${pcNumber}*`,
    `Vendor: ${vendorName}`,
    `Project: ${projectName || 'N/A'}`,
    `Gross: ${inr(amount)}  |  TDS: ${inr(tds)}  |  Net: ${inr(netPaid)}`,
    `Date: ${paymentDate || 'N/A'}`,
  ];
  if (utr) lines.push(`UTR / Ref: ${utr}`);
  lines.push(`Bills covered: ${billCount}`);

  const userPhone = await getUserPhone(userId);
  await sendToMany([...getAdminNumbers(), userPhone], lines.join('\n'));
};

/**
 * New Purchase Order created.
 */
const notifyPOCreated = async ({
  poNumber, serialNo, vendorName,
  projectName, grandTotal, userId,
}) => {
  const lines = [
    `📋 *BCIM — New Purchase Order*`,
    `PO: *${serialNo || poNumber}*`,
    `Vendor: ${vendorName || 'N/A'}`,
    `Project: ${projectName || 'N/A'}`,
    `Value: ${inr(grandTotal)}`,
    `Status: Pending Approval`,
  ];

  const userPhone = await getUserPhone(userId);
  await sendToMany([...getAdminNumbers(), userPhone], lines.join('\n'));
};

/**
 * Advance payment recorded in DQS Advance Tracker.
 */
const notifyAdvanceCreated = async ({
  voucherNumber, vendorName, projectName,
  amount, paymentDate, woNumber, poNumber, userId,
}) => {
  const ref = woNumber || poNumber || 'N/A';
  const lines = [
    `💸 *BCIM DQS — Advance Recorded*`,
    `Voucher: *${voucherNumber || 'N/A'}*`,
    `Vendor: ${vendorName}`,
    `Project: ${projectName || 'N/A'}`,
    `WO / PO: ${ref}`,
    `Amount: ${inr(amount)}`,
    `Date: ${paymentDate || 'N/A'}`,
  ];

  const userPhone = await getUserPhone(userId);
  await sendToMany([...getAdminNumbers(), userPhone], lines.join('\n'));
};

/**
 * Generic "your approval is needed" ping — notifies EVERYONE holding any of
 * the given roles at this company, not one hardcoded person. Used by any
 * multi-stage approval chain (MRS, SC bills, etc.) right after an item
 * advances to a new stage, so whoever is next finds out immediately.
 */
const notifyApprovalNeeded = async ({
  companyId, allowedRoles, docType, refNo, projectName, extra,
}) => {
  const lines = [
    `📋 *${docType} needs your approval*`,
    `Ref: *${refNo}*`,
    `Project: ${projectName || 'N/A'}`,
  ];
  if (extra) lines.push(extra);

  const phones = await getPhonesByRole(companyId, allowedRoles);
  await sendToMany([...getAdminNumbers(), ...phones], lines.join('\n'));
};

module.exports = {
  isConfigured,
  sendWhatsApp,
  notifyBillStageChanged,
  notifyPaymentReceived,
  notifyPOCreated,
  notifyAdvanceCreated,
  notifyApprovalNeeded,
};
