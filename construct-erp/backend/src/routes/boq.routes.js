const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const { authenticate, authorize } = require('../middleware/auth');
const { query, withTransaction } = require('../config/database');
const { extractBOQItems } = require('../services/boqExtraction.service');
const { loadProjectScope, appendProjectScope } = require('../middleware/projectScope');

const upload = multer({
  dest: 'uploads/',
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB
});

// ── Auto-migrate: BOQ amendment columns ───────────────────────────────────────
(async () => {
  const safe = async (sql) => { try { await query(sql); } catch (_) {} };
  await safe(`ALTER TABLE boq_items ADD COLUMN IF NOT EXISTS current_rate     NUMERIC(14,2)`);
  await safe(`ALTER TABLE boq_items ADD COLUMN IF NOT EXISTS current_quantity NUMERIC(14,3)`);
  await safe(`ALTER TABLE boq_items ADD COLUMN IF NOT EXISTS amendment_ref    VARCHAR(20)`);
  await safe(`CREATE TABLE IF NOT EXISTS boq_amendments (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id       UUID REFERENCES projects(id) ON DELETE CASCADE,
    company_id       UUID REFERENCES companies(id) ON DELETE CASCADE,
    vo_id            UUID REFERENCES variation_orders(id),
    amendment_number INTEGER NOT NULL,
    amendment_ref    VARCHAR(20) NOT NULL,
    approved_by      UUID REFERENCES users(id),
    approved_at      TIMESTAMPTZ DEFAULT NOW(),
    remarks          TEXT,
    created_at       TIMESTAMPTZ DEFAULT NOW()
  )`);
  await safe(`CREATE TABLE IF NOT EXISTS boq_amendment_items (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    amendment_id     UUID REFERENCES boq_amendments(id) ON DELETE CASCADE,
    boq_item_id      UUID REFERENCES boq_items(id),
    original_rate     NUMERIC(14,2),
    original_quantity NUMERIC(14,3),
    revised_rate      NUMERIC(14,2),
    revised_quantity  NUMERIC(14,3),
    reason           TEXT
  )`);
  await safe(`CREATE INDEX IF NOT EXISTS idx_boq_amend_project ON boq_amendments(project_id)`);
  await safe(`CREATE INDEX IF NOT EXISTS idx_boq_amend_items   ON boq_amendment_items(amendment_id)`);
})();

router.use(authenticate);
router.use(loadProjectScope);

router.get('/', async (req, res) => {
  const { project_id, chapter } = req.query;
  let sql = `SELECT b.*,
                    p.name as project_name,
                    ROUND((b.quantity * b.rate)::numeric, 2) AS amount,
                    GREATEST(
                      COALESCE((SELECT SUM(net_quantity) FROM measurements WHERE boq_item_id=b.id AND status='pm_approved'),0),
                      COALESCE((
                        SELECT SUM(bi.curr_qty)
                        FROM sc_bill_items bi
                        JOIN sc_bills sb ON sb.id=bi.bill_id
                        JOIN sc_wo_items swi ON swi.id=bi.wo_item_id
                        WHERE swi.boq_item_id=b.id
                          AND sb.status IN ('approved','paid')
                          AND sb.company_id=$1
                      ),0),
                      COALESCE((SELECT SUM(rbi.current_qty) FROM ra_bill_items rbi JOIN ra_bills rb ON rbi.ra_bill_id=rb.id
                                 WHERE rbi.boq_item_id=b.id AND rb.status IN ('certified','paid')),0)
                    ) AS executed_qty,
                    COALESCE((
                      SELECT SUM(bi.curr_qty)
                      FROM sc_bill_items bi
                      JOIN sc_bills sb ON sb.id=bi.bill_id
                      JOIN sc_wo_items swi ON swi.id=bi.wo_item_id
                      WHERE swi.boq_item_id=b.id
                        AND sb.status IN ('approved','paid')
                        AND sb.company_id=$1
                    ),0) AS subcontractor_billed_qty,
                    COALESCE((SELECT SUM(rbi.current_qty) FROM ra_bill_items rbi JOIN ra_bills rb ON rbi.ra_bill_id=rb.id
                               WHERE rbi.boq_item_id=b.id AND rb.status IN ('certified','paid')),0) AS certified_qty
             FROM boq_items b
             JOIN projects p ON b.project_id = p.id
             WHERE p.company_id = $1 AND b.is_active = true`;
  let params = [req.user.company_id];
  let i = 2;
  if (project_id) { sql += ` AND b.project_id = $${i++}`; params.push(project_id); }
  if (chapter) { sql += ` AND b.chapter_name ILIKE $${i++}`; params.push(`%${chapter}%`); }
  ({ sql, params } = appendProjectScope(req, sql, params, 'b'));
  sql += ' ORDER BY b.chapter_no, b.item_no';
  const result = await query(sql, params);
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.json({ data: result.rows });
});

router.post('/', authorize('super_admin','admin','qs_engineer','project_manager'), async (req, res) => {
  const { project_id, chapter_no, chapter_name, item_no, sr_no, description, unit, quantity, rate, hsn_code, remarks } = req.body;
  if (!project_id || !description || !unit || quantity == null || rate == null) {
    return res.status(400).json({ error: 'project_id, description, unit, quantity and rate are required' });
  }
  const result = await query(
    `INSERT INTO boq_items (project_id,chapter_no,chapter_name,item_no,sr_no,description,unit,quantity,rate,hsn_code,remarks,created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
    [project_id, chapter_no || null, chapter_name || null, item_no || null, sr_no || null,
     description, unit, parseFloat(quantity), parseFloat(rate), hsn_code || null, remarks || null, req.user.id]
  );
  res.status(201).json({ data: result.rows[0] });
});

router.put('/:id', authorize('super_admin','admin','qs_engineer'), async (req, res) => {
  const { sr_no, description, quantity, rate, remarks } = req.body;
  const result = await query(
    'UPDATE boq_items SET sr_no=$1,description=$2,quantity=$3,rate=$4,remarks=$5,updated_at=NOW() WHERE id=$6 RETURNING *',
    [sr_no, description, quantity, rate, remarks, req.params.id]
  );
  res.json({ data: result.rows[0] });
});

router.delete('/:id', authorize('super_admin','admin'), async (req, res) => {
  await query('UPDATE boq_items SET is_active=false WHERE id=$1', [req.params.id]);
  res.json({ message: 'BOQ item deleted.' });
});

// GET BOQ summary with executed quantities — company scoped
router.get('/summary/:project_id', async (req, res) => {
  // Verify the project belongs to the requesting user's company
  const proj = await query(
    `SELECT id FROM projects WHERE id = $1 AND company_id = $2`,
    [req.params.project_id, req.user.company_id]
  );
  if (!proj.rows.length) return res.status(404).json({ error: 'Project not found' });

  const result = await query(
    `SELECT b.*,
       ROUND((b.quantity * b.rate)::numeric, 2) AS amount,
       GREATEST(
         COALESCE((SELECT SUM(net_quantity) FROM measurements WHERE boq_item_id=b.id AND status='pm_approved'),0),
         COALESCE((
           SELECT SUM(bi.curr_qty)
           FROM sc_bill_items bi
           JOIN sc_bills sb ON sb.id=bi.bill_id
           JOIN sc_work_orders swo ON swo.id=sb.wo_id
           JOIN sc_wo_items swi ON swi.id=bi.wo_item_id
           WHERE swi.boq_item_id=b.id
             AND sb.status IN ('approved','paid')
             AND sb.company_id=$2
         ),0),
         COALESCE((SELECT SUM(rbi.current_qty) FROM ra_bill_items rbi JOIN ra_bills rb ON rbi.ra_bill_id=rb.id
                    WHERE rbi.boq_item_id=b.id AND rb.status IN ('certified','paid')),0)
       ) AS executed_qty,
       COALESCE((
         SELECT SUM(bi.curr_qty)
         FROM sc_bill_items bi
         JOIN sc_bills sb ON sb.id=bi.bill_id
         JOIN sc_work_orders swo ON swo.id=sb.wo_id
         JOIN sc_wo_items swi ON swi.id=bi.wo_item_id
         WHERE swi.boq_item_id=b.id
           AND sb.status IN ('approved','paid')
           AND sb.company_id=$2
       ),0) AS subcontractor_billed_qty,
       COALESCE((SELECT SUM(rbi.current_qty) FROM ra_bill_items rbi JOIN ra_bills rb ON rbi.ra_bill_id=rb.id
                  WHERE rbi.boq_item_id=b.id AND rb.status IN ('certified','paid')),0) AS certified_qty
     FROM boq_items b
     WHERE b.project_id=$1 AND b.is_active=true
     ORDER BY NULLIF(regexp_replace(b.chapter_no::text, '[^0-9]', '', 'g'), '')::int NULLS LAST,
              b.chapter_no, b.item_no`,
    [req.params.project_id, req.user.company_id]
  );
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.json({ data: result.rows });
});

// POST IMPORT BOQ (Excel, CSV, PDF, Image)
router.post('/import', authorize('super_admin','admin','qs_engineer'), upload.single('file'), async (req, res) => {
  const { project_id } = req.body;
  
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  if (!project_id) return res.status(400).json({ error: 'Project ID is required' });

  try {
    const items = await extractBOQItems(req.file.path, req.file.mimetype);

    if (!items || !items.length) {
      return res.status(400).json({
        error: 'No items were extracted from the document. Make sure your Excel has columns named Description, Quantity, Rate, and Unit. The first row with those words will be treated as the header row.'
      });
    }

    // All inserts in one transaction — either all succeed or none do
    const importedCount = await withTransaction(async (client) => {
      let count = 0;
      for (const item of items) {
        if (!item.description) continue;
        const remarks = `[AI-IMPORTED: VERIFY] ${item.remarks || ''}`.trim();
        await client.query(
          `INSERT INTO boq_items (project_id, chapter_no, chapter_name, item_no, sr_no, description, unit, quantity, rate, remarks, created_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
          [project_id, item.chapter_no || 'TBD', item.chapter_name || 'Imported',
           item.item_no || 'TBD', item.sr_no || null, item.description,
           item.unit || 'NOS', parseFloat(item.quantity) || 0, parseFloat(item.rate) || 0,
           remarks, req.user.id]
        );
        count++;
      }
      return count;
    });

    res.json({ success: true, count: importedCount, message: `Successfully imported ${importedCount} items as drafts.` });
  } catch (err) {
    console.error('[BOQ Import Error]:', err);
    res.status(500).json({ error: err.message || 'Failed to process document import.' });
  }
});

// ════════════════════════════════════════════════════════════════════
// BOQ → SC MAPPING ENDPOINTS
// ════════════════════════════════════════════════════════════════════

const CID = r => r.user.company_id;
const BOQ_ROLES = ['super_admin','admin','project_manager','qs_engineer'];

// Helper: next WO number for mapping-generated WOs
async function nextMappingWONumber(companyId, projectId) {
  const proj = await query(`SELECT name FROM projects WHERE id=$1`, [projectId]);
  const code = (proj.rows[0]?.name||'XX').replace(/[^A-Za-z0-9]/g,'').substring(0,6).toUpperCase();
  const r = await query(`SELECT COUNT(*) FROM sc_work_orders WHERE company_id=$1`, [companyId]);
  return `WO-${code}-${String(parseInt(r.rows[0].count)+1).padStart(3,'0')}`;
}

// GET /boq/:project_id/mappings — all mappings for a project
router.get('/:project_id/mappings', async (req, res) => {
  try {
    const { project_id } = req.params;
    const r = await query(`
      SELECT m.*,
             bi.item_no, bi.description AS boq_description, bi.unit, bi.chapter_no, bi.chapter_name,
             bi.quantity AS boq_total_qty,
             sc.name AS sc_name, sc.sc_code, sc.contractor_type,
             wo.wo_number, wo.status AS wo_status
      FROM boq_sc_mapping m
      JOIN boq_items bi ON bi.id = m.boq_item_id
      LEFT JOIN sc_subcontractors sc ON sc.id = m.sc_id
      LEFT JOIN sc_work_orders wo ON wo.id = m.wo_id
      WHERE m.project_id = $1 AND m.company_id = $2 AND m.status != 'cancelled'
      ORDER BY bi.chapter_no, bi.item_no, m.created_at`, [project_id, CID(req)]);
    res.json({ data: r.rows });
  } catch(e){ res.status(500).json({ error: e.message }); }
});

// GET /boq/:project_id/balance — unallocated qty remaining per BOQ item
router.get('/:project_id/balance', async (req, res) => {
  try {
    const { project_id } = req.params;
    const r = await query(`
      SELECT bi.id, bi.item_no, bi.description, bi.unit, bi.quantity AS total_qty, bi.rate,
             bi.chapter_no, bi.chapter_name,
             COALESCE(SUM(m.allocated_qty) FILTER (WHERE m.status != 'cancelled'), 0) AS allocated_qty,
             bi.quantity - COALESCE(SUM(m.allocated_qty) FILTER (WHERE m.status != 'cancelled'), 0) AS balance_qty,
             CASE WHEN bi.quantity > 0 THEN
               ROUND((COALESCE(SUM(m.allocated_qty) FILTER (WHERE m.status != 'cancelled'), 0) / bi.quantity) * 100, 1)
             ELSE 0 END AS allocated_pct
      FROM boq_items bi
      LEFT JOIN boq_sc_mapping m ON m.boq_item_id = bi.id
      WHERE bi.project_id = $1 AND bi.is_active = true
        AND EXISTS (SELECT 1 FROM projects p WHERE p.id = bi.project_id AND p.company_id = $2)
      GROUP BY bi.id, bi.item_no, bi.description, bi.unit, bi.quantity, bi.rate, bi.chapter_no, bi.chapter_name
      ORDER BY bi.chapter_no, bi.item_no`, [project_id, CID(req)]);
    res.json({ data: r.rows });
  } catch(e){ res.status(500).json({ error: e.message }); }
});

// POST /boq/mappings — create allocation
// GET /boq/:project_id/unlinked-wo-items — existing SC/procurement WO items not yet linked to client BOQ
router.get('/:project_id/unlinked-wo-items', async (req, res) => {
  try {
    const { project_id } = req.params;
    const r = await query(`
      SELECT
        wi.id AS wo_item_id,
        wi.wo_id,
        wi.description,
        wi.unit,
        wi.qty,
        wi.rate,
        COALESCE(wi.qty, 0) * COALESCE(wi.rate, 0) AS amount,
        wo.wo_number,
        wo.subject,
        wo.status AS wo_status,
        sc.id AS sc_id,
        sc.name AS sc_name,
        sc.contractor_type,
        p.name AS project_name
      FROM sc_wo_items wi
      JOIN sc_work_orders wo ON wo.id = wi.wo_id
      JOIN sc_subcontractors sc ON sc.id = wo.sc_id
      JOIN projects p ON p.id = wo.project_id
      WHERE wo.company_id = $1
        AND wo.project_id = $2
        AND COALESCE(wo.status, '') NOT IN ('cancelled','rejected')
        AND wi.boq_item_id IS NULL
      ORDER BY wo.wo_number, wi.sequence_no, wi.description
    `, [CID(req), project_id]);
    res.json({ data: r.rows });
  } catch(e){ res.status(500).json({ error: e.message }); }
});

router.post('/mappings', authorize(...BOQ_ROLES), async (req, res) => {
  try {
    const { boq_item_id, sc_id, execution_type, allocated_qty, sc_rate, notes, sc_name_override } = req.body;
    if (!boq_item_id || !allocated_qty || sc_rate === undefined)
      return res.status(400).json({ error: 'boq_item_id, allocated_qty and sc_rate are required' });

    // Get BOQ item details (validate belongs to company + get client_rate)
    const boqR = await query(`SELECT bi.*, p.company_id FROM boq_items bi JOIN projects p ON p.id=bi.project_id WHERE bi.id=$1`, [boq_item_id]);
    if (!boqR.rows.length || boqR.rows[0].company_id !== CID(req))
      return res.status(404).json({ error: 'BOQ item not found' });
    const boqItem = boqR.rows[0];

    // Validate allocation doesn't exceed total qty
    const usedR = await query(`SELECT COALESCE(SUM(allocated_qty),0) AS used FROM boq_sc_mapping WHERE boq_item_id=$1 AND status != 'cancelled'`, [boq_item_id]);
    const used = parseFloat(usedR.rows[0].used || 0);
    const requested = parseFloat(allocated_qty);
    if (used + requested > parseFloat(boqItem.quantity) + 0.001)
      return res.status(400).json({
        error: `Over-allocation: BOQ qty is ${boqItem.quantity}, already allocated ${used.toFixed(3)}, balance is ${(boqItem.quantity - used).toFixed(3)}`
      });

    const r = await query(`INSERT INTO boq_sc_mapping
      (company_id,project_id,boq_item_id,sc_id,execution_type,allocated_qty,client_rate,sc_rate,notes,sc_name_override,created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [CID(req), boqItem.project_id, boq_item_id, sc_id||null,
       execution_type||'subcontractor', requested, boqItem.rate, sc_rate,
       notes||null, sc_name_override||null, req.user.id]);
    res.status(201).json({ data: r.rows[0] });
  } catch(e){ res.status(500).json({ error: e.message }); }
});

// PUT /boq/mappings/:id — update (draft only)
// POST /boq/link-existing-wo-item — link an already-created WO item to client BOQ for margin tracking
router.post('/link-existing-wo-item', authorize(...BOQ_ROLES), async (req, res) => {
  try {
    const { wo_item_id, boq_item_id, allocated_qty, notes } = req.body || {};
    if (!wo_item_id || !boq_item_id) {
      return res.status(400).json({ error: 'wo_item_id and boq_item_id are required' });
    }

    const itemR = await query(`
      SELECT
        wi.id AS wo_item_id, wi.wo_id, wi.description, wi.unit, wi.qty, wi.rate,
        wo.project_id, wo.company_id, wo.sc_id, wo.wo_number,
        sc.name AS sc_name
      FROM sc_wo_items wi
      JOIN sc_work_orders wo ON wo.id = wi.wo_id
      JOIN sc_subcontractors sc ON sc.id = wo.sc_id
      WHERE wi.id = $1 AND wo.company_id = $2
    `, [wo_item_id, CID(req)]);
    if (!itemR.rows.length) return res.status(404).json({ error: 'WO item not found' });
    const woItem = itemR.rows[0];

    const boqR = await query(`
      SELECT bi.*, p.company_id
      FROM boq_items bi
      JOIN projects p ON p.id = bi.project_id
      WHERE bi.id = $1 AND p.company_id = $2 AND bi.is_active = true
    `, [boq_item_id, CID(req)]);
    if (!boqR.rows.length) return res.status(404).json({ error: 'BOQ item not found' });
    const boqItem = boqR.rows[0];
    if (String(boqItem.project_id) !== String(woItem.project_id)) {
      return res.status(400).json({ error: 'WO item and BOQ item must belong to the same project' });
    }

    const qty = Number(allocated_qty || woItem.qty || 0);
    if (!qty || qty <= 0) return res.status(400).json({ error: 'Allocated quantity must be greater than zero' });
    if (Number(woItem.qty || 0) > 0 && qty > Number(woItem.qty) + 0.001) {
      return res.status(400).json({ error: `Allocated quantity cannot exceed WO item quantity (${woItem.qty})` });
    }

    const usedR = await query(`
      SELECT COALESCE(SUM(allocated_qty),0) AS used
      FROM boq_sc_mapping
      WHERE boq_item_id=$1 AND status != 'cancelled'
    `, [boq_item_id]);
    const used = Number(usedR.rows[0].used || 0);
    if (used + qty > Number(boqItem.quantity || 0) + 0.001) {
      return res.status(400).json({
        error: `BOQ balance exceeded. BOQ qty ${boqItem.quantity}, already mapped ${used.toFixed(3)}, this link ${qty.toFixed(3)}`
      });
    }

    const result = await withTransaction(async (client) => {
      const linkNote = [
        notes || null,
        `Linked existing WO item ${wo_item_id} from ${woItem.wo_number}`
      ].filter(Boolean).join(' | ');
      const m = await client.query(`
        INSERT INTO boq_sc_mapping
          (company_id, project_id, boq_item_id, sc_id, execution_type, allocated_qty,
           client_rate, sc_rate, wo_id, notes, status, created_by)
        VALUES ($1,$2,$3,$4,'subcontractor',$5,$6,$7,$8,$9,'wo_issued',$10)
        RETURNING *
      `, [
        CID(req), woItem.project_id, boq_item_id, woItem.sc_id, qty,
        boqItem.rate, Number(woItem.rate || 0), woItem.wo_id, linkNote, req.user.id
      ]);
      await client.query(`UPDATE sc_wo_items SET boq_item_id=$1 WHERE id=$2`, [boq_item_id, wo_item_id]);
      return m.rows[0];
    });

    res.status(201).json({ data: result, message: 'Existing WO item linked to BOQ margin register' });
  } catch(e){ res.status(500).json({ error: e.message }); }
});

router.put('/mappings/:id', authorize(...BOQ_ROLES), async (req, res) => {
  try {
    const { allocated_qty, sc_rate, notes, sc_id, sc_name_override } = req.body;
    const existing = await query(`SELECT * FROM boq_sc_mapping WHERE id=$1 AND company_id=$2`, [req.params.id, CID(req)]);
    if (!existing.rows.length) return res.status(404).json({ error: 'Mapping not found' });
    if (existing.rows[0].status !== 'draft') return res.status(400).json({ error: 'Can only edit draft mappings' });

    // Re-validate qty if changed
    if (allocated_qty) {
      const boqR = await query(`SELECT quantity FROM boq_items WHERE id=$1`, [existing.rows[0].boq_item_id]);
      const usedR = await query(`SELECT COALESCE(SUM(allocated_qty),0) AS used FROM boq_sc_mapping WHERE boq_item_id=$1 AND status != 'cancelled' AND id != $2`, [existing.rows[0].boq_item_id, req.params.id]);
      const used = parseFloat(usedR.rows[0].used);
      if (used + parseFloat(allocated_qty) > parseFloat(boqR.rows[0].quantity) + 0.001)
        return res.status(400).json({ error: 'Updated qty exceeds BOQ balance' });
    }

    const r = await query(`UPDATE boq_sc_mapping SET
      allocated_qty=COALESCE($1,allocated_qty), sc_rate=COALESCE($2,sc_rate),
      notes=COALESCE($3,notes), sc_id=COALESCE($4,sc_id),
      sc_name_override=COALESCE($5,sc_name_override), updated_at=NOW()
      WHERE id=$6 AND company_id=$7 RETURNING *`,
      [allocated_qty||null, sc_rate||null, notes||null, sc_id||null, sc_name_override||null, req.params.id, CID(req)]);
    res.json({ data: r.rows[0] });
  } catch(e){ res.status(500).json({ error: e.message }); }
});

// DELETE /boq/mappings/:id — cancel
router.delete('/mappings/:id', authorize('super_admin','admin','project_manager'), async (req, res) => {
  try {
    const r = await query(`UPDATE boq_sc_mapping SET status='cancelled', updated_at=NOW()
      WHERE id=$1 AND company_id=$2 AND status IN ('draft','confirmed') RETURNING id`, [req.params.id, CID(req)]);
    if (!r.rows.length) return res.status(404).json({ error: 'Mapping not found or cannot be cancelled (WO already issued)' });
    res.json({ message: 'Mapping cancelled' });
  } catch(e){ res.status(500).json({ error: e.message }); }
});

// POST /boq/mappings/:id/confirm — move draft → confirmed
router.post('/mappings/:id/confirm', authorize(...BOQ_ROLES), async (req, res) => {
  try {
    const r = await query(
      `UPDATE boq_sc_mapping SET status='confirmed', updated_at=NOW()
       WHERE id=$1 AND company_id=$2 AND status='draft' RETURNING *`,
      [req.params.id, CID(req)]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Mapping not found or not in draft status' });
    res.json({ data: r.rows[0], message: 'Allocation confirmed' });
  } catch(e){ res.status(500).json({ error: e.message }); }
});

// POST /boq/mappings/:id/create-wo — generate SC work order from mapping
router.post('/mappings/:id/create-wo', authorize(...BOQ_ROLES), async (req, res) => {
  try {
    const map = await query(`SELECT m.*, bi.description, bi.unit, bi.item_no FROM boq_sc_mapping m JOIN boq_items bi ON bi.id=m.boq_item_id WHERE m.id=$1 AND m.company_id=$2`, [req.params.id, CID(req)]);
    if (!map.rows.length) return res.status(404).json({ error: 'Mapping not found' });
    const m = map.rows[0];
    if (m.execution_type === 'own_team') return res.status(400).json({ error: 'Own-team allocations do not generate Work Orders' });
    if (!m.sc_id) return res.status(400).json({ error: 'No SC vendor assigned to this mapping' });
    if (m.wo_id) return res.status(400).json({ error: 'Work Order already created for this mapping' });

    const wo_number = await nextMappingWONumber(CID(req), m.project_id);
    const woR = await query(`INSERT INTO sc_work_orders
      (company_id,project_id,sc_id,wo_number,subject,scope_of_work,contract_amount,boq_mapping_id,status)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'active') RETURNING *`,
      [CID(req), m.project_id, m.sc_id, wo_number,
       `BOQ Item ${m.item_no}: ${m.description}`,
       m.description, m.sc_amount, m.id]);
    const wo = woR.rows[0];

    // Insert WO item
    await query(`INSERT INTO sc_wo_items (wo_id,description,unit,qty,rate,boq_item_id)
      VALUES ($1,$2,$3,$4,$5,$6)`,
      [wo.id, m.description, m.unit, m.allocated_qty, m.sc_rate, m.boq_item_id]);

    // Update mapping with WO link
    await query(`UPDATE boq_sc_mapping SET wo_id=$1, status='wo_issued', updated_at=NOW() WHERE id=$2`, [wo.id, m.id]);

    res.status(201).json({ data: { wo, mapping_id: m.id } });
  } catch(e){ res.status(500).json({ error: e.message }); }
});

// GET /boq/:project_id/margin-register — comparative view
router.get('/:project_id/margin-register', async (req, res) => {
  try {
    const { project_id } = req.params;
    const r = await query(`
      SELECT
        bi.id AS boq_item_id, bi.item_no, bi.description, bi.description AS boq_description, bi.unit,
        bi.quantity AS client_qty, bi.rate AS client_rate,
        bi.quantity * bi.rate AS client_amount,
        bi.chapter_no, bi.chapter_name,
        COALESCE(SUM(m.allocated_qty) FILTER (WHERE m.status != 'cancelled'), 0) AS sc_qty,
        COALESCE(SUM(m.sc_amount) FILTER (WHERE m.status != 'cancelled'), 0) AS sc_amount,
        COALESCE(SUM(m.client_amount) FILTER (WHERE m.status != 'cancelled'), 0) AS allocated_client_amount,
        COALESCE(SUM(m.margin_amount) FILTER (WHERE m.status != 'cancelled'), 0) AS margin_amount,
        CASE WHEN COALESCE(SUM(m.client_amount) FILTER (WHERE m.status != 'cancelled'), 0) > 0
             THEN ROUND((COALESCE(SUM(m.margin_amount) FILTER (WHERE m.status != 'cancelled'), 0)
                  / COALESCE(SUM(m.client_amount) FILTER (WHERE m.status != 'cancelled'), 1)) * 100, 2)
             ELSE 0 END AS margin_pct,
        JSON_AGG(
          CASE WHEN m.id IS NOT NULL THEN
            JSON_BUILD_OBJECT('id', m.id, 'sc_name', COALESCE(sc.name, m.sc_name_override, 'BCIM Own Team'),
              'execution_type', m.execution_type, 'allocated_qty', m.allocated_qty,
              'sc_rate', m.sc_rate, 'sc_amount', m.sc_amount, 'margin_amount', m.margin_amount,
              'status', m.status, 'wo_id', m.wo_id, 'wo_number', wo.wo_number, 'notes', m.notes)
          END
        ) FILTER (WHERE m.id IS NOT NULL) AS allocations
      FROM boq_items bi
      LEFT JOIN boq_sc_mapping m ON m.boq_item_id = bi.id AND m.status != 'cancelled'
      LEFT JOIN sc_subcontractors sc ON sc.id = m.sc_id
      LEFT JOIN sc_work_orders wo ON wo.id = m.wo_id
      WHERE bi.project_id = $1 AND bi.is_active = true
        AND EXISTS (SELECT 1 FROM projects p WHERE p.id = bi.project_id AND p.company_id = $2)
      GROUP BY bi.id, bi.item_no, bi.description, bi.unit, bi.quantity, bi.rate, bi.chapter_no, bi.chapter_name
      ORDER BY bi.chapter_no, bi.item_no`, [project_id, CID(req)]);
    res.json({ data: r.rows });
  } catch(e){ res.status(500).json({ error: e.message }); }
});

// GET /boq/:project_id/dashboard — summary KPIs
router.get('/:project_id/dashboard', async (req, res) => {
  try {
    const { project_id } = req.params;
    const summary = await query(`
      SELECT
        COALESCE(SUM(bi.quantity * bi.rate), 0) AS total_client_value,
        COUNT(bi.id) AS total_boq_items,
        COUNT(bi.id) FILTER (WHERE EXISTS (
          SELECT 1 FROM boq_sc_mapping m WHERE m.boq_item_id=bi.id AND m.status != 'cancelled'
        )) AS mapped_items,
        COALESCE((SELECT SUM(sc_amount) FROM boq_sc_mapping WHERE project_id=$1 AND company_id=$2 AND status != 'cancelled'), 0) AS total_sc_committed,
        COALESCE((SELECT SUM(margin_amount) FROM boq_sc_mapping WHERE project_id=$1 AND company_id=$2 AND status != 'cancelled'), 0) AS total_margin
      FROM boq_items bi
      WHERE bi.project_id=$1 AND bi.is_active=true
        AND EXISTS (SELECT 1 FROM projects p WHERE p.id=bi.project_id AND p.company_id=$2)`,
      [project_id, CID(req)]);

    const byChapter = await query(`
      SELECT bi.chapter_name,
        SUM(bi.quantity * bi.rate) AS client_value,
        COALESCE(SUM(m.sc_amount) FILTER (WHERE m.status != 'cancelled'), 0) AS sc_value,
        COALESCE(SUM(m.margin_amount) FILTER (WHERE m.status != 'cancelled'), 0) AS margin
      FROM boq_items bi
      LEFT JOIN boq_sc_mapping m ON m.boq_item_id = bi.id
      WHERE bi.project_id=$1 AND bi.is_active=true
        AND EXISTS (SELECT 1 FROM projects p WHERE p.id=bi.project_id AND p.company_id=$2)
      GROUP BY bi.chapter_name ORDER BY margin ASC`, [project_id, CID(req)]);

    const unmapped = await query(`
      SELECT bi.item_no, bi.description, bi.unit, bi.quantity, bi.rate, bi.quantity*bi.rate AS amount
      FROM boq_items bi
      WHERE bi.project_id=$1 AND bi.is_active=true
        AND EXISTS (SELECT 1 FROM projects p WHERE p.id=bi.project_id AND p.company_id=$2)
        AND NOT EXISTS (SELECT 1 FROM boq_sc_mapping m WHERE m.boq_item_id=bi.id AND m.status != 'cancelled')
      ORDER BY bi.quantity*bi.rate DESC LIMIT 10`, [project_id, CID(req)]);

    const s = summary.rows[0];
    const clientVal = parseFloat(s.total_client_value || 0);
    const scCommitted = parseFloat(s.total_sc_committed || 0);
    const margin = parseFloat(s.total_margin || 0);

    res.json({ data: {
      total_client_value: clientVal,
      total_sc_committed: scCommitted,
      total_margin:       margin,
      margin_pct:         clientVal > 0 ? parseFloat(((margin / clientVal) * 100).toFixed(2)) : 0,
      total_boq_items:    parseInt(s.total_boq_items),
      mapped_items:       parseInt(s.mapped_items),
      unmapped_items:     parseInt(s.total_boq_items) - parseInt(s.mapped_items),
      by_chapter:         byChapter.rows,
      top_unmapped:       unmapped.rows,
    }});
  } catch(e){ res.status(500).json({ error: e.message }); }
});

// POST /boq/own-team-costs — record departmental cost
router.post('/own-team-costs', authorize('super_admin','admin','project_manager','qs_engineer','site_engineer'), async (req, res) => {
  try {
    const { mapping_id, cost_date, cost_type, description, qty, rate, floor_ref, remarks } = req.body;
    if (!mapping_id || !description || !rate) return res.status(400).json({ error: 'mapping_id, description, rate required' });

    // Validate mapping belongs to company and is own_team
    const m = await query(`SELECT * FROM boq_sc_mapping WHERE id=$1 AND company_id=$2`, [mapping_id, CID(req)]);
    if (!m.rows.length) return res.status(404).json({ error: 'Mapping not found' });
    if (m.rows[0].execution_type !== 'own_team') return res.status(400).json({ error: 'Cost tracking only for own-team allocations' });

    const r = await query(`INSERT INTO own_team_costs (company_id,mapping_id,cost_date,cost_type,description,qty,rate,floor_ref,remarks,recorded_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [CID(req), mapping_id, cost_date||new Date().toISOString().slice(0,10),
       cost_type||'labour', description, qty||1, rate, floor_ref||null, remarks||null, req.user.id]);
    res.status(201).json({ data: r.rows[0] });
  } catch(e){ res.status(500).json({ error: e.message }); }
});

// GET /boq/mappings/:id/own-team-costs
router.get('/mappings/:id/own-team-costs', async (req, res) => {
  try {
    const r = await query(`SELECT otc.*, u.name AS recorded_by_name FROM own_team_costs otc
      JOIN boq_sc_mapping m ON m.id=otc.mapping_id
      LEFT JOIN users u ON u.id=otc.recorded_by
      WHERE otc.mapping_id=$1 AND m.company_id=$2
      ORDER BY otc.cost_date DESC`, [req.params.id, CID(req)]);

    const totalR = await query(`SELECT COALESCE(SUM(amount),0) AS total FROM own_team_costs WHERE mapping_id=$1`, [req.params.id]);
    res.json({ data: r.rows, total_cost: parseFloat(totalR.rows[0].total) });
  } catch(e){ res.status(500).json({ error: e.message }); }
});

module.exports = router;
