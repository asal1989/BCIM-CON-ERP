// src/routes/report.routes.js
const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { loadProjectScope, userCanAccessProject } = require('../middleware/projectScope');
const { query } = require('../config/database');
router.use(authenticate);
router.use(loadProjectScope);

async function ensureProjectOwnership(projectId, companyId) {
  const check = await query(
    `SELECT 1 FROM projects WHERE id = $1 AND company_id = $2 LIMIT 1`,
    [projectId, companyId]
  );
  return check.rowCount > 0;
}

function applyProjectScope(req, conditions, params, alias = 'p', requestedProjectId = null) {
  if (requestedProjectId && String(requestedProjectId).trim()) {
    if (!userCanAccessProject(req, requestedProjectId)) {
      const err = new Error('Access denied for this project.');
      err.statusCode = 403;
      throw err;
    }
    params.push(requestedProjectId);
    conditions.push(`${alias}.id = $${params.length}`);
    return;
  }
  if (req.isGlobalRole) return;
  const allowed = req.allowedProjectIds || [];
  if (!allowed.length) {
    conditions.push('FALSE');
    return;
  }
  params.push(allowed);
  conditions.push(`${alias}.id = ANY($${params.length}::uuid[])`);
}

async function ensureProjectAccess(req, projectId) {
  if (!projectId || !(await ensureProjectOwnership(projectId, req.user.company_id))) {
    const err = new Error('Invalid project for this company');
    err.statusCode = 400;
    throw err;
  }
  if (!userCanAccessProject(req, projectId)) {
    const err = new Error('Access denied for this project.');
    err.statusCode = 403;
    throw err;
  }
}

// Project Profitability P&L
router.get('/profitability', async (req, res) => {
  const { year } = req.query;
  const { project_id } = req.query;
  const params = [req.user.company_id];
  const conditions = ['p.company_id=$1', 'p.is_active=true'];
  applyProjectScope(req, conditions, params, 'p', project_id);
  const r = await query(
    `SELECT p.id, p.name, p.type, p.contract_value, p.status,
       COALESCE((SELECT SUM(i.total_amount) FROM invoices i WHERE i.project_id=p.id AND i.payment_status='paid'),0) as revenue_collected,
       COALESCE((SELECT SUM(b.actual_amount) FROM budget_items b WHERE b.project_id=p.id),0) as total_cost,
       COALESCE((SELECT SUM(b.budgeted_amount) FROM budget_items b WHERE b.project_id=p.id),0) as total_budget,
       COALESCE((SELECT SUM(rb.net_payable) FROM ra_bills rb WHERE rb.project_id=p.id AND rb.status IN ('certified','paid')),0) as certified_amount
     FROM projects p WHERE ${conditions.join(' AND ')}
     ORDER BY p.contract_value DESC`,
    params
  );
  const data = r.rows.map(p => ({
    ...p,
    gross_profit: parseFloat(p.revenue_collected) - parseFloat(p.total_cost),
    margin_pct: parseFloat(p.revenue_collected) > 0
      ? (((parseFloat(p.revenue_collected) - parseFloat(p.total_cost)) / parseFloat(p.revenue_collected)) * 100).toFixed(1)
      : 0
  }));
  res.json({ data });
});

// GST Report
router.get('/gst', async (req, res) => {
  try {
    const { year, quarter, project_id } = req.query;
    const yr = parseInt(year) || new Date().getFullYear();
    const scopeConditions = ['p.company_id=$1'];
    const scopeParams = [req.user.company_id];
    applyProjectScope(req, scopeConditions, scopeParams, 'p', project_id);

    let gstSql = `SELECT gst_type,
       SUM(taxable_amount) as taxable,
       SUM(cgst_amount) as cgst,
       SUM(sgst_amount) as sgst,
       SUM(igst_amount) as igst,
       SUM(cgst_amount+sgst_amount+igst_amount) as total_gst,
     COUNT(*) as invoice_count
     FROM invoices i JOIN projects p ON i.project_id=p.id
     WHERE ${scopeConditions.join(' AND ')} AND EXTRACT(YEAR FROM i.invoice_date)=$${scopeParams.length + 1}`;
    const gstParams = [...scopeParams, yr];
    if (quarter) {
      gstSql += ` AND EXTRACT(QUARTER FROM i.invoice_date) = $${gstParams.length + 1}`;
      gstParams.push(parseInt(quarter));
    }
    gstSql += ' GROUP BY gst_type';

    const output = await query(gstSql, gstParams);
    const itc = await query(
      `SELECT COALESCE(SUM(gst_amount),0) as total_itc FROM purchase_orders po
       JOIN projects p ON po.project_id=p.id
       WHERE ${scopeConditions.join(' AND ')} AND EXTRACT(YEAR FROM po.po_date)=$${scopeParams.length + 1} AND po.status!='cancelled'`,
      [...scopeParams, yr]
    );
    const total_output = output.rows.reduce((s,r) => s + parseFloat(r.total_gst||0), 0);
    const total_itc = parseFloat(itc.rows[0].total_itc||0);
    res.json({ output: output.rows, itc: itc.rows[0], net_payable: (total_output - total_itc).toFixed(2) });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

// TDS Report (Form 26Q)
router.get('/tds', async (req, res) => {
  try {
    const { year, from_date, to_date, from, to, project_id } = req.query;
    const dateFrom = from_date || from;
    const dateTo   = to_date   || to;

    let whereClauses = [`p.company_id = $1`, `pay.tds_deducted > 0`];
    const params = [req.user.company_id];
    applyProjectScope(req, whereClauses, params, 'p', project_id);
    let idx = params.length + 1;

    if (dateFrom && dateTo) {
      whereClauses.push(`pay.payment_date BETWEEN $${idx++} AND $${idx++}`);
      params.push(dateFrom, dateTo);
    } else {
      // default: current financial year
      const yr = parseInt(year) || new Date().getFullYear();
      whereClauses.push(`EXTRACT(YEAR FROM pay.payment_date) = $${idx++}`);
      params.push(yr);
    }

    const r = await query(
      `SELECT entity_name, entity_pan,
         SUM(amount)       AS gross_paid,
         SUM(tds_deducted) AS tds_amount,
         COUNT(*)          AS transactions
       FROM payments pay
       JOIN projects p ON pay.project_id = p.id
       WHERE ${whereClauses.join(' AND ')}
       GROUP BY entity_name, entity_pan
       ORDER BY tds_amount DESC`,
      params
    );
    res.json({ data: r.rows });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

// Vendor Ledger (DQS + Finance)
router.get('/vendor-ledger', async (req, res) => {
  try {
    const { project_id } = req.query;
    const params = [req.user.company_id];
    const scopeConditions = ['p.company_id = $1'];
    applyProjectScope(req, scopeConditions, params, 'p', project_id);
    const projectClauseTqs = ` AND b.project_id IN (SELECT p.id FROM projects p WHERE ${scopeConditions.join(' AND ')})`;
    const projectClauseInv = ` AND i.project_id IN (SELECT p.id FROM projects p WHERE ${scopeConditions.join(' AND ')})`;
    const projectClausePay = ` AND pay.project_id IN (SELECT p.id FROM projects p WHERE ${scopeConditions.join(' AND ')})`;

    const [tqsRes, invRes, payRes] = await Promise.all([
      query(
        `
          SELECT
            COALESCE(b.vendor_id::text, 'name:' || COALESCE(b.vendor_name, 'unknown')) AS vendor_key,
            b.vendor_id,
            b.vendor_name,
            COUNT(b.id)::int AS bill_count,
            COALESCE(SUM(b.total_amount), 0) AS total_invoiced,
            COALESCE(SUM(u.certified_net), 0) AS total_certified,
            COALESCE(SUM(u.paid_amount), 0) AS total_paid,
            COALESCE(SUM(u.tds_deduction), 0) AS total_tds,
            COALESCE(SUM(u.retention_money), 0) AS total_retention,
            COALESCE(SUM(u.certified_net), 0) - COALESCE(SUM(u.paid_amount), 0) AS outstanding,
            'DQS' AS source
          FROM tqs_bills b
          LEFT JOIN tqs_bill_updates u ON u.bill_id = b.id
          LEFT JOIN projects p ON p.id = b.project_id
          WHERE b.company_id = $1 AND b.is_deleted = FALSE ${projectClauseTqs}
          GROUP BY COALESCE(b.vendor_id::text, 'name:' || COALESCE(b.vendor_name, 'unknown')), b.vendor_id, b.vendor_name
        `,
        params
      ),
      query(
        `
          SELECT
            COALESCE(i.vendor_id::text, 'name:' || COALESCE(v.name, 'unknown')) AS vendor_key,
            i.vendor_id,
            COALESCE(v.name, 'unknown') AS vendor_name,
            COUNT(i.id)::int AS bill_count,
            COALESCE(SUM(COALESCE(i.net_amount, i.total_amount, 0)), 0) AS total_invoiced,
            0::numeric AS total_certified,
            COALESCE(SUM(COALESCE(pay_sum.paid_amount, 0)), 0) AS total_paid,
            0::numeric AS total_tds,
            0::numeric AS total_retention,
            COALESCE(SUM(GREATEST(COALESCE(i.net_amount, i.total_amount, 0) - COALESCE(pay_sum.paid_amount, 0), 0)), 0) AS outstanding,
            'Finance' AS source
          FROM invoices i
          JOIN projects p ON p.id = i.project_id
          JOIN vendors v ON v.id = i.vendor_id
          LEFT JOIN LATERAL (
            SELECT COALESCE(SUM(pay.net_amount), 0) AS paid_amount
            FROM payments pay
            WHERE pay.invoice_id = i.id
          ) pay_sum ON TRUE
          WHERE p.company_id = $1 ${projectClauseInv}
          GROUP BY COALESCE(i.vendor_id::text, 'name:' || COALESCE(v.name, 'unknown')), i.vendor_id, v.name
        `,
        params
      ),
      query(
        `
          SELECT
            COALESCE(i.vendor_id::text, 'name:' || COALESCE(pay.entity_name, 'unknown')) AS vendor_key,
            i.vendor_id,
            COALESCE(v.name, pay.entity_name, 'unknown') AS vendor_name,
            COUNT(pay.id)::int AS bill_count,
            0::numeric AS total_invoiced,
            0::numeric AS total_certified,
            COALESCE(SUM(pay.net_amount), 0) AS total_paid,
            COALESCE(SUM(pay.tds_deducted), 0) AS total_tds,
            0::numeric AS total_retention,
            0::numeric AS outstanding,
            'Payment' AS source
          FROM payments pay
          JOIN projects p ON p.id = pay.project_id
          LEFT JOIN invoices i ON i.id = pay.invoice_id
          LEFT JOIN vendors v ON v.id = i.vendor_id
          WHERE p.company_id = $1 ${projectClausePay}
          GROUP BY COALESCE(i.vendor_id::text, 'name:' || COALESCE(pay.entity_name, 'unknown')), i.vendor_id, COALESCE(v.name, pay.entity_name, 'unknown')
        `,
        params
      ),
    ]);

    const map = new Map();
    const merge = (row) => {
      const key = row.vendor_key;
      if (!map.has(key)) {
        map.set(key, {
          vendor_key: key,
          vendor_id: row.vendor_id || null,
          vendor_name: row.vendor_name || '—',
          bill_count: 0,
          total_invoiced: 0,
          total_certified: 0,
          total_paid: 0,
          total_tds: 0,
          total_retention: 0,
          outstanding: 0,
          sources: new Set(),
        });
      }
      const target = map.get(key);
      target.vendor_id = target.vendor_id || row.vendor_id || null;
      target.vendor_name = target.vendor_name !== '—' ? target.vendor_name : (row.vendor_name || '—');
      target.bill_count += Number(row.bill_count || 0);
      target.total_invoiced += Number(row.total_invoiced || 0);
      target.total_certified += Number(row.total_certified || 0);
      target.total_paid += Number(row.total_paid || 0);
      target.total_tds += Number(row.total_tds || 0);
      target.total_retention += Number(row.total_retention || 0);
      target.outstanding += Number(row.outstanding || 0);
      target.sources.add(row.source);
    };

    [...tqsRes.rows, ...invRes.rows, ...payRes.rows].forEach(merge);

    const data = [...map.values()]
      .map(row => ({
        ...row,
        sources: [...row.sources].sort().join(' + '),
      }))
      .sort((a, b) => b.outstanding - a.outstanding || a.vendor_name.localeCompare(b.vendor_name));

    res.json({ data });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

// BOQ vs Actual
router.get('/boq-actual', async (req, res) => {
  const { project_id } = req.query;
  try { await ensureProjectAccess(req, project_id); } catch (err) { return res.status(err.statusCode || 500).json({ error: err.message }); }
  const r = await query(
    `SELECT b.item_no, b.description, b.unit,
       b.quantity as contract_qty, b.rate, b.amount as contract_value,
       GREATEST(
         COALESCE((SELECT SUM(m.net_quantity) FROM measurements m JOIN projects pm ON m.project_id = pm.id WHERE m.boq_item_id=b.id AND m.status='pm_approved' AND pm.company_id=$2),0),
         COALESCE((
           SELECT SUM(bi.curr_qty)
           FROM sc_bill_items bi
           JOIN sc_bills sb ON sb.id=bi.bill_id
           JOIN sc_wo_items swi ON swi.id=bi.wo_item_id
           WHERE swi.boq_item_id=b.id
             AND sb.status IN ('approved','paid')
             AND sb.company_id=$2
         ),0)
       ) as executed_qty,
       COALESCE((
         SELECT SUM(bi.curr_qty)
         FROM sc_bill_items bi
         JOIN sc_bills sb ON sb.id=bi.bill_id
         JOIN sc_wo_items swi ON swi.id=bi.wo_item_id
         WHERE swi.boq_item_id=b.id
           AND sb.status IN ('approved','paid')
           AND sb.company_id=$2
       ),0) as subcontractor_billed_qty,
       COALESCE((SELECT SUM(rbi.current_qty) FROM ra_bill_items rbi JOIN ra_bills rb ON rbi.ra_bill_id=rb.id JOIN projects rp ON rb.project_id = rp.id WHERE rbi.boq_item_id=b.id AND rb.status IN ('certified','paid') AND rp.company_id=$2),0) as certified_qty
     FROM boq_items b JOIN projects p ON b.project_id = p.id WHERE b.project_id=$1 AND p.company_id=$2 AND b.is_active=true ORDER BY b.chapter_no,b.item_no`,
    [project_id, req.user.company_id]
  );
  const data = r.rows.map(row => ({
    ...row,
    executed_value: (parseFloat(row.executed_qty) * parseFloat(row.rate)).toFixed(2),
    balance_qty: (parseFloat(row.contract_qty) - parseFloat(row.executed_qty)).toFixed(3),
    pct_complete: parseFloat(row.contract_qty) > 0
      ? ((parseFloat(row.executed_qty) / parseFloat(row.contract_qty)) * 100).toFixed(1) : 0
  }));
  res.json({ data });
});

// Labour Productivity
router.get('/labor', async (req, res) => {
  const { project_id, from_date, to_date } = req.query;
  try { await ensureProjectAccess(req, project_id); } catch (err) { return res.status(err.statusCode || 500).json({ error: err.message }); }
  const r = await query(
    `SELECT w.skill_type,
       COUNT(DISTINCT w.id) as worker_count,
       SUM(CASE WHEN a.status='present' THEN 1 WHEN a.status='half_day' THEN 0.5 ELSE 0 END) as man_days,
       SUM(a.ot_hours) as ot_hours,
       SUM(w.daily_rate * CASE WHEN a.status='present' THEN 1 WHEN a.status='half_day' THEN 0.5 ELSE 0 END) as wage_cost
     FROM workers w
     JOIN projects p ON w.project_id = p.id
     LEFT JOIN attendance a ON a.worker_id=w.id
       AND a.attendance_date BETWEEN $2 AND $3
     WHERE w.project_id=$1 AND p.company_id=$4 GROUP BY w.skill_type ORDER BY wage_cost DESC`,
    [project_id, from_date || '2024-01-01', to_date || new Date().toISOString().split('T')[0], req.user.company_id]
  );
  res.json({ data: r.rows });
});

// Stock Report
router.get('/stock', async (req, res) => {
  const { project_id } = req.query;
  try { await ensureProjectAccess(req, project_id); } catch (err) { return res.status(err.statusCode || 500).json({ error: err.message }); }
  const r = await query(
    `SELECT i.*,
       CASE WHEN i.closing_stock < i.minimum_level THEN 'LOW' ELSE 'OK' END as stock_status
     FROM inventory i
     JOIN projects p ON i.project_id = p.id
     WHERE i.project_id=$1 AND p.company_id=$2 ORDER BY i.material_name`,
    [project_id, req.user.company_id]
  );
  res.json({ data: r.rows });
});

// Safety KPI Report
router.get('/safety', async (req, res) => {
  const { year } = req.query;
  const yr = year || new Date().getFullYear();
  const params = [req.user.company_id, yr];
  const conditions = ['p.company_id=$1'];
  applyProjectScope(req, conditions, params, 'p', null);
  const r = await query(
    `SELECT p.name as project_name,
       COUNT(i.id) as total_incidents,
       COUNT(i.id) FILTER (WHERE i.incident_type='near_miss') as near_miss,
       COUNT(i.id) FILTER (WHERE i.incident_type='minor_injury') as minor_injury,
       COUNT(i.id) FILTER (WHERE i.incident_type='major_accident') as major_accident,
       SUM(i.lost_time_days) as lti_days,
       COUNT(i.id) FILTER (WHERE i.status='open') as open_incidents
     FROM projects p LEFT JOIN incidents i ON i.project_id=p.id
       AND EXTRACT(YEAR FROM i.incident_date)=$2
     WHERE ${conditions.join(' AND ')} GROUP BY p.id,p.name`,
    params
  );
  res.json({ data: r.rows });
});

// ── GET /reports/project-pl ────────────────────────────────────────────────
// Full project P&L: Contract Value → Client Billing → DQS Vendor Cost → Margin
router.get('/project-pl', async (req, res) => {
  try {
    const { project_id } = req.query;
    const params = [req.user.company_id];
    const conditions = ['p.company_id = $1', 'p.is_active = TRUE'];
    applyProjectScope(req, conditions, params, 'p', project_id);

    const { rows } = await query(`
      SELECT
        p.id,
        p.name                                AS project_name,
        p.type                                AS project_type,
        p.status,
        COALESCE(p.contract_value, 0)         AS contract_value,

        -- Client Revenue (RA Bills billed to client)
        COALESCE(rev.gross_billed,    0)      AS gross_billed,
        COALESCE(rev.net_billed,      0)      AS net_billed,
        COALESCE(rev.received,        0)      AS received_from_client,
        COALESCE(rev.bill_count,      0)      AS ra_bill_count,

        -- Vendor Cost (DQS certified amounts)
        COALESCE(cost.vendor_certified, 0)    AS vendor_certified,
        COALESCE(cost.vendor_paid,      0)    AS vendor_paid,
        COALESCE(cost.vendor_outstanding, 0)  AS vendor_outstanding,
        COALESCE(cost.tds_held,         0)    AS tds_held,
        COALESCE(cost.retention_held,   0)    AS retention_held,
        COALESCE(cost.bill_count,       0)    AS tqs_bill_count,

        -- Other Payments (labour, overhead etc from payments table)
        COALESCE(pay.other_cost,        0)    AS other_cost,

        -- Computed P&L
        COALESCE(rev.net_billed, 0) -
          COALESCE(cost.vendor_certified, 0) -
          COALESCE(pay.other_cost, 0)         AS gross_margin,

        CASE WHEN COALESCE(rev.net_billed, 0) > 0
          THEN ROUND(
            (COALESCE(rev.net_billed, 0) -
             COALESCE(cost.vendor_certified, 0) -
             COALESCE(pay.other_cost, 0))
            / COALESCE(rev.net_billed, 0) * 100, 1)
          ELSE 0
        END                                   AS margin_pct,

        -- % of contract billed
        CASE WHEN COALESCE(p.contract_value, 0) > 0
          THEN ROUND(COALESCE(rev.net_billed, 0) / p.contract_value * 100, 1)
          ELSE 0
        END                                   AS pct_billed

      FROM projects p

      LEFT JOIN LATERAL (
        SELECT
          SUM(rb.gross_amount)  FILTER (WHERE rb.status IN ('certified','paid')) AS gross_billed,
          SUM(rb.net_payable)   FILTER (WHERE rb.status IN ('certified','paid')) AS net_billed,
          SUM(rb.net_payable)   FILTER (WHERE rb.status = 'paid')               AS received,
          COUNT(rb.id)          FILTER (WHERE rb.status IN ('certified','paid')) AS bill_count
        FROM ra_bills rb WHERE rb.project_id = p.id
      ) rev ON TRUE

      LEFT JOIN LATERAL (
        SELECT
          SUM(u.certified_net)    AS vendor_certified,
          SUM(u.paid_amount)      AS vendor_paid,
          SUM(u.balance_to_pay)   AS vendor_outstanding,
          SUM(u.tds_deduction)    AS tds_held,
          SUM(u.retention_money)  AS retention_held,
          COUNT(tb.id)            AS bill_count
        FROM tqs_bills tb
        LEFT JOIN tqs_bill_updates u ON u.bill_id = tb.id
        WHERE tb.project_id = p.id AND tb.is_deleted = FALSE
          AND tb.workflow_status IN ('qs','accounts','paid')
      ) cost ON TRUE

      LEFT JOIN LATERAL (
        SELECT SUM(pay.net_amount) AS other_cost
        FROM payments pay
        WHERE pay.project_id = p.id
          AND pay.source != 'tqs'   -- exclude DQS auto-entries (already in vendor_certified)
      ) pay ON TRUE

      WHERE ${conditions.join(' AND ')}
      ORDER BY COALESCE(p.contract_value, 0) DESC
    `, params);

    res.json({ data: rows });
  } catch (err) {
    console.error(err);
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

// ── GET /reports/budget-vs-actual-procurement ─────────────────────────────
// Compares each project's procurement-related budget heads against actual
// purchase order spend
router.get('/budget-vs-actual-procurement', async (req, res) => {
  try {
    const { project_id } = req.query;
    const params = [req.user.company_id];
    const conditions = ['p.company_id = $1', 'p.is_active = TRUE'];
    applyProjectScope(req, conditions, params, 'p', project_id);

    const { rows } = await query(`
      SELECT
        p.id AS project_id,
        p.name AS project_name,
        b.id AS budget_item_id,
        b.cost_head,
        COALESCE(b.budgeted_amount, 0) AS budgeted_amount,
        COALESCE(b.actual_amount, 0) AS actual_amount,
        COALESCE(po.po_spend, 0) AS po_spend
      FROM projects p
      JOIN budget_items b ON b.project_id = p.id
      LEFT JOIN LATERAL (
        SELECT SUM(COALESCE(po2.grand_total, 0)) AS po_spend
        FROM purchase_orders po2
        WHERE po2.project_id = p.id
          AND COALESCE(po2.status, '') NOT IN ('cancelled', 'rejected')
      ) po ON TRUE
      WHERE ${conditions.join(' AND ')}
      ORDER BY p.name, b.cost_head
    `, params);

    const data = rows.map(r => {
      const budgeted = parseFloat(r.budgeted_amount) || 0;
      const actual = parseFloat(r.actual_amount) || 0;
      const variance = budgeted - actual;
      return {
        ...r,
        variance_amount: variance,
        variance_pct: budgeted > 0 ? (variance / budgeted) * 100 : 0,
      };
    });

    res.json({ data });
  } catch (err) {
    console.error(err);
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});
// ── P2: Pending Purchase Requisitions ────────────────────────────────────────
router.get('/procurement/pending-pr', async (req, res) => {
  try {
    const { project_id, from_date, to_date, from, to } = req.query;
    const params = [req.user.company_id];
    const pConds = ['p.company_id = $1'];
    applyProjectScope(req, pConds, params, 'p', project_id);
    const dateFrom = from_date || from;
    const dateTo   = to_date   || to;
    let dateSql = '';
    if (dateFrom && dateTo) {
      params.push(dateFrom, dateTo);
      dateSql = `AND mr.created_at::date BETWEEN $${params.length - 1} AND $${params.length}`;
    }
    const { rows } = await query(`
      WITH po_ord AS (
        SELECT poi.mrs_item_id, SUM(poi.quantity) AS qty
        FROM po_items poi
        JOIN purchase_orders po ON po.id = poi.po_id
        WHERE po.status NOT IN ('rejected','cancelled') AND poi.mrs_item_id IS NOT NULL
        GROUP BY poi.mrs_item_id
      )
      SELECT
        mr.serial_no_formatted                                                          AS mrs_number,
        p.name                                                                          AS project_name,
        u.name                                                                          AS raised_by,
        mi.material_name,
        mi.unit,
        ROUND(COALESCE(mi.md_approved_qty, mi.quantity)::numeric, 3)                   AS requested_qty,
        ROUND(COALESCE(ord.qty, 0)::numeric, 3)                                         AS ordered_qty,
        ROUND((COALESCE(mi.md_approved_qty, mi.quantity) - COALESCE(ord.qty,0))::numeric,3) AS balance_qty,
        mr.required_by,
        (CURRENT_DATE - mr.created_at::date)::int                                       AS days_pending,
        COALESCE(mr.priority,'normal')                                                  AS priority
      FROM mrs_items mi
      JOIN material_requisitions mr ON mr.id = mi.mrs_id
      JOIN projects p ON p.id = mr.project_id
      LEFT JOIN users u ON u.id = mr.raised_by
      LEFT JOIN po_ord ord ON ord.mrs_item_id = mi.id
      WHERE ${pConds.join(' AND ')}
        AND mr.status NOT IN ('rejected','cancelled')
        AND COALESCE(mi.md_included, TRUE) = TRUE
        AND COALESCE(mi.md_approved_qty, mi.quantity) > COALESCE(ord.qty, 0)
        ${dateSql}
      ORDER BY days_pending DESC, mr.created_at DESC
    `, params);
    res.json({ data: rows });
  } catch (err) { res.status(err.statusCode || 500).json({ error: err.message }); }
});

// ── P3: PR Approval Status ────────────────────────────────────────────────────
router.get('/procurement/pr-approval-status', async (req, res) => {
  try {
    const { project_id } = req.query;
    const params = [req.user.company_id];
    const pConds = ['p.company_id = $1'];
    applyProjectScope(req, pConds, params, 'p', project_id);
    const { rows } = await query(`
      SELECT
        mr.serial_no_formatted                          AS mrs_number,
        mr.status,
        p.name                                          AS project_name,
        u.name                                          AS raised_by,
        COALESCE(mr.priority,'normal')                  AS priority,
        (CURRENT_DATE - mr.created_at::date)::int       AS days_open,
        (SELECT COUNT(*) FROM mrs_items WHERE mrs_id = mr.id)::int AS item_count
      FROM material_requisitions mr
      JOIN projects p ON p.id = mr.project_id
      LEFT JOIN users u ON u.id = mr.raised_by
      WHERE ${pConds.join(' AND ')}
        AND mr.status NOT IN ('rejected','cancelled','approved_md','issued')
      ORDER BY days_open DESC, mr.created_at DESC
    `, params);
    res.json({ data: rows });
  } catch (err) { res.status(err.statusCode || 500).json({ error: err.message }); }
});

// ── P7: Open PO Report ────────────────────────────────────────────────────────
router.get('/procurement/open-pos', async (req, res) => {
  try {
    const { project_id, from_date, to_date, from, to } = req.query;
    const params = [req.user.company_id];
    const pConds = ['p.company_id = $1'];
    applyProjectScope(req, pConds, params, 'p', project_id);
    const dateFrom = from_date || from;
    const dateTo   = to_date   || to;
    let dateSql = '';
    if (dateFrom && dateTo) {
      params.push(dateFrom, dateTo);
      dateSql = `AND po.po_date BETWEEN $${params.length - 1} AND $${params.length}`;
    }
    const { rows } = await query(`
      WITH recv AS (
        SELECT gi.po_item_id, SUM(gi.quantity_received) AS qty
        FROM grn_items gi
        JOIN grn g ON g.id = gi.grn_id
        WHERE g.quality_status NOT IN ('rejected') AND gi.po_item_id IS NOT NULL
        GROUP BY gi.po_item_id
      ),
      po_agg AS (
        SELECT
          poi.po_id,
          SUM(poi.quantity)                                                    AS ordered_qty,
          SUM(COALESCE(r.qty, 0))                                               AS received_qty,
          SUM((poi.quantity - COALESCE(r.qty,0)) * COALESCE(poi.rate, 0))      AS pending_value
        FROM po_items poi
        LEFT JOIN recv r ON r.po_item_id = poi.id
        GROUP BY poi.po_id
      )
      SELECT
        po.po_number,
        v.name                                                                   AS vendor_name,
        p.name                                                                   AS project_name,
        po.po_date,
        po.status,
        ROUND(COALESCE(pa.ordered_qty, 0)::numeric, 3)                          AS ordered_qty,
        ROUND(COALESCE(pa.received_qty, 0)::numeric, 3)                         AS received_qty,
        ROUND((COALESCE(pa.ordered_qty,0) - COALESCE(pa.received_qty,0))::numeric, 3) AS pending_qty,
        ROUND(COALESCE(pa.pending_value, po.grand_total)::numeric, 2)           AS pending_value
      FROM purchase_orders po
      JOIN projects p ON p.id = po.project_id
      LEFT JOIN vendors v ON v.id = po.vendor_id
      LEFT JOIN po_agg pa ON pa.po_id = po.id
      WHERE ${pConds.join(' AND ')}
        AND po.status NOT IN ('fully_received','cancelled','rejected')
        ${dateSql}
      ORDER BY po.po_date ASC
    `, params);
    res.json({ data: rows });
  } catch (err) { res.status(err.statusCode || 500).json({ error: err.message }); }
});

// ── P9: Pending Delivery ──────────────────────────────────────────────────────
router.get('/procurement/pending-delivery', async (req, res) => {
  try {
    const { project_id } = req.query;
    const params = [req.user.company_id];
    const pConds = ['p.company_id = $1'];
    applyProjectScope(req, pConds, params, 'p', project_id);
    const { rows } = await query(`
      WITH recv AS (
        SELECT gi.po_item_id, SUM(gi.quantity_received) AS qty
        FROM grn_items gi
        JOIN grn g ON g.id = gi.grn_id
        WHERE g.quality_status NOT IN ('rejected') AND gi.po_item_id IS NOT NULL
        GROUP BY gi.po_item_id
      )
      SELECT
        po.po_number,
        v.name                                                                    AS vendor_name,
        poi.material_name,
        poi.unit,
        ROUND(poi.quantity::numeric, 3)                                            AS ordered_qty,
        ROUND(COALESCE(r.qty, 0)::numeric, 3)                                      AS received_qty,
        ROUND((poi.quantity - COALESCE(r.qty,0))::numeric, 3)                      AS pending_qty,
        poi.req_date,
        CASE WHEN poi.req_date IS NOT NULL AND poi.req_date < CURRENT_DATE
          THEN (CURRENT_DATE - poi.req_date)::int ELSE 0 END                       AS days_overdue,
        p.name                                                                    AS project_name
      FROM po_items poi
      JOIN purchase_orders po ON po.id = poi.po_id
      JOIN projects p ON p.id = po.project_id
      LEFT JOIN vendors v ON v.id = po.vendor_id
      LEFT JOIN recv r ON r.po_item_id = poi.id
      WHERE ${pConds.join(' AND ')}
        AND po.status NOT IN ('fully_received','cancelled','rejected')
        AND poi.quantity > COALESCE(r.qty, 0)
      ORDER BY days_overdue DESC, po.po_date ASC
    `, params);
    res.json({ data: rows });
  } catch (err) { res.status(err.statusCode || 500).json({ error: err.message }); }
});

// ── P10: PO Aging ─────────────────────────────────────────────────────────────
router.get('/procurement/po-aging', async (req, res) => {
  try {
    const { project_id } = req.query;
    const params = [req.user.company_id];
    const pConds = ['p.company_id = $1'];
    applyProjectScope(req, pConds, params, 'p', project_id);
    const { rows } = await query(`
      SELECT
        po.po_number,
        v.name                                      AS vendor_name,
        p.name                                      AS project_name,
        po.po_date,
        po.status,
        (CURRENT_DATE - po.po_date)::int            AS age_days,
        CASE
          WHEN (CURRENT_DATE - po.po_date) <=  7 THEN '0-7 days'
          WHEN (CURRENT_DATE - po.po_date) <= 15 THEN '8-15 days'
          WHEN (CURRENT_DATE - po.po_date) <= 30 THEN '16-30 days'
          ELSE '30+ days'
        END                                          AS aging_bucket,
        ROUND(po.grand_total::numeric, 2)            AS open_value
      FROM purchase_orders po
      JOIN projects p ON p.id = po.project_id
      LEFT JOIN vendors v ON v.id = po.vendor_id
      WHERE ${pConds.join(' AND ')}
        AND po.status NOT IN ('fully_received','cancelled','rejected')
      ORDER BY age_days DESC
    `, params);
    res.json({ data: rows });
  } catch (err) { res.status(err.statusCode || 500).json({ error: err.message }); }
});

// ── P11: Vendor Performance ───────────────────────────────────────────────────
router.get('/procurement/vendor-performance', async (req, res) => {
  try {
    const { project_id, from_date, to_date, from, to } = req.query;
    const params = [req.user.company_id];
    const pConds = ['p.company_id = $1'];
    applyProjectScope(req, pConds, params, 'p', project_id);
    const dateFrom = from_date || from;
    const dateTo   = to_date   || to;
    let dateSql = '';
    if (dateFrom && dateTo) {
      params.push(dateFrom, dateTo);
      dateSql = `AND po.po_date BETWEEN $${params.length - 1} AND $${params.length}`;
    }
    const { rows } = await query(`
      SELECT
        v.name                                                                       AS vendor_name,
        COUNT(DISTINCT po.id)                                                        AS po_count,
        ROUND(SUM(po.grand_total)::numeric, 2)                                       AS total_value,
        COUNT(g.id)                                                                  AS grn_count,
        COUNT(g.id) FILTER (WHERE g.quality_status IN ('approved','verified_stores','part_received')) AS accepted_grns,
        COUNT(g.id) FILTER (WHERE g.quality_status = 'rejected')                    AS rejected_grns,
        ROUND(100.0 * COUNT(g.id) FILTER (WHERE g.quality_status IN ('approved','verified_stores','part_received'))
          / NULLIF(COUNT(g.id), 0), 1)                                               AS acceptance_pct,
        ROUND(100.0 * COUNT(g.id) FILTER (WHERE g.quality_status = 'rejected')
          / NULLIF(COUNT(g.id), 0), 1)                                               AS rejection_pct
      FROM purchase_orders po
      JOIN projects p ON p.id = po.project_id
      JOIN vendors v ON v.id = po.vendor_id
      LEFT JOIN grn g ON g.po_id = po.id
      WHERE ${pConds.join(' AND ')}
        AND po.status NOT IN ('cancelled','rejected')
        ${dateSql}
      GROUP BY v.id, v.name
      ORDER BY total_value DESC NULLS LAST
    `, params);
    res.json({ data: rows });
  } catch (err) { res.status(err.statusCode || 500).json({ error: err.message }); }
});

// ── P12: Vendor-wise Spend Analysis ──────────────────────────────────────────
router.get('/procurement/vendor-spend', async (req, res) => {
  try {
    const { project_id, from_date, to_date, from, to } = req.query;
    const params = [req.user.company_id];
    const pConds = ['p.company_id = $1'];
    applyProjectScope(req, pConds, params, 'p', project_id);
    const dateFrom = from_date || from;
    const dateTo   = to_date   || to;
    let dateSql = '';
    if (dateFrom && dateTo) {
      params.push(dateFrom, dateTo);
      dateSql = `AND po.po_date BETWEEN $${params.length - 1} AND $${params.length}`;
    }
    const { rows } = await query(`
      SELECT
        v.name                                                              AS vendor_name,
        COUNT(DISTINCT po.id)                                               AS po_count,
        ROUND(SUM(po.grand_total)::numeric, 2)                             AS total_value,
        ROUND(AVG(po.grand_total)::numeric, 2)                             AS avg_value,
        ROUND(100.0 * SUM(po.grand_total) / NULLIF(SUM(SUM(po.grand_total)) OVER (), 0), 1) AS spend_pct
      FROM purchase_orders po
      JOIN projects p ON p.id = po.project_id
      JOIN vendors v ON v.id = po.vendor_id
      WHERE ${pConds.join(' AND ')}
        AND po.status NOT IN ('cancelled','rejected')
        ${dateSql}
      GROUP BY v.id, v.name
      ORDER BY total_value DESC
    `, params);
    res.json({ data: rows });
  } catch (err) { res.status(err.statusCode || 500).json({ error: err.message }); }
});

// ── P13: Item-wise Purchase Analysis ─────────────────────────────────────────
router.get('/procurement/item-analysis', async (req, res) => {
  try {
    const { project_id, from_date, to_date, from, to } = req.query;
    const params = [req.user.company_id];
    const pConds = ['p.company_id = $1'];
    applyProjectScope(req, pConds, params, 'p', project_id);
    const dateFrom = from_date || from;
    const dateTo   = to_date   || to;
    let dateSql = '';
    if (dateFrom && dateTo) {
      params.push(dateFrom, dateTo);
      dateSql = `AND po.po_date BETWEEN $${params.length - 1} AND $${params.length}`;
    }
    const { rows } = await query(`
      SELECT
        MAX(poi.material_name)                                                             AS material_name,
        MAX(poi.unit)                                                                      AS unit,
        COUNT(DISTINCT po.id)                                                              AS po_count,
        COUNT(DISTINCT po.vendor_id)                                                       AS vendor_count,
        ROUND(SUM(poi.quantity)::numeric, 3)                                               AS total_qty,
        ROUND(SUM(COALESCE(poi.total_amount, poi.quantity * poi.rate))::numeric, 2)        AS total_value,
        ROUND(AVG(poi.rate)::numeric, 2)                                                   AS avg_rate,
        ROUND(MIN(poi.rate)::numeric, 2)                                                   AS min_rate,
        ROUND(MAX(poi.rate)::numeric, 2)                                                   AS max_rate
      FROM po_items poi
      JOIN purchase_orders po ON po.id = poi.po_id
      JOIN projects p ON p.id = po.project_id
      WHERE ${pConds.join(' AND ')}
        AND po.status NOT IN ('cancelled','rejected')
        AND COALESCE(poi.rate, 0) > 0
        ${dateSql}
      GROUP BY lower(trim(poi.material_name))
      ORDER BY total_value DESC
    `, params);
    res.json({ data: rows });
  } catch (err) { res.status(err.statusCode || 500).json({ error: err.message }); }
});

// ── P14: Project-wise Procurement ────────────────────────────────────────────
router.get('/procurement/project-procurement', async (req, res) => {
  try {
    const { from_date, to_date, from, to } = req.query;
    const params = [req.user.company_id];
    const pConds = ['p.company_id = $1'];
    applyProjectScope(req, pConds, params, 'p', null);
    const dateFrom = from_date || from;
    const dateTo   = to_date   || to;
    let dateSql = '';
    if (dateFrom && dateTo) {
      params.push(dateFrom, dateTo);
      dateSql = `AND po.po_date BETWEEN $${params.length - 1} AND $${params.length}`;
    }
    const { rows } = await query(`
      SELECT
        p.name                                                                                   AS project_name,
        p.project_code,
        COUNT(DISTINCT po.id)                                                                    AS po_count,
        COUNT(DISTINCT po.vendor_id)                                                             AS vendor_count,
        ROUND(SUM(po.grand_total)::numeric, 2)                                                   AS total_value,
        ROUND(SUM(CASE WHEN po.status NOT IN ('fully_received') THEN po.grand_total ELSE 0 END)::numeric, 2) AS open_value,
        ROUND(SUM(CASE WHEN po.status = 'fully_received'        THEN po.grand_total ELSE 0 END)::numeric, 2) AS closed_value
      FROM projects p
      LEFT JOIN purchase_orders po ON po.project_id = p.id
        AND po.status NOT IN ('cancelled','rejected')
        ${dateSql}
      WHERE ${pConds.join(' AND ')}
      GROUP BY p.id, p.name, p.project_code
      HAVING COUNT(po.id) > 0
      ORDER BY total_value DESC NULLS LAST
    `, params);
    res.json({ data: rows });
  } catch (err) { res.status(err.statusCode || 500).json({ error: err.message }); }
});

// ── P20: Purchase Return Register ─────────────────────────────────────────────
router.get('/procurement/purchase-returns', async (req, res) => {
  try {
    const { project_id, from_date, to_date, from, to } = req.query;
    const params = [req.user.company_id];
    const conditions = ['cn.company_id = $1'];
    if (project_id) {
      if (!userCanAccessProject(req, project_id)) return res.status(403).json({ error: 'Access denied' });
      params.push(project_id);
      conditions.push(`cn.project_id = $${params.length}`);
    } else if (!req.isGlobalRole) {
      const allowed = req.allowedProjectIds || [];
      if (!allowed.length) return res.json({ data: [] });
      params.push(allowed);
      conditions.push(`cn.project_id = ANY($${params.length}::uuid[])`);
    }
    const dateFrom = from_date || from;
    const dateTo   = to_date   || to;
    if (dateFrom && dateTo) {
      params.push(dateFrom, dateTo);
      conditions.push(`cn.cn_date BETWEEN $${params.length - 1} AND $${params.length}`);
    }
    const { rows } = await query(`
      SELECT
        cn.cn_number,
        cn.cn_date,
        cn.vendor_name,
        p.name                                           AS project_name,
        cn.po_number,
        cn.grn_number,
        cni.material_name,
        ROUND(COALESCE(cni.quantity, 0)::numeric, 3)     AS quantity,
        cni.unit,
        ROUND(COALESCE(cni.amount, 0)::numeric, 2)       AS return_value,
        cn.cn_type,
        cn.status,
        cni.reason
      FROM credit_notes cn
      LEFT JOIN projects p ON p.id = cn.project_id
      LEFT JOIN credit_note_items cni ON cni.cn_id = cn.id
      WHERE ${conditions.join(' AND ')}
      ORDER BY cn.cn_date DESC
    `, params);
    res.json({ data: rows });
  } catch (err) { res.status(err.statusCode || 500).json({ error: err.message }); }
});

module.exports = router;
