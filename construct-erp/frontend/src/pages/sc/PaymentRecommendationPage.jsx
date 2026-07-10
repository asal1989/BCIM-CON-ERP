import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import dayjs from 'dayjs';
import clsx from 'clsx';
import {
  Plus, X, ChevronDown, ChevronRight, CheckCircle2, Clock,
  Send, Banknote, AlertTriangle, FileCheck, Printer,
} from 'lucide-react';
import { paymentRecommendationAPI } from '../../api/client';
import useAuthStore from '../../store/authStore';

const Theme = { navy: '#1e3a5f', navyDark: '#152c47', navyLight: '#2563a8' };

const fmt = v => {
  const n = parseFloat(v || 0);
  return '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
};

const STATUS_META = {
  draft:      { label: 'Draft',      cls: 'bg-slate-100 text-slate-600' },
  submitted:  { label: 'Submitted',  cls: 'bg-amber-100 text-amber-700' },
  approved:   { label: 'Approved',   cls: 'bg-blue-100 text-blue-700' },
  processing: { label: 'Processing', cls: 'bg-purple-100 text-purple-700' },
  paid:       { label: 'Paid',       cls: 'bg-emerald-100 text-emerald-700' },
  cancelled:  { label: 'Cancelled',  cls: 'bg-red-100 text-red-600' },
};

const BILL_TYPE_META = {
  tqs:  { label: 'Vendor Bill',    cls: 'bg-indigo-100 text-indigo-700' },
  sc:   { label: 'SC Bill',        cls: 'bg-emerald-100 text-emerald-700' },
  hire: { label: 'Hire Rental',    cls: 'bg-orange-100 text-orange-700' },
};

// ─── Create PR Modal ──────────────────────────────────────────────────────────
function CreatePRModal({ onClose }) {
  const qc = useQueryClient();
  const { selectedProjectId } = useAuthStore();
  const [projectId] = useState(selectedProjectId || '');
  const [priority, setPriority] = useState('normal');
  const [remarks, setRemarks]   = useState('');
  const [selected, setSelected] = useState([]);
  const [expandedType, setExpandedType] = useState('tqs');

  const { data: raw, isLoading } = useQuery({
    queryKey: ['pr-pending-bills', projectId],
    queryFn: () => paymentRecommendationAPI.pendingBills(projectId ? { project_id: projectId } : {})
      .then(r => r.data?.data || { tqs: [], sc: [], hire: [] }),
    staleTime: 0,
  });

  const bills = raw || { tqs: [], sc: [], hire: [] };
  const allBills = [
    ...bills.tqs.map(b => ({ ...b, bill_type: 'tqs' })),
    ...bills.sc.map(b => ({ ...b, bill_type: 'sc' })),
    ...bills.hire.map(b => ({ ...b, bill_type: 'hire' })),
  ];

  const toggle = (bill) => {
    setSelected(prev => {
      const exists = prev.find(s => s.bill_id === bill.id);
      if (exists) return prev.filter(s => s.bill_id !== bill.id);
      return [...prev, {
        bill_id: bill.id, bill_type: bill.bill_type,
        vendor_name: bill.vendor_name, bill_number: bill.bill_number,
        bill_amount: bill.bill_amount, recommended_amount: bill.bill_amount,
      }];
    });
  };

  const isSelected = (id) => selected.some(s => s.bill_id === id);

  const setRecAmt = (bill_id, val) => {
    setSelected(prev => prev.map(s => s.bill_id === bill_id ? { ...s, recommended_amount: val } : s));
  };

  const total = selected.reduce((s, it) => s + parseFloat(it.recommended_amount || 0), 0);

  const createMut = useMutation({
    mutationFn: () => paymentRecommendationAPI.create({
      project_id: projectId || undefined,
      priority, remarks,
      items: selected,
    }),
    onSuccess: () => {
      toast.success('Payment Recommendation submitted');
      qc.invalidateQueries({ queryKey: ['payment-recommendations'] });
      onClose();
    },
    onError: e => toast.error(e?.response?.data?.error || 'Failed'),
  });

  const sections = [
    { key: 'tqs',  label: 'Vendor Bills',   rows: bills.tqs  },
    { key: 'sc',   label: 'SC Bills',        rows: bills.sc   },
    { key: 'hire', label: 'Hire Rental Bills', rows: bills.hire },
  ];

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 flex-shrink-0"
          style={{ background: `linear-gradient(135deg, ${Theme.navy} 0%, ${Theme.navyDark} 100%)` }}>
          <div>
            <h2 className="font-bold text-white text-base">New Payment Recommendation</h2>
            <p className="text-xs text-white/60 mt-0.5">Select bills to recommend for payment</p>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-lg flex items-center justify-center text-white/70 hover:text-white" style={{ background: 'rgba(255,255,255,0.12)' }}>
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="p-8 text-center text-slate-400 text-sm">Loading bills…</div>
          ) : allBills.length === 0 ? (
            <div className="p-10 text-center">
              <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto mb-3" />
              <p className="font-semibold text-slate-700">No approved bills pending payment</p>
              <p className="text-sm text-slate-400 mt-1">All approved bills have already been recommended or paid.</p>
            </div>
          ) : (
            <div className="p-5 space-y-3">
              {/* Priority + Remarks */}
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1">Priority</label>
                  <select value={priority} onChange={e => setPriority(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-300">
                    <option value="normal">Normal</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1">Remarks</label>
                  <input type="text" value={remarks} onChange={e => setRemarks(e.target.value)}
                    placeholder="e.g. Monthly payment cycle July"
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-300" />
                </div>
              </div>

              {/* Bill sections */}
              {sections.map(({ key, label, rows }) => rows.length === 0 ? null : (
                <div key={key} className="border border-slate-200 rounded-xl overflow-hidden">
                  <button
                    onClick={() => setExpandedType(expandedType === key ? '' : key)}
                    className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 hover:bg-slate-100 transition">
                    <div className="flex items-center gap-2">
                      <span className={clsx('text-xs font-bold px-2 py-0.5 rounded-full', BILL_TYPE_META[key].cls)}>{label}</span>
                      <span className="text-xs text-slate-500">{rows.length} bill{rows.length !== 1 ? 's' : ''}</span>
                      {selected.filter(s => s.bill_type === key).length > 0 && (
                        <span className="text-xs bg-indigo-600 text-white font-bold px-2 py-0.5 rounded-full">
                          {selected.filter(s => s.bill_type === key).length} selected
                        </span>
                      )}
                    </div>
                    {expandedType === key ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
                  </button>
                  {expandedType === key && (
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-white border-b border-slate-100">
                          <th className="w-8 px-3 py-2"></th>
                          <th className="text-left px-3 py-2 font-semibold text-slate-500 text-xs">Vendor</th>
                          <th className="text-left px-3 py-2 font-semibold text-slate-500 text-xs">Bill No.</th>
                          <th className="text-right px-3 py-2 font-semibold text-slate-500 text-xs">Bill Amt</th>
                          <th className="text-right px-3 py-2 font-semibold text-slate-500 text-xs">Rec. Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((b, i) => {
                          const sel = selected.find(s => s.bill_id === b.id);
                          return (
                            <tr key={b.id} className={clsx(i % 2 === 0 ? 'bg-white' : 'bg-slate-50/50', sel && 'bg-indigo-50/60')}>
                              <td className="px-3 py-2.5 text-center">
                                <input type="checkbox" checked={isSelected(b.id)} onChange={() => toggle(b)}
                                  className="w-4 h-4 accent-indigo-600 cursor-pointer" />
                              </td>
                              <td className="px-3 py-2.5">
                                <p className="font-semibold text-slate-800 text-sm">{b.vendor_name}</p>
                                <p className="text-xs text-slate-400">{b.project_name}</p>
                              </td>
                              <td className="px-3 py-2.5 text-sm text-indigo-600 font-mono">{b.bill_number || '—'}</td>
                              <td className="px-3 py-2.5 text-right font-mono text-sm text-slate-700">{fmt(b.bill_amount)}</td>
                              <td className="px-3 py-2.5 text-right">
                                {sel ? (
                                  <input type="number" value={sel.recommended_amount}
                                    onChange={e => setRecAmt(b.id, e.target.value)}
                                    className="w-28 text-right border border-indigo-300 rounded px-2 py-1 text-sm font-mono outline-none focus:ring-1 focus:ring-indigo-400" />
                                ) : (
                                  <span className="text-sm text-slate-400 font-mono">{fmt(b.bill_amount)}</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t bg-slate-50/60 flex-shrink-0">
          <div>
            <p className="text-xs text-slate-500">{selected.length} bill{selected.length !== 1 ? 's' : ''} selected</p>
            <p className="text-base font-bold text-indigo-700">{fmt(total)} total</p>
          </div>
          <div className="flex gap-3">
            <button onClick={onClose} className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50">Cancel</button>
            <button onClick={() => createMut.mutate()} disabled={selected.length === 0 || createMut.isPending}
              className="flex items-center gap-2 px-5 py-2 text-white text-sm font-bold rounded-lg disabled:opacity-50"
              style={{ background: `linear-gradient(135deg, ${Theme.navyLight} 0%, ${Theme.navyDark} 100%)` }}>
              <Send className="w-4 h-4" />
              {createMut.isPending ? 'Submitting…' : 'Submit for Approval'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── PR Detail Modal ──────────────────────────────────────────────────────────
function PRDetailModal({ prId, onClose }) {
  const qc = useQueryClient();
  const { user } = useAuthStore();
  const isApprover = ['super_admin', 'admin', 'project_manager', 'project_head'].includes(user?.role);
  const isPayer    = ['super_admin', 'admin', 'accountant'].includes(user?.role);

  const [payMode, setPayMode]   = useState('neft');
  const [payRef,  setPayRef]    = useState('');
  const [payDate, setPayDate]   = useState(dayjs().format('YYYY-MM-DD'));

  const { data: raw, isLoading } = useQuery({
    queryKey: ['pr-detail', prId],
    queryFn: () => paymentRecommendationAPI.get(prId).then(r => r.data?.data),
    staleTime: 0, enabled: !!prId,
  });

  const approveMut = useMutation({
    mutationFn: () => paymentRecommendationAPI.approve(prId),
    onSuccess: () => { toast.success('Approved'); qc.invalidateQueries({ queryKey: ['pr-detail', prId] }); qc.invalidateQueries({ queryKey: ['payment-recommendations'] }); },
    onError: e => toast.error(e?.response?.data?.error || 'Failed'),
  });

  const rejectMut = useMutation({
    mutationFn: () => paymentRecommendationAPI.reject(prId),
    onSuccess: () => { toast.success('Cancelled'); qc.invalidateQueries({ queryKey: ['payment-recommendations'] }); onClose(); },
    onError: e => toast.error(e?.response?.data?.error || 'Failed'),
  });

  const processMut = useMutation({
    mutationFn: () => paymentRecommendationAPI.process(prId, { payment_mode: payMode, payment_ref: payRef, payment_date: payDate }),
    onSuccess: () => { toast.success('Payment processed — bills marked as paid'); qc.invalidateQueries({ queryKey: ['payment-recommendations'] }); onClose(); },
    onError: e => toast.error(e?.response?.data?.error || 'Failed'),
  });

  const pr = raw || {};
  const items = pr.items || [];
  const sm = STATUS_META[pr.status] || STATUS_META.draft;

  const handlePrint = () => window.print();

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 flex-shrink-0"
          style={{ background: `linear-gradient(135deg, ${Theme.navy} 0%, ${Theme.navyDark} 100%)` }}>
          <div className="flex items-center gap-3">
            <div>
              <h2 className="font-bold text-white text-base font-mono">{pr.pr_number || '…'}</h2>
              <p className="text-xs text-white/60 mt-0.5">{pr.project_name} · {dayjs(pr.created_at).format('DD MMM YYYY')}</p>
            </div>
            {pr.status && <span className={clsx('text-xs px-2.5 py-1 rounded-full font-bold', sm.cls)}>{sm.label}</span>}
            {pr.priority === 'urgent' && (
              <span className="flex items-center gap-1 text-xs bg-red-100 text-red-600 font-bold px-2 py-0.5 rounded-full">
                <AlertTriangle className="w-3 h-3" /> Urgent
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={handlePrint} className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold text-white" style={{ background: 'rgba(255,255,255,0.14)' }}>
              <Printer className="w-3.5 h-3.5" /> Print
            </button>
            <button onClick={onClose} className="w-7 h-7 rounded-lg flex items-center justify-center text-white/70 hover:text-white" style={{ background: 'rgba(255,255,255,0.12)' }}>
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {isLoading ? (
            <div className="text-center text-slate-400 text-sm py-8">Loading…</div>
          ) : (
            <>
              {/* Meta */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-slate-50 rounded-xl p-4">
                  <p className="text-xs text-slate-400 font-semibold uppercase tracking-wide mb-1">Recommended by</p>
                  <p className="font-bold text-slate-800">{pr.recommended_by_name || '—'}</p>
                </div>
                <div className="bg-slate-50 rounded-xl p-4">
                  <p className="text-xs text-slate-400 font-semibold uppercase tracking-wide mb-1">Remarks</p>
                  <p className="font-medium text-slate-700">{pr.remarks || '—'}</p>
                </div>
              </div>

              {/* Bill items */}
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <div className="px-4 py-3 bg-slate-50 border-b border-slate-200">
                  <p className="text-xs font-bold text-slate-600 uppercase tracking-widest">Bills ({items.length})</p>
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 bg-white">
                      <th className="text-left px-4 py-2.5 font-semibold text-slate-500 text-xs">Vendor</th>
                      <th className="text-left px-4 py-2.5 font-semibold text-slate-500 text-xs">Bill No.</th>
                      <th className="text-center px-3 py-2.5 font-semibold text-slate-500 text-xs">Type</th>
                      <th className="text-right px-4 py-2.5 font-semibold text-slate-500 text-xs">Bill Amt</th>
                      <th className="text-right px-4 py-2.5 font-semibold text-slate-500 text-xs">Rec. Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((it, i) => (
                      <tr key={it.id} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}>
                        <td className="px-4 py-3 font-semibold text-slate-800">{it.vendor_name}</td>
                        <td className="px-4 py-3 font-mono text-indigo-600 text-sm">{it.bill_number || '—'}</td>
                        <td className="px-3 py-3 text-center">
                          <span className={clsx('text-xs font-bold px-2 py-0.5 rounded-full', BILL_TYPE_META[it.bill_type]?.cls)}>
                            {BILL_TYPE_META[it.bill_type]?.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-slate-600">{fmt(it.bill_amount)}</td>
                        <td className="px-4 py-3 text-right font-bold font-mono text-indigo-700">{fmt(it.recommended_amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-slate-200 bg-indigo-50">
                      <td colSpan={4} className="px-4 py-3 font-bold text-slate-700 text-sm">Total Recommended</td>
                      <td className="px-4 py-3 text-right font-black text-indigo-800 font-mono text-lg">{fmt(pr.total_amount)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Payment section — accounts only, after approval */}
              {isPayer && pr.status === 'approved' && (
                <div className="border border-emerald-200 bg-emerald-50 rounded-xl p-5 space-y-4">
                  <p className="text-sm font-bold text-emerald-800 flex items-center gap-2">
                    <Banknote className="w-4 h-4" /> Record Payment
                  </p>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1">Payment Mode</label>
                      <select value={payMode} onChange={e => setPayMode(e.target.value)}
                        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none">
                        <option value="neft">NEFT</option>
                        <option value="rtgs">RTGS</option>
                        <option value="imps">IMPS</option>
                        <option value="cheque">Cheque</option>
                        <option value="cash">Cash</option>
                        <option value="upi">UPI</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1">UTR / Reference No.</label>
                      <input type="text" value={payRef} onChange={e => setPayRef(e.target.value)}
                        placeholder="UTR / Cheque No."
                        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-300" />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1">Payment Date</label>
                      <input type="date" value={payDate} onChange={e => setPayDate(e.target.value)}
                        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-300" />
                    </div>
                  </div>
                  <button onClick={() => processMut.mutate()} disabled={!payRef || processMut.isPending}
                    className="w-full flex items-center justify-center gap-2 py-2.5 text-white font-bold rounded-lg text-sm disabled:opacity-50 bg-emerald-600 hover:bg-emerald-700 transition">
                    <FileCheck className="w-4 h-4" />
                    {processMut.isPending ? 'Processing…' : `Mark ${items.length} Bill${items.length !== 1 ? 's' : ''} as Paid`}
                  </button>
                </div>
              )}

              {pr.status === 'paid' && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-center gap-3">
                  <CheckCircle2 className="w-6 h-6 text-emerald-500 flex-shrink-0" />
                  <div>
                    <p className="font-bold text-emerald-800">Payment completed</p>
                    <p className="text-sm text-emerald-600">
                      {pr.payment_mode?.toUpperCase()} · Ref: {pr.payment_ref || '—'} · {pr.paid_at ? dayjs(pr.paid_at).format('DD MMM YYYY') : ''}
                    </p>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer actions */}
        {!isLoading && (
          <div className="flex justify-end gap-3 px-6 py-4 border-t bg-slate-50/60 flex-shrink-0">
            <button onClick={onClose} className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50">Close</button>
            {isApprover && pr.status === 'submitted' && (
              <>
                <button onClick={() => rejectMut.mutate()} disabled={rejectMut.isPending}
                  className="px-4 py-2 border border-red-200 text-red-600 rounded-lg text-sm font-semibold hover:bg-red-50 disabled:opacity-50">
                  {rejectMut.isPending ? 'Cancelling…' : 'Cancel PR'}
                </button>
                <button onClick={() => approveMut.mutate()} disabled={approveMut.isPending}
                  className="flex items-center gap-2 px-5 py-2 text-white text-sm font-bold rounded-lg disabled:opacity-50"
                  style={{ background: `linear-gradient(135deg, ${Theme.navyLight} 0%, ${Theme.navyDark} 100%)` }}>
                  <CheckCircle2 className="w-4 h-4" />
                  {approveMut.isPending ? 'Approving…' : 'Approve & Send to Accounts'}
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function PaymentRecommendationPage() {
  const { selectedProjectId, user } = useAuthStore();
  const [statusFilter, setStatus] = useState('');
  const [showCreate,  setShowCreate] = useState(false);
  const [detailId,    setDetailId]   = useState(null);

  const canCreate = ['super_admin', 'admin', 'project_manager', 'qs_engineer', 'site_engineer', 'project_head'].includes(user?.role);

  const { data, isLoading } = useQuery({
    queryKey: ['payment-recommendations', selectedProjectId, statusFilter],
    queryFn: () => paymentRecommendationAPI.list({
      ...(selectedProjectId ? { project_id: selectedProjectId } : {}),
      ...(statusFilter ? { status: statusFilter } : {}),
    }).then(r => r.data?.data || []),
    staleTime: 30_000,
  });

  const prs = data || [];

  const summary = {
    total:     prs.length,
    submitted: prs.filter(p => p.status === 'submitted').length,
    approved:  prs.filter(p => p.status === 'approved').length,
    paid:      prs.filter(p => p.status === 'paid').length,
    amount:    prs.filter(p => !['cancelled'].includes(p.status)).reduce((s, p) => s + parseFloat(p.total_amount || 0), 0),
  };

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Top bar */}
      <div className="px-6 py-5 border-b bg-white shadow-sm">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-800">Payment Recommendations</h1>
            <p className="text-sm text-slate-500 mt-0.5">Recommend approved bills for payment to accounts</p>
          </div>
          {canCreate && (
            <button onClick={() => setShowCreate(true)}
              className="flex items-center gap-2 px-5 py-2.5 text-white font-bold rounded-xl text-sm shadow"
              style={{ background: `linear-gradient(135deg, ${Theme.navyLight} 0%, ${Theme.navyDark} 100%)` }}>
              <Plus className="w-4 h-4" /> New Recommendation
            </button>
          )}
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-6 space-y-6">

        {/* KPI row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: 'Pending Approval', value: summary.submitted, cls: 'text-amber-600' },
            { label: 'Approved (To Pay)', value: summary.approved,  cls: 'text-blue-600' },
            { label: 'Paid',             value: summary.paid,       cls: 'text-emerald-600' },
            { label: 'Total Value',      value: fmt(summary.amount), cls: 'text-indigo-700' },
          ].map(({ label, value, cls }) => (
            <div key={label} className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">{label}</p>
              <p className={clsx('text-2xl font-bold', cls)}>{value}</p>
            </div>
          ))}
        </div>

        {/* Filter bar */}
        <div className="flex gap-2 flex-wrap">
          {['', 'submitted', 'approved', 'paid', 'cancelled'].map(s => (
            <button key={s} onClick={() => setStatus(s)}
              className={clsx('px-4 py-1.5 rounded-full text-sm font-semibold border transition',
                statusFilter === s ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300')}>
              {s === '' ? 'All' : STATUS_META[s]?.label}
            </button>
          ))}
        </div>

        {/* PR list */}
        {isLoading ? (
          <div className="space-y-3">
            {[1,2,3].map(n => <div key={n} className="h-20 bg-white rounded-2xl animate-pulse border border-slate-100" />)}
          </div>
        ) : prs.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-100 p-12 text-center">
            <Send className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="font-semibold text-slate-600">No payment recommendations yet</p>
            <p className="text-sm text-slate-400 mt-1">Create one to recommend approved bills for payment</p>
          </div>
        ) : (
          <div className="space-y-3">
            {prs.map(pr => {
              const sm = STATUS_META[pr.status] || STATUS_META.draft;
              return (
                <button key={pr.id} onClick={() => setDetailId(pr.id)}
                  className="w-full bg-white border border-slate-100 rounded-2xl p-5 shadow-sm hover:shadow-md hover:border-indigo-200 transition text-left">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={clsx('w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0',
                        pr.status === 'paid' ? 'bg-emerald-100' : pr.status === 'approved' ? 'bg-blue-100' : pr.status === 'submitted' ? 'bg-amber-100' : 'bg-slate-100')}>
                        {pr.status === 'paid' ? <CheckCircle2 className="w-5 h-5 text-emerald-600" /> :
                         pr.status === 'approved' ? <FileCheck className="w-5 h-5 text-blue-600" /> :
                         pr.status === 'submitted' ? <Clock className="w-5 h-5 text-amber-600" /> :
                         <Send className="w-5 h-5 text-slate-400" />}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-800 font-mono">{pr.pr_number}</span>
                          <span className={clsx('text-xs px-2 py-0.5 rounded-full font-bold', sm.cls)}>{sm.label}</span>
                          {pr.priority === 'urgent' && (
                            <span className="text-xs bg-red-100 text-red-600 font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3" /> Urgent
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-slate-500 truncate mt-0.5">
                          {pr.project_name || 'All projects'} · {pr.item_count} bill{pr.item_count !== 1 ? 's' : ''} · by {pr.recommended_by_name}
                        </p>
                        {pr.remarks && <p className="text-xs text-slate-400 truncate mt-0.5 italic">"{pr.remarks}"</p>}
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0 ml-4">
                      <p className="text-lg font-bold text-indigo-700">{fmt(pr.total_amount)}</p>
                      <p className="text-xs text-slate-400">{dayjs(pr.created_at).format('DD MMM YYYY')}</p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {showCreate && <CreatePRModal onClose={() => setShowCreate(false)} />}
      {detailId   && <PRDetailModal prId={detailId} onClose={() => setDetailId(null)} />}
    </div>
  );
}
