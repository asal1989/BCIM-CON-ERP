// src/pages/hr-admin/onboarding/id-card/SettingsPage.jsx
import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Settings, ArrowLeft, Save } from 'lucide-react';
import { hrIdCardAPI } from '../../../../api/client';
import { B, fade } from '../../../../components/hr/DashboardKit';

export default function IdCardSettingsPage() {
  const navigate = useNavigate();
  const { data } = useQuery({ queryKey: ['idcard-settings'], queryFn: () => hrIdCardAPI.getSettings().then(r => r.data.data) });
  const [form, setForm] = useState(null);
  useEffect(() => { if (data && !form) setForm(data); }, [data, form]);

  const mut = useMutation({
    mutationFn: () => hrIdCardAPI.updateSettings(form),
    onSuccess: () => toast.success('Settings saved'),
    onError: (e) => toast.error(e.response?.data?.error || 'Failed to save'),
  });

  if (!form) return <div className="min-h-screen p-6" style={{ background: B.bg }}><p className="text-sm text-gray-400">Loading...</p></div>;
  const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }));

  return (
    <div className="min-h-screen p-4 md:p-6" style={{ background: B.bg }}>
      <button onClick={() => navigate('/hr-admin/onboarding/id-card')} className="flex items-center gap-1.5 text-sm font-bold text-gray-500 hover:text-gray-700 mb-4">
        <ArrowLeft className="w-4 h-4" /> Back to ID Card Dashboard
      </button>
      <motion.div {...fade(0)} className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: `${B.blue}18` }}><Settings className="w-5 h-5" style={{ color: B.blue }} /></div>
        <div><h1 className="text-xl font-black text-gray-900">ID Card Settings</h1><p className="text-xs text-gray-400">Applies to all newly generated cards</p></div>
      </motion.div>

      <motion.div {...fade(0.05)} className="bg-white rounded-2xl p-5 border border-gray-100 space-y-4 max-w-lg" style={{ boxShadow: '0 2px 12px rgba(10,31,92,0.06)' }}>
        <div>
          <p className="text-xs font-bold text-gray-500 mb-1.5">Card Size</p>
          <select value={form.card_size} onChange={e => set('card_size', e.target.value)} className="w-full text-sm px-3 py-2 rounded-lg border border-gray-200 focus:outline-none">
            <option value="CR80">CR80 (Standard, 85.6 x 54mm)</option>
            <option value="A6">A6</option>
            <option value="custom">Custom</option>
          </select>
        </div>
        <div>
          <p className="text-xs font-bold text-gray-500 mb-1.5">Photo Size</p>
          <select value={form.photo_size} onChange={e => set('photo_size', e.target.value)} className="w-full text-sm px-3 py-2 rounded-lg border border-gray-200 focus:outline-none">
            <option value="standard">Standard</option>
            <option value="large">Large</option>
            <option value="small">Small</option>
          </select>
        </div>
        <div className="flex gap-3">
          <div className="flex-1">
            <p className="text-xs font-bold text-gray-500 mb-1.5">QR Position</p>
            <select value={form.qr_position} onChange={e => set('qr_position', e.target.value)} className="w-full text-sm px-3 py-2 rounded-lg border border-gray-200 focus:outline-none">
              <option value="front-right">Front — Right</option>
              <option value="front-left">Front — Left</option>
              <option value="back">Back</option>
            </select>
          </div>
          <div className="flex-1">
            <p className="text-xs font-bold text-gray-500 mb-1.5">Barcode Position</p>
            <select value={form.barcode_position} onChange={e => set('barcode_position', e.target.value)} className="w-full text-sm px-3 py-2 rounded-lg border border-gray-200 focus:outline-none">
              <option value="back">Back</option>
              <option value="front">Front</option>
              <option value="none">None</option>
            </select>
          </div>
        </div>
        <div>
          <p className="text-xs font-bold text-gray-500 mb-1.5">Theme</p>
          <div className="flex gap-2">
            {['blue', 'dark', 'white'].map(t => (
              <button key={t} onClick={() => set('theme', t)} className="text-xs font-bold px-3 py-2 rounded-lg flex-1"
                style={form.theme === t ? { background: B.blue, color: '#fff' } : { background: '#F1F5F9', color: '#64748B' }}>
                {t[0].toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-600">
          <input type="checkbox" checked={!!form.watermark} onChange={e => set('watermark', e.target.checked)} /> Enable watermark
        </label>
        <label className="flex items-center gap-2 text-sm text-gray-600">
          <input type="checkbox" checked={!!form.digital_signature} onChange={e => set('digital_signature', e.target.checked)} /> Enable digital signature
        </label>

        <button disabled={mut.isPending} onClick={() => mut.mutate()} className="w-full text-sm font-bold py-2.5 rounded-xl text-white flex items-center justify-center gap-2 disabled:opacity-50" style={{ background: `linear-gradient(135deg,${B.blue},${B.navy})` }}>
          <Save className="w-4 h-4" /> Save Settings
        </button>
      </motion.div>
    </div>
  );
}
