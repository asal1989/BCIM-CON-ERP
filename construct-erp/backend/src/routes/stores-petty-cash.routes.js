// src/routes/stores-petty-cash.routes.js
const express = require('express');
const { authenticate } = require('../middleware/auth');
const { query, withTransaction } = require('../config/database');
const { postAutoJournalStandalone } = require('../services/journalAutoPost');
const router = express.Router();

// Mirrors frontend categoryOf() in StoresPettyCashPage.jsx — keep the two in sync.
const CATEGORY_GL = {
  Fuel: '6030', Safety: '6040', Stationery: '6050', Pantry: '6060',
  Transport: '6070', Utilities: '6080', Materials: '5000',
};
function categoryOf(text = '') {
  const d = (text || '').toLowerCase();
  if (/petrol|fuel|diesel/.test(d))                                           return 'Fuel';
  if (/safety|glove|shoe|medical|flag|helmet|badge|banner|ppe/.test(d))      return 'Safety';
  if (/stationery|stationary|file|paper|pen|whitener|stamp|calc|stapler|a4|xerox|print/.test(d)) return 'Stationery';
  if (/pantry|sweet|food|sugar|tea|poha|zeera|mixture|coconut|biscuit|snack/.test(d)) return 'Pantry';
  if (/transport|bus|ticket|charges|auto|cab|uber|ola/.test(d))              return 'Transport';
  if (/electric|bill|power|utility|mobile|recharge|internet/.test(d))        return 'Utilities';
  return 'Materials';
}

// ── Auto-migrate ─────────────────────────────────────────────────────────────
(async () => {
  const safe = async (sql) => { try { await query(sql); } catch (_) {} };

  await safe(`
    CREATE TABLE IF NOT EXISTS stores_petty_cash_entries (
      id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
      company_id   UUID NOT NULL,
      project_id   UUID,
      sl_no        INTEGER NOT NULL,
      entry_date   DATE NOT NULL,
      supplier     TEXT NOT NULL,
      invoice_no   TEXT,
      amount       NUMERIC(14,2) DEFAULT 0,
      remarks      TEXT,
      status       TEXT DEFAULT 'Pending',
      created_by   UUID,
      created_at   TIMESTAMPTZ DEFAULT NOW(),
      updated_at   TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await safe(`ALTER TABLE stores_petty_cash_entries ADD COLUMN IF NOT EXISTS status        TEXT DEFAULT 'Pending'`);
  await safe(`ALTER TABLE stores_petty_cash_entries ADD COLUMN IF NOT EXISTS bill_file_url  TEXT`);
  await safe(`ALTER TABLE stores_petty_cash_entries ADD COLUMN IF NOT EXISTS bill_file_name TEXT`);
  await safe(`ALTER TABLE stores_petty_cash_entries ADD COLUMN IF NOT EXISTS voucher_file_url  TEXT`);
  await safe(`ALTER TABLE stores_petty_cash_entries ADD COLUMN IF NOT EXISTS voucher_file_name TEXT`);
  await safe(`ALTER TABLE stores_petty_cash_entries ADD COLUMN IF NOT EXISTS basic_amount  NUMERIC(14,2)`);
  await safe(`ALTER TABLE stores_petty_cash_entries ADD COLUMN IF NOT EXISTS gst_pct       NUMERIC(5,2) DEFAULT 0`);
  await safe(`ALTER TABLE stores_petty_cash_entries ADD COLUMN IF NOT EXISTS gst_amount    NUMERIC(14,2) DEFAULT 0`);
  await safe(`ALTER TABLE stores_petty_cash_entries ADD COLUMN IF NOT EXISTS total_amount  NUMERIC(14,2)`);

  await safe(`
    CREATE TABLE IF NOT EXISTS stores_petty_cash_items (
      id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
      entry_id      UUID NOT NULL REFERENCES stores_petty_cash_entries(id) ON DELETE CASCADE,
      material_name TEXT NOT NULL,
      unit          TEXT DEFAULT 'NO''S',
      quantity      NUMERIC(14,3) DEFAULT 0,
      sort_order    INTEGER DEFAULT 0
    )
  `);

  await safe(`
    CREATE TABLE IF NOT EXISTS stores_petty_cash_advances (
      id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
      company_id   UUID NOT NULL,
      project_id   UUID,
      advance_date DATE NOT NULL,
      payee_name   TEXT NOT NULL,
      description  TEXT DEFAULT 'SALARY ADVANCE',
      amount       NUMERIC(14,2) DEFAULT 0,
      remarks      TEXT,
      status       TEXT DEFAULT 'Approved',
      created_by   UUID,
      created_at   TIMESTAMPTZ DEFAULT NOW(),
      updated_at   TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await safe(`ALTER TABLE stores_petty_cash_advances ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'Approved'`);

  await safe(`
    CREATE TABLE IF NOT EXISTS stores_petty_cash_receipts (
      id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
      company_id   UUID NOT NULL,
      project_id   UUID,
      receipt_date DATE NOT NULL,
      amount       NUMERIC(14,2) DEFAULT 0,
      received_by  TEXT,
      voucher_no   TEXT,
      remarks      TEXT,
      created_by   UUID,
      created_at   TIMESTAMPTZ DEFAULT NOW(),
      updated_at   TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await safe(`
    CREATE TABLE IF NOT EXISTS stores_pc_budgets (
      id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
      company_id  UUID NOT NULL,
      project_id  UUID,
      category    TEXT NOT NULL,
      monthly_cap NUMERIC(14,2) DEFAULT 0,
      updated_at  TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await safe(`CREATE INDEX IF NOT EXISTS idx_spce_project ON stores_petty_cash_entries(project_id)`);
  await safe(`CREATE INDEX IF NOT EXISTS idx_spce_date    ON stores_petty_cash_entries(entry_date)`);
  await safe(`CREATE INDEX IF NOT EXISTS idx_spci_entry   ON stores_petty_cash_items(entry_id)`);
  await safe(`CREATE INDEX IF NOT EXISTS idx_spca_project ON stores_petty_cash_advances(project_id)`);
  await safe(`CREATE INDEX IF NOT EXISTS idx_spca_date    ON stores_petty_cash_advances(advance_date)`);
  await safe(`CREATE INDEX IF NOT EXISTS idx_spcr_project ON stores_petty_cash_receipts(project_id)`);
  await safe(`CREATE INDEX IF NOT EXISTS idx_spcr_date    ON stores_petty_cash_receipts(receipt_date)`);
  await safe(`
    CREATE UNIQUE INDEX IF NOT EXISTS uidx_spcb_co_proj_cat
    ON stores_pc_budgets (company_id, COALESCE(project_id::text, 'global'), category)
  `);

  console.log('[StoresPettyCash] Schema OK');
})();

const n = (v) => parseFloat(v) || 0;

function projectFilter(req, conditions, params, entryAlias = '') {
  const { project_id } = req.query;
  const col = entryAlias ? `${entryAlias}.project_id` : 'project_id';
  if (project_id) { conditions.push(`${col} = $${params.length + 1}`); params.push(project_id); }
}

async function nextSlNo(client, companyId, projectId) {
  const r = await client.query(
    `SELECT COALESCE(MAX(sl_no), 0) AS last FROM stores_petty_cash_entries
     WHERE company_id = $1 AND COALESCE(project_id::text,'') = COALESCE($2::text,'')`,
    [companyId, projectId || null]
  );
  return parseInt(r.rows[0].last) + 1;
}

async function getEntry(id, companyId) {
  const r = await query(
    `SELECT e.*, p.name AS project_name, u.name AS created_by_name
     FROM stores_petty_cash_entries e
     LEFT JOIN projects p ON p.id = e.project_id
     LEFT JOIN users    u ON u.id = e.created_by
     WHERE e.id = $1 AND e.company_id = $2`,
    [id, companyId]
  );
  if (!r.rows.length) return null;
  const items = await query(
    `SELECT * FROM stores_petty_cash_items WHERE entry_id = $1 ORDER BY sort_order`,
    [id]
  );
  return { ...r.rows[0], items: items.rows };
}

/* ═══════════════════════════════════════════════════════════════════════════
   LOCAL PURCHASE ENTRIES (header + line items)
═══════════════════════════════════════════════════════════════════════════ */

router.get('/entries', authenticate, async (req, res) => {
  try {
    const { project_id, from, to, search, status, limit = 500, offset = 0 } = req.query;
    const conditions = ['e.company_id = $1'];
    const params = [req.user.company_id];
    let p = 1;

    if (project_id) { conditions.push(`e.project_id = $${++p}`); params.push(project_id); }
    if (from)       { conditions.push(`e.entry_date >= $${++p}`); params.push(from); }
    if (to)         { conditions.push(`e.entry_date <= $${++p}`); params.push(to); }
    if (status)     { conditions.push(`e.status = $${++p}`); params.push(status); }
    if (search) {
      conditions.push(`(e.supplier ILIKE $${++p} OR e.invoice_no ILIKE $${p} OR EXISTS (
        SELECT 1 FROM stores_petty_cash_items i WHERE i.entry_id = e.id AND i.material_name ILIKE $${p}
      ))`);
      params.push(`%${search}%`);
    }
    const where = conditions.join(' AND ');

    const rows = await query(
      `SELECT e.*, p.name AS project_name, u.name AS created_by_name,
              COALESCE(json_agg(json_build_object(
                'id', i.id, 'material_name', i.material_name, 'unit', i.unit, 'quantity', i.quantity
              ) ORDER BY i.sort_order) FILTER (WHERE i.id IS NOT NULL), '[]') AS items
       FROM stores_petty_cash_entries e
       LEFT JOIN projects p ON p.id = e.project_id
       LEFT JOIN users    u ON u.id = e.created_by
       LEFT JOIN stores_petty_cash_items i ON i.entry_id = e.id
       WHERE ${where}
       GROUP BY e.id, p.name, u.name
       ORDER BY e.entry_date ASC, e.sl_no ASC
       LIMIT $${++p} OFFSET $${++p}`,
      [...params, limit, offset]
    );
    const total = await query(
      `SELECT COUNT(*) FROM stores_petty_cash_entries e WHERE ${where}`,
      params.slice(0, p - 2)
    );
    const sum = await query(
      `SELECT COALESCE(SUM(e.amount),0) AS total_amount FROM stores_petty_cash_entries e WHERE ${where}`,
      params.slice(0, p - 2)
    );
    res.json({ data: rows.rows, total: parseInt(total.rows[0].count), total_amount: parseFloat(sum.rows[0].total_amount) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/entries/:id', authenticate, async (req, res) => {
  try {
    const entry = await getEntry(req.params.id, req.user.company_id);
    if (!entry) return res.status(404).json({ error: 'Entry not found' });
    res.json({ data: entry });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/entries', authenticate, async (req, res) => {
  try {
    const { project_id, entry_date, supplier, invoice_no, amount = 0, remarks, items = [], status = 'Pending', bill_file_url, bill_file_name, voucher_file_url, voucher_file_name, basic_amount, gst_pct = 0, gst_amount = 0, total_amount } = req.body;
    if (!entry_date) return res.status(400).json({ error: 'entry_date is required' });
    if (!supplier?.trim()) return res.status(400).json({ error: 'supplier is required' });
    if (!items.filter(i => i.material_name?.trim()).length) {
      return res.status(400).json({ error: 'At least one material line is required' });
    }

    const invTrimmed = invoice_no?.trim();
    if (invTrimmed && invTrimmed !== '–' && !req.body.force) {
      const dup = await query(
        `SELECT id, sl_no, supplier, entry_date FROM stores_petty_cash_entries
         WHERE company_id=$1 AND invoice_no=$2`,
        [req.user.company_id, invTrimmed]
      );
      if (dup.rows.length > 0) {
        return res.status(409).json({ errorCode: 'DUPLICATE_INVOICE', existing: dup.rows[0] });
      }
    }

    const result = await withTransaction(async (client) => {
      const sl_no = await nextSlNo(client, req.user.company_id, project_id);
      const r = await client.query(
        `INSERT INTO stores_petty_cash_entries
          (company_id, project_id, sl_no, entry_date, supplier, invoice_no, amount, remarks, status,
           bill_file_url, bill_file_name, voucher_file_url, voucher_file_name, basic_amount, gst_pct, gst_amount, total_amount, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) RETURNING *`,
        [req.user.company_id, project_id || null, sl_no, entry_date, supplier.trim(),
         invoice_no || null, n(amount), remarks || null, status,
         bill_file_url || null, bill_file_name || null,
         voucher_file_url || null, voucher_file_name || null,
         basic_amount != null ? n(basic_amount) : null, n(gst_pct), n(gst_amount),
         total_amount != null ? n(total_amount) : null, req.user.id]
      );
      const entryId = r.rows[0].id;
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        if (!it.material_name?.trim()) continue;
        await client.query(
          `INSERT INTO stores_petty_cash_items (entry_id, material_name, unit, quantity, sort_order)
           VALUES ($1,$2,$3,$4,$5)`,
          [entryId, it.material_name.trim(), it.unit || "NO'S", n(it.quantity), i + 1]
        );
      }
      return r.rows[0];
    });

    const full = await getEntry(result.id, req.user.company_id);
    res.status(201).json({ data: full });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/entries/:id', authenticate, async (req, res) => {
  try {
    const existing = await getEntry(req.params.id, req.user.company_id);
    if (!existing) return res.status(404).json({ error: 'Entry not found' });

    const { project_id, entry_date, supplier, invoice_no, amount = 0, remarks, items = [], status, bill_file_url, bill_file_name, voucher_file_url, voucher_file_name, basic_amount, gst_pct = 0, gst_amount = 0, total_amount } = req.body;

    const invTrimmedPut = invoice_no?.trim();
    if (invTrimmedPut && invTrimmedPut !== '–' && !req.body.force) {
      const dup = await query(
        `SELECT id, sl_no, supplier, entry_date FROM stores_petty_cash_entries
         WHERE company_id=$1 AND invoice_no=$2 AND id != $3`,
        [req.user.company_id, invTrimmedPut, req.params.id]
      );
      if (dup.rows.length > 0) {
        return res.status(409).json({ errorCode: 'DUPLICATE_INVOICE', existing: dup.rows[0] });
      }
    }

    await withTransaction(async (client) => {
      await client.query(
        `UPDATE stores_petty_cash_entries SET
           project_id=$1, entry_date=$2, supplier=$3, invoice_no=$4, amount=$5, remarks=$6,
           status=COALESCE($7,status),
           bill_file_url=COALESCE($8,bill_file_url),
           bill_file_name=COALESCE($9,bill_file_name),
           voucher_file_url=COALESCE($10,voucher_file_url),
           voucher_file_name=COALESCE($11,voucher_file_name),
           basic_amount=$12, gst_pct=$13, gst_amount=$14, total_amount=$15,
           updated_at=NOW()
         WHERE id=$16`,
        [project_id || null, entry_date, supplier?.trim(), invoice_no || null, n(amount),
         remarks || null, status || null,
         bill_file_url || null, bill_file_name || null,
         voucher_file_url || null, voucher_file_name || null,
         basic_amount != null ? n(basic_amount) : null, n(gst_pct), n(gst_amount),
         total_amount != null ? n(total_amount) : null,
         req.params.id]
      );
      await client.query(`DELETE FROM stores_petty_cash_items WHERE entry_id = $1`, [req.params.id]);
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        if (!it.material_name?.trim()) continue;
        await client.query(
          `INSERT INTO stores_petty_cash_items (entry_id, material_name, unit, quantity, sort_order)
           VALUES ($1,$2,$3,$4,$5)`,
          [req.params.id, it.material_name.trim(), it.unit || "NO'S", n(it.quantity), i + 1]
        );
      }
    });

    const full = await getEntry(req.params.id, req.user.company_id);
    res.json({ data: full });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch('/entries/:id/status', authenticate, async (req, res) => {
  try {
    const { status } = req.body;
    if (!['Pending', 'Approved', 'Rejected'].includes(status)) {
      return res.status(400).json({ error: 'status must be Pending, Approved, or Rejected' });
    }
    const r = await query(
      `UPDATE stores_petty_cash_entries SET status=$1, updated_at=NOW()
       WHERE id=$2 AND company_id=$3 RETURNING *`,
      [status, req.params.id, req.user.company_id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Entry not found' });
    const entry = r.rows[0];

    // Auto-post JV on approval: Dr expense (by material category) + Input GST, Cr Cash in Hand
    if (status === 'Approved') {
      const items = await query(
        `SELECT material_name FROM stores_petty_cash_items WHERE entry_id = $1 ORDER BY sort_order LIMIT 1`,
        [entry.id]
      );
      const cat = categoryOf(items.rows[0]?.material_name || entry.supplier || '');
      const expCode = CATEGORY_GL[cat] || CATEGORY_GL.Materials;
      const basic = parseFloat(entry.basic_amount) || parseFloat(entry.amount) || 0;
      const gst   = parseFloat(entry.gst_amount) || 0;
      const total = parseFloat(entry.total_amount) || parseFloat(entry.amount) || (basic + gst);
      const ref   = entry.invoice_no || `SPC-${entry.sl_no}`;
      const lines = [{ code: expCode, debit: basic, description: `${cat} — ${entry.supplier} (${ref})` }];
      if (gst > 0) lines.push({ code: '1300', debit: gst, description: `Input GST / ITC — ${ref}` });
      lines.push({ code: '1000', credit: total, description: `Petty cash paid — ${entry.supplier} (${ref})` });

      postAutoJournalStandalone({
        companyId: req.user.company_id,
        userId:    req.user.id,
        entryDate: entry.entry_date,
        reference: ref,
        narration: `Stores petty cash — ${entry.supplier}`,
        source:    'auto_stores_petty_cash',
        lines,
      }).catch(() => {});
    }

    res.json({ data: entry });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/entries/:id', authenticate, async (req, res) => {
  try {
    const existing = await getEntry(req.params.id, req.user.company_id);
    if (!existing) return res.status(404).json({ error: 'Entry not found' });
    await query(`DELETE FROM stores_petty_cash_entries WHERE id = $1`, [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* ═══════════════════════════════════════════════════════════════════════════
   OTHER PETTY CASH (salary advances / contractor payments)
═══════════════════════════════════════════════════════════════════════════ */

router.get('/advances', authenticate, async (req, res) => {
  try {
    const { project_id, from, to, search, limit = 500, offset = 0 } = req.query;
    const conditions = ['a.company_id = $1'];
    const params = [req.user.company_id];
    let p = 1;

    if (project_id) { conditions.push(`a.project_id = $${++p}`); params.push(project_id); }
    if (from)       { conditions.push(`a.advance_date >= $${++p}`); params.push(from); }
    if (to)         { conditions.push(`a.advance_date <= $${++p}`); params.push(to); }
    if (search)     { conditions.push(`(a.payee_name ILIKE $${++p} OR a.description ILIKE $${p})`); params.push(`%${search}%`); }
    const where = conditions.join(' AND ');

    const rows = await query(
      `SELECT a.*, p.name AS project_name, u.name AS created_by_name
       FROM stores_petty_cash_advances a
       LEFT JOIN projects p ON p.id = a.project_id
       LEFT JOIN users    u ON u.id = a.created_by
       WHERE ${where}
       ORDER BY a.advance_date ASC, a.created_at ASC
       LIMIT $${++p} OFFSET $${++p}`,
      [...params, limit, offset]
    );
    const total = await query(`SELECT COUNT(*) FROM stores_petty_cash_advances a WHERE ${where}`, params.slice(0, p - 2));
    const sum   = await query(`SELECT COALESCE(SUM(a.amount),0) AS total_amount FROM stores_petty_cash_advances a WHERE ${where}`, params.slice(0, p - 2));
    res.json({ data: rows.rows, total: parseInt(total.rows[0].count), total_amount: parseFloat(sum.rows[0].total_amount) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/advances', authenticate, async (req, res) => {
  try {
    const { project_id, advance_date, payee_name, description = 'SALARY ADVANCE', amount = 0, remarks } = req.body;
    if (!advance_date)     return res.status(400).json({ error: 'advance_date is required' });
    if (!payee_name?.trim()) return res.status(400).json({ error: 'payee_name is required' });

    const r = await query(
      `INSERT INTO stores_petty_cash_advances
        (company_id, project_id, advance_date, payee_name, description, amount, remarks, status, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'Approved',$8) RETURNING *`,
      [req.user.company_id, project_id || null, advance_date, payee_name.trim(),
       description || 'SALARY ADVANCE', n(amount), remarks || null, req.user.id]
    );
    res.status(201).json({ data: r.rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/advances/:id', authenticate, async (req, res) => {
  try {
    const { project_id, advance_date, payee_name, description, amount = 0, remarks } = req.body;
    const r = await query(
      `UPDATE stores_petty_cash_advances SET
         project_id=$1, advance_date=$2, payee_name=$3, description=$4, amount=$5, remarks=$6, updated_at=NOW()
       WHERE id=$7 AND company_id=$8 RETURNING *`,
      [project_id || null, advance_date, payee_name?.trim(), description, n(amount), remarks || null,
       req.params.id, req.user.company_id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Advance not found' });
    res.json({ data: r.rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/advances/:id', authenticate, async (req, res) => {
  try {
    const r = await query(
      `DELETE FROM stores_petty_cash_advances WHERE id=$1 AND company_id=$2 RETURNING id`,
      [req.params.id, req.user.company_id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Advance not found' });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* ═══════════════════════════════════════════════════════════════════════════
   HO RECEIPTS
═══════════════════════════════════════════════════════════════════════════ */

router.get('/receipts', authenticate, async (req, res) => {
  try {
    const { project_id, from, to, limit = 200, offset = 0 } = req.query;
    const conditions = ['company_id = $1'];
    const params = [req.user.company_id];
    let p = 1;
    if (project_id) { conditions.push(`project_id = $${++p}`); params.push(project_id); }
    if (from) { conditions.push(`receipt_date >= $${++p}`); params.push(from); }
    if (to)   { conditions.push(`receipt_date <= $${++p}`); params.push(to); }
    const where = conditions.join(' AND ');

    const rows = await query(
      `SELECT * FROM stores_petty_cash_receipts WHERE ${where}
       ORDER BY receipt_date ASC, created_at ASC
       LIMIT $${++p} OFFSET $${++p}`,
      [...params, limit, offset]
    );
    const sum = await query(
      `SELECT COALESCE(SUM(amount),0) AS total FROM stores_petty_cash_receipts WHERE ${where}`,
      params.slice(0, p - 2)
    );
    res.json({ data: rows.rows, total_amount: parseFloat(sum.rows[0].total) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/receipts', authenticate, async (req, res) => {
  try {
    const { project_id, receipt_date, amount, received_by, voucher_no, remarks } = req.body;
    if (!receipt_date) return res.status(400).json({ error: 'receipt_date is required' });
    if (!n(amount))    return res.status(400).json({ error: 'amount is required' });

    const r = await query(
      `INSERT INTO stores_petty_cash_receipts
        (company_id, project_id, receipt_date, amount, received_by, voucher_no, remarks, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [req.user.company_id, project_id || null, receipt_date, n(amount),
       received_by || null, voucher_no || null, remarks || null, req.user.id]
    );
    res.status(201).json({ data: r.rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/receipts/:id', authenticate, async (req, res) => {
  try {
    const { project_id, receipt_date, amount, received_by, voucher_no, remarks } = req.body;
    const r = await query(
      `UPDATE stores_petty_cash_receipts SET
         project_id=$1, receipt_date=$2, amount=$3, received_by=$4, voucher_no=$5, remarks=$6, updated_at=NOW()
       WHERE id=$7 AND company_id=$8 RETURNING *`,
      [project_id || null, receipt_date, n(amount), received_by || null,
       voucher_no || null, remarks || null, req.params.id, req.user.company_id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Receipt not found' });
    res.json({ data: r.rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/receipts/:id', authenticate, async (req, res) => {
  try {
    const r = await query(
      `DELETE FROM stores_petty_cash_receipts WHERE id=$1 AND company_id=$2 RETURNING id`,
      [req.params.id, req.user.company_id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Receipt not found' });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* ═══════════════════════════════════════════════════════════════════════════
   BUDGETS
═══════════════════════════════════════════════════════════════════════════ */

router.get('/budgets', authenticate, async (req, res) => {
  try {
    const { project_id } = req.query;
    const r = await query(
      `SELECT category, monthly_cap FROM stores_pc_budgets
       WHERE company_id=$1 AND COALESCE(project_id::text,'') = COALESCE($2::text,'')
       ORDER BY category`,
      [req.user.company_id, project_id || null]
    );
    // Return as object keyed by category
    const obj = {};
    r.rows.forEach(row => { obj[row.category] = parseFloat(row.monthly_cap); });
    res.json({ data: obj });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/budgets', authenticate, async (req, res) => {
  try {
    const { project_id, budgets } = req.body; // budgets: { Fuel: 3000, Safety: 12000, ... }
    if (!budgets || typeof budgets !== 'object') {
      return res.status(400).json({ error: 'budgets object is required' });
    }
    await withTransaction(async (client) => {
      for (const [category, monthly_cap] of Object.entries(budgets)) {
        await client.query(
          `INSERT INTO stores_pc_budgets (company_id, project_id, category, monthly_cap, updated_at)
           VALUES ($1,$2,$3,$4,NOW())
           ON CONFLICT (company_id, COALESCE(project_id::text,'global'), category)
           DO UPDATE SET monthly_cap=$4, updated_at=NOW()`,
          [req.user.company_id, project_id || null, category, n(monthly_cap)]
        );
      }
    });
    res.json({ success: true });
  } catch (err) {
    // Fallback: simple upsert without ON CONFLICT (if unique index doesn't exist)
    try {
      const { project_id, budgets } = req.body;
      for (const [category, monthly_cap] of Object.entries(budgets || {})) {
        const existing = await query(
          `SELECT id FROM stores_pc_budgets WHERE company_id=$1 AND COALESCE(project_id::text,'')=COALESCE($2::text,'') AND category=$3`,
          [req.user.company_id, project_id || null, category]
        );
        if (existing.rows.length) {
          await query(
            `UPDATE stores_pc_budgets SET monthly_cap=$1, updated_at=NOW() WHERE id=$2`,
            [n(monthly_cap), existing.rows[0].id]
          );
        } else {
          await query(
            `INSERT INTO stores_pc_budgets (company_id, project_id, category, monthly_cap) VALUES ($1,$2,$3,$4)`,
            [req.user.company_id, project_id || null, category, n(monthly_cap)]
          );
        }
      }
      res.json({ success: true });
    } catch (err2) { res.status(500).json({ error: err2.message }); }
  }
});

/* ═══════════════════════════════════════════════════════════════════════════
   SUMMARY (for dashboard cards)
═══════════════════════════════════════════════════════════════════════════ */

router.get('/summary', authenticate, async (req, res) => {
  try {
    const { project_id, from, to } = req.query;
    const cond  = [`company_id = $1`];
    const base  = [req.user.company_id];

    if (project_id) { cond.push(`project_id = $${base.length + 1}`); base.push(project_id); }

    const eCond = [...cond]; const eP = [...base];
    const aCond = [...cond]; const aP = [...base];
    const rCond = [...cond]; const rP = [...base];

    if (from) { eCond.push(`entry_date >= $${eP.length + 1}`); eP.push(from); }
    if (to)   { eCond.push(`entry_date <= $${eP.length + 1}`); eP.push(to); }
    if (from) { aCond.push(`advance_date >= $${aP.length + 1}`); aP.push(from); }
    if (to)   { aCond.push(`advance_date <= $${aP.length + 1}`); aP.push(to); }
    if (from) { rCond.push(`receipt_date >= $${rP.length + 1}`); rP.push(from); }
    if (to)   { rCond.push(`receipt_date <= $${rP.length + 1}`); rP.push(to); }

    const [localRes, advRes, recRes, pendRes] = await Promise.all([
      query(`SELECT COALESCE(SUM(amount),0) AS total, COUNT(*) AS count FROM stores_petty_cash_entries WHERE ${eCond.join(' AND ')} AND status='Approved'`, eP),
      query(`SELECT COALESCE(SUM(amount),0) AS total, COUNT(*) AS count FROM stores_petty_cash_advances WHERE ${aCond.join(' AND ')}`, aP),
      query(`SELECT COALESCE(SUM(amount),0) AS total, COUNT(*) AS count FROM stores_petty_cash_receipts WHERE ${rCond.join(' AND ')}`, rP),
      query(`SELECT COUNT(*) AS count FROM stores_petty_cash_entries WHERE ${eCond.join(' AND ')} AND status='Pending'`, eP),
    ]);

    const localTotal   = parseFloat(localRes.rows[0].total);
    const advTotal     = parseFloat(advRes.rows[0].total);
    const recTotal     = parseFloat(recRes.rows[0].total);
    const grandSpent   = localTotal + advTotal;
    const cashInHand   = recTotal - grandSpent;

    res.json({
      data: {
        local_purchase_total:  localTotal,
        local_purchase_count:  parseInt(localRes.rows[0].count),
        advance_total:         advTotal,
        advance_count:         parseInt(advRes.rows[0].count),
        receipt_total:         recTotal,
        receipt_count:         parseInt(recRes.rows[0].count),
        grand_spent:           grandSpent,
        grand_total:           grandSpent,
        cash_in_hand:          cashInHand,
        pending_count:         parseInt(pendRes.rows[0].count),
      },
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
