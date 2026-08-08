// src/pages/hr-admin/onboarding/offer-appointment/DocumentTemplatesPage.jsx
// Reuses hr_letter_gen_templates (via hrLettersAPI) rather than a parallel
// templates table — scoped here to offer/appointment/promotion/transfer/
// confirmation/increment/contract_renewal types.
import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { FileSignature, ArrowLeft, Plus, X } from 'lucide-react';
import { hrOffersAPI, hrLettersAPI } from '../../../../api/client';
import { B, fade } from '../../../../components/hr/DashboardKit';

const TYPES = ['offer', 'appointment', 'promotion', 'transfer', 'confirmation', 'increment', 'contract_renewal'];
const PLACEHOLDERS = ['{{candidate_name}}', '{{designation_name}}', '{{department_name}}', '{{ctc_annual}}', '{{basic_salary}}', '{{probation_period_days}}', '{{company_name}}'];

function TemplateModal({ onClose, onSaved }) {
  const [form, setForm] = useState({ type: 'offer', name: '', subject: '', body_html: '' });
  const mut = useMutation({
    mutationFn: () => hrLettersAPI.createTmpl(form),
    onSuccess: () => { toast.success('Template created'); onSaved(); onClose(); },
    onError: (e) => toast.error(e.response?.data?.error || 'Failed'),
  });
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl max-w-lg w-full p-6" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-black text-gray-900">New Document Template</h3>
          <button onClick={onClose}><X className="w-5 h-5 text-gray-400" /></button>
        </div>
        <select value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value }))} className="w-full text-sm px-3 py-2 rounded-lg border border-gray-200 mb-3 focus:outline-none">
          {TYPES.map(t => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
        </select>
        <input placeholder="Template name" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} className="w-full text-sm px-3 py-2 rounded-lg border border-gray-200 mb-3 focus:outline-none" />
        <input placeholder="Subject" value={form.subject} onChange={e => setForm(p => ({ ...p, subject: e.target.value }))} className="w-full text-sm px-3 py-2 rounded-lg border border-gray-200 mb-3 focus:outline-none" />
        <textarea placeholder="Body HTML — use placeholders like {{candidate_name}}" value={form.body_html} onChange={e => setForm(p => ({ ...p, body_html: e.target.value }))} rows={6}
          className="w-full text-sm px-3 py-2 rounded-lg border border-gray-200 mb-2 focus:outline-none font-mono" />
        <p className="text-[11px] text-gray-400 mb-4">Placeholders: {PLACEHOLDERS.join(', ')}</p>
        <button disabled={!form.name || !form.body_html || mut.isPending} onClick={() => mut.mutate()} className="w-full text-sm font-bold py-2.5 rounded-xl text-white disabled:opacity-50" style={{ background: `linear-gradient(135deg,${B.blue},${B.navy})` }}>Save Template</button>
      </div>
    </div>
  );
}

export default function DocumentTemplatesPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const { data, isLoading } = useQuery({ queryKey: ['offer-templates'], queryFn: () => hrOffersAPI.templates().then(r => r.data.data) });
  const refetch = () => qc.invalidateQueries({ queryKey: ['offer-templates'] });
  const templates = data || [];

  return (
    <div className="min-h-screen p-4 md:p-6" style={{ background: B.bg }}>
      <button onClick={() => navigate('/hr-admin/onboarding/offer-appointment')} className="flex items-center gap-1.5 text-sm font-bold text-gray-500 hover:text-gray-700 mb-4">
        <ArrowLeft className="w-4 h-4" /> Back to Offer &amp; Appointment Dashboard
      </button>
      <motion.div {...fade(0)} className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: `${B.blue}18` }}><FileSignature className="w-5 h-5" style={{ color: B.blue }} /></div>
          <div><h1 className="text-xl font-black text-gray-900">Document Templates</h1><p className="text-xs text-gray-400">Offer, appointment, promotion, transfer, confirmation, increment, contract renewal</p></div>
        </div>
        <button onClick={() => setCreating(true)} className="text-sm font-bold px-4 py-2.5 rounded-xl text-white flex items-center gap-2" style={{ background: `linear-gradient(135deg,${B.blue},${B.navy})` }}><Plus className="w-4 h-4" /> New Template</button>
      </motion.div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {isLoading && <p className="text-sm text-gray-400">Loading...</p>}
        {!isLoading && templates.length === 0 && <p className="text-sm text-gray-400">No templates yet.</p>}
        {templates.map((t, i) => (
          <motion.div key={t.id} {...fade(0.05 + i * 0.02)} className="bg-white rounded-2xl p-4 border border-gray-100" style={{ boxShadow: '0 2px 8px rgba(10,31,92,0.05)' }}>
            <p className="text-sm font-bold text-gray-900">{t.name}</p>
            <p className="text-xs text-gray-400 capitalize">{t.type.replace(/_/g, ' ')}</p>
          </motion.div>
        ))}
      </div>

      {creating && <TemplateModal onClose={() => setCreating(false)} onSaved={refetch} />}
    </div>
  );
}
