// integration.routes.js — External read-only API for DMS and third-party sync
// Auth: Authorization: Bearer <api-key>
// All endpoints return camelCase JSON arrays (no wrapper object).
'use strict';

const express = require('express');
const crypto  = require('crypto');
const path    = require('path');
const fs      = require('fs');
const router  = express.Router();
const { query } = require('../config/database');
const { downloadFromOneDrive, isConfigured: onedriveConfigured } = require('../services/onedrive.service');

const APP_URL = process.env.PUBLIC_APP_URL || process.env.FRONTEND_URL || 'https://erp.bcim.in';

// ── API-key middleware ──────────────────────────────────────────────────────
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
      `SELECT id, company_id, scopes FROM api_keys WHERE key_hash = $1 AND revoked_at IS NULL`,
      [hash]
    );

    if (!rows.length) return res.status(401).json({ error: 'Invalid or revoked API key' });

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
// work_orders table: project_id, vendor_id, wo_number, subject, scope_of_work,
//   total_value, status (draft|pending|approved|rejected), created_by, updated_at
// No per-approver columns — approval is reflected by status only.
// Company scope: via projects JOIN (work_orders has no company_id column).
router.get('/work-orders', async (req, res) => {
  try {
    const status  = req.query.status  || 'approved';
    const since   = parseSince(req.query.since);
    const project = req.query.project || null;
    const limit   = Math.min(parseInt(req.query.limit) || 200, 1000);

    const conditions = ['p.company_id = $1', 'wo.status = $2'];
    const params     = [req.apiCompanyId, status];
    let   idx        = 3;

    if (since)   { conditions.push(`wo.updated_at >= $${idx++}`); params.push(since); }
    if (project) { conditions.push(`p.project_code ILIKE $${idx++}`); params.push(project); }

    const { rows } = await query(
      `SELECT
         p.project_code                                AS "projectCode",
         COALESCE(wo.serial_no_formatted, wo.wo_number) AS "workOrderNo",
         COALESCE(wo.subject, wo.scope_of_work,
                  wo.work_description)                AS "title",
         v.name                                        AS "vendorName",
         COALESCE(wo.total_value, 0)::float            AS "amount",
         cb.name                                       AS "createdBy",
         wo.status                                     AS "status",
         wo.id                                         AS "id",
         wo.updated_at                                 AS "updatedAt",
         doc.id                                        AS "docId"
       FROM work_orders wo
       JOIN   projects p  ON p.id  = wo.project_id
       LEFT JOIN vendors v  ON v.id  = wo.vendor_id
       LEFT JOIN users  cb ON cb.id = wo.created_by
       LEFT JOIN LATERAL (
         SELECT id FROM documents
         WHERE module = 'work_order' AND module_record_id = wo.id
           AND file_type = '.pdf'
         ORDER BY created_at DESC LIMIT 1
       ) doc ON true
       WHERE ${conditions.join(' AND ')}
       ORDER BY wo.updated_at DESC
       LIMIT $${idx}`,
      [...params, limit]
    );

    const data = rows.map(r => ({
      projectCode: r.projectCode,
      workOrderNo: r.workOrderNo,
      title:       r.title,
      vendorName:  r.vendorName,
      amount:      r.amount ?? 0,
      createdBy:   r.createdBy,
      status:      r.status,
      fileUrl:     `${APP_URL}/verify/wo/${r.id}`,
      pdfUrl:      r.docId ? `${APP_URL}/api/v1/integration/documents/${r.docId}/file` : null,
      updatedAt:   r.updatedAt,
    }));

    res.json(data);
  } catch (err) {
    console.error('[Integration] GET /work-orders error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/v1/integration/purchase-orders ────────────────────────────────
// purchase_orders: no company_id column — scoped via projects JOIN.
// Approval columns: authorized_md_by, authorized_md_at (confirmed in schema).
router.get('/purchase-orders', async (req, res) => {
  try {
    const status  = req.query.status  || 'approved';
    const since   = parseSince(req.query.since);
    const project = req.query.project || null;
    const limit   = Math.min(parseInt(req.query.limit) || 200, 1000);

    const conditions = ['p.company_id = $1', 'po.status = $2'];
    const params     = [req.apiCompanyId, status];
    let   idx        = 3;

    if (since)   { conditions.push(`po.updated_at >= $${idx++}`); params.push(since); }
    if (project) { conditions.push(`p.project_code ILIKE $${idx++}`); params.push(project); }

    const { rows } = await query(
      `SELECT
         p.project_code                                         AS "projectCode",
         COALESCE(po.serial_no_formatted,
                  po.po_ref_no, po.po_number)                  AS "purchaseOrderNo",
         v.name                                                 AS "vendorName",
         COALESCE(po.sub_total, 0)::float                      AS "subTotal",
         COALESCE(po.total_gst, 0)::float                      AS "totalGst",
         COALESCE(po.grand_total, 0)::float                    AS "amount",
         md.name                                               AS "approvedBy",
         po.authorized_md_at                                   AS "approvedAt",
         po.status                                             AS "status",
         po.id                                                 AS "id",
         po.updated_at                                         AS "updatedAt",
         doc.id                                                AS "docId"
       FROM purchase_orders po
       JOIN   projects p  ON p.id  = po.project_id
       LEFT JOIN vendors v  ON v.id  = po.vendor_id
       LEFT JOIN users  md ON md.id = po.authorized_md_by
       LEFT JOIN LATERAL (
         SELECT id FROM documents
         WHERE module = 'purchase_order' AND module_record_id = po.id
           AND file_type = '.pdf'
         ORDER BY created_at DESC LIMIT 1
       ) doc ON true
       WHERE ${conditions.join(' AND ')}
       ORDER BY po.updated_at DESC
       LIMIT $${idx}`,
      [...params, limit]
    );

    const data = rows.map(r => ({
      projectCode:     r.projectCode,
      purchaseOrderNo: r.purchaseOrderNo,
      vendorName:      r.vendorName,
      subTotal:        r.subTotal  ?? 0,
      totalGst:        r.totalGst  ?? 0,
      amount:          r.amount    ?? 0,
      approvedBy:      r.approvedBy,
      approvedAt:      r.approvedAt,
      status:          r.status,
      fileUrl:         `${APP_URL}/verify/po/${r.id}`,
      pdfUrl:          r.docId ? `${APP_URL}/api/v1/integration/documents/${r.docId}/file` : null,
      updatedAt:       r.updatedAt,
    }));

    res.json(data);
  } catch (err) {
    console.error('[Integration] GET /purchase-orders error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/v1/integration/mrs ────────────────────────────────────────────
// material_requisitions: no purpose column on header row — purpose lives on
// mrs_items. Header has: department, remarks, required_by, priority.
// Company scope: via projects JOIN.
router.get('/mrs', async (req, res) => {
  try {
    const status  = req.query.status  || null;
    const since   = parseSince(req.query.since);
    const project = req.query.project || null;
    const limit   = Math.min(parseInt(req.query.limit) || 200, 1000);

    const conditions = ['p.company_id = $1'];
    const params     = [req.apiCompanyId];
    let   idx        = 2;

    if (status)  { conditions.push(`mr.status = $${idx++}`);          params.push(status); }
    if (since)   { conditions.push(`mr.updated_at >= $${idx++}`);     params.push(since); }
    if (project) { conditions.push(`p.project_code ILIKE $${idx++}`); params.push(project); }

    const { rows } = await query(
      `SELECT
         p.project_code                                    AS "projectCode",
         p.name                                            AS "projectName",
         COALESCE(mr.serial_no_formatted, mr.mrs_number)  AS "mrsNo",
         mr.remarks                                        AS "remarks",
         mr.department                                     AS "department",
         mr.priority                                       AS "priority",
         mr.status                                         AS "status",
         rb.name                                           AS "requestedBy",
         mr.created_at                                     AS "requestedAt",
         md.name                                           AS "approvedBy",
         mr.approved_md_at                                 AS "approvedAt",
         mr.id                                             AS "id",
         mr.updated_at                                     AS "updatedAt",
         doc.id                                            AS "docId"
       FROM material_requisitions mr
       JOIN   projects p  ON p.id  = mr.project_id
       LEFT JOIN users rb ON rb.id = mr.raised_by
       LEFT JOIN users md ON md.id = mr.approved_md_by
       LEFT JOIN LATERAL (
         SELECT id FROM documents
         WHERE module = 'mrs' AND module_record_id = mr.id
           AND file_type = '.pdf'
         ORDER BY created_at DESC LIMIT 1
       ) doc ON true
       WHERE ${conditions.join(' AND ')}
       ORDER BY mr.updated_at DESC
       LIMIT $${idx}`,
      [...params, limit]
    );

    const ids = rows.map(r => r.id);
    const itemsByMrs = {};
    if (ids.length) {
      const { rows: items } = await query(
        `SELECT mrs_id, material_name, quantity, unit, purpose
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
          purpose:      it.purpose || null,
        });
      }
    }

    const data = rows.map(r => ({
      projectCode:  r.projectCode,
      projectName:  r.projectName,
      mrsNo:        r.mrsNo,
      remarks:      r.remarks,
      department:   r.department,
      priority:     r.priority,
      status:       r.status,
      requestedBy:  r.requestedBy,
      requestedAt:  r.requestedAt,
      approvedBy:   r.approvedBy,
      approvedAt:   r.approvedAt,
      items:        itemsByMrs[r.id] || [],
      fileUrl:      `${APP_URL}/verify/mrs/${r.id}`,
      pdfUrl:       r.docId ? `${APP_URL}/api/v1/integration/documents/${r.docId}/file` : null,
      updatedAt:    r.updatedAt,
    }));

    res.json(data);
  } catch (err) {
    console.error('[Integration] GET /mrs error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/v1/integration/documents/:docId/file ─────────────────────────
// Proxy download for DMS — same API key auth as all other routes.
// Scoped by company_id so cross-company doc access is impossible.
router.get('/documents/:docId/file', async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT local_url, onedrive_id, file_name, file_type
       FROM documents
       WHERE id = $1 AND company_id = $2`,
      [req.params.docId, req.apiCompanyId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Document not found' });
    const doc = rows[0];

    res.setHeader('Content-Disposition', `attachment; filename="${doc.file_name}"`);

    if (doc.onedrive_id && onedriveConfigured()) {
      const { buffer, contentType } = await downloadFromOneDrive(doc.onedrive_id);
      res.setHeader('Content-Type', contentType);
      return res.send(buffer);
    }

    if (doc.local_url) {
      const filePath = path.join(__dirname, '../../uploads', path.basename(doc.local_url));
      if (fs.existsSync(filePath)) return res.sendFile(filePath);
    }

    return res.status(410).json({ error: 'File bytes not available (ephemeral storage cleared on last deploy)' });
  } catch (err) {
    console.error('[Integration] GET /documents/:docId/file error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/v1/integration/ping ───────────────────────────────────────────
router.get('/ping', async (req, res) => {
  res.json({
    ok: true,
    companyId: req.apiCompanyId,
    scopes:    req.apiScopes,
    timestamp: new Date().toISOString(),
  });
});

module.exports = router;
