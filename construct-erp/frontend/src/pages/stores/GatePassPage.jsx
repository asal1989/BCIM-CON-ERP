// src/pages/stores/GatePassPage.jsx — Gate Pass (Returnable / Non-Returnable)
import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  LogOut, Plus, X, Search, Download, RefreshCw,
  Clock, CheckCircle2, RotateCcw, Package,
  ChevronRight, FileText, Truck, ClipboardList, AlertTriangle,
} from 'lucide-react';
import { clsx } from 'clsx';
import dayjs from 'dayjs';
import { gatePassAPI, projectAPI } from '../../api/client';
import { FIELD_HL } from '../../constants/fieldStyles';
import toast from 'react-hot-toast';
import { PageHeader, KpiCard as ThemeKpiCard, Theme } from '../../theme';
import { CONSTRUCTION_UNITS as UNITS } from '../../constants/units';

const STATUS_CONFIG = {
  open:     { label: 'Open',     color: 'bg-amber-50 text-amber-700 border-amber-200',    icon: Clock },
  returned: { label: 'Returned', color: 'bg-blue-50 text-blue-700 border-blue-200',       icon: RotateCcw },
  closed:   { label: 'Closed',   color: 'bg-slate-100 text-slate-600 border-slate-200',   icon: CheckCircle2 },
};

const TYPE_CONFIG = {
  returnable:     { label: 'Returnable',     color: 'bg-orange-50 text-orange-700 border-orange-200' },
  non_returnable: { label: 'Non-Returnable', color: 'bg-slate-100 text-slate-600 border-slate-200' },
};

function StatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.open;
  const Icon = cfg.icon;
  return (
    <span className={clsx('inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border whitespace-nowrap', cfg.color)}>
      <Icon size={11} strokeWidth={2.5} />{cfg.label}
    </span>
  );
}

function TypeBadge({ type }) {
  const cfg = TYPE_CONFIG[type] || TYPE_CONFIG.non_returnable;
  return (
    <span className={clsx('inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold border whitespace-nowrap', cfg.color)}>
      {cfg.label}
    </span>
  );
}

/* ── Detail Panel ─────────────────────────────────────────────────────────── */
function GatePassDetailPanel({ gp, onClose, onReturn, onClose2, returnLoading, closeLoading }) {
  if (!gp) return null;
  const items = gp.items || [];

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="w-full max-w-xl bg-white shadow-2xl flex flex-col overflow-hidden">

        <div className="bg-slate-900 px-6 py-4 flex items-start justify-between flex-shrink-0">
          <div>
            <div className="text-[10px] text-slate-400 font-medium uppercase tracking-widest mb-1">Gate Pass</div>
            <h2 className="text-xl font-medium text-white font-mono">{gp.gp_number}</h2>
            <p className="text-sm text-slate-300 font-medium mt-0.5">{gp.project_name}</p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <TypeBadge type={gp.pass_type} />
            <StatusBadge status={gp.status} />
            <button onClick={onClose} className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center text-slate-300 hover:text-white transition">
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5 bg-slate-50">
          <div className="grid grid-cols-2 gap-3">
            {[
              ['Vehicle No.',      gp.vehicle_no       || '—'],
              ['Date & Time',      gp.date_time ? dayjs(gp.date_time).format('DD MMM YYYY, HH:mm') : '—'],
              ['Issued By',        gp.issued_by        || '—'],
              ['Issued To',        gp.issued_to        || '—'],
              ['Indented By',      gp.indented_by      || '—'],
              ['Authorised By',    gp.authorised_by    || '—'],
              ...(gp.pass_type === 'returnable' ? [
                ['Expected Return', gp.expected_return_date ? dayjs(gp.expected_return_date).format('DD MMM YYYY') : '—'],
                ['Returned At',     gp.returned_at ? dayjs(gp.returned_at).format('DD MMM YYYY, HH:mm') : '—'],
              ] : []),
            ].map(([lbl, val]) => (
              <div key={lbl} className="bg-white border border-slate-200 rounded-lg px-3 py-2.5">
                <div className="text-[10px] text-slate-500 font-medium uppercase tracking-wider mb-0.5">{lbl}</div>
                <div className="text-sm font-medium text-slate-900 truncate">{val}</div>
              </div>
            ))}
          </div>

          {/* Overdue warning for returnable */}
          {gp.pass_type === 'returnable' && gp.status === 'open' && gp.expected_return_date &&
           dayjs(gp.expected_return_date).isBefore(dayjs(), 'day') && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex items-center gap-3">
              <AlertTriangle size={16} className="text-red-500 flex-shrink-0" />
              <span className="text-sm font-medium text-red-800">
                Overdue — expected return {dayjs(gp.expected_return_date).format('DD MMM YYYY')}
              </span>
            </div>
          )}

          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <span className="text-xs font-medium text-slate-700 uppercase tracking-wider flex items-center gap-2">
                <Package size={13} /> Items
              </span>
              <span className="text-xs font-medium text-indigo-600 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded-full">
                {items.length} items
              </span>
            </div>
            <table className="w-full text-xs">
              <thead className="bg-slate-50 border-b border-slate-100">
                <tr>
                  {['Sl.','Particulars','Unit','Qty','Remarks'].map(h => (
                    <th key={h} className="px-3 py-2 text-left font-medium text-slate-600 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {items.map((it, i) => (
                  <tr key={i} className="hover:bg-slate-50">
                    <td className="px-3 py-2.5 font-mono text-slate-500">{it.sl_no}</td>
                    <td className="px-3 py-2.5 font-medium text-slate-900">{it.particulars}</td>
                    <td className="px-3 py-2.5">
                      {it.unit && <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200 text-[10px] uppercase font-medium">{it.unit}</span>}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-emerald-700 font-medium">{it.quantity ?? '—'}</td>
                    <td className="px-3 py-2.5 text-slate-500">{it.remarks || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-slate-200 bg-white flex-shrink-0 space-y-2">
          {gp.pass_type === 'returnable' && gp.status === 'open' && (
            <button onClick={onReturn} disabled={returnLoading}
              className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-medium py-3 rounded-xl text-sm transition shadow-sm">
              <RotateCcw size={16} />
              {returnLoading ? 'Processing…' : 'Mark as Returned'}
            </button>
          )}
          {gp.status !== 'closed' && (
            <button onClick={onClose2} disabled={closeLoading}
              className="w-full flex items-center justify-center gap-2 bg-slate-700 hover:bg-slate-800 disabled:opacity-60 text-white font-medium py-2.5 rounded-xl text-sm transition">
              <CheckCircle2 size={16} />
              {closeLoading ? 'Closing…' : 'Close Gate Pass'}
            </button>
          )}
          {gp.status === 'closed' && (
            <div className="flex items-center gap-2 bg-slate-100 text-slate-700 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold">
              <CheckCircle2 size={16} /> Gate Pass Closed
            </div>
          )}
          <button onClick={onClose}
            className="w-full py-2.5 text-slate-600 font-medium text-sm border border-slate-200 rounded-xl hover:bg-slate-50 transition">
            Close Panel
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Main Page ────────────────────────────────────────────────────────────── */
export default function GatePassPage() {
  const qc = useQueryClient();
  const [showForm, setShowForm]           = useState(false);
  const [selectedId, setSelectedId]       = useState(null);
  const [search, setSearch]               = useState('');
  const [statusFilter, setStatusFilter]   = useState('all');
  const [typeFilter, setTypeFilter]       = useState('all');
  const [projectFilter, setProjectFilter] = useState('');

  const { data: gpList = [], isLoading, refetch } = useQuery({
    queryKey: ['gp-list', projectFilter],
    queryFn: () => gatePassAPI.list(projectFilter ? { project_id: projectFilter } : {}).then(r => r.data?.data ?? []).catch(() => []),
  });

  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: () => projectAPI.list().then(r => r.data?.data ?? r.data ?? []).catch(() => []),
  });

  const { data: detailedGP } = useQuery({
    queryKey: ['gp', selectedId],
    queryFn: () => gatePassAPI.get(selectedId).then(r => r.data?.data ?? null).catch(() => null),
    enabled: !!selectedId,
  });

  const returnMutation = useMutation({
    mutationFn: (id) => gatePassAPI.return(id),
    onSuccess: () => {
      toast.success('Gate Pass marked as returned');
      qc.invalidateQueries({ queryKey: ['gp-list'] });
      qc.invalidateQueries({ queryKey: ['gp', selectedId] });
    },
    onError: (e) => toast.error(e?.response?.data?.error || 'Failed'),
  });

  const closeMutation = useMutation({
    mutationFn: (id) => gatePassAPI.close(id),
    onSuccess: () => {
      toast.success('Gate Pass closed');
      qc.invalidateQueries({ queryKey: ['gp-list'] });
      qc.invalidateQueries({ queryKey: ['gp', selectedId] });
    },
    onError: (e) => toast.error(e?.response?.data?.error || 'Failed'),
  });

  const counts = {
    open:       gpList.filter(g => g.status === 'open').length,
    returned:   gpList.filter(g => g.status === 'returned').length,
    closed:     gpList.filter(g => g.status === 'closed').length,
    overdue:    gpList.filter(g =>
      g.pass_type === 'returnable' && g.status === 'open' &&
      g.expected_return_date && dayjs(g.expected_return_date).isBefore(dayjs(), 'day')
    ).length,
  };

  const filtered = gpList.filter(g => {
    if (statusFilter !== 'all' && g.status !== statusFilter) return false;
    if (typeFilter !== 'all' && g.pass_type !== typeFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!g.gp_number?.toLowerCase().includes(q) &&
          !g.project_name?.toLowerCase().includes(q) &&
          !g.vehicle_no?.toLowerCase().includes(q) &&
          !g.issued_to?.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const exportCSV = () => {
    const headers = ['GP No.','Type','Date','Project','Vehicle','Issued To','Items','Status'];
    const rows = filtered.map(g => [
      g.gp_number, g.pass_type, g.date_time ? dayjs(g.date_time).format('DD/MM/YYYY HH:mm') : '',
      g.project_name, g.vehicle_no || '', g.issued_to || '', g.item_count || 0, g.status,
    ]);
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a'); a.href = url;
    a.download = `GatePass_${dayjs().format('YYYY-MM-DD')}.csv`; a.click();
    URL.revokeObjectURL(url); toast.success('CSV exported');
  };

  const STATUS_FILTERS = [
    { key: 'all',      label: 'All',      count: gpList.length },
    { key: 'open',     label: 'Open',     count: counts.open,     color: 'bg-amber-500' },
    { key: 'returned', label: 'Returned', count: counts.returned, color: 'bg-blue-500' },
    { key: 'closed',   label: 'Closed',   count: counts.closed,   color: 'bg-slate-400' },
  ];

  return (
    <div style={{ background: Theme.pageBg, minHeight: '100vh' }}>
      <PageHeader
        title="Gate Pass"
        subtitle="Outgoing material — returnable & non-returnable, with return tracking"
        breadcrumbs={[{ label: 'Stores' }, { label: 'Gate Pass' }]}
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
              <Plus size={14} /> New Gate Pass
            </button>
          </>
        }
      />

      <div className="p-6 md:p-8 max-w-full mx-auto">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
          <ThemeKpiCard icon={FileText}     label="Total Passes" value={gpList.length}    color="slate" />
          <ThemeKpiCard icon={Clock}        label="Open"         value={counts.open}      color="amber" />
          <ThemeKpiCard icon={RotateCcw}    label="Returned"     value={counts.returned}  color="blue" />
          <ThemeKpiCard icon={AlertTriangle} label="Overdue"     value={counts.overdue}   color="red" />
        </div>

        {counts.overdue > 0 && (
          <div className="mb-4 bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex items-center gap-3">
            <AlertTriangle size={16} className="text-red-500 flex-shrink-0" />
            <span className="text-sm font-medium text-red-800">
              {counts.overdue} returnable gate pass{counts.overdue > 1 ? 'es' : ''} overdue — items not yet returned
            </span>
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
          {/* Type filter */}
          <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
            className="h-9 bg-slate-50 border border-slate-200 rounded-lg px-3 text-xs text-slate-700 outline-none focus:border-indigo-400">
            <option value="all">All Types</option>
            <option value="returnable">Returnable</option>
            <option value="non_returnable">Non-Returnable</option>
          </select>
          <div className="flex-1" />
          <select value={projectFilter} onChange={e => setProjectFilter(e.target.value)}
            className="h-9 bg-slate-50 border border-slate-200 rounded-lg px-3 text-sm text-slate-700 outline-none focus:border-indigo-400">
            <option value="">All Projects</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search GP, vehicle, issued to…"
              className="h-9 pl-9 pr-4 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700 outline-none focus:border-indigo-400 transition w-56" />
          </div>
          <span className="text-xs text-slate-500">{filtered.length} of {gpList.length}</span>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  {['GP No.','Type','Date & Time','Project','Vehicle','Issued To','Items','Status',''].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase tracking-wider whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {isLoading ? (
                  [...Array(4)].map((_, i) => (
                    <tr key={i}><td colSpan={9} className="px-4 py-3">
                      <div className="h-5 bg-slate-100 animate-pulse rounded w-full" />
                    </td></tr>
                  ))
                ) : filtered.map(gp => {
                  const isOverdue = gp.pass_type === 'returnable' && gp.status === 'open' &&
                    gp.expected_return_date && dayjs(gp.expected_return_date).isBefore(dayjs(), 'day');
                  return (
                    <tr key={gp.id} onClick={() => setSelectedId(gp.id)}
                      className={clsx('cursor-pointer hover:bg-indigo-50/30 transition-colors group', isOverdue && 'bg-red-50/20')}>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <div className={clsx('w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0',
                            isOverdue ? 'bg-red-50 border border-red-200' : 'bg-orange-50 border border-orange-100'
                          )}>
                            <LogOut className={clsx('w-3.5 h-3.5', isOverdue ? 'text-red-600' : 'text-orange-600')} />
                          </div>
                          <span className="text-xs font-medium font-mono text-indigo-700 group-hover:underline">{gp.gp_number}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap"><TypeBadge type={gp.pass_type} /></td>
                      <td className="px-4 py-3 whitespace-nowrap text-xs text-slate-500">
                        {gp.date_time ? dayjs(gp.date_time).format('DD MMM YYYY HH:mm') : '—'}
                      </td>
                      <td className="px-4 py-3 text-xs font-medium text-slate-900 max-w-[130px] truncate">{gp.project_name}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <Truck className="w-3 h-3 text-slate-400 shrink-0" />
                          <span className="text-xs font-mono text-slate-700">{gp.vehicle_no || '—'}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-600 max-w-[120px] truncate">{gp.issued_to || '—'}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                          {gp.item_count || 0} items
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap"><StatusBadge status={gp.status} /></td>
                      <td className="px-4 py-3 text-right">
                        <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-indigo-500 transition-colors" />
                      </td>
                    </tr>
                  );
                })}
                {!isLoading && filtered.length === 0 && (
                  <tr><td colSpan={9} className="py-16 text-center">
                    <ClipboardList className="w-8 h-8 text-slate-300 mx-auto mb-3" />
                    <p className="text-sm font-medium text-slate-700">No Gate Passes found</p>
                    <p className="text-xs text-slate-400 mt-1">Adjust filters or create a new Gate Pass.</p>
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-2.5 border-t border-slate-100 bg-slate-50 text-xs text-slate-500">
            Showing {filtered.length} of {gpList.length} gate passes
          </div>
        </div>

        {selectedId && detailedGP && (
          <GatePassDetailPanel
            gp={detailedGP}
            onClose={() => setSelectedId(null)}
            onReturn={() => returnMutation.mutate(selectedId)}
            onClose2={() => closeMutation.mutate(selectedId)}
            returnLoading={returnMutation.isPending}
            closeLoading={closeMutation.isPending}
          />
        )}

        {showForm && (
          <GatePassForm onClose={() => setShowForm(false)} projects={projects} qc={qc} />
        )}
      </div>
    </div>
  );
}

/* ── Gate Pass Create Form ────────────────────────────────────────────────── */
function GatePassForm({ onClose, projects, qc }) {
  const emptyItem = () => ({ particulars: '', unit: '', quantity: '', remarks: '' });

  const [form, setForm] = useState({
    project_id: '', pass_type: 'non_returnable',
    vehicle_no: '', date_time: dayjs().format('YYYY-MM-DDTHH:mm'),
    issued_by: '', issued_to: '',
    indented_by: '', authorised_by: '',
    expected_return_date: '', remarks: '',
  });
  const [items, setItems] = useState([emptyItem()]);

  const createMutation = useMutation({
    mutationFn: (d) => gatePassAPI.create(d),
    onSuccess: () => {
      toast.success('Gate Pass created');
      qc.invalidateQueries({ queryKey: ['gp-list'] });
      onClose();
    },
    onError: (e) => toast.error(e?.response?.data?.error || 'Failed to create Gate Pass'),
  });

  const setField = (k, v) => setForm(p => ({ ...p, [k]: v }));
  const updateItem = (idx, k, v) => setItems(p => p.map((it, i) => i === idx ? { ...it, [k]: v } : it));
  const addRow    = () => setItems(p => [...p, emptyItem()]);
  const removeRow = (idx) => { if (items.length > 1) setItems(p => p.filter((_, i) => i !== idx)); };

  const submit = () => {
    if (!form.project_id) return toast.error('Select a project');
    const validItems = items.filter(it => it.particulars?.trim());
    if (!validItems.length) return toast.error('Add at least one item');
    createMutation.mutate({ ...form, items: validItems });
  };

  const inp = `w-full h-10 rounded-lg px-3 text-sm font-medium outline-none transition-all border ${FIELD_HL}`;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white w-full max-w-3xl rounded-2xl flex flex-col max-h-[92vh] shadow-2xl overflow-hidden">

        <div className="bg-slate-900 px-6 py-4 flex items-center justify-between flex-shrink-0">
          <div>
            <h2 className="text-base font-semibold text-white flex items-center gap-2">
              <LogOut size={16} className="text-orange-400" /> New Gate Pass
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">Outgoing material — returnable or non-returnable</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center text-slate-300 hover:text-white transition">
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">

          {/* Pass type selector */}
          <div className="flex items-center gap-3">
            {[
              { value: 'non_returnable', label: 'Non-Returnable', desc: 'Items leave site permanently' },
              { value: 'returnable',     label: 'Returnable',     desc: 'Items must come back' },
            ].map(opt => (
              <button key={opt.value} type="button"
                onClick={() => setField('pass_type', opt.value)}
                className={clsx('flex-1 border-2 rounded-xl px-4 py-3 text-left transition-all',
                  form.pass_type === opt.value
                    ? 'border-indigo-500 bg-indigo-50'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                )}>
                <div className={clsx('text-sm font-bold', form.pass_type === opt.value ? 'text-indigo-700' : 'text-slate-700')}>{opt.label}</div>
                <div className="text-xs text-slate-500 mt-0.5">{opt.desc}</div>
              </button>
            ))}
          </div>

          {/* Header fields */}
          <div className="border border-slate-200 rounded-xl p-5">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-4">Pass Details</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div className="col-span-2 md:col-span-1 space-y-1.5">
                <label className="text-xs font-bold text-slate-700">Project *</label>
                <select value={form.project_id} onChange={e => setField('project_id', e.target.value)} className={inp}>
                  <option value="">Select project…</option>
                  {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700">Vehicle No.</label>
                <input type="text" value={form.vehicle_no} onChange={e => setField('vehicle_no', e.target.value.toUpperCase())} placeholder="KA01AB1234" className={inp} />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700">Date & Time *</label>
                <input type="datetime-local" value={form.date_time} onChange={e => setField('date_time', e.target.value)} className={inp} />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700">Issued By</label>
                <input type="text" value={form.issued_by} onChange={e => setField('issued_by', e.target.value)} placeholder="Issuing person" className={inp} />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700">Issued To</label>
                <input type="text" value={form.issued_to} onChange={e => setField('issued_to', e.target.value)} placeholder="Receiving person / party" className={inp} />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700">Indented By</label>
                <input type="text" value={form.indented_by} onChange={e => setField('indented_by', e.target.value)} placeholder="Foreman name" className={inp} />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700">Authorised By</label>
                <input type="text" value={form.authorised_by} onChange={e => setField('authorised_by', e.target.value)} placeholder="Engineer / CM name" className={inp} />
              </div>
              {form.pass_type === 'returnable' && (
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 text-orange-600">Expected Return Date</label>
                  <input type="date" value={form.expected_return_date} onChange={e => setField('expected_return_date', e.target.value)} className={inp} />
                </div>
              )}
            </div>
          </div>

          {/* Items */}
          <div className="border border-slate-200 rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Particulars</h3>
              <button onClick={addRow}
                className="flex items-center gap-1.5 px-3 h-7 rounded-lg text-xs font-semibold text-indigo-600 bg-indigo-50 border border-indigo-100 hover:bg-indigo-100 transition">
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
                        <input value={it.particulars} onChange={e => updateItem(idx, 'particulars', e.target.value)}
                          placeholder="Item description"
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
                        <input type="number" value={it.quantity} onChange={e => updateItem(idx, 'quantity', e.target.value)}
                          placeholder="0"
                          className={`w-full h-8 rounded-lg px-3 text-xs text-right font-mono outline-none transition-all border ${FIELD_HL}`} />
                      </td>
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
            {items.filter(i => i.particulars?.trim()).length} item(s) · {form.pass_type === 'returnable' ? 'Returnable' : 'Non-Returnable'}
          </span>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="px-5 h-9 rounded-lg border border-slate-200 text-sm font-medium text-slate-600 hover:bg-white transition">Cancel</button>
            <button onClick={submit} disabled={createMutation.isPending}
              className="px-6 h-9 rounded-lg bg-orange-600 text-white text-sm font-semibold hover:bg-orange-700 transition disabled:opacity-50 shadow-sm">
              {createMutation.isPending ? 'Saving…' : 'Create Gate Pass →'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
