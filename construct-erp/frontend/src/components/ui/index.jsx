/**
 * BCIM ERP — Shared UI Component Library
 * All module pages import from here for consistent design.
 */
import React from 'react';
import { clsx } from 'clsx';
import { RefreshCw, AlertTriangle, ChevronRight, Inbox, Plus } from 'lucide-react';

// ═══════════════════════════════════════════════════════════
// PAGE HEADER
// ═══════════════════════════════════════════════════════════
export function PageHeader({ title, subtitle, children, breadcrumb }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
      <div>
        {breadcrumb && (
          <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-1.5">
            {breadcrumb.map((b, i) => (
              <React.Fragment key={i}>
                {i > 0 && <ChevronRight className="w-3 h-3" />}
                <span className={i === breadcrumb.length - 1 ? 'text-slate-600 font-medium' : ''}>{b}</span>
              </React.Fragment>
            ))}
          </div>
        )}
        <h1 className="page-title">{title}</h1>
        {subtitle && <p className="page-subtitle">{subtitle}</p>}
      </div>
      {children && <div className="flex items-center gap-2 flex-wrap">{children}</div>}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// METRIC / KPI CARDS
// ═══════════════════════════════════════════════════════════
const GRADIENT_PRESETS = {
  blue:    ['#1D4ED8', '#3B82F6'],
  indigo:  ['#4338CA', '#6366F1'],
  emerald: ['#059669', '#10B981'],
  amber:   ['#B45309', '#F59E0B'],
  red:     ['#B91C1C', '#EF4444'],
  orange:  ['#C2410C', '#F97316'],
  purple:  ['#6D28D9', '#8B5CF6'],
  teal:    ['#0F766E', '#14B8A6'],
  slate:   ['#334155', '#64748B'],
};

export function MetricCard({
  label, value, sub, icon: Icon, color = 'blue',
  trend, trendLabel, onClick, compact = false
}) {
  const [from, to] = GRADIENT_PRESETS[color] || GRADIENT_PRESETS.blue;
  return (
    <div
      className={clsx('rounded-xl p-5 text-white relative overflow-hidden cursor-default transition-transform hover:-translate-y-0.5', onClick && 'cursor-pointer')}
      style={{ background: `linear-gradient(135deg, ${from} 0%, ${to} 100%)` }}
      onClick={onClick}
    >
      {/* Background pattern */}
      <div className="absolute inset-0 opacity-10" style={{
        backgroundImage: `radial-gradient(circle at 80% 20%, rgba(255,255,255,0.3) 0%, transparent 50%)`
      }} />
      <div className="relative">
        <div className="flex items-start justify-between mb-3">
          <p className="text-xs font-medium uppercase tracking-wider text-white/70">{label}</p>
          {Icon && (
            <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-white/15">
              <Icon className="w-5 h-5 text-white" />
            </div>
          )}
        </div>
        <div className={clsx('font-bold text-white leading-none', compact ? 'text-2xl' : 'text-3xl')}>{value}</div>
        {(sub || trend !== undefined) && (
          <div className="flex items-center gap-2 mt-2">
            {sub && <span className="text-xs text-white/60">{sub}</span>}
            {trend !== undefined && (
              <span className={clsx('text-xs font-medium px-1.5 py-0.5 rounded',
                trend > 0 ? 'bg-emerald-500/25 text-emerald-200' :
                trend < 0 ? 'bg-red-500/25 text-red-200' : 'bg-white/15 text-white/60')}>
                {trend > 0 ? '↑' : trend < 0 ? '↓' : '→'} {trendLabel}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// Lighter version — white card with colored accent
export function StatCard({ label, value, sub, icon: Icon, color = 'blue', onClick }) {
  const colorMap = {
    blue:    { border:'border-l-blue-500',   text:'text-blue-700',   bg:'bg-blue-50',   icon:'text-blue-500' },
    indigo:  { border:'border-l-indigo-500', text:'text-indigo-700', bg:'bg-indigo-50', icon:'text-indigo-500' },
    emerald: { border:'border-l-emerald-500',text:'text-emerald-700',bg:'bg-emerald-50',icon:'text-emerald-500' },
    amber:   { border:'border-l-amber-500',  text:'text-amber-700',  bg:'bg-amber-50',  icon:'text-amber-500' },
    red:     { border:'border-l-red-500',    text:'text-red-700',    bg:'bg-red-50',    icon:'text-red-500' },
    orange:  { border:'border-l-orange-500', text:'text-orange-700', bg:'bg-orange-50', icon:'text-orange-500' },
    purple:  { border:'border-l-purple-500', text:'text-purple-700', bg:'bg-purple-50', icon:'text-purple-500' },
    slate:   { border:'border-l-slate-400',  text:'text-slate-700',  bg:'bg-slate-50',  icon:'text-slate-500' },
  };
  const c = colorMap[color] || colorMap.blue;
  return (
    <div
      className={clsx('card border-l-4 flex items-center gap-4', c.border, onClick && 'cursor-pointer hover:shadow-md transition-shadow')}
      onClick={onClick}
    >
      {Icon && (
        <div className={clsx('w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0', c.bg)}>
          <Icon className={clsx('w-5 h-5', c.icon)} />
        </div>
      )}
      <div className="min-w-0">
        <div className={clsx('text-2xl font-bold leading-none', c.text)}>{value}</div>
        <div className="text-xs text-slate-500 font-medium mt-0.5 truncate">{label}</div>
        {sub && <div className="text-[11px] text-slate-400 mt-0.5">{sub}</div>}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// SECTION CARD
// ═══════════════════════════════════════════════════════════
export function SectionCard({ title, subtitle, icon: Icon, children, action, className = '' }) {
  return (
    <div className={clsx('card overflow-hidden', className)}>
      {(title || action) && (
        <div className="flex items-center justify-between px-1 mb-4">
          <div className="flex items-center gap-2.5">
            {Icon && <div className="w-7 h-7 rounded-lg bg-indigo-50 flex items-center justify-center"><Icon className="w-4 h-4 text-indigo-600" /></div>}
            <div>
              {title && <h3 className="font-semibold text-black text-sm leading-none">{title}</h3>}
              {subtitle && <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>}
            </div>
          </div>
          {action}
        </div>
      )}
      {children}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// STATUS BADGE
// ═══════════════════════════════════════════════════════════
const STATUS_VARIANTS = {
  // Generic
  active:    'badge badge-green',
  inactive:  'badge badge-gray',
  pending:   'badge badge-yellow',
  approved:  'badge badge-green',
  rejected:  'badge badge-red',
  cancelled: 'badge badge-gray',
  draft:     'badge badge-gray',
  completed: 'badge badge-teal',
  // Asset statuses
  available:   'badge badge-green',
  assigned:    'badge badge-blue',
  maintenance: 'badge badge-yellow',
  breakdown:   'badge badge-red',
  disposed:    'badge badge-gray',
  // Work order
  open:        'badge badge-blue',
  in_progress: 'badge badge-yellow',
  closed:      'badge badge-teal',
  // Tender
  new:              'badge badge-blue',
  under_review:     'badge badge-yellow',
  bid_preparation:  'badge badge-purple',
  approval_pending: 'badge badge-orange',
  submitted:        'badge badge-indigo',
  won:              'badge badge-green',
  lost:             'badge badge-red',
};

export function StatusBadge({ status, label, className = '' }) {
  const key = (status || '').toLowerCase().replace(/\s+/g, '_');
  const cls = STATUS_VARIANTS[key] || 'badge badge-gray';
  return (
    <span className={clsx(cls, className)}>
      {label || status?.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
    </span>
  );
}

// ═══════════════════════════════════════════════════════════
// EMPTY STATE
// ═══════════════════════════════════════════════════════════
export function EmptyState({ icon: Icon = Inbox, title = 'No data', description, action, actionLabel = 'Add New', onAction }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
        <Icon className="w-8 h-8 text-slate-400" />
      </div>
      <h3 className="text-sm font-semibold text-slate-700 mb-1">{title}</h3>
      {description && <p className="text-xs text-slate-400 max-w-xs mb-4">{description}</p>}
      {onAction && (
        <button onClick={onAction} className="btn-primary text-xs px-4 py-2">
          <Plus className="w-3.5 h-3.5" /> {actionLabel}
        </button>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// LOADING / SKELETON
// ═══════════════════════════════════════════════════════════
export function Skeleton({ className = '' }) {
  return <div className={clsx('animate-pulse rounded-lg bg-slate-200', className)} />;
}

export function SkeletonCard() {
  return (
    <div className="card space-y-3">
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-8 w-16" />
      <Skeleton className="h-3 w-32" />
    </div>
  );
}

export function SkeletonRow({ cols = 5 }) {
  return (
    <tr>
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <Skeleton className="h-4" style={{ width: `${60 + Math.random() * 40}%` }} />
        </td>
      ))}
    </tr>
  );
}

export function SkeletonTable({ rows = 5, cols = 6 }) {
  return (
    <div className="table-wrapper">
      <table className="data-table">
        <thead>
          <tr>{Array.from({length:cols}).map((_,i)=><th key={i}><Skeleton className="h-3 w-20" /></th>)}</tr>
        </thead>
        <tbody>{Array.from({length:rows}).map((_,i)=><SkeletonRow key={i} cols={cols} />)}</tbody>
      </table>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// LOADING SPINNER
// ═══════════════════════════════════════════════════════════
export function LoadingSpinner({ size = 'md', text = 'Loading…' }) {
  const sz = size === 'sm' ? 'w-4 h-4' : size === 'lg' ? 'w-10 h-10' : 'w-6 h-6';
  return (
    <div className="flex flex-col items-center justify-center py-12 gap-3">
      <RefreshCw className={clsx(sz, 'animate-spin text-indigo-500')} />
      {text && <p className="text-xs text-slate-400">{text}</p>}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// MODAL WRAPPER
// ═══════════════════════════════════════════════════════════
export function Modal({ title, subtitle, onClose, children, footer, size = 'md' }) {
  const sizeClass = { sm: 'max-w-md', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl', full: 'max-w-6xl' }[size] || 'max-w-lg';
  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-start justify-center z-50 p-4 overflow-y-auto">
      <div className={clsx('bg-white w-full rounded-2xl shadow-2xl overflow-hidden my-8', sizeClass)}
        style={{ boxShadow: '0 25px 50px -12px rgba(0,0,0,0.35)' }}>
        <div className="flex items-center justify-between px-6 py-4 border-b bg-gradient-to-r from-slate-50 to-white sticky top-0">
          <div>
            <h2 className="font-semibold text-black">{title}</h2>
            {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>
        <div className="overflow-y-auto" style={{ maxHeight: 'calc(85vh - 130px)' }}>
          {children}
        </div>
        {footer && (
          <div className="flex justify-end gap-3 px-6 py-4 border-t bg-slate-50 sticky bottom-0">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

// Form field wrapper
export function FormField({ label, required, children, hint, className = '' }) {
  return (
    <div className={className}>
      {label && (
        <label className="label">
          {label}{required && <span className="text-red-500 ml-0.5">*</span>}
        </label>
      )}
      {children}
      {hint && <p className="text-[11px] text-slate-400 mt-1">{hint}</p>}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// FILTER BAR
// ═══════════════════════════════════════════════════════════
export function FilterBar({ children, className = '' }) {
  return (
    <div className={clsx('flex flex-col sm:flex-row items-start sm:items-center gap-3 mb-4', className)}>
      {children}
    </div>
  );
}

export function SearchInput({ value, onChange, placeholder = 'Search…', className = '' }) {
  return (
    <div className={clsx('relative', className)}>
      <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
      </svg>
      <input value={value} onChange={onChange} placeholder={placeholder} className="input pl-10" />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// TABS
// ═══════════════════════════════════════════════════════════
export function Tabs({ tabs, active, onChange, className = '' }) {
  return (
    <div className="w-full overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
    <div className={clsx('flex gap-0.5 bg-slate-100/80 p-1 rounded-xl w-fit min-w-max', className)}>
      {tabs.map(t => (
        <button key={t.key} onClick={() => onChange(t.key)}
          className={clsx('px-4 py-1.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap',
            active === t.key
              ? 'bg-white text-indigo-700 shadow-sm font-semibold'
              : 'text-slate-500 hover:text-black')}>
          {t.label}
          {t.count !== undefined && (
            <span className={clsx('ml-1.5 text-xs px-1.5 py-0.5 rounded-full',
              active === t.key ? 'bg-indigo-100 text-indigo-600' : 'bg-slate-200 text-slate-500')}>
              {t.count}
            </span>
          )}
        </button>
      ))}
    </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// PROGRESS BAR
// ═══════════════════════════════════════════════════════════
export function ProgressBar({ value, max = 100, color = 'blue', showLabel = false, height = 8 }) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  const colorMap = { blue:'bg-blue-500', green:'bg-emerald-500', amber:'bg-amber-500', red:'bg-red-500', indigo:'bg-indigo-500', purple:'bg-purple-500', orange:'bg-orange-500' };
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-slate-100 rounded-full overflow-hidden" style={{ height }}>
        <div className={clsx('h-full rounded-full transition-all duration-500', colorMap[color] || colorMap.blue)} style={{ width: `${pct}%` }} />
      </div>
      {showLabel && <span className="text-xs font-medium text-slate-600 w-10 text-right">{pct.toFixed(0)}%</span>}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// ALERT BANNER
// ═══════════════════════════════════════════════════════════
export function AlertBanner({ type = 'warning', title, message, onDismiss }) {
  const cfg = {
    warning: { bg:'bg-amber-50 border-amber-200', icon:'text-amber-600', text:'text-amber-800' },
    error:   { bg:'bg-red-50 border-red-200',     icon:'text-red-600',   text:'text-red-800' },
    info:    { bg:'bg-blue-50 border-blue-200',   icon:'text-blue-600',  text:'text-blue-800' },
    success: { bg:'bg-emerald-50 border-emerald-200', icon:'text-emerald-600', text:'text-emerald-800' },
  }[type] || {};
  return (
    <div className={clsx('flex items-start gap-3 p-4 rounded-xl border', cfg.bg)}>
      <AlertTriangle className={clsx('w-4 h-4 flex-shrink-0 mt-0.5', cfg.icon)} />
      <div className="flex-1 min-w-0">
        {title && <p className={clsx('text-sm font-semibold', cfg.text)}>{title}</p>}
        {message && <p className={clsx('text-xs mt-0.5', cfg.text)}>{message}</p>}
      </div>
      {onDismiss && <button onClick={onDismiss} className="text-slate-400 hover:text-slate-600 flex-shrink-0">×</button>}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// DATA TABLE WRAPPER
// ═══════════════════════════════════════════════════════════
export function DataTable({ columns, data, loading, emptyState, onRowClick, keyField = 'id' }) {
  if (loading) return <SkeletonTable rows={5} cols={columns.length} />;
  return (
    <div className="table-wrapper">
      <table className="data-table">
        <thead>
          <tr>{columns.map(c => <th key={c.key}>{c.label}</th>)}</tr>
        </thead>
        <tbody>
          {data.length === 0 ? (
            <tr><td colSpan={columns.length}>
              {emptyState || <EmptyState title="No records found" />}
            </td></tr>
          ) : data.map(row => (
            <tr key={row[keyField]} onClick={() => onRowClick?.(row)} className={onRowClick ? 'cursor-pointer' : ''}>
              {columns.map(c => (
                <td key={c.key} className={c.className}>
                  {c.render ? c.render(row[c.key], row) : row[c.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// CURRENCY / NUMBER FORMATTERS
// ═══════════════════════════════════════════════════════════
export const fmtINR = (v, decimals = 0) =>
  `₹${Number(v || 0).toLocaleString('en-IN', { maximumFractionDigits: decimals })}`;

export const fmtNum = (v) => Number(v || 0).toLocaleString('en-IN');

export const fmtDate = (d, fmt = 'DD MMM YYYY') => {
  if (!d) return '—';
  const date = new Date(d);
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  if (fmt === 'DD MMM YYYY') return `${String(date.getDate()).padStart(2,'0')} ${months[date.getMonth()]} ${date.getFullYear()}`;
  if (fmt === 'DD/MM/YY') return `${String(date.getDate()).padStart(2,'0')}/${String(date.getMonth()+1).padStart(2,'0')}/${String(date.getFullYear()).slice(-2)}`;
  return d;
};

export const daysFrom = (d) => {
  if (!d) return null;
  return Math.ceil((new Date(d) - new Date()) / (1000 * 60 * 60 * 24));
};

export const titleCase = (s) => String(s || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
