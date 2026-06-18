// sc.routes.js — Complete Subcontractor Management Module
const express = require('express');
const router  = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const { query, withTransaction } = require('../config/database');
const dayjs = require('dayjs');
const esslService = require('../services/essl.service');
const { notifyScBillSubmitted, notifyScWoSubmitted } = require('../services/notif.helper');

router.use(authenticate);
const CID  = req => req.user.company_id;
const ADMIN = ['super_admin','admin'];
const PLANNER = ['super_admin','admin','project_manager','site_engineer','qs_engineer','procurement_manager'];

// ── Auto-number helpers — MAX-based, company-scoped, must be called inside withTransaction ──
async function nextScCode(client, cid) {
  const r = await client.query(
    `SELECT COALESCE(MAX(CAST(REGEXP_REPLACE(sc_code, '^SC-', '') AS INTEGER)), 0) AS last_seq
     FROM sc_subcontractors WHERE company_id=$1 AND sc_code ~ '^SC-[0-9]+'`, [cid]);
  return `SC-${String(parseInt(r.rows[0].last_seq)+1).padStart(3,'0')}`;
}
async function nextWONumber(client, cid, projId) {
  const proj = await client.query(`SELECT name FROM projects WHERE id=$1`, [projId]);
  const code = (proj.rows[0]?.name||'XX').replace(/[^A-Za-z0-9]/g,'').substring(0,6).toUpperCase();
  const r = await client.query(
    `SELECT COALESCE(MAX(CAST(REGEXP_REPLACE(wo_number, '^WO-[A-Z0-9]+-', '') AS INTEGER)), 0) AS last_seq
     FROM sc_work_orders WHERE company_id=$1 AND wo_number ~ '^WO-[A-Z0-9]+-[0-9]+'`, [cid]);
  return `WO-${code}-${String(parseInt(r.rows[0].last_seq)+1).padStart(3,'0')}`;
}
async function nextBillNumber(client, cid, projId) {
  const proj = await client.query(`SELECT name FROM projects WHERE id=$1`, [projId]);
  const code = (proj.rows[0]?.name||'XX').replace(/[^A-Za-z0-9]/g,'').substring(0,6).toUpperCase();
  const r = await client.query(
    `SELECT COALESCE(MAX(CAST(REGEXP_REPLACE(bill_number, '^BILL-[A-Z0-9]+-', '') AS INTEGER)), 0) AS last_seq
     FROM sc_bills WHERE company_id=$1 AND bill_number ~ '^BILL-[A-Z0-9]+-[0-9]+'`, [cid]);
  return `BILL-${code}-${String(parseInt(r.rows[0].last_seq)+1).padStart(3,'0')}`;
}

function normalizeContractorType(vendorType) {
  const t = String(vendorType || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (t.includes('llp')) return 'llp';
  if (t.includes('partnership')) return 'partnership';
  if (t.includes('proprietor')) return 'proprietorship';
  if (t.includes('individual')) return 'individual';
  return 'company';
}

function normalizeWOStatus(status) {
  const s = String(status || '').trim().toLowerCase();
  if (['active', 'approved', 'authorized', 'released'].includes(s)) return 'active';
  if (['rejected', 'cancelled', 'canceled'].includes(s)) return 'cancelled';
  return 'draft';
}

async function syncLegacyWorkOrdersToSC(req, filters = {}) {
  const cid = CID(req);
  return withTransaction(async (client) => {
    const conditions = [`p.company_id = $1`];
    const params = [cid];
    if (filters.project_id) {
      params.push(filters.project_id);
      conditions.push(`wo.project_id = $${params.length}`);
    }
    if (filters.status) {
      params.push(filters.status);
      conditions.push(`LOWER(COALESCE(wo.status,'')) = LOWER($${params.length})`);
    }

    const legacy = await client.query(`
      SELECT wo.*, p.company_id, v.id AS vendor_id, v.name AS vendor_name,
             v.vendor_code, v.vendor_type, v.contact_person, v.phone, v.email,
             COALESCE(v.gst_number, v.gstin) AS gst_number,
             COALESCE(v.pan_number, v.pan) AS pan_number,
             v.address, v.city, v.state, v.pincode,
             v.bank_name, COALESCE(v.bank_account_no, v.account_number) AS account_number,
             COALESCE(v.bank_ifsc, v.ifsc_code) AS ifsc_code, v.bank_branch,
             v.trade_category
      FROM work_orders wo
      JOIN projects p ON p.id = wo.project_id
      JOIN vendors v ON v.id = wo.vendor_id
      WHERE ${conditions.join(' AND ')}
        AND v.vendor_type IN ('subcontractor','Sub-contractor','Labour Contractor','labour_contractor','Labor Contractor')
      ORDER BY wo.created_at ASC
    `, params);

    let createdSubs = 0;
    let createdWOs = 0;
    let createdItems = 0;

    for (const row of legacy.rows) {
      const woNumber = String(row.wo_number || '').trim();
      if (!woNumber || !row.project_id || !row.vendor_id) continue;

      const existingWO = await client.query(
        `SELECT id FROM sc_work_orders WHERE company_id=$1 AND UPPER(TRIM(wo_number))=UPPER(TRIM($2))`,
        [cid, woNumber]
      );
      if (existingWO.rows.length) continue;

      let sc = await client.query(
        `SELECT id FROM sc_subcontractors
         WHERE company_id=$1
           AND (
             LOWER(TRIM(name)) = LOWER(TRIM($2))
             OR ($3::text IS NOT NULL AND gst_number = $3)
             OR ($4::text IS NOT NULL AND pan_number = $4)
           )
         ORDER BY created_at ASC LIMIT 1`,
        [cid, row.vendor_name, row.gst_number || null, row.pan_number || null]
      );

      let scId = sc.rows[0]?.id;
      if (!scId) {
        const count = await client.query(`SELECT COUNT(*) FROM sc_subcontractors WHERE company_id=$1`, [cid]);
        const scCode = `SC-${String(parseInt(count.rows[0].count, 10) + 1).padStart(3, '0')}`;
        const inserted = await client.query(`
          INSERT INTO sc_subcontractors
            (company_id, sc_code, name, contact_person, mobile, email, gst_number,
             pan_number, address, city, state, pincode, trade_type, contractor_type,
             bank_name, account_number, ifsc_code, bank_branch, status, notes, created_by)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,'active',$19,$20)
          RETURNING id
        `, [
          cid, scCode, row.vendor_name, row.contact_person || null, row.phone || null, row.email || null,
          row.gst_number || null, row.pan_number || null, row.address || null, row.city || null, row.state || null,
          row.pincode || null, row.trade_category || row.work_category || null, normalizeContractorType(row.vendor_type),
          row.bank_name || null, row.account_number || null, row.ifsc_code || null, row.bank_branch || null,
          `Synced from vendor master (${row.vendor_code || row.vendor_id})`, req.user.id
        ]);
        scId = inserted.rows[0].id;
        createdSubs++;
      }

      const contractAmount = Number(row.contract_amount || row.total_value || 0);
      const insertedWO = await client.query(`
        INSERT INTO sc_work_orders
          (company_id, project_id, sc_id, wo_number, subject, description, scope_of_work,
           terms_conditions, start_date, end_date, contract_amount, gst_pct, tds_pct,
           retention_pct, advance_amount, status, approved_by, approved_at, created_by, created_at, updated_at,
           tower_block, work_category)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,18,2,5,0,$12,$13,$14,$15,COALESCE($16,NOW()),NOW(),$17,$18)
        RETURNING id
      `, [
        cid, row.project_id, scId, woNumber,
        row.subject || row.work_description || woNumber,
        row.work_description || row.scope_of_work || row.subject || woNumber,
        row.scope_of_work || row.work_description || null,
        row.terms_conditions || null,
        row.start_date || row.wo_date || null,
        row.end_date || null,
        contractAmount,
        normalizeWOStatus(row.status),
        normalizeWOStatus(row.status) === 'active' ? (row.created_by || req.user.id) : null,
        normalizeWOStatus(row.status) === 'active' ? (row.updated_at || row.created_at || new Date()) : null,
        row.created_by || req.user.id,
        row.created_at || null,
        row.tower_block || null,
        row.work_category || null
      ]);
      const newWoId = insertedWO.rows[0].id;
      createdWOs++;

      const legacyItems = await client.query(
        `SELECT * FROM work_order_items WHERE wo_id=$1 ORDER BY id`,
        [row.id]
      );
      if (legacyItems.rows.length) {
        for (let i = 0; i < legacyItems.rows.length; i++) {
          const it = legacyItems.rows[i];
          let qty = Number(it.quantity || 0);
          let rate = Number(it.rate || 0);
          const itemAmount = Number(it.amount || 0);
          if ((!qty || !rate) && itemAmount) {
            if (!qty) qty = 1;
            if (!rate) rate = itemAmount / qty;
          }
          await client.query(`
            INSERT INTO sc_wo_items (wo_id, item_code, description, unit, qty, rate, billed_qty, balance_qty, sequence_no)
            VALUES ($1,$2,$3,$4,$5,$6,0,$5,$7)
          `, [newWoId, null, it.description || 'Work item', it.unit || null, qty, rate, i + 1]);
          createdItems++;
        }
      } else {
        await client.query(`
          INSERT INTO sc_wo_items (wo_id, item_code, description, unit, qty, rate, billed_qty, balance_qty, sequence_no)
          VALUES ($1,NULL,$2,'LS',1,$3,0,1,1)
        `, [newWoId, row.work_description || row.subject || woNumber, contractAmount]);
        createdItems++;
      }
    }

    return { createdSubs, createdWOs, createdItems };
  });
}

// ════════════════════════════════════════════════════════════════════
// 1. DASHBOARD
// ════════════════════════════════════════════════════════════════════
router.get('/dashboard', async (req, res) => {
  try {
    const { project_id } = req.query;
    const cid = CID(req);
    let pClause = ''; const pp = [cid];
    if (project_id) { pClause = ` AND wo.project_id=$2`; pp.push(project_id); }

    const [subs, wos, bills, payments, retention] = await Promise.all([
      query(`SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE status='active') AS active,
             COUNT(*) FILTER (WHERE contractor_type='sub_contractor' AND status='active') AS active_sub,
             COUNT(*) FILTER (WHERE contractor_type='labour_contractor' AND status='active') AS active_labour
             FROM sc_subcontractors WHERE company_id=$1`, [cid]),
      query(`SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE status='active') AS active, COALESCE(SUM(contract_amount),0) AS total_value, COALESCE(SUM(advance_paid),0) AS advance_paid FROM sc_work_orders wo WHERE company_id=$1${pClause}`, pp),
      query(`SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE b.status IN ('submitted','under_review')) AS pending_approval, COALESCE(SUM(b.gross_amount),0) AS total_billed, COALESCE(SUM(b.net_payable),0) AS total_net FROM sc_bills b JOIN sc_work_orders wo ON wo.id=b.wo_id WHERE b.company_id=$1${pClause}`, pp),
      query(`SELECT COALESCE(SUM(p.amount),0) AS total_paid FROM sc_payments p JOIN sc_bills b ON b.id=p.bill_id JOIN sc_work_orders wo ON wo.id=b.wo_id WHERE p.company_id=$1${pClause}`, pp),
      query(`SELECT COALESCE(SUM(b.retention_amount),0) AS held FROM sc_bills b JOIN sc_work_orders wo ON wo.id=b.wo_id WHERE b.company_id=$1 AND b.status NOT IN ('draft','rejected')${pClause}`, pp),
    ]);

    const totalBilled = parseFloat(bills.rows[0].total_net||0);
    const totalPaid   = parseFloat(payments.rows[0].total_paid||0);
    const outstanding = totalBilled - totalPaid;

    // By project breakdown
    const byProject = await query(`
      SELECT p.name AS project_name, COUNT(DISTINCT wo.id) AS wo_count,
             COALESCE(SUM(wo.contract_amount),0) AS contract_value,
             COALESCE(SUM(b.gross_amount),0) AS billed,
             COALESCE(SUM(pay.paid),0) AS paid
      FROM sc_work_orders wo
      JOIN projects p ON p.id=wo.project_id
      LEFT JOIN sc_bills b ON b.wo_id=wo.id AND b.status NOT IN ('draft','rejected')
      LEFT JOIN LATERAL (SELECT COALESCE(SUM(amount),0) AS paid FROM sc_payments WHERE bill_id=b.id) pay ON TRUE
      WHERE wo.company_id=$1
      GROUP BY p.name ORDER BY contract_value DESC LIMIT 8`, [cid]);

    // Bill status breakdown
    const billStatus = await query(`
      SELECT b.status, COUNT(*) AS count, COALESCE(SUM(b.net_payable),0) AS amount
      FROM sc_bills b JOIN sc_work_orders wo ON wo.id=b.wo_id
      WHERE b.company_id=$1${pClause}
      GROUP BY b.status ORDER BY b.status`, pp);

    // Recent bills (last 8)
    const recentBills = await query(`
      SELECT b.id, b.bill_number, b.bill_date, b.gross_amount, b.net_payable, b.status,
             s.name AS sc_name, wo.wo_number, p.name AS project_name,
             COALESCE((SELECT SUM(amount) FROM sc_payments WHERE bill_id=b.id),0) AS paid_amount
      FROM sc_bills b
      JOIN sc_work_orders wo ON wo.id=b.wo_id
      JOIN sc_subcontractors s ON s.id=b.sc_id
      JOIN projects p ON p.id=wo.project_id
      WHERE b.company_id=$1${pClause}
      ORDER BY b.created_at DESC LIMIT 8`, pp);

    // Recent work orders (last 5)
    const recentWOs = await query(`
      SELECT wo.id, wo.wo_number, wo.subject, wo.contract_amount, wo.status, wo.start_date,
             s.name AS sc_name, p.name AS project_name
      FROM sc_work_orders wo
      JOIN sc_subcontractors s ON s.id=wo.sc_id
      JOIN projects p ON p.id=wo.project_id
      WHERE wo.company_id=$1${pClause}
      ORDER BY wo.created_at DESC LIMIT 5`, pp);

    res.json({ data: {
      subcontractors: { total: parseInt(subs.rows[0].total), active: parseInt(subs.rows[0].active), active_sub: parseInt(subs.rows[0].active_sub||0), active_labour: parseInt(subs.rows[0].active_labour||0) },
      work_orders: { total: parseInt(wos.rows[0].total), active: parseInt(wos.rows[0].active), total_value: parseFloat(wos.rows[0].total_value), advance_paid: parseFloat(wos.rows[0].advance_paid) },
      bills: { total: parseInt(bills.rows[0].total), pending_approval: parseInt(bills.rows[0].pending_approval), total_billed: parseFloat(bills.rows[0].total_billed) },
      financials: { total_billed: totalBilled, total_paid: totalPaid, outstanding, retention_held: parseFloat(retention.rows[0].held) },
      by_project: byProject.rows,
      bill_status: billStatus.rows,
      recent_bills: recentBills.rows,
      recent_work_orders: recentWOs.rows,
    }});
  } catch(e){ res.status(500).json({ error: e.message }); }
});

// ════════════════════════════════════════════════════════════════════
// 2. SUBCONTRACTOR MASTER
// ════════════════════════════════════════════════════════════════════
router.get('/subcontractors', async (req, res) => {
  try {
    const { search, status, trade_type, contractor_type } = req.query;
    let sql = `SELECT sc.*, u.name AS created_by_name,
      COALESCE(stats.wo_count,0) AS wo_count,
      COALESCE(stats.total_billed,0) AS total_billed,
      COALESCE(stats.total_paid,0) AS total_paid
      FROM sc_subcontractors sc
      LEFT JOIN users u ON u.id=sc.created_by
      LEFT JOIN (
        SELECT wo.sc_id, COUNT(DISTINCT wo.id) AS wo_count,
               COALESCE(SUM(b.gross_amount),0) AS total_billed,
               COALESCE(SUM(p.amount),0) AS total_paid
        FROM sc_work_orders wo
        LEFT JOIN sc_bills b ON b.wo_id=wo.id AND b.status NOT IN ('draft','rejected')
        LEFT JOIN sc_payments p ON p.bill_id=b.id
        GROUP BY wo.sc_id
      ) stats ON stats.sc_id=sc.id
      WHERE sc.company_id=$1`;
    const params=[CID(req)]; let i=2;
    if (status)          { sql+=` AND sc.status=$${i++}`; params.push(status); }
    if (trade_type)      { sql+=` AND sc.trade_type=$${i++}`; params.push(trade_type); }
    if (contractor_type) { sql+=` AND sc.contractor_type=$${i++}`; params.push(contractor_type); }
    if (search)          { sql+=` AND (sc.name ILIKE $${i} OR sc.sc_code ILIKE $${i} OR sc.mobile ILIKE $${i})`; params.push(`%${search}%`); i++; }
    sql+=' ORDER BY sc.contractor_type, sc.name';
    res.json({ data: (await query(sql,params)).rows });
  } catch(e){ res.status(500).json({ error: e.message }); }
});

router.get('/subcontractors/:id', async (req, res) => {
  try {
    const cid = CID(req); const sid = req.params.id;
    const [sc, wos, billStats, payments] = await Promise.all([
      query(`SELECT sc.*, u.name AS created_by_name FROM sc_subcontractors sc LEFT JOIN users u ON u.id=sc.created_by WHERE sc.id=$1 AND sc.company_id=$2`, [sid, cid]),
      query(`SELECT wo.id, wo.wo_number, wo.subject, wo.contract_amount, wo.status, wo.start_date, wo.end_date, p.name AS project_name FROM sc_work_orders wo JOIN projects p ON p.id=wo.project_id WHERE wo.sc_id=$1 AND wo.company_id=$2 ORDER BY wo.created_at DESC LIMIT 10`, [sid, cid]),
      query(`SELECT COUNT(*) AS bill_count, COALESCE(SUM(gross_amount),0) AS total_billed, COALESCE(SUM(net_payable),0) AS total_net FROM sc_bills WHERE sc_id=$1 AND company_id=$2 AND status NOT IN ('draft','rejected')`, [sid, cid]),
      query(`SELECT COALESCE(SUM(p.amount),0) AS total_paid FROM sc_payments p JOIN sc_bills b ON b.id=p.bill_id WHERE b.sc_id=$1 AND p.company_id=$2`, [sid, cid]),
    ]);
    if (!sc.rows.length) return res.status(404).json({ error: 'Not found' });
    const net   = parseFloat(billStats.rows[0].total_net || 0);
    const paid  = parseFloat(payments.rows[0].total_paid || 0);
    res.json({ data: {
      ...sc.rows[0],
      work_orders:   wos.rows,
      financials: {
        bill_count:    parseInt(billStats.rows[0].bill_count),
        total_billed:  parseFloat(billStats.rows[0].total_billed),
        total_net:     net,
        total_paid:    paid,
        outstanding:   net - paid,
      },
    }});
  } catch(e){ res.status(500).json({ error: e.message }); }
});

router.post('/subcontractors', authorize(...PLANNER), async (req, res) => {
  try {
    const { name, contact_person, mobile, email, gst_number, pan_number, address, city, state, pincode, trade_type, contractor_type, bank_name, account_number, ifsc_code, bank_branch, notes } = req.body;
    if (!name) return res.status(400).json({ error: 'Name required' });
    const result = await withTransaction(async (client) => {
      const sc_code = await nextScCode(client, CID(req));
      const r = await client.query(`INSERT INTO sc_subcontractors (company_id,sc_code,name,contact_person,mobile,email,gst_number,pan_number,address,city,state,pincode,trade_type,contractor_type,bank_name,account_number,ifsc_code,bank_branch,notes,created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20) RETURNING *`,
        [CID(req),sc_code,name,contact_person||null,mobile||null,email||null,gst_number||null,pan_number||null,address||null,city||null,state||null,pincode||null,trade_type||null,contractor_type||'sub_contractor',bank_name||null,account_number||null,ifsc_code||null,bank_branch||null,notes||null,req.user.id]);
      return r.rows[0];
    });
    res.status(201).json({ data: result });
  } catch(e){ res.status(500).json({ error: e.message }); }
});

router.put('/subcontractors/:id', authorize(...PLANNER), async (req, res) => {
  try {
    const f = req.body;
    const r = await query(`UPDATE sc_subcontractors SET name=$1,contact_person=$2,mobile=$3,email=$4,gst_number=$5,pan_number=$6,address=$7,city=$8,state=$9,pincode=$10,trade_type=$11,contractor_type=$12,bank_name=$13,account_number=$14,ifsc_code=$15,bank_branch=$16,notes=$17,status=$18,updated_at=NOW() WHERE id=$19 AND company_id=$20 RETURNING *`,
      [f.name,f.contact_person||null,f.mobile||null,f.email||null,f.gst_number||null,f.pan_number||null,f.address||null,f.city||null,f.state||null,f.pincode||null,f.trade_type||null,f.contractor_type||'sub_contractor',f.bank_name||null,f.account_number||null,f.ifsc_code||null,f.bank_branch||null,f.notes||null,f.status||'active',req.params.id,CID(req)]);
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json({ data: r.rows[0] });
  } catch(e){ res.status(500).json({ error: e.message }); }
});

// ════════════════════════════════════════════════════════════════════
// 3. WORK ORDERS
// ════════════════════════════════════════════════════════════════════
router.get('/work-orders', async (req, res) => {
  try {
    const { project_id, sc_id, status } = req.query;
    const sync = await syncLegacyWorkOrdersToSC(req, { project_id, status });
    const { contractor_type: ctFilter } = req.query;
    let sql = `SELECT wo.*, sc.name AS sc_name, sc.sc_code, sc.contractor_type,
      sc.trade_type, p.name AS project_name, u.name AS created_by_name,
      (SELECT COUNT(*) FROM sc_bills b WHERE b.wo_id=wo.id AND b.status NOT IN ('draft','rejected')) AS bill_count
      FROM sc_work_orders wo
      JOIN sc_subcontractors sc ON sc.id=wo.sc_id
      JOIN projects p ON p.id=wo.project_id
      LEFT JOIN users u ON u.id=wo.created_by
      WHERE wo.company_id=$1`;
    const params=[CID(req)]; let i=2;
    if (project_id)  { sql+=` AND wo.project_id=$${i++}`; params.push(project_id); }
    if (sc_id)       { sql+=` AND wo.sc_id=$${i++}`; params.push(sc_id); }
    if (status)      { sql+=` AND wo.status=$${i++}`; params.push(status); }
    if (ctFilter)    { sql+=` AND sc.contractor_type=$${i++}`; params.push(ctFilter); }
    sql+=' ORDER BY sc.contractor_type, wo.created_at DESC';
    const rows = (await query(sql,params)).rows;
    res.json({ data: rows, sync });
  } catch(e){ res.status(500).json({ error: e.message }); }
});

router.post('/work-orders/sync-legacy', authorize(...PLANNER), async (req, res) => {
  try {
    const result = await syncLegacyWorkOrdersToSC(req, {
      project_id: req.body?.project_id || req.query?.project_id || null,
      status: req.body?.status || req.query?.status || null,
    });
    res.json({ data: result, message: 'Legacy subcontractor work orders synced' });
  } catch(e){ res.status(500).json({ error: e.message }); }
});

// Unified view: all WOs from both sc_work_orders AND legacy work_orders table
router.get('/all-work-orders', async (req, res) => {
  try {
    const { project_id, status } = req.query;
    const cid = CID(req);
    let pClause = ''; const pp = [cid];
    if (project_id) { pClause = ` AND p.id=$2`; pp.push(project_id); }

    // New sc_work_orders
    const newWOs = await query(`
      SELECT wo.id, wo.wo_number, wo.subject, wo.status, wo.contract_amount,
             wo.start_date, wo.end_date, wo.created_at,
             sc.name AS vendor_name, sc.sc_code, sc.trade_type AS vendor_type,
             p.name AS project_name, p.id AS project_id,
             'sc_module' AS source,
             (SELECT COUNT(*) FROM sc_bills b WHERE b.wo_id=wo.id AND b.status NOT IN ('draft','rejected')) AS bill_count,
             wo.total_billed, wo.total_paid
      FROM sc_work_orders wo
      JOIN sc_subcontractors sc ON sc.id=wo.sc_id
      JOIN projects p ON p.id=wo.project_id
      WHERE wo.company_id=$1${pClause}
      ${status ? ` AND wo.status='${status}'` : ''}
      ORDER BY wo.created_at DESC`, pp);

    // Legacy work_orders (subcontractor / labour contractor types only)
    let legacyPClause = ''; const lp = [];
    if (project_id) { legacyPClause = ` AND wo.project_id=$1`; lp.push(project_id); }
    const legacyWOs = await query(`
      SELECT wo.id, wo.wo_number, wo.subject, wo.status,
             COALESCE(wo.contract_amount, wo.total_value, 0) AS contract_amount,
             wo.start_date, wo.end_date, wo.created_at,
             v.name AS vendor_name, NULL AS sc_code, v.vendor_type,
             p.name AS project_name, p.id AS project_id,
             'legacy' AS source,
             (SELECT COUNT(*) FROM subcontractor_bills b WHERE b.wo_id=wo.id) AS bill_count,
             0 AS total_billed, 0 AS total_paid
      FROM work_orders wo
      JOIN projects p ON p.id=wo.project_id
      JOIN vendors v ON v.id=wo.vendor_id
      WHERE v.vendor_type IN ('subcontractor','Sub-contractor','Labour Contractor','labour_contractor','Labor Contractor')
      ${legacyPClause}
      ORDER BY wo.created_at DESC`, lp);

    // Merge and sort by created_at desc
    const all = [...newWOs.rows, ...legacyWOs.rows]
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    res.json({ data: all });
  } catch(e){ res.status(500).json({ error: e.message }); }
});

// Get legacy WO detail
router.get('/legacy-work-orders/:id', async (req, res) => {
  try {
    const wo = await query(`
      SELECT wo.*, v.name AS vendor_name, v.vendor_type, v.gst_number AS vendor_gst, v.pan_number AS vendor_pan,
             p.name AS project_name
      FROM work_orders wo
      JOIN vendors v ON v.id=wo.vendor_id
      JOIN projects p ON p.id=wo.project_id
      WHERE wo.id=$1`, [req.params.id]);
    if (!wo.rows.length) return res.status(404).json({ error: 'Not found' });
    const items = await query(`SELECT * FROM work_order_items WHERE wo_id=$1`, [req.params.id]);
    const bills = await query(`
      SELECT sb.*, sb.bill_amount, sb.gross_amount, sb.tds_amount, sb.retention_amount, sb.net_payable
      FROM subcontractor_bills sb WHERE sb.wo_id=$1 ORDER BY sb.bill_date DESC`, [req.params.id]);
    res.json({ data: { ...wo.rows[0], items: items.rows, bills: bills.rows } });
  } catch(e){ res.status(500).json({ error: e.message }); }
});

router.get('/work-orders/:id', async (req, res) => {
  try {
    const wo = await query(`SELECT wo.*, sc.name AS sc_name, sc.sc_code, sc.gst_number AS sc_gst, sc.pan_number AS sc_pan, sc.bank_name, sc.account_number, sc.ifsc_code, p.name AS project_name FROM sc_work_orders wo JOIN sc_subcontractors sc ON sc.id=wo.sc_id JOIN projects p ON p.id=wo.project_id WHERE wo.id=$1 AND wo.company_id=$2`, [req.params.id, CID(req)]);
    if (!wo.rows.length) return res.status(404).json({ error: 'Not found' });
    // Return live balance_qty computed from DB (not stored stale value)
    const items = await query(`
      SELECT *,
        GREATEST(0, COALESCE(qty,0) - COALESCE(billed_qty,0)) AS live_balance,
        CASE WHEN COALESCE(qty,0) > 0
             THEN ROUND((COALESCE(billed_qty,0) / COALESCE(qty,0)) * 100, 1)
             ELSE 0 END AS billed_pct
      FROM sc_wo_items WHERE wo_id=$1 ORDER BY sequence_no`, [req.params.id]);
    res.json({ data: { ...wo.rows[0], items: items.rows } });
  } catch(e){ res.status(500).json({ error: e.message }); }
});

router.post('/work-orders', authorize(...PLANNER), async (req, res) => {
  try {
    const { project_id, sc_id, subject, description, scope_of_work, terms_conditions, start_date, end_date, contract_amount, gst_pct, tds_pct, retention_pct, advance_amount, items } = req.body;
    if (!project_id || !sc_id || !subject) return res.status(400).json({ error: 'project_id, sc_id, subject required' });
    // Validate subcontractor is active
    const sc = await query(`SELECT status FROM sc_subcontractors WHERE id=$1 AND company_id=$2`, [sc_id, CID(req)]);
    if (!sc.rows.length || sc.rows[0].status !== 'active') return res.status(400).json({ error: 'Subcontractor is not active' });
    const result = await withTransaction(async (client) => {
      const wo_number = await nextWONumber(client, CID(req), project_id);
      const r = await client.query(`INSERT INTO sc_work_orders (company_id,project_id,sc_id,wo_number,subject,description,scope_of_work,terms_conditions,start_date,end_date,contract_amount,gst_pct,tds_pct,retention_pct,advance_amount,created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING *`,
        [CID(req),project_id,sc_id,wo_number,subject,description||null,scope_of_work||null,terms_conditions||null,start_date||null,end_date||null,contract_amount||0,gst_pct||18,tds_pct||2,retention_pct||5,advance_amount||0,req.user.id]);
      if (Array.isArray(items) && items.length) {
        for (let k=0; k<items.length; k++) {
          const it = items[k];
          await client.query(`INSERT INTO sc_wo_items (wo_id,item_code,description,unit,qty,rate,sequence_no) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
            [r.rows[0].id, it.item_code||null, it.description, it.unit||null, it.qty||0, it.rate||0, k+1]);
        }
      }
      return r.rows[0];
    });
    notifyScWoSubmitted(CID(req), result);
    res.status(201).json({ data: result });
  } catch(e){ res.status(500).json({ error: e.message }); }
});

router.put('/work-orders/:id', authorize(...PLANNER), async (req, res) => {
  try {
    const f = req.body;
    const r = await query(
      `UPDATE sc_work_orders SET
         subject=$1, description=$2, scope_of_work=$3, terms_conditions=$4,
         start_date=$5, end_date=$6, contract_amount=$7,
         gst_pct=$8, tds_pct=$9, retention_pct=$10, advance_amount=$11,
         dlp_end_date=$12, dlp_months=$13, work_category=$14, tower_block=$15,
         updated_at=NOW()
       WHERE id=$16 AND company_id=$17 RETURNING *`,
      [f.subject, f.description||null, f.scope_of_work||null, f.terms_conditions||null,
       f.start_date||null, f.end_date||null, f.contract_amount||0,
       f.gst_pct||18, f.tds_pct||2, f.retention_pct||5, f.advance_amount||0,
       f.dlp_end_date||null, f.dlp_months||12, f.work_category||null, f.tower_block||null,
       req.params.id, CID(req)]);
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });

    // Items upsert — add/update/delete SC WO items with BOQ linking
    if (Array.isArray(f.items)) {
      const woId = req.params.id;
      const existingRows = await query(`SELECT id FROM sc_wo_items WHERE wo_id=$1`, [woId]);
      const existingIds  = new Set(existingRows.rows.map(x => x.id));
      const incomingIds  = new Set(f.items.filter(it => it.id).map(it => it.id));
      // Delete items removed by user (only if not yet billed)
      for (const id of existingIds) {
        if (!incomingIds.has(id)) {
          await query(`DELETE FROM sc_wo_items WHERE id=$1 AND COALESCE(billed_qty,0)=0`, [id]);
        }
      }
      // Upsert each incoming item
      for (let k = 0; k < f.items.length; k++) {
        const it = f.items[k];
        if (it.id && existingIds.has(it.id)) {
          await query(
            `UPDATE sc_wo_items SET item_code=$1,description=$2,unit=$3,qty=$4,rate=$5,sequence_no=$6,boq_item_id=$7 WHERE id=$8`,
            [it.item_code||null, it.description, it.unit||null, it.qty||0, it.rate||0, k+1, it.boq_item_id||null, it.id]);
        } else {
          await query(
            `INSERT INTO sc_wo_items (wo_id,item_code,description,unit,qty,rate,sequence_no,boq_item_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
            [woId, it.item_code||null, it.description, it.unit||null, it.qty||0, it.rate||0, k+1, it.boq_item_id||null]);
        }
      }
    }
    res.json({ data: r.rows[0] });
  } catch(e){ res.status(500).json({ error: e.message }); }
});

router.patch('/work-orders/:id/approve', authorize(...ADMIN,'project_manager'), async (req, res) => {
  try {
    const r = await query(`UPDATE sc_work_orders SET status='approved', approved_by=$1, approved_at=NOW(), updated_at=NOW() WHERE id=$2 AND company_id=$3 RETURNING *`, [req.user.id, req.params.id, CID(req)]);
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    // Activate WO after approval
    await query(`UPDATE sc_work_orders SET status='active' WHERE id=$1`, [req.params.id]);
    res.json({ data: r.rows[0] });
  } catch(e){ res.status(500).json({ error: e.message }); }
});

// ════════════════════════════════════════════════════════════════════
// 4. WORKERS & ATTENDANCE
// ════════════════════════════════════════════════════════════════════
router.get('/workers', async (req, res) => {
  try {
    const { project_id, sc_id, wo_id } = req.query;
    let sql = `SELECT w.*, sc.name AS sc_name FROM sc_workers w LEFT JOIN sc_subcontractors sc ON sc.id=w.sc_id WHERE w.company_id=$1`;
    const params=[CID(req)]; let i=2;
    if (project_id){ sql+=` AND w.project_id=$${i++}`; params.push(project_id); }
    if (sc_id)     { sql+=` AND w.sc_id=$${i++}`; params.push(sc_id); }
    if (wo_id)     { sql+=` AND w.wo_id=$${i++}`; params.push(wo_id); }
    sql+=' ORDER BY w.worker_name';
    res.json({ data: (await query(sql,params)).rows });
  } catch(e){ res.status(500).json({ error: e.message }); }
});

router.post('/workers', authorize(...PLANNER), async (req, res) => {
  try {
    const { project_id, sc_id, wo_id, worker_name, skill_type, daily_rate, mobile, aadhar_number } = req.body;
    if (!worker_name) return res.status(400).json({ error: 'worker_name required' });
    const cnt = (await query(`SELECT COUNT(*) FROM sc_workers WHERE company_id=$1`, [CID(req)])).rows[0].count;
    const worker_code = `WKR-${String(parseInt(cnt)+1).padStart(4,'0')}`;
    const r = await query(`INSERT INTO sc_workers (company_id,project_id,sc_id,wo_id,worker_code,worker_name,skill_type,daily_rate,mobile,aadhar_number,created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [CID(req),project_id||null,sc_id||null,wo_id||null,worker_code,worker_name,skill_type||'Unskilled',daily_rate||0,mobile||null,aadhar_number||null,req.user.id]);
    res.status(201).json({ data: r.rows[0] });
  } catch(e){ res.status(500).json({ error: e.message }); }
});

router.get('/attendance', async (req, res) => {
  try {
    const { project_id, sc_id, wo_id, from_date, to_date } = req.query;
    let sql = `SELECT a.*, w.worker_name, w.worker_code, w.skill_type, sc.name AS sc_name FROM sc_attendance a JOIN sc_workers w ON w.id=a.worker_id LEFT JOIN sc_subcontractors sc ON sc.id=a.sc_id WHERE a.company_id=$1`;
    const params=[CID(req)]; let i=2;
    if (project_id){ sql+=` AND a.project_id=$${i++}`; params.push(project_id); }
    if (sc_id)     { sql+=` AND a.sc_id=$${i++}`; params.push(sc_id); }
    if (wo_id)     { sql+=` AND a.wo_id=$${i++}`; params.push(wo_id); }
    if (from_date) { sql+=` AND a.attendance_date>=$${i++}`; params.push(from_date); }
    if (to_date)   { sql+=` AND a.attendance_date<=$${i++}`; params.push(to_date); }
    sql+=' ORDER BY a.attendance_date DESC, w.worker_name';
    res.json({ data: (await query(sql,params)).rows });
  } catch(e){ res.status(500).json({ error: e.message }); }
});

router.post('/attendance', authorize(...PLANNER), async (req, res) => {
  try {
    const { project_id, sc_id, wo_id, worker_id, attendance_date, status, hours_worked, overtime_hours, wage_amount, overtime_amount, location, remarks } = req.body;
    if (!worker_id) return res.status(400).json({ error: 'worker_id required' });
    const r = await query(`INSERT INTO sc_attendance (company_id,project_id,sc_id,wo_id,worker_id,attendance_date,status,hours_worked,overtime_hours,wage_amount,overtime_amount,location,remarks,marked_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
      [CID(req),project_id||null,sc_id||null,wo_id||null,worker_id,attendance_date||new Date().toISOString().slice(0,10),status||'present',hours_worked||8,overtime_hours||0,wage_amount||0,overtime_amount||0,location||null,remarks||null,req.user.id]);
    res.status(201).json({ data: r.rows[0] });
  } catch(e){ res.status(500).json({ error: e.message }); }
});

// Bulk attendance
router.post('/attendance/bulk', authorize(...PLANNER), async (req, res) => {
  try {
    const { entries } = req.body; // array of attendance records
    if (!Array.isArray(entries) || !entries.length) return res.status(400).json({ error: 'entries required' });
    let inserted = 0;
    for (const e of entries) {
      await query(`INSERT INTO sc_attendance (company_id,project_id,sc_id,wo_id,worker_id,attendance_date,status,hours_worked,wage_amount,marked_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT DO NOTHING`,
        [CID(req),e.project_id||null,e.sc_id||null,e.wo_id||null,e.worker_id,e.attendance_date,e.status||'present',e.hours_worked||8,e.wage_amount||0,req.user.id]);
      inserted++;
    }
    res.json({ message: `${inserted} records saved` });
  } catch(e){ res.status(500).json({ error: e.message }); }
});

// ════════════════════════════════════════════════════════════════════
// 5. WORK PROGRESS
// ════════════════════════════════════════════════════════════════════
router.get('/progress', async (req, res) => {
  try {
    const { project_id, wo_id, sc_id, status } = req.query;
    let sql = `SELECT pr.*, wo.wo_number, sc.name AS sc_name, p.name AS project_name, wi.description AS item_description, u.name AS created_by_name FROM sc_progress pr JOIN sc_work_orders wo ON wo.id=pr.wo_id JOIN sc_subcontractors sc ON sc.id=pr.sc_id JOIN projects p ON p.id=pr.project_id LEFT JOIN sc_wo_items wi ON wi.id=pr.wo_item_id LEFT JOIN users u ON u.id=pr.created_by WHERE pr.company_id=$1`;
    const params=[CID(req)]; let i=2;
    if (project_id){ sql+=` AND pr.project_id=$${i++}`; params.push(project_id); }
    if (wo_id)     { sql+=` AND pr.wo_id=$${i++}`; params.push(wo_id); }
    if (sc_id)     { sql+=` AND pr.sc_id=$${i++}`; params.push(sc_id); }
    if (status)    { sql+=` AND pr.status=$${i++}`; params.push(status); }
    sql+=' ORDER BY pr.progress_date DESC';
    res.json({ data: (await query(sql,params)).rows });
  } catch(e){ res.status(500).json({ error: e.message }); }
});

router.post('/progress', authorize(...PLANNER), async (req, res) => {
  try {
    const { project_id, wo_id, sc_id, wo_item_id, progress_date, description, unit, quantity, location, remarks, attachments } = req.body;
    if (!wo_id || !description) return res.status(400).json({ error: 'wo_id and description required' });
    const r = await query(`INSERT INTO sc_progress (company_id,project_id,wo_id,sc_id,wo_item_id,progress_date,description,unit,quantity,location,remarks,attachments,created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [CID(req),project_id||null,wo_id,sc_id||null,wo_item_id||null,progress_date||new Date().toISOString().slice(0,10),description,unit||null,quantity||0,location||null,remarks||null,JSON.stringify(attachments||[]),req.user.id]);
    res.status(201).json({ data: r.rows[0] });
  } catch(e){ res.status(500).json({ error: e.message }); }
});

router.patch('/progress/:id/verify', authorize('super_admin','admin','project_manager','site_engineer'), async (req, res) => {
  try {
    const r = await query(`UPDATE sc_progress SET status='verified', verified_by=$1, verified_at=NOW() WHERE id=$2 AND company_id=$3 RETURNING *`, [req.user.id, req.params.id, CID(req)]);
    res.json({ data: r.rows[0] });
  } catch(e){ res.status(500).json({ error: e.message }); }
});

// ════════════════════════════════════════════════════════════════════
// 6. BILLS
// ════════════════════════════════════════════════════════════════════
router.get('/bills', async (req, res) => {
  try {
    const { project_id, wo_id, sc_id, status } = req.query;
    let sql = `SELECT b.*, wo.wo_number, wo.contract_amount, sc.name AS sc_name, sc.sc_code, p.name AS project_name, u.name AS created_by_name FROM sc_bills b JOIN sc_work_orders wo ON wo.id=b.wo_id JOIN sc_subcontractors sc ON sc.id=b.sc_id JOIN projects p ON p.id=b.project_id LEFT JOIN users u ON u.id=b.created_by WHERE b.company_id=$1`;
    const params=[CID(req)]; let i=2;
    if (project_id){ sql+=` AND b.project_id=$${i++}`; params.push(project_id); }
    if (wo_id)     { sql+=` AND b.wo_id=$${i++}`; params.push(wo_id); }
    if (sc_id)     { sql+=` AND b.sc_id=$${i++}`; params.push(sc_id); }
    if (status)    { sql+=` AND b.status=$${i++}`; params.push(status); }
    sql+=' ORDER BY b.bill_date DESC, b.created_at DESC';
    res.json({ data: (await query(sql,params)).rows });
  } catch(e){ res.status(500).json({ error: e.message }); }
});

router.get('/bills/:id', async (req, res) => {
  try {
    const bill = await query(`SELECT b.*, wo.wo_number, wo.contract_amount, wo.gst_pct AS wo_gst_pct, wo.tds_pct AS wo_tds_pct, wo.retention_pct AS wo_ret_pct, sc.name AS sc_name, sc.gst_number AS sc_gst, p.name AS project_name FROM sc_bills b JOIN sc_work_orders wo ON wo.id=b.wo_id JOIN sc_subcontractors sc ON sc.id=b.sc_id JOIN projects p ON p.id=b.project_id WHERE b.id=$1 AND b.company_id=$2`, [req.params.id, CID(req)]);
    if (!bill.rows.length) return res.status(404).json({ error: 'Not found' });
    const items = await query(`SELECT bi.*, wi.description AS wo_item_desc FROM sc_bill_items bi LEFT JOIN sc_wo_items wi ON wi.id=bi.wo_item_id WHERE bi.bill_id=$1 ORDER BY bi.sequence_no`, [req.params.id]);
    const approvals = await query(`SELECT a.*, u.name AS actor_name FROM sc_bill_approvals a LEFT JOIN users u ON u.id=a.actor_id WHERE a.bill_id=$1 ORDER BY a.created_at`, [req.params.id]);
    const payments  = await query(`SELECT * FROM sc_payments WHERE bill_id=$1 ORDER BY payment_date`, [req.params.id]);
    res.json({ data: { ...bill.rows[0], items: items.rows, approvals: approvals.rows, payments: payments.rows } });
  } catch(e){ res.status(500).json({ error: e.message }); }
});

router.post('/bills', authorize(...PLANNER), async (req, res) => {
  try {
    const { wo_id, bill_date, bill_type, period_from, period_to, description, gross_amount,
            gst_pct, tds_pct, retention_pct, advance_recovery, material_recovery,
            penalty_amount, other_deductions,
            is_igst, labour_cess_pct,
            retention_release_amount, credit_note_amount,
            items, attachments } = req.body;
    if (!wo_id || !gross_amount) return res.status(400).json({ error: 'wo_id and gross_amount required' });

    // ── Load WO ──────────────────────────────────────────────────────────────
    const wo = await query(`SELECT * FROM sc_work_orders WHERE id=$1 AND company_id=$2`, [wo_id, CID(req)]);
    if (!wo.rows.length) return res.status(404).json({ error: 'Work order not found' });
    const woRow = wo.rows[0];
    if (!['active','approved'].includes(woRow.status))
      return res.status(400).json({ error: 'Work order must be Approved / Active before billing' });

    // ── Load settings ─────────────────────────────────────────────────────────
    const settingsR = await query(`SELECT block_overbilling FROM sc_settings WHERE company_id=$1`, [CID(req)]);
    const blockOverbilling = settingsR.rows.length === 0 ? true : settingsR.rows[0].block_overbilling !== false;

    // ── Per-item quantity validation ──────────────────────────────────────────
    if (blockOverbilling && Array.isArray(items) && items.length) {
      for (const it of items) {
        if (!it.wo_item_id || !parseFloat(it.curr_qty)) continue;
        // Fetch live balance from DB (do NOT trust client-side balance_qty)
        const itemR = await query(
          `SELECT qty, billed_qty,
                  COALESCE(qty,0) - COALESCE(billed_qty,0) AS live_balance
           FROM sc_wo_items WHERE id=$1`, [it.wo_item_id]);
        if (!itemR.rows.length) continue;
        const liveBalance = parseFloat(itemR.rows[0].live_balance || 0);
        if (parseFloat(it.curr_qty) > liveBalance + 0.001) {
          return res.status(400).json({
            error: `Overbilling blocked: "${it.description}" — ` +
                   `Requested ${it.curr_qty} ${it.unit || ''}, ` +
                   `but balance is only ${liveBalance.toFixed(3)} ${it.unit || ''}. ` +
                   `(WO Qty: ${itemR.rows[0].qty}, Already Billed: ${itemR.rows[0].billed_qty})`
          });
        }
      }
    }

    // ── WO contract amount check ──────────────────────────────────────────────
    if (blockOverbilling) {
      const newTotal = parseFloat(woRow.total_billed || 0) + parseFloat(gross_amount);
      if (newTotal > parseFloat(woRow.contract_amount) * 1.005) { // 0.5% tolerance
        return res.status(400).json({
          error: `Overbilling blocked: This bill would make total billed ₹${newTotal.toFixed(2)} ` +
                 `which exceeds the WO contract amount of ₹${parseFloat(woRow.contract_amount).toFixed(2)}. ` +
                 `Remaining billable: ₹${(parseFloat(woRow.contract_amount) - parseFloat(woRow.total_billed)).toFixed(2)}`
        });
      }
    }

    // ── Compute amounts ───────────────────────────────────────────────────────
    const grossAmt        = parseFloat(gross_amount);
    const effectiveGstPct = parseFloat(gst_pct || woRow.gst_pct || 18);
    const gst             = grossAmt * effectiveGstPct / 100;

    // GST split: CGST+SGST (intra-state) or IGST (inter-state)
    const isIgst  = !!is_igst;
    const cgst    = isIgst ? 0 : Math.round(gst / 2 * 100) / 100;
    const sgst    = isIgst ? 0 : gst - cgst;   // avoids rounding drift
    const igst    = isIgst ? gst : 0;

    // Labour Welfare Cess (BOCW Act) — 1% typical, user-controlled
    const labourCess = grossAmt * parseFloat(labour_cess_pct || 0) / 100;

    // Section E credits (increase net payable)
    const retRelease = parseFloat(retention_release_amount || 0);
    const creditNote = parseFloat(credit_note_amount || 0);

    const tds  = grossAmt * parseFloat(tds_pct  || woRow.tds_pct  || 2)  / 100;
    const ret  = grossAmt * parseFloat(retention_pct || woRow.retention_pct || 5) / 100;
    const adv  = parseFloat(advance_recovery || 0);
    const mat  = parseFloat(material_recovery || 0);
    const pen  = parseFloat(penalty_amount || 0);
    const oth  = parseFloat(other_deductions || 0);

    // Net = Gross + GST + Retention Released − Credit Note − TDS − Retention − Advances − Materials − Penalty − Labour Cess − Other
    const net = grossAmt + gst + retRelease - creditNote - tds - ret - adv - mat - pen - labourCess - oth;

    const billResult = await withTransaction(async (client) => {
      const bill_number = await nextBillNumber(client, CID(req), woRow.project_id);

      // ── Insert bill ─────────────────────────────────────────────────────────
      const r = await client.query(
        `INSERT INTO sc_bills
           (company_id,project_id,wo_id,sc_id,bill_number,bill_date,bill_type,
            period_from,period_to,description,
            gross_amount,gst_pct,gst_amount,
            is_igst,cgst_amount,sgst_amount,igst_amount,
            tds_pct,tds_amount,retention_pct,retention_amount,
            advance_recovery,material_recovery,penalty_amount,other_deductions,
            labour_cess_amount,retention_release_amount,credit_note_amount,
            net_payable,attachments,created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
                 $11,$12,$13,$14,$15,$16,$17,
                 $18,$19,$20,$21,
                 $22,$23,$24,$25,
                 $26,$27,$28,
                 $29,$30,$31)
         RETURNING *`,
        [CID(req), woRow.project_id, wo_id, woRow.sc_id, bill_number,
         bill_date || new Date().toISOString().slice(0,10), bill_type || 'ra',
         period_from||null, period_to||null, description||null,
         grossAmt, effectiveGstPct, gst,
         isIgst, cgst, sgst, igst,
         tds_pct||woRow.tds_pct||2, tds,
         retention_pct||woRow.retention_pct||5, ret,
         adv, mat, pen, oth,
         labourCess, retRelease, creditNote,
         net, JSON.stringify(attachments||[]), req.user.id]);

      const billId = r.rows[0].id;

      // ── Insert bill items + update per-item billed_qty ──────────────────────
      if (Array.isArray(items) && items.length) {
        for (let k = 0; k < items.length; k++) {
          const it = items[k];
          const currQty = parseFloat(it.curr_qty || 0);
          if (currQty <= 0) continue;
          await client.query(
            `INSERT INTO sc_bill_items (bill_id,wo_item_id,description,unit,wo_qty,prev_qty,curr_qty,balance_qty,rate,sequence_no)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
            [billId, it.wo_item_id||null, it.description, it.unit||null,
             it.wo_qty||0, it.prev_qty||0, currQty,
             Math.max(0, parseFloat(it.balance_qty||0) - currQty), it.rate||0, k+1]);

          if (it.wo_item_id) {
            await client.query(
              `UPDATE sc_wo_items
               SET billed_qty = COALESCE(billed_qty,0) + $1,
                   balance_qty = GREATEST(0, COALESCE(qty,0) - COALESCE(billed_qty,0) - $1)
               WHERE id=$2`,
              [currQty, it.wo_item_id]);
          }
        }
      }

      // ── Update WO financial totals ───────────────────────────────────────────
      await client.query(
        `UPDATE sc_work_orders
         SET total_billed = total_billed + $1,
             retention_held = retention_held + $2,
             updated_at = NOW()
         WHERE id = $3`,
        [grossAmt, ret, wo_id]);

      // ── Audit log ───────────────────────────────────────────────────────────
      await client.query(
        `INSERT INTO sc_bill_approvals (bill_id,stage,action,actor_id,actor_name,comments)
         VALUES ($1,'draft','submitted',$2,$3,'Bill created')`,
        [billId, req.user.id, req.user.name]);

      return r.rows[0];
    });

    res.status(201).json({ data: billResult });
  } catch(e){ res.status(500).json({ error: e.message }); }
});

async function recalculateWOConsumption(woId, client = { query }) {
  await client.query(`
    UPDATE sc_wo_items wi
       SET billed_qty = COALESCE(x.billed_qty, 0),
           balance_qty = GREATEST(0, COALESCE(wi.qty, 0) - COALESCE(x.billed_qty, 0))
      FROM (
        SELECT wi2.id,
               COALESCE(SUM(bi.curr_qty) FILTER (WHERE b.status NOT IN ('rejected')), 0) AS billed_qty
          FROM sc_wo_items wi2
          LEFT JOIN sc_bill_items bi ON bi.wo_item_id = wi2.id
          LEFT JOIN sc_bills b ON b.id = bi.bill_id
         WHERE wi2.wo_id = $1::uuid
         GROUP BY wi2.id
      ) x
     WHERE wi.id = x.id
  `, [woId]);

  await client.query(`
    UPDATE sc_work_orders wo
       SET total_billed = COALESCE(x.total_billed, 0),
           retention_held = COALESCE(x.retention_held, 0),
           updated_at = NOW()
      FROM (
        SELECT $1::uuid AS wo_id,
               COALESCE(SUM(gross_amount) FILTER (WHERE status NOT IN ('rejected')), 0) AS total_billed,
               COALESCE(SUM(retention_amount) FILTER (WHERE status NOT IN ('rejected')), 0) AS retention_held
          FROM sc_bills
         WHERE wo_id = $1::uuid
      ) x
     WHERE wo.id = x.wo_id
  `, [woId]);
}

// Submit for approval
router.patch('/bills/:id/submit', authorize(...PLANNER), async (req, res) => {
  try {
    // Read first approval stage from settings (don't hardcode)
    const stages = await getApprovalStages(CID(req));
    const firstStage = stages[0] || 'site_engineer';
    // Allow re-submission after 'queried' (send-back) as well as 'draft'
    const r = await query(
      `UPDATE sc_bills SET status='submitted', current_stage=$4, query_remarks=NULL,
          submitted_by=$1, submitted_at=NOW(), updated_at=NOW()
        WHERE id=$2 AND company_id=$3 AND status IN ('draft','queried') RETURNING *`,
      [req.user.id, req.params.id, CID(req), firstStage]);
    if (!r.rows.length) return res.status(404).json({ error: 'Bill not found or cannot be submitted' });
    await query(
      `INSERT INTO sc_bill_approvals (bill_id,stage,action,actor_id,actor_name,comments)
       VALUES ($1,'draft','submitted',$2,$3,$4)`,
      [req.params.id, req.user.id, req.user.name, req.body.comments||'Submitted for approval']);
    notifyScBillSubmitted(CID(req), r.rows[0]);
    res.json({ data: r.rows[0] });
  } catch(e){ res.status(500).json({ error: e.message }); }
});

// Approve bill (stage-wise) — next_stage computed server-side from sc_settings
router.patch('/bills/:id/approve', authorize('super_admin','admin','project_manager','qs_engineer','accounts'), async (req, res) => {
  try {
    const { comments } = req.body;
    const bill = await query(`SELECT * FROM sc_bills WHERE id=$1::uuid AND company_id=$2::uuid`, [req.params.id, CID(req)]);
    if (!bill.rows.length) return res.status(404).json({ error: 'Not found' });
    const b = bill.rows[0];
    if (!['submitted','under_review'].includes(b.status))
      return res.status(400).json({ error: 'Bill is not in an approvable state' });

    // Compute next stage from settings (server-authoritative — never trust client)
    const stages   = await getApprovalStages(CID(req));
    const stage    = b.current_stage;
    const idx      = stages.indexOf(stage);
    const nextStage = (idx >= 0 && idx < stages.length - 1) ? stages[idx + 1] : null;
    const isFinal  = !nextStage;
    const newStatus = isFinal ? 'approved' : 'under_review';

    const r = await query(
      `UPDATE sc_bills
          SET status=$1::text, current_stage=$2::text,
              approved_by=$3::uuid, approved_at=$4::timestamptz,
              updated_at=NOW()
        WHERE id=$5::uuid AND company_id=$6::uuid RETURNING *`,
      [newStatus, nextStage||stage,
       isFinal ? req.user.id : null,
       isFinal ? new Date() : null,
       req.params.id, CID(req)]);
    await query(
      `INSERT INTO sc_bill_approvals (bill_id,stage,action,actor_id,actor_name,comments)
       VALUES ($1::uuid,$2::text,'approved',$3::uuid,$4::text,$5::text)`,
      [req.params.id, stage, req.user.id, req.user.name||req.user.email||'User', comments||'Approved']);

    // ── Auto-generate IPC on final approval ──────────────────────────────────
    if (isFinal) {
      try {
        await withTransaction(async (client) => {
          const ipcNum = await nextIPCNumber(client, CID(req), b.project_id);
          await client.query(
            `INSERT INTO sc_ipcs
               (company_id,project_id,wo_id,sc_id,bill_id,ipc_number,ipc_date,
                gross_amount,net_payable,gst_amount,tds_amount,retention_amount,
                approved_by,approved_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,NOW())
             ON CONFLICT (bill_id) DO NOTHING`,
            [CID(req), b.project_id, b.wo_id, b.sc_id, b.id, ipcNum,
             new Date().toISOString().slice(0,10),
             b.gross_amount, b.net_payable, b.gst_amount||0,
             b.tds_amount||0, b.retention_amount||0,
             req.user.id]);
        });
      } catch(ipcErr) {
        // IPC failure is non-fatal — log but don't block the approval response
        console.error('IPC generation failed:', ipcErr.message);
      }
    }

    res.json({ data: r.rows[0] });
  } catch(e){ res.status(500).json({ error: e.message }); }
});

// Query bill (send-back with remarks — does NOT fully reject)
router.patch('/bills/:id/query', authorize('super_admin','admin','project_manager','qs_engineer','accounts'), async (req, res) => {
  try {
    const { comments } = req.body;
    if (!comments?.trim()) return res.status(400).json({ error: 'Query remarks are required' });
    const r = await query(
      `UPDATE sc_bills
          SET status='queried', query_remarks=$1, updated_at=NOW()
        WHERE id=$2 AND company_id=$3 AND status IN ('submitted','under_review')
        RETURNING *`,
      [comments.trim(), req.params.id, CID(req)]);
    if (!r.rows.length) return res.status(404).json({ error: 'Bill not found or not in a queryable state' });
    await query(
      `INSERT INTO sc_bill_approvals (bill_id,stage,action,actor_id,actor_name,comments)
       VALUES ($1,$2,'queried',$3,$4,$5)`,
      [req.params.id, r.rows[0].current_stage, req.user.id, req.user.name, comments.trim()]);
    res.json({ data: r.rows[0] });
  } catch(e){ res.status(500).json({ error: e.message }); }
});

// Reject bill
router.patch('/bills/:id/reject', authorize('super_admin','admin','project_manager','qs_engineer','accounts'), async (req, res) => {
  try {
    const { comments } = req.body;
    const result = await withTransaction(async (client) => {
      const r = await client.query(
        `UPDATE sc_bills
            SET status='rejected', rejected_by=$1, rejection_remarks=$2, updated_at=NOW()
          WHERE id=$3 AND company_id=$4 AND status <> 'rejected'
          RETURNING *`,
        [req.user.id, comments||null, req.params.id, CID(req)]
      );
      if (!r.rows.length) return null;
      await client.query(
        `INSERT INTO sc_bill_approvals (bill_id,stage,action,actor_id,actor_name,comments)
         VALUES ($1,$2,'rejected',$3,$4,$5)`,
        [req.params.id, r.rows[0].current_stage, req.user.id, req.user.name, comments||'Rejected']
      );
      await recalculateWOConsumption(r.rows[0].wo_id, client);
      return r.rows[0];
    });
    if (!result) return res.status(404).json({ error: 'Not found or already rejected' });
    res.json({ data: result });
  } catch(e){ res.status(500).json({ error: e.message }); }
});

// ════════════════════════════════════════════════════════════════════
// 7. PAYMENTS
// ════════════════════════════════════════════════════════════════════
router.get('/payments', async (req, res) => {
  try {
    const { project_id, sc_id, bill_id } = req.query;
    let sql = `SELECT p.*, b.bill_number, sc.name AS sc_name, proj.name AS project_name, u.name AS created_by_name FROM sc_payments p JOIN sc_bills b ON b.id=p.bill_id JOIN sc_subcontractors sc ON sc.id=p.sc_id JOIN projects proj ON proj.id=p.project_id LEFT JOIN users u ON u.id=p.created_by WHERE p.company_id=$1`;
    const params=[CID(req)]; let i=2;
    if (project_id){ sql+=` AND p.project_id=$${i++}`; params.push(project_id); }
    if (sc_id)     { sql+=` AND p.sc_id=$${i++}`; params.push(sc_id); }
    if (bill_id)   { sql+=` AND p.bill_id=$${i++}`; params.push(bill_id); }
    sql+=' ORDER BY p.payment_date DESC';
    res.json({ data: (await query(sql,params)).rows });
  } catch(e){ res.status(500).json({ error: e.message }); }
});

router.post('/payments', authorize(...ADMIN,'accounts'), async (req, res) => {
  try {
    const { bill_id, payment_date, amount, payment_mode, reference_no, bank_name, remarks } = req.body;
    if (!bill_id || !amount) return res.status(400).json({ error: 'bill_id and amount required' });
    const bill = await query(`SELECT * FROM sc_bills WHERE id=$1 AND company_id=$2 AND status='approved'`, [bill_id, CID(req)]);
    if (!bill.rows.length) return res.status(400).json({ error: 'Bill not found or not approved' });
    const b = bill.rows[0];
    // Validate payment amount
    const already_paid = parseFloat(b.paid_amount||0);
    const max_payable = parseFloat(b.net_payable||0) - already_paid;
    if (parseFloat(amount) > max_payable + 0.01) return res.status(400).json({ error: `Payment exceeds balance. Max: ₹${max_payable.toFixed(2)}` });
    const r = await query(`INSERT INTO sc_payments (company_id,project_id,bill_id,sc_id,payment_date,amount,payment_mode,reference_no,bank_name,remarks,created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [CID(req),b.project_id,bill_id,b.sc_id,payment_date||new Date().toISOString().slice(0,10),amount,payment_mode||'bank_transfer',reference_no||null,bank_name||null,remarks||null,req.user.id]);
    // Update bill paid amount + status
    const new_paid = already_paid + parseFloat(amount);
    const new_status = new_paid >= parseFloat(b.net_payable) - 0.01 ? 'paid' : 'approved';
    await query(`UPDATE sc_bills SET paid_amount=$1, payment_date=$2, payment_ref=$3, payment_mode=$4, status=$5, updated_at=NOW() WHERE id=$6`, [new_paid, payment_date, reference_no||null, payment_mode||null, new_status, bill_id]);
    // Update WO total_paid
    await query(`UPDATE sc_work_orders SET total_paid=total_paid+$1, updated_at=NOW() WHERE id=$2`, [amount, b.wo_id]);
    res.status(201).json({ data: r.rows[0] });
  } catch(e){ res.status(500).json({ error: e.message }); }
});

// ════════════════════════════════════════════════════════════════════
// 8. REPORTS
// ════════════════════════════════════════════════════════════════════
router.get('/reports/summary', async (req, res) => {
  try {
    const { project_id } = req.query;
    let pClause=''; const pp=[CID(req)];
    if (project_id){ pClause=` AND wo.project_id=$2`; pp.push(project_id); }
    const r = await query(`
      SELECT sc.sc_code, sc.name AS sc_name, sc.trade_type,
        COUNT(DISTINCT wo.id) AS wo_count,
        COALESCE(SUM(wo.contract_amount),0) AS contract_value,
        COALESCE(SUM(b.gross_amount) FILTER (WHERE b.status NOT IN ('draft','rejected')),0) AS total_billed,
        COALESCE(SUM(b.net_payable) FILTER (WHERE b.status='approved' OR b.status='paid'),0) AS approved_amount,
        COALESCE(SUM(p.amount),0) AS total_paid,
        COALESCE(SUM(b.retention_amount) FILTER (WHERE b.status NOT IN ('draft','rejected')),0) AS retention_held
      FROM sc_subcontractors sc
      JOIN sc_work_orders wo ON wo.sc_id=sc.id
      LEFT JOIN sc_bills b ON b.wo_id=wo.id
      LEFT JOIN sc_payments p ON p.bill_id=b.id
      WHERE sc.company_id=$1 ${pClause}
      GROUP BY sc.id, sc.sc_code, sc.name, sc.trade_type
      ORDER BY contract_value DESC`, pp);
    res.json({ data: r.rows });
  } catch(e){ res.status(500).json({ error: e.message }); }
});

router.get('/reports/wo-balance', async (req, res) => {
  try {
    const { project_id, sc_id } = req.query;
    let sql = `SELECT wo.wo_number, wo.subject, sc.name AS sc_name, p.name AS project_name, wo.contract_amount, wo.status, COALESCE(SUM(b.gross_amount) FILTER (WHERE b.status NOT IN ('draft','rejected')),0) AS total_billed, wo.contract_amount - COALESCE(SUM(b.gross_amount) FILTER (WHERE b.status NOT IN ('draft','rejected')),0) AS balance FROM sc_work_orders wo JOIN sc_subcontractors sc ON sc.id=wo.sc_id JOIN projects p ON p.id=wo.project_id LEFT JOIN sc_bills b ON b.wo_id=wo.id WHERE wo.company_id=$1`;
    const params=[CID(req)]; let i=2;
    if (project_id){ sql+=` AND wo.project_id=$${i++}`; params.push(project_id); }
    if (sc_id)     { sql+=` AND wo.sc_id=$${i++}`; params.push(sc_id); }
    sql+=' GROUP BY wo.id, sc.name, p.name ORDER BY wo.created_at DESC';
    res.json({ data: (await query(sql,params)).rows });
  } catch(e){ res.status(500).json({ error: e.message }); }
});

router.get('/reports/outstanding', async (req, res) => {
  try {
    const { project_id } = req.query;
    let pClause=''; const pp=[CID(req)];
    if (project_id){ pClause=` AND b.project_id=$2`; pp.push(project_id); }
    const r = await query(`SELECT b.bill_number, b.bill_date, b.status, sc.name AS sc_name, wo.wo_number, b.gross_amount, b.net_payable, b.paid_amount, b.net_payable - b.paid_amount AS outstanding FROM sc_bills b JOIN sc_work_orders wo ON wo.id=b.wo_id JOIN sc_subcontractors sc ON sc.id=b.sc_id WHERE b.company_id=$1 AND b.status IN ('approved','paid') ${pClause} ORDER BY b.bill_date`, pp);
    res.json({ data: r.rows });
  } catch(e){ res.status(500).json({ error: e.message }); }
});

router.get('/reports/retention', async (req, res) => {
  try {
    const r = await query(`SELECT sc.name AS sc_name, COALESCE(SUM(b.retention_amount) FILTER (WHERE b.status NOT IN ('draft','rejected')),0) AS total_retention, COALESCE(SUM(b.retention_amount) FILTER (WHERE b.status='paid'),0) AS released FROM sc_subcontractors sc JOIN sc_work_orders wo ON wo.sc_id=sc.id LEFT JOIN sc_bills b ON b.wo_id=wo.id WHERE sc.company_id=$1 GROUP BY sc.id, sc.name ORDER BY total_retention DESC`, [CID(req)]);
    res.json({ data: r.rows });
  } catch(e){ res.status(500).json({ error: e.message }); }
});

router.get('/reports/labour', async (req, res) => {
  try {
    const { project_id, sc_id, from_date, to_date } = req.query;
    let sql = `SELECT DATE(a.attendance_date) AS date, sc.name AS sc_name, COUNT(*) FILTER (WHERE a.status='present') AS present, COUNT(*) FILTER (WHERE a.status='absent') AS absent, COUNT(*) FILTER (WHERE a.status='half_day') AS half_day, COALESCE(SUM(a.wage_amount),0) AS total_wages FROM sc_attendance a LEFT JOIN sc_subcontractors sc ON sc.id=a.sc_id WHERE a.company_id=$1`;
    const params=[CID(req)]; let i=2;
    if (project_id){ sql+=` AND a.project_id=$${i++}`; params.push(project_id); }
    if (sc_id)     { sql+=` AND a.sc_id=$${i++}`; params.push(sc_id); }
    if (from_date) { sql+=` AND a.attendance_date>=$${i++}`; params.push(from_date); }
    if (to_date)   { sql+=` AND a.attendance_date<=$${i++}`; params.push(to_date); }
    sql+=' GROUP BY DATE(a.attendance_date), sc.name ORDER BY date DESC';
    res.json({ data: (await query(sql,params)).rows });
  } catch(e){ res.status(500).json({ error: e.message }); }
});

// ════════════════════════════════════════════════════════════════════
// 8b. IPCs (Interim Payment Certificates)
// ════════════════════════════════════════════════════════════════════
router.get('/ipcs', async (req, res) => {
  try {
    const { project_id, wo_id, status } = req.query;
    let sql = `
      SELECT i.*, b.bill_number, b.bill_date, b.bill_type,
             sc.name AS sc_name, wo.wo_number, wo.subject AS wo_subject,
             p.name AS project_name, u.name AS approved_by_name
        FROM sc_ipcs i
        JOIN sc_bills b ON b.id = i.bill_id
        JOIN sc_work_orders wo ON wo.id = i.wo_id
        JOIN sc_subcontractors sc ON sc.id = i.sc_id
        LEFT JOIN projects p ON p.id = i.project_id
        LEFT JOIN users u ON u.id = i.approved_by
       WHERE i.company_id = $1`;
    const params = [CID(req)];
    if (project_id) { params.push(project_id); sql += ` AND i.project_id=$${params.length}`; }
    if (wo_id)      { params.push(wo_id);      sql += ` AND i.wo_id=$${params.length}`; }
    if (status)     { params.push(status);     sql += ` AND i.status=$${params.length}`; }
    sql += ' ORDER BY i.ipc_date DESC, i.created_at DESC';
    const r = await query(sql, params);
    res.json({ data: r.rows });
  } catch(e){ res.status(500).json({ error: e.message }); }
});

// ════════════════════════════════════════════════════════════════════
// 9. SETTINGS
// ════════════════════════════════════════════════════════════════════
router.get('/settings', async (req, res) => {
  try {
    const r = await query(`SELECT * FROM sc_settings WHERE company_id=$1`, [CID(req)]);
    if (!r.rows.length) {
      // Return defaults if not configured
      return res.json({ data: { default_gst_pct:18, default_tds_pct:2, default_retention_pct:5, approval_stages:['site_engineer','project_manager','qs_engineer','accounts'], wo_prefix:'WO', bill_prefix:'BILL', require_wo_approval:true, block_overbilling:true } });
    }
    res.json({ data: r.rows[0] });
  } catch(e){ res.status(500).json({ error: e.message }); }
});

router.post('/settings', authorize(...ADMIN), async (req, res) => {
  try {
    const f = req.body;
    const r = await query(`INSERT INTO sc_settings
      (company_id,default_gst_pct,default_tds_pct,default_retention_pct,approval_stages,wo_prefix,bill_prefix,require_wo_approval,block_overbilling,
       essl_host,essl_port,essl_database,essl_user,essl_password,essl_enabled,essl_schema)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
      ON CONFLICT (company_id) DO UPDATE SET
        default_gst_pct=$2, default_tds_pct=$3, default_retention_pct=$4,
        approval_stages=$5, wo_prefix=$6, bill_prefix=$7,
        require_wo_approval=$8, block_overbilling=$9,
        essl_host=$10, essl_port=$11, essl_database=$12, essl_user=$13,
        essl_password=COALESCE(NULLIF($14,''), sc_settings.essl_password),
        essl_enabled=$15, essl_schema=$16, updated_at=NOW()
      RETURNING *`,
      [CID(req),
       f.default_gst_pct||18, f.default_tds_pct||2, f.default_retention_pct||5,
       JSON.stringify(f.approval_stages||['site_engineer','project_manager','qs_engineer','accounts']),
       f.wo_prefix||'WO', f.bill_prefix||'BILL',
       f.require_wo_approval!==false, f.block_overbilling!==false,
       f.essl_host||null, f.essl_port||3306, f.essl_database||'att2000',
       f.essl_user||null, f.essl_password||null, f.essl_enabled||false,
       f.essl_schema||'auto']);
    // Don't return password in response
    const row = { ...r.rows[0] };
    if (row.essl_password) row.essl_password = '***saved***';
    res.json({ data: row });
  } catch(e){ res.status(500).json({ error: e.message }); }
});

// ════════════════════════════════════════════════════════════════════
// 10. MEASUREMENT BOOK (MB)
// ════════════════════════════════════════════════════════════════════
async function nextMBNumber(client, cid, projId) {
  const proj = await client.query(`SELECT name FROM projects WHERE id=$1`, [projId]);
  const code = (proj.rows[0]?.name||'XX').replace(/[^A-Za-z0-9]/g,'').substring(0,6).toUpperCase();
  const r = await client.query(
    `SELECT COALESCE(MAX(CAST(REGEXP_REPLACE(mb_number, '^MB-[A-Z0-9]+-', '') AS INTEGER)), 0) AS last_seq
     FROM sc_mb_entries WHERE company_id=$1 AND mb_number ~ '^MB-[A-Z0-9]+-[0-9]+'`, [cid]);
  return `MB-${code}-${String(parseInt(r.rows[0].last_seq)+1).padStart(3,'0')}`;
}
async function nextIPCNumber(client, cid, projId) {
  const proj = await client.query(`SELECT name FROM projects WHERE id=$1`, [projId]);
  const code = (proj.rows[0]?.name||'XX').replace(/[^A-Za-z0-9]/g,'').substring(0,6).toUpperCase();
  const r = await client.query(
    `SELECT COALESCE(MAX(CAST(REGEXP_REPLACE(ipc_number, '^IPC-[A-Z0-9]+-', '') AS INTEGER)), 0) AS last_seq
     FROM sc_ipcs WHERE company_id=$1 AND ipc_number ~ '^IPC-[A-Z0-9]+-[0-9]+'`, [cid]);
  return `IPC-${code}-${String(parseInt(r.rows[0].last_seq)+1).padStart(3,'0')}`;
}
// Helper to load approval stages from settings (with fallback)
async function getApprovalStages(cid) {
  const r = await query(`SELECT approval_stages FROM sc_settings WHERE company_id=$1`, [cid]);
  return r.rows[0]?.approval_stages || ['site_engineer','project_manager','qs_engineer','accounts'];
}

router.get('/mb', async (req, res) => {
  try {
    const { project_id, wo_id, sc_id, status } = req.query;
    let sql = `SELECT m.*, wo.wo_number, wo.subject AS wo_subject, sc.name AS sc_name, p.name AS project_name,
      wi.description AS item_desc, u.name AS created_by_name
      FROM sc_mb_entries m
      JOIN sc_work_orders wo ON wo.id=m.wo_id
      JOIN sc_subcontractors sc ON sc.id=m.sc_id
      JOIN projects p ON p.id=m.project_id
      LEFT JOIN sc_wo_items wi ON wi.id=m.wo_item_id
      LEFT JOIN users u ON u.id=m.created_by
      WHERE m.company_id=$1`;
    const params=[CID(req)]; let i=2;
    if (project_id){ sql+=` AND m.project_id=$${i++}`; params.push(project_id); }
    if (wo_id)     { sql+=` AND m.wo_id=$${i++}`; params.push(wo_id); }
    if (sc_id)     { sql+=` AND m.sc_id=$${i++}`; params.push(sc_id); }
    if (status)    { sql+=` AND m.status=$${i++}`; params.push(status); }
    sql+=' ORDER BY m.mb_date DESC, m.created_at DESC';
    res.json({ data: (await query(sql,params)).rows });
  } catch(e){ res.status(500).json({ error: e.message }); }
});

router.post('/mb', authorize(...PLANNER), async (req, res) => {
  try {
    const {
      wo_id, wo_item_id, mb_date, tower_block, floor_number, location_detail,
      drawing_ref, description, unit, executed_qty, remarks, site_photos,
    } = req.body;
    if (!wo_id || !description || !executed_qty) {
      return res.status(400).json({ error: 'wo_id, description and executed_qty required' });
    }
    const wo = await query(`SELECT * FROM sc_work_orders WHERE id=$1 AND company_id=$2`, [wo_id, CID(req)]);
    if (!wo.rows.length) return res.status(404).json({ error: 'Work order not found' });
    if (!['active','approved'].includes(wo.rows[0].status)) return res.status(400).json({ error: 'WO must be active/approved' });

    let prev_qty = 0;
    if (wo_item_id) {
      const prevR = await query(`SELECT COALESCE(SUM(executed_qty),0) AS total FROM sc_mb_entries WHERE wo_item_id=$1 AND status='approved' AND company_id=$2`, [wo_item_id, CID(req)]);
      prev_qty = parseFloat(prevR.rows[0].total || 0);
      const item = await query(`SELECT qty, billed_qty FROM sc_wo_items WHERE id=$1`, [wo_item_id]);
      if (item.rows.length) {
        const balance = parseFloat(item.rows[0].qty) - prev_qty;
        if (parseFloat(executed_qty) > balance + 0.001) {
          return res.status(400).json({ error: `Executed qty (${executed_qty}) exceeds WO balance (${balance.toFixed(3)})` });
        }
      }
    }
    const mbResult = await withTransaction(async (client) => {
      const mb_number = await nextMBNumber(client, CID(req), wo.rows[0].project_id);
      const r = await client.query(`INSERT INTO sc_mb_entries
        (company_id,project_id,wo_id,wo_item_id,sc_id,mb_number,mb_date,tower_block,floor_number,
         location_detail,drawing_ref,description,unit,executed_qty,previous_qty,remarks,site_photos,created_by)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) RETURNING *`,
        [CID(req),wo.rows[0].project_id,wo_id,wo_item_id||null,wo.rows[0].sc_id,mb_number,
         mb_date||new Date().toISOString().slice(0,10),tower_block||null,floor_number||null,
         location_detail||null,drawing_ref||null,description,unit||null,executed_qty,prev_qty,
         remarks||null,JSON.stringify(site_photos||[]),req.user.id]);
      return r.rows[0];
    });
    res.status(201).json({ data: mbResult });
  } catch(e){ res.status(500).json({ error: e.message }); }
});

router.get('/mb/:id', async (req, res) => {
  try {
    const r = await query(`SELECT m.*, wo.wo_number, wo.subject AS wo_subject, wo.contract_amount,
      sc.name AS sc_name, p.name AS project_name,
      wi.description AS item_desc, wi.qty AS wo_qty, wi.unit AS wo_unit, wi.rate AS wo_rate,
      u1.name AS checked_by_name, u2.name AS approved_by_name
      FROM sc_mb_entries m
      JOIN sc_work_orders wo ON wo.id=m.wo_id
      JOIN sc_subcontractors sc ON sc.id=m.sc_id
      JOIN projects p ON p.id=m.project_id
      LEFT JOIN sc_wo_items wi ON wi.id=m.wo_item_id
      LEFT JOIN users u1 ON u1.id=m.checked_by
      LEFT JOIN users u2 ON u2.id=m.approved_by
      WHERE m.id=$1 AND m.company_id=$2`, [req.params.id, CID(req)]);
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json({ data: r.rows[0] });
  } catch(e){ res.status(500).json({ error: e.message }); }
});

router.patch('/mb/:id/check', authorize(...PLANNER), async (req, res) => {
  try {
    const { remarks } = req.body;
    const r = await query(`UPDATE sc_mb_entries SET status='checked', checked_by=$1, checked_at=NOW(), check_remarks=$2, updated_at=NOW() WHERE id=$3 AND company_id=$4 AND status='submitted' RETURNING *`,
      [req.user.id, remarks||null, req.params.id, CID(req)]);
    if (!r.rows.length) return res.status(404).json({ error: 'Not found or not in submitted state' });
    res.json({ data: r.rows[0] });
  } catch(e){ res.status(500).json({ error: e.message }); }
});

router.patch('/mb/:id/submit', authorize(...PLANNER), async (req, res) => {
  try {
    const r = await query(`UPDATE sc_mb_entries SET status='submitted', updated_at=NOW() WHERE id=$1 AND company_id=$2 AND status='draft' RETURNING *`,
      [req.params.id, CID(req)]);
    if (!r.rows.length) return res.status(404).json({ error: 'Not found or not in draft state' });
    res.json({ data: r.rows[0] });
  } catch(e){ res.status(500).json({ error: e.message }); }
});

router.patch('/mb/:id/approve', authorize(...ADMIN,'project_manager','qs_engineer'), async (req, res) => {
  try {
    const { remarks } = req.body;
    const r = await query(`UPDATE sc_mb_entries SET status='approved', approved_by=$1, approved_at=NOW(), approve_remarks=$2, updated_at=NOW() WHERE id=$3 AND company_id=$4 AND status IN ('submitted','checked') RETURNING *`,
      [req.user.id, remarks||null, req.params.id, CID(req)]);
    if (!r.rows.length) return res.status(404).json({ error: 'Not found or not ready to approve' });
    res.json({ data: r.rows[0] });
  } catch(e){ res.status(500).json({ error: e.message }); }
});

router.patch('/mb/:id/reject', authorize(...ADMIN,'project_manager','qs_engineer'), async (req, res) => {
  try {
    const { remarks } = req.body;
    const r = await query(`UPDATE sc_mb_entries SET status='rejected', rejected_by=$1, rejection_remarks=$2, updated_at=NOW() WHERE id=$3 AND company_id=$4 RETURNING *`,
      [req.user.id, remarks||null, req.params.id, CID(req)]);
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json({ data: r.rows[0] });
  } catch(e){ res.status(500).json({ error: e.message }); }
});

// QA/QC clearance on MB entry
router.patch('/mb/:id/qaqc-clear', authorize('super_admin','admin','qs_engineer','quality_inspector','qaqc'), async (req, res) => {
  try {
    const { remarks } = req.body;
    const r = await query(
      `UPDATE sc_mb_entries
          SET qaqc_cleared=TRUE, qaqc_cleared_by=$1, qaqc_cleared_at=NOW(),
              qaqc_remarks=$2, updated_at=NOW()
        WHERE id=$3 AND company_id=$4
        RETURNING *`,
      [req.user.id, remarks||null, req.params.id, CID(req)]);
    if (!r.rows.length) return res.status(404).json({ error: 'MB entry not found' });
    res.json({ data: r.rows[0] });
  } catch(e){ res.status(500).json({ error: e.message }); }
});

// ════════════════════════════════════════════════════════════════════
// 11. ADVANCES
// ════════════════════════════════════════════════════════════════════
async function nextAdvNumber(client, cid, projId) {
  const proj = await client.query(`SELECT name FROM projects WHERE id=$1`, [projId]);
  const code = (proj.rows[0]?.name||'XX').replace(/[^A-Za-z0-9]/g,'').substring(0,6).toUpperCase();
  const r = await client.query(
    `SELECT COALESCE(MAX(CAST(REGEXP_REPLACE(adv_number, '^ADV-[A-Z0-9]+-', '') AS INTEGER)), 0) AS last_seq
     FROM sc_advances WHERE company_id=$1 AND adv_number ~ '^ADV-[A-Z0-9]+-[0-9]+'`, [cid]);
  return `ADV-${code}-${String(parseInt(r.rows[0].last_seq)+1).padStart(3,'0')}`;
}

router.get('/advances', async (req, res) => {
  try {
    const { project_id, wo_id, sc_id } = req.query;
    let sql = `SELECT a.*, wo.wo_number, sc.name AS sc_name, sc.sc_code, p.name AS project_name,
        COALESCE(br.recovered_amount, 0) AS recovered_amount,
        GREATEST(0, a.amount - COALESCE(br.recovered_amount, 0)) AS balance_amount,
        CASE
          WHEN a.amount - COALESCE(br.recovered_amount, 0) <= 0.01 THEN 'fully_recovered'
          WHEN COALESCE(br.recovered_amount, 0) > 0 THEN 'partially_recovered'
          ELSE COALESCE(a.status, 'active')
        END AS recovery_status
      FROM sc_advances a
      JOIN sc_work_orders wo ON wo.id=a.wo_id
      JOIN sc_subcontractors sc ON sc.id=a.sc_id
      JOIN projects p ON p.id=a.project_id
      LEFT JOIN (
        SELECT wo_id, SUM(advance_recovery) AS recovered_amount
        FROM sc_bills
        WHERE company_id=$1 AND status NOT IN ('draft','rejected')
        GROUP BY wo_id
      ) br ON br.wo_id=a.wo_id
      WHERE a.company_id=$1`;
    const params=[CID(req)]; let i=2;
    if (project_id){ sql+=` AND a.project_id=$${i++}`; params.push(project_id); }
    if (wo_id)     { sql+=` AND a.wo_id=$${i++}`; params.push(wo_id); }
    if (sc_id)     { sql+=` AND a.sc_id=$${i++}`; params.push(sc_id); }
    sql+=' ORDER BY a.advance_date DESC';
    res.json({ data: (await query(sql,params)).rows });
  } catch(e){ res.status(500).json({ error: e.message }); }
});

router.post('/advances', authorize(...ADMIN,'accounts'), async (req, res) => {
  try {
    const { wo_id, advance_date, amount, recovery_pct, recovery_start_bill, payment_mode, reference_no, remarks } = req.body;
    if (!wo_id || !amount) return res.status(400).json({ error: 'wo_id and amount required' });
    const wo = await query(`SELECT * FROM sc_work_orders WHERE id=$1 AND company_id=$2`, [wo_id, CID(req)]);
    if (!wo.rows.length) return res.status(404).json({ error: 'Work order not found' });
    const advResult = await withTransaction(async (client) => {
      const adv_num = await nextAdvNumber(client, CID(req), wo.rows[0].project_id);
      const r = await client.query(`INSERT INTO sc_advances (company_id,project_id,wo_id,sc_id,advance_number,advance_date,amount,recovery_pct,recovery_start_bill,payment_mode,reference_no,remarks,created_by)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
        [CID(req),wo.rows[0].project_id,wo_id,wo.rows[0].sc_id,adv_num,
         advance_date||new Date().toISOString().slice(0,10),amount,recovery_pct||10,
         recovery_start_bill||null,payment_mode||'bank_transfer',reference_no||null,remarks||null,req.user.id]);
      await client.query(`UPDATE sc_work_orders SET advance_paid=advance_paid+$1, updated_at=NOW() WHERE id=$2`, [amount, wo_id]);
      return r.rows[0];
    });
    res.status(201).json({ data: advResult });
  } catch(e){ res.status(500).json({ error: e.message }); }
});

// ════════════════════════════════════════════════════════════════════
// 12. MATERIAL RECOVERIES
// ════════════════════════════════════════════════════════════════════
router.get('/material-recoveries', async (req, res) => {
  try {
    const { project_id, wo_id, sc_id } = req.query;
    let sql = `SELECT * FROM (
      SELECT mr.id, mr.company_id, mr.project_id, mr.wo_id, mr.sc_id, mr.bill_id,
        mr.recovery_date, mr.material_name, mr.material_code, mr.unit, mr.quantity,
        mr.rate, mr.amount, mr.recovery_type, mr.remarks, mr.created_by, mr.created_at,
        wo.wo_number, sc.name AS sc_name, p.name AS project_name, 'manual' AS source
      FROM sc_material_recoveries mr
      JOIN sc_work_orders wo ON wo.id=mr.wo_id
      JOIN sc_subcontractors sc ON sc.id=mr.sc_id
      JOIN projects p ON p.id=mr.project_id
      WHERE mr.company_id=$1
      UNION ALL
      SELECT b.id, b.company_id, b.project_id, b.wo_id, b.sc_id, b.id AS bill_id,
        b.bill_date AS recovery_date, 'RA Bill Material Recovery' AS material_name,
        b.bill_number AS material_code, 'LS' AS unit, 1 AS quantity, b.material_recovery AS rate,
        b.material_recovery AS amount, 'bill_deduction' AS recovery_type,
        COALESCE(b.description, 'Material recovery deducted in RA bill') AS remarks,
        b.created_by, b.created_at, wo.wo_number, sc.name AS sc_name, p.name AS project_name,
        'ra_bill' AS source
      FROM sc_bills b
      JOIN sc_work_orders wo ON wo.id=b.wo_id
      JOIN sc_subcontractors sc ON sc.id=b.sc_id
      JOIN projects p ON p.id=b.project_id
      WHERE b.company_id=$1
        AND b.status NOT IN ('draft','rejected')
        AND COALESCE(b.material_recovery, 0) > 0
    ) mr WHERE 1=1`;
    const params=[CID(req)]; let i=2;
    if (project_id){ sql+=` AND mr.project_id=$${i++}`; params.push(project_id); }
    if (wo_id)     { sql+=` AND mr.wo_id=$${i++}`; params.push(wo_id); }
    if (sc_id)     { sql+=` AND mr.sc_id=$${i++}`; params.push(sc_id); }
    sql+=' ORDER BY recovery_date DESC';
    res.json({ data: (await query(sql,params)).rows });
  } catch(e){ res.status(500).json({ error: e.message }); }
});

router.post('/material-recoveries', authorize(...PLANNER,'accounts'), async (req, res) => {
  try {
    const { wo_id, bill_id, recovery_date, material_name, material_code, unit, quantity, rate, amount, recovery_type, remarks } = req.body;
    if (!wo_id || !material_name || !amount) return res.status(400).json({ error: 'wo_id, material_name and amount required' });
    const wo = await query(`SELECT * FROM sc_work_orders WHERE id=$1 AND company_id=$2`, [wo_id, CID(req)]);
    if (!wo.rows.length) return res.status(404).json({ error: 'Work order not found' });
    const r = await query(`INSERT INTO sc_material_recoveries (company_id,project_id,wo_id,sc_id,bill_id,recovery_date,material_name,material_code,unit,quantity,rate,amount,recovery_type,remarks,created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,
      [CID(req),wo.rows[0].project_id,wo_id,wo.rows[0].sc_id,bill_id||null,
       recovery_date||new Date().toISOString().slice(0,10),material_name,material_code||null,
       unit||null,quantity||0,rate||0,amount,recovery_type||'actual',remarks||null,req.user.id]);
    res.status(201).json({ data: r.rows[0] });
  } catch(e){ res.status(500).json({ error: e.message }); }
});

// ════════════════════════════════════════════════════════════════════
// 13. RETENTION RELEASES
// ════════════════════════════════════════════════════════════════════
async function nextRRNumber(client, cid, projId) {
  const proj = await client.query(`SELECT name FROM projects WHERE id=$1`, [projId]);
  const code = (proj.rows[0]?.name||'XX').replace(/[^A-Za-z0-9]/g,'').substring(0,6).toUpperCase();
  const r = await client.query(
    `SELECT COALESCE(MAX(CAST(REGEXP_REPLACE(rr_number, '^RR-[A-Z0-9]+-', '') AS INTEGER)), 0) AS last_seq
     FROM sc_retention_releases WHERE company_id=$1 AND rr_number ~ '^RR-[A-Z0-9]+-[0-9]+'`, [cid]);
  return `RR-${code}-${String(parseInt(r.rows[0].last_seq)+1).padStart(3,'0')}`;
}

router.get('/retention-releases', async (req, res) => {
  try {
    const { project_id, sc_id } = req.query;
    let sql = `SELECT rr.*, wo.wo_number, sc.name AS sc_name, p.name AS project_name,
      COALESCE((SELECT SUM(b.retention_amount) FROM sc_bills b WHERE b.wo_id=rr.wo_id AND b.status NOT IN ('draft','rejected')),0) AS total_retained
      FROM sc_retention_releases rr
      JOIN sc_work_orders wo ON wo.id=rr.wo_id
      JOIN sc_subcontractors sc ON sc.id=rr.sc_id
      JOIN projects p ON p.id=rr.project_id
      WHERE rr.company_id=$1`;
    const params=[CID(req)]; let i=2;
    if (project_id){ sql+=` AND rr.project_id=$${i++}`; params.push(project_id); }
    if (sc_id)     { sql+=` AND rr.sc_id=$${i++}`; params.push(sc_id); }
    sql+=' ORDER BY rr.release_date DESC';
    res.json({ data: (await query(sql,params)).rows });
  } catch(e){ res.status(500).json({ error: e.message }); }
});

// retention held per WO (for UI display)
router.get('/retention-summary', async (req, res) => {
  try {
    const { project_id } = req.query;
    let pClause=''; const pp=[CID(req)];
    if (project_id){ pClause=` AND wo.project_id=$2`; pp.push(project_id); }
    const r = await query(`
      SELECT wo.id AS wo_id, wo.wo_number, sc.name AS sc_name, sc.sc_code,
             p.name AS project_name, wo.status AS wo_status,
             COALESCE(ret.total_retained,0) AS total_retained,
             COALESCE(rel.total_released,0) AS total_released
      FROM sc_work_orders wo
      JOIN sc_subcontractors sc ON sc.id=wo.sc_id
      JOIN projects p ON p.id=wo.project_id
      LEFT JOIN (
        SELECT wo_id, SUM(retention_amount) AS total_retained
        FROM sc_bills
        WHERE company_id=$1 AND status NOT IN ('draft','rejected')
        GROUP BY wo_id
      ) ret ON ret.wo_id=wo.id
      LEFT JOIN (
        SELECT wo_id, SUM(release_amount) AS total_released
        FROM sc_retention_releases
        WHERE company_id=$1 AND status='released'
        GROUP BY wo_id
      ) rel ON rel.wo_id=wo.id
      WHERE wo.company_id=$1${pClause}
        AND COALESCE(ret.total_retained,0) > 0
      ORDER BY total_retained DESC`, pp);
    res.json({ data: r.rows });
  } catch(e){ res.status(500).json({ error: e.message }); }
});

router.post('/retention-releases', authorize(...ADMIN,'accounts'), async (req, res) => {
  try {
    const { wo_id, release_date, release_amount, remarks } = req.body;
    if (!wo_id || !release_amount) return res.status(400).json({ error: 'wo_id and release_amount required' });
    const wo = await query(`SELECT * FROM sc_work_orders WHERE id=$1 AND company_id=$2`, [wo_id, CID(req)]);
    if (!wo.rows.length) return res.status(404).json({ error: 'Work order not found' });
    // Get total retained
    const retained = await query(`SELECT COALESCE(SUM(retention_amount),0) AS total FROM sc_bills WHERE wo_id=$1 AND status NOT IN ('draft','rejected')`, [wo_id]);
    const rrResult = await withTransaction(async (client) => {
      const rr_num = await nextRRNumber(client, CID(req), wo.rows[0].project_id);
      const r = await client.query(`INSERT INTO sc_retention_releases (company_id,project_id,wo_id,sc_id,release_number,release_date,total_retained,release_amount,remarks,created_by)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
        [CID(req),wo.rows[0].project_id,wo_id,wo.rows[0].sc_id,rr_num,
         release_date||new Date().toISOString().slice(0,10),
         parseFloat(retained.rows[0].total||0),release_amount,remarks||null,req.user.id]);
      return r.rows[0];
    });
    res.status(201).json({ data: rrResult });
  } catch(e){ res.status(500).json({ error: e.message }); }
});

router.patch('/retention-releases/:id/approve', authorize(...ADMIN,'accounts'), async (req, res) => {
  try {
    const r = await query(`UPDATE sc_retention_releases SET status='approved', approved_by=$1, approved_at=NOW(), updated_at=NOW() WHERE id=$2 AND company_id=$3 AND status='pending' RETURNING *`,
      [req.user.id, req.params.id, CID(req)]);
    if (!r.rows.length) return res.status(404).json({ error: 'Not found or already processed' });
    res.json({ data: r.rows[0] });
  } catch(e){ res.status(500).json({ error: e.message }); }
});

router.patch('/retention-releases/:id/release', authorize(...ADMIN,'accounts'), async (req, res) => {
  try {
    const r = await query(`UPDATE sc_retention_releases SET status='released', updated_at=NOW() WHERE id=$1 AND company_id=$2 AND status='approved' RETURNING *`,
      [req.params.id, CID(req)]);
    if (!r.rows.length) return res.status(404).json({ error: 'Not found or not approved' });
    // Update WO retention_held
    await query(`UPDATE sc_work_orders SET retention_held=retention_held-$1, updated_at=NOW() WHERE id=$2`,
      [r.rows[0].release_amount, r.rows[0].wo_id]);
    res.json({ data: r.rows[0] });
  } catch(e){ res.status(500).json({ error: e.message }); }
});

// ════════════════════════════════════════════════════════════════════
// 14. FINAL BILLS
// ════════════════════════════════════════════════════════════════════
async function nextFBNumber(client, cid, projId) {
  const proj = await client.query(`SELECT name FROM projects WHERE id=$1`, [projId]);
  const code = (proj.rows[0]?.name||'XX').replace(/[^A-Za-z0-9]/g,'').substring(0,6).toUpperCase();
  const r = await client.query(
    `SELECT COALESCE(MAX(CAST(REGEXP_REPLACE(fb_number, '^FB-[A-Z0-9]+-', '') AS INTEGER)), 0) AS last_seq
     FROM sc_final_bills WHERE company_id=$1 AND fb_number ~ '^FB-[A-Z0-9]+-[0-9]+'`, [cid]);
  return `FB-${code}-${String(parseInt(r.rows[0].last_seq)+1).padStart(3,'0')}`;
}

router.get('/final-bills', async (req, res) => {
  try {
    const { project_id, wo_id } = req.query;
    let sql = `SELECT fb.*, wo.wo_number, sc.name AS sc_name, p.name AS project_name
      FROM sc_final_bills fb
      JOIN sc_work_orders wo ON wo.id=fb.wo_id
      JOIN sc_subcontractors sc ON sc.id=fb.sc_id
      JOIN projects p ON p.id=fb.project_id
      WHERE fb.company_id=$1`;
    const params=[CID(req)]; let i=2;
    if (project_id){ sql+=` AND fb.project_id=$${i++}`; params.push(project_id); }
    if (wo_id)     { sql+=` AND fb.wo_id=$${i++}`; params.push(wo_id); }
    sql+=' ORDER BY fb.bill_date DESC';
    res.json({ data: (await query(sql,params)).rows });
  } catch(e){ res.status(500).json({ error: e.message }); }
});

router.post('/final-bills', authorize(...ADMIN,'qs_engineer'), async (req, res) => {
  try {
    const { wo_id, bill_date, retention_released, other_adjustments, remarks } = req.body;
    if (!wo_id) return res.status(400).json({ error: 'wo_id required' });
    const wo = await query(`SELECT * FROM sc_work_orders WHERE id=$1 AND company_id=$2`, [wo_id, CID(req)]);
    if (!wo.rows.length) return res.status(404).json({ error: 'Work order not found' });
    const woRow = wo.rows[0];
    // Compute summary from existing bills
    const billSummary = await query(`SELECT COALESCE(SUM(gross_amount),0) AS total_billed, COALESCE(SUM(paid_amount),0) AS total_paid, COALESCE(SUM(retention_amount),0) AS total_retention, COALESCE(SUM(advance_recovery),0) AS total_adv_rec FROM sc_bills WHERE wo_id=$1 AND status NOT IN ('draft','rejected')`, [wo_id]);
    const bs = billSummary.rows[0];
    const ret_released = parseFloat(retention_released||0);
    const other_adj    = parseFloat(other_adjustments||0);
    const net_final    = parseFloat(bs.total_billed||0) - parseFloat(bs.total_paid||0) + ret_released + other_adj;
    const fbResult = await withTransaction(async (client) => {
      const fb_number = await nextFBNumber(client, CID(req), woRow.project_id);
      const r = await client.query(`INSERT INTO sc_final_bills (company_id,project_id,wo_id,sc_id,final_bill_number,bill_date,total_wo_value,total_ra_billed,total_ra_paid,retention_released,advance_recovered,other_adjustments,net_final_amount,remarks,created_by)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,
        [CID(req),woRow.project_id,wo_id,woRow.sc_id,fb_number,
         bill_date||new Date().toISOString().slice(0,10),woRow.contract_amount,
         bs.total_billed,bs.total_paid,ret_released,bs.total_adv_rec,other_adj,net_final,remarks||null,req.user.id]);
      return r.rows[0];
    });
    res.status(201).json({ data: fbResult });
  } catch(e){ res.status(500).json({ error: e.message }); }
});

// ════════════════════════════════════════════════════════════════════
// 15. ENHANCED REPORTS
// ════════════════════════════════════════════════════════════════════

// Contractor Ledger — full transaction history for one SC
router.get('/reports/ledger', async (req, res) => {
  try {
    const { sc_id, project_id, from_date, to_date } = req.query;
    if (!sc_id) return res.status(400).json({ error: 'sc_id required' });
    let params=[CID(req),sc_id]; let i=3;
    let dateClause='';
    if (from_date){ dateClause+=` AND created_at::date>=$${i++}`; params.push(from_date); }
    if (to_date)  { dateClause+=` AND created_at::date<=$${i++}`; params.push(to_date); }

    // Bills
    const bills = await query(`SELECT 'Bill' AS txn_type, bill_number AS ref_no, bill_date AS txn_date, gross_amount AS debit, 0 AS credit, net_payable AS net, status, project_id FROM sc_bills WHERE company_id=$1 AND sc_id=$2${dateClause} ORDER BY bill_date`, params);
    // Payments
    const pays = await query(`SELECT 'Payment' AS txn_type, p.reference_no AS ref_no, p.payment_date AS txn_date, 0 AS debit, p.amount AS credit, p.amount AS net, 'paid' AS status, p.project_id FROM sc_payments p WHERE p.company_id=$1 AND p.sc_id=$2${dateClause.replace(/created_at/g,'p.created_at')} ORDER BY p.payment_date`, params);
    // Advances
    const advs = await query(`SELECT 'Advance' AS txn_type, advance_number AS ref_no, advance_date AS txn_date, amount AS debit, 0 AS credit, amount AS net, status, project_id FROM sc_advances WHERE company_id=$1 AND sc_id=$2${dateClause} ORDER BY advance_date`, params);

    // Combine + sort
    const ledger = [...bills.rows, ...pays.rows, ...advs.rows]
      .sort((a,b) => new Date(a.txn_date) - new Date(b.txn_date));
    let balance = 0;
    const ledgerWithBal = ledger.map(r => {
      balance += parseFloat(r.debit||0) - parseFloat(r.credit||0);
      return { ...r, running_balance: balance };
    });
    res.json({ data: ledgerWithBal });
  } catch(e){ res.status(500).json({ error: e.message }); }
});

// BOQ vs Actual
router.get('/reports/boq-actual', async (req, res) => {
  try {
    const { wo_id, project_id } = req.query;
    let sql = `SELECT wi.id, wi.item_code, wi.description, wi.unit,
      wi.qty AS wo_qty, wi.rate,
      wi.qty * wi.rate AS wo_amount,
      COALESCE(SUM(mb.executed_qty) FILTER (WHERE mb.status='approved'),0) AS mb_qty,
      wi.billed_qty AS billed_qty,
      wi.qty * wi.rate - COALESCE(SUM(bi.amount) FILTER (WHERE b.status NOT IN ('draft','rejected')),0) AS balance_amount,
      wo.wo_number, sc.name AS sc_name, p.name AS project_name
      FROM sc_wo_items wi
      JOIN sc_work_orders wo ON wo.id=wi.wo_id
      JOIN sc_subcontractors sc ON sc.id=wo.sc_id
      JOIN projects p ON p.id=wo.project_id
      LEFT JOIN sc_mb_entries mb ON mb.wo_item_id=wi.id
      LEFT JOIN sc_bill_items bi ON bi.wo_item_id=wi.id
      LEFT JOIN sc_bills b ON b.id=bi.bill_id
      WHERE wo.company_id=$1`;
    const params=[CID(req)]; let i=2;
    if (wo_id)     { sql+=` AND wi.wo_id=$${i++}`; params.push(wo_id); }
    if (project_id){ sql+=` AND wo.project_id=$${i++}`; params.push(project_id); }
    sql+=' GROUP BY wi.id, wo.wo_number, sc.name, p.name ORDER BY wo.wo_number, wi.sequence_no';
    res.json({ data: (await query(sql,params)).rows });
  } catch(e){ res.status(500).json({ error: e.message }); }
});

// Advance Recovery Report
router.get('/reports/advance-recovery', async (req, res) => {
  try {
    const { project_id, sc_id } = req.query;
    let sql = `SELECT a.advance_number, a.advance_date, a.amount, a.recovery_pct,
      a.recovered_amount, a.balance_amount, a.status,
      wo.wo_number, sc.name AS sc_name, p.name AS project_name
      FROM sc_advances a
      JOIN sc_work_orders wo ON wo.id=a.wo_id
      JOIN sc_subcontractors sc ON sc.id=a.sc_id
      JOIN projects p ON p.id=a.project_id
      WHERE a.company_id=$1`;
    const params=[CID(req)]; let i=2;
    if (project_id){ sql+=` AND a.project_id=$${i++}`; params.push(project_id); }
    if (sc_id)     { sql+=` AND a.sc_id=$${i++}`; params.push(sc_id); }
    sql+=' ORDER BY a.advance_date DESC';
    res.json({ data: (await query(sql,params)).rows });
  } catch(e){ res.status(500).json({ error: e.message }); }
});

// Payment Register
router.get('/reports/payment-register', async (req, res) => {
  try {
    const { project_id, sc_id, from_date, to_date } = req.query;
    let sql = `SELECT p.*, b.bill_number, sc.name AS sc_name, sc.sc_code, proj.name AS project_name,
      u.name AS created_by_name
      FROM sc_payments p
      JOIN sc_bills b ON b.id=p.bill_id
      JOIN sc_subcontractors sc ON sc.id=p.sc_id
      JOIN projects proj ON proj.id=p.project_id
      LEFT JOIN users u ON u.id=p.created_by
      WHERE p.company_id=$1`;
    const params=[CID(req)]; let i=2;
    if (project_id){ sql+=` AND p.project_id=$${i++}`; params.push(project_id); }
    if (sc_id)     { sql+=` AND p.sc_id=$${i++}`; params.push(sc_id); }
    if (from_date) { sql+=` AND p.payment_date>=$${i++}`; params.push(from_date); }
    if (to_date)   { sql+=` AND p.payment_date<=$${i++}`; params.push(to_date); }
    sql+=' ORDER BY p.payment_date DESC';
    res.json({ data: (await query(sql,params)).rows });
  } catch(e){ res.status(500).json({ error: e.message }); }
});

// ════════════════════════════════════════════════════════════════════
// NMR — NOMINAL MUSTER ROLL (Labour Contractor Billing)
// ════════════════════════════════════════════════════════════════════
async function nextNMRNumber(client, cid, projId) {
  const proj = await client.query(`SELECT name FROM projects WHERE id=$1`, [projId]);
  const code = (proj.rows[0]?.name||'XX').replace(/[^A-Za-z0-9]/g,'').substring(0,6).toUpperCase();
  const r = await client.query(
    `SELECT COALESCE(MAX(CAST(REGEXP_REPLACE(nmr_number, '^NMR-[A-Z0-9]+-', '') AS INTEGER)), 0) AS last_seq
     FROM sc_nmr WHERE company_id=$1 AND nmr_number ~ '^NMR-[A-Z0-9]+-[0-9]+'`, [cid]);
  return `NMR-${code}-${String(parseInt(r.rows[0].last_seq)+1).padStart(3,'0')}`;
}

// List NMRs
router.get('/nmr', async (req, res) => {
  try {
    const { project_id, sc_id, wo_id, status } = req.query;
    let sql = `SELECT n.*, wo.wo_number, sc.name AS sc_name, sc.contractor_type,
      p.name AS project_name, u.name AS created_by_name
      FROM sc_nmr n
      JOIN sc_work_orders wo ON wo.id=n.wo_id
      JOIN sc_subcontractors sc ON sc.id=n.sc_id
      JOIN projects p ON p.id=n.project_id
      LEFT JOIN users u ON u.id=n.created_by
      WHERE n.company_id=$1`;
    const params=[CID(req)]; let i=2;
    if (project_id){ sql+=` AND n.project_id=$${i++}`; params.push(project_id); }
    if (sc_id)     { sql+=` AND n.sc_id=$${i++}`; params.push(sc_id); }
    if (wo_id)     { sql+=` AND n.wo_id=$${i++}`; params.push(wo_id); }
    if (status)    { sql+=` AND n.status=$${i++}`; params.push(status); }
    sql+=' ORDER BY n.period_from DESC, n.created_at DESC';
    res.json({ data: (await query(sql,params)).rows });
  } catch(e){ res.status(500).json({ error: e.message }); }
});

// Get NMR detail (with worker summary)
router.get('/nmr/:id', async (req, res) => {
  try {
    const nmr = await query(`
      SELECT n.*, wo.wo_number, wo.contract_amount, sc.name AS sc_name, sc.contractor_type,
             p.name AS project_name, u1.name AS checked_by_name, u2.name AS approved_by_name
      FROM sc_nmr n
      JOIN sc_work_orders wo ON wo.id=n.wo_id
      JOIN sc_subcontractors sc ON sc.id=n.sc_id
      JOIN projects p ON p.id=n.project_id
      LEFT JOIN users u1 ON u1.id=n.checked_by
      LEFT JOIN users u2 ON u2.id=n.approved_by
      WHERE n.id=$1 AND n.company_id=$2`, [req.params.id, CID(req)]);
    if (!nmr.rows.length) return res.status(404).json({ error: 'NMR not found' });
    // Worker-wise summary for this NMR period
    const workerSummary = await query(`
      SELECT w.id AS worker_id, w.worker_code, w.worker_name, w.skill_type, w.daily_rate,
        COUNT(*) FILTER (WHERE a.status='present') AS days_present,
        COUNT(*) FILTER (WHERE a.status='half_day') * 0.5 AS half_days,
        COUNT(*) FILTER (WHERE a.status='absent') AS days_absent,
        COALESCE(SUM(a.overtime_hours),0) AS total_overtime,
        COUNT(*) FILTER (WHERE a.status='present') * w.daily_rate
          + COUNT(*) FILTER (WHERE a.status='half_day') * w.daily_rate * 0.5
          + COALESCE(SUM(a.overtime_hours),0) * (w.daily_rate / 8.0) AS computed_wages
      FROM sc_workers w
      LEFT JOIN sc_attendance a ON a.worker_id=w.id
        AND a.attendance_date BETWEEN $2 AND $3
        AND a.company_id=$4
      WHERE w.sc_id=$5 AND (w.wo_id=$6 OR w.wo_id IS NULL) AND w.status='active'
      GROUP BY w.id, w.worker_code, w.worker_name, w.skill_type, w.daily_rate
      ORDER BY w.skill_type, w.worker_name`,
      [req.params.id, nmr.rows[0].period_from, nmr.rows[0].period_to, CID(req), nmr.rows[0].sc_id, nmr.rows[0].wo_id]);
    res.json({ data: { ...nmr.rows[0], workers: workerSummary.rows } });
  } catch(e){ res.status(500).json({ error: e.message }); }
});

// Get NMR preview — full worker-by-day matrix
router.get('/nmr/:id/preview', async (req, res) => {
  try {
    const nmr = await query(`SELECT * FROM sc_nmr WHERE id=$1 AND company_id=$2`, [req.params.id, CID(req)]);
    if (!nmr.rows.length) return res.status(404).json({ error: 'Not found' });
    const n = nmr.rows[0];

    // All workers active under this SC/WO
    const workers = await query(`
      SELECT id, worker_code, worker_name, skill_type, daily_rate
      FROM sc_workers WHERE sc_id=$1 AND (wo_id=$2 OR wo_id IS NULL) AND status='active'
      ORDER BY skill_type, worker_name`, [n.sc_id, n.wo_id]);

    // All attendance in the period for these workers
    const attendance = await query(`
      SELECT worker_id, attendance_date, status, hours_worked, overtime_hours, wage_amount, remarks
      FROM sc_attendance
      WHERE sc_id=$1 AND company_id=$2 AND attendance_date BETWEEN $3 AND $4
      ORDER BY attendance_date`, [n.sc_id, CID(req), n.period_from, n.period_to]);

    // Build date array for the period
    const dates = [];
    const start = new Date(n.period_from);
    const end   = new Date(n.period_to);
    for (let d = new Date(start); d <= end; d.setDate(d.getDate()+1)) {
      dates.push(d.toISOString().slice(0,10));
    }

    // Index attendance by worker_id + date
    const attMap = {};
    for (const a of attendance.rows) {
      const key = `${a.worker_id}_${a.attendance_date.toISOString().slice(0,10)}`;
      attMap[key] = a;
    }

    // Build matrix
    const matrix = workers.rows.map(w => {
      let mandays = 0, overtimeHours = 0, wages = 0;
      const days = dates.map(date => {
        const key = `${w.id}_${date}`;
        const att = attMap[key];
        const status = att ? att.status : null; // null = no record
        if (status === 'present')  { mandays += 1; wages += w.daily_rate; }
        if (status === 'half_day') { mandays += 0.5; wages += w.daily_rate * 0.5; }
        if (att && att.overtime_hours > 0) {
          overtimeHours += parseFloat(att.overtime_hours);
          wages += parseFloat(att.overtime_hours) * (w.daily_rate / 8);
        }
        return { date, status, hours: att?.hours_worked||null, ot: att?.overtime_hours||null };
      });
      return { ...w, days, mandays, overtime_hours: overtimeHours, total_wages: parseFloat(wages.toFixed(2)) };
    });

    res.json({ data: { nmr: n, dates, workers: matrix } });
  } catch(e){ res.status(500).json({ error: e.message }); }
});

// Create NMR — auto-pulls attendance for the period
router.post('/nmr', authorize(...PLANNER), async (req, res) => {
  try {
    const { wo_id, sc_id, period_from, period_to, remarks } = req.body;
    if (!wo_id || !sc_id || !period_from || !period_to)
      return res.status(400).json({ error: 'wo_id, sc_id, period_from, period_to required' });

    // Validate WO exists and belongs to this SC (and is a labour contractor)
    const wo = await query(`SELECT wo.*, sc.contractor_type FROM sc_work_orders wo JOIN sc_subcontractors sc ON sc.id=wo.sc_id WHERE wo.id=$1 AND wo.company_id=$2`, [wo_id, CID(req)]);
    if (!wo.rows.length) return res.status(404).json({ error: 'Work order not found' });

    // Check no overlapping NMR for same WO + period
    const overlap = await query(`SELECT id FROM sc_nmr WHERE wo_id=$1 AND company_id=$2 AND status NOT IN ('draft') AND (period_from <= $3 AND period_to >= $4)`,
      [wo_id, CID(req), period_to, period_from]);
    if (overlap.rows.length) return res.status(400).json({ error: 'An NMR already exists for this period (submitted/approved). Check for overlaps.' });

    // Get all active workers for this SC/WO
    const workers = await query(`SELECT id, skill_type, daily_rate FROM sc_workers WHERE sc_id=$1 AND (wo_id=$2 OR wo_id IS NULL) AND status='active'`, [sc_id, wo_id]);

    // Get all attendance records for this period
    const attendance = await query(`SELECT worker_id, status, hours_worked, overtime_hours FROM sc_attendance WHERE sc_id=$1 AND company_id=$2 AND attendance_date BETWEEN $3 AND $4`, [sc_id, CID(req), period_from, period_to]);

    // Build worker → daily_rate map
    const rateMap = {};
    for (const w of workers.rows) rateMap[w.id] = { rate: parseFloat(w.daily_rate||0), skill: w.skill_type };

    // Aggregate wages
    let totalMandays = 0, totalWages = 0, skilledWages = 0, unskilledWages = 0;
    const SKILLED = ['Mason','Carpenter','Barbender','Scaffolder','Plumber','Electrician','Engineer','Supervisor','Painter'];
    for (const a of attendance.rows) {
      const { rate=0, skill='Unskilled' } = rateMap[a.worker_id] || {};
      let dayWage = 0;
      if (a.status === 'present')  { dayWage = rate; totalMandays += 1; }
      if (a.status === 'half_day') { dayWage = rate * 0.5; totalMandays += 0.5; }
      const otWage = parseFloat(a.overtime_hours||0) * (rate / 8);
      dayWage += otWage;
      totalWages += dayWage;
      if (SKILLED.includes(skill)) skilledWages += dayWage;
      else unskilledWages += dayWage;
    }

    const { nmr_number, nmrRow } = await withTransaction(async (client) => {
      const nmr_number = await nextNMRNumber(client, CID(req), wo.rows[0].project_id);
      const r = await client.query(`INSERT INTO sc_nmr
        (company_id,project_id,wo_id,sc_id,nmr_number,period_from,period_to,
         total_workers,total_mandays,total_wages,skilled_wages,unskilled_wages,remarks,created_by)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
        [CID(req), wo.rows[0].project_id, wo_id, sc_id, nmr_number,
         period_from, period_to, workers.rows.length,
         totalMandays, parseFloat(totalWages.toFixed(2)),
         parseFloat(skilledWages.toFixed(2)), parseFloat(unskilledWages.toFixed(2)),
         remarks||null, req.user.id]);
      return { nmr_number, nmrRow: r };
    });
    const r = nmrRow;

    res.status(201).json({ data: r.rows[0] });
  } catch(e){ res.status(500).json({ error: e.message }); }
});

// Submit NMR for check
router.patch('/nmr/:id/submit', authorize(...PLANNER), async (req, res) => {
  try {
    const r = await query(`UPDATE sc_nmr SET status='submitted', updated_at=NOW() WHERE id=$1 AND company_id=$2 AND status='draft' RETURNING *`,
      [req.params.id, CID(req)]);
    if (!r.rows.length) return res.status(404).json({ error: 'NMR not found or not in draft state' });
    res.json({ data: r.rows[0] });
  } catch(e){ res.status(500).json({ error: e.message }); }
});

// Check NMR (Site Engineer)
router.patch('/nmr/:id/check', authorize(...PLANNER), async (req, res) => {
  try {
    const { remarks } = req.body;
    const r = await query(`UPDATE sc_nmr SET status='checked', checked_by=$1, checked_at=NOW(), check_remarks=$2, updated_at=NOW() WHERE id=$3 AND company_id=$4 AND status='submitted' RETURNING *`,
      [req.user.id, remarks||null, req.params.id, CID(req)]);
    if (!r.rows.length) return res.status(404).json({ error: 'NMR not found or not in submitted state' });
    res.json({ data: r.rows[0] });
  } catch(e){ res.status(500).json({ error: e.message }); }
});

// Approve NMR (QS/PM)
router.patch('/nmr/:id/approve', authorize(...ADMIN,'project_manager','qs_engineer'), async (req, res) => {
  try {
    const { remarks } = req.body;
    const r = await query(`UPDATE sc_nmr SET status='approved', approved_by=$1, approved_at=NOW(), approve_remarks=$2, updated_at=NOW() WHERE id=$3 AND company_id=$4 AND status IN ('submitted','checked') RETURNING *`,
      [req.user.id, remarks||null, req.params.id, CID(req)]);
    if (!r.rows.length) return res.status(404).json({ error: 'NMR not found or not ready for approval' });
    res.json({ data: r.rows[0] });
  } catch(e){ res.status(500).json({ error: e.message }); }
});

// Raise bill from approved NMR
router.post('/nmr/:id/raise-bill', authorize(...PLANNER), async (req, res) => {
  try {
    const nmr = await query(`SELECT n.*, wo.project_id, wo.gst_pct, wo.tds_pct, wo.retention_pct, wo.sc_id AS wo_sc_id FROM sc_nmr n JOIN sc_work_orders wo ON wo.id=n.wo_id WHERE n.id=$1 AND n.company_id=$2`,
      [req.params.id, CID(req)]);
    if (!nmr.rows.length) return res.status(404).json({ error: 'NMR not found' });
    const n = nmr.rows[0];
    if (n.status !== 'approved') return res.status(400).json({ error: 'NMR must be approved before raising a bill' });
    if (n.bill_id) return res.status(400).json({ error: 'Bill already raised from this NMR' });

    const gross   = parseFloat(n.total_wages);
    const gstPct  = parseFloat(n.gst_pct  || 18);
    const tdsPct  = parseFloat(n.tds_pct  || 2);
    const retPct  = parseFloat(n.retention_pct || 5);
    const gst  = gross * gstPct  / 100;
    const tds  = gross * tdsPct  / 100;
    const ret  = gross * retPct  / 100;
    const net  = gross + gst - tds - ret;
    const avgRate = n.total_mandays > 0 ? parseFloat((gross / n.total_mandays).toFixed(2)) : 0;

    const nmrBillResult = await withTransaction(async (client) => {
      const bill_number = await nextBillNumber(client, CID(req), n.project_id);
      const billR = await client.query(`INSERT INTO sc_bills
        (company_id,project_id,wo_id,sc_id,bill_number,bill_date,bill_type,
         period_from,period_to,description,gross_amount,
         gst_pct,gst_amount,tds_pct,tds_amount,retention_pct,retention_amount,
         advance_recovery,material_recovery,penalty_amount,other_deductions,net_payable,
         attachments,created_by)
        VALUES ($1,$2,$3,$4,$5,$6,'ra',$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,0,0,0,0,$17,'[]',$18)
        RETURNING *`,
        [CID(req), n.project_id, n.wo_id, n.sc_id, bill_number,
         new Date().toISOString().slice(0,10),
         n.period_from, n.period_to,
         `Labour charges as per NMR ${n.nmr_number} — ${n.total_workers} workers, ${n.total_mandays} man-days`,
         gross, gstPct, gst, tdsPct, tds, retPct, ret, net, req.user.id]);

      const billId = billR.rows[0].id;
      await client.query(`INSERT INTO sc_bill_items (bill_id,description,unit,wo_qty,prev_qty,curr_qty,balance_qty,rate,sequence_no) VALUES ($1,$2,'Mandays',0,0,$3,0,$4,1)`,
        [billId, `Labour Charges (NMR ${n.nmr_number})`, n.total_mandays, avgRate]);
      await client.query(`UPDATE sc_nmr SET status='billed', bill_id=$1, updated_at=NOW() WHERE id=$2`, [billId, req.params.id]);
      await client.query(`UPDATE sc_work_orders SET total_billed=total_billed+$1, retention_held=retention_held+$2, updated_at=NOW() WHERE id=$3`, [gross, ret, n.wo_id]);
      return billR.rows[0];
    });

    res.status(201).json({ data: { bill: nmrBillResult, nmr_number: n.nmr_number } });
  } catch(e){ res.status(500).json({ error: e.message }); }
});

// ════════════════════════════════════════════════════════════════════
// ESSL BIOMETRIC ATTENDANCE INTEGRATION
// ════════════════════════════════════════════════════════════════════

// Helper: load ESSL config from sc_settings
async function getEsslConfig(cid) {
  const r = await query(`SELECT * FROM sc_settings WHERE company_id=$1`, [cid]);
  if (!r.rows.length) throw new Error('ESSL not configured. Go to SC Settings and enter ESSL connection details.');
  const cfg = r.rows[0];
  if (!cfg.essl_enabled) throw new Error('ESSL integration is disabled. Enable it in SC Settings → ESSL tab.');
  if (!cfg.essl_host)    throw new Error('ESSL host not configured. Go to SC Settings → ESSL tab.');
  return cfg;
}

// POST /sc/essl/test — test connection to ESSL MySQL
router.post('/essl/test', authorize(...ADMIN), async (req, res) => {
  try {
    // Can use body config (for testing before save) or saved config
    const cfg = {
      essl_host:     req.body.essl_host     || (await getEsslConfig(CID(req)).catch(()=>null))?.essl_host,
      essl_port:     req.body.essl_port     || 3306,
      essl_database: req.body.essl_database || 'att2000',
      essl_user:     req.body.essl_user     || 'root',
      essl_password: req.body.essl_password || '',
    };
    if (!cfg.essl_host) return res.status(400).json({ error: 'essl_host required' });
    const result = await esslService.testConnection(cfg);
    res.json({ data: result });
  } catch(e){ res.status(500).json({ error: e.message }); }
});

// GET /sc/essl/employees — list all employees from ESSL server
router.get('/essl/employees', authorize(...ADMIN,...PLANNER), async (req, res) => {
  try {
    const cfg = await getEsslConfig(CID(req));
    const result = await esslService.listEsslEmployees(cfg);
    res.json({ data: result });
  } catch(e){ res.status(400).json({ error: e.message }); }
});

// POST /sc/essl/sync — pull attendance from ESSL and create sc_attendance records
router.post('/essl/sync', authorize(...ADMIN,...PLANNER), async (req, res) => {
  try {
    const { from_date, to_date, sc_id, project_id, overwrite } = req.body;
    if (!from_date) return res.status(400).json({ error: 'from_date required (YYYY-MM-DD)' });
    const toDate = to_date || from_date;

    const cfg = await getEsslConfig(CID(req));

    // Get SC workers with essl_emp_code mapped
    let workerSql = `SELECT w.id, w.worker_name, w.essl_emp_code, w.daily_rate, w.sc_id, w.project_id, w.wo_id
      FROM sc_workers w WHERE w.company_id=$1 AND w.status='active' AND w.essl_emp_code IS NOT NULL AND w.essl_emp_code != ''`;
    const params = [CID(req)];
    if (sc_id) { workerSql += ` AND w.sc_id=$2`; params.push(sc_id); }
    const workers = await query(workerSql, params);

    if (!workers.rows.length) {
      return res.status(400).json({ error: 'No workers with ESSL employee codes mapped. Set ESSL code in worker registration.' });
    }

    const empCodes = workers.rows.map(w => w.essl_emp_code);
    const empMap   = {};
    workers.rows.forEach(w => { empMap[String(w.essl_emp_code)] = w; });

    // Pull from ESSL
    const { records, schema } = await esslService.pullAttendance(cfg, from_date, toDate, empCodes);

    let created = 0, skipped = 0, updated = 0;
    const errors = [];
    const results = [];

    for (const rec of records) {
      const worker = empMap[String(rec.emp_code)];
      if (!worker) { skipped++; continue; }

      const attDate = rec.att_date instanceof Date
        ? rec.att_date.toISOString().slice(0,10)
        : String(rec.att_date).slice(0,10);

      // Determine status based on punch count and hours
      const hours = parseFloat(rec.hours_worked || 0);
      const punches = parseInt(rec.punch_count || 0);
      let status = 'present';
      if (hours > 0 && hours < 4.5) status = 'half_day';  // < 4.5 hrs = half day
      else if (hours === 0 && punches === 1) status = 'present';  // single punch = present

      const wageMultiplier = status === 'half_day' ? 0.5 : 1.0;
      const wage = parseFloat(worker.daily_rate || 0) * wageMultiplier;

      try {
        // Check if record already exists
        const existing = await query(
          `SELECT id FROM sc_attendance WHERE worker_id=$1 AND attendance_date=$2 AND company_id=$3`,
          [worker.id, attDate, CID(req)]);

        if (existing.rows.length && !overwrite) {
          skipped++;
          continue;
        }

        if (existing.rows.length && overwrite) {
          await query(`UPDATE sc_attendance SET status=$1, hours_worked=$2, wage_amount=$3,
            overtime_hours=0, remarks=$4, marked_by=$5, updated_at=NOW()
            WHERE id=$6`,
            [status, Math.min(hours||8, 24), wage,
             `ESSL sync: ${punches} punch(es), ${hours}h (schema: ${schema})`,
             req.user.id, existing.rows[0].id]);
          updated++;
        } else {
          await query(`INSERT INTO sc_attendance
            (company_id, project_id, sc_id, wo_id, worker_id, attendance_date,
             status, hours_worked, overtime_hours, wage_amount, remarks, marked_by)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,0,$9,$10,$11)`,
            [CID(req),
             worker.project_id || project_id || null,
             worker.sc_id,
             worker.wo_id || null,
             worker.id,
             attDate,
             status,
             Math.min(parseFloat(hours)||8, 24),
             wage,
             `ESSL sync: ${punches} punch(es) [${schema}]`,
             req.user.id]);
          created++;
        }
        results.push({ worker_name: worker.worker_name, emp_code: rec.emp_code, date: attDate, status, hours, wage });
      } catch(e) {
        errors.push({ emp_code: rec.emp_code, date: attDate, error: e.message });
      }
    }

    res.json({
      data: {
        schema,
        essl_records_found: records.length,
        workers_mapped:     workers.rows.length,
        created,
        updated,
        skipped,
        errors,
        results,
        date_range: `${from_date} → ${toDate}`,
      },
      message: `ESSL sync complete: ${created} new, ${updated} updated, ${skipped} skipped`,
    });
  } catch(e){ res.status(400).json({ error: e.message }); }
});

// GET /sc/essl/preview — show what WOULD be synced (dry run, no DB writes)
router.get('/essl/preview', authorize(...ADMIN,...PLANNER), async (req, res) => {
  try {
    const { from_date, to_date, sc_id } = req.query;
    if (!from_date) return res.status(400).json({ error: 'from_date required' });

    const cfg = await getEsslConfig(CID(req));

    let workerSql = `SELECT w.id, w.worker_name, w.essl_emp_code, w.daily_rate, w.sc_id
      FROM sc_workers w WHERE w.company_id=$1 AND w.status='active' AND w.essl_emp_code IS NOT NULL`;
    const params = [CID(req)];
    if (sc_id) { workerSql += ` AND w.sc_id=$2`; params.push(sc_id); }
    const workers = await query(workerSql, params);

    const empCodes = workers.rows.map(w => w.essl_emp_code);
    const empMap   = {};
    workers.rows.forEach(w => { empMap[String(w.essl_emp_code)] = w; });

    const { records, schema } = await esslService.pullAttendance(cfg, from_date, to_date||from_date, empCodes);

    const preview = records.map(rec => {
      const worker = empMap[String(rec.emp_code)];
      const hours  = parseFloat(rec.hours_worked || 0);
      const status = hours > 0 && hours < 4.5 ? 'half_day' : 'present';
      return {
        emp_code:    rec.emp_code,
        worker_name: worker?.worker_name || 'NOT MAPPED',
        date:        String(rec.att_date).slice(0,10),
        first_punch: rec.first_punch,
        last_punch:  rec.last_punch,
        punch_count: rec.punch_count,
        hours_worked:hours,
        status,
        wage:        parseFloat(worker?.daily_rate||0) * (status==='half_day'?0.5:1.0),
        mapped:      !!worker,
      };
    });

    res.json({ data: { schema, preview, total: preview.length, mapped: preview.filter(p=>p.mapped).length } });
  } catch(e){ res.status(400).json({ error: e.message }); }
});

// ════════════════════════════════════════════════════════════════════
// 16. P5 — TDS 26Q REGISTER
// ════════════════════════════════════════════════════════════════════
router.get('/reports/tds-26q', async (req, res) => {
  try {
    const { project_id, sc_id, from_date, to_date } = req.query;
    let sql = `
      SELECT
        sc.sc_code,
        sc.name                          AS sc_name,
        COALESCE(sc.pan_number, '—')     AS pan_number,
        b.bill_number,
        b.bill_date,
        wo.wo_number,
        p.name                           AS project_name,
        b.gross_amount,
        b.tds_pct,
        b.tds_amount,
        COALESCE(SUM(pay.amount), 0)     AS amount_paid,
        MAX(pay.payment_date)            AS last_payment_date,
        CASE
          WHEN EXTRACT(MONTH FROM b.bill_date) BETWEEN 4 AND 6   THEN 'Q1 (Apr–Jun)'
          WHEN EXTRACT(MONTH FROM b.bill_date) BETWEEN 7 AND 9   THEN 'Q2 (Jul–Sep)'
          WHEN EXTRACT(MONTH FROM b.bill_date) BETWEEN 10 AND 12 THEN 'Q3 (Oct–Dec)'
          ELSE                                                         'Q4 (Jan–Mar)'
        END AS quarter,
        CASE
          WHEN EXTRACT(MONTH FROM b.bill_date) >= 4
               THEN EXTRACT(YEAR FROM b.bill_date)::int
          ELSE (EXTRACT(YEAR FROM b.bill_date) - 1)::int
        END AS fy_start
      FROM sc_bills b
      JOIN sc_work_orders wo    ON wo.id  = b.wo_id
      JOIN sc_subcontractors sc ON sc.id  = b.sc_id
      JOIN projects p           ON p.id   = b.project_id
      LEFT JOIN sc_payments pay ON pay.bill_id = b.id
      WHERE b.company_id = $1
        AND COALESCE(b.tds_amount, 0) > 0
        AND b.status NOT IN ('draft','rejected')`;
    const params = [CID(req)]; let i = 2;
    if (project_id){ sql += ` AND b.project_id = $${i++}`; params.push(project_id); }
    if (sc_id)     { sql += ` AND b.sc_id = $${i++}`;      params.push(sc_id); }
    if (from_date) { sql += ` AND b.bill_date >= $${i++}`;  params.push(from_date); }
    if (to_date)   { sql += ` AND b.bill_date <= $${i++}`;  params.push(to_date); }
    sql += `
      GROUP BY sc.sc_code, sc.name, sc.pan_number, b.bill_number, b.bill_date,
               wo.wo_number, p.name, b.gross_amount, b.tds_pct, b.tds_amount
      ORDER BY fy_start DESC, b.bill_date, sc.name`;
    res.json({ data: (await query(sql, params)).rows });
  } catch(e){ res.status(500).json({ error: e.message }); }
});

// ════════════════════════════════════════════════════════════════════
// 17. P5 — WO FINAL ACCOUNT (read-only financial summary per WO)
// ════════════════════════════════════════════════════════════════════
router.get('/work-orders/:id/final-account', async (req, res) => {
  try {
    const woId = req.params.id;
    const [woR, billsR, advancesR, retRelR] = await Promise.all([
      query(`
        SELECT wo.*, sc.name AS sc_name, sc.sc_code, sc.pan_number, sc.gst_number,
               p.name AS project_name
          FROM sc_work_orders wo
          JOIN sc_subcontractors sc ON sc.id = wo.sc_id
          JOIN projects p           ON p.id  = wo.project_id
         WHERE wo.id = $1 AND wo.company_id = $2`, [woId, CID(req)]),
      query(`
        SELECT b.bill_number, b.bill_date, b.bill_type, b.status,
               b.gross_amount, b.gst_amount, b.tds_amount, b.retention_amount,
               b.advance_recovery, b.material_recovery, b.penalty_amount, b.other_deductions,
               COALESCE(b.labour_cess_amount, 0)       AS labour_cess_amount,
               COALESCE(b.retention_release_amount, 0) AS retention_release_amount,
               COALESCE(b.credit_note_amount, 0)       AS credit_note_amount,
               b.net_payable, b.paid_amount
          FROM sc_bills b
         WHERE b.wo_id = $1 AND b.company_id = $2
           AND b.status NOT IN ('draft','rejected')
         ORDER BY b.bill_date`, [woId, CID(req)]),
      query(`SELECT COALESCE(SUM(amount), 0) AS total_advanced
               FROM sc_advances
              WHERE wo_id = $1 AND company_id = $2`, [woId, CID(req)]),
      query(`SELECT COALESCE(SUM(release_amount), 0) AS total_released
               FROM sc_retention_releases
              WHERE wo_id = $1 AND company_id = $2 AND status = 'released'`, [woId, CID(req)]),
    ]);

    if (!woR.rows.length) return res.status(404).json({ error: 'Work order not found' });
    const wo    = woR.rows[0];
    const bills = billsR.rows;

    const summary = bills.reduce((s, b) => ({
      total_gross:       s.total_gross       + parseFloat(b.gross_amount||0),
      total_gst:         s.total_gst         + parseFloat(b.gst_amount||0),
      total_tds:         s.total_tds         + parseFloat(b.tds_amount||0),
      total_retention:   s.total_retention   + parseFloat(b.retention_amount||0),
      total_adv_rec:     s.total_adv_rec     + parseFloat(b.advance_recovery||0),
      total_mat_rec:     s.total_mat_rec     + parseFloat(b.material_recovery||0),
      total_penalty:     s.total_penalty     + parseFloat(b.penalty_amount||0),
      total_other:       s.total_other       + parseFloat(b.other_deductions||0),
      total_labour_cess: s.total_labour_cess + parseFloat(b.labour_cess_amount||0),
      total_net:         s.total_net         + parseFloat(b.net_payable||0),
      total_paid:        s.total_paid        + parseFloat(b.paid_amount||0),
    }), {
      total_gross:0, total_gst:0, total_tds:0, total_retention:0,
      total_adv_rec:0, total_mat_rec:0, total_penalty:0, total_other:0,
      total_labour_cess:0, total_net:0, total_paid:0,
    });

    const total_advanced     = parseFloat(advancesR.rows[0].total_advanced||0);
    const total_ret_released = parseFloat(retRelR.rows[0].total_released||0);

    res.json({ data: {
      wo,
      bills,
      summary: {
        ...summary,
        total_advanced,
        total_ret_released,
        net_balance:       summary.total_net - summary.total_paid,
        retention_balance: summary.total_retention - total_ret_released,
        advance_balance:   total_advanced - summary.total_adv_rec,
        utilisation_pct:   parseFloat(wo.contract_amount||0) > 0
          ? Math.round(summary.total_gross / parseFloat(wo.contract_amount) * 100)
          : 0,
      },
    }});
  } catch(e){ res.status(500).json({ error: e.message }); }
});

// ════════════════════════════════════════════════════════════════════
// 18. P5 — WO CLOSURE
// ════════════════════════════════════════════════════════════════════
router.patch('/work-orders/:id/close', authorize(...ADMIN, 'project_manager', 'qs_engineer'), async (req, res) => {
  try {
    const { remarks } = req.body;
    const woId = req.params.id;

    // Guard: no bills still pending approval
    const pending = await query(
      `SELECT COUNT(*) FROM sc_bills
        WHERE wo_id = $1 AND company_id = $2
          AND status IN ('draft','submitted','under_review','queried')`,
      [woId, CID(req)]);
    if (parseInt(pending.rows[0].count) > 0)
      return res.status(400).json({
        error: `Cannot close: ${pending.rows[0].count} bill(s) still pending approval`,
      });

    const r = await query(
      `UPDATE sc_work_orders
          SET status          = 'completed',
              closure_remarks = $1,
              closed_by       = $2,
              closed_at       = NOW(),
              updated_at      = NOW()
        WHERE id = $3 AND company_id = $4
          AND status IN ('active','approved')
        RETURNING *`,
      [remarks||null, req.user.id, woId, CID(req)]);

    if (!r.rows.length)
      return res.status(404).json({ error: 'Work order not found or not in a closeable state (active/approved)' });

    res.json({ data: r.rows[0] });
  } catch(e){ res.status(500).json({ error: e.message }); }
});

// ════════════════════════════════════════════════════════════════════
// 19. P5 — COP (COST OF PRODUCTION) REPORT
// ════════════════════════════════════════════════════════════════════
router.get('/reports/cop', async (req, res) => {
  try {
    const { project_id, sc_id } = req.query;
    let sql = `
      SELECT
        wo.wo_number, wo.subject, wo.work_category,
        wo.contract_amount, wo.status AS wo_status,
        sc.name AS sc_name, sc.sc_code, sc.trade_type,
        p.name  AS project_name,
        COALESCE(billed.total_gross, 0) AS sc_gross_billed,
        COALESCE(billed.total_net,   0) AS sc_net_certified,
        COALESCE(billed.total_tds,   0) AS sc_total_tds,
        COALESCE(billed.total_ret,   0) AS sc_total_retention,
        COALESCE(paid.total_paid,    0) AS sc_total_paid,
        wo.contract_amount - COALESCE(billed.total_gross, 0) AS sc_balance,
        CASE WHEN wo.contract_amount > 0
          THEN ROUND(COALESCE(billed.total_gross, 0)::numeric / wo.contract_amount * 100, 1)
          ELSE 0
        END AS utilisation_pct
      FROM sc_work_orders wo
      JOIN sc_subcontractors sc ON sc.id = wo.sc_id
      JOIN projects p           ON p.id  = wo.project_id
      LEFT JOIN (
        SELECT wo_id,
               SUM(gross_amount)     AS total_gross,
               SUM(net_payable)      AS total_net,
               SUM(tds_amount)       AS total_tds,
               SUM(retention_amount) AS total_ret
          FROM sc_bills
         WHERE company_id = $1 AND status NOT IN ('draft','rejected')
         GROUP BY wo_id
      ) billed ON billed.wo_id = wo.id
      LEFT JOIN (
        SELECT b.wo_id, SUM(pay.amount) AS total_paid
          FROM sc_payments pay
          JOIN sc_bills b ON b.id = pay.bill_id
         WHERE pay.company_id = $1
         GROUP BY b.wo_id
      ) paid ON paid.wo_id = wo.id
      WHERE wo.company_id = $1`;
    const params = [CID(req)]; let i = 2;
    if (project_id){ sql += ` AND wo.project_id = $${i++}`; params.push(project_id); }
    if (sc_id)     { sql += ` AND wo.sc_id = $${i++}`;      params.push(sc_id); }
    sql += ` ORDER BY p.name, wo.wo_number`;
    res.json({ data: (await query(sql, params)).rows });
  } catch(e){ res.status(500).json({ error: e.message }); }
});

module.exports = router;
