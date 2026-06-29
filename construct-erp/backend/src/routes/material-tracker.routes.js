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

  // Widen short text columns — GRN challan/vehicle/grn numbers can exceed 50 chars
  await safe(`ALTER TABLE material_tracker_loads ALTER COLUMN invoice_no  TYPE VARCHAR(150)`);
  await safe(`ALTER TABLE material_tracker_loads ALTER COLUMN ign_no      TYPE VARCHAR(150)`);
  await safe(`ALTER TABLE material_tracker_loads ALTER COLUMN grs_no      TYPE VARCHAR(150)`);
  await safe(`ALTER TABLE material_tracker_loads ALTER COLUMN vehicle_no  TYPE VARCHAR(150)`);

  // Widen entry columns — auto-import sets grade from the full material name (TEXT)
  await safe(`ALTER TABLE material_tracker_entries ALTER COLUMN po_number TYPE VARCHAR(150)`);
  await safe(`ALTER TABLE material_tracker_entries ALTER COLUMN grade     TYPE VARCHAR(300)`);
  await safe(`ALTER TABLE material_tracker_entries ALTER COLUMN unit      TYPE VARCHAR(60)`);
  await safe(`ALTER TABLE material_tracker_entries ALTER COLUMN mr_number TYPE VARCHAR(150)`);

  // Auto-import dedup columns
  await safe(`ALTER TABLE material_tracker_loads ADD COLUMN IF NOT EXISTS source_grn_id  UUID`);
  await safe(`ALTER TABLE material_tracker_loads ADD COLUMN IF NOT EXISTS source_bill_id UUID`);
  await safe(`CREATE INDEX IF NOT EXISTS idx_mtl_src_grn  ON material_tracker_loads(source_grn_id)  WHERE source_grn_id  IS NOT NULL`);
  await safe(`CREATE INDEX IF NOT EXISTS idx_mtl_src_bill ON material_tracker_loads(source_bill_id) WHERE source_bill_id IS NOT NULL`);

  console.log('[MaterialTracker] Schema migration OK');
})();

router.use(authenticate);
router.use(loadProjectScope);

// Steel loads must report a dia-wise breakdown that sums to the invoice qty.
// The frontend already blocks this, but enforce it here too so any direct API
// call or future bulk import can't silently save a mismatched load.
function diaMismatchError(materialType, invoiceQty, dia) {
  if (materialType !== 'steel' || !dia) return null;
  const total = ['dia_8mm','dia_10mm','dia_12mm','dia_16mm','dia_20mm','dia_25mm','dia_32mm']
    .reduce((s, k) => s + (parseFloat(dia[k]) || 0), 0);
  const qty = parseFloat(invoiceQty || 0);
  if (qty > 0 && Math.abs(total - qty) > 0.01) {
    return `Dia breakdown total (${total.toFixed(3)}) does not match invoice qty (${qty.toFixed(3)})`;
  }
  return null;
}

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
    const { project_id, material_type, entry_id, from_date, to_date } = req.query;
    const companyId = req.user.company_id;

    let where = `e.company_id = $1`;
    const params = [companyId];
    let idx = 2;

    if (project_id)   { where += ` AND e.project_id = $${idx++}`;       params.push(project_id); }
    if (material_type){ where += ` AND e.material_type = $${idx++}`;     params.push(material_type); }
    if (entry_id)     { where += ` AND e.id = $${idx++}`;               params.push(entry_id); }
    if (from_date)    { where += ` AND l.received_date >= $${idx++}`;   params.push(from_date); }
    if (to_date)      { where += ` AND l.received_date <= $${idx++}`;   params.push(to_date); }

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
      ORDER BY l.received_date DESC, l.created_at DESC, e.po_number
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

// Returns an error message string if a duplicate grs_no / ign_no / invoice_no
// already exists for the same entry, or null if clear. excludeLoadId skips the
// current row when called from the edit (PUT) path.
async function checkLoadDuplicate(entryId, { grs_no, ign_no, invoice_no }, excludeLoadId = null) {
  const fields = [
    { col: 'grs_no',     val: grs_no,     label: 'GRS No' },
    { col: 'ign_no',     val: ign_no,     label: 'IGN No' },
    { col: 'invoice_no', val: invoice_no, label: 'Invoice No' },
  ].filter(f => f.val && String(f.val).trim());

  if (!fields.length) return null;

  const params = [entryId];
  let idx = 2;
  const clauses = fields.map(f => {
    params.push(String(f.val).trim());
    return `(LOWER(TRIM(${f.col})) = LOWER($${idx++}))`;
  });
  if (excludeLoadId) { params.push(excludeLoadId); }

  const { rows } = await query(
    `SELECT grs_no, ign_no, invoice_no FROM material_tracker_loads
     WHERE entry_id = $1
       AND (${clauses.join(' OR ')})
       ${excludeLoadId ? `AND id <> $${params.length}` : ''}
     LIMIT 1`,
    params
  );

  if (!rows.length) return null;
  const d = rows[0];
  for (const f of fields) {
    const existing = d[f.col];
    if (existing && existing.trim().toLowerCase() === String(f.val).trim().toLowerCase()) {
      return `Duplicate load: ${f.label} "${f.val}" already exists for this entry.`;
    }
  }
  return null;
}

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

    const diaErr = diaMismatchError(check.rows[0].material_type, invoice_qty, dia);
    if (diaErr) return res.status(400).json({ error: diaErr });

    // Duplicate check: grs_no, ign_no, invoice_no must be unique per entry
    const dupErr = await checkLoadDuplicate(req.params.id, { grs_no, ign_no, invoice_no });
    if (dupErr) return res.status(409).json({ error: dupErr });

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

    const diaErr = diaMismatchError(check.rows[0].material_type, invoice_qty, dia);
    if (diaErr) return res.status(400).json({ error: diaErr });

    // Duplicate check (exclude current load)
    const dupErr = await checkLoadDuplicate(req.params.id, { grs_no, ign_no, invoice_no }, req.params.loadId);
    if (dupErr) return res.status(409).json({ error: dupErr });

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

// ── Material match rules ─────────────────────────────────────────────────────
// cement   = bulk cement we purchase (OPC/PPC bags/bulk) — exclude concrete items
//            that merely contain the word "cement" (PCC / RCC / cement concrete).
// concrete = external SCP / RMC ready-mix concrete only.
//            Deliberately does NOT include bare 'concrete' because that also matches
//            concrete tools (drill bits, grinding wheels, chipping machines, etc.).
//            Only SCP (Self-Compacting Pumped) and explicit RMC terms qualify.
const MATERIAL_MATCH = {
  cement:   { include: ['cement', 'opc', 'ppc'],
              exclude: ['concrete', 'rmc', 'ready mix', 'ready-mix', 'pcc', 'rcc'] },
  concrete: { include: ['scp', 'concrete', 'rmc', 'ready mix', 'ready-mix', 'ready mixed'],
              exclude: ['drill', 'grinding', 'chipping', 'chisel', 'vibrat', 'cutter',
                        'breaker', 'polisher', 'scabbler', 'bit ', 'bits '] },
  steel:    { include: ['steel', 'tmt', 'rebar', 'ms rod', 'reinforcement'],
              exclude: [] },
};

// Default GST slab to assume when no matching bill carries a real rate.
// Cement is taxed at 28%; ready-mix concrete and steel are 18%.
const DEFAULT_GST_RATE = { cement: 28, concrete: 18, steel: 18 };

// Build a material-match SQL fragment for `alias.col`, with bind params starting
// at $startIdx. Returns { sql, params } where params = [...includePats, ...excludePats].
// Callers must append `params` to their query's param list at that position.
function matCond(material, alias, col, startIdx) {
  const m = MATERIAL_MATCH[material] || MATERIAL_MATCH.cement;
  const inc = m.include, exc = m.exclude || [];
  const incSql = inc.map((_, i) => `LOWER(${alias}.${col}) LIKE $${startIdx + i}`).join(' OR ');
  let sql = `(${incSql})`;
  if (exc.length) {
    const excSql = exc.map((_, i) => `LOWER(${alias}.${col}) LIKE $${startIdx + inc.length + i}`).join(' OR ');
    sql += ` AND NOT (${excSql})`;
  }
  const params = [...inc.map(k => `%${k}%`), ...exc.map(k => `%${k}%`)];
  return { sql, params };
}

// ── GET /auto-import/preview ──────────────────────────────────────────────────
router.get('/auto-import/preview', async (req, res) => {
  try {
    const { project_id, material_type = 'cement' } = req.query;
    const companyId = req.user.company_id;
    // Cement syncs from IGN; concrete & steel sync from Bill Tracker (tqs_bills)
    const useIGN = material_type === 'cement';

    // pos query — material match params go LAST so indices stay predictable
    const posParams = [companyId];
    let projFilter = '';
    if (project_id) { projFilter = ` AND po.project_id = $${posParams.length + 1}`; posParams.push(project_id); }
    const mcPo = matCond(material_type, 'pi', 'material_name', posParams.length + 1);
    posParams.push(...mcPo.params);

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
        AND ${mcPo.sql}
      ORDER BY po.po_date
    `, posParams);

    const existing = await query(
      `SELECT po_id FROM material_tracker_entries WHERE company_id = $1 AND material_type = $2`,
      [companyId, material_type]
    );
    const existingPoIds = new Set(existing.rows.map(r => r.po_id).filter(Boolean));

    const poIds = pos.rows.map(r => r.id);
    let grnsNew = 0, billsNew = 0;

    if (poIds.length) {
      const importedBills = await query(
        `SELECT source_bill_id FROM material_tracker_loads WHERE source_bill_id IS NOT NULL`
      );
      const importedBillSet = new Set(importedBills.rows.map(r => r.source_bill_id));

      if (useIGN) {
        const importedGrns = await query(
          `SELECT source_grn_id FROM material_tracker_loads WHERE source_grn_id IS NOT NULL`
        );
        const importedGrnSet = new Set(importedGrns.rows.map(r => r.source_grn_id));
        const mcGi = matCond(material_type, 'ii', 'material_name', 2);
        const grns = await query(`
          SELECT DISTINCT n.id FROM ign n
          JOIN ign_items ii ON ii.ign_id = n.id
          WHERE n.po_id = ANY($1::uuid[])
            AND COALESCE(n.status,'') NOT IN ('cancelled')
            AND ${mcGi.sql}
        `, [poIds, ...mcGi.params]);
        grnsNew = grns.rows.filter(r => !importedGrnSet.has(r.id)).length;
      }

      const mcLi = matCond(material_type, 'li', 'item_name', 2);
      const bills = await query(`
        SELECT DISTINCT b.id
        FROM tqs_bills b
        LEFT JOIN tqs_bill_line_items li ON li.bill_id = b.id
        WHERE b.po_id = ANY($1::uuid[])
          ${useIGN ? 'AND b.grn_id IS NULL' : ''}
          AND b.is_deleted = FALSE
          AND (li.item_name IS NULL OR (${mcLi.sql}))
      `, [poIds, ...mcLi.params]);
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
    const todayStr = new Date().toISOString().slice(0, 10);
    // Cement syncs from IGN (physical receipts). Concrete & steel sync from the
    // Bill Tracker (tqs_bills) because RMC is poured directly (no IGN) and steel
    // bills are the authoritative source the user manages in the Bill Tracker.
    const useIGN = material_type === 'cement';
    const trunc = (v, n = 150) => (v == null ? null : String(v).slice(0, n));

    // pos query — material match params go LAST so indices stay predictable.
    // The match on the joined po_items restricts aggregates to matching lines
    // only and includes the PO only if it has at least one matching item.
    const posParams = [companyId];
    let projFilter = '';
    if (project_id) { projFilter = ` AND po.project_id = $${posParams.length + 1}`; posParams.push(project_id); }
    const mcPo = matCond(material_type, 'pi', 'material_name', posParams.length + 1);
    posParams.push(...mcPo.params);

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
        AND ${mcPo.sql}
      GROUP BY po.id, v.name
      ORDER BY po.po_date
    `, posParams);

    let entries_created = 0, loads_created = 0;
    const poIds = pos.rows.map(p => p.id);

    if (!poIds.length) {
      return res.json({ data: { entries_created: 0, loads_created: 0, total_pos: 0 } });
    }

    // Pre-load existing tracker entries for these POs → po_id => entry_id
    const existingEntries = await query(
      `SELECT id, po_id FROM material_tracker_entries
       WHERE company_id = $1 AND material_type = $2 AND po_id = ANY($3::uuid[])`,
      [companyId, material_type, poIds]
    );
    const entryByPo = new Map(existingEntries.rows.map(r => [r.po_id, r.id]));

    // Create entries for POs that don't have one yet
    for (const po of pos.rows) {
      if (entryByPo.has(po.id)) continue;
      const ins = await query(`
        INSERT INTO material_tracker_entries
          (company_id, project_id, material_type, po_id, po_number, vendor_name,
           grade, ordered_qty, unit, created_by)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
        RETURNING id
      `, [companyId, po.project_id, material_type,
          po.id, trunc(po.po_number || po.serial_no_formatted, 150),
          trunc(po.vendor_name, 200), trunc(po.grade, 300),
          po.ordered_qty || null, trunc(po.unit, 60), req.user.id]);
      entryByPo.set(po.id, ins.rows[0].id);
      entries_created++;
    }

    // Pre-load already-imported source ids (global — source ids are unique uuids)
    const imported = await query(
      `SELECT source_grn_id, source_bill_id FROM material_tracker_loads
       WHERE source_grn_id IS NOT NULL OR source_bill_id IS NOT NULL`
    );
    const importedGrnSet  = new Set(imported.rows.map(r => r.source_grn_id).filter(Boolean));
    const importedBillSet = new Set(imported.rows.map(r => r.source_bill_id).filter(Boolean));

    // Dedup sets built from existing loads in the DB:
    //   importedIgnKeys — entry_id|ign_no  → prevents re-importing the same IGN record
    //                     (fallback when source UUID is missing, e.g. old imports)
    //   importedInvKeys — entry_id|invoice_no → used by the bills path to skip any
    //                     invoice already covered by an IGN load in this entry
    const entryIds = Array.from(entryByPo.values());
    const existingLoadsInv = entryIds.length ? await query(`
      SELECT entry_id,
        LOWER(TRIM(COALESCE(invoice_no,''))) AS inv_key,
        LOWER(TRIM(COALESCE(ign_no,'')))     AS ign_key
      FROM material_tracker_loads
      WHERE entry_id = ANY($1::uuid[])
    `, [entryIds]) : { rows: [] };
    const importedIgnKeys = new Set(
      existingLoadsInv.rows.filter(r => r.ign_key).map(r => `${r.entry_id}|${r.ign_key}`)
    );
    const importedInvKeys = new Set(
      existingLoadsInv.rows.filter(r => r.inv_key).map(r => `${r.entry_id}|${r.inv_key}`)
    );

    // ── IGN receipts — only for cement ──────────────────────────────────────────
    const grnCols = ['entry_id','received_date','invoice_no','ign_no','grs_no','vehicle_no',
                     'invoice_qty','rate','gst_rate','gst_amount','grand_total','created_by','source_grn_id'];
    const grnRows = [];
    if (useIGN) {
      const mcGi = matCond(material_type, 'ii', 'material_name', 2);
      const grns = await query(`
        SELECT
          n.po_id,
          n.id                                            AS grn_id,
          n.date_time::date                               AS grn_date,
          n.bill_number                                   AS invoice_number,
          n.ign_number                                    AS grn_number,
          n.dc_number                                     AS challan_number,
          n.vehicle_no                                    AS vehicle_number,
          NULL::text                                      AS wb_slip_no,
          SUM(COALESCE(ii.qty_inspected, ii.qty_as_per_dc, 0)) AS qty,
          MAX(ii.rate)                                    AS rate,
          MAX(ii.unit)                                    AS unit
        FROM ign n
        JOIN ign_items ii ON ii.ign_id = n.id
        WHERE n.po_id = ANY($1::uuid[])
          AND COALESCE(n.status,'') NOT IN ('cancelled')
          AND ${mcGi.sql}
        GROUP BY n.po_id, n.id
        ORDER BY n.date_time
      `, [poIds, ...mcGi.params]);

      // Fetch bills for GST/total lookup against IGN rows
      const gstBills = await query(`
        SELECT b.id, b.grn_id, b.po_id, LOWER(TRIM(b.inv_number)) AS inv_key,
          b.gst_amount, b.total_amount,
          (COALESCE(b.cgst_pct,0)*2 + COALESCE(b.igst_pct,0)) AS gst_rate
        FROM tqs_bills b
        WHERE b.po_id = ANY($1::uuid[]) AND b.is_deleted = FALSE
      `, [poIds]);
      const billByGrn   = new Map();
      const billByPoInv = new Map();
      for (const b of gstBills.rows) {
        if (b.grn_id) billByGrn.set(b.grn_id, b);
        if (b.inv_key) billByPoInv.set(`${b.po_id}|${b.inv_key}`, b);
      }

      for (const grn of grns.rows) {
        if (importedGrnSet.has(grn.grn_id)) continue;
        const entryId = entryByPo.get(grn.po_id);
        if (!entryId) continue;

        const ignKey = grn.grn_number ? `${entryId}|${grn.grn_number.trim().toLowerCase()}` : null;
        if (ignKey && importedIgnKeys.has(ignKey)) continue;

        const billRow = billByGrn.get(grn.grn_id)
          || billByPoInv.get(`${grn.po_id}|${(grn.invoice_number || '').trim().toLowerCase()}`);
        if (billRow?.id && importedBillSet.has(billRow.id)) continue;
        const rate     = parseFloat(grn.rate || 0);
        const qty      = parseFloat(grn.qty  || 0);
        const basic    = qty * rate;
        const gstRate  = parseFloat(billRow?.gst_rate || DEFAULT_GST_RATE[material_type] || 18);
        const gstAmt   = billRow?.gst_amount   != null ? parseFloat(billRow.gst_amount)   : (basic * gstRate / 100);
        const grandTot = billRow?.total_amount != null ? parseFloat(billRow.total_amount) : (basic + gstAmt);

        if (ignKey) importedIgnKeys.add(ignKey);
        const invKey = grn.invoice_number ? `${entryId}|${grn.invoice_number.trim().toLowerCase()}` : null;
        if (invKey) importedInvKeys.add(invKey);

        grnRows.push([
          entryId, grn.grn_date || todayStr,
          trunc(grn.invoice_number),
          trunc(grn.grn_number || grn.wb_slip_no),
          trunc(grn.challan_number),
          trunc(grn.vehicle_number),
          qty || null, rate || null,
          gstRate, gstAmt || null, grandTot || null,
          req.user.id, grn.grn_id,
        ]);
      }
    }

    // ── Bulk fetch bills for these POs ──────────────────────────────────────────
    // For cement: restrict to bills with no linked GRN (IGN handles those).
    // For concrete/steel: pull ALL bills — GRN-linked or not — since IGN is not used.
    const mcLi = matCond(material_type, 'li', 'item_name', 2);
    const bills = await query(`
      SELECT
        b.po_id, b.id, b.inv_number, b.inv_date, b.created_at AS bill_created_at,
        b.gst_amount, b.total_amount,
        (COALESCE(b.cgst_pct,0)*2 + COALESCE(b.igst_pct,0)) AS gst_rate,
        COALESCE(SUM(li.quantity),0)  AS qty,
        MAX(li.rate)                  AS rate,
        MAX(li.unit)                  AS unit,
        MAX(bu.vehicle_number)        AS vehicle_number
      FROM tqs_bills b
      LEFT JOIN tqs_bill_line_items li ON li.bill_id = b.id
      LEFT JOIN tqs_bill_updates bu ON bu.bill_id = b.id
      WHERE b.po_id = ANY($1::uuid[])
        ${useIGN ? 'AND b.grn_id IS NULL' : ''}
        AND b.is_deleted = FALSE
        AND (li.item_name IS NULL OR (${mcLi.sql}))
      GROUP BY b.po_id, b.id
      ORDER BY b.inv_date
    `, [poIds, ...mcLi.params]);

    const billCols = ['entry_id','received_date','invoice_no','vehicle_no',
                      'invoice_qty','rate','gst_rate','gst_amount','grand_total','created_by','source_bill_id'];
    const billRows = [];
    for (const bill of bills.rows) {
      if (importedBillSet.has(bill.id)) continue;
      const entryId = entryByPo.get(bill.po_id);
      if (!entryId) continue;

      // Content dedup: skip if same entry+invoice already imported (via IGN or a prior run)
      const billInvKey = bill.inv_number ? `${entryId}|${bill.inv_number.trim().toLowerCase()}` : null;
      if (billInvKey && importedInvKeys.has(billInvKey)) continue;

      const rate     = parseFloat(bill.rate || 0);
      const qty      = parseFloat(bill.qty  || 0);
      const basic    = qty * rate;
      const gstRate  = parseFloat(bill.gst_rate || DEFAULT_GST_RATE[material_type] || 18);
      const gstAmt   = bill.gst_amount  != null ? parseFloat(bill.gst_amount)  : (basic * gstRate / 100);
      const grandTot = bill.total_amount != null ? parseFloat(bill.total_amount): (basic + gstAmt);
      billRows.push([
        entryId,
        bill.inv_date || (bill.bill_created_at ? new Date(bill.bill_created_at).toISOString().slice(0,10) : todayStr),
        trunc(bill.inv_number),
        trunc(bill.vehicle_number),
        qty || null, rate || null,
        gstRate, gstAmt || null, grandTot || null,
        req.user.id, bill.id,
      ]);
    }

    // ── Chunked multi-row insert helper (avoids per-row round-trips) ──
    const chunkInsert = async (cols, rows) => {
      const CH = 100;
      for (let i = 0; i < rows.length; i += CH) {
        const slice = rows.slice(i, i + CH);
        const flat = [];
        const tuples = slice.map((row, ri) => {
          const ph = row.map((_, ci) => `$${ri * cols.length + ci + 1}`);
          flat.push(...row);
          return `(${ph.join(',')})`;
        });
        await query(
          `INSERT INTO material_tracker_loads (${cols.join(',')}) VALUES ${tuples.join(',')}`,
          flat
        );
      }
    };

    await chunkInsert(grnCols, grnRows);
    await chunkInsert(billCols, billRows);
    loads_created = grnRows.length + billRows.length;

    // Auto-cleanup ghost rows: loads with no ign_no whose invoice is covered by a proper
    // IGN row in the same entry. Uses a CTE to avoid any DELETE-alias ambiguity in PostgreSQL.
    // Deliberately does NOT filter on source_grn_id — ghost rows from old GRN syncs still
    // carry a stale GRN UUID there even after the GRN→IGN migration.
    let ghost_cleaned = 0;
    if (useIGN && entryIds.length) {
      const cleanup = await query(`
        WITH ghost_ids AS (
          SELECT m.id
          FROM material_tracker_loads m
          WHERE m.entry_id = ANY($1::uuid[])
            AND (m.ign_no IS NULL OR TRIM(m.ign_no) = '')
            AND m.invoice_no IS NOT NULL AND TRIM(m.invoice_no) <> ''
            AND EXISTS (
              SELECT 1 FROM material_tracker_loads r
              WHERE r.entry_id = m.entry_id
                AND LOWER(TRIM(r.invoice_no)) = LOWER(TRIM(m.invoice_no))
                AND r.ign_no IS NOT NULL AND TRIM(r.ign_no) <> ''
                AND r.id <> m.id
            )
        )
        DELETE FROM material_tracker_loads
        WHERE id IN (SELECT id FROM ghost_ids)
        RETURNING id
      `, [entryIds]);
      ghost_cleaned = cleanup.rows.length;
    }

    // Remove loads whose IGN was cancelled or deleted from the IGN module.
    // Only targets rows with source_grn_id set (i.e. synced from IGN, not manually entered).
    let ign_removed = 0;
    if (useIGN && entryIds.length) {
      const ignCleanup = await query(`
        WITH orphan_ids AS (
          SELECT l.id
          FROM material_tracker_loads l
          WHERE l.entry_id = ANY($1::uuid[])
            AND l.source_grn_id IS NOT NULL
            AND NOT EXISTS (
              SELECT 1 FROM ign n
              WHERE n.id = l.source_grn_id
                AND COALESCE(n.status, '') NOT IN ('cancelled')
            )
        )
        DELETE FROM material_tracker_loads
        WHERE id IN (SELECT id FROM orphan_ids)
        RETURNING id
      `, [entryIds]);
      ign_removed = ignCleanup.rows.length;
    }

    // Remove tracker entries that no longer match the material filter (e.g. concrete tools
    // that were pulled in by the old broad 'concrete' keyword). Only deletes entries that
    // have zero loads — entries with actual deliveries are left for manual review.
    let stale_removed = 0;
    if (entryIds.length) {
      const mcStale = matCond(material_type, 'pi', 'material_name', 2);
      const staleCleanup = await query(`
        WITH non_matching AS (
          SELECT e.id
          FROM material_tracker_entries e
          WHERE e.id = ANY($1::uuid[])
            AND NOT EXISTS (
              SELECT 1 FROM po_items pi
              WHERE pi.po_id = e.po_id
                AND ${mcStale.sql}
            )
            AND NOT EXISTS (
              SELECT 1 FROM material_tracker_loads l WHERE l.entry_id = e.id
            )
        )
        DELETE FROM material_tracker_entries
        WHERE id IN (SELECT id FROM non_matching)
        RETURNING id
      `, [entryIds, ...mcStale.params]);
      stale_removed = staleCleanup.rows.length;
    }

    res.json({ data: { entries_created, loads_created, ghost_cleaned, ign_removed, stale_removed, total_pos: pos.rows.length } });
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
