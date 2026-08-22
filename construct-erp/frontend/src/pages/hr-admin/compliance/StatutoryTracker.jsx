// src/pages/hr-admin/compliance/StatutoryTracker.jsx
// Legal & Statutory Compliance Tracker — Project/HO-scoped ledger covering
// the 11 statutory categories (Shop & Establishment, PF, PT, WC Policy,
// CLRA, BOCW, LWF, Rental Agreements, Vehicle Insurance, Labour Licences,
// Other) with the full due/paid/penalty/delay trail, plus the weekly
// Monday-morning email report configuration.
import React, { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Send, Trash2, Mail, Paperclip, Upload, X, FileText, UploadCloud, Download, File as FileIcon, FileSpreadsheet, Image as ImageIcon, Printer, Pencil } from 'lucide-react';
import toast from 'react-hot-toast';
import { complianceTrackerAPI, projectAPI } from '../../../api/client';
import CompliancePrintTemplate from './CompliancePrintTemplate';

function fileMeta(name = '') {
  const ext = name.split('.').pop()?.toLowerCase() || '';
  if (['pdf'].includes(ext))                          return { Icon: FileText,       color: '#DC2626', bg: '#FEF2F2' };
  if (['xls', 'xlsx', 'csv'].includes(ext))            return { Icon: FileSpreadsheet, color: '#15803D', bg: '#F0FDF4' };
  if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) return { Icon: ImageIcon,   color: '#7C3AED', bg: '#F5F3FF' };
  return { Icon: FileIcon, color: '#475569', bg: '#F1F5F9' };
}

const STATUS_COLORS = {
  Pending: '#b45309', Overdue: '#dc2626', Paid: '#16a34a', Closed: '#64748b', 'Not Applicable': '#94a3b8',
};

function inr(v) { return Math.round(Number(v || 0)).toLocaleString('en-IN'); }
function fmtDate(d) { if (!d) return '—'; return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }); }

function SummaryCards({ summary }) {
  const cards = [
    { label: 'Open Items Overdue', value: summary?.overdue_count ?? '—', color: '#dc2626' },
    { label: 'Total Outstanding', value: `₹${inr(summary?.total_outstanding)}`, color: '#dc2626' },
    { label: 'Penalty / Damages', value: `₹${inr(summary?.total_penalty_damages)}`, color: '#b45309' },
    { label: 'Due in Next 30 Days', value: summary?.due_in_30_days ?? '—', color: '#1B3A6B' },
  ];
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
      {cards.map(c => (
        <div key={c.label} className="bg-white rounded-2xl border border-slate-200/70 p-4">
          <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">{c.label}</div>
          <div className="text-xl font-bold mt-1" style={{ color: c.color }}>{c.value}</div>
        </div>
      ))}
    </div>
  );
}

function ObligationForm({ projects, onClose, onSaved, categories }) {
  const [form, setForm] = useState({ project_id: '', category: categories[0] || '', title: '', frequency: 'Monthly', responsible_person: '', legal_reference: '' });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const mut = useMutation({
    mutationFn: () => complianceTrackerAPI.createObligation({ ...form, project_id: form.project_id || null }),
    onSuccess: () => { toast.success('Compliance item added'); onSaved(); onClose(); },
    onError: (e) => toast.error(e.response?.data?.error || 'Failed to add'),
  });
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/35" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
        <h3 className="text-base font-bold text-slate-900 mb-4">Add Compliance Item</h3>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-semibold text-slate-500">Project</label>
            <select className="w-full mt-1 h-9 rounded-lg border border-slate-200 px-2 text-sm" value={form.project_id} onChange={e => set('project_id', e.target.value)}>
              <option value="">Head Office</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500">Category</label>
            <select className="w-full mt-1 h-9 rounded-lg border border-slate-200 px-2 text-sm" value={form.category} onChange={e => set('category', e.target.value)}>
              {categories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500">Title</label>
            <input className="w-full mt-1 h-9 rounded-lg border border-slate-200 px-2 text-sm" value={form.title}
              onChange={e => set('title', e.target.value)} placeholder="e.g. PF Compliance — LANCO Hills" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-500">Frequency</label>
              <select className="w-full mt-1 h-9 rounded-lg border border-slate-200 px-2 text-sm" value={form.frequency} onChange={e => set('frequency', e.target.value)}>
                <option>Monthly</option><option>Annual</option><option>One-time</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500">Responsible Person</label>
              <input className="w-full mt-1 h-9 rounded-lg border border-slate-200 px-2 text-sm" value={form.responsible_person}
                onChange={e => set('responsible_person', e.target.value)} />
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500">Legal Reference (optional)</label>
            <input className="w-full mt-1 h-9 rounded-lg border border-slate-200 px-2 text-sm" value={form.legal_reference}
              onChange={e => set('legal_reference', e.target.value)} />
          </div>
        </div>
        <div className="flex gap-2.5 mt-5">
          <button onClick={onClose} className="flex-1 h-10 rounded-xl text-sm font-semibold text-slate-600 border border-slate-200">Cancel</button>
          <button disabled={!form.title || mut.isPending} onClick={() => mut.mutate()}
            className="flex-1 h-10 rounded-xl text-sm font-semibold text-white disabled:opacity-50" style={{ background: '#1B3A6B' }}>
            {mut.isPending ? 'Saving…' : 'Add'}
          </button>
        </div>
      </div>
    </div>
  );
}

function EntryForm({ obligations, entry, onClose, onSaved }) {
  const isEditing = !!entry;
  const [form, setForm] = useState({
    obligation_id: entry?.obligation_id || obligations[0]?.id || '',
    period: entry?.period || '',
    due_date: entry?.due_date ? entry.due_date.slice(0, 10) : '',
    actual_payment_date: entry?.actual_payment_date ? entry.actual_payment_date.slice(0, 10) : '',
    due_amount: entry?.due_amount ?? '', amount_paid: entry?.amount_paid ?? '',
    penalty_interest: entry?.penalty_interest ?? '', damages_charges: entry?.damages_charges ?? '',
    validity_expiry_date: entry?.validity_expiry_date ? entry.validity_expiry_date.slice(0, 10) : '',
    status: entry?.status || 'Pending',
    reason_for_delay: entry?.reason_for_delay || '', action_required: entry?.action_required || '',
    responsible_person: entry?.responsible_person || '',
  });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const mut = useMutation({
    mutationFn: () => isEditing ? complianceTrackerAPI.updateEntry(entry.id, form) : complianceTrackerAPI.createEntry(form),
    onSuccess: () => { toast.success(isEditing ? 'Entry updated' : 'Entry added'); onSaved(); onClose(); },
    onError: (e) => toast.error(e.response?.data?.error || 'Failed to save'),
  });
  const field = (label, key, type = 'text', extra = {}) => (
    <div>
      <label className="text-xs font-semibold text-slate-500">{label}</label>
      <input type={type} className="w-full mt-1 h-9 rounded-lg border border-slate-200 px-2 text-sm" value={form[key]}
        onChange={e => set(key, e.target.value)} {...extra} />
    </div>
  );
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/35" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <h3 className="text-base font-bold text-slate-900 mb-4">{isEditing ? 'Edit Compliance Entry' : 'Add Compliance Entry'}</h3>
        <div>
          <label className="text-xs font-semibold text-slate-500">Compliance Item</label>
          <select disabled={isEditing} className="w-full mt-1 h-9 rounded-lg border border-slate-200 px-2 text-sm disabled:bg-slate-50 disabled:text-slate-500" value={form.obligation_id} onChange={e => set('obligation_id', e.target.value)}>
            {obligations.map(o => <option key={o.id} value={o.id}>{o.project_name || 'Head Office'} — {o.title}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-3 gap-3 mt-3">
          {field('Period (e.g. 2026-04)', 'period')}
          {field('Due Date', 'due_date', 'date')}
          {field('Actual Payment/Compliance Date', 'actual_payment_date', 'date')}
          {field('Due Amount', 'due_amount', 'number')}
          {field('Amount Paid', 'amount_paid', 'number')}
          {field('Penalty / Interest', 'penalty_interest', 'number')}
          {field('Damages Charges', 'damages_charges', 'number')}
          {field('Validity / Expiry Date', 'validity_expiry_date', 'date')}
          <div>
            <label className="text-xs font-semibold text-slate-500">Status</label>
            <select className="w-full mt-1 h-9 rounded-lg border border-slate-200 px-2 text-sm" value={form.status} onChange={e => set('status', e.target.value)}>
              {['Pending', 'Paid', 'Overdue', 'Closed', 'Not Applicable'].map(s => <option key={s}>{s}</option>)}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-3 mt-3">
          {field('Reason for Delay (if any)', 'reason_for_delay')}
          {field('Action Required / Follow-up', 'action_required')}
          {field('Responsible Person', 'responsible_person')}
        </div>
        <div className="flex gap-2.5 mt-5">
          <button onClick={onClose} className="flex-1 h-10 rounded-xl text-sm font-semibold text-slate-600 border border-slate-200">Cancel</button>
          <button disabled={!form.obligation_id || mut.isPending} onClick={() => mut.mutate()}
            className="flex-1 h-10 rounded-xl text-sm font-semibold text-white disabled:opacity-50" style={{ background: '#1B3A6B' }}>
            {mut.isPending ? 'Saving…' : isEditing ? 'Save Changes' : 'Add Entry'}
          </button>
        </div>
      </div>
    </div>
  );
}

function DocumentsPanel({ entryId, onClose }) {
  const qc = useQueryClient();
  const fileRef = React.useRef(null);
  const [dragOver, setDragOver] = useState(false);
  const { data: docs, isLoading } = useQuery({
    queryKey: ['ct-documents', entryId],
    queryFn: () => complianceTrackerAPI.documents(entryId).then(r => r.data.data),
  });
  const uploadMut = useMutation({
    mutationFn: (file) => {
      const fd = new FormData();
      fd.append('file', file);
      return complianceTrackerAPI.uploadDocument(entryId, fd);
    },
    onSuccess: () => { toast.success('Document uploaded'); qc.invalidateQueries({ queryKey: ['ct-documents', entryId] }); qc.invalidateQueries({ queryKey: ['ct-entries'] }); },
    onError: (e) => toast.error(e.response?.data?.error || 'Upload failed'),
  });
  const deleteMut = useMutation({
    mutationFn: (id) => complianceTrackerAPI.deleteDocument(id),
    onSuccess: () => { toast.success('Document removed'); qc.invalidateQueries({ queryKey: ['ct-documents', entryId] }); qc.invalidateQueries({ queryKey: ['ct-entries'] }); },
  });

  const docList = docs || [];
  const handleFile = (f) => { if (f) uploadMut.mutate(f); };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px]" onClick={onClose} />
        <motion.div initial={{ opacity: 0, y: 12, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 8, scale: 0.98 }}
          transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[85vh] flex flex-col overflow-hidden"
          onClick={e => e.stopPropagation()} style={{ boxShadow: '0 1px 3px rgba(15,23,42,.06), 0 20px 40px rgba(15,23,42,.16)' }}>

          {/* Header */}
          <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100 flex-shrink-0">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: 'linear-gradient(135deg,#2563EB,#1E3A8A)', boxShadow: '0 4px 12px rgba(37,99,235,.3)' }}>
              <Paperclip size={17} className="text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-bold text-slate-900">Attachments</h3>
              <p className="text-[11px] text-slate-400">{docList.length ? `${docList.length} document${docList.length > 1 ? 's' : ''} attached` : 'Challans, receipts, licence copies, agreements'}</p>
            </div>
            <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors flex-shrink-0">
              <X size={16} />
            </button>
          </div>

          {/* Body */}
          <div className="px-5 py-4 overflow-y-auto flex-1">
            <input ref={fileRef} type="file" className="hidden"
              onChange={e => { handleFile(e.target.files?.[0]); e.target.value = ''; }} />
            <div
              onClick={() => fileRef.current?.click()}
              onDragOver={e => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={e => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files?.[0]); }}
              className="rounded-xl border-2 border-dashed cursor-pointer transition-colors flex flex-col items-center justify-center gap-1.5 py-6 px-4 text-center mb-4"
              style={{
                borderColor: dragOver ? '#2563EB' : '#CBD5E1',
                background: dragOver ? '#EFF6FF' : uploadMut.isPending ? '#F8FAFC' : '#FAFBFC',
                opacity: uploadMut.isPending ? 0.6 : 1,
                pointerEvents: uploadMut.isPending ? 'none' : 'auto',
              }}
            >
              <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center mb-1">
                <UploadCloud size={18} className="text-blue-600" />
              </div>
              <p className="text-sm font-semibold text-slate-700">
                {uploadMut.isPending ? 'Uploading…' : 'Click to upload or drag & drop'}
              </p>
              <p className="text-[11px] text-slate-400">Challan, receipt, licence copy, agreement…</p>
            </div>

            {isLoading && (
              <div className="flex items-center justify-center py-8 text-sm text-slate-400">Loading…</div>
            )}

            {!isLoading && !docList.length && (
              <div className="flex flex-col items-center justify-center py-6 text-center">
                <div className="w-12 h-12 rounded-2xl bg-slate-50 flex items-center justify-center mb-2">
                  <FileText size={20} className="text-slate-300" />
                </div>
                <p className="text-sm font-medium text-slate-400">No documents attached yet</p>
              </div>
            )}

            <div className="space-y-2">
              {docList.map(d => {
                const { Icon, color, bg } = fileMeta(d.doc_name);
                return (
                  <div key={d.id} className="group flex items-center gap-3 bg-slate-50/70 hover:bg-slate-50 rounded-xl p-2.5 transition-colors">
                    <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: bg }}>
                      <Icon size={16} style={{ color }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-700 truncate" title={d.doc_name}>{d.doc_name}</p>
                      <p className="text-[11px] text-slate-400">{fmtDate(d.uploaded_at)}{d.uploaded_by_name ? ` · ${d.uploaded_by_name}` : ''}</p>
                    </div>
                    <a href={d.sharepoint_url || d.file_url} target="_blank" rel="noreferrer"
                      className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors flex-shrink-0" title="Open">
                      <Download size={14} />
                    </a>
                    <button onClick={() => deleteMut.mutate(d.id)}
                      className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors flex-shrink-0 opacity-0 group-hover:opacity-100" title="Remove">
                      <Trash2 size={14} />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

function ReportConfigPanel({ configs, onRefresh }) {
  const [recipients, setRecipients] = useState('');
  const createMut = useMutation({
    mutationFn: () => complianceTrackerAPI.createReportConfig({ recipients }),
    onSuccess: () => { toast.success('Recipient added'); setRecipients(''); onRefresh(); },
    onError: (e) => toast.error(e.response?.data?.error || 'Failed'),
  });
  const deleteMut = useMutation({
    mutationFn: (id) => complianceTrackerAPI.deleteReportConfig(id),
    onSuccess: () => { toast.success('Removed'); onRefresh(); },
  });
  const sendMut = useMutation({
    mutationFn: () => complianceTrackerAPI.sendReportNow(),
    onSuccess: (r) => toast.success(r.data?.data?.ok ? `Report sent (${r.data.data.entry_count} items)` : r.data?.data?.reason || 'Sent'),
    onError: (e) => toast.error(e.response?.data?.error || 'Failed to send'),
  });
  return (
    <div className="bg-white rounded-2xl border border-slate-200/70 p-4 mb-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Mail size={16} className="text-slate-400" />
          <h4 className="text-sm font-bold text-slate-900">Weekly Report — every Monday morning (before noon)</h4>
        </div>
        <button onClick={() => sendMut.mutate()} disabled={sendMut.isPending}
          className="h-8 px-3 rounded-lg text-xs font-semibold text-white flex items-center gap-1.5 disabled:opacity-50" style={{ background: '#1B3A6B' }}>
          <Send size={12} /> {sendMut.isPending ? 'Sending…' : 'Send Now'}
        </button>
      </div>
      <div className="flex flex-wrap gap-2 mb-2">
        {(configs || []).map(c => (
          <span key={c.id} className="text-xs bg-slate-50 border border-slate-200 rounded-full px-3 py-1 flex items-center gap-2">
            {c.recipients}
            <button onClick={() => deleteMut.mutate(c.id)}><Trash2 size={11} className="text-slate-400 hover:text-red-500" /></button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <input className="flex-1 h-9 rounded-lg border border-slate-200 px-2 text-sm" placeholder="email1@bcim.in, email2@bcim.in"
          value={recipients} onChange={e => setRecipients(e.target.value)} />
        <button onClick={() => recipients.trim() && createMut.mutate()} className="h-9 px-4 rounded-lg text-sm font-semibold border border-slate-200 hover:bg-slate-50">Add</button>
      </div>
    </div>
  );
}

export default function StatutoryTracker() {
  const qc = useQueryClient();
  const [projectFilter, setProjectFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [obForm, setObForm] = useState(false);
  const [enForm, setEnForm] = useState(false);
  const [docsEntry, setDocsEntry] = useState(null);
  const [printData, setPrintData] = useState(null); // { entry, documents }
  const printZoneRef = React.useRef(null);

  const { data: categories } = useQuery({ queryKey: ['ct-categories'], queryFn: () => complianceTrackerAPI.categories().then(r => r.data.data) });
  const { data: projects } = useQuery({ queryKey: ['ct-projects'], queryFn: () => projectAPI.list().then(r => r.data?.data || []) });
  const { data: summary } = useQuery({ queryKey: ['ct-summary'], queryFn: () => complianceTrackerAPI.summary().then(r => r.data.data) });
  // 'ALL' is an explicit sentinel, not just an absent param — the axios
  // interceptor auto-injects the globally-selected project onto any request
  // with no project_id, which was silently defeating this page's own "All
  // Projects + HO" filter (and the obligations call wasn't even passing the
  // filter at all). See matching comment server-side in compliance-tracker
  // routes.
  const { data: obligations } = useQuery({ queryKey: ['ct-obligations', projectFilter], queryFn: () => complianceTrackerAPI.obligations({ project_id: projectFilter || 'ALL' }).then(r => r.data.data) });
  const { data: configs } = useQuery({ queryKey: ['ct-report-config'], queryFn: () => complianceTrackerAPI.reportConfig().then(r => r.data.data) });
  const { data: entries, isLoading } = useQuery({
    queryKey: ['ct-entries', projectFilter, statusFilter],
    queryFn: () => complianceTrackerAPI.entries({ project_id: projectFilter || 'ALL', status: statusFilter || undefined }).then(r => r.data.data),
  });

  const refreshAll = () => {
    qc.invalidateQueries({ queryKey: ['ct-summary'] });
    qc.invalidateQueries({ queryKey: ['ct-obligations'] });
    qc.invalidateQueries({ queryKey: ['ct-entries'] });
    qc.invalidateQueries({ queryKey: ['ct-report-config'] });
  };

  const deleteEntryMut = useMutation({
    mutationFn: (id) => complianceTrackerAPI.deleteEntry(id),
    onSuccess: () => { toast.success('Entry removed'); refreshAll(); },
  });

  const rows = entries || [];

  // ── Print — hidden zone + new isolated window, same pattern used across
  // the app's other print templates (PO, payslip, etc.) ────────────────────
  const handlePrintEntry = async (entry) => {
    try {
      const docs = await complianceTrackerAPI.documents(entry.id).then(r => r.data.data);
      setPrintData({ entry, documents: docs || [] });
    } catch (e) {
      toast.error('Failed to load documents for print');
    }
  };
  React.useEffect(() => {
    if (!printData || !printZoneRef.current) return;
    const html = printZoneRef.current.innerHTML;
    const win = window.open('', '_blank', 'width=900,height=700');
    if (!win) { window.print(); setPrintData(null); return; }
    win.document.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8"/>
  <title></title>
  <style>
    * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; box-sizing: border-box; }
    body { margin: 0; padding: 0; background: white; }
    @page { size: A4 portrait; margin: 10mm; }
  </style>
</head>
<body>${html}</body>
</html>`);
    win.document.close();
    let printed = false;
    const doPrint = () => { if (printed) return; printed = true; win.focus(); win.print(); win.close(); };
    win.onload = doPrint;
    setTimeout(doPrint, 600);
    setPrintData(null);
  }, [printData]);

  return (
    <div>
      <SummaryCards summary={summary} />
      <ReportConfigPanel configs={configs} onRefresh={refreshAll} />

      <div className="flex flex-wrap items-center gap-2 mb-3">
        <select className="h-9 rounded-lg border border-slate-200 px-2 text-sm" value={projectFilter} onChange={e => setProjectFilter(e.target.value)}>
          <option value="">All Projects + HO</option>
          <option value="HO">Head Office</option>
          {(projects || []).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select className="h-9 rounded-lg border border-slate-200 px-2 text-sm" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="">All Statuses</option>
          {['Pending', 'Overdue', 'Paid', 'Closed', 'Not Applicable'].map(s => <option key={s}>{s}</option>)}
        </select>
        <div className="ml-auto flex gap-2">
          <button onClick={() => setObForm(true)} className="h-9 px-3 rounded-lg text-sm font-semibold border border-slate-200 hover:bg-slate-50 flex items-center gap-1.5">
            <Plus size={14} /> Compliance Item
          </button>
          <button onClick={() => setEnForm(true)} disabled={!obligations?.length}
            className="h-9 px-3 rounded-lg text-sm font-semibold text-white flex items-center gap-1.5 disabled:opacity-50" style={{ background: '#1B3A6B' }}>
            <Plus size={14} /> Entry
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200/70 overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-slate-50 text-slate-500 uppercase text-[10px]">
              {['Compliance ID', 'Project', 'Category', 'Item', 'Due Date', 'Actual Date', 'Due', 'Paid', 'Outstanding', 'Penalty/Int', 'Damages', 'Delay Days', 'Validity', 'Status', 'Reason', 'Action Req.', 'Responsible'].map(h => (
                <th key={h} className="text-left font-semibold px-3 py-2 whitespace-nowrap">{h}</th>
              ))}
              <th className="text-left font-semibold px-3 py-2 whitespace-nowrap sticky right-0 bg-slate-50 shadow-[-4px_0_6px_-4px_rgba(0,0,0,0.1)]">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && <tr><td colSpan={18} className="text-center py-6 text-slate-400">Loading…</td></tr>}
            {!isLoading && !rows.length && <tr><td colSpan={18} className="text-center py-6 text-slate-400">No compliance entries yet.</td></tr>}
            {rows.map(e => (
              <tr key={e.id} className="group border-t border-slate-100 hover:bg-slate-50/60">
                <td className="px-3 py-2 font-semibold text-blue-600 whitespace-nowrap">{e.obligation_code || '—'}</td>
                <td className="px-3 py-2">{e.project_name || 'Head Office'}</td>
                <td className="px-3 py-2">{e.category}</td>
                <td className="px-3 py-2">{e.obligation_title}{e.period ? ` (${e.period})` : ''}</td>
                <td className="px-3 py-2 whitespace-nowrap">{fmtDate(e.due_date)}</td>
                <td className="px-3 py-2 whitespace-nowrap">{fmtDate(e.actual_payment_date)}</td>
                <td className="px-3 py-2 text-right">₹{inr(e.due_amount)}</td>
                <td className="px-3 py-2 text-right">₹{inr(e.amount_paid)}</td>
                <td className="px-3 py-2 text-right font-semibold" style={{ color: Number(e.outstanding_amount) > 0 ? '#dc2626' : '#16a34a' }}>₹{inr(e.outstanding_amount)}</td>
                <td className="px-3 py-2 text-right">₹{inr(e.penalty_interest)}</td>
                <td className="px-3 py-2 text-right">₹{inr(e.damages_charges)}</td>
                <td className="px-3 py-2 text-center" style={{ color: Number(e.delay_days) > 0 ? '#dc2626' : '#334155' }}>{e.delay_days ?? '—'}</td>
                <td className="px-3 py-2 whitespace-nowrap">{fmtDate(e.validity_expiry_date)}</td>
                <td className="px-3 py-2">
                  <span className="px-2 py-0.5 rounded-full font-semibold" style={{ background: `${STATUS_COLORS[e.status]}18`, color: STATUS_COLORS[e.status] }}>{e.status}</span>
                </td>
                <td className="px-3 py-2 max-w-[140px] truncate" title={e.reason_for_delay}>{e.reason_for_delay || '—'}</td>
                <td className="px-3 py-2 max-w-[140px] truncate" title={e.action_required}>{e.action_required || '—'}</td>
                <td className="px-3 py-2">{e.responsible_person || '—'}</td>
                <td className="px-3 py-2 sticky right-0 bg-white group-hover:bg-slate-50 shadow-[-4px_0_6px_-4px_rgba(0,0,0,0.1)]">
                  <div className="flex items-center gap-2.5">
                    <button onClick={() => setDocsEntry(e.id)} title="Attachments"
                      className="flex items-center gap-1 text-slate-500 hover:text-blue-600 font-semibold">
                      <Paperclip size={13} /> {e.document_count > 0 ? e.document_count : ''}
                    </button>
                    <button onClick={() => setEnForm(e)} title="Edit"><Pencil size={13} className="text-slate-400 hover:text-blue-600" /></button>
                    <button onClick={() => handlePrintEntry(e)} title="Print"><Printer size={13} className="text-slate-400 hover:text-blue-600" /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {obForm && <ObligationForm projects={projects || []} categories={categories || []} onClose={() => setObForm(false)} onSaved={refreshAll} />}
      {enForm && <EntryForm obligations={obligations || []} entry={enForm === true ? null : enForm} onClose={() => setEnForm(false)} onSaved={refreshAll} />}
      {docsEntry && <DocumentsPanel entryId={docsEntry} onClose={() => setDocsEntry(null)} />}

      {/* Hidden print zone — content captured via ref, printed in new window */}
      <div ref={printZoneRef} style={{ display: 'none' }} aria-hidden="true">
        {printData && <CompliancePrintTemplate entry={printData.entry} documents={printData.documents} />}
      </div>
    </div>
  );
}
