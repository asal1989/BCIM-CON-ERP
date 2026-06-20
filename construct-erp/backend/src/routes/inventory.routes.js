// src/routes/inventory.routes.js
const express = require('express');
const multer  = require('multer');
const XLSX    = require('xlsx');
const { authenticate } = require('../middleware/auth');
const { loadProjectScope, userCanAccessProject, appendProjectScope } = require('../middleware/projectScope');
const { query, withTransaction } = require('../config/database');
const { runSchemaInit } = require('../utils/schemaInit');
const router = express.Router();

runSchemaInit('inventory_maximum_level', async () => {
  await query(`ALTER TABLE inventory ADD COLUMN IF NOT EXISTS maximum_level NUMERIC(15,3)`);
});
router.use(authenticate);
router.use(loadProjectScope);

// multer: memory storage for xlsx import
const xlsUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = /\.(xlsx|xls|csv)$/i.test(file.originalname);
    cb(ok ? null : new Error('Only xlsx/xls/csv files supported'), ok);
  },
});

// Column name normaliser — handles typos & mixed case from the Excel
function normaliseHeader(h) {
  return String(h || '').toLowerCase().replace(/[\s_\-\.]+/g, '').replace(/[^a-z0-9]/g, '');
}
const COL_MAP = {
  // material
  materialdescription: 'material_name', materialdescription: 'material_name',
  materialdescrpition: 'material_name', materialdescrption: 'material_name',
  materialdesc: 'material_name', material: 'material_name', description: 'material_name',
  // others
  category: 'category', categories: 'category', head: 'category',
  majorhead: 'major_head', majorheads: 'major_head',
  dcidc: 'dc_idc',
  remarks: 'remarks',
  unit: 'unit',
  openingstock: 'opening_stock', closingstock: 'closing_stock',
  rate: 'unit_rate', slno: null, totalissued: null,
  openingstockvaluetotal: null, closingstockvaluetotal: null, gst: null, grandtotal: null,
};

function mapRow(rawRow) {
  const out = {};
  for (const [rawKey, val] of Object.entries(rawRow)) {
    const norm = normaliseHeader(rawKey);
    const mapped = COL_MAP[norm];
    if (mapped) out[mapped] = val;
  }
  return out;
}

function cellText(value) {
  return String(value ?? '').trim();
}

function toNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const cleaned = String(value ?? '').replace(/,/g, '').trim();
  const parsed = parseFloat(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

function buildHeaderMap(row) {
  const map = {};
  row.forEach((value, index) => {
    const normalised = normaliseHeader(value);
    if (normalised) map[normalised] = index;
  });
  return map;
}

function getByHeader(row, headerMap, candidates) {
  for (const candidate of candidates) {
    const index = headerMap[candidate];
    if (index !== undefined) return row[index];
  }
  return undefined;
}

function findStockSheet(wb) {
  let best = null;

  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
    for (let rowIndex = 0; rowIndex < Math.min(rows.length, 15); rowIndex++) {
      const headerMap = buildHeaderMap(rows[rowIndex]);
      const hasMaterial = headerMap.materialdescrpition !== undefined ||
        headerMap.materialdescription !== undefined ||
        headerMap.materialdesc !== undefined ||
        headerMap.material !== undefined;
      const hasOpening = headerMap.openingstock !== undefined;
      const hasClosing = headerMap.closingstock !== undefined;
      const hasRate = headerMap.rate !== undefined;

      if (!hasMaterial || !hasClosing) continue;

      const score = (hasRate ? 10 : 0) +
        (hasOpening ? 5 : 0) +
        (/stock/i.test(sheetName) ? 3 : 0);

      if (!best || score > best.score) {
        best = { sheetName, rows, headerRowIndex: rowIndex, headerMap, score };
      }
    }
  }

  return best;
}

function parseInventoryWorkbook(wb) {
  const detected = findStockSheet(wb);

  if (detected) {
    const items = [];
    let category = null;

    for (const row of detected.rows.slice(detected.headerRowIndex + 1)) {
      const material = cellText(getByHeader(row, detected.headerMap, [
        'materialdescrpition',
        'materialdescription',
        'materialdesc',
        'material',
      ]));
      const unit = cellText(getByHeader(row, detected.headerMap, ['unit'])) || 'NOS';
      const slNoRaw = getByHeader(row, detected.headerMap, ['slno']);
      const slNo = toNumber(slNoRaw);

      if (!material) continue;

      const openingStock = toNumber(getByHeader(row, detected.headerMap, ['openingstock']));
      const closingStock = toNumber(getByHeader(row, detected.headerMap, ['closingstock', 'stockatsite']));
      const unitRate = toNumber(getByHeader(row, detected.headerMap, ['rate', 'unitrate']));
      const majorHead = cellText(getByHeader(row, detected.headerMap, ['majorhead', 'majorheads'])) || null;
      const dcIdc = cellText(getByHeader(row, detected.headerMap, ['dcidc'])) || null;
      const remarks = cellText(getByHeader(row, detected.headerMap, ['remarks'])) || null;

      // If the sheet has its own Category/Head column, use that value directly
      // (per-row), otherwise fall back to the section-header heuristic below.
      const rowCategory = cellText(getByHeader(row, detected.headerMap, ['category', 'categories', 'head']));

      const hasQtyOrRate = openingStock || closingStock || unitRate;
      const looksLikeCategory = !rowCategory && !slNo && !cellText(unit) && !hasQtyOrRate;
      if (looksLikeCategory) {
        category = material.replace(/\s+/g, ' ').trim();
        continue;
      }

      items.push({
        material_name: material.replace(/\s+/g, ' ').trim(),
        category: rowCategory || category,
        major_head: majorHead,
        dc_idc: dcIdc,
        remarks,
        unit,
        opening_stock: openingStock,
        closing_stock: closingStock,
        unit_rate: unitRate,
      });
    }

    return items;
  }

  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
  return rows
    .map(mapRow)
    .filter(r => r.material_name && cellText(r.material_name))
    .map(r => ({
      material_name: cellText(r.material_name),
      category: cellText(r.category) || null,
      major_head: cellText(r.major_head) || null,
      dc_idc: cellText(r.dc_idc) || null,
      remarks: cellText(r.remarks) || null,
      unit: cellText(r.unit) || 'NOS',
      opening_stock: toNumber(r.opening_stock),
      closing_stock: toNumber(r.closing_stock),
      unit_rate: toNumber(r.unit_rate),
    }));
}

// GET /inventory — list with optional project filter
router.get('/', async (req, res) => {
  try {
    const { project_id } = req.query;
    let sql = `
      SELECT i.*, p.name AS project_name
      FROM inventory i
      JOIN projects p ON i.project_id = p.id
      WHERE p.company_id = $1`;
    let params = [req.user.company_id];
    if (project_id) { sql += ` AND i.project_id = $2`; params.push(project_id); }
    ({ sql, params } = appendProjectScope(req, sql, params, 'i'));
    sql += ` ORDER BY p.name, i.material_name`;
    const result = await query(sql, params);
    res.json({ data: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /inventory/valuation?project_id= — stock value (qty × rate) per project / category
router.get('/valuation', async (req, res) => {
  try {
    const { project_id } = req.query;
    let sql = `
      SELECT
        i.project_id,
        p.name                                                             AS project_name,
        COALESCE(NULLIF(TRIM(i.category), ''), 'Uncategorized')           AS category,
        COUNT(*)::int                                                      AS item_count,
        SUM(i.closing_stock)::numeric                                     AS total_qty,
        SUM(i.closing_stock * COALESCE(i.unit_rate, 0))::numeric          AS stock_value,
        MAX(i.last_updated)                                               AS last_updated
      FROM inventory i
      JOIN projects p ON i.project_id = p.id
      WHERE p.company_id = $1`;
    let params = [req.user.company_id];
    if (project_id) { sql += ` AND i.project_id = $2`; params.push(project_id); }
    ({ sql, params } = appendProjectScope(req, sql, params, 'i'));
    sql += ` GROUP BY i.project_id, p.name, i.category ORDER BY stock_value DESC NULLS LAST`;
    const result = await query(sql, params);
    res.json({ data: result.rows });
  } catch (err) {
    console.error('Valuation error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /inventory/categories — distinct non-empty categories from store ledger
router.get('/categories', async (req, res) => {
  try {
    let sql = `
      SELECT DISTINCT TRIM(i.category) AS category
      FROM inventory i
      JOIN projects p ON i.project_id = p.id
      WHERE p.company_id = $1
        AND i.category IS NOT NULL
        AND TRIM(i.category) <> ''`;
    let params = [req.user.company_id];
    ({ sql, params } = appendProjectScope(req, sql, params, 'i'));
    sql += ` ORDER BY category ASC`;
    const result = await query(sql, params);
    res.json({ data: result.rows.map(r => r.category) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /inventory/items-lookup — material names with category, unit & stock for autocomplete.
// Pass ?project_id= to get stock totals scoped to one project (sums across site_location rows);
// without it, stock figures are whatever single row matches first — fine for name/unit autocomplete only.
router.get('/items-lookup', async (req, res) => {
  try {
    const { project_id } = req.query;
    let sql = `
      SELECT
        TRIM(i.material_name) AS material_name,
        TRIM(COALESCE(MAX(i.category), '')) AS category,
        TRIM(COALESCE(MAX(i.unit), ''))     AS unit,
        SUM(i.closing_stock)  AS closing_stock,
        MAX(i.reorder_level)  AS reorder_level,
        MAX(i.minimum_level)  AS min_stock
      FROM inventory i
      JOIN projects p ON i.project_id = p.id
      WHERE p.company_id = $1
        AND i.material_name IS NOT NULL
        AND TRIM(i.material_name) <> ''`;
    let params = [req.user.company_id];
    ({ sql, params } = appendProjectScope(req, sql, params, 'i'));
    if (project_id) {
      params.push(project_id);
      sql += ` AND i.project_id = $${params.length}`;
    }
    sql += ` GROUP BY i.material_name ORDER BY i.material_name ASC`;
    const result = await query(sql, params);
    res.json({ data: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /inventory/monthly-report?month=YYYY-MM&project_id=
router.get('/monthly-report', async (req, res) => {
  try {
    const { month, project_id } = req.query;
    // Default to current month
    const target = month || new Date().toISOString().slice(0, 7);
    const monthStart = `${target}-01`;
    const monthEnd   = new Date(new Date(monthStart).getFullYear(),
                                new Date(monthStart).getMonth() + 1, 1)
                        .toISOString().slice(0, 10);

    let sql = `
      SELECT
        i.id, i.material_name, i.unit, i.site_location,
        i.opening_stock, i.closing_stock,
        COALESCE(i.unit_rate, 0)  AS rate,
        i.category, i.reorder_level, i.minimum_level,
        p.name AS project_name,
        COALESCE(rx.received_qty, 0)   AS received_qty,
        COALESCE(ix.issued_qty, 0)     AS issued_qty,
        COALESCE(ix.last_issued_at, NULL) AS last_issued_at
      FROM inventory i
      JOIN projects p ON i.project_id = p.id
      LEFT JOIN (
        SELECT inventory_id,
               SUM(quantity) AS received_qty
        FROM stock_transactions
        WHERE transaction_type IN ('grn','bill_receipt','transfer_in')
          AND transacted_at >= $2 AND transacted_at < $3
        GROUP BY inventory_id
      ) rx ON rx.inventory_id = i.id
      LEFT JOIN (
        SELECT inventory_id,
               SUM(quantity)   AS issued_qty,
               MAX(transacted_at) AS last_issued_at
        FROM stock_transactions
        WHERE transaction_type IN ('issue','transfer_out')
          AND transacted_at >= $2 AND transacted_at < $3
        GROUP BY inventory_id
      ) ix ON ix.inventory_id = i.id
      WHERE p.company_id = $1`;

    let params = [req.user.company_id, monthStart, monthEnd];
    if (project_id) { sql += ` AND i.project_id = $4`; params.push(project_id); }
    ({ sql, params } = appendProjectScope(req, sql, params, 'i'));
    sql += ` ORDER BY p.name, i.material_name`;

    const result = await query(sql, params);

    const rows = result.rows.map(r => {
      const received  = parseFloat(r.received_qty)  || 0;
      const issued    = parseFloat(r.issued_qty)    || 0;
      const closing   = parseFloat(r.closing_stock) || 0;
      const rate      = parseFloat(r.rate)          || 0;
      // back-calculate opening from current closing + this month's movements
      const opening   = closing - received + issued;
      return {
        ...r,
        opening_stock:  Math.max(0, opening),
        received_qty:   received,
        issued_qty:     issued,
        total_qty:      Math.max(0, opening) + received,
        closing_stock:  closing,
        stock_at_site:  closing,
        stock_value:    closing * rate,
      };
    });

    res.json({ data: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /inventory/low-stock
router.get('/low-stock', async (req, res) => {
  try {
    const { project_id } = req.query;
    let sql = `
      SELECT i.*, p.name AS project_name
      FROM inventory i
      JOIN projects p ON i.project_id = p.id
      WHERE p.company_id = $1
        AND i.reorder_level > 0
        AND i.closing_stock <= i.reorder_level`;
    let params = [req.user.company_id];
    if (project_id) { sql += ` AND i.project_id = $2`; params.push(project_id); }
    ({ sql, params } = appendProjectScope(req, sql, params, 'i'));
    sql += ` ORDER BY (i.closing_stock / NULLIF(i.reorder_level, 0)) ASC`;
    const result = await query(sql, params);
    res.json({ data: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /inventory/ledger — stock transactions for an inventory item
router.get('/ledger', async (req, res) => {
  try {
    const { inventory_id } = req.query;
    if (!inventory_id) return res.status(400).json({ error: 'inventory_id required' });
    // Verify company isolation
    const inv = await query(
      `SELECT i.*, p.company_id FROM inventory i JOIN projects p ON i.project_id = p.id WHERE i.id = $1`,
      [inventory_id]
    );
    if (!inv.rows.length || inv.rows[0].company_id !== req.user.company_id) {
      return res.status(404).json({ error: 'Inventory item not found' });
    }
    if (!userCanAccessProject(req, inv.rows[0].project_id)) {
      return res.status(403).json({ error: 'You do not have access to this project.' });
    }
    const txns = await query(
      `SELECT st.*, u.name AS transacted_by_name
       FROM stock_transactions st
       LEFT JOIN users u ON st.transacted_by = u.id
       WHERE st.inventory_id = $1
       ORDER BY st.transacted_at ASC`,
      [inventory_id]
    );
    res.json({ inventory: inv.rows[0], transactions: txns.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /inventory/:id/batches — list active batches for an item
router.get('/:id/batches', async (req, res) => {
  try {
     const inv = await query(
       `SELECT i.project_id, p.company_id
        FROM inventory i
        JOIN projects p ON p.id = i.project_id
        WHERE i.id = $1`,
       [req.params.id]
     );
     if (!inv.rows.length || inv.rows[0].company_id !== req.user.company_id) {
       return res.status(404).json({ error: 'Inventory item not found' });
     }
     if (!userCanAccessProject(req, inv.rows[0].project_id)) {
       return res.status(403).json({ error: 'You do not have access to this project.' });
     }
     const batches = await query(
       `SELECT * FROM inventory_batches 
        WHERE inventory_id = $1 AND current_quantity > 0 AND status = 'active'
        ORDER BY received_date ASC, created_at ASC`,
       [req.params.id]
     );
     res.json({ data: batches.rows });
  } catch (err) {
     res.status(500).json({ error: err.message });
  }
});

// POST /inventory/issue — issue material from stock
router.post('/issue', async (req, res) => {
  try {
    const {
      inventory_id, project_id, quantity, issued_to,
      mrs_id, reference_number, remarks
    } = req.body;

    if (!inventory_id || !quantity || parseFloat(quantity) <= 0) {
      return res.status(400).json({ error: 'inventory_id and positive quantity are required' });
    }

    const result = await withTransaction(async (client) => {
      // Lock row and check stock
      const inv = await client.query(
        `SELECT i.*, p.company_id
         FROM inventory i JOIN projects p ON i.project_id = p.id
         WHERE i.id = $1 FOR UPDATE`,
        [inventory_id]
      );
      if (!inv.rows.length || inv.rows[0].company_id !== req.user.company_id) {
        throw Object.assign(new Error('Inventory item not found'), { status: 404 });
      }
      const item = inv.rows[0];
      if (!userCanAccessProject(req, item.project_id)) {
        throw Object.assign(new Error('You do not have access to this project.'), { status: 403 });
      }
      const issueQty = parseFloat(quantity);
      if (parseFloat(item.closing_stock) < issueQty) {
        throw Object.assign(
          new Error(`Insufficient stock. Available: ${item.closing_stock} ${item.unit}`),
          { status: 400 }
        );
      }

      // 2. Deduct stock from Inventory (Aggregate)
      await client.query(
        `UPDATE inventory SET closing_stock = closing_stock - $1, last_updated = NOW() WHERE id = $2`,
        [issueQty, inventory_id]
      );

      // 3. FIFO Batch Consumption Logic
      let remainingToIssue = issueQty;
      const batches = await client.query(
        `SELECT * FROM inventory_batches 
         WHERE inventory_id = $1 AND current_quantity > 0 AND status = 'active'
         ORDER BY received_date ASC, created_at ASC
         FOR UPDATE`,
        [inventory_id]
      );

      for (const b of batches.rows) {
        if (remainingToIssue <= 0) break;
        const availableInBatch = parseFloat(b.current_quantity);
        const takeFromBatch = Math.min(availableInBatch, remainingToIssue);
        
        // Update batch quantity
        await client.query(
          `UPDATE inventory_batches 
           SET current_quantity = current_quantity - $1, 
               status = CASE WHEN (current_quantity - $1) <= 0 THEN 'consumed' ELSE 'active' END,
               updated_at = NOW()
           WHERE id = $2`,
          [takeFromBatch, b.id]
        );

        // Log batch-specific movement
        await client.query(
          `INSERT INTO batch_transactions (batch_id, transaction_type, quantity)
           VALUES ($1, 'issue', $2)`,
          [b.id, takeFromBatch]
        );

        remainingToIssue -= takeFromBatch;
      }

      if (remainingToIssue > 0.001) {
          throw new Error('FIFO Error: Aggregate stock and batch sums are out of sync.');
      }

      // 4. Log Master Transaction
      const txn = await client.query(
        `INSERT INTO stock_transactions
           (project_id, inventory_id, transaction_type, quantity, reference_id, reference_number, issued_to, remarks, transacted_by)
         VALUES ($1,$2,'issue',$3,$4,$5,$6,$7,$8) RETURNING *`,
        [item.project_id, inventory_id, issueQty, mrs_id || null, reference_number || null, issued_to || null, remarks || null, req.user.id]
      );

      // 5. Update MRS status if referenced
      if (mrs_id) {
        await client.query(
          `UPDATE material_requisitions SET status = 'issued', updated_at = NOW() WHERE id = $1`,
          [mrs_id]
        );
      }

      return txn.rows[0];
    });

    res.status(201).json({ message: 'Material issued and stock updated', data: result });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// POST /inventory/transfer — transfer stock between sites/projects
router.post('/transfer', async (req, res) => {
  try {
    const { from_inventory_id, to_project_id, to_site_location, quantity, remarks } = req.body;
    if (!from_inventory_id || !quantity || parseFloat(quantity) <= 0) {
      return res.status(400).json({ error: 'from_inventory_id and positive quantity are required' });
    }

    const result = await withTransaction(async (client) => {
      const src = await client.query(
        `SELECT i.*, p.company_id FROM inventory i JOIN projects p ON i.project_id = p.id WHERE i.id = $1 FOR UPDATE`,
        [from_inventory_id]
      );
      if (!src.rows.length || src.rows[0].company_id !== req.user.company_id) {
        throw Object.assign(new Error('Source inventory item not found'), { status: 404 });
      }
      const item = src.rows[0];
      if (!userCanAccessProject(req, item.project_id)) {
        throw Object.assign(new Error('You do not have access to the source project.'), { status: 403 });
      }
      if (to_project_id && !userCanAccessProject(req, to_project_id)) {
        throw Object.assign(new Error('You do not have access to the destination project.'), { status: 403 });
      }
      const transferQty = parseFloat(quantity);
      if (parseFloat(item.closing_stock) < transferQty) {
        throw Object.assign(new Error(`Insufficient stock: ${item.closing_stock} ${item.unit} available`), { status: 400 });
      }

      const refNum = `TRF-${new Date().getFullYear()}-${String(Date.now()).slice(-5)}`;

      // Deduct from source
      await client.query(
        `UPDATE inventory SET closing_stock = closing_stock - $1, last_updated = NOW() WHERE id = $2`,
        [transferQty, from_inventory_id]
      );
      await client.query(
        `INSERT INTO stock_transactions (project_id,inventory_id,transaction_type,quantity,reference_number,remarks,transacted_by)
         VALUES ($1,$2,'transfer_out',$3,$4,$5,$6)`,
        [item.project_id, from_inventory_id, transferQty, refNum, remarks, req.user.id]
      );

      // Upsert destination
      const dest = await client.query(
        `INSERT INTO inventory (project_id,material_name,unit,site_location,opening_stock,closing_stock)
         VALUES ($1,$2,$3,$4,0,$5)
         ON CONFLICT (project_id,material_name,site_location)
         DO UPDATE SET closing_stock = inventory.closing_stock + $5, last_updated = NOW()
         RETURNING id`,
        [to_project_id || item.project_id, item.material_name, item.unit, to_site_location || item.site_location, transferQty]
      );
      await client.query(
        `INSERT INTO stock_transactions (project_id,inventory_id,transaction_type,quantity,reference_number,remarks,transacted_by)
         VALUES ($1,$2,'transfer_in',$3,$4,$5,$6)`,
        [to_project_id || item.project_id, dest.rows[0].id, transferQty, refNum, remarks, req.user.id]
      );

      return { ref: refNum, qty: transferQty, unit: item.unit };
    });

    res.status(201).json({ message: 'Stock transferred successfully', data: result });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// POST /inventory — create a new inventory item (used from MRS "New Item" flow)
router.post('/', async (req, res) => {
  try {
    const { project_id, material_name, category, major_head, dc_idc, remarks, unit, opening_stock = 0 } = req.body;
    if (!project_id || !material_name) {
      return res.status(400).json({ error: 'project_id and material_name are required' });
    }
    // Verify project belongs to this company
    const proj = await query('SELECT id FROM projects WHERE id=$1 AND company_id=$2', [project_id, req.user.company_id]);
    if (!proj.rows.length) return res.status(404).json({ error: 'Project not found' });
    if (!userCanAccessProject(req, project_id)) {
      return res.status(403).json({ error: 'You do not have access to this project.' });
    }
    // Check duplicate
    const existing = await query(
      `SELECT id FROM inventory WHERE project_id=$1 AND LOWER(TRIM(material_name))=LOWER(TRIM($2))`,
      [project_id, material_name]
    );
    if (existing.rows.length) {
      return res.status(409).json({ error: 'Material already exists in store ledger for this project' });
    }
    const result = await query(
      `INSERT INTO inventory (project_id, material_name, category, major_head, dc_idc, remarks, unit, opening_stock, closing_stock, last_updated)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8, NOW())
       RETURNING id, material_name, category, major_head, dc_idc, remarks, unit, opening_stock, closing_stock`,
      [project_id, material_name.trim(), (category || '').trim() || null, (major_head || '').trim() || null, (dc_idc || '').trim() || null, (remarks || '').trim() || null, (unit || '').trim() || null, parseFloat(opening_stock) || 0]
    );
    res.status(201).json({ data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /inventory/:id — update minimum/reorder levels
router.patch('/:id', async (req, res) => {
  try {
    const { minimum_level, reorder_level, maximum_level, unit_rate, category, major_head, dc_idc, remarks, unit } = req.body;
    const check = await query(
      `SELECT i.id, i.project_id FROM inventory i JOIN projects p ON i.project_id = p.id WHERE i.id = $1 AND p.company_id = $2`,
      [req.params.id, req.user.company_id]
    );
    if (!check.rows.length) return res.status(404).json({ error: 'Not found' });
    if (!userCanAccessProject(req, check.rows[0].project_id)) {
      return res.status(403).json({ error: 'You do not have access to this project.' });
    }

    await query(
      `UPDATE inventory SET
         minimum_level = COALESCE($1, minimum_level),
         reorder_level = COALESCE($2, reorder_level),
         maximum_level = COALESCE($3, maximum_level),
         unit_rate     = COALESCE($4, unit_rate),
         category      = COALESCE($5, category),
         major_head    = COALESCE($6, major_head),
         dc_idc        = COALESCE($7, dc_idc),
         remarks       = COALESCE($8, remarks),
         unit          = COALESCE($9, unit),
         last_updated  = NOW()
       WHERE id = $10`,
      [minimum_level, reorder_level, maximum_level, unit_rate, category, major_head, dc_idc, remarks, unit, req.params.id]
    );
    res.json({ message: 'Inventory updated' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /inventory/import/preview — parse file, return rows without saving
router.post('/import/preview', xlsUpload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const wb   = XLSX.read(req.file.buffer, { type: 'buffer' });
    const preview = parseInventoryWorkbook(wb);
    res.json({ data: preview, total: preview.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /inventory/import — parse + upsert into inventory
router.post('/import', xlsUpload.single('file'), async (req, res) => {
  try {
    if (!req.file)        return res.status(400).json({ error: 'No file uploaded' });
    const { project_id, site_location = 'main', overwrite = 'false' } = req.body;
    if (!project_id)      return res.status(400).json({ error: 'project_id is required' });

    // Verify project belongs to company
    const projCheck = await query(
      `SELECT id FROM projects WHERE id = $1 AND company_id = $2`,
      [project_id, req.user.company_id]
    );
    if (!projCheck.rows.length) return res.status(403).json({ error: 'Project not found or access denied' });
    if (!userCanAccessProject(req, project_id)) {
      return res.status(403).json({ error: 'You do not have access to this project.' });
    }

    const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
    const items = parseInventoryWorkbook(wb);

    let inserted = 0, updated = 0, skipped = 0;
    const errors = [];
    const skippedItems = [];

    for (const r of items) {
      try {
        const material_name = cellText(r.material_name);
        const unit          = cellText(r.unit) || 'NOS';
        const opening       = toNumber(r.opening_stock);
        const closing       = toNumber(r.closing_stock);
        const rate          = toNumber(r.unit_rate);
        const category      = cellText(r.category) || null;
        const majorHead     = cellText(r.major_head) || null;
        const dcIdc         = cellText(r.dc_idc) || null;
        const remarks       = cellText(r.remarks) || null;

        if (!material_name) { skipped++; continue; }

        // Check if already exists — match by project + material name (case-insensitive),
        // regardless of site_location to prevent duplicates across sites
        const existing = await query(
          `SELECT id FROM inventory WHERE project_id = $1 AND LOWER(TRIM(material_name)) = LOWER(TRIM($2))
           ORDER BY CASE WHEN site_location = $3 THEN 0 ELSE 1 END, last_updated DESC NULLS LAST LIMIT 1`,
          [project_id, material_name, site_location]
        );

        if (existing.rows.length > 0) {
          if (overwrite === 'true') {
            await query(
              `UPDATE inventory SET
                 opening_stock = $1, closing_stock = $2,
                 unit_rate = CASE WHEN $3::numeric > 0 THEN $3::numeric ELSE unit_rate END,
                 category   = CASE WHEN $4::text IS NOT NULL THEN $4::text ELSE category END,
                 major_head = CASE WHEN $7::text IS NOT NULL THEN $7::text ELSE major_head END,
                 dc_idc     = CASE WHEN $8::text IS NOT NULL THEN $8::text ELSE dc_idc END,
                 remarks    = CASE WHEN $9::text IS NOT NULL THEN $9::text ELSE remarks END,
                 unit = $5, last_updated = NOW()
               WHERE id = $6`,
              [opening, closing, rate, category, unit, existing.rows[0].id, majorHead, dcIdc, remarks]
            );
            updated++;
          } else {
            skipped++;
            skippedItems.push(material_name);
          }
        } else {
          await query(
            `INSERT INTO inventory
               (project_id, material_name, unit, site_location, opening_stock, closing_stock, unit_rate, category, major_head, dc_idc, remarks)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8::text,$9::text,$10::text,$11::text)`,
            [project_id, material_name, unit, site_location, opening, closing, rate, category, majorHead, dcIdc, remarks]
          );
          inserted++;
        }
      } catch (e) {
        errors.push({ material: r.material_name, error: e.message });
      }
    }

    res.json({ message: 'Import complete', inserted, updated, skipped, skippedItems, errors, total: items.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /inventory/repair-double-stock?project_id=
// Recalculates closing_stock for each inventory item from scratch using
// stock_transactions — corrects phantom stock caused by historical double-posting
// (GRN bill_receipt + QC grn both incrementing the same row).
router.post('/repair-double-stock', async (req, res) => {
  try {
    if (!['super_admin', 'admin'].includes(req.user?.role)) {
      return res.status(403).json({ error: 'Admin only' });
    }
    const { project_id } = req.query;

    const params = [req.user.company_id];
    let filter = '';
    if (project_id && project_id !== 'undefined' && project_id !== 'null') {
      params.push(project_id);
      filter = `AND i.project_id = $${params.length}`;
    }

    const result = await query(`
      WITH corrected AS (
        SELECT
          i.id,
          i.opening_stock,
          COALESCE(SUM(CASE WHEN st.transaction_type IN ('grn','bill_receipt','transfer_in','ign') THEN st.quantity ELSE 0 END), 0) AS total_in,
          COALESCE(SUM(CASE WHEN st.transaction_type IN ('issue','transfer_out') THEN st.quantity ELSE 0 END), 0) AS total_out
        FROM inventory i
        JOIN projects p ON p.id = i.project_id
        LEFT JOIN stock_transactions st ON st.inventory_id = i.id
        WHERE p.company_id = $1 ${filter}
        GROUP BY i.id, i.opening_stock
      )
      UPDATE inventory
      SET closing_stock = GREATEST(0, c.opening_stock + c.total_in - c.total_out),
          last_updated  = NOW()
      FROM corrected c
      WHERE inventory.id = c.id
      RETURNING inventory.id, inventory.material_name, inventory.closing_stock
    `, params);

    res.json({
      message: `Recalculated closing_stock for ${result.rows.length} inventory item(s).`,
      updated: result.rows.length,
    });
  } catch (err) {
    console.error('[inventory] repair-double-stock error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
