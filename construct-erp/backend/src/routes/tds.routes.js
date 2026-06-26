// src/routes/tds.routes.js
// TDS Register — client TDS deducted on RA bills (Section 194C, deductee view)
const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { query } = require('../config/database');

router.use(authenticate);

// GET /tds?project_id=xxx — combined TDS register (deducted by us + deducted by client)
// project_id is optional — when provided only that project's records are returned.
router.get('/', async (req, res) => {
  try {
    const cid = req.user.company_id;
    const pid = req.query.project_id || null;

    const outgoing = await query(
      `SELECT
         pay.id,
         pay.entity_name                         AS payee_name,
         COALESCE(pay.payment_type, 'Vendor')    AS payee_type,
         pay.entity_pan                          AS pan,
         '194C'                                  AS section,
         p.name                                  AS project_name,
         pay.amount                              AS invoice_amount,
         2                                       AS tds_rate,
         pay.tds_deducted                        AS tds_amount,
         pay.net_amount                          AS net_paid,
         pay.payment_date,
         pay.payment_mode,
         pay.reference_number                    AS challan_number,
         false                                   AS deposited,
         'outgoing'                              AS tds_direction,
         pay.created_at
       FROM payments pay
       JOIN projects p ON pay.project_id = p.id
       WHERE p.company_id = $1
         AND pay.tds_deducted > 0
         AND ($2::uuid IS NULL OR pay.project_id = $2::uuid)
       ORDER BY pay.payment_date DESC`,
      [cid, pid]
    );

    const incoming = await query(
      `SELECT
         rb.id,
         rb.contractor_name                      AS payee_name,
         'Client'                                AS payee_type,
         rb.contractor_pan                       AS pan,
         '194C'                                  AS section,
         p.name                                  AS project_name,
         rb.gross_amount                         AS invoice_amount,
         rb.tds_rate,
         rb.client_tds_amount                    AS tds_amount,
         rb.amount_received                      AS net_paid,
         rb.payment_date,
         rb.payment_mode,
         rb.payment_ref                          AS challan_number,
         false                                   AS deposited,
         'incoming'                              AS tds_direction,
         rb.updated_at                           AS created_at
       FROM ra_bills rb
       JOIN projects p ON rb.project_id = p.id
       WHERE p.company_id = $1
         AND rb.status = 'paid'
         AND rb.client_tds_amount > 0
         AND ($2::uuid IS NULL OR rb.project_id = $2::uuid)
       ORDER BY rb.payment_date DESC`,
      [cid, pid]
    );

    res.json({ outgoing: outgoing.rows, incoming: incoming.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /tds/:id — not applicable for auto-generated entries; kept for API compatibility
router.delete('/:id', async (req, res) => {
  res.status(400).json({ error: 'Client TDS entries are auto-generated from RA bill payments and cannot be deleted directly.' });
});

module.exports = router;
