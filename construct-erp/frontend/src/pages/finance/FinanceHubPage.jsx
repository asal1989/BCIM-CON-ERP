import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, Link } from 'react-router-dom';
import {
  FileText, CreditCard, Wallet, AlertTriangle, CheckCircle2,
  Clock, IndianRupee, TrendingUp, BarChart3, PieChart, Receipt,
  Banknote, BookOpen, ShieldCheck, ArrowRight, Plus, RefreshCw,
  ClipboardList, LineChart, Calendar, Building2,
} from 'lucide-react';
import { financeAPI, invoiceAPI, tqsBillsAPI } from '../../api/client';
import dayjs from 'dayjs';
import toast from 'react-hot-toast';

// ── Helpers ───────────────────────────────────────────────────────────────────
const inrFmt = v => {
  const n = Number(v || 0);
  return `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};
const fmt = d => d ? dayjs(d).format('DD MMM YYYY') : '—';
const today = dayjs().format('DD MMM YYYY');

// ── KPI Card ──────────────────────────────────────────────────────────────────
function KPICard({ label, value, count, color = 'text-black', icon: Icon, iconBg, to }) {
  const body = (
    <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm hover:shadow-md transition-shadow h-full">
      <div className="flex items-start justify-between mb-3">
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${iconBg}`}>
          <Icon className="w-4 h-4" />
        </div>
        {count !== undefined && (
          <span className="text-[10px] font-medium text-slate-900 font-medium bg-slate-100 px-2 py-0.5 rounded-full">{count} bills</span>
        )}
      </div>
      <p className="text-[11px] font-medium text-slate-900 font-medium uppercase tracking-wide">{label}</p>
      <p className={`text-[1.35rem] font-medium mt-0.5 ${color}`}>{inrFmt(value)}</p>
    </div>
  );
  return to ? <Link to={to} className="block">{body}</Link> : body;
}

// ── AP Aging Bar ──────────────────────────────────────────────────────────────
function AgingBar({ label, value, total, color }) {
  const w = total > 0 ? Math.min(100, (value / total) * 100) : 0;
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="font-medium text-slate-600">{label}</span>
        <span className="font-medium text-black">{inrFmt(value)}</span>
      </div>
      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${w}%` }} />
      </div>
    </div>
  );
}

// ── Quick Link ────────────────────────────────────────────────────────────────
function QuickLink({ to, icon: Icon, label, color }) {
  return (
    <Link to={to} className="flex items-center gap-2.5 p-2.5 rounded-xl hover:bg-slate-50 border border-transparent hover:border-slate-200 transition-all group">
      <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${color}`}>
        <Icon className="w-3.5 h-3.5" />
      </div>
      <span className="text-xs font-medium text-slate-900 group-hover:text-slate-900">{label}</span>
      <ArrowRight className="w-3 h-3 text-slate-300 group-hover:text-slate-900 font-medium ml-auto" />
    </Link>
  );
}

// ── Payment mode badge ────────────────────────────────────────────────────────
const MODE_COLORS = {
  bank_transfer: 'bg-blue-50 text-blue-700',
  cheque:        'bg-amber-50 text-amber-700',
  upi:           'bg-violet-50 text-violet-700',
  cash:          'bg-emerald-50 text-emerald-700',
};

export default function FinanceHubPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: summary, isLoading: loadSummary, refetch } = useQuery({
    queryKey: ['finance-summary'],
    queryFn: () => financeAPI.summary().then(r => r.data),
    staleTime: 60_000,
  });

  const { data: agingRaw = [], isLoading: loadAging } = useQuery({
    queryKey: ['tqs-ap-aging-hub'],
    queryFn: () => tqsBillsAPI.getAPAging({}).then(r => {
      const rows = r.data?.data ?? [];
      const buckets = { '0-30': 0, '31-60': 0, '61-90': 0, '90+': 0, unscheduled: 0 };
      rows.forEach(r => { buckets[r.aging_bucket] = (buckets[r.aging_bucket] || 0) + parseFloat(r.balance || 0); });
      return buckets;
    }),
    staleTime: 60_000,
  });

  const { data: pendingAuth = [] } = useQuery({
    queryKey: ['invoices-authorized'],
    queryFn: () => invoiceAPI.list({ status: 'authorized' }).then(r => r.data?.data ?? []).catch(() => []),
    staleTime: 60_000,
  });

  const authorizeMutation = useMutation({
    mutationFn: (id) => invoiceAPI.authorize(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['finance-summary'] });
      qc.invalidateQueries({ queryKey: ['invoices-authorized'] });
      toast.success('Invoice authorized');
    },
    onError: (e) => toast.error(e?.response?.data?.error || 'Failed'),
  });

  const aging = agingRaw || {};
  const agingTotal = Object.values(aging).reduce((s, v) => s + v, 0);
  const recentPayments = summary?.recent_payments ?? [];

  return (
    <div className="p-5 space-y-5 max-w-screen-2xl mx-auto bg-slate-50 min-h-screen">
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] font-medium uppercase tracking-widest text-emerald-600 bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded-full">Finance</span>
            <span className="text-[10px] text-slate-400">{today}</span>
          </div>
          <h1 className="text-2xl font-medium text-slate-900">Finance Dashboard</h1>
          <p className="text-sm text-slate-900 font-medium mt-0.5">Live overview of payables, collections, and cash position</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => refetch()}
            className="p-2 rounded-xl border border-slate-200 bg-white text-slate-900 font-medium hover:text-slate-900 hover:bg-slate-50 transition-colors">
            <RefreshCw className="w-4 h-4" />
          </button>
          <button onClick={() => navigate('/finance/invoices/booking')}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white border border-slate-200 text-slate-900 text-xs font-medium hover:bg-slate-50 transition-colors shadow-sm">
            <Plus className="w-3.5 h-3.5" /> New Invoice
          </button>
          <button onClick={() => navigate('/finance/payments')}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium transition-colors shadow-sm">
            <CreditCard className="w-3.5 h-3.5" /> Record Payment
          </button>
        </div>
      </div>

      {/* ── KPI Row ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <KPICard
          label="Pending Audit"
          value={summary?.pending_amount}
          count={summary?.pending_count}
          icon={Clock}
          iconBg="bg-amber-50 text-amber-600"
          color="text-amber-700"
          to="/finance/invoices?status=pending"
        />
        <KPICard
          label="Ready to Pay"
          value={summary?.authorized_amount}
          count={summary?.authorized_count}
          icon={CheckCircle2}
          iconBg="bg-emerald-50 text-emerald-600"
          color="text-emerald-700"
          to="/finance/payment-run"
        />
        <KPICard
          label="Overdue"
          value={summary?.overdue_amount}
          count={summary?.overdue_count}
          icon={AlertTriangle}
          iconBg="bg-red-50 text-red-500"
          color="text-red-600"
          to="/finance/invoices?status=pending"
        />
        <KPICard
          label="Paid This Month"
          value={summary?.paid_this_month}
          count={summary?.paid_this_month_count}
          icon={IndianRupee}
          iconBg="bg-blue-50 text-blue-600"
          color="text-blue-700"
          to="/finance/payments"
        />
        <KPICard
          label="DQS Outstanding"
          value={summary?.tqs_outstanding}
          icon={FileText}
          iconBg="bg-indigo-50 text-indigo-600"
          color="text-indigo-700"
          to="/tqs/liability-register"
        />
      </div>

      {/* ── Body: 2 columns ── */}
      <div className="grid grid-cols-1 xl:grid-cols-5 gap-4">

        {/* ── Left col (3/5) ── */}
        <div className="xl:col-span-3 space-y-4">

          {/* AP Aging */}
          <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-medium text-slate-900">AP Aging — DQS Bills Outstanding</h2>
              <Link to="/finance/accounts-dashboard" className="text-[10px] font-medium text-emerald-600 hover:underline flex items-center gap-1">
                View Full <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
            {loadAging ? (
              <div className="h-20 flex items-center justify-center text-slate-900 font-medium text-sm animate-pulse">Loading aging data…</div>
            ) : (
              <div className="space-y-3">
                <AgingBar label="Current (0–30 days)"  value={aging['0-30']}       total={agingTotal} color="bg-emerald-400" />
                <AgingBar label="31–60 days"           value={aging['31-60']}      total={agingTotal} color="bg-amber-400" />
                <AgingBar label="61–90 days"           value={aging['61-90']}      total={agingTotal} color="bg-orange-500" />
                <AgingBar label="90+ days overdue"     value={aging['90+']}        total={agingTotal} color="bg-red-500" />
                <AgingBar label="No due date"          value={aging['unscheduled']}total={agingTotal} color="bg-slate-300" />
                <div className="pt-2 border-t border-slate-100 flex justify-between text-xs">
                  <span className="text-slate-900 font-medium font-medium">Total Outstanding</span>
                  <span className="font-medium text-slate-900">{inrFmt(agingTotal)}</span>
                </div>
              </div>
            )}
          </div>

          {/* Pending Authorizations */}
          <div className="bg-white border border-slate-100 rounded-2xl overflow-hidden shadow-sm">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100">
              <h2 className="text-sm font-medium text-slate-900">Pending Authorizations</h2>
              <Link to="/finance/invoices?status=authorized" className="text-[10px] font-medium text-emerald-600 hover:underline flex items-center gap-1">
                View All <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
            {pendingAuth.length === 0 ? (
              <div className="py-10 text-center text-slate-900 font-medium text-sm">
                <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-emerald-300" />
                All invoices authorized
              </div>
            ) : (
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-slate-50 text-slate-900 font-medium text-[10px] font-medium uppercase tracking-wide">
                    <th className="px-4 py-2.5 text-left">Invoice / Vendor</th>
                    <th className="px-4 py-2.5 text-left">Date</th>
                    <th className="px-4 py-2.5 text-right">Amount</th>
                    <th className="px-4 py-2.5 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {pendingAuth.slice(0, 6).map(inv => (
                    <tr key={inv.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-2.5">
                        <div className="font-mono font-medium text-slate-900 font-medium text-[11px]">{inv.invoice_number}</div>
                        <div className="text-slate-900 font-medium text-[10px] truncate max-w-[160px]">{inv.vendor_name}</div>
                      </td>
                      <td className="px-4 py-2.5 text-slate-900 font-medium whitespace-nowrap">{fmt(inv.invoice_date)}</td>
                      <td className="px-4 py-2.5 text-right font-medium text-black">{inrFmt(inv.total_amount)}</td>
                      <td className="px-4 py-2.5 text-center">
                        <button onClick={() => navigate(`/finance/payment-run`)}
                          className="text-[10px] font-medium text-emerald-600 hover:text-emerald-800 px-2 py-1 rounded-lg hover:bg-emerald-50 transition-colors">
                          Pay →
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* ── Right col (2/5) ── */}
        <div className="xl:col-span-2 space-y-4">

          {/* Recent Payments */}
          <div className="bg-white border border-slate-100 rounded-2xl overflow-hidden shadow-sm">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100">
              <h2 className="text-sm font-medium text-slate-900">Recent Payments</h2>
              <Link to="/finance/payments" className="text-[10px] font-medium text-emerald-600 hover:underline flex items-center gap-1">
                View All <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
            {recentPayments.length === 0 ? (
              <div className="py-10 text-center text-slate-900 font-medium text-sm animate-pulse">Loading…</div>
            ) : (
              <div className="divide-y divide-slate-50">
                {recentPayments.map((p, i) => (
                  <div key={i} className="px-4 py-2.5 flex items-center gap-3 hover:bg-slate-50 transition-colors">
                    <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                      <CreditCard className="w-3.5 h-3.5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[11px] font-medium text-slate-900 font-medium truncate">{p.entity_name || '—'}</div>
                      <div className="text-[10px] text-slate-400">{fmt(p.payment_date)} · {p.project_name || 'General'}</div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-[11px] font-medium text-black">{inrFmt(p.net_amount ?? p.amount)}</div>
                      <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded-full ${MODE_COLORS[p.payment_mode] || 'bg-slate-100 text-slate-500'}`}>
                        {p.payment_mode?.replace('_', ' ') || 'other'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Quick Links */}
          <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm">
            <h2 className="text-sm font-medium text-slate-900 mb-3">Quick Links</h2>
            <div className="space-y-0.5">
              <QuickLink to="/finance/invoices"            icon={FileText}      label="Vendor Invoices"       color="bg-rose-50 text-rose-600" />
              <QuickLink to="/finance/invoices/booking"   icon={ClipboardList} label="Bill Booking (3-way)"  color="bg-amber-50 text-amber-600" />
              <QuickLink to="/finance/payment-run"        icon={Wallet}        label="Payment Run"           color="bg-emerald-50 text-emerald-600" />
              <QuickLink to="/finance/accounts-dashboard" icon={BookOpen}      label="Accounts Dashboard"    color="bg-blue-50 text-blue-600" />
              <QuickLink to="/finance/budget"             icon={PieChart}      label="Budget vs Actual"      color="bg-violet-50 text-violet-600" />
              <QuickLink to="/finance/gst"                icon={Receipt}       label="GST Register"          color="bg-orange-50 text-orange-600" />
              <QuickLink to="/finance/tds"                icon={ShieldCheck}   label="TDS Register"          color="bg-teal-50 text-teal-600" />
              <QuickLink to="/finance/intelligence"       icon={LineChart}     label="Finance Intelligence"  color="bg-indigo-50 text-indigo-600" />
              <QuickLink to="/finance/management-mis"     icon={BarChart3}     label="Management MIS"        color="bg-slate-100 text-slate-600" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
