import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { procurementAdvanceAPI, projectAPI } from '../../api/client';
import useAuthStore from '../../store/authStore';
import toast from 'react-hot-toast';
import {
  ArrowLeft, Edit2, CheckCircle2, RotateCcw, Save, X,
  IndianRupee, Wallet, Clock, FileText, ChevronRight,
  TrendingDown, AlertTriangle, Printer,
} from 'lucide-react';

const inr = (v) => Number(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function fmt(d) {
  if (!d) return '—';
  const x = new Date(d);
  if (isNaN(x.getTime())) return '—';
  return `${String(x.getDate()).padStart(2,'0')}-${String(x.getMonth()+1).padStart(2,'0')}-${x.getFullYear()}`;
}

const STATUS_CFG = {
  pending:   { label: 'Pending',          bg: 'bg-amber-100',   text: 'text-amber-700',   dot: 'bg-amber-500',   accent: '#D97706' },
  issued:    { label: 'Issued',           bg: 'bg-emerald-100', text: 'text-emerald-700', dot: 'bg-emerald-500', accent: '#059669' },
  partial:   { label: 'Partial Recovery', bg: 'bg-blue-100',    text: 'text-blue-700',    dot: 'bg-blue-500',    accent: '#2563EB' },
  recovered: { label: 'Recovered',        bg: 'bg-slate-100',   text: 'text-slate-600',   dot: 'bg-slate-400',   accent: '#64748B' },
};

function StatusBadge({ status }) {
  const cfg = STATUS_CFG[status] || STATUS_CFG.pending;
  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium ${cfg.bg} ${cfg.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}

const APPROVAL_CFG = {
  pending:              { label: 'Awaiting Procurement', bg: 'bg-amber-100',   text: 'text-amber-700'   },
  procurement_approved:{ label: 'Awaiting MD Approval',  bg: 'bg-indigo-100',  text: 'text-indigo-700'  },
  approved:            { label: 'Approved',              bg: 'bg-emerald-100', text: 'text-emerald-700' },
  rejected:            { label: 'Rejected',              bg: 'bg-red-100',     text: 'text-red-600'     },
};

function ApprovalBadge({ status }) {
  const cfg = APPROVAL_CFG[status || 'pending'] || APPROVAL_CFG.pending;
  return (
    <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${cfg.bg} ${cfg.text}`}>
      {cfg.label}
    </span>
  );
}

const F = 'w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-400 outline-none bg-white';
function Lbl({ children, req }) {
  return <label className="block text-xs font-medium text-slate-900 mb-1">{children}{req && <span className="text-red-500 ml-0.5">*</span>}</label>;
}

function InfoRow({ label, value, mono }) {
  return (
    <div>
      <p className="text-[10px] font-medium text-slate-900 font-medium uppercase tracking-wider mb-0.5">{label}</p>
      <p className={`text-sm text-slate-900 font-medium ${mono ? 'font-mono' : ''}`}>{value || '—'}</p>
    </div>
  );
}

// ── KPI stat card ─────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, color, borderColor }) {
  return (
    <div style={{ background: '#fff', border: `1px solid #E2E8F0`, borderTop: `3px solid ${borderColor}`, borderRadius: 10, padding: '14px 16px' }}>
      <p style={{ fontSize: 10, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>{label}</p>
      <p style={{ fontSize: 20, fontWeight: 900, color, lineHeight: 1 }}>{value}</p>
      {sub && <p style={{ fontSize: 10, color: '#94A3B8', marginTop: 4 }}>{sub}</p>}
    </div>
  );
}

// ── Issue Modal ───────────────────────────────────────────────────────────────
function IssueModal({ voucher, onClose }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ paid_amount: voucher.advance_value || '', pay_date: '' });

  const mutation = useMutation({
    mutationFn: () => procurementAdvanceAPI.issue(voucher.id, form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['procurement-advance', String(voucher.id)] });
      qc.invalidateQueries({ queryKey: ['procurement-advances'] });
      qc.invalidateQueries({ queryKey: ['procurement-advances-summary'] });
      toast.success('Advance marked as issued');
      onClose();
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed'),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b bg-emerald-600 rounded-t-2xl">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-white" />
            <h2 className="text-sm font-medium text-white">Mark as Issued / Disbursed</h2>
          </div>
          <button onClick={onClose} className="text-emerald-200 hover:text-white"><X size={18} /></button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div className="bg-emerald-50 rounded-lg p-3 border border-emerald-100">
            <p className="text-xs text-emerald-700 font-medium">Sanctioned Advance: <span className="font-medium">₹{inr(voucher.advance_value)}</span></p>
          </div>
          <div>
            <Lbl req>Disbursed Amount (₹)</Lbl>
            <input type="number" className={F} value={form.paid_amount}
              onChange={e => setForm(f => ({ ...f, paid_amount: e.target.value }))} />
          </div>
          <div>
            <Lbl req>Payment Date</Lbl>
            <input type="date" className={F} value={form.pay_date}
              onChange={e => setForm(f => ({ ...f, pay_date: e.target.value }))} />
          </div>
        </div>
        <div className="flex justify-end gap-3 px-6 py-4 border-t bg-slate-50 rounded-b-2xl">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-medium text-slate-900 border border-slate-200 hover:bg-slate-100">Cancel</button>
          <button onClick={() => mutation.mutate()} disabled={mutation.isPending || !form.pay_date}
            className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 transition-all">
            <CheckCircle2 size={14} />{mutation.isPending ? 'Saving...' : 'Confirm Issuance'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Recovery Modal ────────────────────────────────────────────────────────────
function RecoveryModal({ voucher, onClose }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ amount: '', recovery_date: '', bill_id: '', notes: '' });
  const outstanding = parseFloat(voucher.advance_value || 0) - parseFloat(voucher.recovered_amount || 0);

  const { data: bills = [] } = useQuery({
    queryKey: ['advance-bills-lookup', voucher.vendor_id, voucher.vendor_name],
    queryFn:  () => procurementAdvanceAPI.lookupBillsByVendor({
      vendor_id:   voucher.vendor_id   || undefined,
      vendor_name: voucher.vendor_name || undefined,
      project_id:  voucher.project_id  || undefined,
    }).then(r => r.data?.data ?? []),
    staleTime: 5 * 60 * 1000,
  });

  const mutation = useMutation({
    mutationFn: () => procurementAdvanceAPI.recover(voucher.id, {
      ...form,
      bill_id: form.bill_id || null,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['procurement-advance', String(voucher.id)] });
      qc.invalidateQueries({ queryKey: ['procurement-advances'] });
      qc.invalidateQueries({ queryKey: ['procurement-advances-summary'] });
      toast.success('Recovery recorded');
      onClose();
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed'),
  });

  const inrFmt = (v) => Number(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b bg-indigo-600 rounded-t-2xl">
          <div className="flex items-center gap-3">
            <RotateCcw className="w-5 h-5 text-white" />
            <h2 className="text-sm font-medium text-white">Record Recovery</h2>
          </div>
          <button onClick={onClose} className="text-indigo-200 hover:text-white"><X size={18} /></button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div className="bg-amber-50 rounded-lg p-3 border border-amber-100">
            <p className="text-xs text-amber-700 font-medium">Outstanding Balance: <span className="font-medium">₹{inr(outstanding)}</span></p>
          </div>
          <div>
            <Lbl req>Recovered Amount (₹)</Lbl>
            <input type="number" className={F} value={form.amount}
              onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
              max={outstanding} placeholder="Amount recovered this transaction" />
          </div>
          <div>
            <Lbl req>Recovery Date</Lbl>
            <input type="date" className={F} value={form.recovery_date}
              onChange={e => setForm(f => ({ ...f, recovery_date: e.target.value }))} />
          </div>
          <div>
            <Lbl>Link to Bill (optional)</Lbl>
            <select className={F} value={form.bill_id} onChange={e => setForm(f => ({ ...f, bill_id: e.target.value }))}>
              <option value="">— No bill link —</option>
              {bills.map(b => (
                <option key={b.id} value={b.id}>
                  {b.sl_number}{b.inv_number ? ` · ${b.inv_number}` : ''} — ₹{inrFmt(b.total_amount)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Lbl>Notes</Lbl>
            <input className={F} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              placeholder="e.g. Recovered via RA-3 bill" />
          </div>
        </div>
        <div className="flex justify-end gap-3 px-6 py-4 border-t bg-slate-50 rounded-b-2xl">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-medium text-slate-900 border border-slate-200 hover:bg-slate-100">Cancel</button>
          <button onClick={() => mutation.mutate()} disabled={mutation.isPending || !form.amount || !form.recovery_date}
            className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 transition-all">
            <RotateCcw size={14} />{mutation.isPending ? 'Saving...' : 'Record Recovery'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Edit Panel ────────────────────────────────────────────────────────────────
function EditPanel({ voucher, projects, onCancel, onSaved }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    vendor_id:                voucher.vendor_id || '',
    vendor_name:              voucher.vendor_name || '',
    project_id:               voucher.project_id || '',
    work_desc:                voucher.work_desc || '',
    wo_number:                voucher.wo_number || '',
    po_number:                voucher.po_number || '',
    po_date:                  voucher.po_date?.split('T')[0] || '',
    voucher_number:           voucher.voucher_number || '',
    voucher_date:             voucher.voucher_date?.split('T')[0] || '',
    proforma_invoice_date:    voucher.proforma_invoice_date?.split('T')[0] || '',
    proforma_invoice_number:  voucher.proforma_invoice_number || '',
    ra_bill_no:               voucher.ra_bill_no || 'Advance',
    order_value:              voucher.order_value || '',
    variation_value:          voucher.variation_value || '',
    advance_value:            voucher.advance_value || '',
    advance_pct:              voucher.advance_pct || '',
    gross_certified_till_date: voucher.gross_certified_till_date || '',
    mobilisation_advance_deduction: voucher.mobilisation_advance_deduction || '',
    retention_deduction:      voucher.retention_deduction || '',
    other_deductions:         voucher.other_deductions || '',
    previous_certificates:    voucher.previous_certificates || '',
    balance_to_finish:        voucher.balance_to_finish || '',
    current_net_payment_due:  voucher.current_net_payment_due || '',
    amount_in_words:          voucher.amount_in_words || '',
    prepared_by_name:         voucher.prepared_by_name || '',
    director_name:            voucher.director_name || 'Mr. S.Srinivas Raju',
    md_name:                  voucher.md_name || 'Mr. Stephen A',
    qs_handover_date:         voucher.qs_handover_date?.split('T')[0] || '',
    accts_received_date:      voucher.accts_received_date?.split('T')[0] || '',
    remarks:                  voucher.remarks || '',
    note:                     voucher.note || '',
  });

  const mutation = useMutation({
    mutationFn: () => procurementAdvanceAPI.update(voucher.id, form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['procurement-advance', String(voucher.id)] });
      toast.success('Voucher updated');
      onSaved();
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed'),
  });

  const set = (k, v) => setForm(f => {
    const nf = { ...f, [k]: v };
    if (k === 'advance_value' || k === 'order_value') {
      const adv = parseFloat(k === 'advance_value' ? v : nf.advance_value) || 0;
      const ord = parseFloat(k === 'order_value'   ? v : nf.order_value)   || 0;
      nf.advance_pct = ord > 0 ? ((adv / ord) * 100).toFixed(2) : '';
      if (!nf.current_net_payment_due || k === 'advance_value') nf.current_net_payment_due = String(adv);
    }
    return nf;
  });

  return (
    <div className="bg-white rounded-xl border border-blue-200 shadow-sm p-5 mt-4">
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs font-medium text-slate-900 font-medium uppercase tracking-widest">Edit Voucher</p>
        <button onClick={onCancel} className="text-slate-900 font-medium hover:text-slate-600"><X size={16} /></button>
      </div>
      {/* Project & Vendor */}
      <p className="text-[10px] font-medium text-slate-900 font-medium uppercase tracking-widest mb-2">Project & Vendor</p>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4">
        <div>
          <Lbl>Project</Lbl>
          <select className={F} value={form.project_id} onChange={e => set('project_id', e.target.value)}>
            <option value="">—</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div><Lbl req>Vendor Name</Lbl><input className={F} value={form.vendor_name} onChange={e => set('vendor_name', e.target.value)} /></div>
        <div className="md:col-span-1"><Lbl>Package / Work Description</Lbl><input className={F} value={form.work_desc} onChange={e => set('work_desc', e.target.value)} placeholder="e.g. Supply of Lift Machine" /></div>
      </div>

      {/* Purchase / Work Order */}
      <p className="text-[10px] font-medium text-slate-900 font-medium uppercase tracking-widest mb-2">Purchase / Work Order</p>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        <div><Lbl>WO Number</Lbl><input className={F} value={form.wo_number} onChange={e => set('wo_number', e.target.value)} /></div>
        <div><Lbl>PO Number</Lbl><input className={F} value={form.po_number} onChange={e => set('po_number', e.target.value)} /></div>
        <div><Lbl>PO / WO Date</Lbl><input type="date" className={F} value={form.po_date} onChange={e => set('po_date', e.target.value)} /></div>
        <div><Lbl>Order Value (₹)</Lbl><input type="number" className={F} value={form.order_value} onChange={e => set('order_value', e.target.value)} /></div>
      </div>

      {/* Payment Certification */}
      <p className="text-[10px] font-medium text-slate-900 font-medium uppercase tracking-widest mb-2">Payment Certification</p>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        <div><Lbl>Cert. Number</Lbl><input className={F} value={form.voucher_number} onChange={e => set('voucher_number', e.target.value)} /></div>
        <div><Lbl>Cert. Date</Lbl><input type="date" className={F} value={form.voucher_date} onChange={e => set('voucher_date', e.target.value)} /></div>
        <div><Lbl req>Advance Value (₹)</Lbl><input type="number" className={F} value={form.advance_value} onChange={e => set('advance_value', e.target.value)} /></div>
        <div><Lbl>Advance %</Lbl><input type="number" className={F} value={form.advance_pct} onChange={e => set('advance_pct', e.target.value)} /></div>
        <div><Lbl>RA Bill No.</Lbl><input className={F} value={form.ra_bill_no} onChange={e => set('ra_bill_no', e.target.value)} /></div>
      </div>

      {/* Claim Summary */}
      <p className="text-[10px] font-medium text-slate-900 font-medium uppercase tracking-widest mb-2">Claim Summary</p>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        <div><Lbl>Variation Orders</Lbl><input type="number" className={F} value={form.variation_value} onChange={e => set('variation_value', e.target.value)} /></div>
        <div><Lbl>Gross Certified Till Date</Lbl><input type="number" className={F} value={form.gross_certified_till_date} onChange={e => set('gross_certified_till_date', e.target.value)} /></div>
        <div><Lbl>Mobilisation Deduction</Lbl><input type="number" className={F} value={form.mobilisation_advance_deduction} onChange={e => set('mobilisation_advance_deduction', e.target.value)} /></div>
        <div><Lbl>Retention Deduction</Lbl><input type="number" className={F} value={form.retention_deduction} onChange={e => set('retention_deduction', e.target.value)} /></div>
        <div><Lbl>Other Deductions</Lbl><input type="number" className={F} value={form.other_deductions} onChange={e => set('other_deductions', e.target.value)} /></div>
        <div><Lbl>Previous Certificates</Lbl><input type="number" className={F} value={form.previous_certificates} onChange={e => set('previous_certificates', e.target.value)} /></div>
        <div><Lbl>Balance to Finish</Lbl><input type="number" className={F} value={form.balance_to_finish} onChange={e => set('balance_to_finish', e.target.value)} /></div>
        <div><Lbl>Current Net Payment Due</Lbl><input type="number" className={F} value={form.current_net_payment_due} onChange={e => set('current_net_payment_due', e.target.value)} /></div>
        <div className="md:col-span-4"><Lbl>Amount Certified in Words</Lbl><input className={F} value={form.amount_in_words} onChange={e => set('amount_in_words', e.target.value)} placeholder="Leave blank to auto-generate" /></div>
      </div>

      {/* Proforma Invoice */}
      <p className="text-[10px] font-medium text-slate-900 font-medium uppercase tracking-widest mb-2">Proforma Invoice</p>
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div><Lbl>Date of Proforma Invoice</Lbl><input type="date" className={F} value={form.proforma_invoice_date} onChange={e => set('proforma_invoice_date', e.target.value)} /></div>
        <div><Lbl>Proforma Invoice Number</Lbl><input className={F} value={form.proforma_invoice_number} onChange={e => set('proforma_invoice_number', e.target.value)} /></div>
      </div>

      {/* Workflow Dates */}
      <p className="text-[10px] font-medium text-slate-900 font-medium uppercase tracking-widest mb-2">Workflow Dates</p>
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div><Lbl>QS Handover Date</Lbl><input type="date" className={F} value={form.qs_handover_date} onChange={e => set('qs_handover_date', e.target.value)} /></div>
        <div><Lbl>Accounts Received Date</Lbl><input type="date" className={F} value={form.accts_received_date} onChange={e => set('accts_received_date', e.target.value)} /></div>
      </div>

      {/* Comments & Notes */}
      <p className="text-[10px] font-medium text-slate-900 font-medium uppercase tracking-widest mb-2">Comments & Notes</p>
      <div className="grid grid-cols-1 gap-3">
        <div><Lbl>Specific Comments to Accounts Department</Lbl><textarea className={F} rows={2} value={form.remarks} onChange={e => set('remarks', e.target.value)} /></div>
        <div><Lbl>Note (printed on certification)</Lbl><input className={F} value={form.note} onChange={e => set('note', e.target.value)} placeholder="e.g. Payment 50% advance, balance after receiving the material" /></div>
        <div className="grid grid-cols-3 gap-3">
          <div><Lbl>Prepared By</Lbl><input className={F} value={form.prepared_by_name} onChange={e => set('prepared_by_name', e.target.value)} /></div>
          <div><Lbl>Director</Lbl><input className={F} value={form.director_name} onChange={e => set('director_name', e.target.value)} /></div>
          <div><Lbl>Managing Director</Lbl><input className={F} value={form.md_name} onChange={e => set('md_name', e.target.value)} /></div>
        </div>
      </div>
      <div className="flex justify-end gap-3 mt-4 pt-4 border-t border-slate-100">
        <button onClick={onCancel} className="px-4 py-2 rounded-lg text-sm font-medium text-slate-900 border border-slate-200 hover:bg-slate-50">Cancel</button>
        <button onClick={() => mutation.mutate()} disabled={mutation.isPending}
          className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium text-white bg-blue-600 hover:bg-blue-500 disabled:opacity-50 transition-all">
          <Save size={14} />{mutation.isPending ? 'Saving...' : 'Save Changes'}
        </button>
      </div>
    </div>
  );
}

// ── Detail Page ───────────────────────────────────────────────────────────────
export default function ProcurementAdvanceVoucherDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user } = useAuthStore();
  const canProcureApprove = ['super_admin', 'admin', 'procurement_manager', 'project_manager'].includes(user?.role);
  const canMDApprove      = ['super_admin', 'admin', 'managing_director', 'md', 'ceo', 'director'].includes(user?.role);
  const [showEdit,    setShowEdit]    = useState(false);
  const [showIssue,   setShowIssue]   = useState(false);
  const [showRecover, setShowRecover] = useState(false);

  const approvalMut = useMutation({
    mutationFn: ({ action, reason }) =>
      action === 'procurement' ? procurementAdvanceAPI.approveProcurement(id)
      : action === 'md'        ? procurementAdvanceAPI.approveMD(id)
      :                          procurementAdvanceAPI.reject(id, { reason }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['procurement-advance', id] });
      qc.invalidateQueries({ queryKey: ['procurement-advances'] });
      toast.success(res?.data?.message || 'Updated');
    },
    onError: (err) => toast.error(err?.response?.data?.message || 'Action failed'),
  });
  const doReject = () => {
    const reason = window.prompt('Reason for rejecting this advance voucher:');
    if (reason && reason.trim()) approvalMut.mutate({ action: 'reject', reason: reason.trim() });
  };

  const { data: projects = [] } = useQuery({
    queryKey: ['projects-list'],
    queryFn: () => projectAPI.list().then(r => r.data?.data ?? r.data ?? []),
    staleTime: 60000,
  });

  const { data: voucher, isLoading, isError } = useQuery({
    queryKey: ['procurement-advance', id],
    queryFn: () => procurementAdvanceAPI.get(id).then(r => r.data?.data),
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading) return (
    <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center">
      <p className="text-sm text-gray-400">Loading voucher...</p>
    </div>
  );

  if (isError || !voucher) return (
    <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center">
      <div className="text-center">
        <AlertTriangle size={40} className="mx-auto text-red-400 mb-3" />
        <p className="text-sm font-medium text-gray-600">Voucher not found</p>
        <button onClick={() => navigate('/procurement/advance-tracker')} className="mt-3 text-sm text-blue-600 hover:underline">Back to list</button>
      </div>
    </div>
  );

  const outstanding  = parseFloat(voucher.advance_value || 0) - parseFloat(voucher.recovered_amount || 0);
  const recoveryPct  = voucher.advance_value > 0
    ? Math.min(Math.round((parseFloat(voucher.recovered_amount || 0) / parseFloat(voucher.advance_value)) * 100), 100)
    : 0;
  const statusCfg    = STATUS_CFG[voucher.status] || STATUS_CFG.pending;

  return (
    <div className="min-h-screen bg-[#F8FAFC]">

      {/* ── Header ── */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        {/* Breadcrumb */}
        <button onClick={() => navigate('/procurement/advance-tracker')}
          className="flex items-center gap-1.5 text-xs text-slate-900 font-medium hover:text-blue-600 mb-3 transition-colors">
          <ArrowLeft size={13} /> Back to Advance Tracker
        </button>

        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <p className="text-[10px] font-medium text-slate-900 font-medium uppercase tracking-widest mb-1">Procurement · Advance Voucher</p>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-medium text-slate-900">
                {voucher.voucher_number || voucher.sl_number}
              </h1>
              <ApprovalBadge status={voucher.approval_status} />
              <StatusBadge status={voucher.status} />
            </div>
            <p className="text-sm text-slate-900 font-medium mt-1 font-medium">{voucher.vendor_name}</p>
            {voucher.project_name && (
              <p className="text-xs text-slate-900 font-medium mt-0.5">{voucher.project_name}</p>
            )}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* ── Approval workflow: Procurement → Managing Director ── */}
            {canProcureApprove && ['pending', 'rejected'].includes(voucher.approval_status || 'pending') && (
              <button onClick={() => approvalMut.mutate({ action: 'procurement' })} disabled={approvalMut.isPending}
                className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-500 disabled:opacity-50 transition-all">
                <CheckCircle2 size={15} /> Approve (Procurement)
              </button>
            )}
            {canMDApprove && voucher.approval_status === 'procurement_approved' && (
              <button onClick={() => approvalMut.mutate({ action: 'md' })} disabled={approvalMut.isPending}
                className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-500 disabled:opacity-50 transition-all">
                <CheckCircle2 size={15} /> Approve (MD)
              </button>
            )}
            {(canProcureApprove || canMDApprove) && !['approved', 'rejected'].includes(voucher.approval_status || 'pending') && (
              <button onClick={doReject} disabled={approvalMut.isPending}
                className="flex items-center gap-1.5 px-4 py-2 border border-red-200 text-red-600 text-sm font-medium rounded-lg hover:bg-red-50 disabled:opacity-50 transition-all">
                <X size={15} /> Reject
              </button>
            )}
            {voucher.status === 'pending' && voucher.approval_status === 'approved' && (
              <button onClick={() => setShowIssue(true)}
                className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-500 transition-all">
                <CheckCircle2 size={15} /> Mark as Issued
              </button>
            )}
            {voucher.status === 'pending' && voucher.approval_status !== 'approved' && (
              <span className="flex items-center gap-1.5 px-4 py-2 bg-slate-100 text-slate-400 text-sm font-medium rounded-lg cursor-not-allowed" title="Requires Procurement + MD approval">
                <Clock size={15} /> Awaiting Approval
              </span>
            )}
            {(voucher.status === 'issued' || voucher.status === 'partial') && (
              <button onClick={() => setShowRecover(true)}
                className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-500 transition-all">
                <RotateCcw size={15} /> Record Recovery
              </button>
            )}
            <button onClick={() => setShowEdit(e => !e)}
              className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg border transition-all ${
                showEdit ? 'bg-slate-100 border-slate-300 text-slate-700' : 'border-gray-300 text-slate-900 hover:bg-gray-50'
              }`}>
              <Edit2 size={15} /> {showEdit ? 'Cancel' : 'Edit'}
            </button>
            <button
              onClick={() => navigate(`/procurement/advances/${id}/print`)}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg border border-gray-300 text-slate-900 hover:bg-gray-50 transition-all"
            >
              <Printer size={15} /> Print
            </button>
          </div>
        </div>
      </div>

      <div className="px-6 py-5 space-y-4 max-w-5xl">

        {/* ── KPI Stats ── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard label="Order Value"        value={`₹${inr(voucher.order_value)}`}     borderColor="#0891B2" color="#0F172A" />
          <StatCard label="Advance Sanctioned" value={`₹${inr(voucher.advance_value)}`}
            sub={voucher.advance_pct > 0 ? `${voucher.advance_pct}% of order` : undefined}
            borderColor="#D97706" color="#D97706" />
          <StatCard label="Recovered"          value={`₹${inr(voucher.recovered_amount)}`}
            sub={`${recoveryPct}% recovered`}    borderColor="#059669" color="#059669" />
          <StatCard label="Outstanding Balance" value={`₹${inr(outstanding)}`}
            borderColor={outstanding > 0 ? '#DC2626' : '#059669'} color={outstanding > 0 ? '#DC2626' : '#059669'} />
        </div>

        {/* Recovery progress bar */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm px-5 py-4">
          <div className="flex items-center justify-between text-xs text-slate-900 font-medium mb-2">
            <span className="font-semibold">Recovery Progress</span>
            <span>{recoveryPct}% of ₹{inr(voucher.advance_value)} recovered</span>
          </div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div style={{ width: `${recoveryPct}%`, transition: 'width 0.6s ease' }}
              className={`h-full rounded-full ${recoveryPct >= 100 ? 'bg-emerald-500' : 'bg-blue-500'}`} />
          </div>
        </div>

        {/* ── Voucher Details ── */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <p className="text-xs font-medium text-slate-900 font-medium uppercase tracking-widest mb-4">Voucher Details</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-8 gap-y-5">
            <InfoRow label="SL Number"              value={voucher.sl_number} mono />
            <InfoRow label="Package / Description"  value={voucher.work_desc} />
            <InfoRow label="WO Number"              value={voucher.wo_number} />
            <InfoRow label="PO Number"              value={voucher.po_number} />
            <InfoRow label="PO / WO Date"           value={fmt(voucher.po_date)} />
            <InfoRow label="Cert. Number"           value={voucher.voucher_number} />
            <InfoRow label="Cert. Date"             value={fmt(voucher.voucher_date)} />
            <InfoRow label="Proforma Invoice No."   value={voucher.proforma_invoice_number} />
            <InfoRow label="Proforma Invoice Date"  value={fmt(voucher.proforma_invoice_date)} />
            <InfoRow label="QS Handover Date"       value={fmt(voucher.qs_handover_date)} />
            <InfoRow label="Acct. Received"         value={fmt(voucher.accts_received_date)} />
            <InfoRow label="Paid Amount"            value={voucher.paid_amount > 0 ? `₹${inr(voucher.paid_amount)}` : null} />
            <InfoRow label="Pay Date"               value={fmt(voucher.pay_date)} />
          </div>
          {(voucher.remarks || voucher.note) && (
            <div className="mt-4 pt-4 border-t border-slate-100 space-y-3">
              {voucher.remarks && (
                <div>
                  <p className="text-[10px] font-medium text-slate-900 font-medium uppercase tracking-wider mb-1">Comments to Accounts</p>
                  <p className="text-sm text-slate-700">{voucher.remarks}</p>
                </div>
              )}
              {voucher.note && (
                <div>
                  <p className="text-[10px] font-medium text-slate-900 font-medium uppercase tracking-wider mb-1">Note</p>
                  <p className="text-sm text-slate-700">{voucher.note}</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Edit panel */}
        {showEdit && (
          <EditPanel voucher={voucher} projects={projects} onCancel={() => setShowEdit(false)} onSaved={() => setShowEdit(false)} />
        )}

        {/* ── Recovery History ── */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <p className="text-xs font-medium text-slate-900 font-medium uppercase tracking-widest">Recovery History</p>
            {(voucher.status === 'issued' || voucher.status === 'partial') && (
              <button onClick={() => setShowRecover(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white text-xs font-medium rounded-lg hover:bg-indigo-500 transition-all">
                <RotateCcw size={12} /> Record Recovery
              </button>
            )}
          </div>

          {!voucher.recoveries?.length ? (
            <div className="py-10 text-center">
              <RotateCcw size={32} className="mx-auto text-gray-200 mb-2" />
              <p className="text-sm text-slate-900 font-medium font-medium">No recoveries recorded yet</p>
              {voucher.status === 'issued' && (
                <p className="text-xs text-slate-900 font-medium mt-1">Click "Record Recovery" to add one</p>
              )}
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  {['#', 'Recovery Date', 'Amount (₹)', 'Bill Reference', 'Notes'].map(h => (
                    <th key={h} className="px-4 py-2.5 text-xs font-medium text-slate-900 font-medium uppercase tracking-wide text-left">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {voucher.recoveries.map((r, i) => (
                  <tr key={r.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                    <td className="px-4 py-3 text-xs text-gray-400">{i + 1}</td>
                    <td className="px-4 py-3 text-slate-900 font-medium">{fmt(r.recovery_date)}</td>
                    <td className="px-4 py-3 font-medium text-emerald-700">₹{inr(r.amount)}</td>
                    <td className="px-4 py-3 text-gray-500">{r.bill_sl || '—'}</td>
                    <td className="px-4 py-3 text-gray-500">{r.notes || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {showIssue   && <IssueModal    voucher={voucher} onClose={() => setShowIssue(false)} />}
      {showRecover && <RecoveryModal voucher={voucher} onClose={() => setShowRecover(false)} />}
    </div>
  );
}
