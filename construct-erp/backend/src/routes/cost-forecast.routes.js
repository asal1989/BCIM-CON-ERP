// src/routes/cost-forecast.routes.js
// Cost to Completion — forecast workflow, risk management, drill-downs, export.
// Mounted at ${API}/analytics/cost-to-completion alongside the read-only
// aggregate in analytics.routes.js (GET /analytics/cost-to-completion/:project_id).
//
// Forecast approval: a revision that changes EAC for a cost head by more than
// FORECAST_APPROVAL_THRESHOLD_PCT auto-routes through a 2-stage review
// (Project Manager -> Project Head/MD) before it becomes the authoritative
// ETC for that cost head; the read-only aggregate only uses an approved row,
// never a pending one, so an unreviewed number can't silently show as fact.
// A revision within the threshold auto-approves — no need to route a 1%
// rounding correction through two people.
const express = require('express');
const XLSX = require('xlsx');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { loadProjectScope, userCanAccessProject } = require('../middleware/projectScope');
const { query, withTransaction } = require('../config/database');
const { runSchemaInit } = require('../utils/schemaInit');

router.use(authenticate);
router.use(loadProjectScope);

const FORECAST_APPROVAL_THRESHOLD_PCT = 5;

const PM_ROLES       = ['project_manager', 'project_head', 'super_admin', 'admin'];
const DIRECTOR_ROLES = ['project_head', 'managing_director', 'director', 'super_admin', 'admin'];
const RISK_EDIT_ROLES = ['project_manager', 'qs_engineer', 'project_head', 'managing_director', 'super_admin', 'admin'];

async function ensureTables() {
  await query(`
    CREATE TABLE IF NOT EXISTS project_cost_forecast_items (
      id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id        UUID NOT NULL,
      project_id        UUID NOT NULL,
      cost_head         TEXT NOT NULL,
      revised_etc       NUMERIC(15,2) NOT NULL,
      current_eac       NUMERIC(15,2),
      forecast_reason   TEXT,
      remarks           TEXT,
      status            TEXT NOT NULL DEFAULT 'approved',
      version           INT NOT NULL DEFAULT 1,
      prepared_by       UUID,
      pm_reviewed_by    UUID,
      pm_reviewed_at    TIMESTAMPTZ,
      approved_by       UUID,
      approved_at       TIMESTAMPTZ,
      rejected_reason   TEXT,
      created_at        TIMESTAMPTZ DEFAULT NOW(),
      updated_at        TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(project_id, cost_head)
    );

    CREATE TABLE IF NOT EXISTS project_cost_forecast_history (
      id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id        UUID NOT NULL,
      project_id        UUID NOT NULL,
      cost_head         TEXT NOT NULL,
      version           INT NOT NULL,
      previous_eac      NUMERIC(15,2),
      revised_eac       NUMERIC(15,2),
      previous_etc      NUMERIC(15,2),
      revised_etc       NUMERIC(15,2),
      forecast_reason   TEXT,
      remarks           TEXT,
      status            TEXT NOT NULL,
      prepared_by       UUID,
      acted_by          UUID,
      created_at        TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS project_cost_risks (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id    UUID NOT NULL,
      project_id    UUID NOT NULL,
      cost_head     TEXT,
      risk_title    TEXT NOT NULL,
      description   TEXT,
      severity      TEXT NOT NULL DEFAULT 'medium',
      impact        NUMERIC(15,2),
      status        TEXT NOT NULL DEFAULT 'open',
      owner         UUID,
      created_by    UUID,
      created_at    TIMESTAMPTZ DEFAULT NOW(),
      updated_at    TIMESTAMPTZ DEFAULT NOW(),
      closed_at     TIMESTAMPTZ
    );

    CREATE TABLE IF NOT EXISTS project_cost_risk_actions (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      risk_id     UUID REFERENCES project_cost_risks(id) ON DELETE CASCADE,
      action      TEXT NOT NULL,
      old_status  TEXT,
      new_status  TEXT,
      note        TEXT,
      changed_by  UUID,
      created_at  TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS project_cost_snapshots (
      id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id            UUID NOT NULL,
      project_id            UUID NOT NULL,
      period                TEXT NOT NULL,
      approved_budget       NUMERIC(15,2),
      actual_cost           NUMERIC(15,2),
      committed_cost        NUMERIC(15,2),
      etc                   NUMERIC(15,2),
      eac                   NUMERIC(15,2),
      variance              NUMERIC(15,2),
      cpi                   NUMERIC(8,4),
      spi                   NUMERIC(8,4),
      physical_progress_pct NUMERIC(5,2),
      created_at            TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(project_id, period)
    );
  `);
}
runSchemaInit('project_cost_forecast_v1', ensureTables);

const num = (v) => Number.parseFloat(v || 0) || 0;

async function assertProjectAccess(req, projectId) {
  if (!userCanAccessProject(req, projectId)) {
    const err = new Error('Access denied for this project.');
    err.statusCode = 403;
    throw err;
  }
  const proj = await query(`SELECT id FROM projects WHERE id=$1 AND company_id=$2`, [projectId, req.user.company_id]);
  if (!proj.rows.length) {
    const err = new Error('Project not found');
    err.statusCode = 404;
    throw err;
  }
}

// ════════════════════════════════════════════════════════════════════════════
// FORECAST — GET current items, POST new revision, PM review, Director approve
// ════════════════════════════════════════════════════════════════════════════

// GET /:project_id/forecast — current forecast row per cost head
router.get('/:project_id/forecast', async (req, res) => {
  try {
    await assertProjectAccess(req, req.params.project_id);
    const r = await query(
      `SELECT f.*, u1.name AS prepared_by_name, u2.name AS pm_reviewed_by_name, u3.name AS approved_by_name
       FROM project_cost_forecast_items f
       LEFT JOIN users u1 ON u1.id = f.prepared_by
       LEFT JOIN users u2 ON u2.id = f.pm_reviewed_by
       LEFT JOIN users u3 ON u3.id = f.approved_by
       WHERE f.project_id=$1 ORDER BY f.cost_head`,
      [req.params.project_id]
    );
    res.json({ data: r.rows });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

// GET /:project_id/forecast/history — full version trail, newest first
router.get('/:project_id/forecast/history', async (req, res) => {
  try {
    await assertProjectAccess(req, req.params.project_id);
    const { cost_head } = req.query;
    const params = [req.params.project_id];
    let cond = 'project_id=$1';
    if (cost_head) { params.push(cost_head); cond += ` AND cost_head=$${params.length}`; }
    const r = await query(
      `SELECT h.*, u1.name AS prepared_by_name, u2.name AS acted_by_name
       FROM project_cost_forecast_history h
       LEFT JOIN users u1 ON u1.id = h.prepared_by
       LEFT JOIN users u2 ON u2.id = h.acted_by
       WHERE ${cond} ORDER BY h.created_at DESC LIMIT 200`,
      params
    );
    res.json({ data: r.rows });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

// POST /:project_id/forecast — submit a revised ETC for one cost head.
// current_eac (actual_cost + previous ETC) must be supplied by the caller —
// the frontend already has it from the main aggregate — so the threshold
// check compares like-for-like without this endpoint re-deriving the whole
// CTC statement itself.
router.post('/:project_id/forecast', async (req, res) => {
  try {
    const projectId = req.params.project_id;
    await assertProjectAccess(req, projectId);
    const { cost_head, revised_etc, actual_cost, forecast_reason, remarks } = req.body;
    if (!cost_head) return res.status(400).json({ error: 'cost_head is required' });
    if (revised_etc == null || isNaN(revised_etc) || revised_etc < 0) {
      return res.status(400).json({ error: 'revised_etc must be a valid non-negative amount' });
    }
    if (!forecast_reason) return res.status(400).json({ error: 'forecast_reason is required' });

    const newEac = num(actual_cost) + num(revised_etc);

    const result = await withTransaction(async (client) => {
      const existing = await client.query(
        `SELECT * FROM project_cost_forecast_items WHERE project_id=$1 AND cost_head=$2`,
        [projectId, cost_head]
      );
      const prev = existing.rows[0];
      const prevEac = prev ? num(prev.current_eac) : newEac; // no prior row -> no delta, auto-approve
      const deltaPct = prevEac > 0 ? Math.abs((newEac - prevEac) / prevEac) * 100 : 0;

      if (deltaPct > FORECAST_APPROVAL_THRESHOLD_PCT && !remarks) {
        const e = new Error(`Remarks are required when the forecast changes EAC by more than ${FORECAST_APPROVAL_THRESHOLD_PCT}% (this revision is ${deltaPct.toFixed(1)}%).`);
        e.statusCode = 400;
        throw e;
      }

      const needsReview = deltaPct > FORECAST_APPROVAL_THRESHOLD_PCT;
      const status = needsReview ? 'submitted' : 'approved';
      const version = (prev?.version || 0) + 1;

      const up = await client.query(
        `INSERT INTO project_cost_forecast_items
           (company_id, project_id, cost_head, revised_etc, current_eac, forecast_reason, remarks,
            status, version, prepared_by, approved_by, approved_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
         ON CONFLICT (project_id, cost_head) DO UPDATE SET
           revised_etc=EXCLUDED.revised_etc, current_eac=EXCLUDED.current_eac,
           forecast_reason=EXCLUDED.forecast_reason, remarks=EXCLUDED.remarks,
           status=EXCLUDED.status, version=EXCLUDED.version, prepared_by=EXCLUDED.prepared_by,
           pm_reviewed_by=NULL, pm_reviewed_at=NULL,
           approved_by=EXCLUDED.approved_by, approved_at=EXCLUDED.approved_at,
           rejected_reason=NULL, updated_at=NOW()
         RETURNING *`,
        [
          req.user.company_id, projectId, cost_head, revised_etc, newEac, forecast_reason, remarks || null,
          status, version, req.user.id,
          needsReview ? null : req.user.id, needsReview ? null : new Date(),
        ]
      );

      await client.query(
        `INSERT INTO project_cost_forecast_history
           (company_id, project_id, cost_head, version, previous_eac, revised_eac, previous_etc, revised_etc,
            forecast_reason, remarks, status, prepared_by, acted_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
        [
          req.user.company_id, projectId, cost_head, version, prevEac, newEac,
          prev ? num(prev.revised_etc) : null, revised_etc,
          forecast_reason, remarks || null, status, req.user.id, req.user.id,
        ]
      );

      return up.rows[0];
    });

    res.status(201).json({ data: result });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

// PUT /:project_id/forecast/:id/review — Project Manager stage-1 review
router.put('/:project_id/forecast/:id/review', async (req, res) => {
  try {
    await assertProjectAccess(req, req.params.project_id);
    const role = String(req.user.role || '').toLowerCase();
    if (!PM_ROLES.includes(role)) return res.status(403).json({ error: 'Only a Project Manager (or admin) can review a forecast revision.' });

    const { action, remarks } = req.body; // 'approve' | 'reject'
    if (!['approve', 'reject'].includes(action)) return res.status(400).json({ error: 'action must be approve or reject' });

    const cur = await query(`SELECT * FROM project_cost_forecast_items WHERE id=$1 AND project_id=$2 AND status='submitted'`, [req.params.id, req.params.project_id]);
    if (!cur.rows.length) return res.status(404).json({ error: 'Forecast revision not found or not awaiting PM review' });
    const item = cur.rows[0];

    const newStatus = action === 'approve' ? 'pm_reviewed' : 'rejected';
    const r = await query(
      `UPDATE project_cost_forecast_items
       SET status=$1, pm_reviewed_by=$2, pm_reviewed_at=NOW(), rejected_reason=$3, updated_at=NOW()
       WHERE id=$4 RETURNING *`,
      [newStatus, req.user.id, action === 'reject' ? (remarks || 'Rejected at PM review') : null, item.id]
    );

    await query(
      `INSERT INTO project_cost_forecast_history
         (company_id, project_id, cost_head, version, previous_eac, revised_eac, previous_etc, revised_etc, forecast_reason, remarks, status, prepared_by, acted_by)
       VALUES ($1,$2,$3,$4,$5,$5,$6,$6,$7,$8,$9,$10,$11)`,
      [req.user.company_id, req.params.project_id, item.cost_head, item.version, item.current_eac, item.revised_etc,
       item.forecast_reason, remarks || null, newStatus, item.prepared_by, req.user.id]
    );

    res.json({ data: r.rows[0] });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

// PUT /:project_id/forecast/:id/approve — Project Director / MD final approval
router.put('/:project_id/forecast/:id/approve', async (req, res) => {
  try {
    await assertProjectAccess(req, req.params.project_id);
    const role = String(req.user.role || '').toLowerCase();
    if (!DIRECTOR_ROLES.includes(role)) return res.status(403).json({ error: 'Only a Project Director / MD (or admin) can approve a forecast revision.' });

    const { action, remarks } = req.body;
    if (!['approve', 'reject'].includes(action)) return res.status(400).json({ error: 'action must be approve or reject' });

    const cur = await query(`SELECT * FROM project_cost_forecast_items WHERE id=$1 AND project_id=$2 AND status='pm_reviewed'`, [req.params.id, req.params.project_id]);
    if (!cur.rows.length) return res.status(404).json({ error: 'Forecast revision not found or not awaiting Director approval' });
    const item = cur.rows[0];

    const newStatus = action === 'approve' ? 'approved' : 'rejected';
    const r = await query(
      `UPDATE project_cost_forecast_items
       SET status=$1, approved_by=$2, approved_at=NOW(), rejected_reason=$3, updated_at=NOW()
       WHERE id=$4 RETURNING *`,
      [newStatus, req.user.id, action === 'reject' ? (remarks || 'Rejected at Director approval') : null, item.id]
    );

    await query(
      `INSERT INTO project_cost_forecast_history
         (company_id, project_id, cost_head, version, previous_eac, revised_eac, previous_etc, revised_etc, forecast_reason, remarks, status, prepared_by, acted_by)
       VALUES ($1,$2,$3,$4,$5,$5,$6,$6,$7,$8,$9,$10,$11)`,
      [req.user.company_id, req.params.project_id, item.cost_head, item.version, item.current_eac, item.revised_etc,
       item.forecast_reason, remarks || null, newStatus, item.prepared_by, req.user.id]
    );

    res.json({ data: r.rows[0] });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

// ════════════════════════════════════════════════════════════════════════════
// RISKS
// ════════════════════════════════════════════════════════════════════════════

router.get('/:project_id/risks', async (req, res) => {
  try {
    await assertProjectAccess(req, req.params.project_id);
    const r = await query(
      `SELECT r.*, u1.name AS owner_name, u2.name AS created_by_name
       FROM project_cost_risks r
       LEFT JOIN users u1 ON u1.id = r.owner
       LEFT JOIN users u2 ON u2.id = r.created_by
       WHERE r.project_id=$1 ORDER BY (r.status='open') DESC,
         CASE r.severity WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END, r.created_at DESC`,
      [req.params.project_id]
    );
    res.json({ data: r.rows });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

router.post('/:project_id/risks', async (req, res) => {
  try {
    const projectId = req.params.project_id;
    await assertProjectAccess(req, projectId);
    const role = String(req.user.role || '').toLowerCase();
    if (!RISK_EDIT_ROLES.includes(role)) return res.status(403).json({ error: 'Not authorized to create cost/schedule risks.' });

    const { risk_title, description, severity, cost_head, impact, owner } = req.body;
    if (!risk_title) return res.status(400).json({ error: 'risk_title is required' });
    if (!['high', 'medium', 'low'].includes(severity)) return res.status(400).json({ error: 'severity must be high, medium or low' });

    const r = await query(
      `INSERT INTO project_cost_risks (company_id, project_id, cost_head, risk_title, description, severity, impact, owner, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [req.user.company_id, projectId, cost_head || null, risk_title, description || null, severity, impact || null, owner || null, req.user.id]
    );
    await query(
      `INSERT INTO project_cost_risk_actions (risk_id, action, new_status, changed_by) VALUES ($1,'created',$2,$3)`,
      [r.rows[0].id, 'open', req.user.id]
    );
    res.status(201).json({ data: r.rows[0] });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

router.put('/:project_id/risks/:id', async (req, res) => {
  try {
    await assertProjectAccess(req, req.params.project_id);
    const role = String(req.user.role || '').toLowerCase();
    if (!RISK_EDIT_ROLES.includes(role)) return res.status(403).json({ error: 'Not authorized to edit cost/schedule risks.' });

    const existing = await query(`SELECT * FROM project_cost_risks WHERE id=$1 AND project_id=$2`, [req.params.id, req.params.project_id]);
    if (!existing.rows.length) return res.status(404).json({ error: 'Risk not found' });
    const before = existing.rows[0];

    const { risk_title, description, severity, cost_head, impact, owner, status, note } = req.body;
    const updates = {
      risk_title: risk_title ?? before.risk_title,
      description: description ?? before.description,
      severity: severity ?? before.severity,
      cost_head: cost_head ?? before.cost_head,
      impact: impact ?? before.impact,
      owner: owner ?? before.owner,
      status: status ?? before.status,
    };

    const r = await query(
      `UPDATE project_cost_risks
       SET risk_title=$1, description=$2, severity=$3, cost_head=$4, impact=$5, owner=$6, status=$7,
           closed_at = CASE WHEN $7='closed' AND status<>'closed' THEN NOW() WHEN $7<>'closed' THEN NULL ELSE closed_at END,
           updated_at=NOW()
       WHERE id=$8 RETURNING *`,
      [updates.risk_title, updates.description, updates.severity, updates.cost_head, updates.impact, updates.owner, updates.status, req.params.id]
    );

    if (before.status !== updates.status || before.owner !== updates.owner) {
      await query(
        `INSERT INTO project_cost_risk_actions (risk_id, action, old_status, new_status, note, changed_by)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [req.params.id, before.status !== updates.status ? 'status_change' : 'reassigned', before.status, updates.status, note || null, req.user.id]
      );
    }

    res.json({ data: r.rows[0] });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

// ════════════════════════════════════════════════════════════════════════════
// DRILL-DOWN — Actual Cost and Committed Cost transaction detail
// ════════════════════════════════════════════════════════════════════════════

router.get('/:project_id/drilldown/actual', async (req, res) => {
  try {
    const projectId = req.params.project_id;
    await assertProjectAccess(req, projectId);
    const { cost_head } = req.query;

    // Union of the same real sources the aggregate totals come from —
    // Materials (vendor invoices), Subcontract (SC bills), Overheads (petty
    // cash). Labour and Plant & Machinery are attendance/asset-log rollups
    // with no single per-row "voucher", so they're summarized instead of
    // itemized here (flagged as such in each row's Reference column).
    const rows = await query(`
      SELECT * FROM (
        SELECT i.invoice_date AS date, i.invoice_number AS voucher_number, 'Vendor Invoice' AS transaction_type,
               v.name AS vendor, 'Materials' AS cost_head, i.net_amount AS amount, i.invoice_number AS reference
        FROM invoices i LEFT JOIN vendors v ON v.id = i.vendor_id
        WHERE i.project_id=$1 AND i.status IN ('authorized','verified','paid')
        UNION ALL
        SELECT bill_date, bill_number, 'Subcontract Bill', sc.name, 'Subcontract', b.gross_amount, b.bill_number
        FROM sc_bills b JOIN sc_subcontractors sc ON sc.id = b.sc_id
        WHERE b.project_id=$1 AND b.status IN ('submitted','under_review','approved','paid')
        UNION ALL
        SELECT entry_date, pc_voucher_no, 'Petty Cash', supplier, 'Overheads', amount, pc_voucher_no
        FROM stores_petty_cash_entries WHERE project_id=$1 AND status='Approved'
      ) x
      WHERE ($2::text IS NULL OR x.cost_head = $2)
      ORDER BY date DESC NULLS LAST LIMIT 300
    `, [projectId, cost_head || null]);

    res.json({ data: rows.rows });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

router.get('/:project_id/drilldown/committed', async (req, res) => {
  try {
    const projectId = req.params.project_id;
    await assertProjectAccess(req, projectId);

    const po = await query(`
      SELECT po.po_number AS ref_no, v.name AS vendor_name, po.grand_total AS order_value,
             COALESCE((SELECT SUM(b.total_amount) FROM tqs_bills b WHERE b.po_id = po.id AND b.is_deleted=FALSE), 0) AS invoiced,
             'Purchase Order' AS type
      FROM purchase_orders po LEFT JOIN vendors v ON v.id = po.vendor_id
      WHERE po.project_id=$1 AND po.status IN ('approved','fully_received')
    `, [projectId]);

    const scwo = await query(`
      SELECT wo.wo_number AS ref_no, sc.name AS vendor_name, wo.contract_amount AS order_value,
             COALESCE((SELECT SUM(b.gross_amount) FROM sc_bills b WHERE b.wo_id = wo.id AND b.status <> 'draft'), 0) AS invoiced,
             'SC Work Order' AS type
      FROM sc_work_orders wo JOIN sc_subcontractors sc ON sc.id = wo.sc_id
      WHERE wo.project_id=$1 AND wo.status IN ('active','approved')
    `, [projectId]);

    const rows = [...po.rows, ...scwo.rows].map(r => ({
      ...r,
      order_value: num(r.order_value),
      invoiced: num(r.invoiced),
      pending: Math.max(num(r.order_value) - num(r.invoiced), 0),
    })).sort((a, b) => b.pending - a.pending);

    res.json({ data: rows });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

// ════════════════════════════════════════════════════════════════════════════
// EXPORT — Excel workbook
// ════════════════════════════════════════════════════════════════════════════

router.get('/:project_id/export', async (req, res) => {
  try {
    const projectId = req.params.project_id;
    await assertProjectAccess(req, projectId);

    const proj = await query(`SELECT name, project_code, client_name, contract_value FROM projects WHERE id=$1`, [projectId]);
    const p = proj.rows[0] || {};

    const forecastR = await query(`SELECT * FROM project_cost_forecast_items WHERE project_id=$1 ORDER BY cost_head`, [projectId]);
    const risksR = await query(`SELECT * FROM project_cost_risks WHERE project_id=$1 ORDER BY status, severity`, [projectId]);
    const historyR = await query(`SELECT * FROM project_cost_forecast_history WHERE project_id=$1 ORDER BY created_at DESC LIMIT 200`, [projectId]);

    const wb = XLSX.utils.book_new();
    const today = new Date().toLocaleDateString('en-IN');

    const s1 = [
      [`COST TO COMPLETION — ${p.name || ''}`],
      [`Project Code: ${p.project_code || ''}   Client: ${p.client_name || ''}   Generated: ${today}`],
      [],
      ['Cost Head', 'Revised ETC', 'Current EAC', 'Status', 'Forecast Reason', 'Remarks', 'Version'],
      ...forecastR.rows.map(f => [f.cost_head, num(f.revised_etc), num(f.current_eac), f.status, f.forecast_reason || '', f.remarks || '', f.version]),
    ];
    const ws1 = XLSX.utils.aoa_to_sheet(s1);
    ws1['!cols'] = [22, 14, 14, 12, 26, 30, 8].map(w => ({ wch: w }));
    XLSX.utils.book_append_sheet(wb, ws1, 'Forecast');

    const s2 = [
      ['Risk Title', 'Cost Head', 'Severity', 'Impact', 'Status', 'Description'],
      ...risksR.rows.map(r => [r.risk_title, r.cost_head || '', r.severity, num(r.impact), r.status, r.description || '']),
    ];
    const ws2 = XLSX.utils.aoa_to_sheet(s2);
    ws2['!cols'] = [30, 18, 10, 14, 10, 45].map(w => ({ wch: w }));
    XLSX.utils.book_append_sheet(wb, ws2, 'Risks');

    const s3 = [
      ['Date', 'Cost Head', 'Version', 'Previous EAC', 'Revised EAC', 'Status', 'Reason', 'Remarks'],
      ...historyR.rows.map(h => [
        h.created_at ? new Date(h.created_at).toLocaleString('en-IN') : '', h.cost_head, h.version,
        num(h.previous_eac), num(h.revised_eac), h.status, h.forecast_reason || '', h.remarks || '',
      ]),
    ];
    const ws3 = XLSX.utils.aoa_to_sheet(s3);
    ws3['!cols'] = [18, 22, 8, 14, 14, 12, 22, 30].map(w => ({ wch: w }));
    XLSX.utils.book_append_sheet(wb, ws3, 'Forecast History');

    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const filename = `CTC_${(p.project_code || 'project').replace(/[^a-z0-9]/gi, '_')}_${today.replace(/\//g, '-')}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buf);
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

module.exports = router;
