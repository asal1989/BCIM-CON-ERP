// src/pages/quality/PourCardPage.jsx
// Pour Card register + full workflow detail modal (pre-pour → pour → post-pour → cube certs)

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import {
  Layers, Plus, X, CheckCircle2, Clock, XCircle, AlertTriangle,
  Search, Edit2, Trash2, Save, Eye, Droplet, FlaskConical,
  ClipboardCheck, Play, PenLine, Lock, ShieldAlert
} from 'lucide-react';
import { qualityAPI, projectAPI } from '../../api/client';
import AttachmentPanel from '../../components/quality/AttachmentPanel';
import toast from 'react-hot-toast';
import dayjs from 'dayjs';
import { clsx } from 'clsx';

const POUR_TYPES = ['slab','column','beam','footing','wall','pile_cap','raft','staircase','other'];
const GRADES = ['M10','M15','M20','M25','M30','M35','M40','M45','M50'];

const STATUS_CFG = {
  pre_pour:      { label: 'Pre-Pour',      color: 'bg-slate-100 text-slate-600',     icon: ClipboardCheck },
  poured:        { label: 'Poured',        color: 'bg-blue-100 text-blue-700',       icon: Droplet },
  curing:        { label: 'Curing',        color: 'bg-cyan-100 text-cyan-700',       icon: Clock },
  certs_pending: { label: 'Certs Pending', color: 'bg-amber-100 text-amber-700',     icon: FlaskConical },
  closed:        { label: 'Closed',        color: 'bg-emerald-100 text-emerald-700', icon: CheckCircle2 },
  rejected:      { label: 'Rejected',      color: 'bg-red-100 text-red-700',         icon: XCircle },
};

function StatusBadge({ status }) {
  const cfg = STATUS_CFG[status] || STATUS_CFG.pre_pour;
  const Icon = cfg.icon;
  return (
    <span className={clsx('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium', cfg.color)}>
      <Icon className="w-3 h-3" />{cfg.label}
    </span>
  );
}

export default function PourCardPage() {
  const qc = useQueryClient();
  const [showForm,   setShowForm]   = useState(false);
  const [editPC,     setEditPC]     = useState(null);
  const [detailId,   setDetailId]   = useState(null);
  const [projectFilter, setProjectFilter] = useState('');
  const [statusFilter,  setStatusFilter]  = useState('');
  const [search, setSearch] = useState('');

  // ── queries ────────────────────────────────────────────────────────────────
  const { data: cards = [], isLoading } = useQuery({
    queryKey: ['quality-pour', projectFilter, statusFilter, search],
    queryFn: () => qualityAPI.listPourCards({
      project_id: projectFilter || undefined,
      status:     statusFilter  || undefined,
      search:     search        || undefined,
    }).then(r => r.data?.data ?? []),
  });

  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: () => projectAPI.list().then(r => { const d = r.data; return Array.isArray(d) ? d : d?.data ?? []; }),
  });

  const { data: checklists = [] } = useQuery({
    queryKey: ['quality-checklists'],
    queryFn: () => qualityAPI.listChecklists().then(r => r.data?.data ?? []),
  });

  // ── form ───────────────────────────────────────────────────────────────────
  const { register, handleSubmit, reset, formState: { errors } } = useForm();
  const openCreate = () => { reset({}); setEditPC(null); setShowForm(true); };
  const openEdit   = (pc) => {
    reset({
      project_id: pc.project_id, pour_description: pc.pour_description,
      pour_type: pc.pour_type, concrete_grade: pc.concrete_grade || '',
      location: pc.location || '', drawing_ref: pc.drawing_ref || '',
      planned_pour_date: pc.planned_pour_date?.slice(0,10) || '',
      volume_planned: pc.volume_planned || '', cube_sets_required: pc.cube_sets_required || 3,
      pre_pour_checklist_id: pc.pre_pour_checklist_id || '',
      post_pour_checklist_id: pc.post_pour_checklist_id || '',
      contractor_rep: pc.contractor_rep || '', remarks: pc.remarks || '',
    });
    setEditPC(pc); setShowForm(true);
  };

  // ── mutations ──────────────────────────────────────────────────────────────
  const saveMut = useMutation({
    mutationFn: (d) => editPC ? qualityAPI.updatePourCard(editPC.id, d) : qualityAPI.createPourCard(d),
    onSuccess: () => {
      toast.success(editPC ? 'Pour card updated' : 'Pour card created');
      qc.invalidateQueries({ queryKey: ['quality-pour'] });
      setShowForm(false);
    },
    onError: (e) => toast.error(e?.response?.data?.error || 'Save failed'),
  });

  const deleteMut = useMutation({
    mutationFn: (id) => qualityAPI.deletePourCard(id),
    onSuccess: () => { toast.success('Deleted'); qc.invalidateQueries({ queryKey: ['quality-pour'] }); },
    onError: (e) => toast.error(e?.response?.data?.error || 'Delete failed'),
  });

  // ── counts ─────────────────────────────────────────────────────────────────
  const counts = {
    total:        cards.length,
    active:       cards.filter(c => ['pre_pour','poured','curing','certs_pending'].includes(c.status)).length,
    certs_pending:cards.filter(c => c.status === 'certs_pending').length,
    closed:       cards.filter(c => c.status === 'closed').length,
    rejected:     cards.filter(c => c.status === 'rejected').length,
  };

  return (
    <div className="bg-[#f4f6f9] min-h-full p-6 space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-cyan-600 rounded-xl flex items-center justify-center">
            <Layers className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-slate-800">Pour Card Management</h1>
            <p className="text-xs text-slate-500">Pre/Post-Pour Checklists · Cube Tests · Auto-NCR on failure</p>
          </div>
        </div>
        <button onClick={openCreate}
          className="bg-cyan-600 hover:bg-cyan-700 text-white text-sm font-medium rounded-lg px-4 py-2 flex items-center gap-2 transition-colors">
          <Plus className="w-4 h-4" /> New Pour Card
        </button>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { label: 'Total',         value: counts.total,         color: 'text-slate-700' },
          { label: 'Active',        value: counts.active,        color: 'text-blue-600' },
          { label: 'Certs Pending', value: counts.certs_pending, color: 'text-amber-600' },
          { label: 'Closed',        value: counts.closed,        color: 'text-emerald-600' },
          { label: 'Rejected',      value: counts.rejected,      color: 'text-red-600' },
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
            placeholder="Search pour card, description, location…"
            className="w-full border border-slate-200 rounded-lg pl-9 pr-3 py-2 text-sm outline-none focus:border-cyan-400" />
        </div>
        <select value={projectFilter} onChange={e => setProjectFilter(e.target.value)}
          className="border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-cyan-400">
          <option value="">All Projects</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          className="border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-cyan-400">
          <option value="">All Status</option>
          {Object.entries(STATUS_CFG).map(([v, c]) => <option key={v} value={v}>{c.label}</option>)}
        </select>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="space-y-2">{[1,2,3].map(n => <div key={n} className="h-14 bg-slate-200 animate-pulse rounded-xl" />)}</div>
      ) : cards.length === 0 ? (
        <div className="py-20 text-center bg-white border-2 border-dashed border-slate-200 rounded-xl">
          <Layers className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="text-sm font-medium text-slate-500">No pour cards yet</p>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr>
                {['Pour Card #','Description','Type','Grade','Location','Planned Date','Cubes','Status','Actions'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-medium text-slate-500 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {cards.map(pc => (
                <tr key={pc.id} className="hover:bg-slate-50 transition-colors group">
                  <td className="px-4 py-3">
                    <span className="font-mono text-xs font-semibold text-cyan-700 bg-cyan-50 px-2 py-0.5 rounded">
                      {pc.pour_card_number}
                    </span>
                    {pc.ncr_number && (
                      <span className="ml-1 inline-flex items-center gap-0.5 text-[10px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full">
                        <ShieldAlert className="w-2.5 h-2.5" />{pc.ncr_number}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 font-medium text-slate-800 max-w-[200px]">
                    <span className="truncate block" title={pc.pour_description}>{pc.pour_description}</span>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500 capitalize">{pc.pour_type?.replace('_',' ')}</td>
                  <td className="px-4 py-3 text-xs font-semibold text-slate-700">{pc.concrete_grade || '—'}</td>
                  <td className="px-4 py-3 text-xs text-slate-500">{pc.location || '—'}</td>
                  <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">
                    {pc.planned_pour_date ? dayjs(pc.planned_pour_date).format('DD MMM YYYY') : '—'}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {pc.cube_test_count > 0 ? (
                      <span className={clsx('font-medium',
                        pc.cube_pass_count === pc.cube_test_count ? 'text-emerald-600' : 'text-amber-600')}>
                        {pc.cube_pass_count}/{pc.cube_test_count} pass
                      </span>
                    ) : <span className="text-slate-300">0</span>}
                  </td>
                  <td className="px-4 py-3"><StatusBadge status={pc.status} /></td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => setDetailId(pc.id)} title="Open workflow"
                        className="w-7 h-7 flex items-center justify-center rounded-lg border border-cyan-200 bg-cyan-50 text-cyan-600 hover:bg-cyan-100 transition-all">
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                      {pc.status === 'pre_pour' && (
                        <>
                          <button onClick={() => openEdit(pc)} title="Edit"
                            className="w-7 h-7 flex items-center justify-center rounded-lg border border-slate-200 text-slate-400 hover:text-indigo-600 hover:border-indigo-300 transition-all">
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => { if (window.confirm('Delete pour card?')) deleteMut.mutate(pc.id); }} title="Delete"
                            className="w-7 h-7 flex items-center justify-center rounded-lg border border-slate-200 text-slate-300 hover:text-red-500 hover:border-red-200 transition-all">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Detail workflow modal */}
      {detailId && (
        <PourCardDetail
          pourCardId={detailId}
          checklists={checklists}
          onClose={() => setDetailId(null)}
        />
      )}

      {/* Create / Edit modal */}
      {showForm && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-start justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl my-8">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h2 className="text-base font-semibold text-slate-900">
                {editPC ? `Edit — ${editPC.pour_card_number}` : 'New Pour Card'}
              </h2>
              <button onClick={() => setShowForm(false)}
                className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:text-slate-900">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSubmit(d => saveMut.mutate(d))} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-slate-700 mb-1">Project *</label>
                  <select {...register('project_id', { required: true })} disabled={!!editPC}
                    className={clsx('w-full border rounded-lg px-3 py-2 text-sm outline-none focus:border-cyan-400',
                      errors.project_id ? 'border-red-300' : 'border-slate-200')}>
                    <option value="">Select project…</option>
                    {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-slate-700 mb-1">Pour Description *</label>
                  <input {...register('pour_description', { required: true })}
                    className={clsx('w-full border rounded-lg px-3 py-2 text-sm outline-none focus:border-cyan-400',
                      errors.pour_description ? 'border-red-300' : 'border-slate-200')}
                    placeholder="e.g. Column C3 — Grid B/3 — Level 1" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Pour Type</label>
                  <select {...register('pour_type')}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-cyan-400 capitalize">
                    {POUR_TYPES.map(t => <option key={t} value={t}>{t.replace('_',' ')}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Concrete Grade</label>
                  <select {...register('concrete_grade')}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-cyan-400">
                    <option value="">Select…</option>
                    {GRADES.map(g => <option key={g} value={g}>{g}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Location</label>
                  <input {...register('location')}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-cyan-400"
                    placeholder="Block / Level / Grid" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Drawing Ref</label>
                  <input {...register('drawing_ref')}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-cyan-400"
                    placeholder="Drawing number" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Planned Pour Date</label>
                  <input type="date" {...register('planned_pour_date')}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-cyan-400" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Planned Volume (m³)</label>
                  <input type="number" step="any" {...register('volume_planned')}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-cyan-400"
                    placeholder="0" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Cube Sets Required</label>
                  <input type="number" {...register('cube_sets_required')} defaultValue={3}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-cyan-400" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Pre-Pour Checklist</label>
                  <select {...register('pre_pour_checklist_id')}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-cyan-400">
                    <option value="">None</option>
                    {checklists.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Post-Pour Checklist</label>
                  <select {...register('post_pour_checklist_id')}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-cyan-400">
                    <option value="">None</option>
                    {checklists.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Contractor Rep</label>
                  <input {...register('contractor_rep')}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-cyan-400"
                    placeholder="Name" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Remarks</label>
                <textarea {...register('remarks')} rows={2}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-cyan-400 resize-none" />
              </div>
              <div className="flex gap-3 pt-2 border-t border-slate-100">
                <button type="button" onClick={() => setShowForm(false)}
                  className="flex-1 border border-slate-200 text-slate-600 text-sm font-medium rounded-lg py-2 hover:bg-slate-50">
                  Cancel
                </button>
                <button type="submit" disabled={saveMut.isPending}
                  className="flex-[2] bg-cyan-600 hover:bg-cyan-700 text-white text-sm font-medium rounded-lg py-2 disabled:opacity-60 flex items-center justify-center gap-2">
                  <Save className="w-4 h-4" />
                  {saveMut.isPending ? 'Saving…' : editPC ? 'Update' : 'Create Pour Card'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Pour Card Detail — workflow stepper
// ═══════════════════════════════════════════════════════════════
function PourCardDetail({ pourCardId, checklists, onClose }) {
  const qc = useQueryClient();
  const [prePourResp, setPrePourResp]   = useState({});
  const [postPourResp, setPostPourResp] = useState({});

  const { data: pc, isLoading } = useQuery({
    queryKey: ['quality-pour-detail', pourCardId],
    queryFn: () => qualityAPI.getPourCard(pourCardId).then(r => r.data?.data),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['quality-pour'] });
    qc.invalidateQueries({ queryKey: ['quality-pour-detail', pourCardId] });
  };

  const prePourMut = useMutation({
    mutationFn: (decision) => qualityAPI.prePourApprove(pourCardId, { decision, pre_pour_responses: prePourResp }),
    onSuccess: () => { toast.success('Pre-pour saved'); invalidate(); },
    onError: (e) => toast.error(e?.response?.data?.error || 'Failed'),
  });
  const startMut = useMutation({
    mutationFn: () => qualityAPI.startPour(pourCardId, {}),
    onSuccess: () => { toast.success('Pour started'); invalidate(); },
    onError: (e) => toast.error(e?.response?.data?.error || 'Failed'),
  });
  const postPourMut = useMutation({
    mutationFn: () => qualityAPI.postPourSign(pourCardId, { post_pour_responses: postPourResp }),
    onSuccess: () => { toast.success('Post-pour signed'); invalidate(); },
    onError: (e) => toast.error(e?.response?.data?.error || 'Failed'),
  });
  const attachMut = useMutation({
    mutationFn: (atts) => qualityAPI.updatePourAttachments(pourCardId, atts),
    onSuccess: invalidate,
  });

  const preItems  = pc?.pre_pour_checklist_items || [];
  const postItems = pc?.post_pour_checklist_items || [];

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden">
        {/* header */}
        <div className="flex items-center justify-between px-6 py-4 bg-cyan-600 shrink-0">
          <div>
            <p className="text-base font-semibold text-white">{pc?.pour_card_number || 'Loading…'}</p>
            <p className="text-xs text-cyan-100 mt-0.5">{pc?.pour_description}</p>
          </div>
          <button onClick={onClose} className="text-cyan-100 hover:text-white"><X className="w-5 h-5" /></button>
        </div>

        <div className="overflow-y-auto p-6 space-y-5">
          {isLoading || !pc ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-6 h-6 border-2 border-cyan-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <>
              {/* status + info */}
              <div className="flex items-center gap-3 flex-wrap">
                <StatusBadge status={pc.status} />
                <span className="text-xs text-slate-500">{pc.concrete_grade} · {pc.pour_type?.replace('_',' ')} · {pc.location}</span>
                {pc.ncr_number && (
                  <span className="inline-flex items-center gap-1 text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full">
                    <ShieldAlert className="w-3 h-3" /> {pc.ncr_number}
                  </span>
                )}
              </div>

              {/* Workflow stepper */}
              <div className="flex items-center gap-1 text-[11px]">
                {[
                  { key: 'pre_pour', label: 'Pre-Pour', done: pc.pre_pour_status === 'approved' },
                  { key: 'poured', label: 'Poured', done: ['poured','curing','certs_pending','closed'].includes(pc.status) },
                  { key: 'post_pour', label: 'Post-Pour', done: pc.post_pour_status === 'completed' },
                  { key: 'certs', label: 'Certs', done: pc.all_certs_verified },
                  { key: 'closed', label: 'Closed', done: pc.status === 'closed' },
                ].map((s, i) => (
                  <React.Fragment key={s.key}>
                    {i > 0 && <div className={clsx('h-0.5 flex-1', s.done ? 'bg-emerald-400' : 'bg-slate-200')} />}
                    <div className={clsx('flex items-center gap-1 px-2 py-1 rounded-full',
                      s.done ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-400')}>
                      {s.done ? <CheckCircle2 className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                      {s.label}
                    </div>
                  </React.Fragment>
                ))}
              </div>

              {/* ── STAGE 1: Pre-Pour ────────────────────────────── */}
              <div className="border border-slate-200 rounded-xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                    <ClipboardCheck className="w-4 h-4 text-cyan-600" /> Pre-Pour Checklist
                  </p>
                  {pc.pre_pour_status === 'approved' && (
                    <span className="text-xs text-emerald-600">✓ Approved by {pc.pre_pour_approved_by_name}</span>
                  )}
                </div>
                {pc.status === 'pre_pour' ? (
                  <>
                    {preItems.length > 0 ? (
                      <div className="space-y-1.5 mb-3">
                        {preItems.map((item, idx) => {
                          const key = item.id || `item_${idx}`;
                          const txt = typeof item === 'string' ? item : (item.text || item.label || item.name);
                          return (
                            <label key={key} className="flex items-center gap-2 text-sm text-slate-600">
                              <input type="checkbox"
                                checked={!!prePourResp[key]?.ok}
                                onChange={e => setPrePourResp(p => ({ ...p, [key]: { ok: e.target.checked, text: txt } }))}
                                className="w-4 h-4 text-cyan-600 rounded" />
                              {txt}
                            </label>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-xs text-slate-400 mb-3">No checklist assigned (link one in edit). You can still approve.</p>
                    )}
                    <div className="flex gap-2">
                      <button onClick={() => prePourMut.mutate('approved')} disabled={prePourMut.isPending}
                        className="flex items-center gap-1 px-3 py-1.5 bg-emerald-600 text-white text-xs rounded-lg hover:bg-emerald-700 disabled:opacity-60">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Approve Pre-Pour
                      </button>
                      <button onClick={() => prePourMut.mutate('rejected')} disabled={prePourMut.isPending}
                        className="flex items-center gap-1 px-3 py-1.5 border border-red-200 bg-red-50 text-red-600 text-xs rounded-lg hover:bg-red-100">
                        <XCircle className="w-3.5 h-3.5" /> Reject
                      </button>
                    </div>
                  </>
                ) : (
                  <p className="text-xs text-slate-500">
                    {pc.pre_pour_status === 'approved' ? 'Pre-pour approved.' : `Status: ${pc.pre_pour_status}`}
                  </p>
                )}
              </div>

              {/* ── STAGE 2: Start Pour ──────────────────────────── */}
              {pc.pre_pour_status === 'approved' && pc.status === 'pre_pour' && (
                <div className="border border-blue-200 bg-blue-50 rounded-xl p-4 flex items-center justify-between">
                  <p className="text-sm font-medium text-blue-700 flex items-center gap-2">
                    <Droplet className="w-4 h-4" /> Ready to pour — pre-pour approved
                  </p>
                  <button onClick={() => startMut.mutate()} disabled={startMut.isPending}
                    className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white text-xs rounded-lg hover:bg-blue-700 disabled:opacity-60">
                    <Play className="w-3.5 h-3.5" /> Start Pour
                  </button>
                </div>
              )}

              {/* ── STAGE 3: Post-Pour ───────────────────────────── */}
              {pc.status === 'poured' && (
                <div className="border border-slate-200 rounded-xl p-4">
                  <p className="text-sm font-semibold text-slate-700 flex items-center gap-2 mb-2">
                    <PenLine className="w-4 h-4 text-cyan-600" /> Post-Pour Sign-off
                  </p>
                  {postItems.length > 0 && (
                    <div className="space-y-1.5 mb-3">
                      {postItems.map((item, idx) => {
                        const key = item.id || `item_${idx}`;
                        const txt = typeof item === 'string' ? item : (item.text || item.label || item.name);
                        return (
                          <label key={key} className="flex items-center gap-2 text-sm text-slate-600">
                            <input type="checkbox"
                              checked={!!postPourResp[key]?.ok}
                              onChange={e => setPostPourResp(p => ({ ...p, [key]: { ok: e.target.checked, text: txt } }))}
                              className="w-4 h-4 text-cyan-600 rounded" />
                            {txt}
                          </label>
                        );
                      })}
                    </div>
                  )}
                  <button onClick={() => postPourMut.mutate()} disabled={postPourMut.isPending}
                    className="flex items-center gap-1 px-3 py-1.5 bg-cyan-600 text-white text-xs rounded-lg hover:bg-cyan-700 disabled:opacity-60">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Sign Post-Pour & Move to Curing
                  </button>
                </div>
              )}

              {/* ── STAGE 4: Cube tests ──────────────────────────── */}
              <div className="border border-slate-200 rounded-xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                    <FlaskConical className="w-4 h-4 text-cyan-600" /> Cube Test Certificates
                    <span className="text-xs font-normal text-slate-400">
                      ({pc.cube_tests?.length || 0} / {pc.cube_sets_required} sets)
                    </span>
                  </p>
                </div>
                {pc.cube_tests?.length > 0 ? (
                  <div className="space-y-1.5">
                    {pc.cube_tests.map(ct => (
                      <div key={ct.id} className="flex items-center gap-3 bg-slate-50 rounded-lg px-3 py-2 text-xs">
                        <span className="font-mono text-indigo-700">{ct.test_number}</span>
                        <span className="text-slate-600">
                          {ct.test_age_days ? `${ct.test_age_days}d` : ''}
                          {ct.result_28day != null ? ` · 28d: ${ct.result_28day} MPa` : ''}
                          {ct.result_7day != null ? ` · 7d: ${ct.result_7day} MPa` : ''}
                        </span>
                        <span className={clsx('ml-auto font-medium px-1.5 py-0.5 rounded-full text-[10px]',
                          ct.is_failed ? 'bg-red-100 text-red-700' :
                          ct.result_status === 'pass' ? 'bg-emerald-100 text-emerald-700' :
                          'bg-amber-100 text-amber-700')}>
                          {ct.is_failed ? 'FAILED' : (ct.result_status || 'pending')}
                        </span>
                        {ct.ncr_number && (
                          <span className="inline-flex items-center gap-0.5 text-[10px] text-red-600">
                            <ShieldAlert className="w-2.5 h-2.5" />{ct.ncr_number}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-slate-400">
                    No cube tests linked yet. Create lab tests in the Lab Certifications module and link them to this pour card
                    (set <span className="font-mono">pour_card_id</span>). Pour stays open until all 28-day results pass.
                  </p>
                )}
                {pc.status === 'certs_pending' && (
                  <div className="mt-3 flex items-center gap-2 text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2">
                    <Lock className="w-3.5 h-3.5" />
                    Pour card stays in "Certs Pending" until all cube tests pass. A failed 28-day result auto-creates an NCR and rejects the pour.
                  </div>
                )}
                {pc.status === 'closed' && (
                  <div className="mt-3 flex items-center gap-2 text-xs text-emerald-600 bg-emerald-50 rounded-lg px-3 py-2">
                    <CheckCircle2 className="w-3.5 h-3.5" /> All certificates verified — pour card closed.
                  </div>
                )}
              </div>

              {/* attachments */}
              <AttachmentPanel
                attachments={pc.attachments || []}
                onUpdate={(atts) => attachMut.mutate(atts)}
                label="Pour Card Documents & Photos"
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
