// src/pages/procurement/BOMPage.jsx — Bill of Materials (project material requirement planner)
import React, { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import {
  Boxes, Download, Search, AlertTriangle, Info, Loader2, PackageCheck, PackageX, Package,
} from 'lucide-react';
import { bomAPI, projectAPI } from '../../api/client';
import { clsx } from 'clsx';
import { useNavigate } from 'react-router-dom';

const num = (v) => parseFloat(v) || 0;
const fmtQty = (v) => num(v).toLocaleString('en-IN', { maximumFractionDigits: 2 });

const STATUS_MAP = {
  no_norm:            { label: 'No BOM Norm',       cls: 'bg-slate-100 text-slate-500' },
  not_ordered:        { label: 'Not Ordered',        cls: 'bg-red-50 text-red-700' },
  partially_ordered:  { label: 'Partially Ordered',  cls: 'bg-amber-50 text-amber-700' },
  over_ordered:       { label: 'Over Ordered',       cls: 'bg-violet-50 text-violet-700' },
  ok:                 { label: 'Fully Ordered',      cls: 'bg-emerald-50 text-emerald-700' },
};

export default function BOMPage() {
  const navigate = useNavigate();
  const [projectId, setProjectId] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const { data: projects } = useQuery({
    queryKey: ['projects'],
    queryFn: () => projectAPI.list().then(r => r.data?.data ?? r.data ?? []).catch(() => []),
  });

  const { data: result, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['bom', projectId],
    queryFn: () => bomAPI.get(projectId).then(r => r.data?.data ?? null),
    enabled: !!projectId,
  });

  const exportMutation = useMutation({
    mutationFn: () => bomAPI.export(projectId),
    onSuccess: (res) => {
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = `BOM_${result?.project?.project_code || projectId}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    },
  });

  const bom = result?.bom || [];
  const filtered = bom.filter(r => {
    if (statusFilter && r.status !== statusFilter) return false;
    if (search && !r.material_name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="p-6 bg-slate-50 min-h-screen space-y-5 max-w-[1500px] mx-auto">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-indigo-50 flex items-center justify-center border border-indigo-100">
            <Boxes className="w-6 h-6 text-indigo-600" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-slate-900">Bill of Materials</h1>
            <p className="text-xs text-slate-500 mt-0.5">Material required (from BOQ) vs. ordered vs. received — what Procurement still needs to buy</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <select value={projectId} onChange={e => setProjectId(e.target.value)}
            className="border border-slate-200 rounded-lg px-3 py-2.5 text-sm bg-white min-w-[220px]">
            <option value="">Select Project...</option>
            {(projects || []).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          {result && (
            <button onClick={() => exportMutation.mutate()} disabled={exportMutation.isPending}
              className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-lg bg-white border border-slate-200 text-slate-700 font-medium text-xs shadow-sm hover:bg-slate-50 disabled:opacity-50">
              {exportMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />} Export Excel
            </button>
          )}
        </div>
      </div>

      {!projectId ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-16 text-center text-sm text-slate-400">
          Select a project to view its Bill of Materials.
        </div>
      ) : isError ? (
        <div className="bg-white border border-red-200 rounded-2xl p-16 text-center">
          <p className="text-sm text-red-600 mb-3">{error?.response?.data?.error || "Couldn't load the Bill of Materials."}</p>
          <button onClick={() => refetch()} className="px-4 py-2 text-xs font-medium bg-red-50 text-red-700 rounded-lg hover:bg-red-100">Retry</button>
        </div>
      ) : isLoading || !result ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map(i => <div key={i} className="h-24 bg-white rounded-2xl animate-pulse border border-slate-200" />)}
        </div>
      ) : (
        <BomBody result={result} filtered={filtered} search={search} setSearch={setSearch}
          statusFilter={statusFilter} setStatusFilter={setStatusFilter} navigate={navigate} />
      )}
    </div>
  );
}

function BomBody({ result, filtered, search, setSearch, statusFilter, setStatusFilter, navigate }) {
  const { project, bom, summary } = result;

  return (
    <div className="space-y-5">
      {!summary.has_norms && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3">
          <AlertTriangle size={16} className="text-amber-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-amber-800">No consumption norms configured for this project</p>
            <p className="text-xs text-amber-700 mt-0.5">
              The Bill of Materials is calculated from BOQ quantity × material consumption norm per BOQ item — none are set up yet, so "Required" can't be
              computed. Every material below is shown from what's actually been ordered/received, with no requirement to compare against.
              Set up norms under <button onClick={() => navigate('/qs/norms')} className="underline font-medium hover:text-amber-900">Consumption Norms</button>.
            </p>
          </div>
        </div>
      )}

      {/* Project header strip */}
      <div className="bg-white border border-slate-200 rounded-2xl px-6 py-4 flex flex-wrap items-center gap-x-8 gap-y-2">
        <div>
          <div className="text-[10px] font-medium text-slate-400 uppercase tracking-wide">Project</div>
          <div className="text-sm font-semibold text-slate-900">{project.name}</div>
        </div>
        <div className="w-px h-8 bg-slate-100 hidden sm:block" />
        <div>
          <div className="text-[10px] font-medium text-slate-400 uppercase tracking-wide">Project Code</div>
          <div className="text-sm font-medium text-slate-700">{project.project_code || '—'}</div>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <SummaryCard label="Materials Tracked" value={summary.material_count} icon={Package} color="#4F46E5" />
        <SummaryCard label="Not Yet Ordered" value={summary.not_ordered_count} icon={PackageX} color="#EF4444"
          onClick={() => setStatusFilter(statusFilter === 'not_ordered' ? '' : 'not_ordered')} active={statusFilter === 'not_ordered'} />
        <SummaryCard label="Partially Ordered" value={summary.partially_ordered_count} icon={PackageCheck} color="#F59E0B"
          onClick={() => setStatusFilter(statusFilter === 'partially_ordered' ? '' : 'partially_ordered')} active={statusFilter === 'partially_ordered'} />
        <SummaryCard label="No BOM Norm" value={summary.no_norm_count} icon={Info} color="#64748B"
          onClick={() => setStatusFilter(statusFilter === 'no_norm' ? '' : 'no_norm')} active={statusFilter === 'no_norm'} />
      </div>

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-slate-900">Material Requirement</h3>
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search material..."
              className="pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg w-56" />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                {['Material', 'Unit', 'Required (BOM)', 'Ordered', 'Received', 'Balance to Order', 'Balance to Receive', 'Status'].map(h => (
                  <th key={h} className={clsx('px-3 py-2.5 text-[11px] font-medium text-slate-400 whitespace-nowrap', h === 'Material' || h === 'Unit' ? 'text-left' : h === 'Status' ? 'text-center' : 'text-right')}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map(r => {
                const s = STATUS_MAP[r.status] || STATUS_MAP.ok;
                return (
                  <tr key={r.material_name} className="hover:bg-slate-50">
                    <td className="px-3 py-2.5 font-medium text-slate-800">{r.material_name}</td>
                    <td className="px-3 py-2.5 text-slate-500">{r.unit || '—'}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-xs text-slate-700">{r.has_norm ? fmtQty(r.required_qty) : '—'}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-xs text-slate-700">{fmtQty(r.ordered_qty)}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-xs text-slate-500">{fmtQty(r.received_qty)}</td>
                    <td className={clsx('px-3 py-2.5 text-right font-mono text-xs font-semibold', r.balance_to_order > 0 ? 'text-red-600' : 'text-slate-300')}>
                      {r.has_norm && r.balance_to_order > 0 ? fmtQty(r.balance_to_order) : '—'}
                    </td>
                    <td className={clsx('px-3 py-2.5 text-right font-mono text-xs', r.balance_to_receive > 0 ? 'text-amber-600 font-semibold' : 'text-slate-300')}>
                      {r.balance_to_receive > 0 ? fmtQty(r.balance_to_receive) : '—'}
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <span className={clsx('text-[10px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap', s.cls)}>{s.label}</span>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={8} className="py-16 text-center text-sm text-slate-400">No materials match this filter.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function SummaryCard({ label, value, icon: Icon, color, onClick, active }) {
  return (
    <button onClick={onClick} disabled={!onClick}
      className={clsx('bg-white border rounded-2xl p-4 text-left transition-all',
        active ? 'border-indigo-400 ring-2 ring-indigo-100' : 'border-slate-200',
        onClick && 'hover:border-slate-300 cursor-pointer')}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wide">{label}</span>
        <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: `${color}15` }}>
          <Icon size={14} style={{ color }} />
        </div>
      </div>
      <div className="text-lg font-semibold text-slate-900">{value}</div>
    </button>
  );
}
