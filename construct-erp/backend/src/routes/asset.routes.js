// src/routes/asset.routes.js
const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const { query, withTransaction } = require('../config/database');
const { postAutoJournalStandalone } = require('../services/journalAutoPost');
const { sendMail } = require('../services/mail.service');
router.use(authenticate);

function normalizeAssetCode(value) {
  const raw = String(value || '').trim().toUpperCase().replace(/\s+/g, '-');
  if (!raw) return raw;
  return raw.startsWith('BCIM-') ? raw : `BCIM-${raw}`;
}
let assetSchemaReady = false;

async function tableExists(tableName) {
  const r = await query('SELECT to_regclass($1) AS table_name', [tableName]);
  return Boolean(r.rows[0]?.table_name);
}

async function ensureAssetWorkflowTables() {
  if (assetSchemaReady) return;

  // Each DDL wrapped individually — a single failure must NOT block the main query
  const ddl = [
    `ALTER TABLE assets ADD COLUMN IF NOT EXISTS po_number TEXT`,
    `ALTER TABLE assets ADD COLUMN IF NOT EXISTS invoice_number TEXT`,
    `ALTER TABLE assets ADD COLUMN IF NOT EXISTS department TEXT`,
    `ALTER TABLE assets ADD COLUMN IF NOT EXISTS category_id UUID`,
    `ALTER TABLE assets ADD COLUMN IF NOT EXISTS sub_category TEXT`,
    `ALTER TABLE assets ADD COLUMN IF NOT EXISTS photo_url TEXT`,
    `ALTER TABLE assets ADD COLUMN IF NOT EXISTS fitness_expiry DATE`,
    `ALTER TABLE assets ADD COLUMN IF NOT EXISTS pollution_expiry DATE`,
    `ALTER TABLE assets ADD COLUMN IF NOT EXISTS road_tax_expiry DATE`,
    `ALTER TABLE assets ADD COLUMN IF NOT EXISTS disposal_type TEXT`,
    `ALTER TABLE assets ADD COLUMN IF NOT EXISTS disposal_approved_by UUID`,
    `ALTER TABLE assets ADD COLUMN IF NOT EXISTS disposal_approved_at TIMESTAMPTZ`,
    `ALTER TABLE assets ADD COLUMN IF NOT EXISTS assigned_employee TEXT`,
    `ALTER TABLE assets ADD COLUMN IF NOT EXISTS assigned_date DATE`,
    `ALTER TABLE assets ADD COLUMN IF NOT EXISTS expected_return_date DATE`,
    `ALTER TABLE assets ADD COLUMN IF NOT EXISTS condition_rating SMALLINT`,
    `ALTER TABLE assets DROP CONSTRAINT IF EXISTS assets_asset_type_check`,
  ];
  for (const sql of ddl) {
    try { await query(sql); } catch (_) { /* ignore — column/constraint may already exist */ }
  }

  await query(`
    CREATE TABLE IF NOT EXISTS asset_movements (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id UUID NOT NULL,
      asset_id UUID REFERENCES assets(id) ON DELETE CASCADE,
      from_project_id UUID REFERENCES projects(id),
      to_project_id UUID REFERENCES projects(id),
      movement_type VARCHAR(30) DEFAULT 'transfer',
      issued_by UUID REFERENCES users(id),
      received_by UUID REFERENCES users(id),
      movement_date DATE DEFAULT CURRENT_DATE,
      expected_return_date DATE,
      return_date DATE,
      condition_out VARCHAR(80),
      condition_in VARCHAR(80),
      remarks TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`);

  await query(`
    CREATE TABLE IF NOT EXISTS asset_maintenance_logs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id UUID NOT NULL,
      asset_id UUID REFERENCES assets(id) ON DELETE CASCADE,
      project_id UUID REFERENCES projects(id),
      maintenance_type VARCHAR(30) NOT NULL DEFAULT 'preventive',
      status VARCHAR(30) NOT NULL DEFAULT 'open',
      issue_date DATE DEFAULT CURRENT_DATE,
      resolved_date DATE,
      service_vendor VARCHAR(200),
      service_engineer VARCHAR(120),
      problem_description TEXT,
      work_done TEXT,
      spare_parts TEXT,
      labor_cost NUMERIC(14,2) DEFAULT 0,
      parts_cost NUMERIC(14,2) DEFAULT 0,
      total_cost NUMERIC(14,2) DEFAULT 0,
      downtime_hours NUMERIC(12,2) DEFAULT 0,
      next_service_date DATE,
      next_service_meter NUMERIC(14,2),
      created_by UUID REFERENCES users(id),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )`);

  assetSchemaReady = true;
}

// GET /assets — Get all assets with telemetry
router.get('/', async (req, res) => {
  try {
    await ensureAssetWorkflowTables();
    const { asset_type, status, project_id, department } = req.query;
    const hasFuelLogs = await tableExists('asset_fuel_logs');
    const hasUsageLogs = await tableExists('asset_usage_logs');
    const fuelConsumedSql = hasFuelLogs
      ? '(SELECT SUM(quantity) FROM asset_fuel_logs WHERE asset_id = a.id)'
      : '0';
    const unitsWorkedSql = hasUsageLogs
      ? '(SELECT SUM(units_worked) FROM asset_usage_logs WHERE asset_id = a.id)'
      : '0';
    let sql = `
      SELECT a.*, p.name as current_project_name, u.name as assigned_to_name, v.name as vendor_name,
             c.name as category_name,
             ${fuelConsumedSql} as total_fuel_consumed,
             ${unitsWorkedSql} as total_units_worked
      FROM assets a
      LEFT JOIN projects p ON a.current_location=p.id
      LEFT JOIN users u ON a.assigned_to=u.id
      LEFT JOIN vendors v ON a.vendor_id=v.id
      LEFT JOIN asset_categories c ON a.category_id=c.id
      WHERE a.company_id=$1`;
    const params=[req.user.company_id]; let i=2;
    if (asset_type) { sql+=` AND a.asset_type=$${i++}`; params.push(asset_type); }
    if (status)     { sql+=` AND a.status=$${i++}`; params.push(status); }
    if (project_id) { sql+=` AND a.current_location=$${i++}`; params.push(project_id); }
    if (department) { sql+=` AND COALESCE(a.department,'')=$${i++}`; params.push(department); }
    sql+=' ORDER BY a.asset_code';
    const r = await query(sql, params);
    res.json({ data: r.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /assets — Register new asset
router.post('/', authorize('super_admin','admin'), async (req, res) => {
  try {
    await ensureAssetWorkflowTables();
    const {
      asset_code, asset_name, asset_type, brand, model, serial_number,
      po_number, invoice_number, department, category_id,
      purchase_date, purchase_value, vendor_id, warranty_expiry, amc_expiry,
      current_location, meter_type, fuel_type, current_meter, hourly_rate, notes, status,
      useful_life_years, salvage_value, depreciation_method,
      insurance_policy_no, insurance_expiry, insurance_value,
      fitness_expiry, pollution_expiry, road_tax_expiry,
    } = req.body;

    const normalizedAssetCode = normalizeAssetCode(asset_code);
    const qrCode = `QR-${normalizedAssetCode}-${Date.now()}`;
    const r = await query(
      `INSERT INTO assets
         (company_id, asset_code, asset_name, asset_type, brand, model, serial_number,
          po_number, invoice_number, department, category_id,
          purchase_date, purchase_value, vendor_id, warranty_expiry, amc_expiry,
          current_location, qr_code, notes, status, meter_type, fuel_type,
          current_meter, hourly_rate,
          useful_life_years, salvage_value, depreciation_method,
          insurance_policy_no, insurance_expiry, insurance_value,
          fitness_expiry, pollution_expiry, road_tax_expiry)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33)
       RETURNING *`,
      [req.user.company_id, normalizedAssetCode, asset_name, asset_type, brand || null, model || null,
       serial_number || null, po_number || null, invoice_number || null, department || null,
       category_id || null,
       purchase_date || null, purchase_value || null, vendor_id || null,
       warranty_expiry || null, amc_expiry || null, current_location || null,
       qrCode, notes || null, status || 'available',
       meter_type || 'Hours', fuel_type || 'Diesel', current_meter || 0, hourly_rate || 0,
       useful_life_years || null, salvage_value || null, depreciation_method || 'straight_line',
       insurance_policy_no || null, insurance_expiry || null, insurance_value || null,
       fitness_expiry || null, pollution_expiry || null, road_tax_expiry || null]
    );
    res.status(201).json({ data: r.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /assets/logs/fuel — Log fuel consumption
router.post('/logs/fuel', async (req, res) => {
  try {
    const { asset_id, project_id, quantity, rate_per_liter, meter_reading, remarks } = req.body;
    const result = await withTransaction(async (client) => {
      const log = await client.query(
        `INSERT INTO asset_fuel_logs 
           (company_id, asset_id, project_id, quantity, rate_per_liter, total_cost, meter_at_log, issued_by, remarks)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
        [req.user.company_id, asset_id, project_id, quantity, rate_per_liter, 
         quantity * (rate_per_liter || 0), meter_reading, req.user.id, remarks]
      );
      return log.rows[0];
    });
    res.status(201).json({ data: result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /assets/logs/usage — Log daily usage
router.post('/logs/usage', async (req, res) => {
  try {
    const { asset_id, project_id, start_meter, end_meter, operator_name, activity_name, remarks } = req.body;
    const units_worked = parseFloat(end_meter) - parseFloat(start_meter);
    if (units_worked < 0) return res.status(400).json({ error: 'End meter cannot be less than start meter' });

    const result = await withTransaction(async (client) => {
      // 1. Create Log
      const log = await client.query(
        `INSERT INTO asset_usage_logs 
           (company_id, asset_id, project_id, start_meter, end_meter, units_worked, operator_name, activity_name, remarks)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
        [req.user.company_id, asset_id, project_id, start_meter, end_meter, units_worked, operator_name, activity_name, remarks]
      );

      // 2. Update Asset Master Meter
      await client.query(
        `UPDATE assets SET current_meter = $1, updated_at = NOW() WHERE id = $2`,
        [end_meter, asset_id]
      );

      return log.rows[0];
    });
    res.status(201).json({ data: result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /assets/:id
// GET /assets/movements - Transfer / deployment register
router.get('/movements', async (req, res) => {
  try {
    await ensureAssetWorkflowTables();
    const { asset_id, project_id, status } = req.query;
    const params = [req.user.company_id];
    let i = 2;
    let sql = `
      SELECT m.*, a.asset_code, a.asset_name, a.asset_type,
             fp.name AS from_project_name, tp.name AS to_project_name,
             ib.name AS issued_by_name, rb.name AS received_by_name
      FROM asset_movements m
      JOIN assets a ON a.id = m.asset_id
      LEFT JOIN projects fp ON fp.id = m.from_project_id
      LEFT JOIN projects tp ON tp.id = m.to_project_id
      LEFT JOIN users ib ON ib.id = m.issued_by
      LEFT JOIN users rb ON rb.id = m.received_by
      WHERE m.company_id = $1`;
    if (asset_id) { sql += ` AND m.asset_id = $${i++}`; params.push(asset_id); }
    if (project_id) { sql += ` AND (m.from_project_id = $${i} OR m.to_project_id = $${i})`; params.push(project_id); i++; }
    if (status === 'open') sql += ' AND m.return_date IS NULL';
    if (status === 'returned') sql += ' AND m.return_date IS NOT NULL';
    sql += ' ORDER BY m.movement_date DESC, m.created_at DESC';
    const r = await query(sql, params);
    res.json({ data: r.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /assets/transfer - Deploy/transfer an asset to a project
router.post('/transfer', async (req, res) => {
  try {
    await ensureAssetWorkflowTables();
    const {
      asset_id, to_project_id, movement_type = 'transfer', movement_date,
      expected_return_date, received_by, condition_out, remarks,
    } = req.body;

    if (!asset_id || !to_project_id) {
      return res.status(400).json({ error: 'asset_id and to_project_id are required' });
    }

    const result = await withTransaction(async (client) => {
      const assetRes = await client.query(
        'SELECT id, current_location FROM assets WHERE id = $1 AND company_id = $2',
        [asset_id, req.user.company_id]
      );
      const asset = assetRes.rows[0];
      if (!asset) throw new Error('Asset not found');

      const movement = await client.query(
        `INSERT INTO asset_movements
           (company_id, asset_id, from_project_id, to_project_id, movement_type, issued_by, received_by,
            movement_date, expected_return_date, condition_out, remarks)
         VALUES ($1,$2,$3,$4,$5,$6,$7,COALESCE($8::date, CURRENT_DATE),$9,$10,$11)
         RETURNING *`,
        [
          req.user.company_id, asset_id, asset.current_location || null, to_project_id,
          movement_type, req.user.id, received_by || null, movement_date || null,
          expected_return_date || null, condition_out || null, remarks || null,
        ]
      );

      await client.query(
        `UPDATE assets
         SET current_location = $1, status = 'assigned', updated_at = NOW()
         WHERE id = $2 AND company_id = $3`,
        [to_project_id, asset_id, req.user.company_id]
      );

      return movement.rows[0];
    });
    res.status(201).json({ data: result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /assets/movements/:id/return - Close transfer and return to yard
router.patch('/movements/:id/return', async (req, res) => {
  try {
    await ensureAssetWorkflowTables();
    const { return_date, condition_in, remarks } = req.body;
    const result = await withTransaction(async (client) => {
      const movement = await client.query(
        `UPDATE asset_movements
         SET return_date = COALESCE($1::date, CURRENT_DATE),
             condition_in = COALESCE($2, condition_in),
             remarks = COALESCE($3, remarks)
         WHERE id = $4 AND company_id = $5
         RETURNING *`,
        [return_date || null, condition_in || null, remarks || null, req.params.id, req.user.company_id]
      );
      if (!movement.rows[0]) throw new Error('Movement not found');
      await client.query(
        `UPDATE assets
         SET status = 'available', current_location = NULL, updated_at = NOW()
         WHERE id = $1 AND company_id = $2`,
        [movement.rows[0].asset_id, req.user.company_id]
      );
      return movement.rows[0];
    });
    res.json({ data: result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /assets/maintenance - Preventive and breakdown register
router.get('/maintenance', async (req, res) => {
  try {
    await ensureAssetWorkflowTables();
    const { asset_id, project_id, status, maintenance_type } = req.query;
    const params = [req.user.company_id];
    let i = 2;
    let sql = `
      SELECT m.*, a.asset_code, a.asset_name, a.asset_type, p.name AS project_name, u.name AS created_by_name
      FROM asset_maintenance_logs m
      JOIN assets a ON a.id = m.asset_id
      LEFT JOIN projects p ON p.id = m.project_id
      LEFT JOIN users u ON u.id = m.created_by
      WHERE m.company_id = $1`;
    if (asset_id) { sql += ` AND m.asset_id = $${i++}`; params.push(asset_id); }
    if (project_id) { sql += ` AND m.project_id = $${i++}`; params.push(project_id); }
    if (status) { sql += ` AND m.status = $${i++}`; params.push(status); }
    if (maintenance_type) { sql += ` AND m.maintenance_type = $${i++}`; params.push(maintenance_type); }
    sql += ' ORDER BY m.issue_date DESC, m.created_at DESC';
    const r = await query(sql, params);
    res.json({ data: r.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /assets/maintenance - Log preventive service or breakdown
router.post('/maintenance', async (req, res) => {
  try {
    await ensureAssetWorkflowTables();
    const {
      asset_id, project_id, maintenance_type = 'preventive', status = 'open',
      issue_date, resolved_date, service_vendor, service_engineer,
      problem_description, work_done, spare_parts, labor_cost = 0, parts_cost = 0,
      downtime_hours = 0, next_service_date, next_service_meter,
    } = req.body;
    if (!asset_id) return res.status(400).json({ error: 'asset_id is required' });
    const totalCost = Number(labor_cost || 0) + Number(parts_cost || 0);

    const result = await withTransaction(async (client) => {
      const log = await client.query(
        `INSERT INTO asset_maintenance_logs
           (company_id, asset_id, project_id, maintenance_type, status, issue_date, resolved_date,
            service_vendor, service_engineer, problem_description, work_done, spare_parts,
            labor_cost, parts_cost, total_cost, downtime_hours, next_service_date, next_service_meter, created_by)
         VALUES ($1,$2,$3,$4,$5,COALESCE($6::date, CURRENT_DATE),$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
         RETURNING *`,
        [
          req.user.company_id, asset_id, project_id || null, maintenance_type, status,
          issue_date || null, resolved_date || null, service_vendor || null, service_engineer || null,
          problem_description || null, work_done || null, spare_parts || null,
          labor_cost || 0, parts_cost || 0, totalCost, downtime_hours || 0,
          next_service_date || null, next_service_meter || null, req.user.id,
        ]
      );

      const assetStatus = maintenance_type === 'breakdown' && status !== 'closed' ? 'breakdown'
        : status === 'closed' ? 'available'
          : 'maintenance';
      await client.query(
        `UPDATE assets
         SET status = $1,
             next_service_date = COALESCE($2, next_service_date),
             next_service_meter = COALESCE($3, next_service_meter),
             updated_at = NOW()
         WHERE id = $4 AND company_id = $5`,
        [assetStatus, next_service_date || null, next_service_meter || null, asset_id, req.user.company_id]
      );

      return log.rows[0];
    });
    res.status(201).json({ data: result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /assets/maintenance/:id/close - Close service/breakdown
router.patch('/maintenance/:id/close', async (req, res) => {
  try {
    await ensureAssetWorkflowTables();
    const { resolved_date, work_done, spare_parts, labor_cost, parts_cost, downtime_hours, next_service_date, next_service_meter } = req.body;
    const hasCost = labor_cost != null || parts_cost != null;
    const totalCost = Number(labor_cost || 0) + Number(parts_cost || 0);
    const result = await withTransaction(async (client) => {
      const log = await client.query(
        `UPDATE asset_maintenance_logs
         SET status = 'closed',
             resolved_date = COALESCE($1::date, CURRENT_DATE),
             work_done = COALESCE($2, work_done),
             spare_parts = COALESCE($3, spare_parts),
             labor_cost = COALESCE($4, labor_cost),
             parts_cost = COALESCE($5, parts_cost),
             total_cost = COALESCE($6, total_cost),
             downtime_hours = COALESCE($7, downtime_hours),
             next_service_date = COALESCE($8, next_service_date),
             next_service_meter = COALESCE($9, next_service_meter),
             updated_at = NOW()
         WHERE id = $10 AND company_id = $11
         RETURNING *`,
        [
          resolved_date || null, work_done || null, spare_parts || null,
          labor_cost ?? null, parts_cost ?? null, hasCost ? totalCost : null, downtime_hours ?? null,
          next_service_date || null, next_service_meter || null, req.params.id, req.user.company_id,
        ]
      );
      if (!log.rows[0]) throw new Error('Maintenance log not found');
      await client.query(
        `UPDATE assets
         SET status = 'available',
             next_service_date = COALESCE($1, next_service_date),
             next_service_meter = COALESCE($2, next_service_meter),
             updated_at = NOW()
         WHERE id = $3 AND company_id = $4`,
        [next_service_date || null, next_service_meter || null, log.rows[0].asset_id, req.user.company_id]
      );
      return log.rows[0];
    });
    const maintenanceCost = parseFloat(result.total_cost || 0);
    if (maintenanceCost > 0) {
      postAutoJournalStandalone({
        companyId: req.user.company_id, userId: req.user.id,
        entryDate: (result.resolved_date || new Date().toISOString().slice(0, 10)),
        reference: `MAINT-${req.params.id.slice(0, 8)}`,
        narration: `Asset maintenance closed — ${result.maintenance_type}`,
        source: 'auto_asset_maintenance',
        lines: [
          { code: '5200', debit: maintenanceCost, description: `Asset maintenance cost` },
          { code: '1010', credit: maintenanceCost, description: `Bank payment — maintenance` },
        ],
      }).catch(() => {});
      notifyAccountsDept(req.user.company_id,
        `Asset Maintenance Closed ₹${Math.round(maintenanceCost).toLocaleString('en-IN')}`,
        `Asset maintenance log closed. Type: ${result.maintenance_type}. Cost: ₹${Math.round(maintenanceCost).toLocaleString('en-IN')}.`,
        '/accounts/journal-entries').catch(() => {});
    }
    res.json({ data: result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /assets/alerts - Expiry and service alerts
router.get('/alerts', async (req, res) => {
  try {
    await ensureAssetWorkflowTables();
    const r = await query(
      `SELECT id, asset_code, asset_name, asset_type, status, current_meter,
              warranty_expiry, amc_expiry, next_service_date, next_service_meter,
              CASE
                WHEN warranty_expiry IS NOT NULL AND warranty_expiry <= CURRENT_DATE + INTERVAL '30 days' THEN 'Warranty Expiry'
                WHEN amc_expiry IS NOT NULL AND amc_expiry <= CURRENT_DATE + INTERVAL '30 days' THEN 'AMC Expiry'
                WHEN next_service_date IS NOT NULL AND next_service_date <= CURRENT_DATE + INTERVAL '15 days' THEN 'Service Due'
                WHEN next_service_meter IS NOT NULL AND current_meter >= next_service_meter THEN 'Meter Service Due'
                ELSE NULL
              END AS alert_type
       FROM assets
       WHERE company_id = $1
         AND (
           (warranty_expiry IS NOT NULL AND warranty_expiry <= CURRENT_DATE + INTERVAL '30 days')
           OR (amc_expiry IS NOT NULL AND amc_expiry <= CURRENT_DATE + INTERVAL '30 days')
           OR (next_service_date IS NOT NULL AND next_service_date <= CURRENT_DATE + INTERVAL '15 days')
           OR (next_service_meter IS NOT NULL AND current_meter >= next_service_meter)
         )
       ORDER BY COALESCE(next_service_date, warranty_expiry, amc_expiry, CURRENT_DATE) ASC`,
      [req.user.company_id]
    );
    res.json({ data: r.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /assets/:id — Single asset with full history
router.get('/:id', async (req, res) => {
  try {
    const a = await query(`
      SELECT a.*, p.name AS project_name, u.name AS assigned_to_name, v.name AS vendor_name
      FROM assets a
      LEFT JOIN projects p ON a.current_location = p.id
      LEFT JOIN users u ON a.assigned_to = u.id
      LEFT JOIN vendors v ON a.vendor_id = v.id
      WHERE a.id = $1 AND a.company_id = $2`, [req.params.id, req.user.company_id]);
    if (!a.rows.length) return res.status(404).json({ error: 'Asset not found' });

    const movements = await query(`
      SELECT m.*, fp.name AS from_name, tp.name AS to_name
      FROM asset_movements m
      LEFT JOIN projects fp ON fp.id = m.from_project_id
      LEFT JOIN projects tp ON tp.id = m.to_project_id
      WHERE m.asset_id = $1 ORDER BY m.movement_date DESC LIMIT 20`, [req.params.id]);

    const maintenance = await query(`
      SELECT * FROM asset_maintenance_logs WHERE asset_id=$1 ORDER BY issue_date DESC LIMIT 20`,
      [req.params.id]);

    const fuelLogs = await query(`
      SELECT * FROM asset_fuel_logs WHERE asset_id=$1 ORDER BY log_date DESC LIMIT 20`,
      [req.params.id]);

    const usageLogs = await query(`
      SELECT * FROM asset_usage_logs WHERE asset_id=$1 ORDER BY log_date DESC LIMIT 20`,
      [req.params.id]);

    res.json({ data: { ...a.rows[0], movements: movements.rows, maintenance: maintenance.rows, fuel_logs: fuelLogs.rows, usage_logs: usageLogs.rows } });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /assets/:id — Full update
router.put('/:id', authorize('super_admin','admin'), async (req, res) => {
  try {
    await ensureAssetWorkflowTables();
    const {
      asset_name, asset_type, brand, model, serial_number, status,
      po_number, invoice_number, department, category_id,
      current_location, assigned_to, vendor_id,
      purchase_date, purchase_value, warranty_expiry, amc_expiry,
      meter_type, fuel_type, current_meter, hourly_rate,
      next_service_date, next_service_meter, last_service_date,
      useful_life_years, salvage_value, depreciation_method,
      insurance_policy_no, insurance_expiry, insurance_value,
      fitness_expiry, pollution_expiry, road_tax_expiry,
      disposal_date, disposal_value, disposal_reason, notes,
    } = req.body;

    const r = await query(`
      UPDATE assets SET
        asset_name=$1, asset_type=$2, brand=$3, model=$4, serial_number=$5,
        status=$6, po_number=$7, invoice_number=$8, department=$9,
        current_location=$10, assigned_to=$11, vendor_id=$12,
        purchase_date=$13, purchase_value=$14, warranty_expiry=$15, amc_expiry=$16,
        meter_type=$17, fuel_type=$18, current_meter=$19, hourly_rate=$20,
        next_service_date=$21, next_service_meter=$22, last_service_date=$23,
        useful_life_years=$24, salvage_value=$25, depreciation_method=$26,
        insurance_policy_no=$27, insurance_expiry=$28, insurance_value=$29,
        disposal_date=$30, disposal_value=$31, disposal_reason=$32, notes=$33,
        category_id=$34, fitness_expiry=$35, pollution_expiry=$36, road_tax_expiry=$37,
        updated_at=NOW()
      WHERE id=$38 AND company_id=$39 RETURNING *`,
      [asset_name, asset_type, brand, model, serial_number,
       status, po_number||null, invoice_number||null, department||null,
       current_location||null, assigned_to||null, vendor_id||null,
       purchase_date||null, purchase_value||null, warranty_expiry||null, amc_expiry||null,
       meter_type||'Hours', fuel_type||'Diesel', current_meter||0, hourly_rate||0,
       next_service_date||null, next_service_meter||null, last_service_date||null,
       useful_life_years||null, salvage_value||null, depreciation_method||'straight_line',
       insurance_policy_no||null, insurance_expiry||null, insurance_value||null,
       disposal_date||null, disposal_value||null, disposal_reason||null, notes||null,
       category_id||null, fitness_expiry||null, pollution_expiry||null, road_tax_expiry||null,
       req.params.id, req.user.company_id]);
    if (!r.rows.length) return res.status(404).json({ error: 'Asset not found' });
    res.json({ data: r.rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /assets/:id
router.delete('/:id', authorize('super_admin','admin'), async (req, res) => {
  try {
    // Soft-delete: mark as disposed rather than hard delete
    const r = await query(
      `UPDATE assets SET status='disposed', updated_at=NOW() WHERE id=$1 AND company_id=$2 RETURNING id`,
      [req.params.id, req.user.company_id]);
    if (!r.rows.length) return res.status(404).json({ error: 'Asset not found' });
    res.json({ message: 'Asset disposed' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /assets/bulk-import — CSV rows bulk create
router.post('/bulk-import', authorize('super_admin','admin'), async (req, res) => {
  try {
    await ensureAssetWorkflowTables();
    const { rows } = req.body;
    if (!Array.isArray(rows) || !rows.length) return res.status(400).json({ error: 'No rows provided' });
    let inserted = 0, skipped = 0;
    for (const row of rows) {
      if (!row.asset_code || !row.asset_name || !row.asset_type) { skipped++; continue; }
      try {
        const normalizedAssetCode = normalizeAssetCode(row.asset_code);
        const qrCode = `QR-${normalizedAssetCode}-${Date.now()}`;
        await query(`
          INSERT INTO assets
            (company_id, asset_code, asset_name, asset_type, brand, model, serial_number,
             po_number, invoice_number, department,
             purchase_date, purchase_value, warranty_expiry, amc_expiry,
             meter_type, fuel_type, current_meter, hourly_rate,
             useful_life_years, salvage_value, notes, status, qr_code)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)
          ON CONFLICT DO NOTHING`,
          [req.user.company_id, normalizedAssetCode, String(row.asset_name).trim(),
           String(row.asset_type).trim(), row.brand||null, row.model||null, row.serial_number||null,
           row.po_number||null, row.invoice_number||row.inv_number||null, row.department||null,
           row.purchase_date||null, row.purchase_value ? parseFloat(row.purchase_value) : null,
           row.warranty_expiry||null, row.amc_expiry||null,
           row.meter_type||'Hours', row.fuel_type||'Diesel',
           row.current_meter ? parseFloat(row.current_meter) : 0,
           row.hourly_rate ? parseFloat(row.hourly_rate) : 0,
           row.useful_life_years ? parseInt(row.useful_life_years) : null,
           row.salvage_value ? parseFloat(row.salvage_value) : null,
           row.notes||null, row.status||'available', qrCode]);
        inserted++;
      } catch (_) { skipped++; }
    }
    res.json({ message: `Imported ${inserted} assets, ${skipped} skipped` });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /assets/:id/depreciation — Depreciation schedule for an asset
router.get('/:id/depreciation', async (req, res) => {
  try {
    const a = (await query('SELECT * FROM assets WHERE id=$1 AND company_id=$2', [req.params.id, req.user.company_id])).rows[0];
    if (!a) return res.status(404).json({ error: 'Asset not found' });
    if (!a.purchase_value || !a.useful_life_years) {
      return res.status(422).json({ error: 'Asset needs purchase_value and useful_life_years for depreciation' });
    }
    const cost      = parseFloat(a.purchase_value);
    const salvage   = parseFloat(a.salvage_value || 0);
    const life      = parseInt(a.useful_life_years);
    const startDate = a.purchase_date ? new Date(a.purchase_date) : new Date();
    const method    = a.depreciation_method || 'straight_line';
    const schedule  = [];

    if (method === 'straight_line') {
      const annualDep = (cost - salvage) / life;
      for (let yr = 1; yr <= life; yr++) {
        const year = startDate.getFullYear() + yr;
        const openBV = Math.max(salvage, cost - annualDep * (yr - 1));
        const dep    = Math.min(annualDep, openBV - salvage);
        const closeBV = Math.max(salvage, openBV - dep);
        schedule.push({ year, annual_depreciation: Math.round(dep * 100) / 100, opening_book_value: Math.round(openBV * 100) / 100, closing_book_value: Math.round(closeBV * 100) / 100 });
      }
    } else if (method === 'wdv') {
      // Written Down Value — 15% rate commonly used in India for construction equipment
      const rate = req.query.rate ? parseFloat(req.query.rate) / 100 : 0.15;
      let bv = cost;
      for (let yr = 1; yr <= life; yr++) {
        const year = startDate.getFullYear() + yr;
        const dep  = Math.round(bv * rate * 100) / 100;
        const closeBV = Math.round(Math.max(salvage, bv - dep) * 100) / 100;
        schedule.push({ year, annual_depreciation: dep, opening_book_value: Math.round(bv * 100) / 100, closing_book_value: closeBV });
        bv = closeBV;
        if (bv <= salvage) break;
      }
    }

    // Current book value
    const yearsElapsed = Math.floor((Date.now() - startDate.getTime()) / (365.25 * 24 * 3600 * 1000));
    const currentBV = schedule[Math.min(yearsElapsed, schedule.length - 1)]?.closing_book_value ?? salvage;

    res.json({ data: { method, cost, salvage, life, current_book_value: currentBV, schedule } });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

async function notifyAccountsDept(companyId, subject, body, link = '/accounts') {
  try {
    const { rows } = await query(
      `SELECT email FROM users WHERE company_id=$1 AND role IN ('accountant','accounts','super_admin','admin') AND is_active=true AND email IS NOT NULL`,
      [companyId]
    );
    const emails = rows.map(r => r.email).filter(Boolean);
    if (!emails.length) return;
    await sendMail({
      to: emails,
      subject: `[Accounts] ${subject}`,
      html: `<p style="font-family:Arial,sans-serif;font-size:13px">${body}</p><p style="font-size:11px;color:#64748b">View in ERP: <a href="${link}">${link}</a></p>`,
      text: body,
    });
  } catch (_) {}
}

module.exports = router;
