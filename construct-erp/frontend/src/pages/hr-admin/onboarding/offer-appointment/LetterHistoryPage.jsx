// src/pages/hr-admin/onboarding/offer-appointment/LetterHistoryPage.jsx
import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { History, ArrowLeft } from 'lucide-react';
import { hrOffersAPI } from '../../../../api/client';
import { B, fade } from '../../../../components/hr/DashboardKit';

function fmtDate(d) { return d ? new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'; }

export default function LetterHistoryPage() {
  const navigate = useNavigate();
  const [entityType, setEntityType] = useState('');
  const { data, isLoading } = useQuery({ queryKey: ['offer-history', entityType], queryFn: () => hrOffersAPI.history({ entity_type: entityType || undefined }).then(r => r.data.data) });
  const events = data || [];

  return (
    <div className="min-h-screen p-4 md:p-6" style={{ background: B.bg }}>
      <button onClick={() => navigate('/hr-admin/onboarding/offer-appointment')} className="flex items-center gap-1.5 text-sm font-bold text-gray-500 hover:text-gray-700 mb-4">
        <ArrowLeft className="w-4 h-4" /> Back to Offer &amp; Appointment Dashboard
      </button>
      <motion.div {...fade(0)} className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: `${B.blue}18` }}><History className="w-5 h-5" style={{ color: B.blue }} /></div>
        <div><h1 className="text-xl font-black text-gray-900">Letter History</h1><p className="text-xs text-gray-400">{events.length} event(s)</p></div>
      </motion.div>

      <motion.div {...fade(0.05)} className="bg-white rounded-2xl p-3 mb-4 border border-gray-100 flex flex-wrap gap-2" style={{ boxShadow: '0 2px 12px rgba(10,31,92,0.06)' }}>
        {['', 'offer', 'appointment'].map(t => (
          <button key={t} onClick={() => setEntityType(t)} className="text-xs font-bold px-3 py-1.5 rounded-lg" style={entityType === t ? { background: B.blue, color: '#fff' } : { background: '#F1F5F9', color: '#64748B' }}>
            {t ? t[0].toUpperCase() + t.slice(1) : 'All'}
          </button>
        ))}
      </motion.div>

      <div className="space-y-2">
        {isLoading && <p className="text-sm text-gray-400 text-center py-10">Loading...</p>}
        {!isLoading && events.length === 0 && <p className="text-sm text-gray-400 text-center py-10">No history yet.</p>}
        {events.map((e, i) => (
          <motion.div key={e.id} {...fade(0.05 + i * 0.01)} className="bg-white rounded-xl p-3 border border-gray-100 flex flex-wrap items-center gap-3" style={{ boxShadow: '0 2px 8px rgba(10,31,92,0.05)' }}>
            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 flex-shrink-0 capitalize">{e.entity_type}</span>
            <span className="text-sm font-semibold text-gray-700 flex-1 min-w-[140px]">{e.action.replace(/_/g, ' ')}</span>
            {e.notes && <span className="text-xs text-gray-400">{e.notes}</span>}
            <span className="text-[11px] text-gray-400 flex-shrink-0">{fmtDate(e.created_at)}{e.actor_name ? ` · ${e.actor_name}` : ''}</span>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
