// src/routes/credit-notes.routes.js
const express = require('express');
const { authenticate } = require('../middleware/auth');
const { query, withTransaction } = require('../config/database');
const { postAutoJournal } = require('../services/journalAutoPost');
const router = express.Router();

// ── Auto-migrate ─────────────────────────────────────────────────────────────
(async () => {
  const safe = async (sql) => {
    try { await query(sql); } catch (_) {}
  };

  await safe(`
    CREATE TABLE IF NOT EXISTS credit_notes (
      id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
      cn_number    TEXT UNIQUE NOT NULL,
      cn_date      DATE NOT NULL,
      vendor_id    UUID,
      vendor_name  TEXT NOT NULL,
      project_id   UUID,
      po_id        UUID,
      po_number    TEXT,
      grn_id       UUID,
      grn_number   TEXT,
      invoice_number TEXT,
      invoice_date   DATE,
      cn_type      TEXT DEFAULT 'other',
      reason       TEXT,
      tax_mode     TEXT DEFAULT 'intrastate',
      basic_amount NUMERIC(14,2) DEFAULT 0,
      cgst_pct     NUMERIC(5,2)  DEFAULT 0,
      cgst_amt     NUMERIC(14,2) DEFAULT 0,
      sgst_pct     NUMERIC(5,2)  DEFAULT 0,
      sgst_amt     NUMERIC(14,2) DEFAULT 0,
      igst_pct     NUMERIC(5,2)  DEFAULT 0,
      igst_amt     NUMERIC(14,2) DEFAULT 0,
      gst_amount   NUMERIC(14,2) DEFAULT 0,
      total_amount NUMERIC(14,2) DEFAULT 0,
      status       TEXT DEFAULT 'pending',
      remarks      TEXT,
      created_by   UUID,
      company_id   UUID,
      created_at   TIMESTAMPTZ DEFAULT NOW(),
      updated_at   TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await safe(`
    CREATE TABLE IF NOT EXISTS credit_note_items (
      id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
      cn_id         UUID NOT NULL REFERENCES credit_notes(id) ON DELETE CASCADE,
      material_name TEXT NOT NULL,
      unit          TEXT DEFAULT 'Nos',
      quantity      NUMERIC(14,3) DEFAULT 0,
      rate          NUMERIC(14,2) DEFAULT 0,
      amount        NUMERIC(14,2) DEFAULT 0,
      grn_item_id   UUID,
      po_item_id    UUID,
      sort_order    INTEGER DEFAULT 0
    )
  `);

  await safe(`CREATE INDEX IF NOT EXISTS idx_cn_vendor  ON credit_notes(vendor_id)`);
  await safe(`CREATE INDEX IF NOT EXISTS idx_cn_project ON credit_notes(project_id)`);
  await safe(`CREATE INDEX IF NOT EXISTS idx_cn_status  ON credit_notes(status)`);
  await safe(`ALTER TABLE credit_notes ADD COLUMN IF NOT EXISTS bill_id UUID`);
  await safe(`CREATE INDEX IF NOT EXISTS idx_cni_cn     ON credit_note_items(cn_id)`);

  console.log('[CreditNotes] Schema OK');
})();

// ── helpers ──────────────────────────────────────────────────────────────────
const n = (v) => parseFloat(v) || 0;

async function nextCNNumber(companyId) {
  const yr = new Date().getFullYear();
  const r = await query(
    `SELECT COUNT(*) FROM credit_notes WHERE company_id = $1 AND EXTRACT(YEAR FROM created_at) = $2`,
    [companyId, yr]
  );
  const seq = String(parseInt(r.rows[0].count) + 1).padStart(4, '0');
  return `CN/${yr}/${seq}`;
}

async function getCN(id, companyId) {
  const r = await query(
    `SELECT cn.*,
            u.name AS created_by_name
     FROM credit_notes cn
     LEFT JOIN users u ON u.id = cn.created_by
     WHERE cn.id = $1 AND cn.company_id = $2`,
    [id, companyId]
  );
  if (!r.rows.length) return null;
  const items = await query(
    `SELECT * FROM credit_note_items WHERE cn_id = $1 ORDER BY sort_order`,
    [id]
  );
  return { ...r.rows[0], items: items.rows };
}

// ── LIST ─────────────────────────────────────────────────────────────────────
router.get('/', authenticate, async (req, res) => {
  try {
    const { project_id, vendor_id, status, cn_type, from, to, search, limit = 100, offset = 0 } = req.query;
    const conditions = ['cn.company_id = $1'];
    const params = [req.user.company_id];
    let p = 1;

    if (project_id) { conditions.push(`cn.project_id = $${++p}`); params.push(project_id); }
    if (vendor_id)  { conditions.push(`cn.vendor_id  = $${++p}`); params.push(vendor_id); }
    if (status)     { conditions.push(`cn.status     = $${++p}`); params.push(status); }
    if (cn_type)    { conditions.push(`cn.cn_type    = $${++p}`); params.push(cn_type); }
    if (from)       { conditions.push(`cn.cn_date   >= $${++p}`); params.push(from); }
    if (to)         { conditions.push(`cn.cn_date   <= $${++p}`); params.push(to); }
    if (search) {
      conditions.push(`(cn.cn_number ILIKE $${++p} OR cn.vendor_name ILIKE $${p} OR cn.invoice_number ILIKE $${p})`);
      params.push(`%${search}%`);
    }

    const where = conditions.join(' AND ');
    const rows = await query(
      `SELECT cn.*,
              p.name AS project_name,
              u.name AS created_by_name
       FROM credit_notes cn
       LEFT JOIN projects p ON p.id = cn.project_id
       LEFT JOIN users    u ON u.id = cn.created_by
       WHERE ${where}
       ORDER BY cn.cn_date DESC, cn.created_at DESC
       LIMIT $${++p} OFFSET $${++p}`,
      [...params, limit, offset]
    );
    const total = await query(
      `SELECT COUNT(*) FROM credit_notes cn WHERE ${where}`,
      params.slice(0, p - 2)
    );
    res.json({ data: rows.rows, total: parseInt(total.rows[0].count) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET ONE ───────────────────────────────────────────────────────────────────
router.get('/:id', authenticate, async (req, res) => {
  try {
    const cn = await getCN(req.params.id, req.user.company_id);
    if (!cn) return res.status(404).json({ error: 'Credit note not found' });
    res.json({ data: cn });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── CREATE ────────────────────────────────────────────────────────────────────
router.post('/', authenticate, async (req, res) => {
  try {
    const {
      cn_date, vendor_id, vendor_name,
      project_id, po_id, po_number,
      grn_id, grn_number,
      bill_id,
      invoice_number, invoice_date,
      cn_type = 'other', reason,
      tax_mode = 'intrastate',
      basic_amount = 0,
      cgst_pct = 0, cgst_amt = 0,
      sgst_pct = 0, sgst_amt = 0,
      igst_pct = 0, igst_amt = 0,
      remarks,
      items = [],
    } = req.body;

    if (!cn_date)     return res.status(400).json({ error: 'cn_date is required' });
    if (!vendor_name) return res.status(400).json({ error: 'vendor_name is required' });

    const cn_number = await nextCNNumber(req.user.company_id);

    const gst_amount  = n(cgst_amt) + n(sgst_amt) + n(igst_amt);
    const total_amount = n(basic_amount) + gst_amount;

    const result = await withTransaction(async (client) => {
      const r = await client.query(
        `INSERT INTO credit_notes (
          cn_number, cn_date, vendor_id, vendor_name,
          project_id, po_id, po_number,
          grn_id, grn_number, bill_id,
          invoice_number, invoice_date,
          cn_type, reason, tax_mode,
          basic_amount, cgst_pct, cgst_amt, sgst_pct, sgst_amt,
          igst_pct, igst_amt, gst_amount, total_amount,
          status, remarks, created_by, company_id
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
          $11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,
          'pending',$25,$26,$27
        ) RETURNING *`,
        [
          cn_number, cn_date, vendor_id || null, vendor_name,
          project_id || null, po_id || null, po_number || null,
          grn_id || null, grn_number || null, bill_id || null,
          invoice_number || null, invoice_date || null,
          cn_type, reason || null, tax_mode,
          n(basic_amount), n(cgst_pct), n(cgst_amt), n(sgst_pct), n(sgst_amt),
          n(igst_pct), n(igst_amt), gst_amount, total_amount,
          remarks || null, req.user.id, req.user.company_id,
        ]
      );
      const cnId = r.rows[0].id;

      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        if (!it.material_name?.trim()) continue;
        const amt = n(it.quantity) * n(it.rate);
        await client.query(
          `INSERT INTO credit_note_items (cn_id, material_name, unit, quantity, rate, amount, grn_item_id, po_item_id, sort_order)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [cnId, it.material_name, it.unit || 'Nos', n(it.quantity), n(it.rate),
           n(it.amount) || amt, it.grn_item_id || null, it.po_item_id || null, i + 1]
        );
      }

      // ── Auto-post journal entry: Dr Accounts Payable, Cr Material Cost + Input GST ──
      await postAutoJournal(client, {
        companyId: req.user.company_id,
        userId: req.user.id,
        entryDate: cn_date,
        reference: cn_number,
        narration: `Credit Note ${cn_number} — ${vendor_name}`,
        source: 'auto_credit_note',
        lines: [
          { code: '2000', debit: total_amount, description: `Credit Note ${cn_number}` },
          { code: '5000', credit: n(basic_amount), description: `Credit Note ${cn_number} — material cost reversal` },
          { code: '1300', credit: gst_amount, description: `Credit Note ${cn_number} — ITC reversal` },
        ],
      });

      return r.rows[0];
    });

    const full = await getCN(result.id, req.user.company_id);
    res.status(201).json({ data: full });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── UPDATE ────────────────────────────────────────────────────────────────────
router.put('/:id', authenticate, async (req, res) => {
  try {
    const existing = await getCN(req.params.id, req.user.company_id);
    if (!existing) return res.status(404).json({ error: 'Credit note not found' });
    if (existing.status === 'applied') return res.status(400).json({ error: 'Applied credit notes cannot be edited' });

    const {
      cn_date, vendor_id, vendor_name,
      project_id, po_id, po_number,
      grn_id, grn_number,
      bill_id,
      invoice_number, invoice_date,
      cn_type = 'other', reason,
      tax_mode = 'intrastate',
      basic_amount = 0,
      cgst_pct = 0, cgst_amt = 0,
      sgst_pct = 0, sgst_amt = 0,
      igst_pct = 0, igst_amt = 0,
      remarks,
      items = [],
    } = req.body;

    const gst_amount   = n(cgst_amt) + n(sgst_amt) + n(igst_amt);
    const total_amount = n(basic_amount) + gst_amount;

    await withTransaction(async (client) => {
      await client.query(
        `UPDATE credit_notes SET
          cn_date=$1, vendor_id=$2, vendor_name=$3,
          project_id=$4, po_id=$5, po_number=$6,
          grn_id=$7, grn_number=$8, bill_id=$9,
          invoice_number=$10, invoice_date=$11,
          cn_type=$12, reason=$13, tax_mode=$14,
          basic_amount=$15, cgst_pct=$16, cgst_amt=$17,
          sgst_pct=$18, sgst_amt=$19, igst_pct=$20, igst_amt=$21,
          gst_amount=$22, total_amount=$23,
          remarks=$24, updated_at=NOW()
         WHERE id=$25`,
        [
          cn_date, vendor_id || null, vendor_name,
          project_id || null, po_id || null, po_number || null,
          grn_id || null, grn_number || null, bill_id || null,
          invoice_number || null, invoice_date || null,
          cn_type, reason || null, tax_mode,
          n(basic_amount), n(cgst_pct), n(cgst_amt),
          n(sgst_pct), n(sgst_amt), n(igst_pct), n(igst_amt),
          gst_amount, total_amount,
          remarks || null, req.params.id,
        ]
      );
      await client.query(`DELETE FROM credit_note_items WHERE cn_id = $1`, [req.params.id]);
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        if (!it.material_name?.trim()) continue;
        const amt = n(it.quantity) * n(it.rate);
        await client.query(
          `INSERT INTO credit_note_items (cn_id, material_name, unit, quantity, rate, amount, grn_item_id, po_item_id, sort_order)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [req.params.id, it.material_name, it.unit || 'Nos', n(it.quantity), n(it.rate),
           n(it.amount) || amt, it.grn_item_id || null, it.po_item_id || null, i + 1]
        );
      }
    });

    const full = await getCN(req.params.id, req.user.company_id);
    res.json({ data: full });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── STATUS UPDATE (apply / refund / cancel) ───────────────────────────────────
router.patch('/:id/status', authenticate, async (req, res) => {
  try {
    const { status } = req.body;
    const allowed = ['pending', 'applied', 'refunded', 'cancelled'];
    if (!allowed.includes(status)) return res.status(400).json({ error: `status must be one of: ${allowed.join(', ')}` });

    const existing = await getCN(req.params.id, req.user.company_id);
    if (!existing) return res.status(404).json({ error: 'Credit note not found' });

    await query(
      `UPDATE credit_notes SET status = $1, updated_at = NOW() WHERE id = $2`,
      [status, req.params.id]
    );
    const full = await getCN(req.params.id, req.user.company_id);
    res.json({ data: full });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE (pending only) ─────────────────────────────────────────────────────
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const existing = await getCN(req.params.id, req.user.company_id);
    if (!existing) return res.status(404).json({ error: 'Credit note not found' });
    if (existing.status !== 'pending') return res.status(400).json({ error: 'Only pending credit notes can be deleted' });

    await query(`DELETE FROM credit_notes WHERE id = $1`, [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
