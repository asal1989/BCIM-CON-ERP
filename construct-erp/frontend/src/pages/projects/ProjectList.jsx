// src/pages/projects/ProjectList.jsx
import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, Link } from 'react-router-dom';
import {
  Building2, Plus, Search, MapPin, Activity, Briefcase,
  CheckCircle2, AlertTriangle, Users, ArrowRight, RefreshCw,
  LayoutGrid, List, Calendar, IndianRupee, Clock, TrendingUp,
} from 'lucide-react';
import { projectAPI } from '../../api/client';
import { clsx } from 'clsx';
import { motion, AnimatePresence } from 'framer-motion';
import TableActions from '../../components/common/TableActions';
import toast from 'react-hot-toast';
import { PageHeader } from '../../theme';
import { DashKPI } from '../dashboards/DashKPI';

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
  active:    { label: 'Active',    bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', dot: 'bg-emerald-500', bar: '#10B981', accent: '#10B981' },
  delayed:   { label: 'Delayed',   bg: 'bg-red-50',     text: 'text-red-700',     border: 'border-red-200',     dot: 'bg-red-500',     bar: '#EF4444', accent: '#EF4444' },
  planning:  { label: 'Planning',  bg: 'bg-blue-50',    text: 'text-blue-700',    border: 'border-blue-200',    dot: 'bg-blue-500',    bar: '#3B82F6', accent: '#3B82F6' },
  on_hold:   { label: 'On Hold',   bg: 'bg-slate-100',  text: 'text-slate-600',   border: 'border-slate-200',   dot: 'bg-slate-400',   bar: '#94A3B8', accent: '#94A3B8' },
  completed: { label: 'Completed', bg: 'bg-teal-50',    text: 'text-teal-700',    border: 'border-teal-200',    dot: 'bg-teal-500',    bar: '#14B8A6', accent: '#14B8A6' },
};

const STATUS_TABS = ['all', 'active', 'planning', 'delayed', 'on_hold', 'completed'];

/* ── Section title (mirrors ProcurementDashboard) ─────────── */
function SectionTitle({ icon: Icon, title, subtitle, action, color = 'text-blue-600', bg = 'bg-blue-50' }) {
  return (
    <div className="flex items-center justify-between mb-4">
      <div className="flex items-center gap-2.5">
        <div className={clsx('w-8 h-8 rounded-xl flex items-center justify-center', bg)}>
          <Icon className={clsx('w-4 h-4', color)} />
        </div>
        <div>
          <h2 className="text-sm font-bold text-slate-800 leading-tight">{title}</h2>
          {subtitle && <p className="text-[10px] text-slate-400 uppercase tracking-wider">{subtitle}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}

/* ── Donut chart ──────────────────────────────────────────── */
function DonutChart({ segments, size = 96, stroke = 20 }) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  let offset = 0;
  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#F1F5F9" strokeWidth={stroke - 2} />
      {segments.map((seg, i) => {
        const dash = (seg.value / total) * circ;
        const gap  = circ - dash;
        const el = (
          <circle key={i} cx={size/2} cy={size/2} r={r} fill="none"
            stroke={seg.color} strokeWidth={stroke - 2}
            strokeDasharray={`${dash} ${gap}`} strokeDashoffset={-offset} strokeLinecap="butt" />
        );
        offset += dash;
        return el;
      })}
    </svg>
  );
}

export default function ProjectList() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [search,       setSearch]       = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [view,         setView]         = useState('grid');

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
    onHold:     projects.filter(p => p.status === 'on_hold').length,
    totalValue: projects.reduce((s, p) => s + parseFloat(p.contract_value || 0), 0),
  };

  const tabCounts = STATUS_TABS.reduce((acc, s) => {
    acc[s] = s === 'all' ? projects.length : projects.filter(p => p.status === s).length;
    return acc;
  }, {});

  const donutSegments = [
    { label: 'Active',    value: kpis.active,    color: '#10B981' },
    { label: 'Planning',  value: projects.filter(p => p.status === 'planning').length, color: '#3B82F6' },
    { label: 'Delayed',   value: kpis.delayed,   color: '#EF4444' },
    { label: 'On Hold',   value: kpis.onHold,    color: '#94A3B8' },
    { label: 'Completed', value: kpis.completed, color: '#14B8A6' },
  ].filter(s => s.value > 0);

  return (
    <div className="min-h-screen bg-slate-50">

      {/* ── Page Header (navy gradient, matches Procurement Dashboard) ── */}
      <PageHeader
        title="Projects"
        subtitle="Portfolio overview across all active and planned projects"
        breadcrumbs={[{ label: 'Overview' }, { label: 'Projects' }]}
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={() => refetch()}
              className="flex items-center gap-1.5 rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-xs text-white hover:bg-white/20 transition-all"
            >
              <RefreshCw className="h-3.5 w-3.5" /> Refresh
            </button>
            <button
              onClick={() => navigate('/projects/new')}
              className="flex items-center gap-1.5 rounded-lg bg-white px-4 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-50 transition-all shadow-sm"
            >
              <Plus className="h-3.5 w-3.5" /> New Project
            </button>
          </div>
        }
      />

      <div className="p-5 space-y-5">

        {/* ── KPI Row ── */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <DashKPI label="Total Projects"  value={kpis.total}              icon={Briefcase}     color="indigo"  loading={isLoading} />
          <DashKPI label="Active"          value={kpis.active}             icon={Activity}      color="emerald" loading={isLoading} />
          <DashKPI label="Completed"       value={kpis.completed}          icon={CheckCircle2}  color="blue"    loading={isLoading} />
          <DashKPI label="Delayed"         value={kpis.delayed}            icon={AlertTriangle} color="red"     loading={isLoading} />
          <DashKPI label="Portfolio Value" value={crore(kpis.totalValue)}  icon={IndianRupee}   color="purple"  loading={isLoading} />
        </div>

        {/* ── Status Overview + Filter Bar ── */}
        <div className="grid gap-4 lg:grid-cols-[1fr_auto]">

          {/* Filter bar */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-3 flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[180px] max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <input
                className="w-full rounded-lg border border-slate-200 bg-slate-50 py-1.5 pl-8 pr-3 text-xs text-slate-800 font-medium outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 placeholder:text-slate-400 transition-all"
                placeholder="Search by name, code, city…"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>

            <div className="flex items-center gap-1.5 flex-wrap">
              {STATUS_TABS.map(s => (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  className={clsx(
                    'rounded-full border px-3 py-1 text-[11px] font-semibold transition-all',
                    statusFilter === s
                      ? 'border-blue-600 bg-blue-600 text-white shadow-sm'
                      : 'border-slate-200 bg-white text-slate-600 hover:border-blue-300 hover:text-blue-600'
                  )}
                >
                  {s === 'all' ? 'All' : (STATUS[s]?.label || s)}
                  {tabCounts[s] > 0 && (
                    <span className={clsx('ml-1 rounded-full px-1.5 text-[10px]', statusFilter === s ? 'bg-white/25' : 'bg-slate-100 text-slate-500')}>
                      {tabCounts[s]}
                    </span>
                  )}
                </button>
              ))}
            </div>

            <div className="ml-auto flex items-center rounded-lg border border-slate-200 bg-slate-50 overflow-hidden">
              <button onClick={() => setView('grid')} className={clsx('p-1.5 transition', view === 'grid' ? 'bg-blue-600 text-white' : 'text-slate-500 hover:text-slate-700')}>
                <LayoutGrid className="h-4 w-4" />
              </button>
              <button onClick={() => setView('list')} className={clsx('p-1.5 transition', view === 'list' ? 'bg-blue-600 text-white' : 'text-slate-500 hover:text-slate-700')}>
                <List className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Status donut */}
          {!isLoading && projects.length > 0 && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex items-center gap-4">
              <div className="relative flex-shrink-0">
                <DonutChart segments={donutSegments} />
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-lg font-bold text-slate-800">{kpis.total}</span>
                  <span className="text-[9px] text-slate-400 uppercase tracking-wide">Total</span>
                </div>
              </div>
              <div className="space-y-1.5 min-w-0">
                {donutSegments.map(seg => (
                  <div key={seg.label} className="flex items-center gap-2 text-[11px]">
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: seg.color }} />
                    <span className="text-slate-600 truncate">{seg.label}</span>
                    <span className="ml-auto font-bold text-slate-800">{seg.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── Content ── */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
          <div className="p-4 border-b border-slate-100">
            <SectionTitle
              icon={Building2}
              title="Project Portfolio"
              subtitle={`${projects.length} project${projects.length !== 1 ? 's' : ''} ${statusFilter !== 'all' ? `· ${STATUS[statusFilter]?.label || statusFilter}` : ''}`}
              color="text-blue-600"
              bg="bg-blue-50"
            />
          </div>

          {isLoading ? (
            <div className={clsx('grid gap-4 p-4', view === 'grid' ? 'sm:grid-cols-2 lg:grid-cols-3' : 'grid-cols-1')}>
              {[1,2,3,4,5,6].map(n => <div key={n} className="h-44 rounded-xl bg-slate-100 animate-pulse" />)}
            </div>
          ) : projects.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mb-3">
                <Building2 className="h-7 w-7 text-slate-300" />
              </div>
              <h3 className="text-sm font-semibold text-slate-500">No Projects Found</h3>
              <p className="mt-1 text-xs text-slate-400">Try adjusting your search or filters</p>
              <button onClick={() => navigate('/projects/new')} className="mt-4 flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 transition-all">
                <Plus className="h-3.5 w-3.5" /> Create First Project
              </button>
            </div>
          ) : view === 'grid' ? (
            <div className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3">
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
                      className="group cursor-pointer overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm hover:shadow-md hover:border-blue-200 transition-all"
                    >
                      {/* Accent bar */}
                      <div className="h-1 w-full" style={{ background: sc.accent }} />

                      <div className="p-4">
                        <div className="flex items-start justify-between gap-2 mb-3">
                          <div className="flex-1 min-w-0">
                            <h3 className="truncate text-sm font-semibold text-slate-800 group-hover:text-blue-600 transition-colors">
                              {proj.name}
                            </h3>
                            <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-slate-400">
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
                          <div className="rounded-lg border border-slate-100 bg-slate-50 p-2.5">
                            <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Contract Value</div>
                            <div className="mt-1 text-xs font-semibold text-slate-800">{inr(proj.contract_value)}</div>
                          </div>
                          <Link
                            to={`/procurement/boq-budget?project_id=${proj.id}`}
                            onClick={e => e.stopPropagation()}
                            className={clsx('rounded-lg border p-2.5 block hover:ring-2 hover:ring-blue-300 transition-all', overrun ? 'border-red-100 bg-red-50' : 'border-slate-100 bg-slate-50')}
                          >
                            <div className="flex items-center justify-between">
                              <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Spent ↗</div>
                              {overrun && <AlertTriangle className="h-3 w-3 text-red-500" />}
                            </div>
                            <div className={clsx('mt-1 text-xs font-semibold', overrun ? 'text-red-600' : 'text-slate-800')}>{inr(proj.total_spent)}</div>
                          </Link>
                        </div>

                        {/* Progress */}
                        <div>
                          <div className="flex justify-between text-[11px] mb-1.5">
                            <span className="font-bold uppercase tracking-widest text-slate-400">Progress</span>
                            <span className="font-bold" style={{ color: sc.accent }}>{Number(progress).toFixed(1)}%</span>
                          </div>
                          <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
                            <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(progress, 100)}%`, background: sc.accent }} />
                          </div>
                        </div>
                      </div>

                      {/* Footer */}
                      <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50 px-4 py-2.5 group-hover:bg-blue-50/50 transition-colors">
                        <div className="flex items-center gap-3 text-[11px] text-slate-400">
                          <span className="flex items-center gap-1"><Users className="h-3 w-3" /> {proj.worker_count || 0}</span>
                          {proj.pm_name && <span>PM: <span className="text-slate-600 font-medium">{proj.pm_name}</span></span>}
                          {proj.end_date && (
                            <span className="flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              {new Date(proj.end_date).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}
                            </span>
                          )}
                        </div>
                        <ArrowRight className="h-3.5 w-3.5 text-slate-300 group-hover:text-blue-500 transition-colors" />
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          ) : (
            /* List / Table View */
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    {['Project', 'Type', 'Location', 'Status', 'Contract Value', 'Progress', 'PM', ''].map(h => (
                      <th key={h} className="px-4 py-2.5 text-[10px] font-bold uppercase tracking-widest text-slate-400 text-left whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {projects.map(proj => {
                    const sc = STATUS[proj.status] || STATUS.active;
                    const progress = parseFloat(proj.progress_pct || 0);
                    return (
                      <tr key={proj.id} onClick={() => navigate(`/projects/${proj.id}`)} className="cursor-pointer hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span className="w-1.5 h-8 rounded-full flex-shrink-0" style={{ background: sc.accent }} />
                            <div>
                              <div className="text-xs font-semibold text-slate-800">{proj.name}</div>
                              <div className="text-[11px] text-slate-400">{proj.project_code}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-[11px] capitalize text-slate-600">{proj.type}</td>
                        <td className="px-4 py-3 text-[11px] text-slate-600">{proj.city}</td>
                        <td className="px-4 py-3">
                          <span className={clsx('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold', sc.bg, sc.text, sc.border)}>
                            <span className={clsx('h-1.5 w-1.5 rounded-full', sc.dot)} />{sc.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs font-semibold text-slate-800">{inr(proj.contract_value)}</td>
                        <td className="px-4 py-3 w-32">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
                              <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(progress, 100)}%`, background: sc.accent }} />
                            </div>
                            <span className="text-[11px] font-bold w-8 text-right" style={{ color: sc.accent }}>{progress.toFixed(0)}%</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-[11px] text-slate-500">{proj.pm_name || '—'}</td>
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
    </div>
  );
}
