import React, { useEffect, useState } from 'react';
import { assetMgmtAPI } from '../../api/client';
import { Link } from 'react-router-dom';
import {
  ResponsiveContainer, PieChart, Pie, Cell, Tooltip,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from 'recharts';
import {
  Package, Wrench, AlertTriangle, Activity, FileText,
  Clock, CheckCircle, RefreshCw, ChevronRight, Zap,
  TrendingDown, Shield, ArrowRightLeft,
} from 'lucide-react';
import {
  StatusBadge, EmptyState, fmtINR, fmtDate, daysFrom,
} from '../../components/ui';
import { PageHeader, KpiCard as ThemeKpiCard, Theme } from '../../theme';

const PIE_COLORS = ['#4F46E5','#10B981','#F59E0B','#EF4444','#8B5CF6','#06B6D4','#64748B'];

const QUICK_LINKS = [
  { to: '/assets',              icon: Package,        label: 'Asset Master',     color: 'bg-indigo-50 text-indigo-600' },
  { to: '/assets/allocation',   icon: ArrowRightLeft, label: 'Issue Asset',      color: 'bg-emerald-50 text-emerald-600' },
  { to: '/assets/work-orders',  icon: Wrench,         label: 'Work Orders',      color: 'bg-amber-50 text-amber-600' },
  { to: '/assets/alerts',       icon: AlertTriangle,  label: 'Alerts',           color: 'bg-red-50 text-red-600' },
  { to: '/assets/depreciation', icon: TrendingDown,   label: 'Depreciation',     color: 'bg-purple-50 text-purple-600' },
  { to: '/assets/reports',      icon: Activity,       label: 'Reports',          color: 'bg-blue-50 text-blue-600' },
];

// ── helpers ──────────────────────────────────────────────────────────────────
function SectionTitle({ icon: Icon, title, subtitle, action }) {
  return (
    <div className="flex items-center justify-between mb-4">
      <div className="flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-xl bg-indigo-50 flex items-center justify-center">
          <Icon className="w-4 h-4 text-indigo-600" />
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

export default function AssetDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try { setData((await assetMgmtAPI.dashboard()).data?.data); } catch {}
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  if (loading) return (
    <div style={{ background: Theme.pageBg, minHeight: '100vh' }}>
      <div className="p-5 md:p-6 max-w-[1400px] mx-auto">
        <div className="h-8 w-48 bg-slate-200 animate-pulse rounded mb-2" />
        <div className="h-4 w-72 bg-slate-100 animate-pulse rounded mb-8" />
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
          {[...Array(6)].map((_,i) => <div key={i} className="h-28 bg-slate-100 animate-pulse rounded-xl" />)}
        </div>
      </div>
    </div>
  );

  if (!data) return (
    <div style={{ background: Theme.pageBg, minHeight: '100vh' }}>
      <div className="p-8 text-center">
        <AlertTriangle className="w-10 h-10 text-red-400 mx-auto mb-3" />
        <p className="text-slate-600">Failed to load dashboard data</p>
        <button onClick={load} className="btn-primary mt-4 text-xs">Retry</button>
      </div>
    </div>
  );

  const { summary, by_category, recent_assets, upcoming_maintenance } = data;

  // Status distribution for donut chart
  const statusData = [
    { name: 'Available',    value: summary.available   || 0 },
    { name: 'Assigned',     value: summary.assigned    || 0 },
    { name: 'Maintenance',  value: summary.maintenance || 0 },
    { name: 'Other',        value: Math.max(0, (summary.total_assets||0) - (summary.available||0) - (summary.assigned||0) - (summary.maintenance||0)) },
  ].filter(d => d.value > 0);

  // Category bar data
  const catData = (by_category || []).slice(0, 8).map(c => ({
    name: c.category?.split(' ').slice(0, 2).join(' ') || 'Other',
    count: parseInt(c.c),
    value: parseFloat(c.total_value) || 0,
  }));

  const maintenanceDue = upcoming_maintenance || [];
  const overdueCount = maintenanceDue.filter(a => {
    const d = daysFrom(a.next_service_date);
    return d !== null && d <= 0;
  }).length;

  return (
    <div style={{ background: Theme.pageBg, minHeight: '100vh' }}>

      <PageHeader
        title="Asset Dashboard"
        subtitle="Fleet, Plant, Equipment & IT Assets — real-time overview"
        breadcrumbs={[{ label: 'Assets & IT' }, { label: 'Dashboard' }]}
        actions={
          <>
            <button onClick={load}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-lg transition shadow-sm"
              style={{ background: '#fff', color: Theme.navyDark }}>
              <RefreshCw className="w-3.5 h-3.5" /> Refresh
            </button>
            <Link to="/assets"
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg transition"
              style={{ background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.25)', color: '#fff' }}>
              <Package className="w-3.5 h-3.5" /> View All Assets
            </Link>
          </>
        }
      />

      <div className="p-5 md:p-6 max-w-[1400px] mx-auto space-y-5">

        {/* ── KPI Row ── */}
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
          <ThemeKpiCard icon={Package}       label="Total Assets"     value={summary.total_assets || 0}     color="indigo"  sub={`${fmtINR(summary.total_value)} value`} />
          <ThemeKpiCard icon={CheckCircle}   label="Available"        value={summary.available || 0}        color="emerald" sub="Ready for use" />
          <ThemeKpiCard icon={Activity}      label="Assigned"         value={summary.assigned || 0}          color="blue"    sub="Deployed on site" />
          <ThemeKpiCard icon={Wrench}        label="Maintenance"      value={summary.maintenance || 0}       color="amber"   sub="In service" />
          <ThemeKpiCard icon={Clock}         label="Open Work Orders" value={summary.open_work_orders || 0}  color="orange"  sub="Pending" />
          <ThemeKpiCard icon={AlertTriangle} label="Expiring Docs"    value={summary.expiring_docs || 0}     color="red"     sub="Within 30 days" />
        </div>

        {/* ── Alert banners ── */}
        {(maintenanceDue.length > 0 || (summary.expiring_docs || 0) > 0) && (
          <div className="flex flex-col gap-2">
            {maintenanceDue.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-center gap-3">
                <Wrench size={15} className="text-amber-600 flex-shrink-0" />
                <span className="text-sm font-medium text-amber-800">
                  {maintenanceDue.length} asset{maintenanceDue.length !== 1 ? 's' : ''} due for maintenance within 15 days
                  {overdueCount > 0 ? ` — ${overdueCount} overdue` : ''}
                </span>
                <Link to="/assets/maintenance" className="ml-auto text-xs font-semibold text-amber-700 underline whitespace-nowrap">View →</Link>
              </div>
            )}
            {(summary.expiring_docs || 0) > 0 && (
              <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 flex items-center gap-3">
                <FileText size={15} className="text-blue-600 flex-shrink-0" />
                <span className="text-sm font-medium text-blue-800">
                  {summary.expiring_docs} document{summary.expiring_docs > 1 ? 's' : ''} expiring within 30 days
                </span>
                <Link to="/assets/alerts" className="ml-auto text-xs font-semibold text-blue-700 underline whitespace-nowrap">Review →</Link>
              </div>
            )}
          </div>
        )}

        {/* ── Charts Row ── */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">

          {/* Donut — Status */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
            <SectionTitle icon={Activity} title="Asset Status" subtitle="Current utilization" />
            {statusData.length > 0 ? (
              <>
                <ResponsiveContainer width="100%" height={180}>
                  <PieChart>
                    <Pie data={statusData} cx="50%" cy="50%" innerRadius={50} outerRadius={80}
                      paddingAngle={3} dataKey="value">
                      {statusData.map((_,i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={(v) => [`${v} assets`, '']} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="grid grid-cols-2 gap-2 mt-2">
                  {statusData.map((d,i) => (
                    <div key={d.name} className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{background: PIE_COLORS[i % PIE_COLORS.length]}} />
                      <span className="text-xs text-slate-600 truncate">{d.name}</span>
                      <span className="text-xs font-bold text-slate-800 ml-auto">{d.value}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : <EmptyState title="No status data" />}
          </div>

          {/* Bar — By Category */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm xl:col-span-2">
            <SectionTitle icon={Package} title="By Category" subtitle="Asset count per category" />
            {catData.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={catData} margin={{ top: 5, right: 10, left: -20, bottom: 40 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#94A3B8' }} angle={-35} textAnchor="end" interval={0} />
                  <YAxis tick={{ fontSize: 10, fill: '#94A3B8' }} />
                  <Tooltip formatter={(v) => [`${v} assets`, 'Count']} />
                  <Bar dataKey="count" radius={[4,4,0,0]}>
                    {catData.map((_,i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : <EmptyState title="No category data" description="Add asset categories to see breakdown" />}
          </div>
        </div>

        {/* ── Upcoming Maintenance + Recent Assets ── */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">

          {/* Upcoming maintenance */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
            <SectionTitle icon={Wrench} title="Upcoming Maintenance" subtitle="Due within 15 days"
              action={<Link to="/assets/maintenance" className="flex items-center gap-1 text-[10px] font-semibold text-indigo-600 hover:text-indigo-700">View All <ChevronRight className="w-3 h-3" /></Link>}
            />
            {maintenanceDue.length === 0 ? (
              <div className="py-8 text-center">
                <CheckCircle className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
                <p className="text-xs text-slate-500">No maintenance due in 15 days</p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {maintenanceDue.map((a, i) => {
                  const days = daysFrom(a.next_service_date);
                  const urgent = days !== null && days <= 3;
                  return (
                    <div key={i} className={`flex items-center justify-between p-3 rounded-xl border ${urgent ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200'}`}>
                      <div className="min-w-0">
                        <span className="font-mono text-xs text-indigo-600 font-semibold">{a.asset_code}</span>
                        <p className="text-xs text-slate-700 truncate">{a.asset_name}</p>
                      </div>
                      <div className="text-right flex-shrink-0 ml-3">
                        <span className={`text-sm font-bold ${urgent ? 'text-red-600' : 'text-amber-700'}`}>
                          {days === null ? '—' : days <= 0 ? 'Overdue' : `${days}d`}
                        </span>
                        <p className="text-[10px] text-slate-400">{fmtDate(a.next_service_date)}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Recent assets */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-5 pb-0">
              <SectionTitle icon={Package} title="Recently Added" subtitle="Latest asset registrations"
                action={<Link to="/assets" className="flex items-center gap-1 text-[10px] font-semibold text-indigo-600 hover:text-indigo-700">View All <ChevronRight className="w-3 h-3" /></Link>}
              />
            </div>
            {(recent_assets || []).length === 0 ? (
              <div className="py-8">
                <EmptyState title="No assets registered" description="Add assets to your register" />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-y border-slate-100">
                      {['Code', 'Name', 'Status', 'Value'].map(h => (
                        <th key={h} className="px-4 py-2.5 text-[10px] font-bold uppercase tracking-widest text-slate-400 text-left">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {recent_assets.map((a, i) => (
                      <tr key={i} className="hover:bg-slate-50 transition-colors group">
                        <td className="px-4 py-3">
                          <span className="font-mono text-xs text-indigo-600 font-semibold">{a.asset_code}</span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-xs text-slate-700 font-medium truncate max-w-[140px] block">{a.asset_name}</span>
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge status={a.status} />
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-xs font-semibold text-slate-800">{a.purchase_value ? fmtINR(a.purchase_value) : '—'}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* ── Quick Access ── */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <SectionTitle icon={Zap} title="Quick Access" subtitle="Navigate to key asset functions" />
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
            {QUICK_LINKS.map(l => (
              <Link key={l.to} to={l.to}
                className="flex flex-col items-center gap-2 p-4 rounded-xl border border-slate-100 hover:border-indigo-200 hover:shadow-sm transition-all group">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${l.color} group-hover:scale-110 transition-transform`}>
                  <l.icon className="w-5 h-5" />
                </div>
                <span className="text-xs font-medium text-slate-600 group-hover:text-indigo-700 text-center leading-tight">{l.label}</span>
              </Link>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}
