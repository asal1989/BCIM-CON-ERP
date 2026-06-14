// Shared KPI card used by all role dashboards
import React from 'react';
import { Link } from 'react-router-dom';

const COLOR_MAP = {
  indigo:  { bg: 'bg-indigo-50',  icon: 'bg-indigo-100 text-indigo-600',   val: 'text-indigo-700' },
  emerald: { bg: 'bg-emerald-50', icon: 'bg-emerald-100 text-emerald-600',  val: 'text-emerald-700' },
  amber:   { bg: 'bg-amber-50',   icon: 'bg-amber-100 text-amber-600',      val: 'text-amber-700' },
  red:     { bg: 'bg-red-50',     icon: 'bg-red-100 text-red-600',          val: 'text-red-700' },
  blue:    { bg: 'bg-blue-50',    icon: 'bg-blue-100 text-blue-600',        val: 'text-blue-700' },
  purple:  { bg: 'bg-purple-50',  icon: 'bg-purple-100 text-purple-600',    val: 'text-purple-700' },
  violet:  { bg: 'bg-violet-50',  icon: 'bg-violet-100 text-violet-600',    val: 'text-violet-700' },
  orange:  { bg: 'bg-orange-50',  icon: 'bg-orange-100 text-orange-600',    val: 'text-orange-700' },
  cyan:    { bg: 'bg-cyan-50',    icon: 'bg-cyan-100 text-cyan-600',        val: 'text-cyan-700' },
  slate:   { bg: 'bg-slate-50',   icon: 'bg-slate-100 text-slate-600',      val: 'text-slate-700' },
};

export function DashKPI({ label, value, sub, icon: Icon, color = 'indigo', loading }) {
  const c = COLOR_MAP[color] || COLOR_MAP.indigo;
  return (
    <div className={`rounded-xl border border-slate-100 p-4 flex items-start gap-4 bg-white shadow-sm`}>
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${c.icon}`}>
        {loading ? <div className="w-4 h-4 rounded-full border-2 border-current border-t-transparent animate-spin" /> : Icon && <Icon className="w-5 h-5" />}
      </div>
      <div className="min-w-0">
        {loading
          ? <div className="h-7 w-24 bg-slate-100 rounded animate-pulse mb-1" />
          : <p className={`text-2xl font-medium leading-tight ${c.val}`}>{value ?? '—'}</p>
        }
        <p className="text-xs font-medium text-slate-900 font-medium mt-0.5">{label}</p>
        {sub && <p className="text-[11px] text-slate-900 font-medium mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

// Flat 2026-style KPI card (white card, soft icon badge, no shadows)
const FLAT_COLOR_MAP = {
  indigo:  { bg: 'bg-indigo-50',  text: 'text-indigo-600'  },
  emerald: { bg: 'bg-emerald-50', text: 'text-emerald-600' },
  amber:   { bg: 'bg-amber-50',   text: 'text-amber-600'   },
  red:     { bg: 'bg-red-50',     text: 'text-red-600'     },
  blue:    { bg: 'bg-blue-50',    text: 'text-blue-600'    },
  purple:  { bg: 'bg-purple-50',  text: 'text-purple-600'  },
  violet:  { bg: 'bg-violet-50',  text: 'text-violet-600'  },
  orange:  { bg: 'bg-orange-50',  text: 'text-orange-600'  },
  cyan:    { bg: 'bg-cyan-50',    text: 'text-cyan-600'    },
  green:   { bg: 'bg-green-50',   text: 'text-green-600'   },
  slate:   { bg: 'bg-slate-100',  text: 'text-slate-500'   },
};

export function FlatKPI({ label, value, sub, icon: Icon, color = 'blue', loading, to, active, onClick }) {
  const c = FLAT_COLOR_MAP[color] || FLAT_COLOR_MAP.blue;
  const Wrapper = to ? Link : 'div';
  const wrapperProps = to ? { to } : (onClick ? { onClick, role: 'button' } : {});
  return (
    <Wrapper {...wrapperProps}
      className={`bg-white border rounded-md p-4 text-left transition-colors block ${active ? 'border-blue-400 ring-1 ring-blue-100' : 'border-slate-200 hover:border-slate-300'} ${(to || onClick) ? 'cursor-pointer' : ''}`}>
      <div className={`w-8 h-8 rounded-md flex items-center justify-center mb-3 ${c.bg}`}>
        {loading
          ? <div className="w-4 h-4 rounded-full border-2 border-current border-t-transparent animate-spin text-slate-300" />
          : Icon && <Icon className={`w-4 h-4 ${c.text}`} />}
      </div>
      {loading
        ? <div className="h-7 w-16 bg-slate-100 rounded animate-pulse mb-1" />
        : <div className="text-2xl font-semibold text-slate-800 leading-tight">{value ?? '—'}</div>
      }
      <div className="text-xs text-slate-400 mt-0.5">{label}</div>
      {sub && <div className="text-[11px] text-slate-400 mt-1">{sub}</div>}
    </Wrapper>
  );
}

export function DashSection({ title, children, action }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 border-b-2 border-slate-100">
        <p className="text-sm font-medium text-slate-900 tracking-tight">{title}</p>
        {action}
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

export function DashTable({ cols, rows, empty = 'No records found' }) {
  if (!rows?.length) {
    return <p className="text-center text-sm text-slate-900 font-medium py-6">{empty}</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b-2 border-slate-200 bg-slate-50">
            {cols.map(c => (
              <th key={c.key} className={`px-2 py-2 text-[11px] font-medium uppercase tracking-[0.10em] text-slate-900 ${c.right ? 'text-right' : 'text-left'}`}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((row, i) => (
            <tr key={i} className="hover:bg-slate-50 transition-colors">
              {cols.map(c => (
                <td key={c.key} className={`px-2 py-2.5 text-[13px] font-medium text-slate-900 tracking-tight ${c.right ? 'text-right' : ''} ${c.cls || ''}`}>
                  {c.render ? c.render(row) : (row[c.key] ?? <span className="text-slate-400 font-normal">—</span>)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export const inr = (v) => {
  const n = parseFloat(v || 0);
  return `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

export const Badge = ({ label, cls }) => (
  <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-medium uppercase tracking-wide ${cls}`}>{label}</span>
);
