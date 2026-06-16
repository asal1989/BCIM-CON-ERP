// src/pages/projects/ProjectList.jsx
import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  Building2, Plus, Search, MapPin, Activity, Briefcase,
  CheckCircle2, Clock, Filter, TrendingUp, AlertTriangle,
  Users, ArrowRight, RefreshCw, LayoutGrid, List,
  Calendar, IndianRupee, ChevronRight,
} from 'lucide-react';
import { projectAPI } from '../../api/client';
import { clsx } from 'clsx';
import { motion, AnimatePresence } from 'framer-motion';
import TableActions from '../../components/common/TableActions';
import toast from 'react-hot-toast';

/* ── helpers ─────────────────────────────────────────────── */
const inr = v => {
  const n = parseFloat(v || 0);
  return `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const crore = v => {
  const n = parseFloat(v || 0);
  if (Math.abs(n) >= 1e7) return `₹${(n / 1e7).toFixed(2)} Cr`;
  if (Math.abs(n) >= 1e5) return `₹${(n / 1e5).toFixed(2)} L`;
  return `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
};

const STATUS = {
  active:    { label: 'Active',     bg: 'bg-green-50',   text: 'text-green-700',   border: 'border-green-200',  dot: 'bg-green-500',   bar: 'bg-green-500',   left: 'border-l-green-500'  },
  delayed:   { label: 'Delayed',    bg: 'bg-red-50',     text: 'text-red-700',     border: 'border-red-200',    dot: 'bg-red-500',     bar: 'bg-red-500',     left: 'border-l-red-500'    },
  planning:  { label: 'Planning',   bg: 'bg-blue-50',    text: 'text-blue-700',    border: 'border-blue-200',   dot: 'bg-blue-500',    bar: 'bg-blue-400',    left: 'border-l-blue-500'   },
  on_hold:   { label: 'On Hold',    bg: 'bg-gray-100',   text: 'text-gray-600',    border: 'border-gray-200',   dot: 'bg-gray-400',    bar: 'bg-gray-400',    left: 'border-l-gray-400'   },
  completed: { label: 'Completed',  bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200',dot: 'bg-emerald-500', bar: 'bg-emerald-500', left: 'border-l-emerald-500'},
};

const STATUS_TABS = ['all', 'active', 'planning', 'delayed', 'on_hold', 'completed'];

export default function ProjectList() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [search,       setSearch]       = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [view,         setView]         = useState('grid'); // 'grid' | 'list'

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['projects', search, statusFilter],
    queryFn: () =>
      projectAPI.list({ search, status: statusFilter !== 'all' ? statusFilter : undefined })
        .then(r => { const d = r.data; return Array.isArray(d) ? d : (Array.isArray(d?.data) ? d.data : []); }),
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
  });

  const deleteMut = useMutation({
    mutationFn: id => projectAPI.delete(id),
    onSuccess: () => { toast.success('Project deleted'); qc.invalidateQueries({ queryKey: ['projects'] }); },
    onError:   () => toast.error('Cannot delete — linked records exist.'),
  });

  const projects = data || [];

  const kpis = {
    total:      projects.length,
    active:     projects.filter(p => p.status === 'active').length,
    completed:  projects.filter(p => p.status === 'completed').length,
    delayed:    projects.filter(p => p.status === 'delayed').length,
    totalValue: projects.reduce((s, p) => s + parseFloat(p.contract_value || 0), 0),
  };

  const tabCounts = STATUS_TABS.reduce((acc, s) => {
    acc[s] = s === 'all' ? projects.length : projects.filter(p => p.status === s).length;
    return acc;
  }, {});

  return (
    <div className="min-h-screen bg-gray-50">

      {/* ── Top Header ── */}
      <div className="border-b border-gray-200 bg-white px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <span>Overview</span>
            <ChevronRight className="h-4 w-4" />
            <span className="font-medium text-gray-800">Projects</span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => refetch()} className="flex items-center gap-1.5 rounded border border-gray-200 bg-white px-3 py-1.5 text-xs text-slate-900 hover:bg-gray-50">
              <RefreshCw className="h-3.5 w-3.5" /> Refresh
            </button>
            <button onClick={() => navigate('/projects/new')} className="flex items-center gap-1.5 rounded bg-blue-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-blue-700">
              <Plus className="h-3.5 w-3.5" /> New Project
            </button>
          </div>
        </div>
      </div>

      <div className="p-6 space-y-5">

        {/* ── KPI Row ── */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {[
            { label: 'Total Projects', value: kpis.total,         icon: Briefcase,    color: 'text-blue-600',   bg: 'bg-blue-50'   },
            { label: 'Active',         value: kpis.active,        icon: Activity,     color: 'text-green-600',  bg: 'bg-green-50'  },
            { label: 'Completed',      value: kpis.completed,     icon: CheckCircle2, color: 'text-emerald-600',bg: 'bg-emerald-50'},
            { label: 'Delayed',        value: kpis.delayed,       icon: AlertTriangle,color: 'text-red-600',    bg: 'bg-red-50'    },
            { label: 'Portfolio Value',value: crore(kpis.totalValue),icon: IndianRupee, color: 'text-purple-600', bg: 'bg-purple-50', isText: true },
          ].map(k => (
            <div key={k.label} className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500">{k.label}</span>
                <span className={clsx('rounded p-1', k.bg)}>
                  <k.icon className={clsx('h-4 w-4', k.color)} />
                </span>
              </div>
              <div className={clsx('mt-2 text-2xl font-bold', k.isText ? k.color : 'text-gray-800')}>{k.value}</div>
            </div>
          ))}
        </div>

        {/* ── Filter Bar ── */}
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3 shadow-sm">
          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              className="w-full rounded border border-gray-200 bg-gray-50 py-1.5 pl-9 pr-3 text-sm text-slate-900 font-medium outline-none focus:border-blue-400 placeholder:text-gray-400"
              placeholder="Search by name, code, city…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            <Filter className="h-3.5 w-3.5 text-gray-400" />
            {STATUS_TABS.map(s => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={clsx(
                  'rounded-full border px-3 py-1 text-xs font-medium transition-all',
                  statusFilter === s ? 'border-blue-600 bg-blue-600 text-white' : 'border-gray-200 bg-white text-slate-900 font-medium hover:border-blue-300 hover:text-blue-600'
                )}
              >
                {s === 'all' ? 'All' : (STATUS[s]?.label || s)}
                {tabCounts[s] > 0 && (
                  <span className={clsx('ml-1 rounded-full px-1.5 text-[10px]', statusFilter === s ? 'bg-white/20' : 'bg-gray-100 text-gray-500')}>
                    {tabCounts[s]}
                  </span>
                )}
              </button>
            ))}
          </div>
          {/* View toggle */}
          <div className="ml-auto flex items-center rounded border border-gray-200 bg-gray-50">
            <button onClick={() => setView('grid')} className={clsx('rounded-l p-1.5 transition', view === 'grid' ? 'bg-blue-600 text-white' : 'text-slate-900 font-medium hover:text-gray-700')}>
              <LayoutGrid className="h-4 w-4" />
            </button>
            <button onClick={() => setView('list')} className={clsx('rounded-r p-1.5 transition', view === 'list' ? 'bg-blue-600 text-white' : 'text-slate-900 font-medium hover:text-gray-700')}>
              <List className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* ── Content ── */}
        {isLoading ? (
          <div className={clsx('grid gap-4', view === 'grid' ? 'sm:grid-cols-2 lg:grid-cols-3' : 'grid-cols-1')}>
            {[1,2,3,4,5,6].map(n => <div key={n} className="h-44 rounded-lg bg-gray-200 animate-pulse" />)}
          </div>
        ) : projects.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-200 bg-white py-20 text-center">
            <Building2 className="mb-3 h-10 w-10 text-gray-200" />
            <h3 className="text-sm font-medium text-gray-500">No Projects Found</h3>
            <p className="mt-1 text-xs text-gray-400">Try adjusting your search or filters</p>
            <button onClick={() => navigate('/projects/new')} className="mt-4 flex items-center gap-1.5 rounded bg-blue-600 px-4 py-2 text-xs font-medium text-white hover:bg-blue-700">
              <Plus className="h-3.5 w-3.5" /> Create First Project
            </button>
          </div>
        ) : view === 'grid' ? (
          /* Grid View */
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <AnimatePresence>
              {projects.map((proj, idx) => {
                const sc = STATUS[proj.status] || STATUS.active;
                const progress = parseFloat(proj.progress_pct || 0);
                const overrun = parseFloat(proj.total_spent || 0) > parseFloat(proj.contract_value || 0);

                return (
                  <motion.div
                    key={proj.id}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15, delay: idx * 0.03 }}
                    onClick={() => navigate(`/projects/${proj.id}`)}
                    className={clsx('group cursor-pointer overflow-hidden rounded-lg border border-l-4 bg-white shadow-sm hover:shadow-md transition-all', sc.left, 'border-gray-200')}
                  >
                    {/* Card Header */}
                    <div className="p-4">
                      <div className="flex items-start justify-between gap-2 mb-3">
                        <div className="flex-1 min-w-0">
                          <h3 className="truncate text-sm font-medium text-slate-900 group-hover:text-blue-600 transition-colors">
                            {proj.name}
                          </h3>
                          <div className="mt-0.5 flex items-center gap-1.5 text-xs text-gray-400">
                            <MapPin className="h-3 w-3 shrink-0" />
                            <span className="truncate">{proj.city || '—'}</span>
                            {proj.type && <><span>·</span><span className="capitalize">{proj.type}</span></>}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                          <span className={clsx('flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold', sc.bg, sc.text, sc.border)}>
                            <span className={clsx('h-1.5 w-1.5 rounded-full', sc.dot)} />{sc.label}
                          </span>
                          <TableActions onEdit={() => navigate(`/projects/${proj.id}/edit`)} onDelete={() => deleteMut.mutate(proj.id)} recordName={proj.name} />
                        </div>
                      </div>

                      {/* Financials */}
                      <div className="grid grid-cols-2 gap-2 mb-3">
                        <div className="rounded border border-gray-100 bg-gray-50 p-2.5">
                          <div className="text-[10px] text-slate-900 font-medium uppercase tracking-wide">Contract Value</div>
                          <div className="mt-0.5 text-sm font-medium text-gray-900">{inr(proj.contract_value)}</div>
                        </div>
                        <div className={clsx('rounded border p-2.5', overrun ? 'border-red-100 bg-red-50' : 'border-gray-100 bg-gray-50')}>
                          <div className="flex items-center justify-between">
                            <div className="text-[10px] text-slate-900 font-medium uppercase tracking-wide">Spent</div>
                            {overrun && <AlertTriangle className="h-3 w-3 text-red-500" />}
                          </div>
                          <div className={clsx('mt-0.5 text-sm font-bold', overrun ? 'text-red-600' : 'text-gray-900')}>{inr(proj.total_spent)}</div>
                        </div>
                      </div>

                      {/* Progress */}
                      <div>
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-gray-400">Progress</span>
                          <span className={clsx('font-semibold', progress >= 90 ? 'text-emerald-600' : 'text-blue-600')}>{Number(progress).toFixed(1)}%</span>
                        </div>
                        <div className="h-1.5 w-full rounded-full bg-gray-100 overflow-hidden">
                          <div className={clsx('h-full rounded-full transition-all', sc.bar)} style={{ width: `${Math.min(progress, 100)}%` }} />
                        </div>
                      </div>
                    </div>

                    {/* Footer */}
                    <div className="flex items-center justify-between border-t border-gray-100 bg-gray-50 px-4 py-2.5 group-hover:bg-blue-50/40 transition-colors">
                      <div className="flex items-center gap-3 text-xs text-gray-400">
                        <span className="flex items-center gap-1"><Users className="h-3 w-3" /> {proj.worker_count || 0}</span>
                        {proj.pm_name && <span>PM: {proj.pm_name}</span>}
                        {proj.end_date && <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{new Date(proj.end_date).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}</span>}
                      </div>
                      <ArrowRight className="h-3.5 w-3.5 text-gray-300 group-hover:text-blue-500 transition-colors" />
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        ) : (
          /* List / Table View */
          <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
            <table className="w-full text-left">
              <thead className="border-b border-gray-100 bg-gray-50">
                <tr>
                  {['Project', 'Type', 'Location', 'Status', 'Contract Value', 'Progress', 'PM', ''].map(h => (
                    <th key={h} className="px-4 py-3 text-[11px] font-medium uppercase tracking-wider text-gray-500">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {projects.map(proj => {
                  const sc = STATUS[proj.status] || STATUS.active;
                  const progress = parseFloat(proj.progress_pct || 0);
                  return (
                    <tr key={proj.id} onClick={() => navigate(`/projects/${proj.id}`)} className="cursor-pointer hover:bg-blue-50/30 transition-colors">
                      <td className="px-4 py-3">
                        <div className="text-sm font-medium text-gray-900">{proj.name}</div>
                        <div className="text-xs text-gray-400">{proj.project_code}</div>
                      </td>
                      <td className="px-4 py-3 text-xs capitalize text-gray-600">{proj.type}</td>
                      <td className="px-4 py-3 text-xs text-gray-600">{proj.city}</td>
                      <td className="px-4 py-3">
                        <span className={clsx('rounded-full border px-2 py-0.5 text-[11px] font-semibold', sc.bg, sc.text, sc.border)}>
                          {sc.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm font-medium text-gray-800">{inr(proj.contract_value)}</td>
                      <td className="px-4 py-3 w-32">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                            <div className={clsx('h-full rounded-full', sc.bar)} style={{ width: `${Math.min(progress, 100)}%` }} />
                          </div>
                          <span className="text-xs text-slate-900 font-medium w-8 text-right">{progress.toFixed(0)}%</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500">{proj.pm_name || '—'}</td>
                      <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                        <TableActions onEdit={() => navigate(`/projects/${proj.id}/edit`)} onDelete={() => deleteMut.mutate(proj.id)} recordName={proj.name} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
