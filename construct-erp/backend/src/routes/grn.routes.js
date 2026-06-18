// src/routes/grn.routes.js
const express = require('express');
const { authenticate } = require('../middleware/auth');
const { loadProjectScope, userCanAccessProject, appendProjectScope } = require('../middleware/projectScope');
const { query, withTransaction } = require('../config/database');
const { notifyGrnSubmitted, notifyGrnVerifiedStores, notifyGrnApproved } = require('../services/notif.helper');
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
      bill: billData,
    } = req.body;

    if (!project_id || !items?.length) {
      return res.status(400).json({ error: 'Missing required project or items.' });
    }
    if (!userCanAccessProject(req, project_id)) {
      return res.status(403).json({ error: 'You do not have access to this project.' });
    }

    // Pre-generate bill SL number outside the transaction (same pattern as tqs-bills route)
    let billSlNumber = null;
    if (billData) {
      billSlNumber = await nextBillSlNumber(req.user.company_id);
    }

    const result = await withTransaction(async (client) => {
      // 1. Generate GRN Number
      const yr = new Date().getFullYear();
      const countRes = await client.query('SELECT COUNT(*) FROM grn');
      const seq = String(parseInt(countRes.rows[0].count) + 1).padStart(4, '0');
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

      // 5. Optionally create TQS Bill in the same transaction
      let billRow = null;
      if (billData && billSlNumber) {
        const tax_mode = billData.tax_mode || 'intrastate';
        const defaultGstPct = parseFloat(billData.gst_pct) || 18;
        const itemGstOverrides = billData.item_gst_overrides || {};
        const transport_charges = parseFloat(billData.transport_charges) || 0;
        const transport_gst_pct = parseFloat(billData.transport_gst_pct) || 18;
        const transport_gst_amt = transport_charges * transport_gst_pct / 100;
        const other_charges = parseFloat(billData.other_charges) || 0;
        const inv_date = billData.inv_date || null;
        const inv_month = inv_date ? inv_date.slice(0, 7) : null;

        // Vendor name lookup
        const vendorRes = vendor_id
          ? await client.query('SELECT name FROM vendors WHERE id = $1', [vendor_id])
          : { rows: [] };
        const vendor_name = vendorRes.rows[0]?.name || '';

        // Duplicate invoice guard
        if (invoice_number && vendor_name) {
          const dup = await client.query(
            `SELECT id FROM tqs_bills
             WHERE is_deleted = FALSE AND company_id = $1
               AND LOWER(BTRIM(COALESCE(vendor_name,''))) = $2
               AND LOWER(BTRIM(COALESCE(inv_number,''))) = $3
             LIMIT 1`,
            [req.user.company_id, vendor_name.toLowerCase().trim(), invoice_number.toLowerCase().trim()]
          );
          if (dup.rows.length) {
            throw Object.assign(
              new Error(`Duplicate invoice: "${invoice_number}" for "${vendor_name}" already exists in Bill Tracker.`),
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
            total_amount, remarks, workflow_status, created_by
          ) VALUES (
            $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,
            $15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32
          ) RETURNING *
        `, [
          req.user.company_id, project_id, billSlNumber, vendor_id || null, vendor_name,
          po_id || null, grnId, po_number || null, invoice_number, inv_date, inv_month, grn_date,
          'po', tax_mode,
          basic_amount, cgst_pct_hdr, cgst_amt, sgst_pct_hdr, sgst_amt,
          igst_pct_hdr, igst_amt, gst_amount,
          transport_charges, transport_gst_pct, transport_gst_amt, billData.transport_desc || null,
          other_charges, billData.other_charges_desc || null,
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
              VALUES ($1,$2,$3,$4,$5,'main',NOW())
              ON CONFLICT (project_id, material_name, site_location)
              DO UPDATE SET
                closing_stock = inventory.closing_stock + $5,
                unit_rate = CASE WHEN $4 > 0 THEN $4 ELSE inventory.unit_rate END,
                unit = COALESCE($3, inventory.unit),
                last_updated = NOW()
              RETURNING id
            `, [project_id, String(li.item_name).trim(), li.unit || 'Nos', li.rate, li.qty]);

            const inventoryId = invRes.rows[0]?.id;
            if (inventoryId) {
              await client.query(`
                INSERT INTO stock_transactions
                  (project_id, inventory_id, transaction_type, quantity,
                   reference_id, reference_number, remarks, transacted_by, transacted_at)
                VALUES ($1,$2,'bill_receipt',$3,$4,$5,$6,$7,NOW())
              `, [project_id, inventoryId, li.qty, billId, billSlNumber,
                  `Received via Invoice ${invoice_number || ''} — ${vendor_name}`, req.user.id]);
            }
          }
        }

        billRow = billRes.rows[0];
      }

      return { grn: grnRow, bill: billRow };
    });

    // Fire-and-forget push notification to stores team
    notifyGrnSubmitted(req.user.company_id, result.grn);
    res.status(201).json({ data: result.grn, bill: result.bill || null });
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
      for (const it of items.rows) {
        // Find/Create Inventory Item — also store latest unit_rate
        const itemRate = it.rate ? parseFloat(it.rate) : 0;
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
        const inventoryId = inv.rows[0].id;
        
        // Spawn Forensic Batch/Lot
        await client.query(
          `INSERT INTO inventory_batches (inventory_id, batch_number, expiry_date, opening_quantity, current_quantity, grn_id)
           VALUES ($1, $2, $3, $4, $4, $5)`,
          [inventoryId, it.batch_number || `BAT-${grn.grn_number}-${it.id.slice(-4)}`, it.expiry_date || null, parseFloat(it.quantity_received), grn.id]
        );
        
        await client.query(
          `INSERT INTO stock_transactions (project_id, inventory_id, transaction_type, quantity, reference_number, remarks, transacted_by)
           VALUES ($1, $2, 'grn', $3, $4, $5, $6)`,
          [grn.project_id, inventoryId, it.quantity_received, grn.grn_number, 'Industrial QC Approved', req.user.id]
        );
      }
      // Notify GRN creator + accounts
      const grnFull = await query(`SELECT g.*, v.name AS vendor_name, p.name AS project_name FROM grn g LEFT JOIN vendors v ON v.id=g.vendor_id JOIN projects p ON p.id=g.project_id WHERE g.id=$1`, [req.params.id]);
      if (grnFull.rows.length) notifyGrnApproved(req.user.company_id, grnFull.rows[0], req.user.name);

      return { status: 'approved' };
    });
    res.json({ data: result });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

module.exports = router;
