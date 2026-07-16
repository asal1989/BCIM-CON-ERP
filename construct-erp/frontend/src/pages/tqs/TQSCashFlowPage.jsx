import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { tqsBillsAPI, projectAPI } from '../../api/client';
import * as XLSX from 'xlsx';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ReferenceLine,
} from 'recharts';
import {
  Download, X, TrendingUp, TrendingDown, Minus,
  IndianRupee, Clock, CheckCircle2, AlertCircle, Activity,
} from 'lucide-react';

// ── Formatters ───────────────────────────────────────────────────────────────
const fmt  = (v) => Number(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const inr  = (v) => Number(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const cr   = (v) => { const n = Number(v || 0); return n >= 1e7 ? `${(n / 1e7).toFixed(2)} Cr` : n >= 1e5 ? `${(n / 1e5).toFixed(1)} L` : `${fmt(n)}`; };
const pct  = (a, b) => (b > 0 ? Math.round((a / b) * 100) : 0);

// ── Date helpers ─────────────────────────────────────────────────────────────
function thisFY() {
  const now = new Date();
  const yr  = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  return { from: `${yr}-04-01`, to: `${yr + 1}-03-31` };
}
function lastNMonths(n) {
  const to   = new Date();
  const from = new Date();
  from.setMonth(from.getMonth() - n + 1);
  from.setDate(1);
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}
function thisMonth() {
  const now  = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  return { from: from.toISOString().slice(0, 10), to: now.toISOString().slice(0, 10) };
}

// ── KPI Card ─────────────────────────────────────────────────────────────────
function KPICard({ label, value, sub, sub2, icon: Icon, accent, trend, trendLabel }) {
  const TrendIcon = trend === 'up' ? TrendingUp : trend === 'down' ? TrendingDown : Minus;
  return (
    <div className={`relative overflow-hidden rounded-2xl border p-5 bg-white shadow-sm ${accent.border}`}>
      {/* accent stripe */}
      <div className={`absolute inset-y-0 left-0 w-1 rounded-l-2xl ${accent.stripe}`} />
      <div className="flex items-start justify-between gap-2 pl-1">
        <div className="min-w-0 flex-1">
          <p className="text-[10.5px] font-semibold uppercase tracking-widest text-slate-400 mb-1.5">{label}</p>
          <p className={`text-2xl font-bold tabular-nums ${accent.text}`}>₹{cr(value)}</p>
          {sub  && <p className="text-[11px] text-slate-500 mt-1">{sub}</p>}
          {sub2 && <p className="text-[11px] text-slate-400 mt-0.5">{sub2}</p>}
        </div>
        <div className={`shrink-0 w-10 h-10 rounded-xl flex items-center justify-center ${accent.iconBg}`}>
          <Icon className={`w-5 h-5 ${accent.icon}`} />
        </div>
      </div>
      {trendLabel && (
        <div className={`mt-3 pl-1 flex items-center gap-1 text-[11px] font-medium ${trend === 'down' ? 'text-emerald-600' : trend === 'up' ? 'text-amber-600' : 'text-slate-400'}`}>
          <TrendIcon className="w-3 h-3" />
          {trendLabel}
        </div>
      )}
    </div>
  );
}

// ── Custom chart tooltip ──────────────────────────────────────────────────────
function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-slate-900 text-white rounded-xl shadow-2xl px-4 py-3 text-xs space-y-1.5 min-w-[200px]">
      <p className="font-semibold text-slate-200 mb-2 border-b border-slate-700 pb-1.5">{label}</p>
      {payload.map(p => (
        <div key={p.name} className="flex justify-between items-center gap-4">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full inline-block" style={{ background: p.color }} />
            <span className="text-slate-300">{p.name}</span>
          </span>
          <span className="font-semibold tabular-nums">₹{inr(p.value)}</span>
        </div>
      ))}
      <div className="pt-1.5 border-t border-slate-700 flex justify-between">
        <span className="text-slate-400">Total</span>
        <span className="font-bold tabular-nums">
          ₹{inr(payload.reduce((s, p) => s + (p.value || 0), 0))}
        </span>
      </div>
    </div>
  );
}

// ── Status pill ───────────────────────────────────────────────────────────────
function StatusPill({ paidPct }) {
  if (paidPct >= 80) return <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 text-emerald-700 text-[10px] font-semibold px-2 py-0.5 border border-emerald-200">{paidPct}% ✓</span>;
  if (paidPct >= 40) return <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 text-amber-700 text-[10px] font-semibold px-2 py-0.5 border border-amber-200">{paidPct}%</span>;
  return <span className="inline-flex items-center gap-1 rounded-full bg-red-50 text-red-700 text-[10px] font-semibold px-2 py-0.5 border border-red-200">{paidPct}%</span>;
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function TQSCashFlowPage() {
  const [projectId, setProjectId] = useState('');
  const [fromDate,  setFromDate]  = useState('');
  const [toDate,    setToDate]    = useState('');

  const setPreset = (preset) => { setFromDate(preset.from); setToDate(preset.to); };
  const clearFilters = () => { setProjectId(''); setFromDate(''); setToDate(''); };

  const { data: projects = [] } = useQuery({
    queryKey: ['projects-list'],
    queryFn: () => projectAPI.list().then(r => { const d = r.data; return Array.isArray(d) ? d : (d?.data ?? d?.projects ?? []); }),
  });

  const { data, isLoading } = useQuery({
    queryKey: ['tqs-bills', 'cash-flow', projectId, fromDate, toDate],
    queryFn: () => tqsBillsAPI.cashFlow({
      project_id: projectId || undefined,
      from_date:  fromDate  || undefined,
      to_date:    toDate    || undefined,
    }).then(r => r.data),
    staleTime: 0,
  });

  const rows    = data?.data    ?? [];
  const summary = data?.summary ?? {};

  const rowsWithCumulative = useMemo(() => {
    let cumPaid = 0;
    return rows.map(r => {
      cumPaid += parseFloat(r.paid || 0);
      return { ...r, cum_paid: cumPaid };
    });
  }, [rows]);

  const chartData = useMemo(() =>
    rowsWithCumulative.map(r => ({
      name:       r.month_label,
      Paid:       parseFloat(r.paid       || 0),
      'In-Process': parseFloat(r.in_process || 0),
      Pending:    parseFloat(r.pending    || 0),
    })),
  [rowsWithCumulative]);

  const totalBase = parseFloat(summary.total_paid || 0) + parseFloat(summary.in_process || 0) + parseFloat(summary.total_pending || 0);
  const overallPct = pct(summary.total_paid, totalBase);

  // Max monthly billed for any retention trend display
  const maxMonthly = useMemo(() => Math.max(...rows.map(r => parseFloat(r.total_billed || 0)), 1), [rows]);

  const hasFilters = projectId || fromDate || toDate;

  const exportExcel = () => {
    const headers = [
      'Month', 'Bills', 'Gross Billed', 'GST', 'Total Billed',
      'Paid', 'In-Process', 'Pending', 'Net Payable (Unpaid)',
      'Retention Held', 'Advance Recovered', 'Deductions', 'Cumulative Paid',
    ];
    let cumPaid = 0;
    const wsData = [
      headers,
      ...rows.map(r => {
        cumPaid += parseFloat(r.paid || 0);
        return [
          r.month_label, r.bill_count,
          parseFloat(r.gross_billed || 0), parseFloat(r.gst_amount || 0), parseFloat(r.total_billed || 0),
          parseFloat(r.paid || 0), parseFloat(r.in_process || 0), parseFloat(r.pending || 0),
          parseFloat(r.net_payable || 0), parseFloat(r.retention_held || 0),
          parseFloat(r.advance_recovered || 0), parseFloat(r.total_deductions || 0), cumPaid,
        ];
      }),
      [],
      ['TOTALS', summary.total_bills || 0, '', '', parseFloat(summary.total_billed || 0),
        parseFloat(summary.total_paid || 0), parseFloat(summary.in_process || 0),
        parseFloat(summary.total_pending || 0), parseFloat(summary.total_net_payable || 0),
        parseFloat(summary.total_retention || 0), '', parseFloat(summary.total_deductions || 0),
        parseFloat(summary.total_paid || 0)],
    ];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    ws['!cols'] = headers.map((_, i) => ({ wch: i === 0 ? 14 : 16 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Cash Flow');
    XLSX.writeFile(wb, `Cash_Flow_Forecast_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  return (
    <div className="p-6 space-y-6 max-w-screen-2xl mx-auto">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center">
              <Activity className="w-4 h-4 text-indigo-600" />
            </div>
            <h1 className="text-2xl font-bold text-slate-900">Cash Flow Forecast</h1>
          </div>
          <p className="text-sm text-slate-500 pl-10">Monthly billing, payment and outstanding summary — Bill Tracker</p>
        </div>
        <button onClick={exportExcel}
          className="self-start sm:self-auto flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors shadow-sm">
          <Download className="w-4 h-4" /> Export Excel
        </button>
      </div>

      {/* ── KPI Cards ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        <KPICard
          label="Total Billed"
          value={summary.total_billed}
          sub={`${summary.total_bills || 0} bills`}
          icon={IndianRupee}
          accent={{ stripe: 'bg-slate-400', border: 'border-slate-100', text: 'text-slate-800', iconBg: 'bg-slate-100', icon: 'text-slate-600' }}
        />
        <KPICard
          label="Paid"
          value={summary.total_paid}
          sub={`${overallPct}% of total`}
          sub2={summary.paid_count ? `${summary.paid_count} bills cleared` : undefined}
          icon={CheckCircle2}
          accent={{ stripe: 'bg-emerald-500', border: 'border-emerald-100', text: 'text-emerald-700', iconBg: 'bg-emerald-50', icon: 'text-emerald-600' }}
          trend={overallPct >= 70 ? 'neutral' : 'down'}
          trendLabel={overallPct >= 70 ? 'On track' : 'Payments lagging'}
        />
        <KPICard
          label="In-Process"
          value={summary.in_process}
          sub="Stores → QS → Accounts"
          sub2={summary.in_process_count ? `${summary.in_process_count} bills` : undefined}
          icon={Clock}
          accent={{ stripe: 'bg-blue-500', border: 'border-blue-100', text: 'text-blue-700', iconBg: 'bg-blue-50', icon: 'text-blue-600' }}
        />
        <KPICard
          label="Pending"
          value={summary.total_pending}
          sub="Not yet forwarded"
          sub2={summary.pending_count ? `${summary.pending_count} bills` : undefined}
          icon={AlertCircle}
          accent={{ stripe: 'bg-amber-500', border: 'border-amber-100', text: 'text-amber-700', iconBg: 'bg-amber-50', icon: 'text-amber-600' }}
          trend={parseFloat(summary.total_pending || 0) > parseFloat(summary.total_paid || 0) ? 'up' : 'neutral'}
          trendLabel={parseFloat(summary.total_pending || 0) > parseFloat(summary.total_paid || 0) ? 'High unpaid backlog' : undefined}
        />
        <KPICard
          label="Outstanding"
          value={parseFloat(summary.total_pending || 0) + parseFloat(summary.in_process || 0)}
          sub={`Net payable: ₹${cr(summary.total_net_payable)}`}
          sub2={summary.total_retention > 0 ? `Retention: ₹${cr(summary.total_retention)}` : undefined}
          icon={TrendingDown}
          accent={{ stripe: 'bg-rose-500', border: 'border-rose-100', text: 'text-rose-700', iconBg: 'bg-rose-50', icon: 'text-rose-600' }}
        />
      </div>

      {/* ── Filters ────────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-[10.5px] text-slate-400 font-bold uppercase tracking-widest mr-1">Quick range:</span>
          {[
            { label: 'This Month', fn: thisMonth },
            { label: 'Last 3M',    fn: () => lastNMonths(3) },
            { label: 'Last 6M',    fn: () => lastNMonths(6) },
            { label: 'This FY',    fn: thisFY },
          ].map(({ label, fn }) => (
            <button key={label} onClick={() => setPreset(fn())}
              className="text-xs px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-indigo-50 hover:border-indigo-300 hover:text-indigo-700 transition-colors font-medium">
              {label}
            </button>
          ))}
          <div className="flex-1" />
          <div className="flex flex-wrap gap-2 items-center">
            <select value={projectId} onChange={e => setProjectId(e.target.value)}
              className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white">
              <option value="">All Projects</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)}
              className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-400" />
            <span className="text-slate-400 text-xs">—</span>
            <input type="date" value={toDate} onChange={e => setToDate(e.target.value)}
              className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-400" />
            {hasFilters && (
              <button onClick={clearFilters}
                className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg border border-red-200 text-red-500 hover:bg-red-50 transition-colors font-medium">
                <X className="w-3 h-3" /> Clear
              </button>
            )}
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="bg-white rounded-2xl border border-slate-100 py-20 text-center text-slate-400 text-sm animate-pulse shadow-sm">
          Loading cash flow data…
        </div>
      ) : rowsWithCumulative.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-100 py-20 text-center shadow-sm">
          <Activity className="w-10 h-10 text-slate-200 mx-auto mb-3" />
          <p className="text-slate-400 text-sm">No billing data found for the selected filters</p>
        </div>
      ) : (
        <>
          {/* ── Stacked bar chart ─────────────────────────────────────────── */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-sm font-semibold text-slate-800">Monthly Billing Breakdown</h2>
                <p className="text-[11px] text-slate-400 mt-0.5">Stacked by payment status per month</p>
              </div>
              <div className="flex items-center gap-4 text-[11px] font-medium">
                {[
                  { color: '#10b981', label: 'Paid' },
                  { color: '#3b82f6', label: 'In-Process' },
                  { color: '#f59e0b', label: 'Pending' },
                ].map(({ color, label }) => (
                  <span key={label} className="flex items-center gap-1.5 text-slate-500">
                    <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: color }} />
                    {label}
                  </span>
                ))}
              </div>
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={chartData} margin={{ top: 4, right: 8, left: 8, bottom: 4 }} barSize={chartData.length > 10 ? 18 : 28}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#94a3b8', fontWeight: 500 }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={v => `₹${cr(v)}`} tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={68} />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: '#f8fafc' }} />
                <Bar dataKey="Paid"       stackId="a" fill="#10b981" radius={[0, 0, 0, 0]} />
                <Bar dataKey="In-Process" stackId="a" fill="#3b82f6" radius={[0, 0, 0, 0]} />
                <Bar dataKey="Pending"    stackId="a" fill="#f59e0b" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* ── Table ─────────────────────────────────────────────────────── */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-slate-800">Month-wise Detail</h2>
                <p className="text-[11px] text-slate-400 mt-0.5">{rowsWithCumulative.length} months · scroll right for all columns</p>
              </div>
              <div className="flex items-center gap-2 text-[11px] text-slate-500">
                <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />Paid
                <span className="w-2 h-2 rounded-full bg-blue-400 inline-block ml-2" />In-Process
                <span className="w-2 h-2 rounded-full bg-amber-400 inline-block ml-2" />Pending
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs min-w-[900px]">
                <thead>
                  <tr className="text-[10.5px] font-semibold uppercase tracking-wider text-slate-400 bg-slate-50 border-b border-slate-100">
                    <th className="px-5 py-3 text-left">Month</th>
                    <th className="px-4 py-3 text-center">Bills</th>
                    <th className="px-4 py-3 text-right">Total Billed</th>
                    <th className="px-4 py-3 text-right">
                      <span className="inline-flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />Paid</span>
                    </th>
                    <th className="px-4 py-3 text-right">
                      <span className="inline-flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-blue-400 inline-block" />In-Process</span>
                    </th>
                    <th className="px-4 py-3 text-right">
                      <span className="inline-flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block" />Pending</span>
                    </th>
                    <th className="px-4 py-3 text-right">Deductions</th>
                    <th className="px-4 py-3 text-right">Net Payable</th>
                    <th className="px-4 py-3 text-right">Cumul. Paid</th>
                    <th className="px-4 py-3 text-left pl-5">Payment %</th>
                  </tr>
                </thead>
                <tbody>
                  {rowsWithCumulative.map((r, i) => {
                    const rowBase   = parseFloat(r.paid || 0) + parseFloat(r.in_process || 0) + parseFloat(r.pending || 0);
                    const billPct   = pct(parseFloat(r.paid || 0), rowBase);
                    const paidAmt   = parseFloat(r.paid       || 0);
                    const procAmt   = parseFloat(r.in_process || 0);
                    const pendAmt   = parseFloat(r.pending    || 0);
                    return (
                      <tr key={i} className={`border-b border-slate-50 hover:bg-slate-50/70 transition-colors ${i % 2 === 0 ? '' : 'bg-slate-50/30'}`}>
                        {/* Month */}
                        <td className="px-5 py-3">
                          <span className="font-semibold text-slate-800">{r.month_label}</span>
                        </td>
                        {/* Bills */}
                        <td className="px-4 py-3 text-center">
                          <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-slate-100 text-slate-600 font-semibold text-[11px]">
                            {r.bill_count}
                          </span>
                        </td>
                        {/* Total Billed */}
                        <td className="px-4 py-3 text-right">
                          <span className="font-semibold text-slate-800 tabular-nums">₹{inr(r.total_billed)}</span>
                        </td>
                        {/* Paid */}
                        <td className="px-4 py-3 text-right">
                          {paidAmt > 0
                            ? <span className="font-semibold text-emerald-700 tabular-nums">₹{inr(paidAmt)}</span>
                            : <span className="text-slate-300">—</span>}
                        </td>
                        {/* In-Process */}
                        <td className="px-4 py-3 text-right">
                          {procAmt > 0
                            ? <span className="text-blue-700 tabular-nums">₹{inr(procAmt)}</span>
                            : <span className="text-slate-300">—</span>}
                        </td>
                        {/* Pending */}
                        <td className="px-4 py-3 text-right">
                          {pendAmt > 0
                            ? <span className="text-amber-700 tabular-nums">₹{inr(pendAmt)}</span>
                            : <span className="text-slate-300">—</span>}
                        </td>
                        {/* Deductions */}
                        <td className="px-4 py-3 text-right">
                          {parseFloat(r.total_deductions) > 0
                            ? <span className="text-rose-600 tabular-nums">₹{inr(r.total_deductions)}</span>
                            : <span className="text-slate-300">—</span>}
                        </td>
                        {/* Net Payable */}
                        <td className="px-4 py-3 text-right">
                          {parseFloat(r.net_payable) > 0
                            ? <span className="font-medium text-indigo-700 tabular-nums">₹{inr(r.net_payable)}</span>
                            : <span className="text-slate-300">—</span>}
                        </td>
                        {/* Cumulative */}
                        <td className="px-4 py-3 text-right">
                          <span className="text-slate-600 tabular-nums font-medium">₹{inr(r.cum_paid)}</span>
                        </td>
                        {/* Payment % pill + mini bar */}
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-2">
                            <StatusPill paidPct={billPct} />
                            <div className="flex-1 max-w-[60px]">
                              {rowBase > 0 && (
                                <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden flex">
                                  <div className="bg-emerald-400 h-full" style={{ width: `${pct(paidAmt, rowBase)}%` }} />
                                  <div className="bg-blue-400 h-full"    style={{ width: `${pct(procAmt, rowBase)}%` }} />
                                  <div className="bg-amber-400 h-full"   style={{ width: `${pct(pendAmt, rowBase)}%` }} />
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-800 text-white text-[11px] font-semibold">
                    <td className="px-5 py-3 rounded-bl-none">TOTAL <span className="font-normal text-slate-400">({rowsWithCumulative.length} months)</span></td>
                    <td className="px-4 py-3 text-center">
                      <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-white/10 font-semibold text-[11px]">
                        {summary.total_bills}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">₹{inr(summary.total_billed)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-emerald-300">₹{inr(summary.total_paid)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-blue-300">₹{inr(summary.in_process)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-amber-300">₹{inr(summary.total_pending)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-rose-300">₹{inr(summary.total_deductions)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-indigo-300">₹{inr(summary.total_net_payable)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-emerald-300">₹{inr(summary.total_paid)}</td>
                    <td className="px-5 py-3">
                      <StatusPill paidPct={overallPct} />
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
