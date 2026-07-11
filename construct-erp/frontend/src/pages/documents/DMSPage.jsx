// DMS — Complete Document Management System
// Repository · Folders · Upload · Versions · Approvals · Signatures · Sharing · Audit · Reports
import React, { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  FolderOpen, Folder, Upload, Search, FileText, CheckCircle2, Clock, AlertTriangle,
  Eye, Download, Share2, GitBranch, X, Bell, BarChart3, RefreshCw, Filter, Plus,
  Archive, PenTool, History, ScrollText, ChevronRight, ChevronDown, HardDrive,
  Building2, Users2, Briefcase, UserCircle, FileSignature, Activity, Trash2, Link2,
  Send, UploadCloud, FileSpreadsheet, Tag, Layers,
} from 'lucide-react';
import { dmsAPI, projectAPI } from '../../api/client';
import api from '../../api/client';
import toast from 'react-hot-toast';
import { clsx } from 'clsx';
import dayjs from 'dayjs';

const DOC_TYPES = [
  'drawing','boq','contract','purchase_order','invoice','rfi','site_report',
  'safety_report','inspection_report','method_statement','specification',
  'tender_doc','quality_plan','correspondence','certificate','permit','general'
];

const STATUS_CFG = {
  draft:        { label:'Draft',        color:'bg-slate-100 text-slate-600 border-slate-200' },
  under_review: { label:'Under Review', color:'bg-yellow-50 text-yellow-700 border-yellow-200' },
  approved:     { label:'Approved',     color:'bg-emerald-50 text-emerald-700 border-emerald-200' },
  rejected:     { label:'Rejected',     color:'bg-red-50 text-red-700 border-red-200' },
  archived:     { label:'Archived',     color:'bg-gray-100 text-gray-500 border-gray-200' },
};

const FOLDER_TYPE_ICON = {
  project: Building2, department: Users2, client: Briefcase, vendor: Briefcase,
  employee: UserCircle, general: Folder,
};

const titleCase = s => String(s||'').replace(/_/g,' ').replace(/\b\w/g, c => c.toUpperCase());
function fmtSize(bytes) {
  if (!bytes) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024*1024) return `${(bytes/1024).toFixed(0)} KB`;
  if (bytes < 1024*1024*1024) return `${(bytes/1024/1024).toFixed(1)} MB`;
  return `${(bytes/1024/1024/1024).toFixed(2)} GB`;
}

// Derive a vendor / party name for auto-segregation. Prefers an explicit tag
// (uploads stamp tags like ['vendor-invoice', 'SCP CONCRETE']); falls back to
// the part of the title/filename after the last " - " (e.g. "02272-2025-2026 - SCP CONCRETE").
const VENDOR_TAG_STOPWORDS = new Set(['vendor-invoice', 'invoice', 'store invoices', 'store invoice']);
function vendorOf(doc) {
  const tags = Array.isArray(doc?.tags) ? doc.tags : [];
  const tagVendor = tags.find(t => t && !VENDOR_TAG_STOPWORDS.has(String(t).trim().toLowerCase()));
  if (tagVendor) return String(tagVendor).trim();
  const base = String(doc?.doc_title || doc?.file_name || '').replace(/\.[a-z0-9]+$/i, '');
  const idx = base.lastIndexOf(' - ');
  if (idx !== -1) {
    const v = base.slice(idx + 3).trim().replace(/[.,]+$/, '').trim();
    if (v && !/^\d+$/.test(v)) return v;
  }
  return '';
}

const fileExt = (name = '') => String(name).split('.').pop()?.toLowerCase() || '';
const canInlineBlob = (doc) => ['pdf','png','jpg','jpeg','webp','gif'].includes(fileExt(doc?.file_name || doc?.local_url || doc?.file_type || ''));
const isExcelDoc = (doc) => ['xlsx','xls','xlsm'].includes(fileExt(doc?.file_name || doc?.local_url || doc?.file_type || ''));

async function downloadDmsDocument(doc) {
  const res = await dmsAPI.fileBlob(doc.id);
  const url = URL.createObjectURL(res.data);
  const a = document.createElement('a');
  a.href = url;
  a.download = doc.file_name || 'document';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  dmsAPI.logDownload(doc.id).catch(() => {});
}

const isWordDoc = (doc) => ['docx','doc'].includes(fileExt(doc?.file_name || doc?.local_url || doc?.file_type || ''));

function DocumentPreview({ doc }) {
  const [blobUrl,     setBlobUrl]     = useState('');
  const [loadingDocx, setLoadingDocx] = useState(false);
  const [imgBlobUrl,  setImgBlobUrl]  = useState('');
  const [pdfBlobUrl,  setPdfBlobUrl]  = useState('');
  const ext   = fileExt(doc?.file_name || doc?.local_url || '');
  const isPDF = ext === 'pdf';
  const isImg = ['png','jpg','jpeg','webp','gif'].includes(ext);
  const excel = isExcelDoc(doc);
  const word  = isWordDoc(doc);
  const token = sessionStorage.getItem('accessToken');

  const preview = useQuery({
    queryKey: ['dms-preview', doc?.id],
    queryFn: () => dmsAPI.preview(doc.id).then(r => r.data?.data ?? r.data ?? []).catch(() => []),
    enabled: !!doc?.id && excel,
  });

  useEffect(() => {
    let alive = true;
    let url   = '';
    // PDF — fetch blob with auth header (iframe can't send headers, so a direct URL 401s)
    if (doc?.id && isPDF) {
      dmsAPI.fileBlob(doc.id)
        .then(res => { if (!alive) return; url = URL.createObjectURL(res.data); setPdfBlobUrl(url); })
        .catch(e => toast.error(e?.response?.data?.error || 'Unable to load PDF'));
    }
    // Image — fetch blob for display
    if (doc?.id && isImg) {
      dmsAPI.fileBlob(doc.id)
        .then(res => { if (!alive) return; url = URL.createObjectURL(res.data); setImgBlobUrl(url); })
        .catch(e => toast.error(e?.response?.data?.error || 'Unable to load image'));
    }
    // DOCX — fetch server-rendered HTML via axios (goes through auth interceptor)
    if (doc?.id && word) {
      setLoadingDocx(true);
      dmsAPI.docxBlob(doc.id)
        .then(res => { if (!alive) return; url = URL.createObjectURL(res.data); setBlobUrl(url); })
        .catch(() => toast.error('Unable to load Word preview'))
        .finally(() => { if (alive) setLoadingDocx(false); });
    }
    return () => { alive = false; if (url) URL.revokeObjectURL(url); };
  }, [doc?.id, isPDF, isImg, word]);

  // PDF — blob URL (object URL needs no auth, sidesteps iframe header limitation)
  if (isPDF) {
    return (
      <div className="space-y-3">
        {!pdfBlobUrl ? (
          <div className="h-[620px] flex items-center justify-center border rounded-xl text-slate-400">
            <RefreshCw className="w-5 h-5 animate-spin mr-2" /> Loading PDF…
          </div>
        ) : (
          <iframe
            key={pdfBlobUrl}
            title={doc.file_name}
            src={pdfBlobUrl}
            className="w-full h-[620px] rounded-xl border border-slate-200 bg-white"
          />
        )}
      </div>
    );
  }

  // Word doc — server-rendered HTML in iframe
  if (word) {
    return (
      <div className="space-y-3">
        {loadingDocx || !blobUrl ? (
          <div className="h-[520px] flex items-center justify-center border rounded-xl text-slate-400">
            <RefreshCw className="w-5 h-5 animate-spin mr-2" /> Rendering Word document…
          </div>
        ) : (
          <iframe title={doc.file_name} src={blobUrl} className="w-full h-[620px] rounded-xl border border-slate-200 bg-white" />
        )}
      </div>
    );
  }

  // Image
  if (isImg) {
    return (
      <div className="space-y-3">
        {!imgBlobUrl ? (
          <div className="h-[520px] flex items-center justify-center border rounded-xl text-slate-400">
            <RefreshCw className="w-5 h-5 animate-spin mr-2" /> Loading image
          </div>
        ) : (
          <div className="border rounded-xl bg-slate-50 p-3">
            <img src={imgBlobUrl} alt={doc.file_name} className="max-h-[620px] mx-auto object-contain" />
          </div>
        )}
      </div>
    );
  }

  if (excel) {
    const data = preview.data;
    return (
      <div className="space-y-3">
        {preview.isLoading ? (
          <div className="py-16 text-center text-slate-400"><RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2" />Loading workbook</div>
        ) : preview.isError ? (
          <div className="p-4 border border-red-200 bg-red-50 rounded-xl text-sm text-red-700">Unable to read workbook preview.</div>
        ) : (
          <>
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
              <span>{data?.sheet}</span>
              <span className="text-slate-300">/</span>
              <span>{data?.sheets?.length || 0} sheet(s)</span>
              <span className="ml-auto">Showing first 80 rows</span>
            </div>
            <div className="overflow-auto border rounded-xl max-h-[620px] bg-white">
              <table className="min-w-full text-xs">
                <tbody>
                  {(data?.rows || []).map((row, rIdx) => (
                    <tr key={rIdx} className={rIdx === 0 ? 'bg-slate-100 font-semibold' : 'border-t'}>
                      {(row.length ? row : ['']).map((cell, cIdx) => (
                        <td key={cIdx} className="px-2 py-1.5 border-r border-slate-100 whitespace-pre-wrap min-w-[110px]">
                          {String(cell || '')}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="border rounded-xl bg-slate-50 p-8 text-center">
      <FileText className="w-10 h-10 mx-auto text-slate-300 mb-3" />
      <p className="text-sm font-semibold text-slate-700">Preview not available for this file type.</p>
      <p className="text-xs text-slate-400 mt-1">Download to view the full content.</p>
      <button onClick={() => downloadDmsDocument(doc)}
        className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 text-white text-xs font-medium hover:bg-indigo-700">
        <Download className="w-4 h-4" /> Download File
      </button>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
// UPLOAD MODAL — drag & drop + bulk + metadata
// ════════════════════════════════════════════════════════════════════
function UploadModal({ projects, folders, onClose }) {
  const qc = useQueryClient();
  const [files, setFiles] = useState([]);
  const [dragOver, setDragOver] = useState(false);
  const [meta, setMeta] = useState({
    project_id:'', folder_id:'', doc_type:'general', doc_number:'',
    discipline:'', description:'', tags:'', expiry_date:'', access_level:'internal'
  });
  const inputRef = useRef();
  const set = (k,v) => setMeta(m => ({ ...m, [k]:v }));

  const addFiles = (fileList) => {
    const arr = Array.from(fileList);
    setFiles(prev => [...prev, ...arr]);
  };
  const onDrop = useCallback((e) => {
    e.preventDefault(); setDragOver(false);
    if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
  }, []);

  const uploadMut = useMutation({
    mutationFn: () => {
      const fd = new FormData();
      files.forEach(f => fd.append('files', f));
      Object.entries(meta).forEach(([k,v]) => { if (v) fd.append(k, v); });
      return dmsAPI.upload(fd);
    },
    onSuccess: (r) => {
      toast.success(`${r.data.count} document(s) uploaded`);
      qc.invalidateQueries({ queryKey:['dms-docs'] });
      qc.invalidateQueries({ queryKey:['dms-dashboard'] });
      onClose();
    },
    onError: e => toast.error(e?.response?.data?.error || 'Upload failed'),
  });

  return (
    <div className="fixed inset-0 bg-black/40 flex items-start justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl my-8">
        <div className="flex items-center justify-between p-5 border-b sticky top-0 bg-white rounded-t-xl">
          <h2 className="font-semibold text-gray-800">Upload Documents</h2>
          <button onClick={onClose}><X className="w-5 h-5 text-gray-400 hover:text-gray-600" /></button>
        </div>
        <div className="p-5 space-y-4">
          {/* Drop zone */}
          <div
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            onClick={() => inputRef.current?.click()}
            className={clsx('border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors',
              dragOver ? 'border-indigo-500 bg-indigo-50' : 'border-slate-300 hover:border-indigo-400 hover:bg-slate-50')}>
            <Upload className={clsx('w-10 h-10 mx-auto mb-3', dragOver ? 'text-indigo-500' : 'text-slate-400')} />
            <p className="text-sm font-medium text-slate-700">Drag & drop files here, or click to browse</p>
            <p className="text-xs text-slate-400 mt-1">PDF, Images, DWG, Excel, Word · up to 20 files · 50MB each</p>
            <input ref={inputRef} type="file" multiple className="hidden" onChange={e => addFiles(e.target.files)} />
          </div>

          {/* Selected files */}
          {files.length > 0 && (
            <div className="space-y-1.5 max-h-40 overflow-y-auto">
              {files.map((f, i) => (
                <div key={i} className="flex items-center justify-between p-2 bg-slate-50 rounded-lg text-xs">
                  <div className="flex items-center gap-2 min-w-0">
                    <FileText className="w-4 h-4 text-indigo-400 flex-shrink-0" />
                    <span className="truncate">{f.name}</span>
                    <span className="text-slate-400 flex-shrink-0">{fmtSize(f.size)}</span>
                  </div>
                  <button onClick={() => setFiles(prev => prev.filter((_,idx)=>idx!==i))}
                    className="text-slate-400 hover:text-red-500 flex-shrink-0"><X className="w-3.5 h-3.5" /></button>
                </div>
              ))}
            </div>
          )}

          {/* Metadata */}
          <div className="grid grid-cols-2 gap-3 pt-2 border-t">
            <div><label className="block text-xs font-medium text-gray-600 mb-1">Document Type</label>
              <select value={meta.doc_type} onChange={e=>set('doc_type',e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm">
                {DOC_TYPES.map(t=><option key={t} value={t}>{titleCase(t)}</option>)}</select></div>
            <div><label className="block text-xs font-medium text-gray-600 mb-1">Document Number</label>
              <input value={meta.doc_number} onChange={e=>set('doc_number',e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="DCC-001" /></div>
            <div><label className="block text-xs font-medium text-gray-600 mb-1">Project</label>
              <select value={meta.project_id} onChange={e=>set('project_id',e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm">
                <option value="">None</option>{projects.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
            <div><label className="block text-xs font-medium text-gray-600 mb-1">Folder</label>
              <select value={meta.folder_id} onChange={e=>set('folder_id',e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm">
                <option value="">None</option>{folders.map(f=><option key={f.id} value={f.id}>{f.path || f.folder_name}</option>)}</select></div>
            <div><label className="block text-xs font-medium text-gray-600 mb-1">Discipline</label>
              <input value={meta.discipline} onChange={e=>set('discipline',e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="Civil, MEP…" /></div>
            <div><label className="block text-xs font-medium text-gray-600 mb-1">Access Level</label>
              <select value={meta.access_level} onChange={e=>set('access_level',e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm">
                <option value="public">Public</option><option value="internal">Internal</option>
                <option value="restricted">Restricted</option><option value="confidential">Confidential</option></select></div>
            <div><label className="block text-xs font-medium text-gray-600 mb-1">Expiry Date</label>
              <input type="date" value={meta.expiry_date} onChange={e=>set('expiry_date',e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
            <div><label className="block text-xs font-medium text-gray-600 mb-1">Tags (comma-sep)</label>
              <input value={meta.tags} onChange={e=>set('tags',e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="2026, urgent" /></div>
          </div>
        </div>
        <div className="flex justify-end gap-3 p-5 border-t bg-gray-50 rounded-b-xl sticky bottom-0">
          <button onClick={onClose} className="px-4 py-2 border rounded-lg text-sm">Cancel</button>
          <button onClick={() => uploadMut.mutate()} disabled={!files.length || uploadMut.isPending}
            className="px-5 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 disabled:opacity-50">
            {uploadMut.isPending ? 'Uploading…' : `Upload ${files.length || ''} File(s)`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
// DOCUMENT DETAIL DRAWER — versions, signatures, approvals, audit
// ════════════════════════════════════════════════════════════════════
function DocDetailDrawer({ docId, onClose, onSubmitReview, onAddVersion }) {
  const qc = useQueryClient();
  const [detailTab, setDetailTab] = useState('preview');

  const { data: doc, isLoading } = useQuery({
    queryKey: ['dms-doc', docId],
    queryFn: () => dmsAPI.get(docId).then(r => r.data?.data ?? r.data ?? []).catch(() => []),
    enabled: !!docId,
  });
  const { data: logs = [] } = useQuery({
    queryKey: ['dms-logs', docId],
    queryFn: () => dmsAPI.getLogs(docId).then(r => r.data?.data ?? r.data ?? []).catch(() => []),
    enabled: !!docId && detailTab==='audit',
  });

  const signMut = useMutation({
    mutationFn: (d) => dmsAPI.sign(docId, d),
    onSuccess: () => { toast.success('Document signed'); qc.invalidateQueries({queryKey:['dms-doc',docId]}); },
    onError: e => toast.error(e?.response?.data?.error||'Failed'),
  });

  if (!docId) return null;
  const cfg = doc ? (STATUS_CFG[doc.status] || STATUS_CFG.draft) : STATUS_CFG.draft;

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/30" onClick={onClose} />
      <div className="w-full max-w-5xl bg-white shadow-2xl flex flex-col h-full">
        {isLoading || !doc ? (
          <div className="flex items-center justify-center h-full text-slate-400">
            <RefreshCw className="w-6 h-6 animate-spin" />
          </div>
        ) : (<>
          {/* Header */}
          <div className="p-5 border-b bg-slate-50">
            <div className="flex items-start justify-between">
              <div className="min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <FileText className="w-5 h-5 text-indigo-500" />
                  <span className="font-mono text-xs text-indigo-600">{doc.doc_number || '—'}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${cfg.color}`}>{cfg.label}</span>
                  {doc.is_signed && <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium flex items-center gap-1"><FileSignature className="w-3 h-3" />{doc.signature_count} signed</span>}
                </div>
                <h2 className="text-lg font-semibold text-slate-900 truncate">{doc.doc_title || doc.file_name}</h2>
                <p className="text-xs text-slate-400">{doc.file_name} · Rev {doc.revision || 'A'} · {fmtSize(doc.file_size)}</p>
              </div>
              <button onClick={onClose} className="p-1.5 hover:bg-slate-200 rounded"><X className="w-5 h-5 text-slate-400" /></button>
            </div>
          </div>

          {/* Action bar */}
          <div className="flex items-center gap-2 p-3 border-b">
            {(doc.local_url || doc.onedrive_url) && (
              <button type="button" onClick={() => downloadDmsDocument(doc)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white text-xs rounded-lg hover:bg-indigo-700">
                <Download className="w-3.5 h-3.5" /> Download
              </button>
            )}
            <button onClick={() => signMut.mutate({ signature_type:'approval' })}
              disabled={signMut.isPending}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-700 text-xs rounded-lg hover:bg-blue-100 border border-blue-200">
              <PenTool className="w-3.5 h-3.5" /> Sign
            </button>
            <button onClick={() => onSubmitReview?.(doc)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 text-amber-700 text-xs rounded-lg hover:bg-amber-100 border border-amber-200">
              <Send className="w-3.5 h-3.5" /> Submit Review
            </button>
            <button onClick={() => onAddVersion?.(doc)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 text-slate-700 text-xs rounded-lg hover:bg-slate-100 border border-slate-200">
              <GitBranch className="w-3.5 h-3.5" /> Add Revision
            </button>
          </div>

          {/* Detail tabs */}
          <div className="flex gap-1 px-4 border-b">
            {[['preview','Preview'],['info','Info'],['versions',`Versions (${doc.versions?.length||0})`],['approvals',`Approvals (${doc.approvals?.length||0})`],['signatures',`Signatures (${doc.signatures?.length||0})`],['audit','Audit']].map(([k,l]) => (
              <button key={k} onClick={()=>setDetailTab(k)}
                className={clsx('px-3 py-2.5 text-xs font-medium border-b-2 transition-colors',
                  detailTab===k ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-700')}>
                {l}
              </button>
            ))}
          </div>

          {/* Detail content */}
          <div className="flex-1 overflow-y-auto p-5">
            {detailTab === 'preview' && <DocumentPreview doc={doc} />}

            {detailTab === 'info' && (
              <div className="space-y-3 text-sm">
                {[
                  ['Type', titleCase(doc.doc_type)],
                  ['Discipline', doc.discipline || '—'],
                  ['Project', doc.project_name || '—'],
                  ['Access Level', titleCase(doc.access_level)],
                  ['Expiry Date', doc.expiry_date || '—'],
                  ['Uploaded By', doc.uploaded_by_name],
                  ['Uploaded On', dayjs(doc.created_at).format('DD MMM YYYY HH:mm')],
                  ['Approved By', doc.approved_by_name || '—'],
                  ['Description', doc.description || '—'],
                  ['Tags', (doc.tags||[]).join(', ') || '—'],
                ].map(([l,v]) => (
                  <div key={l} className="flex gap-4 py-1.5 border-b border-slate-50">
                    <span className="text-xs text-slate-400 w-32 flex-shrink-0">{l}</span>
                    <span className="text-xs text-slate-700">{v}</span>
                  </div>
                ))}
              </div>
            )}

            {detailTab === 'versions' && (
              <div className="space-y-2">
                {(doc.versions||[]).length === 0 ? (
                  <p className="text-xs text-slate-400 text-center py-6">No version history. Current is the original.</p>
                ) : (doc.versions||[]).map(v => (
                  <div key={v.id} className="flex items-center justify-between p-3 border rounded-lg">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-indigo-600">v{v.version_no}</span>
                        <span className="text-xs font-medium">Rev {v.revision || '—'}</span>
                      </div>
                      <div className="text-[10px] text-slate-400 mt-0.5">{v.change_summary || 'No summary'}</div>
                      <div className="text-[10px] text-slate-400">{dayjs(v.created_at).format('DD MMM YYYY')}</div>
                    </div>
                    {v.file_url && (
                      <a href={v.file_url} target="_blank" rel="noopener noreferrer" className="text-xs text-indigo-600 hover:underline">View</a>
                    )}
                  </div>
                ))}
              </div>
            )}

            {detailTab === 'approvals' && (
              <div className="space-y-2">
                {(doc.approvals||[]).length === 0 ? (
                  <p className="text-xs text-slate-400 text-center py-6">No approval workflow set.</p>
                ) : (doc.approvals||[]).map(a => (
                  <div key={a.id} className="flex items-center justify-between p-3 border rounded-lg">
                    <div>
                      <div className="text-xs font-medium">{a.approver_name || 'Approver'}</div>
                      <div className="text-[10px] text-slate-400 capitalize">{a.approval_type} · Step {a.sequence_no}</div>
                      {a.comments && <div className="text-[10px] text-slate-500 mt-0.5">"{a.comments}"</div>}
                    </div>
                    <span className={clsx('text-xs px-2 py-0.5 rounded-full font-medium',
                      a.status==='approved' ? 'bg-emerald-100 text-emerald-700' :
                      a.status==='rejected' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700')}>
                      {titleCase(a.status)}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {detailTab === 'signatures' && (
              <div className="space-y-2">
                {(doc.signatures||[]).length === 0 ? (
                  <p className="text-xs text-slate-400 text-center py-6">No signatures yet. Click "Sign" above.</p>
                ) : (doc.signatures||[]).map(s => (
                  <div key={s.id} className="p-3 border rounded-lg bg-blue-50/50">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <FileSignature className="w-4 h-4 text-blue-500" />
                        <span className="text-xs font-medium">{s.signer_name}</span>
                        <span className="text-[10px] text-slate-400">{s.signer_role}</span>
                      </div>
                      <span className={clsx('text-[10px] px-2 py-0.5 rounded-full', s.is_valid ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700')}>
                        {s.is_valid ? '✓ Valid' : 'Invalid'}
                      </span>
                    </div>
                    <div className="text-[10px] text-slate-400 mt-1">
                      {titleCase(s.signature_type)} · {dayjs(s.signed_at).format('DD MMM YYYY HH:mm')}
                    </div>
                    <div className="text-[9px] text-slate-300 font-mono mt-1 truncate">Hash: {s.hash_value}</div>
                  </div>
                ))}
              </div>
            )}

            {detailTab === 'audit' && (
              <div className="space-y-1.5">
                {logs.length === 0 ? (
                  <p className="text-xs text-slate-400 text-center py-6">No activity logged.</p>
                ) : logs.map(l => (
                  <div key={l.id} className="flex items-center gap-3 p-2 text-xs border-b border-slate-50">
                    <span className={clsx('px-2 py-0.5 rounded-full text-[10px] font-medium capitalize',
                      l.action==='approve' ? 'bg-emerald-100 text-emerald-700' :
                      l.action==='delete' ? 'bg-red-100 text-red-700' :
                      l.action==='download' ? 'bg-blue-100 text-blue-700' :
                      l.action==='share' ? 'bg-purple-100 text-purple-700' : 'bg-slate-100 text-slate-600')}>
                      {l.action}
                    </span>
                    <span className="text-slate-600 flex-1">{l.user_name || 'System'}</span>
                    <span className="text-slate-400">{dayjs(l.created_at).format('DD/MM HH:mm')}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>)}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ════════════════════════════════════════════════════════════════════
export default function DMSPage() {
  const qc = useQueryClient();
  const [tab, setTab]         = useState('repository');
  const [search, setSearch]   = useState('');
  const [typeFilter, setType] = useState('');
  const [statusFilter, setStatus] = useState('');
  const [projectFilter, setProjFilter] = useState('');
  const [cat, setCat]         = useState({ kind: 'all' });   // {kind:'all'|'type'|'vendor'|'project'|'month'|'folder', value}
  const [openSec, setOpenSec] = useState({ type: true, vendor: true, project: true, month: false, folder: true });
  const [groupBy, setGroupBy] = useState('none');            // none|vendor|type|project|month
  const [collapsedGroups, setCollapsedGroups] = useState({});
  const [modal, setModal]     = useState(null);
  const [detailId, setDetailId] = useState(null);
  const [reportTab, setReportTab] = useState('register');

  const { data: projects = [] } = useQuery({ queryKey:['projects'], queryFn: () => projectAPI.list().then(r=>r.data?.data??[]) });
  const { data: folders = [] }  = useQuery({ queryKey:['dms-folders'], queryFn: () => dmsAPI.listFolders().then(r => r.data?.data ?? r.data ?? []).catch(() => []) });

  const { data: docs = [], isLoading } = useQuery({
    queryKey: ['dms-docs', typeFilter, statusFilter, search, projectFilter],
    queryFn: () => dmsAPI.list({
      doc_type:typeFilter||undefined, status:statusFilter||undefined,
      search:search||undefined, project_id:projectFilter||undefined
    }).then(r => r.data?.data ?? r.data ?? []).catch(() => []),
    keepPreviousData: true,
  });

  const { data: myApprovals = [] } = useQuery({
    queryKey: ['dms-my-approvals'],
    queryFn: () => dmsAPI.myApprovals().then(r => r.data?.data ?? r.data ?? []).catch(() => []),
    refetchInterval: 30000,
  });

  const { data: dash } = useQuery({ queryKey:['dms-dashboard'], queryFn: () => dmsAPI.dashboard().then(r => r.data?.data ?? r.data ?? []).catch(() => []) });

  const approveMut = useMutation({
    mutationFn: ({ aid, status, comments }) => dmsAPI.actionApproval(aid, { status, comments }),
    onSuccess: (_, { status }) => { toast.success(`Document ${status}`); qc.invalidateQueries({queryKey:['dms-my-approvals']}); qc.invalidateQueries({queryKey:['dms-docs']}); },
    onError: e => toast.error(e?.response?.data?.error||'Failed'),
  });
  const archiveMut = useMutation({
    mutationFn: id => dmsAPI.delete(id),
    onSuccess: () => { toast.success('Archived'); qc.invalidateQueries({queryKey:['dms-docs']}); },
  });

  // Auto-segregation groups derived from the loaded docs (no backend change needed)
  const typeGroups = useMemo(() => {
    const m = {};
    docs.forEach(d => { const t = d.doc_type || 'general'; m[t] = (m[t] || 0) + 1; });
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  }, [docs]);

  const vendorGroups = useMemo(() => {
    const m = {};
    docs.forEach(d => { const v = vendorOf(d); if (v) m[v] = (m[v] || 0) + 1; });
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  }, [docs]);

  const projectGroups = useMemo(() => {
    const m = {};
    docs.forEach(d => { const p = d.project_name || 'No project'; m[p] = (m[p] || 0) + 1; });
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  }, [docs]);

  // By Month — keyed by YYYY-MM for stable sort, labelled "MMM YYYY"
  const monthGroups = useMemo(() => {
    const m = {};
    docs.forEach(d => { const k = d.created_at ? dayjs(d.created_at).format('YYYY-MM') : 'unknown'; m[k] = (m[k] || 0) + 1; });
    return Object.entries(m).sort((a, b) => b[0].localeCompare(a[0]));
  }, [docs]);
  const monthLabel = k => (k === 'unknown' ? 'Unknown date' : dayjs(`${k}-01`).format('MMM YYYY'));

  const visibleDocs = useMemo(() => {
    if (cat.kind === 'type')    return docs.filter(d => (d.doc_type || 'general') === cat.value);
    if (cat.kind === 'vendor')  return docs.filter(d => vendorOf(d) === cat.value);
    if (cat.kind === 'project') return docs.filter(d => (d.project_name || 'No project') === cat.value);
    if (cat.kind === 'month')   return docs.filter(d => (d.created_at ? dayjs(d.created_at).format('YYYY-MM') : 'unknown') === cat.value);
    if (cat.kind === 'folder')  return docs.filter(d => d.folder_id === cat.value);
    return docs;
  }, [docs, cat]);

  // ── Row grouping inside the table ──────────────────────────────────────────
  const groupKeyOf = (d) => {
    if (groupBy === 'vendor')  return vendorOf(d) || 'Unspecified vendor';
    if (groupBy === 'type')    return titleCase(d.doc_type || 'general');
    if (groupBy === 'project') return d.project_name || 'No project';
    if (groupBy === 'month')   return d.created_at ? dayjs(d.created_at).format('YYYY-MM') : 'unknown';
    return '';
  };
  const groupedDocs = useMemo(() => {
    if (groupBy === 'none') return null;
    const m = new Map();
    visibleDocs.forEach(d => {
      const k = groupKeyOf(d);
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(d);
    });
    let entries = Array.from(m.entries());
    entries.sort((a, b) => groupBy === 'month' ? b[0].localeCompare(a[0]) : b[1].length - a[1].length);
    return entries.map(([key, rows]) => ({
      key,
      label: groupBy === 'month' ? monthLabel(key) : key,
      rows,
    }));
  }, [visibleDocs, groupBy]);

  const catLabel = cat.kind === 'all' ? 'All Documents'
    : cat.kind === 'type' ? titleCase(cat.value)
    : cat.kind === 'vendor' ? cat.value
    : cat.kind === 'project' ? cat.value
    : cat.kind === 'month' ? monthLabel(cat.value)
    : (folders.find(f => f.id === cat.value)?.folder_name || 'Folder');
  const s = dash?.stats;

  const renderRow = (d) => {
    const cfg = STATUS_CFG[d.status] || STATUS_CFG.draft;
    const expDays = d.expiry_date ? dayjs(d.expiry_date).diff(dayjs(), 'day') : null;
    return (
      <tr key={d.id} className="border-b last:border-0 hover:bg-slate-50 group cursor-pointer" onClick={()=>setDetailId(d.id)}>
        <td className="py-2 px-3 font-mono text-xs text-indigo-600">{d.doc_number || '—'}</td>
        <td className="py-2 px-3">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-medium text-slate-800 max-w-[180px] truncate">{d.doc_title || d.file_name}</span>
            {d.is_signed && <FileSignature className="w-3 h-3 text-blue-500 flex-shrink-0" />}
            {d.version_count > 0 && <span className="text-[9px] bg-slate-100 text-slate-500 px-1 rounded">v{d.revision_no+1||d.version_count}</span>}
          </div>
          <div className="text-[10px] text-slate-400 truncate">{d.file_name}</div>
        </td>
        <td className="py-2 px-3 text-xs capitalize">{titleCase(d.doc_type)}</td>
        <td className="py-2 px-3 text-xs text-slate-500 max-w-[120px] truncate">{d.project_name || '—'}</td>
        <td className="py-2 px-3 text-xs font-mono">{d.revision || 'A'}</td>
        <td className="py-2 px-3 text-xs">{fmtSize(d.file_size)}</td>
        <td className="py-2 px-3 text-xs">
          {d.expiry_date ? <span className={clsx('font-medium', expDays<0?'text-red-600':expDays<=30?'text-orange-500':'text-slate-500')}>{d.expiry_date}</span> : '—'}
        </td>
        <td className="py-2 px-3"><span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${cfg.color}`}>{cfg.label}</span></td>
        <td className="py-2 px-3" onClick={e=>e.stopPropagation()}>
          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            {(d.local_url || d.onedrive_url) && (
              <button type="button" onClick={()=>downloadDmsDocument(d)}
                className="p-1 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded" title="Download"><Download className="w-3.5 h-3.5" /></button>
            )}
            <button onClick={()=>setModal({type:'review', doc:d})} className="p-1 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded" title="Submit for Review"><Send className="w-3.5 h-3.5" /></button>
            <button onClick={()=>setModal({type:'version', doc:d})} className="p-1 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded" title="Add Revision"><GitBranch className="w-3.5 h-3.5" /></button>
            <button onClick={()=>setModal({type:'share', doc:d})} className="p-1 text-slate-400 hover:text-green-600 hover:bg-green-50 rounded" title="Share"><Share2 className="w-3.5 h-3.5" /></button>
            <button onClick={()=>{ if(window.confirm('Archive?')) archiveMut.mutate(d.id); }} className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded" title="Archive"><Archive className="w-3.5 h-3.5" /></button>
          </div>
        </td>
      </tr>
    );
  };

  return (
    <div className="p-6 md:p-8 max-w-[1400px] mx-auto min-h-screen bg-[#f4f6f9]">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Document Management System</h1>
          <p className="text-sm text-slate-500 mt-0.5">Repository · Version Control · Approval · Signatures · Audit · Reports</p>
        </div>
        <div className="flex items-center gap-2">
          {myApprovals.length > 0 && (
            <button onClick={() => setTab('approvals')} className="flex items-center gap-2 px-3 py-2 bg-orange-50 border border-orange-200 rounded-lg text-sm text-orange-700">
              <Bell className="w-4 h-4" /><strong>{myApprovals.length}</strong> pending
            </button>
          )}
          <button onClick={() => setModal('upload')}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 shadow-sm">
            <Upload className="w-4 h-4" /> Upload
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-white/70 border p-1 rounded-xl w-fit mb-5 flex-wrap">
        {[
          ['repository',`Repository (${docs.length})`],
          ['approvals',`My Approvals (${myApprovals.length})`],
          ['dashboard','Dashboard'],
          ['reports','Reports'],
        ].map(([k,l]) => (
          <button key={k} onClick={()=>setTab(k)}
            className={clsx('px-4 py-1.5 rounded-lg text-sm font-medium transition-colors',
              tab===k ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900')}>
            {l}
          </button>
        ))}
      </div>

      {/* ── DASHBOARD ── */}
      {tab === 'dashboard' && s && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {[
              {label:'Total Docs', value:s.total, color:'text-indigo-600'},
              {label:'Approved', value:s.approved, color:'text-emerald-600'},
              {label:'Under Review', value:s.under_review, color:'text-yellow-600'},
              {label:'Draft', value:s.draft, color:'text-slate-600'},
              {label:'Signed', value:s.signed, color:'text-blue-600'},
              {label:'Expiring 30d', value:s.expiring_soon, color:'text-red-600'},
            ].map(c=>(
              <div key={c.label} className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
                <div className={`text-2xl font-bold ${c.color}`}>{c.value}</div>
                <div className="text-xs text-slate-500 mt-0.5">{c.label}</div>
              </div>
            ))}
          </div>

          {/* Storage + by-type */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
              <h3 className="text-sm font-semibold text-slate-800 mb-3 flex items-center gap-2"><HardDrive className="w-4 h-4 text-indigo-500" /> Storage Utilization</h3>
              <div className="text-3xl font-bold text-indigo-600">{fmtSize(s.total_size_bytes)}</div>
              <div className="text-xs text-slate-400 mt-1">across {s.total} documents · {s.doc_types} types · {s.projects} projects</div>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm lg:col-span-2">
              <h3 className="text-sm font-semibold text-slate-800 mb-3">Documents by Type</h3>
              <div className="space-y-2">
                {(dash.by_type||[]).slice(0,6).map(t=>{
                  const pct = s.total ? Math.round((t.c/s.total)*100) : 0;
                  return (
                    <div key={t.doc_type}>
                      <div className="flex justify-between text-xs text-slate-600 mb-0.5">
                        <span className="capitalize">{titleCase(t.doc_type)}</span>
                        <span className="font-medium">{t.c} · {fmtSize(t.size)}</span>
                      </div>
                      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full bg-indigo-500 rounded-full" style={{width:`${pct}%`}} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Expiring */}
            <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
              <h3 className="text-sm font-semibold text-slate-800 mb-3 flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-orange-500" /> Expiring Documents</h3>
              {(dash.expiring_docs||[]).length === 0 ? <p className="text-xs text-slate-400 py-4 text-center">None expiring</p> : (
                <div className="space-y-1.5">
                  {dash.expiring_docs.map(d=>(
                    <div key={d.id} onClick={()=>setDetailId(d.id)} className="flex items-center justify-between p-2 hover:bg-slate-50 rounded-lg text-xs cursor-pointer">
                      <span className="truncate">{d.doc_number} · {d.doc_title}</span>
                      <span className={clsx('font-bold flex-shrink-0', d.days_until<=0?'text-red-600':'text-orange-600')}>
                        {d.days_until<=0?`${Math.abs(d.days_until)}d ago`:`${d.days_until}d`}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {/* Recent activity */}
            <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
              <h3 className="text-sm font-semibold text-slate-800 mb-3 flex items-center gap-2"><Activity className="w-4 h-4 text-blue-500" /> Recent Activity</h3>
              <div className="space-y-1.5 max-h-64 overflow-y-auto">
                {(dash.recent_activity||[]).map((a,i)=>(
                  <div key={i} className="flex items-center gap-2 text-xs py-1">
                    <span className={clsx('px-1.5 py-0.5 rounded text-[10px] capitalize',
                      a.action==='approve'?'bg-emerald-100 text-emerald-700':a.action==='upload'?'bg-blue-100 text-blue-700':'bg-slate-100 text-slate-600')}>{a.action}</span>
                    <span className="text-slate-600 flex-1 truncate">{a.user_name} · {a.doc_title || a.doc_number}</span>
                    <span className="text-slate-400">{dayjs(a.created_at).format('DD/MM')}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── MY APPROVALS ── */}
      {tab === 'approvals' && (
        <div className="space-y-3">
          {myApprovals.length === 0 ? (
            <div className="bg-white border rounded-xl p-12 text-center">
              <CheckCircle2 className="w-10 h-10 text-emerald-300 mx-auto mb-3" />
              <p className="text-slate-400">No documents pending your approval</p>
            </div>
          ) : myApprovals.map(ap => (
            <div key={ap.id} className="bg-white border rounded-xl p-4 shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 cursor-pointer" onClick={()=>setDetailId(ap.document_id)}>
                  <div className="flex items-center gap-2 mb-1">
                    <FileText className="w-4 h-4 text-indigo-500" />
                    <span className="font-mono text-xs text-indigo-600">{ap.doc_number}</span>
                    <span className="text-sm font-medium text-slate-800">{ap.doc_title}</span>
                    <span className="text-xs text-slate-400 capitalize">{titleCase(ap.doc_type)}</span>
                  </div>
                  <div className="text-xs text-slate-500">{titleCase(ap.approval_type)} · {dayjs(ap.created_at).format('DD/MM/YYYY')}</div>
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  <button onClick={()=>approveMut.mutate({aid:ap.id, status:'approved', comments:''})} disabled={approveMut.isPending}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white text-xs rounded-lg hover:bg-emerald-700">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Approve
                  </button>
                  <button onClick={()=>{ const c=window.prompt('Reason for rejection?'); if(c!==null) approveMut.mutate({aid:ap.id, status:'rejected', comments:c}); }} disabled={approveMut.isPending}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 text-red-700 text-xs rounded-lg hover:bg-red-100 border border-red-200">
                    <X className="w-3.5 h-3.5" /> Reject
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── REPOSITORY ── */}
      {tab === 'repository' && (
        <div className="flex gap-5">
          {/* Browse / segregation sidebar */}
          <div className="w-60 flex-shrink-0 hidden lg:block">
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b">
                <span className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Browse</span>
                <button onClick={()=>setModal('folder')} title="New folder" className="text-slate-400 hover:text-indigo-600"><Plus className="w-4 h-4" /></button>
              </div>
              <div className="p-2 max-h-[70vh] overflow-y-auto">
                {/* All */}
                <button onClick={()=>setCat({ kind:'all' })}
                  className={clsx('flex items-center gap-2 w-full px-2 py-1.5 rounded-lg text-xs', cat.kind==='all' ? 'bg-indigo-50 text-indigo-700 font-medium' : 'text-slate-600 hover:bg-slate-50')}>
                  <FolderOpen className="w-4 h-4" /> All Documents
                  <span className="ml-auto text-slate-400">{docs.length}</span>
                </button>

                {/* By Type */}
                {typeGroups.length > 0 && (
                  <div className="mt-1">
                    <button onClick={()=>setOpenSec(o=>({...o, type:!o.type}))}
                      className="flex items-center gap-1.5 w-full px-2 py-1.5 rounded-lg text-[10px] font-semibold uppercase tracking-wider text-slate-400 hover:text-slate-600">
                      {openSec.type ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                      <Layers className="w-3.5 h-3.5" /> By Type
                      <span className="ml-auto">{typeGroups.length}</span>
                    </button>
                    {openSec.type && typeGroups.map(([t, n]) => (
                      <button key={t} onClick={()=>setCat({ kind:'type', value:t })}
                        className={clsx('flex items-center gap-2 w-full pl-7 pr-2 py-1.5 rounded-lg text-xs', cat.kind==='type'&&cat.value===t ? 'bg-indigo-50 text-indigo-700 font-medium' : 'text-slate-600 hover:bg-slate-50')}>
                        <span className="truncate">{titleCase(t)}</span>
                        <span className="ml-auto text-slate-400 flex-shrink-0">{n}</span>
                      </button>
                    ))}
                  </div>
                )}

                {/* By Vendor / Party */}
                {vendorGroups.length > 0 && (
                  <div className="mt-1">
                    <button onClick={()=>setOpenSec(o=>({...o, vendor:!o.vendor}))}
                      className="flex items-center gap-1.5 w-full px-2 py-1.5 rounded-lg text-[10px] font-semibold uppercase tracking-wider text-slate-400 hover:text-slate-600">
                      {openSec.vendor ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                      <Tag className="w-3.5 h-3.5" /> By Vendor
                      <span className="ml-auto">{vendorGroups.length}</span>
                    </button>
                    {openSec.vendor && vendorGroups.map(([v, n]) => (
                      <button key={v} onClick={()=>setCat({ kind:'vendor', value:v })} title={v}
                        className={clsx('flex items-center gap-2 w-full pl-7 pr-2 py-1.5 rounded-lg text-xs', cat.kind==='vendor'&&cat.value===v ? 'bg-indigo-50 text-indigo-700 font-medium' : 'text-slate-600 hover:bg-slate-50')}>
                        <span className="truncate">{v}</span>
                        <span className="ml-auto text-slate-400 flex-shrink-0">{n}</span>
                      </button>
                    ))}
                  </div>
                )}

                {/* By Project */}
                {projectGroups.length > 0 && (
                  <div className="mt-1">
                    <button onClick={()=>setOpenSec(o=>({...o, project:!o.project}))}
                      className="flex items-center gap-1.5 w-full px-2 py-1.5 rounded-lg text-[10px] font-semibold uppercase tracking-wider text-slate-400 hover:text-slate-600">
                      {openSec.project ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                      <Building2 className="w-3.5 h-3.5" /> By Project
                      <span className="ml-auto">{projectGroups.length}</span>
                    </button>
                    {openSec.project && projectGroups.map(([p, n]) => (
                      <button key={p} onClick={()=>setCat({ kind:'project', value:p })} title={p}
                        className={clsx('flex items-center gap-2 w-full pl-7 pr-2 py-1.5 rounded-lg text-xs', cat.kind==='project'&&cat.value===p ? 'bg-indigo-50 text-indigo-700 font-medium' : 'text-slate-600 hover:bg-slate-50')}>
                        <span className="truncate">{p}</span>
                        <span className="ml-auto text-slate-400 flex-shrink-0">{n}</span>
                      </button>
                    ))}
                  </div>
                )}

                {/* By Month */}
                {monthGroups.length > 0 && (
                  <div className="mt-1">
                    <button onClick={()=>setOpenSec(o=>({...o, month:!o.month}))}
                      className="flex items-center gap-1.5 w-full px-2 py-1.5 rounded-lg text-[10px] font-semibold uppercase tracking-wider text-slate-400 hover:text-slate-600">
                      {openSec.month ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                      <Clock className="w-3.5 h-3.5" /> By Month
                      <span className="ml-auto">{monthGroups.length}</span>
                    </button>
                    {openSec.month && monthGroups.map(([k, n]) => (
                      <button key={k} onClick={()=>setCat({ kind:'month', value:k })}
                        className={clsx('flex items-center gap-2 w-full pl-7 pr-2 py-1.5 rounded-lg text-xs', cat.kind==='month'&&cat.value===k ? 'bg-indigo-50 text-indigo-700 font-medium' : 'text-slate-600 hover:bg-slate-50')}>
                        <span className="truncate">{monthLabel(k)}</span>
                        <span className="ml-auto text-slate-400 flex-shrink-0">{n}</span>
                      </button>
                    ))}
                  </div>
                )}

                {/* Manual folders */}
                <div className="mt-1">
                  <button onClick={()=>setOpenSec(o=>({...o, folder:!o.folder}))}
                    className="flex items-center gap-1.5 w-full px-2 py-1.5 rounded-lg text-[10px] font-semibold uppercase tracking-wider text-slate-400 hover:text-slate-600">
                    {openSec.folder ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                    <Folder className="w-3.5 h-3.5" /> Folders
                    <span className="ml-auto">{folders.length}</span>
                  </button>
                  {openSec.folder && folders.map(f => {
                    const Icon = FOLDER_TYPE_ICON[f.folder_type] || Folder;
                    return (
                      <button key={f.id} onClick={()=>setCat({ kind:'folder', value:f.id })}
                        className={clsx('flex items-center gap-2 w-full pl-7 pr-2 py-1.5 rounded-lg text-xs', cat.kind==='folder'&&cat.value===f.id ? 'bg-indigo-50 text-indigo-700 font-medium' : 'text-slate-600 hover:bg-slate-50')}>
                        <Icon className="w-4 h-4 flex-shrink-0" />
                        <span className="truncate">{f.folder_name}</span>
                        <span className="ml-auto text-slate-400 flex-shrink-0">{f.doc_count}</span>
                      </button>
                    );
                  })}
                  {openSec.folder && folders.length === 0 && <p className="text-[10px] text-slate-400 pl-7 py-1.5">No folders yet</p>}
                </div>
              </div>
            </div>
          </div>

          {/* Main */}
          <div className="flex-1 min-w-0">
            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-3 mb-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                <input value={search} onChange={e=>setSearch(e.target.value)}
                  className="pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-lg text-sm w-full shadow-sm"
                  placeholder="Search title, number, filename, content…" />
              </div>
              <select value={projectFilter} onChange={e=>setProjFilter(e.target.value)} className="bg-white border rounded-lg px-3 py-2 text-sm shadow-sm">
                <option value="">All Projects</option>{projects.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <select value={typeFilter} onChange={e=>setType(e.target.value)} className="bg-white border rounded-lg px-3 py-2 text-sm shadow-sm">
                <option value="">All Types</option>{DOC_TYPES.map(t=><option key={t} value={t}>{titleCase(t)}</option>)}
              </select>
              <select value={statusFilter} onChange={e=>setStatus(e.target.value)} className="bg-white border rounded-lg px-3 py-2 text-sm shadow-sm">
                <option value="">All Status</option>{Object.entries(STATUS_CFG).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
              </select>
              <select value={groupBy} onChange={e=>{ setGroupBy(e.target.value); setCollapsedGroups({}); }}
                title="Group rows" className="bg-white border rounded-lg px-3 py-2 text-sm shadow-sm">
                <option value="none">No grouping</option>
                <option value="vendor">Group by Vendor</option>
                <option value="type">Group by Type</option>
                <option value="project">Group by Project</option>
                <option value="month">Group by Month</option>
              </select>
            </div>

            {/* Active category chip */}
            {cat.kind !== 'all' && (
              <div className="flex items-center gap-2 mb-3 text-xs">
                <span className="text-slate-400">Showing:</span>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-full font-medium">
                  {cat.kind === 'type' ? <Layers className="w-3 h-3" /> : cat.kind === 'vendor' ? <Tag className="w-3 h-3" /> : cat.kind === 'project' ? <Building2 className="w-3 h-3" /> : cat.kind === 'month' ? <Clock className="w-3 h-3" /> : <Folder className="w-3 h-3" />}
                  {catLabel}
                  <span className="text-indigo-400">· {visibleDocs.length}</span>
                  <button onClick={()=>setCat({ kind:'all' })} className="hover:text-indigo-900"><X className="w-3 h-3" /></button>
                </span>
              </div>
            )}

            {isLoading ? <div className="text-center py-12 text-slate-400"><RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2" />Loading…</div> : (
              <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 border-b">
                      <tr>{['Doc#','Title','Type','Project','Rev','Size','Expiry','Status','Actions'].map(h=>(
                        <th key={h} className="text-left py-3 px-3 text-xs font-medium text-slate-500 whitespace-nowrap">{h}</th>
                      ))}</tr>
                    </thead>
                    <tbody>
                      {groupBy === 'none'
                        ? visibleDocs.map(renderRow)
                        : groupedDocs.map(g => {
                            const collapsed = collapsedGroups[g.key];
                            const GIcon = groupBy==='vendor' ? Tag : groupBy==='type' ? Layers : groupBy==='project' ? Building2 : Clock;
                            return (
                              <React.Fragment key={g.key}>
                                <tr className="bg-slate-100/70 border-b cursor-pointer hover:bg-slate-100"
                                  onClick={()=>setCollapsedGroups(c=>({ ...c, [g.key]: !c[g.key] }))}>
                                  <td colSpan={9} className="py-2 px-3">
                                    <div className="flex items-center gap-2 text-xs font-semibold text-slate-700">
                                      {collapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                                      <GIcon className="w-3.5 h-3.5 text-slate-400" />
                                      <span>{g.label}</span>
                                      <span className="text-slate-400 font-normal">· {g.rows.length} doc{g.rows.length!==1?'s':''}</span>
                                    </div>
                                  </td>
                                </tr>
                                {!collapsed && g.rows.map(renderRow)}
                              </React.Fragment>
                            );
                          })}
                      {visibleDocs.length === 0 && (
                        <tr><td colSpan={9} className="text-center py-10 text-slate-400">
                          <FolderOpen className="w-8 h-8 mx-auto mb-2 opacity-30" />No documents found
                        </td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── REPORTS ── */}
      {tab === 'reports' && (
        <DMSReports reportTab={reportTab} setReportTab={setReportTab} projects={projects} />
      )}

      {/* Modals & drawers */}
      {modal === 'upload' && <UploadModal projects={projects} folders={folders} onClose={()=>setModal(null)} />}
      {modal === 'folder' && <FolderModal projects={projects} folders={folders} onClose={()=>setModal(null)} />}
      {modal?.type === 'share' && <ShareModal doc={modal.doc} onClose={()=>setModal(null)} />}
      {modal?.type === 'review' && <SubmitReviewModal doc={modal.doc} onClose={()=>setModal(null)} />}
      {modal?.type === 'version' && <RevisionModal doc={modal.doc} onClose={()=>setModal(null)} />}
      {detailId && <DocDetailDrawer
        docId={detailId}
        onClose={()=>setDetailId(null)}
        onSubmitReview={(doc)=>setModal({type:'review', doc})}
        onAddVersion={(doc)=>setModal({type:'version', doc})}
      />}
    </div>
  );
}

// ── Folder create modal ──
function FolderModal({ projects, folders, onClose }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ folder_name:'', folder_type:'general', parent_id:'', project_id:'', description:'' });
  const set = (k,v) => setForm(f=>({...f,[k]:v}));
  const mut = useMutation({
    mutationFn: d => dmsAPI.createFolder(d),
    onSuccess: () => { toast.success('Folder created'); qc.invalidateQueries({queryKey:['dms-folders']}); onClose(); },
    onError: e => toast.error(e?.response?.data?.error||'Failed'),
  });
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between p-5 border-b">
          <h2 className="font-semibold text-gray-800">New Folder</h2>
          <button onClick={onClose}><X className="w-5 h-5 text-gray-400" /></button>
        </div>
        <div className="p-5 space-y-3">
          <div><label className="block text-xs font-medium text-gray-600 mb-1">Folder Name *</label>
            <input value={form.folder_name} onChange={e=>set('folder_name',e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
          <div><label className="block text-xs font-medium text-gray-600 mb-1">Folder Type</label>
            <select value={form.folder_type} onChange={e=>set('folder_type',e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm">
              {['project','department','client','vendor','employee','general'].map(t=><option key={t} value={t}>{titleCase(t)}</option>)}</select></div>
          <div><label className="block text-xs font-medium text-gray-600 mb-1">Parent Folder</label>
            <select value={form.parent_id} onChange={e=>set('parent_id',e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm">
              <option value="">None (Root)</option>{folders.map(f=><option key={f.id} value={f.id}>{f.path||f.folder_name}</option>)}</select></div>
          {form.folder_type==='project' && (
            <div><label className="block text-xs font-medium text-gray-600 mb-1">Link to Project</label>
              <select value={form.project_id} onChange={e=>set('project_id',e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm">
                <option value="">None</option>{projects.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
          )}
        </div>
        <div className="flex justify-end gap-3 p-5 border-t bg-gray-50">
          <button onClick={onClose} className="px-4 py-2 border rounded-lg text-sm">Cancel</button>
          <button onClick={()=>mut.mutate(form)} disabled={!form.folder_name || mut.isPending} className="px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 disabled:opacity-50">Create</button>
        </div>
      </div>
    </div>
  );
}

// ── Share modal ──
function ShareModal({ doc, onClose }) {
  const [perm, setPerm] = useState('view');
  const [hours, setHours] = useState(72);
  const [link, setLink] = useState('');
  const create = async () => {
    try {
      const r = await dmsAPI.shareDoc(doc.id, { permissions:perm, expires_hours:Number(hours) });
      setLink(r.data.share_url);
      await navigator.clipboard.writeText(r.data.share_url);
      toast.success('Link copied to clipboard');
    } catch { toast.error('Failed to create share link'); }
  };
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold">Share Document</h2>
          <button onClick={onClose}><X className="w-5 h-5 text-gray-400" /></button>
        </div>
        <p className="text-sm text-slate-600 mb-4">Secure link for: <strong>{doc.doc_title || doc.file_name}</strong></p>
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div><label className="block text-xs font-medium text-gray-600 mb-1">Permission</label>
            <select value={perm} onChange={e=>setPerm(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm">
              <option value="view">View Only</option><option value="download">View + Download</option></select></div>
          <div><label className="block text-xs font-medium text-gray-600 mb-1">Expires In (hours)</label>
            <input type="number" value={hours} onChange={e=>setHours(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
        </div>
        {link && <div className="p-2 bg-slate-50 rounded-lg text-xs text-slate-600 break-all mb-4">{link}</div>}
        <button onClick={create} className="w-full px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 mb-2">
          {link ? 'Regenerate & Copy Link' : 'Generate & Copy Link'}
        </button>
        <button onClick={onClose} className="w-full px-4 py-2 border rounded-lg text-sm text-gray-600">Close</button>
      </div>
    </div>
  );
}

// ── Reports section ──
function SubmitReviewModal({ doc, onClose }) {
  const qc = useQueryClient();
  const [selected, setSelected] = useState([]);
  const { data: users = [], isLoading } = useQuery({
    queryKey: ['dms-users'],
    queryFn: () => dmsAPI.users().then(r => r.data?.data || r.data || []),
  });
  const mut = useMutation({
    mutationFn: () => dmsAPI.submitForReview(doc.id, {
      approvers: selected.map((user_id, index) => ({
        user_id,
        sequence_no: index + 1,
        approval_type: 'review',
      })),
    }),
    onSuccess: () => {
      toast.success('Submitted for review');
      qc.invalidateQueries({ queryKey:['dms-docs'] });
      qc.invalidateQueries({ queryKey:['dms-dashboard'] });
      qc.invalidateQueries({ queryKey:['dms-doc', doc.id] });
      qc.invalidateQueries({ queryKey:['dms-my-approvals'] });
      onClose();
    },
    onError: e => toast.error(e?.response?.data?.error || 'Failed to submit review'),
  });
  const toggleUser = (id) => {
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg">
        <div className="flex items-center justify-between p-5 border-b">
          <div>
            <h2 className="font-semibold text-slate-900">Submit for Review</h2>
            <p className="text-xs text-slate-500 mt-1 truncate max-w-md">{doc.doc_title || doc.file_name}</p>
          </div>
          <button onClick={onClose}><X className="w-5 h-5 text-gray-400" /></button>
        </div>
        <div className="p-5">
          <label className="block text-xs font-semibold text-slate-600 mb-2">Select Approvers</label>
          <div className="border rounded-xl max-h-72 overflow-y-auto divide-y">
            {isLoading ? (
              <div className="p-5 text-center text-xs text-slate-400"><RefreshCw className="w-4 h-4 animate-spin mx-auto mb-2" />Loading users</div>
            ) : users.length === 0 ? (
              <div className="p-5 text-center text-xs text-slate-400">No users available</div>
            ) : users.map(user => (
              <label key={user.id} className="flex items-center gap-3 p-3 hover:bg-slate-50 cursor-pointer">
                <input type="checkbox" checked={selected.includes(user.id)} onChange={() => toggleUser(user.id)} />
                <div className="min-w-0">
                  <div className="text-sm font-medium text-slate-800 truncate">{user.name || user.email}</div>
                  <div className="text-[11px] text-slate-400 truncate">{user.email} {user.role ? `- ${titleCase(user.role)}` : ''}</div>
                </div>
              </label>
            ))}
          </div>
          {selected.length > 0 && (
            <p className="text-xs text-slate-500 mt-2">{selected.length} approver(s) selected. Approval order follows selection order.</p>
          )}
        </div>
        <div className="flex justify-end gap-3 p-5 border-t bg-gray-50 rounded-b-xl">
          <button onClick={onClose} className="px-4 py-2 border rounded-lg text-sm">Cancel</button>
          <button onClick={() => mut.mutate()} disabled={selected.length === 0 || mut.isPending}
            className="px-4 py-2 bg-amber-600 text-white text-sm rounded-lg hover:bg-amber-700 disabled:opacity-50">
            {mut.isPending ? 'Submitting...' : 'Submit Review'}
          </button>
        </div>
      </div>
    </div>
  );
}

function RevisionModal({ doc, onClose }) {
  const qc = useQueryClient();
  const [file, setFile] = useState(null);
  const [form, setForm] = useState({
    revision: doc.revision ? `${doc.revision}` : '',
    change_summary: '',
  });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const mut = useMutation({
    mutationFn: () => {
      const fd = new FormData();
      if (file) fd.append('file', file);
      if (!file) fd.append('file_name', doc.file_name || 'revision');
      fd.append('revision', form.revision || '');
      fd.append('change_summary', form.change_summary || '');
      return dmsAPI.addVersion(doc.id, fd);
    },
    onSuccess: () => {
      toast.success('Revision added');
      qc.invalidateQueries({ queryKey:['dms-docs'] });
      qc.invalidateQueries({ queryKey:['dms-dashboard'] });
      qc.invalidateQueries({ queryKey:['dms-doc', doc.id] });
      onClose();
    },
    onError: e => toast.error(e?.response?.data?.error || 'Failed to add revision'),
  });

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg">
        <div className="flex items-center justify-between p-5 border-b">
          <div>
            <h2 className="font-semibold text-slate-900">Add Revision</h2>
            <p className="text-xs text-slate-500 mt-1 truncate max-w-md">{doc.doc_title || doc.file_name}</p>
          </div>
          <button onClick={onClose}><X className="w-5 h-5 text-gray-400" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Revision</label>
            <input value={form.revision} onChange={e => set('revision', e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="A1 / R1 / Rev-02" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Revised File</label>
            <label className="flex items-center justify-center gap-2 border-2 border-dashed border-slate-300 rounded-xl p-6 cursor-pointer hover:border-indigo-400 hover:bg-slate-50">
              <UploadCloud className="w-5 h-5 text-indigo-500" />
              <span className="text-sm font-medium text-slate-700">{file ? file.name : 'Choose revised document'}</span>
              <input type="file" className="hidden" onChange={e => setFile(e.target.files?.[0] || null)} />
            </label>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Change Summary</label>
            <textarea value={form.change_summary} onChange={e => set('change_summary', e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm min-h-[90px]" placeholder="What changed in this revision?" />
          </div>
        </div>
        <div className="flex justify-end gap-3 p-5 border-t bg-gray-50 rounded-b-xl">
          <button onClick={onClose} className="px-4 py-2 border rounded-lg text-sm">Cancel</button>
          <button onClick={() => mut.mutate()} disabled={mut.isPending}
            className="px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 disabled:opacity-50">
            {mut.isPending ? 'Saving...' : 'Add Revision'}
          </button>
        </div>
      </div>
    </div>
  );
}

function DMSReports({ reportTab, setReportTab, projects }) {
  const { data: register = [] }  = useQuery({ queryKey:['dms-rpt-register'], queryFn: () => dmsAPI.reportRegister().then(r => r.data?.data ?? r.data ?? []).catch(() => []), enabled: reportTab==='register' });
  const { data: revision = [] }  = useQuery({ queryKey:['dms-rpt-revision'], queryFn: () => dmsAPI.reportRevision().then(r => r.data?.data ?? r.data ?? []).catch(() => []), enabled: reportTab==='revision' });
  const { data: approval = [] }  = useQuery({ queryKey:['dms-rpt-approval'], queryFn: () => dmsAPI.reportApproval().then(r => r.data?.data ?? r.data ?? []).catch(() => []), enabled: reportTab==='approval' });
  const { data: audit = [] }     = useQuery({ queryKey:['dms-rpt-audit'], queryFn: () => dmsAPI.reportAudit().then(r => r.data?.data ?? r.data ?? []).catch(() => []), enabled: reportTab==='audit' });
  const { data: activity = [] }  = useQuery({ queryKey:['dms-rpt-activity'], queryFn: () => dmsAPI.reportUserActivity().then(r => r.data?.data ?? r.data ?? []).catch(() => []), enabled: reportTab==='activity' });

  const exportCSV = (rows, name) => {
    if (!rows.length) return;
    const headers = Object.keys(rows[0]);
    const csv = [headers.join(','), ...rows.map(r => headers.map(h => `"${String(r[h]??'').replace(/"/g,'""')}"`).join(','))].join('\n');
    const blob = new Blob([csv], {type:'text/csv'}); const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href=url; a.download=`${name}.csv`; a.click();
  };

  const REPORTS = [['register','Document Register'],['revision','Revision Report'],['approval','Approval Status'],['audit','Audit Trail'],['activity','User Activity']];

  return (
    <div>
      <div className="flex gap-1 flex-wrap mb-4">
        {REPORTS.map(([k,l]) => (
          <button key={k} onClick={()=>setReportTab(k)}
            className={clsx('px-3 py-1.5 rounded-lg text-xs font-medium border transition-all',
              reportTab===k ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300')}>
            {l}
          </button>
        ))}
      </div>

      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <span className="text-sm font-semibold text-slate-700">{REPORTS.find(r=>r[0]===reportTab)?.[1]}</span>
          <button onClick={()=>{
            const data = {register, revision, approval, audit, activity}[reportTab];
            exportCSV(data, `dms-${reportTab}`);
          }} className="flex items-center gap-1.5 px-3 py-1.5 border rounded-lg text-xs hover:bg-slate-50">
            <Download className="w-3.5 h-3.5" /> Export CSV
          </button>
        </div>
        <div className="overflow-x-auto max-h-[60vh]">
          {reportTab === 'register' && (
            <table className="w-full text-xs">
              <thead className="bg-slate-50 border-b sticky top-0"><tr>{['Doc#','Title','Type','Status','Project','Rev','Versions','Uploaded By','Date'].map(h=><th key={h} className="text-left py-2 px-3 font-medium text-slate-500">{h}</th>)}</tr></thead>
              <tbody>{register.map(d=>(
                <tr key={d.id} className="border-b last:border-0 hover:bg-slate-50">
                  <td className="py-2 px-3 font-mono text-indigo-600">{d.doc_number||'—'}</td>
                  <td className="py-2 px-3">{d.doc_title}</td><td className="py-2 px-3 capitalize">{titleCase(d.doc_type)}</td>
                  <td className="py-2 px-3"><span className={`px-1.5 py-0.5 rounded-full border ${(STATUS_CFG[d.status]||STATUS_CFG.draft).color}`}>{titleCase(d.status)}</span></td>
                  <td className="py-2 px-3">{d.project_name||'—'}</td><td className="py-2 px-3 font-mono">{d.revision||'A'}</td>
                  <td className="py-2 px-3">{d.version_count}</td><td className="py-2 px-3">{d.uploaded_by_name}</td>
                  <td className="py-2 px-3">{dayjs(d.created_at).format('DD/MM/YY')}</td>
                </tr>
              ))}{!register.length && <tr><td colSpan={9} className="text-center py-8 text-slate-400">No data</td></tr>}</tbody>
            </table>
          )}
          {reportTab === 'revision' && (
            <table className="w-full text-xs">
              <thead className="bg-slate-50 border-b sticky top-0"><tr>{['Doc#','Title','Type','Current Rev','Total Revisions','Last Revised','Project'].map(h=><th key={h} className="text-left py-2 px-3 font-medium text-slate-500">{h}</th>)}</tr></thead>
              <tbody>{revision.map(d=>(
                <tr key={d.id} className="border-b last:border-0 hover:bg-slate-50">
                  <td className="py-2 px-3 font-mono text-indigo-600">{d.doc_number||'—'}</td><td className="py-2 px-3">{d.doc_title}</td>
                  <td className="py-2 px-3 capitalize">{titleCase(d.doc_type)}</td><td className="py-2 px-3 font-mono font-bold">{d.revision}</td>
                  <td className="py-2 px-3">{d.total_revisions}</td><td className="py-2 px-3">{d.last_revised?dayjs(d.last_revised).format('DD/MM/YY'):'—'}</td>
                  <td className="py-2 px-3">{d.project_name||'—'}</td>
                </tr>
              ))}{!revision.length && <tr><td colSpan={7} className="text-center py-8 text-slate-400">No revised documents</td></tr>}</tbody>
            </table>
          )}
          {reportTab === 'approval' && (
            <table className="w-full text-xs">
              <thead className="bg-slate-50 border-b sticky top-0"><tr>{['Doc#','Title','Status','Approvers','Approved','Pending','Approved By','Date'].map(h=><th key={h} className="text-left py-2 px-3 font-medium text-slate-500">{h}</th>)}</tr></thead>
              <tbody>{approval.map(d=>(
                <tr key={d.id} className="border-b last:border-0 hover:bg-slate-50">
                  <td className="py-2 px-3 font-mono text-indigo-600">{d.doc_number||'—'}</td><td className="py-2 px-3">{d.doc_title}</td>
                  <td className="py-2 px-3"><span className={`px-1.5 py-0.5 rounded-full border ${(STATUS_CFG[d.status]||STATUS_CFG.draft).color}`}>{titleCase(d.status)}</span></td>
                  <td className="py-2 px-3">{d.total_approvers}</td><td className="py-2 px-3 text-emerald-600">{d.approved_count}</td>
                  <td className="py-2 px-3 text-yellow-600">{d.pending_count}</td><td className="py-2 px-3">{d.approved_by_name||'—'}</td>
                  <td className="py-2 px-3">{d.approved_at?dayjs(d.approved_at).format('DD/MM/YY'):'—'}</td>
                </tr>
              ))}{!approval.length && <tr><td colSpan={8} className="text-center py-8 text-slate-400">No data</td></tr>}</tbody>
            </table>
          )}
          {reportTab === 'audit' && (
            <table className="w-full text-xs">
              <thead className="bg-slate-50 border-b sticky top-0"><tr>{['Action','User','Document','Type','IP','Timestamp'].map(h=><th key={h} className="text-left py-2 px-3 font-medium text-slate-500">{h}</th>)}</tr></thead>
              <tbody>{audit.map(l=>(
                <tr key={l.id} className="border-b last:border-0 hover:bg-slate-50">
                  <td className="py-2 px-3"><span className="px-1.5 py-0.5 rounded bg-slate-100 capitalize">{l.action}</span></td>
                  <td className="py-2 px-3">{l.user_name||'System'}</td><td className="py-2 px-3">{l.doc_title||l.doc_number}</td>
                  <td className="py-2 px-3 capitalize">{titleCase(l.doc_type)}</td><td className="py-2 px-3 font-mono text-slate-400">{l.ip_address||'—'}</td>
                  <td className="py-2 px-3">{dayjs(l.created_at).format('DD/MM/YY HH:mm')}</td>
                </tr>
              ))}{!audit.length && <tr><td colSpan={6} className="text-center py-8 text-slate-400">No activity logged</td></tr>}</tbody>
            </table>
          )}
          {reportTab === 'activity' && (
            <table className="w-full text-xs">
              <thead className="bg-slate-50 border-b sticky top-0"><tr>{['User','Role','Uploads','Views','Downloads','Approvals','Shares','Total','Last Active'].map(h=><th key={h} className="text-left py-2 px-3 font-medium text-slate-500">{h}</th>)}</tr></thead>
              <tbody>{activity.map((a,i)=>(
                <tr key={i} className="border-b last:border-0 hover:bg-slate-50">
                  <td className="py-2 px-3 font-medium">{a.user_name||'—'}</td><td className="py-2 px-3 capitalize">{a.role}</td>
                  <td className="py-2 px-3">{a.uploads}</td><td className="py-2 px-3">{a.views}</td><td className="py-2 px-3">{a.downloads}</td>
                  <td className="py-2 px-3">{a.approvals}</td><td className="py-2 px-3">{a.shares}</td><td className="py-2 px-3 font-bold">{a.total_actions}</td>
                  <td className="py-2 px-3">{a.last_activity?dayjs(a.last_activity).format('DD/MM/YY'):'—'}</td>
                </tr>
              ))}{!activity.length && <tr><td colSpan={9} className="text-center py-8 text-slate-400">No data</td></tr>}</tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
