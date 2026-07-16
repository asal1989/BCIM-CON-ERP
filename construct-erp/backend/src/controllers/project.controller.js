// src/controllers/project.controller.js
const { query, withTransaction } = require('../config/database');

// Roles that can see every project in the company — kept in sync with
// GLOBAL_ROLES in middleware/projectScope.js (accountant/finance roles need
// company-wide project visibility for Accounts module pages like Customers).
const GLOBAL_ROLES = [
  'super_admin', 'admin', 'managing_director', 'director', 'ceo', 'cfo', 'md',
  'accountant', 'accounts_manager', 'finance_manager',
];

const attachProjectSpend = async (projects) => {
  if (!projects.length) return projects;

  const ids = projects.map((p) => p.id);
  // Mirror Budget Control's actualMap exactly:
  //   receivedMap = RA bills (certified/paid) + SC bills (approved/paid)
  //               + TQS bill line items (cost_head IS NOT NULL) + PO fallback
  //   + advances (sc_advances, tqs_advance_vouchers, tqs_advances,
  //               stores_petty_cash_entries, stores_pc_sc_advances)
  const spend = await query(
    `WITH ra AS (
       SELECT rb.project_id,
         COALESCE(SUM(rbi.current_qty * rbi.rate * (1 + COALESCE(rb.gst_rate, 18) / 100.0)), 0) AS amount
       FROM ra_bill_items rbi
       JOIN ra_bills rb ON rb.id = rbi.ra_bill_id
       WHERE rb.project_id = ANY($1::uuid[]) AND rb.status IN ('certified','paid')
       GROUP BY rb.project_id
     ),
     sc AS (
       SELECT sb.project_id,
         COALESCE(SUM(bi.curr_qty * bi.rate * (1 + COALESCE(sb.gst_pct, 18) / 100.0)), 0) AS amount
       FROM sc_bill_items bi
       JOIN sc_bills sb ON sb.id = bi.bill_id
       WHERE sb.project_id = ANY($1::uuid[]) AND sb.status IN ('approved','paid')
       GROUP BY sb.project_id
     ),
     tqs AS (
       SELECT tb.project_id,
         COALESCE(SUM(li.basic_amount + COALESCE(li.cgst_amt,0) + COALESCE(li.sgst_amt,0) + COALESCE(li.igst_amt,0)), 0) AS amount
       FROM tqs_bill_line_items li
       JOIN tqs_bills tb ON tb.id = li.bill_id
       WHERE tb.project_id = ANY($1::uuid[]) AND tb.is_deleted = FALSE AND li.cost_head IS NOT NULL
       GROUP BY tb.project_id
     ),
     po_fallback AS (
       SELECT po.project_id,
         COALESCE(SUM(li.basic_amount + COALESCE(li.cgst_amt,0) + COALESCE(li.sgst_amt,0) + COALESCE(li.igst_amt,0)), 0) AS amount
       FROM po_items pi
       JOIN purchase_orders po ON po.id = pi.po_id
       JOIN tqs_bill_line_items li ON li.po_item_id = pi.id
       JOIN tqs_bills tb ON tb.id = li.bill_id
       WHERE po.project_id = ANY($1::uuid[])
         AND po.status NOT IN ('rejected','cancelled')
         AND pi.cost_head IS NOT NULL AND li.cost_head IS NULL
         AND tb.is_deleted = FALSE AND tb.workflow_status NOT IN ('rejected')
       GROUP BY po.project_id
     ),
     adv_vouchers AS (
       SELECT project_id, COALESCE(SUM(paid_amount), 0) AS amount
       FROM tqs_advance_vouchers
       WHERE project_id = ANY($1::uuid[]) AND is_deleted = false
         AND status IN ('issued','partial','recovered') AND paid_amount > 0
       GROUP BY project_id
     ),
     tqs_adv AS (
       SELECT project_id, COALESCE(SUM(amount), 0) AS amount
       FROM tqs_advances
       WHERE project_id = ANY($1::uuid[]) AND COALESCE(status,'') NOT IN ('cancelled')
       GROUP BY project_id
     ),
     pc AS (
       SELECT project_id, COALESCE(SUM(amount), 0) AS amount
       FROM stores_petty_cash_entries
       WHERE project_id = ANY($1::uuid[]) AND status = 'Approved'
       GROUP BY project_id
     ),
     sc_adv AS (
       SELECT project_id, COALESCE(SUM(amount), 0) AS amount
       FROM sc_advances
       WHERE project_id = ANY($1::uuid[]) AND status NOT IN ('cancelled')
       GROUP BY project_id
     ),
     store_pc_adv AS (
       SELECT project_id, COALESCE(SUM(amount), 0) AS amount
       FROM stores_pc_sc_advances
       WHERE project_id = ANY($1::uuid[]) AND status != 'cancelled'
       GROUP BY project_id
     )
     SELECT ids.id AS project_id,
       COALESCE(ra.amount, 0)
       + COALESCE(sc.amount, 0)
       + COALESCE(tqs.amount, 0)
       + COALESCE(po_fallback.amount, 0)
       + COALESCE(adv_vouchers.amount, 0)
       + COALESCE(tqs_adv.amount, 0)
       + COALESCE(pc.amount, 0)
       + COALESCE(sc_adv.amount, 0)
       + COALESCE(store_pc_adv.amount, 0)
       AS total_spent
     FROM unnest($1::uuid[]) AS ids(id)
     LEFT JOIN ra           ON ra.project_id           = ids.id
     LEFT JOIN sc           ON sc.project_id           = ids.id
     LEFT JOIN tqs          ON tqs.project_id          = ids.id
     LEFT JOIN po_fallback  ON po_fallback.project_id  = ids.id
     LEFT JOIN adv_vouchers ON adv_vouchers.project_id = ids.id
     LEFT JOIN tqs_adv      ON tqs_adv.project_id      = ids.id
     LEFT JOIN pc           ON pc.project_id           = ids.id
     LEFT JOIN sc_adv       ON sc_adv.project_id       = ids.id
     LEFT JOIN store_pc_adv ON store_pc_adv.project_id = ids.id`,
    [ids]
  );

  const spendByProject = new Map(spend.rows.map((row) => [row.project_id, row.total_spent]));
  return projects.map((project) => ({
    ...project,
    total_spent: spendByProject.get(project.id) || '0',
  }));
};

// GET /api/v1/projects
const getProjects = async (req, res) => {
  try {
    const { status, type, search } = req.query;
    let sql = `
      SELECT p.*,
        pm.name as pm_name, pm.phone as pm_phone,
        se.name as se_name,
        qe.name as qs_name,
        (SELECT COUNT(*) FROM boq_items WHERE project_id = p.id) as boq_count,
        (SELECT COALESCE(SUM(total_amount), 0) FROM invoices WHERE project_id = p.id AND payment_status = 'paid') as amount_collected,
        (SELECT COALESCE(SUM(rbi.current_qty*rbi.rate*(1+COALESCE(rb.gst_rate,18)/100.0)),0) FROM ra_bill_items rbi JOIN ra_bills rb ON rb.id=rbi.ra_bill_id WHERE rb.project_id=p.id AND rb.status IN ('certified','paid'))
        +(SELECT COALESCE(SUM(bi.curr_qty*bi.rate*(1+COALESCE(sb.gst_pct,18)/100.0)),0) FROM sc_bill_items bi JOIN sc_bills sb ON sb.id=bi.bill_id WHERE sb.project_id=p.id AND sb.status IN ('approved','paid'))
        +(SELECT COALESCE(SUM(li.basic_amount+COALESCE(li.cgst_amt,0)+COALESCE(li.sgst_amt,0)+COALESCE(li.igst_amt,0)),0) FROM tqs_bill_line_items li JOIN tqs_bills tb ON tb.id=li.bill_id WHERE tb.project_id=p.id AND tb.is_deleted=FALSE AND li.cost_head IS NOT NULL)
        +(SELECT COALESCE(SUM(li.basic_amount+COALESCE(li.cgst_amt,0)+COALESCE(li.sgst_amt,0)+COALESCE(li.igst_amt,0)),0) FROM po_items pi JOIN purchase_orders po ON po.id=pi.po_id JOIN tqs_bill_line_items li ON li.po_item_id=pi.id JOIN tqs_bills tb ON tb.id=li.bill_id WHERE po.project_id=p.id AND po.status NOT IN ('rejected','cancelled') AND pi.cost_head IS NOT NULL AND li.cost_head IS NULL AND tb.is_deleted=FALSE AND tb.workflow_status NOT IN ('rejected'))
        +(SELECT COALESCE(SUM(paid_amount),0) FROM tqs_advance_vouchers WHERE project_id=p.id AND is_deleted=false AND status IN ('issued','partial','recovered') AND paid_amount>0)
        +(SELECT COALESCE(SUM(amount),0) FROM tqs_advances WHERE project_id=p.id AND COALESCE(status,'') NOT IN ('cancelled'))
        +(SELECT COALESCE(SUM(amount),0) FROM stores_petty_cash_entries WHERE project_id=p.id AND status='Approved')
        +(SELECT COALESCE(SUM(amount),0) FROM sc_advances WHERE project_id=p.id AND status NOT IN ('cancelled'))
        +(SELECT COALESCE(SUM(amount),0) FROM stores_pc_sc_advances WHERE project_id=p.id AND status!='cancelled')
        as total_spent
      FROM projects p
      LEFT JOIN users pm ON p.project_manager_id = pm.id
      LEFT JOIN users se ON p.site_engineer_id = se.id
      LEFT JOIN users qe ON p.qs_engineer_id = qe.id
      WHERE p.company_id = $1 AND p.is_active = true
    `;
    const params = [req.user.company_id];
    let i = 2;

    // Project-level scoping: non-global roles see only assigned projects
    if (!GLOBAL_ROLES.includes(req.user.role)) {
      sql += ` AND (
        p.project_manager_id = $${i} OR p.site_engineer_id = $${i} OR p.qs_engineer_id = $${i}
        OR EXISTS (SELECT 1 FROM project_members pmx WHERE pmx.project_id = p.id AND pmx.user_id = $${i})
      )`;
      params.push(req.user.id);
      i++;
    }

    if (status) { sql += ` AND p.status = $${i++}`; params.push(status); }
    if (type) { sql += ` AND p.type = $${i++}`; params.push(type); }
    if (search) { sql += ` AND p.name ILIKE $${i++}`; params.push(`%${search}%`); }

    sql += ' ORDER BY p.created_at DESC';

    const result = await query(sql, params);
    const projects = await attachProjectSpend(result.rows);
    res.json({ data: projects, count: result.rowCount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// GET /api/v1/projects/:id
const getProject = async (req, res) => {
  try {
    const result = await query(
      `SELECT p.*,
        pm.name as pm_name, pm.email as pm_email, pm.phone as pm_phone,
        se.name as se_name, se.email as se_email,
        qe.name as qs_name,
        (SELECT COALESCE(SUM(amount),0) FROM boq_items WHERE project_id = p.id) as total_boq_value,
        (SELECT COALESCE(SUM(net_payable),0) FROM ra_bills WHERE project_id = p.id AND status = 'certified') as total_certified,
        (SELECT COALESCE(SUM(rbi.current_qty*rbi.rate*(1+COALESCE(rb.gst_rate,18)/100.0)),0) FROM ra_bill_items rbi JOIN ra_bills rb ON rb.id=rbi.ra_bill_id WHERE rb.project_id=p.id AND rb.status IN ('certified','paid'))
        +(SELECT COALESCE(SUM(bi.curr_qty*bi.rate*(1+COALESCE(sb.gst_pct,18)/100.0)),0) FROM sc_bill_items bi JOIN sc_bills sb ON sb.id=bi.bill_id WHERE sb.project_id=p.id AND sb.status IN ('approved','paid'))
        +(SELECT COALESCE(SUM(li.basic_amount+COALESCE(li.cgst_amt,0)+COALESCE(li.sgst_amt,0)+COALESCE(li.igst_amt,0)),0) FROM tqs_bill_line_items li JOIN tqs_bills tb ON tb.id=li.bill_id WHERE tb.project_id=p.id AND tb.is_deleted=FALSE AND li.cost_head IS NOT NULL)
        +(SELECT COALESCE(SUM(li.basic_amount+COALESCE(li.cgst_amt,0)+COALESCE(li.sgst_amt,0)+COALESCE(li.igst_amt,0)),0) FROM po_items pi JOIN purchase_orders po ON po.id=pi.po_id JOIN tqs_bill_line_items li ON li.po_item_id=pi.id JOIN tqs_bills tb ON tb.id=li.bill_id WHERE po.project_id=p.id AND po.status NOT IN ('rejected','cancelled') AND pi.cost_head IS NOT NULL AND li.cost_head IS NULL AND tb.is_deleted=FALSE AND tb.workflow_status NOT IN ('rejected'))
        +(SELECT COALESCE(SUM(paid_amount),0) FROM tqs_advance_vouchers WHERE project_id=p.id AND is_deleted=false AND status IN ('issued','partial','recovered') AND paid_amount>0)
        +(SELECT COALESCE(SUM(amount),0) FROM tqs_advances WHERE project_id=p.id AND COALESCE(status,'') NOT IN ('cancelled'))
        +(SELECT COALESCE(SUM(amount),0) FROM stores_petty_cash_entries WHERE project_id=p.id AND status='Approved')
        +(SELECT COALESCE(SUM(amount),0) FROM sc_advances WHERE project_id=p.id AND status NOT IN ('cancelled'))
        +(SELECT COALESCE(SUM(amount),0) FROM stores_pc_sc_advances WHERE project_id=p.id AND status!='cancelled')
        as total_spent,
        (SELECT COUNT(*) FROM workers WHERE project_id = p.id AND is_active = true) as worker_count,
        (SELECT COUNT(*) FROM incidents WHERE project_id = p.id AND status != 'closed') as open_incidents
       FROM projects p
       LEFT JOIN users pm ON p.project_manager_id = pm.id
       LEFT JOIN users se ON p.site_engineer_id = se.id
       LEFT JOIN users qe ON p.qs_engineer_id = qe.id
       WHERE p.id = $1 AND p.company_id = $2`,
      [req.params.id, req.user.company_id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Project not found.' });

    // Enforce project-level access for non-global roles
    if (!GLOBAL_ROLES.includes(req.user.role)) {
      const access = await query(
        `SELECT 1 FROM project_members WHERE project_id = $1 AND user_id = $2
         UNION
         SELECT 1 FROM projects WHERE id = $1 AND (
           project_manager_id = $2 OR site_engineer_id = $2 OR qs_engineer_id = $2
         )`,
        [req.params.id, req.user.id]
      );
      if (!access.rows[0]) return res.status(403).json({ error: 'You do not have access to this project.' });
    }
    const [project] = await attachProjectSpend([result.rows[0]]);
    res.json(project);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// POST /api/v1/projects
const createProject = async (req, res) => {
  try {
    const {
      project_code, name, type, description,
      client_name, client_gstin, client_pan,
      location, city, state,
      rera_number, nhai_contract, contract_value,
      start_date, end_date,
      project_manager_id, site_engineer_id, qs_engineer_id,
      gst_type
    } = req.body;

    const result = await query(
      `INSERT INTO projects (
        company_id, project_code, name, type, description,
        client_name, client_gstin, client_pan,
        location, city, state,
        rera_number, nhai_contract, contract_value,
        start_date, end_date,
        project_manager_id, site_engineer_id, qs_engineer_id,
        gst_type, status
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,'active')
      RETURNING *`,
      [
        req.user.company_id, project_code, name, type, description,
        client_name, client_gstin, client_pan,
        location, city, state,
        rera_number, nhai_contract, contract_value,
        start_date, end_date,
        project_manager_id, site_engineer_id, qs_engineer_id,
        gst_type || 'intra'
      ]
    );
    res.status(201).json({ message: 'Project created successfully.', data: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Project code already exists.' });
    res.status(500).json({ error: err.message });
  }
};

// PUT /api/v1/projects/:id
const updateProject = async (req, res) => {
  try {
    const fields = ['name', 'type', 'description', 'client_name', 'client_gstin',
      'location', 'city', 'state', 'contract_value', 'start_date', 'end_date',
      'project_manager_id', 'site_engineer_id', 'qs_engineer_id',
      'status', 'progress_pct', 'gst_type', 'rera_number', 'client_advance_received'];

    const updates = [];
    const params = [];
    let i = 1;

    for (const field of fields) {
      if (req.body[field] !== undefined) {
        updates.push(`${field} = $${i++}`);
        params.push(req.body[field]);
      }
    }
    if (!updates.length) return res.status(400).json({ error: 'No fields to update.' });

    params.push(req.params.id, req.user.company_id);
    const result = await query(
      `UPDATE projects SET ${updates.join(', ')}, updated_at = NOW()
       WHERE id = $${i++} AND company_id = $${i} RETURNING *`,
      params
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Project not found.' });
    res.json({ message: 'Project updated.', data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// DELETE /api/v1/projects/:id
const deleteProject = async (req, res) => {
  console.log(`DELETE request for project ${req.params.id} from user ${req.user.id} (Company: ${req.user.company_id})`);
  try {
    const result = await query(
      'UPDATE projects SET is_active = false, updated_at = NOW() WHERE id = $1 AND company_id = $2',
      [req.params.id, req.user.company_id]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Project not found or you are not authorized to delete it.' });
    }
    res.json({ message: 'Project deactivated.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// GET /api/v1/projects/:id/dashboard
const getProjectDashboard = async (req, res) => {
  try {
    const pid = req.params.id;
    const projectCheck = await query(
      'SELECT 1 FROM projects WHERE id = $1 AND company_id = $2',
      [pid, req.user.company_id]
    );

    if (!projectCheck.rows[0]) {
      return res.status(404).json({ error: 'Project not found.' });
    }

    if (!GLOBAL_ROLES.includes(req.user.role)) {
      const access = await query(
        `SELECT 1 FROM project_members WHERE project_id = $1 AND user_id = $2
         UNION
         SELECT 1 FROM projects WHERE id = $1 AND (
           project_manager_id = $2 OR site_engineer_id = $2 OR qs_engineer_id = $2
         )`,
        [pid, req.user.id]
      );
      if (!access.rows[0]) return res.status(403).json({ error: 'You do not have access to this project.' });
    }

    const [boq, billing, workers, incidents, materials] = await Promise.all([
      query(`SELECT COUNT(*) as items, COALESCE(SUM(amount),0) as total_value FROM boq_items WHERE project_id = $1`, [pid]),
      query(`SELECT COALESCE(SUM(gross_amount),0) as billed, COALESCE(SUM(net_payable),0) as certified FROM ra_bills WHERE project_id = $1 AND status = 'certified'`, [pid]),
      query(`SELECT COUNT(*) as total FROM workers WHERE project_id = $1 AND is_active = true`, [pid]),
      query(`SELECT COUNT(*) as open FROM incidents WHERE project_id = $1 AND status != 'closed'`, [pid]),
      query(`SELECT material_name, closing_stock, minimum_level FROM inventory WHERE project_id = $1 AND closing_stock < minimum_level`, [pid])
    ]);

    res.json({
      boq: boq.rows[0],
      billing: billing.rows[0],
      workers: workers.rows[0],
      incidents: incidents.rows[0],
      low_stock_materials: materials.rows
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

module.exports = { getProjects, getProject, createProject, updateProject, deleteProject, getProjectDashboard };
