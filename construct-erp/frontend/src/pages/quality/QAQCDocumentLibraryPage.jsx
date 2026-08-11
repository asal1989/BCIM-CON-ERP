// QA/QC Document Library — browse, preview & link DMS documents to QA/QC records
import React, { useState, useMemo, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  FileText, Search, Download, Eye, ExternalLink, Filter,
  BookOpen, Shield, ClipboardCheck, FileSpreadsheet,
  FileStack, Award, RefreshCw, X, ChevronRight,
} from 'lucide-react';
import { dmsAPI } from '../../api/client';
import toast from 'react-hot-toast';
import { clsx } from 'clsx';

// ── Document type config ────────────────────────────────────────────
const DOC_TYPE_CFG = {
  inspection_report: {
    label: 'Inspection Checklists',
    icon:  ClipboardCheck,
    color: 'bg-blue-50 text-blue-700 border-blue-200',
    badge: 'bg-blue-100 text-blue-700',
    desc:  'RFI formats, inspection checklists for site activities',
  },
  method_statement: {
    label: 'Method Statements',
    icon:  BookOpen,
    color: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    badge: 'bg-emerald-100 text-emerald-700',
    desc:  'Construction methodology documents for site activities',
  },
  quality_plan: {
    label: 'ITPs & Quality Plans',
    icon:  FileStack,
    color: 'bg-purple-50 text-purple-700 border-purple-200',
    badge: 'bg-purple-100 text-purple-700',
    desc:  'Inspection & Test Plans, Project Quality Plan',
  },
  certificate: {
    label: 'Certificates',
    icon:  Award,
    color: 'bg-amber-50 text-amber-700 border-amber-200',
    badge: 'bg-amber-100 text-amber-700',
    desc:  'NABL, GST, MSME and vendor qualification certificates',
  },
  general: {
    label: 'Vendor Profiles',
    icon:  Shield,
    color: 'bg-slate-50 text-slate-700 border-slate-200',
    badge: 'bg-slate-100 text-slate-600',
    desc:  'Approved vendor company profiles & rate lists',
  },
};

const FILE_ICONS = {
  xlsx: { icon: FileSpreadsheet, color: 'text-emerald-600', bg: 'bg-emerald-50' },
  xls:  { icon: FileSpreadsheet, color: 'text-emerald-600', bg: 'bg-emerald-50' },
  pdf:  { icon: FileText,        color: 'text-red-500',     bg: 'bg-red-50' },
  doc:  { icon: FileText,        color: 'text-blue-600',    bg: 'bg-blue-50' },
  docx: { icon: FileText,        color: 'text-blue-600',    bg: 'bg-blue-50' },
};

function getFileExt(name = '') { return String(name).split('.').pop().toLowerCase(); }
function FileIcon({ fileName, size = 4 }) {
  const ext = getFileExt(fileName);
  const cfg = FILE_ICONS[ext] || { icon: FileText, color: 'text-slate-400', bg: 'bg-slate-50' };
  const Icon = cfg.icon;
  return (
    <div className={clsx(`w-${size+4} h-${size+4} rounded-lg flex items-center justify-center`, cfg.bg)}>
      <Icon className={clsx(`w-${size} h-${size}`, cfg.color)} />
    </div>
  );
}

// ── Preview modal — PDF uses direct URL with JWT token (most reliable) ─
function PreviewModal({ doc, onClose }) {
  const ext      = getFileExt(doc.file_name);
  const isPDF    = ext === 'pdf';
  const isImage  = ['png','jpg','jpeg','webp'].includes(ext);
  const isExcel  = ['xlsx','xls'].includes(ext);

  const [blobUrl, setBlobUrl] = useState('');
  const [loading, setLoading] = useState(isImage); // Only images need blob; PDFs use direct URL
  const [fetchErr, setFetchErr] = useState('');

  // PDF: direct URL with JWT — bypasses blob, browser renders natively
  const token = sessionStorage.getItem('accessToken');
  const pdfDirectUrl = isPDF && doc?.id ? `/api/v1/dms/${doc.id}/file?token=${token}` : '';

  useEffect(() => {
    if (!isImage) return;
    let url = '';
    setLoading(true); setFetchErr('');
    dmsAPI.fileBlob(doc.id)
      .then(res => { url = URL.createObjectURL(res.data); setBlobUrl(url); })
      .catch(() => setFetchErr('Unable to load preview. Use Download instead.'))
      .finally(() => setLoading(false));
    return () => { if (url) URL.revokeObjectURL(url); };
  }, [doc.id, isImage]);

  const handleDownload = async () => {
    try {
      const res = await dmsAPI.fileBlob(doc.id);
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url; a.download = doc.file_name;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    } catch { toast.error('Download failed'); }
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-start justify-center p-4 overflow-y-auto" onClick={onClose}>
      <div className="bg-white w-full max-w-5xl rounded-2xl shadow-2xl overflow-hidden my-8" onClick={e=>e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b bg-slate-50">
          <div className="flex items-center gap-3 min-w-0">
            <FileIcon fileName={doc.file_name} size={5} />
            <div className="min-w-0">
              <h3 className="font-semibold text-black truncate">{doc.doc_title || doc.file_name}</h3>
              <p className="text-xs text-slate-400 mt-0.5">{doc.file_name}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 ml-4 flex-shrink-0">
            <button onClick={handleDownload}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white text-xs rounded-lg hover:bg-indigo-700">
              <Download className="w-3.5 h-3.5" /> Download
            </button>
            <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6">
          {loading ? (
            <div className="flex items-center justify-center h-[60vh] text-slate-400">
              <RefreshCw className="w-6 h-6 animate-spin mr-2" /> Loading preview…
            </div>
          ) : fetchErr ? (
            <div className="text-center py-16">
              <FileIcon fileName={doc.file_name} size={10} />
              <p className="text-slate-500 mt-4 mb-2">{fetchErr}</p>
              <button onClick={handleDownload}
                className="inline-flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 font-medium">
                <Download className="w-4 h-4" /> Download {ext.toUpperCase()} File
              </button>
            </div>
          ) : isPDF && pdfDirectUrl ? (
            <iframe key={pdfDirectUrl} src={pdfDirectUrl} className="w-full h-[70vh] rounded-xl border border-slate-200" title={doc.file_name} />
          ) : isImage && blobUrl ? (
            <div className="flex justify-center">
              <img src={blobUrl} alt={doc.file_name} className="max-h-[70vh] object-contain rounded-xl border border-slate-200" />
            </div>
          ) : (
            /* Non-previewable — Word, Excel, etc. */
            <div className="text-center py-16">
              <FileIcon fileName={doc.file_name} size={10} />
              <h3 className="font-semibold text-slate-700 mt-4">{doc.file_name}</h3>
              <p className="text-sm text-slate-400 mt-1 mb-6">
                {isExcel ? 'Open in Microsoft Excel to use this checklist/ITP format' : 'Download to view this document'}
              </p>
              <button onClick={handleDownload}
                className="inline-flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 font-medium">
                <Download className="w-4 h-4" /> Download {ext.toUpperCase()} File
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════════
export default function QAQCDocumentLibraryPage() {
  const [search, setSearch]       = useState('');
  const [typeFilter, setType]     = useState('');
  const [preview, setPreview]     = useState(null);
  const [viewMode, setViewMode]   = useState('grouped'); // 'grouped' | 'list'

  const { data: docs = [], isLoading, refetch } = useQuery({
    queryKey: ['qaqc-doc-library'],
    queryFn: () => dmsAPI.list({ module: 'qaqc' }).then(r => r.data?.data || r.data || []).catch(() => []),
    staleTime: 5 * 60 * 1000,
  });

  const filtered = useMemo(() => docs.filter(d => {
    if (typeFilter && d.doc_type !== typeFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return [d.file_name, d.doc_title, d.doc_type].some(v => v?.toLowerCase().includes(q));
    }
    return true;
  }), [docs, typeFilter, search]);

  // Group by doc_type
  const grouped = useMemo(() => {
    const map = {};
    filtered.forEach(d => {
      const t = d.doc_type || 'general';
      if (!map[t]) map[t] = [];
      map[t].push(d);
    });
    return map;
  }, [filtered]);

  const handleDownload = async (doc) => {
    try {
      const res = await dmsAPI.fileBlob(doc.id);
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = doc.file_name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      dmsAPI.logDownload(doc.id).catch(() => {});
    } catch {
      toast.error('Download failed');
    }
  };

  const typeOrder = ['inspection_report','method_statement','quality_plan','certificate','general'];

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto min-h-screen" style={{background:'#f4f6f9'}}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-400 mb-1.5">
            <FileStack className="w-3.5 h-3.5" /> QA/QC Module
          </div>
          <h1 className="text-2xl font-bold text-black">QA/QC Document Library</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {docs.length} documents — checklists, method statements, ITPs, certificates & vendor profiles
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => refetch()} className="p-2 border border-slate-200 bg-white rounded-lg hover:bg-slate-50">
            <RefreshCw className="w-4 h-4 text-slate-500" />
          </button>
          {/* View toggle */}
          <div className="flex border border-slate-200 rounded-lg overflow-hidden bg-white">
            {[['grouped','Grouped'],['list','List']].map(([k,l]) => (
              <button key={k} onClick={() => setViewMode(k)}
                className={clsx('px-3 py-2 text-xs font-medium transition-colors',
                  viewMode===k ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:bg-slate-50')}>
                {l}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Summary chips */}
      <div className="flex flex-wrap gap-2 mb-5">
        <button onClick={() => setType('')}
          className={clsx('flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-medium transition-all',
            !typeFilter ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm' : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300')}>
          All ({docs.length})
        </button>
        {typeOrder.filter(t => docs.some(d => (d.doc_type||'general') === t)).map(t => {
          const cfg = DOC_TYPE_CFG[t];
          const Icon = cfg.icon;
          const count = docs.filter(d => (d.doc_type||'general') === t).length;
          return (
            <button key={t} onClick={() => setType(typeFilter===t ? '' : t)}
              className={clsx('flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-medium transition-all',
                typeFilter===t ? `${cfg.color} shadow-sm` : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300')}>
              <Icon className="w-3.5 h-3.5" />
              {cfg.label} ({count})
            </button>
          );
        })}
      </div>

      {/* Search */}
      <div className="relative mb-5 max-w-md">
        <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
        <input value={search} onChange={e => setSearch(e.target.value)}
          className="pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-xl text-sm w-full shadow-sm focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100 outline-none"
          placeholder="Search documents…" />
        {search && <button onClick={() => setSearch('')} className="absolute right-2 top-2.5 text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <RefreshCw className="w-6 h-6 animate-spin text-indigo-500 mr-2" />
          <span className="text-slate-400">Loading library…</span>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 bg-white rounded-2xl border border-slate-200">
          <FileStack className="w-12 h-12 mx-auto mb-3 text-slate-300" />
          <p className="text-slate-500 font-medium">No documents found</p>
        </div>
      ) : viewMode === 'grouped' ? (
        // ── GROUPED VIEW ────────────────────────────────────────────
        <div className="space-y-6">
          {typeOrder.filter(t => grouped[t]?.length).map(t => {
            const cfg = DOC_TYPE_CFG[t];
            const Icon = cfg.icon;
            const docs = grouped[t];
            return (
              <div key={t} className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
                {/* Section header */}
                <div className={clsx('flex items-center justify-between px-5 py-4 border-b', cfg.color.replace('text-','').replace('border-',''))}>
                  <div className="flex items-center gap-3">
                    <div className={clsx('w-9 h-9 rounded-xl flex items-center justify-center', cfg.badge)}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <div>
                      <h2 className="font-semibold text-black">{cfg.label}</h2>
                      <p className="text-xs text-slate-500">{cfg.desc}</p>
                    </div>
                  </div>
                  <span className={clsx('px-2.5 py-1 rounded-full text-xs font-semibold', cfg.badge)}>{docs.length} docs</span>
                </div>
                {/* Documents grid */}
                <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {docs.map(doc => (
                    <DocCard key={doc.id} doc={doc} onPreview={() => setPreview(doc)} onDownload={() => handleDownload(doc)} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        // ── LIST VIEW ───────────────────────────────────────────────
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                {['Document','Type','File','Actions'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((doc, i) => {
                const cfg = DOC_TYPE_CFG[doc.doc_type] || DOC_TYPE_CFG.general;
                const Icon = cfg.icon;
                return (
                  <tr key={doc.id} className={clsx('border-b border-slate-100 hover:bg-slate-50', i%2===0?'bg-white':'bg-slate-50/30')}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <FileIcon fileName={doc.file_name} size={4} />
                        <div>
                          <p className="text-sm font-medium text-black leading-tight">{doc.doc_title || doc.file_name}</p>
                          <p className="text-[11px] text-slate-400 mt-0.5">{doc.file_name}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={clsx('inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border', cfg.color)}>
                        <Icon className="w-3 h-3" /> {cfg.label}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs font-mono uppercase text-slate-400 bg-slate-100 px-2 py-0.5 rounded">
                        {getFileExt(doc.file_name)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        <button onClick={() => setPreview(doc)} title="Preview"
                          className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors">
                          <Eye className="w-4 h-4" />
                        </button>
                        <button onClick={() => handleDownload(doc)} title="Download"
                          className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 transition-colors">
                          <Download className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Preview modal */}
      {preview && <PreviewModal doc={preview} onClose={() => setPreview(null)} />}
    </div>
  );
}

// ── Document Card ─────────────────────────────────────────────────
function DocCard({ doc, onPreview, onDownload }) {
  const ext = getFileExt(doc.file_name);
  const isPreviewable = ['pdf','png','jpg','jpeg','xlsx','xls'].includes(ext);

  return (
    <div className="group flex items-start gap-3 p-3 rounded-xl border border-slate-100 hover:border-indigo-200 hover:bg-indigo-50/30 transition-all cursor-pointer"
      onClick={onPreview}>
      <FileIcon fileName={doc.file_name} size={4} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-black leading-tight truncate pr-2">
          {doc.doc_title || doc.file_name}
        </p>
        <p className="text-[11px] text-slate-400 mt-0.5 truncate">{doc.file_name}</p>
        <div className="flex items-center gap-2 mt-2">
          <span className="text-[10px] font-bold uppercase text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">{ext}</span>
          {doc.status === 'approved' && (
            <span className="text-[10px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded-full">✓ Approved</span>
          )}
        </div>
      </div>
      {/* Action buttons — shown on hover */}
      <div className="flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
        {isPreviewable && (
          <button onClick={onPreview} title="Preview"
            className="w-7 h-7 flex items-center justify-center rounded-lg bg-white border border-slate-200 text-slate-500 hover:text-indigo-600 hover:border-indigo-300 shadow-sm transition-colors">
            <Eye className="w-3.5 h-3.5" />
          </button>
        )}
        <button onClick={onDownload} title="Download"
          className="w-7 h-7 flex items-center justify-center rounded-lg bg-white border border-slate-200 text-slate-500 hover:text-emerald-600 hover:border-emerald-300 shadow-sm transition-colors">
          <Download className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
