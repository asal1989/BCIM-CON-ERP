// src/pages/plant/PlantDashboard.jsx — Fleet status dashboard
import React from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Truck, CheckCircle, Clock, Wrench, CircleSlash, AlertTriangle, FileWarning,
  Layers, ArrowLeftRight, Briefcase, Gauge, Fuel, UserCheck, ShieldCheck,
  Calculator, FileBarChart, ArrowRight, ChevronRight,
} from 'lucide-react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, CartesianGrid,
  PieChart, Pie, Cell,
} from 'recharts';
import { plantAPI } from '../../api/client';
import { PageShell, inr } from './_shared';

const PIE_COLORS = ['#0d9488', '#f59e0b', '#3b82f6', '#ef4444', '#8b5cf6'];

const TONES = {
  teal:  { bg: 'bg-teal-50',   text: 'text-teal-600',   bar: 'bg-teal-500' },
  green: { bg: 'bg-green-50',  text: 'text-green-600',  bar: 'bg-green-500' },
  amber: { bg: 'bg-amber-50',  text: 'text-amber-600',  bar: 'bg-amber-500' },
  blue:  { bg: 'bg-blue-50',   text: 'text-blue-600',   bar: 'bg-blue-500' },
  red:   { bg: 'bg-red-50',    text: 'text-red-600',    bar: 'bg-red-500' },
};

function Kpi({ label, value, icon: Icon, tone = 'teal', sub, to }) {
  const t = TONES[tone];
  const inner = (
    <div className="group relative overflow-hidden rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <span className={`absolute inset-y-0 left-0 w-1 ${t.bar}`} />
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-gray-500">{label}</span>
        <span className={`rounded-lg p-1.5 ${t.bg}`}><Icon className={`h-4 w-4 ${t.text}`} /></span>
      </div>
      <div className="mt-2 text-2xl font-bold text-gray-800">{value}</div>
      {sub && <div className="mt-0.5 text-[11px] text-gray-400">{sub}</div>}
    </div>
  );
  return to ? <Link to={to}>{inner}</Link> : inner;
}

function Panel({ title, action, actionTo, children }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700">{title}</h3>
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

export default function PlantDashboard() {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['pm-dashboard'],
    queryFn: () => plantAPI.dashboard().then((r) => r.data?.data).catch(() => null),
  });

  const s = data?.summary || {};
  const total = Number(s.total_equipment || 0);
  const pct = (n) => (total > 0 ? `${Math.round((Number(n || 0) / total) * 100)}% of fleet` : undefined);

  const cards = [
    { label: 'Total Equipment', value: s.total_equipment ?? 0, icon: Truck,       tone: 'teal',  to: '/plant/equipment' },
    { label: 'Active',          value: s.active ?? 0,          icon: CheckCircle, tone: 'green', sub: pct(s.active),      to: '/plant/equipment' },
    { label: 'Idle',            value: s.idle ?? 0,             icon: Clock,       tone: 'amber', sub: pct(s.idle),        to: '/plant/equipment' },
    { label: 'Maintenance',     value: s.maintenance ?? 0,      icon: Wrench,      tone: 'blue',  sub: pct(s.maintenance), to: '/plant/maintenance' },
    { label: 'Disposed',        value: s.disposed ?? 0,         icon: CircleSlash, tone: 'red',   to: '/plant/transfers' },
  ];

  const alerts = [
    { label: 'Maintenance Due (7d)',       value: s.maintenance_due ?? 0, icon: Wrench,        tone: 'blue',  to: '/plant/maintenance' },
    { label: 'Hire-In Pending Returns',     value: s.hire_pending ?? 0,    icon: AlertTriangle, tone: 'amber', to: '/plant/hire' },
    { label: 'Docs Expiring (30d)',         value: s.expiring_docs ?? 0,   icon: FileWarning,   tone: 'red',   to: '/plant/compliance' },
  ];
  const hasAlerts = alerts.some((a) => Number(a.value) > 0);

  const util = (data?.utilisation || []).map((u) => ({
    name: u.code || u.name, Worked: Number(u.hours_worked || 0), Idle: Number(u.idle_hours || 0),
  }));
  const byType = (data?.by_type || []).map((t) => ({ name: t.type, value: Number(t.c || 0), cost: Number(t.v || 0) }));
  const totalTypeValue = byType.reduce((sum, t) => sum + t.cost, 0);

  return (
    <PageShell title="Fleet Dashboard" onRefresh={refetch}>
      {isLoading ? (
        <div className="py-20 text-center text-sm text-gray-400">Loading dashboard…</div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {cards.map((c) => <Kpi key={c.label} {...c} />)}
          </div>

          {hasAlerts && (
            <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3">
              <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-amber-700">
                <AlertTriangle className="h-3.5 w-3.5" /> Needs attention
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                {alerts.map((a) => (
                  <Link key={a.label} to={a.to}
                    className="flex items-center justify-between rounded-lg border border-gray-200 bg-white px-3 py-2 transition hover:border-teal-300 hover:shadow-sm">
                    <div className="flex items-center gap-2">
                      <span className={`rounded p-1 ${TONES[a.tone].bg}`}><a.icon className={`h-3.5 w-3.5 ${TONES[a.tone].text}`} /></span>
                      <span className="text-xs text-gray-600">{a.label}</span>
                    </div>
                    <span className="flex items-center gap-1 text-sm font-bold text-gray-800">
                      {a.value} <ArrowRight className="h-3 w-3 text-gray-300" />
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          )}

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

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Panel title="Utilisation — Hours Worked vs Idle" action="View report" actionTo="/plant/reports">
              {util.length === 0 ? <div className="py-16 text-center text-sm text-gray-400">No deployment data</div> : (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={util}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="Worked" fill="#0d9488" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="Idle" fill="#f59e0b" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </Panel>

            <Panel title="Fleet by Type (Own vs Hired)" action="View register" actionTo="/plant/equipment">
              {byType.length === 0 ? <div className="py-16 text-center text-sm text-gray-400">No equipment</div> : (
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                  <ResponsiveContainer width="100%" height={240} className="sm:flex-1">
                    <PieChart>
                      <Pie data={byType} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={90} paddingAngle={2}>
                        {byType.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                      </Pie>
                      <Tooltip formatter={(v, n, p) => [`${v} units · ${inr(p.payload.cost)}`, p.payload.name]} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="w-full shrink-0 space-y-1.5 sm:w-44">
                    {byType.map((t, i) => (
                      <div key={t.name} className="flex items-center justify-between text-xs">
                        <span className="flex items-center gap-1.5 text-gray-600">
                          <span className="h-2 w-2 rounded-full" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                          {t.name}
                        </span>
                        <span className="font-semibold text-gray-700">{t.value}</span>
                      </div>
                    ))}
                    <div className="mt-2 flex items-center justify-between border-t border-gray-100 pt-1.5 text-xs">
                      <span className="text-gray-400">Total value</span>
                      <span className="font-semibold text-gray-700">{inr(totalTypeValue)}</span>
                    </div>
                  </div>
                </div>
              )}
            </Panel>
          </div>
        </>
      )}
    </PageShell>
  );
}
