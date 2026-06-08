// approvals.routes.js — Unified pending-approvals feed for all modules
const express = require('express');
const router  = express.Router();
const { authenticate } = require('../middleware/auth');
const { query } = require('../config/database');
const {
  notifyScBillApproved, notifyScBillFullyApproved, notifyScBillRejected,
  notifyScWoApproved, notifyScWoRejected,
  notifyScMbChecked, notifyScMbApproved, notifyScMbRejected,
  notifyScNmrApproved,
  notifyRetentionApproved, notifyRetentionRejected,
} = require('../services/notif.helper');

router.use(authenticate);

const CID  = r => r.user.company_id;
const UID  = r => r.user.id;
const ROLE = r => r.user.role;

// ─── helpers ──────────────────────────────────────────────────────────────────
// Which SC bill stages can this role act on?
function scBillStageForRole(role) {
  const map = {
    site_engineer:   ['submitted'],
    qs_engineer:     ['submitted','under_review'],
    project_manager: ['submitted','under_review'],
    accounts:        ['submitted','under_review'],
    management:      ['submitted','under_review'],
    admin:           ['submitted','under_review'],
    super_admin:     ['submitted','under_review'],
  };
  return map[role] || [];
}

// ════════════════════════════════════════════════════════════════════════════
// GET /api/v1/approvals/pending
// Returns all items across all modules that need this user's action
// ════════════════════════════════════════════════════════════════════════════
router.get('/pending', async (req, res) => {
  try {
    const cid  = CID(req);
    const role = ROLE(req);
    const items = [];

    // ── 1. SC Bills ──────────────────────────────────────────────────────────
    const scBillStages = scBillStageForRole(role);
    if (scBillStages.length) {
      const placeholders = scBillStages.map((_, i) => `$${i+2}`).join(',');
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
        WHERE b.company_id=$1 AND b.status IN (${placeholders})
        ORDER BY b.created_at ASC`, [cid, ...scBillStages]);
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
    } catch (_) { /* table may not exist */ }

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
                 '/quality/document-control' AS action_url
          FROM quality_submittals s
          JOIN projects p ON p.id=s.project_id
          LEFT JOIN users u ON u.id=s.created_by
          WHERE s.project_id IN (SELECT id FROM projects WHERE company_id=$1)
            AND s.status='pending'
          ORDER BY s.created_at ASC`, [cid]);
        items.push(...r.rows);
      } catch (_) { /* table may not exist */ }
    }

    // ── 7. Purchase Orders pending approval ───────────────────────────────────
    if (['accounts','project_manager','admin','super_admin','management'].includes(role)) {
      try {
        const r = await query(`
          SELECT po.id, po.po_number AS ref_no, po.po_date AS doc_date,
                 po.total_amount AS amount, po.status, po.created_at,
                 po.status AS current_stage,
                 v.name AS party_name, p.name AS project_name,
                 u.name AS submitted_by,
                 po.subject AS extra_info,
                 'Purchase Order' AS doc_type, 'po' AS entity_type,
                 '/procurement/po' AS action_url
          FROM purchase_orders po
          JOIN vendors v ON v.id=po.vendor_id
          JOIN projects p ON p.id=po.project_id
          LEFT JOIN users u ON u.id=po.created_by
          WHERE po.company_id=$1 AND po.status IN ('pending','submitted')
          ORDER BY po.created_at ASC LIMIT 30`, [cid]);
        items.push(...r.rows);
      } catch (_) { /* table may not exist */ }
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
        if (action === 'approve') {
          const bill = await query(`SELECT * FROM sc_bills WHERE id=$1 AND company_id=$2`, [entity_id, CID(req)]);
          if (!bill.rows.length) return res.status(404).json({ error: 'Bill not found' });
          const b = bill.rows[0];
          const stage = b.current_stage;
          const finalStages = ['accounts','management'];
          const newStatus = finalStages.includes(stage) ? 'approved' : 'under_review';
          await query(`UPDATE sc_bills SET status=$1, approved_by=$2, approved_at=CASE WHEN $1='approved' THEN NOW() ELSE NULL END, updated_at=NOW() WHERE id=$3`,
            [newStatus, uid, entity_id]);
          await query(`INSERT INTO sc_bill_approvals (bill_id,stage,action,actor_id,actor_name,comments) VALUES ($1,$2,'approved',$3,$4,$5)`,
            [entity_id, stage, uid, uname, comments||'Approved']);
          // Push notification
          if (newStatus === 'approved') {
            notifyScBillFullyApproved(CID(req), b, uname);
          } else {
            notifyScBillApproved(CID(req), b, uname);
          }
        } else {
          await query(`UPDATE sc_bills SET status='rejected', rejected_by=$1, rejection_remarks=$2, updated_at=NOW() WHERE id=$3`,
            [uid, comments||'Rejected', entity_id]);
          const bill = await query(`SELECT * FROM sc_bills WHERE id=$1`, [entity_id]);
          await query(`INSERT INTO sc_bill_approvals (bill_id,stage,action,actor_id,actor_name,comments) VALUES ($1,$2,'rejected',$3,$4,$5)`,
            [entity_id, bill.rows[0]?.current_stage||'unknown', uid, uname, comments||'Rejected']);
          // Push notification
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

      default:
        return res.status(400).json({ error: `Unknown entity_type: ${entity_type}` });
    }

    res.json({ success: true, action, entity_type, entity_id });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
