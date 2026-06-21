const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { loadProjectScope, userCanAccessProject } = require('../middleware/projectScope');
const { query } = require('../config/database');

router.use(authenticate);
router.use(loadProjectScope);

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

    const quality = await query(
      `SELECT
         COUNT(*) as total,
         COUNT(*) FILTER (WHERE status = 'pm_approved' OR status = 'verified' OR (metadata->>'passed')::boolean = true) as passed
       FROM quality_checklists qc
       WHERE qc.company_id = $1`,
      [req.user.company_id]
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
    const billKpis      = allTimeBillsRes.rows[0] || {};
    const totalCertified  = toNumber(billKpis.total_certified);
    const pendingRAValue  = toNumber(billKpis.pending_value);
    const pendingRACount  = parseInt(billKpis.pending_count || 0, 10);

    const activeProjects = projects.filter((project) => project.status === 'active');
    const delayedProjects = projects.filter((project) => project.status === 'delayed');
    const completedProjects = projects.filter((project) => project.status === 'completed');
    const planningProjects = projects.filter((project) => project.status === 'planning');

    const totalContractValue = projects.reduce((sum, project) => sum + toNumber(project.contract_value), 0);
    const pendingRABills    = raBills.filter((bill) => ['draft', 'submitted'].includes(String(bill.status || '').toLowerCase()));
    const totalCollections  = collections.reduce((sum, payment) => sum + toNumber(payment.net_amount || payment.amount), 0);
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
    const financeTrend = months.map((month) => {
      const billed = raBills
        .filter((bill) => String(bill.bill_date || '').slice(0, 7) === month.key)
        .reduce((sum, bill) => sum + toNumber(bill.bill_value || bill.net_payable || bill.gross_amount), 0);
      const collected = collections
        .filter((payment) => String(payment.payment_date || '').slice(0, 7) === month.key)
        .reduce((sum, payment) => sum + toNumber(payment.net_amount || payment.amount), 0);
      return {
        month: month.label,
        billed: Number((billed / 100000).toFixed(2)),
        collected: Number((collected / 100000).toFixed(2)),
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
router.get('/project-360/:project_id', async (req, res) => {
  try {
    const projectId = req.params.project_id;
    if (!userCanAccessProject(req, projectId)) {
      return res.status(403).json({ error: 'Access denied for this project.' });
    }

    const projectInfo = await query(
      "SELECT * FROM projects WHERE id = $1 AND company_id = $2",
      [projectId, req.user.company_id]
    );
    if (!projectInfo.rows.length) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const revenue = await query(
      `SELECT
         COALESCE(SUM(gross_amount), 0) as total_revenue_booked,
         COALESCE(SUM(net_payable), 0) as total_certified_amount,
         COALESCE(SUM(retention_amount), 0) as total_retention_held
       FROM ra_bills
       WHERE project_id = $1 AND status IN ('certified', 'authorized', 'verified', 'paid')`,
      [projectId]
    );

    const materialCost = await query(
      `SELECT
         COALESCE(SUM(net_amount), 0) as total_material_liability
       FROM invoices
       WHERE project_id = $1 AND status IN ('authorized', 'verified', 'paid')`,
      [projectId]
    );

    const assetCost = await query(
      `SELECT
         COALESCE(SUM(total_cost), 0) as total_fuel_cost,
         COALESCE((SELECT SUM(units_worked * hourly_rate) FROM asset_usage_logs ul JOIN assets a ON ul.asset_id = a.id WHERE ul.project_id = $1), 0) as total_machinery_rental_cost
       FROM asset_fuel_logs
       WHERE project_id = $1`,
      [projectId]
    );

    const laborCost = await query(
      `SELECT
         COALESCE(SUM(w.daily_rate * CASE WHEN a.status='present' THEN 1 WHEN a.status='half_day' THEN 0.5 ELSE 0 END), 0) as total_labor_cost
       FROM attendance a
       JOIN workers w ON a.worker_id = w.id
       WHERE a.project_id = $1`,
      [projectId]
    );

    const physicalProgress = await query(
      `SELECT
         SUM(quantity * rate) as total_boq_value,
         SUM(COALESCE((SELECT SUM(net_quantity) FROM measurements m WHERE m.boq_item_id = bi.id AND m.status = 'pm_approved'), 0) * rate) as physical_certified_value
       FROM boq_items bi
       WHERE project_id = $1 AND is_active = true`,
      [projectId]
    );

    const safety = await query(
      `SELECT COUNT(*) as incident_count,
              COUNT(*) FILTER (WHERE incident_type = 'major_accident') as major_accidents
       FROM incidents WHERE project_id = $1 AND incident_date > NOW() - INTERVAL '30 days'`,
      [projectId]
    );

    res.json({
      data: {
        project: projectInfo.rows[0],
        financials: {
          revenue: revenue.rows[0],
          costs: {
            materials: materialCost.rows[0].total_material_liability,
            assets: toNumber(assetCost.rows[0].total_fuel_cost) + toNumber(assetCost.rows[0].total_machinery_rental_cost),
            labor: laborCost.rows[0].total_labor_cost,
            total:
              toNumber(materialCost.rows[0].total_material_liability) +
              toNumber(assetCost.rows[0].total_fuel_cost) +
              toNumber(assetCost.rows[0].total_machinery_rental_cost) +
              toNumber(laborCost.rows[0].total_labor_cost),
          },
        },
        progress: {
          total_boq_value: physicalProgress.rows[0].total_boq_value,
          physical_certified_value: physicalProgress.rows[0].physical_certified_value,
          pct: toNumber(physicalProgress.rows[0].total_boq_value) > 0
            ? (toNumber(physicalProgress.rows[0].physical_certified_value) / toNumber(physicalProgress.rows[0].total_boq_value)) * 100
            : 0,
        },
        safety: safety.rows[0],
      },
    });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

module.exports = router;
