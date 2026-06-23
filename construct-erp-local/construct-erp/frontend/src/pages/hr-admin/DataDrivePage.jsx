// src/pages/hr-admin/DataDrivePage.jsx
import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Database, Send, CheckCircle, Clock, AlertCircle, ChevronDown } from 'lucide-react';
import toast from 'react-hot-toast';
import axios from 'axios';

const B = { purple: '#7C3AED' };
const API = axios.create({ baseURL: '/api', withCredentials: true });

const DRIVES = [
  { id: 'aadhaar', label: 'Aadhaar Collection', icon: '🪪', desc: 'Collect Aadhaar numbers and verify identity for all employees.' },
  { id: 'bank', label: 'Bank Details', icon: '🏦', desc: 'Collect bank account and IFSC details for salary disbursement.' },
  { id: 'vaccination', label: 'Vaccination Records', icon: '💉', desc: 'Collect COVID and other vaccination certificates from employees.' },
  { id: 'emergency', label: 'Emergency Contact', icon: '🆘', desc: 'Collect emergency contact details for all active employees.' },
];

const fetchDriveStatus = (driveId) => API.get(`/hr/data-drive/${driveId}`).then(r => r.data);

function DriveCard({ drive }) {
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState(false);

  const { data } = useQuery({ queryKey: ['data-drive', drive.id], queryFn: () => fetchDriveStatus(drive.id) });
  const stats = data?.data || { total: 0, collected: 0, pending: 0 };
  const pct = stats.total ? Math.round((stats.collected / stats.total) * 100) : 0;

  const initiateMut = useMutation({
    mutationFn: () => API.post(`/hr/data-drive/${drive.id}/initiate`),
    onSuccess: () => { toast.success(`${drive.label} drive initiated`); qc.invalidateQueries({ queryKey: ['data-drive', drive.id] }); },
    onError: e => toast.error(e?.response?.data?.error || 'Failed'),
  });

  const remindMut = useMutation({
    mutationFn: () => API.post(`/hr/data-drive/${drive.id}/remind`),
    onSuccess: () => toast.success('Reminders sent'),
    onError: () => toast.error('Failed to send reminders'),
  });

  return (
    <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, overflow: 'hidden', marginBottom: 16 }}>
      <div style={{ padding: '20px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
        onClick={() => setExpanded(!expanded)}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: '#F5F3FF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>{drive.icon}</div>
          <div>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: '#0F172A', margin: 0 }}>{drive.label}</h3>
            <p style={{ fontSize: 12, color: '#64748B', margin: 0 }}>{drive.desc}</p>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          {/* Progress */}
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: B.purple }}>{pct}%</div>
            <div style={{ fontSize: 11, color: '#64748B' }}>{stats.collected} / {stats.total} collected</div>
          </div>
          <div style={{ width: 60, height: 60, borderRadius: '50%', position: 'relative', flexShrink: 0 }}>
            <svg viewBox="0 0 36 36" style={{ transform: 'rotate(-90deg)' }}>
              <circle cx="18" cy="18" r="15" fill="none" stroke="#F1F5F9" strokeWidth="3" />
              <circle cx="18" cy="18" r="15" fill="none" stroke={B.purple} strokeWidth="3"
                strokeDasharray={`${pct * 0.942} 94.2`} />
            </svg>
          </div>
          <ChevronDown size={18} color="#94A3B8" style={{ transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
        </div>
      </div>

      {expanded && (
        <div style={{ borderTop: '1px solid #F1F5F9', padding: '20px 24px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 20 }}>
            {[
              { label: 'Total Employees', value: stats.total, icon: <Clock size={14} color="#64748B" /> },
              { label: 'Collected', value: stats.collected, icon: <CheckCircle size={14} color="#10B981" />, color: '#15803D' },
              { label: 'Pending', value: stats.pending, icon: <AlertCircle size={14} color="#F59E0B" />, color: '#B45309' },
            ].map(({ label, value, icon, color }) => (
              <div key={label} style={{ background: '#F8FAFC', borderRadius: 10, padding: '14px 16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#64748B', fontWeight: 700, textTransform: 'uppercase', marginBottom: 6 }}>{icon} {label}</div>
                <div style={{ fontSize: 24, fontWeight: 800, color: color || '#0F172A' }}>{value}</div>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={() => initiateMut.mutate()} disabled={initiateMut.isPending}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 18px', background: B.purple, color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
              <Database size={14} /> {initiateMut.isPending ? 'Initiating…' : 'Initiate Drive'}
            </button>
            <button onClick={() => remindMut.mutate()} disabled={remindMut.isPending}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 18px', background: '#fff', color: B.purple, border: `1px solid ${B.purple}`, borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
              <Send size={14} /> {remindMut.isPending ? 'Sending…' : 'Send Reminder'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function DataDrivePage() {
  return (
    <div style={{ padding: '28px 32px', maxWidth: 1000, margin: '0 auto' }}>
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: '#7C3AED15', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Database size={18} color={B.purple} />
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0F172A', margin: 0 }}>Data Drive</h1>
        </div>
        <p style={{ fontSize: 13, color: '#64748B', margin: 0 }}>Initiate data collection drives to capture essential employee information — Aadhaar, bank details, vaccination records, and emergency contacts.</p>
      </div>

      {DRIVES.map(drive => <DriveCard key={drive.id} drive={drive} />)}
    </div>
  );
}
