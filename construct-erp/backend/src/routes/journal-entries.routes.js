// src/routes/journal-entries.routes.js
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
    CREATE TABLE IF NOT EXISTS journal_entries (
      id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
      company_id  UUID NOT NULL,
      entry_no    TEXT NOT NULL,
      entry_date  DATE NOT NULL,
      reference   TEXT,
      narration   TEXT,
      status      TEXT DEFAULT 'draft',
      source      TEXT DEFAULT 'manual',
      created_by  UUID,
      created_at  TIMESTAMPTZ DEFAULT NOW(),
      updated_at  TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  // Idempotent: add source column to existing tables
  await safe(`ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'manual'`);

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

  // ── Recurring JV templates ─────────────────────────────────────────────────
  await safe(`
    CREATE TABLE IF NOT EXISTS jv_templates (
      id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
      company_id    UUID NOT NULL,
      template_name VARCHAR(200) NOT NULL,
      narration     TEXT,
      frequency     VARCHAR(20) DEFAULT 'monthly',
      day_of_month  INTEGER DEFAULT 1,
      next_run_date DATE,
      last_run_date DATE,
      is_active     BOOLEAN DEFAULT true,
      auto_post     BOOLEAN DEFAULT true,
      created_by    UUID REFERENCES users(id),
      created_at    TIMESTAMPTZ DEFAULT NOW(),
      updated_at    TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await safe(`
    CREATE TABLE IF NOT EXISTS jv_template_lines (
      id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
      template_id  UUID NOT NULL REFERENCES jv_templates(id) ON DELETE CASCADE,
      account_id   UUID NOT NULL REFERENCES chart_of_accounts(id),
      debit        NUMERIC(16,2) DEFAULT 0,
      credit       NUMERIC(16,2) DEFAULT 0,
      description  TEXT,
      sort_order   INTEGER DEFAULT 0
    )
  `);

  await safe(`CREATE INDEX IF NOT EXISTS idx_je_company    ON journal_entries(company_id)`);
  await safe(`CREATE INDEX IF NOT EXISTS idx_je_source     ON journal_entries(company_id, source)`);
  await safe(`CREATE INDEX IF NOT EXISTS idx_jel_entry     ON journal_entry_lines(journal_entry_id)`);
  await safe(`CREATE INDEX IF NOT EXISTS idx_jel_account   ON journal_entry_lines(account_id)`);
  await safe(`CREATE INDEX IF NOT EXISTS idx_jvt_company   ON jv_templates(company_id)`);

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
    const { status, from, to, search, source, limit = 100, offset = 0 } = req.query;
    const conditions = ['je.company_id = $1'];
    const params = [req.user.company_id];
    let p = 1;

    if (status) { conditions.push(`je.status = $${++p}`); params.push(status); }
    if (from)   { conditions.push(`je.entry_date >= $${++p}`); params.push(from); }
    if (to)     { conditions.push(`je.entry_date <= $${++p}`); params.push(to); }
    if (search) { conditions.push(`(je.entry_no ILIKE $${++p} OR je.narration ILIKE $${p} OR je.reference ILIKE $${p})`); params.push(`%${search}%`); }
    if (source) {
      // Legacy rows may have NULL source; treat them as 'manual'
      if (source === 'manual') conditions.push(`(je.source = 'manual' OR je.source IS NULL)`);
      else { conditions.push(`je.source = $${++p}`); params.push(source); }
    }

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

// ── DAY BOOK (posted entries + lines for a date range, default today) ────────
router.get('/day-book', authenticate, async (req, res) => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const from = req.query.from || today;
    const to = req.query.to || from;

    const entries = await query(
      `SELECT je.*, u.name AS created_by_name
       FROM journal_entries je
       LEFT JOIN users u ON u.id = je.created_by
       WHERE je.company_id = $1 AND je.status = 'posted' AND je.entry_date BETWEEN $2 AND $3
       ORDER BY je.entry_date ASC, je.created_at ASC`,
      [req.user.company_id, from, to]
    );

    const ids = entries.rows.map(e => e.id);
    const linesByEntry = {};
    if (ids.length) {
      const lines = await query(
        `SELECT jel.*, coa.code AS account_code, coa.name AS account_name
         FROM journal_entry_lines jel
         JOIN chart_of_accounts coa ON coa.id = jel.account_id
         WHERE jel.journal_entry_id = ANY($1)
         ORDER BY jel.journal_entry_id, jel.sort_order`,
        [ids]
      );
      lines.rows.forEach(l => { (linesByEntry[l.journal_entry_id] ||= []).push(l); });
    }

    const data = entries.rows.map(e => ({ ...e, lines: linesByEntry[e.id] || [] }));
    res.json({ data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET ONE ──────────────────────────────────────────────────────────────────
// UUID-constrained so static GET routes (/automation-log, /templates) aren't shadowed
router.get('/:id([0-9a-fA-F-]{36})', authenticate, async (req, res) => {
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

// ── AUTOMATION LOG — posted JVs from non-manual sources ──────────────────────
router.get('/automation-log', authenticate, async (req, res) => {
  try {
    const { source, from, to, limit = 200, offset = 0 } = req.query;
    const conditions = [`je.company_id = $1`, `je.source != 'manual'`];
    const params = [req.user.company_id]; let p = 1;
    if (source) { conditions.push(`je.source = $${++p}`); params.push(source); }
    if (from)   { conditions.push(`je.entry_date >= $${++p}`); params.push(from); }
    if (to)     { conditions.push(`je.entry_date <= $${++p}`); params.push(to); }
    const { rows } = await query(
      `SELECT je.*, u.name AS created_by_name,
              COALESCE((SELECT SUM(debit) FROM journal_entry_lines WHERE journal_entry_id = je.id), 0) AS total_debit,
              COALESCE((SELECT SUM(credit) FROM journal_entry_lines WHERE journal_entry_id = je.id), 0) AS total_credit
       FROM journal_entries je
       LEFT JOIN users u ON u.id = je.created_by
       WHERE ${conditions.join(' AND ')}
       ORDER BY je.entry_date DESC, je.created_at DESC
       LIMIT $${++p} OFFSET $${++p}`,
      [...params, limit, offset]
    );
    res.json({ data: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── RECURRING TEMPLATES ───────────────────────────────────────────────────────

// List templates
router.get('/templates', authenticate, async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT t.*, u.name AS created_by_name,
              (SELECT COUNT(*) FROM jv_template_lines WHERE template_id = t.id)::int AS line_count
       FROM jv_templates t
       LEFT JOIN users u ON u.id = t.created_by
       WHERE t.company_id = $1 ORDER BY t.template_name`,
      [req.user.company_id]
    );
    res.json({ data: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Get one template with lines — UUID-constrained so /templates/due isn't shadowed
router.get('/templates/:id([0-9a-fA-F-]{36})', authenticate, async (req, res) => {
  try {
    const { rows: [tmpl] } = await query(
      `SELECT * FROM jv_templates WHERE id = $1 AND company_id = $2`,
      [req.params.id, req.user.company_id]
    );
    if (!tmpl) return res.status(404).json({ error: 'Template not found' });
    const { rows: lines } = await query(
      `SELECT tl.*, coa.code AS account_code, coa.name AS account_name
       FROM jv_template_lines tl
       JOIN chart_of_accounts coa ON coa.id = tl.account_id
       WHERE tl.template_id = $1 ORDER BY tl.sort_order`,
      [req.params.id]
    );
    res.json({ data: { ...tmpl, lines } });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Create template
router.post('/templates', authenticate, async (req, res) => {
  try {
    const { template_name, narration, frequency, day_of_month, next_run_date, auto_post, lines = [] } = req.body;
    if (!template_name) return res.status(400).json({ error: 'template_name required' });
    if (!Array.isArray(lines) || lines.length < 2) return res.status(400).json({ error: 'At least 2 lines required' });
    const totalD = lines.reduce((s, l) => s + n(l.debit), 0);
    const totalC = lines.reduce((s, l) => s + n(l.credit), 0);
    if (Math.abs(totalD - totalC) > 0.01 || totalD === 0) return res.status(400).json({ error: 'Lines must balance' });

    const result = await withTransaction(async (client) => {
      const { rows: [tmpl] } = await client.query(
        `INSERT INTO jv_templates (company_id, template_name, narration, frequency, day_of_month, next_run_date, auto_post, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
        [req.user.company_id, template_name, narration || null, frequency || 'monthly',
         parseInt(day_of_month) || 1, next_run_date || null, auto_post !== false, req.user.id]
      );
      for (let i = 0; i < lines.length; i++) {
        const l = lines[i];
        if (!l.account_id || (!(n(l.debit) > 0) && !(n(l.credit) > 0))) continue;
        await client.query(
          `INSERT INTO jv_template_lines (template_id, account_id, debit, credit, description, sort_order)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [tmpl.id, l.account_id, n(l.debit), n(l.credit), l.description || null, i + 1]
        );
      }
      return tmpl;
    });
    res.status(201).json({ data: result });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Update template
router.patch('/templates/:id', authenticate, async (req, res) => {
  try {
    const { template_name, narration, frequency, day_of_month, next_run_date, is_active, auto_post } = req.body;
    const { rows: [row] } = await query(
      `UPDATE jv_templates SET
         template_name = COALESCE($1, template_name),
         narration     = COALESCE($2, narration),
         frequency     = COALESCE($3, frequency),
         day_of_month  = COALESCE($4, day_of_month),
         next_run_date = COALESCE($5, next_run_date),
         is_active     = COALESCE($6, is_active),
         auto_post     = COALESCE($7, auto_post),
         updated_at    = NOW()
       WHERE id = $8 AND company_id = $9 RETURNING *`,
      [template_name, narration, frequency, day_of_month, next_run_date, is_active, auto_post, req.params.id, req.user.company_id]
    );
    if (!row) return res.status(404).json({ error: 'Template not found' });
    res.json({ data: row });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Delete template
router.delete('/templates/:id', authenticate, async (req, res) => {
  try {
    const { rowCount } = await query(
      `DELETE FROM jv_templates WHERE id = $1 AND company_id = $2`, [req.params.id, req.user.company_id]
    );
    if (!rowCount) return res.status(404).json({ error: 'Template not found' });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Execute template now (manual trigger or scheduled run)
router.post('/templates/:id/execute', authenticate, async (req, res) => {
  try {
    const { entry_date } = req.body;
    const execDate = entry_date || new Date().toISOString().slice(0, 10);

    const { rows: [tmpl] } = await query(
      `SELECT * FROM jv_templates WHERE id = $1 AND company_id = $2 AND is_active = true`,
      [req.params.id, req.user.company_id]
    );
    if (!tmpl) return res.status(404).json({ error: 'Template not found or inactive' });

    const { rows: tLines } = await query(
      `SELECT tl.*, coa.code AS account_code
       FROM jv_template_lines tl
       JOIN chart_of_accounts coa ON coa.id = tl.account_id
       WHERE tl.template_id = $1 ORDER BY tl.sort_order`, [req.params.id]
    );
    if (tLines.length < 2) return res.status(400).json({ error: 'Template needs at least 2 lines' });

    const jeId = await withTransaction(async (client) => {
      const id = await postAutoJournal(client, {
        companyId: req.user.company_id,
        userId: req.user.id,
        entryDate: execDate,
        narration: tmpl.narration || tmpl.template_name,
        reference: `TPL-${tmpl.id.slice(0, 8).toUpperCase()}`,
        source: 'auto_recurring',
        lines: tLines.map(l => ({ code: l.account_code, debit: n(l.debit), credit: n(l.credit), description: l.description })),
      });
      // Update last_run_date and compute next_run_date
      let nextRun = null;
      if (tmpl.frequency === 'monthly' && tmpl.day_of_month) {
        const d = new Date(execDate);
        d.setMonth(d.getMonth() + 1);
        d.setDate(Math.min(tmpl.day_of_month, 28));
        nextRun = d.toISOString().slice(0, 10);
      } else if (tmpl.frequency === 'quarterly') {
        const d = new Date(execDate); d.setMonth(d.getMonth() + 3);
        nextRun = d.toISOString().slice(0, 10);
      } else if (tmpl.frequency === 'annual') {
        const d = new Date(execDate); d.setFullYear(d.getFullYear() + 1);
        nextRun = d.toISOString().slice(0, 10);
      } else if (tmpl.frequency === 'weekly') {
        const d = new Date(execDate); d.setDate(d.getDate() + 7);
        nextRun = d.toISOString().slice(0, 10);
      }
      await client.query(
        `UPDATE jv_templates SET last_run_date = $1, next_run_date = $2, updated_at = NOW() WHERE id = $3`,
        [execDate, nextRun, tmpl.id]
      );
      return id;
    });

    if (!jeId) return res.status(422).json({ error: 'Could not post JV — ensure Chart of Accounts is seeded with the required codes' });
    const full = await getJE(jeId, req.user.company_id);
    res.status(201).json({ data: full, message: 'Journal entry posted from template' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Due-today check — returns templates whose next_run_date <= today and is_active = true
router.get('/templates/due', authenticate, async (req, res) => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const { rows } = await query(
      `SELECT * FROM jv_templates
       WHERE company_id = $1 AND is_active = true
         AND auto_post = true AND next_run_date IS NOT NULL AND next_run_date <= $2`,
      [req.user.company_id, today]
    );
    res.json({ data: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
