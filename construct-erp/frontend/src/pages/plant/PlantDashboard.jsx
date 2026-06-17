// src/pages/plant/PlantDashboard.jsx — Fleet status dashboard
import React from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import {
  Truck, CheckCircle, Clock, Wrench, FileWarning, Briefcase,
  Layers, ArrowLeftRight, Gauge, Fuel, UserCheck, ShieldCheck,
  Calculator, FileBarChart, ChevronRight, BarChart3, PieChart as PieChartIcon,
} from 'lucide-react';
import {
  ResponsiveContainer, PieChart, Pie, Cell, Tooltip,
} from 'recharts';
import { plantAPI } from '../../api/client';
import { PageShell, inr, ddmmyyyy } from './_shared';

const OWNERSHIP_COLORS = { own: '#0d9488', hired: '#8b5cf6' };
const OWNERSHIP_LABEL = { own: 'Own', hired: 'Hired-in' };

const KPI_TONE = {
  teal:   { text: 'text-teal-600',   dot: 'bg-teal-600' },
  green:  { text: 'text-green-600',  dot: 'bg-green-600' },
  amber:  { text: 'text-amber-600',  dot: 'bg-amber-600' },
  blue:   { text: 'text-blue-600',   dot: 'bg-blue-600' },
  violet: { text: 'text-violet-600', dot: 'bg-violet-600' },
  red:    { text: 'text-red-600',    dot: 'bg-red-600' },
};

function Kpi({ label, value, sub, tone = 'teal', icon: Icon, to }) {
  const t = KPI_TONE[tone];
  const inner = (
    <div className="rounded-xl bg-gray-50 p-3.5 transition hover:bg-gray-100">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-[11px] text-gray-500">{label}</span>
        {Icon && <Icon className="h-3.5 w-3.5 text-gray-400" />}
      </div>
      <div className={`text-2xl font-semibold ${t.text}`}>{value}</div>
      {sub && (
        <div className={`mt-1 flex items-center gap-1.5 text-[11px] ${t.text}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${t.dot}`} />{sub}
        </div>
      )}
    </div>
  );
  return to ? <Link to={to}>{inner}</Link> : inner;
}

function Panel({ title, icon: Icon, iconColor, action, actionTo, children }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold text-gray-700">
          {Icon && <Icon className="h-3.5 w-3.5" style={{ color: iconColor || '#0d9488' }} />}
          {title}
        </h3>
        {action && actionTo && (
          <Link to={actionTo} className="flex items-center gap-1 text-xs font-medium text-teal-600 hover:text-teal-700">
            {action} <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        )}
      </div>
      {children}
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
    { label: 'Total Fleet',         value: s.total_equipment ?? 0,   icon: Truck,       tone: 'teal',   sub: 'Own + hired',    to: '/plant/equipment' },
    { label: 'Active',              value: s.active ?? 0,            icon: CheckCircle, tone: 'green',  sub: 'On site',        to: '/plant/equipment' },
    { label: 'Idle',                value: s.idle ?? 0,              icon: Clock,       tone: 'amber',  sub: 'Standby',        to: '/plant/equipment' },
    { label: 'Under Maintenance',   value: s.maintenance ?? 0,       icon: Wrench,      tone: 'blue',   sub: 'In repair',      to: '/plant/maintenance' },
    { label: 'Hired-in Active',     value: s.hire_pending ?? 0,      icon: Briefcase,   tone: 'violet', sub: 'From vendors',   to: '/plant/hire' },
    { label: 'Docs Expiring',       value: s.expiring_docs ?? 0,     icon: FileWarning, tone: 'red',    sub: 'Within 30 days', to: '/plant/compliance' },
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
    <PageShell title="Fleet Dashboard" onRefresh={refetchAll}
      extra={(
        <>
          <span className="rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs text-gray-500">{now.format('MMMM YYYY')}</span>
          <Link to="/plant/equipment" className="rounded-full border border-gray-200 px-2.5 py-1 text-xs font-medium text-teal-600 hover:bg-teal-50">
            Equipment list →
          </Link>
        </>
      )}>
      {dash.isLoading ? (
        <div className="py-20 text-center text-sm text-gray-400">Loading dashboard…</div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {cards.map((c) => <Kpi key={c.label} {...c} />)}
          </div>

          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-400">Quick Access</h3>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {QUICK_LINKS.map((q) => (
                <Link key={q.to} to={q.to}
                  className="group flex flex-col gap-2 rounded-xl border border-gray-200 bg-white p-3.5 shadow-sm transition hover:-translate-y-0.5 hover:border-teal-300 hover:shadow-md">
                  <span className="inline-flex w-fit rounded-lg bg-teal-50 p-2 transition group-hover:bg-teal-100">
                    <q.icon className="h-4 w-4 text-teal-600" />
                  </span>
                  <div>
                    <div className="text-xs font-semibold text-gray-800">{q.label}</div>
                    <div className="text-[11px] text-gray-400">{q.desc}</div>
                  </div>
                </Link>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <Panel title="Equipment Utilisation (Hours Worked vs Idle)" icon={BarChart3} action="View report" actionTo="/plant/reports">
                {util.length === 0 ? <div className="py-16 text-center text-sm text-gray-400">No deployment data</div> : (
                  <div className="space-y-2.5">
                    {util.map((u) => {
                      const pct = Math.round((u.worked / (u.worked + u.idle)) * 100);
                      const barColor = pct >= 65 ? 'bg-teal-500' : pct >= 40 ? 'bg-amber-500' : 'bg-red-500';
                      return (
                        <div key={u.code || u.name} className="flex items-center gap-2.5">
                          <div className="w-20 shrink-0 truncate text-[11px] text-gray-500" title={u.name}>{u.code || u.name}</div>
                          <div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-100">
                            <div className={`h-full rounded-full ${barColor}`} style={{ width: `${pct}%` }} />
                          </div>
                          <div className="w-12 shrink-0 text-right text-[11px] text-gray-500">{u.worked.toFixed(0)}h</div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </Panel>
            </div>

            <div className="flex flex-col gap-4">
              <Panel title="Fleet Composition" icon={PieChartIcon} action="View register" actionTo="/plant/equipment">
                {byType.length === 0 ? <div className="py-10 text-center text-sm text-gray-400">No equipment</div> : (
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
                          <span className="flex items-center gap-1.5 text-gray-600">
                            <span className="h-2 w-2 rounded-full" style={{ background: OWNERSHIP_COLORS[t.key] || '#94a3b8' }} />
                            {t.name}
                          </span>
                          <span className="font-semibold text-gray-700">{t.value}</span>
                        </div>
                      ))}
                      <div className="flex items-center justify-between border-t border-gray-100 pt-1.5 text-xs">
                        <span className="text-gray-400">Total value</span>
                        <span className="font-semibold text-gray-700">{inr(totalTypeValue)}</span>
                      </div>
                    </div>
                  </div>
                )}
              </Panel>

              <Panel title="Fuel This Month" icon={Fuel} action="View log" actionTo="/plant/fuel">
                {fuelTypes.length === 0 ? <div className="py-6 text-center text-sm text-gray-400">No fuel issued this month</div> : (
                  <div>
                    {fuelTypes.map((f) => (
                      <div key={f.name} className="flex items-center justify-between border-b border-gray-100 py-2 last:border-0">
                        <div>
                          <div className="text-xs text-gray-700">{f.name}</div>
                          <div className="text-[11px] text-gray-400">{f.qty.toLocaleString('en-IN')} L consumed</div>
                        </div>
                        <div className="text-xs font-semibold text-gray-700">{inr(f.cost)}</div>
                      </div>
                    ))}
                    <div className="mt-2 flex items-center justify-between border-t border-gray-100 pt-2">
                      <div>
                        <div className="text-xs text-gray-500">Total cost</div>
                        <div className="text-[11px] text-gray-400">{fuelTotalQty.toLocaleString('en-IN')} L total</div>
                      </div>
                      <div className="text-sm font-semibold text-teal-600">{inr(fuelTotalCost)}</div>
                    </div>
                  </div>
                )}
              </Panel>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <Panel title="Document Expiry Alerts" icon={FileWarning} iconColor="#dc2626" action="View all" actionTo="/plant/compliance">
              {expiryRows.length === 0 ? <div className="py-10 text-center text-sm text-gray-400">No documents expiring soon</div> : (
                <div>
                  {expiryRows.map((d) => (
                    <div key={d.id} className="flex items-center gap-2.5 border-b border-gray-100 py-2 last:border-0">
                      <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${d.expiry_status === 'expired' ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-600'}`}>
                        <FileWarning className="h-3.5 w-3.5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-xs font-medium text-gray-800">{d.equipment_code} · {d.equipment_name}</div>
                        <div className="truncate text-[11px] text-gray-400">{d.document_type || 'Document'}</div>
                      </div>
                      <span className={`shrink-0 text-[11px] font-semibold ${d.expiry_status === 'expired' ? 'text-red-600' : 'text-amber-600'}`}>
                        {d.expiry_status === 'expired' ? 'Expired' : `${d.days_left}d`}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </Panel>

            <Panel title="Maintenance Due" icon={Wrench} iconColor="#2563eb" action="View all" actionTo="/plant/maintenance">
              {maintRows.length === 0 ? <div className="py-10 text-center text-sm text-gray-400">Nothing due in next 30 days</div> : (
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="pb-2 text-[11px] font-medium text-gray-400">Equipment</th>
                      <th className="pb-2 text-[11px] font-medium text-gray-400">Type</th>
                      <th className="pb-2 text-right text-[11px] font-medium text-gray-400">Due</th>
                    </tr>
                  </thead>
                  <tbody>
                    {maintRows.map((m) => (
                      <tr key={m.id} className="border-b border-gray-50 last:border-0">
                        <td className="truncate py-2 text-xs text-gray-700">{m.equipment_code} {m.equipment_name}</td>
                        <td className="py-2">
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${String(m.maintenance_type).toLowerCase() === 'breakdown' ? 'bg-red-50 text-red-600' : 'bg-blue-50 text-blue-600'}`}>
                            {m.maintenance_type}
                          </span>
                        </td>
                        <td className={`py-2 text-right text-[11px] ${dueTone(m.days_left)}`}>
                          {Number(m.days_left) < 0 ? 'Overdue' : `${m.days_left}d`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Panel>

            <Panel title="Hire-in Status" icon={Briefcase} iconColor="#7c3aed" action="View all" actionTo="/plant/hire">
              {hireRows.length === 0 ? <div className="py-10 text-center text-sm text-gray-400">No active hire-in orders</div> : (
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="pb-2 text-[11px] font-medium text-gray-400">Equipment</th>
                      <th className="pb-2 text-[11px] font-medium text-gray-400">Vendor</th>
                      <th className="pb-2 text-right text-[11px] font-medium text-gray-400">Return</th>
                    </tr>
                  </thead>
                  <tbody>
                    {hireRows.map((h) => {
                      const daysLeft = h.end_date ? dayjs(h.end_date).startOf('day').diff(now.startOf('day'), 'day') : null;
                      return (
                        <tr key={h.id} className="border-b border-gray-50 last:border-0">
                          <td className="truncate py-2 text-xs text-gray-700">{h.equipment_code || h.equipment_desc || '—'}</td>
                          <td className="truncate py-2 text-[11px] text-gray-400">{h.vendor_name || '—'}</td>
                          <td className="py-2 text-right text-[11px]">
                            {daysLeft == null ? <span className="text-gray-400">—</span>
                              : daysLeft < 0 ? <span className="font-semibold text-red-600">Overdue</span>
                              : daysLeft <= 7 ? <span className="font-semibold text-amber-600">{daysLeft}d left</span>
                              : <span className="text-gray-500">{ddmmyyyy(h.end_date)}</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
              <div className="mt-2 flex items-center justify-between border-t border-gray-100 pt-2">
                <span className="text-[11px] text-gray-400">Monthly hire cost</span>
                <span className="text-xs font-semibold text-teal-600">{inr(monthlyHireCost)}</span>
              </div>
            </Panel>
          </div>
        </>
      )}
    </PageShell>
  );
}
