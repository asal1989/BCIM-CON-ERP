// src/pages/hr-admin/SeparationPage.jsx
import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { LogOut, Search, Plus, X, Calendar, FileText } from 'lucide-react';
import { hrEmployeesAPI } from '../../api/client';
import axios from 'axios';
import toast from 'react-hot-toast';

const API = axios.create({ baseURL: '/api', withCredentials: true });
const B = { purple: '#7C3AED' };
const inp = 'w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-gray-50 focus:outline-none focus:border-purple-400';
const lbl = { fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 6 };

const REASONS = ['Resignation', 'Retirement', 'Termination', 'End of Contract', 'Absconding', 'Death', 'Other'];

export default function SeparationPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [empId, setEmpId]   = useState(null);
  const [empName, setEmpName] = useState('');
  const [modal, setModal]   = useState(false);
  const [form, setForm]     = useState({ resignation_date: '', last_working_day: '', reason: '', remarks: '' });

  const { data: empData } = useQuery({
    queryKey: ['hr-employees-sep', search],
    queryFn: () => hrEmployeesAPI.list({ search, status: 'active' }).then(r => r.data),
    enabled: search.length > 1,
  });
  const employees = empData?.data || [];

  const { data: sepData, isLoading } = useQuery({
    queryKey: ['hr-separation', empId],
    queryFn: () => API.get(`/hr/separation/${empId}`).then(r => r.data),
    enabled: !!empId,
  });
  const sep = sepData?.data;

  const saveMut = useMutation({
    mutationFn: () => API.post(`/hr/separation/${empId}`, form).then(r => r.data),
    onSuccess: () => { toast.success('Separation details saved'); qc.invalidateQueries({ queryKey: ['hr-separation', empId] }); setModal(false); },
    onError: e => toast.error(e?.response?.data?.error || 'Failed to save'),
  });

  return (
    <div style={{ padding: '28px 32px', maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: '#7C3AED15', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <LogOut size={18} color={B.purple} />
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0F172A', margin: 0 }}>Separation</h1>
        </div>
        <p style={{ fontSize: 13, color: '#64748B', margin: 0 }}>Add and manage employee separation details — resignation date, last working day, and clearance status.</p>
      </div>

      {/* Search */}
      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, padding: 20, marginBottom: 24 }}>
        <label style={lbl}>Search Employee (Current)</label>
        <div style={{ position: 'relative', maxWidth: 400 }}>
          <Search size={15} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94A3B8' }} />
          <input
            value={search}
            onChange={e => { setSearch(e.target.value); setEmpId(null); setEmpName(''); }}
            placeholder="Search by Emp No / Name"
            style={{ width: '100%', paddingLeft: 34, paddingRight: 12, paddingTop: 9, paddingBottom: 9, border: '1px solid #E2E8F0', borderRadius: 8, fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
          />
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

      {!empId && (
        <div style={{ background: '#F8FAFC', border: '1px dashed #CBD5E1', borderRadius: 14, padding: 60, textAlign: 'center' }}>
          <LogOut size={40} color="#CBD5E1" style={{ marginBottom: 12 }} />
          <p style={{ fontSize: 14, color: '#94A3B8', fontWeight: 600 }}>Start searching to see specific employee details here</p>
        </div>
      )}

      {empId && (
        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid #F1F5F9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: '#0F172A', margin: 0 }}>Separation Details — {empName}</h3>
            <button onClick={() => { setForm({ resignation_date: sep?.resignation_date || '', last_working_day: sep?.last_working_day || '', reason: sep?.reason || '', remarks: sep?.remarks || '' }); setModal(true); }}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', background: B.purple, color: '#fff', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
              <Plus size={14} /> {sep ? 'Edit' : 'Add Separation'}
            </button>
          </div>
          {isLoading ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#94A3B8' }}>Loading...</div>
          ) : !sep ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#94A3B8', fontSize: 13 }}>No separation details found. Click "Add Separation" to add.</div>
          ) : (
            <div style={{ padding: 24, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 20 }}>
              {[
                { label: 'Resignation Date', value: sep.resignation_date, icon: Calendar },
                { label: 'Last Working Day',  value: sep.last_working_day, icon: Calendar },
                { label: 'Reason',            value: sep.reason,           icon: FileText },
                { label: 'Remarks',           value: sep.remarks,          icon: FileText },
                { label: 'Clearance Status',  value: sep.clearance_status || 'Pending', icon: FileText },
              ].map(({ label, value, icon: Icon }) => (
                <div key={label}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>{label}</div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#0F172A', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Icon size={13} color="#64748B" /> {value || '—'}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Modal */}
      {modal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#fff', borderRadius: 16, padding: 28, width: 480, maxWidth: '95vw' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h2 style={{ fontSize: 16, fontWeight: 800, color: '#0F172A', margin: 0 }}>Separation Details</h2>
              <button onClick={() => setModal(false)} style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}><X size={18} color="#64748B" /></button>
            </div>
            <div style={{ display: 'grid', gap: 14 }}>
              {[
                { key: 'resignation_date', label: 'Resignation Date', type: 'date' },
                { key: 'last_working_day', label: 'Last Working Day',  type: 'date' },
              ].map(f => (
                <div key={f.key}>
                  <label style={lbl}>{f.label}</label>
                  <input type={f.type} value={form[f.key]} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                    style={{ width: '100%', padding: '9px 12px', border: '1px solid #E2E8F0', borderRadius: 8, fontSize: 13, background: '#F8FAFC', outline: 'none', boxSizing: 'border-box' }} />
                </div>
              ))}
              <div>
                <label style={lbl}>Reason</label>
                <select value={form.reason} onChange={e => setForm(p => ({ ...p, reason: e.target.value }))}
                  style={{ width: '100%', padding: '9px 12px', border: '1px solid #E2E8F0', borderRadius: 8, fontSize: 13, background: '#F8FAFC', outline: 'none' }}>
                  <option value="">Select reason</option>
                  {REASONS.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>Remarks</label>
                <textarea value={form.remarks} onChange={e => setForm(p => ({ ...p, remarks: e.target.value }))} rows={3}
                  style={{ width: '100%', padding: '9px 12px', border: '1px solid #E2E8F0', borderRadius: 8, fontSize: 13, background: '#F8FAFC', outline: 'none', resize: 'vertical', boxSizing: 'border-box' }} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
              <button onClick={() => setModal(false)} style={{ padding: '9px 18px', border: '1px solid #E2E8F0', borderRadius: 8, fontSize: 13, cursor: 'pointer', background: '#F8FAFC', color: '#64748B', fontWeight: 600 }}>Cancel</button>
              <button onClick={() => saveMut.mutate()} disabled={saveMut.isPending}
                style={{ padding: '9px 18px', background: B.purple, color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                {saveMut.isPending ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
