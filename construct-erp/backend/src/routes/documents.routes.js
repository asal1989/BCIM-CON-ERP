// src/routes/documents.routes.js
const express = require('express');
const router  = express.Router();
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');
const { v4: uuid } = require('uuid');
const { authenticate } = require('../middleware/auth');
const { loadProjectScope, userCanAccessProject } = require('../middleware/projectScope');
const { query, withTransaction } = require('../config/database');
const { uploadToOneDrive, isConfigured, downloadFromOneDrive } = require('../services/onedrive.service');
const { runSchemaInit } = require('../utils/schemaInit');

router.use(authenticate);
router.use(loadProjectScope);

// ── Multer ─────────────────────────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '../../uploads/documents');
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => cb(null, `${uuid()}${path.extname(file.originalname)}`),
});
const fileFilter = (req, file, cb) => {
  const allowed = ['.jpg','.jpeg','.png','.pdf','.xls','.xlsx','.docx','.dwg','.dxf','.zip'];
  path.extname(file.originalname).toLowerCase();
  if (allowed.includes(path.extname(file.originalname).toLowerCase())) cb(null, true);
  else cb(new Error('File type not allowed'), false);
};
const upload = multer({ storage, fileFilter, limits: { fileSize: 25 * 1024 * 1024 } });

// ── Ensure table exists ────────────────────────────────────────────────────
async function ensureTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS documents (
      id               uuid DEFAULT gen_random_uuid() PRIMARY KEY,
      company_id       uuid NOT NULL,
      project_id       uuid,
      module           varchar(60) NOT NULL DEFAULT 'general',
      module_record_id uuid,
      file_name        varchar(255) NOT NULL,
      file_type        varchar(10),
      file_size        integer,
      local_url        text,
      onedrive_id      text,
      onedrive_url     text,
      onedrive_web_url text,
      tags             text[] DEFAULT '{}',
      uploaded_by      uuid,
      created_at       timestamptz DEFAULT now()
    )
  `);
  await query(`ALTER TABLE documents ADD COLUMN IF NOT EXISTS doc_type varchar(80) DEFAULT 'general'`);
  await query(`ALTER TABLE documents DROP CONSTRAINT IF EXISTS documents_doc_type_check`);
  await query(`
    ALTER TABLE documents ADD CONSTRAINT documents_doc_type_check
    CHECK (doc_type IN (
      'general','project','ra_bill','purchase_order','work_order','grn','mrs',
      'invoice','vendor_bill','bulk_scanned_bill','challan','receipt','payment',
      'hse','quality','drawing','hr','boq','contract','rfi','site_report',
      'safety_report','inspection_report','method_statement','specification',
      'tender_doc','quality_plan','correspondence','certificate','permit'
    ))
  `);
}
runSchemaInit('documents', ensureTable);

function documentPath(localUrl) {
  return path.join(__dirname, '../../', String(localUrl || '').replace(/^[/\\]+/, ''));
}

function applyDocumentScope(req, sqlParts, params, alias = 'd', requestedProjectId = null) {
  if (requestedProjectId && String(requestedProjectId).trim()) {
    if (!userCanAccessProject(req, requestedProjectId)) {
      const err = new Error('Access denied for this project.');
      err.statusCode = 403;
      throw err;
    }
    params.push(requestedProjectId);
    sqlParts.push(`${alias}.project_id = $${params.length}`);
    return;
  }
  if (req.isGlobalRole) return;
  const allowed = req.allowedProjectIds || [];
  if (!allowed.length) {
    sqlParts.push(`${alias}.project_id IS NULL`);
    return;
  }
  params.push(allowed);
  sqlParts.push(`(${alias}.project_id IS NULL OR ${alias}.project_id = ANY($${params.length}::uuid[]))`);
}

async function getAccessibleDocument(req, documentId) {
  const { rows } = await query(
    `SELECT id, project_id, company_id FROM documents WHERE id = $1 AND company_id = $2`,
    [documentId, req.user.company_id]
  );
  const doc = rows[0];
  if (!doc) {
    const err = new Error('Document not found');
    err.statusCode = 404;
    throw err;
  }
  if (!userCanAccessProject(req, doc.project_id)) {
    const err = new Error('Access denied for this project.');
    err.statusCode = 403;
    throw err;
  }
  return doc;
}

function normalizeParsedOrder(parsed, fallbackType) {
  const rawHeader = parsed.header || {};
  const type = parsed.type || fallbackType;
  const header = type === 'PO'
    ? {
        poNumber: rawHeader.poNumber || rawHeader.po_number || '',
        poDate: rawHeader.poDate || rawHeader.po_date || null,
        vendorName: rawHeader.vendorName || rawHeader.vendor_name || '',
        vendorGstin: rawHeader.vendorGstin || rawHeader.vendor_gstin || '',
        subTotal: rawHeader.subTotal ?? rawHeader.sub_total ?? null,
        totalGst: rawHeader.totalGst ?? rawHeader.total_gst ?? null,
        grandTotal: rawHeader.grandTotal ?? rawHeader.grand_total ?? 0,
        narration: rawHeader.narration || rawHeader.notes || '',
      }
    : {
        woNumber: rawHeader.woNumber || rawHeader.wo_number || '',
        woDate: rawHeader.woDate || rawHeader.wo_date || rawHeader.start_date || null,
        contractorName: rawHeader.contractorName || rawHeader.contractor_name || rawHeader.vendorName || rawHeader.vendor_name || '',
        contractorGstin: rawHeader.contractorGstin || rawHeader.contractor_gstin || '',
        contractorPan: rawHeader.contractorPan || rawHeader.contractor_pan || '',
        contractAmount: rawHeader.contractAmount ?? rawHeader.contract_amount ?? rawHeader.total_value ?? null,
        totalValue: rawHeader.totalValue ?? rawHeader.total_value ?? rawHeader.grand_total ?? 0,
        narration: rawHeader.narration || rawHeader.scope_of_work || rawHeader.subject || '',
      };

  return { type, header, items: parsed.items || [], warnings: parsed.warnings || [] };
}

async function parseDocumentOrder(doc, localPath, requestedType) {
  const ext = path.extname(doc.local_url || doc.file_name || '').toLowerCase();

  if (ext === '.xls' || ext === '.xlsx') {
    const { parseOrderFile } = require('../services/excelParser');
    const parsed = parseOrderFile(localPath, doc.file_name);
    if (parsed.error) throw new Error(parsed.error);
    return normalizeParsedOrder(parsed, requestedType);
  }

  if (ext === '.pdf') {
    const buffer = await fs.promises.readFile(localPath);
    if (requestedType === 'WO') {
      const { extractWO } = require('../services/woExtraction.service');
      return normalizeParsedOrder({ ...(await extractWO(buffer)), type: 'WO' }, 'WO');
    }
    const { extractPO } = require('../services/poExtraction.service');
    return normalizeParsedOrder({ ...(await extractPO(buffer)), type: 'PO' }, 'PO');
  }

  throw new Error('Only Excel (.xls/.xlsx) and PDF files can be auto-imported as PO/WO.');
}

async function upsertParsedOrder({ doc, parsed, projectId, user }) {
  const { type, header, items, warnings = [] } = parsed;

  return withTransaction(async (client) => {
    let vendorId = null;
    const vName = type === 'PO' ? header.vendorName : header.contractorName;
    const vGstin = type === 'PO' ? header.vendorGstin : header.contractorGstin;
    const vPan = type === 'WO' ? header.contractorPan : null;
    const vType = type === 'PO' ? 'supplier' : 'subcontractor';

    if (vName) {
      let vendor = null;
      if (vGstin && vGstin.length >= 10) {
        const gr = await client.query(
          `SELECT id FROM vendors WHERE company_id=$1 AND gstin ILIKE $2 LIMIT 1`,
          [user.company_id, vGstin]
        );
        vendor = gr.rows[0];
      }
      if (!vendor) {
        const nr = await client.query(
          `SELECT id FROM vendors WHERE company_id=$1 AND LOWER(TRIM(name)) = LOWER(TRIM($2)) LIMIT 1`,
          [user.company_id, vName]
        );
        vendor = nr.rows[0];
      }
      if (vendor) {
        vendorId = vendor.id;
      } else {
        const codeRes = await client.query(
          `SELECT vendor_code FROM vendors WHERE company_id=$1 AND vendor_code ~ '^VND-[0-9]+' ORDER BY CAST(SUBSTRING(vendor_code FROM 5) AS INTEGER) DESC LIMIT 1`,
          [user.company_id]
        );
        const last = codeRes.rows[0]?.vendor_code?.replace('VND-', '');
        const nextNum = last ? (parseInt(last, 10) || 0) + 1 : 1;
        const newCode = `VND-${String(nextNum).padStart(4, '0')}`;
        const vr = await client.query(
          `INSERT INTO vendors (company_id, vendor_code, name, gstin, pan, vendor_type, state, is_active)
           VALUES ($1,$2,$3,$4,$5,$6,'Karnataka',true) RETURNING id`,
          [
            user.company_id,
            newCode,
            String(vName).slice(0, 200),
            vGstin && vGstin.length >= 10 ? String(vGstin).slice(0, 15) : null,
            vPan ? String(vPan).slice(0, 10) : null,
            vType,
          ]
        );
        vendorId = vr.rows[0].id;
      }

      if (projectId && vendorId) {
        await client.query(
          `INSERT INTO project_vendors (project_id, vendor_id, added_by)
           VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
          [projectId, vendorId, user.id]
        );
      }
    }

    let recordId = null;
    let action = 'created';
    let orderNumber = '';
    let grandTotal = 0;

    if (type === 'PO') {
      orderNumber = String(header.poNumber || '').trim().toUpperCase();
      if (!orderNumber) throw new Error('Could not extract PO number from file.');

      let subTotal = Number(header.subTotal) || 0;
      let totalGst = Number(header.totalGst) || 0;
      const processedItems = items.map((item, idx) => {
        const quantity = Number(item.quantity) || 0;
        const rate = Number(item.rate) || 0;
        const gstRate = Number(item.gst_rate) || 18;
        const basic = quantity * rate;
        const gstAmount = Number(item.gst_amount) || basic * gstRate / 100;
        const totalAmount = Number(item.total_amount) || basic + gstAmount;
        if (!subTotal) subTotal += basic;
        if (!totalGst) totalGst += gstAmount;
        return {
          material_name: item.material_name || item.description || 'Item',
          hsn_code: item.hsn_code || '',
          quantity,
          unit: item.unit || 'NOS',
          rate,
          gst_rate: gstRate,
          gst_amount: gstAmount,
          total_amount: totalAmount,
          sort_order: item.sort_order || idx + 1,
        };
      });
      grandTotal = Number(header.grandTotal) || subTotal + totalGst;

      const existing = await client.query(
        `SELECT id FROM purchase_orders WHERE UPPER(TRIM(po_number)) = $1 AND project_id = COALESCE($2, project_id) LIMIT 1`,
        [orderNumber, projectId]
      );

      if (existing.rows.length) {
        recordId = existing.rows[0].id;
        action = 'updated';
        await client.query(
          `UPDATE purchase_orders SET
             vendor_id = COALESCE($2, vendor_id),
             project_id = COALESCE($3, project_id),
             po_date = COALESCE($4::date, po_date),
             sub_total = $5,
             total_gst = $6,
             grand_total = $7,
             narration = COALESCE($8, narration),
             po_ref_no = COALESCE(po_ref_no, $9),
             serial_no_formatted = COALESCE(serial_no_formatted, $9),
             updated_at = NOW()
           WHERE id = $1`,
          [recordId, vendorId, projectId, header.poDate || null, subTotal, totalGst, grandTotal, header.narration || null, orderNumber]
        );
      } else {
        const pr = await client.query(
          `INSERT INTO purchase_orders
             (project_id, vendor_id, po_number, po_ref_no, serial_no_formatted, po_date,
              sub_total, total_gst, grand_total, status, narration, created_by)
           VALUES ($1,$2,$3,$3,$3,$4::date,$5,$6,$7,'approved',$8,$9)
           RETURNING id`,
          [projectId, vendorId, orderNumber, header.poDate || new Date().toISOString().slice(0, 10), subTotal, totalGst, grandTotal, header.narration || null, user.id]
        );
        recordId = pr.rows[0].id;
      }

      await client.query(`DELETE FROM po_items WHERE po_id = $1`, [recordId]);
      for (const item of processedItems) {
        await client.query(
          `INSERT INTO po_items
             (po_id, material_name, hsn_code, quantity, unit, rate, gst_rate, gst_amount, total_amount, sort_order)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
          [recordId, item.material_name, item.hsn_code, parseFloat(item.quantity)||0, item.unit, parseFloat(item.rate)||0, parseFloat(item.gst_rate)||0, parseFloat(item.gst_amount)||0, parseFloat(item.total_amount)||0, item.sort_order]
        );
      }
    } else {
      orderNumber = String(header.woNumber || '').trim().toUpperCase();
      if (!orderNumber) throw new Error('Could not extract WO number from file.');

      const processedItems = items.map((item, idx) => ({
        description: item.description || item.material_name || 'Item',
        unit: item.unit || 'LS',
        quantity: Number(item.quantity) || 0,
        rate: Number(item.rate) || 0,
        remarks: item.remarks || '',
        sort_order: item.sort_order || idx + 1,
      }));
      grandTotal = Number(header.totalValue) || processedItems.reduce((sum, it) => sum + it.quantity * it.rate, 0);

      const existing = await client.query(
        `SELECT id FROM work_orders WHERE UPPER(TRIM(wo_number)) = $1 AND project_id = COALESCE($2, project_id) LIMIT 1`,
        [orderNumber, projectId]
      );
      if (existing.rows.length) {
        recordId = existing.rows[0].id;
        action = 'updated';
        await client.query(
          `UPDATE work_orders SET
             vendor_id = COALESCE($2, vendor_id),
             project_id = COALESCE($3, project_id),
             start_date = COALESCE($4::date, start_date),
             contract_amount = $5,
             total_value = $5,
             scope_of_work = COALESCE($6, scope_of_work),
             updated_at = NOW()
           WHERE id = $1`,
          [recordId, vendorId, projectId, header.woDate || null, grandTotal, header.narration || null]
        );
      } else {
        const wr = await client.query(
          `INSERT INTO work_orders
             (project_id, vendor_id, wo_number, subject, scope_of_work, work_description,
              start_date, contract_amount, total_value, status, created_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7::date,$8,$8,'active',$9)
           RETURNING id`,
          [projectId, vendorId, orderNumber, `${orderNumber} - ${vName || 'Work Order'}`, header.narration || null, header.narration || `Work Order ${orderNumber}`, header.woDate || new Date().toISOString().slice(0, 10), grandTotal, user.id]
        );
        recordId = wr.rows[0].id;
      }

      await client.query(`DELETE FROM work_order_items WHERE wo_id = $1`, [recordId]);
      for (const item of processedItems) {
        await client.query(
          `INSERT INTO work_order_items (wo_id, description, unit, quantity, rate, remarks)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [recordId, item.description, item.unit, parseFloat(item.quantity)||0, parseFloat(item.rate)||0, item.remarks]
        );
      }
    }

    await client.query(
      `UPDATE documents SET module_record_id = $2, module = $3, project_id = COALESCE($4, project_id) WHERE id = $1`,
      [doc.id, recordId, type === 'PO' ? 'purchase_order' : 'work_order', projectId]
    );

    return {
      success: true,
      action,
      type,
      record_id: recordId,
      order_number: orderNumber,
      vendor: vName || null,
      items_count: items.length,
      grand_total: grandTotal,
      warnings,
    };
  });
}

async function importDocumentOrder(doc, { projectId, requestedType } = {}, user) {
  const localPath = documentPath(doc.local_url);
  if (!fs.existsSync(localPath)) throw new Error('File not found on disk');
  const parsed = await parseDocumentOrder(doc, localPath, requestedType);
  const detectedType = parsed.type;
  if (requestedType && detectedType !== requestedType) {
    throw new Error(`Uploaded file looks like ${detectedType}, but document module is ${requestedType}.`);
  }
  return upsertParsedOrder({ doc, parsed, projectId: doc.project_id || projectId || null, user });
}

// ── GET /documents ─────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { project_id, module, module_record_id, search } = req.query;
    const conditions = ['d.company_id = $1'];
    const params = [req.user.company_id];
    applyDocumentScope(req, conditions, params, 'd', project_id);
    let sql = `
      SELECT d.*, p.name as project_name, u.name as uploader_name,
             g.grn_number, g.invoice_number as record_invoice_number,
             g.challan_number as record_challan_number, g.grn_date as record_date
      FROM documents d
      LEFT JOIN projects p ON d.project_id = p.id
      LEFT JOIN users u    ON d.uploaded_by = u.id
      LEFT JOIN grn g      ON d.module = 'grn' AND d.module_record_id = g.id
      WHERE ${conditions.join(' AND ')}`;
    let i = params.length + 1;
    if (module)           { sql += ` AND d.module = $${i++}`;            params.push(module); }
    if (module_record_id) { sql += ` AND d.module_record_id = $${i++}`;  params.push(module_record_id); }
    if (search)           { sql += ` AND d.file_name ILIKE $${i++}`;     params.push(`%${search}%`); }
    sql += ' ORDER BY d.created_at DESC LIMIT 200';
    const result = await query(sql, params);
    res.json({ data: result.rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── POST /documents/upload ─────────────────────────────────────────────────
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file provided' });

    const { project_id, module = 'general', module_record_id, tags, doc_type = 'general' } = req.body;
    if (project_id && !userCanAccessProject(req, project_id)) {
      return res.status(403).json({ error: 'Access denied for this project.' });
    }

    // Resolve project name for OneDrive folder path
    let projectName = 'General';
    if (project_id) {
      const pr = await query('SELECT name FROM projects WHERE id=$1', [project_id]);
      if (pr.rows.length) projectName = pr.rows[0].name;
    }

    const localUrl  = `/uploads/documents/${req.file.filename}`;
    const localPath = req.file.path;
    const ext       = path.extname(req.file.originalname).slice(1).toLowerCase();

    // Try OneDrive upload
    let onedriveData = null;
    try {
      onedriveData = await uploadToOneDrive(localPath, req.file.originalname, module, projectName);
    } catch (odErr) {
      console.warn('OneDrive upload skipped:', odErr.message);
    }

    const result = await query(
      `INSERT INTO documents
         (company_id, project_id, module, module_record_id, file_name, file_type, file_size,
          local_url, onedrive_id, onedrive_url, onedrive_web_url, tags, uploaded_by, doc_type)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       RETURNING *`,
      [
        req.user.company_id,
        project_id || null,
        module,
        module_record_id || null,
        req.file.originalname,
        ext,
        req.file.size,
        localUrl,
        onedriveData?.onedrive_id   || null,
        onedriveData?.onedrive_url  || null,
        onedriveData?.onedrive_web_url || null,
        tags ? (Array.isArray(tags) ? tags : tags.split(',').map(t => t.trim())) : [],
        req.user.id,
        doc_type || 'general',
      ]
    );

    const doc = result.rows[0];
    let importResult = null;
    let importError = null;
    const requestedType = module === 'purchase_order' ? 'PO' : module === 'work_order' ? 'WO' : null;
    if (requestedType) {
      try {
        importResult = await importDocumentOrder(doc, { projectId: project_id || null, requestedType }, req.user);
      } catch (err) {
        importError = err.message;
      }
    }

    res.status(201).json({
      data: doc,
      onedrive_synced: !!onedriveData,
      onedrive_configured: isConfigured(),
      import_result: importResult,
      import_error: importError,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── GET /documents/modules ─────────────────────────────────────────────────
router.get('/modules', async (req, res) => {
  try {
    const conditions = ['company_id=$1'];
    const params = [req.user.company_id];
    if (!req.isGlobalRole) {
      const allowed = req.allowedProjectIds || [];
      if (!allowed.length) {
        conditions.push('project_id IS NULL');
      } else {
        params.push(allowed);
        conditions.push(`(project_id IS NULL OR project_id = ANY($${params.length}::uuid[]))`);
      }
    }
    const result = await query(
      `SELECT module, COUNT(*) as count FROM documents WHERE ${conditions.join(' AND ')} GROUP BY module ORDER BY count DESC`,
      params
    );
    res.json({ data: result.rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── GET /documents/:id/file ─────────────────────────────────────────────────
// Streams the raw file bytes through an authenticated request — needed
// because the /uploads static route requires a Bearer header, which a plain
// <img src> or <a href> can never send. Callers fetch this as a blob and
// build an object URL (e.g. for gallery thumbnails / previews).
//
// Falls back to OneDrive when there's no usable local copy — documents
// synced to OneDrive have their local file deleted right after upload (see
// upload.routes.js), and Railway's filesystem is ephemeral anyway (wiped on
// every redeploy), so "local_url is set" doesn't mean the bytes still exist
// on disk.
router.get('/:id/file', async (req, res) => {
  try {
    const doc = await getAccessibleDocument(req, req.params.id);
    const { rows } = await query('SELECT local_url, onedrive_id, file_name FROM documents WHERE id=$1', [doc.id]);
    const row = rows[0];
    if (!row) return res.status(404).json({ error: 'Document not found' });
    if (req.query.download) {
      res.setHeader('Content-Disposition', `attachment; filename="${row.file_name}"`);
    }

    if (row.local_url) {
      const filePath = documentPath(row.local_url);
      if (fs.existsSync(filePath)) return res.sendFile(filePath);
    }

    if (row.onedrive_id) {
      const { buffer, contentType } = await downloadFromOneDrive(row.onedrive_id);
      res.setHeader('Content-Type', contentType);
      return res.send(buffer);
    }

    return res.status(404).json({ error: 'File not available locally or on OneDrive' });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

// ── POST /documents/:id/parse-order ───────────────────────────────────────
// Reads the linked Excel file, auto-creates (or re-syncs) the PO/WO record
// including all line items, then links the document back to that record.
router.post('/:id/parse-order-v2', async (req, res) => {
  try {
    await getAccessibleDocument(req, req.params.id);
    if (req.body.project_id && !userCanAccessProject(req, req.body.project_id)) {
      return res.status(403).json({ error: 'Access denied for this project.' });
    }
    const docRes = await query(
      `SELECT * FROM documents WHERE id = $1 AND company_id = $2`,
      [req.params.id, req.user.company_id]
    );
    if (!docRes.rows.length) return res.status(404).json({ error: 'Document not found' });

    const doc = docRes.rows[0];
    const requestedType = doc.module === 'purchase_order' ? 'PO' : doc.module === 'work_order' ? 'WO' : null;
    const result = await importDocumentOrder(doc, { projectId: req.body.project_id || null, requestedType }, req.user);
    return res.json(result);
  } catch (err) {
    console.error('parse-order-v2 error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/parse-order', async (req, res) => {
  const { parseOrderFile } = require('../services/excelParser');

  try {
    await getAccessibleDocument(req, req.params.id);
    // 1. Fetch document record
    const docRes = await query(
      `SELECT * FROM documents WHERE id = $1 AND company_id = $2`,
      [req.params.id, req.user.company_id]
    );
    if (!docRes.rows.length) return res.status(404).json({ error: 'Document not found' });
    const doc = docRes.rows[0];

    // 2. Validate it's an Excel file
    if (!doc.local_url || !doc.local_url.endsWith('.xlsx')) {
      return res.status(400).json({ error: 'Document is not an Excel (.xlsx) file' });
    }

    const localPath = path.join(__dirname, '../../', doc.local_url);
    if (!fs.existsSync(localPath)) {
      return res.status(404).json({ error: 'File not found on disk' });
    }

    // 3. Parse the file
    const parsed = parseOrderFile(localPath, doc.file_name);
    if (parsed.error) return res.status(422).json({ error: parsed.error });

    const { type, header, items } = parsed;

    // 4. Resolve project_id — from document or query param
    const projectId = doc.project_id || req.body.project_id || null;
    if (projectId && !userCanAccessProject(req, projectId)) {
      return res.status(403).json({ error: 'Access denied for this project.' });
    }

    // 5. Upsert vendor
    let vendorId = null;
    const vName  = type === 'PO' ? header.vendorName  : header.contractorName;
    const vGstin = type === 'PO' ? header.vendorGstin : header.contractorGstin;
    const vPan   = type === 'WO' ? header.contractorPan : null;
    const vType  = type === 'PO' ? 'supplier' : 'subcontractor';

    if (vName) {
      // Try GSTIN match first, then name
      let existing = null;
      if (vGstin && vGstin.length >= 10) {
        const gr = await query(
          `SELECT id FROM vendors WHERE company_id=$1 AND gstin ILIKE $2 LIMIT 1`,
          [req.user.company_id, vGstin]
        );
        existing = gr.rows[0];
      }
      if (!existing) {
        const nr = await query(
          `SELECT id FROM vendors WHERE company_id=$1 AND LOWER(name) = LOWER($2) LIMIT 1`,
          [req.user.company_id, vName]
        );
        existing = nr.rows[0];
      }
      if (existing) {
        vendorId = existing.id;
      } else {
        // Auto-create vendor with next vendor code
        const codeRes = await query(
          `SELECT vendor_code FROM vendors WHERE company_id=$1 AND vendor_code ~ '^VND-[0-9]+' ORDER BY CAST(SUBSTRING(vendor_code FROM 5) AS INTEGER) DESC LIMIT 1`,
          [req.user.company_id]
        );
        let nextNum = 1;
        if (codeRes.rows.length) {
          const last = codeRes.rows[0].vendor_code.replace('VND-', '');
          nextNum = parseInt(last, 10) + 1;
        }
        const newCode = `VND-${String(nextNum).padStart(4, '0')}`;
        const vr = await query(
          `INSERT INTO vendors (company_id, vendor_code, name, gstin, pan, vendor_type, state, is_active)
           VALUES ($1,$2,$3,$4,$5,$6,'Telangana',true) RETURNING id`,
          [req.user.company_id, newCode, vName.slice(0, 200),
           vGstin && vGstin.length >= 10 ? vGstin.slice(0, 15) : null,
           vPan ? vPan.slice(0, 10) : null,
           vType]
        );
        vendorId = vr.rows[0].id;
      }

      // Map vendor to project
      if (projectId && vendorId) {
        await query(
          `INSERT INTO project_vendors (project_id, vendor_id, added_by)
           VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
          [projectId, vendorId, req.user.id]
        );
      }
    }

    let recordId = null;
    let action   = 'created';

    if (type === 'PO') {
      const poNum = header.poNumber;
      if (!poNum) return res.status(422).json({ error: 'Could not extract PO number from file' });

      // Check if PO already exists
      const existing = await query(
        `SELECT id FROM purchase_orders WHERE po_number = $1`, [poNum]
      );

      if (existing.rows.length) {
        recordId = existing.rows[0].id;
        action   = 'resynced';
        // Update header fields
        await query(
          `UPDATE purchase_orders SET
             vendor_id   = COALESCE($2, vendor_id),
             project_id  = COALESCE($3, project_id),
             po_date     = COALESCE($4::date, po_date),
             sub_total   = COALESCE($5, sub_total),
             total_gst   = COALESCE($6, total_gst),
             grand_total = COALESCE($7, grand_total),
             narration   = COALESCE($8, narration),
             updated_at  = now()
           WHERE id = $1`,
          [recordId, vendorId, projectId,
           header.poDate || null,
           header.subTotal, header.totalGst, header.grandTotal,
           header.narration || null]
        );
      } else {
        const pr = await query(
          `INSERT INTO purchase_orders
             (project_id, vendor_id, po_number, po_date, sub_total, total_gst,
              grand_total, status, narration, created_by)
           VALUES ($1,$2,$3,$4::date,$5,$6,$7,'approved',$8,$9)
           RETURNING id`,
          [projectId, vendorId, poNum,
           header.poDate || new Date().toISOString().slice(0, 10),
           header.subTotal || 0, header.totalGst || 0, header.grandTotal || 0,
           header.narration || null, req.user.id]
        );
        recordId = pr.rows[0].id;
      }

      // Replace line items
      await query(`DELETE FROM po_items WHERE po_id = $1`, [recordId]);
      for (const item of items) {
        await query(
          `INSERT INTO po_items
             (po_id, material_name, hsn_code, quantity, unit, rate,
              gst_rate, gst_amount, total_amount, sort_order)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
          [recordId, item.material_name, item.hsn_code,
           parseFloat(item.quantity)||0, item.unit, parseFloat(item.rate)||0,
           parseFloat(item.gst_rate)||0, parseFloat(item.gst_amount)||0, parseFloat(item.total_amount)||0, item.sort_order]
        );
      }

    } else { // WO
      const woNum = header.woNumber;
      if (!woNum) return res.status(422).json({ error: 'Could not extract WO number from file' });

      const existing = await query(
        `SELECT id FROM work_orders WHERE wo_number = $1`, [woNum]
      );

      if (existing.rows.length) {
        recordId = existing.rows[0].id;
        action   = 'resynced';
        await query(
          `UPDATE work_orders SET
             vendor_id       = COALESCE($2, vendor_id),
             project_id      = COALESCE($3, project_id),
             start_date      = COALESCE($4::date, start_date),
             contract_amount = COALESCE($5, contract_amount),
             total_value     = COALESCE($6, total_value),
             scope_of_work   = COALESCE($7, scope_of_work),
             updated_at      = now()
           WHERE id = $1`,
          [recordId, vendorId, projectId,
           header.woDate || null,
           header.contractAmount, header.totalValue,
           header.narration || null]
        );
      } else {
        const wr = await query(
          `INSERT INTO work_orders
             (project_id, wo_number, vendor_id, work_description, subject,
              scope_of_work, start_date, contract_amount, total_value, status, created_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7::date,$8,$9,'active',$10)
           RETURNING id`,
          [projectId, woNum, vendorId,
           header.narration || `Work Order ${woNum}`,
           `${woNum} — ${vName || 'Work Order'}`,
           header.narration || null,
           header.woDate || new Date().toISOString().slice(0, 10),
           header.contractAmount || 0,
           header.totalValue     || 0,
           req.user.id]
        );
        recordId = wr.rows[0].id;
      }

      // Replace line items
      await query(`DELETE FROM work_order_items WHERE wo_id = $1`, [recordId]);
      for (const item of items) {
        await query(
          `INSERT INTO work_order_items (wo_id, description, unit, quantity, rate)
           VALUES ($1,$2,$3,$4,$5)`,
          [recordId, item.description, item.unit, parseFloat(item.quantity)||0, parseFloat(item.rate)||0]
        );
      }
    }

    // 6. Link document → record
    await query(
      `UPDATE documents SET
         module_record_id = $2,
         module           = $3,
         project_id       = COALESCE($4, project_id)
       WHERE id = $1`,
      [doc.id, recordId,
       type === 'PO' ? 'purchase_order' : 'work_order',
       projectId]
    );

    return res.json({
      success:     true,
      action,
      type,
      record_id:   recordId,
      order_number: type === 'PO' ? header.poNumber : header.woNumber,
      vendor:      vName  || null,
      items_count: items.length,
      grand_total: type === 'PO' ? header.grandTotal : header.totalValue,
    });

  } catch (err) {
    console.error('parse-order error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /documents/:id ──────────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    await getAccessibleDocument(req, req.params.id);
    const doc = await query(
      `DELETE FROM documents WHERE id=$1 AND company_id=$2 RETURNING *`,
      [req.params.id, req.user.company_id]
    );
    if (!doc.rows.length) return res.status(404).json({ error: 'Document not found' });

    // Remove local file
    const localPath = path.join(__dirname, '../../', doc.rows[0].local_url || '');
    if (fs.existsSync(localPath)) fs.unlinkSync(localPath);

    res.json({ message: 'Deleted' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
