// src/routes/ign.routes.js — Inward Goods Note
const express = require('express');
const { authenticate } = require('../middleware/auth');
const { loadProjectScope, userCanAccessProject, appendProjectScope } = require('../middleware/projectScope');
const { query, withTransaction } = require('../config/database');
const router = express.Router();

// ── Auto-migrate ──────────────────────────────────────────────────────────────
(async () => {
  const safe = async (sql) => { try { await query(sql); } catch (_) {} };

  await safe(`
    CREATE TABLE IF NOT EXISTS ign (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id      UUID NOT NULL,
      project_id      UUID REFERENCES projects(id),
      ign_number      VARCHAR(50),
      supplier_name   VARCHAR(200),
      po_id           UUID REFERENCES purchase_orders(id),
      po_number       VARCHAR(100),
      vehicle_no      VARCHAR(50),
      dc_number       VARCHAR(100),
      bill_number     VARCHAR(100),
      date_time       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      grs_id          UUID REFERENCES grs(id),
      grs_number      VARCHAR(50),
      inspected_by    VARCHAR(120),
      stores_incharge VARCHAR(120),
      status          VARCHAR(30) NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending','inspected','approved')),
      approved_by     UUID REFERENCES users(id),
      approved_at     TIMESTAMPTZ,
      remarks         TEXT,
      created_by      UUID REFERENCES users(id),
      created_at      TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await safe(`
    CREATE TABLE IF NOT EXISTS ign_items (
      id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      ign_id           UUID NOT NULL REFERENCES ign(id) ON DELETE CASCADE,
      sl_no            INTEGER,
      invoice_no       VARCHAR(100),
      material_name    TEXT,
      unit             VARCHAR(30),
      qty_as_per_dc    NUMERIC(14,3),
      qty_inspected    NUMERIC(14,3),
      qty_rejected     NUMERIC(14,3),
      remarks          TEXT
    )
  `);

  await safe(`CREATE INDEX IF NOT EXISTS idx_ign_company  ON ign(company_id)`);
  await safe(`CREATE INDEX IF NOT EXISTS idx_ign_project  ON ign(project_id)`);
  await safe(`CREATE INDEX IF NOT EXISTS idx_ign_items    ON ign_items(ign_id)`);

  console.log('[IGN] Schema migration OK');
})();

router.use(authenticate);
router.use(loadProjectScope);

async function nextIgnNumber(companyId) {
  const yr = new Date().getFullYear();
  const res = await query(
    `SELECT COUNT(*) FROM ign WHERE company_id = $1 AND EXTRACT(YEAR FROM created_at) = $2`,
    [companyId, yr]
  );
  const seq = String(parseInt(res.rows[0].count) + 1).padStart(4, '0');
  return `IGN/${yr}/${seq}`;
}

// ── GET /ign ──────────────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { project_id, status } = req.query;
    let sql = `
      SELECT n.*,
             p.name  AS project_name,
             u.name  AS created_by_name,
             ap.name AS approved_by_name,
             (SELECT COUNT(*) FROM ign_items ii WHERE ii.ign_id = n.id) AS item_count
      FROM ign n
      JOIN projects p ON n.project_id = p.id
      LEFT JOIN users u  ON n.created_by  = u.id
      LEFT JOIN users ap ON n.approved_by = ap.id
      WHERE p.company_id = $1`;
    let params = [req.user.company_id];
    let i = 2;
    if (project_id) { sql += ` AND n.project_id = $${i++}`; params.push(project_id); }
    if (status)     { sql += ` AND n.status = $${i++}`;     params.push(status); }
    ({ sql, params } = appendProjectScope(req, sql, params, 'n'));
    sql += ' ORDER BY n.date_time DESC';
    const result = await query(sql, params);
    res.json({ data: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /ign/:id ──────────────────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const ign = await query(
      `SELECT n.*, p.name AS project_name, p.company_id,
              u.name AS created_by_name, ap.name AS approved_by_name
       FROM ign n
       JOIN projects p ON n.project_id = p.id
       LEFT JOIN users u  ON n.created_by  = u.id
       LEFT JOIN users ap ON n.approved_by = ap.id
       WHERE n.id = $1`,
      [req.params.id]
    );
    if (!ign.rows.length || ign.rows[0].company_id !== req.user.company_id) {
      return res.status(404).json({ error: 'IGN not found' });
    }
    const items = await query(
      `SELECT * FROM ign_items WHERE ign_id = $1 ORDER BY sl_no`,
      [req.params.id]
    );
    res.json({ data: { ...ign.rows[0], items: items.rows } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /ign ─────────────────────────────────────────────────────────────────
router.post('/', async (req, res) => {
  try {
    const {
      project_id, supplier_name, po_id, po_number,
      vehicle_no, dc_number, bill_number, date_time,
      grs_id, grs_number,
      inspected_by, stores_incharge, remarks,
      items = [],
    } = req.body;

    if (!project_id) return res.status(400).json({ error: 'Project is required' });
    if (!userCanAccessProject(req, project_id)) {
      return res.status(403).json({ error: 'You do not have access to this project.' });
    }
    if (!items.length) return res.status(400).json({ error: 'Add at least one item' });

    const ign_number = await nextIgnNumber(req.user.company_id);

    const result = await withTransaction(async (client) => {
      const hdr = await client.query(
        `INSERT INTO ign
           (company_id, project_id, ign_number, supplier_name,
            po_id, po_number, vehicle_no, dc_number, bill_number,
            date_time, grs_id, grs_number,
            inspected_by, stores_incharge, remarks, status, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,'pending',$16)
         RETURNING *`,
        [req.user.company_id, project_id, ign_number, supplier_name || null,
         po_id || null, po_number || null, vehicle_no || null,
         dc_number || null, bill_number || null,
         date_time || new Date().toISOString(),
         grs_id || null, grs_number || null,
         inspected_by || null, stores_incharge || null,
         remarks || null, req.user.id]
      );
      const ignId = hdr.rows[0].id;

      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        if (!it.material_name?.trim()) continue;
        await client.query(
          `INSERT INTO ign_items
             (ign_id, sl_no, invoice_no, material_name, unit,
              qty_as_per_dc, qty_inspected, qty_rejected, remarks)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [ignId, i + 1, it.invoice_no || null, it.material_name.trim(),
           it.unit || null,
           it.qty_as_per_dc  ? parseFloat(it.qty_as_per_dc)  : null,
           it.qty_inspected  ? parseFloat(it.qty_inspected)  : null,
           it.qty_rejected   ? parseFloat(it.qty_rejected)   : null,
           it.remarks || null]
        );
      }
      return hdr.rows[0];
    });

    res.status(201).json({ data: result });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// ── PATCH /ign/:id/approve — Stores-In-Charge approval ───────────────────────
router.patch('/:id/approve', async (req, res) => {
  try {
    const check = await query(
      `SELECT n.project_id, p.company_id FROM ign n
       JOIN projects p ON p.id = n.project_id
       WHERE n.id = $1 AND n.status = 'pending'`,
      [req.params.id]
    );
    if (!check.rows.length || check.rows[0].company_id !== req.user.company_id) {
      return res.status(404).json({ error: 'IGN not found or already approved' });
    }
    if (!userCanAccessProject(req, check.rows[0].project_id)) {
      return res.status(403).json({ error: 'You do not have access to this project.' });
    }
    await query(
      `UPDATE ign SET status = 'approved', approved_by = $1, approved_at = NOW()
       WHERE id = $2`,
      [req.user.id, req.params.id]
    );
    res.json({ message: 'IGN approved' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
