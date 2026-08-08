// src/pages/hr-admin/onboarding/offer-appointment/DigitalSignaturesPage.jsx
// Individual approver signatures already come from users.signature_url
// (existing SignaturePadModal on the profile page) — this page only manages
// the company-level assets that aren't tied to one login: the seal and a
// default director signature, stored as base64 in companies.settings.offers.
import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { PenTool, ArrowLeft, Upload, Save } from 'lucide-react';
import { hrOffersAPI } from '../../../../api/client';
import { B, fade } from '../../../../components/hr/DashboardKit';

function ImageUploadBox({ label, value, onChange }) {
  const onFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 1.5 * 1024 * 1024) { toast.error('Image too large (max 1.5MB)'); return; }
    const reader = new FileReader();
    reader.onload = () => onChange(reader.result);
    reader.readAsDataURL(file);
  };
  return (
    <div>
      <p className="text-xs font-bold text-gray-500 mb-2">{label}</p>
      <div className="border-2 border-dashed border-gray-200 rounded-xl p-4 flex flex-col items-center gap-2">
        {value ? <img src={value} alt={label} className="h-16 object-contain" /> : <Upload className="w-6 h-6 text-gray-300" />}
        <label className="text-xs font-bold cursor-pointer" style={{ color: B.blue }}>
          {value ? 'Replace' : 'Upload'} <input type="file" accept="image/*" className="hidden" onChange={onFile} />
        </label>
      </div>
    </div>
  );
}

export default function DigitalSignaturesPage() {
  const navigate = useNavigate();
  const { data } = useQuery({ queryKey: ['offer-signatures'], queryFn: () => hrOffersAPI.getSignatures().then(r => r.data.data) });
  const [form, setForm] = useState(null);
  useEffect(() => { if (data && !form) setForm(data); }, [data, form]);

  const mut = useMutation({
    mutationFn: () => hrOffersAPI.updateSignatures(form),
    onSuccess: () => toast.success('Signatures saved'),
    onError: (e) => toast.error(e.response?.data?.error || 'Failed'),
  });

  if (!form) return <div className="min-h-screen p-6" style={{ background: B.bg }}><p className="text-sm text-gray-400">Loading...</p></div>;

  return (
    <div className="min-h-screen p-4 md:p-6" style={{ background: B.bg }}>
      <button onClick={() => navigate('/hr-admin/onboarding/offer-appointment')} className="flex items-center gap-1.5 text-sm font-bold text-gray-500 hover:text-gray-700 mb-4">
        <ArrowLeft className="w-4 h-4" /> Back to Offer &amp; Appointment Dashboard
      </button>
      <motion.div {...fade(0)} className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: `${B.blue}18` }}><PenTool className="w-5 h-5" style={{ color: B.blue }} /></div>
        <div><h1 className="text-xl font-black text-gray-900">Digital Signatures</h1><p className="text-xs text-gray-400">Company seal and default director signature — individual approver signatures come from each user's own profile</p></div>
      </motion.div>

      <motion.div {...fade(0.05)} className="bg-white rounded-2xl p-5 border border-gray-100 space-y-4 max-w-md" style={{ boxShadow: '0 2px 12px rgba(10,31,92,0.06)' }}>
        <ImageUploadBox label="Company Seal" value={form.company_seal} onChange={v => setForm(p => ({ ...p, company_seal: v }))} />
        <ImageUploadBox label="Director Signature" value={form.director_signature} onChange={v => setForm(p => ({ ...p, director_signature: v }))} />
        <button disabled={mut.isPending} onClick={() => mut.mutate()} className="w-full text-sm font-bold py-2.5 rounded-xl text-white flex items-center justify-center gap-2 disabled:opacity-50" style={{ background: `linear-gradient(135deg,${B.blue},${B.navy})` }}>
          <Save className="w-4 h-4" /> Save
        </button>
      </motion.div>
    </div>
  );
}
