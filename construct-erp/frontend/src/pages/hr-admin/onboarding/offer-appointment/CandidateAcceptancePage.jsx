// src/pages/hr-admin/onboarding/offer-appointment/CandidateAcceptancePage.jsx
// HR-side view of candidate responses. The candidate themselves responds via
// the public token link (see pages/public/CandidateOfferPortalPage.jsx),
// not through this authenticated page.
import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, ArrowLeft, Search, Clock, XCircle, MessageSquare } from 'lucide-react';
import { hrOffersAPI } from '../../../../api/client';
import { B, fade } from '../../../../components/hr/DashboardKit';

const STATUS_META = {
  pending: { label: 'Pending', bg: 'bg-amber-50', text: 'text-amber-600', icon: Clock },
  accepted: { label: 'Accepted', bg: 'bg-emerald-50', text: 'text-emerald-600', icon: CheckCircle2 },
  declined: { label: 'Declined', bg: 'bg-red-50', text: 'text-red-500', icon: XCircle },
  expired: { label: 'Expired', bg: 'bg-gray-100', text: 'text-gray-400', icon: Clock },
};
function fmtDate(d) { return d ? new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'; }

export default function CandidateAcceptancePage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const { data: offers, isLoading } = useQuery({ queryKey: ['offer-requests', search], queryFn: () => hrOffersAPI.requests({ search: search || undefined }).then(r => r.data.data) });

  const sentOffers = (offers || []).filter(o => ['sent', 'accepted', 'declined'].includes(o.status));

  return (
    <div className="min-h-screen p-4 md:p-6" style={{ background: B.bg }}>
      <button onClick={() => navigate('/hr-admin/onboarding/offer-appointment')} className="flex items-center gap-1.5 text-sm font-bold text-gray-500 hover:text-gray-700 mb-4">
        <ArrowLeft className="w-4 h-4" /> Back to Offer &amp; Appointment Dashboard
      </button>
      <motion.div {...fade(0)} className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: `${B.blue}18` }}><CheckCircle2 className="w-5 h-5" style={{ color: B.blue }} /></div>
        <div><h1 className="text-xl font-black text-gray-900">Candidate Acceptance</h1><p className="text-xs text-gray-400">Candidates respond via a secure link emailed with their offer letter</p></div>
      </motion.div>

      <motion.div {...fade(0.05)} className="bg-white rounded-2xl p-3 mb-4 border border-gray-100 relative" style={{ boxShadow: '0 2px 12px rgba(10,31,92,0.06)' }}>
        <Search className="w-4 h-4 text-gray-400 absolute left-6 top-1/2 -translate-y-1/2" />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by candidate or offer number..." className="w-full text-sm pl-9 pr-3 py-2 rounded-lg border border-gray-200 focus:outline-none focus:border-blue-300" />
      </motion.div>

      <div className="space-y-3">
        {isLoading && <p className="text-sm text-gray-400 text-center py-10">Loading...</p>}
        {!isLoading && sentOffers.length === 0 && <p className="text-sm text-gray-400 text-center py-10">No offers sent yet.</p>}
        {sentOffers.map((o, i) => {
          const status = o.status === 'sent' ? 'pending' : o.status === 'accepted' ? 'accepted' : 'declined';
          const meta = STATUS_META[status];
          return (
            <motion.div key={o.id} {...fade(0.08 + i * 0.02)} className="bg-white rounded-2xl p-4 border border-gray-100 flex flex-wrap items-center gap-3" style={{ boxShadow: '0 2px 8px rgba(10,31,92,0.05)' }}>
              <div className="flex-1 min-w-[180px]">
                <p className="text-sm font-bold text-gray-900">{o.candidate_name}</p>
                <p className="text-xs text-gray-400">{o.offer_number} · Updated {fmtDate(o.updated_at)}</p>
              </div>
              <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 ${meta.bg} ${meta.text}`}>
                <meta.icon className="w-3 h-3" /> {meta.label}
              </span>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
