// backend/src/routes/material-tracker.routes.js
// Procurement Material Tracker — Cement / Concrete / Steel
// Stores staff register POs and add per-load delivery entries.
const express = require('express');
const router  = express.Router();
const { query } = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');
const { loadProjectScope } = require('../middleware/projectScope');

const WRITE_ROLES = ['store_keeper','stores_manager','stores_officer','admin','super_admin'];

// ── Auto-migrate ──────────────────────────────────────────────────────────────
(async () => {
  const safe = async (sql) => { try { await query(sql); } catch (_) {} };

  await safe(`
    CREATE TABLE IF NOT EXISTS material_tracker_entries (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id    UUID NOT NULL,
      project_id    UUID REFERENCES projects(id),
      material_type VARCHAR(20) NOT NULL CHECK (material_type IN ('cement','concrete','steel')),
      po_id         UUID REFERENCES purchase_orders(id),
      po_number     VARCHAR(80),
      vendor_name   VARCHAR(200),
      grade         VARCHAR(50),
      mr_number     VARCHAR(100),
      mr_qty        NUMERIC(14,3),
      ordered_qty   NUMERIC(14,3),
      unit          VARCHAR(30),
      created_by    UUID REFERENCES users(id),
      created_at    TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await safe(`
    CREATE TABLE IF NOT EXISTS material_tracker_loads (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      entry_id        UUID NOT NULL REFERENCES material_tracker_entries(id) ON DELETE CASCADE,
      received_date   DATE NOT NULL,
      invoice_no      VARCHAR(100),
      ign_no          VARCHAR(50),
      grs_no          VARCHAR(50),
      vehicle_no      VARCHAR(50),
      invoice_qty     NUMERIC(14,3),
      weighbridge_qty NUMERIC(14,3),
      rate            NUMERIC(14,2),
      gst_rate        NUMERIC(5,2) DEFAULT 18,
      gst_amount      NUMERIC(14,2),
      tcs_amount      NUMERIC(14,2) DEFAULT 0,
      grand_total     NUMERIC(14,2),
      remarks         TEXT,
      created_by      UUID REFERENCES users(id),
      created_at      TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await safe(`
    CREATE TABLE IF NOT EXISTS material_tracker_steel_dia (
      id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      load_id   UUID NOT NULL REFERENCES material_tracker_loads(id) ON DELETE CASCADE,
      dia_8mm   NUMERIC(14,3) DEFAULT 0,
      dia_10mm  NUMERIC(14,3) DEFAULT 0,
      dia_12mm  NUMERIC(14,3) DEFAULT 0,
      dia_16mm  NUMERIC(14,3) DEFAULT 0,
      dia_20mm  NUMERIC(14,3) DEFAULT 0,
      dia_25mm  NUMERIC(14,3) DEFAULT 0,
      dia_32mm  NUMERIC(14,3) DEFAULT 0
    )
  `);

  await safe(`CREATE INDEX IF NOT EXISTS idx_mte_company   ON material_tracker_entries(company_id)`);
  await safe(`CREATE INDEX IF NOT EXISTS idx_mte_project   ON material_tracker_entries(project_id)`);
  await safe(`CREATE INDEX IF NOT EXISTS idx_mte_type      ON material_tracker_entries(material_type)`);
  await safe(`CREATE INDEX IF NOT EXISTS idx_mtl_entry     ON material_tracker_loads(entry_id)`);
  await safe(`CREATE INDEX IF NOT EXISTS idx_mtsd_load     ON material_tracker_steel_dia(load_id)`);

  // Auto-import dedup columns
  await safe(`ALTER TABLE material_tracker_loads ADD COLUMN IF NOT EXISTS source_grn_id  UUID`);
  await safe(`ALTER TABLE material_tracker_loads ADD COLUMN IF NOT EXISTS source_bill_id UUID`);
  await safe(`CREATE INDEX IF NOT EXISTS idx_mtl_src_grn  ON material_tracker_loads(source_grn_id)  WHERE source_grn_id  IS NOT NULL`);
  await safe(`CREATE INDEX IF NOT EXISTS idx_mtl_src_bill ON material_tracker_loads(source_bill_id) WHERE source_bill_id IS NOT NULL`);

  console.log('[MaterialTracker] Schema migration OK');
})();

router.use(authenticate);
router.use(loadProjectScope);

// ── GET /material-tracker/report/abstract ─────────────────────────────────────
router.get('/report/abstract', async (req, res) => {
  try {
    const { project_id, material_type } = req.query;
    const companyId = req.user.company_id;

    let where = `e.company_id = $1`;
    const params = [companyId];
    let idx = 2;

    if (project_id) { where += ` AND e.project_id = $${idx++}`; params.push(project_id); }
    if (material_type) { where += ` AND e.material_type = $${idx++}`; params.push(material_type); }

    const rows = await query(`
      SELECT
        e.id, e.po_number, e.po_id, e.vendor_name, e.grade, e.mr_number,
        e.mr_qty, e.ordered_qty, e.unit, e.material_type, e.created_at,
        p.name AS project_name,
        COALESCE(SUM(l.invoice_qty), 0)                          AS supplied_qty,
        e.ordered_qty - COALESCE(SUM(l.invoice_qty), 0)          AS balance_qty,
        COALESCE(SUM(l.invoice_qty * l.rate), 0)                 AS basic_supplied_value,
        COALESCE(SUM(l.grand_total), 0)                          AS supplied_value_with_gst,
        COALESCE(AVG(l.rate) FILTER (WHERE l.rate > 0), 0)       AS avg_rate,
        COUNT(l.id)                                              AS load_count
      FROM material_tracker_entries e
      LEFT JOIN projects p ON p.id = e.project_id
      LEFT JOIN material_tracker_loads l ON l.entry_id = e.id
      WHERE ${where}
      GROUP BY e.id, p.name
      ORDER BY e.created_at DESC
    `, params);

    res.json({ data: rows.rows });
  } catch (err) {
    console.error('[MaterialTracker] abstract error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /material-tracker/report/loadwise ─────────────────────────────────────
router.get('/report/loadwise', async (req, res) => {
  try {
    const { project_id, material_type, entry_id } = req.query;
    const companyId = req.user.company_id;

    let where = `e.company_id = $1`;
    const params = [companyId];
    let idx = 2;

    if (project_id)   { where += ` AND e.project_id = $${idx++}`;    params.push(project_id); }
    if (material_type){ where += ` AND e.material_type = $${idx++}`;  params.push(material_type); }
    if (entry_id)     { where += ` AND e.id = $${idx++}`;             params.push(entry_id); }

    const rows = await query(`
      SELECT
        e.id AS entry_id, e.po_number, e.vendor_name, e.grade, e.unit, e.material_type,
        p.name AS project_name,
        l.id AS load_id, l.received_date, l.invoice_no, l.ign_no, l.grs_no,
        l.vehicle_no, l.invoice_qty, l.weighbridge_qty,
        (l.weighbridge_qty - l.invoice_qty) AS difference,
        l.rate, l.gst_rate, l.gst_amount, l.tcs_amount, l.grand_total, l.remarks,
        l.created_at AS load_created_at,
        sd.dia_8mm, sd.dia_10mm, sd.dia_12mm, sd.dia_16mm,
        sd.dia_20mm, sd.dia_25mm, sd.dia_32mm
      FROM material_tracker_entries e
      LEFT JOIN projects p ON p.id = e.project_id
      JOIN  material_tracker_loads l      ON l.entry_id = e.id
      LEFT JOIN material_tracker_steel_dia sd ON sd.load_id = l.id
      WHERE ${where}
      ORDER BY e.po_number, l.received_date, l.created_at
    `, params);

    res.json({ data: rows.rows });
  } catch (err) {
    console.error('[MaterialTracker] loadwise error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /material-tracker ─────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { project_id, material_type } = req.query;
    const companyId = req.user.company_id;

    let where = `e.company_id = $1`;
    const params = [companyId];
    let idx = 2;

    if (project_id)   { where += ` AND e.project_id = $${idx++}`;   params.push(project_id); }
    if (material_type){ where += ` AND e.material_type = $${idx++}`; params.push(material_type); }

    const rows = await query(`
      SELECT
        e.*,
        p.name AS project_name,
        COALESCE(SUM(l.invoice_qty), 0)                 AS supplied_qty,
        e.ordered_qty - COALESCE(SUM(l.invoice_qty), 0) AS balance_qty,
        COUNT(l.id)                                     AS load_count
      FROM material_tracker_entries e
      LEFT JOIN projects p  ON p.id = e.project_id
      LEFT JOIN material_tracker_loads l ON l.entry_id = e.id
      WHERE ${where}
      GROUP BY e.id, p.name
      ORDER BY e.created_at DESC
    `, params);

    res.json({ data: rows.rows });
  } catch (err) {
    console.error('[MaterialTracker] list error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /material-tracker — register a PO ────────────────────────────────────
router.post('/', authorize(...WRITE_ROLES), async (req, res) => {
  try {
    const { project_id, material_type, po_id, po_number, vendor_name, grade,
            mr_number, mr_qty, ordered_qty, unit } = req.body;
    const companyId = req.user.company_id;

    if (!project_id)   return res.status(400).json({ error: 'project_id required' });
    if (!material_type) return res.status(400).json({ error: 'material_type required' });
    if (!po_number)    return res.status(400).json({ error: 'po_number required' });

    const row = await query(`
      INSERT INTO material_tracker_entries
        (company_id, project_id, material_type, po_id, po_number, vendor_name,
         grade, mr_number, mr_qty, ordered_qty, unit, created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
      RETURNING *
    `, [companyId, project_id, material_type, po_id || null, po_number, vendor_name || null,
        grade || null, mr_number || null, mr_qty || null, ordered_qty || null,
        unit || null, req.user.id]);

    res.status(201).json({ data: row.rows[0] });
  } catch (err) {
    console.error('[MaterialTracker] create error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /material-tracker/:id — entry + loads ────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const companyId = req.user.company_id;

    const entry = await query(`
      SELECT e.*, p.name AS project_name
      FROM material_tracker_entries e
      LEFT JOIN projects p ON p.id = e.project_id
      WHERE e.id = $1 AND e.company_id = $2
    `, [req.params.id, companyId]);

    if (!entry.rows.length) return res.status(404).json({ error: 'Not found' });

    const loads = await query(`
      SELECT l.*,
        (l.weighbridge_qty - l.invoice_qty) AS difference,
        sd.dia_8mm, sd.dia_10mm, sd.dia_12mm, sd.dia_16mm,
        sd.dia_20mm, sd.dia_25mm, sd.dia_32mm
      FROM material_tracker_loads l
      LEFT JOIN material_tracker_steel_dia sd ON sd.load_id = l.id
      WHERE l.entry_id = $1
      ORDER BY l.received_date, l.created_at
    `, [req.params.id]);

    res.json({ data: { ...entry.rows[0], loads: loads.rows } });
  } catch (err) {
    console.error('[MaterialTracker] get error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── PUT /material-tracker/:id — update entry header ──────────────────────────
router.put('/:id', authorize(...WRITE_ROLES), async (req, res) => {
  try {
    const { vendor_name, grade, mr_number, mr_qty, ordered_qty, unit } = req.body;
    const companyId = req.user.company_id;

    const row = await query(`
      UPDATE material_tracker_entries
      SET vendor_name=$1, grade=$2, mr_number=$3, mr_qty=$4, ordered_qty=$5, unit=$6
      WHERE id=$7 AND company_id=$8
      RETURNING *
    `, [vendor_name||null, grade||null, mr_number||null, mr_qty||null,
        ordered_qty||null, unit||null, req.params.id, companyId]);

    if (!row.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json({ data: row.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /material-tracker/:id ─────────────────────────────────────────────
router.delete('/:id', authorize('admin','super_admin'), async (req, res) => {
  try {
    await query(`DELETE FROM material_tracker_entries WHERE id=$1 AND company_id=$2`,
                [req.params.id, req.user.company_id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /material-tracker/:id/loads — add a load ────────────────────────────
router.post('/:id/loads', authorize(...WRITE_ROLES), async (req, res) => {
  try {
    const {
      received_date, invoice_no, ign_no, grs_no, vehicle_no,
      invoice_qty, weighbridge_qty, rate, gst_rate, gst_amount,
      tcs_amount, grand_total, remarks,
      dia  // { dia_8mm, dia_10mm, ... } for steel
    } = req.body;

    const companyId = req.user.company_id;

    // Verify entry belongs to this company
    const check = await query(
      `SELECT id, material_type FROM material_tracker_entries WHERE id=$1 AND company_id=$2`,
      [req.params.id, companyId]
    );
    if (!check.rows.length) return res.status(404).json({ error: 'Entry not found' });

    const load = await query(`
      INSERT INTO material_tracker_loads
        (entry_id, received_date, invoice_no, ign_no, grs_no, vehicle_no,
         invoice_qty, weighbridge_qty, rate, gst_rate, gst_amount,
         tcs_amount, grand_total, remarks, created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
      RETURNING *
    `, [req.params.id, received_date, invoice_no||null, ign_no||null, grs_no||null,
        vehicle_no||null, invoice_qty||null, weighbridge_qty||null, rate||null,
        gst_rate||18, gst_amount||null, tcs_amount||0, grand_total||null,
        remarks||null, req.user.id]);

    const loadId = load.rows[0].id;

    // Insert dia breakdown for steel
    if (check.rows[0].material_type === 'steel' && dia) {
      await query(`
        INSERT INTO material_tracker_steel_dia
          (load_id, dia_8mm, dia_10mm, dia_12mm, dia_16mm, dia_20mm, dia_25mm, dia_32mm)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      `, [loadId,
          parseFloat(dia.dia_8mm  || 0), parseFloat(dia.dia_10mm || 0),
          parseFloat(dia.dia_12mm || 0), parseFloat(dia.dia_16mm || 0),
          parseFloat(dia.dia_20mm || 0), parseFloat(dia.dia_25mm || 0),
          parseFloat(dia.dia_32mm || 0)]);
    }

    // Return load with dia
    const full = await query(`
      SELECT l.*, (l.weighbridge_qty - l.invoice_qty) AS difference,
        sd.dia_8mm, sd.dia_10mm, sd.dia_12mm, sd.dia_16mm,
        sd.dia_20mm, sd.dia_25mm, sd.dia_32mm
      FROM material_tracker_loads l
      LEFT JOIN material_tracker_steel_dia sd ON sd.load_id = l.id
      WHERE l.id = $1
    `, [loadId]);

    res.status(201).json({ data: full.rows[0] });
  } catch (err) {
    console.error('[MaterialTracker] addLoad error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── PUT /material-tracker/:id/loads/:loadId ───────────────────────────────────
router.put('/:id/loads/:loadId', authorize(...WRITE_ROLES), async (req, res) => {
  try {
    const {
      received_date, invoice_no, ign_no, grs_no, vehicle_no,
      invoice_qty, weighbridge_qty, rate, gst_rate, gst_amount,
      tcs_amount, grand_total, remarks, dia
    } = req.body;

    const companyId = req.user.company_id;

    // Verify ownership via entry
    const check = await query(`
      SELECT l.id, e.material_type
      FROM material_tracker_loads l
      JOIN material_tracker_entries e ON e.id = l.entry_id
      WHERE l.id = $1 AND l.entry_id = $2 AND e.company_id = $3
    `, [req.params.loadId, req.params.id, companyId]);
    if (!check.rows.length) return res.status(404).json({ error: 'Load not found' });

    await query(`
      UPDATE material_tracker_loads
      SET received_date=$1, invoice_no=$2, ign_no=$3, grs_no=$4, vehicle_no=$5,
          invoice_qty=$6, weighbridge_qty=$7, rate=$8, gst_rate=$9, gst_amount=$10,
          tcs_amount=$11, grand_total=$12, remarks=$13
      WHERE id=$14
    `, [received_date, invoice_no||null, ign_no||null, grs_no||null, vehicle_no||null,
        invoice_qty||null, weighbridge_qty||null, rate||null, gst_rate||18,
        gst_amount||null, tcs_amount||0, grand_total||null, remarks||null,
        req.params.loadId]);

    // Upsert dia for steel
    if (check.rows[0].material_type === 'steel' && dia) {
      await query(`
        INSERT INTO material_tracker_steel_dia
          (load_id, dia_8mm, dia_10mm, dia_12mm, dia_16mm, dia_20mm, dia_25mm, dia_32mm)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
        ON CONFLICT (load_id) DO UPDATE SET
          dia_8mm=$2, dia_10mm=$3, dia_12mm=$4, dia_16mm=$5,
          dia_20mm=$6, dia_25mm=$7, dia_32mm=$8
      `, [req.params.loadId,
          parseFloat(dia.dia_8mm  || 0), parseFloat(dia.dia_10mm || 0),
          parseFloat(dia.dia_12mm || 0), parseFloat(dia.dia_16mm || 0),
          parseFloat(dia.dia_20mm || 0), parseFloat(dia.dia_25mm || 0),
          parseFloat(dia.dia_32mm || 0)]);
    }

    const full = await query(`
      SELECT l.*, (l.weighbridge_qty - l.invoice_qty) AS difference,
        sd.dia_8mm, sd.dia_10mm, sd.dia_12mm, sd.dia_16mm,
        sd.dia_20mm, sd.dia_25mm, sd.dia_32mm
      FROM material_tracker_loads l
      LEFT JOIN material_tracker_steel_dia sd ON sd.load_id = l.id
      WHERE l.id = $1
    `, [req.params.loadId]);

    res.json({ data: full.rows[0] });
  } catch (err) {
    console.error('[MaterialTracker] updateLoad error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /material-tracker/:id/loads/:loadId ───────────────────────────────
router.delete('/:id/loads/:loadId', authorize(...WRITE_ROLES), async (req, res) => {
  try {
    const companyId = req.user.company_id;
    const check = await query(`
      SELECT l.id FROM material_tracker_loads l
      JOIN material_tracker_entries e ON e.id = l.entry_id
      WHERE l.id=$1 AND l.entry_id=$2 AND e.company_id=$3
    `, [req.params.loadId, req.params.id, companyId]);
    if (!check.rows.length) return res.status(404).json({ error: 'Load not found' });

    await query(`DELETE FROM material_tracker_loads WHERE id=$1`, [req.params.loadId]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Keyword sets per material type ───────────────────────────────────────────
const MATERIAL_KEYWORDS = {
  cement:   ['cement'],
  concrete: ['concrete', 'rmc', 'ready mix'],
  steel:    ['steel', 'tmt', 'rebar', 'ms rod'],
};

function kwCondition(kws, alias, col, startIdx) {
  return kws.map((_, i) => `LOWER(${alias}.${col}) LIKE $${startIdx + i}`).join(' OR ');
}

// ── GET /auto-import/preview ──────────────────────────────────────────────────
router.get('/auto-import/preview', async (req, res) => {
  try {
    const { project_id, material_type = 'cement' } = req.query;
    const companyId = req.user.company_id;
    const kws = MATERIAL_KEYWORDS[material_type] || MATERIAL_KEYWORDS.cement;
    const kwPats = kws.map(k => `%${k}%`);

    // params: [companyId, ...kwPats, ?project_id]
    let params = [companyId, ...kwPats];
    let projFilter = '';
    if (project_id) { projFilter = ` AND po.project_id = $${params.length + 1}`; params.push(project_id); }

    const kwCond = kwCondition(kws, 'pi', 'material_name', 2);

    const pos = await query(`
      SELECT DISTINCT po.id, po.po_number, po.serial_no_formatted, po.po_date,
        po.project_id, v.name AS vendor_name
      FROM purchase_orders po
      JOIN projects pr ON pr.id = po.project_id
      JOIN po_items pi ON pi.po_id = po.id
      JOIN vendors v ON v.id = po.vendor_id
      WHERE pr.company_id = $1
        AND COALESCE(po.status,'') NOT IN ('cancelled','draft','rejected')
        ${projFilter}
        AND (${kwCond})
      ORDER BY po.po_date
    `, params);

    const existing = await query(
      `SELECT po_id FROM material_tracker_entries WHERE company_id = $1 AND material_type = $2`,
      [companyId, material_type]
    );
    const existingPoIds = new Set(existing.rows.map(r => r.po_id).filter(Boolean));

    const poIds = pos.rows.map(r => r.id);
    let grnsNew = 0, billsNew = 0;

    if (poIds.length) {
      const importedGrns = await query(
        `SELECT source_grn_id FROM material_tracker_loads WHERE source_grn_id IS NOT NULL`
      );
      const importedGrnSet = new Set(importedGrns.rows.map(r => r.source_grn_id));

      const kwCond2 = kwCondition(kws, 'gi', 'material_name', 2);
      const grns = await query(`
        SELECT DISTINCT g.id
        FROM grn g
        JOIN grn_items gi ON gi.grn_id = g.id
        WHERE g.po_id = ANY($1::uuid[])
          AND (${kwCond2})
      `, [poIds, ...kwPats]);
      grnsNew = grns.rows.filter(r => !importedGrnSet.has(r.id)).length;

      const importedBills = await query(
        `SELECT source_bill_id FROM material_tracker_loads WHERE source_bill_id IS NOT NULL`
      );
      const importedBillSet = new Set(importedBills.rows.map(r => r.source_bill_id));

      // Bills with no linked GRN (so we don't double-count)
      const bills = await query(`
        SELECT DISTINCT b.id
        FROM tqs_bills b
        LEFT JOIN tqs_bill_line_items li ON li.bill_id = b.id
        WHERE b.po_id = ANY($1::uuid[])
          AND b.grn_id IS NULL
          AND b.is_deleted = FALSE
          AND (li.item_name IS NULL OR (${kwCondition(kws, 'li', 'item_name', 2)}))
      `, [poIds, ...kwPats]);
      billsNew = bills.rows.filter(r => !importedBillSet.has(r.id)).length;
    }

    res.json({
      data: {
        pos_found: pos.rows.length,
        pos_new: pos.rows.filter(p => !existingPoIds.has(p.id)).length,
        loads_new: grnsNew + billsNew,
        grns_new: grnsNew,
        bills_new: billsNew,
        pos: pos.rows.map(p => ({ ...p, already_imported: existingPoIds.has(p.id) })),
      }
    });
  } catch (err) {
    console.error('[MaterialTracker] preview error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /auto-import/run ─────────────────────────────────────────────────────
router.post('/auto-import/run', authorize(...WRITE_ROLES), async (req, res) => {
  try {
    const { project_id, material_type = 'cement' } = req.body;
    const companyId = req.user.company_id;
    const kws = MATERIAL_KEYWORDS[material_type] || MATERIAL_KEYWORDS.cement;
    const kwPats = kws.map(k => `%${k}%`);

    let params = [companyId, ...kwPats];
    let projFilter = '';
    if (project_id) { projFilter = ` AND po.project_id = $${params.length + 1}`; params.push(project_id); }

    const kwCond = kwCondition(kws, 'pi', 'material_name', 2);

    // Find all matching POs with aggregated cement item totals
    const pos = await query(`
      SELECT
        po.id, po.po_number, po.serial_no_formatted, po.po_date, po.project_id,
        v.name AS vendor_name,
        SUM(pi.quantity)      AS ordered_qty,
        MAX(pi.unit)          AS unit,
        MAX(pi.material_name) AS grade,
        MAX(pi.rate)          AS unit_price
      FROM purchase_orders po
      JOIN projects pr ON pr.id = po.project_id
      JOIN po_items pi ON pi.po_id = po.id
      JOIN vendors v ON v.id = po.vendor_id
      WHERE pr.company_id = $1
        AND COALESCE(po.status,'') NOT IN ('cancelled','draft','rejected')
        ${projFilter}
        AND (${kwCond})
      GROUP BY po.id, v.name
      ORDER BY po.po_date
    `, params);

    let entries_created = 0, loads_created = 0;

    for (const po of pos.rows) {
      // Upsert entry
      let entryRes = await query(
        `SELECT id FROM material_tracker_entries WHERE company_id=$1 AND po_id=$2 AND material_type=$3`,
        [companyId, po.id, material_type]
      );
      let entryId;
      if (!entryRes.rows.length) {
        const ins = await query(`
          INSERT INTO material_tracker_entries
            (company_id, project_id, material_type, po_id, po_number, vendor_name,
             grade, ordered_qty, unit, created_by)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
          RETURNING id
        `, [companyId, po.project_id, material_type,
            po.id, po.po_number || po.serial_no_formatted,
            po.vendor_name, po.grade || null,
            po.ordered_qty || null, po.unit || null, req.user.id]);
        entryId = ins.rows[0].id;
        entries_created++;
      } else {
        entryId = entryRes.rows[0].id;
      }

      // ── Import from GRNs ────────────────────────────────────────────────────
      const kwCond2 = kwCondition(kws, 'gi', 'material_name', 2);
      const grns = await query(`
        SELECT
          g.id AS grn_id, g.grn_date, g.invoice_number, g.grn_number,
          g.challan_number, g.vehicle_number, g.wb_slip_no,
          SUM(gi.quantity_received) AS qty,
          MAX(gi.rate)              AS rate,
          MAX(gi.unit)              AS unit
        FROM grn g
        JOIN grn_items gi ON gi.grn_id = g.id
        WHERE g.po_id = $1
          AND (${kwCond2})
        GROUP BY g.id
        ORDER BY g.grn_date
      `, [po.id, ...kwPats]);

      for (const grn of grns.rows) {
        const dup = await query(
          `SELECT id FROM material_tracker_loads WHERE source_grn_id=$1`, [grn.grn_id]
        );
        if (dup.rows.length) continue;

        // Try to find linked bill for GST/grand_total
        const bill = await query(`
          SELECT b.gst_amount, b.total_amount,
            (COALESCE(b.cgst_pct,0)*2 + COALESCE(b.igst_pct,0)) AS gst_rate
          FROM tqs_bills b
          WHERE (b.grn_id = $1 OR (b.po_id = $2 AND LOWER(TRIM(b.inv_number)) = LOWER(TRIM($3))))
            AND b.is_deleted = FALSE
          LIMIT 1
        `, [grn.grn_id, po.id, grn.invoice_number || '']);

        const billRow = bill.rows[0];
        const rate     = parseFloat(grn.rate  || 0);
        const qty      = parseFloat(grn.qty   || 0);
        const basic    = qty * rate;
        const gstRate  = parseFloat(billRow?.gst_rate || 28);
        const gstAmt   = billRow?.gst_amount   != null ? parseFloat(billRow.gst_amount)   : (basic * gstRate / 100);
        const grandTot = billRow?.total_amount  != null ? parseFloat(billRow.total_amount) : (basic + gstAmt);

        await query(`
          INSERT INTO material_tracker_loads
            (entry_id, received_date, invoice_no, ign_no, grs_no, vehicle_no,
             invoice_qty, rate, gst_rate, gst_amount, grand_total, created_by, source_grn_id)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
        `, [entryId, grn.grn_date,
            grn.invoice_number || null,
            grn.grn_number || grn.wb_slip_no || null,
            grn.challan_number || null,
            grn.vehicle_number || null,
            qty || null, rate || null,
            gstRate, gstAmt || null, grandTot || null,
            req.user.id, grn.grn_id]);

        loads_created++;
      }

      // ── Import from bills that have NO GRN (direct invoice entry) ───────────
      const kwCond3 = kwCondition(kws, 'li', 'item_name', 2);
      const bills = await query(`
        SELECT
          b.id, b.inv_number, b.inv_date, b.vehicle_number,
          b.gst_amount, b.total_amount,
          (COALESCE(b.cgst_pct,0)*2 + COALESCE(b.igst_pct,0)) AS gst_rate,
          COALESCE(SUM(li.quantity),0)  AS qty,
          MAX(li.rate)                  AS rate,
          MAX(li.unit)                  AS unit
        FROM tqs_bills b
        LEFT JOIN tqs_bill_line_items li ON li.bill_id = b.id
        WHERE b.po_id = $1
          AND b.grn_id IS NULL
          AND b.is_deleted = FALSE
          AND (li.item_name IS NULL OR (${kwCond3}))
        GROUP BY b.id
        ORDER BY b.inv_date
      `, [po.id, ...kwPats]);

      for (const bill of bills.rows) {
        const dup = await query(
          `SELECT id FROM material_tracker_loads WHERE source_bill_id=$1`, [bill.id]
        );
        if (dup.rows.length) continue;

        const rate     = parseFloat(bill.rate  || 0);
        const qty      = parseFloat(bill.qty   || 0);
        const basic    = qty * rate;
        const gstRate  = parseFloat(bill.gst_rate || 28);
        const gstAmt   = bill.gst_amount  != null ? parseFloat(bill.gst_amount)  : (basic * gstRate / 100);
        const grandTot = bill.total_amount != null ? parseFloat(bill.total_amount): (basic + gstAmt);

        await query(`
          INSERT INTO material_tracker_loads
            (entry_id, received_date, invoice_no, vehicle_no,
             invoice_qty, rate, gst_rate, gst_amount, grand_total, created_by, source_bill_id)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
        `, [entryId, bill.inv_date,
            bill.inv_number || null,
            bill.vehicle_number || null,
            qty || null, rate || null,
            gstRate, gstAmt || null, grandTot || null,
            req.user.id, bill.id]);

        loads_created++;
      }
    }

    res.json({ data: { entries_created, loads_created, total_pos: pos.rows.length } });
  } catch (err) {
    console.error('[MaterialTracker] auto-import run error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── UNIQUE constraint on material_tracker_steel_dia.load_id ─────────────────
(async () => {
  try {
    await query(`ALTER TABLE material_tracker_steel_dia ADD CONSTRAINT mtsd_load_unique UNIQUE (load_id)`);
  } catch (_) {}
})();

module.exports = router;
