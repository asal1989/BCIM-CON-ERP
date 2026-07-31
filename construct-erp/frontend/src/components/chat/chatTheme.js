// src/components/chat/chatTheme.js — shared design tokens for the ERPChat page
// split (ERPChat.jsx used to define these locally; extracted so every split
// component can import the same values without duplication).
//
// Aligned to the app's own "Premium Navy" theme (see src/theme/index.jsx) —
// navy + gold instead of a generic Tailwind blue — so Team Chat reads as part
// of the same product as the rest of the ERP, not a bolted-on widget.

export const C = {
  primary:      '#1a3a6b',   // Theme.navy
  primaryHover: '#122d58',   // Theme.navyDark
  primaryLight: '#EAF0FA',
  primaryBorder:'#C8D5E8',
  gold:         '#c9a227',   // Theme.gold — reserved for premium accents (own-message bubble, active states), not overused
  bg:           '#F4F6FB',
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
  shadowLg:     '0 12px 24px rgba(15,23,42,0.14)',
};

// Channel theme colors for avatars, header accent, and sidebar left-border.
// Previously only 10 of these existed and none matched the 12 real channel
// ids in ChatContext.jsx's CHANNELS list — every channel except 'general'
// silently fell through to the generic primary color. Now every real channel
// has its own color.
export const CH_COLORS = {
  general:        '#1a3a6b', // navy — company-wide
  finance:        '#7C3AED',
  procurement:    '#DC2626',
  stores:         '#0891B2',
  'qs-billing':   '#059669',
  tqs:            '#0D9488',
  hr:             '#DB2777',
  planning:       '#4F46E5',
  quality:        '#16A34A',
  subcontractors: '#EA580C',
  tender:         '#9333EA',
  'it-support':   '#0284C7',
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
