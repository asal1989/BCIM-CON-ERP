import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  FileText, CheckCircle2, Clock, TrendingUp, ArrowRight,
  AlertTriangle, BarChart3, Layers, IndianRupee, Timer,
  Activity, CreditCard, ArrowUpRight,
} from 'lucide-react';
import { tqsBillsAPI } from '../../api/client';
import useAuthStore from '../../store/authStore';
import { DashSection, DashTable, Badge, inr } from './DashKPI';
import { PageHeader, KpiCard as ThemeKpiCard, Theme } from '../../theme';
import dayjs from 'dayjs';

const AGING_CLS = {
  '0-30':      'bg-emerald-100 text-emerald-700',
  '31-60':     'bg-amber-100 text-amber-700',
  '61-90':     'bg-orange-100 text-orange-700',
  '90+':       'bg-red-100 text-red-700',
  unscheduled: 'bg-slate-100 text-slate-600',
};

const AGING_BAR = {
  '0-30':  'bg-emerald-400',
  '31-60': 'bg-amber-400',
  '61-90': 'bg-orange-400',
  '90+':   'bg-red-500',
};

function StatBar({ label, value, total, color, sub }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-slate-500 w-36 truncate">{label}</span>
      <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-semibold text-slate-700 w-5 text-right">{value}</span>
      {sub && <span className="text-[10px] text-slate-400 w-16 text-right truncate">{sub}</span>}
    </div>
  );
}

export default function QSDashboard() {
  const { user } = useAuthStore();
  const now = dayjs();

  const { data: bills = [], isLoading: loadB } = useQuery({
    queryKey: ['tqs-bills', 'qs-dash'],
    queryFn: () => tqsBillsAPI.list().then(r => Array.isArray(r.data) ? r.data : (r.data?.data ?? [])),
    staleTime: 0,
    refetchOnWindowFocus: true,
  });

  const { data: aging = [], isLoading: loadA } = useQuery({
    queryKey: ['tqs-bills', 'qs-dash-aging'],
    queryFn: () => tqsBillsAPI.getAPAging().then(r => r.data?.data ?? []),
    staleTime: 0,
    refetchOnWindowFocus: true,
  });

  const { data: advances = [] } = useQuery({
    queryKey: ['tqs-advances', 'qs-dash'],
    queryFn: () => tqsBillsAPI.listAdvances().then(r => r.data?.data ?? []),
    staleTime: 0,
  });

  // ── Workflow breakdown ──────────────────────────────────────
  const pendingDC      = bills.filter(b => b.workflow_status === 'document_controller');
  const pendingQS      = pendingDC; // DC stage = awaiting QS action
  const pendingQSStage = bills.filter(b => b.workflow_status === 'qs');
  const pendingAcct    = bills.filter(b => b.workflow_status === 'accounts');
  const paidBills      = bills.filter(b => b.workflow_status === 'paid');
  const certified      = bills.filter(b => ['qs', 'accounts', 'paid'].includes(b.workflow_status));

  // ── This month ──────────────────────────────────────────────
  const thisMonth      = certified.filter(b => dayjs(b.updated_at).isSame(now, 'month'));
  const certAmtMonth   = thisMonth.reduce((s, b) => s + parseFloat(b.certified_net || 0), 0);
  const newThisMonth   = bills.filter(b => dayjs(b.created_at || b.inv_date).isSame(now, 'month'));

  // ── Totals ──────────────────────────────────────────────────
  const totalInvoiced  = bills.reduce((s, b) => s + parseFloat(b.total_amount || 0), 0);
  const totalCertified = bills.reduce((s, b) => s + parseFloat(b.certified_net || 0), 0);
  const totalOutstanding = aging.reduce((s, r) => s + parseFloat(r.balance || 0), 0);

  // ── Avg turnaround ──────────────────────────────────────────
  const withCertDate = bills.filter(b => b.inv_date && b.qs_certified_date);
  const avgTurnaround = withCertDate.length
    ? Math.round(withCertDate.reduce((s, b) => s + dayjs(b.qs_certified_date).diff(dayjs(b.inv_date), 'day'), 0) / withCertDate.length)
    : null;

  // ── Aging buckets ───────────────────────────────────────────
  const agingBuckets = ['0-30', '31-60', '61-90', '90+'];
  const agingByBucket = agingBuckets.map(bucket => ({
    bucket,
    count: aging.filter(r => r.aging_bucket === bucket).length,
    amount: aging.filter(r => r.aging_bucket === bucket).reduce((s, r) => s + parseFloat(r.balance || 0), 0),
  }));
  const overdueItems = aging.filter(r => ['61-90', '90+'].includes(r.aging_bucket));
  const pendingAdvCount = advances.filter(a => !a.recovered_at).length;

  // ── Table columns ───────────────────────────────────────────
  const pendingCols = [
    { key: 'sl_number',    label: 'SL #',     cls: 'font-mono text-indigo-700 font-bold text-[11px]' },
    { key: 'vendor_name',  label: 'Vendor',   cls: 'font-semibold text-black max-w-[130px] truncate' },
    { key: 'inv_number',   label: 'Invoice',  cls: 'text-slate-600 text-[11px]' },
    { key: 'total_amount', label: 'Amount',   right: true, render: r => <span className="font-semibold text-black">{inr(r.total_amount)}</span> },
    { key: 'inv_date',     label: 'Inv Date', cls: 'text-slate-500', render: r => r.inv_date ? dayjs(r.inv_date).format('DD MMM') : '—' },
  ];

  const certCols = [
    { key: 'vendor_name',  label: 'Vendor',    cls: 'font-semibold text-black max-w-[130px] truncate' },
    { key: 'inv_number',   label: 'Invoice',   cls: 'text-slate-600 text-[11px]' },
    { key: 'certified_net',label: 'Certified', right: true, render: r => <span className="font-bold text-emerald-700">{inr(r.certified_net)}</span> },
    { key: 'updated_at',   label: 'Cert Date', cls: 'text-slate-500', render: r => r.updated_at ? dayjs(r.updated_at).format('DD MMM') : '—' },
    { key: 'workflow_status', label: 'Stage', render: r => {
      const map = { accounts: 'Accounts', paid: 'Paid', qs: 'QS' };
      const cls = r.workflow_status === 'paid' ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700';
      return <Badge label={map[r.workflow_status] || r.workflow_status} cls={cls} />;
    }},
  ];

  const agingCols = [
    { key: 'vendor_name',   label: 'Vendor',      cls: 'font-semibold text-black max-w-[140px] truncate' },
    { key: 'certified_net', label: 'Certified',   right: true, render: r => <span className="font-semibold text-slate-700">{inr(r.certified_net)}</span> },
    { key: 'balance',       label: 'Outstanding', right: true, render: r => <span className="font-bold text-red-600">{inr(r.balance)}</span> },
    { key: 'aging_bucket',  label: 'Aging',       render: r => <Badge label={r.aging_bucket || '—'} cls={AGING_CLS[r.aging_bucket] || AGING_CLS.unscheduled} /> },
  ];

  const recentBills = [...bills]
    .sort((a, b) => dayjs(b.updated_at).valueOf() - dayjs(a.updated_at).valueOf())
    .slice(0, 8);

  return (
    <div style={{ background: Theme.pageBg, minHeight: '100vh' }}>

      <PageHeader
        title={`Good ${now.hour() < 12 ? 'morning' : now.hour() < 17 ? 'afternoon' : 'evening'}, ${user?.name?.split(' ')[0] || ''}`}
        subtitle={`QS Engineer Dashboard — ${now.format('dddd, D MMMM YYYY')}`}
        breadcrumbs={[{ label: 'QS' }, { label: 'Dashboard' }]}
      />

      <div className="p-6 space-y-5 max-w-7xl mx-auto">

        {/* ── Row 1: KPIs ── */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <ThemeKpiCard icon={Clock}        label="Awaiting QS Cert"     value={pendingQS.length}          color="amber"   />
          <ThemeKpiCard icon={CheckCircle2} label="Certified This Month"  value={thisMonth.length}          color="emerald" />
          <ThemeKpiCard icon={IndianRupee}  label="Cert Value This Month" value={inr(certAmtMonth)}         color="indigo"  />
          <ThemeKpiCard icon={CreditCard}   label="Total Outstanding"     value={inr(totalOutstanding)}     color="red"     />
          <ThemeKpiCard icon={Timer}        label="Avg Turnaround"        value={avgTurnaround != null ? `${avgTurnaround}d` : '—'} color="blue" />
          <ThemeKpiCard icon={FileText}     label="Pending Advances"      value={pendingAdvCount}            color="violet"  />
        </div>

        {/* ── Row 2: Alert banners ── */}
        {(pendingQS.length > 0 || overdueItems.length > 0) && (
          <div className="flex flex-col gap-2">
            {pendingQS.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-center gap-3">
                <Clock size={15} className="text-amber-600 flex-shrink-0" />
                <span className="text-sm font-medium text-amber-800">
                  {pendingQS.length} bill{pendingQS.length > 1 ? 's' : ''} awaiting QS certification
                </span>
                <Link to="/tqs/bills" className="ml-auto text-xs font-semibold text-amber-700 underline whitespace-nowrap">Review →</Link>
              </div>
            )}
            {overdueItems.length > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex items-center gap-3">
                <AlertTriangle size={15} className="text-red-600 flex-shrink-0" />
                <span className="text-sm font-medium text-red-800">
                  {overdueItems.length} vendor{overdueItems.length > 1 ? 's' : ''} with payments overdue 60+ days
                </span>
                <Link to="/tqs/bills" className="ml-auto text-xs font-semibold text-red-700 underline whitespace-nowrap">View aging →</Link>
              </div>
            )}
          </div>
        )}

        {/* ── Row 3: Pipeline + Aging + Summary panels ── */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

          {/* Workflow Pipeline */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <Activity size={14} className="text-indigo-600" />
              <span className="text-xs font-semibold text-slate-700 uppercase tracking-wider">Bill Workflow</span>
              <span className="ml-auto text-xs text-slate-400">{bills.length} total</span>
            </div>
            <div className="space-y-2.5">
              <StatBar label="Awaiting QS Cert"  value={pendingQS.length}      total={bills.length} color="bg-amber-400" />
              <StatBar label="QS Review"         value={pendingQSStage.length}  total={bills.length} color="bg-indigo-400" />
              <StatBar label="With Accounts"     value={pendingAcct.length}     total={bills.length} color="bg-blue-400" />
              <StatBar label="Paid"              value={paidBills.length}       total={bills.length} color="bg-emerald-400" />
            </div>
            <div className="mt-4 pt-3 border-t border-slate-100 grid grid-cols-2 gap-2">
              <div className="text-center">
                <p className="text-lg font-bold text-black">{inr(totalInvoiced)}</p>
                <p className="text-[10px] text-slate-500 uppercase tracking-wide">Total Invoiced</p>
              </div>
              <div className="text-center">
                <p className="text-lg font-bold text-emerald-700">{inr(totalCertified)}</p>
                <p className="text-[10px] text-slate-500 uppercase tracking-wide">Total Certified</p>
              </div>
            </div>
          </div>

          {/* AP Aging Breakdown */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <BarChart3 size={14} className="text-rose-600" />
              <span className="text-xs font-semibold text-slate-700 uppercase tracking-wider">AP Aging</span>
              <span className="ml-auto text-xs text-slate-400">{aging.length} vendors</span>
            </div>
            <div className="space-y-2.5">
              {agingBuckets.map(bucket => {
                const { count, amount } = agingByBucket.find(b => b.bucket === bucket) || { count: 0, amount: 0 };
                return (
                  <StatBar
                    key={bucket}
                    label={`${bucket} days`}
                    value={count}
                    total={aging.length || 1}
                    color={AGING_BAR[bucket]}
                    sub={count > 0 ? inr(amount) : ''}
                  />
                );
              })}
            </div>
            <div className="mt-4 pt-3 border-t border-slate-100 text-center">
              <p className="text-lg font-bold text-red-600">{inr(totalOutstanding)}</p>
              <p className="text-[10px] text-slate-500 uppercase tracking-wide">Total Outstanding</p>
            </div>
          </div>

          {/* This Month Summary */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp size={14} className="text-emerald-600" />
              <span className="text-xs font-semibold text-slate-700 uppercase tracking-wider">This Month</span>
              <span className="ml-auto text-xs text-slate-400">{now.format('MMM YYYY')}</span>
            </div>
            <div className="space-y-3">
              {[
                { label: 'New Bills Received', value: newThisMonth.length, color: 'text-black' },
                { label: 'Bills Certified', value: thisMonth.length, color: 'text-emerald-700' },
                { label: 'With Accounts', value: pendingAcct.filter(b => dayjs(b.updated_at).isSame(now, 'month')).length, color: 'text-blue-700' },
                { label: 'Payments Made', value: paidBills.filter(b => dayjs(b.updated_at).isSame(now, 'month')).length, color: 'text-indigo-700' },
              ].map(({ label, value, color }) => (
                <div key={label} className="flex items-center justify-between py-1.5 border-b border-slate-50 last:border-0">
                  <span className="text-xs text-slate-600">{label}</span>
                  <span className={`text-sm font-bold ${color}`}>{value}</span>
                </div>
              ))}
            </div>
            <div className="mt-3 pt-3 border-t border-slate-100 text-center">
              <p className="text-lg font-bold text-emerald-700">{inr(certAmtMonth)}</p>
              <p className="text-[10px] text-slate-500 uppercase tracking-wide">Certified Value This Month</p>
            </div>
          </div>
        </div>

        {/* ── Row 4: Activity tables ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <DashSection
            title="Bills Awaiting QS Certification"
            action={<Link to="/tqs/bills" className="text-xs text-indigo-600 flex items-center gap-1 hover:underline">All Bills <ArrowRight className="w-3 h-3" /></Link>}
          >
            <DashTable cols={pendingCols} rows={pendingQS.slice(0, 8)} empty="No bills awaiting certification ✅" loading={loadB} />
          </DashSection>

          <DashSection
            title="Recently Certified"
            action={<Link to="/tqs/bills" className="text-xs text-indigo-600 flex items-center gap-1 hover:underline">All Certified <ArrowRight className="w-3 h-3" /></Link>}
          >
            <DashTable cols={certCols} rows={thisMonth.slice(0, 8)} empty="No certified bills this month" loading={loadB} />
          </DashSection>
        </div>

        {/* ── Row 5: AP Aging detail ── */}
        <DashSection
          title={`AP Aging Summary — ${aging.length} Vendor${aging.length !== 1 ? 's' : ''} Outstanding`}
          action={<Link to="/tqs/bills" className="text-xs text-red-600 flex items-center gap-1 hover:underline">Full Ledger <ArrowRight className="w-3 h-3" /></Link>}
        >
          <DashTable cols={agingCols} rows={aging.slice(0, 12)} empty="No outstanding amounts ✅" loading={loadA} />
        </DashSection>

      </div>
    </div>
  );
}
