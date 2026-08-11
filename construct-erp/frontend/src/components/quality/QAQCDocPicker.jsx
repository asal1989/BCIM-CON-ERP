/**
 * QAQCDocPicker — embed in any QA/QC page to browse & download reference documents
 *
 * Usage:
 *   <QAQCDocPicker docType="method_statement" title="Reference Method Statements" />
 *   <QAQCDocPicker docType="inspection_report" title="Checklist Templates" />
 *   <QAQCDocPicker docType="quality_plan" title="ITP Reference Documents" />
 *   <QAQCDocPicker docType="certificate" title="Vendor Certificates" />
 */
import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
import {
  FileText, Download, Eye, ChevronDown, ChevronUp,
  BookOpen, ClipboardCheck, FileStack, Award, Shield,
  ExternalLink, Search, X,
} from 'lucide-react';
import { dmsAPI } from '../../api/client';
import toast from 'react-hot-toast';
import { clsx } from 'clsx';

const TYPE_CFG = {
  method_statement: { icon: BookOpen,       color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-200' },
  inspection_report:{ icon: ClipboardCheck, color: 'text-blue-600',    bg: 'bg-blue-50',    border: 'border-blue-200'    },
  quality_plan:     { icon: FileStack,      color: 'text-purple-600',  bg: 'bg-purple-50',  border: 'border-purple-200'  },
  certificate:      { icon: Award,          color: 'text-amber-600',   bg: 'bg-amber-50',   border: 'border-amber-200'   },
  general:          { icon: Shield,         color: 'text-slate-600',   bg: 'bg-slate-50',   border: 'border-slate-200'   },
};

function getExt(name = '') { return String(name).split('.').pop().toLowerCase(); }

function PreviewModal({ doc, onClose }) {
  const ext      = getExt(doc.file_name);
  const isPDF    = ext === 'pdf';
  const isImage  = ['png','jpg','jpeg','webp'].includes(ext);
  const isExcel  = ['xlsx','xls'].includes(ext);

  const [blobUrl,  setBlobUrl]  = useState('');
  const [loading,  setLoading]  = useState(isImage); // PDF uses direct URL, no loading needed
  const [fetchErr, setFetchErr] = useState('');

  // PDF: direct URL with JWT token in query param
  const token      = sessionStorage.getItem('accessToken');
  const pdfDirectUrl = isPDF && doc?.id ? `/api/v1/dms/${doc.id}/file?token=${token}` : '';

  useEffect(() => {
    if (!isImage) return;
    let url = '';
    setLoading(true); setFetchErr('');
    dmsAPI.fileBlob(doc.id)
      .then(res => { url = URL.createObjectURL(res.data); setBlobUrl(url); })
      .catch(() => setFetchErr('Unable to load preview.'))
      .finally(() => setLoading(false));
    return () => { if (url) URL.revokeObjectURL(url); };
  }, [doc.id, needsBlob]);

  const handleDownload = async () => {
    try {
      const res = await dmsAPI.fileBlob(doc.id);
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url; a.download = doc.file_name;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    } catch { /* silent */ }
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white w-full max-w-4xl max-h-[90vh] rounded-2xl shadow-2xl overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3.5 border-b bg-slate-50">
          <div>
            <h3 className="font-semibold text-black">{doc.doc_title || doc.file_name}</h3>
            <p className="text-xs text-slate-400">{doc.file_name}</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={handleDownload}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white text-xs rounded-lg hover:bg-indigo-700">
              <Download className="w-3.5 h-3.5" /> Download
            </button>
            <button onClick={onClose} className="p-1.5 hover:bg-slate-200 rounded-lg text-slate-500"><X className="w-4 h-4" /></button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex items-center justify-center h-[50vh] text-slate-400">
              <RefreshCw className="w-5 h-5 animate-spin mr-2" /> Loading…
            </div>
          ) : fetchErr ? (
            <div className="text-center py-10 text-slate-500">
              <p className="mb-3">{fetchErr}</p>
              <button onClick={handleDownload} className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 text-sm font-medium">
                <Download className="w-4 h-4" /> Download File
              </button>
            </div>
          ) : isPDF && pdfDirectUrl ? (
            <iframe key={pdfDirectUrl} src={pdfDirectUrl} className="w-full h-[65vh] rounded-xl border" title={doc.file_name} />
          ) : isImage && blobUrl ? (
            <div className="flex justify-center"><img src={blobUrl} alt={doc.file_name} className="max-h-[65vh] object-contain rounded-xl border" /></div>
          ) : (
            <div className="text-center py-12">
              <FileText className="w-12 h-12 mx-auto mb-3 text-slate-300" />
              <p className="text-slate-600 font-medium">{doc.file_name}</p>
              <p className="text-xs text-slate-400 mt-1 mb-5">
                {isExcel ? 'Open in Microsoft Excel to use this checklist/ITP format' : 'Download to view this document'}
              </p>
              <button onClick={handleDownload}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 font-medium text-sm">
                <Download className="w-4 h-4" /> Download File
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function QAQCDocPicker({ docType = 'method_statement', title, compact = false, defaultOpen = true }) {
  const [open, setOpen]       = useState(defaultOpen);
  const [search, setSearch]   = useState('');
  const [preview, setPreview] = useState(null);

  const cfg  = TYPE_CFG[docType] || TYPE_CFG.general;
  const Icon = cfg.icon;

  const { data: docs = [], isLoading } = useQuery({
    queryKey: ['qaqc-docs', docType],
    queryFn:  () => dmsAPI.list({ module: 'qaqc', doc_type: docType }).then(r => r.data.data || []),
    staleTime: 10 * 60 * 1000,
    enabled:  open,
  });

  const filtered = docs.filter(d => {
    if (!search) return true;
    const q = search.toLowerCase();
    return [d.file_name, d.doc_title].some(v => v?.toLowerCase().includes(q));
  });

  const handleDownload = async (doc, e) => {
    e.stopPropagation();
    try {
      const res = await dmsAPI.fileBlob(doc.id);
      const url = URL.createObjectURL(res.data);
      const a   = document.createElement('a');
      a.href     = url;
      a.download = doc.file_name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      dmsAPI.logDownload(doc.id).catch(() => {});
    } catch { toast.error('Download failed'); }
  };

  return (
    <div className={clsx('rounded-xl border overflow-hidden', cfg.border, open ? '' : 'border-opacity-60')}>
      {/* Toggle header */}
      <button
        onClick={() => setOpen(o => !o)}
        className={clsx('w-full flex items-center justify-between px-4 py-3 transition-colors', cfg.bg, 'hover:opacity-90')}>
        <div className="flex items-center gap-2.5">
          <Icon className={clsx('w-4 h-4', cfg.color)} />
          <span className={clsx('text-sm font-semibold', cfg.color)}>{title || 'Reference Documents'}</span>
          {!open && docs.length > 0 && (
            <span className={clsx('text-xs px-1.5 py-0.5 rounded-full', cfg.bg, cfg.color, 'border', cfg.border)}>
              {docs.length}
            </span>
          )}
        </div>
        {open ? <ChevronUp className={clsx('w-4 h-4', cfg.color)} /> : <ChevronDown className={clsx('w-4 h-4', cfg.color)} />}
      </button>

      {/* Document list */}
      {open && (
        <div className="bg-white">
          {/* Search */}
          {docs.length > 4 && (
            <div className="px-3 pt-3">
              <div className="relative">
                <Search className="absolute left-2.5 top-2 w-3.5 h-3.5 text-slate-400" />
                <input value={search} onChange={e => setSearch(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg outline-none focus:border-indigo-300"
                  placeholder="Search…" />
              </div>
            </div>
          )}

          {isLoading ? (
            <div className="py-6 text-center text-xs text-slate-400">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="py-6 text-center text-xs text-slate-400">No documents found</div>
          ) : (
            <div className={clsx('divide-y divide-slate-50 max-h-64 overflow-y-auto', search || docs.length <= 4 ? '' : '')}>
              {filtered.map(doc => {
                const ext  = getExt(doc.file_name);
                const isVw = ['pdf','png','jpg','jpeg','xlsx','xls'].includes(ext);
                return (
                  <div key={doc.id}
                    className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 cursor-pointer group"
                    onClick={() => isVw && setPreview(doc)}>
                    {/* File type indicator */}
                    <span className={clsx(
                      'text-[10px] font-bold uppercase px-1.5 py-0.5 rounded flex-shrink-0',
                      ext === 'pdf'  ? 'bg-red-100 text-red-600'      :
                      ['xlsx','xls'].includes(ext) ? 'bg-emerald-100 text-emerald-700' :
                      ['doc','docx'].includes(ext) ? 'bg-blue-100 text-blue-700'       :
                      'bg-slate-100 text-slate-500'
                    )}>{ext}</span>
                    {/* Name */}
                    <span className="flex-1 text-xs text-slate-700 truncate leading-tight">
                      {doc.doc_title || doc.file_name}
                    </span>
                    {/* Actions */}
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                      {isVw && (
                        <button onClick={e => { e.stopPropagation(); setPreview(doc); }}
                          className="p-1 rounded text-slate-400 hover:text-indigo-600" title="Preview">
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <button onClick={e => handleDownload(doc, e)}
                        className="p-1 rounded text-slate-400 hover:text-emerald-600" title="Download">
                        <Download className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Footer link */}
          <div className="px-4 py-2.5 border-t border-slate-100 bg-slate-50/50">
            <a href="/quality/document-library" target="_blank"
              className={clsx('flex items-center gap-1.5 text-xs font-medium', cfg.color, 'hover:underline')}>
              <ExternalLink className="w-3 h-3" /> Open full library
            </a>
          </div>
        </div>
      )}

      {preview && <PreviewModal doc={preview} onClose={() => setPreview(null)} />}
    </div>
  );
}
