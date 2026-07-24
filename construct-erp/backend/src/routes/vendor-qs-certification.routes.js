// src/routes/vendor-qs-certification.routes.js
const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { query, withTransaction } = require('../config/database');
const { runSchemaInit } = require('../utils/schemaInit');
const { sendMail } = require('../services/mail.service');
const { resyncAdvancesFromBills, resyncTqsAdvancesForCompany } = require('./procurement-advance.routes');

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
  // ── Weighment / MSB / IGN / GRS cross-reference columns on items ────────
  // Weighment qty is a plain cross-check quantity (weighbridge slip), no
  // rate/amount. MSB/IGN/GRS are free-text reference numbers the QS
  // certifier types in against their own register — not linked records.
  try { await query(`ALTER TABLE vendor_qs_certification_items ADD COLUMN IF NOT EXISTS weighment_qty NUMERIC(14,3) DEFAULT 0`); } catch (_) {}
  try { await query(`ALTER TABLE vendor_qs_certification_items ADD COLUMN IF NOT EXISTS msb_ref TEXT`); } catch (_) {}
  try { await query(`ALTER TABLE vendor_qs_certification_items ADD COLUMN IF NOT EXISTS ign_ref TEXT`); } catch (_) {}
  try { await query(`ALTER TABLE vendor_qs_certification_items ADD COLUMN IF NOT EXISTS grs_ref TEXT`); } catch (_) {}
  try { await query(`ALTER TABLE vendor_qs_certifications ADD COLUMN IF NOT EXISTS reference_number TEXT`); } catch (_) {}
  try { await query(`ALTER TABLE vendor_qs_certifications ADD COLUMN IF NOT EXISTS bank_name TEXT`); } catch (_) {}
  try { await query(`ALTER TABLE vendor_qs_certifications ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ`); } catch (_) {}
  // ── Accounts-approval gate (only APPROVER_EMAIL may send a cert to Accounts) ──
  try { await query(`ALTER TABLE vendor_qs_certifications ADD COLUMN IF NOT EXISTS approved_by UUID`); } catch (_) {}
  try { await query(`ALTER TABLE vendor_qs_certifications ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ`); } catch (_) {}
  // ── Reject-back-to-QS (audit fields) ─────────────────────────────────────
  try { await query(`ALTER TABLE vendor_qs_certifications ADD COLUMN IF NOT EXISTS rejected_by UUID`); } catch (_) {}
  try { await query(`ALTER TABLE vendor_qs_certifications ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMPTZ`); } catch (_) {}
  try { await query(`ALTER TABLE vendor_qs_certifications ADD COLUMN IF NOT EXISTS rejection_remarks TEXT`); } catch (_) {}
  // ── QS Received/Certified dates now live on the certification itself ────
  // (moved off the Bill Tracker's per-bill QS tab, which no longer collects them)
  try { await query(`ALTER TABLE vendor_qs_certifications ADD COLUMN IF NOT EXISTS qs_received_date DATE`); } catch (_) {}
  try { await query(`ALTER TABLE vendor_qs_certifications ADD COLUMN IF NOT EXISTS qs_certified_date DATE`); } catch (_) {}
  // ── Credit note deduction — read-only, sourced from applied Credit Notes
  // (credit-notes.routes.js syncs credit_note_val onto tqs_bills when a note
  // is applied). Summed across the certification's selected bills.
  try { await query(`ALTER TABLE vendor_qs_certifications ADD COLUMN IF NOT EXISTS credit_note_amount NUMERIC(14,2) DEFAULT 0`); } catch (_) {}
  try { await query(`ALTER TABLE tqs_bill_updates ADD COLUMN IF NOT EXISTS credit_note_amt NUMERIC(14,2) DEFAULT 0`); } catch (_) {}
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
// Whole-rupee rounding for QS certification abstract/payment certificate
// amounts (line items, gross, tax, deductions, net payable) — standard
// rounding, not ceiling.
const round0 = (v) => Math.round(n(v));
const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
// Only this user may approve a certification and move it to the Accounts stage.
const CERT_APPROVER_EMAIL = 'prithivi@bcim.in';
// Notified (along with the approver) once a certification is approved and its
// Payment Certificate is ready.
const PAYMENT_CERT_NOTIFY_EMAILS = ['prithivi@bcim.in', 'jephins@bcim.in'];
const billPayableCap = (bill = {}) => {
  const gross = n(bill.bill_total ?? bill.total_amount);
  const deductions = n(bill.tds_deduction) + n(bill.other_deductions) + n(bill.advance_recovered);
  const netFromGross = Math.max(0, gross - deductions);
  const certified = n(bill.certified_net);
  if (certified > 0 && (!gross || certified <= gross + 0.01)) return round2(certified);
  if (gross > 0) return round2(netFromGross);
  return round2(certified);
};

// Resolves a PO item to its amendment-family "current" quantity/rate.
// POs like POTQS001, POTQS001-A1, POTQS001-A3, POTQS001-A4 each restate the
// FULL cumulative order to date for a given material, so the true ordered
// qty is whatever the LATEST amendment says — not the specific revision a
// historical bill happened to be linked against. Grouped by a leading grade
// token (M10/M25/M30/M35…) since the mix-design text differs per revision.
async function resolveGradeChain(executor, poItemId, cache) {
  if (cache.has(poItemId)) return cache.get(poItemId);
  const itemRes = await executor.query(`
    SELECT pi.id, pi.material_name, pi.quantity, pi.rate, pi.unit,
           po.po_number, po.po_date, po.project_id,
           pr.company_id
      FROM po_items pi
      JOIN purchase_orders po ON po.id = pi.po_id
      JOIN projects pr ON pr.id = po.project_id
     WHERE pi.id = $1`, [poItemId]);
  if (!itemRes.rows.length) { cache.set(poItemId, null); return null; }
  const item = itemRes.rows[0];
  const baseNumber = String(item.po_number || '').replace(/-A\d+$/i, '');
  const gradeMatch = String(item.material_name || '').match(/^([A-Za-z]+\s?\d+)/);
  const grade = gradeMatch ? gradeMatch[1].replace(/\s+/g, '').toUpperCase() : null;

  if (!grade || !baseNumber) {
    const result = {
      chainKey: `item:${poItemId}`,
      currentItemId: poItemId,
      currentQty: n(item.quantity), currentRate: n(item.rate), currentUnit: item.unit,
      chainItemIds: [poItemId],
    };
    cache.set(poItemId, result);
    return result;
  }

  const chainPOs = await executor.query(`
    SELECT id, po_number, po_date FROM purchase_orders
     WHERE project_id = $1
       AND (LOWER(po_number) = LOWER($2) OR LOWER(po_number) ~ ('^' || LOWER($2) || '-a[0-9]+$'))
     ORDER BY po_date DESC NULLS LAST, created_at DESC`,
    [item.project_id, baseNumber]);

  const chainItemIds = [];
  let current = null;
  for (const po of chainPOs.rows) {
    const its = await executor.query(
      `SELECT id, material_name, quantity, rate, unit FROM po_items WHERE po_id=$1`, [po.id]);
    for (const it of its.rows) {
      if (String(it.material_name || '').toUpperCase().startsWith(grade)) {
        chainItemIds.push(it.id);
        if (!current) current = it; // chainPOs sorted DESC by date → first hit is the latest
      }
    }
  }

  const result = chainItemIds.length
    ? {
        chainKey: `chain:${baseNumber.toUpperCase()}:${grade}`,
        currentItemId: current.id,
        currentQty: n(current.quantity), currentRate: n(current.rate), currentUnit: current.unit,
        chainItemIds,
      }
    : {
        chainKey: `item:${poItemId}`,
        currentItemId: poItemId,
        currentQty: n(item.quantity), currentRate: n(item.rate), currentUnit: item.unit,
        chainItemIds: [poItemId],
      };
  cache.set(poItemId, result);
  return result;
}

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
           wi.description AS wo_item_name, wi.quantity AS wo_ordered_qty, wi.rate AS wo_ordered_rate, wi.unit AS wo_ordered_unit
    FROM tqs_bill_line_items li
    JOIN tqs_bills b ON b.id = li.bill_id
    LEFT JOIN po_items pi ON pi.id = li.po_item_id
    LEFT JOIN work_order_items wi ON wi.id = li.wo_item_id
    WHERE li.bill_id = ANY($1::uuid[])
    ORDER BY b.inv_number, li.sort_order, li.id
  `, [billIds]);

  // Resolve the amendment chain for every distinct PO item referenced —
  // this is what lets order_qty/balance reflect the LATEST amendment's
  // total instead of whichever single revision a given bill was linked to.
  const chainCache = new Map();
  for (const row of rows) {
    if (row.po_item_id) await resolveGradeChain(executor, row.po_item_id, chainCache);
  }

  // Raw "already certified elsewhere" quantities, keyed by the bill line's
  // own item_ref_id (or description, for unlinked lines) — same source data
  // as before, just fetched separately so it can be re-aggregated by chain.
  const priorRes = await executor.query(`
    SELECT COALESCE(item_ref_id::text, LOWER(TRIM(description))) AS item_key,
           SUM(qs_pres_qty) AS qty
      FROM vendor_qs_certification_items i
      JOIN vendor_qs_certifications c ON c.id = i.certification_id
     WHERE c.company_id = $1
       AND c.status NOT IN ('cancelled', 'rejected')
       AND ($2::uuid IS NULL OR c.id <> $2::uuid)
     GROUP BY COALESCE(item_ref_id::text, LOWER(TRIM(description)))
  `, [companyId, excludeCertificationId]);
  const priorByRawKey = new Map(priorRes.rows.map(r => [r.item_key, n(r.qty)]));

  // Sum prior-certified qty across every sibling PO item in the same
  // amendment chain (POTQS001 + A1 + A3 + A4…), not just the one this bill
  // happens to reference — otherwise "previously certified" undercounts.
  const priorByChainKey = new Map();
  for (const chain of chainCache.values()) {
    if (!chain || priorByChainKey.has(chain.chainKey)) continue;
    let total = 0;
    for (const siblingId of chain.chainItemIds) total += priorByRawKey.get(siblingId) || 0;
    priorByChainKey.set(chain.chainKey, total);
  }

  const linkedRefs = [...new Set(rows.map(r => r.po_item_id || r.wo_item_id).filter(Boolean))];
  const singleLinkedRef = linkedRefs.length === 1 ? linkedRefs[0] : null;
  const singleLinkedRow = singleLinkedRef ? rows.find(r => (r.po_item_id || r.wo_item_id) === singleLinkedRef) : null;
  const grouped = new Map();

  rows.forEach(row => {
    const invQty = n(row.quantity);
    const effectiveRow = singleLinkedRef && !(row.po_item_id || row.wo_item_id) ? singleLinkedRow : row;
    const effectiveIsWO = effectiveRow?.wo_item_id || effectiveRow?.bill_type === 'wo';
    const chain = !effectiveIsWO && effectiveRow?.po_item_id ? chainCache.get(effectiveRow.po_item_id) : null;

    const orderQty = effectiveIsWO
      ? (n(effectiveRow?.wo_ordered_qty) || invQty)
      : (chain ? chain.currentQty : (n(effectiveRow?.po_ordered_qty) || invQty));
    // Fall back to basic_amount / qty when the line isn't linked to a WO/PO
    // item AND its own `rate` column is blank (common for lump-sum bill
    // entries that only captured a total) — otherwise the certified amount
    // silently comes out as qty * 0.
    const linkedRate = n(effectiveIsWO ? (effectiveRow?.wo_ordered_rate || row.rate) : (effectiveRow?.po_ordered_rate || row.rate));
    const rate = linkedRate || (invQty ? n(row.basic_amount) / invQty : 0);
    const rawKey = row.po_item_id || row.wo_item_id || String(row.item_name || '').trim().toLowerCase();
    const qsPrevQty = chain ? (priorByChainKey.get(chain.chainKey) || 0) : (priorByRawKey.get(rawKey) || 0);
    const qsPresQty = Math.max(0, invQty);
    const taxAmount = n(row.cgst_amt) + n(row.sgst_amt) + n(row.igst_amt) || n(row.gst_amount);
    const description = effectiveRow?.po_item_name || effectiveRow?.wo_item_name || row.item_name || '';
    const unit = chain?.currentUnit || effectiveRow?.po_ordered_unit || effectiveRow?.wo_ordered_unit || row.unit || '';
    const key = chain ? chain.chainKey : (singleLinkedRef || row.po_item_id || row.wo_item_id || `${description.trim().toLowerCase()}|${unit}|${rate}`);
    const existing = grouped.get(key);
    if (existing) {
      existing.bill_ids.push(row.bill_id);
      existing.bill_line_item_ids.push(row.id);
      existing.source_inv_number = [...new Set([...String(existing.source_inv_number || '').split(', ').filter(Boolean), row.inv_number || row.sl_number].filter(Boolean))].join(', ');
      existing.inv_pres_qty = round2(n(existing.inv_pres_qty) + invQty);
      existing.qs_pres_qty = round2(n(existing.qs_pres_qty) + qsPresQty);
      existing.tax_amount = round0(n(existing.tax_amount) + taxAmount);
      existing.amount = round0(n(existing.qs_pres_qty) * rate);
      existing.balance_qty = Math.max(0, orderQty - qsPrevQty - n(existing.qs_pres_qty));
      return;
    }
    grouped.set(key, {
      bill_id: row.bill_id,
      bill_ids: [row.bill_id],
      bill_line_item_id: row.id,
      bill_line_item_ids: [row.id],
      source_inv_number: row.inv_number || row.sl_number,
      item_ref_id: chain?.currentItemId || singleLinkedRef || row.po_item_id || row.wo_item_id || null,
      description,
      unit,
      order_qty: orderQty,
      order_rate: rate,
      inv_prev_qty: 0,
      inv_pres_qty: invQty,
      qs_prev_qty: qsPrevQty,
      qs_pres_qty: qsPresQty,
      tax_amount: round0(taxAmount),
      amount: round0(qsPresQty * rate),
      balance_qty: Math.max(0, orderQty - qsPrevQty - qsPresQty),
      remarks: '',
    });
  });

  return { bills: billsRes.rows, items: Array.from(grouped.values()) };
}

// GET /vendor-qs-certifications/accounts-pending
// Returns all vendor QS certs sent to accounts that still have a balance due.
// Used by the Accounts Dashboard PC section.
router.get('/accounts-pending', async (req, res) => {
  try {
    const { project_id } = req.query;
    const params = [req.user.company_id];
    let projClause = '';
    if (project_id && String(project_id).trim()) {
      params.push(project_id);
      projClause = ` AND c.project_id = $${params.length}`;
    }
    const { rows } = await query(
      `SELECT c.id, c.cert_number AS pc_number, c.ra_bill_number, c.vendor_name,
              c.project_id, c.status,
              p.name AS project_name,
              c.net_payable AS total_certified,
              COALESCE(c.paid_amount, 0) AS total_paid,
              GREATEST(0, c.net_payable - COALESCE(c.paid_amount, 0)) AS balance_due,
              GREATEST(0, c.net_payable - COALESCE(c.paid_amount, 0)) AS net_balance,
              c.tds_amount AS total_tds,
              c.advance_recovered AS advance_balance,
              c.sent_to_accounts_at AS accounts_since,
              c.order_number, c.order_type,
              c.retention_amount, c.other_deductions,
              c.gross_amount, c.tax_amount,
              c.invoice_count AS bill_count,
              'vendor_qs_cert' AS source
       FROM vendor_qs_certifications c
       LEFT JOIN projects p ON p.id = c.project_id
       WHERE c.company_id = $1
         AND c.status IN ('accounts', 'certified')
         AND c.net_payable > COALESCE(c.paid_amount, 0)${projClause}
       ORDER BY c.sent_to_accounts_at DESC NULLS LAST, c.created_at DESC`,
      params
    );
    res.json({ data: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

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
        WHERE cb.bill_id = b.id AND c.status NOT IN ('cancelled', 'rejected')
      )`
    ];
    let i = 2;
    if (project_id) { where.push(`b.project_id = $${i++}`); params.push(project_id); }
    // Many bills are entered with a free-text vendor_name and no vendor_id link,
    // so match on either — falling back to a whitespace/case-insensitive name
    // compare handles vendor master entries like "ACE AQUATECH" vs a bill typed
    // as "Ace Aqua Tech".
    if (vendor_id && vendor_name) {
      where.push(`(b.vendor_id = $${i} OR regexp_replace(LOWER(b.vendor_name), '\\s+', '', 'g') = regexp_replace(LOWER($${i + 1}), '\\s+', '', 'g'))`);
      params.push(vendor_id, vendor_name);
      i += 2;
    } else if (vendor_id) {
      where.push(`b.vendor_id = $${i++}`); params.push(vendor_id);
    } else if (vendor_name) {
      where.push(`regexp_replace(LOWER(b.vendor_name), '\\s+', '', 'g') = regexp_replace(LOWER($${i++}), '\\s+', '', 'g')`);
      params.push(vendor_name);
    }
    if (order_type) { where.push(`COALESCE(b.bill_type, 'po') = $${i++}`); params.push(order_type); }
    if (order_number) { where.push(`COALESCE(b.wo_number, b.po_number) = $${i++}`); params.push(order_number); }

    const { rows } = await query(`
      SELECT b.id, b.sl_number, b.bill_type, b.vendor_id, b.vendor_name,
             b.project_id, p.name AS project_name,
             COALESCE(b.wo_number, b.po_number) AS order_number,
             b.inv_number, b.inv_date, b.basic_amount, b.total_amount, b.workflow_status,
             b.credit_note_num, COALESCE(b.credit_note_val, 0) AS credit_note_val
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

// GET /pending-sc-advances?vendor_name=X&project_id=Y
// Returns stores_petty_cash_advances rows whose description/remarks contain subcon keywords
// and whose payee_name resembles the vendor, so the QS can see outstanding advances.
router.get('/pending-sc-advances', async (req, res) => {
  try {
    const { vendor_name, project_id } = req.query;
    if (!vendor_name?.trim()) return res.json({ data: [], total: 0 });

    const params = [req.user.company_id];
    const where = [
      `a.company_id = $1`,
      `(LOWER(COALESCE(a.description,'')) LIKE '%subcon%'
        OR LOWER(COALESCE(a.description,'')) LIKE '%sub-con%'
        OR LOWER(COALESCE(a.remarks,''))    LIKE '%subcon%'
        OR LOWER(COALESCE(a.remarks,''))    LIKE '%sub-con%')`,
    ];

    // Match payee_name against the full vendor name OR the first word of it
    const nameFull  = vendor_name.trim().toLowerCase();
    const nameFirst = nameFull.split(/\s+/).find(w => w.length >= 3) || nameFull;
    where.push(`(LOWER(a.payee_name) ILIKE $${params.length + 1} OR LOWER(a.payee_name) ILIKE $${params.length + 2})`);
    params.push(`%${nameFull}%`, `%${nameFirst}%`);

    if (project_id) {
      where.push(`(a.project_id = $${params.length + 1} OR a.project_id IS NULL)`);
      params.push(project_id);
    }

    const { rows } = await query(`
      SELECT a.id, a.payee_name, a.description, a.remarks, a.amount, a.advance_date, a.status
      FROM stores_petty_cash_advances a
      WHERE ${where.join(' AND ')}
      ORDER BY a.advance_date DESC
    `, params);

    const total = rows.reduce((sum, r) => sum + parseFloat(r.amount || 0), 0);
    res.json({ data: rows, total });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /pending-advance-vouchers — outstanding Procurement Advance Tracker
// balance for this vendor, so the QS certifier can pull it straight into the
// Advance Recovery field instead of having to look it up separately.
router.get('/pending-advance-vouchers', async (req, res) => {
  try {
    const { vendor_name, project_id } = req.query;
    if (!vendor_name?.trim()) return res.json({ data: [], total: 0 });

    const params = [req.user.company_id, `%${vendor_name.trim()}%`];
    const where = [
      `av.company_id = $1`,
      `av.vendor_name ILIKE $2`,
      `av.is_deleted = FALSE`,
      `av.advance_value > av.recovered_amount`,
    ];
    if (project_id) {
      where.push(`(av.project_id = $${params.length + 1} OR av.project_id IS NULL)`);
      params.push(project_id);
    }

    const { rows } = await query(`
      SELECT av.id, av.sl_number, av.voucher_number, av.wo_number, av.po_number,
             av.advance_value::text, av.recovered_amount::text,
             (av.advance_value - av.recovered_amount) AS outstanding
      FROM tqs_advance_vouchers av
      WHERE ${where.join(' AND ')}
      ORDER BY av.created_at ASC
    `, params);

    const total = rows.reduce((sum, r) => sum + parseFloat(r.outstanding || 0), 0);
    res.json({ data: rows, total });
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
      SELECT id, inv_number, sl_number, bill_type, gst_amount, total_amount, basic_amount,
             transport_charges, transport_gst_amt, other_charges
      FROM tqs_bills
      WHERE id = ANY($1::uuid[])
        AND company_id = $2
        AND is_deleted = FALSE
    `, [bill_ids, req.user.company_id]);
    if (billsRes.rows.length !== bill_ids.length) {
      return res.status(400).json({ error: 'Some selected invoices are invalid' });
    }

    // Amendment-chain-aware summary (same logic used at certification
    // create/refresh time) — was previously duplicated here with its own
    // stale, non-amendment-aware copy, which is why this preview screen kept
    // showing a single PO revision's order qty even after that was fixed
    // elsewhere.
    const { items: builtItems } = await buildSummaryFromBills({ query }, bill_ids, req.user.company_id, null);
    const items = builtItems;

    // Bills entered as a lump sum (common for WO bills) never got rows in
    // tqs_bill_line_items — without a fallback the abstract sheet comes out
    // completely empty for them even though the bill is otherwise valid.
    // Synthesize one line item from the bill's own basic_amount so QS can
    // still certify it.
    const billIdsWithLineItems = new Set(items.flatMap(it => it.bill_ids || [it.bill_id]).filter(Boolean));
    for (const b of billsRes.rows) {
      if (billIdsWithLineItems.has(b.id)) continue;
      const basicAmt = n(b.basic_amount) || Math.max(0, n(b.total_amount) - n(b.gst_amount) - n(b.transport_charges) - n(b.other_charges));
      if (basicAmt <= 0) continue;
      items.push({
        bill_id: b.id, bill_ids: [b.id], bill_line_item_id: null, bill_line_item_ids: [],
        source_inv_number: b.inv_number || b.sl_number,
        item_ref_id: null, description: 'Bill Amount (no itemized breakup on this invoice)', unit: 'LS',
        order_qty: 1, order_rate: round2(basicAmt),
        inv_prev_qty: 0, inv_pres_qty: 1, qs_prev_qty: 0, qs_pres_qty: 1,
        tax_amount: round2(n(b.gst_amount)),
        amount: round2(basicAmt),
        balance_qty: 0, remarks: '',
      });
    }

    // Append synthetic line items for header-level transport and other charges
    // (these fields live on tqs_bills, not in tqs_bill_line_items)
    for (const b of billsRes.rows) {
      if (n(b.transport_charges) > 0) {
        items.push({
          bill_id: b.id, bill_ids: [b.id], bill_line_item_id: null, bill_line_item_ids: [],
          source_inv_number: b.inv_number || b.sl_number,
          item_ref_id: null, description: 'Transport Charges', unit: 'LS',
          order_qty: 1, order_rate: n(b.transport_charges),
          inv_prev_qty: 0, inv_pres_qty: 1, qs_prev_qty: 0, qs_pres_qty: 1,
          tax_amount: round2(n(b.transport_gst_amt)),
          amount: round2(n(b.transport_charges)),
          balance_qty: 0, remarks: '',
        });
      }
      if (n(b.other_charges) > 0) {
        items.push({
          bill_id: b.id, bill_ids: [b.id], bill_line_item_id: null, bill_line_item_ids: [],
          source_inv_number: b.inv_number || b.sl_number,
          item_ref_id: null, description: 'Other Charges', unit: 'LS',
          order_qty: 1, order_rate: n(b.other_charges),
          inv_prev_qty: 0, inv_pres_qty: 1, qs_prev_qty: 0, qs_pres_qty: 1,
          tax_amount: 0,
          amount: round2(n(b.other_charges)),
          balance_qty: 0, remarks: '',
        });
      }
    }

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
                -- Amendment-aware: a PO's own amendments (POTQS001-A1, -A3, -A4…)
                -- each restate the FULL cumulative order to date, so the true
                -- current contract value is the LATEST amendment in the family,
                -- not just whichever specific revision this cert happens to
                -- reference — otherwise "Balance to Finish" goes negative once
                -- cumulative certified value exceeds one single old revision.
                ELSE COALESCE(latest_po.grand_total, latest_po.sub_total, po.grand_total, po.sub_total)
              END AS order_total_value,
              creator.name AS created_by_name,
              approver.name AS approved_by_name,
              rejecter.name AS rejected_by_name
       FROM vendor_qs_certifications c
       LEFT JOIN projects p ON p.id = c.project_id
       LEFT JOIN vendors v ON v.id = c.vendor_id
       LEFT JOIN users creator  ON creator.id  = c.created_by
       LEFT JOIN users approver ON approver.id = c.approved_by
       LEFT JOIN users rejecter ON rejecter.id = c.rejected_by
       -- Case-insensitive, trimmed join so "POTQS073" matches " POTQS073 " etc.
       LEFT JOIN purchase_orders po
              ON LOWER(TRIM(po.po_number)) = LOWER(TRIM(c.order_number))
             AND c.order_type != 'wo'
             AND po.project_id IN (SELECT id FROM projects WHERE company_id = c.company_id)
       LEFT JOIN work_orders wo
              ON LOWER(TRIM(wo.wo_number)) = LOWER(TRIM(c.order_number))
             AND c.order_type = 'wo'
       LEFT JOIN LATERAL (
         SELECT po2.grand_total, po2.sub_total
           FROM purchase_orders po2
          WHERE c.order_type != 'wo'
            AND po2.project_id IN (SELECT id FROM projects WHERE company_id = c.company_id)
            AND (
              LOWER(TRIM(po2.po_number)) = LOWER(TRIM(regexp_replace(c.order_number, '-A[0-9]+$', '', 'i')))
              OR LOWER(TRIM(po2.po_number)) ~ ('^' || LOWER(TRIM(regexp_replace(c.order_number, '-A[0-9]+$', '', 'i'))) || '-a[0-9]+$')
            )
          ORDER BY po2.po_date DESC NULLS LAST, po2.created_at DESC
          LIMIT 1
       ) latest_po ON TRUE
       WHERE c.id=$1 AND c.company_id=$2`,
      [req.params.id, req.user.company_id]
    );
    if (!cert.rows.length) return res.status(404).json({ error: 'Certification not found' });
    const bills = await query(`
      SELECT cb.*, b.workflow_status, u.accts_jv_date
      FROM vendor_qs_certification_bills cb
      LEFT JOIN tqs_bills b ON b.id = cb.bill_id
      LEFT JOIN tqs_bill_updates u ON u.bill_id = b.id
      WHERE cb.certification_id=$1 ORDER BY cb.inv_date
    `, [req.params.id]);
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
      gst_tax, cert_number: cert_number_input,
      qs_received_date, qs_certified_date,
      tds_rate: tds_rate_input,   // explicit rate from frontend (0/1/2)
      tds_amount: tds_amount_input, advance_recovered = 0, retention_amount = 0, other_deductions = 0,
      remarks, summary_items = [],
    } = req.body;
    if (!project_id) return res.status(400).json({ error: 'project_id required' });
    if (!vendor_name) return res.status(400).json({ error: 'vendor_name required' });
    if (!Array.isArray(bill_ids) || bill_ids.length === 0) return res.status(400).json({ error: 'Select at least one invoice' });

    const result = await withTransaction(async (client) => {
      // The QS enters the company's own certificate number (format:
      // P26/PO<last-2-digits-of-PO>/XXXX/<vendor-first-3-letters>, e.g.
      // "P26/PO06/0123/SUP") — only fall back to the auto VQS-YYYY-NNNN
      // sequence if the field was left blank.
      const certNumber = (cert_number_input && String(cert_number_input).trim())
        ? String(cert_number_input).trim()
        : await nextCertNumber(req.user.company_id);
      const billsRes = await client.query(`
        SELECT b.*
        FROM tqs_bills b
        WHERE b.id = ANY($1::uuid[])
          AND b.company_id = $2
          AND b.is_deleted = FALSE
          AND NOT EXISTS (
            SELECT 1 FROM vendor_qs_certification_bills cb
            JOIN vendor_qs_certifications c ON c.id = cb.certification_id
            WHERE cb.bill_id = b.id AND c.status NOT IN ('cancelled', 'rejected')
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
              amount: round0(row.amount || (qsQty * rate)),
              remarks: row.remarks || null,
              tax_amount: round0(row.tax_amount),
              weighment_qty: n(row.weighment_qty),
              msb_ref: row.msb_ref || null,
              ign_ref: row.ign_ref || null,
              grs_ref: row.grs_ref || null,
            };
          })
        : systemItems;
      // When using systemItems (no summary_items from frontend), header-level transport/other
      // charges are not in line items and must be added separately.
      // When summary_items ARE provided they already include synthetic transport items.
      const headerExtras = summary_items.length === 0
        ? billsRes.rows.reduce((s, b) => s + n(b.transport_charges) + n(b.other_charges), 0)
        : 0;
      const headerExtraGst = summary_items.length === 0
        ? billsRes.rows.reduce((s, b) => s + n(b.transport_gst_amt), 0)
        : 0;
      const itemTax = mappedItems.reduce((s, it) => s + n(it.tax_amount), 0) + headerExtraGst;
      // Use gst_tax override if explicitly provided (even 0 = vendor has no GST)
      const billTax = round0((gst_tax !== undefined && gst_tax !== '' && gst_tax !== null)
        ? n(gst_tax)
        : (itemTax || billsRes.rows.reduce((s, b) => s + n(b.gst_amount), 0)));

      // Invoice total = sum of selected bills' total_amount (basic + GST, exactly what vendor billed).
      // This is the correct base for net_payable and TDS — it matches the frontend display.
      const invoiceBillTotal = billsRes.rows.reduce((s, b) => s + n(b.total_amount), 0);
      // gross_amount (the certification's "before tax" summary figure, shown in the
      // printed Abstract as part of "Total Gross Certified" = gross + tax) is derived
      // from the real invoice total minus tax, NOT summed independently from
      // qty × PO-rate. Some POs quote a GST-INCLUSIVE rate (po_items.rate already
      // includes tax) — for those, qty × rate IS the full inclusive amount, so
      // summing it as "gross" and then adding tax_amount on top double-counted
      // the tax in this one summary figure (net_payable itself was never affected,
      // since it already derives from invoiceBillTotal below). Deriving gross this
      // way keeps gross + tax == invoiceBillTotal always, regardless of whether any
      // given PO's rate happens to be tax-inclusive or -exclusive.
      const gross = round0(invoiceBillTotal - billTax);

      // ── TDS auto-calculation ────────────────────────────────────────────
      // TDS base = invoice total (what vendor billed incl. GST), matching frontend useEffect.
      // Priority: explicit tds_amount > (tds_rate % × invoiceBillTotal) > vendor default tds_rate
      let appliedTdsRate = 0;
      let tds_amount = 0;
      if (tds_amount_input !== undefined && tds_amount_input !== '' && tds_amount_input !== null) {
        // Frontend explicitly provided amount — use as-is
        tds_amount = round0(tds_amount_input);
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
        tds_amount = round0(invoiceBillTotal * appliedTdsRate / 100);
      }
      // ───────────────────────────────────────────────────────────────────

      const advanceRecovered = round0(advance_recovered);
      const retentionAmount  = round0(retention_amount);
      const otherDeductions  = round0(other_deductions);
      // Read-only, derived server-side from the bills' own credit_note_val —
      // never trust a client-supplied figure for this since it's sourced
      // from an already-applied Credit Note (see credit-notes.routes.js).
      const creditNoteAmount = round0(billsRes.rows.reduce((s, b) => s + n(b.credit_note_val), 0));
      const totalDed = tds_amount + advanceRecovered + retentionAmount + otherDeductions + creditNoteAmount;
      // Net = invoice total (vendor's billed amount) minus all deductions.
      // Using invoiceBillTotal instead of gross+billTax so GST embedded in total_amount is included.
      const netPayable = round0(invoiceBillTotal - totalDed);

      // "Previously certified" must span the whole PO amendment family
      // (POTQS001, -A1, -A3, -A4…), not just an exact order_number string
      // match — a PO amendment renames the order to a new "-A<n>" suffix, so
      // an earlier cert filed against "POTQS001" would otherwise be invisible
      // to a later cert filed against "POTQS001-A4", understating "Less:
      // Previous Certificates for Payments" on the Payment Certificate.
      // Work Orders don't get renamed on amendment (same wo_number always,
      // amendments just revise the value in place), so exact match is
      // already correct there.
      const orderBase = order_type === 'wo'
        ? (order_number || '')
        : String(order_number || '').replace(/-A\d+$/i, '');
      const prev = await client.query(`
        SELECT COALESCE(SUM(net_payable), 0) AS total
        FROM vendor_qs_certifications
        WHERE company_id=$1 AND project_id=$2 AND LOWER(TRIM(vendor_name))=LOWER(TRIM($3))
          AND status NOT IN ('cancelled', 'rejected')
          AND (
            order_type = $5
            AND (
              CASE WHEN $5 = 'wo'
                THEN COALESCE(order_number,'') = $4
                ELSE regexp_replace(COALESCE(order_number,''), '-A[0-9]+$', '', 'i') = $4
              END
            )
          )
      `, [req.user.company_id, project_id, vendor_name, orderBase, order_type]);
      const prevTotal = n(prev.rows[0]?.total);

      const cert = await client.query(`
        INSERT INTO vendor_qs_certifications (
          company_id, project_id, vendor_id, vendor_name, order_type, order_number,
          cert_number, ra_sequence, ra_bill_number, status, invoice_count,
          gross_amount, tax_amount, tds_amount, tds_rate, advance_recovered, retention_amount,
          other_deductions, net_payable, previous_certified_amount,
          cumulative_certified_amount, is_final_bill, remarks, certified_at, created_by,
          qs_received_date, qs_certified_date, credit_note_amount
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'certified',$10,$11,$12,$13,$23,$14,$15,$16,$17,$18,$19,$20,$21,NOW(),$22,$24,$25,$26)
        RETURNING *
      `, [
        req.user.company_id, project_id, vendor_id || null, vendor_name, order_type, order_number || null,
        certNumber, ra_sequence, ra_bill_number || `RA-${ra_sequence}`, billsRes.rows.length,
        gross, billTax, tds_amount, advanceRecovered, retentionAmount, otherDeductions,
        netPayable, prevTotal, prevTotal + netPayable, is_final_bill, remarks || null, req.user.id,
        appliedTdsRate,  // $23
        qs_received_date || null,  // $24
        qs_certified_date || null, // $25
        creditNoteAmount,          // $26
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
        // Not proportionally allocated like the others — a credit note is
        // already tied to this exact bill (credit_note_val), not split
        // across every other invoice selected into the same certification.
        const billCreditNote = n(b.credit_note_val);
        const billTotalDeductions = billAdvanceRecovery + billTds + billRetention + billOtherDeduction + billCreditNote;
        await client.query(
          `INSERT INTO vendor_qs_certification_bills (certification_id, bill_id, sl_number, inv_number, inv_date, total_amount)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [cert.rows[0].id, b.id, b.sl_number, b.inv_number, b.inv_date, b.total_amount]
        );
        await client.query(`
          INSERT INTO tqs_bill_updates (
            bill_id, certified_net, balance_to_pay, qs_received_date, qs_certified_date,
            qs_gross, qs_tax, qs_total,
            ra_sequence, ra_bill_number, pc_number, pc_generated_at,
            advance_recovered, tds_deduction, retention_money,
            other_deductions, credit_note_amt, total_deductions,
            handed_over_accounts_date, accts_jv_date, updated_at
          )
          VALUES ($1,$2,$2,$14,COALESCE($15,CURRENT_DATE),$3,$4,$5,$6,$7,$8,NOW(),$9,$10,$11,$12,$16,$13,CURRENT_DATE,COALESCE($15,CURRENT_DATE),NOW())
          ON CONFLICT (bill_id) DO UPDATE SET
            certified_net=EXCLUDED.certified_net,
            balance_to_pay=EXCLUDED.balance_to_pay,
            qs_received_date=COALESCE(EXCLUDED.qs_received_date, tqs_bill_updates.qs_received_date),
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
            credit_note_amt=EXCLUDED.credit_note_amt,
            total_deductions=EXCLUDED.total_deductions,
            pc_generated_at=COALESCE(tqs_bill_updates.pc_generated_at, EXCLUDED.pc_generated_at),
            handed_over_accounts_date=COALESCE(tqs_bill_updates.handed_over_accounts_date, EXCLUDED.handed_over_accounts_date),
            -- Auto-assign Accounts' JV date to the QS Certified Date so it
            -- doesn't sit blank until someone visits the Accounts JV section —
            -- but never clobber a real JV date Accounts already recorded.
            accts_jv_date=COALESCE(tqs_bill_updates.accts_jv_date, EXCLUDED.accts_jv_date),
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
          qs_received_date || null,   // $14
          qs_certified_date || null,  // $15
          billCreditNote,              // $16
        ]);
        // QS certification now routes straight to Procurement (Accounts is no
        // longer a blocking waypoint — see PATCH /:id/qs in tqs-bills.routes.js
        // for the matching change on the Bill Tracker's own quick-cert path).
        await client.query(`UPDATE tqs_bills SET workflow_status='procurement', updated_at=NOW() WHERE id=$1`, [b.id]);
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
            qs_prev_qty, qs_pres_qty, amount, remarks,
            weighment_qty, msb_ref, ign_ref, grs_ref
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
        `, [cert.rows[0].id, it.bill_id, it.bill_line_item_id, it.source_inv_number, it.item_ref_id,
          it.description, it.unit, it.order_qty, it.order_rate, it.inv_prev_qty, it.inv_pres_qty,
          it.qs_prev_qty, it.qs_pres_qty, it.amount, it.remarks,
          it.weighment_qty || 0, it.msb_ref || null, it.ign_ref || null, it.grs_ref || null]);
      }

      return cert.rows[0];
    });
    res.status(201).json({ data: result });

    // Advance Recovery was set at creation — resync the Procurement Advance
    // Tracker so the vendor's voucher(s) reflect it immediately.
    if (n(advance_recovered) > 0) {
      resyncAdvancesFromBills(req.user.company_id).catch(e =>
        console.error('[qs-cert create] advance resync failed:', e.message));
    }

    // Best-effort: notify the approver a new certification is awaiting their
    // sign-off — never blocks/fails the request if mail isn't configured.
    try {
      const appUrl = (process.env.PUBLIC_FRONTEND_URL || process.env.FRONTEND_URL || 'https://erp.bcim.in').replace(/\/$/, '');
      await sendMail({
        to: CERT_APPROVER_EMAIL,
        subject: `QS Certification awaiting approval — ${result.cert_number} (${result.vendor_name})`,
        html: `
          <p>A new Vendor QS Certification has been created and needs your approval before it moves to Accounts.</p>
          <table style="border-collapse:collapse;font-family:sans-serif;font-size:13px;margin:12px 0;">
            <tr><td style="padding:4px 12px 4px 0;color:#666;">Certificate No.</td><td><b>${result.cert_number}</b></td></tr>
            <tr><td style="padding:4px 12px 4px 0;color:#666;">Vendor</td><td>${result.vendor_name}</td></tr>
            <tr><td style="padding:4px 12px 4px 0;color:#666;">RA No.</td><td>${result.ra_bill_number || ''}</td></tr>
            <tr><td style="padding:4px 12px 4px 0;color:#666;">Net Payable</td><td>₹${n(result.net_payable).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td></tr>
          </table>
          <p><a href="${appUrl}/qs/vendor-certifications/${result.id}">Open this certification</a></p>
        `,
      });
    } catch (_) { /* mail not configured / transient failure — non-blocking */ }
    return;
  } catch (err) {
    if (err.code === '23505' && /cert_number/.test(err.constraint || '')) {
      return res.status(409).json({ error: `Certificate number "${req.body.cert_number}" is already in use. Enter a different number.` });
    }
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
      const itemTax = round0(items.reduce((s, it) => s + n(it.tax_amount), 0));
      const billTax = itemTax || round0(linkedBills.rows.reduce((s, b) => s + n(b.gst_amount), 0));
      const totalDed = n(cert.tds_amount) + n(cert.advance_recovered) + n(cert.retention_amount) + n(cert.other_deductions);
      // Net = invoice total (what vendor billed incl. GST) minus deductions
      const invoiceBillTotal = round2(linkedBills.rows.reduce((s, b) => s + n(b.total_amount), 0));
      const netPayable = round0(invoiceBillTotal - totalDed);
      // gross_amount is derived from the real invoice total minus tax (see the
      // same fix + comment in POST / above) — NOT summed independently from
      // qty × PO-rate, which double-counts tax on POs whose rate is GST-inclusive.
      const gross = round0(invoiceBillTotal - billTax) || round0(items.reduce((s, it) => s + n(it.amount), 0));

      // weighment_qty/msb_ref/ign_ref/grs_ref are typed in manually by the QS
      // certifier and aren't derivable from bill data — preserve them across
      // a refresh by matching old items to the freshly-built ones on the same
      // key (item_ref_id, else description+unit) before wiping the old rows.
      const prevAnnotations = await client.query(
        `SELECT item_ref_id, description, unit, weighment_qty, msb_ref, ign_ref, grs_ref
           FROM vendor_qs_certification_items WHERE certification_id=$1`,
        [req.params.id]
      );
      const annotationKey = (r) => r.item_ref_id || `${String(r.description || '').trim().toLowerCase()}|${r.unit || ''}`;
      const annotationMap = new Map(prevAnnotations.rows.map(r => [annotationKey(r), r]));

      await client.query(
        `DELETE FROM vendor_qs_certification_items WHERE certification_id=$1`,
        [req.params.id]
      );

      for (const it of items) {
        const carried = annotationMap.get(annotationKey(it));
        await client.query(`
          INSERT INTO vendor_qs_certification_items (
            certification_id, bill_id, bill_line_item_id, source_inv_number, item_ref_id,
            description, unit, order_qty, order_rate, inv_prev_qty, inv_pres_qty,
            qs_prev_qty, qs_pres_qty, amount, remarks,
            weighment_qty, msb_ref, ign_ref, grs_ref
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
        `, [req.params.id, it.bill_id, it.bill_line_item_id, it.source_inv_number, it.item_ref_id,
          it.description, it.unit, it.order_qty, it.order_rate, it.inv_prev_qty, it.inv_pres_qty,
          it.qs_prev_qty, it.qs_pres_qty, it.amount, it.remarks,
          carried?.weighment_qty || 0, carried?.msb_ref || null, carried?.ign_ref || null, carried?.grs_ref || null]);
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

// PATCH /:id/meta — correct the RA Bill No. on an existing certification
// (e.g. renumbering RA-1 -> RA-19). Same sensitivity gate as cert_number/GST
// since the RA number is an official reference printed on the Abstract of
// Measurement and Payment Certificate.
router.patch('/:id/meta', async (req, res) => {
  try {
    const { ra_bill_number, ra_sequence } = req.body;
    if (ra_bill_number === undefined && ra_sequence === undefined) {
      return res.status(400).json({ error: 'ra_bill_number or ra_sequence required' });
    }
    const email = (req.user.email || '').toLowerCase();
    const role  = (req.user.role || '').toLowerCase();
    const canEditSensitive = email === CERT_APPROVER_EMAIL || role === 'super_admin' || role === 'admin';
    if (!canEditSensitive) {
      return res.status(403).json({ error: `Only ${CERT_APPROVER_EMAIL} can edit the RA Bill No.` });
    }

    const certRes = await query(
      `SELECT id, status FROM vendor_qs_certifications WHERE id=$1 AND company_id=$2`,
      [req.params.id, req.user.company_id]
    );
    if (!certRes.rows.length) return res.status(404).json({ error: 'Certification not found' });
    if (certRes.rows[0].status === 'paid') return res.status(400).json({ error: 'Paid certification cannot be edited' });

    const sets = [];
    const params = [];
    let i = 1;
    if (ra_bill_number !== undefined) { sets.push(`ra_bill_number=$${i++}`); params.push(ra_bill_number || null); }
    if (ra_sequence !== undefined)    { sets.push(`ra_sequence=$${i++}`);    params.push(parseInt(ra_sequence, 10) || 1); }
    params.push(req.params.id, req.user.company_id);

    const result = await query(
      `UPDATE vendor_qs_certifications SET ${sets.join(', ')}, updated_at=NOW()
       WHERE id=$${i++} AND company_id=$${i++} RETURNING *`,
      params
    );
    res.json({ data: result.rows[0] });
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
      cert_number: cert_number_edit,   // sensitive — prithivi only
      gst_tax,                          // sensitive — prithivi only (edit GST)
    } = req.body;

    // Certificate number and GST are the QS Certifier's fields — only the
    // designated approver (or a super_admin/admin) may change them. Deductions
    // stay editable by anyone with access, as before.
    const email = (req.user.email || '').toLowerCase();
    const role  = (req.user.role || '').toLowerCase();
    const canEditSensitive = email === CERT_APPROVER_EMAIL || role === 'super_admin' || role === 'admin';

    const wantsCertNumberChange = cert_number_edit !== undefined && cert_number_edit !== null;
    const wantsGstChange = gst_tax !== undefined && gst_tax !== '' && gst_tax !== null;
    if ((wantsCertNumberChange || wantsGstChange) && !canEditSensitive) {
      return res.status(403).json({ error: `Only ${CERT_APPROVER_EMAIL} can edit the certificate number or GST.` });
    }

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

      // GST: if the approver edited it, that new tax is authoritative; otherwise keep as-is.
      const finalTax = wantsGstChange ? n(gst_tax) : n(cert.tax_amount);

      // Recalc TDS amount from rate if rate supplied, else use explicit amount.
      // TDS base = invoiceBillTotal (matches frontend useEffect and POST handler).
      const finalTdsAmount = (tds_rate_edit !== undefined && tds_rate_edit !== '')
        ? round2(invoiceBillTotal * n(tds_rate_edit) / 100)
        : n(tds_amount);
      const finalTdsRate = (tds_rate_edit !== undefined && tds_rate_edit !== '')
        ? n(tds_rate_edit)
        : (invoiceBillTotal > 0 ? round2((n(tds_amount) / invoiceBillTotal) * 100) : n(cert.tds_rate));
      const totalDed = finalTdsAmount + n(advance_recovered) + n(retention_amount) + n(other_deductions);
      // Net base: when GST is explicitly edited, use gross + edited-tax (matches the
      // on-screen preview the approver confirms — WYSIWYG). Otherwise keep the
      // invoice-total basis so a cert-number-only edit doesn't shift payables.
      const netPayable = wantsGstChange
        ? round2(gross + finalTax - totalDed)
        : (invoiceBillTotal - totalDed);

      // Certificate number change — trim, and let the UNIQUE constraint reject dupes.
      const newCertNumber = wantsCertNumberChange && String(cert_number_edit).trim()
        ? String(cert_number_edit).trim()
        : cert.cert_number;

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
            tax_amount=$10,
            cert_number=$11,
            updated_at=NOW()
        WHERE id=$8 AND company_id=$9
        RETURNING *
      `, [
        finalTdsAmount, n(advance_recovered), n(retention_amount), n(other_deductions),
        netPayable, remarks || null, finalTdsRate, req.params.id, req.user.company_id,
        finalTax, newCertNumber,
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
        // Only touch qs_tax/qs_total and pc_number when those were actually edited,
        // so an unrelated deductions edit leaves the certified GST snapshot alone.
        const billTax = allocate(finalTax, b.total_amount);
        await client.query(`
          UPDATE tqs_bill_updates
          SET certified_net=$1,
              balance_to_pay=$1 - COALESCE(paid_amount, 0),
              advance_recovered=$2,
              tds_deduction=$3,
              retention_money=$4,
              other_deductions=$5,
              total_deductions=$6,
              qs_tax = CASE WHEN $8 THEN $9 ELSE qs_tax END,
              qs_total = CASE WHEN $8 THEN COALESCE(qs_gross,0) + $9 ELSE qs_total END,
              pc_number = CASE WHEN $10 THEN $11 ELSE pc_number END,
              updated_at=NOW()
          WHERE bill_id=$7
        `, [
          billCertifiedNet, billAdvanceRecovery, billTds, billRetention,
          billOtherDeduction, billTotalDeductions, b.bill_id,
          wantsGstChange, billTax,
          wantsCertNumberChange, newCertNumber,
        ]);
      }

      return updated.rows[0];
    });
    res.json({ data: result });

    // Advance Recovery on this cert just changed — resync the Procurement
    // Advance Tracker so the linked vendor's voucher(s) reflect it (FIFO
    // across their open vouchers). Best-effort: never fails the request.
    resyncAdvancesFromBills(req.user.company_id).catch(e =>
      console.error('[qs-cert /amounts] advance resync failed:', e.message));
  } catch (err) {
    if (err.code === '23505' && /cert_number/.test(err.constraint || '')) {
      return res.status(409).json({ error: `Certificate number "${String(req.body.cert_number).trim()}" is already in use. Enter a different number.` });
    }
    res.status(500).json({ error: err.message });
  }
});

// PATCH /vendor-qs-certifications/:id/items — update qs_pres_qty (and inv_pres_qty)
// per item. Restricted to CERT_APPROVER_EMAIL / super_admin / admin.
// Body: { items: [{ id, qs_pres_qty, inv_pres_qty? }] }
router.patch('/:id/items', async (req, res) => {
  try {
    const email = (req.user.email || '').toLowerCase();
    const role  = (req.user.role  || '').toLowerCase();
    if (email !== CERT_APPROVER_EMAIL && role !== 'super_admin' && role !== 'admin') {
      return res.status(403).json({ error: `Only ${CERT_APPROVER_EMAIL} can edit certified quantities.` });
    }
    const { items } = req.body;
    if (!Array.isArray(items) || !items.length) return res.status(400).json({ error: 'items array required' });

    const result = await withTransaction(async (client) => {
      // Verify cert belongs to this company and is not paid/cancelled
      const certRes = await client.query(
        `SELECT * FROM vendor_qs_certifications WHERE id=$1 AND company_id=$2 FOR UPDATE`,
        [req.params.id, req.user.company_id]
      );
      if (!certRes.rows.length) throw new Error('Certification not found');
      const cert = certRes.rows[0];
      if (cert.status === 'paid')      throw new Error('Paid certification cannot be edited');
      if (cert.status === 'cancelled') throw new Error('Cancelled certification cannot be edited');

      for (const it of items) {
        const qsQty = parseFloat(it.qs_pres_qty) || 0;
        await client.query(
          `UPDATE vendor_qs_certification_items
           SET qs_pres_qty = $1,
               inv_pres_qty = COALESCE($2, inv_pres_qty),
               amount = ROUND($1 * order_rate),
               updated_at = NOW()
           WHERE id = $3 AND certification_id = $4`,
          [qsQty, it.inv_pres_qty != null ? parseFloat(it.inv_pres_qty) : null, it.id, req.params.id]
        );
      }

      // Recalculate gross_amount on the cert header from the updated items
      const totals = await client.query(
        `SELECT COALESCE(SUM(amount),0) AS gross FROM vendor_qs_certification_items WHERE certification_id=$1`,
        [req.params.id]
      );
      const newGross = round0(totals.rows[0].gross);
      const newNet   = round0(newGross + n(cert.tax_amount)
                       - n(cert.tds_amount) - n(cert.advance_recovered)
                       - n(cert.retention_amount) - n(cert.other_deductions));
      await client.query(
        `UPDATE vendor_qs_certifications SET gross_amount=$1, net_payable=$2, updated_at=NOW() WHERE id=$3`,
        [newGross, newNet, req.params.id]
      );
      return { gross_amount: newGross, net_payable: newNet };
    });

    res.json({ data: result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/:id/status', async (req, res) => {
  try {
    const { status, remarks } = req.body;
    const allowed = ['draft', 'certified', 'accounts', 'paid', 'cancelled', 'rejected'];
    if (!allowed.includes(status)) return res.status(400).json({ error: 'Invalid status' });

    // Approving (-> accounts) and rejecting are both gated to the designated
    // approver — a certification can't skip straight to Accounts without
    // sign-off, and only the approver can send it back to QS with a reason.
    const isApproverAction = status === 'accounts' || status === 'rejected';
    if (isApproverAction && (req.user.email || '').toLowerCase() !== CERT_APPROVER_EMAIL) {
      return res.status(403).json({ error: `Only ${CERT_APPROVER_EMAIL} can ${status === 'accounts' ? 'approve and send a certification to Accounts' : 'reject a certification'}.` });
    }
    if (status === 'rejected' && !String(remarks || '').trim()) {
      return res.status(400).json({ error: 'A reason is required when rejecting a certification.' });
    }

    const result = await withTransaction(async (client) => {
      const { rows } = await client.query(
        `UPDATE vendor_qs_certifications
         SET status=$1, sent_to_accounts_at=CASE WHEN $1='accounts' THEN NOW() ELSE sent_to_accounts_at END,
             approved_by=CASE WHEN $1='accounts' THEN $4 ELSE approved_by END,
             approved_at=CASE WHEN $1='accounts' THEN NOW() ELSE approved_at END,
             rejected_by=CASE WHEN $1='rejected' THEN $4 ELSE rejected_by END,
             rejected_at=CASE WHEN $1='rejected' THEN NOW() ELSE rejected_at END,
             rejection_remarks=CASE WHEN $1='rejected' THEN $5 ELSE rejection_remarks END,
             updated_at=NOW()
         WHERE id=$2 AND company_id=$3 RETURNING *`,
        [status, req.params.id, req.user.company_id, req.user.id, remarks || null]
      );
      if (!rows.length) return null;

      // Rejecting or cancelling frees up the linked bills — send them back to
      // the QS stage and clear their certification data in tqs_bill_updates.
      if (status === 'rejected' || status === 'cancelled') {
        const linkedBills = await client.query(
          `SELECT bill_id FROM vendor_qs_certification_bills WHERE certification_id=$1`,
          [req.params.id]
        );
        for (const { bill_id } of linkedBills.rows) {
          await client.query(`
            UPDATE tqs_bills SET workflow_status='qs', updated_at=NOW()
            WHERE id=$1 AND workflow_status NOT IN ('paid')
          `, [bill_id]);
          await client.query(`
            UPDATE tqs_bill_updates SET
              certified_net=0, balance_to_pay=0,
              qs_certified_date=NULL, qs_received_date=NULL,
              qs_gross=0, qs_tax=NULL, qs_total=NULL,
              ra_sequence=NULL, ra_bill_number=NULL,
              advance_recovered=0, tds_deduction=0, retention_money=0,
              other_deductions=0, total_deductions=0,
              pc_number=NULL, pc_generated_at=NULL,
              handed_over_accounts_date=NULL, updated_at=NOW()
            WHERE bill_id=$1
          `, [bill_id]);
        }
      }

      // Approving to Accounts (or marking paid directly via this endpoint,
      // rather than through POST /:id/payment) previously left every linked
      // bill's own workflow_status wherever it happened to be — the exact
      // mismatch class found and hand-fixed on LANCO LH-10 (P0-395, WO-480,
      // etc.). Keep Bill Tracker's stage following the certification's from
      // here on. Never downgrade a bill that's already 'paid'.
      if (status === 'accounts' || status === 'paid') {
        await client.query(`
          UPDATE tqs_bills b
          SET workflow_status=$1, updated_at=NOW()
          FROM vendor_qs_certification_bills cb
          WHERE cb.certification_id=$2 AND b.id=cb.bill_id
            AND b.workflow_status NOT IN ('paid')
        `, [status, req.params.id]);
      }
      return rows[0];
    });

    if (!result) return res.status(404).json({ error: 'Certification not found' });
    res.json({ data: result });

    // On cancel/reject: tqs_bill_updates.advance_recovered was cleared inside the
    // transaction — resync both advance tables so recoveries reflect remaining bills.
    if (status === 'cancelled' || status === 'rejected') {
      resyncTqsAdvancesForCompany(req.user.company_id).catch(e =>
        console.error('[cert cancel/reject] tqs_advances resync failed:', e.message));
      resyncAdvancesFromBills(req.user.company_id).catch(e =>
        console.error('[cert cancel/reject] voucher resync failed:', e.message));
    }

    if (status === 'accounts') {
      // Best-effort: let the approver + Derek know the Payment Certificate is
      // ready — never blocks/fails the request if mail isn't configured.
      try {
        const cert = result;
        const appUrl = (process.env.PUBLIC_FRONTEND_URL || process.env.FRONTEND_URL || 'https://erp.bcim.in').replace(/\/$/, '');
        await sendMail({
          to: PAYMENT_CERT_NOTIFY_EMAILS,
          subject: `Payment Certificate ready — ${cert.cert_number} (${cert.vendor_name})`,
          html: `
            <p>Certification <b>${cert.cert_number}</b> for <b>${cert.vendor_name}</b> has been approved and is now with Accounts. The Payment Certificate is ready.</p>
            <table style="border-collapse:collapse;font-family:sans-serif;font-size:13px;margin:12px 0;">
              <tr><td style="padding:4px 12px 4px 0;color:#666;">RA No.</td><td>${cert.ra_bill_number || ''}</td></tr>
              <tr><td style="padding:4px 12px 4px 0;color:#666;">Net Payable</td><td>₹${n(cert.net_payable).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td></tr>
            </table>
            <p><a href="${appUrl}/qs/vendor-certifications/${cert.id}?print=payment">Open / Print Payment Certificate</a></p>
          `,
        });
      } catch (_) { /* mail not configured / transient failure — non-blocking */ }
    }

    if (status === 'rejected') {
      // Best-effort: tell whoever created it why it was sent back.
      try {
        const cert = result;
        const creatorRes = await query(`SELECT email FROM users WHERE id=$1`, [cert.created_by]);
        const creatorEmail = creatorRes.rows[0]?.email;
        if (creatorEmail) {
          const appUrl = (process.env.PUBLIC_FRONTEND_URL || process.env.FRONTEND_URL || 'https://erp.bcim.in').replace(/\/$/, '');
          await sendMail({
            to: creatorEmail,
            subject: `Certification rejected — ${cert.cert_number} (${cert.vendor_name})`,
            html: `
              <p>Certification <b>${cert.cert_number}</b> for <b>${cert.vendor_name}</b> was rejected and sent back to QS.</p>
              <p style="background:#fef2f2;border:1px solid #fecaca;padding:10px 14px;border-radius:6px;"><b>Reason:</b> ${esc(cert.rejection_remarks)}</p>
              <p><a href="${appUrl}/qs/vendor-certifications/${cert.id}">Open this certification</a></p>
            `,
          });
        }
      } catch (_) { /* non-blocking */ }
    }
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
               b.sl_number, b.inv_number,
               COALESCE(u.tds_deduction, 0) AS tds_deduction,
               COALESCE(u.paid_amount, 0) AS existing_paid
        FROM vendor_qs_certification_bills cb
        JOIN tqs_bills b ON b.id = cb.bill_id
        LEFT JOIN tqs_bill_updates u ON u.bill_id = cb.bill_id
        WHERE cb.certification_id = $1
        ORDER BY cb.inv_date
      `, [req.params.id]);
      if (!billsRes.rows.length) throw new Error('No bills linked to this certification');

      // Per-bill certified cap = THIS cert's net_payable split across its bills by
      // invoice total, exactly as allocated at certification time. Tying the cap to
      // the certification (not the shared per-bill tqs_bill_updates row, which a later
      // cert on the same bill overwrites) guarantees every linked bill is paid and the
      // caps sum to net_payable — fixes 2-bill certs that only settled one bill.
      const certNet = n(cert.net_payable);
      const selectedBillTotal = Math.max(1, billsRes.rows.reduce((s, b) => s + n(b.total_amount), 0));
      const capFor = (b) => round2((n(b.total_amount) / selectedBillTotal) * certNet);
      const totalNet = billsRes.rows.reduce((s, b) => s + capFor(b), 0) || 1;
      const allocate = (amount, base) => round2((n(base) / totalNet) * n(amount));

      // 1) Update each bill's tqs_bill_updates and workflow_status
      const lines = [];
      for (const b of billsRes.rows) {
        const certifiedNet = capFor(b);
        let billPaid = allocate(totalPaid, certifiedNet);
        const remaining = Math.max(0, certifiedNet - n(b.existing_paid));
        if (billPaid > remaining + 0.50) {
          const err = new Error(`Payment exceeds payable balance for ${b.sl_number}. Remaining payable is Rs ${remaining.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}.`);
          err.statusCode = 400;
          throw err;
        }
        // Clamp to remaining to absorb sub-rupee rounding differences
        billPaid = round2(Math.min(billPaid, remaining));
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

      // Link tqs_bill_id when the cert covers exactly one bill (single FK, can't
      // represent a multi-bill cert), and always link certification_id so a
      // multi-bill cert can still be excluded once all its bills are fully paid
      // — see the vendor_qs_certification_bills join in boq-budget.routes.js's
      // finPayActuals query. Without one of these, the Budget Control "Bills
      // Paid" figure double-counts: once via each bill's own workflow_status=
      // 'paid', and again via this Finance payment record.
      const singleBillId = billsRes.rows.length === 1 ? billsRes.rows[0].bill_id : null;

      let finance_payment_id = null;
      if (firstBill.project_id) {
        const fp = await client.query(`
          INSERT INTO payments
            (project_id, payment_type, entity_name,
             amount, tds_deducted, net_amount,
             payment_date, payment_mode, reference_number, bank_name,
             cost_head, remarks, created_by, source, tqs_bill_id, certification_id)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
          RETURNING id
        `, [
          firstBill.project_id, payType, cert.vendor_name,
          totalPaid, totalTds, netPaid,
          payment_date, payment_mode, reference_number || null, bank_name || null,
          costHead,
          `QS Cert ${cert.cert_number} (${cert.ra_bill_number || ''}) — ${billsRes.rows.length} bill(s)${remarks ? ': ' + remarks : ''}`,
          req.user.id, 'tqs_cert', singleBillId, cert.id,
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

    await withTransaction(async (client) => {
      // Capture linked bill IDs before cascade removes them
      const linkedBills = await client.query(
        `SELECT bill_id FROM vendor_qs_certification_bills WHERE certification_id=$1`,
        [req.params.id]
      );

      // Delete cert — ON DELETE CASCADE removes certification_bills and certification_items
      await client.query(
        `DELETE FROM vendor_qs_certifications WHERE id=$1 AND company_id=$2`,
        [req.params.id, req.user.company_id]
      );

      // For each bill, check if another active cert still covers it.
      // If not, clear ALL certification AND payment data and send the bill back to QS.
      for (const { bill_id } of linkedBills.rows) {
        const remaining = await client.query(
          `SELECT 1 FROM vendor_qs_certification_bills cb
           JOIN vendor_qs_certifications c ON c.id = cb.certification_id
           WHERE cb.bill_id=$1 AND c.status NOT IN ('cancelled','rejected')
           LIMIT 1`,
          [bill_id]
        );
        if (remaining.rows.length === 0) {
          // Clear certification data AND payment data (handles paid certs too)
          await client.query(`
            UPDATE tqs_bill_updates SET
              certified_net=0,
              qs_certified_date=NULL, qs_received_date=NULL,
              qs_gross=0, qs_tax=NULL, qs_total=NULL,
              ra_sequence=NULL, ra_bill_number=NULL,
              advance_recovered=0, tds_deduction=0, retention_money=0,
              other_deductions=0, total_deductions=0,
              pc_number=NULL, pc_generated_at=NULL,
              handed_over_accounts_date=NULL,
              paid_amount=0, balance_to_pay=0,
              payment_status=NULL, payment_date=NULL,
              payment_mode=NULL, reference_number=NULL, bank_name=NULL,
              updated_at=NOW()
            WHERE bill_id=$1
          `, [bill_id]);

          // Reset bill status — allow reversal even from 'paid'
          await client.query(`
            UPDATE tqs_bills SET workflow_status='qs', updated_at=NOW()
            WHERE id=$1
          `, [bill_id]);
        }
      }
    });

    res.json({ message: `Certification ${cert.cert_number} deleted successfully` });

    // Resync advance recoveries — tqs_bill_updates.advance_recovered was cleared
    // inside the transaction, so both tables now rebuild correctly from remaining bills.
    resyncTqsAdvancesForCompany(req.user.company_id).catch(e =>
      console.error('[cert delete] tqs_advances resync failed:', e.message));
    resyncAdvancesFromBills(req.user.company_id).catch(e =>
      console.error('[cert delete] voucher resync failed:', e.message));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── One-time cleanup: clear stale cert data from bills whose certification ──
// was deleted/cancelled before the fix (2026-07). Finds any bill that has
// certified_net > 0 or qs_certified_date set in tqs_bill_updates but is NOT
// linked to any active (non-cancelled, non-rejected) certification.
runSchemaInit('cleanup_orphaned_cert_data_2026_07', async () => {
  // 1. Clear stale tqs_bill_updates rows (advance_recovered included)
  await query(`
    UPDATE tqs_bill_updates u
    SET certified_net=0, balance_to_pay=0,
        qs_certified_date=NULL, qs_received_date=NULL,
        qs_gross=0, qs_tax=NULL, qs_total=NULL,
        ra_sequence=NULL, ra_bill_number=NULL,
        advance_recovered=0, tds_deduction=0, retention_money=0,
        other_deductions=0, total_deductions=0,
        pc_number=NULL, pc_generated_at=NULL,
        handed_over_accounts_date=NULL, updated_at=NOW()
    WHERE (COALESCE(u.certified_net, 0) > 0 OR u.qs_certified_date IS NOT NULL)
      AND NOT EXISTS (
        SELECT 1 FROM vendor_qs_certification_bills cb
        JOIN vendor_qs_certifications c ON c.id = cb.certification_id
        WHERE cb.bill_id = u.bill_id
          AND c.status NOT IN ('cancelled', 'rejected')
      )
  `);

  // 2. Reset workflow_status back to 'qs' for those now-orphaned bills
  await query(`
    UPDATE tqs_bills b
    SET workflow_status='qs', updated_at=NOW()
    WHERE b.workflow_status = 'procurement'
      AND NOT EXISTS (
        SELECT 1 FROM vendor_qs_certification_bills cb
        JOIN vendor_qs_certifications c ON c.id = cb.certification_id
        WHERE cb.bill_id = b.id
          AND c.status NOT IN ('cancelled', 'rejected')
      )
  `);
});

// ── One-time: resync advance recovered amounts after orphaned-cert cleanup ──
// The previous migration cleared advance_recovered on orphaned bills.
// This rebuilds both tqs_advances and tqs_advance_vouchers from remaining bills.
// ── One-time: resync advance recovered amounts after orphaned-cert cleanup ──
// The previous migration cleared advance_recovered on orphaned bills.
// This rebuilds both tqs_advances and tqs_advance_vouchers from remaining bills.
runSchemaInit('cleanup_orphaned_cert_advance_resync_2026_07', async () => {
  const { rows: companies } = await query(
    `SELECT DISTINCT company_id FROM tqs_bills WHERE is_deleted = FALSE`
  );
  for (const { company_id } of companies) {
    await resyncTqsAdvancesForCompany(company_id).catch(e =>
      console.error('[migration] tqs_advances resync failed for company', company_id, e.message));
    await resyncAdvancesFromBills(company_id).catch(e =>
      console.error('[migration] voucher resync failed for company', company_id, e.message));
  }
});

// ── One-time: clear orphaned advance_recovered on bills with no active cert ──
// The 2026-07 orphan cleanup only matched bills with certified_net > 0 or
// qs_certified_date set — bills carrying ONLY advance_recovered slipped through
// (e.g. Residential Apartments - Yelahanka). Their deleted certifications left
// advance_recovered > 0 behind, so every resync kept rebuilding voucher
// recoveries from them. Clear it, then rebuild both advance tables.
runSchemaInit('cleanup_orphaned_advance_recovered_2026_07b', async () => {
  const result = await query(`
    UPDATE tqs_bill_updates u
    SET advance_recovered=0, updated_at=NOW()
    FROM tqs_bills b
    WHERE b.id = u.bill_id
      AND b.is_deleted = FALSE
      AND COALESCE(u.advance_recovered, 0) > 0
      AND b.project_id IN (
        'a30adb9c-3511-4149-9017-bdc6150133c0',
        '593273cf-721f-42f1-9178-53dca3e71caa'
      )
      AND NOT EXISTS (
        SELECT 1 FROM vendor_qs_certification_bills cb
        JOIN vendor_qs_certifications c ON c.id = cb.certification_id
        WHERE cb.bill_id = u.bill_id
          AND c.status NOT IN ('cancelled', 'rejected')
      )
  `);
  console.log(`[migration] Cleared orphaned advance_recovered on ${result.rowCount} bill(s)`);

  const { rows: companies } = await query(
    `SELECT DISTINCT company_id FROM tqs_bills WHERE is_deleted = FALSE`
  );
  for (const { company_id } of companies) {
    await resyncTqsAdvancesForCompany(company_id).catch(e =>
      console.error('[migration] tqs_advances resync failed for company', company_id, e.message));
    await resyncAdvancesFromBills(company_id).catch(e =>
      console.error('[migration] voucher resync failed for company', company_id, e.message));
  }
});

// ── One-time: merge duplicate vendor master records + backfill bill.vendor_id ──
// Investigation (2026-07-21) found 9 vendor names with two separate vendor
// master rows (e.g. "SCP Concrete" existed twice) and 341 bills across 50
// vendors with vendor_id=NULL that only matched a vendor by name — both of
// which made bills silently invisible in QS Certification's pending-invoices
// lookup (see the pending-invoices route above, fixed to match by ID OR
// normalized name). This backfills vendor_id everywhere it's now unambiguous
// so every other vendor_id-based join/report benefits too, not just that one
// endpoint.
runSchemaInit('merge_duplicate_vendors_and_backfill_2026_07', async () => {
  // keeper (K) = record kept active; loser (L) = merged away and deactivated.
  // Picked by usage count across all vendor_id-referencing tables.
  const MERGES = [
    { name: 'AARGEE STEEL INC / Aargee Steel Inc',            K: '6d663b30-cd72-4184-bc70-40f21c095f3f', L: '8aef35a0-1f51-464a-bb4f-46d849ffacca' },
    { name: 'Evergreen Engineering / EVERGREEN ENGINEERING',   K: '7454c1b0-202e-48e1-8a89-bd0037f19062', L: 'd2c6af7b-c780-4e33-af43-007d38bcfcb6' },
    { name: 'Faczo Tech Private Limited (x2)',                 K: 'aeef808f-bf51-43c8-a212-ba43bcc0844a', L: '9bbc234b-f2c6-41e3-83b6-4c803718bdf6' },
    { name: 'Goodwill Hardware Mart / GOODWILL HARDWARE MART', K: '47ca8cc5-41c9-411d-a599-da975f97e81f', L: 'a713b9fe-b491-4a17-8a9a-d1c2a46da8db' },
    { name: 'Power Tools & Tackles (x2)',                      K: '7d7133f1-355b-4ea6-8486-3a24a281db80', L: 'ce985fef-ed3d-43c7-888b-f852cb7fe895' },
    { name: 'SCP Concrete (x2)',                               K: 'd76dd8e1-98f2-4571-9c0b-1b59d9810b67', L: '1ed88959-5419-47ee-8a07-1728241733f0' },
    { name: 'SM Stone Crusher / SM STONE CRUSHER',             K: '4c392d01-f3a2-4ddb-aae5-69507cfd3cf8', L: '5456ea5a-7a65-47b4-9c95-a7d50f5a3595' },
    { name: 'Super King Earth Movers (x2)',                    K: '2f295658-52bb-4b50-96e8-92ed3acc3e71', L: '93b06e11-cdcd-4531-94a4-14df0d43d1fd' },
    { name: 'Trinity press / Trinity Press',                   K: 'fb7aaca7-c0b6-431c-9368-13bf1abc46b2', L: 'd1dadff6-d71e-4ca6-8a54-1b05ab60024f' },
  ];
  // Only tables that showed non-zero refs on any loser id during investigation.
  const MERGE_TABLES = ['ign', 'project_vendors', 'purchase_orders', 'tqs_bills'];

  // Bills whose vendor_name is a genuine typo (not just whitespace/case) with
  // no vendor-master match at all — confirmed manually against the vendor list.
  const ORPHAN_LINKS = [
    { vendor_name: 'Pragati Road Lines',      vendor_id: 'd8f50eb0-009e-4b44-931d-9512095c9d78' },
    { vendor_name: 'Power Tools and Tackles', vendor_id: '7d7133f1-355b-4ea6-8486-3a24a281db80' },
    { vendor_name: 'Faczo Tech Pvt  Ltd',     vendor_id: 'aeef808f-bf51-43c8-a212-ba43bcc0844a' },
    { vendor_name: 'Alufort Enetrprises',     vendor_id: '9b82a9f4-e304-49f5-a7f9-3d286291aadc' },
  ];

  for (const m of MERGES) {
    // project_vendors has PK(project_id, vendor_id) — drop loser rows that would
    // collide with an existing keeper row for the same project first.
    await query(
      `DELETE FROM project_vendors WHERE vendor_id = $2
         AND project_id IN (SELECT project_id FROM project_vendors WHERE vendor_id = $1)`,
      [m.K, m.L]
    );
    for (const t of MERGE_TABLES) {
      await query(`UPDATE ${t} SET vendor_id = $1 WHERE vendor_id = $2`, [m.K, m.L]);
    }
    await query(
      `UPDATE vendors SET is_active = false,
              notes = COALESCE(notes,'') || E'\\n[Merged into vendor ${m.K} — duplicate cleanup 2026-07-21]',
              updated_at = NOW()
       WHERE id = $1`,
      [m.L]
    );
    console.log(`[migration] merged duplicate vendor "${m.name}" (${m.L} → ${m.K})`);
  }

  const backfill = await query(`
    UPDATE tqs_bills b
    SET vendor_id = v.id, updated_at = NOW()
    FROM vendors v
    WHERE b.vendor_id IS NULL
      AND b.is_deleted = FALSE
      AND v.company_id = b.company_id
      AND v.is_active = true
      AND regexp_replace(LOWER(v.name), '\\s+', '', 'g') = regexp_replace(LOWER(b.vendor_name), '\\s+', '', 'g')
  `);
  console.log(`[migration] Backfilled vendor_id on ${backfill.rowCount} bill(s) via normalized name match`);

  for (const o of ORPHAN_LINKS) {
    const r = await query(
      `UPDATE tqs_bills SET vendor_id = $1, updated_at = NOW()
       WHERE vendor_name = $2 AND vendor_id IS NULL AND is_deleted = FALSE`,
      [o.vendor_id, o.vendor_name]
    );
    console.log(`[migration] Linked "${o.vendor_name}" → vendor ${o.vendor_id}: ${r.rowCount} bill(s)`);
  }
});

// ── One-time: fix two WO-reference typos found during the WO-bill audit ──
// These bills carry a wo_number that matches no real work_orders row, so they
// were unpickable from the QS cert PO/WO dropdown (which only lists real WOs)
// no matter which WO the certifier selected. Both are unambiguous — vendor
// matches exactly one WO whose number differs by a single-character typo.
// Two other similarly-broken bills (WO-415, WO-427) were left untouched
// because the vendor has multiple WOs and it isn't clear which one they
// belong to — needs a human decision, not a guess.
runSchemaInit('fix_wo_reference_typos_2026_07', async () => {
  const FIXES = [
    { sl_number: 'WO-408', from: 'WOTQS10-a1', to: 'WOTQS010-A1' },
    { sl_number: 'WO-413', from: 'WOTQS035',   to: 'WODQS035' },
  ];
  for (const f of FIXES) {
    const r = await query(
      `UPDATE tqs_bills SET wo_number = $1, updated_at = NOW()
       WHERE sl_number = $2 AND wo_number = $3`,
      [f.to, f.sl_number, f.from]
    );
    console.log(`[migration] ${f.sl_number}: wo_number "${f.from}" → "${f.to}" (${r.rowCount} row updated)`);
  }
});

// ── One-time: revert bulk-imported payment data on Residential Apartments -
// Yelahanka bills so accounts can re-record the correct amount/date and
// reconcile against QS records. Verified before running: none of these 111
// bills' paid_amount is backed by a real `payments` (Finance) row or journal
// entry — it was set directly on tqs_bill_updates, most likely during the
// original Excel import — so this is a clean revert with no ledger/cash-flow
// side effects to unwind. QS certification data (certified amount, RA
// number, dates) is untouched; only payment fields are cleared.
runSchemaInit('revert_yelahanka_bill_payments_2026_07', async () => {
  const YELAHANKA_PROJECTS = [
    'a30adb9c-3511-4149-9017-bdc6150133c0',
    '593273cf-721f-42f1-9178-53dca3e71caa',
  ];

  const clearedUpdates = await query(`
    UPDATE tqs_bill_updates u
    SET paid_amount = 0,
        balance_to_pay = COALESCE(u.certified_net, 0),
        payment_status = NULL,
        payment_date = NULL,
        payment_mode = NULL,
        reference_number = NULL,
        bank_name = NULL,
        updated_at = NOW()
    FROM tqs_bills b
    WHERE b.id = u.bill_id
      AND b.project_id = ANY($1::uuid[])
      AND b.is_deleted = FALSE
      AND COALESCE(u.paid_amount, 0) > 0
  `, [YELAHANKA_PROJECTS]);
  console.log(`[migration] Cleared payment fields on ${clearedUpdates.rowCount} tqs_bill_updates row(s) for Yelahanka`);

  const revertedBills = await query(`
    UPDATE tqs_bills b
    SET workflow_status = 'accounts', updated_at = NOW()
    FROM tqs_bill_updates u
    WHERE u.bill_id = b.id
      AND b.project_id = ANY($1::uuid[])
      AND b.is_deleted = FALSE
      AND b.workflow_status = 'paid'
      AND COALESCE(u.paid_amount, 0) = 0
  `, [YELAHANKA_PROJECTS]);
  console.log(`[migration] Reverted workflow_status 'paid' → 'accounts' on ${revertedBills.rowCount} bill(s) for Yelahanka`);
});

// ── One-time: move Residential Apartments - Yelahanka bills stuck at
// 'accounts' back to 'qs' — none of them were ever actually QS-certified
// (qs_certified_date NULL, no active certification link on any of them),
// same bulk-import pattern as the payment data reverted above. Sends them
// back to QS so they go through real certification instead of skipping it.
runSchemaInit('reset_yelahanka_uncertified_accounts_to_qs_2026_07', async () => {
  const YELAHANKA_PROJECTS = [
    'a30adb9c-3511-4149-9017-bdc6150133c0',
    '593273cf-721f-42f1-9178-53dca3e71caa',
  ];

  const moved = await query(`
    UPDATE tqs_bills b
    SET workflow_status = 'qs', updated_at = NOW()
    FROM tqs_bill_updates u
    WHERE u.bill_id = b.id
      AND b.project_id = ANY($1::uuid[])
      AND b.is_deleted = FALSE
      AND b.workflow_status = 'accounts'
      AND u.qs_certified_date IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM vendor_qs_certification_bills cb
        JOIN vendor_qs_certifications vc ON vc.id = cb.certification_id
        WHERE cb.bill_id = b.id AND vc.status NOT IN ('cancelled', 'rejected')
      )
  `, [YELAHANKA_PROJECTS]);
  console.log(`[migration] Moved ${moved.rowCount} uncertified bill(s) from 'accounts' → 'qs' for Yelahanka`);
});

// ── One-time: link 205 orphaned SCP Concrete bills to Yelahanka, then apply
// the same payment-revert + accounts→qs treatment already done above.
// These bills had project_id=NULL entirely, so they were invisible to every
// project-scoped fix so far — found only because "All Projects" showed 301
// active SCP Concrete bills but just 71 tagged to Yelahanka. All 205
// reference PO POTQS001 (or its amendments -A1/-A3/-A4), which the real
// purchase_orders record confirms belongs to Residential Apartments -
// Yelahanka (Retaining Wall & STP) — same vendor, same PO family already
// linked for the other 71 bills. Verified: none of the 205 have a real
// qs_certified_date, an active certification link, or a Finance payments
// row backing their paid_amount — identical bulk-import pattern.
runSchemaInit('link_orphaned_scp_concrete_bills_to_yelahanka_2026_07', async () => {
  const YELAHANKA_RW_STP = '593273cf-721f-42f1-9178-53dca3e71caa';
  const SCP_PO_NUMBERS = ['POTQS001', 'POTQS001-A1', 'POTQS001-A3', 'POTQS001-A4'];

  const linked = await query(`
    UPDATE tqs_bills b
    SET project_id = $1, updated_at = NOW()
    FROM vendors v
    WHERE b.vendor_id = v.id
      AND v.name ILIKE '%SCP Concrete%'
      AND b.project_id IS NULL
      AND b.is_deleted = FALSE
      AND b.po_number = ANY($2::text[])
  `, [YELAHANKA_RW_STP, SCP_PO_NUMBERS]);
  console.log(`[migration] Linked ${linked.rowCount} orphaned SCP Concrete bill(s) to Yelahanka (Retaining Wall & STP)`);

  const clearedUpdates = await query(`
    UPDATE tqs_bill_updates u
    SET paid_amount = 0,
        balance_to_pay = COALESCE(u.certified_net, 0),
        payment_status = NULL,
        payment_date = NULL,
        payment_mode = NULL,
        reference_number = NULL,
        bank_name = NULL,
        updated_at = NOW()
    FROM tqs_bills b
    WHERE b.id = u.bill_id
      AND b.project_id = $1
      AND b.is_deleted = FALSE
      AND COALESCE(u.paid_amount, 0) > 0
      AND u.qs_certified_date IS NULL
  `, [YELAHANKA_RW_STP]);
  console.log(`[migration] Cleared payment fields on ${clearedUpdates.rowCount} tqs_bill_updates row(s) (SCP Concrete linkage)`);

  const revertedBills = await query(`
    UPDATE tqs_bills b
    SET workflow_status = 'accounts', updated_at = NOW()
    FROM tqs_bill_updates u
    WHERE u.bill_id = b.id
      AND b.project_id = $1
      AND b.is_deleted = FALSE
      AND b.workflow_status = 'paid'
      AND COALESCE(u.paid_amount, 0) = 0
  `, [YELAHANKA_RW_STP]);
  console.log(`[migration] Reverted workflow_status 'paid' → 'accounts' on ${revertedBills.rowCount} bill(s) (SCP Concrete linkage)`);

  const moved2 = await query(`
    UPDATE tqs_bills b
    SET workflow_status = 'qs', updated_at = NOW()
    FROM tqs_bill_updates u
    WHERE u.bill_id = b.id
      AND b.project_id = $1
      AND b.is_deleted = FALSE
      AND b.workflow_status = 'accounts'
      AND u.qs_certified_date IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM vendor_qs_certification_bills cb
        JOIN vendor_qs_certifications vc ON vc.id = cb.certification_id
        WHERE cb.bill_id = b.id AND vc.status NOT IN ('cancelled', 'rejected')
      )
  `, [YELAHANKA_RW_STP]);
  console.log(`[migration] Moved ${moved2.rowCount} uncertified bill(s) from 'accounts' → 'qs' (SCP Concrete linkage)`);
});

// ── One-time: DQS Towers — link all 28 SCP Concrete bills to PO PODQSMB007
// and move the 6 'accounts'-stage bills back to 'qs'. PODQSMB007 confirmed
// as a real purchase_orders row for DQS Towers / SCP Concrete (grand_total
// ₹17,58,933.75), well above the ₹7,44,362 these 28 bills total, so there's
// headroom for the full set under one PO. Unlike the Yelahanka bulk-import
// bills, these were never marked 'paid' — still pending/accounts, no
// reversal needed, just linking + workflow correction.
runSchemaInit('link_dqs_towers_scp_concrete_to_po_2026_07', async () => {
  const DQS_TOWERS = '8bf8a91c-f64c-478a-b6f2-39ed621d9436';

  const linked = await query(`
    UPDATE tqs_bills b
    SET po_number = 'PODQSMB007', updated_at = NOW()
    FROM vendors v
    WHERE b.vendor_id = v.id
      AND v.name ILIKE '%SCP Concrete%'
      AND b.project_id = $1
      AND b.is_deleted = FALSE
      AND COALESCE(b.po_number, '') <> 'PODQSMB007'
  `, [DQS_TOWERS]);
  console.log(`[migration] Linked ${linked.rowCount} DQS Towers SCP Concrete bill(s) to PO PODQSMB007`);

  const moved = await query(`
    UPDATE tqs_bills b
    SET workflow_status = 'qs', updated_at = NOW()
    FROM vendors v
    WHERE b.vendor_id = v.id
      AND v.name ILIKE '%SCP Concrete%'
      AND b.project_id = $1
      AND b.is_deleted = FALSE
      AND b.workflow_status = 'accounts'
  `, [DQS_TOWERS]);
  console.log(`[migration] Moved ${moved.rowCount} DQS Towers SCP Concrete bill(s) from 'accounts' → 'qs'`);
});

// ── One-time: merge duplicate vendor "Maharani Constrcutions" (typo) into
// "Maharani Constructions" (correct spelling). Missed by the earlier
// duplicate-vendor cleanup because the two names differ by more than
// whitespace/case, so normalized-name matching didn't flag them as the same
// vendor. The typo'd record has zero real POs/WOs of its own; 4 tqs_bills
// rows were linked to it even though their own WO references (WOTQS032,
// WOTQS019) belong to the correctly-spelled vendor.
runSchemaInit('merge_maharani_constrcutions_typo_2026_07', async () => {
  const KEEPER = '291370c3-fa9f-4173-b3f7-159a0ea2c7eb'; // Maharani Constructions (correct)
  const LOSER  = 'dde599db-d2f7-47bc-be40-fb4506aff93c';  // Maharani Constrcutions (typo)

  const relinked = await query(
    `UPDATE tqs_bills SET vendor_id = $1, vendor_name = 'Maharani Constructions', updated_at = NOW() WHERE vendor_id = $2`,
    [KEEPER, LOSER]
  );
  console.log(`[migration] Relinked ${relinked.rowCount} bill(s) from typo'd "Maharani Constrcutions" to "Maharani Constructions"`);

  await query(
    `UPDATE vendors SET is_active = false,
            notes = COALESCE(notes,'') || E'\\n[Merged into vendor ${KEEPER} — typo duplicate cleanup 2026-07-22]',
            updated_at = NOW()
     WHERE id = $1`,
    [LOSER]
  );
  console.log(`[migration] Deactivated duplicate vendor ${LOSER} (Maharani Constrcutions)`);
});

// ── One-time: LANCO Hills (LH-10) — reconcile 6 bills whose Bill Tracker
// stage disagreed with their QS certification status. Investigated
// individually (see conversation): 4 bills already show a real payment
// (date/amount/mode) on tqs_bill_updates but their certification record
// never advanced to 'paid'; P0-395's net_payable=0 is correct (fully
// recovered against a prior advance, not a bug) so both cert and bill
// move straight to paid/settled; WO-480 is genuinely still unpaid, so only
// its bill stage catches up to the certification's 'accounts' stage.
runSchemaInit('lanco_lh10_bill_cert_stage_reconcile_2026_07', async () => {
  // 1) Certs with a real recorded payment that never flipped to 'paid'.
  const PAID_CERTS = [
    { cert_number: 'P25/PO04/5676/SVBI',  paid_amount: 135582,   payment_date: '2026-07-06', payment_mode: null },
    { cert_number: 'P25/PO03/5675/SVR',   paid_amount: 115581,   payment_date: '2026-07-06', payment_mode: null },
    { cert_number: 'P26/PO05/5686/SBBMS', paid_amount: 62885.56, payment_date: '2026-07-14', payment_mode: 'RTGS' },
    { cert_number: 'P25/WO08/5718/KSU',   paid_amount: 167300,   payment_date: '2026-07-19', payment_mode: null },
  ];
  for (const p of PAID_CERTS) {
    const r = await query(
      `UPDATE vendor_qs_certifications
       SET status='paid', paid_amount=$1, payment_date=$2, payment_mode=COALESCE($3, payment_mode), paid_at=NOW(), updated_at=NOW()
       WHERE cert_number=$4 AND status<>'paid'`,
      [p.paid_amount, p.payment_date, p.payment_mode, p.cert_number]
    );
    console.log(`[migration] ${p.cert_number}: cert status → paid (${r.rowCount} row updated)`);
  }

  // 2) P0-395 (P25/PO07/5717/KCPL) — net_payable=0, fully settled via advance
  // recovery. Mark both the cert and the bill as fully paid/settled.
  const kcpl = await query(
    `UPDATE vendor_qs_certifications SET status='paid', paid_amount=0, paid_at=NOW(), updated_at=NOW()
     WHERE cert_number='P25/PO07/5717/KCPL' AND status<>'paid'`
  );
  const kcplBill = await query(
    `UPDATE tqs_bills SET workflow_status='paid', updated_at=NOW() WHERE sl_number='P0-395'`
  );
  await query(
    `UPDATE tqs_bill_updates SET payment_status='paid', updated_at=NOW()
     WHERE bill_id = (SELECT id FROM tqs_bills WHERE sl_number='P0-395')`
  );
  console.log(`[migration] P25/PO07/5717/KCPL (P0-395): cert → paid (${kcpl.rowCount}), bill → paid (${kcplBill.rowCount}), settled via advance recovery`);

  // 3) WO-480 (P25/WO09/5722/SUR) — genuinely still unpaid; only the bill's
  // stage needs to catch up to its certification's 'accounts' stage.
  const wo480 = await query(
    `UPDATE tqs_bills SET workflow_status='accounts', updated_at=NOW() WHERE sl_number='WO-480' AND workflow_status<>'accounts'`
  );
  console.log(`[migration] WO-480: bill stage 'procurement' → 'accounts' (${wo480.rowCount} row updated)`);
});

// ── One-time: WO-480 (P25/WO09/5722/SUR) was subsequently paid directly in
// Bill Tracker (₹1,64,604 RTGS on 2026-07-19), but the certification never
// caught up — this was the reverse (bill→cert) half of the sync gap; the
// forward (cert→bill) direction was already fixed in PATCH /:id/status and
// this reverse direction is now fixed in tqs-bills.routes.js's
// PATCH /:id/payment. This is the one-off catch-up for the already-paid bill.
runSchemaInit('sukkali_ramesh_wo480_cert_paid_catchup_2026_07', async () => {
  const r = await query(
    `UPDATE vendor_qs_certifications
     SET status='paid', paid_amount=164604, payment_date='2026-07-19', payment_mode='RTGS', paid_at=NOW(), updated_at=NOW()
     WHERE cert_number='P25/WO09/5722/SUR' AND status<>'paid'`
  );
  console.log(`[migration] P25/WO09/5722/SUR (WO-480): cert status → paid (${r.rowCount} row updated)`);
});

module.exports = router;
