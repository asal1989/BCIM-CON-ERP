const express = require('express');
const router = express.Router();
const { authenticate: authenticateToken } = require('../middleware/auth');

const GITHUB_PAT   = process.env.GITHUB_PAT;
const GITHUB_OWNER = process.env.GITHUB_OWNER || 'asal1989';
const GITHUB_REPO  = process.env.GITHUB_REPO  || 'BCIM-CON-ERP';
const WORKFLOW_ID  = 'db-backup.yml';

function requireAdmin(req, res, next) {
  if (!['super_admin', 'admin'].includes(req.user.role)) {
    return res.status(403).json({ error: 'Admin only' });
  }
  next();
}

async function githubApi(method, path, body) {
  if (!GITHUB_PAT) throw Object.assign(new Error('GITHUB_PAT not configured'), { statusCode: 503 });

  const res = await fetch(`https://api.github.com${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${GITHUB_PAT}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'BCIM-CON-ERP-Backend',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (res.status === 204) return null;
  if (res.status === 404) {
    const err = new Error('GitHub resource not found');
    err.githubStatus = 404;
    throw err;
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw Object.assign(
      new Error(`GitHub API ${method} ${path} → ${res.status}: ${text.slice(0, 200)}`),
      { statusCode: 502 }
    );
  }
  return res.json();
}

// POST /trigger — dispatch the GitHub Actions backup workflow
router.post('/trigger', authenticateToken, requireAdmin, async (req, res) => {
  await githubApi(
    'POST',
    `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/actions/workflows/${WORKFLOW_ID}/dispatches`,
    { ref: 'main' }
  );
  res.json({ ok: true, message: 'Backup workflow triggered. It will appear in the runs list within a few seconds.' });
});

// GET /runs — list last 10 workflow runs
router.get('/runs', authenticateToken, requireAdmin, async (req, res) => {
  const data = await githubApi(
    'GET',
    `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/actions/workflows/${WORKFLOW_ID}/runs?per_page=10`
  );
  const runs = (data?.workflow_runs ?? []).map(r => ({
    id: r.id,
    status: r.status,
    conclusion: r.conclusion,
    created_at: r.created_at,
    updated_at: r.updated_at,
    html_url: r.html_url,
    event: r.event,
  }));
  res.json(runs);
});

// GET /files — list files in the backups/ folder in the repo
router.get('/files', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const data = await githubApi(
      'GET',
      `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/backups`
    );
    const files = Array.isArray(data)
      ? data
          .filter(f => f.type === 'file' && f.name.endsWith('.dump'))
          .map(f => ({ name: f.name, size: f.size, sha: f.sha }))
          .sort((a, b) => b.name.localeCompare(a.name))
      : [];
    res.json(files);
  } catch (e) {
    if (e.githubStatus === 404) return res.json([]);
    throw e;
  }
});

// GET /status — check whether GITHUB_PAT is set
router.get('/status', authenticateToken, requireAdmin, (req, res) => {
  res.json({ configured: !!GITHUB_PAT });
});

module.exports = router;
