// src/pages/hr-admin/onboarding/document-verification/VerifyDocumentsPage.jsx
// Deep single-employee document review: preview, compare against employee
// details, verify / reject / request re-upload, with remarks.
import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ShieldCheck, ArrowLeft, Search, XCircle, RotateCcw, FileText, ExternalLink } from 'lucide-react';
import { hrDocVerificationAPI, hrEmployeesAPI } from '../../../../api/client';
import { B, fade, avatarGrad, initials } from '../../../../components/hr/DashboardKit';

const STATUS_META = {
  verified: { label: 'Verified', bg: 'bg-emerald-50', text: 'text-emerald-700' },
  pending: { label: 'Pending', bg: 'bg-amber-50', text: 'text-amber-700' },
  rejected: { label: 'Rejected', bg: 'bg-red-50', text: 'text-red-500' },
};

function fmtDate(d) { return d ? new Date(d).toLocaleDateString('en-IN') : '—'; }

function DocReviewCard({ doc, employeeId, delay, onDone }) {
  const [remarks, setRemarks] = useState('');
  const mut = useMutation({
    mutationFn: (payload) => hrEmployeesAPI.verifyDocument(employeeId, doc.id, payload),
    onSuccess: () => { toast.success('Updated'); onDone(); },
    onError: (e) => toast.error(e.response?.data?.error || 'Update failed'),
  });
  const meta = STATUS_META[doc.verification_status] || STATUS_META.pending;

  return (
    <motion.div {...fade(delay)} className="bg-white rounded-2xl p-4 border border-gray-100" style={{ boxShadow: '0 2px 8px rgba(10,31,92,0.05)' }}>
      <div className="flex items-center gap-3 mb-3">
        <FileText className="w-4 h-4 text-gray-400 flex-shrink-0" />
        <p className="text-sm font-bold text-gray-800 flex-1">{doc.doc_name || doc.label}</p>
        <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${meta.bg} ${meta.text}`}>{meta.label}</span>
        {doc.file_url && (
          <a href={doc.file_url} target="_blank" rel="noreferrer" className="text-xs font-bold flex items-center gap-1" style={{ color: B.blue }}>
            <ExternalLink className="w-3.5 h-3.5" /> Preview
          </a>
        )}
      </div>
      {doc.file_url && /\.(png|jpe?g|gif|webp)$/i.test(doc.file_url) && (
        <img src={doc.file_url} alt={doc.doc_name} className="max-h-56 rounded-lg border border-gray-100 mb-3" />
      )}
      {doc.rejection_reason && <p className="text-xs text-red-500 mb-2">Rejected: {doc.rejection_reason}</p>}
      {doc.verification_status === 'pending' && (
        <div className="space-y-2">
          <textarea value={remarks} onChange={e => setRemarks(e.target.value)} placeholder="Remarks (used as rejection reason if you reject)..."
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none" rows={2} />
          <div className="flex flex-wrap gap-2">
            <button disabled={mut.isPending} onClick={() => mut.mutate({ verification_status: 'verified' })}
              className="text-xs font-bold px-3 py-1.5 rounded-lg text-white flex items-center gap-1 disabled:opacity-50" style={{ background: B.success }}>
              <ShieldCheck className="w-3.5 h-3.5" /> Verify
            </button>
            <button disabled={mut.isPending} onClick={() => mut.mutate({ verification_status: 'rejected', rejection_reason: remarks || 'Rejected' })}
              className="text-xs font-bold px-3 py-1.5 rounded-lg bg-red-50 text-red-500 flex items-center gap-1 disabled:opacity-50">
              <XCircle className="w-3.5 h-3.5" /> Reject
            </button>
            <button disabled={mut.isPending} onClick={() => mut.mutate({ verification_status: 'rejected', rejection_reason: `Re-upload requested${remarks ? `: ${remarks}` : ''}` })}
              className="text-xs font-bold px-3 py-1.5 rounded-lg bg-gray-100 text-gray-600 flex items-center gap-1 disabled:opacity-50">
              <RotateCcw className="w-3.5 h-3.5" /> Request Re-upload
            </button>
          </div>
        </div>
      )}
      {doc.verified_at && <p className="text-[11px] text-gray-400 mt-2">Last action {fmtDate(doc.verified_at)}{doc.verified_by_name ? ` by ${doc.verified_by_name}` : ''}</p>}
    </motion.div>
  );
}

export default function VerifyDocumentsPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [empSearch, setEmpSearch] = useState('');
  const [employeeId, setEmployeeId] = useState(null);

  const { data: empResults } = useQuery({
    queryKey: ['emp-search', empSearch],
    queryFn: () => hrEmployeesAPI.list({ search: empSearch }).then(r => r.data.data),
    enabled: empSearch.length >= 2 && !employeeId,
  });
  const { data: detail, isLoading } = useQuery({
    queryKey: ['doc-verification-employee', employeeId],
    queryFn: () => hrDocVerificationAPI.employee(employeeId).then(r => r.data.data),
    enabled: !!employeeId,
  });

  const refetch = () => qc.invalidateQueries({ queryKey: ['doc-verification-employee', employeeId] });
  const docs = detail?.documents || [];

  return (
    <div className="min-h-screen p-4 md:p-6" style={{ background: B.bg }}>
      <button onClick={() => navigate('/hr-admin/onboarding/document-verification')} className="flex items-center gap-1.5 text-sm font-bold text-gray-500 hover:text-gray-700 mb-4">
        <ArrowLeft className="w-4 h-4" /> Back to Dashboard
      </button>

      <motion.div {...fade(0)} className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: `${B.blue}18` }}>
          <ShieldCheck className="w-5 h-5" style={{ color: B.blue }} />
        </div>
        <div>
          <h1 className="text-xl font-black text-gray-900">Verify Documents</h1>
          <p className="text-xs text-gray-400">Preview, compare and decide, one employee at a time</p>
        </div>
      </motion.div>

      {!employeeId ? (
        <motion.div {...fade(0.05)} className="bg-white rounded-2xl p-5 border border-gray-100" style={{ boxShadow: '0 2px 12px rgba(10,31,92,0.06)' }}>
          <div className="relative mb-3">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input value={empSearch} onChange={e => setEmpSearch(e.target.value)} placeholder="Search employee by name or code..."
              className="w-full text-sm pl-9 pr-3 py-2.5 rounded-lg border border-gray-200 focus:outline-none focus:border-blue-300" />
          </div>
          <div className="space-y-1.5 max-h-80 overflow-y-auto">
            {empSearch.length < 2 && <p className="text-xs text-gray-400">Type at least 2 characters to search.</p>}
            {(empResults || []).map(emp => {
              const [c1, c2] = avatarGrad(emp.name);
              return (
                <button key={emp.id} onClick={() => setEmployeeId(emp.id)}
                  className="w-full flex items-center gap-3 p-2.5 rounded-lg hover:bg-gray-50 text-left">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                    style={{ background: `linear-gradient(135deg, ${c1}, ${c2})` }}>{initials(emp.name)}</div>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-gray-800 truncate">{emp.name}</p>
                    <p className="text-xs text-gray-400">{emp.employee_code} · {emp.department || '—'}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </motion.div>
      ) : (
        <>
          <motion.div {...fade(0.05)} className="bg-white rounded-2xl p-4 mb-4 border border-gray-100 flex flex-wrap items-center gap-4" style={{ boxShadow: '0 2px 12px rgba(10,31,92,0.06)' }}>
            {isLoading || !detail ? <p className="text-sm text-gray-400">Loading employee...</p> : (
              <>
                {(() => { const [c1, c2] = avatarGrad(detail.name); return (
                  <div className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0"
                    style={{ background: `linear-gradient(135deg, ${c1}, ${c2})` }}>{initials(detail.name)}</div>
                ); })()}
                <div className="flex-1 min-w-[180px]">
                  <p className="text-sm font-bold text-gray-900">{detail.name}</p>
                  <p className="text-xs text-gray-400">{detail.employee_code} · {detail.department_name || 'No department'} · {detail.designation_name || '—'}</p>
                </div>
              </>
            )}
            <button onClick={() => setEmployeeId(null)} className="text-xs font-bold px-3 py-1.5 rounded-lg bg-gray-100 text-gray-500">
              Change Employee
            </button>
          </motion.div>

          <div className="space-y-3">
            {!isLoading && docs.length === 0 && <p className="text-sm text-gray-400 text-center py-10">No documents uploaded for this employee.</p>}
            {docs.map((doc, i) => (
              <DocReviewCard key={doc.id} doc={doc} employeeId={employeeId} delay={0.08 + i * 0.02} onDone={refetch} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
