import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import {
  CreditCard,
  Search,
  Filter,
  RefreshCw,
  Wallet,
  IndianRupee,
  Landmark,
  Clock3,
  CheckCircle2,
  AlertTriangle,
  FileText,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { clsx } from 'clsx';
import { invoiceAPI, paymentAPI, vendorAPI, tqsBillsAPI } from '../../api/client';

dayjs.extend(relativeTime);

const asArray = payload => {
  if (Array.isArray(payload)) return payload;
  return payload?.data || payload?.rows || payload?.items || [];
};

const money = value => `₹${Number(value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmt = value => (value ? dayjs(value).format('DD-MM-YYYY') : '—');
const clean = value => String(value || '').trim().toLowerCase();

const PAYMENT_MODES = ['RTGS', 'NEFT', 'IMPS', 'UPI', 'Cheque', 'Cash', 'DD'];

function StatCard({ label, value, sub, icon: Icon, tone = 'indigo' }) {
  const tones = {
    indigo: 'bg-indigo-50 text-indigo-600 border-indigo-100',
    emerald: 'bg-emerald-50 text-emerald-600 border-emerald-100',
    amber: 'bg-amber-50 text-amber-600 border-amber-100',
    rose: 'bg-rose-50 text-rose-600 border-rose-100',
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <div className={clsx('w-9 h-9 rounded-lg border flex items-center justify-center', tones[tone])}>
          <Icon className="w-4 h-4" />
        </div>
      </div>
      <div className="text-2xl font-medium text-slate-900">{value}</div>
      <div className="text-[11px] font-medium tracking-[0.18em] text-slate-900 font-medium uppercase mt-1">{label}</div>
      <div className="text-xs text-slate-900 font-medium mt-1.5 leading-tight">{sub}</div>
    </div>
  );
}

export default function VendorPaymentsPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [payForm, setPayForm] = useState({
    amount: '',
    mode: 'NEFT',
    ref: '',
    date: '',
    bank_name: '',
    remarks: '',
  });

  const vendorQuery = useQuery({
    queryKey: ['procurement-vendor-payments-vendors'],
    queryFn: () => vendorAPI.list().then(r => asArray(r.data)).catch(() => []),
  });

  const invoiceQuery = useQuery({
    queryKey: ['procurement-vendor-payments-invoices'],
    queryFn: () => invoiceAPI.list().then(r => asArray(r.data)).catch(() => []),
  });

  const paymentQuery = useQuery({
    queryKey: ['procurement-vendor-payments-payments'],
    queryFn: () => paymentAPI.list().then(r => asArray(r.data)).catch(() => []),
  });

  const tqsQuery = useQuery({
    queryKey: ['procurement-vendor-payments-tqs-bills'],
    queryFn: () => tqsBillsAPI.list().then(r => asArray(r.data)).catch(() => []),
  });

  const paymentMut = useMutation({
    mutationFn: payload => paymentAPI.create(payload),
    onSuccess: () => {
      toast.success('Payment recorded successfully');
      setSelectedInvoice(null);
      setPayForm({ amount: '', mode: 'NEFT', ref: '', date: '', bank_name: '', remarks: '' });
      qc.invalidateQueries({ queryKey: ['procurement-vendor-payments-payments'] });
      qc.invalidateQueries({ queryKey: ['procurement-vendor-payments-invoices'] });
    },
    onError: err => toast.error(err?.response?.data?.error || 'Unable to record payment'),
  });

  const vendors = vendorQuery.data || [];
  const invoices = invoiceQuery.data || [];
  const payments = paymentQuery.data || [];
  const tqsBills = tqsQuery.data || [];

  const vendorLookup = useMemo(() => {
    const map = new Map();
    vendors.forEach(v => map.set(v.id, v));
    return map;
  }, [vendors]);

  const invoicesWithPayments = useMemo(() => {
    return invoices.map(inv => {
      const invoiceTotal = Number(inv.net_amount ?? inv.total_amount ?? inv.amount ?? 0);
      const invoicePayments = payments.filter(p => String(p.invoice_id || '') === String(inv.id));
      const paidAmount = invoicePayments.reduce((sum, p) => sum + Number(p.amount || p.net_amount || 0), 0);
      const balance = Math.max(invoiceTotal - paidAmount, 0);
      const vendor = vendorLookup.get(inv.vendor_id) || {};
      const dueDate = inv.due_date || inv.dueDate || null;
      const derivedStatus =
        balance <= 0 ? 'Paid'
        : paidAmount > 0 ? 'Partial'
        : dueDate && dayjs(dueDate).isValid() && dayjs(dueDate).isBefore(dayjs().startOf('day')) ? 'Overdue'
        : 'Pending';

      return {
        ...inv,
        vendor_name: inv.vendor_name || vendor.name || '—',
        project_name: inv.project_name || '—',
        invoice_total: invoiceTotal,
        paid_amount: paidAmount,
        balance,
        status_view: derivedStatus,
        source_type: 'finance',
        source_label: 'Finance',
        latest_payment: invoicePayments[0] || null,
      };
    });
  }, [invoices, payments, vendorLookup]);

  const tqsWithPayments = useMemo(() => {
    return tqsBills.map(bill => {
      const vendor = vendorLookup.get(bill.vendor_id) || {};
      const invoiceTotal = Number(bill.certified_net ?? bill.total_amount ?? 0);
      const paidAmount = Number(bill.paid_amount ?? bill.total_paid ?? 0);
      const balance = Number(bill.liability_balance ?? bill.balance_to_pay ?? Math.max(invoiceTotal - paidAmount, 0));
      const status = bill.payment_status || bill.workflow_status || (balance <= 0 ? 'Paid' : paidAmount > 0 ? 'Partial' : 'Pending');
      return {
        id: `tqs-${bill.id}`,
        source_type: 'tqs',
        source_label: 'DQS',
        invoice_number: bill.inv_number || bill.sl_number || bill.bill_number || 'DQS Bill',
        po_number: bill.po_number || bill.poRef || '',
        vendor_id: bill.vendor_id || null,
        vendor_name: bill.vendor_name || vendor.name || '—',
        project_id: bill.project_id,
        project_name: bill.project_name || '—',
        invoice_total: invoiceTotal,
        paid_amount: paidAmount,
        balance,
        status_view: status,
        due_date: bill.inv_date || bill.received_date || bill.created_at || null,
        latest_payment: null,
        tqs_bill: bill,
        search_blob: [
          bill.inv_number,
          bill.sl_number,
          bill.vendor_name,
          bill.project_name,
          bill.po_number,
          bill.gr_number,
          bill.workflow_status,
          bill.payment_status,
        ].map(clean).join(' '),
      };
    });
  }, [tqsBills, vendorLookup]);

  const paymentLedger = useMemo(() => [...invoicesWithPayments, ...tqsWithPayments], [invoicesWithPayments, tqsWithPayments]);

  const filtered = useMemo(() => {
    const q = clean(search);
    return paymentLedger.filter(inv => {
      if (filterStatus !== 'all' && inv.status_view !== filterStatus) return false;
      if (!q) return true;
      return [
        inv.invoice_number,
        inv.invNo,
        inv.vendor_name,
        inv.project_name,
        inv.po_number,
        inv.poRef,
        inv.reference_number,
        inv.search_blob,
      ].some(value => clean(value).includes(q));
    });
  }, [paymentLedger, filterStatus, search]);

  const totals = useMemo(() => {
    const totalInvoice = paymentLedger.reduce((sum, inv) => sum + Number(inv.invoice_total || 0), 0);
    const totalPaid = paymentLedger.reduce((sum, inv) => sum + Number(inv.paid_amount || 0), 0);
    const totalBalance = paymentLedger.reduce((sum, inv) => sum + Number(inv.balance || 0), 0);
    const overdue = invoicesWithPayments.filter(inv => inv.status_view === 'Overdue').length;
    return { totalInvoice, totalPaid, totalBalance, overdue };
  }, [paymentLedger, invoicesWithPayments]);

  const paymentRows = useMemo(() => {
    return [...payments]
      .sort((a, b) => new Date(b.payment_date || b.created_at || 0) - new Date(a.payment_date || a.created_at || 0))
      .slice(0, 10);
  }, [payments]);

  const refresh = async () => {
    await Promise.all([vendorQuery.refetch(), invoiceQuery.refetch(), paymentQuery.refetch()]);
    toast.success('Vendor payment data refreshed');
  };

  const openPay = invoice => {
    setSelectedInvoice(invoice);
    setPayForm({
      amount: Number(invoice.balance || 0) || '',
      mode: 'NEFT',
      ref: '',
      date: dayjs().format('YYYY-MM-DD'),
      bank_name: '',
      remarks: '',
    });
  };

  const submitPayment = () => {
    if (!selectedInvoice) return;
    if (!payForm.amount || !payForm.ref || !payForm.date) {
      toast.error('Fill amount, date and reference number');
      return;
    }

    const vendor = vendorLookup.get(selectedInvoice.vendor_id) || {};
    paymentMut.mutate({
      project_id: selectedInvoice.project_id,
      payment_type: 'vendor_payment',
      entity_name: selectedInvoice.vendor_name,
      entity_pan: vendor.pan || selectedInvoice.vendor_pan || '',
      invoice_id: selectedInvoice.id,
      amount: Number(payForm.amount),
      tds_deducted: 0,
      payment_date: payForm.date,
      payment_mode: payForm.mode,
      reference_number: payForm.ref,
      bank_name: payForm.bank_name,
      remarks: payForm.remarks,
      cost_head: selectedInvoice.po_number || selectedInvoice.poRef || null,
    });
  };

  const loading = invoiceQuery.isLoading || paymentQuery.isLoading || vendorQuery.isLoading || tqsQuery.isLoading;

  return (
    <div className="p-6 md:p-7 max-w-7xl mx-auto min-h-screen bg-[#f4f6f9]">
      <div className="flex flex-col xl:flex-row xl:items-end justify-between gap-4 mb-5">
        <div>
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.28em] text-indigo-500 font-medium mb-1.5">
            <FileText className="w-3.5 h-3.5" />
            Procurement
          </div>
          <h1 className="text-2xl md:text-[28px] font-medium text-slate-900 leading-tight">Vendor Payments</h1>
          <p className="text-sm text-slate-900 font-medium mt-1.5 max-w-2xl">
            Live vendor invoice and payment ledger using real invoices and payment records from the ERP.
          </p>
        </div>
        <button
          onClick={refresh}
          className="inline-flex items-center gap-2 px-4 h-10 rounded-xl border border-slate-200 bg-white text-slate-900 text-sm font-medium hover:border-indigo-300 hover:text-indigo-700 transition-all shadow-sm"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <StatCard label="Invoice Value" value={money(totals.totalInvoice)} sub="Total billed from invoices" icon={Wallet} tone="indigo" />
        <StatCard label="Paid Value" value={money(totals.totalPaid)} sub="Total payments recorded" icon={IndianRupee} tone="emerald" />
        <StatCard label="Outstanding" value={money(totals.totalBalance)} sub="Remaining payable balance" icon={AlertTriangle} tone="amber" />
        <StatCard label="Overdue" value={totals.overdue} sub="Invoices past due date" icon={CheckCircle2} tone="rose" />
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl p-3 md:p-4 shadow-sm mb-5">
        <div className="grid grid-cols-1 xl:grid-cols-[1.1fr_1fr_auto] gap-3 items-center">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search invoice, vendor, PO, payment ref..."
              className="w-full h-10 bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-3 text-sm text-slate-900 outline-none focus:border-indigo-400"
            />
          </div>

          <div>
            <label className="block text-[11px] font-medium tracking-[0.18em] uppercase text-slate-900 font-medium mb-1">Status</label>
            <div className="flex items-center gap-2 flex-wrap">
              {['all', 'Paid', 'Partial', 'Pending', 'Overdue'].map(status => (
                <button
                  key={status}
                  onClick={() => setFilterStatus(status)}
                  className={clsx(
                    'h-10 px-3 rounded-xl border text-sm font-medium transition-all',
                    filterStatus === status
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'bg-white text-slate-900 border-slate-200 hover:border-indigo-300'
                  )}
                >
                  {status === 'all' ? 'All' : status}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-end gap-2">
            <button
              onClick={() => {
                setSearch('');
                setFilterStatus('all');
              }}
              className="h-10 px-3 rounded-xl border border-slate-200 bg-white text-slate-900 font-medium text-sm font-medium hover:text-indigo-700 hover:border-indigo-300 transition-all"
            >
              <Filter className="w-4 h-4 inline mr-1.5" />
              Reset
            </button>
          </div>
        </div>
      </div>

      <div className="grid xl:grid-cols-[1.6fr_0.9fr] gap-5">
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-medium text-slate-900">Invoice Ledger</h2>
              <p className="text-xs text-slate-900 font-medium mt-0.5">Invoices with live paid and balance calculations</p>
            </div>
            <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-slate-100 text-slate-600">
              {filtered.length} row{filtered.length === 1 ? '' : 's'}
            </span>
          </div>

          {loading ? (
            <div className="p-5 space-y-2">
              {[1, 2, 3, 4, 5].map(i => (
                <div key={i} className="h-14 rounded-xl bg-slate-100 animate-pulse" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-14 text-center">
              <FileText className="w-10 h-10 text-slate-300 mx-auto mb-3" />
              <p className="text-sm font-medium text-slate-600">No invoices found</p>
              <p className="text-xs text-slate-900 font-medium mt-1">Create invoices in the vendor billing module and record payments here.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead className="bg-slate-50 border-b border-slate-100">
                  <tr className="text-[11px] uppercase tracking-[0.18em] text-slate-400">
                    <th className="text-left font-medium px-4 py-3">Invoice</th>
                    <th className="text-left font-medium px-4 py-3">Source</th>
                    <th className="text-left font-medium px-4 py-3">Vendor</th>
                    <th className="text-left font-medium px-4 py-3">Project</th>
                    <th className="text-left font-medium px-4 py-3">Invoice Amt</th>
                    <th className="text-left font-medium px-4 py-3">Paid / Balance</th>
                    <th className="text-left font-medium px-4 py-3">Due Date</th>
                    <th className="text-left font-medium px-4 py-3">Status</th>
                    <th className="text-right font-medium px-4 py-3">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {filtered.map(inv => (
                    <tr key={inv.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="px-4 py-3 align-top">
                        <div className="text-sm font-medium text-slate-900 leading-tight">{inv.invoice_number || inv.invNo || '—'}</div>
                        <div className="text-[11px] text-slate-900 font-medium mt-0.5 truncate max-w-[200px]">{inv.po_number || inv.poRef || 'No PO reference'}</div>
                      </td>
                      <td className="px-4 py-3 align-top">
                        <span className={clsx(
                          'inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium border',
                          inv.source_type === 'tqs' ? 'bg-violet-50 text-violet-700 border-violet-200' : 'bg-slate-50 text-slate-900 border-slate-200'
                        )}>
                          {inv.source_label || 'Finance'}
                        </span>
                      </td>
                      <td className="px-4 py-3 align-top">
                        <div className="text-sm font-medium text-slate-700">{inv.vendor_name}</div>
                        <div className="text-[11px] text-slate-900 font-medium truncate max-w-[170px]">{clean(inv.vendor_name) || 'Vendor'}</div>
                      </td>
                      <td className="px-4 py-3 align-top">
                        <div className="text-sm text-slate-900 truncate max-w-[190px]">{inv.project_name}</div>
                      </td>
                      <td className="px-4 py-3 align-top">
                        <div className="text-sm font-medium text-indigo-600">{money(inv.invoice_total)}</div>
                        <div className="text-[11px] text-slate-400">Invoice value</div>
                      </td>
                      <td className="px-4 py-3 align-top">
                        <div className="text-sm font-medium text-emerald-700">{money(inv.paid_amount)}</div>
                        <div className="text-[11px] text-rose-500">{money(inv.balance)} balance</div>
                      </td>
                      <td className="px-4 py-3 align-top">
                        <div className="text-sm font-mono text-slate-700">{fmt(inv.due_date || inv.dueDate)}</div>
                        <div className="text-[11px] text-slate-900 font-medium flex items-center gap-1.5 mt-0.5">
                          <Clock3 className="w-3 h-3" />
                          {dayjs(inv.due_date || inv.dueDate).isValid() ? dayjs(inv.due_date || inv.dueDate).fromNow() : 'No due date'}
                        </div>
                      </td>
                      <td className="px-4 py-3 align-top">
                        <span
                          className={clsx(
                            'inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium border',
                            inv.status_view === 'Paid' && 'bg-emerald-50 text-emerald-700 border-emerald-200',
                            inv.status_view === 'Partial' && 'bg-blue-50 text-blue-700 border-blue-200',
                            inv.status_view === 'Pending' && 'bg-amber-50 text-amber-700 border-amber-200',
                            inv.status_view === 'Overdue' && 'bg-rose-50 text-rose-700 border-rose-200'
                          )}
                        >
                          {inv.status_view}
                        </span>
                        {inv.latest_payment && (
                          <div className="text-[11px] text-slate-900 font-medium mt-1">
                            Latest: {inv.latest_payment.payment_mode || inv.latest_payment.mode || 'Payment'}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 align-top text-right">
                        {inv.source_type === 'finance' && inv.balance > 0 ? (
                          <button
                            onClick={() => openPay(inv)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-medium hover:bg-indigo-700 transition-all"
                          >
                            <CreditCard className="w-3.5 h-3.5" />
                            Record Payment
                          </button>
                        ) : inv.source_type === 'tqs' ? (
                          <span className="text-xs text-violet-600 font-semibold">Tracked in DQS</span>
                        ) : (
                          <span className="text-xs text-slate-400">Settled</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="space-y-5">
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5">
            <div className="flex items-center gap-2 mb-4">
              <Landmark className="w-4 h-4 text-emerald-500" />
              <div>
                <h3 className="text-sm font-medium text-slate-900">Recent Payments</h3>
                <p className="text-xs text-slate-400">Latest payment records from the ERP</p>
              </div>
            </div>
            <div className="space-y-3 max-h-[460px] overflow-auto pr-1">
              {paymentRows.length === 0 ? (
                <div className="py-8 text-center text-slate-900 font-medium text-sm border-2 border-dashed border-slate-200 rounded-2xl">
                  No payment records found.
                </div>
              ) : (
                paymentRows.map(row => (
                  <div key={row.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-xs text-slate-900 font-medium uppercase tracking-[0.18em] font-semibold">{row.reference_number || row.payment_mode || 'Payment'}</div>
                        <div className="text-sm font-medium text-slate-900 mt-0.5">{row.entity_name || 'Vendor'}</div>
                      </div>
                      <div className="text-sm font-medium text-indigo-600">{money(row.amount || row.net_amount)}</div>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-slate-500">
                      <span>{fmt(row.payment_date || row.created_at)}</span>
                      <span>{row.payment_mode || '—'}</span>
                      <span>{row.bank_name || '—'}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle className="w-4 h-4 text-amber-500" />
              <h3 className="text-sm font-medium text-slate-900">How it works</h3>
            </div>
            <ul className="space-y-2 text-xs text-slate-900 font-medium leading-relaxed">
              <li>• Reads live vendor invoices from the Finance module.</li>
              <li>• Reads recorded payments and computes paid vs balance automatically.</li>
              <li>• Opens an actual payment entry against the selected invoice.</li>
            </ul>
          </div>
        </div>
      </div>

      {selectedInvoice && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl">
            <div className="p-5 border-b border-slate-100 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-medium text-slate-900">Record Vendor Payment</h2>
                <p className="text-xs text-slate-900 font-medium mt-0.5">{selectedInvoice.invoice_number || selectedInvoice.invNo || 'Invoice'} · {selectedInvoice.vendor_name}</p>
              </div>
              <button onClick={() => setSelectedInvoice(null)} className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 text-slate-900 font-medium hover:text-slate-900 transition-all">
                ×
              </button>
            </div>

            <div className="p-5 grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-slate-900 font-medium mb-1">Amount *</label>
                <input
                  type="number"
                  value={payForm.amount}
                  onChange={e => setPayForm(prev => ({ ...prev, amount: e.target.value }))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-900 font-medium mb-1">Payment Date *</label>
                <input
                  type="date"
                  value={payForm.date}
                  onChange={e => setPayForm(prev => ({ ...prev, date: e.target.value }))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-900 font-medium mb-1">Payment Mode</label>
                <select
                  value={payForm.mode}
                  onChange={e => setPayForm(prev => ({ ...prev, mode: e.target.value }))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm"
                >
                  {PAYMENT_MODES.map(mode => <option key={mode}>{mode}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-900 font-medium mb-1">Reference / Cheque No. *</label>
                <input
                  value={payForm.ref}
                  onChange={e => setPayForm(prev => ({ ...prev, ref: e.target.value }))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm"
                  placeholder="UTR / cheque no."
                />
              </div>
              <div>
                <label className="block text-xs text-slate-900 font-medium mb-1">Bank Name</label>
                <input
                  value={payForm.bank_name}
                  onChange={e => setPayForm(prev => ({ ...prev, bank_name: e.target.value }))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm"
                  placeholder="Bank name"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-xs text-slate-900 font-medium mb-1">Remarks</label>
                <textarea
                  value={payForm.remarks}
                  onChange={e => setPayForm(prev => ({ ...prev, remarks: e.target.value }))}
                  rows={3}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm resize-none"
                />
              </div>
            </div>

            <div className="flex gap-3 px-5 pb-5">
              <button
                type="button"
                onClick={() => setSelectedInvoice(null)}
                className="flex-1 py-2.5 bg-slate-100 text-slate-900 text-sm font-medium rounded-lg hover:bg-slate-200 transition-all"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submitPayment}
                disabled={paymentMut.isPending}
                className="flex-1 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 shadow-sm transition-all disabled:opacity-60"
              >
                {paymentMut.isPending ? 'Saving...' : 'Save Payment'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
