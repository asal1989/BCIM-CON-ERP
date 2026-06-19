// hr-travel.routes.js — Travel Requests & Reimbursements
const express = require('express');
const router  = express.Router();
const { query } = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const HR_ROLES = ['super_admin','admin','hr_admin','hr_manager'];
const HR_ALL   = [...HR_ROLES, 'hr', 'manager', 'department_head', 'employee'];

const uploadDir = path.join(__dirname, '../../../uploads/hr-travel');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, uploadDir),
  filename:    (_, f, cb)  => cb(null, `${Date.now()}-${f.originalname}`)
});
const upload = multer({ storage, limits: { fileSize: 5*1024*1024 } });

;(async () => {
  const safe = async sql => { try { await query(sql); } catch(_) {} };
  await safe(`CREATE TABLE IF NOT EXISTS hr_travel_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL,
    employee_id UUID NOT NULL REFERENCES users(id),
    purpose TEXT NOT NULL,
    from_date DATE NOT NULL,
    to_date DATE NOT NULL,
    from_city VARCHAR(200),
    to_city VARCHAR(200),
    mode VARCHAR(30) DEFAULT 'train'
      CHECK (mode IN ('air','train','bus','own_vehicle','cab','others')),
    travel_class VARCHAR(30),
    advance_requested NUMERIC(12,2) DEFAULT 0,
    advance_approved NUMERIC(12,2) DEFAULT 0,
    advance_paid_on DATE,
    actual_expense NUMERIC(12,2) DEFAULT 0,
    balance_payable NUMERIC(12,2) DEFAULT 0,
    bill_url TEXT,
    project_id UUID,
    cost_center VARCHAR(100),
    approved_by UUID REFERENCES users(id),
    approved_at TIMESTAMPTZ,
    remarks TEXT,
    status VARCHAR(20) DEFAULT 'pending'
      CHECK (status IN ('pending','approved','rejected','advance_paid','settled','cancelled')),
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`);
})();

router.use(authenticate);

router.get('/', authorize(...HR_ALL), async (req, res) => {
  const { employee_id, status, month } = req.query;
  const conds = ['t.company_id=$1']; const params=[req.user.company_id]; let i=2;
  if (employee_id) { conds.push(`t.employee_id=$${i++}`); params.push(employee_id); }
  if (status)      { conds.push(`t.status=$${i++}`); params.push(status); }
  if (month)       { conds.push(`to_char(t.from_date,'YYYY-MM')=$${i++}`); params.push(month); }
  const { rows } = await query(
    `SELECT t.*, e.name AS full_name, e.employee_code AS emp_code, e.department,
            u.name as approved_by_name
     FROM hr_travel_requests t
     JOIN users e ON e.id=t.employee_id
     LEFT JOIN users u ON u.id=t.approved_by
     WHERE ${conds.join(' AND ')} ORDER BY t.from_date DESC`,
    params
  );
  res.json({ data: rows });
});

router.post('/', authorize(...HR_ALL), upload.single('bill'), async (req, res) => {
  const d = req.body;
  const bill_url = req.file ? `/uploads/hr-travel/${req.file.filename}` : null;
  const { rows } = await query(
    `INSERT INTO hr_travel_requests(company_id,employee_id,purpose,from_date,to_date,
       from_city,to_city,mode,travel_class,advance_requested,project_id,cost_center,
       remarks,bill_url,created_by)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,
    [req.user.company_id,d.employee_id||req.user.employee_id,d.purpose,d.from_date,d.to_date,
     d.from_city,d.to_city,d.mode||'train',d.travel_class,d.advance_requested||0,
     d.project_id||null,d.cost_center,d.remarks,bill_url,req.user.id]
  );
  res.json({ data: rows[0] });
});

router.put('/:id', authorize(...HR_ALL), upload.single('bill'), async (req, res) => {
  const d = req.body;
  const bill_url = req.file ? `/uploads/hr-travel/${req.file.filename}` : undefined;
  const { rows } = await query(
    `UPDATE hr_travel_requests SET purpose=$1,from_date=$2,to_date=$3,from_city=$4,to_city=$5,
       mode=$6,travel_class=$7,advance_requested=$8,project_id=$9,cost_center=$10,remarks=$11,
       ${bill_url ? 'bill_url=$12,' : ''} updated_at=NOW()
     WHERE id=${bill_url ? '$13' : '$12'} AND company_id=${bill_url ? '$14' : '$13'} AND status='pending' RETURNING *`,
    bill_url
      ? [d.purpose,d.from_date,d.to_date,d.from_city,d.to_city,d.mode,d.travel_class,d.advance_requested||0,d.project_id||null,d.cost_center,d.remarks,bill_url,req.params.id,req.user.company_id]
      : [d.purpose,d.from_date,d.to_date,d.from_city,d.to_city,d.mode,d.travel_class,d.advance_requested||0,d.project_id||null,d.cost_center,d.remarks,req.params.id,req.user.company_id]
  );
  res.json({ data: rows[0] });
});

router.patch('/:id/approve', authorize(...HR_ROLES), async (req, res) => {
  const { advance_approved } = req.body;
  const { rows } = await query(
    `UPDATE hr_travel_requests SET status='approved',advance_approved=$1,approved_by=$2,approved_at=NOW()
     WHERE id=$3 AND company_id=$4 RETURNING *`,
    [advance_approved||0, req.user.id, req.params.id, req.user.company_id]
  );
  res.json({ data: rows[0] });
});

router.patch('/:id/reject', authorize(...HR_ROLES), async (req, res) => {
  const { remarks } = req.body;
  const { rows } = await query(
    `UPDATE hr_travel_requests SET status='rejected',remarks=COALESCE($1,remarks),approved_by=$2,approved_at=NOW()
     WHERE id=$3 AND company_id=$4 RETURNING *`,
    [remarks, req.user.id, req.params.id, req.user.company_id]
  );
  res.json({ data: rows[0] });
});

router.patch('/:id/settle', authorize(...HR_ROLES), upload.single('bill'), async (req, res) => {
  const { actual_expense } = req.body;
  const bill_url = req.file ? `/uploads/hr-travel/${req.file.filename}` : null;
  const { rows: [cur] } = await query(`SELECT * FROM hr_travel_requests WHERE id=$1`,[req.params.id]);
  const balance = parseFloat(actual_expense||0) - parseFloat(cur?.advance_approved||0);
  const { rows } = await query(
    `UPDATE hr_travel_requests SET status='settled',actual_expense=$1,balance_payable=$2,
       ${bill_url ? 'bill_url=$3,' : ''} updated_at=NOW()
     WHERE id=${bill_url ? '$4' : '$3'} AND company_id=${bill_url ? '$5' : '$4'} RETURNING *`,
    bill_url
      ? [actual_expense||0, balance, bill_url, req.params.id, req.user.company_id]
      : [actual_expense||0, balance, req.params.id, req.user.company_id]
  );
  res.json({ data: rows[0] });
});

module.exports = router;
