// src/routes/recurring-bills.routes.js — Recurring vendor bill profiles
// Vendor-side mirror of recurring-invoices.routes.js (e.g. monthly rent, AMC).
// Same profile + generate-log pattern, no background cron.
const express = require('express');
const { authenticate } = require('../middleware/auth');
const { query, withTransaction } = require('../config/database');
const { postAutoJournal } = require('../services/journalAutoPost');
const router = express.Router();

(async () => {
  const safe = async (sql) => { try { await query(sql); } catch (_) {} };

  await safe(`
    CREATE TABLE IF NOT EXISTS recurring_bill_profiles (
      id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
      profile_name    TEXT NOT NULL,
      vendor_name     TEXT NOT NULL,
      vendor_id       UUID,
      project_id      UUID,
      frequency       TEXT DEFAULT 'monthly',  -- monthly | quarterly | yearly
      day_of_month    INTEGER DEFAULT 1,
      next_run_date   DATE,
      basic_amount    NUMERIC(14,2) DEFAULT 0,
      gst_pct         NUMERIC(5,2)  DEFAULT 18,
      expense_code    TEXT DEFAULT '6100',     -- chart_of_accounts code to debit
      description     TEXT,
      status          TEXT DEFAULT 'active',   -- active | paused
      created_by      UUID,
      company_id      UUID,
      created_at      TIMESTAMPTZ DEFAULT NOW(),
      updated_at      TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await safe(`
    CREATE TABLE IF NOT EXISTS recurring_bill_log (
      id             UUID DEFAULT gen_random_uuid() PRIMARY KEY,
      profile_id     UUID NOT NULL REFERENCES recurring_bill_profiles(id) ON DELETE CASCADE,
      bill_no        TEXT UNIQUE NOT NULL,
      bill_date      DATE NOT NULL,
      basic_amount   NUMERIC(14,2) DEFAULT 0,
      gst_amount     NUMERIC(14,2) DEFAULT 0,
      total_amount   NUMERIC(14,2) DEFAULT 0,
      created_by     UUID,
      created_at     TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await safe(`CREATE INDEX IF NOT EXISTS idx_rbp_company ON recurring_bill_profiles(company_id)`);
  await safe(`CREATE INDEX IF NOT EXISTS idx_rbl_profile ON recurring_bill_log(profile_id)`);

  console.log('[RecurringBills] Schema OK');
})();

const n = (v) => parseFloat(v) || 0;

function advance(date, frequency) {
  const d = new Date(date);
  if (frequency === 'quarterly') d.setMonth(d.getMonth() + 3);
  else if (frequency === 'yearly') d.setFullYear(d.getFullYear() + 1);
  else d.setMonth(d.getMonth() + 1);
  return d.toISOString().slice(0, 10);
}

async function nextBillNo(client, companyId) {
  const yr = new Date().getFullYear();
  const r = await client.query(
    `SELECT COUNT(*)::int AS c FROM recurring_bill_log l
     JOIN recurring_bill_profiles p ON p.id = l.profile_id
     WHERE p.company_id = $1 AND l.bill_no LIKE $2`,
    [companyId, `RBILL/${yr}/%`]
  );
  return `RBILL/${yr}/${String(r.rows[0].c + 1).padStart(4, '0')}`;
}

// ── LIST profiles ────────────────────────────────────────────────────────────
router.get('/', authenticate, async (req, res) => {
  try {
    const { status, search } = req.query;
    const conditions = ['p.company_id = $1'];
    const params = [req.user.company_id];
    let i = 1;
    if (status) { conditions.push(`p.status = $${++i}`); params.push(status); }
    if (search) { conditions.push(`(p.profile_name ILIKE $${++i} OR p.vendor_name ILIKE $${i})`); params.push(`%${search}%`); }

    const rows = await query(
      `SELECT p.*, pr.name AS project_name,
              (SELECT COUNT(*) FROM recurring_bill_log l WHERE l.profile_id = p.id)::int AS generated_count,
              (SELECT SUM(total_amount) FROM recurring_bill_log l WHERE l.profile_id = p.id) AS generated_total
       FROM recurring_bill_profiles p
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
      profile_name, vendor_name, vendor_id, project_id, frequency = 'monthly',
      day_of_month = 1, next_run_date, basic_amount = 0, gst_pct = 18,
      expense_code = '6100', description, status,
    } = req.body;
    if (!profile_name) return res.status(400).json({ error: 'profile_name is required' });
    if (!vendor_name)  return res.status(400).json({ error: 'vendor_name is required' });

    const st = ['active','paused'].includes(status) ? status : 'active';
    const r = await query(
      `INSERT INTO recurring_bill_profiles
        (profile_name, vendor_name, vendor_id, project_id, frequency, day_of_month, next_run_date,
         basic_amount, gst_pct, expense_code, description, status, created_by, company_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
      [profile_name, vendor_name, vendor_id || null, project_id || null, frequency, parseInt(day_of_month) || 1,
       next_run_date || new Date().toISOString().slice(0, 10),
       n(basic_amount), n(gst_pct), expense_code || '6100', description || null, st, req.user.id, req.user.company_id]
    );
    res.status(201).json({ data: r.rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── UPDATE profile ───────────────────────────────────────────────────────────
router.put('/:id', authenticate, async (req, res) => {
  try {
    const {
      profile_name, vendor_name, vendor_id, project_id, frequency,
      day_of_month, next_run_date, basic_amount, gst_pct, expense_code, description, status,
    } = req.body;
    const r = await query(
      `UPDATE recurring_bill_profiles SET
        profile_name = COALESCE($1, profile_name),
        vendor_name  = COALESCE($2, vendor_name),
        vendor_id    = $3,
        project_id   = $4,
        frequency    = COALESCE($5, frequency),
        day_of_month = COALESCE($6, day_of_month),
        next_run_date= COALESCE($7, next_run_date),
        basic_amount = COALESCE($8, basic_amount),
        gst_pct      = COALESCE($9, gst_pct),
        expense_code = COALESCE($10, expense_code),
        description  = COALESCE($11, description),
        status       = COALESCE($12, status),
        updated_at   = NOW()
       WHERE id = $13 AND company_id = $14 RETURNING *`,
      [profile_name, vendor_name, vendor_id || null, project_id || null, frequency,
       day_of_month == null ? null : parseInt(day_of_month), next_run_date,
       basic_amount == null ? null : n(basic_amount), gst_pct == null ? null : n(gst_pct),
       expense_code, description, status, req.params.id, req.user.company_id]
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
      `UPDATE recurring_bill_profiles SET status=$1, updated_at=NOW() WHERE id=$2 AND company_id=$3 RETURNING *`,
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
      `SELECT * FROM recurring_bill_profiles WHERE id = $1 AND company_id = $2`,
      [req.params.id, req.user.company_id]
    );
    if (!profile) return res.status(404).json({ error: 'Profile not found' });

    const basic = n(profile.basic_amount);
    const gst = basic * n(profile.gst_pct) / 100;
    const total = basic + gst;
    const billDate = new Date().toISOString().slice(0, 10);

    const result = await withTransaction(async (client) => {
      const bill_no = await nextBillNo(client, req.user.company_id);
      const log = await client.query(
        `INSERT INTO recurring_bill_log (profile_id, bill_no, bill_date, basic_amount, gst_amount, total_amount, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
        [profile.id, bill_no, billDate, basic, gst, total, req.user.id]
      );

      await client.query(
        `UPDATE recurring_bill_profiles SET next_run_date = $1, updated_at = NOW() WHERE id = $2`,
        [advance(profile.next_run_date || billDate, profile.frequency), profile.id]
      );

      // Dr Expense (+ Input GST), Cr Accounts Payable
      const lines = [{ code: profile.expense_code || '6100', debit: basic, description: `${bill_no} — ${profile.vendor_name}` }];
      if (gst > 0) lines.push({ code: '1300', debit: gst, description: `${bill_no} — Input GST` });
      lines.push({ code: '2000', credit: total, description: `${bill_no} — ${profile.vendor_name}` });

      await postAutoJournal(client, {
        companyId: req.user.company_id,
        userId: req.user.id,
        entryDate: billDate,
        projectId: profile.project_id || null,
        reference: bill_no,
        narration: `Recurring bill ${bill_no} — ${profile.vendor_name}`,
        source: 'auto_recurring_bill',
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
      `SELECT l.* FROM recurring_bill_log l
       JOIN recurring_bill_profiles p ON p.id = l.profile_id
       WHERE l.profile_id = $1 AND p.company_id = $2
       ORDER BY l.bill_date DESC`,
      [req.params.id, req.user.company_id]
    );
    res.json({ data: rows.rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── DELETE profile ────────────────────────────────────────────────────────────
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const r = await query(
      `DELETE FROM recurring_bill_profiles WHERE id = $1 AND company_id = $2`,
      [req.params.id, req.user.company_id]
    );
    if (!r.rowCount) return res.status(404).json({ error: 'Profile not found' });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
