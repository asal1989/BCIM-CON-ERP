// src/pages/procurement/ProcurementReportsPage.jsx — Procurement Reports Section
import React, { useState, useMemo, useEffect } from 'react';
import {
  ChevronRight, FileBarChart, Search, X, Truck, LayoutDashboard,
  ClipboardList, Send, FileText, ShoppingCart, PackageCheck, Users,
  IndianRupee, TrendingUp, Clock, CheckCircle2, Sparkles,
} from 'lucide-react';
import {
  BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid,
  Tooltip as RTooltip, ResponsiveContainer,
} from 'recharts';
import { clsx } from 'clsx';
import api from '../../api/client';
import { REPORTS, ReportGenerator } from '../reports/ReportsPage';

const PROCUREMENT_REPORTS = REPORTS.filter(r => r.dept === 'procurement');

const CATEGORY_ORDER = [
  'Purchase Requisition Reports',
  'RFQ Reports',
  'Quotation Reports',
  'Purchase Order Reports',
  'Delivery Reports',
  'Vendor Reports',
  'Cost Analysis Reports',
];

const CATEGORY_META = {
  'Purchase Requisition Reports': { icon: ClipboardList, color: '#7c3aed', bg: '#f5f3ff' },
  'RFQ Reports':                  { icon: Send,          color: '#2563eb', bg: '#eff6ff' },
  'Quotation Reports':            { icon: FileText,      color: '#0891b2', bg: '#ecfeff' },
  'Purchase Order Reports':       { icon: ShoppingCart,  color: '#d97706', bg: '#fffbeb' },
  'Delivery Reports':             { icon: PackageCheck,  color: '#059669', bg: '#ecfdf5' },
  'Vendor Reports':               { icon: Users,         color: '#dc2626', bg: '#fef2f2' },
  'Cost Analysis Reports':        { icon: IndianRupee,   color: '#b45309', bg: '#fffbeb' },
};

const PIE_COLORS = ['#d97706', '#2563eb', '#059669', '#dc2626', '#7c3aed', '#0d9488'];

// ── KPI dashboard / overview ───────────────────────────────────────────────
function ProcurementOverview({ onSelectReport }) {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState(null);

  useEffect(() => {
    let cancelled = false;
    Promise.allSettled([
      api.get('/purchase-orders'),
      api.get('/quotations/rfqs'),
      api.get('/vendors'),
      api.get('/quotations/cs-summary'),
    ]).then(([poRes, rfqRes, vendorRes, csRes]) => {
      if (cancelled) return;

      const pos = poRes.status === 'fulfilled' ? (poRes.value.data?.data || []) : [];
      const rfqs = rfqRes.status === 'fulfilled' ? (rfqRes.value.data?.data || rfqRes.value.data?.rows || []) : [];
      const vendors = vendorRes.status === 'fulfilled' ? (vendorRes.value.data?.data || []) : [];
      const cs = csRes.status === 'fulfilled' ? (csRes.value.data?.data || []) : [];

      const totalPoValue = pos.reduce((s, p) => s + (parseFloat(p.grand_total) || 0), 0);
      const poStatusCounts = {};
      pos.forEach(p => {
        const st = (p.status || 'unknown').replace(/_/g, ' ');
        poStatusCounts[st] = (poStatusCounts[st] || 0) + 1;
      });

      const pendingRfqs = rfqs.filter(r => Number(r.quote_count || 0) < Number(r.vendor_count || 0)).length;

      const csWithL1 = cs.filter(r => r.l1_vendor);
      const totalSavings = csWithL1.reduce((s, r) => s + (parseFloat(r.savings_amount) || 0), 0);

      const monthly = {};
      pos.forEach(p => {
        const d = p.po_date || p.created_at;
        const key = d ? String(d).slice(0, 7) : 'Unknown';
        if (!monthly[key]) monthly[key] = { month: key, count: 0, value: 0 };
        monthly[key].count += 1;
        monthly[key].value += parseFloat(p.grand_total) || 0;
      });
      const monthlyTrend = Object.values(monthly).sort((a, b) => a.month.localeCompare(b.month)).slice(-6);

      setStats({
        poCount: pos.length,
        totalPoValue,
        poStatusCounts,
        rfqCount: rfqs.length,
        pendingRfqs,
        vendorCount: vendors.filter(v => v.status !== 'inactive').length,
        csCount: csWithL1.length,
        totalSavings,
        monthlyTrend,
      });
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  const cards = useMemo(() => {
    if (!stats) return [];
    return [
      {
        label: 'Purchase Orders', value: stats.poCount.toLocaleString('en-IN'),
        sub: `₹${stats.totalPoValue.toLocaleString('en-IN', { maximumFractionDigits: 0 })} total value`,
        icon: ShoppingCart, color: '#d97706', bg: '#fffbeb',
        onClick: () => onSelectReport('procurement-po'),
      },
      {
        label: 'Pending RFQs', value: stats.pendingRfqs.toLocaleString('en-IN'),
        sub: `${stats.rfqCount} RFQs issued total`,
        icon: Clock, color: '#2563eb', bg: '#eff6ff',
        onClick: () => onSelectReport('procurement-rfq-pending'),
      },
      {
        label: 'Active Vendors', value: stats.vendorCount.toLocaleString('en-IN'),
        sub: 'Registered & active',
        icon: Users, color: '#dc2626', bg: '#fef2f2',
        onClick: () => onSelectReport('procurement-vendor'),
      },
      {
        label: 'Negotiation Savings', value: `₹${stats.totalSavings.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`,
        sub: `Across ${stats.csCount} requisitions`,
        icon: TrendingUp, color: '#059669', bg: '#ecfdf5',
        onClick: () => onSelectReport('procurement-negotiation-savings'),
      },
    ];
  }, [stats, onSelectReport]);

  const statusPieData = useMemo(() => {
    if (!stats) return [];
    return Object.entries(stats.poStatusCounts).map(([name, value]) => ({ name, value }));
  }, [stats]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center text-slate-400">
        <div className="flex items-center gap-2 text-xs font-medium">
          <span className="w-4 h-4 border-2 border-slate-200 border-t-amber-500 rounded-full animate-spin" />
          Loading overview…
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-6 bg-gradient-to-b from-amber-50/40 to-slate-50">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-2xl mb-6 shadow-sm"
           style={{ background: 'linear-gradient(135deg, #92400e 0%, #d97706 55%, #f59e0b 100%)' }}>
        <div className="relative z-10 px-6 py-6 flex items-center justify-between gap-4 max-md:flex-col max-md:items-start">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <Sparkles className="w-4 h-4 text-amber-200" />
              <span className="text-[11px] font-semibold text-amber-100 uppercase tracking-widest">Procurement Intelligence</span>
            </div>
            <h1 className="text-xl font-bold text-white leading-tight">Reports Overview</h1>
            <p className="text-xs text-amber-100/90 mt-1 max-w-md">
              Live snapshot of purchase orders, RFQ activity, vendors, and negotiation savings — drill into any report from the sidebar for full detail.
            </p>
          </div>
          <div className="w-16 h-16 rounded-2xl bg-white/15 backdrop-blur-sm flex items-center justify-center flex-shrink-0 ring-1 ring-white/20">
            <LayoutDashboard className="w-7 h-7 text-white" />
          </div>
        </div>
        {/* decorative circles */}
        <div className="absolute -right-10 -top-10 w-40 h-40 rounded-full bg-white/10" />
        <div className="absolute right-20 -bottom-16 w-32 h-32 rounded-full bg-white/10" />
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {cards.map(card => {
          const Icon = card.icon;
          return (
            <button
              key={card.label}
              onClick={card.onClick}
              className="group text-left bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 p-4 overflow-hidden relative"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: card.bg }}>
                  <Icon className="w-5 h-5" style={{ color: card.color }} />
                </div>
                <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-slate-500 group-hover:translate-x-0.5 transition-all" />
              </div>
              <p className="text-2xl font-bold text-slate-900 tabular-nums leading-tight">{card.value}</p>
              <p className="text-xs font-semibold text-slate-600 mt-1">{card.label}</p>
              <p className="text-[11px] text-slate-400 mt-0.5">{card.sub}</p>
            </button>
          );
        })}
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
          <p className="text-xs font-semibold text-slate-700 mb-3">PO Value Trend (Last 6 Months)</p>
          {stats.monthlyTrend.length ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={stats.monthlyTrend} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <RTooltip formatter={(v) => `₹${Number(v).toLocaleString('en-IN')}`} />
                <Bar dataKey="value" name="PO Value" fill="#d97706" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[200px] flex items-center justify-center text-xs text-slate-400">No PO data yet</div>
          )}
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
          <p className="text-xs font-semibold text-slate-700 mb-3">Purchase Order Status Breakdown</p>
          {statusPieData.length ? (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={statusPieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70}
                     label={({ name, value }) => `${name}: ${value}`}>
                  {statusPieData.map((entry, i) => (
                    <Cell key={entry.name} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <RTooltip />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[200px] flex items-center justify-center text-xs text-slate-400">No PO data yet</div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2.5 text-xs text-slate-400 bg-white border border-slate-200 rounded-xl px-4 py-3">
        <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
        Select any report from the sidebar to generate a detailed, exportable, and printable view.
      </div>
    </div>
  );
}

export default function ProcurementReportsPage() {
  const [search, setSearch] = useState('');
  const [selectedKey, setSelectedKey] = useState('__overview__');

  const selectedReport = useMemo(
    () => PROCUREMENT_REPORTS.find(r => r.key === selectedKey) || null,
    [selectedKey]
  );

  const groups = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = q
      ? PROCUREMENT_REPORTS.filter(r => r.title.toLowerCase().includes(q) || r.desc.toLowerCase().includes(q))
      : PROCUREMENT_REPORTS;
    const byCategory = {};
    filtered.forEach(r => {
      const cat = r.category || 'Other';
      if (!byCategory[cat]) byCategory[cat] = [];
      byCategory[cat].push(r);
    });
    return CATEGORY_ORDER
      .filter(cat => byCategory[cat]?.length)
      .map(cat => ({ category: cat, reports: byCategory[cat] }));
  }, [search]);

  return (
    <div className="flex h-full min-h-0 bg-slate-50 overflow-hidden max-xl:flex-col">

      {/* ── Report list sidebar ───────────────────────────────────────────── */}
      <aside className="report-hub-list-panel w-80 flex-shrink-0 bg-white border-r border-slate-200 flex flex-col overflow-hidden max-xl:w-full max-xl:max-h-[340px]">

        {/* Header */}
        <div className="px-4 pt-4 pb-3.5 flex-shrink-0 border-b border-slate-100">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 shadow-sm"
                 style={{ background: 'linear-gradient(135deg, #b45309 0%, #d97706 100%)' }}>
              <Truck className="w-4.5 h-4.5 text-white" style={{ width: 18, height: 18 }} />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-900 leading-tight">Procurement Reports</p>
              <p className="text-[11px] text-slate-400 mt-0.5">{PROCUREMENT_REPORTS.length} reports · {CATEGORY_ORDER.length} categories</p>
            </div>
          </div>
          {/* Search */}
          <div className="flex items-center gap-2 bg-slate-50 rounded-lg px-3 py-2 border border-slate-200
                          focus-within:border-amber-300 focus-within:ring-2 focus-within:ring-amber-100 focus-within:bg-white transition-all">
            <Search className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search reports…"
              className="flex-1 bg-transparent text-xs text-slate-700 placeholder-slate-400 outline-none"
            />
            {search && (
              <button onClick={() => setSearch('')} className="text-slate-300 hover:text-slate-500 transition-colors">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Report list grouped by category */}
        <div className="flex-1 overflow-y-auto py-2.5 px-2.5
                        [&::-webkit-scrollbar]:w-1
                        [&::-webkit-scrollbar-track]:transparent
                        [&::-webkit-scrollbar-thumb]:rounded-full
                        [&::-webkit-scrollbar-thumb]:bg-slate-200">

          {/* Overview tile */}
          {!search && (
            <button
              onClick={() => setSelectedKey('__overview__')}
              className={clsx(
                'w-full text-left px-3 py-2.5 rounded-xl mb-2.5 transition-all duration-150 relative overflow-hidden group border',
                selectedKey === '__overview__'
                  ? 'border-transparent shadow-sm ring-1'
                  : 'border-transparent hover:bg-slate-50 hover:border-slate-100'
              )}
              style={selectedKey === '__overview__' ? { background: 'linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%)', boxShadow: 'inset 0 0 0 1px #fde68a' } : undefined}
            >
              <div className="flex items-center gap-3">
                <div className={clsx(
                  'w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 transition-all duration-150',
                  selectedKey === '__overview__' ? 'bg-white shadow-sm' : 'bg-slate-100 group-hover:bg-white group-hover:shadow-sm'
                )}>
                  <LayoutDashboard className={clsx('w-4 h-4', selectedKey === '__overview__' ? 'text-[#b45309]' : 'text-slate-400 group-hover:text-slate-600')} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className={clsx('text-xs leading-tight', selectedKey === '__overview__' ? 'font-semibold text-slate-900' : 'font-medium text-slate-700 group-hover:text-slate-900')}>
                    Overview Dashboard
                  </p>
                  <p className="text-[10.5px] text-slate-400 mt-1 leading-snug">Live KPIs &amp; quick stats</p>
                </div>
                {selectedKey === '__overview__' && <ChevronRight className="w-3.5 h-3.5 flex-shrink-0 text-[#b45309]" />}
              </div>
            </button>
          )}

          {groups.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-2.5 text-slate-400">
              <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center">
                <Search className="w-4 h-4 opacity-50" />
              </div>
              <p className="text-xs font-medium">No reports found</p>
            </div>
          ) : (
            groups.map(group => {
              const meta = CATEGORY_META[group.category] || { icon: FileBarChart, color: '#b45309', bg: '#fffbeb' };
              const CatIcon = meta.icon;
              return (
                <div key={group.category} className="mb-3">
                  <div className="flex items-center gap-2 px-2.5 pt-1.5 pb-1.5">
                    <div className="w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0" style={{ background: meta.bg }}>
                      <CatIcon className="w-3 h-3" style={{ color: meta.color }} />
                    </div>
                    <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">
                      {group.category}
                    </p>
                    <span className="text-[9px] font-semibold text-slate-300 tabular-nums ml-auto">{group.reports.length}</span>
                  </div>
                  {group.reports.map(r => {
                    const Icon = r.icon;
                    const active = selectedKey === r.key;
                    return (
                      <button
                        key={r.key}
                        onClick={() => setSelectedKey(r.key)}
                        className={clsx(
                          'w-full text-left px-3 py-2.5 rounded-xl mb-1 transition-all duration-150 relative overflow-hidden group border',
                          active
                            ? 'bg-[#fffbeb] border-transparent shadow-sm ring-1 ring-[#fde68a]'
                            : 'border-transparent hover:bg-slate-50 hover:border-slate-100'
                        )}
                      >
                        <div className="flex items-start gap-3">
                          <div className={clsx(
                            'w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 transition-all duration-150',
                            active ? 'bg-white shadow-sm' : 'bg-slate-100 group-hover:bg-white group-hover:shadow-sm'
                          )}>
                            <Icon className={clsx('w-4 h-4 transition-all duration-150', active ? 'text-[#b45309]' : 'text-slate-400 group-hover:text-slate-600')} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className={clsx(
                              'text-xs leading-tight',
                              active ? 'font-semibold text-slate-900' : 'font-medium text-slate-700 group-hover:text-slate-900'
                            )}>{r.title}</p>
                            <p className="text-[10.5px] text-slate-400 mt-1 leading-snug line-clamp-2">{r.desc}</p>
                          </div>
                          {active && (
                            <ChevronRight className="w-3.5 h-3.5 flex-shrink-0 mt-1 text-[#b45309]" />
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              );
            })
          )}
        </div>
      </aside>

      {/* ── Report generator / overview ────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0 min-h-0">
        {selectedKey === '__overview__'
          ? <ProcurementOverview onSelectReport={setSelectedKey} />
          : selectedReport
            ? <ReportGenerator report={selectedReport} />
            : (
              <div className="flex-1 flex flex-col items-center justify-center text-slate-400">
                <FileBarChart className="w-12 h-12 mb-3 opacity-20" />
                <p className="text-sm font-medium">Select a report to generate</p>
              </div>
            )
        }
      </div>
    </div>
  );
}
