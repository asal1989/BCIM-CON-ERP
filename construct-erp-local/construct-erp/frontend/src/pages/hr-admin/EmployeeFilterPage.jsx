// src/pages/hr-admin/EmployeeFilterPage.jsx
import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Filter, Plus, X, Edit2, Trash2, Share2, Lock } from 'lucide-react';
import toast from 'react-hot-toast';
import axios from 'axios';

const B = { purple: '#7C3AED' };
const lbl = { fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 6 };
const API = axios.create({ baseURL: '/api', withCredentials: true });

const FILTER_FIELDS = ['Department', 'Designation', 'Location', 'Gender', 'Employment Type', 'Status', 'Grade', 'Join Date Range', 'Age Range', 'Experience Range'];
const OPERATORS = ['equals', 'not equals', 'contains', 'is any of', 'is before', 'is after', 'between'];
const EMPTY = { name: '', description: '', is_shared: false, conditions: [{ field: 'Department', operator: 'equals', value: '' }] };

const fetchFilters = () => API.get('/hr/filters').then(r => r.data);

export default function EmployeeFilterPage() {
  const qc = useQueryClient();
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);

  const { data, isLoading } = useQuery({ queryKey: ['hr-filters'], queryFn: fetchFilters });
  const filters = data?.data || [];

  const openAdd = () => { setForm(EMPTY); setEditing(null); setModal(true); };
  const openEdit = (f) => { setForm({ name: f.name, description: f.description || '', is_shared: !!f.is_shared, conditions: f.conditions || EMPTY.conditions }); setEditing(f.id); setModal(true); };

  const addCondition = () => setForm(p => ({ ...p, conditions: [...p.conditions, { field: 'Department', operator: 'equals', value: '' }] }));
  const removeCondition = (i) => setForm(p => ({ ...p, conditions: p.conditions.filter((_, idx) => idx !== i) }));
  const updateCondition = (i, key, val) => setForm(p => ({ ...p, conditions: p.conditions.map((c, idx) => idx === i ? { ...c, [key]: val } : c) }));

  const saveMut = useMutation({
    mutationFn: () => editing ? API.put(`/hr/filters/${editing}`, form) : API.post('/hr/filters', form),
    onSuccess: () => { toast.success(editing ? 'Filter updated' : 'Filter created'); qc.invalidateQueries({ queryKey: ['hr-filters'] }); setModal(false); },
    onError: e => toast.error(e?.response?.data?.error || 'Failed'),
  });

  const deleteMut = useMutation({
    mutationFn: (id) => API.delete(`/hr/filters/${id}`),
    onSuccess: () => { toast.success('Filter deleted'); qc.invalidateQueries({ queryKey: ['hr-filters'] }); },
    onError: () => toast.error('Delete failed'),
  });

  return (
    <div style={{ padding: '28px 32px', maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: '#7C3AED15', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Filter size={18} color={B.purple} />
          </div>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0F172A', margin: 0 }}>Employee Filters</h1>
            <p style={{ fontSize: 13, color: '#64748B', margin: 0 }}>Save dynamic filter criteria to quickly segment employees for reports and communications.</p>
          </div>
        </div>
        <button onClick={openAdd}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 18px', background: B.purple, color: '#fff', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
          <Plus size={15} /> New Filter
        </button>
      </div>

      {/* Filters List */}
      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#F8FAFC' }}>
              {['Filter Name', 'Conditions', 'Visibility', 'Actions'].map(h => (
                <th key={h} style={{ padding: '10px 20px', fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: 'left', borderBottom: '1px solid #F1F5F9' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={4} style={{ padding: 40, textAlign: 'center', color: '#94A3B8' }}>Loading…</td></tr>
            ) : filters.length === 0 ? (
              <tr><td colSpan={4} style={{ padding: 48, textAlign: 'center', color: '#94A3B8', fontSize: 13 }}>No saved filters. Create your first filter.</td></tr>
            ) : filters.map((f, i) => (
              <tr key={f.id || i} style={{ borderBottom: '1px solid #F8FAFC' }}
                onMouseEnter={e => e.currentTarget.style.background = '#FAFBFF'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                <td style={{ padding: '14px 20px' }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#0F172A' }}>{f.name}</div>
                  {f.description && <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 2 }}>{f.description}</div>}
                </td>
                <td style={{ padding: '14px 20px' }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {(f.conditions || []).slice(0, 3).map((c, ci) => (
                      <span key={ci} style={{ fontSize: 11, background: '#F0F4FF', color: '#4F46E5', borderRadius: 6, padding: '2px 8px', fontWeight: 600 }}>
                        {c.field} {c.operator} {c.value}
                      </span>
                    ))}
                    {(f.conditions || []).length > 3 && (
                      <span style={{ fontSize: 11, color: '#64748B', padding: '2px 4px' }}>+{f.conditions.length - 3} more</span>
                    )}
                  </div>
                </td>
                <td style={{ padding: '14px 20px' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 700, borderRadius: 6, padding: '3px 8px', background: f.is_shared ? '#ECFDF5' : '#F8FAFC', color: f.is_shared ? '#15803D' : '#64748B' }}>
                    {f.is_shared ? <Share2 size={11} /> : <Lock size={11} />} {f.is_shared ? 'Shared' : 'Private'}
                  </span>
                </td>
                <td style={{ padding: '14px 20px' }}>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => openEdit(f)} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 12px', border: '1px solid #E2E8F0', borderRadius: 8, fontSize: 12, fontWeight: 600, color: '#4F46E5', background: 'transparent', cursor: 'pointer' }}><Edit2 size={12} /> Edit</button>
                    <button onClick={() => deleteMut.mutate(f.id)} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 12px', border: '1px solid #FEE2E2', borderRadius: 8, fontSize: 12, fontWeight: 600, color: '#EF4444', background: 'transparent', cursor: 'pointer' }}><Trash2 size={12} /> Delete</button>
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
          <div style={{ background: '#fff', borderRadius: 16, padding: 28, width: 600, maxWidth: '95vw', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h2 style={{ fontSize: 16, fontWeight: 800, color: '#0F172A', margin: 0 }}>{editing ? 'Edit Filter' : 'New Filter'}</h2>
              <button onClick={() => setModal(false)} style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}><X size={18} color="#64748B" /></button>
            </div>
            <div style={{ display: 'grid', gap: 14 }}>
              <div>
                <label style={lbl}>Filter Name</label>
                <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. All Active Engineers"
                  style={{ width: '100%', padding: '9px 12px', border: '1px solid #E2E8F0', borderRadius: 8, fontSize: 13, background: '#F8FAFC', outline: 'none', boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={lbl}>Conditions</label>
                {form.conditions.map((cond, i) => (
                  <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
                    <select value={cond.field} onChange={e => updateCondition(i, 'field', e.target.value)}
                      style={{ flex: 2, padding: '8px 10px', border: '1px solid #E2E8F0', borderRadius: 8, fontSize: 12, background: '#F8FAFC', outline: 'none' }}>
                      {FILTER_FIELDS.map(f => <option key={f}>{f}</option>)}
                    </select>
                    <select value={cond.operator} onChange={e => updateCondition(i, 'operator', e.target.value)}
                      style={{ flex: 2, padding: '8px 10px', border: '1px solid #E2E8F0', borderRadius: 8, fontSize: 12, background: '#F8FAFC', outline: 'none' }}>
                      {OPERATORS.map(o => <option key={o}>{o}</option>)}
                    </select>
                    <input value={cond.value} onChange={e => updateCondition(i, 'value', e.target.value)} placeholder="Value"
                      style={{ flex: 2, padding: '8px 10px', border: '1px solid #E2E8F0', borderRadius: 8, fontSize: 12, background: '#F8FAFC', outline: 'none', boxSizing: 'border-box' }} />
                    {form.conditions.length > 1 && (
                      <button onClick={() => removeCondition(i)} style={{ padding: 6, border: '1px solid #FEE2E2', borderRadius: 6, background: 'transparent', cursor: 'pointer' }}><X size={12} color="#EF4444" /></button>
                    )}
                  </div>
                ))}
                <button onClick={addCondition}
                  style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '7px 12px', border: '1px dashed #CBD5E1', borderRadius: 8, fontSize: 12, cursor: 'pointer', background: 'transparent', color: '#64748B', fontWeight: 600 }}>
                  <Plus size={12} /> Add Condition
                </button>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <input type="checkbox" id="fshared" checked={form.is_shared} onChange={e => setForm(p => ({ ...p, is_shared: e.target.checked }))} style={{ width: 16, height: 16, cursor: 'pointer' }} />
                <label htmlFor="fshared" style={{ fontSize: 13, color: '#374151', cursor: 'pointer' }}>Share with all HR admins</label>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
              <button onClick={() => setModal(false)} style={{ padding: '9px 18px', border: '1px solid #E2E8F0', borderRadius: 8, fontSize: 13, cursor: 'pointer', background: '#F8FAFC', color: '#64748B', fontWeight: 600 }}>Cancel</button>
              <button onClick={() => saveMut.mutate()} disabled={!form.name || saveMut.isPending}
                style={{ padding: '9px 18px', background: B.purple, color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                {saveMut.isPending ? 'Saving…' : editing ? 'Update' : 'Save Filter'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
