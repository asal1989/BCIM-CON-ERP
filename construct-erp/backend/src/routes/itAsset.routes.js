// src/routes/itAsset.routes.js  — Full IT Asset Management
const express = require('express');
const router  = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const { query } = require('../config/database');
router.use(authenticate);

const adminRoles = ['super_admin', 'admin', 'it_admin'];

const IT_TYPE_CODES = {
  laptop: 'LT',
  desktop: 'DT',
  server: 'SRV',
  network: 'NET',
  cctv: 'CCTV',
  biometric: 'BIO',
  printer: 'PRN',
  ups: 'UPS',
  other: 'OTH',
};

function normalizeItAssetTag(value, assetType = 'other') {
  const raw = String(value || '').trim().toUpperCase().replace(/\s+/g, '-');
  if (!raw) return raw;
  if (raw.startsWith('BCIM-IT-')) return raw;
  if (raw.startsWith('BCIM-')) return `BCIM-IT-${raw.slice(5).replace(/^IT-/, '')}`;
  if (raw.startsWith('IT-')) return `BCIM-${raw}`;
  const typeCode = IT_TYPE_CODES[String(assetType || '').toLowerCase()] || 'OTH';
  if (raw.startsWith(`${typeCode}-`) || raw.startsWith(typeCode)) return `BCIM-IT-${raw}`;
  return `BCIM-IT-${typeCode}-${raw}`;
}

// One-time backfill: older records were created before the BCIM- prefix was
// enforced, so their asset_tag still reads e.g. "IT-DT-004" instead of
// "BCIM-IT-DT-004".
(async () => {
  try {
    const { rows } = await query(`SELECT id, asset_tag, asset_type FROM it_assets WHERE asset_tag NOT LIKE 'BCIM-%'`);
    for (const row of rows) {
      const normalized = normalizeItAssetTag(row.asset_tag, row.asset_type);
      if (normalized && normalized !== row.asset_tag) {
        await query(`UPDATE it_assets SET asset_tag=$1 WHERE id=$2`, [normalized, row.id]).catch(() => {});
      }
    }
  } catch (_) { /* table may not exist yet on first boot */ }
})();

// ── GET /it-assets ──────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { asset_type, status, search } = req.query;
    let sql = `
      SELECT a.*, u.name AS assigned_to_name, p.name AS project_name
      FROM it_assets a
      LEFT JOIN users u ON a.assigned_to = u.id
      LEFT JOIN projects p ON a.location_project_id = p.id
      WHERE a.company_id = $1`;
    const params = [req.user.company_id]; let i = 2;
    if (asset_type) { sql += ` AND a.asset_type = $${i++}`; params.push(asset_type); }
    if (status)     { sql += ` AND a.status = $${i++}`;     params.push(status); }
    if (search)     { sql += ` AND (a.asset_tag ILIKE $${i} OR a.brand ILIKE $${i} OR a.model ILIKE $${i} OR a.serial_number ILIKE $${i})`; params.push(`%${search}%`); i++; }
    sql += ' ORDER BY a.asset_tag';
    res.json({ data: (await query(sql, params)).rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── GET /it-assets/:id ───────────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const a = await query(`
      SELECT a.*, u.name AS assigned_to_name, p.name AS project_name
      FROM it_assets a
      LEFT JOIN users u ON a.assigned_to = u.id
      LEFT JOIN projects p ON a.location_project_id = p.id
      WHERE a.id = $1 AND a.company_id = $2`, [req.params.id, req.user.company_id]);
    if (!a.rows.length) return res.status(404).json({ error: 'Asset not found' });

    // assignment history
    const hist = await query(`
      SELECT h.*, u1.name AS assigned_to_name, u2.name AS assigned_by_name, p.name AS project_name
      FROM it_asset_assignments h
      LEFT JOIN users u1 ON h.assigned_to = u1.id
      LEFT JOIN users u2 ON h.assigned_by = u2.id
      LEFT JOIN projects p ON h.project_id = p.id
      WHERE h.asset_id = $1 ORDER BY h.assigned_at DESC`, [req.params.id]);

    // maintenance log
    const maint = await query(`
      SELECT m.*, u.name AS created_by_name
      FROM it_asset_maintenance m
      LEFT JOIN users u ON m.created_by = u.id
      WHERE m.asset_id = $1 ORDER BY m.created_at DESC`, [req.params.id]);

    res.json({ data: { ...a.rows[0], history: hist.rows, maintenance: maint.rows } });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── POST /it-assets ──────────────────────────────────────────────────────────
router.post('/', authorize(...adminRoles), async (req, res) => {
  try {
    const {
      asset_tag, asset_type, brand, model, serial_number, os,
      purchase_date, purchase_cost, warranty_expiry,
      assigned_to, assigned_to_name, location_project_id, location_description,
      ip_address, mac_address, ram_gb, storage_gb, processor,
      antivirus_status, antivirus_expiry, notes, status = 'available'
    } = req.body;

    const normalizedAssetTag = normalizeItAssetTag(asset_tag, asset_type);
    const r = await query(`
      INSERT INTO it_assets
        (company_id, asset_tag, asset_type, brand, model, serial_number, os,
         purchase_date, purchase_cost, warranty_expiry,
         assigned_to, location_project_id, location_description,
         ip_address, mac_address, ram_gb, storage_gb, processor,
         antivirus_status, antivirus_expiry, notes, status)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
      RETURNING *`,
      [req.user.company_id, normalizedAssetTag, asset_type, brand, model,
       serial_number || null, os || null, purchase_date || null,
       purchase_cost || null, warranty_expiry || null,
       assigned_to || null, location_project_id || null, location_description || null,
       ip_address || null, mac_address || null, ram_gb || null, storage_gb || null, processor || null,
       antivirus_status || null, antivirus_expiry || null, notes || null, status]);

    // If assigned on creation, record history
    if (assigned_to) {
      await query(`
        INSERT INTO it_asset_assignments
          (asset_id, company_id, assigned_to, assigned_to_name, project_id, location, assigned_by)
        VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [r.rows[0].id, req.user.company_id, assigned_to,
         assigned_to_name || null, location_project_id || null,
         location_description || null, req.user.id]);
    }

    res.status(201).json({ data: r.rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── POST /it-assets/import — MUST be before /:id routes ─────────────────────
router.post('/import', authorize(...adminRoles), async (req, res) => {
  try {
    const { rows } = req.body;
    if (!Array.isArray(rows) || rows.length === 0)
      return res.status(400).json({ error: 'No rows provided' });
    let inserted = 0, skipped = 0;
    for (const row of rows) {
      if (!row.asset_tag || !row.brand || !row.model) { skipped++; continue; }
      const normalizedAssetTag = normalizeItAssetTag(row.asset_tag, row.asset_type);
      try {
        await query(
          `INSERT INTO it_assets
             (company_id,asset_tag,asset_type,brand,model,serial_number,
              purchase_date,purchase_cost,warranty_expiry,status,
              location_description,os,notes)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
           ON CONFLICT (company_id, asset_tag) DO NOTHING`,
          [req.user.company_id, normalizedAssetTag,
           String(row.asset_type || 'other').trim().toLowerCase(),
           String(row.brand).trim(), String(row.model).trim(),
           row.serial_number || null, row.purchase_date || null,
           row.purchase_cost ? parseFloat(row.purchase_cost) : null,
           row.warranty_expiry || null, row.status || 'available',
           row.location_description || null, row.os || null, row.notes || null]);
        inserted++;
      } catch (_) { skipped++; }
    }
    res.json({ message: `Imported ${inserted} assets, ${skipped} skipped` });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── PUT /it-assets/:id ── Full update ────────────────────────────────────────
router.put('/:id', authorize(...adminRoles), async (req, res) => {
  try {
    const {
      asset_tag, asset_type, brand, model, serial_number, os,
      purchase_date, purchase_cost, warranty_expiry,
      assigned_to, assigned_to_name, location_project_id, location_description,
      ip_address, mac_address, ram_gb, storage_gb, processor,
      antivirus_status, antivirus_expiry, notes, status
    } = req.body;

    // Check if assignment changed
    const prev = (await query('SELECT assigned_to FROM it_assets WHERE id=$1', [req.params.id])).rows[0];

    const normalizedAssetTag = normalizeItAssetTag(asset_tag, asset_type);
    const r = await query(`
      UPDATE it_assets SET
        asset_tag=$1, asset_type=$2, brand=$3, model=$4, serial_number=$5, os=$6,
        purchase_date=$7, purchase_cost=$8, warranty_expiry=$9,
        assigned_to=$10, location_project_id=$11, location_description=$12,
        ip_address=$13, mac_address=$14, ram_gb=$15, storage_gb=$16, processor=$17,
        antivirus_status=$18, antivirus_expiry=$19, notes=$20, status=$21,
        updated_at=NOW()
      WHERE id=$22 AND company_id=$23 RETURNING *`,
      [normalizedAssetTag, asset_type, brand, model, serial_number || null, os || null,
       purchase_date || null, purchase_cost || null, warranty_expiry || null,
       assigned_to || null, location_project_id || null, location_description || null,
       ip_address || null, mac_address || null, ram_gb || null, storage_gb || null, processor || null,
       antivirus_status || null, antivirus_expiry || null, notes || null, status || 'available',
       req.params.id, req.user.company_id]);
    if (!r.rows.length) return res.status(404).json({ error: 'Asset not found' });

    // Track assignment history when assignee (UUID or name) changes
    const newAssigneeId   = assigned_to      || null;
    const newAssigneeName = assigned_to_name || null;
    const oldAssigneeId   = prev?.assigned_to || null;
    // Fetch previous name too
    const prevNameRes = await query('SELECT assigned_to_name FROM it_asset_assignments WHERE asset_id=$1 AND returned_at IS NULL ORDER BY assigned_at DESC LIMIT 1', [req.params.id]);
    const oldAssigneeName = prevNameRes.rows[0]?.assigned_to_name || null;

    const assigneeChanged = newAssigneeId !== oldAssigneeId ||
                            (newAssigneeName || '').trim() !== (oldAssigneeName || '').trim();

    if (assigneeChanged) {
      // Close any open assignment
      await query(`UPDATE it_asset_assignments SET returned_at=NOW()
                   WHERE asset_id=$1 AND returned_at IS NULL`, [req.params.id]);
      // Open new assignment if there is one
      if (newAssigneeId || newAssigneeName) {
        await query(`INSERT INTO it_asset_assignments
                       (asset_id, company_id, assigned_to, assigned_to_name, project_id, location, assigned_by)
                     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [req.params.id, req.user.company_id, newAssigneeId,
           newAssigneeName, location_project_id || null,
           location_description || null, req.user.id]);
      }
    }

    res.json({ data: r.rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── DELETE /it-assets/:id ────────────────────────────────────────────────────
router.delete('/:id', authorize('super_admin', 'admin'), async (req, res) => {
  try {
    const r = await query(
      `DELETE FROM it_assets WHERE id=$1 AND company_id=$2 RETURNING id`,
      [req.params.id, req.user.company_id]);
    if (!r.rows.length) return res.status(404).json({ error: 'Asset not found' });
    res.json({ message: 'Deleted' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── POST /it-assets/:id/maintenance ─────────────────────────────────────────
router.post('/:id/maintenance', async (req, res) => {
  try {
    const { issue_type, description, vendor, cost, start_date, technician } = req.body;
    const r = await query(`
      INSERT INTO it_asset_maintenance
        (asset_id, company_id, issue_type, description, vendor, cost, start_date, technician, created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [req.params.id, req.user.company_id, issue_type || 'repair',
       description, vendor || null, cost || null, start_date || new Date(),
       technician || null, req.user.id]);

    // Mark asset as under repair
    if (issue_type !== 'preventive') {
      await query(`UPDATE it_assets SET status='under_repair', updated_at=NOW() WHERE id=$1`, [req.params.id]);
    }
    res.status(201).json({ data: r.rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── PATCH /it-assets/:id/maintenance/:mid/close ──────────────────────────────
router.patch('/:id/maintenance/:mid/close', async (req, res) => {
  try {
    const { resolution_notes, cost } = req.body;
    await query(`
      UPDATE it_asset_maintenance SET
        status='closed', end_date=CURRENT_DATE, resolution_notes=$1, cost=COALESCE($2,cost)
      WHERE id=$3 AND asset_id=$4`,
      [resolution_notes || null, cost || null, req.params.mid, req.params.id]);
    // Return asset to available
    await query(`UPDATE it_assets SET status='available', updated_at=NOW() WHERE id=$1`, [req.params.id]);
    res.json({ message: 'Maintenance closed' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
