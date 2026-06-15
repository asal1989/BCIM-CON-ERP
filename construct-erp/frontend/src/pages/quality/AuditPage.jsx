// src/pages/quality/AuditPage.jsx
// Quality Audits register + findings management (auto-NCR on major_nc)

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import {
  Shield, Plus, X, CheckCircle2, Clock, Search, Edit2, Trash2,
  Save, Eye, AlertTriangle, ShieldAlert, PlayCircle, CheckCheck,
  FileText, ClipboardX
} from 'lucide-react';
import { qualityAPI, projectAPI } from '../../api/client';
import AttachmentPanel from '../../components/quality/AttachmentPanel';
import toast from 'react-hot-toast';
import dayjs from 'dayjs';
import { clsx } from 'clsx';

const AUDIT_TYPES = [
  { value: 'internal', label: 'Internal' },
  { value: 'external', label: 'External' },
  { value: 'third_party', label: 'Third-Party' },
  { value: 'client', label: 'Client' },
];

const STATUS_CFG = {
  scheduled:   { label: 'Scheduled',   color: 'bg-slate-100 text-slate-600',     icon: Clock },
  in_progress: { label: 'In Progress', color: 'bg-blue-100 text-blue-700',       icon: PlayCircle },
  completed:   { label: 'Completed',   color: 'bg-emerald-100 text-emerald-700', icon: CheckCircle2 },
  closed:      { label: 'Closed',      color: 'bg-violet-100 text-violet-700',   icon: CheckCheck },
};

const FINDING_CFG = {
  major_nc:     { label: 'Major NC',     color: 'bg-red-100 text-red-700' },
  minor_nc:     { label: 'Minor NC',     color: 'bg-amber-100 text-amber-700' },
  observation:  { label: 'Observation',  color: 'bg-blue-100 text-blue-700' },
  opportunity:  { label: 'Opportunity',  color: 'bg-emerald-100 text-emerald-700' },
};

function StatusBadge({ status }) {
  const cfg = STATUS_CFG[status] || STATUS_CFG.scheduled;
  const Icon = cfg.icon;
  return (
    <span className={clsx('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium', cfg.color)}>
      <Icon className="w-3 h-3" />{cfg.label}
    </span>
  );
}

export default function AuditPage() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editAudit, setEditAudit] = useState(null);
  const [detailId, setDetailId] = useState(null);
  const [projectFilter, setProjectFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');

  const { data: audits = [], isLoading } = useQuery({
    queryKey: ['quality-audits', projectFilter, statusFilter, search],
    queryFn: () => qualityAPI.listAudits({
      project_id: projectFilter || undefined,
      status: statusFilter || undefined,
      search: search || undefined,
    }).then(r => r.data?.data ?? []),
  });

  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: () => projectAPI.list().then(r => { const d = r.data; return Array.isArray(d) ? d : d?.data ?? []; }),
  });

  const { register, handleSubmit, reset, formState: { errors } } = useForm();
  const openCreate = () => { reset({}); setEditAudit(null); setShowForm(true); };
  const openEdit = (a) => {
    reset({
      project_id: a.project_id, audit_type: a.audit_type,
      audit_standard: a.audit_standard || '', scope: a.scope || '',
      audit_date: a.audit_date?.slice(0,10) || '', auditor_name: a.auditor_name || '',
      auditor_company: a.auditor_company || '', summary: a.summary || '',
      overall_rating: a.overall_rating || '',
    });
    setEditAudit(a); setShowForm(true);
  };

  const saveMut = useMutation({
    mutationFn: (d) => editAudit ? qualityAPI.updateAudit(editAudit.id, d) : qualityAPI.createAudit(d),
    onSuccess: () => { toast.success(editAudit ? 'Audit updated' : 'Audit created'); qc.invalidateQueries({ queryKey: ['quality-audits'] }); setShowForm(false); },
    onError: (e) => toast.error(e?.response?.data?.error || 'Save failed'),
  });

  const statusMut = useMutation({
    mutationFn: ({ id, status }) => qualityAPI.setAuditStatus(id, status),
    onSuccess: () => { toast.success('Status updated'); qc.invalidateQueries({ queryKey: ['quality-audits'] }); },
  });

  const deleteMut = useMutation({
    mutationFn: (id) => qualityAPI.deleteAudit(id),
    onSuccess: () => { toast.success('Deleted'); qc.invalidateQueries({ queryKey: ['quality-audits'] }); },
    onError: (e) => toast.error(e?.response?.data?.error || 'Delete failed'),
  });

  const counts = {
    total: audits.length,
    in_progress: audits.filter(a => a.status === 'in_progress').length,
    completed: audits.filter(a => ['completed','closed'].includes(a.status)).length,
    open_findings: audits.reduce((s, a) => s + parseInt(a.open_findings || 0, 10), 0),
  };

  return (
    <div className="bg-[#f4f6f9] min-h-full p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-indigo-600 rounded-xl flex items-center justify-center">
            <Shield className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-slate-800">Quality Audits</h1>
            <p className="text-xs text-slate-500">Internal / External · ISO 9001 · IS Codes · Findings → Auto-NCR</p>
          </div>
        </div>
        <button onClick={openCreate}
          className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg px-4 py-2 flex items-center gap-2 transition-colors">
          <Plus className="w-4 h-4" /> New Audit
        </button>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total Audits', value: counts.total, color: 'text-slate-700' },
          { label: 'In Progress', value: counts.in_progress, color: 'text-blue-600' },
          { label: 'Completed', value: counts.completed, color: 'text-emerald-600' },
          { label: 'Open Findings', value: counts.open_findings, color: 'text-red-600' },
        ].map(k => (
          <div key={k.label} className="bg-white rounded-xl border border-slate-200 p-3 text-center">
            <div className={clsx('text-xl font-bold', k.color)}>{k.value}</div>
            <div className="text-xs text-slate-400 mt-0.5">{k.label}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="bg-white border border-slate-200 rounded-xl p-3 flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search audit no, scope, auditor…"
            className="w-full border border-slate-200 rounded-lg pl-9 pr-3 py-2 text-sm outline-none focus:border-indigo-400" />
        </div>
        <select value={projectFilter} onChange={e => setProjectFilter(e.target.value)}
          className="border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-400">
          <option value="">All Projects</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          className="border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-400">
          <option value="">All Status</option>
          {Object.entries(STATUS_CFG).map(([v, c]) => <option key={v} value={v}>{c.label}</option>)}
        </select>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="space-y-2">{[1,2,3].map(n => <div key={n} className="h-14 bg-slate-200 animate-pulse rounded-xl" />)}</div>
      ) : audits.length === 0 ? (
        <div className="py-20 text-center bg-white border-2 border-dashed border-slate-200 rounded-xl">
          <Shield className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="text-sm font-medium text-slate-500">No audits scheduled yet</p>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr>
                {['Audit #','Type','Standard','Project','Auditor','Date','Findings','Status','Actions'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-medium text-slate-500 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {audits.map(a => (
                <tr key={a.id} className="hover:bg-slate-50 transition-colors group">
                  <td className="px-4 py-3">
                    <span className="font-mono text-xs font-semibold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded">{a.audit_number}</span>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-600 capitalize">{a.audit_type?.replace('_',' ')}</td>
                  <td className="px-4 py-3 text-xs text-slate-500">{a.audit_standard || '—'}</td>
                  <td className="px-4 py-3 text-xs text-slate-500">{a.project_name}</td>
                  <td className="px-4 py-3 text-xs text-slate-500">{a.auditor_name || '—'}</td>
                  <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">
                    {a.audit_date ? dayjs(a.audit_date).format('DD MMM YYYY') : '—'}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {a.finding_count > 0 ? (
                      <span className="flex items-center gap-1">
                        <span className="text-slate-600">{a.finding_count}</span>
                        {a.open_findings > 0 && <span className="text-red-600 font-medium">({a.open_findings} open)</span>}
                      </span>
                    ) : <span className="text-slate-300">0</span>}
                  </td>
                  <td className="px-4 py-3"><StatusBadge status={a.status} /></td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => setDetailId(a.id)} title="Open"
                        className="w-7 h-7 flex items-center justify-center rounded-lg border border-indigo-200 bg-indigo-50 text-indigo-600 hover:bg-indigo-100 transition-all">
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                      {a.status === 'scheduled' && (
                        <>
                          <button onClick={() => openEdit(a)} title="Edit"
                            className="w-7 h-7 flex items-center justify-center rounded-lg border border-slate-200 text-slate-400 hover:text-indigo-600 hover:border-indigo-300 transition-all">
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => statusMut.mutate({ id: a.id, status: 'in_progress' })} title="Start audit"
                            className="w-7 h-7 flex items-center justify-center rounded-lg border border-blue-200 bg-blue-50 text-blue-600 hover:bg-blue-100 transition-all">
                            <PlayCircle className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => { if (window.confirm('Delete audit?')) deleteMut.mutate(a.id); }} title="Delete"
                            className="w-7 h-7 flex items-center justify-center rounded-lg border border-slate-200 text-slate-300 hover:text-red-500 hover:border-red-200 transition-all">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}
                      {a.status === 'in_progress' && (
                        <button onClick={() => statusMut.mutate({ id: a.id, status: 'completed' })} title="Mark completed"
                          className="w-7 h-7 flex items-center justify-center rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 transition-all">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Detail modal */}
      {detailId && <AuditDetail auditId={detailId} onClose={() => setDetailId(null)} />}

      {/* Create / Edit modal */}
      {showForm && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-start justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg my-8">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h2 className="text-base font-semibold text-slate-900">{editAudit ? `Edit — ${editAudit.audit_number}` : 'New Quality Audit'}</h2>
              <button onClick={() => setShowForm(false)} className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:text-slate-900">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSubmit(d => saveMut.mutate(d))} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-slate-700 mb-1">Project *</label>
                  <select {...register('project_id', { required: true })} disabled={!!editAudit}
                    className={clsx('w-full border rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-400', errors.project_id ? 'border-red-300' : 'border-slate-200')}>
                    <option value="">Select project…</option>
                    {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Audit Type</label>
                  <select {...register('audit_type')} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-400">
                    {AUDIT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Standard</label>
                  <input {...register('audit_standard')} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-400" placeholder="ISO 9001:2015 / IS 456" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Audit Date</label>
                  <input type="date" {...register('audit_date')} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-400" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Overall Rating</label>
                  <select {...register('overall_rating')} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-400">
                    <option value="">—</option>
                    <option value="satisfactory">Satisfactory</option>
                    <option value="needs_improvement">Needs Improvement</option>
                    <option value="unsatisfactory">Unsatisfactory</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Auditor Name</label>
                  <input {...register('auditor_name')} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-400" placeholder="Lead auditor" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Auditor Company</label>
                  <input {...register('auditor_company')} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-400" placeholder="Auditing body" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Scope</label>
                <textarea {...register('scope')} rows={2} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-400 resize-none" placeholder="Audit scope and areas covered…" />
              </div>
              {editAudit && (
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Summary</label>
                  <textarea {...register('summary')} rows={2} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-400 resize-none" placeholder="Audit summary / conclusions…" />
                </div>
              )}
              <div className="flex gap-3 pt-2 border-t border-slate-100">
                <button type="button" onClick={() => setShowForm(false)} className="flex-1 border border-slate-200 text-slate-600 text-sm font-medium rounded-lg py-2 hover:bg-slate-50">Cancel</button>
                <button type="submit" disabled={saveMut.isPending} className="flex-[2] bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg py-2 disabled:opacity-60 flex items-center justify-center gap-2">
                  <Save className="w-4 h-4" />{saveMut.isPending ? 'Saving…' : editAudit ? 'Update' : 'Create Audit'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Audit Detail with findings ────────────────────────────────────────────────
function AuditDetail({ auditId, onClose }) {
  const qc = useQueryClient();
  const [showAddFinding, setShowAddFinding] = useState(false);
  const [newFinding, setNewFinding] = useState({ finding_type: 'observation', clause_reference: '', description: '', location: '', target_date: '' });

  const { data: audit, isLoading } = useQuery({
    queryKey: ['quality-audit-detail', auditId],
    queryFn: () => qualityAPI.getAudit(auditId).then(r => r.data?.data),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['quality-audits'] });
    qc.invalidateQueries({ queryKey: ['quality-audit-detail', auditId] });
  };

  const addFindingMut = useMutation({
    mutationFn: (d) => qualityAPI.createFinding(auditId, d),
    onSuccess: (res) => {
      const f = res.data?.data;
      toast.success(f?.ncr_number ? `Finding added — ${f.ncr_number} auto-created` : 'Finding added');
      invalidate();
      setShowAddFinding(false);
      setNewFinding({ finding_type: 'observation', clause_reference: '', description: '', location: '', target_date: '' });
    },
    onError: (e) => toast.error(e?.response?.data?.error || 'Failed'),
  });

  const closeFindingMut = useMutation({
    mutationFn: ({ fid, response }) => qualityAPI.closeFinding(auditId, fid, { response }),
    onSuccess: () => { toast.success('Finding closed'); invalidate(); },
  });

  const delFindingMut = useMutation({
    mutationFn: (fid) => qualityAPI.deleteFinding(auditId, fid),
    onSuccess: () => { toast.success('Finding removed'); invalidate(); },
  });

  const attachMut = useMutation({
    mutationFn: (atts) => qualityAPI.updateAuditAttachments(auditId, atts),
    onSuccess: invalidate,
  });

  const closeAuditMut = useMutation({
    mutationFn: () => qualityAPI.setAuditStatus(auditId, 'closed'),
    onSuccess: () => { toast.success('Audit closed'); invalidate(); },
    onError: (e) => toast.error(e?.response?.data?.error || 'Failed to close audit'),
  });

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 bg-indigo-600 shrink-0">
          <div>
            <p className="text-base font-semibold text-white">{audit?.audit_number || 'Loading…'}</p>
            <p className="text-xs text-indigo-200 mt-0.5">{audit?.audit_standard} · {audit?.project_name}</p>
          </div>
          <button onClick={onClose} className="text-indigo-200 hover:text-white"><X className="w-5 h-5" /></button>
        </div>

        <div className="overflow-y-auto p-6 space-y-5">
          {isLoading || !audit ? (
            <div className="flex items-center justify-center py-12"><div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" /></div>
          ) : (
            <>
              <div className="flex items-center gap-3 flex-wrap">
                <StatusBadge status={audit.status} />
                <span className="text-xs text-slate-500 capitalize">{audit.audit_type?.replace('_',' ')} · {audit.auditor_name}</span>
                {audit.overall_rating && (
                  <span className={clsx('text-xs px-2 py-0.5 rounded-full font-medium',
                    audit.overall_rating === 'satisfactory' ? 'bg-emerald-100 text-emerald-700' :
                    audit.overall_rating === 'unsatisfactory' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700')}>
                    {audit.overall_rating.replace('_',' ')}
                  </span>
                )}
              </div>

              {audit.scope && (
                <div className="bg-slate-50 rounded-lg p-3">
                  <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wide mb-1">Scope</p>
                  <p className="text-sm text-slate-700">{audit.scope}</p>
                </div>
              )}

              {/* Findings */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                    <ClipboardX className="w-4 h-4 text-indigo-600" /> Findings ({audit.findings?.length || 0})
                  </p>
                  {audit.status !== 'closed' && (
                    <button onClick={() => setShowAddFinding(p => !p)} className="text-xs text-indigo-600 hover:text-indigo-800 flex items-center gap-1">
                      <Plus className="w-3.5 h-3.5" /> Add Finding
                    </button>
                  )}
                </div>

                {/* Add finding form */}
                {showAddFinding && (
                  <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 mb-3 space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs text-slate-500 mb-0.5 block">Finding Type</label>
                        <select value={newFinding.finding_type} onChange={e => setNewFinding(p => ({ ...p, finding_type: e.target.value }))}
                          className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-indigo-400">
                          {Object.entries(FINDING_CFG).map(([v, c]) => <option key={v} value={v}>{c.label}</option>)}
                        </select>
                        {newFinding.finding_type === 'major_nc' && (
                          <p className="text-[10px] text-red-600 mt-1 flex items-center gap-1">
                            <ShieldAlert className="w-3 h-3" /> Will auto-create an NCR
                          </p>
                        )}
                      </div>
                      <div>
                        <label className="text-xs text-slate-500 mb-0.5 block">Clause Reference</label>
                        <input value={newFinding.clause_reference} onChange={e => setNewFinding(p => ({ ...p, clause_reference: e.target.value }))}
                          className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-indigo-400" placeholder="ISO 9001 Cl.8.5" />
                      </div>
                    </div>
                    <div>
                      <label className="text-xs text-slate-500 mb-0.5 block">Description *</label>
                      <textarea value={newFinding.description} onChange={e => setNewFinding(p => ({ ...p, description: e.target.value }))} rows={2}
                        className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-indigo-400 resize-none" placeholder="Describe the finding…" />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs text-slate-500 mb-0.5 block">Location</label>
                        <input value={newFinding.location} onChange={e => setNewFinding(p => ({ ...p, location: e.target.value }))}
                          className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-indigo-400" placeholder="Area / zone" />
                      </div>
                      <div>
                        <label className="text-xs text-slate-500 mb-0.5 block">Target Date</label>
                        <input type="date" value={newFinding.target_date} onChange={e => setNewFinding(p => ({ ...p, target_date: e.target.value }))}
                          className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-indigo-400" />
                      </div>
                    </div>
                    <div className="flex gap-2 justify-end">
                      <button onClick={() => setShowAddFinding(false)} className="px-3 py-1.5 text-xs border border-slate-200 rounded-lg text-slate-500 hover:bg-white">Cancel</button>
                      <button onClick={() => newFinding.description.trim() ? addFindingMut.mutate(newFinding) : toast.error('Description required')}
                        className="px-3 py-1.5 text-xs bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">Add Finding</button>
                    </div>
                  </div>
                )}

                {/* Findings list */}
                {audit.findings?.length > 0 ? (
                  <div className="space-y-2">
                    {audit.findings.map(f => (
                      <div key={f.id} className="border border-slate-200 rounded-xl p-3">
                        <div className="flex items-start gap-3">
                          <span className="font-mono text-xs text-slate-400 mt-0.5">{f.finding_number}</span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className={clsx('text-[10px] font-medium px-1.5 py-0.5 rounded-full', FINDING_CFG[f.finding_type]?.color)}>
                                {FINDING_CFG[f.finding_type]?.label}
                              </span>
                              {f.clause_reference && <span className="text-[10px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">{f.clause_reference}</span>}
                              {f.ncr_number && (
                                <span className="inline-flex items-center gap-0.5 text-[10px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full">
                                  <ShieldAlert className="w-2.5 h-2.5" />{f.ncr_number}
                                </span>
                              )}
                              <span className={clsx('text-[10px] font-medium px-1.5 py-0.5 rounded-full ml-auto',
                                f.status === 'closed' ? 'bg-emerald-100 text-emerald-700' :
                                f.status === 'verified' ? 'bg-violet-100 text-violet-700' : 'bg-amber-100 text-amber-700')}>
                                {f.status}
                              </span>
                            </div>
                            <p className="text-sm text-slate-700 mt-1">{f.description}</p>
                            {f.location && <p className="text-xs text-slate-400 mt-0.5">📍 {f.location}{f.target_date ? ` · Target: ${dayjs(f.target_date).format('DD MMM YYYY')}` : ''}</p>}
                            {f.response && <p className="text-xs text-slate-500 mt-1 italic">Response: {f.response}</p>}
                          </div>
                        </div>
                        {f.status !== 'closed' && audit.status !== 'closed' && (
                          <div className="flex gap-2 mt-2 pt-2 border-t border-slate-100">
                            <button onClick={() => { const resp = window.prompt('Closure response / corrective action taken:'); if (resp !== null) closeFindingMut.mutate({ fid: f.id, response: resp }); }}
                              className="text-xs text-emerald-600 hover:text-emerald-800 flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3" /> Close
                            </button>
                            {!f.ncr_id && (
                              <button onClick={() => { if (window.confirm('Remove this finding?')) delFindingMut.mutate(f.id); }}
                                className="text-xs text-slate-400 hover:text-red-500 flex items-center gap-1">
                                <Trash2 className="w-3 h-3" /> Remove
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : !showAddFinding && (
                  <p className="text-xs text-slate-400 text-center py-3">No findings recorded.</p>
                )}
              </div>

              {/* Attachments */}
              <AttachmentPanel attachments={audit.attachments || []} onUpdate={(atts) => attachMut.mutate(atts)} label="Audit Report & Evidence" />

              {/* Close audit */}
              {audit.status === 'completed' && (
                <button onClick={() => closeAuditMut.mutate()} disabled={closeAuditMut.isPending}
                  className="w-full py-2 bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium rounded-lg flex items-center justify-center gap-2 disabled:opacity-60">
                  <CheckCheck className="w-4 h-4" /> {closeAuditMut.isPending ? 'Closing…' : 'Close Audit'}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
