// src/routes/poAmendment.routes.js
const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const { loadProjectScope, userCanAccessProject } = require('../middleware/projectScope');
const { query } = require('../config/database');
const { runSchemaInit } = require('../utils/schemaInit');

router.use(authenticate);
router.use(loadProjectScope);

function applyProjectScope(req, sqlParts, params, alias = 'po', requestedProjectId = null) {
  if (requestedProjectId && String(requestedProjectId).trim()) {
    if (!userCanAccessProject(req, requestedProjectId)) {
      const err = new Error('Access denied for this project.');
      err.statusCode = 403;
      throw err;
    }
    params.push(requestedProjectId);
    sqlParts.push(`${alias}.project_id = $${params.length}`);
    return;
  }
  if (req.isGlobalRole) return;
  const allowed = req.allowedProjectIds || [];
  if (!allowed.length) {
    sqlParts.push('FALSE');
    return;
  }
  params.push(allowed);
  sqlParts.push(`${alias}.project_id = ANY($${params.length}::uuid[])`);
}

async function getAccessibleAmendment(req, amendmentId) {
  const { rows } = await query(
    `SELECT a.id, po.project_id, p.company_id
     FROM po_amendments a
     JOIN purchase_orders po ON po.id = a.po_id
     JOIN projects p ON p.id = po.project_id
     WHERE a.id = $1 AND a.company_id = $2`,
    [amendmentId, req.user.company_id]
  );
  const amendment = rows[0];
  if (!amendment) {
    const err = new Error('Amendment not found');
    err.statusCode = 404;
    throw err;
  }
  if (!userCanAccessProject(req, amendment.project_id)) {
    const err = new Error('Access denied for this project.');
    err.statusCode = 403;
    throw err;
  }
  return amendment;
}

const ensureSchema = async () => {
  const statements = [
    `CREATE TABLE IF NOT EXISTS po_amendments (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
      po_id UUID REFERENCES purchase_orders(id) ON DELETE CASCADE,
      vendor_id UUID REFERENCES vendors(id),
      amendment_no TEXT NOT NULL,
      amendment_type TEXT NOT NULL,
      description TEXT NOT NULL,
      value_impact NUMERIC(15,2) DEFAULT 0,
      impact_type TEXT NOT NULL DEFAULT 'none' CHECK (impact_type IN ('increase','decrease','none')),
      raised_by TEXT,
      amendment_date DATE,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
      approved_by UUID REFERENCES users(id),
      approved_at TIMESTAMPTZ,
      created_by UUID REFERENCES users(id),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )`,
    `ALTER TABLE po_amendments ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id) ON DELETE CASCADE`,
    `ALTER TABLE po_amendments ADD COLUMN IF NOT EXISTS po_id UUID REFERENCES purchase_orders(id) ON DELETE CASCADE`,
    `ALTER TABLE po_amendments ADD COLUMN IF NOT EXISTS vendor_id UUID REFERENCES vendors(id)`,
    `ALTER TABLE po_amendments ADD COLUMN IF NOT EXISTS amendment_no TEXT`,
    `ALTER TABLE po_amendments ADD COLUMN IF NOT EXISTS amendment_type TEXT`,
    `ALTER TABLE po_amendments ADD COLUMN IF NOT EXISTS description TEXT`,
    `ALTER TABLE po_amendments ADD COLUMN IF NOT EXISTS value_impact NUMERIC(15,2) DEFAULT 0`,
    `ALTER TABLE po_amendments ADD COLUMN IF NOT EXISTS impact_type TEXT DEFAULT 'none'`,
    `ALTER TABLE po_amendments ADD COLUMN IF NOT EXISTS raised_by TEXT`,
    `ALTER TABLE po_amendments ADD COLUMN IF NOT EXISTS amendment_date DATE`,
    `ALTER TABLE po_amendments ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending'`,
    `ALTER TABLE po_amendments ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES users(id)`,
    `ALTER TABLE po_amendments ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ`,
    `ALTER TABLE po_amendments ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id)`,
    `ALTER TABLE po_amendments ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW()`,
    `ALTER TABLE po_amendments ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()`,
  ];

  for (const sql of statements) {
    await query(sql).catch(() => {});
  }
};
runSchemaInit('po_amendments', ensureSchema);

const WRITE_ROLES = ['super_admin', 'admin', 'procurement_manager', 'procurement', 'manager'];
// Editing/deleting an amendment record is restricted to procurement & super admin users
const PROCUREMENT_ROLES = ['super_admin', 'procurement_manager', 'procurement'];

// Debounce: run at most once per 30 s per company to avoid heavy INSERT…SELECT on every request.
const _syncDebounce = new Map();
const SYNC_INTERVAL_MS = 30_000;

const syncAmendedPurchaseOrders = async (companyId) => {
  const last = _syncDebounce.get(companyId) || 0;
  if (Date.now() - last < SYNC_INTERVAL_MS) return;
  _syncDebounce.set(companyId, Date.now());
  await query(`
    INSERT INTO po_amendments (
      company_id, po_id, vendor_id, amendment_no, amendment_type, description,
      value_impact, impact_type, raised_by, amendment_date, status, created_by
    )
    SELECT
      p.company_id,
      po.id,
      po.vendor_id,
      COALESCE(NULLIF(po.po_ref_no, ''), NULLIF(po.serial_no_formatted, ''), po.po_number) AS amendment_no,
      'PO Revision' AS amendment_type,
      'Auto-created from amended purchase order ' ||
        COALESCE(NULLIF(po.po_ref_no, ''), NULLIF(po.serial_no_formatted, ''), po.po_number) AS description,
      ABS(COALESCE(po.grand_total, 0) - COALESCE(base.grand_total, 0)) AS value_impact,
      CASE
        WHEN base.id IS NULL OR COALESCE(po.grand_total, 0) = COALESCE(base.grand_total, 0) THEN 'none'
        WHEN COALESCE(po.grand_total, 0) > COALESCE(base.grand_total, 0) THEN 'increase'
        ELSE 'decrease'
      END AS impact_type,
      COALESCE(u.name, 'System') AS raised_by,
      COALESCE(po.po_date, po.created_at::date) AS amendment_date,
      CASE
        WHEN po.status IN ('approved','sent','part_received','fully_received') THEN 'approved'
        WHEN po.status = 'cancelled' THEN 'rejected'
        ELSE 'pending'
      END AS status,
      po.created_by
    FROM purchase_orders po
    JOIN projects p ON p.id = po.project_id
    LEFT JOIN users u ON u.id = po.created_by
    LEFT JOIN LATERAL (
      SELECT b.id, b.grand_total
      FROM purchase_orders b
      WHERE b.project_id = po.project_id
        AND b.id <> po.id
        AND UPPER(COALESCE(NULLIF(b.po_ref_no, ''), NULLIF(b.serial_no_formatted, ''), b.po_number)) =
            UPPER(REGEXP_REPLACE(COALESCE(NULLIF(po.po_ref_no, ''), NULLIF(po.serial_no_formatted, ''), po.po_number), '-A[0-9]+$', '', 'i'))
      ORDER BY b.created_at DESC
      LIMIT 1
    ) base ON TRUE
    WHERE p.company_id = $1
      AND COALESCE(NULLIF(po.po_ref_no, ''), NULLIF(po.serial_no_formatted, ''), po.po_number) ~* '-A[0-9]+$'
      AND NOT EXISTS (
        SELECT 1 FROM po_amendments a
        WHERE a.company_id = p.company_id
          AND a.po_id = po.id
      )
  `, [companyId]);
};

router.get('/', async (req, res) => {
  try {
    // Fire-and-forget — don't block the response; sync runs at most once per 30 s per company.
    syncAmendedPurchaseOrders(req.user.company_id).catch(e => console.error('[po-amendments] sync error:', e.message));

    const { search, status, amendment_type, project_id } = req.query;
    const params = [req.user.company_id];
    const scopeConditions = [];
    applyProjectScope(req, scopeConditions, params, 'po', project_id);
    let i = params.length + 1;
    let sql = `
      SELECT a.*,
             po.po_number,
             po.po_ref_no,
             po.serial_no_formatted,
             p.name AS project_name,
             v.name AS vendor_name,
             cu.name AS created_by_name,
             au.name AS approved_by_name
      FROM po_amendments a
      JOIN purchase_orders po ON a.po_id = po.id
      JOIN projects p ON po.project_id = p.id
      LEFT JOIN vendors v ON a.vendor_id = v.id
      LEFT JOIN users cu ON a.created_by = cu.id
      LEFT JOIN users au ON a.approved_by = au.id
      WHERE a.company_id = $1
    `;
    if (scopeConditions.length) sql += scopeConditions.map(c => ` AND ${c}`).join('');
    if (status) { sql += ` AND a.status = $${i++}`; params.push(status); }
    if (amendment_type) { sql += ` AND a.amendment_type = $${i++}`; params.push(amendment_type); }
    if (search) {
      sql += ` AND (
        po.po_number ILIKE $${i} OR
        po.serial_no_formatted ILIKE $${i} OR
        po.po_ref_no ILIKE $${i} OR
        COALESCE(v.name,'') ILIKE $${i} OR
        COALESCE(a.amendment_no,'') ILIKE $${i} OR
        COALESCE(a.description,'') ILIKE $${i} OR
        COALESCE(a.raised_by,'') ILIKE $${i}
      )`;
      params.push(`%${search}%`);
      i++;
    }
    sql += ' ORDER BY a.amendment_date DESC NULLS LAST, a.created_at DESC';
    const result = await query(sql, params);
    res.json({ data: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', authorize(...WRITE_ROLES), async (req, res) => {
  try {
    const {
      po_id,
      amendment_type,
      description,
      value_impact = 0,
      impact_type = 'none',
      raised_by = '',
      amendment_date = null,
    } = req.body;

    if (!po_id || !amendment_type || !description) {
      return res.status(400).json({ error: 'po_id, amendment_type and description are required' });
    }

    const poRes = await query(
      `SELECT po.id, po.vendor_id, po.project_id, p.project_code
       FROM purchase_orders po
       JOIN projects p ON po.project_id = p.id
       WHERE po.id = $1 AND p.company_id = $2`,
      [po_id, req.user.company_id]
    );
    if (!poRes.rows.length) {
      return res.status(404).json({ error: 'Purchase Order not found' });
    }
    if (!userCanAccessProject(req, poRes.rows[0].project_id)) {
      return res.status(403).json({ error: 'Access denied for this project.' });
    }

    const countRes = await query(
      `SELECT COALESCE(MAX(CAST(REGEXP_REPLACE(amendment_no, '^.*-', '') AS INTEGER)), 0)::int AS last_seq
       FROM po_amendments WHERE company_id = $1 AND amendment_no ~ '[0-9]+$'`,
      [req.user.company_id]
    );
    const seq = String(countRes.rows[0].last_seq + 1).padStart(3, '0');
    const amendment_no = `AMD-${new Date().getFullYear()}-${seq}`;

    const insertRes = await query(
      `INSERT INTO po_amendments (
        company_id, po_id, vendor_id, amendment_no, amendment_type, description,
        value_impact, impact_type, raised_by, amendment_date, status, created_by
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'pending',$11)
      RETURNING *`,
      [
        req.user.company_id,
        po_id,
        poRes.rows[0].vendor_id,
        amendment_no,
        amendment_type,
        description,
        Number(value_impact) || 0,
        impact_type,
        raised_by,
        amendment_date,
        req.user.id,
      ]
    );

    res.status(201).json({ data: insertRes.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /po-amendments/:id — edit amendment fields; procurement & super admin only, pending amendments only
router.patch('/:id', authorize(...PROCUREMENT_ROLES), async (req, res) => {
  try {
    const amendment = await getAccessibleAmendment(req, req.params.id);
    if (amendment.status !== 'pending') {
      return res.status(400).json({ error: `Cannot edit an amendment at status "${amendment.status}". Only pending amendments can be edited.` });
    }

    const { amendment_type, description, value_impact, impact_type, raised_by, amendment_date } = req.body;
    const sets = [];
    const params = [req.params.id, req.user.company_id];
    let i = 3;

    if (amendment_type  !== undefined) { sets.push(`amendment_type = $${i++}`); params.push(amendment_type); }
    if (description     !== undefined) { sets.push(`description = $${i++}`);    params.push(description); }
    if (value_impact    !== undefined) { sets.push(`value_impact = $${i++}`);    params.push(Number(value_impact) || 0); }
    if (impact_type     !== undefined) { sets.push(`impact_type = $${i++}`);     params.push(impact_type); }
    if (raised_by       !== undefined) { sets.push(`raised_by = $${i++}`);       params.push(raised_by); }
    if (amendment_date  !== undefined) { sets.push(`amendment_date = $${i++}`);  params.push(amendment_date || null); }

    if (!sets.length) return res.status(400).json({ error: 'Nothing to update' });
    sets.push('updated_at = NOW()');

    const r = await query(
      `UPDATE po_amendments SET ${sets.join(', ')} WHERE id = $1 AND company_id = $2 RETURNING *`,
      params
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Amendment not found' });
    res.json({ data: r.rows[0] });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

router.patch('/:id/approve', authorize(...WRITE_ROLES), async (req, res) => {
  try {
    await getAccessibleAmendment(req, req.params.id);
    const r = await query(
      `UPDATE po_amendments
       SET status = 'approved',
           approved_by = $1,
           approved_at = NOW(),
           updated_at = NOW()
       WHERE id = $2 AND company_id = $3
       RETURNING *`,
      [req.user.id, req.params.id, req.user.company_id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Amendment not found' });
    res.json({ data: r.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/:id/reject', authorize(...WRITE_ROLES), async (req, res) => {
  try {
    await getAccessibleAmendment(req, req.params.id);
    const r = await query(
      `UPDATE po_amendments
       SET status = 'rejected',
           updated_at = NOW()
       WHERE id = $1 AND company_id = $2
       RETURNING *`,
      [req.params.id, req.user.company_id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Amendment not found' });
    res.json({ data: r.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', authorize(...PROCUREMENT_ROLES), async (req, res) => {
  try {
    await getAccessibleAmendment(req, req.params.id);
    const r = await query(
      `DELETE FROM po_amendments WHERE id = $1 AND company_id = $2 RETURNING id`,
      [req.params.id, req.user.company_id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Amendment not found' });
    res.json({ message: 'Amendment deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
