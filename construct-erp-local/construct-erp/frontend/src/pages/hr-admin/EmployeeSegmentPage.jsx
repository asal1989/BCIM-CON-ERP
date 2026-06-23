// src/pages/hr-admin/EmployeeSegmentPage.jsx
import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Users, Plus, X, Edit2, Trash2, Filter } from 'lucide-react';
import toast from 'react-hot-toast';
import axios from 'axios';

const B = { purple: '#7C3AED' };
const lbl = { fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 6 };
const API = axios.create({ baseURL: '/api', withCredentials: true });

const COLORS = ['#7C3AED', '#2563EB', '#059669', '#D97706', '#DC2626', '#0891B2', '#7C2D12'];
const EMPTY = { name: '', description: '', color: '#7C3AED', is_shared: true };

const fetchSegments = () => API.get('/hr/segments').then(r => r.data);

export default function EmployeeSegmentPage() {
  const qc = useQueryClient();
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);

  const { data, isLoading } = useQuery({ queryKey: ['hr-segments'], queryFn: fetchSegments });
  const segments = data?.data || [];

  const openAdd = () => { setForm(EMPTY); setEditing(null); setModal(true); };
  const openEdit = (s) => { setForm({ name: s.name, description: s.description || '', color: s.color || '#7C3AED', is_shared: s.is_shared !== false }); setEditing(s.id); setModal(true); };

  const saveMut = useMutation({
    mutationFn: () => editing ? API.put(`/hr/segments/${editing}`, form) : API.post('/hr/segments', form),
    onSuccess: () => { toast.success(editing ? 'Segment updated' : 'Segment created'); qc.invalidateQueries({ queryKey: ['hr-segments'] }); setModal(false); },
    onError: e => toast.error(e?.response?.data?.error || 'Failed'),
  });

  const deleteMut = useMutation({
    mutationFn: (id) => API.delete(`/hr/segments/${id}`),
    onSuccess: () => { toast.success('Segment deleted'); qc.invalidateQueries({ queryKey: ['hr-segments'] }); },
    onError: () => toast.error('Delete failed'),
  });

  return (
    <div style={{ padding: '28px 32px', maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: '#7C3AED15', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Users size={18} color={B.purple} />
          </div>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0F172A', margin: 0 }}>Employee Segments</h1>
            <p style={{ fontSize: 13, color: '#64748B', margin: 0 }}>Create and manage named employee groups for targeted communications and policy releases.</p>
          </div>
        </div>
        <button onClick={openAdd}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 18px', background: B.purple, color: '#fff', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
          <Plus size={15} /> New Segment
        </button>
      </div>

      {/* Segments Grid */}
      {isLoading ? (
        <div style={{ padding: 60, textAlign: 'center', color: '#94A3B8' }}>Loading…</div>
      ) : segments.length === 0 ? (
        <div style={{ background: '#F8FAFC', border: '1px dashed #CBD5E1', borderRadius: 14, padding: 60, textAlign: 'center' }}>
          <Users size={40} color="#CBD5E1" style={{ marginBottom: 12 }} />
          <p style={{ fontSize: 14, color: '#94A3B8', fontWeight: 600 }}>No segments yet. Create your first employee segment.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
          {segments.map((s, i) => (
            <div key={s.id || i} style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, padding: 20, borderTop: `4px solid ${s.color || B.purple}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                <div>
                  <h3 style={{ fontSize: 15, fontWeight: 700, color: '#0F172A', margin: 0 }}>{s.name}</h3>
                  <p style={{ fontSize: 12, color: '#64748B', margin: '4px 0 0' }}>{s.description || 'No description'}</p>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={() => openEdit(s)} style={{ padding: 6, border: '1px solid #E2E8F0', borderRadius: 6, background: 'transparent', cursor: 'pointer' }}><Edit2 size={12} color="#64748B" /></button>
                  <button onClick={() => deleteMut.mutate(s.id)} style={{ padding: 6, border: '1px solid #FEE2E2', borderRadius: 6, background: 'transparent', cursor: 'pointer' }}><Trash2 size={12} color="#EF4444" /></button>
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 20, fontWeight: 800, color: s.color || B.purple }}>{s.member_count || 0}</span>
                <span style={{ fontSize: 11, fontWeight: 700, borderRadius: 20, padding: '3px 8px', background: s.is_shared !== false ? '#F0FDF4' : '#F8FAFC', color: s.is_shared !== false ? '#15803D' : '#64748B' }}>
                  {s.is_shared !== false ? 'Shared' : 'Private'}
                </span>
              </div>
              <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 4 }}>members</div>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {modal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#fff', borderRadius: 16, padding: 28, width: 460, maxWidth: '95vw' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h2 style={{ fontSize: 16, fontWeight: 800, color: '#0F172A', margin: 0 }}>{editing ? 'Edit Segment' : 'New Segment'}</h2>
              <button onClick={() => setModal(false)} style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}><X size={18} color="#64748B" /></button>
            </div>
            <div style={{ display: 'grid', gap: 14 }}>
              <div>
                <label style={lbl}>Segment Name</label>
                <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. All Staff"
                  style={{ width: '100%', padding: '9px 12px', border: '1px solid #E2E8F0', borderRadius: 8, fontSize: 13, background: '#F8FAFC', outline: 'none', boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={lbl}>Description</label>
                <textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} rows={2} placeholder="Optional description"
                  style={{ width: '100%', padding: '9px 12px', border: '1px solid #E2E8F0', borderRadius: 8, fontSize: 13, background: '#F8FAFC', outline: 'none', resize: 'none', boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={lbl}>Color</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  {COLORS.map(c => (
                    <button key={c} onClick={() => setForm(p => ({ ...p, color: c }))}
                      style={{ width: 28, height: 28, borderRadius: '50%', background: c, border: form.color === c ? '3px solid #0F172A' : '3px solid transparent', cursor: 'pointer' }} />
                  ))}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <input type="checkbox" id="shared" checked={form.is_shared} onChange={e => setForm(p => ({ ...p, is_shared: e.target.checked }))} style={{ width: 16, height: 16, cursor: 'pointer' }} />
                <label htmlFor="shared" style={{ fontSize: 13, color: '#374151', cursor: 'pointer' }}>Shared (visible to all HR admins)</label>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
              <button onClick={() => setModal(false)} style={{ padding: '9px 18px', border: '1px solid #E2E8F0', borderRadius: 8, fontSize: 13, cursor: 'pointer', background: '#F8FAFC', color: '#64748B', fontWeight: 600 }}>Cancel</button>
              <button onClick={() => saveMut.mutate()} disabled={!form.name || saveMut.isPending}
                style={{ padding: '9px 18px', background: B.purple, color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                {saveMut.isPending ? 'Saving…' : editing ? 'Update' : 'Create Segment'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
