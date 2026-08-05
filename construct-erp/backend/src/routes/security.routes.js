// src/routes/security.routes.js — Administration: Security Dashboard
// Combines: live GitHub security-alert counts (Dependabot/CodeQL/secret
// scanning, best-effort — degrades gracefully if GITHUB_PAT lacks scope),
// a static checklist of protections already shipped in this codebase, and
// recent security-relevant activity from the audit_logs table.
const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const { query } = require('../config/database');

router.use(authenticate);
router.use(authorize('super_admin', 'admin'));

const GITHUB_PAT   = process.env.GITHUB_PAT;
const GITHUB_OWNER = process.env.GITHUB_OWNER || 'asal1989';
const GITHUB_REPO  = process.env.GITHUB_REPO  || 'BCIM-CON-ERP';

async function githubApi(path) {
  if (!GITHUB_PAT) return { error: 'not_configured' };
  try {
    const res = await fetch(`https://api.github.com${path}`, {
      headers: {
        Authorization: `Bearer ${GITHUB_PAT}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'BCIM-CON-ERP-Backend',
      },
    });
    if (res.status === 403 || res.status === 404) return { error: 'no_access' };
    if (!res.ok) return { error: `http_${res.status}` };
    return { data: await res.json() };
  } catch (e) {
    return { error: e.message };
  }
}

function bySeverity(alerts, severityPath) {
  const counts = { critical: 0, high: 0, moderate: 0, medium: 0, low: 0 };
  for (const a of alerts) {
    const sev = (severityPath(a) || '').toLowerCase();
    if (counts[sev] !== undefined) counts[sev]++;
  }
  return counts;
}

// Fixed record of protections already implemented in this codebase — this is
// not live-checked (there's no runtime probe for "is CSP on"), it documents
// what shipped and when, kept in sync manually as more items are addressed.
const CHECKLIST = [
  { item: 'Password hashing (bcrypt)', status: 'ok', note: 'All password paths use bcrypt cost 10-12.' },
  { item: 'SQL injection protection', status: 'ok', note: 'All queries parameterized ($1,$2...); no string-concatenated SQL.' },
  { item: 'Login brute-force throttling', status: 'ok', note: 'Per-account throttle (8 attempts/15min), not per-IP — safe for shared office IPs.' },
  { item: 'HSTS enabled', status: 'ok', note: 'Forces HTTPS for 180 days including subdomains.' },
  { item: 'Content-Security-Policy', status: 'ok', note: "Scoped allowlist; connect-src 'self' blocks data exfiltration via XSS." },
  { item: 'DB credentials excluded from git', status: 'ok', note: 'dburl.txt gitignored; never committed to history.' },
  { item: 'Cross-tenant access control (IDOR)', status: 'ok', note: 'Inventory issue + salary quick-edit endpoints scoped to company_id.' },
  { item: 'Audit trail for salary changes', status: 'ok', note: 'All create/edit salary endpoints now write to audit_logs.' },
  { item: 'Dependabot alerts + security updates', status: 'ok', note: 'Enabled at repo level; weekly scheduled scans configured.' },
  { item: 'CodeQL static analysis', status: 'ok', note: 'Runs on every push/PR to main, plus weekly.' },
  { item: 'GitHub secret scanning + push protection', status: 'ok', note: 'Blocks commits containing recognizable secret patterns.' },
  { item: 'PII field-level encryption', status: 'gap', note: 'PAN, Aadhaar, bank account/IFSC still stored as plaintext columns.' },
  { item: 'Session token storage', status: 'gap', note: 'JWT held in localStorage, not httpOnly cookies — XSS-exfiltration risk.' },
  { item: 'Input validation layer', status: 'gap', note: 'express-validator installed but not wired into routes; validation is ad-hoc.' },
  { item: 'File storage encryption at rest', status: 'gap', note: 'Uploaded documents/payslips sit unencrypted on local disk.' },
  { item: 'Error monitoring (Sentry)', status: 'gap', note: 'Deferred by request — no production error/security-event visibility beyond logs.' },
];

router.get('/overview', async (req, res) => {
  try {
    const [dependabot, codeScanning, secretScanning] = await Promise.all([
      githubApi(`/repos/${GITHUB_OWNER}/${GITHUB_REPO}/dependabot/alerts?state=open&per_page=100`),
      githubApi(`/repos/${GITHUB_OWNER}/${GITHUB_REPO}/code-scanning/alerts?state=open&per_page=100`),
      githubApi(`/repos/${GITHUB_OWNER}/${GITHUB_REPO}/secret-scanning/alerts?state=open&per_page=100`),
    ]);

    const github = {
      configured: !!GITHUB_PAT,
      repo: `${GITHUB_OWNER}/${GITHUB_REPO}`,
      dependabot: dependabot.data
        ? { total: dependabot.data.length, bySeverity: bySeverity(dependabot.data, a => a.security_advisory?.severity) }
        : { error: dependabot.error },
      codeScanning: codeScanning.data
        ? { total: codeScanning.data.length, bySeverity: bySeverity(codeScanning.data, a => a.rule?.security_severity_level) }
        : { error: codeScanning.error },
      secretScanning: secretScanning.data
        ? { total: secretScanning.data.length }
        : { error: secretScanning.error },
    };

    const [loginStats, recentActivity] = await Promise.all([
      query(
        `SELECT action, COUNT(*)::int AS count
           FROM audit_logs
          WHERE company_id = $1 AND action IN ('login_success','login_failed','login_throttled')
            AND created_at >= NOW() - INTERVAL '7 days'
          GROUP BY action`,
        [req.user.company_id]
      ),
      query(
        `SELECT al.id, al.action, al.table_name, al.record_id, al.new_values, al.ip_address, al.created_at,
                u.name AS user_name
           FROM audit_logs al
           LEFT JOIN users u ON u.id = al.user_id
          WHERE al.company_id = $1
            AND al.action IN ('login_failed','login_throttled','update','delete','create')
          ORDER BY al.created_at DESC
          LIMIT 25`,
        [req.user.company_id]
      ),
    ]);

    const login7d = { login_success: 0, login_failed: 0, login_throttled: 0 };
    for (const row of loginStats.rows) login7d[row.action] = row.count;

    res.json({
      github,
      login7d,
      recentActivity: recentActivity.rows,
      checklist: CHECKLIST,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
