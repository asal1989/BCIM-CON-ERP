// src/pages/hr-admin/onboarding/id-card/CardHistoryPage.jsx
import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { History, ArrowLeft } from 'lucide-react';
import { hrIdCardAPI } from '../../../../api/client';
import { B, fade } from '../../../../components/hr/DashboardKit';

const EVENT_META = {
  generated: { label: 'Generated', bg: 'bg-blue-50', text: 'text-blue-600' },
  printed: { label: 'Printed', bg: 'bg-emerald-50', text: 'text-emerald-600' },
  reprinted: { label: 'Reprinted', bg: 'bg-amber-50', text: 'text-amber-600' },
  lost: { label: 'Lost', bg: 'bg-red-50', text: 'text-red-500' },
  damaged: { label: 'Damaged', bg: 'bg-red-50', text: 'text-red-500' },
  reissued: { label: 'Reissued', bg: 'bg-blue-50', text: 'text-blue-600' },
  cancelled: { label: 'Cancelled', bg: 'bg-gray-100', text: 'text-gray-400' },
};
function fmtDate(d) { return d ? new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'; }

export default function CardHistoryPage() {
  const navigate = useNavigate();
  const [eventType, setEventType] = useState('');
  const { data, isLoading } = useQuery({ queryKey: ['idcard-history', eventType], queryFn: () => hrIdCardAPI.history({ event_type: eventType || undefined }).then(r => r.data.data) });
  const events = data || [];

  return (
    <div className="min-h-screen p-4 md:p-6" style={{ background: B.bg }}>
      <button onClick={() => navigate('/hr-admin/onboarding/id-card')} className="flex items-center gap-1.5 text-sm font-bold text-gray-500 hover:text-gray-700 mb-4">
        <ArrowLeft className="w-4 h-4" /> Back to ID Card Dashboard
      </button>
      <motion.div {...fade(0)} className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: `${B.blue}18` }}><History className="w-5 h-5" style={{ color: B.blue }} /></div>
        <div><h1 className="text-xl font-black text-gray-900">Card History</h1><p className="text-xs text-gray-400">{events.length} event(s)</p></div>
      </motion.div>

      <motion.div {...fade(0.05)} className="bg-white rounded-2xl p-3 mb-4 border border-gray-100 flex flex-wrap gap-2" style={{ boxShadow: '0 2px 12px rgba(10,31,92,0.06)' }}>
        {['', ...Object.keys(EVENT_META)].map(e => (
          <button key={e} onClick={() => setEventType(e)} className="text-xs font-bold px-3 py-1.5 rounded-lg"
            style={eventType === e ? { background: B.blue, color: '#fff' } : { background: '#F1F5F9', color: '#64748B' }}>
            {e ? EVENT_META[e].label : 'All'}
          </button>
        ))}
      </motion.div>

      <div className="space-y-2">
        {isLoading && <p className="text-sm text-gray-400 text-center py-10">Loading...</p>}
        {!isLoading && events.length === 0 && <p className="text-sm text-gray-400 text-center py-10">No history yet.</p>}
        {events.map((e, i) => {
          const meta = EVENT_META[e.event_type] || EVENT_META.generated;
          return (
            <motion.div key={e.id} {...fade(0.05 + i * 0.01)} className="bg-white rounded-xl p-3 border border-gray-100 flex flex-wrap items-center gap-3" style={{ boxShadow: '0 2px 8px rgba(10,31,92,0.05)' }}>
              <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${meta.bg} ${meta.text}`}>{meta.label}</span>
              <span className="text-sm font-bold text-gray-800 flex-1 min-w-[140px]">{e.employee_name} <span className="text-xs font-normal text-gray-400">({e.employee_code})</span></span>
              <span className="text-xs text-gray-400">{e.card_number || '—'}</span>
              {e.notes && <span className="text-xs text-gray-400">{e.notes}</span>}
              <span className="text-[11px] text-gray-400 flex-shrink-0">{fmtDate(e.created_at)}{e.actor_name ? ` · ${e.actor_name}` : ''}</span>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
