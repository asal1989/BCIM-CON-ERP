// src/pages/hr-admin/ContractDetailsPage.jsx
import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { FileSignature, Plus, X, Edit2, Trash2, Calendar } from 'lucide-react';
import toast from 'react-hot-toast';
import axios from 'axios';

const B = { purple: '#7C3AED' };
const lbl = { fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 6 };
const API = axios.create({ baseURL: '/api', withCredentials: true });

const WORK_NATURES = ['Construction', 'Civil', 'Electrical', 'Plumbing', 'Housekeeping', 'Security', 'IT Services', 'Consulting', 'Other'];

const fetchContracts = () => API.get('/hr/contracts').then(r => r.data);
const EMPTY = { firm_name: '', nature_of_work: 'Construction', start_date: '', end_date: '', employee_count: '', po_number: '', remarks: '' };

export default function ContractDetailsPage() {
  const qc = useQueryClient();
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);

  const { data, isLoading } = useQuery({ queryKey: ['hr-contracts'], queryFn: fetchContracts });
  const contracts = data?.data || [];

  const openAdd = () => { setForm(EMPTY); setEditing(null); setModal(true); };
  const openEdit = (c) => { setForm({ ...c }); setEditing(c.id); setModal(true); };

  const saveMut = useMutation({
    mutationFn: () => editing ? API.put(`/hr/contracts/${editing}`, form) : API.post('/hr/contracts', form),
    onSuccess: () => { toast.success(editing ? 'Contract updated' : 'Contract added'); qc.invalidateQueries({ queryKey: ['hr-contracts'] }); setModal(false); },
    onError: e => toast.error(e?.response?.data?.error || 'Failed'),
  });

  const deleteMut = useMutation({
    mutationFn: (id) => API.delete(`/hr/contracts/${id}`),
    onSuccess: () => { toast.success('Contract deleted'); qc.invalidateQueries({ queryKey: ['hr-contracts'] }); },
    onError: () => toast.error('Delete failed'),
  });

  const isExpired = (end) => end && new Date(end) < new Date();
  const daysLeft = (end) => {
    if (!end) return null;
    const d = Math.ceil((new Date(end) - new Date()) / 86400000);
    return d;
  };

  return (
    <div style={{ padding: '28px 32px', maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: '#7C3AED15', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <FileSignature size={18} color={B.purple} />
          </div>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0F172A', margin: 0 }}>Contract Details</h1>
            <p style={{ fontSize: 13, color: '#64748B', margin: 0 }}>Manage contractor firm agreements, terms, and workforce counts.</p>
          </div>
        </div>
        <button onClick={openAdd}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 18px', background: B.purple, color: '#fff', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
          <Plus size={15} /> Add Contract
        </button>
      </div>

      {/* Table */}
      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#F8FAFC' }}>
              {['Firm Name', 'Nature of Work', 'PO Number', 'Start Date', 'End Date', 'Emp Count', 'Status', ''].map(h => (
                <th key={h} style={{ padding: '10px 14px', fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: 'left', borderBottom: '1px solid #F1F5F9' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={8} style={{ padding: 40, textAlign: 'center', color: '#94A3B8' }}>Loading…</td></tr>
            ) : contracts.length === 0 ? (
              <tr><td colSpan={8} style={{ padding: 48, textAlign: 'center', color: '#94A3B8', fontSize: 13 }}>No contracts. Click "Add Contract" to add one.</td></tr>
            ) : contracts.map((c, i) => {
              const expired = isExpired(c.end_date);
              const days = daysLeft(c.end_date);
              return (
                <tr key={c.id || i} style={{ borderBottom: '1px solid #F8FAFC' }}
                  onMouseEnter={e => e.currentTarget.style.background = '#FAFBFF'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  <td style={{ padding: '12px 14px', fontSize: 13, fontWeight: 700, color: '#0F172A' }}>{c.firm_name}</td>
                  <td style={{ padding: '12px 14px', fontSize: 12, color: '#64748B' }}>{c.nature_of_work}</td>
                  <td style={{ padding: '12px 14px', fontSize: 12, color: '#64748B', fontFamily: 'monospace' }}>{c.po_number || '—'}</td>
                  <td style={{ padding: '12px 14px', fontSize: 12, color: '#64748B' }}>{c.start_date ? new Date(c.start_date).toLocaleDateString('en-IN') : '—'}</td>
                  <td style={{ padding: '12px 14px', fontSize: 12, color: '#64748B' }}>
                    <div>{c.end_date ? new Date(c.end_date).toLocaleDateString('en-IN') : '—'}</div>
                    {days !== null && !expired && days <= 30 && (
                      <div style={{ fontSize: 10, color: '#F59E0B', fontWeight: 700 }}>{days}d left</div>
                    )}
                  </td>
                  <td style={{ padding: '12px 14px', fontSize: 13, fontWeight: 700, color: '#0F172A', textAlign: 'center' }}>{c.employee_count || 0}</td>
                  <td style={{ padding: '12px 14px' }}>
                    <span style={{ fontSize: 11, fontWeight: 700, borderRadius: 6, padding: '3px 8px', background: expired ? '#FEF2F2' : '#F0FDF4', color: expired ? '#DC2626' : '#15803D' }}>
                      {expired ? 'Expired' : 'Active'}
                    </span>
                  </td>
                  <td style={{ padding: '12px 14px' }}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button onClick={() => openEdit(c)} style={{ padding: '5px 10px', border: '1px solid #E2E8F0', borderRadius: 6, fontSize: 11, color: '#4F46E5', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontWeight: 600 }}><Edit2 size={11} /> Edit</button>
                      <button onClick={() => deleteMut.mutate(c.id)} style={{ padding: '5px 10px', border: '1px solid #FEE2E2', borderRadius: 6, fontSize: 11, color: '#EF4444', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontWeight: 600 }}><Trash2 size={11} /> Del</button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Modal */}
      {modal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#fff', borderRadius: 16, padding: 28, width: 560, maxWidth: '95vw' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h2 style={{ fontSize: 16, fontWeight: 800, color: '#0F172A', margin: 0 }}>{editing ? 'Edit Contract' : 'Add Contract'}</h2>
              <button onClick={() => setModal(false)} style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}><X size={18} color="#64748B" /></button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div style={{ gridColumn: '1/-1' }}>
                <label style={lbl}>Firm / Contractor Name</label>
                <input value={form.firm_name} onChange={e => setForm(p => ({ ...p, firm_name: e.target.value }))} placeholder="Enter firm name"
                  style={{ width: '100%', padding: '9px 12px', border: '1px solid #E2E8F0', borderRadius: 8, fontSize: 13, background: '#F8FAFC', outline: 'none', boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={lbl}>Nature of Work</label>
                <select value={form.nature_of_work} onChange={e => setForm(p => ({ ...p, nature_of_work: e.target.value }))}
                  style={{ width: '100%', padding: '9px 12px', border: '1px solid #E2E8F0', borderRadius: 8, fontSize: 13, background: '#F8FAFC', outline: 'none' }}>
                  {WORK_NATURES.map(n => <option key={n}>{n}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>PO Number</label>
                <input value={form.po_number} onChange={e => setForm(p => ({ ...p, po_number: e.target.value }))} placeholder="PO/Work Order No."
                  style={{ width: '100%', padding: '9px 12px', border: '1px solid #E2E8F0', borderRadius: 8, fontSize: 13, background: '#F8FAFC', outline: 'none', boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={lbl}>Start Date</label>
                <input type="date" value={form.start_date} onChange={e => setForm(p => ({ ...p, start_date: e.target.value }))}
                  style={{ width: '100%', padding: '9px 12px', border: '1px solid #E2E8F0', borderRadius: 8, fontSize: 13, background: '#F8FAFC', outline: 'none', boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={lbl}>End Date</label>
                <input type="date" value={form.end_date} onChange={e => setForm(p => ({ ...p, end_date: e.target.value }))}
                  style={{ width: '100%', padding: '9px 12px', border: '1px solid #E2E8F0', borderRadius: 8, fontSize: 13, background: '#F8FAFC', outline: 'none', boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={lbl}>Employee Count</label>
                <input type="number" min="0" value={form.employee_count} onChange={e => setForm(p => ({ ...p, employee_count: e.target.value }))} placeholder="0"
                  style={{ width: '100%', padding: '9px 12px', border: '1px solid #E2E8F0', borderRadius: 8, fontSize: 13, background: '#F8FAFC', outline: 'none', boxSizing: 'border-box' }} />
              </div>
              <div style={{ gridColumn: '1/-1' }}>
                <label style={lbl}>Remarks</label>
                <textarea value={form.remarks} onChange={e => setForm(p => ({ ...p, remarks: e.target.value }))} rows={3}
                  style={{ width: '100%', padding: '9px 12px', border: '1px solid #E2E8F0', borderRadius: 8, fontSize: 13, background: '#F8FAFC', outline: 'none', resize: 'vertical', boxSizing: 'border-box' }} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
              <button onClick={() => setModal(false)} style={{ padding: '9px 18px', border: '1px solid #E2E8F0', borderRadius: 8, fontSize: 13, cursor: 'pointer', background: '#F8FAFC', color: '#64748B', fontWeight: 600 }}>Cancel</button>
              <button onClick={() => saveMut.mutate()} disabled={!form.firm_name || saveMut.isPending}
                style={{ padding: '9px 18px', background: B.purple, color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                {saveMut.isPending ? 'Saving…' : editing ? 'Update' : 'Add Contract'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
