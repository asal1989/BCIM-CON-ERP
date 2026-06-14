// src/routes/journal-entries.routes.js
const express = require('express');
const { authenticate } = require('../middleware/auth');
const { query, withTransaction } = require('../config/database');
const router = express.Router();

// ── Auto-migrate ─────────────────────────────────────────────────────────────
(async () => {
  const safe = async (sql) => {
    try { await query(sql); } catch (_) {}
  };

  await safe(`
    CREATE TABLE IF NOT EXISTS journal_entries (
      id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
      company_id  UUID NOT NULL,
      entry_no    TEXT NOT NULL,
      entry_date  DATE NOT NULL,
      reference   TEXT,
      narration   TEXT,
      status      TEXT DEFAULT 'draft', -- draft | posted
      created_by  UUID,
      created_at  TIMESTAMPTZ DEFAULT NOW(),
      updated_at  TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await safe(`
    CREATE TABLE IF NOT EXISTS journal_entry_lines (
      id                UUID DEFAULT gen_random_uuid() PRIMARY KEY,
      journal_entry_id  UUID NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
      account_id        UUID NOT NULL REFERENCES chart_of_accounts(id),
      debit             NUMERIC(16,2) DEFAULT 0,
      credit            NUMERIC(16,2) DEFAULT 0,
      description       TEXT,
      sort_order        INTEGER DEFAULT 0
    )
  `);

  await safe(`CREATE INDEX IF NOT EXISTS idx_je_company ON journal_entries(company_id)`);
  await safe(`CREATE INDEX IF NOT EXISTS idx_jel_entry   ON journal_entry_lines(journal_entry_id)`);
  await safe(`CREATE INDEX IF NOT EXISTS idx_jel_account ON journal_entry_lines(account_id)`);

  console.log('[JournalEntries] Schema OK');
})();

const n = (v) => parseFloat(v) || 0;

async function nextEntryNo(companyId) {
  const yr = new Date().getFullYear();
  const r = await query(
    `SELECT COUNT(*) FROM journal_entries WHERE company_id = $1 AND EXTRACT(YEAR FROM created_at) = $2`,
    [companyId, yr]
  );
  const seq = String(parseInt(r.rows[0].count) + 1).padStart(4, '0');
  return `JE/${yr}/${seq}`;
}

async function getJE(id, companyId) {
  const r = await query(
    `SELECT je.*, u.name AS created_by_name
     FROM journal_entries je
     LEFT JOIN users u ON u.id = je.created_by
     WHERE je.id = $1 AND je.company_id = $2`,
    [id, companyId]
  );
  if (!r.rows.length) return null;
  const lines = await query(
    `SELECT jel.*, coa.code AS account_code, coa.name AS account_name, coa.account_type
     FROM journal_entry_lines jel
     JOIN chart_of_accounts coa ON coa.id = jel.account_id
     WHERE jel.journal_entry_id = $1 ORDER BY jel.sort_order`,
    [id]
  );
  return { ...r.rows[0], lines: lines.rows };
}

// ── LIST ─────────────────────────────────────────────────────────────────────
router.get('/', authenticate, async (req, res) => {
  try {
    const { status, from, to, search, limit = 100, offset = 0 } = req.query;
    const conditions = ['je.company_id = $1'];
    const params = [req.user.company_id];
    let p = 1;

    if (status) { conditions.push(`je.status = $${++p}`); params.push(status); }
    if (from)   { conditions.push(`je.entry_date >= $${++p}`); params.push(from); }
    if (to)     { conditions.push(`je.entry_date <= $${++p}`); params.push(to); }
    if (search) { conditions.push(`(je.entry_no ILIKE $${++p} OR je.narration ILIKE $${p} OR je.reference ILIKE $${p})`); params.push(`%${search}%`); }

    const where = conditions.join(' AND ');
    const rows = await query(
      `SELECT je.*, u.name AS created_by_name,
              COALESCE((SELECT SUM(debit) FROM journal_entry_lines WHERE journal_entry_id = je.id), 0) AS total_debit,
              COALESCE((SELECT SUM(credit) FROM journal_entry_lines WHERE journal_entry_id = je.id), 0) AS total_credit
       FROM journal_entries je
       LEFT JOIN users u ON u.id = je.created_by
       WHERE ${where}
       ORDER BY je.entry_date DESC, je.created_at DESC
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
    const je = await getJE(req.params.id, req.user.company_id);
    if (!je) return res.status(404).json({ error: 'Journal entry not found' });
    res.json({ data: je });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── CREATE ───────────────────────────────────────────────────────────────────
router.post('/', authenticate, async (req, res) => {
  try {
    const { entry_date, reference, narration, status = 'draft', lines = [] } = req.body;
    if (!entry_date) return res.status(400).json({ error: 'entry_date is required' });
    if (!Array.isArray(lines) || lines.length < 2) {
      return res.status(400).json({ error: 'At least two journal lines are required' });
    }

    const totalDebit  = lines.reduce((s, l) => s + n(l.debit), 0);
    const totalCredit = lines.reduce((s, l) => s + n(l.credit), 0);
    if (Math.abs(totalDebit - totalCredit) > 0.01) {
      return res.status(400).json({ error: `Total debits (${totalDebit.toFixed(2)}) must equal total credits (${totalCredit.toFixed(2)})` });
    }
    if (totalDebit === 0) {
      return res.status(400).json({ error: 'Journal entry cannot be zero-value' });
    }

    const entry_no = await nextEntryNo(req.user.company_id);

    const result = await withTransaction(async (client) => {
      const r = await client.query(
        `INSERT INTO journal_entries (company_id, entry_no, entry_date, reference, narration, status, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
        [req.user.company_id, entry_no, entry_date, reference || null, narration || null, status === 'posted' ? 'posted' : 'draft', req.user.id]
      );
      const jeId = r.rows[0].id;

      for (let i = 0; i < lines.length; i++) {
        const l = lines[i];
        if (!l.account_id) continue;
        if (!(n(l.debit) > 0) && !(n(l.credit) > 0)) continue;
        await client.query(
          `INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit, credit, description, sort_order)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [jeId, l.account_id, n(l.debit), n(l.credit), l.description || null, i + 1]
        );
      }
      return r.rows[0];
    });

    const full = await getJE(result.id, req.user.company_id);
    res.status(201).json({ data: full });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST / UNPOST ────────────────────────────────────────────────────────────
router.patch('/:id/status', authenticate, async (req, res) => {
  try {
    const { status } = req.body;
    if (!['draft', 'posted'].includes(status)) return res.status(400).json({ error: 'status must be draft or posted' });
    const existing = await getJE(req.params.id, req.user.company_id);
    if (!existing) return res.status(404).json({ error: 'Journal entry not found' });

    await query(`UPDATE journal_entries SET status = $1, updated_at = NOW() WHERE id = $2`, [status, req.params.id]);
    const full = await getJE(req.params.id, req.user.company_id);
    res.json({ data: full });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE (draft only) ────────────────────────────────────────────────────────
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const existing = await getJE(req.params.id, req.user.company_id);
    if (!existing) return res.status(404).json({ error: 'Journal entry not found' });
    if (existing.status !== 'draft') return res.status(400).json({ error: 'Only draft entries can be deleted' });

    await query(`DELETE FROM journal_entries WHERE id = $1`, [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
