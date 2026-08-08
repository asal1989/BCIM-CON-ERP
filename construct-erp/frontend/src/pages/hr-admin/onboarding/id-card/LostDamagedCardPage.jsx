// src/pages/hr-admin/onboarding/id-card/LostDamagedCardPage.jsx
// Workflow: Employee Request -> HR Approval -> Old Card Disabled ->
// New Card Generated -> Print -> Issue -> History Updated. Approve/reject
// mirror hr-leave.routes.js's status/actioned_by/actioned_at/rejection_reason shape.
import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { FileWarning, ArrowLeft, Plus, CheckCircle2, XCircle, Search } from 'lucide-react';
import { hrIdCardAPI } from '../../../../api/client';
import { B, fade, avatarGrad, initials } from '../../../../components/hr/DashboardKit';

const STATUS_META = {
  pending: { label: 'Pending Approval', bg: 'bg-amber-50', text: 'text-amber-600' },
  approved: { label: 'Approved', bg: 'bg-blue-50', text: 'text-blue-600' },
  issued: { label: 'Issued', bg: 'bg-emerald-50', text: 'text-emerald-600' },
  rejected: { label: 'Rejected', bg: 'bg-red-50', text: 'text-red-500' },
};
function fmtDate(d) { return d ? new Date(d).toLocaleDateString('en-IN') : '—'; }

function RequestModal({ onClose, onDone }) {
  const [search, setSearch] = useState('');
  const [employee, setEmployee] = useState(null);
  const [reason, setReason] = useState('lost');
  const [remarks, setRemarks] = useState('');
  const { data: employees } = useQuery({ queryKey: ['idcard-employees', search], queryFn: () => hrIdCardAPI.employees({ search }).then(r => r.data.data), enabled: search.length >= 2 && !employee });

  const mut = useMutation({
    mutationFn: () => hrIdCardAPI.requestReissue({ employee_id: employee.id, old_card_id: employee.active_card_id, reason, remarks }),
    onSuccess: () => { toast.success('Request submitted'); onDone(); onClose(); },
    onError: (e) => toast.error(e.response?.data?.error || 'Failed'),
  });

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl max-w-md w-full p-6" onClick={e => e.stopPropagation()}>
        <h3 className="font-black text-gray-900 mb-4">Report Lost / Damaged Card</h3>
        {!employee ? (
          <div>
            <div className="relative mb-2">
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search employee..." className="w-full text-sm pl-9 pr-3 py-2 rounded-lg border border-gray-200 focus:outline-none" />
            </div>
            <div className="space-y-1 max-h-56 overflow-y-auto">
              {(employees || []).map(e => (
                <button key={e.id} onClick={() => setEmployee(e)} className="w-full text-left p-2 rounded-lg hover:bg-gray-50 text-sm">{e.name} <span className="text-gray-400">({e.employee_code})</span></button>
              ))}
            </div>
          </div>
        ) : (
          <>
            <p className="text-sm font-bold text-gray-800 mb-3">{employee.name} · {employee.employee_code}</p>
            <select value={reason} onChange={e => setReason(e.target.value)} className="w-full text-sm px-3 py-2 rounded-lg border border-gray-200 mb-3 focus:outline-none">
              <option value="lost">Lost</option>
              <option value="damaged">Damaged</option>
            </select>
            <textarea value={remarks} onChange={e => setRemarks(e.target.value)} placeholder="Remarks (optional)" rows={2}
              className="w-full text-sm px-3 py-2 rounded-lg border border-gray-200 mb-3 focus:outline-none" />
            <div className="flex gap-2">
              <button disabled={mut.isPending} onClick={() => mut.mutate()} className="flex-1 text-sm font-bold py-2.5 rounded-xl text-white disabled:opacity-50" style={{ background: `linear-gradient(135deg,${B.blue},${B.navy})` }}>Submit Request</button>
              <button onClick={onClose} className="px-4 py-2.5 rounded-xl text-sm font-bold bg-gray-100 text-gray-500">Cancel</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function LostDamagedCardPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [showRequest, setShowRequest] = useState(false);
  const { data, isLoading } = useQuery({ queryKey: ['idcard-reissue'], queryFn: () => hrIdCardAPI.reissueList().then(r => r.data.data) });
  const refetch = () => qc.invalidateQueries({ queryKey: ['idcard-reissue'] });

  const approveMut = useMutation({ mutationFn: (id) => hrIdCardAPI.approveReissue(id), onSuccess: () => { toast.success('Approved — new card issued'); refetch(); }, onError: (e) => toast.error(e.response?.data?.error || 'Failed') });
  const rejectMut = useMutation({
    mutationFn: (id) => hrIdCardAPI.rejectReissue(id, { rejection_reason: window.prompt('Rejection reason (optional):') || '' }),
    onSuccess: () => { toast.success('Rejected'); refetch(); }, onError: (e) => toast.error(e.response?.data?.error || 'Failed'),
  });

  const requests = data || [];

  return (
    <div className="min-h-screen p-4 md:p-6" style={{ background: B.bg }}>
      <button onClick={() => navigate('/hr-admin/onboarding/id-card')} className="flex items-center gap-1.5 text-sm font-bold text-gray-500 hover:text-gray-700 mb-4">
        <ArrowLeft className="w-4 h-4" /> Back to ID Card Dashboard
      </button>
      <motion.div {...fade(0)} className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: '#EF444418' }}><FileWarning className="w-5 h-5" style={{ color: B.danger }} /></div>
          <div><h1 className="text-xl font-black text-gray-900">Lost / Damaged Card</h1><p className="text-xs text-gray-400">Request &rarr; HR Approval &rarr; Old Card Disabled &rarr; New Card Issued</p></div>
        </div>
        <button onClick={() => setShowRequest(true)} className="text-sm font-bold px-4 py-2.5 rounded-xl text-white flex items-center gap-2" style={{ background: `linear-gradient(135deg,${B.blue},${B.navy})` }}>
          <Plus className="w-4 h-4" /> Report Lost/Damaged
        </button>
      </motion.div>

      <div className="space-y-3">
        {isLoading && <p className="text-sm text-gray-400 text-center py-10">Loading...</p>}
        {!isLoading && requests.length === 0 && <p className="text-sm text-gray-400 text-center py-10">No requests yet.</p>}
        {requests.map((r, i) => {
          const meta = STATUS_META[r.status] || STATUS_META.pending;
          return (
            <motion.div key={r.id} {...fade(0.05 + i * 0.02)} className="bg-white rounded-2xl p-4 border border-gray-100 flex flex-wrap items-center gap-3" style={{ boxShadow: '0 2px 8px rgba(10,31,92,0.05)' }}>
              <div className="flex-1 min-w-[180px]">
                <p className="text-sm font-bold text-gray-900">{r.employee_name} <span className="text-xs font-normal text-gray-400">({r.employee_code})</span></p>
                <p className="text-xs text-gray-400">{r.reason === 'lost' ? 'Lost' : 'Damaged'} · Old card: {r.old_card_number || '—'} · Requested {fmtDate(r.requested_at)}</p>
                {r.rejection_reason && <p className="text-xs text-red-500 mt-1">Reason: {r.rejection_reason}</p>}
              </div>
              <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${meta.bg} ${meta.text}`}>{meta.label}</span>
              {r.status === 'pending' && (
                <div className="flex gap-2 flex-shrink-0">
                  <button disabled={approveMut.isPending} onClick={() => approveMut.mutate(r.id)} className="text-xs font-bold px-3 py-1.5 rounded-lg text-white flex items-center gap-1" style={{ background: B.success }}>
                    <CheckCircle2 className="w-3.5 h-3.5" /> Approve
                  </button>
                  <button disabled={rejectMut.isPending} onClick={() => rejectMut.mutate(r.id)} className="text-xs font-bold px-3 py-1.5 rounded-lg bg-red-50 text-red-500 flex items-center gap-1">
                    <XCircle className="w-3.5 h-3.5" /> Reject
                  </button>
                </div>
              )}
            </motion.div>
          );
        })}
      </div>

      {showRequest && <RequestModal onClose={() => setShowRequest(false)} onDone={refetch} />}
    </div>
  );
}
