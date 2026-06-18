const express = require('express');
const router = express.Router();
const multer = require('multer');
const { authenticate, authorize } = require('../middleware/auth');
const { query } = require('../config/database');
const { extractMBItems } = require('../services/measurementExtraction.service');
const { loadProjectScope, appendProjectScope } = require('../middleware/projectScope');

const upload = multer({ dest: 'uploads/' });

router.use(authenticate);
router.use(loadProjectScope);

router.get('/', async (req, res) => {
  const { project_id, boq_item_id, status } = req.query;
  let sql = `SELECT m.*, b.description as boq_description, b.unit, b.sr_no, p.name as project_name,
               u1.name as submitted_by_name, u2.name as qs_approved_by_name
             FROM measurements m
             JOIN boq_items b ON m.boq_item_id = b.id
             JOIN projects p ON m.project_id = p.id
             LEFT JOIN users u1 ON m.submitted_by = u1.id
             LEFT JOIN users u2 ON m.qs_approved_by = u2.id
             WHERE p.company_id = $1`;
  let params = [req.user.company_id];
  let i = 2;
  if (project_id) { sql += ` AND m.project_id = $${i++}`; params.push(project_id); }
  if (boq_item_id) { sql += ` AND m.boq_item_id = $${i++}`; params.push(boq_item_id); }
  if (status) { sql += ` AND m.status = $${i++}`; params.push(status); }
  ({ sql, params } = appendProjectScope(req, sql, params, 'm'));
  sql += ' ORDER BY m.entry_date DESC, m.created_at DESC';
  const result = await query(sql, params);
  res.json({ data: result.rows });
});

router.post('/', async (req, res) => {
  const { project_id, boq_item_id, mb_number, entry_date, description, location,
          nos, length, breadth, height, deduction, drawing_ref, site_photos, remarks } = req.body;

  // Auto-calculate quantity
  const quantity = (nos || 1) * (length || 1) * (breadth || 1) * (height || 1);
  const net_quantity = quantity - (deduction || 0);

  const result = await query(
    `INSERT INTO measurements (project_id,boq_item_id,mb_number,entry_date,description,location,
       nos,length,breadth,height,quantity,deduction,net_quantity,drawing_ref,site_photos,remarks,submitted_by,status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,'submitted') RETURNING *`,
    [project_id,boq_item_id,mb_number,entry_date,description,location,
     nos||1,length,breadth,height,
     parseFloat(quantity.toFixed(3)), deduction||0, parseFloat(net_quantity.toFixed(3)),
     drawing_ref,site_photos||[],remarks,req.user.id]
  );
  res.status(201).json({ data: result.rows[0], calculated_qty: parseFloat(quantity.toFixed(3)) });
});

// PATCH /:id/approve
router.patch('/:id/approve', authorize('qs_engineer','project_manager','admin'), async (req, res) => {
  try {
    const { action, remarks } = req.body;
    const role = req.user.role;

    // Fetch current measurement to validate status
    const current = await query('SELECT * FROM measurements WHERE id = $1', [req.params.id]);
    if (!current.rows[0]) return res.status(404).json({ error: 'Measurement not found' });
    const mb = current.rows[0];

    let sql, params;

    if (role === 'qs_engineer' || role === 'admin') {
      // QS can only act on 'submitted' entries
      if (mb.status !== 'submitted') {
        return res.status(400).json({ error: `QS can only review entries in 'submitted' status. Current: '${mb.status}'` });
      }
      if (action === 'approve') {
        sql = `UPDATE measurements SET status='qs_approved', qs_approved_by=$1, qs_approved_at=NOW(), updated_at=NOW() WHERE id=$2 RETURNING *`;
        params = [req.user.id, req.params.id];
      } else {
        sql = `UPDATE measurements SET status='rejected', rejection_reason=$1, updated_at=NOW() WHERE id=$2 RETURNING *`;
        params = [remarks || 'Rejected by QS', req.params.id];
      }
    } else if (role === 'project_manager') {
      // PM can only act on 'qs_approved' entries
      if (mb.status !== 'qs_approved') {
        return res.status(400).json({ error: `PM can only review entries in 'qs_approved' status. Current: '${mb.status}'` });
      }
      if (action === 'approve') {
        sql = `UPDATE measurements SET status='pm_approved', pm_approved_by=$1, pm_approved_at=NOW(), updated_at=NOW() WHERE id=$2 RETURNING *`;
        params = [req.user.id, req.params.id];
      } else {
        sql = `UPDATE measurements SET status='rejected', rejection_reason=$1, updated_at=NOW() WHERE id=$2 RETURNING *`;
        params = [remarks || 'Rejected by PM', req.params.id];
      }
    } else {
      return res.status(403).json({ error: 'Not authorized for this action' });
    }

    const result = await query(sql, params);
    res.json({ message: `Measurement ${action}d successfully.`, data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /:id — edit a draft or rejected measurement entry
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const check = await query('SELECT status FROM measurements WHERE id = $1', [id]);
    if (check.rowCount === 0) return res.status(404).json({ error: 'Measurement not found' });

    const {
      boq_item_id, mb_number, entry_date, description, location,
      drawing_ref, remarks, nos, length, breadth, height, deduction,
    } = req.body;

    const net_quantity = Math.max(
      0,
      parseFloat(nos || 1) * parseFloat(length || 0) *
      parseFloat(breadth || 0) * parseFloat(height || 0) -
      parseFloat(deduction || 0)
    );

    const result = await query(
      `UPDATE measurements SET
        boq_item_id = COALESCE($1, boq_item_id),
        mb_number   = COALESCE($2, mb_number),
        entry_date  = COALESCE($3, entry_date),
        description = COALESCE($4, description),
        location    = COALESCE($5, location),
        drawing_ref = $6,
        remarks     = $7,
        nos         = $8,
        length      = $9,
        breadth     = $10,
        height      = $11,
        deduction   = $12,
        net_quantity = $13,
        updated_at  = NOW()
       WHERE id = $14
       RETURNING *`,
      [
        boq_item_id || null, mb_number || null, entry_date || null,
        description || null, location || null, drawing_ref || null, remarks || null,
        parseFloat(nos || 1), parseFloat(length || 0), parseFloat(breadth || 0),
        parseFloat(height || 0), parseFloat(deduction || 0), net_quantity, id,
      ]
    );

    res.json({ message: 'Measurement updated', data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /:id
router.delete('/:id', async (req, res) => {
  try {
    const result = await query('DELETE FROM measurements WHERE id = $1 RETURNING *', [req.params.id]);
    if (result.rowCount === 0) return res.status(404).json({ error: 'Measurement not found' });
    res.json({ message: 'Measurement deleted successfully', data: result.rows[0] });
  } catch (err) {
    // If there is a foreign key constraint, the DB will throw an error
    if (err.code === '23503') {
      return res.status(400).json({ error: 'Cannot delete: This measurement is already linked to an RA Bill or Certification.' });
    }
    res.status(500).json({ error: err.message });
  }
});

// POST /import
router.post('/import', upload.single('file'), async (req, res) => {
  const { project_id } = req.body;
  
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  if (!project_id) return res.status(400).json({ error: 'Project ID is required for alignment' });

  try {
    const items = await extractMBItems(req.file.path);
    if (!items.length) return res.status(400).json({ error: 'No valid records found in template' });

    let imported = 0;
    let skipped = 0;

    for (const item of items) {
      // 1. Resolve BOQ Item ID from Sr No
      const boqMatch = await query(
        `SELECT id FROM boq_items WHERE project_id = $1 AND sr_no = $2 LIMIT 1`,
        [project_id, item.sr_no]
      );

      if (!boqMatch.rows.length) {
        skipped++;
        continue;
      }

      const boq_id = boqMatch.rows[0].id;
      const mb_number = `MB-UP-${Math.random().toString(36).substr(2, 5).toUpperCase()}`;
      
      const quantity = (item.nos || 1) * (item.length || 1) * (item.breadth || 1) * (item.height || 1);
      const net_quantity = quantity - (item.deduction || 0);

      await query(
        `INSERT INTO measurements (
          project_id, boq_item_id, mb_number, entry_date, description, location,
          nos, length, breadth, height, quantity, deduction, net_quantity, 
          submitted_by, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 'submitted')`,
        [
          project_id, boq_id, mb_number, item.entry_date || new Date(), 
          item.description || 'Imported Measurement', item.location || 'Site',
          item.nos, item.length, item.breadth, item.height,
          parseFloat(quantity.toFixed(3)), item.deduction, parseFloat(net_quantity.toFixed(3)),
          req.user.id
        ]
      );
      imported++;
    }

    res.json({ 
      success: true, 
      message: `Import Complete: ${imported} entries created, ${skipped} skipped (BOQ Sr. No. mismatch).` 
    });
  } catch (err) {
    console.error('[MB Import Error]:', err);
    res.status(500).json({ error: 'Failed to process MB import' });
  }
});

module.exports = router;
