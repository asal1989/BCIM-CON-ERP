// src/pages/hr-admin/GenerateLetterPage.jsx
import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Mail, Search, FileText, Download } from 'lucide-react';
import { hrEmployeesAPI } from '../../api/client';
import axios from 'axios';
import toast from 'react-hot-toast';

const _API = axios.create({ baseURL: '/api', withCredentials: true });

const B = { purple: '#7C3AED' };
const lbl = { fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 6 };

const TEMPLATES = [
  'Appointment Order', 'Confirmation Letter', 'Copy of Appointment Order',
  'Copy of Offer Letter', 'Location Transfer Letter', 'Offer Letter',
  'Promotion Letter', 'Relieving Letter', 'Experience Letter',
];

export default function GenerateLetterPage() {
  const qc = useQueryClient();
  const [search, setSearch]     = useState('');
  const [empId, setEmpId]       = useState(null);
  const [empName, setEmpName]   = useState('');
  const [template, setTemplate] = useState('');

  const { data: empData } = useQuery({
    queryKey: ['hr-employees-letter', search],
    queryFn: () => hrEmployeesAPI.list({ search }).then(r => r.data),
    enabled: search.length > 1,
  });
  const employees = empData?.data || [];

  const { data: lettersData, isLoading } = useQuery({
    queryKey: ['hr-letters-issued'],
    queryFn: () => _API.get('/v1/hr-admin/advanced/letters/issues').then(r => r.data).catch(() => ({ data: [] })),
  });
  const letters = lettersData?.data || [];

  const genMut = useMutation({
    mutationFn: () => _API.post('/v1/hr-admin/advanced/letters/issues', { employee_id: empId, template_name: template }).then(r => r.data),
    onSuccess: () => { toast.success('Letter generated successfully'); qc.invalidateQueries({ queryKey: ['hr-letters-issued'] }); },
    onError: e => toast.error(e?.response?.data?.error || 'Failed to generate'),
  });

  return (
    <div style={{ padding: '28px 32px', maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: '#7C3AED15', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Mail size={18} color={B.purple} />
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0F172A', margin: 0 }}>Generate Letter</h1>
        </div>
        <p style={{ fontSize: 13, color: '#64748B', margin: 0 }}>
          Efficiently generate and publish employee letters in a few minutes — streamlining your process and saving time.
        </p>
      </div>

      {/* Generator */}
      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, padding: 24, marginBottom: 24 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 16, alignItems: 'flex-end' }}>
          <div>
            <label style={lbl}>Letter Template</label>
            <select value={template} onChange={e => setTemplate(e.target.value)}
              style={{ width: '100%', padding: '9px 12px', border: '1px solid #E2E8F0', borderRadius: 8, fontSize: 13, background: '#F8FAFC', outline: 'none' }}>
              <option value="">Select template</option>
              {TEMPLATES.map(t => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div style={{ position: 'relative' }}>
            <label style={lbl}>Employee</label>
            <div style={{ position: 'relative' }}>
              <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94A3B8' }} />
              <input value={search} onChange={e => { setSearch(e.target.value); setEmpId(null); }}
                placeholder="Search employee…"
                style={{ width: '100%', paddingLeft: 32, paddingRight: 10, paddingTop: 9, paddingBottom: 9, border: '1px solid #E2E8F0', borderRadius: 8, fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
              {search && employees.length > 0 && !empId && (
                <div style={{ position: 'absolute', top: '110%', left: 0, right: 0, background: '#fff', border: '1px solid #E2E8F0', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.1)', zIndex: 50 }}>
                  {employees.slice(0, 5).map(e => (
                    <button key={e.id} onClick={() => { setEmpId(e.id); setEmpName(e.name); setSearch(e.name); }}
                      style={{ width: '100%', padding: '9px 14px', border: 'none', background: 'transparent', cursor: 'pointer', textAlign: 'left', fontSize: 13, color: '#0F172A' }}
                      onMouseEnter={ev => ev.currentTarget.style.background = '#F8FAFC'}
                      onMouseLeave={ev => ev.currentTarget.style.background = 'transparent'}>
                      {e.name} <span style={{ color: '#64748B' }}>· {e.employee_code}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          <button onClick={() => genMut.mutate()} disabled={!empId || !template || genMut.isPending}
            style={{ padding: '9px 20px', background: (!empId || !template) ? '#CBD5E1' : B.purple, color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: (!empId || !template) ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap' }}>
            {genMut.isPending ? 'Generating…' : 'Prepare Letter'}
          </button>
        </div>
      </div>

      {/* Letters list */}
      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #F1F5F9', display: 'flex', gap: 10 }}>
          {['In Progress', 'Completed'].map(s => (
            <button key={s} style={{ padding: '5px 14px', border: '1px solid #E2E8F0', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: 'pointer', background: '#F8FAFC', color: '#64748B' }}>{s}</button>
          ))}
        </div>
        {isLoading ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#94A3B8' }}>Loading…</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#F8FAFC' }}>
                {['Letter Template', 'Employee', 'Prepared On', 'Prepared By', 'Signatories', 'Serial No', 'Actions'].map(h => (
                  <th key={h} style={{ padding: '10px 14px', fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: 'left', borderBottom: '1px solid #F1F5F9' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {letters.length === 0 ? (
                <tr><td colSpan={7} style={{ padding: 40, textAlign: 'center', color: '#94A3B8', fontSize: 13 }}>No letters generated yet.</td></tr>
              ) : letters.map((l, i) => (
                <tr key={l.id || i} style={{ borderBottom: '1px solid #F8FAFC' }}
                  onMouseEnter={e => e.currentTarget.style.background = '#FAFBFF'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  <td style={{ padding: '12px 14px', fontSize: 13, fontWeight: 600, color: '#0F172A' }}>{l.template}</td>
                  <td style={{ padding: '12px 14px', fontSize: 13, color: '#374151' }}>{l.employee_name}</td>
                  <td style={{ padding: '12px 14px', fontSize: 12, color: '#64748B' }}>{l.created_at ? new Date(l.created_at).toLocaleDateString('en-IN') : '—'}</td>
                  <td style={{ padding: '12px 14px', fontSize: 12, color: '#64748B' }}>{l.prepared_by || 'admin'}</td>
                  <td style={{ padding: '12px 14px', fontSize: 12, color: '#64748B' }}>—</td>
                  <td style={{ padding: '12px 14px', fontSize: 12, color: '#64748B' }}>{l.serial_no || '—'}</td>
                  <td style={{ padding: '12px 14px' }}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {l.url && <a href={l.url} download style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 10px', border: '1px solid #E2E8F0', borderRadius: 6, fontSize: 11, color: '#4F46E5', textDecoration: 'none', fontWeight: 600 }}><Download size={12} /> Download</a>}
                    </div>
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
