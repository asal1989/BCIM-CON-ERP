import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  Briefcase, FileText, AlertTriangle, CalendarClock, ChevronRight,
  Building2, PauseCircle, Receipt,
} from 'lucide-react';
import { projectAPI, tqsBillsAPI, raBillAPI } from '../../api/client';
import { DashTable, inr, inrCompact, Badge } from './DashKPI';
import { PageHeader, KpiCard as ThemeKpiCard, Theme } from '../../theme';
import dayjs from 'dayjs';

const STATUS_CLS = {
  active:     'bg-emerald-100 text-emerald-700',
  planning:   'bg-blue-100 text-blue-700',
  completed:  'bg-slate-100 text-slate-600',
  on_hold:    'bg-amber-100 text-amber-700',
};

const BILL_CLS = {
  pending:  'bg-amber-100 text-amber-700',
  stores:   'bg-blue-100 text-blue-700',
  qs:       'bg-indigo-100 text-indigo-700',
  accounts: 'bg-purple-100 text-purple-700',
};

// ── helpers ──────────────────────────────────────────────────────────────────
function SectionTitle({ icon: Icon, title, subtitle, action }) {
  return (
    <div className="flex items-center justify-between mb-4">
      <div className="flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-xl bg-emerald-50 flex items-center justify-center">
          <Icon className="w-4 h-4 text-emerald-600" />
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

export default function PMDashboard() {
  const { data: projects = [], isLoading: loadP } = useQuery({
    queryKey: ['pm-dash-projects'],
    queryFn: () => projectAPI.list().then(r => {
      const d = r.data;
      return Array.isArray(d) ? d : (d?.data ?? d?.projects ?? []);
    }),
  });

  const { data: bills = [], isLoading: loadB } = useQuery({
    queryKey: ['tqs-bills', 'pm-dash'],
    queryFn: () => tqsBillsAPI.list().then(r => Array.isArray(r.data) ? r.data : (r.data?.data ?? [])),
    staleTime: 0,
    refetchOnWindowFocus: true,
  });

  const active        = projects.filter(p => p.status === 'active').length;
  const onHold         = projects.filter(p => p.status === 'on_hold').length;
  const totalValue    = projects.reduce((s, p) => s + parseFloat(p.contract_value || p.value || 0), 0);
  const pendingBills  = bills.filter(b => ['pending','stores','qs'].includes(b.workflow_status));
  const pendingAmt    = pendingBills.reduce((s, b) => s + parseFloat(b.total_amount || 0), 0);

  const upcoming = projects
    .filter(p => p.end_date && dayjs(p.end_date).diff(dayjs(), 'day') <= 60 && dayjs(p.end_date).isAfter(dayjs()))
    .sort((a, b) => dayjs(a.end_date).diff(dayjs(b.end_date)));

  const overdue = projects
    .filter(p => p.end_date && dayjs(p.end_date).isBefore(dayjs()) && p.status !== 'completed');

  const projCols = [
    { key: 'name',           label: 'Project',    cls: 'font-medium text-slate-700' },
    { key: 'status',         label: 'Status',     render: r => <Badge label={r.status || 'active'} cls={STATUS_CLS[r.status] || STATUS_CLS.active} /> },
    { key: 'contract_value', label: 'Value',      right: true, render: r => inr(r.contract_value || r.value) },
    { key: 'end_date',       label: 'Deadline',   render: r => r.end_date ? dayjs(r.end_date).format('DD MMM YY') : '—' },
  ];

  const billCols = [
    { key: 'vendor_name',     label: 'Vendor',   cls: 'font-medium text-slate-900 max-w-[130px] truncate' },
    { key: 'inv_number',      label: 'Invoice' },
    { key: 'total_amount',    label: 'Amount',   right: true, render: r => inr(r.total_amount) },
    { key: 'workflow_status', label: 'Stage',    render: r => <Badge label={r.workflow_status} cls={BILL_CLS[r.workflow_status] || 'bg-slate-100 text-slate-600'} /> },
  ];

  return (
    <div style={{ background: Theme.pageBg, minHeight: '100vh' }}>

      <PageHeader
        title="Projects Dashboard"
        subtitle="Active projects, bills & progress overview"
        breadcrumbs={[{ label: 'Projects' }, { label: 'Dashboard' }]}
        actions={
          <Link to="/projects"
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-lg transition shadow-sm"
            style={{ background: '#fff', color: Theme.navyDark }}>
            <Briefcase className="w-3.5 h-3.5" /> All Projects
          </Link>
        }
      />

      <div className="p-5 md:p-6 max-w-[1400px] mx-auto space-y-5">

        {/* ── KPI Row ── */}
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
          <ThemeKpiCard icon={Briefcase}     label="Active Projects"      value={loadP ? '—' : active}                    color="indigo"  sub={`${projects.length} total`} />
          <ThemeKpiCard icon={PauseCircle}   label="On Hold"              value={loadP ? '—' : onHold}                    color="amber"   sub="Projects paused" />
          <ThemeKpiCard icon={FileText}      label="Total Contract Value" value={loadP ? '—' : inrCompact(totalValue)}    color="emerald" sub={loadP ? '' : inr(totalValue)} />
          <ThemeKpiCard icon={Receipt}       label="Bills Pending"        value={loadB ? '—' : pendingBills.length}       color="orange"  sub={loadB ? '' : inrCompact(pendingAmt)} />
          <ThemeKpiCard icon={AlertTriangle} label="Overdue Milestones"   value={loadP ? '—' : overdue.length}            color="red"     sub="Past deadline" />
          <ThemeKpiCard icon={CalendarClock} label="Closing in 60 Days"   value={loadP ? '—' : upcoming.length}           color="blue"    sub="Upcoming deadlines" />
        </div>

        {/* ── Alert banners ── */}
        {(pendingBills.length > 0 || overdue.length > 0) && (
          <div className="flex flex-col gap-2">
            {pendingBills.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-center gap-3">
                <AlertTriangle size={15} className="text-amber-600 flex-shrink-0" />
                <span className="text-sm font-medium text-amber-800">
                  {pendingBills.length} bill{pendingBills.length > 1 ? 's' : ''} awaiting approval — {inr(pendingAmt)} pending
                </span>
                <Link to="/tqs/bills" className="ml-auto text-xs font-semibold text-amber-700 underline whitespace-nowrap">Review →</Link>
              </div>
            )}
            {overdue.length > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex items-center gap-3">
                <AlertTriangle size={15} className="text-red-600 flex-shrink-0" />
                <span className="text-sm font-medium text-red-800">
                  {overdue.length} project{overdue.length > 1 ? 's' : ''} past their deadline
                </span>
                <Link to="/projects" className="ml-auto text-xs font-semibold text-red-700 underline whitespace-nowrap">View →</Link>
              </div>
            )}
          </div>
        )}

        {/* ── Main Grid: My Projects + Bills Pending Approval ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-5 pb-0">
              <SectionTitle icon={Building2} title="My Projects"
                subtitle={`${projects.length} total`}
                action={
                  <Link to="/projects" className="flex items-center gap-1 text-[10px] font-semibold text-emerald-600 hover:text-emerald-700">
                    All <ChevronRight className="w-3 h-3" />
                  </Link>
                }
              />
            </div>
            {loadP ? (
              <div className="p-5 space-y-2">{[1,2,3,4].map(n => <div key={n} className="h-10 bg-slate-100 rounded-xl animate-pulse" />)}</div>
            ) : (
              <div className="px-5 pb-5">
                <div className="overflow-x-auto rounded-xl border border-slate-200">
                  <DashTable cols={projCols} rows={projects.slice(0, 8)} empty="No projects found" />
                </div>
              </div>
            )}
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-5 pb-0">
              <SectionTitle icon={Receipt} title="Bills Pending Approval"
                subtitle={`${pendingBills.length} pending`}
                action={
                  <Link to="/tqs/bills" className="flex items-center gap-1 text-[10px] font-semibold text-emerald-600 hover:text-emerald-700">
                    All <ChevronRight className="w-3 h-3" />
                  </Link>
                }
              />
            </div>
            {loadB ? (
              <div className="p-5 space-y-2">{[1,2,3,4].map(n => <div key={n} className="h-10 bg-slate-100 rounded-xl animate-pulse" />)}</div>
            ) : (
              <div className="px-5 pb-5">
                <div className="overflow-x-auto rounded-xl border border-slate-200">
                  <DashTable cols={billCols} rows={pendingBills.slice(0, 8)} empty="No pending approvals" />
                </div>
                {pendingBills.length > 0 && (
                  <p className="text-right text-xs text-slate-600 font-semibold mt-2">Total pending: {inr(pendingAmt)}</p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── Upcoming deadlines ── */}
        {upcoming.length > 0 && (
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
            <SectionTitle icon={CalendarClock} title="Projects Closing in 60 Days" subtitle={`${upcoming.length} projects`} />
            <div className="flex flex-wrap gap-3">
              {upcoming.map(p => (
                <div key={p.id} className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  <CalendarClock className="w-4 h-4 text-amber-500" />
                  <div>
                    <p className="text-xs font-medium text-slate-700">{p.name}</p>
                    <p className="text-[11px] text-amber-600">Due {dayjs(p.end_date).format('D MMM YYYY')} · {dayjs(p.end_date).diff(dayjs(), 'day')} days left</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
