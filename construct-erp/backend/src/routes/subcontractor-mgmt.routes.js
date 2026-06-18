// subcontractor-mgmt.routes.js — Enhanced Subcontractor Management
const express = require('express');
const router  = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const db = () => require('../config/database').pool;

router.use(authenticate);
const CID    = req => req.user.company_id;
const SC_ROLES = ['super_admin','admin','project_manager','contracts_manager','quantity_surveyor','billing_engineer'];

// ══════════════════════════════════════════════════════════════════
// PREQUALIFICATION
// ══════════════════════════════════════════════════════════════════
router.get('/prequalification', async (req, res) => {
  try {
    const { vendor_id, status } = req.query;
    let sql = `
      SELECT pq.*, v.name AS vendor_name, v.prequalification_status,
             u.name AS evaluator_name
      FROM subcontractor_prequalification pq
      JOIN vendors v ON v.id=pq.vendor_id
      LEFT JOIN users u ON u.id=pq.evaluator_id
      WHERE v.company_id=$1`;
    const params = [CID(req)]; let i = 2;
    if (vendor_id) { sql += ` AND pq.vendor_id=$${i++}`; params.push(vendor_id); }
    if (status)    { sql += ` AND pq.status=$${i++}`;    params.push(status); }
    sql += ' ORDER BY pq.evaluation_date DESC';
    res.json({ data: (await db().query(sql, params)).rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/prequalification', authorize(...SC_ROLES), async (req, res) => {
  try {
    const { vendor_id, project_id, evaluation_date, technical_score, financial_score,
            experience_score, safety_score, quality_score, valid_until, remarks } = req.body;
    if (!vendor_id) return res.status(400).json({ error: 'vendor_id required' });

    // Weighted overall score
    const overall = (
      parseFloat(technical_score||0) * 0.30 +
      parseFloat(financial_score||0) * 0.20 +
      parseFloat(experience_score||0) * 0.25 +
      parseFloat(safety_score||0) * 0.15 +
      parseFloat(quality_score||0) * 0.10
    );
    const grade = overall >= 85 ? 'A+' : overall >= 75 ? 'A' : overall >= 65 ? 'B' : overall >= 50 ? 'C' : 'D';
    const status = overall >= 65 ? 'approved' : overall >= 50 ? 'conditional' : 'rejected';

    const r = await db().query(`
      INSERT INTO subcontractor_prequalification
        (vendor_id,project_id,evaluation_date,evaluator_id,
         technical_score,financial_score,experience_score,safety_score,quality_score,
         overall_score,grade,status,valid_until,remarks)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
      [vendor_id, project_id||null, evaluation_date||new Date().toISOString().slice(0,10), req.user.id,
       technical_score||0, financial_score||0, experience_score||0, safety_score||0, quality_score||0,
       overall.toFixed(2), grade, status, valid_until||null, remarks||null]);

    // Update vendor overall status
    await db().query(`UPDATE vendors SET prequalification_status=$1, overall_rating=$2, last_evaluation_date=CURRENT_DATE WHERE id=$3`,
      [status, (overall/10).toFixed(1), vendor_id]);

    res.status(201).json({ data: r.rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ══════════════════════════════════════════════════════════════════
// CONTRACTS
// ══════════════════════════════════════════════════════════════════
router.get('/contracts', async (req, res) => {
  try {
    const { project_id, vendor_id, status } = req.query;
    let sql = `
      SELECT c.*, v.name AS vendor_name, p.name AS project_name,
        (SELECT COALESCE(SUM(b.bill_amount),0) FROM subcontractor_bills b JOIN work_orders wo ON wo.id=b.wo_id WHERE wo.project_id=c.project_id AND b.status!='rejected') AS billed_amount,
        (SELECT COALESCE(SUM(b.net_payable),0) FROM subcontractor_bills b JOIN work_orders wo ON wo.id=b.wo_id WHERE wo.project_id=c.project_id AND b.payment_date IS NOT NULL) AS paid_amount
      FROM subcontractor_contracts c
      JOIN vendors v ON v.id=c.vendor_id
      JOIN projects p ON p.id=c.project_id
      WHERE p.company_id=$1`;
    const params = [CID(req)]; let i=2;
    if (project_id) { sql += ` AND c.project_id=$${i++}`; params.push(project_id); }
    if (vendor_id)  { sql += ` AND c.vendor_id=$${i++}`;  params.push(vendor_id); }
    if (status)     { sql += ` AND c.status=$${i++}`;     params.push(status); }
    sql += ' ORDER BY c.created_at DESC';
    res.json({ data: (await db().query(sql, params)).rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/contracts', authorize(...SC_ROLES), async (req, res) => {
  try {
    const {
      project_id, vendor_id, contract_name, scope_of_work, contract_value,
      start_date, end_date, retention_pct, security_deposit_pct, security_deposit_amount,
      mobilization_advance_pct, mobilization_advance_amount, advance_recovery_pct,
      defect_liability_months, escalation_clause, notes
    } = req.body;
    if (!project_id || !vendor_id) return res.status(400).json({ error: 'project_id, vendor_id required' });
    // Auto-generate contract number
    const cnt = (await db().query(`SELECT COALESCE(MAX(CAST(REGEXP_REPLACE(contract_number, '^.*-', '') AS INTEGER)), 0) AS last_seq
                                   FROM subcontractor_contracts WHERE project_id=$1 AND contract_number ~ '[0-9]+$'`, [project_id])).rows[0].last_seq;
    const proj = (await db().query(`SELECT name FROM projects WHERE id=$1`, [project_id])).rows[0];
    const contract_number = `SC-${(proj?.name||'').substring(0,4).toUpperCase().replace(/\s/g,'')}-${String(parseInt(cnt)+1).padStart(3,'0')}`;
    const r = await db().query(`
      INSERT INTO subcontractor_contracts
        (project_id,vendor_id,contract_number,contract_name,scope_of_work,contract_value,
         start_date,end_date,retention_pct,security_deposit_pct,security_deposit_amount,
         mobilization_advance_pct,mobilization_advance_amount,advance_recovery_pct,
         defect_liability_months,escalation_clause,notes,created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) RETURNING *`,
      [project_id, vendor_id, contract_number, contract_name||null, scope_of_work||null,
       contract_value||0, start_date||null, end_date||null,
       retention_pct||5, security_deposit_pct||5, security_deposit_amount||0,
       mobilization_advance_pct||0, mobilization_advance_amount||0, advance_recovery_pct||0,
       defect_liability_months||12, escalation_clause||null, notes||null, req.user.id]);
    res.status(201).json({ data: r.rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/contracts/:id', authorize(...SC_ROLES), async (req, res) => {
  try {
    const { contract_value, start_date, end_date, actual_end_date, retention_pct,
            defect_liability_months, status, termination_reason, notes, signed_date } = req.body;
    const r = await db().query(`
      UPDATE subcontractor_contracts SET
        contract_value=COALESCE($1,contract_value), start_date=COALESCE($2,start_date),
        end_date=COALESCE($3,end_date), actual_end_date=COALESCE($4,actual_end_date),
        retention_pct=COALESCE($5,retention_pct), defect_liability_months=COALESCE($6,defect_liability_months),
        status=COALESCE($7,status), termination_reason=$8, notes=COALESCE($9,notes),
        signed_date=COALESCE($10,signed_date), updated_at=NOW()
      WHERE id=$11 RETURNING *`,
      [contract_value, start_date, end_date, actual_end_date, retention_pct,
       defect_liability_months, status, termination_reason||null, notes, signed_date, req.params.id]);
    if (!r.rows.length) return res.status(404).json({ error: 'Contract not found' });
    res.json({ data: r.rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ══════════════════════════════════════════════════════════════════
// MEASUREMENT BOOK (MB)
// ══════════════════════════════════════════════════════════════════
router.get('/mb', async (req, res) => {
  try {
    const { project_id, vendor_id, status } = req.query;
    let sql = `
      SELECT mb.*, v.name AS vendor_name, p.name AS project_name,
             wo.wo_number
      FROM subcontractor_mb mb
      JOIN vendors v  ON v.id  = mb.vendor_id
      JOIN projects p ON p.id  = mb.project_id
      LEFT JOIN work_orders wo ON wo.id = mb.wo_id
      WHERE p.company_id=$1`;
    const params=[CID(req)]; let i=2;
    if (project_id) { sql += ` AND mb.project_id=$${i++}`; params.push(project_id); }
    if (vendor_id)  { sql += ` AND mb.vendor_id=$${i++}`;  params.push(vendor_id); }
    if (status)     { sql += ` AND mb.status=$${i++}`;     params.push(status); }
    sql += ' ORDER BY mb.mb_date DESC';
    res.json({ data: (await db().query(sql, params)).rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/mb', authorize(...SC_ROLES), async (req, res) => {
  try {
    const { project_id, vendor_id, wo_id, contract_id, mb_date, period_start, period_end,
            location, description, items } = req.body;
    if (!project_id || !vendor_id) return res.status(400).json({ error: 'project_id, vendor_id required' });
    const cnt = (await db().query(`SELECT COALESCE(MAX(CAST(REGEXP_REPLACE(mb_number, '^.*-', '') AS INTEGER)), 0) AS last_seq
                                   FROM subcontractor_mb WHERE project_id=$1 AND mb_number ~ '[0-9]+$'`, [project_id])).rows[0].last_seq;
    const mb_number = `MB-${String(parseInt(cnt)+1).padStart(4,'0')}`;
    const totalAmount = Array.isArray(items) ? items.reduce((s,it) => s + (parseFloat(it.this_qty||0) * parseFloat(it.rate||0)), 0) : 0;
    const r = await db().query(`
      INSERT INTO subcontractor_mb (project_id,vendor_id,wo_id,contract_id,mb_number,mb_date,
        period_start,period_end,location,description,total_amount,created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [project_id, vendor_id, wo_id||null, contract_id||null, mb_number,
       mb_date||new Date().toISOString().slice(0,10), period_start||null, period_end||null,
       location||null, description||null, totalAmount, req.user.id]);

    // Insert line items
    if (Array.isArray(items) && items.length) {
      for (const it of items) {
        await db().query(`
          INSERT INTO subcontractor_mb_items (mb_id,item_no,description,unit,boq_qty,prev_qty,this_qty,rate,remarks)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [r.rows[0].id, it.item_no||null, it.description, it.unit||null,
           it.boq_qty||0, it.prev_qty||0, it.this_qty||0, it.rate||0, it.remarks||null]);
      }
    }
    res.status(201).json({ data: r.rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.patch('/mb/:id/certify', authorize(...SC_ROLES), async (req, res) => {
  try {
    const { stage, comments } = req.body; // stage: site|engineer|pm
    const colMap = {
      site:     { by: 'site_certified_by',     at: 'site_certified_at',     status: 'under_review' },
      engineer: { by: 'engineer_approved_by',   at: 'engineer_approved_at',  status: 'certified'    },
      pm:       { by: 'pm_approved_by',          at: 'pm_approved_at',        status: 'approved'     },
    };
    const col = colMap[stage];
    if (!col) return res.status(400).json({ error: 'stage must be site|engineer|pm' });
    const r = await db().query(`
      UPDATE subcontractor_mb SET ${col.by}=$1, ${col.at}=NOW(), status=$2, remarks=COALESCE($3,remarks), updated_at=NOW()
      WHERE id=$4 RETURNING *`, [req.user.id, col.status, comments||null, req.params.id]);
    res.json({ data: r.rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ══════════════════════════════════════════════════════════════════
// PERFORMANCE EVALUATION
// ══════════════════════════════════════════════════════════════════
router.get('/performance', async (req, res) => {
  try {
    const { project_id, vendor_id } = req.query;
    let sql = `
      SELECT sp.*, v.name AS vendor_name, p.name AS project_name, u.name AS evaluated_by_name
      FROM subcontractor_performance sp
      JOIN vendors v  ON v.id  = sp.vendor_id
      JOIN projects p ON p.id  = sp.project_id
      LEFT JOIN users u ON u.id = sp.evaluated_by
      WHERE p.company_id=$1`;
    const params=[CID(req)]; let i=2;
    if (project_id) { sql += ` AND sp.project_id=$${i++}`; params.push(project_id); }
    if (vendor_id)  { sql += ` AND sp.vendor_id=$${i++}`;  params.push(vendor_id); }
    sql += ' ORDER BY sp.evaluation_date DESC';
    res.json({ data: (await db().query(sql, params)).rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/performance', authorize(...SC_ROLES), async (req, res) => {
  try {
    const { project_id, vendor_id, evaluation_period, quality_score, safety_score,
            schedule_score, productivity_score, cooperation_score,
            quality_remarks, safety_remarks, schedule_remarks,
            delay_days, incidents_count, quality_issues_count, recommendation } = req.body;
    const overall = (
      parseFloat(quality_score||0) * 0.30 + parseFloat(safety_score||0) * 0.25 +
      parseFloat(schedule_score||0) * 0.25 + parseFloat(productivity_score||0) * 0.15 +
      parseFloat(cooperation_score||0) * 0.05
    );
    const grade = overall >= 8.5 ? 'A+' : overall >= 7.5 ? 'A' : overall >= 6.5 ? 'B' : overall >= 5 ? 'C' : 'D';
    const r = await db().query(`
      INSERT INTO subcontractor_performance
        (project_id,vendor_id,evaluation_period,quality_score,safety_score,schedule_score,
         productivity_score,cooperation_score,overall_score,grade,quality_remarks,safety_remarks,
         schedule_remarks,delay_days,incidents_count,quality_issues_count,recommendation,evaluated_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) RETURNING *`,
      [project_id, vendor_id, evaluation_period||null,
       quality_score||0, safety_score||0, schedule_score||0, productivity_score||0, cooperation_score||0,
       overall.toFixed(1), grade, quality_remarks||null, safety_remarks||null, schedule_remarks||null,
       delay_days||0, incidents_count||0, quality_issues_count||0, recommendation||'continue', req.user.id]);
    // Update vendor rating
    await db().query(`UPDATE vendors SET overall_rating=$1, last_evaluation_date=CURRENT_DATE WHERE id=$2`,
      [(overall).toFixed(1), vendor_id]);
    res.status(201).json({ data: r.rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ══════════════════════════════════════════════════════════════════
// MATERIAL ISSUES
// ══════════════════════════════════════════════════════════════════
router.get('/material-issues', async (req, res) => {
  try {
    const { project_id, vendor_id } = req.query;
    let sql = `
      SELECT mi.*, v.name AS vendor_name, p.name AS project_name, u.name AS issued_by_name
      FROM subcontractor_material_issues mi
      JOIN vendors v ON v.id=mi.vendor_id
      JOIN projects p ON p.id=mi.project_id
      LEFT JOIN users u ON u.id=mi.issued_by
      WHERE p.company_id=$1`;
    const params=[CID(req)]; let i=2;
    if (project_id) { sql += ` AND mi.project_id=$${i++}`; params.push(project_id); }
    if (vendor_id)  { sql += ` AND mi.vendor_id=$${i++}`;  params.push(vendor_id); }
    sql += ' ORDER BY mi.issue_date DESC';
    res.json({ data: (await db().query(sql, params)).rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/material-issues', authorize(...SC_ROLES), async (req, res) => {
  try {
    const { project_id, vendor_id, wo_id, material_name, material_code, unit,
            issued_qty, unit_rate, issue_date, remarks } = req.body;
    const r = await db().query(`
      INSERT INTO subcontractor_material_issues
        (project_id,vendor_id,wo_id,material_name,material_code,unit,issued_qty,unit_rate,issue_date,remarks,issued_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [project_id, vendor_id, wo_id||null, material_name, material_code||null, unit||'nos',
       issued_qty||0, unit_rate||0, issue_date||new Date().toISOString().slice(0,10), remarks||null, req.user.id]);
    res.status(201).json({ data: r.rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.patch('/material-issues/:id', authorize(...SC_ROLES), async (req, res) => {
  try {
    const { returned_qty, consumed_qty, recovered } = req.body;
    const r = await db().query(`
      UPDATE subcontractor_material_issues SET
        returned_qty=COALESCE($1,returned_qty), consumed_qty=COALESCE($2,consumed_qty),
        recovered=COALESCE($3,recovered) WHERE id=$4 RETURNING *`,
      [returned_qty, consumed_qty, recovered, req.params.id]);
    res.json({ data: r.rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ══════════════════════════════════════════════════════════════════
// CLAIMS & VARIATIONS
// ══════════════════════════════════════════════════════════════════
router.get('/claims', async (req, res) => {
  try {
    const { project_id, vendor_id, status } = req.query;
    let sql = `
      SELECT c.*, v.name AS vendor_name, p.name AS project_name,
             u.name AS reviewed_by_name
      FROM subcontractor_claims c
      JOIN vendors v ON v.id=c.vendor_id
      JOIN projects p ON p.id=c.project_id
      LEFT JOIN users u ON u.id=c.reviewed_by
      WHERE p.company_id=$1`;
    const params=[CID(req)]; let i=2;
    if (project_id) { sql += ` AND c.project_id=$${i++}`; params.push(project_id); }
    if (vendor_id)  { sql += ` AND c.vendor_id=$${i++}`;  params.push(vendor_id); }
    if (status)     { sql += ` AND c.status=$${i++}`;     params.push(status); }
    sql += ' ORDER BY c.claim_date DESC';
    res.json({ data: (await db().query(sql, params)).rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/claims', authorize(...SC_ROLES), async (req, res) => {
  try {
    const { project_id, vendor_id, wo_id, contract_id, claim_type, claim_date,
            description, claim_amount, justification, file_url } = req.body;
    if (!project_id || !vendor_id || !description) return res.status(400).json({ error: 'Required fields missing' });
    const cnt = (await db().query(`SELECT COALESCE(MAX(CAST(REGEXP_REPLACE(claim_number, '^.*-', '') AS INTEGER)), 0) AS last_seq
                                   FROM subcontractor_claims WHERE project_id=$1 AND claim_number ~ '[0-9]+$'`, [project_id])).rows[0].last_seq;
    const claim_number = `CLM-${String(parseInt(cnt)+1).padStart(4,'0')}`;
    const r = await db().query(`
      INSERT INTO subcontractor_claims
        (project_id,vendor_id,wo_id,contract_id,claim_number,claim_type,claim_date,
         description,claim_amount,justification,file_url,created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [project_id, vendor_id, wo_id||null, contract_id||null, claim_number,
       claim_type||'extra_work', claim_date||new Date().toISOString().slice(0,10),
       description, claim_amount||0, justification||null, file_url||null, req.user.id]);
    res.status(201).json({ data: r.rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.patch('/claims/:id/review', authorize(...SC_ROLES), async (req, res) => {
  try {
    const { status, approved_amount, review_comments } = req.body;
    const r = await db().query(`
      UPDATE subcontractor_claims SET status=$1, approved_amount=COALESCE($2,approved_amount),
        review_comments=$3, reviewed_by=$4, reviewed_at=NOW(), updated_at=NOW()
      WHERE id=$5 RETURNING *`,
      [status, approved_amount||null, review_comments||null, req.user.id, req.params.id]);
    res.json({ data: r.rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ══════════════════════════════════════════════════════════════════
// RETENTION
// ══════════════════════════════════════════════════════════════════
router.get('/retention', async (req, res) => {
  try {
    const { project_id, vendor_id } = req.query;
    let sql = `
      SELECT r.*, v.name AS vendor_name, p.name AS project_name
      FROM subcontractor_retention r
      JOIN vendors v ON v.id=r.vendor_id
      JOIN projects p ON p.id=r.project_id
      WHERE p.company_id=$1`;
    const params=[CID(req)]; let i=2;
    if (project_id) { sql += ` AND r.project_id=$${i++}`; params.push(project_id); }
    if (vendor_id)  { sql += ` AND r.vendor_id=$${i++}`;  params.push(vendor_id); }
    const { rows } = await db().query(sql + ' ORDER BY r.created_at DESC', params);
    // Summary
    const summary = rows.reduce((s, r) => ({
      total_deducted: s.total_deducted + parseFloat(r.amount_deducted||0),
      total_released: s.total_released + parseFloat(r.amount_released||0),
    }), { total_deducted: 0, total_released: 0 });
    summary.balance = summary.total_deducted - summary.total_released;
    res.json({ data: rows, summary });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/retention/release', authorize(...SC_ROLES), async (req, res) => {
  try {
    const { project_id, vendor_id, amount_released, release_date, release_conditions, contract_id } = req.body;
    const r = await db().query(`
      INSERT INTO subcontractor_retention (project_id,vendor_id,contract_id,retention_type,amount_released,release_date,release_conditions,status)
      VALUES ($1,$2,$3,'performance',$4,$5,$6,'fully_released') RETURNING *`,
      [project_id, vendor_id, contract_id||null, amount_released||0,
       release_date||new Date().toISOString().slice(0,10), release_conditions||null]);
    res.status(201).json({ data: r.rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ══════════════════════════════════════════════════════════════════
// ENHANCED DASHBOARD
// ══════════════════════════════════════════════════════════════════
router.get('/dashboard', async (req, res) => {
  try {
    const { project_id } = req.query;
    const cid = CID(req);
    let clause = ''; const params = [cid]; let i = 2;
    if (project_id) { clause = ` AND p.id=$${i++}`; params.push(project_id); }

    const [contracts, bills, claims, mb, performance, retention] = await Promise.all([
      db().query(`
        SELECT COUNT(*) AS total,
          COUNT(*) FILTER (WHERE c.status='active') AS active,
          SUM(c.contract_value) AS total_value
        FROM subcontractor_contracts c JOIN projects p ON p.id=c.project_id
        WHERE p.company_id=$1 ${clause}`, params),
      db().query(`
        SELECT COUNT(*) FILTER (WHERE b.status='pending') AS pending,
          SUM(b.bill_amount) FILTER (WHERE b.status IN ('approved','paid')) AS approved_amount,
          SUM(b.net_payable) FILTER (WHERE b.payment_date IS NULL AND b.status='approved') AS outstanding
        FROM subcontractor_bills b
        JOIN work_orders wo ON wo.id=b.wo_id
        JOIN projects p ON p.id=wo.project_id
        WHERE p.company_id=$1 ${clause}`, params),
      db().query(`
        SELECT COUNT(*) FILTER (WHERE sc.status='submitted') AS pending,
          SUM(sc.claim_amount) FILTER (WHERE sc.status IN ('approved','partially_approved')) AS approved_value
        FROM subcontractor_claims sc
        JOIN projects p ON p.id=sc.project_id
        WHERE p.company_id=$1 ${clause}`, params),
      db().query(`
        SELECT COUNT(*) FILTER (WHERE mb.status='draft') AS draft,
          COUNT(*) FILTER (WHERE mb.status='under_review') AS under_review
        FROM subcontractor_mb mb
        JOIN projects p ON p.id=mb.project_id
        WHERE p.company_id=$1 ${clause}`, params),
      db().query(`
        SELECT ROUND(AVG(sp.overall_score),1) AS avg_score,
          COUNT(*) FILTER (WHERE sp.recommendation='warning') AS warning_vendors,
          COUNT(*) FILTER (WHERE sp.recommendation='terminate') AS terminate_vendors
        FROM subcontractor_performance sp
        JOIN projects p ON p.id=sp.project_id
        WHERE p.company_id=$1 ${clause}`, params),
      db().query(`
        SELECT SUM(r.amount_deducted) - SUM(r.amount_released) AS held_retention
        FROM subcontractor_retention r
        JOIN projects p ON p.id=r.project_id
        WHERE p.company_id=$1 ${clause}`, params),
    ]);

    res.json({ data: {
      contracts:  contracts.rows[0],
      bills:      bills.rows[0],
      claims:     claims.rows[0],
      mb:         mb.rows[0],
      performance: performance.rows[0],
      retention_held: retention.rows[0]?.held_retention || 0,
    }});
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
