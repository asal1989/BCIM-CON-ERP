// src/pages/stores/IGNPage.jsx — Inward Goods Note
import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ClipboardCheck, Plus, X, Search, Download, RefreshCw,
  Clock, CheckCircle2, Package, ChevronRight, FileText,
  Truck, ClipboardList, AlertTriangle,
} from 'lucide-react';
import { clsx } from 'clsx';
import dayjs from 'dayjs';
import { ignAPI, projectAPI, grsAPI, poAPI } from '../../api/client';
import { FIELD_HL } from '../../constants/fieldStyles';
import toast from 'react-hot-toast';
import { PageHeader, KpiCard as ThemeKpiCard, Theme } from '../../theme';
import { CONSTRUCTION_UNITS as UNITS } from '../../constants/units';

const fmt = n => n != null ? Number(n).toLocaleString('en-IN', { minimumFractionDigits: 3, maximumFractionDigits: 3 }) : '—';

const STATUS_CONFIG = {
  pending:  { label: 'Pending',  color: 'bg-amber-50 text-amber-700 border-amber-200',    icon: Clock },
  approved: { label: 'Approved', color: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: CheckCircle2 },
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
function IGNDetailPanel({ ign, onClose, onApprove, approveLoading }) {
  if (!ign) return null;
  const items = ign.items || [];
  const totalRejected = items.reduce((s, it) => s + parseFloat(it.qty_rejected || 0), 0);

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="w-full max-w-2xl bg-white shadow-2xl flex flex-col overflow-hidden">

        <div className="bg-slate-900 px-6 py-4 flex items-start justify-between flex-shrink-0">
          <div>
            <div className="text-[10px] text-slate-400 font-medium uppercase tracking-widest mb-1">Inward Goods Note</div>
            <h2 className="text-xl font-medium text-white font-mono">{ign.ign_number}</h2>
            <p className="text-sm text-slate-300 font-medium mt-0.5">{ign.project_name}</p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <StatusBadge status={ign.status} />
            <button onClick={onClose} className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center text-slate-300 hover:text-white transition">
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5 bg-slate-50">
          {/* Meta */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {[
              ['Supplier',       ign.supplier_name  || '—'],
              ['Vehicle No.',    ign.vehicle_no     || '—'],
              ['DC No.',         ign.dc_number      || '—'],
              ['Bill No.',       ign.bill_number    || '—'],
              ['PO No.',         ign.po_number      || '—'],
              ['GRS No.',        ign.grs_number     || '—'],
              ['Date & Time',    ign.date_time ? dayjs(ign.date_time).format('DD MMM YYYY, HH:mm') : '—'],
              ['Inspected By',   ign.inspected_by   || '—'],
              ['Stores In-charge', ign.stores_incharge || '—'],
            ].map(([lbl, val]) => (
              <div key={lbl} className="bg-white border border-slate-200 rounded-lg px-3 py-2.5">
                <div className="text-[10px] text-slate-500 font-medium uppercase tracking-wider mb-0.5">{lbl}</div>
                <div className="text-sm font-medium text-slate-900 truncate">{val}</div>
              </div>
            ))}
          </div>

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
              <span className="text-xs font-medium text-indigo-600 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded-full">
                {items.length} items
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 border-b border-slate-100">
                  <tr>
                    {['Inv. No.','Material','Unit','As per DC/Bill','After Inspection','Rejected','Remarks'].map(h => (
                      <th key={h} className="px-3 py-2 text-left font-medium text-slate-600 uppercase tracking-wider whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {items.map((it, i) => {
                    const hasRejection = parseFloat(it.qty_rejected || 0) > 0;
                    return (
                      <tr key={i} className={clsx('hover:bg-slate-50', hasRejection && 'bg-red-50/40')}>
                        <td className="px-3 py-2.5 font-mono text-slate-500 text-[11px]">{it.invoice_no || '—'}</td>
                        <td className="px-3 py-2.5 font-medium text-slate-900">{it.material_name}</td>
                        <td className="px-3 py-2.5">
                          {it.unit && <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200 text-[10px] uppercase font-medium">{it.unit}</span>}
                        </td>
                        <td className="px-3 py-2.5 font-mono text-slate-600">{fmt(it.qty_as_per_dc)}</td>
                        <td className="px-3 py-2.5 font-mono text-emerald-700 font-medium">{fmt(it.qty_inspected)}</td>
                        <td className="px-3 py-2.5 font-mono font-medium">
                          <span className={clsx(hasRejection ? 'text-red-600' : 'text-slate-400')}>
                            {fmt(it.qty_rejected)}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-slate-500">{it.remarks || '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {ign.status === 'approved' && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
              <p className="text-xs font-medium text-emerald-800">
                Approved by <strong>{ign.approved_by_name}</strong>
                {ign.approved_at && <span className="text-emerald-600 ml-2">· {dayjs(ign.approved_at).format('DD MMM YYYY, HH:mm')}</span>}
              </p>
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-slate-200 bg-white flex-shrink-0 space-y-2">
          {ign.status === 'pending' && (
            <button onClick={onApprove} disabled={approveLoading}
              className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-medium py-3 rounded-xl text-sm transition shadow-sm">
              <CheckCircle2 size={16} />
              {approveLoading ? 'Processing…' : 'Approve IGN — Stores-In-Charge Sign-off'}
            </button>
          )}
          {ign.status === 'approved' && (
            <div className="flex items-center gap-2 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-xl px-4 py-3 text-sm font-bold">
              <CheckCircle2 size={16} className="text-emerald-600" /> IGN Approved by Stores-In-Charge
            </div>
          )}
          <button onClick={onClose}
            className="w-full py-2.5 text-slate-600 font-medium text-sm border border-slate-200 rounded-xl hover:bg-slate-50 transition">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Main Page ────────────────────────────────────────────────────────────── */
export default function IGNPage() {
  const qc = useQueryClient();
  const [showForm, setShowForm]           = useState(false);
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
      toast.success('IGN approved');
      qc.invalidateQueries({ queryKey: ['ign-list'] });
      qc.invalidateQueries({ queryKey: ['ign', selectedId] });
    },
    onError: (e) => toast.error(e?.response?.data?.error || 'Failed'),
  });

  const counts = {
    pending:  ignList.filter(g => g.status === 'pending').length,
    approved: ignList.filter(g => g.status === 'approved').length,
  };

  const filtered = ignList.filter(g => {
    if (statusFilter !== 'all' && g.status !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!g.ign_number?.toLowerCase().includes(q) &&
          !g.project_name?.toLowerCase().includes(q) &&
          !g.supplier_name?.toLowerCase().includes(q) &&
          !g.vehicle_no?.toLowerCase().includes(q) &&
          !g.dc_number?.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const exportCSV = () => {
    const headers = ['IGN No.','Date','Project','Supplier','Vehicle No.','DC No.','GRS No.','Items','Status'];
    const rows = filtered.map(g => [
      g.ign_number, g.date_time ? dayjs(g.date_time).format('DD/MM/YYYY HH:mm') : '',
      g.project_name, g.supplier_name || '', g.vehicle_no || '',
      g.dc_number || '', g.grs_number || '', g.item_count || 0, g.status,
    ]);
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a'); a.href = url;
    a.download = `IGN_${dayjs().format('YYYY-MM-DD')}.csv`; a.click();
    URL.revokeObjectURL(url); toast.success('CSV exported');
  };

  const STATUS_FILTERS = [
    { key: 'all',      label: 'All',      count: ignList.length },
    { key: 'pending',  label: 'Pending',  count: counts.pending,  color: 'bg-amber-500' },
    { key: 'approved', label: 'Approved', count: counts.approved, color: 'bg-emerald-500' },
  ];

  return (
    <div style={{ background: Theme.pageBg, minHeight: '100vh' }}>
      <PageHeader
        title="Inward Goods Note"
        subtitle="Stores inspection — DC qty vs inspected vs rejected, linked to GRS"
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
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
          <ThemeKpiCard icon={FileText}     label="Total IGNs"  value={ignList.length}    color="slate" />
          <ThemeKpiCard icon={Clock}        label="Pending"     value={counts.pending}    color="amber" />
          <ThemeKpiCard icon={CheckCircle2} label="Approved"    value={counts.approved}   color="emerald" />
        </div>

        {counts.pending > 0 && (
          <div className="mb-4 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-center gap-3">
            <Clock size={16} className="text-amber-600 flex-shrink-0" />
            <span className="text-sm font-medium text-amber-800">
              {counts.pending} IGN{counts.pending > 1 ? 's' : ''} pending Stores-In-Charge approval
            </span>
            <button onClick={() => setStatusFilter('pending')} className="ml-auto text-xs font-medium text-amber-700 underline">Review now →</button>
          </div>
        )}

        <div className="bg-white border border-slate-200 rounded-xl p-3 mb-5 flex flex-wrap items-center gap-3 shadow-sm">
          <div className="flex items-center gap-1.5 flex-wrap">
            {STATUS_FILTERS.map(f => (
              <button key={f.key} onClick={() => setStatusFilter(f.key)}
                className={clsx('flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all',
                  statusFilter === f.key ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-700 border-slate-200 hover:border-slate-400'
                )}>
                {f.color && <span className={clsx('w-1.5 h-1.5 rounded-full', f.color)} />}
                {f.label}
                <span className={clsx('px-1.5 py-0.5 rounded text-[10px] font-medium',
                  statusFilter === f.key ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'
                )}>{f.count}</span>
              </button>
            ))}
          </div>
          <div className="flex-1" />
          <select value={projectFilter} onChange={e => setProjectFilter(e.target.value)}
            className="h-9 bg-slate-50 border border-slate-200 rounded-lg px-3 text-sm text-slate-700 outline-none focus:border-indigo-400">
            <option value="">All Projects</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search IGN, supplier, DC…"
              className="h-9 pl-9 pr-4 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700 outline-none focus:border-indigo-400 transition w-56" />
          </div>
          <span className="text-xs text-slate-500">{filtered.length} of {ignList.length}</span>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  {['IGN No.','Date & Time','Project','Supplier','Vehicle No.','DC No.','GRS No.','Items','Status',''].map(h => (
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
                    className="cursor-pointer hover:bg-indigo-50/30 transition-colors group">
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center flex-shrink-0">
                          <ClipboardCheck className="w-3.5 h-3.5 text-blue-600" />
                        </div>
                        <span className="text-xs font-medium font-mono text-indigo-700 group-hover:underline">{ign.ign_number}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-xs text-slate-500">
                      {ign.date_time ? dayjs(ign.date_time).format('DD MMM YYYY HH:mm') : '—'}
                    </td>
                    <td className="px-4 py-3 text-xs font-medium text-slate-900 max-w-[130px] truncate">{ign.project_name}</td>
                    <td className="px-4 py-3 text-xs text-slate-600 max-w-[120px] truncate">{ign.supplier_name || '—'}</td>
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
                      <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-indigo-500 transition-colors" />
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
          />
        )}

        {showForm && (
          <IGNForm onClose={() => setShowForm(false)} projects={projects} qc={qc} />
        )}
      </div>
    </div>
  );
}

/* ── IGN Create Form ──────────────────────────────────────────────────────── */
function IGNForm({ onClose, projects, qc }) {
  const emptyItem = () => ({
    invoice_no: '', material_name: '', unit: '',
    qty_as_per_dc: '', qty_inspected: '', qty_rejected: '', remarks: '',
  });

  const [form, setForm] = useState({
    project_id: '', supplier_name: '', po_id: '', po_number: '',
    vehicle_no: '', dc_number: '', bill_number: '',
    date_time: dayjs().format('YYYY-MM-DDTHH:mm'),
    grs_id: '', grs_number: '',
    inspected_by: '', stores_incharge: '', remarks: '',
  });
  const [items, setItems] = useState([emptyItem()]);

  // Load GRS entries for linking
  const { data: grsList = [] } = useQuery({
    queryKey: ['grs-list', form.project_id],
    queryFn: () => grsAPI.list(form.project_id ? { project_id: form.project_id } : {}).then(r => r.data?.data ?? []).catch(() => []),
    enabled: !!form.project_id,
  });

  const createMutation = useMutation({
    mutationFn: (d) => ignAPI.create(d),
    onSuccess: () => {
      toast.success('IGN created');
      qc.invalidateQueries({ queryKey: ['ign-list'] });
      onClose();
    },
    onError: (e) => toast.error(e?.response?.data?.error || 'Failed to create IGN'),
  });

  const setField = (k, v) => setForm(p => ({ ...p, [k]: v }));
  const updateItem = (idx, k, v) => setItems(p => p.map((it, i) => i === idx ? { ...it, [k]: v } : it));
  const addRow    = () => setItems(p => [...p, emptyItem()]);
  const removeRow = (idx) => { if (items.length > 1) setItems(p => p.filter((_, i) => i !== idx)); };

  // When GRS is selected, auto-fill vehicle no. and items
  const handleGrsSelect = (grsId) => {
    const grs = grsList.find(g => g.id === grsId);
    setField('grs_id', grsId);
    setField('grs_number', grs?.grs_number || '');
    if (grs?.vehicle_no) setField('vehicle_no', grs.vehicle_no);
  };

  const submit = () => {
    if (!form.project_id) return toast.error('Select a project');
    const validItems = items.filter(it => it.material_name?.trim());
    if (!validItems.length) return toast.error('Add at least one item');
    createMutation.mutate({ ...form, items: validItems });
  };

  const inp = `w-full h-10 rounded-lg px-3 text-sm font-medium outline-none transition-all border ${FIELD_HL}`;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white w-full max-w-5xl rounded-2xl flex flex-col max-h-[94vh] shadow-2xl overflow-hidden">

        <div className="bg-slate-900 px-6 py-4 flex items-center justify-between flex-shrink-0">
          <div>
            <h2 className="text-base font-semibold text-white flex items-center gap-2">
              <ClipboardCheck size={16} className="text-blue-400" /> New Inward Goods Note
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">Stores inspection — record DC qty, inspected qty, and rejections</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center text-slate-300 hover:text-white transition">
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">

          {/* Header details */}
          <div className="border border-slate-200 rounded-xl p-5">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-4">Header Details</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="col-span-2 space-y-1.5">
                <label className="text-xs font-bold text-slate-700">Project *</label>
                <select value={form.project_id} onChange={e => { setField('project_id', e.target.value); setField('grs_id', ''); setField('grs_number', ''); }} className={inp}>
                  <option value="">Select project…</option>
                  {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div className="col-span-2 space-y-1.5">
                <label className="text-xs font-bold text-slate-700">Supplier Name</label>
                <input type="text" value={form.supplier_name} onChange={e => setField('supplier_name', e.target.value)} placeholder="Supplier / vendor name" className={inp} />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700">Link to GRS</label>
                <select value={form.grs_id} onChange={e => handleGrsSelect(e.target.value)} className={inp} disabled={!form.project_id}>
                  <option value="">— Select GRS (optional) —</option>
                  {grsList.map(g => <option key={g.id} value={g.id}>{g.grs_number} · {g.vehicle_no || 'No vehicle'}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700">Vehicle No.</label>
                <input type="text" value={form.vehicle_no} onChange={e => setField('vehicle_no', e.target.value.toUpperCase())} placeholder="KA01AB1234" className={inp} />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700">DC No.</label>
                <input type="text" value={form.dc_number} onChange={e => setField('dc_number', e.target.value)} placeholder="Delivery challan no." className={inp} />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700">Bill No.</label>
                <input type="text" value={form.bill_number} onChange={e => setField('bill_number', e.target.value)} placeholder="Bill / invoice no." className={inp} />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700">PO No.</label>
                <input type="text" value={form.po_number} onChange={e => setField('po_number', e.target.value)} placeholder="PO reference" className={inp} />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700">Date & Time *</label>
                <input type="datetime-local" value={form.date_time} onChange={e => setField('date_time', e.target.value)} className={inp} />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700">Inspected By</label>
                <input type="text" value={form.inspected_by} onChange={e => setField('inspected_by', e.target.value)} placeholder="Inspector name" className={inp} />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700">Stores In-charge</label>
                <input type="text" value={form.stores_incharge} onChange={e => setField('stores_incharge', e.target.value)} placeholder="Stores officer name" className={inp} />
              </div>
            </div>
          </div>

          {/* Items */}
          <div className="border border-slate-200 rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Materials</h3>
                <p className="text-[10px] text-slate-400 mt-0.5">Enter DC quantity, after-inspection quantity, and any rejections</p>
              </div>
              <button onClick={addRow}
                className="flex items-center gap-1.5 px-3 h-7 rounded-lg text-xs font-semibold text-indigo-600 bg-indigo-50 border border-indigo-100 hover:bg-indigo-100 transition">
                <Plus size={12} /> Add Row
              </button>
            </div>
            <div className="border border-slate-200 rounded-lg overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600 w-8">Sl.</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600 w-28">Invoice No.</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600">Material *</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600 w-24">Unit</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600 w-28">As per DC/Bill</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600 w-28">After Inspection</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600 w-24">Rejected</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600">Remarks</th>
                    <th className="px-3 py-2 w-8" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {items.map((it, idx) => (
                    <tr key={idx} className={parseFloat(it.qty_rejected || 0) > 0 ? 'bg-red-50/30' : ''}>
                      <td className="px-3 py-2 text-xs text-slate-400 font-mono">{idx + 1}</td>
                      <td className="px-3 py-2">
                        <input value={it.invoice_no} onChange={e => updateItem(idx, 'invoice_no', e.target.value)}
                          placeholder="INV-001"
                          className={`w-full h-8 rounded-lg px-2 text-xs font-mono outline-none transition-all border ${FIELD_HL}`} />
                      </td>
                      <td className="px-3 py-2">
                        <input value={it.material_name} onChange={e => updateItem(idx, 'material_name', e.target.value)}
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
                      {['qty_as_per_dc','qty_inspected','qty_rejected'].map(k => (
                        <td key={k} className="px-3 py-2">
                          <input type="number" value={it[k]} onChange={e => updateItem(idx, k, e.target.value)}
                            placeholder="0"
                            className={clsx(
                              `w-full h-8 rounded-lg px-3 text-xs text-right font-mono outline-none transition-all border`,
                              k === 'qty_rejected' && parseFloat(it.qty_rejected || 0) > 0
                                ? 'bg-red-50 border-red-300 text-red-700 focus:border-red-400'
                                : FIELD_HL
                            )} />
                        </td>
                      ))}
                      <td className="px-3 py-2">
                        <input value={it.remarks} onChange={e => updateItem(idx, 'remarks', e.target.value)}
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
        </div>

        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100 bg-slate-50 flex-shrink-0">
          <span className="text-xs text-slate-500 font-semibold">
            {items.filter(i => i.material_name?.trim()).length} item(s) ready
          </span>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="px-5 h-9 rounded-lg border border-slate-200 text-sm font-medium text-slate-600 hover:bg-white transition">Cancel</button>
            <button onClick={submit} disabled={createMutation.isPending}
              className="px-6 h-9 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition disabled:opacity-50 shadow-sm">
              {createMutation.isPending ? 'Saving…' : 'Create IGN →'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
