// backend/src/services/notif.helper.js
// Centralised push + in-app notification helpers for every ERP workflow event.
// All functions are fire-and-forget — they never throw, so they never break
// the parent HTTP request.
const { createNotification } = require('../controllers/notification.controller');
const { sendPushToUser, sendPushToUsersByEmail, sendPushToRole } = require('./fcm.service');

// ─── Shared push helper ────────────────────────────────────────────────────────
// Sends push to a specific user AND creates an in-app notification record.
function notify(opts) {
  // opts: { company_id, user_id?, target_role?, type, title, message, link, severity, related_type, related_id }
  createNotification({ sendEmail: false, ...opts }).catch(() => {});
}

// Convenience: push directly to multiple email addresses (no in-app record)
function pushEmails(companyId, emails, payload) {
  sendPushToUsersByEmail(companyId, emails, payload).catch(() => {});
}

// ══════════════════════════════════════════════════════════════════════════════
// MATERIAL REQUEST (MRS)  — base notifications already in mrs.routes.js
// ══════════════════════════════════════════════════════════════════════════════
// Additional: when any approval stage completes, notify the next approver role
function notifyMrNextApprover(companyId, mrs, nextRole, stageDoneLabel) {
  notify({
    company_id: companyId,
    target_role: nextRole,
    type: 'mr_pending_approval',
    title: `MR Awaiting Your Approval: ${mrs.serial_no_formatted || mrs.mrs_number}`,
    message: `${stageDoneLabel} is complete. Your approval is needed for MR from ${mrs.project_name || 'a project'}.`,
    link: '/stores/mrs',
    severity: 'warning',
    related_type: 'material_requisition',
    related_id: mrs.id,
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// SC BILLS
// ══════════════════════════════════════════════════════════════════════════════
function notifyScBillSubmitted(companyId, bill) {
  // Notify accounts + management + project_manager
  for (const role of ['accounts', 'project_manager', 'management']) {
    notify({
      company_id: companyId,
      target_role: role,
      type: 'sc_bill_submitted',
      title: `SC Bill Submitted: ${bill.bill_number || bill.id}`,
      message: `${bill.sc_name || 'Subcontractor'} submitted bill ${bill.bill_number} (${bill.project_name || ''}) for ₹${Number(bill.net_payable || 0).toLocaleString('en-IN')}. Review & approve.`,
      link: '/sc/bill-approval',
      severity: 'warning',
      related_type: 'sc_bill',
      related_id: bill.id,
    });
  }
}

function notifyScBillApproved(companyId, bill, actorName) {
  if (bill.submitted_by) {
    notify({
      company_id: companyId,
      user_id: bill.submitted_by,
      type: 'sc_bill_approved',
      title: `SC Bill Approved: ${bill.bill_number}`,
      message: `Your bill ${bill.bill_number} has been approved by ${actorName}.`,
      link: '/sc/bill-approval',
      severity: 'info',
      related_type: 'sc_bill',
      related_id: bill.id,
    });
  }
}

function notifyScBillFullyApproved(companyId, bill, actorName) {
  // Fully approved — tell accounts to process payment
  notify({
    company_id: companyId,
    target_role: 'accounts',
    type: 'sc_bill_fully_approved',
    title: `SC Bill Ready for Payment: ${bill.bill_number}`,
    message: `Bill ${bill.bill_number} (${bill.sc_name || ''}) has been fully approved. Proceed with payment of ₹${Number(bill.net_payable || 0).toLocaleString('en-IN')}.`,
    link: '/sc/bill-approval',
    severity: 'info',
    related_type: 'sc_bill',
    related_id: bill.id,
  });
  if (bill.submitted_by) notifyScBillApproved(companyId, bill, actorName);
}

function notifyScBillRejected(companyId, bill, actorName, reason) {
  if (bill.submitted_by) {
    notify({
      company_id: companyId,
      user_id: bill.submitted_by,
      type: 'sc_bill_rejected',
      title: `SC Bill Rejected: ${bill.bill_number}`,
      message: `Your bill ${bill.bill_number} was rejected by ${actorName}. ${reason ? `Reason: ${reason}` : ''}`,
      link: '/sc/bill-approval',
      severity: 'critical',
      related_type: 'sc_bill',
      related_id: bill.id,
    });
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// SC WORK ORDERS
// ══════════════════════════════════════════════════════════════════════════════
function notifyScWoSubmitted(companyId, wo) {
  for (const role of ['project_manager', 'admin']) {
    notify({
      company_id: companyId,
      target_role: role,
      type: 'sc_wo_submitted',
      title: `Work Order Submitted: ${wo.wo_number || wo.id}`,
      message: `A new work order for ${wo.sc_name || 'subcontractor'} (${wo.project_name || ''}) worth ₹${Number(wo.contract_amount || 0).toLocaleString('en-IN')} needs your approval.`,
      link: '/sc/work-orders',
      severity: 'warning',
      related_type: 'sc_wo',
      related_id: wo.id,
    });
  }
}

function notifyScWoApproved(companyId, wo, actorName) {
  if (wo.created_by) {
    notify({
      company_id: companyId,
      user_id: wo.created_by,
      type: 'sc_wo_approved',
      title: `Work Order Approved: ${wo.wo_number}`,
      message: `Work order ${wo.wo_number} has been approved by ${actorName}. It is now active.`,
      link: '/sc/work-orders',
      severity: 'info',
      related_type: 'sc_wo',
      related_id: wo.id,
    });
  }
}

function notifyScWoRejected(companyId, wo, actorName) {
  if (wo.created_by) {
    notify({
      company_id: companyId,
      user_id: wo.created_by,
      type: 'sc_wo_rejected',
      title: `Work Order Rejected: ${wo.wo_number}`,
      message: `Work order ${wo.wo_number} was rejected by ${actorName} and returned to draft.`,
      link: '/sc/work-orders',
      severity: 'warning',
      related_type: 'sc_wo',
      related_id: wo.id,
    });
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// SC MEASUREMENT BOOK
// ══════════════════════════════════════════════════════════════════════════════
function notifyScMbChecked(companyId, mb, actorName) {
  if (mb.submitted_by) {
    notify({
      company_id: companyId,
      user_id: mb.submitted_by,
      type: 'sc_mb_checked',
      title: `MB Entry Checked: ${mb.id}`,
      message: `Your measurement book entry has been checked by ${actorName}. Awaiting final approval.`,
      link: '/sc',
      severity: 'info',
      related_type: 'sc_mb',
      related_id: mb.id,
    });
  }
  notify({
    company_id: companyId,
    target_role: 'project_manager',
    type: 'sc_mb_pending_approval',
    title: 'MB Entry Ready for Approval',
    message: `A measurement book entry has been checked and is waiting for your final approval.`,
    link: '/sc',
    severity: 'warning',
    related_type: 'sc_mb',
    related_id: mb.id,
  });
}

function notifyScMbApproved(companyId, mb, actorName) {
  if (mb.submitted_by) {
    notify({
      company_id: companyId,
      user_id: mb.submitted_by,
      type: 'sc_mb_approved',
      title: 'MB Entry Approved',
      message: `Your measurement book entry has been approved by ${actorName}.`,
      link: '/sc',
      severity: 'info',
      related_type: 'sc_mb',
      related_id: mb.id,
    });
  }
}

function notifyScMbRejected(companyId, mb, actorName, reason) {
  if (mb.submitted_by) {
    notify({
      company_id: companyId,
      user_id: mb.submitted_by,
      type: 'sc_mb_rejected',
      title: 'MB Entry Rejected',
      message: `Your measurement book entry was rejected by ${actorName}. ${reason ? `Reason: ${reason}` : ''}`,
      link: '/sc',
      severity: 'critical',
      related_type: 'sc_mb',
      related_id: mb.id,
    });
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// SC NMR (Muster Roll)
// ══════════════════════════════════════════════════════════════════════════════
function notifyScNmrApproved(companyId, nmr, actorName) {
  if (nmr.submitted_by) {
    notify({
      company_id: companyId,
      user_id: nmr.submitted_by,
      type: 'sc_nmr_approved',
      title: 'NMR Approved',
      message: `The muster roll has been approved by ${actorName}. HR payroll can proceed.`,
      link: '/sc',
      severity: 'info',
      related_type: 'sc_nmr',
      related_id: nmr.id,
    });
  }
  notify({
    company_id: companyId,
    target_role: 'hr',
    type: 'sc_nmr_approved',
    title: 'Muster Roll Approved — Action Needed',
    message: `A subcontractor muster roll has been approved. Process payroll/labour payments.`,
    link: '/sc',
    severity: 'info',
    related_type: 'sc_nmr',
    related_id: nmr.id,
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// SC RETENTION RELEASE
// ══════════════════════════════════════════════════════════════════════════════
function notifyRetentionApproved(companyId, ret, actorName) {
  notify({
    company_id: companyId,
    target_role: 'accounts',
    type: 'retention_approved',
    title: `Retention Release Approved`,
    message: `Retention release for ${ret.sc_name || 'subcontractor'} of ₹${Number(ret.amount || 0).toLocaleString('en-IN')} approved by ${actorName}. Process payment.`,
    link: '/sc',
    severity: 'info',
    related_type: 'sc_retention',
    related_id: ret.id,
  });
}

function notifyRetentionRejected(companyId, ret, actorName) {
  if (ret.created_by) {
    notify({
      company_id: companyId,
      user_id: ret.created_by,
      type: 'retention_rejected',
      title: `Retention Release Rejected`,
      message: `Your retention release request was rejected by ${actorName}.`,
      link: '/sc',
      severity: 'warning',
      related_type: 'sc_retention',
      related_id: ret.id,
    });
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// GRN (Goods Received Note)
// ══════════════════════════════════════════════════════════════════════════════
function notifyGrnSubmitted(companyId, grn) {
  notify({
    company_id: companyId,
    target_role: 'stores',
    type: 'grn_submitted',
    title: `New GRN Submitted: ${grn.grn_number || grn.id}`,
    message: `GRN from ${grn.vendor_name || 'vendor'} (${grn.project_name || ''}) needs stores verification.`,
    link: '/stores/grn',
    severity: 'warning',
    related_type: 'grn',
    related_id: grn.id,
  });
  // Also push by email to stores team
  const storesEmails = (process.env.MRS_STORES_NOTIFY_EMAILS || 'vijayan@bcim.in').split(',').map(e => e.trim()).filter(Boolean);
  pushEmails(companyId, storesEmails, {
    title: `New GRN: ${grn.grn_number || ''}`,
    body: `GRN from ${grn.vendor_name || 'vendor'} received. Needs stores verification.`,
    data: { link: '/stores/grn', type: 'grn_submitted', related_id: grn.id || '' },
  });
}

function notifyGrnVerifiedStores(companyId, grn, actorName) {
  notify({
    company_id: companyId,
    target_role: 'project_manager',
    type: 'grn_verified_stores',
    title: `GRN Stores Verified: ${grn.grn_number || grn.id}`,
    message: `GRN ${grn.grn_number} has been verified by stores (${actorName}). Pending QC approval.`,
    link: '/stores/grn',
    severity: 'info',
    related_type: 'grn',
    related_id: grn.id,
  });
}

function notifyGrnApproved(companyId, grn, actorName) {
  if (grn.received_by) {
    notify({
      company_id: companyId,
      user_id: grn.received_by,
      type: 'grn_approved',
      title: `GRN Approved: ${grn.grn_number}`,
      message: `GRN ${grn.grn_number} has been fully approved by ${actorName}. Inventory has been updated.`,
      link: '/stores/grn',
      severity: 'info',
      related_type: 'grn',
      related_id: grn.id,
    });
  }
  notify({
    company_id: companyId,
    target_role: 'accounts',
    type: 'grn_approved',
    title: `GRN Approved — Invoice Processing`,
    message: `GRN ${grn.grn_number} (${grn.vendor_name || ''}) approved. 3-way match can now be completed.`,
    link: '/stores/grn',
    severity: 'info',
    related_type: 'grn',
    related_id: grn.id,
  });
}

function notifyGrnRejected(companyId, grn, actorName, reason) {
  if (grn.received_by) {
    notify({
      company_id: companyId,
      user_id: grn.received_by,
      type: 'grn_rejected',
      title: `GRN Rejected: ${grn.grn_number}`,
      message: `GRN ${grn.grn_number} was rejected by ${actorName}. ${reason ? `Reason: ${reason}` : ''}`,
      link: '/stores/grn',
      severity: 'critical',
      related_type: 'grn',
      related_id: grn.id,
    });
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// PURCHASE ORDERS
// ══════════════════════════════════════════════════════════════════════════════
function notifyPoCreated(companyId, po) {
  for (const role of ['accounts', 'project_manager', 'management']) {
    notify({
      company_id: companyId,
      target_role: role,
      type: 'po_created',
      title: `New PO Created: ${po.po_number}`,
      message: `PO ${po.po_number} for ${po.vendor_name || 'vendor'} (₹${Number(po.total_amount || 0).toLocaleString('en-IN')}) has been created by ${po.created_by_name || 'procurement'}.`,
      link: '/procurement/po',
      severity: 'info',
      related_type: 'po',
      related_id: po.id,
    });
  }
}

function notifyPoApproved(companyId, po, actorName) {
  if (po.created_by) {
    notify({
      company_id: companyId,
      user_id: po.created_by,
      type: 'po_approved',
      title: `PO Approved: ${po.po_number}`,
      message: `Purchase order ${po.po_number} was approved by ${actorName}.`,
      link: '/procurement/po',
      severity: 'info',
      related_type: 'po',
      related_id: po.id,
    });
  }
}

function notifyPoRejected(companyId, po, actorName, reason) {
  if (po.created_by) {
    notify({
      company_id: companyId,
      user_id: po.created_by,
      type: 'po_rejected',
      title: `PO Rejected: ${po.po_number}`,
      message: `Purchase order ${po.po_number} was rejected by ${actorName}. ${reason ? `Reason: ${reason}` : ''}`,
      link: '/procurement/po',
      severity: 'critical',
      related_type: 'po',
      related_id: po.id,
    });
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// LEAVE REQUESTS
// ══════════════════════════════════════════════════════════════════════════════
function notifyLeaveRequested(companyId, leave, requesterName) {
  notify({
    company_id: companyId,
    target_role: 'hr',
    type: 'leave_requested',
    title: `Leave Request: ${requesterName}`,
    message: `${requesterName} has applied for ${leave.leave_type || 'leave'} from ${leave.from_date} to ${leave.to_date}. Please review and approve.`,
    link: '/hr/leave',
    severity: 'info',
    related_type: 'leave',
    related_id: leave.id,
  });
  notify({
    company_id: companyId,
    target_role: 'project_manager',
    type: 'leave_requested',
    title: `Leave Request: ${requesterName}`,
    message: `${requesterName} has applied for ${leave.leave_type || 'leave'} from ${leave.from_date} to ${leave.to_date}.`,
    link: '/hr/leave',
    severity: 'info',
    related_type: 'leave',
    related_id: leave.id,
  });
}

function notifyLeaveApproved(companyId, leave, applicantUserId, actorName) {
  if (applicantUserId) {
    notify({
      company_id: companyId,
      user_id: applicantUserId,
      type: 'leave_approved',
      title: 'Leave Request Approved',
      message: `Your leave request (${leave.leave_type}) from ${leave.from_date} to ${leave.to_date} has been approved by ${actorName}.`,
      link: '/hr/leave',
      severity: 'info',
      related_type: 'leave',
      related_id: leave.id,
    });
  }
}

function notifyLeaveRejected(companyId, leave, applicantUserId, actorName, reason) {
  if (applicantUserId) {
    notify({
      company_id: companyId,
      user_id: applicantUserId,
      type: 'leave_rejected',
      title: 'Leave Request Rejected',
      message: `Your leave request (${leave.leave_type}) was rejected by ${actorName}. ${reason ? `Reason: ${reason}` : ''}`,
      link: '/hr/leave',
      severity: 'warning',
      related_type: 'leave',
      related_id: leave.id,
    });
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// EXPENSE CLAIMS
// ══════════════════════════════════════════════════════════════════════════════
function notifyExpenseSubmitted(companyId, expense, submitterName) {
  notify({
    company_id: companyId,
    target_role: 'accounts',
    type: 'expense_submitted',
    title: `Expense Claim: ${submitterName}`,
    message: `${submitterName} submitted an expense claim of ₹${Number(expense.amount || 0).toLocaleString('en-IN')} for approval.`,
    link: '/hr/expenses',
    severity: 'info',
    related_type: 'expense',
    related_id: expense.id,
  });
}

function notifyExpenseApproved(companyId, expense, applicantUserId, actorName) {
  if (applicantUserId) {
    notify({
      company_id: companyId,
      user_id: applicantUserId,
      type: 'expense_approved',
      title: 'Expense Claim Approved',
      message: `Your expense claim of ₹${Number(expense.amount || 0).toLocaleString('en-IN')} has been approved by ${actorName}.`,
      link: '/hr/expenses',
      severity: 'info',
      related_type: 'expense',
      related_id: expense.id,
    });
  }
}

function notifyExpenseRejected(companyId, expense, applicantUserId, actorName, reason) {
  if (applicantUserId) {
    notify({
      company_id: companyId,
      user_id: applicantUserId,
      type: 'expense_rejected',
      title: 'Expense Claim Rejected',
      message: `Your expense claim was rejected by ${actorName}. ${reason ? `Reason: ${reason}` : ''}`,
      link: '/hr/expenses',
      severity: 'warning',
      related_type: 'expense',
      related_id: expense.id,
    });
  }
}

function notifyExpensePaid(companyId, expense, applicantUserId) {
  if (applicantUserId) {
    notify({
      company_id: companyId,
      user_id: applicantUserId,
      type: 'expense_paid',
      title: 'Expense Claim Paid',
      message: `Your expense claim of ₹${Number(expense.amount || 0).toLocaleString('en-IN')} has been paid.`,
      link: '/hr/expenses',
      severity: 'info',
      related_type: 'expense',
      related_id: expense.id,
    });
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// LOAN / ADVANCE
// ══════════════════════════════════════════════════════════════════════════════
function notifyLoanRequested(companyId, loan, employeeName) {
  notify({
    company_id: companyId,
    target_role: 'hr',
    type: 'loan_requested',
    title: `Loan Request: ${employeeName}`,
    message: `${employeeName} has requested a loan/advance of ₹${Number(loan.amount || 0).toLocaleString('en-IN')}.`,
    link: '/hr/loans',
    severity: 'info',
    related_type: 'loan',
    related_id: loan.id,
  });
}

function notifyLoanApproved(companyId, loan, applicantUserId, actorName) {
  if (applicantUserId) {
    notify({
      company_id: companyId,
      user_id: applicantUserId,
      type: 'loan_approved',
      title: 'Loan/Advance Approved',
      message: `Your loan/advance request of ₹${Number(loan.amount || 0).toLocaleString('en-IN')} has been approved by ${actorName}.`,
      link: '/hr/loans',
      severity: 'info',
      related_type: 'loan',
      related_id: loan.id,
    });
  }
}

function notifyLoanRejected(companyId, loan, applicantUserId, actorName) {
  if (applicantUserId) {
    notify({
      company_id: companyId,
      user_id: applicantUserId,
      type: 'loan_rejected',
      title: 'Loan/Advance Rejected',
      message: `Your loan/advance request was rejected by ${actorName}.`,
      link: '/hr/loans',
      severity: 'warning',
      related_type: 'loan',
      related_id: loan.id,
    });
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// PAYMENTS
// ══════════════════════════════════════════════════════════════════════════════
function notifyPaymentRecorded(companyId, payment, actorName) {
  notify({
    company_id: companyId,
    target_role: 'accounts',
    type: 'payment_recorded',
    title: `Payment Recorded: ₹${Number(payment.amount || 0).toLocaleString('en-IN')}`,
    message: `Payment of ₹${Number(payment.amount || 0).toLocaleString('en-IN')} to ${payment.vendor_name || payment.sc_name || 'party'} recorded by ${actorName}.`,
    link: '/procurement/payments',
    severity: 'info',
    related_type: 'payment',
    related_id: payment.id,
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// MATERIAL INDENT
// ══════════════════════════════════════════════════════════════════════════════
function notifyIndentSubmitted(companyId, indent, submitterName) {
  notify({
    company_id: companyId,
    target_role: 'project_manager',
    type: 'indent_submitted',
    title: `Material Indent Submitted`,
    message: `${submitterName} submitted a material indent for ${indent.project_name || 'a project'}. Please approve.`,
    link: '/stores/indent',
    severity: 'warning',
    related_type: 'indent',
    related_id: indent.id,
  });
}

function notifyIndentApproved(companyId, indent, submitterUserId, actorName) {
  if (submitterUserId) {
    notify({
      company_id: companyId,
      user_id: submitterUserId,
      type: 'indent_approved',
      title: 'Material Indent Approved',
      message: `Your material indent has been approved by ${actorName}. Procurement will proceed.`,
      link: '/stores/indent',
      severity: 'info',
      related_type: 'indent',
      related_id: indent.id,
    });
  }
  notify({
    company_id: companyId,
    target_role: 'procurement',
    type: 'indent_approved',
    title: 'Material Indent Approved — Action Needed',
    message: `A material indent has been approved. Please raise RFQ/PO.`,
    link: '/stores/indent',
    severity: 'info',
    related_type: 'indent',
    related_id: indent.id,
  });
}

function notifyIndentRejected(companyId, indent, submitterUserId, actorName, reason) {
  if (submitterUserId) {
    notify({
      company_id: companyId,
      user_id: submitterUserId,
      type: 'indent_rejected',
      title: 'Material Indent Rejected',
      message: `Your material indent was rejected by ${actorName}. ${reason ? `Reason: ${reason}` : ''}`,
      link: '/stores/indent',
      severity: 'warning',
      related_type: 'indent',
      related_id: indent.id,
    });
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// QUALITY — NCR, Submittals, RFI
// ══════════════════════════════════════════════════════════════════════════════
function notifyNcrRaised(companyId, ncr, raisedByName) {
  for (const role of ['project_manager', 'qs_engineer']) {
    notify({
      company_id: companyId,
      target_role: role,
      type: 'ncr_raised',
      title: `NCR Raised: ${ncr.ncr_number || ncr.id}`,
      message: `Non-conformance reported by ${raisedByName} for ${ncr.project_name || 'a project'}. Action required.`,
      link: '/quality/document-control',
      severity: 'critical',
      related_type: 'ncr',
      related_id: ncr.id,
    });
  }
}

function notifySubmittalStatusChanged(companyId, submittal, newStatus, actorName) {
  if (submittal.created_by) {
    notify({
      company_id: companyId,
      user_id: submittal.created_by,
      type: 'submittal_' + newStatus,
      title: `Submittal ${newStatus === 'approved' ? 'Approved' : 'Updated'}: ${submittal.submittal_number}`,
      message: `Submittal ${submittal.submittal_number} has been ${newStatus} by ${actorName}.`,
      link: '/quality/document-control',
      severity: newStatus === 'approved' ? 'info' : 'warning',
      related_type: 'submittal',
      related_id: submittal.id,
    });
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// SNAG / DEFECT
// ══════════════════════════════════════════════════════════════════════════════
function notifySnagRaised(companyId, snag, raisedByName) {
  if (snag.assigned_to) {
    notify({
      company_id: companyId,
      user_id: snag.assigned_to,
      type: 'snag_raised',
      title: `Snag Assigned to You`,
      message: `A new snag/defect has been assigned to you by ${raisedByName}: ${snag.description || ''}`,
      link: '/quality/snag',
      severity: 'warning',
      related_type: 'snag',
      related_id: snag.id,
    });
  }
}

function notifySnagClosed(companyId, snag, actorName) {
  if (snag.raised_by) {
    notify({
      company_id: companyId,
      user_id: snag.raised_by,
      type: 'snag_closed',
      title: `Snag Closed`,
      message: `Snag "${snag.description || snag.id}" has been closed/rectified by ${actorName}.`,
      link: '/quality/snag',
      severity: 'info',
      related_type: 'snag',
      related_id: snag.id,
    });
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// DPR (Daily Progress Report)
// ══════════════════════════════════════════════════════════════════════════════
function notifyDprSubmitted(companyId, dpr, submitterName) {
  notify({
    company_id: companyId,
    target_role: 'project_manager',
    type: 'dpr_submitted',
    title: `DPR Submitted`,
    message: `Daily progress report for ${dpr.report_date || 'today'} submitted by ${submitterName}. Please review.`,
    link: '/planning/dpr',
    severity: 'info',
    related_type: 'dpr',
    related_id: dpr.id,
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// IT TICKET
// ══════════════════════════════════════════════════════════════════════════════
function notifyTicketRaised(companyId, ticket, raisedByName) {
  notify({
    company_id: companyId,
    target_role: 'admin',
    type: 'ticket_raised',
    title: `IT Ticket: ${ticket.ticket_number || ticket.id}`,
    message: `${raisedByName} raised a support ticket: ${ticket.subject || ticket.description || ''}`,
    link: '/it/tickets',
    severity: 'info',
    related_type: 'it_ticket',
    related_id: ticket.id,
  });
}

function notifyTicketResolved(companyId, ticket, raisedByUserId, actorName) {
  if (raisedByUserId) {
    notify({
      company_id: companyId,
      user_id: raisedByUserId,
      type: 'ticket_resolved',
      title: `IT Ticket Resolved`,
      message: `Your support ticket "${ticket.subject || ticket.id}" has been resolved by ${actorName}.`,
      link: '/it/tickets',
      severity: 'info',
      related_type: 'it_ticket',
      related_id: ticket.id,
    });
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// SC PAYMENT
// ══════════════════════════════════════════════════════════════════════════════
function notifyScPaymentRecorded(companyId, payment, actorName) {
  if (payment.created_by) {
    notify({
      company_id: companyId,
      user_id: payment.created_by,
      type: 'sc_payment_recorded',
      title: `SC Payment Recorded`,
      message: `Payment of ₹${Number(payment.amount || 0).toLocaleString('en-IN')} to ${payment.sc_name || 'subcontractor'} has been recorded by ${actorName}.`,
      link: '/sc',
      severity: 'info',
      related_type: 'sc_payment',
      related_id: payment.id,
    });
  }
  notify({
    company_id: companyId,
    target_role: 'accounts',
    type: 'sc_payment_recorded',
    title: `SC Payment: ₹${Number(payment.amount || 0).toLocaleString('en-IN')}`,
    message: `SC payment to ${payment.sc_name || 'subcontractor'} recorded. Update books.`,
    link: '/sc',
    severity: 'info',
    related_type: 'sc_payment',
    related_id: payment.id,
  });
}

module.exports = {
  // MR
  notifyMrNextApprover,
  // SC Bills
  notifyScBillSubmitted, notifyScBillApproved, notifyScBillFullyApproved, notifyScBillRejected,
  // SC Work Orders
  notifyScWoSubmitted, notifyScWoApproved, notifyScWoRejected,
  // SC Measurement Book
  notifyScMbChecked, notifyScMbApproved, notifyScMbRejected,
  // SC NMR
  notifyScNmrApproved,
  // Retention
  notifyRetentionApproved, notifyRetentionRejected,
  // GRN
  notifyGrnSubmitted, notifyGrnVerifiedStores, notifyGrnApproved, notifyGrnRejected,
  // PO
  notifyPoCreated, notifyPoApproved, notifyPoRejected,
  // Leave
  notifyLeaveRequested, notifyLeaveApproved, notifyLeaveRejected,
  // Expense
  notifyExpenseSubmitted, notifyExpenseApproved, notifyExpenseRejected, notifyExpensePaid,
  // Loan
  notifyLoanRequested, notifyLoanApproved, notifyLoanRejected,
  // Payment
  notifyPaymentRecorded,
  // Indent
  notifyIndentSubmitted, notifyIndentApproved, notifyIndentRejected,
  // Quality
  notifyNcrRaised, notifySubmittalStatusChanged,
  // Snag
  notifySnagRaised, notifySnagClosed,
  // DPR
  notifyDprSubmitted,
  // IT Ticket
  notifyTicketRaised, notifyTicketResolved,
  // SC Payment
  notifyScPaymentRecorded,
};
