import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  Plus, CreditCard, CheckCircle2, Search, X, Banknote,
  FileCheck2, TrendingDown, TrendingUp, Clock,
  ArrowRight, ChevronDown, Building2, Receipt, Wallet,
  IndianRupee, FileSignature, RefreshCw,
} from 'lucide-react';
import api, { projectAPI, raBillAPI, tqsBillsAPI, vendorAPI, tqsVendorsAPI, vendorQSCertificationAPI, procurementAdvanceAPI } from '../../api/client';
import dayjs from 'dayjs';
import { clsx } from 'clsx';
import { PageHeader, KpiCard as ThemeKpiCard, Theme } from '../../theme';

const PAYMENT_MODES = ['RTGS', 'NEFT', 'IMPS', 'UPI', 'Cheque', 'Cash', 'DD'];
const COST_HEADS = [
  { group: 'Material',          items: ['Material — Concrete & Aggregates', 'Material — Steel & Reinforcement', 'Material — Cement & Masonry', 'Material — Finishing & Tiles'] },
  { group: 'Labour',            items: ['Labour — Skilled', 'Labour — Unskilled', 'Labour — Supervisory'] },
  { group: 'Plant & Machinery', items: ['Plant & Machinery — Owned', 'Plant & Machinery — Hired'] },
  { group: 'Subcontracting',    items: ['Subcontracting — Civil', 'Subcontracting — MEP', 'Subcontracting — Structural'] },
  { group: 'Overhead',          items: ['Site Overhead', 'Head Office Overhead', 'Contingency', 'Provisional Sum'] },
];

const PAY_TYPE_CFG = [
  { key: 'bill',    label: 'Bill Payment',    icon: Receipt, desc: 'Pay a pending vendor/subcontractor bill' },
  { key: 'advance', label: 'Advance Payment', icon: Wallet,  desc: 'Record an advance to a vendor' },
  { key: 'general', label: 'General Expense', icon: CreditCard, desc: 'Salaries, overheads, utilities, etc.' },
];

const STATUS_CFG = {
  pending:  { label: 'Pending',  pill: 'bg-amber-50 text-amber-700 border border-amber-200' },
  approved: { label: 'Approved', pill: 'bg-blue-50 text-blue-700 border border-blue-200' },
  paid:     { label: 'Paid',     pill: 'bg-emerald-50 text-emerald-700 border border-emerald-200' },
  success:  { label: 'Paid',     pill: 'bg-emerald-50 text-emerald-700 border border-emerald-200' },
  rejected: { label: 'Rejected', pill: 'bg-red-50 text-red-700 border border-red-200' },
  failed:   { label: 'Failed',   pill: 'bg-red-50 text-red-700 border border-red-200' },
  refunded: { label: 'Refunded', pill: 'bg-slate-100 text-slate-900 border border-slate-200' },
};

const PAY_TABS = ['all', 'pending', 'approved', 'paid', 'rejected'];
const RA_TABS  = [
  { key: 'certified', label: 'Pending Receipt' },
  { key: 'paid',      label: 'Received' },
  { key: 'all',       label: 'All' },
];

const inr = v => `₹${Number(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const EMPTY_PAY_FORM = { payment_date: '', payment_mode: 'RTGS', payment_ref: '' };

function computeTdsSplit(bill) {
  const netPayable    = parseFloat(bill.net_payable || 0);
  const grossAmount   = parseFloat(bill.gross_amount || 0);
  const billTdsAmount = parseFloat(bill.tds_amount || 0);
  const tdsRate       = parseFloat(bill.tds_rate || 2);
  if (billTdsAmount > 0) return { netPayable, clientTds: billTdsAmount, amountReceived: netPayable, tdsAlreadyInBill: true };
  const clientTds      = parseFloat((grossAmount * tdsRate / 100).toFixed(2));
  return { netPayable, clientTds, amountReceived: parseFloat((netPayable - clientTds).toFixed(2)), tdsAlreadyInBill: false };
}

function KpiCard({ label, value, color = 'slate', icon: Icon }) {
  const colors = { slate: 'text-slate-900 bg-slate-50 border-slate-200', red: 'text-red-600 bg-red-50 border-red-100', emerald: 'text-emerald-600 bg-emerald-50 border-emerald-100', amber: 'text-amber-600 bg-amber-50 border-amber-100', violet: 'text-violet-600 bg-violet-50 border-violet-100' };
  return (
    <div className={`bg-white border rounded-xl p-4 flex items-center gap-3 ${colors[color]}`}>
      {Icon && <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${colors[color]}`}><Icon className="w-4 h-4" /></div>}
      <div><p className="text-[11px] text-slate-900 font-medium font-medium">{label}</p><p className="text-lg font-medium mt-0.5 text-slate-800">{value}</p></div>
    </div>
  );
}

function StatusPill({ status }) {
  const cfg = STATUS_CFG[status] || { label: status || '—', pill: 'bg-slate-100 text-slate-900 font-medium border border-slate-200' };
  return <span className={`px-2 py-0.5 rounded-md text-[11px] font-medium ${cfg.pill}`}>{cfg.label}</span>;
}

// ── Vendor search input with dropdown ─────────────────────────────────────────
function VendorPicker({ vendors, value, onChange, placeholder = 'Search vendor...' }) {
  const [open, setOpen]   = useState(false);
  const [q, setQ]         = useState('');
  const filtered = useMemo(() => {
    if (!q) return vendors.slice(0, 30);
    return vendors.filter(v => v.name.toLowerCase().includes(q.toLowerCase())).slice(0, 30);
  }, [vendors, q]);

  const selected = vendors.find(v => v.name === value);

  return (
    <div className="relative">
      <div
        className={clsx('w-full border rounded-lg px-3 py-2 text-sm flex items-center justify-between cursor-pointer transition-colors', open ? 'border-indigo-400 ring-1 ring-indigo-200' : 'border-slate-200 hover:border-slate-300')}
        onClick={() => setOpen(o => !o)}
      >
        {selected ? (
          <span className="font-medium text-slate-800">{selected.name}</span>
        ) : (
          <span className="text-slate-400">{placeholder}</span>
        )}
        <ChevronDown className="w-4 h-4 text-slate-900 font-medium flex-shrink-0" />
      </div>
      {open && (
        <div className="absolute z-40 top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden">
          <div className="p-2 border-b border-slate-100">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
              <input
                autoFocus
                className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg outline-none focus:border-indigo-400"
                placeholder="Type to search..."
                value={q}
                onChange={e => setQ(e.target.value)}
                onClick={e => e.stopPropagation()}
              />
            </div>
          </div>
          <div className="max-h-52 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="text-center text-xs text-slate-900 font-medium py-4">No vendors found</p>
            ) : filtered.map(v => (
              <button key={v.id || v.name} type="button"
                className="w-full text-left px-4 py-2.5 text-sm hover:bg-indigo-50 border-b border-slate-50 last:border-b-0 transition-colors"
                onClick={() => { onChange(v.name, v); setOpen(false); setQ(''); }}>
                <div className="font-medium text-slate-800">{v.name}</div>
                {v.contact_person && <div className="text-[11px] text-slate-900 font-medium mt-0.5">{v.contact_person}</div>}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── QS Cert Payment Modal ─────────────────────────────────────────────────────
function QSCertPaymentModal({ cert, onClose }) {
  const qc = useQueryClient();
  const netPayable   = Number(cert.net_payable || 0);
  const alreadyPaid  = Number(cert.paid_amount || 0);
  const remainingDue = Math.max(0, netPayable - alreadyPaid);

  const [form, setForm] = useState({
    paid_amount:      String(remainingDue.toFixed(2)),
    payment_date:     dayjs().format('YYYY-MM-DD'),
    payment_mode:     'RTGS',
    reference_number: '',
    bank_name:        '',
    remarks:          '',
  });
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const mut = useMutation({
    mutationFn: () => vendorQSCertificationAPI.recordPayment(cert.id, {
      paid_amount:      Number(form.paid_amount || 0),
      payment_date:     form.payment_date,
      payment_mode:     form.payment_mode,
      reference_number: form.reference_number || null,
      bank_name:        form.bank_name || null,
      remarks:          form.remarks || null,
    }),
    onSuccess: (res) => {
      const data = res.data?.data;
      toast.success(
        data?.cert_fully_paid
          ? `Cert ${cert.cert_number} fully paid · ${data.bills_paid?.length || 0} bill(s) marked Paid`
          : `Partial payment recorded for ${cert.cert_number}`
      );
      qc.invalidateQueries({ queryKey: ['qs-certs-finance'] });
      qc.invalidateQueries({ queryKey: ['payments'] });
      qc.invalidateQueries({ queryKey: ['tqs-bills'] });
      qc.invalidateQueries({ queryKey: ['tqs-pc-pending-finance'] });
      qc.invalidateQueries({ queryKey: ['liability-summary'] });
      qc.invalidateQueries({ queryKey: ['liability-ledger'] });
      onClose();
    },
    onError: (e) => toast.error(e?.response?.data?.error || 'Payment failed'),
  });

  const payAmt = Number(form.paid_amount || 0);
  const canSave = payAmt > 0 && payAmt <= remainingDue + 0.5 && !!form.payment_date && !mut.isPending;

  return (
    <div className="fixed inset-0 z-[9999] bg-black/45 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl w-full max-w-xl shadow-2xl overflow-hidden">
        <div className="bg-emerald-700 text-white px-5 py-3 flex items-center justify-between">
          <div>
            <p className="text-[10px] uppercase tracking-wider opacity-80">Pay Against QS Certification</p>
            <p className="text-sm font-bold">{cert.cert_number} · {cert.vendor_name}</p>
            <p className="text-[11px] opacity-80 mt-0.5">{cert.ra_bill_number} · {cert.project_name || '—'}</p>
          </div>
          <button onClick={onClose} className="text-white/80 hover:text-white"><X className="w-5 h-5"/></button>
        </div>

        <div className="px-5 py-4 grid grid-cols-3 gap-3 bg-slate-50 border-b border-slate-200">
          <div>
            <p className="text-[10px] uppercase font-bold text-slate-500">Net Payable</p>
            <p className="text-base font-extrabold text-slate-900">{inr(netPayable)}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase font-bold text-slate-500">Already Paid</p>
            <p className="text-base font-extrabold text-slate-600">{inr(alreadyPaid)}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase font-bold text-slate-500">Remaining Due</p>
            <p className="text-base font-extrabold text-emerald-700">{inr(remainingDue)}</p>
          </div>
        </div>

        <div className="px-5 py-4 grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className="text-[10px] uppercase font-bold text-slate-500">Paid Amount *</label>
            <input type="number" min="0" step="0.01" value={form.paid_amount}
              onChange={e => set('paid_amount', e.target.value)}
              className="w-full mt-1 border border-slate-300 rounded-lg px-3 py-2 text-base font-bold focus:border-emerald-500 outline-none"/>
            {payAmt > remainingDue + 0.5 && (
              <p className="text-[10px] text-red-600 mt-1">Exceeds remaining due ({inr(remainingDue)})</p>
            )}
          </div>
          <div>
            <label className="text-[10px] uppercase font-bold text-slate-500">Payment Date *</label>
            <input type="date" value={form.payment_date}
              onChange={e => set('payment_date', e.target.value)}
              className="w-full mt-1 border border-slate-300 rounded-lg px-3 py-2 text-sm font-medium focus:border-emerald-500 outline-none"/>
          </div>
          <div>
            <label className="text-[10px] uppercase font-bold text-slate-500">Payment Mode</label>
            <select value={form.payment_mode}
              onChange={e => set('payment_mode', e.target.value)}
              className="w-full mt-1 border border-slate-300 rounded-lg px-3 py-2 text-sm font-medium focus:border-emerald-500 outline-none">
              {PAYMENT_MODES.map(m => <option key={m}>{m}</option>)}
            </select>
          </div>
          <div className="col-span-2">
            <label className="text-[10px] uppercase font-bold text-slate-500">UTR / Reference Number</label>
            <input type="text" value={form.reference_number}
              onChange={e => set('reference_number', e.target.value)}
              placeholder="UTR / Cheque No / Txn Ref"
              className="w-full mt-1 border border-slate-300 rounded-lg px-3 py-2 text-sm font-medium focus:border-emerald-500 outline-none"/>
          </div>
          <div className="col-span-2">
            <label className="text-[10px] uppercase font-bold text-slate-500">Bank Name</label>
            <input type="text" value={form.bank_name}
              onChange={e => set('bank_name', e.target.value)}
              placeholder="e.g. HDFC Bank — Cur A/c"
              className="w-full mt-1 border border-slate-300 rounded-lg px-3 py-2 text-sm font-medium focus:border-emerald-500 outline-none"/>
          </div>
          <div className="col-span-2">
            <label className="text-[10px] uppercase font-bold text-slate-500">Remarks</label>
            <textarea value={form.remarks} rows={2}
              onChange={e => set('remarks', e.target.value)}
              className="w-full mt-1 border border-slate-300 rounded-lg px-3 py-2 text-sm font-medium focus:border-emerald-500 outline-none"/>
          </div>
        </div>

        <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 border border-slate-300 rounded-lg text-sm font-bold">Cancel</button>
          <button onClick={() => mut.mutate()} disabled={!canSave}
            className="px-5 py-2 bg-emerald-700 text-white rounded-lg text-sm font-bold flex items-center gap-2 disabled:opacity-50">
            {mut.isPending ? <RefreshCw className="w-4 h-4 animate-spin"/> : <CheckCircle2 className="w-4 h-4"/>}
            Pay {inr(payAmt)}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function PaymentsPage() {
  const qc = useQueryClient();

  // Page state
  const [activeTab, setActiveTab]       = useState('payments');
  const [showModal, setShowModal]       = useState(false);
  const [payBill, setPayBill]           = useState(null);
  const [payForm, setPayForm]           = useState(EMPTY_PAY_FORM);
  const [filterStatus, setFilterStatus] = useState('all');
  const [search, setSearch]             = useState('');
  const [raBillFilter, setRaBillFilter] = useState('certified');
  const [raBillSearch, setRaBillSearch] = useState('');
  const [qsCertSearch, setQsCertSearch] = useState('');
  const [payCert, setPayCert]           = useState(null);   // cert object → opens QSCertPaymentModal

  // Modal form state
  const [payType, setPayType]       = useState('bill');   // 'bill' | 'advance' | 'general'
  const [vendorName, setVendorName] = useState('');       // selected vendor name
  const [selectedPc, setSelectedPc] = useState(null);     // selected PC/bill for payment
  const [linkExisting, setLinkExisting]   = useState(false); // advance type: pay against an existing tracker voucher
  const [existingAdvId, setExistingAdvId] = useState('');
  const [form, setForm] = useState({
    project_id: '', payee_name: '', payee_type: 'Contractor',
    description: '', amount: '', tds_rate: 0,
    payment_mode: 'RTGS', bank_ref: '', payment_date: '', cost_head: '',
    // advance tracker fields
    vendor_id: '', vendor_name: '', wo_number: '', po_number: '',
    voucher_number: '', voucher_date: '',
  });

  const FORM_RESET = {
    project_id: '', payee_name: '', payee_type: 'Contractor', description: '', amount: '', tds_rate: 0,
    payment_mode: 'RTGS', bank_ref: '', payment_date: '', cost_head: '',
    vendor_id: '', vendor_name: '', wo_number: '', po_number: '', voucher_number: '', voucher_date: '',
  };

  const resetModal = () => {
    setPayType('bill'); setVendorName(''); setSelectedPc(null);
    setLinkExisting(false); setExistingAdvId('');
    setForm(FORM_RESET);
  };

  // ── Queries ────────────────────────────────────────────────────────────────
  const { data: rawPaymentsRes }  = useQuery({ queryKey: ['payments'],        queryFn: () => api.get('/payments').then(r => r.data) });
  const { data: projectsRes }     = useQuery({ queryKey: ['projects-simple'], queryFn: () => projectAPI.list().then(r => r.data) });
  const { data: allRaBillsRes }   = useQuery({ queryKey: ['ra-bills-finance'],queryFn: () => raBillAPI.list().then(r => r.data) });
  const { data: procVendorsRes }  = useQuery({ queryKey: ['vendors-proc'],    queryFn: () => vendorAPI.list().then(r => r.data?.data ?? r.data ?? []) });
  const { data: tqsVendorsRes }   = useQuery({ queryKey: ['vendors-tqs'],     queryFn: () => tqsVendorsAPI.list().then(r => r.data?.data ?? r.data ?? []) });
  const { data: tqsPcRes = [], isFetching: pcLoading } = useQuery({
    queryKey: ['tqs-pc-pending-finance'],
    queryFn: () => tqsBillsAPI.pcPending({}).then(r => r.data?.data ?? []),
    staleTime: 5 * 60 * 1000,
    enabled: showModal && payType === 'bill',
  });

  // WO / PO options for the selected vendor — advance payments only
  const { data: advWOs = [] } = useQuery({
    queryKey: ['advance-wo-lookup', form.vendor_id, form.project_id],
    queryFn: () => procurementAdvanceAPI.lookupWOs({ project_id: form.project_id || undefined, vendor_id: form.vendor_id || undefined }).then(r => r.data?.data ?? []),
    enabled: showModal && payType === 'advance' && !!form.vendor_id,
    staleTime: 60 * 1000,
  });
  const { data: advPOs = [] } = useQuery({
    queryKey: ['advance-po-lookup', form.vendor_id, form.project_id],
    queryFn: () => procurementAdvanceAPI.lookupPOs({ project_id: form.project_id || undefined, vendor_id: form.vendor_id || undefined }).then(r => r.data?.data ?? []),
    enabled: showModal && payType === 'advance' && !!form.vendor_id,
    staleTime: 60 * 1000,
  });
  // Existing approved advance vouchers for this vendor, to pay an installment against.
  // Matched by id OR name — vendor_id alone is unreliable across this app's
  // multiple vendor master tables (see backend route comment).
  const { data: existingAdvances = [] } = useQuery({
    queryKey: ['advance-existing-lookup', form.vendor_id, vendorName],
    queryFn: () => procurementAdvanceAPI.list({ vendor_id: form.vendor_id || undefined, vendor_name: vendorName || undefined, approval_status: 'approved' }).then(r => r.data?.data ?? []),
    enabled: showModal && payType === 'advance' && linkExisting && !!vendorName,
    staleTime: 30 * 1000,
  });
  const selectedExistingAdv = existingAdvances.find(a => String(a.id) === String(existingAdvId)) || null;

  // ── QS Certifications pending payment ──────────────────────────────────────
  const { data: qsCertsRes = [], isFetching: qsCertLoading } = useQuery({
    queryKey: ['qs-certs-finance'],
    queryFn: () => vendorQSCertificationAPI.list({}).then(r => r.data?.data ?? []),
    staleTime: 60 * 1000,
  });
  const qsCertsPending = useMemo(() => qsCertsRes.filter(c =>
    c.status !== 'paid' && c.status !== 'cancelled'
    && (Number(c.net_payable || 0) - Number(c.paid_amount || 0)) > 0.5
  ), [qsCertsRes]);
  const qsCertsPaid = useMemo(() => qsCertsRes.filter(c => c.status === 'paid'), [qsCertsRes]);
  const filteredQsCerts = useMemo(() => {
    const q = qsCertSearch.toLowerCase();
    if (!q) return qsCertsPending;
    return qsCertsPending.filter(c =>
      (c.cert_number || '').toLowerCase().includes(q) ||
      (c.vendor_name || '').toLowerCase().includes(q) ||
      (c.ra_bill_number || '').toLowerCase().includes(q) ||
      (c.project_name || '').toLowerCase().includes(q)
    );
  }, [qsCertsPending, qsCertSearch]);
  const qsCertsDueTotal = qsCertsPending.reduce((s, c) =>
    s + Math.max(0, Number(c.net_payable || 0) - Number(c.paid_amount || 0)), 0
  );

  const rawPayments    = Array.isArray(rawPaymentsRes) ? rawPaymentsRes : (rawPaymentsRes?.data ?? []);
  const projects       = Array.isArray(projectsRes) ? projectsRes : (projectsRes?.data ?? []);
  const allRaBills     = Array.isArray(allRaBillsRes?.data) ? allRaBillsRes.data : [];
  const certifiedBills = allRaBills.filter(b => b.status === 'certified');
  const paidBills      = allRaBills.filter(b => b.status === 'paid');
  const payments       = rawPayments.map(p => ({ ...p, project_name: p.project_name ?? '—' }));

  // Merge vendor lists (procurement + tqs) — deduplicate by lowercase name
  const allVendors = useMemo(() => {
    const seen = new Set();
    const merged = [];
    const proc = Array.isArray(procVendorsRes) ? procVendorsRes : [];
    const tqs  = Array.isArray(tqsVendorsRes)  ? tqsVendorsRes  : [];
    for (const v of [...proc, ...tqs]) {
      const key = (v.name || '').toLowerCase().trim();
      if (key && !seen.has(key)) { seen.add(key); merged.push(v); }
    }
    return merged.sort((a, b) => a.name.localeCompare(b.name));
  }, [procVendorsRes, tqsVendorsRes]);

  // Bills for the selected vendor (from DQS pc-pending)
  const vendorBills = useMemo(() => {
    if (!vendorName || payType !== 'bill') return [];
    return tqsPcRes.filter(pc =>
      (pc.vendor_name || '').toLowerCase().trim() === vendorName.toLowerCase().trim()
    );
  }, [vendorName, tqsPcRes, payType]);

  // ── Mutations ──────────────────────────────────────────────────────────────
  const createMut = useMutation({
    mutationFn: d => api.post('/payments', d),
    onSuccess: (_, vars) => {
      toast.success(vars.pc_number ? `Payment recorded & DQS updated (${vars.pc_number})` : 'Payment recorded');
      qc.invalidateQueries({ queryKey: ['payments'] });
      qc.invalidateQueries({ queryKey: ['tqs-bills'] });
      qc.invalidateQueries({ queryKey: ['tqs-pc-pending-finance'] });
      qc.invalidateQueries({ queryKey: ['liability-summary'] });
      qc.invalidateQueries({ queryKey: ['liability-ledger'] });
      setShowModal(false);
      resetModal();
    },
    onError: e => toast.error(e?.response?.data?.error || 'Failed to record payment'),
  });

  const advanceMut = useMutation({
    mutationFn: d => tqsBillsAPI.recordAdvance(d),
    onSuccess: () => {
      toast.success('Advance recorded & linked to Procurement');
      qc.invalidateQueries({ queryKey: ['payments'] });
      qc.invalidateQueries({ queryKey: ['procurement-advances'] });
      qc.invalidateQueries({ queryKey: ['liability-summary'] });
      setShowModal(false);
      resetModal();
    },
    onError: e => toast.error(e?.response?.data?.error || 'Failed to record advance'),
  });

  const payInstallmentMut = useMutation({
    mutationFn: d => procurementAdvanceAPI.payInstallment(existingAdvId, d),
    onSuccess: () => {
      toast.success('Payment recorded against advance voucher');
      qc.invalidateQueries({ queryKey: ['payments'] });
      qc.invalidateQueries({ queryKey: ['procurement-advances'] });
      qc.invalidateQueries({ queryKey: ['advance-existing-lookup'] });
      qc.invalidateQueries({ queryKey: ['liability-summary'] });
      setShowModal(false);
      resetModal();
    },
    onError: e => toast.error(e?.response?.data?.message || 'Failed to record payment'),
  });

  const deleteMut = useMutation({
    mutationFn: id => api.delete(`/payments/${id}`),
    onSuccess: () => { toast.success('Deleted'); qc.invalidateQueries({ queryKey: ['payments'] }); },
  });

  const markPaidMut = useMutation({
    mutationFn: ({ id, data }) => raBillAPI.pay(id, data),
    onSuccess: () => {
      toast.success('Receipt recorded');
      qc.invalidateQueries({ queryKey: ['ra-bills-finance'] }); qc.invalidateQueries({ queryKey: ['ra-bills'] });
      setPayBill(null); setPayForm(EMPTY_PAY_FORM); setRaBillFilter('paid');
    },
    onError: e => toast.error(e?.response?.data?.error || 'Failed'),
  });

  // ── Select a PC to pay ─────────────────────────────────────────────────────
  const selectPc = (pc) => {
    setSelectedPc(pc);
    const netBal = parseFloat(pc.net_balance ?? pc.balance_due ?? 0);
    setForm(f => ({
      ...f,
      payee_name:  pc.vendor_name,
      payee_type:  'Contractor',
      amount:      String(Math.round(netBal)),
      project_id:  pc.project_id || f.project_id,
    }));
  };

  // ── Derived ────────────────────────────────────────────────────────────────
  const filtered = useMemo(() => payments.filter(p => {
    const ms = filterStatus === 'all' || p.status === filterStatus || (filterStatus === 'paid' && p.status === 'success');
    const mq = !search || (p.entity_name || p.payee_name || '').toLowerCase().includes(search.toLowerCase()) || (p.reference_number || '').toLowerCase().includes(search.toLowerCase());
    return ms && mq;
  }), [payments, filterStatus, search]);

  const tabCounts = useMemo(() => PAY_TABS.reduce((acc, s) => ({
    ...acc,
    [s]: s === 'all' ? payments.length : payments.filter(p => p.status === s || (s === 'paid' && p.status === 'success')).length,
  }), {}), [payments]);

  const raBillSource  = raBillFilter === 'certified' ? certifiedBills : raBillFilter === 'paid' ? paidBills : allRaBills.filter(b => ['certified','paid'].includes(b.status));
  const filteredBills = raBillSource.filter(b => !raBillSearch || b.bill_number?.toLowerCase().includes(raBillSearch.toLowerCase()) || b.project_name?.toLowerCase().includes(raBillSearch.toLowerCase()) || b.contractor_name?.toLowerCase().includes(raBillSearch.toLowerCase()));

  const totalOut    = payments.filter(p => ['paid','success'].includes(p.status)).reduce((s, p) => s + Number(p.net_amount || 0), 0);
  const pendingCt   = payments.filter(p => p.status === 'pending').length;
  const raPaid      = paidBills.reduce((s, b) => s + Number(b.amount_received || computeTdsSplit(b).amountReceived || 0), 0);
  const tdsAmount   = form.amount && form.tds_rate ? +(form.amount * form.tds_rate / 100).toFixed(0) : 0;
  const netAmount   = form.amount ? (form.amount - tdsAmount) : 0;
  const tdsSplit    = payBill ? computeTdsSplit(payBill) : null;
  const canSubmitPay = payForm.payment_date && payForm.payment_mode && payForm.payment_ref.trim();

  const canSubmit = (createMut.isPending || advanceMut.isPending || payInstallmentMut.isPending) ? false
    : payType === 'bill'    ? (!!selectedPc && !!form.project_id && !!form.amount && !!form.payment_date)
    : payType === 'advance' ? (linkExisting
                                 ? (!!vendorName && !!existingAdvId && !!form.amount && !!form.payment_date)
                                 : (!!vendorName && !!form.project_id && !!form.amount && !!form.payment_date))
    :                         (!!form.payee_name && !!form.project_id && !!form.amount && !!form.payment_date);

  const handleSubmit = () => {
    if (payType === 'advance' && linkExisting) {
      payInstallmentMut.mutate({
        amount:           parseFloat(form.amount),
        payment_date:     form.payment_date,
        payment_mode:     form.payment_mode,
        reference_number: form.bank_ref || null,
        bank_name:        null,
        remarks:          form.description || null,
      });
      return;
    }
    const base = {
      project_id:       form.project_id,
      payment_mode:     form.payment_mode,
      payment_date:     form.payment_date,
      reference_number: form.bank_ref,
      tds_deducted:     tdsAmount,
      net_amount:       netAmount,
      amount:           form.amount,
      cost_head:        form.cost_head,
      remarks:          form.description,
    };

    if (payType === 'bill' && selectedPc) {
      createMut.mutate({
        ...base,
        entity_name:  selectedPc.vendor_name,
        payee_name:   selectedPc.vendor_name,
        payment_type: 'subcontractor',
        pc_number:    selectedPc.pc_number,
      });
    } else if (payType === 'advance') {
      advanceMut.mutate({
        project_id:       form.project_id,
        vendor_id:        form.vendor_id  || null,
        vendor_name:      vendorName,
        wo_number:        form.wo_number  || null,
        po_number:        form.po_number  || null,
        voucher_number:   form.voucher_number || null,
        voucher_date:     form.voucher_date   || null,
        order_value:      parseFloat(form.order_value || 0) || null,
        amount:           parseFloat(form.amount),
        payment_date:     form.payment_date,
        payment_mode:     form.payment_mode,
        reference_number: form.bank_ref  || null,
        bank_name:        null,
        remarks:          form.description || null,
      });
    } else {
      createMut.mutate({
        ...base,
        entity_name:  form.payee_name,
        payee_name:   form.payee_name,
        payment_type: form.payee_type?.toLowerCase() || 'vendor',
      });
    }
  };

  return (
    <div style={{ background: Theme.pageBg, minHeight: '100vh' }}>

      {/* ── Premium Navy Page Header ── */}
      <PageHeader
        title="Payment Register"
        subtitle="Outgoing payments to vendors · Client receipts from RA bills"
        breadcrumbs={[{ label: 'Finance', href: '/finance' }, { label: 'Payments' }]}
        actions={
          <button onClick={() => { resetModal(); setShowModal(true); }}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors shadow-sm"
            style={{ background: '#fff', color: Theme.navyDark, border: '1px solid rgba(255,255,255,0.4)' }}>
            <Plus className="w-4 h-4" /> Record Payment
          </button>
        }
      />

      <div className="p-6 space-y-5 max-w-7xl mx-auto">

      {/* ── KPIs ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <ThemeKpiCard icon={TrendingDown} label="Total Paid Out"           value={inr(totalOut)}          color="red"     />
        <ThemeKpiCard icon={Clock}        label="Pending Approval"          value={pendingCt}              color="amber"   />
        <ThemeKpiCard icon={TrendingUp}   label="Received from Clients"     value={inr(raPaid)}            color="emerald" />
        <ThemeKpiCard icon={FileCheck2}   label="RA Bills Pending Receipt"  value={certifiedBills.length} color="blue"    />
      </div>

      {/* ── Module tabs ── */}
      <div className="flex gap-2 border-b border-slate-200">
        {[
          ['payments', CreditCard,     'Payments Out'],
          ['qs-certs', FileSignature, 'QS Certifications'],
          ['ra-bills', FileCheck2,    'RA Bills — Client Receipts'],
        ].map(([k, Icon, label]) => (
          <button key={k} onClick={() => setActiveTab(k)}
            className={clsx('px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors flex items-center gap-1.5',
              activeTab === k ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-900 font-medium hover:text-slate-800')}>
            <Icon className="w-4 h-4" /> {label}
            {k === 'ra-bills' && certifiedBills.length > 0 && (
              <span className="bg-violet-100 text-violet-700 text-[10px] font-medium px-1.5 py-0.5 rounded-full">{certifiedBills.length}</span>
            )}
            {k === 'qs-certs' && qsCertsPending.length > 0 && (
              <span className="bg-emerald-100 text-emerald-700 text-[10px] font-medium px-1.5 py-0.5 rounded-full">{qsCertsPending.length}</span>
            )}
          </button>
        ))}
      </div>

      {/* ══ Payments Out ══ */}
      {activeTab === 'payments' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <div className="flex gap-1 bg-slate-100 rounded-xl p-1">
              {PAY_TABS.map(s => (
                <button key={s} onClick={() => setFilterStatus(s)}
                  className={clsx('px-3 py-1.5 text-xs font-medium rounded-lg capitalize transition-colors whitespace-nowrap',
                    filterStatus === s ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-900 font-medium hover:text-slate-700')}>
                  {s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
                  <span className="ml-1.5 text-[10px] text-slate-400">({tabCounts[s] ?? 0})</span>
                </button>
              ))}
            </div>
            <div className="relative flex-1 max-w-sm ml-auto">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:border-indigo-400 bg-white" placeholder="Search payee or reference..." value={search} onChange={e => setSearch(e.target.value)} />
              {search && <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-900 font-medium hover:text-slate-600"><X className="w-3.5 h-3.5" /></button>}
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    {['Payment #', 'Vendor / Payee', 'Project', 'Type', 'Amount', 'TDS', 'Net Paid', 'Mode', 'Date', 'Status', ''].map((h, i) => (
                      <th key={i} className={clsx('px-4 py-3 text-[11px] font-medium text-slate-400 text-left whitespace-nowrap', ['Amount','TDS','Net Paid'].includes(h) ? 'text-right' : '')}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.map(p => (
                    <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3 font-mono text-xs text-indigo-600 font-medium whitespace-nowrap">
                        {p.payment_number || p.id?.slice(0, 8).toUpperCase()}
                        {(p.pc_number) && <div className="text-[10px] text-indigo-400 mt-0.5">PC: {p.pc_number}</div>}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-900 font-medium text-sm">{p.entity_name || p.payee_name}</div>
                        <div className="text-[11px] text-slate-900 font-medium mt-0.5">{p.payment_type || p.payee_type}</div>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-900 whitespace-nowrap">{p.project_name}</td>
                      <td className="px-4 py-3">
                        <span className="bg-slate-100 text-slate-900 text-[10px] font-medium px-2 py-0.5 rounded capitalize">{p.payment_type || '—'}</span>
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-sm font-medium text-slate-800">{inr(p.amount)}</td>
                      <td className="px-4 py-3 text-right font-mono text-xs text-red-500">{(p.tds_deducted || p.tds_amount) > 0 ? inr(p.tds_deducted || p.tds_amount) : '—'}</td>
                      <td className="px-4 py-3 text-right font-mono text-sm font-medium text-emerald-600">{inr(p.net_amount || p.net_paid)}</td>
                      <td className="px-4 py-3"><span className="text-[11px] bg-slate-100 text-slate-900 px-2 py-0.5 rounded font-medium">{p.payment_mode}</span></td>
                      <td className="px-4 py-3 text-xs text-slate-900 font-medium whitespace-nowrap">{p.payment_date ? dayjs(p.payment_date).format('DD MMM YYYY') : '—'}</td>
                      <td className="px-4 py-3"><StatusPill status={p.status} /></td>
                      <td className="px-4 py-3 text-right">
                        <button onClick={() => { if (window.confirm('Delete this payment record?')) deleteMut.mutate(p.id); }} className="text-[11px] text-red-400 hover:text-red-600 font-medium">Delete</button>
                      </td>
                    </tr>
                  ))}
                  {filtered.length === 0 && <tr><td colSpan={11} className="py-16 text-center text-sm text-slate-400">No payment records found</td></tr>}
                </tbody>
                {filtered.length > 0 && (
                  <tfoot>
                    <tr className="bg-slate-50 border-t border-slate-200">
                      <td colSpan={4} className="px-4 py-3 text-xs font-medium text-slate-600">{filtered.length} records</td>
                      <td className="px-4 py-3 text-right font-mono font-medium text-slate-800">{inr(filtered.reduce((s, p) => s + Number(p.amount || 0), 0))}</td>
                      <td className="px-4 py-3 text-right font-mono font-medium text-red-500">{inr(filtered.reduce((s, p) => s + Number(p.tds_deducted || p.tds_amount || 0), 0))}</td>
                      <td className="px-4 py-3 text-right font-mono font-medium text-emerald-600">{inr(filtered.reduce((s, p) => s + Number(p.net_amount || p.net_paid || 0), 0))}</td>
                      <td colSpan={4} />
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ══ RA Bills ══ */}
      {/* ══ QS Certifications ══ */}
      {activeTab === 'qs-certs' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <KpiCard label="Pending Certs" value={qsCertsPending.length} color="amber" icon={FileSignature} />
            <KpiCard label="Total Due"     value={inr(qsCertsDueTotal)}    color="red"   icon={TrendingDown} />
            <KpiCard label="Paid Certs"    value={qsCertsPaid.length}      color="emerald" icon={CheckCircle2} />
          </div>

          <div className="flex items-center gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:border-emerald-400 bg-white"
                placeholder="Search cert no / vendor / RA / project..."
                value={qsCertSearch} onChange={e => setQsCertSearch(e.target.value)} />
              {qsCertSearch && (
                <button onClick={() => setQsCertSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <span className="text-xs text-slate-500 ml-auto">{filteredQsCerts.length} cert(s) pending payment</span>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    {['Cert No.', 'RA Bill', 'Vendor', 'Project', 'Net Payable', 'Paid', 'Due', 'Status', 'Action'].map((h, i) => (
                      <th key={i} className={clsx('px-4 py-3 text-[11px] font-medium text-slate-600 text-left whitespace-nowrap',
                        ['Net Payable','Paid','Due'].includes(h) ? 'text-right' : '',
                        h === 'Action' ? 'text-center' : '')}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {qsCertLoading && (
                    <tr><td colSpan={9} className="px-4 py-8 text-center text-slate-400 text-sm">Loading...</td></tr>
                  )}
                  {!qsCertLoading && filteredQsCerts.length === 0 && (
                    <tr><td colSpan={9} className="px-4 py-12 text-center text-slate-400">
                      <FileSignature className="w-10 h-10 mx-auto mb-2 opacity-30" />
                      <p className="text-sm font-medium">No certifications pending payment</p>
                      <p className="text-[11px] mt-1">All certified bills have been paid</p>
                    </td></tr>
                  )}
                  {filteredQsCerts.map(c => {
                    const net  = Number(c.net_payable || 0);
                    const paid = Number(c.paid_amount || 0);
                    const due  = Math.max(0, net - paid);
                    const partial = paid > 0 && due > 0.5;
                    return (
                      <tr key={c.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-3 font-mono text-xs text-indigo-600 font-medium whitespace-nowrap">
                          {c.cert_number}
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-slate-700 whitespace-nowrap">
                          {c.ra_bill_number || '—'}
                          {c.is_final_bill && <span className="ml-1 bg-red-100 text-red-700 text-[9px] font-bold px-1 py-0.5 rounded">FINAL</span>}
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-medium text-slate-800 text-sm">{c.vendor_name}</div>
                          <div className="text-[10px] text-slate-500 mt-0.5 uppercase tracking-wide">{c.order_type} · {c.order_number || '—'}</div>
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-700 whitespace-nowrap">{c.project_name || '—'}</td>
                        <td className="px-4 py-3 text-right font-mono text-sm font-bold text-slate-900">{inr(net)}</td>
                        <td className="px-4 py-3 text-right font-mono text-xs text-slate-500">{paid > 0 ? inr(paid) : '—'}</td>
                        <td className="px-4 py-3 text-right font-mono text-sm font-extrabold text-emerald-700">{inr(due)}</td>
                        <td className="px-4 py-3">
                          <StatusPill status={partial ? 'partial' : c.status} />
                        </td>
                        <td className="px-4 py-3 text-center">
                          <button
                            onClick={() => setPayCert(c)}
                            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold flex items-center gap-1 mx-auto shadow-sm"
                          >
                            <IndianRupee className="w-3 h-3" />
                            Pay {inr(due)}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'ra-bills' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <div className="flex gap-1 bg-slate-100 rounded-xl p-1">
              {RA_TABS.map(t => (
                <button key={t.key} onClick={() => setRaBillFilter(t.key)}
                  className={clsx('px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap', raBillFilter === t.key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-900 font-medium hover:text-slate-700')}>
                  {t.label}
                  <span className="ml-1.5 text-[10px] text-slate-400">({t.key === 'certified' ? certifiedBills.length : t.key === 'paid' ? paidBills.length : allRaBills.filter(b => ['certified','paid'].includes(b.status)).length})</span>
                </button>
              ))}
            </div>
            <div className="relative flex-1 max-w-sm ml-auto">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:border-violet-400 bg-white" placeholder="Search bill #, project or client..." value={raBillSearch} onChange={e => setRaBillSearch(e.target.value)} />
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    {['Bill #', 'Project / Client', 'Date', 'Net Payable', 'Client TDS',
                      raBillFilter === 'paid' ? 'Amount Received' : 'Status',
                      raBillFilter === 'paid' ? 'Payment Ref' : 'Certified By', ''].map((h, i) => (
                      <th key={i} className={clsx('px-4 py-3 text-[11px] font-medium text-slate-400 text-left whitespace-nowrap', ['Net Payable','Client TDS','Amount Received'].includes(h) ? 'text-right' : '')}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredBills.map(b => {
                    const split = computeTdsSplit(b);
                    const isPaid = b.status === 'paid';
                    return (
                      <tr key={b.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-3"><div className={clsx('font-mono text-xs font-semibold', isPaid ? 'text-emerald-700' : 'text-violet-700')}>{b.bill_number}</div></td>
                        <td className="px-4 py-3"><div className="font-medium text-slate-800">{b.project_name}</div><div className="text-[11px] text-slate-900 font-medium mt-0.5">{b.contractor_name}</div></td>
                        <td className="px-4 py-3 text-xs text-slate-900 font-medium whitespace-nowrap">{b.bill_date ? dayjs(b.bill_date).format('DD MMM YYYY') : '—'}</td>
                        <td className="px-4 py-3 text-right font-mono text-sm font-medium text-slate-800">{inr(b.net_payable)}</td>
                        <td className="px-4 py-3 text-right font-mono text-xs text-red-500">{inr(split.clientTds)}</td>
                        {isPaid ? (
                          <>
                            <td className="px-4 py-3 text-right font-mono text-sm font-medium text-emerald-600">{inr(b.amount_received || split.amountReceived)}</td>
                            <td className="px-4 py-3"><div className="font-mono text-xs font-medium text-slate-700">{b.payment_ref || '—'}</div><div className="text-[11px] text-slate-900 font-medium mt-0.5">{b.payment_mode} · {b.payment_date ? dayjs(b.payment_date).format('DD MMM YYYY') : '—'}</div></td>
                          </>
                        ) : (
                          <>
                            <td className="px-4 py-3"><span className="bg-violet-50 text-violet-700 border border-violet-200 px-2 py-0.5 rounded text-[11px] font-semibold">Certified</span></td>
                            <td className="px-4 py-3 text-xs text-slate-500">{b.certified_by_name || '—'}</td>
                          </>
                        )}
                        <td className="px-4 py-3">
                          {!isPaid && (
                            <button onClick={() => { setPayBill(b); setPayForm(EMPTY_PAY_FORM); }}
                              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium rounded-lg transition-colors whitespace-nowrap">
                              <Banknote className="w-3.5 h-3.5" /> Mark Received
                            </button>
                          )}
                          {isPaid && <span className="text-[11px] text-emerald-600 font-medium flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> Paid</span>}
                        </td>
                      </tr>
                    );
                  })}
                  {filteredBills.length === 0 && <tr><td colSpan={8} className="py-16 text-center text-sm text-slate-400">{raBillFilter === 'paid' ? 'No paid RA bills yet' : 'No certified RA bills pending'}</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          Modal: Record New Payment
      ══════════════════════════════════════════════════════════════════════ */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl w-full max-w-4xl max-h-[94vh] overflow-y-auto shadow-2xl flex flex-col">

            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 flex-shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 bg-indigo-50 border border-indigo-200 rounded-lg flex items-center justify-center">
                  <CreditCard className="w-4 h-4 text-indigo-600" />
                </div>
                <h2 className="text-base font-medium text-slate-800">Record New Payment</h2>
              </div>
              <button onClick={() => { setShowModal(false); resetModal(); }} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-400">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="px-6 py-5 space-y-5 flex-1">

              {/* ── Step 1: Payment Type ── */}
              <div>
                <p className="text-xs font-medium text-slate-900 font-medium uppercase tracking-wider mb-2">Payment Type</p>
                <div className="grid grid-cols-3 gap-2">
                  {PAY_TYPE_CFG.map(({ key, label, icon: Icon, desc }) => (
                    <button key={key} type="button" onClick={() => { setPayType(key); setVendorName(''); setSelectedPc(null); setForm(f => ({ ...f, payee_name: '', amount: '', project_id: '' })); }}
                      className={clsx('flex flex-col items-start gap-1 p-3 rounded-xl border text-left transition-all',
                        payType === key ? 'border-indigo-400 bg-indigo-50 ring-1 ring-indigo-200' : 'border-slate-200 hover:border-slate-300 bg-white')}>
                      <Icon className={clsx('w-4 h-4', payType === key ? 'text-indigo-600' : 'text-slate-400')} />
                      <span className={clsx('text-xs font-bold', payType === key ? 'text-indigo-700' : 'text-slate-700')}>{label}</span>
                      <span className="text-[10px] text-slate-900 font-medium leading-tight">{desc}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* ── Step 2: Vendor (Bill Payment + Advance) ── */}
              {(payType === 'bill' || payType === 'advance') && (
                <div>
                  <label className="block text-xs font-medium text-slate-900 mb-1.5">
                    {payType === 'bill' ? 'Vendor / Subcontractor *' : 'Vendor (Advance Recipient) *'}
                  </label>
                  <VendorPicker
                    vendors={allVendors}
                    value={vendorName}
                    onChange={(name, vendor) => {
                      setVendorName(name);
                      setSelectedPc(null);
                      setForm(f => ({
                        ...f,
                        payee_name: name,
                        vendor_name: name,
                        vendor_id: vendor?.id || '',
                        amount: payType === 'advance' ? f.amount : '',
                        project_id: payType === 'advance' ? f.project_id : '',
                      }));
                    }}
                    placeholder="Select vendor..."
                  />
                </div>
              )}

              {/* ── Step 3: Bill List (Bill Payment mode, vendor selected) ── */}
              {payType === 'bill' && vendorName && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-medium text-slate-600">Pending Bills for {vendorName}</p>
                    {pcLoading && <span className="text-[10px] text-slate-400">Loading...</span>}
                  </div>

                  {vendorBills.length === 0 && !pcLoading ? (
                    <div className="border border-slate-200 rounded-xl p-4 text-center">
                      <p className="text-sm text-slate-500">No pending bills found for this vendor</p>
                      <p className="text-xs text-slate-900 font-medium mt-1">Bills must be at Accounts stage in Bill Tracker</p>
                    </div>
                  ) : (
                    <div className="border border-slate-200 rounded-xl overflow-hidden">
                      {vendorBills.map((pc, i) => {
                        const netBal   = parseFloat(pc.net_balance ?? pc.balance_due ?? 0);
                        const prevPaid = parseFloat(pc.total_paid ?? 0);
                        const isSel    = selectedPc?.pc_number === pc.pc_number;
                        return (
                          <button key={pc.pc_number} type="button" onClick={() => isSel ? (setSelectedPc(null)) : selectPc(pc)}
                            className={clsx('w-full text-left px-4 py-3 border-b border-slate-100 last:border-b-0 transition-colors flex items-center gap-3',
                              isSel ? 'bg-indigo-50 border-indigo-100' : 'hover:bg-slate-50')}>
                            {/* Checkbox indicator */}
                            <div className={clsx('w-4 h-4 rounded border-2 flex-shrink-0 flex items-center justify-center',
                              isSel ? 'bg-indigo-600 border-indigo-600' : 'border-slate-300')}>
                              {isSel && <CheckCircle2 className="w-3 h-3 text-white" />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="font-mono text-xs font-medium text-indigo-700">{pc.pc_number}</span>
                                {pc.bill_count > 1 && <span className="text-[10px] text-slate-400">{pc.bill_count} bills</span>}
                                {prevPaid > 0 && <span className="bg-amber-100 text-amber-700 text-[9px] font-medium px-1.5 py-0.5 rounded">Partial paid</span>}
                              </div>
                              {/* Mini bill list */}
                              {pc.bills && (
                                <div className="mt-1 text-[11px] text-slate-900 font-medium space-y-0.5">
                                  {(pc.bills || []).slice(0, 3).map((b, bi) => (
                                    <div key={bi} className="flex items-center gap-2">
                                      <span className="font-mono">{b.sl_number || b.inv_number || `Bill ${bi+1}`}</span>
                                      <span className="text-slate-300">·</span>
                                      <span className="text-indigo-600 font-semibold">{inr(b.certified_net)}</span>
                                      {b.paid_amount > 0 && <span className="text-emerald-600">({inr(b.paid_amount)} paid)</span>}
                                    </div>
                                  ))}
                                  {pc.bills.length > 3 && <span className="text-slate-400">+{pc.bills.length - 3} more</span>}
                                </div>
                              )}
                            </div>
                            <div className="text-right flex-shrink-0">
                              {prevPaid > 0 && <div className="text-[10px] text-slate-900 font-medium line-through">{inr(pc.total_certified)}</div>}
                              <div className="text-sm font-medium text-red-600">{inr(netBal)}</div>
                              <div className="text-[10px] text-slate-400">{prevPaid > 0 ? 'balance' : 'payable'}</div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* ── Advance mode toggle: brand-new advance vs an installment against
                   an already-approved voucher in the Advance Tracker ── */}
              {payType === 'advance' && vendorName && (
                <div className="flex gap-2">
                  <button type="button" onClick={() => { setLinkExisting(false); setExistingAdvId(''); }}
                    className={clsx('flex-1 px-3 py-2 rounded-lg text-xs font-semibold border transition-colors',
                      !linkExisting ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50')}>
                    New Advance
                  </button>
                  <button type="button" onClick={() => setLinkExisting(true)}
                    className={clsx('flex-1 px-3 py-2 rounded-lg text-xs font-semibold border transition-colors',
                      linkExisting ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50')}>
                    Pay Existing Advance
                  </button>
                </div>
              )}

              {/* ── Pay an installment against an existing Advance Tracker voucher ── */}
              {payType === 'advance' && vendorName && linkExisting && (
                <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4 space-y-3">
                  <p className="text-[10px] uppercase font-bold text-emerald-700 tracking-wider">Advance Tracker Voucher</p>
                  <select className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-emerald-400 bg-white"
                    value={existingAdvId} onChange={e => setExistingAdvId(e.target.value)}>
                    <option value="">— Select advance voucher —</option>
                    {existingAdvances.map(a => {
                      const remaining = Number(a.advance_value || 0) - Number(a.paid_amount || 0);
                      return (
                        <option key={a.id} value={a.id}>
                          {a.sl_number}{a.voucher_number ? ` · ${a.voucher_number}` : ''} — {inr(a.advance_value)} sanctioned, {inr(a.paid_amount || 0)} paid, {inr(remaining)} remaining
                        </option>
                      );
                    })}
                  </select>
                  {!existingAdvances.length && (
                    <p className="text-[11px] text-emerald-700">No approved advance vouchers found for this vendor.</p>
                  )}
                  {selectedExistingAdv && (
                    <div className="space-y-3 pt-1">
                      <div className="grid grid-cols-4 gap-3">
                        <div>
                          <p className="text-[10px] text-emerald-600 uppercase font-semibold">Sanctioned</p>
                          <p className="text-sm font-bold text-slate-800">{inr(selectedExistingAdv.advance_value)}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-emerald-600 uppercase font-semibold">Paid So Far</p>
                          <p className="text-sm font-bold text-slate-800">{inr(selectedExistingAdv.paid_amount || 0)}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-emerald-600 uppercase font-semibold">Remaining</p>
                          <p className="text-sm font-bold text-emerald-700">{inr(Number(selectedExistingAdv.advance_value || 0) - Number(selectedExistingAdv.paid_amount || 0))}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-emerald-600 uppercase font-semibold">Order Value</p>
                          <p className="text-sm font-bold text-slate-800">{selectedExistingAdv.order_value ? inr(selectedExistingAdv.order_value) : '—'}</p>
                        </div>
                      </div>
                      <div className="grid grid-cols-4 gap-3 pt-3 border-t border-emerald-100">
                        <div>
                          <p className="text-[10px] text-emerald-600 uppercase font-semibold">Project</p>
                          <p className="text-xs font-medium text-slate-700 truncate" title={selectedExistingAdv.project_name}>{selectedExistingAdv.project_name || '—'}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-emerald-600 uppercase font-semibold">WO / PO Ref</p>
                          <p className="text-xs font-medium text-slate-700 font-mono">{selectedExistingAdv.wo_number || selectedExistingAdv.po_number || '—'}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-emerald-600 uppercase font-semibold">Voucher Date</p>
                          <p className="text-xs font-medium text-slate-700">{selectedExistingAdv.voucher_date ? String(selectedExistingAdv.voucher_date).slice(0, 10) : '—'}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-emerald-600 uppercase font-semibold">TDS Rate</p>
                          <p className="text-xs font-medium text-slate-700">{selectedExistingAdv.tds_rate ? `${selectedExistingAdv.tds_rate}%` : '—'}</p>
                        </div>
                      </div>
                      {selectedExistingAdv.work_desc && (
                        <div className="pt-3 border-t border-emerald-100">
                          <p className="text-[10px] text-emerald-600 uppercase font-semibold mb-0.5">Work Description</p>
                          <p className="text-xs text-slate-600">{selectedExistingAdv.work_desc}</p>
                        </div>
                      )}
                    </div>
                  )}
                  <p className="text-[10px] text-emerald-600">This payment is logged as a dated installment against the selected voucher — its Paid Amount and payment history update, no new voucher is created.</p>
                </div>
              )}

              {/* ── Advance Tracker Fields (advance type only, new advance) ── */}
              {payType === 'advance' && vendorName && !linkExisting && (
                <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4 space-y-3">
                  <p className="text-[10px] uppercase font-bold text-indigo-600 tracking-wider">Bill Tracker Link</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">Work Order</label>
                      <select className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-400 bg-white"
                        value={form.wo_number}
                        onChange={e => {
                          const wo = advWOs.find(w => w.wo_number === e.target.value);
                          setForm(f => ({ ...f, wo_number: e.target.value, po_number: e.target.value ? '' : f.po_number, order_value: wo ? (wo.total_with_tax ?? wo.total_value ?? '') : f.order_value }));
                        }}>
                        <option value="">— Select work order (optional) —</option>
                        {advWOs.map(w => <option key={w.id} value={w.wo_number}>{w.wo_number}{w.subject ? ` · ${w.subject}` : ''}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">Purchase Order</label>
                      <select className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-400 bg-white"
                        value={form.po_number}
                        onChange={e => {
                          const po = advPOs.find(p => p.po_number === e.target.value);
                          setForm(f => ({ ...f, po_number: e.target.value, wo_number: e.target.value ? '' : f.wo_number, order_value: po ? (po.total_with_tax ?? po.total_value ?? '') : f.order_value }));
                        }}>
                        <option value="">— Select purchase order (optional) —</option>
                        {advPOs.map(p => <option key={p.id} value={p.po_number}>{p.po_number}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">Voucher Number</label>
                      <input className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-400 bg-white" placeholder="Advance voucher no." value={form.voucher_number} onChange={e => setForm(f => ({ ...f, voucher_number: e.target.value }))} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">Voucher Date</label>
                      <input type="date" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-400 bg-white" value={form.voucher_date} onChange={e => setForm(f => ({ ...f, voucher_date: e.target.value }))} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">PO / WO Order Value</label>
                      <input type="number" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-400 bg-white" placeholder="Total WO/PO value (₹)" value={form.order_value || ''} onChange={e => setForm(f => ({ ...f, order_value: e.target.value }))} />
                    </div>
                  </div>
                  <p className="text-[10px] text-indigo-500">This advance will appear in TQS → Advance Tracker and will be auto-recovered from future bills.</p>
                </div>
              )}

              {/* ── General Expense: free-form payee ── */}
              {payType === 'general' && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <label className="block text-xs font-medium text-slate-900 mb-1.5">Payee Name *</label>
                    <input className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-400" placeholder="Name of recipient" value={form.payee_name} onChange={e => setForm(f => ({ ...f, payee_name: e.target.value }))} />
                  </div>
                </div>
              )}

              {/* ── Common fields: Project, Description, Cost Head ── */}
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-900 mb-1.5">Project *</label>
                  <select className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-400 bg-white" value={form.project_id} onChange={e => setForm(f => ({ ...f, project_id: e.target.value }))}>
                    <option value="">Select project...</option>
                    {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-900 mb-1.5">Description / Ref</label>
                  <input className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-400" placeholder={payType === 'advance' ? 'Advance purpose / work order reference' : 'Invoice # or payment remarks'} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-900 mb-1.5">Cost Head <span className="text-indigo-400 font-normal">(links to Budget vs Actual)</span></label>
                  <select className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-400 bg-white" value={form.cost_head} onChange={e => setForm(f => ({ ...f, cost_head: e.target.value }))}>
                    <option value="">— Optional —</option>
                    {COST_HEADS.map(g => (<optgroup key={g.group} label={g.group}>{g.items.map(item => <option key={item} value={item}>{item}</option>)}</optgroup>))}
                  </select>
                </div>
              </div>

              {/* ── Amount + TDS ── */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-900 mb-1.5">
                    Gross Amount (₹) *
                    {selectedPc && <span className="ml-2 text-indigo-400 font-normal normal-case">Balance: {inr(selectedPc.net_balance ?? selectedPc.balance_due)}</span>}
                  </label>
                  <input type="number" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono outline-none focus:border-indigo-400" placeholder="0" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-900 mb-1.5">TDS Rate (%)</label>
                  <select className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-400 bg-white" value={form.tds_rate} onChange={e => setForm(f => ({ ...f, tds_rate: Number(e.target.value) }))}>
                    <option value={0}>0% (None)</option>
                    <option value={1}>1% (194C – Corp)</option>
                    <option value={2}>2% (194C – Indv)</option>
                    <option value={10}>10% (194J – Prof)</option>
                  </select>
                </div>
              </div>

              {/* Breakdown strip */}
              {form.amount > 0 && (
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 grid grid-cols-3 gap-3 text-center">
                  <div><div className="text-[10px] text-slate-900 font-medium mb-1">Gross Pay</div><div className="font-mono font-medium text-slate-800">{inr(form.amount)}</div></div>
                  <div><div className="text-[10px] text-slate-900 font-medium mb-1">TDS Hold</div><div className="font-mono font-medium text-red-500">{inr(tdsAmount)}</div></div>
                  <div><div className="text-[10px] text-slate-900 font-medium mb-1">Net Released</div><div className="font-mono font-medium text-emerald-600">{inr(netAmount)}</div></div>
                </div>
              )}

              {/* ── Payment Details ── */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-900 mb-1.5">Payment Mode *</label>
                  <select className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-400 bg-white" value={form.payment_mode} onChange={e => setForm(f => ({ ...f, payment_mode: e.target.value }))}>
                    {PAYMENT_MODES.map(m => <option key={m}>{m}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-900 mb-1.5">Payment Date *</label>
                  <input type="date" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-400" value={form.payment_date} onChange={e => setForm(f => ({ ...f, payment_date: e.target.value }))} />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-900 mb-1.5">Bank Ref / UTR</label>
                <input className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono outline-none focus:border-indigo-400" placeholder="N03022... or Cheque Number" value={form.bank_ref} onChange={e => setForm(f => ({ ...f, bank_ref: e.target.value }))} />
              </div>

              {/* Submit */}
              <div className="flex gap-3 pt-1 border-t border-slate-100">
                <button className="flex-1 py-2.5 border border-slate-200 text-slate-900 hover:bg-slate-50 text-sm font-medium rounded-lg transition-colors" onClick={() => { setShowModal(false); resetModal(); }}>Cancel</button>
                <button
                  className="flex-[2] py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors shadow-sm flex items-center justify-center gap-2"
                  disabled={!canSubmit}
                  onClick={handleSubmit}
                >
                  {createMut.isPending ? 'Saving...' : (
                    <>
                      <ArrowRight className="w-4 h-4" />
                      {payType === 'bill' ? `Record Payment${selectedPc ? ` — ${inr(form.amount || 0)}` : ''}`
                        : payType === 'advance' ? (linkExisting ? 'Record Installment Payment' : 'Record Advance')
                        : 'Record Expense'}
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══ Modal: Mark RA Bill as Received ══════════════════════════════════ */}
      {payBill && tdsSplit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center justify-center"><Banknote className="w-4 h-4 text-emerald-600" /></div>
                <h2 className="text-base font-medium text-slate-800">Record Client Receipt</h2>
              </div>
              <button onClick={() => setPayBill(null)} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-400"><X className="w-4 h-4" /></button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2">
                {[['Bill', payBill.bill_number], ['Project', payBill.project_name], ['Client', payBill.contractor_name]].map(([k, v]) => (
                  <div key={k} className="flex justify-between text-sm"><span className="text-slate-500">{k}</span><span className="font-medium text-slate-800">{v}</span></div>
                ))}
              </div>
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <div className="bg-slate-50 px-4 py-2.5 text-[11px] font-semibold text-slate-500 border-b border-slate-200">Payment Breakdown</div>
                <div className="divide-y divide-slate-100">
                  <div className="flex justify-between px-4 py-3 text-sm"><span className="text-slate-600">Net Payable</span><span className="font-mono font-medium text-slate-800">{inr(tdsSplit.netPayable)}</span></div>
                  <div className="flex justify-between px-4 py-3 text-sm"><span className="text-red-500">Less: Client TDS @ {payBill.tds_rate || 2}%</span><span className="font-mono font-medium text-red-500">− {inr(tdsSplit.clientTds)}</span></div>
                  <div className="flex justify-between px-4 py-3 bg-emerald-50"><span className="font-medium text-emerald-700">Amount to Receive</span><span className="font-mono font-medium text-emerald-600 text-base">{inr(tdsSplit.amountReceived)}</span></div>
                </div>
              </div>
              <div className="space-y-3">
                <div><label className="block text-xs font-medium text-slate-900 mb-1.5">Payment Date *</label><input type="date" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-emerald-400" value={payForm.payment_date} onChange={e => setPayForm(f => ({ ...f, payment_date: e.target.value }))} /></div>
                <div><label className="block text-xs font-medium text-slate-900 mb-1.5">Payment Mode *</label><select className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-emerald-400 bg-white" value={payForm.payment_mode} onChange={e => setPayForm(f => ({ ...f, payment_mode: e.target.value }))}>{PAYMENT_MODES.map(m => <option key={m}>{m}</option>)}</select></div>
                <div><label className="block text-xs font-medium text-slate-900 mb-1.5">UTR / Ref *</label><input className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono outline-none focus:border-emerald-400" placeholder="N03022..." value={payForm.payment_ref} onChange={e => setPayForm(f => ({ ...f, payment_ref: e.target.value }))} /></div>
              </div>
              <div className="flex gap-3 pt-2 border-t border-slate-100">
                <button className="flex-1 py-2.5 border border-slate-200 text-slate-900 text-sm font-medium rounded-lg" onClick={() => setPayBill(null)}>Cancel</button>
                <button
                  className="flex-[2] py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg shadow-sm flex items-center justify-center gap-2"
                  disabled={!canSubmitPay || markPaidMut.isPending}
                  onClick={() => markPaidMut.mutate({ id: payBill.id, data: { ...payForm, client_tds_amount: tdsSplit.clientTds, amount_received: tdsSplit.amountReceived } })}
                >
                  <Banknote className="w-4 h-4" />
                  {markPaidMut.isPending ? 'Processing...' : `Confirm — ${inr(tdsSplit.amountReceived)}`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── QS Cert Payment modal ── */}
      {payCert && <QSCertPaymentModal cert={payCert} onClose={() => setPayCert(null)} />}
      </div>
    </div>
  );
}
