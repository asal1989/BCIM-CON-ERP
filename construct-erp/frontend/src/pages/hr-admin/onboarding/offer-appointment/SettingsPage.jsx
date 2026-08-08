// src/pages/hr-admin/onboarding/offer-appointment/SettingsPage.jsx
import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Settings, ArrowLeft, Save } from 'lucide-react';
import { hrOffersAPI } from '../../../../api/client';
import { B, fade } from '../../../../components/hr/DashboardKit';

export default function OfferSettingsPage() {
  const navigate = useNavigate();
  const { data } = useQuery({ queryKey: ['offer-settings'], queryFn: () => hrOffersAPI.getSettings().then(r => r.data.data) });
  const [form, setForm] = useState(null);
  useEffect(() => { if (data && !form) setForm(data); }, [data, form]);

  const mut = useMutation({
    mutationFn: () => hrOffersAPI.updateSettings(form),
    onSuccess: () => toast.success('Settings saved'),
    onError: (e) => toast.error(e.response?.data?.error || 'Failed'),
  });

  if (!form) return <div className="min-h-screen p-6" style={{ background: B.bg }}><p className="text-sm text-gray-400">Loading...</p></div>;
  const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }));

  return (
    <div className="min-h-screen p-4 md:p-6" style={{ background: B.bg }}>
      <button onClick={() => navigate('/hr-admin/onboarding/offer-appointment')} className="flex items-center gap-1.5 text-sm font-bold text-gray-500 hover:text-gray-700 mb-4">
        <ArrowLeft className="w-4 h-4" /> Back to Offer &amp; Appointment Dashboard
      </button>
      <motion.div {...fade(0)} className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: `${B.blue}18` }}><Settings className="w-5 h-5" style={{ color: B.blue }} /></div>
        <div><h1 className="text-xl font-black text-gray-900">Offer &amp; Appointment Settings</h1></div>
      </motion.div>

      <motion.div {...fade(0.05)} className="bg-white rounded-2xl p-5 border border-gray-100 space-y-4 max-w-lg" style={{ boxShadow: '0 2px 12px rgba(10,31,92,0.06)' }}>
        <div className="flex gap-3">
          <div className="flex-1">
            <p className="text-xs font-bold text-gray-500 mb-1.5">Offer Number Prefix</p>
            <input value={form.offer_number_prefix} onChange={e => set('offer_number_prefix', e.target.value)} className="w-full text-sm px-3 py-2 rounded-lg border border-gray-200 focus:outline-none" />
          </div>
          <div className="flex-1">
            <p className="text-xs font-bold text-gray-500 mb-1.5">Appointment Number Prefix</p>
            <input value={form.appointment_number_prefix} onChange={e => set('appointment_number_prefix', e.target.value)} className="w-full text-sm px-3 py-2 rounded-lg border border-gray-200 focus:outline-none" />
          </div>
        </div>
        <div>
          <p className="text-xs font-bold text-gray-500 mb-1.5">Offer Approval Workflow (in order)</p>
          <div className="space-y-1.5">
            {form.offer_stages.map((s, i) => (
              <input key={i} value={s} onChange={e => { const next = [...form.offer_stages]; next[i] = e.target.value; set('offer_stages', next); }}
                className="w-full text-sm px-3 py-2 rounded-lg border border-gray-200 focus:outline-none" />
            ))}
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-600">
          <input type="checkbox" checked={form.finance_stage_required} onChange={e => set('finance_stage_required', e.target.checked)} /> Require Finance approval stage
        </label>
        <div>
          <p className="text-xs font-bold text-gray-500 mb-1.5">Reminder Schedule (days before follow-up)</p>
          <input type="number" value={form.reminder_days} onChange={e => set('reminder_days', e.target.value)} className="w-32 text-sm px-3 py-2 rounded-lg border border-gray-200 focus:outline-none" />
        </div>
        <button disabled={mut.isPending} onClick={() => mut.mutate()} className="w-full text-sm font-bold py-2.5 rounded-xl text-white flex items-center justify-center gap-2 disabled:opacity-50" style={{ background: `linear-gradient(135deg,${B.blue},${B.navy})` }}>
          <Save className="w-4 h-4" /> Save Settings
        </button>
      </motion.div>
    </div>
  );
}
