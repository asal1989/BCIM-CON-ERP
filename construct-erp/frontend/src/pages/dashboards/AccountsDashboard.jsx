import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  IndianRupee, Clock, CheckCircle2, AlertTriangle, ArrowRight,
  FileText, ChevronDown, ChevronRight, CreditCard, X,
  Search, Filter, RefreshCw, BadgeCheck, ArrowUpRight, BarChart3,
} from 'lucide-react';
import { tqsBillsAPI, paymentAPI, vendorQSCertificationAPI } from '../../api/client';
import useAuthStore from '../../store/authStore';
import { Badge, inr } from './DashKPI';
import { PageHeader, KpiCard as ThemeKpiCard, Theme } from '../../theme';
import ProjectFilter from '../../components/ProjectFilter';
import dayjs from 'dayjs';
import { clsx } from 'clsx';

const AGING_COLOR = { '0-30': 'bg-emerald-500', '31-60': 'bg-amber-400', '61-90': 'bg-orange-500', '90+': 'bg-red-600', unscheduled: 'bg-slate-400' };

// Smart Indian format
const inrFmt = v => {
  const n = Number(v || 0);
  return `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

function SectionTitle({ icon: Icon, title, subtitle, action }) {
  return (
    <div className="flex items-center justify-between mb-4">
      <div className="flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-xl bg-emerald-50 flex items-center justify-center">
          <Icon className="w-4 h-4 text-emerald-600" />
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

// ── PC Payment Modal ──────────────────────────────────────────────────────────
function PCPaymentModal({ pc, onClose, onSuccess }) {
  const balanceDue   = parseFloat(pc.net_balance ?? pc.balance_due ?? 0);
  const alreadyPaid  = parseFloat(pc.total_paid  ?? 0);
  const totalCert    = parseFloat(pc.total_certified ?? 0);

  const [form, setForm] = useState({
    paid_amount:      String(balanceDue > 0 ? balanceDue : totalCert),
    payment_date:     dayjs().format('YYYY-MM-DD'),
    payment_mode:     'bank_transfer',
    reference_number: '',
    bank_name:        '',
    remarks:          '',
  });
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');
  const qc = useQueryClient();

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const enteredAmt  = parseFloat(form.paid_amount) || 0;
  const isPartial   = enteredAmt < balanceDue - 0.01;

  const handleSubmit = async e => {
    e.preventDefault();
    if (!form.payment_date) { setError('Payment date is required'); return; }
    if (!enteredAmt)        { setError('Amount must be > 0'); return; }
    setSaving(true); setError('');
    try {
      if (pc.source === 'vendor_qs_cert') {
        const { vendorQSCertificationAPI: vapi } = await import('../../api/client');
        await vapi.recordPayment(pc.id, {
          paid_amount:      enteredAmt,
          payment_date:     form.payment_date,
          payment_mode:     form.payment_mode,
          reference_number: form.reference_number || null,
          bank_name:        form.bank_name        || null,
          remarks:          form.remarks          || null,
        });
        qc.invalidateQueries({ queryKey: ['vendor-qs-certs'] });
      } else {
        await tqsBillsAPI.pcPayment({
          pc_number:        pc.pc_number,
          paid_amount:      enteredAmt,
          payment_date:     form.payment_date,
          payment_mode:     form.payment_mode,
          reference_number: form.reference_number || null,
          bank_name:        form.bank_name        || null,
          remarks:          form.remarks          || null,
        });
      }
      // Invalidate all related caches
      qc.invalidateQueries({ queryKey: ['tqs-bills'] });
      qc.invalidateQueries({ queryKey: ['tqs-pc-pending-finance'] });
      qc.invalidateQueries({ queryKey: ['liability-summary'] });
      qc.invalidateQueries({ queryKey: ['liability-ledger'] });
      qc.invalidateQueries({ queryKey: ['payments'] });
      onSuccess();
    } catch (err) {
      setError(err?.response?.data?.error || 'Payment failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg border border-slate-200">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div>
            <p className="text-sm font-medium text-slate-800">Record PC Payment</p>
            <p className="text-xs text-slate-900 font-medium mt-0.5 font-mono">{pc.pc_number}</p>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-900 font-medium hover:bg-slate-100">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* PC Summary */}
        <div className="px-5 py-3 bg-indigo-50 border-b border-indigo-100">
          <div className="flex flex-wrap gap-4 text-xs">
            <div><span className="text-slate-500">Vendor:</span> <span className="font-medium text-slate-700">{pc.vendor_name}</span></div>
            <div><span className="text-slate-500">Bills:</span> <span className="font-medium text-indigo-700">{pc.bill_count}</span></div>
            <div><span className="text-slate-500">Certified:</span> <span className="font-medium text-violet-700">{inrFmt(totalCert)}</span></div>
            <div><span className="text-slate-500">TDS:</span> <span className="font-medium text-amber-700">{inrFmt(pc.total_tds)}</span></div>
            {alreadyPaid > 0 && (
              <div><span className="text-slate-500">Already Paid:</span> <span className="font-medium text-emerald-600">{inrFmt(alreadyPaid)}</span></div>
            )}
            {parseFloat(pc.advance_balance || 0) > 0 && (
              <div><span className="text-slate-500">Advance:</span> <span className="font-medium text-emerald-600">−{inrFmt(pc.advance_balance)}</span></div>
            )}
            <div><span className="text-slate-500">Balance Due:</span> <span className="font-medium text-red-600">{inrFmt(balanceDue)}</span></div>
          </div>
        </div>

        {/* Already-paid strip */}
        {alreadyPaid > 0 && (
          <div className="mx-5 mt-3 rounded-xl bg-amber-50 border border-amber-200 px-4 py-2.5 grid grid-cols-3 gap-3 text-xs">
            <div className="text-center"><p className="text-slate-900 font-medium mb-0.5">Certified</p><p className="font-medium text-indigo-700">{inrFmt(totalCert)}</p></div>
            <div className="text-center"><p className="text-slate-900 font-medium mb-0.5">Paid So Far</p><p className="font-medium text-emerald-700">{inrFmt(alreadyPaid)}</p></div>
            <div className="text-center"><p className="text-slate-900 font-medium mb-0.5">Balance</p><p className="font-medium text-red-600">{inrFmt(balanceDue)}</p></div>
          </div>
        )}

        {/* Bills list */}
        <div className="mx-5 my-3 max-h-32 overflow-y-auto bg-slate-50 rounded-lg border border-slate-100">
          <table className="w-full text-xs">
            <thead><tr className="text-slate-900 font-medium border-b border-slate-100">
              <th className="text-left px-3 py-1.5 font-medium">SL #</th>
              <th className="text-left px-3 py-1.5 font-medium">Invoice #</th>
              <th className="text-right px-3 py-1.5 font-medium">Certified</th>
              <th className="text-right px-3 py-1.5 font-medium">Paid</th>
            </tr></thead>
            <tbody>
              {(pc.bills || []).map((b, i) => (
                <tr key={i} className="border-t border-slate-100">
                  <td className="px-3 py-1.5 font-mono text-slate-500">{b.sl_number}</td>
                  <td className="px-3 py-1.5 text-slate-600">{b.inv_number || '—'}</td>
                  <td className="px-3 py-1.5 text-right font-medium text-indigo-700">{inrFmt(b.certified_net)}</td>
                  <td className="px-3 py-1.5 text-right font-medium text-emerald-600">{inrFmt(b.paid_amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-5 pb-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-medium text-slate-900 font-medium uppercase">Amount to Pay (₹) *</label>
              <input type="number" step="0.01" max={balanceDue > 0 ? balanceDue : undefined}
                value={form.paid_amount}
                onChange={e => set('paid_amount', e.target.value)}
                className="mt-1 w-full h-9 border border-slate-200 rounded-lg px-3 text-sm font-medium text-indigo-700 focus:outline-none focus:border-indigo-400" />
            </div>
            <div>
              <label className="text-[11px] font-medium text-slate-900 font-medium uppercase">Payment Date *</label>
              <input type="date" value={form.payment_date}
                onChange={e => set('payment_date', e.target.value)}
                className="mt-1 w-full h-9 border border-slate-200 rounded-lg px-3 text-sm focus:outline-none focus:border-indigo-400" />
            </div>
          </div>

          {/* Partial payment warning */}
          {isPartial && enteredAmt > 0 && (
            <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-800">
              <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-amber-500" />
              <span>Amount is less than balance due ({inrFmt(balanceDue)}) — this will be recorded as a <strong>partial payment</strong>. Bills will stay in Accounts stage.</span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-medium text-slate-900 font-medium uppercase">Payment Mode</label>
              <select value={form.payment_mode} onChange={e => set('payment_mode', e.target.value)}
                className="mt-1 w-full h-9 border border-slate-200 rounded-lg px-3 text-sm focus:outline-none focus:border-indigo-400 bg-white">
                <option value="bank_transfer">Bank Transfer / NEFT</option>
                <option value="rtgs">RTGS</option>
                <option value="imps">IMPS</option>
                <option value="cheque">Cheque</option>
                <option value="cash">Cash</option>
                <option value="upi">UPI</option>
              </select>
            </div>
            <div>
              <label className="text-[11px] font-medium text-slate-900 font-medium uppercase">UTR / Ref No.</label>
              <input type="text" value={form.reference_number}
                onChange={e => set('reference_number', e.target.value)}
                placeholder="UTR / Cheque No."
                className="mt-1 w-full h-9 border border-slate-200 rounded-lg px-3 text-sm focus:outline-none focus:border-indigo-400" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-medium text-slate-900 font-medium uppercase">Bank Name</label>
              <input type="text" value={form.bank_name}
                onChange={e => set('bank_name', e.target.value)}
                placeholder="e.g. HDFC Bank"
                className="mt-1 w-full h-9 border border-slate-200 rounded-lg px-3 text-sm focus:outline-none focus:border-indigo-400" />
            </div>
            <div>
              <label className="text-[11px] font-medium text-slate-900 font-medium uppercase">Remarks</label>
              <input type="text" value={form.remarks}
                onChange={e => set('remarks', e.target.value)}
                placeholder="Optional note"
                className="mt-1 w-full h-9 border border-slate-200 rounded-lg px-3 text-sm focus:outline-none focus:border-indigo-400" />
            </div>
          </div>

          {error && <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

          <div className="flex items-center gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 h-9 rounded-lg border border-slate-200 text-sm text-slate-900 hover:bg-slate-50 transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={saving}
              className={clsx('flex-1 h-9 rounded-lg text-white text-sm font-medium disabled:opacity-50 transition-colors',
                isPartial ? 'bg-amber-500 hover:bg-amber-600' : 'bg-indigo-600 hover:bg-indigo-700')}>
              {saving ? 'Saving…' : isPartial
                ? `Record Partial — ${inrFmt(enteredAmt)}`
                : pc.bill_count
                  ? `Pay ${inrFmt(enteredAmt)} → Mark ${pc.bill_count} Bill${pc.bill_count !== 1 ? 's' : ''} Paid`
                  : `Pay ${inrFmt(enteredAmt)} → Mark as Paid`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── PC Row (expandable) ───────────────────────────────────────────────────────
function PCRow({ pc, onPay }) {
  const [expanded, setExpanded] = useState(false);
  const paidPct = pc.total_certified > 0
    ? ((parseFloat(pc.total_paid || 0) / parseFloat(pc.total_certified)) * 100).toFixed(0)
    : 0;

  return (
    <>
      <tr className="hover:bg-slate-50 transition-colors group cursor-pointer" onClick={() => setExpanded(e => !e)}>
        <td className="px-3 py-2.5 w-4">
          {expanded ? <ChevronDown className="w-3.5 h-3.5 text-slate-400" /> : <ChevronRight className="w-3.5 h-3.5 text-slate-400" />}
        </td>
        <td className="px-3 py-2.5">
          {pc.pc_number?.startsWith('UNASSIGNED-')
            ? <span className="text-xs font-medium text-amber-600 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">No PC</span>
            : <span className="font-mono text-xs font-medium text-indigo-700">{pc.pc_number}</span>
          }
        </td>
        <td className="px-3 py-2.5 text-sm text-slate-900 max-w-[160px]">
          <span className="truncate block">{pc.vendor_name}</span>
        </td>
        <td className="px-3 py-2.5 text-center">
          <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 text-xs font-bold">{pc.bill_count}</span>
        </td>
        <td className="px-3 py-2.5 text-right text-sm font-medium text-violet-700">{inrFmt(pc.total_certified)}</td>
        <td className="px-3 py-2.5 text-right text-sm font-medium text-amber-600">{inrFmt(pc.total_tds)}</td>
        <td className="px-3 py-2.5 text-right">
          <span className="text-sm font-medium text-slate-500">{inrFmt(pc.balance_due)}</span>
        </td>
        <td className="px-3 py-2.5 text-right">
          {parseFloat(pc.advance_balance || 0) > 0
            ? <span className="text-sm font-medium text-emerald-600">−{inrFmt(pc.advance_balance)}</span>
            : <span className="text-slate-300 text-xs">—</span>
          }
        </td>
        <td className="px-3 py-2.5 text-right">
          <span className="text-sm font-medium text-red-600">{inrFmt(pc.net_balance ?? pc.balance_due)}</span>
        </td>
        <td className="px-3 py-2.5 text-right">
          <span className={clsx('text-[10px] font-medium px-1.5 py-0.5 rounded',
            paidPct >= 80 ? 'bg-emerald-50 text-emerald-700' :
            paidPct >= 40 ? 'bg-amber-50 text-amber-700' : 'bg-red-50 text-red-600'
          )}>{paidPct}%</span>
        </td>
        <td className="px-3 py-2.5">
          {parseFloat(pc.net_balance ?? pc.balance_due) > 0 && (
            <button
              onClick={e => { e.stopPropagation(); onPay(pc); }}
              className="flex items-center gap-1 h-7 px-3 rounded-lg bg-indigo-600 text-white text-xs font-medium hover:bg-indigo-700 transition-colors whitespace-nowrap">
              <CreditCard className="w-3 h-3" /> Pay
            </button>
          )}
          {parseFloat(pc.net_balance ?? pc.balance_due) <= 0 && (
            <span className="flex items-center gap-1 text-xs text-emerald-600 font-semibold">
              <CheckCircle2 className="w-3.5 h-3.5" /> Paid
            </span>
          )}
        </td>
      </tr>
      {expanded && pc.source === 'vendor_qs_cert' && (
        <tr className="bg-indigo-50/50">
          <td className="px-3 py-2" colSpan={3} />
          <td className="px-3 py-2 text-[11px] text-slate-600" colSpan={3}>
            RA Bill: <span className="font-medium">{pc.ra_bill_number || pc.pc_number}</span>
            {pc.order_number && <> · Order: <span className="font-medium">{pc.order_number}</span></>}
            {pc.project_name && <> · <span className="text-indigo-600">{pc.project_name}</span></>}
          </td>
          <td className="px-3 py-2 text-right text-[11px] text-emerald-600">{parseFloat(pc.advance_balance||0)>0 ? `−${inrFmt(pc.advance_balance)}` : '—'}</td>
          <td className="px-3 py-2 text-right text-[11px] font-medium text-red-600">{inrFmt(pc.balance_due)}</td>
          <td />
          <td className="px-3 py-2">
            <Link to={`/qs/vendor-certifications/${pc.id}`} className="text-[10px] text-indigo-500 hover:underline">View Cert</Link>
          </td>
        </tr>
      )}
      {expanded && pc.source !== 'vendor_qs_cert' && (pc.bills || []).map((b, i) => (
        <tr key={i} className="bg-indigo-50/50">
          <td className="px-3 py-1.5" />
          <td className="px-3 py-1.5">
            <span className="font-mono text-[11px] text-slate-500">{b.sl_number}</span>
          </td>
          <td className="px-3 py-1.5 text-[11px] text-slate-600" colSpan={2}>
            {b.inv_number || '—'} {b.inv_date ? `· ${dayjs(b.inv_date).format('DD MMM YY')}` : ''}
          </td>
          <td className="px-3 py-1.5 text-right text-[11px] font-medium text-violet-700">{inrFmt(b.certified_net)}</td>
          <td className="px-3 py-1.5 text-right text-[11px] text-amber-600">{inrFmt(b.tds)}</td>
          <td className="px-3 py-1.5 text-right text-[11px] text-red-500">{inrFmt(parseFloat(b.certified_net||0) - parseFloat(b.paid_amount||0))}</td>
          <td />
          <td className="px-3 py-1.5">
            <Link to={`/tqs/bills/${b.id}`} className="text-[10px] text-indigo-500 hover:underline">View</Link>
          </td>
        </tr>
      ))}
    </>
  );
}

// ── Main Dashboard ────────────────────────────────────────────────────────────
export default function AccountsDashboard() {
  const { user, selectedProjectId } = useAuthStore();
  const qc = useQueryClient();
  const [payingPC,   setPayingPC]   = useState(null);
  const [search,     setSearch]     = useState('');
  const [vendorFilt, setVendorFilt] = useState('');
  const [showPaid,   setShowPaid]   = useState(false);

  const { data: bills = [], isLoading: loadB } = useQuery({
    queryKey: ['tqs-bills', 'accts-dash', selectedProjectId],
    queryFn: () => tqsBillsAPI.list({ project_id: selectedProjectId || undefined }).then(r => Array.isArray(r.data) ? r.data : (r.data?.data ?? [])),
    staleTime: 0,
    refetchOnWindowFocus: true,
  });

  const { data: tqsPCList = [], isLoading: loadPC, refetch: refetchPC } = useQuery({
    queryKey: ['tqs-bills', 'accts-pc-pending', selectedProjectId],
    queryFn: () => tqsBillsAPI.pcPending({ project_id: selectedProjectId || undefined }).then(r => r.data?.data ?? []),
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
  });

  const { data: vqsPCList = [], refetch: refetchVQS } = useQuery({
    queryKey: ['vendor-qs-certs', 'accounts-pending', selectedProjectId],
    queryFn: () => vendorQSCertificationAPI.accountsPending({ project_id: selectedProjectId || undefined }).then(r => r.data?.data ?? []),
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
  });

  const pcList = useMemo(() => [...tqsPCList, ...vqsPCList], [tqsPCList, vqsPCList]);

  const { data: aging = [], isLoading: loadA } = useQuery({
    queryKey: ['tqs-bills', 'accts-dash-aging', selectedProjectId],
    queryFn: () => tqsBillsAPI.getAPAging({ project_id: selectedProjectId || undefined }).then(r => r.data?.data ?? []),
    staleTime: 0,
    refetchOnWindowFocus: true,
  });

  const { data: payments = [], isLoading: loadPay } = useQuery({
    queryKey: ['accts-dash-payments', selectedProjectId],
    queryFn: () => paymentAPI.list({ project_id: selectedProjectId || undefined }).then(r => {
      const d = r.data; return Array.isArray(d) ? d : (d?.data ?? []);
    }),
    staleTime: 0,
  });

  const readyForPayment  = bills.filter(b => b.workflow_status === 'accounts');
  const paidThisMonth    = bills.filter(b => b.workflow_status === 'paid' && dayjs(b.updated_at).isSame(dayjs(), 'month'));
  const unpaidBills      = bills.filter(b => b.workflow_status !== 'paid');
  const totalDue         = readyForPayment.reduce((s, b) => s + parseFloat(b.certified_net || b.total_amount || 0), 0);
  const paidAmt          = paidThisMonth.reduce((s, b) => s + parseFloat(b.paid_amount || 0), 0);
  const totalOutstanding = unpaidBills.reduce((s, b) => s + parseFloat(b.balance_to_pay || b.certified_net || b.total_amount || 0), 0);
  const stuckBills       = unpaidBills.filter(b => {
    const days = b.updated_at ? Math.floor((Date.now() - new Date(b.updated_at)) / 86400000) : 0;
    return days > 7;
  });

  const overdue90     = aging.filter(a => a.aging_bucket === '90+');
  const totalOverdue  = overdue90.reduce((s, a) => s + parseFloat(a.balance || 0), 0);

  const agingBuckets = ['0-30', '31-60', '61-90', '90+'].map(bucket => ({
    bucket,
    count: aging.filter(a => a.aging_bucket === bucket).length,
    total: aging.filter(a => a.aging_bucket === bucket).reduce((s, a) => s + parseFloat(a.balance || 0), 0),
  }));

  // PC totals (always from full list for KPIs)
  const totalPCDue     = pcList.reduce((s, p) => s + parseFloat(p.balance_due || 0), 0);
  const pendingPCCount = pcList.filter(p => parseFloat(p.balance_due) > 0).length;

  // Unique vendors for filter dropdown
  const vendorOptions = useMemo(() =>
    [...new Set(pcList.map(p => p.vendor_name).filter(Boolean))].sort()
  , [pcList]);

  // Client-side filtered list
  const filteredPCs = useMemo(() => {
    const q = search.trim().toLowerCase();
    return pcList.filter(p => {
      if (!showPaid && parseFloat(p.balance_due) <= 0) return false;
      if (vendorFilt && p.vendor_name !== vendorFilt) return false;
      if (q) {
        return (
          p.pc_number?.toLowerCase().includes(q) ||
          p.vendor_name?.toLowerCase().includes(q) ||
          (p.bills || []).some(b =>
            b.sl_number?.toLowerCase().includes(q) ||
            b.inv_number?.toLowerCase().includes(q)
          )
        );
      }
      return true;
    });
  }, [pcList, search, vendorFilt, showPaid]);

  const filteredDue   = filteredPCs.reduce((s, p) => s + parseFloat(p.balance_due || 0), 0);
  const activeFilters = [search, vendorFilt, showPaid ? 'paid' : ''].filter(Boolean).length;
  const clearFilters  = () => { setSearch(''); setVendorFilt(''); setShowPaid(false); };

  const paymentCols = [
    { key: 'entity_name',  label: 'Vendor',  cls: 'font-medium text-slate-700' },
    { key: 'amount',       label: 'Amount',  right: true, render: r => inrFmt(r.amount) },
    { key: 'payment_mode', label: 'Mode',    render: r => r.payment_mode || '—' },
    { key: 'payment_date', label: 'Date',    render: r => r.payment_date ? dayjs(r.payment_date).format('DD MMM') : '—' },
  ];

  return (
    <div style={{ background: Theme.pageBg, minHeight: '100vh' }}>

      <PageHeader
        title="Accounts Dashboard"
        subtitle="Payments, ledgers & financial overview"
        breadcrumbs={[{ label: 'Finance' }, { label: 'Dashboard' }]}
        actions={
          <>
            <div className="flex items-center gap-1.5 px-1">
              <ProjectFilter />
            </div>
            <button onClick={() => { qc.invalidateQueries({ queryKey: ['tqs-bills'] }); }}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-lg transition shadow-sm"
              style={{ background: '#fff', color: Theme.navyDark }}>
              <RefreshCw className="w-3.5 h-3.5" /> Refresh
            </button>
            <Link to="/accounts/purchases/qs-certifications"
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg transition"
              style={{ background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.25)', color: '#fff' }}>
              <BadgeCheck className="w-3.5 h-3.5" /> QS Certifications
            </Link>
          </>
        }
      />

      <div className="p-5 md:p-6 max-w-[1400px] mx-auto space-y-5">

      {/* ── KPIs ── */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <ThemeKpiCard icon={IndianRupee}    label="Total Outstanding"     value={unpaidBills.length}     color="red"     sub={inrFmt(totalOutstanding)} />
        <ThemeKpiCard icon={FileText}       label="PCs Pending Payment"   value={pendingPCCount}         color="amber"   sub={inrFmt(totalPCDue)} />
        <ThemeKpiCard icon={Clock}          label="At Accounts Stage"     value={readyForPayment.length} color="purple"  sub={inrFmt(totalDue)} />
        <ThemeKpiCard icon={CheckCircle2}   label="Paid This Month"       value={paidThisMonth.length}   color="emerald" sub={inrFmt(paidAmt)} />
        <ThemeKpiCard icon={AlertTriangle}  label="Overdue 90+ Days"      value={overdue90.length}       color="orange"  sub={inrFmt(totalOverdue)} />
        <ThemeKpiCard icon={AlertTriangle}  label="Stuck Bills (7+ days)" value={stuckBills.length}      color="slate"   sub={`${unpaidBills.length} unpaid total`} />
      </div>

      {/* ── Alert banners ── */}
      {(overdue90.length > 0 || stuckBills.length > 0) && (
        <div className="flex flex-col gap-2">
          {overdue90.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-center gap-3">
              <AlertTriangle size={15} className="text-amber-600 flex-shrink-0" />
              <span className="text-sm font-medium text-amber-800">
                {overdue90.length} bill{overdue90.length > 1 ? 's' : ''} overdue 90+ days — {inrFmt(totalOverdue)} outstanding
              </span>
            </div>
          )}
          {stuckBills.length > 0 && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 flex items-center gap-3">
              <Clock size={15} className="text-blue-600 flex-shrink-0" />
              <span className="text-sm font-medium text-blue-800">
                {stuckBills.length} bill{stuckBills.length > 1 ? 's' : ''} stuck at Accounts stage for 7+ days
              </span>
            </div>
          )}
        </div>
      )}

      {/* ── AP Aging Bar ── */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
        <SectionTitle icon={BarChart3} title="AP Aging Distribution" subtitle="Outstanding bills by age" />
        <div className="flex gap-3 flex-wrap">
          {agingBuckets.map(b => (
            <div key={b.bucket} className="flex-1 min-w-[100px] bg-slate-50 rounded-xl p-3 text-center border border-slate-100">
              <div className={`h-1.5 rounded-full mb-2 ${AGING_COLOR[b.bucket] || 'bg-slate-400'}`} />
              <p className="text-lg font-bold text-slate-800">{b.count}</p>
              <p className="text-[11px] text-slate-400">{b.bucket} days</p>
              <p className="text-[11px] text-slate-400">{inrFmt(b.total)}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── PC Payment Table ── */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">

        {/* Header */}
        <div className="p-5 pb-0">
          <SectionTitle icon={CreditCard} title="Payment Certificates — Pending Payment"
            subtitle={`${filteredPCs.length} of ${pcList.length} PCs · ${inrFmt(filteredDue)} due · click row to expand bills`}
          />
        </div>

        {/* Filter bar */}
        <div className="flex flex-wrap items-center gap-2 px-5 py-3 border-y border-slate-100 bg-slate-50/60">
          {/* Search */}
          <div className="relative flex-1 min-w-[180px] max-w-xs">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-900 font-medium pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search PC no., vendor, invoice…"
              className="w-full h-8 pl-8 pr-3 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-indigo-400 shadow-sm"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500">
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Vendor filter */}
          <select value={vendorFilt} onChange={e => setVendorFilt(e.target.value)}
            className="h-8 text-xs border border-slate-200 rounded-lg px-2.5 bg-white text-slate-900 focus:outline-none focus:border-indigo-400 shadow-sm max-w-[200px]">
            <option value="">All Vendors</option>
            {vendorOptions.map(v => <option key={v} value={v}>{v}</option>)}
          </select>

          {/* Show paid toggle */}
          <button
            onClick={() => setShowPaid(p => !p)}
            className={clsx(
              'h-8 px-3 rounded-lg text-xs font-medium border transition-all',
              showPaid
                ? 'bg-emerald-600 text-white border-emerald-600'
                : 'bg-white text-slate-900 font-medium border-slate-200 hover:border-emerald-400 hover:text-emerald-600'
            )}>
            <CheckCircle2 className="w-3 h-3 inline mr-1" />
            {showPaid ? 'Showing All' : 'Show Paid'}
          </button>

          {/* Clear */}
          {activeFilters > 0 && (
            <button onClick={clearFilters}
              className="h-8 flex items-center gap-1 px-3 rounded-lg border border-red-200 bg-red-50 text-red-600 text-xs font-medium hover:bg-red-100 transition-all">
              <X className="w-3 h-3" /> Clear ({activeFilters})
            </button>
          )}

          <span className="ml-auto text-xs text-slate-400">
            {filteredPCs.length} result{filteredPCs.length !== 1 ? 's' : ''}
          </span>
        </div>

        {loadPC ? (
          <div className="flex justify-center py-12">
            <div className="w-7 h-7 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filteredPCs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-slate-300 gap-2">
            <CheckCircle2 className="w-10 h-10" />
            <p className="text-sm font-medium text-slate-400">
              {pcList.length === 0 ? 'No PCs pending payment 🎉' : 'No results match your filters'}
            </p>
            {activeFilters > 0 && (
              <button onClick={clearFilters} className="text-xs text-indigo-500 underline mt-1">Clear filters</button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-y border-slate-100">
                  <th className="w-4 px-3 py-2.5" />
                  <th className="px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-widest text-slate-400 whitespace-nowrap">PC Number</th>
                  <th className="px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-widest text-slate-400">Vendor</th>
                  <th className="px-3 py-2.5 text-center text-[10px] font-bold uppercase tracking-widest text-slate-400">Bills</th>
                  <th className="px-3 py-2.5 text-right text-[10px] font-bold uppercase tracking-widest text-slate-400 whitespace-nowrap">Certified (₹)</th>
                  <th className="px-3 py-2.5 text-right text-[10px] font-bold uppercase tracking-widest text-slate-400">TDS</th>
                  <th className="px-3 py-2.5 text-right text-[10px] font-bold uppercase tracking-widest text-slate-400 whitespace-nowrap">Balance Due</th>
                  <th className="px-3 py-2.5 text-right text-[10px] font-bold uppercase tracking-widest text-emerald-500 whitespace-nowrap">Advance (−)</th>
                  <th className="px-3 py-2.5 text-right text-[10px] font-bold uppercase tracking-widest text-red-500 whitespace-nowrap">Net Payable</th>
                  <th className="px-3 py-2.5 text-right text-[10px] font-bold uppercase tracking-widest text-slate-400">Paid%</th>
                  <th className="px-3 py-2.5 text-[10px] font-bold uppercase tracking-widest text-slate-400">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filteredPCs.map(pc => (
                  <PCRow key={pc.pc_number} pc={pc} onPay={setPayingPC} />
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-indigo-50 border-t-2 border-indigo-200">
                  <td colSpan={4} className="px-3 py-2.5 text-xs font-medium text-indigo-700">
                    TOTAL {activeFilters > 0 ? `(filtered ${filteredPCs.length} PCs)` : `(${filteredPCs.length} PCs)`}
                  </td>
                  <td className="px-3 py-2.5 text-right text-xs font-medium text-violet-700">
                    {inrFmt(filteredPCs.reduce((s, p) => s + parseFloat(p.total_certified || 0), 0))}
                  </td>
                  <td className="px-3 py-2.5 text-right text-xs font-medium text-amber-700">
                    {inrFmt(filteredPCs.reduce((s, p) => s + parseFloat(p.total_tds || 0), 0))}
                  </td>
                  <td className="px-3 py-2.5 text-right text-xs font-medium text-slate-500">
                    {inrFmt(filteredDue)}
                  </td>
                  <td className="px-3 py-2.5 text-right text-xs font-medium text-emerald-700">
                    −{inrFmt(filteredPCs.reduce((s, p) => s + parseFloat(p.advance_balance || 0), 0))}
                  </td>
                  <td className="px-3 py-2.5 text-right text-xs font-medium text-red-700">
                    {inrFmt(filteredPCs.reduce((s, p) => s + parseFloat(p.net_balance ?? p.balance_due ?? 0), 0))}
                  </td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* ── Recent Payments ── */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-5 pb-0">
          <SectionTitle icon={IndianRupee} title="Recent Payments"
            subtitle="Latest outgoing payments"
            action={
              <Link to="/accounts/purchases/payments-made" className="flex items-center gap-1 text-[10px] font-semibold text-emerald-600 hover:text-emerald-700">
                All <ChevronRight className="w-3 h-3" />
              </Link>
            }
          />
        </div>
        {loadPay ? (
          <div className="p-5 space-y-2">{[1,2,3,4].map(n => <div key={n} className="h-10 bg-slate-100 rounded-xl animate-pulse" />)}</div>
        ) : payments.length === 0 ? (
          <div className="py-12 text-center text-xs text-slate-400">No recent payments</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-y border-slate-100">
                  {paymentCols.map(c => (
                    <th key={c.key} className={`px-4 py-2.5 text-[10px] font-bold uppercase tracking-widest text-slate-400 ${c.right ? 'text-right' : 'text-left'}`}>
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {payments.slice(0, 8).map((row, i) => (
                  <tr key={i} className="hover:bg-slate-50 transition-colors group">
                    {paymentCols.map(c => (
                      <td key={c.key} className={`px-4 py-3 text-xs ${c.right ? 'text-right' : ''} ${c.cls || 'text-slate-700'}`}>
                        {c.render ? c.render(row) : (row[c.key] ?? <span className="text-slate-300">—</span>)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── PC Payment Modal ── */}
      {payingPC && (
        <PCPaymentModal
          pc={payingPC}
          onClose={() => setPayingPC(null)}
          onSuccess={() => {
            setPayingPC(null);
            // Invalidate everything DQS-related so tracker, analytics, reports all refresh
            qc.invalidateQueries({ queryKey: ['accts-pc-pending'] });
            qc.invalidateQueries({ queryKey: ['accts-dash-bills'] });
            qc.invalidateQueries({ queryKey: ['accts-dash-aging'] });
            qc.invalidateQueries({ queryKey: ['accts-dash-payments'] });
            qc.invalidateQueries({ queryKey: ['tqs-bills'] });           // DQS tracker + analytics + reports
            qc.invalidateQueries({ queryKey: ['tqs-advances'] });
          }}
        />
      )}
      </div>
    </div>
  );
}
