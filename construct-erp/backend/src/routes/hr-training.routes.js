// hr-training.routes.js — Training Management
const express = require('express');
const router  = express.Router();
const { query } = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');

const HR_ROLES = ['super_admin','admin','hr_admin','hr_manager'];
const HR_ALL   = [...HR_ROLES, 'hr', 'manager', 'department_head'];

;(async () => {
  const safe = async sql => { try { await query(sql); } catch(_) {} };
  await safe(`CREATE TABLE IF NOT EXISTS hr_training_programs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL,
    title VARCHAR(200) NOT NULL,
    type VARCHAR(30) DEFAULT 'internal' CHECK (type IN ('internal','external','online','on_the_job')),
    trainer_name VARCHAR(200),
    trainer_org VARCHAR(200),
    venue VARCHAR(300),
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    total_hours NUMERIC(6,1),
    cost_per_head NUMERIC(12,2) DEFAULT 0,
    max_participants INT,
    target_department VARCHAR(100),
    target_designation VARCHAR(100),
    description TEXT,
    status VARCHAR(20) DEFAULT 'planned' CHECK (status IN ('planned','ongoing','completed','cancelled')),
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`);
  await safe(`CREATE TABLE IF NOT EXISTS hr_training_participants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    program_id UUID NOT NULL REFERENCES hr_training_programs(id) ON DELETE CASCADE,
    company_id UUID NOT NULL,
    employee_id UUID NOT NULL REFERENCES users(id),
    nominated_by UUID REFERENCES users(id),
    attended BOOLEAN DEFAULT FALSE,
    score NUMERIC(5,2),
    certificate_issued BOOLEAN DEFAULT FALSE,
    certificate_url TEXT,
    feedback TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(program_id, employee_id)
  )`);
})();

router.use(authenticate);

// ── Programs ──────────────────────────────────────────────────────────────────
router.get('/', authorize(...HR_ALL), async (req, res) => {
  const { status, year } = req.query;
  const conds = ['t.company_id=$1']; const params=[req.user.company_id]; let i=2;
  if (status) { conds.push(`t.status=$${i++}`); params.push(status); }
  if (year)   { conds.push(`EXTRACT(YEAR FROM t.start_date)=$${i++}`); params.push(year); }
  const { rows } = await query(
    `SELECT t.*,
       (SELECT COUNT(*) FROM hr_training_participants p WHERE p.program_id=t.id) as participant_count,
       (SELECT COUNT(*) FROM hr_training_participants p WHERE p.program_id=t.id AND p.attended=TRUE) as attended_count
     FROM hr_training_programs t
     WHERE ${conds.join(' AND ')} ORDER BY t.start_date DESC`,
    params
  );
  res.json({ data: rows });
});

router.get('/:id', authorize(...HR_ALL), async (req, res) => {
  const { rows } = await query(
    `SELECT t.* FROM hr_training_programs t WHERE t.id=$1 AND t.company_id=$2`,
    [req.params.id, req.user.company_id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Not found' });
  const { rows: participants } = await query(
    `SELECT p.*, e.name AS full_name, e.employee_code AS emp_code, e.department, e.designation
     FROM hr_training_participants p JOIN users e ON e.id=p.employee_id
     WHERE p.program_id=$1 ORDER BY e.name`,
    [req.params.id]
  );
  res.json({ data: { ...rows[0], participants } });
});

router.post('/', authorize(...HR_ROLES), async (req, res) => {
  const d = req.body;
  const { rows } = await query(
    `INSERT INTO hr_training_programs(company_id,title,type,trainer_name,trainer_org,venue,
       start_date,end_date,total_hours,cost_per_head,max_participants,target_department,
       target_designation,description,status,created_by)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING *`,
    [req.user.company_id,d.title,d.type||'internal',d.trainer_name,d.trainer_org,d.venue,
     d.start_date,d.end_date,d.total_hours,d.cost_per_head||0,d.max_participants,
     d.target_department,d.target_designation,d.description,d.status||'planned',req.user.id]
  );
  res.json({ data: rows[0] });
});

router.put('/:id', authorize(...HR_ROLES), async (req, res) => {
  const d = req.body;
  const { rows } = await query(
    `UPDATE hr_training_programs SET title=$1,type=$2,trainer_name=$3,trainer_org=$4,venue=$5,
       start_date=$6,end_date=$7,total_hours=$8,cost_per_head=$9,max_participants=$10,
       target_department=$11,target_designation=$12,description=$13,status=$14
     WHERE id=$15 AND company_id=$16 RETURNING *`,
    [d.title,d.type,d.trainer_name,d.trainer_org,d.venue,
     d.start_date,d.end_date,d.total_hours,d.cost_per_head||0,d.max_participants,
     d.target_department,d.target_designation,d.description,d.status,
     req.params.id, req.user.company_id]
  );
  res.json({ data: rows[0] });
});

// ── Participants ──────────────────────────────────────────────────────────────
router.post('/:id/participants', authorize(...HR_ROLES), async (req, res) => {
  const { employee_ids } = req.body;
  const inserted = [];
  for (const eid of (employee_ids || [])) {
    const { rows } = await query(
      `INSERT INTO hr_training_participants(program_id,company_id,employee_id,nominated_by)
       VALUES($1,$2,$3,$4) ON CONFLICT(program_id,employee_id) DO NOTHING RETURNING *`,
      [req.params.id, req.user.company_id, eid, req.user.id]
    );
    if (rows[0]) inserted.push(rows[0]);
  }
  res.json({ data: inserted });
});

router.patch('/:id/participants/:pid', authorize(...HR_ROLES), async (req, res) => {
  const { attended, score, certificate_issued, certificate_url, feedback } = req.body;
  const { rows } = await query(
    `UPDATE hr_training_participants SET attended=$1,score=$2,certificate_issued=$3,certificate_url=$4,feedback=$5
     WHERE id=$6 AND program_id=$7 RETURNING *`,
    [attended, score, certificate_issued, certificate_url, feedback, req.params.pid, req.params.id]
  );
  res.json({ data: rows[0] });
});

router.delete('/:id/participants/:pid', authorize(...HR_ROLES), async (req, res) => {
  await query(`DELETE FROM hr_training_participants WHERE id=$1 AND program_id=$2`,[req.params.pid,req.params.id]);
  res.json({ success: true });
});

// Employee training history
router.get('/employee/:empId/history', authorize(...HR_ALL), async (req, res) => {
  const { rows } = await query(
    `SELECT p.title, p.type, p.start_date, p.end_date, t.attended, t.score, t.certificate_issued
     FROM hr_training_participants t JOIN hr_training_programs p ON p.id=t.program_id
     WHERE t.employee_id=$1 AND t.company_id=$2 ORDER BY p.start_date DESC`,
    [req.params.empId, req.user.company_id]
  );
  res.json({ data: rows });
});

module.exports = router;
