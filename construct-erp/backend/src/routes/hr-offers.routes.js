// src/routes/hr-offers.routes.js
// Offer & Appointment lifecycle — candidate intake through offer approval,
// offer letter + candidate acceptance (public, tokenized link — mirrors
// quotation.routes.js's vendor-rfq portal pattern exactly), appointment
// letter + appointment approval, and history/reports/settings.
//
// Deliberately reuses existing infra instead of duplicating it:
// - Letter templates: hr_letter_gen_templates (widened CHECK to add
//   promotion/transfer/confirmation/contract_renewal types).
// - Approver signatures: users.signature_url (already populated via the
//   existing SignaturePadModal / profile page) — no new signature table.
// - Company seal / default director signature: companies.settings.offers
//   (same base64-data-URI convention as ess.routes.js profile photos).
// - Email: services/mail.service.js sendMail().
const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { authenticate, authorize } = require('../middleware/auth');
const { query, pool } = require('../config/database');
const { runSchemaInit } = require('../utils/schemaInit');
const hrEmployees = require('./hr-employees.routes');
const { sendMail } = require('../services/mail.service');

const SYSTEM_ACCOUNT_EMAILS = hrEmployees.SYSTEM_ACCOUNT_EMAILS || [];

const getFrontendBaseUrl = () =>
  (process.env.PUBLIC_FRONTEND_URL || process.env.FRONTEND_URL || 'https://erp.bcim.in').replace(/\/$/, '');

runSchemaInit('hr-offers-v1', async () => {
  await query(`
    CREATE TABLE IF NOT EXISTS offer_requests (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id UUID NOT NULL,
      offer_number TEXT NOT NULL,
      candidate_name TEXT NOT NULL,
      candidate_mobile TEXT,
      candidate_email TEXT,
      candidate_address TEXT,
      project_id UUID REFERENCES projects(id),
      department_id UUID REFERENCES hr_departments(id),
      designation_id UUID REFERENCES hr_designations(id),
      employment_type TEXT,
      reporting_manager_id UUID REFERENCES users(id),
      work_location TEXT,
      site_location TEXT,
      ctc_annual NUMERIC(14,2),
      basic_salary NUMERIC(14,2),
      hra NUMERIC(14,2),
      special_allowance NUMERIC(14,2),
      bonus NUMERIC(14,2),
      incentives NUMERIC(14,2),
      probation_period_days INT DEFAULT 180,
      notice_period_days INT DEFAULT 30,
      status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','pending_approval','approved','rejected','sent','accepted','declined','expired')),
      current_stage_order INT DEFAULT 0,
      created_by UUID REFERENCES users(id),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(company_id, offer_number)
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS offer_approvals (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id UUID NOT NULL,
      offer_id UUID NOT NULL REFERENCES offer_requests(id) ON DELETE CASCADE,
      stage_order INT NOT NULL,
      stage_label TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','skipped')),
      actioned_by UUID REFERENCES users(id),
      actioned_at TIMESTAMPTZ,
      remarks TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS offer_letters (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id UUID NOT NULL,
      offer_id UUID NOT NULL REFERENCES offer_requests(id) ON DELETE CASCADE,
      template_id UUID,
      subject TEXT,
      content_html TEXT NOT NULL,
      accept_token TEXT UNIQUE,
      token_expires_at TIMESTAMPTZ,
      sent_at TIMESTAMPTZ,
      opened_at TIMESTAMPTZ,
      acceptance_status TEXT NOT NULL DEFAULT 'pending' CHECK (acceptance_status IN ('pending','accepted','declined','expired')),
      responded_at TIMESTAMPTZ,
      ip_address TEXT,
      comments TEXT,
      generated_by UUID REFERENCES users(id),
      generated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS appointment_letters (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id UUID NOT NULL,
      offer_id UUID NOT NULL REFERENCES offer_requests(id) ON DELETE CASCADE,
      appointment_number TEXT NOT NULL,
      employee_id UUID REFERENCES users(id),
      content_html TEXT,
      joining_date DATE,
      status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','pending_approval','approved','released')),
      current_stage_order INT DEFAULT 0,
      generated_by UUID REFERENCES users(id),
      generated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(company_id, appointment_number)
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS appointment_approvals (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id UUID NOT NULL,
      appointment_id UUID NOT NULL REFERENCES appointment_letters(id) ON DELETE CASCADE,
      stage_order INT NOT NULL,
      stage_label TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','skipped')),
      actioned_by UUID REFERENCES users(id),
      actioned_at TIMESTAMPTZ,
      remarks TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS offer_letter_history (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id UUID NOT NULL,
      entity_type TEXT NOT NULL CHECK (entity_type IN ('offer','appointment')),
      entity_id UUID NOT NULL,
      action TEXT NOT NULL,
      actor_id UUID REFERENCES users(id),
      notes TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_offers_company_status ON offer_requests(company_id, status)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_offer_approvals_offer ON offer_approvals(offer_id, stage_order)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_appointment_approvals_appt ON appointment_approvals(appointment_id, stage_order)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_offer_history_entity ON offer_letter_history(entity_type, entity_id, created_at DESC)`);

  // Widen hr_letter_gen_templates.type so Offer & Appointment's Document
  // Templates page can reuse it instead of a parallel templates table.
  await query(`ALTER TABLE hr_letter_gen_templates DROP CONSTRAINT IF EXISTS hr_letter_gen_templates_type_check`);
  await query(`
    ALTER TABLE hr_letter_gen_templates ADD CONSTRAINT hr_letter_gen_templates_type_check
      CHECK (type IN ('offer','appointment','increment','relieving','experience','warning','show_cause','noc','probation_confirmation','promotion','transfer','confirmation','contract_renewal'))
  `);
});

const DEFAULT_OFFER_SETTINGS = {
  offer_number_prefix: 'OFR',
  appointment_number_prefix: 'APT',
  offer_stages: ['HR Executive', 'HR Manager', 'Department Head', 'Finance', 'Managing Director'],
  finance_stage_required: true,
  appointment_stages: ['HR Executive', 'HR Manager', 'Managing Director'],
  reminder_days: 3,
  company_seal: null,
  director_signature: null,
};

async function getOfferSettings(companyId) {
  const { rows } = await query(`SELECT settings FROM companies WHERE id=$1`, [companyId]);
  return { ...DEFAULT_OFFER_SETTINGS, ...(rows[0]?.settings?.offers || {}) };
}

async function addHistory(companyId, entityType, entityId, action, actorId, notes) {
  await query(
    `INSERT INTO offer_letter_history (company_id, entity_type, entity_id, action, actor_id, notes) VALUES ($1,$2,$3,$4,$5,$6)`,
    [companyId, entityType, entityId, action, actorId || null, notes || null]
  );
}

async function seedApprovalStages(companyId, table, fkCol, entityId, stages) {
  for (let i = 0; i < stages.length; i++) {
    await query(
      `INSERT INTO ${table} (company_id, ${fkCol}, stage_order, stage_label) VALUES ($1,$2,$3,$4)`,
      [companyId, entityId, i + 1, stages[i]]
    );
  }
}

// ═══════════════════════════════════════════════════════════
// PUBLIC CANDIDATE PORTAL — no authenticate, mirrors quotation.routes.js's
// /vendor-rfq/:token exactly. Must stay ABOVE router.use(authenticate) below.
// ═══════════════════════════════════════════════════════════
router.get('/candidate-portal/:token', async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT ol.*, o.candidate_name, o.candidate_email, o.employment_type, o.work_location,
              o.ctc_annual, o.basic_salary, o.hra, o.special_allowance, o.probation_period_days, o.notice_period_days,
              dep.name AS department_name, des.name AS designation_name, c.name AS company_name
       FROM offer_letters ol
       JOIN offer_requests o ON o.id = ol.offer_id
       LEFT JOIN hr_departments dep ON dep.id = o.department_id
       LEFT JOIN hr_designations des ON des.id = o.designation_id
       LEFT JOIN companies c ON c.id = o.company_id
       WHERE ol.accept_token = $1`,
      [req.params.token.trim()]
    );
    if (!rows.length) return res.status(404).json({ error: 'Offer link not found' });
    const letter = rows[0];
    if (letter.token_expires_at && new Date(letter.token_expires_at) < new Date()) {
      return res.status(410).json({ error: 'This offer link has expired' });
    }
    if (!letter.opened_at) {
      await query(`UPDATE offer_letters SET opened_at=NOW() WHERE id=$1`, [letter.id]);
      await addHistory(letter.company_id, 'offer', letter.offer_id, 'opened', null, null);
    }
    res.json({ data: letter });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/candidate-portal/:token', async (req, res) => {
  try {
    const { action, comments } = req.body; // action: 'accept' | 'decline' | 'request_changes'
    const { rows } = await query(`SELECT * FROM offer_letters WHERE accept_token=$1`, [req.params.token.trim()]);
    if (!rows.length) return res.status(404).json({ error: 'Offer link not found' });
    const letter = rows[0];
    if (letter.token_expires_at && new Date(letter.token_expires_at) < new Date()) {
      return res.status(410).json({ error: 'This offer link has expired' });
    }
    if (letter.acceptance_status !== 'pending') return res.status(400).json({ error: 'This offer has already been responded to' });

    const status = action === 'accept' ? 'accepted' : action === 'decline' ? 'declined' : 'pending';
    const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').toString().split(',')[0].trim();
    await query(
      `UPDATE offer_letters SET acceptance_status=$1, responded_at=NOW(), ip_address=$2, comments=$3 WHERE id=$4`,
      [status === 'pending' ? 'pending' : status, ip, comments || null, letter.id]
    );
    if (status !== 'pending') {
      await query(`UPDATE offer_requests SET status=$1, updated_at=NOW() WHERE id=$2`, [status, letter.offer_id]);
    }
    await addHistory(letter.company_id, 'offer', letter.offer_id, action, null, comments);
    res.json({ data: { status: status === 'pending' ? 'changes_requested' : status } });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.use(authenticate);
router.use(authorize('super_admin', 'admin', 'hr', 'hr_admin', 'hr_manager'));

// ═══════════════════════════════════════════════════════════
// DASHBOARD
// ═══════════════════════════════════════════════════════════
router.get('/summary', async (req, res) => {
  try {
    const companyId = req.user.company_id;
    const offerStats = await query(
      `SELECT
         COUNT(*) FILTER (WHERE status='pending_approval')::int AS pending,
         COUNT(*) FILTER (WHERE status='sent')::int AS sent,
         COUNT(*) FILTER (WHERE status='accepted')::int AS accepted,
         COUNT(*) FILTER (WHERE status IN ('rejected','declined'))::int AS rejected
       FROM offer_requests WHERE company_id=$1`,
      [companyId]
    );
    const apptStats = await query(
      `SELECT COUNT(*) FILTER (WHERE status='released')::int AS generated,
              COUNT(*) FILTER (WHERE status IN ('draft','pending_approval','approved'))::int AS pending
       FROM appointment_letters WHERE company_id=$1`,
      [companyId]
    );
    const joining = await query(
      `SELECT COUNT(*) FILTER (WHERE joining_date = CURRENT_DATE)::int AS today,
              COUNT(*) FILTER (WHERE joining_date BETWEEN CURRENT_DATE AND CURRENT_DATE + 6)::int AS this_week
       FROM appointment_letters WHERE company_id=$1`,
      [companyId]
    );
    const monthly = await query(
      `SELECT to_char(date_trunc('month', created_at), 'Mon YYYY') AS month, date_trunc('month', created_at) AS sort, COUNT(*)::int AS cnt
       FROM offer_requests WHERE company_id=$1 AND created_at >= date_trunc('month', CURRENT_DATE) - INTERVAL '5 months'
       GROUP BY 1,2 ORDER BY 2`,
      [companyId]
    );
    const byDept = await query(
      `SELECT COALESCE(dep.name,'No department') AS name, COUNT(*)::int AS cnt
       FROM offer_requests o LEFT JOIN hr_departments dep ON dep.id=o.department_id
       WHERE o.company_id=$1 GROUP BY 1 ORDER BY 2 DESC LIMIT 8`,
      [companyId]
    );
    const timeToJoin = await query(
      `SELECT ROUND(AVG(a.joining_date - o.created_at::date))::int AS avg_days
       FROM appointment_letters a JOIN offer_requests o ON o.id=a.offer_id
       WHERE a.company_id=$1 AND a.joining_date IS NOT NULL`,
      [companyId]
    );
    const total = offerStats.rows[0].pending + offerStats.rows[0].sent + offerStats.rows[0].accepted + offerStats.rows[0].rejected;
    const acceptanceRate = offerStats.rows[0].sent + offerStats.rows[0].accepted > 0
      ? Math.round((offerStats.rows[0].accepted / (offerStats.rows[0].accepted + offerStats.rows[0].rejected || 1)) * 100)
      : 0;
    res.json({
      data: {
        kpis: {
          offers_pending: offerStats.rows[0].pending,
          offers_sent: offerStats.rows[0].sent,
          offers_accepted: offerStats.rows[0].accepted,
          offers_rejected: offerStats.rows[0].rejected,
          appointment_letters_generated: apptStats.rows[0].generated,
          appointment_letters_pending: apptStats.rows[0].pending,
          joining_today: joining.rows[0].today,
          joining_this_week: joining.rows[0].this_week,
        },
        acceptance_rate_pct: acceptanceRate,
        avg_time_to_join_days: timeToJoin.rows[0].avg_days,
        monthly_offers: monthly.rows.map(r => ({ month: r.month, count: r.cnt })),
        by_department: byDept.rows,
      },
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════
// OFFER REQUESTS
// ═══════════════════════════════════════════════════════════
router.get('/requests', async (req, res) => {
  try {
    const companyId = req.user.company_id;
    const { search, status } = req.query;
    const params = [companyId];
    let idx = 2;
    let where = `o.company_id=$1`;
    if (status) { where += ` AND o.status=$${idx}`; params.push(status); idx++; }
    if (search) { where += ` AND (o.candidate_name ILIKE $${idx} OR o.offer_number ILIKE $${idx})`; params.push(`%${search}%`); idx++; }
    const { rows } = await query(
      `SELECT o.*, dep.name AS department_name, des.name AS designation_name, proj.name AS project_name,
              mgr.name AS reporting_manager_name
       FROM offer_requests o
       LEFT JOIN hr_departments dep ON dep.id=o.department_id
       LEFT JOIN hr_designations des ON des.id=o.designation_id
       LEFT JOIN projects proj ON proj.id=o.project_id
       LEFT JOIN users mgr ON mgr.id=o.reporting_manager_id
       WHERE ${where} ORDER BY o.created_at DESC LIMIT 300`,
      params
    );
    res.json({ data: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/requests/:id', async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT o.*, dep.name AS department_name, des.name AS designation_name, proj.name AS project_name,
              mgr.name AS reporting_manager_name
       FROM offer_requests o
       LEFT JOIN hr_departments dep ON dep.id=o.department_id
       LEFT JOIN hr_designations des ON des.id=o.designation_id
       LEFT JOIN projects proj ON proj.id=o.project_id
       LEFT JOIN users mgr ON mgr.id=o.reporting_manager_id
       WHERE o.id=$1 AND o.company_id=$2`,
      [req.params.id, req.user.company_id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Offer not found' });
    const approvals = await query(
      `SELECT a.*, u.name AS actioned_by_name FROM offer_approvals a LEFT JOIN users u ON u.id=a.actioned_by
       WHERE a.offer_id=$1 ORDER BY a.stage_order`,
      [req.params.id]
    );
    const letters = await query(`SELECT * FROM offer_letters WHERE offer_id=$1 ORDER BY generated_at DESC`, [req.params.id]);
    const appointments = await query(`SELECT * FROM appointment_letters WHERE offer_id=$1 ORDER BY generated_at DESC`, [req.params.id]);
    res.json({ data: { ...rows[0], approvals: approvals.rows, letters: letters.rows, appointments: appointments.rows } });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/requests', async (req, res) => {
  try {
    const companyId = req.user.company_id;
    const settings = await getOfferSettings(companyId);
    const {
      candidate_name, candidate_mobile, candidate_email, candidate_address,
      project_id, department_id, designation_id, employment_type, reporting_manager_id,
      work_location, site_location, ctc_annual, basic_salary, hra, special_allowance,
      bonus, incentives, probation_period_days, notice_period_days,
    } = req.body;
    if (!candidate_name) return res.status(400).json({ error: 'candidate_name is required' });

    const { rows: cnt } = await query(`SELECT COUNT(*)::int AS cnt FROM offer_requests WHERE company_id=$1`, [companyId]);
    const offerNumber = `${settings.offer_number_prefix}/${new Date().getFullYear()}/${String(cnt[0].cnt + 1).padStart(4, '0')}`;

    const { rows } = await query(
      `INSERT INTO offer_requests (company_id, offer_number, candidate_name, candidate_mobile, candidate_email, candidate_address,
         project_id, department_id, designation_id, employment_type, reporting_manager_id, work_location, site_location,
         ctc_annual, basic_salary, hra, special_allowance, bonus, incentives, probation_period_days, notice_period_days, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22) RETURNING *`,
      [companyId, offerNumber, candidate_name, candidate_mobile || null, candidate_email || null, candidate_address || null,
       project_id || null, department_id || null, designation_id || null, employment_type || null, reporting_manager_id || null,
       work_location || null, site_location || null, ctc_annual || null, basic_salary || null, hra || null, special_allowance || null,
       bonus || null, incentives || null, probation_period_days || 180, notice_period_days || 30, req.user.id]
    );
    await addHistory(companyId, 'offer', rows[0].id, 'created', req.user.id, null);
    res.status(201).json({ data: rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/requests/:id', async (req, res) => {
  try {
    const fields = ['candidate_name', 'candidate_mobile', 'candidate_email', 'candidate_address', 'project_id', 'department_id',
      'designation_id', 'employment_type', 'reporting_manager_id', 'work_location', 'site_location', 'ctc_annual', 'basic_salary',
      'hra', 'special_allowance', 'bonus', 'incentives', 'probation_period_days', 'notice_period_days'];
    const sets = fields.map((f, i) => `${f}=$${i + 1}`).join(',');
    const values = fields.map(f => req.body[f] ?? null);
    const { rows } = await query(
      `UPDATE offer_requests SET ${sets}, updated_at=NOW() WHERE id=$${fields.length + 1} AND company_id=$${fields.length + 2} RETURNING *`,
      [...values, req.params.id, req.user.company_id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Offer not found' });
    res.json({ data: rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Submit for approval — seeds the approval chain from company settings.
router.post('/requests/:id/submit', async (req, res) => {
  try {
    const companyId = req.user.company_id;
    const settings = await getOfferSettings(companyId);
    const stages = settings.finance_stage_required ? settings.offer_stages : settings.offer_stages.filter(s => s !== 'Finance');
    const existing = await query(`SELECT id FROM offer_approvals WHERE offer_id=$1`, [req.params.id]);
    if (!existing.rows.length) await seedApprovalStages(companyId, 'offer_approvals', 'offer_id', req.params.id, stages);
    const { rows } = await query(
      `UPDATE offer_requests SET status='pending_approval', current_stage_order=1, updated_at=NOW() WHERE id=$1 AND company_id=$2 RETURNING *`,
      [req.params.id, companyId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Offer not found' });
    await addHistory(companyId, 'offer', req.params.id, 'submitted_for_approval', req.user.id, null);
    res.json({ data: rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════
// OFFER APPROVAL
// ═══════════════════════════════════════════════════════════
router.get('/approvals/pending', async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT o.id AS offer_id, o.offer_number, o.candidate_name, o.status, o.current_stage_order,
              a.id AS approval_id, a.stage_order, a.stage_label
       FROM offer_requests o
       JOIN offer_approvals a ON a.offer_id = o.id AND a.stage_order = o.current_stage_order AND a.status='pending'
       WHERE o.company_id=$1 AND o.status='pending_approval' ORDER BY o.created_at`,
      [req.user.company_id]
    );
    res.json({ data: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch('/requests/:id/approve', async (req, res) => {
  try {
    const companyId = req.user.company_id;
    const { remarks } = req.body;
    const { rows: offerRows } = await query(`SELECT * FROM offer_requests WHERE id=$1 AND company_id=$2`, [req.params.id, companyId]);
    if (!offerRows.length) return res.status(404).json({ error: 'Offer not found' });
    const offer = offerRows[0];
    await query(
      `UPDATE offer_approvals SET status='approved', actioned_by=$1, actioned_at=NOW(), remarks=$2
       WHERE offer_id=$3 AND stage_order=$4 AND status='pending'`,
      [req.user.id, remarks || null, offer.id, offer.current_stage_order]
    );
    const { rows: remaining } = await query(
      `SELECT MIN(stage_order) AS next FROM offer_approvals WHERE offer_id=$1 AND status='pending'`,
      [offer.id]
    );
    const nextStage = remaining[0].next;
    const { rows } = await query(
      nextStage
        ? `UPDATE offer_requests SET current_stage_order=$1, updated_at=NOW() WHERE id=$2 RETURNING *`
        : `UPDATE offer_requests SET status='approved', updated_at=NOW() WHERE id=$2 RETURNING *`,
      nextStage ? [nextStage, offer.id] : [null, offer.id]
    );
    await addHistory(companyId, 'offer', offer.id, 'stage_approved', req.user.id, remarks);
    res.json({ data: rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch('/requests/:id/reject', async (req, res) => {
  try {
    const { remarks } = req.body;
    const { rows: offerRows } = await query(`SELECT * FROM offer_requests WHERE id=$1 AND company_id=$2`, [req.params.id, req.user.company_id]);
    if (!offerRows.length) return res.status(404).json({ error: 'Offer not found' });
    const offer = offerRows[0];
    await query(
      `UPDATE offer_approvals SET status='rejected', actioned_by=$1, actioned_at=NOW(), remarks=$2
       WHERE offer_id=$3 AND stage_order=$4 AND status='pending'`,
      [req.user.id, remarks || null, offer.id, offer.current_stage_order]
    );
    const { rows } = await query(`UPDATE offer_requests SET status='rejected', updated_at=NOW() WHERE id=$1 RETURNING *`, [offer.id]);
    await addHistory(req.user.company_id, 'offer', offer.id, 'stage_rejected', req.user.id, remarks);
    res.json({ data: rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch('/requests/:id/send-back', async (req, res) => {
  try {
    const { remarks } = req.body;
    await query(`UPDATE offer_approvals SET status='pending', actioned_by=NULL, actioned_at=NULL WHERE offer_id=$1`, [req.params.id]);
    const { rows } = await query(
      `UPDATE offer_requests SET status='draft', current_stage_order=0, updated_at=NOW() WHERE id=$1 AND company_id=$2 RETURNING *`,
      [req.params.id, req.user.company_id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Offer not found' });
    await addHistory(req.user.company_id, 'offer', req.params.id, 'sent_back', req.user.id, remarks);
    res.json({ data: rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════
// OFFER LETTER — generate, preview, email, candidate-portal link
// ═══════════════════════════════════════════════════════════
function escHtml(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function interpolate(html, data) {
  return html.replace(/\{\{(\w+)\}\}/g, (_, key) => data[key] !== undefined && data[key] !== null ? escHtml(data[key]) : `{{${key}}}`);
}

router.post('/requests/:id/letter', async (req, res) => {
  try {
    const companyId = req.user.company_id;
    const { template_id, valid_days } = req.body;
    const { rows: offerRows } = await query(
      `SELECT o.*, dep.name AS department_name, des.name AS designation_name, c.name AS company_name
       FROM offer_requests o
       LEFT JOIN hr_departments dep ON dep.id=o.department_id
       LEFT JOIN hr_designations des ON des.id=o.designation_id
       LEFT JOIN companies c ON c.id=o.company_id
       WHERE o.id=$1 AND o.company_id=$2`,
      [req.params.id, companyId]
    );
    if (!offerRows.length) return res.status(404).json({ error: 'Offer not found' });
    if (offerRows[0].status !== 'approved') return res.status(400).json({ error: 'Offer must be fully approved before generating a letter' });
    const offer = offerRows[0];

    let tmpl = null;
    if (template_id) {
      const t = await query(`SELECT * FROM hr_letter_gen_templates WHERE id=$1 AND company_id=$2`, [template_id, companyId]);
      tmpl = t.rows[0];
    }
    const subject = tmpl ? interpolate(tmpl.subject || '', offer) : `Offer of Employment – ${offer.designation_name || ''} at ${offer.company_name}`;
    const body = tmpl ? interpolate(tmpl.body_html, offer) : `<p>Dear ${escHtml(offer.candidate_name)},</p>
<p>We are pleased to offer you the position of <strong>${escHtml(offer.designation_name || '')}</strong> in <strong>${escHtml(offer.department_name || '')}</strong> at <strong>${escHtml(offer.company_name)}</strong>.</p>
<p><strong>CTC:</strong> ₹${offer.ctc_annual || '—'} per annum<br><strong>Probation Period:</strong> ${offer.probation_period_days} days</p>
<p>Please respond to this offer using the secure link sent to your email.</p>`;

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + (valid_days || 7) * 86400000);
    const { rows } = await query(
      `INSERT INTO offer_letters (company_id, offer_id, template_id, subject, content_html, accept_token, token_expires_at, generated_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [companyId, offer.id, template_id || null, subject, body, token, expiresAt, req.user.id]
    );
    await addHistory(companyId, 'offer', offer.id, 'letter_generated', req.user.id, null);
    res.status(201).json({ data: rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/letters/:id/send', async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT ol.*, o.candidate_email, o.candidate_name, o.company_id FROM offer_letters ol
       JOIN offer_requests o ON o.id=ol.offer_id WHERE ol.id=$1 AND ol.company_id=$2`,
      [req.params.id, req.user.company_id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Letter not found' });
    const letter = rows[0];
    if (!letter.candidate_email) return res.status(400).json({ error: 'Candidate has no email on file' });

    const portalLink = `${getFrontendBaseUrl()}/offer/${letter.accept_token}`;
    const html = `${letter.content_html}<p style="margin-top:24px;"><a href="${portalLink}" style="background:#2563EB;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;">View &amp; Respond to Offer</a></p>`;
    try {
      await sendMail({ to: letter.candidate_email, subject: letter.subject, html, category: 'offer_letter' });
    } catch (mailErr) {
      return res.status(502).json({ error: `Letter saved but email failed to send: ${mailErr.message}` });
    }
    await query(`UPDATE offer_letters SET sent_at=NOW() WHERE id=$1`, [letter.id]);
    await query(`UPDATE offer_requests SET status='sent', updated_at=NOW() WHERE id=$1`, [letter.offer_id]);
    await addHistory(letter.company_id, 'offer', letter.offer_id, 'letter_sent', req.user.id, null);
    res.json({ data: { sent: true, portal_link: portalLink } });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════
// APPOINTMENT LETTER — generated after offer acceptance
// ═══════════════════════════════════════════════════════════
router.post('/requests/:id/appointment', async (req, res) => {
  try {
    const companyId = req.user.company_id;
    const { joining_date } = req.body;
    const { rows: offerRows } = await query(
      `SELECT o.*, dep.name AS department_name, des.name AS designation_name, c.name AS company_name
       FROM offer_requests o
       LEFT JOIN hr_departments dep ON dep.id=o.department_id
       LEFT JOIN hr_designations des ON des.id=o.designation_id
       LEFT JOIN companies c ON c.id=o.company_id
       WHERE o.id=$1 AND o.company_id=$2`,
      [req.params.id, companyId]
    );
    if (!offerRows.length) return res.status(404).json({ error: 'Offer not found' });
    const offer = offerRows[0];
    if (offer.status !== 'accepted') return res.status(400).json({ error: 'Offer must be accepted by the candidate first' });

    const settings = await getOfferSettings(companyId);
    const { rows: cnt } = await query(`SELECT COUNT(*)::int AS cnt FROM appointment_letters WHERE company_id=$1`, [companyId]);
    const apptNumber = `${settings.appointment_number_prefix}/${new Date().getFullYear()}/${String(cnt[0].cnt + 1).padStart(4, '0')}`;

    const content = `<p>Dear ${escHtml(offer.candidate_name)},</p>
<p>This is to confirm your appointment as <strong>${escHtml(offer.designation_name || '')}</strong> in <strong>${escHtml(offer.department_name || '')}</strong> at <strong>${escHtml(offer.company_name)}</strong>, effective <strong>${joining_date || '—'}</strong>.</p>
<p><strong>Probation Period:</strong> ${offer.probation_period_days} days<br><strong>Notice Period:</strong> ${offer.notice_period_days} days</p>`;

    const { rows } = await query(
      `INSERT INTO appointment_letters (company_id, offer_id, appointment_number, content_html, joining_date, generated_by)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [companyId, offer.id, apptNumber, content, joining_date || null, req.user.id]
    );
    const stages = settings.appointment_stages;
    await seedApprovalStages(companyId, 'appointment_approvals', 'appointment_id', rows[0].id, stages);
    await query(`UPDATE appointment_letters SET status='pending_approval', current_stage_order=1 WHERE id=$1`, [rows[0].id]);
    await addHistory(companyId, 'appointment', rows[0].id, 'created', req.user.id, null);
    res.status(201).json({ data: rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/appointments', async (req, res) => {
  try {
    const { status } = req.query;
    const params = [req.user.company_id];
    let where = `a.company_id=$1`;
    if (status) { where += ` AND a.status=$2`; params.push(status); }
    const { rows } = await query(
      `SELECT a.*, o.candidate_name, o.offer_number, dep.name AS department_name
       FROM appointment_letters a JOIN offer_requests o ON o.id=a.offer_id
       LEFT JOIN hr_departments dep ON dep.id=o.department_id
       WHERE ${where} ORDER BY a.generated_at DESC LIMIT 300`,
      params
    );
    res.json({ data: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/appointments/:id', async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT a.*, o.candidate_name, o.candidate_email, o.offer_number FROM appointment_letters a
       JOIN offer_requests o ON o.id=a.offer_id WHERE a.id=$1 AND a.company_id=$2`,
      [req.params.id, req.user.company_id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Appointment not found' });
    const approvals = await query(
      `SELECT ap.*, u.name AS actioned_by_name FROM appointment_approvals ap LEFT JOIN users u ON u.id=ap.actioned_by
       WHERE ap.appointment_id=$1 ORDER BY ap.stage_order`,
      [req.params.id]
    );
    res.json({ data: { ...rows[0], approvals: approvals.rows } });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════
// APPOINTMENT APPROVAL
// ═══════════════════════════════════════════════════════════
router.get('/appointment-approvals/pending', async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT a.id AS appointment_id, a.appointment_number, o.candidate_name, a.status, a.current_stage_order,
              ap.id AS approval_id, ap.stage_order, ap.stage_label
       FROM appointment_letters a
       JOIN offer_requests o ON o.id = a.offer_id
       JOIN appointment_approvals ap ON ap.appointment_id = a.id AND ap.stage_order = a.current_stage_order AND ap.status='pending'
       WHERE a.company_id=$1 AND a.status='pending_approval' ORDER BY a.generated_at`,
      [req.user.company_id]
    );
    res.json({ data: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch('/appointments/:id/approve', async (req, res) => {
  try {
    const companyId = req.user.company_id;
    const { remarks } = req.body;
    const { rows: apRows } = await query(`SELECT * FROM appointment_letters WHERE id=$1 AND company_id=$2`, [req.params.id, companyId]);
    if (!apRows.length) return res.status(404).json({ error: 'Appointment not found' });
    const appt = apRows[0];
    await query(
      `UPDATE appointment_approvals SET status='approved', actioned_by=$1, actioned_at=NOW(), remarks=$2
       WHERE appointment_id=$3 AND stage_order=$4 AND status='pending'`,
      [req.user.id, remarks || null, appt.id, appt.current_stage_order]
    );
    const { rows: remaining } = await query(
      `SELECT MIN(stage_order) AS next FROM appointment_approvals WHERE appointment_id=$1 AND status='pending'`,
      [appt.id]
    );
    const nextStage = remaining[0].next;
    const { rows } = await query(
      nextStage
        ? `UPDATE appointment_letters SET current_stage_order=$1 WHERE id=$2 RETURNING *`
        : `UPDATE appointment_letters SET status='released' WHERE id=$2 RETURNING *`,
      nextStage ? [nextStage, appt.id] : [null, appt.id]
    );
    await addHistory(companyId, 'appointment', appt.id, nextStage ? 'stage_approved' : 'released', req.user.id, remarks);
    res.json({ data: rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch('/appointments/:id/reject', async (req, res) => {
  try {
    const { remarks } = req.body;
    const { rows: apRows } = await query(`SELECT * FROM appointment_letters WHERE id=$1 AND company_id=$2`, [req.params.id, req.user.company_id]);
    if (!apRows.length) return res.status(404).json({ error: 'Appointment not found' });
    const appt = apRows[0];
    await query(
      `UPDATE appointment_approvals SET status='rejected', actioned_by=$1, actioned_at=NOW(), remarks=$2
       WHERE appointment_id=$3 AND stage_order=$4 AND status='pending'`,
      [req.user.id, remarks || null, appt.id, appt.current_stage_order]
    );
    await query(`UPDATE appointment_letters SET status='draft' WHERE id=$1`, [appt.id]);
    await addHistory(req.user.company_id, 'appointment', appt.id, 'stage_rejected', req.user.id, remarks);
    res.json({ data: { rejected: true } });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/appointments/:id/send', async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT a.*, o.candidate_email, o.candidate_name, o.company_id FROM appointment_letters a
       JOIN offer_requests o ON o.id=a.offer_id WHERE a.id=$1 AND a.company_id=$2`,
      [req.params.id, req.user.company_id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Appointment not found' });
    const appt = rows[0];
    if (appt.status !== 'released') return res.status(400).json({ error: 'Appointment must be fully approved before sending' });
    if (!appt.candidate_email) return res.status(400).json({ error: 'Candidate has no email on file' });
    try {
      await sendMail({ to: appt.candidate_email, subject: `Appointment Letter – ${appt.appointment_number}`, html: appt.content_html, category: 'appointment_letter' });
    } catch (mailErr) {
      return res.status(502).json({ error: `Email failed to send: ${mailErr.message}` });
    }
    await addHistory(appt.company_id, 'appointment', appt.id, 'sent', req.user.id, null);
    res.json({ data: { sent: true } });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════
// DOCUMENT TEMPLATES — reuses hr_letter_gen_templates
// ═══════════════════════════════════════════════════════════
const OFFER_TEMPLATE_TYPES = ['offer', 'appointment', 'promotion', 'transfer', 'confirmation', 'increment', 'contract_renewal'];
router.get('/templates', async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT * FROM hr_letter_gen_templates WHERE company_id=$1 AND type = ANY($2::text[]) ORDER BY type, name`,
      [req.user.company_id, OFFER_TEMPLATE_TYPES]
    );
    res.json({ data: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════
// DIGITAL SIGNATURES — company seal / director signature in companies.settings;
// individual approver signatures come from users.signature_url (no write here).
// ═══════════════════════════════════════════════════════════
router.get('/signatures', async (req, res) => {
  try {
    const settings = await getOfferSettings(req.user.company_id);
    res.json({ data: { company_seal: settings.company_seal, director_signature: settings.director_signature } });
  } catch (err) { res.status(500).json({ error: err.message }); }
});
router.put('/signatures', async (req, res) => {
  try {
    const { company_seal, director_signature } = req.body;
    for (const img of [company_seal, director_signature]) {
      if (img && !/^data:image\/(png|jpe?g|webp|gif);base64,/i.test(img)) {
        return res.status(400).json({ error: 'Signature/seal must be a base64 image data URI' });
      }
      if (img && img.length > Math.ceil((2 * 1024 * 1024 * 4) / 3)) {
        return res.status(400).json({ error: 'Image too large (max ~1.5MB)' });
      }
    }
    const { rows } = await query(`SELECT settings FROM companies WHERE id=$1`, [req.user.company_id]);
    const current = rows[0]?.settings || {};
    const nextOffers = { ...DEFAULT_OFFER_SETTINGS, ...(current.offers || {}), company_seal: company_seal ?? current.offers?.company_seal, director_signature: director_signature ?? current.offers?.director_signature };
    await query(`UPDATE companies SET settings=$1, updated_at=NOW() WHERE id=$2`, [JSON.stringify({ ...current, offers: nextOffers }), req.user.company_id]);
    res.json({ data: { company_seal: nextOffers.company_seal, director_signature: nextOffers.director_signature } });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════
// EMAIL & DELIVERY — best-effort view over offer_letters/appointment_letters sent_at + history
// ═══════════════════════════════════════════════════════════
router.get('/email-log', async (req, res) => {
  try {
    const companyId = req.user.company_id;
    const offerEmails = await query(
      `SELECT ol.id, 'offer' AS type, o.candidate_name, o.candidate_email, ol.sent_at, ol.opened_at, ol.acceptance_status
       FROM offer_letters ol JOIN offer_requests o ON o.id=ol.offer_id
       WHERE ol.company_id=$1 AND ol.sent_at IS NOT NULL`,
      [companyId]
    );
    const apptEmails = await query(
      `SELECT h.entity_id AS id, 'appointment' AS type, o.candidate_name, o.candidate_email, h.created_at AS sent_at, NULL AS opened_at, a.status AS acceptance_status
       FROM offer_letter_history h
       JOIN appointment_letters a ON a.id = h.entity_id
       JOIN offer_requests o ON o.id = a.offer_id
       WHERE h.company_id=$1 AND h.entity_type='appointment' AND h.action='sent'`,
      [companyId]
    );
    const rows = [...offerEmails.rows, ...apptEmails.rows].sort((a, b) => new Date(b.sent_at) - new Date(a.sent_at));
    res.json({ data: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════
// LETTER HISTORY
// ═══════════════════════════════════════════════════════════
router.get('/history', async (req, res) => {
  try {
    const companyId = req.user.company_id;
    const { entity_type } = req.query;
    const params = [companyId];
    let where = `h.company_id=$1`;
    if (entity_type) { where += ` AND h.entity_type=$2`; params.push(entity_type); }
    const { rows } = await query(
      `SELECT h.*, u.name AS actor_name FROM offer_letter_history h LEFT JOIN users u ON u.id=h.actor_id
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
  offers_sent: { label: 'Offers Sent', sql: `SELECT offer_number, candidate_name, candidate_email, status, created_at FROM offer_requests WHERE company_id=$1 AND status != 'draft' ORDER BY created_at DESC` },
  offers_accepted: { label: 'Offers Accepted', sql: `SELECT offer_number, candidate_name, updated_at FROM offer_requests WHERE company_id=$1 AND status='accepted' ORDER BY updated_at DESC` },
  offers_rejected: { label: 'Offers Rejected', sql: `SELECT offer_number, candidate_name, updated_at FROM offer_requests WHERE company_id=$1 AND status IN ('rejected','declined') ORDER BY updated_at DESC` },
  pending_acceptance: { label: 'Pending Acceptance', sql: `SELECT offer_number, candidate_name, candidate_email, created_at FROM offer_requests WHERE company_id=$1 AND status='sent' ORDER BY created_at DESC` },
  appointment_letters_issued: { label: 'Appointment Letters Issued', sql: `SELECT appointment_number, joining_date, status FROM appointment_letters WHERE company_id=$1 AND status='released' ORDER BY joining_date DESC` },
  joining_report: { label: 'Joining Report', sql: `SELECT a.appointment_number, o.candidate_name, a.joining_date FROM appointment_letters a JOIN offer_requests o ON o.id=a.offer_id WHERE a.company_id=$1 AND a.joining_date IS NOT NULL ORDER BY a.joining_date` },
};
router.get('/reports/:key', async (req, res) => {
  try {
    const report = REPORTS[req.params.key];
    if (!report) return res.status(404).json({ error: 'Unknown report' });
    const { rows } = await query(report.sql, [req.user.company_id]);
    res.json({ data: rows, label: report.label });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════
// SETTINGS
// ═══════════════════════════════════════════════════════════
router.get('/settings', async (req, res) => {
  try { res.json({ data: await getOfferSettings(req.user.company_id) }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});
router.put('/settings', async (req, res) => {
  try {
    const { rows } = await query(`SELECT settings FROM companies WHERE id=$1`, [req.user.company_id]);
    const current = rows[0]?.settings || {};
    const merged = { ...DEFAULT_OFFER_SETTINGS, ...(current.offers || {}), ...req.body };
    await query(`UPDATE companies SET settings=$1, updated_at=NOW() WHERE id=$2`, [JSON.stringify({ ...current, offers: merged }), req.user.company_id]);
    res.json({ data: merged });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
