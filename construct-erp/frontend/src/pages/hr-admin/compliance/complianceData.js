// src/pages/hr-admin/compliance/complianceData.js
// Shared constants + dummy enterprise data for the HR Compliance module.

export const C = {
  primary: '#2563EB',
  success: '#22C55E',
  danger:  '#EF4444',
  warning: '#F59E0B',
  info:    '#06B6D4',
  purple:  '#8B5CF6',
  bg:      '#F8FAFC',
};

export const COMPLIANCE_TYPES = [
  'PF', 'ESI', 'PT', 'TDS', 'Labour License', 'Factory License', 'Contract Labour',
  'POSH', 'Gratuity', 'Bonus Act', 'Minimum Wages', 'Shops & Establishment',
  'Building & Other Construction Workers', 'Fire NOC', 'Pollution Certificate',
  'ISO', 'Safety Audit', 'Internal Audit', 'Vendor Compliance', 'Insurance',
  'Medical Checkup', 'Training', 'Background Verification',
];

export const STATUSES   = ['Compliant', 'Pending', 'Overdue', 'In Progress', 'Expired'];
export const PRIORITIES = ['Critical', 'High', 'Medium', 'Low'];
export const DEPARTMENTS = ['HR', 'Finance', 'Safety (HSE)', 'Admin', 'Projects', 'Stores', 'Plant & Machinery'];
export const LOCATIONS   = ['Head Office', 'LANCO Hills — LH 10', 'Yelahanka Site', 'Warehouse — Peenya'];

export const STATUS_STYLES = {
  'Compliant':   { bg: '#ECFDF5', text: '#059669', dot: '#22C55E' },
  'Pending':     { bg: '#FFFBEB', text: '#B45309', dot: '#F59E0B' },
  'Overdue':     { bg: '#FEF2F2', text: '#DC2626', dot: '#EF4444' },
  'In Progress': { bg: '#EFF6FF', text: '#2563EB', dot: '#3B82F6' },
  'Expired':     { bg: '#F1F5F9', text: '#64748B', dot: '#94A3B8' },
};

export const PRIORITY_STYLES = {
  'Critical': { bg: '#FEF2F2', text: '#DC2626' },
  'High':     { bg: '#FFF7ED', text: '#EA580C' },
  'Medium':   { bg: '#EFF6FF', text: '#2563EB' },
  'Low':      { bg: '#ECFDF5', text: '#059669' },
};

export const RENEWAL_FREQUENCIES = ['One-time', 'Monthly', 'Quarterly', 'Half-yearly', 'Annual', 'Every 5 years'];

// ── Dummy enterprise dataset ──────────────────────────────────────────────────
export const DUMMY_COMPLIANCES = [
  { id: 'CMP-2026-001', name: 'PF Monthly Return (ECR)',            category: 'Statutory',  type: 'PF',                 applicableTo: 'All Employees',      department: 'Finance',      location: 'Head Office',            dueDate: '2026-07-15', renewalDate: '2026-08-15', status: 'In Progress', priority: 'Critical', owner: 'Nandhini R',   documents: 4,  lastUpdated: '2026-07-09', description: 'Electronic Challan-cum-Return filing for Provident Fund contributions of all eligible employees.', legalRef: 'EPF & MP Act, 1952 — Para 38(1)' },
  { id: 'CMP-2026-002', name: 'ESI Half-yearly Return',             category: 'Statutory',  type: 'ESI',                applicableTo: 'Site Workers',       department: 'HR',           location: 'LANCO Hills — LH 10',    dueDate: '2026-11-11', renewalDate: '2027-05-11', status: 'Compliant',   priority: 'High',     owner: 'Vignesh M',    documents: 6,  lastUpdated: '2026-06-28', description: 'Half-yearly contribution return for employees covered under ESI.', legalRef: 'ESI Act, 1948 — Reg. 26' },
  { id: 'CMP-2026-003', name: 'Professional Tax Remittance',        category: 'Statutory',  type: 'PT',                 applicableTo: 'All Employees',      department: 'Finance',      location: 'Head Office',            dueDate: '2026-07-20', renewalDate: '2026-08-20', status: 'Pending',     priority: 'High',     owner: 'Kavya S',      documents: 2,  lastUpdated: '2026-07-05', description: 'Monthly professional tax deduction and remittance to the state authority.', legalRef: 'Telangana PT Act, 1987' },
  { id: 'CMP-2026-004', name: 'Labour License Renewal',             category: 'License',    type: 'Labour License',     applicableTo: 'Contract Workers',   department: 'Projects',     location: 'LANCO Hills — LH 10',    dueDate: '2026-07-08', renewalDate: '2026-07-08', status: 'Overdue',     priority: 'Critical', owner: 'Arun Kumar',   documents: 8,  lastUpdated: '2026-07-01', description: 'Renewal of contract labour license for 240 workers at LH-10 site.', legalRef: 'CLRA Act, 1970 — Sec 12' },
  { id: 'CMP-2026-005', name: 'BOCW Cess Payment',                  category: 'Statutory',  type: 'Building & Other Construction Workers', applicableTo: 'Construction Staff', department: 'Projects', location: 'Yelahanka Site', dueDate: '2026-07-30', renewalDate: '2026-10-30', status: 'In Progress', priority: 'High', owner: 'Priya Nair', documents: 3, lastUpdated: '2026-07-10', description: '1% cess on construction cost payable to the BOCW Welfare Board.', legalRef: 'BOCW Cess Act, 1996' },
  { id: 'CMP-2026-006', name: 'POSH Committee Annual Report',       category: 'Legal',      type: 'POSH',               applicableTo: 'All Employees',      department: 'HR',           location: 'Head Office',            dueDate: '2026-12-31', renewalDate: '2027-12-31', status: 'Compliant',   priority: 'Medium',   owner: 'Nandhini R',   documents: 5,  lastUpdated: '2026-05-14', description: 'Annual report of the Internal Complaints Committee to the District Officer.', legalRef: 'POSH Act, 2013 — Sec 21' },
  { id: 'CMP-2026-007', name: 'Fire NOC — Head Office',             category: 'License',    type: 'Fire NOC',           applicableTo: 'Head Office',        department: 'Admin',        location: 'Head Office',            dueDate: '2026-07-25', renewalDate: '2027-07-25', status: 'Pending',     priority: 'Critical', owner: 'Suresh B',     documents: 7,  lastUpdated: '2026-07-03', description: 'Fire safety No-Objection Certificate renewal for the head office premises.', legalRef: 'Fire Services Act — State Rules' },
  { id: 'CMP-2026-008', name: 'Pollution Control Certificate',      category: 'License',    type: 'Pollution Certificate', applicableTo: 'Batching Plant',  department: 'Plant & Machinery', location: 'Yelahanka Site',    dueDate: '2026-06-30', renewalDate: '2026-06-30', status: 'Expired',     priority: 'High',     owner: 'Rakesh M',     documents: 4,  lastUpdated: '2026-06-30', description: 'Consent-to-operate for the concrete batching plant (air & water).', legalRef: 'Air Act 1981 / Water Act 1974' },
  { id: 'CMP-2026-009', name: 'Minimum Wages Notification Update',  category: 'Statutory',  type: 'Minimum Wages',      applicableTo: 'Site Workers',       department: 'HR',           location: 'LANCO Hills — LH 10',    dueDate: '2026-08-05', renewalDate: '2027-02-05', status: 'Compliant',   priority: 'Medium',   owner: 'Vignesh M',    documents: 2,  lastUpdated: '2026-07-02', description: 'Revise wage registers per the latest state minimum-wage notification.', legalRef: 'Minimum Wages Act, 1948' },
  { id: 'CMP-2026-010', name: 'Group Medical Insurance Renewal',    category: 'Insurance',  type: 'Insurance',          applicableTo: 'All Employees',      department: 'HR',           location: 'Head Office',            dueDate: '2026-07-18', renewalDate: '2027-07-18', status: 'In Progress', priority: 'High',     owner: 'Kavya S',      documents: 3,  lastUpdated: '2026-07-08', description: 'GMC policy renewal for 128 employees + dependents.', legalRef: 'Company Policy — HR/INS/02' },
  { id: 'CMP-2026-011', name: 'Annual Safety Audit — LH 10',        category: 'Audit',      type: 'Safety Audit',       applicableTo: 'Construction Staff', department: 'Safety (HSE)', location: 'LANCO Hills — LH 10',    dueDate: '2026-07-14', renewalDate: '2027-07-14', status: 'Pending',     priority: 'Critical', owner: 'Manoj Das',    documents: 9,  lastUpdated: '2026-07-06', description: 'Third-party safety audit covering scaffolding, cranes, electrical and PPE.', legalRef: 'BOCW Rules — Rule 208' },
  { id: 'CMP-2026-012', name: 'Shops & Establishment Renewal',      category: 'License',    type: 'Shops & Establishment', applicableTo: 'Head Office',     department: 'Admin',        location: 'Head Office',            dueDate: '2026-09-12', renewalDate: '2027-09-12', status: 'Compliant',   priority: 'Low',      owner: 'Suresh B',     documents: 2,  lastUpdated: '2026-04-19', description: 'Registration renewal under the Shops & Establishments Act.', legalRef: 'TS S&E Act, 1988' },
  { id: 'CMP-2026-013', name: 'TDS Quarterly Return (24Q)',         category: 'Statutory',  type: 'TDS',                applicableTo: 'All Employees',      department: 'Finance',      location: 'Head Office',            dueDate: '2026-07-31', renewalDate: '2026-10-31', status: 'In Progress', priority: 'High',     owner: 'Kavya S',      documents: 1,  lastUpdated: '2026-07-11', description: 'Quarterly TDS return on salaries for Q1 FY 2026-27.', legalRef: 'Income Tax Act — Sec 192' },
  { id: 'CMP-2026-014', name: 'Contractor Vendor Compliance Check', category: 'Vendor',     type: 'Vendor Compliance',  applicableTo: 'Subcontractors',     department: 'Projects',     location: 'Yelahanka Site',         dueDate: '2026-07-05', renewalDate: '2026-10-05', status: 'Overdue',     priority: 'High',     owner: 'Arun Kumar',   documents: 5,  lastUpdated: '2026-06-25', description: 'Quarterly verification of subcontractor PF/ESI challans and licenses.', legalRef: 'CLRA Act — Principal Employer duty' },
  { id: 'CMP-2026-015', name: 'Workmen Medical Checkup Camp',       category: 'Welfare',    type: 'Medical Checkup',    applicableTo: 'Site Workers',       department: 'Safety (HSE)', location: 'LANCO Hills — LH 10',    dueDate: '2026-08-20', renewalDate: '2027-02-20', status: 'Compliant',   priority: 'Medium',   owner: 'Manoj Das',    documents: 6,  lastUpdated: '2026-06-10', description: 'Half-yearly health screening for all site workmen.', legalRef: 'BOCW Rules — Rule 223' },
];

export const RECENT_ACTIVITIES = [
  { id: 1, text: 'Nandhini R uploaded ECR challan for PF Monthly Return',  time: '2 hours ago',  type: 'upload'  },
  { id: 2, text: 'Labour License Renewal marked Overdue — escalated to HR Head', time: '6 hours ago', type: 'alert' },
  { id: 3, text: 'Kavya S renewed Group Medical Insurance quote received', time: 'Yesterday',    type: 'renew'   },
  { id: 4, text: 'Safety Audit scheduled with M/s SafeCheck for 14 Jul',   time: 'Yesterday',    type: 'schedule'},
  { id: 5, text: 'Pollution Certificate expired — renewal application drafted', time: '2 days ago', type: 'alert' },
];

export const TREND_DATA = [
  { month: 'Feb', compliant: 78, overdue: 9 },
  { month: 'Mar', compliant: 82, overdue: 7 },
  { month: 'Apr', compliant: 85, overdue: 8 },
  { month: 'May', compliant: 88, overdue: 5 },
  { month: 'Jun', compliant: 90, overdue: 6 },
  { month: 'Jul', compliant: 92, overdue: 6 },
];

export const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

export const daysUntil = (d) => Math.ceil((new Date(d) - new Date()) / 86400000);
