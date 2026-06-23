// src/pages/hr-admin/BulletinBoardPage.jsx
import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Bell, Plus, X, Trash2, Calendar, Tag } from 'lucide-react';
import toast from 'react-hot-toast';
import axios from 'axios';

const B = { purple: '#7C3AED' };
const lbl = { fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 6 };
const API = axios.create({ baseURL: '/api', withCredentials: true });

const fetchBulletins = () => API.get('/hr/bulletins').then(r => r.data);
const CATS = ['General', 'Policy', 'HR Notice', 'IT Notice', 'Event', 'Compliance'];

export default function BulletinBoardPage() {
  const qc = useQueryClient();
  const [modal, setModal] = useState(false);
  const [status, setStatus] = useState('Open');
  const [form, setForm] = useState({ title: '', category: 'General', content: '', expiry_date: '' });

  const { data, isLoading } = useQuery({ queryKey: ['hr-bulletins'], queryFn: fetchBulletins });
  const bulletins = data?.data || [];

  const createMut = useMutation({
    mutationFn: () => API.post('/hr/bulletins', form),
    onSuccess: () => { toast.success('Bulletin added'); qc.invalidateQueries({ queryKey: ['hr-bulletins'] }); setModal(false); setForm({ title: '', category: 'General', content: '', expiry_date: '' }); },
    onError: e => toast.error(e?.response?.data?.error || 'Failed'),
  });

  const deleteMut = useMutation({
    mutationFn: (id) => API.delete(`/hr/bulletins/${id}`),
    onSuccess: () => { toast.success('Deleted'); qc.invalidateQueries({ queryKey: ['hr-bulletins'] }); },
    onError: () => toast.error('Delete failed'),
  });

  const filtered = bulletins.filter(b => {
    if (status === 'Open') return !b.expiry_date || new Date(b.expiry_date) >= new Date();
    return b.expiry_date && new Date(b.expiry_date) < new Date();
  });

  return (
    <div style={{ padding: '28px 32px', maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: '#7C3AED15', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Bell size={18} color={B.purple} />
            </div>
            <div>
              <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0F172A', margin: 0 }}>Bulletin Board</h1>
              <p style={{ fontSize: 13, color: '#64748B', margin: 0 }}>Publish official bulletins, newsletters, and office memos to employees.</p>
            </div>
          </div>
          <button onClick={() => setModal(true)}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 18px', background: B.purple, color: '#fff', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
            <Plus size={15} /> Add Bulletin
          </button>
        </div>
      </div>

      {/* Filter */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {['Open', 'Expired'].map(s => (
          <button key={s} onClick={() => setStatus(s)}
            style={{ padding: '6px 16px', borderRadius: 20, border: `1px solid ${status === s ? B.purple : '#E2E8F0'}`, background: status === s ? B.purple : '#fff', color: status === s ? '#fff' : '#64748B', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>{s}</button>
        ))}
      </div>

      {/* Table */}
      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#F8FAFC' }}>
              {['Category', 'Title', 'Posted Date', 'Rank', ''].map(h => (
                <th key={h} style={{ padding: '10px 16px', fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: 'left', borderBottom: '1px solid #F1F5F9' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={5} style={{ padding: 40, textAlign: 'center', color: '#94A3B8' }}>Loading…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={5} style={{ padding: 48, textAlign: 'center', color: '#94A3B8', fontSize: 13 }}>No bulletins found. Click "Add Bulletin" to create one.</td></tr>
            ) : filtered.map((b, i) => (
              <tr key={b.id || i} style={{ borderBottom: '1px solid #F8FAFC' }}
                onMouseEnter={e => e.currentTarget.style.background = '#FAFBFF'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                <td style={{ padding: '12px 16px' }}>
                  <span style={{ fontSize: 12, background: '#F0F4FF', color: '#4F46E5', borderRadius: 6, padding: '3px 8px', fontWeight: 600 }}>{b.category || 'General'}</span>
                </td>
                <td style={{ padding: '12px 16px', fontSize: 13, fontWeight: 600, color: '#0F172A' }}>{b.title}</td>
                <td style={{ padding: '12px 16px', fontSize: 12, color: '#64748B' }}>{b.created_at ? new Date(b.created_at).toLocaleDateString('en-IN') : '—'}</td>
                <td style={{ padding: '12px 16px', fontSize: 12, color: '#64748B' }}>{b.rank || 1}</td>
                <td style={{ padding: '12px 16px' }}>
                  <button onClick={() => deleteMut.mutate(b.id)} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 10px', border: '1px solid #FEE2E2', borderRadius: 6, fontSize: 11, color: '#EF4444', background: 'transparent', cursor: 'pointer', fontWeight: 600 }}>
                    <Trash2 size={12} /> Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal */}
      {modal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#fff', borderRadius: 16, padding: 28, width: 500, maxWidth: '95vw' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h2 style={{ fontSize: 16, fontWeight: 800, color: '#0F172A', margin: 0 }}>Add Bulletin</h2>
              <button onClick={() => setModal(false)} style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}><X size={18} color="#64748B" /></button>
            </div>
            <div style={{ display: 'grid', gap: 14 }}>
              <div>
                <label style={lbl}>Category</label>
                <select value={form.category} onChange={e => setForm(p => ({ ...p, category: e.target.value }))}
                  style={{ width: '100%', padding: '9px 12px', border: '1px solid #E2E8F0', borderRadius: 8, fontSize: 13, background: '#F8FAFC', outline: 'none' }}>
                  {CATS.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>Title</label>
                <input value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} placeholder="Bulletin title"
                  style={{ width: '100%', padding: '9px 12px', border: '1px solid #E2E8F0', borderRadius: 8, fontSize: 13, background: '#F8FAFC', outline: 'none', boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={lbl}>Content</label>
                <textarea value={form.content} onChange={e => setForm(p => ({ ...p, content: e.target.value }))} rows={4} placeholder="Bulletin content…"
                  style={{ width: '100%', padding: '9px 12px', border: '1px solid #E2E8F0', borderRadius: 8, fontSize: 13, background: '#F8FAFC', outline: 'none', resize: 'vertical', boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={lbl}>Expiry Date (optional)</label>
                <input type="date" value={form.expiry_date} onChange={e => setForm(p => ({ ...p, expiry_date: e.target.value }))}
                  style={{ width: '100%', padding: '9px 12px', border: '1px solid #E2E8F0', borderRadius: 8, fontSize: 13, background: '#F8FAFC', outline: 'none', boxSizing: 'border-box' }} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
              <button onClick={() => setModal(false)} style={{ padding: '9px 18px', border: '1px solid #E2E8F0', borderRadius: 8, fontSize: 13, cursor: 'pointer', background: '#F8FAFC', color: '#64748B', fontWeight: 600 }}>Cancel</button>
              <button onClick={() => createMut.mutate()} disabled={!form.title || createMut.isPending}
                style={{ padding: '9px 18px', background: B.purple, color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                {createMut.isPending ? 'Adding…' : 'Add Bulletin'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
