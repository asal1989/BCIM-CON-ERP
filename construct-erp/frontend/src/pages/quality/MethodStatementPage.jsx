// src/pages/quality/MethodStatementPage.jsx
import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import {
  BookOpen, Plus, X, CheckCircle2, Clock, XCircle,
  AlertCircle, Send, ThumbsUp, ThumbsDown, Edit2, Trash2, Save, Archive
} from 'lucide-react';
import { qualityAPI, projectAPI } from '../../api/client';
import AttachmentPanel from '../../components/quality/AttachmentPanel';
import QAQCDocPicker from '../../components/quality/QAQCDocPicker';
import toast from 'react-hot-toast';
import dayjs from 'dayjs';
import { clsx } from 'clsx';

const DISCIPLINES = ['Civil','Structural','MEP','Architecture','Finishes','Waterproofing','Piling','Earthworks','Other'];

const STATUS_CFG = {
  draft:      { label: 'Draft',      color: 'bg-slate-100 text-slate-600',     icon: Clock },
  submitted:  { label: 'Submitted',  color: 'bg-blue-100 text-blue-700',       icon: Send },
  approved:   { label: 'Approved',   color: 'bg-emerald-100 text-emerald-700', icon: CheckCircle2 },
  rejected:   { label: 'Rejected',   color: 'bg-red-100 text-red-700',         icon: XCircle },
  superseded: { label: 'Superseded', color: 'bg-orange-100 text-orange-700',   icon: Archive },
};

function StatusBadge({ status }) {
  const cfg = STATUS_CFG[status] || STATUS_CFG.draft;
  const Icon = cfg.icon;
  return (
    <span className={clsx('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium', cfg.color)}>
      <Icon className="w-3 h-3" />{cfg.label}
    </span>
  );
}

export default function MethodStatementPage() {
  const qc = useQueryClient();
  const [showForm,  setShowForm]  = useState(false);
  const [editMS,    setEditMS]    = useState(null);
  const [rejectId,  setRejectId]  = useState(null);
  const [rejectRemark, setRejectRemark] = useState('');
  const [projectFilter, setProjectFilter] = useState('');
  const [statusFilter,  setStatusFilter]  = useState('');
  const [search, setSearch] = useState('');

  // ── queries ────────────────────────────────────────────────────────────────
  const { data: docs = [], isLoading } = useQuery({
    queryKey: ['quality-ms', projectFilter, statusFilter, search],
    queryFn: () => qualityAPI.listMS({
      project_id: projectFilter || undefined,
      status:     statusFilter  || undefined,
      search:     search        || undefined,
    }).then(r => r.data?.data ?? []),
  });

  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: () => projectAPI.list().then(r => { const d = r.data; return Array.isArray(d) ? d : d?.data ?? []; }),
  });

  const { data: itps = [] } = useQuery({
    queryKey: ['quality-itps'],
    queryFn: () => qualityAPI.listITPs().then(r => r.data?.data ?? []),
  });

  // ── form ───────────────────────────────────────────────────────────────────
  const { register, handleSubmit, reset, formState: { errors } } = useForm();
  const openCreate = () => { reset({}); setEditMS(null); setShowForm(true); };
  const openEdit   = (ms) => {
    reset({ project_id: ms.project_id, title: ms.title, discipline: ms.discipline || '',
            work_type: ms.work_type || '', revision: ms.revision || '0', itp_id: ms.itp_id || '' });
    setEditMS(ms); setShowForm(true);
  };

  // ── mutations ──────────────────────────────────────────────────────────────
  const saveMut = useMutation({
    mutationFn: (d) => editMS ? qualityAPI.updateMS(editMS.id, d) : qualityAPI.createMS(d),
    onSuccess: () => {
      toast.success(editMS ? 'Updated' : 'Method Statement created');
      qc.invalidateQueries({ queryKey: ['quality-ms'] });
      setShowForm(false);
    },
    onError: (e) => toast.error(e?.response?.data?.error || 'Save failed'),
  });

  const submitMut = useMutation({
    mutationFn: (id) => qualityAPI.submitMS(id),
    onSuccess: () => { toast.success('Submitted for approval'); qc.invalidateQueries({ queryKey: ['quality-ms'] }); },
    onError: (e) => toast.error(e?.response?.data?.error || 'Submit failed'),
  });

  const approveMut = useMutation({
    mutationFn: (id) => qualityAPI.approveMS(id),
    onSuccess: () => { toast.success('Method Statement approved'); qc.invalidateQueries({ queryKey: ['quality-ms'] }); },
  });

  const rejectMut = useMutation({
    mutationFn: ({ id, rejection_remarks }) => qualityAPI.rejectMS(id, { rejection_remarks }),
    onSuccess: () => {
      toast.success('Rejected'); qc.invalidateQueries({ queryKey: ['quality-ms'] });
      setRejectId(null); setRejectRemark('');
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id) => qualityAPI.deleteMS(id),
    onSuccess: () => { toast.success('Deleted'); qc.invalidateQueries({ queryKey: ['quality-ms'] }); },
  });

  const attachMut = useMutation({
    mutationFn: ({ id, attachments }) => qualityAPI.updateMSAttachments(id, attachments),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['quality-ms'] }),
  });

  // ── stats ──────────────────────────────────────────────────────────────────
  const counts = { total: docs.length };
  Object.keys(STATUS_CFG).forEach(s => { counts[s] = docs.filter(d => d.status === s).length; });

  // ── render ─────────────────────────────────────────────────────────────────
  return (
    <div className="bg-[#f4f6f9] min-h-full p-6 space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-violet-600 rounded-xl flex items-center justify-center">
            <BookOpen className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-slate-800">Method Statements</h1>
            <p className="text-xs text-slate-500">MS Register — Submit → Approve workflow</p>
          </div>
        </div>
        <button onClick={openCreate}
          className="bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium rounded-lg px-4 py-2 flex items-center gap-2 transition-colors">
          <Plus className="w-4 h-4" /> New MS
        </button>
      </div>

      {/* QA/QC Document Library — Method Statement References */}
      <QAQCDocPicker
        docType="method_statement"
        title="📄 Method Statement Documents (28 files — click to preview or download)"
        defaultOpen={true}
      />

      {/* KPI strip */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { label: 'Total',      value: counts.total,      color: 'text-slate-700' },
          { label: 'Draft',      value: counts.draft || 0, color: 'text-slate-500' },
          { label: 'Submitted',  value: counts.submitted || 0, color: 'text-blue-600' },
          { label: 'Approved',   value: counts.approved || 0,  color: 'text-emerald-600' },
          { label: 'Rejected',   value: counts.rejected || 0,  color: 'text-red-600' },
        ].map(k => (
          <div key={k.label} className="bg-white rounded-xl border border-slate-200 p-3 text-center">
            <div className={clsx('text-xl font-bold', k.color)}>{k.value}</div>
            <div className="text-xs text-slate-400 mt-0.5">{k.label}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="bg-white border border-slate-200 rounded-xl p-3 flex flex-wrap gap-3">
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search MS number or title…"
          className="flex-1 min-w-[160px] border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-violet-400" />
        <select value={projectFilter} onChange={e => setProjectFilter(e.target.value)}
          className="border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-violet-400">
          <option value="">All Projects</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          className="border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-violet-400">
          <option value="">All Status</option>
          {Object.entries(STATUS_CFG).map(([v, c]) => <option key={v} value={v}>{c.label}</option>)}
        </select>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="space-y-2">{[1,2,3].map(n => <div key={n} className="h-16 bg-slate-200 animate-pulse rounded-xl" />)}</div>
      ) : docs.length === 0 ? (
        <div className="py-20 text-center bg-white border-2 border-dashed border-slate-200 rounded-xl">
          <BookOpen className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="text-sm font-medium text-slate-500">No Method Statements found</p>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr>
                {['MS Number','Title','Project','Discipline','Revision','Status','ITP Linked','Date','Actions'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-medium text-slate-500 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {docs.map(ms => (
                <tr key={ms.id} className="hover:bg-slate-50 transition-colors group">
                  <td className="px-4 py-3">
                    <span className="font-mono text-xs font-semibold text-violet-700 bg-violet-50 px-2 py-0.5 rounded">
                      {ms.ms_number}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-medium text-slate-800 max-w-xs">
                    <span className="truncate block max-w-[200px]" title={ms.title}>{ms.title}</span>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">{ms.project_name}</td>
                  <td className="px-4 py-3 text-xs text-slate-500">{ms.discipline || '—'}</td>
                  <td className="px-4 py-3 text-xs text-slate-500 text-center">Rev {ms.revision || '0'}</td>
                  <td className="px-4 py-3"><StatusBadge status={ms.status} /></td>
                  <td className="px-4 py-3 text-xs text-slate-500">
                    {ms.itp_number ? (
                      <span className="text-indigo-600 font-medium">{ms.itp_number}</span>
                    ) : '—'}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-400 whitespace-nowrap">
                    {dayjs(ms.created_at).format('DD MMM YYYY')}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      {/* Draft: edit + submit + delete */}
                      {ms.status === 'draft' && (
                        <>
                          <button onClick={() => openEdit(ms)} title="Edit"
                            className="w-7 h-7 flex items-center justify-center rounded-lg border border-slate-200 text-slate-400 hover:text-violet-600 hover:border-violet-300 transition-all">
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => { if (window.confirm('Submit for approval?')) submitMut.mutate(ms.id); }} title="Submit"
                            className="w-7 h-7 flex items-center justify-center rounded-lg border border-blue-200 bg-blue-50 text-blue-600 hover:bg-blue-100 transition-all">
                            <Send className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => { if (window.confirm('Delete this draft?')) deleteMut.mutate(ms.id); }} title="Delete"
                            className="w-7 h-7 flex items-center justify-center rounded-lg border border-slate-200 text-slate-300 hover:text-red-500 hover:border-red-200 transition-all">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}
                      {/* Submitted: approve + reject */}
                      {ms.status === 'submitted' && (
                        <>
                          <button onClick={() => { if (window.confirm('Approve this MS?')) approveMut.mutate(ms.id); }} title="Approve"
                            className="flex items-center gap-1 px-2 py-1 rounded-lg border border-emerald-300 bg-emerald-50 text-emerald-700 text-xs hover:bg-emerald-100 transition-all">
                            <ThumbsUp className="w-3 h-3" /> Approve
                          </button>
                          <button onClick={() => setRejectId(ms.id)} title="Reject"
                            className="flex items-center gap-1 px-2 py-1 rounded-lg border border-red-200 bg-red-50 text-red-600 text-xs hover:bg-red-100 transition-all">
                            <ThumbsDown className="w-3 h-3" /> Reject
                          </button>
                        </>
                      )}
                      {/* Rejected: re-submit */}
                      {ms.status === 'rejected' && (
                        <button onClick={() => openEdit(ms)} title="Revise and resubmit"
                          className="flex items-center gap-1 px-2 py-1 rounded-lg border border-violet-300 bg-violet-50 text-violet-700 text-xs hover:bg-violet-100 transition-all">
                          <Edit2 className="w-3 h-3" /> Revise
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

      {/* Reject modal */}
      {rejectId && (
        <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
            <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
              <ThumbsDown className="w-4 h-4 text-red-500" /> Reject Method Statement
            </h2>
            <div>
              <label className="text-xs font-medium text-slate-700 mb-1 block">Rejection Remarks *</label>
              <textarea rows={3} value={rejectRemark} onChange={e => setRejectRemark(e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-red-400 resize-none"
                placeholder="Reason for rejection…" />
            </div>
            <div className="flex gap-3">
              <button onClick={() => { setRejectId(null); setRejectRemark(''); }}
                className="flex-1 border border-slate-200 text-slate-600 text-sm rounded-lg py-2 hover:bg-slate-50">
                Cancel
              </button>
              <button onClick={() => rejectMut.mutate({ id: rejectId, rejection_remarks: rejectRemark })}
                disabled={!rejectRemark.trim() || rejectMut.isPending}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white text-sm rounded-lg py-2 transition-colors disabled:opacity-60">
                {rejectMut.isPending ? 'Rejecting…' : 'Confirm Reject'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create / Edit modal */}
      {showForm && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h2 className="text-base font-semibold text-slate-900">
                {editMS ? `Edit — ${editMS.ms_number}` : 'New Method Statement'}
              </h2>
              <button onClick={() => setShowForm(false)}
                className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:text-slate-900">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSubmit(d => saveMut.mutate(d))} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Project *</label>
                <select {...register('project_id', { required: true })} disabled={!!editMS}
                  className={clsx('w-full border rounded-lg px-3 py-2 text-sm outline-none focus:border-violet-400',
                    errors.project_id ? 'border-red-300' : 'border-slate-200')}>
                  <option value="">Select project…</option>
                  {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Title *</label>
                <input {...register('title', { required: true })}
                  className={clsx('w-full border rounded-lg px-3 py-2 text-sm outline-none focus:border-violet-400',
                    errors.title ? 'border-red-300' : 'border-slate-200')}
                  placeholder="e.g. Method Statement for Concrete Works" />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Discipline</label>
                  <select {...register('discipline')}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-violet-400">
                    <option value="">Select…</option>
                    {DISCIPLINES.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Work Type</label>
                  <input {...register('work_type')}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-violet-400"
                    placeholder="e.g. Concreting" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Revision</label>
                  <input {...register('revision')}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-violet-400"
                    placeholder="0" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Linked ITP</label>
                <select {...register('itp_id')}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-violet-400">
                  <option value="">None</option>
                  {itps.map(i => <option key={i.id} value={i.id}>{i.itp_number} — {i.title}</option>)}
                </select>
              </div>
              <div className="flex gap-3 pt-2 border-t border-slate-100">
                <button type="button" onClick={() => setShowForm(false)}
                  className="flex-1 border border-slate-200 text-slate-600 text-sm font-medium rounded-lg py-2 hover:bg-slate-50">
                  Cancel
                </button>
                <button type="submit" disabled={saveMut.isPending}
                  className="flex-[2] bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium rounded-lg py-2 disabled:opacity-60 flex items-center justify-center gap-2">
                  <Save className="w-4 h-4" />
                  {saveMut.isPending ? 'Saving…' : editMS ? 'Update MS' : 'Create MS'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
