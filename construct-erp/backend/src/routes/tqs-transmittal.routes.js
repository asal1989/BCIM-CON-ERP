// src/routes/tqs-transmittal.routes.js
const express = require('express');
const { authenticate } = require('../middleware/auth');
const { query, withTransaction } = require('../config/database');
const { runSchemaInit } = require('../utils/schemaInit');

const router = express.Router();
router.use(authenticate);

// ── Auto-create tables ─────────────────────────────────────────────────────
async function ensureTables() {
  await query(`
    CREATE TABLE IF NOT EXISTS tqs_transmittals (
      id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id          UUID,
      project_id          UUID,
      transmittal_number  TEXT UNIQUE NOT NULL,
      revision            TEXT DEFAULT 'REV.000',
      transmittal_date    DATE NOT NULL,
      from_dept           TEXT DEFAULT 'QS Department',
      to_dept             TEXT DEFAULT 'Accounts Department',
      to_person           TEXT,
      subject             TEXT,
      status              TEXT DEFAULT 'draft',
      issued_by           TEXT,
      issued_date         DATE,
      received_by         TEXT,
      received_date       DATE,
      remarks             TEXT,
      is_deleted          BOOLEAN DEFAULT FALSE,
      created_by          UUID,
      created_at          TIMESTAMPTZ DEFAULT NOW(),
      updated_at          TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS tqs_transmittal_items (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      transmittal_id  UUID REFERENCES tqs_transmittals(id) ON DELETE CASCADE,
      sl_no           INT,
      tqs_bill_id     UUID,
      invoice_no      TEXT,
      invoice_date    DATE,
      po_wo_ref       TEXT,
      po_wo_date      DATE,
      vendor_name     TEXT,
      amount          NUMERIC(15,2) DEFAULT 0,
      tax_pct         NUMERIC(5,2) DEFAULT 0,
      tax_amount      NUMERIC(15,2) DEFAULT 0,
      hsn_codes       TEXT,
      item_remarks    TEXT
    );
  `);
  // Idempotent — these two columns were added after the table already existed
  // in production for the original QS-to-Accounts flow.
  await query(`ALTER TABLE tqs_transmittals ADD COLUMN IF NOT EXISTS revision TEXT DEFAULT 'REV.000'`);
  await query(`ALTER TABLE tqs_transmittal_items ADD COLUMN IF NOT EXISTS tax_pct NUMERIC(5,2) DEFAULT 0`);
  await query(`ALTER TABLE tqs_transmittal_items ADD COLUMN IF NOT EXISTS tax_amount NUMERIC(15,2) DEFAULT 0`);
  await query(`ALTER TABLE tqs_transmittal_items ADD COLUMN IF NOT EXISTS hsn_codes TEXT`);
}

runSchemaInit('tqs_transmittals', ensureTables);
runSchemaInit('tqs_transmittals_site_ho_cols', ensureTables);

// Per-project short code for transmittal numbering, same idea as the
// existing mrs_prefix column — lets a project use a shorter/legacy code
// (e.g. DQS Towers -> 'DQS') instead of its full project_code.
runSchemaInit('projects_transmittal_prefix', async () => {
  await query(`ALTER TABLE projects ADD COLUMN IF NOT EXISTS transmittal_prefix TEXT`);
});

// ── Auto-number helper ─────────────────────────────────────────────────────
// One continuous sequence per project — "BCIM-<Code>-HO-INV-001", matching
// the site's existing paper/Excel transmittal register so numbers stay
// recognisable to whoever's been filing these by hand. Uses
// projects.transmittal_prefix when set (e.g. DQS Towers -> 'DQS', shorter
// than its project_code 'DQSTWR001' and matching the site's own existing
// numbering — BCIM-DQS-HO-INV-001), falling back to project_code otherwise.
// Same override pattern as the existing mrs_prefix column.
async function nextTransmittalNumber(companyId, projectId) {
  const proj = await query(`SELECT project_code, transmittal_prefix FROM projects WHERE id = $1 AND company_id = $2`, [projectId, companyId]);
  const projectCode = proj.rows[0]?.transmittal_prefix || proj.rows[0]?.project_code || 'GEN';
  const prefix = `BCIM-${projectCode}-HO-INV-`;

  const res = await query(
    `SELECT COALESCE(MAX(CAST(REGEXP_REPLACE(transmittal_number, '^.*-', '') AS INTEGER)), 0) AS last_seq
     FROM tqs_transmittals WHERE company_id = $1 AND transmittal_number LIKE $2 || '%' AND transmittal_number ~ '[0-9]+$'`,
    [companyId, prefix]
  );
  const seq = parseInt(res.rows[0].last_seq, 10) + 1;
  return `${prefix}${String(seq).padStart(3, '0')}`;
}

// ── GET /tqs/transmittals ─────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { project_id, status, from_date, to_date, search } = req.query;
    const conditions = [`t.company_id = $1`, `t.is_deleted = FALSE`];
    const params = [req.user.company_id];
    let i = 2;

    if (project_id)  { conditions.push(`t.project_id = $${i++}`);                          params.push(project_id); }
    if (status)      { conditions.push(`t.status = $${i++}`);                              params.push(status); }
    if (from_date)   { conditions.push(`t.transmittal_date >= $${i++}`);                   params.push(from_date); }
    if (to_date)     { conditions.push(`t.transmittal_date <= $${i++}`);                   params.push(to_date); }
    if (search)      { conditions.push(`(t.transmittal_number ILIKE $${i} OR t.to_person ILIKE $${i})`); params.push(`%${search}%`); i++; }

    const rows = await query(`
      SELECT t.*,
             p.name AS project_name,
             (SELECT COUNT(*) FROM tqs_transmittal_items ti WHERE ti.transmittal_id = t.id) AS bill_count,
             (SELECT COALESCE(SUM(ti.amount + ti.tax_amount),0) FROM tqs_transmittal_items ti WHERE ti.transmittal_id = t.id) AS total_amount
      FROM tqs_transmittals t
      LEFT JOIN projects p ON p.id = t.project_id
      WHERE ${conditions.join(' AND ')}
      ORDER BY t.created_at DESC
    `, params);

    res.json(rows.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /tqs/transmittals/lookup/bills ────────────────────────────────────
// Returns bills eligible to be added to a transmittal (QS certified / accounts stage)
// MUST be defined before /:id or Express will swallow 'lookup' as a bill ID
router.get('/lookup/bills', async (req, res) => {
  try {
    const { project_id, search } = req.query;
    const conditions = [`b.company_id = $1`, `b.is_deleted = FALSE`];
    const params = [req.user.company_id];
    let i = 2;

    if (project_id) { conditions.push(`b.project_id = $${i++}`); params.push(project_id); }
    if (search)     { conditions.push(`(b.inv_number ILIKE $${i} OR b.vendor_name ILIKE $${i})`); params.push(`%${search}%`); i++; }

    const rows = await query(`
      SELECT b.id, b.sl_number, b.inv_number, b.inv_date, b.po_number, b.po_date,
             b.vendor_name, b.workflow_status,
             COALESCE(b.basic_amount, 0)                                AS amount,
             COALESCE(b.gst_amount, 0)                                  AS tax_amount,
             COALESCE(b.cgst_pct, 0) + COALESCE(b.sgst_pct, 0) + COALESCE(b.igst_pct, 0) AS tax_pct,
             COALESCE(b.total_amount, 0)                                AS total_amount,
             p.name AS project_name
      FROM tqs_bills b
      LEFT JOIN tqs_bill_updates u ON u.bill_id = b.id
      LEFT JOIN projects p ON p.id = b.project_id
      WHERE ${conditions.join(' AND ')}
        -- Exclude bills already included in a submitted or received transmittal
        AND NOT EXISTS (
          SELECT 1
          FROM tqs_transmittal_items ti
          JOIN tqs_transmittals t ON t.id = ti.transmittal_id
          WHERE ti.tqs_bill_id = b.id
            AND t.status IN ('submitted', 'received')
            AND t.is_deleted = FALSE
        )
      ORDER BY b.inv_date DESC NULLS LAST, b.created_at DESC
      LIMIT 200
    `, params);

    res.json(rows.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /tqs/transmittals/:id ──────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const t = await query(
      `SELECT t.*, p.name AS project_name
       FROM tqs_transmittals t
       LEFT JOIN projects p ON p.id = t.project_id
       WHERE t.id = $1 AND t.company_id = $2 AND t.is_deleted = FALSE`,
      [req.params.id, req.user.company_id]
    );
    if (!t.rows.length) return res.status(404).json({ error: 'Not found' });

    const items = await query(
      `SELECT * FROM tqs_transmittal_items WHERE transmittal_id = $1 ORDER BY sl_no`,
      [req.params.id]
    );

    res.json({ ...t.rows[0], items: items.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /tqs/transmittals ─────────────────────────────────────────────────
router.post('/', async (req, res) => {
  try {
    const {
      project_id, transmittal_date, revision, from_dept, to_dept, to_person,
      subject, issued_by, issued_date, remarks,
      bill_ids = [],      // array of tqs_bill_ids
      item_overrides = {}, // { [tqs_bill_id]: { hsn_codes, item_remarks } } — HSN isn't captured anywhere upstream
      manual_items = [],  // [{invoice_no,invoice_date,vendor_name,amount,tax_pct,tax_amount,hsn_codes,item_remarks}]
    } = req.body;

    if (!transmittal_date) return res.status(400).json({ error: 'transmittal_date is required' });
    if (!project_id) return res.status(400).json({ error: 'project_id is required — the transmittal number is scoped per project' });

    const transmittal_number = await nextTransmittalNumber(req.user.company_id, project_id);

    const result = await withTransaction(async (client) => {
      const ins = await client.query(`
        INSERT INTO tqs_transmittals
          (company_id, project_id, transmittal_number, revision, transmittal_date,
           from_dept, to_dept, to_person, subject,
           issued_by, issued_date, remarks, created_by)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
        RETURNING *
      `, [
        req.user.company_id, project_id, transmittal_number, revision || 'REV.000', transmittal_date,
        from_dept || null, to_dept || 'BCIM Engineering Pvt. Ltd (HO)', to_person || null, subject || null,
        issued_by || req.user.name || null, issued_date || transmittal_date, remarks || null, req.user.id,
      ]);
      const transmittal = ins.rows[0];

      // Build items from selected bills
      let sl = 1;
      if (bill_ids.length) {
        const bills = await client.query(
          `SELECT b.id, b.inv_number, b.inv_date, b.po_number, b.po_date, b.vendor_name,
                  COALESCE(b.basic_amount, 0) AS amount,
                  COALESCE(b.gst_amount, 0)   AS tax_amount,
                  COALESCE(b.cgst_pct, 0) + COALESCE(b.sgst_pct, 0) + COALESCE(b.igst_pct, 0) AS tax_pct
           FROM tqs_bills b
           WHERE b.id = ANY($1::uuid[]) AND b.company_id = $2 AND b.is_deleted = FALSE`,
          [bill_ids, req.user.company_id]
        );
        // preserve the order the user sent
        const billMap = Object.fromEntries(bills.rows.map(b => [b.id, b]));
        for (const bid of bill_ids) {
          const b = billMap[bid];
          if (!b) continue;
          const ov = item_overrides[bid] || {};
          await client.query(`
            INSERT INTO tqs_transmittal_items
              (transmittal_id, sl_no, tqs_bill_id, invoice_no, invoice_date,
               po_wo_ref, po_wo_date, vendor_name, amount, tax_pct, tax_amount, hsn_codes, item_remarks)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
          `, [
            transmittal.id, sl++, b.id, b.inv_number, b.inv_date,
            b.po_number, b.po_date, b.vendor_name, b.amount, b.tax_pct, b.tax_amount,
            ov.hsn_codes || null, ov.item_remarks || null,
          ]);
        }
      }

      // Manual items (if any)
      for (const item of manual_items) {
        await client.query(`
          INSERT INTO tqs_transmittal_items
            (transmittal_id, sl_no, invoice_no, invoice_date,
             vendor_name, amount, tax_pct, tax_amount, hsn_codes, item_remarks)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
        `, [
          transmittal.id, sl++, item.invoice_no || null, item.invoice_date || null,
          item.vendor_name || null, item.amount || 0, item.tax_pct || 0, item.tax_amount || 0,
          item.hsn_codes || null, item.item_remarks || null,
        ]);
      }

      const items = await client.query(
        `SELECT * FROM tqs_transmittal_items WHERE transmittal_id = $1 ORDER BY sl_no`,
        [transmittal.id]
      );
      return { ...transmittal, items: items.rows };
    });

    res.status(201).json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ── PATCH /tqs/transmittals/:id/submit ────────────────────────────────────
router.patch('/:id/submit', async (req, res) => {
  try {
    const r = await query(
      `UPDATE tqs_transmittals
       SET status = 'submitted', updated_at = NOW()
       WHERE id = $1 AND company_id = $2 AND status = 'draft' AND is_deleted = FALSE
       RETURNING *`,
      [req.params.id, req.user.company_id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Transmittal not found or not in draft state' });
    res.json(r.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ── PATCH /tqs/transmittals/:id/receive ───────────────────────────────────
router.patch('/:id/receive', async (req, res) => {
  try {
    const { received_by, received_date } = req.body;
    if (!received_by) return res.status(400).json({ error: 'received_by is required' });

    const r = await query(
      `UPDATE tqs_transmittals
       SET status = 'received', received_by = $3, received_date = $4, updated_at = NOW()
       WHERE id = $1 AND company_id = $2 AND status = 'submitted' AND is_deleted = FALSE
       RETURNING *`,
      [req.params.id, req.user.company_id, received_by, received_date || new Date().toISOString().slice(0, 10)]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Transmittal not found or not in submitted state' });
    res.json(r.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /tqs/transmittals/:id ──────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    const r = await query(
      `UPDATE tqs_transmittals
       SET is_deleted = TRUE, updated_at = NOW()
       WHERE id = $1 AND company_id = $2 AND status = 'draft'
       RETURNING id`,
      [req.params.id, req.user.company_id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Transmittal not found or cannot delete (only drafts can be deleted)' });
    res.json({ message: 'Transmittal deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
