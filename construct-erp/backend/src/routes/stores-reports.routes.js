// src/routes/stores-reports.routes.js
// Unified endpoint for all 36 Stores Module reports
const express = require('express');
const router  = express.Router();
const { query } = require('../config/database');
const { authenticate } = require('../middleware/auth');
const { loadProjectScope } = require('../middleware/projectScope');

router.use(authenticate, loadProjectScope);

// ── helpers ──────────────────────────────────────────────────────────────────
function scopeWhere(req, alias) {
  if (req.isGlobalRole) return { extra: '', params: [] };
  const ids = req.allowedProjectIds || [];
  if (!ids.length) return { extra: ' AND FALSE', params: [] };
  return { extra: ` AND ${alias}.project_id = ANY($IDX::uuid[])`, params: [ids] };
}

function buildScope(req, baseParams, alias) {
  const { extra, params: sp } = scopeWhere(req, alias);
  const offset = baseParams.length;
  const extraFilled = extra.replace('$IDX', `$${offset + 1}`);
  return { scopeClause: extraFilled, allParams: [...baseParams, ...sp] };
}

// ── GET /stores-reports/:type ─────────────────────────────────────────────────
router.get('/:type', async (req, res) => {
  try {
    const { type } = req.params;
    const cid = req.user.company_id;
    const {
      project_id,
      from_date,
      to_date,
      category,
      days = '90',
      month,
    } = req.query;

    const fd = from_date || new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    const td = to_date   || new Date().toISOString().slice(0, 10);

    // project filter clause (inline)
    const pf    = project_id ? ` AND $PJ_ALIAS$.project_id = $PJ_IDX` : '';
    const pfV   = project_id ? [project_id] : [];

    let rows = [];

    // ── 1.1 Stock Ledger (daily transactions for an item) ──────────────────
    if (type === 'stock-ledger') {
      const base = [cid, fd, td + ' 23:59:59'];
      const { scopeClause, allParams } = buildScope(req, base, 'i');
      let sql = `
        SELECT
          p.name                    AS project_name,
          i.material_name,
          i.category,
          i.unit,
          st.transaction_type       AS txn_type,
          st.quantity,
          st.reference_number,
          st.remarks,
          st.transacted_at,
          u.name                    AS transacted_by
        FROM stock_transactions st
        JOIN inventory i ON i.id = st.inventory_id
        JOIN projects  p ON p.id  = i.project_id
        LEFT JOIN users u ON u.id = st.transacted_by
        WHERE p.company_id = $1
          AND st.transacted_at BETWEEN $2 AND $3
          ${category    ? ` AND LOWER(i.category) = LOWER('${category.replace(/'/g,"''")}')` : ''}
          ${project_id  ? ` AND i.project_id = '${project_id.replace(/'/g,"''")}' ` : ''}
          ${scopeClause}
        ORDER BY st.transacted_at DESC
        LIMIT 2000`;
      rows = (await query(sql, allParams)).rows;
    }

    // ── 1.2 Stock Statement ─────────────────────────────────────────────────
    else if (type === 'stock-statement') {
      const base = [cid];
      const { scopeClause, allParams } = buildScope(req, base, 'i');
      let sql = `
        SELECT
          p.name          AS project_name,
          i.category,
          i.material_name,
          i.unit,
          i.opening_stock,
          i.closing_stock,
          COALESCE(i.unit_rate,0)                       AS unit_rate,
          ROUND(i.closing_stock * COALESCE(i.unit_rate,0), 2) AS stock_value,
          i.site_location,
          i.last_updated
        FROM inventory i
        JOIN projects p ON p.id = i.project_id
        WHERE p.company_id = $1
          ${project_id ? ` AND i.project_id = '${project_id.replace(/'/g,"''")}' ` : ''}
          ${category   ? ` AND LOWER(i.category) = LOWER('${category.replace(/'/g,"''")}')` : ''}
          ${scopeClause}
        ORDER BY p.name, i.category, i.material_name`;
      rows = (await query(sql, allParams)).rows;
    }

    // ── 1.3 Minimum Stock Alert ─────────────────────────────────────────────
    else if (type === 'min-stock') {
      const base = [cid];
      const { scopeClause, allParams } = buildScope(req, base, 'i');
      let sql = `
        SELECT
          p.name          AS project_name,
          i.category,
          i.material_name,
          i.unit,
          i.closing_stock AS current_stock,
          i.reorder_level,
          i.minimum_level,
          ROUND((i.closing_stock - i.reorder_level), 3) AS shortage,
          CASE
            WHEN i.closing_stock <= COALESCE(i.minimum_level,0) THEN 'Critical'
            WHEN i.closing_stock <= i.reorder_level             THEN 'Below Reorder'
            ELSE 'OK'
          END AS alert_level
        FROM inventory i
        JOIN projects p ON p.id = i.project_id
        WHERE p.company_id = $1
          AND i.reorder_level > 0
          AND i.closing_stock <= i.reorder_level
          ${project_id ? ` AND i.project_id = '${project_id.replace(/'/g,"''")}' ` : ''}
          ${category   ? ` AND LOWER(i.category) = LOWER('${category.replace(/'/g,"''")}')` : ''}
          ${scopeClause}
        ORDER BY (i.closing_stock / NULLIF(i.reorder_level,0)) ASC`;
      rows = (await query(sql, allParams)).rows;
    }

    // ── 1.4 Slow Moving Stock ───────────────────────────────────────────────
    else if (type === 'slow-moving') {
      const nDays = parseInt(days) || 90;
      const base = [cid, nDays];
      const { scopeClause, allParams } = buildScope(req, base, 'i');
      let sql = `
        SELECT
          p.name          AS project_name,
          i.category,
          i.material_name,
          i.unit,
          i.closing_stock,
          COALESCE(i.unit_rate,0)                           AS unit_rate,
          ROUND(i.closing_stock * COALESCE(i.unit_rate,0),2) AS stock_value,
          MAX(st.transacted_at)::date                       AS last_movement_date,
          NOW()::date - MAX(st.transacted_at)::date         AS days_idle
        FROM inventory i
        JOIN projects p ON p.id = i.project_id
        LEFT JOIN stock_transactions st ON st.inventory_id = i.id
        WHERE p.company_id = $1
          AND i.closing_stock > 0
          ${project_id ? ` AND i.project_id = '${project_id.replace(/'/g,"''")}' ` : ''}
          ${category   ? ` AND LOWER(i.category) = LOWER('${category.replace(/'/g,"''")}')` : ''}
          ${scopeClause}
        GROUP BY i.id, p.name
        HAVING MAX(st.transacted_at) < NOW() - ($2 || ' days')::interval
            OR MAX(st.transacted_at) IS NULL
        ORDER BY days_idle DESC NULLS FIRST`;
      rows = (await query(sql, allParams)).rows;
    }

    // ── 1.5 Dead Stock ──────────────────────────────────────────────────────
    else if (type === 'dead-stock') {
      const base = [cid];
      const { scopeClause, allParams } = buildScope(req, base, 'i');
      let sql = `
        SELECT
          p.name          AS project_name,
          i.category,
          i.material_name,
          i.unit,
          i.closing_stock,
          COALESCE(i.unit_rate,0)                           AS unit_rate,
          ROUND(i.closing_stock * COALESCE(i.unit_rate,0),2) AS stock_value,
          MAX(st.transacted_at)::date                       AS last_movement_date,
          NOW()::date - MAX(st.transacted_at)::date         AS days_idle
        FROM inventory i
        JOIN projects p ON p.id = i.project_id
        LEFT JOIN stock_transactions st ON st.inventory_id = i.id
        WHERE p.company_id = $1
          AND i.closing_stock > 0
          ${project_id ? ` AND i.project_id = '${project_id.replace(/'/g,"''")}' ` : ''}
          ${category   ? ` AND LOWER(i.category) = LOWER('${category.replace(/'/g,"''")}')` : ''}
          ${scopeClause}
        GROUP BY i.id, p.name
        HAVING MAX(st.transacted_at) < NOW() - INTERVAL '90 days'
            OR MAX(st.transacted_at) IS NULL
        ORDER BY days_idle DESC NULLS FIRST`;
      rows = (await query(sql, allParams)).rows;
    }

    // ── 1.6 Item-wise Stock Summary ─────────────────────────────────────────
    else if (type === 'item-summary') {
      const base = [cid, fd, td + ' 23:59:59'];
      const { scopeClause, allParams } = buildScope(req, base, 'i');
      let sql = `
        SELECT
          p.name          AS project_name,
          i.category,
          i.material_name,
          i.unit,
          i.opening_stock,
          COALESCE(rx.received,0)   AS received,
          COALESCE(ix.issued,0)     AS issued,
          COALESCE(tx.transferred,0) AS transferred,
          i.closing_stock,
          COALESCE(i.unit_rate,0)                            AS unit_rate,
          ROUND(i.closing_stock * COALESCE(i.unit_rate,0),2) AS closing_value
        FROM inventory i
        JOIN projects p ON p.id = i.project_id
        LEFT JOIN (SELECT inventory_id, SUM(quantity) AS received
                   FROM stock_transactions
                   WHERE transaction_type IN ('grn','bill_receipt','transfer_in')
                     AND transacted_at BETWEEN $2 AND $3
                   GROUP BY inventory_id) rx ON rx.inventory_id = i.id
        LEFT JOIN (SELECT inventory_id, SUM(quantity) AS issued
                   FROM stock_transactions
                   WHERE transaction_type IN ('issue','transfer_out')
                     AND transacted_at BETWEEN $2 AND $3
                   GROUP BY inventory_id) ix ON ix.inventory_id = i.id
        LEFT JOIN (SELECT inventory_id, SUM(quantity) AS transferred
                   FROM stock_transactions
                   WHERE transaction_type IN ('transfer_in','transfer_out')
                     AND transacted_at BETWEEN $2 AND $3
                   GROUP BY inventory_id) tx ON tx.inventory_id = i.id
        WHERE p.company_id = $1
          ${project_id ? ` AND i.project_id = '${project_id.replace(/'/g,"''")}' ` : ''}
          ${category   ? ` AND LOWER(i.category) = LOWER('${category.replace(/'/g,"''")}')` : ''}
          ${scopeClause}
        ORDER BY p.name, i.category, i.material_name`;
      rows = (await query(sql, allParams)).rows;
    }

    // ── 2.1 MRN Register ────────────────────────────────────────────────────
    else if (type === 'mrn-register') {
      const base = [cid, fd, td + ' 23:59:59'];
      const { scopeClause, allParams } = buildScope(req, base, 'g');
      let sql = `
        SELECT
          g.grn_number,
          g.grn_date,
          p.name          AS project_name,
          v.name          AS vendor_name,
          COALESCE(po.serial_no_formatted, po.po_number) AS po_number,
          NULL            AS invoice_number,
          g.quality_status AS status,
          items.items_summary AS materials,
          COALESCE(items.total_qty, g.total_quantity, 0) AS total_qty,
          g.gate_pass_no  AS vehicle_number,
          u.name          AS received_by_name,
          g.remarks
        FROM grn g
        JOIN projects p ON p.id = g.project_id
        LEFT JOIN vendors v ON v.id = g.vendor_id
        LEFT JOIN purchase_orders po ON po.id = g.po_id
        LEFT JOIN users u ON u.id = g.received_by
        LEFT JOIN LATERAL (
          SELECT STRING_AGG(gi.material_name, ', ' ORDER BY gi.sort_order) AS items_summary,
                 SUM(gi.quantity_received) AS total_qty
          FROM grn_items gi WHERE gi.grn_id = g.id
        ) items ON true
        WHERE p.company_id = $1
          AND g.grn_date BETWEEN $2 AND $3
          ${project_id ? ` AND g.project_id = '${project_id.replace(/'/g,"''")}' ` : ''}
          ${scopeClause}
        ORDER BY g.grn_date DESC`;
      rows = (await query(sql, allParams)).rows;
    }

    // ── 2.2 MIS Register ────────────────────────────────────────────────────
    else if (type === 'mis-register') {
      const base = [cid, fd, td + ' 23:59:59'];
      const { scopeClause, allParams } = buildScope(req, base, 'i');
      let sql = `
        SELECT
          st.transacted_at::date  AS issue_date,
          p.name                  AS project_name,
          i.category,
          i.material_name,
          i.unit,
          st.quantity             AS issued_qty,
          st.reference_number     AS mis_number,
          st.remarks,
          u.name                  AS issued_by,
          COALESCE(i.unit_rate,0) AS unit_rate,
          ROUND(st.quantity * COALESCE(i.unit_rate,0),2) AS value
        FROM stock_transactions st
        JOIN inventory i ON i.id = st.inventory_id
        JOIN projects  p ON p.id  = i.project_id
        LEFT JOIN users u ON u.id = st.transacted_by
        WHERE p.company_id = $1
          AND st.transaction_type = 'issue'
          AND st.transacted_at BETWEEN $2 AND $3
          ${project_id ? ` AND i.project_id = '${project_id.replace(/'/g,"''")}' ` : ''}
          ${category   ? ` AND LOWER(i.category) = LOWER('${category.replace(/'/g,"''")}')` : ''}
          ${scopeClause}
        ORDER BY st.transacted_at DESC`;
      rows = (await query(sql, allParams)).rows;
    }

    // ── 2.3 Inter-Store Transfer ─────────────────────────────────────────────
    else if (type === 'inter-store-transfer') {
      const base = [cid, fd, td + ' 23:59:59'];
      let params = base;
      let sql = `
        SELECT
          m.mtr_number,
          m.created_at::date AS transfer_date,
          fp.name  AS from_project,
          tp.name  AS to_project,
          m.purpose,
          m.vehicle_number,
          m.status,
          cb.name  AS requested_by,
          items.item_count,
          COALESCE(items.total_amount,0) AS total_value
        FROM material_transfers m
        LEFT JOIN projects fp ON fp.id = m.from_project_id
        LEFT JOIN projects tp ON tp.id = m.to_project_id
        LEFT JOIN users    cb ON cb.id = m.created_by
        LEFT JOIN LATERAL (
          SELECT COUNT(*) AS item_count, SUM(COALESCE(amount,0)) AS total_amount
          FROM material_transfer_items WHERE mtr_id = m.id
        ) items ON true
        WHERE m.company_id = $1
          AND m.created_at BETWEEN $2 AND $3
          ${project_id ? ` AND (m.from_project_id = '${project_id.replace(/'/g,"''")}' OR m.to_project_id = '${project_id.replace(/'/g,"''")}')` : ''}
        ORDER BY m.created_at DESC`;
      rows = (await query(sql, params)).rows;
    }

    // ── 2.4 Material Return ──────────────────────────────────────────────────
    else if (type === 'material-return') {
      const base = [cid, fd, td + ' 23:59:59'];
      const { scopeClause, allParams } = buildScope(req, base, 'i');
      let sql = `
        SELECT
          st.transacted_at::date  AS return_date,
          p.name                  AS project_name,
          i.category,
          i.material_name,
          i.unit,
          st.quantity             AS return_qty,
          st.reference_number     AS return_ref,
          st.remarks,
          u.name                  AS returned_by
        FROM stock_transactions st
        JOIN inventory i ON i.id = st.inventory_id
        JOIN projects  p ON p.id  = i.project_id
        LEFT JOIN users u ON u.id = st.transacted_by
        WHERE p.company_id = $1
          AND st.transaction_type IN ('return','site_return')
          AND st.transacted_at BETWEEN $2 AND $3
          ${project_id ? ` AND i.project_id = '${project_id.replace(/'/g,"''")}' ` : ''}
          ${scopeClause}
        ORDER BY st.transacted_at DESC`;
      rows = (await query(sql, allParams)).rows;
    }

    // ── 2.5 Gate Pass Register ───────────────────────────────────────────────
    else if (type === 'gate-pass') {
      const base = [cid, fd, td + ' 23:59:59'];
      const { scopeClause, allParams } = buildScope(req, base, 'gp');
      let sql = `
        SELECT
          gp.gp_number AS gate_pass_number,
          gp.date_time::date AS pass_date,
          gp.pass_type,
          p.name   AS project_name,
          gp.vehicle_no,
          gp.issued_to,
          gp.issued_by,
          gp.authorised_by,
          gp.status,
          items.item_count,
          gp.remarks
        FROM gate_passes gp
        JOIN projects p ON p.id = gp.project_id
        LEFT JOIN LATERAL (
          SELECT COUNT(*) AS item_count
          FROM gate_pass_items WHERE gp_id = gp.id
        ) items ON true
        WHERE p.company_id = $1
          AND gp.date_time BETWEEN $2 AND $3
          ${project_id ? ` AND gp.project_id = '${project_id.replace(/'/g,"''")}' ` : ''}
          ${scopeClause}
        ORDER BY gp.date_time DESC`;
      rows = (await query(sql, allParams)).rows;
    }

    // ── 2.6 Rejection / Inspection Failure ──────────────────────────────────
    else if (type === 'rejection') {
      const base = [cid, fd, td + ' 23:59:59'];
      const { scopeClause, allParams } = buildScope(req, base, 'g');
      let sql = `
        SELECT
          g.grn_number,
          g.grn_date,
          p.name   AS project_name,
          v.name   AS vendor_name,
          COALESCE(po.serial_no_formatted, po.po_number) AS po_number,
          items.items_summary AS materials,
          COALESCE(items.total_qty, g.total_quantity, 0) AS rejected_qty,
          g.remarks AS rejection_reason,
          g.quality_status
        FROM grn g
        JOIN projects p ON p.id = g.project_id
        LEFT JOIN vendors v ON v.id = g.vendor_id
        LEFT JOIN purchase_orders po ON po.id = g.po_id
        LEFT JOIN LATERAL (
          SELECT STRING_AGG(gi.material_name, ', ') AS items_summary,
                 SUM(gi.quantity_received) AS total_qty
          FROM grn_items gi WHERE gi.grn_id = g.id
        ) items ON true
        WHERE p.company_id = $1
          AND g.quality_status IN ('rejected','partial')
          AND g.grn_date BETWEEN $2 AND $3
          ${project_id ? ` AND g.project_id = '${project_id.replace(/'/g,"''")}' ` : ''}
          ${scopeClause}
        ORDER BY g.grn_date DESC`;
      rows = (await query(sql, allParams)).rows;
    }

    // ── 3.1 PO Status Report ─────────────────────────────────────────────────
    else if (type === 'po-status') {
      const base = [cid, fd, td + ' 23:59:59'];
      const { scopeClause, allParams } = buildScope(req, base, 'po');
      let sql = `
        SELECT
          COALESCE(po.serial_no_formatted, po.po_number) AS po_number,
          po.po_date,
          p.name   AS project_name,
          v.name   AS vendor_name,
          po.status,
          po.grand_total,
          po.delivery_date,
          CASE WHEN po.status = 'fully_received' THEN po.grand_total ELSE 0 END AS received_value,
          CASE WHEN po.status = 'fully_received' THEN 0 ELSE po.grand_total END AS pending_value,
          po.terms_conditions AS payment_terms,
          po.po_req_no AS cost_head
        FROM purchase_orders po
        JOIN projects p ON p.id = po.project_id
        LEFT JOIN vendors v ON v.id = po.vendor_id
        WHERE p.company_id = $1
          AND po.status NOT IN ('draft')
          AND po.po_date BETWEEN $2 AND $3
          ${project_id ? ` AND po.project_id = '${project_id.replace(/'/g,"''")}' ` : ''}
          ${scopeClause}
        ORDER BY po.po_date DESC`;
      rows = (await query(sql, allParams)).rows;
    }

    // ── 3.2 GRN vs Invoice Reconciliation ────────────────────────────────────
    else if (type === 'grn-invoice-recon') {
      const base = [cid, fd, td + ' 23:59:59'];
      const { scopeClause, allParams } = buildScope(req, base, 'g');
      let sql = `
        SELECT
          g.grn_number,
          g.grn_date,
          p.name   AS project_name,
          v.name   AS vendor_name,
          b.inv_number   AS invoice_number,
          b.inv_date     AS invoice_date,
          COALESCE(items.total_qty,0)  AS received_qty,
          b.total_amount               AS invoice_amount,
          CASE WHEN b.inv_number IS NULL THEN 'No Bill Linked' ELSE 'Matched' END AS recon_status,
          b.workflow_status            AS bill_status
        FROM grn g
        JOIN projects p ON p.id = g.project_id
        LEFT JOIN vendors v ON v.id = g.vendor_id
        LEFT JOIN purchase_orders po ON po.id = g.po_id
        LEFT JOIN LATERAL (
          SELECT SUM(gi.quantity_received) AS total_qty
          FROM grn_items gi WHERE gi.grn_id = g.id
        ) items ON true
        LEFT JOIN tqs_bills b ON LOWER(TRIM(b.po_number)) = LOWER(TRIM(COALESCE(po.serial_no_formatted, po.po_number)))
                              AND b.project_id = g.project_id
        WHERE p.company_id = $1
          AND g.grn_date BETWEEN $2 AND $3
          AND g.quality_status NOT IN ('rejected')
          ${project_id ? ` AND g.project_id = '${project_id.replace(/'/g,"''")}' ` : ''}
          ${scopeClause}
        ORDER BY g.grn_date DESC`;
      rows = (await query(sql, allParams)).rows;
    }

    // ── 3.3 Pending MRS ─────────────────────────────────────────────────────
    else if (type === 'pending-mrs') {
      const base = [cid];
      const { scopeClause, allParams } = buildScope(req, base, 'mr');
      let sql = `
        SELECT
          mr.mrs_number,
          mr.created_at::date AS raised_date,
          p.name   AS project_name,
          u.name   AS raised_by,
          mr.status,
          items.item_count,
          items.materials,
          NOW()::date - mr.created_at::date AS age_days
        FROM material_requisitions mr
        JOIN projects p ON p.id = mr.project_id
        JOIN users    u ON u.id = mr.raised_by
        LEFT JOIN LATERAL (
          SELECT COUNT(*) AS item_count,
                 STRING_AGG(mi.material_name, ', ' ORDER BY mi.sort_order) AS materials
          FROM mrs_items mi WHERE mi.mrs_id = mr.id
        ) items ON true
        WHERE p.company_id = $1
          AND mr.status IN ('pending','submitted','stores_verified','approved_pm','approved_srpm')
          ${project_id ? ` AND mr.project_id = '${project_id.replace(/'/g,"''")}' ` : ''}
          ${scopeClause}
        ORDER BY mr.created_at ASC`;
      rows = (await query(sql, allParams)).rows;
    }

    // ── 3.4 Vendor-wise Purchase Analysis ────────────────────────────────────
    else if (type === 'vendor-analysis') {
      const base = [cid, fd, td + ' 23:59:59'];
      const { scopeClause, allParams } = buildScope(req, base, 'po');
      let sql = `
        SELECT
          v.name   AS vendor_name,
          v.vendor_type,
          v.gstin,
          COUNT(DISTINCT po.id)           AS po_count,
          SUM(po.grand_total)             AS total_purchase_value,
          AVG(po.grand_total)             AS avg_po_value,
          COUNT(DISTINCT po.project_id)   AS project_count,
          STRING_AGG(DISTINCT p.name, ', ') AS projects
        FROM purchase_orders po
        JOIN vendors  v ON v.id  = po.vendor_id
        JOIN projects p ON p.id  = po.project_id
        WHERE p.company_id = $1
          AND po.status NOT IN ('draft','cancelled')
          AND po.po_date BETWEEN $2 AND $3
          ${project_id ? ` AND po.project_id = '${project_id.replace(/'/g,"''")}' ` : ''}
          ${scopeClause}
        GROUP BY v.id, v.name, v.vendor_type, v.gstin
        ORDER BY total_purchase_value DESC`;
      rows = (await query(sql, allParams)).rows;
    }

    // ── 3.5 Rate Comparison Statement ────────────────────────────────────────
    else if (type === 'rate-comparison') {
      const base = [cid, fd, td + ' 23:59:59'];
      const { scopeClause, allParams } = buildScope(req, base, 'po');
      let sql = `
        SELECT
          pi.material_name,
          pi.unit,
          v.name        AS vendor_name,
          po.po_date,
          p.name        AS project_name,
          pi.rate       AS quoted_rate,
          pi.quantity,
          ROUND(pi.rate * pi.quantity,2) AS line_total,
          MIN(pi.rate) OVER (PARTITION BY LOWER(TRIM(pi.material_name))) AS min_rate,
          MAX(pi.rate) OVER (PARTITION BY LOWER(TRIM(pi.material_name))) AS max_rate,
          AVG(pi.rate) OVER (PARTITION BY LOWER(TRIM(pi.material_name))) AS avg_rate
        FROM po_items pi
        JOIN purchase_orders po ON po.id = pi.po_id
        JOIN projects  p ON p.id  = po.project_id
        JOIN vendors   v ON v.id  = po.vendor_id
        WHERE p.company_id = $1
          AND po.status NOT IN ('draft','cancelled')
          AND po.po_date BETWEEN $2 AND $3
          ${project_id ? ` AND po.project_id = '${project_id.replace(/'/g,"''")}' ` : ''}
          ${scopeClause}
        ORDER BY pi.material_name, po.po_date DESC`;
      rows = (await query(sql, allParams)).rows;
    }

    // ── 3.6 Pending Delivery ─────────────────────────────────────────────────
    else if (type === 'pending-delivery') {
      const base = [cid];
      const { scopeClause, allParams } = buildScope(req, base, 'po');
      let sql = `
        SELECT
          COALESCE(po.serial_no_formatted, po.po_number) AS po_number,
          po.po_date,
          po.delivery_date,
          p.name   AS project_name,
          v.name   AS vendor_name,
          po.grand_total,
          0 AS received_value,
          po.grand_total AS balance_value,
          NOW()::date - po.delivery_date::date AS overdue_days,
          po.status
        FROM purchase_orders po
        JOIN projects p ON p.id = po.project_id
        LEFT JOIN vendors v ON v.id = po.vendor_id
        WHERE p.company_id = $1
          AND po.status NOT IN ('draft','cancelled','fully_received')
          AND (po.delivery_date IS NOT NULL)
          ${project_id ? ` AND po.project_id = '${project_id.replace(/'/g,"''")}' ` : ''}
          ${scopeClause}
        ORDER BY po.delivery_date ASC`;
      rows = (await query(sql, allParams)).rows;
    }

    // ── 4.1 Budget vs Actual Material Consumption ─────────────────────────────
    else if (type === 'budget-vs-actual') {
      const base = [cid];
      const { scopeClause, allParams } = buildScope(req, base, 'i');
      let sql = `
        SELECT
          p.name           AS project_name,
          bi.cost_head,
          COALESCE(bi.budgeted_amount,0) AS budgeted_amount,
          COALESCE(SUM(st.quantity * COALESCE(i.unit_rate,0)),0) AS actual_consumption_value,
          COALESCE(bi.budgeted_amount,0) - COALESCE(SUM(st.quantity * COALESCE(i.unit_rate,0)),0) AS variance,
          CASE WHEN COALESCE(bi.budgeted_amount,0)>0
               THEN ROUND(COALESCE(SUM(st.quantity*COALESCE(i.unit_rate,0)),0)/bi.budgeted_amount*100,1)
               ELSE 0 END AS pct_used
        FROM inventory i
        JOIN projects p ON p.id = i.project_id
        LEFT JOIN budget_items bi ON bi.project_id = i.project_id AND p.company_id = $1
        LEFT JOIN stock_transactions st ON st.inventory_id = i.id
          AND st.transaction_type = 'issue'
        WHERE p.company_id = $1
          ${project_id ? ` AND i.project_id = '${project_id.replace(/'/g,"''")}' ` : ''}
          ${scopeClause}
        GROUP BY p.name, bi.cost_head, bi.budgeted_amount
        ORDER BY p.name, bi.cost_head`;
      rows = (await query(sql, allParams)).rows;
    }

    // ── 4.2 Project-wise Material Cost ────────────────────────────────────────
    else if (type === 'project-material-cost') {
      const base = [cid, fd, td + ' 23:59:59'];
      const { scopeClause, allParams } = buildScope(req, base, 'i');
      let sql = `
        SELECT
          p.name           AS project_name,
          i.category,
          COUNT(DISTINCT i.id)::int                        AS item_count,
          SUM(st.quantity)                                 AS total_issued_qty,
          SUM(st.quantity * COALESCE(i.unit_rate,0))       AS total_issue_value,
          SUM(i.closing_stock * COALESCE(i.unit_rate,0))   AS closing_stock_value
        FROM inventory i
        JOIN projects p ON p.id = i.project_id
        LEFT JOIN stock_transactions st ON st.inventory_id = i.id
          AND st.transaction_type = 'issue'
          AND st.transacted_at BETWEEN $2 AND $3
        WHERE p.company_id = $1
          ${project_id ? ` AND i.project_id = '${project_id.replace(/'/g,"''")}' ` : ''}
          ${scopeClause}
        GROUP BY p.id, p.name, i.category
        ORDER BY p.name, total_issue_value DESC NULLS LAST`;
      rows = (await query(sql, allParams)).rows;
    }

    // ── 4.3 WO-wise Material Issue ────────────────────────────────────────────
    else if (type === 'wo-material-issue') {
      const base = [cid, fd, td + ' 23:59:59'];
      const { scopeClause, allParams } = buildScope(req, base, 'i');
      let sql = `
        SELECT
          st.transacted_at::date AS issue_date,
          p.name        AS project_name,
          st.reference_number   AS wo_number,
          i.material_name,
          i.category,
          i.unit,
          st.quantity   AS issued_qty,
          COALESCE(i.unit_rate,0) AS unit_rate,
          ROUND(st.quantity * COALESCE(i.unit_rate,0),2) AS value,
          u.name        AS issued_by,
          st.remarks
        FROM stock_transactions st
        JOIN inventory i ON i.id = st.inventory_id
        JOIN projects  p ON p.id  = i.project_id
        LEFT JOIN users u ON u.id = st.transacted_by
        WHERE p.company_id = $1
          AND st.transaction_type = 'issue'
          AND st.transacted_at BETWEEN $2 AND $3
          AND st.reference_number ILIKE '%WO%'
          ${project_id ? ` AND i.project_id = '${project_id.replace(/'/g,"''")}' ` : ''}
          ${scopeClause}
        ORDER BY st.reference_number, st.transacted_at DESC`;
      rows = (await query(sql, allParams)).rows;
    }

    // ── 4.4 Wastage & Scrap ───────────────────────────────────────────────────
    else if (type === 'wastage-scrap') {
      const base = [cid, fd, td + ' 23:59:59'];
      const { scopeClause, allParams } = buildScope(req, base, 'i');
      let sql = `
        SELECT
          st.transacted_at::date AS date,
          p.name        AS project_name,
          i.category,
          i.material_name,
          i.unit,
          st.quantity   AS qty,
          COALESCE(i.unit_rate,0) AS unit_rate,
          ROUND(st.quantity * COALESCE(i.unit_rate,0),2) AS value,
          st.transaction_type,
          st.remarks,
          u.name        AS recorded_by
        FROM stock_transactions st
        JOIN inventory i ON i.id = st.inventory_id
        JOIN projects  p ON p.id  = i.project_id
        LEFT JOIN users u ON u.id = st.transacted_by
        WHERE p.company_id = $1
          AND st.transaction_type IN ('write_off','scrap','adjustment_negative','adjustment')
          AND st.transacted_at BETWEEN $2 AND $3
          ${project_id ? ` AND i.project_id = '${project_id.replace(/'/g,"''")}' ` : ''}
          ${scopeClause}
        ORDER BY st.transacted_at DESC`;
      rows = (await query(sql, allParams)).rows;
    }

    // ── 4.5 Material Reconciliation ───────────────────────────────────────────
    else if (type === 'material-recon') {
      const base = [cid, fd, td + ' 23:59:59'];
      const { scopeClause, allParams } = buildScope(req, base, 'i');
      let sql = `
        SELECT
          p.name         AS project_name,
          i.category,
          i.material_name,
          i.unit,
          i.opening_stock,
          COALESCE(rx.received,0)   AS total_received,
          COALESCE(ix.issued,0)     AS total_issued,
          COALESCE(rx.received,0) - COALESCE(ix.issued,0) + i.opening_stock AS computed_closing,
          i.closing_stock           AS book_closing,
          ROUND((COALESCE(rx.received,0) - COALESCE(ix.issued,0) + i.opening_stock) - i.closing_stock, 3) AS variance
        FROM inventory i
        JOIN projects p ON p.id = i.project_id
        LEFT JOIN (SELECT inventory_id, SUM(quantity) AS received
                   FROM stock_transactions
                   WHERE transaction_type IN ('grn','bill_receipt','transfer_in')
                     AND transacted_at BETWEEN $2 AND $3
                   GROUP BY inventory_id) rx ON rx.inventory_id = i.id
        LEFT JOIN (SELECT inventory_id, SUM(quantity) AS issued
                   FROM stock_transactions
                   WHERE transaction_type IN ('issue','transfer_out','write_off','scrap')
                     AND transacted_at BETWEEN $2 AND $3
                   GROUP BY inventory_id) ix ON ix.inventory_id = i.id
        WHERE p.company_id = $1
          ${project_id ? ` AND i.project_id = '${project_id.replace(/'/g,"''")}' ` : ''}
          ${scopeClause}
        ORDER BY ABS(COALESCE(rx.received,0) - COALESCE(ix.issued,0) + i.opening_stock - i.closing_stock) DESC`;
      rows = (await query(sql, allParams)).rows;
    }

    // ── 4.6 Cost Code-wise Material Expenditure ───────────────────────────────
    else if (type === 'cost-code') {
      const base = [cid, fd, td + ' 23:59:59'];
      const { scopeClause, allParams } = buildScope(req, base, 'i');
      let sql = `
        SELECT
          p.name         AS project_name,
          COALESCE(i.major_head, i.category, 'Unclassified') AS cost_head,
          i.category,
          COUNT(DISTINCT i.id)::int                   AS item_count,
          SUM(st.quantity)                            AS total_issued_qty,
          SUM(st.quantity * COALESCE(i.unit_rate,0)) AS total_value
        FROM inventory i
        JOIN projects p ON p.id = i.project_id
        LEFT JOIN stock_transactions st ON st.inventory_id = i.id
          AND st.transaction_type = 'issue'
          AND st.transacted_at BETWEEN $2 AND $3
        WHERE p.company_id = $1
          ${project_id ? ` AND i.project_id = '${project_id.replace(/'/g,"''")}' ` : ''}
          ${scopeClause}
        GROUP BY p.name, COALESCE(i.major_head, i.category, 'Unclassified'), i.category
        ORDER BY total_value DESC NULLS LAST`;
      rows = (await query(sql, allParams)).rows;
    }

    // ── 5.1 Inventory Valuation ───────────────────────────────────────────────
    else if (type === 'inventory-valuation') {
      const base = [cid];
      const { scopeClause, allParams } = buildScope(req, base, 'i');
      let sql = `
        SELECT
          p.name         AS project_name,
          i.category,
          i.material_name,
          i.unit,
          i.closing_stock AS quantity,
          COALESCE(i.unit_rate,0) AS weighted_avg_rate,
          ROUND(i.closing_stock * COALESCE(i.unit_rate,0),2) AS stock_value,
          i.site_location,
          i.last_updated
        FROM inventory i
        JOIN projects p ON p.id = i.project_id
        WHERE p.company_id = $1
          AND i.closing_stock > 0
          ${project_id ? ` AND i.project_id = '${project_id.replace(/'/g,"''")}' ` : ''}
          ${category   ? ` AND LOWER(i.category) = LOWER('${category.replace(/'/g,"''")}')` : ''}
          ${scopeClause}
        ORDER BY stock_value DESC`;
      rows = (await query(sql, allParams)).rows;
    }

    // ── 5.2 Physical vs Book Stock ────────────────────────────────────────────
    else if (type === 'physical-vs-book') {
      const base = [cid, fd, td + ' 23:59:59'];
      const { scopeClause, allParams } = buildScope(req, base, 'i');
      let sql = `
        SELECT
          sv.verification_date,
          p.name         AS project_name,
          i.material_name,
          i.unit,
          svi.book_stock     AS book_quantity,
          svi.physical_stock AS physical_quantity,
          ROUND(svi.physical_stock - svi.book_stock, 3) AS variance,
          CASE WHEN svi.physical_stock > svi.book_stock THEN 'Surplus'
               WHEN svi.physical_stock < svi.book_stock THEN 'Shortage'
               ELSE 'Matched' END AS variance_type,
          svi.reason     AS remarks,
          sv.verified_by
        FROM stock_verification_items svi
        JOIN stock_verifications sv ON sv.id = svi.verification_id
        JOIN inventory i ON i.id = svi.inventory_id
        JOIN projects  p ON p.id = i.project_id
        WHERE p.company_id = $1
          AND sv.verification_date BETWEEN $2 AND $3
          ${project_id ? ` AND i.project_id = '${project_id.replace(/'/g,"''")}' ` : ''}
          ${scopeClause}
        ORDER BY ABS(svi.physical_stock - svi.book_stock) DESC`;
      rows = (await query(sql, allParams)).rows;
    }

    // ── 5.3 Expiry & Shelf Life ───────────────────────────────────────────────
    else if (type === 'expiry-tracking') {
      const base = [cid];
      const { scopeClause, allParams } = buildScope(req, base, 'i');
      let sql = `
        SELECT
          p.name         AS project_name,
          i.category,
          i.material_name,
          i.unit,
          ib.batch_number,
          ib.current_quantity AS qty,
          ib.created_at AS received_date,
          ib.expiry_date,
          ib.expiry_date::date - NOW()::date AS days_to_expiry,
          CASE
            WHEN ib.expiry_date < NOW() THEN 'Expired'
            WHEN ib.expiry_date < NOW() + INTERVAL '30 days' THEN 'Expiring Soon'
            WHEN ib.expiry_date < NOW() + INTERVAL '90 days' THEN 'Expiring in 90 days'
            ELSE 'OK'
          END AS expiry_status
        FROM inventory_batches ib
        JOIN inventory i ON i.id = ib.inventory_id
        JOIN projects  p ON p.id = i.project_id
        WHERE p.company_id = $1
          AND ib.current_quantity > 0
          AND ib.expiry_date IS NOT NULL
          ${project_id ? ` AND i.project_id = '${project_id.replace(/'/g,"''")}' ` : ''}
          ${scopeClause}
        ORDER BY ib.expiry_date ASC`;
      rows = (await query(sql, allParams)).rows;
    }

    // ── 5.4 ABC Analysis ──────────────────────────────────────────────────────
    else if (type === 'abc-analysis') {
      const base = [cid, fd, td + ' 23:59:59'];
      const { scopeClause, allParams } = buildScope(req, base, 'i');
      let sql = `
        WITH consumption AS (
          SELECT i.id, i.material_name, i.category, i.unit, p.name AS project_name,
                 SUM(st.quantity * COALESCE(i.unit_rate,0)) AS consumption_value
          FROM inventory i
          JOIN projects p ON p.id = i.project_id
          LEFT JOIN stock_transactions st ON st.inventory_id = i.id
            AND st.transaction_type = 'issue'
            AND st.transacted_at BETWEEN $2 AND $3
          WHERE p.company_id = $1
            ${project_id ? ` AND i.project_id = '${project_id.replace(/'/g,"''")}' ` : ''}
          GROUP BY i.id, i.material_name, i.category, i.unit, p.name
        ),
        totals AS (SELECT SUM(consumption_value) AS grand_total FROM consumption),
        ranked AS (
          SELECT *, consumption_value / NULLIF(totals.grand_total,0) * 100 AS pct,
                 SUM(consumption_value / NULLIF(totals.grand_total,0) * 100)
                   OVER (ORDER BY consumption_value DESC) AS cumulative_pct
          FROM consumption, totals
        )
        SELECT *,
          CASE WHEN cumulative_pct <= 70 THEN 'A'
               WHEN cumulative_pct <= 90 THEN 'B'
               ELSE 'C' END AS abc_class
        FROM ranked
        ORDER BY consumption_value DESC`;
      rows = (await query(sql, allParams)).rows;
    }

    // ── 5.5 Stock Ageing ──────────────────────────────────────────────────────
    else if (type === 'stock-ageing') {
      const base = [cid];
      const { scopeClause, allParams } = buildScope(req, base, 'i');
      let sql = `
        SELECT
          p.name         AS project_name,
          i.category,
          i.material_name,
          i.unit,
          ib.batch_number,
          ib.current_quantity AS qty,
          COALESCE(i.unit_rate,0) AS unit_rate,
          ROUND(ib.current_quantity * COALESCE(i.unit_rate,0),2) AS value,
          ib.created_at AS received_date,
          NOW()::date - ib.created_at::date AS age_days,
          CASE
            WHEN NOW()::date - ib.created_at::date <= 30  THEN '0–30 days'
            WHEN NOW()::date - ib.created_at::date <= 60  THEN '31–60 days'
            WHEN NOW()::date - ib.created_at::date <= 90  THEN '61–90 days'
            ELSE '90+ days'
          END AS age_bucket
        FROM inventory_batches ib
        JOIN inventory i ON i.id = ib.inventory_id
        JOIN projects  p ON p.id = i.project_id
        WHERE p.company_id = $1
          AND ib.current_quantity > 0
          ${project_id ? ` AND i.project_id = '${project_id.replace(/'/g,"''")}' ` : ''}
          ${category   ? ` AND LOWER(i.category) = LOWER('${category.replace(/'/g,"''")}')` : ''}
          ${scopeClause}
        ORDER BY age_days DESC`;
      rows = (await query(sql, allParams)).rows;
    }

    // ── 5.6 Audit Trail ───────────────────────────────────────────────────────
    else if (type === 'audit-trail') {
      const base = [cid, fd, td + ' 23:59:59'];
      const { scopeClause, allParams } = buildScope(req, base, 'i');
      let sql = `
        SELECT
          st.transacted_at,
          p.name         AS project_name,
          i.category,
          i.material_name,
          i.unit,
          st.transaction_type,
          st.quantity,
          st.reference_number,
          st.remarks,
          u.name         AS transacted_by,
          i.closing_stock AS current_closing_stock
        FROM stock_transactions st
        JOIN inventory i ON i.id = st.inventory_id
        JOIN projects  p ON p.id  = i.project_id
        LEFT JOIN users u ON u.id = st.transacted_by
        WHERE p.company_id = $1
          AND st.transacted_at BETWEEN $2 AND $3
          ${project_id ? ` AND i.project_id = '${project_id.replace(/'/g,"''")}' ` : ''}
          ${category   ? ` AND LOWER(i.category) = LOWER('${category.replace(/'/g,"''")}')` : ''}
          ${scopeClause}
        ORDER BY st.transacted_at DESC
        LIMIT 3000`;
      rows = (await query(sql, allParams)).rows;
    }

    // ── 6.1 Daily Store Activity ──────────────────────────────────────────────
    else if (type === 'daily-activity') {
      const base = [cid, fd, td + ' 23:59:59'];
      const { scopeClause, allParams } = buildScope(req, base, 'i');
      let sql = `
        SELECT
          st.transacted_at::date AS activity_date,
          p.name         AS project_name,
          i.category,
          i.material_name,
          i.unit,
          st.transaction_type,
          st.quantity,
          COALESCE(i.unit_rate,0) AS unit_rate,
          ROUND(st.quantity * COALESCE(i.unit_rate,0),2) AS value,
          st.reference_number,
          u.name         AS transacted_by
        FROM stock_transactions st
        JOIN inventory i ON i.id = st.inventory_id
        JOIN projects  p ON p.id  = i.project_id
        LEFT JOIN users u ON u.id = st.transacted_by
        WHERE p.company_id = $1
          AND st.transacted_at BETWEEN $2 AND $3
          ${project_id ? ` AND i.project_id = '${project_id.replace(/'/g,"''")}' ` : ''}
          ${scopeClause}
        ORDER BY st.transacted_at DESC`;
      rows = (await query(sql, allParams)).rows;
    }

    // ── 6.2 Monthly Consumption ───────────────────────────────────────────────
    else if (type === 'monthly-consumption') {
      const base = [cid, fd, td + ' 23:59:59'];
      const { scopeClause, allParams } = buildScope(req, base, 'i');
      let sql = `
        SELECT
          TO_CHAR(st.transacted_at, 'YYYY-MM') AS month,
          p.name         AS project_name,
          i.category,
          i.material_name,
          i.unit,
          SUM(st.quantity)                            AS total_issued,
          SUM(st.quantity * COALESCE(i.unit_rate,0)) AS total_value
        FROM stock_transactions st
        JOIN inventory i ON i.id = st.inventory_id
        JOIN projects  p ON p.id  = i.project_id
        WHERE p.company_id = $1
          AND st.transaction_type = 'issue'
          AND st.transacted_at BETWEEN $2 AND $3
          ${project_id ? ` AND i.project_id = '${project_id.replace(/'/g,"''")}' ` : ''}
          ${category   ? ` AND LOWER(i.category) = LOWER('${category.replace(/'/g,"''")}')` : ''}
          ${scopeClause}
        GROUP BY TO_CHAR(st.transacted_at,'YYYY-MM'), p.name, i.category, i.material_name, i.unit
        ORDER BY month DESC, total_value DESC`;
      rows = (await query(sql, allParams)).rows;
    }

    // ── 6.3 Project Utilization ───────────────────────────────────────────────
    else if (type === 'project-utilization') {
      const base = [cid, fd, td + ' 23:59:59'];
      const { scopeClause, allParams } = buildScope(req, base, 'i');
      let sql = `
        SELECT
          p.name         AS project_name,
          COUNT(DISTINCT i.id)::int AS item_types,
          SUM(CASE WHEN st.transaction_type IN ('grn','bill_receipt','transfer_in') THEN st.quantity ELSE 0 END) AS total_received,
          SUM(CASE WHEN st.transaction_type = 'issue' THEN st.quantity ELSE 0 END) AS total_issued,
          SUM(CASE WHEN st.transaction_type = 'issue' THEN st.quantity * COALESCE(i.unit_rate,0) ELSE 0 END) AS issue_value,
          SUM(i.closing_stock * COALESCE(i.unit_rate,0)) AS closing_stock_value
        FROM inventory i
        JOIN projects p ON p.id = i.project_id
        LEFT JOIN stock_transactions st ON st.inventory_id = i.id
          AND st.transacted_at BETWEEN $2 AND $3
        WHERE p.company_id = $1
          ${project_id ? ` AND i.project_id = '${project_id.replace(/'/g,"''")}' ` : ''}
          ${scopeClause}
        GROUP BY p.id, p.name
        ORDER BY issue_value DESC NULLS LAST`;
      rows = (await query(sql, allParams)).rows;
    }

    // ── 6.4 Category Summary ──────────────────────────────────────────────────
    else if (type === 'category-summary') {
      const base = [cid, fd, td + ' 23:59:59'];
      const { scopeClause, allParams } = buildScope(req, base, 'i');
      let sql = `
        SELECT
          p.name         AS project_name,
          COALESCE(NULLIF(TRIM(i.category),''),'Uncategorized') AS category,
          COUNT(DISTINCT i.id)::int                     AS item_count,
          SUM(i.closing_stock)                          AS total_closing_qty,
          SUM(i.closing_stock * COALESCE(i.unit_rate,0)) AS closing_value,
          SUM(CASE WHEN st.transaction_type='issue' THEN st.quantity ELSE 0 END) AS issued_qty,
          SUM(CASE WHEN st.transaction_type='issue' THEN st.quantity * COALESCE(i.unit_rate,0) ELSE 0 END) AS issued_value
        FROM inventory i
        JOIN projects p ON p.id = i.project_id
        LEFT JOIN stock_transactions st ON st.inventory_id = i.id
          AND st.transacted_at BETWEEN $2 AND $3
        WHERE p.company_id = $1
          ${project_id ? ` AND i.project_id = '${project_id.replace(/'/g,"''")}' ` : ''}
          ${scopeClause}
        GROUP BY p.name, COALESCE(NULLIF(TRIM(i.category),''),'Uncategorized')
        ORDER BY closing_value DESC NULLS LAST`;
      rows = (await query(sql, allParams)).rows;
    }

    // ── 6.5 Closing Stock ─────────────────────────────────────────────────────
    else if (type === 'closing-stock') {
      const base = [cid];
      const { scopeClause, allParams } = buildScope(req, base, 'i');
      let sql = `
        SELECT
          p.name         AS project_name,
          i.category,
          i.material_name,
          i.unit,
          i.closing_stock,
          COALESCE(i.unit_rate,0) AS unit_rate,
          ROUND(i.closing_stock * COALESCE(i.unit_rate,0),2) AS closing_value,
          i.site_location,
          i.reorder_level,
          CASE WHEN i.closing_stock <= COALESCE(i.reorder_level,0) AND i.reorder_level > 0
               THEN 'Below Reorder' ELSE 'OK' END AS status
        FROM inventory i
        JOIN projects p ON p.id = i.project_id
        WHERE p.company_id = $1
          ${project_id ? ` AND i.project_id = '${project_id.replace(/'/g,"''")}' ` : ''}
          ${category   ? ` AND LOWER(i.category) = LOWER('${category.replace(/'/g,"''")}')` : ''}
          ${scopeClause}
        ORDER BY p.name, i.category, i.material_name`;
      rows = (await query(sql, allParams)).rows;
    }

    // ── 6.6 Top Consumed Items ────────────────────────────────────────────────
    else if (type === 'top-consumed') {
      const base = [cid, fd, td + ' 23:59:59'];
      const { scopeClause, allParams } = buildScope(req, base, 'i');
      let sql = `
        SELECT
          p.name         AS project_name,
          i.category,
          i.material_name,
          i.unit,
          SUM(st.quantity)                            AS total_issued_qty,
          COALESCE(i.unit_rate,0)                     AS unit_rate,
          SUM(st.quantity * COALESCE(i.unit_rate,0)) AS total_value,
          COUNT(DISTINCT st.transacted_at::date)::int  AS issue_days
        FROM stock_transactions st
        JOIN inventory i ON i.id = st.inventory_id
        JOIN projects  p ON p.id  = i.project_id
        WHERE p.company_id = $1
          AND st.transaction_type = 'issue'
          AND st.transacted_at BETWEEN $2 AND $3
          ${project_id ? ` AND i.project_id = '${project_id.replace(/'/g,"''")}' ` : ''}
          ${category   ? ` AND LOWER(i.category) = LOWER('${category.replace(/'/g,"''")}')` : ''}
          ${scopeClause}
        GROUP BY p.name, i.category, i.material_name, i.unit, i.unit_rate
        ORDER BY total_value DESC NULLS LAST
        LIMIT 100`;
      rows = (await query(sql, allParams)).rows;
    }

    // ── Inventory Register (period-based with vendor details) ────────────────
    else if (type === 'inventory-register') {
      const base = [cid, fd, td + ' 23:59:59'];
      const { scopeClause, allParams } = buildScope(req, base, 'i');

      const sql = `
        SELECT
          p.name                                    AS project_name,
          i.id,
          i.material_name,
          i.category,
          i.major_head,
          i.dc_idc,
          i.unit,
          COALESCE(i.unit_rate, 0)                  AS unit_rate,

          -- Opening stock at start of period
          GREATEST(0,
            i.opening_stock
            + COALESCE(pre_rx.qty, 0)
            - COALESCE(pre_ix.qty, 0)
          )                                         AS opening_qty,

          -- Received IN period
          COALESCE(rx.qty, 0)                       AS received_qty,
          COALESCE(rx.vendors, '')                  AS vendor_names,

          -- Issued IN period
          COALESCE(ix.qty, 0)                       AS issued_qty,
          COALESCE(ix.issued_to, '')                AS issued_to,

          -- Closing = opening + received - issued (live)
          i.closing_stock                           AS closing_qty

        FROM inventory i
        JOIN projects p ON p.id = i.project_id

        -- Receipts BEFORE period (to compute period opening)
        LEFT JOIN (
          SELECT inventory_id, SUM(quantity) AS qty
          FROM stock_transactions
          WHERE transaction_type IN ('grn','bill_receipt','transfer_in','ign')
            AND transacted_at < $2
          GROUP BY inventory_id
        ) pre_rx ON pre_rx.inventory_id = i.id

        -- Issues BEFORE period (to compute period opening)
        LEFT JOIN (
          SELECT inventory_id, SUM(quantity) AS qty
          FROM stock_transactions
          WHERE transaction_type IN ('issue','transfer_out')
            AND transacted_at < $2
          GROUP BY inventory_id
        ) pre_ix ON pre_ix.inventory_id = i.id

        -- Receipts IN period with vendor aggregation
        LEFT JOIN (
          SELECT
            st.inventory_id,
            SUM(st.quantity) AS qty,
            STRING_AGG(DISTINCT COALESCE(v.name, ''), ', ')
              FILTER (WHERE v.name IS NOT NULL AND v.name <> '') AS vendors
          FROM stock_transactions st
          LEFT JOIN grn g ON g.grn_number = st.reference_number
          LEFT JOIN vendors v ON v.id = g.vendor_id
          WHERE st.transaction_type IN ('grn','bill_receipt','transfer_in','ign')
            AND st.transacted_at BETWEEN $2 AND $3
          GROUP BY st.inventory_id
        ) rx ON rx.inventory_id = i.id

        -- Issues IN period with issued_to aggregation
        LEFT JOIN (
          SELECT
            st.inventory_id,
            SUM(st.quantity) AS qty,
            STRING_AGG(DISTINCT COALESCE(st.issued_to, ''), ', ')
              FILTER (WHERE st.issued_to IS NOT NULL AND st.issued_to <> '') AS issued_to
          FROM stock_transactions st
          WHERE st.transaction_type IN ('issue','transfer_out')
            AND st.transacted_at BETWEEN $2 AND $3
          GROUP BY st.inventory_id
        ) ix ON ix.inventory_id = i.id

        WHERE p.company_id = $1
          ${project_id ? ` AND i.project_id = '${project_id.replace(/'/g,"''")}' ` : ''}
          ${category   ? ` AND LOWER(i.category) = LOWER('${category.replace(/'/g,"''")}')` : ''}
          ${scopeClause}
          AND (
            COALESCE(rx.qty, 0) > 0
            OR COALESCE(ix.qty, 0) > 0
            OR i.closing_stock > 0
            OR i.opening_stock > 0
          )
        ORDER BY p.name, COALESCE(i.category, ''), i.material_name`;

      rows = (await query(sql, allParams)).rows;
    }

    else {
      return res.status(400).json({ error: `Unknown report type: ${type}` });
    }

    res.json({ success: true, data: rows, count: rows.length });
  } catch (err) {
    console.error(`[stores-reports] ${req.params.type}:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
