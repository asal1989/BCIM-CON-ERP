// src/pages/hr-admin/onboarding/id-card/PrintQueuePage.jsx
import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ListChecks, ArrowLeft, Printer, X, Download } from 'lucide-react';
import { hrIdCardAPI, companySettingsAPI } from '../../../../api/client';
import { B, fade } from '../../../../components/hr/DashboardKit';
import { downloadSingleCardPdf } from '../../../../components/hr/id-card/idCardPdf';

const STATUS_META = {
  ready: { label: 'Ready', bg: 'bg-blue-50', text: 'text-blue-600' },
  printing: { label: 'Printing', bg: 'bg-amber-50', text: 'text-amber-600' },
  printed: { label: 'Printed', bg: 'bg-emerald-50', text: 'text-emerald-600' },
  failed: { label: 'Failed', bg: 'bg-red-50', text: 'text-red-500' },
  cancelled: { label: 'Cancelled', bg: 'bg-gray-100', text: 'text-gray-400' },
};

function fmtDate(d) { return d ? new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'; }

export default function PrintQueuePage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [status, setStatus] = useState('');
  const { data: company } = useQuery({ queryKey: ['company-settings'], queryFn: () => companySettingsAPI.get().then(r => r.data.data) });

  const { data, isLoading } = useQuery({
    queryKey: ['idcard-print-queue', status],
    queryFn: () => hrIdCardAPI.printQueue({ status: status || undefined }).then(r => r.data.data),
  });
  const updateMut = useMutation({
    mutationFn: ({ id, status }) => hrIdCardAPI.updateQueue(id, { status }),
    onSuccess: () => { toast.success('Updated'); qc.invalidateQueries({ queryKey: ['idcard-print-queue'] }); },
    onError: (e) => toast.error(e.response?.data?.error || 'Update failed'),
  });
  const downloadMut = useMutation({
    mutationFn: async (item) => {
      const r = await hrIdCardAPI.card(item.card_id);
      downloadSingleCardPdf({ ...r.data.data.employee, qr_code_data: r.data.data.qr_code_data }, company);
    },
  });

  const items = data || [];

  return (
    <div className="min-h-screen p-4 md:p-6" style={{ background: B.bg }}>
      <button onClick={() => navigate('/hr-admin/onboarding/id-card')} className="flex items-center gap-1.5 text-sm font-bold text-gray-500 hover:text-gray-700 mb-4">
        <ArrowLeft className="w-4 h-4" /> Back to ID Card Dashboard
      </button>
      <motion.div {...fade(0)} className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: `${B.blue}18` }}><ListChecks className="w-5 h-5" style={{ color: B.blue }} /></div>
        <div><h1 className="text-xl font-black text-gray-900">Print Queue</h1><p className="text-xs text-gray-400">{items.length} item(s)</p></div>
      </motion.div>

      <motion.div {...fade(0.05)} className="bg-white rounded-2xl p-3 mb-4 border border-gray-100 flex flex-wrap gap-2" style={{ boxShadow: '0 2px 12px rgba(10,31,92,0.06)' }}>
        {['', 'ready', 'printing', 'printed', 'failed'].map(s => (
          <button key={s} onClick={() => setStatus(s)} className="text-xs font-bold px-3 py-1.5 rounded-lg"
            style={status === s ? { background: B.blue, color: '#fff' } : { background: '#F1F5F9', color: '#64748B' }}>
            {s ? STATUS_META[s].label : 'All'}
          </button>
        ))}
      </motion.div>

      <div className="space-y-3">
        {isLoading && <p className="text-sm text-gray-400 text-center py-10">Loading...</p>}
        {!isLoading && items.length === 0 && <p className="text-sm text-gray-400 text-center py-10">Queue is empty.</p>}
        {items.map((item, i) => {
          const meta = STATUS_META[item.status] || STATUS_META.ready;
          return (
            <motion.div key={item.id} {...fade(0.08 + i * 0.02)} className="bg-white rounded-2xl p-4 border border-gray-100 flex flex-wrap items-center gap-3" style={{ boxShadow: '0 2px 8px rgba(10,31,92,0.05)' }}>
              <div className="flex-1 min-w-[180px]">
                <p className="text-sm font-bold text-gray-900">{item.employee_name}</p>
                <p className="text-xs text-gray-400">{item.employee_code} · {item.card_number} · Requested {fmtDate(item.requested_at)}</p>
              </div>
              <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${meta.bg} ${meta.text}`}>{meta.label}</span>
              <div className="flex gap-2 flex-shrink-0">
                {item.status === 'ready' && (
                  <button onClick={() => updateMut.mutate({ id: item.id, status: 'printed' })} className="text-xs font-bold px-3 py-1.5 rounded-lg text-white flex items-center gap-1" style={{ background: B.success }}>
                    <Printer className="w-3.5 h-3.5" /> Mark Printed
                  </button>
                )}
                <button onClick={() => downloadMut.mutate(item)} className="text-xs font-bold px-3 py-1.5 rounded-lg bg-gray-100 text-gray-600 flex items-center gap-1">
                  <Download className="w-3.5 h-3.5" /> PDF
                </button>
                {item.status !== 'printed' && item.status !== 'cancelled' && (
                  <button onClick={() => updateMut.mutate({ id: item.id, status: 'cancelled' })} className="text-xs font-bold px-3 py-1.5 rounded-lg bg-red-50 text-red-500 flex items-center gap-1">
                    <X className="w-3.5 h-3.5" /> Cancel
                  </button>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
