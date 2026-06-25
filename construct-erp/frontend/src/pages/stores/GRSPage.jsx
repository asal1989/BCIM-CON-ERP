// src/pages/stores/GRSPage.jsx — Goods Receipt by Security
import React, { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ShieldCheck, Plus, X, Search, Download, Printer,
  Clock, CheckCircle2, AlertTriangle, Package,
  ChevronRight, FileText, Truck, RefreshCw, ClipboardList,
  XCircle, Trash2, Pencil,
} from 'lucide-react';
import { clsx } from 'clsx';
import dayjs from 'dayjs';
import { useReactToPrint } from 'react-to-print';
import { grsAPI, projectAPI, poAPI } from '../../api/client';
import useAuthStore from '../../store/authStore';
import { FIELD_HL } from '../../constants/fieldStyles';
import toast from 'react-hot-toast';
import { PageHeader, Theme } from '../../theme';
import { CONSTRUCTION_UNITS as UNITS } from '../../constants/units';
import GRSPrintTemplate from './GRSPrintTemplate';

const STATUS_CONFIG = {
  pending:      { label: 'Pending',      color: 'bg-amber-50 text-amber-700 border-amber-200',    dot: 'bg-amber-500',   icon: Clock },
  acknowledged: { label: 'Acknowledged', color: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500', icon: CheckCircle2 },
  cancelled:    { label: 'Cancelled',    color: 'bg-red-50 text-red-600 border-red-200',           dot: 'bg-red-400',     icon: XCircle },
};

function StatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.pending;
  const Icon = cfg.icon;
  return (
    <span className={clsx('inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border whitespace-nowrap', cfg.color)}>
      <Icon size={11} strokeWidth={2.5} />
      {cfg.label}
    </span>
  );
}

/* ── Detail Panel ─────────────────────────────────────────────────────────── */
function GRSDetailPanel({ grs, onClose, onAcknowledge, ackLoading, onCancel, cancelLoading, onCreateIGN, isSuperAdmin, onDelete, deleteLoading, onEdit }) {
  if (!grs) return null;
  const items = grs.items || [];

  const localPrintRef = useRef(null);
  const handlePrint = useReactToPrint({ contentRef: localPrintRef });

  return (
    <div className="fixed inset-0 z-50 bg-white flex flex-col overflow-hidden">

      {/* Header */}
      <div className="bg-slate-900 px-6 py-4 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-4">
          <button onClick={onClose}
            className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center text-slate-300 hover:text-white transition">
            <X size={16} />
          </button>
          <div>
            <div className="text-[10px] text-slate-400 font-medium uppercase tracking-widest mb-0.5">Goods Receipt by Security</div>
            <h2 className="text-xl font-semibold text-white font-mono leading-tight">{grs.grs_number}</h2>
            <p className="text-sm text-slate-300 mt-0.5">{grs.project_name}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={grs.status} />
          {(grs.status === 'pending' || isSuperAdmin) && onEdit && (
            <button onClick={onEdit} title="Edit GRS"
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white text-xs font-medium transition">
              <Pencil size={14} /> Edit
            </button>
          )}
          <button onClick={handlePrint} title="Print GRS"
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white text-xs font-medium transition">
            <Printer size={14} /> Print
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto bg-slate-50">
        <div className="max-w-4xl mx-auto p-6 space-y-5">

          {/* Meta */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              ['Vehicle No.',        grs.vehicle_no       || '—'],
              ['Date & Time',        grs.date_time ? dayjs(grs.date_time).format('DD MMM YYYY, HH:mm') : '—'],
              ['Security In-charge', grs.security_incharge || '—'],
              ['GRS No.',            grs.grs_number       || '—'],
            ].map(([lbl, val]) => (
              <div key={lbl} className="bg-white border border-slate-200 rounded-lg px-3 py-2.5">
                <div className="text-[10px] text-slate-500 font-medium uppercase tracking-wider mb-0.5">{lbl}</div>
                <div className="text-sm font-medium text-slate-900">{val}</div>
              </div>
            ))}
          </div>

          {/* Linked PO */}
          {(grs.po_number || grs.po_ref_number) && (
            <div className="bg-indigo-50 border border-indigo-200 rounded-xl px-4 py-3 flex items-center gap-3">
              <FileText size={16} className="text-indigo-500 flex-shrink-0" />
              <div>
                <div className="text-[10px] text-indigo-500 font-medium uppercase tracking-wider">Linked Purchase Order</div>
                <div className="text-sm font-semibold text-indigo-800">
                  {grs.po_number || grs.po_ref_number}
                  {grs.vendor_name && <span className="ml-2 font-normal text-indigo-600">— {grs.vendor_name}</span>}
                </div>
              </div>
            </div>
          )}

          {/* Items table */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <span className="text-xs font-medium text-slate-700 uppercase tracking-wider flex items-center gap-2">
                <Package size={13} /> Items Received
              </span>
              <span className="text-xs font-medium text-indigo-600 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded-full">
                {items.length} items
              </span>
            </div>
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  {['Sl.','Particulars','Unit','Qty','Remarks'].map(h => (
                    <th key={h} className="px-3 py-2 text-left text-xs font-medium text-slate-600 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {items.map((it, i) => (
                  <tr key={i} className="hover:bg-slate-50">
                    <td className="px-3 py-2.5 font-mono text-slate-500">{it.sl_no}</td>
                    <td className="px-3 py-2.5 font-medium text-slate-900">{it.particulars}</td>
                    <td className="px-3 py-2.5">
                      {it.unit && (
                        <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200 text-[10px] uppercase font-medium">{it.unit}</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-emerald-700 font-medium">{it.quantity ?? '—'}</td>
                    <td className="px-3 py-2.5 text-slate-500">{it.remarks || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Acknowledged banner */}
          {grs.status === 'acknowledged' && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
              <div className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest mb-2">For Office Use Only</div>
              <p className="text-xs text-emerald-800 font-medium">Received the above materials in good condition</p>
              <div className="mt-2 text-xs text-emerald-700">
                Acknowledged by: <strong>{grs.acknowledged_by_name}</strong>
                {grs.acknowledged_at && <span className="ml-2 text-emerald-600">· {dayjs(grs.acknowledged_at).format('DD MMM YYYY, HH:mm')}</span>}
              </div>
            </div>
          )}

          {/* Hidden print template */}
          <div style={{ display: 'none' }}>
            <GRSPrintTemplate ref={localPrintRef} data={grs} />
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="border-t border-slate-200 bg-white flex-shrink-0 px-6 py-4">
        <div className="max-w-4xl mx-auto flex flex-wrap gap-3">
          {grs.status === 'pending' && (
            <button onClick={onAcknowledge} disabled={ackLoading}
              className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-medium px-6 py-2.5 rounded-xl text-sm transition shadow-sm">
              <CheckCircle2 size={16} />
              {ackLoading ? 'Processing…' : 'Acknowledge — Received in Good Condition'}
            </button>
          )}
          {grs.status === 'acknowledged' && onCreateIGN && (
            <button onClick={onCreateIGN}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-medium px-6 py-2.5 rounded-xl text-sm transition">
              <FileText size={15} />
              Create IGN from this GRS →
            </button>
          )}
          {grs.status === 'acknowledged' && (
            <div className="flex items-center gap-2 text-emerald-700 text-sm font-medium">
              <CheckCircle2 size={16} className="text-emerald-600" /> Acknowledged
            </div>
          )}
          {grs.status === 'pending' && (
            <button onClick={onCancel} disabled={cancelLoading}
              className="flex items-center gap-2 border border-red-200 text-red-600 hover:bg-red-50 font-medium px-5 py-2.5 rounded-xl text-sm transition disabled:opacity-50">
              <XCircle size={15} />
              {cancelLoading ? 'Cancelling…' : 'Cancel GRS'}
            </button>
          )}
          <div className="flex items-center gap-2">
            {isSuperAdmin && (
              <button onClick={onDelete} disabled={deleteLoading}
                className="flex items-center justify-center gap-2 px-4 py-2.5 text-red-600 font-medium text-sm border border-red-200 rounded-xl hover:bg-red-50 disabled:opacity-50 transition">
                <Trash2 size={15} /> {deleteLoading ? 'Deleting…' : 'Delete'}
              </button>
            )}
            <button onClick={onClose}
              className="flex-1 py-2.5 text-slate-600 font-medium text-sm border border-slate-200 rounded-xl hover:bg-slate-50 transition">
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Main Page ────────────────────────────────────────────────────────────── */
export default function GRSPage() {
  const qc = useQueryClient();
  const { user } = useAuthStore();
  const isSuperAdmin = String(user?.role || '').toLowerCase() === 'super_admin';
  const [showForm, setShowForm]       = useState(false);
  const [editGrs, setEditGrs]         = useState(null);
  const [selectedId, setSelectedId]   = useState(null);
  const [search, setSearch]           = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [projectFilter, setProjectFilter] = useState('');

  const { data: grsList = [], isLoading, refetch } = useQuery({
    queryKey: ['grs-list', projectFilter],
    queryFn: () => grsAPI.list(projectFilter ? { project_id: projectFilter } : {}).then(r => r.data?.data ?? []).catch(() => []),
  });

  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: () => projectAPI.list().then(r => r.data?.data ?? r.data ?? []).catch(() => []),
  });

  const { data: detailedGRS } = useQuery({
    queryKey: ['grs', selectedId],
    queryFn: () => grsAPI.get(selectedId).then(r => r.data?.data ?? null).catch(() => null),
    enabled: !!selectedId,
  });

  const ackMutation = useMutation({
    mutationFn: (id) => grsAPI.acknowledge(id),
    onSuccess: () => {
      toast.success('GRS acknowledged');
      qc.invalidateQueries({ queryKey: ['grs-list'] });
      qc.invalidateQueries({ queryKey: ['grs', selectedId] });
    },
    onError: (e) => toast.error(e?.response?.data?.error || 'Failed'),
  });

  const cancelMutation = useMutation({
    mutationFn: (id) => grsAPI.cancel(id),
    onSuccess: () => {
      toast.success('GRS cancelled');
      qc.invalidateQueries({ queryKey: ['grs-list'] });
      qc.invalidateQueries({ queryKey: ['grs', selectedId] });
    },
    onError: (e) => toast.error(e?.response?.data?.error || 'Failed'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => grsAPI.remove(id),
    onSuccess: () => {
      toast.success('GRS deleted');
      qc.invalidateQueries({ queryKey: ['grs-list'] });
      setSelectedId(null);
    },
    onError: (e) => toast.error(e?.response?.data?.error || 'Delete failed'),
  });

  const handleDelete = (grs, e) => {
    e?.stopPropagation?.();
    if (window.confirm(`Delete ${grs.grs_number}? This permanently removes the GRS and its items. This cannot be undone.`)) {
      deleteMutation.mutate(grs.id);
    }
  };

  // Open the edit form — fetches full GRS (with items) then shows the form.
  const handleEdit = async (grs, e) => {
    e?.stopPropagation?.();
    try {
      const full = grs.items ? grs : await grsAPI.get(grs.id).then(r => r.data?.data ?? null);
      if (!full) return toast.error('Could not load GRS for editing');
      setSelectedId(null);
      setEditGrs(full);
    } catch (_) {
      toast.error('Could not load GRS for editing');
    }
  };


  const counts = {
    pending:      grsList.filter(g => g.status === 'pending').length,
    acknowledged: grsList.filter(g => g.status === 'acknowledged').length,
    cancelled:    grsList.filter(g => g.status === 'cancelled').length,
  };

  const filtered = grsList.filter(g => {
    if (statusFilter !== 'all' && g.status !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!g.grs_number?.toLowerCase().includes(q) &&
          !g.project_name?.toLowerCase().includes(q) &&
          !g.vehicle_no?.toLowerCase().includes(q) &&
          !g.security_incharge?.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const exportCSV = () => {
    const headers = ['GRS Number','Date & Time','Project','Vehicle No','Security In-charge','Items','Status'];
    const rows = filtered.map(g => [
      g.grs_number,
      g.date_time ? dayjs(g.date_time).format('DD/MM/YYYY HH:mm') : '',
      g.project_name,
      g.vehicle_no || '',
      g.security_incharge || '',
      g.item_count || 0,
      g.status,
    ]);
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `GRS_${dayjs().format('YYYY-MM-DD')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('CSV exported');
  };

  return (
    <div style={{ background: Theme.pageBg, minHeight: '100vh' }}>
      <PageHeader
        title="Goods Receipt by Security"
        subtitle="Gate-level material entry log — security logs every incoming delivery"
        breadcrumbs={[{ label: 'Stores' }, { label: 'GRS' }]}
        actions={
          <>
            <button onClick={() => refetch()}
              className="w-9 h-9 flex items-center justify-center rounded-lg transition"
              style={{ background: 'rgba(255,255,255,0.10)', border: '1px solid rgba(255,255,255,0.20)', color: '#fff' }}>
              <RefreshCw size={14} />
            </button>
            <button onClick={exportCSV}
              className="flex items-center gap-2 px-3 py-2 text-xs font-medium rounded-lg transition"
              style={{ background: 'rgba(255,255,255,0.10)', border: '1px solid rgba(255,255,255,0.20)', color: '#fff' }}>
              <Download size={14} /> Export
            </button>
            <button onClick={() => setShowForm(true)}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition shadow-sm"
              style={{ background: '#fff', color: Theme.navyDark, border: '1px solid rgba(255,255,255,0.4)' }}>
              <Plus size={14} /> New GRS
            </button>
          </>
        }
      />

      <div className="p-6 md:p-8 max-w-full mx-auto">

        {/* KPI summary cards — also act as status filters */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
          {[
            { key: 'all',          label: 'Total GRS',    value: grsList.length,      icon: FileText,     topbar: 'before:bg-slate-400',   soft: 'bg-slate-100',   text: 'text-slate-600' },
            { key: 'pending',      label: 'Pending',      value: counts.pending,      icon: Clock,        topbar: 'before:bg-amber-500',   soft: 'bg-amber-50',    text: 'text-amber-600' },
            { key: 'acknowledged', label: 'Acknowledged', value: counts.acknowledged, icon: CheckCircle2, topbar: 'before:bg-emerald-500', soft: 'bg-emerald-50',  text: 'text-emerald-600' },
            { key: 'cancelled',    label: 'Cancelled',    value: counts.cancelled,    icon: XCircle,      topbar: 'before:bg-red-400',     soft: 'bg-red-50',      text: 'text-red-600' },
          ].map(c => {
            const Icon = c.icon;
            const active = statusFilter === c.key;
            return (
              <button key={c.key} onClick={() => setStatusFilter(c.key)}
                className={clsx(
                  'relative bg-white border rounded-xl p-4 text-left transition-all hover:shadow-md overflow-hidden',
                  "before:content-[''] before:absolute before:top-0 before:left-0 before:right-0 before:h-1", c.topbar,
                  active ? 'border-slate-900 ring-2 ring-slate-200' : 'border-slate-200')}>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{c.label}</span>
                  <span className={clsx('w-7 h-7 rounded-lg flex items-center justify-center', c.soft)}>
                    <Icon className={clsx('w-4 h-4', c.text)} />
                  </span>
                </div>
                <div className="text-2xl font-bold text-slate-800 mt-2 tabular-nums">{c.value}</div>
                <div className="text-[11px] text-slate-400 mt-0.5">{active ? '● Filtering by this' : 'Tap to filter'}</div>
              </button>
            );
          })}
        </div>

        {/* Pending banner */}
        {counts.pending > 0 && (
          <div className="mb-4 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-center gap-3">
            <AlertTriangle size={16} className="text-amber-600 flex-shrink-0" />
            <span className="text-sm font-medium text-amber-800">
              {counts.pending} GRS entry{counts.pending > 1 ? 's' : ''} pending acknowledgement by Engineer / Stores Officer
            </span>
            <button onClick={() => setStatusFilter('pending')} className="ml-auto text-xs font-medium text-amber-700 underline">
              Review now →
            </button>
          </div>
        )}

        {/* Toolbar */}
        <div className="bg-white border border-slate-200 rounded-xl p-3 mb-5 flex flex-wrap items-center gap-3 shadow-sm">
          {statusFilter !== 'all' && (
            <button onClick={() => setStatusFilter('all')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-900 text-white">
              {STATUS_CONFIG[statusFilter]?.label || statusFilter}
              <X size={12} />
            </button>
          )}
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search GRS, vehicle, security…"
              className="h-9 pl-9 pr-4 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700 outline-none focus:border-indigo-400 transition w-64" />
          </div>
          <select value={projectFilter} onChange={e => setProjectFilter(e.target.value)}
            className="h-9 bg-slate-50 border border-slate-200 rounded-lg px-3 text-sm text-slate-700 outline-none focus:border-indigo-400">
            <option value="">All Projects</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <span className="ml-auto text-xs text-slate-500 font-medium">
            {filtered.length} <span className="text-slate-400">of {grsList.length}</span>
          </span>
        </div>

        {/* Table */}
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  {['GRS Number','Date & Time','Project','Vehicle No.','Security In-charge','Items','Status',''].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase tracking-wider whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {isLoading ? (
                  [...Array(4)].map((_, i) => (
                    <tr key={i}><td colSpan={8} className="px-4 py-3">
                      <div className="h-5 bg-slate-100 animate-pulse rounded w-full" />
                    </td></tr>
                  ))
                ) : filtered.map(grs => (
                  <tr key={grs.id} onClick={() => setSelectedId(grs.id)}
                    className={clsx('cursor-pointer hover:bg-indigo-50/30 transition-colors group border-l-2',
                      grs.status === 'acknowledged' ? 'border-l-emerald-400'
                        : grs.status === 'cancelled' ? 'border-l-red-300'
                        : 'border-l-amber-400')}>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-teal-50 border border-teal-100 flex items-center justify-center flex-shrink-0">
                          <ShieldCheck className="w-3.5 h-3.5 text-teal-600" />
                        </div>
                        <span className="text-xs font-medium font-mono text-indigo-700 group-hover:underline">{grs.grs_number}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-xs text-slate-500">
                      {grs.date_time ? dayjs(grs.date_time).format('DD MMM YYYY HH:mm') : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-xs font-medium text-slate-900 max-w-[140px] truncate">{grs.project_name}</div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        <Truck className="w-3 h-3 text-slate-400 shrink-0" />
                        <span className="text-xs font-mono text-slate-700">{grs.vehicle_no || '—'}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-xs text-slate-600">{grs.security_incharge || '—'}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                        {grs.item_count || 0} items
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap"><StatusBadge status={grs.status} /></td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {(grs.status === 'pending' || isSuperAdmin) && (
                          <button onClick={(e) => handleEdit(grs, e)} title="Edit GRS"
                            className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-300 hover:text-indigo-600 hover:bg-indigo-50 transition-colors">
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {isSuperAdmin && (
                          <button onClick={(e) => handleDelete(grs, e)} title="Delete GRS"
                            className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-300 hover:text-red-600 hover:bg-red-50 transition-colors">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-indigo-500 transition-colors" />
                      </div>
                    </td>
                  </tr>
                ))}
                {!isLoading && filtered.length === 0 && (
                  <tr>
                    <td colSpan={8} className="py-16 text-center">
                      <ClipboardList className="w-8 h-8 text-slate-300 mx-auto mb-3" />
                      <p className="text-sm font-medium text-slate-700">No GRS entries found</p>
                      <p className="text-xs text-slate-400 mt-1">Adjust filters or create a new entry.</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-2.5 border-t border-slate-100 bg-slate-50 text-xs text-slate-500">
            Showing {filtered.length} of {grsList.length} GRS entries
          </div>
        </div>

        {/* Detail Panel */}
        {selectedId && detailedGRS && (
          <GRSDetailPanel
            grs={detailedGRS}
            onClose={() => setSelectedId(null)}
            onAcknowledge={() => ackMutation.mutate(selectedId)}
            ackLoading={ackMutation.isPending}
            onCancel={() => cancelMutation.mutate(selectedId)}
            cancelLoading={cancelMutation.isPending}
            onCreateIGN={() => {
              setSelectedId(null);
              window.location.href = `/stores/ign?from_grs=${selectedId}`;
            }}
            isSuperAdmin={isSuperAdmin}
            onDelete={() => handleDelete(detailedGRS)}
            deleteLoading={deleteMutation.isPending}
            onEdit={() => handleEdit(detailedGRS)}
          />
        )}

        {/* Create / Edit Form */}
        {(showForm || editGrs) && (
          <GRSForm
            onClose={() => { setShowForm(false); setEditGrs(null); }}
            projects={projects}
            qc={qc}
            editGrs={editGrs}
          />
        )}
      </div>
    </div>
  );
}

/* ── GRS Create / Edit Form ───────────────────────────────────────────────── */
function GRSForm({ onClose, projects, qc, editGrs = null }) {
  const isEdit = Boolean(editGrs);
  const emptyItem = () => ({ particulars: '', unit: '', quantity: '', remarks: '' });

  const [form, setForm] = useState(() => isEdit ? {
    project_id: editGrs.project_id || '',
    vehicle_no: editGrs.vehicle_no || '',
    date_time: editGrs.date_time ? dayjs(editGrs.date_time).format('YYYY-MM-DDTHH:mm') : dayjs().format('YYYY-MM-DDTHH:mm'),
    security_incharge: editGrs.security_incharge || '',
    remarks: editGrs.remarks || '',
    po_id: editGrs.po_id || '',
    po_number: editGrs.po_number || '',
  } : {
    project_id: '',
    vehicle_no: '',
    date_time: dayjs().format('YYYY-MM-DDTHH:mm'),
    security_incharge: '',
    remarks: '',
    po_id: '',
    po_number: '',
  });
  const [items, setItems] = useState(() =>
    isEdit && editGrs.items?.length
      ? editGrs.items.map(it => ({
          particulars: it.particulars || '',
          unit:        it.unit || '',
          quantity:    it.quantity != null ? String(it.quantity) : '',
          remarks:     it.remarks || '',
        }))
      : [emptyItem()]
  );

  // Fetch approved POs for the selected project
  const { data: poList = [] } = useQuery({
    queryKey: ['po-list-grs', form.project_id],
    queryFn: () => poAPI.list({ project_id: form.project_id, status: 'approved' })
      .then(r => r.data?.data || r.data || []),
    enabled: !!form.project_id,
  });

  const createMutation = useMutation({
    mutationFn: (d) => isEdit ? grsAPI.update(editGrs.id, d) : grsAPI.create(d),
    onSuccess: () => {
      toast.success(isEdit ? 'GRS updated' : 'GRS entry created');
      qc.invalidateQueries({ queryKey: ['grs-list'] });
      if (isEdit) qc.invalidateQueries({ queryKey: ['grs', editGrs.id] });
      onClose();
    },
    onError: (e) => toast.error(e?.response?.data?.error || `Failed to ${isEdit ? 'update' : 'create'} GRS`),
  });

  const setField = (k, v) => setForm(p => ({ ...p, [k]: v }));
  const updateItem = (idx, k, v) => setItems(p => p.map((it, i) => i === idx ? { ...it, [k]: v } : it));
  const addRow    = () => setItems(p => [...p, emptyItem()]);
  const removeRow = (idx) => { if (items.length > 1) setItems(p => p.filter((_, i) => i !== idx)); };

  const handlePoSelect = async (poId) => {
    const po = poList.find(p => p.id === poId);
    setForm(prev => ({
      ...prev,
      po_id: poId,
      po_number: po ? (po.serial_no_formatted || po.po_number || '') : '',
    }));

    if (!poId) {
      setItems([emptyItem()]);
      return;
    }

    try {
      const res = await poAPI.get(poId);
      const poDetail = res.data?.data ?? res.data;
      const poItems = (poDetail?.items || []).filter(it => it.material_name?.trim());
      if (poItems.length > 0) {
        setItems(poItems.map(it => ({
          particulars: it.material_name || '',
          unit:        it.unit          || '',
          quantity:    it.quantity ? String(it.quantity) : '',
          remarks:     it.purpose       || '',
        })));
        toast.success(`${poItems.length} item${poItems.length > 1 ? 's' : ''} loaded from PO`);
      }
    } catch (_) {
      // PO fetch failed — items stay as-is
    }
  };

  const submit = () => {
    if (!form.project_id)  return toast.error('Select a project');
    if (!form.date_time)   return toast.error('Date & Time is required');
    const validItems = items.filter(it => it.particulars?.trim());
    if (!validItems.length) return toast.error('Add at least one item');
    createMutation.mutate({ ...form, items: validItems });
  };

  const inp = `w-full h-10 rounded-lg px-3 text-sm font-medium outline-none transition-all border ${FIELD_HL}`;

  return (
    <div className="fixed inset-0 z-[60] bg-white flex flex-col overflow-hidden">

        {/* Header */}
        <div className="bg-gradient-to-r from-slate-900 via-slate-900 to-teal-900/70 px-6 py-4 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-4">
            <button onClick={onClose} className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center text-slate-300 hover:text-white transition">
              <X size={16} />
            </button>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-teal-500/20 border border-teal-400/30 flex items-center justify-center flex-shrink-0">
                <ShieldCheck size={18} className="text-teal-300" />
              </div>
              <div>
                <div className="text-[10px] text-slate-400 font-medium uppercase tracking-widest mb-0.5">{isEdit ? `Edit ${editGrs.grs_number || ''}` : 'New Entry'}</div>
                <h2 className="text-xl font-semibold text-white leading-tight">{isEdit ? 'Edit Goods Receipt by Security' : 'New Goods Receipt by Security'}</h2>
                <p className="text-xs text-slate-400 mt-0.5">Security gate entry for incoming material delivery</p>
              </div>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto bg-slate-50">
        <div className="max-w-4xl mx-auto p-6 space-y-5">

          {/* Header fields */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
            <div className="flex items-center gap-2.5 mb-4">
              <div className="w-8 h-8 rounded-lg bg-teal-50 border border-teal-100 flex items-center justify-center">
                <Truck size={15} className="text-teal-600" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-slate-800">Entry Details</h3>
                <p className="text-[11px] text-slate-400">Delivery, vehicle & gate information</p>
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div className="col-span-2 md:col-span-1 space-y-1.5">
                <label className="text-xs font-bold text-slate-700">Project *</label>
                <select value={form.project_id} onChange={e => { setField('project_id', e.target.value); setField('po_id', ''); setField('po_number', ''); }} className={inp}>
                  <option value="">Select project…</option>
                  {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700">Vehicle No.</label>
                <input type="text" value={form.vehicle_no}
                  onChange={e => setField('vehicle_no', e.target.value.toUpperCase())}
                  placeholder="e.g. KA01AB1234" className={inp} />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700">Date & Time *</label>
                <input type="datetime-local" value={form.date_time}
                  onChange={e => setField('date_time', e.target.value)} className={inp} />
              </div>

              {/* PO Link */}
              <div className="col-span-2 md:col-span-3 space-y-1.5">
                <label className="text-xs font-bold text-slate-700">
                  Link Purchase Order
                  <span className="ml-1 text-slate-400 font-normal">(optional — select the PO this delivery is against)</span>
                </label>
                <select
                  value={form.po_id}
                  onChange={e => handlePoSelect(e.target.value)}
                  disabled={!form.project_id}
                  className={`${inp} ${!form.project_id ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  <option value="">— No PO linked —</option>
                  {poList.map(po => (
                    <option key={po.id} value={po.id}>
                      {po.serial_no_formatted || po.po_number} — {po.vendor_name}
                    </option>
                  ))}
                </select>
                {!form.project_id && <p className="text-xs text-slate-400">Select a project first to see its POs</p>}
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700">Security In-charge</label>
                <input type="text" value={form.security_incharge}
                  onChange={e => setField('security_incharge', e.target.value)}
                  placeholder="Name of security person" className={inp} />
              </div>
              <div className="col-span-2 space-y-1.5">
                <label className="text-xs font-bold text-slate-700">Remarks</label>
                <input type="text" value={form.remarks}
                  onChange={e => setField('remarks', e.target.value)}
                  placeholder="Any notes…" className={inp} />
              </div>
            </div>
          </div>

          {/* Items */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-indigo-50 border border-indigo-100 flex items-center justify-center">
                  <Package size={15} className="text-indigo-600" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-slate-800">Particulars (Items)</h3>
                  <p className="text-[11px] text-slate-400">Materials received in this delivery</p>
                </div>
              </div>
              <button onClick={addRow}
                className="flex items-center gap-1.5 px-3 h-8 rounded-lg text-xs font-semibold text-indigo-600 bg-indigo-50 border border-indigo-100 hover:bg-indigo-100 transition">
                <Plus size={12} /> Add Row
              </button>
            </div>

            <div className="border border-slate-200 rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600 w-8">Sl.</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600">Particulars *</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600 w-28">Unit</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600 w-28">Quantity</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600">Remarks</th>
                    <th className="px-3 py-2 w-8" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {items.map((it, idx) => (
                    <tr key={idx}>
                      <td className="px-3 py-2 text-xs text-slate-400 font-mono">{idx + 1}</td>
                      <td className="px-3 py-2">
                        <input value={it.particulars}
                          onChange={e => updateItem(idx, 'particulars', e.target.value)}
                          placeholder="Material description"
                          className={`w-full h-8 rounded-lg px-3 text-xs outline-none transition-all border ${FIELD_HL}`} />
                      </td>
                      <td className="px-3 py-2">
                        <select value={it.unit} onChange={e => updateItem(idx, 'unit', e.target.value)}
                          className={`w-full h-8 rounded-lg px-2 text-xs outline-none transition-all border ${FIELD_HL}`}>
                          <option value="">—</option>
                          {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                        </select>
                      </td>
                      <td className="px-3 py-2">
                        <input type="number" value={it.quantity}
                          onChange={e => updateItem(idx, 'quantity', e.target.value)}
                          placeholder="0"
                          className={`w-full h-8 rounded-lg px-3 text-xs text-right font-mono outline-none transition-all border ${FIELD_HL}`} />
                      </td>
                      <td className="px-3 py-2">
                        <input value={it.remarks}
                          onChange={e => updateItem(idx, 'remarks', e.target.value)}
                          placeholder="Notes…"
                          className={`w-full h-8 rounded-lg px-3 text-xs outline-none transition-all border ${FIELD_HL}`} />
                      </td>
                      <td className="px-3 py-2">
                        <button onClick={() => removeRow(idx)} disabled={items.length === 1}
                          className="w-7 h-7 rounded-lg border border-slate-200 flex items-center justify-center text-slate-400 hover:text-red-500 hover:border-red-200 hover:bg-red-50 disabled:opacity-30 transition">
                          <X size={12} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Office use note */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3">
            <p className="text-xs text-slate-500 font-medium">
              <strong className="text-slate-700">For Office Use Only</strong> — After saving, the Engineer or Stores Officer can open this GRS and click
              <em> "Acknowledge — Received in Good Condition"</em> to confirm receipt.
            </p>
          </div>
        </div>
        </div>

        {/* Footer */}
        <div className="border-t bg-white flex-shrink-0 px-6 py-4">
          <div className="max-w-4xl mx-auto flex items-center justify-between">
            <span className="text-xs text-slate-500 font-semibold">
              {items.filter(i => i.particulars?.trim()).length} item(s) ready
            </span>
            <div className="flex items-center gap-2">
              <button onClick={onClose}
                className="px-5 h-9 rounded-lg border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 transition">
                Cancel
              </button>
              <button onClick={submit} disabled={createMutation.isPending}
                className="px-6 h-9 rounded-lg bg-teal-600 text-white text-sm font-semibold hover:bg-teal-700 transition disabled:opacity-50 shadow-sm">
                {createMutation.isPending ? 'Saving…' : (isEdit ? 'Update GRS →' : 'Create GRS →')}
              </button>
            </div>
          </div>
        </div>
    </div>
  );
}
