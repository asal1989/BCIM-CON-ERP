// src/pages/hr-admin/onboarding/offer-appointment/AppointmentLetterPage.jsx
import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { FileCheck2, ArrowLeft, Search, FilePlus2, Send, Eye, X } from 'lucide-react';
import { hrOffersAPI } from '../../../../api/client';
import { B, fade } from '../../../../components/hr/DashboardKit';

const STATUS_META = {
  draft: { label: 'Draft', bg: 'bg-gray-100', text: 'text-gray-500' },
  pending_approval: { label: 'Pending Approval', bg: 'bg-amber-50', text: 'text-amber-600' },
  approved: { label: 'Approved', bg: 'bg-blue-50', text: 'text-blue-600' },
  released: { label: 'Released', bg: 'bg-emerald-50', text: 'text-emerald-600' },
};
function fmtDate(d) { return d ? new Date(d).toLocaleDateString('en-IN') : '—'; }

function LetterPreviewModal({ letter, onClose }) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl max-w-xl w-full max-h-[85vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-black text-gray-900 text-sm">Appointment Letter — {letter.appointment_number}</h3>
          <button onClick={onClose}><X className="w-5 h-5 text-gray-400" /></button>
        </div>
        <div className="text-sm text-gray-800" dangerouslySetInnerHTML={{ __html: letter.content_html }} />
      </div>
    </div>
  );
}

export default function AppointmentLetterPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [selectedOfferId, setSelectedOfferId] = useState(null);
  const [joiningDate, setJoiningDate] = useState('');
  const [previewLetter, setPreviewLetter] = useState(null);

  const { data: offers } = useQuery({ queryKey: ['offer-requests-accepted', search], queryFn: () => hrOffersAPI.requests({ search: search || undefined, status: 'accepted' }).then(r => r.data.data) });
  const { data: appointments, refetch } = useQuery({ queryKey: ['offer-appointments'], queryFn: () => hrOffersAPI.appointments().then(r => r.data.data) });

  const createMut = useMutation({
    mutationFn: () => hrOffersAPI.createAppointment(selectedOfferId, { joining_date: joiningDate || undefined }),
    onSuccess: () => { toast.success('Appointment letter created'); refetch(); setSelectedOfferId(null); },
    onError: (e) => toast.error(e.response?.data?.error || 'Failed'),
  });
  const sendMut = useMutation({
    mutationFn: (id) => hrOffersAPI.sendAppointment(id),
    onSuccess: () => { toast.success('Appointment letter emailed'); refetch(); },
    onError: (e) => toast.error(e.response?.data?.error || 'Failed'),
  });

  return (
    <div className="min-h-screen p-4 md:p-6" style={{ background: B.bg }}>
      <button onClick={() => navigate('/hr-admin/onboarding/offer-appointment')} className="flex items-center gap-1.5 text-sm font-bold text-gray-500 hover:text-gray-700 mb-4">
        <ArrowLeft className="w-4 h-4" /> Back to Offer &amp; Appointment Dashboard
      </button>
      <motion.div {...fade(0)} className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: `${B.blue}18` }}><FileCheck2 className="w-5 h-5" style={{ color: B.blue }} /></div>
        <div><h1 className="text-xl font-black text-gray-900">Appointment Letter</h1><p className="text-xs text-gray-400">Generated after the candidate accepts their offer</p></div>
      </motion.div>

      <motion.div {...fade(0.05)} className="bg-white rounded-2xl p-5 border border-gray-100 mb-4" style={{ boxShadow: '0 2px 12px rgba(10,31,92,0.06)' }}>
        <p className="text-xs font-bold text-gray-500 mb-2">Create from an accepted offer</p>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search accepted offers..." className="w-full text-sm pl-9 pr-3 py-2 rounded-lg border border-gray-200 focus:outline-none" />
          </div>
          <select value={selectedOfferId || ''} onChange={e => setSelectedOfferId(e.target.value)} className="text-sm px-3 py-2 rounded-lg border border-gray-200 focus:outline-none">
            <option value="">Select candidate</option>
            {(offers || []).map(o => <option key={o.id} value={o.id}>{o.candidate_name} ({o.offer_number})</option>)}
          </select>
          <input type="date" value={joiningDate} onChange={e => setJoiningDate(e.target.value)} className="text-sm px-3 py-2 rounded-lg border border-gray-200 focus:outline-none" />
          <button disabled={!selectedOfferId || createMut.isPending} onClick={() => createMut.mutate()} className="text-xs font-bold px-4 py-2 rounded-lg text-white flex items-center gap-1.5 disabled:opacity-50" style={{ background: B.blue }}>
            <FilePlus2 className="w-3.5 h-3.5" /> Generate
          </button>
        </div>
      </motion.div>

      <div className="space-y-3">
        {(appointments || []).map((a, i) => {
          const meta = STATUS_META[a.status] || STATUS_META.draft;
          return (
            <motion.div key={a.id} {...fade(0.05 + i * 0.02)} className="bg-white rounded-2xl p-4 border border-gray-100 flex flex-wrap items-center gap-3" style={{ boxShadow: '0 2px 8px rgba(10,31,92,0.05)' }}>
              <div className="flex-1 min-w-[180px]">
                <p className="text-sm font-bold text-gray-900">{a.candidate_name}</p>
                <p className="text-xs text-gray-400">{a.appointment_number} · Joining {fmtDate(a.joining_date)}</p>
              </div>
              <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${meta.bg} ${meta.text}`}>{meta.label}</span>
              <button onClick={() => setPreviewLetter(a)}><Eye className="w-4 h-4 text-gray-400 hover:text-blue-500" /></button>
              {a.status === 'released' && (
                <button disabled={sendMut.isPending} onClick={() => sendMut.mutate(a.id)} className="text-xs font-bold px-3 py-1.5 rounded-lg text-white flex items-center gap-1 disabled:opacity-50" style={{ background: B.success }}>
                  <Send className="w-3.5 h-3.5" /> Send
                </button>
              )}
            </motion.div>
          );
        })}
      </div>

      {previewLetter && <LetterPreviewModal letter={previewLetter} onClose={() => setPreviewLetter(null)} />}
    </div>
  );
}
