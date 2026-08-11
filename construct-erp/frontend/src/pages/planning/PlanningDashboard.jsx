// src/pages/planning/PlanningDashboard.jsx
import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  GanttChartSquare, Flag, CalendarDays, TrendingUp, AlertTriangle,
  CheckCircle2, Clock, ChevronRight, Activity, Package,
} from 'lucide-react';
import { planningAPI, projectAPI } from '../../api/client';
import { clsx } from 'clsx';
import dayjs from 'dayjs';

export default function PlanningDashboard() {
  const [projectId, setProjectId] = useState('');

  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: () => projectAPI.list().then(r => r.data?.data ?? []),
  });

  const { data: dash } = useQuery({
    queryKey: ['planning-dashboard', projectId],
    queryFn: () => planningAPI.getDashboard({ project_id: projectId }).then(r => r.data?.data ?? r.data ?? []).catch(() => []),
    enabled: !!projectId,
  });

  const { data: milestones = [] } = useQuery({
    queryKey: ['planning-milestones', projectId],
    queryFn: () => planningAPI.listMilestones({ project_id: projectId }).then(r => r.data?.data ?? r.data ?? []).catch(() => []),
    enabled: !!projectId,
  });

  const upcoming = milestones
    .filter(m => !m.is_achieved && dayjs(m.target_date).isAfter(dayjs()))
    .sort((a, b) => new Date(a.target_date) - new Date(b.target_date))
    .slice(0, 5);

  const overdue = milestones.filter(
    m => !m.is_achieved && dayjs(m.target_date).isBefore(dayjs())
  );

  const act = dash?.activities;
  const mil = dash?.milestones;
  const del = dash?.delays;
  const sc  = dash?.latest_scurve;

  const kpis = [
    {
      label: 'Total Activities', value: act?.total || 0,
      sub: `${act?.completed || 0} completed`,
      icon: Activity, color: 'text-indigo-600', dot: 'bg-indigo-500',
      to: '/planning/activities',
    },
    {
      label: 'Avg Progress', value: `${act?.avg_progress || 0}%`,
      sub: `${act?.in_progress || 0} active`,
      icon: TrendingUp, color: 'text-emerald-600', dot: 'bg-emerald-500',
      to: '/planning/progress',
    },
    {
      label: 'Milestones', value: mil?.total || 0,
      sub: `${mil?.achieved || 0} achieved`,
      icon: Flag, color: 'text-blue-600', dot: 'bg-blue-500',
      to: '/planning/milestones',
    },
    {
      label: 'Delayed Activities', value: act?.delayed || 0,
      sub: `${del?.critical_delays || 0} critical`,
      icon: AlertTriangle, color: 'text-red-600', dot: 'bg-red-500',
      to: '/planning/delays',
    },
  ];

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto min-h-screen bg-[#f4f6f9]">

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-900 font-medium mb-1">
            <GanttChartSquare className="w-3.5 h-3.5" /> Planning & Execution
          </div>
          <h1 className="text-2xl font-medium text-slate-900">Planning Dashboard</h1>
          <p className="text-sm text-slate-900 font-medium mt-0.5">Schedule, milestones, progress & delay tracking</p>
        </div>
        <select
          value={projectId}
          onChange={e => setProjectId(e.target.value)}
          className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 outline-none focus:border-indigo-400 shadow-sm w-72"
        >
          <option value="">— Select a project —</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>

      {!projectId ? (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-16 text-center">
          <GanttChartSquare className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-900 font-medium font-medium">Select a project to view its planning dashboard</p>
          <p className="text-slate-900 font-medium text-xs mt-1">All schedule, milestone and progress data is project-specific</p>
        </div>
      ) : (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            {kpis.map(({ label, value, sub, icon: Icon, color, dot, to }) => (
              <Link
                key={label}
                to={to}
                className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm hover:shadow-md transition-all hover:border-indigo-300 group"
              >
                <div className="flex items-center justify-between mb-2">
                  <Icon className={clsx('w-4 h-4', color)} />
                  <span className={clsx('w-2 h-2 rounded-full', dot)} />
                </div>
                <div className="text-2xl font-medium text-slate-900">{value}</div>
                <div className="text-xs text-slate-900 font-medium mt-0.5">{label}</div>
                <div className="text-xs text-slate-300 mt-0.5">{sub}</div>
              </Link>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

            {/* Upcoming Milestones */}
            <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
              <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Flag className="w-4 h-4 text-indigo-600" />
                  <h2 className="text-sm font-medium text-black">Upcoming Milestones</h2>
                </div>
                <Link to="/planning/milestones" className="text-xs text-indigo-600 hover:underline">View all →</Link>
              </div>

              {overdue.length > 0 && (
                <div className="px-5 py-2.5 bg-red-50 border-b border-red-100 flex items-center gap-2">
                  <AlertTriangle className="w-3.5 h-3.5 text-red-500" />
                  <span className="text-xs text-red-700 font-medium">{overdue.length} milestone{overdue.length > 1 ? 's' : ''} overdue</span>
                </div>
              )}

              <div className="divide-y divide-slate-50">
                {upcoming.length === 0 && (
                  <div className="py-10 text-center text-xs text-slate-400">
                    No upcoming milestones in the next 30 days
                  </div>
                )}
                {upcoming.map(m => {
                  const daysLeft = dayjs(m.target_date).diff(dayjs(), 'day');
                  const urgent   = daysLeft <= 7;
                  return (
                    <div key={m.id} className="px-5 py-3 flex items-center gap-3">
                      <div className={clsx(
                        'w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0',
                        urgent ? 'bg-amber-50' : 'bg-indigo-50'
                      )}>
                        <Flag className={clsx('w-4 h-4', urgent ? 'text-amber-500' : 'text-indigo-500')} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-slate-900 font-medium truncate">{m.milestone_name}</div>
                        <div className="text-xs text-slate-400">{m.milestone_code} • {m.milestone_type || 'General'}</div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <div className="text-xs font-medium text-slate-700">{dayjs(m.target_date).format('DD MMM YYYY')}</div>
                        <div className={clsx('text-xs', urgent ? 'text-amber-600 font-medium' : 'text-slate-400')}>
                          {daysLeft === 0 ? 'Today' : `${daysLeft}d left`}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Quick Stats Panel */}
            <div className="space-y-4">

              {/* Schedule Health */}
              <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-4">
                <h3 className="text-sm font-medium text-slate-900 font-medium mb-3">Schedule Health</h3>
                <div className="space-y-2">
                  {[
                    { label: 'On Track',   value: act?.in_progress || 0, color: 'bg-emerald-500', max: act?.total },
                    { label: 'Delayed',    value: act?.delayed     || 0, color: 'bg-red-500',     max: act?.total },
                    { label: 'Completed',  value: act?.completed   || 0, color: 'bg-blue-500',    max: act?.total },
                    { label: 'Planned',    value: act?.planned     || 0, color: 'bg-slate-300',   max: act?.total },
                  ].map(({ label, value, color, max }) => (
                    <div key={label}>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-slate-500">{label}</span>
                        <span className="font-medium text-slate-700">{value}</span>
                      </div>
                      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className={clsx('h-full rounded-full transition-all', color)}
                          style={{ width: max ? `${(value / max) * 100}%` : '0%' }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Latest S-Curve Snapshot */}
              <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-medium text-black">Latest Progress</h3>
                  <Link to="/planning/progress" className="text-xs text-indigo-600 hover:underline">S-Curve →</Link>
                </div>
                {sc ? (
                  <div className="space-y-3">
                    <ProgressRow label="Planned" pct={sc.baseline_progress_pct} color="bg-blue-400" />
                    <ProgressRow label="Actual"  pct={sc.actual_progress_pct}   color="bg-indigo-600" />
                    <ProgressRow label="Forecast" pct={sc.forecast_progress_pct} color="bg-amber-400" />
                    <div className="text-xs text-slate-900 font-medium pt-1">
                      As of {dayjs(sc.reporting_date).format('DD MMM YYYY')}
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-4 text-xs text-slate-400">
                    No progress snapshots yet.<br />
                    <Link to="/planning/progress" className="text-indigo-600 hover:underline">Record first snapshot →</Link>
                  </div>
                )}
              </div>

              {/* Quick Links */}
              <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-4">
                <h3 className="text-sm font-medium text-slate-900 font-medium mb-3">Quick Actions</h3>
                <div className="space-y-1">
                  {[
                    { to: '/planning/activities',  label: 'Add Activity',      icon: Activity },
                    { to: '/planning/look-ahead',  label: 'Plan This Week',    icon: CalendarDays },
                    { to: '/planning/delays',      label: 'Log a Delay',       icon: AlertTriangle },
                    { to: '/planning/milestones',  label: 'Update Milestones', icon: Flag },
                  ].map(({ to, label, icon: Icon }) => (
                    <Link
                      key={label}
                      to={to}
                      className="flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-indigo-50 text-slate-900 hover:text-indigo-700 transition-colors group"
                    >
                      <Icon className="w-3.5 h-3.5" />
                      <span className="text-xs font-medium">{label}</span>
                      <ChevronRight className="w-3 h-3 ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function ProgressRow({ label, pct, color }) {
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-slate-500">{label}</span>
        <span className="font-medium text-slate-700">{pct || 0}%</span>
      </div>
      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
        <div
          className={clsx('h-full rounded-full', color)}
          style={{ width: `${Math.min(pct || 0, 100)}%` }}
        />
      </div>
    </div>
  );
}
