// src/pages/hr-admin/onboarding/offer-appointment/OfferLetterPage.jsx
import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { FileSignature, ArrowLeft, Search, FilePlus2, Send, Eye, X } from 'lucide-react';
import { hrOffersAPI } from '../../../../api/client';
import { B, fade } from '../../../../components/hr/DashboardKit';

function LetterPreviewModal({ letter, onClose }) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl max-w-xl w-full max-h-[85vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-black text-gray-900 text-sm">{letter.subject}</h3>
          <button onClick={onClose}><X className="w-5 h-5 text-gray-400" /></button>
        </div>
        <div className="text-sm text-gray-800" dangerouslySetInnerHTML={{ __html: letter.content_html }} />
      </div>
    </div>
  );
}

export default function OfferLetterPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [previewLetter, setPreviewLetter] = useState(null);

  const { data: offers } = useQuery({ queryKey: ['offer-requests', search, 'approved'], queryFn: () => hrOffersAPI.requests({ search: search || undefined }).then(r => r.data.data) });
  const { data: offer, refetch } = useQuery({ queryKey: ['offer-detail', selectedId], queryFn: () => hrOffersAPI.request(selectedId).then(r => r.data.data), enabled: !!selectedId });
  const { data: templates } = useQuery({ queryKey: ['offer-templates'], queryFn: () => hrOffersAPI.templates().then(r => r.data.data) });

  const genMut = useMutation({
    mutationFn: (templateId) => hrOffersAPI.generateLetter(selectedId, { template_id: templateId || undefined }),
    onSuccess: () => { toast.success('Offer letter generated'); refetch(); },
    onError: (e) => toast.error(e.response?.data?.error || 'Failed to generate'),
  });
  const sendMut = useMutation({
    mutationFn: (letterId) => hrOffersAPI.sendLetter(letterId),
    onSuccess: () => { toast.success('Offer letter emailed to candidate'); refetch(); },
    onError: (e) => toast.error(e.response?.data?.error || 'Failed to send'),
  });

  const offerTemplates = (templates || []).filter(t => t.type === 'offer');

  return (
    <div className="min-h-screen p-4 md:p-6" style={{ background: B.bg }}>
      <button onClick={() => navigate('/hr-admin/onboarding/offer-appointment')} className="flex items-center gap-1.5 text-sm font-bold text-gray-500 hover:text-gray-700 mb-4">
        <ArrowLeft className="w-4 h-4" /> Back to Offer &amp; Appointment Dashboard
      </button>
      <motion.div {...fade(0)} className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: `${B.blue}18` }}><FileSignature className="w-5 h-5" style={{ color: B.blue }} /></div>
        <div><h1 className="text-xl font-black text-gray-900">Offer Letter</h1><p className="text-xs text-gray-400">Generate, preview and email — offer must be fully approved first</p></div>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <motion.div {...fade(0.05)} className="bg-white rounded-2xl p-4 border border-gray-100" style={{ boxShadow: '0 2px 12px rgba(10,31,92,0.06)' }}>
          <div className="relative mb-3">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search offers..." className="w-full text-sm pl-9 pr-3 py-2 rounded-lg border border-gray-200 focus:outline-none" />
          </div>
          <div className="space-y-1.5 max-h-96 overflow-y-auto">
            {(offers || []).map(o => (
              <button key={o.id} onClick={() => setSelectedId(o.id)} className={`w-full text-left p-2.5 rounded-lg ${selectedId === o.id ? 'bg-blue-50' : 'hover:bg-gray-50'}`}>
                <p className="text-sm font-bold text-gray-800">{o.candidate_name}</p>
                <p className="text-xs text-gray-400">{o.offer_number} · {o.status}</p>
              </button>
            ))}
          </div>
        </motion.div>

        <motion.div {...fade(0.08)} className="lg:col-span-2 bg-white rounded-2xl p-5 border border-gray-100" style={{ boxShadow: '0 2px 12px rgba(10,31,92,0.06)' }}>
          {!offer ? <p className="text-sm text-gray-400 py-10 text-center">Select an offer to generate its letter.</p> : (
            <>
              <p className="text-sm font-bold text-gray-800 mb-1">{offer.candidate_name} · {offer.offer_number}</p>
              <p className="text-xs text-gray-400 mb-4">Status: {offer.status}</p>
              {offer.status !== 'approved' && offer.letters?.length === 0 && (
                <p className="text-xs text-amber-600 mb-4">This offer must be fully approved before a letter can be generated.</p>
              )}
              <div className="flex flex-wrap items-center gap-2 mb-4">
                <select id="tmpl-select" className="text-sm px-3 py-2 rounded-lg border border-gray-200 focus:outline-none">
                  <option value="">Default Offer Letter</option>
                  {offerTemplates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
                <button disabled={offer.status !== 'approved' || genMut.isPending}
                  onClick={() => genMut.mutate(document.getElementById('tmpl-select').value)}
                  className="text-xs font-bold px-3 py-2 rounded-lg text-white flex items-center gap-1.5 disabled:opacity-50" style={{ background: B.blue }}>
                  <FilePlus2 className="w-3.5 h-3.5" /> Generate Letter
                </button>
              </div>

              <p className="text-[11px] font-black text-gray-500 uppercase mb-2">Generated Letters</p>
              <div className="space-y-2">
                {(offer.letters || []).length === 0 && <p className="text-xs text-gray-400">None yet.</p>}
                {(offer.letters || []).map(l => (
                  <div key={l.id} className="flex items-center gap-2.5 p-2.5 rounded-lg bg-gray-50">
                    <span className="text-sm font-semibold text-gray-700 flex-1 truncate">{l.subject}</span>
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-600">{l.acceptance_status}</span>
                    <button onClick={() => setPreviewLetter(l)}><Eye className="w-4 h-4 text-gray-400 hover:text-blue-500" /></button>
                    {!l.sent_at && (
                      <button disabled={sendMut.isPending} onClick={() => sendMut.mutate(l.id)} className="text-xs font-bold px-2.5 py-1 rounded-lg text-white flex items-center gap-1 disabled:opacity-50" style={{ background: B.success }}>
                        <Send className="w-3 h-3" /> Send
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </motion.div>
      </div>

      {previewLetter && <LetterPreviewModal letter={previewLetter} onClose={() => setPreviewLetter(null)} />}
    </div>
  );
}
