// src/pages/planning/ProgressDashboard.jsx
import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  TrendingUp, Plus, Save, X, Camera,
  ArrowUp, ArrowDown, Minus, AlertTriangle,
} from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, ReferenceLine,
} from 'recharts';
import { planningAPI, projectAPI } from '../../api/client';
import useAuthStore from '../../store/authStore';
import toast from 'react-hot-toast';
import { clsx } from 'clsx';
import dayjs from 'dayjs';

const PLANNERS = ['project_manager', 'site_engineer', 'admin', 'super_admin'];

// ── Custom tooltip for S-curve ──────────────────────────────────────────────
function SCurveTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-slate-200 rounded-lg p-3 shadow-lg text-xs">
      <div className="font-medium text-slate-900 mb-1.5">{dayjs(label).format('DD MMM YYYY')}</div>
      {payload.map(p => (
        <div key={p.dataKey} className="flex items-center gap-2 mb-0.5">
          <span className="w-2 h-2 rounded-full inline-block" style={{ background: p.color }} />
          <span className="text-slate-500">{p.name}:</span>
          <span className="font-medium text-black">{p.value ?? '—'}%</span>
        </div>
      ))}
    </div>
  );
}

// ── Variance chip ────────────────────────────────────────────────────────────
function VarianceChip({ planned, actual }) {
  if (planned == null || actual == null) return <span className="text-slate-300 text-xs">—</span>;
  const diff = (actual - planned).toFixed(1);
  if (diff > 0)  return <span className="flex items-center gap-0.5 text-xs font-medium text-emerald-600"><ArrowUp className="w-3 h-3" />+{diff}%</span>;
  if (diff < 0)  return <span className="flex items-center gap-0.5 text-xs font-medium text-red-500"><ArrowDown className="w-3 h-3" />{diff}%</span>;
  return <span className="flex items-center gap-0.5 text-xs font-medium text-slate-400"><Minus className="w-3 h-3" />0%</span>;
}

export default function ProgressDashboard() {
  const qc = useQueryClient();
  const { user } = useAuthStore();
  const canRecord = PLANNERS.includes(user?.role);

  const [projectId, setProjectId] = useState('');
  const [showRecordModal, setShowRecordModal]   = useState(false);
  const [showSnapshotModal, setShowSnapshotModal] = useState(false);

  // ── Queries ──────────────────────────────────────────────────────────────
  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: () => projectAPI.list().then(r => r.data?.data ?? []),
  });

  const { data: scurve = [] } = useQuery({
    queryKey: ['planning-scurve', projectId],
    queryFn: () => planningAPI.getScurve({ project_id: projectId }).then(r => r.data?.data ?? r.data ?? []).catch(() => []),
    enabled: !!projectId,
  });

  const { data: activities = [] } = useQuery({
    queryKey: ['planning-activities', projectId],
    queryFn: () => planningAPI.listActivities({ project_id: projectId }).then(r => r.data?.data ?? r.data ?? []).catch(() => []),
    enabled: !!projectId,
  });

  const { data: progress = [] } = useQuery({
    queryKey: ['planning-progress', projectId],
    queryFn: () => planningAPI.listProgress({ project_id: projectId }).then(r => r.data?.data ?? r.data ?? []).catch(() => []),
    enabled: !!projectId,
  });

  // Latest progress per activity (most recent tracking_date)
  const latestByActivity = activities.map(a => {
    const entries = progress.filter(p => p.activity_id === a.id)
      .sort((x, y) => new Date(y.tracking_date) - new Date(x.tracking_date));
    const latest = entries[0];
    return {
      ...a,
      latest_planned_pct: latest?.planned_progress_pct ?? null,
      latest_actual_pct:  latest?.actual_progress_pct  ?? a.progress_pct ?? null,
      last_updated:       latest?.tracking_date ?? null,
    };
  });

  // ── Chart data ───────────────────────────────────────────────────────────
  const chartData = scurve
    .slice()
    .sort((a, b) => new Date(a.reporting_date) - new Date(b.reporting_date))
    .map(s => ({
      date:     s.reporting_date,
      Baseline: s.baseline_progress_pct != null ? +s.baseline_progress_pct : null,
      Actual:   s.actual_progress_pct   != null ? +s.actual_progress_pct   : null,
      Forecast: s.forecast_progress_pct != null ? +s.forecast_progress_pct : null,
    }));

  const latest = scurve.slice().sort((a, b) => new Date(b.reporting_date) - new Date(a.reporting_date))[0];

  return (
    <div className="p-6 md:p-8 max-w-6xl mx-auto min-h-screen bg-[#f4f6f9]">

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-900 font-medium mb-1">
            <TrendingUp className="w-3.5 h-3.5" /> Planning
          </div>
          <h1 className="text-2xl font-medium text-slate-900">Progress & S-Curve</h1>
          <p className="text-sm text-slate-900 font-medium mt-0.5">Baseline vs actual vs forecast cumulative progress</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={projectId}
            onChange={e => setProjectId(e.target.value)}
            className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-400 shadow-sm w-64"
          >
            <option value="">— Select project —</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          {projectId && canRecord && (
            <>
              <button
                onClick={() => setShowSnapshotModal(true)}
                className="px-3 py-2 border border-indigo-200 text-indigo-600 text-sm font-medium rounded-lg hover:bg-indigo-50 flex items-center gap-1.5"
              >
                <Camera className="w-4 h-4" /> Snapshot
              </button>
              <button
                onClick={() => setShowRecordModal(true)}
                className="px-3 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4" /> Record Progress
              </button>
            </>
          )}
        </div>
      </div>

      {!projectId ? (
        <div className="bg-white border border-slate-200 rounded-xl p-16 text-center shadow-sm">
          <TrendingUp className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-900 font-medium font-medium">Select a project to view progress & S-curve</p>
        </div>
      ) : (
        <>
          {/* Latest snapshot KPIs */}
          {latest && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
              {[
                { label: 'Baseline',  value: latest.baseline_progress_pct, color: 'text-blue-600',   dot: 'bg-blue-400' },
                { label: 'Actual',    value: latest.actual_progress_pct,   color: 'text-indigo-600', dot: 'bg-indigo-500' },
                { label: 'Forecast',  value: latest.forecast_progress_pct, color: 'text-amber-600',  dot: 'bg-amber-400' },
                {
                  label: 'Variance',
                  value: latest.schedule_variance != null
                    ? `${latest.schedule_variance > 0 ? '+' : ''}${latest.schedule_variance}d`
                    : null,
                  color: (latest.schedule_variance ?? 0) > 0 ? 'text-red-600' : 'text-emerald-600',
                  dot:   (latest.schedule_variance ?? 0) > 0 ? 'bg-red-400'   : 'bg-emerald-400',
                },
              ].map(({ label, value, color, dot }) => (
                <div key={label} className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-slate-500">{label}</span>
                    <span className={clsx('w-2 h-2 rounded-full', dot)} />
                  </div>
                  <div className={clsx('text-2xl font-bold', color)}>
                    {value != null ? `${value}%` : '—'}
                  </div>
                  <div className="text-xs text-slate-900 font-medium mt-0.5">as of {dayjs(latest.reporting_date).format('DD MMM YYYY')}</div>
                </div>
              ))}
            </div>
          )}

          {/* S-Curve Chart */}
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-5 mb-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-medium text-black">S-Curve Chart</h2>
              <div className="flex items-center gap-4 text-xs text-slate-500">
                <span className="flex items-center gap-1.5"><span className="w-6 border-t-2 border-dashed border-blue-400 inline-block" /> Baseline</span>
                <span className="flex items-center gap-1.5"><span className="w-6 border-t-2 border-indigo-600 inline-block" /> Actual</span>
                <span className="flex items-center gap-1.5"><span className="w-6 border-t-2 border-dashed border-amber-400 inline-block" /> Forecast</span>
              </div>
            </div>
            {chartData.length === 0 ? (
              <div className="h-48 flex flex-col items-center justify-center text-slate-400">
                <AlertTriangle className="w-8 h-8 mb-2 text-slate-300" />
                <p className="text-sm">No S-curve data yet. Take a snapshot to start tracking.</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 11, fill: '#94a3b8' }}
                    tickFormatter={d => dayjs(d).format('DD MMM')}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: '#94a3b8' }}
                    domain={[0, 100]}
                    tickFormatter={v => `${v}%`}
                  />
                  <Tooltip content={<SCurveTooltip />} />
                  <ReferenceLine y={100} stroke="#e2e8f0" strokeDasharray="4 4" />
                  <Line
                    type="monotone" dataKey="Baseline" name="Baseline"
                    stroke="#60a5fa" strokeWidth={2} strokeDasharray="5 5"
                    dot={false} connectNulls
                  />
                  <Line
                    type="monotone" dataKey="Actual" name="Actual"
                    stroke="#4f46e5" strokeWidth={2.5}
                    dot={{ r: 3, fill: '#4f46e5', strokeWidth: 0 }} connectNulls
                  />
                  <Line
                    type="monotone" dataKey="Forecast" name="Forecast"
                    stroke="#fbbf24" strokeWidth={2} strokeDasharray="5 5"
                    dot={false} connectNulls
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Activity Progress Table */}
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-sm font-medium text-black">Activity Progress</h2>
              <span className="text-xs text-slate-400">{latestByActivity.length} activities</span>
            </div>
            {latestByActivity.length === 0 ? (
              <div className="py-12 text-center text-xs text-slate-400">No activities found for this project</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 text-left">
                      {['Activity', 'Status', 'Planned %', 'Actual %', 'Variance', 'Progress Bar', 'Last Updated'].map(h => (
                        <th key={h} className="px-4 py-3 text-xs font-medium text-slate-900 font-medium uppercase tracking-wide whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {latestByActivity.map(a => {
                      const actual  = a.latest_actual_pct;
                      const planned = a.latest_planned_pct;
                      const diff    = actual != null && planned != null ? actual - planned : null;
                      const barColor = diff == null ? 'bg-indigo-500'
                                     : diff >= 0   ? 'bg-emerald-500'
                                     :               'bg-red-500';
                      return (
                        <tr key={a.id} className="hover:bg-slate-50 transition-colors">
                          <td className="px-4 py-3">
                            <div className="font-medium text-slate-900 font-medium text-xs">{a.activity_name}</div>
                            <div className="text-[11px] text-slate-400">{a.activity_code}</div>
                          </td>
                          <td className="px-4 py-3">
                            <StatusBadge status={a.status} />
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-600">
                            {planned != null ? `${planned}%` : '—'}
                          </td>
                          <td className="px-4 py-3 text-xs font-medium text-black">
                            {actual != null ? `${actual}%` : '—'}
                          </td>
                          <td className="px-4 py-3">
                            <VarianceChip planned={planned} actual={actual} />
                          </td>
                          <td className="px-4 py-3 min-w-[120px]">
                            <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                              <div
                                className={clsx('h-full rounded-full transition-all', barColor)}
                                style={{ width: `${Math.min(actual ?? 0, 100)}%` }}
                              />
                            </div>
                            <div className="text-[10px] text-slate-900 font-medium mt-0.5">{actual ?? 0}%</div>
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-400">
                            {a.last_updated ? dayjs(a.last_updated).format('DD MMM YYYY') : '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* Record Progress Modal */}
      {showRecordModal && (
        <RecordProgressModal
          projectId={projectId}
          activities={activities}
          onClose={() => setShowRecordModal(false)}
          onSuccess={() => {
            qc.invalidateQueries({ queryKey: ['planning-progress'] });
            qc.invalidateQueries({ queryKey: ['planning-activities'] });
            setShowRecordModal(false);
          }}
        />
      )}

      {/* Snapshot Modal */}
      {showSnapshotModal && (
        <SnapshotModal
          projectId={projectId}
          onClose={() => setShowSnapshotModal(false)}
          onSuccess={() => {
            qc.invalidateQueries({ queryKey: ['planning-scurve'] });
            setShowSnapshotModal(false);
          }}
        />
      )}
    </div>
  );
}

// ── Status Badge ────────────────────────────────────────────────────────────
const STATUS_CFG = {
  planned:      'bg-slate-100 text-slate-600',
  in_progress:  'bg-blue-50 text-blue-700',
  delayed:      'bg-red-50 text-red-700',
  completed:    'bg-emerald-50 text-emerald-700',
  cancelled:    'bg-gray-100 text-gray-500',
};
function StatusBadge({ status }) {
  const label = status?.replace('_', ' ') ?? 'unknown';
  return (
    <span className={clsx('text-[10px] px-2 py-0.5 rounded-md font-medium capitalize', STATUS_CFG[status] || 'bg-slate-100 text-slate-500')}>
      {label}
    </span>
  );
}

// ── Record Progress Modal ───────────────────────────────────────────────────
function RecordProgressModal({ projectId, activities, onClose, onSuccess }) {
  const [form, setForm] = useState({
    activity_id: '',
    tracking_date: dayjs().format('YYYY-MM-DD'),
    planned_progress_pct: '',
    actual_progress_pct: '',
    planned_qty: '',
    actual_qty: '',
    planned_manpower: '',
    actual_manpower: '',
    remarks: '',
  });

  const mut = useMutation({
    mutationFn: d => planningAPI.recordProgress(d),
    onSuccess: () => { toast.success('Progress recorded'); onSuccess(); },
    onError: e => toast.error(e?.response?.data?.error || 'Failed to save'),
  });

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = () => {
    if (!form.activity_id) return toast.error('Select an activity');
    if (!form.actual_progress_pct) return toast.error('Enter actual progress %');
    mut.mutate({ ...form, project_id: projectId });
  };

  return (
    <Modal title="Record Progress" onClose={onClose}>
      <div className="space-y-4">
        <div>
          <label className="lbl">Activity *</label>
          <select className="inp" value={form.activity_id} onChange={e => set('activity_id', e.target.value)}>
            <option value="">— Select activity —</option>
            {activities.map(a => <option key={a.id} value={a.id}>{a.activity_code} — {a.activity_name}</option>)}
          </select>
        </div>
        <div>
          <label className="lbl">Tracking Date *</label>
          <input type="date" className="inp" value={form.tracking_date} onChange={e => set('tracking_date', e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="lbl">Planned Progress %</label>
            <input type="number" className="inp" placeholder="0–100" value={form.planned_progress_pct} onChange={e => set('planned_progress_pct', e.target.value)} />
          </div>
          <div>
            <label className="lbl">Actual Progress % *</label>
            <input type="number" className="inp" placeholder="0–100" value={form.actual_progress_pct} onChange={e => set('actual_progress_pct', e.target.value)} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="lbl">Planned Qty</label>
            <input type="number" className="inp" placeholder="0.00" value={form.planned_qty} onChange={e => set('planned_qty', e.target.value)} />
          </div>
          <div>
            <label className="lbl">Actual Qty</label>
            <input type="number" className="inp" placeholder="0.00" value={form.actual_qty} onChange={e => set('actual_qty', e.target.value)} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="lbl">Planned Manpower</label>
            <input type="number" className="inp" placeholder="Workers" value={form.planned_manpower} onChange={e => set('planned_manpower', e.target.value)} />
          </div>
          <div>
            <label className="lbl">Actual Manpower</label>
            <input type="number" className="inp" placeholder="Workers" value={form.actual_manpower} onChange={e => set('actual_manpower', e.target.value)} />
          </div>
        </div>
        <div>
          <label className="lbl">Remarks</label>
          <textarea className="inp" rows={2} placeholder="Notes for this tracking entry…" value={form.remarks} onChange={e => set('remarks', e.target.value)} />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-900 hover:bg-slate-50">Cancel</button>
          <button onClick={handleSubmit} disabled={mut.isPending} className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-1.5">
            <Save className="w-3.5 h-3.5" /> {mut.isPending ? 'Saving…' : 'Save Progress'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ── Snapshot Modal ──────────────────────────────────────────────────────────
function SnapshotModal({ projectId, onClose, onSuccess }) {
  const [form, setForm] = useState({
    reporting_date: dayjs().format('YYYY-MM-DD'),
    baseline_progress_pct: '',
    actual_progress_pct: '',
    forecast_progress_pct: '',
    forecast_completion_date: '',
    schedule_variance: '',
  });

  const mut = useMutation({
    mutationFn: d => planningAPI.snapshotScurve(d),
    onSuccess: () => { toast.success('Snapshot recorded'); onSuccess(); },
    onError: e => toast.error(e?.response?.data?.error || 'Failed to save snapshot'),
  });

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  return (
    <Modal title="Record S-Curve Snapshot" onClose={onClose}>
      <div className="space-y-4">
        <div>
          <label className="lbl">Reporting Date *</label>
          <input type="date" className="inp" value={form.reporting_date} onChange={e => set('reporting_date', e.target.value)} />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="lbl">Baseline %</label>
            <input type="number" className="inp" placeholder="0–100" value={form.baseline_progress_pct} onChange={e => set('baseline_progress_pct', e.target.value)} />
          </div>
          <div>
            <label className="lbl">Actual % *</label>
            <input type="number" className="inp" placeholder="0–100" value={form.actual_progress_pct} onChange={e => set('actual_progress_pct', e.target.value)} />
          </div>
          <div>
            <label className="lbl">Forecast %</label>
            <input type="number" className="inp" placeholder="0–100" value={form.forecast_progress_pct} onChange={e => set('forecast_progress_pct', e.target.value)} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="lbl">Forecast Completion</label>
            <input type="date" className="inp" value={form.forecast_completion_date} onChange={e => set('forecast_completion_date', e.target.value)} />
          </div>
          <div>
            <label className="lbl">Schedule Variance (days)</label>
            <input type="number" className="inp" placeholder="+/- days" value={form.schedule_variance} onChange={e => set('schedule_variance', e.target.value)} />
          </div>
        </div>
        <p className="text-xs text-slate-400">Positive variance = behind schedule, negative = ahead</p>
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-900 hover:bg-slate-50">Cancel</button>
          <button
            onClick={() => {
              if (!form.actual_progress_pct) return toast.error('Enter actual progress %');
              mut.mutate({ ...form, project_id: projectId });
            }}
            disabled={mut.isPending}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-1.5"
          >
            <Camera className="w-3.5 h-3.5" /> {mut.isPending ? 'Saving…' : 'Save Snapshot'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ── Shared Modal wrapper ────────────────────────────────────────────────────
function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h2 className="text-sm font-medium text-black">{title}</h2>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors">
            <X className="w-4 h-4 text-slate-500" />
          </button>
        </div>
        <div className="p-5">
          <style>{`.inp{display:block;width:100%;padding:0.5rem 0.75rem;font-size:0.875rem;background:#fff;border:1px solid #e2e8f0;border-radius:0.5rem;outline:none;color:#1e293b}.inp:focus{border-color:#6366f1}.lbl{display:block;font-size:0.75rem;font-weight:600;color:#64748b;margin-bottom:0.25rem;text-transform:uppercase;letter-spacing:0.025em}`}</style>
          {children}
        </div>
      </div>
    </div>
  );
}
