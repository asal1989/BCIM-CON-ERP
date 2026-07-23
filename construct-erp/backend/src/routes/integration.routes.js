// integration.routes.js — External read-only API for DMS and third-party sync
// Auth: Authorization: Bearer <api-key>
// All endpoints return camelCase JSON arrays (no wrapper object).
'use strict';

const express = require('express');
const crypto  = require('crypto');
const router  = express.Router();
const { query } = require('../config/database');

const APP_URL = process.env.PUBLIC_APP_URL || process.env.FRONTEND_URL || 'https://erp.bcim.in';

// ── API-key middleware ──────────────────────────────────────────────────────
// Validates Bearer token against api_keys table; injects req.apiCompanyId and
// req.apiScopes so downstream handlers can scope their queries.
async function apiKeyAuth(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const match  = header.match(/^Bearer\s+(\S+)$/i);
    if (!match) {
      return res.status(401).json({ error: 'Missing or malformed Authorization header. Use: Bearer <api-key>' });
    }

    const raw  = match[1];
    const hash = crypto.createHash('sha256').update(raw).digest('hex');

    const { rows } = await query(
      `SELECT id, company_id, scopes
       FROM api_keys
       WHERE key_hash = $1 AND revoked_at IS NULL`,
      [hash]
    );

    if (!rows.length) {
      return res.status(401).json({ error: 'Invalid or revoked API key' });
    }

    // Update last_used_at in background (don't await — don't fail the request)
    query('UPDATE api_keys SET last_used_at=NOW() WHERE id=$1', [rows[0].id]).catch(() => {});

    req.apiCompanyId = rows[0].company_id;
    req.apiScopes    = rows[0].scopes || [];
    next();
  } catch (err) {
    console.error('[Integration] apiKeyAuth error:', err.message);
    res.status(500).json({ error: 'Internal auth error' });
  }
}

router.use(apiKeyAuth);

// ── Helpers ────────────────────────────────────────────────────────────────
function parseSince(val) {
  if (!val) return null;
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

// ── GET /api/v1/integration/work-orders ────────────────────────────────────
// Query params:
//   status  — work order status (default: approved)
//   since   — ISO timestamp; only return WOs updated at or after this time
//   project — project_code filter (optional)
//   limit   — max rows (default 200, max 1000)
router.get('/work-orders', async (req, res) => {
  try {
    const status  = req.query.status  || 'approved';
    const since   = parseSince(req.query.since);
    const project = req.query.project || null;
    const limit   = Math.min(parseInt(req.query.limit) || 200, 1000);

    const conditions = ['wo.company_id = $1', 'wo.status = $2'];
    const params     = [req.apiCompanyId, status];
    let   idx        = 3;

    if (since)   { conditions.push(`wo.updated_at >= $${idx++}`); params.push(since); }
    if (project) { conditions.push(`p.project_code ILIKE $${idx++}`); params.push(project); }

    const { rows } = await query(
      `SELECT
         p.project_code                      AS "projectCode",
         COALESCE(wo.serial_no_formatted,
                  wo.wo_number)              AS "workOrderNo",
         COALESCE(wo.title, wo.scope_of_work,
                  wo.description)            AS "title",
         COALESCE(v.name, wo.vendor_name)    AS "vendorName",
         COALESCE(wo.grand_total,
                  wo.total_value)::float     AS "amount",
         md.name                             AS "approvedBy",
         wo.authorized_md_at                 AS "approvedAt",
         wo.status                           AS "status",
         wo.id                               AS "id",
         wo.updated_at                       AS "updatedAt"
       FROM work_orders wo
       LEFT JOIN projects p  ON p.id  = wo.project_id
       LEFT JOIN vendors  v  ON v.id  = wo.vendor_id
       LEFT JOIN users   md  ON md.id = wo.authorized_md_by
       WHERE ${conditions.join(' AND ')}
       ORDER BY wo.updated_at DESC
       LIMIT $${idx}`,
      [...params, limit]
    );

    const data = rows.map(r => ({
      projectCode:  r.projectCode,
      workOrderNo:  r.workOrderNo,
      title:        r.title,
      vendorName:   r.vendorName,
      amount:       r.amount ?? 0,
      approvedBy:   r.approvedBy,
      approvedAt:   r.approvedAt,
      status:       r.status,
      fileUrl:      `${APP_URL}/verify/wo/${r.id}`,
      updatedAt:    r.updatedAt,
    }));

    res.json(data);
  } catch (err) {
    console.error('[Integration] GET /work-orders error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/v1/integration/purchase-orders ────────────────────────────────
// Same pattern for POs.
// Query params: status, since, project, limit
router.get('/purchase-orders', async (req, res) => {
  try {
    const status  = req.query.status  || 'approved';
    const since   = parseSince(req.query.since);
    const project = req.query.project || null;
    const limit   = Math.min(parseInt(req.query.limit) || 200, 1000);

    const conditions = ['po.company_id = $1', 'po.status = $2'];
    const params     = [req.apiCompanyId, status];
    let   idx        = 3;

    if (since)   { conditions.push(`po.updated_at >= $${idx++}`); params.push(since); }
    if (project) { conditions.push(`p.project_code ILIKE $${idx++}`); params.push(project); }

    const { rows } = await query(
      `SELECT
         p.project_code                            AS "projectCode",
         COALESCE(po.serial_no_formatted,
                  po.po_ref_no, po.po_number)      AS "purchaseOrderNo",
         v.name                                    AS "vendorName",
         po.sub_total::float                       AS "subTotal",
         po.total_gst::float                       AS "totalGst",
         po.grand_total::float                     AS "amount",
         md.name                                   AS "approvedBy",
         po.authorized_md_at                       AS "approvedAt",
         po.status                                 AS "status",
         po.id                                     AS "id",
         po.updated_at                             AS "updatedAt"
       FROM purchase_orders po
       LEFT JOIN projects p  ON p.id  = po.project_id
       LEFT JOIN vendors  v  ON v.id  = po.vendor_id
       LEFT JOIN users   md  ON md.id = po.authorized_md_by
       WHERE ${conditions.join(' AND ')}
       ORDER BY po.updated_at DESC
       LIMIT $${idx}`,
      [...params, limit]
    );

    const data = rows.map(r => ({
      projectCode:     r.projectCode,
      purchaseOrderNo: r.purchaseOrderNo,
      vendorName:      r.vendorName,
      subTotal:        r.subTotal   ?? 0,
      totalGst:        r.totalGst   ?? 0,
      amount:          r.amount     ?? 0,
      approvedBy:      r.approvedBy,
      approvedAt:      r.approvedAt,
      status:          r.status,
      fileUrl:         `${APP_URL}/verify/po/${r.id}`,
      updatedAt:       r.updatedAt,
    }));

    res.json(data);
  } catch (err) {
    console.error('[Integration] GET /purchase-orders error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/v1/integration/mrs ────────────────────────────────────────────
// Material Requisition Slips.
// Query params: status, since, project, limit
// status values: pending | stores_verified | approved_pm | approved_mgmt | approved_md
router.get('/mrs', async (req, res) => {
  try {
    const status  = req.query.status  || null;   // no default — return all stages
    const since   = parseSince(req.query.since);
    const project = req.query.project || null;
    const limit   = Math.min(parseInt(req.query.limit) || 200, 1000);

    const conditions = ['p.company_id = $1'];
    const params     = [req.apiCompanyId];
    let   idx        = 2;

    if (status)  { conditions.push(`mr.status = $${idx++}`);              params.push(status); }
    if (since)   { conditions.push(`mr.updated_at >= $${idx++}`);         params.push(since); }
    if (project) { conditions.push(`p.project_code ILIKE $${idx++}`);     params.push(project); }

    const { rows } = await query(
      `SELECT
         p.project_code                            AS "projectCode",
         p.name                                    AS "projectName",
         COALESCE(mr.serial_no_formatted,
                  mr.mrs_number)                   AS "mrsNo",
         mr.purpose                                AS "purpose",
         mr.department                             AS "department",
         mr.status                                 AS "status",
         rb.name                                   AS "requestedBy",
         mr.created_at                             AS "requestedAt",
         md.name                                   AS "approvedBy",
         mr.approved_md_at                         AS "approvedAt",
         mr.id                                     AS "id",
         mr.updated_at                             AS "updatedAt"
       FROM material_requisitions mr
       JOIN   projects p  ON p.id  = mr.project_id
       LEFT JOIN users rb ON rb.id = mr.raised_by
       LEFT JOIN users md ON md.id = mr.approved_md_by
       WHERE ${conditions.join(' AND ')}
       ORDER BY mr.updated_at DESC
       LIMIT $${idx}`,
      [...params, limit]
    );

    // Fetch items for all returned MRS in one query
    const ids = rows.map(r => r.id);
    let itemsByMrs = {};
    if (ids.length) {
      const { rows: items } = await query(
        `SELECT mrs_id, material_name, quantity, unit
         FROM mrs_items
         WHERE mrs_id = ANY($1::uuid[])
         ORDER BY sort_order`,
        [ids]
      );
      for (const it of items) {
        if (!itemsByMrs[it.mrs_id]) itemsByMrs[it.mrs_id] = [];
        itemsByMrs[it.mrs_id].push({
          materialName: it.material_name,
          quantity:     parseFloat(it.quantity) || 0,
          unit:         it.unit,
        });
      }
    }

    const data = rows.map(r => ({
      projectCode:  r.projectCode,
      projectName:  r.projectName,
      mrsNo:        r.mrsNo,
      purpose:      r.purpose,
      department:   r.department,
      status:       r.status,
      requestedBy:  r.requestedBy,
      requestedAt:  r.requestedAt,
      approvedBy:   r.approvedBy,
      approvedAt:   r.approvedAt,
      items:        itemsByMrs[r.id] || [],
      fileUrl:      `${APP_URL}/verify/mrs/${r.id}`,
      updatedAt:    r.updatedAt,
    }));

    res.json(data);
  } catch (err) {
    console.error('[Integration] GET /mrs error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/v1/integration/ping ───────────────────────────────────────────
// Health check — confirms the API key is valid and returns its metadata.
router.get('/ping', async (req, res) => {
  res.json({
    ok: true,
    companyId: req.apiCompanyId,
    scopes:    req.apiScopes,
    timestamp: new Date().toISOString(),
  });
});

module.exports = router;
