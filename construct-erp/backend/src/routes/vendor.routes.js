// src/routes/vendor.routes.js
const express = require('express');
const multer = require('multer');
const { authenticate, authorize } = require('../middleware/auth');
const { query, withTransaction } = require('../config/database');
const { runSchemaInit } = require('../utils/schemaInit');
const vendorRouter = express.Router();

const upload = multer({ dest: 'uploads/' });

// ─── Sequential vendor code generator (always VND-XXXX) ──────────────────────
async function nextVendorCode(companyId) {
  const r = await query(
    `SELECT vendor_code FROM vendors
     WHERE company_id = $1 AND vendor_code ~ '^VND-[0-9]+'
     ORDER BY CAST(SUBSTRING(vendor_code FROM 5) AS INTEGER) DESC
     LIMIT 1`,
    [companyId]
  );
  const lastNum = r.rows.length ? parseInt(r.rows[0].vendor_code.replace('VND-', ''), 10) : 0;
  return `VND-${String(lastNum + 1).padStart(4, '0')}`;
}

vendorRouter.use(authenticate);

const canonicalVendorName = (name = '') => {
  const cleaned = String(name || '').trim().replace(/\s+/g, ' ');
  const key = cleaned.toLowerCase();
  if (key === 'sree jaladurga enterprises' || key === 'sri jaladurga enterprises') {
    return 'Sri Jaladurga Enterprises';
  }
  return cleaned;
};

const n = (value) => Number(value || 0);
const scoreTag = (overall) => (
  overall >= 85 ? 'Preferred' :
  overall >= 70 ? 'Active' :
  overall >= 50 ? 'Watchlist' :
  'Critical'
);

// GET / — List all active vendors
// Ensure extra columns exist (added when DQS vendor list was unified)
const ensureVendorCols = async () => {
  const extras = [
    `ALTER TABLE vendors ADD COLUMN IF NOT EXISTS trade_name    TEXT DEFAULT ''`,
    `ALTER TABLE vendors ADD COLUMN IF NOT EXISTS pincode       TEXT DEFAULT ''`,
    `ALTER TABLE vendors ADD COLUMN IF NOT EXISTS trade_license TEXT DEFAULT ''`,
    `ALTER TABLE vendors ADD COLUMN IF NOT EXISTS msme_reg      TEXT DEFAULT ''`,
    `ALTER TABLE vendors ADD COLUMN IF NOT EXISTS bank_branch   TEXT DEFAULT ''`,
    `ALTER TABLE vendors ADD COLUMN IF NOT EXISTS notes         TEXT DEFAULT ''`,
    `ALTER TABLE vendors ADD COLUMN IF NOT EXISTS website_url   TEXT DEFAULT ''`,
  ];
  for (const sql of extras) {
    try { await query(sql); } catch (_) {}
  }
};
runSchemaInit('vendors', ensureVendorCols);

vendorRouter.get('/', async (req, res) => {
  try {
    const { search, vendor_type, project_id } = req.query;
    const params = [req.user.company_id];
    let i = 2;

    let sql = `SELECT v.*, COALESCE(v.trade_name,'') AS trade_name, COALESCE(v.pincode,'') AS pincode,
      COALESCE(v.trade_license,'') AS trade_license, COALESCE(v.msme_reg,'') AS msme_reg,
      COALESCE(v.bank_branch,'') AS bank_branch, COALESCE(v.notes,'') AS notes,
      COALESCE(v.website_url,'') AS website_url
      FROM vendors v WHERE v.company_id = $1 AND v.is_active = true`;

    // Vendor master is company-wide — every vendor is available for selection on
    // POs, work orders, etc. Only filter by project mapping if a project_id is
    // explicitly requested (e.g. the project-vendor mapping screens).
    if (project_id) {
      sql += ` AND EXISTS (
        SELECT 1 FROM project_vendors pv
        WHERE pv.vendor_id = v.id AND pv.project_id = $${i})`;
      params.push(project_id); i++;
    }

    if (search) {
      sql += ` AND (v.name ILIKE $${i} OR v.gstin ILIKE $${i} OR v.contact_person ILIKE $${i})`;
      params.push(`%${search}%`); i++;
    }
    if (vendor_type) { sql += ` AND v.vendor_type = $${i++}`; params.push(vendor_type); }
    sql += ` ORDER BY
      CASE WHEN v.vendor_code ~ '^VND-[0-9]+$'
           THEN CAST(SUBSTRING(v.vendor_code FROM 5) AS INTEGER)
           ELSE 9999 END ASC,
      v.name ASC`;
    const result = await query(sql, params);
    res.json({ data: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /vendors/performance — consolidated live vendor scorecard
vendorRouter.get('/performance', async (req, res) => {
  try {
    const result = await query(
      `
      WITH po_stats AS (
        SELECT
          po.vendor_id,
          COUNT(*)::int AS po_count,
          COUNT(DISTINCT po.project_id)::int AS project_count,
          COALESCE(SUM(COALESCE(po.grand_total, 0)), 0)::numeric AS po_value,
          MAX(COALESCE(po.updated_at, po.created_at, po.po_date::timestamp)) AS last_po_at
        FROM purchase_orders po
        JOIN projects p ON p.id = po.project_id
        WHERE p.company_id = $1
          AND po.vendor_id IS NOT NULL
          AND COALESCE(po.status, '') NOT IN ('cancelled', 'rejected')
        GROUP BY po.vendor_id
      ),
      grn_stats AS (
        SELECT
          g.vendor_id,
          COUNT(*)::int AS grn_count,
          COUNT(*) FILTER (
            WHERE g.grn_date IS NOT NULL
              AND po.delivery_date IS NOT NULL
              AND g.grn_date <= po.delivery_date + INTERVAL '1 day'
          )::int AS on_time_count,
          COUNT(*) FILTER (
            WHERE g.grn_date IS NOT NULL
              AND po.delivery_date IS NOT NULL
              AND g.grn_date > po.delivery_date + INTERVAL '1 day'
          )::int AS delayed_count,
          COUNT(*) FILTER (WHERE g.quality_status = 'approved')::int AS approved_count,
          MAX(COALESCE(g.approved_qc_at, g.verified_stores_at, g.grn_date::timestamp, g.created_at)) AS last_grn_at
        FROM grn g
        JOIN projects p ON p.id = g.project_id
        LEFT JOIN purchase_orders po ON po.id = g.po_id
        WHERE p.company_id = $1
          AND g.vendor_id IS NOT NULL
          AND COALESCE(g.quality_status, '') <> 'rejected'
        GROUP BY g.vendor_id
      ),
      invoice_stats AS (
        SELECT
          i.vendor_id,
          COUNT(*)::int AS invoice_count,
          COALESCE(SUM(COALESCE(i.net_amount, i.total_amount, 0)), 0)::numeric AS invoice_value,
          AVG(
            CASE
              WHEN COALESCE(po.grand_total, 0) > 0
               AND COALESCE(i.net_amount, i.total_amount, 0) > 0
              THEN ABS(COALESCE(i.net_amount, i.total_amount, 0) - COALESCE(po.grand_total, 0))
                   / NULLIF(COALESCE(po.grand_total, 0), 0)
              ELSE NULL
            END
          )::numeric AS avg_price_variance,
          COUNT(*) FILTER (
            WHERE COALESCE(po.grand_total, 0) > 0
              AND COALESCE(i.net_amount, i.total_amount, 0) > 0
          )::int AS price_check_count,
          MAX(COALESCE(i.updated_at, i.created_at, i.invoice_date::timestamp)) AS last_invoice_at
        FROM invoices i
        JOIN projects p ON p.id = i.project_id
        LEFT JOIN purchase_orders po ON po.id = i.po_id
        WHERE p.company_id = $1
          AND i.vendor_id IS NOT NULL
        GROUP BY i.vendor_id
      ),
      dqs_bill_stats AS (
        SELECT
          b.vendor_id,
          COUNT(*)::int AS dqs_bill_count,
          COALESCE(SUM(COALESCE(b.total_amount, 0)), 0)::numeric AS dqs_bill_value,
          MAX(COALESCE(b.updated_at, b.created_at, b.inv_date::timestamp)) AS last_bill_at
        FROM tqs_bills b
        WHERE b.company_id = $1
          AND b.vendor_id IS NOT NULL
        GROUP BY b.vendor_id
      )
      SELECT
        v.id,
        v.name AS vendor,
        v.vendor_code,
        COALESCE(v.vendor_type, 'vendor') AS vendor_type,
        COALESCE(ps.po_count, 0) AS po_count,
        COALESCE(ps.project_count, 0) AS project_count,
        COALESCE(ps.po_value, 0) AS po_value,
        COALESCE(gs.grn_count, 0) AS grn_count,
        COALESCE(gs.on_time_count, 0) AS on_time_count,
        COALESCE(gs.delayed_count, 0) AS delayed_count,
        COALESCE(gs.approved_count, 0) AS approved_count,
        COALESCE(inv.invoice_count, 0) AS invoice_count,
        COALESCE(inv.invoice_value, 0) AS invoice_value,
        COALESCE(inv.avg_price_variance, 0) AS avg_price_variance,
        COALESCE(inv.price_check_count, 0) AS price_check_count,
        COALESCE(dqs.dqs_bill_count, 0) AS dqs_bill_count,
        COALESCE(dqs.dqs_bill_value, 0) AS dqs_bill_value,
        GREATEST(
          COALESCE(ps.last_po_at, 'epoch'::timestamp),
          COALESCE(gs.last_grn_at, 'epoch'::timestamp),
          COALESCE(inv.last_invoice_at, 'epoch'::timestamp),
          COALESCE(dqs.last_bill_at, 'epoch'::timestamp)
        ) AS last_rated
      FROM vendors v
      LEFT JOIN po_stats ps ON ps.vendor_id = v.id
      LEFT JOIN grn_stats gs ON gs.vendor_id = v.id
      LEFT JOIN invoice_stats inv ON inv.vendor_id = v.id
      LEFT JOIN dqs_bill_stats dqs ON dqs.vendor_id = v.id
      WHERE v.company_id = $1 AND v.is_active = true
      ORDER BY
        CASE WHEN v.vendor_code ~ '^VND-[0-9]+$'
             THEN CAST(SUBSTRING(v.vendor_code FROM 5) AS INTEGER)
             ELSE 9999 END ASC,
        v.name ASC
      `,
      [req.user.company_id]
    );

    const rows = result.rows.map((row) => {
      const poCount = n(row.po_count);
      const grnCount = n(row.grn_count);
      const invoiceCount = n(row.invoice_count);
      const dqsBillCount = n(row.dqs_bill_count);
      const delivery = grnCount ? Math.round((n(row.on_time_count) / grnCount) * 100) : (poCount ? 75 : 0);
      const quality = grnCount ? Math.round((n(row.approved_count) / grnCount) * 100) : (poCount ? 80 : 0);
      const pricing = n(row.price_check_count)
        ? Math.max(40, Math.round(100 - (n(row.avg_price_variance) * 100)))
        : (poCount || invoiceCount || dqsBillCount ? 70 : 0);
      const overall = Math.round((delivery + quality + pricing) / 3);
      const tag = scoreTag(overall);
      return {
        ...row,
        poCount,
        projectCount: n(row.project_count),
        grnCount,
        invoiceCount,
        dqsBillCount,
        onTimeCount: n(row.on_time_count),
        delayedCount: n(row.delayed_count),
        purchaseValue: n(row.po_value),
        invoiceValue: n(row.invoice_value),
        dqsBillValue: n(row.dqs_bill_value),
        delivery,
        quality,
        pricing,
        overall,
        tag,
        remarks:
          overall >= 85 ? 'Strong performer across delivery, quality and pricing.' :
          overall >= 70 ? 'Solid vendor with minor follow-up needs.' :
          overall >= 50 ? 'Monitor for delivery, quality, or billing issues.' :
          'Needs urgent review and procurement follow-up.',
        lastRated: row.last_rated && row.last_rated !== '1970-01-01T00:00:00.000Z' ? row.last_rated : null,
      };
    }).sort((a, b) => b.overall - a.overall || a.vendor.localeCompare(b.vendor));

    const avgScore = rows.length
      ? Math.round(rows.reduce((sum, row) => sum + row.overall, 0) / rows.length)
      : 0;

    res.json({
      data: rows,
      summary: {
        vendorsRated: rows.length,
        avgScore,
        preferred: rows.filter(row => row.tag === 'Preferred').length,
        watchCritical: rows.filter(row => ['Watchlist', 'Critical'].includes(row.tag)).length,
      },
    });
  } catch (err) {
    console.error('Vendor performance error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST / — Create single vendor
vendorRouter.post('/', authorize('super_admin', 'admin', 'procurement_manager'), async (req, res) => {
  try {
    const {
      name, gstin, pan, vendor_type, contact_person, phone, email,
      mobile_number_1, mobile_number_2,
      address, city, state, pincode, trade_name, trade_license, msme_reg,
      bank_name, account_number, ifsc_code, bank_branch, notes, website_url, credit_days,
      trade_category, contract_start_date, contract_end_date, subcontractor_status,
    } = req.body;

    const code = await nextVendorCode(req.user.company_id);
    const cleanName = canonicalVendorName(name);

    const result = await query(
      `INSERT INTO vendors (
        company_id, vendor_code, name, trade_name, gstin, pan, vendor_type,
        contact_person, phone, email, mobile_number_1, mobile_number_2,
        address, city, state, pincode,
        trade_license, msme_reg, bank_name, account_number, ifsc_code,
        bank_branch, notes, website_url, credit_days,
        trade_category, contract_start_date, contract_end_date, subcontractor_status
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29)
      RETURNING *`,
      [
        req.user.company_id, code, cleanName, trade_name||'', gstin||'', pan||'', vendor_type||'',
        contact_person||'', phone||'', email||'', mobile_number_1||'', mobile_number_2||'',
        address||'', city||'', state||'', pincode||'',
        trade_license||'', msme_reg||'', bank_name||'', account_number||'', ifsc_code||'',
        bank_branch||'', notes||'', website_url||'', credit_days || 30,
        trade_category || null, contract_start_date || null, contract_end_date || null,
        subcontractor_status || 'active',
      ]
    );
    res.status(201).json({ data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Vendor-Project Mapping (must be before /:id routes) ───────────────────

// GET /vendors/project-map?project_id=xxx  — list vendors mapped to a project
vendorRouter.get('/project-map', async (req, res) => {
  try {
    const { project_id } = req.query;
    if (!project_id) return res.status(400).json({ error: 'project_id required' });
    const result = await query(
      `SELECT v.id, v.vendor_code, v.name, v.vendor_type, v.contact_person, v.phone, v.email,
              v.city, v.state, v.is_active, pv.added_at
       FROM project_vendors pv
       JOIN vendors v ON v.id = pv.vendor_id
       WHERE pv.project_id = $1 AND v.company_id = $2
       ORDER BY CASE WHEN v.vendor_code ~ '^VND-[0-9]+$' THEN CAST(SUBSTRING(v.vendor_code FROM 5) AS INTEGER) ELSE 9999 END ASC, v.name ASC`,
      [project_id, req.user.company_id]
    );
    res.json({ data: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /vendors/unmapped?project_id=xxx  — list vendors NOT yet mapped to a project
vendorRouter.get('/unmapped', async (req, res) => {
  try {
    const { project_id } = req.query;
    if (!project_id) return res.status(400).json({ error: 'project_id required' });
    const result = await query(
      `SELECT v.id, v.vendor_code, v.name, v.vendor_type, v.contact_person, v.phone, v.email, v.city, v.state
       FROM vendors v
       WHERE v.company_id = $1 AND v.is_active = true
         AND NOT EXISTS (
           SELECT 1 FROM project_vendors pv
           WHERE pv.vendor_id = v.id AND pv.project_id = $2
         )
       ORDER BY CASE WHEN v.vendor_code ~ '^VND-[0-9]+$' THEN CAST(SUBSTRING(v.vendor_code FROM 5) AS INTEGER) ELSE 9999 END ASC, v.name ASC`,
      [req.user.company_id, project_id]
    );
    res.json({ data: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /vendors/project-map  — map one or more vendors to a project
vendorRouter.post('/project-map', authorize('super_admin', 'admin', 'procurement_manager', 'project_manager'), async (req, res) => {
  try {
    const { project_id, vendor_ids } = req.body;
    if (!project_id || !Array.isArray(vendor_ids) || vendor_ids.length === 0) {
      return res.status(400).json({ error: 'project_id and vendor_ids[] required' });
    }
    let added = 0;
    for (const vid of vendor_ids) {
      await query(
        `INSERT INTO project_vendors (project_id, vendor_id, added_by)
         VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
        [project_id, vid, req.user.id]
      );
      added++;
    }
    res.json({ message: `${added} vendor(s) mapped to project`, added });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /vendors/project-map  — unmap a vendor from a project
vendorRouter.delete('/project-map', authorize('super_admin', 'admin', 'procurement_manager', 'project_manager'), async (req, res) => {
  try {
    const { project_id, vendor_id } = req.body;
    if (!project_id || !vendor_id) {
      return res.status(400).json({ error: 'project_id and vendor_id required' });
    }
    await query(
      'DELETE FROM project_vendors WHERE project_id = $1 AND vendor_id = $2',
      [project_id, vendor_id]
    );
    res.json({ message: 'Vendor unmapped from project' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /:id — Update vendor
vendorRouter.put('/:id', authorize('super_admin', 'admin', 'procurement_manager'), async (req, res) => {
  try {
    const fields = req.body;
    if (Object.prototype.hasOwnProperty.call(fields, 'name')) {
      fields.name = canonicalVendorName(fields.name);
    }
    const allowed = [
      'name', 'trade_name', 'gstin', 'pan', 'vendor_type', 'contact_person', 'phone',
      'mobile_number_1', 'mobile_number_2',
      'email', 'address', 'city', 'state', 'pincode', 'trade_license', 'msme_reg',
      'bank_name', 'account_number', 'ifsc_code', 'bank_branch', 'notes', 'website_url',
      'credit_days', 'is_active',
      'trade_category', 'contract_start_date', 'contract_end_date', 'subcontractor_status',
    ];
    
    let updates = [];
    let params = [req.params.id];
    let i = 2;

    Object.keys(fields).forEach(key => {
      if (allowed.includes(key)) {
        updates.push(`${key} = $${i++}`);
        params.push(fields[key]);
      }
    });

    if (updates.length === 0) return res.status(400).json({ error: 'No valid fields provided' });

    const sql = `UPDATE vendors SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $1 RETURNING *`;
    const result = await query(sql, params);
    
    if (result.rowCount === 0) return res.status(404).json({ error: 'Vendor not found' });
    res.json({ data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /:id — Deactivate vendor
vendorRouter.delete('/:id', authorize('super_admin', 'admin', 'procurement_manager'), async (req, res) => {
  try {
    await query('UPDATE vendors SET is_active = false WHERE id = $1', [req.params.id]);
    res.json({ message: 'Vendor deactivated successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /import — Bulk import vendors from CSV
vendorRouter.post('/import', authorize('super_admin', 'admin', 'procurement_manager'), upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  try {
    const fs = require('fs');
    const content = fs.readFileSync(req.file.path, 'utf8');
    const lines = content.split(/\r?\n/);
    const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
    
    const results = await withTransaction(async (client) => {
      let imported = 0;
      for (let i = 1; i < lines.length; i++) {
        if (!lines[i].trim()) continue;
        
        // CSV parser — handles quoted fields (preserves spaces inside quotes)
        const values = [];
        let cur = '', inQ = false;
        for (let c = 0; c < lines[i].length; c++) {
          const ch = lines[i][c];
          if (ch === '"') { inQ = !inQ; }
          else if (ch === ',' && !inQ) { values.push(cur.trim()); cur = ''; }
          else { cur += ch; }
        }
        values.push(cur.trim());
        const row = {};
        headers.forEach((h, idx) => {
          row[h] = (values[idx] || '').replace(/^"|"$/g, '').trim();
        });

        if (!row.name) continue;

        const code = await nextVendorCode(req.user.company_id);
        await client.query(
          `INSERT INTO vendors (
            company_id, vendor_code, name, vendor_type, gstin, pan, 
            contact_person, phone, email, city, state, website_url, credit_days
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
          [
            req.user.company_id, code, row.name, row.type || 'material_supplier', 
            row.gstin, row.pan, row.contact || row.contact_person, 
            row.phone, row.email, row.city, row.state, row.website_url || row.website || '', 
            parseInt(row.credit_days) || 30
          ]
        );
        imported++;
      }
      return imported;
    });

    // Cleanup file
    fs.unlinkSync(req.file.path);
    res.json({ message: `Successfully imported ${results} vendors`, count: results });
  } catch (err) {
    if (req.file) require('fs').unlinkSync(req.file.path);
    res.status(500).json({ error: `Import failed: ${err.message}` });
  }
});

// GET /vendors/live-check?vendor_id=&material=&url=
vendorRouter.get('/live-check', async (req, res) => {
  try {
    const { vendor_id, material = '', url = '' } = req.query;

    let sourceUrl = String(url || '').trim();
    let vendor = null;
    if (vendor_id) {
      const result = await query(
        `SELECT id, name, website_url, vendor_code FROM vendors WHERE id = $1 AND company_id = $2`,
        [vendor_id, req.user.company_id]
      );
      if (!result.rows.length) {
        return res.status(404).json({ error: 'Vendor not found' });
      }
      vendor = result.rows[0];
      sourceUrl = sourceUrl || vendor.website_url || '';
    }

    if (!sourceUrl) {
      return res.status(400).json({ error: 'Provide vendor_id or a website URL' });
    }

    if (!/^https?:\/\//i.test(sourceUrl)) {
      sourceUrl = `https://${sourceUrl}`;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);

    const upstream = await fetch(sourceUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ConstructERP/1.0',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      signal: controller.signal,
    }).finally(() => clearTimeout(timeout));

    if (!upstream.ok) {
      return res.status(502).json({
        error: `Vendor page returned ${upstream.status}`,
        source_url: sourceUrl,
        vendor: vendor ? { id: vendor.id, name: vendor.name, vendor_code: vendor.vendor_code } : null,
      });
    }

    const html = await upstream.text();
    const title = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '').replace(/\s+/g, ' ').trim();
    const plain = html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    const needle = String(material || '').trim().toLowerCase();
    let windowText = plain.slice(0, 1600);
    if (needle) {
      const idx = plain.toLowerCase().indexOf(needle);
      if (idx >= 0) {
        windowText = plain.slice(Math.max(0, idx - 220), Math.min(plain.length, idx + 700));
      }
    }

    const priceMatches = [];
    const patterns = [
      /(?:₹|rs\.?|inr)\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{1,2})?|[0-9]+(?:\.[0-9]{1,2})?)/gi,
      /([0-9]{1,3}(?:,[0-9]{3})+(?:\.[0-9]{1,2})?)/g,
    ];
    for (const pattern of patterns) {
      for (const match of windowText.matchAll(pattern)) {
        const raw = match[1] || match[0];
        const numeric = parseFloat(String(raw).replace(/,/g, ''));
        if (!Number.isNaN(numeric) && numeric > 0) {
          priceMatches.push(numeric);
        }
      }
      if (priceMatches.length >= 10) break;
    }

    const snippet = windowText.slice(0, 900);
    const suggestedPrice = priceMatches[0] || null;

    res.json({
      data: {
        vendor: vendor ? { id: vendor.id, name: vendor.name, vendor_code: vendor.vendor_code } : null,
        source_url: sourceUrl,
        page_title: title || null,
        material: material || '',
        snippet,
        price_matches: priceMatches.slice(0, 10),
        suggested_price: suggestedPrice,
        fetched_at: new Date().toISOString(),
      },
    });
  } catch (err) {
    const status = err.name === 'AbortError' ? 504 : 500;
    res.status(status).json({ error: err.message });
  }
});

module.exports = vendorRouter;
