// gfc.routes.js — GFC (Good For Construction) Drawing Master Log
const express = require('express');
const router  = express.Router();
const { query } = require('../config/database');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);

// ── Self-migrating schema ────────────────────────────────────────────────────
let schemaReady = false;
async function ensureSchema() {
  if (schemaReady) return;
  await query(`
    CREATE TABLE IF NOT EXISTS gfc_drawings (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
      project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
      drawing_number VARCHAR(120) NOT NULL,
      title VARCHAR(255) NOT NULL,
      discipline VARCHAR(60),
      tower_block VARCHAR(100),
      floor_zone VARCHAR(100),
      current_revision VARCHAR(12) DEFAULT 'R0',
      gfc_date DATE,
      received_date DATE,
      issued_by VARCHAR(150),
      transmittal_ref VARCHAR(120),
      copies_received INT DEFAULT 1,
      soft_copy BOOLEAN DEFAULT true,
      status VARCHAR(30) DEFAULT 'current',
      remarks TEXT,
      created_by UUID REFERENCES users(id),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (project_id, drawing_number)
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS gfc_drawing_revisions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      drawing_id UUID REFERENCES gfc_drawings(id) ON DELETE CASCADE,
      revision VARCHAR(12) NOT NULL,
      gfc_date DATE,
      received_date DATE,
      transmittal_ref VARCHAR(120),
      issued_by VARCHAR(150),
      change_description TEXT,
      created_by UUID REFERENCES users(id),
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  schemaReady = true;
}
router.use(async (req, res, next) => {
  try { await ensureSchema(); next(); } catch (err) { next(err); }
});

const VALID_STATUSES = ['current', 'superseded', 'on_hold', 'cancelled'];

// ── GET /gfc/drawings — master log list ─────────────────────────────────────
router.get('/drawings', async (req, res) => {
  try {
    const { project_id, discipline, status, search } = req.query;
    const conds  = ['d.company_id = $1'];
    const params = [req.user.company_id];
    if (project_id) { params.push(project_id);   conds.push(`d.project_id = $${params.length}`); }
    if (discipline) { params.push(discipline);   conds.push(`d.discipline = $${params.length}`); }
    if (status)     { params.push(status);       conds.push(`d.status = $${params.length}`); }
    if (search) {
      params.push(`%${search}%`);
      conds.push(`(d.drawing_number ILIKE $${params.length} OR d.title ILIKE $${params.length} OR d.transmittal_ref ILIKE $${params.length})`);
    }
    const r = await query(
      `SELECT d.*, p.name AS project_name, u.name AS created_by_name,
              (SELECT COUNT(*) FROM gfc_drawing_revisions rv WHERE rv.drawing_id = d.id) AS revision_count
       FROM gfc_drawings d
       JOIN projects p ON d.project_id = p.id
       LEFT JOIN users u ON d.created_by = u.id
       WHERE ${conds.join(' AND ')}
       ORDER BY d.drawing_number ASC`,
      params
    );
    res.json({ data: r.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /gfc/stats — KPI summary ─────────────────────────────────────────────
router.get('/stats', async (req, res) => {
  try {
    const { project_id } = req.query;
    const params = [req.user.company_id];
    let cond = 'company_id = $1';
    if (project_id) { params.push(project_id); cond += ` AND project_id = $${params.length}`; }
    const r = await query(
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE status = 'current')::int    AS current,
              COUNT(*) FILTER (WHERE status = 'superseded')::int AS superseded,
              COUNT(*) FILTER (WHERE status = 'on_hold')::int    AS on_hold,
              COUNT(DISTINCT discipline)::int                    AS disciplines
       FROM gfc_drawings WHERE ${cond}`,
      params
    );
    res.json({ data: r.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /gfc/drawings — register a drawing (logs first revision) ───────────
router.post('/drawings', async (req, res) => {
  try {
    const {
      project_id, drawing_number, title, discipline, tower_block, floor_zone,
      current_revision, gfc_date, received_date, issued_by, transmittal_ref,
      copies_received, soft_copy, remarks,
    } = req.body;
    if (!project_id)      return res.status(400).json({ error: 'project_id required' });
    if (!drawing_number)  return res.status(400).json({ error: 'drawing_number required' });
    if (!title)           return res.status(400).json({ error: 'title required' });

    const proj = await query('SELECT id FROM projects WHERE id = $1 AND company_id = $2', [project_id, req.user.company_id]);
    if (!proj.rows.length) return res.status(404).json({ error: 'Project not found' });

    const rev = String(current_revision || 'R0').trim().toUpperCase();
    const r = await query(
      `INSERT INTO gfc_drawings (
         company_id, project_id, drawing_number, title, discipline, tower_block, floor_zone,
         current_revision, gfc_date, received_date, issued_by, transmittal_ref,
         copies_received, soft_copy, status, remarks, created_by
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'current',$15,$16)
       RETURNING *`,
      [req.user.company_id, project_id, String(drawing_number).trim(), title, discipline || null,
       tower_block || null, floor_zone || null, rev, gfc_date || null, received_date || null,
       issued_by || null, transmittal_ref || null, parseInt(copies_received) || 1,
       soft_copy !== false, remarks || null, req.user.id]
    );
    await query(
      `INSERT INTO gfc_drawing_revisions (drawing_id, revision, gfc_date, received_date, transmittal_ref, issued_by, change_description, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [r.rows[0].id, rev, gfc_date || null, received_date || null, transmittal_ref || null, issued_by || null, 'Initial GFC issue', req.user.id]
    );
    res.status(201).json({ data: r.rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Drawing number already exists for this project' });
    res.status(500).json({ error: err.message });
  }
});

// ── PATCH /gfc/drawings/:id — edit drawing master fields ────────────────────
router.patch('/drawings/:id', async (req, res) => {
  try {
    const allowed = ['title','discipline','tower_block','floor_zone','gfc_date','received_date',
                     'issued_by','transmittal_ref','copies_received','soft_copy','status','remarks','drawing_number'];
    const sets   = [];
    const params = [req.params.id, req.user.company_id];
    let i = 3;
    for (const f of allowed) {
      if (req.body[f] === undefined) continue;
      if (f === 'status' && !VALID_STATUSES.includes(req.body.status))
        return res.status(400).json({ error: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}` });
      sets.push(`${f} = $${i++}`);
      params.push(f === 'copies_received' ? (parseInt(req.body[f]) || 1) : req.body[f]);
    }
    if (!sets.length) return res.status(400).json({ error: 'Nothing to update' });
    sets.push('updated_at = NOW()');
    const r = await query(
      `UPDATE gfc_drawings SET ${sets.join(', ')} WHERE id = $1 AND company_id = $2 RETURNING *`,
      params
    );
    if (!r.rows[0]) return res.status(404).json({ error: 'Drawing not found' });
    res.json({ data: r.rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Drawing number already exists for this project' });
    res.status(500).json({ error: err.message });
  }
});

// ── POST /gfc/drawings/:id/revisions — new GFC revision (supersedes current) ─
router.post('/drawings/:id/revisions', async (req, res) => {
  try {
    const { revision, gfc_date, received_date, transmittal_ref, issued_by, change_description } = req.body;
    if (!revision) return res.status(400).json({ error: 'revision required' });

    const own = await query('SELECT id, current_revision FROM gfc_drawings WHERE id = $1 AND company_id = $2', [req.params.id, req.user.company_id]);
    if (!own.rows.length) return res.status(404).json({ error: 'Drawing not found' });

    const rev = String(revision).trim().toUpperCase();
    await query(
      `INSERT INTO gfc_drawing_revisions (drawing_id, revision, gfc_date, received_date, transmittal_ref, issued_by, change_description, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [req.params.id, rev, gfc_date || null, received_date || null, transmittal_ref || null, issued_by || null, change_description || null, req.user.id]
    );
    const r = await query(
      `UPDATE gfc_drawings
       SET current_revision = $3, gfc_date = COALESCE($4, gfc_date), received_date = COALESCE($5, received_date),
           transmittal_ref = COALESCE($6, transmittal_ref), issued_by = COALESCE($7, issued_by),
           status = 'current', updated_at = NOW()
       WHERE id = $1 AND company_id = $2 RETURNING *`,
      [req.params.id, req.user.company_id, rev, gfc_date || null, received_date || null, transmittal_ref || null, issued_by || null]
    );
    res.status(201).json({ data: r.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /gfc/drawings/:id/revisions — revision history ──────────────────────
router.get('/drawings/:id/revisions', async (req, res) => {
  try {
    const own = await query('SELECT id FROM gfc_drawings WHERE id = $1 AND company_id = $2', [req.params.id, req.user.company_id]);
    if (!own.rows.length) return res.status(404).json({ error: 'Drawing not found' });
    const r = await query(
      `SELECT rv.*, u.name AS created_by_name
       FROM gfc_drawing_revisions rv
       LEFT JOIN users u ON rv.created_by = u.id
       WHERE rv.drawing_id = $1
       ORDER BY rv.created_at DESC`,
      [req.params.id]
    );
    res.json({ data: r.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /gfc/drawings/:id ─────────────────────────────────────────────────
router.delete('/drawings/:id', async (req, res) => {
  try {
    const r = await query('DELETE FROM gfc_drawings WHERE id = $1 AND company_id = $2 RETURNING id', [req.params.id, req.user.company_id]);
    if (!r.rows[0]) return res.status(404).json({ error: 'Drawing not found' });
    res.json({ message: 'Drawing deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
