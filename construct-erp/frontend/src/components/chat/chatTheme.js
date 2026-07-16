// src/components/chat/chatTheme.js — shared design tokens for the ERPChat page
// split (ERPChat.jsx used to define these locally; extracted so every split
// component can import the same values without duplication).

export const C = {
  primary:      '#2563EB',
  primaryHover: '#1D4ED8',
  primaryLight: '#EFF6FF',
  primaryBorder:'#BFDBFE',
  bg:           '#F8FAFC',
  card:         '#FFFFFF',
  border:       '#E2E8F0',
  borderLight:  '#F1F5F9',
  text:         '#0F172A',
  muted:        '#64748B',
  subtle:       '#94A3B8',
  green:        '#22C55E',
  greenBg:      '#F0FDF4',
  amber:        '#F59E0B',
  red:          '#EF4444',
  shadow:       '0 1px 3px rgba(0,0,0,0.08)',
  shadowMd:     '0 4px 12px rgba(0,0,0,0.08)',
  shadowLg:     '0 12px 24px rgba(0,0,0,0.1)',
};

// Channel theme colors for avatars
export const CH_COLORS = {
  general:     '#2563EB', site:       '#059669', finance:    '#7C3AED',
  procurement: '#DC2626', hr:         '#0891B2', safety:     '#D97706',
  qa:          '#16A34A', management: '#4F46E5', engineering:'#0284C7',
  client:      '#BE185D',
};

export function chColor(id) { return CH_COLORS[id] || C.primary; }

// Relative timestamp used by the conversation list + call log rows (was
// duplicated as fmtTime/fmtCallTime in the original single-file component —
// same logic, unified here). Named fmtRelTime (not fmtTime) so it doesn't
// collide with chatShared.jsx's differently-formatted fmtTime export.
export function fmtRelTime(ts) {
  if (!ts) return '';
  const d   = new Date(ts);
  const now = new Date();
  const diff = Math.floor((now - d) / 86400000);
  if (diff === 0) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (diff === 1) return 'Yesterday';
  if (diff < 7)  return d.toLocaleDateString([], { weekday: 'short' });
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export function fmtFull(ts) {
  if (!ts) return '';
  return new Date(ts).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export const CONV_TABS = [
  { id: 'all',      label: 'All' },
  { id: 'channels', label: 'Channels' },
  { id: 'direct',   label: 'Direct' },
  { id: 'unread',   label: 'Unread' },
];

// Width of sidebar per view
export const SIDEBAR_W = { chat: 320, calls: 380, meetings: 360 };

export const REACTIONS_LIST = ['👍','❤️','🔥','👏','🎉','😂'];
