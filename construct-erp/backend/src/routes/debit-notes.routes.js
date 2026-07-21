// src/routes/debit-notes.routes.js
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
    CREATE TABLE IF NOT EXISTS debit_notes (
      id             UUID DEFAULT gen_random_uuid() PRIMARY KEY,
      dn_number      TEXT UNIQUE NOT NULL,
      dn_date        DATE NOT NULL,
      vendor_id      UUID,
      vendor_name    TEXT NOT NULL,
      project_id     UUID,
      invoice_number TEXT,
      invoice_date   DATE,
      reason         TEXT,
      tax_mode       TEXT DEFAULT 'intrastate',
      basic_amount   NUMERIC(14,2) DEFAULT 0,
      cgst_pct       NUMERIC(5,2)  DEFAULT 0,
      cgst_amt       NUMERIC(14,2) DEFAULT 0,
      sgst_pct       NUMERIC(5,2)  DEFAULT 0,
      sgst_amt       NUMERIC(14,2) DEFAULT 0,
      igst_pct       NUMERIC(5,2)  DEFAULT 0,
      igst_amt       NUMERIC(14,2) DEFAULT 0,
      gst_amount     NUMERIC(14,2) DEFAULT 0,
      total_amount   NUMERIC(14,2) DEFAULT 0,
      status         TEXT DEFAULT 'pending',
      remarks        TEXT,
      created_by     UUID,
      company_id     UUID,
      created_at     TIMESTAMPTZ DEFAULT NOW(),
      updated_at     TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await safe(`
    CREATE TABLE IF NOT EXISTS debit_note_items (
      id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
      dn_id         UUID NOT NULL REFERENCES debit_notes(id) ON DELETE CASCADE,
      material_name TEXT NOT NULL,
      unit          TEXT DEFAULT 'Nos',
      quantity      NUMERIC(14,3) DEFAULT 0,
      rate          NUMERIC(14,2) DEFAULT 0,
      amount        NUMERIC(14,2) DEFAULT 0,
      sort_order    INTEGER DEFAULT 0
    )
  `);

  await safe(`ALTER TABLE debit_notes ADD COLUMN IF NOT EXISTS bill_id UUID`);
  await safe(`ALTER TABLE tqs_bills   ADD COLUMN IF NOT EXISTS debit_note_num TEXT`);
  await safe(`ALTER TABLE tqs_bills   ADD COLUMN IF NOT EXISTS debit_note_val NUMERIC(14,2) DEFAULT 0`);

  await safe(`CREATE INDEX IF NOT EXISTS idx_dn_vendor  ON debit_notes(vendor_id)`);
  await safe(`CREATE INDEX IF NOT EXISTS idx_dn_project ON debit_notes(project_id)`);
  await safe(`CREATE INDEX IF NOT EXISTS idx_dn_status  ON debit_notes(status)`);
  await safe(`CREATE INDEX IF NOT EXISTS idx_dni_dn     ON debit_note_items(dn_id)`);

  console.log('[DebitNotes] Schema OK');
})();

const n = (v) => parseFloat(v) || 0;

async function nextDNNumber(client, companyId) {
  const yr = new Date().getFullYear();
  const r = await client.query(
    `SELECT COALESCE(MAX(CAST(REGEXP_REPLACE(dn_number, '^DN/[0-9]+/', '') AS INTEGER)), 0) AS last_seq
     FROM debit_notes WHERE company_id = $1 AND dn_number LIKE $2`,
    [companyId, `DN/${yr}/%`]
  );
  return `DN/${yr}/${String(parseInt(r.rows[0].last_seq) + 1).padStart(4, '0')}`;
}

async function getDN(id, companyId) {
  const r = await query(
    `SELECT dn.*, p.name AS project_name, u.name AS created_by_name
     FROM debit_notes dn
     LEFT JOIN projects p ON p.id = dn.project_id
     LEFT JOIN users    u ON u.id = dn.created_by
     WHERE dn.id = $1 AND dn.company_id = $2`,
    [id, companyId]
  );
  if (!r.rows.length) return null;
  const items = await query(`SELECT * FROM debit_note_items WHERE dn_id = $1 ORDER BY sort_order`, [id]);
  return { ...r.rows[0], items: items.rows };
}

// ── LIST ─────────────────────────────────────────────────────────────────────
router.get('/', authenticate, async (req, res) => {
  try {
    const { project_id, vendor_id, status, search, limit = 100, offset = 0 } = req.query;
    const conditions = ['dn.company_id = $1'];
    const params = [req.user.company_id];
    let p = 1;

    if (project_id) { conditions.push(`dn.project_id = $${++p}`); params.push(project_id); }
    if (vendor_id)  { conditions.push(`dn.vendor_id  = $${++p}`); params.push(vendor_id); }
    if (status)     { conditions.push(`dn.status     = $${++p}`); params.push(status); }
    if (search) {
      conditions.push(`(dn.dn_number ILIKE $${++p} OR dn.vendor_name ILIKE $${p} OR dn.invoice_number ILIKE $${p})`);
      params.push(`%${search}%`);
    }

    const where = conditions.join(' AND ');
    const rows = await query(
      `SELECT dn.*, p.name AS project_name, u.name AS created_by_name
       FROM debit_notes dn
       LEFT JOIN projects p ON p.id = dn.project_id
       LEFT JOIN users    u ON u.id = dn.created_by
       WHERE ${where}
       ORDER BY dn.dn_date DESC, dn.created_at DESC
       LIMIT $${++p} OFFSET $${++p}`,
      [...params, limit, offset]
    );
    res.json({ data: rows.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET ONE ──────────────────────────────────────────────────────────────────
router.get('/:id', authenticate, async (req, res) => {
  try {
    const dn = await getDN(req.params.id, req.user.company_id);
    if (!dn) return res.status(404).json({ error: 'Debit note not found' });
    res.json({ data: dn });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── CREATE ───────────────────────────────────────────────────────────────────
router.post('/', authenticate, async (req, res) => {
  try {
    const {
      dn_date, vendor_id, vendor_name, project_id,
      bill_id,
      invoice_number, invoice_date, reason,
      tax_mode = 'intrastate',
      basic_amount = 0,
      cgst_pct = 0, cgst_amt = 0,
      sgst_pct = 0, sgst_amt = 0,
      igst_pct = 0, igst_amt = 0,
      remarks, items = [],
    } = req.body;

    if (!dn_date)     return res.status(400).json({ error: 'dn_date is required' });
    if (!vendor_name) return res.status(400).json({ error: 'vendor_name is required' });

    const gst_amount   = n(cgst_amt) + n(sgst_amt) + n(igst_amt);
    const total_amount = n(basic_amount) + gst_amount;

    const result = await withTransaction(async (client) => {
      const dn_number = await nextDNNumber(client, req.user.company_id);
      const r = await client.query(
        `INSERT INTO debit_notes (
          dn_number, dn_date, vendor_id, vendor_name, project_id, bill_id,
          invoice_number, invoice_date, reason, tax_mode,
          basic_amount, cgst_pct, cgst_amt, sgst_pct, sgst_amt,
          igst_pct, igst_amt, gst_amount, total_amount,
          status, remarks, created_by, company_id
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,'pending',$20,$21,$22)
        RETURNING *`,
        [
          dn_number, dn_date, vendor_id || null, vendor_name, project_id || null, bill_id || null,
          invoice_number || null, invoice_date || null, reason || null, tax_mode,
          n(basic_amount), n(cgst_pct), n(cgst_amt), n(sgst_pct), n(sgst_amt),
          n(igst_pct), n(igst_amt), gst_amount, total_amount,
          remarks || null, req.user.id, req.user.company_id,
        ]
      );
      const dnId = r.rows[0].id;

      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        if (!it.material_name?.trim()) continue;
        const amt = n(it.quantity) * n(it.rate);
        await client.query(
          `INSERT INTO debit_note_items (dn_id, material_name, unit, quantity, rate, amount, sort_order)
           VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [dnId, it.material_name, it.unit || 'Nos', n(it.quantity), n(it.rate), n(it.amount) || amt, i + 1]
        );
      }

      // ── Auto-post journal entry: Dr Accounts Payable, Cr Material Cost + Input GST ──
      await postAutoJournal(client, {
        companyId: req.user.company_id,
        userId: req.user.id,
        entryDate: dn_date,
        projectId: project_id || null,
        reference: dn_number,
        narration: `Debit Note ${dn_number} — ${vendor_name}`,
        source: 'auto_debit_note',
        lines: [
          { code: '2000', debit: total_amount, description: `Debit Note ${dn_number}` },
          { code: '5000', credit: n(basic_amount), description: `Debit Note ${dn_number} — material cost reversal` },
          { code: '1300', credit: gst_amount, description: `Debit Note ${dn_number} — ITC reversal` },
        ],
      });

      return r.rows[0];
    });

    const full = await getDN(result.id, req.user.company_id);
    res.status(201).json({ data: full });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── STATUS UPDATE ──────────────────────────────────────────────────────────────
router.patch('/:id/status', authenticate, async (req, res) => {
  try {
    const { status } = req.body;
    const allowed = ['pending', 'applied', 'cancelled'];
    if (!allowed.includes(status)) return res.status(400).json({ error: `status must be one of: ${allowed.join(', ')}` });

    const existing = await getDN(req.params.id, req.user.company_id);
    if (!existing) return res.status(404).json({ error: 'Debit note not found' });

    await query(`UPDATE debit_notes SET status = $1, updated_at = NOW() WHERE id = $2`, [status, req.params.id]);

    // Sync debit note value to tqs_bills when applied; clear when cancelled
    const billId     = existing.bill_id;
    const invoiceNum = existing.invoice_number;
    const companyId  = req.user.company_id;

    const findBill = async () => {
      if (billId) {
        const r = await query(`SELECT id FROM tqs_bills WHERE id = $1 AND company_id = $2`, [billId, companyId]);
        if (r.rows[0]) return r.rows[0];
      }
      if (invoiceNum) {
        const r = await query(
          `SELECT id FROM tqs_bills WHERE company_id = $1 AND inv_number ILIKE $2 AND is_deleted = FALSE LIMIT 1`,
          [companyId, `%${invoiceNum.trim()}%`]
        );
        if (r.rows[0]) return r.rows[0];
      }
      return null;
    };

    if (status === 'applied') {
      const billRow = await findBill();
      if (billRow) {
        await query(
          `UPDATE tqs_bills SET debit_note_num = $1, debit_note_val = $2, updated_at = NOW() WHERE id = $3`,
          [existing.dn_number, parseFloat(existing.total_amount) || 0, billRow.id]
        );
      }
    } else if (status === 'cancelled' && existing.status === 'applied') {
      const billRow = await findBill();
      if (billRow) {
        await query(
          `UPDATE tqs_bills SET debit_note_num = NULL, debit_note_val = 0, updated_at = NOW() WHERE id = $1`,
          [billRow.id]
        );
      }
    }

    const full = await getDN(req.params.id, req.user.company_id);
    res.json({ data: full });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE (pending only) ──────────────────────────────────────────────────────
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const existing = await getDN(req.params.id, req.user.company_id);
    if (!existing) return res.status(404).json({ error: 'Debit note not found' });
    if (existing.status !== 'pending') return res.status(400).json({ error: 'Only pending debit notes can be deleted' });

    await query(`DELETE FROM debit_notes WHERE id = $1`, [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
