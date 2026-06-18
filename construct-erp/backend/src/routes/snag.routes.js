// backend/src/routes/snag.routes.js
const express = require('express');
const router  = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const { notifySnagRaised, notifySnagClosed } = require('../services/notif.helper');

const db = () => require('../config/database').pool;
const { withTransaction } = require('../config/database');

const EDITORS  = ['project_manager', 'site_engineer', 'admin', 'super_admin'];
const MANAGERS = ['project_manager', 'admin', 'super_admin'];
const ADMINS   = ['admin', 'super_admin'];

router.use(authenticate);

/* ── Auto-migrate ──────────────────────────────────────────────────────── */
(async () => {
  const safe = async (sql) => { try { await db().query(sql); } catch {} };
  await safe(`CREATE UNIQUE INDEX IF NOT EXISTS uq_snag_items_code ON snag_items(project_id, snag_code)`);
})();

// ── GET /snags/stats — KPI counts (must be before /:id) ──────────────────
router.get('/stats', async (req, res) => {
  try {
    const { project_id } = req.query;
    const params = [];
    let where = '';
    if (project_id) { params.push(project_id); where = `WHERE project_id = $1`; }

    const { rows } = await db().query(`
      SELECT
        COUNT(*)                                        AS total,
        COUNT(*) FILTER (WHERE status = 'open')        AS open,
        COUNT(*) FILTER (WHERE status = 'in_progress') AS in_progress,
        COUNT(*) FILTER (WHERE status = 'rectified')   AS rectified,
        COUNT(*) FILTER (WHERE status = 'closed')      AS closed,
        COUNT(*) FILTER (WHERE priority = 'critical')  AS critical,
        COUNT(*) FILTER (WHERE priority = 'high')      AS high,
        COUNT(*) FILTER (WHERE due_date < NOW() AND status NOT IN ('closed')) AS overdue
      FROM snag_items
      ${where}
    `, params);

    res.json({ data: rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /snags — list with filters ──────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { project_id, status, trade, priority, zone, search } = req.query;
    const conditions = [];
    const params     = [];

    if (project_id) { params.push(project_id); conditions.push(`s.project_id = $${params.length}`); }
    if (status)     { params.push(status);      conditions.push(`s.status = $${params.length}`); }
    if (trade)      { params.push(trade);        conditions.push(`s.trade = $${params.length}`); }
    if (priority)   { params.push(priority);     conditions.push(`s.priority = $${params.length}`); }
    if (zone)       { params.push(`%${zone}%`);  conditions.push(`s.zone ILIKE $${params.length}`); }
    if (search)     {
      params.push(`%${search}%`);
      conditions.push(`(s.title ILIKE $${params.length} OR s.snag_code ILIKE $${params.length} OR s.description ILIKE $${params.length})`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const { rows } = await db().query(`
      SELECT
        s.*,
        p.name                AS project_name,
        u_raised.name         AS raised_by_name,
        u_assigned.name       AS assigned_user_name,
        u_qa.name             AS qa_signed_off_by_name,
        u_closed.name         AS closed_by_name
      FROM snag_items s
      LEFT JOIN projects  p          ON p.id = s.project_id
      LEFT JOIN users     u_raised   ON u_raised.id   = s.raised_by
      LEFT JOIN users     u_assigned ON u_assigned.id = s.assigned_user_id
      LEFT JOIN users     u_qa       ON u_qa.id       = s.qa_signed_off_by
      LEFT JOIN users     u_closed   ON u_closed.id   = s.closed_by
      ${where}
      ORDER BY
        CASE s.priority WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END,
        s.created_at DESC
    `, params);

    res.json({ data: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /snags/:id — single snag ────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const { rows } = await db().query(`
      SELECT s.*,
        p.name            AS project_name,
        u_raised.name     AS raised_by_name,
        u_assigned.name   AS assigned_user_name,
        u_qa.name         AS qa_signed_off_by_name,
        u_closed.name     AS closed_by_name
      FROM snag_items s
      LEFT JOIN projects p          ON p.id = s.project_id
      LEFT JOIN users    u_raised   ON u_raised.id   = s.raised_by
      LEFT JOIN users    u_assigned ON u_assigned.id = s.assigned_user_id
      LEFT JOIN users    u_qa       ON u_qa.id       = s.qa_signed_off_by
      LEFT JOIN users    u_closed   ON u_closed.id   = s.closed_by
      WHERE s.id = $1
    `, [req.params.id]);

    if (!rows.length) return res.status(404).json({ error: 'Snag not found' });
    res.json({ data: rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /snags — create ─────────────────────────────────────────────────
router.post('/', authorize(EDITORS), async (req, res) => {
  try {
    const {
      project_id, title, description, zone, trade, priority,
      photos, due_date, assigned_to_name, assigned_user_id,
    } = req.body;

    if (!project_id) return res.status(400).json({ error: 'project_id is required' });
    if (!title)      return res.status(400).json({ error: 'title is required' });

    // Auto-generate snag_code: SNF-001
    const rows = await withTransaction(async (client) => {
      const { rows: seqRows } = await client.query(
        `SELECT COALESCE(MAX(CAST(REGEXP_REPLACE(snag_code, '^SNF-', '') AS INTEGER)), 0) AS last_seq
         FROM snag_items WHERE project_id = $1 AND snag_code LIKE 'SNF-%'`,
        [project_id]
      );
      const snag_code = `SNF-${String(parseInt(seqRows[0].last_seq) + 1).padStart(3, '0')}`;

      const { rows: ins } = await client.query(`
        INSERT INTO snag_items
          (project_id, snag_code, title, description, zone, trade, priority,
           photos, due_date, assigned_to_name, assigned_user_id, raised_by)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
        RETURNING *
      `, [
        project_id, snag_code, title, description || null,
        zone || null, trade || 'other', priority || 'medium',
        JSON.stringify(photos || []),
        due_date || null, assigned_to_name || null,
        assigned_user_id || null, req.user.id,
      ]);
      return ins;
    });

    // Notify assigned user about snag
    notifySnagRaised(req.user.company_id, rows[0], req.user.name);
    res.status(201).json({ data: rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ── PUT /snags/:id — full update ─────────────────────────────────────────
router.put('/:id', authorize(EDITORS), async (req, res) => {
  try {
    const {
      title, description, zone, trade, priority, photos,
      due_date, assigned_to_name, assigned_user_id, rectification_notes,
    } = req.body;

    const { rows } = await db().query(`
      UPDATE snag_items SET
        title                = COALESCE($1, title),
        description          = $2,
        zone                 = $3,
        trade                = COALESCE($4, trade),
        priority             = COALESCE($5, priority),
        photos               = COALESCE($6::jsonb, photos),
        due_date             = $7,
        assigned_to_name     = $8,
        assigned_user_id     = $9,
        rectification_notes  = $10,
        updated_at           = NOW()
      WHERE id = $11
      RETURNING *
    `, [
      title || null, description || null, zone || null,
      trade || null, priority || null,
      photos ? JSON.stringify(photos) : null,
      due_date || null, assigned_to_name || null,
      assigned_user_id || null, rectification_notes || null,
      req.params.id,
    ]);

    if (!rows.length) return res.status(404).json({ error: 'Snag not found' });
    res.json({ data: rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ── PATCH /snags/:id/status — status transition ──────────────────────────
router.patch('/:id/status', authorize(EDITORS), async (req, res) => {
  try {
    const { status, rectification_notes } = req.body;
    const allowed = ['open', 'in_progress', 'rectified', 'closed'];
    if (!allowed.includes(status)) {
      return res.status(400).json({ error: `status must be one of: ${allowed.join(', ')}` });
    }

    const closing = status === 'closed';

    const { rows } = await db().query(`
      UPDATE snag_items SET
        status               = $1,
        rectification_notes  = COALESCE($2, rectification_notes),
        closed_by            = CASE WHEN $3 THEN $4::uuid ELSE closed_by END,
        closed_at            = CASE WHEN $3 THEN NOW() ELSE closed_at END,
        updated_at           = NOW()
      WHERE id = $5
      RETURNING *
    `, [status, rectification_notes || null, closing, req.user.id, req.params.id]);

    if (!rows.length) return res.status(404).json({ error: 'Snag not found' });
    // Notify raiser when snag is closed
    if (status === 'closed') notifySnagClosed(req.user.company_id, rows[0], req.user.name);
    res.json({ data: rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ── PATCH /snags/:id/qa-signoff — QA close ──────────────────────────────
router.patch('/:id/qa-signoff', authorize(MANAGERS), async (req, res) => {
  try {
    const { qa_remarks } = req.body;

    const { rows } = await db().query(`
      UPDATE snag_items SET
        status           = 'closed',
        qa_remarks       = $1,
        qa_signed_off_by = $2,
        qa_signed_off_at = NOW(),
        closed_by        = $2,
        closed_at        = NOW(),
        updated_at       = NOW()
      WHERE id = $3
      RETURNING *
    `, [qa_remarks || null, req.user.id, req.params.id]);

    if (!rows.length) return res.status(404).json({ error: 'Snag not found' });
    res.json({ data: rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /snags/:id ────────────────────────────────────────────────────
router.delete('/:id', authorize(ADMINS), async (req, res) => {
  try {
    const { rows } = await db().query(
      `DELETE FROM snag_items WHERE id = $1 RETURNING id`, [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Snag not found' });
    res.json({ message: 'Deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
