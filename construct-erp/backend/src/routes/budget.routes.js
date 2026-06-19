// src/routes/budget.routes.js
const express = require('express');
const { authenticate, authorize } = require('../middleware/auth');
const { query } = require('../config/database');
const { loadProjectScope, userCanAccessProject } = require('../middleware/projectScope');
const router = express.Router();
router.use(authenticate);
router.use(loadProjectScope);

// One-time migration: normalize legacy cost_head names in budget_items to new DIPPL naming
;(async () => {
  try {
    await query(`
      UPDATE budget_items SET cost_head = 'Labour — Skilled'
        WHERE cost_head ILIKE 'labour%skilled%' AND cost_head NOT LIKE '%—%';
      UPDATE budget_items SET cost_head = 'Labour — Unskilled'
        WHERE cost_head ILIKE 'labour%unskilled%' AND cost_head NOT LIKE '%—%';
      UPDATE budget_items SET cost_head = 'Labour — Supervisory'
        WHERE cost_head ILIKE 'labour%supervis%' AND cost_head NOT LIKE '%—%';
      UPDATE budget_items SET cost_head = 'Material — Reinforcement'
        WHERE (cost_head ILIKE 'material%steel%' OR cost_head ILIKE 'material%reinforc%') AND cost_head NOT LIKE '%—%';
      UPDATE budget_items SET cost_head = 'Material — Concrete & Aggregates'
        WHERE (cost_head ILIKE 'material%concrete%' OR cost_head ILIKE 'material%aggregate%') AND cost_head NOT LIKE '%—%';
      UPDATE budget_items SET cost_head = 'Material — Formworks'
        WHERE (cost_head ILIKE 'material%formwork%' OR cost_head ILIKE 'material%shuttering%') AND cost_head NOT LIKE '%—%';
      UPDATE budget_items SET cost_head = 'Material — Other Materials'
        WHERE cost_head ILIKE 'material%other%' AND cost_head NOT LIKE '%—%';
      UPDATE budget_items SET cost_head = 'P & M — Equipment (General)'
        WHERE (cost_head ILIKE 'plant%machinery%' OR cost_head ILIKE 'p%m%hired%') AND cost_head NOT LIKE '%—%';
      UPDATE budget_items SET cost_head = 'Subcontracting — Civil'
        WHERE cost_head ILIKE 'subcontract%civil%' AND cost_head NOT LIKE '%—%';
      UPDATE budget_items SET cost_head = 'Subcontracting — MEP'
        WHERE cost_head ILIKE 'subcontract%mep%' AND cost_head NOT LIKE '%—%';
      UPDATE budget_items SET cost_head = 'Overhead — Site Overhead'
        WHERE (cost_head ILIKE 'site overhead' OR cost_head ILIKE 'overhead%site%') AND cost_head NOT LIKE '%—%';
      UPDATE budget_items SET cost_head = 'Overhead — Head Office'
        WHERE cost_head ILIKE 'overhead%office%' AND cost_head NOT LIKE '%—%';
      UPDATE budget_items SET cost_head = 'Electrical — Cables & Wiring'
        WHERE cost_head ILIKE 'electrical' AND cost_head NOT LIKE '%—%';
      UPDATE budget_items SET cost_head = 'Safety — PPE & Protective Gear'
        WHERE cost_head ILIKE 'safety' AND cost_head NOT LIKE '%—%';
    `);
  } catch (_) {}
})();

// Reusable: actual spend from DQS tqs_bills (paid) grouped by cost head.
// vendor_id is NULL on tqs_bills — join by name (ILIKE) as fallback.
// WO bills → Subcontracting — Civil by default; PO bills → vendor_type mapping.
const DQS_ACTUALS_SQL = `
  SELECT
    CASE b.bill_type
      WHEN 'wo' THEN COALESCE(
        CASE v.vendor_type
          WHEN 'equipment_supplier' THEN 'P & M — Equipment (General)'
          WHEN 'labour_contractor'  THEN 'Labour — Skilled'
          WHEN 'service_provider'   THEN 'Overhead — Site Overhead'
          ELSE 'Subcontracting — Civil'
        END, 'Subcontracting — Civil')
      ELSE COALESCE(po.cost_head,
        CASE
          WHEN EXISTS (SELECT 1 FROM po_items pi WHERE pi.po_id = po.id AND LOWER(pi.material_name) ~ 'steel|tmt|rebar|reinforc|fe[0-9]|bar.bend|bar.cut') THEN 'Material — Reinforcement'
          WHEN EXISTS (SELECT 1 FROM po_items pi WHERE pi.po_id = po.id AND LOWER(pi.material_name) ~ 'cement|opc|ppc|concrete|rmc|ready.?mix|m.?sand|aggregate|crush|coarse') THEN 'Material — Concrete & Aggregates'
          WHEN EXISTS (SELECT 1 FROM po_items pi WHERE pi.po_id = po.id AND LOWER(pi.material_name) ~ 'formwork|shuttering|plywood|prop|soldier|waler') THEN 'Material — Formworks'
          WHEN EXISTS (SELECT 1 FROM po_items pi WHERE pi.po_id = po.id AND LOWER(pi.material_name) ~ 'safety|ppe|helmet|glove|harness|vest|boot|goggle|barricad') THEN 'Safety — PPE & Protective Gear'
          WHEN EXISTS (SELECT 1 FROM po_items pi WHERE pi.po_id = po.id AND LOWER(pi.material_name) ~ 'cable|wire|electrical|switch|panel|mcb|breaker|conduit|light|led|flood') THEN 'Electrical — Cables & Wiring'
          WHEN EXISTS (SELECT 1 FROM po_items pi WHERE pi.po_id = po.id AND LOWER(pi.material_name) ~ 'excavat|jcb|crane|tipper|dump|dozer|grader|roller|compactor|pump|poclain|transit') THEN 'P & M — Equipment (General)'
          WHEN v.vendor_type = 'subcontractor'      THEN 'Subcontracting — Civil'
          WHEN v.vendor_type = 'equipment_supplier' THEN 'P & M — Equipment (General)'
          WHEN v.vendor_type = 'labour_contractor'  THEN 'Labour — Skilled'
          WHEN v.vendor_type = 'service_provider'   THEN 'Overhead — Site Overhead'
          ELSE 'Material — Other Materials'
        END
      )
    END AS cost_head,
    SUM(b.total_amount) AS actual_spend
  FROM tqs_bills b
  LEFT JOIN purchase_orders po ON po.id = b.po_id
  LEFT JOIN vendors v ON v.name ILIKE b.vendor_name
  WHERE b.project_id = $1
    AND b.workflow_status = 'paid'
    AND b.is_deleted = false
  GROUP BY 1
`;

// GET /budget/actuals?project_id=xxx&cost_head=yyy
// Returns individual DQS paid bills that make up the actual spend for a cost head
router.get('/actuals', async (req, res) => {
  try {
    const { project_id, cost_head } = req.query;
    if (!project_id || !cost_head) return res.status(400).json({ error: 'project_id and cost_head required' });

    const proj = await query(
      `SELECT id FROM projects WHERE id=$1 AND company_id=$2`,
      [project_id, req.user.company_id]
    );
    if (!proj.rows.length) return res.status(404).json({ error: 'Project not found' });
    if (!userCanAccessProject(req, project_id)) return res.status(403).json({ error: 'Access denied' });

    const result = await query(`
      SELECT
        b.sl_number, b.vendor_name, b.bill_type, b.inv_number, b.inv_date,
        b.basic_amount, b.gst_amount, b.total_amount, b.po_number, b.work_desc,
        b.workflow_status, b.created_at,
        v.vendor_type,
        CASE b.bill_type
          WHEN 'wo' THEN COALESCE(
            CASE v.vendor_type
              WHEN 'equipment_supplier' THEN 'P & M — Equipment (General)'
              WHEN 'labour_contractor'  THEN 'Labour — Skilled'
              WHEN 'service_provider'   THEN 'Overhead — Site Overhead'
              ELSE 'Subcontracting — Civil'
            END, 'Subcontracting — Civil')
          ELSE COALESCE(po.cost_head,
            CASE
              WHEN EXISTS (SELECT 1 FROM po_items pi WHERE pi.po_id = po.id AND LOWER(pi.material_name) ~ 'steel|tmt|rebar|reinforc|fe[0-9]|bar.bend|bar.cut') THEN 'Material — Reinforcement'
              WHEN EXISTS (SELECT 1 FROM po_items pi WHERE pi.po_id = po.id AND LOWER(pi.material_name) ~ 'cement|opc|ppc|concrete|rmc|ready.?mix|m.?sand|aggregate|crush|coarse') THEN 'Material — Concrete & Aggregates'
              WHEN EXISTS (SELECT 1 FROM po_items pi WHERE pi.po_id = po.id AND LOWER(pi.material_name) ~ 'formwork|shuttering|plywood|prop|soldier|waler') THEN 'Material — Formworks'
              WHEN EXISTS (SELECT 1 FROM po_items pi WHERE pi.po_id = po.id AND LOWER(pi.material_name) ~ 'safety|ppe|helmet|glove|harness|vest|boot|goggle|barricad') THEN 'Safety — PPE & Protective Gear'
              WHEN EXISTS (SELECT 1 FROM po_items pi WHERE pi.po_id = po.id AND LOWER(pi.material_name) ~ 'cable|wire|electrical|switch|panel|mcb|breaker|conduit|light|led|flood') THEN 'Electrical — Cables & Wiring'
              WHEN EXISTS (SELECT 1 FROM po_items pi WHERE pi.po_id = po.id AND LOWER(pi.material_name) ~ 'excavat|jcb|crane|tipper|dump|dozer|grader|roller|compactor|pump|poclain|transit') THEN 'P & M — Equipment (General)'
              WHEN v.vendor_type = 'subcontractor'      THEN 'Subcontracting — Civil'
              WHEN v.vendor_type = 'equipment_supplier' THEN 'P & M — Equipment (General)'
              WHEN v.vendor_type = 'labour_contractor'  THEN 'Labour — Skilled'
              WHEN v.vendor_type = 'service_provider'   THEN 'Overhead — Site Overhead'
              ELSE 'Material — Other Materials'
            END
          )
        END AS resolved_cost_head
      FROM tqs_bills b
      LEFT JOIN purchase_orders po ON po.id = b.po_id
      LEFT JOIN vendors v ON v.name ILIKE b.vendor_name
      WHERE b.project_id = $1
        AND b.workflow_status = 'paid'
        AND b.is_deleted = false
      ORDER BY b.inv_date DESC, b.sl_number
    `, [project_id]);

    // Filter to only bills that match the requested cost head
    const bills = result.rows.filter(r => r.resolved_cost_head === cost_head);
    res.json({ data: bills });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /budget?project_id=xxx
// Returns budget lines with actual_spend from DQS Tracker (paid bills only)
router.get('/', async (req, res) => {
  try {
    const { project_id } = req.query;
    if (!project_id) return res.status(400).json({ error: 'project_id required' });

    const proj = await query(
      `SELECT id FROM projects WHERE id=$1 AND company_id=$2`,
      [project_id, req.user.company_id]
    );
    if (!proj.rows.length) return res.status(404).json({ error: 'Project not found' });
    if (!userCanAccessProject(req, project_id)) return res.status(403).json({ error: 'Access denied' });

    // Budget lines
    const budget = await query(
      `SELECT * FROM budget_items WHERE project_id=$1 ORDER BY created_at`,
      [project_id]
    );

    // Actual spend from DQS Tracker paid bills
    const actuals = await query(DQS_ACTUALS_SQL, [project_id]);

    const actualMap = {};
    actuals.rows.forEach(r => { actualMap[r.cost_head] = parseFloat(r.actual_spend || 0); });

    // Merge actual spend into budget lines
    const rows = budget.rows.map(b => ({
      ...b,
      actual_amount: actualMap[b.cost_head] || 0,
    }));

    // Also return cost heads that have spend but no budget line (unbudgeted)
    const budgetedHeads = new Set(budget.rows.map(b => b.cost_head));
    const unbudgeted = actuals.rows
      .filter(r => !budgetedHeads.has(r.cost_head))
      .map(r => ({
        id: null,
        project_id,
        cost_head: r.cost_head,
        budgeted_amount: 0,
        actual_amount: parseFloat(r.actual_spend || 0),
        remarks: 'No budget allocated — spend from DQS paid bills',
        unbudgeted: true,
      }));

    res.json({ data: [...rows, ...unbudgeted] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /budget/commitment?project_id=xxx
// Returns committed costs (POs) vs budget vs actual payments per cost_head
router.get('/commitment', async (req, res) => {
  try {
    const { project_id } = req.query;
    if (!project_id) return res.status(400).json({ error: 'project_id required' });

    const proj = await query(
      `SELECT id FROM projects WHERE id=$1 AND company_id=$2`,
      [project_id, req.user.company_id]
    );
    if (!proj.rows.length) return res.status(404).json({ error: 'Project not found' });

    // PO commitments grouped by cost_head (auto-mapped from vendor_type if not set)
    const pos = await query(`
      SELECT
        COALESCE(po.cost_head,
          CASE
            WHEN EXISTS (SELECT 1 FROM po_items pi WHERE pi.po_id = po.id AND LOWER(pi.material_name) ~ 'steel|tmt|rebar|reinforc|fe[0-9]|bar.bend|bar.cut') THEN 'Material — Reinforcement'
            WHEN EXISTS (SELECT 1 FROM po_items pi WHERE pi.po_id = po.id AND LOWER(pi.material_name) ~ 'cement|opc|ppc|concrete|rmc|ready.?mix|m.?sand|aggregate|crush|coarse') THEN 'Material — Concrete & Aggregates'
            WHEN EXISTS (SELECT 1 FROM po_items pi WHERE pi.po_id = po.id AND LOWER(pi.material_name) ~ 'formwork|shuttering|plywood|prop|soldier|waler') THEN 'Material — Formworks'
            WHEN EXISTS (SELECT 1 FROM po_items pi WHERE pi.po_id = po.id AND LOWER(pi.material_name) ~ 'safety|ppe|helmet|glove|harness|vest|boot|goggle|barricad') THEN 'Safety — PPE & Protective Gear'
            WHEN EXISTS (SELECT 1 FROM po_items pi WHERE pi.po_id = po.id AND LOWER(pi.material_name) ~ 'cable|wire|electrical|switch|panel|mcb|breaker|conduit|light|led|flood') THEN 'Electrical — Cables & Wiring'
            WHEN EXISTS (SELECT 1 FROM po_items pi WHERE pi.po_id = po.id AND LOWER(pi.material_name) ~ 'excavat|jcb|crane|tipper|dump|dozer|grader|roller|compactor|pump|poclain|transit') THEN 'P & M — Equipment (General)'
            WHEN v.vendor_type = 'subcontractor'      THEN 'Subcontracting — Civil'
            WHEN v.vendor_type = 'equipment_supplier' THEN 'P & M — Equipment (General)'
            WHEN v.vendor_type = 'labour_contractor'  THEN 'Labour — Skilled'
            WHEN v.vendor_type = 'service_provider'   THEN 'Overhead — Site Overhead'
            ELSE 'Material — Other Materials'
          END
        ) AS cost_head,
        SUM(CASE WHEN po.status NOT IN ('cancelled','draft') THEN po.grand_total ELSE 0 END) AS committed,
        SUM(CASE WHEN po.status = 'cancelled' THEN po.grand_total ELSE 0 END) AS cancelled_value,
        COUNT(CASE WHEN po.status NOT IN ('cancelled','draft') THEN 1 END)::int AS po_count
      FROM purchase_orders po
      LEFT JOIN vendors v ON v.id = po.vendor_id
      WHERE po.project_id = $1
      GROUP BY 1 ORDER BY 1
    `, [project_id]);

    // Budget lines
    const budget = await query(
      `SELECT cost_head, budgeted_amount FROM budget_items WHERE project_id=$1`,
      [project_id]
    );

    // Actual paid from DQS Tracker (paid bills)
    const payments = await query(DQS_ACTUALS_SQL, [project_id]);

    // Merge all cost heads
    const allHeads = new Set([
      ...pos.rows.map(r => r.cost_head),
      ...budget.rows.map(r => r.cost_head),
      ...payments.rows.map(r => r.cost_head),
    ]);

    const budgetMap  = Object.fromEntries(budget.rows.map(r => [r.cost_head, Number(r.budgeted_amount)]));
    const paymentMap = Object.fromEntries(payments.rows.map(r => [r.cost_head, Number(r.actual_spend)]));
    const poMap      = Object.fromEntries(pos.rows.map(r => [r.cost_head, {
      committed:  Number(r.committed),
      po_count:   Number(r.po_count),
      cancelled:  Number(r.cancelled_value),
    }]));

    const rows = [...allHeads].sort().map(h => ({
      cost_head:  h,
      budgeted:   budgetMap[h]           || 0,
      committed:  poMap[h]?.committed    || 0,
      po_count:   poMap[h]?.po_count     || 0,
      cancelled:  poMap[h]?.cancelled    || 0,
      actual:     paymentMap[h]          || 0,
    }));

    res.json({ data: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /budget
router.post('/', authorize('super_admin', 'admin', 'project_manager', 'accountant'), async (req, res) => {
  try {
    const { project_id, cost_head, budgeted_amount, budget_pct, remarks } = req.body;
    if (!project_id || !cost_head || !budgeted_amount)
      return res.status(400).json({ error: 'project_id, cost_head, budgeted_amount are required' });

    const proj = await query(
      `SELECT id FROM projects WHERE id=$1 AND company_id=$2`,
      [project_id, req.user.company_id]
    );
    if (!proj.rows.length) return res.status(404).json({ error: 'Project not found' });

    const result = await query(
      `INSERT INTO budget_items (project_id, cost_head, budgeted_amount, budget_pct, actual_amount, remarks)
       VALUES ($1,$2,$3,$4,0,$5) RETURNING *`,
      [project_id, cost_head, budgeted_amount, budget_pct || null, remarks]
    );
    res.status(201).json({ data: result.rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /budget/:id
router.put('/:id', authorize('super_admin', 'admin', 'project_manager', 'accountant'), async (req, res) => {
  try {
    const { cost_head, budgeted_amount, budget_pct, remarks } = req.body;
    const check = await query(
      `SELECT b.id FROM budget_items b JOIN projects p ON b.project_id=p.id
       WHERE b.id=$1 AND p.company_id=$2`,
      [req.params.id, req.user.company_id]
    );
    if (!check.rows.length) return res.status(404).json({ error: 'Not found' });

    const result = await query(
      `UPDATE budget_items
         SET cost_head=COALESCE($1,cost_head),
             budgeted_amount=COALESCE($2,budgeted_amount),
             budget_pct=$3,
             remarks=COALESCE($4,remarks),
             updated_at=NOW()
       WHERE id=$5 RETURNING *`,
      [cost_head, budgeted_amount, budget_pct !== undefined ? budget_pct : null, remarks, req.params.id]
    );
    res.json({ data: result.rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /budget/:id
router.delete('/:id', authorize('super_admin', 'admin'), async (req, res) => {
  try {
    const check = await query(
      `SELECT b.id FROM budget_items b JOIN projects p ON b.project_id=p.id
       WHERE b.id=$1 AND p.company_id=$2`,
      [req.params.id, req.user.company_id]
    );
    if (!check.rows.length) return res.status(404).json({ error: 'Not found' });
    await query(`DELETE FROM budget_items WHERE id=$1`, [req.params.id]);
    res.json({ message: 'Deleted' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
