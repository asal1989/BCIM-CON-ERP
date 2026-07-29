// src/routes/supply-tracker.routes.js
// Material Supply Tracker — end-to-end MR → PO → IGN/GRN → Issue lifecycle
//
// PO linking strategy (same as mrs.routes.js):
//   1. Direct:   po_items.mrs_item_id = mi.id
//   2. Fallback: purchase_orders.mrs_id = mr.id  OR  mr.id = ANY(po.mrs_ids)
//                + fuzzy material-name match on po_items rows where mrs_item_id IS NULL
//
const express = require('express');
const router  = express.Router();
const { authenticate } = require('../middleware/auth');
const { query }        = require('../config/database');
const { runSchemaInit } = require('../utils/schemaInit');
router.use(authenticate);

const CID = req => req.user.company_id;

// The list/dashboard/summary queries below run 3-4 correlated subqueries per
// row (ordered/received qty, GRN count, last delivery date), each joining
// po_items -> purchase_orders -> ign_items -> ign. None of the join columns
// they correlate on had an index, so every subquery execution sequentially
// scanned these tables — an N x M blowup that made the page take ~20s to
// load. Indexes are purely additive (can't change query results), so this is
// safe to add without touching any query logic.
runSchemaInit('supply-tracker-indexes', async () => {
  const safe = async (sql) => { try { await query(sql); } catch (_) {} };
  await safe(`CREATE INDEX IF NOT EXISTS idx_po_items_mrs_item_id ON po_items(mrs_item_id)`);
  await safe(`CREATE INDEX IF NOT EXISTS idx_po_items_po_id ON po_items(po_id)`);
  await safe(`CREATE INDEX IF NOT EXISTS idx_purchase_orders_mrs_id ON purchase_orders(mrs_id)`);
  await safe(`CREATE INDEX IF NOT EXISTS idx_ign_items_po_item_id ON ign_items(po_item_id)`);
  await safe(`CREATE INDEX IF NOT EXISTS idx_mrs_items_mrs_id ON mrs_items(mrs_id)`);
});

// Received qty expression for an ign_items row
const IGN_QTY = `(COALESCE(ii.qty_inspected, ii.qty_as_per_dc, 0) - COALESCE(ii.qty_rejected, 0))`;

// Normalised material name for fuzzy matching (strip non-alphanumeric)
const NORM = col => `regexp_replace(lower(trim(${col})), '[^a-z0-9]+', '', 'g')`;

// MRS statuses that mean "in the approval pipeline"
const PENDING_STATUSES = `'pending','stores_verified','approved_pm','approved_sr_pm','approved_mgmt'`;

// Projects can opt into a final "Client Approval" stage after the MD
// (projects.mrs_workflow.stages contains 'client-approve'). On those projects
// 'approved_md' is NOT the end of the chain — the MR is still awaiting the
// client, so it must not be counted as ready for a PO.
const USES_CLIENT_APPROVAL = (proj = 'p') =>
  `COALESCE(${proj}.mrs_workflow->'stages' @> '["client-approve"]'::jsonb, false)`;
// "This MR has cleared every approval stage its project requires."
const FULLY_APPROVED = (mr = 'mr', proj = 'p') =>
  `(${mr}.status = 'client_approved'
    OR (${mr}.status = 'approved_md' AND NOT ${USES_CLIENT_APPROVAL(proj)}))`;
// MD approved, but the project's own workflow says client sign-off is still
// needed — distinct from STILL_PENDING's internal stages so the UI can label
// it "Awaiting Client" instead of a generic "Pending Approval".
const IS_AWAITING_CLIENT = (mr = 'mr', proj = 'p') =>
  `(${mr}.status = 'approved_md' AND ${USES_CLIENT_APPROVAL(proj)})`;
// "Still somewhere in the approval pipeline" (internal stages OR awaiting client).
const STILL_PENDING = (mr = 'mr', proj = 'p') =>
  `(${mr}.status IN (${PENDING_STATUSES}) OR ${IS_AWAITING_CLIENT(mr, proj)})`;

// ──────────────────────────────────────────────────────────────────────────────
// LATERAL subquery: finds the BEST matching po_items row for a given mrs_item
// (mi.id, mr.id, mi.material_name are resolved from the outer query context)
// Returns: po_item_id, ordered_qty, unit_rate, po_id, po_number, po_date,
//          delivery_date, po_status, vendor_id
// ──────────────────────────────────────────────────────────────────────────────
const BEST_PO_LATERAL = `
  LEFT JOIN LATERAL (
    SELECT
      pi.id          AS pi_id,
      pi.quantity    AS ordered_qty,
      pi.rate        AS unit_rate,
      po.id          AS po_id,
      COALESCE(po.serial_no_formatted, po.po_number) AS po_number,
      po.po_date,
      po.delivery_date,
      po.status      AS po_status,
      po.vendor_id
    FROM po_items pi
    JOIN purchase_orders po ON po.id = pi.po_id
    WHERE po.status NOT IN ('rejected','cancelled')
      AND (
        pi.mrs_item_id = mi.id
        OR (
          pi.mrs_item_id IS NULL
          AND (po.mrs_id = mr.id OR mr.id = ANY(COALESCE(po.mrs_ids, ARRAY[]::uuid[])))
          AND ${NORM('pi.material_name')} = ${NORM('mi.material_name')}
        )
      )
    ORDER BY (pi.mrs_item_id IS NOT NULL) DESC, po.po_date DESC
    LIMIT 1
  ) bp ON true
`;

// Correlated subquery: total ordered qty for this item across ALL matching POs
const ORDERED_QTY_SUB = (mrAlias, miAlias) => `
  COALESCE((
    SELECT SUM(pi2.quantity)
    FROM po_items pi2
    JOIN purchase_orders po2 ON po2.id = pi2.po_id
    WHERE po2.status NOT IN ('rejected','cancelled')
      AND (
        pi2.mrs_item_id = ${miAlias}.id
        OR (
          pi2.mrs_item_id IS NULL
          AND (po2.mrs_id = ${mrAlias}.id OR ${mrAlias}.id = ANY(COALESCE(po2.mrs_ids, ARRAY[]::uuid[])))
          AND ${NORM('pi2.material_name')} = ${NORM(`${miAlias}.material_name`)}
        )
      )
  ), 0)
`;

// Correlated subquery: total approved-IGN received qty for this item
const RECEIVED_QTY_SUB = (mrAlias, miAlias) => `
  COALESCE((
    SELECT SUM(COALESCE(ii2.qty_inspected, ii2.qty_as_per_dc, 0) - COALESCE(ii2.qty_rejected, 0))
    FROM po_items pi2
    JOIN purchase_orders po2 ON po2.id = pi2.po_id
    JOIN ign_items ii2 ON ii2.po_item_id = pi2.id
    JOIN ign ign2 ON ign2.id = ii2.ign_id AND ign2.status = 'approved'
    WHERE po2.status NOT IN ('rejected','cancelled')
      AND (
        pi2.mrs_item_id = ${miAlias}.id
        OR (
          pi2.mrs_item_id IS NULL
          AND (po2.mrs_id = ${mrAlias}.id OR ${mrAlias}.id = ANY(COALESCE(po2.mrs_ids, ARRAY[]::uuid[])))
          AND ${NORM('pi2.material_name')} = ${NORM(`${miAlias}.material_name`)}
        )
      )
  ), 0)
`;

// Correlated: count of distinct approved IGNs for this item
const GRN_COUNT_SUB = (mrAlias, miAlias) => `
  COALESCE((
    SELECT COUNT(DISTINCT ign2.id)
    FROM po_items pi2
    JOIN purchase_orders po2 ON po2.id = pi2.po_id
    JOIN ign_items ii2 ON ii2.po_item_id = pi2.id
    JOIN ign ign2 ON ign2.id = ii2.ign_id AND ign2.status = 'approved'
    WHERE po2.status NOT IN ('rejected','cancelled')
      AND (
        pi2.mrs_item_id = ${miAlias}.id
        OR (
          pi2.mrs_item_id IS NULL
          AND (po2.mrs_id = ${mrAlias}.id OR ${mrAlias}.id = ANY(COALESCE(po2.mrs_ids, ARRAY[]::uuid[])))
        )
      )
  ), 0)
`;

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
          mr.status                                              AS mr_status,
          ${FULLY_APPROVED('mr', 'p')}                           AS is_fully_approved,
          ${STILL_PENDING('mr', 'p')}                            AS is_pending_approval,
          ${IS_AWAITING_CLIENT('mr', 'p')}                       AS is_awaiting_client,
          bp.po_id,
          bp.po_status,
          bp.delivery_date,
          mr.required_by,
          ${ORDERED_QTY_SUB('mr', 'mi')}                        AS ordered_qty,
          mi.quantity                                            AS requested_qty,
          ${RECEIVED_QTY_SUB('mr', 'mi')}                       AS received_qty
        FROM material_requisitions mr
        JOIN projects p ON p.id = mr.project_id
        JOIN mrs_items mi ON mi.mrs_id = mr.id
        ${BEST_PO_LATERAL}
        LEFT JOIN vendors v ON v.id = bp.vendor_id
        WHERE p.company_id = $1 ${pFilter} AND mr.status != 'cancelled'
      )
      SELECT
        COUNT(DISTINCT id)                                                             AS total_mrs,
        COUNT(DISTINCT id) FILTER (WHERE is_pending_approval AND NOT is_awaiting_client) AS pending_approvals,
        COUNT(DISTINCT id) FILTER (WHERE is_awaiting_client)                         AS awaiting_client,
        COUNT(DISTINCT id) FILTER (WHERE is_fully_approved AND po_id IS NULL)        AS pending_po,
        COUNT(DISTINCT po_id) FILTER (WHERE po_status IN ('pending','approved','sent')) AS open_pos,
        COUNT(DISTINCT id) FILTER (WHERE po_status IN ('sent','approved') AND received_qty = 0) AS in_transit,
        COUNT(DISTINCT id) FILTER (WHERE received_qty > 0 AND received_qty < requested_qty AND mr_status != 'closed') AS partial_delivery,
        COUNT(DISTINCT id) FILTER (WHERE po_id IS NOT NULL AND received_qty = 0 AND po_status IN ('sent','approved')) AS pending_grn,
        COUNT(DISTINCT id) FILTER (WHERE delivery_date < CURRENT_DATE AND received_qty < ordered_qty AND mr_status != 'closed') AS overdue,
        COUNT(DISTINCT id) FILTER (WHERE mr_status = 'closed') AS closed
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
      limit = 500, offset = 0,
    } = req.query;

    const cid = CID(req);
    const params = [cid];
    let i = 2;
    // Cancelled MRs are excluded by default, but the Status filter offers
    // "Cancelled" as an option — without this, it would always return zero
    // rows no matter what, since the base filter would still be excluding them.
    const conditions = status === 'Cancelled'
      ? ['p.company_id = $1']
      : ['p.company_id = $1', "mr.status != 'cancelled'"];

    if (project_id) { conditions.push(`mr.project_id = $${i++}`);  params.push(project_id); }
    if (vendor_id)  { conditions.push(`bp.vendor_id = $${i++}`);   params.push(vendor_id); }
    if (priority)   { conditions.push(`mr.priority = $${i++}`);    params.push(priority); }
    if (category)   { conditions.push(`mi.category ILIKE $${i++}`);params.push(`%${category}%`); }
    if (date_from)  { conditions.push(`mr.created_at >= $${i++}`); params.push(date_from); }
    if (date_to)    { conditions.push(`mr.created_at <= $${i++}`); params.push(date_to + 'T23:59:59'); }

    if (search) {
      conditions.push(`(mr.mrs_number ILIKE $${i} OR mr.serial_no_formatted ILIKE $${i} OR mi.material_name ILIKE $${i} OR bp.po_number ILIKE $${i} OR v.name ILIKE $${i})`);
      params.push(`%${search}%`); i++;
    }

    if (status) {
      // Must mirror the /dashboard KPI FILTER conditions exactly — otherwise
      // clicking a KPI card shows a different row set than the count on the
      // card (or, for several that were missing entirely, no filter at all —
      // silently showing every row instead).
      //
      // Note: "GRN Completed" here matches deriveStatus()'s definition
      // (fully received — the Status *dropdown* option), which is the
      // opposite of the dashboard's "pending_grn" KPI (nothing received yet).
      // The KPI card is labelled "Pending GRN" and its filter value on the
      // frontend must be the distinct string 'Pending GRN', not 'GRN
      // Completed' — the two used to collide on the same string meaning
      // opposite things.
      const receivedQty = RECEIVED_QTY_SUB('mr', 'mi');
      const orderedQty  = ORDERED_QTY_SUB('mr', 'mi');
      const statusMap = {
        'Draft':            `bp.po_id IS NULL AND NOT ${STILL_PENDING('mr','p')} AND NOT ${FULLY_APPROVED('mr','p')}`,
        // MD has already approved, only the client's own sign-off remains —
        // kept out of 'Pending Approval' so it isn't lumped in with items
        // still stuck at Store Manager / PM / Project Director.
        'Awaiting Client':  IS_AWAITING_CLIENT('mr', 'p'),
        'Pending Approval': `${STILL_PENDING('mr','p')} AND NOT ${IS_AWAITING_CLIENT('mr','p')}`,
        'PO Pending':       `${FULLY_APPROVED('mr','p')} AND bp.po_id IS NULL`,
        'PO Created':       `bp.po_status IN ('pending','approved','sent')`,
        'In Transit':       `bp.po_status IN ('sent','approved') AND (${receivedQty}) = 0`,
        'Partial Delivery': `(${receivedQty}) > 0 AND (${receivedQty}) < mi.quantity AND mr.status != 'closed'`,
        'Pending GRN':      `bp.po_id IS NOT NULL AND (${receivedQty}) = 0 AND bp.po_status IN ('sent','approved')`,
        'GRN Completed':    `(${receivedQty}) >= (${orderedQty}) AND (${orderedQty}) > 0`,
        'Closed':           `mr.status = 'closed'`,
        'Cancelled':        `mr.status = 'cancelled'`,
        // 'Issued to Site' is not implemented — that concept lives in the
        // Stores issue-slip module, which this endpoint doesn't join at all.
        // Selecting it currently falls through to no additional filter.
      };
      if (statusMap[status]) conditions.push(statusMap[status]);
    }

    if (po_status) {
      const ps = po_status.split(',').map(s => `'${s.replace(/'/g, "''")}'`).join(',');
      conditions.push(`bp.po_status IN (${ps})`);
    }

    const where = conditions.join(' AND ');

    const sql = `
      SELECT
        mr.id                           AS mr_id,
        COALESCE(mr.serial_no_formatted, mr.mrs_number) AS mr_number,
        mr.created_at                   AS mr_date,
        mr.required_by                  AS required_date,
        mr.status                       AS mr_status,
        mr.priority,
        mr.department,
        mr.cost_center,
        mr.remarks                      AS mr_remarks,
        p.id                            AS project_id,
        p.name                          AS project_name,
        u.name                          AS raised_by,
        mi.id                           AS item_id,
        mi.material_name,
        mi.item_code,
        mi.category                     AS material_category,
        mi.quantity                     AS requested_qty,
        mi.unit,
        COALESCE(mi.md_approved_qty, mi.quantity) AS approved_qty,
        -- Best PO (direct link preferred, fallback by MR header + name match)
        bp.po_id,
        bp.po_number,
        bp.po_date,
        bp.delivery_date                AS expected_delivery_date,
        bp.po_status,
        bp.vendor_id,
        v.name                          AS vendor_name,
        v.phone                         AS vendor_phone,
        -- Totals across ALL matching POs for this item
        ${ORDERED_QTY_SUB('mr', 'mi')}  AS ordered_qty,
        ${RECEIVED_QTY_SUB('mr', 'mi')} AS received_qty,
        ${GRN_COUNT_SUB('mr', 'mi')}    AS grn_count,
        bp.unit_rate,
        -- Last approved IGN date
        (
          SELECT MAX(ign2.approved_at)
          FROM po_items pi2
          JOIN purchase_orders po2 ON po2.id = pi2.po_id
          JOIN ign_items ii2 ON ii2.po_item_id = pi2.id
          JOIN ign ign2 ON ign2.id = ii2.ign_id AND ign2.status = 'approved'
          WHERE po2.status NOT IN ('rejected','cancelled')
            AND (pi2.mrs_item_id = mi.id
                 OR (pi2.mrs_item_id IS NULL
                     AND (po2.mrs_id = mr.id OR mr.id = ANY(COALESCE(po2.mrs_ids, ARRAY[]::uuid[])))))
        ) AS actual_delivery_date,
        ${FULLY_APPROVED('mr', 'p')}     AS is_fully_approved,
        ${STILL_PENDING('mr', 'p')}      AS is_pending_approval,
        ${IS_AWAITING_CLIENT('mr', 'p')} AS is_awaiting_client
      FROM material_requisitions mr
      JOIN projects p ON p.id = mr.project_id
      LEFT JOIN users u ON u.id = mr.raised_by
      JOIN mrs_items mi ON mi.mrs_id = mr.id
      ${BEST_PO_LATERAL}
      LEFT JOIN vendors v ON v.id = bp.vendor_id
      WHERE ${where}
      ORDER BY mr.created_at DESC
      LIMIT $${i++} OFFSET $${i++}
    `;
    params.push(parseInt(limit), parseInt(offset));

    // Run count query in parallel with the main query
    const countParams = params.slice(0, params.length - 2); // remove LIMIT/OFFSET params
    const countSql = `
      SELECT COUNT(*) AS total
      FROM material_requisitions mr
      JOIN projects p ON p.id = mr.project_id
      LEFT JOIN users u ON u.id = mr.raised_by
      JOIN mrs_items mi ON mi.mrs_id = mr.id
      ${BEST_PO_LATERAL}
      LEFT JOIN vendors v ON v.id = bp.vendor_id
      WHERE ${where}
    `;
    const [{ rows }, countRes] = await Promise.all([
      query(sql, params),
      query(countSql, countParams),
    ]);

    const enriched = rows.map(r => {
      const ordered  = parseFloat(r.ordered_qty  || 0);
      const received = parseFloat(r.received_qty || 0);
      const requested = parseFloat(r.requested_qty || 0);
      return {
        ...r,
        balance_qty:    Math.max(0, (ordered || requested) - received),
        supply_pct:     ordered > 0 ? Math.min(100, Math.round((received / ordered) * 100)) : 0,
        overall_status: deriveStatus(r),
        is_overdue:     r.expected_delivery_date
          && new Date(r.expected_delivery_date) < new Date()
          && received < (ordered || requested),
      };
    });

    const totalCount = parseInt(countRes.rows[0]?.total || 0);
    res.json({ data: enriched, count: enriched.length, total: totalCount });
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
             u.name AS raised_by_name, u.email AS raised_by_email,
             ub.name AS raised_by_full
      FROM material_requisitions mr
      JOIN projects p ON p.id = mr.project_id
      LEFT JOIN users u  ON u.id = mr.raised_by
      LEFT JOIN users ub ON ub.id = mr.raised_by
      WHERE mr.id = $1 AND p.company_id = $2
    `, [mrId, cid]);
    if (!mrRes.rows.length) return res.status(404).json({ error: 'MR not found' });

    const itemRes = await query(`
      SELECT mi.* FROM mrs_items mi WHERE mi.id = $1 AND mi.mrs_id = $2
    `, [itemId, mrId]);
    if (!itemRes.rows.length) return res.status(404).json({ error: 'MR item not found' });

    const matName = itemRes.rows[0].material_name;

    // All POs for this item: direct link OR MR-header link + name match
    // Also pick up any PO header-linked to MR even without name match (for display)
    const posRes = await query(`
      SELECT DISTINCT ON (po.id)
             pi.id AS pi_id, pi.quantity, pi.rate, pi.material_name AS pi_material,
             po.id AS po_id,
             COALESCE(po.serial_no_formatted, po.po_number) AS po_number,
             po.created_at AS po_created_at,
             po.po_date, po.delivery_date, po.status AS po_status, po.payment_terms,
             v.name AS vendor_name, v.phone AS vendor_phone, v.email AS vendor_email,
             (pi.mrs_item_id = $1) AS is_direct_link
      FROM po_items pi
      JOIN purchase_orders po ON po.id = pi.po_id
      LEFT JOIN vendors v ON v.id = po.vendor_id
      WHERE po.status NOT IN ('rejected','cancelled')
        AND (
          pi.mrs_item_id = $1
          OR (
            (po.mrs_id = $2 OR $2 = ANY(COALESCE(po.mrs_ids, ARRAY[]::uuid[])))
            AND (
              pi.mrs_item_id IS NULL
              OR pi.mrs_item_id = $1
            )
          )
        )
      ORDER BY po.id, (pi.mrs_item_id = $1) DESC, po.po_date
    `, [itemId, mrId]);

    const poItemIds = posRes.rows.map(r => r.pi_id).filter(Boolean);
    const poIds     = [...new Set(posRes.rows.map(r => r.po_id).filter(Boolean))];

    // IGN items linked to the matching PO items
    const ignRes = poItemIds.length ? await query(`
      SELECT DISTINCT ON (ign.id)
             ii.*,
             ii.qty_inspected, ii.qty_as_per_dc, ii.qty_rejected,
             ign.id AS ign_pk,
             ign.ign_number, ign.status AS ign_status,
             ign.created_at AS ign_created, ign.approved_at,
             ign.vehicle_no, ign.dc_number, ign.bill_number,
             v2.name AS ign_vendor_name
      FROM ign_items ii
      JOIN ign ON ign.id = ii.ign_id
      LEFT JOIN vendors v2 ON v2.id = ign.vendor_id
      WHERE ii.po_item_id = ANY($1::uuid[])
      ORDER BY ign.id, ign.created_at
    `, [poItemIds]) : { rows: [] };

    // Also catch IGNs linked at PO-header level (ign.po_id)
    const ignHeaderRes = poIds.length ? await query(`
      SELECT ign.id, ign.ign_number, ign.status AS ign_status,
             ign.created_at AS ign_created, ign.approved_at,
             ign.vehicle_no, ign.dc_number, ign.total_quantity,
             v2.name AS ign_vendor_name
      FROM ign
      LEFT JOIN vendors v2 ON v2.id = ign.vendor_id
      WHERE ign.po_id = ANY($1::uuid[])
      ORDER BY ign.created_at
    `, [poIds]) : { rows: [] };

    const grns = ignRes.rows.map(g => ({
      ...g,
      quantity_received: parseFloat(g.qty_inspected || g.qty_as_per_dc || 0) - parseFloat(g.qty_rejected || 0),
    }));

    // ── Build rich timeline ──────────────────────────────────────────────────
    const mr = mrRes.rows[0];
    const timeline = [];

    const add = (type, event, date, status, ref, extra = {}) => {
      if (date || status === 'pending') timeline.push({ type, event, date: date || null, status, ref: ref || null, ...extra });
    };

    // MR lifecycle
    add('mr',       'MR Raised',           mr.created_at,        'done',    mr.serial_no_formatted || mr.mrs_number, { by: mr.raised_by_name });
    add('approval', 'Submitted for Approval', mr.updated_at,     mr.status !== 'pending' ? 'done' : 'pending', null);
    if (mr.stores_approved_at) add('approval', 'Stores Approved',    mr.stores_approved_at, 'done', null);
    if (mr.approved_pm_at)     add('approval', 'PM Approved',         mr.approved_pm_at,     'done', null);
    if (mr.approved_mgmt_at)   add('approval', 'Management Approved', mr.approved_mgmt_at,   'done', null);
    if (mr.approved_md_at)     add('approval', 'MD Approved',         mr.approved_md_at,     'done', null);

    // PO events (deduplicated by po_id)
    // Use po_date (document date) for PO Created — more meaningful than DB timestamp
    const seenPo = new Set();
    posRes.rows.forEach(po => {
      if (seenPo.has(po.po_id)) return;
      seenPo.add(po.po_id);
      add('po', 'PO Created', po.po_date || po.po_created_at, 'done', po.po_number, { vendor: po.vendor_name });
      if (po.delivery_date)
        add('po', 'Expected Delivery', po.delivery_date,
          new Date(po.delivery_date) > new Date() ? 'future' : 'due',
          po.po_number, { vendor: po.vendor_name });
    });

    // No PO yet → show as pending
    if (!posRes.rows.length) {
      add('po', 'PO Creation Pending', null, 'pending', null);
    }

    // IGN item-level events
    const seenIgn = new Set();
    grns.forEach(g => {
      const ignKey = g.ign_pk || g.ign_id;
      if (seenIgn.has(ignKey)) return;
      seenIgn.add(ignKey);
      add('ign', 'Material Arrived (IGN Created)', g.ign_created, 'done', g.ign_number, {
        vehicle: g.vehicle_no, dc: g.dc_number, qty: g.quantity_received,
      });
      if (g.ign_status === 'approved')
        add('ign', 'IGN Approved / GRN Completed', g.approved_at, 'done', g.ign_number);
      else
        add('ign', 'Awaiting IGN Approval', null, 'pending', g.ign_number);
    });

    // IGN header-level events (fallback for IGNs not linked at item level)
    ignHeaderRes.rows.forEach(ig => {
      if (seenIgn.has(ig.id)) return;
      seenIgn.add(ig.id);

      add('ign', 'Material Arrived (IGN)', ig.ign_created, 'done', ig.ign_number, { vendor: ig.ign_vendor_name });
      if (ig.ign_status === 'approved')
        add('ign', 'IGN Approved / GRN Completed', ig.approved_at, 'done', ig.ign_number);
    });

    // If no GRN yet but PO exists → pending event
    if (posRes.rows.length && grns.length === 0 && ignHeaderRes.rows.length === 0) {
      add('ign', 'Awaiting Delivery / GRN', null, 'pending', null);
    }

    // Sort: done/due events by date first, then pending at end
    const sorted = [
      ...timeline.filter(t => t.status !== 'pending' && t.status !== 'future' && t.date).sort((a, b) => new Date(a.date) - new Date(b.date)),
      ...timeline.filter(t => t.status === 'future' || t.status === 'due').sort((a, b) => new Date(a.date) - new Date(b.date)),
      ...timeline.filter(t => t.status === 'pending'),
    ];

    res.json({
      data: {
        mr,
        item: itemRes.rows[0],
        purchase_orders: posRes.rows,
        grns,
        timeline: sorted,
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
        COUNT(DISTINCT mi.id)                          AS item_count,
        COALESCE(SUM(mi.quantity), 0)                  AS requested_qty,
        COALESCE(SUM(${ORDERED_QTY_SUB('mr', 'mi')}), 0)  AS ordered_qty,
        COALESCE(SUM(${RECEIVED_QTY_SUB('mr', 'mi')}), 0) AS received_qty,
        COUNT(DISTINCT bp.po_id)                       AS po_count,
        COALESCE(SUM(${GRN_COUNT_SUB('mr', 'mi')}), 0) AS grn_count
      FROM material_requisitions mr
      JOIN projects p ON p.id = mr.project_id
      JOIN mrs_items mi ON mi.mrs_id = mr.id
      ${BEST_PO_LATERAL}
      LEFT JOIN vendors v ON v.id = bp.vendor_id
      WHERE p.company_id = $1 ${extra} AND mr.status != 'cancelled'
      GROUP BY ${groupSql}
      ORDER BY requested_qty DESC
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
  if (mrStatus === 'closed')    return 'Closed';
  if (mrStatus === 'cancelled') return 'Cancelled';
  // is_pending_approval / is_fully_approved are computed in SQL (see
  // STILL_PENDING / FULLY_APPROVED) because "fully approved" depends on whether
  // the project opted into the client-approval stage. Fall back to the plain
  // status list for any caller that didn't select them.
  const pendingStages = ['pending','stores_verified','approved_pm','approved_sr_pm','approved_mgmt'];
  if (!r.po_id) {
    const pending = r.is_pending_approval != null
      ? r.is_pending_approval : pendingStages.includes(mrStatus);
    const approved = r.is_fully_approved != null
      ? r.is_fully_approved : mrStatus === 'approved_md';
    const awaitingClient = r.is_awaiting_client != null
      ? r.is_awaiting_client : false;
    // Distinct from the generic "Pending Approval" bucket — MD has already
    // signed off, only the client's own sign-off is outstanding.
    if (awaitingClient) return 'Awaiting Client';
    if (pending)  return 'Pending Approval';
    if (approved) return 'PO Pending';
    return 'Draft';
  }
  const ordered  = parseFloat(r.ordered_qty  || 0);
  const received = parseFloat(r.received_qty || 0);
  if (received >= ordered && ordered > 0) return 'GRN Completed';
  if (received > 0) return 'Partial Delivery';
  if (['sent','approved'].includes(String(r.po_status))) return 'In Transit';
  return 'PO Created';
}

// ── Diagnostic: why does "No PO" show a nonzero GRN count? ─────────────────
// (Read-only. Investigates the "No PO" vendor bucket in /summary — GRN count
// and received qty use identical join logic, so if grn_count > 0 for a row
// where the vendor lookup came up empty, that row's po_item is linked to an
// approved IGN but its purchase_orders.vendor_id is missing/dangling, or its
// received-qty subquery is silently returning 0 despite a matching IGN.)
router.get('/debug/no-po-anomaly', async (req, res) => {
  try {
    const { project_id } = req.query;
    const cid = CID(req);
    const params = [cid];
    let extra = '';
    if (project_id) { extra = `AND mr.project_id = $2`; params.push(project_id); }

    const { rows } = await query(`
      SELECT
        mr.id AS mr_id, mr.mrs_number, mr.serial_no_formatted,
        mi.id AS mi_id, mi.material_name, mi.quantity AS requested_qty,
        bp.po_id, bp.po_number, bp.vendor_id,
        v.name AS vendor_name,
        ${ORDERED_QTY_SUB('mr', 'mi')}  AS ordered_qty,
        ${RECEIVED_QTY_SUB('mr', 'mi')} AS received_qty,
        ${GRN_COUNT_SUB('mr', 'mi')}    AS grn_count
      FROM material_requisitions mr
      JOIN projects p ON p.id = mr.project_id
      JOIN mrs_items mi ON mi.mrs_id = mr.id
      ${BEST_PO_LATERAL}
      LEFT JOIN vendors v ON v.id = bp.vendor_id
      WHERE p.company_id = $1 ${extra} AND mr.status != 'cancelled'
        AND v.name IS NULL
        AND ${GRN_COUNT_SUB('mr', 'mi')} > 0
      ORDER BY mr.mrs_number
    `, params);

    res.json({ found: rows.length, rows });
  } catch (e) {
    console.error('[supply-tracker] no-po-anomaly debug error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
