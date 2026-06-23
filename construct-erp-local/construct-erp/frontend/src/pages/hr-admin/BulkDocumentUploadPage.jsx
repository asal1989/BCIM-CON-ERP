// src/pages/hr-admin/BulkDocumentUploadPage.jsx
import React, { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { FolderUp, Upload, X, CheckCircle, Info } from 'lucide-react';
import toast from 'react-hot-toast';
import axios from 'axios';

const B = { purple: '#7C3AED' };
const API = axios.create({ baseURL: '/api', withCredentials: true });
const lbl = { fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 6 };
const DOC_TYPES = ['ID Proof', 'Address Proof', 'Educational Certificate', 'Experience Certificate', 'PAN Card', 'Aadhaar', 'Bank Details', 'Appointment Letter', 'Other'];

const fetchHistory = () => API.get('/hr/bulk-document-upload/history').then(r => r.data);

export default function BulkDocumentUploadPage() {
  const qc = useQueryClient();
  const fileRef = useRef();
  const [file, setFile] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [docType, setDocType] = useState('Other');

  const { data, isLoading } = useQuery({ queryKey: ['bulk-doc-history'], queryFn: fetchHistory });
  const history = data?.data || [];

  const uploadMut = useMutation({
    mutationFn: () => {
      const fd = new FormData();
      fd.append('documents', file);
      fd.append('doc_type', docType);
      return API.post('/hr/bulk-document-upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
    },
    onSuccess: () => { toast.success('Documents uploaded successfully'); qc.invalidateQueries({ queryKey: ['bulk-doc-history'] }); setFile(null); },
    onError: e => toast.error(e?.response?.data?.error || 'Upload failed'),
  });

  const handleDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files?.[0];
    if (f && (f.name.endsWith('.zip') || f.type === 'application/zip')) setFile(f);
    else toast.error('Please upload a ZIP file');
  };

  return (
    <div style={{ padding: '28px 32px', maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: '#7C3AED15', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <FolderUp size={18} color={B.purple} />
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0F172A', margin: 0 }}>Bulk Document Upload</h1>
        </div>
        <p style={{ fontSize: 13, color: '#64748B', margin: 0 }}>Upload multiple employee documents at once using a ZIP file. Documents are tagged by employee code.</p>
      </div>

      {/* Instructions */}
      <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 12, padding: '14px 18px', marginBottom: 24, display: 'flex', gap: 10 }}>
        <Info size={16} color="#2563EB" style={{ flexShrink: 0, marginTop: 1 }} />
        <div style={{ fontSize: 12, color: '#1E40AF', lineHeight: 1.7 }}>
          <strong>ZIP naming convention:</strong> Name each file as <code>EMP001_document.pdf</code> where <code>EMP001</code> is the employee code. Supported: PDF, JPG, PNG. Max 5MB per file.
        </div>
      </div>

      {/* Options */}
      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, padding: 20, marginBottom: 20 }}>
        <label style={lbl}>Document Category</label>
        <select value={docType} onChange={e => setDocType(e.target.value)}
          style={{ padding: '9px 12px', border: '1px solid #E2E8F0', borderRadius: 8, fontSize: 13, background: '#F8FAFC', outline: 'none', minWidth: 220 }}>
          {DOC_TYPES.map(t => <option key={t}>{t}</option>)}
        </select>
      </div>

      {/* Drop Zone */}
      <div
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => fileRef.current?.click()}
        style={{
          border: `2px dashed ${dragging ? B.purple : file ? '#10B981' : '#CBD5E1'}`,
          borderRadius: 14,
          padding: '48px 24px',
          textAlign: 'center',
          cursor: 'pointer',
          background: dragging ? '#F5F3FF' : file ? '#F0FDF4' : '#F8FAFC',
          marginBottom: 24,
          transition: 'all 0.2s',
        }}>
        <input type="file" ref={fileRef} accept=".zip" onChange={e => { if (e.target.files?.[0]) setFile(e.target.files[0]); e.target.value = ''; }} style={{ display: 'none' }} />
        {file ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
            <CheckCircle size={40} color="#10B981" />
            <div style={{ fontSize: 15, fontWeight: 700, color: '#065F46' }}>{file.name}</div>
            <div style={{ fontSize: 12, color: '#6B7280' }}>{(file.size / 1024 / 1024).toFixed(2)} MB</div>
            <button onClick={e => { e.stopPropagation(); setFile(null); }}
              style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4, padding: '5px 12px', border: '1px solid #E2E8F0', borderRadius: 6, fontSize: 12, cursor: 'pointer', background: '#fff', color: '#64748B' }}>
              <X size={12} /> Remove
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
            <Upload size={36} color="#94A3B8" />
            <div style={{ fontSize: 14, fontWeight: 600, color: '#475569' }}>{dragging ? 'Drop your ZIP file here' : 'Drag & drop a ZIP file, or click to browse'}</div>
            <div style={{ fontSize: 12, color: '#94A3B8' }}>Only .zip files</div>
          </div>
        )}
      </div>

      {file && (
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <button onClick={() => uploadMut.mutate()} disabled={uploadMut.isPending}
            style={{ padding: '10px 28px', background: B.purple, color: '#fff', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
            {uploadMut.isPending ? 'Uploading…' : 'Upload Documents'}
          </button>
        </div>
      )}

      {/* History */}
      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid #F1F5F9' }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: '#0F172A', margin: 0 }}>Upload History</h3>
        </div>
        {isLoading ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#94A3B8' }}>Loading…</div>
        ) : history.length === 0 ? (
          <div style={{ padding: 48, textAlign: 'center', color: '#94A3B8', fontSize: 13 }}>No uploads yet.</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#F8FAFC' }}>
                {['File', 'Category', 'Uploaded On', 'Total', 'Success', 'Failed'].map(h => (
                  <th key={h} style={{ padding: '10px 16px', fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: 'left', borderBottom: '1px solid #F1F5F9' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {history.map((r, i) => (
                <tr key={r.id || i} style={{ borderBottom: '1px solid #F8FAFC' }}>
                  <td style={{ padding: '12px 16px', fontSize: 13, fontWeight: 600, color: '#0F172A' }}>{r.file_name}</td>
                  <td style={{ padding: '12px 16px', fontSize: 12, color: '#64748B' }}>{r.doc_type || 'Other'}</td>
                  <td style={{ padding: '12px 16px', fontSize: 12, color: '#64748B' }}>{r.created_at ? new Date(r.created_at).toLocaleDateString('en-IN') : '—'}</td>
                  <td style={{ padding: '12px 16px', fontSize: 12, color: '#64748B' }}>{r.total || 0}</td>
                  <td style={{ padding: '12px 16px', fontSize: 12, color: '#10B981', fontWeight: 700 }}>{r.success || 0}</td>
                  <td style={{ padding: '12px 16px', fontSize: 12, color: '#EF4444', fontWeight: 700 }}>{r.failed || 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
