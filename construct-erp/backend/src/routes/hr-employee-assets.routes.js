// hr-employee-assets.routes.js — Asset Assignment to Employees
const express = require('express');
const router  = express.Router();
const { query } = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');

const HR_ROLES = ['super_admin','admin','hr_admin','hr_manager'];
const HR_ALL   = [...HR_ROLES, 'hr', 'manager'];

;(async () => {
  const safe = async sql => { try { await query(sql); } catch(_) {} };
  await safe(`CREATE TABLE IF NOT EXISTS hr_employee_assets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL,
    employee_id UUID NOT NULL REFERENCES users(id),
    asset_name VARCHAR(200) NOT NULL,
    asset_code VARCHAR(100),
    category VARCHAR(50) DEFAULT 'other'
      CHECK (category IN ('laptop','mobile','sim_card','vehicle','tools','uniform','safety_gear','access_card','other')),
    serial_number VARCHAR(200),
    assigned_on DATE NOT NULL DEFAULT CURRENT_DATE,
    return_expected DATE,
    returned_on DATE,
    condition_at_issue VARCHAR(20) DEFAULT 'good' CHECK (condition_at_issue IN ('new','good','fair','poor')),
    condition_at_return VARCHAR(20) CHECK (condition_at_return IN ('good','fair','poor','damaged','lost')),
    asset_value NUMERIC(12,2) DEFAULT 0,
    notes TEXT,
    status VARCHAR(20) DEFAULT 'assigned' CHECK (status IN ('assigned','returned','lost','damaged')),
    assigned_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`);
})();

router.use(authenticate);

router.get('/', authorize(...HR_ALL), async (req, res) => {
  const { employee_id, status, category } = req.query;
  const conds = ['a.company_id=$1']; const params=[req.user.company_id]; let i=2;
  if (employee_id) { conds.push(`a.employee_id=$${i++}`); params.push(employee_id); }
  if (status)      { conds.push(`a.status=$${i++}`); params.push(status); }
  if (category)    { conds.push(`a.category=$${i++}`); params.push(category); }
  const { rows } = await query(
    `SELECT a.*, e.name AS full_name, e.employee_code AS emp_code, e.department, e.designation
     FROM hr_employee_assets a JOIN users e ON e.id=a.employee_id
     WHERE ${conds.join(' AND ')} ORDER BY a.assigned_on DESC`,
    params
  );
  res.json({ data: rows });
});

router.post('/', authorize(...HR_ROLES), async (req, res) => {
  const d = req.body;
  const { rows } = await query(
    `INSERT INTO hr_employee_assets(company_id,employee_id,asset_name,asset_code,category,serial_number,
       assigned_on,return_expected,condition_at_issue,asset_value,notes,assigned_by)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
    [req.user.company_id,d.employee_id,d.asset_name,d.asset_code,d.category||'other',
     d.serial_number,d.assigned_on||new Date().toISOString().split('T')[0],
     d.return_expected||null,d.condition_at_issue||'good',d.asset_value||0,d.notes,req.user.id]
  );
  res.json({ data: rows[0] });
});

router.put('/:id', authorize(...HR_ROLES), async (req, res) => {
  const d = req.body;
  const { rows } = await query(
    `UPDATE hr_employee_assets SET asset_name=$1,asset_code=$2,category=$3,serial_number=$4,
       return_expected=$5,condition_at_issue=$6,asset_value=$7,notes=$8,updated_at=NOW()
     WHERE id=$9 AND company_id=$10 RETURNING *`,
    [d.asset_name,d.asset_code,d.category,d.serial_number,d.return_expected||null,
     d.condition_at_issue,d.asset_value||0,d.notes,req.params.id,req.user.company_id]
  );
  res.json({ data: rows[0] });
});

router.patch('/:id/return', authorize(...HR_ROLES), async (req, res) => {
  const { returned_on, condition_at_return, notes } = req.body;
  const { rows } = await query(
    `UPDATE hr_employee_assets SET returned_on=$1,condition_at_return=$2,
       notes=COALESCE($3,notes),status='returned',updated_at=NOW()
     WHERE id=$4 AND company_id=$5 RETURNING *`,
    [returned_on||new Date().toISOString().split('T')[0], condition_at_return, notes, req.params.id, req.user.company_id]
  );
  res.json({ data: rows[0] });
});

router.delete('/:id', authorize(...HR_ROLES), async (req, res) => {
  await query(`DELETE FROM hr_employee_assets WHERE id=$1 AND company_id=$2`,[req.params.id,req.user.company_id]);
  res.json({ success: true });
});

// Assets held by an employee (used in employee detail page)
router.get('/by-employee/:empId', authorize(...HR_ALL), async (req, res) => {
  const { rows } = await query(
    `SELECT * FROM hr_employee_assets WHERE employee_id=$1 AND company_id=$2 ORDER BY assigned_on DESC`,
    [req.params.empId, req.user.company_id]
  );
  res.json({ data: rows });
});

module.exports = router;
