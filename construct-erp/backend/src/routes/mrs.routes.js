// src/routes/mrs.routes.js — Material Requisition Slips
const express = require('express');
const { authenticate } = require('../middleware/auth');
const { loadProjectScope, userCanAccessProject, appendProjectScope } = require('../middleware/projectScope');
const { query, withTransaction } = require('../config/database');
const { sendMail } = require('../services/mail.service');
const { createNotification } = require('../controllers/notification.controller');
const { sendPushToUsersByEmail, sendPushToUser } = require('../services/fcm.service');
const router = express.Router();

const DEFAULT_STORES_MRS_EMAILS = 'vijayan@bcim.in';
const DEFAULT_PROCUREMENT_MRS_EMAILS = 'bkmanjunath@bcim.in,praveen@bcim.in';
const DEFAULT_MGMT_NOTIFY_EMAILS = 'stephen@bcim.in,biswal@bcim.in,lathis@bcim.in';

const parseEmails = (value, fallback = '') =>
  String(value || fallback)
    .split(',')
    .map(s => s.trim().toLowerCase())
    .filter(Boolean);

const getPublicFrontendUrl = () => {
  const configured = process.env.PUBLIC_FRONTEND_URL || process.env.FRONTEND_URL || '';
  if (!configured || /localhost|127\.0\.0\.1/i.test(configured)) return 'http://bcim.ddns.net:3000';
  return configured.replace(/\/$/, '');
};

const esc = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const mrsRef = (mrs) => mrs.serial_no_formatted || mrs.mrs_number || mrs.id;

async function getActiveUsersByEmails(companyId, emails) {
  if (!emails.length) return [];
  const { rows } = await query(
    `SELECT id, name, email
     FROM users
     WHERE company_id = $1
       AND is_active = TRUE
       AND LOWER(email) = ANY($2::text[])`,
    [companyId, emails]
  );
  return rows;
}

function buildMRSMail({ title, message, mrs, actionLabel }) {
  const appUrl = getPublicFrontendUrl();
  const link = `${appUrl}/stores/mrs`;
  const ref = esc(mrsRef(mrs));
  const project = esc(mrs.project_name || mrs.head_office_project_name || '-');
  const raisedBy = esc(mrs.raised_by_name || mrs.raised_by_email || '-');
  const itemCount = Array.isArray(mrs.items) ? mrs.items.length : Number(mrs.item_count || 0);
  const text = [
    title,
    '',
    message,
    '',
    `MRS No: ${mrsRef(mrs)}`,
    `Project: ${mrs.project_name || mrs.head_office_project_name || '-'}`,
    `Department: ${mrs.department || '-'}`,
    `Raised By: ${mrs.raised_by_name || mrs.raised_by_email || '-'}`,
    `Items: ${itemCount}`,
    '',
    `Open ERP: ${link}`,
  ].join('\n');

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:680px;margin:0 auto;color:#0f172a">
      <div style="background:#0a2057;color:#fff;padding:18px 24px;border-radius:8px 8px 0 0">
        <h2 style="margin:0;font-size:18px">${esc(title)}</h2>
      </div>
      <div style="border:1px solid #dbe4f0;border-top:none;padding:22px 24px;border-radius:0 0 8px 8px;background:#f8fafc">
        <p style="margin:0 0 18px;line-height:1.5;color:#334155">${esc(message)}</p>
        <table style="border-collapse:collapse;width:100%;font-size:14px;background:#fff">
          <tr><td style="padding:9px;border:1px solid #e2e8f0;font-weight:700;width:150px">MRS No</td><td style="padding:9px;border:1px solid #e2e8f0">${ref}</td></tr>
          <tr><td style="padding:9px;border:1px solid #e2e8f0;font-weight:700">Project</td><td style="padding:9px;border:1px solid #e2e8f0">${project}</td></tr>
          <tr><td style="padding:9px;border:1px solid #e2e8f0;font-weight:700">Department</td><td style="padding:9px;border:1px solid #e2e8f0">${esc(mrs.department || '-')}</td></tr>
          <tr><td style="padding:9px;border:1px solid #e2e8f0;font-weight:700">Raised By</td><td style="padding:9px;border:1px solid #e2e8f0">${raisedBy}</td></tr>
          <tr><td style="padding:9px;border:1px solid #e2e8f0;font-weight:700">Items</td><td style="padding:9px;border:1px solid #e2e8f0">${itemCount}</td></tr>
        </table>
        <p style="margin:22px 0 0;text-align:center">
          <a href="${link}" style="display:inline-block;background:#0a2057;color:#fff;text-decoration:none;padding:11px 22px;border-radius:6px;font-weight:700">${esc(actionLabel || 'Open MRS')}</a>
        </p>
        <p style="margin:18px 0 0;font-size:11px;color:#64748b">This is an automated BCIM ERP notification.</p>
      </div>
    </div>
  `;
  return { subject: title, text, html, link: '/stores/mrs' };
}

async function sendMRSWorkflowNotification({ companyId, emails, title, message, mrs, severity = 'info', actionLabel }) {
  try {
    const recipients = [...new Set(emails)];
    if (!recipients.length) return;

    const users = await getActiveUsersByEmails(companyId, recipients);
    const mail = buildMRSMail({ title, message, mrs, actionLabel });

    for (const user of users) {
      await createNotification({
        company_id: companyId,
        user_id: user.id,
        type: 'mrs_workflow',
        title,
        message,
        link: mail.link,
        severity,
        related_type: 'material_requisition',
        related_id: mrs.id,
      });
    }

    const result = await sendMail({ to: recipients, subject: mail.subject, text: mail.text, html: mail.html });
    console.log(`[mrs-mail] ${title} -> ${result.sent ? 'sent' : result.reason}`);
  } catch (err) {
    console.error('[mrs-mail] notification failed:', err.message);
  }
}

function notifyStoresForNewMRS({ companyId, mrs }) {
  const emails = parseEmails(process.env.MRS_STORES_NOTIFY_EMAILS, DEFAULT_STORES_MRS_EMAILS);
  sendMRSWorkflowNotification({
    companyId,
    emails,
    title: `New MR Raised: ${mrsRef(mrs)}`,
    message: 'A new material requisition has been raised. Please check and complete Stores approval.',
    mrs,
    severity: 'warning',
    actionLabel: 'Review MR in Stores',
  });
}

// Notify procurement team + stephen when a new MRS is created
function notifyProcurementForNewMRS({ companyId, mrs }) {
  const procEmails = parseEmails(process.env.MRS_PROCUREMENT_NOTIFY_EMAILS, DEFAULT_PROCUREMENT_MRS_EMAILS);
  const mgmtEmails = parseEmails(process.env.MRS_MGMT_NOTIFY_EMAILS, DEFAULT_MGMT_NOTIFY_EMAILS);
  const emails = [...new Set([...procEmails, ...mgmtEmails])];
  sendMRSWorkflowNotification({
    companyId,
    emails,
    title: `New MR Raised: ${mrsRef(mrs)}`,
    message: `A new material requisition has been raised by ${mrs.raised_by_name || mrs.raised_by_email || 'site'}. Please review for procurement planning.`,
    mrs,
    severity: 'warning',
    actionLabel: 'View MR',
  });
}

// Notify procurement team + stephen when MRS is fully approved (approved_md)
function notifyProcurementAfterMDApproval({ companyId, mrs }) {
  const procEmails  = parseEmails(process.env.MRS_PROCUREMENT_NOTIFY_EMAILS, DEFAULT_PROCUREMENT_MRS_EMAILS);
  const mgmtEmails  = parseEmails(process.env.MRS_MGMT_NOTIFY_EMAILS, DEFAULT_MGMT_NOTIFY_EMAILS);
  const storesEmails = parseEmails(process.env.MRS_STORES_NOTIFY_EMAILS, DEFAULT_STORES_MRS_EMAILS);
  const emails = [...new Set([...procEmails, ...mgmtEmails, ...storesEmails])];
  sendMRSWorkflowNotification({
    companyId,
    emails,
    title: `MR Fully Approved: ${mrsRef(mrs)}`,
    message: 'The material requisition has completed all approvals (MD signed off). Procurement can proceed with RFQ / PO action.',
    mrs,
    severity: 'info',
    actionLabel: 'Open MR for Procurement',
  });
}
// Public Verification Endpoint (No Auth required for QR scanning)
router.get('/public/verify/:id', async (req, res) => {
  try {
    const mrs = await query(
      `SELECT mr.serial_no_formatted, mr.status, mr.created_at, mr.department,
              p.name AS project_name, p.project_code,
              u.name AS raised_by_name, u.signature_url AS raised_by_sig,
              sv.name AS stores_verified_name, sv.signature_url AS stores_verified_sig,
              mr.stores_approved_at,
              t.name AS verified_tower_name, t.signature_url AS verified_tower_sig,
              mr.verified_tower_mgr_at,
              pm.name AS approved_pm_name, pm.signature_url AS approved_pm_sig,
              mr.approved_pm_at,
              spm.name AS approved_srpm_name, spm.signature_url AS approved_srpm_sig,
              mr.approved_sr_pm_at,
              mgmt.name AS approved_mgmt_name, mgmt.signature_url AS approved_mgmt_sig,
              mr.approved_mgmt_at,
              md.name AS approved_md_name, md.signature_url AS approved_md_sig,
              mr.approved_md_at
       FROM material_requisitions mr
       JOIN projects p ON mr.project_id = p.id
       JOIN users u ON mr.raised_by = u.id
       LEFT JOIN users sv ON sv.id::text = mr.stores_approved_by
       LEFT JOIN users t ON mr.verified_tower_mgr_by = t.id
       LEFT JOIN users pm ON mr.approved_pm_by = pm.id
       LEFT JOIN users spm ON mr.approved_sr_pm_by = spm.id
       LEFT JOIN users mgmt ON mr.approved_mgmt_by = mgmt.id
       LEFT JOIN users md ON mr.approved_md_by = md.id
       WHERE mr.id = $1::uuid`,
      [req.params.id]
    );
    if (!mrs.rows.length) return res.status(404).json({ error: 'MRS not found' });
    
    const items = await query(
      `SELECT material_name, quantity, unit, sort_order FROM mrs_items WHERE mrs_id = $1::uuid ORDER BY sort_order`,
      [req.params.id]
    );
    res.json({
      data: {
        ...mrs.rows[0],
        mrs_workflow: { stages: normalizeStageIds(mrs.rows[0].mrs_workflow?.stages) },
        items: items.rows,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.use(authenticate);
router.use(loadProjectScope);

// Auto-add columns + per-project workflow config
(async () => {
  const safe = async (sql) => { try { await query(sql); } catch {} };
  await safe(`ALTER TABLE material_requisitions ADD COLUMN IF NOT EXISTS raised_sig_img TEXT`);
  await safe(`ALTER TABLE material_requisitions ADD COLUMN IF NOT EXISTS tower_sig_img TEXT`);
  await safe(`ALTER TABLE material_requisitions ADD COLUMN IF NOT EXISTS pm_sig_img TEXT`);
  await safe(`ALTER TABLE material_requisitions ADD COLUMN IF NOT EXISTS srpm_sig_img TEXT`);
  await safe(`ALTER TABLE material_requisitions ADD COLUMN IF NOT EXISTS mgmt_sig_img TEXT`);
  await safe(`ALTER TABLE material_requisitions ADD COLUMN IF NOT EXISTS md_sig_img TEXT`);
  await safe(`ALTER TABLE material_requisitions ADD COLUMN IF NOT EXISTS stores_approved_by UUID REFERENCES users(id)`);
  await safe(`ALTER TABLE material_requisitions ADD COLUMN IF NOT EXISTS stores_approved_at TIMESTAMPTZ`);
  await safe(`ALTER TABLE material_requisitions ADD COLUMN IF NOT EXISTS stores_sig_img TEXT`);
  // Per-project workflow config stored on the projects table
  await safe(`ALTER TABLE projects ADD COLUMN IF NOT EXISTS mrs_workflow JSONB`);
  console.log('[mrs] schema OK');
})();

/* ── Master stage definitions (ALL possible stages, in order) ─────────────
   Each project's mrs_workflow.stages[] picks a SUBSET of these IDs.
   If a project has no workflow config → ALL stages apply (standard).
─────────────────────────────────────────────────────────────────────────── */
const ALL_STAGES = [
  { id: 'stores-approve', nextStatus: 'stores_verified', colBy: 'stores_approved_by', colAt: 'stores_approved_at', sigCol: 'stores_sig_img', label: 'Store Manager' },
  { id: 'approve-pm',     nextStatus: 'approved_pm',     colBy: 'approved_pm_by',     colAt: 'approved_pm_at',     sigCol: 'pm_sig_img',     label: 'Project Manager', legacyPrev: ['verified_tower'] },
  { id: 'approve-mgmt',   nextStatus: 'approved_mgmt',   colBy: 'approved_mgmt_by',   colAt: 'approved_mgmt_at',   sigCol: 'mgmt_sig_img',   label: 'Project Director', legacyPrev: ['approved_srpm'] },
  { id: 'approve-md',     nextStatus: 'approved_md',     colBy: 'approved_md_by',     colAt: 'approved_md_at',     sigCol: 'md_sig_img',     label: 'Managing Director' },
];
const DEFAULT_STAGE_IDS = ALL_STAGES.map(s => s.id);

/* Build a dynamic chain for a given list of enabled stage IDs.
   Returns an object keyed by stageId → { nextStatus, requiredPrev, colBy, colAt, sigCol }
*/
function buildChain(enabledStageIds) {
  const normalizedIds = normalizeStageIds(enabledStageIds);
  const enabled = ALL_STAGES.filter(s => normalizedIds.includes(s.id));
  const chain = {};
  enabled.forEach((stage, i) => {
    chain[stage.id] = {
      ...stage,
      requiredPrev: i === 0 ? 'pending' : enabled[i - 1].nextStatus,
    };
  });
  return chain;
}

function normalizeStageIds(stageIds) {
  if (!Array.isArray(stageIds) || !stageIds.length) return DEFAULT_STAGE_IDS;
  const valid = new Set(DEFAULT_STAGE_IDS);
  const normalized = stageIds.filter(id => valid.has(id));
  return normalized.length ? normalized : DEFAULT_STAGE_IDS;
}

/* Load project workflow from DB — returns array of stage IDs (or default = all) */
async function getProjectWorkflow(projectId) {
  try {
    const r = await query(`SELECT mrs_workflow FROM projects WHERE id = $1`, [projectId]);
    if (r.rows.length && r.rows[0].mrs_workflow?.stages?.length) {
      return normalizeStageIds(r.rows[0].mrs_workflow.stages);
    }
  } catch {}
  // Default: all stages
  return DEFAULT_STAGE_IDS;
}

// Keep legacy APPROVAL_STAGES for backward compatibility (used if stage route can't load project)
const APPROVAL_STAGES = buildChain(DEFAULT_STAGE_IDS);

// GET /stores/mrs
router.get('/', async (req, res) => {
  try {
    const { project_id, status } = req.query;
    let sql = `
      SELECT mr.*, p.name AS project_name,
             u.name AS raised_by_name, a.name AS approved_by_name
      FROM material_requisitions mr
      JOIN projects p ON mr.project_id = p.id
      JOIN users u ON mr.raised_by = u.id
      LEFT JOIN users a ON mr.approved_by = a.id
      WHERE p.company_id = $1`;
    let params = [req.user.company_id];
    let i = 2;
    if (project_id) { sql += ` AND mr.project_id = $${i++}`; params.push(project_id); }
    if (status)     { sql += ` AND mr.status = $${i++}`;     params.push(status); }
    // enforce project-level scope for non-global roles
    ({ sql, params } = appendProjectScope(req, sql, params, 'mr'));
    sql += ` ORDER BY mr.created_at DESC`;
    const result = await query(sql, params);

    // Fetch items for each MRS
    const ids = result.rows.map(r => r.id);
    let itemsMap = {};
    if (ids.length) {
      const items = await query(
        `SELECT * FROM mrs_items WHERE mrs_id = ANY($1::uuid[]) ORDER BY sort_order`,
        [ids]
      );
      items.rows.forEach(it => {
        if (!itemsMap[it.mrs_id]) itemsMap[it.mrs_id] = [];
        itemsMap[it.mrs_id].push(it);
      });
    }
    const data = result.rows.map(r => ({ ...r, items: itemsMap[r.id] || [] }));
    res.json({ data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /stores/mrs/:id
router.get('/:id', async (req, res) => {
  try {
    const mrs = await query(
      `SELECT mr.*,
              mr.tower_sig_img, mr.pm_sig_img, mr.srpm_sig_img, mr.mgmt_sig_img, mr.md_sig_img,
              p.name AS project_name, p.project_code, p.company_id, p.mrs_workflow,
              u.name AS raised_by_name, u.signature_url AS raised_by_sig,
              t.name AS verified_tower_name, t.signature_url AS verified_tower_sig,
              pm.name AS approved_pm_name, pm.signature_url AS approved_pm_sig,
              spm.name AS approved_srpm_name, spm.signature_url AS approved_srpm_sig,
              mgmt.name AS approved_mgmt_name, mgmt.signature_url AS approved_mgmt_sig,
              md.name AS approved_md_name, md.signature_url AS approved_md_sig,
              proc.name AS processed_by_name
       FROM material_requisitions mr
       JOIN projects p ON mr.project_id = p.id
       JOIN users u ON mr.raised_by = u.id
       LEFT JOIN users t ON mr.verified_tower_mgr_by = t.id
       LEFT JOIN users pm ON mr.approved_pm_by = pm.id
       LEFT JOIN users spm ON mr.approved_sr_pm_by = spm.id
       LEFT JOIN users mgmt ON mr.approved_mgmt_by = mgmt.id
       LEFT JOIN users md ON mr.approved_md_by = md.id
       LEFT JOIN users proc ON mr.processed_by = proc.id
       WHERE mr.id = $1`,
      [req.params.id]
    );
    if (!mrs.rows.length || mrs.rows[0].company_id !== req.user.company_id) {
      return res.status(404).json({ error: 'MRS not found' });
    }
    if (!userCanAccessProject(req, mrs.rows[0].project_id)) {
      return res.status(403).json({ error: 'You do not have access to this project.' });
    }
    const items = await query(
      `SELECT * FROM mrs_items WHERE mrs_id = $1 ORDER BY sort_order`,
      [req.params.id]
    );
    res.json({
      data: {
        ...mrs.rows[0],
        mrs_workflow: { stages: normalizeStageIds(mrs.rows[0].mrs_workflow?.stages) },
        items: items.rows,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /stores/mrs
router.post('/', async (req, res) => {
  try {
    const { project_id, department, head_office_project_name, site_incharge, required_by, priority, remarks, items } = req.body;
    if (!project_id || !items?.length) {
      return res.status(400).json({ error: 'project_id and at least one item are required' });
    }
    if (!userCanAccessProject(req, project_id)) {
      return res.status(403).json({ error: 'You do not have access to this project.' });
    }

    const result = await withTransaction(async (client) => {
      // Verify project belongs to company
      const proj = await client.query(
        `SELECT id, name, project_code, mrs_prefix FROM projects WHERE id = $1 AND company_id = $2`,
        [project_id, req.user.company_id]
      );
      if (!proj.rows.length) throw Object.assign(new Error('Project not found'), { status: 404 });

      // Per-project sequence: find the highest trailing number used so far for this project
      const seqRes = await client.query(
        `SELECT COALESCE(MAX(
           CASE
             WHEN serial_no_formatted ~ '-[0-9]+$'
             THEN CAST(REGEXP_REPLACE(serial_no_formatted, '^.*-([0-9]+)$', '\\1') AS INTEGER)
             ELSE 0
           END
         ), 0) AS last_seq
         FROM material_requisitions
         WHERE project_id = $1`,
        [project_id]
      );
      const nextSeq = parseInt(seqRes.rows[0].last_seq) + 1;
      const seq     = String(nextSeq).padStart(3, '0');

      const yr          = new Date().getFullYear();
      const mrs_number  = `MRS-${yr}-${seq}`;

      // Use project-specific prefix if configured, otherwise fall back to default format
      const mrsPrefix = proj.rows[0].mrs_prefix;
      const deptCode  = (department || 'GEN').substring(0, 3).toUpperCase();
      const projectCode = proj.rows[0].project_code || 'PRJ';
      const serial_no_formatted = mrsPrefix
        ? `${mrsPrefix}-${seq}`
        : `BCIM-${projectCode}-${deptCode}-MR-${seq}`;

      const mrs = await client.query(
        `INSERT INTO material_requisitions (
           project_id, mrs_number, serial_no_formatted, department, 
           head_office_project_name, site_incharge, required_by, 
           priority, remarks, raised_by, status
         )
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'pending') RETURNING *`,
        [
          project_id, mrs_number, serial_no_formatted, department, 
          head_office_project_name || proj.rows[0].name, 
          site_incharge, required_by, priority || 'normal', remarks, req.user.id
        ]
      );

      // Insert items
      const inserted = [];
      for (let i = 0; i < items.length; i++) {
        const { material, qty, unit, purpose } = items[i];
        if (!material || !qty || !unit) continue;
        const it = await client.query(
          `INSERT INTO mrs_items (mrs_id, material_name, quantity, unit, purpose, sort_order)
           VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
          [mrs.rows[0].id, material, parseFloat(qty), unit, purpose, i + 1]
        );
        inserted.push(it.rows[0]);
      }

      return {
        ...mrs.rows[0],
        project_name: proj.rows[0].name,
        raised_by_name: req.user.name || req.user.email,
        raised_by_email: req.user.email,
        items: inserted,
      };
    });

    notifyStoresForNewMRS({ companyId: req.user.company_id, mrs: result });
    notifyProcurementForNewMRS({ companyId: req.user.company_id, mrs: result });

    // Push notification to stores team
    const storesEmails = parseEmails(process.env.MRS_STORES_NOTIFY_EMAILS, DEFAULT_STORES_MRS_EMAILS);
    sendPushToUsersByEmail(req.user.company_id, storesEmails, {
      title: `New MR Raised: ${mrsRef(result)}`,
      body: `${result.raised_by_name || 'Site'} raised MR for ${result.project_name || 'a project'}. Needs stores approval.`,
      data: { link: '/stores/mrs', type: 'mr_raised', related_id: result.id },
    }).catch(() => {});

    res.status(201).json({ message: 'MRS submitted successfully', data: result });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// ── GET /stores/mrs/workflow-config  — list all projects with their workflow ──
router.get('/workflow-config', async (req, res) => {
  try {
    const r = await query(
      `SELECT id, name, project_code, mrs_workflow
       FROM projects WHERE company_id = $1 ORDER BY name`,
      [req.user.company_id]
    );
    // Attach resolved stage list to each project
    const projects = r.rows.map(p => ({
      ...p,
      stages: normalizeStageIds(p.mrs_workflow?.stages),
      is_custom: !!(p.mrs_workflow?.stages?.length),
    }));
    res.json({ data: { projects, allStages: ALL_STAGES.map(s => ({ id: s.id, label: s.label })) } });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── PUT /stores/mrs/workflow-config/:project_id  — save workflow for a project ──
router.put('/workflow-config/:project_id', async (req, res) => {
  try {
    const { stages } = req.body; // array of stage IDs in order, or null = reset to default
    const cid = req.user.company_id;

    // Validate
    if (stages !== null && stages !== undefined) {
      const valid = DEFAULT_STAGE_IDS;
      const invalid = stages.filter(s => !valid.includes(s));
      if (invalid.length) return res.status(400).json({ error: `Unknown stages: ${invalid.join(', ')}` });
      if (normalizeStageIds(stages).length < 1) return res.status(400).json({ error: 'At least one stage required' });
    }

    const workflow = stages ? { stages: normalizeStageIds(stages) } : null;
    const r = await query(
      `UPDATE projects SET mrs_workflow = $1 WHERE id = $2 AND company_id = $3 RETURNING name`,
      [workflow ? JSON.stringify(workflow) : null, req.params.project_id, cid]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Project not found' });

    res.json({ message: `Workflow updated for ${r.rows[0].name}` });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PATCH /stores/mrs/:id/reject — Anyone in the chain can reject
// NOTE: must be registered BEFORE /:id/:stage to avoid the wildcard swallowing it
router.patch('/:id/reject', async (req, res) => {
  try {
    const { remarks } = req.body;
    const mrs = await query(
      `SELECT mr.*, p.company_id FROM material_requisitions mr
       JOIN projects p ON mr.project_id = p.id WHERE mr.id = $1`,
      [req.params.id]
    );
    if (!mrs.rows.length || mrs.rows[0].company_id !== req.user.company_id) {
      return res.status(404).json({ error: 'MRS not found' });
    }
    if (!userCanAccessProject(req, mrs.rows[0].project_id)) {
      return res.status(403).json({ error: 'You do not have access to this project.' });
    }

    await query(
      `UPDATE material_requisitions
       SET status = 'rejected', rejected_by = $1, rejected_at = NOW(), remarks = $2, updated_at = NOW()
       WHERE id = $3`,
      [req.user.id, remarks || 'Rejected by workflow', req.params.id]
    );

    // Push to MR raiser that their MR was rejected
    if (mrs.rows[0].raised_by) {
      sendPushToUser(mrs.rows[0].raised_by, {
        title: `MR Rejected: ${mrsRef(mrs.rows[0])}`,
        body: `Your material request was rejected by ${req.user.name || req.user.email}. ${remarks ? `Reason: ${remarks}` : ''}`,
        data: { link: '/stores/mrs', type: 'mr_rejected', related_id: mrs.rows[0].id },
      }).catch(() => {});
    }

    res.json({ message: 'MRS rejected' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PATCH /:id/:stage  — dynamic stage-based approval ─────────────────────
router.patch('/:id/:stage', async (req, res) => {
  try {
    const { stage } = req.params;
    const { remarks, purchase_data, signature_img } = req.body;

    // Load MRS + project
    const mrs = await query(
      `SELECT mr.*, p.company_id, p.mrs_workflow, p.name AS project_name,
              u.name AS raised_by_name, u.email AS raised_by_email
       FROM material_requisitions mr
       JOIN projects p ON mr.project_id = p.id
       LEFT JOIN users u ON u.id = mr.raised_by
       WHERE mr.id = $1`,
      [req.params.id]
    );
    if (!mrs.rows.length || mrs.rows[0].company_id !== req.user.company_id)
      return res.status(404).json({ error: 'MRS not found' });
    if (!userCanAccessProject(req, mrs.rows[0].project_id))
      return res.status(403).json({ error: 'You do not have access to this project.' });

    // Build dynamic chain for this project
    const enabledIds = normalizeStageIds(mrs.rows[0].mrs_workflow?.stages);
    const chain = buildChain(enabledIds);

    if (!chain[stage]) return res.status(400).json({ error: `Stage "${stage}" is not part of this project's approval workflow` });
    const cfg = chain[stage];
    const allowedPrev = [cfg.requiredPrev, ...(cfg.legacyPrev || [])];

    if (!allowedPrev.includes(mrs.rows[0].status)) {
      return res.status(400).json({
        error: `Cannot perform "${cfg.label}" — MRS is at "${mrs.rows[0].status}", expected "${cfg.requiredPrev}"`
      });
    }

    // Build dynamic SET clause
    let setSql = `status = $1, ${cfg.colBy} = $2, ${cfg.colAt} = NOW(), updated_at = NOW()`;
    const params = [cfg.nextStatus, req.user.id];

    if (remarks)       { setSql += `, remarks = $${params.length + 1}`;      params.push(remarks); }
    if (signature_img) { setSql += `, ${cfg.sigCol} = $${params.length + 1}`; params.push(signature_img); }

    if (stage === 'approve-md' && purchase_data) {
      const { received_date, po_no_date, expected_delivery } = purchase_data;
      setSql += `, purchase_received_date = $${params.length+1}, po_no_date = $${params.length+2}, expected_delivery_date = $${params.length+3}, processed_by = $${params.length+4}, processed_at = NOW()`;
      params.push(received_date, po_no_date, expected_delivery, req.user.id);
    }

    params.push(req.params.id);
    await query(`UPDATE material_requisitions SET ${setSql} WHERE id = $${params.length}`, params);

    // Always push to MR raiser when any approval stage is done
    if (mrs.rows[0].raised_by) {
      const isFinalApproval = cfg.nextStatus === 'approved_md';
      sendPushToUser(mrs.rows[0].raised_by, {
        title: isFinalApproval
          ? `MR Fully Approved: ${mrsRef(mrs.rows[0])}`
          : `MR ${cfg.label}: ${mrsRef(mrs.rows[0])}`,
        body: isFinalApproval
          ? `Your material request for ${mrs.rows[0].project_name || 'the project'} has been fully approved.`
          : `${cfg.label} completed by ${req.user.name || req.user.email} for ${mrs.rows[0].project_name || 'the project'}.`,
        data: { link: '/stores/mrs', type: 'mr_approved', related_id: mrs.rows[0].id },
      }).catch(() => {});
    }

    if (cfg.nextStatus === 'approved_md') {
      const itemCount = await query(
        `SELECT COUNT(*)::int AS item_count FROM mrs_items WHERE mrs_id = $1::uuid`,
        [req.params.id]
      );
      notifyProcurementAfterMDApproval({
        companyId: req.user.company_id,
        mrs: {
          ...mrs.rows[0],
          status: cfg.nextStatus,
          item_count: itemCount.rows[0]?.item_count || 0,
        },
      });

      // Also push to procurement + management for final approval
      const procEmails = parseEmails(process.env.MRS_PROCUREMENT_NOTIFY_EMAILS, DEFAULT_PROCUREMENT_MRS_EMAILS);
      const mgmtEmails = parseEmails(process.env.MRS_MGMT_NOTIFY_EMAILS, DEFAULT_MGMT_NOTIFY_EMAILS);
      sendPushToUsersByEmail(req.user.company_id, [...new Set([...procEmails, ...mgmtEmails])], {
        title: `MR Fully Approved: ${mrsRef(mrs.rows[0])}`,
        body: `MR for ${mrs.rows[0].project_name || 'a project'} is MD-approved. Proceed with RFQ/PO.`,
        data: { link: '/stores/mrs', type: 'mr_final_approved', related_id: mrs.rows[0].id },
      }).catch(() => {});
    }

    res.json({ message: `MRS ${cfg.label} completed`, status: cfg.nextStatus });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /stores/mrs/:id — Only draft or rejected MRS can be deleted
router.delete('/:id', async (req, res) => {
  try {
    const mrs = await query(
      `SELECT mr.*, p.company_id FROM material_requisitions mr
       JOIN projects p ON mr.project_id = p.id WHERE mr.id = $1`,
      [req.params.id]
    );
    if (!mrs.rows.length || mrs.rows[0].company_id !== req.user.company_id) {
      return res.status(404).json({ error: 'MRS not found' });
    }
    const row = mrs.rows[0];
    if (!userCanAccessProject(req, row.project_id)) {
      return res.status(403).json({ error: 'You do not have access to this project.' });
    }
    // Delete items first (FK constraint), then the MRS
    await query(`DELETE FROM mrs_items WHERE mrs_id = $1`, [req.params.id]);
    await query(`DELETE FROM material_requisitions WHERE id = $1`, [req.params.id]);
    res.json({ message: 'MRS deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /stores/mrs/:id/resend-notify — admin can re-trigger MRS notification emails
router.post('/:id/resend-notify', async (req, res) => {
  try {
    const { authorize } = require('../middleware/auth');
    // Only admin / super_admin
    if (!['admin', 'super_admin'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Admin only' });
    }
    const mrs = await query(
      `SELECT mr.*, p.name AS project_name, p.company_id,
              u.name AS raised_by_name, u.email AS raised_by_email,
              (SELECT COUNT(*) FROM mrs_items WHERE mrs_id = mr.id) AS item_count
       FROM material_requisitions mr
       JOIN projects p ON mr.project_id = p.id
       JOIN users u ON mr.raised_by = u.id
       WHERE mr.id = $1`,
      [req.params.id]
    );
    if (!mrs.rows.length || mrs.rows[0].company_id !== req.user.company_id) {
      return res.status(404).json({ error: 'MRS not found' });
    }
    const mrsData = mrs.rows[0];
    notifyStoresForNewMRS({ companyId: req.user.company_id, mrs: mrsData });
    notifyProcurementForNewMRS({ companyId: req.user.company_id, mrs: mrsData });
    res.json({ message: `Notifications resent for ${mrsRef(mrsData)}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
