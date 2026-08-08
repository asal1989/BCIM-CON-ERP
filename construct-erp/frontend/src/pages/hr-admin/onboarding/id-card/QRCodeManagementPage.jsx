// src/pages/hr-admin/onboarding/id-card/QRCodeManagementPage.jsx
import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { QrCode, ArrowLeft, Search, RefreshCw } from 'lucide-react';
import { hrIdCardAPI } from '../../../../api/client';
import { B, fade, avatarGrad, initials } from '../../../../components/hr/DashboardKit';

export default function QRCodeManagementPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const { data, isLoading } = useQuery({ queryKey: ['idcard-qr', search], queryFn: () => hrIdCardAPI.qrList({ search: search || undefined }).then(r => r.data.data) });

  const regenMut = useMutation({
    mutationFn: (empId) => hrIdCardAPI.regenerateQr(empId),
    onSuccess: () => { toast.success('QR code regenerated'); qc.invalidateQueries({ queryKey: ['idcard-qr'] }); },
    onError: (e) => toast.error(e.response?.data?.error || 'Failed'),
  });

  const employees = data || [];

  return (
    <div className="min-h-screen p-4 md:p-6" style={{ background: B.bg }}>
      <button onClick={() => navigate('/hr-admin/onboarding/id-card')} className="flex items-center gap-1.5 text-sm font-bold text-gray-500 hover:text-gray-700 mb-4">
        <ArrowLeft className="w-4 h-4" /> Back to ID Card Dashboard
      </button>
      <motion.div {...fade(0)} className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: `${B.blue}18` }}><QrCode className="w-5 h-5" style={{ color: B.blue }} /></div>
        <div><h1 className="text-xl font-black text-gray-900">QR Code Management</h1><p className="text-xs text-gray-400">Scanning a card's QR opens the employee's profile (subject to permissions)</p></div>
      </motion.div>

      <motion.div {...fade(0.05)} className="bg-white rounded-2xl p-3 mb-4 border border-gray-100 relative" style={{ boxShadow: '0 2px 12px rgba(10,31,92,0.06)' }}>
        <Search className="w-4 h-4 text-gray-400 absolute left-6 top-1/2 -translate-y-1/2" />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name or employee code..."
          className="w-full text-sm pl-9 pr-3 py-2 rounded-lg border border-gray-200 focus:outline-none focus:border-blue-300" />
      </motion.div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {isLoading && <p className="text-sm text-gray-400">Loading...</p>}
        {employees.map((emp, i) => {
          const [c1, c2] = avatarGrad(emp.name);
          return (
            <motion.div key={emp.id} {...fade(0.05 + i * 0.02)} className="bg-white rounded-2xl p-4 border border-gray-100 flex items-center gap-3" style={{ boxShadow: '0 2px 8px rgba(10,31,92,0.05)' }}>
              {emp.qr_data_uri
                ? <img src={emp.qr_data_uri} alt="QR" className="w-14 h-14 flex-shrink-0" />
                : <div className="w-14 h-14 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0 text-white text-xs font-bold" style={{ background: `linear-gradient(135deg, ${c1}, ${c2})` }}>{initials(emp.name)}</div>}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-gray-800 truncate">{emp.name}</p>
                <p className="text-xs text-gray-400">{emp.employee_code} · {emp.department_name || '—'}</p>
                <p className="text-[11px] text-gray-400">{emp.qr_data_uri ? `Regenerated ${emp.regenerated_count || 0}x` : 'Not generated'}</p>
              </div>
              <button disabled={regenMut.isPending} onClick={() => regenMut.mutate(emp.id)} className="flex-shrink-0"><RefreshCw className="w-4 h-4 text-gray-400 hover:text-blue-500" /></button>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
