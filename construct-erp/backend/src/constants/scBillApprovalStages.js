// Canonical map of role -> which sc_bills.current_stage values that role may act on.
//
// Single source of truth used by:
//  - routes/approvals.routes.js (GET /pending) to decide which SC bills to SHOW a user
//  - routes/sc.routes.js (approve/query/reject) to ENFORCE who may actually act on a bill
// Keep both usages pointed at this file — a bill's current_stage previously had no
// enforcement on the action routes, which let any approver-ish role (e.g. the MD)
// approve a bill still sitting at the QS stage, silently skipping the actual QS
// reviewer.
function scBillScopeForRole(role) {
  const map = {
    site_engineer:       { statuses: ['submitted'],                 stageNames: ['qs_engineer','site_engineer'] },
    qs_engineer:         { statuses: ['submitted','under_review'],   stageNames: ['qs_engineer'] },
    project_manager:     { statuses: ['under_review'],               stageNames: ['project_head','project_manager'] },
    project_head:        { statuses: ['under_review'],               stageNames: ['project_head','project_manager'] },
    accounts:            { statuses: ['under_review'],               stageNames: ['accounts'] },
    management:          { statuses: ['under_review'],               stageNames: ['project_head','management'] },
    management_director: { statuses: ['under_review'],               stageNames: ['project_head','management','management_director'] },
    director:            { statuses: ['under_review'],               stageNames: ['project_head','management','director'] },
    project_director:    { statuses: ['under_review'],               stageNames: ['project_head','management','project_director'] },
    managing_director:   { statuses: ['under_review'],               stageNames: ['managing_director','md'] },
    md:                  { statuses: ['under_review'],               stageNames: ['managing_director','md'] },
    ceo:                 { statuses: ['under_review'],               stageNames: ['managing_director','md','ceo'] },
    cfo:                 { statuses: ['under_review'],               stageNames: ['managing_director','cfo'] },
    admin:               { statuses: ['submitted','under_review'],   stageNames: [] },
    super_admin:         { statuses: ['submitted','under_review'],   stageNames: [] },
  };
  return map[role] || { statuses: [], stageNames: [] };
}

module.exports = { scBillScopeForRole };
