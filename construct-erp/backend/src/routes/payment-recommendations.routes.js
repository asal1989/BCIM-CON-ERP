// Payment Recommendations — site team batches approved bills and sends to accounts for payment
const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const { query, withTransaction } = require('../config/database');
const { runSchemaInit } = require('../utils/schemaInit');
const { createNotification } = require('../controllers/notification.controller');

router.use(authenticate);
const CID = req => req.user.company_id;

const RECOMMENDERS = ['super_admin', 'admin', 'project_manager', 'qs_engineer', 'site_engineer', 'project_head'];
const APPROVERS    = ['super_admin', 'admin', 'project_manager', 'project_head'];
const PAYERS       = ['super_admin', 'admin', 'accountant'];

// ── Schema ───────────────────────────────────────────────────────────────────
runSchemaInit('payment_recommendations_tables', async () => {
  await query(`
    CREATE TABLE IF NOT EXISTS payment_recommendations (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      project_id      UUID REFERENCES projects(id),
      pr_number       TEXT NOT NULL,
      status          TEXT NOT NULL DEFAULT 'draft'
                        CHECK (status IN ('draft','submitted','approved','processing','paid','cancelled')),
      priority        TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('urgent','normal')),
      total_amount    NUMERIC(15,2) DEFAULT 0,
      remarks         TEXT,
      recommended_by  UUID REFERENCES users(id),
      approved_by     UUID REFERENCES users(id),
      approved_at     TIMESTAMPTZ,
      paid_by         UUID REFERENCES users(id),
      paid_at         TIMESTAMPTZ,
      payment_mode    TEXT,
      payment_ref     TEXT,
      created_at      TIMESTAMPTZ DEFAULT NOW(),
      updated_at      TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_pr_company ON payment_recommendations(company_id, status)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_pr_project ON payment_recommendations(project_id)`);

  await query(`
    CREATE TABLE IF NOT EXISTS payment_recommendation_items (
      id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      pr_id               UUID NOT NULL REFERENCES payment_recommendations(id) ON DELETE CASCADE,
      bill_type           TEXT NOT NULL CHECK (bill_type IN ('tqs','sc','hire')),
      bill_id             UUID NOT NULL,
      vendor_name         TEXT,
      bill_number         TEXT,
      bill_amount         NUMERIC(15,2) DEFAULT 0,
      recommended_amount  NUMERIC(15,2) DEFAULT 0,
      payment_ref         TEXT,
      payment_date        DATE,
      paid_at             TIMESTAMPTZ,
      created_at          TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_pri_pr ON payment_recommendation_items(pr_id)`);
});

// ── PR number generator ───────────────────────────────────────────────────────
async function nextPRNumber(company_id) {
  const r = await query(
    `SELECT COUNT(*)::int AS cnt FROM payment_recommendations WHERE company_id=$1`,
    [company_id]
  );
  return `BCIM-PR-${String((r.rows[0]?.cnt || 0) + 1).padStart(3, '0')}`;
}

// ── GET /payment-recommendations/pending-bills ──────────────────────────────
// Returns all approved-but-unpaid bills across TQS, SC, Hire Rental for a project
router.get('/pending-bills', authorize(...RECOMMENDERS), async (req, res) => {
  try {
    const { project_id } = req.query;
    const cid = CID(req);
    const pCond = project_id ? 'AND b.project_id = $2' : '';
    const params = project_id ? [cid, project_id] : [cid];

    // Already recommended bill_ids (to exclude)
    const excl = await query(
      `SELECT pri.bill_id::text, pri.bill_type
         FROM payment_recommendation_items pri
         JOIN payment_recommendations pr ON pr.id = pri.pr_id
        WHERE pr.company_id=$1 AND pr.status NOT IN ('cancelled','paid')`,
      [cid]
    );
    const exclIds = { tqs: new Set(), sc: new Set(), hire: new Set() };
    excl.rows.forEach(r => exclIds[r.bill_type]?.add(r.bill_id));

    const [tqs, sc, hire] = await Promise.all([
      // TQS bills: all unpaid (any workflow_status except 'paid')
      query(
        `SELECT b.id, b.vendor_name, b.inv_number AS bill_number,
                b.basic_amount, b.total_amount AS bill_amount,
                b.inv_date AS bill_date, p.name AS project_name, b.project_id,
                b.workflow_status AS status,
                'tqs' AS bill_type
           FROM tqs_bills b
           JOIN projects p ON p.id = b.project_id
          WHERE b.company_id=$1 AND b.workflow_status NOT IN ('paid','cancelled') AND b.is_deleted=false
            ${project_id ? 'AND b.project_id=$2' : ''}
          ORDER BY b.inv_date DESC`,
        params
      ),
      // SC bills: all unpaid (submitted/approved, not paid/rejected/draft)
      query(
        `SELECT b.id, sc.name AS vendor_name, b.bill_number,
                b.gross_amount AS basic_amount, b.net_payable AS bill_amount,
                b.bill_date, p.name AS project_name, b.project_id,
                b.status,
                'sc' AS bill_type
           FROM sc_bills b
           JOIN sc_subcontractors sc ON sc.id = b.sc_id
           LEFT JOIN projects p ON p.id = b.project_id
          WHERE b.company_id=$1 AND b.status NOT IN ('paid','rejected','draft')
            ${project_id ? 'AND b.project_id=$2' : ''}
          ORDER BY b.bill_date DESC`,
        params
      ),
      // Hire rental: all unpaid
      query(
        `SELECT hvi.id, v.name AS vendor_name, hvi.invoice_no AS bill_number,
                hvi.gross_amount AS basic_amount, hvi.certified_amount AS bill_amount,
                hvi.invoice_date AS bill_date, p.name AS project_name, hvi.project_id,
                hvi.status,
                'hire' AS bill_type
           FROM hire_vendor_invoices hvi
           JOIN pm_hire_in_orders ho ON ho.id = hvi.hire_order_id
           JOIN vendors v ON v.id = ho.vendor_id
           JOIN projects p ON p.id = hvi.project_id
          WHERE hvi.company_id=$1 AND hvi.status NOT IN ('paid','cancelled')
            ${project_id ? 'AND hvi.project_id=$2' : ''}
          ORDER BY hvi.invoice_date DESC`,
        params
      ),
    ]);

    // Filter out already-in-progress recommendations
    const filter = (rows, type) =>
      rows.filter(r => !exclIds[type].has(r.id));

    res.json({
      data: {
        tqs:  filter(tqs.rows,  'tqs'),
        sc:   filter(sc.rows,   'sc'),
        hire: filter(hire.rows, 'hire'),
      }
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── GET /payment-recommendations ────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { project_id, status, date_from, date_to } = req.query;
    let sql = `
      SELECT pr.*, p.name AS project_name,
             u1.name AS recommended_by_name,
             u2.name AS approved_by_name,
             (SELECT COUNT(*)::int FROM payment_recommendation_items WHERE pr_id = pr.id) AS item_count
        FROM payment_recommendations pr
        LEFT JOIN projects p ON p.id = pr.project_id
        LEFT JOIN users u1 ON u1.id = pr.recommended_by
        LEFT JOIN users u2 ON u2.id = pr.approved_by
       WHERE pr.company_id = $1
    `;
    const params = [CID(req)];
    let i = 2;
    if (project_id) { sql += ` AND pr.project_id=$${i++}`;              params.push(project_id); }
    if (status)     { sql += ` AND pr.status=$${i++}`;                  params.push(status); }
    if (date_from)  { sql += ` AND pr.created_at::date >= $${i++}`;     params.push(date_from); }
    if (date_to)    { sql += ` AND pr.created_at::date <= $${i++}`;     params.push(date_to); }
    sql += ` ORDER BY pr.created_at DESC`;
    const r = await query(sql, params);
    res.json({ data: r.rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── GET /payment-recommendations/:id ────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const pr = await query(
      `SELECT pr.*, p.name AS project_name,
              u1.name AS recommended_by_name, u2.name AS approved_by_name
         FROM payment_recommendations pr
         LEFT JOIN projects p ON p.id = pr.project_id
         LEFT JOIN users u1 ON u1.id = pr.recommended_by
         LEFT JOIN users u2 ON u2.id = pr.approved_by
        WHERE pr.id=$1 AND pr.company_id=$2`,
      [req.params.id, CID(req)]
    );
    if (!pr.rows[0]) return res.status(404).json({ error: 'Not found' });

    const items = await query(
      `SELECT * FROM payment_recommendation_items WHERE pr_id=$1 ORDER BY created_at`,
      [req.params.id]
    );
    res.json({ data: { ...pr.rows[0], items: items.rows } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── POST /payment-recommendations ────────────────────────────────────────────
router.post('/', authorize(...RECOMMENDERS), async (req, res) => {
  try {
    const { project_id, priority = 'normal', remarks, items = [] } = req.body;
    if (!items.length) return res.status(400).json({ error: 'Select at least one bill' });

    const pr_number = await nextPRNumber(CID(req));
    const total = items.reduce((s, it) => s + parseFloat(it.recommended_amount || it.bill_amount || 0), 0);

    const created = await withTransaction(async (client) => {
      const r = await client.query(
        `INSERT INTO payment_recommendations
           (company_id, project_id, pr_number, status, priority, total_amount, remarks, recommended_by)
         VALUES ($1,$2,$3,'submitted',$4,$5,$6,$7) RETURNING *`,
        [CID(req), project_id || null, pr_number, priority, total, remarks || null, req.user.id]
      );
      const pr = r.rows[0];

      for (const it of items) {
        await client.query(
          `INSERT INTO payment_recommendation_items
             (pr_id, bill_type, bill_id, vendor_name, bill_number, bill_amount, recommended_amount)
           VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [pr.id, it.bill_type, it.bill_id, it.vendor_name, it.bill_number,
           parseFloat(it.bill_amount || 0), parseFloat(it.recommended_amount || it.bill_amount || 0)]
        );
      }
      return pr;
    });

    createNotification({
      company_id: CID(req), target_role: 'project_manager',
      type: 'payment_recommendation',
      title: `Payment Recommendation ${pr_number} awaiting approval`,
      message: `${items.length} bill(s) · ₹${total.toLocaleString('en-IN', { maximumFractionDigits: 0 })} total`,
      link: '/sc/payment-recommendations',
      severity: 'info', related_type: 'payment_recommendation', related_id: created.id,
      sendEmail: false,
    });

    res.status(201).json({ data: created });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── PATCH /payment-recommendations/:id/approve ───────────────────────────────
router.patch('/:id/approve', authorize(...APPROVERS), async (req, res) => {
  try {
    const existing = await query(
      `SELECT * FROM payment_recommendations WHERE id=$1 AND company_id=$2`,
      [req.params.id, CID(req)]
    );
    if (!existing.rows[0]) return res.status(404).json({ error: 'Not found' });
    if (existing.rows[0].status !== 'submitted')
      return res.status(400).json({ error: 'Only submitted PRs can be approved' });

    const r = await query(
      `UPDATE payment_recommendations
          SET status='approved', approved_by=$1, approved_at=NOW(), updated_at=NOW()
        WHERE id=$2 RETURNING *`,
      [req.user.id, req.params.id]
    );

    createNotification({
      company_id: CID(req), target_role: 'accountant',
      type: 'payment_recommendation_approved',
      title: `${existing.rows[0].pr_number} approved — ready for payment`,
      message: `₹${Number(existing.rows[0].total_amount).toLocaleString('en-IN', { maximumFractionDigits: 0 })} to be processed`,
      link: '/sc/payment-recommendations',
      severity: 'info', related_type: 'payment_recommendation', related_id: req.params.id,
      sendEmail: false,
    });

    res.json({ data: r.rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── PATCH /payment-recommendations/:id/reject ────────────────────────────────
router.patch('/:id/reject', authorize(...APPROVERS), async (req, res) => {
  try {
    const r = await query(
      `UPDATE payment_recommendations SET status='cancelled', updated_at=NOW()
        WHERE id=$1 AND company_id=$2 AND status='submitted' RETURNING *`,
      [req.params.id, CID(req)]
    );
    if (!r.rows[0]) return res.status(404).json({ error: 'Not found or not in submitted state' });
    res.json({ data: r.rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── PATCH /payment-recommendations/:id/process ───────────────────────────────
// Accounts marks the whole PR as paid; optionally records per-item payment refs
router.patch('/:id/process', authorize(...PAYERS), async (req, res) => {
  try {
    const existing = await query(
      `SELECT * FROM payment_recommendations WHERE id=$1 AND company_id=$2`,
      [req.params.id, CID(req)]
    );
    if (!existing.rows[0]) return res.status(404).json({ error: 'Not found' });
    if (existing.rows[0].status !== 'approved')
      return res.status(400).json({ error: 'PR must be approved before processing payment' });

    const { payment_mode, payment_ref, payment_date, items = [] } = req.body;
    const pDate = payment_date || new Date().toISOString().split('T')[0];

    await withTransaction(async (client) => {
      // Update item-level payment refs if provided
      for (const it of items) {
        await client.query(
          `UPDATE payment_recommendation_items
              SET payment_ref=$1, payment_date=$2, paid_at=NOW()
            WHERE id=$3 AND pr_id=$4`,
          [it.payment_ref || payment_ref, pDate, it.id, req.params.id]
        );
      }
      // If no per-item refs, bulk update all items
      if (!items.length) {
        await client.query(
          `UPDATE payment_recommendation_items
              SET payment_ref=$1, payment_date=$2, paid_at=NOW()
            WHERE pr_id=$3`,
          [payment_ref, pDate, req.params.id]
        );
      }

      // Mark source bills as paid based on bill_type
      const prItems = await client.query(
        `SELECT * FROM payment_recommendation_items WHERE pr_id=$1`, [req.params.id]
      );
      for (const it of prItems.rows) {
        if (it.bill_type === 'tqs') {
          await client.query(
            `UPDATE tqs_bills SET workflow_status='paid', updated_at=NOW() WHERE id=$1`,
            [it.bill_id]
          );
        } else if (it.bill_type === 'sc') {
          await client.query(
            `UPDATE sc_bills SET status='paid', updated_at=NOW() WHERE id=$1`,
            [it.bill_id]
          );
        } else if (it.bill_type === 'hire') {
          await client.query(
            `UPDATE hire_vendor_invoices SET status='paid', payment_date=$1, payment_ref=$2, updated_at=NOW() WHERE id=$3`,
            [pDate, payment_ref || null, it.bill_id]
          );
        }
      }

      await client.query(
        `UPDATE payment_recommendations
            SET status='paid', paid_by=$1, paid_at=NOW(), payment_mode=$2, payment_ref=$3, updated_at=NOW()
          WHERE id=$4`,
        [req.user.id, payment_mode || null, payment_ref || null, req.params.id]
      );
    });

    res.json({ message: 'Payment processed successfully' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
