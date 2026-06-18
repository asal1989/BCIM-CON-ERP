// src/routes/po.routes.js
const express = require('express');
const multer = require('multer');
const { authenticate } = require('../middleware/auth');
const { loadProjectScope, userCanAccessProject } = require('../middleware/projectScope');
const { query, withTransaction } = require('../config/database');
const { extractPO } = require('../services/poExtraction.service');
const { getNextDqsNumber } = require('../services/documentNumber.service');
const { sendMail } = require('../services/mail.service');
const wa = require('../services/whatsapp.service');
const { notifyPoCreated, notifyPoRejected, notifyPoApproved } = require('../services/notif.helper');
const { runSchemaInit } = require('../utils/schemaInit');
const router = express.Router();

// Ensure columns referenced on PO create exist on older databases
runSchemaInit('purchase_orders_columns', async () => {
  await query(`
    ALTER TABLE purchase_orders
      ADD COLUMN IF NOT EXISTS mrs_id UUID REFERENCES material_requisitions(id),
      ADD COLUMN IF NOT EXISTS mrs_ids UUID[],
      ADD COLUMN IF NOT EXISTS po_ref_no VARCHAR(100),
      ADD COLUMN IF NOT EXISTS po_req_no VARCHAR(100),
      ADD COLUMN IF NOT EXISTS po_req_date DATE,
      ADD COLUMN IF NOT EXISTS approval_no VARCHAR(100),
      ADD COLUMN IF NOT EXISTS delivery_address TEXT,
      ADD COLUMN IF NOT EXISTS order_intro TEXT,
      ADD COLUMN IF NOT EXISTS payment_terms TEXT,
      ADD COLUMN IF NOT EXISTS tcs_amount NUMERIC(15,2) DEFAULT 0,
      ADD COLUMN IF NOT EXISTS department TEXT,
      ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'INR',
      ADD COLUMN IF NOT EXISTS billing_address TEXT,
      ADD COLUMN IF NOT EXISTS freight_mode TEXT,
      ADD COLUMN IF NOT EXISTS transport_mode TEXT,
      ADD COLUMN IF NOT EXISTS tax_type TEXT DEFAULT 'intra',
      ADD COLUMN IF NOT EXISTS freight_charges NUMERIC(15,2) DEFAULT 0,
      ADD COLUMN IF NOT EXISTS loading_unloading_charges NUMERIC(15,2) DEFAULT 0,
      ADD COLUMN IF NOT EXISTS insurance_charges NUMERIC(15,2) DEFAULT 0,
      ADD COLUMN IF NOT EXISTS tds_percent NUMERIC(6,2) DEFAULT 0,
      ADD COLUMN IF NOT EXISTS internal_remarks TEXT,
      ADD COLUMN IF NOT EXISTS delivery_instructions TEXT
  `);
  await query(`ALTER TABLE po_items ADD COLUMN IF NOT EXISTS mrs_item_id UUID`);
  await query(`ALTER TABLE po_items ADD COLUMN IF NOT EXISTS item_code TEXT`);
  await query(`ALTER TABLE po_items ADD COLUMN IF NOT EXISTS discount_pct NUMERIC(6,2) DEFAULT 0`);
  // Allow long material descriptions (was VARCHAR(200) ≈ 30 words) — widen to TEXT
  try { await query(`ALTER TABLE po_items ALTER COLUMN material_name TYPE TEXT`); } catch (_) {}
});

// Idempotent backfill (re-runs every boot): stamp po_items.mrs_item_id for PO
// lines that were created before item-level MR tracking existed (or typed in
// manually) but whose PO is header-linked to an MR. We match on a normalized
// material name (lowercase, strip every non-alphanumeric char), and tolerate a
// PO name that STARTS WITH the MR name — buyers often append a spec suffix on
// the PO (e.g. MR "2.5 sqmm x 3 core flexible cable" → PO "...cable - 100mtr
// Coil"), which an exact match would miss. Once stamped, the MR "balance" calc
// uses the reliable direct join instead of name matching, so a material whose
// PO was already raised can never reappear on a new PO. Only links when the
// prefix maps to exactly ONE MR item (avoids mis-attributing when a single MR
// legitimately repeats a material name).
runSchemaInit('po_items_mrs_item_backfill', async () => {
  await query(`
    UPDATE po_items poi
    SET mrs_item_id = sub.mi_id
    FROM (
      SELECT poi2.id AS poi_id, MIN(mi.id::text)::uuid AS mi_id
      FROM po_items poi2
      JOIN purchase_orders po ON po.id = poi2.po_id
      JOIN mrs_items mi
        ON (mi.mrs_id = po.mrs_id OR mi.mrs_id = ANY(po.mrs_ids))
       AND regexp_replace(lower(trim(poi2.material_name)), '[^a-z0-9]+', '', 'g')
           LIKE regexp_replace(lower(trim(mi.material_name)), '[^a-z0-9]+', '', 'g') || '%'
      WHERE poi2.mrs_item_id IS NULL
        AND po.status NOT IN ('rejected', 'cancelled')
        AND (po.mrs_id IS NOT NULL OR po.mrs_ids IS NOT NULL)
      GROUP BY poi2.id
      HAVING COUNT(DISTINCT mi.id) = 1
    ) sub
    WHERE poi.id = sub.poi_id AND poi.mrs_item_id IS NULL
  `);
});

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const esc = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const parseEmails = (value) => {
  if (Array.isArray(value)) return value.map(v => String(v || '').trim()).filter(Boolean);
  return String(value || '').split(',').map(v => v.trim()).filter(Boolean);
};

const inrMail = (value) => `Rs ${Number(value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function applyProjectScope(req, sqlParts, params, alias = 'po', requestedProjectId = null) {
  if (requestedProjectId && String(requestedProjectId).trim()) {
    if (!userCanAccessProject(req, requestedProjectId)) {
      const err = new Error('Access denied for this project.');
      err.statusCode = 403;
      throw err;
    }
    params.push(requestedProjectId);
    sqlParts.push(`${alias}.project_id = $${params.length}`);
    return;
  }
  if (req.isGlobalRole) return;
  const allowed = req.allowedProjectIds || [];
  if (!allowed.length) {
    sqlParts.push('FALSE');
    return;
  }
  params.push(allowed);
  sqlParts.push(`${alias}.project_id = ANY($${params.length}::uuid[])`);
}

async function getAccessiblePo(req, poId) {
  const { rows } = await query(
    `SELECT po.id, po.project_id, po.status, p.company_id
     FROM purchase_orders po
     JOIN projects p ON po.project_id = p.id
     WHERE po.id = $1`,
    [poId]
  );
  const po = rows[0];
  if (!po || po.company_id !== req.user.company_id) {
    const err = new Error('Purchase Order not found');
    err.statusCode = 404;
    throw err;
  }
  if (!userCanAccessProject(req, po.project_id)) {
    const err = new Error('Access denied for this project.');
    err.statusCode = 403;
    throw err;
  }
  return po;
}

let poMailSchemaReady = false;
async function ensurePoMailSchema() {
  if (poMailSchemaReady) return;
  await query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);
  await query(`
    CREATE TABLE IF NOT EXISTS po_mail_logs (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      po_id UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
      company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      sent_by UUID REFERENCES users(id) ON DELETE SET NULL,
      to_emails TEXT[] DEFAULT ARRAY[]::TEXT[],
      cc_emails TEXT[] DEFAULT ARRAY[]::TEXT[],
      subject TEXT,
      body_html TEXT,
      status VARCHAR(30) DEFAULT 'pending',
      provider TEXT,
      error TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await query(`
    ALTER TABLE purchase_orders
      ADD COLUMN IF NOT EXISTS po_sent_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS po_sent_by UUID,
      ADD COLUMN IF NOT EXISTS po_sent_to TEXT[] DEFAULT ARRAY[]::TEXT[],
      ADD COLUMN IF NOT EXISTS po_sent_cc TEXT[] DEFAULT ARRAY[]::TEXT[]
  `);
  poMailSchemaReady = true;
}

async function getPoDetailsForMail(req) {
  const po = await query(
    `SELECT po.*, v.name as vendor_name, v.address AS vendor_address,
            v.city AS vendor_city, v.state AS vendor_state, v.pincode AS vendor_pincode,
            v.gstin AS vendor_gstin,
            v.email AS vendor_email, v.contact_person AS vendor_contact_person, v.phone AS vendor_phone,
            p.name as project_name, p.project_code, p.company_id,
            c.name AS company_name, c.email AS company_email, c.phone AS company_phone, c.address AS company_address,
            u.name AS created_by_name, u.email AS created_by_email
     FROM purchase_orders po
     JOIN vendors v ON po.vendor_id = v.id
     JOIN projects p ON po.project_id = p.id
     JOIN companies c ON p.company_id = c.id
     JOIN users u ON po.created_by = u.id
     WHERE po.id = $1`,
    [req.params.id]
  );
  if (!po.rows.length || po.rows[0].company_id !== req.user.company_id) return null;
  const items = await query(`SELECT * FROM po_items WHERE po_id = $1 ORDER BY sort_order`, [req.params.id]);
  const logs = await query(`SELECT * FROM po_mail_logs WHERE po_id = $1 ORDER BY created_at DESC LIMIT 10`, [req.params.id]);
  return { ...po.rows[0], items: items.rows, mail_logs: logs.rows };
}

function buildPOMail({ po, subject, body }) {
  const poNo = po.po_ref_no || po.po_number || po.serial_no_formatted || 'Purchase Order';
  const verifyUrl = `${process.env.PUBLIC_APP_URL || process.env.FRONTEND_URL || 'http://bcim.ddns.net:3000'}/api/v1/purchase-orders/public/verify/${po.id}`;
  const itemRows = (po.items || []).map((it, idx) => {
    const qty = Number(it.quantity || 0);
    const rate = Number(it.rate || 0);
    const gst = Number(it.gst_rate || 0);
    const basic = qty * rate;
    const gstAmt = basic * gst / 100;
    const total = Number(it.total_amount || 0) || basic + gstAmt;
    return `
      <tr>
        <td style="padding:8px;border:1px solid #d9e2ef;text-align:center">${idx + 1}</td>
        <td style="padding:8px;border:1px solid #d9e2ef">${esc(it.material_name)}</td>
        <td style="padding:8px;border:1px solid #d9e2ef;text-align:center">${esc(it.unit)}</td>
        <td style="padding:8px;border:1px solid #d9e2ef;text-align:right">${qty.toLocaleString('en-IN')}</td>
        <td style="padding:8px;border:1px solid #d9e2ef;text-align:right">${inrMail(rate)}</td>
        <td style="padding:8px;border:1px solid #d9e2ef;text-align:right">${inrMail(total)}</td>
      </tr>`;
  }).join('');

  const text = [
    `Dear ${po.vendor_contact_person || 'Sir/Madam'},`,
    '',
    body || `Please find below Purchase Order ${poNo} for your reference and necessary action.`,
    '',
    `Project: ${po.project_name || '-'}`,
    `PO No: ${poNo}`,
    `PO Date: ${po.po_date || '-'}`,
    `Total Amount: ${inrMail(po.grand_total)}`,
    '',
    'Kindly acknowledge receipt of this purchase order and confirm the delivery schedule.',
    '',
    'Regards,',
    'BCIM Engineering Pvt Ltd',
  ].join('\n');

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:760px;margin:0 auto;color:#0f172a">
      <div style="background:#0a2057;color:white;padding:18px 22px;border-radius:8px 8px 0 0">
        <h2 style="margin:0;font-size:19px">Purchase Order ${esc(poNo)}</h2>
        <p style="margin:4px 0 0;font-size:13px;color:#dbeafe">${esc(po.project_name || '')}</p>
      </div>
      <div style="border:1px solid #d9e2ef;border-top:0;padding:22px;border-radius:0 0 8px 8px;background:#fff">
        <p>Dear <strong>${esc(po.vendor_contact_person || po.vendor_name || 'Sir/Madam')}</strong>,</p>
        <p>${esc(body || `Please find below Purchase Order ${poNo} for your reference and necessary action.`).replace(/\n/g, '<br>')}</p>
        <table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:13px">
          <tr><td style="padding:7px;border:1px solid #d9e2ef;background:#f8fafc;font-weight:700">Vendor</td><td style="padding:7px;border:1px solid #d9e2ef">${esc(po.vendor_name)}</td></tr>
          <tr><td style="padding:7px;border:1px solid #d9e2ef;background:#f8fafc;font-weight:700">Project</td><td style="padding:7px;border:1px solid #d9e2ef">${esc(po.project_name)}</td></tr>
          <tr><td style="padding:7px;border:1px solid #d9e2ef;background:#f8fafc;font-weight:700">PO Date</td><td style="padding:7px;border:1px solid #d9e2ef">${esc(po.po_date || '-')}</td></tr>
          <tr><td style="padding:7px;border:1px solid #d9e2ef;background:#f8fafc;font-weight:700">Grand Total</td><td style="padding:7px;border:1px solid #d9e2ef;font-weight:700">${inrMail(po.grand_total)}</td></tr>
        </table>
        <h3 style="font-size:14px;margin:18px 0 8px">Line Items</h3>
        <table style="width:100%;border-collapse:collapse;font-size:12px">
          <thead>
            <tr style="background:#eef4ff">
              <th style="padding:8px;border:1px solid #d9e2ef">#</th>
              <th style="padding:8px;border:1px solid #d9e2ef;text-align:left">Description</th>
              <th style="padding:8px;border:1px solid #d9e2ef">Unit</th>
              <th style="padding:8px;border:1px solid #d9e2ef;text-align:right">Qty</th>
              <th style="padding:8px;border:1px solid #d9e2ef;text-align:right">Rate</th>
              <th style="padding:8px;border:1px solid #d9e2ef;text-align:right">Amount</th>
            </tr>
          </thead>
          <tbody>${itemRows || '<tr><td colspan="6" style="padding:12px;border:1px solid #d9e2ef;text-align:center;color:#64748b">No line items</td></tr>'}</tbody>
        </table>
        <p style="margin-top:18px">Kindly acknowledge receipt of this purchase order and confirm the delivery schedule.</p>
        <p style="font-size:12px;color:#64748b">ERP verification link: <a href="${verifyUrl}">${verifyUrl}</a></p>
        <p style="margin-bottom:0">Regards,<br><strong>BCIM Engineering Pvt Ltd</strong><br>Procurement Department</p>
      </div>
    </div>`;

  return { subject, html, text };
}

// Public Verification Endpoint (No Auth required for QR scanning)
router.get('/public/verify/:id', async (req, res) => {
  try {
    const po = await query(
      `SELECT po.*, v.name as vendor_name, v.address AS vendor_address,
              v.city AS vendor_city, v.state AS vendor_state, v.pincode AS vendor_pincode,
              v.gstin AS vendor_gstin,
              v.email AS vendor_email, v.contact_person AS vendor_contact_person, v.phone AS vendor_phone,
              p.name as project_name, p.project_code,
              u.name AS created_by_name, u.signature_url AS created_by_sig,
              aud.name AS verified_audit_name, aud.signature_url AS verified_audit_sig,
              fin.name AS checked_finance_name, fin.signature_url AS checked_finance_sig,
              mgmt.name AS released_mgmt_name, mgmt.signature_url AS released_mgmt_sig,
              md.name AS authorized_md_name, md.signature_url AS authorized_md_sig
       FROM purchase_orders po
       JOIN vendors v ON po.vendor_id = v.id
       JOIN projects p ON po.project_id = p.id
       JOIN users u ON po.created_by = u.id
       LEFT JOIN users aud ON po.verified_procurement_by = aud.id
       LEFT JOIN users fin ON po.checked_finance_by = fin.id
       LEFT JOIN users mgmt ON po.released_mgmt_by = mgmt.id
       LEFT JOIN users md ON po.authorized_md_by = md.id
       WHERE po.id = $1`,
      [req.params.id]
    );
    if (!po.rows.length) return res.status(404).json({ error: 'Purchase Order not found' });
    
    const items = await query(
      `SELECT * FROM po_items WHERE po_id = $1 ORDER BY sort_order`,
      [req.params.id]
    );
    res.json({ data: { ...po.rows[0], items: items.rows } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.use(authenticate);
router.use(loadProjectScope);

// GET /purchase-orders
router.get('/', async (req, res) => {
  try {
    const { project_id, status } = req.query;
    const conditions = ['p.company_id = $1'];
    const params = [req.user.company_id];
    applyProjectScope(req, conditions, params, 'po', project_id);
    let sql = `
      WITH recv AS (
        SELECT gi.po_item_id, SUM(gi.quantity_received) AS qty
        FROM grn_items gi
        JOIN grn g ON g.id = gi.grn_id
        WHERE g.quality_status NOT IN ('rejected')
        GROUP BY gi.po_item_id
      ),
      po_rcv AS (
        SELECT
          poi.po_id,
          COUNT(*) AS items_total,
          COUNT(*) FILTER (WHERE COALESCE(r.qty, 0) >= poi.quantity) AS items_received
        FROM po_items poi
        LEFT JOIN recv r ON r.po_item_id = poi.id
        GROUP BY poi.po_id
      )
      SELECT po.*, v.name AS vendor_name, p.name AS project_name,
             COALESCE(rc.items_total, 0)    AS items_total,
             COALESCE(rc.items_received, 0) AS items_received
      FROM purchase_orders po
      JOIN vendors v ON po.vendor_id = v.id
      JOIN projects p ON po.project_id = p.id
      LEFT JOIN po_rcv rc ON rc.po_id = po.id
      WHERE ${conditions.join(' AND ')}`;
    let i = params.length + 1;
    if (status)     { sql += ` AND po.status = $${i++}`;     params.push(status); }
    sql += ' ORDER BY po.created_at DESC';
    const result = await query(sql, params);
    res.json({ data: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /purchase-orders/register — PO Register for a project
router.get('/register', async (req, res) => {
  try {
    const { project_id, from, to } = req.query;
    if (!project_id) return res.status(400).json({ error: 'project_id required' });
    if (!userCanAccessProject(req, project_id)) {
      return res.status(403).json({ error: 'Access denied for this project.' });
    }

    let whereClauses = 'po.project_id = $1 AND (SELECT company_id FROM projects WHERE id = $1) = $2';
    const params = [project_id, req.user.company_id];
    let i = 3;
    if (from) { whereClauses += ` AND po.po_date >= $${i++}`; params.push(from); }
    if (to)   { whereClauses += ` AND po.po_date <= $${i++}`; params.push(to); }

    const { rows } = await query(`
      SELECT
        po.id, po.po_number, po.serial_no_formatted, po.po_date,
        v.name AS vendor_name, v.gstin AS vendor_gst,
        po.notes AS narration, po.sub_total,
        ROUND(po.total_gst / 2, 2) AS cgst_amount,
        ROUND(po.total_gst / 2, 2) AS sgst_amount,
        COALESCE(po.tcs_amount, 0) AS tcs_amount,
        po.grand_total, po.payment_terms, po.status,
        v.vendor_type AS category,
        (SELECT json_agg(
            json_build_object(
              'sort_order', i2.sort_order,
              'material_name', i2.material_name,
              'unit', i2.unit,
              'quantity', i2.quantity,
              'received_quantity', COALESCE((
                SELECT SUM(gi.quantity_received)
                FROM grn_items gi
                JOIN grn g ON g.id = gi.grn_id
                WHERE g.quality_status <> 'rejected'
                  AND (
                    gi.po_item_id = i2.id
                    OR (
                      gi.po_item_id IS NULL
                      AND g.po_id = i2.po_id
                      AND LOWER(TRIM(COALESCE(gi.material_name, ''))) = LOWER(TRIM(COALESCE(i2.material_name, '')))
                      -- Match on PO unit OR on physical_unit (thumb rule: gi.unit is always PO unit)
                      AND (
                        COALESCE(gi.unit, '') = COALESCE(i2.unit, '')
                        OR COALESCE(gi.physical_unit, '') != ''
                      )
                    )
                  )
              ), 0),
              'invoiced_quantity', COALESCE((
                SELECT SUM(li.quantity)
                FROM tqs_bill_line_items li
                JOIN tqs_bills b ON b.id = li.bill_id
                WHERE b.is_deleted = FALSE
                  AND (
                    li.po_item_id = i2.id
                    OR (
                      li.po_item_id IS NULL
                      AND b.po_id = i2.po_id
                      AND LOWER(TRIM(COALESCE(li.item_name, ''))) = LOWER(TRIM(COALESCE(i2.material_name, '')))
                      AND COALESCE(li.unit, '') = COALESCE(i2.unit, '')
                    )
                    OR (
                      li.po_item_id IS NULL
                      AND b.po_number = po.po_number
                      AND LOWER(TRIM(COALESCE(li.item_name, ''))) = LOWER(TRIM(COALESCE(i2.material_name, '')))
                      AND COALESCE(li.unit, '') = COALESCE(i2.unit, '')
                    )
                  )
              ), 0),
              'remaining_quantity', GREATEST(i2.quantity - COALESCE((
                SELECT SUM(li.quantity)
                FROM tqs_bill_line_items li
                JOIN tqs_bills b ON b.id = li.bill_id
                WHERE b.is_deleted = FALSE
                  AND (
                    li.po_item_id = i2.id
                    OR (
                      li.po_item_id IS NULL
                      AND b.po_id = i2.po_id
                      AND LOWER(TRIM(COALESCE(li.item_name, ''))) = LOWER(TRIM(COALESCE(i2.material_name, '')))
                      AND COALESCE(li.unit, '') = COALESCE(i2.unit, '')
                    )
                    OR (
                      li.po_item_id IS NULL
                      AND b.po_number = po.po_number
                      AND LOWER(TRIM(COALESCE(li.item_name, ''))) = LOWER(TRIM(COALESCE(i2.material_name, '')))
                      AND COALESCE(li.unit, '') = COALESCE(i2.unit, '')
                    )
                  )
              ), 0), 0),
              'grn_remaining_quantity', GREATEST(i2.quantity - COALESCE((
                SELECT SUM(gi.quantity_received)
                FROM grn_items gi
                JOIN grn g ON g.id = gi.grn_id
                WHERE g.quality_status <> 'rejected'
                  AND (
                    gi.po_item_id = i2.id
                    OR (
                      gi.po_item_id IS NULL
                      AND g.po_id = i2.po_id
                      AND LOWER(TRIM(COALESCE(gi.material_name, ''))) = LOWER(TRIM(COALESCE(i2.material_name, '')))
                      AND COALESCE(gi.unit, '') = COALESCE(i2.unit, '')
                    )
                  )
              ), 0), 0),
              'rate', i2.rate,
              'gst_amount', i2.gst_amount,
              'total_amount', i2.total_amount,
              'purpose', i2.purpose
            ) ORDER BY i2.sort_order
          )
          FROM po_items i2 WHERE i2.po_id = po.id
        ) AS items
      FROM purchase_orders po
      LEFT JOIN vendors v ON v.id = po.vendor_id
      WHERE ${whereClauses}
      ORDER BY po.po_date ASC, po.po_number ASC
    `, params);

    res.json({ data: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /purchase-orders/items-report — Item-wise PO lines with delivery status (across accessible projects)
router.get('/items-report', async (req, res) => {
  try {
    const { project_id, vendor_id, from, to, status } = req.query;
    const conditions = ['p.company_id = $1', `po.status NOT IN ('rejected','cancelled')`];
    const params = [req.user.company_id];
    applyProjectScope(req, conditions, params, 'po', project_id);
    let i = params.length + 1;
    if (vendor_id) { conditions.push(`po.vendor_id = $${i++}`); params.push(vendor_id); }
    if (from)      { conditions.push(`po.po_date >= $${i++}`);  params.push(from); }
    if (to)        { conditions.push(`po.po_date <= $${i++}`);  params.push(to); }
    if (status)    { conditions.push(`po.status = $${i++}`);    params.push(status); }

    const { rows } = await query(`
      SELECT
        po.id AS po_id, po.po_number, po.serial_no_formatted, po.po_date, po.delivery_date,
        po.status AS po_status,
        v.name AS vendor_name, p.name AS project_name,
        i.material_name, i.unit, i.quantity, i.rate, i.total_amount,
        COALESCE((
          SELECT SUM(gi.quantity_received)
          FROM grn_items gi
          JOIN grn g ON g.id = gi.grn_id
          WHERE g.quality_status <> 'rejected'
            AND (
              gi.po_item_id = i.id
              OR (
                gi.po_item_id IS NULL
                AND g.po_id = i.po_id
                AND LOWER(TRIM(COALESCE(gi.material_name, ''))) = LOWER(TRIM(COALESCE(i.material_name, '')))
                AND COALESCE(gi.unit, '') = COALESCE(i.unit, '')
              )
            )
        ), 0) AS received_quantity
      FROM po_items i
      JOIN purchase_orders po ON po.id = i.po_id
      JOIN vendors v ON v.id = po.vendor_id
      JOIN projects p ON p.id = po.project_id
      WHERE ${conditions.join(' AND ')}
      ORDER BY po.po_date DESC NULLS LAST, po.po_number ASC, i.sort_order ASC
    `, params);

    const data = rows.map(r => {
      const qty = parseFloat(r.quantity) || 0;
      const received = parseFloat(r.received_quantity) || 0;
      const remaining = Math.max(0, qty - received);
      return {
        ...r,
        remaining_quantity: remaining,
        delivery_status: remaining <= 0 ? 'Completed' : (received > 0 ? 'Partial' : 'Pending'),
      };
    });
    res.json({ data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /purchase-orders/register/export — Download 3-sheet Excel
router.get('/register/export', async (req, res) => {
  try {
    const { project_id, from, to } = req.query;
    if (!project_id) return res.status(400).json({ error: 'project_id required' });
    if (!userCanAccessProject(req, project_id)) {
      return res.status(403).json({ error: 'Access denied for this project.' });
    }

    const XLSX = require('xlsx');

    // Fetch project name
    const projRes = await query('SELECT name, project_code FROM projects WHERE id = $1', [project_id]);
    const projectName = projRes.rows[0]?.name || project_id;
    const projectCode = projRes.rows[0]?.project_code || '';

    // Fetch company name
    const compRes = await query(
      'SELECT name FROM companies WHERE id = (SELECT company_id FROM projects WHERE id = $1)',
      [project_id]
    );
    const companyName = compRes.rows[0]?.name || 'BCIM Engineering Private Limited';

    let whereClauses = 'po.project_id = $1 AND (SELECT company_id FROM projects WHERE id = $1) = $2';
    const params = [project_id, req.user.company_id];
    let i = 3;
    if (from) { whereClauses += ` AND po.po_date >= $${i++}`; params.push(from); }
    if (to)   { whereClauses += ` AND po.po_date <= $${i++}`; params.push(to); }

    const { rows: pos } = await query(`
      SELECT
        po.id, po.po_number, po.po_date,
        v.name AS vendor_name, v.gstin AS vendor_gst, v.vendor_type,
        po.notes AS narration, po.sub_total,
        ROUND(po.total_gst / 2, 2) AS cgst_amount,
        ROUND(po.total_gst / 2, 2) AS sgst_amount,
        COALESCE(po.tcs_amount, 0) AS tcs_amount,
        po.grand_total, po.payment_terms, po.status
      FROM purchase_orders po
      LEFT JOIN vendors v ON v.id = po.vendor_id
      WHERE ${whereClauses}
      ORDER BY po.po_date ASC, po.po_number ASC
    `, params);

    const { rows: items } = await query(`
      SELECT
        po.po_number, po.po_date,
        v.name AS vendor_name,
        i.sort_order, i.material_name, i.unit, i.quantity,
        COALESCE((
          SELECT SUM(gi.quantity_received)
          FROM grn_items gi
          JOIN grn g ON g.id = gi.grn_id
          WHERE g.quality_status <> 'rejected'
            AND (
              gi.po_item_id = i.id
              OR (
                gi.po_item_id IS NULL
                AND g.po_id = i.po_id
                AND LOWER(TRIM(COALESCE(gi.material_name, ''))) = LOWER(TRIM(COALESCE(i.material_name, '')))
                AND COALESCE(gi.unit, '') = COALESCE(i.unit, '')
              )
            )
        ), 0) AS received_quantity,
        COALESCE((
          SELECT SUM(li.quantity)
          FROM tqs_bill_line_items li
          JOIN tqs_bills b ON b.id = li.bill_id
          WHERE b.is_deleted = FALSE
            AND (
              li.po_item_id = i.id
              OR (
                li.po_item_id IS NULL
                AND b.po_id = i.po_id
                AND LOWER(TRIM(COALESCE(li.item_name, ''))) = LOWER(TRIM(COALESCE(i.material_name, '')))
                AND COALESCE(li.unit, '') = COALESCE(i.unit, '')
              )
              OR (
                li.po_item_id IS NULL
                AND b.po_number = po.po_number
                AND LOWER(TRIM(COALESCE(li.item_name, ''))) = LOWER(TRIM(COALESCE(i.material_name, '')))
                AND COALESCE(li.unit, '') = COALESCE(i.unit, '')
              )
            )
        ), 0) AS invoiced_quantity,
        GREATEST(i.quantity - COALESCE((
          SELECT SUM(li.quantity)
          FROM tqs_bill_line_items li
          JOIN tqs_bills b ON b.id = li.bill_id
          WHERE b.is_deleted = FALSE
            AND (
              li.po_item_id = i.id
              OR (
                li.po_item_id IS NULL
                AND b.po_id = i.po_id
                AND LOWER(TRIM(COALESCE(li.item_name, ''))) = LOWER(TRIM(COALESCE(i.material_name, '')))
                AND COALESCE(li.unit, '') = COALESCE(i.unit, '')
              )
              OR (
                li.po_item_id IS NULL
                AND b.po_number = po.po_number
                AND LOWER(TRIM(COALESCE(li.item_name, ''))) = LOWER(TRIM(COALESCE(i.material_name, '')))
                AND COALESCE(li.unit, '') = COALESCE(i.unit, '')
              )
            )
        ), 0), 0) AS remaining_quantity,
        GREATEST(i.quantity - COALESCE((
          SELECT SUM(gi.quantity_received)
          FROM grn_items gi
          JOIN grn g ON g.id = gi.grn_id
          WHERE g.quality_status <> 'rejected'
            AND (
              gi.po_item_id = i.id
              OR (
                gi.po_item_id IS NULL
                AND g.po_id = i.po_id
                AND LOWER(TRIM(COALESCE(gi.material_name, ''))) = LOWER(TRIM(COALESCE(i.material_name, '')))
                AND COALESCE(gi.unit, '') = COALESCE(i.unit, '')
              )
            )
        ), 0), 0) AS grn_remaining_quantity,
        i.rate, i.total_amount, i.purpose
      FROM po_items i
      JOIN purchase_orders po ON po.id = i.po_id
      LEFT JOIN vendors v ON v.id = po.vendor_id
      WHERE po.project_id = $1 AND (SELECT company_id FROM projects WHERE id = $1) = $2
      ORDER BY po.po_date ASC, po.po_number ASC, i.sort_order ASC
    `, [project_id, req.user.company_id]);

    const wb = XLSX.utils.book_new();
    const today = new Date().toLocaleDateString('en-IN');

    // ── Sheet 1: PO Summary ──
    const s1Data = [
      [`${companyName} — PURCHASE ORDER REGISTER (Project: ${projectName})`],
      [`Generated on: ${today}`],
      [],
      ['PO No', 'Date', 'Supplier Name', 'Supplier GST', 'Narration / Description',
       'Sub Total (₹)', 'CGST (₹)', 'SGST (₹)', 'Other Tax/TCS (₹)', 'Grand Total (₹)',
       'Payment Terms', 'Status'],
    ];
    let grandTotal = 0;
    for (const po of pos) {
      const poDate = po.po_date ? new Date(po.po_date).toLocaleDateString('en-IN') : '';
      s1Data.push([
        po.po_number, poDate, po.vendor_name || '', po.vendor_gst || '',
        po.narration || '', Number(po.sub_total) || 0,
        Number(po.cgst_amount) || 0, Number(po.sgst_amount) || 0,
        Number(po.tcs_amount) || 0, Number(po.grand_total) || 0,
        po.payment_terms || '', po.status || '',
      ]);
      grandTotal += Number(po.grand_total) || 0;
    }
    s1Data.push(['GRAND TOTAL', '', '', '', '', '', '', '', '', grandTotal, '', '']);
    const ws1 = XLSX.utils.aoa_to_sheet(s1Data);
    ws1['!cols'] = [10,12,30,16,40,14,12,12,14,14,25,10].map(w => ({ wch: w }));
    XLSX.utils.book_append_sheet(wb, ws1, 'PO Summary');

    // ── Sheet 2: Line Item Details ──
    const s2Data = [
      [`${companyName} — LINE ITEM DETAILS (Project: ${projectName})`],
      [],
      ['PO No', 'Date', 'Supplier', 'Sl No', 'Description', 'UOM', 'Quantity', 'Rate (₹)', 'Amount (₹)', 'Remarks'],
    ];
    for (const it of items) {
      const itDate = it.po_date ? new Date(it.po_date).toLocaleDateString('en-IN') : '';
      s2Data.push([
        it.po_number, itDate, it.vendor_name || '',
        it.sort_order, it.material_name || '', it.unit || '',
        Number(it.quantity) || 0, Number(it.rate) || 0,
        Number(it.total_amount) || 0, it.purpose || '',
      ]);
    }
    const ws2 = XLSX.utils.aoa_to_sheet(s2Data);
    ws2['!cols'] = [12,12,28,6,45,8,10,12,12,30].map(w => ({ wch: w }));
    XLSX.utils.book_append_sheet(wb, ws2, 'Line Item Details');

    // ── Sheet 3: Vendor Summary ──
    const vendorMap = {};
    for (const po of pos) {
      const key = po.vendor_name || 'Unknown';
      if (!vendorMap[key]) {
        vendorMap[key] = { gst: po.vendor_gst || '—', pos: [], total: 0, category: po.vendor_type || '' };
      }
      vendorMap[key].pos.push(po.status === 'cancelled' ? `${po.po_number}(C)` : po.po_number);
      vendorMap[key].total += Number(po.grand_total) || 0;
    }
    const s3Data = [
      [`VENDOR-WISE PO SUMMARY — ${projectName}`],
      [],
      ['Vendor Name', 'GST No', 'PO Numbers', 'No. of POs', 'Total Value (₹)', 'Category'],
    ];
    let vendorGrand = 0;
    for (const [name, v] of Object.entries(vendorMap)) {
      s3Data.push([name, v.gst, v.pos.join(', '), v.pos.length, v.total, v.category]);
      vendorGrand += v.total;
    }
    s3Data.push(['GRAND TOTAL (All POs)', '', '', '', vendorGrand, '']);
    const ws3 = XLSX.utils.aoa_to_sheet(s3Data);
    ws3['!cols'] = [35,16,50,10,16,22].map(w => ({ wch: w }));
    XLSX.utils.book_append_sheet(wb, ws3, 'Vendor Summary');

    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const filename = `PO_Register_${projectCode}_${today.replace(/\//g, '-')}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buf);
  } catch (err) {
    console.error('PO Register export error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /purchase-orders/:id
router.get('/:id', async (req, res) => {
  try {
    await getAccessiblePo(req, req.params.id);
    const po = await query(
      `SELECT po.*, v.name as vendor_name, v.address AS vendor_address,
              v.city AS vendor_city, v.state AS vendor_state, v.pincode AS vendor_pincode,
              v.gstin AS vendor_gstin,
              v.email AS vendor_email, v.contact_person AS vendor_contact_person, v.phone AS vendor_phone,
              p.name as project_name, p.project_code, p.company_id,
              u.name AS created_by_name, u.signature_url AS created_by_sig,
              aud.name AS verified_audit_name, aud.signature_url AS verified_audit_sig,
              fin.name AS checked_finance_name, fin.signature_url AS checked_finance_sig,
              mgmt.name AS released_mgmt_name, mgmt.signature_url AS released_mgmt_sig,
              md.name AS authorized_md_name, md.signature_url AS authorized_md_sig
       FROM purchase_orders po
       JOIN vendors v ON po.vendor_id = v.id
       JOIN projects p ON po.project_id = p.id
       JOIN users u ON po.created_by = u.id
       LEFT JOIN users aud ON po.verified_procurement_by = aud.id
       LEFT JOIN users fin ON po.checked_finance_by = fin.id
       LEFT JOIN users mgmt ON po.released_mgmt_by = mgmt.id
       LEFT JOIN users md ON po.authorized_md_by = md.id
       WHERE po.id = $1`,
      [req.params.id]
    );
    if (!po.rows.length || po.rows[0].company_id !== req.user.company_id) {
      return res.status(404).json({ error: 'Purchase Order not found' });
    }
    const items = await query(
      `SELECT * FROM po_items WHERE po_id = $1 ORDER BY sort_order`,
      [req.params.id]
    );
    res.json({ data: { ...po.rows[0], items: items.rows } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /purchase-orders/:id — edit core PO fields (po_number, delivery_address, etc.)
router.patch('/:id', async (req, res) => {
  try {
    const po = await getAccessiblePo(req, req.params.id);

    // Full edit only allowed while still pending (not yet procurement-approved)
    if (po.status !== 'pending') {
      return res.status(400).json({ error: `Cannot edit a PO at status "${po.status}". Only pending POs can be edited.` });
    }

    const {
      vendor_id, po_date, delivery_date, payment_terms, tcs_amount,
      po_req_no, po_req_date, approval_no, delivery_address,
      order_intro, notes, terms_conditions, bank_details, items,
      mrs_id, mrs_ids,
    } = req.body;

    const result = await withTransaction(async (client) => {
      const sets = [];
      const params = [req.params.id];
      let i = 2;

      if (vendor_id        !== undefined) { sets.push(`vendor_id = $${i++}`);         params.push(vendor_id); }
      if (po_date          !== undefined) { sets.push(`po_date = $${i++}`);            params.push(po_date || null); }
      if (delivery_date    !== undefined) { sets.push(`delivery_date = $${i++}`);      params.push(delivery_date || null); }
      if (payment_terms    !== undefined) { sets.push(`payment_terms = $${i++}`);      params.push(payment_terms || null); }
      if (tcs_amount       !== undefined) { sets.push(`tcs_amount = $${i++}`);         params.push(parseFloat(tcs_amount) || 0); }
      if (po_req_no        !== undefined) { sets.push(`po_req_no = $${i++}`);          params.push(po_req_no || null); }
      if (po_req_date      !== undefined) { sets.push(`po_req_date = $${i++}`);        params.push(po_req_date || null); }
      if (approval_no      !== undefined) { sets.push(`approval_no = $${i++}`);        params.push(approval_no || null); }
      if (delivery_address !== undefined) { sets.push(`delivery_address = $${i++}`);   params.push(delivery_address || null); }
      if (order_intro      !== undefined) { sets.push(`order_intro = $${i++}`);        params.push(order_intro || null); }
      if (notes            !== undefined) { sets.push(`notes = $${i++}`);              params.push(notes || null); }
      if (terms_conditions !== undefined) { sets.push(`terms_conditions = $${i++}`);   params.push(terms_conditions || null); }
      if (bank_details     !== undefined) { sets.push(`bank_details = $${i++}`);       params.push(bank_details || null); }
      if (mrs_id !== undefined || mrs_ids !== undefined) {
        const list = (Array.isArray(mrs_ids) ? mrs_ids : (mrs_id ? [mrs_id] : [])).filter(Boolean);
        sets.push(`mrs_ids = $${i++}`);  params.push(list.length ? list : null);
        sets.push(`mrs_id = $${i++}`);   params.push(list[0] || null);
      }

      // Replace items and recalculate totals
      if (Array.isArray(items) && items.length) {
        await client.query(`DELETE FROM po_items WHERE po_id = $1`, [req.params.id]);
        let subTotal = 0, totalGst = 0;
        for (let j = 0; j < items.length; j++) {
          const it = items[j];
          const basic = (parseFloat(it.quantity) || 0) * (parseFloat(it.rate) || 0);
          const gst   = basic * ((parseFloat(it.gst_rate) || 0) / 100);
          await client.query(
            `INSERT INTO po_items (po_id, material_name, make_model, hsn_code, quantity, unit, rate, gst_rate, req_date, sort_order, mrs_item_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
            [req.params.id, it.material_name, it.make_model || null, it.hsn_code || null,
             parseFloat(it.quantity) || 0, it.unit || 'Nos',
             parseFloat(it.rate) || 0, parseFloat(it.gst_rate) || 0,
             it.req_date || null, j + 1, it.mrs_item_id || null]
          );
          subTotal += basic;
          totalGst += gst;
        }
        const tcsValue = parseFloat(tcs_amount) || 0;
        sets.push(`sub_total = $${i++}, total_gst = $${i++}, grand_total = $${i++}`);
        params.push(subTotal, totalGst, subTotal + totalGst + tcsValue);
      }

      if (!sets.length) throw Object.assign(new Error('Nothing to update'), { statusCode: 400 });
      sets.push('updated_at = NOW()');

      const r = await client.query(
        `UPDATE purchase_orders SET ${sets.join(', ')} WHERE id = $1 RETURNING *`,
        params
      );
      if (!r.rows[0]) throw Object.assign(new Error('Purchase Order not found'), { statusCode: 404 });
      return r.rows[0];
    });

    res.json({ data: result });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

// GET /purchase-orders/:id/bills — linked DQS bills for this PO
router.get('/:id/bills', async (req, res) => {
  try {
    await getAccessiblePo(req, req.params.id);
    const bills = await query(
      `SELECT
         b.id, b.sl_number, b.inv_number, b.inv_date, b.inv_month,
         b.received_date, b.basic_amount, b.gst_amount, b.total_amount,
         b.workflow_status, b.work_desc, b.bill_type, b.tax_mode,
         b.cgst_pct, b.cgst_amt, b.sgst_pct, b.sgst_amt, b.igst_pct, b.igst_amt,
         b.transport_charges, b.other_charges, b.remarks,
         b.credit_note_num, b.credit_note_val
       FROM tqs_bills b
       WHERE b.po_id = $1 AND b.is_deleted = false
       ORDER BY b.inv_date ASC NULLS LAST, b.sl_number ASC`,
      [req.params.id]
    );

    const rows = bills.rows;
    const total_billed      = rows.reduce((s, r) => s + parseFloat(r.total_amount || 0), 0);
    const total_paid        = rows.filter(r => r.workflow_status === 'paid')
                                  .reduce((s, r) => s + parseFloat(r.total_amount || 0), 0);

    res.json({
      bills: rows,
      summary: {
        count:            rows.length,
        total_billed,
        total_paid,
        total_approved:   total_paid,   // keep old key for backward compat
        total_outstanding: total_billed - total_paid,
        total_pending:    total_billed - total_paid,  // keep old key for backward compat
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id/mail-preview', async (req, res) => {
  try {
    await getAccessiblePo(req, req.params.id);
    await ensurePoMailSchema();
    const po = await getPoDetailsForMail(req);
    if (!po) return res.status(404).json({ error: 'Purchase Order not found' });

    const poNo = po.po_ref_no || po.po_number || po.serial_no_formatted;
    const defaultCc = parseEmails(process.env.PO_DEFAULT_CC_EMAILS || process.env.PROCUREMENT_CC_EMAILS || '');
    const subject = `Purchase Order ${poNo} - ${po.vendor_name || ''} - ${po.project_name || ''}`.trim();
    const body = `Please find below Purchase Order ${poNo} for your reference and necessary action.`;
    const mail = buildPOMail({ po, subject, body });

    res.json({
      data: {
        po,
        to: parseEmails(po.vendor_email),
        cc: defaultCc,
        subject,
        body,
        html: mail.html,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/send-to-vendor', async (req, res) => {
  try {
    await getAccessiblePo(req, req.params.id);
    await ensurePoMailSchema();
    const po = await getPoDetailsForMail(req);
    if (!po) return res.status(404).json({ error: 'Purchase Order not found' });

    const to = parseEmails(req.body.to || po.vendor_email);
    const cc = parseEmails(req.body.cc || process.env.PO_DEFAULT_CC_EMAILS || process.env.PROCUREMENT_CC_EMAILS || '');
    if (!to.length) return res.status(400).json({ error: 'Vendor email is missing. Update Vendor Master or enter email manually.' });

    const poNo = po.po_ref_no || po.po_number || po.serial_no_formatted;
    const subject = req.body.subject || `Purchase Order ${poNo} - ${po.vendor_name || ''} - ${po.project_name || ''}`.trim();
    const body = req.body.body || `Please find below Purchase Order ${poNo} for your reference and necessary action.`;
    const mail = buildPOMail({ po, subject, body });
    const mailResult = await sendMail({ to, cc, subject: mail.subject, html: mail.html, text: mail.text });
    const primary = mailResult.results?.[0] || {};
    const status = mailResult.sent ? 'sent' : 'failed';

    const log = await query(
      `INSERT INTO po_mail_logs (po_id, company_id, sent_by, to_emails, cc_emails, subject, body_html, status, provider, error)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [po.id, req.user.company_id, req.user.id, to, cc, subject, mail.html, status, primary.provider || null, primary.reason || mailResult.reason || null]
    );

    if (mailResult.sent) {
      await query(
        `UPDATE purchase_orders
         SET po_sent_at = NOW(), po_sent_by = $1, po_sent_to = $2, po_sent_cc = $3, updated_at = NOW()
         WHERE id = $4`,
        [req.user.id, to, cc, po.id]
      );
    }

    res.json({
      message: mailResult.sent ? 'Purchase order sent to vendor' : 'Mail not sent',
      data: {
        sent: mailResult.sent,
        to,
        cc,
        log: log.rows[0],
        mail_result: mailResult,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /purchase-orders (Multi-item)
router.post('/', async (req, res) => {
  try {
    const {
      project_id, vendor_id, po_date, delivery_date, status,
      terms_conditions, notes, bank_details, items, mrs_id, mrs_ids,
      payment_terms, tcs_amount,
      po_req_no, po_req_date, approval_no, delivery_address, order_intro,
      department, currency, billing_address, freight_mode, transport_mode, tax_type,
      freight_charges, loading_unloading_charges, insurance_charges, tds_percent,
      internal_remarks, delivery_instructions
    } = req.body;

    if (!project_id || !vendor_id || !items?.length) {
      return res.status(400).json({ error: 'Missing required project, vendor or items.' });
    }

    // A PO can be raised against one or many MRS. Normalise to an array and
    // keep the first as the legacy single mrs_id for backward compatibility.
    const mrsIdList = (Array.isArray(mrs_ids) ? mrs_ids : (mrs_id ? [mrs_id] : []))
      .filter(Boolean);
    const primaryMrsId = mrsIdList[0] || null;
    if (!userCanAccessProject(req, project_id)) {
      return res.status(403).json({ error: 'Access denied for this project.' });
    }

    const result = await withTransaction(async (client) => {
      const projRes = await client.query('SELECT project_code FROM projects WHERE id = $1', [project_id]);
      const po_number = await getNextDqsNumber(client, 'purchase_orders', projRes.rows[0]?.project_code);

      // 2. Insert Header
      const headerRes = await client.query(
        `INSERT INTO purchase_orders (
          project_id, vendor_id, po_number, po_date, delivery_date,
          terms_conditions, notes, bank_details,
          payment_terms, tcs_amount,
          po_req_no, po_req_date, approval_no, delivery_address, order_intro,
          status, created_by, mrs_id, po_ref_no, serial_no_formatted, mrs_ids,
          department, currency, billing_address, freight_mode, transport_mode, tax_type,
          freight_charges, loading_unloading_charges, insurance_charges, tds_percent,
          internal_remarks, delivery_instructions
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21,
          $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33) RETURNING *`,
        [project_id, vendor_id, po_number, po_date || null, delivery_date || null, terms_conditions || null, notes || null, bank_details || null, payment_terms || null, parseFloat(tcs_amount) || 0, po_req_no || null, po_req_date || null, approval_no || null, delivery_address || null, order_intro || null, 'pending', req.user.id, primaryMrsId]
          .concat([po_number, po_number, mrsIdList.length ? mrsIdList : null])
          .concat([department || null, currency || 'INR', billing_address || null, freight_mode || null, transport_mode || null, tax_type || 'intra',
            parseFloat(freight_charges) || 0, parseFloat(loading_unloading_charges) || 0, parseFloat(insurance_charges) || 0, parseFloat(tds_percent) || 0,
            internal_remarks || null, delivery_instructions || null])
      );
      const poId = headerRes.rows[0].id;

      // 3. Insert Items & Calculate Totals (taxable = qty*rate less line discount)
      let subTotal = 0;
      let totalGst = 0;
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const gross = (parseFloat(item.quantity) || 0) * (parseFloat(item.rate) || 0);
        const disc  = parseFloat(item.discount_pct || 0) || 0;
        const basic = gross * (1 - disc / 100);
        const gst   = basic * (parseFloat(item.gst_rate || 0) / 100);

        await client.query(
          `INSERT INTO po_items (
            po_id, material_name, make_model, hsn_code, quantity, unit, rate, gst_rate, req_date, sort_order, mrs_item_id, item_code, discount_pct
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
          [poId, item.material_name, item.make_model || null, item.hsn_code || null, parseFloat(item.quantity) || 0, item.unit, parseFloat(item.rate) || 0, parseFloat(item.gst_rate) || 0, item.req_date || null, i + 1, item.mrs_item_id || null, item.item_code || null, disc]
        );
        subTotal += basic;
        totalGst += gst;
      }

      const tcsValue = parseFloat(tcs_amount) || 0;
      const freight = parseFloat(freight_charges) || 0;
      const loading = parseFloat(loading_unloading_charges) || 0;
      const insurance = parseFloat(insurance_charges) || 0;
      const freightGst = freight * 0.18; // freight taxed at 18% per mockup
      const tdsValue = (subTotal) * ((parseFloat(tds_percent) || 0) / 100);
      const grandTotal = subTotal + totalGst + tcsValue + freight + loading + insurance + freightGst - tdsValue;
      const finalRes = await client.query(
        `UPDATE purchase_orders
         SET sub_total = $1, total_gst = $2, grand_total = $3, serial_no_formatted = $4, po_ref_no = $4
         WHERE id = $5 RETURNING *`,
        [subTotal, totalGst, grandTotal, po_number, poId]
      );

      // Keep the vendor↔project mapping in sync so project-wise vendor lists
      // reflect every project the vendor has actually been ordered for.
      await client.query(
        `INSERT INTO project_vendors (project_id, vendor_id, added_by)
         VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
        [project_id, vendor_id, req.user.id]
      );

      return finalRes.rows[0];
    });

    // WhatsApp + push notifications (non-blocking)
    ;(async () => {
      try {
        const [vRes, pRes] = await Promise.all([
          query('SELECT name FROM vendors WHERE id = $1', [vendor_id]),
          query('SELECT name FROM projects WHERE id = $1', [project_id]),
        ]);
        const vendorName  = vRes.rows[0]?.name || 'Unknown Vendor';
        const projectName = pRes.rows[0]?.name || 'Unknown Project';
        await wa.notifyPOCreated({
          poNumber:    result.po_number,
          serialNo:    result.serial_no_formatted,
          vendorName,
          projectName,
          grandTotal:  result.grand_total,
          userId:      req.user.id,
        });
        // In-app + push notification to approvers
        notifyPoCreated(req.user.company_id, {
          ...result,
          vendor_name: vendorName,
          project_name: projectName,
          created_by_name: req.user.name,
        });
      } catch (e) { console.error('[wa]', e.message); }
    })();

    res.status(201).json({ data: result });
  } catch (err) {
    console.error('PO Create error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Reject PO — must be before /:id/:stage to avoid being swallowed by the generic route
router.patch('/:id/reject', async (req, res) => {
  try {
    await getAccessiblePo(req, req.params.id);
    const po = await query(
      `SELECT po.*, p.company_id FROM purchase_orders po
       JOIN projects p ON po.project_id = p.id WHERE po.id = $1`,
      [req.params.id]
    );
    if (!po.rows.length || po.rows[0].company_id !== req.user.company_id) {
      return res.status(404).json({ error: 'Purchase Order not found' });
    }
    await query(
      `UPDATE purchase_orders SET status = 'rejected', updated_at = NOW() WHERE id = $1`,
      [req.params.id]
    );
    notifyPoRejected(req.user.company_id, po.rows[0], req.user.name, req.body.reason || '');
    res.json({ message: 'PO rejected successfully', status: 'rejected' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2-Stage Approval: Procurement → MD
// Flow: pending → verified_audit (Procurement) → approved (MD)
const PO_STAGES = {
  'procurement-approve': { nextStatus: 'verified_audit', colBy: 'verified_procurement_by', colAt: 'verified_procurement_at', requiredPrev: ['pending'] },
  'md-approve':          { nextStatus: 'approved',        colBy: 'authorized_md_by',        colAt: 'authorized_md_at',        requiredPrev: ['verified_audit', 'released_mgmt'] },
};

router.patch('/:id/:stage', async (req, res) => {
  try {
    const { stage } = req.params;
    const cfg = PO_STAGES[stage];
    if (!cfg) return res.status(400).json({ error: 'Invalid approval stage' });

    const { signature_img } = req.body;
    await getAccessiblePo(req, req.params.id);

    const po = await query(
      `SELECT po.*, p.company_id FROM purchase_orders po
       JOIN projects p ON po.project_id = p.id WHERE po.id = $1`,
      [req.params.id]
    );
    if (!po.rows.length || po.rows[0].company_id !== req.user.company_id) {
      return res.status(404).json({ error: 'Purchase Order not found' });
    }
    if (!cfg.requiredPrev.includes(po.rows[0].status)) {
      return res.status(400).json({ error: `Cannot perform ${stage}. Current status: ${po.rows[0].status}` });
    }

    // Merge signature into signatures JSONB
    let setSql = `status = $1, ${cfg.colBy} = $2, ${cfg.colAt} = NOW(), updated_at = NOW()`;
    const params = [cfg.nextStatus, req.user.id];

    if (signature_img) {
      const existing = po.rows[0].signatures || {};
      const updated  = {
        ...existing,
        [stage]: { img: signature_img, by: req.user.name || req.user.id, at: new Date().toISOString() },
      };
      setSql += `, signatures = $${params.length + 1}`;
      params.push(JSON.stringify(updated));
    }

    params.push(req.params.id);
    const result = await query(
      `UPDATE purchase_orders SET ${setSql} WHERE id = $${params.length} RETURNING status`,
      params
    );

    // Notify PO creator when finally approved
    if (cfg.nextStatus === 'approved') {
      notifyPoApproved(req.user.company_id, po.rows[0], req.user.name);
    }

    res.json({ message: `PO ${stage} successfully`, status: result.rows[0].status });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// POST /purchase-orders/import/preview — extract PO data from PDF, return for review
router.post('/import/preview', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No PDF file uploaded' });
    if (req.file.mimetype !== 'application/pdf') return res.status(400).json({ error: 'Only PDF files are supported' });
    const result = await extractPO(req.file.buffer);
    res.json(result);
  } catch (err) {
    console.error('[PO Import Preview]:', err.message);
    res.status(500).json({ error: err.message || 'Failed to parse PDF' });
  }
});

// POST /purchase-orders/import/confirm — save reviewed PO data to DB
router.post('/import/confirm', async (req, res) => {
  try {
    const { project_id, vendor_id, header = {}, items = [] } = req.body;
    if (!project_id || !vendor_id) return res.status(400).json({ error: 'Project and Vendor are required' });
    if (!userCanAccessProject(req, project_id)) {
      return res.status(403).json({ error: 'Access denied for this project.' });
    }

    const result = await withTransaction(async (client) => {
      const projRes = await client.query('SELECT project_code FROM projects WHERE id = $1', [project_id]);
      const po_number = String(header.po_number || '').trim().toUpperCase()
        || await getNextDqsNumber(client, 'purchase_orders', projRes.rows[0]?.project_code);

      // Calculate totals from items
      let sub_total = 0, total_gst = 0;
      const processedItems = (items || []).map((it, i) => {
        const qty   = parseFloat(it.quantity) || 0;
        const rate  = parseFloat(it.rate) || 0;
        const gst   = parseFloat(it.gst_rate) || 18;
        const base  = qty * rate;
        const gstAmt = base * gst / 100;
        sub_total  += base;
        total_gst  += gstAmt;
        return { ...it, quantity: qty, rate, gst_rate: gst, gst_amount: gstAmt, total_amount: base + gstAmt, sort_order: i + 1 };
      });
      const grand_total = sub_total + total_gst;

      const poRow = await client.query(
        `INSERT INTO purchase_orders
           (project_id, vendor_id, po_number, po_date, delivery_date,
            sub_total, total_gst, grand_total, terms_conditions, notes, status, created_by,
            po_ref_no, serial_no_formatted)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'pending',$11,$12,$13) RETURNING id, po_number`,
        [
          project_id, vendor_id, po_number,
          header.po_date || null, header.delivery_date || null,
          sub_total, total_gst, grand_total,
          header.terms_conditions || '', header.notes || '',
          req.user.id,
          po_number, po_number,
        ]
      );
      const po_id = poRow.rows[0].id;

      for (const it of processedItems) {
        await client.query(
          `INSERT INTO po_items (po_id, material_name, hsn_code, quantity, unit, rate, gst_rate, gst_amount, total_amount, sort_order)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
          [po_id, it.material_name || 'Item', it.hsn_code || '', parseFloat(it.quantity)||0, it.unit || 'Nos',
           parseFloat(it.rate)||0, parseFloat(it.gst_rate)||0, parseFloat(it.gst_amount)||0, parseFloat(it.total_amount)||0, it.sort_order]
        );
      }

      await client.query(
        `INSERT INTO project_vendors (project_id, vendor_id, added_by)
         VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
        [project_id, vendor_id, req.user.id]
      );

      return poRow.rows[0];
    });

    res.json({ success: true, po_number: result.po_number, id: result.id });
  } catch (err) {
    console.error('[PO Import Confirm]:', err.message);
    res.status(500).json({ error: err.message || 'Failed to save Purchase Order' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /purchase-orders/bulk-import
// Bulk-insert historical POs with multiple line items.
// Body: { project_id, records: [{ po_number, vendor_id, po_date, delivery_date,
//          notes, status, items: [{ description, quantity, unit, rate, gst_rate }] }] }
// Returns: { created, skipped, errors: [{po_number, reason}], created_ids }
// ─────────────────────────────────────────────────────────────────────────────
router.post('/bulk-import', async (req, res) => {
  try {
    const { project_id, records = [] } = req.body;
    if (!project_id)     return res.status(400).json({ error: 'project_id is required' });
    if (!records.length) return res.status(400).json({ error: 'No records provided' });
    if (!userCanAccessProject(req, project_id)) {
      return res.status(403).json({ error: 'Access denied for this project.' });
    }

    let created = 0, skipped = 0;
    const errors      = [];
    const created_ids = [];

    for (const rec of records) {
      try {
        if (!rec.po_number) { errors.push({ po_number: '?',           reason: 'po_number missing' }); continue; }
        if (!rec.vendor_id) { errors.push({ po_number: rec.po_number, reason: 'vendor_id missing' }); continue; }

        // Check duplicate within same project (same PO number can exist across projects)
        const dup = await query(
          'SELECT id FROM purchase_orders WHERE po_number = $1 AND project_id = $2',
          [rec.po_number, project_id]
        );
        if (dup.rows.length) { skipped++; continue; }

        // Normalise items array (support both new multi-item and legacy single-item payloads)
        let items = Array.isArray(rec.items) && rec.items.length
          ? rec.items
          : [{ description: rec.subject || rec.notes || 'Imported Item',
               quantity: rec.quantity || 1,
               unit:     rec.unit     || 'LS',
               rate:     rec.rate     || (rec.grand_total || 0),
               gst_rate: rec.gst_pct  || 0 }];

        // Filter out blank rows (rate=0 allowed for "Inclusive" items)
        items = items.filter(it => it.description?.trim() && parseFloat(it.quantity) > 0);
        if (!items.length) { errors.push({ po_number: rec.po_number, reason: 'No valid line items' }); continue; }

        // Compute totals
        let subTotal = 0, totalGst = 0;
        for (const it of items) {
          const base = parseFloat(it.quantity) * parseFloat(it.rate);
          subTotal += base;
          totalGst += base * (parseFloat(it.gst_rate) || 0) / 100;
        }
        const grandTotal = subTotal + totalGst;

        let newId;
        await withTransaction(async (client) => {
          const poRow = await client.query(
            `INSERT INTO purchase_orders
               (project_id, vendor_id, po_number, po_date, delivery_date,
                sub_total, total_gst, grand_total, notes, payment_terms, tcs_amount, status, created_by)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id`,
            [
              project_id, rec.vendor_id, rec.po_number,
              rec.po_date || null, rec.delivery_date || null,
              subTotal.toFixed(2), totalGst.toFixed(2), grandTotal.toFixed(2),
              rec.notes || '',
              rec.payment_terms || null,
              parseFloat(rec.tcs_amount) || 0,
              rec.status || 'approved',
              req.user.id,
            ]
          );
          newId = poRow.rows[0].id;

          // Insert each line item
          for (let idx = 0; idx < items.length; idx++) {
            const it      = items[idx];
            const qty     = parseFloat(it.quantity) || 0;
            const rate    = parseFloat(it.rate)     || 0;
            const gstRate = parseFloat(it.gst_rate) || 0;
            const base    = qty * rate;
            const gstAmt  = base * gstRate / 100;
            const total   = base + gstAmt;
            await client.query(
              `INSERT INTO po_items (po_id, material_name, quantity, unit, rate, gst_rate, gst_amount, total_amount, sort_order)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
              [newId, it.description, qty, it.unit || 'LS', rate.toFixed(2), gstRate, gstAmt.toFixed(2), total.toFixed(2), idx + 1]
            );
          }

          await client.query(
            `INSERT INTO project_vendors (project_id, vendor_id, added_by)
             VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
            [project_id, rec.vendor_id, req.user.id]
          );
        });

        created++;
        created_ids.push({ po_number: rec.po_number, id: newId });
      } catch (e) {
        errors.push({ po_number: rec.po_number, reason: e.message });
      }
    }

    res.json({ created, skipped, errors, created_ids });
  } catch (err) {
    console.error('[PO Bulk Import]:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
