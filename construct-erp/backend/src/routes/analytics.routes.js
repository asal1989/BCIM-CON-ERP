const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { loadProjectScope, userCanAccessProject } = require('../middleware/projectScope');
const { query } = require('../config/database');
const { aggregateEVM } = require('../services/evm.service');

router.use(authenticate);
router.use(loadProjectScope);

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}
function dateSubDays(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

function buildProjectScope(req, filters = {}) {
  const conditions = ['p.company_id = $1'];
  const params = [req.user.company_id];
  let index = 2;

  if (filters.projectId) {
    if (!userCanAccessProject(req, filters.projectId)) {
      const err = new Error('Access denied for this project.');
      err.statusCode = 403;
      throw err;
    }
    conditions.push(`p.id = $${index++}`);
    params.push(filters.projectId);
  } else if (!req.isGlobalRole) {
    const allowed = req.allowedProjectIds || [];
    if (!allowed.length) {
      conditions.push('FALSE');
    } else {
      conditions.push(`p.id = ANY($${index++}::uuid[])`);
      params.push(allowed);
    }
  }
  if (filters.businessUnit) {
    conditions.push(`COALESCE(p.type, '') = $${index++}`);
    params.push(filters.businessUnit);
  }

  return {
    where: conditions.join(' AND '),
    params,
  };
}

function withProjectScope(alias, scope, extra = '') {
  return `
    ${alias}.project_id IN (
      SELECT p.id
      FROM projects p
      WHERE ${scope.where}
    )
    ${extra ? ` AND ${extra}` : ''}
  `;
}

function toNumber(value) {
  return Number.parseFloat(value || 0) || 0;
}

function isOpenStatus(value, closedStates) {
  return !closedStates.includes(String(value || '').toLowerCase());
}

function isClientCollection(payment) {
  return String(payment?.payment_type || '').toLowerCase() === 'customer_receipt';
}

function buildMonthSeries(dateFrom, dateTo) {
  const start = dateFrom ? new Date(dateFrom) : new Date();
  const end = dateTo ? new Date(dateTo) : new Date();

  const safeStart = Number.isNaN(start.getTime()) ? new Date() : start;
  const safeEnd = Number.isNaN(end.getTime()) ? new Date() : end;

  let first = new Date(safeStart.getFullYear(), safeStart.getMonth(), 1);
  let last = new Date(safeEnd.getFullYear(), safeEnd.getMonth(), 1);

  if (!dateFrom && !dateTo) {
    first = new Date();
    first.setMonth(first.getMonth() - 5, 1);
    last = new Date();
    last = new Date(last.getFullYear(), last.getMonth(), 1);
  }

  if (first > last) {
    const tmp = first;
    first = last;
    last = tmp;
  }

  const months = [];
  const cursor = new Date(first.getFullYear(), first.getMonth(), 1);
  const maxMonths = 12;

  while (cursor <= last && months.length < maxMonths) {
    months.push({
      key: `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`,
      label: cursor.toLocaleString('en-IN', { month: 'short' }),
    });
    cursor.setMonth(cursor.getMonth() + 1);
  }

  return months;
}

function pickRecent(rows, dateField, limit = 5) {
  return [...rows]
    .sort((a, b) => new Date(b[dateField] || b.created_at || 0).getTime() - new Date(a[dateField] || a.created_at || 0).getTime())
    .slice(0, limit);
}

// GET /analytics/global
router.get('/global', async (req, res) => {
  try {
    const scope = buildProjectScope(req, { projectId: req.query.project_id || null });
    const revenue = await query(
      `SELECT
         COALESCE(SUM(gross_amount), 0) as total_revenue,
         COALESCE(SUM(net_payable), 0) as total_certified
       FROM ra_bills rb
       WHERE ${withProjectScope('rb', scope, "rb.status IN ('certified', 'authorized', 'verified', 'paid')")}`,
      scope.params
    );

    const materialCost = await query(
      `SELECT COALESCE(SUM(net_amount), 0) as total
       FROM invoices i
       WHERE ${withProjectScope('i', scope, "i.status IN ('authorized', 'verified', 'paid')")}`,
      scope.params
    );

    const laborCost = await query(
      `SELECT
         COALESCE(SUM(w.daily_rate * CASE WHEN a.status='present' THEN 1 WHEN a.status='half_day' THEN 0.5 ELSE 0 END), 0) as total
       FROM attendance a
       JOIN workers w ON a.worker_id = w.id
       WHERE ${withProjectScope('a', scope)}`,
      scope.params
    );

    const assetCost = await query(
      `SELECT
         (SELECT COALESCE(SUM(total_cost), 0) FROM asset_fuel_logs afl WHERE ${withProjectScope('afl', scope)}) +
         (SELECT COALESCE(SUM(ul.units_worked * a.hourly_rate), 0) FROM asset_usage_logs ul JOIN assets a ON ul.asset_id = a.id WHERE ${withProjectScope('ul', scope)}) as total`,
      scope.params
    );

    const totalCost =
      toNumber(materialCost.rows[0]?.total) +
      toNumber(laborCost.rows[0]?.total) +
      toNumber(assetCost.rows[0]?.total);

    const safety = await query(
      `SELECT
         COUNT(*) as incident_count,
         COUNT(*) FILTER (WHERE incident_type = 'major_accident') as major_accidents
       FROM incidents i
       WHERE ${withProjectScope('i', scope, "i.incident_date > NOW() - INTERVAL '30 days'")}`,
      scope.params
    );
    const incidentCount = Number.parseInt(safety.rows[0]?.incident_count || 0, 10);
    const safetyScore = Math.max(0, 100 - (incidentCount * 2) - (Number.parseInt(safety.rows[0]?.major_accidents || 0, 10) * 15));

    // quality_checklists is a template/master table (name, category, items) —
    // it has no project_id or status column at all, so this always threw
    // "column status does not exist" and took down the whole /global
    // endpoint. quality_pour_cards is the actual per-project instance table;
    // 'closed' = passed every quality gate, 'rejected' = failed one.
    const quality = await query(
      `SELECT
         COUNT(*) FILTER (WHERE status IN ('closed','rejected')) as total,
         COUNT(*) FILTER (WHERE status = 'closed') as passed
       FROM quality_pour_cards qc
       WHERE ${withProjectScope('qc', scope)}`,
      scope.params
    );
    const totalChecklists = Number.parseInt(quality.rows[0]?.total || 0, 10);
    const qualityScore = totalChecklists > 0
      ? (Number.parseInt(quality.rows[0]?.passed || 0, 10) / totalChecklists) * 100
      : 95;

    const portfolio = await query(
      `SELECT COUNT(*) as project_count FROM projects p WHERE ${scope.where} AND p.status = 'active'`,
      scope.params
    );

    res.json({
      data: {
        global: {
          revenue: toNumber(revenue.rows[0]?.total_revenue),
          certified: toNumber(revenue.rows[0]?.total_certified),
          margin: toNumber(revenue.rows[0]?.total_revenue) > 0
            ? ((toNumber(revenue.rows[0]?.total_revenue) - totalCost) / toNumber(revenue.rows[0]?.total_revenue)) * 100
            : 0,
          safety_score: safetyScore,
          quality_score: qualityScore,
          incident_count: incidentCount,
          project_count: Number.parseInt(portfolio.rows[0]?.project_count || 0, 10),
        },
      },
    });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

// GET /analytics/executive
router.get('/executive', async (req, res) => {
  try {
    const filters = {
      projectId: req.query.project_id || null,
      businessUnit: req.query.business_unit || null,
      dateFrom: req.query.date_from || null,
      dateTo: req.query.date_to || null,
    };

    const scope = buildProjectScope(req, filters);
    const projectScopedClause = (alias, extra = '') => withProjectScope(alias, scope, extra);

    const raDateFilters = [];
    const raParams = [...scope.params];
    let idx = raParams.length + 1;
    if (filters.dateFrom) {
      raDateFilters.push(`rb.bill_date >= $${idx++}`);
      raParams.push(filters.dateFrom);
    }
    if (filters.dateTo) {
      raDateFilters.push(`rb.bill_date <= $${idx++}`);
      raParams.push(filters.dateTo);
    }

    const paymentParams = [...scope.params];
    idx = paymentParams.length + 1;
    const paymentDateFilters = [];
    if (filters.dateFrom) {
      paymentDateFilters.push(`pay.payment_date >= $${idx++}`);
      paymentParams.push(filters.dateFrom);
    }
    if (filters.dateTo) {
      paymentDateFilters.push(`pay.payment_date <= $${idx++}`);
      paymentParams.push(filters.dateTo);
    }

    const poParams = [...scope.params];
    idx = poParams.length + 1;
    const poDateFilters = [];
    if (filters.dateFrom) {
      poDateFilters.push(`po.po_date >= $${idx++}`);
      poParams.push(filters.dateFrom);
    }
    if (filters.dateTo) {
      poDateFilters.push(`po.po_date <= $${idx++}`);
      poParams.push(filters.dateTo);
    }

    const incidentParams = [...scope.params];
    idx = incidentParams.length + 1;
    const incidentDateFilters = [];
    if (filters.dateFrom) {
      incidentDateFilters.push(`i.incident_date >= $${idx++}`);
      incidentParams.push(filters.dateFrom);
    }
    if (filters.dateTo) {
      incidentDateFilters.push(`i.incident_date <= $${idx++}`);
      incidentParams.push(filters.dateTo);
    }

    const qParams = [...scope.params];
    idx = qParams.length + 1;
    const qualityDateFilters = [];
    if (filters.dateFrom) {
      qualityDateFilters.push(`created_at >= $${idx++}`);
      qParams.push(filters.dateFrom);
    }
    if (filters.dateTo) {
      qualityDateFilters.push(`created_at <= $${idx++}`);
      qParams.push(filters.dateTo);
    }

    const docParams = [...scope.params];
    idx = docParams.length + 1;
    const docDateFilters = [];
    if (filters.dateFrom) {
      docDateFilters.push(`d.created_at >= $${idx++}`);
      docParams.push(filters.dateFrom);
    }
    if (filters.dateTo) {
      docDateFilters.push(`d.created_at <= $${idx++}`);
      docParams.push(filters.dateTo);
    }

    const safeQuery = async (sql, params) => {
      try { return await query(sql, params); } catch { return { rows: [] }; }
    };

    const [
      projectOptionsRes,
      scopedProjectsRes,
      raBillsRes,
      paymentsRes,
      purchaseOrdersRes,
      lowStockRes,
      workersRes,
      incidentsRes,
      permitsRes,
      rfisRes,
      ncrsRes,
      documentsRes,
      allTimeBillsRes,
      budgetSpentRes,
      allTimeCollectionsRes,
    ] = await Promise.all([
      safeQuery(
        `SELECT p.id, p.name, p.project_code, p.type, p.status
         FROM projects p
         WHERE ${buildProjectScope(req, { businessUnit: filters.businessUnit }).where}
         ORDER BY p.name ASC`,
        buildProjectScope(req, { businessUnit: filters.businessUnit }).params
      ),
      safeQuery(
        `SELECT p.id, p.name, p.project_code, p.type, p.status, p.city, p.contract_value, p.progress_pct, p.created_at
         FROM projects p
         WHERE ${scope.where}
         ORDER BY p.created_at DESC`,
        scope.params
      ),
      safeQuery(
        `SELECT rb.id, rb.project_id, rb.bill_number, rb.bill_date, rb.created_at, rb.status, rb.net_payable, rb.gross_amount, COALESCE(rb.net_payable, rb.gross_amount) as bill_value, p.name as project_name
         FROM ra_bills rb
         JOIN projects p ON rb.project_id = p.id
         WHERE ${projectScopedClause('rb')}
         ${raDateFilters.length ? ` AND ${raDateFilters.join(' AND ')}` : ''}
         ORDER BY rb.bill_date DESC, rb.created_at DESC`,
        raParams
      ),
      safeQuery(
        `SELECT pay.id, pay.project_id, pay.payment_date, pay.created_at, pay.payment_type, pay.entity_name, pay.amount, pay.net_amount, p.name as project_name
         FROM payments pay
         JOIN projects p ON pay.project_id = p.id
         WHERE ${projectScopedClause('pay')}
         ${paymentDateFilters.length ? ` AND ${paymentDateFilters.join(' AND ')}` : ''}
         ORDER BY pay.payment_date DESC, pay.created_at DESC`,
        paymentParams
      ),
      safeQuery(
        `SELECT po.id, po.project_id, po.po_number, po.po_date, po.created_at, po.status, COALESCE(po.grand_total, po.sub_total, 0) as order_value, p.name as project_name
         FROM purchase_orders po
         JOIN projects p ON po.project_id = p.id
         WHERE ${projectScopedClause('po')}
         ${poDateFilters.length ? ` AND ${poDateFilters.join(' AND ')}` : ''}
         ORDER BY po.po_date DESC, po.created_at DESC`,
        poParams
      ),
      safeQuery(
        `SELECT inv.id, inv.project_id, inv.material_name, inv.closing_stock, inv.minimum_level, inv.reorder_level, p.name as project_name
         FROM inventory inv
         JOIN projects p ON inv.project_id = p.id
         WHERE ${projectScopedClause('inv')}
           AND inv.closing_stock <= COALESCE(NULLIF(inv.reorder_level, 0), inv.minimum_level)
         ORDER BY inv.material_name ASC`,
        scope.params
      ),
      safeQuery(
        `SELECT w.id, w.project_id, w.name, w.skill_type, w.is_active, p.name as project_name
         FROM workers w
         JOIN projects p ON w.project_id = p.id
         WHERE ${projectScopedClause('w', 'w.is_active = true')}
         ORDER BY w.created_at DESC`,
        scope.params
      ),
      safeQuery(
        `SELECT i.id, i.project_id, i.incident_date, i.created_at, i.status, i.incident_type, i.severity, p.name as project_name
         FROM incidents i
         JOIN projects p ON i.project_id = p.id
         WHERE ${projectScopedClause('i')}
         ${incidentDateFilters.length ? ` AND ${incidentDateFilters.join(' AND ')}` : ''}
         ORDER BY i.incident_date DESC, i.created_at DESC`,
        incidentParams
      ),
      safeQuery(
        `SELECT pe.id, pe.project_id, pe.valid_from, pe.valid_to, pe.status, pe.permit_type, p.name as project_name
         FROM permits pe
         JOIN projects p ON pe.project_id = p.id
         WHERE ${projectScopedClause('pe')}
         ORDER BY pe.valid_from DESC`,
        scope.params
      ),
      safeQuery(
        `SELECT q.id, q.project_id, q.created_at, q.status, q.rfi_number, q.activity_name, p.name as project_name
         FROM quality_rfis q
         JOIN projects p ON q.project_id = p.id
         WHERE ${projectScopedClause('q')}
         ${qualityDateFilters.length ? ` AND ${qualityDateFilters.map((c) => `q.${c}`).join(' AND ')}` : ''}
         ORDER BY q.created_at DESC`,
        qParams
      ),
      safeQuery(
        `SELECT n.id, n.project_id, n.created_at, n.status, n.ncr_number, n.description as title, p.name as project_name
         FROM quality_ncrs n
         JOIN projects p ON n.project_id = p.id
         WHERE ${projectScopedClause('n')}
         ${qualityDateFilters.length ? ` AND ${qualityDateFilters.map((c) => `n.${c}`).join(' AND ')}` : ''}
         ORDER BY n.created_at DESC`,
        qParams
      ),
      safeQuery(
        `SELECT d.id, d.project_id, d.file_name, d.module, d.created_at, p.name as project_name
         FROM documents d
         LEFT JOIN projects p ON d.project_id = p.id
         WHERE d.company_id = $1
           AND (
             d.project_id IS NULL OR
             d.project_id IN (
               SELECT p.id FROM projects p WHERE ${scope.where}
             )
           )
         ${docDateFilters.length ? ` AND ${docDateFilters.join(' AND ')}` : ''}
         ORDER BY d.created_at DESC
         LIMIT 20`,
        docParams
      ),
      // All-time bill KPIs — no date filter so certified total is never clipped by date range
      safeQuery(
        `SELECT
           COALESCE(SUM(net_payable) FILTER (WHERE rb.status IN ('certified','authorized','verified','paid')), 0) AS total_certified,
           COALESCE(SUM(net_payable) FILTER (WHERE rb.status IN ('draft','submitted')), 0)                       AS pending_value,
           COUNT(*)              FILTER (WHERE rb.status IN ('draft','submitted'))                                AS pending_count,
           COALESCE(SUM(net_payable), 0)                                                                      AS total_all
         FROM ra_bills rb
         JOIN projects p ON rb.project_id = p.id
         WHERE ${projectScopedClause('rb')}`,
        scope.params
      ),
      // Budget vs Spent across all company projects
      safeQuery(
        `SELECT
           -- Total budget: sum of all cost-head budgets across projects
           COALESCE((
             SELECT SUM(pcb.budget_amount)
             FROM project_costhead_budgets pcb
             JOIN projects pp ON pp.id = pcb.project_id
             WHERE pp.company_id = $1
           ), 0) AS total_budget,

           -- Total spent: TQS vendor/contractor bills + SC subcontractor bills (header totals)
           COALESCE((
             SELECT SUM(tb.total_amount)
             FROM tqs_bills tb
             WHERE tb.company_id = $1 AND tb.is_deleted = FALSE
           ), 0)
           +
           COALESCE((
             SELECT SUM(sb.gross_amount)
             FROM sc_bills sb
             JOIN projects pp ON pp.id = sb.project_id
             WHERE pp.company_id = $1
               AND sb.status IN ('submitted','under_review','approved','paid')
           ), 0)
           AS total_spent`,
        [scope.params[0]]
      ),
      // All-time collections (not date-filtered) for correct receivables calculation
      safeQuery(
        `SELECT COALESCE(SUM(pay.net_amount), 0) AS total_collections
         FROM payments pay
         JOIN projects p ON pay.project_id = p.id
         WHERE ${withProjectScope('pay', scope)}
           AND LOWER(pay.payment_type) = 'customer_receipt'`,
        scope.params
      ),
    ]);

    const projectOptions = projectOptionsRes.rows;
    const projects = scopedProjectsRes.rows;
    const raBills = raBillsRes.rows;          // date-filtered — used for recent activity only
    const payments = paymentsRes.rows;
    const collections = payments.filter(isClientCollection);
    const purchaseOrders = purchaseOrdersRes.rows;
    const lowStock = lowStockRes.rows;
    const workers = workersRes.rows;
    const incidents = incidentsRes.rows;
    const permits = permitsRes.rows;
    const rfis = rfisRes.rows;
    const ncrs = ncrsRes.rows;
    const documents = documentsRes.rows;

    // All-time billing KPIs (not date-filtered)
    const billKpis          = allTimeBillsRes.rows[0] || {};
    const budgetSpentKpi    = budgetSpentRes.rows[0] || {};
    const totalBudget       = toNumber(budgetSpentKpi.total_budget);
    const totalSpent        = toNumber(budgetSpentKpi.total_spent);
    const totalCertified    = toNumber(billKpis.total_certified);
    const pendingRAValue    = toNumber(billKpis.pending_value);
    const pendingRACount    = parseInt(billKpis.pending_count || 0, 10);
    const allTimeCollections = toNumber(allTimeCollectionsRes.rows[0]?.total_collections);

    const activeProjects = projects.filter((project) => project.status === 'active');
    const delayedProjects = projects.filter((project) => project.status === 'delayed');
    const completedProjects = projects.filter((project) => project.status === 'completed');
    const planningProjects = projects.filter((project) => project.status === 'planning');

    const totalContractValue = projects.reduce((sum, project) => sum + toNumber(project.contract_value), 0);
    const pendingRABills    = raBills.filter((bill) => ['draft', 'submitted'].includes(String(bill.status || '').toLowerCase()));
    const totalCollections  = allTimeCollections;
    const receivables       = Math.max(totalCertified - totalCollections, 0);

    const openIncidents = incidents.filter((incident) => isOpenStatus(incident.status, ['closed', 'resolved'])).length;
    const now = Date.now();
    const expiringPermits = permits.filter((permit) => {
      const validTo = new Date(permit.valid_to).getTime();
      return Number.isFinite(validTo) && validTo > now && validTo - now <= 48 * 60 * 60 * 1000;
    }).length;
    const openRFIs = rfis.filter((rfi) => isOpenStatus(rfi.status, ['closed', 'approved', 'completed'])).length;
    const openNCRs = ncrs.filter((ncr) => isOpenStatus(ncr.status, ['verified', 'closed', 'completed'])).length;

    const majorAccidents = incidents.filter((incident) => String(incident.incident_type || '').toLowerCase() === 'major_accident').length;
    const safetyScore = Math.max(0, 100 - (openIncidents * 2) - (majorAccidents * 15));
    const totalQualityItems = rfis.length + ncrs.length;
    const qualityScore = totalQualityItems > 0 ? Math.max(0, 100 - (((openRFIs + openNCRs) / totalQualityItems) * 100)) : 100;

    const months = buildMonthSeries(filters.dateFrom, filters.dateTo);
    // Build cumulative certified cost per month (RA bills with certified/paid status)
    const certifiedBills = raBills.filter((b) =>
      ['certified', 'authorized', 'verified', 'paid'].includes(String(b.status || '').toLowerCase())
    );
    let cumulativeCost = 0;
    const financeTrend = months.map((month) => {
      const monthCost = certifiedBills
        .filter((bill) => String(bill.bill_date || '').slice(0, 7) === month.key)
        .reduce((sum, bill) => sum + toNumber(bill.net_payable || bill.bill_value || bill.gross_amount), 0);
      cumulativeCost += monthCost;
      return {
        month: month.label,
        budget: Number((totalContractValue / 10000000).toFixed(2)),   // flat budget reference line in Cr
        cost:   Number((cumulativeCost / 10000000).toFixed(2)),        // cumulative cost in Cr
      };
    });

    const projectStatus = [
      { name: 'Active', value: activeProjects.length },
      { name: 'Delayed', value: delayedProjects.length },
      { name: 'Completed', value: completedProjects.length },
      { name: 'Planning', value: planningProjects.length },
    ].filter((item) => item.value > 0);

    const delayedWatchlist = [...delayedProjects]
      .sort((a, b) => toNumber(b.progress_pct) - toNumber(a.progress_pct))
      .slice(0, 5);

    const recentDocuments = documents.slice(0, 5);
    const recentBills = pickRecent(raBills, 'bill_date', 5);
    const recentPayments = pickRecent(payments, 'payment_date', 5);
    const overduePOs = purchaseOrders.filter((po) => !['approved', 'closed', 'received', 'fully_received'].includes(String(po.status || '').toLowerCase()));

    const businessUnits = [...new Set(projectOptions.map((project) => project.type).filter(Boolean))].sort();

    res.json({
      data: {
        filters: {
          applied: {
            project_id: filters.projectId,
            business_unit: filters.businessUnit,
            date_from: filters.dateFrom,
            date_to: filters.dateTo,
          },
          options: {
            projects: projectOptions,
            business_units: businessUnits,
          },
        },
        projects,
        kpis: {
          total_contract_value: totalContractValue,
          total_projects: projects.length,
          active_projects: activeProjects.length,
          delayed_projects: delayedProjects.length,
          completed_projects: completedProjects.length,
          planning_projects: planningProjects.length,
          total_certified: totalCertified,
          pending_ra_bills: pendingRACount,
          pending_ra_value: pendingRAValue,
          total_collections: totalCollections,
          receivables,
          safety_score: safetyScore,
          quality_score: qualityScore,
          open_incidents: openIncidents,
          expiring_permits: expiringPermits,
          open_rfis: openRFIs,
          open_ncrs: openNCRs,
          low_stock_count: lowStock.length,
          workforce_count: workers.length,
          documents_count: documents.length,
          total_budget: totalBudget,
          total_spent:  totalSpent,
        },
        charts: {
          finance_trend: financeTrend,
          project_status: projectStatus,
        },
        exceptions: [
          { label: 'Delayed Projects', value: delayedProjects.length, tone: '#f59e0b', to: '/projects' },
          { label: 'Low Stock Alerts', value: lowStock.length, tone: '#ef4444', to: '/procurement/inventory' },
          { label: 'Open RFIs', value: openRFIs, tone: '#0ea5e9', to: '/quality/rfi' },
          { label: 'Open NCRs', value: openNCRs, tone: '#8b5cf6', to: '/quality/ncr' },
          { label: 'Open Incidents', value: openIncidents, tone: '#ef4444', to: '/hse/incidents' },
          { label: 'Permits Expiring', value: expiringPermits, tone: '#10b981', to: '/hse/permits' },
        ],
        watchlists: {
          delayed_projects: delayedWatchlist,
        },
        recent: {
          ra_bills: recentBills,
          payments: recentPayments,
          documents: recentDocuments,
          purchase_orders: purchaseOrders.slice(0, 6),
          incidents: incidents.slice(0, 5),
          rfis: rfis.filter(r => !['closed','approved','completed'].includes(String(r.status||'').toLowerCase())).slice(0, 5),
          ncrs: ncrs.filter(n => !['verified','closed','completed'].includes(String(n.status||'').toLowerCase())).slice(0, 5),
        },
        pulse: {
          procurement_stores: {
            pos_requiring_attention: overduePOs.length,
            total_pos: purchaseOrders.length,
            low_stock_materials: lowStock.length,
            top_low_stock_material: lowStock[0]?.material_name || null,
            pending_vendor_bills: pendingRACount,
            pending_vendor_bill_value: pendingRAValue,
            open_documents: documents.length,
            recent_documents: recentDocuments.length,
            low_stock_items: lowStock.slice(0, 8),
            recent_purchase_orders: [...purchaseOrders].slice(0, 6),
          },
          quality_safety: {
            safety_score: safetyScore,
            open_incidents: openIncidents,
            expiring_permits: expiringPermits,
            permits_count: permits.length,
            open_ncrs: openNCRs,
            ncr_count: ncrs.length,
            open_rfis: openRFIs,
            rfi_count: rfis.length,
          },
          documents_workforce: {
            documents_count: documents.length,
            workforce_count: workers.length,
            completed_projects: completedProjects.length,
          },
        },
      },
    });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

// GET /analytics/project-360/:project_id
// Strategic Command Hub — single-project 360 view. Every sub-query is wrapped
// in safeQuery so one missing/empty table (EVM, baseline, risk register —
// all genuinely unused on most projects today) degrades that one panel
// instead of 500ing the whole page.
router.get('/project-360/:project_id', async (req, res) => {
  try {
    const projectId = req.params.project_id;
    if (!userCanAccessProject(req, projectId)) {
      return res.status(403).json({ error: 'Access denied for this project.' });
    }
    const { date_from: dateFrom, date_to: dateTo } = req.query;

    const projectInfo = await query(
      "SELECT * FROM projects WHERE id = $1 AND company_id = $2",
      [projectId, req.user.company_id]
    );
    if (!projectInfo.rows.length) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const safeQuery = async (sql, params) => {
      try { return await query(sql, params); } catch (e) { console.error('[project-360] sub-query failed:', e.message); return { rows: [] }; }
    };

    const [
      revenueRes, materialCostRes, assetCostRes, laborCostRes, physicalProgressRes, safetyRes,
      variationsRes, receivedRes, subConRes, pettyCashRes,
      raBillsMonthlyRes, baselineRes, evmActivitiesRes, evmHistoryRes,
      qualityRfiRes, qualityNcrRes,
      manpowerRes,
      cashFlowRes,
      riskRes, lowStockRes, openRfisRes, openNcrsRes, openIncidentsRes,
    ] = await Promise.all([
      safeQuery(
        `SELECT COALESCE(SUM(gross_amount),0) total_revenue_booked, COALESCE(SUM(net_payable),0) total_certified_amount,
                COALESCE(SUM(retention_amount),0) total_retention_held
         FROM ra_bills WHERE project_id=$1 AND status IN ('certified','authorized','verified','paid')`,
        [projectId]),
      safeQuery(
        `SELECT COALESCE(SUM(net_amount),0) total_material_liability FROM invoices
         WHERE project_id=$1 AND status IN ('authorized','verified','paid')`,
        [projectId]),
      safeQuery(
        `SELECT COALESCE(SUM(total_cost),0) total_fuel_cost,
                COALESCE((SELECT SUM(units_worked*hourly_rate) FROM asset_usage_logs ul JOIN assets a ON ul.asset_id=a.id WHERE ul.project_id=$1),0) total_machinery_rental_cost
         FROM asset_fuel_logs WHERE project_id=$1`,
        [projectId]),
      safeQuery(
        `SELECT COALESCE(SUM(w.daily_rate * CASE WHEN a.status='present' THEN 1 WHEN a.status='half_day' THEN 0.5 ELSE 0 END),0) total_labor_cost
         FROM attendance a JOIN workers w ON a.worker_id=w.id WHERE a.project_id=$1`,
        [projectId]),
      safeQuery(
        `SELECT SUM(quantity*rate) total_boq_value,
                SUM(COALESCE((SELECT SUM(net_quantity) FROM measurements m WHERE m.boq_item_id=bi.id AND m.status='pm_approved'),0)*rate) physical_certified_value
         FROM boq_items bi WHERE project_id=$1 AND is_active=true`,
        [projectId]),
      safeQuery(
        `SELECT COUNT(*) incident_count, COUNT(*) FILTER (WHERE incident_type='major_accident') major_accidents,
                COUNT(*) FILTER (WHERE lost_time_days > 0) lti_count
         FROM incidents WHERE project_id=$1 AND incident_date > NOW() - INTERVAL '30 days'`,
        [projectId]),
      // Approved contract variations — WO + PO amendments, joined through their
      // parent order since neither amendment table carries project_id directly.
      safeQuery(
        `SELECT COALESCE(SUM(v), 0) approved_variations FROM (
           SELECT COALESCE(SUM(a.value_impact),0) v FROM po_amendments a
             JOIN purchase_orders po ON po.id = a.po_id WHERE po.project_id=$1 AND a.status='approved'
           UNION ALL
           SELECT COALESCE(SUM(a.value_impact),0) v FROM wo_amendments a
             JOIN work_orders wo ON wo.id = a.wo_id WHERE wo.project_id=$1 AND a.status='approved'
         ) x`,
        [projectId]),
      safeQuery(
        `SELECT COALESCE(SUM(net_amount),0) total_received FROM payments
         WHERE project_id=$1 AND LOWER(payment_type)='customer_receipt' AND status IN ('paid','success')`,
        [projectId]),
      safeQuery(
        `SELECT COALESCE(SUM(gross_amount),0) total FROM sc_bills
         WHERE project_id=$1 AND status IN ('submitted','under_review','approved','paid')`,
        [projectId]),
      safeQuery(
        `SELECT COALESCE(SUM(amount),0) total FROM stores_petty_cash_entries WHERE project_id=$1 AND status='Approved'`,
        [projectId]),
      // Monthly certified RA bill value — feeds the S-curve "actual" line.
      safeQuery(
        `SELECT to_char(bill_date,'YYYY-MM') AS ym, SUM(net_payable) v FROM ra_bills
         WHERE project_id=$1 AND status IN ('certified','authorized','verified','paid') AND bill_date IS NOT NULL
         GROUP BY 1`,
        [projectId]),
      // Active baseline (if one was ever snapshotted for this project) — feeds
      // the S-curve "planned" line with a real time-phased curve instead of a
      // flat reference line.
      safeQuery(
        `SELECT ba.planned_start, ba.planned_value FROM planning_baselines pb
         JOIN baseline_activities ba ON ba.baseline_id = pb.id
         WHERE pb.project_id=$1 AND pb.is_active=true`,
        [projectId]),
      safeQuery(`SELECT * FROM project_activities WHERE project_id=$1 AND status != 'cancelled'`, [projectId]),
      safeQuery(`SELECT * FROM evm_snapshots WHERE project_id=$1 ORDER BY snapshot_date ASC LIMIT 20`, [projectId]),
      safeQuery(`SELECT status, COUNT(*) c FROM quality_rfis WHERE project_id=$1 GROUP BY status`, [projectId]),
      safeQuery(`SELECT status, COUNT(*) c FROM quality_ncrs WHERE project_id=$1 GROUP BY status`, [projectId]),
      // Manpower on site today — three separate attendance tables, none unified.
      safeQuery(
        `SELECT status, COUNT(*) c FROM (
           SELECT status FROM attendance WHERE project_id=$1 AND attendance_date=CURRENT_DATE
           UNION ALL
           SELECT status FROM sc_attendance WHERE project_id=$1 AND attendance_date=CURRENT_DATE
         ) x GROUP BY status`,
        [projectId]),
      safeQuery(
        `SELECT payment_date,
                CASE WHEN LOWER(payment_type)='customer_receipt' THEN net_amount ELSE 0 END inflow,
                CASE WHEN LOWER(payment_type)!='customer_receipt' THEN net_amount ELSE 0 END outflow
         FROM payments
         WHERE project_id=$1 AND status IN ('paid','success')
           AND payment_date >= $2 AND payment_date <= $3`,
        [projectId, dateFrom || dateSubDays(30), dateTo || todayIso()]),
      safeQuery(
        `SELECT r.id, r.risk_title, r.category, r.risk_level, r.status, r.due_date, r.owner, r.created_at
         FROM risk_register r WHERE r.project_id=$1 AND r.status='open'
         ORDER BY r.risk_score DESC, r.created_at DESC LIMIT 8`,
        [projectId]),
      safeQuery(
        `SELECT COUNT(*) c FROM inventory WHERE project_id=$1 AND closing_stock <= COALESCE(NULLIF(reorder_level,0), minimum_level)`,
        [projectId]),
      safeQuery(`SELECT COUNT(*) c FROM quality_rfis WHERE project_id=$1 AND status NOT IN ('closed','approved','completed')`, [projectId]),
      safeQuery(`SELECT COUNT(*) c FROM quality_ncrs WHERE project_id=$1 AND status NOT IN ('verified','closed','completed')`, [projectId]),
      safeQuery(`SELECT COUNT(*) c FROM incidents WHERE project_id=$1 AND status NOT IN ('closed','resolved')`, [projectId]),
    ]);

    const project = projectInfo.rows[0];
    const revenue = revenueRes.rows[0] || {};
    const materialCost = materialCostRes.rows[0] || {};
    const assetCost = assetCostRes.rows[0] || {};
    const laborCost = laborCostRes.rows[0] || {};
    const physicalProgress = physicalProgressRes.rows[0] || {};
    const safety = safetyRes.rows[0] || {};

    const materialsTotal = toNumber(materialCost.total_material_liability);
    const equipmentTotal = toNumber(assetCost.total_fuel_cost) + toNumber(assetCost.total_machinery_rental_cost);
    const laborTotal = toNumber(laborCost.total_labor_cost);
    const subConTotal = toNumber(subConRes.rows[0]?.total);
    const pettyCashTotal = toNumber(pettyCashRes.rows[0]?.total);
    const totalCost = materialsTotal + equipmentTotal + laborTotal + subConTotal + pettyCashTotal;

    const totalBilled = toNumber(revenue.total_certified_amount);
    const totalReceived = toNumber(receivedRes.rows[0]?.total_received);
    const retentionHeld = toNumber(revenue.total_retention_held);
    const approvedVariations = toNumber(variationsRes.rows[0]?.approved_variations);
    const contractValue = toNumber(project.contract_value);
    const revisedContractValue = contractValue + approvedVariations;
    const grossProfit = totalBilled - totalCost;

    const progressPct = toNumber(physicalProgress.total_boq_value) > 0
      ? (toNumber(physicalProgress.physical_certified_value) / toNumber(physicalProgress.total_boq_value)) * 100
      : 0;

    // Quality — inspections (all quality_rfis) + open NCR count.
    const rfiRows = qualityRfiRes.rows || [];
    const ncrRows = qualityNcrRes.rows || [];
    const inspectionCount = rfiRows.reduce((s, r) => s + parseInt(r.c, 10), 0);
    const openRfiCount = rfiRows.filter(r => !['closed', 'approved', 'completed'].includes(String(r.status || '').toLowerCase()))
      .reduce((s, r) => s + parseInt(r.c, 10), 0);
    const ncrTotal = ncrRows.reduce((s, r) => s + parseInt(r.c, 10), 0);
    const openNcrCount = ncrRows.filter(r => !['verified', 'closed', 'completed'].includes(String(r.status || '').toLowerCase()))
      .reduce((s, r) => s + parseInt(r.c, 10), 0);
    const qualityScore = (inspectionCount + ncrTotal) > 0
      ? Math.max(0, 100 - (((openRfiCount + openNcrCount) / (inspectionCount + ncrTotal)) * 100))
      : 100;

    const incidentCount = parseInt(safety.incident_count || 0, 10);
    const majorAccidents = parseInt(safety.major_accidents || 0, 10);
    const ltiCount = parseInt(safety.lti_count || 0, 10);
    const safetyScore = Math.max(0, 100 - (incidentCount * 2) - (majorAccidents * 15));

    // Manpower — present/absent counts across own workers + subcontractor labour, today.
    const manpower = { present: 0, absent: 0, half_day: 0, holiday: 0, leave: 0 };
    for (const row of manpowerRes.rows) {
      const key = String(row.status || '').toLowerCase();
      if (manpower[key] !== undefined) manpower[key] += parseInt(row.c, 10);
    }
    manpower.total = manpower.present + manpower.absent + manpower.half_day + manpower.holiday + manpower.leave;

    // Cash flow — net for the selected/default-30-day period. Not a forecast —
    // no data exists in this ERP to predict a future cash position.
    const cashRows = cashFlowRes.rows || [];
    const cashInflow = cashRows.reduce((s, r) => s + toNumber(r.inflow), 0);
    const cashOutflow = cashRows.reduce((s, r) => s + toNumber(r.outflow), 0);

    // S-curve — actual from monthly certified RA bills; planned from an active
    // baseline if one exists (bucketed by baseline_activities.planned_start),
    // else a flat contract-value reference line (same fallback /executive uses
    // for the portfolio view). Forecast only appears when evm_snapshots exist.
    const months = buildMonthSeries(dateFrom, dateTo);
    const monthlyActual = {};
    for (const row of (raBillsMonthlyRes.rows || [])) monthlyActual[row.ym] = toNumber(row.v);
    const monthlyPlanned = {};
    let hasBaseline = false;
    for (const row of (baselineRes.rows || [])) {
      if (!row.planned_start) continue;
      hasBaseline = true;
      const key = String(row.planned_start).slice(0, 7);
      monthlyPlanned[key] = (monthlyPlanned[key] || 0) + toNumber(row.planned_value);
    }
    const evmHistory = evmHistoryRes.rows || [];
    const forecastByMonth = {};
    for (const row of evmHistory) {
      const key = String(row.snapshot_date).slice(0, 7);
      forecastByMonth[key] = toNumber(row.eac);
    }
    let cumActual = 0, cumPlanned = 0;
    const sCurve = months.map((m) => {
      cumActual += monthlyActual[m.key] || 0;
      cumPlanned += hasBaseline ? (monthlyPlanned[m.key] || 0) : (contractValue / months.length);
      const point = {
        month: m.label,
        planned: Number((cumPlanned / 10000000).toFixed(3)),
        actual: Number((cumActual / 10000000).toFixed(3)),
      };
      if (forecastByMonth[m.key] !== undefined) point.forecast = Number((forecastByMonth[m.key] / 10000000).toFixed(3));
      return point;
    });

    // EVM / SPI / CPI — real engine (evm.service.js), but only meaningful once
    // activities actually carry PV/EV/AC — most projects have none yet.
    const evmActivities = evmActivitiesRes.rows || [];
    const evmTotals = evmActivities.reduce((acc, a) => ({
      pv: acc.pv + toNumber(a.planned_value), ev: acc.ev + toNumber(a.earned_value),
      ac: acc.ac + toNumber(a.actual_cost), bac: acc.bac + toNumber(a.budget_at_completion),
    }), { pv: 0, ev: 0, ac: 0, bac: 0 });
    const evmTracked = evmTotals.pv > 0 || evmTotals.ev > 0 || evmTotals.ac > 0 || evmTotals.bac > 0;
    const evm = evmTracked ? aggregateEVM(evmActivities) : { not_tracked: true };

    // Cost breakdown — Materials / Labour / Equipment / Subcontract / Others.
    // Deliberately simpler than the full ~20-cost-head BOQ breakdown on Budget
    // Control (that page is the source of truth for per-cost-head detail);
    // this is a 5-bucket summary for the executive view.
    const costBreakdown = [
      { name: 'Materials', value: materialsTotal },
      { name: 'Labour', value: laborTotal },
      { name: 'Equipment', value: equipmentTotal },
      { name: 'Subcontract', value: subConTotal },
      { name: 'Others', value: pettyCashTotal },
    ].filter(c => c.value > 0);

    // Top variance — vs the same 5 buckets' budget (project_costhead_budgets is
    // keyed by the ~20 granular BOQ heads, not these 5, so budget here is a
    // proportional share of total budget by bucket weight — flagged as such).
    const budgetRes = await safeQuery(`SELECT COALESCE(SUM(budget_amount),0) b FROM project_costhead_budgets WHERE project_id=$1`, [projectId]);
    const totalBudget = toNumber(budgetRes.rows[0]?.b);
    const topVariance = costBreakdown
      .map(c => {
        const budgetShare = totalCost > 0 ? (totalBudget * (c.value / totalCost)) : 0;
        return { name: c.name, budget: budgetShare, actual: c.value, variance: c.value - budgetShare };
      })
      .sort((a, b) => Math.abs(b.variance) - Math.abs(a.variance))
      .slice(0, 5);

    // Time elapsed — used client-side for the Project Health Score composite
    // (progress vs. schedule) and to decide whether the S-curve's date range
    // defaults make sense for this project.
    const startDate = project.start_date ? new Date(project.start_date) : null;
    const endDate = project.end_date ? new Date(project.end_date) : null;
    const timeElapsedPct = (startDate && endDate && endDate > startDate)
      ? Math.min(100, Math.max(0, ((Date.now() - startDate.getTime()) / (endDate.getTime() - startDate.getTime())) * 100))
      : null;

    // Risk & Alerts — real open risk_register rows + cheap derived exceptions
    // scoped to this one project. No fabricated predictive alerts.
    const riskAlerts = [
      ...riskRes.rows.map(r => ({
        type: 'risk', severity: r.risk_level, label: r.risk_title, category: r.category,
        due_date: r.due_date, owner: r.owner,
      })),
    ];
    const lowStockCount = parseInt(lowStockRes.rows[0]?.c || 0, 10);
    if (lowStockCount > 0) riskAlerts.push({ type: 'exception', severity: 'medium', label: `${lowStockCount} material(s) at/below reorder level`, to: '/stores/inventory' });
    const openRfisCount2 = parseInt(openRfisRes.rows[0]?.c || 0, 10);
    if (openRfisCount2 > 0) riskAlerts.push({ type: 'exception', severity: 'low', label: `${openRfisCount2} open inspection(s)`, to: '/quality/rfi' });
    const openNcrsCount2 = parseInt(openNcrsRes.rows[0]?.c || 0, 10);
    if (openNcrsCount2 > 0) riskAlerts.push({ type: 'exception', severity: 'medium', label: `${openNcrsCount2} open NCR(s)`, to: '/quality/ncr' });
    const openIncidentsCount = parseInt(openIncidentsRes.rows[0]?.c || 0, 10);
    if (openIncidentsCount > 0) riskAlerts.push({ type: 'exception', severity: 'high', label: `${openIncidentsCount} open safety incident(s)`, to: '/safety/incidents' });

    res.json({
      data: {
        project,
        financials: {
          revenue,
          contract_value: contractValue,
          approved_variations: approvedVariations,
          revised_contract_value: revisedContractValue,
          billing: { total_billed: totalBilled, total_received: totalReceived, retention_held: retentionHeld, balance_receivable: totalBilled - totalReceived },
          costs: { materials: materialsTotal, assets: equipmentTotal, labor: laborTotal, subcontract: subConTotal, others: pettyCashTotal, total: totalCost },
          total_budget: totalBudget,
          gross_profit: grossProfit,
          gross_margin_pct: totalBilled > 0 ? (grossProfit / totalBilled) * 100 : 0,
        },
        schedule: { time_elapsed_pct: timeElapsedPct },
        progress: {
          total_boq_value: physicalProgress.total_boq_value,
          physical_certified_value: physicalProgress.physical_certified_value,
          pct: progressPct,
        },
        costBreakdown,
        topVariance,
        sCurve,
        evm,
        safety: { incident_count: incidentCount, major_accidents: majorAccidents, lti_count: ltiCount, safety_score: safetyScore },
        quality: { inspection_count: inspectionCount, open_rfi_count: openRfiCount, ncr_count: ncrTotal, open_ncr_count: openNcrCount, quality_score: qualityScore },
        manpower,
        cashFlow: { inflow: cashInflow, outflow: cashOutflow, net: cashInflow - cashOutflow },
        riskAlerts,
      },
    });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

// ════════════════════════════════════════════════════════════════════════════
// GET /analytics/cost-to-completion/:project_id
// Standalone Cost to Completion statement — Approved Budget -> Actual ->
// Committed -> Estimate to Complete (ETC) -> Estimate at Completion (EAC) ->
// Variance, for one project.
//
// Reuses the same 5-bucket cost split (Materials/Labour/Equipment/Subcontract/
// Others), physical-progress calc, approved-variations query, S-curve, and
// risk/exception feed already built for Project 360 — see that endpoint above
// for the original sourcing notes on each of those.
//
// What's genuinely new here: "Committed Cost". No table in this ERP tracks
// "approved but not yet billed" anywhere else, so this endpoint computes it
// directly — approved Purchase Orders minus what's been billed against each
// specific PO (tqs_bills.po_id), and active/approved SC Work Orders minus
// what's been billed against each specific WO (sc_bills.wo_id). Both are real
// FK-backed links, not text matches. Plain (non-SC) `work_orders` has no
// reliable billed-against-this-WO link in the schema (tqs_bills.wo_number is
// a free-text field, not a FK) — its commitment is deliberately left out
// rather than approximated from an unreliable match. Equipment/Labour/Others
// have no PO/WO concept at all, so their committed figure is honestly 0, not
// estimated.
//
// ETC/EAC methodology: this ERP's real EVM engine (evm.service.js) needs
// activities to carry manually-entered planned_value/earned_value/actual_cost
// — confirmed empty for nearly every project (see project-360's `evmTracked`
// check above). Building this screen on that would show "not tracked"
// everywhere. Instead, Earned Value is derived from the same real,
// auto-computed physical-progress % this ERP already has (BOQ measurement
// value certified / total BOQ value) applied to Approved Budget:
//   EV = Physical Progress% x Approved Budget
//   CPI = EV / Actual Cost
//   ETC = (Approved Budget - EV) / CPI      (standard EAC-forecast formula,
//   EAC = Actual Cost + ETC                  just fed by a progress-based EV
//   Variance = Approved Budget - EAC         proxy instead of a manual one)
// Falls back to a flat "budget minus actual" remaining-cost estimate when CPI
// can't be computed yet (e.g. a project with 0 actual cost so far).
router.get('/cost-to-completion/:project_id', async (req, res) => {
  try {
    const projectId = req.params.project_id;
    if (!userCanAccessProject(req, projectId)) {
      return res.status(403).json({ error: 'Access denied for this project.' });
    }
    const { date_from: dateFrom, date_to: dateTo } = req.query;

    const projectInfo = await query(
      `SELECT * FROM projects WHERE id = $1 AND company_id = $2`,
      [projectId, req.user.company_id]
    );
    if (!projectInfo.rows.length) return res.status(404).json({ error: 'Project not found' });
    const project = projectInfo.rows[0];

    const safeQuery = async (sql, params) => {
      try { return await query(sql, params); } catch (e) { console.error('[cost-to-completion] sub-query failed:', e.message); return { rows: [] }; }
    };

    const [
      materialCostRes, assetCostRes, laborCostRes, subConRes, pettyCashRes,
      physicalProgressRes, budgetRes, variationsRes,
      poCommittedRes, poBilledRes, scWoCommittedRes, scWoBilledRes,
      raBillsMonthlyRes, baselineRes,
      riskRes, lowStockRes, openRfisRes, openNcrsRes, openIncidentsRes,
    ] = await Promise.all([
      safeQuery(`SELECT COALESCE(SUM(net_amount),0) total FROM invoices WHERE project_id=$1 AND status IN ('authorized','verified','paid')`, [projectId]),
      safeQuery(`SELECT COALESCE(SUM(total_cost),0) fuel, COALESCE((SELECT SUM(units_worked*hourly_rate) FROM asset_usage_logs ul JOIN assets a ON ul.asset_id=a.id WHERE ul.project_id=$1),0) rental FROM asset_fuel_logs WHERE project_id=$1`, [projectId]),
      safeQuery(`SELECT COALESCE(SUM(w.daily_rate * CASE WHEN a.status='present' THEN 1 WHEN a.status='half_day' THEN 0.5 ELSE 0 END),0) total FROM attendance a JOIN workers w ON a.worker_id=w.id WHERE a.project_id=$1`, [projectId]),
      safeQuery(`SELECT COALESCE(SUM(gross_amount),0) total FROM sc_bills WHERE project_id=$1 AND status IN ('submitted','under_review','approved','paid')`, [projectId]),
      safeQuery(`SELECT COALESCE(SUM(amount),0) total FROM stores_petty_cash_entries WHERE project_id=$1 AND status='Approved'`, [projectId]),
      safeQuery(`SELECT SUM(quantity*rate) total_boq_value, SUM(COALESCE((SELECT SUM(net_quantity) FROM measurements m WHERE m.boq_item_id=bi.id AND m.status='pm_approved'),0)*rate) physical_certified_value FROM boq_items bi WHERE project_id=$1 AND is_active=true`, [projectId]),
      safeQuery(`SELECT COALESCE(SUM(budget_amount),0) total FROM project_costhead_budgets WHERE project_id=$1`, [projectId]),
      safeQuery(
        `SELECT COALESCE(SUM(v), 0) approved_variations FROM (
           SELECT COALESCE(SUM(a.value_impact),0) v FROM po_amendments a
             JOIN purchase_orders po ON po.id = a.po_id WHERE po.project_id=$1 AND a.status='approved'
           UNION ALL
           SELECT COALESCE(SUM(a.value_impact),0) v FROM wo_amendments a
             JOIN work_orders wo ON wo.id = a.wo_id WHERE wo.project_id=$1 AND a.status='approved'
         ) x`, [projectId]),
      // Committed — Purchase Orders (Materials bucket)
      safeQuery(`SELECT COALESCE(SUM(grand_total),0) total FROM purchase_orders WHERE project_id=$1 AND status IN ('approved','fully_received')`, [projectId]),
      safeQuery(`SELECT COALESCE(SUM(b.total_amount),0) total FROM tqs_bills b JOIN purchase_orders po ON po.id=b.po_id WHERE po.project_id=$1 AND b.is_deleted=FALSE`, [projectId]),
      // Committed — SC Work Orders (Subcontract bucket)
      safeQuery(`SELECT COALESCE(SUM(contract_amount),0) total FROM sc_work_orders WHERE project_id=$1 AND status IN ('active','approved')`, [projectId]),
      safeQuery(`SELECT COALESCE(SUM(b.gross_amount),0) total FROM sc_bills b JOIN sc_work_orders wo ON wo.id=b.wo_id WHERE wo.project_id=$1 AND b.status <> 'draft'`, [projectId]),
      safeQuery(`SELECT to_char(bill_date,'YYYY-MM') AS ym, SUM(net_payable) v FROM ra_bills WHERE project_id=$1 AND status IN ('certified','authorized','verified','paid') AND bill_date IS NOT NULL GROUP BY 1`, [projectId]),
      safeQuery(`SELECT ba.planned_start, ba.planned_value FROM planning_baselines pb JOIN baseline_activities ba ON ba.baseline_id = pb.id WHERE pb.project_id=$1 AND pb.is_active=true`, [projectId]),
      safeQuery(`SELECT r.id, r.risk_title, r.category, r.risk_level, r.status, r.due_date, r.owner FROM risk_register r WHERE r.project_id=$1 AND r.status='open' ORDER BY r.risk_score DESC, r.created_at DESC LIMIT 8`, [projectId]),
      safeQuery(`SELECT COUNT(*) c FROM inventory WHERE project_id=$1 AND closing_stock <= COALESCE(NULLIF(reorder_level,0), minimum_level)`, [projectId]),
      safeQuery(`SELECT COUNT(*) c FROM quality_rfis WHERE project_id=$1 AND status NOT IN ('closed','approved','completed')`, [projectId]),
      safeQuery(`SELECT COUNT(*) c FROM quality_ncrs WHERE project_id=$1 AND status NOT IN ('verified','closed','completed')`, [projectId]),
      safeQuery(`SELECT COUNT(*) c FROM incidents WHERE project_id=$1 AND status NOT IN ('closed','resolved')`, [projectId]),
    ]);

    const materialsTotal = toNumber(materialCostRes.rows[0]?.total);
    const equipmentTotal = toNumber(assetCostRes.rows[0]?.fuel) + toNumber(assetCostRes.rows[0]?.rental);
    const laborTotal     = toNumber(laborCostRes.rows[0]?.total);
    const subConTotal    = toNumber(subConRes.rows[0]?.total);
    const othersTotal    = toNumber(pettyCashRes.rows[0]?.total);
    const totalActual    = materialsTotal + equipmentTotal + laborTotal + subConTotal + othersTotal;

    const totalBudget    = toNumber(budgetRes.rows[0]?.total);
    const contractValue  = toNumber(project.contract_value);
    const approvedVariations = toNumber(variationsRes.rows[0]?.approved_variations);

    const poCommitted = Math.max(toNumber(poCommittedRes.rows[0]?.total) - toNumber(poBilledRes.rows[0]?.total), 0);
    const scCommitted = Math.max(toNumber(scWoCommittedRes.rows[0]?.total) - toNumber(scWoBilledRes.rows[0]?.total), 0);
    const totalCommitted = poCommitted + scCommitted;

    const physicalProgress = physicalProgressRes.rows[0] || {};
    const progressPct = toNumber(physicalProgress.total_boq_value) > 0
      ? (toNumber(physicalProgress.physical_certified_value) / toNumber(physicalProgress.total_boq_value)) * 100
      : 0;

    // Earned Value proxy (see file header note) — physical progress applied to budget.
    const earnedValue = (progressPct / 100) * totalBudget;
    const cpi = totalActual > 0 ? earnedValue / totalActual : null;
    const costProgressPct = totalBudget > 0 ? (totalActual / totalBudget) * 100 : 0;

    const remainingBudget = Math.max(totalBudget - totalActual, 0);
    const etc = (cpi && cpi > 0) ? Math.max((totalBudget - earnedValue) / cpi, 0) : remainingBudget;
    const eac = totalActual + etc;
    const variance = totalBudget - eac; // positive = under budget, negative = overrun

    // Per-bucket breakdown — budget allocated proportionally by each bucket's
    // share of total actual spend (project_costhead_budgets is keyed by the
    // ~20 granular BOQ heads, not these 5 buckets — Budget Control remains
    // the source of truth for per-cost-head detail; this is a proportional
    // summary, same approach Project 360 uses for its topVariance table).
    // Committed is real (not proportional) for Materials/Subcontract; 0
    // elsewhere, since no PO/WO commitment concept exists for those buckets.
    const buckets = [
      { name: 'Labour',       actual: laborTotal,     committed: 0 },
      { name: 'Materials',    actual: materialsTotal, committed: poCommitted },
      { name: 'Plant & Machinery', actual: equipmentTotal, committed: 0 },
      { name: 'Subcontract',  actual: subConTotal,    committed: scCommitted },
      { name: 'Overheads',    actual: othersTotal,    committed: 0 },
    ].map(b => {
      const budget = totalActual > 0 ? totalBudget * (b.actual / totalActual) : 0;
      const bucketEtc = totalBudget > 0 ? etc * (budget / totalBudget) : 0;
      const bucketEac = b.actual + bucketEtc;
      return { ...b, budget, etc: bucketEtc, eac: bucketEac, variance: budget - bucketEac };
    });

    // Monthly trend — Budget (flat reference or time-phased baseline) vs
    // Actual (monthly certified RA bills) vs Forecast (this endpoint's own
    // EAC, shown as a flat line at the latest EAC — no time-phased forecast
    // data exists in this ERP, same honesty constraint Project 360 applies).
    const months = buildMonthSeries(dateFrom, dateTo);
    const monthlyActual = {};
    for (const row of (raBillsMonthlyRes.rows || [])) monthlyActual[row.ym] = toNumber(row.v);
    const monthlyPlanned = {};
    let hasBaseline = false;
    for (const row of (baselineRes.rows || [])) {
      if (!row.planned_start) continue;
      hasBaseline = true;
      const key = String(row.planned_start).slice(0, 7);
      monthlyPlanned[key] = (monthlyPlanned[key] || 0) + toNumber(row.planned_value);
    }
    let cumActual = 0, cumPlanned = 0;
    const monthlyTrend = months.map((m, i) => {
      cumActual += monthlyActual[m.key] || 0;
      cumPlanned += hasBaseline ? (monthlyPlanned[m.key] || 0) : (totalBudget / months.length);
      const point = {
        month: m.label,
        budget: Number((cumPlanned / 100000).toFixed(2)),
        actual: Number((cumActual / 100000).toFixed(2)),
      };
      if (i === months.length - 1) point.forecast = Number((eac / 100000).toFixed(2));
      return point;
    });

    const riskAlerts = [
      ...riskRes.rows.map(r => ({
        type: 'risk', severity: r.risk_level, label: r.risk_title, category: r.category,
        due_date: r.due_date, owner: r.owner,
      })),
    ];
    const lowStockCount = parseInt(lowStockRes.rows[0]?.c || 0, 10);
    if (lowStockCount > 0) riskAlerts.push({ type: 'exception', severity: 'medium', label: `${lowStockCount} material(s) at/below reorder level`, to: '/stores/inventory' });
    const openRfisCount = parseInt(openRfisRes.rows[0]?.c || 0, 10);
    if (openRfisCount > 0) riskAlerts.push({ type: 'exception', severity: 'low', label: `${openRfisCount} open inspection(s)`, to: '/quality/rfi' });
    const openNcrsCount = parseInt(openNcrsRes.rows[0]?.c || 0, 10);
    if (openNcrsCount > 0) riskAlerts.push({ type: 'exception', severity: 'medium', label: `${openNcrsCount} open NCR(s)`, to: '/quality/ncr' });
    const openIncidentsCount = parseInt(openIncidentsRes.rows[0]?.c || 0, 10);
    if (openIncidentsCount > 0) riskAlerts.push({ type: 'exception', severity: 'high', label: `${openIncidentsCount} open safety incident(s)`, to: '/safety/incidents' });
    // Overrun/overspend risks derived from this screen's own numbers.
    if (variance < 0) riskAlerts.unshift({ type: 'exception', severity: 'high', label: `Projected cost overrun of ₹${Math.round(Math.abs(variance)).toLocaleString('en-IN')} at completion` });
    buckets.forEach(b => {
      if (b.budget > 0 && b.actual > b.budget * 1.05) {
        const pct = (((b.actual - b.budget) / b.budget) * 100).toFixed(0);
        riskAlerts.push({ type: 'exception', severity: 'medium', label: `${b.name} spend ${pct}% above its allocated share of budget` });
      }
    });

    res.json({
      data: {
        project: {
          id: project.id, name: project.name, project_code: project.project_code,
          client_name: project.client_name, status: project.status,
          start_date: project.start_date, end_date: project.end_date,
        },
        contract_value: contractValue,
        approved_variations: approvedVariations,
        revised_contract_value: contractValue + approvedVariations,
        approved_budget: totalBudget,
        actual_cost: totalActual,
        committed_cost: totalCommitted,
        committed_detail: { purchase_orders: poCommitted, sc_work_orders: scCommitted },
        remaining_cost: etc,
        estimated_final_cost: eac,
        projected_variance: variance,
        cost_completion_pct: costProgressPct,
        physical_progress_pct: progressPct,
        cpi,
        buckets,
        monthlyTrend,
        riskAlerts,
        updated_at: new Date().toISOString(),
      },
    });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

module.exports = router;
