// src/pages/hr-admin/onboarding/offer-appointment/OfferRequestsPage.jsx
import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ClipboardList, ArrowLeft, Plus, Search, Send, X } from 'lucide-react';
import { hrOffersAPI, hrMastersAPI, hrEmployeesAPI } from '../../../../api/client';
import { B, fade } from '../../../../components/hr/DashboardKit';

const STATUS_META = {
  draft: { label: 'Draft', bg: 'bg-gray-100', text: 'text-gray-500' },
  pending_approval: { label: 'Pending Approval', bg: 'bg-amber-50', text: 'text-amber-600' },
  approved: { label: 'Approved', bg: 'bg-blue-50', text: 'text-blue-600' },
  rejected: { label: 'Rejected', bg: 'bg-red-50', text: 'text-red-500' },
  sent: { label: 'Sent', bg: 'bg-blue-50', text: 'text-blue-600' },
  accepted: { label: 'Accepted', bg: 'bg-emerald-50', text: 'text-emerald-600' },
  declined: { label: 'Declined', bg: 'bg-red-50', text: 'text-red-500' },
  expired: { label: 'Expired', bg: 'bg-gray-100', text: 'text-gray-400' },
};
function fmtDate(d) { return d ? new Date(d).toLocaleDateString('en-IN') : '—'; }

function NewOfferModal({ onClose, onCreated }) {
  const [form, setForm] = useState({ candidate_name: '', candidate_mobile: '', candidate_email: '', employment_type: 'permanent', ctc_annual: '', basic_salary: '', probation_period_days: 180, notice_period_days: 30 });
  const { data: departments } = useQuery({ queryKey: ['hr-departments'], queryFn: () => hrMastersAPI.listDepts().then(r => r.data?.data || []) });
  const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }));

  const mut = useMutation({
    mutationFn: () => hrOffersAPI.createRequest(form),
    onSuccess: () => { toast.success('Offer request created'); onCreated(); onClose(); },
    onError: (e) => toast.error(e.response?.data?.error || 'Failed'),
  });

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl max-w-lg w-full p-6 max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-black text-gray-900">New Offer Request</h3>
          <button onClick={onClose}><X className="w-5 h-5 text-gray-400" /></button>
        </div>
        <p className="text-[11px] font-black text-gray-500 uppercase mb-2">Candidate Information</p>
        <div className="grid grid-cols-2 gap-2 mb-3">
          <input placeholder="Candidate name *" value={form.candidate_name} onChange={e => set('candidate_name', e.target.value)} className="col-span-2 text-sm px-3 py-2 rounded-lg border border-gray-200 focus:outline-none" />
          <input placeholder="Mobile" value={form.candidate_mobile} onChange={e => set('candidate_mobile', e.target.value)} className="text-sm px-3 py-2 rounded-lg border border-gray-200 focus:outline-none" />
          <input placeholder="Email" value={form.candidate_email} onChange={e => set('candidate_email', e.target.value)} className="text-sm px-3 py-2 rounded-lg border border-gray-200 focus:outline-none" />
        </div>
        <p className="text-[11px] font-black text-gray-500 uppercase mb-2">Job Details</p>
        <div className="grid grid-cols-2 gap-2 mb-3">
          <select value={form.department_id || ''} onChange={e => set('department_id', e.target.value)} className="text-sm px-3 py-2 rounded-lg border border-gray-200 focus:outline-none">
            <option value="">Department</option>
            {(departments || []).map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
          <input placeholder="Work Location" value={form.work_location || ''} onChange={e => set('work_location', e.target.value)} className="text-sm px-3 py-2 rounded-lg border border-gray-200 focus:outline-none" />
          <select value={form.employment_type} onChange={e => set('employment_type', e.target.value)} className="text-sm px-3 py-2 rounded-lg border border-gray-200 focus:outline-none">
            <option value="permanent">Permanent</option>
            <option value="contract">Contract</option>
            <option value="temporary">Temporary</option>
          </select>
          <input placeholder="Site Location" value={form.site_location || ''} onChange={e => set('site_location', e.target.value)} className="text-sm px-3 py-2 rounded-lg border border-gray-200 focus:outline-none" />
        </div>
        <p className="text-[11px] font-black text-gray-500 uppercase mb-2">Compensation</p>
        <div className="grid grid-cols-2 gap-2 mb-4">
          <input type="number" placeholder="CTC (Annual ₹)" value={form.ctc_annual} onChange={e => set('ctc_annual', e.target.value)} className="text-sm px-3 py-2 rounded-lg border border-gray-200 focus:outline-none" />
          <input type="number" placeholder="Basic Salary (Monthly ₹)" value={form.basic_salary} onChange={e => set('basic_salary', e.target.value)} className="text-sm px-3 py-2 rounded-lg border border-gray-200 focus:outline-none" />
          <input type="number" placeholder="Probation (days)" value={form.probation_period_days} onChange={e => set('probation_period_days', e.target.value)} className="text-sm px-3 py-2 rounded-lg border border-gray-200 focus:outline-none" />
          <input type="number" placeholder="Notice Period (days)" value={form.notice_period_days} onChange={e => set('notice_period_days', e.target.value)} className="text-sm px-3 py-2 rounded-lg border border-gray-200 focus:outline-none" />
        </div>
        <button disabled={!form.candidate_name || mut.isPending} onClick={() => mut.mutate()} className="w-full text-sm font-bold py-2.5 rounded-xl text-white disabled:opacity-50" style={{ background: `linear-gradient(135deg,${B.blue},${B.navy})` }}>Create Offer Request</button>
      </div>
    </div>
  );
}

export default function OfferRequestsPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [showNew, setShowNew] = useState(false);

  const { data, isLoading } = useQuery({ queryKey: ['offer-requests', search, status], queryFn: () => hrOffersAPI.requests({ search: search || undefined, status: status || undefined }).then(r => r.data.data) });
  const refetch = () => qc.invalidateQueries({ queryKey: ['offer-requests'] });

  const submitMut = useMutation({
    mutationFn: (id) => hrOffersAPI.submitRequest(id),
    onSuccess: () => { toast.success('Submitted for approval'); refetch(); },
    onError: (e) => toast.error(e.response?.data?.error || 'Failed'),
  });

  const offers = data || [];

  return (
    <div className="min-h-screen p-4 md:p-6" style={{ background: B.bg }}>
      <button onClick={() => navigate('/hr-admin/onboarding/offer-appointment')} className="flex items-center gap-1.5 text-sm font-bold text-gray-500 hover:text-gray-700 mb-4">
        <ArrowLeft className="w-4 h-4" /> Back to Offer &amp; Appointment Dashboard
      </button>
      <motion.div {...fade(0)} className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: `${B.blue}18` }}><ClipboardList className="w-5 h-5" style={{ color: B.blue }} /></div>
          <div><h1 className="text-xl font-black text-gray-900">Offer Requests</h1><p className="text-xs text-gray-400">{offers.length} offer(s)</p></div>
        </div>
        <button onClick={() => setShowNew(true)} className="text-sm font-bold px-4 py-2.5 rounded-xl text-white flex items-center gap-2" style={{ background: `linear-gradient(135deg,${B.blue},${B.navy})` }}><Plus className="w-4 h-4" /> New Offer</button>
      </motion.div>

      <motion.div {...fade(0.05)} className="bg-white rounded-2xl p-3 mb-4 border border-gray-100 flex flex-wrap items-center gap-3" style={{ boxShadow: '0 2px 12px rgba(10,31,92,0.06)' }}>
        <div className="flex-1 min-w-[200px] relative">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by candidate or offer number..." className="w-full text-sm pl-9 pr-3 py-2 rounded-lg border border-gray-200 focus:outline-none focus:border-blue-300" />
        </div>
        <select value={status} onChange={e => setStatus(e.target.value)} className="text-sm px-3 py-2 rounded-lg border border-gray-200 focus:outline-none">
          <option value="">All Statuses</option>
          {Object.keys(STATUS_META).map(s => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
        </select>
      </motion.div>

      <div className="space-y-3">
        {isLoading && <p className="text-sm text-gray-400 text-center py-10">Loading...</p>}
        {!isLoading && offers.length === 0 && <p className="text-sm text-gray-400 text-center py-10">No offer requests yet.</p>}
        {offers.map((o, i) => {
          const meta = STATUS_META[o.status] || STATUS_META.draft;
          return (
            <motion.div key={o.id} {...fade(0.08 + i * 0.02)} className="bg-white rounded-2xl p-4 border border-gray-100 flex flex-wrap items-center gap-3" style={{ boxShadow: '0 2px 8px rgba(10,31,92,0.05)' }}>
              <div className="flex-1 min-w-[180px]">
                <p className="text-sm font-bold text-gray-900">{o.candidate_name}</p>
                <p className="text-xs text-gray-400">{o.offer_number} · {o.designation_name || '—'} · {o.department_name || '—'} · Created {fmtDate(o.created_at)}</p>
              </div>
              <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${meta.bg} ${meta.text}`}>{meta.label}</span>
              {o.status === 'draft' && (
                <button disabled={submitMut.isPending} onClick={() => submitMut.mutate(o.id)} className="text-xs font-bold px-3 py-1.5 rounded-lg text-white flex items-center gap-1 disabled:opacity-50" style={{ background: B.blue }}>
                  <Send className="w-3.5 h-3.5" /> Submit for Approval
                </button>
              )}
            </motion.div>
          );
        })}
      </div>

      {showNew && <NewOfferModal onClose={() => setShowNew(false)} onCreated={refetch} />}
    </div>
  );
}
