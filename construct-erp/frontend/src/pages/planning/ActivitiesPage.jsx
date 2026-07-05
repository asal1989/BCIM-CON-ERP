// src/pages/planning/ActivitiesPage.jsx
import React, { useState, useMemo, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ClipboardList, Plus, Search, Download, ChevronRight, X,
  Calendar, MapPin, Activity, Package, CheckCircle2,
  Clock, AlertTriangle, Zap, Trash2, Edit2, Flag,
  GanttChartSquare, List, Upload,
} from 'lucide-react';
import { planningAPI, planningP6API, projectAPI } from '../../api/client';
import useAuthStore from '../../store/authStore';
import toast from 'react-hot-toast';
import { clsx } from 'clsx';
import dayjs from 'dayjs';

const STATUS_CFG = {
  planned:     { label: 'Planned',     color: 'bg-slate-50 text-slate-900 border-slate-200',   dot: 'bg-slate-400',   icon: Clock },
  in_progress: { label: 'In Progress', color: 'bg-blue-50 text-blue-700 border-blue-200',      dot: 'bg-blue-500',    icon: Zap },
  delayed:     { label: 'Delayed',     color: 'bg-red-50 text-red-700 border-red-200',         dot: 'bg-red-500',     icon: AlertTriangle },
  completed:   { label: 'Completed',   color: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500', icon: CheckCircle2 },
  cancelled:   { label: 'Cancelled',   color: 'bg-slate-100 text-slate-900 font-medium border-slate-200',  dot: 'bg-slate-300',   icon: X },
};

const TYPE_CFG = {
  structural: 'bg-purple-50 text-purple-700 border-purple-200',
  finishing:  'bg-pink-50 text-pink-700 border-pink-200',
  civil:      'bg-amber-50 text-amber-700 border-amber-200',
  mechanical: 'bg-cyan-50 text-cyan-700 border-cyan-200',
  electrical: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  other:      'bg-slate-50 text-slate-900 border-slate-200',
};

function StatusBadge({ status }) {
  const cfg  = STATUS_CFG[status] || STATUS_CFG.planned;
  const Icon = cfg.icon;
  return (
    <span className={clsx('inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border', cfg.color)}>
      <Icon size={11} strokeWidth={2.5} /> {cfg.label}
    </span>
  );
}

export default function ActivitiesPage() {
  const qc = useQueryClient();
  const { user } = useAuthStore();
  const [projectId, setProjectId]       = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch]             = useState('');
  const [selected, setSelected]         = useState(null);
  const [showAdd, setShowAdd]           = useState(false);
  const [showProgress, setShowProgress] = useState(false);
  const [viewMode, setViewMode]         = useState('list'); // 'list' | 'gantt'
  const [importing, setImporting]       = useState(false);
  const importRef                       = useRef();

  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: () => projectAPI.list().then(r => r.data?.data ?? []),
  });

  const { data: activities = [], isLoading } = useQuery({
    queryKey: ['planning-activities', projectId, statusFilter],
    queryFn: () => planningAPI.listActivities({
      project_id: projectId || undefined,
      status: statusFilter !== 'all' ? statusFilter : undefined,
    }).then(r => r.data?.data ?? r.data ?? []).catch(() => []),
    enabled: !!projectId,
  });

  const filtered = useMemo(() => {
    if (!search) return activities;
    const q = search.toLowerCase();
    return activities.filter(a =>
      a.activity_name?.toLowerCase().includes(q) ||
      a.activity_code?.toLowerCase().includes(q) ||
      a.location?.toLowerCase().includes(q)
    );
  }, [activities, search]);

  const deleteMut = useMutation({
    mutationFn: id => planningAPI.deleteActivity(id),
    onSuccess: () => {
      toast.success('Activity deleted');
      qc.invalidateQueries({ queryKey: ['planning-activities'] });
      setSelected(null);
    },
    onError: e => toast.error(e?.response?.data?.error || 'Delete failed'),
  });

  const statusCounts = useMemo(() => {
    const c = {};
    activities.forEach(a => { c[a.status] = (c[a.status] || 0) + 1; });
    return c;
  }, [activities]);

  // CSV Import handler
  const handleImport = async (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    setImporting(true);
    try {
      const text = await file.text();
      const lines = text.trim().split('\n');
      const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
      const rows = lines.slice(1).map(line => {
        const vals = line.split(',').map(v => v.trim().replace(/"/g, ''));
        const obj = {};
        headers.forEach((h, i) => { obj[h] = vals[i] || ''; });
        return obj;
      }).filter(r => r.activity_code && r.activity_name);
      if (!rows.length) { toast.error('No valid rows found'); return; }
      const res = await planningAPI.importActivities({ project_id: projectId, rows, overwrite: true });
      toast.success(`Imported: ${res.data.inserted} added, ${res.data.skipped} skipped`);
      qc.invalidateQueries({ queryKey: ['planning-activities'] });
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Import failed');
    } finally {
      setImporting(false);
      if (importRef.current) importRef.current.value = '';
    }
  };

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto min-h-screen bg-[#f4f6f9]">

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-900 font-medium mb-1">
            <ClipboardList className="w-3.5 h-3.5" /> Planning
          </div>
          <h1 className="text-2xl font-medium text-slate-900">Schedule & Activities</h1>
          <p className="text-sm text-slate-900 font-medium mt-0.5">Activity-based project schedule management</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={projectId}
            onChange={e => setProjectId(e.target.value)}
            className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 outline-none focus:border-indigo-400 shadow-sm"
          >
            <option value="">— Select project —</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          {projectId && (
            <div className="flex items-center gap-2">
              {/* List / Gantt toggle */}
              <div className="flex bg-white border border-slate-200 rounded-lg overflow-hidden shadow-sm">
                <button onClick={() => setViewMode('list')}
                  className={clsx('flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors',
                    viewMode==='list' ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-50')}>
                  <List className="w-3.5 h-3.5" /> List
                </button>
                <button onClick={() => setViewMode('gantt')}
                  className={clsx('flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors',
                    viewMode==='gantt' ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-50')}>
                  <GanttChartSquare className="w-3.5 h-3.5" /> Gantt
                </button>
              </div>
              {/* Import CSV */}
              <input ref={importRef} type="file" accept=".csv" className="hidden" onChange={handleImport} />
              <button onClick={() => importRef.current?.click()} disabled={importing}
                className="flex items-center gap-1.5 px-3 py-2 border border-slate-200 bg-white text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-50 shadow-sm disabled:opacity-50">
                <Upload className="w-4 h-4" /> {importing ? 'Importing…' : 'Import CSV'}
              </button>
              <button onClick={() => planningAPI.downloadActivityTemplate().then(r => {
                const url = URL.createObjectURL(r.data);
                const a = document.createElement('a'); a.href=url; a.download='activity-template.csv'; a.click();
              })} className="flex items-center gap-1.5 px-3 py-2 border border-slate-200 bg-white text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-50 shadow-sm">
                <Download className="w-4 h-4" /> Template
              </button>
              <button
                onClick={() => setShowAdd(true)}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-all shadow-sm"
              >
                <Plus className="w-4 h-4" /> Add Activity
              </button>
            </div>
          )}
        </div>
      </div>

      {!projectId ? (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-16 text-center">
          <ClipboardList className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-900 font-medium font-medium">Select a project to view its activities</p>
        </div>
      ) : (
        <>
          {/* Toolbar */}
          <div className="bg-white border border-slate-200 rounded-xl p-3 mb-5 flex flex-wrap items-center gap-3 shadow-sm">
            <div className="relative flex-1 min-w-48">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search activity name, code, location…"
                className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-9 pr-4 py-2 text-sm outline-none focus:border-indigo-400"
              />
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              {[['all', 'All'], ['planned', 'Planned'], ['in_progress', 'Active'], ['delayed', 'Delayed'], ['completed', 'Done']].map(([val, lbl]) => (
                <button
                  key={val}
                  onClick={() => setStatusFilter(val)}
                  className={clsx(
                    'px-3 py-1.5 rounded-lg text-xs font-medium border transition-all',
                    statusFilter === val
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'bg-white text-slate-900 font-medium border-slate-200 hover:border-indigo-300'
                  )}
                >
                  {lbl}
                  {val !== 'all' && statusCounts[val] ? <span className="ml-1 opacity-70">{statusCounts[val]}</span> : null}
                </button>
              ))}
            </div>
            <span className="text-xs text-slate-900 font-medium ml-auto">{filtered.length} of {activities.length}</span>
          </div>

          {/* Gantt Chart View */}
          {viewMode === 'gantt' && <GanttChart activities={filtered} onSelect={setSelected} />}

          {/* Table List View */}
          {viewMode === 'list' && <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    {['Code', 'Activity', 'Type', 'Baseline Dates', 'Duration', 'Progress', 'Status', ''].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-medium text-slate-900 font-medium uppercase tracking-wider whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {filtered.map(a => {
                    const isOverdue = a.status !== 'completed' && dayjs(a.baseline_end_date).isBefore(dayjs());
                    return (
                      <tr key={a.id} onClick={() => setSelected(a)} className="cursor-pointer hover:bg-slate-50 transition-colors group">
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className="text-xs font-medium font-mono text-indigo-600 group-hover:underline">{a.activity_code}</span>
                          {a.is_critical_path && <span className="ml-1.5 text-[9px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded font-bold">CP</span>}
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-xs font-medium text-slate-900 font-medium max-w-52 truncate">{a.activity_name}</div>
                          {a.location && <div className="text-xs text-slate-900 font-medium flex items-center gap-1 mt-0.5"><MapPin className="w-3 h-3" />{a.location}</div>}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className={clsx('text-xs px-2 py-0.5 rounded border font-medium capitalize', TYPE_CFG[a.activity_type] || TYPE_CFG.other)}>
                            {a.activity_type || '—'}
                          </span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="text-xs text-slate-900 font-medium">{dayjs(a.baseline_start_date).format('DD MMM')}</div>
                          <div className={clsx('text-xs', isOverdue ? 'text-red-500 font-semibold' : 'text-slate-400')}>
                            → {dayjs(a.baseline_end_date).format('DD MMM YY')}
                          </div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-xs font-mono text-slate-700">{a.baseline_duration}d</td>
                        <td className="px-4 py-3 whitespace-nowrap w-32">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                              <div
                                className={clsx('h-full rounded-full', a.status === 'delayed' ? 'bg-red-500' : 'bg-indigo-500')}
                                style={{ width: `${a.progress_pct || 0}%` }}
                              />
                            </div>
                            <span className="text-xs text-slate-900 font-medium w-8 text-right">{a.progress_pct || 0}%</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap"><StatusBadge status={a.status} /></td>
                        <td className="px-4 py-3 text-right">
                          <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-indigo-500 transition-colors" />
                        </td>
                      </tr>
                    );
                  })}
                  {filtered.length === 0 && (
                    <tr><td colSpan={8} className="py-16 text-center">
                      <Package className="w-8 h-8 text-slate-300 mx-auto mb-3" />
                      <p className="text-sm text-slate-400">No activities found</p>
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="px-4 py-2.5 border-t border-slate-100 bg-slate-50 text-xs text-slate-400">
              {filtered.length} of {activities.length} activities
            </div>
          </div>}
        </>
      )}

      {/* Detail Slide-over */}
      {selected && (
        <ActivityDetailPanel
          activity={selected}
          onClose={() => setSelected(null)}
          onDelete={() => {
            if (window.confirm('Delete this activity?')) deleteMut.mutate(selected.id);
          }}
          onProgressUpdate={() => { setShowProgress(true); }}
          qc={qc}
        />
      )}

      {/* Add Activity Modal */}
      {showAdd && (
        <AddActivityModal
          projectId={projectId}
          onClose={() => setShowAdd(false)}
          qc={qc}
        />
      )}
    </div>
  );
}

// ─── Detail Slide-over ──────────────────────────────────────────────
function ActivityDetailPanel({ activity: a, onClose, onDelete, qc }) {
  const [pct, setPct]         = useState(a.progress_pct || 0);
  const [status, setStatus]   = useState(a.status);
  const [saving, setSaving]   = useState(false);
  const [bac, setBac]         = useState(a.budget_at_completion || '');
  const [pv, setPv]           = useState(a.planned_value || '');
  const [ev, setEv]           = useState(a.earned_value || '');
  const [ac, setAc]           = useState(a.actual_cost || '');

  const progressMut = useMutation({
    mutationFn: d => planningAPI.updateProgress(a.id, d),
    onSuccess: () => {
      toast.success('Progress updated');
      qc.invalidateQueries({ queryKey: ['planning-activities'] });
      onClose();
    },
    onError: e => toast.error(e?.response?.data?.error || 'Update failed'),
  });

  const costMut = useMutation({
    mutationFn: d => planningP6API.updateActivityEVM(a.id, d),
    onSuccess: () => {
      toast.success('Cost values saved');
      qc.invalidateQueries({ queryKey: ['planning-activities'] });
      qc.invalidateQueries({ queryKey: ['p6-dashboard'] });
      onClose();
    },
    onError: e => toast.error(e?.response?.data?.error || 'Update failed'),
  });

  const cfg  = STATUS_CFG[a.status] || STATUS_CFG.planned;

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="w-full max-w-[560px] bg-white shadow-2xl flex flex-col h-full">

        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
          <div>
            <div className="text-xs font-mono text-indigo-600 font-bold">{a.activity_code}</div>
            <h2 className="text-base font-medium text-slate-900">{a.activity_name}</h2>
          </div>
          <div className="flex items-center gap-2">
            <StatusBadge status={a.status} />
            <button onClick={onClose} className="p-1.5 hover:bg-slate-200 rounded-md text-slate-400"><X className="w-4 h-4" /></button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          <div className="grid grid-cols-2 gap-3">
            <InfoCell label="Type"           value={a.activity_type || '—'} />
            <InfoCell label="Location"       value={a.location || '—'} />
            <InfoCell label="Baseline Start" value={dayjs(a.baseline_start_date).format('DD MMM YYYY')} />
            <InfoCell label="Baseline End"   value={dayjs(a.baseline_end_date).format('DD MMM YYYY')} />
            <InfoCell label="Duration"       value={`${a.baseline_duration} days`} />
            <InfoCell label="Critical Path"  value={a.is_critical_path ? '✅ Yes' : 'No'} />
            {a.planned_quantity && <InfoCell label="Planned Qty" value={`${a.planned_quantity} ${a.measurement_unit || ''}`} />}
            {a.actual_quantity  && <InfoCell label="Actual Qty"  value={`${a.actual_quantity} ${a.measurement_unit || ''}`} />}
          </div>

          {a.description && (
            <div className="bg-slate-50 border border-slate-100 rounded-lg p-3">
              <div className="text-[10px] font-medium text-slate-900 font-medium uppercase tracking-wider mb-1">Description</div>
              <p className="text-sm text-slate-700">{a.description}</p>
            </div>
          )}

          {/* Progress Update */}
          <div className="bg-indigo-50 border border-indigo-100 rounded-lg p-4">
            <div className="text-xs font-medium text-indigo-700 mb-3">Update Progress</div>
            <div className="space-y-3">
              <div>
                <div className="flex justify-between text-xs mb-1.5">
                  <span className="text-slate-600">Progress</span>
                  <span className="font-medium text-indigo-700">{pct}%</span>
                </div>
                <input
                  type="range" min={0} max={100} value={pct}
                  onChange={e => setPct(Number(e.target.value))}
                  className="w-full accent-indigo-600"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-900 block mb-1">Status</label>
                <select
                  value={status}
                  onChange={e => setStatus(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-indigo-400"
                >
                  {Object.entries(STATUS_CFG).map(([k, v]) => (
                    <option key={k} value={k}>{v.label}</option>
                  ))}
                </select>
              </div>
              <button
                onClick={() => progressMut.mutate({ progress_pct: pct, status })}
                disabled={progressMut.isPending}
                className="w-full py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50"
              >
                {progressMut.isPending ? 'Saving…' : 'Save Progress'}
              </button>
            </div>
          </div>

          {/* Cost / EVM */}
          <div className="bg-emerald-50 border border-emerald-100 rounded-lg p-4">
            <div className="text-xs font-medium text-emerald-700 mb-1">Cost / EVM Values</div>
            <p className="text-[10px] text-emerald-700/70 mb-3">
              Feeds the P6 EVM Dashboard (SPI/CPI). For bulk entry across many activities, use
              "Import CSV" with a budget_at_completion column instead.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Budget at Completion (BAC)">
                <input type="number" className="inp" placeholder="0" value={bac} onChange={e => setBac(e.target.value)} />
              </Field>
              <Field label="Planned Value (PV)">
                <input type="number" className="inp" placeholder="0" value={pv} onChange={e => setPv(e.target.value)} />
              </Field>
              <Field label="Earned Value (EV)">
                <input type="number" className="inp" placeholder="0" value={ev} onChange={e => setEv(e.target.value)} />
              </Field>
              <Field label="Actual Cost (AC)">
                <input type="number" className="inp" placeholder="0" value={ac} onChange={e => setAc(e.target.value)} />
              </Field>
            </div>
            <button
              onClick={() => costMut.mutate({
                budget_at_completion: bac === '' ? null : Number(bac),
                planned_value: pv === '' ? 0 : Number(pv),
                earned_value: ev === '' ? 0 : Number(ev),
                actual_cost: ac === '' ? 0 : Number(ac),
              })}
              disabled={costMut.isPending}
              className="w-full mt-3 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 disabled:opacity-50"
            >
              {costMut.isPending ? 'Saving…' : 'Save Cost Values'}
            </button>
          </div>
        </div>

        <div className="border-t border-slate-100 bg-slate-50 px-4 py-3 flex justify-between">
          <button
            onClick={onDelete}
            className="flex items-center gap-1.5 px-3 py-2 text-red-600 text-xs font-medium hover:bg-red-50 rounded-lg transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" /> Delete
          </button>
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-900 hover:bg-slate-200 rounded-lg">Close</button>
        </div>
      </div>
    </div>
  );
}

function InfoCell({ label, value }) {
  return (
    <div className="bg-slate-50 border border-slate-100 rounded-lg p-3">
      <div className="text-[10px] font-medium text-slate-900 font-medium uppercase tracking-wider mb-1">{label}</div>
      <div className="text-sm font-medium text-slate-800">{value}</div>
    </div>
  );
}

// ─── Gantt Chart Component ───────────────────────────────────────────
function GanttChart({ activities, onSelect }) {
  const today = dayjs();

  if (!activities.length) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-16 text-center">
        <GanttChartSquare className="w-10 h-10 text-slate-300 mx-auto mb-3" />
        <p className="text-slate-500 text-sm">No activities to display on Gantt chart</p>
      </div>
    );
  }

  // Compute timeline range
  const allDates = activities.flatMap(a => [
    dayjs(a.baseline_start_date), dayjs(a.baseline_end_date)
  ]);
  const minDate = allDates.reduce((m, d) => d.isBefore(m) ? d : m, allDates[0]).startOf('month');
  const maxDate = allDates.reduce((m, d) => d.isAfter(m) ? d : m, allDates[0]).endOf('month');
  const totalDays = maxDate.diff(minDate, 'day') + 1;

  const toPercent = (date) => {
    const d = dayjs(date);
    return Math.max(0, Math.min(100, (d.diff(minDate, 'day') / totalDays) * 100));
  };
  const toWidth = (start, end) => {
    const s = dayjs(start), e = dayjs(end);
    return Math.max(0.5, ((e.diff(s, 'day') + 1) / totalDays) * 100);
  };

  const todayPct = toPercent(today);

  // Generate month headers
  const months = [];
  let cur = minDate.clone();
  while (cur.isBefore(maxDate) || cur.isSame(maxDate, 'month')) {
    const start = toPercent(cur.startOf('month'));
    const end   = toPercent(cur.endOf('month').add(1, 'day'));
    months.push({ label: cur.format('MMM YY'), left: start, width: end - start });
    cur = cur.add(1, 'month');
  }

  const BAR_COLORS = {
    planned:     'bg-slate-400',
    in_progress: 'bg-indigo-500',
    delayed:     'bg-red-500',
    completed:   'bg-emerald-500',
    cancelled:   'bg-slate-300',
  };

  const ACTUAL_COLORS = {
    in_progress: 'bg-indigo-300',
    completed:   'bg-emerald-300',
    delayed:     'bg-red-300',
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
      {/* Month headers */}
      <div className="flex border-b border-slate-100 bg-slate-50">
        <div className="w-56 flex-shrink-0 px-4 py-2 text-xs font-medium text-slate-500 border-r border-slate-200">Activity</div>
        <div className="flex-1 relative h-8">
          {months.map((m, i) => (
            <div key={i} className="absolute top-0 h-full flex items-center border-r border-slate-200"
              style={{ left: `${m.left}%`, width: `${m.width}%` }}>
              <span className="text-[10px] font-medium text-slate-500 pl-1 truncate">{m.label}</span>
            </div>
          ))}
          {/* Today line */}
          {todayPct >= 0 && todayPct <= 100 && (
            <div className="absolute top-0 bottom-0 w-0.5 bg-red-400 z-10"
              style={{ left: `${todayPct}%` }}>
              <span className="absolute -top-0.5 -translate-x-1/2 text-[9px] text-red-500 font-bold whitespace-nowrap">Today</span>
            </div>
          )}
        </div>
      </div>

      {/* Activity rows */}
      <div className="divide-y divide-slate-50 overflow-auto max-h-[60vh]">
        {activities.map(a => {
          const isCP = a.is_critical_path;
          const barColor = isCP && a.status !== 'completed' ? 'bg-red-500' : (BAR_COLORS[a.status] || 'bg-slate-400');
          const progress = parseFloat(a.progress_pct || 0);
          const haActual = a.actual_start_date;

          return (
            <div key={a.id} className="flex items-center group hover:bg-slate-50 cursor-pointer"
              onClick={() => onSelect(a)}>
              {/* Activity name */}
              <div className="w-56 flex-shrink-0 px-4 py-2.5 border-r border-slate-100">
                <div className="flex items-center gap-1.5">
                  {isCP && <span className="w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0" title="Critical Path" />}
                  <span className="text-xs font-mono text-indigo-600 flex-shrink-0">{a.activity_code}</span>
                </div>
                <div className="text-xs text-slate-700 truncate mt-0.5">{a.activity_name}</div>
                <div className="text-[10px] text-slate-400">{a.baseline_duration}d · {a.progress_pct||0}%</div>
              </div>

              {/* Gantt bar area */}
              <div className="flex-1 relative py-3 px-0 h-14">
                {/* Today marker */}
                {todayPct >= 0 && todayPct <= 100 && (
                  <div className="absolute top-0 bottom-0 w-px bg-red-300 z-10 pointer-events-none"
                    style={{ left: `${todayPct}%` }} />
                )}

                {/* Baseline bar */}
                <div className={`absolute top-3 h-5 rounded-sm ${barColor} opacity-80`}
                  style={{ left: `${toPercent(a.baseline_start_date)}%`, width: `${toWidth(a.baseline_start_date, a.baseline_end_date)}%` }}
                  title={`Baseline: ${a.baseline_start_date} → ${a.baseline_end_date}`}>
                  {/* Progress overlay */}
                  {progress > 0 && (
                    <div className="absolute inset-y-0 left-0 bg-white/30 rounded-sm"
                      style={{ width: `${progress}%` }} />
                  )}
                </div>

                {/* Actual bar (if started) */}
                {haActual && a.actual_start_date && (
                  <div className={`absolute top-8 h-2 rounded-sm ${ACTUAL_COLORS[a.status] || 'bg-slate-200'} opacity-60`}
                    style={{
                      left: `${toPercent(a.actual_start_date)}%`,
                      width: `${toWidth(a.actual_start_date, a.actual_end_date || today.format('YYYY-MM-DD'))}%`
                    }}
                    title={`Actual: ${a.actual_start_date}${a.actual_end_date ? ` → ${a.actual_end_date}` : ' (in progress)'}`} />
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 px-4 py-2.5 border-t border-slate-100 bg-slate-50 text-[10px]">
        {[
          { color:'bg-slate-400', label:'Planned' },
          { color:'bg-indigo-500', label:'In Progress' },
          { color:'bg-red-500', label:'Delayed / Critical Path' },
          { color:'bg-emerald-500', label:'Completed' },
        ].map(l => (
          <div key={l.label} className="flex items-center gap-1">
            <div className={`w-3 h-2 rounded-sm ${l.color}`} />
            <span className="text-slate-500">{l.label}</span>
          </div>
        ))}
        <div className="flex items-center gap-1 ml-2">
          <div className="w-px h-3 bg-red-400" /><span className="text-slate-500">Today</span>
        </div>
      </div>
    </div>
  );
}

// ─── Add Activity Modal ──────────────────────────────────────────────
function AddActivityModal({ projectId, onClose, qc }) {
  const [form, setForm] = useState({
    activity_code: '', activity_name: '', description: '', location: '',
    activity_type: 'civil', baseline_start_date: '', baseline_end_date: '',
    is_critical_path: false, planned_quantity: '', measurement_unit: '',
  });

  const F = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const createMut = useMutation({
    mutationFn: d => planningAPI.createActivity(d),
    onSuccess: () => {
      toast.success('Activity created');
      qc.invalidateQueries({ queryKey: ['planning-activities'] });
      onClose();
    },
    onError: e => toast.error(e?.response?.data?.error || 'Failed to create'),
  });

  const handleSubmit = () => {
    if (!form.activity_code || !form.activity_name || !form.baseline_start_date || !form.baseline_end_date) {
      return toast.error('Code, name and dates are required');
    }
    createMut.mutate({ ...form, project_id: projectId });
  };

  return (
    <div className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-xl rounded-xl shadow-2xl border border-slate-200 flex flex-col max-h-[90vh]">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
          <h2 className="text-base font-medium text-slate-900">Add Activity</h2>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-200 rounded-md text-slate-400"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 overflow-y-auto space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Activity Code *"><input className="inp" placeholder="e.g. FOUND-001" value={form.activity_code} onChange={e => F('activity_code', e.target.value)} /></Field>
            <Field label="Type">
              <select className="inp" value={form.activity_type} onChange={e => F('activity_type', e.target.value)}>
                {['structural','finishing','civil','mechanical','electrical','landscaping','testing','commissioning','other'].map(t => (
                  <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
                ))}
              </select>
            </Field>
            <Field label="Activity Name *" cls="col-span-2"><input className="inp" placeholder="e.g. Foundation Excavation" value={form.activity_name} onChange={e => F('activity_name', e.target.value)} /></Field>
            <Field label="Location"><input className="inp" placeholder="e.g. Block A, Zone 1" value={form.location} onChange={e => F('location', e.target.value)} /></Field>
            <Field label="Unit"><input className="inp" placeholder="CUM, SQM, MT…" value={form.measurement_unit} onChange={e => F('measurement_unit', e.target.value)} /></Field>
            <Field label="Baseline Start *"><input type="date" className="inp" value={form.baseline_start_date} onChange={e => F('baseline_start_date', e.target.value)} /></Field>
            <Field label="Baseline End *"><input type="date" className="inp" value={form.baseline_end_date} onChange={e => F('baseline_end_date', e.target.value)} /></Field>
            <Field label="Planned Quantity"><input type="number" className="inp" value={form.planned_quantity} onChange={e => F('planned_quantity', e.target.value)} /></Field>
            <Field label="Critical Path">
              <select className="inp" value={form.is_critical_path} onChange={e => F('is_critical_path', e.target.value === 'true')}>
                <option value="false">No</option>
                <option value="true">Yes</option>
              </select>
            </Field>
            <Field label="Description" cls="col-span-2">
              <textarea className="inp" rows={2} placeholder="Optional notes…" value={form.description} onChange={e => F('description', e.target.value)} />
            </Field>
          </div>
        </div>
        <div className="px-5 py-3 border-t border-slate-100 bg-slate-50 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-900 hover:bg-slate-200 rounded-lg">Cancel</button>
          <button onClick={handleSubmit} disabled={createMut.isPending} className="px-5 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 shadow-sm">
            {createMut.isPending ? 'Saving…' : 'Create Activity'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children, cls = '' }) {
  return (
    <div className={clsx('space-y-1', cls)}>
      <label className="text-xs font-medium text-slate-600">{label}</label>
      {children}
    </div>
  );
}

// Inject input style
if (typeof document !== 'undefined' && !document.getElementById('planning-styles')) {
  const s = document.createElement('style');
  s.id = 'planning-styles';
  s.textContent = `.inp { width:100%; background:#f8fafc; border:1px solid #e2e8f0; border-radius:0.5rem; padding:0.5rem 0.75rem; font-size:0.875rem; color:#0f172a; outline:none; transition:border-color 0.15s; } .inp:focus { border-color:#818cf8; }`;
  document.head.appendChild(s);
}
