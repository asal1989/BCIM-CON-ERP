// src/pages/hr-admin/onboarding/id-card/ReprintIdCardPage.jsx
import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { RotateCcw, ArrowLeft, Search } from 'lucide-react';
import { hrIdCardAPI } from '../../../../api/client';
import { B, fade, avatarGrad, initials } from '../../../../components/hr/DashboardKit';

export default function ReprintIdCardPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');

  const { data: cards, isLoading } = useQuery({ queryKey: ['idcard-cards', search], queryFn: () => hrIdCardAPI.cards({ search: search || undefined, status: 'active' }).then(r => r.data.data) });
  const mut = useMutation({
    mutationFn: (id) => hrIdCardAPI.reprint(id),
    onSuccess: () => { toast.success('Sent to print queue for reprint'); navigate('/hr-admin/onboarding/id-card/print-queue'); },
    onError: (e) => toast.error(e.response?.data?.error || 'Failed to reprint'),
  });

  return (
    <div className="min-h-screen p-4 md:p-6" style={{ background: B.bg }}>
      <button onClick={() => navigate('/hr-admin/onboarding/id-card')} className="flex items-center gap-1.5 text-sm font-bold text-gray-500 hover:text-gray-700 mb-4">
        <ArrowLeft className="w-4 h-4" /> Back to ID Card Dashboard
      </button>
      <motion.div {...fade(0)} className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: `${B.blue}18` }}><RotateCcw className="w-5 h-5" style={{ color: B.blue }} /></div>
        <div><h1 className="text-xl font-black text-gray-900">Reprint ID Card</h1><p className="text-xs text-gray-400">Find an existing card and send it back to the print queue</p></div>
      </motion.div>

      <motion.div {...fade(0.05)} className="bg-white rounded-2xl p-5 border border-gray-100" style={{ boxShadow: '0 2px 12px rgba(10,31,92,0.06)' }}>
        <div className="relative mb-4 max-w-md">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by employee name, code or card number..."
            className="w-full text-sm pl-9 pr-3 py-2.5 rounded-lg border border-gray-200 focus:outline-none focus:border-blue-300" />
        </div>
        <div className="space-y-2">
          {isLoading && <p className="text-sm text-gray-400">Loading...</p>}
          {(cards || []).map(c => {
            const [c1, c2] = avatarGrad(c.employee_name);
            return (
              <div key={c.id} className="flex items-center gap-3 p-3 rounded-xl bg-gray-50">
                <div className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0" style={{ background: `linear-gradient(135deg, ${c1}, ${c2})` }}>{initials(c.employee_name)}</div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-gray-800">{c.employee_name}</p>
                  <p className="text-xs text-gray-400">{c.card_number} · Reprinted {c.reprint_count || 0} time(s)</p>
                </div>
                <button disabled={mut.isPending} onClick={() => mut.mutate(c.id)} className="text-xs font-bold px-3 py-1.5 rounded-lg text-white disabled:opacity-50" style={{ background: B.blue }}>Reprint</button>
              </div>
            );
          })}
        </div>
      </motion.div>
    </div>
  );
}
