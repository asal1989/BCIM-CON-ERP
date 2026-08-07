// src/pages/hr-admin/onboarding/document-verification/MissingDocumentsPage.jsx
import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { FileWarning, Search, ArrowLeft, Send } from 'lucide-react';
import { hrDocVerificationAPI, hrMastersAPI } from '../../../../api/client';
import { B, fade, avatarGrad, initials } from '../../../../components/hr/DashboardKit';

function ReminderButton({ id, onSent }) {
  const mut = useMutation({
    mutationFn: () => hrDocVerificationAPI.remind(id),
    onSuccess: () => { toast.success('Reminder sent'); onSent(); },
    onError: (e) => toast.error(e.response?.data?.error || 'Could not send reminder'),
  });
  return (
    <button disabled={mut.isPending} onClick={() => mut.mutate()}
      className="text-xs font-bold px-3 py-1.5 rounded-lg text-white flex items-center gap-1.5 disabled:opacity-50 flex-shrink-0"
      style={{ background: B.blue }}>
      <Send className="w-3.5 h-3.5" /> Send Reminder
    </button>
  );
}

export default function MissingDocumentsPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [departmentId, setDepartmentId] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['doc-verification-missing', search, departmentId],
    queryFn: () => hrDocVerificationAPI.missing({ search: search || undefined, department_id: departmentId || undefined }).then(r => r.data.data),
  });
  const { data: departments } = useQuery({
    queryKey: ['hr-departments'],
    queryFn: () => hrMastersAPI.listDepts().then(r => r.data?.data || []),
  });

  const refetch = () => qc.invalidateQueries({ queryKey: ['doc-verification-missing'] });
  const employees = data || [];

  return (
    <div className="min-h-screen p-4 md:p-6" style={{ background: B.bg }}>
      <button onClick={() => navigate('/hr-admin/onboarding/document-verification')} className="flex items-center gap-1.5 text-sm font-bold text-gray-500 hover:text-gray-700 mb-4">
        <ArrowLeft className="w-4 h-4" /> Back to Dashboard
      </button>

      <motion.div {...fade(0)} className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: '#94A3B818' }}>
          <FileWarning className="w-5 h-5" style={{ color: '#64748B' }} />
        </div>
        <div>
          <h1 className="text-xl font-black text-gray-900">Missing Documents</h1>
          <p className="text-xs text-gray-400">{employees.length} employee(s) short of a mandatory document</p>
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
        {!isLoading && employees.length === 0 && <p className="text-sm text-gray-400 text-center py-10">Everyone has their mandatory documents.</p>}
        {employees.map((emp, i) => {
          const [c1, c2] = avatarGrad(emp.name);
          return (
            <motion.div key={emp.id} {...fade(0.08 + i * 0.02)} className="bg-white rounded-2xl p-4 border border-gray-100 flex flex-wrap items-center gap-3" style={{ boxShadow: '0 2px 8px rgba(10,31,92,0.05)' }}>
              <div className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0"
                style={{ background: `linear-gradient(135deg, ${c1}, ${c2})` }}>{initials(emp.name)}</div>
              <div className="flex-1 min-w-[180px]">
                <p className="text-sm font-bold text-gray-900">{emp.name}</p>
                <p className="text-xs text-gray-400">{emp.employee_code} · {emp.department_name || 'No department'}</p>
                <p className="text-xs mt-1" style={{ color: B.warning }}>Missing: {emp.missing_types.join(', ')}</p>
              </div>
              <ReminderButton id={emp.id} onSent={refetch} />
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
