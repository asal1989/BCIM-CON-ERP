// src/pages/sc/SCProfile.jsx — Full Subcontractor Profile
// Tabs: Overview | Work Orders | Bills | Payments | Labour | Documents
import React, { useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { scAPI, dmsAPI } from '../../api/client';
import { PageHeader, Theme } from '../../theme';
import dayjs from 'dayjs';
import {
  User, Briefcase, FileText, CreditCard, Users, FolderOpen,
  ArrowLeft, Upload, X, AlertTriangle, Clock, CheckCircle2,
  Building2, Phone, Mail, MapPin, Hash, Landmark, ChevronDown,
  IndianRupee, TrendingUp, Package, Trash2,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { clsx } from 'clsx';

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmt  = (n) => `₹${Number(n||0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
const fmtD = (d) => d ? dayjs(d).format('DD MMM YY') : '—';
const inp  = 'w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-300 bg-white';

const STATUS_PILL = {
  active:      'bg-green-100 text-green-700',
  inactive:    'bg-slate-100 text-slate-500',
  blacklisted: 'bg-red-100 text-red-700',
  draft:       'bg-slate-100 text-slate-500',
  approved:    'bg-green-100 text-green-700',
  submitted:   'bg-blue-100 text-blue-700',
  under_review:'bg-amber-100 text-amber-700',
  paid:        'bg-emerald-100 text-emerald-700',
  rejected:    'bg-red-100 text-red-600',
  completed:   'bg-teal-100 text-teal-700',
};

// ── Document category config (mirrors SCDocuments.jsx) ────────────────────────
const DOC_CATS = [
  { key: 'kyc',       label: 'Onboarding / KYC',     color: 'bg-cyan-100 text-cyan-700',    hint: 'PAN, GST, firm registration, cancelled cheque, MSME, labour license, PF/ESIC' },
  { key: 'contract',  label: 'Contract / Commercial', color: 'bg-indigo-100 text-indigo-700', hint: 'Work order, LOI, agreement, BOQ, bank guarantee, insurance' },
  { key: 'execution', label: 'Execution / Site',      color: 'bg-emerald-100 text-emerald-700', hint: 'MB entries, DPR, site instructions, variation orders, material reconciliation' },
  { key: 'billing',   label: 'Billing',               color: 'bg-amber-100 text-amber-700',  hint: 'RA bill, GST invoice, debit/credit note, TDS cert (Form 16A), retention statement' },
  { key: 'payment',   label: 'Payment',               color: 'bg-green-100 text-green-700',  hint: 'Payment voucher, UTR proof, GST 2A/2B reconciliation, advance recovery statement' },
  { key: 'closure',   label: 'Closure',               color: 'bg-rose-100 text-rose-700',    hint: 'Final bill, completion cert, no-due certificate, retention release, NOC' },
];

function expiryBadge(expiry_date) {
  if (!expiry_date) return null;
  const d = dayjs(expiry_date).diff(dayjs(), 'day');
  if (d < 0)   return { label: 'Expired',            cls: 'text-red-600 bg-red-50',    Icon: AlertTriangle };
  if (d <= 30) return { label: `Expires in ${d}d`,   cls: 'text-amber-600 bg-amber-50', Icon: Clock };
  return null;
}

// ── Upload Modal (SC-linked) ──────────────────────────────────────────────────
function UploadModal({ scId, defaultCat, onClose }) {
  const qc = useQueryClient();
  const fileRef = useRef();
  const [file, setFile] = useState(null);
  const [form, setForm] = useState({ doc_title: '', doc_type: defaultCat || 'kyc', expiry_date: '' });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const upload = useMutation({
    mutationFn: () => {
      if (!file) throw new Error('Select a file');
      const fd = new FormData();
      fd.append('file', file);
      fd.append('module', 'sc');
      fd.append('module_record_id', scId);
      fd.append('doc_type', form.doc_type);
      if (form.doc_title)   fd.append('doc_title', form.doc_title);
      if (form.expiry_date) fd.append('expiry_date', form.expiry_date);
      return dmsAPI.upload(fd);
    },
    onSuccess: (res) => {
      const warn = res?.data?.data?.[0]?._onedrive_warn;
      if (warn) {
        toast.error(`Saved locally. OneDrive error: ${warn}`, { duration: 8000 });
      } else {
        toast.success('Document uploaded to OneDrive');
      }
      qc.invalidateQueries({ queryKey: ['sc-profile-docs', scId] });
      onClose();
    },
    onError: e => toast.error(e?.response?.data?.error || 'Upload failed'),
  });

  const hint = DOC_CATS.find(c => c.key === form.doc_type)?.hint;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center px-5 py-4 border-b border-slate-100">
          <h2 className="font-bold text-slate-800 text-sm flex items-center gap-2">
            <Upload className="w-4 h-4 text-blue-600" /> Upload Document
          </h2>
          <button onClick={onClose}><X className="w-4 h-4 text-slate-400" /></button>
        </div>
        <div className="p-5 space-y-3">
          <div onClick={() => fileRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition
              ${file ? 'border-blue-300 bg-blue-50' : 'border-slate-200 hover:border-blue-300 hover:bg-slate-50'}`}>
            <input ref={fileRef} type="file" className="hidden"
              accept=".pdf,.xlsx,.xls,.docx,.doc,.jpg,.jpeg,.png"
              onChange={e => { const f = e.target.files?.[0]; if (f) { setFile(f); if (!form.doc_title) set('doc_title', f.name.replace(/\.[^.]+$/, '')); } }} />
            {file
              ? <p className="text-sm font-semibold text-blue-700">{file.name}</p>
              : <><Upload className="w-5 h-5 text-slate-300 mx-auto mb-1" /><p className="text-xs text-slate-400">Click to choose file</p></>}
          </div>
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Document Title</label>
            <input className={inp} value={form.doc_title} onChange={e => set('doc_title', e.target.value)} placeholder="e.g. PAN Card" />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Category</label>
            <select className={inp} value={form.doc_type} onChange={e => set('doc_type', e.target.value)}>
              {DOC_CATS.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
            </select>
            {hint && <p className="text-[10px] text-slate-400 mt-1 leading-relaxed">{hint}</p>}
          </div>
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Expiry Date (for certificates)</label>
            <input type="date" className={inp} value={form.expiry_date} onChange={e => set('expiry_date', e.target.value)} />
          </div>
        </div>
        <div className="flex justify-end gap-2 px-5 py-4 border-t border-slate-100">
          <button onClick={onClose} className="px-4 py-2 text-xs font-bold text-slate-500 rounded-lg hover:bg-slate-100">Cancel</button>
          <button onClick={() => upload.mutate()} disabled={!file || upload.isPending}
            className="px-4 py-2 text-xs font-bold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50">
            {upload.isPending ? 'Uploading…' : 'Upload'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Documents Tab ─────────────────────────────────────────────────────────────
function DocumentsTab({ scId }) {
  const [activeCat, setActiveCat] = useState('kyc');
  const [showUpload, setShowUpload] = useState(false);
  const token = localStorage.getItem('accessToken') || sessionStorage.getItem('accessToken');

  const { data: docs = [] } = useQuery({
    queryKey: ['sc-profile-docs', scId],
    queryFn: () => dmsAPI.list({ module: 'sc', module_record_id: scId }).then(r => r.data?.data || []),
    staleTime: 0,
  });

  const catDocs = docs.filter(d => d.doc_type === activeCat);
  const expiringCount = docs.filter(d => d.expiry_date && dayjs(d.expiry_date).diff(dayjs(), 'day') <= 30).length;

  const deleteMut = useMutation({
    mutationFn: (id) => dmsAPI.delete(id),
    onSuccess: (res) => {
      const warn = res?.data?.onedrive_warn;
      if (warn) toast.error(`File deleted locally. OneDrive: ${warn}`, { duration: 6000 });
      else toast.success('Document deleted from OneDrive');
      qc.invalidateQueries({ queryKey: ['sc-profile-docs', scId] });
    },
    onError: e => toast.error(e?.response?.data?.error || 'Delete failed'),
  });

  const handleDelete = (e, doc) => {
    e.stopPropagation();
    if (!window.confirm(`Delete "${doc.doc_title || doc.file_name}"? This will also remove it from OneDrive.`)) return;
    deleteMut.mutate(doc.id);
  };

  const handleOpen = (doc) => {
    const ext = (doc.file_name || '').split('.').pop().toLowerCase();
    const url = `/api/v1/dms/${doc.id}/file?token=${token}`;
    if (['pdf','png','jpg','jpeg'].includes(ext)) window.open(url, '_blank');
    else { const a = document.createElement('a'); a.href = url; a.download = doc.file_name; a.click(); }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500">{docs.length} document{docs.length !== 1 ? 's' : ''} total</span>
          {expiringCount > 0 && (
            <span className="flex items-center gap-1 text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
              <AlertTriangle className="w-3 h-3" /> {expiringCount} expiring
            </span>
          )}
        </div>
        <button onClick={() => setShowUpload(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-blue-600 rounded-lg hover:bg-blue-700 shadow-sm">
          <Upload className="w-3.5 h-3.5" /> Upload
        </button>
      </div>

      {/* Category tabs */}
      <div className="flex gap-1.5 overflow-x-auto mb-4 pb-1">
        {DOC_CATS.map(cat => {
          const count = docs.filter(d => d.doc_type === cat.key).length;
          return (
            <button key={cat.key} onClick={() => setActiveCat(cat.key)}
              className={clsx('flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap border transition',
                activeCat === cat.key ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50')}>
              {cat.label}
              <span className={clsx('text-[9px] px-1.5 py-0.5 rounded-full', activeCat === cat.key ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-400')}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Hint for active category */}
      {(() => { const c = DOC_CATS.find(d => d.key === activeCat); return c?.hint ? (
        <p className="text-[11px] text-slate-400 bg-slate-50 rounded-lg px-3 py-2 mb-3">{c.hint}</p>
      ) : null; })()}

      {/* Document cards */}
      {catDocs.length === 0 ? (
        <div className="py-10 text-center border-2 border-dashed border-slate-200 rounded-xl">
          <FolderOpen className="w-8 h-8 text-slate-200 mx-auto mb-2" />
          <p className="text-xs text-slate-400">No documents in this category</p>
          <button onClick={() => setShowUpload(true)} className="mt-2 text-xs font-bold text-blue-600 hover:underline">Upload now</button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {catDocs.map(doc => {
            const ext = (doc.file_name || '').split('.').pop().toLowerCase();
            const expiry = expiryBadge(doc.expiry_date);
            const extColor = { pdf:'text-red-500', xlsx:'text-emerald-500', xls:'text-emerald-500', docx:'text-blue-500', doc:'text-blue-500' }[ext] || 'text-slate-400';
            return (
              <div key={doc.id}
                className="bg-white rounded-xl border border-slate-100 p-3 hover:border-blue-200 hover:shadow-sm transition group relative">
                <div className="flex items-start gap-2.5" onClick={() => handleOpen(doc)} style={{ cursor: 'pointer' }}>
                  <div className={`w-8 h-8 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-center flex-shrink-0 ${extColor}`}>
                    <FileText className="w-4 h-4" />
                  </div>
                  <div className="min-w-0 flex-1 pr-6">
                    <p className="text-xs font-semibold text-slate-800 truncate group-hover:text-blue-700">{doc.doc_title || doc.file_name}</p>
                    <p className="text-[10px] text-slate-400 truncate">{doc.file_name}</p>
                    <div className="flex items-center gap-1.5 mt-1.5">
                      <span className="text-[9px] font-bold uppercase text-slate-400 bg-slate-50 px-1.5 py-0.5 rounded">{ext}</span>
                      {doc.status === 'approved' && <span className="flex items-center gap-0.5 text-[10px] text-emerald-600 font-semibold"><CheckCircle2 className="w-3 h-3" /> Approved</span>}
                    </div>
                    {expiry && (
                      <div className={`flex items-center gap-1 mt-1.5 text-[10px] font-semibold px-2 py-0.5 rounded-full w-fit ${expiry.cls}`}>
                        <expiry.Icon className="w-3 h-3" /> {expiry.label}
                      </div>
                    )}
                    {doc.expiry_date && !expiry && (
                      <p className="text-[10px] text-slate-400 mt-1">Expires {fmtD(doc.expiry_date)}</p>
                    )}
                  </div>
                </div>
                <button
                  onClick={(e) => handleDelete(e, doc)}
                  disabled={deleteMut.isPending}
                  title="Delete document"
                  className="absolute top-2.5 right-2.5 p-1 rounded-md opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-500 hover:bg-red-50 transition">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {showUpload && <UploadModal scId={scId} defaultCat={activeCat} onClose={() => setShowUpload(false)} />}
    </div>
  );
}

// ── Overview Tab ──────────────────────────────────────────────────────────────
function OverviewTab({ sc }) {
  const Row = ({ icon: Icon, label, value }) => value ? (
    <div className="flex items-start gap-2.5 py-2.5 border-b border-slate-50 last:border-0">
      <Icon className="w-3.5 h-3.5 text-slate-400 mt-0.5 flex-shrink-0" />
      <span className="text-[11px] text-slate-400 w-28 flex-shrink-0">{label}</span>
      <span className="text-xs text-slate-700 font-medium">{value}</span>
    </div>
  ) : null;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Company Details</p>
        <Row icon={Hash}      label="SC Code"       value={sc.sc_code} />
        <Row icon={Building2} label="Trade Type"    value={sc.trade_type} />
        <Row icon={User}      label="Contact Person" value={sc.contact_person} />
        <Row icon={Phone}     label="Mobile"        value={sc.mobile} />
        <Row icon={Mail}      label="Email"         value={sc.email} />
        <Row icon={MapPin}    label="Address"       value={[sc.address, sc.city, sc.state, sc.pincode].filter(Boolean).join(', ')} />
      </div>
      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Registration & Bank</p>
        <Row icon={Hash}     label="GST Number"    value={sc.gst_number} />
        <Row icon={Hash}     label="PAN Number"    value={sc.pan_number} />
        <Row icon={Landmark} label="Bank"          value={sc.bank_name} />
        <Row icon={Hash}     label="Account No"    value={sc.account_number} />
        <Row icon={Hash}     label="IFSC"          value={sc.ifsc_code} />
        <Row icon={Landmark} label="Branch"        value={sc.bank_branch} />
      </div>
      {sc.notes && (
        <div className="md:col-span-2 bg-amber-50 border border-amber-100 rounded-xl p-4">
          <p className="text-[10px] font-bold text-amber-600 uppercase mb-1">Notes</p>
          <p className="text-xs text-amber-800">{sc.notes}</p>
        </div>
      )}
    </div>
  );
}

// ── Work Orders Tab ───────────────────────────────────────────────────────────
function WorkOrdersTab({ scId }) {
  const { data: wos = [], isLoading } = useQuery({
    queryKey: ['sc-profile-wos', scId],
    queryFn: () => scAPI.listWO({ sc_id: scId }).then(r => r.data?.data || []),
  });

  if (isLoading) return <div className="h-32 bg-slate-100 rounded-xl animate-pulse" />;
  if (!wos.length) return <p className="py-8 text-center text-sm text-slate-400">No work orders</p>;

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-slate-50 border-b border-slate-100">
            {['WO No', 'Project', 'Subject', 'Contract Amount', 'Billed', 'Balance', 'Status', 'Date'].map(h => (
              <th key={h} className="px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-slate-400">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50">
          {wos.map(wo => (
            <tr key={wo.id} className="hover:bg-slate-50">
              <td className="px-3 py-2.5 font-mono font-bold text-blue-700">{wo.wo_number}</td>
              <td className="px-3 py-2.5 text-slate-600">{wo.project_name || '—'}</td>
              <td className="px-3 py-2.5 text-slate-700 max-w-[200px] truncate">{wo.subject}</td>
              <td className="px-3 py-2.5 font-semibold">{fmt(wo.contract_amount)}</td>
              <td className="px-3 py-2.5 text-amber-700">{fmt(wo.total_billed)}</td>
              <td className="px-3 py-2.5 text-emerald-700">{fmt(wo.contract_amount - (wo.total_billed || 0))}</td>
              <td className="px-3 py-2.5">
                <span className={clsx('px-2 py-0.5 rounded-full text-[9px] font-bold uppercase', STATUS_PILL[wo.status] || 'bg-slate-100 text-slate-500')}>{wo.status}</span>
              </td>
              <td className="px-3 py-2.5 text-slate-400">{fmtD(wo.created_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Bills Tab ─────────────────────────────────────────────────────────────────
function BillsTab({ scId }) {
  const { data: bills = [], isLoading } = useQuery({
    queryKey: ['sc-profile-bills', scId],
    queryFn: () => scAPI.listBills({ sc_id: scId }).then(r => r.data?.data || []),
  });

  if (isLoading) return <div className="h-32 bg-slate-100 rounded-xl animate-pulse" />;
  if (!bills.length) return <p className="py-8 text-center text-sm text-slate-400">No bills</p>;

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-slate-50 border-b border-slate-100">
            {['Bill No', 'WO No', 'Type', 'Gross', 'GST', 'TDS', 'Net Payable', 'Status', 'Date'].map(h => (
              <th key={h} className="px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-slate-400">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50">
          {bills.map(b => (
            <tr key={b.id} className="hover:bg-slate-50">
              <td className="px-3 py-2.5 font-mono font-bold text-blue-700">{b.bill_number}</td>
              <td className="px-3 py-2.5 text-slate-500">{b.wo_number || '—'}</td>
              <td className="px-3 py-2.5 capitalize text-slate-600">{b.bill_type?.replace(/_/g,' ')}</td>
              <td className="px-3 py-2.5">{fmt(b.gross_amount)}</td>
              <td className="px-3 py-2.5 text-slate-500">{fmt(b.gst_amount)}</td>
              <td className="px-3 py-2.5 text-red-600">−{fmt(b.tds_amount)}</td>
              <td className="px-3 py-2.5 font-bold">{fmt(b.net_payable)}</td>
              <td className="px-3 py-2.5">
                <span className={clsx('px-2 py-0.5 rounded-full text-[9px] font-bold uppercase', STATUS_PILL[b.status] || 'bg-slate-100 text-slate-500')}>{b.status}</span>
              </td>
              <td className="px-3 py-2.5 text-slate-400">{fmtD(b.bill_date)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Payments Tab ──────────────────────────────────────────────────────────────
function PaymentsTab({ scId }) {
  const { data: payments = [], isLoading } = useQuery({
    queryKey: ['sc-profile-payments', scId],
    queryFn: () => scAPI.listPayments({ sc_id: scId }).then(r => r.data?.data || []),
  });

  if (isLoading) return <div className="h-32 bg-slate-100 rounded-xl animate-pulse" />;
  if (!payments.length) return <p className="py-8 text-center text-sm text-slate-400">No payments recorded</p>;

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-slate-50 border-b border-slate-100">
            {['Date', 'Amount', 'Mode', 'Reference', 'Remarks'].map(h => (
              <th key={h} className="px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-slate-400">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50">
          {payments.map(p => (
            <tr key={p.id} className="hover:bg-slate-50">
              <td className="px-3 py-2.5 font-semibold">{fmtD(p.payment_date)}</td>
              <td className="px-3 py-2.5 font-bold text-emerald-700">{fmt(p.amount)}</td>
              <td className="px-3 py-2.5 capitalize text-slate-600">{p.payment_mode?.replace(/_/g,' ')}</td>
              <td className="px-3 py-2.5 font-mono text-slate-500">{p.reference_no || '—'}</td>
              <td className="px-3 py-2.5 text-slate-500">{p.remarks || '—'}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="bg-emerald-50 border-t-2 border-slate-200 font-bold">
            <td className="px-3 py-2.5 text-[10px] uppercase text-slate-500">Total Paid</td>
            <td className="px-3 py-2.5 text-emerald-700">{fmt(payments.reduce((s,p) => s + Number(p.amount||0), 0))}</td>
            <td colSpan={3} />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

// ── Labour Tab ────────────────────────────────────────────────────────────────
function LabourTab({ scId }) {
  const { data: workers = [], isLoading } = useQuery({
    queryKey: ['sc-profile-workers', scId],
    queryFn: () => scAPI.listWorkers({ sc_id: scId }).then(r => r.data?.data || []),
  });

  if (isLoading) return <div className="h-32 bg-slate-100 rounded-xl animate-pulse" />;
  if (!workers.length) return <p className="py-8 text-center text-sm text-slate-400">No workers registered</p>;

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-slate-50 border-b border-slate-100">
            {['Code', 'Name', 'Skill', 'Daily Rate', 'Mobile', 'Aadhar', 'Status'].map(h => (
              <th key={h} className="px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-slate-400">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50">
          {workers.map(w => (
            <tr key={w.id} className="hover:bg-slate-50">
              <td className="px-3 py-2.5 font-mono text-slate-500">{w.worker_code}</td>
              <td className="px-3 py-2.5 font-semibold text-slate-800">{w.worker_name}</td>
              <td className="px-3 py-2.5 capitalize text-slate-600">{w.skill_type || '—'}</td>
              <td className="px-3 py-2.5">{w.daily_rate ? `₹${w.daily_rate}` : '—'}</td>
              <td className="px-3 py-2.5 text-slate-500">{w.mobile || '—'}</td>
              <td className="px-3 py-2.5 font-mono text-slate-400">{w.aadhar_number ? `****${w.aadhar_number.slice(-4)}` : '—'}</td>
              <td className="px-3 py-2.5">
                <span className={clsx('px-2 py-0.5 rounded-full text-[9px] font-bold uppercase', w.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500')}>{w.status}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
const TABS = [
  { key: 'overview',    label: 'Overview',     icon: User },
  { key: 'work_orders', label: 'Work Orders',  icon: Briefcase },
  { key: 'bills',       label: 'Bills',        icon: FileText },
  { key: 'payments',    label: 'Payments',     icon: CreditCard },
  { key: 'labour',      label: 'Labour',       icon: Users },
  { key: 'documents',   label: 'Documents',    icon: FolderOpen },
];

export default function SCProfile() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [tab, setTab] = useState('overview');

  const { data: sc, isLoading, error } = useQuery({
    queryKey: ['sc-profile', id],
    queryFn: () => scAPI.getSC(id).then(r => r.data?.data || r.data),
    enabled: !!id,
  });

  if (isLoading) return (
    <div style={{ background: Theme.pageBg, minHeight: '100vh' }}>
      <div className="p-6 space-y-4">
        {[1,2,3].map(n => <div key={n} className="h-16 bg-white rounded-xl animate-pulse" />)}
      </div>
    </div>
  );

  if (error || !sc) return (
    <div className="p-8 text-center">
      <p className="text-slate-500">Subcontractor not found.</p>
      <button onClick={() => navigate('/sc/master')} className="mt-3 text-sm text-blue-600 hover:underline">Back to list</button>
    </div>
  );

  // Financial summary from SC detail
  const totalBilled   = Number(sc.total_billed   || 0);
  const totalPaid     = Number(sc.total_paid     || 0);
  const retentionHeld = Number(sc.retention_held || 0);
  const outstanding   = totalBilled - totalPaid;

  return (
    <div style={{ background: Theme.pageBg, minHeight: '100vh' }}>
      <PageHeader
        title={sc.name}
        subtitle={`${sc.sc_code} · ${sc.trade_type || 'Subcontractor'}`}
        breadcrumbs={[{ label: 'Subcontractors', href: '/sc/master' }, { label: sc.name }]}
        actions={
          <button onClick={() => navigate('/sc/master')}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50">
            <ArrowLeft className="w-3.5 h-3.5" /> Back
          </button>
        }
      />

      <div className="p-5 md:p-6 max-w-[1400px] mx-auto space-y-5">
        {/* Status + Financial KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
              <TrendingUp className="w-4 h-4 text-blue-600" />
            </div>
            <div>
              <p className="text-[10px] text-slate-400 uppercase font-bold">Total Billed</p>
              <p className="text-sm font-bold text-slate-800">{fmt(totalBilled)}</p>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-emerald-50 flex items-center justify-center flex-shrink-0">
              <IndianRupee className="w-4 h-4 text-emerald-600" />
            </div>
            <div>
              <p className="text-[10px] text-slate-400 uppercase font-bold">Total Paid</p>
              <p className="text-sm font-bold text-emerald-700">{fmt(totalPaid)}</p>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-amber-50 flex items-center justify-center flex-shrink-0">
              <Package className="w-4 h-4 text-amber-600" />
            </div>
            <div>
              <p className="text-[10px] text-slate-400 uppercase font-bold">Outstanding</p>
              <p className="text-sm font-bold text-amber-700">{fmt(outstanding)}</p>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-violet-50 flex items-center justify-center flex-shrink-0">
              <CreditCard className="w-4 h-4 text-violet-600" />
            </div>
            <div>
              <p className="text-[10px] text-slate-400 uppercase font-bold">Retention Held</p>
              <p className="text-sm font-bold text-violet-700">{fmt(retentionHeld)}</p>
            </div>
          </div>
        </div>

        {/* Tab bar */}
        <div className="flex gap-1 overflow-x-auto bg-white rounded-xl border border-slate-200 p-1 shadow-sm">
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={clsx('flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-lg whitespace-nowrap transition',
                tab === t.key ? 'bg-blue-600 text-white shadow' : 'text-slate-500 hover:bg-slate-100')}>
              <t.icon className="w-3.5 h-3.5" /> {t.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div>
          {tab === 'overview'    && <OverviewTab sc={sc} />}
          {tab === 'work_orders' && <WorkOrdersTab scId={id} />}
          {tab === 'bills'       && <BillsTab scId={id} />}
          {tab === 'payments'    && <PaymentsTab scId={id} />}
          {tab === 'labour'      && <LabourTab scId={id} />}
          {tab === 'documents'   && <DocumentsTab scId={id} />}
        </div>
      </div>
    </div>
  );
}
