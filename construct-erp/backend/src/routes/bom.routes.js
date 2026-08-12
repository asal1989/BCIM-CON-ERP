// src/routes/bom.routes.js
// Bill of Materials — project-wide material requirement planner for
// Procurement, the sibling report to BOQ Budget Breakdown. Mounted at
// ${API}/procurement/bom.
//
// Required qty is derived exactly the way materialRecon.routes.js's /audit
// endpoint derives "theoretical consumption" — BOQ item quantity x
// consumption_norms.norm_quantity, plus allowed_wastage_pct — except BOM
// uses the FULL BOQ quantity (forward planning: "what will this project
// need in total"), not just work executed so far (which is what /audit is
// checking actual usage against). Same engine, different quantity input,
// intentionally not duplicated logic — this is a one-line difference
// (boq_items.quantity vs. executed-to-date), so it's inlined here rather
// than importing a shared helper that would need parameterizing for one
// call site each.
const express = require('express');
const XLSX = require('xlsx');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { loadProjectScope, userCanAccessProject } = require('../middleware/projectScope');
const { query } = require('../config/database');

router.use(authenticate);
router.use(loadProjectScope);

const num = (v) => Number.parseFloat(v || 0) || 0;
// Material names are free text across boq consumption_norms/po_items/
// ign_items — normalize case/whitespace so "TMT Bar" and "tmt bar " roll up
// as the same material instead of silently splitting into two rows.
const norm = (s) => String(s || '').trim().toLowerCase();

async function assertProjectAccess(req, projectId) {
  if (!userCanAccessProject(req, projectId)) {
    const err = new Error('Access denied for this project.');
    err.statusCode = 403;
    throw err;
  }
  const proj = await query(`SELECT id, name, project_code FROM projects WHERE id=$1 AND company_id=$2`, [projectId, req.user.company_id]);
  if (!proj.rows.length) {
    const err = new Error('Project not found');
    err.statusCode = 404;
    throw err;
  }
  return proj.rows[0];
}

async function computeBom(req, projectId) {
  const [requiredRes, orderedRes, receivedRes] = await Promise.all([
    // Required — full BOQ quantity x norm, plus allowed wastage.
    query(`
      SELECT n.material_name, n.unit,
             SUM(bi.quantity * n.norm_quantity * (1 + COALESCE(n.allowed_wastage_pct,0)/100.0)) AS required_qty
      FROM boq_items bi
      JOIN consumption_norms n ON n.boq_item_id = bi.id
      WHERE bi.project_id = $1 AND bi.is_active = true
      GROUP BY n.material_name, n.unit
    `, [projectId]),
    // Ordered — PO line items on this project, excluding draft/cancelled.
    query(`
      SELECT pi.material_name, pi.unit, SUM(pi.quantity) AS ordered_qty
      FROM po_items pi
      JOIN purchase_orders po ON po.id = pi.po_id
      WHERE po.project_id = $1 AND po.status NOT IN ('draft','cancelled')
      GROUP BY pi.material_name, pi.unit
    `, [projectId]),
    // Received — IGN-inspected/accepted quantity (post-inspection, not just delivered).
    query(`
      SELECT ii.material_name, ii.unit, SUM(ii.qty_inspected) AS received_qty
      FROM ign_items ii
      JOIN ign i ON i.id = ii.ign_id
      WHERE i.project_id = $1 AND i.status = 'approved'
      GROUP BY ii.material_name, ii.unit
    `, [projectId]),
  ]);

  const rows = {}; // normalized name -> row
  const put = (name, unit) => {
    const key = norm(name);
    if (!rows[key]) rows[key] = { material_name: name, unit: unit || '', required_qty: 0, ordered_qty: 0, received_qty: 0, has_norm: false };
    // Prefer the first non-empty display name/unit seen; keep accumulating quantities.
    if (!rows[key].unit && unit) rows[key].unit = unit;
    return rows[key];
  };

  for (const r of requiredRes.rows) { const row = put(r.material_name, r.unit); row.required_qty += num(r.required_qty); row.has_norm = true; }
  for (const r of orderedRes.rows) put(r.material_name, r.unit).ordered_qty += num(r.ordered_qty);
  for (const r of receivedRes.rows) put(r.material_name, r.unit).received_qty += num(r.received_qty);

  const bom = Object.values(rows).map(r => {
    const balanceToOrder = Math.max(r.required_qty - r.ordered_qty, 0);
    const balanceToReceive = Math.max(r.ordered_qty - r.received_qty, 0);
    const overOrdered = Math.max(r.ordered_qty - r.required_qty, 0);
    let status;
    // A material bought with no consumption norm at all can't be judged
    // against a requirement — labeling it "over ordered" (required=0) would
    // be actively misleading, not just imprecise. Kept as its own state.
    if (!r.has_norm) status = 'no_norm';
    else if (r.ordered_qty === 0) status = 'not_ordered';
    else if (balanceToOrder > 0) status = 'partially_ordered';
    else if (overOrdered > r.required_qty * 0.05) status = 'over_ordered';
    else status = 'ok';
    return { ...r, balance_to_order: balanceToOrder, balance_to_receive: balanceToReceive, over_ordered: overOrdered, status };
  }).sort((a, b) => b.required_qty - a.required_qty);

  return {
    bom,
    summary: {
      material_count: bom.length,
      not_ordered_count: bom.filter(r => r.status === 'not_ordered').length,
      partially_ordered_count: bom.filter(r => r.status === 'partially_ordered').length,
      no_norm_count: bom.filter(r => r.status === 'no_norm').length,
      has_norms: requiredRes.rows.length > 0,
    },
  };
}

// GET /procurement/bom/:project_id
router.get('/:project_id', async (req, res) => {
  try {
    const project = await assertProjectAccess(req, req.params.project_id);
    const result = await computeBom(req, req.params.project_id);
    res.json({ data: { project, ...result } });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

// GET /procurement/bom/:project_id/export — Excel
router.get('/:project_id/export', async (req, res) => {
  try {
    const project = await assertProjectAccess(req, req.params.project_id);
    const { bom } = await computeBom(req, req.params.project_id);

    const wb = XLSX.utils.book_new();
    const today = new Date().toLocaleDateString('en-IN');
    const s1 = [
      [`BILL OF MATERIALS — ${project.name}`],
      [`Project Code: ${project.project_code || ''}   Generated: ${today}`],
      [],
      ['Material', 'Unit', 'Required (BOM)', 'Ordered', 'Received', 'Balance to Order', 'Balance to Receive', 'Status'],
      ...bom.map(r => [
        r.material_name, r.unit,
        Number(r.required_qty.toFixed(3)), Number(r.ordered_qty.toFixed(3)), Number(r.received_qty.toFixed(3)),
        Number(r.balance_to_order.toFixed(3)), Number(r.balance_to_receive.toFixed(3)), r.status.replace(/_/g, ' '),
      ]),
    ];
    const ws1 = XLSX.utils.aoa_to_sheet(s1);
    ws1['!cols'] = [28, 10, 16, 14, 14, 16, 16, 16].map(w => ({ wch: w }));
    XLSX.utils.book_append_sheet(wb, ws1, 'Bill of Materials');

    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const filename = `BOM_${(project.project_code || 'project').replace(/[^a-z0-9]/gi, '_')}_${today.replace(/\//g, '-')}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buf);
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

module.exports = router;
