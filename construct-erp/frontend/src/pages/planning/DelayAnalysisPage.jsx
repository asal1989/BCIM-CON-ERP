// src/pages/planning/DelayAnalysisPage.jsx
import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle, Plus, Save, X, ChevronRight,
  Clock, TrendingDown, CheckCircle2, Flame,
} from 'lucide-react';
import { planningAPI, projectAPI } from '../../api/client';
import useAuthStore from '../../store/authStore';
import toast from 'react-hot-toast';
import { clsx } from 'clsx';
import dayjs from 'dayjs';

const PLANNERS = ['project_manager', 'site_engineer', 'admin', 'super_admin'];

const CATEGORY_OPTIONS = [
  { value: 'material_supply', label: 'Material Supply' },
  { value: 'manpower',        label: 'Manpower' },
  { value: 'equipment',       label: 'Equipment' },
  { value: 'weather',         label: 'Weather' },
  { value: 'design_change',   label: 'Design Change' },
  { value: 'client_approval', label: 'Client Approval' },
  { value: 'subcontractor',   label: 'Subcontractor' },
  { value: 'other',           label: 'Other' },
];

const IMPACT_CFG = {
  no_impact: { label: 'No Impact', color: 'bg-slate-100 text-slate-600' },
  minor:     { label: 'Minor',     color: 'bg-amber-50  text-amber-700' },
  major:     { label: 'Major',     color: 'bg-orange-50 text-orange-700' },
  critical:  { label: 'Critical',  color: 'bg-red-50    text-red-700' },
};

const CATEGORY_LABELS = Object.fromEntries(CATEGORY_OPTIONS.map(o => [o.value, o.label]));

export default function DelayAnalysisPage() {
  const qc = useQueryClient();
  const { user } = useAuthStore();
  const canLog = PLANNERS.includes(user?.role);

  const [projectId, setProjectId]         = useState('');
  const [filterCat, setFilterCat]         = useState('');
  const [filterImpact, setFilterImpact]   = useState('');
  const [showModal, setShowModal]         = useState(false);
  const [editDelay, setEditDelay]         = useState(null);   // null = add, object = edit
  const [expandedId, setExpandedId]       = useState(null);

  // ── Queries ──────────────────────────────────────────────────────────────
  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: () => projectAPI.list().then(r => r.data?.data ?? []),
  });

  const { data: delays = [], isLoading } = useQuery({
    queryKey: ['planning-delays', projectId],
    queryFn: () => planningAPI.listDelays({ project_id: projectId }).then(r => r.data?.data ?? r.data ?? []).catch(() => []),
    enabled: !!projectId,
  });

  const { data: activities = [] } = useQuery({
    queryKey: ['planning-activities', projectId],
    queryFn: () => planningAPI.listActivities({ project_id: projectId }).then(r => r.data?.data ?? r.data ?? []).catch(() => []),
    enabled: !!projectId,
  });

  // ── Derived stats ────────────────────────────────────────────────────────
  const total       = delays.length;
  const critical    = delays.filter(d => d.impact_on_project === 'critical').length;
  const avgDays     = total ? Math.round(delays.reduce((s, d) => s + (d.delay_days || 0), 0) / total) : 0;
  const withMitig   = delays.filter(d => d.mitigation_plan?.trim()).length;

  // ── Filters ──────────────────────────────────────────────────────────────
  const filtered = useMemo(() => delays.filter(d => {
    if (filterCat    && d.delay_category    !== filterCat)    return false;
    if (filterImpact && d.impact_on_project !== filterImpact) return false;
    return true;
  }), [delays, filterCat, filterImpact]);

  const openAdd  = () => { setEditDelay(null);   setShowModal(true); };
  const openEdit = (d) => { setEditDelay(d);      setShowModal(true); };

  return (
    <div className="p-6 md:p-8 max-w-6xl mx-auto min-h-screen bg-[#f4f6f9]">

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-900 font-medium mb-1">
            <AlertTriangle className="w-3.5 h-3.5" /> Planning
          </div>
          <h1 className="text-2xl font-medium text-slate-900">Delay Analysis</h1>
          <p className="text-sm text-slate-900 font-medium mt-0.5">Root-cause tracking and mitigation for schedule delays</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={projectId}
            onChange={e => setProjectId(e.target.value)}
            className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-400 shadow-sm w-64"
          >
            <option value="">— Select project —</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          {projectId && canLog && (
            <button
              onClick={openAdd}
              className="px-3 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" /> Log Delay
            </button>
          )}
        </div>
      </div>

      {!projectId ? (
        <div className="bg-white border border-slate-200 rounded-xl p-16 text-center shadow-sm">
          <AlertTriangle className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-900 font-medium font-medium">Select a project to view delay analysis</p>
        </div>
      ) : (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
            {[
              { label: 'Total Delays',    value: total,    icon: Clock,        color: 'text-slate-700',   dot: 'bg-slate-400' },
              { label: 'Critical Impact', value: critical, icon: Flame,        color: 'text-red-600',     dot: 'bg-red-500' },
              { label: 'Avg Delay Days',  value: avgDays,  icon: TrendingDown, color: 'text-amber-600',   dot: 'bg-amber-400', suffix: 'd' },
              { label: 'With Mitigation', value: withMitig,icon: CheckCircle2, color: 'text-emerald-600', dot: 'bg-emerald-500' },
            ].map(({ label, value, icon: Icon, color, dot, suffix }) => (
              <div key={label} className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
                <div className="flex items-center justify-between mb-1">
                  <Icon className={clsx('w-4 h-4', color)} />
                  <span className={clsx('w-2 h-2 rounded-full', dot)} />
                </div>
                <div className={clsx('text-2xl font-bold', color)}>
                  {value}{suffix}
                </div>
                <div className="text-xs text-slate-900 font-medium mt-0.5">{label}</div>
              </div>
            ))}
          </div>

          {/* Filters */}
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-4 mb-4 flex flex-wrap items-center gap-3">
            <span className="text-xs font-medium text-slate-900 font-medium uppercase tracking-wide">Filter by:</span>
            <select
              value={filterCat}
              onChange={e => setFilterCat(e.target.value)}
              className="bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs outline-none focus:border-indigo-400"
            >
              <option value="">All Categories</option>
              {CATEGORY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <select
              value={filterImpact}
              onChange={e => setFilterImpact(e.target.value)}
              className="bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs outline-none focus:border-indigo-400"
            >
              <option value="">All Impact Levels</option>
              {Object.entries(IMPACT_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
            {(filterCat || filterImpact) && (
              <button
                onClick={() => { setFilterCat(''); setFilterImpact(''); }}
                className="text-xs text-indigo-600 hover:underline flex items-center gap-0.5"
              >
                <X className="w-3 h-3" /> Clear
              </button>
            )}
            <span className="ml-auto text-xs text-slate-400">{filtered.length} of {total} records</span>
          </div>

          {/* Table */}
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
            {isLoading ? (
              <div className="py-16 text-center text-sm text-slate-400">Loading…</div>
            ) : filtered.length === 0 ? (
              <div className="py-16 text-center">
                <AlertTriangle className="w-8 h-8 text-slate-200 mx-auto mb-2" />
                <p className="text-sm text-slate-400">No delay records found</p>
                {canLog && (
                  <button onClick={openAdd} className="mt-3 text-xs text-indigo-600 hover:underline">
                    + Log the first delay
                  </button>
                )}
              </div>
            ) : (
              <div className="divide-y divide-slate-50">
                {filtered.map(d => {
                  const expanded = expandedId === d.id;
                  const impactCfg = IMPACT_CFG[d.impact_on_project] || IMPACT_CFG.minor;
                  const actName = activities.find(a => a.id === d.activity_id)?.activity_name || d.activity_name || '—';
                  return (
                    <div key={d.id}>
                      <div
                        className="px-5 py-3.5 flex items-center gap-4 hover:bg-slate-50 cursor-pointer transition-colors"
                        onClick={() => setExpandedId(expanded ? null : d.id)}
                      >
                        {/* Impact dot */}
                        <div className={clsx(
                          'w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0',
                          d.impact_on_project === 'critical' ? 'bg-red-50' :
                          d.impact_on_project === 'major'    ? 'bg-orange-50' :
                          d.impact_on_project === 'minor'    ? 'bg-amber-50' : 'bg-slate-50'
                        )}>
                          <AlertTriangle className={clsx(
                            'w-4 h-4',
                            d.impact_on_project === 'critical' ? 'text-red-500' :
                            d.impact_on_project === 'major'    ? 'text-orange-500' :
                            d.impact_on_project === 'minor'    ? 'text-amber-500' : 'text-slate-400'
                          )} />
                        </div>

                        {/* Activity & date */}
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-slate-900 font-medium truncate">{actName}</div>
                          <div className="text-xs text-slate-400">
                            {dayjs(d.analysis_date).format('DD MMM YYYY')}
                            {d.responsible_party && <> · {d.responsible_party}</>}
                          </div>
                        </div>

                        {/* Delay days */}
                        <div className="text-right flex-shrink-0">
                          <div className="text-lg font-medium text-red-600">{d.delay_days}d</div>
                          <div className="text-[10px] text-slate-400">delay</div>
                        </div>

                        {/* Category */}
                        <span className="hidden md:block text-xs bg-slate-100 text-slate-900 px-2 py-1 rounded-md whitespace-nowrap">
                          {CATEGORY_LABELS[d.delay_category] || d.delay_category}
                        </span>

                        {/* Impact */}
                        <span className={clsx('text-xs px-2.5 py-1 rounded-md font-medium border whitespace-nowrap', impactCfg.color)}>
                          {impactCfg.label}
                        </span>

                        {/* Mitigation indicator */}
                        {d.mitigation_plan?.trim() ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" title="Has mitigation plan" />
                        ) : (
                          <X className="w-4 h-4 text-slate-300 flex-shrink-0" title="No mitigation plan" />
                        )}

                        <ChevronRight className={clsx('w-4 h-4 text-slate-900 font-medium flex-shrink-0 transition-transform', expanded && 'rotate-90')} />
                      </div>

                      {/* Expanded detail */}
                      {expanded && (
                        <div className="px-5 pb-4 bg-slate-50 border-t border-slate-100">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3">
                            <DetailBlock label="Root Cause" value={d.root_cause} />
                            <DetailBlock label="Mitigation Plan" value={d.mitigation_plan} />
                          </div>
                          {canLog && (
                            <div className="mt-3 flex justify-end">
                              <button
                                onClick={e => { e.stopPropagation(); openEdit(d); }}
                                className="text-xs text-indigo-600 hover:underline"
                              >
                                Edit this record →
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}

      {/* Log / Edit Delay Modal */}
      {showModal && (
        <DelayModal
          projectId={projectId}
          activities={activities}
          delay={editDelay}
          onClose={() => { setShowModal(false); setEditDelay(null); }}
          onSuccess={() => {
            qc.invalidateQueries({ queryKey: ['planning-delays'] });
            setShowModal(false);
            setEditDelay(null);
          }}
        />
      )}
    </div>
  );
}

// ── Detail block ────────────────────────────────────────────────────────────
function DetailBlock({ label, value }) {
  return (
    <div>
      <div className="text-[10px] font-medium text-slate-900 font-medium uppercase tracking-wide mb-1">{label}</div>
      <p className="text-xs text-slate-900 leading-relaxed">
        {value?.trim() || <span className="italic text-slate-400">Not specified</span>}
      </p>
    </div>
  );
}

// ── Log / Edit Delay Modal ──────────────────────────────────────────────────
function DelayModal({ projectId, activities, delay, onClose, onSuccess }) {
  const isEdit = !!delay;
  const [form, setForm] = useState({
    activity_id:       delay?.activity_id       || '',
    analysis_date:     delay?.analysis_date     || dayjs().format('YYYY-MM-DD'),
    delay_days:        delay?.delay_days        || '',
    delay_category:    delay?.delay_category    || '',
    root_cause:        delay?.root_cause        || '',
    impact_on_project: delay?.impact_on_project || 'minor',
    mitigation_plan:   delay?.mitigation_plan   || '',
    responsible_party: delay?.responsible_party || '',
  });

  const mut = useMutation({
    mutationFn: d => isEdit
      ? planningAPI.updateDelay(delay.id, d)
      : planningAPI.logDelay(d),
    onSuccess: () => {
      toast.success(isEdit ? 'Delay record updated' : 'Delay logged');
      onSuccess();
    },
    onError: e => toast.error(e?.response?.data?.error || 'Save failed'),
  });

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = () => {
    if (!form.activity_id)    return toast.error('Select an activity');
    if (!form.delay_days)     return toast.error('Enter delay days');
    if (!form.delay_category) return toast.error('Select a category');
    if (!form.root_cause)     return toast.error('Enter root cause');
    mut.mutate({ ...form, project_id: projectId });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h2 className="text-sm font-medium text-black">{isEdit ? 'Edit Delay Record' : 'Log Delay'}</h2>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors">
            <X className="w-4 h-4 text-slate-500" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <style>{`.inp{display:block;width:100%;padding:0.5rem 0.75rem;font-size:0.875rem;background:#fff;border:1px solid #e2e8f0;border-radius:0.5rem;outline:none;color:#1e293b}.inp:focus{border-color:#6366f1}.lbl{display:block;font-size:0.75rem;font-weight:600;color:#64748b;margin-bottom:0.25rem;text-transform:uppercase;letter-spacing:0.025em}`}</style>

          {/* Activity */}
          <div>
            <label className="lbl">Activity *</label>
            <select className="inp" value={form.activity_id} onChange={e => set('activity_id', e.target.value)}>
              <option value="">— Select affected activity —</option>
              {activities.map(a => <option key={a.id} value={a.id}>{a.activity_code} — {a.activity_name}</option>)}
            </select>
          </div>

          {/* Date & Days */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="lbl">Analysis Date *</label>
              <input type="date" className="inp" value={form.analysis_date} onChange={e => set('analysis_date', e.target.value)} />
            </div>
            <div>
              <label className="lbl">Delay Days *</label>
              <input type="number" className="inp" placeholder="e.g. 5" value={form.delay_days} onChange={e => set('delay_days', e.target.value)} />
            </div>
          </div>

          {/* Category & Impact */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="lbl">Category *</label>
              <select className="inp" value={form.delay_category} onChange={e => set('delay_category', e.target.value)}>
                <option value="">— Select —</option>
                {CATEGORY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label className="lbl">Impact *</label>
              <select className="inp" value={form.impact_on_project} onChange={e => set('impact_on_project', e.target.value)}>
                {Object.entries(IMPACT_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
          </div>

          {/* Responsible party */}
          <div>
            <label className="lbl">Responsible Party</label>
            <input type="text" className="inp" placeholder="Contractor / Client / Consultant…" value={form.responsible_party} onChange={e => set('responsible_party', e.target.value)} />
          </div>

          {/* Root Cause */}
          <div>
            <label className="lbl">Root Cause *</label>
            <textarea className="inp" rows={3} placeholder="What caused this delay…" value={form.root_cause} onChange={e => set('root_cause', e.target.value)} />
          </div>

          {/* Mitigation Plan */}
          <div>
            <label className="lbl">Mitigation Plan</label>
            <textarea className="inp" rows={3} placeholder="How will you recover the schedule…" value={form.mitigation_plan} onChange={e => set('mitigation_plan', e.target.value)} />
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2">
            <button onClick={onClose} className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-900 hover:bg-slate-50">
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={mut.isPending}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-1.5"
            >
              <Save className="w-3.5 h-3.5" /> {mut.isPending ? 'Saving…' : (isEdit ? 'Update' : 'Log Delay')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
