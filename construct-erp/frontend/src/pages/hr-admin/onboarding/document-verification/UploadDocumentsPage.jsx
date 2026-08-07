// src/pages/hr-admin/onboarding/document-verification/UploadDocumentsPage.jsx
// Multi-file drag & drop upload for one employee's documents, reusing the
// existing POST /:id/documents endpoint (one request per file).
import React, { useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Upload, ArrowLeft, Search, UploadCloud, File as FileIcon, X, Loader2, CheckCircle2 } from 'lucide-react';
import { hrDocVerificationAPI, hrEmployeesAPI } from '../../../../api/client';
import { B, fade, avatarGrad, initials } from '../../../../components/hr/DashboardKit';

export default function UploadDocumentsPage() {
  const navigate = useNavigate();
  const [empSearch, setEmpSearch] = useState('');
  const [employee, setEmployee] = useState(null);
  const [files, setFiles] = useState([]); // [{ file, doc_type, doc_name, status: 'idle'|'uploading'|'done'|'error' }]
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef(null);

  const { data: empResults } = useQuery({
    queryKey: ['emp-search', empSearch],
    queryFn: () => hrEmployeesAPI.list({ search: empSearch }).then(r => r.data.data),
    enabled: empSearch.length >= 2 && !employee,
  });
  const { data: catalog } = useQuery({
    queryKey: ['doc-catalog'],
    queryFn: () => hrDocVerificationAPI.catalog().then(r => r.data.data),
  });

  const uploadMut = useMutation({
    mutationFn: async ({ file, doc_type, doc_name }) => {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('doc_type', doc_type);
      fd.append('doc_name', doc_name || file.name);
      return hrEmployeesAPI.uploadDocument(employee.id, fd);
    },
  });

  const addFiles = (list) => {
    const next = Array.from(list).map(file => ({ file, doc_type: catalog?.[0]?.doc_type || 'other', doc_name: file.name, status: 'idle' }));
    setFiles(prev => [...prev, ...next]);
  };

  const updateFile = (idx, patch) => setFiles(prev => prev.map((f, i) => i === idx ? { ...f, ...patch } : f));
  const removeFile = (idx) => setFiles(prev => prev.filter((_, i) => i !== idx));

  const uploadAll = async () => {
    for (let i = 0; i < files.length; i++) {
      if (files[i].status === 'done') continue;
      updateFile(i, { status: 'uploading' });
      try {
        await uploadMut.mutateAsync(files[i]);
        updateFile(i, { status: 'done' });
      } catch (e) {
        updateFile(i, { status: 'error' });
        toast.error(`Failed: ${files[i].file.name}`);
      }
    }
    if (files.every((_, i) => files[i].status !== 'error')) toast.success('Upload complete');
  };

  return (
    <div className="min-h-screen p-4 md:p-6" style={{ background: B.bg }}>
      <button onClick={() => navigate('/hr-admin/onboarding/document-verification')} className="flex items-center gap-1.5 text-sm font-bold text-gray-500 hover:text-gray-700 mb-4">
        <ArrowLeft className="w-4 h-4" /> Back to Dashboard
      </button>

      <motion.div {...fade(0)} className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: `${B.blue}18` }}>
          <Upload className="w-5 h-5" style={{ color: B.blue }} />
        </div>
        <div>
          <h1 className="text-xl font-black text-gray-900">Upload Documents</h1>
          <p className="text-xs text-gray-400">Select an employee, then drag & drop or choose files to upload</p>
        </div>
      </motion.div>

      {!employee ? (
        <motion.div {...fade(0.05)} className="bg-white rounded-2xl p-5 border border-gray-100" style={{ boxShadow: '0 2px 12px rgba(10,31,92,0.06)' }}>
          <div className="relative mb-3">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input value={empSearch} onChange={e => setEmpSearch(e.target.value)} placeholder="Search employee by name or code..."
              className="w-full text-sm pl-9 pr-3 py-2.5 rounded-lg border border-gray-200 focus:outline-none focus:border-blue-300" />
          </div>
          <div className="space-y-1.5 max-h-80 overflow-y-auto">
            {empSearch.length < 2 && <p className="text-xs text-gray-400">Type at least 2 characters to search.</p>}
            {(empResults || []).map(emp => {
              const [c1, c2] = avatarGrad(emp.name);
              return (
                <button key={emp.id} onClick={() => setEmployee(emp)}
                  className="w-full flex items-center gap-3 p-2.5 rounded-lg hover:bg-gray-50 text-left">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                    style={{ background: `linear-gradient(135deg, ${c1}, ${c2})` }}>{initials(emp.name)}</div>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-gray-800 truncate">{emp.name}</p>
                    <p className="text-xs text-gray-400">{emp.employee_code} · {emp.department || '—'}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </motion.div>
      ) : (
        <>
          <motion.div {...fade(0.05)} className="bg-white rounded-2xl p-4 mb-4 border border-gray-100 flex items-center gap-3" style={{ boxShadow: '0 2px 12px rgba(10,31,92,0.06)' }}>
            {(() => { const [c1, c2] = avatarGrad(employee.name); return (
              <div className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0"
                style={{ background: `linear-gradient(135deg, ${c1}, ${c2})` }}>{initials(employee.name)}</div>
            ); })()}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-gray-900">{employee.name}</p>
              <p className="text-xs text-gray-400">{employee.employee_code}</p>
            </div>
            <button onClick={() => { setEmployee(null); setFiles([]); }} className="text-xs font-bold px-3 py-1.5 rounded-lg bg-gray-100 text-gray-500">
              Change Employee
            </button>
          </motion.div>

          <motion.div {...fade(0.08)}
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={e => { e.preventDefault(); setDragOver(false); addFiles(e.dataTransfer.files); }}
            onClick={() => inputRef.current?.click()}
            className={`bg-white rounded-2xl p-10 mb-4 border-2 border-dashed text-center cursor-pointer transition-colors ${dragOver ? 'border-blue-400 bg-blue-50/40' : 'border-gray-200'}`}>
            <UploadCloud className="w-10 h-10 mx-auto mb-3" style={{ color: dragOver ? B.blue : '#94A3B8' }} />
            <p className="text-sm font-bold text-gray-700">Drag & drop files here, or click to browse</p>
            <p className="text-xs text-gray-400 mt-1">Multiple files supported</p>
            <input ref={inputRef} type="file" multiple className="hidden" onChange={e => { addFiles(e.target.files); e.target.value = ''; }} />
          </motion.div>

          {files.length > 0 && (
            <motion.div {...fade(0.1)} className="bg-white rounded-2xl p-4 border border-gray-100 space-y-3" style={{ boxShadow: '0 2px 12px rgba(10,31,92,0.06)' }}>
              {files.map((f, i) => (
                <div key={i} className="flex flex-wrap items-center gap-3 p-2.5 rounded-lg bg-gray-50">
                  <FileIcon className="w-4 h-4 text-gray-400 flex-shrink-0" />
                  <span className="text-sm font-semibold text-gray-700 flex-1 min-w-[140px] truncate">{f.file.name}</span>
                  <select value={f.doc_type} onChange={e => updateFile(i, { doc_type: e.target.value })} disabled={f.status !== 'idle'}
                    className="text-xs px-2 py-1.5 rounded-lg border border-gray-200 focus:outline-none">
                    {(catalog || []).map(c => <option key={c.doc_type} value={c.doc_type}>{c.label}</option>)}
                  </select>
                  {f.status === 'idle' && <button onClick={() => removeFile(i)}><X className="w-4 h-4 text-gray-300 hover:text-red-500" /></button>}
                  {f.status === 'uploading' && <Loader2 className="w-4 h-4 animate-spin text-blue-400" />}
                  {f.status === 'done' && <CheckCircle2 className="w-4 h-4" style={{ color: B.success }} />}
                  {f.status === 'error' && <span className="text-[11px] font-bold text-red-500">Failed</span>}
                </div>
              ))}
              <button onClick={uploadAll} disabled={uploadMut.isPending}
                className="w-full text-sm font-bold py-2.5 rounded-xl text-white disabled:opacity-50"
                style={{ background: `linear-gradient(135deg,${B.blue},${B.navy})` }}>
                Upload {files.filter(f => f.status !== 'done').length} File(s)
              </button>
            </motion.div>
          )}
        </>
      )}
    </div>
  );
}
