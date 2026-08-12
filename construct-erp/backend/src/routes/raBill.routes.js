// src/routes/raBill.routes.js — Client Billing (RA Bills)
const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const { query, withTransaction } = require('../config/database');
const { runSchemaInit } = require('../utils/schemaInit');
const { loadProjectScope, appendProjectScope, userCanAccessProject } = require('../middleware/projectScope');
const { logAudit } = require('../utils/auditLog');
const { BOQ_COST_HEADS } = require('../constants/boqCostHeads');
const { postAutoJournalStandalone } = require('../services/journalAutoPost');
// Public verification endpoint (no auth — QR scan)
router.get('/public/verify/:id', async (req, res) => {
  try {
    const result = await query(
      `SELECT rb.*, p.name AS project_name, p.project_code,
              sc.name AS contractor_name, u.name AS created_by_name
       FROM ra_bills rb
       LEFT JOIN projects p ON rb.project_id = p.id
       LEFT JOIN vendors sc ON rb.contractor_id = sc.id
       LEFT JOIN users u ON rb.created_by = u.id
       WHERE rb.id = $1`, [req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'RA Bill not found' });
    const items = await query(`SELECT * FROM ra_bill_items WHERE ra_bill_id = $1 ORDER BY sort_order`, [req.params.id]);
    res.json({ data: { ...result.rows[0], items: items.rows } });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Public BOQ summary verification
router.get('/public/verify-boq/:projectId', async (req, res) => {
  try {
    const result = await query(
      `SELECT p.id, p.name AS project_name, p.project_code, p.location, p.status,
              c.name AS company_name
       FROM projects p
       LEFT JOIN companies c ON p.company_id = c.id
       WHERE p.id = $1`, [req.params.projectId]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Project not found' });
    res.json({ data: result.rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.use(authenticate);
router.use(loadProjectScope);

// Ensure new columns exist on live DB (idempotent)
const ensureRaBillCols = async () => {
  const alters = [
    `ALTER TABLE ra_bills ADD COLUMN IF NOT EXISTS contractor_name VARCHAR(200)`,
    `ALTER TABLE ra_bills ADD COLUMN IF NOT EXISTS contractor_gstin VARCHAR(15)`,
    `ALTER TABLE ra_bills ADD COLUMN IF NOT EXISTS contractor_pan VARCHAR(10)`,
    `ALTER TABLE ra_bills ADD COLUMN IF NOT EXISTS work_description TEXT`,
    `ALTER TABLE ra_bills ADD COLUMN IF NOT EXISTS price_escalation NUMERIC(15,2) DEFAULT 0`,
    `ALTER TABLE ra_bills ADD COLUMN IF NOT EXISTS certified_by UUID`,
    `ALTER TABLE ra_bills ADD COLUMN IF NOT EXISTS certified_date TIMESTAMPTZ`,
    `ALTER TABLE ra_bills ADD COLUMN IF NOT EXISTS client_tds_amount NUMERIC(15,2) DEFAULT 0`,
    `ALTER TABLE ra_bills ADD COLUMN IF NOT EXISTS amount_received NUMERIC(15,2) DEFAULT 0`,
    `ALTER TABLE ra_bills ADD COLUMN IF NOT EXISTS company_id UUID`,
    `ALTER TABLE ra_bills ADD COLUMN IF NOT EXISTS adhoc_advance_recovery NUMERIC(15,2) DEFAULT 0`,
    `ALTER TABLE ra_bills ADD COLUMN IF NOT EXISTS wo_number VARCHAR(100) DEFAULT ''`,
    `ALTER TABLE ra_bill_items ADD COLUMN IF NOT EXISTS cost_head TEXT`,
  ];
  for (const sql of alters) {
    try { await query(sql); } catch (_) {}
  }
  // Ensure status constraint includes 'draft' and 'verified' (production DB may have old constraint)
  try {
    await query(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.check_constraints
          WHERE constraint_schema = current_schema()
            AND constraint_name = 'ra_bills_status_check'
            AND check_clause LIKE '%draft%'
        ) THEN
          ALTER TABLE ra_bills DROP CONSTRAINT IF EXISTS ra_bills_status_check;
          ALTER TABLE ra_bills ADD CONSTRAINT ra_bills_status_check
            CHECK (status IN ('draft','submitted','verified','certified','rejected','paid'));
        END IF;
      END $$
    `);
  } catch (_) {}
};
runSchemaInit('ra_bills', ensureRaBillCols);

// Separate migration name — 'ra_bills' was already marked applied in production
// before this table existed, and runSchemaInit never re-runs a completed migration.
const ensureRaBillingPlanTable = async () => {
  await query(`
    CREATE TABLE IF NOT EXISTS ra_billing_plan (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      plan_month DATE NOT NULL,
      planned_value NUMERIC(15,2) NOT NULL DEFAULT 0,
      created_by UUID,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(project_id, plan_month)
    )
  `);
};
runSchemaInit('ra_billing_plan', ensureRaBillingPlanTable);

// GET /ra-bills
router.get('/', async (req, res) => {
  try {
    const { project_id, status } = req.query;
    let sql = `
      SELECT rb.*, p.name as project_name,
             u.name as created_by_name,
             v.name as verified_by_name,
             cert.name as certified_by_name
      FROM ra_bills rb
      JOIN projects p ON rb.project_id = p.id
      LEFT JOIN users u ON rb.created_by = u.id
      LEFT JOIN users v ON rb.verified_by = v.id
      LEFT JOIN users cert ON rb.certified_by = cert.id
      WHERE p.company_id = $1`;
    let params = [req.user.company_id]; let i = 2;
    if (project_id) { sql += ` AND rb.project_id = $${i++}`; params.push(project_id); }
    if (status)     { sql += ` AND rb.status = $${i++}`;     params.push(status); }
    ({ sql, params } = appendProjectScope(req, sql, params, 'rb'));
    sql += ' ORDER BY rb.bill_date DESC, rb.created_at DESC';
    const result = await query(sql, params);
    res.json({ data: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /ra-bills/boq-item-billed?project_id=X  — per-BOQ-item RA billing summary
router.get('/boq-item-billed', async (req, res) => {
  try {
    const { project_id } = req.query;
    if (!project_id) return res.status(400).json({ error: 'project_id required' });
    const result = await query(`
      SELECT
        rbi.boq_item_id,
        bi.chapter_no,
        bi.chapter_name,
        SUM(rbi.amount)                                                                          AS total_billed,
        (array_agg(rb.bill_number ORDER BY rb.bill_date DESC NULLS LAST, rb.created_at DESC))[1] AS last_bill_number,
        (array_agg(rb.status      ORDER BY rb.bill_date DESC NULLS LAST, rb.created_at DESC))[1] AS last_bill_status
      FROM ra_bill_items rbi
      JOIN ra_bills  rb ON rbi.ra_bill_id  = rb.id
      JOIN projects  p  ON rb.project_id   = p.id
      JOIN boq_items bi ON rbi.boq_item_id = bi.id
      WHERE rb.project_id = $1
        AND p.company_id  = $2
        AND rb.status NOT IN ('draft','rejected')
      GROUP BY rbi.boq_item_id, bi.chapter_no, bi.chapter_name
    `, [project_id, req.user.company_id]);
    res.json({ data: result.rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /ra-bills/boq-bills-detail?project_id=X — individual bill rows per BOQ item
router.get('/boq-bills-detail', async (req, res) => {
  try {
    const { project_id } = req.query;
    if (!project_id) return res.status(400).json({ error: 'project_id required' });
    const result = await query(`
      SELECT
        rbi.boq_item_id,
        rb.id          AS ra_bill_id,
        rb.bill_number,
        rb.bill_date,
        rb.status,
        rbi.amount
      FROM ra_bill_items rbi
      JOIN ra_bills rb ON rbi.ra_bill_id = rb.id
      JOIN projects p  ON rb.project_id  = p.id
      WHERE rb.project_id = $1
        AND p.company_id  = $2
        AND rb.status NOT IN ('draft','rejected')
      ORDER BY rb.bill_date ASC NULLS LAST, rb.bill_number ASC
    `, [project_id, req.user.company_id]);
    res.json({ data: result.rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /ra-bills/previous-stats
router.get('/previous-stats', async (req, res) => {
  try {
    const { project_id, boq_item_id } = req.query;
    const projectCheck = await query(
      `SELECT 1 FROM projects WHERE id = $1 AND company_id = $2 LIMIT 1`,
      [project_id, req.user.company_id]
    );
    if (projectCheck && projectCheck.rowCount !== undefined && !projectCheck.rowCount) {
      return res.status(400).json({ error: 'Invalid project for this company' });
    }
    const result = await query(
      `SELECT SUM(rbi.current_qty) as total_prev_qty, SUM(rbi.amount) as total_prev_amount
       FROM ra_bill_items rbi
       JOIN ra_bills rb ON rbi.ra_bill_id = rb.id
       JOIN projects p ON rb.project_id = p.id
       WHERE rb.project_id = $1 AND p.company_id = $3
         AND rbi.boq_item_id = $2 AND rb.status IN ('certified','paid')`,
      [project_id, boq_item_id, req.user.company_id]
    );
    res.json({ data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /ra-bills/summary — portfolio-wide billing summary: Contract Value vs
// Billed vs Certified vs Balance to Complete, per project + aggregated.
router.get('/summary', async (req, res) => {
  try {
    const { project_id } = req.query;

    const conditions = ['p.company_id = $1'];
    const params = [req.user.company_id];
    // Scope on p.id here (we're filtering the `projects` table itself, not a
    // child table with a project_id FK), so applyProjectScope/appendProjectScope
    // (which hardcode/parameterize a `project_id` column) don't apply directly.
    if (project_id && String(project_id).trim()) {
      if (!userCanAccessProject(req, project_id)) {
        return res.status(403).json({ error: 'Access denied for this project.' });
      }
      params.push(project_id);
      conditions.push(`p.id = $${params.length}`);
    } else if (!req.isGlobalRole) {
      const allowed = req.allowedProjectIds || [];
      if (allowed.length === 0) {
        conditions.push('FALSE');
      } else {
        params.push(allowed);
        conditions.push(`p.id = ANY($${params.length}::uuid[])`);
      }
    }

    const projectsRes = await query(
      `SELECT p.id, p.name, p.project_code, COALESCE(p.contract_value,0) AS contract_value
         FROM projects p WHERE ${conditions.join(' AND ')}
         ORDER BY p.name`,
      params
    );
    const projectMeta = projectsRes.rows;
    const projectIds = projectMeta.map(p => p.id);

    const empty = {
      kpis: {
        total_bills: 0, gross_valuation: 0, net_payable_certified: 0,
        pending_certification_value: 0, pending_certification_count: 0,
        rejected_value: 0, rejected_count: 0,
        total_contract_value: 0, billed_to_date: 0, certified_to_date: 0, balance_to_complete: 0,
      },
      projects: [], statusBreakdown: [], deductions: [], trend: [],
    };
    if (!projectIds.length) return res.json({ data: empty });

    const billsRes = await query(
      `SELECT project_id, status, gross_amount, net_payable,
              retention_amount, tds_amount, mobilization_advance_recovery,
              adhoc_advance_recovery, material_recovery_steel, material_recovery_cement,
              other_deductions, bill_date, certified_date
         FROM ra_bills
        WHERE project_id = ANY($1::uuid[])`,
      [projectIds]
    );
    const bills = billsRes.rows;
    const num = v => parseFloat(v || 0);

    // ── Per-project rollup ──
    const byProject = {};
    projectMeta.forEach(p => {
      byProject[p.id] = { id: p.id, name: p.name, project_code: p.project_code, contract_value: num(p.contract_value), billed: 0, certified: 0 };
    });
    bills.forEach(b => {
      const row = byProject[b.project_id];
      if (!row) return;
      if (!['draft', 'rejected'].includes(b.status)) row.billed += num(b.gross_amount);
      if (['certified', 'paid'].includes(b.status)) row.certified += num(b.gross_amount);
    });
    const projectsOut = Object.values(byProject).map(r => ({
      ...r,
      balance_to_complete: r.contract_value - r.certified,
      pct_complete: r.contract_value > 0 ? Math.round((r.certified / r.contract_value) * 1000) / 10 : null,
    }));

    // ── Status breakdown ──
    const statusCounts = {};
    bills.forEach(b => { statusCounts[b.status] = (statusCounts[b.status] || 0) + 1; });
    const statusBreakdown = Object.entries(statusCounts).map(([status, count]) => ({ status, count }));

    // ── Deductions aggregate (bills that have actually gone through, i.e. not draft/rejected) ──
    const ded = { retention: 0, tds: 0, advance_recovery: 0, material_recovery: 0, other: 0 };
    bills.filter(b => !['draft', 'rejected'].includes(b.status)).forEach(b => {
      ded.retention         += num(b.retention_amount);
      ded.tds               += num(b.tds_amount);
      ded.advance_recovery  += num(b.mobilization_advance_recovery) + num(b.adhoc_advance_recovery);
      ded.material_recovery += num(b.material_recovery_steel) + num(b.material_recovery_cement);
      ded.other             += num(b.other_deductions);
    });
    const deductions = [
      { key: 'retention',         label: 'Retention',        amount: ded.retention },
      { key: 'tds',               label: 'TDS',               amount: ded.tds },
      { key: 'advance_recovery',  label: 'Advance Recovery',  amount: ded.advance_recovery },
      { key: 'material_recovery', label: 'Material Recovery', amount: ded.material_recovery },
      { key: 'other',             label: 'Other Deductions',  amount: ded.other },
    ].filter(d => d.amount > 0);

    // ── Monthly trend of certified value (last 12 months, by certified_date/bill_date) ──
    const monthKey = d => { const dt = new Date(d); return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`; };
    const trendMap = {};
    bills.filter(b => ['certified', 'paid'].includes(b.status)).forEach(b => {
      const k = monthKey(b.certified_date || b.bill_date);
      trendMap[k] = (trendMap[k] || 0) + num(b.gross_amount);
    });
    const now = new Date();
    const trend = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      trend.push({ month: k, value: trendMap[k] || 0 });
    }

    // ── Portfolio KPIs ──
    const kpis = {
      total_bills: bills.length,
      gross_valuation: bills.filter(b => b.status !== 'rejected').reduce((a, b) => a + num(b.gross_amount), 0),
      net_payable_certified: bills.filter(b => ['certified', 'paid'].includes(b.status)).reduce((a, b) => a + num(b.net_payable), 0),
      pending_certification_value: bills.filter(b => b.status === 'verified').reduce((a, b) => a + num(b.net_payable), 0),
      pending_certification_count: bills.filter(b => b.status === 'verified').length,
      rejected_value: bills.filter(b => b.status === 'rejected').reduce((a, b) => a + num(b.gross_amount), 0),
      rejected_count: bills.filter(b => b.status === 'rejected').length,
      total_contract_value: projectsOut.reduce((a, p) => a + p.contract_value, 0),
      billed_to_date: projectsOut.reduce((a, p) => a + p.billed, 0),
      certified_to_date: projectsOut.reduce((a, p) => a + p.certified, 0),
      balance_to_complete: projectsOut.reduce((a, p) => a + p.balance_to_complete, 0),
    };

    res.json({ data: { kpis, projects: projectsOut, statusBreakdown, deductions, trend } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Billing Plan (planned monthly billing target) ──────────────────────────
// GET /ra-bills/billing-plan?project_id=X — editable plan rows for one project
router.get('/billing-plan', async (req, res) => {
  try {
    const { project_id } = req.query;
    if (!project_id) return res.status(400).json({ error: 'project_id required' });
    if (!userCanAccessProject(req, project_id)) {
      return res.status(403).json({ error: 'Access denied for this project.' });
    }
    const projectCheck = await query(`SELECT 1 FROM projects WHERE id = $1 AND company_id = $2`, [project_id, req.user.company_id]);
    if (!projectCheck.rowCount) return res.status(404).json({ error: 'Project not found' });

    const result = await query(
      `SELECT id, project_id, plan_month, planned_value
         FROM ra_billing_plan WHERE project_id = $1 ORDER BY plan_month`,
      [project_id]
    );
    res.json({ data: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /ra-bills/billing-plan — upsert one month's planned billing value
router.put('/billing-plan', authorize('super_admin','admin','qs_engineer','project_manager'), async (req, res) => {
  try {
    const { project_id, plan_month, planned_value } = req.body;
    if (!project_id || !plan_month) return res.status(400).json({ error: 'project_id and plan_month are required' });
    if (!userCanAccessProject(req, project_id)) {
      return res.status(403).json({ error: 'Access denied for this project.' });
    }
    const projectCheck = await query(`SELECT 1 FROM projects WHERE id = $1 AND company_id = $2`, [project_id, req.user.company_id]);
    if (!projectCheck.rowCount) return res.status(404).json({ error: 'Project not found' });

    // Normalize to the first of the month so UNIQUE(project_id, plan_month) matches consistently
    const monthStart = new Date(plan_month);
    const normalized = new Date(monthStart.getFullYear(), monthStart.getMonth(), 1).toISOString().slice(0, 10);

    const result = await query(
      `INSERT INTO ra_billing_plan (project_id, plan_month, planned_value, created_by)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (project_id, plan_month)
       DO UPDATE SET planned_value = $3, updated_at = NOW()
       RETURNING id, project_id, plan_month, planned_value`,
      [project_id, normalized, planned_value || 0, req.user.id]
    );
    res.json({ data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /ra-bills/billing-plan/:id
router.delete('/billing-plan/:id', authorize('super_admin','admin','qs_engineer','project_manager'), async (req, res) => {
  try {
    const result = await query(
      `DELETE FROM ra_billing_plan rbp USING projects p
       WHERE rbp.project_id = p.id AND rbp.id = $1 AND p.company_id = $2
       RETURNING rbp.id`,
      [req.params.id, req.user.company_id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Plan entry not found' });
    res.json({ message: 'Plan entry deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /ra-bills/planned-vs-actual?project_id=optional — monthly + cumulative
// planned billing target vs actual certified value, portfolio-wide or per project.
router.get('/planned-vs-actual', async (req, res) => {
  try {
    const { project_id } = req.query;

    const projConditions = ['p.company_id = $1'];
    const projParams = [req.user.company_id];
    if (project_id && String(project_id).trim()) {
      if (!userCanAccessProject(req, project_id)) {
        return res.status(403).json({ error: 'Access denied for this project.' });
      }
      projParams.push(project_id);
      projConditions.push(`p.id = $${projParams.length}`);
    } else if (!req.isGlobalRole) {
      const allowed = req.allowedProjectIds || [];
      if (allowed.length === 0) projConditions.push('FALSE');
      else { projParams.push(allowed); projConditions.push(`p.id = ANY($${projParams.length}::uuid[])`); }
    }
    const projectIdsRes = await query(`SELECT p.id FROM projects p WHERE ${projConditions.join(' AND ')}`, projParams);
    const projectIds = projectIdsRes.rows.map(r => r.id);
    if (!projectIds.length) return res.json({ data: { months: [], plan: [] } });

    const [planRes, billsRes] = await Promise.all([
      query(
        `SELECT plan_month, SUM(planned_value) AS planned_value
           FROM ra_billing_plan WHERE project_id = ANY($1::uuid[])
          GROUP BY plan_month`,
        [projectIds]
      ),
      query(
        `SELECT bill_date, certified_date, status, gross_amount
           FROM ra_bills WHERE project_id = ANY($1::uuid[]) AND status IN ('certified','paid')`,
        [projectIds]
      ),
    ]);

    const num = v => parseFloat(v || 0);
    const monthKey = d => { const dt = new Date(d); return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`; };

    const plannedByMonth = {};
    planRes.rows.forEach(r => { plannedByMonth[monthKey(r.plan_month)] = num(r.planned_value); });

    const actualByMonth = {};
    billsRes.rows.forEach(b => {
      const k = monthKey(b.certified_date || b.bill_date);
      actualByMonth[k] = (actualByMonth[k] || 0) + num(b.gross_amount);
    });

    // Span from the earliest of (first plan month, first certified bill) through
    // the later of (today, last plan month) so the curve covers the full plan.
    const allKeys = [...Object.keys(plannedByMonth), ...Object.keys(actualByMonth)];
    const now = new Date();
    let startKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    let endKey = startKey;
    if (allKeys.length) {
      startKey = allKeys.reduce((a, b) => (a < b ? a : b));
      endKey = allKeys.reduce((a, b) => (a > b ? a : b), startKey);
      if (endKey < startKey) endKey = startKey;
    }

    const [sy, sm] = startKey.split('-').map(Number);
    const [ey, em] = endKey.split('-').map(Number);
    const months = [];
    let cy = sy, cm = sm, cumPlanned = 0, cumActual = 0;
    while (cy < ey || (cy === ey && cm <= em)) {
      const k = `${cy}-${String(cm).padStart(2, '0')}`;
      const planned = plannedByMonth[k] || 0;
      const actual = actualByMonth[k] || 0;
      cumPlanned += planned;
      cumActual += actual;
      months.push({
        month: k, planned, actual,
        cumulative_planned: cumPlanned, cumulative_actual: cumActual,
        variance: cumActual - cumPlanned,
        variance_pct: cumPlanned > 0 ? Math.round(((cumActual - cumPlanned) / cumPlanned) * 1000) / 10 : null,
      });
      cm++; if (cm > 12) { cm = 1; cy++; }
    }

    // Editable plan rows, only meaningful when scoped to a single project
    let plan = [];
    if (project_id && String(project_id).trim()) {
      const planRows = await query(
        `SELECT id, project_id, plan_month, planned_value FROM ra_billing_plan
          WHERE project_id = $1 ORDER BY plan_month`,
        [project_id]
      );
      plan = planRows.rows;
    }

    res.json({ data: { months, plan } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /ra-bills
router.post('/', authorize('super_admin','admin','qs_engineer','project_manager'), async (req, res) => {
  try {
    const {
      project_id, bill_number, bill_date, work_description,
      bill_period_from, bill_period_to,
      gross_amount, gst_rate, gst_amount,
      retention_percent, mobilization_advance_recovery, adhoc_advance_recovery,
      material_recovery_steel, material_recovery_cement,
      price_escalation, other_deductions,
      tds_rate, items, remarks,
      contractor_name, contractor_gstin, contractor_pan, wo_number,
    } = req.body;

    const projectCheck = await query(
      `SELECT 1 FROM projects WHERE id = $1 AND company_id = $2 LIMIT 1`,
      [project_id, req.user.company_id]
    );
    if (projectCheck && projectCheck.rowCount !== undefined && !projectCheck.rowCount) {
      return res.status(400).json({ error: 'Invalid project for this company' });
    }

    const billStatus = req.body.status === 'draft' ? 'draft' : 'submitted';

    const result = await withTransaction(async (client) => {
      // Retention is charged on gross + price escalation (escalation is part of the certified value)
      const retention_amount = (parseFloat(gross_amount) + parseFloat(price_escalation || 0)) * (parseFloat(retention_percent || 0) / 100);
      const tds_amount       = parseFloat(gross_amount) * (parseFloat(tds_rate || 0) / 100);
      const total_deductions =
        retention_amount +
        parseFloat(mobilization_advance_recovery || 0) +
        parseFloat(adhoc_advance_recovery || 0) +
        parseFloat(material_recovery_steel || 0) +
        parseFloat(material_recovery_cement || 0) +
        parseFloat(other_deductions || 0) +
        tds_amount;
      const gross_with_gst = parseFloat(gross_amount) + parseFloat(gst_amount || 0);
      const net_payable    = gross_with_gst - total_deductions + parseFloat(price_escalation || 0);

      const header = await client.query(
        `INSERT INTO ra_bills
           (project_id, bill_number, bill_date, work_description,
            bill_period_from, bill_period_to,
            gross_amount, gst_rate, gst_amount, gross_with_gst,
            retention_pct, retention_amount,
            mobilization_advance_recovery, adhoc_advance_recovery,
            material_recovery_steel, material_recovery_cement,
            price_escalation, other_deductions,
            tds_rate, tds_amount,
            total_deductions, net_payable, status, created_by, remarks,
            contractor_name, contractor_gstin, contractor_pan, wo_number)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29)
         RETURNING *`,
        [
          project_id, bill_number, bill_date, work_description || null,
          bill_period_from || null, bill_period_to || null,
          gross_amount, parseFloat(gst_rate || 18), gst_amount, gross_with_gst,
          retention_percent, retention_amount,
          mobilization_advance_recovery || 0, adhoc_advance_recovery || 0,
          material_recovery_steel || 0, material_recovery_cement || 0,
          price_escalation || 0, other_deductions || 0,
          tds_rate || 2, tds_amount,
          total_deductions, net_payable, billStatus, req.user.id, remarks,
          contractor_name || 'Client', contractor_gstin || null, contractor_pan || null,
          wo_number || null,
        ]
      );
      const billId = header.rows[0].id;

      for (const it of (items || [])) {
        const itemCheck = await client.query(
          `SELECT COALESCE(b.current_quantity, b.quantity) AS boq_qty,
                  b.amendment_ref
             FROM boq_items b
             JOIN projects p ON b.project_id = p.id
            WHERE b.id = $1 AND b.project_id = $2 AND p.company_id = $3
            LIMIT 1`,
          [it.boq_item_id, project_id, req.user.company_id]
        );
        if (!itemCheck.rowCount) {
          throw new Error('Invalid BOQ item for this project');
        }
        const boqQty = parseFloat(itemCheck.rows[0].boq_qty || 0);
        const prevRes = await client.query(
          `SELECT COALESCE(SUM(current_qty),0) as prev_qty FROM ra_bill_items rbi
           JOIN ra_bills rb ON rbi.ra_bill_id = rb.id
           WHERE rb.project_id = $1 AND rbi.boq_item_id = $2 AND rb.status IN ('certified','paid')`,
          [project_id, it.boq_item_id]
        );
        const prevQty    = parseFloat(prevRes.rows[0].prev_qty);
        const currentQty = parseFloat(it.current_qty);
        if (boqQty > 0 && prevQty + currentQty > boqQty + 0.001) {
          throw new Error(
            `BOQ quantity exceeded for item ${it.boq_item_id}: ` +
            `BOQ=${boqQty}, already certified=${prevQty}, this bill=${currentQty} ` +
            `(total ${prevQty + currentQty} > ${boqQty})`
          );
        }
        const costHead = BOQ_COST_HEADS.includes(it.cost_head) ? it.cost_head : null;
        await client.query(
          `INSERT INTO ra_bill_items
             (ra_bill_id, boq_item_id, prev_certified_qty, current_qty, cumulative_qty, rate, cost_head)
           VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [billId, it.boq_item_id, prevQty, currentQty, prevQty + currentQty, it.rate, costHead]
        );
      }
      return header.rows[0];
    });

    res.status(201).json({ data: result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /ra-bills/:id
router.get('/:id', async (req, res) => {
  try {
    const headerRes = await query(
      `SELECT rb.*,
              p.name as project_name, p.contract_value as total_contract_value,
              u.name  as submitted_by_name,
              v.name  as verified_by_name,
              cert.name as certified_by_name
       FROM ra_bills rb
       JOIN projects p ON rb.project_id = p.id
       LEFT JOIN users u    ON rb.created_by  = u.id
       LEFT JOIN users v    ON rb.verified_by  = v.id
       LEFT JOIN users cert ON rb.certified_by = cert.id
       WHERE rb.id = $1 AND p.company_id = $2`,
      [req.params.id, req.user.company_id]
    );
    if (!headerRes.rows.length) return res.status(404).json({ error: 'Bill not found' });

    const itemRes = await query(
      `SELECT rbi.*, b.chapter_no, b.chapter_name, b.item_no, b.sr_no,
              b.description, b.short_description, b.unit,
              b.quantity    AS boq_qty,
              b.rate        AS boq_rate,
              COALESCE(b.current_quantity, b.quantity) AS revised_boq_qty,
              COALESCE(b.current_rate, b.rate)         AS revised_boq_rate,
              b.amendment_ref
       FROM ra_bill_items rbi
       JOIN boq_items b ON rbi.boq_item_id = b.id
       WHERE rbi.ra_bill_id = $1
       ORDER BY b.chapter_no, b.item_no`,
      [req.params.id]
    );

    res.json({ data: { ...headerRes.rows[0], items: itemRes.rows } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /ra-bills/:id — full edit of a draft/rejected bill: header fields + line items.
// Only bills still in 'draft' or 'rejected' status may be edited — once submitted,
// changes must go through the verify/reject/revert workflow instead.
router.put('/:id', authorize('super_admin','admin','qs_engineer','project_manager'), async (req, res) => {
  try {
    const existing = await query(
      `SELECT rb.id, rb.status, rb.project_id FROM ra_bills rb
       JOIN projects p ON rb.project_id = p.id
       WHERE rb.id = $1 AND p.company_id = $2`,
      [req.params.id, req.user.company_id]
    );
    if (!existing.rows.length) return res.status(404).json({ error: 'Bill not found' });
    if (!['draft', 'rejected'].includes(existing.rows[0].status)) {
      return res.status(400).json({ error: 'Only draft or rejected bills can be edited' });
    }
    const projectId = existing.rows[0].project_id;

    const {
      bill_number, bill_date, work_description,
      bill_period_from, bill_period_to,
      gross_amount, gst_rate, gst_amount,
      retention_percent, mobilization_advance_recovery, adhoc_advance_recovery,
      material_recovery_steel, material_recovery_cement,
      price_escalation, other_deductions,
      tds_rate, items, remarks,
      contractor_name, contractor_gstin, contractor_pan, wo_number,
    } = req.body;
    const newStatus = req.body.status === 'submitted' ? 'submitted' : 'draft';

    const result = await withTransaction(async (client) => {
      const retention_amount = (parseFloat(gross_amount) + parseFloat(price_escalation || 0)) * (parseFloat(retention_percent || 0) / 100);
      const tds_amount       = parseFloat(gross_amount) * (parseFloat(tds_rate || 0) / 100);
      const total_deductions =
        retention_amount +
        parseFloat(mobilization_advance_recovery || 0) +
        parseFloat(adhoc_advance_recovery || 0) +
        parseFloat(material_recovery_steel || 0) +
        parseFloat(material_recovery_cement || 0) +
        parseFloat(other_deductions || 0) +
        tds_amount;
      const gross_with_gst = parseFloat(gross_amount) + parseFloat(gst_amount || 0);
      const net_payable     = gross_with_gst - total_deductions + parseFloat(price_escalation || 0);

      const header = await client.query(
        `UPDATE ra_bills SET
           bill_number = $1, bill_date = $2, work_description = $3,
           bill_period_from = $4, bill_period_to = $5,
           gross_amount = $6, gst_rate = $7, gst_amount = $8, gross_with_gst = $9,
           retention_pct = $10, retention_amount = $11,
           mobilization_advance_recovery = $12, adhoc_advance_recovery = $13,
           material_recovery_steel = $14, material_recovery_cement = $15,
           price_escalation = $16, other_deductions = $17,
           tds_rate = $18, tds_amount = $19,
           total_deductions = $20, net_payable = $21, status = $22, remarks = $23,
           contractor_name = $24, contractor_gstin = $25, contractor_pan = $26, wo_number = $27,
           updated_at = NOW()
         WHERE id = $28
         RETURNING *`,
        [
          bill_number, bill_date, work_description || null,
          bill_period_from || null, bill_period_to || null,
          gross_amount, parseFloat(gst_rate || 18), gst_amount, gross_with_gst,
          retention_percent, retention_amount,
          mobilization_advance_recovery || 0, adhoc_advance_recovery || 0,
          material_recovery_steel || 0, material_recovery_cement || 0,
          price_escalation || 0, other_deductions || 0,
          tds_rate || 2, tds_amount,
          total_deductions, net_payable, newStatus, remarks,
          contractor_name || 'Client', contractor_gstin || null, contractor_pan || null,
          wo_number || null,
          req.params.id,
        ]
      );

      if (Array.isArray(items)) {
        await client.query(`DELETE FROM ra_bill_items WHERE ra_bill_id = $1`, [req.params.id]);
        for (const it of items) {
          const itemCheck = await client.query(
            `SELECT COALESCE(b.current_quantity, b.quantity) AS boq_qty
               FROM boq_items b
               JOIN projects p ON b.project_id = p.id
              WHERE b.id = $1 AND b.project_id = $2 AND p.company_id = $3
              LIMIT 1`,
            [it.boq_item_id, projectId, req.user.company_id]
          );
          if (!itemCheck.rowCount) {
            throw new Error('Invalid BOQ item for this project');
          }
          const boqQty = parseFloat(itemCheck.rows[0].boq_qty || 0);
          const prevRes = await client.query(
            `SELECT COALESCE(SUM(current_qty),0) as prev_qty FROM ra_bill_items rbi
             JOIN ra_bills rb ON rbi.ra_bill_id = rb.id
             WHERE rb.project_id = $1 AND rbi.boq_item_id = $2 AND rb.status IN ('certified','paid')`,
            [projectId, it.boq_item_id]
          );
          const prevQty    = parseFloat(prevRes.rows[0].prev_qty);
          const currentQty = parseFloat(it.current_qty);
          if (boqQty > 0 && prevQty + currentQty > boqQty + 0.001) {
            throw new Error(
              `BOQ quantity exceeded for item ${it.boq_item_id}: ` +
              `BOQ=${boqQty}, already certified=${prevQty}, this bill=${currentQty} ` +
              `(total ${prevQty + currentQty} > ${boqQty})`
            );
          }
          const costHead = BOQ_COST_HEADS.includes(it.cost_head) ? it.cost_head : null;
          await client.query(
            `INSERT INTO ra_bill_items
               (ra_bill_id, boq_item_id, prev_certified_qty, current_qty, cumulative_qty, rate, cost_head)
             VALUES ($1,$2,$3,$4,$5,$6,$7)`,
            [req.params.id, it.boq_item_id, prevQty, currentQty, prevQty + currentQty, it.rate, costHead]
          );
        }
      }
      return header.rows[0];
    });

    res.json({ data: result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /ra-bills/:id/verify
router.patch('/:id/verify', authorize('super_admin','admin','qs_engineer','project_manager'), async (req, res) => {
  try {
    const check = await query(
      `SELECT rb.id FROM ra_bills rb JOIN projects p ON rb.project_id=p.id
       WHERE rb.id=$1 AND p.company_id=$2 AND rb.status='submitted'`,
      [req.params.id, req.user.company_id]
    );
    if (!check.rows.length) return res.status(400).json({ error: 'Bill not found or not in submitted status' });
    const result = await query(
      `UPDATE ra_bills SET status='verified', verified_by=$1, updated_at=NOW() WHERE id=$2 RETURNING *`,
      [req.user.id, req.params.id]
    );
    await logAudit(req, { action: 'verify', tableName: 'ra_bills', recordId: req.params.id, newValues: { bill_number: result.rows[0].bill_number, status: 'verified' } });
    res.json({ data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /ra-bills/:id/approve (certify)
router.patch('/:id/approve', authorize('super_admin','admin','project_manager'), async (req, res) => {
  try {
    const result = await query(
      `UPDATE ra_bills rb
       SET status='certified', certified_by=$1, certified_date=NOW(), updated_at=NOW()
       FROM projects p
       WHERE rb.id=$2 AND rb.project_id=p.id AND p.company_id=$3 AND rb.status='verified'
       RETURNING rb.*`,
      [req.user.id, req.params.id, req.user.company_id]
    );
    if (!result.rows.length) return res.status(400).json({ error: 'Bill not found or not in verified status' });
    const bill = result.rows[0];
    await logAudit(req, { action: 'approve', tableName: 'ra_bills', recordId: req.params.id, newValues: { bill_number: bill.bill_number, status: 'certified', net_payable: bill.net_payable } });

    // ── Auto-post GL journal on certification ──────────────────────────────
    // Dr 1100 AR (gross incl. GST), Cr 4000 Revenue, Cr 2100 Output GST.
    // If advance recovery was applied, drain 2050 and reduce AR accordingly.
    try {
      const nn = v => parseFloat(v || 0);
      const gst     = nn(bill.gst_amount);
      const grossWG = nn(bill.gross_with_gst);
      // Revenue is derived from grossWG (the same total the debit/AR side is built
      // from) rather than from gross_amount + price_escalation, which are stored
      // independently and can be off by a paisa from grossWG due to separate
      // rounding. Deriving it this way makes debit == credit true by construction
      // instead of by coincidence — see audit finding F-02.
      const revenue = grossWG - gst;
      const advRec  = nn(bill.mobilization_advance_recovery) + nn(bill.adhoc_advance_recovery);
      const ref     = bill.bill_number || bill.id;

      if (grossWG > 0) {
        // Delete any prior auto JV for this bill (re-certification re-posts correctly)
        await query(
          `DELETE FROM journal_entries WHERE company_id = $1 AND source = 'auto_ra_bill' AND reference = $2`,
          [req.user.company_id, ref]
        ).catch(() => {});

        const lines = [
          { code: '1100', debit: grossWG - advRec, description: `AR — ${bill.bill_number || ''}` },
        ];
        if (advRec > 0)
          lines.push({ code: '2050', debit: advRec, description: `Advance recovery — ${ref}` });
        lines.push({ code: '4000', credit: revenue, description: `Contract revenue — ${ref}` });
        if (gst > 0)
          lines.push({ code: '2100', credit: gst,   description: `Output GST — ${ref}` });

        await postAutoJournalStandalone({
          companyId: req.user.company_id,
          userId:    req.user.id,
          entryDate: bill.certified_date || bill.bill_date,
          projectId: bill.project_id || null,
          reference: ref,
          narration: `RA Bill certified — ${bill.contractor_name || ''} (${ref})`,
          source:    'auto_ra_bill',
          lines,
        });
      }
    } catch (err) {
      // Best-effort — never block certification over a GL posting failure.
      // Must still be logged: a silently-swallowed error here is exactly how
      // 3 RA bills' AR/Revenue postings went missing with zero trace in 2026-06.
      console.error(`[raBill.approve] GL auto-post FAILED for ${bill.bill_number}: ${err.message}`);
    }

    res.json({ data: bill });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /ra-bills/:id/reject
router.patch('/:id/reject', authorize('super_admin','admin','qs_engineer','project_manager'), async (req, res) => {
  try {
    const { remarks } = req.body;
    const result = await query(
      `UPDATE ra_bills rb
       SET status='rejected', remarks=COALESCE($1, rb.remarks), updated_at=NOW()
       FROM projects p
       WHERE rb.id=$2 AND rb.project_id=p.id AND p.company_id=$3 AND rb.status IN ('submitted','verified')
       RETURNING rb.*`,
      [remarks || null, req.params.id, req.user.company_id]
    );
    if (!result.rows.length) return res.status(400).json({ error: 'Bill not found or not rejectable' });
    await logAudit(req, { action: 'reject', tableName: 'ra_bills', recordId: req.params.id, newValues: { bill_number: result.rows[0].bill_number, status: 'rejected', remarks: result.rows[0].remarks } });
    res.json({ data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /ra-bills/:id/revert — super_admin/admin only: send certified bill back to QS (verified)
// Reverses the auto GL journal so accounts are clean before re-certification.
router.patch('/:id/revert', authorize('super_admin','admin'), async (req, res) => {
  try {
    const result = await query(
      `UPDATE ra_bills rb
       SET status='verified', certified_by=NULL, certified_date=NULL, updated_at=NOW()
       FROM projects p
       WHERE rb.id=$1 AND rb.project_id=p.id AND p.company_id=$2 AND rb.status='certified'
       RETURNING rb.*`,
      [req.params.id, req.user.company_id]
    );
    if (!result.rows.length) return res.status(400).json({ error: 'Bill not found or not in certified status' });
    const bill = result.rows[0];
    const ref  = bill.bill_number || bill.id;
    // Delete the auto GL journal that was posted on certification
    await query(
      `DELETE FROM journal_entries WHERE company_id=$1 AND source='auto_ra_bill' AND reference=$2`,
      [req.user.company_id, ref]
    ).catch(() => {});
    await logAudit(req, { action: 'revert', tableName: 'ra_bills', recordId: req.params.id, newValues: { bill_number: ref, status: 'verified' } });
    res.json({ data: bill });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /ra-bills/:id/bill-number — correct the bill number/date without
// touching amounts or re-running the approval workflow. The main PUT :id
// only allows edits while status is draft/rejected (it replaces the whole
// bill including recomputed amounts), so a verified/certified bill has no
// other way to fix a numbering/date typo. Certification auto-posts a GL
// journal entry keyed by bill_number (see /approve above) — if one exists,
// keep its reference column in sync so it's still findable by the new
// number. Blocked once paid: a settled bill's reference shouldn't move.
router.patch('/:id/bill-number', authorize('super_admin','admin','qs_engineer','project_manager'), async (req, res) => {
  try {
    const { bill_number, bill_date } = req.body;
    if (!bill_number && !bill_date) return res.status(400).json({ error: 'bill_number or bill_date is required' });

    const existing = await query(
      `SELECT rb.* FROM ra_bills rb JOIN projects p ON rb.project_id = p.id
       WHERE rb.id = $1 AND p.company_id = $2`,
      [req.params.id, req.user.company_id]
    );
    if (!existing.rows.length) return res.status(404).json({ error: 'Bill not found' });
    const bill = existing.rows[0];
    if (bill.status === 'paid') return res.status(400).json({ error: 'Cannot renumber a bill that has already been paid' });

    const oldRef = bill.bill_number || bill.id;
    const result = await query(
      `UPDATE ra_bills SET bill_number=COALESCE($1,bill_number), bill_date=COALESCE($2,bill_date), updated_at=NOW()
       WHERE id=$3 RETURNING *`,
      [bill_number || null, bill_date || null, req.params.id]
    );
    const updated = result.rows[0];
    const newRef = updated.bill_number || updated.id;

    if (bill_number && newRef !== oldRef) {
      await query(
        `UPDATE journal_entries SET reference=$1 WHERE company_id=$2 AND source='auto_ra_bill' AND reference=$3`,
        [newRef, req.user.company_id, oldRef]
      ).catch(() => {});
    }

    await logAudit(req, { action: 'update', tableName: 'ra_bills', recordId: req.params.id, oldValues: { bill_number: bill.bill_number, bill_date: bill.bill_date }, newValues: { bill_number: updated.bill_number, bill_date: updated.bill_date } });
    res.json({ data: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /ra-bills/:id/pay — Finance marks certified bill as paid
router.patch('/:id/pay', authorize('super_admin','admin','accountant'), async (req, res) => {
  try {
    const { payment_date, payment_mode, payment_ref, client_tds_amount, amount_received } = req.body;
    if (!payment_date || !payment_mode || !payment_ref)
      return res.status(400).json({ error: 'payment_date, payment_mode and payment_ref are required.' });

    const check = await query(
      `SELECT rb.id FROM ra_bills rb JOIN projects p ON rb.project_id=p.id
       WHERE rb.id=$1 AND p.company_id=$2 AND rb.status='certified'`,
      [req.params.id, req.user.company_id]
    );
    if (!check.rows.length) return res.status(400).json({ error: 'Bill not found or not in certified status.' });

    const result = await query(
      `UPDATE ra_bills
         SET status='paid',
             payment_date=$1, payment_mode=$2, payment_ref=$3,
             client_tds_amount=$4, amount_received=$5,
             updated_at=NOW()
       WHERE id=$6 RETURNING *`,
      [payment_date, payment_mode, payment_ref,
       parseFloat(client_tds_amount || 0), parseFloat(amount_received || 0),
       req.params.id]
    );
    await logAudit(req, {
      action: 'pay', tableName: 'ra_bills', recordId: req.params.id,
      newValues: { bill_number: result.rows[0].bill_number, amount_received, payment_date, payment_mode, payment_ref },
    });
    res.json({ data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /ra-bills/:id (draft/rejected only)
router.delete('/:id', authorize('super_admin','admin','qs_engineer'), async (req, res) => {
  try {
    const result = await query(
      `DELETE FROM ra_bills rb USING projects p
       WHERE rb.project_id=p.id AND rb.id=$1 AND p.company_id=$2 AND rb.status IN ('draft','rejected')
       RETURNING rb.id, rb.bill_number, rb.gross_amount, rb.status`,
      [req.params.id, req.user.company_id]
    );
    if (!result.rows.length) return res.status(400).json({ error: 'Bill not found or cannot be deleted' });
    await logAudit(req, { action: 'delete', tableName: 'ra_bills', recordId: req.params.id, oldValues: result.rows[0] });
    res.json({ message: 'Bill deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
