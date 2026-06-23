// src/pages/hr-admin/LetterTemplatePage.jsx
import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { FileText, Edit2, Download, ToggleLeft, ToggleRight, Plus, X } from 'lucide-react';
import toast from 'react-hot-toast';
import axios from 'axios';

const B = { purple: '#7C3AED' };
const lbl = { fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 6 };
const API = axios.create({ baseURL: '/api', withCredentials: true });

const DEFAULT_TEMPLATES = [
  { name: 'Appointment Order', enabled: true, last_modified: null },
  { name: 'Confirmation Letter', enabled: true, last_modified: null },
  { name: 'Copy of Appointment Order', enabled: false, last_modified: null },
  { name: 'Copy of Offer Letter', enabled: false, last_modified: null },
  { name: 'Location Transfer Letter', enabled: true, last_modified: null },
  { name: 'Offer Letter', enabled: true, last_modified: null },
  { name: 'Promotion Letter', enabled: true, last_modified: null },
  { name: 'Relieving Letter', enabled: true, last_modified: null },
  { name: 'Experience Letter', enabled: true, last_modified: null },
];

const fetchTemplates = () => API.get('/hr/letter-templates').then(r => r.data);

export default function LetterTemplatePage() {
  const qc = useQueryClient();
  const [modal, setModal] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [form, setForm] = useState({ name: '', body: '' });

  const { data, isLoading } = useQuery({ queryKey: ['letter-templates'], queryFn: fetchTemplates });
  const templates = data?.data?.length ? data.data : DEFAULT_TEMPLATES;

  const toggleMut = useMutation({
    mutationFn: ({ id, enabled }) => API.patch(`/hr/letter-templates/${id}`, { enabled }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['letter-templates'] }),
    onError: () => toast.error('Update failed'),
  });

  const saveMut = useMutation({
    mutationFn: () => editItem?.id ? API.put(`/hr/letter-templates/${editItem.id}`, form) : API.post('/hr/letter-templates', form),
    onSuccess: () => { toast.success(editItem?.id ? 'Template updated' : 'Template added'); qc.invalidateQueries({ queryKey: ['letter-templates'] }); setModal(false); },
    onError: e => toast.error(e?.response?.data?.error || 'Failed'),
  });

  const openEdit = (t) => { setEditItem(t); setForm({ name: t.name, body: t.body || '' }); setModal(true); };

  return (
    <div style={{ padding: '28px 32px', maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: '#7C3AED15', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <FileText size={18} color={B.purple} />
          </div>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0F172A', margin: 0 }}>Letter Templates</h1>
            <p style={{ fontSize: 13, color: '#64748B', margin: 0 }}>Manage HR letter templates — enable, edit, or download configured letter formats.</p>
          </div>
        </div>
        <button onClick={() => { setEditItem(null); setForm({ name: '', body: '' }); setModal(true); }}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 18px', background: B.purple, color: '#fff', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
          <Plus size={15} /> New Template
        </button>
      </div>

      {/* Table */}
      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#F8FAFC' }}>
              {['Letter Name', 'Status', 'Last Modified', 'Actions'].map(h => (
                <th key={h} style={{ padding: '10px 20px', fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: 'left', borderBottom: '1px solid #F1F5F9' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={4} style={{ padding: 40, textAlign: 'center', color: '#94A3B8' }}>Loading…</td></tr>
            ) : templates.map((t, i) => (
              <tr key={t.id || i} style={{ borderBottom: '1px solid #F8FAFC' }}
                onMouseEnter={e => e.currentTarget.style.background = '#FAFBFF'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                <td style={{ padding: '14px 20px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 32, height: 32, borderRadius: 8, background: '#F5F3FF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <FileText size={14} color={B.purple} />
                    </div>
                    <span style={{ fontSize: 14, fontWeight: 600, color: '#0F172A' }}>{t.name}</span>
                  </div>
                </td>
                <td style={{ padding: '14px 20px' }}>
                  <button onClick={() => t.id && toggleMut.mutate({ id: t.id, enabled: !t.enabled })}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px', border: 'none', borderRadius: 20, cursor: t.id ? 'pointer' : 'default', background: t.enabled ? '#ECFDF5' : '#F8FAFC', fontSize: 12, fontWeight: 700, color: t.enabled ? '#15803D' : '#94A3B8' }}>
                    {t.enabled ? <ToggleRight size={16} color="#10B981" /> : <ToggleLeft size={16} color="#CBD5E1" />}
                    {t.enabled ? 'Enabled' : 'Disabled'}
                  </button>
                </td>
                <td style={{ padding: '14px 20px', fontSize: 12, color: '#64748B' }}>
                  {t.last_modified ? new Date(t.last_modified).toLocaleDateString('en-IN') : 'Not configured'}
                </td>
                <td style={{ padding: '14px 20px' }}>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => openEdit(t)}
                      style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 12px', border: '1px solid #E2E8F0', borderRadius: 8, fontSize: 12, fontWeight: 600, color: '#4F46E5', background: 'transparent', cursor: 'pointer' }}>
                      <Edit2 size={12} /> Edit
                    </button>
                    {t.url && (
                      <a href={t.url} download style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 12px', border: '1px solid #E2E8F0', borderRadius: 8, fontSize: 12, fontWeight: 600, color: '#64748B', textDecoration: 'none' }}>
                        <Download size={12} /> Download
                      </a>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Edit Modal */}
      {modal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#fff', borderRadius: 16, padding: 28, width: 640, maxWidth: '95vw' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h2 style={{ fontSize: 16, fontWeight: 800, color: '#0F172A', margin: 0 }}>{editItem ? 'Edit Template' : 'New Template'}</h2>
              <button onClick={() => setModal(false)} style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}><X size={18} color="#64748B" /></button>
            </div>
            <div style={{ display: 'grid', gap: 14 }}>
              <div>
                <label style={lbl}>Template Name</label>
                <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Appointment Letter"
                  style={{ width: '100%', padding: '9px 12px', border: '1px solid #E2E8F0', borderRadius: 8, fontSize: 13, background: '#F8FAFC', outline: 'none', boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={lbl}>Template Body</label>
                <div style={{ fontSize: 11, color: '#94A3B8', marginBottom: 6 }}>Use placeholders: {'{{'} employee_name {'}}'}, {'{{'} designation {'}}'}, {'{{'} department {'}}'}, {'{{'} joining_date {'}}'}</div>
                <textarea value={form.body} onChange={e => setForm(p => ({ ...p, body: e.target.value }))} rows={10} placeholder="Enter letter body with placeholders…"
                  style={{ width: '100%', padding: '9px 12px', border: '1px solid #E2E8F0', borderRadius: 8, fontSize: 13, background: '#F8FAFC', outline: 'none', resize: 'vertical', boxSizing: 'border-box', fontFamily: 'monospace' }} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
              <button onClick={() => setModal(false)} style={{ padding: '9px 18px', border: '1px solid #E2E8F0', borderRadius: 8, fontSize: 13, cursor: 'pointer', background: '#F8FAFC', color: '#64748B', fontWeight: 600 }}>Cancel</button>
              <button onClick={() => saveMut.mutate()} disabled={!form.name || saveMut.isPending}
                style={{ padding: '9px 18px', background: B.purple, color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                {saveMut.isPending ? 'Saving…' : 'Save Template'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
