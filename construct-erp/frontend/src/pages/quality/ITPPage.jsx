// src/pages/quality/ITPPage.jsx
// Inspection & Test Plan (ITP) register with inline activity editor

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm, useFieldArray } from 'react-hook-form';
import {
  ClipboardList, Plus, X, ChevronDown, ChevronUp,
  CheckCircle2, Clock, Archive, Edit2, Trash2,
  Shield, AlertCircle, Eye, FileText, Save
} from 'lucide-react';
import { qualityAPI, projectAPI } from '../../api/client';
import AttachmentPanel from '../../components/quality/AttachmentPanel';
import QAQCDocPicker from '../../components/quality/QAQCDocPicker';
import toast from 'react-hot-toast';
import dayjs from 'dayjs';
import { clsx } from 'clsx';

// ── constants ────────────────────────────────────────────────────────────────
const POINT_TYPES = [
  { value: 'R', label: 'R — Review',   color: 'bg-blue-100 text-blue-700' },
  { value: 'H', label: 'H — Hold',     color: 'bg-red-100 text-red-700' },
  { value: 'W', label: 'W — Witness',  color: 'bg-amber-100 text-amber-700' },
  { value: 'M', label: 'M — Monitor',  color: 'bg-slate-100 text-slate-600' },
];
const DISCIPLINES = ['Civil','Structural','MEP','Architecture','Finishes','Waterproofing','Piling','Earthworks','Other'];
const STATUS_CFG = {
  draft:      { label: 'Draft',      color: 'bg-slate-100 text-slate-600',   icon: Clock },
  issued:     { label: 'Issued',     color: 'bg-emerald-100 text-emerald-700', icon: CheckCircle2 },
  superseded: { label: 'Superseded', color: 'bg-orange-100 text-orange-700',  icon: Archive },
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

function PointBadge({ type }) {
  const cfg = POINT_TYPES.find(p => p.value === type) || POINT_TYPES[0];
  return (
    <span className={clsx('inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold', cfg.color)}>
      {type}
    </span>
  );
}

// ── empty activity row for the form ──────────────────────────────────────────
const emptyActivity = () => ({
  activity_name: '', point_type: 'R', responsibility: '',
  applicable_spec: '', acceptance_criteria: '', checklist_id: ''
});

export default function ITPPage() {
  const qc = useQueryClient();
  const [showForm, setShowForm]       = useState(false);
  const [editITP,  setEditITP]        = useState(null);
  const [expanded, setExpanded]       = useState({});   // { [id]: bool }
  const [projectFilter, setProjectFilter] = useState('');
  const [statusFilter,  setStatusFilter]  = useState('');
  const [search, setSearch]           = useState('');

  // ── queries ────────────────────────────────────────────────────────────────
  const { data: itps = [], isLoading } = useQuery({
    queryKey: ['quality-itps', projectFilter, statusFilter, search],
    queryFn: () => qualityAPI.listITPs({
      project_id: projectFilter || undefined,
      status:     statusFilter  || undefined,
      search:     search        || undefined,
    }).then(r => r.data?.data ?? []),
  });

  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: () => projectAPI.list().then(r => {
      const d = r.data; return Array.isArray(d) ? d : d?.data ?? [];
    }),
  });

  const { data: checklists = [] } = useQuery({
    queryKey: ['quality-checklists'],
    queryFn: () => qualityAPI.listChecklists().then(r => r.data?.data ?? []),
  });

  // ── form ───────────────────────────────────────────────────────────────────
  const { register, handleSubmit, control, reset, setValue, watch,
          formState: { errors } } = useForm({
    defaultValues: { activities: [emptyActivity()] }
  });
  const { fields, append, remove } = useFieldArray({ control, name: 'activities' });

  const openCreate = () => { reset({ activities: [emptyActivity()] }); setEditITP(null); setShowForm(true); };
  const openEdit   = (itp) => {
    reset({
      project_id: itp.project_id, title: itp.title, discipline: itp.discipline || '',
      work_category: itp.work_category || '', revision: itp.revision || '0',
      description: itp.description || '', applicable_codes: itp.applicable_codes || '',
      activities: itp.activities?.length ? itp.activities : [emptyActivity()],
    });
    setEditITP(itp);
    setShowForm(true);
  };

  // ── mutations ──────────────────────────────────────────────────────────────
  const saveMut = useMutation({
    mutationFn: async (data) => {
      const { activities, ...header } = data;
      let itp;
      if (editITP) {
        itp = (await qualityAPI.updateITP(editITP.id, header)).data?.data;
      } else {
        itp = (await qualityAPI.createITP(header)).data?.data;
      }
      // sync activities (only for new ITPs or if activities were provided)
      if (!editITP && activities?.length) {
        for (const act of activities) {
          if (act.activity_name?.trim()) {
            await qualityAPI.createITPActivity(itp.id, act);
          }
        }
      }
      return itp;
    },
    onSuccess: () => {
      toast.success(editITP ? 'ITP updated' : 'ITP created');
      qc.invalidateQueries({ queryKey: ['quality-itps'] });
      setShowForm(false);
    },
    onError: (e) => toast.error(e?.response?.data?.error || 'Save failed'),
  });

  const approveMut = useMutation({
    mutationFn: (id) => qualityAPI.approveITP(id),
    onSuccess: () => { toast.success('ITP issued'); qc.invalidateQueries({ queryKey: ['quality-itps'] }); },
    onError: (e) => toast.error(e?.response?.data?.error || 'Approve failed'),
  });

  const deleteMut = useMutation({
    mutationFn: (id) => qualityAPI.deleteITP(id),
    onSuccess: () => { toast.success('ITP deleted'); qc.invalidateQueries({ queryKey: ['quality-itps'] }); },
    onError: (e) => toast.error(e?.response?.data?.error || 'Delete failed'),
  });

  const addActMut = useMutation({
    mutationFn: ({ itpId, data }) => qualityAPI.createITPActivity(itpId, data),
    onSuccess: () => { toast.success('Activity added'); qc.invalidateQueries({ queryKey: ['quality-itps'] }); },
  });

  const delActMut = useMutation({
    mutationFn: ({ itpId, actId }) => qualityAPI.deleteITPActivity(itpId, actId),
    onSuccess: () => { toast.success('Activity removed'); qc.invalidateQueries({ queryKey: ['quality-itps'] }); },
  });

  const toggleExpand = (id) => setExpanded(p => ({ ...p, [id]: !p[id] }));

  // ── stats ──────────────────────────────────────────────────────────────────
  const statCounts = {
    total:      itps.length,
    draft:      itps.filter(i => i.status === 'draft').length,
    issued:     itps.filter(i => i.status === 'issued').length,
    superseded: itps.filter(i => i.status === 'superseded').length,
  };

  // ── render ─────────────────────────────────────────────────────────────────
  return (
    <div className="bg-[#f4f6f9] min-h-full p-6 space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-indigo-600 rounded-xl flex items-center justify-center">
            <ClipboardList className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-black">Inspection & Test Plans</h1>
            <p className="text-xs text-slate-500">ITP Register — Hold / Witness / Review Points</p>
          </div>
        </div>
        <button onClick={openCreate}
          className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg px-4 py-2 flex items-center gap-2 transition-colors">
          <Plus className="w-4 h-4" /> New ITP
        </button>
      </div>

      {/* ITP Reference Documents from DMS */}
      <QAQCDocPicker
        docType="quality_plan"
        title="ITP & Quality Plan Reference Documents"
      />

      {/* KPI strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Total ITPs',  value: statCounts.total,      color: 'text-indigo-600', bg: 'bg-indigo-50' },
          { label: 'Draft',       value: statCounts.draft,      color: 'text-slate-600',  bg: 'bg-slate-100' },
          { label: 'Issued',      value: statCounts.issued,     color: 'text-emerald-600',bg: 'bg-emerald-50' },
          { label: 'Superseded',  value: statCounts.superseded, color: 'text-orange-600', bg: 'bg-orange-50' },
        ].map(k => (
          <div key={k.label} className="bg-white rounded-xl border border-slate-200 p-4">
            <div className={clsx('text-2xl font-bold', k.color)}>{k.value}</div>
            <div className="text-xs text-slate-500 mt-0.5">{k.label}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="bg-white border border-slate-200 rounded-xl p-3 flex flex-wrap gap-3">
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search ITP number or title…"
          className="flex-1 min-w-[180px] border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-400"
        />
        <select value={projectFilter} onChange={e => setProjectFilter(e.target.value)}
          className="border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-400">
          <option value="">All Projects</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          className="border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-400">
          <option value="">All Status</option>
          <option value="draft">Draft</option>
          <option value="issued">Issued</option>
          <option value="superseded">Superseded</option>
        </select>
      </div>

      {/* ITP List */}
      {isLoading ? (
        <div className="space-y-2">{[1,2,3].map(n => <div key={n} className="h-20 bg-slate-200 animate-pulse rounded-xl" />)}</div>
      ) : itps.length === 0 ? (
        <div className="py-20 text-center bg-white border-2 border-dashed border-slate-200 rounded-xl">
          <ClipboardList className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="text-sm font-medium text-slate-500">No ITPs found</p>
          <p className="text-xs text-slate-400 mt-1">Create your first Inspection & Test Plan</p>
        </div>
      ) : (
        <div className="space-y-3">
          {itps.map(itp => (
            <div key={itp.id} className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              {/* ITP header row */}
              <div className="flex items-center gap-4 px-5 py-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-xs font-semibold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded">
                      {itp.itp_number}
                    </span>
                    <StatusBadge status={itp.status} />
                    {itp.discipline && (
                      <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">{itp.discipline}</span>
                    )}
                  </div>
                  <p className="text-sm font-semibold text-black mt-1 truncate">{itp.title}</p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {itp.project_name} · Rev {itp.revision} · {itp.activity_count || 0} activities
                    {itp.approved_at && ` · Issued ${dayjs(itp.approved_at).format('DD MMM YYYY')}`}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {itp.status === 'draft' && (
                    <>
                      <button onClick={() => openEdit(itp)}
                        className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:text-indigo-600 hover:border-indigo-300 transition-all">
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => { if (window.confirm('Issue this ITP?')) approveMut.mutate(itp.id); }}
                        className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-emerald-300 bg-emerald-50 text-emerald-700 text-xs font-medium hover:bg-emerald-100 transition-all">
                        <Shield className="w-3 h-3" /> Issue
                      </button>
                      <button onClick={() => { if (window.confirm('Delete this draft ITP?')) deleteMut.mutate(itp.id); }}
                        className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 text-slate-400 hover:text-red-500 hover:border-red-200 transition-all">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </>
                  )}
                  <button onClick={() => toggleExpand(itp.id)}
                    className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 transition-all">
                    {expanded[itp.id] ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Activities panel */}
              {expanded[itp.id] && (
                <ITPActivitiesPanel itp={itp} checklists={checklists}
                  onAddActivity={(data) => addActMut.mutate({ itpId: itp.id, data })}
                  onDeleteActivity={(actId) => delActMut.mutate({ itpId: itp.id, actId })}
                />
              )}
            </div>
          ))}
        </div>
      )}

      {/* Create / Edit Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-start justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl my-8">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h2 className="text-base font-semibold text-slate-900">
                {editITP ? `Edit ITP — ${editITP.itp_number}` : 'New Inspection & Test Plan'}
              </h2>
              <button onClick={() => setShowForm(false)}
                className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:text-slate-900 transition-all">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSubmit(d => saveMut.mutate(d))} className="p-6 space-y-5">

              {/* Project + Title */}
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-slate-700 mb-1">Project *</label>
                  <select {...register('project_id', { required: true })}
                    disabled={!!editITP}
                    className={clsx('w-full border rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-400',
                      errors.project_id ? 'border-red-300' : 'border-slate-200')}>
                    <option value="">Select project…</option>
                    {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-slate-700 mb-1">ITP Title *</label>
                  <input {...register('title', { required: true })}
                    className={clsx('w-full border rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-400',
                      errors.title ? 'border-red-300' : 'border-slate-200')}
                    placeholder="e.g. Reinforced Concrete — Column ITP" />
                </div>
              </div>

              {/* Discipline + Category + Revision */}
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Discipline</label>
                  <select {...register('discipline')}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-400">
                    <option value="">Select…</option>
                    {DISCIPLINES.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Work Category</label>
                  <input {...register('work_category')}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-400"
                    placeholder="e.g. Concrete Works" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Revision</label>
                  <input {...register('revision')}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-400"
                    placeholder="0" />
                </div>
              </div>

              {/* Applicable codes */}
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Applicable Codes / Standards</label>
                <input {...register('applicable_codes')}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-400"
                  placeholder="e.g. IS 456:2000, IS 383, IS 516" />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Description</label>
                <textarea {...register('description')} rows={2}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-400 resize-none"
                  placeholder="Scope and purpose of this ITP…" />
              </div>

              {/* Activities — only for new ITP */}
              {!editITP && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-semibold text-slate-700 uppercase tracking-wide">
                      ITP Activities
                    </label>
                    <button type="button" onClick={() => append(emptyActivity())}
                      className="text-xs text-indigo-600 hover:text-indigo-800 flex items-center gap-1">
                      <Plus className="w-3.5 h-3.5" /> Add row
                    </button>
                  </div>
                  <div className="border border-slate-200 rounded-xl overflow-hidden">
                    <table className="w-full text-xs">
                      <thead className="bg-slate-50 border-b border-slate-200">
                        <tr>
                          <th className="text-left px-3 py-2 text-slate-500 font-medium w-8">#</th>
                          <th className="text-left px-3 py-2 text-slate-500 font-medium">Activity</th>
                          <th className="text-left px-3 py-2 text-slate-500 font-medium w-24">Point</th>
                          <th className="text-left px-3 py-2 text-slate-500 font-medium w-28">By</th>
                          <th className="w-8" />
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {fields.map((field, i) => (
                          <tr key={field.id}>
                            <td className="px-3 py-1.5 text-slate-400">{i+1}</td>
                            <td className="px-3 py-1.5">
                              <input {...register(`activities.${i}.activity_name`)}
                                className="w-full border-0 bg-transparent outline-none text-sm placeholder:text-slate-300"
                                placeholder="Activity description…" />
                            </td>
                            <td className="px-3 py-1.5">
                              <select {...register(`activities.${i}.point_type`)}
                                className="border border-slate-200 rounded px-1.5 py-1 text-xs outline-none focus:border-indigo-400">
                                {POINT_TYPES.map(p => <option key={p.value} value={p.value}>{p.value}</option>)}
                              </select>
                            </td>
                            <td className="px-3 py-1.5">
                              <input {...register(`activities.${i}.responsibility`)}
                                className="w-full border-0 bg-transparent outline-none text-xs placeholder:text-slate-300"
                                placeholder="Engineer…" />
                            </td>
                            <td className="px-2 py-1.5">
                              {fields.length > 1 && (
                                <button type="button" onClick={() => remove(i)}
                                  className="text-slate-300 hover:text-red-400 transition-colors">
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Buttons */}
              <div className="flex gap-3 pt-2 border-t border-slate-100">
                <button type="button" onClick={() => setShowForm(false)}
                  className="flex-1 border border-slate-200 text-slate-600 text-sm font-medium rounded-lg py-2 hover:bg-slate-50 transition-colors">
                  Cancel
                </button>
                <button type="submit" disabled={saveMut.isPending}
                  className="flex-[2] bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg py-2 transition-colors disabled:opacity-60 flex items-center justify-center gap-2">
                  <Save className="w-4 h-4" />
                  {saveMut.isPending ? 'Saving…' : editITP ? 'Update ITP' : 'Create ITP'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// ── ITP Activities sub-panel ──────────────────────────────────────────────────
function ITPActivitiesPanel({ itp, checklists, onAddActivity, onDeleteActivity }) {
  const [showAdd, setShowAdd]   = useState(false);
  const [newAct,  setNewAct]    = useState({ activity_name: '', point_type: 'R', responsibility: '', applicable_spec: '', acceptance_criteria: '' });

  const handleAdd = () => {
    if (!newAct.activity_name.trim()) return toast.error('Activity name is required');
    onAddActivity(newAct);
    setNewAct({ activity_name: '', point_type: 'R', responsibility: '', applicable_spec: '', acceptance_criteria: '' });
    setShowAdd(false);
  };

  const activities = itp.activities || [];

  return (
    <div className="border-t border-slate-100 bg-slate-50 px-5 py-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
          Activities ({activities.length})
        </span>
        {itp.status !== 'superseded' && (
          <button onClick={() => setShowAdd(p => !p)}
            className="text-xs text-indigo-600 hover:text-indigo-800 flex items-center gap-1">
            <Plus className="w-3.5 h-3.5" /> Add Activity
          </button>
        )}
      </div>

      {activities.length === 0 && !showAdd && (
        <p className="text-xs text-slate-400 text-center py-3">No activities yet. Add inspection steps above.</p>
      )}

      {activities.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden mb-3">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr>
                <th className="text-left px-4 py-2 text-xs font-medium text-slate-500 w-10">Seq</th>
                <th className="text-left px-4 py-2 text-xs font-medium text-slate-500">Activity</th>
                <th className="text-left px-4 py-2 text-xs font-medium text-slate-500 w-16">Point</th>
                <th className="text-left px-4 py-2 text-xs font-medium text-slate-500 w-32">By</th>
                <th className="text-left px-4 py-2 text-xs font-medium text-slate-500">Spec / Criteria</th>
                {itp.status !== 'superseded' && <th className="w-10" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {activities.map(act => (
                <tr key={act.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-2.5 text-xs text-slate-400 font-mono">{act.sequence_no}</td>
                  <td className="px-4 py-2.5 text-sm text-black">{act.activity_name}</td>
                  <td className="px-4 py-2.5"><PointBadge type={act.point_type} /></td>
                  <td className="px-4 py-2.5 text-xs text-slate-500">{act.responsibility || '—'}</td>
                  <td className="px-4 py-2.5 text-xs text-slate-500 max-w-xs truncate">
                    {act.applicable_spec || act.acceptance_criteria || '—'}
                  </td>
                  {itp.status !== 'superseded' && (
                    <td className="px-2 py-2.5">
                      <button onClick={() => { if (window.confirm('Remove this activity?')) onDeleteActivity(act.id); }}
                        className="text-slate-300 hover:text-red-400 transition-colors">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add activity inline form */}
      {showAdd && (
        <div className="bg-white border border-indigo-200 rounded-xl p-4 space-y-3">
          <p className="text-xs font-semibold text-indigo-700">New Activity</p>
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="text-xs text-slate-500 mb-0.5 block">Activity Name *</label>
              <input value={newAct.activity_name}
                onChange={e => setNewAct(p => ({ ...p, activity_name: e.target.value }))}
                className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-indigo-400"
                placeholder="e.g. Check rebar spacing" />
            </div>
            <div>
              <label className="text-xs text-slate-500 mb-0.5 block">Point Type</label>
              <select value={newAct.point_type}
                onChange={e => setNewAct(p => ({ ...p, point_type: e.target.value }))}
                className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-indigo-400">
                {POINT_TYPES.map(pt => <option key={pt.value} value={pt.value}>{pt.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-500 mb-0.5 block">Responsibility</label>
              <input value={newAct.responsibility}
                onChange={e => setNewAct(p => ({ ...p, responsibility: e.target.value }))}
                className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-indigo-400"
                placeholder="Site Engineer" />
            </div>
            <div>
              <label className="text-xs text-slate-500 mb-0.5 block">Applicable Spec</label>
              <input value={newAct.applicable_spec}
                onChange={e => setNewAct(p => ({ ...p, applicable_spec: e.target.value }))}
                className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-indigo-400"
                placeholder="IS 456 Cl. 26.3" />
            </div>
            <div>
              <label className="text-xs text-slate-500 mb-0.5 block">Acceptance Criteria</label>
              <input value={newAct.acceptance_criteria}
                onChange={e => setNewAct(p => ({ ...p, acceptance_criteria: e.target.value }))}
                className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-indigo-400"
                placeholder="Cover ≥ 40mm" />
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={() => setShowAdd(false)}
              className="px-3 py-1.5 text-xs border border-slate-200 rounded-lg text-slate-500 hover:bg-slate-50">
              Cancel
            </button>
            <button type="button" onClick={handleAdd}
              className="px-3 py-1.5 text-xs bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">
              Add Activity
            </button>
          </div>
        </div>
      )}

      {itp.applicable_codes && (
        <p className="text-xs text-slate-400 mt-2">
          <span className="font-medium">Standards:</span> {itp.applicable_codes}
        </p>
      )}
    </div>
  );
}
