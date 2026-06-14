// src/routes/invoice.routes.js — Vendor Billing (3-Way Match)
const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const { query, withTransaction } = require('../config/database');
const { runSchemaInit } = require('../utils/schemaInit');
const { postAutoJournal } = require('../services/journalAutoPost');
router.use(authenticate);

// Ensure invoice_items table exists (idempotent)
const ensureInvoiceItemsTable = async () => {
  await query(`CREATE TABLE IF NOT EXISTS invoice_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    invoice_id UUID REFERENCES invoices(id) ON DELETE CASCADE,
    material_name VARCHAR(200),
    unit VARCHAR(20),
    quantity_on_grn NUMERIC(12,3),
    quantity_invoiced NUMERIC(12,3) NOT NULL,
    rate_on_po NUMERIC(12,2),
    rate_invoiced NUMERIC(12,2) NOT NULL,
    tax_percent NUMERIC(5,2) DEFAULT 18,
    tax_amount NUMERIC(15,2) DEFAULT 0,
    net_amount NUMERIC(15,2),
    sort_order INTEGER DEFAULT 1,
    -- Thumb rule audit trail
    physical_qty NUMERIC(14,3),
    physical_unit VARCHAR(30),
    conversion_factor NUMERIC(14,6) DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`);
  // Add thumb rule columns to existing tables
  const safe = async (sql) => { try { await query(sql); } catch(_) {} };
  await safe(`ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS physical_qty NUMERIC(14,3)`);
  await safe(`ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS physical_unit VARCHAR(30)`);
  await safe(`ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS conversion_factor NUMERIC(14,6) DEFAULT 1`);
};
runSchemaInit('invoice_items', ensureInvoiceItemsTable);

// GET /invoices — List with vendor & project data
router.get('/', async (req, res) => {
  try {
    const { project_id, vendor_id, status } = req.query;
    let sql = `
      SELECT i.*, p.name as project_name, v.name as vendor_name,
             u.name as verified_by_name, a.name as authorized_by_name
      FROM invoices i
      JOIN projects p ON i.project_id = p.id
      JOIN vendors v ON i.vendor_id = v.id
      LEFT JOIN users u ON i.verified_by = u.id
      LEFT JOIN users a ON i.authorized_by = a.id
      WHERE p.company_id = $1`;
    let params = [req.user.company_id]; let idx = 2;
    if (project_id) { sql += ` AND i.project_id = $${idx++}`; params.push(project_id); }
    if (vendor_id)  { sql += ` AND i.vendor_id = $${idx++}`;  params.push(vendor_id); }
    if (status)     { sql += ` AND i.status = $${idx++}`;     params.push(status); }
    sql += ` ORDER BY i.invoice_date DESC`;
    const r = await query(sql, params);
    res.json({ data: r.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /invoices/:id — Detail with items
router.get('/:id', async (req, res) => {
  try {
    const invRes = await query(
      `SELECT i.*, p.name as project_name, v.name as vendor_name, po.po_number, g.gr_number
       FROM invoices i
       JOIN projects p ON i.project_id = p.id
       JOIN vendors v ON i.vendor_id = v.id
       LEFT JOIN purchase_orders po ON i.po_id = po.id
       LEFT JOIN grn g ON i.grn_id = g.id
       WHERE i.id = $1`,
      [req.params.id]
    );
    if (!invRes.rows.length) return res.status(404).json({ error: 'Invoice not found' });
    
    const items = await query(
      `SELECT * FROM invoice_items WHERE invoice_id = $1 ORDER BY sort_order`,
      [req.params.id]
    );
    res.json({ data: { ...invRes.rows[0], items: items.rows } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /invoices — Book a new vendor bill (3-Way Match)
router.post('/', authorize('super_admin','admin','accountant'), async (req, res) => {
  try {
    const {
      project_id, vendor_id, po_id, grn_id,
      invoice_number, invoice_date, total_amount, tax_amount, net_amount,
      due_date, items, tax_details, remarks
    } = req.body;

    if (!project_id || !vendor_id || !invoice_number || !items?.length) {
      return res.status(400).json({ error: 'Missing required invoice data' });
    }

    const result = await withTransaction(async (client) => {
      // 1. Insert Header
      const inv = await client.query(
        `INSERT INTO invoices
           (project_id, vendor_id, po_id, grn_id, invoice_number, invoice_date,
            total_amount, tax_amount, net_amount, due_date, tax_details, status, remarks)
         VALUES ($1,$2,$3::uuid,$4::uuid,$5,$6,$7,$8,$9,$10,$11,'pending',$12) RETURNING *`,
        [project_id, vendor_id, po_id || null, grn_id || null, invoice_number, invoice_date,
         total_amount, tax_amount, net_amount, due_date, tax_details, remarks]
      );
      const invId = inv.rows[0].id;

      // 2. Insert Items & Perform Match Validation
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        
        await client.query(
          `INSERT INTO invoice_items
             (invoice_id, material_name, unit, quantity_on_grn, quantity_invoiced,
              rate_on_po, rate_invoiced, tax_percent, tax_amount, net_amount, sort_order,
              physical_qty, physical_unit, conversion_factor)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
          [invId, it.material_name, it.unit, it.quantity_on_grn, it.quantity_invoiced,
           it.rate_on_po, it.rate_invoiced, it.tax_percent, it.tax_amount, it.net_amount, i + 1,
           it.physical_qty || null, it.physical_unit || null,
           it.conversion_factor ? parseFloat(it.conversion_factor) : 1]
        );
      }
      return inv.rows[0];
    });

    res.status(201).json({ data: result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /invoices/:id/verify — Step 2: Audit Verification
router.patch('/:id/verify', authorize('super_admin','admin','accountant'), async (req, res) => {
  try {
    await query(
      `UPDATE invoices SET status = 'verified', verified_by = $1, updated_at = NOW() WHERE id = $2`,
      [req.user.id, req.params.id]
    );
    res.json({ message: 'Invoice verified by audit' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /invoices/:id/authorize — Step 3: Accounts Authorization
router.patch('/:id/authorize', authorize('super_admin','admin'), async (req, res) => {
  try {
    const result = await withTransaction(async (client) => {
      // Fetch invoice + vendor name before updating
      const { rows: [inv] } = await client.query(
        `SELECT i.*, v.name AS vendor_name, p.company_id
         FROM invoices i
         JOIN vendors v ON v.id = i.vendor_id
         JOIN projects p ON p.id = i.project_id
         WHERE i.id = $1`, [req.params.id]
      );
      if (!inv) throw new Error('Invoice not found');

      await client.query(
        `UPDATE invoices SET status = 'authorized', authorized_by = $1, updated_at = NOW() WHERE id = $2`,
        [req.user.id, req.params.id]
      );

      // Auto-post JV: Dr Material Cost + Dr Input GST, Cr Accounts Payable
      const net = parseFloat(inv.net_amount || 0);
      const tax = parseFloat(inv.tax_amount || 0);
      const total = parseFloat(inv.total_amount || 0);
      if (total > 0) {
        const lines = [
          { code: '5000', debit: net,   description: `Material — ${inv.invoice_number}` },
          { code: '2000', credit: total, description: `Payable to ${inv.vendor_name}` },
        ];
        if (tax > 0) lines.splice(1, 0, { code: '1300', debit: tax, description: 'Input GST / ITC' });
        await postAutoJournal(client, {
          companyId: inv.company_id,
          userId: req.user.id,
          entryDate: inv.invoice_date,
          reference: inv.invoice_number,
          narration: `Invoice booking — ${inv.vendor_name} (${inv.invoice_number})`,
          source: 'auto_invoice',
          lines,
        });
      }
      return inv;
    });
    res.json({ message: 'Invoice authorized for payment', data: result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /invoices/finance-summary — live KPI data for Finance Dashboard
router.get('/finance-summary', async (req, res) => {
  try {
    const cid = req.user.company_id;
    const now = new Date();
    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;

    const [kpis, tqsOut, recentPay] = await Promise.all([
      query(`
        SELECT
          COUNT(*)                                              FILTER (WHERE i.status = 'pending')    AS pending_count,
          COALESCE(SUM(i.total_amount) FILTER (WHERE i.status = 'pending'), 0)                        AS pending_amount,
          COUNT(*)                                              FILTER (WHERE i.status = 'authorized') AS authorized_count,
          COALESCE(SUM(i.total_amount) FILTER (WHERE i.status = 'authorized'), 0)                     AS authorized_amount,
          COUNT(*)                                              FILTER (WHERE i.status NOT IN ('paid','cancelled') AND i.due_date < NOW()) AS overdue_count,
          COALESCE(SUM(i.total_amount) FILTER (WHERE i.status NOT IN ('paid','cancelled') AND i.due_date < NOW()), 0) AS overdue_amount,
          COUNT(*)                                              FILTER (WHERE i.status = 'paid' AND i.updated_at >= $2) AS paid_this_month_count,
          COALESCE(SUM(i.total_amount) FILTER (WHERE i.status = 'paid' AND i.updated_at >= $2), 0)    AS paid_this_month
        FROM invoices i
        JOIN projects p ON p.id = i.project_id
        WHERE p.company_id = $1
      `, [cid, monthStart]),

      query(`
        SELECT COALESCE(SUM(b.total_amount), 0) AS tqs_outstanding
        FROM tqs_bills b
        WHERE b.company_id = $1
          AND b.workflow_status != 'paid'
          AND b.is_deleted = FALSE
      `, [cid]),

      query(`
        SELECT py.entity_name, py.amount, py.net_amount, py.payment_date,
               py.payment_mode, py.reference_number, p.name AS project_name
        FROM payments py
        JOIN projects p ON p.id = py.project_id
        WHERE p.company_id = $1
        ORDER BY py.payment_date DESC, py.created_at DESC
        LIMIT 6
      `, [cid]),
    ]);

    res.json({
      ...kpis.rows[0],
      tqs_outstanding: tqsOut.rows[0]?.tqs_outstanding || 0,
      recent_payments: recentPay.rows,
    });
  } catch (err) {
    console.error('[Finance Summary]', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
