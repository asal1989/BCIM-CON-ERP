// src/theme/index.jsx
// Shared theme tokens + reusable components for the ConstructERP "Premium Navy" theme.
// Apply on any page: `import { Theme, PageHeader, KpiCard, RichField, SectionTitle, RichTable } from '../../theme';`

import React from 'react';
import { ChevronRight, ArrowLeft } from 'lucide-react';

/* ──────────────────────────────────────────────────────────────────────────
 * Theme palette
 * ──────────────────────────────────────────────────────────────────────── */
export const Theme = {
  // Navy family
  navyDark:    '#122d58',   // Deep navy (top header band)
  navy:        '#1a3a6b',   // Primary navy (table headers, section accents)
  navyLight:   '#2a4d80',

  // Accent
  accent:      '#e8431a',   // Orange-red (action accents)
  gold:        '#fde047',   // Gold (value text on dark surfaces)

  // Page surfaces
  pageBg:      '#eef2f9',   // Page background
  cardBg:      '#ffffff',   // Card surface
  cardAlt:     '#f4f7fc',   // Soft alternate

  // Borders
  border:      '#c8d5e8',   // Standard divider/border
  borderSoft:  '#e2e8f0',

  // Text
  textDark:    '#0f172a',
  textBody:    '#1e293b',
  textMuted:   '#64748b',
  textFaint:   '#94a3b8',

  // Status colors (for KPI cards and pills)
  blue:    { from: '#3b82f6', to: '#1d4ed8', shadow: '#1e40af' },
  amber:   { from: '#fbbf24', to: '#d97706', shadow: '#b45309' },
  emerald: { from: '#34d399', to: '#059669', shadow: '#047857' },
  red:     { from: '#f87171', to: '#dc2626', shadow: '#b91c1c' },
  orange:  { from: '#fb923c', to: '#e8431a', shadow: '#c2410c' },
  indigo:  { from: '#818cf8', to: '#4f46e5', shadow: '#3730a3' },
  purple:  { from: '#c084fc', to: '#9333ea', shadow: '#6b21a8' },
  teal:    { from: '#2dd4bf', to: '#0d9488', shadow: '#0f766e' },
  slate:   { from: '#64748b', to: '#334155', shadow: '#1e293b' },
};

const hexToRgba = (hex, a) => {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
};

/* ──────────────────────────────────────────────────────────────────────────
 * <PageHeader> — Navy sticky page header band
 * ──────────────────────────────────────────────────────────────────────── */
/**
 * Props:
 *  - title (string)        — main page title (e.g. "Payment Register")
 *  - subtitle (string)     — secondary line (e.g. "Outgoing payments to vendors")
 *  - breadcrumbs ([{label, href?}])  — breadcrumb segments; last item is highlighted
 *  - onBack (fn)           — optional back arrow callback
 *  - pills ([{label, value, color}]) — right-side amount/stat pills
 *  - actions (ReactNode)   — right-side action buttons
 */
export function PageHeader({ title, subtitle, breadcrumbs = [], onBack, pills = [], actions, sticky = true }) {
  return (
    <div
      className={`${sticky ? 'sticky top-0 z-20' : ''} shadow-md`}
      style={{ background: `linear-gradient(180deg, ${Theme.navy} 0%, ${Theme.navyDark} 100%)` }}
    >
      {/* Breadcrumb strip */}
      {breadcrumbs.length > 0 && (
        <div className="px-6 py-2 flex items-center gap-2 text-[13px]"
          style={{ background: 'rgba(0,0,0,0.18)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          {breadcrumbs.map((bc, i) => {
            const isLast = i === breadcrumbs.length - 1;
            return (
              <React.Fragment key={i}>
                {i > 0 && <ChevronRight className="w-3 h-3" style={{ color: 'rgba(255,255,255,0.4)' }} />}
                {bc.href && !isLast ? (
                  <a href={bc.href} className="hover:text-white transition-colors" style={{ color: 'rgba(255,255,255,0.7)' }}>
                    {bc.label}
                  </a>
                ) : (
                  <span className={isLast ? 'font-bold' : ''} style={{ color: isLast ? Theme.gold : 'rgba(255,255,255,0.7)' }}>
                    {bc.label}
                  </span>
                )}
              </React.Fragment>
            );
          })}
        </div>
      )}

      <div className="px-6 py-4 flex items-center gap-4">
        {onBack && (
          <button
            onClick={onBack}
            className="w-9 h-9 flex items-center justify-center rounded-lg transition-all"
            style={{ background: 'rgba(255,255,255,0.10)', border: '1px solid rgba(255,255,255,0.20)', color: '#fff' }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.18)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.10)'; }}
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
        )}

        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-medium tracking-tight text-white truncate">{title}</h1>
          {subtitle && (
            <p className="text-xs mt-1 truncate" style={{ color: 'rgba(255,255,255,0.65)' }}>
              {subtitle}
            </p>
          )}
        </div>

        {/* Glass pills */}
        {pills.length > 0 && (
          <div className="hidden md:flex items-center gap-2">
            {pills.map((p, i) => (
              <div key={i} className="px-3.5 py-2 rounded-lg"
                style={{
                  background: 'rgba(255,255,255,0.08)',
                  border: '1px solid rgba(255,255,255,0.15)',
                  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.10)',
                }}>
                <p className="text-[9px] font-bold uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.55)' }}>{p.label}</p>
                <p className="text-sm font-medium mt-0.5" style={{ color: p.color || Theme.gold }}>{p.value}</p>
              </div>
            ))}
          </div>
        )}

        {actions && <div className="flex items-center gap-2 flex-shrink-0">{actions}</div>}
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
 * <KpiCard> — Solid colored 3D KPI card with gold value text
 * ──────────────────────────────────────────────────────────────────────── */
/**
 * Props: { label, value, sub?, color='blue', icon?, onClick?, active? }
 * color = 'blue' | 'amber' | 'emerald' | 'red' | 'orange' | 'slate'
 */
export function KpiCard({ label, value, sub, color = 'blue', icon: Icon, onClick, active = false }) {
  const c = Theme[color] || Theme.blue;
  const glow = (a) => hexToRgba(c.shadow, a);

  // Single static shadow — no hover transition, no transform, no JS event handlers.
  // Avoids flicker from constant style writes on mouse move.
  const shadow = active
    ? `inset 0 0 0 2px rgba(255,255,255,0.55), 0 4px 12px ${glow(0.30)}`
    : `0 2px 4px rgba(15,23,42,0.08), 0 6px 14px ${glow(0.20)}`;

  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-xl p-4 text-left relative overflow-hidden"
      style={{
        cursor: onClick ? 'pointer' : 'default',
        background: `linear-gradient(160deg, ${c.from} 0%, ${c.to} 100%)`,
        boxShadow: shadow,
      }}
    >
      <div className="flex items-start justify-between gap-2 relative">
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-medium uppercase tracking-[0.14em] mb-1.5"
            style={{ color: '#bfdbfe', textShadow: '0 1px 0 rgba(0,0,0,0.20)' }}>
            {label}
          </div>
          <div className="text-2xl font-medium leading-tight tracking-tight"
            style={{ color: Theme.gold, textShadow: '0 1px 2px rgba(0,0,0,0.30), 0 2px 6px rgba(0,0,0,0.15)' }}>
            {value}
          </div>
          {sub && <div className="text-[11px] mt-1.5 font-semibold" style={{ color: '#e0f2fe' }}>{sub}</div>}
        </div>
        {Icon && (
          <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5"
            style={{
              background: 'linear-gradient(135deg, rgba(255,255,255,0.30) 0%, rgba(255,255,255,0.12) 100%)',
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.40), inset 0 -1px 0 rgba(0,0,0,0.10), 0 2px 4px rgba(0,0,0,0.12)',
              border: '1px solid rgba(255,255,255,0.25)',
            }}>
            <Icon style={{ width: 18, height: 18, color: '#fff', filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.25))' }} />
          </div>
        )}
      </div>
    </button>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
 * <RichField> — Bold label + rich dark value
 * ──────────────────────────────────────────────────────────────────────── */
export function RichField({ label, value, mono = false }) {
  const empty = value === null || value === undefined || value === '' || value === '—';
  return (
    <div>
      <p className="text-[11px] font-medium text-slate-500 uppercase tracking-[0.10em] mb-1.5">{label}</p>
      <p className={`text-[14px] font-medium tracking-tight ${mono ? 'font-mono' : ''} ${empty ? 'text-slate-300' : 'text-slate-900'}`}>
        {empty ? '—' : value}
      </p>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
 * <SectionTitle> — Premium uppercase section heading with accent bar
 * ──────────────────────────────────────────────────────────────────────── */
export function SectionTitle({ children, accent = Theme.navy }) {
  return (
    <p className="text-[11px] font-medium text-slate-600 uppercase tracking-[0.14em] mb-3 flex items-center gap-2">
      <span className="inline-block w-1 h-3.5 rounded-full" style={{ background: accent }} />
      {children}
    </p>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
 * <NavyCardHeader> — Navy gradient bar for card section headers
 * ──────────────────────────────────────────────────────────────────────── */
export function NavyCardHeader({ title, badge, right }) {
  return (
    <div className="px-5 py-3 flex items-center justify-between"
      style={{ background: `linear-gradient(90deg, ${Theme.navy} 0%, ${Theme.navyDark} 100%)`, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
      <div className="flex items-center gap-2">
        <div className="w-1 h-4 rounded-full" style={{ background: Theme.gold }} />
        <span className="text-xs font-medium text-white uppercase tracking-wider">{title}</span>
      </div>
      <div className="flex items-center gap-2">
        {badge && (
          <span className="text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wide"
            style={{ background: 'rgba(255,255,255,0.10)', color: '#bfdbfe', border: '1px solid rgba(255,255,255,0.18)' }}>
            {badge}
          </span>
        )}
        {right}
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
 * <RichTable> — Pre-styled table primitives with navy header
 * Usage:
 *   <RichTable>
 *     <thead><RichTable.Tr header>...</RichTable.Tr></thead>
 *     <tbody>{rows.map(r => <RichTable.Tr key={r.id}>...</RichTable.Tr>)}</tbody>
 *   </RichTable>
 * ──────────────────────────────────────────────────────────────────────── */
export function RichTable({ children, className = '' }) {
  return (
    <div className={`overflow-x-auto rounded-xl border-2 border-slate-200 shadow-sm bg-white ${className}`}>
      <table className="w-full text-sm">{children}</table>
    </div>
  );
}

RichTable.Th = function Th({ children, align = 'left', className = '' }) {
  return (
    <th className={`px-4 py-2.5 text-[11px] font-medium uppercase tracking-[0.10em] text-${align} text-white ${className}`}
      style={{ background: 'transparent' }}>
      {children}
    </th>
  );
};

RichTable.HeaderRow = function HeaderRow({ children }) {
  return (
    <tr style={{ background: `linear-gradient(90deg, ${Theme.navy} 0%, ${Theme.navyDark} 100%)` }}>
      {children}
    </tr>
  );
};

RichTable.Td = function Td({ children, mono = false, bold = true, align = 'left', color, className = '' }) {
  return (
    <td className={`px-4 py-3 text-${align} ${mono ? 'font-mono tracking-tight' : ''} ${bold ? 'font-medium' : 'font-semibold'} ${className}`}
      style={{ color: color || Theme.textDark }}>
      {children}
    </td>
  );
};

RichTable.Row = function Row({ children, onClick }) {
  return (
    <tr className={`border-b border-slate-100 hover:bg-slate-50 transition-colors ${onClick ? 'cursor-pointer' : ''}`}
      onClick={onClick}>
      {children}
    </tr>
  );
};

/* ──────────────────────────────────────────────────────────────────────────
 * Indian number formatter (full amount with paise)
 * ──────────────────────────────────────────────────────────────────────── */
export const inrFmt = (v) => {
  const n = Number(v || 0);
  return `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

export const inr = (v) => `₹${Number(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
