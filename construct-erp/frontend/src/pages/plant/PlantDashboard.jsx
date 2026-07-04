// src/pages/plant/PlantDashboard.jsx — Fleet status dashboard
import React from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import {
  Truck, CheckCircle, Clock, Wrench, FileWarning, Briefcase,
  Layers, ArrowLeftRight, Gauge, Fuel, UserCheck, ShieldCheck,
  Calculator, FileBarChart, ChevronRight, BarChart3, PieChart as PieChartIcon,
  RefreshCw,
} from 'lucide-react';
import {
  ResponsiveContainer, PieChart, Pie, Cell, Tooltip,
} from 'recharts';
import { plantAPI } from '../../api/client';
import { inr, ddmmyyyy } from './_shared';
import { PageHeader, KpiCard as ThemeKpiCard, Theme } from '../../theme';

const OWNERSHIP_COLORS = { own: '#0d9488', hired: '#8b5cf6' };
const OWNERSHIP_LABEL = { own: 'Own', hired: 'Hired-in' };

function SectionTitle({ icon: Icon, title, subtitle, action }) {
  return (
    <div className="flex items-center justify-between mb-4">
      <div className="flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-xl bg-teal-50 flex items-center justify-center">
          <Icon className="w-4 h-4 text-teal-600" />
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

const QUICK_LINKS = [
  { to: '/plant/equipment',   icon: Truck,         label: 'Asset Register',         desc: 'Equipment master & status' },
  { to: '/plant/masters',     icon: Layers,        label: 'Masters',                 desc: 'Types, categories & vendors' },
  { to: '/plant/transfers',   icon: ArrowLeftRight, label: 'Transfers & Disposals',  desc: 'Site moves & write-offs' },
  { to: '/plant/hire',        icon: Briefcase,     label: 'Hire Management',         desc: 'Hire-in / hire-out tracking' },
  { to: '/plant/deployment',  icon: Gauge,         label: 'Deployment & Utilisation', desc: 'Site allocation & hours' },
  { to: '/plant/fuel',        icon: Fuel,          label: 'Fuel Management',         desc: 'Consumption logs' },
  { to: '/plant/maintenance', icon: Wrench,        label: 'Maintenance & Repairs',   desc: 'Schedules & work orders' },
  { to: '/plant/operators',   icon: UserCheck,     label: 'Operator Management',     desc: 'Operator assignments' },
  { to: '/plant/compliance',  icon: ShieldCheck,   label: 'Document Compliance',     desc: 'Permits, insurance, fitness' },
  { to: '/plant/cost',        icon: Calculator,    label: 'Cost Allocation',         desc: 'Equipment cost to projects' },
  { to: '/plant/reports',     icon: FileBarChart,  label: 'Reports & Analytics',     desc: 'Utilisation & cost reports' },
];

function dueTone(daysLeft) {
  const d = Number(daysLeft);
  if (d < 0) return 'text-red-600 font-semibold';
  if (d <= 7) return 'text-amber-600 font-semibold';
  return 'text-blue-600';
}

export default function PlantDashboard() {
  const now = dayjs();
  const month = now.month() + 1;
  const year = now.year();

  const dash = useQuery({
    queryKey: ['pm-dashboard'],
    queryFn: () => plantAPI.dashboard().then((r) => r.data?.data).catch(() => null),
  });
  const expiry = useQuery({
    queryKey: ['pm-expiry-alerts'],
    queryFn: () => plantAPI.expiryAlerts().then((r) => r.data?.data || []).catch(() => []),
  });
  const maintDue = useQuery({
    queryKey: ['pm-maint-due-dash'],
    queryFn: () => plantAPI.maintenanceDue().then((r) => r.data?.data || []).catch(() => []),
  });
  const hireIn = useQuery({
    queryKey: ['pm-hire-in-dash'],
    queryFn: () => plantAPI.listHireIn().then((r) => r.data?.data || []).catch(() => []),
  });
  const fuel = useQuery({
    queryKey: ['pm-fuel-dash'],
    queryFn: () => plantAPI.listFuel().then((r) => r.data?.data || []).catch(() => []),
  });
  const cost = useQuery({
    queryKey: ['pm-cost-dash', month, year],
    queryFn: () => plantAPI.costReport({ month, year }).then((r) => r.data?.data || {}).catch(() => ({})),
  });

  const refetchAll = () => {
    dash.refetch(); expiry.refetch(); maintDue.refetch(); hireIn.refetch(); fuel.refetch(); cost.refetch();
  };

  const s = dash.data?.summary || {};

  const cards = [
    { label: 'Total Fleet',       value: s.total_equipment ?? 0, icon: Truck,       color: 'blue',    sub: 'Own + hired',    to: '/plant/equipment' },
    { label: 'Active',            value: s.active ?? 0,          icon: CheckCircle, color: 'emerald', sub: 'On site',        to: '/plant/equipment' },
    { label: 'Idle',              value: s.idle ?? 0,            icon: Clock,       color: 'amber',   sub: 'Standby',        to: '/plant/equipment' },
    { label: 'Under Maintenance', value: s.maintenance ?? 0,     icon: Wrench,      color: 'indigo',  sub: 'In repair',      to: '/plant/maintenance' },
    { label: 'Hired-in Active',   value: s.hire_pending ?? 0,    icon: Briefcase,   color: 'purple',  sub: 'From vendors',   to: '/plant/hire' },
    { label: 'Docs Expiring',     value: s.expiring_docs ?? 0,   icon: FileWarning, color: 'red',     sub: 'Within 30 days', to: '/plant/compliance' },
  ];

  const util = (dash.data?.utilisation || [])
    .map((u) => ({ ...u, worked: Number(u.hours_worked || 0), idle: Number(u.idle_hours || 0) }))
    .filter((u) => u.worked + u.idle > 0)
    .slice(0, 8);

  const byType = (dash.data?.by_type || []).map((t) => ({
    name: OWNERSHIP_LABEL[t.type] || t.type, key: t.type,
    value: Number(t.c || 0), cost: Number(t.v || 0),
  }));
  const totalTypeValue = byType.reduce((sum, t) => sum + t.cost, 0);

  const fuelByType = {};
  (fuel.data || []).forEach((f) => {
    if (!f.issue_date || !dayjs(f.issue_date).isSame(now, 'month')) return;
    const k = f.fuel_type_name || 'Other';
    if (!fuelByType[k]) fuelByType[k] = { name: k, qty: 0, cost: 0 };
    fuelByType[k].qty += Number(f.quantity || 0);
    fuelByType[k].cost += Number(f.amount || 0);
  });
  const fuelTypes = Object.values(fuelByType).sort((a, b) => b.cost - a.cost);
  const fuelTotalQty = fuelTypes.reduce((sum, t) => sum + t.qty, 0);
  const fuelTotalCost = fuelTypes.reduce((sum, t) => sum + t.cost, 0);

  const expiryRows = (expiry.data || [])
    .filter((d) => d.expiry_status !== 'valid')
    .slice(0, 6);

  const maintRows = (maintDue.data || []).slice(0, 6);

  const hireRows = (hireIn.data || [])
    .filter((h) => h.status === 'ordered' || h.status === 'deployed')
    .sort((a, b) => {
      if (!a.end_date) return 1;
      if (!b.end_date) return -1;
      return dayjs(a.end_date).diff(dayjs(b.end_date));
    })
    .slice(0, 6);
  const monthlyHireCost = Number((cost.data?.own_vs_hired || []).find((c) => c.cost_type === 'hired')?.total_cost || 0);

  return (
    <div style={{ background: Theme.pageBg, minHeight: '100vh' }}>

      <PageHeader
        title="Plant & Machinery Dashboard"
        subtitle="Equipment utilization, maintenance & hire overview"
        breadcrumbs={[{ label: 'Plant & Machinery' }, { label: 'Dashboard' }]}
        actions={
          <>
            <button onClick={refetchAll}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-lg transition shadow-sm"
              style={{ background: '#fff', color: Theme.navyDark }}>
              <RefreshCw className="w-3.5 h-3.5" /> Refresh
            </button>
            <Link to="/plant/equipment"
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg transition"
              style={{ background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.25)', color: '#fff' }}>
              <Truck className="w-3.5 h-3.5" /> Equipment List
            </Link>
          </>
        }
      />

      <div className="p-5 md:p-6 max-w-[1400px] mx-auto space-y-5">

        {dash.isLoading ? (
          <div className="py-20 text-center text-sm text-slate-400">Loading dashboard…</div>
        ) : (
          <>
            {/* ── KPI Row ── */}
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
              {cards.map((c) => (
                <ThemeKpiCard key={c.label} icon={c.icon} label={c.label} value={c.value} color={c.color} sub={c.sub} />
              ))}
            </div>

            {/* ── Alert banners ── */}
            {(Number(s.expiring_docs) > 0 || maintRows.length > 0) && (
              <div className="flex flex-col gap-2">
                {Number(s.expiring_docs) > 0 && (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-center gap-3">
                    <FileWarning size={15} className="text-amber-600 flex-shrink-0" />
                    <span className="text-sm font-medium text-amber-800">
                      {s.expiring_docs} document{Number(s.expiring_docs) > 1 ? 's' : ''} expiring within 30 days
                    </span>
                    <Link to="/plant/compliance" className="ml-auto text-xs font-semibold text-amber-700 underline whitespace-nowrap">Review →</Link>
                  </div>
                )}
                {maintRows.length > 0 && (
                  <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 flex items-center gap-3">
                    <Wrench size={15} className="text-blue-600 flex-shrink-0" />
                    <span className="text-sm font-medium text-blue-800">
                      {maintRows.length} equipment item{maintRows.length > 1 ? 's' : ''} due for maintenance
                    </span>
                    <Link to="/plant/maintenance" className="ml-auto text-xs font-semibold text-blue-700 underline whitespace-nowrap">View →</Link>
                  </div>
                )}
              </div>
            )}

            {/* ── Quick Access ── */}
            <div>
              <h3 className="mb-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">Quick Access</h3>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                {QUICK_LINKS.map((q) => (
                  <Link key={q.to} to={q.to}
                    className="group flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm transition hover:-translate-y-0.5 hover:border-teal-300 hover:shadow-md">
                    <span className="inline-flex w-fit rounded-lg bg-teal-50 p-2 transition group-hover:bg-teal-100">
                      <q.icon className="h-4 w-4 text-teal-600" />
                    </span>
                    <div>
                      <div className="text-xs font-semibold text-slate-800">{q.label}</div>
                      <div className="text-[11px] text-slate-400">{q.desc}</div>
                    </div>
                  </Link>
                ))}
              </div>
            </div>

            {/* ── Utilisation + Fleet Composition + Fuel ── */}
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
              <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
                <SectionTitle icon={BarChart3} title="Equipment Utilisation" subtitle="Hours worked vs idle"
                  action={<Link to="/plant/reports" className="flex items-center gap-1 text-[10px] font-semibold text-teal-600 hover:text-teal-700">View Report <ChevronRight className="w-3 h-3" /></Link>}
                />
                {util.length === 0 ? <div className="py-16 text-center text-xs text-slate-400">No deployment data</div> : (
                  <div className="space-y-2.5">
                    {util.map((u) => {
                      const pct = Math.round((u.worked / (u.worked + u.idle)) * 100);
                      const barColor = pct >= 65 ? 'bg-teal-500' : pct >= 40 ? 'bg-amber-500' : 'bg-red-500';
                      return (
                        <div key={u.code || u.name} className="flex items-center gap-2.5">
                          <div className="w-20 shrink-0 truncate text-[11px] text-slate-500" title={u.name}>{u.code || u.name}</div>
                          <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                            <div className={`h-full rounded-full ${barColor}`} style={{ width: `${pct}%` }} />
                          </div>
                          <div className="w-12 shrink-0 text-right text-[11px] text-slate-500">{u.worked.toFixed(0)}h</div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-5">
                <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
                  <SectionTitle icon={PieChartIcon} title="Fleet Composition" subtitle="Own vs hired-in"
                    action={<Link to="/plant/equipment" className="flex items-center gap-1 text-[10px] font-semibold text-teal-600 hover:text-teal-700">View <ChevronRight className="w-3 h-3" /></Link>}
                  />
                  {byType.length === 0 ? <div className="py-10 text-center text-xs text-slate-400">No equipment</div> : (
                    <div className="flex items-center gap-4">
                      <ResponsiveContainer width={90} height={90}>
                        <PieChart>
                          <Pie data={byType} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={26} outerRadius={42} paddingAngle={2}>
                            {byType.map((t) => <Cell key={t.key} fill={OWNERSHIP_COLORS[t.key] || '#94a3b8'} />)}
                          </Pie>
                          <Tooltip formatter={(v, n, p) => [`${v} units · ${inr(p.payload.cost)}`, p.payload.name]} />
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="flex-1 space-y-2">
                        {byType.map((t) => (
                          <div key={t.key} className="flex items-center justify-between text-xs">
                            <span className="flex items-center gap-1.5 text-slate-600">
                              <span className="h-2 w-2 rounded-full" style={{ background: OWNERSHIP_COLORS[t.key] || '#94a3b8' }} />
                              {t.name}
                            </span>
                            <span className="font-semibold text-slate-700">{t.value}</span>
                          </div>
                        ))}
                        <div className="flex items-center justify-between border-t border-slate-100 pt-1.5 text-xs">
                          <span className="text-slate-400">Total value</span>
                          <span className="font-semibold text-slate-700">{inr(totalTypeValue)}</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
                  <SectionTitle icon={Fuel} title="Fuel This Month" subtitle={now.format('MMMM YYYY')}
                    action={<Link to="/plant/fuel" className="flex items-center gap-1 text-[10px] font-semibold text-teal-600 hover:text-teal-700">View Log <ChevronRight className="w-3 h-3" /></Link>}
                  />
                  {fuelTypes.length === 0 ? <div className="py-6 text-center text-xs text-slate-400">No fuel issued this month</div> : (
                    <div>
                      {fuelTypes.map((f) => (
                        <div key={f.name} className="flex items-center justify-between border-b border-slate-100 py-2 last:border-0">
                          <div>
                            <div className="text-xs text-slate-700">{f.name}</div>
                            <div className="text-[11px] text-slate-400">{f.qty.toLocaleString('en-IN')} L consumed</div>
                          </div>
                          <div className="text-xs font-semibold text-slate-700">{inr(f.cost)}</div>
                        </div>
                      ))}
                      <div className="mt-2 flex items-center justify-between border-t border-slate-100 pt-2">
                        <div>
                          <div className="text-xs text-slate-500">Total cost</div>
                          <div className="text-[11px] text-slate-400">{fuelTotalQty.toLocaleString('en-IN')} L total</div>
                        </div>
                        <div className="text-sm font-semibold text-teal-600">{inr(fuelTotalCost)}</div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* ── Document Expiry / Maintenance Due / Hire-in Status ── */}
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
              <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
                <SectionTitle icon={FileWarning} title="Document Expiry Alerts" subtitle="Permits, insurance, fitness"
                  action={<Link to="/plant/compliance" className="flex items-center gap-1 text-[10px] font-semibold text-teal-600 hover:text-teal-700">View All <ChevronRight className="w-3 h-3" /></Link>}
                />
                {expiryRows.length === 0 ? <div className="py-10 text-center text-xs text-slate-400">No documents expiring soon</div> : (
                  <div>
                    {expiryRows.map((d) => (
                      <div key={d.id} className="flex items-center gap-2.5 border-b border-slate-100 py-2 last:border-0">
                        <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${d.expiry_status === 'expired' ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-600'}`}>
                          <FileWarning className="h-3.5 w-3.5" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-xs font-medium text-slate-800">{d.equipment_code} · {d.equipment_name}</div>
                          <div className="truncate text-[11px] text-slate-400">{d.document_type || 'Document'}</div>
                        </div>
                        <span className={`shrink-0 text-[11px] font-semibold ${d.expiry_status === 'expired' ? 'text-red-600' : 'text-amber-600'}`}>
                          {d.expiry_status === 'expired' ? 'Expired' : `${d.days_left}d`}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="p-5 pb-0">
                  <SectionTitle icon={Wrench} title="Maintenance Due" subtitle="Next 30 days"
                    action={<Link to="/plant/maintenance" className="flex items-center gap-1 text-[10px] font-semibold text-teal-600 hover:text-teal-700">View All <ChevronRight className="w-3 h-3" /></Link>}
                  />
                </div>
                {maintRows.length === 0 ? <div className="py-10 text-center text-xs text-slate-400">Nothing due in next 30 days</div> : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-slate-50 border-y border-slate-100">
                          {['Equipment', 'Type', 'Due'].map((h, i) => (
                            <th key={h} className={`px-4 py-2.5 text-[10px] font-bold uppercase tracking-widest text-slate-400 ${i === 2 ? 'text-right' : 'text-left'}`}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {maintRows.map((m) => (
                          <tr key={m.id} className="hover:bg-slate-50 transition-colors group">
                            <td className="px-4 py-3 truncate text-xs text-slate-700">{m.equipment_code} {m.equipment_name}</td>
                            <td className="px-4 py-3">
                              <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${String(m.maintenance_type).toLowerCase() === 'breakdown' ? 'bg-red-50 text-red-600' : 'bg-blue-50 text-blue-600'}`}>
                                {m.maintenance_type}
                              </span>
                            </td>
                            <td className={`px-4 py-3 text-right text-[11px] ${dueTone(m.days_left)}`}>
                              {Number(m.days_left) < 0 ? 'Overdue' : `${m.days_left}d`}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="p-5 pb-0">
                  <SectionTitle icon={Briefcase} title="Hire-in Status" subtitle="Active vendor orders"
                    action={<Link to="/plant/hire" className="flex items-center gap-1 text-[10px] font-semibold text-teal-600 hover:text-teal-700">View All <ChevronRight className="w-3 h-3" /></Link>}
                  />
                </div>
                {hireRows.length === 0 ? <div className="py-10 text-center text-xs text-slate-400">No active hire-in orders</div> : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-slate-50 border-y border-slate-100">
                          {['Equipment', 'Vendor', 'Return'].map((h, i) => (
                            <th key={h} className={`px-4 py-2.5 text-[10px] font-bold uppercase tracking-widest text-slate-400 ${i === 2 ? 'text-right' : 'text-left'}`}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {hireRows.map((h) => {
                          const daysLeft = h.end_date ? dayjs(h.end_date).startOf('day').diff(now.startOf('day'), 'day') : null;
                          return (
                            <tr key={h.id} className="hover:bg-slate-50 transition-colors group">
                              <td className="px-4 py-3 truncate text-xs text-slate-700">{h.equipment_code || h.equipment_desc || '—'}</td>
                              <td className="px-4 py-3 truncate text-[11px] text-slate-400">{h.vendor_name || '—'}</td>
                              <td className="px-4 py-3 text-right text-[11px]">
                                {daysLeft == null ? <span className="text-slate-400">—</span>
                                  : daysLeft < 0 ? <span className="font-semibold text-red-600">Overdue</span>
                                  : daysLeft <= 7 ? <span className="font-semibold text-amber-600">{daysLeft}d left</span>
                                  : <span className="text-slate-500">{ddmmyyyy(h.end_date)}</span>}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
                <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3">
                  <span className="text-[11px] text-slate-400">Monthly hire cost</span>
                  <span className="text-xs font-semibold text-teal-600">{inr(monthlyHireCost)}</span>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
