// src/pages/documents/DocumentsPage.jsx
import React, { useState, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  FolderOpen, Upload, Search, Trash2, Download, ExternalLink,
  FileText, FileImage, File, X, Cloud, CloudOff, Filter,
  Building2, CheckCircle2, Zap, RefreshCw, CheckCircle, AlertCircle, PackageCheck, Hash
} from 'lucide-react';
import { documentsAPI, projectAPI } from '../../api/client';
import toast from 'react-hot-toast';
import { clsx } from 'clsx';
import dayjs from 'dayjs';

// Maps first URL segment → { module: doc-module-key, label: dept name, color }
const DEPT_CONFIG = {
  planning:              { module: 'drawing',        label: 'Planning',          color: '#3B82F6' },
  procurement:           { module: 'purchase_order', label: 'Procurement',       color: '#F59E0B' },
  stores:                { module: 'grn',            label: 'Stores',            color: '#14B8A6' },
  qs:                    { module: 'ra_bill',        label: 'QS & Billing',      color: '#10B981' },
  finance:               { module: 'invoice',        label: 'Finance',           color: '#10B981' },
  tqs:                   { module: 'general',        label: 'Bill Tracker',      color: '#6366F1' },
  quality:               { module: 'quality',        label: 'Quality (QA/QC)',   color: '#3B82F6' },
  hse:                   { module: 'hse',            label: 'HSE & Safety',      color: '#EF4444' },
  assets:                { module: 'general',        label: 'Assets & IT',       color: '#64748B' },
  'tender-management':   { module: 'general',        label: 'Tender Management', color: '#06B6D4' },
};

const MODULE_LABELS = {
  general:        'General',
  project:        'Projects',
  ra_bill:        'RA Bills',
  purchase_order: 'Purchase Orders',
  work_order:     'Work Orders',
  grn:            'GRN',
  mrs:            'Material Requisition',
  invoice:        'Vendor Invoices',
  payment:        'Payments',
  hse:            'HSE / Safety',
  quality:        'Quality (QA/QC)',
  drawing:        'Drawings',
  hr:             'HR / Payroll',
};

const MODULE_COLORS = {
  general:        'bg-slate-100 text-slate-600',
  project:        'bg-blue-50 text-blue-700',
  ra_bill:        'bg-indigo-50 text-indigo-700',
  purchase_order: 'bg-violet-50 text-violet-700',
  work_order:     'bg-orange-50 text-orange-700',
  grn:            'bg-emerald-50 text-emerald-700',
  mrs:            'bg-teal-50 text-teal-700',
  invoice:        'bg-amber-50 text-amber-700',
  payment:        'bg-green-50 text-green-700',
  hse:            'bg-red-50 text-red-700',
  quality:        'bg-pink-50 text-pink-700',
  drawing:        'bg-cyan-50 text-cyan-700',
  subcontractor:  'bg-orange-50 text-orange-700',
  hr:             'bg-yellow-50 text-yellow-700',
};

const DOC_TYPE_LABELS = {
  general: 'General',
  bulk_scanned_bill: 'Bulk Scanned Bills',
  vendor_bill: 'Vendor Bill / Invoice',
  grn: 'GRN',
  challan: 'Delivery Challan',
  purchase_order: 'Purchase Order',
  work_order: 'Work Order',
  receipt: 'Receipt',
};

function fileIcon(type) {
  if (['jpg','jpeg','png'].includes(type)) return <FileImage className="w-5 h-5 text-emerald-500" />;
  if (type === 'pdf') return <FileText className="w-5 h-5 text-red-500" />;
  return <File className="w-5 h-5 text-slate-400" />;
}

function formatSize(bytes) {
  if (!bytes) return '—';
  if (bytes > 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / 1024).toFixed(0)} KB`;
}

export default function DocumentsPage() {
  const location = useLocation();
  const deptKey = location.pathname.split('/')[1];
  const dept = DEPT_CONFIG[deptKey] || null;
  const initModule = dept?.module || 'all';

  const qc = useQueryClient();
  const fileRef = useRef();
  const [search, setSearch] = useState('');
  const [moduleFilter, setModuleFilter] = useState(initModule);
  const [projectFilter, setProjectFilter] = useState('');
  const [showUpload, setShowUpload] = useState(false);
  const [uploadForm, setUploadForm] = useState({ module: initModule === 'all' ? 'general' : initModule, doc_type: 'general', project_id: '', tags: '' });
  const [dragging, setDragging] = useState(false);
  const [parseResult, setParseResult] = useState(null);   // { doc, result } or { doc, error }
  const [parsingId,   setParsingId]   = useState(null);   // doc id currently being parsed

  const { data: docs = [], isLoading } = useQuery({
    queryKey: ['documents', search, moduleFilter, projectFilter],
    queryFn: () => documentsAPI.list({
      search: search || undefined,
      module: moduleFilter !== 'all' ? moduleFilter : undefined,
      project_id: projectFilter || undefined,
    }).then(r => r.data?.data || []),
  });

  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: () => projectAPI.list().then(r => {
      const d = r.data; return Array.isArray(d) ? d : d?.data || [];
    }),
  });

  const { data: moduleCounts = [] } = useQuery({
    queryKey: ['doc-modules'],
    queryFn: () => documentsAPI.modules().then(r => r.data?.data || []),
  });

  const uploadMut = useMutation({
    mutationFn: ({ file, meta }) => {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('module', meta.module);
      fd.append('doc_type', meta.doc_type || 'general');
      if (meta.project_id) fd.append('project_id', meta.project_id);
      if (meta.tags) fd.append('tags', meta.tags);
      return documentsAPI.upload(fd);
    },
    onSuccess: (res) => {
      const synced = res.data?.onedrive_synced;
      const imported = res.data?.import_result;
      const importError = res.data?.import_error;
      if (imported) {
        toast.success(`${imported.type === 'PO' ? 'Purchase Order' : 'Work Order'} ${imported.order_number} ${imported.action}`);
      } else if (importError) {
        toast.error(`Uploaded, but auto-import failed: ${importError}`);
      } else
      toast.success(synced ? 'Uploaded & synced to OneDrive ☁' : 'Uploaded locally (OneDrive not configured)');
      qc.invalidateQueries({ queryKey: ['documents'] });
      qc.invalidateQueries({ queryKey: ['doc-modules'] });
      setShowUpload(false);
    },
    onError: (e) => toast.error(e?.response?.data?.error || 'Upload failed'),
  });

  const parseMut = useMutation({
    mutationFn: ({ docId, projectId }) =>
      documentsAPI.parseOrder(docId, projectId ? { project_id: projectId } : {}),
    onMutate:   ({ docId }) => setParsingId(docId),
    onSettled:  ()          => setParsingId(null),
    onSuccess:  (res, { doc }) => {
      qc.invalidateQueries({ queryKey: ['documents'] });
      setParseResult({ doc, result: res.data });
    },
    onError: (err, { doc }) => {
      setParseResult({ doc, error: err?.response?.data?.error || 'Parse failed' });
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id) => documentsAPI.delete(id),
    onSuccess: () => {
      toast.success('Document deleted');
      qc.invalidateQueries({ queryKey: ['documents'] });
      qc.invalidateQueries({ queryKey: ['doc-modules'] });
    },
    onError: () => toast.error('Delete failed'),
  });

  const handleFiles = (files) => {
    if (!files?.length) return;
    Array.from(files).forEach(file => {
      uploadMut.mutate({ file, meta: uploadForm });
    });
  };

  const totalSize = docs.reduce((s, d) => s + (d.file_size || 0), 0);
  const oneDriveSynced = docs.filter(d => d.onedrive_id).length;

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto min-h-screen bg-[#f4f6f9]">

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2 text-xs font-medium mb-1" style={{ color: dept?.color || '#64748B' }}>
            <FolderOpen className="w-3.5 h-3.5" />
            {dept ? `${dept.label} — Document Repository` : 'Document Repository'}
          </div>
          <h1 className="text-2xl font-medium text-slate-900">
            {dept ? `${dept.label} Documents` : 'Documents'}
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {dept
              ? `${dept.label} files — stored locally & synced to OneDrive`
              : 'All module documents — stored locally & synced to OneDrive'}
          </p>
        </div>
        <button
          onClick={() => setShowUpload(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 shadow-sm transition-colors"
        >
          <Upload className="w-4 h-4" /> Upload Document
        </button>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Total Files',       value: docs.length,       icon: FileText,     color: 'text-indigo-600', bg: 'bg-indigo-50' },
          { label: 'Synced to OneDrive', value: oneDriveSynced,   icon: Cloud,        color: 'text-blue-600',   bg: 'bg-blue-50' },
          { label: 'Total Size',         value: formatSize(totalSize), icon: FolderOpen, color: 'text-emerald-600', bg: 'bg-emerald-50', text: true },
          { label: 'Modules',            value: moduleCounts.length, icon: Filter,     color: 'text-amber-600',  bg: 'bg-amber-50' },
        ].map(k => (
          <div key={k.label} className="bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-3 shadow-sm">
            <div className={clsx('w-10 h-10 rounded-lg flex items-center justify-center shrink-0', k.bg)}>
              <k.icon className={clsx('w-5 h-5', k.color)} />
            </div>
            <div>
              <div className={clsx('text-xl font-bold', k.text ? k.color : 'text-slate-900')}>{k.value}</div>
              <div className="text-xs text-slate-400">{k.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="bg-white border border-slate-200 rounded-xl p-3 mb-5 flex flex-wrap items-center gap-3 shadow-sm">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-9 pr-4 py-2 text-sm text-slate-900 placeholder:text-slate-900 font-medium outline-none focus:border-indigo-400 transition-all"
            placeholder="Search file name…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        <select
          className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 outline-none focus:border-indigo-400"
          value={projectFilter}
          onChange={e => setProjectFilter(e.target.value)}
        >
          <option value="">All Projects</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>

        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            onClick={() => setModuleFilter('all')}
            className={clsx('px-3 py-1.5 rounded-lg text-xs font-medium border transition-all',
              moduleFilter === 'all' ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-900 font-medium border-slate-200 hover:border-indigo-300')}
          >All</button>
          {moduleCounts.map(m => (
            <button
              key={m.module}
              onClick={() => setModuleFilter(m.module)}
              className={clsx('px-3 py-1.5 rounded-lg text-xs font-medium border transition-all',
                moduleFilter === m.module ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-900 font-medium border-slate-200 hover:border-indigo-300')}
            >
              {MODULE_LABELS[m.module] || m.module}
              <span className={clsx('ml-1 px-1 rounded-full text-[10px]',
                moduleFilter === m.module ? 'bg-white/20' : 'bg-slate-100 text-slate-500')}>{m.count}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Documents Table */}
      {isLoading ? (
        <div className="space-y-2">{[1,2,3,4,5].map(n => <div key={n} className="h-14 bg-slate-200 animate-pulse rounded-xl" />)}</div>
      ) : docs.length === 0 ? (
        <div className="py-20 text-center border-2 border-dashed border-slate-200 rounded-xl bg-white">
          <FolderOpen className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="text-sm font-medium text-slate-500">No documents found</p>
          <p className="text-xs text-slate-900 font-medium mt-1">Upload a document to get started</p>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-500">File</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-500">Module</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-500">Type</th>
                {moduleFilter === 'grn' && <th className="text-left px-4 py-3 text-xs font-medium text-slate-500">GRN / Invoice</th>}
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-500">Project</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-500">Uploaded By</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-500">Date</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-500">Size</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-500">OneDrive</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {docs.map(doc => (
                <tr key={doc.id} className="hover:bg-slate-50 transition-colors group">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      {fileIcon(doc.file_type)}
                      <div className="min-w-0">
                        <span className="block text-sm font-medium text-slate-900 truncate max-w-[220px]" title={doc.doc_title || doc.file_name}>
                          {doc.doc_title || doc.file_name}
                        </span>
                        {doc.doc_title && (
                          <span className="block text-[11px] text-slate-400 truncate max-w-[220px]" title={doc.file_name}>
                            {doc.file_name}
                          </span>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={clsx('px-2 py-0.5 rounded-full text-[11px] font-medium', MODULE_COLORS[doc.module] || MODULE_COLORS.general)}>
                      {MODULE_LABELS[doc.module] || doc.module}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700">
                      {DOC_TYPE_LABELS[doc.doc_type] || String(doc.doc_type || 'general').replace(/_/g, ' ')}
                    </span>
                  </td>
                  {moduleFilter === 'grn' && (
                    <td className="px-4 py-3">
                      <div className="space-y-0.5">
                        {doc.grn_number && (
                          <div className="flex items-center gap-1 text-xs font-mono text-emerald-700">
                            <PackageCheck className="w-3 h-3 shrink-0" />{doc.grn_number}
                          </div>
                        )}
                        {(doc.record_invoice_number || doc.doc_number) && (
                          <div className="flex items-center gap-1 text-xs font-mono text-amber-700">
                            <Hash className="w-3 h-3 shrink-0" />{doc.record_invoice_number || doc.doc_number}
                          </div>
                        )}
                        {!doc.grn_number && !doc.record_invoice_number && !doc.doc_number && (
                          <span className="text-xs text-slate-300">—</span>
                        )}
                      </div>
                    </td>
                  )}
                  <td className="px-4 py-3 text-xs text-slate-500">{doc.project_name || '—'}</td>
                  <td className="px-4 py-3 text-xs text-slate-500">{doc.uploader_name || '—'}</td>
                  <td className="px-4 py-3 text-xs text-slate-900 font-medium whitespace-nowrap">
                    {dayjs(doc.created_at).format('DD MMM YYYY')}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">{formatSize(doc.file_size)}</td>
                  <td className="px-4 py-3">
                    {doc.onedrive_web_url ? (
                      <a href={doc.onedrive_web_url} target="_blank" rel="noreferrer"
                        className="flex items-center gap-1 text-blue-600 hover:underline text-xs">
                        <Cloud className="w-3.5 h-3.5" /> View
                      </a>
                    ) : (
                      <span className="flex items-center gap-1 text-xs text-slate-300">
                        <CloudOff className="w-3.5 h-3.5" /> Local
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      {/* Parse & Create / Re-sync button — only for xlsx PO or WO files */}
                      {['xlsx', 'xls', 'pdf'].includes(doc.file_type) && ['purchase_order', 'work_order'].includes(doc.module) && (
                        <button
                          onClick={() => parseMut.mutate({ docId: doc.id, doc, projectId: doc.project_id })}
                          disabled={parsingId === doc.id}
                          title={doc.module_record_id ? 'Re-sync from file' : 'Parse & Create PO/WO'}
                          className={clsx(
                            'flex items-center gap-1 px-2 py-1 rounded-lg border text-xs font-medium transition-all',
                            doc.module_record_id
                              ? 'border-blue-200 text-blue-600 hover:bg-blue-50'
                              : 'border-amber-300 text-amber-700 bg-amber-50 hover:bg-amber-100',
                            parsingId === doc.id && 'opacity-50 cursor-not-allowed'
                          )}
                        >
                          {parsingId === doc.id
                            ? <RefreshCw className="w-3 h-3 animate-spin" />
                            : doc.module_record_id
                              ? <RefreshCw className="w-3 h-3" />
                              : <Zap className="w-3 h-3" />
                          }
                          {parsingId === doc.id ? 'Parsing…' : doc.module_record_id ? 'Re-sync' : 'Create PO/WO'}
                        </button>
                      )}
                      {doc.local_url && (
                        <a
                          href={`${process.env.REACT_APP_API_URL?.replace('/api/v1', '') || ''}${doc.local_url}`}
                          download={doc.file_name}
                          target="_blank" rel="noreferrer"
                          className="w-7 h-7 flex items-center justify-center rounded-lg border border-slate-200 text-slate-900 font-medium hover:text-indigo-600 hover:border-indigo-300 transition-all"
                        >
                          <Download className="w-3.5 h-3.5" />
                        </a>
                      )}
                      <button
                        onClick={() => {
                          if (window.confirm(`Delete "${doc.file_name}"?`)) deleteMut.mutate(doc.id);
                        }}
                        className="w-7 h-7 flex items-center justify-center rounded-lg border border-slate-200 text-slate-900 font-medium hover:text-red-500 hover:border-red-200 transition-all"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Parse Result Modal */}
      {parseResult && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <h2 className="text-base font-medium text-slate-900">
                {parseResult.error ? 'Parse Failed' : parseResult.result?.action === 'resynced' ? 'Re-sync Complete' : 'PO / WO Created'}
              </h2>
              <button onClick={() => setParseResult(null)}
                className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 hover:text-slate-900 transition-all">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5">
              {parseResult.error ? (
                <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-100 rounded-xl">
                  <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-red-700">Could not parse file</p>
                    <p className="text-xs text-red-600 mt-1">{parseResult.error}</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-start gap-3 p-4 bg-emerald-50 border border-emerald-100 rounded-xl">
                    <CheckCircle className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-emerald-700">
                        {parseResult.result.type === 'PO' ? 'Purchase Order' : 'Work Order'}{' '}
                        {parseResult.result.action === 'resynced' ? 're-synced successfully' : 'created successfully'}
                      </p>
                      <p className="text-xs text-emerald-600 mt-0.5">
                        {parseResult.result.order_number} — {parseResult.result.vendor}
                      </p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { label: 'Order Number', value: parseResult.result.order_number },
                      { label: 'Type',         value: parseResult.result.type === 'PO' ? 'Purchase Order' : 'Work Order' },
                      { label: 'Vendor',       value: parseResult.result.vendor || '—' },
                      { label: 'Line Items',   value: `${parseResult.result.items_count} items` },
                      { label: 'Grand Total',  value: parseResult.result.grand_total
                          ? `₹${Number(parseResult.result.grand_total).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
                          : '—' },
                      { label: 'Action',       value: parseResult.result.action === 'resynced' ? 'Updated existing record' : 'New record created' },
                    ].map(item => (
                      <div key={item.label} className="bg-slate-50 rounded-lg p-3">
                        <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wide">{item.label}</p>
                        <p className="text-sm font-semibold text-black mt-0.5 truncate">{item.value}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="px-5 pb-5">
              <button onClick={() => setParseResult(null)}
                className="w-full py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-xl hover:bg-indigo-700 transition-colors">
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Upload Modal */}
      {showUpload && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <div>
                <h2 className="text-base font-medium text-slate-900">Upload Document</h2>
                <p className="text-xs text-slate-900 font-medium mt-0.5">File will be stored locally and synced to OneDrive if configured</p>
              </div>
              <button onClick={() => setShowUpload(false)} className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 text-slate-900 font-medium hover:text-slate-900 transition-all">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              {/* Drop Zone */}
              <div
                onDragOver={e => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={e => { e.preventDefault(); setDragging(false); handleFiles(e.dataTransfer.files); }}
                onClick={() => fileRef.current?.click()}
                className={clsx(
                  'border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all',
                  dragging ? 'border-indigo-400 bg-indigo-50' : 'border-slate-200 hover:border-indigo-300 hover:bg-slate-50'
                )}
              >
                <Upload className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <p className="text-sm font-medium text-slate-600">Drop files here or click to browse</p>
                <p className="text-xs text-slate-900 font-medium mt-1">PDF, DOCX, XLSX, PNG, JPG, DWG — up to 25 MB</p>
                <input
                  ref={fileRef}
                  type="file"
                  multiple
                  className="hidden"
                  accept=".pdf,.docx,.xlsx,.jpg,.jpeg,.png,.dwg,.dxf,.zip"
                  onChange={e => handleFiles(e.target.files)}
                />
              </div>

              {/* Meta */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-slate-900 font-medium mb-1 block">Module *</label>
                  <select
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 font-medium outline-none focus:border-indigo-400"
                    value={uploadForm.module}
                    onChange={e => setUploadForm(f => ({ ...f, module: e.target.value }))}
                  >
                    {Object.entries(MODULE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-900 font-medium mb-1 block">Document Type *</label>
                  <select
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 font-medium outline-none focus:border-indigo-400"
                    value={uploadForm.doc_type}
                    onChange={e => setUploadForm(f => ({ ...f, doc_type: e.target.value }))}
                  >
                    {Object.entries(DOC_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-900 font-medium mb-1 block">Project</label>
                  <select
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 font-medium outline-none focus:border-indigo-400"
                    value={uploadForm.project_id}
                    onChange={e => setUploadForm(f => ({ ...f, project_id: e.target.value }))}
                  >
                    <option value="">No specific project</option>
                    {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-900 font-medium mb-1 block">Tags (comma-separated)</label>
                <input
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 font-medium outline-none focus:border-indigo-400"
                  placeholder="e.g. contract, approved, 2024"
                  value={uploadForm.tags}
                  onChange={e => setUploadForm(f => ({ ...f, tags: e.target.value }))}
                />
              </div>

              {uploadMut.isPending && (
                <div className="flex items-center gap-2 text-sm text-indigo-600 bg-indigo-50 rounded-lg px-3 py-2">
                  <div className="w-4 h-4 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                  Uploading…
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
