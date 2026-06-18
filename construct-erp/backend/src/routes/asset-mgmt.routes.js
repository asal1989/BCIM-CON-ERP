// src/routes/asset-mgmt.routes.js
// Complete Asset Management Module — Categories, Allocations, Transfers,
// Work Orders, Documents, Disposals, Reports, Dashboard

const express = require('express');
const router  = express.Router();
const dayjs   = require('dayjs');
const { query } = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');

router.use(authenticate);

const COMPANY = (req) => req.user.company_id;
const adminRoles = ['super_admin','admin'];

// ────────────────────────────────────────────────────────────────────
// ASSET CATEGORIES
// ────────────────────────────────────────────────────────────────────
router.get('/categories', async (req, res) => {
  try {
    const r = await query(`
      SELECT c.*, p.name AS parent_name,
        (SELECT COUNT(*) FROM assets a WHERE a.category_id = c.id) AS asset_count
      FROM asset_categories c
      LEFT JOIN asset_categories p ON p.id = c.parent_id
      WHERE c.company_id = $1 AND c.is_active = true
      ORDER BY c.name`, [COMPANY(req)]);
    res.json({ data: r.rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/categories', authorize(...adminRoles), async (req, res) => {
  try {
    const { name, parent_id, depreciation_method, useful_life_years,
            maintenance_interval_days, description } = req.body;
    const r = await query(`
      INSERT INTO asset_categories (company_id, name, parent_id, depreciation_method,
        useful_life_years, maintenance_interval_days, description)
      VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [COMPANY(req), name, parent_id||null, depreciation_method||'straight_line',
       useful_life_years||5, maintenance_interval_days||90, description||null]);
    res.status(201).json({ data: r.rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/categories/:id', authorize(...adminRoles), async (req, res) => {
  try {
    const { name, parent_id, depreciation_method, useful_life_years,
            maintenance_interval_days, description } = req.body;
    const r = await query(`
      UPDATE asset_categories SET name=$1,parent_id=$2,depreciation_method=$3,
        useful_life_years=$4,maintenance_interval_days=$5,description=$6
      WHERE id=$7 AND company_id=$8 RETURNING *`,
      [name, parent_id||null, depreciation_method||'straight_line',
       useful_life_years||5, maintenance_interval_days||90, description||null,
       req.params.id, COMPANY(req)]);
    if (!r.rows.length) return res.status(404).json({ error: 'Category not found' });
    res.json({ data: r.rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/categories/:id', authorize(...adminRoles), async (req, res) => {
  try {
    await query(`UPDATE asset_categories SET is_active=false WHERE id=$1 AND company_id=$2`,
      [req.params.id, COMPANY(req)]);
    res.json({ message: 'Deleted' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ────────────────────────────────────────────────────────────────────
// ASSET DOCUMENTS (Insurance, Warranty, Permits)
// ────────────────────────────────────────────────────────────────────
router.get('/documents', async (req, res) => {
  try {
    const { asset_id, doc_type, expiring_days } = req.query;
    let sql = `
      SELECT d.*, a.asset_code, a.asset_name, a.asset_type,
             u.name AS uploaded_by_name
      FROM asset_documents d
      JOIN assets a ON a.id = d.asset_id
      LEFT JOIN users u ON u.id = d.uploaded_by
      WHERE d.company_id = $1`;
    const params = [COMPANY(req)]; let i = 2;
    if (asset_id)     { sql += ` AND d.asset_id = $${i++}`; params.push(asset_id); }
    if (doc_type)     { sql += ` AND d.doc_type = $${i++}`; params.push(doc_type); }
    if (expiring_days){ sql += ` AND d.expiry_date BETWEEN CURRENT_DATE AND CURRENT_DATE + $${i++}::int`; params.push(expiring_days); }
    sql += ' ORDER BY d.expiry_date ASC NULLS LAST';
    res.json({ data: (await query(sql, params)).rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/documents', async (req, res) => {
  try {
    const { asset_id, doc_type, doc_name, file_url, issue_date,
            expiry_date, issuer, notes } = req.body;
    const r = await query(`
      INSERT INTO asset_documents (asset_id, company_id, doc_type, doc_name, file_url,
        issue_date, expiry_date, issuer, notes, uploaded_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [asset_id, COMPANY(req), doc_type, doc_name||null, file_url||null,
       issue_date||null, expiry_date||null, issuer||null, notes||null, req.user.id]);
    res.status(201).json({ data: r.rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/documents/:id', async (req, res) => {
  try {
    await query(`DELETE FROM asset_documents WHERE id=$1 AND company_id=$2`,
      [req.params.id, COMPANY(req)]);
    res.json({ message: 'Deleted' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ────────────────────────────────────────────────────────────────────
// ASSET ALLOCATIONS
// ────────────────────────────────────────────────────────────────────
router.get('/allocations', async (req, res) => {
  try {
    const { asset_id, project_id, status } = req.query;
    let sql = `
      SELECT al.*, a.asset_code, a.asset_name, a.asset_type,
             p.name AS project_name, u1.name AS issued_by_name
      FROM asset_allocations al
      JOIN assets a ON a.id = al.asset_id
      LEFT JOIN projects p ON p.id = al.project_id
      LEFT JOIN users u1 ON u1.id = al.issued_by
      WHERE al.company_id = $1`;
    const params = [COMPANY(req)]; let i = 2;
    if (asset_id)  { sql += ` AND al.asset_id = $${i++}`; params.push(asset_id); }
    if (project_id){ sql += ` AND al.project_id = $${i++}`; params.push(project_id); }
    if (status)    { sql += ` AND al.status = $${i++}`; params.push(status); }
    sql += ' ORDER BY al.issue_date DESC';
    res.json({ data: (await query(sql, params)).rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/allocations', async (req, res) => {
  try {
    const { asset_id, allocation_type, project_id, employee_name, department,
            issue_date, expected_return_date, issued_condition } = req.body;
    if (!asset_id) return res.status(400).json({ error: 'asset_id required' });
    // Close any open allocation
    await query(`UPDATE asset_allocations SET status='returned', actual_return_date=CURRENT_DATE
                 WHERE asset_id=$1 AND status='active'`, [asset_id]);
    const r = await query(`
      INSERT INTO asset_allocations (asset_id, company_id, allocation_type, project_id,
        employee_name, department, issue_date, expected_return_date, issued_condition, issued_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [asset_id, COMPANY(req), allocation_type||'project', project_id||null,
       employee_name||null, department||null, issue_date||new Date(),
       expected_return_date||null, issued_condition||'good', req.user.id]);
    // Update asset status + location
    await query(`UPDATE assets SET status='assigned', current_location=$1, assigned_date=$2,
                   expected_return_date=$3, updated_at=NOW() WHERE id=$4`,
      [project_id||null, issue_date||new Date(), expected_return_date||null, asset_id]);
    res.status(201).json({ data: r.rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.patch('/allocations/:id/return', async (req, res) => {
  try {
    const { return_condition, return_remarks } = req.body;
    const al = await query(`
      UPDATE asset_allocations SET status='returned', actual_return_date=CURRENT_DATE,
        return_condition=$1, return_remarks=$2, returned_by=$3
      WHERE id=$4 AND company_id=$5 RETURNING *`,
      [return_condition||'good', return_remarks||null, req.user.id,
       req.params.id, COMPANY(req)]);
    if (!al.rows.length) return res.status(404).json({ error: 'Allocation not found' });
    // Set asset back to available
    await query(`UPDATE assets SET status='available', current_location=NULL,
                   assigned_date=NULL, updated_at=NOW() WHERE id=$1`,
      [al.rows[0].asset_id]);
    res.json({ data: al.rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ────────────────────────────────────────────────────────────────────
// ASSET TRANSFERS
// ────────────────────────────────────────────────────────────────────
router.get('/transfers', async (req, res) => {
  try {
    const { asset_id, status } = req.query;
    let sql = `
      SELECT t.*, a.asset_code, a.asset_name,
             fp.name AS from_project_name, tp.name AS to_project_name,
             u1.name AS requested_by_name, u2.name AS approved_by_name
      FROM asset_transfers t
      JOIN assets a ON a.id = t.asset_id
      LEFT JOIN projects fp ON fp.id = t.from_project_id
      LEFT JOIN projects tp ON tp.id = t.to_project_id
      LEFT JOIN users u1 ON u1.id = t.requested_by
      LEFT JOIN users u2 ON u2.id = t.approved_by
      WHERE t.company_id = $1`;
    const params = [COMPANY(req)]; let i = 2;
    if (asset_id){ sql += ` AND t.asset_id = $${i++}`; params.push(asset_id); }
    if (status)  { sql += ` AND t.status = $${i++}`; params.push(status); }
    sql += ' ORDER BY t.transfer_date DESC';
    res.json({ data: (await query(sql, params)).rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/transfers', async (req, res) => {
  try {
    const { asset_id, from_project_id, to_project_id, from_location,
            to_location, transfer_date, reason, condition_out } = req.body;
    const r = await query(`
      INSERT INTO asset_transfers (asset_id, company_id, from_project_id, to_project_id,
        from_location, to_location, transfer_date, reason, condition_out, requested_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [asset_id, COMPANY(req), from_project_id||null, to_project_id||null,
       from_location||null, to_location||null, transfer_date||new Date(),
       reason||null, condition_out||null, req.user.id]);
    res.status(201).json({ data: r.rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.patch('/transfers/:id/approve', authorize('super_admin','admin','project_manager','managing_director'), async (req, res) => {
  try {
    const t = await query(`
      UPDATE asset_transfers SET status='approved', approved_by=$1, approved_at=NOW()
      WHERE id=$2 AND company_id=$3 AND status='pending' RETURNING *`,
      [req.user.id, req.params.id, COMPANY(req)]);
    if (!t.rows.length) return res.status(404).json({ error: 'Transfer not found or already processed' });
    // Update asset location
    await query(`UPDATE assets SET current_location=$1, updated_at=NOW() WHERE id=$2`,
      [t.rows[0].to_project_id, t.rows[0].asset_id]);
    res.json({ data: t.rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.patch('/transfers/:id/reject', authorize('super_admin','admin','project_manager','managing_director'), async (req, res) => {
  try {
    const t = await query(`
      UPDATE asset_transfers SET status='rejected', approved_by=$1, approved_at=NOW()
      WHERE id=$2 AND company_id=$3 AND status='pending' RETURNING *`,
      [req.user.id, req.params.id, COMPANY(req)]);
    res.json({ data: t.rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ────────────────────────────────────────────────────────────────────
// WORK ORDERS (Maintenance)
// ────────────────────────────────────────────────────────────────────
router.get('/work-orders', async (req, res) => {
  try {
    const { asset_id, status, wo_type } = req.query;
    let sql = `
      SELECT wo.*, a.asset_code, a.asset_name, a.asset_type,
             v.name AS vendor_name_resolved, u.name AS created_by_name
      FROM asset_work_orders wo
      JOIN assets a ON a.id = wo.asset_id
      LEFT JOIN vendors v ON v.id = wo.vendor_id
      LEFT JOIN users u ON u.id = wo.created_by
      WHERE wo.company_id = $1`;
    const params = [COMPANY(req)]; let i = 2;
    if (asset_id){ sql += ` AND wo.asset_id = $${i++}`; params.push(asset_id); }
    if (status)  { sql += ` AND wo.status = $${i++}`; params.push(status); }
    if (wo_type) { sql += ` AND wo.wo_type = $${i++}`; params.push(wo_type); }
    sql += ' ORDER BY wo.created_at DESC';
    res.json({ data: (await query(sql, params)).rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/work-orders', async (req, res) => {
  try {
    const { asset_id, wo_type, description, priority, scheduled_date,
            vendor_id, vendor_name, technician } = req.body;
    const cnt = (await query(`SELECT COALESCE(MAX(CAST(REGEXP_REPLACE(wo_number, '^.*-', '') AS INTEGER)), 0) AS last_seq
                              FROM asset_work_orders WHERE company_id=$1 AND wo_number ~ '[0-9]+$'`,[COMPANY(req)])).rows[0].last_seq;
    const wo_number = `WO-${dayjs().format('YYYY')}-${String(parseInt(cnt)+1).padStart(4,'0')}`;
    const r = await query(`
      INSERT INTO asset_work_orders (asset_id, company_id, wo_number, wo_type, description,
        priority, scheduled_date, vendor_id, vendor_name, technician, created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [asset_id, COMPANY(req), wo_number, wo_type||'preventive', description,
       priority||'medium', scheduled_date||null, vendor_id||null, vendor_name||null,
       technician||null, req.user.id]);
    // Set asset to maintenance
    if (wo_type === 'breakdown' || wo_type === 'emergency') {
      await query(`UPDATE assets SET status='breakdown', updated_at=NOW() WHERE id=$1`, [asset_id]);
    } else {
      await query(`UPDATE assets SET status='maintenance', updated_at=NOW() WHERE id=$1`, [asset_id]);
    }
    res.status(201).json({ data: r.rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.patch('/work-orders/:id/complete', async (req, res) => {
  try {
    const { work_done, labour_cost, parts_cost, downtime_hours, spare_parts,
            next_service_date, next_service_meter } = req.body;
    const total = (parseFloat(labour_cost||0) + parseFloat(parts_cost||0));
    const wo = await query(`
      UPDATE asset_work_orders SET status='completed', completion_date=CURRENT_DATE,
        work_done=$1, labour_cost=$2, parts_cost=$3, total_cost=$4,
        downtime_hours=$5, spare_parts=$6, next_service_date=$7, next_service_meter=$8,
        updated_at=NOW()
      WHERE id=$9 AND company_id=$10 RETURNING *`,
      [work_done||null, labour_cost||0, parts_cost||0, total, downtime_hours||0,
       spare_parts||null, next_service_date||null, next_service_meter||null,
       req.params.id, COMPANY(req)]);
    if (!wo.rows.length) return res.status(404).json({ error: 'Work order not found' });
    // Return asset to available + update service schedule
    await query(`UPDATE assets SET status='available', next_service_date=$1,
                   next_service_meter=$2, last_service_date=CURRENT_DATE, updated_at=NOW()
                 WHERE id=$3`,
      [next_service_date||null, next_service_meter||null, wo.rows[0].asset_id]);
    res.json({ data: wo.rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ────────────────────────────────────────────────────────────────────
// DISPOSALS
// ────────────────────────────────────────────────────────────────────
router.get('/disposals', async (req, res) => {
  try {
    const r = await query(`
      SELECT d.*, a.asset_code, a.asset_name, a.asset_type, a.purchase_value,
             u1.name AS requested_by_name, u2.name AS approved_by_name
      FROM asset_disposals d
      JOIN assets a ON a.id = d.asset_id
      LEFT JOIN users u1 ON u1.id = d.requested_by
      LEFT JOIN users u2 ON u2.id = d.approved_by
      WHERE d.company_id = $1 ORDER BY d.created_at DESC`, [COMPANY(req)]);
    res.json({ data: r.rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/disposals', async (req, res) => {
  try {
    const { asset_id, disposal_type, disposal_date, book_value,
            sale_value, scrap_value, buyer_name, reason } = req.body;
    const r = await query(`
      INSERT INTO asset_disposals (asset_id, company_id, disposal_type, disposal_date,
        book_value, sale_value, scrap_value, buyer_name, reason, requested_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [asset_id, COMPANY(req), disposal_type, disposal_date||new Date(),
       book_value||null, sale_value||0, scrap_value||0, buyer_name||null,
       reason||null, req.user.id]);
    res.status(201).json({ data: r.rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.patch('/disposals/:id/approve', authorize('super_admin','admin','managing_director'), async (req, res) => {
  try {
    const d = await query(`
      UPDATE asset_disposals SET status='approved', approved_by=$1, approved_at=NOW()
      WHERE id=$2 AND company_id=$3 AND status='pending' RETURNING *`,
      [req.user.id, req.params.id, COMPANY(req)]);
    if (!d.rows.length) return res.status(404).json({ error: 'Disposal not found' });
    // Mark asset as disposed
    await query(`UPDATE assets SET status='disposed', disposal_date=$1, disposal_type=$2,
                   disposal_value=$3, updated_at=NOW() WHERE id=$4`,
      [d.rows[0].disposal_date, d.rows[0].disposal_type,
       d.rows[0].sale_value || d.rows[0].scrap_value, d.rows[0].asset_id]);
    res.json({ data: d.rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ────────────────────────────────────────────────────────────────────
// DASHBOARD & REPORTS
// ────────────────────────────────────────────────────────────────────
router.get('/dashboard', async (req, res) => {
  try {
    const cid = COMPANY(req);
    const [assets, maintenance, expiry, allocations, disposals] = await Promise.all([
      // Asset status counts
      query(`SELECT status, COUNT(*) AS c FROM assets WHERE company_id=$1 GROUP BY status`,[cid]),
      // Open work orders
      query(`SELECT wo_type, COUNT(*) AS c FROM asset_work_orders WHERE company_id=$1 AND status IN ('open','in_progress') GROUP BY wo_type`,[cid]),
      // Expiring documents (30 days)
      query(`SELECT doc_type, COUNT(*) AS c FROM asset_documents WHERE company_id=$1
               AND expiry_date BETWEEN CURRENT_DATE AND CURRENT_DATE+30 GROUP BY doc_type`,[cid]),
      // Active allocations
      query(`SELECT COUNT(*) AS c FROM asset_allocations WHERE company_id=$1 AND status='active'`,[cid]),
      // Pending disposals
      query(`SELECT COUNT(*) AS c FROM asset_disposals WHERE company_id=$1 AND status='pending'`,[cid]),
    ]);

    const statusMap = {};
    assets.rows.forEach(r => { statusMap[r.status] = parseInt(r.c); });

    const totalValue = (await query(`SELECT SUM(purchase_value) AS v FROM assets WHERE company_id=$1 AND status != 'disposed'`,[cid])).rows[0].v || 0;
    const totalAssets = assets.rows.reduce((s,r) => s + parseInt(r.c), 0);

    // Category breakdown
    const byCat = await query(`
      SELECT COALESCE(c.name, 'Uncategorised') AS category, COUNT(*) AS c,
             SUM(a.purchase_value) AS total_value
      FROM assets a LEFT JOIN asset_categories c ON c.id = a.category_id
      WHERE a.company_id=$1 AND a.status != 'disposed'
      GROUP BY c.name ORDER BY COUNT(*) DESC LIMIT 8`,[cid]);

    // Recently added
    const recent = await query(`
      SELECT asset_code, asset_name, asset_type, purchase_value, status, created_at::date
      FROM assets WHERE company_id=$1 ORDER BY created_at DESC LIMIT 5`,[cid]);

    // Upcoming maintenance (15 days)
    const upcomingMaint = await query(`
      SELECT a.asset_code, a.asset_name, a.next_service_date,
             a.next_service_date - CURRENT_DATE AS days_until
      FROM assets a WHERE a.company_id=$1
        AND a.next_service_date IS NOT NULL
        AND a.next_service_date <= CURRENT_DATE + 15
        AND a.status != 'disposed'
      ORDER BY a.next_service_date`,[cid]);

    res.json({
      data: {
        summary: {
          total_assets: totalAssets,
          total_value: parseFloat(totalValue),
          available: statusMap['available'] || 0,
          assigned: statusMap['assigned'] || 0,
          maintenance: (statusMap['maintenance'] || 0) + (statusMap['breakdown'] || 0),
          disposed: statusMap['disposed'] || 0,
          open_work_orders: maintenance.rows.reduce((s,r)=>s+parseInt(r.c),0),
          expiring_docs: expiry.rows.reduce((s,r)=>s+parseInt(r.c),0),
          active_allocations: parseInt(allocations.rows[0]?.c||0),
          pending_disposals: parseInt(disposals.rows[0]?.c||0),
        },
        by_category: byCat.rows,
        recent_assets: recent.rows,
        upcoming_maintenance: upcomingMaint.rows,
        expiring_documents: expiry.rows,
        maintenance_by_type: maintenance.rows,
      }
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/reports/utilisation', async (req, res) => {
  try {
    const { project_id } = req.query;
    let sql = `
      SELECT a.asset_code, a.asset_name, a.asset_type, a.current_meter,
             a.total_operating_hrs, a.total_fuel_cost, a.status,
             p.name AS project_name,
             COALESCE(fuel.litres, 0) AS total_fuel_litres,
             COALESCE(usage.hours, 0) AS logged_hours,
             COALESCE(maint.cost, 0) AS maintenance_cost
      FROM assets a
      LEFT JOIN projects p ON p.id = a.current_location
      LEFT JOIN (SELECT asset_id, SUM(quantity) AS litres FROM asset_fuel_logs GROUP BY asset_id) fuel ON fuel.asset_id = a.id
      LEFT JOIN (SELECT asset_id, SUM(units_worked) AS hours FROM asset_usage_logs GROUP BY asset_id) usage ON usage.asset_id = a.id
      LEFT JOIN (SELECT asset_id, SUM(total_cost) AS cost FROM asset_work_orders WHERE status='completed' GROUP BY asset_id) maint ON maint.asset_id = a.id
      WHERE a.company_id = $1 AND a.status != 'disposed'`;
    const params = [COMPANY(req)];
    if (project_id) { sql += ` AND a.current_location = $2`; params.push(project_id); }
    sql += ' ORDER BY a.asset_code';
    res.json({ data: (await query(sql, params)).rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/reports/expiry', async (req, res) => {
  try {
    const r = await query(`
      SELECT a.asset_code, a.asset_name, a.asset_type,
        a.insurance_expiry, a.warranty_expiry, a.amc_expiry,
        a.fitness_expiry, a.pollution_expiry, a.road_tax_expiry,
        a.insurance_expiry - CURRENT_DATE AS insurance_days,
        a.warranty_expiry - CURRENT_DATE AS warranty_days,
        a.amc_expiry - CURRENT_DATE AS amc_days
      FROM assets a
      WHERE a.company_id = $1
        AND a.status != 'disposed'
        AND (
          a.insurance_expiry <= CURRENT_DATE + 60
          OR a.warranty_expiry <= CURRENT_DATE + 60
          OR a.amc_expiry <= CURRENT_DATE + 60
          OR a.fitness_expiry <= CURRENT_DATE + 60
          OR a.pollution_expiry <= CURRENT_DATE + 60
        )
      ORDER BY LEAST(
        COALESCE(a.insurance_expiry,'9999-12-31'),
        COALESCE(a.warranty_expiry,'9999-12-31'),
        COALESCE(a.amc_expiry,'9999-12-31')
      )`, [COMPANY(req)]);
    res.json({ data: r.rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
