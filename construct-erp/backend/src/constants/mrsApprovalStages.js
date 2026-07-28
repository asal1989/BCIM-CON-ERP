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
  // Client sign-off — the client has no login here, so this stage is LOGGED by
  // one of our own staff on the client's behalf (see CLIENT_APPROVAL_LOGGERS in
  // routes/mrs.routes.js). allowedRoles is deliberately empty: authorisation is
  // an explicit person allowlist, not a role, so it must never fall through to
  // the normal role check.
  { id: 'client-approve', nextStatus: 'client_approved', colBy: 'client_approved_by', colAt: 'client_approved_at', label: 'Client Approval',    allowedRoles: [], optIn: true },
];

const GLOBAL_ADMIN_ROLES = ['admin', 'super_admin'];
// Stages a project gets when it has NO explicit mrs_workflow config. Opt-in
// stages (client approval) are excluded — appending one to ALL_STAGES must never
// silently start demanding it on every existing project.
const DEFAULT_STAGE_IDS = ALL_STAGES.filter(s => !s.optIn).map(s => s.id);
// Every stage id that may legitimately appear in a project's saved workflow.
const VALID_STAGE_IDS = ALL_STAGES.map(s => s.id);

function normalizeStageIds(stageIds) {
  if (!Array.isArray(stageIds) || !stageIds.length) return DEFAULT_STAGE_IDS;
  // Validate against every known stage (not just the defaults) so an opt-in
  // stage a project has deliberately enabled survives normalisation.
  const valid = new Set(VALID_STAGE_IDS);
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
  VALID_STAGE_IDS,
  normalizeStageIds,
  buildChain,
  nextStageForStatus,
};
