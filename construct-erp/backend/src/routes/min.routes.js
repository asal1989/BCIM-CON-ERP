// src/routes/min.routes.js — Material Issue Notes
const express = require('express');
const { authenticate, authorize } = require('../middleware/auth');
const { loadProjectScope, userCanAccessProject, appendProjectScope } = require('../middleware/projectScope');
const { query, withTransaction } = require('../config/database');
const { postAutoJournalStandalone } = require('../services/journalAutoPost');
const { sendMail } = require('../services/mail.service');
const router = express.Router();
router.use(authenticate);
router.use(loadProjectScope);

(async () => {
  const safe = (sql) => query(sql).catch(e => console.warn('[MIN migration]', e.message));
  await safe(`ALTER TABLE material_issue_notes ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'draft'`);
  await safe(`ALTER TABLE material_issue_notes ADD COLUMN IF NOT EXISTS contractor_id UUID`);
  await safe(`ALTER TABLE material_issue_notes ADD COLUMN IF NOT EXISTS activity_name VARCHAR(255)`);
  await safe(`ALTER TABLE material_issue_notes ADD COLUMN IF NOT EXISTS verified_receiver_by UUID`);
  await safe(`ALTER TABLE material_issue_notes ADD COLUMN IF NOT EXISTS verified_receiver_at TIMESTAMPTZ`);
  await safe(`ALTER TABLE material_issue_notes ADD COLUMN IF NOT EXISTS verified_receiver_sig TEXT`);
  await safe(`ALTER TABLE material_issue_notes ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()`);
  await safe(`ALTER TABLE material_issue_notes ADD COLUMN IF NOT EXISTS material_notes TEXT`);
  await safe(`ALTER TABLE material_issue_notes ADD COLUMN IF NOT EXISTS instructions_notes TEXT`);
})();

async function nextMINNumber(client, companyId) {
  const yr = new Date().getFullYear();
  const r = await client.query(
    `SELECT min_number FROM material_issue_notes 
     WHERE min_number LIKE $1 ORDER BY created_at DESC LIMIT 1`,
    [`MIN-${yr}-%`]
  );
  const last = r.rows[0]?.min_number;
  const seq = last ? parseInt(last.split('-')[2]) + 1 : 1;
  return `MIN-${yr}-${String(seq).padStart(4, '0')}`;
}

// GET /stores/min
router.get('/', async (req, res) => {
  try {
    const { project_id, status } = req.query;
    let sql = `
      SELECT mi.*, p.name AS project_name, v.name AS contractor_name,
             u.name AS issued_by_name, r.name AS receiver_name
      FROM material_issue_notes mi
      JOIN projects p ON mi.project_id = p.id
      LEFT JOIN vendors v ON mi.contractor_id = v.id
      JOIN users u ON mi.issued_by = u.id
      LEFT JOIN users r ON mi.verified_receiver_by = r.id
      WHERE p.company_id = $1`;
    let params = [req.user.company_id]; let idx = 2;
    if (project_id) { sql += ` AND mi.project_id = $${idx++}`; params.push(project_id); }
    if (status)     { sql += ` AND mi.status = $${idx++}`;     params.push(status); }
    ({ sql, params } = appendProjectScope(req, sql, params, 'mi'));
    sql += ` ORDER BY mi.issue_date DESC`;
    const result = await query(sql, params);

    const ids = result.rows.map(r => r.id);
    let itemsMap = {};
    if (ids.length) {
      const items = await query(
        `SELECT mi.*, i.closing_stock as current_stock 
         FROM min_items mi 
         LEFT JOIN inventory i ON mi.inventory_id = i.id
         WHERE mi.min_id = ANY($1::uuid[]) 
         ORDER BY mi.sort_order`,
        [ids]
      );
      items.rows.forEach(it => {
        if (!itemsMap[it.min_id]) itemsMap[it.min_id] = [];
        itemsMap[it.min_id].push(it);
      });
    }
    const data = result.rows.map(r => ({ ...r, items: itemsMap[r.id] || [] }));
    res.json({ data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /stores/min/:id
router.get('/:id', async (req, res) => {
  try {
    const min = await query(
      `SELECT mi.*, p.name AS project_name, p.company_id, v.name AS contractor_name,
              u.name AS issued_by_name, r.name AS receiver_name
       FROM material_issue_notes mi
       JOIN projects p ON mi.project_id = p.id
       LEFT JOIN vendors v ON mi.contractor_id = v.id
       JOIN users u ON mi.issued_by = u.id
       LEFT JOIN users r ON mi.verified_receiver_by = r.id
       WHERE mi.id = $1`,
      [req.params.id]
    );
    if (!min.rows.length || min.rows[0].company_id !== req.user.company_id) {
      return res.status(404).json({ error: 'MIN not found' });
    }
    if (!userCanAccessProject(req, min.rows[0].project_id)) {
      return res.status(403).json({ error: 'You do not have access to this project.' });
    }
    const items = await query(
      `SELECT * FROM min_items WHERE min_id = $1 ORDER BY sort_order`,
      [req.params.id]
    );
    res.json({ data: { ...min.rows[0], items: items.rows } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /stores/min — create draft issue note
router.post('/', async (req, res) => {
  try {
    const {
      project_id, mrs_id, issued_to, vehicle_number,
      issue_date, remarks, items, activity_name, contractor_id,
      material_notes, instructions_notes
    } = req.body;

    if (!project_id || !items?.length) {
      return res.status(400).json({ error: 'project_id and items are required' });
    }
    if (!userCanAccessProject(req, project_id)) {
      return res.status(403).json({ error: 'You do not have access to this project.' });
    }

    const result = await withTransaction(async (client) => {
      const min_number = await nextMINNumber(client, req.user.company_id);
      
      const min = await client.query(
        `INSERT INTO material_issue_notes
           (project_id, min_number, mrs_id, issued_to, issued_by, vehicle_number,
            issue_date, remarks, activity_name, contractor_id,
            material_notes, instructions_notes, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'draft') RETURNING *`,
        [project_id, min_number, mrs_id || null, issued_to, req.user.id, vehicle_number || null,
         issue_date || new Date(), remarks, activity_name, contractor_id || null,
         material_notes || null, instructions_notes || null]
      );

      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        await client.query(
          `INSERT INTO min_items
             (min_id, inventory_id, material_name, unit, quantity_requested, quantity_issued, rate, amount, purpose, sort_order)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
          [min.rows[0].id, it.inventory_id, it.material_name, it.unit,
           it.quantity_requested || it.quantity_issued, it.quantity_issued,
           it.rate || 0, (it.rate || 0) * (it.quantity_issued || 0), it.purpose, i + 1]
        );
      }
      return min.rows[0];
    });

    res.status(201).json({ data: result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /stores/min/:id/authorize — Deduct stock and finalize
router.patch('/:id/authorize', async (req, res) => {
  try {
    const result = await withTransaction(async (client) => {
      // 1. Get MIN & items
      const minR = await client.query(
        `SELECT mi.*, p.company_id
         FROM material_issue_notes mi
         JOIN projects p ON p.id = mi.project_id
         WHERE mi.id=$1 AND mi.status='draft'
         FOR UPDATE`,
        [req.params.id]
      );
      if (!minR.rows.length) throw new Error('MIN not found or already authorized');
      const min = minR.rows[0];
      if (min.company_id !== req.user.company_id) {
        throw Object.assign(new Error('MIN not found'), { status: 404 });
      }
      if (!userCanAccessProject(req, min.project_id)) {
        throw Object.assign(new Error('You do not have access to this project.'), { status: 403 });
      }

      const itemsR = await client.query(`SELECT * FROM min_items WHERE min_id=$1`, [min.id]);
      const items = itemsR.rows;

      // 2. Process stock deduction for each item
      for (const it of items) {
        if (!it.inventory_id || it.quantity_issued <= 0) continue;

        const inv = await client.query(`SELECT closing_stock FROM inventory WHERE id=$1 FOR UPDATE`, [it.inventory_id]);
        if (!inv.rows.length) throw new Error(`Inventory item missing: ${it.material_name}`);
        if (parseFloat(inv.rows[0].closing_stock) < parseFloat(it.quantity_issued)) {
          throw new Error(`Insufficient stock for ${it.material_name}`);
        }

        await client.query(`UPDATE inventory SET closing_stock = closing_stock - $1 WHERE id=$2`, [it.quantity_issued, it.inventory_id]);
        
        await client.query(
          `INSERT INTO stock_transactions
           (project_id, inventory_id, transaction_type, quantity, reference_id, reference_number, issued_to, remarks, transacted_by)
           VALUES ($1,$2,'issue',$3,$4,$5,$6,$7,$8)`,
          [min.project_id, it.inventory_id, it.quantity_issued, min.id, min.min_number, min.issued_to, min.remarks, req.user.id]
        );
      }

      // 3. Update status
      await client.query(`UPDATE material_issue_notes SET status='issued', updated_at=NOW() WHERE id=$1`, [min.id]);

      // 4. If linked to MRS, move MRS to issued
      if (min.mrs_id) {
         await client.query(`UPDATE material_requisitions SET status='issued' WHERE id=$1`, [min.mrs_id]);
      }

      // 5. Sum total issue value for journal posting
      const totalValue = items.reduce((sum, it) => sum + (parseFloat(it.amount) || 0), 0);

      return { success: true, min, totalValue };
    });

    // Journal: Dr Material Cost (5000) / Cr Inventory (1200)
    if (result.totalValue > 0) {
      const minRow = result.min;
      postAutoJournalStandalone({
        companyId: req.user.company_id, userId: req.user.id,
        entryDate: minRow.issue_date ? new Date(minRow.issue_date).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
        projectId: minRow.project_id || null,
        reference: minRow.min_number,
        narration: `Material issued — ${minRow.min_number}`,
        source: 'auto_min',
        lines: [
          { code: '5000', debit: result.totalValue, description: `Material cost — ${minRow.min_number}` },
          { code: '1200', credit: result.totalValue, description: `Inventory issued` },
        ],
      }).catch(() => {});
      notifyAccountsDept(req.user.company_id,
        `Material Issued ₹${Math.round(result.totalValue).toLocaleString('en-IN')} (${minRow.min_number})`,
        `Material Issue Note ${minRow.min_number} authorized. Total issue value: ₹${Math.round(result.totalValue).toLocaleString('en-IN')}. Inventory debited to project cost.`,
        '/accounts/journal-entries').catch(() => {});
    }

    res.json({ success: result.success });
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message });
  }
});

// PATCH /stores/min/:id/receive — Digital Sign-off from Receiver
router.patch('/:id/receive', async (req, res) => {
  try {
    const { signature } = req.body;
    const min = await query(
      `SELECT mi.project_id, p.company_id
       FROM material_issue_notes mi
       JOIN projects p ON p.id = mi.project_id
       WHERE mi.id = $1 AND mi.status = 'issued'`,
      [req.params.id]
    );
    if (!min.rows.length || min.rows[0].company_id !== req.user.company_id) {
      return res.status(404).json({ error: 'MIN not found or not issued' });
    }
    if (!userCanAccessProject(req, min.rows[0].project_id)) {
      return res.status(403).json({ error: 'You do not have access to this project.' });
    }
    await query(
      `UPDATE material_issue_notes 
       SET verified_receiver_by = $1, verified_receiver_at = NOW(), verified_receiver_sig = $2
       WHERE id = $3 AND status = 'issued'`,
      [req.user.id, signature, req.params.id]
    );
    res.json({ message: 'Receipt confirmed successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /stores/min/:id — super-admin only ────────────────────────────────
// If the slip was authorized (stock already issued), the issued quantities are
// added back to inventory and the 'issue' ledger entries are removed before the
// slip itself is deleted. A draft slip never touched stock, so it is just removed.
router.delete('/:id', authorize('super_admin'), async (req, res) => {
  try {
    const out = await withTransaction(async (client) => {
      const minR = await client.query(
        `SELECT mi.*, p.company_id
         FROM material_issue_notes mi
         JOIN projects p ON p.id = mi.project_id
         WHERE mi.id = $1 FOR UPDATE`,
        [req.params.id]
      );
      if (!minR.rows.length || minR.rows[0].company_id !== req.user.company_id) {
        throw Object.assign(new Error('Issue slip not found'), { status: 404 });
      }
      const min = minR.rows[0];
      const wasIssued = ['issued', 'received'].includes(min.status);

      if (wasIssued) {
        const items = await client.query(`SELECT * FROM min_items WHERE min_id = $1`, [min.id]);
        for (const it of items.rows) {
          if (!it.inventory_id || !(parseFloat(it.quantity_issued) > 0)) continue;
          // Returning issued stock can never make a balance negative.
          await client.query(
            `UPDATE inventory SET closing_stock = closing_stock + $1 WHERE id = $2`,
            [it.quantity_issued, it.inventory_id]
          );
        }
        await client.query(
          `DELETE FROM stock_transactions WHERE reference_id = $1 AND transaction_type = 'issue'`,
          [min.id]
        );
      }

      // min_items cascades on delete of the parent.
      await client.query(`DELETE FROM material_issue_notes WHERE id = $1`, [min.id]);
      return { stock_reversed: wasIssued };
    });
    res.json({ message: 'Issue slip deleted', ...out });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
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

module.exports = router;
