import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { tqsBillsAPI, projectAPI } from '../../api/client';
import {
  BarChart3, TrendingUp, Activity, IndianRupee,
  Receipt, CheckCircle2, Clock, ArrowRight,
  Building2, AlertTriangle, RefreshCw, Calendar,
  Filter, X,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell,
  AreaChart, Area,
} from 'recharts';
import { clsx } from 'clsx';
import dayjs from 'dayjs';

// ─── Formatters ───────────────────────────────────────────────────────────────
const lakhs = v => Number(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Smart Indian display: auto picks Cr / L / plain
const inrFmt = v => {
  const n = Number(v || 0);
  if (n < 0) {
    const abs = Math.abs(n);
    return `-₹${abs.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  return `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

// ─── Stage config ─────────────────────────────────────────────────────────────
const STAGES = [
  { key: 'pending',             label: 'Pending',     short: 'Pending',  color: '#f59e0b', bg: 'bg-amber-50',   text: 'text-amber-700',   border: 'border-amber-200'   },
  { key: 'stores',              label: 'Stores',      short: 'Stores',   color: '#3b82f6', bg: 'bg-blue-50',    text: 'text-blue-700',    border: 'border-blue-200'    },
  { key: 'document_controller', label: 'Doc Control', short: 'Doc Ctrl', color: '#06b6d4', bg: 'bg-cyan-50',    text: 'text-cyan-700',    border: 'border-cyan-200'    },
  { key: 'qs',                  label: 'QS',          short: 'QS',       color: '#6366f1', bg: 'bg-indigo-50',  text: 'text-indigo-700',  border: 'border-indigo-200'  },
  { key: 'accounts',            label: 'Accounts',    short: 'Accounts', color: '#8b5cf6', bg: 'bg-violet-50',  text: 'text-violet-700',  border: 'border-violet-200'  },
  { key: 'procurement',         label: 'Procurement', short: 'Procure',  color: '#f97316', bg: 'bg-orange-50',  text: 'text-orange-700',  border: 'border-orange-200'  },
  { key: 'paid',                label: 'Paid',        short: 'Paid',     color: '#22c55e', bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
];

const BILL_TYPES = [
  { key: '',            label: 'All Types'    },
  { key: 'po',          label: 'PO Bills'     },
  { key: 'work_order',  label: 'Work Order'   },
  { key: 'advance',     label: 'Advance'      },
  { key: 'retention',   label: 'Retention'    },
  { key: 'credit_note', label: 'Credit Note'  },
];

// Date-range presets — "All time" is default (null bounds = no filter)
const PRESETS = [
  { key: 'all',   label: 'All Time',     from: null,                             to: null },
  { key: '30d',   label: 'Last 30 Days', from: dayjs().subtract(30,'day'),       to: dayjs() },
  { key: '90d',   label: 'Last 3 Mon',   from: dayjs().subtract(90,'day'),       to: dayjs() },
  { key: '6m',    label: 'Last 6 Mon',   from: dayjs().subtract(6,'month'),      to: dayjs() },
  { key: '1y',    label: 'Last 1 Year',  from: dayjs().subtract(1,'year'),       to: dayjs() },
  { key: 'custom',label: 'Custom',       from: null,                             to: null },
];

const PAYMENT_TREND_VIEWS = [
  { key: 'cumulative', label: 'Cumulative' },
  { key: 'monthly',    label: 'Monthly' },
  { key: 'balance',    label: 'Balance' },
];

const TOOLTIP_STYLE = {
  backgroundColor: '#1e293b', border: '1px solid #334155',
  borderRadius: 8, color: '#f1f5f9', fontSize: 11,
};

// ─── Custom tooltip ────────────────────────────────────────────────────────────
function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const fmtL = v => {
    const amount = Number(v || 0);
    return `₹${amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };
  return (
    <div style={TOOLTIP_STYLE} className="p-3 rounded-lg shadow-xl">
      <p className="font-medium mb-1.5 text-slate-300">{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color }} className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full inline-block" style={{ background: p.color }} />
          {p.name}: <span className="font-bold">{fmtL(p.value)}</span>
        </p>
      ))}
    </div>
  );
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────
function KpiCard({ icon: Icon, label, value, sub, accent = 'indigo' }) {
  const accents = {
    blue:    { light: 'bg-blue-50',    text: 'text-blue-700',    icon: 'text-blue-600',    border: 'border-blue-100'    },
    indigo:  { light: 'bg-indigo-50',  text: 'text-indigo-700',  icon: 'text-indigo-600',  border: 'border-indigo-100' },
    emerald: { light: 'bg-emerald-50', text: 'text-emerald-700', icon: 'text-emerald-600', border: 'border-emerald-100' },
    amber:   { light: 'bg-amber-50',   text: 'text-amber-700',   icon: 'text-amber-600',   border: 'border-amber-100'   },
    violet:  { light: 'bg-violet-50',  text: 'text-violet-700',  icon: 'text-violet-600',  border: 'border-violet-100'  },
    red:     { light: 'bg-red-50',     text: 'text-red-700',     icon: 'text-red-500',     border: 'border-red-100'     },
  };
  const a = accents[accent] || accents.indigo;
  return (
    <div className={clsx('bg-white rounded-xl border p-4 flex items-start gap-3 shadow-sm', a.border)}>
      <div className={clsx('w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0', a.light)}>
        <Icon className={clsx('w-5 h-5', a.icon)} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-slate-900 font-medium mb-0.5">{label}</p>
        <p className={clsx('text-2xl font-medium leading-tight', a.text)}>{value}</p>
        {sub && <p className="text-xs text-slate-900 font-medium mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

// ─── Section card ─────────────────────────────────────────────────────────────
function Card({ title, icon: Icon, iconColor = 'text-slate-400', action, children }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <Icon className={clsx('w-4 h-4', iconColor)} />
          <span className="text-xs font-medium text-slate-900 uppercase tracking-wider">{title}</span>
        </div>
        {action}
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────
export default function BillTrackerAnalyticsPage() {
  const [projectId,  setProjectId]  = useState('');
  const [billType,   setBillType]   = useState('');
  const [vendorQ,    setVendorQ]    = useState('');
  const [preset,     setPreset]     = useState('all');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo,   setCustomTo]   = useState('');
  const [trendView,  setTrendView]  = useState('cumulative');

  // ── Fetch ──
  const { data: allBills = [], isLoading, refetch } = useQuery({
    queryKey: ['tqs-bills', 'analytics', projectId],
    queryFn: () => tqsBillsAPI.list({ project_id: projectId || undefined })
      .then(r => Array.isArray(r.data) ? r.data : (r.data?.data ?? [])),
    staleTime: 0,
  });

  const { data: projects = [] } = useQuery({
    queryKey: ['projects-list'],
    queryFn: () => projectAPI.list().then(r => { const d = r.data; return Array.isArray(d) ? d : (d?.projects ?? d?.data ?? []); }),
    staleTime: 300000,
  });

  // ── Unique vendors ──
  const vendors = useMemo(() => {
    const names = [...new Set(allBills.map(b => b.vendor_name).filter(Boolean))].sort();
    return names;
  }, [allBills]);

  // ── Date bounds from preset ──
  const { fromDate, toDate } = useMemo(() => {
    if (preset === 'custom') {
      return {
        fromDate: customFrom ? dayjs(customFrom).toDate() : null,
        toDate:   customTo   ? dayjs(customTo).endOf('day').toDate() : null,
      };
    }
    const p = PRESETS.find(x => x.key === preset);
    return {
      fromDate: p?.from ? p.from.toDate() : null,
      toDate:   p?.to   ? p.to.endOf('day').toDate() : null,
    };
  }, [preset, customFrom, customTo]);

  // ── Apply all client-side filters ──
  const bills = useMemo(() => allBills.filter(b => {
    if (billType && b.bill_type !== billType) return false;
    if (vendorQ  && b.vendor_name !== vendorQ) return false;
    if (fromDate || toDate) {
      const d = b.inv_date ? new Date(b.inv_date) : (b.created_at ? new Date(b.created_at) : null);
      if (!d) return false;
      if (fromDate && d < fromDate) return false;
      if (toDate   && d > toDate)   return false;
    }
    return true;
  }), [allBills, billType, vendorQ, fromDate, toDate]);

  // ── Active filter count ──
  const activeFilters = [billType, vendorQ, preset !== 'all' ? preset : ''].filter(Boolean).length;

  const clearFilters = () => { setBillType(''); setVendorQ(''); setPreset('all'); setCustomFrom(''); setCustomTo(''); };

  // ── KPIs ──
  const totalBills   = bills.length;
  const totalAmt     = bills.reduce((s, b) => s + Number(b.total_amount || 0), 0);
  const paidBills    = bills.filter(b => b.workflow_status === 'paid');
  const paidAmt      = paidBills.reduce((s, b) => s + Number(b.total_amount || 0), 0);
  const certAmt      = bills.reduce((s, b) => s + Number(b.certified_net || 0), 0);
  const pendingBills = bills.filter(b => b.workflow_status === 'pending');
  const pendingAmt   = pendingBills.reduce((s, b) => s + Number(b.total_amount || 0), 0);
  const paidPct      = totalAmt > 0 ? ((paidAmt / totalAmt) * 100).toFixed(1) : '0.0';

  // ── Pipeline ──
  const pipeline = useMemo(() => STAGES.map(s => {
    const sb = bills.filter(b => b.workflow_status === s.key);
    return { ...s, count: sb.length, amount: sb.reduce((acc, b) => acc + Number(b.total_amount || 0), 0) };
  }), [bills]);

  // ── Monthly data (by calendar month of inv_date) ──
  const monthlyData = useMemo(() => {
    const map = {};
    bills.forEach(b => {
      const d = b.inv_date ? dayjs(b.inv_date) : null;
      if (!d) return;
      const key = d.format('MMM YY');
      if (!map[key]) map[key] = { month: key, sortKey: d.valueOf(), count: 0, total: 0, paid: 0 };
      map[key].count++;
      map[key].total += Number(b.total_amount || 0);
      if (b.workflow_status === 'paid') map[key].paid += Number(b.total_amount || 0);
    });
    return Object.values(map)
      .sort((a, b) => a.sortKey - b.sortKey)
      .map(r => ({
        ...r,
        total: parseFloat(r.total.toFixed(2)),
        paid:  parseFloat(r.paid.toFixed(2)),
        balance: parseFloat((r.total - r.paid).toFixed(2)),
      }));
  }, [bills]);

  // ── Cumulative paid ──
  const cumulTrend = useMemo(() => {
    let cumPaid = 0;
    let cumTotal = 0;
    return monthlyData.map(m => {
      cumPaid += m.paid;
      cumTotal += m.total;
      return {
        ...m,
        cumPaid: parseFloat(cumPaid.toFixed(2)),
        cumTotal: parseFloat(cumTotal.toFixed(2)),
        cumBalance: parseFloat((cumTotal - cumPaid).toFixed(2)),
      };
    });
  }, [monthlyData]);

  const paymentTrendSeries = useMemo(() => {
    if (trendView === 'monthly') {
      return [
        { key: 'total', label: 'Monthly Invoiced', color: '#6366f1', fill: 'url(#totGrad)' },
        { key: 'paid',  label: 'Monthly Paid',     color: '#22c55e', fill: 'url(#cumGrad)' },
      ];
    }
    if (trendView === 'balance') {
      return [
        { key: 'cumBalance', label: 'Balance to Pay',  color: '#f59e0b', fill: 'url(#balGrad)' },
        { key: 'cumPaid',    label: 'Cumulative Paid', color: '#22c55e', fill: 'url(#cumGrad)' },
      ];
    }
    return [
      { key: 'cumTotal', label: 'Cumulative Invoiced', color: '#6366f1', fill: 'url(#totGrad)' },
      { key: 'cumPaid',  label: 'Cumulative Paid',     color: '#22c55e', fill: 'url(#cumGrad)' },
    ];
  }, [trendView]);

  // ── Top 10 vendors ──
  const vendorData = useMemo(() => {
    const map = {};
    bills.forEach(b => {
      const v = b.vendor_name || 'Unknown';
      if (!map[v]) map[v] = { name: v, total: 0, paid: 0, count: 0 };
      map[v].total += Number(b.total_amount || 0);
      if (b.workflow_status === 'paid') map[v].paid += Number(b.total_amount || 0);
      map[v].count++;
    });
    return Object.values(map).sort((a, b) => b.total - a.total).slice(0, 10);
  }, [bills]);

  // ── Date range label ──
  const rangeLabel = useMemo(() => {
    if (preset === 'all') return 'All Time';
    if (preset === 'custom') {
      if (customFrom && customTo) return `${dayjs(customFrom).format('DD MMM YY')} – ${dayjs(customTo).format('DD MMM YY')}`;
      if (customFrom) return `From ${dayjs(customFrom).format('DD MMM YY')}`;
      if (customTo)   return `Until ${dayjs(customTo).format('DD MMM YY')}`;
      return 'Custom (set dates)';
    }
    return PRESETS.find(p => p.key === preset)?.label || preset;
  }, [preset, customFrom, customTo]);

  return (
    <div className="min-h-screen bg-[#f4f6f9] p-6 space-y-5">

      {/* ── Header ── */}
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center shadow-md">
            <BarChart3 className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-medium text-slate-900">Bill Tracker Analytics</h1>
            <p className="text-xs text-slate-900 font-medium mt-0.5">Invoice workflow insights · {rangeLabel}</p>
          </div>
        </div>

        {/* ── Filter bar ── */}
        <div className="flex flex-col gap-2 items-end">

          {/* Row 1 — project + bill type + vendor + refresh */}
          <div className="flex items-center gap-2 flex-wrap justify-end">
            {/* Project */}
            <select value={projectId} onChange={e => setProjectId(e.target.value)}
              className="h-9 text-sm border border-slate-200 rounded-lg px-3 bg-white text-slate-900 outline-none focus:border-blue-400 shadow-sm">
              <option value="">All Projects</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>

            {/* Bill type */}
            <select value={billType} onChange={e => setBillType(e.target.value)}
              className="h-9 text-sm border border-slate-200 rounded-lg px-3 bg-white text-slate-900 outline-none focus:border-blue-400 shadow-sm">
              {BILL_TYPES.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
            </select>

            {/* Vendor */}
            <select value={vendorQ} onChange={e => setVendorQ(e.target.value)}
              className="h-9 text-sm border border-slate-200 rounded-lg px-3 bg-white text-slate-900 outline-none focus:border-blue-400 shadow-sm max-w-[180px]">
              <option value="">All Vendors</option>
              {vendors.map(v => <option key={v} value={v}>{v}</option>)}
            </select>

            {/* Clear */}
            {activeFilters > 0 && (
              <button onClick={clearFilters}
                className="h-9 flex items-center gap-1.5 px-3 rounded-lg border border-red-200 bg-red-50 text-red-600 text-xs font-medium hover:bg-red-100 transition-all">
                <X className="w-3.5 h-3.5" /> Clear ({activeFilters})
              </button>
            )}

            <button onClick={() => refetch()}
              className="h-9 w-9 rounded-lg border border-slate-200 bg-white flex items-center justify-center text-slate-900 font-medium hover:text-blue-600 hover:border-blue-300 transition-all shadow-sm">
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>

          {/* Row 2 — date range presets */}
          <div className="flex items-center gap-1 flex-wrap justify-end">
            <Calendar className="w-3.5 h-3.5 text-slate-900 font-medium mr-0.5" />
            {PRESETS.map(p => (
              <button key={p.key} onClick={() => setPreset(p.key)}
                className={clsx(
                  'h-7 px-3 rounded-lg text-xs font-medium border transition-all',
                  preset === p.key
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-slate-900 font-medium border-slate-200 hover:border-blue-300 hover:text-blue-600'
                )}>
                {p.label}
              </button>
            ))}
          </div>

          {/* Custom date pickers */}
          {preset === 'custom' && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400">From</span>
              <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
                className="h-8 text-xs border border-slate-200 rounded-lg px-2 bg-white outline-none focus:border-blue-400 shadow-sm" />
              <span className="text-xs text-slate-400">To</span>
              <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)}
                className="h-8 text-xs border border-slate-200 rounded-lg px-2 bg-white outline-none focus:border-blue-400 shadow-sm" />
            </div>
          )}
        </div>
      </div>

      {/* ── Loading skeleton ── */}
      {isLoading && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-slate-200 p-4 h-24 animate-pulse">
              <div className="h-3 bg-slate-100 rounded w-2/3 mb-3" />
              <div className="h-7 bg-slate-100 rounded w-1/2" />
            </div>
          ))}
        </div>
      )}

      {!isLoading && <>

      {/* ── Empty state ── */}
      {totalBills === 0 && allBills.length > 0 && (
        <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          <span>No bills match the current filters ({allBills.length} total bills available). <button onClick={clearFilters} className="underline font-semibold">Clear filters</button></span>
        </div>
      )}

      {/* ── KPI Row ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard icon={Receipt}      label="Total Bills"      value={totalBills}          sub={`of ${allBills.length} all-time`}                       accent="blue"    />
        <KpiCard icon={IndianRupee}  label="Invoice Value"    value={inrFmt(totalAmt)}    sub="invoice total"                                          accent="indigo"  />
        <KpiCard icon={CheckCircle2} label="Amount Paid"      value={inrFmt(paidAmt)}     sub={`${paidPct}% of total · ${paidBills.length} bills`}     accent="emerald" />
        <KpiCard icon={Clock}        label="Pending Bills"    value={pendingBills.length} sub={`${inrFmt(pendingAmt)} awaiting action`}                accent="amber"   />
      </div>

      {/* ── Pipeline flow ── */}
      <Card title="Bill Pipeline — Stage Overview" icon={Activity} iconColor="text-indigo-500">
        <div className="flex items-stretch gap-1 overflow-x-auto pb-1">
          {pipeline.map((s, i) => (
            <React.Fragment key={s.key}>
              <div className={clsx('flex-1 min-w-[80px] rounded-xl border p-3 flex flex-col items-center gap-1 text-center', s.bg, s.border)}>
                <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-medium shadow-sm"
                  style={{ background: s.color }}>
                  {s.count}
                </div>
                <p className={clsx('text-[11px] font-bold', s.text)}>{s.short}</p>
                <p className="text-[10px] text-slate-900 font-medium font-medium">{inrFmt(s.amount)}</p>
              </div>
              {i < pipeline.length - 1 && (
                <div className="flex items-center flex-shrink-0">
                  <ArrowRight className="w-3.5 h-3.5 text-slate-300" />
                </div>
              )}
            </React.Fragment>
          ))}
        </div>
        {totalBills > 0 && (
          <>
            <div className="flex h-2.5 rounded-full overflow-hidden mt-3">
              {pipeline.filter(s => s.count > 0).map(s => (
                <div key={s.key} className="transition-all" title={`${s.label}: ${s.count}`}
                  style={{ width: `${(s.count / totalBills) * 100}%`, background: s.color }} />
              ))}
            </div>
            <div className="flex items-center gap-3 mt-2 flex-wrap">
              {pipeline.filter(s => s.count > 0).map(s => (
                <div key={s.key} className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full" style={{ background: s.color }} />
                  <span className="text-[10px] text-slate-500">{s.short} ({s.count})</span>
                </div>
              ))}
            </div>
          </>
        )}
      </Card>

      {/* ── Row 2: Monthly bar + Stage donut ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        <div className="lg:col-span-2">
          <Card title="Month-wise Invoice Volume" icon={BarChart3} iconColor="text-indigo-500">
            {monthlyData.length === 0 ? (
              <div className="flex items-center justify-center h-40 text-slate-300 text-xs">No invoice date data available</div>
            ) : (
              <>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={monthlyData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                    <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={36} />
                    <Tooltip content={<ChartTooltip />} />
                    <Bar dataKey="total" name="Invoiced" fill="#6366f1" radius={[4,4,0,0]} maxBarSize={32} />
                    <Bar dataKey="paid"  name="Paid"     fill="#22c55e" radius={[4,4,0,0]} maxBarSize={32} />
                  </BarChart>
                </ResponsiveContainer>
                {/* Count row */}
                <div className="mt-2 border-t border-slate-100 pt-2 overflow-x-auto">
                  <div className="flex gap-1 min-w-max">
                    {monthlyData.map((m, i) => (
                      <div key={i} className="flex-1 min-w-[48px] text-center">
                        <div className={clsx('text-xs font-medium rounded-lg py-0.5', m.count > 0 ? 'bg-indigo-50 text-indigo-700' : 'text-slate-200')}>
                          {m.count}
                        </div>
                        <div className="text-[9px] text-slate-900 font-medium mt-0.5">{m.month}</div>
                      </div>
                    ))}
                    <div className="flex-1 min-w-[48px] text-center">
                      <div className="text-xs font-medium rounded-lg py-0.5 bg-slate-800 text-white">
                        {monthlyData.reduce((s, m) => s + m.count, 0)}
                      </div>
                      <div className="text-[9px] text-slate-900 font-medium mt-0.5">Total</div>
                    </div>
                  </div>
                </div>
              </>
            )}
          </Card>
        </div>

        <div>
          <Card title="Bills by Stage" icon={Activity} iconColor="text-violet-500">
            {totalBills === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-slate-300 gap-2">
                <BarChart3 className="w-8 h-8" />
                <p className="text-xs">No data</p>
              </div>
            ) : (
              <>
                <ResponsiveContainer width="100%" height={150}>
                  <PieChart>
                    <Pie data={pipeline.filter(s => s.count > 0)} dataKey="count" nameKey="label"
                      cx="50%" cy="50%" outerRadius={65} innerRadius={35} strokeWidth={2} stroke="#f4f6f9">
                      {pipeline.filter(s => s.count > 0).map((s, i) => <Cell key={i} fill={s.color} />)}
                    </Pie>
                    <Tooltip formatter={(v, n) => [v + ' bills', n]} contentStyle={TOOLTIP_STYLE} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-1.5 mt-1">
                  {pipeline.filter(s => s.count > 0).map(s => (
                    <div key={s.key} className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: s.color }} />
                      <span className="text-xs text-slate-900 flex-1">{s.label}</span>
                      <span className="text-xs font-medium text-black">{s.count}</span>
                      <span className="text-[10px] text-slate-900 font-medium w-20 text-right">{inrFmt(s.amount)}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </Card>
        </div>
      </div>

      {/* ── Row 3: Cumulative trend + Top vendors ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

        <Card
          title="Payment Trend"
          icon={TrendingUp}
          iconColor="text-emerald-500"
          action={
            <select
              value={trendView}
              onChange={e => setTrendView(e.target.value)}
              className="h-8 text-xs border border-slate-200 rounded-lg px-2 bg-white text-slate-700 outline-none focus:border-emerald-400"
            >
              {PAYMENT_TREND_VIEWS.map(v => <option key={v.key} value={v.key}>{v.label}</option>)}
            </select>
          }
        >
          {cumulTrend.length === 0 ? (
            <div className="flex items-center justify-center h-40 text-slate-300 text-xs">No data</div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={cumulTrend} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="cumGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#22c55e" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="totGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#6366f1" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="balGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#f59e0b" stopOpacity={0.22} />
                    <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={36} />
                <Tooltip content={<ChartTooltip />} />
                {paymentTrendSeries.map((s, idx) => (
                  <Area
                    key={s.key}
                    type="monotone"
                    dataKey={s.key}
                    name={`${s.label} (Rs)`}
                    stroke={s.color}
                    strokeWidth={idx === 0 ? 1.5 : 2}
                    fill={s.fill}
                    dot={false}
                  />
                ))}
              </AreaChart>
            </ResponsiveContainer>
          )}
        </Card>

        <Card title="Top 10 Vendors by Invoice Value" icon={Building2} iconColor="text-amber-500">
          {vendorData.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-slate-300 gap-2">
              <Building2 className="w-8 h-8" />
              <p className="text-xs">No vendor data</p>
            </div>
          ) : (
            <div className="overflow-y-auto max-h-[240px] -mx-4 px-4">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-white">
                  <tr className="border-b border-slate-100">
                    <th className="pb-2 text-left font-medium text-slate-900 font-medium uppercase tracking-wide">#</th>
                    <th className="pb-2 text-left font-medium text-slate-900 font-medium uppercase tracking-wide">Vendor</th>
                    <th className="pb-2 text-right font-medium text-slate-900 font-medium uppercase tracking-wide">Bills</th>
                    <th className="pb-2 text-right font-medium text-slate-900 font-medium uppercase tracking-wide">Total</th>
                    <th className="pb-2 text-right font-medium text-slate-900 font-medium uppercase tracking-wide">Paid</th>
                    <th className="pb-2 text-right font-medium text-slate-900 font-medium uppercase tracking-wide">%</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {vendorData.map((v, i) => {
                    const pct = v.total > 0 ? ((v.paid / v.total) * 100).toFixed(0) : 0;
                    return (
                      <tr key={i} className="hover:bg-slate-50 transition-colors">
                        <td className="py-2 text-slate-900 font-medium font-mono">{i + 1}</td>
                        <td className="py-2 font-medium text-slate-900 font-medium max-w-[140px] truncate">{v.name}</td>
                        <td className="py-2 text-right text-slate-500">{v.count}</td>
                        <td className="py-2 text-right font-medium text-indigo-600">{inrFmt(v.total)}</td>
                        <td className="py-2 text-right font-medium text-emerald-600">{inrFmt(v.paid)}</td>
                        <td className="py-2 text-right">
                          <span className={clsx('px-1.5 py-0.5 rounded text-[10px] font-bold',
                            pct >= 80 ? 'bg-emerald-50 text-emerald-700' :
                            pct >= 40 ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-500'
                          )}>{pct}%</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      {/* ── Footer summary ── */}
      <div className="bg-white border border-slate-200 rounded-xl px-5 py-3 flex flex-wrap items-center gap-4 text-xs text-slate-900 font-medium shadow-sm">
        <span className="font-medium text-slate-700">{rangeLabel}</span>
        <span className="w-px h-4 bg-slate-200" />
        <span>{totalBills} bills · {inrFmt(totalAmt)} invoiced</span>
        <span className="w-px h-4 bg-slate-200" />
        <span className="text-emerald-600 font-medium">{inrFmt(paidAmt)} paid ({paidPct}%)</span>
        <span className="w-px h-4 bg-slate-200" />
        <span className="text-amber-600 font-medium">{pendingBills.length} pending · {inrFmt(pendingAmt)}</span>
        <span className="ml-auto text-slate-300">
          {allBills.length} total · {projectId ? (projects.find(p => p.id === projectId)?.name || '—') : 'All projects'}
          {billType ? ` · ${BILL_TYPES.find(t => t.key === billType)?.label}` : ''}
          {vendorQ  ? ` · ${vendorQ}` : ''}
        </span>
      </div>

      </>}
    </div>
  );
}

