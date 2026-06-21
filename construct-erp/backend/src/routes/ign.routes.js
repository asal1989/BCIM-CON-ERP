// src/routes/ign.routes.js — Inward Goods Note (merged with GRN features)
const express = require('express');
const { authenticate, authorize } = require('../middleware/auth');
const { loadProjectScope, userCanAccessProject, appendProjectScope } = require('../middleware/projectScope');
const { query, withTransaction } = require('../config/database');
const { notifyGrnSubmitted, notifyGrnApproved } = require('../services/notif.helper');
const router = express.Router();

const STORES_WRITE = ['store_keeper','stores_manager','stores_officer','admin','super_admin'];

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
                        CHECK (status IN ('pending','inspected','approved','cancelled')),
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

  // New header columns (GRN feature merge)
  await safe(`ALTER TABLE ign ADD COLUMN IF NOT EXISTS vendor_id UUID REFERENCES vendors(id)`);
  await safe(`ALTER TABLE ign ADD COLUMN IF NOT EXISTS driver_name VARCHAR(200)`);
  await safe(`ALTER TABLE ign ADD COLUMN IF NOT EXISTS gate_pass_no VARCHAR(100)`);
  await safe(`ALTER TABLE ign ADD COLUMN IF NOT EXISTS wb_slip_no VARCHAR(100)`);
  await safe(`ALTER TABLE ign ADD COLUMN IF NOT EXISTS site_location VARCHAR(100) DEFAULT 'main'`);
  await safe(`ALTER TABLE ign ADD COLUMN IF NOT EXISTS serial_no_formatted VARCHAR(100)`);
  await safe(`ALTER TABLE ign ADD COLUMN IF NOT EXISTS total_quantity NUMERIC(14,3)`);
  await safe(`ALTER TABLE ign ADD COLUMN IF NOT EXISTS issues_notes TEXT`);
  await safe(`ALTER TABLE ign ADD COLUMN IF NOT EXISTS inspection_notes TEXT`);
  await safe(`ALTER TABLE ign ADD COLUMN IF NOT EXISTS received_by UUID REFERENCES users(id)`);
  await safe(`ALTER TABLE ign ADD COLUMN IF NOT EXISTS verified_stores_by UUID REFERENCES users(id)`);
  await safe(`ALTER TABLE ign ADD COLUMN IF NOT EXISTS verified_stores_at TIMESTAMPTZ`);
  await safe(`ALTER TABLE ign ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES users(id)`);
  await safe(`ALTER TABLE ign ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ`);

  // New item columns (GRN feature merge)
  await safe(`ALTER TABLE ign_items ADD COLUMN IF NOT EXISTS rate NUMERIC(14,2) DEFAULT 0`);
  await safe(`ALTER TABLE ign_items ADD COLUMN IF NOT EXISTS batch_number TEXT`);
  await safe(`ALTER TABLE ign_items ADD COLUMN IF NOT EXISTS expiry_date DATE`);
  await safe(`ALTER TABLE ign_items ADD COLUMN IF NOT EXISTS physical_qty NUMERIC(14,3)`);
  await safe(`ALTER TABLE ign_items ADD COLUMN IF NOT EXISTS physical_unit VARCHAR(30)`);
  await safe(`ALTER TABLE ign_items ADD COLUMN IF NOT EXISTS conversion_factor NUMERIC(14,6) DEFAULT 1`);
  await safe(`ALTER TABLE ign_items ADD COLUMN IF NOT EXISTS quality_remarks TEXT`);
  await safe(`ALTER TABLE ign_items ADD COLUMN IF NOT EXISTS po_item_id UUID`);
  await safe(`ALTER TABLE ign_items ADD COLUMN IF NOT EXISTS sort_order INTEGER`);

  // tqs_bills: add ign_id FK
  await safe(`ALTER TABLE tqs_bills ADD COLUMN IF NOT EXISTS ign_id UUID REFERENCES ign(id)`);

  // inventory_batches: add ign_id so IGN approval doesn't misuse grn_id FK
  await safe(`ALTER TABLE inventory_batches ADD COLUMN IF NOT EXISTS ign_id UUID REFERENCES ign(id)`);

  // Indexes
  await safe(`CREATE INDEX IF NOT EXISTS idx_ign_company  ON ign(company_id)`);
  await safe(`CREATE INDEX IF NOT EXISTS idx_ign_project  ON ign(project_id)`);
  await safe(`CREATE INDEX IF NOT EXISTS idx_ign_items    ON ign_items(ign_id)`);
  await safe(`CREATE INDEX IF NOT EXISTS idx_ign_status   ON ign(status)`);
  await safe(`CREATE INDEX IF NOT EXISTS idx_ign_vendor   ON ign(vendor_id)`);
  await safe(`CREATE INDEX IF NOT EXISTS idx_ign_date     ON ign(date_time)`);
  await safe(`CREATE INDEX IF NOT EXISTS idx_ign_grs      ON ign(grs_id)`);

  await safe(`ALTER TABLE ign DROP CONSTRAINT IF EXISTS ign_status_check`);
  await safe(`ALTER TABLE ign ADD CONSTRAINT ign_status_check CHECK (status IN ('pending','inspected','approved','cancelled'))`);

  console.log('[IGN] Schema migration OK');
})();

router.use(authenticate);
router.use(loadProjectScope);

async function nextIgnNumber(companyId) {
  const yr = new Date().getFullYear();
  const res = await query(
    `SELECT COALESCE(MAX(CAST(SPLIT_PART(ign_number,'/',3) AS INTEGER)),0)+1 AS next
     FROM ign WHERE company_id=$1 AND EXTRACT(YEAR FROM created_at)=$2`,
    [companyId, yr]
  );
  return `IGN/${yr}/${String(res.rows[0].next).padStart(4,'0')}`;
}

// ── GET /ign ──────────────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { project_id, status, from_date, to_date } = req.query;
    let sql = `
      SELECT n.*,
             p.name  AS project_name,
             v.name  AS vendor_name,
             u.name  AS created_by_name,
             ap.name AS approved_by_name,
             (SELECT COUNT(*) FROM ign_items ii WHERE ii.ign_id = n.id) AS item_count
      FROM ign n
      JOIN projects p ON n.project_id = p.id
      LEFT JOIN vendors v  ON n.vendor_id = v.id
      LEFT JOIN users u  ON n.created_by  = u.id
      LEFT JOIN users ap ON n.approved_by = ap.id
      WHERE p.company_id = $1`;
    let params = [req.user.company_id];
    let i = 2;
    if (project_id) { sql += ` AND n.project_id = $${i++}`; params.push(project_id); }
    if (status)     { sql += ` AND n.status = $${i++}`;     params.push(status); }
    if (from_date) { sql += ` AND n.date_time >= $${i++}`; params.push(from_date); }
    if (to_date)   { sql += ` AND n.date_time <= $${i++}`; params.push(to_date); }
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
      `SELECT n.*, p.name AS project_name, p.company_id, p.project_code,
              v.name AS vendor_name,
              u.name AS created_by_name, ap.name AS approved_by_name
       FROM ign n
       JOIN projects p ON n.project_id = p.id
       LEFT JOIN vendors v  ON n.vendor_id = v.id
       LEFT JOIN users u  ON n.created_by  = u.id
       LEFT JOIN users ap ON n.approved_by = ap.id
       WHERE n.id = $1`,
      [req.params.id]
    );
    if (!ign.rows.length || ign.rows[0].company_id !== req.user.company_id) {
      return res.status(404).json({ error: 'IGN not found' });
    }
    const items = await query(
      `SELECT * FROM ign_items WHERE ign_id = $1 ORDER BY COALESCE(sort_order, sl_no)`,
      [req.params.id]
    );
    // fetch linked bills
    const bills = await query(
      `SELECT id, sl_number, inv_number, total_amount, workflow_status FROM tqs_bills
       WHERE ign_id = $1 AND is_deleted = FALSE`,
      [req.params.id]
    );
    res.json({ data: { ...ign.rows[0], items: items.rows, bills: bills.rows } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /ign ─────────────────────────────────────────────────────────────────
router.post('/', authorize(...STORES_WRITE), async (req, res) => {
  try {
    const {
      project_id, supplier_name, vendor_id, po_id, po_number,
      vehicle_no, dc_number, bill_number, date_time,
      grs_id, grs_number,
      inspected_by, stores_incharge, remarks,
      driver_name, gate_pass_no, wb_slip_no, site_location,
      issues_notes, inspection_notes,
      items = [],
      bills: billsData,
      bill: legacyBillData,
    } = req.body;

    // Support both new `bills` array and old single `bill`
    const billsArray = billsData?.length ? billsData : (legacyBillData ? [legacyBillData] : []);

    if (!project_id) return res.status(400).json({ error: 'Project is required' });
    if (!userCanAccessProject(req, project_id)) {
      return res.status(403).json({ error: 'You do not have access to this project.' });
    }
    if (!items.length) return res.status(400).json({ error: 'Add at least one item' });

    // Pre-generate SL numbers for each bill
    const billSlNumbers = [];
    if (billsArray.length > 0) {
      const maxRes = await query(
        `SELECT COALESCE(MAX(CAST(REGEXP_REPLACE(sl_number, '[^0-9]', '', 'g') AS INTEGER)), 0) AS max_num
         FROM tqs_bills WHERE sl_number ~ '[0-9]' AND company_id = $1`,
        [req.user.company_id]
      );
      const baseNum = Number(maxRes.rows[0]?.max_num) || 0;
      for (let i = 0; i < billsArray.length; i++) {
        billSlNumbers.push(`P0-${baseNum + i + 1}`);
      }
    }

    const result = await withTransaction(async (client) => {
      // 1. Generate IGN Number
      const yr = new Date().getFullYear();
      const seqRes = await client.query(
        `SELECT COALESCE(MAX(CAST(SPLIT_PART(ign_number,'/',3) AS INTEGER)),0)+1 AS next
         FROM ign WHERE company_id=$1 AND EXTRACT(YEAR FROM created_at)=$2`,
        [req.user.company_id, yr]
      );
      const seq = String(seqRes.rows[0].next).padStart(4, '0');
      const ign_number = `IGN/${yr}/${seq}`;

      // 2. Insert Header
      const hdr = await client.query(
        `INSERT INTO ign
           (company_id, project_id, ign_number, supplier_name, vendor_id,
            po_id, po_number, vehicle_no, dc_number, bill_number,
            date_time, grs_id, grs_number,
            inspected_by, stores_incharge, remarks,
            driver_name, gate_pass_no, wb_slip_no, site_location,
            issues_notes, inspection_notes,
            status, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,'pending',$23)
         RETURNING *`,
        [req.user.company_id, project_id, ign_number, supplier_name || null,
         vendor_id || null,
         po_id || null, po_number || null, vehicle_no || null,
         dc_number || null, bill_number || null,
         date_time || new Date().toISOString(),
         grs_id || null, grs_number || null,
         inspected_by || null, stores_incharge || null,
         remarks || null,
         driver_name || null, gate_pass_no || null, wb_slip_no || null,
         site_location || 'main',
         issues_notes || null, inspection_notes || null,
         req.user.id]
      );
      const ignId = hdr.rows[0].id;

      // 3. Insert Items
      let totalQty = 0;
      const processedItems = [];
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        if (!it.material_name?.trim()) continue;
        const hasThumbRule = it.physical_qty && it.physical_unit && it.conversion_factor && parseFloat(it.conversion_factor) !== 1;
        // Use qty_inspected as the primary quantity for inventory purposes
        const qtyInPoUnit = hasThumbRule
          ? parseFloat(it.physical_qty) * parseFloat(it.conversion_factor)
          : parseFloat(it.qty_inspected || it.qty_as_per_dc || 0);

        await client.query(
          `INSERT INTO ign_items
             (ign_id, sl_no, sort_order, invoice_no, material_name, unit,
              qty_as_per_dc, qty_inspected, qty_rejected, remarks,
              rate, batch_number, expiry_date,
              physical_qty, physical_unit, conversion_factor,
              quality_remarks, po_item_id)
           VALUES ($1,$2,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
          [ignId, i + 1, it.invoice_no || null, it.material_name.trim(),
           it.unit || null,
           it.qty_as_per_dc  ? parseFloat(it.qty_as_per_dc)  : null,
           it.qty_inspected  ? parseFloat(it.qty_inspected)  : null,
           it.qty_rejected   ? parseFloat(it.qty_rejected)   : null,
           it.remarks || null,
           it.rate ? parseFloat(it.rate) : 0,
           it.batch_number || null, it.expiry_date || null,
           it.physical_qty || null, it.physical_unit || null,
           it.conversion_factor ? parseFloat(it.conversion_factor) : 1,
           it.quality_remarks || null, it.po_item_id || null]
        );
        totalQty += qtyInPoUnit;
        processedItems.push({ ...it, _qty: qtyInPoUnit, _rate: parseFloat(it.rate || 0) });
      }

      // 4. Update Header with totals + formatted serial
      const projRes = await client.query('SELECT project_code FROM projects WHERE id = $1', [project_id]);
      const serial_no_formatted = `BCIM-${projRes.rows[0]?.project_code || 'PRJ'}-IGN-${seq}`;
      const finalRes = await client.query(
        `UPDATE ign SET total_quantity = $1, serial_no_formatted = $2 WHERE id = $3 RETURNING *`,
        [totalQty, serial_no_formatted, ignId]
      );
      const ignRow = finalRes.rows[0];

      // 5. Optionally create TQS Bills (same logic as GRN)
      const createdBills = [];

      // Vendor name lookup
      const vendorRes = vendor_id
        ? await client.query('SELECT name FROM vendors WHERE id = $1', [vendor_id])
        : { rows: [] };
      const vendor_name = vendorRes.rows[0]?.name || supplier_name || '';

      for (let billIdx = 0; billIdx < billsArray.length; billIdx++) {
        const billData = billsArray[billIdx];
        const billSlNumber = billSlNumbers[billIdx];

        const tax_mode = billData.tax_mode || 'intrastate';
        const defaultGstPct = parseFloat(billData.gst_pct) ?? 18;
        const itemGstOverrides = billData.item_gst_overrides || {};
        const transport_charges = parseFloat(billData.transport_charges) || 0;
        const transport_gst_pct = parseFloat(billData.transport_gst_pct) || 18;
        const transport_gst_amt = transport_charges * transport_gst_pct / 100;
        const other_charges = parseFloat(billData.other_charges) || 0;
        const inv_date = billData.inv_date || null;
        const inv_month = inv_date ? inv_date.slice(0, 7) : null;
        const inv_number = billData.inv_number || bill_number || null;

        // Duplicate invoice guard
        if (inv_number && vendor_name) {
          const dup = await client.query(
            `SELECT id FROM tqs_bills
             WHERE is_deleted = FALSE AND company_id = $1
               AND LOWER(BTRIM(COALESCE(vendor_name,''))) = $2
               AND LOWER(BTRIM(COALESCE(inv_number,''))) = $3
             LIMIT 1`,
            [req.user.company_id, vendor_name.toLowerCase().trim(), inv_number.toLowerCase().trim()]
          );
          if (dup.rows.length) {
            throw Object.assign(
              new Error(`Duplicate invoice: "${inv_number}" for "${vendor_name}" already exists in Bill Tracker.`),
              { status: 409 }
            );
          }
        }

        // Calculate line-item amounts
        let basic_amount = 0;
        let cgst_pct_hdr = 0, sgst_pct_hdr = 0, igst_pct_hdr = 0;
        let cgst_amt = 0, sgst_amt = 0, igst_amt = 0;
        const billItems = processedItems.map((it, i) => {
          const qty = it._qty;
          const rate = it._rate;
          const basic = qty * rate;
          const gstPct = parseFloat(itemGstOverrides[String(i)] ?? defaultGstPct);
          let cgP = 0, sgP = 0, igP = 0, cgA = 0, sgA = 0, igA = 0;
          if (tax_mode === 'interstate') { igP = gstPct; igA = basic * igP / 100; }
          else { cgP = gstPct / 2; sgP = gstPct / 2; cgA = basic * cgP / 100; sgA = basic * sgP / 100; }
          basic_amount += basic;
          cgst_amt += cgA; sgst_amt += sgA; igst_amt += igA;
          if (i === 0) { cgst_pct_hdr = cgP; sgst_pct_hdr = sgP; igst_pct_hdr = igP; }
          return { item_name: it.material_name, unit: it.unit, qty, rate, basic,
                   gstPct, mode: tax_mode, cgP, cgA, sgP, sgA, igP, igA,
                   gstA: cgA + sgA + igA, line_total: basic + cgA + sgA + igA,
                   po_item_id: it.po_item_id || null };
        });
        const gst_amount = cgst_amt + sgst_amt + igst_amt;
        const total_amount = basic_amount + gst_amount + transport_charges + transport_gst_amt + other_charges;

        // Insert tqs_bills header (with ign_id instead of grn_id)
        const billRes = await client.query(`
          INSERT INTO tqs_bills (
            company_id, project_id, sl_number, vendor_id, vendor_name,
            po_id, ign_id, po_number, inv_number, inv_date, inv_month, received_date,
            bill_type, tax_mode,
            basic_amount, cgst_pct, cgst_amt, sgst_pct, sgst_amt,
            igst_pct, igst_amt, gst_amount,
            transport_charges, transport_gst_pct, transport_gst_amt, transport_desc,
            other_charges, other_charges_desc,
            total_amount, remarks, workflow_status, created_by
          ) VALUES (
            $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,
            $15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32
          ) RETURNING *
        `, [
          req.user.company_id, project_id, billSlNumber, vendor_id || null, vendor_name,
          po_id || null, ignId, po_number || null, inv_number, inv_date, inv_month,
          date_time ? date_time.slice(0, 10) : null,
          'po', tax_mode,
          basic_amount, cgst_pct_hdr, cgst_amt, sgst_pct_hdr, sgst_amt,
          igst_pct_hdr, igst_amt, gst_amount,
          transport_charges, transport_gst_pct, transport_gst_amt, billData.transport_desc || null,
          other_charges, billData.other_charges_desc || null,
          total_amount, remarks || null, 'pending', req.user.id,
        ]);
        const billId = billRes.rows[0].id;

        await client.query(
          `INSERT INTO tqs_bill_updates (bill_id, balance_to_pay) VALUES ($1, $2)`,
          [billId, total_amount]
        );

        // Line items + inventory + stock transaction
        for (let idx = 0; idx < billItems.length; idx++) {
          const li = billItems[idx];
          await client.query(`
            INSERT INTO tqs_bill_line_items
              (bill_id, item_name, unit, quantity, rate, discount_amount, basic_amount, gst_pct, gst_mode,
               cgst_pct, cgst_amt, sgst_pct, sgst_amt, igst_pct, igst_amt, gst_amount, total_amount,
               sort_order, po_item_id)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
          `, [billId, li.item_name, li.unit, li.qty, li.rate, 0, li.basic,
              li.gstPct, li.mode, li.cgP, li.cgA, li.sgP, li.sgA, li.igP, li.igA,
              li.gstA, li.line_total, idx, li.po_item_id]);

          if (li.item_name && li.qty > 0) {
            const invRes = await client.query(`
              INSERT INTO inventory (project_id, material_name, unit, unit_rate, closing_stock, site_location, last_updated)
              VALUES ($1,$2,$3,$4,$5,$6,NOW())
              ON CONFLICT (project_id, material_name, site_location)
              DO UPDATE SET
                closing_stock = inventory.closing_stock + $5,
                unit_rate = CASE WHEN $4 > 0 THEN $4 ELSE inventory.unit_rate END,
                unit = COALESCE($3, inventory.unit),
                last_updated = NOW()
              RETURNING id
            `, [project_id, String(li.item_name).trim(), li.unit || 'Nos', li.rate, li.qty, site_location || 'main']);

            const inventoryId = invRes.rows[0]?.id;
            if (inventoryId) {
              await client.query(`
                INSERT INTO stock_transactions
                  (project_id, inventory_id, transaction_type, quantity,
                   reference_id, reference_number, remarks, transacted_by, transacted_at)
                VALUES ($1,$2,'bill_receipt',$3,$4,$5,$6,$7,NOW())
              `, [project_id, inventoryId, li.qty, billId, billSlNumber,
                  `Received via Invoice ${inv_number || ''} — ${vendor_name}`, req.user.id]);
            }
          }
        }

        createdBills.push(billRes.rows[0]);
      }

      return { ign: ignRow, bills: createdBills, bill: createdBills[0] || null };
    });

    // Rate variance check — warn if any item deviates >5% from PO item rate
    const rateVariances = [];
    if (po_id && items?.length) {
      const poItems = await query(`SELECT id, material_name, rate FROM po_items WHERE po_id = $1`, [po_id]);
      const poRateMap = {};
      for (const pi of poItems.rows) poRateMap[pi.id] = { name: pi.material_name, rate: parseFloat(pi.rate || 0) };
      for (const it of items) {
        if (it.po_item_id && it.rate && poRateMap[it.po_item_id]) {
          const poRate = poRateMap[it.po_item_id].rate;
          const ignRate = parseFloat(it.rate);
          if (poRate > 0 && Math.abs(ignRate - poRate) / poRate > 0.05) {
            rateVariances.push({
              material: it.material_name,
              po_rate: poRate,
              ign_rate: ignRate,
              variance_pct: ((ignRate - poRate) / poRate * 100).toFixed(1),
            });
          }
        }
      }
    }

    // Notify stores team
    notifyGrnSubmitted(req.user.company_id, { ...result.ign, grn_number: result.ign.ign_number, vendor_name: result.ign.supplier_name || '' });

    res.status(201).json({
      data: result.ign,
      bill: result.bill || null,
      bills: result.bills || [],
      rate_variances: rateVariances,
    });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// ── PATCH /ign/:id/inspect — pending → inspected ──────────────────────────────
router.patch('/:id/inspect', async (req, res) => {
  try {
    const check = await query(
      `SELECT n.project_id, p.company_id FROM ign n
       JOIN projects p ON p.id = n.project_id
       WHERE n.id = $1 AND n.status = 'pending'`,
      [req.params.id]
    );
    if (!check.rows.length || check.rows[0].company_id !== req.user.company_id) {
      return res.status(404).json({ error: 'IGN not found or not in pending state' });
    }
    if (!userCanAccessProject(req, check.rows[0].project_id)) {
      return res.status(403).json({ error: 'You do not have access to this project.' });
    }
    await query(`UPDATE ign SET status = 'inspected' WHERE id = $1`, [req.params.id]);
    res.json({ message: 'IGN marked as inspected' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PATCH /ign/:id/approve — posts to inventory (pending or inspected → approved) ──
router.patch('/:id/approve', async (req, res) => {
  try {
    const result = await withTransaction(async (client) => {
      const check = await client.query(
        `SELECT n.project_id, p.company_id
         FROM ign n
         JOIN projects p ON p.id = n.project_id
         WHERE n.id = $1 AND n.status IN ('pending','inspected')
         FOR UPDATE`,
        [req.params.id]
      );
      if (!check.rows.length || check.rows[0].company_id !== req.user.company_id) {
        throw Object.assign(new Error('IGN not found or already approved'), { status: 404 });
      }
      if (!userCanAccessProject(req, check.rows[0].project_id)) {
        throw Object.assign(new Error('You do not have access to this project.'), { status: 403 });
      }

      // 1. Move status
      const updRes = await client.query(
        `UPDATE ign SET status = 'approved', approved_by = $1, approved_at = NOW()
         WHERE id = $2 AND status IN ('pending','inspected') RETURNING *`,
        [req.user.id, req.params.id]
      );
      if (!updRes.rows.length) throw new Error('IGN not found or already approved');
      const ign = updRes.rows[0];

      // 2. Fetch items
      const items = await client.query(`SELECT * FROM ign_items WHERE ign_id = $1`, [ign.id]);

      // 3. Guard: if bills already posted stock via 'bill_receipt', skip double-counting
      const billPostedCheck = await client.query(
        `SELECT COUNT(*) AS cnt FROM stock_transactions st
         JOIN tqs_bills b ON b.id = st.reference_id
         WHERE b.ign_id = $1 AND b.is_deleted = FALSE AND st.transaction_type = 'bill_receipt'`,
        [ign.id]
      );
      const billsAlreadyPostedStock = parseInt(billPostedCheck.rows[0].cnt) > 0;

      for (const it of items.rows) {
        const itemRate = it.rate ? parseFloat(it.rate) : 0;
        const qtyForInventory = parseFloat(it.qty_inspected || it.qty_as_per_dc || 0);
        let inventoryId;

        if (!billsAlreadyPostedStock) {
          // No bills posted stock — approval is the stock-in event
          const inv = await client.query(
            `INSERT INTO inventory (project_id, material_name, unit, site_location, opening_stock, closing_stock, unit_rate)
             VALUES ($1, $2, $3, $4, 0, $5, $6)
             ON CONFLICT (project_id, material_name, site_location)
             DO UPDATE SET
               closing_stock = inventory.closing_stock + $5,
               unit_rate     = CASE WHEN $6 > 0 THEN $6 ELSE inventory.unit_rate END,
               last_updated  = NOW()
             RETURNING id`,
            [ign.project_id, it.material_name, it.unit, ign.site_location || 'main', qtyForInventory, itemRate]
          );
          inventoryId = inv.rows[0].id;
          await client.query(
            `INSERT INTO stock_transactions (project_id, inventory_id, transaction_type, quantity, reference_number, remarks, transacted_by)
             VALUES ($1, $2, 'grn', $3, $4, $5, $6)`,
            [ign.project_id, inventoryId, qtyForInventory, ign.ign_number, 'IGN Approved', req.user.id]
          );
        } else {
          // Bills already incremented closing_stock; just update unit_rate + get id for batches
          const inv = await client.query(
            `INSERT INTO inventory (project_id, material_name, unit, site_location, opening_stock, closing_stock, unit_rate)
             VALUES ($1, $2, $3, $4, 0, 0, $5)
             ON CONFLICT (project_id, material_name, site_location)
             DO UPDATE SET
               unit_rate = CASE WHEN $5 > 0 THEN $5 ELSE inventory.unit_rate END,
               last_updated = NOW()
             RETURNING id`,
            [ign.project_id, it.material_name, it.unit, ign.site_location || 'main', itemRate]
          );
          inventoryId = inv.rows[0].id;
        }

        // Always create inventory batch (forensic tracking)
        if (inventoryId) {
          await client.query(
            `INSERT INTO inventory_batches (inventory_id, batch_number, expiry_date, opening_quantity, current_quantity, ign_id)
             VALUES ($1, $2, $3, $4, $4, $5)`,
            [inventoryId,
             it.batch_number || `BAT-${ign.ign_number}-${it.id.slice(-4)}`,
             it.expiry_date || null,
             qtyForInventory,
             ign.id]
          );
        }
      }

      // 4. Auto-close PO when all items fully received
      if (ign.po_id) {
        const poCheck = await client.query(
          `SELECT
             SUM(poi.quantity) AS total_ordered,
             COALESCE(SUM(
               (SELECT COALESCE(SUM(ii2.qty_inspected), 0)
                FROM ign_items ii2
                JOIN ign n2 ON n2.id = ii2.ign_id
                WHERE n2.po_id = poi.po_id AND n2.status = 'approved'
                  AND ii2.po_item_id = poi.id)
             ), 0) AS total_received
           FROM po_items poi WHERE poi.po_id = $1`,
          [ign.po_id]
        );
        const row = poCheck.rows[0];
        const ordered  = parseFloat(row?.total_ordered  || 0);
        const received = parseFloat(row?.total_received || 0);
        if (ordered > 0 && received >= ordered) {
          await client.query(
            `UPDATE purchase_orders SET status = 'received' WHERE id = $1 AND status NOT IN ('received','cancelled','rejected')`,
            [ign.po_id]
          );
        }
      }

      // Notify
      const ignFull = await client.query(
        `SELECT n.*, v.name AS vendor_name, p.name AS project_name FROM ign n LEFT JOIN vendors v ON v.id=n.vendor_id JOIN projects p ON p.id=n.project_id WHERE n.id=$1`,
        [req.params.id]
      );
      if (ignFull.rows.length) {
        notifyGrnApproved(req.user.company_id, {
          ...ignFull.rows[0],
          grn_number: ignFull.rows[0].ign_number,
        }, req.user.name);
      }

      return { status: 'approved' };
    });
    res.json({ data: result });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// ── PATCH /ign/:id/cancel ─────────────────────────────────────────────────────
router.patch('/:id/cancel', async (req, res) => {
  try {
    const check = await query(
      `SELECT n.project_id, p.company_id FROM ign n
       JOIN projects p ON p.id = n.project_id
       WHERE n.id = $1 AND n.status = 'pending'`,
      [req.params.id]
    );
    if (!check.rows.length || check.rows[0].company_id !== req.user.company_id) {
      return res.status(404).json({ error: 'IGN not found or cannot be cancelled' });
    }
    if (!userCanAccessProject(req, check.rows[0].project_id)) {
      return res.status(403).json({ error: 'You do not have access to this project.' });
    }
    await query(`UPDATE ign SET status = 'cancelled' WHERE id = $1`, [req.params.id]);
    res.json({ message: 'IGN cancelled' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /ign/:id — super-admin only with guarded stock/bill reversal ────────
router.delete('/:id', authorize('super_admin'), async (req, res) => {
  try {
    const out = await withTransaction(async (client) => {
      const nR = await client.query(
        `SELECT n.*, p.company_id
         FROM ign n JOIN projects p ON p.id = n.project_id
         WHERE n.id = $1 FOR UPDATE`,
        [req.params.id]
      );
      if (!nR.rows.length || nR.rows[0].company_id !== req.user.company_id) {
        throw Object.assign(new Error('IGN not found'), { status: 404 });
      }
      const ign = nR.rows[0];
      const site = ign.site_location || 'main';

      const subtractStock = async (material_name, qty) => {
        const q = parseFloat(qty) || 0;
        if (q <= 0 || !material_name) return;
        const inv = await client.query(
          `SELECT id, closing_stock FROM inventory
           WHERE project_id = $1 AND material_name = $2 AND site_location = $3 FOR UPDATE`,
          [ign.project_id, String(material_name).trim(), site]
        );
        if (!inv.rows.length) return;
        if (parseFloat(inv.rows[0].closing_stock) < q) {
          throw Object.assign(
            new Error(`Cannot delete: "${material_name}" stock has already been issued/consumed (reversal would go negative). Reverse the issues first.`),
            { status: 409 }
          );
        }
        await client.query(
          `UPDATE inventory SET closing_stock = closing_stock - $1, last_updated = NOW() WHERE id = $2`,
          [q, inv.rows[0].id]
        );
      };

      // 1. Block if QS certifications or invoices reference this IGN
      const qsRef = await client.query(`SELECT 1 FROM qs_certifications WHERE grn_id = $1 LIMIT 1`, [ign.id]);
      if (qsRef.rows.length) {
        throw Object.assign(new Error('Cannot delete: a QS certification is linked to this IGN. Reverse the certification first.'), { status: 409 });
      }

      // 2. Linked auto-created bills — block if progressed/paid, else reverse
      const bills = await client.query(
        `SELECT b.id, b.sl_number, b.workflow_status, COALESCE(u.paid_amount, 0) AS paid_amount
         FROM tqs_bills b LEFT JOIN tqs_bill_updates u ON u.bill_id = b.id
         WHERE b.ign_id = $1 AND b.is_deleted = FALSE`,
        [ign.id]
      );
      for (const b of bills.rows) {
        if (String(b.workflow_status || 'pending') !== 'pending' || parseFloat(b.paid_amount) > 0) {
          throw Object.assign(
            new Error(`Cannot delete: linked Bill ${b.sl_number} has been processed/paid. Remove it from the bill workflow first.`),
            { status: 409 }
          );
        }
      }
      for (const b of bills.rows) {
        const li = await client.query(`SELECT item_name, quantity FROM tqs_bill_line_items WHERE bill_id = $1`, [b.id]);
        for (const l of li.rows) await subtractStock(l.item_name, l.quantity);
        await client.query(`DELETE FROM stock_transactions WHERE reference_id = $1 AND transaction_type = 'bill_receipt'`, [b.id]);
        await client.query(`DELETE FROM tqs_bill_files WHERE bill_id = $1`, [b.id]);
        await client.query(`DELETE FROM tqs_bill_line_items WHERE bill_id = $1`, [b.id]);
        await client.query(`DELETE FROM tqs_bill_updates WHERE bill_id = $1`, [b.id]);
        await client.query(`DELETE FROM tqs_bills WHERE id = $1`, [b.id]);
      }

      // 3. Approval posting reversal — reverse 'grn' stock txns keyed by ign_number
      if (ign.status === 'approved') {
        const qcTxns = await client.query(
          `SELECT COUNT(*) AS cnt FROM stock_transactions WHERE reference_number=$1 AND transaction_type='grn'`,
          [ign.ign_number]
        );
        if (parseInt(qcTxns.rows[0].cnt) > 0) {
          const its = await client.query(`SELECT material_name, qty_inspected, qty_as_per_dc FROM ign_items WHERE ign_id = $1`, [ign.id]);
          for (const it of its.rows) {
            await subtractStock(it.material_name, it.qty_inspected || it.qty_as_per_dc);
          }
        }
        await client.query(`DELETE FROM stock_transactions WHERE reference_number = $1 AND transaction_type = 'grn'`, [ign.ign_number]);
        if (ign.po_id) {
          await client.query(`UPDATE purchase_orders SET status = 'approved' WHERE id = $1 AND status = 'received'`, [ign.po_id]);
        }
      }

      // Always clear forensic batches
      await client.query(`DELETE FROM inventory_batches WHERE ign_id = $1`, [ign.id]);

      // Delete IGN (ign_items cascade)
      await client.query(`DELETE FROM ign WHERE id = $1`, [ign.id]);
      return { bills_removed: bills.rows.length, stock_reversed: ign.status === 'approved' || bills.rows.length > 0 };
    });
    res.json({ message: 'IGN deleted', ...out });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

module.exports = router;
