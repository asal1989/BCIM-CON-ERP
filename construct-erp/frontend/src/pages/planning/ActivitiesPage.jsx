// src/pages/planning/ActivitiesPage.jsx
import React, { useState, useMemo, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus, Search, Download, ChevronRight, ChevronDown, X,
  Calendar, MapPin, Package, CheckCircle2,
  Clock, PlayCircle, AlertTriangle, Flag, Filter, Settings, MoreVertical,
  GanttChartSquare, Table2, Columns3, ChevronLeft, Maximize2, Upload,
  IndianRupee, Sparkles, Trash2,
} from 'lucide-react';
import { planningAPI, planningP6API, projectAPI } from '../../api/client';
import useAuthStore from '../../store/authStore';
import toast from 'react-hot-toast';
import { clsx } from 'clsx';
import dayjs from 'dayjs';

// ─────────────────────────────────────────────────────────────────────────
// Status is stored as planned|in_progress|delayed|completed|cancelled;
// displayed as Pending|In Progress|Delayed|Completed|Cancelled to match the
// approved design (label only — no schema/API change).
// ─────────────────────────────────────────────────────────────────────────
const STATUS_CFG = {
  planned:     { label: 'Pending',     text: 'text-amber-700',   bg: 'bg-amber-50',   border: 'border-amber-200',   bar: 'bg-amber-400',   dot: 'bg-amber-500',   icon: Clock },
  in_progress: { label: 'In Progress', text: 'text-blue-700',    bg: 'bg-blue-50',    border: 'border-blue-200',    bar: 'bg-blue-500',    dot: 'bg-blue-500',    icon: PlayCircle },
  delayed:     { label: 'Delayed',     text: 'text-red-700',     bg: 'bg-red-50',     border: 'border-red-200',     bar: 'bg-red-500',     dot: 'bg-red-500',     icon: AlertTriangle },
  completed:   { label: 'Completed',   text: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200', bar: 'bg-emerald-500', dot: 'bg-emerald-500', icon: CheckCircle2 },
  cancelled:   { label: 'Cancelled',   text: 'text-slate-500',   bg: 'bg-slate-100',  border: 'border-slate-200',   bar: 'bg-slate-300',   dot: 'bg-slate-400',   icon: X },
};

const TYPE_CFG = {
  structural: 'bg-purple-50 text-purple-700 border-purple-200',
  finishing:  'bg-pink-50 text-pink-700 border-pink-200',
  civil:      'bg-amber-50 text-amber-700 border-amber-200',
  mechanical: 'bg-cyan-50 text-cyan-700 border-cyan-200',
  electrical: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  other:      'bg-slate-50 text-slate-600 border-slate-200',
};

function StatusBadge({ status }) {
  const cfg = STATUS_CFG[status] || STATUS_CFG.planned;
  return (
    <span className={clsx('inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium', cfg.bg, cfg.text)}>
      {cfg.label}
    </span>
  );
}

function ProgressCell({ pct }) {
  const p = Number(pct) || 0;
  return (
    <div className="flex items-center gap-2 w-28">
      <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.min(p, 100)}%` }} />
      </div>
      <span className="text-xs font-medium text-slate-600 w-8 text-right">{p}%</span>
    </div>
  );
}

// ── Group activities into a two-level tree keyed by `location` (the only
// hierarchy field the schema actually has — e.g. "Tower A" / "Tower B") ────
function groupByLocation(activities) {
  const groups = {};
  for (const a of activities) {
    const key = a.location || 'Ungrouped';
    if (!groups[key]) groups[key] = [];
    groups[key].push(a);
  }
  return Object.entries(groups).map(([label, items]) => {
    const starts = items.map(i => dayjs(i.baseline_start_date));
    const ends   = items.map(i => dayjs(i.baseline_end_date));
    const avgProgress = items.length
      ? Math.round(items.reduce((s, i) => s + (Number(i.progress_pct) || 0), 0) / items.length) : 0;
    const groupStatus = items.every(i => i.status === 'completed') ? 'completed'
      : items.some(i => i.status === 'delayed') ? 'delayed'
      : items.some(i => i.status === 'in_progress') ? 'in_progress'
      : 'planned';
    return {
      key: label, label, items,
      start: starts.reduce((m, d) => d.isBefore(m) ? d : m, starts[0]),
      end:   ends.reduce((m, d) => d.isAfter(m) ? d : m, ends[0]),
      progress: avgProgress,
      status: groupStatus,
    };
  });
}

// ── Timeline window helpers (week-column Gantt) ─────────────────────────
const COL_WEEKS = 6;
function startOfWeek(d) { const x = dayjs(d); return x.subtract((x.day() + 6) % 7, 'day').startOf('day'); }

function buildWeeks(anchor) {
  const weeks = [];
  let cur = startOfWeek(anchor);
  for (let i = 0; i < COL_WEEKS; i++) {
    weeks.push({ start: cur, end: cur.add(6, 'day') });
    cur = cur.add(7, 'day');
  }
  return weeks;
}

export default function ActivitiesPage() {
  const qc = useQueryClient();
  const { user } = useAuthStore();
  const [projectId, setProjectId]       = useState('');
  const [view, setView]                 = useState('gantt'); // gantt | table | board
  const [granularity, setGranularity]   = useState('week');  // day | week | month (display label only for now)
  const [anchor, setAnchor]             = useState(() => startOfWeek(dayjs()));
  const [collapsed, setCollapsed]       = useState({});
  const [showAdd, setShowAdd]           = useState(false);
  const [selected, setSelected]         = useState(null);
  const [showFilter, setShowFilter]     = useState(false);
  const [showMore, setShowMore]         = useState(false);
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch]             = useState('');
  const [importing, setImporting]       = useState(false);
  const [showAutoMatch, setShowAutoMatch] = useState(false);
  const importRef = useRef();

  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: () => projectAPI.list().then(r => r.data?.data ?? []),
  });

  const { data: activities = [], isLoading } = useQuery({
    queryKey: ['planning-activities', projectId],
    queryFn: () => planningAPI.listActivities({ project_id: projectId || undefined })
      .then(r => r.data?.data ?? r.data ?? []).catch(() => []),
    enabled: !!projectId,
  });

  const { data: milestones = [] } = useQuery({
    queryKey: ['planning-milestones', projectId],
    queryFn: () => planningAPI.listMilestones({ project_id: projectId }).then(r => r.data?.data ?? r.data ?? []).catch(() => []),
    enabled: !!projectId,
  });

  const { data: boqChapters = [] } = useQuery({
    queryKey: ['boq-chapters', projectId],
    queryFn: () => planningP6API.listBoqChapters(projectId).then(r => r.data?.data ?? []),
    enabled: !!projectId,
  });

  const filtered = useMemo(() => {
    let list = activities;
    if (statusFilter !== 'all') list = list.filter(a => a.status === statusFilter);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(a =>
        a.activity_name?.toLowerCase().includes(q) ||
        a.activity_code?.toLowerCase().includes(q) ||
        a.location?.toLowerCase().includes(q));
    }
    return list;
  }, [activities, statusFilter, search]);

  const groups = useMemo(() => groupByLocation(filtered), [filtered]);

  // KPIs
  const total      = activities.length;
  const inProgress = activities.filter(a => a.status === 'in_progress').length;
  const completed  = activities.filter(a => a.status === 'completed').length;
  const pending     = activities.filter(a => a.status === 'planned').length;
  const pct = n => total ? `${((n / total) * 100).toFixed(2)}% of total` : '0% of total';

  const deleteMut = useMutation({
    mutationFn: id => planningAPI.deleteActivity(id),
    onSuccess: () => { toast.success('Activity deleted'); qc.invalidateQueries({ queryKey: ['planning-activities'] }); setSelected(null); },
    onError: e => toast.error(e?.response?.data?.error || 'Delete failed'),
  });

  const syncBudgetMut = useMutation({
    mutationFn: () => planningP6API.syncBudgetFromBoq(projectId),
    onSuccess: (res) => {
      const { updated } = res.data.data;
      toast.success(`Budgets synced: ${updated} activities updated`);
      qc.invalidateQueries({ queryKey: ['planning-activities'] });
    },
    onError: e => toast.error(e?.response?.data?.error || 'Sync failed'),
  });

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
      setShowMore(false);
    }
  };

  const toggleGroup = key => setCollapsed(c => ({ ...c, [key]: !c[key] }));

  const weeks = useMemo(() => buildWeeks(anchor), [anchor]);
  const rangeStart = weeks[0].start;
  const rangeEnd   = weeks[weeks.length - 1].end;
  const totalDays  = rangeEnd.diff(rangeStart, 'day') + 1;
  const toPct   = d => Math.max(0, Math.min(100, (dayjs(d).diff(rangeStart, 'day') / totalDays) * 100));
  const toWidth = (s, e) => Math.max(0.6, ((dayjs(e).diff(dayjs(s), 'day') + 1) / totalDays) * 100);
  const todayPct = toPct(dayjs());
  const showToday = dayjs().isAfter(rangeStart.subtract(1, 'day')) && dayjs().isBefore(rangeEnd.add(1, 'day'));

  // Month header groups spanning the visible weeks
  const monthGroups = useMemo(() => {
    const out = [];
    for (const w of weeks) {
      const label = w.start.format('MMM YYYY');
      const last = out[out.length - 1];
      if (last && last.label === label) last.span += 1;
      else out.push({ label, span: 1 });
    }
    return out;
  }, [weeks]);

  return (
    <div className="p-6 md:p-8 max-w-[1500px] mx-auto min-h-screen bg-[#f6f7fb]">

      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-2">
        <span>Planning</span>
        <ChevronRight className="w-3 h-3" />
        <span className="font-semibold text-slate-700">Schedule &amp; Activities</span>
      </div>

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Schedule &amp; Activities</h1>
          <p className="text-sm text-slate-500 mt-0.5">Activity-based project schedule management</p>
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
            <>
              <button
                onClick={() => setShowAdd(true)}
                className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 transition-all shadow-sm"
              >
                <Plus className="w-4 h-4" /> Create Activity
              </button>
              <div className="relative">
                <button onClick={() => setShowFilter(v => !v)}
                  className="w-10 h-10 flex items-center justify-center bg-white border border-slate-200 rounded-xl text-slate-500 hover:bg-slate-50 shadow-sm">
                  <Filter className="w-4 h-4" />
                </button>
                {showFilter && (
                  <div className="absolute right-0 mt-2 w-48 bg-white border border-slate-200 rounded-xl shadow-lg p-2 z-20">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 px-2 py-1">Status</p>
                    {['all', 'planned', 'in_progress', 'delayed', 'completed'].map(s => (
                      <button
                        key={s}
                        onClick={() => { setStatusFilter(s); setShowFilter(false); }}
                        className={clsx('w-full text-left px-2 py-1.5 rounded-lg text-xs font-medium',
                          statusFilter === s ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-50')}
                      >
                        {s === 'all' ? 'All' : STATUS_CFG[s].label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <button title="Settings" className="w-10 h-10 flex items-center justify-center bg-white border border-slate-200 rounded-xl text-slate-500 hover:bg-slate-50 shadow-sm">
                <Settings className="w-4 h-4" />
              </button>
              <div className="relative">
                <button onClick={() => setShowMore(v => !v)}
                  className="w-10 h-10 flex items-center justify-center bg-white border border-slate-200 rounded-xl text-slate-500 hover:bg-slate-50 shadow-sm">
                  <MoreVertical className="w-4 h-4" />
                </button>
                {showMore && (
                  <div className="absolute right-0 mt-2 w-56 bg-white border border-slate-200 rounded-xl shadow-lg py-1.5 z-20">
                    <input ref={importRef} type="file" accept=".csv" className="hidden" onChange={handleImport} />
                    <button onClick={() => importRef.current?.click()} disabled={importing}
                      className="w-full flex items-center gap-2 text-left px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50">
                      <Upload className="w-3.5 h-3.5" /> {importing ? 'Importing…' : 'Import CSV'}
                    </button>
                    <button onClick={() => { planningAPI.downloadActivityTemplate().then(r => {
                      const url = URL.createObjectURL(r.data);
                      const a = document.createElement('a'); a.href = url; a.download = 'activity-template.csv'; a.click();
                    }); setShowMore(false); }}
                      className="w-full flex items-center gap-2 text-left px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50">
                      <Download className="w-3.5 h-3.5" /> Download Template
                    </button>
                    <button onClick={() => { setShowAutoMatch(true); setShowMore(false); }}
                      className="w-full flex items-center gap-2 text-left px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50">
                      <Sparkles className="w-3.5 h-3.5" /> Auto-Match BOQ
                    </button>
                    <button onClick={() => { syncBudgetMut.mutate(); setShowMore(false); }} disabled={syncBudgetMut.isPending}
                      className="w-full flex items-center gap-2 text-left px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50">
                      <IndianRupee className="w-3.5 h-3.5" /> {syncBudgetMut.isPending ? 'Syncing…' : 'Sync Budgets from BOQ'}
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {!projectId ? (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-16 text-center">
          <GanttChartSquare className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500 font-medium">Select a project to view its schedule</p>
        </div>
      ) : (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-5">
            <KpiCard icon={Calendar} iconBg="bg-blue-50" iconColor="text-blue-600" label="Total Activities" value={total} sub="All Activities" />
            <KpiCard icon={PlayCircle} iconBg="bg-blue-50" iconColor="text-blue-600" label="In Progress" value={inProgress} sub={pct(inProgress)} barColor="bg-blue-500" barPct={total ? (inProgress / total) * 100 : 0} />
            <KpiCard icon={CheckCircle2} iconBg="bg-emerald-50" iconColor="text-emerald-600" label="Completed" value={completed} sub={pct(completed)} barColor="bg-emerald-500" barPct={total ? (completed / total) * 100 : 0} />
            <KpiCard icon={Clock} iconBg="bg-amber-50" iconColor="text-amber-600" label="Pending" value={pending} sub={pct(pending)} barColor="bg-amber-400" barPct={total ? (pending / total) * 100 : 0} />
            <KpiCard icon={Flag} iconBg="bg-purple-50" iconColor="text-purple-600" label="Milestones" value={milestones.length} sub="Key Milestones" />
          </div>

          {/* Toolbar */}
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-2.5 mb-4 flex flex-wrap items-center gap-3">
            {/* View tabs */}
            <div className="flex bg-slate-100 rounded-lg p-1 gap-0.5">
              {[
                ['gantt', 'Gantt View', GanttChartSquare],
                ['table', 'Table View', Table2],
                ['board', 'Board View', Columns3],
              ].map(([val, label, Icon]) => (
                <button
                  key={val}
                  onClick={() => setView(val)}
                  className={clsx('flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all',
                    view === val ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700')}
                >
                  <Icon className="w-3.5 h-3.5" /> {label}
                </button>
              ))}
            </div>

            {view === 'gantt' && (
              <>
                <div className="h-6 w-px bg-slate-200" />
                <button onClick={() => setAnchor(startOfWeek(dayjs()))}
                  className="px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-50">
                  Today
                </button>
                <button onClick={() => setAnchor(a => a.subtract(COL_WEEKS, 'week'))}
                  className="w-8 h-8 flex items-center justify-center border border-slate-200 rounded-lg text-slate-500 hover:bg-slate-50">
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button onClick={() => setAnchor(a => a.add(COL_WEEKS, 'week'))}
                  className="w-8 h-8 flex items-center justify-center border border-slate-200 rounded-lg text-slate-500 hover:bg-slate-50">
                  <ChevronRight className="w-4 h-4" />
                </button>
                <div className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-medium text-slate-600">
                  <Calendar className="w-3.5 h-3.5 text-slate-400" />
                  {rangeStart.format('MMM D')} – {rangeEnd.format('MMM D, YYYY')}
                </div>
              </>
            )}

            <div className="ml-auto flex items-center gap-2">
              {view === 'gantt' && (
                <select value={granularity} onChange={e => setGranularity(e.target.value)}
                  className="border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-600 outline-none">
                  <option value="day">Day</option>
                  <option value="week">Week</option>
                  <option value="month">Month</option>
                </select>
              )}
              <button onClick={() => {
                const header = ['Location', 'Code', 'Activity', 'Start', 'End', 'Duration', 'Progress', 'Status'];
                const csv = [header, ...filtered.map(a => [
                  a.location || '', a.activity_code, a.activity_name,
                  a.baseline_start_date, a.baseline_end_date, a.baseline_duration,
                  `${a.progress_pct || 0}%`, STATUS_CFG[a.status]?.label || a.status,
                ])].map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
                const blob = new Blob([csv], { type: 'text/csv' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a'); a.href = url; a.download = 'schedule-export.csv'; a.click();
              }}
                className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-50">
                <Download className="w-3.5 h-3.5" /> Export
              </button>
              <button title="Fullscreen" className="w-8 h-8 flex items-center justify-center border border-slate-200 rounded-lg text-slate-500 hover:bg-slate-50">
                <Maximize2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Search (secondary row, table/board only) */}
          {view !== 'gantt' && (
            <div className="bg-white border border-slate-200 rounded-xl p-2.5 mb-4">
              <div className="relative max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search activity name, code, location…"
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-9 pr-4 py-2 text-sm outline-none focus:border-indigo-400"
                />
              </div>
            </div>
          )}

          {isLoading ? (
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-16 text-center text-sm text-slate-400">Loading schedule…</div>
          ) : (
            <>
              {view === 'gantt' && (
                <GanttPanel
                  groups={groups} collapsed={collapsed} onToggle={toggleGroup}
                  weeks={weeks} monthGroups={monthGroups} toPct={toPct} toWidth={toWidth}
                  todayPct={todayPct} showToday={showToday} onSelect={setSelected}
                />
              )}
              {view === 'table' && (
                <TablePanel groups={groups} collapsed={collapsed} onToggle={toggleGroup}
                  boqChapters={boqChapters} onSelect={setSelected} />
              )}
              {view === 'board' && <BoardPanel activities={filtered} onSelect={setSelected} />}
            </>
          )}
        </>
      )}

      {/* Detail Slide-over */}
      {selected && (
        <ActivityDetailPanel
          activity={selected}
          onClose={() => setSelected(null)}
          onDelete={() => { if (window.confirm('Delete this activity?')) deleteMut.mutate(selected.id); }}
          qc={qc}
        />
      )}

      {showAdd && <AddActivityModal projectId={projectId} onClose={() => setShowAdd(false)} qc={qc} />}
      {showAutoMatch && <AutoMatchModal projectId={projectId} onClose={() => setShowAutoMatch(false)} qc={qc} />}
    </div>
  );
}

// ─── KPI Card ─────────────────────────────────────────────────────────────
function KpiCard({ icon: Icon, iconBg, iconColor, label, value, sub, barColor, barPct }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-4">
      <div className={clsx('w-10 h-10 rounded-lg flex items-center justify-center mb-3', iconBg)}>
        <Icon className={clsx('w-5 h-5', iconColor)} />
      </div>
      <div className="text-2xl font-bold text-slate-900 leading-tight">{value}</div>
      <div className="text-xs font-semibold text-slate-700 mt-1">{label}</div>
      <div className="text-[11px] text-slate-400 mt-0.5">{sub}</div>
      {barColor && (
        <div className="h-1 bg-slate-100 rounded-full overflow-hidden mt-2">
          <div className={clsx('h-full rounded-full', barColor)} style={{ width: `${barPct || 0}%` }} />
        </div>
      )}
    </div>
  );
}

// ─── Gantt Panel (hierarchical, grouped by Tower/location) ────────────────
function GanttPanel({ groups, collapsed, onToggle, weeks, monthGroups, toPct, toWidth, todayPct, showToday, onSelect }) {
  if (!groups.length) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-16 text-center">
        <GanttChartSquare className="w-10 h-10 text-slate-300 mx-auto mb-3" />
        <p className="text-slate-500 text-sm">No activities to display</p>
      </div>
    );
  }

  const ROW_H = 46;

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
      <div className="flex">
        {/* Left fixed panel */}
        <div className="w-[560px] flex-shrink-0 border-r border-slate-100">
          <div className="grid grid-cols-[90px_1fr_78px_78px_110px_90px] bg-slate-50 border-b border-slate-100 text-[10px] font-semibold uppercase tracking-wider text-slate-400" style={{ height: 56 }}>
            <div className="flex items-center px-3">Activity ID</div>
            <div className="flex items-center px-3">Activity Name</div>
            <div className="flex items-center px-2">Start</div>
            <div className="flex items-center px-2">End</div>
            <div className="flex items-center px-2">Progress</div>
            <div className="flex items-center px-2">Status</div>
          </div>
          <div className="overflow-y-auto" style={{ maxHeight: '60vh' }}>
            {groups.map(g => (
              <React.Fragment key={g.key}>
                <div className="grid grid-cols-[90px_1fr_78px_78px_110px_90px] items-center border-b border-slate-50 bg-slate-50/60 cursor-pointer hover:bg-slate-100"
                  style={{ height: ROW_H }} onClick={() => onToggle(g.key)}>
                  <div className="px-3 flex items-center gap-1 text-xs font-mono text-slate-500">
                    {collapsed[g.key] ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  </div>
                  <div className="px-3 text-xs font-bold text-slate-800 truncate">{g.label}</div>
                  <div className="px-2 text-xs text-slate-500">{g.start.format('DD MMM')}</div>
                  <div className="px-2 text-xs text-slate-500">{g.end.format('DD MMM')}</div>
                  <div className="px-2"><ProgressCell pct={g.progress} /></div>
                  <div className="px-2"><StatusBadge status={g.status} /></div>
                </div>
                {!collapsed[g.key] && g.items.map(a => (
                  <div key={a.id} className="grid grid-cols-[90px_1fr_78px_78px_110px_90px] items-center border-b border-slate-50 cursor-pointer hover:bg-slate-50 group"
                    style={{ height: ROW_H }} onClick={() => onSelect(a)}>
                    <div className="px-3 text-xs font-mono text-indigo-600 group-hover:underline">{a.activity_code}</div>
                    <div className="pl-6 pr-3 relative text-xs text-slate-700 truncate">
                      <span className="absolute left-3 top-0 bottom-0 w-px bg-slate-200" />
                      <span className="absolute left-3 top-1/2 w-2.5 h-px bg-slate-200" />
                      {a.activity_name}
                    </div>
                    <div className="px-2 text-xs text-slate-500">{dayjs(a.baseline_start_date).format('DD MMM')}</div>
                    <div className="px-2 text-xs text-slate-500">{dayjs(a.baseline_end_date).format('DD MMM')}</div>
                    <div className="px-2"><ProgressCell pct={a.progress_pct} /></div>
                    <div className="px-2"><StatusBadge status={a.status} /></div>
                  </div>
                ))}
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* Scrollable timeline */}
        <div className="flex-1 overflow-x-auto">
          <div style={{ minWidth: 900 }}>
            {/* Month header */}
            <div className="flex border-b border-slate-100" style={{ height: 28 }}>
              {monthGroups.map((m, i) => (
                <div key={i} className="flex items-center justify-center text-[11px] font-semibold text-slate-500 border-r border-slate-100"
                  style={{ width: `${(m.span / weeks.length) * 100}%` }}>
                  {m.label}
                </div>
              ))}
            </div>
            {/* Week header */}
            <div className="flex border-b border-slate-100 relative bg-slate-50" style={{ height: 28 }}>
              {weeks.map((w, i) => (
                <div key={i} className="flex items-center justify-center text-[10px] font-medium text-slate-400 border-r border-slate-100"
                  style={{ width: `${100 / weeks.length}%` }}>
                  {w.start.format('DD MMM')} – {w.end.format('DD MMM')}
                </div>
              ))}
              {showToday && (
                <div className="absolute top-0 bottom-0" style={{ left: `${todayPct}%` }}>
                  <span className="bg-indigo-600 text-white text-[9px] font-bold px-1.5 py-0.5 rounded whitespace-nowrap -translate-x-1/2 block mt-0.5">Today</span>
                </div>
              )}
            </div>

            {/* Rows */}
            <div className="relative">
              {showToday && (
                <div className="absolute top-0 bottom-0 w-px bg-indigo-300 z-10 pointer-events-none" style={{ left: `${todayPct}%` }} />
              )}
              {groups.map(g => (
                <React.Fragment key={g.key}>
                  <div className="relative border-b border-slate-50 bg-slate-50/60" style={{ height: ROW_H }}>
                    <GanttBar start={g.start} end={g.end} pct={g.progress} status={g.status} toPct={toPct} toWidth={toWidth} bold />
                  </div>
                  {!collapsed[g.key] && g.items.map(a => (
                    <div key={a.id} className="relative border-b border-slate-50 hover:bg-slate-50 cursor-pointer" style={{ height: ROW_H }} onClick={() => onSelect(a)}>
                      <GanttBar start={a.baseline_start_date} end={a.baseline_end_date} pct={a.progress_pct} status={a.status} toPct={toPct} toWidth={toWidth} />
                    </div>
                  ))}
                </React.Fragment>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4 px-4 py-2.5 border-t border-slate-100 bg-slate-50 text-[11px]">
        {['completed', 'in_progress', 'planned', 'delayed'].map(s => (
          <div key={s} className="flex items-center gap-1.5">
            <span className={clsx('w-2.5 h-2.5 rounded-full', STATUS_CFG[s].dot)} />
            <span className="text-slate-500">{STATUS_CFG[s].label}</span>
          </div>
        ))}
        <div className="flex items-center gap-1.5">
          <Flag className="w-3 h-3 text-purple-500" />
          <span className="text-slate-500">Milestone</span>
        </div>
      </div>
    </div>
  );
}

function GanttBar({ start, end, pct, status, toPct, toWidth, bold }) {
  const cfg = STATUS_CFG[status] || STATUS_CFG.planned;
  const left = toPct(start);
  const width = toWidth(start, end);
  const p = Number(pct) || 0;
  return (
    <div
      className={clsx('absolute top-1/2 -translate-y-1/2 rounded-md flex items-center justify-end px-1.5 shadow-sm', cfg.bar, bold ? 'h-6' : 'h-5')}
      style={{ left: `${left}%`, width: `${width}%` }}
      title={`${dayjs(start).format('DD MMM YYYY')} → ${dayjs(end).format('DD MMM YYYY')} · ${p}%`}
    >
      {p > 0 && <span className="text-[9px] font-bold text-white whitespace-nowrap">{p}%</span>}
    </div>
  );
}

// ─── Table Panel ────────────────────────────────────────────────────────
function TablePanel({ groups, collapsed, onToggle, boqChapters, onSelect }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-100">
              {['Code', 'Activity', 'Type', 'Baseline Dates', 'Duration', 'BOQ Chapter', 'Budget (BAC)', 'Progress', 'Status', ''].map(h => (
                <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {groups.map(g => (
              <React.Fragment key={g.key}>
                <tr className="bg-slate-50/60 cursor-pointer hover:bg-slate-100" onClick={() => onToggle(g.key)}>
                  <td className="px-4 py-2.5" colSpan={2}>
                    <div className="flex items-center gap-1.5 font-bold text-slate-800 text-xs">
                      {collapsed[g.key] ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                      {g.label}
                    </div>
                  </td>
                  <td colSpan={4} />
                  <td className="px-4 py-2.5"><ProgressCell pct={g.progress} /></td>
                  <td className="px-4 py-2.5"><StatusBadge status={g.status} /></td>
                  <td />
                </tr>
                {!collapsed[g.key] && g.items.map(a => {
                  const isOverdue = a.status !== 'completed' && dayjs(a.baseline_end_date).isBefore(dayjs());
                  return (
                    <tr key={a.id} onClick={() => onSelect(a)} className="cursor-pointer hover:bg-slate-50 transition-colors group">
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="text-xs font-mono text-indigo-600 group-hover:underline">{a.activity_code}</span>
                        {a.is_critical_path && <span className="ml-1.5 text-[9px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded font-bold">CP</span>}
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-xs font-medium text-slate-800 max-w-52 truncate">{a.activity_name}</div>
                        {a.location && <div className="text-xs text-slate-400 flex items-center gap-1 mt-0.5"><MapPin className="w-3 h-3" />{a.location}</div>}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className={clsx('text-xs px-2 py-0.5 rounded border font-medium capitalize', TYPE_CFG[a.activity_type] || TYPE_CFG.other)}>
                          {a.activity_type || '—'}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="text-xs text-slate-700">{dayjs(a.baseline_start_date).format('DD MMM')}</div>
                        <div className={clsx('text-xs', isOverdue ? 'text-red-500 font-semibold' : 'text-slate-400')}>
                          → {dayjs(a.baseline_end_date).format('DD MMM YY')}
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-xs font-mono text-slate-600">{a.baseline_duration}d</td>
                      <td className="px-4 py-3 whitespace-nowrap" onClick={e => e.stopPropagation()}>
                        <ChapterCell activity={a} chapters={boqChapters} />
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap" onClick={e => e.stopPropagation()}>
                        <BudgetCell activity={a} />
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap w-32"><ProgressCell pct={a.progress_pct} /></td>
                      <td className="px-4 py-3 whitespace-nowrap"><StatusBadge status={a.status} /></td>
                      <td className="px-4 py-3 text-right">
                        <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-indigo-500 transition-colors" />
                      </td>
                    </tr>
                  );
                })}
              </React.Fragment>
            ))}
            {groups.length === 0 && (
              <tr><td colSpan={10} className="py-16 text-center">
                <Package className="w-8 h-8 text-slate-300 mx-auto mb-3" />
                <p className="text-sm text-slate-400">No activities found</p>
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Board (Kanban) Panel ──────────────────────────────────────────────
function BoardPanel({ activities, onSelect }) {
  const cols = ['planned', 'in_progress', 'delayed', 'completed'];
  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
      {cols.map(status => {
        const cfg = STATUS_CFG[status];
        const items = activities.filter(a => a.status === status);
        return (
          <div key={status} className="bg-slate-50 border border-slate-200 rounded-xl p-3">
            <div className="flex items-center gap-2 mb-3 px-1">
              <span className={clsx('w-2 h-2 rounded-full', cfg.dot)} />
              <span className="text-xs font-bold text-slate-700 uppercase tracking-wide">{cfg.label}</span>
              <span className="ml-auto text-xs font-semibold text-slate-400">{items.length}</span>
            </div>
            <div className="space-y-2 max-h-[65vh] overflow-y-auto">
              {items.map(a => (
                <div key={a.id} onClick={() => onSelect(a)}
                  className="bg-white border border-slate-200 rounded-lg p-3 cursor-pointer hover:shadow-md hover:border-indigo-200 transition-all">
                  <div className="text-xs font-mono text-indigo-600 mb-1">{a.activity_code}</div>
                  <div className="text-xs font-semibold text-slate-800 mb-1.5">{a.activity_name}</div>
                  {a.location && <div className="text-[10px] text-slate-400 flex items-center gap-1 mb-2"><MapPin className="w-2.5 h-2.5" />{a.location}</div>}
                  <div className="text-[10px] text-slate-400 mb-2">
                    {dayjs(a.baseline_start_date).format('DD MMM')} → {dayjs(a.baseline_end_date).format('DD MMM YY')}
                  </div>
                  <ProgressCell pct={a.progress_pct} />
                </div>
              ))}
              {items.length === 0 && <div className="text-center text-[11px] text-slate-300 py-6">No activities</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Detail Slide-over ──────────────────────────────────────────────
function ActivityDetailPanel({ activity: a, onClose, onDelete, qc }) {
  const [pct, setPct]         = useState(a.progress_pct || 0);
  const [status, setStatus]   = useState(a.status);
  const [bac, setBac]         = useState(a.budget_at_completion || '');
  const [pv, setPv]           = useState(a.planned_value || '');
  const [ev, setEv]           = useState(a.earned_value || '');
  const [ac, setAc]           = useState(a.actual_cost || '');

  const progressMut = useMutation({
    mutationFn: d => planningAPI.updateProgress(a.id, d),
    onSuccess: () => { toast.success('Progress updated'); qc.invalidateQueries({ queryKey: ['planning-activities'] }); onClose(); },
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

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="w-full max-w-[560px] bg-white shadow-2xl flex flex-col h-full">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
          <div>
            <div className="text-xs font-mono text-indigo-600 font-bold">{a.activity_code}</div>
            <h2 className="text-base font-bold text-slate-900">{a.activity_name}</h2>
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
              <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Description</div>
              <p className="text-sm text-slate-700">{a.description}</p>
            </div>
          )}

          <div className="bg-indigo-50 border border-indigo-100 rounded-lg p-4">
            <div className="text-xs font-semibold text-indigo-700 mb-3">Update Progress</div>
            <div className="space-y-3">
              <div>
                <div className="flex justify-between text-xs mb-1.5">
                  <span className="text-slate-600">Progress</span>
                  <span className="font-semibold text-indigo-700">{pct}%</span>
                </div>
                <input type="range" min={0} max={100} value={pct} onChange={e => setPct(Number(e.target.value))} className="w-full accent-indigo-600" />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-500 block mb-1">Status</label>
                <select value={status} onChange={e => setStatus(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-indigo-400">
                  {Object.entries(STATUS_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>
              <button onClick={() => progressMut.mutate({ progress_pct: pct, status })} disabled={progressMut.isPending}
                className="w-full py-2 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700 disabled:opacity-50">
                {progressMut.isPending ? 'Saving…' : 'Save Progress'}
              </button>
            </div>
          </div>

          <div className="bg-emerald-50 border border-emerald-100 rounded-lg p-4">
            <div className="text-xs font-semibold text-emerald-700 mb-1">Cost / EVM Values</div>
            <p className="text-[10px] text-emerald-700/70 mb-3">
              Feeds the P6 EVM Dashboard (SPI/CPI). For bulk entry, use "Import CSV" with a budget_at_completion column.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Budget at Completion (BAC)"><input type="number" className="inp" placeholder="0" value={bac} onChange={e => setBac(e.target.value)} /></Field>
              <Field label="Planned Value (PV)"><input type="number" className="inp" placeholder="0" value={pv} onChange={e => setPv(e.target.value)} /></Field>
              <Field label="Earned Value (EV)"><input type="number" className="inp" placeholder="0" value={ev} onChange={e => setEv(e.target.value)} /></Field>
              <Field label="Actual Cost (AC)"><input type="number" className="inp" placeholder="0" value={ac} onChange={e => setAc(e.target.value)} /></Field>
            </div>
            <button
              onClick={() => costMut.mutate({
                budget_at_completion: bac === '' ? null : Number(bac),
                planned_value: pv === '' ? 0 : Number(pv),
                earned_value: ev === '' ? 0 : Number(ev),
                actual_cost: ac === '' ? 0 : Number(ac),
              })}
              disabled={costMut.isPending}
              className="w-full mt-3 py-2 bg-emerald-600 text-white text-sm font-semibold rounded-lg hover:bg-emerald-700 disabled:opacity-50"
            >
              {costMut.isPending ? 'Saving…' : 'Save Cost Values'}
            </button>
          </div>
        </div>

        <div className="border-t border-slate-100 bg-slate-50 px-4 py-3 flex justify-between">
          <button onClick={onDelete} className="flex items-center gap-1.5 px-3 py-2 text-red-600 text-xs font-semibold hover:bg-red-50 rounded-lg transition-colors">
            <Trash2 className="w-3.5 h-3.5" /> Delete
          </button>
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-200 rounded-lg">Close</button>
        </div>
      </div>
    </div>
  );
}

// ─── Inline BOQ Chapter picker ──────────────────────────────────────
function ChapterCell({ activity: a, chapters }) {
  const qc = useQueryClient();
  const mut = useMutation({
    mutationFn: chapterNo => planningP6API.setActivityChapter(a.id, chapterNo || null),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['planning-activities'] }),
    onError: e => toast.error(e?.response?.data?.error || 'Failed to save chapter'),
  });
  const selected = chapters.find(c => c.key === a.boq_chapter_no);
  return (
    <select value={a.boq_chapter_no || ''} onChange={e => mut.mutate(e.target.value)} disabled={mut.isPending}
      className={clsx('text-xs border rounded-md px-2 py-1 outline-none max-w-40 disabled:opacity-50',
        a.boq_chapter_no ? 'border-slate-200 text-slate-700' : 'border-dashed border-slate-300 text-slate-400 italic')}>
      <option value="">— None —</option>
      {chapters.map(c => <option key={c.key} value={c.key}>{c.chapter_no}{c.chapter_name ? ` — ${c.chapter_name}` : ''}</option>)}
      {a.boq_chapter_no && !selected && <option value={a.boq_chapter_no}>{a.boq_chapter_no} (not in BOQ)</option>}
    </select>
  );
}

const CONFIDENCE_CFG = {
  high:   { label: 'High',   color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  medium: { label: 'Medium', color: 'bg-amber-50 text-amber-700 border-amber-200' },
  low:    { label: 'Low',    color: 'bg-slate-100 text-slate-500 border-slate-200' },
};

// ─── Auto-Match BOQ Chapters Modal ──────────────────────────────────
function AutoMatchModal({ projectId, onClose, qc }) {
  const [checked, setChecked] = useState({});
  const { data, isLoading, isError } = useQuery({
    queryKey: ['auto-match-boq-chapters', projectId],
    queryFn: () => planningP6API.autoMatchBoqChapters(projectId).then(r => r.data?.data),
  });
  const matches = data?.matches ?? [];

  React.useEffect(() => {
    if (!matches.length) return;
    setChecked(prev => {
      if (Object.keys(prev).length) return prev;
      const next = {};
      matches.forEach(m => { next[m.activity_id] = m.confidence !== 'low'; });
      return next;
    });
  }, [matches]);

  const applyMut = useMutation({
    mutationFn: (selectedMatches) => planningP6API.applyBoqChapterMatches(selectedMatches),
    onSuccess: (res) => {
      toast.success(`Applied ${res.data.data.applied} BOQ chapter link${res.data.data.applied === 1 ? '' : 's'}`);
      qc.invalidateQueries({ queryKey: ['planning-activities'] });
      onClose();
    },
    onError: e => toast.error(e?.response?.data?.error || 'Failed to apply matches'),
  });

  const selectedCount = Object.values(checked).filter(Boolean).length;
  const handleApply = () => {
    const selectedMatches = matches.filter(m => checked[m.activity_id]).map(m => ({ activity_id: m.activity_id, boq_chapter_key: m.boq_chapter_key }));
    if (!selectedMatches.length) { toast('Nothing selected', { icon: '⚠️' }); return; }
    applyMut.mutate(selectedMatches);
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[85vh] flex flex-col">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="font-bold text-slate-900 flex items-center gap-2"><Sparkles className="w-4 h-4 text-indigo-600" /> Auto-Match BOQ Chapters</h3>
            <p className="text-xs text-slate-500 mt-0.5">Suggested BOQ chapter links based on keyword overlap. Review before applying.</p>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-200 rounded-md text-slate-400"><X className="w-4 h-4" /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-3">
          {isLoading ? (
            <div className="py-16 text-center text-slate-400 text-sm">Scanning activities and BOQ chapters…</div>
          ) : isError ? (
            <div className="py-16 text-center text-red-500 text-sm">Failed to compute matches.</div>
          ) : matches.length === 0 ? (
            <div className="py-16 text-center text-slate-400 text-sm">No confident matches found — link manually from the table.</div>
          ) : (
            <>
              <div className="text-xs text-slate-500 mb-2 flex items-center justify-between">
                <span>{matches.length} suggested match{matches.length === 1 ? '' : 'es'}</span>
                <span>{selectedCount} selected</span>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-slate-400 border-b border-slate-100">
                    <th className="py-1.5 pr-2 w-8" />
                    <th className="py-1.5 pr-2">Activity</th>
                    <th className="py-1.5 pr-2">Suggested Chapter</th>
                    <th className="py-1.5 pr-2">Confidence</th>
                  </tr>
                </thead>
                <tbody>
                  {matches.map(m => (
                    <tr key={m.activity_id} className="border-b border-slate-50 hover:bg-slate-50">
                      <td className="py-1.5 pr-2">
                        <input type="checkbox" checked={!!checked[m.activity_id]}
                          onChange={e => setChecked(prev => ({ ...prev, [m.activity_id]: e.target.checked }))} />
                      </td>
                      <td className="py-1.5 pr-2">
                        <div className="text-slate-900">{m.activity_name}</div>
                        <div className="text-xs text-slate-400 font-mono">{m.activity_code}</div>
                      </td>
                      <td className="py-1.5 pr-2 text-slate-700">{m.chapter_no}{m.chapter_name ? ` — ${m.chapter_name}` : ''}</td>
                      <td className="py-1.5 pr-2">
                        <span className={clsx('inline-flex px-2 py-0.5 rounded-md text-xs font-medium border', CONFIDENCE_CFG[m.confidence].color)}>
                          {CONFIDENCE_CFG[m.confidence].label}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>
        <div className="border-t border-slate-100 px-5 py-3 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-200 rounded-lg">Cancel</button>
          <button onClick={handleApply} disabled={applyMut.isPending || matches.length === 0}
            className="px-5 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700 disabled:opacity-50 shadow-sm">
            {applyMut.isPending ? 'Applying…' : `Apply Selected (${selectedCount})`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Inline-editable Budget (BAC) cell ─────────────────────────────
function BudgetCell({ activity: a }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [value, setValue]     = useState(a.budget_at_completion || '');

  const mut = useMutation({
    mutationFn: bac => planningP6API.updateActivityEVM(a.id, {
      budget_at_completion: bac, planned_value: a.planned_value || 0, earned_value: a.earned_value || 0, actual_cost: a.actual_cost || 0,
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['planning-activities'] }); qc.invalidateQueries({ queryKey: ['p6-dashboard'] }); },
    onError: e => { toast.error(e?.response?.data?.error || 'Failed to save budget'); setValue(a.budget_at_completion || ''); },
  });

  const save = () => {
    setEditing(false);
    const num = value === '' ? 0 : Number(value);
    if (Number.isNaN(num)) { setValue(a.budget_at_completion || ''); return; }
    if (num === Number(a.budget_at_completion || 0)) return;
    mut.mutate(num);
  };

  if (editing) {
    return (
      <input type="number" autoFocus value={value} onChange={e => setValue(e.target.value)} onBlur={save}
        onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') { setValue(a.budget_at_completion || ''); setEditing(false); } }}
        className="w-28 border border-indigo-300 rounded-md px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-indigo-400" />
    );
  }
  return (
    <button onClick={() => setEditing(true)} disabled={mut.isPending}
      className="text-xs px-2 py-1 rounded-md text-slate-700 hover:text-indigo-600 hover:bg-indigo-50 transition-colors disabled:opacity-50" title="Click to edit budget">
      {mut.isPending ? 'Saving…' : a.budget_at_completion > 0 ? `₹${Number(a.budget_at_completion).toLocaleString('en-IN')}` : <span className="text-slate-400 italic">+ Add budget</span>}
    </button>
  );
}

function InfoCell({ label, value }) {
  return (
    <div className="bg-slate-50 border border-slate-100 rounded-lg p-3">
      <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">{label}</div>
      <div className="text-sm font-medium text-slate-800">{value}</div>
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
    onSuccess: () => { toast.success('Activity created'); qc.invalidateQueries({ queryKey: ['planning-activities'] }); onClose(); },
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
          <h2 className="text-base font-bold text-slate-900">Create Activity</h2>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-200 rounded-md text-slate-400"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 overflow-y-auto space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Activity Code *"><input className="inp" placeholder="e.g. A-F24" value={form.activity_code} onChange={e => F('activity_code', e.target.value)} /></Field>
            <Field label="Type">
              <select className="inp" value={form.activity_type} onChange={e => F('activity_type', e.target.value)}>
                {['structural', 'finishing', 'civil', 'mechanical', 'electrical', 'other'].map(t => (
                  <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
                ))}
              </select>
            </Field>
            <Field label="Activity Name *" cls="col-span-2"><input className="inp" placeholder="e.g. 24th Floor" value={form.activity_name} onChange={e => F('activity_name', e.target.value)} /></Field>
            <Field label="Location"><input className="inp" placeholder="e.g. Tower A" value={form.location} onChange={e => F('location', e.target.value)} /></Field>
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
            <Field label="Description" cls="col-span-2"><textarea className="inp" rows={2} placeholder="Optional notes…" value={form.description} onChange={e => F('description', e.target.value)} /></Field>
          </div>
        </div>
        <div className="px-5 py-3 border-t border-slate-100 bg-slate-50 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-200 rounded-lg">Cancel</button>
          <button onClick={handleSubmit} disabled={createMut.isPending} className="px-5 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700 disabled:opacity-50 shadow-sm">
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

if (typeof document !== 'undefined' && !document.getElementById('planning-styles')) {
  const s = document.createElement('style');
  s.id = 'planning-styles';
  s.textContent = `.inp { width:100%; background:#f8fafc; border:1px solid #e2e8f0; border-radius:0.5rem; padding:0.5rem 0.75rem; font-size:0.875rem; color:#0f172a; outline:none; transition:border-color 0.15s; } .inp:focus { border-color:#818cf8; }`;
  document.head.appendChild(s);
}
