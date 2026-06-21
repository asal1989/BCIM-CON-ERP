// src/routes/variation.routes.js
const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const { loadProjectScope, userCanAccessProject, appendProjectScope } = require('../middleware/projectScope');
const { query, withTransaction } = require('../config/database');

router.use(authenticate);
router.use(loadProjectScope);

// GET /api/v1/variations — List for a project
router.get('/', async (req, res) => {
  try {
    const { project_id, status } = req.query;
    let sql = `SELECT vo.*, p.name as project_name, u.name as requested_by_name
               FROM variation_orders vo
               JOIN projects p ON vo.project_id = p.id
               LEFT JOIN users u ON vo.requested_by = u.id
               WHERE p.company_id = $1`;
    let params = [req.user.company_id];
    let idx = 2;

    if (project_id) { sql += ` AND vo.project_id = $${idx++}`; params.push(project_id); }
    if (status)     { sql += ` AND vo.status = $${idx++}`;     params.push(status); }

    ({ sql, params } = appendProjectScope(req, sql, params, 'vo'));
    sql += ' ORDER BY vo.created_at DESC';
    const result = await query(sql, params);
    res.json({ data: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/v1/variations/:id — Get detail with items
router.get('/:id', async (req, res) => {
  try {
    const voRes = await query(
      `SELECT vo.*, p.name as project_name, p.company_id, u.name as requested_by_name
       FROM variation_orders vo
       JOIN projects p ON vo.project_id = p.id
       LEFT JOIN users u ON vo.requested_by = u.id
       WHERE vo.id = $1`, [req.params.id]
    );
    if (!voRes.rows.length || voRes.rows[0].company_id !== req.user.company_id) return res.status(404).json({ error: 'VO not found' });
    
    const items = await query(
      `SELECT vi.*, b.description as boq_description 
       FROM variation_items vi
       LEFT JOIN boq_items b ON vi.boq_item_id = b.id
       WHERE vi.vo_id = $1`, [req.params.id]
    );
    
    res.json({ data: { ...voRes.rows[0], items: items.rows } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/v1/variations — Create Request
router.post('/', authorize('super_admin','admin','qs_engineer','project_manager'), async (req, res) => {
  try {
    const { project_id, description, items, remarks } = req.body;
    
    if (!project_id) return res.status(400).json({ error: 'project_id is required' });
    if (!userCanAccessProject(req, project_id)) {
      return res.status(403).json({ error: 'You do not have access to this project.' });
    }

    const result = await withTransaction(async (client) => {
      // 1. Generate VO Number — MAX-based, company-scoped, race-safe inside transaction
      const yr = new Date().getFullYear();
      const seqRes = await client.query(
        `SELECT COALESCE(MAX(CAST(REGEXP_REPLACE(vo_number, '^VO/[0-9]+/', '') AS INTEGER)), 0) AS last_seq
         FROM variation_orders vo
         JOIN projects p ON p.id = vo.project_id
         WHERE p.company_id = $1 AND vo.vo_number LIKE $2`,
        [req.user.company_id, `VO/${yr}/%`]
      );
      const vo_number = `VO/${yr}/${String(parseInt(seqRes.rows[0].last_seq) + 1).padStart(3, '0')}`;

      // 2. Insert Header
      const header = await client.query(
        `INSERT INTO variation_orders (project_id, vo_number, description, requested_by, status, remarks)
         VALUES ($1, $2, $3, $4, 'pending', $5) RETURNING *`,
        [project_id, vo_number, description, req.user.id, remarks]
      );
      const voId = header.rows[0].id;

      // 3. Insert Items
      let total = 0;
      for (const it of items) {
        await client.query(
          `INSERT INTO variation_items (vo_id, boq_item_id, new_item_description, unit, quantity, rate, reason)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [voId, it.boq_item_id || null, it.new_item_description || null, it.unit, it.quantity, it.rate, it.reason]
        );
        total += (parseFloat(it.quantity) * parseFloat(it.rate));
      }

      // 4. Update Header with total
      const final = await client.query(
        `UPDATE variation_orders SET total_variation_amount = $1 WHERE id = $2 RETURNING *`,
        [total, voId]
      );
      
      return final.rows[0];
    });

    res.status(201).json({ data: result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/v1/variations/approved-items?project_id=
// Returns all line items from approved VOs for a project (for MB abstract)
router.get('/approved-items', async (req, res) => {
  try {
    const { project_id } = req.query;
    let sql = `
      SELECT
        vi.id, vi.vo_id, vi.boq_item_id, vi.new_item_description, vi.unit,
        vi.quantity, vi.rate, vi.reason,
        (vi.quantity * vi.rate) AS amount,
        vo.vo_number, vo.description AS vo_description,
        b.description AS boq_description, b.sr_no AS csi_no
      FROM variation_items vi
      JOIN variation_orders vo ON vi.vo_id = vo.id
      JOIN projects p ON vo.project_id = p.id
      LEFT JOIN boq_items b ON vi.boq_item_id = b.id
      WHERE vo.status = 'approved'
        AND p.company_id = $1`;
    let params = [req.user.company_id];
    if (project_id) { sql += ` AND vo.project_id = $2`; params.push(project_id); }
    ({ sql, params } = appendProjectScope(req, sql, params, 'vo'));
    sql += ` ORDER BY vo.created_at, vi.id`;
    const result = await query(sql, params);
    res.json({ data: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/v1/variations/:id/approve
router.patch('/:id/approve', authorize('super_admin','admin','project_manager'), async (req, res) => {
  try {
    const result = await withTransaction(async (client) => {
      // 1. Approve the VO
      const vo = await client.query(
        `UPDATE variation_orders SET status = 'approved', approved_by = $1, updated_at = NOW()
         WHERE id = $2 RETURNING *`,
        [req.user.id, req.params.id]
      );
      if (!vo.rows.length) throw Object.assign(new Error('VO not found'), { status: 404 });
      const { id: voId, project_id } = vo.rows[0];

      // 2. Get company_id via project
      const proj = await client.query(`SELECT company_id FROM projects WHERE id=$1`, [project_id]);
      const company_id = proj.rows[0].company_id;

      // 3. Determine next amendment number for this project
      const amNum = await client.query(
        `SELECT COALESCE(MAX(amendment_number),0)+1 AS next FROM boq_amendments WHERE project_id=$1`,
        [project_id]
      );
      const amendmentNumber = amNum.rows[0].next;
      const amendmentRef    = `A${amendmentNumber}`;

      // 4. Create amendment header
      const amend = await client.query(
        `INSERT INTO boq_amendments (project_id, company_id, vo_id, amendment_number, amendment_ref, approved_by, remarks)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
        [project_id, company_id, voId, amendmentNumber, amendmentRef, req.user.id, req.body.remarks || null]
      );
      const amendId = amend.rows[0].id;

      // 5. For each VO item linked to a BOQ item: record change + update current values
      const voItems = await client.query(
        `SELECT * FROM variation_items WHERE vo_id=$1 AND boq_item_id IS NOT NULL`,
        [voId]
      );
      for (const vi of voItems.rows) {
        const orig = await client.query(
          `SELECT rate, quantity, current_rate, current_quantity FROM boq_items WHERE id=$1`,
          [vi.boq_item_id]
        );
        if (!orig.rows.length) continue;
        const o = orig.rows[0];
        await client.query(
          `INSERT INTO boq_amendment_items
             (amendment_id, boq_item_id, original_rate, original_quantity, revised_rate, revised_quantity, reason)
           VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [amendId, vi.boq_item_id,
           o.current_rate ?? o.rate, o.current_quantity ?? o.quantity,
           vi.rate ?? o.current_rate ?? o.rate,
           vi.quantity ?? o.current_quantity ?? o.quantity,
           vi.reason || null]
        );
        // Update BOQ item with latest revision
        await client.query(
          `UPDATE boq_items
             SET current_rate     = $1,
                 current_quantity = $2,
                 amendment_ref    = $3
           WHERE id = $4`,
          [vi.rate ?? o.rate, vi.quantity ?? o.quantity, amendmentRef, vi.boq_item_id]
        );
      }

      return { ...vo.rows[0], amendment_ref: amendmentRef, amendment_number: amendmentNumber };
    });

    res.json({ data: result });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// GET /api/v1/variations/amendments?project_id= — amendment history for a project
router.get('/amendments', async (req, res) => {
  try {
    const { project_id } = req.query;
    if (!project_id) return res.status(400).json({ error: 'project_id required' });
    const amendments = await query(
      `SELECT ba.*, vo.vo_number, vo.description AS vo_description,
              u.name AS approved_by_name,
              (SELECT COUNT(*) FROM boq_amendment_items WHERE amendment_id=ba.id) AS item_count
       FROM boq_amendments ba
       LEFT JOIN variation_orders vo ON ba.vo_id = vo.id
       LEFT JOIN users u ON ba.approved_by = u.id
       WHERE ba.project_id = $1
       ORDER BY ba.amendment_number`,
      [project_id]
    );
    res.json({ data: amendments.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/v1/variations/amendments/:id/items — line items for one amendment
router.get('/amendments/:id/items', async (req, res) => {
  try {
    const items = await query(
      `SELECT bai.*, b.description, b.unit, b.sr_no, b.item_no, b.chapter_name
       FROM boq_amendment_items bai
       JOIN boq_items b ON b.id = bai.boq_item_id
       WHERE bai.amendment_id = $1
       ORDER BY b.chapter_no, b.item_no`,
      [req.params.id]
    );
    res.json({ data: items.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
