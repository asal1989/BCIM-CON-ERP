/**
 * RecordAttachments — universal drop-in attachment panel for any module record.
 *
 * Usage:
 *   <RecordAttachments module="purchase_order" recordId={po.id} projectId={po.project_id} />
 *
 * Works for ANY record in ANY module — uses the central documents table
 * (module + module_record_id linking). No per-table JSONB column needed.
 *
 * Props:
 *   module      – document module key  e.g. "purchase_order", "work_order", "invoice", "grn"
 *   recordId    – UUID of the record
 *   projectId   – optional, sent when uploading so the file is scoped to the project
 *   disabled    – hides the upload zone (read-only mode)
 *   label       – panel label (default "Attachments")
 *   compact     – smaller card style (default false)
 */
import React, { useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Paperclip, Upload, X, FileText, FileImage, File,
  Download, Eye, Trash2, Loader2,
} from 'lucide-react';
import { documentsAPI } from '../../api/client';
import toast from 'react-hot-toast';
import dayjs from 'dayjs';
import { clsx } from 'clsx';

const BASE = process.env.REACT_APP_API_URL?.replace('/api/v1', '') || '';
const API = process.env.REACT_APP_API_URL || '/api/v1';

// OneDrive-backed docs have no local_url — route the "view" link through our
// own authenticated proxy (GET /documents/:id/file) instead of the raw
// onedrive_web_url, which forces a Microsoft 365 login for anyone without a
// BCIM tenant account. A plain <a href target="_blank"> can't send an
// Authorization header, so the JWT rides along as ?token=.
const fileViewUrl = (docId) => {
  const token = localStorage.getItem('accessToken') || sessionStorage.getItem('accessToken') || '';
  return `${API}/documents/${docId}/file?token=${encodeURIComponent(token)}`;
};

function fileIcon(type = '') {
  const t = type.toLowerCase();
  if (['jpg','jpeg','png','gif','webp'].includes(t)) return <FileImage className="w-4 h-4 text-emerald-500" />;
  if (t === 'pdf') return <FileText className="w-4 h-4 text-red-500" />;
  return <File className="w-4 h-4 text-slate-400" />;
}

function fmtSize(bytes) {
  if (!bytes) return '';
  if (bytes > 1024 * 1024) return `${(bytes / 1048576).toFixed(1)} MB`;
  return `${Math.round(bytes / 1024)} KB`;
}

export default function RecordAttachments({
  module, recordId, projectId, disabled = false, label = 'Attachments', compact = false,
  docTypeOptions = null, // e.g. [{ value: 'invoice', label: 'Invoice' }, ...]
}) {
  const qc        = useQueryClient();
  const inputRef  = useRef();
  const [dragging, setDragging] = useState(false);
  const [selectedDocType, setSelectedDocType] = useState(docTypeOptions?.[0]?.value || 'general');

  const queryKey = ['record-docs', module, recordId];

  const { data: docs = [], isLoading } = useQuery({
    queryKey,
    queryFn: () => documentsAPI.listForRecord(module, recordId).then(r => r.data?.data ?? []),
    enabled: !!module && !!recordId,
  });

  const uploadMut = useMutation({
    mutationFn: ({ file, docType }) => documentsAPI.uploadForRecord(file, module, recordId, projectId, docType),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey });
      toast.success('File attached');
    },
    onError: (e) => toast.error(e?.response?.data?.error || 'Upload failed'),
  });

  const deleteMut = useMutation({
    mutationFn: (id) => documentsAPI.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey });
      toast.success('Removed');
    },
  });

  const handleFiles = (files) => {
    if (!files?.length || disabled) return;
    Array.from(files).forEach(f => uploadMut.mutate({ file: f, docType: selectedDocType }));
  };

  if (!recordId) return null;

  return (
    <div className={clsx('mt-4', compact ? 'text-xs' : '')}>
      {/* Header */}
      <div className="flex items-center gap-2 mb-2">
        <Paperclip className="w-3.5 h-3.5 text-indigo-500" />
        <span className={clsx('font-semibold text-slate-700', compact ? 'text-[11px]' : 'text-xs')}>
          {label}
        </span>
        <span className="text-[10px] text-slate-400">
          ({isLoading ? '…' : docs.length} file{docs.length !== 1 ? 's' : ''})
        </span>
        {uploadMut.isPending && <Loader2 className="w-3 h-3 text-indigo-500 animate-spin ml-1" />}
      </div>

      {/* Drop zone */}
      {!disabled && (
        <div className="mb-3">
          {docTypeOptions && docTypeOptions.length > 1 && (
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-[10px] font-semibold text-slate-500 uppercase">File type:</span>
              <div className="flex items-center gap-1 flex-wrap">
                {docTypeOptions.map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setSelectedDocType(opt.value)}
                    className={clsx(
                      'px-2.5 py-0.5 rounded-full text-[10px] font-semibold border transition-all',
                      selectedDocType === opt.value
                        ? 'bg-indigo-600 text-white border-indigo-600'
                        : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300'
                    )}
                  >{opt.label}</button>
                ))}
              </div>
            </div>
          )}
          <div
            onDragOver={e => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={e => { e.preventDefault(); setDragging(false); handleFiles(e.dataTransfer.files); }}
            onClick={() => inputRef.current?.click()}
            className={clsx(
              'border-2 border-dashed rounded-xl px-4 py-3 text-center cursor-pointer transition-all',
              dragging ? 'border-indigo-400 bg-indigo-50' : 'border-slate-200 hover:border-indigo-300 hover:bg-slate-50'
            )}
          >
            <input
              ref={inputRef}
              type="file"
              multiple
              className="hidden"
              accept=".pdf,.docx,.xlsx,.jpg,.jpeg,.png,.dwg,.dxf,.zip,.txt,.csv"
              onChange={e => handleFiles(e.target.files)}
            />
            <div className="flex items-center justify-center gap-2">
              <Upload className="w-3.5 h-3.5 text-indigo-400" />
              <span className="text-xs text-indigo-600 font-medium">
                {uploadMut.isPending ? 'Uploading…' : 'Click or drag files here'}
              </span>
              <span className="text-[10px] text-slate-400">PDF, Excel, Word, Images — max 25 MB</span>
            </div>
          </div>
        </div>
      )}

      {/* File list */}
      {docs.length > 0 && (
        <div className="space-y-1.5">
          {docs.map(doc => (
            <div key={doc.id}
              className="flex items-center gap-2.5 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 group">
              <div className="w-7 h-7 rounded-lg bg-white border border-slate-200 flex items-center justify-center shrink-0">
                {fileIcon(doc.file_type)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 min-w-0">
                  <p className="text-xs font-medium text-black truncate">{doc.file_name}</p>
                  {doc.doc_type && doc.doc_type !== 'general' && (
                    <span className="shrink-0 px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 text-[9px] font-semibold uppercase">
                      {doc.doc_type.replace(/_/g, ' ')}
                    </span>
                  )}
                </div>
                <p className="text-[10px] text-slate-400">
                  {fmtSize(doc.file_size)}
                  {doc.uploader_name ? ` · ${doc.uploader_name}` : ''}
                  {doc.created_at ? ` · ${dayjs(doc.created_at).format('DD MMM YYYY')}` : ''}
                </p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {!doc.local_url && (
                  <a href={fileViewUrl(doc.id)} target="_blank" rel="noreferrer"
                    className="w-6 h-6 flex items-center justify-center rounded border border-slate-200 text-blue-500 hover:bg-blue-50 transition-all"
                    title="View">
                    <Eye className="w-3 h-3" />
                  </a>
                )}
                {doc.local_url && (
                  <a href={`${BASE}${doc.local_url}`} download={doc.file_name}
                    className="w-6 h-6 flex items-center justify-center rounded border border-slate-200 text-emerald-500 hover:bg-emerald-50 transition-all"
                    title="Download">
                    <Download className="w-3 h-3" />
                  </a>
                )}
                {!doc.local_url && (
                  <a href={`${fileViewUrl(doc.id)}&download=1`} download={doc.file_name}
                    className="w-6 h-6 flex items-center justify-center rounded border border-slate-200 text-emerald-500 hover:bg-emerald-50 transition-all"
                    title="Download">
                    <Download className="w-3 h-3" />
                  </a>
                )}
                {!disabled && (
                  <button
                    onClick={() => { if (window.confirm(`Remove "${doc.file_name}"?`)) deleteMut.mutate(doc.id); }}
                    className="w-6 h-6 flex items-center justify-center rounded border border-slate-200 text-slate-300 hover:text-red-500 hover:border-red-200 transition-all opacity-0 group-hover:opacity-100"
                    title="Remove">
                    <Trash2 className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {docs.length === 0 && !isLoading && disabled && (
        <p className="text-[11px] text-slate-400 text-center py-2">No attachments</p>
      )}
    </div>
  );
}
