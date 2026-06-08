// src/routes/itTicket.routes.js
const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { query } = require('../config/database');
const { notifyTicketRaised, notifyTicketResolved } = require('../services/notif.helper');
router.use(authenticate);

const SLA_HOURS = { critical: { response: 4, resolve: 8 }, high: { response: 8, resolve: 24 }, medium: { response: 24, resolve: 48 }, low: { response: 48, resolve: 120 } };

router.get('/', async (req, res) => {
  const { status, priority, project_id } = req.query;
  let sql = `SELECT t.*,u1.name as raised_by_name,u2.name as assigned_to_name,p.name as project_name
             FROM it_tickets t LEFT JOIN users u1 ON t.raised_by=u1.id
             LEFT JOIN users u2 ON t.assigned_to=u2.id LEFT JOIN projects p ON t.project_id=p.id
             WHERE u1.company_id=$1`;
  const params=[req.user.company_id]; let i=2;
  if (status)     { sql+=` AND t.status=$${i++}`; params.push(status); }
  if (priority)   { sql+=` AND t.priority=$${i++}`; params.push(priority); }
  if (project_id) { sql+=` AND t.project_id=$${i++}`; params.push(project_id); }
  sql+=' ORDER BY CASE t.priority WHEN \'critical\' THEN 1 WHEN \'high\' THEN 2 WHEN \'medium\' THEN 3 ELSE 4 END, t.created_at DESC';
  res.json({ data: (await query(sql,params)).rows });
});

router.post('/', async (req, res) => {
  const { category, priority='medium', subject, description, project_id, it_asset_id } = req.body;
  const num = `T-${String(Date.now()).slice(-6)}`;
  const sla = SLA_HOURS[priority];
  const r = await query(
    `INSERT INTO it_tickets (ticket_number,raised_by,category,priority,subject,description,project_id,it_asset_id,sla_response_hours,sla_resolve_hours,status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'open') RETURNING *`,
    [num,req.user.id,category,priority,subject,description,project_id,it_asset_id,sla.response,sla.resolve]
  );
  // Notify IT admin about new ticket
  notifyTicketRaised(req.user.company_id, r.rows[0], req.user.name);
  res.status(201).json({ data: r.rows[0] });
});

router.patch('/:id', async (req, res) => {
  const { status, assigned_to, resolution_notes } = req.body;
  const updates = ['updated_at=NOW()'];
  const params = []; let i=1;
  if (status)           { updates.push(`status=$${i++}`); params.push(status); }
  if (assigned_to)      { updates.push(`assigned_to=$${i++}`); params.push(assigned_to); }
  if (resolution_notes) { updates.push(`resolution_notes=$${i++}`); params.push(resolution_notes); }
  if (status === 'resolved') { updates.push(`resolved_at=NOW()`); }
  if (status === 'in_progress') {
    updates.push('first_response_at=COALESCE(first_response_at, NOW())');
  }
  params.push(req.params.id);
  const r = await query(`UPDATE it_tickets SET ${updates.join(',')} WHERE id=$${i} RETURNING *`, params);
  res.json({ data: r.rows[0] });
});

router.patch('/:id/resolve', async (req, res) => {
  const { resolution_notes } = req.body;
  const r = await query(
    'UPDATE it_tickets SET status=$1,resolved_at=NOW(),resolution_notes=$2,updated_at=NOW() WHERE id=$3 RETURNING *',
    ['resolved',resolution_notes,req.params.id]
  );
  if (r.rows.length) notifyTicketResolved(req.user.company_id, r.rows[0], r.rows[0].raised_by, req.user.name);
  res.json({ data: r.rows[0] });
});

// SLA performance report
router.get('/sla-report', async (req, res) => {
  const r = await query(
    `SELECT priority,
       COUNT(*) as total,
       COUNT(*) FILTER (WHERE status='resolved' AND resolved_at <= created_at + (sla_resolve_hours||' hours')::interval) as within_sla,
       COUNT(*) FILTER (WHERE status IN ('open','in_progress') AND NOW() > created_at + (sla_resolve_hours||' hours')::interval) as breached,
       AVG(EXTRACT(EPOCH FROM (resolved_at-created_at))/3600) FILTER (WHERE status='resolved') as avg_resolve_hours
     FROM it_tickets t JOIN users u ON t.raised_by=u.id WHERE u.company_id=$1
     GROUP BY priority`,
    [req.user.company_id]
  );
  res.json({ data: r.rows });
});

module.exports = router;
