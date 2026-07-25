// src/routes/drawing.routes.js — Project Drawings register
const express = require('express');
const { authenticate } = require('../middleware/auth');
const { query } = require('../config/database');
const { runSchemaInit } = require('../utils/schemaInit');
const router = express.Router();

runSchemaInit('project_drawings_table', async () => {
  await query(`
    CREATE TABLE IF NOT EXISTS project_drawings (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id    UUID NOT NULL,
      project_id    UUID REFERENCES projects(id) ON DELETE SET NULL,
      drawing_no    VARCHAR(100),
      title         TEXT NOT NULL,
      discipline    TEXT,
      revision      VARCHAR(20),
      status        TEXT NOT NULL DEFAULT 'issued',
      file_url      TEXT,
      file_name     TEXT,
      issued_date   DATE,
      uploaded_by   UUID REFERENCES users(id) ON DELETE SET NULL,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_project_drawings_company ON project_drawings(company_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_project_drawings_project ON project_drawings(project_id)`);
});

// GET / — list drawings for company (filter: project_id, discipline, status)
router.get('/', authenticate, async (req, res) => {
  try {
    const { project_id, discipline, status } = req.query;
    const conditions = ['d.company_id = $1', "d.status != 'deleted'"];
    const params = [req.user.company_id];
    if (project_id) { params.push(project_id); conditions.push(`d.project_id = $${params.length}`); }
    if (discipline)  { params.push(discipline);  conditions.push(`d.discipline = $${params.length}`); }
    if (status)      { params.push(status);      conditions.push(`d.status = $${params.length}`); }

    const result = await query(`
      SELECT d.*,
             p.name AS project_name,
             u.name AS uploaded_by_name
      FROM project_drawings d
      LEFT JOIN projects p ON p.id = d.project_id
      LEFT JOIN users u    ON u.id = d.uploaded_by
      WHERE ${conditions.join(' AND ')}
      ORDER BY d.created_at DESC
    `, params);
    res.json({ data: result.rows });
  } catch (err) {
    console.error('drawing list error', err);
    res.status(500).json({ error: 'Failed to fetch drawings' });
  }
});

// POST / — create drawing
router.post('/', authenticate, async (req, res) => {
  try {
    const { project_id, drawing_no, title, discipline, revision, status, file_url, file_name, issued_date } = req.body;
    if (!title) return res.status(400).json({ error: 'title is required' });
    const result = await query(`
      INSERT INTO project_drawings (company_id, project_id, drawing_no, title, discipline, revision, status, file_url, file_name, issued_date, uploaded_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
      RETURNING *
    `, [req.user.company_id, project_id || null, drawing_no || null, title, discipline || null,
        revision || null, status || 'issued', file_url || null, file_name || null,
        issued_date || null, req.user.id]);
    res.status(201).json({ data: result.rows[0] });
  } catch (err) {
    console.error('drawing create error', err);
    res.status(500).json({ error: 'Failed to create drawing' });
  }
});

// PUT /:id — update drawing
router.put('/:id', authenticate, async (req, res) => {
  try {
    const { drawing_no, title, discipline, revision, status, file_url, file_name, issued_date, project_id } = req.body;
    const result = await query(`
      UPDATE project_drawings
      SET drawing_no=$1, title=$2, discipline=$3, revision=$4, status=$5,
          file_url=$6, file_name=$7, issued_date=$8, project_id=$9, updated_at=NOW()
      WHERE id=$10 AND company_id=$11
      RETURNING *
    `, [drawing_no || null, title, discipline || null, revision || null, status || 'issued',
        file_url || null, file_name || null, issued_date || null, project_id || null,
        req.params.id, req.user.company_id]);
    if (!result.rows.length) return res.status(404).json({ error: 'Drawing not found' });
    res.json({ data: result.rows[0] });
  } catch (err) {
    console.error('drawing update error', err);
    res.status(500).json({ error: 'Failed to update drawing' });
  }
});

// DELETE /:id — soft delete
router.delete('/:id', authenticate, async (req, res) => {
  try {
    await query(
      `UPDATE project_drawings SET status='deleted', updated_at=NOW() WHERE id=$1 AND company_id=$2`,
      [req.params.id, req.user.company_id]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('drawing delete error', err);
    res.status(500).json({ error: 'Failed to delete drawing' });
  }
});

module.exports = router;
