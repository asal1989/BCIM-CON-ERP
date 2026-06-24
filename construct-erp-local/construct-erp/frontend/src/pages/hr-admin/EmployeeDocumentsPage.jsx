// src/pages/hr-admin/EmployeeDocumentsPage.jsx
import React, { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { FileText, Search, Upload, Download, Trash2, Eye } from 'lucide-react';
import { hrEmployeesAPI } from '../../api/client';
import toast from 'react-hot-toast';

const B = { purple: '#7C3AED' };
const lbl = { fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 6 };

const DOC_CATEGORIES = ['ID Proof', 'Address Proof', 'Educational Certificate', 'Experience Certificate', 'PAN Card', 'Aadhaar', 'Bank Details', 'Appointment Letter', 'Other'];

export default function EmployeeDocumentsPage() {
  const qc  = useQueryClient();
  const ref = useRef();
  const [search, setSearch]   = useState('');
  const [empId, setEmpId]     = useState(null);
  const [empName, setEmpName] = useState('');
  const [category, setCategory] = useState('');

  const { data: empData } = useQuery({
    queryKey: ['hr-employees-docs', search],
    queryFn: () => hrEmployeesAPI.list({ search }).then(r => r.data),
    enabled: search.length > 1,
  });
  const employees = empData?.data || [];

  const { data: docsData, isLoading } = useQuery({
    queryKey: ['hr-employee-docs', empId],
    queryFn: () => hrEmployeesAPI.get(empId).then(r => ({ data: r.data?.data?.documents || [] })),
    enabled: !!empId,
  });
  const docs = docsData?.data || [];

  const uploadMut = useMutation({
    mutationFn: (file) => {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('doc_type', category || 'Other');
      fd.append('doc_name', file.name);
      return hrEmployeesAPI.uploadDocument(empId, fd);
    },
    onSuccess: () => { toast.success('Document uploaded'); qc.invalidateQueries({ queryKey: ['hr-employee-docs', empId] }); },
    onError: e => toast.error(e?.response?.data?.error || 'Upload failed'),
  });

  const deleteMut = useMutation({
    mutationFn: (docId) => hrEmployeesAPI.deleteDocument(empId, docId),
    onSuccess: () => { toast.success('Document removed'); qc.invalidateQueries({ queryKey: ['hr-employee-docs', empId] }); },
    onError: e => toast.error('Delete failed'),
  });

  const handleFile = (e) => {
    const file = e.target.files?.[0];
    if (file) uploadMut.mutate(file);
    e.target.value = '';
  };

  return (
    <div style={{ padding: '28px 32px', maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: '#7C3AED15', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <FileText size={18} color={B.purple} />
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0F172A', margin: 0 }}>Employee Documents</h1>
        </div>
        <p style={{ fontSize: 13, color: '#64748B', margin: 0 }}>
          View and manage soft copies of employee documents — ID proofs, certificates, address proofs, and more.
        </p>
      </div>

      {/* Search */}
      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, padding: 20, marginBottom: 24 }}>
        <label style={lbl}>Search Employee</label>
        <div style={{ position: 'relative', maxWidth: 420 }}>
          <Search size={15} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94A3B8' }} />
          <input value={search} onChange={e => { setSearch(e.target.value); setEmpId(null); setEmpName(''); }}
            placeholder="Search by Emp No / Name"
            style={{ width: '100%', paddingLeft: 34, paddingRight: 12, paddingTop: 9, paddingBottom: 9, border: '1px solid #E2E8F0', borderRadius: 8, fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
          {search && employees.length > 0 && !empId && (
            <div style={{ position: 'absolute', top: '110%', left: 0, right: 0, background: '#fff', border: '1px solid #E2E8F0', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.1)', zIndex: 50 }}>
              {employees.slice(0, 6).map(e => (
                <button key={e.id} onClick={() => { setEmpId(e.id); setEmpName(e.name); setSearch(`${e.employee_code || e.id} – ${e.name}`); }}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', border: 'none', background: 'transparent', cursor: 'pointer', textAlign: 'left' }}
                  onMouseEnter={ev => ev.currentTarget.style.background = '#F8FAFC'}
                  onMouseLeave={ev => ev.currentTarget.style.background = 'transparent'}
                >
                  <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#7C3AED15', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: B.purple }}>
                    {(e.name || '').split(' ').map(x => x[0]).join('').slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#0F172A' }}>{e.name}</div>
                    <div style={{ fontSize: 11, color: '#64748B' }}>{e.employee_code} · {e.designation}</div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {!empId ? (
        <div style={{ background: '#F8FAFC', border: '1px dashed #CBD5E1', borderRadius: 14, padding: 60, textAlign: 'center' }}>
          <FileText size={40} color="#CBD5E1" style={{ marginBottom: 12 }} />
          <p style={{ fontSize: 14, color: '#94A3B8', fontWeight: 600 }}>Start searching to see specific employee details here</p>
        </div>
      ) : (
        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid #F1F5F9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: '#0F172A', margin: 0 }}>Documents — {empName}</h3>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <select value={category} onChange={e => setCategory(e.target.value)}
                style={{ padding: '7px 10px', border: '1px solid #E2E8F0', borderRadius: 8, fontSize: 12, background: '#F8FAFC', outline: 'none' }}>
                <option value="">All Categories</option>
                {DOC_CATEGORIES.map(c => <option key={c}>{c}</option>)}
              </select>
              <input type="file" ref={ref} onChange={handleFile} style={{ display: 'none' }} />
              <button onClick={() => ref.current?.click()} disabled={uploadMut.isPending}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', background: B.purple, color: '#fff', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                <Upload size={13} /> {uploadMut.isPending ? 'Uploading…' : 'Add Documents'}
              </button>
            </div>
          </div>

          {isLoading ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#94A3B8' }}>Loading…</div>
          ) : docs.length === 0 ? (
            <div style={{ padding: 48, textAlign: 'center', color: '#94A3B8', fontSize: 13 }}>No documents found. Click "Add Documents" to upload.</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#F8FAFC' }}>
                  {['Document Name', 'Category', 'Uploaded On', 'Actions'].map(h => (
                    <th key={h} style={{ padding: '10px 16px', fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: 'left', borderBottom: '1px solid #F1F5F9' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {docs.filter(d => !category || d.doc_type === category).map((doc, i) => (
                  <tr key={doc.id || i} style={{ borderBottom: '1px solid #F8FAFC' }}
                    onMouseEnter={e => e.currentTarget.style.background = '#FAFBFF'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <FileText size={14} color="#7C3AED" />
                        <span style={{ fontSize: 13, fontWeight: 600, color: '#0F172A' }}>{doc.doc_name || doc.file_name || 'Document'}</span>
                      </div>
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <span style={{ fontSize: 12, background: '#F0F4FF', color: '#4F46E5', borderRadius: 6, padding: '3px 8px', fontWeight: 600 }}>{doc.doc_type || 'Other'}</span>
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: 13, color: '#64748B' }}>{doc.uploaded_at ? new Date(doc.uploaded_at).toLocaleDateString('en-IN') : '—'}</td>
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        {doc.file_url && <a href={doc.file_url} target="_blank" rel="noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 10px', border: '1px solid #E2E8F0', borderRadius: 6, fontSize: 11, color: '#4F46E5', textDecoration: 'none', fontWeight: 600 }}><Eye size={12} /> View</a>}
                        {doc.file_url && <a href={doc.file_url} download style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 10px', border: '1px solid #E2E8F0', borderRadius: 6, fontSize: 11, color: '#16A34A', textDecoration: 'none', fontWeight: 600 }}><Download size={12} /> Download</a>}
                        <button onClick={() => deleteMut.mutate(doc.id)} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 10px', border: '1px solid #FEE2E2', borderRadius: 6, fontSize: 11, color: '#EF4444', background: 'transparent', cursor: 'pointer', fontWeight: 600 }}><Trash2 size={12} /> Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
