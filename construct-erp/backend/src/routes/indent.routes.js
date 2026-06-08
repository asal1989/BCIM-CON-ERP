// src/routes/indent.routes.js
const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const { loadProjectScope, userCanAccessProject, appendProjectScope } = require('../middleware/projectScope');
const { query, withTransaction } = require('../config/database');
const { notifyIndentSubmitted, notifyIndentApproved, notifyIndentRejected } = require('../services/notif.helper');

router.use(authenticate);
router.use(loadProjectScope);

// Auto-generate indent number: IND-YYYYMM-NNN
async function nextIndentNumber(client, companyId) {
  const ym = new Date().toISOString().slice(0, 7).replace('-', '');
  const prefix = `IND-${ym}-`;
  const r = await client.query(
    `SELECT indent_number FROM material_indents WHERE company_id=$1 AND indent_number LIKE $2 ORDER BY indent_number DESC LIMIT 1`,
    [companyId, `${prefix}%`]
  );
  const last = r.rows[0]?.indent_number;
  const seq  = last ? parseInt(last.slice(-3)) + 1 : 1;
  return `${prefix}${String(seq).padStart(3, '0')}`;
}

async function loadIndentForAction(id, companyId) {
  const r = await query(
    `SELECT id, project_id, status
     FROM material_indents
     WHERE id = $1 AND company_id = $2`,
    [id, companyId]
  );
  return r.rows[0] || null;
}

// GET /indents
router.get('/', async (req, res) => {
  try {
    const { project_id, status } = req.query;
    let sql = `
      SELECT i.*,
        p.name AS project_name,
        u.name AS raised_by_name,
        a.name AS approved_by_name,
        (SELECT json_agg(ii ORDER BY ii.id) FROM indent_items ii WHERE ii.indent_id = i.id) AS items
      FROM material_indents i
      LEFT JOIN projects p ON i.project_id = p.id
      LEFT JOIN users u ON i.raised_by  = u.id
      LEFT JOIN users a ON i.approved_by = a.id
      WHERE i.company_id = $1
    `;
    let params = [req.user.company_id]; let idx = 2;
    if (project_id) { sql += ` AND i.project_id = $${idx++}`; params.push(project_id); }
    if (status)     { sql += ` AND i.status = $${idx++}`;     params.push(status); }
    ({ sql, params } = appendProjectScope(req, sql, params, 'i'));
    sql += ' ORDER BY i.created_at DESC';
    res.json({ data: (await query(sql, params)).rows });
  } catch (err) {
    console.error('indent GET /:', err.message);
    res.status(500).json({ error: 'Failed to fetch indents' });
  }
});

// GET /indents/:id  (with approval log)
router.get('/:id', async (req, res) => {
  try {
    const r = await query(`
      SELECT i.*,
        p.name AS project_name,
        u.name AS raised_by_name,
        a.name AS approved_by_name,
        (SELECT json_agg(ii ORDER BY ii.id) FROM indent_items ii WHERE ii.indent_id = i.id) AS items,
        (SELECT json_agg(al ORDER BY al.performed_at) FROM approval_logs al
         WHERE al.entity_type = 'indent' AND al.entity_id = i.id) AS approval_history
      FROM material_indents i
      LEFT JOIN projects p ON i.project_id = p.id
      LEFT JOIN users u ON i.raised_by   = u.id
      LEFT JOIN users a ON i.approved_by = a.id
      WHERE i.id = $1 AND i.company_id = $2
    `, [req.params.id, req.user.company_id]);
    if (!r.rows[0]) return res.status(404).json({ error: 'Indent not found' });
    if (!userCanAccessProject(req, r.rows[0].project_id)) {
      return res.status(403).json({ error: 'You do not have access to this project.' });
    }
    res.json({ data: r.rows[0] });
  } catch (err) {
    console.error('indent GET /:id:', err.message);
    res.status(500).json({ error: 'Failed to fetch indent' });
  }
});

// POST /indents  (create with items)
router.post('/', async (req, res) => {
  try {
    const { project_id, required_by, priority, remarks, items } = req.body;
    if (!items?.length) return res.status(400).json({ error: 'At least one item required' });
    if (!userCanAccessProject(req, project_id)) {
      return res.status(403).json({ error: 'You do not have access to this project.' });
    }
    const result = await withTransaction(async (client) => {
      const num    = await nextIndentNumber(client, req.user.company_id);
      const indent = await client.query(
        `INSERT INTO material_indents (company_id, project_id, indent_number, raised_by, required_by, priority, remarks, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'draft') RETURNING *`,
        [req.user.company_id, project_id, num, req.user.id, required_by, priority || 'medium', remarks]
      );
      const id = indent.rows[0].id;
      for (const item of items) {
        await client.query(
          `INSERT INTO indent_items (indent_id, material_category, material_name, quantity, unit, notes)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [id, item.material_category, item.material_name, item.quantity, item.unit, item.notes]
        );
      }
      return indent.rows[0];
    });
    res.status(201).json({ data: result });
  } catch (err) {
    console.error('indent POST /:', err.message);
    res.status(500).json({ error: 'Failed to create indent' });
  }
});

// PATCH /indents/:id/submit  (draft → pending)
router.patch('/:id/submit', async (req, res) => {
  try {
    const indent = await loadIndentForAction(req.params.id, req.user.company_id);
    if (!indent || indent.status !== 'draft') return res.status(400).json({ error: 'Indent not found or not in draft status' });
    if (!userCanAccessProject(req, indent.project_id)) {
      return res.status(403).json({ error: 'You do not have access to this project.' });
    }
    const r = await query(
      `UPDATE material_indents SET status = 'pending', updated_at = NOW()
       WHERE id = $1 AND company_id = $2 AND status = 'draft' RETURNING *`,
      [req.params.id, req.user.company_id]
    );
    if (!r.rows[0]) return res.status(400).json({ error: 'Indent not found or not in draft status' });
    await query(
      `INSERT INTO approval_logs (entity_type, entity_id, action, performed_by, remarks)
       VALUES ('indent', $1, 'submitted', $2, 'Submitted for approval')`,
      [req.params.id, req.user.id]
    );
    notifyIndentSubmitted(req.user.company_id, r.rows[0], req.user.name);
    res.json({ data: r.rows[0] });
  } catch (err) {
    console.error('indent PATCH /:id/submit:', err.message);
    res.status(500).json({ error: 'Failed to submit indent' });
  }
});

// PATCH /indents/:id/approve
router.patch('/:id/approve', authorize('super_admin', 'admin', 'project_manager'), async (req, res) => {
  try {
    const { remarks, approved_quantities } = req.body;
    const indent = await loadIndentForAction(req.params.id, req.user.company_id);
    if (!indent || !['pending', 'escalated'].includes(indent.status)) {
      return res.status(400).json({ error: 'Indent not found or not approvable' });
    }
    if (!userCanAccessProject(req, indent.project_id)) {
      return res.status(403).json({ error: 'You do not have access to this project.' });
    }
    const result = await withTransaction(async (client) => {
      const r = await client.query(
        `UPDATE material_indents SET status = 'approved', approved_by = $1, approval_remarks = $2, updated_at = NOW()
         WHERE id = $3 AND company_id = $4 AND status IN ('pending', 'escalated') RETURNING *`,
        [req.user.id, remarks, req.params.id, req.user.company_id]
      );
      if (!r.rows[0]) throw new Error('Indent not found or not approvable');
      if (approved_quantities && Object.keys(approved_quantities).length) {
        for (const [itemId, qty] of Object.entries(approved_quantities)) {
          await client.query(
            `UPDATE indent_items SET approved_quantity = $1 WHERE id = $2 AND indent_id = $3`,
            [qty, itemId, req.params.id]
          );
        }
      }
      await client.query(
        `INSERT INTO approval_logs (entity_type, entity_id, action, performed_by, remarks)
         VALUES ('indent', $1, 'approved', $2, $3)`,
        [req.params.id, req.user.id, remarks || 'Approved']
      );
      return r.rows[0];
    });
    notifyIndentApproved(req.user.company_id, result, result.raised_by, req.user.name);
    res.json({ data: result });
  } catch (err) {
    console.error('indent PATCH /:id/approve:', err.message);
    res.status(err.message.includes('not approvable') ? 400 : 500).json({ error: err.message });
  }
});

// PATCH /indents/:id/reject
router.patch('/:id/reject', authorize('super_admin', 'admin', 'project_manager'), async (req, res) => {
  try {
    const { remarks } = req.body;
    if (!remarks) return res.status(400).json({ error: 'Rejection reason is required' });
    const indent = await loadIndentForAction(req.params.id, req.user.company_id);
    if (!indent || !['pending', 'escalated'].includes(indent.status)) {
      return res.status(400).json({ error: 'Indent not found or not rejectable' });
    }
    if (!userCanAccessProject(req, indent.project_id)) {
      return res.status(403).json({ error: 'You do not have access to this project.' });
    }
    const r = await query(
      `UPDATE material_indents SET status = 'rejected', approval_remarks = $1, updated_at = NOW()
       WHERE id = $2 AND company_id = $3 AND status IN ('pending', 'escalated') RETURNING *`,
      [remarks, req.params.id, req.user.company_id]
    );
    if (!r.rows[0]) return res.status(400).json({ error: 'Indent not found or not rejectable' });
    await query(
      `INSERT INTO approval_logs (entity_type, entity_id, action, performed_by, remarks)
       VALUES ('indent', $1, 'rejected', $2, $3)`,
      [req.params.id, req.user.id, remarks]
    );
    notifyIndentRejected(req.user.company_id, r.rows[0], r.rows[0].raised_by, req.user.name, remarks);
    res.json({ data: r.rows[0] });
  } catch (err) {
    console.error('indent PATCH /:id/reject:', err.message);
    res.status(500).json({ error: 'Failed to reject indent' });
  }
});

// PATCH /indents/:id/escalate  (PM → escalate to admin/director)
router.patch('/:id/escalate', authorize('super_admin', 'admin', 'project_manager'), async (req, res) => {
  try {
    const { remarks, escalate_to } = req.body;
    const indent = await loadIndentForAction(req.params.id, req.user.company_id);
    if (!indent || indent.status !== 'pending') return res.status(400).json({ error: 'Indent not found or not escalatable' });
    if (!userCanAccessProject(req, indent.project_id)) {
      return res.status(403).json({ error: 'You do not have access to this project.' });
    }
    const r = await query(
      `UPDATE material_indents SET status = 'escalated', escalated_to = $1::uuid, approval_remarks = $2, updated_at = NOW()
       WHERE id = $3 AND company_id = $4 AND status = 'pending' RETURNING *`,
      [escalate_to || null, remarks, req.params.id, req.user.company_id]
    );
    if (!r.rows[0]) return res.status(400).json({ error: 'Indent not found or not escalatable' });
    await query(
      `INSERT INTO approval_logs (entity_type, entity_id, action, performed_by, remarks)
       VALUES ('indent', $1, 'escalated', $2, $3)`,
      [req.params.id, req.user.id, remarks || 'Escalated for higher approval']
    );
    res.json({ data: r.rows[0] });
  } catch (err) {
    console.error('indent PATCH /:id/escalate:', err.message);
    res.status(500).json({ error: 'Failed to escalate indent' });
  }
});

// DELETE /indents/:id  (admin only, draft/rejected only)
router.delete('/:id', authorize('super_admin', 'admin'), async (req, res) => {
  try {
    const indent = await loadIndentForAction(req.params.id, req.user.company_id);
    if (!indent || !['draft', 'rejected'].includes(indent.status)) {
      return res.status(400).json({ error: 'Cannot delete - indent not found or already in progress' });
    }
    if (!userCanAccessProject(req, indent.project_id)) {
      return res.status(403).json({ error: 'You do not have access to this project.' });
    }
    const r = await query(
      `DELETE FROM material_indents WHERE id = $1 AND company_id = $2 AND status IN ('draft', 'rejected') RETURNING id`,
      [req.params.id, req.user.company_id]
    );
    if (!r.rows[0]) return res.status(400).json({ error: 'Cannot delete — indent not found or already in progress' });
    res.json({ message: 'Indent deleted' });
  } catch (err) {
    console.error('indent DELETE /:id:', err.message);
    res.status(500).json({ error: 'Failed to delete indent' });
  }
});

module.exports = router;
