// src/pages/plant/_shared.jsx — Shared UI primitives for the Plant & Machinery module
import React from 'react';
import { clsx } from 'clsx';
import dayjs from 'dayjs';
import { X, RefreshCw, Search, Plus, Download } from 'lucide-react';
import { exportToCSV } from '../../utils/exportUtils';
import toast from 'react-hot-toast';

/* ── Formatting ─────────────────────────────────────────────── */
export const inr = (v) =>
  v == null || v === '' || isNaN(Number(v))
    ? '—'
    : `₹${Number(v).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

export const ddmmyyyy = (v) => (v ? dayjs(v).format('DD/MM/YYYY') : '—');

/* ── Tailwind input class ───────────────────────────────────── */
export const inputCls =
  'w-full rounded border border-gray-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-teal-400 focus:ring-1 focus:ring-teal-100 transition';

/* ── Status badge ───────────────────────────────────────────── */
export const STATUS_BADGE = {
  active:      'bg-green-50 text-green-700 border border-green-200',
  idle:        'bg-amber-50 text-amber-700 border border-amber-200',
  maintenance: 'bg-blue-50 text-blue-700 border border-blue-200',
  disposed:    'bg-red-50 text-red-700 border border-red-200',
  // hire / wo / schedule states
  requested:   'bg-slate-50 text-slate-600 border border-slate-200',
  ordered:     'bg-indigo-50 text-indigo-700 border border-indigo-200',
  deployed:    'bg-teal-50 text-teal-700 border border-teal-200',
  returned:    'bg-amber-50 text-amber-700 border border-amber-200',
  invoiced:    'bg-green-50 text-green-700 border border-green-200',
  open:        'bg-amber-50 text-amber-700 border border-amber-200',
  in_progress: 'bg-blue-50 text-blue-700 border border-blue-200',
  completed:   'bg-green-50 text-green-700 border border-green-200',
  scheduled:   'bg-slate-50 text-slate-600 border border-slate-200',
  due:         'bg-amber-50 text-amber-700 border border-amber-200',
};

export function StatusBadge({ status }) {
  return (
    <span className={clsx('rounded-full px-2.5 py-0.5 text-[11px] font-semibold capitalize',
      STATUS_BADGE[status] || 'bg-gray-100 text-slate-600 border border-gray-200')}>
      {String(status || '—').replace(/_/g, ' ')}
    </span>
  );
}

/* expiry colour: expired=red, ≤30d=amber, else green */
export function ExpiryBadge({ date }) {
  if (!date) return <span className="text-slate-400">—</span>;
  const days = dayjs(date).diff(dayjs(), 'day');
  const cls = days < 0 ? 'bg-red-50 text-red-700 border-red-200'
    : days <= 30 ? 'bg-amber-50 text-amber-700 border-amber-200'
    : 'bg-green-50 text-green-700 border-green-200';
  return (
    <span className={clsx('rounded-full border px-2.5 py-0.5 text-[11px] font-semibold', cls)}>
      {ddmmyyyy(date)} {days < 0 ? `(expired)` : `(${days}d)`}
    </span>
  );
}

/* ── Page shell with breadcrumb + toolbar ───────────────────── */
export function PageShell({ title, onRefresh, onAdd, addLabel, exportData, exportName, children, extra }) {
  return (
    <div className="flex h-full min-h-screen flex-col bg-gray-50">
      <header className="flex items-center justify-between border-b border-gray-200 bg-white px-6 py-3">
        <div className="flex items-center gap-1 text-sm text-gray-500">
          <span>Plant &amp; Machinery</span>
          <span className="text-gray-300">/</span>
          <span className="font-semibold text-gray-800">{title}</span>
        </div>
        <div className="flex items-center gap-2">
          {extra}
          {onRefresh && (
            <button onClick={onRefresh} className="flex items-center gap-1.5 rounded border border-gray-200 bg-white px-3 py-1.5 text-xs text-slate-600 hover:bg-gray-50">
              <RefreshCw className="h-3.5 w-3.5" /> Refresh
            </button>
          )}
          {exportData && (
            <button
              onClick={() => {
                if (!exportData.length) return toast.error('Nothing to export');
                exportToCSV(exportData, exportName || 'plant_export');
                toast.success('Exported');
              }}
              className="flex items-center gap-1.5 rounded border border-gray-200 bg-white px-3 py-1.5 text-xs text-slate-600 hover:bg-gray-50">
              <Download className="h-3.5 w-3.5 text-teal-500" /> Export
            </button>
          )}
          {onAdd && (
            <button onClick={onAdd} className="flex items-center gap-1.5 rounded bg-teal-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-teal-700">
              <Plus className="h-3.5 w-3.5" /> {addLabel || 'Add'}
            </button>
          )}
        </div>
      </header>
      <div className="flex-1 space-y-4 p-5">{children}</div>
    </div>
  );
}

/* ── Search input ───────────────────────────────────────────── */
export function SearchBar({ value, onChange, placeholder }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-4 py-2.5 shadow-sm">
      <Search className="h-4 w-4 shrink-0 text-gray-400" />
      <input
        className="flex-1 bg-transparent text-sm text-slate-800 outline-none placeholder:text-gray-400"
        placeholder={placeholder || 'Search…'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

/* ── Modal shell ────────────────────────────────────────────── */
export function Modal({ title, onClose, children, maxW = 'max-w-2xl', footer }) {
  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-black/40 p-4 backdrop-blur-sm">
      <div className={clsx('my-8 w-full overflow-hidden rounded-xl border border-gray-200 bg-white shadow-2xl', maxW)}>
        <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50 px-6 py-4">
          <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
          <button onClick={onClose} className="rounded p-1 text-gray-400 hover:bg-gray-100"><X className="h-5 w-5" /></button>
        </div>
        <div className="p-6">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-gray-100 bg-gray-50 px-6 py-3">{footer}</div>}
      </div>
    </div>
  );
}

/* ── Table shell ────────────────────────────────────────────── */
export function Table({ columns, rows, isLoading, empty = 'No records found', onRowClick }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
      <table className="w-full text-left">
        <thead>
          <tr className="border-b border-gray-100 bg-gray-50">
            {columns.map((c) => (
              <th key={c.key} className="whitespace-nowrap px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-gray-500">{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {isLoading && (
            <tr><td colSpan={columns.length} className="py-12 text-center"><RefreshCw className="mx-auto h-5 w-5 animate-spin text-gray-300" /></td></tr>
          )}
          {!isLoading && rows.length === 0 && (
            <tr><td colSpan={columns.length} className="py-12 text-center text-sm text-gray-400">{empty}</td></tr>
          )}
          {!isLoading && rows.map((row, ri) => (
            <tr key={row.id || ri}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={clsx('transition-colors', onRowClick && 'cursor-pointer hover:bg-teal-50/30')}>
              {columns.map((c) => (
                <td key={c.key} className="px-4 py-3 text-sm text-gray-700">
                  {c.render ? c.render(row) : (row[c.key] ?? '—')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ── KPI cards row ──────────────────────────────────────────── */
export function KpiRow({ cards }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {cards.map((k) => (
        <div key={k.label} className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-400">{k.label}</span>
            {k.icon && <span className={clsx('rounded p-1', k.bg || 'bg-teal-50')}><k.icon className={clsx('h-4 w-4', k.color || 'text-teal-600')} /></span>}
          </div>
          <div className="mt-2 text-xl font-bold text-gray-800">{k.value}</div>
        </div>
      ))}
    </div>
  );
}
