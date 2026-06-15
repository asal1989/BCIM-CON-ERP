// Asset Reports & Dashboard — full analytics: status, category, financial, utilisation, expiry
import React, { useEffect, useState, useMemo } from 'react';
import { assetAPI, assetMgmtAPI } from '../../api/client';
import {
  BarChart3, Download, RefreshCw, Package, TrendingUp, TrendingDown,
  IndianRupee, Wrench, FileText, Calendar, Search, Activity, PieChart
} from 'lucide-react';
import dayjs from 'dayjs';

const fmt  = (v) => `₹${Number(v||0).toLocaleString('en-IN',{maximumFractionDigits:0})}`;
const fmtN = (v) =>  Number(v||0).toLocaleString('en-IN');

const STATUS_LABELS = {
  available: 'Available', assigned: 'Assigned', maintenance: 'Maintenance',
  breakdown: 'Breakdown', disposed: 'Disposed', in_use: 'In Use',
  retired: 'Retired', lost: 'Lost', transferred: 'Transferred',
};
const STATUS_COLORS = [
  '#22c55e','#3b82f6','#f59e0b','#ef4444','#94a3b8','#6366f1','#8b5cf6','#ec4899','#06b6d4'
];

function SimpleBar({ data, valueKey = 'count', labelKey = 'label', maxColor = '#3b82f6' }) {
  const max = Math.max(...data.map(d => d[valueKey] || 0), 1);
  return (
    <div className="space-y-2">
      {data.map((d, i) => {
        const pct = (d[valueKey] / max) * 100;
        return (
          <div key={i}>
            <div className="flex justify-between text-xs text-gray-600 mb-1">
              <span className="truncate max-w-[160px]">{d[labelKey]}</span>
              <span className="font-medium ml-2 flex-shrink-0">
                {typeof d[valueKey] === 'number' && d[valueKey] > 1000 ? fmt(d[valueKey]) : fmtN(d[valueKey])}
              </span>
            </div>
            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: maxColor }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function DonutStat({ label, value, total, color }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div className="flex items-center gap-3 p-3 rounded-lg border hover:bg-gray-50">
      <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
      <div className="flex-1 min-w-0">
        <div className="text-xs text-gray-500 truncate">{label}</div>
        <div className="text-sm font-bold text-gray-800">{value}</div>
      </div>
      <div className="text-xs text-gray-400 flex-shrink-0">{pct}%</div>
    </div>
  );
}

const REPORTS = [
  { key: 'overview',     label: 'Overview',         icon: BarChart3   },
  { key: 'status',       label: 'Status Report',    icon: Activity    },
  { key: 'category',     label: 'By Category',      icon: Package     },
  { key: 'financial',    label: 'Financial',        icon: IndianRupee },
  { key: 'utilisation',  label: 'Utilisation',      icon: TrendingUp  },
  { key: 'expiry',       label: 'Expiry Report',    icon: Calendar    },
  { key: 'register',     label: 'Asset Register',   icon: FileText    },
];

export default function AssetReportsDashboardPage() {
  const [assets, setAssets]     = useState([]);
  const [utilData, setUtilData] = useState([]);
  const [expiryData, setExpiryData] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [report, setReport]     = useState('overview');
  const [search, setSearch]     = useState('');

  useEffect(() => {
    setLoading(true);
    Promise.all([
      assetAPI.list(),
      assetMgmtAPI.reportUtilisation(),
      assetMgmtAPI.reportExpiry(),
    ]).then(([a, u, e]) => {
      setAssets(a.data?.data || []);
      setUtilData(u.data?.data || []);
      setExpiryData(e.data?.data || []);
    }).finally(() => setLoading(false));
  }, []);

  const active = useMemo(() => assets.filter(a => a.status !== 'disposed'), [assets]);

  // Status breakdown
  const statusBreakdown = useMemo(() => {
    const m = {};
    active.forEach(a => { m[a.status] = (m[a.status] || 0) + 1; });
    return Object.entries(m).map(([s, c]) => ({ label: STATUS_LABELS[s] || s, count: c, status: s }))
      .sort((a, b) => b.count - a.count);
  }, [active]);

  // Category breakdown
  const categoryBreakdown = useMemo(() => {
    const m = {};
    active.forEach(a => {
      const k = a.category_name || 'Uncategorised';
      if (!m[k]) m[k] = { count: 0, value: 0 };
      m[k].count++;
      m[k].value += parseFloat(a.purchase_value || 0);
    });
    return Object.entries(m).map(([label, v]) => ({ label, ...v })).sort((a, b) => b.count - a.count);
  }, [active]);

  // Financial summary
  const financial = useMemo(() => {
    const totalValue  = active.reduce((s, a) => s + parseFloat(a.purchase_value || 0), 0);
    const avgValue    = active.length ? totalValue / active.length : 0;
    const byType = {};
    active.forEach(a => {
      const t = a.asset_type || 'Other';
      byType[t] = (byType[t] || 0) + parseFloat(a.purchase_value || 0);
    });
    const topTypes = Object.entries(byType).sort((a, b) => b[1] - a[1]).slice(0, 6)
      .map(([label, value]) => ({ label, value }));
    return { totalValue, avgValue, topTypes };
  }, [active]);

  // Expiry stats
  const expiryStats = useMemo(() => ({
    expired:  expiryData.filter(a => [a.insurance_days, a.warranty_days, a.amc_days].some(d => d !== null && d < 0)).length,
    within30: expiryData.filter(a => [a.insurance_days, a.warranty_days, a.amc_days].some(d => d !== null && d >= 0 && d <= 30)).length,
    within60: expiryData.filter(a => [a.insurance_days, a.warranty_days, a.amc_days].some(d => d !== null && d > 30 && d <= 60)).length,
  }), [expiryData]);

  // Filter for register
  const registerFiltered = useMemo(() => active.filter(a => {
    if (!search) return true;
    const q = search.toLowerCase();
    return [a.asset_code, a.asset_name, a.asset_type, a.category_name, a.status, a.current_project_name]
      .some(v => v?.toLowerCase().includes(q));
  }), [active, search]);

  const exportCSV = () => {
    const rows = [
      ['Code','Name','Category','Type','Status','Location','Purchase Value','Purchase Date','Warranty Expiry','Insurance Expiry'],
      ...registerFiltered.map(a => [
        a.asset_code, a.asset_name, a.category_name||'', a.asset_type, a.status,
        a.current_project_name||'Central Yard', a.purchase_value||0,
        a.purchase_date||'', a.warranty_expiry||'', a.insurance_expiry||''
      ])
    ];
    const csv  = rows.map(r => r.map(v => `"${v}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a'); a.href = url; a.download = 'asset-register.csv'; a.click();
  };

  if (loading) return (
    <div className="flex items-center justify-center h-64 text-gray-400">
      <RefreshCw className="w-6 h-6 animate-spin mr-2" />Loading reports…
    </div>
  );

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-blue-500" /> Asset Reports & Analytics
          </h1>
          <p className="text-sm text-gray-500">Status, financials, utilisation, expiry & full register</p>
        </div>
        <button onClick={exportCSV}
          className="flex items-center gap-2 px-4 py-2 bg-white border rounded-lg text-sm hover:bg-gray-50">
          <Download className="w-4 h-4" /> Export Register
        </button>
      </div>

      {/* Report Tabs */}
      <div className="flex gap-1 flex-wrap bg-gray-100 p-1 rounded-xl mb-6">
        {REPORTS.map(r => {
          const Icon = r.icon;
          return (
            <button key={r.key} onClick={() => setReport(r.key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors
                ${report === r.key ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-600 hover:text-gray-800'}`}>
              <Icon className="w-3.5 h-3.5" />{r.label}
            </button>
          );
        })}
      </div>

      {/* ── OVERVIEW ── */}
      {report === 'overview' && (
        <div className="space-y-6">
          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label:'Total Assets', value: fmtN(active.length), sub:`${assets.filter(a=>a.status==='disposed').length} disposed`, icon: Package, color:'text-blue-600' },
              { label:'Gross Asset Value', value: fmt(financial.totalValue), sub:`Avg ${fmt(financial.avgValue)}`, icon: IndianRupee, color:'text-green-600' },
              { label:'Available Now', value: fmtN(statusBreakdown.find(s=>s.status==='available')?.count||0), sub:'ready for deployment', icon: Activity, color:'text-green-500' },
              { label:'Expiry Alerts', value: fmtN(expiryStats.expired + expiryStats.within30), sub:`${expiryStats.expired} expired, ${expiryStats.within30} in 30d`, icon: Calendar, color:'text-red-500' },
            ].map(c => {
              const Icon = c.icon;
              return (
                <div key={c.label} className="bg-white border rounded-xl p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-gray-500">{c.label}</span>
                    <Icon className={`w-4 h-4 ${c.color}`} />
                  </div>
                  <div className={`text-2xl font-bold ${c.color}`}>{c.value}</div>
                  <div className="text-xs text-gray-400 mt-1">{c.sub}</div>
                </div>
              );
            })}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white border rounded-xl p-5">
              <h3 className="text-sm font-semibold text-gray-700 mb-4">Status Breakdown</h3>
              <div className="space-y-2">
                {statusBreakdown.map((s, i) => (
                  <DonutStat key={s.status} label={s.label} value={s.count} total={active.length} color={STATUS_COLORS[i % STATUS_COLORS.length]} />
                ))}
              </div>
            </div>
            <div className="bg-white border rounded-xl p-5">
              <h3 className="text-sm font-semibold text-gray-700 mb-4">By Category</h3>
              <SimpleBar data={categoryBreakdown.slice(0,6)} valueKey="count" labelKey="label" maxColor="#6366f1" />
            </div>
            <div className="bg-white border rounded-xl p-5">
              <h3 className="text-sm font-semibold text-gray-700 mb-4">Value by Type</h3>
              <SimpleBar data={financial.topTypes} valueKey="value" labelKey="label" maxColor="#22c55e" />
            </div>
          </div>
        </div>
      )}

      {/* ── STATUS REPORT ── */}
      {report === 'status' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white border rounded-xl p-5">
            <h3 className="text-sm font-semibold text-gray-700 mb-4">Status Distribution</h3>
            <div className="space-y-3">
              {statusBreakdown.map((s, i) => {
                const pct = active.length ? Math.round((s.count / active.length)*100) : 0;
                return (
                  <div key={s.status}>
                    <div className="flex justify-between text-xs text-gray-600 mb-1">
                      <span>{s.label}</span>
                      <span className="font-medium">{s.count} ({pct}%)</span>
                    </div>
                    <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{ width:`${pct}%`, backgroundColor: STATUS_COLORS[i % STATUS_COLORS.length] }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="bg-white border rounded-xl p-5">
            <h3 className="text-sm font-semibold text-gray-700 mb-4">Assets Currently in Maintenance / Breakdown</h3>
            {active.filter(a => ['maintenance','breakdown'].includes(a.status)).length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-4">✓ No assets in maintenance</p>
            ) : (
              <div className="space-y-2">
                {active.filter(a => ['maintenance','breakdown'].includes(a.status)).map(a => (
                  <div key={a.id} className="flex items-center justify-between p-2 rounded-lg bg-yellow-50 text-xs">
                    <div>
                      <span className="font-mono font-medium text-blue-600">{a.asset_code}</span>
                      <span className="ml-2 text-gray-700">{a.asset_name}</span>
                    </div>
                    <span className={`px-2 py-0.5 rounded-full font-medium
                      ${a.status==='breakdown' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'}`}>
                      {a.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── CATEGORY REPORT ── */}
      {report === 'category' && (
        <div className="bg-white rounded-xl border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                {['Category','Assets','Total Value','Avg Value','Available','In Use / Maintenance'].map(h => (
                  <th key={h} className="text-left py-3 px-4 text-xs font-medium text-gray-500">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {categoryBreakdown.map((c, i) => {
                const catAssets = active.filter(a => (a.category_name||'Uncategorised') === c.label);
                const avail = catAssets.filter(a => a.status === 'available').length;
                const inUse = catAssets.filter(a => ['assigned','maintenance','breakdown'].includes(a.status)).length;
                return (
                  <tr key={i} className="border-b last:border-0 hover:bg-gray-50">
                    <td className="py-3 px-4 font-medium text-sm">{c.label}</td>
                    <td className="py-3 px-4 text-sm">{c.count}</td>
                    <td className="py-3 px-4 text-sm">{fmt(c.value)}</td>
                    <td className="py-3 px-4 text-sm">{c.count > 0 ? fmt(c.value / c.count) : '—'}</td>
                    <td className="py-3 px-4"><span className="text-xs px-2 py-0.5 bg-green-100 text-green-700 rounded-full">{avail}</span></td>
                    <td className="py-3 px-4"><span className="text-xs px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full">{inUse}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── FINANCIAL REPORT ── */}
      {report === 'financial' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label:'Total Asset Value',   value: fmt(financial.totalValue) },
              { label:'Average Asset Value', value: fmt(financial.avgValue)   },
              { label:'Assets Below ₹10K',  value: active.filter(a=>parseFloat(a.purchase_value||0)<10000).length },
              { label:'Assets Above ₹1L',   value: active.filter(a=>parseFloat(a.purchase_value||0)>=100000).length },
            ].map(c => (
              <div key={c.label} className="bg-white border rounded-xl p-4">
                <div className="text-xs text-gray-500 mb-1">{c.label}</div>
                <div className="text-xl font-bold text-gray-800">{c.value}</div>
              </div>
            ))}
          </div>
          <div className="bg-white border rounded-xl p-5">
            <h3 className="text-sm font-semibold text-gray-700 mb-4">Top 10 Highest Value Assets</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b">
                  <tr>
                    {['Code','Name','Type','Purchase Value','Purchase Date'].map(h => (
                      <th key={h} className="text-left py-2 px-3 text-xs font-medium text-gray-500">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[...active].sort((a,b)=>parseFloat(b.purchase_value||0)-parseFloat(a.purchase_value||0)).slice(0,10).map(a => (
                    <tr key={a.id} className="border-b last:border-0 hover:bg-gray-50">
                      <td className="py-2 px-3 font-mono text-xs text-blue-600">{a.asset_code}</td>
                      <td className="py-2 px-3 text-xs">{a.asset_name}</td>
                      <td className="py-2 px-3 text-xs text-gray-500">{a.asset_type}</td>
                      <td className="py-2 px-3 text-xs font-bold text-green-700">{fmt(a.purchase_value)}</td>
                      <td className="py-2 px-3 text-xs text-gray-400">{a.purchase_date||'—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── UTILISATION ── */}
      {report === 'utilisation' && (
        <div className="bg-white rounded-xl border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  {['Asset','Type','Current Location','Hours Logged','Fuel (L)','Maint. Cost','Status'].map(h => (
                    <th key={h} className="text-left py-3 px-4 text-xs font-medium text-gray-500">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {utilData.map((a, i) => (
                  <tr key={i} className="border-b last:border-0 hover:bg-gray-50">
                    <td className="py-3 px-4">
                      <div className="font-mono text-xs text-blue-600">{a.asset_code}</div>
                      <div className="text-xs text-gray-700">{a.asset_name}</div>
                    </td>
                    <td className="py-3 px-4 text-xs text-gray-500">{a.asset_type}</td>
                    <td className="py-3 px-4 text-xs">{a.project_name || 'Central Yard'}</td>
                    <td className="py-3 px-4 text-xs font-mono">{fmtN(a.logged_hours)} hrs</td>
                    <td className="py-3 px-4 text-xs font-mono">{fmtN(a.total_fuel_litres)} L</td>
                    <td className="py-3 px-4 text-xs">{a.maintenance_cost > 0 ? fmt(a.maintenance_cost) : '—'}</td>
                    <td className="py-3 px-4">
                      <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 capitalize">{a.status}</span>
                    </td>
                  </tr>
                ))}
                {utilData.length === 0 && <tr><td colSpan={7} className="text-center py-8 text-gray-400">No utilisation data</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── EXPIRY REPORT ── */}
      {report === 'expiry' && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-4 mb-2">
            {[
              { label:'Already Expired', value: expiryStats.expired, color:'text-red-600 bg-red-50 border-red-200' },
              { label:'Expiring in 30d', value: expiryStats.within30, color:'text-orange-600 bg-orange-50 border-orange-200' },
              { label:'Expiring in 60d', value: expiryStats.within60, color:'text-yellow-600 bg-yellow-50 border-yellow-200' },
            ].map(c => (
              <div key={c.label} className={`border rounded-xl p-4 ${c.color}`}>
                <div className="text-xs font-medium mb-1">{c.label}</div>
                <div className="text-3xl font-bold">{c.value}</div>
              </div>
            ))}
          </div>
          <div className="bg-white rounded-xl border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    {['Asset','Insurance Expiry','Warranty Expiry','AMC Expiry','Fitness','Pollution'].map(h => (
                      <th key={h} className="text-left py-3 px-4 text-xs font-medium text-gray-500">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {expiryData.map((a, i) => {
                    const exCell = (date, days) => {
                      if (!date) return <td key={date} className="py-3 px-4 text-xs text-gray-400">—</td>;
                      const cls = days < 0 ? 'text-red-600 font-bold' : days <= 30 ? 'text-orange-500 font-semibold' : 'text-gray-600';
                      const label = days < 0 ? `${date} (${Math.abs(days)}d ago)` : `${date} (${days}d)`;
                      return <td className={`py-3 px-4 text-xs ${cls}`}>{label}</td>;
                    };
                    return (
                      <tr key={i} className="border-b last:border-0 hover:bg-gray-50">
                        <td className="py-3 px-4">
                          <div className="font-mono text-xs text-blue-600">{a.asset_code}</div>
                          <div className="text-xs text-gray-700">{a.asset_name}</div>
                        </td>
                        {exCell(a.insurance_expiry, a.insurance_days)}
                        {exCell(a.warranty_expiry,  a.warranty_days)}
                        {exCell(a.amc_expiry,        a.amc_days)}
                        <td className="py-3 px-4 text-xs text-gray-500">{a.fitness_expiry || '—'}</td>
                        <td className="py-3 px-4 text-xs text-gray-500">{a.pollution_expiry || '—'}</td>
                      </tr>
                    );
                  })}
                  {expiryData.length === 0 && <tr><td colSpan={6} className="text-center py-8 text-gray-400">No expiring documents</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── ASSET REGISTER ── */}
      {report === 'register' && (
        <div>
          <div className="flex gap-3 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
              <input value={search} onChange={e => setSearch(e.target.value)}
                className="pl-9 pr-3 py-2 border rounded-lg text-sm w-full" placeholder="Search code, name, type, location…" />
            </div>
            <button onClick={exportCSV}
              className="flex items-center gap-2 px-4 py-2 bg-white border rounded-lg text-sm hover:bg-gray-50">
              <Download className="w-4 h-4" /> CSV
            </button>
          </div>
          <div className="bg-white rounded-xl border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    {['#','Code','Name','Category','Type','Status','Location','Value','PO','Invoice','Warranty'].map(h => (
                      <th key={h} className="text-left py-3 px-3 text-xs font-medium text-gray-500 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {registerFiltered.map((a, i) => (
                    <tr key={a.id} className="border-b last:border-0 hover:bg-gray-50">
                      <td className="py-2 px-3 text-gray-400">{i+1}</td>
                      <td className="py-2 px-3 font-mono text-blue-600 font-medium">{a.asset_code}</td>
                      <td className="py-2 px-3 text-gray-800 max-w-[140px] truncate">{a.asset_name}</td>
                      <td className="py-2 px-3 text-gray-500">{a.category_name || '—'}</td>
                      <td className="py-2 px-3 text-gray-500 max-w-[100px] truncate">{a.asset_type}</td>
                      <td className="py-2 px-3">
                        <span className="px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600 capitalize">{a.status}</span>
                      </td>
                      <td className="py-2 px-3 text-gray-500">{a.current_project_name || 'Central Yard'}</td>
                      <td className="py-2 px-3 text-gray-800">{a.purchase_value ? fmt(a.purchase_value) : '—'}</td>
                      <td className="py-2 px-3 font-mono text-gray-500">{a.po_number || '—'}</td>
                      <td className="py-2 px-3 font-mono text-gray-500">{a.invoice_number || '—'}</td>
                      <td className="py-2 px-3 text-gray-500">{a.warranty_expiry || '—'}</td>
                    </tr>
                  ))}
                  {registerFiltered.length === 0 && (
                    <tr><td colSpan={11} className="text-center py-8 text-gray-400">No assets found</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
