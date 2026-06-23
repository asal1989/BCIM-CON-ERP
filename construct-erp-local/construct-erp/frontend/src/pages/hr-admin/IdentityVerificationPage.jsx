// src/pages/hr-admin/IdentityVerificationPage.jsx
import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ShieldCheck, Search, CheckCircle, XCircle, Clock } from 'lucide-react';
import { hrEmployeesAPI } from '../../api/client';
import toast from 'react-hot-toast';
import axios from 'axios';

const B = { purple: '#7C3AED' };
const API = axios.create({ baseURL: '/api', withCredentials: true });

const fetchVerifications = (params) => API.get('/hr/identity-verification', { params }).then(r => r.data);

const STATUS_COLORS = {
  Verified: { bg: '#F0FDF4', text: '#15803D' },
  Pending: { bg: '#FFFBEB', text: '#B45309' },
  Rejected: { bg: '#FEF2F2', text: '#DC2626' },
};

const StatusBadge = ({ status }) => {
  const c = STATUS_COLORS[status] || STATUS_COLORS.Pending;
  const Icon = status === 'Verified' ? CheckCircle : status === 'Rejected' ? XCircle : Clock;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700, borderRadius: 6, padding: '3px 8px', background: c.bg, color: c.text }}>
      <Icon size={11} /> {status || 'Pending'}
    </span>
  );
};

export default function IdentityVerificationPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['identity-verification', search, filterStatus],
    queryFn: () => fetchVerifications({ search, status: filterStatus }),
  });
  const records = data?.data || [];

  const updateMut = useMutation({
    mutationFn: ({ id, status }) => API.patch(`/hr/identity-verification/${id}`, { status }),
    onSuccess: () => { toast.success('Status updated'); qc.invalidateQueries({ queryKey: ['identity-verification'] }); },
    onError: () => toast.error('Update failed'),
  });

  return (
    <div style={{ padding: '28px 32px', maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: '#7C3AED15', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <ShieldCheck size={18} color={B.purple} />
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0F172A', margin: 0 }}>Identity Verification</h1>
        </div>
        <p style={{ fontSize: 13, color: '#64748B', margin: 0 }}>Verify employee identity documents — PAN card, Aadhaar, and bank account details.</p>
      </div>

      {/* Filters */}
      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, padding: 20, marginBottom: 24, display: 'flex', gap: 14, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div style={{ flex: 2, minWidth: 220 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Search Employee</div>
          <div style={{ position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94A3B8' }} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name or emp code"
              style={{ width: '100%', paddingLeft: 32, paddingRight: 10, paddingTop: 9, paddingBottom: 9, border: '1px solid #E2E8F0', borderRadius: 8, fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
          </div>
        </div>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Status</div>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
            style={{ padding: '9px 12px', border: '1px solid #E2E8F0', borderRadius: 8, fontSize: 13, background: '#F8FAFC', outline: 'none' }}>
            <option value="">All Status</option>
            <option>Pending</option>
            <option>Verified</option>
            <option>Rejected</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#F8FAFC' }}>
              {['Employee', 'PAN Number', 'PAN Status', 'Aadhaar', 'Aadhaar Status', 'Bank Account', 'Bank Status', 'Actions'].map(h => (
                <th key={h} style={{ padding: '10px 14px', fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'left', borderBottom: '1px solid #F1F5F9' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={8} style={{ padding: 40, textAlign: 'center', color: '#94A3B8' }}>Loading…</td></tr>
            ) : records.length === 0 ? (
              <tr><td colSpan={8} style={{ padding: 48, textAlign: 'center', color: '#94A3B8', fontSize: 13 }}>No records found.</td></tr>
            ) : records.map((r, i) => (
              <tr key={r.id || i} style={{ borderBottom: '1px solid #F8FAFC' }}
                onMouseEnter={e => e.currentTarget.style.background = '#FAFBFF'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                <td style={{ padding: '12px 14px' }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#0F172A' }}>{r.name}</div>
                  <div style={{ fontSize: 11, color: '#94A3B8' }}>{r.employee_code}</div>
                </td>
                <td style={{ padding: '12px 14px', fontSize: 12, color: '#374151', fontFamily: 'monospace' }}>{r.pan_number || '—'}</td>
                <td style={{ padding: '12px 14px' }}><StatusBadge status={r.pan_status} /></td>
                <td style={{ padding: '12px 14px', fontSize: 12, color: '#374151', fontFamily: 'monospace' }}>{r.aadhaar ? r.aadhaar.replace(/\d(?=\d{4})/g, '*') : '—'}</td>
                <td style={{ padding: '12px 14px' }}><StatusBadge status={r.aadhaar_status} /></td>
                <td style={{ padding: '12px 14px', fontSize: 12, color: '#374151' }}>{r.bank_account ? `****${r.bank_account.slice(-4)}` : '—'}</td>
                <td style={{ padding: '12px 14px' }}><StatusBadge status={r.bank_status} /></td>
                <td style={{ padding: '12px 14px' }}>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button onClick={() => updateMut.mutate({ id: r.id, status: 'Verified' })}
                      style={{ padding: '4px 8px', background: '#F0FDF4', color: '#15803D', border: 'none', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>Verify</button>
                    <button onClick={() => updateMut.mutate({ id: r.id, status: 'Rejected' })}
                      style={{ padding: '4px 8px', background: '#FEF2F2', color: '#DC2626', border: 'none', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>Reject</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
