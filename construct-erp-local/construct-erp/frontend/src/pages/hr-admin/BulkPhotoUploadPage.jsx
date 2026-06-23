// src/pages/hr-admin/BulkPhotoUploadPage.jsx
import React, { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Image, Upload, X, CheckCircle, AlertCircle, Info } from 'lucide-react';
import toast from 'react-hot-toast';
import axios from 'axios';

const B = { purple: '#7C3AED' };
const API = axios.create({ baseURL: '/api', withCredentials: true });

const fetchHistory = () => API.get('/hr/bulk-photo-upload/history').then(r => r.data);

export default function BulkPhotoUploadPage() {
  const qc = useQueryClient();
  const fileRef = useRef();
  const [dragging, setDragging] = useState(false);
  const [file, setFile] = useState(null);

  const { data, isLoading } = useQuery({ queryKey: ['bulk-photo-history'], queryFn: fetchHistory });
  const history = data?.data || [];

  const uploadMut = useMutation({
    mutationFn: () => {
      const fd = new FormData();
      fd.append('photos', file);
      return API.post('/hr/bulk-photo-upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
    },
    onSuccess: () => { toast.success('Photos uploaded successfully'); qc.invalidateQueries({ queryKey: ['bulk-photo-history'] }); setFile(null); },
    onError: e => toast.error(e?.response?.data?.error || 'Upload failed'),
  });

  const handleDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files?.[0];
    if (f && (f.name.endsWith('.zip') || f.type === 'application/zip')) setFile(f);
    else toast.error('Please upload a ZIP file containing photos');
  };

  const handleFile = (e) => {
    const f = e.target.files?.[0];
    if (f) setFile(f);
    e.target.value = '';
  };

  return (
    <div style={{ padding: '28px 32px', maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: '#7C3AED15', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Image size={18} color={B.purple} />
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0F172A', margin: 0 }}>Bulk Photo Upload</h1>
        </div>
        <p style={{ fontSize: 13, color: '#64748B', margin: 0 }}>Upload employee photos in bulk using a ZIP file. Photos must be named by employee code (e.g., EMP001.jpg).</p>
      </div>

      {/* Instructions */}
      <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 12, padding: '14px 18px', marginBottom: 24, display: 'flex', gap: 10 }}>
        <Info size={16} color="#2563EB" style={{ flexShrink: 0, marginTop: 1 }} />
        <div style={{ fontSize: 12, color: '#1E40AF', lineHeight: 1.7 }}>
          <strong>How it works:</strong> Create a ZIP file containing employee photos named by their Employee Code (e.g., <code>EMP001.jpg</code>, <code>EMP002.png</code>). Supported formats: JPG, PNG, JPEG. Maximum file size: 2MB per photo.
        </div>
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
        <input type="file" ref={fileRef} accept=".zip" onChange={handleFile} style={{ display: 'none' }} />
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
            <div style={{ fontSize: 14, fontWeight: 600, color: '#475569' }}>
              {dragging ? 'Drop your ZIP file here' : 'Drag & drop a ZIP file here, or click to browse'}
            </div>
            <div style={{ fontSize: 12, color: '#94A3B8' }}>Only .zip files are accepted</div>
          </div>
        )}
      </div>

      {file && (
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <button onClick={() => uploadMut.mutate()} disabled={uploadMut.isPending}
            style={{ padding: '10px 28px', background: B.purple, color: '#fff', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
            {uploadMut.isPending ? 'Uploading…' : 'Upload Photos'}
          </button>
        </div>
      )}

      {/* Upload History */}
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
                {['File Name', 'Uploaded On', 'Total', 'Success', 'Failed', 'Status'].map(h => (
                  <th key={h} style={{ padding: '10px 16px', fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: 'left', borderBottom: '1px solid #F1F5F9' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {history.map((h, i) => (
                <tr key={h.id || i} style={{ borderBottom: '1px solid #F8FAFC' }}>
                  <td style={{ padding: '12px 16px', fontSize: 13, fontWeight: 600, color: '#0F172A' }}>{h.file_name}</td>
                  <td style={{ padding: '12px 16px', fontSize: 12, color: '#64748B' }}>{h.created_at ? new Date(h.created_at).toLocaleDateString('en-IN') : '—'}</td>
                  <td style={{ padding: '12px 16px', fontSize: 12, color: '#64748B' }}>{h.total || 0}</td>
                  <td style={{ padding: '12px 16px', fontSize: 12, color: '#10B981', fontWeight: 700 }}>{h.success || 0}</td>
                  <td style={{ padding: '12px 16px', fontSize: 12, color: '#EF4444', fontWeight: 700 }}>{h.failed || 0}</td>
                  <td style={{ padding: '12px 16px' }}>
                    <span style={{ fontSize: 11, fontWeight: 700, borderRadius: 6, padding: '3px 8px', background: h.status === 'Completed' ? '#F0FDF4' : '#FFFBEB', color: h.status === 'Completed' ? '#15803D' : '#B45309' }}>
                      {h.status || 'Completed'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
