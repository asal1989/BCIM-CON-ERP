import React, { useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import {
  CreditCard, Search, RefreshCw, Wallet, IndianRupee,
  Landmark, Clock3, CheckCircle2, AlertTriangle, FileText,
  Download, Printer, ChevronDown, X, SlidersHorizontal,
  TrendingDown, Building2, Calendar,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { clsx } from 'clsx';
import { invoiceAPI, paymentAPI, vendorAPI, tqsBillsAPI } from '../../api/client';

dayjs.extend(relativeTime);

const asArray = p => Array.isArray(p) ? p : p?.data || p?.rows || p?.items || [];
const money = v => `₹${Number(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const moneyShort = v => {
  const n = Number(v || 0);
  if (n >= 1e7) return `₹${(n / 1e7).toFixed(2)} Cr`;
  if (n >= 1e5) return `₹${(n / 1e5).toFixed(2)} L`;
  return money(n);
};
const fmt = v => v ? dayjs(v).format('DD MMM YYYY') : '—';
const clean = v => String(v || '').trim().toLowerCase();

const PAYMENT_MODES = ['RTGS', 'NEFT', 'IMPS', 'UPI', 'Cheque', 'Cash', 'DD'];
const STATUS_LIST = ['Paid', 'Partial', 'Pending', 'Overdue'];

const STATUS_STYLE = {
  Paid:    'bg-emerald-50 text-emerald-700 border-emerald-200 ring-emerald-100',
  Partial: 'bg-blue-50 text-blue-700 border-blue-200 ring-blue-100',
  Pending: 'bg-amber-50 text-amber-700 border-amber-200 ring-amber-100',
  Overdue: 'bg-rose-50 text-rose-700 border-rose-200 ring-rose-100',
};

/* ── CSV / Excel export ──────────────────────────────────────────────── */
function toCSV(rows) {
  const headers = ['Invoice No', 'Source', 'Vendor', 'Project', 'Invoice Amount', 'Paid', 'Balance', 'Due Date', 'Status'];
  const lines = [headers.join(','), ...rows.map(r => [
    `"${r.invoice_number || r.invNo || ''}"`,
    `"${r.source_label || 'Finance'}"`,
    `"${r.vendor_name || ''}"`,
    `"${r.project_name || ''}"`,
    Number(r.invoice_total || 0).toFixed(2),
    Number(r.paid_amount || 0).toFixed(2),
    Number(r.balance || 0).toFixed(2),
    fmt(r.due_date || r.dueDate),
    `"${r.status_view || ''}"`,
  ].join(','))];
  return lines.join('\n');
}

function downloadCSV(rows) {
  const blob = new Blob([toCSV(rows)], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `vendor-payments-${dayjs().format('YYYY-MM-DD')}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/* ── KPI Card ────────────────────────────────────────────────────────── */
function KPICard({ label, value, sub, icon: Icon, accent = '#6366f1', delta }) {
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm flex flex-col gap-2 relative overflow-hidden">
      <div className="absolute left-0 top-0 bottom-0 w-1 rounded-l-2xl" style={{ background: accent }} />
      <div className="flex items-center justify-between pl-2">
        <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: `${accent}18` }}>
          <Icon className="w-4 h-4" style={{ color: accent }} />
        </div>
        {delta !== undefined && (
          <span className={clsx('text-[11px] font-semibold px-1.5 py-0.5 rounded-full',
            delta >= 0 ? 'bg-rose-50 text-rose-600' : 'bg-emerald-50 text-emerald-600')}>
            {delta >= 0 ? '↑' : '↓'} {Math.abs(delta)}
          </span>
        )}
      </div>
      <div className="pl-2">
        <div className="text-xl font-semibold text-slate-900 leading-tight tabular-nums">{value}</div>
        <div className="text-[11px] font-semibold uppercase tracking-widest text-slate-500 mt-0.5">{label}</div>
        <div className="text-[11px] text-slate-400 mt-1 leading-snug">{sub}</div>
      </div>
    </div>
  );
}

/* ── Select dropdown helper ──────────────────────────────────────────── */
function FilterSelect({ label, value, onChange, options, placeholder = 'All' }) {
  return (
    <div>
      <label className="block text-[10px] font-semibold tracking-widest uppercase text-slate-400 mb-1">{label}</label>
      <div className="relative">
        <select
          value={value}
          onChange={e => onChange(e.target.value)}
          className="w-full h-9 rounded-xl border border-slate-200 bg-white pl-3 pr-7 text-sm text-slate-800 appearance-none outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition"
        >
          <option value="">{placeholder}</option>
          {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
      </div>
    </div>
  );
}

/* ── Print styles injected once ──────────────────────────────────────── */
const PRINT_STYLE = `
@media print {
  body * { visibility: hidden !important; }
  #vp-print-area, #vp-print-area * { visibility: visible !important; }
  #vp-print-area { position: absolute; inset: 0; padding: 16px; }
  .vp-no-print { display: none !important; }
  table { border-collapse: collapse; width: 100%; font-size: 10px; }
  th, td { border: 1px solid #cbd5e1; padding: 4px 6px; }
  th { background: #f1f5f9; font-weight: 600; }
  @page { margin: 1cm; size: landscape; }
}
`;
if (!document.getElementById('vp-print-style')) {
  const s = document.createElement('style');
  s.id = 'vp-print-style';
  s.textContent = PRINT_STYLE;
  document.head.appendChild(s);
}

/* ════════════════════════════════════════════════════════════════════════
   MAIN PAGE
   ════════════════════════════════════════════════════════════════════════ */
export default function VendorPaymentsPage() {
  const qc = useQueryClient();

  /* filters */
  const [search, setSearch]               = useState('');
  const [filterStatus, setFilterStatus]   = useState('');
  const [filterVendor, setFilterVendor]   = useState('');
  const [filterProject, setFilterProject] = useState('');
  const [filterMode, setFilterMode]       = useState('');
  const [filterSource, setFilterSource]   = useState('');
  const [dateFrom, setDateFrom]           = useState('');
  const [dateTo, setDateTo]               = useState('');
  const [showFilters, setShowFilters]     = useState(false);

  /* payment modal */
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [payForm, setPayForm] = useState({ amount: '', mode: 'NEFT', ref: '', date: '', bank_name: '', remarks: '' });

  /* queries */
  const vendorQuery  = useQuery({ queryKey: ['vp-vendors'],  queryFn: () => vendorAPI.list().then(r => asArray(r.data)).catch(() => []) });
  const invoiceQuery = useQuery({ queryKey: ['vp-invoices'], queryFn: () => invoiceAPI.list().then(r => asArray(r.data)).catch(() => []) });
  const paymentQuery = useQuery({ queryKey: ['vp-payments'], queryFn: () => paymentAPI.list().then(r => asArray(r.data)).catch(() => []) });
  const tqsQuery     = useQuery({ queryKey: ['vp-tqs'],      queryFn: () => tqsBillsAPI.list().then(r => asArray(r.data)).catch(() => []) });
  const ledgerQuery  = useQuery({ queryKey: ['vp-ledger'],   queryFn: () => tqsBillsAPI.getVendorLedger({ bill_type: 'po' }).then(r => asArray(r.data)).catch(() => []) });

  const paymentMut = useMutation({
    mutationFn: payload => paymentAPI.create(payload),
    onSuccess: () => {
      toast.success('Payment recorded');
      setSelectedInvoice(null);
      setPayForm({ amount: '', mode: 'NEFT', ref: '', date: '', bank_name: '', remarks: '' });
      qc.invalidateQueries({ queryKey: ['vp-payments'] });
      qc.invalidateQueries({ queryKey: ['vp-invoices'] });
    },
    onError: err => toast.error(err?.response?.data?.error || 'Unable to record payment'),
  });

  const vendors    = vendorQuery.data  || [];
  const invoices   = invoiceQuery.data || [];
  const payments   = paymentQuery.data || [];
  const tqsBills   = tqsQuery.data    || [];
  const ledger     = ledgerQuery.data  || [];

  const vendorMap = useMemo(() => { const m = new Map(); vendors.forEach(v => m.set(v.id, v)); return m; }, [vendors]);

  /* ── build enriched ledger ── */
  const invoicesEnriched = useMemo(() => invoices.map(inv => {
    const total  = Number(inv.net_amount ?? inv.total_amount ?? inv.amount ?? 0);
    const invPay = payments.filter(p => String(p.invoice_id || '') === String(inv.id));
    const paid   = invPay.reduce((s, p) => s + Number(p.amount || p.net_amount || 0), 0);
    const bal    = Math.max(total - paid, 0);
    const vend   = vendorMap.get(inv.vendor_id) || {};
    const due    = inv.due_date || inv.dueDate || null;
    const status = bal <= 0 ? 'Paid' : paid > 0 ? 'Partial' : (due && dayjs(due).isValid() && dayjs(due).isBefore(dayjs().startOf('day'))) ? 'Overdue' : 'Pending';
    return { ...inv, vendor_name: inv.vendor_name || vend.name || '—', project_name: inv.project_name || '—',
      invoice_total: total, paid_amount: paid, balance: bal, status_view: status,
      source_type: 'finance', source_label: 'Finance', latest_payment: invPay[0] || null };
  }), [invoices, payments, vendorMap]);

  const tqsEnriched = useMemo(() => tqsBills.map(bill => {
    const vend  = vendorMap.get(bill.vendor_id) || {};
    const total = Number(bill.certified_net ?? bill.total_amount ?? 0);
    const paid  = Number(bill.paid_amount ?? bill.total_paid ?? 0);
    const bal   = Number(bill.liability_balance ?? bill.balance_to_pay ?? Math.max(total - paid, 0));
    const status = bill.payment_status || bill.workflow_status || (bal <= 0 ? 'Paid' : paid > 0 ? 'Partial' : 'Pending');
    return { id: `tqs-${bill.id}`, source_type: 'tqs', source_label: 'DQS',
      invoice_number: bill.inv_number || bill.sl_number || bill.bill_number || 'DQS Bill',
      po_number: bill.po_number || bill.poRef || '', vendor_id: bill.vendor_id || null,
      vendor_name: bill.vendor_name || vend.name || '—', project_id: bill.project_id,
      project_name: bill.project_name || '—', invoice_total: total, paid_amount: paid, balance: bal,
      status_view: status, due_date: bill.inv_date || bill.received_date || bill.created_at || null,
      latest_payment: null };
  }), [tqsBills, vendorMap]);

  const allRows = useMemo(() => [...invoicesEnriched, ...tqsEnriched], [invoicesEnriched, tqsEnriched]);

  /* ── filter options ── */
  const vendorOptions  = useMemo(() => [...new Set(allRows.map(r => r.vendor_name).filter(Boolean))].sort().map(n => ({ value: n, label: n })), [allRows]);
  const projectOptions = useMemo(() => [...new Set(allRows.map(r => r.project_name).filter(v => v && v !== '—'))].sort().map(n => ({ value: n, label: n })), [allRows]);

  /* ── filtered rows ── */
  const filtered = useMemo(() => {
    const q = clean(search);
    return allRows.filter(r => {
      if (filterStatus  && r.status_view   !== filterStatus)  return false;
      if (filterVendor  && r.vendor_name   !== filterVendor)  return false;
      if (filterProject && r.project_name  !== filterProject) return false;
      if (filterSource  && r.source_type   !== filterSource)  return false;
      if (filterMode && r.source_type === 'finance') {
        const lp = r.latest_payment;
        if (!lp || clean(lp.payment_mode || lp.mode || '') !== clean(filterMode)) return false;
      }
      if (dateFrom && r.due_date && dayjs(r.due_date).isBefore(dayjs(dateFrom))) return false;
      if (dateTo   && r.due_date && dayjs(r.due_date).isAfter(dayjs(dateTo)))    return false;
      if (!q) return true;
      return [r.invoice_number, r.invNo, r.vendor_name, r.project_name, r.po_number, r.poRef, r.reference_number]
        .some(v => clean(v).includes(q));
    });
  }, [allRows, filterStatus, filterVendor, filterProject, filterSource, filterMode, dateFrom, dateTo, search]);

  /* ── KPI totals ── */
  const totals = useMemo(() => {
    const totalInvoice = allRows.reduce((s, r) => s + Number(r.invoice_total || 0), 0);
    const totalPaid    = allRows.reduce((s, r) => s + Number(r.paid_amount   || 0), 0);
    const totalBalance = allRows.reduce((s, r) => s + Number(r.balance       || 0), 0);
    const overdue      = allRows.filter(r => r.status_view === 'Overdue').length;
    const critical90   = ledger.reduce((s, v) => s + Number(v.payable_90_plus || 0), 0);
    return { totalInvoice, totalPaid, totalBalance, overdue, critical90 };
  }, [allRows, ledger]);

  const ledgerSorted = useMemo(() =>
    [...ledger].filter(v => Number(v.net_balance || 0) > 0.5).sort((a, b) => Number(b.net_balance || 0) - Number(a.net_balance || 0)),
    [ledger]);

  const recentPayments = useMemo(() =>
    [...payments].sort((a, b) => new Date(b.payment_date || b.created_at || 0) - new Date(a.payment_date || a.created_at || 0)).slice(0, 8),
    [payments]);

  const activeFilters = [filterStatus, filterVendor, filterProject, filterMode, filterSource, dateFrom, dateTo].filter(Boolean).length;

  const resetFilters = () => { setSearch(''); setFilterStatus(''); setFilterVendor(''); setFilterProject(''); setFilterMode(''); setFilterSource(''); setDateFrom(''); setDateTo(''); };

  const refresh = async () => {
    await Promise.all([vendorQuery, invoiceQuery, paymentQuery, tqsQuery, ledgerQuery].map(q => q.refetch()));
    toast.success('Data refreshed');
  };

  const openPay = inv => {
    setSelectedInvoice(inv);
    setPayForm({ amount: Number(inv.balance || 0) || '', mode: 'NEFT', ref: '', date: dayjs().format('YYYY-MM-DD'), bank_name: '', remarks: '' });
  };

  const submitPayment = () => {
    if (!selectedInvoice) return;
    if (!payForm.amount || !payForm.ref || !payForm.date) { toast.error('Fill amount, date and reference number'); return; }
    const vend = vendorMap.get(selectedInvoice.vendor_id) || {};
    paymentMut.mutate({
      project_id: selectedInvoice.project_id, payment_type: 'vendor_payment',
      entity_name: selectedInvoice.vendor_name, entity_pan: vend.pan || selectedInvoice.vendor_pan || '',
      invoice_id: selectedInvoice.id, amount: Number(payForm.amount), tds_deducted: 0,
      payment_date: payForm.date, payment_mode: payForm.mode, reference_number: payForm.ref,
      bank_name: payForm.bank_name, remarks: payForm.remarks,
      cost_head: selectedInvoice.po_number || selectedInvoice.poRef || null,
    });
  };

  const loading = invoiceQuery.isLoading || paymentQuery.isLoading || vendorQuery.isLoading || tqsQuery.isLoading;

  /* ── print ── */
  const handlePrint = () => window.print();

  return (
    <div id="vp-print-area" className="p-5 md:p-7 max-w-[1440px] mx-auto min-h-screen" style={{ background: '#f0f2f6' }}>

      {/* ── Header ── */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 mb-6 vp-no-print">
        <div>
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.3em] text-indigo-500 font-semibold mb-1.5">
            <Building2 className="w-3 h-3" /> Procurement
          </div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Vendor Payments</h1>
          <p className="text-sm text-slate-500 mt-1">Live vendor invoice and payment ledger — Finance & DQS bills consolidated</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={refresh} className="inline-flex items-center gap-1.5 px-3 h-9 rounded-xl border border-slate-200 bg-white text-slate-700 text-sm font-medium hover:border-indigo-300 hover:text-indigo-700 transition shadow-sm">
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </button>
          <button onClick={() => downloadCSV(filtered)} className="inline-flex items-center gap-1.5 px-3 h-9 rounded-xl border border-slate-200 bg-white text-slate-700 text-sm font-medium hover:border-emerald-400 hover:text-emerald-700 transition shadow-sm">
            <Download className="w-3.5 h-3.5" /> Export CSV
          </button>
          <button onClick={handlePrint} className="inline-flex items-center gap-1.5 px-3 h-9 rounded-xl border border-slate-200 bg-white text-slate-700 text-sm font-medium hover:border-indigo-400 hover:text-indigo-700 transition shadow-sm">
            <Printer className="w-3.5 h-3.5" /> Print / PDF
          </button>
        </div>
      </div>

      {/* ── KPI Cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
        <KPICard label="Total Invoiced"   value={moneyShort(totals.totalInvoice)}  sub="All bills in ledger"              icon={Wallet}        accent="#6366f1" />
        <KPICard label="Total Paid"       value={moneyShort(totals.totalPaid)}     sub="Payments recorded"                icon={IndianRupee}   accent="#10b981" />
        <KPICard label="Outstanding"      value={moneyShort(totals.totalBalance)}  sub="Remaining payable balance"        icon={TrendingDown}  accent="#f59e0b" />
        <KPICard label="Overdue Invoices" value={totals.overdue}                   sub="Past due date, unpaid"            icon={AlertTriangle} accent="#ef4444" />
        <KPICard label="Critical 90d+"    value={moneyShort(totals.critical90)}    sub="Procurement bills unpaid 90+ days" icon={Clock3}       accent="#dc2626" />
      </div>

      {/* ── Filter Bar ── */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm mb-5 vp-no-print overflow-hidden">
        <div className="px-4 py-3 flex items-center gap-3 flex-wrap">
          {/* search */}
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Invoice, vendor, PO, reference…"
              className="w-full h-9 bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-3 text-sm text-slate-800 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition"
            />
          </div>
          {/* status pills */}
          <div className="flex items-center gap-1.5">
            {['', ...STATUS_LIST].map(s => (
              <button key={s}
                onClick={() => setFilterStatus(s)}
                className={clsx('h-8 px-3 rounded-xl text-xs font-semibold border transition-all',
                  filterStatus === s
                    ? s === '' ? 'bg-slate-800 text-white border-slate-800' : `border text-white ${s === 'Paid' ? 'bg-emerald-600 border-emerald-600' : s === 'Partial' ? 'bg-blue-600 border-blue-600' : s === 'Overdue' ? 'bg-rose-600 border-rose-600' : 'bg-amber-500 border-amber-500'}`
                    : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'
                )}
              >{s || 'All'}</button>
            ))}
          </div>
          {/* advanced toggle */}
          <button onClick={() => setShowFilters(v => !v)}
            className={clsx('inline-flex items-center gap-1.5 h-9 px-3 rounded-xl border text-sm font-medium transition-all',
              showFilters ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white border-slate-200 text-slate-700 hover:border-indigo-300')}>
            <SlidersHorizontal className="w-3.5 h-3.5" />
            Filters {activeFilters > 0 && <span className="bg-white text-indigo-700 rounded-full px-1.5 text-[10px] font-bold leading-tight">{activeFilters}</span>}
          </button>
          {activeFilters > 0 && (
            <button onClick={resetFilters} className="inline-flex items-center gap-1 h-9 px-3 rounded-xl border border-rose-200 text-rose-600 text-sm font-medium hover:bg-rose-50 transition">
              <X className="w-3.5 h-3.5" /> Clear
            </button>
          )}
        </div>

        {showFilters && (
          <div className="border-t border-slate-100 px-4 py-4 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <FilterSelect label="Vendor"   value={filterVendor}  onChange={setFilterVendor}  options={vendorOptions}  placeholder="All vendors" />
            <FilterSelect label="Project"  value={filterProject} onChange={setFilterProject} options={projectOptions} placeholder="All projects" />
            <FilterSelect label="Source"   value={filterSource}  onChange={setFilterSource}  options={[{ value: 'finance', label: 'Finance' }, { value: 'tqs', label: 'DQS' }]} placeholder="All sources" />
            <FilterSelect label="Pay Mode" value={filterMode}    onChange={setFilterMode}    options={PAYMENT_MODES.map(m => ({ value: m, label: m }))} placeholder="All modes" />
            <div>
              <label className="block text-[10px] font-semibold tracking-widest uppercase text-slate-400 mb-1">Due From</label>
              <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                className="w-full h-9 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition" />
            </div>
            <div>
              <label className="block text-[10px] font-semibold tracking-widest uppercase text-slate-400 mb-1">Due To</label>
              <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                className="w-full h-9 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition" />
            </div>
          </div>
        )}
      </div>

      {/* ── Main Grid ── */}
      <div className="grid xl:grid-cols-[1fr_320px] gap-5 mb-6">

        {/* ── Invoice Ledger Table ── */}
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Invoice Ledger</h2>
              <p className="text-xs text-slate-400 mt-0.5">Enriched with live payment records</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 tabular-nums">
                {filtered.length} / {allRows.length} rows
              </span>
            </div>
          </div>

          {loading ? (
            <div className="p-5 space-y-2">{[...Array(5)].map((_, i) => <div key={i} className="h-14 rounded-xl bg-slate-100 animate-pulse" />)}</div>
          ) : filtered.length === 0 ? (
            <div className="p-16 text-center">
              <FileText className="w-10 h-10 text-slate-200 mx-auto mb-3" />
              <p className="text-sm font-medium text-slate-500">No invoices match your filters</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50 text-[10px] uppercase tracking-[0.2em] text-slate-400 font-semibold">
                    <th className="text-left px-4 py-3">Invoice</th>
                    <th className="text-left px-3 py-3">Source</th>
                    <th className="text-left px-3 py-3">Vendor</th>
                    <th className="text-left px-3 py-3">Project</th>
                    <th className="text-right px-3 py-3">Invoice Amt</th>
                    <th className="text-right px-3 py-3">Paid</th>
                    <th className="text-right px-3 py-3">Balance</th>
                    <th className="text-center px-3 py-3">Due Date</th>
                    <th className="text-center px-3 py-3">Status</th>
                    <th className="text-right px-4 py-3 vp-no-print">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {filtered.map(inv => (
                    <tr key={inv.id} className="hover:bg-indigo-50/30 transition-colors group">
                      <td className="px-4 py-3 align-middle">
                        <div className="font-semibold text-slate-800 text-sm leading-tight">{inv.invoice_number || inv.invNo || '—'}</div>
                        <div className="text-[11px] text-slate-400 mt-0.5 truncate max-w-[180px]">{inv.po_number || inv.poRef || 'No PO'}</div>
                      </td>
                      <td className="px-3 py-3 align-middle">
                        <span className={clsx('inline-flex px-2 py-0.5 rounded-md text-[10px] font-bold tracking-wide border',
                          inv.source_type === 'tqs'
                            ? 'bg-violet-50 text-violet-700 border-violet-200'
                            : 'bg-slate-100 text-slate-600 border-slate-200')}>
                          {inv.source_label}
                        </span>
                      </td>
                      <td className="px-3 py-3 align-middle">
                        <div className="text-slate-800 font-medium truncate max-w-[160px]">{inv.vendor_name}</div>
                      </td>
                      <td className="px-3 py-3 align-middle">
                        <div className="text-slate-600 text-xs truncate max-w-[160px]">{inv.project_name}</div>
                      </td>
                      <td className="px-3 py-3 align-middle text-right">
                        <div className="font-semibold text-indigo-600 tabular-nums">{money(inv.invoice_total)}</div>
                      </td>
                      <td className="px-3 py-3 align-middle text-right">
                        <div className="text-emerald-600 font-medium tabular-nums">{money(inv.paid_amount)}</div>
                      </td>
                      <td className="px-3 py-3 align-middle text-right">
                        <div className={clsx('font-semibold tabular-nums', inv.balance > 0 ? 'text-rose-600' : 'text-slate-400')}>
                          {money(inv.balance)}
                        </div>
                      </td>
                      <td className="px-3 py-3 align-middle text-center">
                        <div className="text-xs text-slate-600 font-mono tabular-nums">{fmt(inv.due_date || inv.dueDate)}</div>
                        {dayjs(inv.due_date || inv.dueDate).isValid() && (
                          <div className="text-[10px] text-slate-400 mt-0.5">{dayjs(inv.due_date || inv.dueDate).fromNow()}</div>
                        )}
                      </td>
                      <td className="px-3 py-3 align-middle text-center">
                        <span className={clsx('inline-flex px-2.5 py-0.5 rounded-full text-[11px] font-semibold border', STATUS_STYLE[inv.status_view])}>
                          {inv.status_view}
                        </span>
                        {inv.latest_payment && (
                          <div className="text-[10px] text-slate-400 mt-0.5">{inv.latest_payment.payment_mode || 'Payment'}</div>
                        )}
                      </td>
                      <td className="px-4 py-3 align-middle text-right vp-no-print">
                        {inv.source_type === 'finance' && inv.balance > 0 ? (
                          <button onClick={() => openPay(inv)}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 transition shadow-sm">
                            <CreditCard className="w-3 h-3" /> Pay
                          </button>
                        ) : inv.source_type === 'tqs' ? (
                          <span className="text-[11px] text-violet-600 font-semibold">DQS Tracked</span>
                        ) : (
                          <span className="text-[11px] text-emerald-500 font-semibold flex items-center justify-end gap-1"><CheckCircle2 className="w-3 h-3" /> Settled</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                {/* totals footer */}
                <tfoot>
                  <tr className="border-t-2 border-slate-200 bg-slate-50 text-sm font-bold">
                    <td colSpan={4} className="px-4 py-3 text-slate-600 text-xs uppercase tracking-widest">
                      Filtered Total ({filtered.length} rows)
                    </td>
                    <td className="px-3 py-3 text-right text-indigo-700 tabular-nums">{money(filtered.reduce((s, r) => s + Number(r.invoice_total || 0), 0))}</td>
                    <td className="px-3 py-3 text-right text-emerald-700 tabular-nums">{money(filtered.reduce((s, r) => s + Number(r.paid_amount || 0), 0))}</td>
                    <td className="px-3 py-3 text-right text-rose-700 tabular-nums">{money(filtered.reduce((s, r) => s + Number(r.balance || 0), 0))}</td>
                    <td colSpan={3} />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>

        {/* ── Right sidebar: Recent Payments ── */}
        <div className="space-y-5 vp-no-print">
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
              <Landmark className="w-4 h-4 text-emerald-500" />
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Recent Payments</h3>
                <p className="text-[11px] text-slate-400">Latest {recentPayments.length} records</p>
              </div>
            </div>
            <div className="divide-y divide-slate-50 max-h-[500px] overflow-y-auto">
              {recentPayments.length === 0 ? (
                <div className="py-10 text-center text-slate-400 text-sm">No payment records found</div>
              ) : recentPayments.map(row => (
                <div key={row.id} className="px-4 py-3 hover:bg-slate-50 transition">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-slate-700 uppercase tracking-wide truncate">{row.reference_number || 'Payment'}</div>
                      <div className="text-sm font-medium text-slate-900 truncate mt-0.5">{row.entity_name || 'Vendor'}</div>
                      <div className="flex items-center gap-2 mt-1 text-[11px] text-slate-400">
                        <span>{fmt(row.payment_date || row.created_at)}</span>
                        <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 font-medium">{row.payment_mode || '—'}</span>
                        {row.bank_name && <span className="truncate">{row.bank_name}</span>}
                      </div>
                    </div>
                    <div className="text-sm font-bold text-indigo-600 tabular-nums whitespace-nowrap">{money(row.amount || row.net_amount)}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Vendor Outstanding Ledger ── */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden mb-5">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Vendor Outstanding — Aging Summary</h2>
            <p className="text-xs text-slate-400 mt-0.5">Net payable per vendor, aged from bill date — procurement/material bills only</p>
          </div>
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-100 text-slate-600">{ledgerSorted.length} vendors owed</span>
        </div>
        {ledgerQuery.isLoading ? (
          <div className="p-5 space-y-2">{[...Array(4)].map((_, i) => <div key={i} className="h-11 rounded-xl bg-slate-100 animate-pulse" />)}</div>
        ) : ledgerSorted.length === 0 ? (
          <div className="p-10 text-center">
            <CheckCircle2 className="w-8 h-8 text-emerald-300 mx-auto mb-2" />
            <p className="text-sm font-medium text-slate-500">No outstanding balance on procurement bills</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-100 text-[10px] uppercase tracking-[0.2em] text-slate-400 font-semibold">
                <tr>
                  <th className="text-left px-5 py-3">Vendor</th>
                  <th className="text-right px-4 py-3">Net Balance</th>
                  <th className="text-right px-4 py-3">0–30 d</th>
                  <th className="text-right px-4 py-3">31–60 d</th>
                  <th className="text-right px-4 py-3">61–90 d</th>
                  <th className="text-right px-4 py-3 text-rose-500">90+ d</th>
                  <th className="text-right px-5 py-3">Unpaid Bills</th>
                  <th className="text-left px-4 py-3">Aging Bar</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {ledgerSorted.map(v => {
                  const net = Number(v.net_balance || 0);
                  const b0  = Number(v.payable_0_30    || 0);
                  const b1  = Number(v.payable_31_60   || 0);
                  const b2  = Number(v.payable_61_90   || 0);
                  const b3  = Number(v.payable_90_plus || 0);
                  const pct = n => net > 0 ? Math.round((n / net) * 100) : 0;
                  return (
                    <tr key={v.vendor_id || v.vendor_name} className="hover:bg-slate-50/80 transition-colors">
                      <td className="px-5 py-3 font-semibold text-slate-800">{v.vendor_name}</td>
                      <td className="px-4 py-3 text-right font-bold text-slate-900 tabular-nums">{money(net)}</td>
                      <td className="px-4 py-3 text-right text-xs tabular-nums">{b0 > 0 ? <span className="text-emerald-600">{money(b0)}</span> : '—'}</td>
                      <td className="px-4 py-3 text-right text-xs tabular-nums">{b1 > 0 ? <span className="text-amber-600">{money(b1)}</span> : '—'}</td>
                      <td className="px-4 py-3 text-right text-xs tabular-nums">{b2 > 0 ? <span className="text-orange-600">{money(b2)}</span> : '—'}</td>
                      <td className="px-4 py-3 text-right text-xs font-bold tabular-nums">{b3 > 0 ? <span className="text-rose-600">{money(b3)}</span> : '—'}</td>
                      <td className="px-5 py-3 text-right text-xs text-slate-500 tabular-nums">{v.unpaid_bill_count}</td>
                      <td className="px-4 py-3">
                        <div className="flex h-2 rounded-full overflow-hidden bg-slate-100 min-w-[80px]">
                          {b0 > 0 && <div className="bg-emerald-400" style={{ width: `${pct(b0)}%` }} />}
                          {b1 > 0 && <div className="bg-amber-400"   style={{ width: `${pct(b1)}%` }} />}
                          {b2 > 0 && <div className="bg-orange-500"  style={{ width: `${pct(b2)}%` }} />}
                          {b3 > 0 && <div className="bg-rose-500"    style={{ width: `${pct(b3)}%` }} />}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Payment Modal ── */}
      {selectedInvoice && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
            <div className="p-5 border-b border-slate-100 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-slate-900">Record Vendor Payment</h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  {selectedInvoice.invoice_number || selectedInvoice.invNo || 'Invoice'} · {selectedInvoice.vendor_name}
                </p>
                <div className="flex items-center gap-3 mt-2 text-xs">
                  <span className="text-slate-500">Invoice: <span className="font-semibold text-indigo-600">{money(selectedInvoice.invoice_total)}</span></span>
                  <span className="text-slate-500">Balance: <span className="font-semibold text-rose-600">{money(selectedInvoice.balance)}</span></span>
                </div>
              </div>
              <button onClick={() => setSelectedInvoice(null)} className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:text-slate-900 transition text-lg leading-none">×</button>
            </div>

            <div className="p-5 grid grid-cols-2 gap-4">
              {[
                { label: 'Amount *', key: 'amount', type: 'number', placeholder: '' },
                { label: 'Payment Date *', key: 'date', type: 'date', placeholder: '' },
                { label: 'Reference / Cheque No. *', key: 'ref', type: 'text', placeholder: 'UTR / cheque no.' },
                { label: 'Bank Name', key: 'bank_name', type: 'text', placeholder: 'Bank name' },
              ].map(f => (
                <div key={f.key}>
                  <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">{f.label}</label>
                  <input type={f.type} value={payForm[f.key]} placeholder={f.placeholder}
                    onChange={e => setPayForm(p => ({ ...p, [f.key]: e.target.value }))}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 outline-none transition" />
                </div>
              ))}
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Payment Mode</label>
                <div className="relative">
                  <select value={payForm.mode} onChange={e => setPayForm(p => ({ ...p, mode: e.target.value }))}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 outline-none appearance-none transition">
                    {PAYMENT_MODES.map(m => <option key={m}>{m}</option>)}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                </div>
              </div>
              <div className="col-span-2">
                <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Remarks</label>
                <textarea value={payForm.remarks} onChange={e => setPayForm(p => ({ ...p, remarks: e.target.value }))}
                  rows={2} className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 outline-none resize-none transition" />
              </div>
            </div>

            <div className="flex gap-3 px-5 pb-5">
              <button onClick={() => setSelectedInvoice(null)}
                className="flex-1 py-2.5 bg-slate-100 text-slate-700 text-sm font-semibold rounded-xl hover:bg-slate-200 transition">
                Cancel
              </button>
              <button onClick={submitPayment} disabled={paymentMut.isPending}
                className="flex-1 py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 shadow transition disabled:opacity-60">
                {paymentMut.isPending ? 'Saving…' : 'Save Payment'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
