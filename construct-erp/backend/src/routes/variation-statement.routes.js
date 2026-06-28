// variation-statement.routes.js — Client-facing Variation Statements
const express = require('express');
const router  = express.Router();
const { query } = require('../config/database');
const { authenticate } = require('../middleware/auth');
const { sendMail } = require('../services/mail.service');

router.use(authenticate);

// ── Self-migrating schema ─────────────────────────────────────────────────────
let schemaReady = false;
async function ensureSchema() {
  if (schemaReady) return;
  await query(`
    CREATE TABLE IF NOT EXISTS variation_statements (
      id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id        UUID REFERENCES companies(id) ON DELETE CASCADE,
      project_id        UUID REFERENCES projects(id),
      wo_number         VARCHAR(100) DEFAULT '',
      vendor_name       VARCHAR(200) DEFAULT '',
      package_description TEXT DEFAULT '',
      wo_value_excl_gst NUMERIC(15,2) DEFAULT 0,
      gst_rate          NUMERIC(5,2)  DEFAULT 18,
      status            VARCHAR(20)   DEFAULT 'draft',
      submitted_at      TIMESTAMPTZ,
      remarks           TEXT DEFAULT '',
      created_by        UUID REFERENCES users(id),
      created_at        TIMESTAMPTZ   DEFAULT NOW(),
      updated_at        TIMESTAMPTZ   DEFAULT NOW()
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS variation_statement_items (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      statement_id  UUID REFERENCES variation_statements(id) ON DELETE CASCADE,
      sl_no         VARCHAR(60)  DEFAULT '',
      item_code     VARCHAR(60)  DEFAULT '',
      description   TEXT         DEFAULT '',
      unit          VARCHAR(30)  DEFAULT '',
      rate          NUMERIC(12,2) DEFAULT 0,
      wo_qty        NUMERIC(14,3) DEFAULT 0,
      amendment_qty NUMERIC(14,3) DEFAULT 0,
      sort_order    INT           DEFAULT 0
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS variation_statement_nt_items (
      id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      statement_id UUID REFERENCES variation_statements(id) ON DELETE CASCADE,
      sl_no        VARCHAR(60)  DEFAULT '',
      description  TEXT         DEFAULT '',
      unit         VARCHAR(30)  DEFAULT '',
      rate         NUMERIC(12,2) DEFAULT 0,
      qty          NUMERIC(14,3) DEFAULT 0,
      sort_order   INT           DEFAULT 0
    )
  `);
  schemaReady = true;
}
router.use(async (req, res, next) => {
  try { await ensureSchema(); next(); } catch (err) { next(err); }
});

// ── GET / — list statements ───────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { project_id } = req.query;
    const params = [req.user.company_id];
    let cond = 'vs.company_id = $1';
    if (project_id) { params.push(project_id); cond += ` AND vs.project_id = $${params.length}`; }
    const r = await query(
      `SELECT vs.*, p.name AS project_name,
              (SELECT COALESCE(SUM(i.amendment_qty * i.rate), 0)
               FROM variation_statement_items i WHERE i.statement_id = vs.id) AS amendment_total,
              (SELECT COALESCE(SUM(i.wo_qty * i.rate), 0)
               FROM variation_statement_items i WHERE i.statement_id = vs.id) AS wo_total,
              (SELECT COALESCE(SUM(n.qty * n.rate), 0)
               FROM variation_statement_nt_items n WHERE n.statement_id = vs.id) AS nt_total,
              (SELECT COUNT(*) FROM variation_statement_items i WHERE i.statement_id = vs.id) AS item_count,
              (SELECT COUNT(*) FROM variation_statement_nt_items n WHERE n.statement_id = vs.id) AS nt_count
       FROM variation_statements vs
       LEFT JOIN projects p ON p.id = vs.project_id
       WHERE ${cond}
       ORDER BY vs.created_at DESC`,
      params
    );
    res.json({ data: r.rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── POST / — create ───────────────────────────────────────────────────────────
router.post('/', async (req, res) => {
  try {
    const { project_id, wo_number, vendor_name, package_description, wo_value_excl_gst, gst_rate, remarks } = req.body;
    if (!project_id) return res.status(400).json({ error: 'project_id required' });
    const r = await query(
      `INSERT INTO variation_statements
         (company_id, project_id, wo_number, vendor_name, package_description, wo_value_excl_gst, gst_rate, remarks, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [req.user.company_id, project_id, wo_number || '', vendor_name || '', package_description || '',
       wo_value_excl_gst || 0, gst_rate || 18, remarks || '', req.user.id]
    );
    res.status(201).json({ data: r.rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── GET /:id — detail with items ─────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const s = await query(
      `SELECT vs.*, p.name AS project_name FROM variation_statements vs
       LEFT JOIN projects p ON p.id = vs.project_id
       WHERE vs.id = $1 AND vs.company_id = $2`,
      [req.params.id, req.user.company_id]
    );
    if (!s.rows.length) return res.status(404).json({ error: 'Not found' });
    const items   = await query('SELECT * FROM variation_statement_items    WHERE statement_id=$1 ORDER BY sort_order, id', [req.params.id]);
    const ntItems = await query('SELECT * FROM variation_statement_nt_items WHERE statement_id=$1 ORDER BY sort_order, id', [req.params.id]);
    res.json({ data: { ...s.rows[0], items: items.rows, nt_items: ntItems.rows } });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── PATCH /:id — update header + replace all items ───────────────────────────
router.patch('/:id', async (req, res) => {
  try {
    const own = await query('SELECT id FROM variation_statements WHERE id=$1 AND company_id=$2', [req.params.id, req.user.company_id]);
    if (!own.rows.length) return res.status(404).json({ error: 'Not found' });

    const { project_id, wo_number, vendor_name, package_description, wo_value_excl_gst, gst_rate, remarks, items = [], nt_items = [] } = req.body;
    await query(
      `UPDATE variation_statements
       SET project_id=$2, wo_number=$3, vendor_name=$4, package_description=$5,
           wo_value_excl_gst=$6, gst_rate=$7, remarks=$8, updated_at=NOW()
       WHERE id=$1`,
      [req.params.id, project_id, wo_number || '', vendor_name || '', package_description || '',
       wo_value_excl_gst || 0, gst_rate || 18, remarks || '']
    );

    await query('DELETE FROM variation_statement_items WHERE statement_id=$1', [req.params.id]);
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      await query(
        `INSERT INTO variation_statement_items
           (statement_id, sl_no, item_code, description, unit, rate, wo_qty, amendment_qty, sort_order)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [req.params.id, it.sl_no || String(i + 1), it.item_code || '', it.description || '',
         it.unit || '', parseFloat(it.rate) || 0, parseFloat(it.wo_qty) || 0, parseFloat(it.amendment_qty) || 0, i]
      );
    }

    await query('DELETE FROM variation_statement_nt_items WHERE statement_id=$1', [req.params.id]);
    for (let i = 0; i < nt_items.length; i++) {
      const n = nt_items[i];
      await query(
        `INSERT INTO variation_statement_nt_items
           (statement_id, sl_no, description, unit, rate, qty, sort_order)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [req.params.id, n.sl_no || `NT-${String(i + 1).padStart(2, '0')}`, n.description || '',
         n.unit || '', parseFloat(n.rate) || 0, parseFloat(n.qty) || 0, i]
      );
    }

    const updated = await query('SELECT * FROM variation_statements WHERE id=$1', [req.params.id]);
    const itRows  = await query('SELECT * FROM variation_statement_items    WHERE statement_id=$1 ORDER BY sort_order', [req.params.id]);
    const ntRows  = await query('SELECT * FROM variation_statement_nt_items WHERE statement_id=$1 ORDER BY sort_order', [req.params.id]);
    res.json({ data: { ...updated.rows[0], items: itRows.rows, nt_items: ntRows.rows } });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── PATCH /:id/pull-vos — populate items from approved VOs ───────────────────
router.patch('/:id/pull-vos', async (req, res) => {
  try {
    const own = await query(
      'SELECT id, project_id FROM variation_statements WHERE id=$1 AND company_id=$2',
      [req.params.id, req.user.company_id]
    );
    if (!own.rows.length) return res.status(404).json({ error: 'Not found' });
    const { project_id } = own.rows[0];

    // Fetch all approved VO items for this project
    const voItems = await query(
      `SELECT vi.id, vi.boq_item_id, vi.new_item_description, vi.unit, vi.quantity, vi.rate,
              vo.vo_number,
              b.description AS boq_description, b.quantity AS boq_qty, b.sr_no AS boq_sr_no, b.unit AS boq_unit
       FROM variation_items vi
       JOIN variation_orders vo ON vi.vo_id = vo.id
       LEFT JOIN boq_items b ON vi.boq_item_id = b.id
       WHERE vo.project_id = $1 AND vo.status = 'approved'
       ORDER BY vo.created_at, vi.id`,
      [project_id]
    );

    // Split: items linked to a BOQ item → Existing Items; new descriptions → NT Items
    const existing = voItems.rows.filter(r => r.boq_item_id);
    const nt       = voItems.rows.filter(r => !r.boq_item_id);

    await query('DELETE FROM variation_statement_items WHERE statement_id=$1', [req.params.id]);
    for (let i = 0; i < existing.length; i++) {
      const r = existing[i];
      await query(
        `INSERT INTO variation_statement_items
           (statement_id, sl_no, item_code, description, unit, rate, wo_qty, amendment_qty, sort_order)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [req.params.id, String(i + 1), r.boq_sr_no || '',
         r.boq_description || r.new_item_description || '',
         r.unit || r.boq_unit || '', parseFloat(r.rate) || 0,
         parseFloat(r.boq_qty) || 0, parseFloat(r.quantity) || 0, i]
      );
    }

    await query('DELETE FROM variation_statement_nt_items WHERE statement_id=$1', [req.params.id]);
    for (let i = 0; i < nt.length; i++) {
      const r = nt[i];
      await query(
        `INSERT INTO variation_statement_nt_items
           (statement_id, sl_no, description, unit, rate, qty, sort_order)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [req.params.id, `NT-${String(i + 1).padStart(2, '0')}`,
         r.new_item_description || '', r.unit || '',
         parseFloat(r.rate) || 0, parseFloat(r.quantity) || 0, i]
      );
    }

    const updated = await query('SELECT * FROM variation_statements WHERE id=$1', [req.params.id]);
    const itRows  = await query('SELECT * FROM variation_statement_items    WHERE statement_id=$1 ORDER BY sort_order', [req.params.id]);
    const ntRows  = await query('SELECT * FROM variation_statement_nt_items WHERE statement_id=$1 ORDER BY sort_order', [req.params.id]);
    res.json({ data: { ...updated.rows[0], items: itRows.rows, nt_items: ntRows.rows } });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── PATCH /:id/submit — mark submitted ───────────────────────────────────────
router.patch('/:id/submit', async (req, res) => {
  try {
    const r = await query(
      `UPDATE variation_statements SET status='submitted', submitted_at=NOW(), updated_at=NOW()
       WHERE id=$1 AND company_id=$2 RETURNING *`,
      [req.params.id, req.user.company_id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    const vs = r.rows[0];
    const gstAmt = (parseFloat(vs.wo_value_excl_gst) || 0) * (parseFloat(vs.gst_rate) || 18) / 100;
    const totalWithGst = (parseFloat(vs.wo_value_excl_gst) || 0) + gstAmt;
    notifyAccountsDept(req.user.company_id,
      `Variation Statement Submitted — ${vs.vendor_name || 'Vendor'}`,
      `Variation statement for ${vs.vendor_name || 'Vendor'} submitted. WO: ${vs.wo_number || 'N/A'}. Value (excl. GST): ₹${Math.round(parseFloat(vs.wo_value_excl_gst) || 0).toLocaleString('en-IN')}. Total (incl. ${vs.gst_rate}% GST): ₹${Math.round(totalWithGst).toLocaleString('en-IN')}.`,
      '/accounts/journal-entries').catch(() => {});
    res.json({ data: vs });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── DELETE /:id ───────────────────────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    const r = await query(
      'DELETE FROM variation_statements WHERE id=$1 AND company_id=$2 RETURNING id',
      [req.params.id, req.user.company_id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json({ message: 'Deleted' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

async function notifyAccountsDept(companyId, subject, body, link = '/accounts') {
  try {
    const { rows } = await query(
      `SELECT email FROM users WHERE company_id=$1 AND role IN ('accountant','accounts','super_admin','admin') AND is_active=true AND email IS NOT NULL`,
      [companyId]
    );
    const emails = rows.map(r => r.email).filter(Boolean);
    if (!emails.length) return;
    await sendMail({
      to: emails,
      subject: `[Accounts] ${subject}`,
      html: `<p style="font-family:Arial,sans-serif;font-size:13px">${body}</p><p style="font-size:11px;color:#64748b">View in ERP: <a href="${link}">${link}</a></p>`,
      text: body,
    });
  } catch (_) {}
}

module.exports = router;
