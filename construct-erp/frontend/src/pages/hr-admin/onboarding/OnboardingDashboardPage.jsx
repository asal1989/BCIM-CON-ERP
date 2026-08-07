// src/pages/hr-admin/onboarding/OnboardingDashboardPage.jsx
// Onboarding command center — every figure here comes from a real query
// (employee_lifecycle_checklist, employee_documents, hr_employee_assets,
// training tables). Metrics that genuinely aren't available yet (e.g.
// certificates on the older training schema) render "—", never a fake 0.
import React, { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  BarChart, Bar, PieChart, Pie, Cell,
  LineChart, Line, CartesianGrid,
  XAxis, YAxis, Tooltip, ResponsiveContainer,
} from 'recharts';
import {
  Users, UserPlus, UserCheck, FileText, Laptop, GraduationCap,
  ShieldCheck, ClipboardList, Bell, Search, ChevronRight,
  CheckCircle2, AlertTriangle, Clock, Mail, Contact, Smartphone,
  BadgeCheck, FilePlus2, Award, Timer, ArrowRight, X,
} from 'lucide-react';
import { hrOnboardingAPI, hrMastersAPI } from '../../../api/client';
import { B, fade, avatarGrad, initials, ChartTip, KpiCard, SectionHeader } from '../../../components/hr/DashboardKit';

const STATUS_COLORS = { not_started: '#94A3B8', in_progress: '#F59E0B', completed: '#10B981' };
const STATUS_LABEL = { not_started: 'Not Started', in_progress: 'In Progress', completed: 'Completed' };

function useDebounced(value, delay = 300) {
  const [debounced, setDebounced] = useState(value);
  React.useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

export default function OnboardingDashboardPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [status, setStatus] = useState('');
  const debouncedSearch = useDebounced(search, 300);

  const { data: summary, isLoading: summaryLoading } = useQuery({
    queryKey: ['onboarding-summary'],
    queryFn: () => hrOnboardingAPI.summary().then(r => r.data.data),
  });
  const { data: employees } = useQuery({
    queryKey: ['onboarding-employees', debouncedSearch, departmentId, status],
    queryFn: () => hrOnboardingAPI.employees({
      search: debouncedSearch || undefined,
      department_id: departmentId || undefined,
      status: status || undefined,
      limit: 12,
    }).then(r => r.data.data),
  });
  const { data: departments } = useQuery({
    queryKey: ['hr-departments'],
    queryFn: () => hrMastersAPI.listDepts().then(r => r.data?.data || []),
  });
  const { data: tasks } = useQuery({
    queryKey: ['onboarding-tasks'],
    queryFn: () => hrOnboardingAPI.tasks().then(r => r.data.data),
  });
  const { data: probation } = useQuery({
    queryKey: ['onboarding-probation'],
    queryFn: () => hrOnboardingAPI.probation({ days: 60 }).then(r => r.data.data),
  });
  const { data: joiningTrend } = useQuery({
    queryKey: ['onboarding-joining-trend'],
    queryFn: () => hrOnboardingAPI.joiningTrend({ months: 6 }).then(r => r.data.data),
  });
  const { data: completionChart } = useQuery({
    queryKey: ['onboarding-completion-chart'],
    queryFn: () => hrOnboardingAPI.completionChart().then(r => r.data.data),
  });
  const { data: trainingChart } = useQuery({
    queryKey: ['onboarding-training-chart'],
    queryFn: () => hrOnboardingAPI.trainingChart().then(r => r.data),
  });
  const { data: probationChart } = useQuery({
    queryKey: ['onboarding-probation-chart'],
    queryFn: () => hrOnboardingAPI.probationChart().then(r => r.data.data),
  });

  const metrics = summary?.metrics || {};
  const kpis = summary?.kpis || {};
  const overallProgress = summary?.overall_progress_pct ?? 0;

  const completionPie = useMemo(() => (completionChart || []).map(c => ({
    name: STATUS_LABEL[c.onboarding_status] || c.onboarding_status,
    value: c.cnt,
    color: STATUS_COLORS[c.onboarding_status] || '#94A3B8',
  })), [completionChart]);

  const probationBars = probationChart ? [
    { name: 'Overdue', value: probationChart.overdue, color: B.danger },
    { name: 'Due Soon', value: probationChart.due_soon, color: B.warning },
    { name: 'Upcoming', value: probationChart.upcoming, color: B.blue },
    { name: 'Confirmed', value: probationChart.confirmed, color: B.success },
  ] : [];

  const trainingBars = trainingChart?.available ? [
    { name: 'Not Assigned', value: trainingChart.data.not_assigned, color: '#94A3B8' },
    { name: 'In Progress', value: trainingChart.data.in_progress, color: B.warning },
    { name: 'Completed', value: trainingChart.data.completed, color: B.success },
  ] : [];

  const METRIC_TILES = [
    { label: 'Total in Onboarding', value: metrics.total_in_onboarding, icon: Users },
    { label: 'Completed', value: metrics.completed, icon: CheckCircle2 },
    { label: 'In Progress', value: metrics.in_progress, icon: Clock },
    { label: 'Not Started', value: metrics.not_started, icon: AlertTriangle },
    { label: 'New Joiners (30d)', value: metrics.new_joiners_30d, icon: UserPlus },
    { label: 'Overdue Tasks', value: metrics.overdue_tasks, icon: Timer },
    { label: 'Probation Due (30d)', value: metrics.probation_due_30d, icon: BadgeCheck },
  ];

  const QUICK_ACTIONS = [
    { label: 'New Employee', icon: UserPlus, to: '/hr-admin/employees/new' },
    { label: 'Letter Generation', icon: FileText, to: '/hr-admin/letters' },
    { label: 'Employee Assets', icon: Laptop, to: '/hr-admin/emp-assets' },
    { label: 'Training', icon: GraduationCap, to: '/hr-admin/training' },
    { label: 'Import Employees', icon: FilePlus2, to: '/hr-admin/import' },
    { label: 'Document Verification', icon: ShieldCheck, to: '/hr-admin/onboarding/document-verification' },
    { label: 'Print ID Card', icon: Contact, to: '/hr-admin/onboarding/id-card' },
    { label: 'Create Email', icon: Mail, to: '/hr-admin/onboarding/email-account' },
  ];

  const REPORTS = [
    { key: 'new_joiners', label: 'New Joiners' },
    { key: 'pending_onboarding', label: 'Pending Onboarding' },
    { key: 'missing_documents', label: 'Missing Documents' },
    { key: 'asset_allocation', label: 'Asset Allocation' },
    { key: 'training_completion', label: 'Training Completion' },
    { key: 'probation', label: 'Probation Status' },
    { key: 'confirmation', label: 'Confirmation Status' },
  ];

  return (
    <div className="min-h-screen p-4 md:p-6" style={{ background: B.bg }}>
      {/* Header */}
      <motion.div {...fade(0)} className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-gray-900">Onboarding Dashboard</h1>
          <p className="text-sm text-gray-500 mt-0.5">Track every new hire from offer to confirmation.</p>
        </div>
        <button
          onClick={() => navigate('/hr-admin/onboarding/reports')}
          className="text-xs font-bold flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-white"
          style={{ background: B.navy }}
        >
          Reports <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </motion.div>

      {/* Filter bar */}
      <motion.div {...fade(0.03)} className="bg-white rounded-2xl p-4 mb-6 border border-gray-100 flex flex-wrap items-center gap-3" style={{ boxShadow: '0 2px 12px rgba(10,31,92,0.06)' }}>
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name or employee code..."
            className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-gray-200 focus:outline-none focus:ring-2"
            style={{ '--tw-ring-color': B.blue }}
          />
        </div>
        <select value={departmentId} onChange={e => setDepartmentId(e.target.value)}
          className="px-3 py-2 text-sm rounded-lg border border-gray-200 focus:outline-none">
          <option value="">All Departments</option>
          {(departments || []).map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        <select value={status} onChange={e => setStatus(e.target.value)}
          className="px-3 py-2 text-sm rounded-lg border border-gray-200 focus:outline-none">
          <option value="">All Status</option>
          <option value="not_started">Not Started</option>
          <option value="in_progress">In Progress</option>
          <option value="completed">Completed</option>
        </select>
        {(search || departmentId || status) && (
          <button onClick={() => { setSearch(''); setDepartmentId(''); setStatus(''); }}
            className="text-xs font-bold text-gray-500 flex items-center gap-1 px-3 py-2 hover:text-gray-700">
            <X className="w-3.5 h-3.5" /> Clear
          </button>
        )}
      </motion.div>

      {/* Metric strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3 mb-6">
        {METRIC_TILES.map((m, i) => (
          <motion.div key={m.label} {...fade(0.04 + i * 0.02)} className="bg-white rounded-xl p-3.5 border border-gray-100" style={{ boxShadow: '0 2px 8px rgba(10,31,92,0.05)' }}>
            <m.icon className="w-4 h-4 mb-2" style={{ color: B.blue }} />
            <p className="text-xl font-black text-gray-900 leading-none">{summaryLoading ? '…' : (m.value ?? '—')}</p>
            <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mt-1">{m.label}</p>
          </motion.div>
        ))}
      </div>

      {/* Overall progress */}
      <motion.div {...fade(0.1)} className="bg-white rounded-2xl p-5 mb-6 border border-gray-100" style={{ boxShadow: '0 2px 12px rgba(10,31,92,0.06)' }}>
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm font-bold text-gray-700">Overall Onboarding Progress</p>
          <p className="text-sm font-black" style={{ color: B.blue }}>{overallProgress}%</p>
        </div>
        <div className="w-full h-3 rounded-full bg-gray-100 overflow-hidden">
          <motion.div initial={{ width: 0 }} animate={{ width: `${overallProgress}%` }} transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
            className="h-full rounded-full" style={{ background: `linear-gradient(90deg, ${B.blue}, ${B.success})` }} />
        </div>
      </motion.div>

      {/* Quick Actions */}
      <motion.div {...fade(0.12)} className="mb-6">
        <SectionHeader title="Quick Actions" icon={ClipboardList} iconColor={B.blue} />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {QUICK_ACTIONS.map(a => (
            <button key={a.label} onClick={() => navigate(a.to)}
              className="bg-white rounded-xl p-4 border border-gray-100 flex items-center gap-3 hover:shadow-md transition-all text-left"
              style={{ boxShadow: '0 2px 8px rgba(10,31,92,0.05)' }}>
              <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: `${B.blue}12` }}>
                <a.icon className="w-4 h-4" style={{ color: B.blue }} />
              </div>
              <span className="text-xs font-bold text-gray-700">{a.label}</span>
            </button>
          ))}
        </div>
      </motion.div>

      {/* Charts row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <motion.div {...fade(0.14)} className="bg-white rounded-2xl p-5 border border-gray-100" style={{ boxShadow: '0 2px 12px rgba(10,31,92,0.06)' }}>
          <SectionHeader title="Joining Trend" sub="Last 6 months" />
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={joiningTrend || []}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
              <Tooltip content={<ChartTip />} />
              <Line type="monotone" dataKey="joiners" stroke={B.blue} strokeWidth={2.5} dot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </motion.div>
        <motion.div {...fade(0.16)} className="bg-white rounded-2xl p-5 border border-gray-100" style={{ boxShadow: '0 2px 12px rgba(10,31,92,0.06)' }}>
          <SectionHeader title="Onboarding Completion" />
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={completionPie} dataKey="value" nameKey="name" innerRadius={55} outerRadius={85} paddingAngle={2}>
                {completionPie.map((c, i) => <Cell key={i} fill={c.color} />)}
              </Pie>
              <Tooltip content={<ChartTip />} />
            </PieChart>
          </ResponsiveContainer>
          <div className="flex flex-wrap gap-3 justify-center mt-1">
            {completionPie.map(c => (
              <div key={c.name} className="flex items-center gap-1.5 text-xs text-gray-600">
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: c.color }} /> {c.name} ({c.value})
              </div>
            ))}
          </div>
        </motion.div>
      </div>

      {/* Charts row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <motion.div {...fade(0.18)} className="bg-white rounded-2xl p-5 border border-gray-100" style={{ boxShadow: '0 2px 12px rgba(10,31,92,0.06)' }}>
          <SectionHeader title="Training Progress" sub={trainingChart?.available === false ? 'Not available on this training schema' : undefined} />
          {trainingChart?.available === false ? (
            <div className="h-[220px] flex items-center justify-center text-sm text-gray-400">— No training data source available —</div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={trainingBars}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip content={<ChartTip />} />
                <Bar dataKey="value" radius={[8, 8, 0, 0]}>
                  {trainingBars.map((b, i) => <Cell key={i} fill={b.color} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </motion.div>
        <motion.div {...fade(0.2)} className="bg-white rounded-2xl p-5 border border-gray-100" style={{ boxShadow: '0 2px 12px rgba(10,31,92,0.06)' }}>
          <SectionHeader title="Probation Status" />
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={probationBars}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
              <Tooltip content={<ChartTip />} />
              <Bar dataKey="value" radius={[8, 8, 0, 0]}>
                {probationBars.map((b, i) => <Cell key={i} fill={b.color} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </motion.div>
      </div>

      {/* Recent Joiners + Pending Tasks */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <motion.div {...fade(0.22)} className="lg:col-span-2 bg-white rounded-2xl p-5 border border-gray-100" style={{ boxShadow: '0 2px 12px rgba(10,31,92,0.06)' }}>
          <SectionHeader title="Recent Joiners" action="View All" onAction={() => navigate('/hr-admin/employees')} />
          <div className="space-y-2">
            {(employees || []).length === 0 && <p className="text-sm text-gray-400 text-center py-6">No employees match the current filters.</p>}
            {(employees || []).map(e => {
              const [c1, c2] = avatarGrad(e.name);
              return (
                <button key={e.id} onClick={() => navigate(`/hr-admin/onboarding/employee/${e.id}`)}
                  className="w-full flex items-center gap-3 p-2.5 rounded-xl hover:bg-gray-50 transition-all text-left">
                  <div className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                    style={{ background: `linear-gradient(135deg, ${c1}, ${c2})` }}>
                    {initials(e.name)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-gray-800 truncate">{e.name}</p>
                    <p className="text-[11px] text-gray-400 truncate">{e.department_name || 'No department'} · {e.date_of_joining ? new Date(e.date_of_joining).toLocaleDateString('en-IN') : '—'}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-xs font-bold" style={{ color: STATUS_COLORS[e.onboarding_status] }}>{e.progress_pct}%</p>
                    <p className="text-[10px] text-gray-400">{STATUS_LABEL[e.onboarding_status]}</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-gray-300 flex-shrink-0" />
                </button>
              );
            })}
          </div>
        </motion.div>

        <motion.div {...fade(0.24)} className="bg-white rounded-2xl p-5 border border-gray-100" style={{ boxShadow: '0 2px 12px rgba(10,31,92,0.06)' }}>
          <SectionHeader title="Pending Tasks" />
          <div className="space-y-2 max-h-[380px] overflow-y-auto">
            {(tasks || []).length === 0 && <p className="text-sm text-gray-400 text-center py-6">Nothing pending.</p>}
            {(tasks || []).map(t => (
              <div key={t.item_key} className="flex items-center justify-between p-2.5 rounded-xl bg-gray-50">
                <div className="min-w-0">
                  <p className="text-xs font-bold text-gray-700 truncate">{t.title}</p>
                  <p className="text-[10px] text-gray-400">{t.owner_department}</p>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  {t.overdue_count > 0 && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-50 text-red-500">{t.overdue_count} overdue</span>
                  )}
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50" style={{ color: B.blue }}>{t.pending_count}</span>
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      </div>

      {/* Upcoming Probation */}
      <motion.div {...fade(0.26)} className="bg-white rounded-2xl p-5 mb-6 border border-gray-100 overflow-x-auto" style={{ boxShadow: '0 2px 12px rgba(10,31,92,0.06)' }}>
        <SectionHeader title="Upcoming Probation" sub="Next 60 days, not yet confirmed" />
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] font-bold text-gray-400 uppercase tracking-wide border-b border-gray-100">
              <th className="pb-2 pr-3">Name</th>
              <th className="pb-2 pr-3">Department</th>
              <th className="pb-2 pr-3">Probation End</th>
              <th className="pb-2 pr-3">Days Left</th>
            </tr>
          </thead>
          <tbody>
            {(probation || []).length === 0 && (
              <tr><td colSpan={4} className="py-6 text-center text-gray-400">No probation reviews due in the next 60 days.</td></tr>
            )}
            {(probation || []).map(p => (
              <tr key={p.id} className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer" onClick={() => navigate(`/hr-admin/onboarding/employee/${p.id}`)}>
                <td className="py-2.5 pr-3 font-semibold text-gray-800">{p.name}</td>
                <td className="py-2.5 pr-3 text-gray-500">{p.department_name || '—'}</td>
                <td className="py-2.5 pr-3 text-gray-500">{p.probation_end_date ? new Date(p.probation_end_date).toLocaleDateString('en-IN') : '—'}</td>
                <td className="py-2.5 pr-3">
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${p.days_left < 0 ? 'bg-red-50 text-red-500' : p.days_left <= 15 ? 'bg-amber-50 text-amber-600' : 'bg-blue-50'}`} style={p.days_left > 15 ? { color: B.blue } : {}}>
                    {p.days_left} days
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </motion.div>

      {/* KPI groups */}
      <div className="mb-6">
        <SectionHeader title="Documents" icon={FileText} iconColor={B.blue} />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <KpiCard label="Pending Verification" value={kpis.documents?.pending_verification} icon={Clock} color={B.warning} bg="#FEF3C7" />
          <KpiCard label="Verified" value={kpis.documents?.verified} icon={CheckCircle2} color={B.success} bg="#D1FAE5" />
          <KpiCard label="Rejected" value={kpis.documents?.rejected} icon={AlertTriangle} color={B.danger} bg="#FEE2E2" />
          <KpiCard label="Missing Required Docs" value={kpis.documents?.missing_required} icon={FileText} color={B.blue} bg="#DBEAFE" />
        </div>

        <SectionHeader title="IT & Assets" icon={Laptop} iconColor={B.blue} />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <KpiCard label="Laptop Assigned" value={kpis.it?.laptop_assigned} icon={Laptop} color={B.success} bg="#D1FAE5" />
          <KpiCard label="Laptop Pending" value={kpis.it?.laptop_pending} icon={Laptop} color={B.warning} bg="#FEF3C7" />
          <KpiCard label="Mobile Assigned" value={kpis.it?.mobile_assigned} icon={Smartphone} color={B.blue} bg="#DBEAFE" />
          <KpiCard label="Access Card Assigned" value={kpis.it?.access_card_assigned} icon={Contact} color={B.blue} bg="#DBEAFE" />
          <KpiCard label="Email Pending" value={kpis.it?.email_pending} icon={Mail} color={B.warning} bg="#FEF3C7" />
          <KpiCard label="ERP Login Pending" value={kpis.it?.erp_login_pending} icon={UserCheck} color={B.warning} bg="#FEF3C7" />
          <KpiCard label="Access Permissions Pending" value={kpis.it?.access_permissions_pending} icon={ShieldCheck} color={B.warning} bg="#FEF3C7" />
          <KpiCard label="ID Card Pending" value={kpis.it?.id_card_pending} icon={Contact} color={B.warning} bg="#FEF3C7" />
        </div>

        <SectionHeader title="Training" icon={GraduationCap} iconColor={B.blue} />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <KpiCard label="Assigned" value={kpis.training?.assigned} icon={GraduationCap} color={B.blue} bg="#DBEAFE" />
          <KpiCard label="Completed" value={kpis.training?.completed} icon={CheckCircle2} color={B.success} bg="#D1FAE5" />
          <KpiCard label="Certificates Issued" value={kpis.training?.certificates_issued} icon={Award} color={B.blue} bg="#DBEAFE" />
        </div>

        <SectionHeader title="Probation & Confirmation" icon={BadgeCheck} iconColor={B.blue} />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KpiCard label="Overdue" value={kpis.probation?.overdue} icon={AlertTriangle} color={B.danger} bg="#FEE2E2" />
          <KpiCard label="Due Soon" value={kpis.probation?.due_soon} icon={Clock} color={B.warning} bg="#FEF3C7" />
          <KpiCard label="Confirmed" value={kpis.probation?.confirmed} icon={CheckCircle2} color={B.success} bg="#D1FAE5" />
        </div>
      </div>

      {/* Notifications / Alerts */}
      <motion.div {...fade(0.28)} className="bg-white rounded-2xl p-5 mb-6 border border-gray-100" style={{ boxShadow: '0 2px 12px rgba(10,31,92,0.06)' }}>
        <SectionHeader title="Alerts" icon={Bell} iconColor={B.blue} />
        <div className="space-y-2">
          {(summary?.alerts || []).length === 0 && <p className="text-sm text-gray-400 text-center py-4">No active alerts.</p>}
          {(summary?.alerts || []).map((a, i) => (
            <div key={i} className="flex items-center gap-3 p-3 rounded-xl cursor-pointer hover:bg-gray-50"
              onClick={() => a.link && navigate(a.link)}>
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${a.severity === 'critical' ? 'bg-red-50' : 'bg-amber-50'}`}>
                <AlertTriangle className={`w-4 h-4 ${a.severity === 'critical' ? 'text-red-500' : 'text-amber-500'}`} />
              </div>
              <p className="text-sm text-gray-700 flex-1">{a.message}</p>
              <ChevronRight className="w-4 h-4 text-gray-300" />
            </div>
          ))}
        </div>
      </motion.div>

      {/* Reports */}
      <motion.div {...fade(0.3)} className="bg-white rounded-2xl p-5 border border-gray-100" style={{ boxShadow: '0 2px 12px rgba(10,31,92,0.06)' }}>
        <SectionHeader title="Reports" icon={ClipboardList} iconColor={B.blue} />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {REPORTS.map(r => (
            <button key={r.key} onClick={() => navigate(`/hr-admin/onboarding/reports?key=${r.key}`)}
              className="text-left p-3 rounded-xl border border-gray-100 hover:shadow-md transition-all text-xs font-bold text-gray-700 flex items-center justify-between">
              {r.label} <ArrowRight className="w-3.5 h-3.5 text-gray-300" />
            </button>
          ))}
        </div>
      </motion.div>
    </div>
  );
}
