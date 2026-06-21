// src/routes/audit-log.routes.js — Administration: Audit Log viewer
const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const { query } = require('../config/database');

router.use(authenticate);
router.use(authorize('super_admin', 'admin'));

// GET /audit-log — filterable, paginated activity feed
router.get('/', async (req, res) => {
  try {
    const { user_id, table_name, action, date_from, date_to, search, page = 1, page_size = 50 } = req.query;
    const conditions = ['al.company_id = $1'];
    const params = [req.user.company_id];
    let i = 2;

    if (user_id)    { conditions.push(`al.user_id = $${i++}`);    params.push(user_id); }
    if (table_name) { conditions.push(`al.table_name = $${i++}`); params.push(table_name); }
    if (action)     { conditions.push(`al.action = $${i++}`);     params.push(action); }
    if (date_from)  { conditions.push(`al.created_at >= $${i++}`); params.push(date_from); }
    if (date_to)    { conditions.push(`al.created_at <= $${i++}`); params.push(`${date_to} 23:59:59`); }
    if (search) {
      conditions.push(`(u.name ILIKE $${i} OR al.table_name ILIKE $${i} OR al.action ILIKE $${i})`);
      params.push(`%${search}%`);
      i++;
    }

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const pageSize = Math.min(200, Math.max(1, parseInt(page_size, 10) || 50));
    const offset = (pageNum - 1) * pageSize;

    const countRes = await query(
      `SELECT COUNT(*) AS total FROM audit_logs al LEFT JOIN users u ON u.id = al.user_id WHERE ${conditions.join(' AND ')}`,
      params
    );

    const rowsRes = await query(
      `SELECT al.id, al.action, al.table_name, al.record_id, al.old_values, al.new_values,
              al.ip_address, al.created_at, u.name AS user_name, u.role AS user_role
       FROM audit_logs al
       LEFT JOIN users u ON u.id = al.user_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY al.created_at DESC
       LIMIT $${i++} OFFSET $${i++}`,
      [...params, pageSize, offset]
    );

    res.json({
      data: rowsRes.rows,
      pagination: { page: pageNum, page_size: pageSize, total: parseInt(countRes.rows[0].total, 10) },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /audit-log/tables — distinct table_name values seen, for the filter dropdown
router.get('/tables', async (req, res) => {
  try {
    const r = await query(
      `SELECT DISTINCT table_name FROM audit_logs WHERE company_id = $1 AND table_name IS NOT NULL ORDER BY table_name`,
      [req.user.company_id]
    );
    res.json({ data: r.rows.map((row) => row.table_name) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
