// compliance-tracker.routes.js — Statutory & Legal Compliance Tracker
// Mounted at /api/v1/compliance-tracker
//
// Tracks recurring/one-time statutory obligations (PF, PT, LWF, CLRA, BOCW,
// Shop Act, WC Policy, Rental Agreements, Vehicle Insurance, Labour
// Licences, etc.) per Project/HO, with the full due/paid/penalty/delay
// trail the user asked to be "properly recorded and monitored until
// closure". Feeds the weekly Monday email (see
// utils/compliance-weekly-report.service.js).
'use strict';
const express = require('express');
const router  = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const { query } = require('../config/database');
const { runSchemaInit } = require('../utils/schemaInit');

const ROLES = ['super_admin', 'admin', 'hr', 'hr_admin', 'hr_manager'];

router.use(authenticate);
router.use(authorize(...ROLES));

const CATEGORIES = [
  'Shop & Establishment Registration',
  'PF Compliance',
  'Professional Tax',
  'Workmen Compensation Policy',
  'CLRA Licence',
  'BOCW Registration/Licence',
  'Labour Welfare Fund',
  'Rental Agreements',
  'Vehicle Insurance',
  'Labour Licence and other labour registrations',
  'Other HR/Admin Statutory Compliance',
];

runSchemaInit('compliance-tracker-tables-v1', async () => {
  await query(`
    CREATE TABLE IF NOT EXISTS compliance_obligations (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id UUID NOT NULL,
      project_id UUID REFERENCES projects(id),
      category TEXT NOT NULL,
      title TEXT NOT NULL,
      frequency TEXT NOT NULL DEFAULT 'Monthly' CHECK (frequency IN ('Monthly','Annual','One-time')),
      responsible_person TEXT,
      legal_reference TEXT,
      active BOOLEAN NOT NULL DEFAULT true,
      created_by UUID REFERENCES users(id),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS compliance_entries (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      obligation_id UUID NOT NULL REFERENCES compliance_obligations(id) ON DELETE CASCADE,
      company_id UUID NOT NULL,
      period TEXT,
      due_date DATE,
      actual_payment_date DATE,
      due_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
      amount_paid NUMERIC(14,2) NOT NULL DEFAULT 0,
      outstanding_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
      penalty_interest NUMERIC(14,2) NOT NULL DEFAULT 0,
      damages_charges NUMERIC(14,2) NOT NULL DEFAULT 0,
      delay_days INT,
      validity_expiry_date DATE,
      status TEXT NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending','Paid','Overdue','Closed','Not Applicable')),
      reason_for_delay TEXT,
      action_required TEXT,
      responsible_person TEXT,
      created_by UUID REFERENCES users(id),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_compliance_obligations_company ON compliance_obligations(company_id, project_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_compliance_entries_obligation ON compliance_entries(obligation_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_compliance_entries_company ON compliance_entries(company_id, status, due_date)`);
});

const n = (v) => Math.round((parseFloat(v) || 0) * 100) / 100;

// Auto-flip Pending -> Overdue for anything past due, and (re)compute
// outstanding/delay so the tracker never silently drifts stale.
function deriveEntry({ due_date, actual_payment_date, due_amount, amount_paid, status }) {
  const dueAmt = n(due_amount);
  const paidAmt = n(amount_paid);
  const outstanding = n(dueAmt - paidAmt);
  let delayDays = null;
  if (due_date) {
    const due = new Date(due_date);
    const ref = actual_payment_date ? new Date(actual_payment_date) : new Date();
    delayDays = Math.round((ref - due) / 86400000);
    if (delayDays < 0) delayDays = 0;
  }
  let finalStatus = status;
  if (status !== 'Closed' && status !== 'Not Applicable') {
    if (outstanding <= 0.5 && due_amount !== undefined) finalStatus = 'Paid';
    else if (due_date && new Date(due_date) < new Date() && outstanding > 0.5) finalStatus = 'Overdue';
    else if (!finalStatus) finalStatus = 'Pending';
  }
  return { outstanding, delayDays, finalStatus };
}

// ── Categories ───────────────────────────────────────────────────────────
router.get('/categories', (req, res) => res.json({ data: CATEGORIES }));

// ── Obligations (master list) ───────────────────────────────────────────
router.get('/obligations', async (req, res) => {
  try {
    const { project_id } = req.query;
    const params = [req.user.company_id];
    let where = 'o.company_id = $1 AND o.active = TRUE';
    if (project_id === 'HO') { where += ' AND o.project_id IS NULL'; }
    else if (project_id) { params.push(project_id); where += ` AND o.project_id = $${params.length}`; }
    const { rows } = await query(
      `SELECT o.*, p.name AS project_name
       FROM compliance_obligations o
       LEFT JOIN projects p ON p.id = o.project_id
       WHERE ${where}
       ORDER BY p.name NULLS FIRST, o.category`,
      params
    );
    res.json({ data: rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/obligations', async (req, res) => {
  try {
    const { project_id, category, title, frequency, responsible_person, legal_reference } = req.body;
    if (!category || !title) return res.status(400).json({ error: 'category and title are required' });
    const { rows } = await query(
      `INSERT INTO compliance_obligations
         (company_id, project_id, category, title, frequency, responsible_person, legal_reference, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [req.user.company_id, project_id || null, category, title, frequency || 'Monthly',
       responsible_person || null, legal_reference || null, req.user.id]
    );
    res.status(201).json({ data: rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/obligations/:id', async (req, res) => {
  try {
    const { category, title, frequency, responsible_person, legal_reference, active } = req.body;
    const { rows } = await query(
      `UPDATE compliance_obligations SET
         category=COALESCE($1,category), title=COALESCE($2,title), frequency=COALESCE($3,frequency),
         responsible_person=COALESCE($4,responsible_person), legal_reference=COALESCE($5,legal_reference),
         active=COALESCE($6,active), updated_at=NOW()
       WHERE id=$7 AND company_id=$8 RETURNING *`,
      [category, title, frequency, responsible_person, legal_reference, active, req.params.id, req.user.company_id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json({ data: rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/obligations/:id', async (req, res) => {
  try {
    await query(`UPDATE compliance_obligations SET active=FALSE, updated_at=NOW() WHERE id=$1 AND company_id=$2`,
      [req.params.id, req.user.company_id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Entries (per-period occurrences carrying the 13 tracked fields) ──────
router.get('/entries', async (req, res) => {
  try {
    const { project_id, status, category } = req.query;
    const params = [req.user.company_id];
    let where = 'e.company_id = $1';
    if (project_id === 'HO') where += ' AND o.project_id IS NULL';
    else if (project_id) { params.push(project_id); where += ` AND o.project_id = $${params.length}`; }
    if (status) { params.push(status); where += ` AND e.status = $${params.length}`; }
    if (category) { params.push(category); where += ` AND o.category = $${params.length}`; }
    const { rows } = await query(
      `SELECT e.*, o.category, o.title AS obligation_title, o.project_id, o.frequency,
              p.name AS project_name
       FROM compliance_entries e
       JOIN compliance_obligations o ON o.id = e.obligation_id
       LEFT JOIN projects p ON p.id = o.project_id
       WHERE ${where}
       ORDER BY e.due_date NULLS LAST`,
      params
    );
    res.json({ data: rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/entries', async (req, res) => {
  try {
    const {
      obligation_id, period, due_date, actual_payment_date, due_amount, amount_paid,
      penalty_interest, damages_charges, validity_expiry_date, status,
      reason_for_delay, action_required, responsible_person,
    } = req.body;
    if (!obligation_id) return res.status(400).json({ error: 'obligation_id is required' });

    const ob = await query(`SELECT id FROM compliance_obligations WHERE id=$1 AND company_id=$2`,
      [obligation_id, req.user.company_id]);
    if (!ob.rows.length) return res.status(404).json({ error: 'Obligation not found' });

    const { outstanding, delayDays, finalStatus } = deriveEntry({
      due_date, actual_payment_date, due_amount, amount_paid, status,
    });

    const { rows } = await query(
      `INSERT INTO compliance_entries
         (obligation_id, company_id, period, due_date, actual_payment_date, due_amount, amount_paid,
          outstanding_amount, penalty_interest, damages_charges, delay_days, validity_expiry_date,
          status, reason_for_delay, action_required, responsible_person, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING *`,
      [obligation_id, req.user.company_id, period || null, due_date || null, actual_payment_date || null,
       n(due_amount), n(amount_paid), outstanding, n(penalty_interest), n(damages_charges), delayDays,
       validity_expiry_date || null, finalStatus, reason_for_delay || null, action_required || null,
       responsible_person || null, req.user.id]
    );
    res.status(201).json({ data: rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/entries/:id', async (req, res) => {
  try {
    const cur = await query(`SELECT * FROM compliance_entries WHERE id=$1 AND company_id=$2`,
      [req.params.id, req.user.company_id]);
    if (!cur.rows.length) return res.status(404).json({ error: 'Not found' });
    const existing = cur.rows[0];

    const merged = {
      due_date: req.body.due_date !== undefined ? req.body.due_date : existing.due_date,
      actual_payment_date: req.body.actual_payment_date !== undefined ? req.body.actual_payment_date : existing.actual_payment_date,
      due_amount: req.body.due_amount !== undefined ? req.body.due_amount : existing.due_amount,
      amount_paid: req.body.amount_paid !== undefined ? req.body.amount_paid : existing.amount_paid,
      status: req.body.status !== undefined ? req.body.status : existing.status,
    };
    const { outstanding, delayDays, finalStatus } = deriveEntry(merged);

    const { rows } = await query(
      `UPDATE compliance_entries SET
         period=COALESCE($1,period), due_date=$2, actual_payment_date=$3,
         due_amount=$4, amount_paid=$5, outstanding_amount=$6,
         penalty_interest=COALESCE($7,penalty_interest), damages_charges=COALESCE($8,damages_charges),
         delay_days=$9, validity_expiry_date=COALESCE($10,validity_expiry_date),
         status=$11, reason_for_delay=COALESCE($12,reason_for_delay),
         action_required=COALESCE($13,action_required), responsible_person=COALESCE($14,responsible_person),
         updated_at=NOW()
       WHERE id=$15 AND company_id=$16 RETURNING *`,
      [req.body.period, merged.due_date, merged.actual_payment_date, n(merged.due_amount), n(merged.amount_paid),
       outstanding, req.body.penalty_interest !== undefined ? n(req.body.penalty_interest) : undefined,
       req.body.damages_charges !== undefined ? n(req.body.damages_charges) : undefined,
       delayDays, req.body.validity_expiry_date, finalStatus, req.body.reason_for_delay,
       req.body.action_required, req.body.responsible_person, req.params.id, req.user.company_id]
    );
    res.json({ data: rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/entries/:id', async (req, res) => {
  try {
    await query(`DELETE FROM compliance_entries WHERE id=$1 AND company_id=$2`, [req.params.id, req.user.company_id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Dashboard summary — outstanding total, overdue count, upcoming 30 days
router.get('/summary', async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT
         COUNT(*) FILTER (WHERE e.status = 'Overdue')                                  AS overdue_count,
         COALESCE(SUM(e.outstanding_amount) FILTER (WHERE e.status IN ('Pending','Overdue')), 0) AS total_outstanding,
         COALESCE(SUM(e.penalty_interest + e.damages_charges) FILTER (WHERE e.status <> 'Closed'), 0) AS total_penalty_damages,
         COUNT(*) FILTER (WHERE e.due_date BETWEEN CURRENT_DATE AND CURRENT_DATE + 30 AND e.status IN ('Pending','Overdue')) AS due_in_30_days
       FROM compliance_entries e
       WHERE e.company_id = $1`,
      [req.user.company_id]
    );
    res.json({ data: rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Weekly report config + manual trigger ─────────────────────────────────
router.get('/report-config', async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT * FROM compliance_report_configs WHERE company_id=$1 ORDER BY created_at`,
      [req.user.company_id]
    );
    res.json({ data: rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/report-config', async (req, res) => {
  try {
    const { recipients, enabled = true } = req.body;
    if (!recipients) return res.status(400).json({ error: 'recipients is required' });
    const { rows } = await query(
      `INSERT INTO compliance_report_configs (company_id, recipients, enabled) VALUES ($1,$2,$3) RETURNING *`,
      [req.user.company_id, recipients, enabled]
    );
    res.status(201).json({ data: rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/report-config/:id', async (req, res) => {
  try {
    const { recipients, enabled } = req.body;
    const { rows } = await query(
      `UPDATE compliance_report_configs SET recipients=COALESCE($1,recipients), enabled=COALESCE($2,enabled), updated_at=NOW()
       WHERE id=$3 AND company_id=$4 RETURNING *`,
      [recipients, enabled, req.params.id, req.user.company_id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json({ data: rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/report-config/:id', async (req, res) => {
  try {
    await query(`DELETE FROM compliance_report_configs WHERE id=$1 AND company_id=$2`, [req.params.id, req.user.company_id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/report-config/send-now', async (req, res) => {
  try {
    const { runComplianceWeeklyReport } = require('../utils/compliance-weekly-report.service');
    const result = await runComplianceWeeklyReport({ manual: true, company_id: req.user.company_id });
    res.json({ data: result });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
