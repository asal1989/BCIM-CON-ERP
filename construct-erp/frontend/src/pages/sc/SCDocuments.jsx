// src/pages/sc/SCDocuments.jsx — Subcontractor Documents
// Fixes: correct module filter, upload, SC/WO filter, expiry tracking
import React, { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { scAPI, dmsAPI } from '../../api/client';
import {
  FolderOpen, FileText, RefreshCw, Search, Upload, X,
  AlertTriangle, Clock, CheckCircle2, Filter, ChevronDown,
} from 'lucide-react';
import toast from 'react-hot-toast';
import dayjs from 'dayjs';

// ── Constants ─────────────────────────────────────────────────────────────────
const DOC_TYPES = [
  { key: '',          label: 'All' },
  { key: 'kyc',       label: 'Onboarding / KYC',     hint: 'PAN, GST, firm registration, cancelled cheque, MSME, labour license, PF/ESIC' },
  { key: 'contract',  label: 'Contract / Commercial', hint: 'Work order, LOI, subcontract agreement, BOQ, security deposit, bank guarantee, insurance' },
  { key: 'execution', label: 'Execution / Site',      hint: 'MB entries, DPR, site instruction, material issued register, variation order, material reconciliation' },
  { key: 'billing',   label: 'Billing',               hint: 'RA bill, GST invoice, debit/credit note, TDS certificate (Form 16A), retention statement' },
  { key: 'payment',   label: 'Payment',               hint: 'Payment voucher, bank transfer/UTR proof, GST 2A/2B reconciliation, advance recovery statement' },
  { key: 'closure',   label: 'Closure',               hint: 'Final bill, completion certificate, no-due certificate, retention release, NOC' },
];

const TYPE_COLOR = {
  kyc:       'bg-cyan-100 text-cyan-700',
  contract:  'bg-indigo-100 text-indigo-700',
  execution: 'bg-emerald-100 text-emerald-700',
  billing:   'bg-amber-100 text-amber-700',
  payment:   'bg-green-100 text-green-700',
  closure:   'bg-rose-100 text-rose-700',
  general:   'bg-slate-100 text-slate-600',
};

const EXT_COLOR = {
  pdf: 'text-red-500', xlsx: 'text-emerald-500', xls: 'text-emerald-500',
  docx: 'text-blue-500', doc: 'text-blue-500',
};

const inp = 'w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-300 bg-white';

// ── Expiry helpers ────────────────────────────────────────────────────────────
function expiryStatus(expiry_date) {
  if (!expiry_date) return null;
  const daysLeft = dayjs(expiry_date).diff(dayjs(), 'day');
  if (daysLeft < 0)  return { label: 'Expired',           color: 'text-red-600 bg-red-50',    icon: 'red' };
  if (daysLeft <= 30) return { label: `Expires in ${daysLeft}d`, color: 'text-amber-600 bg-amber-50', icon: 'amber' };
  return { label: `Expires ${dayjs(expiry_date).format('DD MMM YY')}`, color: 'text-slate-400 bg-slate-50', icon: null };
}

// ── Upload Modal ──────────────────────────────────────────────────────────────
function UploadModal({ subs, onClose }) {
  const qc = useQueryClient();
  const fileRef = useRef();
  const [file, setFile]     = useState(null);
  const [form, setForm]     = useState({ doc_title: '', doc_type: 'general', sc_id: '', expiry_date: '' });
  const set = (k, v)        => setForm(f => ({ ...f, [k]: v }));

  const upload = useMutation({
    mutationFn: () => {
      if (!file) throw new Error('Select a file');
      const fd = new FormData();
      fd.append('file', file);
      fd.append('module', 'sc');
      fd.append('doc_type', form.doc_type);
      if (form.doc_title)   fd.append('doc_title', form.doc_title);
      if (form.sc_id)       fd.append('module_record_id', form.sc_id);
      if (form.expiry_date) fd.append('expiry_date', form.expiry_date);
      return dmsAPI.upload(fd);
    },
    onSuccess: () => {
      toast.success('Document uploaded');
      qc.invalidateQueries({ queryKey: ['sc-dms-docs'] });
      onClose();
    },
    onError: e => toast.error(e?.response?.data?.error || 'Upload failed'),
  });

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center px-5 py-4 border-b border-slate-100">
          <h2 className="font-bold text-slate-800 text-sm flex items-center gap-2">
            <Upload className="w-4 h-4 text-indigo-600" /> Upload Document
          </h2>
          <button onClick={onClose}><X className="w-4 h-4 text-slate-400" /></button>
        </div>

        <div className="p-5 space-y-3">
          {/* File picker */}
          <div
            onClick={() => fileRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition
              ${file ? 'border-indigo-300 bg-indigo-50' : 'border-slate-200 hover:border-indigo-300 hover:bg-slate-50'}`}
          >
            <input ref={fileRef} type="file" className="hidden"
              accept=".pdf,.xlsx,.xls,.docx,.doc,.jpg,.jpeg,.png,.dwg"
              onChange={e => { const f = e.target.files?.[0]; if (f) { setFile(f); if (!form.doc_title) set('doc_title', f.name.replace(/\.[^.]+$/, '')); } }} />
            {file
              ? <p className="text-sm font-semibold text-indigo-700">{file.name}</p>
              : <><Upload className="w-6 h-6 text-slate-300 mx-auto mb-1" /><p className="text-xs text-slate-400">Click to choose file</p></>
            }
          </div>

          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Document Title</label>
            <input className={inp} value={form.doc_title} onChange={e => set('doc_title', e.target.value)} placeholder="e.g. NABL Certificate 2024-26" />
          </div>

          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Document Type</label>
            <select className={inp} value={form.doc_type} onChange={e => set('doc_type', e.target.value)}>
              {DOC_TYPES.filter(t => t.key).map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
            </select>
            {form.doc_type && (() => { const t = DOC_TYPES.find(d => d.key === form.doc_type); return t?.hint ? (
              <p className="text-[10px] text-slate-400 mt-1 leading-relaxed">{t.hint}</p>
            ) : null; })()}
          </div>

          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Subcontractor (optional)</label>
            <select className={inp} value={form.sc_id} onChange={e => set('sc_id', e.target.value)}>
              <option value="">— All / Not linked —</option>
              {subs.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Expiry Date (for certificates)</label>
            <input type="date" className={inp} value={form.expiry_date} onChange={e => set('expiry_date', e.target.value)} />
          </div>
        </div>

        <div className="flex justify-end gap-2 px-5 py-4 border-t border-slate-100">
          <button onClick={onClose} className="px-4 py-2 text-xs font-bold text-slate-500 rounded-lg hover:bg-slate-100">Cancel</button>
          <button
            onClick={() => upload.mutate()}
            disabled={!file || upload.isPending}
            className="px-4 py-2 text-xs font-bold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50"
          >
            {upload.isPending ? 'Uploading…' : 'Upload'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function SCDocuments() {
  const qc = useQueryClient();
  const [search, setSearch]       = useState('');
  const [docType, setDocType]     = useState('');
  const [filterSC, setFilterSC]   = useState('');
  const [showExpiring, setShowExpiring] = useState(false);
  const [showUpload, setShowUpload]     = useState(false);

  // Only fetch SC-specific documents (module:'sc')
  const { data: allDocs = [], isLoading, refetch } = useQuery({
    queryKey: ['sc-dms-docs'],
    queryFn: () => dmsAPI.list({ module: 'sc' }).then(r => r.data?.data || []),
    staleTime: 0,
  });

  const { data: subs = [] } = useQuery({
    queryKey: ['sc-list-all'],
    queryFn: () => scAPI.listSC().then(r => r.data?.data || []),
    staleTime: 60_000,
  });

  // Filter
  const filtered = React.useMemo(() => {
    let docs = allDocs;
    if (docType)   docs = docs.filter(d => d.doc_type === docType);
    if (filterSC)  docs = docs.filter(d => d.module_record_id === filterSC);
    if (showExpiring) {
      docs = docs.filter(d => {
        if (!d.expiry_date) return false;
        return dayjs(d.expiry_date).diff(dayjs(), 'day') <= 30;
      });
    }
    if (search) {
      const q = search.toLowerCase();
      docs = docs.filter(d => [d.doc_title, d.file_name, d.doc_type].some(v => v?.toLowerCase().includes(q)));
    }
    return docs;
  }, [allDocs, docType, filterSC, showExpiring, search]);

  // Counts
  const expiringCount = allDocs.filter(d => d.expiry_date && dayjs(d.expiry_date).diff(dayjs(), 'day') <= 30).length;

  const token = localStorage.getItem('accessToken') || sessionStorage.getItem('accessToken');
  const handleOpen = (doc) => {
    const ext = (doc.file_name || '').split('.').pop().toLowerCase();
    const url = `/api/v1/dms/${doc.id}/file?token=${token}`;
    if (['pdf', 'png', 'jpg', 'jpeg'].includes(ext)) {
      window.open(url, '_blank');
    } else {
      const a = document.createElement('a'); a.href = url; a.download = doc.file_name; a.click();
    }
  };

  return (
    <div className="p-5 md:p-6 min-h-screen bg-slate-50">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
        <div>
          <h1 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <FolderOpen className="w-5 h-5 text-indigo-600" /> Subcontractor Documents
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">Method statements, ITPs, certificates and correspondence</p>
        </div>
        <div className="flex items-center gap-2">
          {expiringCount > 0 && (
            <button
              onClick={() => setShowExpiring(v => !v)}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-lg border transition
                ${showExpiring ? 'bg-amber-100 border-amber-300 text-amber-700' : 'bg-white border-amber-200 text-amber-600 hover:bg-amber-50'}`}
            >
              <AlertTriangle className="w-3.5 h-3.5" /> {expiringCount} Expiring
            </button>
          )}
          <button onClick={refetch} className="p-2 border border-slate-200 bg-white rounded-lg hover:bg-slate-50">
            <RefreshCw className="w-4 h-4 text-slate-500" />
          </button>
          <button
            onClick={() => setShowUpload(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 shadow-sm"
          >
            <Upload className="w-3.5 h-3.5" /> Upload
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white border border-slate-200 rounded-xl p-3 mb-4 flex flex-wrap gap-3 items-center shadow-sm">
        {/* Search */}
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-2.5 w-3.5 h-3.5 text-slate-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search…"
            className="pl-8 pr-3 py-2 border border-slate-200 rounded-lg text-xs w-full focus:outline-none focus:ring-1 focus:ring-indigo-300" />
        </div>

        {/* Subcontractor filter */}
        <div className="relative">
          <Filter className="absolute left-2.5 top-2.5 w-3 h-3 text-slate-400 pointer-events-none" />
          <select value={filterSC} onChange={e => setFilterSC(e.target.value)}
            className="pl-7 pr-7 py-2 border border-slate-200 rounded-lg text-xs bg-white focus:outline-none focus:ring-1 focus:ring-indigo-300 appearance-none">
            <option value="">All Subcontractors</option>
            {subs.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <ChevronDown className="absolute right-2 top-2.5 w-3 h-3 text-slate-400 pointer-events-none" />
        </div>

        {/* Count badge */}
        <span className="text-[11px] text-slate-400 ml-auto">{filtered.length} document{filtered.length !== 1 ? 's' : ''}</span>
      </div>

      {/* Doc type tabs */}
      <div className="flex gap-1.5 overflow-x-auto mb-4 pb-1">
        {DOC_TYPES.map(t => (
          <button key={t.key} onClick={() => setDocType(t.key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition border
              ${docType === t.key
                ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}`}>
            {t.label}
            {t.key && (
              <span className={`ml-1.5 text-[9px] px-1.5 py-0.5 rounded-full ${docType === t.key ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-400'}`}>
                {allDocs.filter(d => d.doc_type === t.key).length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Document grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1,2,3,4,5,6].map(n => <div key={n} className="h-24 bg-white rounded-2xl border border-slate-100 animate-pulse" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-16 text-center">
          <FolderOpen className="w-12 h-12 text-slate-200 mx-auto mb-3" />
          <p className="text-slate-400 text-sm">No documents found</p>
          <button onClick={() => setShowUpload(true)} className="mt-3 text-xs font-bold text-indigo-600 hover:underline">
            Upload the first document
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(d => {
            const ext = (d.file_name || '').split('.').pop().toLowerCase();
            const expiry = expiryStatus(d.expiry_date);
            const sc = subs.find(s => s.id === d.module_record_id);
            return (
              <div key={d.id} onClick={() => handleOpen(d)}
                className="bg-white rounded-2xl border border-slate-100 p-4 hover:border-indigo-200 hover:shadow-sm transition-all cursor-pointer group">
                <div className="flex items-start gap-3">
                  <div className={`w-10 h-10 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-center flex-shrink-0 ${EXT_COLOR[ext] || 'text-slate-400'}`}>
                    <FileText className="w-5 h-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-slate-800 text-sm truncate group-hover:text-indigo-700">
                      {d.doc_title || d.file_name}
                    </p>
                    <p className="text-[11px] text-slate-400 truncate">{d.file_name}</p>
                    {sc && <p className="text-[11px] text-indigo-500 font-medium truncate mt-0.5">{sc.name}</p>}

                    <div className="flex flex-wrap items-center gap-1.5 mt-2">
                      {d.doc_type && (
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold capitalize ${TYPE_COLOR[d.doc_type] || 'bg-slate-100 text-slate-500'}`}>
                          {d.doc_type.replace(/_/g, ' ')}
                        </span>
                      )}
                      <span className="text-[10px] font-bold uppercase text-slate-400 bg-slate-50 px-1.5 py-0.5 rounded">{ext}</span>
                      {d.status === 'approved' && (
                        <span className="flex items-center gap-0.5 text-[10px] font-semibold text-emerald-600">
                          <CheckCircle2 className="w-3 h-3" /> Approved
                        </span>
                      )}
                    </div>

                    {/* Expiry badge */}
                    {expiry && (
                      <div className={`flex items-center gap-1 mt-2 text-[10px] font-semibold px-2 py-1 rounded-lg w-fit ${expiry.color}`}>
                        {expiry.icon === 'red'   && <AlertTriangle className="w-3 h-3" />}
                        {expiry.icon === 'amber' && <Clock className="w-3 h-3" />}
                        {expiry.label}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showUpload && <UploadModal subs={subs} onClose={() => setShowUpload(false)} />}
    </div>
  );
}
