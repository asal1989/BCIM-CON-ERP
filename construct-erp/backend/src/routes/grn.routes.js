// src/routes/grn.routes.js
const express = require('express');
const { authenticate, authorize } = require('../middleware/auth');
const { loadProjectScope, userCanAccessProject, appendProjectScope } = require('../middleware/projectScope');
const { query, withTransaction } = require('../config/database');
const { notifyGrnSubmitted, notifyGrnVerifiedStores, notifyGrnApproved } = require('../services/notif.helper');
const { postAutoJournalStandalone } = require('../services/journalAutoPost');
const router = express.Router();

// ── Auto-migrate: fix legacy grn schema ───────────────────────────────────
(async () => {
  const safe = async (sql) => {
    try { await query(sql); } catch (e) { /* ignore — already applied or column missing */ }
  };

  // 1. Drop NOT NULL on old header columns (now superseded by grn_items)
  await safe(`ALTER TABLE grn ALTER COLUMN material_name DROP NOT NULL`);
  await safe(`ALTER TABLE grn ALTER COLUMN quantity_received DROP NOT NULL`);
  await safe(`ALTER TABLE grn ALTER COLUMN unit DROP NOT NULL`);

  // 2. Fix quality_status check constraint — drop whatever exists, recreate correctly
  await safe(`ALTER TABLE grn DROP CONSTRAINT IF EXISTS grn_quality_status_check`);
  await safe(`ALTER TABLE grn ADD CONSTRAINT grn_quality_status_check
    CHECK (quality_status IN ('pending','verified_stores','approved','rejected','partial'))`);

  // 3. Ensure grn_items has batch/expiry columns
  await safe(`ALTER TABLE grn_items ADD COLUMN IF NOT EXISTS batch_number TEXT`);
  await safe(`ALTER TABLE grn_items ADD COLUMN IF NOT EXISTS expiry_date DATE`);

  // 4. Thumb rule — unit conversion (e.g. PO in Sqm, stores counts Nos)
  await safe(`ALTER TABLE grn_items ADD COLUMN IF NOT EXISTS physical_qty NUMERIC(14,3)`);
  await safe(`ALTER TABLE grn_items ADD COLUMN IF NOT EXISTS physical_unit VARCHAR(30)`);
  await safe(`ALTER TABLE grn_items ADD COLUMN IF NOT EXISTS conversion_factor NUMERIC(14,6) DEFAULT 1`);

  // 5. Rate per item — needed for inventory unit_rate update
  await safe(`ALTER TABLE grn_items ADD COLUMN IF NOT EXISTS rate NUMERIC(14,2) DEFAULT 0`);

  // 6. IGN bracket — structured notes (Issues / General already in remarks / Inspection Notes)
  await safe(`ALTER TABLE grn ADD COLUMN IF NOT EXISTS issues_notes TEXT`);
  await safe(`ALTER TABLE grn ADD COLUMN IF NOT EXISTS inspection_notes TEXT`);

  // 7. IGN link — tie GRN back to the Inward Goods Note that preceded it
  await safe(`ALTER TABLE grn ADD COLUMN IF NOT EXISTS ign_id UUID REFERENCES ign(id)`);
  await safe(`ALTER TABLE grn ADD COLUMN IF NOT EXISTS ign_number VARCHAR(50)`);

  console.log('[GRN] Schema migration OK');
})();

// Public Verification Endpoint
router.get('/public/verify/:id', async (req, res) => {
  try {
    const grn = await query(
      `SELECT g.*,
              v.name AS vendor_name,
              v.name AS supplier_name,
              p.name AS project_name,
              p.project_code,
              u.name  AS received_by_name,
              sto.name AS verified_stores_name,
              sto.name AS verified_by_name,
              sto.signature_url AS verified_stores_sig,
              qc.name AS approved_qc_name,
              qc.name AS approved_by_name,
              qc.signature_url AS approved_qc_sig
       FROM grn g
       JOIN projects p ON g.project_id = p.id
       LEFT JOIN vendors v ON g.vendor_id = v.id
       LEFT JOIN users u ON g.received_by = u.id
       LEFT JOIN users sto ON g.verified_stores_by = sto.id
       LEFT JOIN users qc ON g.approved_qc_by = qc.id
       WHERE g.id = $1`,
      [req.params.id]
    );
    if (!grn.rows.length) return res.status(404).json({ error: 'GRN record not found' });
    
    const items = await query(
      `SELECT * FROM grn_items WHERE grn_id = $1 ORDER BY sort_order`,
      [req.params.id]
    );
    res.json({ data: { ...grn.rows[0], items: items.rows } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.use(authenticate);
router.use(loadProjectScope);

// GET /grn
router.get('/', async (req, res) => {
  try {
    const { project_id, status } = req.query;
    let sql = `SELECT g.*,
                      g.quality_status AS status,
                      v.name as vendor_name,
                      v.name as supplier_name,
                      p.name as project_name,
                      COALESCE(items.items_summary, g.material_name) AS items_summary,
                      COALESCE(items.unit_summary, g.unit) AS unit_summary,
                      COALESCE(items.quantity_received, g.total_quantity, g.quantity_received, 0) AS report_quantity_received
               FROM grn g
               JOIN projects p ON g.project_id = p.id
               LEFT JOIN vendors v ON g.vendor_id = v.id
               LEFT JOIN LATERAL (
                 SELECT
                   STRING_AGG(gi.material_name, ', ' ORDER BY gi.sort_order) AS items_summary,
                   STRING_AGG(DISTINCT gi.unit, ', ') FILTER (WHERE gi.unit IS NOT NULL AND gi.unit <> '') AS unit_summary,
                   SUM(gi.quantity_received)::numeric AS quantity_received
                 FROM grn_items gi
                 WHERE gi.grn_id = g.id
               ) items ON true
               WHERE p.company_id = $1`;
    let params = [req.user.company_id];
    let i = 2;
    if (project_id) { sql += ` AND g.project_id = $${i++}`; params.push(project_id); }
    if (status)     { sql += ` AND g.quality_status = $${i++}`; params.push(status); }
    ({ sql, params } = appendProjectScope(req, sql, params, 'g'));
    sql += ' ORDER BY g.grn_date DESC';
    const result = await query(sql, params);
    res.json({ data: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /grn/:id
router.get('/:id', async (req, res) => {
  try {
    const grn = await query(
      `SELECT g.*, v.name as vendor_name, p.name as project_name, p.project_code, p.company_id,
              u.name AS received_by_name,
              sto.name AS verified_stores_name, sto.signature_url AS verified_stores_sig,
              qc.name AS approved_qc_name, qc.signature_url AS approved_qc_sig
       FROM grn g
       JOIN projects p ON g.project_id = p.id
       LEFT JOIN vendors v ON g.vendor_id = v.id
       LEFT JOIN users u ON g.received_by = u.id
       LEFT JOIN users sto ON g.verified_stores_by = sto.id
       LEFT JOIN users qc ON g.approved_qc_by = qc.id
       WHERE g.id = $1`,
      [req.params.id]
    );
    if (!grn.rows.length || grn.rows[0].company_id !== req.user.company_id) {
      return res.status(404).json({ error: 'GRN record not found' });
    }
    if (!userCanAccessProject(req, grn.rows[0].project_id)) {
      return res.status(403).json({ error: 'You do not have access to this project.' });
    }
    const items = await query(
      `SELECT * FROM grn_items WHERE grn_id = $1 ORDER BY sort_order`,
      [req.params.id]
    );
    res.json({ data: { ...grn.rows[0], items: items.rows } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Helper: generate next bill SL number (mirrors nextSlNumber in tqs-bills.routes.js)
async function nextBillSlNumber(companyId) {
  const res = await query(
    `SELECT COALESCE(MAX(CAST(REGEXP_REPLACE(sl_number, '[^0-9]', '', 'g') AS INTEGER)), 0) AS max_num
     FROM tqs_bills WHERE sl_number ~ '[0-9]' AND company_id = $1`,
    [companyId]
  );
  return `P0-${(Number(res.rows[0]?.max_num) || 0) + 1}`;
}

// POST /grn (Multi-item inwarding)
router.post('/', async (req, res) => {
  try {
    const {
      project_id, po_id, po_number, vendor_id, grn_date,
      vehicle_number, driver_name, challan_number, invoice_number,
      site_location, gate_pass_no, wb_slip_no,
      remarks, issues_notes, inspection_notes,
      ign_id, ign_number,
      items,
      bills: billsData,
      bill: legacyBillData,
    } = req.body;

    // Support both new `bills` array and old single `bill` for backward compat
    const billsArray = billsData?.length ? billsData : (legacyBillData ? [legacyBillData] : []);

    if (!project_id || !items?.length) {
      return res.status(400).json({ error: 'Missing required project or items.' });
    }
    if (!userCanAccessProject(req, project_id)) {
      return res.status(403).json({ error: 'You do not have access to this project.' });
    }

    // Pre-generate SL numbers for each bill (sequential offsets from current DB max)
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
      // 1. Generate GRN Number (MAX per company+year to avoid cross-company duplicates)
      const yr = new Date().getFullYear();
      const countRes = await client.query(
        `SELECT COALESCE(MAX(CAST(SPLIT_PART(g.grn_number,'/',3) AS INTEGER)), 0) + 1 AS next
         FROM grn g JOIN projects p ON p.id = g.project_id
         WHERE p.company_id = $1 AND EXTRACT(YEAR FROM g.created_at) = $2`,
        [req.user.company_id, yr]
      );
      const seq = String(countRes.rows[0].next).padStart(4, '0');
      const grn_number = `GRN/${yr}/${seq}`;

      // 2. Insert Header (Initial Status: pending)
      const headerRes = await client.query(
        `INSERT INTO grn (
          project_id, po_id, vendor_id, grn_number, grn_date,
          vehicle_number, driver_name, challan_number, invoice_number,
          site_location, gate_pass_no, wb_slip_no, remarks, issues_notes, inspection_notes,
          ign_id, ign_number,
          quality_status, received_by
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,'pending',$18) RETURNING *`,
        [project_id, po_id, vendor_id, grn_number, grn_date, vehicle_number, driver_name,
         challan_number, invoice_number, site_location, gate_pass_no, wb_slip_no,
         remarks, issues_notes || null, inspection_notes || null,
         ign_id || null, ign_number || null, req.user.id]
      );
      const grnId = headerRes.rows[0].id;

      // 3. Insert Items
      let totalQty = 0;
      const processedItems = [];
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        const hasThumbRule = it.physical_qty && it.physical_unit && it.conversion_factor && it.conversion_factor !== 1;
        const qtyInPoUnit = hasThumbRule
          ? parseFloat(it.physical_qty) * parseFloat(it.conversion_factor)
          : parseFloat(it.quantity_received);

        await client.query(
          `INSERT INTO grn_items (
            grn_id, material_name, quantity_received, unit, rate,
            physical_qty, physical_unit, conversion_factor,
            po_item_id, quality_remarks, batch_number, expiry_date, sort_order
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
          [grnId, it.material_name || null, qtyInPoUnit, it.unit,
           it.rate ? parseFloat(it.rate) : 0,
           it.physical_qty || null, it.physical_unit || null,
           it.conversion_factor ? parseFloat(it.conversion_factor) : 1,
           it.po_item_id || null, it.quality_remarks || null,
           it.batch_number || null, it.expiry_date || null, i + 1]
        );
        totalQty += qtyInPoUnit;
        processedItems.push({ ...it, _qty: qtyInPoUnit, _rate: parseFloat(it.rate || 0) });
      }

      // 4. Update Header with totals
      const projRes = await client.query('SELECT project_code FROM projects WHERE id = $1', [project_id]);
      const serial_no_formatted = `BCIM-${projRes.rows[0].project_code || 'PRJ'}-GRN-${seq}`;
      const finalRes = await client.query(
        `UPDATE grn SET total_quantity = $1, serial_no_formatted = $2 WHERE id = $3 RETURNING *`,
        [totalQty, serial_no_formatted, grnId]
      );
      const grnRow = finalRes.rows[0];

      // 5. Optionally create TQS Bills (one per entry in billsArray)
      const createdBills = [];

      // Vendor name lookup (shared across all bills for this GRN)
      const vendorRes = vendor_id
        ? await client.query('SELECT name FROM vendors WHERE id = $1', [vendor_id])
        : { rows: [] };
      const vendor_name = vendorRes.rows[0]?.name || '';

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
        const tcs_pct = parseFloat(billData.tcs_pct) || 0;
        const inv_date = billData.inv_date || null;
        const inv_month = inv_date ? inv_date.slice(0, 7) : null;
        const inv_number = billData.inv_number || invoice_number || null;

        // Duplicate invoice guard per bill
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
        const preTcsTotal = basic_amount + gst_amount + transport_charges + transport_gst_amt + other_charges;
        const tcs_amt = preTcsTotal * tcs_pct / 100;
        const total_amount = preTcsTotal + tcs_amt;

        // Insert tqs_bills header
        const billRes = await client.query(`
          INSERT INTO tqs_bills (
            company_id, project_id, sl_number, vendor_id, vendor_name,
            po_id, grn_id, po_number, inv_number, inv_date, inv_month, received_date,
            bill_type, tax_mode,
            basic_amount, cgst_pct, cgst_amt, sgst_pct, sgst_amt,
            igst_pct, igst_amt, gst_amount,
            transport_charges, transport_gst_pct, transport_gst_amt, transport_desc,
            other_charges, other_charges_desc,
            tcs_pct, tcs_amt,
            total_amount, remarks, workflow_status, created_by
          ) VALUES (
            $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,
            $15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34
          ) RETURNING *
        `, [
          req.user.company_id, project_id, billSlNumber, vendor_id || null, vendor_name,
          po_id || null, grnId, po_number || null, inv_number, inv_date, inv_month, grn_date,
          'po', tax_mode,
          basic_amount, cgst_pct_hdr, cgst_amt, sgst_pct_hdr, sgst_amt,
          igst_pct_hdr, igst_amt, gst_amount,
          transport_charges, transport_gst_pct, transport_gst_amt, billData.transport_desc || null,
          other_charges, billData.other_charges_desc || null,
          tcs_pct, tcs_amt.toFixed(2),
          total_amount, remarks || null, 'pending', req.user.id,
        ]);
        const billId = billRes.rows[0].id;

        // Bill updates tracking row
        await client.query(
          `INSERT INTO tqs_bill_updates (bill_id, balance_to_pay) VALUES ($1, $2)`,
          [billId, total_amount]
        );

        // Line items + inventory upsert + stock transaction
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

      return { grn: grnRow, bills: createdBills, bill: createdBills[0] || null };
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
          const grnRate = parseFloat(it.rate);
          if (poRate > 0 && Math.abs(grnRate - poRate) / poRate > 0.05) {
            rateVariances.push({
              material: it.material_name,
              po_rate: poRate,
              grn_rate: grnRate,
              variance_pct: ((grnRate - poRate) / poRate * 100).toFixed(1),
            });
          }
        }
      }
    }

    // Fire-and-forget push notification to stores team
    notifyGrnSubmitted(req.user.company_id, result.grn);
    res.status(201).json({
      data: result.grn,
      bill: result.bill || null,
      bills: result.bills || [],
      rate_variances: rateVariances,
    });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// Sequential Approval & Inventory Hook
router.patch('/:id/verify-stores', async (req, res) => {
  try {
    const grn = await query(
      `SELECT g.project_id, p.company_id
       FROM grn g
       JOIN projects p ON p.id = g.project_id
       WHERE g.id = $1 AND g.quality_status = 'pending'`,
      [req.params.id]
    );
    if (!grn.rows.length || grn.rows[0].company_id !== req.user.company_id) {
      return res.status(404).json({ error: 'GRN not found or not in pending state' });
    }
    if (!userCanAccessProject(req, grn.rows[0].project_id)) {
      return res.status(403).json({ error: 'You do not have access to this project.' });
    }
    await query(
      `UPDATE grn SET quality_status = 'verified_stores', verified_stores_by = $1, verified_stores_at = NOW()
       WHERE id = $2 AND quality_status = 'pending'`,
      [req.user.id, req.params.id]
    );
    // Notify QC/PM that GRN needs their approval
    const grnRow = await query(`SELECT g.*, v.name AS vendor_name, p.name AS project_name FROM grn g LEFT JOIN vendors v ON v.id=g.vendor_id JOIN projects p ON p.id=g.project_id WHERE g.id=$1`, [req.params.id]);
    if (grnRow.rows.length) notifyGrnVerifiedStores(req.user.company_id, grnRow.rows[0], req.user.name);
    res.json({ message: 'Stores verification complete' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/:id/approve-qc', async (req, res) => {
  try {
    const result = await withTransaction(async (client) => {
      const check = await client.query(
        `SELECT g.project_id, p.company_id
         FROM grn g
         JOIN projects p ON p.id = g.project_id
         WHERE g.id = $1 AND g.quality_status = 'verified_stores'
         FOR UPDATE`,
        [req.params.id]
      );
      if (!check.rows.length || check.rows[0].company_id !== req.user.company_id) {
        throw Object.assign(new Error('GRN not in verified_stores state or not found'), { status: 404 });
      }
      if (!userCanAccessProject(req, check.rows[0].project_id)) {
        throw Object.assign(new Error('You do not have access to this project.'), { status: 403 });
      }
      // 1. Move Status
      const gRes = await client.query(
        `UPDATE grn SET quality_status = 'approved', approved_qc_by = $1, approved_qc_at = NOW()
         WHERE id = $2 AND quality_status = 'verified_stores' RETURNING *`,
        [req.user.id, req.params.id]
      );
      if (!gRes.rows.length) throw new Error('GRN not in verified_stores state or not found');
      const grn = gRes.rows[0];

      // 2. Fetch Items
      const items = await client.query(`SELECT * FROM grn_items WHERE grn_id = $1`, [grn.id]);

      // 3. Process Inventory Updates
      // Guard: if bills already posted stock via 'bill_receipt', skip incrementing
      // closing_stock to avoid double-counting the same physical delivery.
      const billPostedCheck = await client.query(
        `SELECT COUNT(*) AS cnt FROM stock_transactions st
         JOIN tqs_bills b ON b.id = st.reference_id
         WHERE b.grn_id = $1 AND b.is_deleted = FALSE AND st.transaction_type = 'bill_receipt'`,
        [grn.id]
      );
      const billsAlreadyPostedStock = parseInt(billPostedCheck.rows[0].cnt) > 0;

      for (const it of items.rows) {
        // Find/Create Inventory Item — also store latest unit_rate
        const itemRate = it.rate ? parseFloat(it.rate) : 0;
        let inventoryId;

        if (!billsAlreadyPostedStock) {
          // No bills posted stock — QC approval is the stock-in event
          const inv = await client.query(
            `INSERT INTO inventory (project_id, material_name, unit, site_location, opening_stock, closing_stock, unit_rate)
             VALUES ($1, $2, $3, $4, 0, $5, $6)
             ON CONFLICT (project_id, material_name, site_location)
             DO UPDATE SET
               closing_stock = inventory.closing_stock + $5,
               unit_rate     = CASE WHEN $6 > 0 THEN $6 ELSE inventory.unit_rate END,
               last_updated  = NOW()
             RETURNING id`,
            [grn.project_id, it.material_name, it.unit, grn.site_location || 'main', parseFloat(it.quantity_received), itemRate]
          );
          inventoryId = inv.rows[0].id;
          await client.query(
            `INSERT INTO stock_transactions (project_id, inventory_id, transaction_type, quantity, reference_number, remarks, transacted_by)
             VALUES ($1, $2, 'grn', $3, $4, $5, $6)`,
            [grn.project_id, inventoryId, it.quantity_received, grn.grn_number, 'QC Approved', req.user.id]
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
            [grn.project_id, it.material_name, it.unit, grn.site_location || 'main', itemRate]
          );
          inventoryId = inv.rows[0].id;
        }
        // Spawn Forensic Batch/Lot (always, regardless of whether bills posted stock)
        if (inventoryId) {
          await client.query(
            `INSERT INTO inventory_batches (inventory_id, batch_number, expiry_date, opening_quantity, current_quantity, grn_id)
             VALUES ($1, $2, $3, $4, $4, $5)`,
            [inventoryId, it.batch_number || `BAT-${grn.grn_number}-${it.id.slice(-4)}`, it.expiry_date || null, parseFloat(it.quantity_received), grn.id]
          );
        }
      }

      // QC approval is the actual goods-received event when no bill exists yet for
      // this GRN (billsAlreadyPostedStock=false). Track the value so Accounts can
      // be posted a provisional JV after commit — never inside this transaction,
      // since postAutoJournalStandalone opens its own connection.
      const provisionalValue = billsAlreadyPostedStock
        ? 0
        : items.rows.reduce((s, it) => s + (parseFloat(it.quantity_received) || 0) * (parseFloat(it.rate) || 0), 0);

      // Auto-close PO when all items are fully received
      if (grn.po_id) {
        const poCheck = await client.query(
          `SELECT
             SUM(poi.quantity) AS total_ordered,
             COALESCE(SUM(
               (SELECT COALESCE(SUM(gi2.quantity_received), 0)
                FROM grn_items gi2
                JOIN grn g2 ON g2.id = gi2.grn_id
                WHERE g2.po_id = poi.po_id AND g2.quality_status = 'approved'
                  AND gi2.po_item_id = poi.id)
             ), 0) AS total_received
           FROM po_items poi WHERE poi.po_id = $1`,
          [grn.po_id]
        );
        const row = poCheck.rows[0];
        const ordered  = parseFloat(row?.total_ordered  || 0);
        const received = parseFloat(row?.total_received || 0);
        if (ordered > 0 && received >= ordered) {
          await client.query(
            `UPDATE purchase_orders SET status = 'fully_received' WHERE id = $1 AND status NOT IN ('fully_received','cancelled','rejected')`,
            [grn.po_id]
          );
        }
      }

      // Notify GRN creator + accounts
      const grnFull = await query(`SELECT g.*, v.name AS vendor_name, p.name AS project_name FROM grn g LEFT JOIN vendors v ON v.id=g.vendor_id JOIN projects p ON p.id=g.project_id WHERE g.id=$1`, [req.params.id]);
      if (grnFull.rows.length) notifyGrnApproved(req.user.company_id, grnFull.rows[0], req.user.name);

      return { status: 'approved', provisionalValue, grn_number: grn.grn_number, grn_date: grn.grn_date, project_id: grn.project_id };
    });

    // No bill exists for this GRN yet — post a provisional "goods received, not
    // invoiced" journal entry so Accounts reflects the cost immediately. When a
    // formal bill later references this grn_id and gets approved, that JV debits
    // 2010 (instead of the usual 5000/5100) to clear this liability, so the value
    // is never counted twice.
    if (result.provisionalValue > 0) {
      postAutoJournalStandalone({
        companyId: req.user.company_id,
        userId:    req.user.id,
        entryDate: result.grn_date,
        projectId: result.project_id || null,
        reference: result.grn_number,
        narration: `Goods received (bill pending) — GRN ${result.grn_number}`,
        source:    'auto_grn_provisional',
        lines: [
          { code: '1200', debit:  result.provisionalValue, description: `Inventory received — ${result.grn_number}` },
          { code: '2010', credit: result.provisionalValue, description: `GRIN — ${result.grn_number}` },
        ],
      }).catch(() => {});
    }

    res.json({ data: result });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// ── DELETE /grn/:id — super-admin only, with guarded stock/bill reversal ──────
// A GRN posts inventory two ways: (1) auto-created bills at GRN creation
// ('bill_receipt' txns keyed by bill id) and (2) QC approval (inventory_batches
// keyed by grn_id, a 'grn' stock txn, and PO → 'received'). Deleting reverses
// exactly what was posted, in one transaction. It is BLOCKED (nothing changes)
// when the GRN is too far downstream to safely unwind: a QS certification or
// vendor invoice references it, a linked bill has progressed past 'pending' or
// been paid, or a reversal would drive a stock balance negative (goods issued).
router.delete('/:id', authorize('super_admin'), async (req, res) => {
  try {
    const out = await withTransaction(async (client) => {
      const gR = await client.query(
        `SELECT g.*, p.company_id
         FROM grn g JOIN projects p ON p.id = g.project_id
         WHERE g.id = $1 FOR UPDATE`,
        [req.params.id]
      );
      if (!gR.rows.length || gR.rows[0].company_id !== req.user.company_id) {
        throw Object.assign(new Error('GRN not found'), { status: 404 });
      }
      const grn = gR.rows[0];
      const site = grn.site_location || 'main';

      // Hard FK blockers (these tables reference grn(id) without cascade and
      // represent downstream certification / accounting that must not be orphaned).
      const qsRef = await client.query(`SELECT 1 FROM qs_certifications WHERE grn_id = $1 LIMIT 1`, [grn.id]);
      if (qsRef.rows.length) {
        throw Object.assign(new Error('Cannot delete: a QS certification is linked to this GRN. Reverse the certification first.'), { status: 409 });
      }
      const invRef = await client.query(`SELECT 1 FROM invoices WHERE grn_id = $1 LIMIT 1`, [grn.id]);
      if (invRef.rows.length) {
        throw Object.assign(new Error('Cannot delete: a vendor invoice is linked to this GRN. Remove that invoice first.'), { status: 409 });
      }

      const subtractStock = async (material_name, qty) => {
        const q = parseFloat(qty) || 0;
        if (q <= 0 || !material_name) return;
        const inv = await client.query(
          `SELECT id, closing_stock FROM inventory
           WHERE project_id = $1 AND material_name = $2 AND site_location = $3 FOR UPDATE`,
          [grn.project_id, String(material_name).trim(), site]
        );
        if (!inv.rows.length) return; // nothing posted under this key / already removed
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

      // 1. Linked auto-created bills — block if any progressed/paid, else reverse.
      const bills = await client.query(
        `SELECT b.id, b.sl_number, b.workflow_status, COALESCE(u.paid_amount, 0) AS paid_amount
         FROM tqs_bills b LEFT JOIN tqs_bill_updates u ON u.bill_id = b.id
         WHERE b.grn_id = $1 AND b.is_deleted = FALSE`,
        [grn.id]
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

      // 2. QC-approval posting — only reverse if QC actually posted to inventory
      // (i.e. 'grn' transactions exist). When bills posted stock first, QC skips
      // the inventory increment so there is nothing to reverse here.
      if (grn.quality_status === 'approved') {
        const qcTxns = await client.query(
          `SELECT COUNT(*) AS cnt FROM stock_transactions WHERE reference_number=$1 AND transaction_type='grn'`,
          [grn.grn_number]
        );
        if (parseInt(qcTxns.rows[0].cnt) > 0) {
          const items = await client.query(`SELECT material_name, quantity_received FROM grn_items WHERE grn_id = $1`, [grn.id]);
          for (const it of items.rows) await subtractStock(it.material_name, it.quantity_received);
        }
        await client.query(`DELETE FROM stock_transactions WHERE reference_number = $1 AND transaction_type = 'grn'`, [grn.grn_number]);
        if (grn.po_id) {
          await client.query(`UPDATE purchase_orders SET status = 'approved' WHERE id = $1 AND status = 'fully_received'`, [grn.po_id]);
        }
      }

      // Always clear forensic batches (FK without cascade; no-op when none exist).
      await client.query(`DELETE FROM inventory_batches WHERE grn_id = $1`, [grn.id]);

      // 3. Delete the GRN (grn_items cascade).
      await client.query(`DELETE FROM grn WHERE id = $1`, [grn.id]);
      return { bills_removed: bills.rows.length, stock_reversed: grn.quality_status === 'approved' || bills.rows.length > 0 };
    });
    res.json({ message: 'GRN deleted', ...out });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

module.exports = router;
