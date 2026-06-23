// src/pages/hr-admin/MassCommunicationPage.jsx
import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { MessageSquare, Send, Plus, X, Mail, Bell } from 'lucide-react';
import toast from 'react-hot-toast';
import axios from 'axios';

const B = { purple: '#7C3AED' };
const lbl = { fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 6 };
const API = axios.create({ baseURL: '/api', withCredentials: true });

const fetchMessages = () => API.get('/hr/mass-communication').then(r => r.data);
const CHANNELS = ['Email', 'In-App Notification', 'Both'];
const SEGMENTS = ['All Employees', 'Current Employees', 'Ex-Employees', 'Department-wise', 'Location-wise'];

export default function MassCommunicationPage() {
  const qc = useQueryClient();
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ subject: '', message: '', channel: 'Email', segment: 'All Employees' });
  const [tab, setTab] = useState('Sent');

  const { data, isLoading } = useQuery({ queryKey: ['mass-communication'], queryFn: fetchMessages });
  const messages = data?.data || [];

  const sendMut = useMutation({
    mutationFn: () => API.post('/hr/mass-communication', form),
    onSuccess: () => { toast.success('Message sent'); qc.invalidateQueries({ queryKey: ['mass-communication'] }); setModal(false); setForm({ subject: '', message: '', channel: 'Email', segment: 'All Employees' }); },
    onError: e => toast.error(e?.response?.data?.error || 'Failed to send'),
  });

  return (
    <div style={{ padding: '28px 32px', maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: '#7C3AED15', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <MessageSquare size={18} color={B.purple} />
          </div>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0F172A', margin: 0 }}>Mass Communication</h1>
            <p style={{ fontSize: 13, color: '#64748B', margin: 0 }}>Compose and send announcements to a group of employees at once.</p>
          </div>
        </div>
        <button onClick={() => setModal(true)}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 18px', background: B.purple, color: '#fff', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
          <Plus size={15} /> Compose
        </button>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {['Sent', 'Draft', 'Scheduled'].map(t => (
          <button key={t} onClick={() => setTab(t)}
            style={{ padding: '6px 16px', borderRadius: 20, border: `1px solid ${tab === t ? B.purple : '#E2E8F0'}`, background: tab === t ? B.purple : '#fff', color: tab === t ? '#fff' : '#64748B', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>{t}</button>
        ))}
      </div>

      {/* Table */}
      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#F8FAFC' }}>
              {['Subject', 'Segment', 'Channel', 'Sent On', 'Recipients', 'Status'].map(h => (
                <th key={h} style={{ padding: '10px 16px', fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: 'left', borderBottom: '1px solid #F1F5F9' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={6} style={{ padding: 40, textAlign: 'center', color: '#94A3B8' }}>Loading…</td></tr>
            ) : messages.filter(m => m.status?.toLowerCase() === tab.toLowerCase() || (!m.status && tab === 'Sent')).length === 0 ? (
              <tr><td colSpan={6} style={{ padding: 48, textAlign: 'center', color: '#94A3B8', fontSize: 13 }}>No messages found. Click "Compose" to send a new message.</td></tr>
            ) : messages.filter(m => m.status?.toLowerCase() === tab.toLowerCase() || (!m.status && tab === 'Sent')).map((m, i) => (
              <tr key={m.id || i} style={{ borderBottom: '1px solid #F8FAFC' }}
                onMouseEnter={e => e.currentTarget.style.background = '#FAFBFF'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                <td style={{ padding: '12px 16px', fontSize: 13, fontWeight: 600, color: '#0F172A' }}>{m.subject}</td>
                <td style={{ padding: '12px 16px', fontSize: 12, color: '#64748B' }}>{m.segment || 'All Employees'}</td>
                <td style={{ padding: '12px 16px' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, background: '#F0F4FF', color: '#4F46E5', borderRadius: 6, padding: '3px 8px', fontWeight: 600 }}>
                    {m.channel === 'Email' ? <Mail size={11} /> : <Bell size={11} />} {m.channel}
                  </span>
                </td>
                <td style={{ padding: '12px 16px', fontSize: 12, color: '#64748B' }}>{m.sent_at ? new Date(m.sent_at).toLocaleDateString('en-IN') : '—'}</td>
                <td style={{ padding: '12px 16px', fontSize: 12, color: '#64748B' }}>{m.recipient_count || 0}</td>
                <td style={{ padding: '12px 16px' }}>
                  <span style={{ fontSize: 11, fontWeight: 700, borderRadius: 6, padding: '3px 8px', background: '#F0FDF4', color: '#15803D' }}>Delivered</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal */}
      {modal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#fff', borderRadius: 16, padding: 28, width: 560, maxWidth: '95vw' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h2 style={{ fontSize: 16, fontWeight: 800, color: '#0F172A', margin: 0 }}>Compose Message</h2>
              <button onClick={() => setModal(false)} style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}><X size={18} color="#64748B" /></button>
            </div>
            <div style={{ display: 'grid', gap: 14 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div>
                  <label style={lbl}>Recipient Segment</label>
                  <select value={form.segment} onChange={e => setForm(p => ({ ...p, segment: e.target.value }))}
                    style={{ width: '100%', padding: '9px 12px', border: '1px solid #E2E8F0', borderRadius: 8, fontSize: 13, background: '#F8FAFC', outline: 'none' }}>
                    {SEGMENTS.map(s => <option key={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label style={lbl}>Channel</label>
                  <select value={form.channel} onChange={e => setForm(p => ({ ...p, channel: e.target.value }))}
                    style={{ width: '100%', padding: '9px 12px', border: '1px solid #E2E8F0', borderRadius: 8, fontSize: 13, background: '#F8FAFC', outline: 'none' }}>
                    {CHANNELS.map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label style={lbl}>Subject</label>
                <input value={form.subject} onChange={e => setForm(p => ({ ...p, subject: e.target.value }))} placeholder="Message subject"
                  style={{ width: '100%', padding: '9px 12px', border: '1px solid #E2E8F0', borderRadius: 8, fontSize: 13, background: '#F8FAFC', outline: 'none', boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={lbl}>Message</label>
                <textarea value={form.message} onChange={e => setForm(p => ({ ...p, message: e.target.value }))} rows={5} placeholder="Type your message here…"
                  style={{ width: '100%', padding: '9px 12px', border: '1px solid #E2E8F0', borderRadius: 8, fontSize: 13, background: '#F8FAFC', outline: 'none', resize: 'vertical', boxSizing: 'border-box' }} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
              <button onClick={() => setModal(false)} style={{ padding: '9px 18px', border: '1px solid #E2E8F0', borderRadius: 8, fontSize: 13, cursor: 'pointer', background: '#F8FAFC', color: '#64748B', fontWeight: 600 }}>Cancel</button>
              <button onClick={() => sendMut.mutate()} disabled={!form.subject || !form.message || sendMut.isPending}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 18px', background: B.purple, color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                <Send size={14} /> {sendMut.isPending ? 'Sending…' : 'Send Now'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
