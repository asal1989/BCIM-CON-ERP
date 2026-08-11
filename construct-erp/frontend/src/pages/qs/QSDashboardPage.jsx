// src/pages/qs/QSDashboardPage.jsx — QS & Billing Dashboard
import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  FileSpreadsheet, Receipt, TrendingUp, IndianRupee,
  AlertTriangle, ArrowUpRight, CheckCircle2, Clock,
  XCircle, ShieldCheck, ArrowLeftRight, Ruler,
  BarChart3, ChevronRight, Activity, CalendarDays,
  Target, Layers, Hourglass, FileClock,
} from 'lucide-react';
import {
  ComposedChart, Bar, Area, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { boqAPI, raBillAPI, retentionAPI, variationAPI, projectAPI } from '../../api/client';
import useAuthStore from '../../store/authStore';
import { PageHeader, KpiCard as ThemeKpiCard, Theme } from '../../theme';
import dayjs from 'dayjs';
import { clsx } from 'clsx';

// ── helpers ──────────────────────────────────────────────────────────────────
const fmt = (n) =>
  n == null || isNaN(n) ? '—'
  : `₹${Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const crore = (n) => {
  if (n == null || isNaN(n)) return '—';
  const v = Number(n);
  if (Math.abs(v) >= 1e7) return `₹${(v / 1e7).toFixed(2)} Cr`;
  if (Math.abs(v) >= 1e5) return `₹${(v / 1e5).toFixed(2)} L`;
  return `₹${v.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
};

const pct = (a, b) => (b ? Math.min(100, Math.round((Number(a) / Number(b)) * 100)) : 0);

// Keys match the real ra_bills.status values (draft/submitted/verified/certified/paid/rejected) —
// previously used 'pending'/'approved', which never occur, so the Bill Status Breakdown
// widget silently fell back to gray for submitted + certified bills.
const STATUS_COLORS = {
  draft:     { bg: 'bg-slate-100',   text: 'text-slate-600',   bar: '#94A3B8' },
  submitted: { bg: 'bg-amber-50',    text: 'text-amber-700',   bar: '#F59E0B' },
  verified:  { bg: 'bg-blue-50',     text: 'text-blue-700',    bar: '#3B82F6' },
  certified: { bg: 'bg-emerald-50',  text: 'text-emerald-700', bar: '#10B981' },
  paid:      { bg: 'bg-green-100',   text: 'text-green-800',   bar: '#16A34A' },
  rejected:  { bg: 'bg-red-50',      text: 'text-red-600',     bar: '#EF4444' },
};

function SectionTitle({ icon: Icon, title, subtitle, action }) {
  return (
    <div className="flex items-center justify-between mb-4">
      <div className="flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-xl bg-emerald-50 flex items-center justify-center">
          <Icon className="w-4 h-4 text-emerald-600" />
        </div>
        <div>
          <h2 className="text-sm font-bold text-black leading-tight">{title}</h2>
          {subtitle && <p className="text-[10px] text-slate-400 uppercase tracking-wider">{subtitle}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}

function StatBar({ label, value, total, color, sub }) {
  const w = total > 0 ? Math.min(100, Math.round((value / total) * 100)) : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-slate-500 w-24 truncate">{label}</span>
      <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${w}%`, background: color }} />
      </div>
      <span className="text-xs font-semibold text-slate-700 w-5 text-right">{value}</span>
      {sub && <span className="text-[10px] text-slate-400 w-16 text-right truncate">{sub}</span>}
    </div>
  );
}

function ProgressPanel({ label, value, max, color, left, right }) {
  const w = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">{label}</span>
        <span className="text-base font-bold" style={{ color }}>{Math.round(w)}%</span>
      </div>
      <div className="h-3 w-full bg-slate-100 rounded-full overflow-hidden mb-3">
        <div className="h-full rounded-full transition-all" style={{ width: `${w}%`, background: color }} />
      </div>
      <div className="flex items-center justify-between text-[10px] text-slate-400">
        <span>{left}</span>
        <span>{right}</span>
      </div>
    </div>
  );
}

// Donut chart (pure SVG)
function DonutChart({ segments, size = 100, stroke = 22 }) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  let offset = 0;
  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#F1F5F9" strokeWidth={stroke - 2} />
      {segments.map((seg, i) => {
        const dash = (seg.value / total) * circ;
        const gap  = circ - dash;
        const el = (
          <circle key={i} cx={size/2} cy={size/2} r={r} fill="none"
            stroke={seg.color} strokeWidth={stroke - 2}
            strokeDasharray={`${dash} ${gap}`} strokeDashoffset={-offset} strokeLinecap="butt" />
        );
        offset += dash;
        return el;
      })}
    </svg>
  );
}

export default function QSDashboardPage() {
  const { user } = useAuthStore();
  const now = dayjs();

  // ── Data fetching ────────────────────────────────────────────────────────
  const { data: raBills = [],    isLoading: loadingBills }     = useQuery({ queryKey: ['ra-bills'],     queryFn: () => raBillAPI.list().then(r => r.data?.data || []) });
  const { data: boqItems = [],   isLoading: loadingBOQ }       = useQuery({ queryKey: ['boq-all'],      queryFn: () => boqAPI.list().then(r => r.data?.data || []) });
  const { data: retentions = [],  isLoading: loadingRetention } = useQuery({ queryKey: ['retentions'],   queryFn: () => retentionAPI.list().then(r => r.data?.data || []) });
  const { data: variations = [],  isLoading: loadingVariations }= useQuery({ queryKey: ['variations'],   queryFn: () => variationAPI.list().then(r => r.data?.data || []) });
  const { data: projects = [] }  = useQuery({ queryKey: ['projects'], queryFn: () => projectAPI.list().then(r => { const d = r.data; return Array.isArray(d) ? d : d?.data || []; }) });
  // Portfolio-wide contract value / billed / certified / balance-to-complete + monthly certified trend
  const { data: summary }        = useQuery({ queryKey: ['ra-bill-summary', ''], queryFn: () => raBillAPI.summary().then(r => r.data?.data) });

  // ── Derived KPIs ─────────────────────────────────────────────────────────
  const kpi = useMemo(() => {
    const contractValue      = boqItems.reduce((s, i) => s + Number(i.quantity || 0) * Number(i.rate || 0), 0);
    const totalBilled        = raBills.reduce((s, b) => s + Number(b.gross_amount || b.total_amount || 0), 0);
    // Net payable (post-GST, post-deductions) is what's actually due from the client —
    // comparing amount_received against gross_amount instead double-subtracts GST/
    // deductions and inflates "outstanding" by amounts that were never collectible.
    const totalNetPayable    = raBills.reduce((s, b) => s + Number(b.net_payable ?? b.gross_amount ?? b.total_amount ?? 0), 0);
    const totalReceived      = raBills.reduce((s, b) => s + Number(b.amount_received || 0), 0);
    const outstanding        = totalNetPayable - totalReceived;
    // Retention "held" is the money actually withheld on RA bills (a per-bill deduction),
    // not the retention-release request records — those are only created when retention is
    // being released back, so that table is empty until a release is raised. Sum the
    // retention_amount on every non-draft/non-rejected bill.
    const retentionFromBills = raBills
      .filter(b => !['draft', 'rejected'].includes(b.status))
      .reduce((s, b) => s + Number(b.retention_amount || 0), 0);
    const retentionReleased  = retentions.filter(r => r.status === 'released').reduce((s, r) => s + Number(r.retention_amount || 0), 0);
    const retentionHeld      = retentionFromBills - retentionReleased;
    const retentionBillCount = raBills.filter(b => !['draft', 'rejected'].includes(b.status) && Number(b.retention_amount || 0) > 0).length;
    // variation_orders stores the amount in `total_variation_amount` (not `total_amount`).
    const variationsApproved = variations.filter(v => v.status === 'approved').reduce((s, v) => s + Number(v.total_variation_amount || 0), 0);

    const statusBuckets = {};
    for (const b of raBills) {
      const s = b.status || 'pending';
      if (!statusBuckets[s]) statusBuckets[s] = { count: 0, amount: 0 };
      statusBuckets[s].count++;
      statusBuckets[s].amount += Number(b.gross_amount || b.total_amount || 0);
    }

    const byProject = {};
    for (const b of raBills) {
      const pid  = b.project_id;
      const name = b.project_name || 'Unknown';
      if (!byProject[pid]) byProject[pid] = { name, billed: 0, received: 0, count: 0 };
      byProject[pid].billed   += Number(b.gross_amount || b.total_amount || 0);
      byProject[pid].received += Number(b.amount_received || 0);
      byProject[pid].count++;
    }

    return {
      contractValue, totalBilled, totalNetPayable, totalReceived, outstanding,
      retentionHeld, retentionBillCount, variationsApproved,
      statusBuckets, byProject,
      billingProgress: pct(totalBilled, contractValue),
      collectionRate:  pct(totalReceived, totalNetPayable),
    };
  }, [raBills, boqItems, retentions, variations]);

  // ── This month ──────────────────────────────────────────────────────────
  const billsThisMonth    = raBills.filter(b => dayjs(b.bill_date || b.created_at).isSame(now, 'month'));
  const paidThisMonth     = raBills.filter(b => b.status === 'paid' && dayjs(b.updated_at).isSame(now, 'month'));
  // Approval funnel: submitted → needs QS verify; verified → needs PM certify
  const pendingRaBills    = raBills.filter(b => b.status === 'submitted');
  const pendingApproval   = raBills.filter(b => b.status === 'verified');
  const billedThisMonth   = billsThisMonth.reduce((s, b) => s + Number(b.gross_amount || b.total_amount || 0), 0);
  const receivedThisMonth = billsThisMonth.reduce((s, b) => s + Number(b.amount_received || 0), 0);

  // ── Cash Flow (billed vs received per month, last 12 months) ────────────
  const cashFlowData = useMemo(() => {
    const months = Array.from({ length: 12 }, (_, i) => now.subtract(11 - i, 'month'));
    const billedMap = {}, receivedMap = {};
    raBills.filter(b => !['draft', 'rejected'].includes(b.status)).forEach(b => {
      const key = dayjs(b.bill_date || b.created_at).format('YYYY-MM');
      billedMap[key]   = (billedMap[key]   || 0) + Number(b.gross_amount || b.total_amount || 0);
      receivedMap[key] = (receivedMap[key] || 0) + Number(b.amount_received || 0);
    });
    return months.map(m => {
      const key = m.format('YYYY-MM');
      return { label: m.format('MMM YY'), billed: billedMap[key] || 0, received: receivedMap[key] || 0 };
    });
  }, [raBills, now]);

  // ── Billing Timeline (certified value per month, from the summary endpoint) ──
  const billingTimeline = useMemo(() => (summary?.trend || []).map(t => {
    const [y, m] = t.month.split('-');
    return { label: dayjs(`${y}-${m}-01`).format('MMM YY'), value: t.value };
  }), [summary]);

  const contractVal   = summary?.kpis?.total_contract_value ?? 0;
  const certifiedVal  = summary?.kpis?.certified_to_date ?? 0;
  const billedToDate  = summary?.kpis?.billed_to_date ?? 0;
  const balanceToComplete = summary?.kpis?.balance_to_complete ?? 0;
  const projectProgressPct = contractVal > 0 ? Math.round((certifiedVal / contractVal) * 1000) / 10 : 0;

  // ── Recent + sorted data ─────────────────────────────────────────────────
  const recentBills  = useMemo(() =>
    [...raBills].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 8), [raBills]);
  const projectRows  = Object.values(kpi.byProject).sort((a, b) => b.billed - a.billed).slice(0, 6);
  const donutSegments = Object.entries(kpi.statusBuckets).map(([s, d]) => ({ label: s, value: d.count, color: STATUS_COLORS[s]?.bar || '#94A3B8' }));

  return (
    <div style={{ background: Theme.pageBg, minHeight: '100vh' }}>

      <PageHeader
        title="QS & Billing Dashboard"
        subtitle="Contract billing, collections & certification overview"
        breadcrumbs={[{ label: 'QS & Billing' }, { label: 'Dashboard' }]}
        actions={
          <>
            <Link to="/qs/ra-bills/new"
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-lg transition shadow-sm"
              style={{ background: '#fff', color: Theme.navyDark }}>
              <Receipt className="w-3.5 h-3.5" /> New RA Bill
            </Link>
            <Link to="/qs/boq"
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg transition"
              style={{ background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.25)', color: '#fff' }}>
              <FileSpreadsheet className="w-3.5 h-3.5" /> BOQ
            </Link>
          </>
        }
      />

      <div className="p-5 md:p-6 max-w-[1400px] mx-auto space-y-5">

        {/* ── KPI Row 1 — value & collections ── */}
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
          <ThemeKpiCard icon={FileSpreadsheet} label="Contract Value"      value={crore(contractVal)}            color="blue"    sub={`${projects.length} projects`} />
          <ThemeKpiCard icon={CheckCircle2}    label="Certified Value"     value={crore(certifiedVal)}           color="teal"    sub={`${projectProgressPct}% of contract`} />
          <ThemeKpiCard icon={Receipt}         label="Total Billed"        value={crore(billedToDate)}           color="emerald" sub={`${raBills.length} RA bills`} />
          <ThemeKpiCard icon={IndianRupee}     label="Amount Received"     value={crore(kpi.totalReceived)}      color="purple"  sub={`${kpi.collectionRate}% collected`} />
          <ThemeKpiCard icon={AlertTriangle}   label="Outstanding"         value={crore(kpi.outstanding)}        color="amber"   sub="Pending collection" />
          <ThemeKpiCard icon={CalendarDays}    label="Current Month Billing" value={crore(billedThisMonth)}      color="indigo"  sub={now.format('MMM YYYY')} />
        </div>

        {/* ── KPI Row 2 — pipeline & progress ── */}
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
          <ThemeKpiCard icon={FileClock}       label="Pending RA Bills"    value={pendingRaBills.length}          color="amber"   sub="Awaiting QS verification" />
          <ThemeKpiCard icon={Hourglass}       label="Pending Approvals"   value={pendingApproval.length}         color="blue"    sub="Awaiting PM certification" />
          <ThemeKpiCard icon={ShieldCheck}     label="Retention Held"      value={crore(kpi.retentionHeld)}       color="purple"  sub={`${kpi.retentionBillCount} bill${kpi.retentionBillCount !== 1 ? 's' : ''}`} />
          <ThemeKpiCard icon={ArrowLeftRight}  label="Variations"          value={crore(kpi.variationsApproved)}  color="orange"  sub={`${variations.filter(v => v.status === 'approved').length} approved`} />
          <ThemeKpiCard icon={Target}          label="Project Progress"    value={`${projectProgressPct}%`}       color="emerald" sub="Certified / contract value" />
          <ThemeKpiCard icon={Layers}          label="Balance to Complete" value={crore(balanceToComplete)}       color="slate"   sub="Contract − certified" />
        </div>

        {/* ── Alert banners ── */}
        {(kpi.outstanding > 0 || pendingApproval.length > 0) && (
          <div className="flex flex-col gap-2">
            {kpi.outstanding > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-center gap-3">
                <AlertTriangle size={15} className="text-amber-600 flex-shrink-0" />
                <span className="text-sm font-medium text-amber-800">
                  {fmt(kpi.outstanding)} outstanding — {Math.round(100 - kpi.collectionRate)}% of billed amount pending collection
                </span>
                <Link to="/qs/ra-bills" className="ml-auto text-xs font-semibold text-amber-700 underline whitespace-nowrap">View Bills →</Link>
              </div>
            )}
            {pendingApproval.length > 0 && (
              <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 flex items-center gap-3">
                <Clock size={15} className="text-blue-600 flex-shrink-0" />
                <span className="text-sm font-medium text-blue-800">
                  {pendingApproval.length} RA bill{pendingApproval.length > 1 ? 's' : ''} pending approval
                </span>
                <Link to="/qs/ra-bills" className="ml-auto text-xs font-semibold text-blue-700 underline whitespace-nowrap">Review →</Link>
              </div>
            )}
          </div>
        )}

        {/* ── Progress panels + This Month ── */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <ProgressPanel
            label="Billing Progress"
            value={billedToDate} max={contractVal}
            color="#10B981"
            left={`Billed: ${fmt(billedToDate)}`}
            right={`Contract: ${fmt(contractVal)}`}
          />
          <ProgressPanel
            label="Collection Rate"
            value={kpi.totalReceived} max={kpi.totalBilled}
            color="#3B82F6"
            left={`Received: ${fmt(kpi.totalReceived)}`}
            right={`Billed: ${fmt(kpi.totalBilled)}`}
          />
          {/* This Month mini-summary */}
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <CalendarDays size={14} className="text-emerald-600" />
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">This Month</span>
              <span className="ml-auto text-[10px] text-slate-400">{now.format('MMM YYYY')}</span>
            </div>
            <div className="space-y-2.5">
              {[
                { label: 'New Bills',      value: billsThisMonth.length,    fmt: false },
                { label: 'Amount Billed',  value: fmt(billedThisMonth),     fmt: true  },
                { label: 'Received',       value: fmt(receivedThisMonth),   fmt: true  },
                { label: 'Bills Paid',     value: paidThisMonth.length,     fmt: false },
              ].map(({ label, value }) => (
                <div key={label} className="flex items-center justify-between border-b border-slate-50 pb-2 last:border-0 last:pb-0">
                  <span className="text-xs text-slate-500">{label}</span>
                  <span className="text-sm font-bold text-black">{value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Budget vs Actual ── */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <SectionTitle icon={Target} title="Budget vs. Actual" subtitle="Contract value · Billed · Certified · Balance to complete"
            action={<Link to="/qs/ra-bills/summary" className="flex items-center gap-1 text-[10px] font-semibold text-emerald-600 hover:text-emerald-700">Full Summary <ChevronRight className="w-3 h-3" /></Link>}
          />
          <div className="relative h-8 w-full bg-slate-100 rounded-full overflow-hidden">
            <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${contractVal > 0 ? Math.min(100, (billedToDate / contractVal) * 100) : 0}%`, background: '#BFDBFE' }} />
            <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${contractVal > 0 ? Math.min(100, (certifiedVal / contractVal) * 100) : 0}%`, background: '#10B981' }} />
          </div>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 mt-3">
            <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-slate-300" /><span className="text-[11px] text-slate-500">Contract: <b className="text-black">{fmt(contractVal)}</b></span></div>
            <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full" style={{ background: '#BFDBFE' }} /><span className="text-[11px] text-slate-500">Billed: <b className="text-black">{fmt(billedToDate)}</b></span></div>
            <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /><span className="text-[11px] text-slate-500">Certified: <b className="text-black">{fmt(certifiedVal)}</b></span></div>
            <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-amber-400" /><span className="text-[11px] text-slate-500">Balance to Complete: <b className="text-black">{fmt(balanceToComplete)}</b></span></div>
          </div>
        </div>

        {/* ── Cash Flow + Billing Timeline ── */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
            <SectionTitle icon={Activity} title="Cash Flow" subtitle="Billed vs. received, last 12 months" />
            <div style={{ width: '100%', height: 220 }}>
              <ResponsiveContainer>
                <ComposedChart data={cashFlowData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eef1f6" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={v => `₹${(v / 1e5).toFixed(0)}L`} width={45} />
                  <Tooltip formatter={(v, n) => [fmt(v), n]} labelStyle={{ fontSize: 11 }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="billed" name="Billed" fill="#93C5FD" radius={[4, 4, 0, 0]} />
                  <Line type="monotone" dataKey="received" name="Received" stroke="#059669" strokeWidth={2.5} dot={{ r: 3, fill: '#fff', stroke: '#059669', strokeWidth: 2 }} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
            <SectionTitle icon={TrendingUp} title="Billing Timeline" subtitle="Certified value, last 12 months" />
            {billingTimeline.length === 0 ? (
              <div className="py-16 text-center text-xs text-slate-400">No certified bills yet</div>
            ) : (
              <div style={{ width: '100%', height: 220 }}>
                <ResponsiveContainer>
                  <ComposedChart data={billingTimeline} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="qsBillingTimelineFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#1a3a6b" stopOpacity={0.28} />
                        <stop offset="100%" stopColor="#1a3a6b" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#eef1f6" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={v => `₹${(v / 1e5).toFixed(0)}L`} width={45} />
                    <Tooltip formatter={v => [fmt(v), 'Certified']} labelStyle={{ fontSize: 11 }} />
                    <Area type="monotone" dataKey="value" stroke="#1a3a6b" strokeWidth={2.5} fill="url(#qsBillingTimelineFill)" dot={{ r: 3, fill: '#fff', stroke: '#1a3a6b', strokeWidth: 2 }} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </div>

        {/* ── Main Grid: Bill Status + Project Billing ── */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">

          {/* Bill Status Breakdown */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
            <SectionTitle icon={Receipt} title="Bill Status Breakdown" subtitle={`${raBills.length} total bills`} />
            <div className="flex items-center gap-5 mb-4">
              <div className="relative flex-shrink-0">
                {donutSegments.length > 0
                  ? <DonutChart segments={donutSegments} size={110} stroke={24} />
                  : <div className="w-[110px] h-[110px] rounded-full border-[22px] border-slate-100" />
                }
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className="text-lg font-bold text-slate-900">{raBills.length}</span>
                  <span className="text-[9px] text-slate-400 font-semibold uppercase">Bills</span>
                </div>
              </div>
              <div className="flex-1 space-y-2">
                {Object.entries(kpi.statusBuckets).map(([status, d]) => (
                  <div key={status} className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                        style={{ background: STATUS_COLORS[status]?.bar || '#94A3B8' }} />
                      <span className="text-[11px] font-medium text-slate-600 capitalize truncate">{status}</span>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="text-[10px] text-slate-400">{fmt(d.amount)}</span>
                      <span className="text-xs font-bold text-black w-4 text-right">{d.count}</span>
                    </div>
                  </div>
                ))}
                {Object.keys(kpi.statusBuckets).length === 0 && (
                  <p className="text-xs text-slate-400 text-center py-4">No bills yet</p>
                )}
              </div>
            </div>
            {/* Status bars */}
            {Object.keys(kpi.statusBuckets).length > 0 && (
              <div className="space-y-1.5 pt-3 border-t border-slate-100">
                {Object.entries(kpi.statusBuckets).map(([status, d]) => (
                  <StatBar
                    key={status}
                    label={status}
                    value={d.count}
                    total={raBills.length}
                    color={STATUS_COLORS[status]?.bar || '#94A3B8'}
                    sub={fmt(d.amount)}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Project-wise Billing */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm xl:col-span-2">
            <SectionTitle icon={TrendingUp} title="Project-wise Billing"
              subtitle={`${projects.length} projects`}
              action={
                <Link to="/qs/ra-bills" className="flex items-center gap-1 text-[10px] font-semibold text-emerald-600 hover:text-emerald-700">
                  View All <ChevronRight className="w-3 h-3" />
                </Link>
              }
            />
            {projectRows.length === 0 ? (
              <div className="py-10 text-center text-xs text-slate-400">No billing data available</div>
            ) : (
              <div className="space-y-4">
                {projectRows.map((p) => (
                  <div key={p.name}>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs font-semibold text-slate-700 truncate max-w-[55%]">{p.name}</span>
                      <div className="flex items-center gap-3 text-[10px] flex-shrink-0">
                        <span className="text-slate-400">Rcvd: <span className="font-bold text-emerald-600">{fmt(p.received)}</span></span>
                        <span className="text-slate-400">Billed: <span className="font-bold text-slate-700">{fmt(p.billed)}</span></span>
                        <span className="bg-slate-100 px-1.5 py-0.5 rounded-full font-semibold text-slate-500 text-[10px]">{p.count} bill{p.count !== 1 ? 's' : ''}</span>
                      </div>
                    </div>
                    <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all bg-emerald-400"
                        style={{ width: `${p.billed > 0 ? Math.min(100, (p.received / p.billed) * 100) : 0}%` }} />
                    </div>
                    <div className="flex justify-between mt-1 text-[9px] text-slate-400">
                      <span>{pct(p.received, p.billed)}% collected</span>
                      <span>{pct(p.billed - p.received, p.billed)}% outstanding</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Recent RA Bills table ── */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-5 pb-0">
            <SectionTitle icon={Receipt} title="Recent RA Bills"
              subtitle="Latest billing activity"
              action={
                <Link to="/qs/ra-bills" className="flex items-center gap-1 text-[10px] font-semibold text-emerald-600 hover:text-emerald-700">
                  All Bills <ChevronRight className="w-3 h-3" />
                </Link>
              }
            />
          </div>
          {loadingBills ? (
            <div className="p-5 space-y-2">{[1,2,3,4].map(n => <div key={n} className="h-10 bg-slate-100 rounded-xl animate-pulse" />)}</div>
          ) : recentBills.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-400">
              No RA bills found — <Link to="/qs/ra-bills/new" className="text-emerald-600 font-semibold">create your first bill</Link>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-y border-slate-100">
                    {['Bill No.', 'Project', 'Date', 'Gross Amt', 'Received', 'Outstanding', 'Status', ''].map(h => (
                      <th key={h} className={`px-4 py-2.5 text-[10px] font-bold uppercase tracking-widest text-slate-400 ${h === '' ? '' : 'text-left'}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {recentBills.map(bill => {
                    const gross = Number(bill.gross_amount || bill.total_amount || 0);
                    const rcvd  = Number(bill.amount_received || 0);
                    const due   = gross - rcvd;
                    return (
                      <tr key={bill.id} className="hover:bg-slate-50 transition-colors group">
                        <td className="px-4 py-3">
                          <span className="text-xs font-bold text-indigo-700">{bill.bill_number || `#${String(bill.id).slice(-6)}`}</span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-xs text-slate-700 font-medium truncate max-w-[180px] block">{bill.project_name || '—'}</span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-xs text-slate-500">{bill.bill_date ? dayjs(bill.bill_date).format('DD MMM YY') : '—'}</span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-xs font-semibold text-black">{fmt(gross)}</span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-xs font-semibold text-emerald-600">{fmt(rcvd)}</span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={clsx('text-xs font-semibold', due > 0 ? 'text-amber-600' : 'text-slate-400')}>{due > 0 ? fmt(due) : '—'}</span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={clsx('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider',
                            STATUS_COLORS[bill.status || 'pending']?.bg, STATUS_COLORS[bill.status || 'pending']?.text)}>
                            {bill.status || 'pending'}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <Link to={`/qs/ra-bills/${bill.id}`}
                            className="opacity-0 group-hover:opacity-100 flex items-center gap-1 text-[10px] text-emerald-600 font-semibold transition-opacity">
                            View <ArrowUpRight className="w-3 h-3" />
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ── Variations + Retentions ── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
            <SectionTitle icon={ArrowLeftRight} title="Variation Orders"
              subtitle={`${variations.length} total`}
              action={<Link to="/qs/variations" className="flex items-center gap-1 text-[10px] font-semibold text-emerald-600 hover:text-emerald-700">View All <ChevronRight className="w-3 h-3" /></Link>}
            />
            {loadingVariations ? (
              <div className="space-y-2">{[1,2,3].map(n=><div key={n} className="h-8 bg-slate-100 rounded-lg animate-pulse" />)}</div>
            ) : variations.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-400">No variation orders</div>
            ) : (
              <div className="space-y-2.5">
                {variations.slice(0, 5).map(v => (
                  <div key={v.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-black truncate">{v.vo_number || v.description?.slice(0,40) || 'Variation'}</p>
                      <p className="text-[10px] text-slate-400">{v.project_name || '—'}</p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                      <span className="text-xs font-bold text-black">{fmt(v.total_variation_amount)}</span>
                      <span className={clsx('px-2 py-0.5 rounded-full text-[9px] font-bold uppercase',
                        v.status === 'approved' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700')}>
                        {v.status || 'pending'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
            <SectionTitle icon={ShieldCheck} title="Retention Status"
              subtitle={`${retentions.length} contracts`}
              action={<Link to="/qs/retention-releases" className="flex items-center gap-1 text-[10px] font-semibold text-emerald-600 hover:text-emerald-700">View All <ChevronRight className="w-3 h-3" /></Link>}
            />
            {loadingRetention ? (
              <div className="space-y-2">{[1,2,3].map(n=><div key={n} className="h-8 bg-slate-100 rounded-lg animate-pulse" />)}</div>
            ) : retentions.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-400">No retention records</div>
            ) : (
              <div className="space-y-2.5">
                {retentions.slice(0, 5).map(r => (
                  <div key={r.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-black truncate">{r.contractor_name || r.project_name || 'Retention'}</p>
                      <p className="text-[10px] text-slate-400">{r.project_name || '—'}</p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                      <span className="text-xs font-bold text-violet-700">{fmt(r.retention_amount)}</span>
                      <span className={clsx('px-2 py-0.5 rounded-full text-[9px] font-bold uppercase',
                        r.status === 'released' ? 'bg-green-100 text-green-700'  :
                        r.status === 'approved' ? 'bg-blue-100 text-blue-700'   :
                        'bg-violet-100 text-violet-700')}>
                        {r.status || 'pending'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
