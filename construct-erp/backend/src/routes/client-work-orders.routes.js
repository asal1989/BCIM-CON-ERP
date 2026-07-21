// client-work-orders.routes.js — Client Work Orders received from clients
const express = require('express');
const router  = express.Router();
const { authenticate } = require('../middleware/auth');
const { query, withTransaction } = require('../config/database');
const { loadProjectScope } = require('../middleware/projectScope');
const { logAudit } = require('../utils/auditLog');

// ── Schema bootstrap ──────────────────────────────────────────────────────────
;(async () => {
  await query(`
    CREATE TABLE IF NOT EXISTS client_work_orders (
      id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id           UUID NOT NULL,
      project_id           UUID REFERENCES projects(id),
      client_name          VARCHAR(300),
      wo_number            VARCHAR(100),
      wo_date              DATE,
      title                VARCHAR(500) NOT NULL,
      description          TEXT,
      scope                TEXT,
      contract_value       NUMERIC(15,2) DEFAULT 0,
      gst_percentage       NUMERIC(5,2)  DEFAULT 18,
      retention_percentage NUMERIC(5,2)  DEFAULT 0,
      status               VARCHAR(20)   DEFAULT 'active',
      notes                TEXT,
      created_by           UUID REFERENCES users(id),
      created_at           TIMESTAMPTZ DEFAULT NOW(),
      updated_at           TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS client_wo_amendments (
      id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      wo_id                   UUID NOT NULL REFERENCES client_work_orders(id) ON DELETE CASCADE,
      company_id              UUID NOT NULL,
      amendment_number        INTEGER,
      amendment_date          DATE,
      description             TEXT NOT NULL,
      amount_change           NUMERIC(15,2) DEFAULT 0,
      revised_contract_value  NUMERIC(15,2),
      created_by              UUID REFERENCES users(id),
      created_at              TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  // Link RA bills optionally to a client WO
  await query(`ALTER TABLE ra_bills ADD COLUMN IF NOT EXISTS client_wo_id UUID REFERENCES client_work_orders(id)`);
})().catch(e => console.error('[client-wo] schema init error:', e.message));

router.use(authenticate);
router.use(loadProjectScope);

const inr2 = v => Number(v || 0);

// ── List ──────────────────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { project_id, status } = req.query;
    const company_id = req.user.company_id;
    const conditions = ['cwo.company_id = $1'];
    const params = [company_id];
    let idx = 2;
    if (project_id) { conditions.push(`cwo.project_id = $${idx++}`); params.push(project_id); }
    if (status)     { conditions.push(`cwo.status = $${idx++}`);     params.push(status); }
    const where = conditions.join(' AND ');

    const { rows } = await query(`
      SELECT
        cwo.*,
        p.name        AS project_name,
        p.project_code,
        -- amendment-adjusted contract value
        COALESCE((
          SELECT revised_contract_value
          FROM client_wo_amendments
          WHERE wo_id = cwo.id
          ORDER BY created_at DESC LIMIT 1
        ), cwo.contract_value) AS current_contract_value,
        -- billed amount from linked RA bills
        COALESCE((
          SELECT SUM(rb.net_amount)
          FROM ra_bills rb
          WHERE rb.client_wo_id = cwo.id AND rb.status NOT IN ('rejected')
        ), 0) AS billed_amount,
        -- amendment count
        (SELECT COUNT(*) FROM client_wo_amendments WHERE wo_id = cwo.id) AS amendment_count,
        u.name AS created_by_name
      FROM client_work_orders cwo
      LEFT JOIN projects p ON p.id = cwo.project_id
      LEFT JOIN users u    ON u.id = cwo.created_by
      WHERE ${where}
      ORDER BY cwo.created_at DESC
    `, params);

    res.json({ data: rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Create ────────────────────────────────────────────────────────────────────
router.post('/', async (req, res) => {
  try {
    const company_id = req.user.company_id;
    const {
      project_id, client_name, wo_number, wo_date, title,
      description, scope, contract_value, gst_percentage,
      retention_percentage, status, notes,
    } = req.body;
    if (!title?.trim()) return res.status(400).json({ error: 'Title is required' });

    const { rows } = await query(`
      INSERT INTO client_work_orders
        (company_id, project_id, client_name, wo_number, wo_date, title,
         description, scope, contract_value, gst_percentage, retention_percentage,
         status, notes, created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
      [
        company_id, project_id || null, client_name?.trim() || null,
        wo_number?.trim() || null, wo_date || null, title.trim(),
        description?.trim() || null, scope?.trim() || null,
        inr2(contract_value), inr2(gst_percentage) || 18,
        inr2(retention_percentage), status || 'active',
        notes?.trim() || null, req.user.id,
      ]
    );
    await logAudit(req, 'client_work_orders', rows[0].id, 'create', null, rows[0]);
    res.status(201).json({ data: rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Get one ───────────────────────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const company_id = req.user.company_id;
    const { rows } = await query(`
      SELECT cwo.*, p.name AS project_name, p.project_code, u.name AS created_by_name
      FROM client_work_orders cwo
      LEFT JOIN projects p ON p.id = cwo.project_id
      LEFT JOIN users u    ON u.id = cwo.created_by
      WHERE cwo.id = $1 AND cwo.company_id = $2`, [req.params.id, company_id]);
    if (!rows.length) return res.status(404).json({ error: 'Work order not found' });

    const [amends, bills] = await Promise.all([
      query(`SELECT a.*, u.name AS created_by_name FROM client_wo_amendments a
             LEFT JOIN users u ON u.id = a.created_by
             WHERE a.wo_id = $1 ORDER BY a.amendment_number`, [req.params.id]),
      query(`SELECT rb.id, rb.bill_number, rb.bill_date, rb.net_amount, rb.status, rb.period_to
             FROM ra_bills rb WHERE rb.client_wo_id = $1 AND rb.status != 'rejected'
             ORDER BY rb.bill_date DESC`, [req.params.id]),
    ]);

    res.json({ data: { ...rows[0], amendments: amends.rows, ra_bills: bills.rows } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Update ────────────────────────────────────────────────────────────────────
router.put('/:id', async (req, res) => {
  try {
    const company_id = req.user.company_id;
    const {
      project_id, client_name, wo_number, wo_date, title,
      description, scope, contract_value, gst_percentage,
      retention_percentage, status, notes,
    } = req.body;
    const { rows: old } = await query(
      `SELECT * FROM client_work_orders WHERE id=$1 AND company_id=$2`, [req.params.id, company_id]);
    if (!old.length) return res.status(404).json({ error: 'Not found' });

    const { rows } = await query(`
      UPDATE client_work_orders SET
        project_id=$2, client_name=$3, wo_number=$4, wo_date=$5, title=$6,
        description=$7, scope=$8, contract_value=$9, gst_percentage=$10,
        retention_percentage=$11, status=$12, notes=$13, updated_at=NOW()
      WHERE id=$1 AND company_id=$14 RETURNING *`,
      [
        req.params.id, project_id || null, client_name?.trim() || null,
        wo_number?.trim() || null, wo_date || null, title.trim(),
        description?.trim() || null, scope?.trim() || null,
        inr2(contract_value), inr2(gst_percentage) || 18,
        inr2(retention_percentage), status || 'active',
        notes?.trim() || null, company_id,
      ]
    );
    await logAudit(req, 'client_work_orders', req.params.id, 'update', old[0], rows[0]);
    res.json({ data: rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Delete ────────────────────────────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    const company_id = req.user.company_id;
    const { rows } = await query(
      `SELECT status FROM client_work_orders WHERE id=$1 AND company_id=$2`, [req.params.id, company_id]);
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    await query(`DELETE FROM client_work_orders WHERE id=$1 AND company_id=$2`, [req.params.id, company_id]);
    res.json({ message: 'Deleted' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Add amendment ─────────────────────────────────────────────────────────────
router.post('/:id/amendments', async (req, res) => {
  try {
    const company_id = req.user.company_id;
    const { description, amount_change, amendment_date } = req.body;
    if (!description?.trim()) return res.status(400).json({ error: 'Description required' });

    const { rows: wo } = await query(
      `SELECT * FROM client_work_orders WHERE id=$1 AND company_id=$2`, [req.params.id, company_id]);
    if (!wo.length) return res.status(404).json({ error: 'Work order not found' });

    // Auto-increment amendment number
    const { rows: last } = await query(
      `SELECT MAX(amendment_number) AS mx FROM client_wo_amendments WHERE wo_id=$1`, [req.params.id]);
    const amendNum = (last[0].mx || 0) + 1;

    // Last revised value (or original)
    const { rows: prev } = await query(
      `SELECT revised_contract_value FROM client_wo_amendments WHERE wo_id=$1 ORDER BY created_at DESC LIMIT 1`,
      [req.params.id]);
    const baseValue = prev.length ? Number(prev[0].revised_contract_value) : Number(wo[0].contract_value);
    const revised = baseValue + Number(amount_change || 0);

    const { rows } = await query(`
      INSERT INTO client_wo_amendments
        (wo_id, company_id, amendment_number, amendment_date, description, amount_change, revised_contract_value, created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [req.params.id, company_id, amendNum, amendment_date || null, description.trim(),
       Number(amount_change || 0), revised, req.user.id]
    );
    res.status(201).json({ data: rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Delete amendment ──────────────────────────────────────────────────────────
router.delete('/:id/amendments/:aid', async (req, res) => {
  try {
    const company_id = req.user.company_id;
    await query(
      `DELETE FROM client_wo_amendments WHERE id=$1 AND wo_id=$2 AND company_id=$3`,
      [req.params.aid, req.params.id, company_id]);
    res.json({ message: 'Deleted' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
