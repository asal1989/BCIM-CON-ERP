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

// ── Aged Receivables (certified RA Bills not yet paid) ────────────────────────
router.get('/ar-aging', async (req, res) => {
  try {
    const { project_id } = req.query;
    const scopeConditions = ['p.company_id = $1'];
    const params = [req.user.company_id];
    applyProjectScope(req, scopeConditions, params, 'p', project_id);

    const r = await query(
      `SELECT rb.id, rb.bill_number, rb.bill_date, rb.net_payable, p.name AS project_name,
              p.client_name, (CURRENT_DATE - rb.bill_date) AS age_days
       FROM ra_bills rb
       JOIN projects p ON p.id = rb.project_id
       WHERE ${scopeConditions.join(' AND ')} AND rb.status IN ('certified','accounts_verify')
       ORDER BY rb.bill_date ASC`,
      params
    );

    const buckets = { current: 0, '1-30': 0, '31-60': 0, '61-90': 0, '90+': 0 };
    const rows = r.rows.map(row => {
      const age = parseInt(row.age_days);
      const amt = parseFloat(row.net_payable || 0);
      let bucket;
      if (age <= 0) bucket = 'current';
      else if (age <= 30) bucket = '1-30';
      else if (age <= 60) bucket = '31-60';
      else if (age <= 90) bucket = '61-90';
      else bucket = '90+';
      buckets[bucket] += amt;
      return { ...row, age_days: age, bucket };
    });

    res.json({ data: rows, buckets, total: rows.reduce((s, r) => s + parseFloat(r.net_payable || 0), 0) });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

// ── Aged Payables (unpaid vendor bills) ────────────────────────────────────────
router.get('/ap-aging', async (req, res) => {
  try {
    const { project_id } = req.query;
    const scopeConditions = ['p.company_id = $1'];
    const params = [req.user.company_id];
    applyProjectScope(req, scopeConditions, params, 'p', project_id);

    const r = await query(
      `SELECT i.id, i.invoice_number, i.invoice_date, i.due_date, i.total_amount,
              v.name AS vendor_name, p.name AS project_name,
              (CURRENT_DATE - COALESCE(i.due_date, i.invoice_date)) AS age_days
       FROM invoices i
       JOIN projects p ON p.id = i.project_id
       LEFT JOIN vendors v ON v.id = i.vendor_id
       WHERE ${scopeConditions.join(' AND ')} AND i.payment_status != 'paid' AND i.status != 'cancelled'
       ORDER BY i.invoice_date ASC`,
      params
    );

    const buckets = { current: 0, '1-30': 0, '31-60': 0, '61-90': 0, '90+': 0 };
    const rows = r.rows.map(row => {
      const age = parseInt(row.age_days);
      const amt = parseFloat(row.total_amount || 0);
      let bucket;
      if (age <= 0) bucket = 'current';
      else if (age <= 30) bucket = '1-30';
      else if (age <= 60) bucket = '31-60';
      else if (age <= 90) bucket = '61-90';
      else bucket = '90+';
      buckets[bucket] += amt;
      return { ...row, age_days: age, bucket };
    });

    res.json({ data: rows, buckets, total: rows.reduce((s, r) => s + parseFloat(r.total_amount || 0), 0) });
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

// ── S5: Pending GRN ──────────────────────────────────────────────────────────
router.get('/stores/pending-grn', async (req, res) => {
  try {
    const { project_id } = req.query;
    const params = [req.user.company_id];
    const conditions = ['po.company_id = $1', "po.status NOT IN ('fully_received','cancelled','rejected')"];
    applyProjectScope(req, conditions, params, 'p', project_id);
    const { rows } = await query(`
      WITH recv AS (
        SELECT gi.po_item_id, SUM(gi.quantity_received) AS qty
        FROM grn_items gi JOIN grn g ON g.id = gi.grn_id
        WHERE g.quality_status NOT IN ('rejected') AND gi.po_item_id IS NOT NULL
        GROUP BY gi.po_item_id
      )
      SELECT
        po.serial_no_formatted                                                          AS po_number,
        v.name                                                                          AS vendor_name,
        poi.material_name,
        poi.unit,
        ROUND(poi.quantity::numeric, 3)                                                 AS ordered_qty,
        ROUND(COALESCE(r.qty, 0)::numeric, 3)                                          AS received_qty,
        ROUND((poi.quantity - COALESCE(r.qty, 0))::numeric, 3)                         AS pending_qty,
        poi.req_date                                                                    AS required_date,
        GREATEST(0, CURRENT_DATE - poi.req_date)                                       AS days_overdue,
        p.name                                                                          AS project_name
      FROM po_items poi
      JOIN purchase_orders po ON po.id = poi.po_id
      JOIN projects p ON p.id = po.project_id
      LEFT JOIN vendors v ON v.id = po.vendor_id
      LEFT JOIN recv r ON r.po_item_id = poi.id
      WHERE ${conditions.join(' AND ')}
        AND poi.quantity > COALESCE(r.qty, 0)
      ORDER BY days_overdue DESC, po.serial_no_formatted
    `, params);
    res.json({ data: rows });
  } catch (err) { res.status(err.statusCode || 500).json({ error: err.message }); }
});

// ── S9: Project-wise Stock ───────────────────────────────────────────────────
router.get('/stores/project-wise-stock', async (req, res) => {
  try {
    const { project_id } = req.query;
    const params = [req.user.company_id];
    const conditions = ['p.company_id = $1', 'p.is_active = TRUE'];
    applyProjectScope(req, conditions, params, 'p', project_id);
    const { rows } = await query(`
      SELECT
        p.name                                                                          AS project_name,
        COUNT(i.id)                                                                     AS item_count,
        ROUND(SUM(i.closing_stock * COALESCE(i.unit_rate, 0))::numeric, 2)             AS stock_value,
        SUM(CASE WHEN i.closing_stock < COALESCE(i.minimum_level, 0)
                  AND i.minimum_level IS NOT NULL THEN 1 ELSE 0 END)                   AS below_min_count,
        ROUND((SUM(i.closing_stock * COALESCE(i.unit_rate, 0)) /
          NULLIF(SUM(SUM(i.closing_stock * COALESCE(i.unit_rate, 0))) OVER (), 0))
          * 100, 2)                                                                     AS share_pct
      FROM inventory i
      JOIN projects p ON p.id = i.project_id
      WHERE ${conditions.join(' AND ')} AND i.closing_stock > 0
      GROUP BY p.id, p.name
      ORDER BY stock_value DESC
    `, params);
    res.json({ data: rows });
  } catch (err) { res.status(err.statusCode || 500).json({ error: err.message }); }
});

// ── S10: Site-wise Material Consumption ──────────────────────────────────────
router.get('/stores/site-consumption', async (req, res) => {
  try {
    const { project_id, from_date, to_date, from, to } = req.query;
    const params = [req.user.company_id];
    const conditions = ['p.company_id = $1', "m.status NOT IN ('draft','rejected')"];
    applyProjectScope(req, conditions, params, 'p', project_id);
    const dateFrom = from_date || from;
    const dateTo   = to_date   || to;
    if (dateFrom && dateTo) {
      params.push(dateFrom, dateTo);
      conditions.push(`m.issue_date::date BETWEEN $${params.length - 1} AND $${params.length}`);
    }
    const { rows } = await query(`
      SELECT
        m.issued_to                                                                     AS site_location,
        mi.material_name,
        mi.unit,
        p.name                                                                          AS project_name,
        ROUND(SUM(mi.quantity_issued)::numeric, 3)                                     AS qty_issued,
        ROUND(SUM(mi.amount)::numeric, 2)                                              AS value_issued,
        COUNT(DISTINCT m.id)                                                            AS min_count
      FROM min_items mi
      JOIN material_issue_notes m ON m.id = mi.min_id
      JOIN projects p ON p.id = m.project_id
      WHERE ${conditions.join(' AND ')}
      GROUP BY m.issued_to, mi.material_name, mi.unit, p.name
      ORDER BY value_issued DESC
    `, params);
    res.json({ data: rows });
  } catch (err) { res.status(err.statusCode || 500).json({ error: err.message }); }
});

// ── S12: Warehouse-wise Stock ────────────────────────────────────────────────
router.get('/stores/warehouse-stock', async (req, res) => {
  try {
    const { project_id } = req.query;
    const params = [req.user.company_id];
    const conditions = ['p.company_id = $1'];
    applyProjectScope(req, conditions, params, 'p', project_id);
    const { rows } = await query(`
      SELECT
        COALESCE(i.site_location, 'Unspecified')                                       AS location,
        p.name                                                                          AS project_name,
        COUNT(i.id)                                                                     AS item_count,
        ROUND(SUM(i.closing_stock)::numeric, 3)                                        AS total_qty,
        ROUND(SUM(i.closing_stock * COALESCE(i.unit_rate, 0))::numeric, 2)             AS stock_value
      FROM inventory i
      JOIN projects p ON p.id = i.project_id
      WHERE ${conditions.join(' AND ')} AND i.closing_stock > 0
      GROUP BY i.site_location, p.id, p.name
      ORDER BY stock_value DESC
    `, params);
    res.json({ data: rows });
  } catch (err) { res.status(err.statusCode || 500).json({ error: err.message }); }
});

// ── S13: Inventory Valuation (FIFO) ─────────────────────────────────────────
router.get('/stores/inventory-valuation', async (req, res) => {
  try {
    const { project_id } = req.query;
    const params = [req.user.company_id];
    const conditions = ['p.company_id = $1'];
    applyProjectScope(req, conditions, params, 'p', project_id);
    const { rows } = await query(`
      SELECT
        i.material_name,
        i.unit,
        i.category,
        COALESCE(i.site_location, '-')                                                 AS location,
        p.name                                                                          AS project_name,
        ROUND(i.closing_stock::numeric, 3)                                             AS current_stock,
        ROUND(COALESCE(i.unit_rate, 0)::numeric, 2)                                    AS unit_rate,
        ROUND((i.closing_stock * COALESCE(i.unit_rate, 0))::numeric, 2)               AS fifo_value,
        COUNT(b.id)                                                                     AS active_batches
      FROM inventory i
      JOIN projects p ON p.id = i.project_id
      LEFT JOIN inventory_batches b ON b.inventory_id = i.id AND b.status = 'active' AND b.current_quantity > 0
      WHERE ${conditions.join(' AND ')} AND i.closing_stock > 0
      GROUP BY i.id, i.material_name, i.unit, i.category, i.site_location, i.closing_stock, i.unit_rate, p.name
      ORDER BY fifo_value DESC
    `, params);
    res.json({ data: rows });
  } catch (err) { res.status(err.statusCode || 500).json({ error: err.message }); }
});

// ── S14: Stock Aging ─────────────────────────────────────────────────────────
router.get('/stores/stock-aging', async (req, res) => {
  try {
    const { project_id } = req.query;
    const params = [req.user.company_id];
    const conditions = ['p.company_id = $1'];
    applyProjectScope(req, conditions, params, 'p', project_id);
    const { rows } = await query(`
      SELECT
        i.material_name,
        i.unit,
        p.name                                                                          AS project_name,
        COALESCE(i.site_location, '-')                                                 AS location,
        b.batch_number,
        COALESCE(b.received_date, b.created_at)::date                                 AS received_date,
        ROUND(b.current_quantity::numeric, 3)                                          AS qty,
        ROUND((b.current_quantity * COALESCE(i.unit_rate, 0))::numeric, 2)            AS value,
        (CURRENT_DATE - COALESCE(b.received_date, b.created_at)::date)                AS age_days,
        CASE
          WHEN (CURRENT_DATE - COALESCE(b.received_date, b.created_at)::date) <= 30  THEN '0–30 days'
          WHEN (CURRENT_DATE - COALESCE(b.received_date, b.created_at)::date) <= 60  THEN '31–60 days'
          WHEN (CURRENT_DATE - COALESCE(b.received_date, b.created_at)::date) <= 90  THEN '61–90 days'
          ELSE '90+ days'
        END                                                                             AS aging_bucket
      FROM inventory_batches b
      JOIN inventory i ON i.id = b.inventory_id
      JOIN projects p ON p.id = i.project_id
      WHERE ${conditions.join(' AND ')}
        AND b.status = 'active' AND b.current_quantity > 0
      ORDER BY age_days DESC
    `, params);
    res.json({ data: rows });
  } catch (err) { res.status(err.statusCode || 500).json({ error: err.message }); }
});

// ── S15: Slow Moving Stock ───────────────────────────────────────────────────
router.get('/stores/slow-moving', async (req, res) => {
  try {
    const { project_id } = req.query;
    const params = [req.user.company_id];
    const conditions = ['p.company_id = $1'];
    applyProjectScope(req, conditions, params, 'p', project_id);
    const { rows } = await query(`
      WITH recent_issues AS (
        SELECT st.inventory_id, COUNT(*) AS issue_count, MAX(st.transacted_at) AS last_issue_at
        FROM stock_transactions st
        WHERE st.transaction_type IN ('issue','transfer_out')
          AND st.transacted_at >= CURRENT_DATE - INTERVAL '90 days'
        GROUP BY st.inventory_id
      )
      SELECT
        i.material_name,
        i.unit,
        i.category,
        COALESCE(i.site_location, '-')                                                 AS location,
        p.name                                                                          AS project_name,
        ROUND(i.closing_stock::numeric, 3)                                             AS closing_stock,
        ROUND((i.closing_stock * COALESCE(i.unit_rate, 0))::numeric, 2)               AS stock_value,
        COALESCE(ri.issue_count, 0)                                                    AS issues_last_90_days,
        ri.last_issue_at::date                                                         AS last_issue_date,
        (CURRENT_DATE - ri.last_issue_at::date)                                       AS days_since_issue
      FROM inventory i
      JOIN projects p ON p.id = i.project_id
      LEFT JOIN recent_issues ri ON ri.inventory_id = i.id
      WHERE ${conditions.join(' AND ')}
        AND i.closing_stock > 0
        AND COALESCE(ri.issue_count, 0) < 2
      ORDER BY days_since_issue DESC NULLS FIRST, stock_value DESC
    `, params);
    res.json({ data: rows });
  } catch (err) { res.status(err.statusCode || 500).json({ error: err.message }); }
});

// ── S16: Non-Moving Stock ────────────────────────────────────────────────────
router.get('/stores/non-moving', async (req, res) => {
  try {
    const { project_id } = req.query;
    const params = [req.user.company_id];
    const conditions = ['p.company_id = $1'];
    applyProjectScope(req, conditions, params, 'p', project_id);
    const { rows } = await query(`
      WITH last_move AS (
        SELECT st.inventory_id, MAX(st.transacted_at) AS last_at
        FROM stock_transactions st
        WHERE st.transaction_type IN ('issue','transfer_out')
        GROUP BY st.inventory_id
      )
      SELECT
        i.material_name,
        i.unit,
        i.category,
        COALESCE(i.site_location, '-')                                                 AS location,
        p.name                                                                          AS project_name,
        ROUND(i.closing_stock::numeric, 3)                                             AS closing_stock,
        ROUND((i.closing_stock * COALESCE(i.unit_rate, 0))::numeric, 2)               AS stock_value,
        lm.last_at::date                                                               AS last_movement_date,
        CASE WHEN lm.last_at IS NULL THEN 'Never issued'
             ELSE (CURRENT_DATE - lm.last_at::date)::text || ' days ago'
        END                                                                             AS idle_period
      FROM inventory i
      JOIN projects p ON p.id = i.project_id
      LEFT JOIN last_move lm ON lm.inventory_id = i.id
      WHERE ${conditions.join(' AND ')}
        AND i.closing_stock > 0
        AND (lm.last_at IS NULL OR lm.last_at < CURRENT_DATE - INTERVAL '90 days')
      ORDER BY lm.last_at ASC NULLS FIRST, stock_value DESC
    `, params);
    res.json({ data: rows });
  } catch (err) { res.status(err.statusCode || 500).json({ error: err.message }); }
});

// ── S18: Reorder Level Alerts ────────────────────────────────────────────────
router.get('/stores/reorder-alerts', async (req, res) => {
  try {
    const { project_id } = req.query;
    const params = [req.user.company_id];
    const conditions = ['p.company_id = $1'];
    applyProjectScope(req, conditions, params, 'p', project_id);
    const { rows } = await query(`
      SELECT
        i.material_name,
        i.unit,
        i.category,
        COALESCE(i.site_location, '-')                                                 AS location,
        p.name                                                                          AS project_name,
        ROUND(i.closing_stock::numeric, 3)                                             AS current_stock,
        ROUND(COALESCE(i.reorder_level, 0)::numeric, 3)                               AS reorder_level,
        ROUND(COALESCE(i.minimum_level, 0)::numeric, 3)                               AS minimum_level,
        ROUND((COALESCE(i.reorder_level, 0) - i.closing_stock)::numeric, 3)           AS shortfall,
        ROUND(COALESCE(i.unit_rate, 0)::numeric, 2)                                   AS unit_rate
      FROM inventory i
      JOIN projects p ON p.id = i.project_id
      WHERE ${conditions.join(' AND ')}
        AND i.reorder_level IS NOT NULL
        AND i.closing_stock <= i.reorder_level
      ORDER BY shortfall DESC
    `, params);
    res.json({ data: rows });
  } catch (err) { res.status(err.statusCode || 500).json({ error: err.message }); }
});

// ── S27: Daily Stores Activity ───────────────────────────────────────────────
router.get('/stores/daily-activity', async (req, res) => {
  try {
    const { project_id, date, from_date, to_date, from, to } = req.query;
    const actDate  = date || from_date || from || new Date().toISOString().slice(0, 10);
    const actDate2 = date || to_date   || to   || actDate;
    const params = [req.user.company_id, actDate, actDate2];
    const conditions = ['p.company_id = $1', 'st.transacted_at::date BETWEEN $2 AND $3'];
    applyProjectScope(req, conditions, params, 'p', project_id);
    const { rows } = await query(`
      SELECT
        st.transaction_type,
        st.reference_number,
        i.material_name,
        i.unit,
        p.name                                                                          AS project_name,
        ROUND(st.quantity::numeric, 3)                                                 AS quantity,
        ROUND((st.quantity * COALESCE(i.unit_rate, 0))::numeric, 2)                   AS value,
        st.transacted_at,
        u.name                                                                          AS transacted_by_name,
        st.remarks
      FROM stock_transactions st
      JOIN inventory i ON i.id = st.inventory_id
      JOIN projects p ON p.id = st.project_id
      LEFT JOIN users u ON u.id = st.transacted_by
      WHERE ${conditions.join(' AND ')}
      ORDER BY st.transacted_at
    `, params);
    res.json({ data: rows });
  } catch (err) { res.status(err.statusCode || 500).json({ error: err.message }); }
});

// ── S28: Monthly Stores Summary ──────────────────────────────────────────────
router.get('/stores/monthly-summary', async (req, res) => {
  try {
    const { project_id, from_date, to_date, from, to } = req.query;
    const params = [req.user.company_id];
    const conditions = ['p.company_id = $1'];
    applyProjectScope(req, conditions, params, 'p', project_id);
    const dateFrom = from_date || from;
    const dateTo   = to_date   || to;
    if (dateFrom && dateTo) {
      params.push(dateFrom, dateTo);
      conditions.push(`st.transacted_at::date BETWEEN $${params.length - 1} AND $${params.length}`);
    }
    const { rows } = await query(`
      SELECT
        p.name                                                                                        AS project_name,
        ROUND(SUM(CASE WHEN st.transaction_type = 'grn'
              THEN st.quantity * COALESCE(i.unit_rate,0) ELSE 0 END)::numeric, 2)                    AS receipts_value,
        ROUND(SUM(CASE WHEN st.transaction_type = 'issue'
              THEN st.quantity * COALESCE(i.unit_rate,0) ELSE 0 END)::numeric, 2)                    AS issues_value,
        ROUND(SUM(CASE WHEN st.transaction_type = 'return'
              THEN st.quantity * COALESCE(i.unit_rate,0) ELSE 0 END)::numeric, 2)                    AS returns_value,
        ROUND(SUM(CASE WHEN st.transaction_type IN ('transfer_in','transfer_out')
              THEN st.quantity * COALESCE(i.unit_rate,0) ELSE 0 END)::numeric, 2)                    AS transfers_value,
        ROUND(SUM(CASE WHEN st.transaction_type = 'adjustment'
              THEN st.quantity * COALESCE(i.unit_rate,0) ELSE 0 END)::numeric, 2)                    AS adjustments_value,
        COUNT(DISTINCT CASE WHEN st.transaction_type='grn'            THEN st.reference_number END)  AS grn_count,
        COUNT(DISTINCT CASE WHEN st.transaction_type='issue'          THEN st.reference_number END)  AS min_count,
        COUNT(DISTINCT CASE WHEN st.transaction_type IN
              ('transfer_in','transfer_out')                          THEN st.reference_number END)  AS transfer_count
      FROM stock_transactions st
      JOIN inventory i ON i.id = st.inventory_id
      JOIN projects p ON p.id = st.project_id
      WHERE ${conditions.join(' AND ')}
      GROUP BY p.id, p.name
      ORDER BY issues_value DESC
    `, params);
    res.json({ data: rows });
  } catch (err) { res.status(err.statusCode || 500).json({ error: err.message }); }
});

// ── S29: Site Material Balance ───────────────────────────────────────────────
router.get('/stores/site-balance', async (req, res) => {
  try {
    const { project_id } = req.query;
    const params = [req.user.company_id];
    const conditions = ['p.company_id = $1'];
    applyProjectScope(req, conditions, params, 'p', project_id);
    const { rows } = await query(`
      SELECT
        COALESCE(i.site_location, 'Unspecified')                                       AS site_location,
        p.name                                                                          AS project_name,
        i.material_name,
        i.unit,
        ROUND(i.closing_stock::numeric, 3)                                             AS closing_balance,
        ROUND(COALESCE(i.unit_rate, 0)::numeric, 2)                                   AS unit_rate,
        ROUND((i.closing_stock * COALESCE(i.unit_rate, 0))::numeric, 2)               AS balance_value
      FROM inventory i
      JOIN projects p ON p.id = i.project_id
      WHERE ${conditions.join(' AND ')} AND i.closing_stock > 0
      ORDER BY i.site_location, i.material_name
    `, params);
    res.json({ data: rows });
  } catch (err) { res.status(err.statusCode || 500).json({ error: err.message }); }
});

// ── S19: Min-Max Stock Report ────────────────────────────────────────────────
router.get('/stores/min-max', async (req, res) => {
  try {
    const { project_id } = req.query;
    const params = [req.user.company_id];
    const conditions = ['p.company_id = $1'];
    applyProjectScope(req, conditions, params, 'p', project_id);
    const { rows } = await query(`
      SELECT
        i.material_name,
        i.unit,
        i.category,
        COALESCE(i.site_location, '-')                                                 AS location,
        p.name                                                                          AS project_name,
        ROUND(i.closing_stock::numeric, 3)                                             AS current_stock,
        ROUND(COALESCE(i.minimum_level, 0)::numeric, 3)                               AS minimum_level,
        ROUND(COALESCE(i.maximum_level, 0)::numeric, 3)                               AS maximum_level,
        ROUND(COALESCE(i.reorder_level, 0)::numeric, 3)                               AS reorder_level,
        ROUND(COALESCE(i.unit_rate, 0)::numeric, 2)                                   AS unit_rate,
        CASE
          WHEN i.minimum_level IS NOT NULL AND i.closing_stock < i.minimum_level       THEN 'Below Min'
          WHEN i.maximum_level IS NOT NULL AND i.closing_stock > i.maximum_level       THEN 'Above Max'
          ELSE 'Within Range'
        END                                                                             AS stock_status
      FROM inventory i
      JOIN projects p ON p.id = i.project_id
      WHERE ${conditions.join(' AND ')}
        AND i.closing_stock > 0
      ORDER BY
        CASE WHEN i.minimum_level IS NOT NULL AND i.closing_stock < i.minimum_level THEN 0
             WHEN i.maximum_level IS NOT NULL AND i.closing_stock > i.maximum_level THEN 1
             ELSE 2 END,
        i.material_name
    `, params);
    res.json({ data: rows });
  } catch (err) { res.status(err.statusCode || 500).json({ error: err.message }); }
});

// ── S20: Excess Stock Report ─────────────────────────────────────────────────
router.get('/stores/excess-stock', async (req, res) => {
  try {
    const { project_id } = req.query;
    const params = [req.user.company_id];
    const conditions = ['p.company_id = $1', 'i.maximum_level IS NOT NULL', 'i.closing_stock > i.maximum_level'];
    applyProjectScope(req, conditions, params, 'p', project_id);
    const { rows } = await query(`
      SELECT
        i.material_name,
        i.unit,
        i.category,
        COALESCE(i.site_location, '-')                                                 AS location,
        p.name                                                                          AS project_name,
        ROUND(i.closing_stock::numeric, 3)                                             AS current_stock,
        ROUND(i.maximum_level::numeric, 3)                                             AS maximum_level,
        ROUND((i.closing_stock - i.maximum_level)::numeric, 3)                        AS excess_qty,
        ROUND(COALESCE(i.unit_rate, 0)::numeric, 2)                                   AS unit_rate,
        ROUND(((i.closing_stock - i.maximum_level) * COALESCE(i.unit_rate, 0))::numeric, 2) AS excess_value
      FROM inventory i
      JOIN projects p ON p.id = i.project_id
      WHERE ${conditions.join(' AND ')}
      ORDER BY excess_value DESC
    `, params);
    res.json({ data: rows });
  } catch (err) { res.status(err.statusCode || 500).json({ error: err.message }); }
});

// ── P19: Rate Contract Utilization ───────────────────────────────────────────
router.get('/procurement/rate-contracts', async (req, res) => {
  try {
    const { project_id, from_date, to_date, from, to } = req.query;
    const params = [req.user.company_id];
    const conditions = ['rc.company_id = $1'];
    const dateFrom = from_date || from;
    const dateTo   = to_date   || to;
    let poDateFilter = '';
    if (dateFrom && dateTo) {
      params.push(dateFrom, dateTo);
      poDateFilter = `AND po.po_date::date BETWEEN $${params.length - 1} AND $${params.length}`;
    }
    const { rows } = await query(`
      WITH po_usage AS (
        SELECT
          lower(trim(poi.material_name))        AS material_key,
          po.vendor_id,
          SUM(poi.quantity)                     AS total_qty,
          SUM(poi.quantity * poi.rate)          AS total_value,
          COUNT(DISTINCT po.id)                 AS po_count,
          AVG(poi.rate)                         AS avg_po_rate
        FROM po_items poi
        JOIN purchase_orders po ON po.id = poi.po_id
        WHERE po.company_id = $1
          AND po.status NOT IN ('rejected','cancelled')
          ${poDateFilter}
        GROUP BY lower(trim(poi.material_name)), po.vendor_id
      )
      SELECT
        rc.id,
        rc.material_name,
        rc.unit,
        v.name                                                                          AS vendor_name,
        ROUND(rc.contracted_rate::numeric, 4)                                          AS contracted_rate,
        rc.valid_from,
        rc.valid_to,
        rc.contracted_qty,
        rc.status                                                                        AS contract_status,
        COALESCE(pu.po_count, 0)                                                        AS po_count,
        ROUND(COALESCE(pu.total_qty, 0)::numeric, 3)                                   AS utilized_qty,
        ROUND(COALESCE(pu.avg_po_rate, 0)::numeric, 4)                                 AS avg_po_rate,
        ROUND((COALESCE(pu.avg_po_rate, 0) - rc.contracted_rate)::numeric, 4)          AS rate_variance,
        ROUND(CASE WHEN rc.contracted_rate > 0
              THEN ((COALESCE(pu.avg_po_rate, 0) - rc.contracted_rate) / rc.contracted_rate) * 100
              ELSE 0 END::numeric, 2)                                                   AS variance_pct,
        CASE
          WHEN rc.valid_to IS NULL OR rc.valid_to >= CURRENT_DATE THEN 'Active'
          ELSE 'Expired'
        END                                                                             AS validity_status
      FROM rate_contracts rc
      LEFT JOIN vendors v ON v.id = rc.vendor_id
      LEFT JOIN po_usage pu ON lower(trim(pu.material_key)) = lower(trim(rc.material_name))
        AND (rc.vendor_id IS NULL OR pu.vendor_id = rc.vendor_id)
      WHERE ${conditions.join(' AND ')}
      ORDER BY rc.material_name
    `, params);
    res.json({ data: rows });
  } catch (err) { res.status(err.statusCode || 500).json({ error: err.message }); }
});

// ── S21: Physical Stock Verification Report ──────────────────────────────────
router.get('/stores/stock-verification', async (req, res) => {
  try {
    const { project_id, from_date, to_date } = req.query;
    const params = [req.user.company_id];
    const conditions = ['sv.company_id = $1'];
    applyProjectScope(req, conditions, params, 'p', project_id);
    if (from_date) { params.push(from_date); conditions.push(`sv.verification_date >= $${params.length}`); }
    if (to_date)   { params.push(to_date);   conditions.push(`sv.verification_date <= $${params.length}`); }
    const { rows } = await query(`
      SELECT
        sv.verification_date,
        sv.location,
        sv.verified_by,
        sv.status AS verification_status,
        p.name AS project_name,
        i.material_name,
        i.unit,
        ROUND(svi.book_stock::numeric, 3)     AS book_stock,
        ROUND(svi.physical_stock::numeric, 3) AS physical_stock,
        ROUND((svi.physical_stock - svi.book_stock)::numeric, 3) AS variance_qty,
        ROUND(((svi.physical_stock - svi.book_stock) * COALESCE(i.unit_rate, 0))::numeric, 2) AS variance_value,
        CASE WHEN svi.book_stock > 0
          THEN ROUND((1 - ABS(svi.physical_stock - svi.book_stock) / svi.book_stock) * 100, 1)
          ELSE 100
        END AS accuracy_pct,
        COALESCE(svi.reason, '') AS reason,
        COALESCE(svi.adjustment_status, 'pending') AS adjustment_status,
        sv.notes
      FROM stock_verification_items svi
      JOIN stock_verifications sv ON sv.id = svi.verification_id
      JOIN inventory i ON i.id = svi.inventory_id
      JOIN projects p ON p.id = sv.project_id
      WHERE ${conditions.join(' AND ')}
      ORDER BY sv.verification_date DESC, i.material_name
    `, params);
    res.json({ data: rows });
  } catch (err) { res.status(err.statusCode || 500).json({ error: err.message }); }
});

// ── S22: Stock Variance Report ────────────────────────────────────────────────
router.get('/stores/stock-variance', async (req, res) => {
  try {
    const { project_id, from_date, to_date, variance_type } = req.query;
    const params = [req.user.company_id];
    const conditions = ['sv.company_id = $1'];
    applyProjectScope(req, conditions, params, 'p', project_id);
    if (from_date) { params.push(from_date); conditions.push(`sv.verification_date >= $${params.length}`); }
    if (to_date)   { params.push(to_date);   conditions.push(`sv.verification_date <= $${params.length}`); }
    // Only rows with actual variance
    conditions.push(`svi.physical_stock <> svi.book_stock`);
    if (variance_type === 'shortage') conditions.push(`svi.physical_stock < svi.book_stock`);
    if (variance_type === 'excess')   conditions.push(`svi.physical_stock > svi.book_stock`);
    const { rows } = await query(`
      SELECT
        sv.verification_date,
        COALESCE(sv.location, i.site_location, '-') AS location,
        p.name AS project_name,
        i.material_name,
        i.unit,
        ROUND(svi.book_stock::numeric, 3)     AS book_stock,
        ROUND(svi.physical_stock::numeric, 3) AS physical_stock,
        ROUND((svi.physical_stock - svi.book_stock)::numeric, 3) AS variance_qty,
        ROUND(((svi.physical_stock - svi.book_stock) * COALESCE(i.unit_rate, 0))::numeric, 2) AS variance_value,
        CASE WHEN svi.physical_stock < svi.book_stock THEN 'Shortage' ELSE 'Excess' END AS variance_type,
        CASE WHEN svi.book_stock > 0
          THEN ROUND(ABS(svi.physical_stock - svi.book_stock) / svi.book_stock * 100, 1)
          ELSE 0
        END AS variance_pct,
        COALESCE(svi.reason, '') AS reason,
        COALESCE(svi.adjustment_status, 'pending') AS adjustment_status
      FROM stock_verification_items svi
      JOIN stock_verifications sv ON sv.id = svi.verification_id
      JOIN inventory i ON i.id = svi.inventory_id
      JOIN projects p ON p.id = sv.project_id
      WHERE ${conditions.join(' AND ')}
      ORDER BY ABS(svi.physical_stock - svi.book_stock) * COALESCE(i.unit_rate, 0) DESC
    `, params);
    res.json({ data: rows });
  } catch (err) { res.status(err.statusCode || 500).json({ error: err.message }); }
});

// ── S24: BOQ vs Material Consumption ─────────────────────────────────────────
router.get('/stores/boq-vs-consumption', async (req, res) => {
  try {
    const { project_id, from_date, to_date } = req.query;
    const params = [req.user.company_id];
    const conditions = ['p.company_id = $1', 'b.is_active = TRUE'];
    applyProjectScope(req, conditions, params, 'p', project_id);
    let dateClause = '';
    if (from_date) { params.push(from_date); dateClause += ` AND min2.issue_date >= $${params.length}`; }
    if (to_date)   { params.push(to_date);   dateClause += ` AND min2.issue_date <= $${params.length}`; }
    const { rows } = await query(`
      WITH consumption AS (
        SELECT
          lower(trim(mi.material_name)) AS material_key,
          min2.project_id,
          SUM(mi.quantity_issued) AS consumed_qty,
          CASE WHEN SUM(mi.quantity_issued) > 0
            THEN SUM(COALESCE(mi.amount, 0)) / SUM(mi.quantity_issued)
            ELSE 0
          END AS avg_rate
        FROM min_items mi
        JOIN material_issue_notes min2 ON min2.id = mi.min_id
        WHERE min2.project_id IN (
          SELECT id FROM projects WHERE company_id = $1
        ) ${dateClause}
        GROUP BY lower(trim(mi.material_name)), min2.project_id
      )
      SELECT
        b.chapter_no,
        b.chapter_name,
        b.item_no,
        b.description AS boq_item,
        b.unit,
        p.name AS project_name,
        ROUND(b.quantity::numeric, 3)  AS boq_qty,
        ROUND(b.rate::numeric, 2)      AS boq_rate,
        ROUND(COALESCE(c.consumed_qty, 0)::numeric, 3) AS consumed_qty,
        ROUND((COALESCE(c.consumed_qty, 0) - b.quantity)::numeric, 3) AS variance_qty,
        CASE WHEN b.quantity > 0
          THEN ROUND(((COALESCE(c.consumed_qty, 0) - b.quantity) / b.quantity) * 100, 1)
          ELSE 0
        END AS variance_pct,
        ROUND((b.quantity * b.rate)::numeric, 2) AS estimated_value,
        ROUND((COALESCE(c.consumed_qty, 0) * COALESCE(c.avg_rate, b.rate, 0))::numeric, 2) AS actual_value
      FROM boq_items b
      JOIN projects p ON p.id = b.project_id
      LEFT JOIN consumption c ON c.material_key = lower(trim(b.description))
        AND c.project_id = b.project_id
      WHERE ${conditions.join(' AND ')}
      ORDER BY p.name, b.chapter_no, b.item_no
    `, params);
    res.json({ data: rows });
  } catch (err) { res.status(err.statusCode || 500).json({ error: err.message }); }
});

// ── P15: Procurement Cost Analysis by Cost Head ───────────────────────────────
router.get('/procurement/costhead-analysis', async (req, res) => {
  try {
    const { project_id, from_date, to_date } = req.query;
    const params = [req.user.company_id];
    const conditions = ['po.company_id = $1', "COALESCE(po.status,'') NOT IN ('cancelled','rejected')"];
    if (project_id) { params.push(project_id); conditions.push(`po.project_id = $${params.length}`); }
    else {
      params.push(req.user.company_id);
      conditions.push(`po.project_id IN (SELECT id FROM projects WHERE company_id = $${params.length})`);
    }
    if (from_date) { params.push(from_date); conditions.push(`po.po_date >= $${params.length}`); }
    if (to_date)   { params.push(to_date);   conditions.push(`po.po_date <= $${params.length}`); }
    const { rows } = await query(`
      WITH po_ch AS (
        SELECT
          po.project_id,
          COALESCE(po.cost_head,
            CASE v.vendor_type
              WHEN 'subcontractor'      THEN 'Subcontracting - Civil'
              WHEN 'equipment_supplier' THEN 'Plant & Machinery - Hired'
              WHEN 'labour_contractor'  THEN 'Labour - Skilled'
              WHEN 'service_provider'   THEN 'Site Overhead'
              ELSE 'Material - Concrete & Aggregates'
            END
          ) AS cost_head,
          po.grand_total
        FROM purchase_orders po
        JOIN vendors v ON v.id = po.vendor_id
        WHERE ${conditions.join(' AND ')}
      )
      SELECT
        p.name         AS project_name,
        pc.cost_head,
        COALESCE(bi.budgeted_amount, 0)  AS budgeted_amount,
        SUM(pc.grand_total)              AS procured_value,
        COUNT(*)::int                    AS po_count,
        CASE WHEN COALESCE(bi.budgeted_amount, 0) > 0
          THEN ROUND((SUM(pc.grand_total) / bi.budgeted_amount) * 100, 1)
          ELSE 0
        END AS pct_consumed,
        COALESCE(bi.budgeted_amount, 0) - SUM(pc.grand_total) AS variance
      FROM po_ch pc
      JOIN projects p ON p.id = pc.project_id
      LEFT JOIN budget_items bi ON bi.project_id = pc.project_id AND bi.cost_head = pc.cost_head
      GROUP BY p.name, pc.cost_head, bi.budgeted_amount
      ORDER BY p.name, SUM(pc.grand_total) DESC
    `, params);
    res.json({ data: rows });
  } catch (err) { res.status(err.statusCode || 500).json({ error: err.message }); }
});

// ── P16: Budget vs Procurement (committed + received + paid) ──────────────────
router.get('/procurement/budget-vs-procurement', async (req, res) => {
  try {
    const { project_id } = req.query;
    const params = [req.user.company_id];
    const conditions = ['p.company_id = $1', 'p.is_active = TRUE'];
    applyProjectScope(req, conditions, params, 'p', project_id);
    const { rows } = await query(`
      WITH po_committed AS (
        SELECT
          po.project_id,
          COALESCE(po.cost_head,
            CASE v.vendor_type
              WHEN 'subcontractor'      THEN 'Subcontracting - Civil'
              WHEN 'equipment_supplier' THEN 'Plant & Machinery - Hired'
              WHEN 'labour_contractor'  THEN 'Labour - Skilled'
              WHEN 'service_provider'   THEN 'Site Overhead'
              ELSE 'Material - Concrete & Aggregates'
            END
          ) AS cost_head,
          SUM(COALESCE(po.grand_total, 0)) AS committed_value
        FROM purchase_orders po
        JOIN vendors v ON v.id = po.vendor_id
        WHERE po.project_id IN (SELECT id FROM projects WHERE company_id = $1)
          AND COALESCE(po.status, '') NOT IN ('cancelled', 'rejected')
        GROUP BY po.project_id, 2
      ),
      grn_received AS (
        SELECT
          po.project_id,
          COALESCE(po.cost_head,
            CASE v.vendor_type
              WHEN 'subcontractor'      THEN 'Subcontracting - Civil'
              WHEN 'equipment_supplier' THEN 'Plant & Machinery - Hired'
              WHEN 'labour_contractor'  THEN 'Labour - Skilled'
              WHEN 'service_provider'   THEN 'Site Overhead'
              ELSE 'Material - Concrete & Aggregates'
            END
          ) AS cost_head,
          SUM(COALESCE(gi.quantity_received * poi.rate, 0)) AS received_value
        FROM grn_items gi
        JOIN grn g ON g.id = gi.grn_id AND g.quality_status NOT IN ('rejected')
        JOIN po_items poi ON poi.id = gi.po_item_id
        JOIN purchase_orders po ON po.id = poi.po_id
        JOIN vendors v ON v.id = po.vendor_id
        WHERE po.project_id IN (SELECT id FROM projects WHERE company_id = $1)
        GROUP BY po.project_id, 2
      )
      SELECT
        p.name        AS project_name,
        b.cost_head,
        COALESCE(b.budgeted_amount, 0)  AS budgeted_amount,
        COALESCE(pc.committed_value, 0) AS committed_value,
        COALESCE(gr.received_value, 0)  AS received_value,
        COALESCE(b.actual_amount, 0)    AS bill_paid_actual,
        CASE WHEN COALESCE(b.budgeted_amount, 0) > 0
          THEN ROUND((COALESCE(pc.committed_value, 0) / b.budgeted_amount) * 100, 1)
          ELSE 0
        END AS committed_pct,
        COALESCE(b.budgeted_amount, 0) - GREATEST(COALESCE(pc.committed_value, 0), COALESCE(b.actual_amount, 0)) AS remaining_budget
      FROM projects p
      JOIN budget_items b ON b.project_id = p.id
      LEFT JOIN po_committed pc ON pc.project_id = p.id AND pc.cost_head = b.cost_head
      LEFT JOIN grn_received gr ON gr.project_id = p.id AND gr.cost_head = b.cost_head
      WHERE ${conditions.join(' AND ')}
      ORDER BY p.name, b.cost_head
    `, params);
    res.json({ data: rows });
  } catch (err) { res.status(err.statusCode || 500).json({ error: err.message }); }
});

module.exports = router;
