// src/controllers/subcontractor.controller.js
const { query, withTransaction } = require('../config/database');
const { getNextDqsNumber } = require('../services/documentNumber.service');
const { createNotification } = require('./notification.controller');

function genBillNumber() {
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  const rand = String(Math.floor(1000 + Math.random() * 9000));
  return `RA-${ymd}-${rand}`;
}

async function ensureLabourTables() {
  await query(`
    CREATE TABLE IF NOT EXISTS subcontractor_workers (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id UUID NOT NULL,
      vendor_id UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
      project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
      worker_code VARCHAR(80),
      worker_name VARCHAR(200) NOT NULL,
      skill_type VARCHAR(120),
      daily_rate NUMERIC(14,2) DEFAULT 0,
      mobile VARCHAR(30),
      status VARCHAR(20) DEFAULT 'active',
      created_by UUID,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )`);
  await query(`
    CREATE TABLE IF NOT EXISTS subcontractor_labour_attendance (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id UUID NOT NULL,
      worker_id UUID NOT NULL REFERENCES subcontractor_workers(id) ON DELETE CASCADE,
      vendor_id UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
      project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
      wo_id UUID REFERENCES work_orders(id) ON DELETE SET NULL,
      attendance_date DATE NOT NULL,
      attendance_status VARCHAR(20) DEFAULT 'present',
      overtime_hours NUMERIC(8,2) DEFAULT 0,
      wage_amount NUMERIC(14,2) DEFAULT 0,
      remarks TEXT,
      created_by UUID,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )`);
}

async function ensureSettingsTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS subcontractor_settings (
      company_id UUID PRIMARY KEY,
      default_gst_pct NUMERIC(8,2) DEFAULT 18,
      default_tds_pct NUMERIC(8,2) DEFAULT 1,
      default_retention_pct NUMERIC(8,2) DEFAULT 5,
      default_security_pct NUMERIC(8,2) DEFAULT 0,
      require_approved_wo BOOLEAN DEFAULT TRUE,
      block_overbilling BOOLEAN DEFAULT TRUE,
      approval_flow TEXT[] DEFAULT ARRAY['site_engineer','project_manager','qs_billing','accounts_management'],
      updated_by UUID,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )`);
}

/** ── WORK ORDERS ───────────────────────────────────────────────────────────── */

// GET /api/v1/subcontractors/work-orders
const getWorkOrders = async (req, res) => {
  try {
    const { project_id, vendor_id, status } = req.query;
    let sql = `
      SELECT wo.*,
             wo.total_value AS contract_value,
             p.name AS project_name,
             p.id AS project_id,
             v.name AS vendor_name,
             v.vendor_type,
             v.gst_number AS vendor_gstin,
             v.pan_number AS vendor_pan,
             u.name AS manager_name,
             COALESCE(SUM(b.bill_amount), 0) + COALESCE(tqs_billed.total_billed, 0) AS total_billed,
             COALESCE(tqs_billed.total_paid, 0) AS total_paid
      FROM work_orders wo
      LEFT JOIN projects p ON wo.project_id = p.id
      LEFT JOIN vendors v ON wo.vendor_id = v.id
      LEFT JOIN users u ON wo.created_by = u.id
      LEFT JOIN subcontractor_bills b ON b.wo_id = wo.id
      LEFT JOIN (
        SELECT
          COALESCE(tb.wo_number, tb.po_number) AS wo_number,
          tb.vendor_id,
          tb.vendor_name,
          SUM(COALESCE(tb.basic_amount, tb.total_amount, 0)) AS total_billed,
          SUM(CASE WHEN tb.workflow_status = 'paid' THEN COALESCE(tb.basic_amount, tb.total_amount, 0) ELSE 0 END) AS total_paid
        FROM tqs_bills tb
        WHERE tb.is_deleted = FALSE
          AND (LOWER(COALESCE(tb.bill_type, '')) = 'wo' OR tb.wo_number IS NOT NULL OR tb.po_number ILIKE 'WO%')
        GROUP BY COALESCE(tb.wo_number, tb.po_number), tb.vendor_id, tb.vendor_name
      ) tqs_billed
        ON tqs_billed.wo_number = wo.wo_number
       AND (
         tqs_billed.vendor_id = wo.vendor_id
         OR (tqs_billed.vendor_id IS NULL AND LOWER(TRIM(tqs_billed.vendor_name)) = LOWER(TRIM(v.name)))
       )
      WHERE p.company_id = $1
        AND LOWER(v.vendor_type) IN ('sub-contractor', 'subcontractor', 'labour contractor', 'labour_contractor')
    `;
    const params = [req.user.company_id];
    let i = 2;

    if (project_id) { sql += ` AND wo.project_id = $${i++}`; params.push(project_id); }
    if (vendor_id)  { sql += ` AND wo.vendor_id = $${i++}`;  params.push(vendor_id); }
    if (status)     { sql += ` AND wo.status = $${i++}`;     params.push(status); }

    sql += ' GROUP BY wo.id, p.id, p.name, v.name, v.vendor_type, v.gst_number, v.pan_number, u.name, tqs_billed.total_billed, tqs_billed.total_paid ORDER BY COALESCE(wo.start_date, wo.created_at) DESC NULLS LAST';
    const result = await query(sql, params);
    res.json({ data: result.rows, count: result.rowCount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// GET /api/v1/subcontractors/work-orders/:id
const getWorkOrder = async (req, res) => {
  try {
    const woResult = await query(
      `SELECT wo.*,
              wo.total_value AS contract_value,
              p.name AS project_name, p.id AS project_id, p.project_code,
              v.name AS vendor_name, v.vendor_type,
              v.gst_number AS vendor_gstin, v.pan_number AS vendor_pan,
              v.address AS vendor_address,
              v.contact_person AS vendor_contact_person,
              v.phone AS vendor_phone, v.email AS vendor_email,
              u.name AS manager_name
       FROM work_orders wo
       JOIN projects p ON wo.project_id = p.id
       JOIN vendors v ON wo.vendor_id = v.id
       LEFT JOIN users u ON wo.created_by = u.id
       WHERE wo.id = $1 AND p.company_id = $2`,
      [req.params.id, req.user.company_id]
    );

    if (!woResult.rows[0]) return res.status(404).json({ error: 'Work Order not found.' });

    const itemsResult = await query(
      `SELECT
         woi.*,
         COALESCE(sub_billed.billed_qty, 0)
           + COALESCE(tqs_direct_billed.billed_qty, 0)
           + COALESCE(tqs_legacy_billed.billed_qty, 0) AS billed_qty,
         GREATEST(
           woi.quantity
             - COALESCE(sub_billed.billed_qty, 0)
             - COALESCE(tqs_direct_billed.billed_qty, 0)
             - COALESCE(tqs_legacy_billed.billed_qty, 0),
           0
         ) AS remaining_qty
       FROM work_order_items woi
       JOIN work_orders wo ON wo.id = woi.wo_id
       LEFT JOIN (
         SELECT bi.wo_item_id, SUM(bi.billed_qty) AS billed_qty
         FROM subcontractor_bill_items bi
         JOIN subcontractor_bills b ON b.id = bi.bill_id
         WHERE b.status <> 'rejected'
         GROUP BY bi.wo_item_id
       ) sub_billed ON sub_billed.wo_item_id = woi.id
       LEFT JOIN (
         SELECT li.wo_item_id, SUM(li.quantity) AS billed_qty
         FROM tqs_bill_line_items li
         JOIN tqs_bills b ON b.id = li.bill_id
         WHERE b.is_deleted = FALSE
           AND (LOWER(COALESCE(b.bill_type, '')) = 'wo' OR b.wo_number IS NOT NULL OR b.po_number ILIKE 'WO%')
           AND li.wo_item_id IS NOT NULL
         GROUP BY li.wo_item_id
       ) tqs_direct_billed ON tqs_direct_billed.wo_item_id = woi.id
       LEFT JOIN (
         SELECT
           COALESCE(b.wo_number, b.po_number) AS wo_number,
           LOWER(TRIM(COALESCE(li.item_name, ''))) AS item_name,
           COALESCE(li.unit, '') AS unit,
           SUM(li.quantity) AS billed_qty
         FROM tqs_bill_line_items li
         JOIN tqs_bills b ON b.id = li.bill_id
         WHERE b.is_deleted = FALSE
           AND li.wo_item_id IS NULL
           AND (LOWER(COALESCE(b.bill_type, '')) = 'wo' OR b.wo_number IS NOT NULL OR b.po_number ILIKE 'WO%')
         GROUP BY COALESCE(b.wo_number, b.po_number), LOWER(TRIM(COALESCE(li.item_name, ''))), COALESCE(li.unit, '')
       ) tqs_legacy_billed
         ON tqs_legacy_billed.wo_number = wo.wo_number
        AND tqs_legacy_billed.unit = COALESCE(woi.unit, '')
        AND (
          tqs_legacy_billed.item_name = LOWER(TRIM(COALESCE(woi.description, '')))
          OR (
            SELECT COUNT(*)
            FROM work_order_items same_unit
            WHERE same_unit.wo_id = wo.id
              AND COALESCE(same_unit.unit, '') = COALESCE(woi.unit, '')
          ) = 1
        )
       WHERE woi.wo_id = $1
       ORDER BY woi.id ASC`,
      [req.params.id]
    );

    res.json({ ...woResult.rows[0], items: itemsResult.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// POST /api/v1/subcontractors/work-orders
const createWorkOrder = async (req, res) => {
  const {
    project_id, vendor_id, subject, scope_of_work,
    contract_value, total_value,
    start_date, end_date, terms_conditions, items,
    cost_head, work_category, tower_block,
    gst_pct, tds_pct, retention_pct, advance_recovery_pct,
  } = req.body;

  const wo_date       = req.body.wo_date || new Date().toISOString().split('T')[0];
  const finalSubject  = subject || scope_of_work || '';
  const finalValue    = parseFloat(contract_value || total_value || 0);

  if (!project_id) return res.status(400).json({ error: 'project_id required' });
  if (!vendor_id)  return res.status(400).json({ error: 'vendor_id required' });
  if (!finalSubject) return res.status(400).json({ error: 'subject required' });

  try {
    let created;
    await withTransaction(async (client) => {
      const projRes = await client.query('SELECT project_code FROM projects WHERE id = $1', [project_id]);
      const wo_number = String(req.body.wo_number || '').trim().toUpperCase()
        || await getNextDqsNumber(client, 'work_orders', projRes.rows[0]?.project_code);

      // Validate vendor is active
      const vCheck = await client.query(`SELECT id FROM vendors WHERE id=$1`, [vendor_id]);
      if (!vCheck.rows.length) throw new Error('Vendor not found');

      const woResult = await client.query(
        `INSERT INTO work_orders
           (project_id, vendor_id, wo_number, wo_date,
            subject, work_description, scope_of_work,
            start_date, end_date, total_value, contract_amount,
            terms_conditions, cost_head, work_category, tower_block,
            status, created_by,
            gst_pct, tds_pct, retention_pct, advance_recovery_pct)
         VALUES ($1,$2,$3,$4,$5,$5,$6,$7,$8,$9,$9,$10,$11,$12,$13,'pending',$14,$15,$16,$17,$18)
         RETURNING *`,
        [
          project_id, vendor_id, wo_number, wo_date,
          finalSubject, scope_of_work || null,
          start_date || null, end_date || null, finalValue,
          terms_conditions || null,
          cost_head || null, work_category || null, tower_block || null,
          req.user.id,
          parseFloat(gst_pct) || 18, parseFloat(tds_pct) || 2,
          parseFloat(retention_pct) || 5, parseFloat(advance_recovery_pct) || 10,
        ]
      );
      const wo = woResult.rows[0];

      // Insert line items when provided (advanced flow) — update total_value from item sum
      if (items && items.length > 0) {
        let itemsTotal = 0;
        for (const item of items) {
          const qty  = parseFloat(item.quantity) || 0;
          const rate = parseFloat(item.rate)     || 0;
          itemsTotal += qty * rate;
          await client.query(
            `INSERT INTO work_order_items (wo_id, description, unit, quantity, rate, remarks)
             VALUES ($1,$2,$3,$4,$5,$6)`,
            [wo.id, item.description, item.unit, qty, rate, item.remarks || null]
          );
        }
        await client.query(
          `UPDATE work_orders SET total_value = $1, contract_amount = $1 WHERE id = $2`,
          [itemsTotal, wo.id]
        );
        wo.total_value = itemsTotal;
        wo.contract_amount = itemsTotal;
      }

      wo.contract_value = wo.total_value;
      created = wo;
    });

    res.status(201).json({ message: 'Work Order created successfully.', data: created });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/** ── MEASUREMENT BOOK ──────────────────────────────────────────────────────── */

// POST /api/v1/subcontractors/measurements
const createMeasurement = async (req, res) => {
  try {
    // Accept both frontend field names and internal names
    const wo_id = req.body.wo_id || req.body.work_order_id;
    const quantity = req.body.quantity || req.body.measured_qty;
    const {
      wo_item_id,
      measurement_date,
      item_description,
      unit,
      rate,
      remarks,
      location_details,
      photo_evidence,
      photo_urls,
      geo_lat,
      geo_lng,
      geo_address,
    } = req.body;

    const photos = Array.isArray(photo_urls) ? JSON.stringify(photo_urls) : '[]';

    const result = await query(
      `INSERT INTO subcontractor_measurements
         (wo_id, wo_item_id, measurement_date, quantity,
          item_description, unit, rate, remarks, location_details, photo_evidence,
          photo_urls, geo_lat, geo_lng, geo_address, recorded_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12,$13,$14,$15)
       RETURNING *`,
      [
        wo_id,
        wo_item_id || null,
        measurement_date || new Date().toISOString().split('T')[0],
        quantity,
        item_description || null,
        unit || null,
        rate ? parseFloat(rate) : null,
        remarks || null,
        location_details || null,
        photo_evidence || null,
        photos,
        geo_lat || null,
        geo_lng || null,
        geo_address || null,
        req.user?.id || null,
      ]
    );
    res.status(201).json({ message: 'Measurement recorded.', data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// GET /api/v1/subcontractors/measurements?project_id=&wo_id=&status=
const getMeasurements = async (req, res) => {
  try {
    const { project_id, wo_id, status } = req.query;
    let sql = `
      SELECT sm.*,
             sm.quantity        AS measured_qty,
             COALESCE(sm.item_description, woi.description) AS item_description,
             COALESCE(sm.unit, woi.unit)                    AS unit,
             COALESCE(sm.rate, woi.rate)                    AS rate,
             wo.wo_number,
             v.name  AS vendor_name,
             p.name  AS project_name
      FROM subcontractor_measurements sm
      JOIN work_orders wo ON sm.wo_id = wo.id
      JOIN projects p     ON wo.project_id = p.id
      JOIN vendors v      ON wo.vendor_id = v.id
      LEFT JOIN work_order_items woi ON sm.wo_item_id = woi.id
      WHERE p.company_id = $1`;
    const params = [req.user.company_id];
    let i = 2;
    if (project_id) { sql += ` AND wo.project_id = $${i++}`; params.push(project_id); }
    if (wo_id)      { sql += ` AND sm.wo_id = $${i++}`;      params.push(wo_id); }
    if (status)     { sql += ` AND sm.status = $${i++}`;     params.push(status); }
    sql += ' ORDER BY sm.measurement_date DESC, sm.id DESC';
    const result = await query(sql, params);
    res.json({ data: result.rows, count: result.rowCount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/** ── BILLING ───────────────────────────────────────────────────────────────── */

// POST /api/v1/subcontractors/bills
const createBill = async (req, res) => {
  try {
    // Accept both frontend simplified payload and advanced payload
    const wo_id = req.body.wo_id || req.body.work_order_id;
    const {
      bill_date,
      period_start,
      period_end,
      due_date,
      tax_amount,
      advance_recovery,
      other_deductions,
      remarks,
      items,                 // advanced flow: line items
      bill_type,             // 'ra' (default) | 'final' | 'advance' | 'extra_item'
    } = req.body;
    const billType = ['ra', 'final', 'advance', 'extra_item'].includes(bill_type) ? bill_type : 'ra';

    const bill_number = req.body.bill_number || genBillNumber();

    // Simplified flow: bill_amount + tax_amount + retention_percent
    const bill_amount     = parseFloat(req.body.bill_amount || 0);
    const taxAmt          = parseFloat(tax_amount || 0);
    const retentionPct    = parseFloat(req.body.retention_percent || req.body.retention_pct || 0);

    // Advanced flow deduction fields
    const tds_pct         = parseFloat(req.body.tds_pct || 0);
    const security_pct    = parseFloat(req.body.security_pct || 0);

    // Derive project_id from work order when not provided
    let project_id = req.body.project_id;
    if (!project_id) {
      const woRow = await query(
        `SELECT project_id FROM work_orders WHERE id = $1`, [wo_id]
      );
      if (!woRow.rows[0]) return res.status(400).json({ error: 'Work order not found.' });
      project_id = woRow.rows[0].project_id;
    }

    let created;
    await withTransaction(async (client) => {
      let grossAmount = bill_amount;

      // Advanced flow: compute gross from items array
      if (items && items.length > 0) {
        grossAmount = items.reduce((sum, item) => sum + (item.billed_qty * item.rate), 0);
      }

      const tdsAmount       = (grossAmount * tds_pct) / 100;
      const retentionAmount = (grossAmount * retentionPct) / 100;
      const securityAmount  = (grossAmount * security_pct) / 100;
      const advRecovery     = parseFloat(advance_recovery || 0);
      const otherDed        = parseFloat(other_deductions || 0);

      const netPayable = grossAmount + taxAmt
        - tdsAmount - retentionAmount - securityAmount - advRecovery - otherDed;

      const billResult = await client.query(
        `INSERT INTO subcontractor_bills (
           project_id, wo_id, bill_number, bill_date, period_start, period_end, due_date,
           bill_amount, tax_amount, retention_percent,
           gross_amount, tds_pct, tds_amount, retention_pct, retention_amount,
           security_pct, security_amount, advance_recovery, other_deductions,
           net_payable, remarks, bill_type
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
         RETURNING *`,
        [
          project_id, wo_id, bill_number,
          bill_date   || new Date().toISOString().split('T')[0],
          period_start || null,
          period_end   || null,
          due_date     || null,
          grossAmount, taxAmt, retentionPct,
          grossAmount, tds_pct, tdsAmount, retentionPct, retentionAmount,
          security_pct, securityAmount, advRecovery, otherDed,
          netPayable, remarks || null, billType,
        ]
      );
      const bill = billResult.rows[0];

      // Insert bill items and update measurement status (advanced flow)
      if (items && items.length > 0) {
        for (const item of items) {
          await client.query(
            `INSERT INTO subcontractor_bill_items
               (bill_id, wo_item_id, measurement_id, billed_qty, rate, amount)
             VALUES ($1,$2,$3,$4,$5,$6)`,
            [bill.id, item.wo_item_id, item.measurement_id || null,
             item.billed_qty, item.rate, item.billed_qty * item.rate]
          );
          if (item.measurement_id) {
            await client.query(
              `UPDATE subcontractor_measurements SET status = 'billed' WHERE id = $1`,
              [item.measurement_id]
            );
          }
        }
      }

      created = bill;
    });

    // Notify project managers that a new bill needs review
    createNotification({
      company_id:  req.user.company_id,
      target_role: 'project_manager',
      type:        'bill_pending_approval',
      title:       `New bill ${created.bill_number} awaiting review`,
      message:     `${billType.toUpperCase()} bill · ₹${Number(grossAmount).toLocaleString('en-IN', { maximumFractionDigits: 0 })} gross`,
      link:        `/subcontractor/hub`,
      severity:    'info',
      related_type:'bill', related_id: created.id,
      sendEmail:   true,
    });

    res.status(201).json({ message: 'Subcontractor Bill generated successfully.', data: created });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// GET /api/v1/subcontractors/bills
const getBills = async (req, res) => {
  try {
    const { project_id, wo_id } = req.query;
    let sql = `
      SELECT b.*,
             p.name          AS project_name,
             wo.wo_number,
             v.name          AS vendor_name
      FROM subcontractor_bills b
      JOIN projects p    ON b.project_id = p.id
      JOIN work_orders wo ON b.wo_id = wo.id
      JOIN vendors v     ON wo.vendor_id = v.id
      WHERE p.company_id = $1
        AND LOWER(v.vendor_type) IN ('sub-contractor', 'subcontractor', 'labour contractor', 'labour_contractor')
    `;
    const params = [req.user.company_id];
    let i = 2;

    if (project_id) { sql += ` AND b.project_id = $${i++}`; params.push(project_id); }
    if (wo_id)      { sql += ` AND b.wo_id = $${i++}`;      params.push(wo_id); }

    sql += ' ORDER BY b.bill_date DESC';
    const result = await query(sql, params);
    res.json({ data: result.rows, count: result.rowCount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// GET /api/v1/subcontractors/bills/:id
const getBill = async (req, res) => {
  try {
    const billResult = await query(
      `SELECT b.*,
              p.name    AS project_name,
              wo.wo_number,
              v.name    AS vendor_name,
              v.address AS vendor_address,
              v.gstin   AS vendor_gstin
       FROM subcontractor_bills b
       JOIN projects p    ON b.project_id = p.id
       JOIN work_orders wo ON b.wo_id = wo.id
       JOIN vendors v     ON wo.vendor_id = v.id
       WHERE b.id = $1 AND p.company_id = $2`,
      [req.params.id, req.user.company_id]
    );

    if (!billResult.rows[0]) return res.status(404).json({ error: 'Bill not found.' });

    const itemsResult = await query(
      `SELECT bi.*, woi.description, woi.unit
       FROM subcontractor_bill_items bi
       JOIN work_order_items woi ON bi.wo_item_id = woi.id
       WHERE bi.bill_id = $1 ORDER BY bi.id ASC`,
      [req.params.id]
    );

    res.json({ ...billResult.rows[0], items: itemsResult.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/** ── WORK ORDER UPDATE ─────────────────────────────────────────────────────── */

const VALID_WO_STATUSES = ['draft','pending','submitted','approved','active','completed','terminated','closed','rejected'];

// PATCH /api/v1/subcontractors/work-orders/:id
const updateWorkOrder = async (req, res) => {
  try {
    const {
      status, subject, terms_conditions, scope_of_work,
      start_date, end_date, total_value, contract_value,
      cost_head, work_category, tower_block, vendor_id,
      gst_pct, tds_pct, retention_pct, advance_recovery_pct,
      wo_number,
    } = req.body;

    if (status && !VALID_WO_STATUSES.includes(status))
      return res.status(400).json({ error: `Invalid status. Must be one of: ${VALID_WO_STATUSES.join(', ')}` });

    if (wo_number !== undefined) {
      const trimmed = String(wo_number).trim().toUpperCase();
      if (!trimmed) return res.status(400).json({ error: 'wo_number cannot be empty' });
      const dup = await query(
        `SELECT wo.id FROM work_orders wo
         JOIN projects p ON wo.project_id = p.id
         WHERE UPPER(TRIM(wo.wo_number)) = $1 AND wo.id <> $2 AND p.company_id = $3`,
        [trimmed, req.params.id, req.user.company_id]
      );
      if (dup.rows.length) return res.status(409).json({ error: `Work Order number ${trimmed} is already in use` });
    }

    const sets = [];
    const params = [req.params.id, req.user.company_id];
    let i = 3;

    if (wo_number         !== undefined) { sets.push(`wo_number = $${i++}`);                           params.push(String(wo_number).trim().toUpperCase()); }
    if (status            !== undefined) { sets.push(`status = $${i++}`);                              params.push(status); }
    if (subject           !== undefined) { sets.push(`subject = $${i}, work_description = $${i++}`);  params.push(subject); }
    if (scope_of_work     !== undefined) { sets.push(`scope_of_work = $${i++}`);                      params.push(scope_of_work); }
    if (terms_conditions  !== undefined) { sets.push(`terms_conditions = $${i++}`);                   params.push(terms_conditions); }
    if (start_date        !== undefined) { sets.push(`start_date = $${i++}`);                         params.push(start_date || null); }
    if (end_date          !== undefined) { sets.push(`end_date = $${i++}`);                           params.push(end_date || null); }
    if (cost_head         !== undefined) { sets.push(`cost_head = $${i++}`);                          params.push(cost_head || null); }
    if (work_category     !== undefined) { sets.push(`work_category = $${i++}`);                      params.push(work_category || null); }
    if (tower_block       !== undefined) { sets.push(`tower_block = $${i++}`);                        params.push(tower_block || null); }
    if (vendor_id            !== undefined) { sets.push(`vendor_id = $${i++}`);              params.push(vendor_id); }
    if (gst_pct              !== undefined && gst_pct !== '')              { sets.push(`gst_pct = $${i++}`);              params.push(parseFloat(gst_pct) || 0); }
    if (tds_pct              !== undefined && tds_pct !== '')              { sets.push(`tds_pct = $${i++}`);              params.push(parseFloat(tds_pct) || 0); }
    if (retention_pct        !== undefined && retention_pct !== '')        { sets.push(`retention_pct = $${i++}`);        params.push(parseFloat(retention_pct) || 0); }
    if (advance_recovery_pct !== undefined && advance_recovery_pct !== '') { sets.push(`advance_recovery_pct = $${i++}`); params.push(parseFloat(advance_recovery_pct) || 0); }

    const finalValue = parseFloat(contract_value || total_value || 0);
    if ((contract_value !== undefined || total_value !== undefined) && finalValue > 0) {
      sets.push(`total_value = $${i}, contract_amount = $${i++}`);
      params.push(finalValue);
    }

    if (!sets.length) return res.status(400).json({ error: 'Nothing to update' });
    sets.push(`updated_at = NOW()`);

    const result = await query(
      `UPDATE work_orders SET ${sets.join(', ')}
       WHERE id = $1
         AND project_id IN (SELECT id FROM projects WHERE company_id = $2)
       RETURNING *`,
      params
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Work order not found' });
    const row = result.rows[0];
    res.json({ data: { ...row, contract_value: row.total_value || row.contract_amount } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/** ── BILL UPDATE (approve / pay) ───────────────────────────────────────────── */

// PATCH /api/v1/subcontractors/bills/:id
const updateBill = async (req, res) => {
  try {
    const { status, payment_date, payment_ref, payment_mode } = req.body;
    const check = await query(
      `SELECT b.id FROM subcontractor_bills b
       JOIN projects p ON b.project_id = p.id
       WHERE b.id = $1 AND p.company_id = $2`,
      [req.params.id, req.user.company_id]
    );
    if (!check.rows[0]) return res.status(404).json({ error: 'Bill not found' });

    const sets = ['updated_at = NOW()'];
    const params = [req.params.id];
    let i = 2;
    if (status)       { sets.push(`status = $${i++}`);       params.push(status); }
    if (payment_date) { sets.push(`payment_date = $${i++}`); params.push(payment_date); }
    if (payment_ref)  { sets.push(`payment_ref = $${i++}`);  params.push(payment_ref); }
    if (payment_mode) { sets.push(`payment_mode = $${i++}`); params.push(payment_mode); }

    const result = await query(
      `UPDATE subcontractor_bills SET ${sets.join(', ')} WHERE id = $1 RETURNING *`,
      params
    );
    res.json({ data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/** ── DASHBOARD / SUMMARY ────────────────────────────────────────────────────── */

// GET /api/v1/subcontractors/dashboard?project_id=
const getDashboard = async (req, res) => {
  try {
    const { project_id } = req.query;
    const cond   = project_id ? 'AND wo.project_id = $2' : '';
    const params = project_id ? [req.user.company_id, project_id] : [req.user.company_id];

    const [kpi, byVendor] = await Promise.all([
      query(`
        SELECT
          COUNT(DISTINCT wo.id)::int                                           AS total_wo,
          COUNT(DISTINCT CASE WHEN wo.status IN ('active','approved') THEN wo.id END)::int AS active_wo,
          COALESCE(SUM(wo.total_value), 0)                                    AS total_contract_value,
          COALESCE(SUM(b.bill_amount), 0) + COALESCE(SUM(tb.basic_amount), 0) AS total_billed,
          COALESCE(SUM(CASE WHEN b.status = 'paid' THEN b.net_payable END), 0)
            + COALESCE(SUM(CASE WHEN tb.workflow_status = 'paid' THEN tb.basic_amount END), 0) AS total_paid,
          COUNT(DISTINCT CASE WHEN b.status = 'pending' THEN b.id END)::int   AS bills_pending_approval
        FROM work_orders wo
        JOIN projects p ON wo.project_id = p.id
        JOIN vendors v  ON wo.vendor_id = v.id
        LEFT JOIN subcontractor_bills b ON b.wo_id = wo.id
        LEFT JOIN tqs_bills tb ON tb.is_deleted = FALSE
          AND UPPER(TRIM(COALESCE(tb.wo_number, tb.po_number))) = UPPER(TRIM(wo.wo_number))
        WHERE p.company_id = $1 ${cond}
          AND LOWER(v.vendor_type) IN ('sub-contractor', 'subcontractor', 'labour contractor', 'labour_contractor')
      `, params),
      query(`
        SELECT
          v.name                                                               AS vendor_name,
          COUNT(DISTINCT wo.id)::int                                          AS wo_count,
          COALESCE(SUM(wo.total_value), 0)                                    AS contract_value,
          COALESCE(SUM(b.bill_amount), 0) + COALESCE(SUM(tb.basic_amount), 0) AS billed_amount,
          COALESCE(SUM(CASE WHEN b.status='paid' THEN b.net_payable END), 0)
            + COALESCE(SUM(CASE WHEN tb.workflow_status = 'paid' THEN tb.basic_amount END), 0) AS paid_amount
        FROM work_orders wo
        JOIN projects p ON wo.project_id = p.id
        JOIN vendors v  ON wo.vendor_id = v.id
        LEFT JOIN subcontractor_bills b ON b.wo_id = wo.id
        LEFT JOIN tqs_bills tb ON tb.is_deleted = FALSE
          AND UPPER(TRIM(COALESCE(tb.wo_number, tb.po_number))) = UPPER(TRIM(wo.wo_number))
        WHERE p.company_id = $1 ${cond}
          AND LOWER(v.vendor_type) IN ('sub-contractor', 'subcontractor', 'labour contractor', 'labour_contractor')
        GROUP BY v.id, v.name
        ORDER BY contract_value DESC
      `, params),
    ]);

    res.json({ kpi: kpi.rows[0], byVendor: byVendor.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/** ── SUBCONTRACTOR MASTER (vendors filtered) ───────────────────────────────── */

// GET /api/v1/subcontractors/list
// All vendors classified as Sub-contractor or Labour Contractor + their stats.
const listSubcontractors = async (req, res) => {
  try {
    const { status, trade_category, search, project_id } = req.query;
    const params = [req.user.company_id];
    let i = 2;

    // Base query: always get company-wide stats per vendor
    let sql = `
      SELECT v.*,
             COALESCE(stats.wo_count, 0)       AS wo_count,
             COALESCE(stats.contract_value, 0) AS contract_value,
             COALESCE(stats.billed_amount, 0)  AS billed_amount,
             COALESCE(stats.paid_amount, 0)    AS paid_amount,
             CASE
               WHEN v.contract_end_date IS NOT NULL AND v.contract_end_date < CURRENT_DATE THEN 'expired'
               WHEN v.contract_end_date IS NOT NULL AND v.contract_end_date < CURRENT_DATE + INTERVAL '30 days' THEN 'expiring_soon'
               ELSE 'ok'
             END AS contract_health
      FROM vendors v
      LEFT JOIN (
        SELECT wo.vendor_id,
               COUNT(DISTINCT wo.id)::int                                                     AS wo_count,
               COALESCE(SUM(wo.total_value), 0)                                               AS contract_value,
               COALESCE(SUM(b.bill_amount), 0)                                                AS billed_amount,
               COALESCE(SUM(CASE WHEN b.status = 'paid' THEN b.net_payable END), 0)           AS paid_amount
        FROM work_orders wo
        LEFT JOIN subcontractor_bills b ON b.wo_id = wo.id
        GROUP BY wo.vendor_id
      ) stats ON stats.vendor_id = v.id
      WHERE v.company_id = $1
        AND LOWER(v.vendor_type) IN ('sub-contractor','subcontractor','labour contractor','labour_contractor')
    `;

    // Project filter: restrict to vendors that have WOs in this project
    if (project_id) {
      sql += ` AND v.id IN (SELECT DISTINCT vendor_id FROM work_orders WHERE project_id = $${i++})`;
      params.push(project_id);
    }

    if (status)         { sql += ` AND v.subcontractor_status = $${i++}`; params.push(status); }
    if (trade_category) { sql += ` AND v.trade_category = $${i++}`;       params.push(trade_category); }
    if (search) {
      sql += ` AND (v.name ILIKE $${i} OR v.contact_person ILIKE $${i} OR v.gstin ILIKE $${i})`;
      params.push(`%${search}%`); i++;
    }
    sql += ' ORDER BY v.name ASC';
    const result = await query(sql, params);
    res.json({ data: result.rows, count: result.rowCount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// GET /api/v1/subcontractors/workers?project_id=&vendor_id=&status=
const listWorkers = async (req, res) => {
  try {
    await ensureLabourTables();
    const { project_id, vendor_id, status, search } = req.query;
    const params = [req.user.company_id];
    let i = 2;
    let sql = `
      SELECT w.*, v.name AS vendor_name, p.name AS project_name
      FROM subcontractor_workers w
      JOIN vendors v ON v.id = w.vendor_id
      LEFT JOIN projects p ON p.id = w.project_id
      WHERE w.company_id = $1`;
    if (project_id) { sql += ` AND w.project_id = $${i++}`; params.push(project_id); }
    if (vendor_id)  { sql += ` AND w.vendor_id = $${i++}`;  params.push(vendor_id); }
    if (status)     { sql += ` AND w.status = $${i++}`;     params.push(status); }
    if (search) {
      sql += ` AND (w.worker_name ILIKE $${i} OR w.worker_code ILIKE $${i} OR w.skill_type ILIKE $${i})`;
      params.push(`%${search}%`);
      i++;
    }
    sql += ` ORDER BY w.created_at DESC`;
    const result = await query(sql, params);
    res.json({ data: result.rows, count: result.rowCount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// POST /api/v1/subcontractors/workers
const createWorker = async (req, res) => {
  try {
    await ensureLabourTables();
    const { vendor_id, project_id, worker_code, worker_name, skill_type, daily_rate, mobile, status } = req.body;
    if (!vendor_id || !worker_name) return res.status(400).json({ error: 'vendor_id and worker_name are required.' });
    const result = await query(
      `INSERT INTO subcontractor_workers
        (company_id, vendor_id, project_id, worker_code, worker_name, skill_type, daily_rate, mobile, status, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING *`,
      [
        req.user.company_id, vendor_id, project_id || null, worker_code || null, worker_name,
        skill_type || null, parseFloat(daily_rate || 0), mobile || null, status || 'active', req.user.id,
      ]
    );
    res.status(201).json({ data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// GET /api/v1/subcontractors/labour-attendance?project_id=&vendor_id=&from=&to=
const listLabourAttendance = async (req, res) => {
  try {
    await ensureLabourTables();
    const { project_id, vendor_id, worker_id, from, to } = req.query;
    const params = [req.user.company_id];
    let i = 2;
    let sql = `
      SELECT a.*, w.worker_name, w.worker_code, w.skill_type,
             v.name AS vendor_name, p.name AS project_name, wo.wo_number
      FROM subcontractor_labour_attendance a
      JOIN subcontractor_workers w ON w.id = a.worker_id
      JOIN vendors v ON v.id = a.vendor_id
      LEFT JOIN projects p ON p.id = a.project_id
      LEFT JOIN work_orders wo ON wo.id = a.wo_id
      WHERE a.company_id = $1`;
    if (project_id) { sql += ` AND a.project_id = $${i++}`; params.push(project_id); }
    if (vendor_id)  { sql += ` AND a.vendor_id = $${i++}`;  params.push(vendor_id); }
    if (worker_id)  { sql += ` AND a.worker_id = $${i++}`;  params.push(worker_id); }
    if (from)       { sql += ` AND a.attendance_date >= $${i++}`; params.push(from); }
    if (to)         { sql += ` AND a.attendance_date <= $${i++}`; params.push(to); }
    sql += ` ORDER BY a.attendance_date DESC, a.created_at DESC`;
    const result = await query(sql, params);
    res.json({ data: result.rows, count: result.rowCount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// POST /api/v1/subcontractors/labour-attendance
const createLabourAttendance = async (req, res) => {
  try {
    await ensureLabourTables();
    const { worker_id, vendor_id, project_id, wo_id, attendance_date, attendance_status, overtime_hours, wage_amount, remarks } = req.body;
    if (!worker_id || !vendor_id || !attendance_date) {
      return res.status(400).json({ error: 'worker_id, vendor_id and attendance_date are required.' });
    }
    const result = await query(
      `INSERT INTO subcontractor_labour_attendance
        (company_id, worker_id, vendor_id, project_id, wo_id, attendance_date,
         attendance_status, overtime_hours, wage_amount, remarks, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       RETURNING *`,
      [
        req.user.company_id, worker_id, vendor_id, project_id || null, wo_id || null,
        attendance_date, attendance_status || 'present', parseFloat(overtime_hours || 0),
        parseFloat(wage_amount || 0), remarks || null, req.user.id,
      ]
    );
    res.status(201).json({ data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// GET /api/v1/subcontractors/settings
const getSettings = async (req, res) => {
  try {
    await ensureSettingsTable();
    const result = await query(
      `INSERT INTO subcontractor_settings (company_id)
       VALUES ($1)
       ON CONFLICT (company_id) DO NOTHING
       RETURNING *`,
      [req.user.company_id]
    );
    if (result.rows[0]) return res.json({ data: result.rows[0] });
    const existing = await query(`SELECT * FROM subcontractor_settings WHERE company_id = $1`, [req.user.company_id]);
    res.json({ data: existing.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// PATCH /api/v1/subcontractors/settings
const updateSettings = async (req, res) => {
  try {
    await ensureSettingsTable();
    const {
      default_gst_pct,
      default_tds_pct,
      default_retention_pct,
      default_security_pct,
      require_approved_wo,
      block_overbilling,
      approval_flow,
    } = req.body;
    const result = await query(
      `INSERT INTO subcontractor_settings
        (company_id, default_gst_pct, default_tds_pct, default_retention_pct,
         default_security_pct, require_approved_wo, block_overbilling, approval_flow, updated_by, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8::text[],$9,NOW())
       ON CONFLICT (company_id) DO UPDATE SET
         default_gst_pct = EXCLUDED.default_gst_pct,
         default_tds_pct = EXCLUDED.default_tds_pct,
         default_retention_pct = EXCLUDED.default_retention_pct,
         default_security_pct = EXCLUDED.default_security_pct,
         require_approved_wo = EXCLUDED.require_approved_wo,
         block_overbilling = EXCLUDED.block_overbilling,
         approval_flow = EXCLUDED.approval_flow,
         updated_by = EXCLUDED.updated_by,
         updated_at = NOW()
       RETURNING *`,
      [
        req.user.company_id,
        parseFloat(default_gst_pct ?? 18),
        parseFloat(default_tds_pct ?? 1),
        parseFloat(default_retention_pct ?? 5),
        parseFloat(default_security_pct ?? 0),
        require_approved_wo !== false,
        block_overbilling !== false,
        Array.isArray(approval_flow) && approval_flow.length ? approval_flow : ['site_engineer', 'project_manager', 'qs_billing', 'accounts_management'],
        req.user.id,
      ]
    );
    res.json({ data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/** ── DOCUMENT MANAGEMENT ───────────────────────────────────────────────────── */

// GET /api/v1/subcontractors/:vendorId/documents
const listDocuments = async (req, res) => {
  try {
    const result = await query(
      `SELECT d.*, u.name AS uploaded_by_name,
              CASE
                WHEN d.expiry_date IS NULL THEN 'no_expiry'
                WHEN d.expiry_date < CURRENT_DATE THEN 'expired'
                WHEN d.expiry_date < CURRENT_DATE + INTERVAL '30 days' THEN 'expiring_soon'
                ELSE 'valid'
              END AS expiry_status
       FROM subcontractor_documents d
       LEFT JOIN users u ON d.uploaded_by = u.id
       JOIN vendors v ON d.vendor_id = v.id
       WHERE d.vendor_id = $1 AND v.company_id = $2
       ORDER BY d.created_at DESC`,
      [req.params.vendorId, req.user.company_id]
    );
    res.json({ data: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// POST /api/v1/subcontractors/:vendorId/documents
const createDocument = async (req, res) => {
  try {
    const { doc_type, title, file_url, file_name, file_size, issued_date, expiry_date, notes } = req.body;
    if (!doc_type || !file_url) return res.status(400).json({ error: 'doc_type and file_url are required.' });

    // Verify vendor belongs to this company
    const v = await query(
      `SELECT id FROM vendors WHERE id = $1 AND company_id = $2`,
      [req.params.vendorId, req.user.company_id]
    );
    if (!v.rows[0]) return res.status(404).json({ error: 'Subcontractor not found.' });

    const result = await query(
      `INSERT INTO subcontractor_documents
         (vendor_id, doc_type, title, file_url, file_name, file_size,
          issued_date, expiry_date, notes, uploaded_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING *`,
      [
        req.params.vendorId, doc_type, title || null, file_url,
        file_name || null, file_size || null,
        issued_date || null, expiry_date || null, notes || null,
        req.user?.id || null,
      ]
    );
    res.status(201).json({ message: 'Document uploaded.', data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// DELETE /api/v1/subcontractors/:vendorId/documents/:docId
const deleteDocument = async (req, res) => {
  try {
    const result = await query(
      `DELETE FROM subcontractor_documents d
       USING vendors v
       WHERE d.id = $1 AND d.vendor_id = $2 AND v.id = d.vendor_id AND v.company_id = $3
       RETURNING d.id`,
      [req.params.docId, req.params.vendorId, req.user.company_id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Document not found.' });
    res.json({ message: 'Document deleted.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// GET /api/v1/subcontractors/documents/expiring?days=30
// All documents/contracts expiring within N days (alerts feed).
const listExpiringDocuments = async (req, res) => {
  try {
    const days = parseInt(req.query.days || '30', 10);
    const [docs, contracts] = await Promise.all([
      query(
        `SELECT d.*, v.name AS vendor_name, v.id AS vendor_id,
                (d.expiry_date - CURRENT_DATE)::int AS days_remaining
         FROM subcontractor_documents d
         JOIN vendors v ON d.vendor_id = v.id
         WHERE v.company_id = $1
           AND d.expiry_date IS NOT NULL
           AND d.expiry_date <= CURRENT_DATE + ($2 || ' days')::interval
           AND d.is_active = TRUE
         ORDER BY d.expiry_date ASC`,
        [req.user.company_id, days]
      ),
      query(
        `SELECT id AS vendor_id, name AS vendor_name, contract_end_date,
                (contract_end_date - CURRENT_DATE)::int AS days_remaining
         FROM vendors
         WHERE company_id = $1
           AND contract_end_date IS NOT NULL
           AND contract_end_date <= CURRENT_DATE + ($2 || ' days')::interval
           AND LOWER(vendor_type) IN ('sub-contractor','subcontractor','labour contractor','labour_contractor')
         ORDER BY contract_end_date ASC`,
        [req.user.company_id, days]
      ),
    ]);
    res.json({ documents: docs.rows, contracts: contracts.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/** ── BILL APPROVAL WORKFLOW ────────────────────────────────────────────────── */

const STAGE_FLOW = {
  site_engineer:   { next: 'project_manager', next_status: 'submitted' },
  project_manager: { next: 'accounts',        next_status: 'approved'  },
  accounts:        { next: 'finance_head',    next_status: 'approved'  },
  finance_head:    { next: 'paid',            next_status: 'paid'      },
};
const STAGE_LABEL = {
  site_engineer:   'Site Engineer',
  project_manager: 'Project Manager',
  accounts:        'Accounts',
  finance_head:    'Finance Head',
  paid:            'Paid',
};

// POST /api/v1/subcontractors/bills/:id/approve
const approveBill = async (req, res) => {
  try {
    const { comments } = req.body;
    const check = await query(
      `SELECT b.*, v.name AS vendor_name
       FROM subcontractor_bills b
       JOIN projects p ON b.project_id = p.id
       JOIN work_orders wo ON b.wo_id = wo.id
       JOIN vendors v ON wo.vendor_id = v.id
       WHERE b.id = $1 AND p.company_id = $2`,
      [req.params.id, req.user.company_id]
    );
    if (!check.rows[0]) return res.status(404).json({ error: 'Bill not found' });
    const bill = check.rows[0];

    const currentStage = bill.current_stage || 'site_engineer';
    const flow = STAGE_FLOW[currentStage];
    if (!flow) return res.status(400).json({ error: 'Bill is already fully processed.' });

    const nextStage = flow.next;
    const newStatus = flow.next_status;
    const isPaid = nextStage === 'paid';

    await withTransaction(async (client) => {
      // Update bill
      await client.query(
        `UPDATE subcontractor_bills
         SET status = $1, current_stage = $2, updated_at = NOW(),
             submitted_at = COALESCE(submitted_at, CASE WHEN $1 = 'submitted' THEN NOW() ELSE NULL END),
             approved_at  = CASE WHEN $1 IN ('approved','paid') AND approved_at IS NULL THEN NOW() ELSE approved_at END,
             payment_date = CASE WHEN $3 THEN COALESCE(payment_date, CURRENT_DATE) ELSE payment_date END
         WHERE id = $4`,
        [newStatus, nextStage, isPaid, req.params.id]
      );

      // Audit row
      await client.query(
        `INSERT INTO subcontractor_bill_approvals
           (bill_id, action, from_status, to_status, stage, comments, actor_id, actor_name, actor_role)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [
          req.params.id, isPaid ? 'paid' : 'approved',
          bill.status, newStatus, currentStage, comments || null,
          req.user.id, req.user.name || req.user.email, req.user.role,
        ]
      );
    });

    // Notify next stage owners (broadcast to role)
    if (!isPaid) {
      createNotification({
        company_id:  req.user.company_id,
        target_role: nextStage,
        type:        'bill_pending_approval',
        title:       `Bill ${bill.bill_number} awaiting your approval`,
        message:     `${bill.vendor_name} · ${STAGE_LABEL[nextStage]} action needed.`,
        link:        `/subcontractor/hub`,
        severity:    'info',
        related_type:'bill', related_id: req.params.id,
        sendEmail:   true,
      });
    }

    res.json({ message: isPaid ? 'Bill marked paid' : 'Bill approved and forwarded.', stage: nextStage, status: newStatus });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// POST /api/v1/subcontractors/bills/:id/reject
const rejectBill = async (req, res) => {
  try {
    const { comments } = req.body;
    if (!comments || !comments.trim()) return res.status(400).json({ error: 'Rejection reason is required.' });

    const check = await query(
      `SELECT b.*, v.name AS vendor_name
       FROM subcontractor_bills b
       JOIN projects p ON b.project_id = p.id
       JOIN work_orders wo ON b.wo_id = wo.id
       JOIN vendors v ON wo.vendor_id = v.id
       WHERE b.id = $1 AND p.company_id = $2`,
      [req.params.id, req.user.company_id]
    );
    if (!check.rows[0]) return res.status(404).json({ error: 'Bill not found' });
    const bill = check.rows[0];

    await withTransaction(async (client) => {
      await client.query(
        `UPDATE subcontractor_bills
         SET status = 'rejected', rejected_at = NOW(), rejection_reason = $1, updated_at = NOW()
         WHERE id = $2`,
        [comments, req.params.id]
      );
      await client.query(
        `INSERT INTO subcontractor_bill_approvals
           (bill_id, action, from_status, to_status, stage, comments, actor_id, actor_name, actor_role)
         VALUES ($1,'rejected',$2,'rejected',$3,$4,$5,$6,$7)`,
        [req.params.id, bill.status, bill.current_stage, comments, req.user.id, req.user.name || req.user.email, req.user.role]
      );
    });

    createNotification({
      company_id:  req.user.company_id,
      target_role: 'site_engineer',
      type:        'bill_rejected',
      title:       `Bill ${bill.bill_number} rejected`,
      message:     `${bill.vendor_name} · Reason: ${comments.slice(0, 100)}`,
      link:        `/subcontractor/hub`,
      severity:    'warning',
      related_type:'bill', related_id: req.params.id,
      sendEmail:   true,
    });

    res.json({ message: 'Bill rejected.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// GET /api/v1/subcontractors/bills/:id/approvals
const getBillApprovals = async (req, res) => {
  try {
    const check = await query(
      `SELECT b.id FROM subcontractor_bills b
       JOIN projects p ON b.project_id = p.id
       WHERE b.id = $1 AND p.company_id = $2`,
      [req.params.id, req.user.company_id]
    );
    if (!check.rows[0]) return res.status(404).json({ error: 'Bill not found' });

    const result = await query(
      `SELECT * FROM subcontractor_bill_approvals
       WHERE bill_id = $1
       ORDER BY created_at ASC`,
      [req.params.id]
    );
    res.json({ data: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/** ── SUBCONTRACTOR REPORTS ─────────────────────────────────────────────────── */

// GET /api/v1/subcontractors/reports/ledger?vendor_id=&from=&to=&project_id=
const reportLedger = async (req, res) => {
  try {
    const { vendor_id, from, to, project_id } = req.query;
    const params = [req.user.company_id];
    let i = 2;

    // Bill filters
    let billWhere = `p.company_id = $1`;
    if (project_id) { billWhere += ` AND b.project_id = $${i++}`; params.push(project_id); }
    if (vendor_id)  { billWhere += ` AND wo.vendor_id = $${i++}`; params.push(vendor_id); }
    if (from)       { billWhere += ` AND b.bill_date >= $${i++}`; params.push(from); }
    if (to)         { billWhere += ` AND b.bill_date <= $${i++}`; params.push(to); }

    // Advance filters use same param slots
    let advWhere = `pr.company_id = $1`;
    if (project_id) { advWhere += ` AND a.project_id = $2`; }
    if (vendor_id)  { advWhere += ` AND a.vendor_id = $${project_id ? 3 : 2}`; }

    const result = await query(`
      SELECT 'bill' AS entry_type,
             b.bill_date   AS date,
             v.id          AS vendor_id,
             v.name        AS vendor_name,
             p.name        AS project_name,
             wo.wo_number,
             b.bill_number AS reference,
             b.bill_type,
             b.status,
             b.gross_amount,
             b.tax_amount,
             b.tds_amount,
             b.retention_amount,
             b.advance_recovery,
             b.other_deductions,
             b.net_payable,
             b.payment_date,
             NULL::numeric  AS advance_amount,
             NULL::varchar  AS advance_type
        FROM subcontractor_bills b
        JOIN projects    p  ON p.id  = b.project_id
        JOIN work_orders wo ON wo.id = b.wo_id
        JOIN vendors     v  ON v.id  = wo.vendor_id
       WHERE ${billWhere}
         AND LOWER(v.vendor_type) IN ('sub-contractor','subcontractor','labour contractor','labour_contractor')

      UNION ALL

      SELECT 'advance' AS entry_type,
             a.advance_date AS date,
             v.id           AS vendor_id,
             v.name         AS vendor_name,
             pr.name        AS project_name,
             wo.wo_number,
             COALESCE(a.payment_ref, 'ADV-' || LEFT(a.id::text, 8)) AS reference,
             NULL           AS bill_type,
             a.recovery_status AS status,
             NULL::numeric  AS gross_amount,
             NULL::numeric  AS tax_amount,
             NULL::numeric  AS tds_amount,
             NULL::numeric  AS retention_amount,
             NULL::numeric  AS advance_recovery,
             NULL::numeric  AS other_deductions,
             NULL::numeric  AS net_payable,
             NULL::date     AS payment_date,
             a.amount       AS advance_amount,
             a.advance_type AS advance_type
        FROM subcontractor_advances a
        JOIN vendors     v  ON v.id  = a.vendor_id
        JOIN projects    pr ON pr.id = a.project_id
        JOIN work_orders wo ON wo.id = a.wo_id
       WHERE ${advWhere}

      ORDER BY vendor_name, date, entry_type
    `, params);
    res.json({ data: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// GET /api/v1/subcontractors/reports/deduction-summary?project_id=&from=&to=
const reportDeductionSummary = async (req, res) => {
  try {
    const { project_id, from, to } = req.query;
    const params = [req.user.company_id];
    let i = 2;
    let where = `p.company_id = $1`;
    if (project_id) { where += ` AND b.project_id = $${i++}`; params.push(project_id); }
    if (from) { where += ` AND b.bill_date >= $${i++}`; params.push(from); }
    if (to)   { where += ` AND b.bill_date <= $${i++}`; params.push(to); }

    const result = await query(
      `SELECT v.id AS vendor_id, v.name AS vendor_name,
              COUNT(b.id)::int AS bill_count,
              COALESCE(SUM(b.gross_amount), 0)      AS gross_total,
              COALESCE(SUM(b.tds_amount), 0)        AS tds_total,
              COALESCE(SUM(b.retention_amount), 0)  AS retention_total,
              COALESCE(SUM(b.security_amount), 0)   AS security_total,
              COALESCE(SUM(b.advance_recovery), 0)  AS advance_recovery_total,
              COALESCE(SUM(b.other_deductions), 0)  AS other_deductions_total,
              COALESCE(SUM(b.net_payable), 0)       AS net_payable_total
       FROM subcontractor_bills b
       JOIN projects p ON b.project_id = p.id
       JOIN work_orders wo ON b.wo_id = wo.id
       JOIN vendors v ON wo.vendor_id = v.id
       WHERE ${where}
         AND LOWER(v.vendor_type) IN ('sub-contractor','subcontractor','labour contractor','labour_contractor')
       GROUP BY v.id, v.name
       ORDER BY net_payable_total DESC`,
      params
    );
    res.json({ data: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// GET /api/v1/subcontractors/reports/wo-utilization?project_id=
const reportWOUtilization = async (req, res) => {
  try {
    const { project_id } = req.query;
    const params = [req.user.company_id];
    let i = 2;
    let where = `p.company_id = $1`;
    if (project_id) { where += ` AND wo.project_id = $${i++}`; params.push(project_id); }

    const result = await query(
      `SELECT wo.id, wo.wo_number, wo.subject, wo.status, wo.start_date, wo.end_date,
              wo.total_value AS contract_value,
              v.name AS vendor_name,
              p.name AS project_name,
              COALESCE(SUM(b.gross_amount), 0)  AS billed_amount,
              COALESCE(SUM(b.net_payable), 0)   AS net_billed,
              COALESCE(SUM(CASE WHEN b.status = 'paid' THEN b.net_payable END), 0) AS paid_amount,
              CASE WHEN wo.total_value > 0
                THEN ROUND(COALESCE(SUM(b.gross_amount), 0) / wo.total_value * 100, 1)
                ELSE 0 END AS utilization_pct
       FROM work_orders wo
       JOIN projects p ON wo.project_id = p.id
       JOIN vendors v ON wo.vendor_id = v.id
       LEFT JOIN subcontractor_bills b ON b.wo_id = wo.id
       WHERE ${where}
         AND LOWER(v.vendor_type) IN ('sub-contractor','subcontractor','labour contractor','labour_contractor')
       GROUP BY wo.id, v.name, p.name
       ORDER BY utilization_pct DESC`,
      params
    );
    res.json({ data: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/** ── SUBCONTRACTOR PORTAL ──────────────────────────────────────────────────── */

// GET /api/v1/subcontractors/portal/my-bills
// Returns bills only for the vendor linked to req.user.vendor_id
const portalMyBills = async (req, res) => {
  try {
    if (!req.user.vendor_id) return res.status(403).json({ error: 'Portal access requires a vendor account.' });

    const result = await query(
      `SELECT b.*, wo.wo_number, p.name AS project_name
       FROM subcontractor_bills b
       JOIN work_orders wo ON b.wo_id = wo.id
       JOIN projects p ON b.project_id = p.id
       WHERE wo.vendor_id = $1
       ORDER BY b.bill_date DESC`,
      [req.user.vendor_id]
    );
    res.json({ data: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

module.exports = {
  getWorkOrders,
  getWorkOrder,
  createWorkOrder,
  getMeasurements,
  createMeasurement,
  updateWorkOrder,
  createBill,
  getBills,
  getBill,
  updateBill,
  getDashboard,
  listSubcontractors,
  listWorkers,
  createWorker,
  listLabourAttendance,
  createLabourAttendance,
  getSettings,
  updateSettings,
  listDocuments,
  createDocument,
  deleteDocument,
  listExpiringDocuments,
  approveBill,
  rejectBill,
  getBillApprovals,
  reportLedger,
  reportDeductionSummary,
  reportWOUtilization,
  portalMyBills,
};
