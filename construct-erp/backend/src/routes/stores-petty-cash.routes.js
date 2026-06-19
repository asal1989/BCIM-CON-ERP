// src/routes/stores-petty-cash.routes.js
// Stores Petty Cash Tracker — simple site-level cash book (Local Purchases + Other
// Advances). Deliberately NOT linked to the Accounts > Petty Cash module (no
// custodian/approval/settlement workflow, no GL postings) — this is a direct log
// mirroring the storekeeper's manual Excel register.
const express = require('express');
const { authenticate } = require('../middleware/auth');
const { query, withTransaction } = require('../config/database');
const router = express.Router();

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
      created_by   UUID,
      created_at   TIMESTAMPTZ DEFAULT NOW(),
      updated_at   TIMESTAMPTZ DEFAULT NOW()
    )
  `);

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
      created_by   UUID,
      created_at   TIMESTAMPTZ DEFAULT NOW(),
      updated_at   TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await safe(`CREATE INDEX IF NOT EXISTS idx_spce_project ON stores_petty_cash_entries(project_id)`);
  await safe(`CREATE INDEX IF NOT EXISTS idx_spce_date    ON stores_petty_cash_entries(entry_date)`);
  await safe(`CREATE INDEX IF NOT EXISTS idx_spci_entry   ON stores_petty_cash_items(entry_id)`);
  await safe(`CREATE INDEX IF NOT EXISTS idx_spca_project ON stores_petty_cash_advances(project_id)`);
  await safe(`CREATE INDEX IF NOT EXISTS idx_spca_date    ON stores_petty_cash_advances(advance_date)`);

  console.log('[StoresPettyCash] Schema OK');
})();

const n = (v) => parseFloat(v) || 0;

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
    const { project_id, from, to, search, limit = 200, offset = 0 } = req.query;
    const conditions = ['e.company_id = $1'];
    const params = [req.user.company_id];
    let p = 1;

    if (project_id) { conditions.push(`e.project_id = $${++p}`); params.push(project_id); }
    if (from)       { conditions.push(`e.entry_date >= $${++p}`); params.push(from); }
    if (to)         { conditions.push(`e.entry_date <= $${++p}`); params.push(to); }
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
       ORDER BY e.entry_date DESC, e.sl_no DESC
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
    const { project_id, entry_date, supplier, invoice_no, amount = 0, remarks, items = [] } = req.body;
    if (!entry_date) return res.status(400).json({ error: 'entry_date is required' });
    if (!supplier?.trim()) return res.status(400).json({ error: 'supplier is required' });
    if (!items.filter(i => i.material_name?.trim()).length) {
      return res.status(400).json({ error: 'At least one material line is required' });
    }

    const result = await withTransaction(async (client) => {
      const sl_no = await nextSlNo(client, req.user.company_id, project_id);
      const r = await client.query(
        `INSERT INTO stores_petty_cash_entries
          (company_id, project_id, sl_no, entry_date, supplier, invoice_no, amount, remarks, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
        [req.user.company_id, project_id || null, sl_no, entry_date, supplier.trim(),
         invoice_no || null, n(amount), remarks || null, req.user.id]
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

    const { project_id, entry_date, supplier, invoice_no, amount = 0, remarks, items = [] } = req.body;

    await withTransaction(async (client) => {
      await client.query(
        `UPDATE stores_petty_cash_entries SET
           project_id=$1, entry_date=$2, supplier=$3, invoice_no=$4, amount=$5, remarks=$6, updated_at=NOW()
         WHERE id=$7`,
        [project_id || null, entry_date, supplier?.trim(), invoice_no || null, n(amount), remarks || null, req.params.id]
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

router.delete('/entries/:id', authenticate, async (req, res) => {
  try {
    const existing = await getEntry(req.params.id, req.user.company_id);
    if (!existing) return res.status(404).json({ error: 'Entry not found' });
    await query(`DELETE FROM stores_petty_cash_entries WHERE id = $1`, [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* ═══════════════════════════════════════════════════════════════════════════
   OTHER PETTY CASH (advances to contractors / employees)
═══════════════════════════════════════════════════════════════════════════ */

router.get('/advances', authenticate, async (req, res) => {
  try {
    const { project_id, from, to, search, limit = 200, offset = 0 } = req.query;
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
       ORDER BY a.advance_date DESC, a.created_at DESC
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
        (company_id, project_id, advance_date, payee_name, description, amount, remarks, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [req.user.company_id, project_id || null, advance_date, payee_name.trim(), description || 'SALARY ADVANCE',
       n(amount), remarks || null, req.user.id]
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
   SUMMARY (for dashboard cards)
═══════════════════════════════════════════════════════════════════════════ */

router.get('/summary', authenticate, async (req, res) => {
  try {
    const { project_id, from, to } = req.query;
    const conditions = ['company_id = $1'];
    const params = [req.user.company_id];
    let p = 1;
    if (project_id) { conditions.push(`project_id = $${++p}`); params.push(project_id); }

    const eCond = [...conditions];
    const eParams = [...params];
    let ep = p;
    if (from) { eCond.push(`entry_date >= $${++ep}`); eParams.push(from); }
    if (to)   { eCond.push(`entry_date <= $${++ep}`); eParams.push(to); }

    const aCond = [...conditions];
    const aParams = [...params];
    let ap = p;
    if (from) { aCond.push(`advance_date >= $${++ap}`); aParams.push(from); }
    if (to)   { aCond.push(`advance_date <= $${++ap}`); aParams.push(to); }

    const localTotal = await query(
      `SELECT COALESCE(SUM(amount),0) AS total, COUNT(*) AS count FROM stores_petty_cash_entries WHERE ${eCond.join(' AND ')}`,
      eParams
    );
    const advanceTotal = await query(
      `SELECT COALESCE(SUM(amount),0) AS total, COUNT(*) AS count FROM stores_petty_cash_advances WHERE ${aCond.join(' AND ')}`,
      aParams
    );

    res.json({
      data: {
        local_purchase_total: parseFloat(localTotal.rows[0].total),
        local_purchase_count: parseInt(localTotal.rows[0].count),
        advance_total:        parseFloat(advanceTotal.rows[0].total),
        advance_count:        parseInt(advanceTotal.rows[0].count),
        grand_total:          parseFloat(localTotal.rows[0].total) + parseFloat(advanceTotal.rows[0].total),
      },
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
