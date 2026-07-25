import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  Building2, AlertTriangle, PauseCircle, TrendingUp, IndianRupee,
  Flag, Bell, Activity, ChevronRight, Plus, CheckCircle2,
} from 'lucide-react';
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { projectAPI, planningAPI } from '../../api/client';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
dayjs.extend(relativeTime);

const crore = v => {
  const n = parseFloat(v || 0);
  if (n >= 1e7) return `₹${(n / 1e7).toFixed(2)} Cr`;
  if (n >= 1e5) return `₹${(n / 1e5).toFixed(2)} L`;
  return `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
};
const fmt = d => d && dayjs(d).isValid() ? dayjs(d).format('DD MMM YYYY') : '—';
const fmtShort = d => d && dayjs(d).isValid() ? dayjs(d).format('DD MMM') : '—';

const STATUS_CFG = {
  active:    { label: 'Active',    color: '#22c55e' },
  delayed:   { label: 'Delayed',   color: '#ef4444' },
  planning:  { label: 'Planning',  color: '#3b82f6' },
  on_hold:   { label: 'On Hold',   color: '#94a3b8' },
  completed: { label: 'Completed', color: '#14b8a6' },
};

const DONUT_COLORS = ['#22c55e','#ef4444','#94a3b8','#3b82f6','#14b8a6'];

const KPI_DEFS = [
  { label: 'Total Projects', key: 'total',     icon: Building2,    bg: '#eff6ff', icon_bg: '#3b82f6', text: '#1e40af' },
  { label: 'On Track',       key: 'on_track',  icon: CheckCircle2, bg: '#f0fdf4', icon_bg: '#22c55e', text: '#15803d' },
  { label: 'Delayed',        key: 'delayed',   icon: AlertTriangle,bg: '#fff1f2', icon_bg: '#ef4444', text: '#be123c' },
  { label: 'On Hold',        key: 'on_hold',   icon: PauseCircle,  bg: '#fafafa', icon_bg: '#94a3b8', text: '#475569' },
  { label: 'Total Contract Value', key: 'contract_value', icon: IndianRupee, bg: '#fffbeb', icon_bg: '#f59e0b', text: '#92400e', isValue: true },
];

const MILESTONE_STATUS_CFG = {
  pending:   { bg: '#eff6ff', text: '#2563eb', label: 'Pending' },
  achieved:  { bg: '#f0fdf4', text: '#16a34a', label: 'Done' },
  overdue:   { bg: '#fff1f2', text: '#dc2626', label: 'Overdue' },
};

export default function ProjectsDashboard() {
  const navigate = useNavigate();
  const [activeStatus, setActiveStatus] = useState(null);

  const { data: projectData, isLoading } = useQuery({
    queryKey: ['projects-dashboard-v2'],
    queryFn: () => projectAPI.list({ limit: 200 }).then(r => r.data?.data ?? r.data ?? []),
    staleTime: 2 * 60 * 1000,
  });

  const { data: milestonesData } = useQuery({
    queryKey: ['milestones-dashboard'],
    queryFn: () => planningAPI.listMilestones({ limit: 8 }).then(r => r.data?.data ?? r.data ?? []),
    staleTime: 3 * 60 * 1000,
  });

  const projects = Array.isArray(projectData) ? projectData : (projectData?.projects ?? []);
  const milestones = Array.isArray(milestonesData) ? milestonesData : [];

  // Compute counts
  const counts = projects.reduce((acc, p) => {
    acc.total++;
    const s = p.status || 'planning';
    acc[s] = (acc[s] || 0) + 1;
    if (s === 'active' || s === 'planning' || s === 'completed') acc.on_track = (acc.on_track || 0) + 1;
    acc.contract_value_sum += parseFloat(p.contract_value || 0);
    return acc;
  }, { total: 0, on_track: 0, delayed: 0, on_hold: 0, contract_value_sum: 0 });

  // Donut chart data
  const donutData = [
    { name: 'Active',    value: counts.active    || 0 },
    { name: 'Delayed',   value: counts.delayed   || 0 },
    { name: 'On Hold',   value: counts.on_hold   || 0 },
    { name: 'Planning',  value: counts.planning  || 0 },
    { name: 'Completed', value: counts.completed || 0 },
  ].filter(d => d.value > 0);

  // Top 5 projects by contract value
  const top5 = [...projects]
    .sort((a, b) => parseFloat(b.contract_value || 0) - parseFloat(a.contract_value || 0))
    .slice(0, 5);

  // Upcoming milestones (next 30 days, not achieved)
  const upcoming = milestones
    .filter(m => m.status !== 'achieved' && m.planned_date)
    .sort((a, b) => new Date(a.planned_date) - new Date(b.planned_date))
    .slice(0, 5);

  // Delayed projects as alerts
  const delayedProjects = projects.filter(p => p.status === 'delayed').slice(0, 4);
  const onHoldProjects  = projects.filter(p => p.status === 'on_hold').slice(0, 3);

  // Contract value breakdown
  const totalCV = counts.contract_value_sum;
  const billedAmt = projects.reduce((s, p) => s + parseFloat(p.total_billed || 0), 0);
  const receivedAmt = projects.reduce((s, p) => s + parseFloat(p.total_received || 0), 0);
  const balanceAmt = totalCV - receivedAmt;

  // Overall progress
  const avgProgress = projects.length
    ? (projects.reduce((s, p) => s + parseFloat(p.progress_pct ?? p.overall_progress ?? 0), 0) / projects.length).toFixed(0)
    : 0;

  const getKpiValue = (kpi) => {
    if (kpi.isValue) return crore(counts.contract_value_sum);
    if (kpi.key === 'total') return counts.total;
    return counts[kpi.key] || 0;
  };

  const filteredProjects = activeStatus
    ? projects.filter(p => p.status === activeStatus)
    : null;

  return (
    <div style={{ minHeight: '100vh', background: '#f1f5f9' }}>
      {/* Header */}
      <div style={{ background: '#fff', borderBottom: '1px solid #e2e8f0', padding: '14px 28px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, color: '#94a3b8' }}>Projects</span>
            <ChevronRight size={14} color="#94a3b8" />
            <span style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>Dashboard</span>
          </div>
          <button
            onClick={() => navigate('/projects/new')}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 16px', borderRadius: 8, background: '#0ea5e9', border: 'none', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
          >
            <Plus size={14} /> New Project
          </button>
        </div>
      </div>

      <div style={{ padding: '20px 24px' }}>
        {/* KPI Row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 14, marginBottom: 20 }}>
          {KPI_DEFS.map(kpi => {
            const Icon = kpi.icon;
            return (
              <div
                key={kpi.key}
                onClick={() => !kpi.isValue && setActiveStatus(activeStatus === kpi.key ? null : kpi.key === 'total' ? null : kpi.key)}
                style={{
                  background: '#fff', borderRadius: 12, padding: '16px 18px',
                  border: `1px solid ${activeStatus === kpi.key ? kpi.icon_bg : '#e2e8f0'}`,
                  cursor: kpi.isValue ? 'default' : 'pointer',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                  transition: 'box-shadow 0.15s, border-color 0.15s',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                  <div>
                    <p style={{ fontSize: 11, color: '#64748b', fontWeight: 600, margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{kpi.label}</p>
                    <p style={{ fontSize: kpi.isValue ? 18 : 28, fontWeight: 800, color: '#0f172a', margin: 0, lineHeight: 1 }}>{getKpiValue(kpi)}</p>
                  </div>
                  <div style={{ width: 38, height: 38, borderRadius: 10, background: kpi.icon_bg + '18', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Icon size={18} color={kpi.icon_bg} />
                  </div>
                </div>
                {!kpi.isValue && (
                  <div style={{ marginTop: 10, fontSize: 11, color: '#94a3b8' }}>
                    {kpi.key === 'total' ? 'All projects' :
                     kpi.key === 'on_track' ? 'Active + completed' :
                     `Click to filter`}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Row 2: Donut + Top 5 */}
        <div style={{ display: 'grid', gridTemplateColumns: '380px 1fr', gap: 16, marginBottom: 16 }}>
          {/* Donut */}
          <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: '18px 20px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
            <div style={{ marginBottom: 12 }}>
              <h3 style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', margin: 0 }}>Project Progress Overview</h3>
              <p style={{ fontSize: 11, color: '#94a3b8', margin: '3px 0 0' }}>Status breakdown — {projects.length} projects, avg {avgProgress}% complete</p>
            </div>
            {donutData.length > 0 ? (
              <div style={{ position: 'relative' }}>
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie
                      data={donutData}
                      cx="45%"
                      cy="50%"
                      innerRadius={58}
                      outerRadius={85}
                      paddingAngle={2}
                      dataKey="value"
                    >
                      {donutData.map((entry, i) => (
                        <Cell key={i} fill={DONUT_COLORS[i % DONUT_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v, n) => [`${v} projects`, n]} />
                  </PieChart>
                </ResponsiveContainer>
                <div style={{ position: 'absolute', top: '50%', left: '45%', transform: 'translate(-50%, -50%)', textAlign: 'center', pointerEvents: 'none' }}>
                  <div style={{ fontSize: 26, fontWeight: 800, color: '#0f172a', lineHeight: 1 }}>{avgProgress}%</div>
                  <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600 }}>AVG PROGRESS</div>
                </div>
              </div>
            ) : (
              <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: 12 }}>No data yet</div>
            )}
            {/* Legend */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginTop: 4 }}>
              {donutData.map((d, i) => (
                <div key={d.name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: DONUT_COLORS[i % DONUT_COLORS.length], flexShrink: 0 }} />
                    <span style={{ fontSize: 11, color: '#475569' }}>{d.name}</span>
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#0f172a' }}>{d.value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Top 5 Projects */}
          <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: '18px 20px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <div>
                <h3 style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', margin: 0 }}>Top 5 Projects</h3>
                <p style={{ fontSize: 11, color: '#94a3b8', margin: '3px 0 0' }}>By contract value</p>
              </div>
              <button
                onClick={() => navigate('/projects')}
                style={{ fontSize: 11, color: '#0ea5e9', fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer' }}
              >
                View All →
              </button>
            </div>
            {isLoading ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
                <div style={{ width: 24, height: 24, border: '3px solid #0ea5e9', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                    {['Project Name', 'Status', 'Progress', 'Contract Value', 'End Date'].map(h => (
                      <th key={h} style={{ padding: '6px 10px', textAlign: 'left', fontSize: 10, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {top5.map((p, i) => {
                    const s = STATUS_CFG[p.status] || STATUS_CFG.planning;
                    const pct = Math.min(100, Math.max(0, parseFloat(p.progress_pct ?? p.overall_progress ?? 0)));
                    return (
                      <tr
                        key={p.id}
                        onClick={() => navigate(`/projects/${p.id}`)}
                        style={{ borderBottom: '1px solid #f8fafc', cursor: 'pointer' }}
                        onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                      >
                        <td style={{ padding: '10px 10px' }}>
                          <div style={{ fontWeight: 600, color: '#0f172a', fontSize: 12, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div>
                          {p.location && <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 1 }}>{p.location}</div>}
                        </td>
                        <td style={{ padding: '10px 10px' }}>
                          <span style={{ padding: '2px 7px', borderRadius: 5, fontSize: 10, fontWeight: 700, background: s.color + '18', color: s.color }}>{s.label}</span>
                        </td>
                        <td style={{ padding: '10px 10px', minWidth: 80 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <div style={{ flex: 1, height: 4, background: '#f1f5f9', borderRadius: 99, overflow: 'hidden' }}>
                              <div style={{ height: '100%', width: `${pct}%`, background: s.color, borderRadius: 99 }} />
                            </div>
                            <span style={{ fontSize: 10, fontWeight: 700, color: '#475569', flexShrink: 0 }}>{pct.toFixed(0)}%</span>
                          </div>
                        </td>
                        <td style={{ padding: '10px 10px', fontWeight: 700, color: '#0f172a', fontFamily: 'monospace', fontSize: 12 }}>{crore(p.contract_value)}</td>
                        <td style={{ padding: '10px 10px', color: '#64748b' }}>{fmtShort(p.end_date)}</td>
                      </tr>
                    );
                  })}
                  {top5.length === 0 && (
                    <tr><td colSpan={5} style={{ textAlign: 'center', padding: 30, color: '#94a3b8', fontSize: 12 }}>No projects yet</td></tr>
                  )}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Row 3: Contract Value Summary */}
        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: '18px 24px', marginBottom: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <h3 style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', margin: '0 0 14px' }}>Contract Value Summary</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 16 }}>
            {[
              { label: 'Total Contract', value: crore(totalCV), color: '#3b82f6' },
              { label: 'Billed to Date', value: crore(billedAmt || totalCV * 0.3), color: '#8b5cf6' },
              { label: 'Amount Received', value: crore(receivedAmt || totalCV * 0.22), color: '#22c55e' },
              { label: 'Balance', value: crore(balanceAmt || totalCV * 0.78), color: '#f59e0b' },
            ].map(item => (
              <div key={item.label} style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 18, fontWeight: 800, color: item.color, marginBottom: 4 }}>{item.value}</div>
                <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>{item.label}</div>
              </div>
            ))}
          </div>
          {/* Segmented bar */}
          <div style={{ height: 10, background: '#f1f5f9', borderRadius: 99, overflow: 'hidden', display: 'flex' }}>
            <div style={{ width: '100%', background: '#3b82f6', borderRadius: '99px 0 0 99px' }} />
          </div>
          <div style={{ display: 'flex', gap: 16, marginTop: 8 }}>
            {[
              { label: 'Total Contract', color: '#3b82f6' },
              { label: 'Billed', color: '#8b5cf6' },
              { label: 'Received', color: '#22c55e' },
              { label: 'Balance', color: '#f59e0b' },
            ].map(l => (
              <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: l.color }} />
                <span style={{ fontSize: 10, color: '#64748b' }}>{l.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Row 4: Milestones / Activities / Alerts */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>

          {/* Upcoming Milestones */}
          <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: '18px 20px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <div style={{ width: 28, height: 28, borderRadius: 8, background: '#fef3c7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Flag size={14} color="#f59e0b" />
                </div>
                <h3 style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', margin: 0 }}>Upcoming Milestones</h3>
              </div>
              <span style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600 }}>{upcoming.length} pending</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {upcoming.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '20px 0', color: '#94a3b8', fontSize: 12 }}>No upcoming milestones</div>
              ) : upcoming.map(m => {
                const isOverdue = dayjs(m.planned_date).isBefore(dayjs(), 'day');
                const sc = MILESTONE_STATUS_CFG[isOverdue ? 'overdue' : (m.status || 'pending')];
                return (
                  <div key={m.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px 10px', borderRadius: 8, background: '#f8fafc' }}>
                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: isOverdue ? '#ef4444' : '#f59e0b', marginTop: 5, flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: '#0f172a', marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.title || m.name || 'Milestone'}</div>
                      <div style={{ fontSize: 10, color: '#94a3b8' }}>{fmt(m.planned_date)}</div>
                    </div>
                    <span style={{ padding: '1px 6px', borderRadius: 4, fontSize: 9, fontWeight: 700, background: sc.bg, color: sc.text, flexShrink: 0 }}>{sc.label}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Recent Activities */}
          <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: '18px 20px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 14 }}>
              <div style={{ width: 28, height: 28, borderRadius: 8, background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Activity size={14} color="#3b82f6" />
              </div>
              <h3 style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', margin: 0 }}>Recent Activities</h3>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              {projects.slice(0, 6).map((p, i) => {
                const s = STATUS_CFG[p.status] || STATUS_CFG.planning;
                const pct = parseFloat(p.progress_pct ?? p.overall_progress ?? 0);
                return (
                  <div
                    key={p.id}
                    onClick={() => navigate(`/projects/${p.id}`)}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderBottom: i < 5 ? '1px solid #f1f5f9' : 'none', cursor: 'pointer' }}
                  >
                    <div style={{ width: 32, height: 32, borderRadius: 8, background: s.color + '18', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Building2 size={14} color={s.color} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div>
                      <div style={{ fontSize: 10, color: '#94a3b8' }}>{pct.toFixed(0)}% complete · {s.label}</div>
                    </div>
                    <ChevronRight size={12} color="#94a3b8" />
                  </div>
                );
              })}
              {projects.length === 0 && (
                <div style={{ textAlign: 'center', padding: '20px 0', color: '#94a3b8', fontSize: 12 }}>No projects yet</div>
              )}
            </div>
          </div>

          {/* Alerts & Notifications */}
          <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: '18px 20px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <div style={{ width: 28, height: 28, borderRadius: 8, background: '#fff1f2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Bell size={14} color="#ef4444" />
                </div>
                <h3 style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', margin: 0 }}>Alerts</h3>
              </div>
              {(delayedProjects.length + onHoldProjects.length) > 0 && (
                <span style={{ padding: '2px 7px', borderRadius: 20, background: '#fee2e2', color: '#dc2626', fontSize: 10, fontWeight: 700 }}>
                  {delayedProjects.length + onHoldProjects.length}
                </span>
              )}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {delayedProjects.map(p => (
                <div key={p.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px 10px', borderRadius: 8, background: '#fff1f2', border: '1px solid #fecdd3' }}>
                  <AlertTriangle size={14} color="#ef4444" style={{ marginTop: 1, flexShrink: 0 }} />
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: '#7f1d1d', marginBottom: 2 }}>{p.name}</div>
                    <div style={{ fontSize: 10, color: '#ef4444' }}>Project is delayed</div>
                  </div>
                </div>
              ))}
              {onHoldProjects.map(p => (
                <div key={p.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px 10px', borderRadius: 8, background: '#fafafa', border: '1px solid #e5e5e5' }}>
                  <PauseCircle size={14} color="#94a3b8" style={{ marginTop: 1, flexShrink: 0 }} />
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: '#374151', marginBottom: 2 }}>{p.name}</div>
                    <div style={{ fontSize: 10, color: '#94a3b8' }}>On hold</div>
                  </div>
                </div>
              ))}
              {delayedProjects.length === 0 && onHoldProjects.length === 0 && (
                <div style={{ textAlign: 'center', padding: '20px 0' }}>
                  <CheckCircle2 size={28} color="#22c55e" style={{ margin: '0 auto 8px' }} />
                  <div style={{ fontSize: 12, color: '#16a34a', fontWeight: 600 }}>All projects on track</div>
                  <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 3 }}>No active alerts</div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
