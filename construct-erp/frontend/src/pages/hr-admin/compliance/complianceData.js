// src/pages/hr-admin/compliance/complianceData.js
// Shared constants for the HR Compliance Tracker module. DUMMY_COMPLIANCES,
// STATUTORY_ITEMS, RECENT_ACTIVITIES, TREND_DATA and AI_INSIGHTS used to live
// here as hand-written fake data — removed. The page now fetches real data
// via hrComplianceAPI.tracker* (see CompliancePage.jsx). DEPARTMENTS/LOCATIONS
// are likewise no longer static — fetched from hrMastersAPI.listDepts() and
// hrComplianceAPI.trackerLocations() and passed down as props.
//
// What's left here is genuine taxonomy (closed enumerations, not business
// data) plus presentational style maps and small date helpers.

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
  'Medical Checkup', 'Training', 'Background Verification', 'Document Expiry',
];

export const STATUSES   = ['Compliant', 'Pending', 'Overdue', 'In Progress', 'Expired'];
export const PRIORITIES = ['Critical', 'High', 'Medium', 'Low'];

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

export const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

export const daysUntil = (d) => d ? Math.ceil((new Date(d) - new Date()) / 86400000) : null;

// Relative-time formatter for the real activity feed (server sends raw
// timestamps now, not pre-formatted strings like "2 hours ago").
export const relTime = (d) => {
  if (!d) return '—';
  const diffMs = Date.now() - new Date(d).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;
  return fmtDate(d);
};
