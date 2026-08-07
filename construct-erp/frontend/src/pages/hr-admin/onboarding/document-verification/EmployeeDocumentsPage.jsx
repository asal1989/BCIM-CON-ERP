// src/pages/hr-admin/onboarding/document-verification/EmployeeDocumentsPage.jsx
// Employee-wise document register — view everything uploaded per employee,
// grouped by category (Personal / Education / Employment / Compliance / Medical / Other).
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Users, Search, ArrowLeft, ChevronDown, FileText, ExternalLink } from 'lucide-react';
import { hrDocVerificationAPI, hrMastersAPI } from '../../../../api/client';
import { B, fade, avatarGrad, initials } from '../../../../components/hr/DashboardKit';

const CATEGORY_LABELS = {
  personal: 'Personal Documents',
  education: 'Educational Documents',
  employment: 'Employment Documents',
  compliance: 'Compliance Documents',
  medical: 'Medical Documents',
  other: 'Other Documents',
};
const CATEGORY_ORDER = ['personal', 'education', 'employment', 'compliance', 'medical', 'other'];

const STATUS_DOT = { verified: B.success, pending: B.warning, rejected: B.danger };

function fmtDate(d) { return d ? new Date(d).toLocaleDateString('en-IN') : '—'; }

function EmployeeDetail({ id }) {
  const { data, isLoading } = useQuery({
    queryKey: ['doc-verification-employee', id],
    queryFn: () => hrDocVerificationAPI.employee(id).then(r => r.data.data),
  });

  if (isLoading || !data) return <p className="text-xs text-gray-400 px-4 py-4">Loading documents...</p>;

  const categories = data.categories || {};
  const hasAny = Object.keys(categories).length > 0;

  return (
    <div className="px-4 py-3 space-y-4">
      {data.missing_types?.length > 0 && (
        <div className="text-xs px-3 py-2 rounded-lg bg-amber-50 text-amber-700 font-semibold">
          Missing required: {data.missing_types.join(', ')}
        </div>
      )}
      {!hasAny && <p className="text-xs text-gray-400">No documents uploaded yet.</p>}
      {CATEGORY_ORDER.filter(c => categories[c]?.length).map(cat => (
        <div key={cat}>
          <p className="text-[11px] font-black text-gray-500 uppercase tracking-wide mb-2">{CATEGORY_LABELS[cat]}</p>
          <div className="space-y-1.5">
            {categories[cat].map(doc => (
              <div key={doc.id} className="flex items-center gap-2.5 p-2 rounded-lg bg-gray-50">
                <FileText className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                <span className="text-sm font-semibold text-gray-700 flex-1 truncate">{doc.doc_name || doc.label}</span>
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: STATUS_DOT[doc.verification_status] || '#94A3B8' }} title={doc.verification_status} />
                <span className="text-[11px] text-gray-400 flex-shrink-0">{fmtDate(doc.uploaded_at)}</span>
                {doc.file_url && (
                  <a href={doc.file_url} target="_blank" rel="noreferrer" className="flex-shrink-0">
                    <ExternalLink className="w-3.5 h-3.5 text-gray-300 hover:text-blue-500" />
                  </a>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function EmployeeDocumentsPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [openId, setOpenId] = useState(null);

  const { data, isLoading } = useQuery({
    queryKey: ['doc-verification-employees', search, departmentId],
    queryFn: () => hrDocVerificationAPI.employees({ search: search || undefined, department_id: departmentId || undefined }).then(r => r.data.data),
  });
  const { data: departments } = useQuery({
    queryKey: ['hr-departments'],
    queryFn: () => hrMastersAPI.listDepts().then(r => r.data),
  });

  const employees = data || [];

  return (
    <div className="min-h-screen p-4 md:p-6" style={{ background: B.bg }}>
      <button onClick={() => navigate('/hr-admin/onboarding/document-verification')} className="flex items-center gap-1.5 text-sm font-bold text-gray-500 hover:text-gray-700 mb-4">
        <ArrowLeft className="w-4 h-4" /> Back to Dashboard
      </button>

      <motion.div {...fade(0)} className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: `${B.blue}18` }}>
          <Users className="w-5 h-5" style={{ color: B.blue }} />
        </div>
        <div>
          <h1 className="text-xl font-black text-gray-900">Employee Documents</h1>
          <p className="text-xs text-gray-400">All uploaded documents, employee-wise</p>
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
        {!isLoading && employees.length === 0 && <p className="text-sm text-gray-400 text-center py-10">No employees match this filter.</p>}
        {employees.map((emp, i) => {
          const [c1, c2] = avatarGrad(emp.name);
          const isOpen = openId === emp.id;
          return (
            <motion.div key={emp.id} {...fade(0.08 + i * 0.02)} className="bg-white rounded-2xl border border-gray-100 overflow-hidden" style={{ boxShadow: '0 2px 8px rgba(10,31,92,0.05)' }}>
              <button onClick={() => setOpenId(isOpen ? null : emp.id)} className="w-full p-4 flex items-center gap-4 text-left">
                <div className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0"
                  style={{ background: `linear-gradient(135deg, ${c1}, ${c2})` }}>
                  {initials(emp.name)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-gray-900 truncate">{emp.name}</p>
                  <p className="text-xs text-gray-400">{emp.employee_code} · {emp.department_name || 'No department'}</p>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0 text-xs font-bold">
                  <span className="text-gray-500">{emp.total_docs} total</span>
                  {emp.pending_docs > 0 && <span style={{ color: B.warning }}>{emp.pending_docs} pending</span>}
                  {emp.rejected_docs > 0 && <span style={{ color: B.danger }}>{emp.rejected_docs} rejected</span>}
                  <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                </div>
              </button>
              <AnimatePresence>
                {isOpen && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.25 }} className="overflow-hidden border-t border-gray-50">
                    <EmployeeDetail id={emp.id} />
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
