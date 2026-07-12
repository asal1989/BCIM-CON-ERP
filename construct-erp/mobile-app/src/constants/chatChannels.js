// src/constants/chatChannels.js — mirrors CHANNELS in the web app's
// ChatContext.jsx so channel IDs/labels stay in sync between web and mobile.
export const CHANNELS = [
  { id: 'general',        label: 'General',        desc: 'Company-wide announcements' },
  { id: 'finance',        label: 'Finance',         desc: 'Finance, TDS, payments' },
  { id: 'procurement',    label: 'Procurement',     desc: 'POs, vendors, quotations' },
  { id: 'stores',         label: 'Stores',          desc: 'GRN, MRS, inventory' },
  { id: 'qs-billing',     label: 'QS & Billing',    desc: 'BOQ, RA bills' },
  { id: 'tqs',            label: 'DQS Tracker',     desc: 'Bill approvals' },
  { id: 'hr',             label: 'HR Admin',        desc: 'Payroll, attendance, leave' },
  { id: 'planning',       label: 'Planning',        desc: 'DPR, schedules' },
  { id: 'quality',        label: 'Quality & HSE',   desc: 'QA/QC, safety' },
  { id: 'subcontractors', label: 'Subcontractors',  desc: 'Work orders, RA bills' },
  { id: 'tender',         label: 'Tender Mgmt',     desc: 'Bids & tenders' },
  { id: 'it-support',     label: 'IT Support',      desc: 'Help desk, assets' },
];

const CH_COLORS = {
  general:     '#2563EB', site:       '#059669', finance:    '#7C3AED',
  procurement: '#DC2626', hr:         '#0891B2', safety:     '#D97706',
  qa:          '#16A34A', management: '#4F46E5', engineering:'#0284C7',
  client:      '#BE185D', stores: '#059669', 'qs-billing': '#7C3AED',
  tqs: '#DC2626', planning: '#0284C7', quality: '#16A34A',
  subcontractors: '#D97706', tender: '#BE185D', 'it-support': '#4F46E5',
};

export function chColor(id) { return CH_COLORS[id] || '#2563EB'; }

export function dmChannelId(userIdA, userIdB) {
  return `dm-${[userIdA, userIdB].sort().join('-')}`;
}
