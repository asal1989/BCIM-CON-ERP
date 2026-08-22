// compliance-tracker.routes.js — Statutory & Legal Compliance Tracker
// Mounted at /api/v1/compliance-tracker
//
// Tracks recurring/one-time statutory obligations (PF, PT, LWF, CLRA, BOCW,
// Shop Act, WC Policy, Rental Agreements, Vehicle Insurance, Labour
// Licences, etc.) per Project/HO, with the full due/paid/penalty/delay
// trail the user asked to be "properly recorded and monitored until
// closure". Feeds the weekly Monday email (see
// utils/compliance-weekly-report.service.js).
'use strict';
const express = require('express');
const router  = express.Router();
const fs      = require('fs');
const path    = require('path');
const multer  = require('multer');
const { authenticate, authorize } = require('../middleware/auth');
const { query } = require('../config/database');
const { runSchemaInit } = require('../utils/schemaInit');
const { uploadToSharePoint, deleteFromOneDrive } = require('../services/azureService');

const ROLES = ['super_admin', 'admin', 'hr', 'hr_admin', 'hr_manager'];

router.use(authenticate);
router.use(authorize(...ROLES));

// ── Project-level scoping ───────────────────────────────────────────────
// This router previously only checked role, never project — any hr/hr_admin/
// hr_manager user had full read/write/delete access to every project's
// compliance data via direct API call, even ones deliberately restricted to
// specific projects elsewhere (project_members rows, e.g. Sonu Kushawaha /
// Bikram Ram / Yuvraj Kumar, whose sidebar menu just hides this page - that
// alone is not a server-side guard). super_admin/admin stay fully global.
// A normal HR admin has NO project_members rows and stays fully unrestricted
// too - project_members is an opt-in restriction, not a universal ACL, so
// only users who actually have rows there get scoped.
async function getComplianceScope(req) {
  if (['super_admin', 'admin'].includes(req.user.role)) return { restricted: false, allowed: null };
  const r = await query(
    `SELECT DISTINCT project_id FROM project_members WHERE user_id = $1`,
    [req.user.id]
  );
  if (!r.rows.length) return { restricted: false, allowed: null };
  return { restricted: true, allowed: r.rows.map(x => x.project_id) };
}

// projectId === null means Head Office, always allowed even when restricted
// (HO items aren't tied to any single project's membership list).
function scopeAllowsProject(scope, projectId) {
  if (!scope.restricted || !projectId) return true;
  return scope.allowed.includes(projectId);
}

// ─── Attachments (proof of filing/payment — challans, receipts, licence
// copies, agreements) — same pattern as HR Documents: local disk first,
// mirrored to SharePoint when configured (persists across redeploys; the
// app's own filesystem does not). ─────────────────────────────────────────
const SHAREPOINT_ENABLED = !!(
  process.env.ONEDRIVE_TENANT_ID &&
  process.env.ONEDRIVE_CLIENT_ID &&
  process.env.ONEDRIVE_CLIENT_SECRET &&
  process.env.SHAREPOINT_SITE_ID
);
const uploadDir = path.join(__dirname, '../../uploads/compliance-docs');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename:    (req, file, cb) => cb(null, `${Date.now()}-${file.originalname.replace(/\s+/g, '_')}`),
  }),
  limits: { fileSize: 25 * 1024 * 1024 },
});

const CATEGORIES = [
  'Shop & Establishment Registration',
  'PF Compliance',
  'Professional Tax',
  'Workmen Compensation Policy',
  'CLRA Licence',
  'BOCW Registration/Licence',
  'Labour Welfare Fund',
  'Rental Agreements',
  'Vehicle Insurance',
  'Labour Licence and other labour registrations',
  'Other HR/Admin Statutory Compliance',
];

runSchemaInit('compliance-tracker-tables-v1', async () => {
  await query(`
    CREATE TABLE IF NOT EXISTS compliance_obligations (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id UUID NOT NULL,
      project_id UUID REFERENCES projects(id),
      category TEXT NOT NULL,
      title TEXT NOT NULL,
      frequency TEXT NOT NULL DEFAULT 'Monthly' CHECK (frequency IN ('Monthly','Annual','One-time')),
      responsible_person TEXT,
      legal_reference TEXT,
      active BOOLEAN NOT NULL DEFAULT true,
      created_by UUID REFERENCES users(id),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS compliance_entries (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      obligation_id UUID NOT NULL REFERENCES compliance_obligations(id) ON DELETE CASCADE,
      company_id UUID NOT NULL,
      period TEXT,
      due_date DATE,
      actual_payment_date DATE,
      due_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
      amount_paid NUMERIC(14,2) NOT NULL DEFAULT 0,
      outstanding_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
      penalty_interest NUMERIC(14,2) NOT NULL DEFAULT 0,
      damages_charges NUMERIC(14,2) NOT NULL DEFAULT 0,
      delay_days INT,
      validity_expiry_date DATE,
      status TEXT NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending','Paid','Overdue','Closed','Not Applicable')),
      reason_for_delay TEXT,
      action_required TEXT,
      responsible_person TEXT,
      created_by UUID REFERENCES users(id),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_compliance_obligations_company ON compliance_obligations(company_id, project_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_compliance_entries_obligation ON compliance_entries(obligation_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_compliance_entries_company ON compliance_entries(company_id, status, due_date)`);
});

// Separate key — compliance-tracker-tables-v1 above has already run in prod,
// and runSchemaInit only ever fires a given key once, so new tables must go
// under a fresh key or they'd silently never get created.
runSchemaInit('compliance-tracker-documents-v1', async () => {
  await query(`
    CREATE TABLE IF NOT EXISTS compliance_documents (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      entry_id UUID NOT NULL REFERENCES compliance_entries(id) ON DELETE CASCADE,
      company_id UUID NOT NULL,
      doc_name TEXT NOT NULL,
      file_url TEXT NOT NULL,
      sharepoint_id TEXT,
      sharepoint_url TEXT,
      uploaded_by UUID REFERENCES users(id),
      uploaded_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_compliance_documents_entry ON compliance_documents(entry_id)`);
});

// BCIM-<PROJECT>-COM-001 style code, e.g. BCIM-HO-COM-001, BCIM-DQS-COM-001 —
// HO for Head Office (project_id NULL), otherwise the first word of the
// project name. Numbered per-project so each project's own sequence starts
// at 001, matching how PO/MR numbering already works elsewhere in the app.
function projectToken(projectName) {
  const t = (projectName || '').trim();
  if (!t) return 'HO';
  const word = t.match(/[A-Za-z]+/)?.[0] || 'GEN';
  return word.slice(0, 6).toUpperCase();
}

runSchemaInit('compliance-tracker-code-column-v1', async () => {
  await query(`ALTER TABLE compliance_obligations ADD COLUMN IF NOT EXISTS code TEXT`);
  const { rows } = await query(
    `SELECT o.id, p.name AS project_name
     FROM compliance_obligations o
     LEFT JOIN projects p ON p.id = o.project_id
     WHERE o.code IS NULL
     ORDER BY p.name NULLS FIRST, o.created_at`
  );
  const counters = {};
  for (const row of rows) {
    const token = projectToken(row.project_name);
    counters[token] = (counters[token] || 0) + 1;
    await query(`UPDATE compliance_obligations SET code=$1 WHERE id=$2`,
      [`BCIM-${token}-COM-${String(counters[token]).padStart(3, '0')}`, row.id]);
  }
  console.log(`[migration] compliance-tracker-code-column: assigned codes to ${rows.length} obligation(s)`);
});

// The code was generated by COUNT(*)+1 with no locking and no uniqueness
// constraint anywhere - two concurrent creates for the same project could
// mint the identical code. This adds the constraint (deduping any existing
// collisions first, renumbering the later-created duplicate) so a future
// collision fails loudly and gets retried (see insertObligationWithCode)
// instead of silently producing two obligations with the same code.
runSchemaInit('compliance-tracker-code-unique-v1', async () => {
  const dupes = await query(`
    SELECT id, company_id, code, project_id,
           ROW_NUMBER() OVER (PARTITION BY company_id, code ORDER BY created_at ASC) AS rn
    FROM compliance_obligations WHERE code IS NOT NULL
  `);
  let renumbered = 0;
  for (const row of dupes.rows.filter(r => r.rn > 1)) {
    const countRes = await query(
      `SELECT COUNT(*) FROM compliance_obligations o
       WHERE o.company_id=$1 AND ${row.project_id ? 'o.project_id=$2' : 'o.project_id IS NULL'} AND o.code IS NOT NULL`,
      row.project_id ? [row.company_id, row.project_id] : [row.company_id]
    );
    const prefix = row.code.replace(/-\d+$/, '');
    const newCode = `${prefix}-${String(parseInt(countRes.rows[0].count, 10) + 1).padStart(3, '0')}`;
    await query(`UPDATE compliance_obligations SET code=$1 WHERE id=$2`, [newCode, row.id]);
    renumbered++;
  }
  await query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_compliance_obligations_code_unique
    ON compliance_obligations(company_id, code) WHERE code IS NOT NULL
  `);
  console.log(`[migration] compliance-tracker-code-unique: renumbered ${renumbered} duplicate code(s), added unique index`);
});

// See PUT /obligations/:id — once a legacy-linked obligation's title/
// category/project is manually edited here, the legacy sync must stop
// re-syncing those fields from hr_compliance_items on every page load or
// the edit gets silently reverted.
runSchemaInit('compliance-tracker-manually-edited-column-v1', async () => {
  await query(`ALTER TABLE compliance_obligations ADD COLUMN IF NOT EXISTS manually_edited BOOLEAN NOT NULL DEFAULT FALSE`);
});

// ── Legacy sync — the old Dashboard tab (hr_compliance_items) has no
// document attachments and its items kept getting renamed/added after
// each one-off manual migration, so title-based matching missed renames
// and would have started creating duplicates. This links each obligation
// to its source row by ID (stable across renames) and reconciles on every
// read: new legacy items get an obligation+entry created, renamed ones get
// their title/category updated in place. Entry-level fields (amounts,
// documents, status) are never overwritten once created, since the user
// may have since enriched them here independently of the old tracker.
runSchemaInit('compliance-tracker-legacy-link-column-v1', async () => {
  await query(`ALTER TABLE compliance_obligations ADD COLUMN IF NOT EXISTS legacy_hr_item_id UUID`);
  // Backfill the 5 items already migrated by earlier one-off scripts, so
  // the ID link exists retroactively and reconciliation doesn't duplicate them.
  const KNOWN = [
    ['Shop & Est. License - Head Office', '6048af6b-860e-4c96-8ea0-f88b5f4a2873'],
    ['Shop & Est. License - Hyderabad', '7f5ed73d-6664-4962-a4e6-dba6c2a72bd3'],
    ['BOCW License - DQS', 'f7fcf295-813b-4a78-8ec3-038471925665'],
    ['WC Policy - 45 Employees -DQS', '2012ac67-f565-4ef3-a7cd-9474d702bd04'],
    ['CLRA License - DQS', 'd5150771-258c-42cb-be85-147a8c94707d'],
  ];
  for (const [title, hrId] of KNOWN) {
    await query(
      `UPDATE compliance_obligations SET legacy_hr_item_id=$1 WHERE title=$2 AND legacy_hr_item_id IS NULL`,
      [hrId, title]
    );
  }
});

// syncLegacyComplianceItems runs on every GET /obligations and /entries call
// with no locking, and the frontend fires both in parallel on page load —
// without a unique constraint, two concurrent requests both seeing the same
// not-yet-synced legacy item would each insert their own obligation for it.
// This closes that gap: dedupe anything already double-inserted, then add
// the constraint so the sync's ON CONFLICT DO NOTHING can rely on it.
runSchemaInit('compliance-tracker-legacy-unique-index-v1', async () => {
  // Postgres has no built-in MIN()/MAX() aggregate for uuid (it does support
  // comparison operators and ORDER BY on it, just not those two aggregates),
  // so the obvious "keep the MIN(id)" approach 500s with "function min(uuid)
  // does not exist" — DISTINCT ON does the same job without needing one.
  await query(`
    DELETE FROM compliance_obligations o
    WHERE o.legacy_hr_item_id IS NOT NULL
      AND o.id NOT IN (
        SELECT DISTINCT ON (legacy_hr_item_id) id
        FROM compliance_obligations
        WHERE legacy_hr_item_id IS NOT NULL
        ORDER BY legacy_hr_item_id, created_at ASC
      )
  `);
  await query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_compliance_obligations_legacy_unique
    ON compliance_obligations(legacy_hr_item_id) WHERE legacy_hr_item_id IS NOT NULL
  `);
});

// The location-vs-title fix above only corrects data the next time
// syncLegacyComplianceItems() actually runs (i.e. someone loads the
// tracker page) — this applies the same correction once immediately so
// the 2 already-misassigned Shop & Est. items don't sit wrong until then.
runSchemaInit('compliance-tracker-fix-ho-title-project-2026-08', async () => {
  const r = await query(`
    UPDATE compliance_obligations
    SET project_id = NULL, updated_at = NOW()
    WHERE legacy_hr_item_id IS NOT NULL
      AND title ILIKE '%head office%'
      AND project_id IS NOT NULL
  `);
  console.log(`[migration] compliance-tracker-fix-ho-title-project: corrected ${r.rowCount} obligation(s)`);
});

function categorizeLegacyItem(name, type) {
  const s = `${name || ''} ${type || ''}`;
  if (/shop.*establishment|establishment.*shop/i.test(s)) return 'Shop & Establishment Registration';
  if (/\bpf\b|provident fund/i.test(s)) return 'PF Compliance';
  if (/professional tax|\bpt\b/i.test(s)) return 'Professional Tax';
  if (/workmen compensation|\bwc\b.*polic/i.test(s)) return 'Workmen Compensation Policy';
  if (/clra/i.test(s)) return 'CLRA Licence';
  if (/bocw|building.*construction workers/i.test(s)) return 'BOCW Registration/Licence';
  if (/labour welfare|\blwf\b/i.test(s)) return 'Labour Welfare Fund';
  if (/rental agreement/i.test(s)) return 'Rental Agreements';
  if (/vehicle insurance/i.test(s)) return 'Vehicle Insurance';
  if (/labour licen/i.test(s)) return 'Labour Licence and other labour registrations';
  return 'Other HR/Admin Statutory Compliance';
}

async function syncLegacyComplianceItems(companyId) {
  const legacy = await query(
    `SELECT ci.*, o.id AS obligation_id, o.title AS current_title, o.category AS current_category,
            o.project_id AS current_project_id, o.manually_edited AS manually_edited
     FROM hr_compliance_items ci
     LEFT JOIN compliance_obligations o ON o.legacy_hr_item_id = ci.id
     WHERE ci.company_id = $1`,
    [companyId]
  );
  for (const item of legacy.rows) {
    // The item's own title is a more reliable signal than `location` —
    // location tends to carry over whatever value was left in the form
    // from the last item created, so e.g. "Shop & Est. License - Head
    // Office" had ended up with location="Tech-P3" from an unrelated
    // earlier entry and got wrongly reassigned there. If the title itself
    // says "Head Office", trust that over location outright.
    const proj = (!/head office/i.test(item.name || '') && item.location)
      ? await query(`SELECT id, name FROM projects WHERE company_id=$1 AND name=$2`, [companyId, item.location])
      : { rows: [] };
    const projectId = proj.rows[0]?.id || null;
    const category = categorizeLegacyItem(item.name, item.type);

    if (!item.obligation_id) {
      // New legacy item never synced before — create obligation + entry.
      const token = projectToken(proj.rows[0]?.name);
      const countRes = await query(
        `SELECT COUNT(*) FROM compliance_obligations o WHERE o.company_id=$1 AND ${projectId ? 'o.project_id=$2' : 'o.project_id IS NULL'}`,
        projectId ? [companyId, projectId] : [companyId]
      );
      // ON CONFLICT DO NOTHING against the unique index on legacy_hr_item_id
      // — if a concurrent request already synced this exact legacy item
      // between the SELECT above and here, this insert is a no-op and
      // returns no row, so we skip creating a duplicate entry too. The code
      // itself also has a unique constraint (see compliance-tracker-code-
      // unique-v1) — retry with the next number on a collision against some
      // other obligation created concurrently in the same project.
      let ob = { rows: [] };
      for (let attempt = 0; attempt < 5 && !ob.rows.length; attempt++) {
        const code = `BCIM-${token}-COM-${String(parseInt(countRes.rows[0].count, 10) + 1 + attempt).padStart(3, '0')}`;
        try {
          ob = await query(
            `INSERT INTO compliance_obligations
               (company_id, project_id, category, title, frequency, responsible_person, legal_reference, created_by, code, legacy_hr_item_id)
             VALUES ($1,$2,$3,$4,'Annual',$5,$6,$7,$8,$9)
             ON CONFLICT (legacy_hr_item_id) WHERE legacy_hr_item_id IS NOT NULL DO NOTHING
             RETURNING id`,
            [companyId, projectId, category, item.name, item.owner || 'HR', item.legal_ref || null, item.created_by, code, item.id]
          );
        } catch (e) {
          if (e.code === '23505' && attempt < 4) continue;
          throw e;
        }
      }
      if (!ob.rows.length) continue;
      await query(
        `INSERT INTO compliance_entries
           (obligation_id, company_id, due_date, due_amount, amount_paid, outstanding_amount,
            validity_expiry_date, status, responsible_person, created_by)
         VALUES ($1,$2,$3,0,0,0,$4,$5,$6,$7)`,
        [ob.rows[0].id, companyId, item.due_date, item.renewal_date,
         item.status === 'Compliant' ? 'Paid' : 'Pending', item.owner || 'HR', item.created_by]
      );
      console.log(`[compliance-sync] new legacy item synced: ${item.name}`);
    } else if (!item.manually_edited && (item.current_title !== item.name || item.current_category !== category || String(item.current_project_id) !== String(projectId))) {
      // Renamed / recategorized / moved on the old tracker — sync the label,
      // not the entry's own tracked amounts/status (may differ intentionally).
      await query(
        `UPDATE compliance_obligations SET title=$1, category=$2, project_id=$3, updated_at=NOW() WHERE id=$4`,
        [item.name, category, projectId, item.obligation_id]
      );
      console.log(`[compliance-sync] legacy item renamed/updated: ${item.name}`);
    }
  }
}

const n = (v) => Math.round((parseFloat(v) || 0) * 100) / 100;

// Auto-flip Pending -> Overdue for anything past due, and (re)compute
// outstanding/delay so the tracker never silently drifts stale.
//
// Two things this must NOT do (both were bugs in an earlier version):
// 1. Treat due_amount=0 as automatically "settled" — a non-monetary
//    compliance (e.g. a licence renewal with no fee) has due_amount=0 by
//    default, and silently forcing it to 'Paid' meant it could never be
//    flagged Overdue even after its due date passed with nothing done.
// 2. Only compute Overdue from the outstanding amount — a zero-fee item
//    past its due date is exactly as much a compliance miss as an unpaid
//    one, so overdue detection must key off due_date, not money.
function deriveEntry({ due_date, actual_payment_date, due_amount, amount_paid, status }) {
  const dueAmt = n(due_amount);
  const paidAmt = n(amount_paid);
  const outstanding = n(dueAmt - paidAmt);
  let delayDays = null;
  if (due_date) {
    const due = new Date(due_date);
    const ref = actual_payment_date ? new Date(actual_payment_date) : new Date();
    delayDays = Math.round((ref - due) / 86400000);
    if (delayDays < 0) delayDays = 0;
  }
  let finalStatus = status;
  if (status !== 'Closed' && status !== 'Not Applicable') {
    const isPastDue = !!(due_date && new Date(due_date) < new Date());
    const settled = !!actual_payment_date || (dueAmt > 0 && outstanding <= 0.5);
    if (settled) finalStatus = 'Paid';
    else if (isPastDue) finalStatus = 'Overdue';
    else if (!finalStatus) finalStatus = 'Pending';
  }
  return { outstanding, delayDays, finalStatus };
}

// The stored `status` column only gets recomputed when someone edits that
// specific entry — with nothing to touch it, a Pending item just sits
// there forever even after its due date passes, so Overdue counts and the
// weekly report both silently undercount. This computes the SAME status
// live at read time instead of trusting the (possibly stale) stored value.
// Relies on Postgres row-to-object conversion taking the LAST column of a
// given name, so this alias overrides e.status in e.* without needing to
// enumerate every other column.
const EFFECTIVE_STATUS_SQL = `
  CASE
    WHEN e.status IN ('Closed','Not Applicable','Paid') THEN e.status
    WHEN e.due_date IS NOT NULL AND e.due_date < CURRENT_DATE THEN 'Overdue'
    ELSE COALESCE(e.status, 'Pending')
  END`;

// ── Categories ───────────────────────────────────────────────────────────
router.get('/categories', (req, res) => res.json({ data: CATEGORIES }));

// ── Obligations (master list) ───────────────────────────────────────────
router.get('/obligations', async (req, res) => {
  try {
    await syncLegacyComplianceItems(req.user.company_id).catch(e => console.error('[compliance-sync] failed:', e.message));
    const { project_id } = req.query;
    const params = [req.user.company_id];
    let where = 'o.company_id = $1 AND o.active = TRUE';
    // 'ALL' is an explicit "don't scope to a single project" signal from the
    // frontend, needed because the axios interceptor auto-injects the
    // globally-selected project_id onto any request missing one - without
    // this, the page's own "All Projects + HO" filter was silently
    // overridden and could never actually show every project's items.
    if (project_id === 'HO') { where += ' AND o.project_id IS NULL'; }
    else if (project_id && project_id !== 'ALL') { params.push(project_id); where += ` AND o.project_id = $${params.length}`; }
    const scope = await getComplianceScope(req);
    if (scope.restricted) {
      params.push(scope.allowed);
      where += ` AND (o.project_id IS NULL OR o.project_id = ANY($${params.length}::uuid[]))`;
    }
    const { rows } = await query(
      `SELECT o.*, p.name AS project_name
       FROM compliance_obligations o
       LEFT JOIN projects p ON p.id = o.project_id
       WHERE ${where}
       ORDER BY p.name NULLS FIRST, o.category`,
      params
    );
    res.json({ data: rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Generates the next BCIM-<TOKEN>-COM-### code and inserts the obligation
// inside a single retry loop: two concurrent creates for the same project
// could otherwise both COUNT the same existing rows and mint the identical
// code (no locking, no unique constraint) - on a collision (23505), just
// recompute the count and retry a few times rather than fail the request.
async function insertObligationWithCode(fields, projectId, companyId) {
  const p = projectId ? await query(`SELECT name FROM projects WHERE id=$1`, [projectId]) : { rows: [] };
  const token = projectToken(p.rows[0]?.name);
  for (let attempt = 0; attempt < 5; attempt++) {
    const countRes = await query(
      `SELECT COUNT(*) FROM compliance_obligations o
       WHERE o.company_id=$1 AND ${projectId ? 'o.project_id=$2' : 'o.project_id IS NULL'}`,
      projectId ? [companyId, projectId] : [companyId]
    );
    const code = `BCIM-${token}-COM-${String(parseInt(countRes.rows[0].count, 10) + 1 + attempt).padStart(3, '0')}`;
    try {
      const { rows } = await query(
        `INSERT INTO compliance_obligations
           (company_id, project_id, category, title, frequency, responsible_person, legal_reference, created_by, code)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
        [companyId, projectId || null, fields.category, fields.title, fields.frequency || 'Monthly',
         fields.responsible_person || null, fields.legal_reference || null, fields.created_by, code]
      );
      return rows[0];
    } catch (e) {
      if (e.code === '23505' && attempt < 4) continue; // unique_violation on code — retry with a higher number
      throw e;
    }
  }
}

router.post('/obligations', async (req, res) => {
  try {
    const { project_id, category, title, frequency, responsible_person, legal_reference } = req.body;
    if (!category || !title) return res.status(400).json({ error: 'category and title are required' });

    const scope = await getComplianceScope(req);
    if (!scopeAllowsProject(scope, project_id || null)) {
      return res.status(403).json({ error: 'Access denied for this project.' });
    }

    const row = await insertObligationWithCode(
      { category, title, frequency, responsible_person, legal_reference, created_by: req.user.id },
      project_id || null, req.user.company_id
    );
    res.status(201).json({ data: row });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/obligations/:id', async (req, res) => {
  try {
    const existing = await query(`SELECT project_id, legacy_hr_item_id FROM compliance_obligations WHERE id=$1 AND company_id=$2`,
      [req.params.id, req.user.company_id]);
    if (!existing.rows.length) return res.status(404).json({ error: 'Not found' });
    const scope = await getComplianceScope(req);
    if (!scopeAllowsProject(scope, existing.rows[0].project_id)) {
      return res.status(403).json({ error: 'Access denied for this project.' });
    }

    const { category, title, frequency, responsible_person, legal_reference, active } = req.body;
    // A legacy-linked obligation gets its title/category re-synced from the
    // old Dashboard-tab item on every page load (syncLegacyComplianceItems)
    // — without this flag, an edit made here would just get silently
    // reverted the next time anyone loads the tracker. Once manually
    // edited, the legacy sync leaves title/category/project alone for good.
    const manuallyEditedClause = existing.rows[0].legacy_hr_item_id ? `, manually_edited = TRUE` : '';
    const { rows } = await query(
      `UPDATE compliance_obligations SET
         category=COALESCE($1,category), title=COALESCE($2,title), frequency=COALESCE($3,frequency),
         responsible_person=COALESCE($4,responsible_person), legal_reference=COALESCE($5,legal_reference),
         active=COALESCE($6,active), updated_at=NOW() ${manuallyEditedClause}
       WHERE id=$7 AND company_id=$8 RETURNING *`,
      [category, title, frequency, responsible_person, legal_reference, active, req.params.id, req.user.company_id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json({ data: rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/obligations/:id', async (req, res) => {
  try {
    const existing = await query(`SELECT project_id FROM compliance_obligations WHERE id=$1 AND company_id=$2`,
      [req.params.id, req.user.company_id]);
    if (!existing.rows.length) return res.status(404).json({ error: 'Not found' });
    const scope = await getComplianceScope(req);
    if (!scopeAllowsProject(scope, existing.rows[0].project_id)) {
      return res.status(403).json({ error: 'Access denied for this project.' });
    }
    await query(`UPDATE compliance_obligations SET active=FALSE, updated_at=NOW() WHERE id=$1 AND company_id=$2`,
      [req.params.id, req.user.company_id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Entries (per-period occurrences carrying the 13 tracked fields) ──────
router.get('/entries', async (req, res) => {
  try {
    await syncLegacyComplianceItems(req.user.company_id).catch(e => console.error('[compliance-sync] failed:', e.message));
    const { project_id, status, category } = req.query;
    const params = [req.user.company_id];
    let where = 'e.company_id = $1';
    // See matching comment in GET /obligations above re: 'ALL' sentinel.
    if (project_id === 'HO') where += ' AND o.project_id IS NULL';
    else if (project_id && project_id !== 'ALL') { params.push(project_id); where += ` AND o.project_id = $${params.length}`; }
    // Filters against the live-computed status below, not the possibly-stale
    // stored column — otherwise an "Overdue" filter would miss anything that
    // passed its due date without ever being re-saved.
    if (status) { params.push(status); where += ` AND (${EFFECTIVE_STATUS_SQL}) = $${params.length}`; }
    if (category) { params.push(category); where += ` AND o.category = $${params.length}`; }
    const scope = await getComplianceScope(req);
    if (scope.restricted) {
      params.push(scope.allowed);
      where += ` AND (o.project_id IS NULL OR o.project_id = ANY($${params.length}::uuid[]))`;
    }
    const { rows } = await query(
      `SELECT e.*, o.category, o.title AS obligation_title, o.project_id, o.frequency, o.code AS obligation_code,
              p.name AS project_name,
              COALESCE((SELECT COUNT(*) FROM compliance_documents d WHERE d.entry_id = e.id), 0) AS document_count,
              ${EFFECTIVE_STATUS_SQL} AS status
       FROM compliance_entries e
       JOIN compliance_obligations o ON o.id = e.obligation_id
       LEFT JOIN projects p ON p.id = o.project_id
       WHERE ${where}
       ORDER BY e.due_date NULLS LAST`,
      params
    );
    res.json({ data: rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/entries', async (req, res) => {
  try {
    const {
      obligation_id, period, due_date, actual_payment_date, due_amount, amount_paid,
      penalty_interest, damages_charges, validity_expiry_date, status,
      reason_for_delay, action_required, responsible_person,
    } = req.body;
    if (!obligation_id) return res.status(400).json({ error: 'obligation_id is required' });

    const ob = await query(`SELECT id, project_id FROM compliance_obligations WHERE id=$1 AND company_id=$2`,
      [obligation_id, req.user.company_id]);
    if (!ob.rows.length) return res.status(404).json({ error: 'Obligation not found' });
    const scope = await getComplianceScope(req);
    if (!scopeAllowsProject(scope, ob.rows[0].project_id)) {
      return res.status(403).json({ error: 'Access denied for this project.' });
    }

    const { outstanding, delayDays, finalStatus } = deriveEntry({
      due_date, actual_payment_date, due_amount, amount_paid, status,
    });

    const { rows } = await query(
      `INSERT INTO compliance_entries
         (obligation_id, company_id, period, due_date, actual_payment_date, due_amount, amount_paid,
          outstanding_amount, penalty_interest, damages_charges, delay_days, validity_expiry_date,
          status, reason_for_delay, action_required, responsible_person, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING *`,
      [obligation_id, req.user.company_id, period || null, due_date || null, actual_payment_date || null,
       n(due_amount), n(amount_paid), outstanding, n(penalty_interest), n(damages_charges), delayDays,
       validity_expiry_date || null, finalStatus, reason_for_delay || null, action_required || null,
       responsible_person || null, req.user.id]
    );
    res.status(201).json({ data: rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/entries/:id', async (req, res) => {
  try {
    const cur = await query(
      `SELECT e.*, o.project_id AS obligation_project_id FROM compliance_entries e
       JOIN compliance_obligations o ON o.id = e.obligation_id
       WHERE e.id=$1 AND e.company_id=$2`,
      [req.params.id, req.user.company_id]);
    if (!cur.rows.length) return res.status(404).json({ error: 'Not found' });
    const existing = cur.rows[0];
    const scope = await getComplianceScope(req);
    if (!scopeAllowsProject(scope, existing.obligation_project_id)) {
      return res.status(403).json({ error: 'Access denied for this project.' });
    }

    const merged = {
      due_date: req.body.due_date !== undefined ? req.body.due_date : existing.due_date,
      actual_payment_date: req.body.actual_payment_date !== undefined ? req.body.actual_payment_date : existing.actual_payment_date,
      due_amount: req.body.due_amount !== undefined ? req.body.due_amount : existing.due_amount,
      amount_paid: req.body.amount_paid !== undefined ? req.body.amount_paid : existing.amount_paid,
      status: req.body.status !== undefined ? req.body.status : existing.status,
    };
    const { outstanding, delayDays, finalStatus } = deriveEntry(merged);

    // Date columns reject '' outright ("invalid input syntax for type
    // date"), and the edit form always submits every field (a controlled
    // form, not a partial patch) — so a cleared date field arrives as ''
    // here, not undefined, and would otherwise crash this endpoint with a
    // 500 the moment anyone actually used the edit button.
    const { rows } = await query(
      `UPDATE compliance_entries SET
         period=COALESCE($1,period), due_date=$2, actual_payment_date=$3,
         due_amount=$4, amount_paid=$5, outstanding_amount=$6,
         penalty_interest=COALESCE($7,penalty_interest), damages_charges=COALESCE($8,damages_charges),
         delay_days=$9, validity_expiry_date=COALESCE($10,validity_expiry_date),
         status=$11, reason_for_delay=COALESCE($12,reason_for_delay),
         action_required=COALESCE($13,action_required), responsible_person=COALESCE($14,responsible_person),
         updated_at=NOW()
       WHERE id=$15 AND company_id=$16 RETURNING *`,
      [req.body.period, merged.due_date || null, merged.actual_payment_date || null, n(merged.due_amount), n(merged.amount_paid),
       outstanding, req.body.penalty_interest !== undefined ? n(req.body.penalty_interest) : undefined,
       req.body.damages_charges !== undefined ? n(req.body.damages_charges) : undefined,
       delayDays, req.body.validity_expiry_date || null, finalStatus, req.body.reason_for_delay,
       req.body.action_required, req.body.responsible_person, req.params.id, req.user.company_id]
    );
    res.json({ data: rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Deletes the physical file (local disk or SharePoint) behind one
// compliance_documents row. Shared by DELETE /documents/:id and DELETE
// /entries/:id, since the latter previously only removed the DB rows
// (via ON DELETE CASCADE) and left every attached file orphaned forever.
function deleteDocumentFile(doc) {
  if (doc.sharepoint_id) {
    deleteFromOneDrive(doc.sharepoint_id).catch(e => console.error('[compliance-tracker] OneDrive delete failed:', e.message));
  } else if (doc.file_url?.startsWith('/uploads/compliance-docs/')) {
    fs.unlink(path.join(__dirname, '../..', doc.file_url), () => {});
  }
}

router.delete('/entries/:id', async (req, res) => {
  try {
    const cur = await query(
      `SELECT o.project_id FROM compliance_entries e
       JOIN compliance_obligations o ON o.id = e.obligation_id
       WHERE e.id=$1 AND e.company_id=$2`,
      [req.params.id, req.user.company_id]);
    if (!cur.rows.length) return res.status(404).json({ error: 'Not found' });
    const scope = await getComplianceScope(req);
    if (!scopeAllowsProject(scope, cur.rows[0].project_id)) {
      return res.status(403).json({ error: 'Access denied for this project.' });
    }
    const docs = await query(`SELECT * FROM compliance_documents WHERE entry_id=$1`, [req.params.id]);
    docs.rows.forEach(deleteDocumentFile);
    await query(`DELETE FROM compliance_entries WHERE id=$1 AND company_id=$2`, [req.params.id, req.user.company_id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Documents (challans, receipts, licence/agreement copies, etc.) ───────
router.get('/entries/:id/documents', async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT d.*, u.name AS uploaded_by_name FROM compliance_documents d
       LEFT JOIN users u ON u.id = d.uploaded_by
       WHERE d.entry_id=$1 AND d.company_id=$2 ORDER BY d.uploaded_at DESC`,
      [req.params.id, req.user.company_id]
    );
    res.json({ data: rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/entries/:id/documents', upload.single('file'), async (req, res) => {
  try {
    const entryRes = await query(
      `SELECT e.id, o.project_id FROM compliance_entries e
       JOIN compliance_obligations o ON o.id = e.obligation_id
       WHERE e.id=$1 AND e.company_id=$2`,
      [req.params.id, req.user.company_id]);
    if (!entryRes.rows.length) return res.status(404).json({ error: 'Entry not found' });
    const scope = await getComplianceScope(req);
    if (!scopeAllowsProject(scope, entryRes.rows[0].project_id)) {
      return res.status(403).json({ error: 'Access denied for this project.' });
    }
    if (!req.file) return res.status(400).json({ error: 'file is required' });

    let spId = null, spUrl = null, fileUrl = `/uploads/compliance-docs/${req.file.filename}`;
    if (SHAREPOINT_ENABLED) {
      try {
        const fileBuffer = fs.readFileSync(req.file.path);
        const sp = await uploadToSharePoint(req.file.originalname, fileBuffer, 'Compliance Documents');
        spId = sp.id;
        spUrl = sp.webUrl;
        fileUrl = sp.downloadUrl || sp.webUrl;
        fs.unlink(req.file.path, () => {});
      } catch (spErr) {
        console.error('[compliance-tracker] SharePoint upload failed, keeping local copy:', spErr.message);
      }
    }

    const { rows } = await query(
      `INSERT INTO compliance_documents (entry_id, company_id, doc_name, file_url, sharepoint_id, sharepoint_url, uploaded_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [req.params.id, req.user.company_id, req.body.doc_name || req.file.originalname, fileUrl, spId, spUrl, req.user.id]
    );
    res.status(201).json({ data: rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/documents/:id', async (req, res) => {
  try {
    const docRes = await query(`SELECT * FROM compliance_documents WHERE id=$1 AND company_id=$2`,
      [req.params.id, req.user.company_id]);
    if (!docRes.rows.length) return res.status(404).json({ error: 'Not found' });
    deleteDocumentFile(docRes.rows[0]);
    await query(`DELETE FROM compliance_documents WHERE id=$1`, [req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Dashboard summary — outstanding total, overdue count, upcoming 30 days
router.get('/summary', async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT
         COUNT(*) FILTER (WHERE (${EFFECTIVE_STATUS_SQL}) = 'Overdue')                                  AS overdue_count,
         COALESCE(SUM(e.outstanding_amount) FILTER (WHERE (${EFFECTIVE_STATUS_SQL}) IN ('Pending','Overdue')), 0) AS total_outstanding,
         COALESCE(SUM(e.penalty_interest + e.damages_charges) FILTER (WHERE (${EFFECTIVE_STATUS_SQL}) <> 'Closed'), 0) AS total_penalty_damages,
         COUNT(*) FILTER (WHERE e.due_date BETWEEN CURRENT_DATE AND CURRENT_DATE + 30 AND (${EFFECTIVE_STATUS_SQL}) IN ('Pending','Overdue')) AS due_in_30_days
       FROM compliance_entries e
       WHERE e.company_id = $1`,
      [req.user.company_id]
    );
    res.json({ data: rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Weekly report config + manual trigger ─────────────────────────────────
router.get('/report-config', async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT * FROM compliance_report_configs WHERE company_id=$1 ORDER BY created_at`,
      [req.user.company_id]
    );
    res.json({ data: rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/report-config', async (req, res) => {
  try {
    const { recipients, enabled = true } = req.body;
    if (!recipients) return res.status(400).json({ error: 'recipients is required' });
    const { rows } = await query(
      `INSERT INTO compliance_report_configs (company_id, recipients, enabled) VALUES ($1,$2,$3) RETURNING *`,
      [req.user.company_id, recipients, enabled]
    );
    res.status(201).json({ data: rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/report-config/:id', async (req, res) => {
  try {
    const { recipients, enabled } = req.body;
    const { rows } = await query(
      `UPDATE compliance_report_configs SET recipients=COALESCE($1,recipients), enabled=COALESCE($2,enabled), updated_at=NOW()
       WHERE id=$3 AND company_id=$4 RETURNING *`,
      [recipients, enabled, req.params.id, req.user.company_id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json({ data: rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/report-config/:id', async (req, res) => {
  try {
    await query(`DELETE FROM compliance_report_configs WHERE id=$1 AND company_id=$2`, [req.params.id, req.user.company_id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/report-config/send-now', async (req, res) => {
  try {
    const { runComplianceWeeklyReport } = require('../utils/compliance-weekly-report.service');
    const result = await runComplianceWeeklyReport({ manual: true, company_id: req.user.company_id });
    res.json({ data: result });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── One-time: migrate the 2 items that were already logged in the old
// "Compliance Tracker" Dashboard tab (hr_compliance_items, no attachment
// support) into this newer, project/HO-scoped tracker with document
// attachments and the weekly Monday report. Guarded by name so re-runs
// (or a later manual copy of the same items) are a no-op.
runSchemaInit('compliance-tracker-migrate-legacy-shop-est-2026-08', async () => {
  const legacy = await query(
    `SELECT * FROM hr_compliance_items WHERE name IN
       ('Shop & Est. License - Hyderabad', 'Shop & Est. License - Head Office')`
  );
  for (const item of legacy.rows) {
    const exists = await query(
      `SELECT id FROM compliance_obligations WHERE company_id=$1 AND title=$2`,
      [item.company_id, item.name]
    );
    if (exists.rows.length) continue;

    const ob = await query(
      `INSERT INTO compliance_obligations
         (company_id, project_id, category, title, frequency, responsible_person, legal_reference, created_by)
       VALUES ($1,NULL,'Shop & Establishment Registration',$2,'Annual',$3,$4,$5) RETURNING id`,
      [item.company_id, item.name, item.owner || 'HR', item.legal_ref || null, item.created_by]
    );

    await query(
      `INSERT INTO compliance_entries
         (obligation_id, company_id, due_date, due_amount, amount_paid, outstanding_amount,
          validity_expiry_date, status, responsible_person, created_by)
       VALUES ($1,$2,$3,0,0,0,$4,'Paid',$5,$6)`,
      [ob.rows[0].id, item.company_id, item.due_date, item.renewal_date, item.owner || 'HR', item.created_by]
    );
  }
  console.log(`[migration] compliance-tracker-migrate-legacy-shop-est: migrated ${legacy.rows.length} legacy item(s)`);
});

// ── One-time: migrate 3 more legacy Dashboard-tab items added after the
// first migration above — BOCW/CLRA/WC Policy for DQS Towers. Their
// `applicable_to` says "Head Office" but `location` correctly says "DQS
// Towers", so unlike the shop & establishment items these are scoped to
// the actual DQS Towers project, not HO.
runSchemaInit('compliance-tracker-migrate-legacy-dqs-2026-08', async () => {
  const legacy = await query(
    `SELECT * FROM hr_compliance_items WHERE name IN
       ('BOCW License - DQS', 'CLRA License - DQS', 'WC Policy - 45 Employees -DQS')`
  );
  const CATEGORY_MAP = {
    'BOCW License - DQS': 'BOCW Registration/Licence',
    'CLRA License - DQS': 'CLRA Licence',
    'WC Policy - 45 Employees -DQS': 'Workmen Compensation Policy',
  };
  for (const item of legacy.rows) {
    const exists = await query(
      `SELECT id FROM compliance_obligations WHERE company_id=$1 AND title=$2`,
      [item.company_id, item.name]
    );
    if (exists.rows.length) continue;

    const proj = await query(
      `SELECT id, name FROM projects WHERE company_id=$1 AND name=$2`,
      [item.company_id, item.location]
    );
    const projectId = proj.rows[0]?.id || null;
    const token = projectToken(proj.rows[0]?.name);
    const countRes = await query(
      `SELECT COUNT(*) FROM compliance_obligations o
       WHERE o.company_id=$1 AND ${projectId ? 'o.project_id=$2' : 'o.project_id IS NULL'}`,
      projectId ? [item.company_id, projectId] : [item.company_id]
    );
    const code = `BCIM-${token}-COM-${String(parseInt(countRes.rows[0].count, 10) + 1).padStart(3, '0')}`;

    const ob = await query(
      `INSERT INTO compliance_obligations
         (company_id, project_id, category, title, frequency, responsible_person, legal_reference, created_by, code)
       VALUES ($1,$2,$3,$4,'Annual',$5,$6,$7,$8) RETURNING id`,
      [item.company_id, projectId, CATEGORY_MAP[item.name] || 'Other HR/Admin Statutory Compliance',
       item.name, item.owner || 'HR', item.legal_ref || null, item.created_by, code]
    );

    await query(
      `INSERT INTO compliance_entries
         (obligation_id, company_id, due_date, due_amount, amount_paid, outstanding_amount,
          validity_expiry_date, status, responsible_person, created_by)
       VALUES ($1,$2,$3,0,0,0,$4,$5,$6,$7)`,
      [ob.rows[0].id, item.company_id, item.due_date, item.renewal_date,
       item.status === 'Compliant' ? 'Paid' : 'Pending', item.owner || 'HR', item.created_by]
    );
  }
  console.log(`[migration] compliance-tracker-migrate-legacy-dqs: migrated ${legacy.rows.length} legacy item(s)`);
});

module.exports = router;
