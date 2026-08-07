// src/pages/hr-admin/onboarding/document-verification/PendingVerificationPage.jsx
// Quick-action queue of documents awaiting HR approval, across all employees.
import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Clock, Search, ShieldCheck, XCircle, ArrowLeft, FileText } from 'lucide-react';
import { hrDocVerificationAPI, hrEmployeesAPI, hrMastersAPI } from '../../../../api/client';
import { B, fade } from '../../../../components/hr/DashboardKit';

function fmtDate(d) { return d ? new Date(d).toLocaleDateString('en-IN') : '—'; }

function PendingRow({ doc, delay, onDone }) {
  const mut = useMutation({
    mutationFn: ({ verification_status, rejection_reason }) =>
      hrEmployeesAPI.verifyDocument(doc.user_id, doc.id, { verification_status, rejection_reason }),
    onSuccess: () => { toast.success('Updated'); onDone(); },
    onError: (e) => toast.error(e.response?.data?.error || 'Update failed'),
  });

  return (
    <motion.div {...fade(delay)} className="bg-white rounded-2xl p-4 border border-gray-100 flex flex-wrap items-center gap-3"
      style={{ boxShadow: '0 2px 8px rgba(10,31,92,0.05)' }}>
      <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: '#F59E0B18' }}>
        <FileText className="w-4 h-4" style={{ color: B.warning }} />
      </div>
      <div className="flex-1 min-w-[180px]">
        <p className="text-sm font-bold text-gray-900">{doc.label}</p>
        <p className="text-xs text-gray-400">{doc.employee_name} · {doc.employee_code} · {doc.department_name || 'No department'}</p>
        <p className="text-[11px] text-gray-400">Uploaded {fmtDate(doc.uploaded_at)}</p>
      </div>
      <div className="flex gap-2 flex-shrink-0">
        <button disabled={mut.isPending} onClick={() => mut.mutate({ verification_status: 'verified' })}
          className="text-xs font-bold px-3 py-1.5 rounded-lg text-white flex items-center gap-1 disabled:opacity-50" style={{ background: B.success }}>
          <ShieldCheck className="w-3.5 h-3.5" /> Verify
        </button>
        <button disabled={mut.isPending} onClick={() => {
          const reason = window.prompt('Rejection reason (optional):') || '';
          mut.mutate({ verification_status: 'rejected', rejection_reason: reason });
        }} className="text-xs font-bold px-3 py-1.5 rounded-lg bg-red-50 text-red-500 flex items-center gap-1 disabled:opacity-50">
          <XCircle className="w-3.5 h-3.5" /> Reject
        </button>
      </div>
    </motion.div>
  );
}

export default function PendingVerificationPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [departmentId, setDepartmentId] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['doc-verification-pending', search, departmentId],
    queryFn: () => hrDocVerificationAPI.pending({ search: search || undefined, department_id: departmentId || undefined }).then(r => r.data.data),
  });
  const { data: departments } = useQuery({
    queryKey: ['hr-departments'],
    queryFn: () => hrMastersAPI.listDepts().then(r => r.data?.data || []),
  });

  const refetch = () => qc.invalidateQueries({ queryKey: ['doc-verification-pending'] });
  const docs = data || [];

  return (
    <div className="min-h-screen p-4 md:p-6" style={{ background: B.bg }}>
      <button onClick={() => navigate('/hr-admin/onboarding/document-verification')} className="flex items-center gap-1.5 text-sm font-bold text-gray-500 hover:text-gray-700 mb-4">
        <ArrowLeft className="w-4 h-4" /> Back to Dashboard
      </button>

      <motion.div {...fade(0)} className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: '#F59E0B18' }}>
          <Clock className="w-5 h-5" style={{ color: B.warning }} />
        </div>
        <div>
          <h1 className="text-xl font-black text-gray-900">Pending Verification</h1>
          <p className="text-xs text-gray-400">{docs.length} document(s) awaiting HR approval</p>
        </div>
      </motion.div>

      <motion.div {...fade(0.05)} className="bg-white rounded-2xl p-3 mb-4 border border-gray-100 flex flex-wrap items-center gap-3" style={{ boxShadow: '0 2px 12px rgba(10,31,92,0.06)' }}>
        <div className="flex-1 min-w-[200px] relative">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name or employee code..."
            className="w-full text-sm pl-9 pr-3 py-2 rounded-lg border border-gray-200 focus:outline-none focus:border-blue-300" />
        </div>
        <select value={departmentId} onChange={e => setDepartmentId(e.target.value)}
          className="text-sm px-3 py-2 rounded-lg border border-gray-200 focus:outline-none">
          <option value="">All Departments</option>
          {(departments || []).map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
      </motion.div>

      <div className="space-y-3">
        {isLoading && <p className="text-sm text-gray-400 text-center py-10">Loading...</p>}
        {!isLoading && docs.length === 0 && <p className="text-sm text-gray-400 text-center py-10">Nothing pending verification.</p>}
        {docs.map((doc, i) => <PendingRow key={doc.id} doc={doc} delay={0.08 + i * 0.02} onDone={refetch} />)}
      </div>
    </div>
  );
}
