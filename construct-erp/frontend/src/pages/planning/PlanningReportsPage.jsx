// Planning Reports — DPR Analytics, Resource Trend, Weekly Summary
import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart2, TrendingUp, Users, Package, CloudRain, Sun,
  Cloud, Calendar, Download, RefreshCw, FileText,
} from 'lucide-react';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend, Cell,
} from 'recharts';
import { planningAPI, projectAPI } from '../../api/client';
import dayjs from 'dayjs';

const fmt = (v) => Number(v || 0).toLocaleString('en-IN', { maximumFractionDigits: 1 });
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

const WEATHER_CFG = {
  sunny:  { icon: Sun,       color: '#f59e0b', label: 'Sunny' },
  cloudy: { icon: Cloud,     color: '#94a3b8', label: 'Cloudy' },
  rainy:  { icon: CloudRain, color: '#3b82f6', label: 'Rainy' },
  normal: { icon: Sun,       color: '#22c55e', label: 'Normal' },
};

const CONCRETE_COLORS = [
  '#6366f1','#3b82f6','#06b6d4','#10b981','#f59e0b','#f97316',
  '#ef4444','#8b5cf6','#ec4899','#14b8a6','#84cc16','#64748b',
];

function SectionCard({ title, icon: Icon, children }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
      <div className="px-5 py-3.5 border-b border-slate-100 flex items-center gap-2 bg-slate-50">
        <Icon className="w-4 h-4 text-indigo-600" />
        <h3 className="text-sm font-medium text-black">{title}</h3>
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

export default function PlanningReportsPage() {
  const thisMonth = dayjs().startOf('month').format('YYYY-MM-DD');
  const today     = dayjs().format('YYYY-MM-DD');

  const [projectId, setProjectId] = useState('');
  const [fromDate, setFromDate]   = useState(thisMonth);
  const [toDate, setToDate]       = useState(today);

  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: () => projectAPI.list().then(r => r.data?.data ?? []),
  });

  const { data: analytics, isLoading, refetch } = useQuery({
    queryKey: ['planning-dpr-analytics', projectId, fromDate, toDate],
    queryFn: () => planningAPI.dprAnalytics({ project_id: projectId, from_date: fromDate, to_date: toDate })
      .then(r => r.data?.data ?? r.data ?? []).catch(() => []),
    enabled: !!projectId,
  });

  const { data: activities = [] } = useQuery({
    queryKey: ['planning-activities', projectId],
    queryFn: () => planningAPI.listActivities({ project_id: projectId }).then(r => r.data?.data ?? r.data ?? []).catch(() => []),
    enabled: !!projectId,
  });

  // Resource histogram — % complete by week
  const activityProgress = useMemo(() => {
    if (!activities.length) return [];
    const byStatus = {};
    activities.forEach(a => {
      byStatus[a.status] = (byStatus[a.status] || 0) + 1;
    });
    return Object.entries(byStatus).map(([status, count]) => ({ status, count }));
  }, [activities]);

  // Activity type breakdown
  const actByType = useMemo(() => {
    const m = {};
    activities.forEach(a => { m[a.activity_type || 'other'] = (m[a.activity_type || 'other'] || 0) + 1; });
    return Object.entries(m).map(([type, count]) => ({ type, count }));
  }, [activities]);

  const exportCSV = () => {
    if (!analytics) return;
    const rows = [
      ['Date', 'Workers', 'Work Items', 'Weather'],
      ...(analytics.workers_trend || []).map(d => [d.date, d.workers, d.work_items, d.weather])
    ];
    const csv  = rows.map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a'); a.href = url; a.download = 'dpr-analytics.csv'; a.click();
  };

  const s = analytics?.summary;

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto min-h-screen bg-[#f4f6f9]">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-600 font-medium mb-1">
            <BarChart2 className="w-3.5 h-3.5" /> Planning
          </div>
          <h1 className="text-2xl font-medium text-slate-900">Planning Reports & Analytics</h1>
          <p className="text-sm text-slate-500 mt-0.5">DPR summary, resource trends & schedule performance</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select value={projectId} onChange={e => setProjectId(e.target.value)}
            className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-400 shadow-sm w-64">
            <option value="">— Select project —</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          {projectId && (
            <>
              <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)}
                className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-400 shadow-sm" />
              <span className="text-slate-400 text-sm">to</span>
              <input type="date" value={toDate} onChange={e => setToDate(e.target.value)}
                className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-400 shadow-sm" />
              <button onClick={() => refetch()}
                className="px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm hover:bg-slate-50 shadow-sm">
                <RefreshCw className="w-4 h-4" />
              </button>
              {analytics && (
                <button onClick={exportCSV}
                  className="flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm hover:bg-slate-50 shadow-sm">
                  <Download className="w-4 h-4" /> Export
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {!projectId ? (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-16 text-center">
          <BarChart2 className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500 font-medium">Select a project to view planning reports</p>
        </div>
      ) : isLoading ? (
        <div className="text-center py-16 text-slate-400">
          <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2" />Loading analytics…
        </div>
      ) : !analytics ? (
        <div className="text-center py-16 bg-white border rounded-xl text-slate-400">
          <FileText className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p>No DPR data in the selected date range</p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* KPI Summary */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {[
              { label: 'Total DPRs',          value: s?.total_dprs || 0,             icon: FileText,   color: 'text-indigo-600' },
              { label: 'Total Concrete (m³)',  value: fmt(s?.total_concrete_cum),     icon: Package,    color: 'text-blue-600'   },
              { label: 'Avg Workers/Day',      value: s?.avg_workers_per_day || 0,    icon: Users,      color: 'text-green-600'  },
              { label: 'Rainy Days',           value: s?.rainy_days || 0,             icon: CloudRain,  color: 'text-sky-600'    },
              { label: 'Activities (total)',   value: activities.length,              icon: Calendar,   color: 'text-purple-600' },
            ].map(c => {
              const Icon = c.icon;
              return (
                <div key={c.label} className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-slate-500">{c.label}</span>
                    <Icon className={`w-4 h-4 ${c.color}`} />
                  </div>
                  <div className={`text-2xl font-bold ${c.color}`}>{c.value}</div>
                </div>
              );
            })}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Workers Trend */}
            <SectionCard title="Daily Workers Trend" icon={Users}>
              {analytics.workers_trend?.length ? (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={analytics.workers_trend.slice(-30)} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }}
                      tickFormatter={d => dayjs(d).format('DD/MM')} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip labelFormatter={d => dayjs(d).format('DD MMM YYYY')}
                      formatter={(v) => [v, 'Workers']} />
                    <Bar dataKey="workers" fill="#6366f1" radius={[2,2,0,0]} name="Workers" />
                  </BarChart>
                </ResponsiveContainer>
              ) : <p className="text-sm text-slate-400 text-center py-6">No workers data</p>}
            </SectionCard>

            {/* Concrete by Grade */}
            <SectionCard title="Concrete Consumption by Grade (m³)" icon={Package}>
              {analytics.concrete_by_grade?.length ? (
                <div className="space-y-2">
                  {analytics.concrete_by_grade.map((c, i) => {
                    const max = analytics.concrete_by_grade[0]?.qty || 1;
                    const pct = Math.round((c.qty / max) * 100);
                    return (
                      <div key={c.grade}>
                        <div className="flex justify-between text-xs text-slate-600 mb-0.5">
                          <span className="font-medium">{c.grade}</span>
                          <span className="font-bold">{fmt(c.qty)} m³</span>
                        </div>
                        <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                          <div className="h-full rounded-full transition-all"
                            style={{ width: `${pct}%`, backgroundColor: CONCRETE_COLORS[i % CONCRETE_COLORS.length] }} />
                        </div>
                      </div>
                    );
                  })}
                  <div className="pt-2 border-t border-slate-100 flex justify-between text-xs font-bold text-slate-700">
                    <span>Total</span>
                    <span>{fmt(s?.total_concrete_cum)} m³</span>
                  </div>
                </div>
              ) : <p className="text-sm text-slate-400 text-center py-6">No concrete data in this period</p>}
            </SectionCard>

            {/* Weather Breakdown */}
            <SectionCard title="Weather Summary" icon={Sun}>
              {analytics.weather_breakdown?.length ? (
                <div className="grid grid-cols-2 gap-3">
                  {analytics.weather_breakdown.map(w => {
                    const cfg = WEATHER_CFG[w.weather] || WEATHER_CFG.normal;
                    const Icon = cfg.icon;
                    const pct  = s?.total_dprs ? Math.round((w.count / s.total_dprs) * 100) : 0;
                    return (
                      <div key={w.weather} className="flex items-center gap-3 p-3 border rounded-lg">
                        <Icon className="w-6 h-6 flex-shrink-0" style={{ color: cfg.color }} />
                        <div>
                          <div className="text-sm font-semibold text-black">{w.count} days</div>
                          <div className="text-xs text-slate-500">{cfg.label} ({pct}%)</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : <p className="text-sm text-slate-400 text-center py-6">No weather data</p>}
            </SectionCard>

            {/* Activity Status Breakdown */}
            <SectionCard title="Schedule Status (Activities)" icon={Calendar}>
              {activityProgress.length ? (
                <div className="space-y-3">
                  {activityProgress.map(s => {
                    const total = activityProgress.reduce((sum, x) => sum + x.count, 0);
                    const pct = total ? Math.round((s.count / total) * 100) : 0;
                    const colors = {
                      planned: 'bg-slate-400', in_progress: 'bg-indigo-500',
                      delayed: 'bg-red-500', completed: 'bg-emerald-500', cancelled: 'bg-slate-200',
                    };
                    return (
                      <div key={s.status}>
                        <div className="flex justify-between text-xs text-slate-600 mb-1">
                          <span className="capitalize">{s.status.replace('_',' ')}</span>
                          <span className="font-medium">{s.count} ({pct}%)</span>
                        </div>
                        <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${colors[s.status] || 'bg-slate-400'}`}
                            style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : <p className="text-sm text-slate-400 text-center py-6">No activities yet</p>}
            </SectionCard>
          </div>

          {/* Activity Type Breakdown */}
          {actByType.length > 0 && (
            <SectionCard title="Activities by Type" icon={TrendingUp}>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={actByType} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="type" tick={{ fontSize: 11 }} tickFormatter={t => t.charAt(0).toUpperCase()+t.slice(1)} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip formatter={(v) => [v, 'Activities']} />
                  <Bar dataKey="count" name="Activities" radius={[3,3,0,0]}>
                    {actByType.map((_, i) => (
                      <Cell key={i} fill={['#6366f1','#3b82f6','#f59e0b','#10b981','#f97316','#94a3b8'][i % 6]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </SectionCard>
          )}
        </div>
      )}
    </div>
  );
}
