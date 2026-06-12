// src/routes/client-advance.routes.js — Client Advance Requests (proforma vouchers submitted to client)
const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const { query, withTransaction } = require('../config/database');
const { runSchemaInit } = require('../utils/schemaInit');
router.use(authenticate);

// Idempotent table creation
const ensureTable = async () => {
  await query(`
    CREATE TABLE IF NOT EXISTS client_advance_requests (
      id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id          UUID,
      project_id          UUID REFERENCES projects(id) ON DELETE CASCADE,
      proforma_no         VARCHAR(100),
      proforma_date       DATE,
      work_description    TEXT,
      hsn_code            VARCHAR(20),
      advance_amount      NUMERIC(15,2) NOT NULL DEFAULT 0,
      advance_pct         NUMERIC(5,2)  DEFAULT 0,
      tax_amount          NUMERIC(15,2) DEFAULT 0,
      total_amount        NUMERIC(15,2) DEFAULT 0,
      status              VARCHAR(20)  DEFAULT 'submitted',
      approved_date       DATE,
      received_date       DATE,
      received_amount     NUMERIC(15,2) DEFAULT 0,
      bank_reference      VARCHAR(200),
      remarks             TEXT,
      created_by          UUID,
      created_at          TIMESTAMPTZ DEFAULT NOW(),
      updated_at          TIMESTAMPTZ DEFAULT NOW()
    )`);
  // idempotent column add for already-created tables
  await query(`ALTER TABLE client_advance_requests ADD COLUMN IF NOT EXISTS hsn_code VARCHAR(20)`);
  // per-payment receipts (client may pay the advance in multiple tranches)
  await query(`
    CREATE TABLE IF NOT EXISTS client_advance_receipts (
      id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      advance_id     UUID NOT NULL REFERENCES client_advance_requests(id) ON DELETE CASCADE,
      amount         NUMERIC(15,2) NOT NULL DEFAULT 0,
      received_date  DATE,
      bank_reference VARCHAR(200),
      remarks        TEXT,
      created_by     UUID,
      created_at     TIMESTAMPTZ DEFAULT NOW()
    )`);
};
runSchemaInit('client_advance_requests', ensureTable);

const nextNo = async (companyId) => {
  const { rows } = await query(
    `SELECT COUNT(*) AS cnt FROM client_advance_requests WHERE company_id = $1`,
    [companyId]
  );
  const n = Number(rows[0].cnt) + 1;
  const yr = new Date().getFullYear();
  return `CAR/${yr}/${String(n).padStart(3, '0')}`;
};

// GET / — list with project name + summary
router.get('/', async (req, res) => {
  try {
    const { project_id, status } = req.query;
    const params = [req.user.company_id];
    let sql = `
      SELECT car.*, p.name AS project_name, p.project_code, u.name AS created_by_name
      FROM client_advance_requests car
      LEFT JOIN projects p ON p.id = car.project_id
      LEFT JOIN users u ON u.id = car.created_by
      WHERE car.company_id = $1`;
    let i = 2;
    if (project_id) { sql += ` AND car.project_id = $${i++}`; params.push(project_id); }
    if (status)     { sql += ` AND car.status = $${i++}`;     params.push(status); }
    sql += ` ORDER BY car.proforma_date DESC NULLS LAST, car.created_at DESC`;
    const { rows } = await query(sql, params);
    res.json({ data: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /stats — totals by status
router.get('/stats', async (req, res) => {
  try {
    const { rows } = await query(`
      SELECT
        COALESCE(SUM(advance_amount),0)                                                   AS total_requested,
        COALESCE(SUM(received_amount),0)                                                   AS total_received,
        COALESCE(SUM(CASE WHEN status <> 'rejected' THEN GREATEST(advance_amount - received_amount,0) ELSE 0 END),0) AS total_pending,
        COUNT(*) FILTER (WHERE status='submitted') AS submitted_count,
        COUNT(*) FILTER (WHERE status='approved')  AS approved_count,
        COUNT(*) FILTER (WHERE status='partial')   AS partial_count,
        COUNT(*) FILTER (WHERE status='received')  AS received_count
      FROM client_advance_requests WHERE company_id = $1`,
      [req.user.company_id]);
    res.json({ data: rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST / — create
router.post('/', authorize('super_admin','admin','finance_manager','accountant','qs_engineer','project_manager'), async (req, res) => {
  try {
    const {
      project_id, proforma_no, proforma_date, work_description, hsn_code,
      advance_amount, advance_pct, tax_amount, status, remarks,
    } = req.body;
    const adv = parseFloat(advance_amount || 0);
    const tax = parseFloat(tax_amount || 0);
    const no = proforma_no || await nextNo(req.user.company_id);
    const st = ['submitted','approved','received','rejected'].includes(status) ? status : 'submitted';
    const { rows } = await query(`
      INSERT INTO client_advance_requests
        (company_id, project_id, proforma_no, proforma_date, work_description, hsn_code,
         advance_amount, advance_pct, tax_amount, total_amount, status, remarks, created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [req.user.company_id, project_id || null, no, proforma_date || null, work_description || null, hsn_code || null,
       adv, parseFloat(advance_pct || 0), tax, adv + tax, st, remarks || null, req.user.id]);
    res.status(201).json({ data: rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /:id — edit core fields
router.put('/:id', authorize('super_admin','admin','finance_manager','accountant','qs_engineer','project_manager'), async (req, res) => {
  try {
    const fields = ['project_id','proforma_no','proforma_date','work_description','hsn_code',
      'advance_amount','advance_pct','tax_amount','remarks','status','approved_date'];
    const updates = []; const params = []; let i = 1;
    for (const f of fields) {
      if (req.body[f] !== undefined) { updates.push(`${f} = $${i++}`); params.push(req.body[f]); }
    }
    // keep total_amount in sync
    if (req.body.advance_amount !== undefined || req.body.tax_amount !== undefined) {
      updates.push(`total_amount = COALESCE(advance_amount,0) + COALESCE(tax_amount,0)`);
    }
    if (!updates.length) return res.status(400).json({ error: 'No fields to update.' });
    params.push(req.params.id, req.user.company_id);
    const { rows } = await query(
      `UPDATE client_advance_requests SET ${updates.join(', ')}, updated_at = NOW()
       WHERE id = $${i++} AND company_id = $${i} RETURNING *`, params);
    if (!rows[0]) return res.status(404).json({ error: 'Not found.' });
    res.json({ data: rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /:id/receive — mark received & roll into project.client_advance_received
router.post('/:id/receive', authorize('super_admin','admin','finance_manager','accountant'), async (req, res) => {
  try {
    const { received_amount, received_date, bank_reference, remarks } = req.body;
    const out = await withTransaction(async (client) => {
      const { rows: [car] } = await client.query(
        `SELECT * FROM client_advance_requests WHERE id = $1 AND company_id = $2`,
        [req.params.id, req.user.company_id]);
      if (!car) throw new Error('Not found.');
      const recv = parseFloat(received_amount || 0);
      if (recv <= 0) throw new Error('Receipt amount must be greater than zero.');
      const dt = received_date || new Date();

      // record this tranche
      await client.query(`
        INSERT INTO client_advance_receipts (advance_id, amount, received_date, bank_reference, remarks, created_by)
        VALUES ($1,$2,$3,$4,$5,$6)`,
        [car.id, recv, dt, bank_reference || null, remarks || null, req.user.id]);

      // new cumulative received
      const newReceived = parseFloat(car.received_amount || 0) + recv;
      const fully = newReceived >= parseFloat(car.advance_amount || 0) - 0.01; // tolerance
      const newStatus = fully ? 'received' : 'partial';

      const { rows: [updated] } = await client.query(`
        UPDATE client_advance_requests
        SET received_amount=$1, received_date=$2, bank_reference=$3, status=$4, updated_at=NOW()
        WHERE id=$5 RETURNING *`,
        [newReceived, dt, bank_reference || car.bank_reference, newStatus, car.id]);

      // roll the tranche into the project's client_advance_received
      if (car.project_id) {
        await client.query(`
          UPDATE projects
          SET client_advance_received = COALESCE(client_advance_received,0) + $1, updated_at=NOW()
          WHERE id = $2`, [recv, car.project_id]);
      }
      return updated;
    });
    res.json({ data: out });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /:id/receipts — payment history for one advance request
router.get('/:id/receipts', async (req, res) => {
  try {
    const { rows } = await query(`
      SELECT r.*, u.name AS created_by_name
      FROM client_advance_receipts r
      LEFT JOIN users u ON u.id = r.created_by
      JOIN client_advance_requests car ON car.id = r.advance_id
      WHERE r.advance_id = $1 AND car.company_id = $2
      ORDER BY r.received_date ASC, r.created_at ASC`,
      [req.params.id, req.user.company_id]);
    res.json({ data: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /:id
router.delete('/:id', authorize('super_admin','admin','finance_manager'), async (req, res) => {
  try {
    const { rowCount } = await query(
      `DELETE FROM client_advance_requests WHERE id = $1 AND company_id = $2`,
      [req.params.id, req.user.company_id]);
    if (!rowCount) return res.status(404).json({ error: 'Not found.' });
    res.json({ message: 'Deleted.' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
