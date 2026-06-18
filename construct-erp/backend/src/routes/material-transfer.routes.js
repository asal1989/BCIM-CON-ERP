// src/routes/material-transfer.routes.js  — Material Transfer (MTR)
const express  = require('express');
const { authenticate } = require('../middleware/auth');
const { query, withTransaction } = require('../config/database');
const { loadProjectScope, appendProjectScope } = require('../middleware/projectScope');
const router = express.Router();
router.use(authenticate);
router.use(loadProjectScope);

/* ── Auto-migrate ─────────────────────────────────────────────────────────── */
(async () => {
  const safe = async (sql) => { try { await query(sql); } catch {} };
  await safe(`
    CREATE TABLE IF NOT EXISTS material_transfers (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id UUID NOT NULL REFERENCES companies(id),
      mtr_number VARCHAR(30) NOT NULL,
      transfer_date DATE NOT NULL DEFAULT CURRENT_DATE,
      transfer_type VARCHAR(30) NOT NULL DEFAULT 'site_to_site'
        CHECK (transfer_type IN ('site_to_site','store_to_site','site_to_store','inter_store','return_to_store')),
      from_project_id UUID REFERENCES projects(id),
      from_location VARCHAR(200),
      to_project_id UUID REFERENCES projects(id),
      to_location VARCHAR(200),
      purpose TEXT,
      vehicle_number VARCHAR(50),
      driver_name VARCHAR(100),
      driver_mobile VARCHAR(20),
      lr_number VARCHAR(50),
      status VARCHAR(20) NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft','pending_approval','approved','issued','in_transit','received','cancelled')),
      approved_by UUID REFERENCES users(id),
      approved_at TIMESTAMPTZ,
      issued_by UUID REFERENCES users(id),
      issued_at TIMESTAMPTZ,
      received_by UUID REFERENCES users(id),
      received_at TIMESTAMPTZ,
      cancelled_by UUID REFERENCES users(id),
      cancelled_at TIMESTAMPTZ,
      cancel_reason TEXT,
      remarks TEXT,
      created_by UUID REFERENCES users(id),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (company_id, mtr_number)
    )`);
  await safe(`
    CREATE TABLE IF NOT EXISTS material_transfer_items (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      mtr_id UUID NOT NULL REFERENCES material_transfers(id) ON DELETE CASCADE,
      material_name VARCHAR(300) NOT NULL,
      material_code VARCHAR(100),
      unit VARCHAR(30) NOT NULL,
      requested_qty NUMERIC(14,3) NOT NULL DEFAULT 0,
      approved_qty NUMERIC(14,3),
      issued_qty NUMERIC(14,3),
      received_qty NUMERIC(14,3),
      rate NUMERIC(14,2) DEFAULT 0,
      amount NUMERIC(18,2) GENERATED ALWAYS AS (
        COALESCE(issued_qty, approved_qty, requested_qty, 0) * COALESCE(rate, 0)
      ) STORED,
      source_bin VARCHAR(100),
      dest_bin VARCHAR(100),
      condition_note VARCHAR(200),
      remarks TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`);
  await safe(`CREATE INDEX IF NOT EXISTS idx_mtr_company ON material_transfers(company_id)`);
  await safe(`CREATE INDEX IF NOT EXISTS idx_mtr_items ON material_transfer_items(mtr_id)`);
  console.log('[MTR] Schema OK');
})();

/* ── Helper: next MTR number ─────────────────────────────────────────────── */
async function nextMTRNumber(companyId) {
  const r = await query(
    `SELECT mtr_number FROM material_transfers
     WHERE company_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [companyId]
  );
  if (r.rows.length === 0) return 'MTR-0001';
  const last = r.rows[0].mtr_number;
  const n = parseInt(last.replace(/\D/g, ''), 10) || 0;
  return `MTR-${String(n + 1).padStart(4, '0')}`;
}

/* ── GET /  — list transfers ──────────────────────────────────────────────── */
router.get('/', async (req, res) => {
  try {
    const cid = req.user.company_id;
    const { status, from_project_id, to_project_id, search, limit = 100, offset = 0 } = req.query;

    let where = ['m.company_id = $1'];
    const params = [cid];
    let p = 2;

    if (status) { where.push(`m.status = $${p++}`); params.push(status); }
    if (from_project_id) { where.push(`m.from_project_id = $${p++}`); params.push(from_project_id); }
    if (to_project_id) { where.push(`m.to_project_id = $${p++}`); params.push(to_project_id); }
    if (search) {
      where.push(`(m.mtr_number ILIKE $${p} OR m.purpose ILIKE $${p} OR m.vehicle_number ILIKE $${p})`);
      params.push(`%${search}%`); p++;
    }
    if (!req.isGlobalRole) {
      const ids = req.allowedProjectIds || [];
      if (ids.length === 0) {
        where.push('FALSE');
      } else {
        where.push(`(m.from_project_id = ANY($${p}::uuid[]) OR m.to_project_id = ANY($${p}::uuid[]))`);
        params.push(ids); p++;
      }
    }

    const rows = await query(`
      SELECT m.*,
        fp.name AS from_project_name, fp.project_code AS from_project_code,
        tp.name AS to_project_name,   tp.project_code AS to_project_code,
        cb.name AS created_by_name,
        (SELECT COUNT(*) FROM material_transfer_items WHERE mtr_id = m.id) AS item_count,
        (SELECT COALESCE(SUM(amount),0) FROM material_transfer_items WHERE mtr_id = m.id) AS total_amount
      FROM material_transfers m
      LEFT JOIN projects fp ON fp.id = m.from_project_id
      LEFT JOIN projects tp ON tp.id = m.to_project_id
      LEFT JOIN users cb ON cb.id = m.created_by
      WHERE ${where.join(' AND ')}
      ORDER BY m.created_at DESC
      LIMIT $${p++} OFFSET $${p++}
    `, [...params, parseInt(limit), parseInt(offset)]);

    res.json({ data: rows.rows });
  } catch (e) {
    console.error('[MTR list]', e);
    res.status(500).json({ error: e.message });
  }
});

/* ── GET /stats  — dashboard KPIs ─────────────────────────────────────────── */
router.get('/stats', async (req, res) => {
  try {
    const cid = req.user.company_id;
    const r = await query(`
      SELECT
        COUNT(*) FILTER (WHERE status NOT IN ('cancelled')) AS total,
        COUNT(*) FILTER (WHERE status = 'pending_approval') AS pending_approval,
        COUNT(*) FILTER (WHERE status IN ('approved','issued','in_transit')) AS in_transit,
        COUNT(*) FILTER (WHERE status = 'received') AS received,
        COUNT(*) FILTER (WHERE status = 'draft') AS draft,
        COALESCE(SUM(
          (SELECT COALESCE(SUM(amount),0) FROM material_transfer_items WHERE mtr_id = m.id)
        ) FILTER (WHERE status NOT IN ('cancelled')), 0) AS total_value
      FROM material_transfers m
      WHERE company_id = $1
    `, [cid]);
    res.json({ data: r.rows[0] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* ── GET /:id  — single with items ──────────────────────────────────────────── */
router.get('/:id', async (req, res) => {
  try {
    const cid = req.user.company_id;
    const r = await query(`
      SELECT m.*,
        fp.name AS from_project_name, fp.project_code AS from_project_code,
        tp.name AS to_project_name,   tp.project_code AS to_project_code,
        cb.name AS created_by_name,
        ab.name AS approved_by_name,
        ib.name AS issued_by_name,
        rb.name AS received_by_name
      FROM material_transfers m
      LEFT JOIN projects fp ON fp.id = m.from_project_id
      LEFT JOIN projects tp ON tp.id = m.to_project_id
      LEFT JOIN users cb ON cb.id = m.created_by
      LEFT JOIN users ab ON ab.id = m.approved_by
      LEFT JOIN users ib ON ib.id = m.issued_by
      LEFT JOIN users rb ON rb.id = m.received_by
      WHERE m.id = $1 AND m.company_id = $2
    `, [req.params.id, cid]);

    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });

    const items = await query(
      `SELECT * FROM material_transfer_items WHERE mtr_id = $1 ORDER BY created_at`,
      [req.params.id]
    );

    res.json({ data: { ...r.rows[0], items: items.rows } });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* ── POST /  — create transfer ─────────────────────────────────────────────── */
router.post('/', async (req, res) => {
  try {
    const cid = req.user.company_id;
    const uid = req.user.id;
    const {
      transfer_date, transfer_type = 'site_to_site',
      from_project_id, from_location, to_project_id, to_location,
      purpose, vehicle_number, driver_name, driver_mobile, lr_number,
      remarks, items = []
    } = req.body;

    if (!items.length) return res.status(400).json({ error: 'At least one item required' });
    if (!from_project_id && !from_location) return res.status(400).json({ error: 'From location required' });
    if (!to_project_id && !to_location) return res.status(400).json({ error: 'To location required' });

    const mtr_number = await nextMTRNumber(cid);

    const result = await withTransaction(async (client) => {
      const m = await client.query(`
        INSERT INTO material_transfers
          (company_id, mtr_number, transfer_date, transfer_type,
           from_project_id, from_location, to_project_id, to_location,
           purpose, vehicle_number, driver_name, driver_mobile, lr_number,
           remarks, status, created_by)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'draft',$15)
        RETURNING *
      `, [cid, mtr_number, transfer_date || new Date().toISOString().slice(0,10),
          transfer_type, from_project_id||null, from_location||null,
          to_project_id||null, to_location||null,
          purpose||null, vehicle_number||null, driver_name||null,
          driver_mobile||null, lr_number||null, remarks||null, uid]);

      const mtrId = m.rows[0].id;
      for (const it of items) {
        await client.query(`
          INSERT INTO material_transfer_items
            (mtr_id, material_name, material_code, unit, requested_qty, rate, source_bin, dest_bin, condition_note, remarks)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
        `, [mtrId, it.material_name, it.material_code||null, it.unit,
            parseFloat(it.requested_qty)||0, parseFloat(it.rate)||0,
            it.source_bin||null, it.dest_bin||null, it.condition_note||null, it.remarks||null]);
      }
      return m.rows[0];
    });

    res.status(201).json({ data: result, message: `Transfer ${mtr_number} created` });
  } catch (e) {
    console.error('[MTR create]', e);
    res.status(500).json({ error: e.message });
  }
});

/* ── PUT /:id  — update (draft only) ──────────────────────────────────────── */
router.put('/:id', async (req, res) => {
  try {
    const cid = req.user.company_id;
    const existing = await query(
      `SELECT * FROM material_transfers WHERE id=$1 AND company_id=$2`, [req.params.id, cid]
    );
    if (!existing.rows.length) return res.status(404).json({ error: 'Not found' });
    if (!['draft','pending_approval'].includes(existing.rows[0].status))
      return res.status(400).json({ error: 'Can only edit draft or pending transfers' });

    const {
      transfer_date, transfer_type, from_project_id, from_location,
      to_project_id, to_location, purpose, vehicle_number, driver_name,
      driver_mobile, lr_number, remarks, items = []
    } = req.body;

    await withTransaction(async (client) => {
      await client.query(`
        UPDATE material_transfers SET
          transfer_date=$1, transfer_type=$2, from_project_id=$3, from_location=$4,
          to_project_id=$5, to_location=$6, purpose=$7, vehicle_number=$8,
          driver_name=$9, driver_mobile=$10, lr_number=$11, remarks=$12, updated_at=NOW()
        WHERE id=$13
      `, [transfer_date, transfer_type, from_project_id||null, from_location||null,
          to_project_id||null, to_location||null, purpose||null, vehicle_number||null,
          driver_name||null, driver_mobile||null, lr_number||null, remarks||null, req.params.id]);

      if (items.length) {
        await client.query(`DELETE FROM material_transfer_items WHERE mtr_id=$1`, [req.params.id]);
        for (const it of items) {
          await client.query(`
            INSERT INTO material_transfer_items
              (mtr_id, material_name, material_code, unit, requested_qty, rate, source_bin, dest_bin, condition_note, remarks)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
          `, [req.params.id, it.material_name, it.material_code||null, it.unit,
              parseFloat(it.requested_qty)||0, parseFloat(it.rate)||0,
              it.source_bin||null, it.dest_bin||null, it.condition_note||null, it.remarks||null]);
        }
      }
    });

    res.json({ message: 'Updated' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* ── POST /:id/submit  — submit for approval ─────────────────────────────── */
router.post('/:id/submit', async (req, res) => {
  try {
    const cid = req.user.company_id;
    const r = await query(
      `UPDATE material_transfers SET status='pending_approval', updated_at=NOW()
       WHERE id=$1 AND company_id=$2 AND status='draft' RETURNING mtr_number`,
      [req.params.id, cid]
    );
    if (!r.rows.length) return res.status(400).json({ error: 'Transfer not in draft status' });
    res.json({ message: `${r.rows[0].mtr_number} submitted for approval` });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* ── POST /:id/approve ────────────────────────────────────────────────────── */
router.post('/:id/approve', async (req, res) => {
  try {
    const cid = req.user.company_id;
    const uid = req.user.id;
    const { approved_quantities = [] } = req.body; // [{item_id, approved_qty}]

    await withTransaction(async (client) => {
      const r = await client.query(
        `UPDATE material_transfers SET status='approved', approved_by=$1, approved_at=NOW(), updated_at=NOW()
         WHERE id=$2 AND company_id=$3 AND status IN ('draft','pending_approval') RETURNING mtr_number`,
        [uid, req.params.id, cid]
      );
      if (!r.rows.length) throw new Error('Transfer not in approvable state');

      for (const aq of approved_quantities) {
        await client.query(
          `UPDATE material_transfer_items SET approved_qty=$1 WHERE id=$2 AND mtr_id=$3`,
          [aq.approved_qty, aq.item_id, req.params.id]
        );
      }
    });

    res.json({ message: 'Transfer approved' });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

/* ── POST /:id/issue  — dispatch from source ──────────────────────────────── */
router.post('/:id/issue', async (req, res) => {
  try {
    const cid = req.user.company_id;
    const uid = req.user.id;
    const { issued_quantities = [] } = req.body; // [{item_id, issued_qty}]

    await withTransaction(async (client) => {
      const r = await client.query(
        `UPDATE material_transfers SET status='in_transit', issued_by=$1, issued_at=NOW(), updated_at=NOW()
         WHERE id=$2 AND company_id=$3 AND status='approved' RETURNING mtr_number`,
        [uid, req.params.id, cid]
      );
      if (!r.rows.length) throw new Error('Transfer must be approved before issuing');

      for (const iq of issued_quantities) {
        await client.query(
          `UPDATE material_transfer_items SET issued_qty=$1 WHERE id=$2 AND mtr_id=$3`,
          [iq.issued_qty, iq.item_id, req.params.id]
        );
      }
    });

    res.json({ message: 'Transfer issued — in transit' });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

/* ── POST /:id/receive  — confirm receipt at destination ──────────────────── */
router.post('/:id/receive', async (req, res) => {
  try {
    const cid = req.user.company_id;
    const uid = req.user.id;
    const { received_quantities = [], receipt_remarks } = req.body;

    await withTransaction(async (client) => {
      const r = await client.query(
        `UPDATE material_transfers SET status='received', received_by=$1, received_at=NOW(),
         remarks=COALESCE($2, remarks), updated_at=NOW()
         WHERE id=$3 AND company_id=$4 AND status IN ('in_transit','issued') RETURNING mtr_number`,
        [uid, receipt_remarks||null, req.params.id, cid]
      );
      if (!r.rows.length) throw new Error('Transfer must be in transit before receiving');

      for (const rq of received_quantities) {
        await client.query(
          `UPDATE material_transfer_items SET received_qty=$1 WHERE id=$2 AND mtr_id=$3`,
          [rq.received_qty, rq.item_id, req.params.id]
        );
      }
    });

    res.json({ message: 'Transfer received at destination' });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

/* ── DELETE /:id  — cancel ──────────────────────────────────────────────── */
router.delete('/:id', async (req, res) => {
  try {
    const cid = req.user.company_id;
    const uid = req.user.id;
    const { reason } = req.body;
    const r = await query(
      `UPDATE material_transfers SET status='cancelled', cancelled_by=$1, cancelled_at=NOW(),
       cancel_reason=$2, updated_at=NOW()
       WHERE id=$3 AND company_id=$4 AND status IN ('draft','pending_approval') RETURNING mtr_number`,
      [uid, reason||null, req.params.id, cid]
    );
    if (!r.rows.length) return res.status(400).json({ error: 'Can only cancel draft/pending transfers' });
    res.json({ message: `${r.rows[0].mtr_number} cancelled` });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
