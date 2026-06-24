// src/routes/procurement-alerts.routes.js
// Procurement intelligence: overdue POs, partial deliveries, rate variances, orphan bills
const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { query } = require('../config/database');
const { loadProjectScope, appendProjectScope } = require('../middleware/projectScope');

router.use(authenticate);
router.use(loadProjectScope);

// ── GET /procurement/alerts/summary ──────────────────────────────────────────
// KPI counts: overdue, partial, variances, orphans
router.get('/summary', async (req, res) => {
  try {
    const { project_id } = req.query;
    const cid = req.user.company_id;

    const [overdue, partial, orphan, variance] = await Promise.all([
      // Overdue: approved POs past delivery date, not yet fully received
      query(`
        SELECT COUNT(DISTINCT po.id)::int AS cnt
        FROM purchase_orders po
        JOIN projects p ON p.id = po.project_id
        WHERE p.company_id = $1
          AND po.delivery_date < CURRENT_DATE
          AND po.status NOT IN ('received','fully_received','cancelled','rejected')
          ${project_id ? `AND po.project_id = '${project_id}'` : ''}
      `, [cid]),

      // Partial: POs where some GRNs exist but not fully received
      query(`
        SELECT COUNT(DISTINCT po.id)::int AS cnt
        FROM purchase_orders po
        JOIN projects p ON p.id = po.project_id
        WHERE p.company_id = $1
          AND po.status NOT IN ('received','fully_received','cancelled','rejected')
          AND EXISTS (
            SELECT 1 FROM grn g WHERE g.po_id = po.id AND g.quality_status = 'approved'
          )
          AND EXISTS (
            SELECT 1 FROM po_items poi
            WHERE poi.po_id = po.id
              AND poi.quantity > COALESCE((
                SELECT SUM(gi.quantity_received)
                FROM grn_items gi JOIN grn g2 ON g2.id = gi.grn_id
                WHERE g2.po_id = po.id AND g2.quality_status = 'approved'
                  AND gi.po_item_id = poi.id
              ), 0)
          )
          ${project_id ? `AND po.project_id = '${project_id}'` : ''}
      `, [cid]),

      // Orphan bills: tqs_bills with bill_type='po' but no grn_id
      query(`
        SELECT COUNT(*)::int AS cnt
        FROM tqs_bills b
        JOIN projects p ON p.id = b.project_id
        WHERE p.company_id = $1
          AND b.bill_type = 'po'
          AND b.grn_id IS NULL
          AND b.is_deleted = FALSE
          ${project_id ? `AND b.project_id = '${project_id}'` : ''}
      `, [cid]),

      // Rate variances: GRN items where rate > PO item rate by >5%
      query(`
        SELECT COUNT(DISTINCT gi.id)::int AS cnt
        FROM grn_items gi
        JOIN grn g ON g.id = gi.grn_id
        JOIN projects p ON p.id = g.project_id
        LEFT JOIN po_items poi ON poi.id = gi.po_item_id
        WHERE p.company_id = $1
          AND gi.po_item_id IS NOT NULL
          AND poi.rate > 0
          AND gi.rate > 0
          AND ABS(gi.rate - poi.rate) / poi.rate > 0.05
          ${project_id ? `AND g.project_id = '${project_id}'` : ''}
      `, [cid]),
    ]);

    res.json({
      overdue:  overdue.rows[0].cnt,
      partial:  partial.rows[0].cnt,
      orphan:   orphan.rows[0].cnt,
      variance: variance.rows[0].cnt,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── GET /procurement/alerts/overdue ──────────────────────────────────────────
router.get('/overdue', async (req, res) => {
  try {
    const { project_id } = req.query;
    const cid = req.user.company_id;
    let sql = `
      SELECT po.id, po.po_number, po.serial_no_formatted, po.po_date, po.delivery_date,
             po.status, po.grand_total,
             v.name AS vendor_name,
             p.name AS project_name,
             (CURRENT_DATE - po.delivery_date)::int AS days_overdue,
             COALESCE(SUM(poi.quantity), 0) AS total_ordered,
             COALESCE((
               SELECT SUM(gi.quantity_received)
               FROM grn_items gi JOIN grn g ON g.id = gi.grn_id
               WHERE g.po_id = po.id AND g.quality_status = 'approved'
             ), 0) AS total_received
      FROM purchase_orders po
      JOIN projects p ON p.id = po.project_id
      LEFT JOIN vendors v ON v.id = po.vendor_id
      LEFT JOIN po_items poi ON poi.po_id = po.id
      WHERE p.company_id = $1
        AND po.delivery_date < CURRENT_DATE
        AND po.status NOT IN ('received','fully_received','cancelled','rejected')`;
    const params = [cid];
    let i = 2;
    if (project_id) { sql += ` AND po.project_id = $${i++}`; params.push(project_id); }
    sql += ` GROUP BY po.id, v.name, p.name ORDER BY po.delivery_date ASC`;
    const { rows } = await query(sql, params);
    res.json({ data: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── GET /procurement/alerts/partial ──────────────────────────────────────────
router.get('/partial', async (req, res) => {
  try {
    const { project_id } = req.query;
    const cid = req.user.company_id;
    let sql = `
      SELECT po.id, po.po_number, po.serial_no_formatted, po.po_date, po.delivery_date,
             po.status, po.grand_total,
             v.name AS vendor_name,
             p.name AS project_name,
             COALESCE(SUM(poi.quantity), 0)        AS total_ordered,
             COALESCE((
               SELECT SUM(gi.quantity_received)
               FROM grn_items gi JOIN grn g ON g.id = gi.grn_id
               WHERE g.po_id = po.id AND g.quality_status = 'approved'
             ), 0) AS total_received
      FROM purchase_orders po
      JOIN projects p ON p.id = po.project_id
      LEFT JOIN vendors v ON v.id = po.vendor_id
      LEFT JOIN po_items poi ON poi.po_id = po.id
      WHERE p.company_id = $1
        AND po.status NOT IN ('received','fully_received','cancelled','rejected')
        AND EXISTS (SELECT 1 FROM grn g WHERE g.po_id = po.id AND g.quality_status = 'approved')`;
    const params = [cid];
    let i = 2;
    if (project_id) { sql += ` AND po.project_id = $${i++}`; params.push(project_id); }
    sql += ` GROUP BY po.id, v.name, p.name
             HAVING COALESCE(SUM(poi.quantity), 0) > COALESCE((
               SELECT SUM(gi.quantity_received)
               FROM grn_items gi JOIN grn g ON g.id = gi.grn_id
               WHERE g.po_id = po.id AND g.quality_status = 'approved'
             ), 0)
             ORDER BY po.po_date DESC`;
    const { rows } = await query(sql, params);
    res.json({ data: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── GET /procurement/alerts/rate-variance ─────────────────────────────────────
router.get('/rate-variance', async (req, res) => {
  try {
    const { project_id } = req.query;
    const cid = req.user.company_id;
    let sql = `
      SELECT gi.id, gi.material_name, gi.quantity_received AS qty, gi.unit,
             gi.rate AS grn_rate,
             poi.rate AS po_rate,
             ROUND((gi.rate - poi.rate) / NULLIF(poi.rate, 0) * 100, 1) AS variance_pct,
             g.grn_number, g.grn_date, g.id AS grn_id,
             po.po_number, po.id AS po_id,
             v.name AS vendor_name,
             p.name AS project_name
      FROM grn_items gi
      JOIN grn g ON g.id = gi.grn_id
      JOIN projects p ON p.id = g.project_id
      LEFT JOIN po_items poi ON poi.id = gi.po_item_id
      LEFT JOIN purchase_orders po ON po.id = g.po_id
      LEFT JOIN vendors v ON v.id = g.vendor_id
      WHERE p.company_id = $1
        AND gi.po_item_id IS NOT NULL
        AND poi.rate > 0 AND gi.rate > 0
        AND ABS(gi.rate - poi.rate) / poi.rate > 0.05`;
    const params = [cid];
    let i = 2;
    if (project_id) { sql += ` AND g.project_id = $${i++}`; params.push(project_id); }
    sql += ` ORDER BY ABS(gi.rate - poi.rate) / poi.rate DESC LIMIT 200`;
    const { rows } = await query(sql, params);
    res.json({ data: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── GET /procurement/alerts/orphan-bills ─────────────────────────────────────
router.get('/orphan-bills', async (req, res) => {
  try {
    const { project_id } = req.query;
    const cid = req.user.company_id;
    let sql = `
      SELECT b.id, b.sl_number, b.vendor_name, b.inv_number, b.inv_date,
             b.total_amount, b.workflow_status, b.bill_type,
             b.received_date, b.po_number,
             p.name AS project_name
      FROM tqs_bills b
      JOIN projects p ON p.id = b.project_id
      WHERE p.company_id = $1
        AND b.bill_type = 'po'
        AND b.grn_id IS NULL
        AND b.is_deleted = FALSE`;
    const params = [cid];
    let i = 2;
    if (project_id) { sql += ` AND b.project_id = $${i++}`; params.push(project_id); }
    sql += ` ORDER BY b.received_date DESC LIMIT 200`;
    const { rows } = await query(sql, params);
    res.json({ data: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
