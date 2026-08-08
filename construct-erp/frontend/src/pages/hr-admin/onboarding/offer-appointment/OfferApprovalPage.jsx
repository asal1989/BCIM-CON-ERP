// src/pages/hr-admin/onboarding/offer-appointment/OfferApprovalPage.jsx
import React from 'react';
import { motion } from 'framer-motion';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ShieldCheck, ArrowLeft, CheckCircle2, XCircle, RotateCcw } from 'lucide-react';
import { hrOffersAPI } from '../../../../api/client';
import { B, fade } from '../../../../components/hr/DashboardKit';

export default function OfferApprovalPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['offer-pending-approvals'], queryFn: () => hrOffersAPI.pendingApprovals().then(r => r.data.data) });
  const refetch = () => qc.invalidateQueries({ queryKey: ['offer-pending-approvals'] });

  const approveMut = useMutation({ mutationFn: (id) => hrOffersAPI.approveOffer(id, {}), onSuccess: () => { toast.success('Stage approved'); refetch(); }, onError: (e) => toast.error(e.response?.data?.error || 'Failed') });
  const rejectMut = useMutation({ mutationFn: (id) => hrOffersAPI.rejectOffer(id, { remarks: window.prompt('Rejection reason:') || '' }), onSuccess: () => { toast.success('Rejected'); refetch(); }, onError: (e) => toast.error(e.response?.data?.error || 'Failed') });
  const sendBackMut = useMutation({ mutationFn: (id) => hrOffersAPI.sendBackOffer(id, { remarks: window.prompt('Send-back note:') || '' }), onSuccess: () => { toast.success('Sent back to draft'); refetch(); }, onError: (e) => toast.error(e.response?.data?.error || 'Failed') });

  const items = data || [];

  return (
    <div className="min-h-screen p-4 md:p-6" style={{ background: B.bg }}>
      <button onClick={() => navigate('/hr-admin/onboarding/offer-appointment')} className="flex items-center gap-1.5 text-sm font-bold text-gray-500 hover:text-gray-700 mb-4">
        <ArrowLeft className="w-4 h-4" /> Back to Offer &amp; Appointment Dashboard
      </button>
      <motion.div {...fade(0)} className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: `${B.blue}18` }}><ShieldCheck className="w-5 h-5" style={{ color: B.blue }} /></div>
        <div><h1 className="text-xl font-black text-gray-900">Offer Approval</h1><p className="text-xs text-gray-400">{items.length} offer(s) awaiting your stage's approval</p></div>
      </motion.div>

      <div className="space-y-3">
        {isLoading && <p className="text-sm text-gray-400 text-center py-10">Loading...</p>}
        {!isLoading && items.length === 0 && <p className="text-sm text-gray-400 text-center py-10">Nothing pending approval.</p>}
        {items.map((o, i) => (
          <motion.div key={o.offer_id} {...fade(0.05 + i * 0.02)} className="bg-white rounded-2xl p-4 border border-gray-100 flex flex-wrap items-center gap-3" style={{ boxShadow: '0 2px 8px rgba(10,31,92,0.05)' }}>
            <div className="flex-1 min-w-[180px]">
              <p className="text-sm font-bold text-gray-900">{o.candidate_name}</p>
              <p className="text-xs text-gray-400">{o.offer_number}</p>
            </div>
            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-600">Stage {o.stage_order}: {o.stage_label}</span>
            <div className="flex gap-2 flex-shrink-0">
              <button disabled={approveMut.isPending} onClick={() => approveMut.mutate(o.offer_id)} className="text-xs font-bold px-3 py-1.5 rounded-lg text-white flex items-center gap-1" style={{ background: B.success }}>
                <CheckCircle2 className="w-3.5 h-3.5" /> Approve
              </button>
              <button disabled={rejectMut.isPending} onClick={() => rejectMut.mutate(o.offer_id)} className="text-xs font-bold px-3 py-1.5 rounded-lg bg-red-50 text-red-500 flex items-center gap-1">
                <XCircle className="w-3.5 h-3.5" /> Reject
              </button>
              <button disabled={sendBackMut.isPending} onClick={() => sendBackMut.mutate(o.offer_id)} className="text-xs font-bold px-3 py-1.5 rounded-lg bg-gray-100 text-gray-600 flex items-center gap-1">
                <RotateCcw className="w-3.5 h-3.5" /> Send Back
              </button>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
