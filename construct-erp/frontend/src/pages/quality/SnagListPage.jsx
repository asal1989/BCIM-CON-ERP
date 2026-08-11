// src/pages/quality/SnagListPage.jsx
import RecordAttachments from '../../components/shared/RecordAttachments';
import React, { useState, useMemo, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Hammer, Plus, X, Save, ChevronRight, Camera,
  AlertTriangle, CheckCircle2, Clock, Wrench, Image,
  Trash2, Search, Edit2,
} from 'lucide-react';
import api, { snagAPI, projectAPI } from '../../api/client';
import useAuthStore from '../../store/authStore';
import toast from 'react-hot-toast';
import { clsx } from 'clsx';
import dayjs from 'dayjs';

// ── Role constants ───────────────────────────────────────────────────────────
const EDITORS  = ['project_manager', 'site_engineer', 'admin', 'super_admin'];
const MANAGERS = ['project_manager', 'admin', 'super_admin'];
const ADMINS   = ['admin', 'super_admin'];

// ── Config ───────────────────────────────────────────────────────────────────
const TRADE_OPTIONS = [
  { value: 'civil',       label: 'Civil' },
  { value: 'structural',  label: 'Structural' },
  { value: 'electrical',  label: 'Electrical' },
  { value: 'plumbing',    label: 'Plumbing' },
  { value: 'finishing',   label: 'Finishing' },
  { value: 'mechanical',  label: 'Mechanical' },
  { value: 'other',       label: 'Other' },
];

const PRIORITY_CFG = {
  critical: { label: 'Critical', border: 'border-l-red-500',    badge: 'bg-red-50 text-red-700',    dot: 'bg-red-500' },
  high:     { label: 'High',     border: 'border-l-orange-500', badge: 'bg-orange-50 text-orange-700', dot: 'bg-orange-500' },
  medium:   { label: 'Medium',   border: 'border-l-amber-400',  badge: 'bg-amber-50 text-amber-700',  dot: 'bg-amber-400' },
  low:      { label: 'Low',      border: 'border-l-slate-300',  badge: 'bg-slate-100 text-slate-500', dot: 'bg-slate-400' },
};

const STATUS_CFG = {
  open:        { label: 'Open',        color: 'bg-red-50 text-red-700 border-red-200' },
  in_progress: { label: 'In Progress', color: 'bg-blue-50 text-blue-700 border-blue-200' },
  rectified:   { label: 'Rectified',   color: 'bg-amber-50 text-amber-700 border-amber-200' },
  closed:      { label: 'Closed',      color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
};

const STATUS_TABS = ['all', 'open', 'in_progress', 'rectified', 'closed'];

// ── Main page ─────────────────────────────────────────────────────────────────
export default function SnagListPage() {
  const qc = useQueryClient();
  const { user } = useAuthStore();
  const canEdit   = EDITORS.includes(user?.role);

  const [projectId, setProjectId]   = useState('');
  const [statusTab, setStatusTab]   = useState('all');
  const [filterTrade, setFilterTrade] = useState('');
  const [filterPriority, setFilterPriority] = useState('');
  const [search, setSearch]         = useState('');
  const [selected, setSelected]     = useState(null);   // snag shown in slide-over
  const [showAdd, setShowAdd]       = useState(false);
  const [editSnag, setEditSnag]     = useState(null);   // snag to edit

  // ── Queries ──────────────────────────────────────────────────────────────
  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: () => projectAPI.list().then(r => { const d = r?.data; return Array.isArray(d) ? d : (Array.isArray(d?.data) ? d.data : (Array.isArray(r) ? r : [])) }).catch(() => []),
  });

  const { data: snags = [], isLoading } = useQuery({
    queryKey: ['snags', projectId],
    queryFn: () => snagAPI.list({ project_id: projectId }).then(r => r.data?.data ?? r.data ?? []).catch(() => []),
    enabled: !!projectId,
  });

  const { data: stats = {} } = useQuery({
    queryKey: ['snags-stats', projectId],
    queryFn: () => snagAPI.getStats({ project_id: projectId }).then(r => r.data?.data ?? r.data ?? []).catch(() => []),
    enabled: !!projectId,
  });

  // ── Filters ──────────────────────────────────────────────────────────────
  const filtered = useMemo(() => snags.filter(s => {
    if (statusTab !== 'all' && s.status !== statusTab) return false;
    if (filterTrade && s.trade !== filterTrade) return false;
    if (filterPriority && s.priority !== filterPriority) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!s.title?.toLowerCase().includes(q) &&
          !s.snag_code?.toLowerCase().includes(q) &&
          !s.zone?.toLowerCase().includes(q)) return false;
    }
    return true;
  }), [snags, statusTab, filterTrade, filterPriority, search]);

  const refreshAll = () => {
    qc.invalidateQueries({ queryKey: ['snags', projectId] });
    qc.invalidateQueries({ queryKey: ['snags-stats', projectId] });
  };

  // Sync selected panel when snags refresh
  const selectedSnag = selected ? snags.find(s => s.id === selected.id) || selected : null;

  return (
    <div className="p-6 space-y-5 bg-[#f4f6f9] min-h-full">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-indigo-600 rounded-xl flex items-center justify-center">
            <Hammer className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-medium text-black">Snag & Punch List</h1>
            <p className="text-xs text-slate-500">Raise, assign and track defect rectification to sign-off</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={projectId}
            onChange={e => { setProjectId(e.target.value); setSelected(null); }}
            className="bg-white border border-[#e2e6ec] rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-400 w-64"
          >
            <option value="">— Select project —</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          {projectId && canEdit && (
            <button
              onClick={() => { setEditSnag(null); setShowAdd(true); }}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors"
            >
              <Plus className="w-4 h-4" /> Raise Snag
            </button>
          )}
        </div>
      </div>

      {!projectId ? (
        <div className="bg-white border border-[#e2e6ec] rounded-xl p-16 text-center">
          <Hammer className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-900 font-medium font-medium">Select a project to manage its snag list</p>
        </div>
      ) : (
        <>
          {/* ── KPI cards ────────────────────────────────────────────── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: 'Open',        value: stats?.open        ?? 0, icon: AlertTriangle, color: 'text-red-600',     bg: 'bg-red-50' },
              { label: 'In Progress', value: stats?.in_progress ?? 0, icon: Wrench,        color: 'text-blue-600',    bg: 'bg-blue-50' },
              { label: 'Rectified',   value: stats?.rectified   ?? 0, icon: Clock,         color: 'text-amber-600',   bg: 'bg-amber-50' },
              { label: 'Closed',      value: stats?.closed      ?? 0, icon: CheckCircle2,  color: 'text-emerald-600', bg: 'bg-emerald-50' },
            ].map(({ label, value, icon: Icon, color, bg }) => (
              <div key={label} className="bg-white border border-[#e2e6ec] rounded-xl p-5 flex items-center gap-4">
                <div className={clsx('w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0', bg)}>
                  <Icon className={clsx('w-5 h-5', color)} />
                </div>
                <div>
                  <div className="text-2xl font-medium text-slate-900 font-medium leading-none">{value}</div>
                  <div className="text-xs text-slate-900 font-medium mt-1">{label}</div>
                </div>
              </div>
            ))}
          </div>

          {/* ── Filters ──────────────────────────────────────────────── */}
          <div className="bg-white border border-[#e2e6ec] rounded-xl p-4">
            <div className="flex flex-wrap items-center gap-3">
              {/* Status tabs */}
              <div className="flex gap-1">
                {STATUS_TABS.map(t => (
                  <button
                    key={t}
                    onClick={() => setStatusTab(t)}
                    className={clsx(
                      'px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors',
                      statusTab === t
                        ? 'bg-indigo-600 text-white'
                        : 'bg-slate-100 text-slate-900 hover:bg-slate-200'
                    )}
                  >
                    {t === 'all' ? 'All' : t.replace('_', ' ')}
                    {t !== 'all' && stats?.[t] > 0 && (
                      <span className="ml-1.5 bg-white/30 rounded px-1">{stats[t]}</span>
                    )}
                  </button>
                ))}
              </div>

              <div className="h-5 w-px bg-slate-200" />

              {/* Trade filter */}
              <select
                value={filterTrade}
                onChange={e => setFilterTrade(e.target.value)}
                className="bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs outline-none focus:border-indigo-400"
              >
                <option value="">All Trades</option>
                {TRADE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>

              {/* Priority filter */}
              <select
                value={filterPriority}
                onChange={e => setFilterPriority(e.target.value)}
                className="bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs outline-none focus:border-indigo-400"
              >
                <option value="">All Priorities</option>
                {Object.entries(PRIORITY_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>

              {/* Search */}
              <div className="relative ml-auto">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                <input
                  className="pl-8 pr-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs outline-none focus:border-indigo-400 w-48"
                  placeholder="Search title, code, zone…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
              </div>

              <span className="text-xs text-slate-400">{filtered.length} items</span>
            </div>
          </div>

          {/* ── Snag cards grid ───────────────────────────────────────── */}
          {isLoading ? (
            <div className="py-16 text-center text-sm text-slate-400">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="bg-white border border-[#e2e6ec] rounded-xl p-14 text-center">
              <Hammer className="w-8 h-8 text-slate-200 mx-auto mb-2" />
              <p className="text-sm text-slate-400">No snags found</p>
              {canEdit && (
                <button onClick={() => { setEditSnag(null); setShowAdd(true); }} className="mt-3 text-xs text-indigo-600 hover:underline">
                  + Raise the first snag
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filtered.map(s => <SnagCard key={s.id} snag={s} onClick={() => setSelected(s)} />)}
            </div>
          )}
        </>
      )}

      {/* ── Slide-over detail panel ──────────────────────────────────────── */}
      {selectedSnag && (
        <SnagDetailPanel
          snag={selectedSnag}
          canEdit={canEdit}
          canManage={MANAGERS.includes(user?.role)}
          canDelete={ADMINS.includes(user?.role)}
          projectId={projectId}
          onClose={() => setSelected(null)}
          onEdit={() => { setEditSnag(selectedSnag); setShowAdd(true); }}
          onRefresh={refreshAll}
        />
      )}

      {/* ── Add / Edit modal ─────────────────────────────────────────────── */}
      {showAdd && (
        <SnagFormModal
          projectId={projectId}
          snag={editSnag}
          onClose={() => { setShowAdd(false); setEditSnag(null); }}
          onSuccess={(saved) => {
            refreshAll();
            setShowAdd(false);
            setEditSnag(null);
            setSelected(saved);
          }}
        />
      )}
    </div>
  );
}

// ── Snag Card ─────────────────────────────────────────────────────────────────
function SnagCard({ snag, onClick }) {
  const pri  = PRIORITY_CFG[snag.priority] || PRIORITY_CFG.medium;
  const stat = STATUS_CFG[snag.status]     || STATUS_CFG.open;
  const overdue = snag.due_date && !['closed'].includes(snag.status) && dayjs(snag.due_date).isBefore(dayjs());
  const photos = Array.isArray(snag.photos) ? snag.photos : [];

  return (
    <div
      onClick={onClick}
      className={clsx(
        'bg-white border border-[#e2e6ec] rounded-xl hover:shadow-sm transition-all cursor-pointer border-l-4 group',
        pri.border
      )}
    >
      <div className="p-4">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <span className="text-[10px] font-medium text-slate-900 font-medium uppercase tracking-wider">{snag.snag_code}</span>
              <span className={clsx('text-[10px] px-1.5 py-0.5 rounded font-semibold', pri.badge)}>{pri.label}</span>
            </div>
            <h3 className="text-sm font-medium text-slate-900 font-medium truncate">{snag.title}</h3>
            {snag.zone && <p className="text-xs text-slate-900 font-medium mt-0.5 truncate">{snag.zone}</p>}
          </div>
          <span className={clsx('text-[10px] px-2 py-1 rounded-md border font-medium whitespace-nowrap flex-shrink-0', stat.color)}>
            {stat.label}
          </span>
        </div>

        <div className="flex items-center justify-between gap-2 mt-3">
          <div className="flex items-center gap-3">
            {/* Trade badge */}
            <span className="text-[10px] bg-slate-100 text-slate-900 px-2 py-0.5 rounded capitalize">
              {snag.trade}
            </span>
            {/* Photo count */}
            {photos.length > 0 && (
              <span className="flex items-center gap-0.5 text-[10px] text-slate-400">
                <Image className="w-3 h-3" /> {photos.length}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {snag.assigned_to_name && (
              <span className="text-[10px] text-slate-900 font-medium truncate max-w-[120px]">{snag.assigned_to_name}</span>
            )}
            {snag.due_date && (
              <span className={clsx('text-[10px] font-medium', overdue ? 'text-red-600' : 'text-slate-400')}>
                {overdue ? '⚠ ' : ''}{dayjs(snag.due_date).format('DD MMM')}
              </span>
            )}
            <ChevronRight className="w-3.5 h-3.5 text-slate-900 font-medium opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Snag Detail Panel (slide-over) ────────────────────────────────────────────
function SnagDetailPanel({ snag, canEdit, canManage, canDelete, projectId, onClose, onEdit, onRefresh }) {
  const qc = useQueryClient();
  const [rectNotes, setRectNotes] = useState(snag.rectification_notes || '');
  const [qaRemarks, setQaRemarks] = useState('');
  const [showQaInput, setShowQaInput] = useState(false);
  const fileRef = useRef(null);
  const [uploading, setUploading] = useState(false);

  const photos = Array.isArray(snag.photos) ? snag.photos : [];
  const pri    = PRIORITY_CFG[snag.priority] || PRIORITY_CFG.medium;
  const stat   = STATUS_CFG[snag.status]     || STATUS_CFG.open;

  const statusMut = useMutation({
    mutationFn: ({ status, notes }) => snagAPI.setStatus(snag.id, { status, rectification_notes: notes }),
    onSuccess: () => { toast.success('Status updated'); onRefresh(); },
    onError:   e  => toast.error(e?.response?.data?.error || 'Update failed'),
  });

  const qaMut = useMutation({
    mutationFn: () => snagAPI.qaSignOff(snag.id, { qa_remarks: qaRemarks }),
    onSuccess: () => { toast.success('Snag signed off & closed'); setShowQaInput(false); onRefresh(); },
    onError:   e  => toast.error(e?.response?.data?.error || 'Sign-off failed'),
  });

  const deleteMut = useMutation({
    mutationFn: () => snagAPI.remove(snag.id),
    onSuccess: () => { toast.success('Snag deleted'); onRefresh(); onClose(); },
    onError:   e  => toast.error(e?.response?.data?.error || 'Delete failed'),
  });

  const handlePhotoUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const { data: upData } = await api.post('/upload/single', fd, {
        headers: { 'Content-Type': undefined },
      });
      if (!upData.url) throw new Error('Upload failed');
      const updated = [...photos, upData.url];
      await snagAPI.update(snag.id, { photos: updated });
      toast.success('Photo added');
      onRefresh();
    } catch (err) {
      toast.error(err?.response?.data?.error || err.message || 'Upload failed');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const removePhoto = async (url) => {
    const updated = photos.filter(p => p !== url);
    await snagAPI.update(snag.id, { photos: updated });
    toast.success('Photo removed');
    onRefresh();
  };

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div className="flex-1 bg-black/30" onClick={onClose} />

      {/* Panel */}
      <div className="w-full max-w-lg bg-white shadow-2xl overflow-y-auto flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 sticky top-0 bg-white z-10">
          <div>
            <div className="text-[10px] font-medium text-slate-900 font-medium uppercase">{snag.snag_code}</div>
            <h2 className="text-sm font-medium text-slate-900 font-medium mt-0.5">{snag.title}</h2>
          </div>
          <div className="flex items-center gap-2">
            {canEdit && (
              <button onClick={onEdit} className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors" title="Edit">
                <Edit2 className="w-4 h-4 text-slate-500" />
              </button>
            )}
            {canDelete && (
              <button
                onClick={() => { if (window.confirm('Delete this snag?')) deleteMut.mutate(); }}
                className="p-1.5 hover:bg-red-50 rounded-lg transition-colors"
                title="Delete"
              >
                <Trash2 className="w-4 h-4 text-red-400" />
              </button>
            )}
            <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors">
              <X className="w-4 h-4 text-slate-500" />
            </button>
          </div>
        </div>

        <div className="p-5 space-y-5 flex-1">
          {/* Status + Priority */}
          <div className="flex items-center gap-2">
            <span className={clsx('text-xs px-2.5 py-1 rounded-md border font-semibold', stat.color)}>{stat.label}</span>
            <span className={clsx('text-xs px-2.5 py-1 rounded-md font-semibold', pri.badge)}>{pri.label} Priority</span>
            {snag.trade && <span className="text-xs bg-slate-100 text-slate-900 px-2.5 py-1 rounded-md capitalize">{snag.trade}</span>}
          </div>

          {/* Info grid */}
          <div className="grid grid-cols-2 gap-3">
            <InfoRow label="Zone / Location" value={snag.zone} />
            <InfoRow label="Assigned To" value={snag.assigned_to_name || snag.assigned_user_name} />
            <InfoRow label="Due Date" value={snag.due_date ? dayjs(snag.due_date).format('DD MMM YYYY') : null} />
            <InfoRow label="Raised By" value={snag.raised_by_name} />
            <InfoRow label="Raised On" value={snag.created_at ? dayjs(snag.created_at).format('DD MMM YYYY') : null} />
            {snag.qa_signed_off_by_name && (
              <InfoRow label="QA Sign-off" value={`${snag.qa_signed_off_by_name} · ${dayjs(snag.qa_signed_off_at).format('DD MMM YYYY')}`} />
            )}
          </div>

          {/* Description */}
          {snag.description && (
            <div>
              <div className="text-[10px] font-medium text-slate-900 font-medium uppercase tracking-wide mb-1">Description</div>
              <p className="text-xs text-slate-900 leading-relaxed">{snag.description}</p>
            </div>
          )}

          {/* Photos */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="text-[10px] font-medium text-slate-900 font-medium uppercase tracking-wide">
                Photos {photos.length > 0 && <span className="text-slate-400">({photos.length})</span>}
              </div>
              {canEdit && (
                <>
                  <button
                    onClick={() => fileRef.current?.click()}
                    disabled={uploading}
                    className="text-xs text-indigo-600 hover:underline flex items-center gap-1 disabled:opacity-50"
                  >
                    <Camera className="w-3 h-3" /> {uploading ? 'Uploading…' : 'Add Photo'}
                  </button>
                  <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} />
                </>
              )}
            </div>
            {photos.length === 0 ? (
              <p className="text-xs text-slate-900 font-medium italic">No photos attached</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {photos.map((url, i) => (
                  <div key={i} className="relative group">
                    <a href={url} target="_blank" rel="noopener noreferrer">
                      <img src={url} alt={`snag-${i}`} className="w-20 h-20 object-cover rounded-lg border border-slate-200" />
                    </a>
                    {canEdit && (
                      <button
                        onClick={() => removePhoto(url)}
                        className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-red-500 text-white rounded-full hidden group-hover:flex items-center justify-center"
                      >
                        <X className="w-2.5 h-2.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Rectification notes (editable when in progress/rectified) */}
          {(snag.status === 'in_progress' || snag.status === 'rectified') && canEdit && (
            <div>
              <label className="text-[10px] font-medium text-slate-900 font-medium uppercase tracking-wide block mb-1">Rectification Notes</label>
              <textarea
                className="w-full border border-slate-200 rounded-lg p-2.5 text-xs text-slate-900 outline-none focus:border-indigo-400 resize-none"
                rows={3}
                placeholder="Describe the rectification work done…"
                value={rectNotes}
                onChange={e => setRectNotes(e.target.value)}
              />
            </div>
          )}
          {snag.rectification_notes && !['in_progress', 'rectified'].includes(snag.status) && (
            <div>
              <div className="text-[10px] font-medium text-slate-900 font-medium uppercase tracking-wide mb-1">Rectification Notes</div>
              <p className="text-xs text-slate-900 leading-relaxed">{snag.rectification_notes}</p>
            </div>
          )}
          {snag.qa_remarks && (
            <div>
              <div className="text-[10px] font-medium text-slate-900 font-medium uppercase tracking-wide mb-1">QA Remarks</div>
              <p className="text-xs text-slate-900 leading-relaxed">{snag.qa_remarks}</p>
            </div>
          )}

          {/* QA sign-off input */}
          {showQaInput && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 space-y-2">
              <p className="text-xs font-medium text-emerald-800">QA Sign-off Remarks</p>
              <textarea
                className="w-full border border-emerald-200 rounded-lg p-2 text-xs outline-none focus:border-emerald-400 resize-none"
                rows={3}
                placeholder="QA observations before closing…"
                value={qaRemarks}
                onChange={e => setQaRemarks(e.target.value)}
              />
              <div className="flex gap-2">
                <button onClick={() => setShowQaInput(false)} className="text-xs text-slate-900 font-medium hover:underline">Cancel</button>
                <button
                  onClick={() => qaMut.mutate()}
                  disabled={qaMut.isPending}
                  className="px-3 py-1.5 bg-emerald-600 text-white text-xs font-medium rounded-lg hover:bg-emerald-700 disabled:opacity-50"
                >
                  {qaMut.isPending ? 'Signing off…' : 'Confirm Sign-off'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* File Attachments */}
        <div className="px-5 py-3 border-t border-[#e2e6ec]">
          <RecordAttachments
            module="snag"
            recordId={snag.id}
            projectId={projectId}
            label="Snag Attachments — Site Reports, Drawings, Photos"
            compact
          />
        </div>

        {/* Action buttons — sticky footer */}
        {snag.status !== 'closed' && (canEdit || canManage) && (
          <div className="px-5 py-4 border-t border-[#e2e6ec] sticky bottom-0 bg-white space-y-2">
            {snag.status === 'open' && canEdit && (
              <button
                onClick={() => statusMut.mutate({ status: 'in_progress' })}
                disabled={statusMut.isPending}
                className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg disabled:opacity-50 transition-colors"
              >
                Mark In Progress
              </button>
            )}
            {snag.status === 'in_progress' && canEdit && (
              <button
                onClick={() => {
                  if (!rectNotes.trim()) return toast.error('Add rectification notes before marking as rectified');
                  statusMut.mutate({ status: 'rectified', notes: rectNotes });
                }}
                disabled={statusMut.isPending}
                className="w-full py-2.5 bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium rounded-lg disabled:opacity-50 transition-colors"
              >
                Mark Rectified
              </button>
            )}
            {snag.status === 'rectified' && canManage && !showQaInput && (
              <button
                onClick={() => setShowQaInput(true)}
                className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg transition-colors"
              >
                QA Sign Off & Close
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Info row ──────────────────────────────────────────────────────────────────
function InfoRow({ label, value }) {
  return (
    <div>
      <div className="text-[10px] font-medium text-slate-900 font-medium uppercase tracking-wide mb-0.5">{label}</div>
      <div className="text-xs text-slate-900 font-medium">{value || <span className="text-slate-300 font-normal">—</span>}</div>
    </div>
  );
}

// ── Add / Edit Snag Modal ─────────────────────────────────────────────────────
function SnagFormModal({ projectId, snag, onClose, onSuccess }) {
  const isEdit = !!snag;
  const fileRef = useRef(null);
  const [uploading, setUploading] = useState(false);

  const [form, setForm] = useState({
    title:            snag?.title             || '',
    description:      snag?.description       || '',
    zone:             snag?.zone              || '',
    trade:            snag?.trade             || 'other',
    priority:         snag?.priority          || 'medium',
    due_date:         snag?.due_date          || '',
    assigned_to_name: snag?.assigned_to_name  || '',
    photos:           Array.isArray(snag?.photos) ? snag.photos : [],
  });

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const mut = useMutation({
    mutationFn: d => isEdit ? snagAPI.update(snag.id, d) : snagAPI.create(d),
    onSuccess: r => { toast.success(isEdit ? 'Snag updated' : 'Snag raised'); onSuccess(r.data?.data ?? r.data); },
    onError:   e => toast.error(e?.response?.data?.error || 'Save failed'),
  });

  const handleSubmit = () => {
    if (!form.title.trim()) return toast.error('Title is required');
    if (!form.zone.trim())  return toast.error('Zone / location is required');
    mut.mutate({ ...form, project_id: projectId });
  };

  const handlePhotoAdd = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const { data: upData } = await api.post('/upload/single', fd, {
        headers: { 'Content-Type': undefined },
      });
      if (!upData.url) throw new Error('Upload failed');
      set('photos', [...form.photos, upData.url]);
    } catch (err) {
      toast.error(err?.response?.data?.error || err.message || 'Upload failed');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const inp = 'w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-400';
  const lbl = 'block text-xs font-medium text-slate-900 font-medium mb-1';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col overflow-hidden max-h-[90vh]">
        <div className="px-6 py-4 bg-indigo-600 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <Hammer className="w-5 h-5 text-white" />
            <h2 className="text-base font-medium text-white">{isEdit ? 'Edit Snag' : 'Raise New Snag'}</h2>
          </div>
          <button onClick={onClose} className="text-indigo-200 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto flex-1">

          <div>
            <label className={lbl}>Title *</label>
            <input className={inp} placeholder="Crack in wall, Missing fitting…" value={form.title} onChange={e => set('title', e.target.value)} />
          </div>

          <div>
            <label className={lbl}>Zone / Location *</label>
            <input className={inp} placeholder="Block A / Level 2 / Apartment 301" value={form.zone} onChange={e => set('zone', e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={lbl}>Trade *</label>
              <select className={inp} value={form.trade} onChange={e => set('trade', e.target.value)}>
                {TRADE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label className={lbl}>Priority</label>
              <select className={inp} value={form.priority} onChange={e => set('priority', e.target.value)}>
                {Object.entries(PRIORITY_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={lbl}>Assigned To (Firm)</label>
              <input className={inp} placeholder="Subcontractor name" value={form.assigned_to_name} onChange={e => set('assigned_to_name', e.target.value)} />
            </div>
            <div>
              <label className={lbl}>Due Date</label>
              <input type="date" className={inp} value={form.due_date} onChange={e => set('due_date', e.target.value)} />
            </div>
          </div>

          <div>
            <label className={lbl}>Description</label>
            <textarea className={inp} rows={3} placeholder="Detailed description of the defect…" value={form.description} onChange={e => set('description', e.target.value)} />
          </div>

          {/* Photo upload */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className={lbl} style={{ margin: 0 }}>Photos</label>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="text-xs text-indigo-600 hover:underline flex items-center gap-1 disabled:opacity-50"
              >
                <Camera className="w-3 h-3" /> {uploading ? 'Uploading…' : 'Add Photo'}
              </button>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoAdd} />
            </div>
            {form.photos.length === 0 ? (
              <p className="text-xs text-slate-900 font-medium italic">No photos added</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {form.photos.map((url, i) => (
                  <div key={i} className="relative group">
                    <img src={url} alt={`p-${i}`} className="w-16 h-16 object-cover rounded-lg border border-slate-200" />
                    <button
                      type="button"
                      onClick={() => set('photos', form.photos.filter((_, idx) => idx !== i))}
                      className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-red-500 text-white rounded-full hidden group-hover:flex items-center justify-center"
                    >
                      <X className="w-2.5 h-2.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>

        <div className="px-5 py-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-2 flex-shrink-0">
          <button onClick={onClose} className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-900 hover:bg-white transition-colors">Cancel</button>
          <button
            onClick={handleSubmit}
            disabled={mut.isPending}
            className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg disabled:opacity-50 flex items-center gap-1.5 transition-colors"
          >
            <Save className="w-3.5 h-3.5" /> {mut.isPending ? 'Saving…' : (isEdit ? 'Update Snag' : 'Raise Snag')}
          </button>
        </div>
      </div>
    </div>
  );
}
