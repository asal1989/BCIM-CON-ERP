// Shared MR (material requisition) status vocabulary and approval-chain
// helpers, used by the MR Register, the Stores Dashboard and anywhere else
// that has to render or bucket an MR by where it sits in the approval chain.
//
// These mirror FULLY_APPROVED / IS_AWAITING_CLIENT in
// backend/src/routes/supply-tracker.routes.js. The subtlety they encode:
// 'approved_md' is NOT universally terminal. Projects can opt into a final
// Client Approval stage (projects.mrs_workflow.stages contains
// 'client-approve'), and on those projects an MD-approved MR is still waiting
// on the client — it must not be shown or counted as ready for a PO. Any page
// that hardcodes "approved_md means done" silently mis-reports those projects.

export const CLIENT_APPROVE_STAGE = 'client-approve';

/** Does this MR's project require client sign-off after MD approval? */
export function usesClientApproval(mr) {
  const stages = mr?.mrs_workflow?.stages;
  return Array.isArray(stages) && stages.includes(CLIENT_APPROVE_STAGE);
}

/** MD has signed, but the project still needs the client's sign-off. */
export function isAwaitingClient(mr) {
  return mr?.status === 'approved_md' && usesClientApproval(mr);
}

/** Cleared every approval stage this MR's project actually requires. */
export function isFullyApproved(mr) {
  if (mr?.status === 'client_approved') return true;
  return mr?.status === 'approved_md' && !usesClientApproval(mr);
}

/**
 * Display status key. Splits the ambiguous 'approved_md' into either a
 * terminal "MD Approved" or a distinct "Awaiting Client", so the two never
 * share a pill.
 */
export function displayStatus(mr) {
  return isAwaitingClient(mr) ? 'awaiting_client' : (mr?.status || 'pending');
}

// Ordered stages of the internal chain, for progress steppers.
export const MR_CHAIN = [
  { key: 'pending',         short: 'REQ',    label: 'Raised'          },
  { key: 'stores_verified', short: 'STR',    label: 'Store Manager'   },
  { key: 'approved_pm',     short: 'PM',     label: 'Project Manager' },
  { key: 'approved_mgmt',   short: 'DIR',    label: 'Project Director'},
  { key: 'approved_md',     short: 'MD',     label: 'Managing Director' },
  { key: 'client_approved', short: 'CLI',    label: 'Client Approval', optIn: true },
];

// Legacy status aliases that mean the same stage as a canonical one.
const STATUS_ALIAS = { verified_tower: 'stores_verified', approved_srpm: 'approved_pm', approved_sr_pm: 'approved_pm' };
export const canonicalStatus = (s) => STATUS_ALIAS[s] || s;

/**
 * How far along the chain an MR has got, as an index into MR_CHAIN.
 * -1 for rejected/draft/issued (not meaningfully "in" the chain).
 */
export function chainProgress(mr) {
  const s = canonicalStatus(mr?.status);
  if (['rejected', 'draft'].includes(s)) return -1;
  const idx = MR_CHAIN.findIndex(c => c.key === s);
  return idx;
}
