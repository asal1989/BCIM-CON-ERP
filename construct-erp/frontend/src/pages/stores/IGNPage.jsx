// src/pages/stores/IGNPage.jsx — Inward Goods Note (merged with GRN features)
import RecordAttachments from '../../components/shared/RecordAttachments';
import React, { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ClipboardCheck, Plus, X, Search, Download, RefreshCw, Printer,
  Clock, CheckCircle2, Package, ChevronRight, FileText,
  Truck, ClipboardList, AlertTriangle, XCircle, Eye,
  Building2, Trash2, IndianRupee, ChevronDown, ChevronUp,
} from 'lucide-react';
import { clsx } from 'clsx';
import dayjs from 'dayjs';
import { useReactToPrint } from 'react-to-print';
import { ignAPI, projectAPI, grsAPI, poAPI, vendorAPI, inventoryAPI } from '../../api/client';
import useAuthStore from '../../store/authStore';
import { FIELD_HL } from '../../constants/fieldStyles';
import { Z_INP, Z_CARD, Z_HEAD } from '../../constants/zohoStyles';
import toast from 'react-hot-toast';
import { PageHeader, Theme } from '../../theme';
import { CONSTRUCTION_UNITS as UNITS, normalizeUnit } from '../../constants/units';
import IGNPrintTemplate from './IGNPrintTemplate';
import MaterialCombobox from '../../components/shared/MaterialCombobox';
import SearchableSelect from '../../components/shared/SearchableSelect';

const fmt    = n => n != null ? Number(n).toLocaleString('en-IN', { minimumFractionDigits: 3, maximumFractionDigits: 3 }) : '—';
const inr    = n => Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const STATUS_CONFIG = {
  pending:   { label: 'Pending',   color: 'bg-amber-50 text-amber-700 border-amber-200',       icon: Clock },
  inspected: { label: 'Inspected', color: 'bg-blue-50 text-blue-700 border-blue-200',          icon: Eye },
  approved:  { label: 'Approved',  color: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: CheckCircle2 },
  cancelled: { label: 'Cancelled', color: 'bg-red-50 text-red-600 border-red-200',             icon: XCircle },
};

function StatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.pending;
  const Icon = cfg.icon;
  return (
    <span className={clsx('inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border whitespace-nowrap', cfg.color)}>
      <Icon size={11} strokeWidth={2.5} />{cfg.label}
    </span>
  );
}

/* ── Detail Panel ─────────────────────────────────────────────────────────── */
function IGNDetailPanel({ ign, onClose, onApprove, approveLoading, onInspect, inspectLoading, onCancel, cancelLoading, isSuperAdmin, onDelete, deleteLoading }) {
  if (!ign) return null;
  const items = ign.items || [];
  const totalRejected = items.reduce((s, it) => s + parseFloat(it.qty_rejected || 0), 0);
  const totalValue    = items.reduce((s, it) => s + parseFloat(it.qty_inspected || it.qty_as_per_dc || 0) * parseFloat(it.rate || 0), 0);
  const localPrintRef = useRef(null);
  const handlePrint = useReactToPrint({ contentRef: localPrintRef });

  return (
    <div className="fixed inset-0 z-50 bg-white flex flex-col overflow-hidden">

      <div className="bg-slate-900 px-6 py-4 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-4">
          <button onClick={onClose} className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center text-slate-300 hover:text-white transition">
            <X size={16} />
          </button>
          <div>
            <div className="text-[10px] text-slate-400 font-medium uppercase tracking-widest mb-0.5">Inward Goods Note</div>
            <h2 className="text-xl font-semibold text-white font-mono leading-tight">{ign.ign_number}</h2>
            <p className="text-sm text-slate-300 mt-0.5">{ign.project_name}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={ign.status} />
          <button onClick={handlePrint} title="Print IGN"
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white text-xs font-medium transition">
            <Printer size={14} /> Print
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto bg-slate-50">
        <div className="max-w-5xl mx-auto p-6 space-y-5">
          {/* Meta */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {[
              ['Supplier / Vendor', ign.vendor_name || ign.supplier_name || '—'],
              ['Vehicle No.',       ign.vehicle_no     || '—'],
              ['DC No.',            ign.dc_number      || '—'],
              ['Bill No.',          ign.bill_number    || '—'],
              ['PO No.',            ign.po_number      || '—'],
              ['GRS No.',           ign.grs_number     || '—'],
              ['Date & Time',       ign.date_time ? dayjs(ign.date_time).format('DD-MM-YYYY HH:mm') : '—'],
              ['Driver',            ign.driver_name    || '—'],
              ['Gate Pass No.',     ign.gate_pass_no   || '—'],
              ['WB Slip No.',       ign.wb_slip_no     || '—'],
              ['Site Location',     ign.site_location  || 'main'],
              ['Inspected By',      ign.inspected_by   || '—'],
              ['Stores In-charge',  ign.stores_incharge || '—'],
              ['Serial No.',        ign.serial_no_formatted || '—'],
            ].map(([lbl, val]) => (
              <div key={lbl} className="bg-white border border-slate-200 rounded-lg px-3 py-2.5">
                <div className="text-[10px] text-slate-500 font-medium uppercase tracking-wider mb-0.5">{lbl}</div>
                <div className="text-sm font-medium text-slate-900 truncate">{val}</div>
              </div>
            ))}
          </div>

          {/* Notes bracket */}
          {(ign.issues_notes || ign.remarks || ign.inspection_notes) && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-2">
              {ign.issues_notes && (
                <div><span className="text-xs font-bold text-amber-800">Issues: </span><span className="text-xs text-amber-700">{ign.issues_notes}</span></div>
              )}
              {ign.remarks && (
                <div><span className="text-xs font-bold text-slate-700">General: </span><span className="text-xs text-slate-600">{ign.remarks}</span></div>
              )}
              {ign.inspection_notes && (
                <div><span className="text-xs font-bold text-blue-800">Inspection Notes: </span><span className="text-xs text-blue-700">{ign.inspection_notes}</span></div>
              )}
            </div>
          )}

          {/* 3-step workflow progress */}
          {ign.status !== 'cancelled' && (
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-3">Workflow Progress</div>
              <div className="flex items-center gap-2">
                {[
                  { key: 'pending',   label: 'Created' },
                  { key: 'inspected', label: 'Inspected' },
                  { key: 'approved',  label: 'Stock Posted' },
                ].map((step, idx, arr) => {
                  const statusOrder = ['pending','inspected','approved'];
                  const currentIdx = statusOrder.indexOf(ign.status);
                  const stepIdx = statusOrder.indexOf(step.key);
                  const done = currentIdx > stepIdx || (ign.status === step.key);
                  const active = ign.status === step.key;
                  return (
                    <React.Fragment key={step.key}>
                      <div className="flex flex-col items-center gap-1 flex-1">
                        <div className={clsx(
                          'w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2',
                          done && !active ? 'bg-emerald-500 border-emerald-500 text-white' :
                          active ? 'bg-white border-indigo-500 text-indigo-600' :
                          'bg-white border-slate-200 text-slate-400'
                        )}>
                          {done && !active ? <CheckCircle2 size={14} /> : idx + 1}
                        </div>
                        <span className={clsx('text-[9px] font-medium uppercase tracking-wide',
                          done ? 'text-emerald-600' : active ? 'text-indigo-600' : 'text-slate-400'
                        )}>{step.label}</span>
                      </div>
                      {idx < arr.length - 1 && (
                        <div className={clsx('flex-1 h-0.5 mb-4', currentIdx > stepIdx ? 'bg-emerald-400' : 'bg-slate-200')} />
                      )}
                    </React.Fragment>
                  );
                })}
              </div>
            </div>
          )}

          {/* Rejection warning */}
          {totalRejected > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex items-center gap-3">
              <AlertTriangle size={16} className="text-red-500 flex-shrink-0" />
              <span className="text-sm font-medium text-red-800">
                {fmt(totalRejected)} units rejected across {items.filter(it => parseFloat(it.qty_rejected || 0) > 0).length} item(s)
              </span>
            </div>
          )}

          {/* Items table */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <span className="text-xs font-medium text-slate-700 uppercase tracking-wider flex items-center gap-2">
                <Package size={13} /> Materials Inspected
              </span>
              <div className="flex items-center gap-3">
                <span className="text-xs font-medium text-indigo-600 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded-full">
                  {items.length} items
                </span>
                {totalValue > 0 && (
                  <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded-full">
                    Total: ₹{inr(totalValue)}
                  </span>
                )}
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 border-b border-slate-100">
                  <tr>
                    {['Inv. No.','Material','Unit','Rate','As per DC/Bill','After Inspection','Rejected','Value','Remarks'].map(h => (
                      <th key={h} className="px-3 py-2 text-left font-medium text-slate-600 uppercase tracking-wider whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {items.map((it, i) => {
                    const hasRejection = parseFloat(it.qty_rejected || 0) > 0;
                    const qty = parseFloat(it.qty_inspected || it.qty_as_per_dc || 0);
                    const rate = parseFloat(it.rate || 0);
                    return (
                      <tr key={i} className={clsx('hover:bg-slate-50', hasRejection && 'bg-red-50/40')}>
                        <td className="px-3 py-2.5 font-mono text-slate-500 text-[11px]">{it.invoice_no || '—'}</td>
                        <td className="px-3 py-2.5 font-medium text-slate-900">{it.material_name}</td>
                        <td className="px-3 py-2.5">
                          {it.unit && <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200 text-[10px] uppercase font-medium">{it.unit}</span>}
                        </td>
                        <td className="px-3 py-2.5 font-mono text-slate-600">{rate > 0 ? inr(rate) : '—'}</td>
                        <td className="px-3 py-2.5 font-mono text-slate-600">{fmt(it.qty_as_per_dc)}</td>
                        <td className="px-3 py-2.5 font-mono text-emerald-700 font-medium">{fmt(it.qty_inspected)}</td>
                        <td className="px-3 py-2.5 font-mono font-medium">
                          <span className={clsx(hasRejection ? 'text-red-600' : 'text-slate-400')}>
                            {fmt(it.qty_rejected)}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 font-mono text-slate-700">
                          {rate > 0 && qty > 0 ? `₹${inr(qty * rate)}` : '—'}
                        </td>
                        <td className="px-3 py-2.5 text-slate-500">{it.quality_remarks || it.remarks || '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Linked bills */}
          {ign.bills?.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 text-xs font-medium text-slate-700 uppercase tracking-wider flex items-center gap-2">
                <FileText size={13} /> Linked Bills ({ign.bills.length})
              </div>
              <div className="divide-y divide-slate-100">
                {ign.bills.map(b => (
                  <div key={b.id} className="px-4 py-3 flex items-center justify-between">
                    <div>
                      <div className="text-sm font-mono font-medium text-indigo-700">{b.sl_number}</div>
                      <div className="text-xs text-slate-500 mt-0.5">{b.inv_number ? `Inv: ${b.inv_number}` : 'No inv number'}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-semibold text-slate-800">₹{inr(b.total_amount)}</div>
                      <div className="text-xs text-slate-500 capitalize">{b.workflow_status}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {ign.status === 'approved' && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
              <p className="text-xs font-medium text-emerald-800">
                Approved by <strong>{ign.approved_by_name}</strong> — Stock posted to inventory
                {ign.approved_at && <span className="text-emerald-600 ml-2">· {dayjs(ign.approved_at).format('DD-MM-YYYY HH:mm')}</span>}
              </p>
            </div>
          )}

          {/* File attachments */}
          <RecordAttachments recordType="ign" recordId={ign.id} />

          {/* Hidden print template */}
          <div style={{ display: 'none' }}>
            <IGNPrintTemplate ref={localPrintRef} data={ign} />
          </div>
        </div>
      </div>

      <div className="border-t border-slate-200 bg-white flex-shrink-0 px-6 py-4">
        <div className="max-w-5xl mx-auto flex flex-wrap gap-3">
          {ign.status === 'pending' && (
            <button onClick={onInspect} disabled={inspectLoading}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-medium px-6 py-2.5 rounded-xl text-sm transition shadow-sm">
              <Eye size={16} />
              {inspectLoading ? 'Processing…' : 'Mark as Inspected'}
            </button>
          )}
          {(ign.status === 'pending' || ign.status === 'inspected') && (
            <button onClick={onApprove} disabled={approveLoading}
              className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-medium px-6 py-2.5 rounded-xl text-sm transition shadow-sm">
              <CheckCircle2 size={16} />
              {approveLoading ? 'Processing…' : 'Approve & Post to Inventory'}
            </button>
          )}
          {ign.status === 'approved' && (
            <div className="flex items-center gap-2 text-emerald-700 text-sm font-medium">
              <CheckCircle2 size={16} className="text-emerald-600" /> Approved — Stock Posted
            </div>
          )}
          {ign.status === 'pending' && (
            <button onClick={onCancel} disabled={cancelLoading}
              className="flex items-center gap-2 border border-red-200 text-red-600 hover:bg-red-50 font-medium px-5 py-2.5 rounded-xl text-sm transition disabled:opacity-50">
              <XCircle size={15} />
              {cancelLoading ? 'Cancelling…' : 'Cancel IGN'}
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
export default function IGNPage() {
  const qc = useQueryClient();
  const { user } = useAuthStore();
  const isSuperAdmin = String(user?.role || '').toLowerCase() === 'super_admin';
  const [showForm, setShowForm]           = useState(() => !!new URLSearchParams(window.location.search).get('from_grs'));
  const [selectedId, setSelectedId]       = useState(null);
  const [search, setSearch]               = useState('');
  const [statusFilter, setStatusFilter]   = useState('all');
  const [projectFilter, setProjectFilter] = useState('');

  const { data: ignList = [], isLoading, refetch } = useQuery({
    queryKey: ['ign-list', projectFilter],
    queryFn: () => ignAPI.list(projectFilter ? { project_id: projectFilter } : {}).then(r => r.data?.data ?? []).catch(() => []),
  });

  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: () => projectAPI.list().then(r => r.data?.data ?? r.data ?? []).catch(() => []),
  });

  const { data: detailedIGN } = useQuery({
    queryKey: ['ign', selectedId],
    queryFn: () => ignAPI.get(selectedId).then(r => r.data?.data ?? null).catch(() => null),
    enabled: !!selectedId,
  });

  const approveMutation = useMutation({
    mutationFn: (id) => ignAPI.approve(id),
    onSuccess: () => {
      toast.success('IGN approved — inventory updated');
      qc.invalidateQueries({ queryKey: ['ign-list'] });
      qc.invalidateQueries({ queryKey: ['ign', selectedId] });
    },
    onError: (e) => toast.error(e?.response?.data?.error || 'Failed'),
  });

  const inspectMutation = useMutation({
    mutationFn: (id) => ignAPI.inspect(id),
    onSuccess: () => {
      toast.success('IGN marked as inspected');
      qc.invalidateQueries({ queryKey: ['ign-list'] });
      qc.invalidateQueries({ queryKey: ['ign', selectedId] });
    },
    onError: (e) => toast.error(e?.response?.data?.error || 'Failed'),
  });

  const cancelMutation = useMutation({
    mutationFn: (id) => ignAPI.cancel(id),
    onSuccess: () => {
      toast.success('IGN cancelled');
      qc.invalidateQueries({ queryKey: ['ign-list'] });
      qc.invalidateQueries({ queryKey: ['ign', selectedId] });
    },
    onError: (e) => toast.error(e?.response?.data?.error || 'Failed'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => ignAPI.remove(id),
    onSuccess: () => {
      toast.success('IGN deleted');
      qc.invalidateQueries({ queryKey: ['ign-list'] });
      setSelectedId(null);
    },
    onError: (e) => toast.error(e?.response?.data?.error || 'Delete failed'),
  });

  const handleDelete = (ign, e) => {
    e?.stopPropagation?.();
    if (window.confirm(`Delete ${ign.ign_number}? This permanently removes the IGN, reverses any stock, and cannot be undone.`)) {
      deleteMutation.mutate(ign.id);
    }
  };

  const counts = {
    pending:   ignList.filter(g => g.status === 'pending').length,
    inspected: ignList.filter(g => g.status === 'inspected').length,
    approved:  ignList.filter(g => g.status === 'approved').length,
  };

  const filtered = ignList.filter(g => {
    if (statusFilter !== 'all' && g.status !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!g.ign_number?.toLowerCase().includes(q) &&
          !g.project_name?.toLowerCase().includes(q) &&
          !g.supplier_name?.toLowerCase().includes(q) &&
          !g.vendor_name?.toLowerCase().includes(q) &&
          !g.vehicle_no?.toLowerCase().includes(q) &&
          !g.dc_number?.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const exportCSV = () => {
    const headers = ['IGN No.','Date','Project','Supplier/Vendor','Vehicle No.','DC No.','GRS No.','Items','Status'];
    const rows = filtered.map(g => [
      g.ign_number, g.date_time ? dayjs(g.date_time).format('DD-MM-YYYY HH:mm') : '',
      g.project_name, g.vendor_name || g.supplier_name || '', g.vehicle_no || '',
      g.dc_number || '', g.grs_number || '', g.item_count || 0, g.status,
    ]);
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a'); a.href = url;
    a.download = `IGN_${dayjs().format('YYYY-MM-DD')}.csv`; a.click();
    URL.revokeObjectURL(url); toast.success('CSV exported');
  };

  return (
    <div style={{ background: Theme.pageBg, minHeight: '100vh' }}>
      <PageHeader
        title="Inward Goods Note"
        subtitle="Inspection receipt with inventory posting on approval"
        breadcrumbs={[{ label: 'Stores' }, { label: 'IGN' }]}
        actions={
          <>
            <button onClick={() => refetch()} className="w-9 h-9 flex items-center justify-center rounded-lg transition"
              style={{ background: 'rgba(255,255,255,0.10)', border: '1px solid rgba(255,255,255,0.20)', color: '#fff' }}>
              <RefreshCw size={14} />
            </button>
            <button onClick={exportCSV} className="flex items-center gap-2 px-3 py-2 text-xs font-medium rounded-lg transition"
              style={{ background: 'rgba(255,255,255,0.10)', border: '1px solid rgba(255,255,255,0.20)', color: '#fff' }}>
              <Download size={14} /> Export
            </button>
            <button onClick={() => setShowForm(true)} className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition shadow-sm"
              style={{ background: '#fff', color: Theme.navyDark, border: '1px solid rgba(255,255,255,0.4)' }}>
              <Plus size={14} /> New IGN
            </button>
          </>
        }
      />

      <div className="p-6 md:p-8 max-w-full mx-auto">
        {/* KPI summary cards — also act as status filters */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
          {[
            { key: 'all',       label: 'Total IGNs', value: ignList.length,   icon: FileText,     topbar: 'before:bg-slate-400',   soft: 'bg-slate-100',  text: 'text-slate-600' },
            { key: 'pending',   label: 'Pending',    value: counts.pending,   icon: Clock,        topbar: 'before:bg-amber-500',   soft: 'bg-amber-50',   text: 'text-amber-600' },
            { key: 'inspected', label: 'Inspected',  value: counts.inspected, icon: Eye,          topbar: 'before:bg-blue-500',    soft: 'bg-blue-50',    text: 'text-blue-600' },
            { key: 'approved',  label: 'Approved',   value: counts.approved,  icon: CheckCircle2, topbar: 'before:bg-emerald-500', soft: 'bg-emerald-50', text: 'text-emerald-600' },
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

        {counts.pending > 0 && (
          <div className="mb-4 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-center gap-3">
            <Clock size={16} className="text-amber-600 flex-shrink-0" />
            <span className="text-sm font-medium text-amber-800">
              {counts.pending} IGN{counts.pending > 1 ? 's' : ''} pending approval
            </span>
            <button onClick={() => setStatusFilter('pending')} className="ml-auto text-xs font-medium text-amber-700 underline">Review now →</button>
          </div>
        )}

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
              placeholder="Search IGN, supplier, DC…"
              className="h-9 pl-9 pr-4 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700 outline-none focus:border-indigo-400 transition w-64" />
          </div>
          <select value={projectFilter} onChange={e => setProjectFilter(e.target.value)}
            className="h-9 bg-slate-50 border border-slate-200 rounded-lg px-3 text-sm text-slate-700 outline-none focus:border-indigo-400">
            <option value="">All Projects</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <span className="ml-auto text-xs text-slate-500 font-medium">
            {filtered.length} <span className="text-slate-400">of {ignList.length}</span>
          </span>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  {['IGN No.','Date & Time','Project','Supplier/Vendor','Vehicle No.','DC No.','GRS No.','Items','Status',''].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase tracking-wider whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {isLoading ? (
                  [...Array(4)].map((_, i) => (
                    <tr key={i}><td colSpan={10} className="px-4 py-3">
                      <div className="h-5 bg-slate-100 animate-pulse rounded w-full" />
                    </td></tr>
                  ))
                ) : filtered.map(ign => (
                  <tr key={ign.id} onClick={() => setSelectedId(ign.id)}
                    className={clsx('cursor-pointer hover:bg-indigo-50/30 transition-colors group border-l-2',
                      ign.status === 'approved' ? 'border-l-emerald-400'
                        : ign.status === 'inspected' ? 'border-l-blue-400'
                        : ign.status === 'cancelled' ? 'border-l-red-300'
                        : 'border-l-amber-400')}>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center flex-shrink-0">
                          <ClipboardCheck className="w-3.5 h-3.5 text-blue-600" />
                        </div>
                        <span className="text-xs font-medium font-mono text-indigo-700 group-hover:underline">{ign.ign_number}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-xs text-slate-500">
                      {ign.date_time ? dayjs(ign.date_time).format('DD-MM-YYYY HH:mm') : '—'}
                    </td>
                    <td className="px-4 py-3 text-xs font-medium text-slate-900 max-w-[130px] truncate">{ign.project_name}</td>
                    <td className="px-4 py-3 text-xs text-slate-600 max-w-[120px] truncate">{ign.vendor_name || ign.supplier_name || '—'}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        <Truck className="w-3 h-3 text-slate-400 shrink-0" />
                        <span className="text-xs font-mono text-slate-700">{ign.vehicle_no || '—'}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-xs font-mono text-slate-600">{ign.dc_number || '—'}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-xs font-mono text-slate-600">{ign.grs_number || '—'}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                        {ign.item_count || 0} items
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap"><StatusBadge status={ign.status} /></td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {isSuperAdmin && (
                          <button onClick={(e) => handleDelete(ign, e)} title="Delete IGN"
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
                  <tr><td colSpan={10} className="py-16 text-center">
                    <ClipboardList className="w-8 h-8 text-slate-300 mx-auto mb-3" />
                    <p className="text-sm font-medium text-slate-700">No IGNs found</p>
                    <p className="text-xs text-slate-400 mt-1">Adjust filters or create a new IGN.</p>
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-2.5 border-t border-slate-100 bg-slate-50 text-xs text-slate-500">
            Showing {filtered.length} of {ignList.length} Inward Goods Notes
          </div>
        </div>

        {selectedId && detailedIGN && (
          <IGNDetailPanel
            ign={detailedIGN}
            onClose={() => setSelectedId(null)}
            onApprove={() => approveMutation.mutate(selectedId)}
            approveLoading={approveMutation.isPending}
            onInspect={() => inspectMutation.mutate(selectedId)}
            inspectLoading={inspectMutation.isPending}
            onCancel={() => cancelMutation.mutate(selectedId)}
            cancelLoading={cancelMutation.isPending}
            isSuperAdmin={isSuperAdmin}
            onDelete={() => handleDelete(detailedIGN)}
            deleteLoading={deleteMutation.isPending}
          />
        )}

        {showForm && (
          <IGNForm
            onClose={() => { setShowForm(false); window.history.replaceState({}, '', window.location.pathname); }}
            projects={projects}
            qc={qc}
            fromGrsId={new URLSearchParams(window.location.search).get('from_grs')}
          />
        )}
      </div>
    </div>
  );
}

/* ── IGN Create Form ──────────────────────────────────────────────────────── */
const IGN_STEPS = ['Header Details', 'Materials & Inspection', 'Invoice & Review'];

function IGNWizardSteps({ step }) {
  return (
    <div className="flex items-center gap-1 px-6 border-b border-slate-200 bg-white flex-shrink-0 overflow-x-auto">
      {IGN_STEPS.map((label, i) => {
        const n = i + 1;
        const done   = n < step;
        const active = n === step;
        return (
          <div key={label} className={clsx(
            'flex items-center gap-2 py-2.5 pr-5 text-xs font-semibold whitespace-nowrap',
            done ? 'text-emerald-600' : active ? 'text-blue-600' : 'text-slate-400'
          )}>
            <span className={clsx(
              'w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0',
              done ? 'bg-emerald-500 text-white' : active ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-500'
            )}>
              {done ? <CheckCircle2 size={11} /> : n}
            </span>
            {label}
            {n < IGN_STEPS.length && <ChevronRight size={13} className="text-slate-300 ml-2" />}
          </div>
        );
      })}
    </div>
  );
}

function IGNForm({ onClose, projects, qc, fromGrsId }) {
  const emptyItem = () => ({
    invoice_no: '', material_name: '', unit: '',
    qty_as_per_dc: '', qty_inspected: '', qty_rejected: '', remarks: '',
    rate: '', batch_number: '', expiry_date: '', quality_remarks: '',
    use_thumb_rule: false, physical_qty: '', physical_unit: 'Nos', conversion_factor: '',
    po_item_id: null,
  });

  const [form, setForm] = useState({
    project_id: '', vendor_id: '', supplier_name: '',
    po_id: '', po_number: '',
    vehicle_no: '', dc_number: '', bill_number: '',
    date_time: dayjs().format('YYYY-MM-DDTHH:mm'),
    grs_id: '', grs_number: '',
    inspected_by: '', stores_incharge: '',
    driver_name: '', gate_pass_no: '', wb_slip_no: '', site_location: 'main',
    remarks: '', issues_notes: '', inspection_notes: '',
  });
  const [items, setItems] = useState([emptyItem()]);
  // When items are sourced from a linked GRS, the PO auto-populate effect must NOT
  // overwrite them with the full PO line list. Selecting a GRS also sets po_id (to
  // link the bill), which would otherwise trigger the PO effect and clobber the
  // GRS-received items. This ref guards against that race.
  const itemsFromGrsRef = useRef(false);
  const [createBill, setCreateBill] = useState(false);
  const emptyBillForm = () => ({
    inv_number: '', inv_date: '', tax_mode: 'intrastate', gst_pct: '18',
    tax_inclusive: false,
    transport_charges: '', transport_gst_pct: '18', transport_desc: '',
    other_charges: '', other_charges_desc: '',
  });
  const [bills, setBills] = useState([emptyBillForm()]);
  const [allGstOverrides, setAllGstOverrides] = useState([{}]);

  // Vendors
  const { data: vendors = [] } = useQuery({
    queryKey: ['vendors'],
    queryFn: () => vendorAPI.list().then(r => r.data?.data ?? r.data ?? []).catch(() => []),
  });

  // Inventory lookup for material combobox
  const { data: inventoryItems = [] } = useQuery({
    queryKey: ['inventory-lookup'],
    queryFn: () => inventoryAPI.itemsLookup().then(r => r.data?.data ?? []),
    staleTime: 5 * 60 * 1000,
  });

  // Released POs
  const { data: releasedPOs = [] } = useQuery({
    queryKey: ['po-released-ign', form.project_id, form.vendor_id],
    queryFn: () => poAPI.list({
      project_id: form.project_id || undefined,
      vendor_id:  form.vendor_id  || undefined,
      status: 'approved',
    }, { skipProjectInject: true })
      .then(r => r.data?.data ?? r.data ?? []).catch(() => []),
    enabled: !!(form.project_id || form.vendor_id),
  });

  // Full PO detail with items
  const { data: selectedPODetail } = useQuery({
    queryKey: ['po-detail-ign', form.po_id],
    queryFn: () => poAPI.get(form.po_id).then(r => r.data?.data ?? r.data),
    enabled: !!form.po_id,
  });

  // Pre-populate items when PO detail loads
  useEffect(() => {
    if (!selectedPODetail?.items?.length) return;
    const poItems = selectedPODetail.items;
    const norm = (s) => (s || '').trim().toLowerCase();

    // Items received from a linked GRS are the source of truth for WHAT arrived,
    // but the rate must still come from the PO. Merge the PO rate (and po_item_id
    // for linkage) into the GRS items by matching material name — don't replace
    // the list with the full PO lines.
    if (itemsFromGrsRef.current) {
      setItems(prev => prev.map(it => {
        const match = poItems.find(p => norm(p.material_name) === norm(it.material_name));
        if (!match) return it;
        return {
          ...it,
          rate: it.rate || (match.rate != null ? String(match.rate) : ''),
          unit: normalizeUnit(it.unit || match.unit) || 'Nos',
          po_item_id: it.po_item_id || match.id || null,
        };
      }));
      return;
    }

    // No GRS link — populate the full PO line list with rates.
    setItems(poItems.map(it => ({
      ...emptyItem(),
      material_name: it.material_name || '',
      unit: normalizeUnit(it.unit) || 'Nos',
      rate: it.rate ? String(it.rate) : '',
      po_item_id: it.id || null,
    })));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPODetail?.id]);

  // Load GRS entries for linking
  const { data: grsList = [] } = useQuery({
    queryKey: ['grs-list', form.project_id],
    queryFn: () => grsAPI.list(form.project_id ? { project_id: form.project_id } : {}).then(r => r.data?.data ?? []).catch(() => []),
    enabled: !!form.project_id,
  });

  // Pull the PO rate into GRS-sourced items. The GRS carries WHAT/HOW-MUCH arrived
  // (material + qty); the rate must come from the PO. Match by material name so the
  // user never has to re-enter a rate that's already agreed on the PO.
  const mergePoRatesIntoGrsItems = async (grsItems, poId) => {
    if (!poId) return grsItems;
    try {
      const res = await poAPI.get(poId);
      const po = res.data?.data ?? res.data;
      const poItems = po?.items || [];
      const norm = (s) => (s || '').trim().toLowerCase();
      return grsItems.map(it => {
        const m = poItems.find(p => norm(p.material_name) === norm(it.material_name));
        if (!m) return it;
        return {
          ...it,
          rate: it.rate || (m.rate != null ? String(m.rate) : ''),
          unit: normalizeUnit(it.unit || m.unit),
          po_item_id: it.po_item_id || m.id || null,
        };
      });
    } catch (_) { return grsItems; }
  };

  // Pre-fill from GRS when opened via quick-link
  useEffect(() => {
    if (!fromGrsId) return;
    (async () => {
      try {
        const res = await grsAPI.get(fromGrsId);
        const detail = res.data?.data ?? res.data;
        setField('grs_id', detail.id);
        setField('grs_number', detail.grs_number || '');
        if (detail.project_id) setField('project_id', detail.project_id);
        if (detail.vehicle_no) setField('vehicle_no', detail.vehicle_no);
        if (detail.vendor_name) setField('supplier_name', detail.vendor_name);
        if (detail.po_number) setField('po_number', detail.po_number);
        if (detail.po_id) setField('po_id', detail.po_id);
        let grsItems = (detail.items || []).filter(it => it.particulars?.trim()).map(it => ({
          ...emptyItem(),
          material_name: it.particulars || '',
          unit: it.unit || '',
          qty_as_per_dc: it.quantity ? String(it.quantity) : '',
        }));
        if (grsItems.length > 0) {
          grsItems = await mergePoRatesIntoGrsItems(grsItems, detail.po_id);
          itemsFromGrsRef.current = true;
          setItems(grsItems);
        }
      } catch (_) {}
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromGrsId]);

  const createMutation = useMutation({
    mutationFn: (d) => ignAPI.create(d),
    onSuccess: (response) => {
      const bls = response?.data?.bills;
      const bl  = response?.data?.bill;
      const variances = response?.data?.rate_variances || [];
      const msg = bls?.length > 1
        ? `IGN created · ${bls.length} bills added (${bls.map(b => b.sl_number).join(', ')})`
        : bl
          ? `IGN created · Bill ${bl.sl_number} added to tracker`
          : 'IGN created — pending approval';
      toast.success(msg);
      if (variances.length > 0) {
        toast(`Rate variance detected on ${variances.length} item(s) vs PO rate`, { icon: '⚠️' });
      }
      qc.invalidateQueries({ queryKey: ['ign-list'] });
      onClose();
    },
    onError: (e) => toast.error(e?.response?.data?.error || 'Failed to create IGN'),
  });

  const setField = (k, v) => setForm(p => ({ ...p, [k]: v }));
  const updateItem = (idx, k, v) => setItems(p => p.map((it, i) => i === idx ? { ...it, [k]: v } : it));
  const addRow    = () => setItems(p => [...p, emptyItem()]);
  const removeRow = (idx) => { if (items.length > 1) setItems(p => p.filter((_, i) => i !== idx)); };

  const handleGrsSelect = async (grsId) => {
    setField('grs_id', grsId);
    if (!grsId) { setField('grs_number', ''); itemsFromGrsRef.current = false; return; }
    const grs = grsList.find(g => g.id === grsId);
    setField('grs_number', grs?.grs_number || '');
    if (grs?.vehicle_no) setField('vehicle_no', grs.vehicle_no);
    try {
      const res = await grsAPI.get(grsId);
      const detail = res.data?.data ?? res.data;
      if (detail.po_number) setField('po_number', detail.po_number);
      if (detail.po_id) setField('po_id', detail.po_id);
      if (detail.vendor_name) setField('supplier_name', detail.vendor_name);
      let grsItems = (detail.items || []).filter(it => it.particulars?.trim()).map(it => ({
        ...emptyItem(),
        material_name: it.particulars || '',
        unit: normalizeUnit(it.unit),
        qty_as_per_dc: it.quantity ? String(it.quantity) : '',
      }));
      if (grsItems.length > 0) {
        grsItems = await mergePoRatesIntoGrsItems(grsItems, detail.po_id);
        itemsFromGrsRef.current = true;
        setItems(grsItems);
        toast.success(`${grsItems.length} item(s) loaded from GRS`);
      }
    } catch (_) {}
  };

  function handlePOSelect(poId) {
    // Explicit PO selection means the user wants the PO line list — release the
    // GRS guard so the PO auto-populate effect can run.
    itemsFromGrsRef.current = false;
    if (!poId) {
      setForm(p => ({ ...p, po_id: '', po_number: '' }));
      setItems([emptyItem()]);
      return;
    }
    const po = releasedPOs.find(p => p.id === poId);
    setForm(prev => ({
      ...prev,
      po_id: poId,
      po_number: po?.po_number || '',
      vendor_id: po?.vendor_id || prev.vendor_id,
    }));
  }

  const setBillField = (billIdx, k, v) => setBills(bs => bs.map((b, i) => i === billIdx ? { ...b, [k]: v } : b));
  const addBill = () => { setBills(bs => [...bs, emptyBillForm()]); setAllGstOverrides(gs => [...gs, {}]); };
  const removeBill = (idx) => { if (bills.length > 1) { setBills(bs => bs.filter((_,i) => i !== idx)); setAllGstOverrides(gs => gs.filter((_,i) => i !== idx)); } };

  // Live bill calculation
  const calcBillAmounts = (billIdx) => {
    const b = bills[billIdx] || {};
    const overrides = allGstOverrides[billIdx] || {};
    const defaultGst = parseFloat(b.gst_pct || '18');
    const mode = b.tax_mode || 'intrastate';
    const inclusive = !!b.tax_inclusive;
    let basic = 0, cgst = 0, sgst = 0, igst = 0;
    items.filter(it => it.material_name?.trim()).forEach((it, i) => {
      const qty  = parseFloat(it.qty_inspected || it.qty_as_per_dc || 0);
      const rate = parseFloat(it.rate || 0);
      const gstPct = parseFloat(overrides[String(i)] ?? defaultGst);
      // If rate is tax-inclusive, back-calculate the basic (ex-GST) amount
      const li_inclusive = qty * rate;
      const li_basic = inclusive ? li_inclusive / (1 + gstPct / 100) : li_inclusive;
      basic += li_basic;
      if (mode === 'interstate') igst  += li_basic * gstPct / 100;
      else { cgst += li_basic * gstPct / 200; sgst += li_basic * gstPct / 200; }
    });
    const tc = parseFloat(b.transport_charges) || 0;
    const tgst = tc * parseFloat(b.transport_gst_pct || '18') / 100;
    const oc = parseFloat(b.other_charges) || 0;
    const gst = cgst + sgst + igst;
    return { basic, cgst, sgst, igst, gst, tc, tgst, oc, total: basic + gst + tc + tgst + oc };
  };

  const submit = () => {
    if (!form.project_id) return toast.error('Select a project');
    const validItems = items.filter(it => it.material_name?.trim());
    if (!validItems.length) return toast.error('Add at least one item');
    if (createBill) {
      for (let i = 0; i < bills.length; i++) {
        if (!bills[i].inv_date) return toast.error(`Invoice Date is required for Invoice ${i + 1}`);
      }
    }
    const payload = {
      ...form,
      vendor_id: form.vendor_id || null,
      po_id: form.po_id || null,
      items: validItems.map(it => ({
        invoice_no:    it.invoice_no    || null,
        material_name: it.material_name,
        unit:          it.unit          || null,
        qty_as_per_dc: it.qty_as_per_dc  ? parseFloat(it.qty_as_per_dc)  : null,
        qty_inspected: it.qty_inspected  ? parseFloat(it.qty_inspected)  : null,
        qty_rejected:  it.qty_rejected   ? parseFloat(it.qty_rejected)   : null,
        remarks:       it.remarks       || null,
        rate:          it.rate          ? parseFloat(it.rate) : 0,
        batch_number:  it.batch_number  || null,
        expiry_date:   it.expiry_date   || null,
        quality_remarks: it.quality_remarks || null,
        po_item_id:    it.po_item_id    || null,
        physical_qty:  it.use_thumb_rule && it.physical_qty ? parseFloat(it.physical_qty) : null,
        physical_unit: it.use_thumb_rule ? it.physical_unit : null,
        conversion_factor: it.use_thumb_rule && it.conversion_factor ? parseFloat(it.conversion_factor) : 1,
      })),
      ...(createBill ? {
        bills: bills.map((b, i) => ({
          ...b,
          item_gst_overrides: allGstOverrides[i] || {},
        }))
      } : {}),
    };
    createMutation.mutate(payload);
  };

  const [step, setStep] = useState(1);
  const validItemCount = items.filter(i => i.material_name?.trim()).length;

  return (
    <div className="fixed inset-0 z-[60] bg-white flex flex-col overflow-hidden" style={{ fontFamily: "'IBM Plex Sans', system-ui, sans-serif" }}>

      {/* ── Top bar (MRS-style white header) ── */}
      <div className="flex items-center justify-between px-6 py-3.5 flex-shrink-0 bg-white border-b border-slate-200">
        <div className="flex items-center gap-3">
          <div className="text-xs text-slate-400">Stores <span className="text-slate-300">›</span> Inward Goods Note <span className="text-slate-300">›</span> <b className="text-slate-700">New IGN</b></div>
          <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200 text-[11px] font-mono">Auto-generated</span>
        </div>
        <button onClick={onClose} className="w-8 h-8 rounded-md flex items-center justify-center text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors">
          <X size={16} />
        </button>
      </div>

      {/* ── Wizard step bar ── */}
      <IGNWizardSteps step={step} />

      {/* ── Body ── */}
      <div className="flex-1 overflow-y-auto p-5 bg-slate-50">
        <div className="flex flex-col lg:flex-row gap-4">

          {/* ── Main column ── */}
          <div className="flex-1 min-w-0 space-y-4">

          {/* ════ STEP 1 — Header Details ════ */}
          {step === 1 && <>

          {/* Delivery Info */}
          <div className={Z_CARD}>
            <h3 className={Z_HEAD}><Truck size={13} className="inline mr-1.5 text-blue-500" />Delivery Information</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5 p-4">
              <div className="col-span-2 space-y-1.5">
                <label className="text-xs font-medium text-slate-500">Project *</label>
                <select value={form.project_id} onChange={e => { setField('project_id', e.target.value); setField('grs_id', ''); setField('grs_number', ''); }} className={Z_INP}>
                  <option value="">Select project…</option>
                  {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-500">Date & Time *</label>
                <input type="datetime-local" value={form.date_time} onChange={e => setField('date_time', e.target.value)} className={Z_INP} />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-500">Vehicle No.</label>
                <input type="text" value={form.vehicle_no} onChange={e => setField('vehicle_no', e.target.value.toUpperCase())} placeholder="KA01AB1234" className={Z_INP} />
              </div>
              <div className="col-span-2 space-y-1.5">
                <label className="text-xs font-medium text-slate-500">Vendor</label>
                <SearchableSelect
                  options={vendors.map(v => ({ value: v.id, label: v.name }))}
                  value={form.vendor_id}
                  onChange={val => setField('vendor_id', val)}
                  placeholder="Select or search vendor…"
                />
              </div>
              <div className="col-span-2 space-y-1.5">
                <label className="text-xs font-medium text-slate-500">Supplier Name (manual)</label>
                <input type="text" value={form.supplier_name} onChange={e => setField('supplier_name', e.target.value)} placeholder="Supplier / vendor name" className={Z_INP} />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-500">DC No.</label>
                <input type="text" value={form.dc_number} onChange={e => setField('dc_number', e.target.value)} placeholder="Delivery challan no." className={Z_INP} />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-500">Bill / Invoice No.</label>
                <input type="text" value={form.bill_number} onChange={e => setField('bill_number', e.target.value)} placeholder="Bill / invoice no." className={Z_INP} />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-500">Driver Name</label>
                <input type="text" value={form.driver_name} onChange={e => setField('driver_name', e.target.value)} placeholder="Driver name" className={Z_INP} />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-500">Gate Pass No.</label>
                <input type="text" value={form.gate_pass_no} onChange={e => setField('gate_pass_no', e.target.value)} placeholder="Gate pass no." className={Z_INP} />
              </div>
            </div>
          </div>

          {/* PO / GRS Links */}
          <div className={Z_CARD}>
            <h3 className={Z_HEAD}><FileText size={13} className="inline mr-1.5 text-indigo-500" />Document Links</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 p-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-500">Link to PO <span className="text-slate-400 font-normal">(optional)</span></label>
                <select value={form.po_id} onChange={e => handlePOSelect(e.target.value)} className={Z_INP} disabled={!form.project_id && !form.vendor_id}>
                  <option value="">— Select Released PO —</option>
                  {releasedPOs.map(po => <option key={po.id} value={po.id}>{po.po_number} · {po.vendor_name || ''}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-500">Link to GRS <span className="text-slate-400 font-normal">(optional)</span></label>
                <select value={form.grs_id} onChange={e => handleGrsSelect(e.target.value)} className={Z_INP} disabled={!form.project_id}>
                  <option value="">— Select GRS —</option>
                  {grsList.map(g => <option key={g.id} value={g.id}>{g.grs_number} · {g.vehicle_no || 'No vehicle'}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-500">PO No. (manual)</label>
                <input type="text" value={form.po_number} onChange={e => setField('po_number', e.target.value)} placeholder="PO reference" className={Z_INP} />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-500">WB Slip No.</label>
                <input type="text" value={form.wb_slip_no} onChange={e => setField('wb_slip_no', e.target.value)} placeholder="Weighbridge slip no." className={Z_INP} />
              </div>
            </div>
          </div>

          {/* Site & Inspection */}
          <div className={Z_CARD}>
            <h3 className={Z_HEAD}><Eye size={13} className="inline mr-1.5 text-teal-500" />Site & Inspection</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 p-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-500">Site Location</label>
                <input type="text" value={form.site_location} onChange={e => setField('site_location', e.target.value)} placeholder="main" className={Z_INP} />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-500">Inspected By</label>
                <input type="text" value={form.inspected_by} onChange={e => setField('inspected_by', e.target.value)} placeholder="Inspector name" className={Z_INP} />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-500">Stores In-charge</label>
                <input type="text" value={form.stores_incharge} onChange={e => setField('stores_incharge', e.target.value)} placeholder="Stores officer name" className={Z_INP} />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-500">Issues / Problems</label>
                <textarea value={form.issues_notes} onChange={e => setField('issues_notes', e.target.value)} placeholder="Document any issues…" rows={2}
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 outline-none transition-colors focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30 resize-none" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-500">General Remarks</label>
                <textarea value={form.remarks} onChange={e => setField('remarks', e.target.value)} placeholder="General notes…" rows={2}
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 outline-none transition-colors focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30 resize-none" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-500">Inspection Notes</label>
                <textarea value={form.inspection_notes} onChange={e => setField('inspection_notes', e.target.value)} placeholder="Quality inspection observations…" rows={2}
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 outline-none transition-colors focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30 resize-none" />
              </div>
            </div>
          </div>
          </>}

          {/* ════ STEP 2 — Materials ════ */}
          {step === 2 && <>
          <div className={Z_CARD}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
              <h3 className="text-[13px] font-semibold text-slate-700 flex items-center gap-1.5">
                <Package size={13} className="text-indigo-500" /> Materials & Inspection
              </h3>
              <button onClick={addRow} className="flex items-center gap-1.5 px-3 h-7 rounded-md text-xs font-semibold text-indigo-600 bg-indigo-50 border border-indigo-100 hover:bg-indigo-100 transition">
                <Plus size={12} /> Add Row
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[900px]">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    {['Sl.','Inv. No.','Material *','Unit','Rate (₹)','As per DC','Inspected','Rejected','Remarks',''].map(h => (
                      <th key={h} className="px-2 py-2 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {items.map((it, idx) => (
                    <tr key={idx} className={parseFloat(it.qty_rejected || 0) > 0 ? 'bg-red-50/30' : 'hover:bg-slate-50'}>
                      <td className="px-2 py-2 text-xs text-slate-400 font-mono">{idx + 1}</td>
                      <td className="px-2 py-2">
                        <input value={it.invoice_no} onChange={e => updateItem(idx, 'invoice_no', e.target.value)} placeholder="INV-001"
                          className="w-20 h-8 rounded-md border border-slate-300 bg-white px-2 text-xs font-mono outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30" />
                      </td>
                      <td className="px-2 py-2 min-w-[160px]">
                        <MaterialCombobox value={it.material_name} onChange={v => updateItem(idx, 'material_name', v)}
                          options={inventoryItems.map(i => ({ label: i.material_name, value: i.material_name }))} placeholder="Material description" />
                      </td>
                      <td className="px-2 py-2">
                        <select value={it.unit} onChange={e => updateItem(idx, 'unit', e.target.value)}
                          className="w-20 h-8 rounded-md border border-slate-300 bg-white px-1 text-xs outline-none focus:border-blue-500">
                          <option value="">—</option>
                          {it.unit && !UNITS.includes(it.unit) && <option value={it.unit}>{it.unit}</option>}
                          {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                        </select>
                      </td>
                      <td className="px-2 py-2">
                        <input type="number" value={it.rate} onChange={e => updateItem(idx, 'rate', e.target.value)} placeholder="0.00" step="0.01"
                          className="w-24 h-8 rounded-md border border-slate-300 bg-white px-2 text-xs text-right font-mono outline-none focus:border-blue-500" />
                      </td>
                      {['qty_as_per_dc','qty_inspected','qty_rejected'].map(k => (
                        <td key={k} className="px-2 py-2">
                          <input type="number" value={it[k]} onChange={e => updateItem(idx, k, e.target.value)} placeholder="0"
                            className={clsx(
                              'w-20 h-8 rounded-md border px-2 text-xs text-right font-mono outline-none focus:ring-1',
                              k === 'qty_rejected' && parseFloat(it[k] || 0) > 0
                                ? 'border-red-300 bg-red-50 text-red-700 focus:border-red-400 focus:ring-red-300'
                                : 'border-slate-300 bg-white focus:border-blue-500 focus:ring-blue-500/30'
                            )} />
                        </td>
                      ))}
                      <td className="px-2 py-2">
                        <input value={it.remarks} onChange={e => updateItem(idx, 'remarks', e.target.value)} placeholder="Notes…"
                          className="w-full h-8 rounded-md border border-slate-300 bg-white px-2 text-xs outline-none focus:border-blue-500" />
                      </td>
                      <td className="px-2 py-2">
                        <button onClick={() => removeRow(idx)} disabled={items.length === 1}
                          className="w-7 h-7 rounded-md border border-slate-200 flex items-center justify-center text-slate-400 hover:text-red-500 hover:border-red-200 hover:bg-red-50 disabled:opacity-30 transition">
                          <X size={12} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          </>}

          {/* ════ STEP 3 — Invoice Bill & Review ════ */}
          {step === 3 && <>
          <div className={Z_CARD}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
              <h3 className="text-[13px] font-semibold text-slate-700 flex items-center gap-1.5">
                <IndianRupee size={13} className="text-emerald-500" /> Invoice Bill
              </h3>
              <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
                <input type="checkbox" checked={createBill} onChange={e => setCreateBill(e.target.checked)} className="w-4 h-4 accent-blue-600 rounded" />
                Create Invoice Bill
              </label>
            </div>
            {createBill && bills.map((b, billIdx) => {
              const calc = calcBillAmounts(billIdx);
              return (
                <div key={billIdx} className="p-4 border-b border-slate-100 last:border-0">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-semibold text-slate-700">Invoice {billIdx + 1}</span>
                    {bills.length > 1 && (
                      <button onClick={() => removeBill(billIdx)} className="text-xs text-red-500 hover:underline">Remove</button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
                    {[
                      ['Invoice No.', 'inv_number', 'text', 'INV-001'],
                      ['Invoice Date *', 'inv_date', 'date', ''],
                      ['GST %', 'gst_pct', 'number', '18'],
                    ].map(([lbl, key, type, ph]) => (
                      <div key={key} className="space-y-1.5">
                        <label className="text-xs font-medium text-slate-500">{lbl}</label>
                        <input type={type} value={b[key]} onChange={e => setBillField(billIdx, key, e.target.value)} placeholder={ph} className={Z_INP} />
                      </div>
                    ))}
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-slate-500">Tax Mode</label>
                      <select value={b.tax_mode} onChange={e => setBillField(billIdx, 'tax_mode', e.target.value)} className={Z_INP}>
                        <option value="intrastate">Intrastate (CGST + SGST)</option>
                        <option value="interstate">Interstate (IGST)</option>
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-slate-500">Rate Type</label>
                      <label className="flex items-center gap-2 cursor-pointer h-9 px-2 border border-slate-200 rounded-md bg-white text-xs text-slate-700">
                        <input type="checkbox" checked={!!b.tax_inclusive} onChange={e => setBillField(billIdx, 'tax_inclusive', e.target.checked)} className="accent-indigo-600" />
                        Tax Inclusive
                      </label>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-slate-500">Transport Charges</label>
                      <input type="number" value={b.transport_charges} onChange={e => setBillField(billIdx, 'transport_charges', e.target.value)} placeholder="0" className={Z_INP} />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-slate-500">Transport GST %</label>
                      <input type="number" value={b.transport_gst_pct} onChange={e => setBillField(billIdx, 'transport_gst_pct', e.target.value)} placeholder="18" className={Z_INP} />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-slate-500">Other Charges</label>
                      <input type="number" value={b.other_charges} onChange={e => setBillField(billIdx, 'other_charges', e.target.value)} placeholder="0" className={Z_INP} />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-slate-500">Other Charges Desc.</label>
                      <input type="text" value={b.other_charges_desc} onChange={e => setBillField(billIdx, 'other_charges_desc', e.target.value)} placeholder="e.g. Packing" className={Z_INP} />
                    </div>
                  </div>
                  {/* Bill summary */}
                  <div className="bg-slate-50 border border-slate-200 rounded-md p-3 text-xs space-y-1 font-mono">
                    <div className="flex justify-between"><span className="text-slate-600">Basic</span><span>₹{inr(calc.basic)}</span></div>
                    {b.tax_mode === 'intrastate' ? <>
                      <div className="flex justify-between"><span className="text-slate-600">CGST</span><span>₹{inr(calc.cgst)}</span></div>
                      <div className="flex justify-between"><span className="text-slate-600">SGST</span><span>₹{inr(calc.sgst)}</span></div>
                    </> : <div className="flex justify-between"><span className="text-slate-600">IGST</span><span>₹{inr(calc.igst)}</span></div>}
                    {calc.tc > 0 && <div className="flex justify-between"><span className="text-slate-600">Transport + GST</span><span>₹{inr(calc.tc + calc.tgst)}</span></div>}
                    {calc.oc > 0 && <div className="flex justify-between"><span className="text-slate-600">Other Charges</span><span>₹{inr(calc.oc)}</span></div>}
                    <div className="flex justify-between border-t border-slate-200 pt-1 font-bold text-slate-800">
                      <span>Grand Total</span><span>₹{inr(calc.total)}</span>
                    </div>
                  </div>
                </div>
              );
            })}
            {createBill && (
              <div className="p-4">
                <button onClick={addBill} className="flex items-center gap-2 text-xs text-indigo-600 font-medium border border-dashed border-indigo-200 rounded-md px-4 py-2 hover:bg-indigo-50 transition">
                  <Plus size={12} /> Add Another Invoice
                </button>
              </div>
            )}
          </div>
          </>}
          </div>{/* end main column */}

          {/* ── Right summary panel ── */}
          <div className="lg:w-72 xl:w-80 shrink-0 space-y-3">

            {/* Delivery snapshot */}
            <div className="bg-white border border-slate-200 rounded-md p-4 shadow-sm">
              <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-3">Entry Summary</p>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-500">Project</span>
                  <span className="font-medium text-slate-800 text-right max-w-[160px] truncate">
                    {projects.find(p => p.id === form.project_id)?.name || '—'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Vendor</span>
                  <span className="font-medium text-slate-800 text-right max-w-[160px] truncate">
                    {vendors.find(v => v.id === form.vendor_id)?.name || form.supplier_name || '—'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Vehicle</span>
                  <span className="font-mono font-medium text-slate-800">{form.vehicle_no || '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">DC No.</span>
                  <span className="font-mono font-medium text-slate-800">{form.dc_number || '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Linked PO</span>
                  <span className="font-mono font-medium text-slate-800 truncate max-w-[120px]">{form.po_number || (form.po_id ? 'Linked' : '—')}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Linked GRS</span>
                  <span className="font-mono font-medium text-slate-800 truncate max-w-[120px]">{form.grs_number || (form.grs_id ? 'Linked' : '—')}</span>
                </div>
              </div>
            </div>

            {/* Items summary */}
            <div className="bg-white border border-slate-200 rounded-md p-4 shadow-sm">
              <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-3">Materials</p>
              <div className="text-2xl font-bold text-slate-900 tabular-nums">{validItemCount}</div>
              <p className="text-xs text-slate-400 mt-0.5">item{validItemCount !== 1 ? 's' : ''} ready to submit</p>
              {items.filter(i => parseFloat(i.qty_rejected || 0) > 0).length > 0 && (
                <div className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-red-600 bg-red-50 border border-red-200 rounded-full px-2.5 py-0.5">
                  <AlertTriangle size={10} /> {items.filter(i => parseFloat(i.qty_rejected || 0) > 0).length} rejection(s)
                </div>
              )}
              {createBill && (
                <div className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-full px-2.5 py-0.5 ml-1">
                  <IndianRupee size={10} /> {bills.length} invoice{bills.length > 1 ? 's' : ''}
                </div>
              )}
            </div>

            {/* For Office Use note */}
            <div className="bg-blue-50 border border-blue-100 rounded-md p-3">
              <p className="text-[11px] text-blue-700 font-medium">
                <strong>For Office Use</strong> — After saving, the Procurement Officer can open this IGN and click <em>Approve</em> to post inventory.
              </p>
            </div>
          </div>

        </div>{/* end flex row */}
      </div>{/* end body */}

      {/* ── Footer ── */}
      <div className="flex-shrink-0 border-t border-slate-200 bg-white px-6 py-3.5 flex items-center justify-between">
        <div className="text-xs text-slate-400">
          Step {step} of {IGN_STEPS.length} &mdash; <span className="font-medium text-slate-600">{IGN_STEPS[step - 1]}</span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={onClose} className="px-4 h-9 rounded-md border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors">
            Cancel
          </button>
          {step > 1 && (
            <button onClick={() => setStep(s => s - 1)} className="px-4 h-9 rounded-md border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors">
              ← Back
            </button>
          )}
          {step < IGN_STEPS.length ? (
            <button onClick={() => setStep(s => s + 1)} className="px-5 h-9 rounded-md bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition-colors shadow-sm">
              Next →
            </button>
          ) : (
            <button onClick={submit} disabled={createMutation.isPending}
              className="px-5 h-9 rounded-md bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 transition-colors shadow-sm disabled:opacity-50">
              {createMutation.isPending ? 'Saving…' : 'Create IGN →'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
