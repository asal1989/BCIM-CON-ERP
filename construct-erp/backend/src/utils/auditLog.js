// src/utils/auditLog.js — write entries to the audit_logs table.
// Call this explicitly from a route after a sensitive mutation succeeds.
// There's no global interceptor (the app uses raw SQL everywhere, not an
// ORM with hooks), so coverage is opt-in per route rather than automatic —
// start with the highest-value actions (user management, company settings,
// deletes, approval-stage transitions) and add more over time.
const { query } = require('../config/database');
const { runSchemaInit } = require('./schemaInit');

runSchemaInit('audit_logs_company_scope', async () => {
  await query(`ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_audit_logs_company ON audit_logs(company_id, created_at DESC)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_audit_logs_table_record ON audit_logs(table_name, record_id)`);
});

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * @param {object} req - Express request (must be authenticated; reads req.user, req.ip)
 * @param {object} opts
 * @param {string} opts.action - e.g. 'create', 'update', 'delete', 'approve', 'reject', 'login'
 * @param {string} opts.tableName - the table/entity affected, e.g. 'users', 'purchase_orders'
 * @param {string} [opts.recordId] - UUID of the affected row. If the affected entity isn't
 *   UUID-keyed (e.g. a role name), omit this and put the identifier inside newValues/oldValues
 *   instead — record_id is a UUID column and a non-UUID value here gets silently dropped by
 *   the catch below, so this validates rather than failing quietly.
 * @param {object} [opts.oldValues] - prior state (omit fields you don't want logged, e.g. password hashes)
 * @param {object} [opts.newValues] - new state
 */
async function logAudit(req, { action, tableName, recordId, oldValues, newValues }) {
  try {
    const safeRecordId = recordId && UUID_RE.test(recordId) ? recordId : null;
    if (recordId && !safeRecordId) {
      console.warn(`[audit-log] recordId "${recordId}" for ${tableName}/${action} is not a UUID — storing as null, identifier should be in oldValues/newValues instead`);
    }
    await query(
      `INSERT INTO audit_logs (user_id, company_id, action, table_name, record_id, old_values, new_values, ip_address)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        req.user?.id || null,
        req.user?.company_id || null,
        action,
        tableName,
        safeRecordId,
        oldValues ? JSON.stringify(oldValues) : null,
        newValues ? JSON.stringify(newValues) : null,
        req.ip || req.headers['x-forwarded-for'] || null,
      ]
    );
  } catch (err) {
    // Audit logging must never break the actual request it's attached to.
    console.error('[audit-log] failed to write entry:', err.message);
  }
}

module.exports = { logAudit };
