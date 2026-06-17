// src/routes/gate-pass.routes.js — Gate Pass (Returnable / Non-Returnable)
const express = require('express');
const { authenticate, authorize } = require('../middleware/auth');
const { loadProjectScope, userCanAccessProject, appendProjectScope } = require('../middleware/projectScope');
const { query, withTransaction } = require('../config/database');

const STORES_WRITE = ['store_keeper','stores_manager','stores_officer','admin','super_admin'];
const router = express.Router();

// ── Auto-migrate ──────────────────────────────────────────────────────────────
(async () => {
  const safe = async (sql) => { try { await query(sql); } catch (_) {} };

  await safe(`
    CREATE TABLE IF NOT EXISTS gate_passes (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id      UUID NOT NULL,
      project_id      UUID REFERENCES projects(id),
      gp_number       VARCHAR(50),
      pass_type       VARCHAR(20) NOT NULL DEFAULT 'non_returnable'
                        CHECK (pass_type IN ('returnable','non_returnable')),
      vehicle_no      VARCHAR(50),
      date_time       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      issued_by       VARCHAR(120),
      issued_to       VARCHAR(200),
      indented_by     VARCHAR(120),
      authorised_by   VARCHAR(120),
      expected_return_date DATE,
      returned_at     TIMESTAMPTZ,
      status          VARCHAR(30) NOT NULL DEFAULT 'open'
                        CHECK (status IN ('open','returned','closed')),
      remarks         TEXT,
      created_by      UUID REFERENCES users(id),
      created_at      TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await safe(`
    CREATE TABLE IF NOT EXISTS gate_pass_items (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      gp_id       UUID NOT NULL REFERENCES gate_passes(id) ON DELETE CASCADE,
      sl_no       INTEGER,
      particulars TEXT,
      unit        VARCHAR(30),
      quantity    NUMERIC(14,3),
      remarks     TEXT
    )
  `);

  await safe(`CREATE INDEX IF NOT EXISTS idx_gp_company ON gate_passes(company_id)`);
  await safe(`CREATE INDEX IF NOT EXISTS idx_gp_project ON gate_passes(project_id)`);
  await safe(`CREATE INDEX IF NOT EXISTS idx_gp_items   ON gate_pass_items(gp_id)`);
  // Guarantee per-company uniqueness of the generated gate-pass number
  await safe(`CREATE UNIQUE INDEX IF NOT EXISTS uq_gp_number ON gate_passes(company_id, gp_number)`);

  console.log('[GatePass] Schema migration OK');
})();

router.use(authenticate);
router.use(loadProjectScope);

// Race-safe gate-pass number — MAX of existing seq for company+year, in a txn.
async function nextGpNumber(client, companyId) {
  const yr = new Date().getFullYear();
  const res = await client.query(
    `SELECT COALESCE(MAX(CAST(REGEXP_REPLACE(gp_number, '^GP/[0-9]+/', '') AS INTEGER)), 0) AS last_seq
     FROM gate_passes
     WHERE company_id = $1 AND gp_number LIKE $2`,
    [companyId, `GP/${yr}/%`]
  );
  const seq = String(parseInt(res.rows[0].last_seq) + 1).padStart(4, '0');
  return `GP/${yr}/${seq}`;
}

// ── GET /gate-passes ──────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { project_id, status, pass_type } = req.query;
    let sql = `
      SELECT gp.*,
             p.name  AS project_name,
             u.name  AS created_by_name,
             (SELECT COUNT(*) FROM gate_pass_items gi WHERE gi.gp_id = gp.id) AS item_count
      FROM gate_passes gp
      JOIN projects p ON gp.project_id = p.id
      LEFT JOIN users u ON gp.created_by = u.id
      WHERE p.company_id = $1`;
    let params = [req.user.company_id];
    let i = 2;
    if (project_id) { sql += ` AND gp.project_id = $${i++}`; params.push(project_id); }
    if (status)     { sql += ` AND gp.status = $${i++}`;     params.push(status); }
    if (pass_type)  { sql += ` AND gp.pass_type = $${i++}`;  params.push(pass_type); }
    ({ sql, params } = appendProjectScope(req, sql, params, 'gp'));
    sql += ' ORDER BY gp.date_time DESC';
    const result = await query(sql, params);
    res.json({ data: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /gate-passes/:id ──────────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const gp = await query(
      `SELECT gp.*, p.name AS project_name, p.company_id, u.name AS created_by_name
       FROM gate_passes gp
       JOIN projects p ON gp.project_id = p.id
       LEFT JOIN users u ON gp.created_by = u.id
       WHERE gp.id = $1`,
      [req.params.id]
    );
    if (!gp.rows.length || gp.rows[0].company_id !== req.user.company_id) {
      return res.status(404).json({ error: 'Gate Pass not found' });
    }
    const items = await query(
      `SELECT * FROM gate_pass_items WHERE gp_id = $1 ORDER BY sl_no`,
      [req.params.id]
    );
    res.json({ data: { ...gp.rows[0], items: items.rows } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /gate-passes ─────────────────────────────────────────────────────────
router.post('/', authorize(...STORES_WRITE), async (req, res) => {
  try {
    const {
      project_id, pass_type, vehicle_no, date_time,
      issued_by, issued_to, indented_by, authorised_by,
      expected_return_date, remarks, items = [],
    } = req.body;

    if (!project_id) return res.status(400).json({ error: 'Project is required' });
    if (!userCanAccessProject(req, project_id)) {
      return res.status(403).json({ error: 'You do not have access to this project.' });
    }
    if (!items.length) return res.status(400).json({ error: 'Add at least one item' });

    const result = await withTransaction(async (client) => {
      const gp_number = await nextGpNumber(client, req.user.company_id);
      const hdr = await client.query(
        `INSERT INTO gate_passes
           (company_id, project_id, gp_number, pass_type,
            vehicle_no, date_time, issued_by, issued_to,
            indented_by, authorised_by, expected_return_date,
            remarks, status, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'open',$13)
         RETURNING *`,
        [req.user.company_id, project_id, gp_number,
         pass_type || 'non_returnable', vehicle_no || null,
         date_time || new Date().toISOString(),
         issued_by || null, issued_to || null,
         indented_by || null, authorised_by || null,
         expected_return_date || null,
         remarks || null, req.user.id]
      );
      const gpId = hdr.rows[0].id;

      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        if (!it.particulars?.trim()) continue;
        await client.query(
          `INSERT INTO gate_pass_items (gp_id, sl_no, particulars, unit, quantity, remarks)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [gpId, i + 1, it.particulars.trim(), it.unit || null,
           it.quantity ? parseFloat(it.quantity) : null, it.remarks || null]
        );
      }
      return hdr.rows[0];
    });

    res.status(201).json({ data: result });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// ── PATCH /gate-passes/:id/return — mark returnable pass as returned ──────────
router.patch('/:id/return', async (req, res) => {
  try {
    const check = await query(
      `SELECT gp.project_id, p.company_id, gp.pass_type FROM gate_passes gp
       JOIN projects p ON p.id = gp.project_id
       WHERE gp.id = $1 AND gp.status = 'open'`,
      [req.params.id]
    );
    if (!check.rows.length || check.rows[0].company_id !== req.user.company_id) {
      return res.status(404).json({ error: 'Gate Pass not found or already closed' });
    }
    if (check.rows[0].pass_type !== 'returnable') {
      return res.status(400).json({ error: 'Only returnable gate passes can be marked as returned' });
    }
    if (!userCanAccessProject(req, check.rows[0].project_id)) {
      return res.status(403).json({ error: 'You do not have access to this project.' });
    }
    await query(
      `UPDATE gate_passes SET status = 'returned', returned_at = NOW() WHERE id = $1`,
      [req.params.id]
    );
    res.json({ message: 'Gate Pass marked as returned' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PATCH /gate-passes/:id/close ──────────────────────────────────────────────
router.patch('/:id/close', async (req, res) => {
  try {
    const check = await query(
      `SELECT gp.project_id, p.company_id, gp.pass_type, gp.status FROM gate_passes gp
       JOIN projects p ON p.id = gp.project_id
       WHERE gp.id = $1 AND gp.status != 'closed'`,
      [req.params.id]
    );
    if (!check.rows.length || check.rows[0].company_id !== req.user.company_id) {
      return res.status(404).json({ error: 'Gate Pass not found or already closed' });
    }
    if (!userCanAccessProject(req, check.rows[0].project_id)) {
      return res.status(403).json({ error: 'You do not have access to this project.' });
    }
    // A returnable pass must be marked returned before it can be closed,
    // otherwise the return-tracking is lost.
    if (check.rows[0].pass_type === 'returnable' && check.rows[0].status === 'open') {
      return res.status(400).json({ error: 'Mark the returnable gate pass as returned before closing it' });
    }
    await query(
      `UPDATE gate_passes SET status = 'closed' WHERE id = $1`,
      [req.params.id]
    );
    res.json({ message: 'Gate Pass closed' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
