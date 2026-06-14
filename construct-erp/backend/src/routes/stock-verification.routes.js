// backend/src/routes/stock-verification.routes.js
const express = require('express');
const { authenticate } = require('../middleware/auth');
const { query } = require('../config/database');
const { runSchemaInit } = require('../utils/schemaInit');
const router = express.Router();

router.use(authenticate);

runSchemaInit('stock_verifications_v1', async () => {
  await query(`
    CREATE TABLE IF NOT EXISTS stock_verifications (
      id                SERIAL PRIMARY KEY,
      company_id        INTEGER NOT NULL REFERENCES companies(id),
      project_id        INTEGER NOT NULL REFERENCES projects(id),
      verification_date DATE NOT NULL,
      location          TEXT,
      verified_by       TEXT,
      notes             TEXT,
      status            TEXT NOT NULL DEFAULT 'draft',
      created_by        INTEGER REFERENCES users(id),
      created_at        TIMESTAMPTZ DEFAULT NOW(),
      updated_at        TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_stock_verif_company ON stock_verifications(company_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_stock_verif_project ON stock_verifications(project_id)`);
  await query(`
    CREATE TABLE IF NOT EXISTS stock_verification_items (
      id                 SERIAL PRIMARY KEY,
      verification_id    INTEGER NOT NULL REFERENCES stock_verifications(id) ON DELETE CASCADE,
      inventory_id       INTEGER NOT NULL REFERENCES inventory(id),
      book_stock         NUMERIC(15,3) NOT NULL DEFAULT 0,
      physical_stock     NUMERIC(15,3) NOT NULL DEFAULT 0,
      reason             TEXT,
      adjustment_status  TEXT NOT NULL DEFAULT 'pending',
      created_at         TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_stock_verif_items_unique
      ON stock_verification_items(verification_id, inventory_id)
  `);
});

// GET / — list verification sessions
router.get('/', async (req, res) => {
  try {
    const { project_id } = req.query;
    const params = [req.user.company_id];
    let where = 'sv.company_id = $1';
    if (project_id) { params.push(project_id); where += ` AND sv.project_id = $${params.length}`; }
    const { rows } = await query(`
      SELECT sv.*, p.name AS project_name, COUNT(svi.id)::int AS item_count
      FROM stock_verifications sv
      JOIN projects p ON p.id = sv.project_id
      LEFT JOIN stock_verification_items svi ON svi.verification_id = sv.id
      WHERE ${where}
      GROUP BY sv.id, p.name
      ORDER BY sv.verification_date DESC, sv.id DESC
    `, params);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /:id — single verification with items
router.get('/:id', async (req, res) => {
  try {
    const { rows: [sv] } = await query(
      `SELECT sv.*, p.name AS project_name
       FROM stock_verifications sv
       JOIN projects p ON p.id = sv.project_id
       WHERE sv.id = $1 AND sv.company_id = $2`,
      [req.params.id, req.user.company_id]
    );
    if (!sv) return res.status(404).json({ error: 'Not found' });
    const { rows: items } = await query(`
      SELECT svi.*, i.material_name, i.unit,
        COALESCE(i.unit_rate, 0) AS unit_rate,
        COALESCE(i.site_location, '') AS location,
        ROUND((svi.physical_stock - svi.book_stock)::numeric, 3) AS variance_qty,
        ROUND(((svi.physical_stock - svi.book_stock) * COALESCE(i.unit_rate, 0))::numeric, 2) AS variance_value
      FROM stock_verification_items svi
      JOIN inventory i ON i.id = svi.inventory_id
      WHERE svi.verification_id = $1
      ORDER BY i.material_name
    `, [req.params.id]);
    res.json({ ...sv, items });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST / — create verification header
router.post('/', async (req, res) => {
  try {
    const { project_id, verification_date, location, verified_by, notes } = req.body;
    if (!project_id || !verification_date) return res.status(400).json({ error: 'project_id and verification_date required' });
    const { rows: [row] } = await query(
      `INSERT INTO stock_verifications (company_id, project_id, verification_date, location, verified_by, notes, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [req.user.company_id, project_id, verification_date, location || null, verified_by || null, notes || null, req.user.id]
    );
    res.status(201).json(row);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PATCH /:id — update header
router.patch('/:id', async (req, res) => {
  try {
    const { verification_date, location, verified_by, notes, status } = req.body;
    const { rows: [row] } = await query(
      `UPDATE stock_verifications
       SET verification_date = COALESCE($1, verification_date),
           location    = COALESCE($2, location),
           verified_by = COALESCE($3, verified_by),
           notes       = COALESCE($4, notes),
           status      = COALESCE($5, status),
           updated_at  = NOW()
       WHERE id = $6 AND company_id = $7 RETURNING *`,
      [verification_date, location, verified_by, notes, status, req.params.id, req.user.company_id]
    );
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json(row);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /:id
router.delete('/:id', async (req, res) => {
  try {
    const { rowCount } = await query(
      `DELETE FROM stock_verifications WHERE id = $1 AND company_id = $2`,
      [req.params.id, req.user.company_id]
    );
    if (!rowCount) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /:id/items — upsert items for a verification
router.put('/:id/items', async (req, res) => {
  try {
    const { items } = req.body;
    if (!Array.isArray(items)) return res.status(400).json({ error: 'items array required' });
    const { rows: [sv] } = await query(
      `SELECT id FROM stock_verifications WHERE id = $1 AND company_id = $2`,
      [req.params.id, req.user.company_id]
    );
    if (!sv) return res.status(404).json({ error: 'Not found' });

    for (const item of items) {
      await query(`
        INSERT INTO stock_verification_items (verification_id, inventory_id, book_stock, physical_stock, reason, adjustment_status)
        VALUES ($1,$2,$3,$4,$5,$6)
        ON CONFLICT (verification_id, inventory_id) DO UPDATE
          SET book_stock        = EXCLUDED.book_stock,
              physical_stock    = EXCLUDED.physical_stock,
              reason            = EXCLUDED.reason,
              adjustment_status = EXCLUDED.adjustment_status
      `, [req.params.id, item.inventory_id, item.book_stock ?? 0, item.physical_stock ?? 0, item.reason ?? null, item.adjustment_status ?? 'pending']);
    }

    const { rows } = await query(`
      SELECT svi.*, i.material_name, i.unit, COALESCE(i.unit_rate, 0) AS unit_rate,
        ROUND((svi.physical_stock - svi.book_stock)::numeric, 3) AS variance_qty,
        ROUND(((svi.physical_stock - svi.book_stock) * COALESCE(i.unit_rate, 0))::numeric, 2) AS variance_value
      FROM stock_verification_items svi
      JOIN inventory i ON i.id = svi.inventory_id
      WHERE svi.verification_id = $1
      ORDER BY i.material_name
    `, [req.params.id]);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
