// src/pages/hr-admin/compliance/ComplianceAnalytics.jsx
// Right-rail analytics: compliance-by-department pie, monthly trend line,
// upcoming renewal deadlines, recent activity feed.
import React from 'react';
import { motion } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip,
  LineChart, Line, XAxis, YAxis, CartesianGrid,
} from 'recharts';
import { CalendarClock, Activity, Upload, AlertTriangle, RefreshCw, CalendarDays, Sparkles } from 'lucide-react';
import { hrComplianceAPI } from '../../../api/client';
import { C, fmtDate, daysUntil, relTime } from './complianceData';

const INSIGHT_TONES = {
  warning: { bg: '#FFFBEB', text: '#B45309', dot: '#F59E0B' },
  danger:  { bg: '#FEF2F2', text: '#DC2626', dot: '#EF4444' },
  info:    { bg: '#EFF6FF', text: '#2563EB', dot: '#3B82F6' },
  success: { bg: '#ECFDF5', text: '#059669', dot: '#22C55E' },
};

const PIE_COLORS = ['#2563EB', '#22C55E', '#F59E0B', '#8B5CF6', '#06B6D4', '#EF4444', '#64748B'];

function Panel({ title, icon: Icon, delay, children }) {
  return (
    <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay }}
      className="bg-white rounded-2xl border border-slate-200/70 p-5"
      style={{ boxShadow: '0 1px 3px rgba(15,23,42,.05), 0 6px 20px rgba(15,23,42,.04)' }}>
      <div className="flex items-center gap-2 mb-4">
        <Icon className="w-4 h-4 text-blue-600" />
        <h3 className="text-sm font-bold text-black">{title}</h3>
      </div>
      {children}
    </motion.div>
  );
}

const ACTIVITY_ICONS = { upload: Upload, alert: AlertTriangle, renew: RefreshCw, schedule: CalendarDays };
const ACTIVITY_COLORS = { upload: '#2563EB', alert: '#EF4444', renew: '#22C55E', schedule: '#8B5CF6' };

export default function ComplianceAnalytics({ rows }) {
  const { data: insights } = useQuery({
    queryKey: ['compliance-tracker-insights'],
    queryFn: () => hrComplianceAPI.trackerInsights().then(r => r.data.data),
  });
  const { data: trend } = useQuery({
    queryKey: ['compliance-tracker-trend'],
    queryFn: () => hrComplianceAPI.trackerTrend().then(r => r.data.data),
  });
  const { data: activity } = useQuery({
    queryKey: ['compliance-tracker-activity'],
    queryFn: () => hrComplianceAPI.trackerActivity().then(r => r.data.data),
  });

  const byDept = Object.entries(
    rows.reduce((acc, r) => { acc[r.department] = (acc[r.department] || 0) + 1; return acc; }, {})
  ).map(([name, value]) => ({ name, value }));

  const upcoming = [...rows]
    .filter(r => daysUntil(r.dueDate) >= 0)
    .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate))
    .slice(0, 5);

  return (
    <div className="space-y-4">
      <Panel title="Compliance Insights" icon={Sparkles} delay={0.2}>
        <div className="space-y-2.5">
          {(insights || []).map(insight => {
            const tone = INSIGHT_TONES[insight.tone] || INSIGHT_TONES.info;
            return (
              <div key={insight.id} className="flex items-start gap-2.5 rounded-xl p-3" style={{ background: tone.bg }}>
                <span className="w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0" style={{ background: tone.dot }} />
                <p className="text-xs leading-relaxed" style={{ color: tone.text }}>{insight.text}</p>
              </div>
            );
          })}
        </div>
      </Panel>

      <Panel title="Compliance by Department" icon={Activity} delay={0.25}>
        <div className="h-44">
          <ResponsiveContainer>
            <PieChart>
              <Pie data={byDept} dataKey="value" nameKey="name" innerRadius={42} outerRadius={68} paddingAngle={3} strokeWidth={0}>
                {byDept.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
              </Pie>
              <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #E2E8F0', fontSize: 12 }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 mt-2">
          {byDept.map((d, i) => (
            <div key={d.name} className="flex items-center gap-1.5 text-xs text-slate-600">
              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
              <span className="truncate">{d.name}</span>
              <span className="ml-auto font-semibold text-black">{d.value}</span>
            </div>
          ))}
        </div>
      </Panel>

      <Panel title="Compliance Trend" icon={Activity} delay={0.3}>
        <div className="h-40">
          <ResponsiveContainer>
            <LineChart data={trend || []} margin={{ top: 4, right: 4, left: -22, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#94A3B8' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#94A3B8' }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #E2E8F0', fontSize: 12 }} />
              <Line type="monotone" dataKey="compliant" stroke={C.primary} strokeWidth={2.5} dot={{ r: 3, fill: C.primary }} name="Compliant %" />
              <Line type="monotone" dataKey="overdue" stroke={C.danger} strokeWidth={2} dot={{ r: 3, fill: C.danger }} name="Overdue" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Panel>

      <Panel title="Upcoming Deadlines" icon={CalendarClock} delay={0.35}>
        <div className="space-y-2.5">
          {upcoming.map(r => {
            const d = daysUntil(r.dueDate);
            const urgent = d <= 7;
            return (
              <div key={r.id} className="flex items-center gap-3">
                <div className={`w-11 h-11 rounded-xl flex flex-col items-center justify-center flex-shrink-0 ${urgent ? 'bg-red-50' : 'bg-blue-50'}`}>
                  <span className={`text-sm font-bold leading-none ${urgent ? 'text-red-600' : 'text-blue-700'}`}>{new Date(r.dueDate).getDate()}</span>
                  <span className={`text-[9px] font-semibold uppercase ${urgent ? 'text-red-400' : 'text-blue-400'}`}>
                    {new Date(r.dueDate).toLocaleString('en-IN', { month: 'short' })}
                  </span>
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-black truncate">{r.name}</p>
                  <p className="text-xs text-slate-400">{d === 0 ? 'Due today' : `In ${d} day${d === 1 ? '' : 's'}`} · {r.owner}</p>
                </div>
              </div>
            );
          })}
          {upcoming.length === 0 && <p className="text-sm text-slate-400">No upcoming deadlines in view.</p>}
        </div>
      </Panel>

      <Panel title="Recent Activities" icon={Activity} delay={0.4}>
        <div className="space-y-3">
          {(activity || []).map(a => {
            const Icon = ACTIVITY_ICONS[a.type] || Activity;
            const color = ACTIVITY_COLORS[a.type] || '#64748B';
            return (
              <div key={a.id} className="flex gap-2.5">
                <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: `${color}14` }}>
                  <Icon className="w-3.5 h-3.5" style={{ color }} />
                </div>
                <div>
                  <p className="text-xs text-slate-700 leading-snug">{a.text}</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">{relTime(a.time)}</p>
                </div>
              </div>
            );
          })}
          {activity && activity.length === 0 && <p className="text-sm text-slate-400">No recent activity.</p>}
        </div>
      </Panel>
    </div>
  );
}
