// src/routes/search.routes.js — Global record browser search
const express = require('express');
const router  = express.Router();
const { query } = require('../config/database');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);

router.get('/', async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    if (q.length < 2) return res.json({ data: [] });

    const cid  = req.user.company_id;
    const like = `%${q}%`;
    const L    = 5; // max results per entity type

    const [
      vendorsR, projectsR, posR, billsR, employeesR,
      ignsR, minsR, vosR, raBillsR, equipmentR, assetsR,
    ] = await Promise.allSettled([
      // 1. Vendors
      query(
        `SELECT id, name, contact_person, gst_number, status
         FROM vendors
         WHERE company_id=$1 AND (name ILIKE $2 OR gst_number ILIKE $2 OR contact_person ILIKE $2)
         ORDER BY name LIMIT $3`,
        [cid, like, L]
      ),
      // 2. Projects
      query(
        `SELECT id, name, project_code, client_name, status
         FROM projects
         WHERE company_id=$1 AND (name ILIKE $2 OR project_code ILIKE $2 OR client_name ILIKE $2)
         ORDER BY name LIMIT $3`,
        [cid, like, L]
      ),
      // 3. Purchase Orders
      query(
        `SELECT id, po_number, vendor_name, grand_total, status
         FROM purchase_orders
         WHERE company_id=$1 AND (po_number ILIKE $2 OR vendor_name ILIKE $2)
         ORDER BY created_at DESC LIMIT $3`,
        [cid, like, L]
      ),
      // 4. Bills (TQS bill tracker)
      query(
        `SELECT id, sl_number, vendor_name, inv_number, total_amount, workflow_status
         FROM tqs_bills
         WHERE company_id=$1 AND is_deleted=FALSE
           AND (sl_number ILIKE $2 OR inv_number ILIKE $2 OR vendor_name ILIKE $2)
         ORDER BY created_at DESC LIMIT $3`,
        [cid, like, L]
      ),
      // 5. Employees
      query(
        `SELECT id, name, employee_code, designation, department
         FROM users
         WHERE company_id=$1 AND is_active=TRUE
           AND (name ILIKE $2 OR employee_code ILIKE $2 OR email ILIKE $2)
         ORDER BY name LIMIT $3`,
        [cid, like, L]
      ),
      // 6. Inward Goods Notes
      query(
        `SELECT n.id, n.ign_number, n.supplier_name, n.status, p.name AS project_name
         FROM ign n
         JOIN projects p ON p.id = n.project_id
         WHERE p.company_id=$1 AND (n.ign_number ILIKE $2 OR n.supplier_name ILIKE $2)
         ORDER BY n.created_at DESC LIMIT $3`,
        [cid, like, L]
      ),
      // 7. Material Issue Notes
      query(
        `SELECT m.id, m.min_number, m.issued_to, m.status, p.name AS project_name
         FROM material_issue_notes m
         JOIN projects p ON p.id = m.project_id
         WHERE p.company_id=$1 AND (m.min_number ILIKE $2 OR m.issued_to ILIKE $2)
         ORDER BY m.created_at DESC LIMIT $3`,
        [cid, like, L]
      ),
      // 8. Variation Orders
      query(
        `SELECT vo.id, vo.vo_number, vo.description, vo.status,
                vo.total_variation_amount, p.name AS project_name
         FROM variation_orders vo
         JOIN projects p ON p.id = vo.project_id
         WHERE p.company_id=$1 AND (vo.vo_number ILIKE $2 OR vo.description ILIKE $2)
         ORDER BY vo.created_at DESC LIMIT $3`,
        [cid, like, L]
      ),
      // 9. RA Bills
      query(
        `SELECT rb.id, rb.ra_number, rb.status, p.name AS project_name
         FROM ra_bills rb
         JOIN projects p ON p.id = rb.project_id
         WHERE p.company_id=$1 AND (rb.ra_number ILIKE $2)
         ORDER BY rb.created_at DESC LIMIT $3`,
        [cid, like, L]
      ),
      // 10. Plant & Machinery
      query(
        `SELECT id, code, name, reg_number, status
         FROM pm_equipment
         WHERE company_id=$1 AND is_deleted=FALSE
           AND (name ILIKE $2 OR code ILIKE $2 OR reg_number ILIKE $2)
         ORDER BY code LIMIT $3`,
        [cid, like, L]
      ),
      // 11. Assets
      query(
        `SELECT id, asset_code, asset_name, asset_type, status
         FROM assets
         WHERE company_id=$1 AND (asset_name ILIKE $2 OR asset_code ILIKE $2)
         ORDER BY asset_code LIMIT $3`,
        [cid, like, L]
      ),
    ]);

    const ok = (r) => (r.status === 'fulfilled' ? r.value.rows : []);
    const fmt = (n) => (n ? `₹${Math.round(Number(n)).toLocaleString('en-IN')}` : '');

    const results = [
      ...ok(vendorsR).map(r => ({
        type: 'vendor', label: r.name,
        sub: [r.contact_person, r.gst_number].filter(Boolean).join(' • '),
        status: r.status, to: '/procurement/vendors',
      })),
      ...ok(projectsR).map(r => ({
        type: 'project', label: r.name,
        sub: [r.project_code, r.client_name].filter(Boolean).join(' • '),
        status: r.status, to: `/projects/${r.id}`,
      })),
      ...ok(posR).map(r => ({
        type: 'po', label: r.po_number,
        sub: [r.vendor_name, fmt(r.grand_total)].filter(Boolean).join(' • '),
        status: r.status, to: '/procurement/po',
      })),
      ...ok(billsR).map(r => ({
        type: 'bill', label: r.sl_number || r.inv_number,
        sub: [r.vendor_name, fmt(r.total_amount)].filter(Boolean).join(' • '),
        status: r.workflow_status, to: `/tqs/bills/${r.id}`,
      })),
      ...ok(employeesR).map(r => ({
        type: 'employee', label: r.name,
        sub: [r.employee_code, r.designation || r.department].filter(Boolean).join(' • '),
        status: null, to: `/hr-admin/employee/${r.id}`,
      })),
      ...ok(ignsR).map(r => ({
        type: 'ign', label: r.ign_number,
        sub: [r.supplier_name, r.project_name].filter(Boolean).join(' • '),
        status: r.status, to: '/stores/ign',
      })),
      ...ok(minsR).map(r => ({
        type: 'min', label: r.min_number,
        sub: [r.issued_to, r.project_name].filter(Boolean).join(' • '),
        status: r.status, to: '/stores/issue',
      })),
      ...ok(vosR).map(r => ({
        type: 'variation', label: r.vo_number,
        sub: [r.description, r.project_name].filter(Boolean).join(' • '),
        status: r.status, to: '/qs/variations',
      })),
      ...ok(raBillsR).map(r => ({
        type: 'ra', label: r.ra_number,
        sub: r.project_name || '',
        status: r.status, to: `/qs/ra-bills/${r.id}`,
      })),
      ...ok(equipmentR).map(r => ({
        type: 'equipment', label: `${r.code} — ${r.name}`,
        sub: r.reg_number || '',
        status: r.status, to: '/plant',
      })),
      ...ok(assetsR).map(r => ({
        type: 'asset', label: r.asset_name,
        sub: [r.asset_code, r.asset_type].filter(Boolean).join(' • '),
        status: r.status, to: '/assets',
      })),
    ];

    res.json({ data: results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
