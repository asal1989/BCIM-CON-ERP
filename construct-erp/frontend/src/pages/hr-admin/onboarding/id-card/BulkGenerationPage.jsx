// src/pages/hr-admin/onboarding/id-card/BulkGenerationPage.jsx
import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Layers3, ArrowLeft, Sparkles, Printer } from 'lucide-react';
import { hrIdCardAPI, hrMastersAPI } from '../../../../api/client';
import { B, fade } from '../../../../components/hr/DashboardKit';

export default function BulkGenerationPage() {
  const navigate = useNavigate();
  const [scope, setScope] = useState('department');
  const [departmentId, setDepartmentId] = useState('');
  const [days, setDays] = useState(30);
  const [lastResult, setLastResult] = useState(null);

  const { data: departments } = useQuery({ queryKey: ['hr-departments'], queryFn: () => hrMastersAPI.listDepts().then(r => r.data?.data || []) });

  const bulkMut = useMutation({
    mutationFn: () => hrIdCardAPI.bulkGenerate({
      department_id: scope === 'department' ? departmentId : undefined,
      new_joiners_days: scope === 'new_joiners' ? days : undefined,
    }),
    onSuccess: (r) => { setLastResult(r.data.data); toast.success(`Generated ${r.data.data.generated} card(s)`); },
    onError: (e) => toast.error(e.response?.data?.error || 'Failed to generate'),
  });
  const printMut = useMutation({
    mutationFn: () => hrIdCardAPI.enqueuePrint({ card_ids: lastResult.cards.map(c => c.id) }),
    onSuccess: () => { toast.success('Sent to print queue'); navigate('/hr-admin/onboarding/id-card/print-queue'); },
    onError: (e) => toast.error(e.response?.data?.error || 'Failed to enqueue'),
  });

  return (
    <div className="min-h-screen p-4 md:p-6" style={{ background: B.bg }}>
      <button onClick={() => navigate('/hr-admin/onboarding/id-card')} className="flex items-center gap-1.5 text-sm font-bold text-gray-500 hover:text-gray-700 mb-4">
        <ArrowLeft className="w-4 h-4" /> Back to ID Card Dashboard
      </button>
      <motion.div {...fade(0)} className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: `${B.blue}18` }}><Layers3 className="w-5 h-5" style={{ color: B.blue }} /></div>
        <div><h1 className="text-xl font-black text-gray-900">Bulk ID Generation</h1><p className="text-xs text-gray-400">Generate for an entire department or all recent new joiners, then batch print</p></div>
      </motion.div>

      <motion.div {...fade(0.05)} className="bg-white rounded-2xl p-5 border border-gray-100 space-y-4" style={{ boxShadow: '0 2px 12px rgba(10,31,92,0.06)' }}>
        <div className="flex flex-wrap gap-2">
          {[{ key: 'department', label: 'Entire Department' }, { key: 'new_joiners', label: 'New Joiners' }].map(s => (
            <button key={s.key} onClick={() => setScope(s.key)} className="text-xs font-bold px-3 py-2 rounded-lg border"
              style={scope === s.key ? { background: B.blue, color: '#fff', borderColor: B.blue } : { background: '#fff', color: '#64748B', borderColor: '#E2E8F0' }}>
              {s.label}
            </button>
          ))}
        </div>
        {scope === 'department' && (
          <select value={departmentId} onChange={e => setDepartmentId(e.target.value)} className="text-sm px-3 py-2 rounded-lg border border-gray-200 focus:outline-none max-w-xs">
            <option value="">Select Department</option>
            {(departments || []).map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        )}
        {scope === 'new_joiners' && (
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-600">Joined in the last</label>
            <input type="number" value={days} onChange={e => setDays(e.target.value)} className="w-20 text-sm px-3 py-2 rounded-lg border border-gray-200 focus:outline-none" />
            <span className="text-sm text-gray-600">days</span>
          </div>
        )}
        <button disabled={(scope === 'department' && !departmentId) || bulkMut.isPending} onClick={() => bulkMut.mutate()}
          className="text-sm font-bold px-4 py-2.5 rounded-xl text-white flex items-center gap-2 disabled:opacity-50" style={{ background: `linear-gradient(135deg,${B.blue},${B.navy})` }}>
          <Sparkles className="w-4 h-4" /> Generate Cards
        </button>

        {lastResult && (
          <div className="p-4 rounded-xl bg-gray-50 mt-4">
            <p className="text-sm font-bold text-gray-800">{lastResult.generated} generated, {lastResult.failed} failed</p>
            {lastResult.generated > 0 && (
              <button disabled={printMut.isPending} onClick={() => printMut.mutate()}
                className="mt-3 text-xs font-bold px-4 py-2 rounded-lg text-white flex items-center gap-1.5 disabled:opacity-50" style={{ background: B.blue }}>
                <Printer className="w-3.5 h-3.5" /> Send All to Print Queue
              </button>
            )}
          </div>
        )}
      </motion.div>
    </div>
  );
}
