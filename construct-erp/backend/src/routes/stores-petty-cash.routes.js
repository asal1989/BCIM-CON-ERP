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

  await safe(`ALTER TABLE stores_petty_cash_entries ADD COLUMN IF NOT EXISTS status           TEXT DEFAULT 'Pending'`);
  await safe(`ALTER TABLE stores_petty_cash_entries ADD COLUMN IF NOT EXISTS bill_file_url    TEXT`);
  await safe(`ALTER TABLE stores_petty_cash_entries ADD COLUMN IF NOT EXISTS bill_file_name   TEXT`);
  await safe(`ALTER TABLE stores_petty_cash_entries ADD COLUMN IF NOT EXISTS voucher_file_url  TEXT`);
  await safe(`ALTER TABLE stores_petty_cash_entries ADD COLUMN IF NOT EXISTS voucher_file_name TEXT`);
  await safe(`ALTER TABLE stores_petty_cash_entries ADD COLUMN IF NOT EXISTS basic_amount     NUMERIC(14,2)`);
  await safe(`ALTER TABLE stores_petty_cash_entries ADD COLUMN IF NOT EXISTS gst_pct          NUMERIC(5,2) DEFAULT 0`);
  await safe(`ALTER TABLE stores_petty_cash_entries ADD COLUMN IF NOT EXISTS gst_amount       NUMERIC(14,2) DEFAULT 0`);
  await safe(`ALTER TABLE stores_petty_cash_entries ADD COLUMN IF NOT EXISTS total_amount     NUMERIC(14,2)`);
  await safe(`ALTER TABLE stores_petty_cash_entries ADD COLUMN IF NOT EXISTS approved_by      UUID REFERENCES users(id)`);
  await safe(`ALTER TABLE stores_petty_cash_entries ADD COLUMN IF NOT EXISTS approved_at      TIMESTAMPTZ`);
  await safe(`ALTER TABLE stores_petty_cash_entries ADD COLUMN IF NOT EXISTS approval_remarks TEXT`);
  await safe(`ALTER TABLE stores_petty_cash_entries ADD COLUMN IF NOT EXISTS rejected_reason  TEXT`);
  await safe(`ALTER TABLE stores_petty_cash_entries ADD COLUMN IF NOT EXISTS ph_approved_by   UUID REFERENCES users(id)`);
  await safe(`ALTER TABLE stores_petty_cash_entries ADD COLUMN IF NOT EXISTS ph_approved_at   TIMESTAMPTZ`);

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
  await safe(`ALTER TABLE stores_petty_cash_items ADD COLUMN IF NOT EXISTS rate         NUMERIC(14,4) DEFAULT 0`);
  await safe(`ALTER TABLE stores_petty_cash_items ADD COLUMN IF NOT EXISTS gst_pct     NUMERIC(5,2)  DEFAULT 0`);
  await safe(`ALTER TABLE stores_petty_cash_items ADD COLUMN IF NOT EXISTS gst_amount  NUMERIC(14,2) DEFAULT 0`);
  await safe(`ALTER TABLE stores_petty_cash_items ADD COLUMN IF NOT EXISTS total_amount NUMERIC(14,2) DEFAULT 0`);

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
  await safe(`ALTER TABLE stores_petty_cash_entries  ADD COLUMN IF NOT EXISTS je_reference TEXT`);
  await safe(`ALTER TABLE stores_petty_cash_advances ADD COLUMN IF NOT EXISTS je_reference TEXT`);
  await safe(`ALTER TABLE stores_petty_cash_receipts ADD COLUMN IF NOT EXISTS je_reference TEXT`);

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

  await safe(`
    CREATE TABLE IF NOT EXISTS stores_pc_sc_advances (
      id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
      company_id       UUID NOT NULL,
      project_id       UUID,
      advance_date     DATE NOT NULL,
      vendor_id        UUID,
      vendor_name      TEXT NOT NULL,
      wo_number        TEXT,
      amount           NUMERIC(14,2) NOT NULL,
      payment_mode     TEXT DEFAULT 'cash',
      reference_number TEXT,
      remarks          TEXT,
      status           TEXT DEFAULT 'issued',
      created_by       UUID,
      created_at       TIMESTAMPTZ DEFAULT NOW()
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

  await safe(`ALTER TABLE stores_petty_cash_entries ADD COLUMN IF NOT EXISTS pc_voucher_no TEXT`);
  await safe(`CREATE INDEX IF NOT EXISTS idx_spce_voucher ON stores_petty_cash_entries(pc_voucher_no)`);

  console.log('[StoresPettyCash] Schema OK');
})();

const n = (v) => parseFloat(v) || 0;

// Financial year string: April start. Jan-Mar 2026 → "2526"; Apr-Dec 2025 → "2526"
function currentFY() {
  const now = new Date();
  const startYear = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  return String(startYear).slice(2) + String(startYear + 1).slice(2);
}

async function nextPcVoucherNo(client, companyId, projectCode) {
  const fy   = currentFY();
  const proj = projectCode
    ? projectCode.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 8)
    : 'SITE';
  const prefix = `PC/${fy}/${proj}/`;
  const r = await client.query(
    `SELECT COALESCE(MAX(
       CASE WHEN pc_voucher_no ~ $2 THEN
         CAST(SPLIT_PART(pc_voucher_no, '/', 4) AS INTEGER)
       ELSE 0 END
     ), 0) AS last
     FROM stores_petty_cash_entries
     WHERE company_id = $1`,
    [companyId, `^PC/${fy}/${proj}/\\d+$`]
  );
  const seq = parseInt(r.rows[0].last) + 1;
  return `${prefix}${String(seq).padStart(3, '0')}`;
}

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
      `SELECT e.*, p.name AS project_name, u.name AS created_by_name, a.name AS approved_by_name,
              ph.name AS ph_approved_by_name,
              COALESCE(json_agg(json_build_object(
                'id', i.id, 'material_name', i.material_name, 'unit', i.unit, 'quantity', i.quantity,
                'rate', i.rate, 'gst_pct', i.gst_pct, 'gst_amount', i.gst_amount, 'total_amount', i.total_amount
              ) ORDER BY i.sort_order) FILTER (WHERE i.id IS NOT NULL), '[]') AS items
       FROM stores_petty_cash_entries e
       LEFT JOIN projects p ON p.id = e.project_id
       LEFT JOIN users    u ON u.id = e.created_by
       LEFT JOIN users    a ON a.id = e.approved_by
       LEFT JOIN users    ph ON ph.id = e.ph_approved_by
       LEFT JOIN stores_petty_cash_items i ON i.entry_id = e.id
       WHERE ${where}
       GROUP BY e.id, p.name, u.name, a.name, ph.name
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

    // Resolve project_code for voucher number prefix
    let projectCode = null;
    if (project_id) {
      const proj = await query(`SELECT project_code FROM projects WHERE id = $1`, [project_id]);
      if (proj.rows.length) projectCode = proj.rows[0].project_code;
    }

    const result = await withTransaction(async (client) => {
      const sl_no        = await nextSlNo(client, req.user.company_id, project_id);
      const pc_voucher_no = await nextPcVoucherNo(client, req.user.company_id, projectCode);
      const r = await client.query(
        `INSERT INTO stores_petty_cash_entries
          (company_id, project_id, sl_no, entry_date, supplier, invoice_no, amount, remarks, status,
           bill_file_url, bill_file_name, voucher_file_url, voucher_file_name, basic_amount, gst_pct, gst_amount, total_amount, created_by, pc_voucher_no)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19) RETURNING *`,
        [req.user.company_id, project_id || null, sl_no, entry_date, supplier.trim(),
         invoice_no || null, n(amount), remarks || null, status,
         bill_file_url || null, bill_file_name || null,
         voucher_file_url || null, voucher_file_name || null,
         basic_amount != null ? n(basic_amount) : null, n(gst_pct), n(gst_amount),
         total_amount != null ? n(total_amount) : null, req.user.id, pc_voucher_no]
      );
      const entryId = r.rows[0].id;
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        if (!it.material_name?.trim()) continue;
        const qty  = n(it.quantity);
        const rate = n(it.rate);
        const pct  = n(it.gst_pct);
        const basic = qty * rate;
        const gstAmt = +(basic * pct / 100).toFixed(2);
        const tot    = +(basic + gstAmt).toFixed(2);
        await client.query(
          `INSERT INTO stores_petty_cash_items (entry_id, material_name, unit, quantity, rate, gst_pct, gst_amount, total_amount, sort_order)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [entryId, it.material_name.trim(), it.unit || "NO'S", qty, rate, pct, gstAmt, tot, i + 1]
        );
      }
      return r.rows[0];
    });

    const full = await getEntry(result.id, req.user.company_id);
    res.status(201).json({ data: full });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Must be defined BEFORE /:id routes so Express does not treat 'clear-attachments' as a UUID param.
router.patch('/entries/clear-attachments', authenticate, async (req, res) => {
  try {
    const { project_id } = req.query;
    let sql = `UPDATE stores_petty_cash_entries
                  SET bill_file_url=NULL, bill_file_name=NULL,
                      voucher_file_url=NULL, voucher_file_name=NULL,
                      updated_at=NOW()
                WHERE company_id=$1`;
    const params = [req.user.company_id];
    if (project_id) { sql += ` AND project_id=$2`; params.push(project_id); }
    const r = await query(sql, params);
    res.json({ success: true, rows_updated: r.rowCount });
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
        const qty  = n(it.quantity);
        const rate = n(it.rate);
        const pct  = n(it.gst_pct);
        const basic = qty * rate;
        const gstAmt = +(basic * pct / 100).toFixed(2);
        const tot    = +(basic + gstAmt).toFixed(2);
        await client.query(
          `INSERT INTO stores_petty_cash_items (entry_id, material_name, unit, quantity, rate, gst_pct, gst_amount, total_amount, sort_order)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [req.params.id, it.material_name.trim(), it.unit || "NO'S", qty, rate, pct, gstAmt, tot, i + 1]
        );
      }
    });

    const full = await getEntry(req.params.id, req.user.company_id);
    res.json({ data: full });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch('/entries/:id/status', authenticate, async (req, res) => {
  try {
    const { status, remarks, rejected_reason } = req.body;
    if (!['Pending', 'ph_approved', 'Approved', 'Rejected'].includes(status)) {
      return res.status(400).json({ error: 'status must be Pending, ph_approved, Approved, or Rejected' });
    }
    const approvedBy  = status === 'Approved'    ? req.user.id : null;
    const phApprovedBy = status === 'ph_approved' ? req.user.id : null;
    const r = await query(
      `UPDATE stores_petty_cash_entries
          SET status=$1, updated_at=NOW(),
              ph_approved_by   = CASE WHEN $1='ph_approved' THEN $4::uuid ELSE ph_approved_by END,
              ph_approved_at   = CASE WHEN $1='ph_approved' THEN NOW()    ELSE ph_approved_at END,
              approved_by      = CASE WHEN $1='Approved'    THEN $5::uuid ELSE approved_by    END,
              approved_at      = CASE WHEN $1='Approved'    THEN NOW()    ELSE approved_at    END,
              approval_remarks = CASE WHEN $1='Approved'    THEN $6       ELSE approval_remarks END,
              rejected_reason  = CASE WHEN $1='Rejected'    THEN $7       ELSE rejected_reason  END
       WHERE id=$2 AND company_id=$3 RETURNING *`,
      [status, req.params.id, req.user.company_id, phApprovedBy, approvedBy, remarks || null, rejected_reason || null]
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

      try {
        const jeId = await postAutoJournalStandalone({
          companyId: req.user.company_id,
          userId:    req.user.id,
          entryDate: entry.entry_date,
          projectId: entry.project_id || null,
          reference: ref,
          narration: `Stores petty cash — ${entry.supplier}`,
          source:    'auto_stores_petty_cash',
          lines,
        });
        if (jeId) {
          const jeRow = await query(`SELECT entry_no FROM journal_entries WHERE id=$1`, [jeId]);
          const jeRef = jeRow.rows[0]?.entry_no;
          if (jeRef) {
            await query(`UPDATE stores_petty_cash_entries SET je_reference=$1 WHERE id=$2`, [jeRef, entry.id]);
            entry.je_reference = jeRef;
          }
        }
      } catch (_) {}
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
    const adv = r.rows[0];
    // Auto-post JV: Dr Advance to Vendors/Staff (1150), Cr Cash in Hand (1000)
    try {
      const jeId = await postAutoJournalStandalone({
        companyId: req.user.company_id,
        userId:    req.user.id,
        entryDate: advance_date,
        projectId: project_id || null,
        reference: `ADV-${adv.id.slice(0, 8).toUpperCase()}`,
        narration: `Petty cash advance — ${payee_name} (${description || 'SALARY ADVANCE'})`,
        source:    'auto_stores_petty_cash',
        lines: [
          { code: '1150', debit:  n(amount), description: `Advance to ${payee_name} — ${description || 'SALARY ADVANCE'}` },
          { code: '1000', credit: n(amount), description: `Cash paid — advance to ${payee_name}` },
        ],
      });
      if (jeId) {
        const jeRow = await query(`SELECT entry_no FROM journal_entries WHERE id=$1`, [jeId]);
        const jeRef = jeRow.rows[0]?.entry_no;
        if (jeRef) {
          await query(`UPDATE stores_petty_cash_advances SET je_reference=$1 WHERE id=$2`, [jeRef, adv.id]);
          adv.je_reference = jeRef;
        }
      }
    } catch (_) {}
    res.status(201).json({ data: adv });
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
    const rec = r.rows[0];
    // Auto-post JV: Dr Cash in Hand (1000), Cr Bank Accounts (1010) — replenishment from bank
    try {
      const jeId = await postAutoJournalStandalone({
        companyId: req.user.company_id,
        userId:    req.user.id,
        entryDate: receipt_date,
        projectId: project_id || null,
        reference: voucher_no || `RCP-${rec.id.slice(0, 8).toUpperCase()}`,
        narration: `Petty cash receipt — ${received_by || 'HO'}${voucher_no ? ' (' + voucher_no + ')' : ''}`,
        source:    'auto_stores_petty_cash',
        lines: [
          { code: '1000', debit:  n(amount), description: `Cash received — ${received_by || 'HO'}${voucher_no ? ' (' + voucher_no + ')' : ''}` },
          { code: '1010', credit: n(amount), description: `Bank transfer to petty cash${voucher_no ? ' — ' + voucher_no : ''}` },
        ],
      });
      if (jeId) {
        const jeRow = await query(`SELECT entry_no FROM journal_entries WHERE id=$1`, [jeId]);
        const jeRef = jeRow.rows[0]?.entry_no;
        if (jeRef) {
          await query(`UPDATE stores_petty_cash_receipts SET je_reference=$1 WHERE id=$2`, [jeRef, rec.id]);
          rec.je_reference = jeRef;
        }
      }
    } catch (_) {}
    res.status(201).json({ data: rec });
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

/* ═══════════════════════════════════════════════════════════════════════════
   SC (SUB-CONTRACTOR) ADVANCES
═══════════════════════════════════════════════════════════════════════════ */

// Vendor lookup for SC advance form
router.get('/sc-advances/lookup/vendors', authenticate, async (req, res) => {
  try {
    const { search } = req.query;
    const params = [req.user.company_id];
    let sql = `SELECT id, name, vendor_code FROM vendors WHERE company_id = $1 AND is_active = true`;
    if (search) { sql += ` AND name ILIKE $2`; params.push(`%${search}%`); }
    sql += ` ORDER BY name LIMIT 30`;
    const r = await query(sql, params);
    res.json({ data: r.rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// List SC advances
router.get('/sc-advances', authenticate, async (req, res) => {
  try {
    const { project_id, from, to } = req.query;
    const conditions = ['a.company_id = $1'];
    const params = [req.user.company_id];
    let p = 1;
    if (project_id) { conditions.push(`a.project_id = $${++p}`); params.push(project_id); }
    if (from)       { conditions.push(`a.advance_date >= $${++p}`); params.push(from); }
    if (to)         { conditions.push(`a.advance_date <= $${++p}`); params.push(to); }
    const r = await query(
      `SELECT a.*, pr.name AS project_name, u.name AS created_by_name
       FROM stores_pc_sc_advances a
       LEFT JOIN projects pr ON pr.id = a.project_id
       LEFT JOIN users    u  ON u.id  = a.created_by
       WHERE ${conditions.join(' AND ')}
       ORDER BY a.advance_date DESC, a.created_at DESC`,
      params
    );
    res.json({ data: r.rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Create SC advance
router.post('/sc-advances', authenticate, async (req, res) => {
  try {
    const { project_id, advance_date, vendor_id, vendor_name, wo_number, amount, payment_mode, reference_number, remarks } = req.body;
    if (!vendor_name || !advance_date || !amount) return res.status(400).json({ error: 'vendor_name, advance_date and amount are required' });
    const r = await query(
      `INSERT INTO stores_pc_sc_advances
         (company_id, project_id, advance_date, vendor_id, vendor_name, wo_number, amount, payment_mode, reference_number, remarks, status, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'issued',$11)
       RETURNING *`,
      [req.user.company_id, project_id || null, advance_date, vendor_id || null, vendor_name, wo_number || null, parseFloat(amount), payment_mode || 'cash', reference_number || null, remarks || null, req.user.id]
    );
    res.status(201).json({ data: r.rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Delete SC advance
router.delete('/sc-advances/:id', authenticate, async (req, res) => {
  try {
    await query(`DELETE FROM stores_pc_sc_advances WHERE id = $1 AND company_id = $2`, [req.params.id, req.user.company_id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* ── Backfill voucher numbers for existing entries that have none ── */
router.post('/backfill-vouchers', authenticate, async (req, res) => {
  try {
    const companyId = req.user.company_id;

    // Fetch all entries without a voucher number, ordered chronologically so
    // sequence numbers reflect entry order
    const untagged = await query(
      `SELECT e.id, e.entry_date, e.project_id, p.project_code
       FROM stores_petty_cash_entries e
       LEFT JOIN projects p ON p.id = e.project_id
       WHERE e.company_id = $1 AND (e.pc_voucher_no IS NULL OR e.pc_voucher_no = '')
       ORDER BY e.entry_date ASC, e.sl_no ASC, e.id ASC`,
      [companyId]
    );

    if (!untagged.rows.length) {
      return res.json({ updated: 0, message: 'All entries already have voucher numbers.' });
    }

    const fy = currentFY();
    let updated = 0;

    await withTransaction(async (client) => {
      for (const row of untagged.rows) {
        const proj = row.project_code
          ? row.project_code.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 8)
          : 'SITE';
        const prefix = `PC/${fy}/${proj}/`;

        // Get the current max seq for this company+proj prefix inside the transaction
        const r = await client.query(
          `SELECT COALESCE(MAX(
             CASE WHEN pc_voucher_no ~ $2 THEN
               CAST(SPLIT_PART(pc_voucher_no, '/', 4) AS INTEGER)
             ELSE 0 END
           ), 0) AS last
           FROM stores_petty_cash_entries
           WHERE company_id = $1`,
          [companyId, `^PC/${fy}/${proj}/\\d+$`]
        );
        const seq = parseInt(r.rows[0].last) + 1;
        const voucherNo = `${prefix}${String(seq).padStart(3, '0')}`;

        await client.query(
          `UPDATE stores_petty_cash_entries SET pc_voucher_no = $1 WHERE id = $2`,
          [voucherNo, row.id]
        );
        updated++;
      }
    });

    res.json({ updated, message: `${updated} voucher number(s) assigned successfully.` });
  } catch (err) {
    console.error('[SPC] backfill-vouchers error:', err);
    res.status(500).json({ error: err.message });
  }
});

/* ═══════════════════════════════════════════════════════════════════════════
   WEEKLY REPORT — same style as Daily Activity Digest
═══════════════════════════════════════════════════════════════════════════ */

router.post('/email-weekly-report', authenticate, async (req, res) => {
  try {
    const { sendMail } = require('../services/mail.service');
    const companyId = req.user.company_id;

    const { from: reqFrom, to: reqTo, recipient = 'it@bcim.in' } = req.body || {};
    let weekFrom, weekTo;
    if (reqFrom && reqTo) {
      weekFrom = reqFrom;
      weekTo   = reqTo;
    } else {
      const now = new Date();
      const dow = now.getDay();
      const lastSun = new Date(now); lastSun.setDate(now.getDate() - dow);
      const lastMon = new Date(lastSun); lastMon.setDate(lastSun.getDate() - 6);
      const pad = (x) => String(x).padStart(2, '0');
      const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
      weekFrom = ymd(lastMon);
      weekTo   = ymd(lastSun);
    }

    const esc  = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const inrF = (v) => 'Rs ' + Number(v||0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const fmtD = (v) => v ? new Date(v).toLocaleDateString('en-IN') : '-';

    const th = 'padding:8px;border:1px solid #dbe4f0;background:#0f2a52;color:#fff;font-size:11px;text-align:left;white-space:nowrap';
    const td = 'padding:7px 8px;border:1px solid #dbe4f0;font-size:11px;vertical-align:top;color:#10233f';
    const tdr = `${td};text-align:right;font-family:monospace`;

    const section = (title, rows, cols, renderRow) => {
      if (!rows.length) return '';
      const cap = 50;
      const shown = rows.slice(0, cap).map(renderRow).join('');
      const more = rows.length > cap
        ? `<tr><td colspan="${cols.length}" style="${td};text-align:center;font-style:italic;color:#64748b">...and ${rows.length - cap} more</td></tr>`
        : '';
      return `
        <p style="margin:18px 0 6px;font-size:13px;font-weight:800;color:#0f2a52;text-transform:uppercase;letter-spacing:0.04em">
          ${title} &mdash; ${rows.length}
        </p>
        <table style="width:100%;border-collapse:collapse">
          <thead><tr>${cols.map(c => `<th style="${th}">${c}</th>`).join('')}</tr></thead>
          <tbody>${shown}${more}</tbody>
        </table>`;
    };

    const [entriesR, advancesR, receiptsR, scAdvR] = await Promise.all([
      query(
        `SELECT e.id, e.entry_date, e.sl_no, e.supplier, e.invoice_no, e.amount,
                e.basic_amount, e.gst_pct, e.gst_amount, e.total_amount,
                e.status, e.pc_voucher_no, e.remarks,
                p.name AS project_name,
                COALESCE(
                  json_agg(json_build_object('material_name', i.material_name) ORDER BY i.sort_order)
                  FILTER (WHERE i.id IS NOT NULL), '[]'
                ) AS items
         FROM stores_petty_cash_entries e
         LEFT JOIN projects p ON p.id = e.project_id
         LEFT JOIN stores_petty_cash_items i ON i.entry_id = e.id
         WHERE e.company_id = $1 AND e.entry_date BETWEEN $2 AND $3
         GROUP BY e.id, p.name ORDER BY e.entry_date, e.sl_no`,
        [companyId, weekFrom, weekTo]
      ),
      query(
        `SELECT a.id, a.advance_date, a.payee_name, a.amount, a.description,
                p.name AS project_name
         FROM stores_petty_cash_advances a
         LEFT JOIN projects p ON p.id = a.project_id
         WHERE a.company_id = $1 AND a.advance_date BETWEEN $2 AND $3
         ORDER BY a.advance_date`,
        [companyId, weekFrom, weekTo]
      ),
      query(
        `SELECT r.id, r.receipt_date, r.amount, r.voucher_no, r.received_by, r.remarks,
                p.name AS project_name
         FROM stores_petty_cash_receipts r
         LEFT JOIN projects p ON p.id = r.project_id
         WHERE r.company_id = $1 AND r.receipt_date BETWEEN $2 AND $3
         ORDER BY r.receipt_date`,
        [companyId, weekFrom, weekTo]
      ),
      query(
        `SELECT s.id, s.advance_date, s.vendor_name, s.amount, s.wo_number, s.remarks AS description,
                p.name AS project_name
         FROM stores_pc_sc_advances s
         LEFT JOIN projects p ON p.id = s.project_id
         WHERE s.company_id = $1 AND s.advance_date BETWEEN $2 AND $3
         ORDER BY s.advance_date`,
        [companyId, weekFrom, weekTo]
      ),
    ]);

    const entries  = entriesR.rows;
    const advances = advancesR.rows;
    const receipts = receiptsR.rows;
    const scAdvs   = scAdvR.rows;

    const approvedEntries = entries.filter(e => e.status === 'Approved');
    const pendingEntries  = entries.filter(e => e.status === 'Pending');

    const totalRec   = receipts.reduce((s, r) => s + n(r.amount), 0);
    const totalLP    = approvedEntries.reduce((s, r) => s + n(r.amount), 0);
    const totalAdv   = advances.reduce((s, r) => s + n(r.amount), 0);
    const totalSC    = scAdvs.reduce((s, r) => s + n(r.amount), 0);
    const totalSpent = totalLP + totalAdv + totalSC;
    const balance    = totalRec - totalSpent;

    const recSection = section(
      'A. Cash Received from HO',
      receipts,
      ['#', 'Date', 'Project', 'Voucher No', 'Received By', 'Remarks', 'Amount (Rs)'],
      (r, i) => `<tr>
        <td style="${td}">${i+1}</td>
        <td style="${td}">${fmtD(r.receipt_date)}</td>
        <td style="${td}">${esc(r.project_name||'-')}</td>
        <td style="${td};font-family:monospace;font-weight:700">${esc(r.voucher_no||'-')}</td>
        <td style="${td}">${esc(r.received_by||'-')}</td>
        <td style="${td}">${esc(r.remarks||'-')}</td>
        <td style="${tdr};font-weight:700">${inrF(r.amount)}</td>
      </tr>`
    );

    const lpSection = section(
      'B. Local Purchases — All Entries',
      entries,
      ['#', 'Date', 'Voucher No', 'Project', 'Supplier', 'Materials', 'Invoice No', 'Basic', 'GST%', 'Total', 'Status'],
      (r, i) => {
        const sc = r.status === 'Approved' ? '#15803d' : r.status === 'Rejected' ? '#b91c1c' : '#b45309';
        const mats = (r.items || []).map(it => it.material_name).filter(Boolean).join(', ') || '-';
        return `<tr>
          <td style="${td}">${i+1}</td>
          <td style="${td}">${fmtD(r.entry_date)}</td>
          <td style="${td};font-family:monospace;font-weight:700">${esc(r.pc_voucher_no||'-')}</td>
          <td style="${td}">${esc(r.project_name||'-')}</td>
          <td style="${td}">${esc(r.supplier||'-')}</td>
          <td style="${td}">${esc(mats)}</td>
          <td style="${td}">${esc(r.invoice_no||'-')}</td>
          <td style="${tdr}">${inrF(r.basic_amount||r.amount)}</td>
          <td style="${td};text-align:center">${r.gst_pct ? r.gst_pct+'%' : '-'}</td>
          <td style="${tdr};font-weight:700">${inrF(r.total_amount||r.amount)}</td>
          <td style="${td};font-weight:700;color:${sc}">${esc(r.status||'-')}</td>
        </tr>`;
      }
    );

    const advSection = section(
      'C. Salary Advances',
      advances,
      ['#', 'Date', 'Project', 'Employee Name', 'Description', 'Amount (Rs)'],
      (r, i) => `<tr>
        <td style="${td}">${i+1}</td>
        <td style="${td}">${fmtD(r.advance_date)}</td>
        <td style="${td}">${esc(r.project_name||'-')}</td>
        <td style="${td};font-weight:700">${esc(r.payee_name||'-')}</td>
        <td style="${td}">${esc(r.description||'-')}</td>
        <td style="${tdr};font-weight:700">${inrF(r.amount)}</td>
      </tr>`
    );

    const scSection = section(
      'D. Sub Contractor Advances',
      scAdvs,
      ['#', 'Date', 'Project', 'Sub-Contractor', 'WO No', 'Description', 'Amount (Rs)'],
      (r, i) => `<tr>
        <td style="${td}">${i+1}</td>
        <td style="${td}">${fmtD(r.advance_date)}</td>
        <td style="${td}">${esc(r.project_name||'-')}</td>
        <td style="${td};font-weight:700">${esc(r.vendor_name||'-')}</td>
        <td style="${td};font-family:monospace">${esc(r.wo_number||'-')}</td>
        <td style="${td}">${esc(r.description||'-')}</td>
        <td style="${tdr};font-weight:700">${inrF(r.amount)}</td>
      </tr>`
    );

    const summarySection = `
      <p style="margin:18px 0 6px;font-size:13px;font-weight:800;color:#0f2a52;text-transform:uppercase;letter-spacing:0.04em">
        E. Week Summary
      </p>
      <table style="width:340px;border-collapse:collapse">
        <thead><tr><th style="${th}">Item</th><th style="${th};text-align:right">Amount</th></tr></thead>
        <tbody>
          <tr style="background:#f0f6ff"><td style="${td};font-weight:700">Total Cash Received from HO</td><td style="${tdr};font-weight:700;color:#15803d">${inrF(totalRec)}</td></tr>
          <tr><td style="${td}">Less: Local Purchases (Approved)</td><td style="${tdr}">${inrF(totalLP)}</td></tr>
          <tr><td style="${td}">Less: Salary Advances</td><td style="${tdr}">${inrF(totalAdv)}</td></tr>
          <tr><td style="${td}">Less: Sub Contractor Advances</td><td style="${tdr}">${inrF(totalSC)}</td></tr>
          <tr style="border-top:2px solid #0f2a52;background:#eaf0fb">
            <td style="${td};font-weight:800;font-size:12px">Net Cash Balance This Week</td>
            <td style="${tdr};font-weight:800;font-size:12px;color:${balance<0?'#b91c1c':'#15803d'}">${inrF(Math.abs(balance))}${balance<0?' Dr':''}</td>
          </tr>
          ${pendingEntries.length ? `<tr><td style="${td};color:#b45309">Pending approval</td><td style="${td};color:#b45309;text-align:right">${pendingEntries.length} entr${pendingEntries.length===1?'y':'ies'}</td></tr>` : ''}
        </tbody>
      </table>`;

    const cards = [
      { label: 'HO Receipts',     count: receipts.length },
      { label: 'Local Purchases', count: entries.length },
      { label: 'Approved',        count: approvedEntries.length },
      { label: 'Pending',         count: pendingEntries.length },
      { label: 'Salary Advances', count: advances.length },
      { label: 'SC Advances',     count: scAdvs.length },
    ];
    const totalItems = receipts.length + entries.length + advances.length + scAdvs.length;

    const cardCell = (d) => `
      <td style="padding:10px;border:1px solid #dbe4f0;background:${d.count>0?'#f6f9fc':'#fafafa'};text-align:center">
        <div style="font-size:20px;font-weight:800;color:${d.count>0?'#0f2a52':'#94a3b8'}">${d.count}</div>
        <div style="font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:0.03em;margin-top:2px">${d.label}</div>
      </td>`;
    const cardRowsHtml = `<tr>${cards.map(cardCell).join('')}</tr>`;

    const weekLabel = `${fmtD(weekFrom)} to ${fmtD(weekTo)}`;
    const subject = `Stores Petty Cash Weekly Report — ${weekLabel} — ${totalItems} transaction(s)`;

    const html = `
<div style="font-family:Arial,sans-serif;max-width:1180px;margin:0 auto;color:#10233f">
  <div style="background:linear-gradient(135deg,#0f2a52,#16386b);padding:18px 22px;border-radius:8px 8px 0 0">
    <h2 style="margin:0;color:#fff;font-size:18px">Stores Petty Cash &mdash; Weekly Report</h2>
    <p style="margin:6px 0 0;color:#cfe0ff;font-size:12px">BCIM Engineering Private Limited &bull; ${weekLabel} &bull; Generated by ${esc(req.user.name||req.user.email)}</p>
  </div>
  <div style="padding:20px 22px;border:1px solid #dbe4f0;border-top:none;border-radius:0 0 8px 8px;background:#fff">
    <p style="margin:0 0 14px;font-size:13px">
      ${totalItems
        ? `A total of <strong>${totalItems}</strong> petty cash transaction(s) recorded this week &mdash; <strong>${approvedEntries.length}</strong> purchases approved, <strong>${pendingEntries.length}</strong> pending.`
        : `No petty cash transactions were recorded this week.`}
    </p>
    <table style="width:100%;border-collapse:collapse;margin-bottom:4px">${cardRowsHtml}</table>
    ${recSection}
    ${lpSection}
    ${advSection}
    ${scSection}
    ${summarySection}
    <p style="margin:20px 0 0;font-size:12px">
      <a href="https://erp.bcim.in" style="display:inline-block;background:#0f2a52;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;font-weight:700">
        Open BCIM ERP
      </a>
    </p>
    <p style="margin:16px 0 0;font-size:10px;color:#8aa0bf">
      Automated weekly petty cash digest from BCIM ERP. Period: ${weekLabel}. Approved totals only used in cash balance.
    </p>
  </div>
</div>`;

    const result = await sendMail({
      to: recipient,
      subject,
      html,
      text: `Stores Petty Cash Weekly Report — ${weekLabel}\n\nTotal Received: ${inrF(totalRec)}\nApproved Purchases: ${inrF(totalLP)}\nSalary Advances: ${inrF(totalAdv)}\nSC Advances: ${inrF(totalSC)}\nNet: ${inrF(Math.abs(balance))}${balance<0?' Dr':''}\n\nView at: https://erp.bcim.in`,
    });

    res.json({ sent: result.sent, recipient, period: { from: weekFrom, to: weekTo }, summary: { totalRec, totalLP, totalAdv, totalSC, balance, entries: entries.length, pending: pendingEntries.length } });
  } catch (err) {
    console.error('[SPC] email-weekly-report error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
