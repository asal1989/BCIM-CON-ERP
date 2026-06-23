// src/pages/hr-admin/CompanyPoliciesPage.jsx
import React, { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { BookOpen, Upload, Eye, Trash2, Plus, X, FileText, CheckCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import axios from 'axios';

const B = { purple: '#7C3AED' };
const lbl = { fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 6 };
const API = axios.create({ baseURL: '/api', withCredentials: true });

const CATEGORIES = ['HR Policy', 'Leave Policy', 'Code of Conduct', 'Safety Policy', 'IT Policy', 'Attendance Policy', 'Payroll Policy', 'Other'];
const SEGMENTS = ['All Employees', 'Management', 'Staff', 'Workers', 'Contract'];

const fetchPolicies = () => API.get('/hr/policies').then(r => r.data);

export default function CompanyPoliciesPage() {
  const qc = useQueryClient();
  const fileRef = useRef();
  const [tab, setTab] = useState('Policies');
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ title: '', category: 'HR Policy', segment: 'All Employees', effective_date: '' });
  const [file, setFile] = useState(null);

  const { data, isLoading } = useQuery({ queryKey: ['hr-policies'], queryFn: fetchPolicies });
  const policies = data?.data || [];

  const uploadMut = useMutation({
    mutationFn: () => {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => fd.append(k, v));
      if (file) fd.append('file', file);
      return API.post('/hr/policies', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
    },
    onSuccess: () => { toast.success('Policy uploaded'); qc.invalidateQueries({ queryKey: ['hr-policies'] }); setModal(false); setFile(null); setForm({ title: '', category: 'HR Policy', segment: 'All Employees', effective_date: '' }); },
    onError: e => toast.error(e?.response?.data?.error || 'Upload failed'),
  });

  const deleteMut = useMutation({
    mutationFn: (id) => API.delete(`/hr/policies/${id}`),
    onSuccess: () => { toast.success('Policy deleted'); qc.invalidateQueries({ queryKey: ['hr-policies'] }); },
    onError: () => toast.error('Delete failed'),
  });

  return (
    <div style={{ padding: '28px 32px', maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: '#7C3AED15', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <BookOpen size={18} color={B.purple} />
          </div>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0F172A', margin: 0 }}>Company Policies & Forms</h1>
            <p style={{ fontSize: 13, color: '#64748B', margin: 0 }}>Publish company policies and HR forms to employee segments.</p>
          </div>
        </div>
        <button onClick={() => setModal(true)}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 18px', background: B.purple, color: '#fff', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
          <Plus size={15} /> Add Policy
        </button>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 24, borderBottom: '2px solid #F1F5F9' }}>
        {['Policies', 'Forms'].map(t => (
          <button key={t} onClick={() => setTab(t)}
            style={{ padding: '10px 20px', border: 'none', borderBottom: `2px solid ${tab === t ? B.purple : 'transparent'}`, marginBottom: -2, background: 'transparent', fontSize: 13, fontWeight: 700, color: tab === t ? B.purple : '#64748B', cursor: 'pointer' }}>{t}</button>
        ))}
      </div>

      {/* Table */}
      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#F8FAFC' }}>
              {['Title', 'Category', 'Published To', 'Effective Date', 'Actions'].map(h => (
                <th key={h} style={{ padding: '10px 16px', fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: 'left', borderBottom: '1px solid #F1F5F9' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={5} style={{ padding: 40, textAlign: 'center', color: '#94A3B8' }}>Loading…</td></tr>
            ) : policies.length === 0 ? (
              <tr><td colSpan={5} style={{ padding: 48, textAlign: 'center', color: '#94A3B8', fontSize: 13 }}>No policies uploaded yet.</td></tr>
            ) : policies.map((p, i) => (
              <tr key={p.id || i} style={{ borderBottom: '1px solid #F8FAFC' }}
                onMouseEnter={e => e.currentTarget.style.background = '#FAFBFF'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                <td style={{ padding: '12px 16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <FileText size={14} color="#7C3AED" />
                    <span style={{ fontSize: 13, fontWeight: 600, color: '#0F172A' }}>{p.title}</span>
                  </div>
                </td>
                <td style={{ padding: '12px 16px' }}>
                  <span style={{ fontSize: 12, background: '#F0F4FF', color: '#4F46E5', borderRadius: 6, padding: '3px 8px', fontWeight: 600 }}>{p.category}</span>
                </td>
                <td style={{ padding: '12px 16px', fontSize: 12, color: '#64748B' }}>{p.segment || 'All Employees'}</td>
                <td style={{ padding: '12px 16px', fontSize: 12, color: '#64748B' }}>{p.effective_date ? new Date(p.effective_date).toLocaleDateString('en-IN') : '—'}</td>
                <td style={{ padding: '12px 16px' }}>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {p.url && <a href={p.url} target="_blank" rel="noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 10px', border: '1px solid #E2E8F0', borderRadius: 6, fontSize: 11, color: '#4F46E5', textDecoration: 'none', fontWeight: 600 }}><Eye size={12} /> View</a>}
                    <button onClick={() => deleteMut.mutate(p.id)} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 10px', border: '1px solid #FEE2E2', borderRadius: 6, fontSize: 11, color: '#EF4444', background: 'transparent', cursor: 'pointer', fontWeight: 600 }}><Trash2 size={12} /> Delete</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal */}
      {modal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#fff', borderRadius: 16, padding: 28, width: 520, maxWidth: '95vw' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h2 style={{ fontSize: 16, fontWeight: 800, color: '#0F172A', margin: 0 }}>Add Policy</h2>
              <button onClick={() => setModal(false)} style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}><X size={18} color="#64748B" /></button>
            </div>
            <div style={{ display: 'grid', gap: 14 }}>
              <div>
                <label style={lbl}>Policy Title</label>
                <input value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} placeholder="e.g. Leave Policy 2024"
                  style={{ width: '100%', padding: '9px 12px', border: '1px solid #E2E8F0', borderRadius: 8, fontSize: 13, background: '#F8FAFC', outline: 'none', boxSizing: 'border-box' }} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div>
                  <label style={lbl}>Category</label>
                  <select value={form.category} onChange={e => setForm(p => ({ ...p, category: e.target.value }))}
                    style={{ width: '100%', padding: '9px 12px', border: '1px solid #E2E8F0', borderRadius: 8, fontSize: 13, background: '#F8FAFC', outline: 'none' }}>
                    {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label style={lbl}>Publish To</label>
                  <select value={form.segment} onChange={e => setForm(p => ({ ...p, segment: e.target.value }))}
                    style={{ width: '100%', padding: '9px 12px', border: '1px solid #E2E8F0', borderRadius: 8, fontSize: 13, background: '#F8FAFC', outline: 'none' }}>
                    {SEGMENTS.map(s => <option key={s}>{s}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label style={lbl}>Effective Date</label>
                <input type="date" value={form.effective_date} onChange={e => setForm(p => ({ ...p, effective_date: e.target.value }))}
                  style={{ width: '100%', padding: '9px 12px', border: '1px solid #E2E8F0', borderRadius: 8, fontSize: 13, background: '#F8FAFC', outline: 'none', boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={lbl}>Upload File (PDF)</label>
                <input type="file" ref={fileRef} accept=".pdf,.doc,.docx" onChange={e => setFile(e.target.files?.[0])} style={{ display: 'none' }} />
                <button onClick={() => fileRef.current?.click()}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 14px', border: '1px dashed #CBD5E1', borderRadius: 8, fontSize: 13, cursor: 'pointer', background: '#F8FAFC', color: '#64748B', fontWeight: 600 }}>
                  {file ? <><CheckCircle size={14} color="#10B981" /> {file.name}</> : <><Upload size={14} /> Choose File</>}
                </button>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
              <button onClick={() => setModal(false)} style={{ padding: '9px 18px', border: '1px solid #E2E8F0', borderRadius: 8, fontSize: 13, cursor: 'pointer', background: '#F8FAFC', color: '#64748B', fontWeight: 600 }}>Cancel</button>
              <button onClick={() => uploadMut.mutate()} disabled={!form.title || uploadMut.isPending}
                style={{ padding: '9px 18px', background: B.purple, color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                {uploadMut.isPending ? 'Uploading…' : 'Upload Policy'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
