// src/routes/hireRental.routes.js — Hire & Rental (unified)
// Adds the commercial back-half (Vendor Invoice → QS Certification → Approval →
// Payment) on top of the existing Plant & Machinery operational tables, which it
// REUSES rather than duplicates:
//   • Hire Work Orders     → pm_hire_in_orders
//   • Equipment Allocation → pm_deployment / pm_transfers
//   • Daily Usage/Log Sheet→ pm_equipment_daily_logs
//   • Settings/Masters     → pm_* masters
// This file owns only the new invoice lifecycle tables and the dashboard/report
// rollups that join across all of them.
const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const { query, withTransaction } = require('../config/database');
const { runSchemaInit } = require('../utils/schemaInit');
const { postAutoJournalStandalone } = require('../services/journalAutoPost');
const { sendMail } = require('../services/mail.service');

router.use(authenticate);
const CID = req => req.user.company_id;
const n = v => (v === '' || v == null || isNaN(Number(v)) ? 0 : Number(v));

// Roles that can enter invoices (site/QS/procurement) vs certify vs approve.
const ENTRY    = ['super_admin', 'admin', 'project_manager', 'site_engineer', 'qs_engineer', 'procurement_manager', 'accountant'];
const CERTIFY  = ['super_admin', 'admin', 'project_manager', 'qs_engineer'];
const APPROVE  = ['super_admin', 'admin', 'project_manager', 'managing_director'];
const PAY      = ['super_admin', 'admin', 'accountant'];

// ── Schema (idempotent) ──────────────────────────────────────────────────────
runSchemaInit('hire_rental_tables', async () => {
  await query(`
    CREATE TABLE IF NOT EXISTS hire_vendor_invoices (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      hire_order_id   UUID NOT NULL REFERENCES pm_hire_in_orders(id) ON DELETE CASCADE,
      project_id      UUID REFERENCES projects(id),
      invoice_no      VARCHAR(80),
      invoice_date    DATE,
      period_from     DATE,
      period_to       DATE,
      gross_amount    NUMERIC(15,2) DEFAULT 0,
      gst_rate        NUMERIC(5,2)  DEFAULT 18,
      gst_amount      NUMERIC(15,2) DEFAULT 0,
      tcs_amount      NUMERIC(15,2) DEFAULT 0,
      total_amount    NUMERIC(15,2) DEFAULT 0,
      certified_amount NUMERIC(15,2) DEFAULT 0,
      status          VARCHAR(20) NOT NULL DEFAULT 'draft'
                       CHECK (status IN ('draft','certified','approved','paid','rejected')),
      remarks         TEXT,
      certified_by    UUID REFERENCES users(id),
      certified_at    TIMESTAMPTZ,
      approved_by     UUID REFERENCES users(id),
      approved_at     TIMESTAMPTZ,
      payment_date    DATE,
      payment_mode    VARCHAR(40),
      payment_ref     VARCHAR(120),
      amount_paid     NUMERIC(15,2) DEFAULT 0,
      created_by      UUID REFERENCES users(id),
      created_at      TIMESTAMPTZ DEFAULT NOW(),
      updated_at      TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_hvi_order ON hire_vendor_invoices(hire_order_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_hvi_company_status ON hire_vendor_invoices(company_id, status)`);

  await query(`
    CREATE TABLE IF NOT EXISTS hire_vendor_invoice_lines (
      id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      invoice_id        UUID NOT NULL REFERENCES hire_vendor_invoices(id) ON DELETE CASCADE,
      description       VARCHAR(300),
      usage_category    VARCHAR(120),
      invoiced_qty      NUMERIC(14,3) DEFAULT 0,
      rate              NUMERIC(14,2) DEFAULT 0,
      invoiced_amount   NUMERIC(15,2) DEFAULT 0,
      certified_qty     NUMERIC(14,3) DEFAULT 0,
      certified_amount  NUMERIC(15,2) DEFAULT 0,
      log_ref           UUID REFERENCES pm_equipment_daily_logs(id)
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_hvil_invoice ON hire_vendor_invoice_lines(invoice_id)`);
});

// Recompute header money fields from its lines + GST/TCS.
async function recomputeTotals(client, invoiceId) {
  const ln = await client.query(
    `SELECT COALESCE(SUM(invoiced_amount),0) AS gross,
            COALESCE(SUM(certified_amount),0) AS certified
       FROM hire_vendor_invoice_lines WHERE invoice_id=$1`, [invoiceId]);
  const gross = n(ln.rows[0].gross);
  const certified = n(ln.rows[0].certified);
  const hdr = await client.query(`SELECT gst_rate, tcs_amount FROM hire_vendor_invoices WHERE id=$1`, [invoiceId]);
  const gstRate = n(hdr.rows[0]?.gst_rate);
  const tcs = n(hdr.rows[0]?.tcs_amount);
  // Bill on certified value once certified; before that, on the invoiced gross.
  const base = certified > 0 ? certified : gross;
  const gstAmt = +(base * gstRate / 100).toFixed(2);
  const total = +(base + gstAmt + tcs).toFixed(2);
  await client.query(
    `UPDATE hire_vendor_invoices
       SET gross_amount=$1, certified_amount=$2, gst_amount=$3, total_amount=$4, updated_at=NOW()
     WHERE id=$5`,
    [gross, certified, gstAmt, total, invoiceId]);
}

// ── Hire Work Orders — pm_hire_in_orders only ────────────────────────────────
// Hire-type sc_work_orders (issued as subcontractor work orders, e.g. crane
// hire billed through the SC module) are deliberately NOT included here — they
// are billed via the Hire Usage Tracker (/hire-log) into sc_bills, which keeps
// the SC ledger and WO balance_qty in sync. Listing them here too would let a
// user raise a parallel, disconnected invoice for the same WO.
router.get('/orders', async (req, res) => {
  try {
    const { status, project_id } = req.query;
    const cid = CID(req);
    const params = [cid];
    let i = 2;
    let extra = '';
    if (status)     { extra += ` AND status=$${i++}`;     params.push(status); }
    if (project_id) { extra += ` AND project_id=$${i++}`; params.push(project_id); }

    const sql = `
      SELECT h.id, h.order_no, h.equipment_desc, h.vendor_id, h.vendor_name,
             h.hire_rate, h.rate_type, h.start_date, h.end_date, h.status,
             h.project_id, 'hire_order' AS source,
             e.code AS equipment_code, e.name AS equipment_name,
             p.name AS project_name,
             COALESCE((SELECT SUM(total_amount) FROM hire_vendor_invoices inv
                        WHERE inv.hire_order_id=h.id
                          AND inv.status IN ('approved','paid')),0) AS billed_value
      FROM pm_hire_in_orders h
      LEFT JOIN pm_equipment e ON e.id=h.equipment_id
      LEFT JOIN projects p ON p.id=h.project_id
      WHERE h.company_id=$1 AND h.is_deleted=false${extra}
      ORDER BY h.order_no
    `;
    res.json({ data: (await query(sql, params)).rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Invoices: list ───────────────────────────────────────────────────────────
router.get('/invoices', async (req, res) => {
  try {
    const { status, hire_order_id, project_id } = req.query;
    let sql = `
      SELECT i.*, h.order_no, h.vendor_name, h.equipment_desc, h.rate_type,
             p.name AS project_name, cu.name AS certified_by_name, au.name AS approved_by_name
      FROM hire_vendor_invoices i
      JOIN pm_hire_in_orders h ON h.id=i.hire_order_id
      LEFT JOIN projects p ON p.id=i.project_id
      LEFT JOIN users cu ON cu.id=i.certified_by
      LEFT JOIN users au ON au.id=i.approved_by
      WHERE i.company_id=$1`;
    const params = [CID(req)]; let i = 2;
    if (status)        { sql += ` AND i.status=$${i++}`; params.push(status); }
    if (hire_order_id) { sql += ` AND i.hire_order_id=$${i++}`; params.push(hire_order_id); }
    if (project_id)    { sql += ` AND i.project_id=$${i++}`; params.push(project_id); }
    sql += ' ORDER BY i.invoice_date DESC NULLS LAST, i.created_at DESC';
    res.json({ data: (await query(sql, params)).rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Invoice: detail + lines ──────────────────────────────────────────────────
router.get('/invoices/:id([0-9a-fA-F-]{36})', async (req, res) => {
  try {
    const h = await query(
      `SELECT i.*, h.order_no, h.vendor_name, h.equipment_desc, h.rate_type, h.hire_rate,
              p.name AS project_name
       FROM hire_vendor_invoices i
       JOIN pm_hire_in_orders h ON h.id=i.hire_order_id
       LEFT JOIN projects p ON p.id=i.project_id
       WHERE i.id=$1 AND i.company_id=$2`, [req.params.id, CID(req)]);
    if (!h.rows.length) return res.status(404).json({ error: 'Invoice not found' });
    const lines = await query(
      `SELECT * FROM hire_vendor_invoice_lines WHERE invoice_id=$1 ORDER BY id`, [req.params.id]);
    res.json({ data: { ...h.rows[0], lines: lines.rows } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Invoice: create (status draft) ───────────────────────────────────────────
router.post('/invoices', authorize(...ENTRY), async (req, res) => {
  try {
    const b = req.body;
    if (!b.hire_order_id) return res.status(400).json({ error: 'hire_order_id is required' });
    // Resolve the order (also gives us project + tenant guard).
    const ord = await query(
      `SELECT id, project_id FROM pm_hire_in_orders WHERE id=$1 AND company_id=$2 AND is_deleted=false`,
      [b.hire_order_id, CID(req)]);
    if (!ord.rows.length) return res.status(400).json({ error: 'Invalid hire order for this company' });

    const result = await withTransaction(async (client) => {
      const hdr = await client.query(
        `INSERT INTO hire_vendor_invoices
           (company_id, hire_order_id, project_id, invoice_no, invoice_date,
            period_from, period_to, gst_rate, tcs_amount, remarks, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
        [CID(req), b.hire_order_id, b.project_id || ord.rows[0].project_id || null,
         b.invoice_no || null, b.invoice_date || null, b.period_from || null, b.period_to || null,
         b.gst_rate == null ? 18 : n(b.gst_rate), n(b.tcs_amount), b.remarks || null, req.user.id]);
      const inv = hdr.rows[0];
      for (const ln of (b.lines || [])) {
        const qty = n(ln.invoiced_qty);
        const rate = n(ln.rate);
        if (!qty && !rate && !ln.description) continue;
        await client.query(
          `INSERT INTO hire_vendor_invoice_lines
             (invoice_id, description, usage_category, invoiced_qty, rate, invoiced_amount, log_ref)
           VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [inv.id, ln.description || null, ln.usage_category || null, qty, rate,
           +(qty * rate).toFixed(2), ln.log_ref || null]);
      }
      await recomputeTotals(client, inv.id);
      return inv;
    });
    res.status(201).json({ data: result });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Invoice: edit (draft only) ───────────────────────────────────────────────
router.put('/invoices/:id([0-9a-fA-F-]{36})', authorize(...ENTRY), async (req, res) => {
  try {
    const cur = await query(`SELECT status FROM hire_vendor_invoices WHERE id=$1 AND company_id=$2`,
      [req.params.id, CID(req)]);
    if (!cur.rows.length) return res.status(404).json({ error: 'Invoice not found' });
    if (cur.rows[0].status !== 'draft') return res.status(400).json({ error: 'Only draft invoices can be edited' });
    const b = req.body;
    await withTransaction(async (client) => {
      await client.query(
        `UPDATE hire_vendor_invoices
           SET invoice_no=$1, invoice_date=$2, period_from=$3, period_to=$4,
               gst_rate=$5, tcs_amount=$6, remarks=$7, updated_at=NOW()
         WHERE id=$8`,
        [b.invoice_no || null, b.invoice_date || null, b.period_from || null, b.period_to || null,
         b.gst_rate == null ? 18 : n(b.gst_rate), n(b.tcs_amount), b.remarks || null, req.params.id]);
      if (Array.isArray(b.lines)) {
        await client.query(`DELETE FROM hire_vendor_invoice_lines WHERE invoice_id=$1`, [req.params.id]);
        for (const ln of b.lines) {
          const qty = n(ln.invoiced_qty);
          const rate = n(ln.rate);
          if (!qty && !rate && !ln.description) continue;
          await client.query(
            `INSERT INTO hire_vendor_invoice_lines
               (invoice_id, description, usage_category, invoiced_qty, rate, invoiced_amount, log_ref)
             VALUES ($1,$2,$3,$4,$5,$6,$7)`,
            [req.params.id, ln.description || null, ln.usage_category || null, qty, rate,
             +(qty * rate).toFixed(2), ln.log_ref || null]);
        }
      }
      await recomputeTotals(client, req.params.id);
    });
    res.json({ message: 'Updated' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── QS Certification: set certified qty per line, move draft → certified ──────
router.patch('/invoices/:id([0-9a-fA-F-]{36})/certify', authorize(...CERTIFY), async (req, res) => {
  try {
    const cur = await query(`SELECT status FROM hire_vendor_invoices WHERE id=$1 AND company_id=$2`,
      [req.params.id, CID(req)]);
    if (!cur.rows.length) return res.status(404).json({ error: 'Invoice not found' });
    if (cur.rows[0].status !== 'draft') return res.status(400).json({ error: 'Only draft invoices can be certified' });
    const { lines } = req.body; // [{ id, certified_qty }]
    await withTransaction(async (client) => {
      for (const ln of (lines || [])) {
        if (!ln.id) continue;
        const cq = n(ln.certified_qty);
        // certified_amount = certified_qty × that line's rate
        await client.query(
          `UPDATE hire_vendor_invoice_lines
             SET certified_qty=$1, certified_amount=ROUND(($1 * rate)::numeric, 2)
           WHERE id=$2 AND invoice_id=$3`,
          [cq, ln.id, req.params.id]);
      }
      await recomputeTotals(client, req.params.id);
      await client.query(
        `UPDATE hire_vendor_invoices
           SET status='certified', certified_by=$1, certified_at=NOW(), updated_at=NOW()
         WHERE id=$2`, [req.user.id, req.params.id]);
    });
    res.json({ message: 'Certified' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Approval: certified → approved ───────────────────────────────────────────
router.patch('/invoices/:id([0-9a-fA-F-]{36})/approve', authorize(...APPROVE), async (req, res) => {
  try {
    const r = await query(
      `UPDATE hire_vendor_invoices
         SET status='approved', approved_by=$1, approved_at=NOW(), updated_at=NOW()
       WHERE id=$2 AND company_id=$3 AND status='certified' RETURNING *`,
      [req.user.id, req.params.id, CID(req)]);
    if (!r.rows.length) return res.status(400).json({ error: 'Invoice not found or not in certified status' });
    res.json({ data: r.rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Reject: draft/certified → rejected ───────────────────────────────────────
router.patch('/invoices/:id([0-9a-fA-F-]{36})/reject', authorize(...CERTIFY), async (req, res) => {
  try {
    const r = await query(
      `UPDATE hire_vendor_invoices
         SET status='rejected', remarks=COALESCE($1, remarks), updated_at=NOW()
       WHERE id=$2 AND company_id=$3 AND status IN ('draft','certified') RETURNING *`,
      [req.body.remarks || null, req.params.id, CID(req)]);
    if (!r.rows.length) return res.status(400).json({ error: 'Invoice not found or not rejectable' });
    res.json({ data: r.rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Payment: approved → paid ─────────────────────────────────────────────────
router.patch('/invoices/:id([0-9a-fA-F-]{36})/pay', authorize(...PAY), async (req, res) => {
  try {
    const { payment_date, payment_mode, payment_ref, amount_paid } = req.body;
    if (!payment_date || !payment_mode) return res.status(400).json({ error: 'payment_date and payment_mode are required' });
    const r = await query(
      `UPDATE hire_vendor_invoices
         SET status='paid', payment_date=$1, payment_mode=$2, payment_ref=$3,
             amount_paid=$4, updated_at=NOW()
       WHERE id=$5 AND company_id=$6 AND status='approved' RETURNING *`,
      [payment_date, payment_mode, payment_ref || null, n(amount_paid), req.params.id, CID(req)]);
    if (!r.rows.length) return res.status(400).json({ error: 'Invoice not found or not in approved status' });
    const inv = r.rows[0];

    // Journal: Dr Equipment Hire (5200) / Cr Bank (1010)
    const amt = n(amount_paid) || parseFloat(inv.total_amount || 0);
    if (amt > 0) {
      postAutoJournalStandalone({
        companyId: CID(req), userId: req.user.id,
        entryDate: payment_date,
        projectId: inv.project_id || null,
        reference: inv.invoice_number || `HIRE-${inv.id.slice(0, 8)}`,
        narration: `Equipment hire payment — ${inv.vendor_name || ''}`,
        source: 'auto_hire_rental',
        lines: [
          { code: '5200', debit:  amt, description: `Hire/rental — ${inv.vendor_name || ''}` },
          { code: '1010', credit: amt, description: `Bank payment — ${payment_mode}` },
        ],
      }).catch(() => {});

      notifyAccountsDept(CID(req), `Hire Rental Paid ₹${Math.round(amt).toLocaleString('en-IN')}`,
        `Equipment hire invoice paid. Vendor: ${inv.vendor_name||''}. Invoice: ${inv.invoice_number||''}. Amount: ₹${Math.round(amt).toLocaleString('en-IN')}.`,
        '/accounts/journal-entries').catch(() => {});
    }

    res.json({ data: inv });
  } catch (e) { res.status(500).json({ error: e.message }); }
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

// ── Delete (draft/rejected only) ─────────────────────────────────────────────
router.delete('/invoices/:id([0-9a-fA-F-]{36})', authorize(...ENTRY), async (req, res) => {
  try {
    const r = await query(
      `DELETE FROM hire_vendor_invoices
       WHERE id=$1 AND company_id=$2 AND status IN ('draft','rejected') RETURNING id`,
      [req.params.id, CID(req)]);
    if (!r.rows.length) return res.status(400).json({ error: 'Invoice not found or cannot be deleted' });
    res.json({ message: 'Deleted' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Dashboard KPIs ───────────────────────────────────────────────────────────
router.get('/dashboard', async (req, res) => {
  try {
    const r = await query(`
      SELECT
        (SELECT COUNT(*) FROM pm_hire_in_orders WHERE company_id=$1 AND is_deleted=false
          AND status NOT IN ('returned','invoiced'))                                   AS active_orders,
        COALESCE(SUM(total_amount) FILTER (WHERE status IN ('draft','certified')),0)    AS pending_value,
        COUNT(*) FILTER (WHERE status IN ('draft','certified'))                         AS pending_count,
        COALESCE(SUM(total_amount) FILTER (WHERE status='approved'),0)                  AS approved_unpaid,
        COALESCE(SUM(total_amount) FILTER (WHERE status='paid'),0)                      AS paid_value,
        COALESCE(SUM(gross_amount - certified_amount) FILTER (WHERE status IN ('certified','approved','paid') AND certified_amount>0),0) AS certification_savings
      FROM hire_vendor_invoices
      WHERE company_id=$1`, [CID(req)]);
    res.json({ data: r.rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Reports: per-order rollup (ordered vs invoiced vs certified vs paid) ──────
router.get('/reports/orders', async (req, res) => {
  try {
    const { project_id } = req.query;
    let sql = `
      SELECT h.order_no, h.vendor_name, h.equipment_desc, h.rate_type, h.hire_rate,
             p.name AS project_name,
             COUNT(i.id)                                                   AS invoice_count,
             COALESCE(SUM(i.gross_amount),0)                               AS invoiced_value,
             COALESCE(SUM(i.certified_amount),0)                           AS certified_value,
             COALESCE(SUM(i.total_amount) FILTER (WHERE i.status IN ('approved','paid')),0) AS payable_value,
             COALESCE(SUM(i.amount_paid) FILTER (WHERE i.status='paid'),0) AS paid_value
      FROM pm_hire_in_orders h
      LEFT JOIN hire_vendor_invoices i ON i.hire_order_id=h.id
      LEFT JOIN projects p ON p.id=h.project_id
      WHERE h.company_id=$1 AND h.is_deleted=false`;
    const params = [CID(req)]; let i = 2;
    if (project_id) { sql += ` AND h.project_id=$${i++}`; params.push(project_id); }
    sql += ' GROUP BY h.id, p.name ORDER BY h.created_at DESC';
    res.json({ data: (await query(sql, params)).rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});


module.exports = router;
