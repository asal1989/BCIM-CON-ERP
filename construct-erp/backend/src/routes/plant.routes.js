// src/routes/plant.routes.js
// Plant & Machinery Module — Masters, Asset Register, Hire In/Out,
// Deployment & Utilisation, Fuel, Maintenance, Operators, Compliance,
// Cost Allocation, Reports & Dashboard.
//
// Self-contained: ensures its own schema on first load (idempotent).

const express = require('express');
const router  = express.Router();
const dayjs   = require('dayjs');
const { query, withTransaction, pool } = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');

router.use(authenticate);

const CID = (req) => req.user.company_id;
const n   = (v) => (v === '' || v == null || isNaN(Number(v)) ? 0 : Number(v));
const adminRoles = ['super_admin', 'admin', 'managing_director'];

// ───────────────────────────────────────────────────────────────────────────
// SCHEMA BOOTSTRAP (idempotent — runs once at module load)
// ───────────────────────────────────────────────────────────────────────────
const SCHEMA = `
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS pm_equipment_categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL,
  name VARCHAR(150) NOT NULL,
  description TEXT,
  is_deleted BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pm_manufacturers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL,
  name VARCHAR(200) NOT NULL,
  type VARCHAR(30) DEFAULT 'manufacturer',  -- manufacturer / supplier
  contact_person VARCHAR(120),
  phone VARCHAR(20),
  email VARCHAR(120),
  address TEXT,
  is_deleted BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pm_fuel_types (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL,
  name VARCHAR(80) NOT NULL,
  uom VARCHAR(20) DEFAULT 'litre',
  is_deleted BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pm_maintenance_vendors (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL,
  name VARCHAR(200) NOT NULL,
  specialisation VARCHAR(150),
  contact_person VARCHAR(120),
  phone VARCHAR(20),
  email VARCHAR(120),
  address TEXT,
  is_deleted BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pm_document_types (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL,
  name VARCHAR(120) NOT NULL,   -- RC, Insurance, PUC, Fitness Certificate
  is_deleted BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pm_operators (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL,
  name VARCHAR(150) NOT NULL,
  license_no VARCHAR(80),
  license_expiry DATE,
  contact VARCHAR(20),
  status VARCHAR(20) DEFAULT 'active',  -- active/inactive
  is_deleted BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pm_equipment (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL,
  code VARCHAR(30),
  name VARCHAR(200) NOT NULL,
  category_id UUID REFERENCES pm_equipment_categories(id),
  type VARCHAR(10) DEFAULT 'own',  -- own / hired
  manufacturer_id UUID REFERENCES pm_manufacturers(id),
  make VARCHAR(120),
  model VARCHAR(120),
  year INT,
  capacity VARCHAR(80),
  uom VARCHAR(40),
  reg_number VARCHAR(40),
  purchase_date DATE,
  purchase_value NUMERIC(15,2) DEFAULT 0,
  useful_life_years INT DEFAULT 10,
  salvage_value NUMERIC(15,2) DEFAULT 0,
  status VARCHAR(20) DEFAULT 'active',  -- active/idle/maintenance/disposed
  current_site_id UUID REFERENCES projects(id),
  remarks TEXT,
  is_deleted BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pm_equipment_documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL,
  equipment_id UUID NOT NULL REFERENCES pm_equipment(id) ON DELETE CASCADE,
  document_type VARCHAR(120),
  doc_number VARCHAR(120),
  issue_date DATE,
  expiry_date DATE,
  file_path TEXT,
  is_deleted BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pm_depreciation (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL,
  equipment_id UUID NOT NULL REFERENCES pm_equipment(id) ON DELETE CASCADE,
  year INT NOT NULL,
  opening_value NUMERIC(15,2) DEFAULT 0,
  depreciation_amount NUMERIC(15,2) DEFAULT 0,
  closing_value NUMERIC(15,2) DEFAULT 0
);

CREATE TABLE IF NOT EXISTS pm_transfers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL,
  equipment_id UUID NOT NULL REFERENCES pm_equipment(id) ON DELETE CASCADE,
  from_site_id UUID REFERENCES projects(id),
  to_site_id UUID REFERENCES projects(id),
  transfer_date DATE NOT NULL DEFAULT CURRENT_DATE,
  reason TEXT,
  created_by UUID,
  is_deleted BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pm_disposals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL,
  equipment_id UUID NOT NULL REFERENCES pm_equipment(id) ON DELETE CASCADE,
  disposal_type VARCHAR(30) DEFAULT 'sale',  -- sale / scrap / writeoff
  disposal_date DATE NOT NULL DEFAULT CURRENT_DATE,
  book_value NUMERIC(15,2) DEFAULT 0,
  sale_value NUMERIC(15,2) DEFAULT 0,
  reason TEXT,
  created_by UUID,
  is_deleted BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pm_hire_in_orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL,
  order_no VARCHAR(40),
  equipment_id UUID REFERENCES pm_equipment(id),
  equipment_desc VARCHAR(200),
  vendor_id UUID,
  vendor_name VARCHAR(200),
  project_id UUID REFERENCES projects(id),
  hire_rate NUMERIC(15,2) DEFAULT 0,
  rate_type VARCHAR(20) DEFAULT 'daily',  -- hourly/daily/monthly
  start_date DATE,
  end_date DATE,
  status VARCHAR(20) DEFAULT 'requested',  -- requested/ordered/deployed/returned/invoiced
  remarks TEXT,
  is_deleted BOOLEAN DEFAULT false,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pm_hire_out_orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL,
  order_no VARCHAR(40),
  equipment_id UUID REFERENCES pm_equipment(id),
  client_name VARCHAR(200),
  project_id UUID REFERENCES projects(id),
  hire_rate NUMERIC(15,2) DEFAULT 0,
  rate_type VARCHAR(20) DEFAULT 'daily',
  start_date DATE,
  end_date DATE,
  status VARCHAR(20) DEFAULT 'requested',  -- requested/ordered/returned/invoiced
  remarks TEXT,
  is_deleted BOOLEAN DEFAULT false,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pm_deployment (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL,
  equipment_id UUID NOT NULL REFERENCES pm_equipment(id),
  project_id UUID REFERENCES projects(id),
  operator_id UUID REFERENCES pm_operators(id),
  deployment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  start_time TIME,
  end_time TIME,
  hours_worked NUMERIC(8,2) DEFAULT 0,
  idle_hours NUMERIC(8,2) DEFAULT 0,
  remarks TEXT,
  is_deleted BOOLEAN DEFAULT false,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pm_fuel_issues (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL,
  equipment_id UUID NOT NULL REFERENCES pm_equipment(id),
  project_id UUID REFERENCES projects(id),
  issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
  fuel_type_id UUID REFERENCES pm_fuel_types(id),
  quantity NUMERIC(12,2) DEFAULT 0,
  rate NUMERIC(12,2) DEFAULT 0,
  amount NUMERIC(15,2) DEFAULT 0,
  current_reading NUMERIC(15,2),
  issued_by VARCHAR(150),
  remarks TEXT,
  is_deleted BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pm_maintenance_schedule (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL,
  equipment_id UUID NOT NULL REFERENCES pm_equipment(id),
  maintenance_type VARCHAR(20) DEFAULT 'PPM',  -- PPM / breakdown
  description TEXT,
  due_date DATE,
  interval_days INT,
  interval_hours INT,
  last_done_date DATE,
  reported_by VARCHAR(150),
  status VARCHAR(20) DEFAULT 'scheduled',  -- scheduled/due/in_progress/completed
  is_deleted BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pm_work_orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL,
  wo_number VARCHAR(40),
  equipment_id UUID NOT NULL REFERENCES pm_equipment(id),
  maintenance_schedule_id UUID REFERENCES pm_maintenance_schedule(id),
  vendor_id UUID REFERENCES pm_maintenance_vendors(id),
  wo_date DATE NOT NULL DEFAULT CURRENT_DATE,
  description TEXT,
  estimated_cost NUMERIC(15,2) DEFAULT 0,
  actual_cost NUMERIC(15,2) DEFAULT 0,
  status VARCHAR(20) DEFAULT 'open',  -- open/in_progress/completed
  completion_date DATE,
  downtime_hours NUMERIC(10,2) DEFAULT 0,
  is_deleted BOOLEAN DEFAULT false,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pm_spare_parts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL,
  work_order_id UUID NOT NULL REFERENCES pm_work_orders(id) ON DELETE CASCADE,
  item_name VARCHAR(200) NOT NULL,
  quantity NUMERIC(12,2) DEFAULT 0,
  unit VARCHAR(30),
  rate NUMERIC(12,2) DEFAULT 0,
  amount NUMERIC(15,2) DEFAULT 0
);

CREATE TABLE IF NOT EXISTS pm_amc_contracts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL,
  equipment_id UUID NOT NULL REFERENCES pm_equipment(id),
  vendor_id UUID REFERENCES pm_maintenance_vendors(id),
  start_date DATE,
  end_date DATE,
  scope TEXT,
  annual_cost NUMERIC(15,2) DEFAULT 0,
  status VARCHAR(20) DEFAULT 'active',
  is_deleted BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pm_cost_allocation (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL,
  equipment_id UUID NOT NULL REFERENCES pm_equipment(id),
  project_id UUID REFERENCES projects(id),
  month INT,
  year INT,
  hours_used NUMERIC(12,2) DEFAULT 0,
  rate_per_hour NUMERIC(12,2) DEFAULT 0,
  total_cost NUMERIC(15,2) DEFAULT 0,
  cost_type VARCHAR(10) DEFAULT 'own',  -- own / hired
  is_deleted BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pm_equipment_company ON pm_equipment(company_id);
CREATE INDEX IF NOT EXISTS idx_pm_deployment_equip ON pm_deployment(equipment_id);
CREATE INDEX IF NOT EXISTS idx_pm_fuel_equip ON pm_fuel_issues(equipment_id);
CREATE INDEX IF NOT EXISTS idx_pm_wo_equip ON pm_work_orders(equipment_id);
CREATE INDEX IF NOT EXISTS idx_pm_docs_equip ON pm_equipment_documents(equipment_id);
`;

let schemaReady = false;
async function ensureSchema() {
  if (schemaReady) return;
  const client = await pool.connect();
  try {
    await client.query(SCHEMA);
    schemaReady = true;
  } finally {
    client.release();
  }
}
ensureSchema().catch((e) => console.warn('⚠️  P&M schema bootstrap warning:', e.message));

// Make sure schema exists before any request is served
router.use(async (req, res, next) => {
  try { await ensureSchema(); next(); }
  catch (e) { res.status(500).json({ error: 'Schema init failed: ' + e.message }); }
});

// ───────────────────────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────────────────────
async function nextSeq(table, column, prefix, withYear = false) {
  // Generates EQ-001 / WO-2024-001 / HIN-2024-001 style sequential codes.
  const yr = dayjs().format('YYYY');
  const like = withYear ? `${prefix}-${yr}-%` : `${prefix}-%`;
  const r = await query(
    `SELECT ${column} AS c FROM ${table}
     WHERE ${column} LIKE $1 ORDER BY ${column} DESC LIMIT 1`, [like]);
  let next = 1;
  if (r.rows.length && r.rows[0].c) {
    const m = String(r.rows[0].c).match(/(\d+)$/);
    if (m) next = parseInt(m[1], 10) + 1;
  }
  const num = String(next).padStart(3, '0');
  return withYear ? `${prefix}-${yr}-${num}` : `${prefix}-${num}`;
}

// Generic soft-delete master CRUD factory
function masterCrud(path, table, fields, opts = {}) {
  const cols = fields.map((f) => f.name);

  router.get(path, async (req, res) => {
    try {
      const r = await query(
        `SELECT * FROM ${table} WHERE company_id=$1 AND is_deleted=false ORDER BY created_at DESC`,
        [CID(req)]);
      res.json({ data: r.rows });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.post(path, async (req, res) => {
    try {
      const vals = cols.map((c) => {
        const f = fields.find((x) => x.name === c);
        let v = req.body[c];
        if (v === undefined || v === '') v = f.default !== undefined ? f.default : null;
        return v;
      });
      const placeholders = cols.map((_, i) => `$${i + 2}`).join(',');
      const r = await query(
        `INSERT INTO ${table} (company_id, ${cols.join(',')})
         VALUES ($1, ${placeholders}) RETURNING *`,
        [CID(req), ...vals]);
      res.status(201).json({ data: r.rows[0] });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.put(`${path}/:id`, async (req, res) => {
    try {
      const sets = cols.map((c, i) => `${c}=$${i + 1}`).join(',');
      const vals = cols.map((c) => {
        let v = req.body[c];
        if (v === undefined || v === '') v = null;
        return v;
      });
      const r = await query(
        `UPDATE ${table} SET ${sets}
         WHERE id=$${cols.length + 1} AND company_id=$${cols.length + 2} RETURNING *`,
        [...vals, req.params.id, CID(req)]);
      if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
      res.json({ data: r.rows[0] });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.delete(`${path}/:id`, async (req, res) => {
    try {
      await query(`UPDATE ${table} SET is_deleted=true WHERE id=$1 AND company_id=$2`,
        [req.params.id, CID(req)]);
      res.json({ message: 'Deleted' });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
}

// ───────────────────────────────────────────────────────────────────────────
// 1. MASTERS
// ───────────────────────────────────────────────────────────────────────────
masterCrud('/categories', 'pm_equipment_categories', [
  { name: 'name' }, { name: 'description' },
]);
masterCrud('/manufacturers', 'pm_manufacturers', [
  { name: 'name' }, { name: 'type', default: 'manufacturer' },
  { name: 'contact_person' }, { name: 'phone' }, { name: 'email' }, { name: 'address' },
]);
masterCrud('/fuel-types', 'pm_fuel_types', [
  { name: 'name' }, { name: 'uom', default: 'litre' },
]);
masterCrud('/maintenance-vendors', 'pm_maintenance_vendors', [
  { name: 'name' }, { name: 'specialisation' }, { name: 'contact_person' },
  { name: 'phone' }, { name: 'email' }, { name: 'address' },
]);
masterCrud('/document-types', 'pm_document_types', [
  { name: 'name' },
]);
masterCrud('/operators', 'pm_operators', [
  { name: 'name' }, { name: 'license_no' }, { name: 'license_expiry' },
  { name: 'contact' }, { name: 'status', default: 'active' },
]);

// ───────────────────────────────────────────────────────────────────────────
// 2. EQUIPMENT / ASSET REGISTER
// ───────────────────────────────────────────────────────────────────────────
const EQUIP_FIELDS = [
  'name', 'category_id', 'type', 'manufacturer_id', 'make', 'model', 'year',
  'capacity', 'uom', 'reg_number', 'purchase_date', 'purchase_value',
  'useful_life_years', 'salvage_value', 'status', 'current_site_id', 'remarks',
];

router.get('/equipment', async (req, res) => {
  try {
    const { status, category_id, type, q } = req.query;
    let sql = `
      SELECT e.*, c.name AS category_name, m.name AS manufacturer_name,
             p.name AS current_site_name
      FROM pm_equipment e
      LEFT JOIN pm_equipment_categories c ON c.id = e.category_id
      LEFT JOIN pm_manufacturers m ON m.id = e.manufacturer_id
      LEFT JOIN projects p ON p.id = e.current_site_id
      WHERE e.company_id=$1 AND e.is_deleted=false`;
    const params = [CID(req)]; let i = 2;
    if (status)      { sql += ` AND e.status=$${i++}`; params.push(status); }
    if (category_id) { sql += ` AND e.category_id=$${i++}`; params.push(category_id); }
    if (type)        { sql += ` AND e.type=$${i++}`; params.push(type); }
    if (q)           { sql += ` AND (e.name ILIKE $${i} OR e.code ILIKE $${i} OR e.reg_number ILIKE $${i})`; params.push(`%${q}%`); i++; }
    sql += ' ORDER BY e.code';
    res.json({ data: (await query(sql, params)).rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/equipment/:id([0-9a-fA-F-]{36})', async (req, res) => {
  try {
    const r = await query(`
      SELECT e.*, c.name AS category_name, m.name AS manufacturer_name,
             p.name AS current_site_name
      FROM pm_equipment e
      LEFT JOIN pm_equipment_categories c ON c.id = e.category_id
      LEFT JOIN pm_manufacturers m ON m.id = e.manufacturer_id
      LEFT JOIN projects p ON p.id = e.current_site_id
      WHERE e.id=$1 AND e.company_id=$2 AND e.is_deleted=false`,
      [req.params.id, CID(req)]);
    if (!r.rows.length) return res.status(404).json({ error: 'Equipment not found' });
    const docs = await query(`SELECT * FROM pm_equipment_documents WHERE equipment_id=$1 AND is_deleted=false ORDER BY expiry_date NULLS LAST`, [req.params.id]);
    const dep  = await query(`SELECT * FROM pm_depreciation WHERE equipment_id=$1 ORDER BY year`, [req.params.id]);
    res.json({ data: { ...r.rows[0], documents: docs.rows, depreciation: dep.rows } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// auto-calc straight-line depreciation schedule
async function buildDepreciation(client, companyId, equipmentId, eq) {
  await client.query(`DELETE FROM pm_depreciation WHERE equipment_id=$1`, [equipmentId]);
  const cost = n(eq.purchase_value);
  const salvage = n(eq.salvage_value);
  const life = Math.max(1, parseInt(eq.useful_life_years) || 1);
  if (cost <= 0) return;
  const annual = (cost - salvage) / life;
  const baseYear = eq.purchase_date ? dayjs(eq.purchase_date).year() : dayjs().year();
  let opening = cost;
  for (let y = 0; y < life; y++) {
    const closing = Math.max(salvage, opening - annual);
    await client.query(
      `INSERT INTO pm_depreciation (company_id, equipment_id, year, opening_value, depreciation_amount, closing_value)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [companyId, equipmentId, baseYear + y, opening.toFixed(2), annual.toFixed(2), closing.toFixed(2)]);
    opening = closing;
  }
}

router.post('/equipment', async (req, res) => {
  try {
    const code = req.body.code || await nextSeq('pm_equipment', 'code', 'EQ');
    const result = await withTransaction(async (client) => {
      const vals = EQUIP_FIELDS.map((f) => {
        let v = req.body[f];
        if (v === undefined || v === '') v = null;
        return v;
      });
      const cols = ['code', ...EQUIP_FIELDS];
      const allVals = [code, ...vals];
      const placeholders = cols.map((_, i) => `$${i + 2}`).join(',');
      const r = await client.query(
        `INSERT INTO pm_equipment (company_id, ${cols.join(',')})
         VALUES ($1, ${placeholders}) RETURNING *`,
        [CID(req), ...allVals]);
      const eq = r.rows[0];
      if (n(eq.purchase_value) > 0) await buildDepreciation(client, CID(req), eq.id, eq);
      return eq;
    });
    res.status(201).json({ data: result });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/equipment/:id([0-9a-fA-F-]{36})', async (req, res) => {
  try {
    const result = await withTransaction(async (client) => {
      const sets = EQUIP_FIELDS.map((c, i) => `${c}=$${i + 1}`).join(',');
      const vals = EQUIP_FIELDS.map((c) => {
        let v = req.body[c];
        if (v === undefined || v === '') v = null;
        return v;
      });
      const r = await client.query(
        `UPDATE pm_equipment SET ${sets}, updated_at=NOW()
         WHERE id=$${EQUIP_FIELDS.length + 1} AND company_id=$${EQUIP_FIELDS.length + 2} RETURNING *`,
        [...vals, req.params.id, CID(req)]);
      if (!r.rows.length) return null;
      const eq = r.rows[0];
      if (n(eq.purchase_value) > 0) await buildDepreciation(client, CID(req), eq.id, eq);
      return eq;
    });
    if (!result) return res.status(404).json({ error: 'Equipment not found' });
    res.json({ data: result });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/equipment/:id([0-9a-fA-F-]{36})', async (req, res) => {
  try {
    await query(`UPDATE pm_equipment SET is_deleted=true WHERE id=$1 AND company_id=$2`,
      [req.params.id, CID(req)]);
    res.json({ message: 'Deleted' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Equipment Documents
router.post('/equipment/:id([0-9a-fA-F-]{36})/documents', async (req, res) => {
  try {
    const { document_type, doc_number, issue_date, expiry_date, file_path } = req.body;
    const r = await query(
      `INSERT INTO pm_equipment_documents (company_id, equipment_id, document_type, doc_number, issue_date, expiry_date, file_path)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [CID(req), req.params.id, document_type || null, doc_number || null,
       issue_date || null, expiry_date || null, file_path || null]);
    res.status(201).json({ data: r.rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/documents/:id([0-9a-fA-F-]{36})', async (req, res) => {
  try {
    await query(`UPDATE pm_equipment_documents SET is_deleted=true WHERE id=$1 AND company_id=$2`,
      [req.params.id, CID(req)]);
    res.json({ message: 'Deleted' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Transfers
router.get('/transfers', async (req, res) => {
  try {
    const r = await query(`
      SELECT t.*, e.code AS equipment_code, e.name AS equipment_name,
             fp.name AS from_site_name, tp.name AS to_site_name
      FROM pm_transfers t
      JOIN pm_equipment e ON e.id = t.equipment_id
      LEFT JOIN projects fp ON fp.id = t.from_site_id
      LEFT JOIN projects tp ON tp.id = t.to_site_id
      WHERE t.company_id=$1 AND t.is_deleted=false ORDER BY t.transfer_date DESC`,
      [CID(req)]);
    res.json({ data: r.rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/transfers', async (req, res) => {
  try {
    const { equipment_id, from_site_id, to_site_id, transfer_date, reason } = req.body;
    const result = await withTransaction(async (client) => {
      const r = await client.query(
        `INSERT INTO pm_transfers (company_id, equipment_id, from_site_id, to_site_id, transfer_date, reason, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
        [CID(req), equipment_id, from_site_id || null, to_site_id || null,
         transfer_date || new Date(), reason || null, req.user.id]);
      await client.query(`UPDATE pm_equipment SET current_site_id=$1, updated_at=NOW() WHERE id=$2 AND company_id=$3`,
        [to_site_id || null, equipment_id, CID(req)]);
      return r.rows[0];
    });
    res.status(201).json({ data: result });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Disposals
router.get('/disposals', async (req, res) => {
  try {
    const r = await query(`
      SELECT d.*, e.code AS equipment_code, e.name AS equipment_name
      FROM pm_disposals d
      JOIN pm_equipment e ON e.id = d.equipment_id
      WHERE d.company_id=$1 AND d.is_deleted=false ORDER BY d.disposal_date DESC`,
      [CID(req)]);
    res.json({ data: r.rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/disposals', async (req, res) => {
  try {
    const { equipment_id, disposal_type, disposal_date, book_value, sale_value, reason } = req.body;
    const result = await withTransaction(async (client) => {
      const r = await client.query(
        `INSERT INTO pm_disposals (company_id, equipment_id, disposal_type, disposal_date, book_value, sale_value, reason, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
        [CID(req), equipment_id, disposal_type || 'sale', disposal_date || new Date(),
         n(book_value), n(sale_value), reason || null, req.user.id]);
      await client.query(`UPDATE pm_equipment SET status='disposed', updated_at=NOW() WHERE id=$1 AND company_id=$2`,
        [equipment_id, CID(req)]);
      return r.rows[0];
    });
    res.status(201).json({ data: result });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ───────────────────────────────────────────────────────────────────────────
// 3. HIRE MANAGEMENT
// ───────────────────────────────────────────────────────────────────────────
router.get('/hire-in', async (req, res) => {
  try {
    const r = await query(`
      SELECT h.*, e.code AS equipment_code, e.name AS equipment_name, p.name AS project_name
      FROM pm_hire_in_orders h
      LEFT JOIN pm_equipment e ON e.id = h.equipment_id
      LEFT JOIN projects p ON p.id = h.project_id
      WHERE h.company_id=$1 AND h.is_deleted=false ORDER BY h.created_at DESC`,
      [CID(req)]);
    res.json({ data: r.rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/hire-in', async (req, res) => {
  try {
    const order_no = req.body.order_no || await nextSeq('pm_hire_in_orders', 'order_no', 'HIN', true);
    const b = req.body;
    const r = await query(
      `INSERT INTO pm_hire_in_orders
       (company_id, order_no, equipment_id, equipment_desc, vendor_id, vendor_name, project_id,
        hire_rate, rate_type, start_date, end_date, status, remarks, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
      [CID(req), order_no, b.equipment_id || null, b.equipment_desc || null,
       b.vendor_id || null, b.vendor_name || null, b.project_id || null,
       n(b.hire_rate), b.rate_type || 'daily', b.start_date || null, b.end_date || null,
       b.status || 'requested', b.remarks || null, req.user.id]);
    res.status(201).json({ data: r.rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/hire-in/:id([0-9a-fA-F-]{36})', async (req, res) => {
  try {
    const b = req.body;
    const r = await query(
      `UPDATE pm_hire_in_orders SET
        equipment_id=$1, equipment_desc=$2, vendor_id=$3, vendor_name=$4, project_id=$5,
        hire_rate=$6, rate_type=$7, start_date=$8, end_date=$9, status=$10, remarks=$11, updated_at=NOW()
       WHERE id=$12 AND company_id=$13 RETURNING *`,
      [b.equipment_id || null, b.equipment_desc || null, b.vendor_id || null, b.vendor_name || null,
       b.project_id || null, n(b.hire_rate), b.rate_type || 'daily', b.start_date || null,
       b.end_date || null, b.status || 'requested', b.remarks || null, req.params.id, CID(req)]);
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json({ data: r.rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/hire-in/:id([0-9a-fA-F-]{36})', async (req, res) => {
  try {
    await query(`UPDATE pm_hire_in_orders SET is_deleted=true WHERE id=$1 AND company_id=$2`, [req.params.id, CID(req)]);
    res.json({ message: 'Deleted' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/hire-out', async (req, res) => {
  try {
    const r = await query(`
      SELECT h.*, e.code AS equipment_code, e.name AS equipment_name, p.name AS project_name
      FROM pm_hire_out_orders h
      LEFT JOIN pm_equipment e ON e.id = h.equipment_id
      LEFT JOIN projects p ON p.id = h.project_id
      WHERE h.company_id=$1 AND h.is_deleted=false ORDER BY h.created_at DESC`,
      [CID(req)]);
    res.json({ data: r.rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/hire-out', async (req, res) => {
  try {
    const order_no = req.body.order_no || await nextSeq('pm_hire_out_orders', 'order_no', 'HOUT', true);
    const b = req.body;
    const r = await query(
      `INSERT INTO pm_hire_out_orders
       (company_id, order_no, equipment_id, client_name, project_id, hire_rate, rate_type,
        start_date, end_date, status, remarks, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [CID(req), order_no, b.equipment_id || null, b.client_name || null, b.project_id || null,
       n(b.hire_rate), b.rate_type || 'daily', b.start_date || null, b.end_date || null,
       b.status || 'requested', b.remarks || null, req.user.id]);
    res.status(201).json({ data: r.rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/hire-out/:id([0-9a-fA-F-]{36})', async (req, res) => {
  try {
    const b = req.body;
    const r = await query(
      `UPDATE pm_hire_out_orders SET
        equipment_id=$1, client_name=$2, project_id=$3, hire_rate=$4, rate_type=$5,
        start_date=$6, end_date=$7, status=$8, remarks=$9, updated_at=NOW()
       WHERE id=$10 AND company_id=$11 RETURNING *`,
      [b.equipment_id || null, b.client_name || null, b.project_id || null, n(b.hire_rate),
       b.rate_type || 'daily', b.start_date || null, b.end_date || null, b.status || 'requested',
       b.remarks || null, req.params.id, CID(req)]);
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json({ data: r.rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/hire-out/:id([0-9a-fA-F-]{36})', async (req, res) => {
  try {
    await query(`UPDATE pm_hire_out_orders SET is_deleted=true WHERE id=$1 AND company_id=$2`, [req.params.id, CID(req)]);
    res.json({ message: 'Deleted' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ───────────────────────────────────────────────────────────────────────────
// 4. DEPLOYMENT & UTILISATION
// ───────────────────────────────────────────────────────────────────────────
router.get('/deployment', async (req, res) => {
  try {
    const { equipment_id, project_id, from, to } = req.query;
    let sql = `
      SELECT d.*, e.code AS equipment_code, e.name AS equipment_name,
             p.name AS project_name, o.name AS operator_name
      FROM pm_deployment d
      JOIN pm_equipment e ON e.id = d.equipment_id
      LEFT JOIN projects p ON p.id = d.project_id
      LEFT JOIN pm_operators o ON o.id = d.operator_id
      WHERE d.company_id=$1 AND d.is_deleted=false`;
    const params = [CID(req)]; let i = 2;
    if (equipment_id) { sql += ` AND d.equipment_id=$${i++}`; params.push(equipment_id); }
    if (project_id)   { sql += ` AND d.project_id=$${i++}`; params.push(project_id); }
    if (from)         { sql += ` AND d.deployment_date>=$${i++}`; params.push(from); }
    if (to)           { sql += ` AND d.deployment_date<=$${i++}`; params.push(to); }
    sql += ' ORDER BY d.deployment_date DESC';
    res.json({ data: (await query(sql, params)).rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/deployment', async (req, res) => {
  try {
    const b = req.body;
    let hours = n(b.hours_worked);
    if (!hours && b.start_time && b.end_time) {
      const s = dayjs(`2000-01-01T${b.start_time}`);
      const e = dayjs(`2000-01-01T${b.end_time}`);
      hours = Math.max(0, e.diff(s, 'minute') / 60);
    }
    const r = await query(
      `INSERT INTO pm_deployment
       (company_id, equipment_id, project_id, operator_id, deployment_date, start_time, end_time, hours_worked, idle_hours, remarks, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [CID(req), b.equipment_id, b.project_id || null, b.operator_id || null,
       b.deployment_date || new Date(), b.start_time || null, b.end_time || null,
       hours, n(b.idle_hours), b.remarks || null, req.user.id]);
    res.status(201).json({ data: r.rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/deployment/:id([0-9a-fA-F-]{36})', async (req, res) => {
  try {
    await query(`UPDATE pm_deployment SET is_deleted=true WHERE id=$1 AND company_id=$2`, [req.params.id, CID(req)]);
    res.json({ message: 'Deleted' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ───────────────────────────────────────────────────────────────────────────
// 5. FUEL MANAGEMENT
// ───────────────────────────────────────────────────────────────────────────
router.get('/fuel', async (req, res) => {
  try {
    const { equipment_id } = req.query;
    let sql = `
      SELECT f.*, e.code AS equipment_code, e.name AS equipment_name,
             ft.name AS fuel_type_name, p.name AS project_name
      FROM pm_fuel_issues f
      JOIN pm_equipment e ON e.id = f.equipment_id
      LEFT JOIN pm_fuel_types ft ON ft.id = f.fuel_type_id
      LEFT JOIN projects p ON p.id = f.project_id
      WHERE f.company_id=$1 AND f.is_deleted=false`;
    const params = [CID(req)]; let i = 2;
    if (equipment_id) { sql += ` AND f.equipment_id=$${i++}`; params.push(equipment_id); }
    sql += ' ORDER BY f.issue_date DESC';
    res.json({ data: (await query(sql, params)).rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/fuel', async (req, res) => {
  try {
    const b = req.body;
    const amount = n(b.amount) || (n(b.quantity) * n(b.rate));
    const r = await query(
      `INSERT INTO pm_fuel_issues
       (company_id, equipment_id, project_id, issue_date, fuel_type_id, quantity, rate, amount, current_reading, issued_by, remarks)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [CID(req), b.equipment_id, b.project_id || null, b.issue_date || new Date(),
       b.fuel_type_id || null, n(b.quantity), n(b.rate), amount,
       b.current_reading != null && b.current_reading !== '' ? n(b.current_reading) : null,
       b.issued_by || req.user.name, b.remarks || null]);
    res.status(201).json({ data: r.rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/fuel/:id([0-9a-fA-F-]{36})', async (req, res) => {
  try {
    await query(`UPDATE pm_fuel_issues SET is_deleted=true WHERE id=$1 AND company_id=$2`, [req.params.id, CID(req)]);
    res.json({ message: 'Deleted' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Mileage / running-hour analysis
router.get('/fuel/analysis', async (req, res) => {
  try {
    const r = await query(`
      SELECT e.id, e.code, e.name,
        COALESCE(SUM(f.quantity),0) AS total_fuel,
        COALESCE(SUM(f.amount),0)   AS total_fuel_cost,
        COALESCE((SELECT SUM(hours_worked) FROM pm_deployment d WHERE d.equipment_id=e.id AND d.is_deleted=false),0) AS total_hours
      FROM pm_equipment e
      LEFT JOIN pm_fuel_issues f ON f.equipment_id=e.id AND f.is_deleted=false
      WHERE e.company_id=$1 AND e.is_deleted=false
      GROUP BY e.id, e.code, e.name
      ORDER BY e.code`, [CID(req)]);
    const data = r.rows.map((x) => ({
      ...x,
      fuel_per_hour: n(x.total_hours) > 0 ? (n(x.total_fuel) / n(x.total_hours)).toFixed(2) : null,
    }));
    res.json({ data });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ───────────────────────────────────────────────────────────────────────────
// 6. MAINTENANCE & REPAIRS
// ───────────────────────────────────────────────────────────────────────────
function calcNextDue(lastDate, intervalDays) {
  if (!lastDate || !intervalDays) return null;
  return dayjs(lastDate).add(parseInt(intervalDays), 'day').format('YYYY-MM-DD');
}

router.get('/maintenance/schedule', async (req, res) => {
  try {
    const r = await query(`
      SELECT s.*, e.code AS equipment_code, e.name AS equipment_name
      FROM pm_maintenance_schedule s
      JOIN pm_equipment e ON e.id = s.equipment_id
      WHERE s.company_id=$1 AND s.is_deleted=false ORDER BY s.due_date NULLS LAST`,
      [CID(req)]);
    res.json({ data: r.rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/maintenance/schedule', async (req, res) => {
  try {
    const b = req.body;
    const due = b.due_date || calcNextDue(b.last_done_date, b.interval_days);
    const r = await query(
      `INSERT INTO pm_maintenance_schedule
       (company_id, equipment_id, maintenance_type, description, due_date, interval_days, interval_hours, last_done_date, reported_by, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [CID(req), b.equipment_id, b.maintenance_type || 'PPM', b.description || null,
       due || null, b.interval_days || null, b.interval_hours || null,
       b.last_done_date || null, b.reported_by || null, b.status || 'scheduled']);
    res.status(201).json({ data: r.rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/maintenance/schedule/:id([0-9a-fA-F-]{36})', async (req, res) => {
  try {
    const b = req.body;
    const due = b.due_date || calcNextDue(b.last_done_date, b.interval_days);
    const r = await query(
      `UPDATE pm_maintenance_schedule SET
        maintenance_type=$1, description=$2, due_date=$3, interval_days=$4, interval_hours=$5,
        last_done_date=$6, reported_by=$7, status=$8, updated_at=NOW()
       WHERE id=$9 AND company_id=$10 RETURNING *`,
      [b.maintenance_type || 'PPM', b.description || null, due || null, b.interval_days || null,
       b.interval_hours || null, b.last_done_date || null, b.reported_by || null,
       b.status || 'scheduled', req.params.id, CID(req)]);
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json({ data: r.rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/maintenance/schedule/:id([0-9a-fA-F-]{36})', async (req, res) => {
  try {
    await query(`UPDATE pm_maintenance_schedule SET is_deleted=true WHERE id=$1 AND company_id=$2`, [req.params.id, CID(req)]);
    res.json({ message: 'Deleted' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Work Orders (+ spare parts)
router.get('/work-orders', async (req, res) => {
  try {
    const r = await query(`
      SELECT w.*, e.code AS equipment_code, e.name AS equipment_name,
             v.name AS vendor_name,
             (SELECT COALESCE(SUM(amount),0) FROM pm_spare_parts sp WHERE sp.work_order_id=w.id) AS parts_total
      FROM pm_work_orders w
      JOIN pm_equipment e ON e.id = w.equipment_id
      LEFT JOIN pm_maintenance_vendors v ON v.id = w.vendor_id
      WHERE w.company_id=$1 AND w.is_deleted=false ORDER BY w.wo_date DESC`,
      [CID(req)]);
    res.json({ data: r.rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/work-orders/:id([0-9a-fA-F-]{36})', async (req, res) => {
  try {
    const r = await query(`SELECT * FROM pm_work_orders WHERE id=$1 AND company_id=$2`, [req.params.id, CID(req)]);
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    const parts = await query(`SELECT * FROM pm_spare_parts WHERE work_order_id=$1`, [req.params.id]);
    res.json({ data: { ...r.rows[0], spare_parts: parts.rows } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/work-orders', async (req, res) => {
  try {
    const wo_number = req.body.wo_number || await nextSeq('pm_work_orders', 'wo_number', 'WO', true);
    const b = req.body;
    const result = await withTransaction(async (client) => {
      const r = await client.query(
        `INSERT INTO pm_work_orders
         (company_id, wo_number, equipment_id, maintenance_schedule_id, vendor_id, wo_date,
          description, estimated_cost, actual_cost, status, completion_date, downtime_hours, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
        [CID(req), wo_number, b.equipment_id, b.maintenance_schedule_id || null, b.vendor_id || null,
         b.wo_date || new Date(), b.description || null, n(b.estimated_cost), n(b.actual_cost),
         b.status || 'open', b.completion_date || null, n(b.downtime_hours), req.user.id]);
      const wo = r.rows[0];
      const parts = Array.isArray(b.spare_parts) ? b.spare_parts : [];
      for (const p of parts) {
        if (!p.item_name) continue;
        await client.query(
          `INSERT INTO pm_spare_parts (company_id, work_order_id, item_name, quantity, unit, rate, amount)
           VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [CID(req), wo.id, p.item_name, n(p.quantity), p.unit || null, n(p.rate),
           n(p.amount) || (n(p.quantity) * n(p.rate))]);
      }
      // Equipment → maintenance status if WO is open
      if ((b.status || 'open') !== 'completed') {
        await client.query(`UPDATE pm_equipment SET status='maintenance', updated_at=NOW() WHERE id=$1 AND company_id=$2`,
          [b.equipment_id, CID(req)]);
      }
      return wo;
    });
    res.status(201).json({ data: result });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.patch('/work-orders/:id([0-9a-fA-F-]{36})/complete', async (req, res) => {
  try {
    const b = req.body;
    const result = await withTransaction(async (client) => {
      const r = await client.query(
        `UPDATE pm_work_orders SET status='completed', actual_cost=$1, completion_date=$2,
           downtime_hours=$3, updated_at=NOW()
         WHERE id=$4 AND company_id=$5 RETURNING *`,
        [n(b.actual_cost), b.completion_date || new Date(), n(b.downtime_hours), req.params.id, CID(req)]);
      if (!r.rows.length) return null;
      const wo = r.rows[0];
      // restore equipment to active
      await client.query(`UPDATE pm_equipment SET status='active', updated_at=NOW() WHERE id=$1 AND company_id=$2`,
        [wo.equipment_id, CID(req)]);
      // advance the linked PPM schedule
      if (wo.maintenance_schedule_id) {
        const sch = await client.query(`SELECT * FROM pm_maintenance_schedule WHERE id=$1`, [wo.maintenance_schedule_id]);
        if (sch.rows.length) {
          const s = sch.rows[0];
          const nextDue = calcNextDue(wo.completion_date || new Date(), s.interval_days);
          await client.query(
            `UPDATE pm_maintenance_schedule SET last_done_date=$1, due_date=$2, status='scheduled', updated_at=NOW() WHERE id=$3`,
            [wo.completion_date || new Date(), nextDue, s.id]);
        }
      }
      return wo;
    });
    if (!result) return res.status(404).json({ error: 'Not found' });
    res.json({ data: result });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/work-orders/:id([0-9a-fA-F-]{36})', async (req, res) => {
  try {
    await query(`UPDATE pm_work_orders SET is_deleted=true WHERE id=$1 AND company_id=$2`, [req.params.id, CID(req)]);
    res.json({ message: 'Deleted' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// AMC contracts
router.get('/amc', async (req, res) => {
  try {
    const r = await query(`
      SELECT a.*, e.code AS equipment_code, e.name AS equipment_name, v.name AS vendor_name
      FROM pm_amc_contracts a
      JOIN pm_equipment e ON e.id = a.equipment_id
      LEFT JOIN pm_maintenance_vendors v ON v.id = a.vendor_id
      WHERE a.company_id=$1 AND a.is_deleted=false ORDER BY a.end_date NULLS LAST`,
      [CID(req)]);
    res.json({ data: r.rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/amc', async (req, res) => {
  try {
    const b = req.body;
    const r = await query(
      `INSERT INTO pm_amc_contracts (company_id, equipment_id, vendor_id, start_date, end_date, scope, annual_cost, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [CID(req), b.equipment_id, b.vendor_id || null, b.start_date || null, b.end_date || null,
       b.scope || null, n(b.annual_cost), b.status || 'active']);
    res.status(201).json({ data: r.rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/amc/:id([0-9a-fA-F-]{36})', async (req, res) => {
  try {
    await query(`UPDATE pm_amc_contracts SET is_deleted=true WHERE id=$1 AND company_id=$2`, [req.params.id, CID(req)]);
    res.json({ message: 'Deleted' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ───────────────────────────────────────────────────────────────────────────
// 9. COST ALLOCATION
// ───────────────────────────────────────────────────────────────────────────
router.get('/cost-allocation', async (req, res) => {
  try {
    const { project_id, month, year } = req.query;
    let sql = `
      SELECT c.*, e.code AS equipment_code, e.name AS equipment_name, p.name AS project_name
      FROM pm_cost_allocation c
      JOIN pm_equipment e ON e.id = c.equipment_id
      LEFT JOIN projects p ON p.id = c.project_id
      WHERE c.company_id=$1 AND c.is_deleted=false`;
    const params = [CID(req)]; let i = 2;
    if (project_id) { sql += ` AND c.project_id=$${i++}`; params.push(project_id); }
    if (month)      { sql += ` AND c.month=$${i++}`; params.push(month); }
    if (year)       { sql += ` AND c.year=$${i++}`; params.push(year); }
    sql += ' ORDER BY c.year DESC, c.month DESC';
    res.json({ data: (await query(sql, params)).rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/cost-allocation', async (req, res) => {
  try {
    const b = req.body;
    const total = n(b.total_cost) || (n(b.hours_used) * n(b.rate_per_hour));
    const r = await query(
      `INSERT INTO pm_cost_allocation
       (company_id, equipment_id, project_id, month, year, hours_used, rate_per_hour, total_cost, cost_type)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [CID(req), b.equipment_id, b.project_id || null, b.month || null, b.year || null,
       n(b.hours_used), n(b.rate_per_hour), total, b.cost_type || 'own']);
    res.status(201).json({ data: r.rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/cost-allocation/:id([0-9a-fA-F-]{36})', async (req, res) => {
  try {
    await query(`UPDATE pm_cost_allocation SET is_deleted=true WHERE id=$1 AND company_id=$2`, [req.params.id, CID(req)]);
    res.json({ message: 'Deleted' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ───────────────────────────────────────────────────────────────────────────
// 8. COMPLIANCE — document expiry alerts
// ───────────────────────────────────────────────────────────────────────────
router.get('/expiry-alerts', async (req, res) => {
  try {
    const r = await query(`
      SELECT d.*, e.code AS equipment_code, e.name AS equipment_name,
             (d.expiry_date - CURRENT_DATE) AS days_left,
             CASE
               WHEN d.expiry_date < CURRENT_DATE THEN 'expired'
               WHEN d.expiry_date <= CURRENT_DATE + 30 THEN 'expiring'
               ELSE 'valid'
             END AS expiry_status
      FROM pm_equipment_documents d
      JOIN pm_equipment e ON e.id = d.equipment_id
      WHERE d.company_id=$1 AND d.is_deleted=false AND d.expiry_date IS NOT NULL
      ORDER BY d.expiry_date ASC`, [CID(req)]);
    res.json({ data: r.rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ───────────────────────────────────────────────────────────────────────────
// 10. DASHBOARD & REPORTS
// ───────────────────────────────────────────────────────────────────────────
router.get('/dashboard', async (req, res) => {
  try {
    const cid = CID(req);
    const [statusRows, byTypeRows, utilRows, maintDue, hirePending, expiring] = await Promise.all([
      query(`SELECT status, COUNT(*) c FROM pm_equipment WHERE company_id=$1 AND is_deleted=false GROUP BY status`, [cid]),
      query(`SELECT type, COUNT(*) c, COALESCE(SUM(purchase_value),0) v FROM pm_equipment WHERE company_id=$1 AND is_deleted=false GROUP BY type`, [cid]),
      query(`SELECT e.code, e.name,
                COALESCE(SUM(d.hours_worked),0) hours_worked,
                COALESCE(SUM(d.idle_hours),0) idle_hours
              FROM pm_equipment e
              LEFT JOIN pm_deployment d ON d.equipment_id=e.id AND d.is_deleted=false
              WHERE e.company_id=$1 AND e.is_deleted=false
              GROUP BY e.id, e.code, e.name ORDER BY hours_worked DESC LIMIT 10`, [cid]),
      query(`SELECT COUNT(*) c FROM pm_maintenance_schedule
              WHERE company_id=$1 AND is_deleted=false AND status<>'completed'
                AND due_date IS NOT NULL AND due_date <= CURRENT_DATE + 7`, [cid]),
      query(`SELECT COUNT(*) c FROM pm_hire_in_orders
              WHERE company_id=$1 AND is_deleted=false AND status IN ('ordered','deployed')`, [cid]),
      query(`SELECT COUNT(*) c FROM pm_equipment_documents
              WHERE company_id=$1 AND is_deleted=false AND expiry_date IS NOT NULL
                AND expiry_date <= CURRENT_DATE + 30`, [cid]),
    ]);
    const statusMap = {};
    statusRows.rows.forEach((r) => { statusMap[r.status] = parseInt(r.c); });
    const total = statusRows.rows.reduce((s, r) => s + parseInt(r.c), 0);
    res.json({
      data: {
        summary: {
          total_equipment: total,
          active: statusMap.active || 0,
          idle: statusMap.idle || 0,
          maintenance: statusMap.maintenance || 0,
          disposed: statusMap.disposed || 0,
          maintenance_due: parseInt(maintDue.rows[0]?.c || 0),
          hire_pending: parseInt(hirePending.rows[0]?.c || 0),
          expiring_docs: parseInt(expiring.rows[0]?.c || 0),
        },
        by_type: byTypeRows.rows,
        utilisation: utilRows.rows,
      },
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/utilization-report', async (req, res) => {
  try {
    const { from, to } = req.query;
    const params = [CID(req)]; let i = 2;
    let dateClause = '';
    if (from) { dateClause += ` AND d.deployment_date>=$${i++}`; params.push(from); }
    if (to)   { dateClause += ` AND d.deployment_date<=$${i++}`; params.push(to); }
    const r = await query(`
      SELECT e.code, e.name, e.type, e.status,
        COALESCE(SUM(d.hours_worked),0) hours_worked,
        COALESCE(SUM(d.idle_hours),0) idle_hours,
        COUNT(d.id) FILTER (WHERE d.id IS NOT NULL) deployment_days
      FROM pm_equipment e
      LEFT JOIN pm_deployment d ON d.equipment_id=e.id AND d.is_deleted=false ${dateClause}
      WHERE e.company_id=$1 AND e.is_deleted=false
      GROUP BY e.id, e.code, e.name, e.type, e.status
      ORDER BY hours_worked DESC`, params);
    res.json({ data: r.rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/cost-report', async (req, res) => {
  try {
    const { project_id, month, year } = req.query;
    const params = [CID(req)]; let i = 2;
    let where = '';
    if (project_id) { where += ` AND c.project_id=$${i++}`; params.push(project_id); }
    if (month)      { where += ` AND c.month=$${i++}`; params.push(month); }
    if (year)       { where += ` AND c.year=$${i++}`; params.push(year); }
    const byProject = await query(`
      SELECT p.name AS project_name, c.cost_type,
        COALESCE(SUM(c.total_cost),0) total_cost, COALESCE(SUM(c.hours_used),0) hours
      FROM pm_cost_allocation c
      LEFT JOIN projects p ON p.id = c.project_id
      WHERE c.company_id=$1 AND c.is_deleted=false ${where}
      GROUP BY p.name, c.cost_type ORDER BY total_cost DESC`, params);
    const ownVsHired = await query(`
      SELECT cost_type, COALESCE(SUM(total_cost),0) total_cost
      FROM pm_cost_allocation
      WHERE company_id=$1 AND is_deleted=false
      GROUP BY cost_type`, [CID(req)]);
    res.json({ data: { by_project: byProject.rows, own_vs_hired: ownVsHired.rows } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/maintenance-due', async (req, res) => {
  try {
    const r = await query(`
      SELECT s.*, e.code AS equipment_code, e.name AS equipment_name,
             (s.due_date - CURRENT_DATE) AS days_left
      FROM pm_maintenance_schedule s
      JOIN pm_equipment e ON e.id = s.equipment_id
      WHERE s.company_id=$1 AND s.is_deleted=false AND s.status<>'completed'
        AND s.due_date IS NOT NULL AND s.due_date <= CURRENT_DATE + 30
      ORDER BY s.due_date ASC`, [CID(req)]);
    res.json({ data: r.rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
