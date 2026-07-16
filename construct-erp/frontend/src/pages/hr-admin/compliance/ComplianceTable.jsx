// src/pages/hr-admin/compliance/ComplianceTable.jsx
// Premium data grid: 13 columns, sticky header, skeleton loaders, row kebab
// with full action set, pagination, animated empty state.
import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Eye, Pencil, Upload, RefreshCw, UserPlus, History, Trash2, MoreVertical,
  ChevronLeft, ChevronRight, FileText, ShieldOff, Plus,
} from 'lucide-react';
import { StatusBadge, PriorityBadge } from './ComplianceStatusBadge';
import { fmtDate, daysUntil } from './complianceData';

const AVATAR_COLORS = [
  ['#DBEAFE', '#1D4ED8'], ['#DCFCE7', '#15803D'], ['#FEF3C7', '#B45309'],
  ['#EDE9FE', '#6D28D9'], ['#FCE7F3', '#BE185D'], ['#CFFAFE', '#0E7490'],
];
const avatarColor = (name) => AVATAR_COLORS[[...String(name)].reduce((s, ch) => s + ch.charCodeAt(0), 0) % AVATAR_COLORS.length];

function OwnerCell({ name }) {
  const [bg, fg] = avatarColor(name);
  return (
    <div className="flex items-center gap-2">
      <span className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold flex-shrink-0"
        style={{ background: bg, color: fg }}>
        {name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()}
      </span>
      <span className="text-sm text-slate-700 whitespace-nowrap">{name}</span>
    </div>
  );
}

function RowMenu({ row, onAction }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);
  const items = [
    { key: 'edit',    label: 'Edit',            Icon: Pencil },
    { key: 'upload',  label: 'Upload Document', Icon: Upload },
    { key: 'renew',   label: 'Renew',           Icon: RefreshCw },
    { key: 'assign',  label: 'Assign Owner',    Icon: UserPlus },
    { key: 'history', label: 'History',         Icon: History },
    { key: 'delete',  label: 'Delete',          Icon: Trash2, danger: true },
  ];
  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen(o => !o)}
        className="w-8 h-8 rounded-lg border border-slate-200 flex items-center justify-center text-slate-500 hover:bg-slate-50 transition-colors">
        <MoreVertical className="w-4 h-4" />
      </button>
      {open && (
        <motion.div initial={{ opacity: 0, scale: 0.96, y: -4 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ duration: 0.12 }}
          className="absolute right-0 mt-1 w-48 bg-white rounded-xl border border-slate-100 shadow-xl z-30 py-1.5 overflow-hidden">
          {items.map(({ key, label, Icon, danger }) => (
            <button key={key} onClick={() => { setOpen(false); onAction(key, row); }}
              className={`w-full flex items-center gap-2.5 px-3.5 py-2 text-sm font-medium transition-colors ${danger ? 'text-red-600 hover:bg-red-50' : 'text-slate-700 hover:bg-blue-50'}`}>
              <Icon className={`w-3.5 h-3.5 ${danger ? 'text-red-400' : 'text-slate-400'}`} /> {label}
            </button>
          ))}
        </motion.div>
      )}
    </div>
  );
}

function SkeletonRows({ cols }) {
  return [...Array(6)].map((_, i) => (
    <tr key={i} className="border-b border-slate-50">
      {[...Array(cols)].map((_, c) => (
        <td key={c} className="px-4 py-4"><div className="h-3.5 rounded-full bg-slate-100 animate-pulse" style={{ width: `${45 + ((i + c) % 4) * 15}%` }} /></td>
      ))}
    </tr>
  ));
}

function EmptyState({ onCreate }) {
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="py-16 text-center">
      <div className="w-20 h-20 mx-auto rounded-3xl bg-slate-50 border border-slate-100 flex items-center justify-center mb-4">
        <ShieldOff className="w-9 h-9 text-slate-300" />
      </div>
      <p className="text-slate-600 font-semibold">No compliance records found.</p>
      <p className="text-sm text-slate-400 mt-1 mb-5">Adjust your filters, or create the first compliance item.</p>
      <button onClick={onCreate}
        className="inline-flex items-center gap-2 px-5 h-10 rounded-xl text-sm font-semibold text-white"
        style={{ background: '#2563EB', boxShadow: '0 4px 14px rgba(37,99,235,.30)' }}>
        <Plus className="w-4 h-4" /> Create Compliance
      </button>
    </motion.div>
  );
}

const HEADERS = ['Compliance ID', 'Compliance Name', 'Category', 'Applicable To', 'Department', 'Due Date', 'Renewal Date', 'Status', 'Priority', 'Owner', 'Documents', 'Last Updated', 'Action'];

export default function ComplianceTable({ rows, loading, onView, onAction, onCreate }) {
  const [page, setPage] = useState(1);
  const pageSize = 8;
  useEffect(() => { setPage(1); }, [rows]);
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const pageRows = rows.slice((page - 1) * pageSize, page * pageSize);

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay: 0.2 }}
      className="bg-white rounded-2xl border border-slate-200/70 overflow-hidden"
      style={{ boxShadow: '0 1px 3px rgba(15,23,42,.05), 0 6px 20px rgba(15,23,42,.04)' }}>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="bg-slate-50/80 border-b border-slate-100">
              {HEADERS.map(h => (
                <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && <SkeletonRows cols={HEADERS.length} />}
            {!loading && pageRows.map((row, i) => {
              const overdue = row.status === 'Overdue';
              const du = daysUntil(row.dueDate);
              return (
                <motion.tr key={row.id}
                  initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, delay: 0.03 * i }}
                  className="border-b border-slate-50 hover:bg-blue-50/40 transition-colors cursor-pointer"
                  onClick={() => onView(row)}>
                  <td className="px-4 py-3.5 font-semibold text-blue-600 whitespace-nowrap">{row.id}</td>
                  <td className="px-4 py-3.5 min-w-[220px]">
                    <div className="font-semibold text-slate-900">{row.name}</div>
                    <div className="text-xs text-slate-400 mt-0.5">{row.type}</div>
                  </td>
                  <td className="px-4 py-3.5 text-slate-600 whitespace-nowrap">{row.category}</td>
                  <td className="px-4 py-3.5 text-slate-600 whitespace-nowrap">{row.applicableTo}</td>
                  <td className="px-4 py-3.5 text-slate-600 whitespace-nowrap">{row.department}</td>
                  <td className="px-4 py-3.5 whitespace-nowrap">
                    <div className={`font-medium ${overdue ? 'text-red-600' : 'text-slate-700'}`}>{fmtDate(row.dueDate)}</div>
                    <div className={`text-xs mt-0.5 ${overdue ? 'text-red-400' : 'text-slate-400'}`}>
                      {du < 0 ? `${Math.abs(du)}d overdue` : du === 0 ? 'Due today' : `in ${du}d`}
                    </div>
                  </td>
                  <td className="px-4 py-3.5 text-slate-600 whitespace-nowrap">{fmtDate(row.renewalDate)}</td>
                  <td className="px-4 py-3.5"><StatusBadge status={row.status} /></td>
                  <td className="px-4 py-3.5"><PriorityBadge priority={row.priority} /></td>
                  <td className="px-4 py-3.5"><OwnerCell name={row.owner} /></td>
                  <td className="px-4 py-3.5">
                    <span className="inline-flex items-center gap-1.5 text-slate-600">
                      <FileText className="w-3.5 h-3.5 text-slate-400" /> {row.documents}
                    </span>
                  </td>
                  <td className="px-4 py-3.5 text-slate-500 whitespace-nowrap">{fmtDate(row.lastUpdated)}</td>
                  <td className="px-4 py-3.5" onClick={e => e.stopPropagation()}>
                    <div className="flex items-center gap-1.5">
                      <button onClick={() => onView(row)} title="View"
                        className="w-8 h-8 rounded-lg border border-slate-200 flex items-center justify-center text-blue-600 hover:bg-blue-50 transition-colors">
                        <Eye className="w-4 h-4" />
                      </button>
                      <RowMenu row={row} onAction={onAction} />
                    </div>
                  </td>
                </motion.tr>
              );
            })}
          </tbody>
        </table>
        {!loading && rows.length === 0 && <EmptyState onCreate={onCreate} />}
      </div>

      {!loading && rows.length > 0 && (
        <div className="px-5 py-3.5 border-t border-slate-100 flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
          <span className="text-xs font-medium text-slate-500">
            Showing {(page - 1) * pageSize + 1} to {Math.min(page * pageSize, rows.length)} of {rows.length} entries
          </span>
          <div className="flex items-center gap-1">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
              className="w-8 h-8 rounded-lg border border-slate-200 flex items-center justify-center text-slate-500 disabled:opacity-40 hover:bg-slate-50 transition-colors">
              <ChevronLeft className="w-4 h-4" />
            </button>
            {[...Array(totalPages)].map((_, i) => (
              <button key={i} onClick={() => setPage(i + 1)}
                className={`w-8 h-8 rounded-lg text-sm font-semibold transition-colors ${page === i + 1 ? 'text-white' : 'text-slate-600 border border-slate-200 hover:bg-slate-50'}`}
                style={page === i + 1 ? { background: '#2563EB' } : undefined}>
                {i + 1}
              </button>
            ))}
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
              className="w-8 h-8 rounded-lg border border-slate-200 flex items-center justify-center text-slate-500 disabled:opacity-40 hover:bg-slate-50 transition-colors">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </motion.div>
  );
}
