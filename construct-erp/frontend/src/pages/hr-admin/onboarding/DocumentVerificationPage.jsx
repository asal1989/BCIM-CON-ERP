// src/pages/hr-admin/onboarding/DocumentVerificationPage.jsx
// Document Verification — Phase 1: taxonomy-driven upload tracking, Pending/
// Verified/Rejected queues, verify/reject actions, per-employee category
// view, basic audit trail. Expiry tracking, OCR, bulk actions, templates,
// and multi-format reports are intentionally out of scope for this phase.
import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  FileText, CheckCircle2, XCircle, Clock, AlertTriangle, Search, Upload,
  Eye, Users, ShieldCheck, History, X, FolderOpen, ArrowRight,
} from 'lucide-react';
import { hrDocVerificationAPI, hrEmployeesAPI } from '../../../api/client';
import { B, fade, KpiCard, SectionHeader } from '../../../components/hr/DashboardKit';

const STATUS_STYLE = {
  verified: { bg: '#ECFDF5', text: '#059669', dot: '#10B981', label: 'Verified' },
  pending:  { bg: '#FFFBEB', text: '#B45309', dot: '#F59E0B', label: 'Pending' },
  rejected: { bg: '#FEF2F2', text: '#DC2626', dot: '#EF4444', label: 'Rejected' },
  missing:  { bg: '#F3F4F6', text: '#6B7280', dot: '#9CA3AF', label: 'Missing' },
};

function StatusPill({ status }) {
  const s = STATUS_STYLE[status] || STATUS_STYLE.missing;
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold" style={{ background: s.bg, color: s.text }}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: s.dot }} />
      {s.label}
    </span>
  );
}

const TABS = [
  { key: 'dashboard', label: 'Dashboard', icon: FileText },
  { key: 'pending',   label: 'Pending Verification', icon: Clock },
  { key: 'verified',  label: 'Verified Documents', icon: CheckCircle2 },
  { key: 'rejected',  label: 'Rejected Documents', icon: XCircle },
  { key: 'employee',  label: 'Employee Documents', icon: Users },
];

export default function DocumentVerificationPage() {
  const [tab, setTab] = useState('dashboard');

  return (
    <div className="min-h-screen p-4 md:p-6" style={{ background: B.bg }}>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-gray-900">Document Verification</h1>
          <p className="text-sm text-gray-500 mt-0.5">Review, verify and track employee documents.</p>
        </div>
      </div>

      <div className="flex gap-1 bg-white p-1.5 rounded-2xl mb-6 border border-gray-100 w-fit flex-wrap" style={{ boxShadow: '0 2px 12px rgba(10,31,92,0.06)' }}>
        {TABS.map(t => {
          const Icon = t.icon;
          const active = tab === t.key;
          return (
            <button key={t.key} onClick={() => setTab(t.key)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all"
              style={active ? { background: B.navy, color: '#fff' } : { color: '#64748B' }}>
              <Icon className="w-3.5 h-3.5" /> {t.label}
            </button>
          );
        })}
      </div>

      {tab === 'dashboard' && <DashboardTab onNavigate={setTab} />}
      {tab === 'pending'   && <QueueTab status="pending" />}
      {tab === 'verified'  && <QueueTab status="verified" />}
      {tab === 'rejected'  && <QueueTab status="rejected" />}
      {tab === 'employee'  && <EmployeeTab />}
    </div>
  );
}

/* ─────────────────────────── Dashboard ─────────────────────────── */
function DashboardTab({ onNavigate }) {
  const { data, isLoading } = useQuery({
    queryKey: ['docverify-dashboard'],
    queryFn: () => hrDocVerificationAPI.dashboard().then(r => r.data?.data || {}),
  });

  return (
    <div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <KpiCard label="Pending Documents" value={isLoading ? '…' : data.pending} icon={Clock} color={B.warning} bg="#FFFBEB" onClick={() => onNavigate('pending')} delay={0} />
        <KpiCard label="Verified Documents" value={isLoading ? '…' : data.verified} icon={CheckCircle2} color={B.success} bg="#ECFDF5" onClick={() => onNavigate('verified')} delay={0.03} />
        <KpiCard label="Rejected Documents" value={isLoading ? '…' : data.rejected} icon={XCircle} color={B.danger} bg="#FEF2F2" onClick={() => onNavigate('rejected')} delay={0.06} />
        <KpiCard label="Missing Documents" value={isLoading ? '…' : data.missing} icon={AlertTriangle} color="#6B7280" bg="#F3F4F6" onClick={() => onNavigate('employee')} delay={0.09} />
      </div>
      <div className="bg-white rounded-2xl p-5 border border-gray-100" style={{ boxShadow: '0 2px 12px rgba(10,31,92,0.06)' }}>
        <SectionHeader title="Verification Completed Today" icon={ShieldCheck} iconColor={B.success} />
        <p className="text-4xl font-black text-gray-900">{isLoading ? '…' : (data.verified_today ?? 0)}</p>
        <p className="text-xs text-gray-400 mt-1">Documents marked Verified today across all employees.</p>
      </div>
    </div>
  );
}

/* ─────────────────────── Pending/Verified/Rejected queue ─────────────────────── */
function QueueTab({ status }) {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [rejectTarget, setRejectTarget] = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  const [historyTarget, setHistoryTarget] = useState(null);

  const { data, isLoading } = useQuery({
    queryKey: ['docverify-queue', status, search],
    queryFn: () => hrDocVerificationAPI.queue({ status, search: search || undefined }).then(r => r.data?.data || []),
  });

  const verifyMut = useMutation({
    mutationFn: (id) => hrDocVerificationAPI.verify(id),
    onSuccess: () => { toast.success('Document verified'); qc.invalidateQueries({ queryKey: ['docverify-queue'] }); qc.invalidateQueries({ queryKey: ['docverify-dashboard'] }); },
    onError: (e) => toast.error(e?.response?.data?.error || 'Failed to verify'),
  });
  const rejectMut = useMutation({
    mutationFn: ({ id, reason }) => hrDocVerificationAPI.reject(id, reason),
    onSuccess: () => { toast.success('Document rejected'); setRejectTarget(null); setRejectReason(''); qc.invalidateQueries({ queryKey: ['docverify-queue'] }); qc.invalidateQueries({ queryKey: ['docverify-dashboard'] }); },
    onError: (e) => toast.error(e?.response?.data?.error || 'Failed to reject'),
  });

  const rows = data || [];

  return (
    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden" style={{ boxShadow: '0 2px 12px rgba(10,31,92,0.06)' }}>
      <div className="p-4 border-b border-gray-100 flex items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search employee name or code…"
            className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-gray-200 outline-none focus:border-blue-400" />
        </div>
        <span className="text-xs text-gray-400 ml-auto">{rows.length} document{rows.length === 1 ? '' : 's'}</span>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              {['Employee', 'Document', 'Category', 'Uploaded', status === 'rejected' ? 'Reason' : (status === 'verified' ? 'Verified By' : ''), 'Actions'].map(h => (
                <th key={h} className="px-4 py-2.5 text-left text-[11px] font-bold uppercase tracking-wide text-gray-500 whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {isLoading ? (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-gray-400">Loading…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-gray-400">No documents here</td></tr>
            ) : rows.map(r => (
              <tr key={r.id} className="hover:bg-gray-50">
                <td className="px-4 py-2.5">
                  <p className="font-semibold text-gray-800">{r.employee_name}</p>
                  <p className="text-[11px] text-gray-400">{r.employee_code} {r.department_name ? `· ${r.department_name}` : ''}</p>
                </td>
                <td className="px-4 py-2.5 text-gray-700">{r.document_type_name || r.doc_name || r.doc_type}</td>
                <td className="px-4 py-2.5 text-gray-500">{r.category_name || '—'}</td>
                <td className="px-4 py-2.5 text-gray-500">{r.uploaded_at ? new Date(r.uploaded_at).toLocaleDateString('en-IN') : '—'}</td>
                <td className="px-4 py-2.5 text-gray-500">
                  {status === 'rejected' ? (r.rejection_reason || '—') : status === 'verified' ? (r.verified_by_name || '—') : ''}
                </td>
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-1.5">
                    {r.file_url && (
                      <a href={r.file_url} target="_blank" rel="noreferrer" title="View"
                        className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500"><Eye className="w-3.5 h-3.5" /></a>
                    )}
                    <button title="History" onClick={() => setHistoryTarget(r.id)}
                      className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500"><History className="w-3.5 h-3.5" /></button>
                    {status !== 'verified' && (
                      <button onClick={() => verifyMut.mutate(r.id)} disabled={verifyMut.isPending}
                        className="px-2.5 py-1 rounded-lg text-[11px] font-bold text-white disabled:opacity-50" style={{ background: B.success }}>
                        Verify
                      </button>
                    )}
                    {status !== 'rejected' && (
                      <button onClick={() => setRejectTarget(r.id)}
                        className="px-2.5 py-1 rounded-lg text-[11px] font-bold text-white" style={{ background: B.danger }}>
                        Reject
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {rejectTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setRejectTarget(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-5" onClick={e => e.stopPropagation()}>
            <h3 className="font-bold text-gray-900 mb-3">Reject Document</h3>
            <textarea rows={3} value={rejectReason} onChange={e => setRejectReason(e.target.value)}
              placeholder="Reason for rejection (shown to the employee)"
              className="w-full rounded-lg border border-gray-200 p-2.5 text-sm outline-none focus:border-red-400 resize-none" />
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setRejectTarget(null)} className="px-3 py-1.5 text-sm text-gray-600 rounded-lg hover:bg-gray-100">Cancel</button>
              <button
                disabled={!rejectReason || rejectMut.isPending}
                onClick={() => rejectMut.mutate({ id: rejectTarget, reason: rejectReason })}
                className="px-4 py-1.5 text-sm font-bold text-white rounded-lg disabled:opacity-50" style={{ background: B.danger }}>
                {rejectMut.isPending ? 'Rejecting…' : 'Reject & Notify'}
              </button>
            </div>
          </div>
        </div>
      )}

      {historyTarget && <HistoryModal documentId={historyTarget} onClose={() => setHistoryTarget(null)} />}
    </div>
  );
}

function HistoryModal({ documentId, onClose }) {
  const { data, isLoading } = useQuery({
    queryKey: ['docverify-history', documentId],
    queryFn: () => hrDocVerificationAPI.history(documentId).then(r => r.data?.data || []),
  });
  const ACTION_LABEL = { uploaded: 'Uploaded', verified: 'Verified', rejected: 'Rejected', resubmitted: 'Resubmitted' };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-5 max-h-[70vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold text-gray-900 flex items-center gap-2"><History className="w-4 h-4" /> Verification History</h3>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100"><X className="w-4 h-4" /></button>
        </div>
        {isLoading ? (
          <p className="text-sm text-gray-400 py-6 text-center">Loading…</p>
        ) : !data?.length ? (
          <p className="text-sm text-gray-400 py-6 text-center">No history recorded</p>
        ) : (
          <div className="space-y-3">
            {data.map(h => (
              <div key={h.id} className="border-l-2 pl-3" style={{ borderColor: STATUS_STYLE[h.action]?.dot || '#CBD5E1' }}>
                <p className="text-sm font-bold text-gray-800">{ACTION_LABEL[h.action] || h.action}</p>
                <p className="text-xs text-gray-400">{h.actor_name || 'System'} · {new Date(h.created_at).toLocaleString('en-IN')}</p>
                {h.remarks && <p className="text-xs text-gray-600 mt-1">{h.remarks}</p>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ─────────────────────── Employee Documents (category view) ─────────────────────── */
function EmployeeTab() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [rejectTarget, setRejectTarget] = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  const [uploadTarget, setUploadTarget] = useState(null); // { typeId, typeCode, typeName }

  const { data: employees = [] } = useQuery({
    queryKey: ['docverify-employees', search],
    queryFn: () => hrEmployeesAPI.list({ search: search || undefined }).then(r => (r.data?.data || []).filter(e => e.is_active)),
    enabled: search.length >= 2,
  });

  const { data: empData, isLoading } = useQuery({
    queryKey: ['docverify-employee', selectedId],
    queryFn: () => hrDocVerificationAPI.employee(selectedId).then(r => r.data?.data),
    enabled: !!selectedId,
  });

  const verifyMut = useMutation({
    mutationFn: (id) => hrDocVerificationAPI.verify(id),
    onSuccess: () => { toast.success('Document verified'); qc.invalidateQueries({ queryKey: ['docverify-employee'] }); qc.invalidateQueries({ queryKey: ['docverify-dashboard'] }); },
    onError: (e) => toast.error(e?.response?.data?.error || 'Failed to verify'),
  });
  const rejectMut = useMutation({
    mutationFn: ({ id, reason }) => hrDocVerificationAPI.reject(id, reason),
    onSuccess: () => { toast.success('Document rejected'); setRejectTarget(null); setRejectReason(''); qc.invalidateQueries({ queryKey: ['docverify-employee'] }); qc.invalidateQueries({ queryKey: ['docverify-dashboard'] }); },
    onError: (e) => toast.error(e?.response?.data?.error || 'Failed to reject'),
  });
  const uploadMut = useMutation({
    mutationFn: ({ file, typeId, typeName }) => hrEmployeesAPI.uploadDocument(selectedId, (() => {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('doc_type', typeId ? uploadTarget.typeCode : 'other');
      fd.append('doc_name', typeName);
      if (typeId) fd.append('document_type_id', typeId);
      return fd;
    })()),
    onSuccess: () => { toast.success('Document uploaded'); setUploadTarget(null); qc.invalidateQueries({ queryKey: ['docverify-employee'] }); qc.invalidateQueries({ queryKey: ['docverify-dashboard'] }); },
    onError: (e) => toast.error(e?.response?.data?.error || 'Upload failed'),
  });

  if (!selectedId) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 p-6" style={{ boxShadow: '0 2px 12px rgba(10,31,92,0.06)' }}>
        <div className="relative max-w-md mb-4">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search employee by name or code (2+ characters)…"
            className="w-full pl-9 pr-3 py-2.5 text-sm rounded-lg border border-gray-200 outline-none focus:border-blue-400" />
        </div>
        {search.length >= 2 && (
          <div className="divide-y divide-gray-100 border border-gray-100 rounded-xl max-w-md overflow-hidden">
            {employees.length === 0 ? (
              <p className="text-sm text-gray-400 p-4">No employees found</p>
            ) : employees.slice(0, 10).map(e => (
              <button key={e.id} onClick={() => setSelectedId(e.id)}
                className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-gray-50 text-left">
                <div>
                  <p className="text-sm font-semibold text-gray-800">{e.name}</p>
                  <p className="text-[11px] text-gray-400">{e.employee_code} {e.department_name ? `· ${e.department_name}` : ''}</p>
                </div>
                <ArrowRight className="w-4 h-4 text-gray-300" />
              </button>
            ))}
          </div>
        )}
        {search.length < 2 && <p className="text-sm text-gray-400">Search for an employee to view their document checklist.</p>}
      </div>
    );
  }

  return (
    <div>
      <button onClick={() => { setSelectedId(null); setSearch(''); }} className="text-sm text-blue-600 font-semibold mb-4 flex items-center gap-1">
        ← Back to search
      </button>
      {isLoading || !empData ? (
        <p className="text-sm text-gray-400">Loading…</p>
      ) : (
        <>
          <div className="bg-white rounded-2xl p-5 border border-gray-100 mb-5" style={{ boxShadow: '0 2px 12px rgba(10,31,92,0.06)' }}>
            <p className="text-lg font-black text-gray-900">{empData.employee.name}</p>
            <p className="text-xs text-gray-400">{empData.employee.employee_code}</p>
          </div>

          {empData.categories.map(cat => (
            <div key={cat.id} className="bg-white rounded-2xl border border-gray-100 mb-4 overflow-hidden" style={{ boxShadow: '0 2px 12px rgba(10,31,92,0.06)' }}>
              <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
                <FolderOpen className="w-4 h-4 text-gray-400" />
                <h3 className="font-bold text-gray-800 text-sm">{cat.name}</h3>
              </div>
              <div className="divide-y divide-gray-100">
                {cat.types.map(t => (
                  <div key={t.id} className="flex items-center justify-between px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-700">{t.name}</span>
                      {t.mandatory && <span className="text-[10px] font-bold text-red-500">Required</span>}
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusPill status={t.status} />
                      {t.document?.file_url && (
                        <a href={t.document.file_url} target="_blank" rel="noreferrer" title="View"
                          className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500"><Eye className="w-3.5 h-3.5" /></a>
                      )}
                      {t.document && t.status === 'pending' && (
                        <>
                          <button onClick={() => verifyMut.mutate(t.document.id)}
                            className="px-2 py-1 rounded-lg text-[11px] font-bold text-white" style={{ background: B.success }}>Verify</button>
                          <button onClick={() => setRejectTarget(t.document.id)}
                            className="px-2 py-1 rounded-lg text-[11px] font-bold text-white" style={{ background: B.danger }}>Reject</button>
                        </>
                      )}
                      {(!t.document || t.status === 'rejected') && (
                        <label className="px-2 py-1 rounded-lg text-[11px] font-bold text-white cursor-pointer flex items-center gap-1" style={{ background: B.blue }}>
                          <Upload className="w-3 h-3" /> {t.status === 'rejected' ? 'Resubmit' : 'Upload'}
                          <input type="file" className="hidden" onChange={e => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            setUploadTarget({ typeId: t.id, typeCode: t.code, typeName: t.name });
                            uploadMut.mutate({ file, typeId: t.id, typeName: t.name });
                          }} />
                        </label>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}

          {empData.unclassified?.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 p-4" style={{ boxShadow: '0 2px 12px rgba(10,31,92,0.06)' }}>
              <h3 className="font-bold text-gray-800 text-sm mb-2">Other Uploaded Documents</h3>
              <p className="text-xs text-gray-400 mb-3">Uploaded before this checklist existed, or not matched to a document type.</p>
              <div className="divide-y divide-gray-100">
                {empData.unclassified.map(d => (
                  <div key={d.id} className="flex items-center justify-between py-2">
                    <span className="text-sm text-gray-700">{d.doc_name || d.doc_type}</span>
                    <div className="flex items-center gap-2">
                      <StatusPill status={d.verification_status} />
                      {d.file_url && <a href={d.file_url} target="_blank" rel="noreferrer" className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500"><Eye className="w-3.5 h-3.5" /></a>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {rejectTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setRejectTarget(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-5" onClick={e => e.stopPropagation()}>
            <h3 className="font-bold text-gray-900 mb-3">Reject Document</h3>
            <textarea rows={3} value={rejectReason} onChange={e => setRejectReason(e.target.value)}
              placeholder="Reason for rejection (shown to the employee)"
              className="w-full rounded-lg border border-gray-200 p-2.5 text-sm outline-none focus:border-red-400 resize-none" />
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setRejectTarget(null)} className="px-3 py-1.5 text-sm text-gray-600 rounded-lg hover:bg-gray-100">Cancel</button>
              <button
                disabled={!rejectReason || rejectMut.isPending}
                onClick={() => rejectMut.mutate({ id: rejectTarget, reason: rejectReason })}
                className="px-4 py-1.5 text-sm font-bold text-white rounded-lg disabled:opacity-50" style={{ background: B.danger }}>
                {rejectMut.isPending ? 'Rejecting…' : 'Reject & Notify'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
