// Canonical MRS (Material Requisition Slip) approval-chain definitions.
//
// Single source of truth used by:
//  - routes/mrs.routes.js — to enforce who may act on an MRS at its current stage
//  - routes/approvals.routes.js (GET /pending, POST /:id/action) — to decide which
//    MRS items to SHOW a user and what happens when they approve one
//
// Each project can enable a SUBSET of these stages via projects.mrs_workflow.stages
// (e.g. a project with no "Project Director" appointed skips the approve-mgmt stage
// entirely: stores-approve → approve-pm → approve-md). Any code that decides "does
// this status need action from role X" or "what does approving this status turn
// into" MUST go through buildChain()/nextStageForStatus() below rather than
// hardcoding the 4-stage default — hardcoding it silently strands MRS items at a
// stage no user holds the role for, with no way to unstick them.
const ALL_STAGES = [
  { id: 'stores-approve', nextStatus: 'stores_verified', colBy: 'stores_approved_by', colAt: 'stores_approved_at', sigCol: 'stores_sig_img', label: 'Store Manager',      allowedRoles: ['stores_manager', 'store_keeper'] },
  { id: 'approve-pm',     nextStatus: 'approved_pm',     colBy: 'approved_pm_by',     colAt: 'approved_pm_at',     sigCol: 'pm_sig_img',     label: 'Project Manager',    allowedRoles: ['project_manager', 'pm', 'project_head'], legacyPrev: ['verified_tower'] },
  { id: 'approve-mgmt',   nextStatus: 'approved_mgmt',   colBy: 'approved_mgmt_by',   colAt: 'approved_mgmt_at',   sigCol: 'mgmt_sig_img',   label: 'Project Director',   allowedRoles: ['project_head', 'director', 'project_director', 'management', 'management_director'], legacyPrev: ['approved_srpm'] },
  { id: 'approve-md',     nextStatus: 'approved_md',     colBy: 'approved_md_by',     colAt: 'approved_md_at',     sigCol: 'md_sig_img',     label: 'Managing Director',  allowedRoles: ['managing_director', 'md', 'ceo'] },
];

const GLOBAL_ADMIN_ROLES = ['admin', 'super_admin'];
const DEFAULT_STAGE_IDS = ALL_STAGES.map(s => s.id);

function normalizeStageIds(stageIds) {
  if (!Array.isArray(stageIds) || !stageIds.length) return DEFAULT_STAGE_IDS;
  const valid = new Set(DEFAULT_STAGE_IDS);
  const normalized = stageIds.filter(id => valid.has(id));
  return normalized.length ? normalized : DEFAULT_STAGE_IDS;
}

// Build a dynamic chain for a given list of enabled stage IDs.
// Returns an object keyed by stageId → { ...stageDef, requiredPrev }
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

// Given an MRS's current status and the project's enabled stage IDs, find the
// stage that should act on it next (or null if the status is terminal/invalid
// for this project's chain — e.g. 'approved_mgmt' on a project that skips that
// stage entirely).
function nextStageForStatus(enabledStageIds, currentStatus) {
  const chain = buildChain(enabledStageIds);
  for (const stage of Object.values(chain)) {
    if (stage.requiredPrev === currentStatus) return stage;
  }
  return null;
}

module.exports = {
  ALL_STAGES,
  GLOBAL_ADMIN_ROLES,
  DEFAULT_STAGE_IDS,
  normalizeStageIds,
  buildChain,
  nextStageForStatus,
};
