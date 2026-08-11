// src/pages/accounts/QSCertificationsPage.jsx
// Dedicated Accounts view of vendor QS certifications (payment certificates).
// Lists certs that QS has certified / sent to accounts, lets accounts expand a
// cert to see the QS-certified line items, record a payment, and open the full
// record. Project-scoped via the shared ProjectFilter (the /vendor-... URL is
// skipped by the axios project interceptor, so project_id is passed explicitly).
import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import toast from 'react-hot-toast';
import {
  BadgeCheck, Search, ChevronRight, ChevronDown, CreditCard,
  ExternalLink, X,
} from 'lucide-react';
import { vendorQSCertificationAPI } from '../../api/client';
import useAuthStore from '../../store/authStore';
import ProjectFilter from '../../components/ProjectFilter';

const inr = (v) => Number(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const STATUS_CLS = {
  draft:     'bg-slate-100 text-slate-600 border-slate-200',
  certified: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  accounts:  'bg-indigo-50 text-indigo-700 border-indigo-200',
  paid:      'bg-blue-50 text-blue-700 border-blue-200',
  cancelled: 'bg-red-50 text-red-600 border-red-200',
};
const STATUS_LABEL = { certified: 'QS Certified', accounts: 'At Accounts', paid: 'Paid', draft: 'Draft', cancelled: 'Cancelled' };

const bal = (r) => Math.max(0, Number(r.net_payable || 0) - Number(r.paid_amount || 0));

// ── Expanded QS-certified line items (lazy-loaded per cert) ───────────────────
function CertItems({ id }) {
  const { data, isLoading } = useQuery({
    queryKey: ['vqs-cert-detail', id],
    queryFn: () => vendorQSCertificationAPI.get(id).then(r => r.data?.data),
  });
  if (isLoading) return <div className="px-6 py-4 text-xs text-slate-400">Loading certified items…</div>;
  const items = data?.items ?? [];
  if (!items.length) return <div className="px-6 py-4 text-xs text-slate-400">No line items recorded on this certificate.</div>;
  return (
    <div className="px-6 py-3 bg-slate-50/60">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-slate-400 border-b border-slate-200">
            {['Description', 'Unit', 'Order Qty', 'Rate', 'Certified Qty', 'Amount (₹)', 'Invoice'].map((h, i) => (
              <th key={h} className={`py-1.5 ${i >= 2 && i <= 5 ? 'text-right' : 'text-left'} font-medium`}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {items.map(it => (
            <tr key={it.id}>
              <td className="py-1.5 text-slate-700">{it.description || '—'}</td>
              <td className="py-1.5 text-slate-500">{it.unit || '—'}</td>
              <td className="py-1.5 text-right font-mono text-slate-600">{Number(it.order_qty || 0).toLocaleString('en-IN')}</td>
              <td className="py-1.5 text-right font-mono text-slate-600">{inr(it.order_rate)}</td>
              <td className="py-1.5 text-right font-mono font-semibold text-black">{Number(it.qs_pres_qty || 0).toLocaleString('en-IN')}</td>
              <td className="py-1.5 text-right font-mono font-semibold text-black">{inr(it.amount)}</td>
              <td className="py-1.5 text-slate-400 font-mono">{it.source_inv_number || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Record-payment modal ──────────────────────────────────────────────────────
function PaymentModal({ cert, onClose }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    paid_amount: bal(cert).toFixed(2),
    payment_date: dayjs().format('YYYY-MM-DD'),
    payment_mode: 'bank_transfer',
    reference_number: '',
    bank_name: '',
    remarks: '',
  });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const mut = useMutation({
    mutationFn: () => vendorQSCertificationAPI.recordPayment(cert.id, form),
    onSuccess: () => {
      toast.success('Payment recorded');
      qc.invalidateQueries({ queryKey: ['accounts-qs-certs'] });
      qc.invalidateQueries({ queryKey: ['vqs-cert-detail', cert.id] });
      qc.invalidateQueries({ queryKey: ['vendor-qs-certs', 'accounts-pending'] });
      onClose();
    },
    onError: e => toast.error(e?.response?.data?.error || 'Payment failed'),
  });

  const F = 'w-full border border-slate-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200';
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div>
            <h3 className="font-semibold text-black">Record Payment</h3>
            <p className="text-xs text-slate-400">{cert.pc_number || cert.cert_number} · {cert.vendor_name}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
        </div>
        <div className="px-5 py-4 space-y-3">
          <div className="flex justify-between text-xs bg-slate-50 border border-slate-200 rounded-md px-3 py-2">
            <span className="text-slate-500">Balance due</span>
            <span className="font-mono font-semibold text-black">₹ {inr(bal(cert))}</span>
          </div>
          <div>
            <label className="text-xs text-slate-500">Amount paid (₹)</label>
            <input type="number" className={F} value={form.paid_amount} onChange={e => set('paid_amount', e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-500">Payment date</label>
              <input type="date" className={F} value={form.payment_date} onChange={e => set('payment_date', e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-slate-500">Mode</label>
              <select className={F} value={form.payment_mode} onChange={e => set('payment_mode', e.target.value)}>
                <option value="bank_transfer">Bank Transfer</option>
                <option value="cheque">Cheque</option>
                <option value="cash">Cash</option>
                <option value="upi">UPI</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-500">Reference no.</label>
              <input className={F} value={form.reference_number} onChange={e => set('reference_number', e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-slate-500">Bank</label>
              <input className={F} value={form.bank_name} onChange={e => set('bank_name', e.target.value)} />
            </div>
          </div>
          <div>
            <label className="text-xs text-slate-500">Remarks</label>
            <input className={F} value={form.remarks} onChange={e => set('remarks', e.target.value)} />
          </div>
        </div>
        <div className="flex justify-end gap-2 px-5 py-4 border-t border-slate-100">
          <button onClick={onClose} className="px-4 py-2 text-sm border border-slate-200 rounded-md text-slate-600 hover:bg-slate-50">Cancel</button>
          <button onClick={() => mut.mutate()} disabled={mut.isPending}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50">
            {mut.isPending ? 'Saving…' : 'Record Payment'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function QSCertificationsPage() {
  const navigate = useNavigate();
  const { selectedProjectId } = useAuthStore();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('pending');   // pending | all | certified | accounts | paid
  const [expanded, setExpanded] = useState(null);
  const [payCert, setPayCert] = useState(null);

  const { data, isLoading } = useQuery({
    queryKey: ['accounts-qs-certs', selectedProjectId],
    queryFn: () => vendorQSCertificationAPI.list({ project_id: selectedProjectId || undefined })
      .then(r => r.data?.data ?? []),
  });
  const all = data ?? [];

  const rows = useMemo(() => all.filter(r => {
    if (status === 'pending') { if (!['certified', 'accounts'].includes(r.status) || bal(r) <= 0) return false; }
    else if (status !== 'all' && r.status !== status) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return (r.cert_number || '').toLowerCase().includes(q) || (r.vendor_name || '').toLowerCase().includes(q);
  }), [all, status, search]);

  const kpi = useMemo(() => ({
    count:     rows.length,
    certified: rows.reduce((s, r) => s + Number(r.net_payable || 0), 0),
    balance:   rows.reduce((s, r) => s + bal(r), 0),
    paid:      rows.reduce((s, r) => s + Number(r.paid_amount || 0), 0),
  }), [rows]);

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-md bg-emerald-50 flex items-center justify-center">
              <BadgeCheck className="w-4 h-4 text-emerald-600" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-black">QS Certifications</h1>
              <p className="text-xs text-slate-400">Vendor payment certificates certified by QS — view certified items &amp; record payment</p>
            </div>
          </div>
          <ProjectFilter />
        </div>
      </div>

      <div className="px-6 py-5 grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white border border-slate-200 rounded-md p-4">
          <div className="text-xs text-slate-400">Certificates</div>
          <div className="text-2xl font-semibold text-black mt-1">{kpi.count}</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-md p-4">
          <div className="text-xs text-slate-400">Certified Value</div>
          <div className="text-2xl font-semibold text-black mt-1">₹ {inr(kpi.certified)}</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-md p-4">
          <div className="text-xs text-slate-400">Balance Due</div>
          <div className="text-2xl font-semibold text-amber-600 mt-1">₹ {inr(kpi.balance)}</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-md p-4">
          <div className="text-xs text-slate-400">Paid</div>
          <div className="text-2xl font-semibold text-emerald-600 mt-1">₹ {inr(kpi.paid)}</div>
        </div>
      </div>

      <div className="px-6 pb-3 flex flex-wrap gap-2 items-center">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
          <input className="pl-8 pr-3 py-2 text-sm border border-slate-200 rounded-md bg-white w-60 focus:outline-none focus:ring-2 focus:ring-blue-200"
            placeholder="Search PC no. / vendor…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select className="border border-slate-200 rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-200"
          value={status} onChange={e => setStatus(e.target.value)}>
          <option value="pending">Pending Payment</option>
          <option value="certified">QS Certified</option>
          <option value="accounts">At Accounts</option>
          <option value="paid">Paid</option>
          <option value="all">All</option>
        </select>
        <span className="ml-auto text-xs text-slate-400">{rows.length} certificate{rows.length !== 1 ? 's' : ''}</span>
      </div>

      <div className="px-6 pb-10">
        <div className="bg-white border border-slate-200 rounded-md overflow-hidden">
          {isLoading ? (
            <div className="flex justify-center py-16">
              <div className="w-6 h-6 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : rows.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-2 text-slate-400">
              <BadgeCheck className="w-10 h-10 opacity-20" />
              <p className="text-sm font-medium">No QS certifications found</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  <th className="w-8" />
                  {['PC Number', 'Vendor', 'Project', 'Certified (₹)', 'TDS (₹)', 'Balance Due (₹)', 'Status', ''].map(h => (
                    <th key={h} className={`px-4 py-2.5 text-[11px] font-medium uppercase tracking-wider text-slate-400 ${h.includes('₹') ? 'text-right' : 'text-left'}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {rows.map(r => (
                  <React.Fragment key={r.id}>
                    <tr className="hover:bg-slate-50">
                      <td className="pl-3">
                        <button onClick={() => setExpanded(expanded === r.id ? null : r.id)} className="text-slate-400 hover:text-slate-700">
                          {expanded === r.id ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                        </button>
                      </td>
                      <td className="px-4 py-2.5 font-mono text-xs font-semibold text-emerald-700">{r.cert_number}</td>
                      <td className="px-4 py-2.5 text-slate-700">{r.vendor_name}</td>
                      <td className="px-4 py-2.5 text-slate-500">{r.project_name || '—'}</td>
                      <td className="px-4 py-2.5 text-right font-mono">{inr(r.net_payable)}</td>
                      <td className="px-4 py-2.5 text-right font-mono text-amber-600">{inr(r.tds_amount)}</td>
                      <td className="px-4 py-2.5 text-right font-mono font-semibold text-black">{inr(bal(r))}</td>
                      <td className="px-4 py-2.5">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium border ${STATUS_CLS[r.status] || STATUS_CLS.draft}`}>
                          {STATUS_LABEL[r.status] || r.status}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap text-right">
                        {r.status !== 'paid' && r.status !== 'cancelled' && bal(r) > 0 && (
                          <button onClick={() => setPayCert(r)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs bg-blue-600 text-white rounded-md hover:bg-blue-700 mr-1">
                            <CreditCard className="w-3.5 h-3.5" /> Pay
                          </button>
                        )}
                        <button onClick={() => navigate(`/accounts/purchases/qs-certifications/${r.id}`)} title="Open full record"
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs border border-slate-200 rounded-md text-slate-600 hover:bg-slate-50">
                          <ExternalLink className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                    {expanded === r.id && (
                      <tr><td colSpan={9} className="p-0"><CertItems id={r.id} /></td></tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {payCert && <PaymentModal cert={payCert} onClose={() => setPayCert(null)} />}
    </div>
  );
}
