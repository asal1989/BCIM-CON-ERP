// P6 Dashboard — SPI, CPI, EVM, Critical Path, Risk, MRP alerts
import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  TrendingUp, TrendingDown, AlertTriangle, CheckCircle2, Zap,
  Flag, Package, Camera, RefreshCw, Activity,
} from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Legend,
} from 'recharts';
import { planningP6API, projectAPI } from '../../api/client';
import toast from 'react-hot-toast';
import dayjs from 'dayjs';
import { clsx } from 'clsx';

const fmt    = (v) => v != null ? Number(v).toLocaleString('en-IN', { maximumFractionDigits: 0 }) : '—';
const fmtC   = (v) => v != null ? `₹${Number(v).toLocaleString('en-IN', { maximumFractionDigits: 0 })}` : '—';
const fmtIdx = (v) => v != null ? Number(v).toFixed(3) : '—';
const fmtPct = (v) => v != null ? `${Number(v).toFixed(1)}%` : '—';

function IndexGauge({ label, value, thresholds = [0.85, 0.95, 1.05] }) {
  if (value == null) return (
    <div className="text-center">
      <div className="text-3xl font-bold text-slate-300">—</div>
      <div className="text-xs text-slate-400 mt-1">{label}</div>
    </div>
  );
  const v = parseFloat(value);
  const color = v >= thresholds[2] ? 'text-emerald-600'
              : v >= thresholds[1] ? 'text-blue-600'
              : v >= thresholds[0] ? 'text-amber-600' : 'text-red-600';
  const bg    = v >= thresholds[2] ? 'bg-emerald-50 border-emerald-200'
              : v >= thresholds[1] ? 'bg-blue-50 border-blue-200'
              : v >= thresholds[0] ? 'bg-amber-50 border-amber-200' : 'bg-red-50 border-red-200';
  const trend = v >= 1 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />;
  return (
    <div className={`border rounded-xl p-4 text-center ${bg}`}>
      <div className={`flex items-center justify-center gap-1 text-3xl font-bold ${color}`}>
        {trend} {fmtIdx(v)}
      </div>
      <div className="text-xs text-slate-500 mt-1">{label}</div>
      <div className={`text-xs font-medium mt-1 ${color}`}>
        {v >= thresholds[2] ? '▲ Ahead' : v >= thresholds[1] ? '● On Track' : v >= thresholds[0] ? '▼ Slight Risk' : '▼ Behind'}
      </div>
    </div>
  );
}

export default function P6Dashboard() {
  const qc = useQueryClient();
  const [projectId, setProjectId] = useState('');

  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: () => projectAPI.list().then(r => r.data?.data ?? []),
  });

  const { data: dash, isLoading } = useQuery({
    queryKey: ['p6-dashboard', projectId],
    queryFn: () => planningP6API.p6Dashboard({ project_id: projectId }).then(r => r.data?.data ?? r.data ?? {}).catch(() => ({})),
    enabled: !!projectId,
    refetchInterval: 60000,
  });

  const snapshotMut = useMutation({
    mutationFn: () => planningP6API.snapshotEVM({ project_id: projectId }),
    onSuccess: () => { toast.success('EVM snapshot saved'); qc.invalidateQueries({ queryKey: ['p6-dashboard'] }); },
    onError: e => toast.error(e?.response?.data?.error || 'Failed'),
  });

  const cpmMut = useMutation({
    mutationFn: () => planningP6API.calculateCPM({ project_id: projectId }),
    onSuccess: (d) => {
      toast.success(`CPM calculated — ${d.data.data?.critical_count||0} critical activities`);
      qc.invalidateQueries({ queryKey: ['p6-dashboard'] });
    },
    onError: e => toast.error(e?.response?.data?.error || 'CPM failed'),
  });

  const evm  = dash?.evm;
  const acts = dash?.activities;
  const mils = dash?.milestones;

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto min-h-screen bg-[#f4f6f9]">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-500 font-medium mb-1">
            <Activity className="w-3.5 h-3.5" /> P6 Planning
          </div>
          <h1 className="text-2xl font-semibold text-slate-900">P6 Planning Dashboard</h1>
          <p className="text-sm text-slate-500 mt-0.5">EVM · CPM · Risk · MRP — all in one view</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select value={projectId} onChange={e => setProjectId(e.target.value)}
            className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none w-72 shadow-sm">
            <option value="">— Select project —</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          {projectId && (<>
            <button onClick={() => cpmMut.mutate()} disabled={cpmMut.isPending}
              className="flex items-center gap-1.5 px-3 py-2 border bg-white rounded-lg text-sm hover:bg-slate-50 shadow-sm disabled:opacity-50">
              <Zap className="w-4 h-4 text-yellow-500" /> {cpmMut.isPending ? 'Calculating…' : 'Run CPM'}
            </button>
            <button onClick={() => snapshotMut.mutate()} disabled={snapshotMut.isPending}
              className="flex items-center gap-1.5 px-3 py-2 border bg-white rounded-lg text-sm hover:bg-slate-50 shadow-sm disabled:opacity-50">
              <Camera className="w-4 h-4 text-indigo-500" /> {snapshotMut.isPending ? 'Saving…' : 'EVM Snapshot'}
            </button>
          </>)}
        </div>
      </div>

      {!projectId ? (
        <div className="bg-white border border-slate-200 rounded-xl p-20 text-center shadow-sm">
          <Activity className="w-12 h-12 text-slate-200 mx-auto mb-4" />
          <p className="text-slate-500 font-medium">Select a project to view P6 Dashboard</p>
        </div>
      ) : isLoading ? (
        <div className="text-center py-20 text-slate-400">
          <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2" />Loading…
        </div>
      ) : dash && (
        <div className="space-y-6">

          {/* EVM Index Row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <IndexGauge label="Schedule Performance Index (SPI)" value={evm?.spi} />
            <IndexGauge label="Cost Performance Index (CPI)"     value={evm?.cpi} />
            <div className="border rounded-xl p-4 bg-white text-center">
              <div className="text-3xl font-bold text-indigo-600">{fmtPct(evm?.percent_complete)}</div>
              <div className="text-xs text-slate-400 mt-1">% Complete (EVM)</div>
            </div>
            <div className={clsx('border rounded-xl p-4 text-center',
              acts?.delayed > 0 ? 'bg-red-50 border-red-200' : 'bg-emerald-50 border-emerald-200')}>
              <div className={`text-3xl font-bold ${acts?.delayed > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                {acts?.delayed || 0}
              </div>
              <div className="text-xs text-slate-400 mt-1">Delayed Activities</div>
            </div>
          </div>

          {/* EVM Financials */}
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
            <div className="px-5 py-3.5 border-b bg-slate-50 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-black">Earned Value Metrics</h2>
              <span className="text-xs text-slate-400">BAC = {fmtC(evm?.bac)}</span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 divide-x">
              {[
                { label:'PV (Planned)',   value: fmtC(evm?.pv),  sub:'BCWS' },
                { label:'EV (Earned)',    value: fmtC(evm?.ev),  sub:'BCWP' },
                { label:'AC (Actual)',    value: fmtC(evm?.ac),  sub:'ACWP' },
                { label:'SV',            value: fmtC(evm?.sv),  sub:`${evm?.sv >= 0 ? '▲ Ahead' : '▼ Behind'}`, neg: evm?.sv < 0 },
                { label:'CV',            value: fmtC(evm?.cv),  sub:`${evm?.cv >= 0 ? '▲ Saving' : '▼ Overrun'}`, neg: evm?.cv < 0 },
                { label:'EAC',           value: fmtC(evm?.eac), sub:'Estimate at Completion' },
                { label:'VAC',           value: fmtC(evm?.vac), sub:'Variance at Completion', neg: evm?.vac < 0 },
              ].map(item => (
                <div key={item.label} className="p-4 text-center">
                  <div className={`text-sm font-bold ${item.neg ? 'text-red-600' : 'text-black'}`}>{item.value}</div>
                  <div className="text-[10px] font-medium text-slate-500 mt-0.5 uppercase">{item.label}</div>
                  <div className="text-[10px] text-slate-400 mt-0.5">{item.sub}</div>
                </div>
              ))}
            </div>
          </div>

          {/* EVM History Chart + Activity Breakdown */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-5">
              <h3 className="text-sm font-semibold text-black mb-4">EVM Trend (PV · EV · AC)</h3>
              {dash.evm_history?.length ? (
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={dash.evm_history} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="snapshot_date" tick={{ fontSize: 10 }}
                      tickFormatter={d => dayjs(d).format('DD/MM')} />
                    <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `₹${(v/1000).toFixed(0)}K`} />
                    <Tooltip formatter={(v) => [`₹${Number(v).toLocaleString()}`, '']}
                      labelFormatter={d => dayjs(d).format('DD MMM YYYY')} />
                    <Legend iconSize={10} />
                    <Line type="monotone" dataKey="planned_value" stroke="#6366f1" strokeWidth={2} dot={false} name="PV" />
                    <Line type="monotone" dataKey="earned_value"  stroke="#22c55e" strokeWidth={2} dot={false} name="EV" />
                    <Line type="monotone" dataKey="actual_cost"   stroke="#ef4444" strokeWidth={2} dot={false} name="AC" />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="text-center py-10 text-slate-400 text-sm">
                  No EVM history yet. Click "EVM Snapshot" to record current values.
                </div>
              )}
            </div>

            <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-5">
              <h3 className="text-sm font-semibold text-black mb-4">Activity Status</h3>
              {acts && (
                <div className="space-y-3">
                  {Object.entries(acts.breakdown || {}).map(([status, count], i) => {
                    const total = acts.total || 1;
                    const pct   = Math.round((count / total) * 100);
                    const colors = {
                      planned:'bg-slate-300', in_progress:'bg-indigo-500',
                      completed:'bg-emerald-500', delayed:'bg-red-500', cancelled:'bg-slate-200',
                    };
                    return (
                      <div key={status}>
                        <div className="flex justify-between text-xs text-slate-600 mb-1">
                          <span className="capitalize">{status.replace('_',' ')}</span>
                          <span className="font-medium">{count} ({pct}%)</span>
                        </div>
                        <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${colors[status]||'bg-slate-300'}`}
                            style={{ width:`${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                  <div className="pt-3 border-t border-slate-100 flex justify-between text-xs">
                    <span className="text-slate-500">Critical Path Activities</span>
                    <span className="font-bold text-red-600">{acts.critical}</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Upcoming Milestones + Risk + MRP */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {/* Milestones */}
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b bg-slate-50 flex items-center gap-2">
                <Flag className="w-4 h-4 text-indigo-500" />
                <h3 className="text-sm font-semibold text-black">
                  Upcoming Milestones {mils?.overdue > 0 && (
                    <span className="ml-2 text-xs bg-red-100 text-red-700 px-1.5 py-0.5 rounded font-medium">
                      {mils.overdue} overdue
                    </span>
                  )}
                </h3>
              </div>
              <div className="divide-y divide-slate-50">
                {(mils?.upcoming || []).map(m => {
                  const days = dayjs(m.target_date).diff(dayjs(), 'day');
                  return (
                    <div key={m.id} className="px-4 py-3 flex items-center justify-between">
                      <div>
                        <div className="text-xs font-medium text-black truncate max-w-[160px]">{m.milestone_name}</div>
                        <div className="text-[10px] text-slate-400">{m.milestone_code}</div>
                      </div>
                      <div className={clsx('text-xs font-semibold',
                        days < 0 ? 'text-red-600' : days <= 7 ? 'text-amber-600' : 'text-slate-500')}>
                        {days < 0 ? `${Math.abs(days)}d late` : days === 0 ? 'Today' : `${days}d`}
                      </div>
                    </div>
                  );
                })}
                {!mils?.upcoming?.length && (
                  <div className="px-4 py-8 text-center text-xs text-slate-400">No upcoming milestones</div>
                )}
              </div>
            </div>

            {/* Risk */}
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-5">
              <h3 className="text-sm font-semibold text-black mb-3 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-orange-500" /> Risk Summary
              </h3>
              {dash.risks && (
                <div className="space-y-2">
                  {[
                    { level:'critical', label:'Critical', cls:'bg-red-100 text-red-700' },
                    { level:'high',     label:'High',     cls:'bg-orange-100 text-orange-700' },
                    { level:'medium',   label:'Medium',   cls:'bg-yellow-100 text-yellow-700' },
                    { level:'low',      label:'Low',      cls:'bg-green-100 text-green-700' },
                  ].map(r => (
                    <div key={r.level} className={`flex items-center justify-between px-3 py-2 rounded-lg ${r.cls}`}>
                      <span className="text-xs font-medium">{r.label}</span>
                      <span className="text-sm font-bold">{dash.risks[r.level] || 0}</span>
                    </div>
                  ))}
                  <div className="pt-2 border-t border-slate-100 flex justify-between text-xs text-slate-500">
                    <span>Total Risks</span>
                    <span className="font-bold">{dash.risks.total || 0}</span>
                  </div>
                </div>
              )}
            </div>

            {/* MRP */}
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-5">
              <h3 className="text-sm font-semibold text-black mb-3 flex items-center gap-2">
                <Package className="w-4 h-4 text-blue-500" /> Material Status
              </h3>
              <div className="text-center py-4">
                <div className={clsx('text-4xl font-bold',
                  dash.mrp?.shortage_items > 0 ? 'text-red-600' : 'text-emerald-600')}>
                  {dash.mrp?.shortage_items || 0}
                </div>
                <div className="text-sm text-slate-500 mt-1">
                  {dash.mrp?.shortage_items > 0
                    ? 'Materials pending order'
                    : 'All materials ordered ✓'}
                </div>
              </div>
              {dash.baseline && (
                <div className="mt-4 p-3 bg-indigo-50 rounded-lg text-xs">
                  <div className="font-medium text-indigo-700">Active Baseline</div>
                  <div className="text-indigo-600 mt-0.5">{dash.baseline.baseline_name}</div>
                  <div className="text-indigo-400">{dayjs(dash.baseline.snapshot_date).format('DD MMM YYYY')}</div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
