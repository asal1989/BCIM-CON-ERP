// src/routes/materialRecon.routes.js
const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const { query } = require('../config/database');

router.use(authenticate);

// GET /api/v1/material-recon — list all reconciliation records
router.get('/', async (req, res) => {
  try {
    const { project_id } = req.query;
    let sql = `SELECT mr.*, p.name as project_name
               FROM material_reconciliation mr
               JOIN projects p ON mr.project_id = p.id
               WHERE p.company_id = $1`;
    const params = [req.user.company_id];
    let idx = 2;

    if (project_id) {
      sql += ` AND mr.project_id = $${idx++}`;
      params.push(project_id);
    }

    sql += ' ORDER BY mr.created_at DESC';
    const result = await query(sql, params);

    // Enrich with wastage calculations
    const enriched = result.rows.map(r => {
      const issued = parseFloat(r.actual_issued_qty || 0);
      const theoretical = parseFloat(r.theoretical_qty || 0);
      const consumed = issued; // actual consumed = issued (simplified; adjust if separate tracking exists)
      const wastage = issued - theoretical;
      const wastagePct = theoretical > 0 ? ((wastage / theoretical) * 100) : 0;
      const closingStock = 0; // Would come from inventory module

      return {
        ...r,
        issued_qty: issued,
        actual_consumed: consumed,
        wastage_actual: Math.max(0, wastage),
        wastage_actual_pct: Math.max(0, wastagePct),
        wastage_allowed_pct: parseFloat(r.consumption_factor || 5), // default 5% allowable wastage
        closing_stock: closingStock,
      };
    });

    res.json(enriched);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/v1/material-recon — create a reconciliation entry
router.post('/', authorize('super_admin', 'admin', 'qs_engineer', 'project_manager'), async (req, res) => {
  try {
    const {
      project_id, ra_bill_id, material_name, unit, boq_item_id,
      executed_qty, consumption_factor, theoretical_qty,
      actual_issued_qty, unit_rate, remarks
    } = req.body;

    const variance = parseFloat(actual_issued_qty || 0) - parseFloat(theoretical_qty || 0);
    const recovery_amount = variance > 0 ? (variance * parseFloat(unit_rate || 0)) : 0;

    const result = await query(
      `INSERT INTO material_reconciliation 
       (project_id, ra_bill_id, material_name, unit, boq_item_id,
        executed_qty, consumption_factor, theoretical_qty,
        actual_issued_qty, variance, unit_rate, recovery_amount, remarks, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'pending')
       RETURNING *`,
      [project_id, ra_bill_id, material_name, unit, boq_item_id,
       executed_qty, consumption_factor, theoretical_qty,
       actual_issued_qty, variance.toFixed(3), unit_rate || 0,
       recovery_amount.toFixed(2), remarks]
    );

    res.status(201).json({ data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/v1/material-recon/summary/:project_id — aggregated view
router.get('/summary/:project_id', async (req, res) => {
  try {
    const result = await query(
      `SELECT material_name, unit,
              SUM(theoretical_qty) as total_theoretical,
              SUM(actual_issued_qty) as total_issued,
              SUM(variance) as total_variance,
              SUM(recovery_amount) as total_recovery
       FROM material_reconciliation
       WHERE project_id = $1
       GROUP BY material_name, unit
       ORDER BY material_name`,
      [req.params.project_id]
    );
    res.json({ data: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/v1/material-recon/audit/:project_id — Automated Theoretical Auditor
router.get('/audit/:project_id', async (req, res) => {
  try {
    const { project_id } = req.params;

    // 1. Work-done quantities: prefer pm_approved measurements (works even before first certified bill)
    //    Fall back to certified RA bill items if no measurements exist.
    const measureRes = await query(
      `SELECT boq_item_id, SUM(net_quantity) AS total_qty
       FROM measurements
       WHERE project_id = $1 AND status IN ('pm_approved','qs_approved','approved')
       GROUP BY boq_item_id`,
      [project_id]
    );
    let workDoneRows = measureRes.rows;

    if (workDoneRows.length === 0) {
      const billRes = await query(
        `SELECT boq_item_id, SUM(current_qty) AS total_qty
         FROM ra_bill_items bi
         JOIN ra_bills b ON bi.ra_bill_id = b.id
         WHERE b.project_id = $1 AND b.status IN ('certified','paid')
         GROUP BY boq_item_id`,
        [project_id]
      );
      workDoneRows = billRes.rows;
    }

    const has_work_done = workDoneRows.length > 0;

    // 2. Consumption norms for this project
    const normsRes = await query(
      `SELECT n.*, b.description AS boq_description
       FROM consumption_norms n
       JOIN boq_items b ON n.boq_item_id = b.id
       WHERE b.project_id = $1`,
      [project_id]
    );
    const norms = normsRes.rows;
    const has_norms = norms.length > 0;

    // 3. Theoretical consumption from work done × norms
    const theoreticsMap = {};
    workDoneRows.forEach(wd => {
      const itemNorms = norms.filter(n => n.boq_item_id === wd.boq_item_id);
      itemNorms.forEach(norm => {
        if (!theoreticsMap[norm.material_name]) {
          theoreticsMap[norm.material_name] = {
            theoretical: 0,
            unit: norm.unit,
            allowed_wastage_pct: norm.allowed_wastage_pct,
            recovery_rate: parseFloat(norm.recovery_rate || 0),
          };
        }
        theoreticsMap[norm.material_name].theoretical += parseFloat(wd.total_qty) * parseFloat(norm.norm_quantity);
      });
    });

    // 4. Actual issues from store (MIN)
    const issuesRes = await query(
      `SELECT material_name, SUM(quantity_issued) AS total_issued, unit
       FROM min_items mi
       JOIN material_issue_notes m ON mi.min_id = m.id
       WHERE m.project_id = $1 AND m.status = 'issued'
       GROUP BY material_name, unit`,
      [project_id]
    );
    const has_issues = issuesRes.rows.length > 0;

    // 5. Previously recovered to avoid double recovery
    const prevRecoveredRes = await query(
      `SELECT SUM(COALESCE(material_recovery_cement, 0) + COALESCE(material_recovery_steel, 0)) AS recovered
       FROM ra_bills
       WHERE project_id = $1 AND status IN ('submitted','qs_review','pm_approval','accounts_verify','certified','paid')`,
      [project_id]
    );
    const totalPreviouslyRecovered = parseFloat(prevRecoveredRes.rows[0].recovered || 0);

    // 6. Build reconciled report
    const report = issuesRes.rows.map(issue => {
      const theo = theoreticsMap[issue.material_name] || { theoretical: 0, allowed_wastage_pct: 5, recovery_rate: 0 };
      const theoretical = theo.theoretical;
      const actual = parseFloat(issue.total_issued);
      const variance = actual - theoretical;
      const variance_pct = theoretical > 0 ? (variance / theoretical * 100) : 100;
      const allowed_wastage = theoretical * (theo.allowed_wastage_pct / 100);
      const excess_wastage = Math.max(0, variance - allowed_wastage);
      const suggested_recovery = excess_wastage * theo.recovery_rate;

      return {
        material_name: issue.material_name,
        unit: issue.unit,
        theoretical_qty: theoretical,
        actual_issued_qty: actual,
        variance,
        variance_pct,
        allowed_wastage_pct: theo.allowed_wastage_pct,
        excess_wastage,
        recovery_rate: theo.recovery_rate,
        suggested_recovery,
        status: variance_pct > (theo.allowed_wastage_pct * 1.5) ? 'critical' : (variance_pct > theo.allowed_wastage_pct ? 'warning' : 'ok'),
      };
    });

    const totalSuggestedRecovery = report.reduce((sum, r) => sum + r.suggested_recovery, 0);
    const netRecoveryDue = Math.max(0, totalSuggestedRecovery - totalPreviouslyRecovered);

    // Diagnostic reason — tells the frontend WHY net_recovery_due is 0
    let reason = null;
    if (netRecoveryDue === 0) {
      if (!has_norms)        reason = 'No consumption norms configured for this project. Set them up in Settings → Norms.';
      else if (!has_issues)  reason = 'No material issues (MINs) recorded for this project. Issue materials from store first.';
      else if (!has_work_done) reason = 'No approved measurements found. Approve measurement books first.';
      else                   reason = 'No excess material usage detected — contractor is within allowed wastage limits.';
    }

    res.json({
      data: report,
      summary: {
        total_suggested_recovery: totalSuggestedRecovery,
        previously_recovered: totalPreviouslyRecovered,
        net_recovery_due: netRecoveryDue,
        has_norms,
        has_issues,
        has_work_done,
        reason,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
