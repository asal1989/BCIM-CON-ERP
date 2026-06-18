// src/routes/retention.routes.js — Retention Release Workflow
const express = require('express');
const router  = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const { query } = require('../config/database');
const { loadProjectScope, appendProjectScope } = require('../middleware/projectScope');

router.use(authenticate);
router.use(loadProjectScope);


// ─── Helpers ─────────────────────────────────────────────────────────────────
async function nextReleaseNumber(company_id) {
  const now  = new Date();
  const fy   = now.getMonth() >= 3
    ? `${String(now.getFullYear()).slice(2)}${String(now.getFullYear() + 1).slice(2)}`
    : `${String(now.getFullYear() - 1).slice(2)}${String(now.getFullYear()).slice(2)}`;

  const r = await query(`
    INSERT INTO retention_release_seq (company_id, fiscal_year, last_number)
    VALUES ($1, $2, 1)
    ON CONFLICT (company_id) DO UPDATE
      SET last_number = CASE
            WHEN retention_release_seq.fiscal_year = $2
            THEN retention_release_seq.last_number + 1
            ELSE 1
          END,
          fiscal_year = $2
    RETURNING last_number
  `, [company_id, fy]);

  const n = String(r.rows[0].last_number).padStart(3, '0');
  return `RR-${fy}-${n}`;
}

// ─── GET /retention-releases/summary ─────────────────────────────────────────
// Per-project retention held vs released — used for KPI cards and project table
router.get('/summary', async (req, res) => {
  try {
    const { project_id } = req.query;
    const cid = req.user.company_id;

    let projectFilter = '';
    let params = [cid];
    if (project_id) {
      projectFilter = 'AND rb.project_id = $2';
      params.push(project_id);
    }

    // Total retention held from certified/paid RA bills
    let heldSql = `
      SELECT
        rb.project_id,
        p.name               AS project_name,
        p.project_code,
        rb.contractor_name,
        SUM(rb.retention_amount)::NUMERIC  AS total_held,
        COUNT(rb.id)::INT                  AS bill_count
      FROM ra_bills rb
      JOIN projects p ON p.id = rb.project_id
      WHERE rb.company_id = $1
        AND rb.status IN ('certified', 'paid')
        ${projectFilter}`;
    ({ sql: heldSql, params } = appendProjectScope(req, heldSql, params, 'rb'));
    heldSql += `
      GROUP BY rb.project_id, p.name, p.project_code, rb.contractor_name
      ORDER BY p.name`;
    const heldRes = await query(heldSql, params);

    // Total released and pending per project
    let params2 = [cid];
    let pf2 = '';
    if (project_id) { pf2 = 'AND project_id = $2'; params2.push(project_id); }

    let relSql = `
      SELECT
        project_id,
        SUM(CASE WHEN status = 'released' THEN release_amount ELSE 0 END)::NUMERIC AS total_released,
        SUM(CASE WHEN status = 'pending'  THEN release_amount ELSE 0 END)::NUMERIC AS pending_approval,
        SUM(CASE WHEN status = 'approved' THEN release_amount ELSE 0 END)::NUMERIC AS approved_pending_payment
      FROM retention_releases
      WHERE company_id = $1 ${pf2}`;
    ({ sql: relSql, params: params2 } = appendProjectScope(req, relSql, params2, 'retention_releases'));
    relSql += ` GROUP BY project_id`;
    const relRes = await query(relSql, params2);

    const relMap = {};
    relRes.rows.forEach(r => { relMap[r.project_id] = r; });

    const rows = heldRes.rows.map(r => {
      const rel = relMap[r.project_id] || {};
      const total_held              = parseFloat(r.total_held || 0);
      const total_released          = parseFloat(rel.total_released || 0);
      const pending_approval        = parseFloat(rel.pending_approval || 0);
      const approved_pending_payment= parseFloat(rel.approved_pending_payment || 0);
      const net_outstanding         = total_held - total_released - pending_approval - approved_pending_payment;
      return {
        project_id:              r.project_id,
        project_name:            r.project_name,
        project_code:            r.project_code,
        contractor_name:         r.contractor_name,
        bill_count:              r.bill_count,
        total_held,
        total_released,
        pending_approval,
        approved_pending_payment,
        net_outstanding,
      };
    });

    // Global KPIs
    const kpi = rows.reduce((acc, r) => {
      acc.total_held               += r.total_held;
      acc.total_released           += r.total_released;
      acc.pending_approval         += r.pending_approval;
      acc.approved_pending_payment += r.approved_pending_payment;
      acc.net_outstanding          += r.net_outstanding;
      return acc;
    }, { total_held: 0, total_released: 0, pending_approval: 0, approved_pending_payment: 0, net_outstanding: 0 });

    res.json({ data: rows, kpi });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /retention-releases ──────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { project_id, status } = req.query;
    const cid = req.user.company_id;

    let sql = `
      SELECT rr.*,
             p.name         AS project_name,
             p.project_code,
             u1.name        AS created_by_name,
             u2.name        AS approved_by_name
      FROM retention_releases rr
      JOIN projects p ON p.id = rr.project_id
      LEFT JOIN users u1 ON u1.id = rr.created_by
      LEFT JOIN users u2 ON u2.id = rr.approved_by
      WHERE rr.company_id = $1
    `;
    let params = [cid];
    let idx = 2;

    if (project_id) { sql += ` AND rr.project_id = $${idx++}`; params.push(project_id); }
    if (status)     { sql += ` AND rr.status = $${idx++}`;     params.push(status); }

    ({ sql, params } = appendProjectScope(req, sql, params, 'rr'));
    sql += ' ORDER BY rr.created_at DESC';
    const result = await query(sql, params);
    res.json({ data: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /retention-releases ─────────────────────────────────────────────────
router.post('/', authorize('super_admin', 'admin', 'qs_engineer', 'project_manager'), async (req, res) => {
  try {
    const {
      project_id, contractor_name, release_date,
      milestone, release_amount, remarks,
    } = req.body;

    if (!project_id || !contractor_name || !release_date || !milestone || !release_amount) {
      return res.status(400).json({ error: 'project_id, contractor_name, release_date, milestone, release_amount are required' });
    }

    // Security: project must belong to company
    const pCheck = await query('SELECT id FROM projects WHERE id = $1 AND company_id = $2', [project_id, req.user.company_id]);
    if (!pCheck.rows.length) return res.status(403).json({ error: 'Access denied' });

    const release_number = await nextReleaseNumber(req.user.company_id);

    const result = await query(`
      INSERT INTO retention_releases
        (company_id, project_id, release_number, contractor_name, release_date,
         milestone, release_amount, remarks, created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      RETURNING *
    `, [
      req.user.company_id, project_id, release_number, contractor_name,
      release_date, milestone, release_amount, remarks || null, req.user.id,
    ]);

    res.status(201).json({ data: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /retention-releases/:id ─────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const result = await query(`
      SELECT rr.*,
             p.name          AS project_name,
             p.project_code,
             u1.name         AS created_by_name,
             u2.name         AS approved_by_name
      FROM retention_releases rr
      JOIN projects p ON p.id = rr.project_id
      LEFT JOIN users u1 ON u1.id = rr.created_by
      LEFT JOIN users u2 ON u2.id = rr.approved_by
      WHERE rr.id = $1 AND rr.company_id = $2
    `, [req.params.id, req.user.company_id]);

    if (!result.rows.length) return res.status(404).json({ error: 'Not found' });

    // Attach RA bills for this project to show retention breakdown
    const bills = await query(`
      SELECT id, bill_number, bill_date, bill_period_from, bill_period_to,
             gross_amount, retention_percent, retention_amount, status
      FROM ra_bills
      WHERE project_id = $1 AND company_id = $2 AND status IN ('certified','paid')
      ORDER BY bill_date
    `, [result.rows[0].project_id, req.user.company_id]);

    res.json({ data: { ...result.rows[0], ra_bills: bills.rows } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── PATCH /retention-releases/:id/approve ───────────────────────────────────
router.patch('/:id/approve', authorize('super_admin', 'admin', 'project_manager'), async (req, res) => {
  try {
    const result = await query(`
      UPDATE retention_releases
      SET status = 'approved', approved_by = $1, approved_at = now(), updated_at = now()
      WHERE id = $2 AND company_id = $3 AND status = 'pending'
      RETURNING *
    `, [req.user.id, req.params.id, req.user.company_id]);

    if (!result.rows.length) return res.status(404).json({ error: 'Release not found or not in pending status' });
    res.json({ data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── PATCH /retention-releases/:id/reject ────────────────────────────────────
router.patch('/:id/reject', authorize('super_admin', 'admin', 'project_manager'), async (req, res) => {
  try {
    const { rejection_remarks } = req.body;
    const result = await query(`
      UPDATE retention_releases
      SET status = 'rejected', rejection_remarks = $1, updated_at = now()
      WHERE id = $2 AND company_id = $3 AND status = 'pending'
      RETURNING *
    `, [rejection_remarks || null, req.params.id, req.user.company_id]);

    if (!result.rows.length) return res.status(404).json({ error: 'Release not found or not in pending status' });
    res.json({ data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── PATCH /retention-releases/:id/release ───────────────────────────────────
// Accountant marks money as paid out
router.patch('/:id/release', authorize('super_admin', 'admin', 'accountant'), async (req, res) => {
  try {
    const { payment_date, payment_ref } = req.body;
    const result = await query(`
      UPDATE retention_releases
      SET status = 'released', payment_date = $1, payment_ref = $2, updated_at = now()
      WHERE id = $3 AND company_id = $4 AND status = 'approved'
      RETURNING *
    `, [payment_date || null, payment_ref || null, req.params.id, req.user.company_id]);

    if (!result.rows.length) return res.status(404).json({ error: 'Release not found or not approved yet' });
    res.json({ data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── DELETE /retention-releases/:id ──────────────────────────────────────────
router.delete('/:id', authorize('super_admin', 'admin', 'qs_engineer'), async (req, res) => {
  try {
    const result = await query(`
      DELETE FROM retention_releases
      WHERE id = $1 AND company_id = $2 AND status = 'pending'
      RETURNING id
    `, [req.params.id, req.user.company_id]);

    if (!result.rows.length) return res.status(404).json({ error: 'Not found or already approved' });
    res.json({ message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
