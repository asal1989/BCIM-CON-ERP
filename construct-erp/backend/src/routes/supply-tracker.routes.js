// src/routes/supply-tracker.routes.js
// Material Supply Tracker — end-to-end MR → PO → IGN/GRN → Issue lifecycle
const express = require('express');
const router  = express.Router();
const { authenticate } = require('../middleware/auth');
const { query }        = require('../config/database');
router.use(authenticate);

const CID = req => req.user.company_id;

// Received qty from an ign_items row = qty_inspected - rejected (or qty_as_per_dc fallback)
const IGN_QTY = `(COALESCE(ii.qty_inspected, ii.qty_as_per_dc, 0) - COALESCE(ii.qty_rejected, 0))`;

// MRS approval-in-progress statuses (all non-final non-cancelled)
const PENDING_STATUSES = `'pending','stores_verified','approved_pm','approved_sr_pm','approved_mgmt'`;

// ── Dashboard KPIs ─────────────────────────────────────────────────────────
router.get('/dashboard', async (req, res) => {
  try {
    const { project_id } = req.query;
    const cid = CID(req);
    const params = [cid];
    let pFilter = '';
    if (project_id) { pFilter = `AND mr.project_id = $2`; params.push(project_id); }

    const r = await query(`
      WITH base AS (
        SELECT
          mr.id,
          mr.status                AS mr_status,
          po.id                    AS po_id,
          po.status                AS po_status,
          po.delivery_date,
          mr.required_by,
          COALESCE(SUM(${IGN_QTY}), 0)               AS received_qty,
          COALESCE(SUM(mi.quantity), 0)               AS requested_qty,
          MAX(ign.status)                             AS ign_status
        FROM material_requisitions mr
        JOIN projects p ON p.id = mr.project_id
        LEFT JOIN mrs_items mi ON mi.mrs_id = mr.id
        LEFT JOIN po_items pi ON pi.mrs_item_id = mi.id
        LEFT JOIN purchase_orders po ON po.id = pi.po_id AND po.status NOT IN ('rejected','cancelled')
        LEFT JOIN ign_items ii ON ii.po_item_id = pi.id
        LEFT JOIN ign ON ign.id = ii.ign_id AND ign.status = 'approved'
        WHERE p.company_id = $1 ${pFilter} AND mr.status != 'cancelled'
        GROUP BY mr.id, mr.status, po.id, po.status, po.delivery_date, mr.required_by
      )
      SELECT
        COUNT(DISTINCT id)                                                             AS total_mrs,
        COUNT(DISTINCT id) FILTER (WHERE mr_status IN (${PENDING_STATUSES}))          AS pending_approvals,
        COUNT(DISTINCT id) FILTER (WHERE mr_status = 'approved_md' AND po_id IS NULL) AS pending_po,
        COUNT(DISTINCT po_id) FILTER (WHERE po_status IN ('pending','approved','sent')) AS open_pos,
        COUNT(DISTINCT id) FILTER (WHERE po_status IN ('sent','approved') AND received_qty = 0) AS in_transit,
        COUNT(DISTINCT id) FILTER (WHERE received_qty > 0 AND received_qty < requested_qty AND mr_status != 'closed') AS partial_delivery,
        COUNT(DISTINCT id) FILTER (WHERE ign_status IS NULL AND received_qty = 0 AND po_status IN ('sent','approved')) AS pending_grn,
        COUNT(DISTINCT id) FILTER (WHERE delivery_date < CURRENT_DATE AND received_qty < requested_qty AND mr_status != 'closed') AS overdue,
        COUNT(DISTINCT id) FILTER (WHERE mr_status = 'closed')                        AS closed
      FROM base
    `, params);

    res.json({ data: r.rows[0] });
  } catch (e) {
    console.error('[supply-tracker] dashboard error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── Main Tracker Grid ───────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const {
      project_id, vendor_id, status, category, search,
      date_from, date_to, priority, po_status,
      limit = 200, offset = 0,
    } = req.query;

    const cid = CID(req);
    const params = [cid];
    let i = 2;
    const conditions = ['p.company_id = $1', "mr.status != 'cancelled'"];

    if (project_id) { conditions.push(`mr.project_id = $${i++}`);  params.push(project_id); }
    if (vendor_id)  { conditions.push(`v.id = $${i++}`);            params.push(vendor_id); }
    if (priority)   { conditions.push(`mr.priority = $${i++}`);     params.push(priority); }
    if (category)   { conditions.push(`mi.category ILIKE $${i++}`); params.push(`%${category}%`); }
    if (date_from)  { conditions.push(`mr.created_at >= $${i++}`);  params.push(date_from); }
    if (date_to)    { conditions.push(`mr.created_at <= $${i++}`);  params.push(date_to + 'T23:59:59'); }

    if (search) {
      conditions.push(`(mr.mrs_number ILIKE $${i} OR mr.serial_no_formatted ILIKE $${i} OR mi.material_name ILIKE $${i} OR po.po_number ILIKE $${i} OR v.name ILIKE $${i})`);
      params.push(`%${search}%`); i++;
    }

    // Status filter mapped to MRS status OR derived status label
    if (status) {
      const statusMap = {
        'Pending Approval': `mr.status IN (${PENDING_STATUSES})`,
        'PO Pending':       `mr.status = 'approved_md' AND po.id IS NULL`,
        'Closed':           `mr.status = 'closed'`,
      };
      const mapped = statusMap[status];
      if (mapped) {
        conditions.push(mapped);
      }
      // For PO-based statuses, we handle in JS via deriveStatus post-query
    }

    if (po_status) {
      const ps = po_status.split(',').map(s => `'${s.replace(/'/g,"''")}'`).join(',');
      conditions.push(`po.status IN (${ps})`);
    }

    const where = conditions.join(' AND ');

    const sql = `
      SELECT
        -- MR
        mr.id                           AS mr_id,
        COALESCE(mr.serial_no_formatted, mr.mrs_number) AS mr_number,
        mr.created_at                   AS mr_date,
        mr.required_by                  AS required_date,
        mr.status                       AS mr_status,
        mr.priority,
        mr.department,
        mr.cost_center,
        mr.remarks                      AS mr_remarks,
        -- Project
        p.id                            AS project_id,
        p.name                          AS project_name,
        -- Raised by
        u.name                          AS raised_by,
        -- MR Item
        mi.id                           AS item_id,
        mi.material_name,
        mi.item_code,
        mi.category                     AS material_category,
        mi.quantity                     AS requested_qty,
        mi.unit,
        COALESCE(mi.md_approved_qty, mi.quantity) AS approved_qty,
        -- PO
        po.id                           AS po_id,
        COALESCE(po.serial_no_formatted, po.po_number) AS po_number,
        po.po_date,
        po.delivery_date                AS expected_delivery_date,
        po.status                       AS po_status,
        -- Vendor
        v.id                            AS vendor_id,
        v.name                          AS vendor_name,
        v.phone                         AS vendor_phone,
        -- PO Item
        pi.quantity                     AS ordered_qty,
        pi.rate                         AS unit_rate,
        -- Received (via IGN — use qty_inspected minus rejected)
        COALESCE(SUM(CASE WHEN ign.status='approved'
          THEN (COALESCE(ii.qty_inspected, ii.qty_as_per_dc, 0) - COALESCE(ii.qty_rejected, 0))
          ELSE 0 END), 0)                                                               AS received_qty,
        MAX(CASE WHEN ign.status='approved' THEN ign.approved_at END)                  AS actual_delivery_date,
        COUNT(DISTINCT CASE WHEN ign.status='approved' THEN ign.id END)                AS grn_count
      FROM material_requisitions mr
      JOIN projects p ON p.id = mr.project_id
      LEFT JOIN users u ON u.id = mr.raised_by
      JOIN mrs_items mi ON mi.mrs_id = mr.id
      LEFT JOIN po_items pi ON pi.mrs_item_id = mi.id
      LEFT JOIN purchase_orders po ON po.id = pi.po_id AND po.status NOT IN ('rejected','cancelled')
      LEFT JOIN vendors v ON v.id = po.vendor_id
      LEFT JOIN ign_items ii ON ii.po_item_id = pi.id
      LEFT JOIN ign ON ign.id = ii.ign_id
      WHERE ${where}
      GROUP BY
        mr.id, mr.serial_no_formatted, mr.mrs_number, mr.created_at, mr.required_by,
        mr.status, mr.priority, mr.department, mr.cost_center, mr.remarks,
        p.id, p.name, u.name,
        mi.id, mi.material_name, mi.item_code, mi.category, mi.quantity, mi.unit,
        mi.md_approved_qty,
        po.id, po.serial_no_formatted, po.po_number, po.po_date, po.delivery_date, po.status,
        v.id, v.name, v.phone,
        pi.quantity, pi.rate
      ORDER BY mr.created_at DESC
      LIMIT $${i++} OFFSET $${i++}
    `;
    params.push(parseInt(limit), parseInt(offset));

    const { rows } = await query(sql, params);

    const enriched = rows.map(r => ({
      ...r,
      balance_qty:    Math.max(0, parseFloat(r.ordered_qty || r.requested_qty || 0) - parseFloat(r.received_qty || 0)),
      supply_pct:     r.ordered_qty > 0
        ? Math.min(100, Math.round((parseFloat(r.received_qty) / parseFloat(r.ordered_qty)) * 100))
        : 0,
      overall_status: deriveStatus(r),
      is_overdue:     r.expected_delivery_date
        && new Date(r.expected_delivery_date) < new Date()
        && parseFloat(r.received_qty) < parseFloat(r.ordered_qty || r.requested_qty),
    }));

    res.json({ data: enriched, count: enriched.length });
  } catch (e) {
    console.error('[supply-tracker] GET / error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── Single item timeline ────────────────────────────────────────────────────
router.get('/item/:mrId/:itemId', async (req, res) => {
  try {
    const { mrId, itemId } = req.params;
    const cid = CID(req);

    const mrRes = await query(`
      SELECT mr.*, p.name AS project_name, p.company_id,
             u.name AS raised_by_name, u.email AS raised_by_email
      FROM material_requisitions mr
      JOIN projects p ON p.id = mr.project_id
      LEFT JOIN users u ON u.id = mr.raised_by
      WHERE mr.id = $1 AND p.company_id = $2
    `, [mrId, cid]);
    if (!mrRes.rows.length) return res.status(404).json({ error: 'MR not found' });

    const itemRes = await query(`
      SELECT mi.*
      FROM mrs_items mi
      WHERE mi.id = $1 AND mi.mrs_id = $2
    `, [itemId, mrId]);
    if (!itemRes.rows.length) return res.status(404).json({ error: 'MR item not found' });

    const posRes = await query(`
      SELECT pi.*, po.po_number, po.serial_no_formatted, po.po_date, po.delivery_date,
             po.status AS po_status, po.payment_terms,
             v.name AS vendor_name, v.phone AS vendor_phone, v.email AS vendor_email
      FROM po_items pi
      JOIN purchase_orders po ON po.id = pi.po_id
      LEFT JOIN vendors v ON v.id = po.vendor_id
      WHERE pi.mrs_item_id = $1 AND po.status NOT IN ('rejected','cancelled')
      ORDER BY po.po_date
    `, [itemId]);

    const poItemIds = posRes.rows.map(r => r.id).filter(Boolean);

    const ignRes = poItemIds.length ? await query(`
      SELECT ii.*,
             ii.qty_inspected, ii.qty_as_per_dc, ii.qty_rejected,
             ign.ign_number, ign.status AS ign_status, ign.created_at AS ign_created,
             ign.approved_at, ign.vehicle_no
      FROM ign_items ii
      JOIN ign ON ign.id = ii.ign_id
      WHERE ii.po_item_id = ANY($1::uuid[])
      ORDER BY ign.created_at
    `, [poItemIds]) : { rows: [] };

    // Normalise received qty for each IGN row
    const grns = ignRes.rows.map(g => ({
      ...g,
      quantity_received: parseFloat(g.qty_inspected || g.qty_as_per_dc || 0) - parseFloat(g.qty_rejected || 0),
    }));

    // Build timeline
    const mr = mrRes.rows[0];
    const timeline = [];
    timeline.push({ event: 'MR Raised', date: mr.created_at, status: 'done', ref: mr.serial_no_formatted || mr.mrs_number });

    const approvalStages = [
      { label: 'Stores Approved',   dateField: 'stores_approved_at' },
      { label: 'PM Approved',        dateField: 'approved_pm_at' },
      { label: 'Management Approved',dateField: 'approved_mgmt_at' },
      { label: 'MD Approved',        dateField: 'approved_md_at' },
    ];
    approvalStages.forEach(s => {
      if (mr[s.dateField]) timeline.push({ event: s.label, date: mr[s.dateField], status: 'done' });
    });

    posRes.rows.forEach(po => {
      timeline.push({ event: 'PO Created', date: po.po_date, status: 'done', ref: po.po_number || po.serial_no_formatted });
      if (po.po_status === 'sent' || po.po_status === 'approved') {
        timeline.push({ event: 'PO Sent to Vendor', date: po.po_date, status: 'done', ref: po.vendor_name });
      }
    });
    grns.forEach(g => {
      timeline.push({
        event:  g.ign_status === 'approved' ? 'GRN Completed' : 'GRN Pending',
        date:   g.ign_created,
        status: g.ign_status === 'approved' ? 'done' : 'pending',
        ref:    g.ign_number,
      });
    });

    res.json({
      data: {
        mr,
        item: itemRes.rows[0],
        purchase_orders: posRes.rows,
        grns,
        timeline: timeline.filter(t => t.date).sort((a, b) => new Date(a.date) - new Date(b.date)),
      }
    });
  } catch (e) {
    console.error('[supply-tracker] item detail error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── Summary / Abstract ──────────────────────────────────────────────────────
router.get('/summary', async (req, res) => {
  try {
    const { project_id, group_by = 'vendor' } = req.query;
    const cid = CID(req);
    const params = [cid];
    let extra = '';
    if (project_id) { extra = `AND mr.project_id = $2`; params.push(project_id); }

    let groupSql, selectSql;
    if (group_by === 'category') {
      selectSql = `COALESCE(mi.category, 'Uncategorised') AS label`;
      groupSql  = `COALESCE(mi.category, 'Uncategorised')`;
    } else if (group_by === 'project') {
      selectSql = `p.name AS label`;
      groupSql  = `p.name`;
    } else {
      selectSql = `COALESCE(v.name, 'No PO') AS label`;
      groupSql  = `COALESCE(v.name, 'No PO')`;
    }

    const sql = `
      SELECT ${selectSql},
        COUNT(DISTINCT mi.id)                                   AS item_count,
        COALESCE(SUM(mi.quantity), 0)                           AS requested_qty,
        COALESCE(SUM(pi.quantity), 0)                           AS ordered_qty,
        COALESCE(SUM(CASE WHEN ign.status='approved'
          THEN (COALESCE(ii.qty_inspected, ii.qty_as_per_dc, 0) - COALESCE(ii.qty_rejected, 0))
          ELSE 0 END), 0)                                       AS received_qty,
        COUNT(DISTINCT po.id)                                   AS po_count,
        COUNT(DISTINCT CASE WHEN ign.status='approved' THEN ign.id END) AS grn_count
      FROM material_requisitions mr
      JOIN projects p ON p.id = mr.project_id
      JOIN mrs_items mi ON mi.mrs_id = mr.id
      LEFT JOIN po_items pi ON pi.mrs_item_id = mi.id
      LEFT JOIN purchase_orders po ON po.id = pi.po_id AND po.status NOT IN ('rejected','cancelled')
      LEFT JOIN vendors v ON v.id = po.vendor_id
      LEFT JOIN ign_items ii ON ii.po_item_id = pi.id
      LEFT JOIN ign ON ign.id = ii.ign_id
      WHERE p.company_id = $1 ${extra} AND mr.status != 'cancelled'
      GROUP BY ${groupSql}
      ORDER BY received_qty DESC
    `;
    const { rows } = await query(sql, params);
    res.json({ data: rows });
  } catch (e) {
    console.error('[supply-tracker] summary error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

function deriveStatus(r) {
  const mrStatus = String(r.mr_status || '');
  if (mrStatus === 'closed')     return 'Closed';
  if (mrStatus === 'cancelled')  return 'Cancelled';
  const pendingStages = ['pending','stores_verified','approved_pm','approved_sr_pm','approved_mgmt'];
  if (!r.po_id) {
    if (pendingStages.includes(mrStatus)) return 'Pending Approval';
    if (mrStatus === 'approved_md') return 'PO Pending';
    return 'Draft';
  }
  const poStatus = String(r.po_status || '');
  const ordered  = parseFloat(r.ordered_qty || 0);
  const received = parseFloat(r.received_qty || 0);
  if (received >= ordered && ordered > 0) return 'GRN Completed';
  if (received > 0) return 'Partial Delivery';
  if (poStatus === 'sent' || poStatus === 'approved') return 'In Transit';
  if (poStatus === 'pending') return 'PO Created';
  return 'PO Created';
}

module.exports = router;
