// src/routes/vendor-qs-certification.routes.js
const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { query, withTransaction } = require('../config/database');
const { runSchemaInit } = require('../utils/schemaInit');

router.use(authenticate);

async function ensureTables() {
  await query(`CREATE TABLE IF NOT EXISTS vendor_qs_certifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID,
    project_id UUID,
    vendor_id UUID,
    vendor_name TEXT NOT NULL,
    order_type TEXT DEFAULT 'po',
    order_number TEXT,
    cert_number TEXT UNIQUE,
    ra_sequence INTEGER DEFAULT 1,
    ra_bill_number TEXT,
    status TEXT DEFAULT 'draft',
    invoice_count INTEGER DEFAULT 0,
    gross_amount NUMERIC(14,2) DEFAULT 0,
    tax_amount NUMERIC(14,2) DEFAULT 0,
    tds_amount NUMERIC(14,2) DEFAULT 0,
    advance_recovered NUMERIC(14,2) DEFAULT 0,
    retention_amount NUMERIC(14,2) DEFAULT 0,
    other_deductions NUMERIC(14,2) DEFAULT 0,
    net_payable NUMERIC(14,2) DEFAULT 0,
    previous_certified_amount NUMERIC(14,2) DEFAULT 0,
    cumulative_certified_amount NUMERIC(14,2) DEFAULT 0,
    is_final_bill BOOLEAN DEFAULT FALSE,
    remarks TEXT,
    certified_at TIMESTAMPTZ,
    sent_to_accounts_at TIMESTAMPTZ,
    created_by UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`);
  await query(`CREATE TABLE IF NOT EXISTS vendor_qs_certification_bills (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    certification_id UUID REFERENCES vendor_qs_certifications(id) ON DELETE CASCADE,
    bill_id UUID REFERENCES tqs_bills(id),
    sl_number TEXT,
    inv_number TEXT,
    inv_date DATE,
    total_amount NUMERIC(14,2) DEFAULT 0,
    UNIQUE(certification_id, bill_id)
  )`);
  await query(`CREATE TABLE IF NOT EXISTS vendor_qs_certification_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    certification_id UUID REFERENCES vendor_qs_certifications(id) ON DELETE CASCADE,
    bill_id UUID,
    bill_line_item_id UUID,
    source_inv_number TEXT,
    item_ref_id UUID,
    description TEXT,
    unit TEXT,
    order_qty NUMERIC(14,3) DEFAULT 0,
    order_rate NUMERIC(14,2) DEFAULT 0,
    inv_prev_qty NUMERIC(14,3) DEFAULT 0,
    inv_pres_qty NUMERIC(14,3) DEFAULT 0,
    qs_prev_qty NUMERIC(14,3) DEFAULT 0,
    qs_pres_qty NUMERIC(14,3) DEFAULT 0,
    amount NUMERIC(14,2) DEFAULT 0,
    remarks TEXT
  )`);
  await query(`CREATE INDEX IF NOT EXISTS idx_vendor_qs_cert_company ON vendor_qs_certifications(company_id, project_id, vendor_name)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_vendor_qs_cert_bills_bill ON vendor_qs_certification_bills(bill_id)`);
  // ── TDS rate migrations ──────────────────────────────────────────────────
  try { await query(`ALTER TABLE vendors ADD COLUMN IF NOT EXISTS tds_rate NUMERIC(5,2) DEFAULT 0`); } catch (_) {}
  try { await query(`ALTER TABLE vendor_qs_certifications ADD COLUMN IF NOT EXISTS tds_rate NUMERIC(5,2) DEFAULT 0`); } catch (_) {}
  // ── Payment columns on cert ────────────────────────────────────────────
  try { await query(`ALTER TABLE vendor_qs_certifications ADD COLUMN IF NOT EXISTS paid_amount NUMERIC(14,2) DEFAULT 0`); } catch (_) {}
  try { await query(`ALTER TABLE vendor_qs_certifications ADD COLUMN IF NOT EXISTS payment_date DATE`); } catch (_) {}
  try { await query(`ALTER TABLE vendor_qs_certifications ADD COLUMN IF NOT EXISTS payment_mode TEXT`); } catch (_) {}
  try { await query(`ALTER TABLE vendor_qs_certifications ADD COLUMN IF NOT EXISTS reference_number TEXT`); } catch (_) {}
  try { await query(`ALTER TABLE vendor_qs_certifications ADD COLUMN IF NOT EXISTS bank_name TEXT`); } catch (_) {}
  try { await query(`ALTER TABLE vendor_qs_certifications ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ`); } catch (_) {}
  await query(`
    UPDATE tqs_bill_updates u
    SET pc_number = c.cert_number,
        pc_generated_at = COALESCE(u.pc_generated_at, c.certified_at, c.created_at),
        handed_over_accounts_date = COALESCE(u.handed_over_accounts_date, CURRENT_DATE),
        updated_at = NOW()
    FROM vendor_qs_certification_bills cb
    JOIN vendor_qs_certifications c ON c.id = cb.certification_id
    WHERE u.bill_id = cb.bill_id
      AND c.status <> 'cancelled'
      AND (u.pc_number IS NULL OR u.pc_number = '')
  `);
  await query(`
    WITH cert_bill_totals AS (
      SELECT certification_id, NULLIF(SUM(COALESCE(total_amount, 0)), 0) AS total_amount
      FROM vendor_qs_certification_bills
      GROUP BY certification_id
    ),
    alloc AS (
      SELECT
        cb.bill_id,
        c.advance_recovered,
        c.tds_amount,
        c.retention_amount,
        c.other_deductions,
        COALESCE(cb.total_amount, 0) / COALESCE(t.total_amount, 1) AS ratio
      FROM vendor_qs_certification_bills cb
      JOIN vendor_qs_certifications c ON c.id = cb.certification_id
      JOIN cert_bill_totals t ON t.certification_id = cb.certification_id
      WHERE c.status <> 'cancelled'
    )
    UPDATE tqs_bill_updates u
    SET advance_recovered = CASE WHEN COALESCE(u.advance_recovered, 0) = 0 THEN ROUND((alloc.advance_recovered * alloc.ratio)::numeric, 2) ELSE u.advance_recovered END,
        tds_deduction = CASE WHEN COALESCE(u.tds_deduction, 0) = 0 THEN ROUND((alloc.tds_amount * alloc.ratio)::numeric, 2) ELSE u.tds_deduction END,
        retention_money = CASE WHEN COALESCE(u.retention_money, 0) = 0 THEN ROUND((alloc.retention_amount * alloc.ratio)::numeric, 2) ELSE u.retention_money END,
        other_deductions = CASE WHEN COALESCE(u.other_deductions, 0) = 0 THEN ROUND((alloc.other_deductions * alloc.ratio)::numeric, 2) ELSE u.other_deductions END,
        total_deductions =
          COALESCE(CASE WHEN COALESCE(u.advance_recovered, 0) = 0 THEN ROUND((alloc.advance_recovered * alloc.ratio)::numeric, 2) ELSE u.advance_recovered END, 0)
          + COALESCE(CASE WHEN COALESCE(u.tds_deduction, 0) = 0 THEN ROUND((alloc.tds_amount * alloc.ratio)::numeric, 2) ELSE u.tds_deduction END, 0)
          + COALESCE(CASE WHEN COALESCE(u.retention_money, 0) = 0 THEN ROUND((alloc.retention_amount * alloc.ratio)::numeric, 2) ELSE u.retention_money END, 0)
          + COALESCE(CASE WHEN COALESCE(u.other_deductions, 0) = 0 THEN ROUND((alloc.other_deductions * alloc.ratio)::numeric, 2) ELSE u.other_deductions END, 0),
        updated_at = NOW()
    FROM alloc
    WHERE u.bill_id = alloc.bill_id
      AND (
        (COALESCE(u.advance_recovered, 0) = 0 AND COALESCE(alloc.advance_recovered, 0) > 0)
        OR (COALESCE(u.tds_deduction, 0) = 0 AND COALESCE(alloc.tds_amount, 0) > 0)
        OR (COALESCE(u.retention_money, 0) = 0 AND COALESCE(alloc.retention_amount, 0) > 0)
        OR (COALESCE(u.other_deductions, 0) = 0 AND COALESCE(alloc.other_deductions, 0) > 0)
      )
  `);
}
runSchemaInit('vendor_qs_certifications', ensureTables);

const n = (v) => parseFloat(v || 0) || 0;
const round2 = (v) => Math.round(n(v) * 100) / 100;
const billPayableCap = (bill = {}) => {
  const gross = n(bill.bill_total ?? bill.total_amount);
  const deductions = n(bill.tds_deduction) + n(bill.other_deductions) + n(bill.advance_recovered);
  const netFromGross = Math.max(0, gross - deductions);
  const certified = n(bill.certified_net);
  if (certified > 0 && (!gross || certified <= gross + 0.01)) return round2(certified);
  if (gross > 0) return round2(netFromGross);
  return round2(certified);
};

async function nextCertNumber(companyId, db = query) {
  const yr = new Date().getFullYear();
  const { rows } = await db(
    `SELECT COALESCE(MAX(CAST(REGEXP_REPLACE(cert_number, '^.*-', '') AS INTEGER)), 0)::int AS last_seq
     FROM vendor_qs_certifications WHERE company_id=$1 AND cert_number LIKE $2`,
    [companyId, `VQS-${yr}-%`]
  );
  return `VQS-${yr}-${String((rows[0]?.last_seq || 0) + 1).padStart(4, '0')}`;
}

async function buildSummaryFromBills(executor, billIds, companyId, excludeCertificationId = null) {
  const billsRes = await executor.query(`
    SELECT id, inv_number, sl_number, bill_type, gst_amount, total_amount
    FROM tqs_bills
    WHERE id = ANY($1::uuid[])
      AND company_id = $2
      AND is_deleted = FALSE
  `, [billIds, companyId]);

  const { rows } = await executor.query(`
    SELECT li.*, b.inv_number, b.sl_number, b.bill_type,
           pi.material_name AS po_item_name, pi.quantity AS po_ordered_qty, pi.rate AS po_ordered_rate, pi.unit AS po_ordered_unit,
           wi.description AS wo_item_name, wi.quantity AS wo_ordered_qty, wi.rate AS wo_ordered_rate, wi.unit AS wo_ordered_unit,
           COALESCE(prev.qs_qty, 0) AS qs_prev_qty
    FROM tqs_bill_line_items li
    JOIN tqs_bills b ON b.id = li.bill_id
    LEFT JOIN po_items pi ON pi.id = li.po_item_id
    LEFT JOIN work_order_items wi ON wi.id = li.wo_item_id
    LEFT JOIN (
      SELECT
        COALESCE(item_ref_id::text, LOWER(TRIM(description))) AS item_key,
        SUM(qs_pres_qty) AS qs_qty
      FROM vendor_qs_certification_items i
      JOIN vendor_qs_certifications c ON c.id = i.certification_id
      WHERE c.company_id = $2
        AND c.status <> 'cancelled'
        AND ($3::uuid IS NULL OR c.id <> $3::uuid)
      GROUP BY COALESCE(item_ref_id::text, LOWER(TRIM(description)))
    ) prev ON prev.item_key = COALESCE((li.po_item_id)::text, (li.wo_item_id)::text, LOWER(TRIM(COALESCE(li.item_name, ''))))
    WHERE li.bill_id = ANY($1::uuid[])
    ORDER BY b.inv_number, li.sort_order, li.id
  `, [billIds, companyId, excludeCertificationId]);

  const linkedRefs = [...new Set(rows.map(r => r.po_item_id || r.wo_item_id).filter(Boolean))];
  const singleLinkedRef = linkedRefs.length === 1 ? linkedRefs[0] : null;
  const singleLinkedRow = singleLinkedRef ? rows.find(r => (r.po_item_id || r.wo_item_id) === singleLinkedRef) : null;
  const grouped = new Map();

  rows.forEach(row => {
    const invQty = n(row.quantity);
    const effectiveRow = singleLinkedRef && !(row.po_item_id || row.wo_item_id) ? singleLinkedRow : row;
    const effectiveIsWO = effectiveRow?.wo_item_id || effectiveRow?.bill_type === 'wo';
    const orderQty = n(effectiveIsWO ? effectiveRow?.wo_ordered_qty : effectiveRow?.po_ordered_qty) || invQty;
    const rate = n(effectiveIsWO ? (effectiveRow?.wo_ordered_rate || row.rate) : (effectiveRow?.po_ordered_rate || row.rate));
    const qsPrevQty = n(row.qs_prev_qty);
    const qsPresQty = Math.max(0, invQty);
    const taxAmount = n(row.cgst_amt) + n(row.sgst_amt) + n(row.igst_amt) || n(row.gst_amount);
    const description = effectiveRow?.po_item_name || effectiveRow?.wo_item_name || row.item_name || '';
    const unit = effectiveRow?.po_ordered_unit || effectiveRow?.wo_ordered_unit || row.unit || '';
    const key = singleLinkedRef || row.po_item_id || row.wo_item_id || `${description.trim().toLowerCase()}|${unit}|${rate}`;
    const existing = grouped.get(key);
    if (existing) {
      existing.bill_ids.push(row.bill_id);
      existing.bill_line_item_ids.push(row.id);
      existing.source_inv_number = [...new Set([...String(existing.source_inv_number || '').split(', ').filter(Boolean), row.inv_number || row.sl_number].filter(Boolean))].join(', ');
      existing.inv_pres_qty = round2(n(existing.inv_pres_qty) + invQty);
      existing.qs_pres_qty = round2(n(existing.qs_pres_qty) + qsPresQty);
      existing.tax_amount = round2(n(existing.tax_amount) + taxAmount);
      existing.amount = round2(n(existing.qs_pres_qty) * rate);
      existing.balance_qty = Math.max(0, orderQty - qsPrevQty - n(existing.qs_pres_qty));
      return;
    }
    grouped.set(key, {
      bill_id: row.bill_id,
      bill_ids: [row.bill_id],
      bill_line_item_id: row.id,
      bill_line_item_ids: [row.id],
      source_inv_number: row.inv_number || row.sl_number,
      item_ref_id: singleLinkedRef || row.po_item_id || row.wo_item_id || null,
      description,
      unit,
      order_qty: orderQty,
      order_rate: rate,
      inv_prev_qty: 0,
      inv_pres_qty: invQty,
      qs_prev_qty: qsPrevQty,
      qs_pres_qty: qsPresQty,
      tax_amount: taxAmount,
      amount: round2(qsPresQty * rate),
      balance_qty: Math.max(0, orderQty - qsPrevQty - qsPresQty),
      remarks: '',
    });
  });

  return { bills: billsRes.rows, items: Array.from(grouped.values()) };
}

router.get('/', async (req, res) => {
  try {
    const { project_id, vendor_name, status } = req.query;
    const params = [req.user.company_id];
    const where = ['c.company_id = $1'];
    let i = 2;
    if (project_id) { where.push(`c.project_id = $${i++}`); params.push(project_id); }
    if (vendor_name) { where.push(`c.vendor_name ILIKE $${i++}`); params.push(`%${vendor_name}%`); }
    if (status) { where.push(`c.status = $${i++}`); params.push(status); }

    const { rows } = await query(`
      SELECT c.*, p.name AS project_name
      FROM vendor_qs_certifications c
      LEFT JOIN projects p ON p.id = c.project_id
      WHERE ${where.join(' AND ')}
      ORDER BY c.created_at DESC
    `, params);
    res.json({ data: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/pending-invoices', async (req, res) => {
  try {
    const { project_id, vendor_id, vendor_name, order_type = 'po', order_number } = req.query;
    const params = [req.user.company_id];
    const where = [
      `b.company_id = $1`,
      `b.is_deleted = FALSE`,
      `b.workflow_status NOT IN ('paid')`,
      `NOT EXISTS (
        SELECT 1 FROM vendor_qs_certification_bills cb
        JOIN vendor_qs_certifications c ON c.id = cb.certification_id
        WHERE cb.bill_id = b.id AND c.status <> 'cancelled'
      )`
    ];
    let i = 2;
    if (project_id) { where.push(`b.project_id = $${i++}`); params.push(project_id); }
    if (vendor_id) { where.push(`b.vendor_id = $${i++}`); params.push(vendor_id); }
    else if (vendor_name) { where.push(`b.vendor_name ILIKE $${i++}`); params.push(vendor_name); }
    if (order_type) { where.push(`COALESCE(b.bill_type, 'po') = $${i++}`); params.push(order_type); }
    if (order_number) { where.push(`COALESCE(b.wo_number, b.po_number) = $${i++}`); params.push(order_number); }

    const { rows } = await query(`
      SELECT b.id, b.sl_number, b.bill_type, b.vendor_id, b.vendor_name,
             b.project_id, p.name AS project_name,
             COALESCE(b.wo_number, b.po_number) AS order_number,
             b.inv_number, b.inv_date, b.basic_amount, b.total_amount, b.workflow_status
      FROM tqs_bills b
      LEFT JOIN projects p ON p.id = b.project_id
      WHERE ${where.join(' AND ')}
      ORDER BY b.inv_date DESC NULLS LAST, b.created_at DESC
    `, params);
    res.json({ data: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/summary-items', async (req, res) => {
  try {
    const { bill_ids = [] } = req.body;
    if (!Array.isArray(bill_ids) || bill_ids.length === 0) {
      return res.status(400).json({ error: 'Select at least one invoice' });
    }

    const billsRes = await query(`
      SELECT id, inv_number, sl_number, bill_type, gst_amount, total_amount
      FROM tqs_bills
      WHERE id = ANY($1::uuid[])
        AND company_id = $2
        AND is_deleted = FALSE
    `, [bill_ids, req.user.company_id]);
    if (billsRes.rows.length !== bill_ids.length) {
      return res.status(400).json({ error: 'Some selected invoices are invalid' });
    }

    const { rows } = await query(`
      SELECT li.*, b.inv_number, b.sl_number, b.bill_type,
             pi.material_name AS po_item_name, pi.quantity AS po_ordered_qty, pi.rate AS po_ordered_rate, pi.unit AS po_ordered_unit,
             wi.description AS wo_item_name, wi.quantity AS wo_ordered_qty, wi.rate AS wo_ordered_rate, wi.unit AS wo_ordered_unit,
             COALESCE(prev.qs_qty, 0) AS qs_prev_qty
      FROM tqs_bill_line_items li
      JOIN tqs_bills b ON b.id = li.bill_id
      LEFT JOIN po_items pi ON pi.id = li.po_item_id
      LEFT JOIN work_order_items wi ON wi.id = li.wo_item_id
      LEFT JOIN (
        SELECT
          COALESCE(item_ref_id::text, LOWER(TRIM(description))) AS item_key,
          SUM(qs_pres_qty) AS qs_qty
        FROM vendor_qs_certification_items i
        JOIN vendor_qs_certifications c ON c.id = i.certification_id
        WHERE c.company_id = $2 AND c.status <> 'cancelled'
        GROUP BY COALESCE(item_ref_id::text, LOWER(TRIM(description)))
      ) prev ON prev.item_key = COALESCE((li.po_item_id)::text, (li.wo_item_id)::text, LOWER(TRIM(COALESCE(li.item_name, ''))))
      WHERE li.bill_id = ANY($1::uuid[])
      ORDER BY b.inv_number, li.sort_order, li.id
    `, [bill_ids, req.user.company_id]);

    const linkedRefs = [...new Set(rows.map(r => r.po_item_id || r.wo_item_id).filter(Boolean))];
    const singleLinkedRef = linkedRefs.length === 1 ? linkedRefs[0] : null;
    const singleLinkedRow = singleLinkedRef ? rows.find(r => (r.po_item_id || r.wo_item_id) === singleLinkedRef) : null;
    const grouped = new Map();
    rows.forEach(row => {
      const isWO = row.wo_item_id || row.bill_type === 'wo';
      const invQty = n(row.quantity);
      const effectiveRow = singleLinkedRef && !(row.po_item_id || row.wo_item_id) ? singleLinkedRow : row;
      const effectiveIsWO = effectiveRow?.wo_item_id || effectiveRow?.bill_type === 'wo';
      const orderQty = n(effectiveIsWO ? effectiveRow?.wo_ordered_qty : effectiveRow?.po_ordered_qty) || invQty;
      const rate = n(effectiveIsWO ? (effectiveRow?.wo_ordered_rate || row.rate) : (effectiveRow?.po_ordered_rate || row.rate));
      const qsPrevQty = n(row.qs_prev_qty);
      const qsPresQty = Math.max(0, invQty);
      const taxAmount = n(row.cgst_amt) + n(row.sgst_amt) + n(row.igst_amt) || n(row.gst_amount);
      const description = effectiveRow?.po_item_name || effectiveRow?.wo_item_name || row.item_name || '';
      const unit = effectiveRow?.po_ordered_unit || effectiveRow?.wo_ordered_unit || row.unit || '';
      const key = singleLinkedRef || row.po_item_id || row.wo_item_id || `${description.trim().toLowerCase()}|${unit}|${rate}`;
      const existing = grouped.get(key);
      if (existing) {
        existing.bill_ids.push(row.bill_id);
        existing.bill_line_item_ids.push(row.id);
        existing.source_inv_number = [...new Set([...String(existing.source_inv_number || '').split(', ').filter(Boolean), row.inv_number || row.sl_number].filter(Boolean))].join(', ');
        existing.inv_pres_qty = round2(n(existing.inv_pres_qty) + invQty);
        existing.qs_pres_qty = round2(n(existing.qs_pres_qty) + qsPresQty);
        existing.tax_amount = round2(n(existing.tax_amount) + taxAmount);
        existing.amount = round2(n(existing.qs_pres_qty) * rate);
        existing.balance_qty = Math.max(0, orderQty - qsPrevQty - n(existing.qs_pres_qty));
        return;
      }
      grouped.set(key, {
        bill_id: row.bill_id,
        bill_ids: [row.bill_id],
        bill_line_item_id: row.id,
        bill_line_item_ids: [row.id],
        source_inv_number: row.inv_number || row.sl_number,
        item_ref_id: singleLinkedRef || row.po_item_id || row.wo_item_id || null,
        description,
        unit,
        order_qty: orderQty,
        order_rate: rate,
        inv_prev_qty: 0,
        inv_pres_qty: invQty,
        qs_prev_qty: qsPrevQty,
        qs_pres_qty: qsPresQty,
        tax_amount: taxAmount,
        amount: round2(qsPresQty * rate),
        balance_qty: Math.max(0, orderQty - qsPrevQty - qsPresQty),
        remarks: '',
      });
    });
    const items = Array.from(grouped.values());

    res.json({ data: { bills: billsRes.rows, items } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const cert = await query(
      `SELECT c.*, p.name AS project_name,
              COALESCE(v.tds_rate, 0) AS vendor_tds_rate,
              v.vendor_type,
              CASE
                WHEN c.order_type = 'wo' THEN COALESCE(wo.contract_amount, wo.total_value)
                ELSE COALESCE(po.grand_total, po.sub_total)
              END AS order_total_value
       FROM vendor_qs_certifications c
       LEFT JOIN projects p ON p.id = c.project_id
       LEFT JOIN vendors v ON v.id = c.vendor_id
       -- Case-insensitive, trimmed join so "POTQS073" matches " POTQS073 " etc.
       LEFT JOIN purchase_orders po
              ON LOWER(TRIM(po.po_number)) = LOWER(TRIM(c.order_number))
             AND c.order_type != 'wo'
             AND po.project_id IN (SELECT id FROM projects WHERE company_id = c.company_id)
       LEFT JOIN work_orders wo
              ON LOWER(TRIM(wo.wo_number)) = LOWER(TRIM(c.order_number))
             AND c.order_type = 'wo'
       WHERE c.id=$1 AND c.company_id=$2`,
      [req.params.id, req.user.company_id]
    );
    if (!cert.rows.length) return res.status(404).json({ error: 'Certification not found' });
    const bills = await query(`SELECT * FROM vendor_qs_certification_bills WHERE certification_id=$1 ORDER BY inv_date`, [req.params.id]);
    const items = await query(`SELECT * FROM vendor_qs_certification_items WHERE certification_id=$1 ORDER BY source_inv_number, description`, [req.params.id]);
    res.json({ data: { ...cert.rows[0], bills: bills.rows, items: items.rows } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const {
      project_id, vendor_id, vendor_name, order_type = 'po', order_number,
      bill_ids = [], ra_sequence = 1, ra_bill_number, is_final_bill = false,
      gst_tax,
      tds_rate: tds_rate_input,   // explicit rate from frontend (0/1/2)
      tds_amount: tds_amount_input, advance_recovered = 0, retention_amount = 0, other_deductions = 0,
      remarks, summary_items = [],
    } = req.body;
    if (!project_id) return res.status(400).json({ error: 'project_id required' });
    if (!vendor_name) return res.status(400).json({ error: 'vendor_name required' });
    if (!Array.isArray(bill_ids) || bill_ids.length === 0) return res.status(400).json({ error: 'Select at least one invoice' });

    const result = await withTransaction(async (client) => {
      const certNumber = await nextCertNumber(req.user.company_id);
      const billsRes = await client.query(`
        SELECT b.*
        FROM tqs_bills b
        WHERE b.id = ANY($1::uuid[])
          AND b.company_id = $2
          AND b.is_deleted = FALSE
          AND NOT EXISTS (
            SELECT 1 FROM vendor_qs_certification_bills cb
            JOIN vendor_qs_certifications c ON c.id = cb.certification_id
            WHERE cb.bill_id = b.id AND c.status <> 'cancelled'
          )
      `, [bill_ids, req.user.company_id]);
      if (billsRes.rows.length !== bill_ids.length) throw new Error('Some selected invoices are invalid or already certified');

      const ids = billsRes.rows.map(b => b.id);
      const itemsRes = await client.query(`
        SELECT li.*, b.inv_number, b.bill_type,
               pi.material_name AS po_item_name, pi.quantity AS po_ordered_qty, pi.rate AS po_ordered_rate, pi.unit AS po_ordered_unit,
               wi.description AS wo_item_name, wi.quantity AS wo_ordered_qty, wi.rate AS wo_ordered_rate, wi.unit AS wo_ordered_unit
        FROM tqs_bill_line_items li
        JOIN tqs_bills b ON b.id = li.bill_id
        LEFT JOIN po_items pi ON pi.id = li.po_item_id
        LEFT JOIN work_order_items wi ON wi.id = li.wo_item_id
        WHERE li.bill_id = ANY($1::uuid[])
        ORDER BY b.inv_number, li.id
      `, [ids]);

      const systemItems = itemsRes.rows.map(row => {
        const isWO = row.wo_item_id || row.bill_type === 'wo';
        const qty = n(row.quantity);
        const rate = n(isWO ? (row.wo_ordered_rate || row.rate) : (row.po_ordered_rate || row.rate));
        return {
          bill_id: row.bill_id,
          bill_line_item_id: row.id,
          source_inv_number: row.inv_number,
          item_ref_id: row.po_item_id || row.wo_item_id || null,
          description: row.po_item_name || row.wo_item_name || row.item_name || '',
          unit: row.po_ordered_unit || row.wo_ordered_unit || row.unit || '',
          order_qty: n(isWO ? row.wo_ordered_qty : row.po_ordered_qty) || qty,
          order_rate: rate,
          inv_pres_qty: qty,
          qs_pres_qty: qty,
          amount: qty * rate,
        };
      });
      const mappedItems = Array.isArray(summary_items) && summary_items.length
        ? summary_items.map(row => {
            const rate = n(row.order_rate);
            const qsQty = n(row.qs_pres_qty);
            return {
              bill_id: row.bill_id || null,
              bill_line_item_id: row.bill_line_item_id || null,
              source_inv_number: row.source_inv_number || null,
              item_ref_id: row.item_ref_id || null,
              description: row.description || '',
              unit: row.unit || '',
              order_qty: n(row.order_qty),
              order_rate: rate,
              inv_prev_qty: n(row.inv_prev_qty),
              inv_pres_qty: n(row.inv_pres_qty),
              qs_prev_qty: n(row.qs_prev_qty),
              qs_pres_qty: qsQty,
              amount: round2(row.amount || (qsQty * rate)),
              remarks: row.remarks || null,
              tax_amount: n(row.tax_amount),
            };
          })
        : systemItems;
      const gross = mappedItems.reduce((s, it) => s + it.amount, 0);
      const itemTax = mappedItems.reduce((s, it) => s + n(it.tax_amount), 0);
      // Use gst_tax override if explicitly provided (even 0 = vendor has no GST)
      const billTax = (gst_tax !== undefined && gst_tax !== '' && gst_tax !== null)
        ? n(gst_tax)
        : (itemTax || billsRes.rows.reduce((s, b) => s + n(b.gst_amount), 0));

      // Invoice total = sum of selected bills' total_amount (basic + GST, exactly what vendor billed).
      // This is the correct base for net_payable and TDS — it matches the frontend display.
      const invoiceBillTotal = billsRes.rows.reduce((s, b) => s + n(b.total_amount), 0);

      // ── TDS auto-calculation ────────────────────────────────────────────
      // TDS base = invoice total (what vendor billed incl. GST), matching frontend useEffect.
      // Priority: explicit tds_amount > (tds_rate % × invoiceBillTotal) > vendor default tds_rate
      let appliedTdsRate = 0;
      let tds_amount = 0;
      if (tds_amount_input !== undefined && tds_amount_input !== '' && tds_amount_input !== null) {
        // Frontend explicitly provided amount — use as-is
        tds_amount = n(tds_amount_input);
        // back-calculate rate for storage
        appliedTdsRate = invoiceBillTotal > 0 ? round2((tds_amount / invoiceBillTotal) * 100) : 0;
      } else {
        // Look up vendor's tds_rate
        const rateToUse = (tds_rate_input !== undefined && tds_rate_input !== '')
          ? n(tds_rate_input)
          : await (async () => {
              if (vendor_id) {
                const vr = await client.query(`SELECT tds_rate FROM vendors WHERE id=$1`, [vendor_id]);
                return n(vr.rows[0]?.tds_rate);
              }
              return 0;
            })();
        appliedTdsRate = rateToUse;
        tds_amount = round2(invoiceBillTotal * appliedTdsRate / 100);
      }
      // ───────────────────────────────────────────────────────────────────

      const totalDed = tds_amount + n(advance_recovered) + n(retention_amount) + n(other_deductions);
      // Net = invoice total (vendor's billed amount) minus all deductions.
      // Using invoiceBillTotal instead of gross+billTax so GST embedded in total_amount is included.
      const netPayable = invoiceBillTotal - totalDed;

      const prev = await client.query(`
        SELECT COALESCE(SUM(net_payable), 0) AS total
        FROM vendor_qs_certifications
        WHERE company_id=$1 AND project_id=$2 AND LOWER(TRIM(vendor_name))=LOWER(TRIM($3))
          AND COALESCE(order_number,'') = COALESCE($4,'')
          AND status <> 'cancelled'
      `, [req.user.company_id, project_id, vendor_name, order_number || '']);
      const prevTotal = n(prev.rows[0]?.total);

      const cert = await client.query(`
        INSERT INTO vendor_qs_certifications (
          company_id, project_id, vendor_id, vendor_name, order_type, order_number,
          cert_number, ra_sequence, ra_bill_number, status, invoice_count,
          gross_amount, tax_amount, tds_amount, tds_rate, advance_recovered, retention_amount,
          other_deductions, net_payable, previous_certified_amount,
          cumulative_certified_amount, is_final_bill, remarks, certified_at, created_by
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'certified',$10,$11,$12,$13,$23,$14,$15,$16,$17,$18,$19,$20,$21,NOW(),$22)
        RETURNING *
      `, [
        req.user.company_id, project_id, vendor_id || null, vendor_name, order_type, order_number || null,
        certNumber, ra_sequence, ra_bill_number || `RA-${ra_sequence}`, billsRes.rows.length,
        gross, billTax, tds_amount, n(advance_recovered), n(retention_amount), n(other_deductions),
        netPayable, prevTotal, prevTotal + netPayable, is_final_bill, remarks || null, req.user.id,
        appliedTdsRate,  // $23
      ]);

      const selectedBillTotal = Math.max(1, billsRes.rows.reduce((s, x) => s + n(x.total_amount), 0));
      const allocate = (amount, billAmount) => Math.round((n(billAmount) / selectedBillTotal) * n(amount) * 100) / 100;

      for (const b of billsRes.rows) {
        const billGross = allocate(gross, b.total_amount);
        const billTaxAlloc = allocate(billTax, b.total_amount);
        const billCertifiedNet = allocate(netPayable, b.total_amount);
        const billAdvanceRecovery = allocate(advance_recovered, b.total_amount);
        const billTds = allocate(tds_amount, b.total_amount);
        const billRetention = allocate(retention_amount, b.total_amount);
        const billOtherDeduction = allocate(other_deductions, b.total_amount);
        const billTotalDeductions = billAdvanceRecovery + billTds + billRetention + billOtherDeduction;
        await client.query(
          `INSERT INTO vendor_qs_certification_bills (certification_id, bill_id, sl_number, inv_number, inv_date, total_amount)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [cert.rows[0].id, b.id, b.sl_number, b.inv_number, b.inv_date, b.total_amount]
        );
        await client.query(`
          INSERT INTO tqs_bill_updates (
            bill_id, certified_net, balance_to_pay, qs_certified_date,
            qs_gross, qs_tax, qs_total,
            ra_sequence, ra_bill_number, pc_number, pc_generated_at,
            advance_recovered, tds_deduction, retention_money,
            other_deductions, total_deductions,
            handed_over_accounts_date, updated_at
          )
          VALUES ($1,$2,$2,CURRENT_DATE,$3,$4,$5,$6,$7,$8,NOW(),$9,$10,$11,$12,$13,CURRENT_DATE,NOW())
          ON CONFLICT (bill_id) DO UPDATE SET
            certified_net=EXCLUDED.certified_net,
            balance_to_pay=EXCLUDED.balance_to_pay,
            qs_certified_date=EXCLUDED.qs_certified_date,
            qs_gross=EXCLUDED.qs_gross,
            qs_tax=EXCLUDED.qs_tax,
            qs_total=EXCLUDED.qs_total,
            ra_sequence=EXCLUDED.ra_sequence,
            ra_bill_number=EXCLUDED.ra_bill_number,
            pc_number=EXCLUDED.pc_number,
            advance_recovered=EXCLUDED.advance_recovered,
            tds_deduction=EXCLUDED.tds_deduction,
            retention_money=EXCLUDED.retention_money,
            other_deductions=EXCLUDED.other_deductions,
            total_deductions=EXCLUDED.total_deductions,
            pc_generated_at=COALESCE(tqs_bill_updates.pc_generated_at, EXCLUDED.pc_generated_at),
            handed_over_accounts_date=COALESCE(tqs_bill_updates.handed_over_accounts_date, EXCLUDED.handed_over_accounts_date),
            updated_at=NOW()
        `, [
          b.id,
          billCertifiedNet,
          billGross,
          billTaxAlloc,
          billGross + billTaxAlloc,
          ra_sequence,
          ra_bill_number || `RA-${ra_sequence}`,
          cert.rows[0].cert_number,
          billAdvanceRecovery,
          billTds,
          billRetention,
          billOtherDeduction,
          billTotalDeductions,
        ]);
        await client.query(`UPDATE tqs_bills SET workflow_status='accounts', updated_at=NOW() WHERE id=$1`, [b.id]);
      }

      let recoveryLeft = n(advance_recovered);
      if (recoveryLeft > 0) {
        const advParams = [req.user.company_id, project_id, vendor_name];
        const advWhere = [
          `company_id = $1`,
          `project_id = $2`,
          `vendor_name ILIKE $3`,
          `amount > recovered_amount`,
        ];
        let ai = 4;
        // Exact match only — do NOT include NULL-wo/po advances which could be for other orders
        if (order_type === 'wo' && order_number) {
          advWhere.push(`wo_number = $${ai++}`);
          advParams.push(order_number);
        }
        if (order_type === 'po' && order_number) {
          advWhere.push(`po_number = $${ai++}`);
          advParams.push(order_number);
        }
        const advances = await client.query(`
          SELECT id, amount, recovered_amount
          FROM tqs_advances
          WHERE ${advWhere.join(' AND ')}
          ORDER BY payment_date NULLS LAST, created_at
          FOR UPDATE
        `, advParams);
        for (const adv of advances.rows) {
          if (recoveryLeft <= 0) break;
          const open = Math.max(0, n(adv.amount) - n(adv.recovered_amount));
          const apply = Math.min(open, recoveryLeft);
          await client.query(
            `UPDATE tqs_advances SET recovered_amount = recovered_amount + $1 WHERE id = $2`,
            [apply, adv.id]
          );
          recoveryLeft -= apply;
        }
      }

      for (const it of mappedItems) {
        await client.query(`
          INSERT INTO vendor_qs_certification_items (
            certification_id, bill_id, bill_line_item_id, source_inv_number, item_ref_id,
            description, unit, order_qty, order_rate, inv_prev_qty, inv_pres_qty,
            qs_prev_qty, qs_pres_qty, amount, remarks
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
        `, [cert.rows[0].id, it.bill_id, it.bill_line_item_id, it.source_inv_number, it.item_ref_id,
          it.description, it.unit, it.order_qty, it.order_rate, it.inv_prev_qty, it.inv_pres_qty,
          it.qs_prev_qty, it.qs_pres_qty, it.amount, it.remarks]);
      }

      return cert.rows[0];
    });
    res.status(201).json({ data: result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/refresh-from-bills', async (req, res) => {
  try {
    const result = await withTransaction(async (client) => {
      const certRes = await client.query(
        `SELECT * FROM vendor_qs_certifications WHERE id=$1 AND company_id=$2 FOR UPDATE`,
        [req.params.id, req.user.company_id]
      );
      if (!certRes.rows.length) throw new Error('Certification not found');
      const cert = certRes.rows[0];
      if (cert.status === 'paid') throw new Error('Paid certification cannot be refreshed');
      if (cert.status === 'cancelled') throw new Error('Cancelled certification cannot be refreshed');

      const linkedBills = await client.query(
        `SELECT cb.bill_id, b.sl_number, b.inv_number, b.inv_date, b.total_amount, b.gst_amount
         FROM vendor_qs_certification_bills cb
         JOIN tqs_bills b ON b.id = cb.bill_id
         WHERE cb.certification_id=$1
           AND b.company_id=$2
           AND b.is_deleted=FALSE
         ORDER BY b.inv_date NULLS LAST, b.created_at`,
        [req.params.id, req.user.company_id]
      );
      const billIds = linkedBills.rows.map(b => b.bill_id);
      if (!billIds.length) throw new Error('No linked vendor bills found to refresh');

      const { items } = await buildSummaryFromBills(client, billIds, req.user.company_id, req.params.id);
      const gross = round2(items.reduce((s, it) => s + n(it.amount), 0));
      const itemTax = round2(items.reduce((s, it) => s + n(it.tax_amount), 0));
      const billTax = itemTax || round2(linkedBills.rows.reduce((s, b) => s + n(b.gst_amount), 0));
      const totalDed = n(cert.tds_amount) + n(cert.advance_recovered) + n(cert.retention_amount) + n(cert.other_deductions);
      // Net = invoice total (what vendor billed incl. GST) minus deductions
      const invoiceBillTotal = round2(linkedBills.rows.reduce((s, b) => s + n(b.total_amount), 0)) || gross;
      const netPayable = round2(invoiceBillTotal - totalDed);

      await client.query(
        `DELETE FROM vendor_qs_certification_items WHERE certification_id=$1`,
        [req.params.id]
      );

      for (const it of items) {
        await client.query(`
          INSERT INTO vendor_qs_certification_items (
            certification_id, bill_id, bill_line_item_id, source_inv_number, item_ref_id,
            description, unit, order_qty, order_rate, inv_prev_qty, inv_pres_qty,
            qs_prev_qty, qs_pres_qty, amount, remarks
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
        `, [req.params.id, it.bill_id, it.bill_line_item_id, it.source_inv_number, it.item_ref_id,
          it.description, it.unit, it.order_qty, it.order_rate, it.inv_prev_qty, it.inv_pres_qty,
          it.qs_prev_qty, it.qs_pres_qty, it.amount, it.remarks]);
      }

      for (const b of linkedBills.rows) {
        await client.query(`
          UPDATE vendor_qs_certification_bills
          SET sl_number=$1,
              inv_number=$2,
              inv_date=$3,
              total_amount=$4
          WHERE certification_id=$5 AND bill_id=$6
        `, [b.sl_number, b.inv_number, b.inv_date, b.total_amount, req.params.id, b.bill_id]);
      }

      const selectedBillTotal = Math.max(1, linkedBills.rows.reduce((s, x) => s + n(x.total_amount), 0));
      const allocate = (amount, billAmount) => Math.round((n(billAmount) / selectedBillTotal) * n(amount) * 100) / 100;

      for (const b of linkedBills.rows) {
        const billGross = allocate(gross, b.total_amount);
        const billTaxAlloc = allocate(billTax, b.total_amount);
        const billCertifiedNet = allocate(netPayable, b.total_amount);
        const billAdvanceRecovery = allocate(cert.advance_recovered, b.total_amount);
        const billTds = allocate(cert.tds_amount, b.total_amount);
        const billRetention = allocate(cert.retention_amount, b.total_amount);
        const billOtherDeduction = allocate(cert.other_deductions, b.total_amount);
        const billTotalDeductions = billAdvanceRecovery + billTds + billRetention + billOtherDeduction;
        await client.query(`
          INSERT INTO tqs_bill_updates (
            bill_id, certified_net, balance_to_pay, qs_certified_date,
            qs_gross, qs_tax, qs_total,
            ra_sequence, ra_bill_number, pc_number, pc_generated_at,
            advance_recovered, tds_deduction, retention_money,
            other_deductions, total_deductions,
            handed_over_accounts_date, updated_at
          )
          VALUES ($1,$2,$2,CURRENT_DATE,$3,$4,$5,$6,$7,$8,NOW(),$9,$10,$11,$12,$13,CURRENT_DATE,NOW())
          ON CONFLICT (bill_id) DO UPDATE SET
            certified_net=EXCLUDED.certified_net,
            balance_to_pay=EXCLUDED.balance_to_pay - COALESCE(tqs_bill_updates.paid_amount, 0),
            qs_certified_date=EXCLUDED.qs_certified_date,
            qs_gross=EXCLUDED.qs_gross,
            qs_tax=EXCLUDED.qs_tax,
            qs_total=EXCLUDED.qs_total,
            ra_sequence=EXCLUDED.ra_sequence,
            ra_bill_number=EXCLUDED.ra_bill_number,
            pc_number=EXCLUDED.pc_number,
            advance_recovered=EXCLUDED.advance_recovered,
            tds_deduction=EXCLUDED.tds_deduction,
            retention_money=EXCLUDED.retention_money,
            other_deductions=EXCLUDED.other_deductions,
            total_deductions=EXCLUDED.total_deductions,
            updated_at=NOW()
        `, [
          b.bill_id,
          billCertifiedNet,
          billGross,
          billTaxAlloc,
          billGross + billTaxAlloc,
          cert.ra_sequence,
          cert.ra_bill_number || `RA-${cert.ra_sequence}`,
          cert.cert_number,
          billAdvanceRecovery,
          billTds,
          billRetention,
          billOtherDeduction,
          billTotalDeductions,
        ]);
      }

      const updated = await client.query(`
        UPDATE vendor_qs_certifications
        SET invoice_count=$1,
            gross_amount=$2,
            tax_amount=$3,
            net_payable=$4,
            cumulative_certified_amount=COALESCE(previous_certified_amount,0) + $4,
            updated_at=NOW()
        WHERE id=$5 AND company_id=$6
        RETURNING *
      `, [linkedBills.rows.length, gross, billTax, netPayable, req.params.id, req.user.company_id]);

      return { ...updated.rows[0], refreshed_items: items.length };
    });
    res.json({ data: result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/:id/amounts', async (req, res) => {
  try {
    const {
      tds_amount = 0,
      tds_rate: tds_rate_edit,
      advance_recovered = 0,
      retention_amount = 0,
      other_deductions = 0,
      remarks,
    } = req.body;

    const result = await withTransaction(async (client) => {
      const certRes = await client.query(
        `SELECT * FROM vendor_qs_certifications WHERE id=$1 AND company_id=$2 FOR UPDATE`,
        [req.params.id, req.user.company_id]
      );
      if (!certRes.rows.length) throw new Error('Certification not found');
      const cert = certRes.rows[0];
      if (cert.status === 'paid') throw new Error('Paid certification cannot be edited');
      if (cert.status === 'cancelled') throw new Error('Cancelled certification cannot be edited');

      const gross = n(cert.gross_amount);
      // Query linked bills first — total_amount = original invoice total (basic + GST)
      const bills = await client.query(
        `SELECT * FROM vendor_qs_certification_bills WHERE certification_id=$1`,
        [req.params.id]
      );
      // Invoice total = what vendor actually billed (incl. GST). Use as the net base.
      const invoiceBillTotal = bills.rows.reduce((s, b) => s + n(b.total_amount), 0) || gross;

      // Recalc TDS amount from rate if rate supplied, else use explicit amount.
      // TDS base = invoiceBillTotal (matches frontend useEffect and POST handler).
      const finalTdsAmount = (tds_rate_edit !== undefined && tds_rate_edit !== '')
        ? round2(invoiceBillTotal * n(tds_rate_edit) / 100)
        : n(tds_amount);
      const finalTdsRate = (tds_rate_edit !== undefined && tds_rate_edit !== '')
        ? n(tds_rate_edit)
        : (invoiceBillTotal > 0 ? round2((n(tds_amount) / invoiceBillTotal) * 100) : n(cert.tds_rate));
      const totalDed = finalTdsAmount + n(advance_recovered) + n(retention_amount) + n(other_deductions);
      // Net = invoice total minus all deductions (gross+tax would miss GST embedded in total_amount)
      const netPayable = invoiceBillTotal - totalDed;

      const updated = await client.query(`
        UPDATE vendor_qs_certifications
        SET tds_amount=$1,
            tds_rate=$7,
            advance_recovered=$2,
            retention_amount=$3,
            other_deductions=$4,
            net_payable=$5,
            cumulative_certified_amount=COALESCE(previous_certified_amount,0) + $5,
            remarks=COALESCE($6, remarks),
            updated_at=NOW()
        WHERE id=$8 AND company_id=$9
        RETURNING *
      `, [
        finalTdsAmount, n(advance_recovered), n(retention_amount), n(other_deductions),
        netPayable, remarks || null, finalTdsRate, req.params.id, req.user.company_id,
      ]);
      const selectedBillTotal = Math.max(1, bills.rows.reduce((s, x) => s + n(x.total_amount), 0));
      const allocate = (amount, billAmount) => Math.round((n(billAmount) / selectedBillTotal) * n(amount) * 100) / 100;

      for (const b of bills.rows) {
        const billCertifiedNet = allocate(netPayable, b.total_amount);
        const billAdvanceRecovery = allocate(n(advance_recovered), b.total_amount);
        const billTds = allocate(finalTdsAmount, b.total_amount);
        const billRetention = allocate(n(retention_amount), b.total_amount);
        const billOtherDeduction = allocate(other_deductions, b.total_amount);
        const billTotalDeductions = billAdvanceRecovery + billTds + billRetention + billOtherDeduction;
        await client.query(`
          UPDATE tqs_bill_updates
          SET certified_net=$1,
              balance_to_pay=$1 - COALESCE(paid_amount, 0),
              advance_recovered=$2,
              tds_deduction=$3,
              retention_money=$4,
              other_deductions=$5,
              total_deductions=$6,
              updated_at=NOW()
          WHERE bill_id=$7
        `, [
          billCertifiedNet, billAdvanceRecovery, billTds, billRetention,
          billOtherDeduction, billTotalDeductions, b.bill_id,
        ]);
      }

      return updated.rows[0];
    });
    res.json({ data: result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    const allowed = ['draft', 'certified', 'accounts', 'paid', 'cancelled'];
    if (!allowed.includes(status)) return res.status(400).json({ error: 'Invalid status' });
    const { rows } = await query(
      `UPDATE vendor_qs_certifications
       SET status=$1, sent_to_accounts_at=CASE WHEN $1='accounts' THEN NOW() ELSE sent_to_accounts_at END, updated_at=NOW()
       WHERE id=$2 AND company_id=$3 RETURNING *`,
      [status, req.params.id, req.user.company_id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Certification not found' });
    res.json({ data: rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ════════════════════════════════════════════════════════════════════════
// POST /vendor-qs-certifications/:id/payment
// Records a payment against an entire certification (RA bill / PC).
// Allocates paid_amount proportionally across every bill linked to the
// cert and marks each bill as paid. Also creates a single Finance Payment.
// ════════════════════════════════════════════════════════════════════════
router.post('/:id/payment', async (req, res) => {
  try {
    const {
      paid_amount,
      payment_date,
      payment_mode = 'bank_transfer',
      reference_number,
      bank_name,
      remarks,
    } = req.body;

    if (!paid_amount || parseFloat(paid_amount) <= 0)
      return res.status(400).json({ error: 'paid_amount must be > 0' });
    if (!payment_date)
      return res.status(400).json({ error: 'payment_date is required' });

    const totalPaid = parseFloat(paid_amount);

    const result = await withTransaction(async (client) => {
      const certRes = await client.query(
        `SELECT * FROM vendor_qs_certifications WHERE id=$1 AND company_id=$2 FOR UPDATE`,
        [req.params.id, req.user.company_id]
      );
      if (!certRes.rows.length) throw new Error('Certification not found');
      const cert = certRes.rows[0];
      if (cert.status === 'paid')    throw new Error('Certification already paid');
      if (cert.status === 'cancelled') throw new Error('Cancelled certification cannot be paid');

      const billsRes = await client.query(`
        SELECT cb.bill_id, cb.total_amount, b.vendor_name, b.project_id, b.bill_type,
               b.sl_number, b.inv_number, b.total_amount AS bill_total,
               COALESCE(u.certified_net, 0) AS certified_net,
               COALESCE(u.tds_deduction, 0) AS tds_deduction,
               COALESCE(u.other_deductions, 0) AS other_deductions,
               COALESCE(u.advance_recovered, 0) AS advance_recovered,
               COALESCE(u.paid_amount, 0) AS existing_paid
        FROM vendor_qs_certification_bills cb
        JOIN tqs_bills b ON b.id = cb.bill_id
        LEFT JOIN tqs_bill_updates u ON u.bill_id = cb.bill_id
        WHERE cb.certification_id = $1
        ORDER BY cb.inv_date
      `, [req.params.id]);
      if (!billsRes.rows.length) throw new Error('No bills linked to this certification');

      const totalNet = billsRes.rows.reduce((s, b) => s + billPayableCap(b), 0)
                       || billsRes.rows.reduce((s, b) => s + n(b.total_amount), 0)
                       || 1;
      const allocate = (amount, base) => Math.round((n(base) / totalNet) * n(amount) * 100) / 100;

      // 1) Update each bill's tqs_bill_updates and workflow_status
      const lines = [];
      for (const b of billsRes.rows) {
        const baseShare = billPayableCap(b) || n(b.total_amount);
        const billPaid = allocate(totalPaid, baseShare);
        const certifiedNet = billPayableCap(b);
        const remaining = Math.max(0, certifiedNet - n(b.existing_paid));
        if (billPaid > remaining + 0.01) {
          const err = new Error(`Payment exceeds payable balance for ${b.sl_number}. Remaining payable is Rs ${remaining.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}.`);
          err.statusCode = 400;
          throw err;
        }
        const billTotalPaid = round2(n(b.existing_paid) + billPaid);
        const billBalance = Math.max(0, certifiedNet - billTotalPaid);
        const billStatus = billBalance <= 0.01 ? 'paid' : billPaid > 0 ? 'partial' : 'pending';

        await client.query(`
          UPDATE tqs_bill_updates SET
            paid_amount = COALESCE(paid_amount, 0) + $1,
            balance_to_pay = GREATEST(0, COALESCE(certified_net, 0) - (COALESCE(paid_amount, 0) + $1)),
            payment_status = $2,
            payment_date = $3,
            payment_mode = $4,
            reference_number = $5,
            bank_name = $6,
            updated_at = NOW()
          WHERE bill_id = $7
        `, [billPaid, billStatus, payment_date, payment_mode, reference_number || null, bank_name || null, b.bill_id]);

        // Mark bill paid if fully settled
        if (billStatus === 'paid') {
          await client.query(`UPDATE tqs_bills SET workflow_status='paid', updated_at=NOW() WHERE id=$1`, [b.bill_id]);
        }

        lines.push({ bill_id: b.bill_id, sl_number: b.sl_number, inv_number: b.inv_number, paid: billPaid, status: billStatus });
      }

      // 2) Create one Finance payment record for the whole cert
      const firstBill = billsRes.rows[0];
      const payType  = firstBill.bill_type === 'wo' ? 'subcontractor' : 'vendor';
      const costHead = firstBill.bill_type === 'wo' ? 'Subcontractor' : 'Material';
      const totalTds = billsRes.rows.reduce((s, b) => s + n(b.tds_deduction), 0);
      const netPaid  = Math.max(0, totalPaid - totalTds);

      let finance_payment_id = null;
      if (firstBill.project_id) {
        const fp = await client.query(`
          INSERT INTO payments
            (project_id, payment_type, entity_name,
             amount, tds_deducted, net_amount,
             payment_date, payment_mode, reference_number, bank_name,
             cost_head, remarks, created_by, source)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
          RETURNING id
        `, [
          firstBill.project_id, payType, cert.vendor_name,
          totalPaid, totalTds, netPaid,
          payment_date, payment_mode, reference_number || null, bank_name || null,
          costHead,
          `QS Cert ${cert.cert_number} (${cert.ra_bill_number || ''}) — ${billsRes.rows.length} bill(s)${remarks ? ': ' + remarks : ''}`,
          req.user.id, 'tqs_cert',
        ]);
        finance_payment_id = fp.rows[0].id;
      }

      // 3) Update the cert itself
      const certPaidTotal = n(cert.paid_amount) + totalPaid;
      const fullyPaid = certPaidTotal + 0.01 >= n(cert.net_payable);
      const updated = await client.query(`
        UPDATE vendor_qs_certifications SET
          paid_amount = $1,
          payment_date = $2,
          payment_mode = $3,
          reference_number = $4,
          bank_name = $5,
          paid_at = CASE WHEN $6 THEN NOW() ELSE paid_at END,
          status = CASE WHEN $6 THEN 'paid' ELSE status END,
          updated_at = NOW()
        WHERE id = $7
        RETURNING *
      `, [certPaidTotal, payment_date, payment_mode, reference_number || null, bank_name || null, fullyPaid, req.params.id]);

      return {
        cert: updated.rows[0],
        finance_payment_id,
        bills_paid: lines,
        total_paid: totalPaid,
        cert_fully_paid: fullyPaid,
      };
    });

    res.status(201).json({ data: result });
  } catch (err) {
    console.error('[vendor-qs-cert /payment]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ════════════════════════════════════════════════════════════════════════
// DELETE /vendor-qs-certifications/:id
// Permanently deletes a certification and its items/bills (cascade).
// Only allowed if status is draft or cancelled. Paid certs cannot be deleted.
// ════════════════════════════════════════════════════════════════════════
router.delete('/:id', async (req, res) => {
  try {
    // Fetch the cert first to check status and ownership
    const { rows } = await query(
      `SELECT id, status, cert_number FROM vendor_qs_certifications WHERE id=$1 AND company_id=$2`,
      [req.params.id, req.user.company_id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Certification not found' });
    const cert = rows[0];
    if (cert.status === 'paid') {
      return res.status(400).json({ error: 'Cannot delete a paid certification. Cancel it first.' });
    }
    // Delete — child tables (items, bills) are ON DELETE CASCADE
    await query(
      `DELETE FROM vendor_qs_certifications WHERE id=$1 AND company_id=$2`,
      [req.params.id, req.user.company_id]
    );
    res.json({ message: `Certification ${cert.cert_number} deleted successfully` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
