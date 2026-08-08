// src/pages/hr-admin/onboarding/document-verification/RejectedDocumentsPage.jsx
import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { XCircle, Search, ArrowLeft, FileText } from 'lucide-react';
import { hrDocVerificationAPI, hrMastersAPI } from '../../../../api/client';
import { B, fade } from '../../../../components/hr/DashboardKit';

function fmtDate(d) { return d ? new Date(d).toLocaleDateString('en-IN') : '—'; }

export default function RejectedDocumentsPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [departmentId, setDepartmentId] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['doc-verification-rejected', search, departmentId],
    queryFn: () => hrDocVerificationAPI.rejected({ search: search || undefined, department_id: departmentId || undefined }).then(r => r.data.data),
  });
  const { data: departments } = useQuery({
    queryKey: ['hr-departments'],
    queryFn: () => hrMastersAPI.listDepts().then(r => r.data?.data || []),
  });

  const docs = data || [];

  return (
    <div className="min-h-screen p-4 md:p-6" style={{ background: B.bg }}>
      <button onClick={() => navigate('/hr-admin/onboarding/document-verification')} className="flex items-center gap-1.5 text-sm font-bold text-gray-500 hover:text-gray-700 mb-4">
        <ArrowLeft className="w-4 h-4" /> Back to Dashboard
      </button>

      <motion.div {...fade(0)} className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: '#EF444418' }}>
          <XCircle className="w-5 h-5" style={{ color: B.danger }} />
        </div>
        <div>
          <h1 className="text-xl font-black text-gray-900">Rejected Documents</h1>
          <p className="text-xs text-gray-400">{docs.length} document(s) rejected with a reason on file</p>
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
        {!isLoading && docs.length === 0 && <p className="text-sm text-gray-400 text-center py-10">No rejected documents.</p>}
        {docs.map((doc, i) => (
          <motion.div key={doc.id} {...fade(0.08 + i * 0.02)} className="bg-white rounded-2xl p-4 border border-gray-100" style={{ boxShadow: '0 2px 8px rgba(10,31,92,0.05)' }}>
            <div className="flex flex-wrap items-start gap-3">
              <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: '#EF444418' }}>
                <FileText className="w-4 h-4" style={{ color: B.danger }} />
              </div>
              <div className="flex-1 min-w-[180px]">
                <p className="text-sm font-bold text-gray-900">{doc.label}</p>
                <p className="text-xs text-gray-400">{doc.employee_name} · {doc.employee_code} · {doc.department_name || 'No department'}</p>
                {doc.rejection_reason && <p className="text-xs text-red-500 mt-1">Reason: {doc.rejection_reason}</p>}
              </div>
              <div className="text-right flex-shrink-0">
                <p className="text-[11px] text-gray-400">{fmtDate(doc.verified_at)}</p>
                {doc.verified_by_name && <p className="text-[11px] text-gray-400">by {doc.verified_by_name}</p>}
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
