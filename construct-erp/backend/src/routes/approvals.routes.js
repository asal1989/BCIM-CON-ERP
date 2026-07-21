// approvals.routes.js — Unified pending-approvals feed for all modules
const express = require('express');
const router  = express.Router();
const { authenticate } = require('../middleware/auth');
const { query } = require('../config/database');
const { postAutoJournalStandalone } = require('../services/journalAutoPost');
const {
  notifyScBillApproved, notifyScBillFullyApproved, notifyScBillRejected,
  notifyScWoApproved, notifyScWoRejected,
  notifyScMbChecked, notifyScMbApproved, notifyScMbRejected,
  notifyScNmrApproved,
  notifyRetentionApproved, notifyRetentionRejected,
} = require('../services/notif.helper');
const { scBillScopeForRole } = require('../constants/scBillApprovalStages');
const { pushScBillToTracker } = require('../services/scBillToTracker.service');

// GL mapping for stores petty cash auto-JV (mirrors stores-petty-cash.routes.js)
const SPC_CATEGORY_GL = {
  Fuel: '6030', Safety: '6040', Stationery: '6050', Pantry: '6060',
  Transport: '6070', Utilities: '6080', Materials: '5000',
};
function spcCategoryOf(text = '') {
  const d = (text || '').toLowerCase();
  if (/petrol|fuel|diesel/.test(d))                                                         return 'Fuel';
  if (/safety|glove|shoe|medical|flag|helmet|badge|banner|ppe/.test(d))                    return 'Safety';
  if (/stationery|stationary|file|paper|pen|whitener|stamp|calc|stapler|a4|xerox|print/.test(d)) return 'Stationery';
  if (/pantry|sweet|food|sugar|tea|poha|zeera|mixture|coconut|biscuit|snack/.test(d))      return 'Pantry';
  if (/transport|bus|ticket|charges|auto|cab|uber|ola/.test(d))                            return 'Transport';
  if (/electric|bill|power|utility|mobile|recharge|internet/.test(d))                      return 'Utilities';
  return 'Materials';
}

router.use(authenticate);

// POST /api/v1/approvals/md-digest/run — manually trigger the MD pending-approvals
// digest mail (admin only; the cron sends it automatically at 9 AM / 9 PM IST)
router.post('/md-digest/run', async (req, res) => {
  try {
    const role = String(req.user.role || '').toLowerCase();
    if (!['super_admin', 'admin'].includes(role)) {
      return res.status(403).json({ error: 'Admin only' });
    }
    const { runMdApprovalDigest } = require('../utils/md-approval-digest.service');
    const result = await runMdApprovalDigest({ manual: true });
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/v1/approvals/daily-activity-digest/run — manually trigger the
// all-departments daily activity summary mail (admin only; the cron sends it
// automatically every evening)
router.post('/daily-activity-digest/run', async (req, res) => {
  try {
    const role = String(req.user.role || '').toLowerCase();
    if (!['super_admin', 'admin'].includes(role)) {
      return res.status(403).json({ error: 'Admin only' });
    }
    const { runDailyActivityDigest } = require('../utils/daily-activity-digest.service');
    const result = await runDailyActivityDigest({ manual: true });
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/v1/approvals/weekly-summary/run
// Sends a weekly activity summary email covering fromDate..toDate (defaults to Mon–today).
router.post('/weekly-summary/run', async (req, res) => {
  try {
    const role = String(req.user.role || '').toLowerCase();
    if (!['super_admin', 'admin'].includes(role)) {
      return res.status(403).json({ error: 'Admin only' });
    }
    const { fromDate, toDate, recipients } = req.body;
    const { runWeeklySummary } = require('../utils/daily-activity-digest.service');
    const result = await runWeeklySummary({ fromDate, toDate, overrideRecipients: recipients });
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

const CID  = r => r.user.company_id;
const UID  = r => r.user.id;
// Roles are stored free-text and may differ in case (e.g. "Procurement_manager") —
// normalise so the role lists below always match.
const ROLE = r => String(r.user.role || '').toLowerCase();

// ─── helpers ──────────────────────────────────────────────────────────────────

// Which MRS statuses need action from this role?
function mrsStatusesForRole(role) {
  const r = (role || '').toLowerCase();
  if (['admin', 'super_admin'].includes(r))
    return ['pending', 'stores_verified', 'verified_tower', 'approved_pm', 'approved_srpm', 'approved_mgmt'];
  if (['stores_manager', 'store_keeper'].includes(r))
    return ['pending'];
  if (['project_manager', 'pm', 'project_head'].includes(r))
    return ['stores_verified', 'verified_tower'];
  if (['director', 'project_director', 'management', 'management_director'].includes(r))
    return ['approved_pm', 'approved_srpm'];
  if (['managing_director', 'md', 'ceo'].includes(r))
    return ['approved_mgmt'];
  return [];
}

// Status → next approval step
const MRS_STAGE_MAP = {
  'pending':         { nextStatus: 'stores_verified', colBy: 'stores_approved_by', colAt: 'stores_approved_at', label: 'Store Manager' },
  'stores_verified': { nextStatus: 'approved_pm',     colBy: 'approved_pm_by',     colAt: 'approved_pm_at',     label: 'Project Manager' },
  'verified_tower':  { nextStatus: 'approved_pm',     colBy: 'approved_pm_by',     colAt: 'approved_pm_at',     label: 'Project Manager' },
  'approved_pm':     { nextStatus: 'approved_mgmt',   colBy: 'approved_mgmt_by',   colAt: 'approved_mgmt_at',   label: 'Project Director' },
  'approved_srpm':   { nextStatus: 'approved_mgmt',   colBy: 'approved_mgmt_by',   colAt: 'approved_mgmt_at',   label: 'Project Director' },
  'approved_mgmt':   { nextStatus: 'approved_md',     colBy: 'approved_md_by',     colAt: 'approved_md_at',     label: 'Managing Director' },
};

// Which SC bill stages can this role act on, AND which current_stage values belong to them?
// stageNames: the sc_bills.current_stage label(s) this role owns.
// Empty stageNames = admin/super_admin: see all stages, no current_stage filter.
// (imported from ../constants/scBillApprovalStages — shared with sc.routes.js so the
// "who can see it" and "who can act on it" rules can never drift apart)

// ════════════════════════════════════════════════════════════════════════════
// GET /api/v1/approvals/pending
// Returns all items across all modules that need this user's action
// ════════════════════════════════════════════════════════════════════════════
// it@bcim.in is the system/IT admin and always gets the full feed.
// stephen@bcim.in is the MD — they must use their DB role (managing_director)
// so that stage filtering works correctly. Do NOT add stephen here.
const FULL_APPROVALS_EMAILS = ['it@bcim.in'];

router.get('/pending', async (req, res) => {
  try {
    const cid  = CID(req);
    const email = (req.user.email || '').toLowerCase();
    const role = FULL_APPROVALS_EMAILS.includes(email) ? 'admin' : ROLE(req);
    const items = [];

    // ── HR Admin: ONLY HR department approvals — no procurement/stores access ──
    if (role === 'hr_admin') {
      const hrItems = [];

      // Leave requests pending approval
      try {
        const lr = await query(`
          SELECT lr.id, lr.leave_type AS ref_no, lr.from_date AS doc_date,
                 0 AS amount, lr.status, lr.created_at, lr.status AS current_stage,
                 u.name AS party_name, '' AS project_name, u.name AS submitted_by,
                 CONCAT(lr.leave_type, ' • ', lr.total_days, ' day(s)') AS extra_info,
                 'Leave Request' AS doc_type, 'leave_request' AS entity_type,
                 '/hr/leave' AS action_url
          FROM hr_leave_requests lr
          JOIN users u ON u.id = lr.user_id
          WHERE lr.company_id = $1 AND lr.status = 'pending'
          ORDER BY lr.created_at ASC`, [cid]);
        hrItems.push(...lr.rows);
      } catch (e) { console.error('[approvals/pending] leave requests feed failed:', e.message); }

      // Expense claims pending approval
      try {
        const ec = await query(`
          SELECT e.id, e.expense_type AS ref_no, e.expense_date AS doc_date,
                 e.amount, e.status, e.created_at, e.status AS current_stage,
                 u.name AS party_name, '' AS project_name, u.name AS submitted_by,
                 CONCAT(e.expense_type, ' • ', e.description) AS extra_info,
                 'Expense Claim' AS doc_type, 'expense_claim' AS entity_type,
                 '/hr/expenses' AS action_url
          FROM hr_expense_claims e
          JOIN users u ON u.id = e.user_id
          WHERE e.company_id = $1 AND e.status = 'pending'
          ORDER BY e.created_at ASC`, [cid]);
        hrItems.push(...ec.rows);
      } catch (e) { console.error('[approvals/pending] expense claims feed failed:', e.message); }

      hrItems.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
      const summary = hrItems.reduce((acc, item) => { acc[item.doc_type] = (acc[item.doc_type] || 0) + 1; return acc; }, {});
      return res.json({ data: hrItems, summary, total: hrItems.length });
    }

    // ── 1. SC Bills — filtered to the user's own approval stage ─────────────
    // Prevents MD from seeing bills still waiting at QS/PM/management stages,
    // and prevents Project Director from seeing MD-stage bills.
    const scBillScope = scBillScopeForRole(role);
    if (scBillScope.statuses.length) {
      const params = [cid, ...scBillScope.statuses];
      const statusPh = scBillScope.statuses.map((_, i) => `$${i + 2}`).join(',');
      let stageCond = '';
      if (scBillScope.stageNames.length) {
        const stagePh = scBillScope.stageNames.map((_, i) => `$${params.length + i + 1}`).join(',');
        stageCond = ` AND b.current_stage IN (${stagePh})`;
        params.push(...scBillScope.stageNames);
      }
      const r = await query(`
        SELECT b.id, b.bill_number AS ref_no, b.bill_date AS doc_date,
               b.net_payable AS amount, b.status, b.created_at, b.current_stage,
               sc.name AS party_name, p.name AS project_name,
               u.name AS submitted_by,
               'SC Bill' AS doc_type, 'sc_bill' AS entity_type,
               '/sc/bill-approval' AS action_url
        FROM sc_bills b
        JOIN sc_subcontractors sc ON sc.id=b.sc_id
        JOIN projects p ON p.id=b.project_id
        LEFT JOIN users u ON u.id=b.submitted_by
        WHERE b.company_id=$1 AND b.status IN (${statusPh})${stageCond}
        ORDER BY b.created_at ASC`, params);
      items.push(...r.rows);
    }

    // ── 2. SC Work Orders (submitted, need approval) ─────────────────────────
    if (['project_manager','admin','super_admin','qs_engineer'].includes(role)) {
      const r = await query(`
        SELECT wo.id, wo.wo_number AS ref_no, wo.created_at AS doc_date,
               wo.contract_amount AS amount, wo.status, wo.created_at,
               wo.status AS current_stage,
               sc.name AS party_name, p.name AS project_name,
               u.name AS submitted_by,
               'Work Order' AS doc_type, 'sc_wo' AS entity_type,
               '/sc/work-orders' AS action_url
        FROM sc_work_orders wo
        JOIN sc_subcontractors sc ON sc.id=wo.sc_id
        JOIN projects p ON p.id=wo.project_id
        LEFT JOIN users u ON u.id=wo.created_by
        WHERE wo.company_id=$1 AND wo.status='submitted'
        ORDER BY wo.created_at ASC`, [cid]);
      items.push(...r.rows);
    }

    // ── 3. SC Measurement Book entries ───────────────────────────────────────
    if (['site_engineer','qs_engineer','project_manager','admin','super_admin'].includes(role)) {
      const mbStatuses = role === 'site_engineer' ? ['submitted'] : ['submitted','checked'];
      const ph = mbStatuses.map((_,i)=>`$${i+2}`).join(',');
      const r = await query(`
        SELECT m.id, m.mb_number AS ref_no, m.mb_date AS doc_date,
               m.executed_qty AS amount, m.status, m.created_at,
               m.status AS current_stage,
               sc.name AS party_name, p.name AS project_name,
               u.name AS submitted_by,
               m.description AS extra_info,
               'Measurement Book' AS doc_type, 'sc_mb' AS entity_type,
               '/sc/progress' AS action_url
        FROM sc_mb_entries m
        JOIN sc_subcontractors sc ON sc.id=m.sc_id
        JOIN projects p ON p.id=m.project_id
        LEFT JOIN users u ON u.id=m.created_by
        WHERE m.company_id=$1 AND m.status IN (${ph})
        ORDER BY m.created_at ASC`, [cid, ...mbStatuses]);
      items.push(...r.rows);
    }

    // ── 3b. SC NMR (Muster Roll) entries ─────────────────────────────────────
    if (['site_engineer','qs_engineer','project_manager','admin','super_admin'].includes(role)) {
      const nmrStatuses = role === 'site_engineer' ? ['submitted'] : ['submitted','checked'];
      const ph = nmrStatuses.map((_,i)=>`$${i+2}`).join(',');
      const r = await query(`
        SELECT n.id, n.nmr_number AS ref_no, n.period_from AS doc_date,
               n.total_wages AS amount, n.status, n.created_at,
               n.status AS current_stage,
               sc.name AS party_name, p.name AS project_name,
               u.name AS submitted_by,
               CONCAT(n.total_workers, ' workers • ', n.total_mandays, ' man-days') AS extra_info,
               'NMR Muster Roll' AS doc_type, 'sc_nmr' AS entity_type,
               '/sc/labour' AS action_url
        FROM sc_nmr n
        JOIN sc_subcontractors sc ON sc.id=n.sc_id
        JOIN projects p ON p.id=n.project_id
        LEFT JOIN users u ON u.id=n.created_by
        WHERE n.company_id=$1 AND n.status IN (${ph})
        ORDER BY n.created_at ASC`, [cid, ...nmrStatuses]);
      items.push(...r.rows);
    }

    // ── 4. SC Retention Releases ─────────────────────────────────────────────
    if (['accounts','project_manager','admin','super_admin'].includes(role)) {
      const r = await query(`
        SELECT rr.id, rr.release_number AS ref_no, rr.release_date AS doc_date,
               rr.release_amount AS amount, rr.status, rr.created_at,
               'pending' AS current_stage,
               sc.name AS party_name, p.name AS project_name,
               u.name AS submitted_by,
               'Retention Release' AS doc_type, 'sc_retention' AS entity_type,
               '/sc/deductions' AS action_url
        FROM sc_retention_releases rr
        JOIN sc_subcontractors sc ON sc.id=rr.sc_id
        JOIN projects p ON p.id=rr.project_id
        LEFT JOIN users u ON u.id=rr.created_by
        WHERE rr.company_id=$1 AND rr.status='pending'
        ORDER BY rr.created_at ASC`, [cid]);
      items.push(...r.rows);
    }

    // ── 5. Quality NCRs (open) ────────────────────────────────────────────────
    if (['qa_qc_engineer','hse_officer','project_manager','admin','super_admin'].includes(role)) {
      try {
        const r = await query(`
          SELECT n.id, n.ncr_number AS ref_no, n.issued_date AS doc_date,
                 0 AS amount, n.status, n.created_at,
                 n.status AS current_stage,
                 n.contractor_name AS party_name, p.name AS project_name,
                 u.name AS submitted_by,
                 n.description AS extra_info,
                 'NCR' AS doc_type, 'ncr' AS entity_type,
                 '/quality/ncr' AS action_url
          FROM quality_ncrs n
          JOIN projects p ON p.id=n.project_id
          LEFT JOIN users u ON u.id=n.raised_by
          WHERE n.project_id IN (SELECT id FROM projects WHERE company_id=$1)
            AND n.status IN ('open','in_progress')
          ORDER BY n.created_at ASC`, [cid]);
        items.push(...r.rows);
      } catch (e) { console.error('[approvals/pending] NCR feed failed:', e.message); }
    }

    // ── 6. Quality Submittals (pending review) ────────────────────────────────
    if (['qs_engineer','project_manager','admin','super_admin'].includes(role)) {
      try {
        const r = await query(`
          SELECT s.id, s.submittal_number AS ref_no, s.submission_date AS doc_date,
                 0 AS amount, s.status, s.created_at,
                 s.status AS current_stage,
                 s.submitted_by_contractor AS party_name,
                 p.name AS project_name,
                 u.name AS submitted_by,
                 s.title AS extra_info,
                 'Submittal' AS doc_type, 'submittal' AS entity_type,
                 '/quality/documents' AS action_url
          FROM quality_submittals s
          JOIN projects p ON p.id=s.project_id
          LEFT JOIN users u ON u.id=s.created_by
          WHERE s.project_id IN (SELECT id FROM projects WHERE company_id=$1)
            AND s.status='pending'
          ORDER BY s.created_at ASC`, [cid]);
        items.push(...r.rows);
      } catch (e) { console.error('[approvals/pending] submittals feed failed:', e.message); }
    }

    // ── 7. Purchase Orders — two-stage approval feed ─────────────────────────
    // Stage 1 (Procurement Approve): status = 'pending' → roles: procurement_manager, project_manager, admin, super_admin
    // Stage 2 (MD Approve):          status = 'verified_audit' or 'released_mgmt' → roles: md, ceo, managing_director, admin, super_admin
    const poStage1Roles = ['procurement_manager','project_manager','admin','super_admin'];
    const poStage2Roles = ['md','ceo','managing_director','admin','super_admin'];
    try {
      let poStatuses = [];
      if (poStage1Roles.includes(role)) poStatuses.push('pending');
      if (poStage2Roles.includes(role)) poStatuses.push('verified_audit', 'released_mgmt');
      console.log(`[approvals/pending] user=${req.user.email} role=${role} cid=${cid} poStatuses=${JSON.stringify(poStatuses)}`);
      if (poStatuses.length) {
        const ph = poStatuses.map((_, i) => `$${i + 2}`).join(',');
        const r = await query(`
          SELECT po.id,
                 COALESCE(po.po_number, po.id::text) AS ref_no,
                 po.po_date AS doc_date,
                 COALESCE(po.grand_total, 0) AS amount,
                 po.status, po.created_at,
                 po.status AS current_stage,
                 v.name AS party_name,
                 p.name AS project_name,
                 u.name AS submitted_by,
                 CASE po.status
                   WHEN 'pending'        THEN 'Awaiting Procurement Approval'
                   WHEN 'verified_audit' THEN 'Awaiting MD Authorization'
                   WHEN 'released_mgmt' THEN 'Awaiting MD Authorization'
                 END AS extra_info,
                 'Purchase Order' AS doc_type, 'po' AS entity_type,
                 '/stores/po?view=' || po.id::text AS action_url
          FROM purchase_orders po
          JOIN projects p ON p.id = po.project_id
          LEFT JOIN vendors v ON v.id = po.vendor_id
          LEFT JOIN users u ON u.id = po.created_by
          WHERE p.company_id = $1 AND po.status IN (${ph})
          ORDER BY po.created_at ASC
          LIMIT 50`, [cid, ...poStatuses]);
        console.log(`[approvals/pending] PO query returned ${r.rows.length} rows`);
        items.push(...r.rows);
      }
    } catch (poErr) { console.error('[approvals PO feed]:', poErr.message); }

    // ── 8. Procurement Work Orders — two-stage approval feed ─────────────────
    // Stage 1 (Procurement Approve): status IN ('draft','pending') → procurement/PM/admin
    // Stage 2 (MD Authorize):        status IN ('submitted','active') → MD/admin
    // Note: legacy WOs approved by Procurement before MD stage existed are 'active'
    const woStage1Roles = ['procurement_manager','project_manager','admin','super_admin'];
    const woStage2Roles = ['md','ceo','managing_director','admin','super_admin'];
    try {
      let woStatuses = [];
      if (woStage1Roles.includes(role)) woStatuses.push('draft', 'pending');
      if (woStage2Roles.includes(role)) woStatuses.push('submitted', 'active');
      // deduplicate (admin/super_admin appear in both)
      woStatuses = [...new Set(woStatuses)];
      if (woStatuses.length) {
        const ph = woStatuses.map((_, i) => `$${i + 2}`).join(',');
        const r = await query(`
          SELECT wo.id,
                 COALESCE(wo.wo_number, wo.id::text) AS ref_no,
                 wo.created_at AS doc_date,
                 COALESCE(wo.contract_amount, wo.total_value, 0) AS amount,
                 wo.status, wo.created_at,
                 wo.status AS current_stage,
                 COALESCE(v.name, 'Vendor') AS party_name,
                 p.name AS project_name,
                 u.name AS submitted_by,
                 CASE wo.status
                   WHEN 'draft'      THEN 'Awaiting Procurement Approval'
                   WHEN 'pending'    THEN 'Awaiting Procurement Approval'
                   WHEN 'submitted'  THEN 'Awaiting MD Authorization'
                   WHEN 'active'     THEN 'Awaiting MD Authorization'
                 END AS extra_info,
                 'Work Order' AS doc_type, 'work_order' AS entity_type,
                 '/stores/work-orders?view=' || wo.id::text AS action_url
          FROM work_orders wo
          JOIN projects p ON p.id = wo.project_id
          LEFT JOIN vendors v ON v.id = wo.vendor_id
          LEFT JOIN users u ON u.id = wo.created_by
          WHERE p.company_id = $1 AND wo.status IN (${ph})
          ORDER BY wo.created_at ASC
          LIMIT 50`, [cid, ...woStatuses]);
        items.push(...r.rows);
      }
    } catch (woErr) { console.error('[approvals WO feed]:', woErr.message); }

    // ── 8. MRS — Material Requisitions pending each role's approval ─────────────
    try {
      const mrsStatuses = mrsStatusesForRole(role);
      if (mrsStatuses.length) {
        const ph = mrsStatuses.map((_, i) => `$${i + 2}`).join(',');
        const r = await query(`
          SELECT mr.id,
                 COALESCE(mr.serial_no_formatted, mr.mrs_number) AS ref_no,
                 mr.created_at AS doc_date,
                 0 AS amount,
                 mr.status,
                 mr.created_at,
                 mr.status AS current_stage,
                 p.name AS project_name,
                 p.name AS party_name,
                 u.name AS submitted_by,
                 CONCAT(
                   (SELECT COUNT(*)::text FROM mrs_items mi WHERE mi.mrs_id = mr.id),
                   ' items • ', UPPER(COALESCE(mr.priority, 'normal'))
                 ) AS extra_info,
                 'MRS' AS doc_type, 'mrs' AS entity_type,
                 '/stores/mrs?view=' || mr.id::text AS action_url
          FROM material_requisitions mr
          JOIN projects p ON p.id = mr.project_id
          LEFT JOIN users u ON u.id = mr.raised_by
          WHERE p.company_id = $1 AND mr.status IN (${ph})
          ORDER BY mr.created_at ASC`, [cid, ...mrsStatuses]);
        items.push(...r.rows);
      }
    } catch (e) { console.error('[approvals/pending] MRS feed failed:', e.message); }

    // ── 9. Stores Petty Cash entries pending project head approval ───────────────
    if (['project_head','project_manager','pm','admin','super_admin'].includes(role)) {
      try {
        const r = await query(`
          SELECT e.id,
                 CONCAT('SL-', e.sl_no) AS ref_no,
                 e.entry_date AS doc_date,
                 e.amount,
                 e.status,
                 e.created_at,
                 'Pending' AS current_stage,
                 e.supplier AS party_name,
                 COALESCE(p.name, 'Site') AS project_name,
                 u.name AS submitted_by,
                 CONCAT(e.supplier, ' • ', TO_CHAR(e.amount, 'FM₹99,99,99,999.00')) AS extra_info,
                 'Petty Cash' AS doc_type, 'petty_cash_entry' AS entity_type,
                 '/stores/petty-cash' AS action_url
          FROM stores_petty_cash_entries e
          LEFT JOIN projects p ON p.id = e.project_id
          LEFT JOIN users   u ON u.id = e.created_by
          WHERE e.company_id = $1 AND e.status = 'Pending'
          ORDER BY e.created_at ASC
          LIMIT 100`, [cid]);
        items.push(...r.rows);
      } catch (e) { console.error('[approvals/pending] petty cash feed failed:', e.message); }
    }

    // ── Sort all by created_at (oldest first — most urgent) ───────────────────
    items.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

    // ── Summary counts ────────────────────────────────────────────────────────
    const summary = items.reduce((acc, item) => {
      acc[item.doc_type] = (acc[item.doc_type] || 0) + 1;
      return acc;
    }, {});

    res.json({ data: items, summary, total: items.length });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ════════════════════════════════════════════════════════════════════════════
// POST /api/v1/approvals/action
// Approve or reject any item by entity_type + id
// ════════════════════════════════════════════════════════════════════════════
router.post('/action', async (req, res) => {
  try {
    const { entity_type, entity_id, action, comments } = req.body;
    if (!entity_type || !entity_id || !['approve','reject','check'].includes(action)) {
      return res.status(400).json({ error: 'entity_type, entity_id and action (approve/reject/check) required' });
    }

    const uid   = UID(req);
    const uname = req.user.name;
    const now   = new Date().toISOString();

    switch (entity_type) {

      case 'sc_bill': {
        // Same stage-ownership rule as sc.routes.js /bills/:id/approve|reject —
        // this generic action endpoint used to skip it entirely, letting any
        // role in the feed act on a bill regardless of whose stage it's at.
        {
          const billRow = await query(`SELECT current_stage FROM sc_bills WHERE id=$1 AND company_id=$2`, [entity_id, CID(req)]);
          if (!billRow.rows.length) return res.status(404).json({ error: 'Bill not found' });
          const actorRole = String(req.user.role || '').toLowerCase();
          if (!['super_admin', 'admin'].includes(actorRole)) {
            const scope = scBillScopeForRole(actorRole);
            if (!scope.stageNames.includes(billRow.rows[0].current_stage)) {
              return res.status(403).json({ error: `This bill is awaiting the ${(billRow.rows[0].current_stage||'').replace(/_/g,' ')} approver — you cannot act on it at this stage.` });
            }
          }
        }
        if (action === 'approve') {
          const bill = await query(`SELECT * FROM sc_bills WHERE id=$1 AND company_id=$2`, [entity_id, CID(req)]);
          if (!bill.rows.length) return res.status(404).json({ error: 'Bill not found' });
          const b = bill.rows[0];
          const stage = b.current_stage;
          // Fetch dynamic approval stages from settings (same source as sc.routes.js)
          const settingsRes = await query(`SELECT approval_stages FROM sc_settings WHERE company_id=$1`, [CID(req)]);
          const stages = settingsRes.rows[0]?.approval_stages || ['qs_engineer','managing_director'];
          const idx      = stages.indexOf(stage);
          const isFinal  = idx < 0 || idx === stages.length - 1;
          const nextStage = !isFinal ? stages[idx + 1] : stage;
          const newStatus = isFinal ? 'approved' : 'under_review';
          await query(
            `UPDATE sc_bills SET status=$1, current_stage=$2, approved_by=$3,
                    approved_at=CASE WHEN $1='approved' THEN NOW() ELSE NULL END, updated_at=NOW()
             WHERE id=$4`,
            [newStatus, nextStage, uid, entity_id]);
          await query(`INSERT INTO sc_bill_approvals (bill_id,stage,action,actor_id,actor_name,comments) VALUES ($1,$2,'approved',$3,$4,$5)`,
            [entity_id, stage, uid, uname, comments||'Approved']);
          if (newStatus === 'approved') {
            notifyScBillFullyApproved(CID(req), b, uname);
            try {
              await pushScBillToTracker(b.id, uid);
            } catch (trackerErr) {
              console.error('Bill Tracker auto-add failed:', trackerErr.message);
            }
          } else {
            notifyScBillApproved(CID(req), b, uname);
          }
        } else {
          await query(`UPDATE sc_bills SET status='rejected', rejected_by=$1, rejection_remarks=$2, updated_at=NOW() WHERE id=$3`,
            [uid, comments||'Rejected', entity_id]);
          const bill = await query(`SELECT * FROM sc_bills WHERE id=$1`, [entity_id]);
          await query(`INSERT INTO sc_bill_approvals (bill_id,stage,action,actor_id,actor_name,comments) VALUES ($1,$2,'rejected',$3,$4,$5)`,
            [entity_id, bill.rows[0]?.current_stage||'unknown', uid, uname, comments||'Rejected']);
          notifyScBillRejected(CID(req), bill.rows[0] || { id: entity_id }, uname, comments);
        }
        break;
      }

      case 'sc_wo': {
        if (action === 'approve') {
          const woRes = await query(`SELECT * FROM sc_work_orders WHERE id=$1 AND company_id=$2`, [entity_id, CID(req)]);
          await query(`UPDATE sc_work_orders SET status='approved', approved_by=$1, approved_at=NOW(), updated_at=NOW() WHERE id=$2 AND company_id=$3`,
            [uid, entity_id, CID(req)]);
          if (woRes.rows.length) notifyScWoApproved(CID(req), woRes.rows[0], uname);
        } else {
          const woRes = await query(`SELECT * FROM sc_work_orders WHERE id=$1 AND company_id=$2`, [entity_id, CID(req)]);
          await query(`UPDATE sc_work_orders SET status='draft', updated_at=NOW() WHERE id=$1 AND company_id=$2`,
            [entity_id, CID(req)]);
          if (woRes.rows.length) notifyScWoRejected(CID(req), woRes.rows[0], uname);
        }
        break;
      }

      case 'sc_mb': {
        const mbRes = await query(`SELECT * FROM sc_mb_entries WHERE id=$1 AND company_id=$2`, [entity_id, CID(req)]);
        const mb = mbRes.rows[0] || { id: entity_id };
        if (action === 'check') {
          await query(`UPDATE sc_mb_entries SET status='checked', checked_by=$1, checked_at=NOW(), check_remarks=$2, updated_at=NOW() WHERE id=$3 AND company_id=$4`,
            [uid, comments||null, entity_id, CID(req)]);
          notifyScMbChecked(CID(req), mb, uname);
        } else if (action === 'approve') {
          await query(`UPDATE sc_mb_entries SET status='approved', approved_by=$1, approved_at=NOW(), approve_remarks=$2, updated_at=NOW() WHERE id=$3 AND company_id=$4`,
            [uid, comments||null, entity_id, CID(req)]);
          notifyScMbApproved(CID(req), mb, uname);
        } else {
          await query(`UPDATE sc_mb_entries SET status='rejected', rejected_by=$1, rejection_remarks=$2, updated_at=NOW() WHERE id=$3 AND company_id=$4`,
            [uid, comments||null, entity_id, CID(req)]);
          notifyScMbRejected(CID(req), mb, uname, comments);
        }
        break;
      }

      case 'sc_nmr': {
        const nmrRes = await query(`SELECT * FROM sc_nmr WHERE id=$1 AND company_id=$2`, [entity_id, CID(req)]);
        const nmr = nmrRes.rows[0] || { id: entity_id };
        if (action === 'check') {
          await query(`UPDATE sc_nmr SET status='checked', checked_by=$1, checked_at=NOW(), check_remarks=$2, updated_at=NOW() WHERE id=$3 AND company_id=$4`,
            [uid, comments||null, entity_id, CID(req)]);
        } else if (action === 'approve') {
          await query(`UPDATE sc_nmr SET status='approved', approved_by=$1, approved_at=NOW(), approve_remarks=$2, updated_at=NOW() WHERE id=$3 AND company_id=$4 AND status IN ('submitted','checked')`,
            [uid, comments||null, entity_id, CID(req)]);
          notifyScNmrApproved(CID(req), nmr, uname);
        } else {
          await query(`UPDATE sc_nmr SET status='draft', updated_at=NOW() WHERE id=$1 AND company_id=$2`,
            [entity_id, CID(req)]);
        }
        break;
      }

      case 'sc_retention': {
        const retRes = await query(`SELECT * FROM sc_retention_releases WHERE id=$1 AND company_id=$2`, [entity_id, CID(req)]);
        const ret = retRes.rows[0] || { id: entity_id };
        if (action === 'approve') {
          await query(`UPDATE sc_retention_releases SET status='approved', approved_by=$1, approved_at=NOW() WHERE id=$2 AND company_id=$3`,
            [uid, entity_id, CID(req)]);
          notifyRetentionApproved(CID(req), ret, uname);
        } else {
          await query(`UPDATE sc_retention_releases SET status='rejected', updated_at=NOW() WHERE id=$1 AND company_id=$2`,
            [entity_id, CID(req)]);
          notifyRetentionRejected(CID(req), ret, uname);
        }
        break;
      }

      case 'mrs': {
        // Fetch MRS (join projects for company_id check)
        const mrRes = await query(
          `SELECT mr.*, p.company_id AS proj_company_id, p.name AS project_name
           FROM material_requisitions mr
           JOIN projects p ON p.id = mr.project_id
           WHERE mr.id = $1`,
          [entity_id]
        );
        if (!mrRes.rows.length) return res.status(404).json({ error: 'MRS not found' });
        const mr = mrRes.rows[0];

        if (action === 'approve') {
          const stageInfo = MRS_STAGE_MAP[mr.status];
          if (!stageInfo) return res.status(400).json({ error: `MRS at status "${mr.status}" cannot be approved from this page` });
          await query(
            `UPDATE material_requisitions
             SET status = $1, ${stageInfo.colBy} = $2, ${stageInfo.colAt} = NOW(),
                 updated_at = NOW()
             WHERE id = $3`,
            [stageInfo.nextStatus, uid, entity_id]
          );
        } else {
          // reject
          await query(
            `UPDATE material_requisitions
             SET status = 'rejected', remarks = $1, updated_at = NOW()
             WHERE id = $2`,
            [comments || 'Rejected by approver', entity_id]
          );
        }
        break;
      }

      case 'po': {
        // Fetch PO with company check via project
        const poRes = await query(
          `SELECT po.*, p.company_id AS proj_company_id
           FROM purchase_orders po
           JOIN projects p ON p.id = po.project_id
           WHERE po.id = $1`,
          [entity_id]
        );
        if (!poRes.rows.length) return res.status(404).json({ error: 'Purchase Order not found' });
        const po = poRes.rows[0];
        if (po.proj_company_id !== CID(req)) return res.status(403).json({ error: 'Access denied' });

        if (action === 'approve') {
          // Determine which stage based on current status
          const PO_STAGE_MAP = {
            'pending':        { nextStatus: 'verified_audit', colBy: 'verified_procurement_by', colAt: 'verified_procurement_at' },
            'verified_audit': { nextStatus: 'approved',       colBy: 'authorized_md_by',        colAt: 'authorized_md_at' },
            'released_mgmt':  { nextStatus: 'approved',       colBy: 'authorized_md_by',        colAt: 'authorized_md_at' },
          };
          const stageInfo = PO_STAGE_MAP[po.status];
          if (!stageInfo) return res.status(400).json({ error: `PO at status "${po.status}" cannot be approved from here` });
          await query(
            `UPDATE purchase_orders
             SET status = $1, ${stageInfo.colBy} = $2, ${stageInfo.colAt} = NOW(), updated_at = NOW()
             WHERE id = $3`,
            [stageInfo.nextStatus, uid, entity_id]
          );
        } else {
          await query(
            `UPDATE purchase_orders SET status = 'rejected', updated_at = NOW() WHERE id = $1`,
            [entity_id]
          );
        }
        break;
      }

      case 'work_order': {
        // Fetch procurement WO with company check via project
        const woRes = await query(
          `SELECT wo.*, p.company_id AS proj_company_id
           FROM work_orders wo
           JOIN projects p ON p.id = wo.project_id
           WHERE wo.id = $1`,
          [entity_id]
        );
        if (!woRes.rows.length) return res.status(404).json({ error: 'Work Order not found' });
        const wo = woRes.rows[0];
        if (wo.proj_company_id !== CID(req)) return res.status(403).json({ error: 'Access denied' });

        if (action === 'approve') {
          const WO_STAGE_MAP = {
            'draft':     { nextStatus: 'submitted' },
            'pending':   { nextStatus: 'submitted' },
            'submitted': { nextStatus: 'approved'  },
            'active':    { nextStatus: 'approved'  },
          };
          const stageInfo = WO_STAGE_MAP[wo.status];
          if (!stageInfo) return res.status(400).json({ error: `Work Order at status "${wo.status}" cannot be approved from here` });
          await query(
            `UPDATE work_orders SET status = $1, updated_at = NOW() WHERE id = $2`,
            [stageInfo.nextStatus, entity_id]
          );
        } else {
          await query(
            `UPDATE work_orders SET status = 'rejected', updated_at = NOW() WHERE id = $1`,
            [entity_id]
          );
        }
        break;
      }

      case 'petty_cash_entry': {
        const entryRes = await query(
          `SELECT id, status FROM stores_petty_cash_entries WHERE id=$1 AND company_id=$2`,
          [entity_id, CID(req)]
        );
        if (!entryRes.rows.length) return res.status(404).json({ error: 'Petty cash entry not found' });
        const pcEntry = entryRes.rows[0];

        if (action === 'approve') {
          if (!['Pending', 'ph_approved'].includes(pcEntry.status)) {
            return res.status(400).json({ error: `Entry at status "${pcEntry.status}" cannot be approved` });
          }
          await query(
            `UPDATE stores_petty_cash_entries
             SET status='Approved', approved_by=$1, approved_at=NOW(),
                 approval_remarks=$2, updated_at=NOW()
             WHERE id=$3 AND company_id=$4`,
            [uid, comments || null, entity_id, CID(req)]
          );
          // Auto-post JV: Dr expense + Input GST, Cr Cash in Hand
          const fullEntry = await query(
            `SELECT e.*, i.material_name AS first_item
               FROM stores_petty_cash_entries e
               LEFT JOIN stores_petty_cash_items i ON i.entry_id = e.id
               WHERE e.id = $1 ORDER BY i.sort_order LIMIT 1`,
            [entity_id]
          );
          if (fullEntry.rows.length) {
            const fe = fullEntry.rows[0];
            const cat     = spcCategoryOf(fe.first_item || fe.supplier || '');
            const expCode = SPC_CATEGORY_GL[cat] || SPC_CATEGORY_GL.Materials;
            const basic   = parseFloat(fe.basic_amount) || parseFloat(fe.amount) || 0;
            const gst     = parseFloat(fe.gst_amount) || 0;
            const total   = parseFloat(fe.total_amount) || parseFloat(fe.amount) || (basic + gst);
            const ref     = fe.invoice_no || `SPC-${fe.sl_no}`;
            const lines   = [{ code: expCode, debit: basic, description: `${cat} — ${fe.supplier} (${ref})` }];
            if (gst > 0) lines.push({ code: '1300', debit: gst, description: `Input GST / ITC — ${ref}` });
            lines.push({ code: '1000', credit: total, description: `Petty cash paid — ${fe.supplier} (${ref})` });
            postAutoJournalStandalone({
              companyId: CID(req), userId: uid,
              entryDate: fe.entry_date, projectId: fe.project_id || undefined,
              reference: ref, narration: `Stores petty cash — ${fe.supplier}`,
              source: 'auto_stores_petty_cash', lines,
            }).catch((e) => console.error('[approvals] petty cash auto-journal failed:', ref, e.message));
          }
        } else {
          await query(
            `UPDATE stores_petty_cash_entries
             SET status='Rejected', rejected_reason=$1, updated_at=NOW()
             WHERE id=$2 AND company_id=$3`,
            [comments || 'Rejected', entity_id, CID(req)]
          );
        }
        break;
      }

      default:
        return res.status(400).json({ error: `Unknown entity_type: ${entity_type}` });
    }

    res.json({ success: true, action, entity_type, entity_id });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
