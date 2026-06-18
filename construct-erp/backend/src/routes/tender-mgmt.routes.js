// tender-mgmt.routes.js — Enhanced Tender Management Module
const express = require('express');
const router  = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const db = () => require('../config/database').pool;

router.use(authenticate);
const CID    = req => req.user.company_id;
const ADMINS = ['super_admin','admin'];
const TENDER_ROLES = ['super_admin','admin','project_manager','business_development','managing_director','planning_engineer'];

// ══════════════════════════════════════════════════════════════════
// TENDER CRUD (enhanced)
// ══════════════════════════════════════════════════════════════════
router.get('/', async (req, res) => {
  try {
    const { status, category, source, assigned_to } = req.query;
    let sql = `
      SELECT t.*, u.name AS assigned_to_name, u2.name AS created_by_name,
        (SELECT COUNT(*) FROM tender_emd e WHERE e.tender_id=t.id AND e.status='active') AS active_emd_count,
        (SELECT COUNT(*) FROM tender_documents td WHERE td.tender_id=t.id) AS doc_count,
        (SELECT bid_price FROM tender_bid_costing c WHERE c.tender_id=t.id AND c.is_final=true LIMIT 1) AS final_bid_price
      FROM tenders t
      LEFT JOIN users u  ON u.id  = t.assigned_to
      LEFT JOIN users u2 ON u2.id = t.created_by
      WHERE t.company_id=$1`;
    const params = [CID(req)]; let i = 2;
    if (status)      { sql += ` AND t.status=$${i++}`;            params.push(status); }
    if (category)    { sql += ` AND t.tender_category=$${i++}`;   params.push(category); }
    if (source)      { sql += ` AND t.tender_source=$${i++}`;     params.push(source); }
    if (assigned_to) { sql += ` AND t.assigned_to=$${i++}`;       params.push(assigned_to); }
    sql += ' ORDER BY t.created_at DESC';
    res.json({ data: (await db().query(sql, params)).rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/dashboard', async (req, res) => {
  try {
    const cid = CID(req);
    const [summary, pipeline, recentWins, expiringEMD] = await Promise.all([
      db().query(`
        SELECT
          COUNT(*) FILTER (WHERE status NOT IN ('cancelled','lost')) AS active,
          COUNT(*) FILTER (WHERE status='submitted') AS submitted,
          COUNT(*) FILTER (WHERE status='won') AS won,
          COUNT(*) FILTER (WHERE status='lost') AS lost,
          COUNT(*) AS total,
          ROUND(COUNT(*) FILTER (WHERE status='won') * 100.0 / NULLIF(COUNT(*) FILTER (WHERE status IN ('won','lost')),0),1) AS win_rate,
          SUM(CASE WHEN status='won' THEN awarded_amount ELSE 0 END) AS revenue_won,
          SUM(CASE WHEN status NOT IN ('lost','cancelled','won') THEN estimated_value ELSE 0 END) AS pipeline_value
        FROM tenders WHERE company_id=$1`, [cid]),
      db().query(`
        SELECT status, COUNT(*) AS count, SUM(estimated_value) AS value
        FROM tenders WHERE company_id=$1 AND status NOT IN ('cancelled')
        GROUP BY status ORDER BY status`, [cid]),
      db().query(`
        SELECT tender_number, title, awarded_amount, award_date, client_name
        FROM tenders WHERE company_id=$1 AND status='won'
        ORDER BY award_date DESC LIMIT 5`, [cid]),
      db().query(`
        SELECT e.*, t.title AS tender_title, t.tender_number
        FROM tender_emd e JOIN tenders t ON t.id=e.tender_id
        WHERE t.company_id=$1 AND e.status='active' AND e.expiry_date <= CURRENT_DATE + 30
        ORDER BY e.expiry_date`, [cid]),
    ]);
    res.json({ data: {
      summary: summary.rows[0],
      pipeline: pipeline.rows,
      recent_wins: recentWins.rows,
      expiring_emd: expiringEMD.rows,
    }});
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/:id', async (req, res) => {
  try {
    const r = await db().query(`
      SELECT t.*, u.name AS assigned_to_name,
        (SELECT json_agg(e) FROM tender_emd e WHERE e.tender_id=t.id) AS emd_list,
        (SELECT json_agg(c) FROM tender_clarifications c WHERE c.tender_id=t.id ORDER BY c.created_at) AS clarifications,
        (SELECT json_agg(a) FROM tender_addendums a WHERE a.tender_id=t.id ORDER BY a.addendum_no) AS addendums,
        (SELECT row_to_json(bc) FROM tender_bid_costing bc WHERE bc.tender_id=t.id AND bc.is_final=true LIMIT 1) AS final_costing
      FROM tenders t
      LEFT JOIN users u ON u.id=t.assigned_to
      WHERE t.id=$1 AND t.company_id=$2`, [req.params.id, CID(req)]);
    if (!r.rows.length) return res.status(404).json({ error: 'Tender not found' });
    res.json({ data: r.rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/', authorize(...TENDER_ROLES), async (req, res) => {
  try {
    const {
      tender_number, title, description, scope_of_work, tender_type, tender_category,
      tender_source, client_name, client_contact, client_email, client_phone, client_type,
      location, estimated_value, submission_deadline, bid_open_date, pre_bid_date,
      submission_mode, emd_required, emd_amount, go_no_go_status, assigned_to, remarks
    } = req.body;
    if (!tender_number || !title) return res.status(400).json({ error: 'tender_number, title required' });
    const r = await db().query(`
      INSERT INTO tenders (company_id, tender_number, title, description, scope_of_work,
        tender_type, tender_category, tender_source, client_name, client_contact, client_email,
        client_phone, client_type, location, estimated_value, submission_deadline,
        bid_open_date, pre_bid_date, submission_mode, emd_required, emd_amount,
        go_no_go_status, assigned_to, remarks, status, created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,'new',$25)
      RETURNING *`,
      [CID(req), tender_number, title, description||null, scope_of_work||null,
       tender_type||'works', tender_category||'civil', tender_source||'direct',
       client_name||null, client_contact||null, client_email||null, client_phone||null,
       client_type||'private', location||null, estimated_value||null,
       submission_deadline||null, bid_open_date||null, pre_bid_date||null,
       submission_mode||'online', emd_required||false, emd_amount||null,
       go_no_go_status||'pending', assigned_to||null, remarks||null, req.user.id]);
    res.status(201).json({ data: r.rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/:id', authorize(...TENDER_ROLES), async (req, res) => {
  try {
    const fields = [
      'title','description','scope_of_work','tender_type','tender_category','tender_source',
      'client_name','client_contact','client_email','client_phone','client_type','location',
      'estimated_value','submission_deadline','bid_open_date','bid_close_date','pre_bid_date',
      'submission_mode','emd_required','emd_amount','go_no_go_status','go_no_go_remarks',
      'assigned_to','remarks','status','our_bid_value','l1_value','technical_score',
      'commercial_score','result_date','loss_reason','submission_date'
    ];
    const sets = []; const vals = [];
    fields.forEach(f => {
      if (req.body[f] !== undefined) {
        sets.push(`${f}=$${vals.length+1}`);
        vals.push(req.body[f]);
      }
    });
    if (!sets.length) return res.status(400).json({ error: 'Nothing to update' });
    vals.push(`${new Date().toISOString()}`, req.params.id, CID(req));
    const r = await db().query(
      `UPDATE tenders SET ${sets.join(',')}, updated_at=$${vals.length-2} WHERE id=$${vals.length-1} AND company_id=$${vals.length} RETURNING *`,
      vals);
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json({ data: r.rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Status transition
router.patch('/:id/status', authorize(...TENDER_ROLES), async (req, res) => {
  try {
    const { status, remarks } = req.body;
    const r = await db().query(
      `UPDATE tenders SET status=$1, remarks=COALESCE($2,remarks), updated_at=NOW()
       WHERE id=$3 AND company_id=$4 RETURNING *`,
      [status, remarks||null, req.params.id, CID(req)]);
    res.json({ data: r.rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ══════════════════════════════════════════════════════════════════
// EMD & BANK GUARANTEE
// ══════════════════════════════════════════════════════════════════
router.get('/:id/emd', async (req, res) => {
  try {
    const r = await db().query(`SELECT * FROM tender_emd WHERE tender_id=$1 ORDER BY created_at DESC`, [req.params.id]);
    res.json({ data: r.rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/:id/emd', authorize(...TENDER_ROLES), async (req, res) => {
  try {
    const { instrument_type, instrument_no, issuing_bank, amount, issue_date, expiry_date,
            purpose, submitted_to, submitted_date, remarks } = req.body;
    const r = await db().query(`
      INSERT INTO tender_emd (tender_id, company_id, instrument_type, instrument_no, issuing_bank,
        amount, issue_date, expiry_date, purpose, submitted_to, submitted_date, remarks, created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [req.params.id, CID(req), instrument_type||'dd', instrument_no||null, issuing_bank||null,
       amount||0, issue_date||null, expiry_date||null, purpose||'emd',
       submitted_to||null, submitted_date||null, remarks||null, req.user.id]);
    res.status(201).json({ data: r.rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.patch('/emd/:emdId', authorize(...TENDER_ROLES), async (req, res) => {
  try {
    const { status, returned_date, remarks } = req.body;
    const r = await db().query(`
      UPDATE tender_emd SET status=COALESCE($1,status), returned_date=COALESCE($2,returned_date),
        remarks=COALESCE($3,remarks), updated_at=NOW()
      WHERE id=$4 RETURNING *`, [status, returned_date||null, remarks||null, req.params.emdId]);
    res.json({ data: r.rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ══════════════════════════════════════════════════════════════════
// PRE-BID & CLARIFICATIONS
// ══════════════════════════════════════════════════════════════════
router.post('/:id/prebid', authorize(...TENDER_ROLES), async (req, res) => {
  try {
    const { meeting_date, venue, meeting_notes, attended, attendees } = req.body;
    const r = await db().query(`
      INSERT INTO tender_prebid (tender_id,meeting_date,venue,meeting_notes,attended,attendees)
      VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [req.params.id, meeting_date||null, venue||null, meeting_notes||null, attended||false, JSON.stringify(attendees||[])]);
    res.status(201).json({ data: r.rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/:id/clarifications', async (req, res) => {
  try {
    const r = await db().query(`SELECT * FROM tender_clarifications WHERE tender_id=$1 ORDER BY created_at`, [req.params.id]);
    res.json({ data: r.rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/:id/clarifications', authorize(...TENDER_ROLES), async (req, res) => {
  try {
    const { query_type, query_text, query_date } = req.body;
    const cnt = (await db().query(`SELECT COALESCE(MAX(CAST(REGEXP_REPLACE(query_number, '^.*-', '') AS INTEGER)), 0) AS last_seq
                                   FROM tender_clarifications WHERE tender_id=$1 AND query_number ~ '[0-9]+$'`, [req.params.id])).rows[0].last_seq;
    const query_number = `Q-${String(parseInt(cnt)+1).padStart(3,'0')}`;
    const r = await db().query(`
      INSERT INTO tender_clarifications (tender_id,query_number,query_date,query_type,query_text,raised_by)
      VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [req.params.id, query_number, query_date||new Date().toISOString().slice(0,10), query_type||'technical', query_text, req.user.id]);
    res.status(201).json({ data: r.rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.patch('/clarifications/:cid', authorize(...TENDER_ROLES), async (req, res) => {
  try {
    const { response_text, status } = req.body;
    const r = await db().query(`
      UPDATE tender_clarifications SET response_text=$1, response_date=CURRENT_DATE,
        status=COALESCE($2,'responded') WHERE id=$3 RETURNING *`,
      [response_text, status||'responded', req.params.cid]);
    res.json({ data: r.rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Addendums
router.post('/:id/addendums', authorize(...TENDER_ROLES), async (req, res) => {
  try {
    const { addendum_no, subject, description, impact_type, new_deadline, file_url } = req.body;
    const r = await db().query(`
      INSERT INTO tender_addendums (tender_id,addendum_no,subject,description,impact_type,new_deadline,file_url)
      VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [req.params.id, addendum_no, subject||null, description||null, impact_type||'scope', new_deadline||null, file_url||null]);
    res.status(201).json({ data: r.rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ══════════════════════════════════════════════════════════════════
// BID COSTING
// ══════════════════════════════════════════════════════════════════
router.get('/:id/costing', async (req, res) => {
  try {
    const r = await db().query(`
      SELECT c.*,
        (SELECT json_agg(i ORDER BY i.sequence_no) FROM tender_cost_items i WHERE i.costing_id=c.id) AS items
      FROM tender_bid_costing c WHERE c.tender_id=$1 ORDER BY c.version DESC`, [req.params.id]);
    res.json({ data: r.rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/:id/costing', authorize(...TENDER_ROLES), async (req, res) => {
  try {
    const {
      material_cost, labour_cost, equipment_cost, subcontract_cost,
      overhead_pct, risk_provision_pct, profit_margin_pct, contingency_pct,
      items, is_final, notes
    } = req.body;
    // Get next version
    const ver = (await db().query(`SELECT COALESCE(MAX(version),0)+1 AS v FROM tender_bid_costing WHERE tender_id=$1`, [req.params.id])).rows[0].v;
    // Calculate amounts
    const mc = parseFloat(material_cost||0), lc = parseFloat(labour_cost||0),
          ec = parseFloat(equipment_cost||0), sc = parseFloat(subcontract_cost||0);
    const direct = mc + lc + ec + sc;
    const oh_pct = parseFloat(overhead_pct||10), rp_pct = parseFloat(risk_provision_pct||3),
          pm_pct = parseFloat(profit_margin_pct||5), ct_pct = parseFloat(contingency_pct||2);
    const oh  = direct * oh_pct / 100;
    const rp  = (direct + oh) * rp_pct / 100;
    const ct  = (direct + oh + rp) * ct_pct / 100;
    const pm  = (direct + oh + rp + ct) * pm_pct / 100;
    const total = direct + oh + rp + ct + pm;

    const r = await db().query(`
      INSERT INTO tender_bid_costing (tender_id,version,is_final,
        material_cost,labour_cost,equipment_cost,subcontract_cost,
        overhead_pct,overhead_amount,risk_provision_pct,risk_amount,
        profit_margin_pct,profit_amount,contingency_pct,contingency_amount,
        total_cost,bid_price,notes,created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$16,$17,$18) RETURNING *`,
      [req.params.id, ver, is_final||false, mc, lc, ec, sc,
       oh_pct, oh, rp_pct, rp, pm_pct, pm, ct_pct, ct, total, notes||null, req.user.id]);

    // Insert line items
    if (Array.isArray(items) && items.length) {
      for (let k=0; k<items.length; k++) {
        const it = items[k];
        await db().query(`
          INSERT INTO tender_cost_items (costing_id,tender_id,item_code,description,unit,quantity,unit_rate,category,remarks,sequence_no)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
          [r.rows[0].id, req.params.id, it.item_code||null, it.description, it.unit||null,
           it.quantity||0, it.unit_rate||0, it.category||'material', it.remarks||null, k+1]);
      }
    }
    res.status(201).json({ data: r.rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ══════════════════════════════════════════════════════════════════
// COMPETITOR ANALYSIS
// ══════════════════════════════════════════════════════════════════
router.get('/competitors', async (req, res) => {
  try {
    const r = await db().query(`SELECT * FROM tender_competitors WHERE company_id=$1 AND is_active=true ORDER BY competitor_name`, [CID(req)]);
    res.json({ data: r.rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/competitors', authorize(...ADMINS), async (req, res) => {
  try {
    const { competitor_name, competitor_type, strengths, weaknesses, typical_margin, notes } = req.body;
    const r = await db().query(`
      INSERT INTO tender_competitors (company_id,competitor_name,competitor_type,strengths,weaknesses,typical_margin,notes)
      VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [CID(req), competitor_name, competitor_type||'local', strengths||null, weaknesses||null, typical_margin||null, notes||null]);
    res.status(201).json({ data: r.rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/:id/competitor-bids', authorize(...TENDER_ROLES), async (req, res) => {
  try {
    const { competitor_id, competitor_name, bid_value, rank, is_l1, notes } = req.body;
    const r = await db().query(`
      INSERT INTO tender_competitor_bids (tender_id,competitor_id,competitor_name,bid_value,rank,is_l1,notes)
      VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [req.params.id, competitor_id||null, competitor_name||null, bid_value||0, rank||null, is_l1||false, notes||null]);
    res.status(201).json({ data: r.rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Win/Loss Analysis
router.get('/analytics/win-loss', async (req, res) => {
  try {
    const { from_date, to_date } = req.query;
    let clause = ''; const params = [CID(req)]; let i = 2;
    if (from_date) { clause += ` AND t.result_date >= $${i++}`; params.push(from_date); }
    if (to_date)   { clause += ` AND t.result_date <= $${i++}`; params.push(to_date); }
    const r = await db().query(`
      SELECT t.*, t.our_bid_value, t.l1_value,
        CASE WHEN t.l1_value > 0 THEN ROUND((t.our_bid_value - t.l1_value)*100/t.l1_value, 2) END AS variance_pct,
        (SELECT json_agg(cb) FROM tender_competitor_bids cb WHERE cb.tender_id=t.id) AS competitor_bids
      FROM tenders t
      WHERE t.company_id=$1 AND t.status IN ('won','lost') ${clause}
      ORDER BY t.result_date DESC`, params);
    res.json({ data: r.rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
