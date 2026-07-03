// src/routes/recurring-invoices.routes.js — Recurring client invoice profiles
// Mirrors the jv_templates recurring pattern (journal-entries.routes.js):
// a profile defines what/when, "Generate Now" creates one dated instance and
// posts the GL entry, then advances next_run_date. No background cron —
// generation is user-triggered, same as jv_templates.
const express = require('express');
const { authenticate } = require('../middleware/auth');
const { query, withTransaction } = require('../config/database');
const { postAutoJournal } = require('../services/journalAutoPost');
const router = express.Router();

(async () => {
  const safe = async (sql) => { try { await query(sql); } catch (_) {} };

  await safe(`
    CREATE TABLE IF NOT EXISTS recurring_invoice_profiles (
      id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
      profile_name    TEXT NOT NULL,
      client_name     TEXT NOT NULL,
      project_id      UUID,
      frequency       TEXT DEFAULT 'monthly',  -- monthly | quarterly | yearly
      day_of_month    INTEGER DEFAULT 1,
      next_run_date   DATE,
      basic_amount    NUMERIC(14,2) DEFAULT 0,
      gst_pct         NUMERIC(5,2)  DEFAULT 18,
      description     TEXT,
      status          TEXT DEFAULT 'active',   -- active | paused
      created_by      UUID,
      company_id      UUID,
      created_at      TIMESTAMPTZ DEFAULT NOW(),
      updated_at      TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await safe(`
    CREATE TABLE IF NOT EXISTS recurring_invoice_log (
      id             UUID DEFAULT gen_random_uuid() PRIMARY KEY,
      profile_id     UUID NOT NULL REFERENCES recurring_invoice_profiles(id) ON DELETE CASCADE,
      invoice_no     TEXT UNIQUE NOT NULL,
      invoice_date   DATE NOT NULL,
      basic_amount   NUMERIC(14,2) DEFAULT 0,
      gst_amount     NUMERIC(14,2) DEFAULT 0,
      total_amount   NUMERIC(14,2) DEFAULT 0,
      created_by     UUID,
      created_at     TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await safe(`CREATE INDEX IF NOT EXISTS idx_rip_company ON recurring_invoice_profiles(company_id)`);
  await safe(`CREATE INDEX IF NOT EXISTS idx_ril_profile ON recurring_invoice_log(profile_id)`);

  console.log('[RecurringInvoices] Schema OK');
})();

const n = (v) => parseFloat(v) || 0;
const FREQ_DAYS = { monthly: null, quarterly: null, yearly: null }; // handled via date math below

function advance(date, frequency) {
  const d = new Date(date);
  if (frequency === 'quarterly') d.setMonth(d.getMonth() + 3);
  else if (frequency === 'yearly') d.setFullYear(d.getFullYear() + 1);
  else d.setMonth(d.getMonth() + 1); // monthly default
  return d.toISOString().slice(0, 10);
}

async function nextInvoiceNo(client, companyId) {
  const yr = new Date().getFullYear();
  const r = await client.query(
    `SELECT COUNT(*)::int AS c FROM recurring_invoice_log l
     JOIN recurring_invoice_profiles p ON p.id = l.profile_id
     WHERE p.company_id = $1 AND l.invoice_no LIKE $2`,
    [companyId, `RINV/${yr}/%`]
  );
  return `RINV/${yr}/${String(r.rows[0].c + 1).padStart(4, '0')}`;
}

// ── LIST profiles ────────────────────────────────────────────────────────────
router.get('/', authenticate, async (req, res) => {
  try {
    const { status, search } = req.query;
    const conditions = ['p.company_id = $1'];
    const params = [req.user.company_id];
    let i = 1;
    if (status) { conditions.push(`p.status = $${++i}`); params.push(status); }
    if (search) { conditions.push(`(p.profile_name ILIKE $${++i} OR p.client_name ILIKE $${i})`); params.push(`%${search}%`); }

    const rows = await query(
      `SELECT p.*, pr.name AS project_name,
              (SELECT COUNT(*) FROM recurring_invoice_log l WHERE l.profile_id = p.id)::int AS generated_count,
              (SELECT SUM(total_amount) FROM recurring_invoice_log l WHERE l.profile_id = p.id) AS generated_total
       FROM recurring_invoice_profiles p
       LEFT JOIN projects pr ON pr.id = p.project_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY p.next_run_date ASC NULLS LAST, p.created_at DESC`,
      params
    );
    res.json({ data: rows.rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── CREATE profile ───────────────────────────────────────────────────────────
router.post('/', authenticate, async (req, res) => {
  try {
    const {
      profile_name, client_name, project_id, frequency = 'monthly',
      day_of_month = 1, next_run_date, basic_amount = 0, gst_pct = 18,
      description, status,
    } = req.body;
    if (!profile_name) return res.status(400).json({ error: 'profile_name is required' });
    if (!client_name)  return res.status(400).json({ error: 'client_name is required' });

    const st = ['active','paused'].includes(status) ? status : 'active';
    const r = await query(
      `INSERT INTO recurring_invoice_profiles
        (profile_name, client_name, project_id, frequency, day_of_month, next_run_date,
         basic_amount, gst_pct, description, status, created_by, company_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [profile_name, client_name, project_id || null, frequency, parseInt(day_of_month) || 1,
       next_run_date || new Date().toISOString().slice(0, 10),
       n(basic_amount), n(gst_pct), description || null, st, req.user.id, req.user.company_id]
    );
    res.status(201).json({ data: r.rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── UPDATE profile ───────────────────────────────────────────────────────────
router.put('/:id', authenticate, async (req, res) => {
  try {
    const {
      profile_name, client_name, project_id, frequency,
      day_of_month, next_run_date, basic_amount, gst_pct, description, status,
    } = req.body;
    const r = await query(
      `UPDATE recurring_invoice_profiles SET
        profile_name = COALESCE($1, profile_name),
        client_name  = COALESCE($2, client_name),
        project_id   = $3,
        frequency    = COALESCE($4, frequency),
        day_of_month = COALESCE($5, day_of_month),
        next_run_date= COALESCE($6, next_run_date),
        basic_amount = COALESCE($7, basic_amount),
        gst_pct      = COALESCE($8, gst_pct),
        description  = COALESCE($9, description),
        status       = COALESCE($10, status),
        updated_at   = NOW()
       WHERE id = $11 AND company_id = $12 RETURNING *`,
      [profile_name, client_name, project_id || null, frequency, day_of_month == null ? null : parseInt(day_of_month),
       next_run_date, basic_amount == null ? null : n(basic_amount), gst_pct == null ? null : n(gst_pct),
       description, status, req.params.id, req.user.company_id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Profile not found' });
    res.json({ data: r.rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Pause / Resume ───────────────────────────────────────────────────────────
router.patch('/:id/status', authenticate, async (req, res) => {
  try {
    const { status } = req.body;
    if (!['active','paused'].includes(status)) return res.status(400).json({ error: 'status must be active or paused' });
    const r = await query(
      `UPDATE recurring_invoice_profiles SET status=$1, updated_at=NOW() WHERE id=$2 AND company_id=$3 RETURNING *`,
      [status, req.params.id, req.user.company_id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Profile not found' });
    res.json({ data: r.rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Generate now ──────────────────────────────────────────────────────────────
router.post('/:id/generate', authenticate, async (req, res) => {
  try {
    const { rows: [profile] } = await query(
      `SELECT * FROM recurring_invoice_profiles WHERE id = $1 AND company_id = $2`,
      [req.params.id, req.user.company_id]
    );
    if (!profile) return res.status(404).json({ error: 'Profile not found' });

    const basic = n(profile.basic_amount);
    const gst = basic * n(profile.gst_pct) / 100;
    const total = basic + gst;
    const invoiceDate = new Date().toISOString().slice(0, 10);

    const result = await withTransaction(async (client) => {
      const invoice_no = await nextInvoiceNo(client, req.user.company_id);
      const log = await client.query(
        `INSERT INTO recurring_invoice_log (profile_id, invoice_no, invoice_date, basic_amount, gst_amount, total_amount, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
        [profile.id, invoice_no, invoiceDate, basic, gst, total, req.user.id]
      );

      await client.query(
        `UPDATE recurring_invoice_profiles SET next_run_date = $1, updated_at = NOW() WHERE id = $2`,
        [advance(profile.next_run_date || invoiceDate, profile.frequency), profile.id]
      );

      // Dr Accounts Receivable, Cr Contract Revenue (+ Output GST if applicable)
      const lines = [{ code: '1100', debit: total, description: `${invoice_no} — ${profile.client_name}` }];
      if (gst > 0) {
        lines.push({ code: '4000', credit: basic, description: `${invoice_no} — ${profile.profile_name}` });
        lines.push({ code: '2100', credit: gst, description: `${invoice_no} — Output GST` });
      } else {
        lines.push({ code: '4000', credit: total, description: `${invoice_no} — ${profile.profile_name}` });
      }
      await postAutoJournal(client, {
        companyId: req.user.company_id,
        userId: req.user.id,
        entryDate: invoiceDate,
        projectId: profile.project_id || null,
        reference: invoice_no,
        narration: `Recurring invoice ${invoice_no} — ${profile.client_name}`,
        source: 'auto_recurring_invoice',
        lines,
      });

      return log.rows[0];
    });

    res.status(201).json({ data: result });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Generated history for a profile ──────────────────────────────────────────
router.get('/:id/log', authenticate, async (req, res) => {
  try {
    const rows = await query(
      `SELECT l.* FROM recurring_invoice_log l
       JOIN recurring_invoice_profiles p ON p.id = l.profile_id
       WHERE l.profile_id = $1 AND p.company_id = $2
       ORDER BY l.invoice_date DESC`,
      [req.params.id, req.user.company_id]
    );
    res.json({ data: rows.rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── DELETE profile ────────────────────────────────────────────────────────────
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const r = await query(
      `DELETE FROM recurring_invoice_profiles WHERE id = $1 AND company_id = $2`,
      [req.params.id, req.user.company_id]
    );
    if (!r.rowCount) return res.status(404).json({ error: 'Profile not found' });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
