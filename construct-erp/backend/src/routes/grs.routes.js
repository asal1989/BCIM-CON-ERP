// src/routes/grs.routes.js — Goods Receipt by Security
const express = require('express');
const { authenticate, authorize } = require('../middleware/auth');
const { loadProjectScope, userCanAccessProject, appendProjectScope } = require('../middleware/projectScope');
const { query, withTransaction } = require('../config/database');

const STORES_WRITE = ['security_guard','store_keeper','stores_manager','stores_officer','admin','super_admin'];
const router = express.Router();

// ── Auto-migrate ──────────────────────────────────────────────────────────────
(async () => {
  const safe = async (sql) => {
    try { await query(sql); } catch (_) {}
  };

  await safe(`
    CREATE TABLE IF NOT EXISTS grs (
      id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id       UUID NOT NULL,
      project_id       UUID REFERENCES projects(id),
      grs_number       VARCHAR(50),
      vehicle_no       VARCHAR(50),
      date_time        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      security_incharge VARCHAR(120),
      status           VARCHAR(30) NOT NULL DEFAULT 'pending'
                         CHECK (status IN ('pending','acknowledged','cancelled')),
      acknowledged_by  UUID REFERENCES users(id),
      acknowledged_at  TIMESTAMPTZ,
      remarks          TEXT,
      created_by       UUID REFERENCES users(id),
      created_at       TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await safe(`
    CREATE TABLE IF NOT EXISTS grs_items (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      grs_id      UUID NOT NULL REFERENCES grs(id) ON DELETE CASCADE,
      sl_no       INTEGER,
      particulars TEXT,
      unit        VARCHAR(30),
      quantity    NUMERIC(14,3),
      remarks     TEXT
    )
  `);

  await safe(`CREATE INDEX IF NOT EXISTS idx_grs_company ON grs(company_id)`);
  await safe(`CREATE INDEX IF NOT EXISTS idx_grs_project ON grs(project_id)`);
  await safe(`CREATE INDEX IF NOT EXISTS idx_grs_items_grs ON grs_items(grs_id)`);
  await safe(`CREATE INDEX IF NOT EXISTS idx_grs_status ON grs(status)`);
  await safe(`CREATE INDEX IF NOT EXISTS idx_grs_date   ON grs(date_time)`);

  await safe(`ALTER TABLE grs DROP CONSTRAINT IF EXISTS grs_status_check`);
  await safe(`ALTER TABLE grs ADD CONSTRAINT grs_status_check CHECK (status IN ('pending','acknowledged','cancelled'))`);

  console.log('[GRS] Schema migration OK');
})();

router.use(authenticate);
router.use(loadProjectScope);

// ── Helper: next GRS number ───────────────────────────────────────────────────
async function nextGrsNumber(companyId) {
  const yr = new Date().getFullYear();
  const res = await query(
    `SELECT COALESCE(MAX(CAST(SPLIT_PART(grs_number,'/',3) AS INTEGER)),0)+1 AS next
     FROM grs WHERE company_id=$1 AND EXTRACT(YEAR FROM created_at)=$2`,
    [companyId, yr]
  );
  return `GRS/${yr}/${String(res.rows[0].next).padStart(4,'0')}`;
}

// ── GET /grs ──────────────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { project_id, status, from_date, to_date } = req.query;
    let sql = `
      SELECT g.*,
             p.name  AS project_name,
             u.name  AS created_by_name,
             ack.name AS acknowledged_by_name,
             (SELECT COUNT(*) FROM grs_items gi WHERE gi.grs_id = g.id) AS item_count
      FROM grs g
      JOIN projects p ON g.project_id = p.id
      LEFT JOIN users u   ON g.created_by = u.id
      LEFT JOIN users ack ON g.acknowledged_by = ack.id
      WHERE p.company_id = $1`;
    let params = [req.user.company_id];
    let i = 2;
    if (project_id) { sql += ` AND g.project_id = $${i++}`; params.push(project_id); }
    if (status)     { sql += ` AND g.status = $${i++}`;     params.push(status); }
    if (from_date) { sql += ` AND g.date_time >= $${i++}`; params.push(from_date); }
    if (to_date)   { sql += ` AND g.date_time <= $${i++}`; params.push(to_date); }
    ({ sql, params } = appendProjectScope(req, sql, params, 'g'));
    sql += ' ORDER BY g.date_time DESC';
    const result = await query(sql, params);
    res.json({ data: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /grs/:id ──────────────────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const grs = await query(
      `SELECT g.*,
              p.name  AS project_name, p.company_id,
              u.name  AS created_by_name,
              ack.name AS acknowledged_by_name
       FROM grs g
       JOIN projects p ON g.project_id = p.id
       LEFT JOIN users u   ON g.created_by = u.id
       LEFT JOIN users ack ON g.acknowledged_by = ack.id
       WHERE g.id = $1`,
      [req.params.id]
    );
    if (!grs.rows.length || grs.rows[0].company_id !== req.user.company_id) {
      return res.status(404).json({ error: 'GRS not found' });
    }
    const items = await query(
      `SELECT * FROM grs_items WHERE grs_id = $1 ORDER BY sl_no`,
      [req.params.id]
    );
    res.json({ data: { ...grs.rows[0], items: items.rows } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /grs ─────────────────────────────────────────────────────────────────
router.post('/', authorize(...STORES_WRITE), async (req, res) => {
  try {
    const { project_id, vehicle_no, date_time, security_incharge, items = [], remarks } = req.body;
    if (!project_id) return res.status(400).json({ error: 'Project is required' });
    if (!userCanAccessProject(req, project_id)) {
      return res.status(403).json({ error: 'You do not have access to this project.' });
    }
    if (!items.length) return res.status(400).json({ error: 'Add at least one item' });

    const grs_number = await nextGrsNumber(req.user.company_id);

    const result = await withTransaction(async (client) => {
      const hdr = await client.query(
        `INSERT INTO grs
           (company_id, project_id, grs_number, vehicle_no, date_time,
            security_incharge, remarks, status, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'pending',$8) RETURNING *`,
        [req.user.company_id, project_id, grs_number, vehicle_no || null,
         date_time || new Date().toISOString(), security_incharge || null,
         remarks || null, req.user.id]
      );
      const grsId = hdr.rows[0].id;

      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        if (!it.particulars?.trim()) continue;
        await client.query(
          `INSERT INTO grs_items (grs_id, sl_no, particulars, unit, quantity, remarks)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [grsId, i + 1, it.particulars.trim(), it.unit || null,
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

// ── PATCH /grs/:id/acknowledge — Engineer / Stores Officer sign-off ───────────
router.patch('/:id/acknowledge', async (req, res) => {
  try {
    const check = await query(
      `SELECT g.project_id, p.company_id FROM grs g
       JOIN projects p ON p.id = g.project_id
       WHERE g.id = $1 AND g.status = 'pending'`,
      [req.params.id]
    );
    if (!check.rows.length || check.rows[0].company_id !== req.user.company_id) {
      return res.status(404).json({ error: 'GRS not found or already acknowledged' });
    }
    if (!userCanAccessProject(req, check.rows[0].project_id)) {
      return res.status(403).json({ error: 'You do not have access to this project.' });
    }
    await query(
      `UPDATE grs SET status = 'acknowledged',
                      acknowledged_by = $1,
                      acknowledged_at = NOW()
       WHERE id = $2`,
      [req.user.id, req.params.id]
    );
    res.json({ message: 'GRS acknowledged' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PATCH /grs/:id/cancel ──────────────────────────────────────────────────
router.patch('/:id/cancel', async (req, res) => {
  try {
    const check = await query(
      `SELECT g.project_id, p.company_id FROM grs g
       JOIN projects p ON p.id = g.project_id
       WHERE g.id = $1 AND g.status = 'pending'`,
      [req.params.id]
    );
    if (!check.rows.length || check.rows[0].company_id !== req.user.company_id) {
      return res.status(404).json({ error: 'GRS not found or cannot be cancelled' });
    }
    if (!userCanAccessProject(req, check.rows[0].project_id)) {
      return res.status(403).json({ error: 'You do not have access to this project.' });
    }
    await query(`UPDATE grs SET status = 'cancelled' WHERE id = $1`, [req.params.id]);
    res.json({ message: 'GRS cancelled' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
