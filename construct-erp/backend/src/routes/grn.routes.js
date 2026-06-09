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

// POST /grn (Multi-item inwarding)
router.post('/', async (req, res) => {
  try {
    const { 
      project_id, po_id, vendor_id, grn_date, 
      vehicle_number, driver_name, challan_number, invoice_number, 
      site_location, gate_pass_no, wb_slip_no, remarks, items 
    } = req.body;

    if (!project_id || !items?.length) {
      return res.status(400).json({ error: 'Missing required project or items.' });
    }
    if (!userCanAccessProject(req, project_id)) {
      return res.status(403).json({ error: 'You do not have access to this project.' });
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
          site_location, gate_pass_no, wb_slip_no, remarks, 
          quality_status, received_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'pending', $14) RETURNING *`,
        [project_id, po_id, vendor_id, grn_number, grn_date, vehicle_number, driver_name, challan_number, invoice_number, site_location, gate_pass_no, wb_slip_no, remarks, req.user.id]
      );
      const grnId = headerRes.rows[0].id;

      // 3. Insert Items
      let totalQty = 0;
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        // Thumb rule: if stores counted in a different unit, auto-convert to PO unit
        const hasThumbRule = it.physical_qty && it.physical_unit && it.conversion_factor && it.conversion_factor !== 1;
        const qtyInPoUnit = hasThumbRule
          ? parseFloat(it.physical_qty) * parseFloat(it.conversion_factor)
          : parseFloat(it.quantity_received);

        await client.query(
          `INSERT INTO grn_items (
            grn_id, material_name, quantity_received, unit, rate,
            physical_qty, physical_unit, conversion_factor,
            po_item_id, quality_remarks, batch_number, expiry_date, sort_order
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
          [
            grnId, it.material_name || null,
            qtyInPoUnit, it.unit,
            it.rate ? parseFloat(it.rate) : 0,
            it.physical_qty  || null,
            it.physical_unit || null,
            it.conversion_factor ? parseFloat(it.conversion_factor) : 1,
            it.po_item_id || null,
            it.quality_remarks || null,
            it.batch_number || null,
            it.expiry_date  || null,
            i + 1
          ]
        );
        totalQty += qtyInPoUnit;
      }

      // 4. Update Header with totals
      const projRes = await client.query('SELECT project_code FROM projects WHERE id = $1', [project_id]);
      const serial_no_formatted = `BCIM-${projRes.rows[0].project_code || 'PRJ'}-GRN-${seq}`;
      
      const finalRes = await client.query(
        `UPDATE grn SET total_quantity = $1, serial_no_formatted = $2 WHERE id = $3 RETURNING *`,
        [totalQty, serial_no_formatted, grnId]
      );

      return finalRes.rows[0];
    });

    // Fire-and-forget push notification to stores team
    notifyGrnSubmitted(req.user.company_id, result);
    res.status(201).json({ data: result });
  } catch (err) {
    res.status(500).json({ error: err.message });
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
