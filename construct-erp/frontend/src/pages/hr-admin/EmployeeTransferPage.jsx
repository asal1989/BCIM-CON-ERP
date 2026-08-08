// src/pages/hr-admin/EmployeeTransferPage.jsx
import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeftRight, CheckCircle2, XCircle, Clock } from 'lucide-react';
import { hrEmployeeBackgroundAPI } from '../../api/client';
import toast from 'react-hot-toast';

const fade = (d = 0) => ({ initial: { opacity: 0, y: 14 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.35, delay: d, ease: [0.16, 1, 0.3, 1] } });
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

const STATUS_CFG = {
  pending:  { bg: 'bg-amber-50',   text: 'text-amber-700',   dot: 'bg-amber-400',   icon: Clock },
  approved: { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500', icon: CheckCircle2 },
  rejected: { bg: 'bg-red-50',     text: 'text-red-700',     dot: 'bg-red-500',     icon: XCircle },
};

export default function EmployeeTransferPage() {
  const qc = useQueryClient();
  const [statusF, setStatusF] = useState('pending');

  const { data, isLoading } = useQuery({
    queryKey: ['hr-employee-transfers', statusF],
    queryFn: () => hrEmployeeBackgroundAPI.transfers.pending({ status: statusF }).then(r => r.data),
  });
  const rows = data?.data || [];
  const inv = () => qc.invalidateQueries({ queryKey: ['hr-employee-transfers'] });

  const approveMut = useMutation({
    mutationFn: (id) => hrEmployeeBackgroundAPI.transfers.approve(id),
    onSuccess: () => { toast.success('Transfer approved'); inv(); },
    onError: (e) => toast.error(e.response?.data?.error || 'Error'),
  });
  const rejectMut = useMutation({
    mutationFn: (id) => hrEmployeeBackgroundAPI.transfers.reject(id),
    onSuccess: () => { toast.success('Transfer rejected'); inv(); },
    onError: (e) => toast.error(e.response?.data?.error || 'Error'),
  });

  return (
    <div className="p-6 space-y-6 min-h-screen" style={{ background: '#F8FAFC' }}>
      <motion.div {...fade(0)} className="relative overflow-hidden rounded-2xl"
        style={{ background: `linear-gradient(135deg,#0A1F5C,#1e3a8a)`, boxShadow: '0 8px 32px rgba(10,31,92,0.2)' }}>
        <div className="absolute top-0 right-0 w-64 h-64 rounded-full opacity-[0.07]"
          style={{ background: 'radial-gradient(circle,#fff,transparent 70%)', transform: 'translate(25%,-25%)' }} />
        <div className="relative z-10 px-8 py-6 flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center">
            <ArrowLeftRight className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-white">Employee Transfer</h1>
            <p className="text-white/55 text-sm mt-0.5">Project / department transfer requests &amp; approvals</p>
          </div>
        </div>
      </motion.div>

      <motion.div {...fade(0.05)} className="flex items-center gap-1 bg-white rounded-xl p-1.5 border border-gray-100 w-fit"
        style={{ boxShadow: '0 2px 12px rgba(10,31,92,0.06)' }}>
        {[
          { value: 'pending',  label: 'Pending' },
          { value: 'approved', label: 'Approved' },
          { value: 'rejected', label: 'Rejected' },
          { value: 'all',      label: 'All' },
        ].map(s => (
          <button key={s.value} onClick={() => setStatusF(s.value)}
            className={`px-4 py-2 rounded-lg text-xs font-black transition-all ${
              statusF === s.value ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
            }`}>
            {s.label}
          </button>
        ))}
      </motion.div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16 gap-3">
          <div className="w-6 h-6 rounded-full border-2 border-blue-200 border-t-blue-600 animate-spin" />
          <p className="text-sm text-gray-400">Loading transfers…</p>
        </div>
      ) : rows.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 py-16 text-center shadow-sm">
          <ArrowLeftRight className="w-12 h-12 mx-auto mb-3 text-gray-200" />
          <p className="font-bold text-gray-600">No {statusF !== 'all' ? statusF : ''} transfer requests</p>
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((t, i) => {
            const cfg = STATUS_CFG[t.status] || STATUS_CFG.pending;
            const StIcon = cfg.icon;
            return (
              <motion.div key={t.id} {...fade(i * 0.03)}
                className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm"
                style={{ boxShadow: '0 2px 12px rgba(10,31,92,0.06)' }}>
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div>
                    <p className="font-black text-gray-900">{t.employee_name} <span className="text-xs text-gray-400 font-semibold">({t.employee_code})</span></p>
                    <div className="flex items-center gap-2 text-sm text-gray-600 mt-1">
                      <span>{t.from_department_name || t.from_project_name || '—'}</span>
                      <ArrowLeftRight className="w-3.5 h-3.5 text-gray-400" />
                      <span className="font-bold text-gray-800">{t.to_department_name || t.to_project_name || '—'}</span>
                    </div>
                    <p className="text-xs text-gray-400 mt-1">Effective {fmtDate(t.effective_date)}{t.reason ? ` · ${t.reason}` : ''}</p>
                    {t.status !== 'pending' && t.approved_by_name && (
                      <p className="text-xs text-gray-400 mt-0.5">{t.status === 'approved' ? 'Approved' : 'Rejected'} by {t.approved_by_name} on {fmtDate(t.approved_at)}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full ${cfg.bg} ${cfg.text}`}>
                      <StIcon className="w-3.5 h-3.5" /> {t.status}
                    </span>
                    {t.status === 'pending' && (
                      <>
                        <button onClick={() => approveMut.mutate(t.id)} disabled={approveMut.isPending}
                          className="px-3 py-1.5 rounded-lg text-xs font-black text-white bg-emerald-600 hover:bg-emerald-700 transition disabled:opacity-40">
                          Approve
                        </button>
                        <button onClick={() => rejectMut.mutate(t.id)} disabled={rejectMut.isPending}
                          className="px-3 py-1.5 rounded-lg text-xs font-black text-red-600 bg-red-50 hover:bg-red-100 transition disabled:opacity-40">
                          Reject
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
