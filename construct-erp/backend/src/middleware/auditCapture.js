// src/middleware/auditCapture.js
// Generic, coarse audit-log fallback for the ~98% of mutating routes that
// don't call the precise logAudit() helper (utils/auditLog.js) directly.
// Mounted once, globally, right before route registration in server.js —
// captures who/what/roughly-where for every module automatically, with no
// per-route code changes required. This never replaces logAudit(); routes
// that already call it are skipped here via the req._auditLogged flag it
// sets, so nothing gets logged twice.
const { query } = require('../config/database');

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
// Login/logout already has its own separate logging in auth.controller.js
// (it runs before req.user exists, so it can't use this or logAudit at all).
// /sync is the ESSL agent's key-based endpoint — no req.user. /public-careers
// is the public job board — no auth.
const SKIP_PREFIXES = ['/auth', '/sync', '/public-careers'];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const NUMERIC_ID_RE = /^\d+$/;
const ACTION_SEGMENTS = new Set([
  'approve', 'reject', 'verify', 'pay', 'terminate', 'deactivate', 'activate',
  'cancel', 'submit', 'complete', 'close', 'reopen', 'reset-password', 'send',
  'upload', 'convert', 'link', 'unlink', 'mark-absent', 'run',
]);
const REDACT_KEY_RE = /password|token|secret|otp|pin/i;

function redact(value) {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = REDACT_KEY_RE.test(k) ? '[redacted]' : redact(v);
    }
    return out;
  }
  return value;
}

// Best-effort label, not a guaranteed real Postgres table name — good enough
// for filtering/grouping in the Audit Log UI, which treats table_name as an
// opaque string already.
function deriveActionAndTable(method, pathOnly) {
  const segments = pathOnly.split('/').filter(Boolean);
  const last = segments[segments.length - 1] || '';
  const lastIsAction = ACTION_SEGMENTS.has(last.toLowerCase());
  const action = lastIsAction
    ? last.toLowerCase()
    : { POST: 'create', PUT: 'update', PATCH: 'update', DELETE: 'delete' }[method] || 'update';

  const tableSegments = segments.filter((seg, i) =>
    !UUID_RE.test(seg) && !NUMERIC_ID_RE.test(seg) && !(lastIsAction && i === segments.length - 1)
  );
  const tableName = tableSegments.join('/') || pathOnly;
  return { action, tableName };
}

function firstIdParam(params) {
  for (const v of Object.values(params || {})) {
    if (typeof v === 'string' && (UUID_RE.test(v) || NUMERIC_ID_RE.test(v))) return v;
  }
  return null;
}

module.exports = function auditCapture(req, res, next) {
  res.on('finish', () => {
    try {
      if (!MUTATING_METHODS.has(req.method)) return;
      if (res.statusCode < 200 || res.statusCode >= 400) return;
      if (req._auditLogged) return; // a route-level logAudit() call already handled this request
      if (!req.user?.id) return;    // unauthenticated route — nothing to attribute it to

      // req.originalUrl is set once at request start and never mutated by
      // nested routers, unlike req.path/req.baseUrl — safe to read here even
      // though this runs after the whole routing chain has completed.
      const fullPath = req.originalUrl.split('?')[0];
      const pathOnly = fullPath.replace(/^\/api\/v1/, '');
      if (SKIP_PREFIXES.some(p => pathOnly.startsWith(p))) return;

      const { action, tableName } = deriveActionAndTable(req.method, pathOnly);
      const recordId = firstIdParam(req.params);
      const safeRecordId = recordId && UUID_RE.test(recordId) ? recordId : null;
      const newValues = req.body && Object.keys(req.body).length ? redact(req.body) : null;

      query(
        `INSERT INTO audit_logs (user_id, company_id, action, table_name, record_id, new_values, ip_address, source)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'auto')`,
        [
          req.user.id,
          req.user.company_id || null,
          action,
          tableName,
          safeRecordId,
          newValues ? JSON.stringify(newValues) : null,
          req.ip || req.headers?.['x-forwarded-for'] || null,
        ]
      ).catch(err => console.error('[audit-capture] failed to write entry:', err.message));
    } catch (err) {
      // Audit logging must never break the actual request — same principle
      // as logAudit() itself, and doubly true here since this runs on every
      // mutating request across the whole app, not one opted-in route.
      console.error('[audit-capture] unexpected error:', err.message);
    }
  });
  next();
};
