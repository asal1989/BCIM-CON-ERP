// src/routes/hr-id-cards.routes.js
// ID Card Generation — full module: templates, single/bulk generation, QR
// codes, print queue, reprint, lost/damaged reissue (with HR approval,
// mirroring the leave-approval status/actioned_by/actioned_at/rejection_reason
// shape), card history audit log, reports, and per-company settings (stored
// in companies.settings.id_card, no new table needed for that).
const express = require('express');
const router = express.Router();
const QRCode = require('qrcode');
const { authenticate, authorize } = require('../middleware/auth');
const { query, pool } = require('../config/database');
const { runSchemaInit } = require('../utils/schemaInit');
const hrEmployees = require('./hr-employees.routes');

router.use(authenticate);
router.use(authorize('super_admin', 'admin', 'hr', 'hr_admin', 'hr_manager'));

const SYSTEM_ACCOUNT_EMAILS = hrEmployees.SYSTEM_ACCOUNT_EMAILS || [];
const CARD_TYPES = ['corporate', 'site', 'visitor', 'contractor', 'temporary', 'labour', 'consultant'];

runSchemaInit('hr-id-cards-v1', async () => {
  await query(`
    CREATE TABLE IF NOT EXISTS id_card_templates (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id UUID NOT NULL,
      name TEXT NOT NULL,
      card_type TEXT NOT NULL DEFAULT 'corporate' CHECK (card_type IN ('corporate','site','visitor','contractor','temporary','labour','consultant')),
      card_size TEXT NOT NULL DEFAULT 'CR80' CHECK (card_size IN ('CR80','A6','custom')),
      theme TEXT NOT NULL DEFAULT 'blue' CHECK (theme IN ('blue','dark','white')),
      front_config JSONB NOT NULL DEFAULT '{}',
      back_config JSONB NOT NULL DEFAULT '{}',
      is_default BOOLEAN DEFAULT FALSE,
      created_by UUID REFERENCES users(id),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS id_cards (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id UUID NOT NULL,
      employee_id UUID NOT NULL REFERENCES users(id),
      template_id UUID REFERENCES id_card_templates(id),
      card_number TEXT NOT NULL,
      qr_code_data TEXT,
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled','expired')),
      issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
      expiry_date DATE,
      generated_by UUID REFERENCES users(id),
      generated_at TIMESTAMPTZ DEFAULT NOW(),
      last_printed_at TIMESTAMPTZ,
      reprint_count INT DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(company_id, card_number)
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS id_card_history (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id UUID NOT NULL,
      card_id UUID REFERENCES id_cards(id) ON DELETE CASCADE,
      employee_id UUID NOT NULL REFERENCES users(id),
      event_type TEXT NOT NULL CHECK (event_type IN ('generated','printed','reprinted','lost','damaged','reissued','cancelled')),
      notes TEXT,
      actor_id UUID REFERENCES users(id),
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS id_card_print_queue (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id UUID NOT NULL,
      card_id UUID NOT NULL REFERENCES id_cards(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'ready' CHECK (status IN ('ready','printing','printed','failed','cancelled')),
      requested_by UUID REFERENCES users(id),
      requested_at TIMESTAMPTZ DEFAULT NOW(),
      printed_at TIMESTAMPTZ
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS id_card_reissue (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id UUID NOT NULL,
      employee_id UUID NOT NULL REFERENCES users(id),
      old_card_id UUID REFERENCES id_cards(id),
      new_card_id UUID REFERENCES id_cards(id),
      reason TEXT NOT NULL CHECK (reason IN ('lost','damaged')),
      remarks TEXT,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','issued')),
      requested_by UUID REFERENCES users(id),
      requested_at TIMESTAMPTZ DEFAULT NOW(),
      actioned_by UUID REFERENCES users(id),
      actioned_at TIMESTAMPTZ,
      rejection_reason TEXT
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS employee_qr_codes (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id UUID NOT NULL,
      employee_id UUID NOT NULL REFERENCES users(id),
      qr_data_uri TEXT NOT NULL,
      payload JSONB NOT NULL DEFAULT '{}',
      regenerated_count INT DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(company_id, employee_id)
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_idcards_company_status ON id_cards(company_id, status)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_idcards_employee ON id_cards(employee_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_idcard_history_card ON id_card_history(card_id, created_at DESC)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_idcard_queue_status ON id_card_print_queue(company_id, status)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_idcard_reissue_status ON id_card_reissue(company_id, status)`);
});

const DEFAULT_ID_CARD_SETTINGS = {
  card_size: 'CR80',
  photo_size: 'standard',
  qr_position: 'front-right',
  barcode_position: 'back',
  theme: 'blue',
  watermark: false,
  digital_signature: false,
};

async function nextCardNumber(companyId) {
  const { rows } = await query(
    `SELECT COUNT(*)::int AS cnt FROM id_cards WHERE company_id = $1`,
    [companyId]
  );
  const year = new Date().getFullYear();
  return `ID/${year}/${String(rows[0].cnt + 1).padStart(5, '0')}`;
}

async function generateQrForEmployee(companyId, employee) {
  const payload = {
    type: 'employee_profile',
    employee_id: employee.id,
    employee_code: employee.employee_code,
    name: employee.name,
    department: employee.department_name || null,
    status: 'active',
  };
  const url = `${process.env.FRONTEND_URL || 'https://erp.bcim.in'}/hr-admin/employees/${employee.id}`;
  const dataUri = await QRCode.toDataURL(url, { width: 240, margin: 1 });
  await query(
    `INSERT INTO employee_qr_codes (company_id, employee_id, qr_data_uri, payload)
     VALUES ($1,$2,$3,$4)
     ON CONFLICT (company_id, employee_id) DO UPDATE
       SET qr_data_uri = EXCLUDED.qr_data_uri, payload = EXCLUDED.payload,
           regenerated_count = employee_qr_codes.regenerated_count + 1, updated_at = NOW()`,
    [companyId, employee.id, dataUri, JSON.stringify(payload)]
  );
  return dataUri;
}

const employeeCardSelect = `
  SELECT u.id, u.employee_code, u.name, u.designation, ep.profile_photo_url,
         dep.name AS department_name, des.name AS designation_name,
         proj.name AS project_name, ep.date_of_joining, ep.blood_group,
         ep.emergency_contact_name, ep.emergency_contact_phone
  FROM users u
  LEFT JOIN employee_profiles ep ON ep.user_id = u.id
  LEFT JOIN hr_departments dep ON dep.id = ep.department_id
  LEFT JOIN hr_designations des ON des.id = ep.designation_id
  LEFT JOIN projects proj ON proj.id = ep.project_id
`;

// ═══════════════════════════════════════════════════════════
// DASHBOARD
// ═══════════════════════════════════════════════════════════
router.get('/summary', async (req, res) => {
  try {
    const companyId = req.user.company_id;
    const totalEmp = await query(
      `SELECT COUNT(*)::int AS cnt FROM users u
       LEFT JOIN employee_profiles ep ON ep.user_id = u.id
       WHERE u.company_id=$1 AND u.email != ALL($2::text[]) AND COALESCE(ep.employment_status,'active')='active'`,
      [companyId, SYSTEM_ACCOUNT_EMAILS]
    );
    const cardStats = await query(
      `SELECT
         COUNT(*)::int AS total_cards,
         COUNT(*) FILTER (WHERE status='active')::int AS active_cards,
         COUNT(*) FILTER (WHERE status='expired')::int AS expired_cards,
         COUNT(*) FILTER (WHERE status='disabled')::int AS disabled_cards,
         COUNT(DISTINCT employee_id)::int AS employees_with_cards
       FROM id_cards WHERE company_id=$1`,
      [companyId]
    );
    const printedToday = await query(
      `SELECT COUNT(*)::int AS cnt FROM id_card_print_queue WHERE company_id=$1 AND status='printed' AND printed_at::date = CURRENT_DATE`,
      [companyId]
    );
    const pendingPrint = await query(
      `SELECT COUNT(*)::int AS cnt FROM id_card_print_queue WHERE company_id=$1 AND status IN ('ready','printing')`,
      [companyId]
    );
    const reissueStats = await query(
      `SELECT
         COUNT(*) FILTER (WHERE reason='lost')::int AS lost,
         COUNT(*) FILTER (WHERE status='issued')::int AS reissued
       FROM id_card_reissue WHERE company_id=$1`,
      [companyId]
    );
    const monthly = await query(
      `SELECT to_char(date_trunc('month', generated_at), 'Mon YYYY') AS month,
              date_trunc('month', generated_at) AS sort, COUNT(*)::int AS cnt
       FROM id_cards WHERE company_id=$1 AND generated_at >= date_trunc('month', CURRENT_DATE) - INTERVAL '5 months'
       GROUP BY 1,2 ORDER BY 2`,
      [companyId]
    );
    const byDept = await query(
      `SELECT COALESCE(dep.name,'No department') AS name, COUNT(*)::int AS cnt
       FROM id_cards c JOIN employee_profiles ep ON ep.user_id=c.employee_id
       LEFT JOIN hr_departments dep ON dep.id=ep.department_id
       WHERE c.company_id=$1 GROUP BY 1 ORDER BY 2 DESC LIMIT 8`,
      [companyId]
    );
    const bySite = await query(
      `SELECT COALESCE(proj.name,'No project') AS name, COUNT(*)::int AS cnt
       FROM id_cards c JOIN employee_profiles ep ON ep.user_id=c.employee_id
       LEFT JOIN projects proj ON proj.id=ep.project_id
       WHERE c.company_id=$1 GROUP BY 1 ORDER BY 2 DESC LIMIT 8`,
      [companyId]
    );
    const reprints = await query(
      `SELECT to_char(date_trunc('month', created_at), 'Mon YYYY') AS month,
              date_trunc('month', created_at) AS sort, COUNT(*)::int AS cnt
       FROM id_card_history WHERE company_id=$1 AND event_type='reprinted'
         AND created_at >= date_trunc('month', CURRENT_DATE) - INTERVAL '5 months'
       GROUP BY 1,2 ORDER BY 2`,
      [companyId]
    );

    const total = totalEmp.rows[0].cnt;
    const withCards = cardStats.rows[0].employees_with_cards;
    res.json({
      data: {
        kpis: {
          total_employees: total,
          cards_generated: withCards,
          pending_generation: Math.max(total - withCards, 0),
          printed_today: printedToday.rows[0].cnt,
          pending_print: pendingPrint.rows[0].cnt,
          lost_cards: reissueStats.rows[0].lost,
          reissued_cards: reissueStats.rows[0].reissued,
          expired_cards: cardStats.rows[0].expired_cards,
        },
        active_vs_inactive: { active: cardStats.rows[0].active_cards, inactive: cardStats.rows[0].disabled_cards + cardStats.rows[0].expired_cards },
        monthly_generation: monthly.rows.map(r => ({ month: r.month, count: r.cnt })),
        by_department: byDept.rows,
        by_site: bySite.rows,
        reprints_trend: reprints.rows.map(r => ({ month: r.month, count: r.cnt })),
      },
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════
// TEMPLATES
// ═══════════════════════════════════════════════════════════
router.get('/templates', async (req, res) => {
  try {
    const { rows } = await query(`SELECT * FROM id_card_templates WHERE company_id=$1 ORDER BY created_at DESC`, [req.user.company_id]);
    res.json({ data: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});
router.post('/templates', async (req, res) => {
  try {
    const { name, card_type, card_size, theme, front_config, back_config, is_default } = req.body;
    const { rows } = await query(
      `INSERT INTO id_card_templates (company_id,name,card_type,card_size,theme,front_config,back_config,is_default,created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [req.user.company_id, name, card_type || 'corporate', card_size || 'CR80', theme || 'blue',
       JSON.stringify(front_config || {}), JSON.stringify(back_config || {}), !!is_default, req.user.id]
    );
    res.status(201).json({ data: rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});
router.put('/templates/:id', async (req, res) => {
  try {
    const { name, card_type, card_size, theme, front_config, back_config, is_default } = req.body;
    const { rows } = await query(
      `UPDATE id_card_templates SET name=$1,card_type=$2,card_size=$3,theme=$4,front_config=$5,back_config=$6,is_default=$7,updated_at=NOW()
       WHERE id=$8 AND company_id=$9 RETURNING *`,
      [name, card_type, card_size, theme, JSON.stringify(front_config || {}), JSON.stringify(back_config || {}), !!is_default, req.params.id, req.user.company_id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Template not found' });
    res.json({ data: rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});
router.delete('/templates/:id', async (req, res) => {
  try {
    await query(`DELETE FROM id_card_templates WHERE id=$1 AND company_id=$2`, [req.params.id, req.user.company_id]);
    res.json({ data: { deleted: true } });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════
// EMPLOYEE SELECTION (filterable list with card status)
// ═══════════════════════════════════════════════════════════
router.get('/employees', async (req, res) => {
  try {
    const companyId = req.user.company_id;
    const { search, department_id, project_id, designation_id, status, from_date, to_date } = req.query;
    const params = [companyId, SYSTEM_ACCOUNT_EMAILS];
    let idx = 3;
    let where = `u.company_id=$1 AND u.email != ALL($2::text[]) AND COALESCE(ep.employment_status,'active')='active'`;
    if (search) { where += ` AND (u.name ILIKE $${idx} OR u.employee_code ILIKE $${idx} OR u.phone ILIKE $${idx} OR u.email ILIKE $${idx})`; params.push(`%${search}%`); idx++; }
    if (department_id) { where += ` AND ep.department_id=$${idx}`; params.push(department_id); idx++; }
    if (project_id) { where += ` AND ep.project_id=$${idx}`; params.push(project_id); idx++; }
    if (designation_id) { where += ` AND ep.designation_id=$${idx}`; params.push(designation_id); idx++; }
    if (from_date) { where += ` AND ep.date_of_joining>=$${idx}`; params.push(from_date); idx++; }
    if (to_date) { where += ` AND ep.date_of_joining<=$${idx}`; params.push(to_date); idx++; }

    const { rows } = await query(
      `SELECT u.id, u.employee_code, u.name, u.phone, u.email, dep.name AS department_name,
              des.name AS designation_name, proj.name AS project_name, ep.date_of_joining,
              (SELECT c.id FROM id_cards c WHERE c.employee_id=u.id AND c.status='active' ORDER BY c.generated_at DESC LIMIT 1) AS active_card_id,
              (SELECT c.card_number FROM id_cards c WHERE c.employee_id=u.id AND c.status='active' ORDER BY c.generated_at DESC LIMIT 1) AS card_number
       FROM users u
       LEFT JOIN employee_profiles ep ON ep.user_id=u.id
       LEFT JOIN hr_departments dep ON dep.id=ep.department_id
       LEFT JOIN hr_designations des ON des.id=ep.designation_id
       LEFT JOIN projects proj ON proj.id=ep.project_id
       WHERE ${where} ORDER BY u.name LIMIT 300`,
      params
    );
    const filtered = status === 'with_card' ? rows.filter(r => r.active_card_id) : status === 'without_card' ? rows.filter(r => !r.active_card_id) : rows;
    res.json({ data: filtered });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════
// GENERATE (single / bulk)
// ═══════════════════════════════════════════════════════════
async function generateOneCard(companyId, employeeId, templateId, actorId) {
  const empRes = await query(`${employeeCardSelect} WHERE u.id=$1 AND u.company_id=$2`, [employeeId, companyId]);
  const emp = empRes.rows[0];
  if (!emp) throw Object.assign(new Error('Employee not found'), { status: 404 });

  const qrDataUri = await generateQrForEmployee(companyId, emp);
  const cardNumber = await nextCardNumber(companyId);
  const { rows } = await query(
    `INSERT INTO id_cards (company_id, employee_id, template_id, card_number, qr_code_data, generated_by)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [companyId, employeeId, templateId || null, cardNumber, qrDataUri, actorId]
  );
  const card = rows[0];
  await query(
    `INSERT INTO id_card_history (company_id, card_id, employee_id, event_type, actor_id) VALUES ($1,$2,$3,'generated',$4)`,
    [companyId, card.id, employeeId, actorId]
  );
  // Auto-tick the onboarding checklist's id_card item, same convention as reconcileDerived's other auto_source items.
  await query(
    `UPDATE employee_lifecycle_checklist SET status='done', completed_at=NOW(), updated_at=NOW()
     WHERE user_id=$1 AND company_id=$2 AND stage='onboarding' AND item_key='id_card' AND status<>'done'`,
    [employeeId, companyId]
  );
  return { ...card, employee: emp };
}

router.post('/cards/generate', async (req, res) => {
  try {
    const { employee_id, template_id } = req.body;
    if (!employee_id) return res.status(400).json({ error: 'employee_id is required' });
    const card = await generateOneCard(req.user.company_id, employee_id, template_id, req.user.id);
    res.status(201).json({ data: card });
  } catch (err) { res.status(err.status || 500).json({ error: err.message }); }
});

router.post('/cards/bulk', async (req, res) => {
  try {
    const companyId = req.user.company_id;
    const { employee_ids, department_id, project_id, new_joiners_days, template_id } = req.body;
    let ids = employee_ids || [];
    if (!ids.length && (department_id || project_id || new_joiners_days)) {
      const params = [companyId, SYSTEM_ACCOUNT_EMAILS];
      let idx = 3;
      let where = `u.company_id=$1 AND u.email != ALL($2::text[]) AND COALESCE(ep.employment_status,'active')='active'`;
      if (department_id) { where += ` AND ep.department_id=$${idx}`; params.push(department_id); idx++; }
      if (project_id) { where += ` AND ep.project_id=$${idx}`; params.push(project_id); idx++; }
      if (new_joiners_days) { where += ` AND ep.date_of_joining >= CURRENT_DATE - $${idx}::int`; params.push(new_joiners_days); idx++; }
      const r = await query(`SELECT u.id FROM users u LEFT JOIN employee_profiles ep ON ep.user_id=u.id WHERE ${where}`, params);
      ids = r.rows.map(x => x.id);
    }
    if (!ids.length) return res.status(400).json({ error: 'No employees matched — provide employee_ids or a filter' });

    const results = [];
    const errors = [];
    for (const id of ids) {
      try { results.push(await generateOneCard(companyId, id, template_id, req.user.id)); }
      catch (e) { errors.push({ employee_id: id, error: e.message }); }
    }
    res.status(201).json({ data: { generated: results.length, failed: errors.length, cards: results, errors } });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════
// CARDS list / detail
// ═══════════════════════════════════════════════════════════
router.get('/cards', async (req, res) => {
  try {
    const companyId = req.user.company_id;
    const { search, status, department_id } = req.query;
    const params = [companyId];
    let idx = 2;
    let where = `c.company_id=$1`;
    if (status) { where += ` AND c.status=$${idx}`; params.push(status); idx++; }
    if (search) { where += ` AND (u.name ILIKE $${idx} OR u.employee_code ILIKE $${idx} OR c.card_number ILIKE $${idx})`; params.push(`%${search}%`); idx++; }
    if (department_id) { where += ` AND ep.department_id=$${idx}`; params.push(department_id); idx++; }
    const { rows } = await query(
      `SELECT c.*, u.name AS employee_name, u.employee_code, dep.name AS department_name
       FROM id_cards c
       JOIN users u ON u.id=c.employee_id
       LEFT JOIN employee_profiles ep ON ep.user_id=u.id
       LEFT JOIN hr_departments dep ON dep.id=ep.department_id
       WHERE ${where} ORDER BY c.generated_at DESC LIMIT 300`,
      params
    );
    res.json({ data: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/cards/:id', async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT c.*, t.name AS template_name, t.front_config, t.back_config, t.card_size, t.theme
       FROM id_cards c LEFT JOIN id_card_templates t ON t.id=c.template_id
       WHERE c.id=$1 AND c.company_id=$2`,
      [req.params.id, req.user.company_id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Card not found' });
    const empRes = await query(`${employeeCardSelect} WHERE u.id=$1`, [rows[0].employee_id]);
    res.json({ data: { ...rows[0], employee: empRes.rows[0] } });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════
// PRINT QUEUE
// ═══════════════════════════════════════════════════════════
router.get('/print-queue', async (req, res) => {
  try {
    const companyId = req.user.company_id;
    const { status } = req.query;
    const params = [companyId];
    let where = `q.company_id=$1`;
    if (status) { where += ` AND q.status=$2`; params.push(status); }
    const { rows } = await query(
      `SELECT q.*, c.card_number, u.name AS employee_name, u.employee_code
       FROM id_card_print_queue q
       JOIN id_cards c ON c.id=q.card_id
       JOIN users u ON u.id=c.employee_id
       WHERE ${where} ORDER BY q.requested_at DESC LIMIT 300`,
      params
    );
    res.json({ data: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});
router.post('/print-queue', async (req, res) => {
  try {
    const { card_ids } = req.body;
    if (!card_ids?.length) return res.status(400).json({ error: 'card_ids is required' });
    const inserted = [];
    for (const cardId of card_ids) {
      const { rows } = await query(
        `INSERT INTO id_card_print_queue (company_id, card_id, requested_by) VALUES ($1,$2,$3) RETURNING *`,
        [req.user.company_id, cardId, req.user.id]
      );
      inserted.push(rows[0]);
    }
    res.status(201).json({ data: inserted });
  } catch (err) { res.status(500).json({ error: err.message }); }
});
router.patch('/print-queue/:id', async (req, res) => {
  try {
    const { status } = req.body;
    if (!['ready', 'printing', 'printed', 'failed', 'cancelled'].includes(status)) return res.status(400).json({ error: 'Invalid status' });
    const { rows } = await query(
      `UPDATE id_card_print_queue SET status=$1, printed_at=CASE WHEN $1='printed' THEN NOW() ELSE printed_at END
       WHERE id=$2 AND company_id=$3 RETURNING *`,
      [status, req.params.id, req.user.company_id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Queue item not found' });
    if (status === 'printed') {
      await query(`UPDATE id_cards SET last_printed_at=NOW() WHERE id=$1`, [rows[0].card_id]);
      await query(
        `INSERT INTO id_card_history (company_id, card_id, employee_id, event_type, actor_id)
         SELECT company_id, id, employee_id, 'printed', $2 FROM id_cards WHERE id=$1`,
        [rows[0].card_id, req.user.id]
      );
    }
    res.json({ data: rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════
// REPRINT
// ═══════════════════════════════════════════════════════════
router.post('/cards/:id/reprint', async (req, res) => {
  try {
    const { rows } = await query(
      `UPDATE id_cards SET reprint_count = reprint_count + 1 WHERE id=$1 AND company_id=$2 RETURNING *`,
      [req.params.id, req.user.company_id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Card not found' });
    await query(
      `INSERT INTO id_card_history (company_id, card_id, employee_id, event_type, actor_id) VALUES ($1,$2,$3,'reprinted',$4)`,
      [req.user.company_id, rows[0].id, rows[0].employee_id, req.user.id]
    );
    const q = await query(
      `INSERT INTO id_card_print_queue (company_id, card_id, requested_by) VALUES ($1,$2,$3) RETURNING *`,
      [req.user.company_id, rows[0].id, req.user.id]
    );
    res.json({ data: { card: rows[0], queue_item: q.rows[0] } });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════
// LOST / DAMAGED — reissue workflow (mirrors hr-leave.routes.js approve/reject shape)
// ═══════════════════════════════════════════════════════════
router.get('/reissue', async (req, res) => {
  try {
    const companyId = req.user.company_id;
    const { status } = req.query;
    const params = [companyId];
    let where = `r.company_id=$1`;
    if (status) { where += ` AND r.status=$2`; params.push(status); }
    const { rows } = await query(
      `SELECT r.*, u.name AS employee_name, u.employee_code, oc.card_number AS old_card_number, au.name AS actioned_by_name
       FROM id_card_reissue r
       JOIN users u ON u.id=r.employee_id
       LEFT JOIN id_cards oc ON oc.id=r.old_card_id
       LEFT JOIN users au ON au.id=r.actioned_by
       WHERE ${where} ORDER BY r.requested_at DESC LIMIT 300`,
      params
    );
    res.json({ data: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/reissue', async (req, res) => {
  try {
    const { employee_id, old_card_id, reason, remarks } = req.body;
    if (!['lost', 'damaged'].includes(reason)) return res.status(400).json({ error: 'reason must be lost or damaged' });
    const { rows } = await query(
      `INSERT INTO id_card_reissue (company_id, employee_id, old_card_id, reason, remarks, requested_by)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [req.user.company_id, employee_id, old_card_id || null, reason, remarks || null, req.user.id]
    );
    await query(
      `INSERT INTO id_card_history (company_id, card_id, employee_id, event_type, notes, actor_id) VALUES ($1,$2,$3,$4,$5,$6)`,
      [req.user.company_id, old_card_id || null, employee_id, reason, remarks || null, req.user.id]
    );
    res.status(201).json({ data: rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch('/reissue/:id/approve', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: reqRows } = await client.query(
      `SELECT * FROM id_card_reissue WHERE id=$1 AND company_id=$2 AND status='pending' FOR UPDATE`,
      [req.params.id, req.user.company_id]
    );
    if (!reqRows.length) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Pending reissue request not found' }); }
    const reissue = reqRows[0];

    if (reissue.old_card_id) {
      await client.query(`UPDATE id_cards SET status='disabled' WHERE id=$1`, [reissue.old_card_id]);
    }
    const empRes = await client.query(`${employeeCardSelect} WHERE u.id=$1`, [reissue.employee_id]);
    const emp = empRes.rows[0];
    const qrDataUri = await generateQrForEmployee(req.user.company_id, emp);
    const cardNumber = await nextCardNumber(req.user.company_id);
    const { rows: newCardRows } = await client.query(
      `INSERT INTO id_cards (company_id, employee_id, card_number, qr_code_data, generated_by) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [req.user.company_id, reissue.employee_id, cardNumber, qrDataUri, req.user.id]
    );
    const newCard = newCardRows[0];

    await client.query(
      `UPDATE id_card_reissue SET status='issued', new_card_id=$1, actioned_by=$2, actioned_at=NOW() WHERE id=$3`,
      [newCard.id, req.user.id, reissue.id]
    );
    await client.query(
      `INSERT INTO id_card_history (company_id, card_id, employee_id, event_type, actor_id) VALUES ($1,$2,$3,'reissued',$4)`,
      [req.user.company_id, newCard.id, reissue.employee_id, req.user.id]
    );
    await client.query('COMMIT');
    res.json({ data: { reissue: { ...reissue, status: 'issued', new_card_id: newCard.id }, new_card: newCard } });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally { client.release(); }
});

router.patch('/reissue/:id/reject', async (req, res) => {
  try {
    const { rejection_reason } = req.body;
    const { rows } = await query(
      `UPDATE id_card_reissue SET status='rejected', actioned_by=$1, actioned_at=NOW(), rejection_reason=$2
       WHERE id=$3 AND company_id=$4 AND status='pending' RETURNING *`,
      [req.user.id, rejection_reason || null, req.params.id, req.user.company_id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Pending reissue request not found' });
    res.json({ data: rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════
// QR CODE MANAGEMENT
// ═══════════════════════════════════════════════════════════
router.get('/qr', async (req, res) => {
  try {
    const companyId = req.user.company_id;
    const { search } = req.query;
    const params = [companyId, SYSTEM_ACCOUNT_EMAILS];
    let idx = 3;
    let where = `u.company_id=$1 AND u.email != ALL($2::text[]) AND COALESCE(ep.employment_status,'active')='active'`;
    if (search) { where += ` AND (u.name ILIKE $${idx} OR u.employee_code ILIKE $${idx})`; params.push(`%${search}%`); idx++; }
    const { rows } = await query(
      `SELECT u.id, u.employee_code, u.name, dep.name AS department_name,
              q.qr_data_uri, q.regenerated_count, q.updated_at AS qr_updated_at
       FROM users u
       LEFT JOIN employee_profiles ep ON ep.user_id=u.id
       LEFT JOIN hr_departments dep ON dep.id=ep.department_id
       LEFT JOIN employee_qr_codes q ON q.employee_id=u.id AND q.company_id=u.company_id
       WHERE ${where} ORDER BY u.name LIMIT 300`,
      params
    );
    res.json({ data: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});
router.post('/qr/:employeeId/regenerate', async (req, res) => {
  try {
    const empRes = await query(`${employeeCardSelect} WHERE u.id=$1 AND u.company_id=$2`, [req.params.employeeId, req.user.company_id]);
    if (!empRes.rows.length) return res.status(404).json({ error: 'Employee not found' });
    const dataUri = await generateQrForEmployee(req.user.company_id, empRes.rows[0]);
    res.json({ data: { qr_data_uri: dataUri } });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════
// CARD HISTORY
// ═══════════════════════════════════════════════════════════
router.get('/history', async (req, res) => {
  try {
    const companyId = req.user.company_id;
    const { employee_id, event_type, from_date, to_date } = req.query;
    const params = [companyId];
    let idx = 2;
    let where = `h.company_id=$1`;
    if (employee_id) { where += ` AND h.employee_id=$${idx}`; params.push(employee_id); idx++; }
    if (event_type) { where += ` AND h.event_type=$${idx}`; params.push(event_type); idx++; }
    if (from_date) { where += ` AND h.created_at::date>=$${idx}`; params.push(from_date); idx++; }
    if (to_date) { where += ` AND h.created_at::date<=$${idx}`; params.push(to_date); idx++; }
    const { rows } = await query(
      `SELECT h.*, u.name AS employee_name, u.employee_code, c.card_number, actor.name AS actor_name
       FROM id_card_history h
       JOIN users u ON u.id=h.employee_id
       LEFT JOIN id_cards c ON c.id=h.card_id
       LEFT JOIN users actor ON actor.id=h.actor_id
       WHERE ${where} ORDER BY h.created_at DESC LIMIT 500`,
      params
    );
    res.json({ data: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════
// REPORTS
// ═══════════════════════════════════════════════════════════
const REPORTS = {
  id_card_register: {
    label: 'ID Card Register',
    sql: `SELECT c.card_number, u.name, u.employee_code, dep.name AS department, c.status, c.issue_date
          FROM id_cards c JOIN users u ON u.id=c.employee_id
          LEFT JOIN employee_profiles ep ON ep.user_id=u.id LEFT JOIN hr_departments dep ON dep.id=ep.department_id
          WHERE c.company_id=$1 ORDER BY c.generated_at DESC`,
  },
  pending_cards: {
    label: 'Pending Cards',
    sql: `SELECT u.name, u.employee_code, dep.name AS department, ep.date_of_joining
          FROM users u LEFT JOIN employee_profiles ep ON ep.user_id=u.id LEFT JOIN hr_departments dep ON dep.id=ep.department_id
          WHERE u.company_id=$1 AND u.email != ALL($2::text[]) AND COALESCE(ep.employment_status,'active')='active'
            AND NOT EXISTS (SELECT 1 FROM id_cards c WHERE c.employee_id=u.id AND c.status='active')
          ORDER BY u.name`,
  },
  printed_cards: {
    label: 'Printed Cards',
    sql: `SELECT c.card_number, u.name, u.employee_code, c.last_printed_at
          FROM id_cards c JOIN users u ON u.id=c.employee_id
          WHERE c.company_id=$1 AND c.last_printed_at IS NOT NULL ORDER BY c.last_printed_at DESC`,
  },
  reissued_cards: {
    label: 'Reissued Cards',
    sql: `SELECT r.reason, u.name, u.employee_code, r.status, r.requested_at, r.actioned_at
          FROM id_card_reissue r JOIN users u ON u.id=r.employee_id
          WHERE r.company_id=$1 ORDER BY r.requested_at DESC`,
  },
  lost_cards: {
    label: 'Lost Cards',
    sql: `SELECT u.name, u.employee_code, r.status, r.requested_at
          FROM id_card_reissue r JOIN users u ON u.id=r.employee_id
          WHERE r.company_id=$1 AND r.reason='lost' ORDER BY r.requested_at DESC`,
  },
  expired_cards: {
    label: 'Expired Cards',
    sql: `SELECT c.card_number, u.name, u.employee_code, c.expiry_date
          FROM id_cards c JOIN users u ON u.id=c.employee_id
          WHERE c.company_id=$1 AND c.status='expired' ORDER BY c.expiry_date DESC`,
  },
};
router.get('/reports/:key', async (req, res) => {
  try {
    const report = REPORTS[req.params.key];
    if (!report) return res.status(404).json({ error: 'Unknown report' });
    const { rows } = await query(report.sql, [req.user.company_id, SYSTEM_ACCOUNT_EMAILS]);
    res.json({ data: rows, label: report.label });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════
// SETTINGS (stored in companies.settings.id_card — no new table)
// ═══════════════════════════════════════════════════════════
router.get('/settings', async (req, res) => {
  try {
    const { rows } = await query(`SELECT settings FROM companies WHERE id=$1`, [req.user.company_id]);
    const existing = rows[0]?.settings?.id_card || {};
    res.json({ data: { ...DEFAULT_ID_CARD_SETTINGS, ...existing } });
  } catch (err) { res.status(500).json({ error: err.message }); }
});
router.put('/settings', async (req, res) => {
  try {
    const { rows } = await query(`SELECT settings FROM companies WHERE id=$1`, [req.user.company_id]);
    const currentSettings = rows[0]?.settings || {};
    const merged = { ...DEFAULT_ID_CARD_SETTINGS, ...(currentSettings.id_card || {}), ...req.body };
    const nextSettings = { ...currentSettings, id_card: merged };
    await query(`UPDATE companies SET settings=$1, updated_at=NOW() WHERE id=$2`, [JSON.stringify(nextSettings), req.user.company_id]);
    res.json({ data: merged });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
