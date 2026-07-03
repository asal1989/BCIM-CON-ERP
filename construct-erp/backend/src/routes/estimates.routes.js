// src/routes/estimates.routes.js — Client estimates/quotes (pre-invoice proposals)
const express = require('express');
const { authenticate } = require('../middleware/auth');
const { query, withTransaction } = require('../config/database');
const router = express.Router();

(async () => {
  const safe = async (sql) => { try { await query(sql); } catch (_) {} };

  await safe(`
    CREATE TABLE IF NOT EXISTS estimates (
      id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
      estimate_no      TEXT UNIQUE NOT NULL,
      estimate_date    DATE NOT NULL,
      expiry_date      DATE,
      client_name      TEXT NOT NULL,
      project_id       UUID,
      work_description TEXT,
      tax_mode         TEXT DEFAULT 'intrastate',
      basic_amount     NUMERIC(14,2) DEFAULT 0,
      cgst_pct         NUMERIC(5,2)  DEFAULT 0,
      cgst_amt         NUMERIC(14,2) DEFAULT 0,
      sgst_pct         NUMERIC(5,2)  DEFAULT 0,
      sgst_amt         NUMERIC(14,2) DEFAULT 0,
      igst_pct         NUMERIC(5,2)  DEFAULT 0,
      igst_amt         NUMERIC(14,2) DEFAULT 0,
      gst_amount       NUMERIC(14,2) DEFAULT 0,
      total_amount     NUMERIC(14,2) DEFAULT 0,
      status           TEXT DEFAULT 'draft',
      remarks          TEXT,
      created_by       UUID,
      company_id       UUID,
      created_at       TIMESTAMPTZ DEFAULT NOW(),
      updated_at       TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await safe(`
    CREATE TABLE IF NOT EXISTS estimate_items (
      id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
      estimate_id   UUID NOT NULL REFERENCES estimates(id) ON DELETE CASCADE,
      material_name TEXT NOT NULL,
      unit          TEXT DEFAULT 'Nos',
      quantity      NUMERIC(14,3) DEFAULT 0,
      rate          NUMERIC(14,2) DEFAULT 0,
      amount        NUMERIC(14,2) DEFAULT 0,
      sort_order    INTEGER DEFAULT 0
    )
  `);
  await safe(`CREATE INDEX IF NOT EXISTS idx_est_project ON estimates(project_id)`);
  await safe(`CREATE INDEX IF NOT EXISTS idx_est_status  ON estimates(status)`);
  await safe(`CREATE INDEX IF NOT EXISTS idx_esti_est     ON estimate_items(estimate_id)`);

  console.log('[Estimates] Schema OK');
})();

const n = (v) => parseFloat(v) || 0;

async function nextEstimateNo(client, companyId) {
  const yr = new Date().getFullYear();
  const r = await client.query(
    `SELECT COALESCE(MAX(CAST(REGEXP_REPLACE(estimate_no, '^EST/[0-9]+/', '') AS INTEGER)), 0) AS last_seq
     FROM estimates WHERE company_id = $1 AND estimate_no LIKE $2`,
    [companyId, `EST/${yr}/%`]
  );
  return `EST/${yr}/${String(parseInt(r.rows[0].last_seq) + 1).padStart(4, '0')}`;
}

async function getEstimate(id, companyId) {
  const r = await query(
    `SELECT e.*, p.name AS project_name, u.name AS created_by_name
     FROM estimates e
     LEFT JOIN projects p ON p.id = e.project_id
     LEFT JOIN users    u ON u.id = e.created_by
     WHERE e.id = $1 AND e.company_id = $2`,
    [id, companyId]
  );
  if (!r.rows.length) return null;
  const items = await query(`SELECT * FROM estimate_items WHERE estimate_id = $1 ORDER BY sort_order`, [id]);
  return { ...r.rows[0], items: items.rows };
}

// ── LIST ─────────────────────────────────────────────────────────────────────
router.get('/', authenticate, async (req, res) => {
  try {
    const { project_id, status, search, limit = 100, offset = 0 } = req.query;
    const conditions = ['e.company_id = $1'];
    const params = [req.user.company_id];
    let p = 1;

    if (project_id) { conditions.push(`e.project_id = $${++p}`); params.push(project_id); }
    if (status)     { conditions.push(`e.status     = $${++p}`); params.push(status); }
    if (search) {
      conditions.push(`(e.estimate_no ILIKE $${++p} OR e.client_name ILIKE $${p})`);
      params.push(`%${search}%`);
    }

    const where = conditions.join(' AND ');
    const rows = await query(
      `SELECT e.*, p.name AS project_name, u.name AS created_by_name
       FROM estimates e
       LEFT JOIN projects p ON p.id = e.project_id
       LEFT JOIN users    u ON u.id = e.created_by
       WHERE ${where}
       ORDER BY e.estimate_date DESC, e.created_at DESC
       LIMIT $${++p} OFFSET $${++p}`,
      [...params, limit, offset]
    );
    res.json({ data: rows.rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── GET ONE ──────────────────────────────────────────────────────────────────
router.get('/:id', authenticate, async (req, res) => {
  try {
    const est = await getEstimate(req.params.id, req.user.company_id);
    if (!est) return res.status(404).json({ error: 'Estimate not found' });
    res.json({ data: est });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── CREATE ───────────────────────────────────────────────────────────────────
router.post('/', authenticate, async (req, res) => {
  try {
    const {
      estimate_date, expiry_date, client_name, project_id, work_description,
      tax_mode = 'intrastate',
      basic_amount = 0,
      cgst_pct = 0, cgst_amt = 0,
      sgst_pct = 0, sgst_amt = 0,
      igst_pct = 0, igst_amt = 0,
      status, remarks, items = [],
    } = req.body;

    if (!estimate_date) return res.status(400).json({ error: 'estimate_date is required' });
    if (!client_name)   return res.status(400).json({ error: 'client_name is required' });

    const gst_amount   = n(cgst_amt) + n(sgst_amt) + n(igst_amt);
    const total_amount = n(basic_amount) + gst_amount;
    const st = ['draft','sent','accepted','declined','expired'].includes(status) ? status : 'draft';

    const result = await withTransaction(async (client) => {
      const estimate_no = await nextEstimateNo(client, req.user.company_id);
      const r = await client.query(
        `INSERT INTO estimates (
          estimate_no, estimate_date, expiry_date, client_name, project_id, work_description, tax_mode,
          basic_amount, cgst_pct, cgst_amt, sgst_pct, sgst_amt,
          igst_pct, igst_amt, gst_amount, total_amount,
          status, remarks, created_by, company_id
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
        RETURNING *`,
        [
          estimate_no, estimate_date, expiry_date || null, client_name, project_id || null, work_description || null, tax_mode,
          n(basic_amount), n(cgst_pct), n(cgst_amt), n(sgst_pct), n(sgst_amt),
          n(igst_pct), n(igst_amt), gst_amount, total_amount,
          st, remarks || null, req.user.id, req.user.company_id,
        ]
      );
      const estId = r.rows[0].id;

      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        if (!it.material_name?.trim()) continue;
        const amt = n(it.quantity) * n(it.rate);
        await client.query(
          `INSERT INTO estimate_items (estimate_id, material_name, unit, quantity, rate, amount, sort_order)
           VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [estId, it.material_name, it.unit || 'Nos', n(it.quantity), n(it.rate), n(it.amount) || amt, i + 1]
        );
      }
      return r.rows[0];
    });

    const full = await getEstimate(result.id, req.user.company_id);
    res.status(201).json({ data: full });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── UPDATE ───────────────────────────────────────────────────────────────────
router.put('/:id', authenticate, async (req, res) => {
  try {
    const existing = await getEstimate(req.params.id, req.user.company_id);
    if (!existing) return res.status(404).json({ error: 'Estimate not found' });

    const {
      estimate_date, expiry_date, client_name, project_id, work_description,
      tax_mode = 'intrastate',
      basic_amount = 0,
      cgst_pct = 0, cgst_amt = 0,
      sgst_pct = 0, sgst_amt = 0,
      igst_pct = 0, igst_amt = 0,
      status, remarks, items = [],
    } = req.body;

    const gst_amount   = n(cgst_amt) + n(sgst_amt) + n(igst_amt);
    const total_amount = n(basic_amount) + gst_amount;
    const st = ['draft','sent','accepted','declined','expired'].includes(status) ? status : existing.status;

    await withTransaction(async (client) => {
      await client.query(
        `UPDATE estimates SET
          estimate_date=$1, expiry_date=$2, client_name=$3, project_id=$4, work_description=$5, tax_mode=$6,
          basic_amount=$7, cgst_pct=$8, cgst_amt=$9, sgst_pct=$10, sgst_amt=$11,
          igst_pct=$12, igst_amt=$13, gst_amount=$14, total_amount=$15,
          status=$16, remarks=$17, updated_at=NOW()
         WHERE id=$18 AND company_id=$19`,
        [
          estimate_date, expiry_date || null, client_name, project_id || null, work_description || null, tax_mode,
          n(basic_amount), n(cgst_pct), n(cgst_amt), n(sgst_pct), n(sgst_amt),
          n(igst_pct), n(igst_amt), gst_amount, total_amount,
          st, remarks || null, req.params.id, req.user.company_id,
        ]
      );

      await client.query(`DELETE FROM estimate_items WHERE estimate_id = $1`, [req.params.id]);
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        if (!it.material_name?.trim()) continue;
        const amt = n(it.quantity) * n(it.rate);
        await client.query(
          `INSERT INTO estimate_items (estimate_id, material_name, unit, quantity, rate, amount, sort_order)
           VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [req.params.id, it.material_name, it.unit || 'Nos', n(it.quantity), n(it.rate), n(it.amount) || amt, i + 1]
        );
      }
    });

    const full = await getEstimate(req.params.id, req.user.company_id);
    res.json({ data: full });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── STATUS UPDATE ────────────────────────────────────────────────────────────
router.patch('/:id/status', authenticate, async (req, res) => {
  try {
    const { status } = req.body;
    const allowed = ['draft','sent','accepted','declined','expired'];
    if (!allowed.includes(status)) return res.status(400).json({ error: `status must be one of: ${allowed.join(', ')}` });

    const existing = await getEstimate(req.params.id, req.user.company_id);
    if (!existing) return res.status(404).json({ error: 'Estimate not found' });

    await query(`UPDATE estimates SET status = $1, updated_at = NOW() WHERE id = $2`, [status, req.params.id]);
    const full = await getEstimate(req.params.id, req.user.company_id);
    res.json({ data: full });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── DELETE (draft only) ──────────────────────────────────────────────────────
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const existing = await getEstimate(req.params.id, req.user.company_id);
    if (!existing) return res.status(404).json({ error: 'Estimate not found' });
    if (existing.status !== 'draft') return res.status(400).json({ error: 'Only draft estimates can be deleted' });

    await query(`DELETE FROM estimates WHERE id = $1`, [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
