// src/pages/planning/MilestonePage.jsx
import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Flag, Plus, CheckCircle2, Clock, AlertTriangle, X,
  Calendar, ChevronRight, Package,
} from 'lucide-react';
import { planningAPI, projectAPI } from '../../api/client';
import useAuthStore from '../../store/authStore';
import toast from 'react-hot-toast';
import { clsx } from 'clsx';
import dayjs from 'dayjs';

const TYPE_LABELS = {
  foundation: 'Foundation', structural: 'Structural', finishing: 'Finishing',
  inspection: 'Inspection', certification: 'Certification', handover: 'Handover',
  payment: 'Payment Release', testing: 'Testing', other: 'Other',
};

export default function MilestonePage() {
  const qc = useQueryClient();
  const { user } = useAuthStore();
  const [projectId, setProjectId] = useState('');
  const [showAdd, setShowAdd]     = useState(false);
  const [selected, setSelected]   = useState(null);

  const canAchieve = ['project_manager', 'admin', 'super_admin'].includes(user?.role);

  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: () => projectAPI.list().then(r => r.data?.data ?? []),
  });

  const { data: milestones = [] } = useQuery({
    queryKey: ['planning-milestones', projectId],
    queryFn: () => planningAPI.listMilestones({ project_id: projectId }).then(r => r.data?.data ?? r.data ?? []).catch(() => []),
    enabled: !!projectId,
  });

  const achieveMut = useMutation({
    mutationFn: ({ id, actual_date }) => planningAPI.achieveMilestone(id, { actual_date }),
    onSuccess: () => {
      toast.success('Milestone marked as achieved!');
      qc.invalidateQueries({ queryKey: ['planning-milestones'] });
      setSelected(null);
    },
    onError: e => toast.error(e?.response?.data?.error || 'Failed'),
  });

  const achieved = milestones.filter(m => m.is_achieved);
  const overdue  = milestones.filter(m => !m.is_achieved && dayjs(m.target_date).isBefore(dayjs()));
  const upcoming = milestones.filter(m => !m.is_achieved && !dayjs(m.target_date).isBefore(dayjs()));

  const kpis = [
    { label: 'Total',    value: milestones.length, color: 'text-slate-700', dot: 'bg-slate-400' },
    { label: 'Achieved', value: achieved.length,   color: 'text-emerald-700', dot: 'bg-emerald-500' },
    { label: 'Upcoming', value: upcoming.length,   color: 'text-blue-700',    dot: 'bg-blue-500' },
    { label: 'Overdue',  value: overdue.length,    color: 'text-red-700',     dot: 'bg-red-500' },
  ];

  return (
    <div className="p-6 md:p-8 max-w-5xl mx-auto min-h-screen bg-[#f4f6f9]">

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-900 font-medium mb-1"><Flag className="w-3.5 h-3.5" /> Planning</div>
          <h1 className="text-2xl font-medium text-slate-900">Milestones</h1>
          <p className="text-sm text-slate-900 font-medium mt-0.5">Contractual & operational milestone gates</p>
        </div>
        <div className="flex items-center gap-2">
          <select value={projectId} onChange={e => setProjectId(e.target.value)} className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-400 shadow-sm">
            <option value="">— Select project —</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          {projectId && (
            <button onClick={() => setShowAdd(true)} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 shadow-sm">
              <Plus className="w-4 h-4" /> Add Milestone
            </button>
          )}
        </div>
      </div>

      {!projectId ? (
        <div className="bg-white border border-slate-200 rounded-xl p-16 text-center shadow-sm">
          <Flag className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-900 font-medium font-medium">Select a project to view milestones</p>
        </div>
      ) : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            {kpis.map(({ label, value, color, dot }) => (
              <div key={label} className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
                <div className="flex items-center justify-between mb-2">
                  <Flag className={clsx('w-4 h-4', color)} />
                  <span className={clsx('w-2 h-2 rounded-full', dot)} />
                </div>
                <div className="text-2xl font-medium text-slate-900">{value}</div>
                <div className="text-xs text-slate-900 font-medium mt-0.5">{label}</div>
              </div>
            ))}
          </div>

          {/* Overdue alert */}
          {overdue.length > 0 && (
            <div className="mb-4 bg-red-50 border border-red-200 rounded-xl p-3 flex items-center gap-3">
              <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0" />
              <p className="text-xs text-red-700 font-medium">{overdue.length} milestone{overdue.length > 1 ? 's are' : ' is'} overdue — please update status.</p>
            </div>
          )}

          {/* Timeline List */}
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-100 flex items-center gap-2">
              <Flag className="w-4 h-4 text-indigo-600" />
              <h2 className="text-sm font-medium text-black">Milestone Timeline</h2>
            </div>

            <div className="divide-y divide-slate-50">
              {milestones.length === 0 && (
                <div className="py-16 text-center">
                  <Package className="w-8 h-8 text-slate-300 mx-auto mb-3" />
                  <p className="text-sm text-slate-400">No milestones yet</p>
                </div>
              )}
              {[...milestones].sort((a, b) => new Date(a.target_date) - new Date(b.target_date)).map(m => {
                const isOverdue  = !m.is_achieved && dayjs(m.target_date).isBefore(dayjs());
                const daysLeft   = dayjs(m.target_date).diff(dayjs(), 'day');
                const deviation  = m.deviation_days;

                return (
                  <div
                    key={m.id}
                    onClick={() => setSelected(m)}
                    className="flex items-center gap-4 px-5 py-4 hover:bg-slate-50 cursor-pointer group transition-colors"
                  >
                    {/* Status Icon */}
                    <div className={clsx(
                      'w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 border-2',
                      m.is_achieved ? 'bg-emerald-500 border-emerald-500 text-white' :
                      isOverdue     ? 'bg-red-100 border-red-300 text-red-500' :
                                      'bg-indigo-50 border-indigo-200 text-indigo-500'
                    )}>
                      {m.is_achieved ? <CheckCircle2 className="w-4 h-4" /> :
                       isOverdue     ? <AlertTriangle className="w-4 h-4" /> :
                                       <Flag className="w-4 h-4" />}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-black">{m.milestone_name}</span>
                        <span className="text-xs text-slate-900 font-medium font-mono">{m.milestone_code}</span>
                        {m.affects_payment_release && (
                          <span className="text-[9px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded border border-amber-200 font-bold">PAYMENT GATE</span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-0.5 text-xs text-slate-400">
                        <span className="capitalize">{TYPE_LABELS[m.milestone_type] || 'General'}</span>
                        {m.remarks && <span className="truncate max-w-64 italic">"{m.remarks}"</span>}
                      </div>
                    </div>

                    {/* Dates */}
                    <div className="text-right flex-shrink-0">
                      <div className={clsx('text-xs font-semibold', isOverdue ? 'text-red-600' : 'text-slate-700')}>
                        {dayjs(m.target_date).format('DD MMM YYYY')}
                      </div>
                      {m.is_achieved ? (
                        <div className={clsx('text-xs font-medium', deviation <= 0 ? 'text-emerald-600' : 'text-amber-600')}>
                          {deviation <= 0 ? `${Math.abs(deviation)}d early` : `${deviation}d late`}
                        </div>
                      ) : (
                        <div className={clsx('text-xs', isOverdue ? 'text-red-500 font-semibold' : 'text-slate-400')}>
                          {isOverdue ? `${Math.abs(daysLeft)}d overdue` : daysLeft === 0 ? 'Today' : `${daysLeft}d left`}
                        </div>
                      )}
                    </div>

                    <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-indigo-500 transition-colors" />
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}

      {/* Achieve Modal */}
      {selected && (
        <AchieveModal
          milestone={selected}
          canAchieve={canAchieve}
          onClose={() => setSelected(null)}
          onAchieve={(id, date) => achieveMut.mutate({ id, actual_date: date })}
          isPending={achieveMut.isPending}
        />
      )}

      {showAdd && (
        <AddMilestoneModal projectId={projectId} onClose={() => setShowAdd(false)} qc={qc} />
      )}
    </div>
  );
}

function AchieveModal({ milestone: m, canAchieve, onClose, onAchieve, isPending }) {
  const [date, setDate] = useState(dayjs().format('YYYY-MM-DD'));
  return (
    <div className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-md rounded-xl shadow-2xl border border-slate-200">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
          <h2 className="text-base font-medium text-slate-900">{m.milestone_name}</h2>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-200 rounded-md text-slate-400"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="bg-slate-50 rounded-lg p-3">
              <div className="text-slate-900 font-medium mb-1">Target Date</div>
              <div className="font-medium text-black">{dayjs(m.target_date).format('DD MMM YYYY')}</div>
            </div>
            <div className="bg-slate-50 rounded-lg p-3">
              <div className="text-slate-900 font-medium mb-1">Type</div>
              <div className="font-medium text-slate-900 font-medium capitalize">{m.milestone_type || '—'}</div>
            </div>
          </div>
          {m.is_achieved ? (
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 text-center">
              <CheckCircle2 className="w-6 h-6 text-emerald-500 mx-auto mb-2" />
              <p className="text-sm font-medium text-emerald-700">Achieved on {dayjs(m.actual_date).format('DD MMM YYYY')}</p>
              {m.deviation_days <= 0
                ? <p className="text-xs text-emerald-600">{Math.abs(m.deviation_days)} days early 🎉</p>
                : <p className="text-xs text-amber-600">{m.deviation_days} days late</p>}
            </div>
          ) : canAchieve ? (
            <div className="space-y-2">
              <label className="text-xs font-medium text-slate-600">Actual Achievement Date</label>
              <input type="date" className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-400" value={date} onChange={e => setDate(e.target.value)} />
            </div>
          ) : (
            <p className="text-xs text-slate-900 font-medium text-center py-2">Only Project Managers can mark milestones as achieved.</p>
          )}
        </div>
        <div className="px-5 py-3 border-t border-slate-100 bg-slate-50 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-900 hover:bg-slate-200 rounded-lg">Close</button>
          {!m.is_achieved && canAchieve && (
            <button onClick={() => onAchieve(m.id, date)} disabled={isPending} className="px-5 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 disabled:opacity-50 shadow-sm">
              {isPending ? 'Saving…' : 'Mark Achieved'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function AddMilestoneModal({ projectId, onClose, qc }) {
  const [form, setForm] = useState({
    milestone_code: '', milestone_name: '', milestone_type: 'structural',
    target_date: '', affects_payment_release: false, remarks: '',
  });
  const F = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const createMut = useMutation({
    mutationFn: d => planningAPI.createMilestone(d),
    onSuccess: () => { toast.success('Milestone created'); qc.invalidateQueries({ queryKey: ['planning-milestones'] }); onClose(); },
    onError: e => toast.error(e?.response?.data?.error || 'Failed'),
  });

  return (
    <div className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-md rounded-xl shadow-2xl border border-slate-200">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
          <h2 className="text-base font-medium text-slate-900">Add Milestone</h2>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-200 rounded-md text-slate-400"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><label className="text-xs font-medium text-slate-600">Code *</label><input className="inp" placeholder="M1" value={form.milestone_code} onChange={e => F('milestone_code', e.target.value)} /></div>
            <div className="space-y-1"><label className="text-xs font-medium text-slate-600">Type</label>
              <select className="inp" value={form.milestone_type} onChange={e => F('milestone_type', e.target.value)}>
                {Object.entries(TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div className="space-y-1 col-span-2"><label className="text-xs font-medium text-slate-600">Milestone Name *</label><input className="inp" placeholder="Foundation Completion" value={form.milestone_name} onChange={e => F('milestone_name', e.target.value)} /></div>
            <div className="space-y-1 col-span-2"><label className="text-xs font-medium text-slate-600">Target Date *</label><input type="date" className="inp" value={form.target_date} onChange={e => F('target_date', e.target.value)} /></div>
            <div className="space-y-1 col-span-2">
              <label className="text-xs font-medium text-slate-600">Linked to Payment Release</label>
              <select className="inp" value={form.affects_payment_release} onChange={e => F('affects_payment_release', e.target.value === 'true')}>
                <option value="false">No</option><option value="true">Yes</option>
              </select>
            </div>
            <div className="space-y-1 col-span-2"><label className="text-xs font-medium text-slate-600">Remarks</label><textarea className="inp" rows={2} value={form.remarks} onChange={e => F('remarks', e.target.value)} /></div>
          </div>
        </div>
        <div className="px-5 py-3 border-t border-slate-100 bg-slate-50 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-900 hover:bg-slate-200 rounded-lg">Cancel</button>
          <button onClick={() => createMut.mutate({ ...form, project_id: projectId })} disabled={createMut.isPending} className="px-5 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 shadow-sm">
            {createMut.isPending ? 'Saving…' : 'Create Milestone'}
          </button>
        </div>
      </div>
    </div>
  );
}
