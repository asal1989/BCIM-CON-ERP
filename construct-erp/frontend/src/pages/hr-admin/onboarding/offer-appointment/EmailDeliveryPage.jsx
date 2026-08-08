// src/pages/hr-admin/onboarding/offer-appointment/EmailDeliveryPage.jsx
// Best-effort delivery view: sent_at from our own DB (real send confirmation
// from mail.service.js), opened_at recorded when the candidate visits their
// portal link (same convention as the vendor-rfq portal's opened_at — there
// is no email-open-pixel tracking anywhere in this codebase, so that's a
// genuine, documented gap rather than something faked here).
import React from 'react';
import { motion } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Mail, ArrowLeft, CheckCircle2, Eye } from 'lucide-react';
import { hrOffersAPI } from '../../../../api/client';
import { B, fade } from '../../../../components/hr/DashboardKit';

function fmtDate(d) { return d ? new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'; }

export default function EmailDeliveryPage() {
  const navigate = useNavigate();
  const { data, isLoading } = useQuery({ queryKey: ['offer-email-log'], queryFn: () => hrOffersAPI.emailLog().then(r => r.data.data) });
  const rows = data || [];

  return (
    <div className="min-h-screen p-4 md:p-6" style={{ background: B.bg }}>
      <button onClick={() => navigate('/hr-admin/onboarding/offer-appointment')} className="flex items-center gap-1.5 text-sm font-bold text-gray-500 hover:text-gray-700 mb-4">
        <ArrowLeft className="w-4 h-4" /> Back to Offer &amp; Appointment Dashboard
      </button>
      <motion.div {...fade(0)} className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: `${B.blue}18` }}><Mail className="w-5 h-5" style={{ color: B.blue }} /></div>
        <div><h1 className="text-xl font-black text-gray-900">Email &amp; Delivery</h1><p className="text-xs text-gray-400">{rows.length} email(s) sent</p></div>
      </motion.div>

      <div className="space-y-2">
        {isLoading && <p className="text-sm text-gray-400 text-center py-10">Loading...</p>}
        {!isLoading && rows.length === 0 && <p className="text-sm text-gray-400 text-center py-10">No emails sent yet.</p>}
        {rows.map((r, i) => (
          <motion.div key={`${r.type}-${r.id}`} {...fade(0.05 + i * 0.02)} className="bg-white rounded-xl p-3 border border-gray-100 flex flex-wrap items-center gap-3" style={{ boxShadow: '0 2px 8px rgba(10,31,92,0.05)' }}>
            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 flex-shrink-0 capitalize">{r.type}</span>
            <span className="text-sm font-bold text-gray-800 flex-1 min-w-[140px]">{r.candidate_name}</span>
            <span className="text-xs text-gray-400">{r.candidate_email}</span>
            <span className="text-[11px] text-gray-400 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" style={{ color: B.success }} /> Sent {fmtDate(r.sent_at)}</span>
            {r.opened_at && <span className="text-[11px] text-gray-400 flex items-center gap-1"><Eye className="w-3 h-3" /> Opened {fmtDate(r.opened_at)}</span>}
          </motion.div>
        ))}
      </div>
    </div>
  );
}
