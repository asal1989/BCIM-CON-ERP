// src/pages/planning/LookAheadPage.jsx
import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  CalendarDays, ChevronLeft, ChevronRight, Plus, Check, X,
  Users, Package, Truck, AlertTriangle, Save,
} from 'lucide-react';
import { planningAPI, projectAPI } from '../../api/client';
import useAuthStore from '../../store/authStore';
import toast from 'react-hot-toast';
import { clsx } from 'clsx';
import dayjs from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek';
dayjs.extend(isoWeek);

const STATUS_CFG = {
  draft:        { label: 'Draft',        color: 'bg-slate-100 text-slate-900 border-slate-200' },
  approved:     { label: 'Approved',     color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  in_execution: { label: 'In Execution', color: 'bg-blue-50 text-blue-700 border-blue-200' },
  completed:    { label: 'Completed',    color: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
};

export default function LookAheadPage() {
  const qc = useQueryClient();
  const { user } = useAuthStore();
  const canApprove = ['project_manager', 'admin', 'super_admin'].includes(user?.role);

  const [projectId, setProjectId] = useState('');
  // Current window start — Monday of current week
  const [weekStart, setWeekStart] = useState(
    dayjs().startOf('isoWeek').format('YYYY-MM-DD')
  );

  const weekEnd = dayjs(weekStart).add(13, 'day').format('YYYY-MM-DD');

  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: () => projectAPI.list().then(r => r.data?.data ?? []),
  });

  const { data: plans = [] } = useQuery({
    queryKey: ['planning-lookahead', projectId, weekStart],
    queryFn: () => planningAPI.getLookAhead({ project_id: projectId, week_start: weekStart }).then(r => r.data?.data ?? r.data ?? []).catch(() => []),
    enabled: !!projectId,
  });

  const plan = plans[0] || null;

  // Local draft state for editing
  const [form, setForm] = useState(null);
  const isEditing = !!form;

  const startEdit = () => setForm({
    activities: plan?.planned_activities || [],
    manpower: plan?.planned_manpower || '',
    materials: plan?.planned_materials || [],
    equipment: plan?.planned_equipment || [],
    risks: plan?.potential_risks || '',
    mitigation: plan?.mitigation_measures || '',
    dependencies: plan?.dependencies || '',
  });

  const cancelEdit = () => setForm(null);

  const saveMut = useMutation({
    mutationFn: d => planningAPI.saveLookAhead(d),
    onSuccess: () => {
      toast.success('Look-ahead plan saved');
      qc.invalidateQueries({ queryKey: ['planning-lookahead'] });
      setForm(null);
    },
    onError: e => toast.error(e?.response?.data?.error || 'Save failed'),
  });

  const approveMut = useMutation({
    mutationFn: id => planningAPI.approveLookAhead(id),
    onSuccess: () => {
      toast.success('Plan approved!');
      qc.invalidateQueries({ queryKey: ['planning-lookahead'] });
    },
    onError: e => toast.error(e?.response?.data?.error || 'Approval failed'),
  });

  const handleSave = () => {
    if (!projectId) return toast.error('Select a project first');
    saveMut.mutate({
      project_id: projectId,
      plan_week_start: weekStart,
      plan_week_end: weekEnd,
      planned_activities: form.activities,
      planned_manpower: form.manpower || null,
      planned_materials: form.materials,
      planned_equipment: form.equipment,
      potential_risks: form.risks || null,
      mitigation_measures: form.mitigation || null,
      dependencies: form.dependencies || null,
    });
  };

  const prevWeek = () => setWeekStart(dayjs(weekStart).subtract(2, 'week').format('YYYY-MM-DD'));
  const nextWeek = () => setWeekStart(dayjs(weekStart).add(2, 'week').format('YYYY-MM-DD'));

  const statusCfg = STATUS_CFG[plan?.status] || STATUS_CFG.draft;

  return (
    <div className="p-6 md:p-8 max-w-5xl mx-auto min-h-screen bg-[#f4f6f9]">

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-900 font-medium mb-1"><CalendarDays className="w-3.5 h-3.5" /> Planning</div>
          <h1 className="text-2xl font-medium text-slate-900">2-Week Look-Ahead Plan</h1>
          <p className="text-sm text-slate-900 font-medium mt-0.5">Rolling forward planning window for activities, resources and risk</p>
        </div>
        <select value={projectId} onChange={e => setProjectId(e.target.value)} className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-400 shadow-sm w-64">
          <option value="">— Select project —</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>

      {!projectId ? (
        <div className="bg-white border border-slate-200 rounded-xl p-16 text-center shadow-sm">
          <CalendarDays className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-900 font-medium font-medium">Select a project to manage its look-ahead plan</p>
        </div>
      ) : (
        <>
          {/* Week Navigator */}
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-4 mb-5 flex items-center justify-between">
            <button onClick={prevWeek} className="p-2 hover:bg-slate-100 rounded-lg transition-colors">
              <ChevronLeft className="w-4 h-4 text-slate-600" />
            </button>
            <div className="text-center">
              <div className="text-sm font-medium text-slate-900">
                {dayjs(weekStart).format('DD MMM')} – {dayjs(weekEnd).format('DD MMM YYYY')}
              </div>
              <div className="text-xs text-slate-900 font-medium mt-0.5">2-Week Planning Window</div>
            </div>
            <button onClick={nextWeek} className="p-2 hover:bg-slate-100 rounded-lg transition-colors">
              <ChevronRight className="w-4 h-4 text-slate-600" />
            </button>
          </div>

          {/* Plan Card */}
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <CalendarDays className="w-4 h-4 text-indigo-600" />
                <h2 className="text-sm font-medium text-black">Plan Details</h2>
                {plan && (
                  <span className={clsx('text-xs px-2.5 py-1 rounded-md border font-medium', statusCfg.color)}>
                    {statusCfg.label}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {plan && !plan.is_approved && canApprove && !isEditing && (
                  <button onClick={() => approveMut.mutate(plan.id)} disabled={approveMut.isPending} className="px-3 py-1.5 bg-emerald-600 text-white text-xs font-medium rounded-lg hover:bg-emerald-700 disabled:opacity-50">
                    {approveMut.isPending ? 'Approving…' : 'Approve Plan'}
                  </button>
                )}
                {!isEditing ? (
                  <button onClick={startEdit} className="px-3 py-1.5 bg-indigo-600 text-white text-xs font-medium rounded-lg hover:bg-indigo-700">
                    {plan ? 'Edit Plan' : 'Create Plan'}
                  </button>
                ) : (
                  <div className="flex gap-2">
                    <button onClick={cancelEdit} className="px-3 py-1.5 border border-slate-200 text-slate-900 text-xs font-medium rounded-lg hover:bg-slate-50">Cancel</button>
                    <button onClick={handleSave} disabled={saveMut.isPending} className="px-3 py-1.5 bg-indigo-600 text-white text-xs font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-1.5">
                      <Save className="w-3 h-3" /> {saveMut.isPending ? 'Saving…' : 'Save Plan'}
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div className="p-5 space-y-5">
              {/* Planned Activities */}
              <Section title="Planned Activities" icon={Check}>
                {isEditing ? (
                  <ActivityEditor
                    items={form.activities}
                    onChange={v => setForm(f => ({ ...f, activities: v }))}
                  />
                ) : plan?.planned_activities?.length ? (
                  <div className="space-y-2">
                    {plan.planned_activities.map((a, i) => (
                      <div key={i} className="flex items-start gap-3 bg-slate-50 rounded-lg p-3">
                        <div className="w-5 h-5 bg-indigo-100 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                          <span className="text-[9px] font-medium text-indigo-600">{i + 1}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-medium text-black">{a.description}</div>
                          {a.planned_qty && <div className="text-xs text-slate-900 font-medium mt-0.5">Qty: {a.planned_qty} | Resource: {a.resource || '—'}</div>}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : <Empty text="No activities planned for this window" />}
              </Section>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Manpower */}
                <Section title="Manpower Required" icon={Users}>
                  {isEditing ? (
                    <input type="number" className="inp" placeholder="Total workers needed" value={form.manpower} onChange={e => setForm(f => ({ ...f, manpower: e.target.value }))} />
                  ) : plan?.planned_manpower ? (
                    <div className="text-2xl font-medium text-slate-900">{plan.planned_manpower} <span className="text-sm font-normal text-slate-400">workers</span></div>
                  ) : <Empty text="Not specified" />}
                </Section>

                {/* Materials */}
                <Section title="Materials Required" icon={Package}>
                  {isEditing ? (
                    <ListEditor items={form.materials} onChange={v => setForm(f => ({ ...f, materials: v }))} placeholder="Material name, qty…" />
                  ) : plan?.planned_materials?.length ? (
                    <ul className="space-y-1">{plan.planned_materials.map((m, i) => <li key={i} className="text-xs text-slate-700">• {typeof m === 'string' ? m : m.name || JSON.stringify(m)}</li>)}</ul>
                  ) : <Empty text="No materials listed" />}
                </Section>

                {/* Equipment */}
                <Section title="Equipment Required" icon={Truck}>
                  {isEditing ? (
                    <ListEditor items={form.equipment} onChange={v => setForm(f => ({ ...f, equipment: v }))} placeholder="Equipment name…" />
                  ) : plan?.planned_equipment?.length ? (
                    <ul className="space-y-1">{plan.planned_equipment.map((e, i) => <li key={i} className="text-xs text-slate-700">• {typeof e === 'string' ? e : e.name || JSON.stringify(e)}</li>)}</ul>
                  ) : <Empty text="No equipment listed" />}
                </Section>
              </div>

              {/* Risks */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Section title="Potential Risks" icon={AlertTriangle}>
                  {isEditing ? (
                    <textarea className="inp" rows={3} placeholder="Foreseen risks or constraints…" value={form.risks} onChange={e => setForm(f => ({ ...f, risks: e.target.value }))} />
                  ) : plan?.potential_risks ? (
                    <p className="text-xs text-slate-900 leading-relaxed">{plan.potential_risks}</p>
                  ) : <Empty text="No risks identified" />}
                </Section>
                <Section title="Mitigation Measures">
                  {isEditing ? (
                    <textarea className="inp" rows={3} placeholder="How will you manage risks…" value={form.mitigation} onChange={e => setForm(f => ({ ...f, mitigation: e.target.value }))} />
                  ) : plan?.mitigation_measures ? (
                    <p className="text-xs text-slate-900 leading-relaxed">{plan.mitigation_measures}</p>
                  ) : <Empty text="No mitigation defined" />}
                </Section>
              </div>

              {plan && (
                <div className="text-xs text-slate-900 font-medium pt-2 border-t border-slate-100">
                  {plan.planned_by_name && <>Planned by <span className="font-medium text-slate-600">{plan.planned_by_name}</span> · </>}
                  {plan.approved_by_name && <>Approved by <span className="font-medium text-slate-600">{plan.approved_by_name}</span> on {dayjs(plan.approved_at).format('DD MMM YYYY')}</>}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Section({ title, icon: Icon, children }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        {Icon && <Icon className="w-3.5 h-3.5 text-slate-500" />}
        <h3 className="text-xs font-medium text-slate-900 uppercase tracking-wide">{title}</h3>
      </div>
      {children}
    </div>
  );
}

function Empty({ text }) {
  return <p className="text-xs text-slate-900 font-medium italic py-1">{text}</p>;
}

function ActivityEditor({ items, onChange }) {
  const add = () => onChange([...items, { description: '', planned_qty: '', resource: '' }]);
  const remove = i => onChange(items.filter((_, idx) => idx !== i));
  const update = (i, k, v) => onChange(items.map((item, idx) => idx === i ? { ...item, [k]: v } : item));

  return (
    <div className="space-y-2">
      {items.map((a, i) => (
        <div key={i} className="flex items-start gap-2">
          <div className="flex-1 grid grid-cols-3 gap-2">
            <input className="inp col-span-2" placeholder="Activity description" value={a.description} onChange={e => update(i, 'description', e.target.value)} />
            <input className="inp" placeholder="Qty / Resource" value={a.planned_qty} onChange={e => update(i, 'planned_qty', e.target.value)} />
          </div>
          <button onClick={() => remove(i)} className="p-2 text-slate-900 font-medium hover:text-red-500 mt-0.5"><X className="w-3.5 h-3.5" /></button>
        </div>
      ))}
      <button onClick={add} className="text-xs text-indigo-600 hover:underline flex items-center gap-1 mt-1">
        <Plus className="w-3 h-3" /> Add activity
      </button>
    </div>
  );
}

function ListEditor({ items, onChange, placeholder }) {
  const add = () => onChange([...items, '']);
  const remove = i => onChange(items.filter((_, idx) => idx !== i));
  const update = (i, v) => onChange(items.map((item, idx) => idx === i ? v : item));

  return (
    <div className="space-y-1.5">
      {items.map((item, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <input className="inp flex-1" placeholder={placeholder} value={typeof item === 'string' ? item : item.name || ''} onChange={e => update(i, e.target.value)} />
          <button onClick={() => remove(i)} className="p-1.5 text-slate-900 font-medium hover:text-red-500"><X className="w-3 h-3" /></button>
        </div>
      ))}
      <button onClick={add} className="text-xs text-indigo-600 hover:underline flex items-center gap-1">
        <Plus className="w-3 h-3" /> Add
      </button>
    </div>
  );
}
