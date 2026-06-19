// hr-letters.routes.js — Letter Templates & Generation
const express = require('express');
const router  = express.Router();
const { query } = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');

const HR_ROLES = ['super_admin','admin','hr_admin','hr_manager'];
const HR_ALL   = [...HR_ROLES, 'hr'];

const DEFAULT_TEMPLATES = [
  {
    type: 'offer',
    name: 'Offer Letter',
    subject: 'Offer of Employment – {{designation}} at {{company_name}}',
    body_html: `<p>Dear <strong>{{full_name}}</strong>,</p>
<p>We are pleased to offer you the position of <strong>{{designation}}</strong> in the <strong>{{department}}</strong> department at <strong>{{company_name}}</strong>.</p>
<p><strong>Date of Joining:</strong> {{date_of_joining}}<br>
<strong>CTC:</strong> ₹{{ctc_annual}} per annum<br>
<strong>Probation Period:</strong> 6 months</p>
<p>Please sign and return a copy of this letter as acceptance of this offer.</p>
<p>Yours sincerely,<br><strong>HR Department</strong><br>{{company_name}}</p>`
  },
  {
    type: 'appointment',
    name: 'Appointment Letter',
    subject: 'Appointment Letter – {{designation}}',
    body_html: `<p>Dear <strong>{{full_name}}</strong>,</p>
<p>This is to confirm your appointment as <strong>{{designation}}</strong> in <strong>{{department}}</strong> effective <strong>{{date_of_joining}}</strong>.</p>
<p><strong>Employee ID:</strong> {{employee_id}}<br>
<strong>Basic Salary:</strong> ₹{{basic_salary}} per month</p>
<p>You are required to comply with all company policies and procedures. This appointment is subject to satisfactory completion of the probation period.</p>
<p>Yours sincerely,<br><strong>HR Department</strong><br>{{company_name}}</p>`
  },
  {
    type: 'increment',
    name: 'Increment Letter',
    subject: 'Salary Revision Letter',
    body_html: `<p>Dear <strong>{{full_name}}</strong>,</p>
<p>We are pleased to inform you that your salary has been revised with effect from <strong>{{effective_date}}</strong>.</p>
<p><strong>Previous Basic:</strong> ₹{{old_basic}}<br>
<strong>Revised Basic:</strong> ₹{{new_basic}}<br>
<strong>Increment %:</strong> {{increment_pct}}%</p>
<p>This revision is in recognition of your contribution and performance.</p>
<p>Yours sincerely,<br><strong>HR Department</strong><br>{{company_name}}</p>`
  },
  {
    type: 'relieving',
    name: 'Relieving Letter',
    subject: 'Relieving Letter',
    body_html: `<p>Dear <strong>{{full_name}}</strong>,</p>
<p>This is to certify that you have been relieved from your position as <strong>{{designation}}</strong> in <strong>{{department}}</strong> effective <strong>{{last_working_day}}</strong>.</p>
<p>You joined us on <strong>{{date_of_joining}}</strong> and have served for <strong>{{years_of_service}}</strong>.</p>
<p>We wish you the best in your future endeavours.</p>
<p>Yours sincerely,<br><strong>HR Department</strong><br>{{company_name}}</p>`
  },
  {
    type: 'experience',
    name: 'Experience Certificate',
    subject: 'Experience Certificate',
    body_html: `<p>To Whom It May Concern,</p>
<p>This is to certify that <strong>{{full_name}}</strong> was employed with us as <strong>{{designation}}</strong> in the <strong>{{department}}</strong> department from <strong>{{date_of_joining}}</strong> to <strong>{{last_working_day}}</strong>.</p>
<p>During this period, {{full_name}} demonstrated good conduct and dedication. We wish them the very best.</p>
<p>Yours sincerely,<br><strong>HR Department</strong><br>{{company_name}}</p>`
  },
  {
    type: 'warning',
    name: 'Warning Letter',
    subject: 'Warning Letter – {{subject_matter}}',
    body_html: `<p>Dear <strong>{{full_name}}</strong>,</p>
<p>This letter serves as a formal warning regarding <strong>{{subject_matter}}</strong> on <strong>{{incident_date}}</strong>.</p>
<p>{{incident_details}}</p>
<p>You are advised to ensure such incidents do not recur. A recurrence may lead to disciplinary action including termination.</p>
<p>Please acknowledge receipt of this letter.</p>
<p>Yours sincerely,<br><strong>HR Department</strong><br>{{company_name}}</p>`
  }
];

;(async () => {
  const safe = async sql => { try { await query(sql); } catch(_) {} };
  await safe(`CREATE TABLE IF NOT EXISTS hr_letter_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL,
    type VARCHAR(30) NOT NULL CHECK (type IN ('offer','appointment','increment','relieving','experience','warning','show_cause','noc','probation_confirmation')),
    name VARCHAR(200) NOT NULL,
    subject TEXT,
    body_html TEXT NOT NULL,
    is_default BOOLEAN DEFAULT FALSE,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`);
  await safe(`CREATE TABLE IF NOT EXISTS hr_employee_letters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL,
    employee_id UUID NOT NULL REFERENCES users(id),
    template_id UUID REFERENCES hr_letter_templates(id),
    letter_type VARCHAR(30) NOT NULL,
    reference_no VARCHAR(50),
    generated_on DATE DEFAULT CURRENT_DATE,
    subject TEXT,
    content_html TEXT NOT NULL,
    extra_data JSONB DEFAULT '{}',
    issued_by UUID REFERENCES users(id),
    acknowledged_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`);
  await safe(`CREATE SEQUENCE IF NOT EXISTS hr_letter_ref_seq START 1`);
})();

router.use(authenticate);

// ── Templates ─────────────────────────────────────────────────────────────────
router.get('/templates', authorize(...HR_ALL), async (req, res) => {
  const { rows } = await query(
    `SELECT * FROM hr_letter_templates WHERE company_id=$1 ORDER BY type,name`,
    [req.user.company_id]
  );
  // Seed defaults if none exist
  if (rows.length === 0) {
    for (const t of DEFAULT_TEMPLATES) {
      await query(
        `INSERT INTO hr_letter_templates(company_id,type,name,subject,body_html,is_default,created_by)
         VALUES($1,$2,$3,$4,$5,TRUE,$6) ON CONFLICT DO NOTHING`,
        [req.user.company_id, t.type, t.name, t.subject, t.body_html, req.user.id]
      );
    }
    const { rows: seeded } = await query(
      `SELECT * FROM hr_letter_templates WHERE company_id=$1 ORDER BY type,name`,
      [req.user.company_id]
    );
    return res.json({ data: seeded });
  }
  res.json({ data: rows });
});

router.post('/templates', authorize(...HR_ROLES), async (req, res) => {
  const { type, name, subject, body_html } = req.body;
  const { rows } = await query(
    `INSERT INTO hr_letter_templates(company_id,type,name,subject,body_html,created_by)
     VALUES($1,$2,$3,$4,$5,$6) RETURNING *`,
    [req.user.company_id, type, name, subject, body_html, req.user.id]
  );
  res.json({ data: rows[0] });
});

router.put('/templates/:id', authorize(...HR_ROLES), async (req, res) => {
  const { name, subject, body_html } = req.body;
  const { rows } = await query(
    `UPDATE hr_letter_templates SET name=$1,subject=$2,body_html=$3,updated_at=NOW()
     WHERE id=$4 AND company_id=$5 RETURNING *`,
    [name, subject, body_html, req.params.id, req.user.company_id]
  );
  res.json({ data: rows[0] });
});

// ── Generated Letters ─────────────────────────────────────────────────────────
router.get('/generated', authorize(...HR_ALL), async (req, res) => {
  const { employee_id, letter_type } = req.query;
  const conds = ['l.company_id=$1']; const params=[req.user.company_id]; let i=2;
  if (employee_id)  { conds.push(`l.employee_id=$${i++}`); params.push(employee_id); }
  if (letter_type)  { conds.push(`l.letter_type=$${i++}`); params.push(letter_type); }
  const { rows } = await query(
    `SELECT l.*, e.name AS full_name, e.employee_code AS emp_code, u.name as issued_by_name
     FROM hr_employee_letters l
     JOIN users e ON e.id=l.employee_id
     LEFT JOIN users u ON u.id=l.issued_by
     WHERE ${conds.join(' AND ')} ORDER BY l.generated_on DESC`,
    params
  );
  res.json({ data: rows });
});

// Interpolate template with employee + extra data
function interpolate(html, data) {
  return html.replace(/\{\{(\w+)\}\}/g, (_, key) =>
    data[key] !== undefined && data[key] !== null ? data[key] : `{{${key}}}`
  );
}

router.post('/generate', authorize(...HR_ROLES), async (req, res) => {
  const { employee_id, template_id, extra_data = {}, generated_on } = req.body;
  // Load template
  const { rows: [tmpl] } = await query(
    `SELECT * FROM hr_letter_templates WHERE id=$1 AND company_id=$2`,
    [template_id, req.user.company_id]
  );
  if (!tmpl) return res.status(404).json({ error: 'Template not found' });
  // Load employee
  const { rows: [emp] } = await query(
    `SELECT u.id, u.name AS full_name, u.employee_code AS employee_id, u.designation, u.department,
            u.email, u.phone, ep.date_of_joining, ep.pan_number, c.name as company_name
     FROM users u
     LEFT JOIN employee_profiles ep ON ep.user_id=u.id
     LEFT JOIN companies c ON c.id=u.company_id
     WHERE u.id=$1 AND u.company_id=$2`,
    [employee_id, req.user.company_id]
  );
  if (!emp) return res.status(404).json({ error: 'Employee not found' });
  // Seq ref
  const { rows: [{ nextval }] } = await query(`SELECT nextval('hr_letter_ref_seq')`);
  const ref = `LTR/${new Date().getFullYear()}/${String(nextval).padStart(4,'0')}`;
  const data = { ...emp, ...extra_data, reference_no: ref };
  const content_html = interpolate(tmpl.body_html, data);
  const subject = interpolate(tmpl.subject || '', data);
  const { rows } = await query(
    `INSERT INTO hr_employee_letters(company_id,employee_id,template_id,letter_type,reference_no,generated_on,subject,content_html,extra_data,issued_by)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
    [req.user.company_id, employee_id, template_id, tmpl.type, ref, generated_on||new Date().toISOString().split('T')[0], subject, content_html, JSON.stringify(extra_data), req.user.id]
  );
  res.json({ data: rows[0] });
});

router.get('/generated/:id', authorize(...HR_ALL), async (req, res) => {
  const { rows } = await query(
    `SELECT l.*, e.name AS full_name, e.employee_code AS emp_code FROM hr_employee_letters l
     JOIN users e ON e.id=l.employee_id WHERE l.id=$1 AND l.company_id=$2`,
    [req.params.id, req.user.company_id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Not found' });
  res.json({ data: rows[0] });
});

module.exports = router;
