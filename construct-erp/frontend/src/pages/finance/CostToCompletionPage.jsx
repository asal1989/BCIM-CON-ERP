// src/pages/finance/CostToCompletionPage.jsx
import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Target, TrendingUp, TrendingDown, Wallet, Clock, Gauge, AlertTriangle,
  FileText, ClipboardList, FileSignature, Download, ChevronRight, Info,
} from 'lucide-react';
import {
  ResponsiveContainer, LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip, Legend,
} from 'recharts';
import { analyticsAPI, projectAPI } from '../../api/client';
import { clsx } from 'clsx';
import { useNavigate } from 'react-router-dom';
import FinanceActionBar from '../../components/finance/FinanceActionBar';

const NAVY = '#0B2E59';
const COLORS = { indigo: '#4F46E5', emerald: '#10B981', amber: '#F59E0B', red: '#EF4444', blue: '#3B82F6', slate: '#64748B' };

const num = (v) => parseFloat(v) || 0;
const inr = (v) => `₹${Math.round(num(v)).toLocaleString('en-IN')}`;
const inrCompact = (v) => {
  const n = num(v);
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 1e7) return `${sign}₹${(abs / 1e7).toFixed(2)} Cr`;
  if (abs >= 1e5) return `${sign}₹${(abs / 1e5).toFixed(2)} L`;
  return `${sign}₹${Math.round(abs).toLocaleString('en-IN')}`;
};
const pct = (v) => `${num(v).toFixed(1)}%`;

export default function CostToCompletionPage() {
  const navigate = useNavigate();
  const [projectId, setProjectId] = useState('');

  const { data: projects } = useQuery({
    queryKey: ['projects'],
    queryFn: () => projectAPI.list().then(r => r.data?.data ?? r.data ?? []).catch(() => []),
  });

  const { data: ctc, isLoading } = useQuery({
    queryKey: ['cost-to-completion', projectId],
    queryFn: () => analyticsAPI.costToCompletion(projectId).then(r => r.data?.data ?? null),
    enabled: !!projectId,
  });

  return (
    <div className="p-6 bg-slate-50 min-h-screen space-y-5 max-w-[1600px] mx-auto">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-indigo-50 flex items-center justify-center border border-indigo-100">
            <Target className="w-6 h-6 text-indigo-600" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-slate-900">Cost to Completion</h1>
            <p className="text-xs text-slate-500 mt-0.5">Approved Budget → Actual → Committed → Estimate at Completion → Variance</p>
          </div>
        </div>
        <FinanceActionBar
          compact
          showSearch={false}
          showDateRange={false}
          projectId={projectId || 'all'}
          onProjectChange={(v) => setProjectId(v === 'all' ? '' : v)}
          projectOptions={projects || []}
          projectLabel="Select Project..."
          data={[]}
          extraControls={ctc ? (
            <button
              onClick={() => window.print()}
              className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-lg bg-white border border-slate-200 text-slate-700 font-medium text-xs shadow-sm hover:bg-slate-50"
            >
              <Download size={14} /> Export
            </button>
          ) : null}
        />
      </div>

      {!projectId ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-16 text-center text-sm text-slate-400">
          Select a project to view its Cost to Completion statement.
        </div>
      ) : isLoading || !ctc ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[1, 2, 3, 4, 5, 6, 7, 8].map(i => <div key={i} className="h-28 bg-white rounded-2xl animate-pulse border border-slate-200" />)}
        </div>
      ) : (
        <CtcBody ctc={ctc} navigate={navigate} projectId={projectId} />
      )}
    </div>
  );
}

function CtcBody({ ctc, navigate, projectId }) {
  const p = ctc.project || {};
  const isOverrun = ctc.projected_variance < 0;

  return (
    <div className="space-y-5">
      {/* Project header strip */}
      <div className="bg-white border border-slate-200 rounded-2xl px-6 py-4 flex flex-wrap items-center gap-x-8 gap-y-2">
        <div>
          <div className="text-[10px] font-medium text-slate-400 uppercase tracking-wide">Project</div>
          <div className="text-sm font-semibold text-slate-900">{p.name}</div>
        </div>
        <Divider />
        <div>
          <div className="text-[10px] font-medium text-slate-400 uppercase tracking-wide">Project Code</div>
          <div className="text-sm font-medium text-slate-700">{p.project_code || '—'}</div>
        </div>
        <Divider />
        <div>
          <div className="text-[10px] font-medium text-slate-400 uppercase tracking-wide">Client</div>
          <div className="text-sm font-medium text-slate-700">{p.client_name || '—'}</div>
        </div>
        <Divider />
        <div>
          <div className="text-[10px] font-medium text-slate-400 uppercase tracking-wide">Contract Value</div>
          <div className="text-sm font-medium text-slate-700">{inrCompact(ctc.contract_value)}</div>
        </div>
        <Divider />
        <div>
          <div className="text-[10px] font-medium text-slate-400 uppercase tracking-wide">Project Period</div>
          <div className="text-sm font-medium text-slate-700">
            {p.start_date ? new Date(p.start_date).toLocaleDateString('en-IN') : '—'} – {p.end_date ? new Date(p.end_date).toLocaleDateString('en-IN') : '—'}
          </div>
        </div>
        <Divider />
        <div className="ml-auto">
          <span className={clsx('px-2.5 py-1 rounded-full text-[11px] font-semibold capitalize',
            p.status === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600')}>
            {p.status || 'unknown'}
          </span>
        </div>
      </div>

      {/* Top KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard label="Contract Value" value={inrCompact(ctc.contract_value)} icon={FileText} color={COLORS.slate} />
        <KpiCard label="Approved Budget" value={inrCompact(ctc.approved_budget)} icon={ClipboardList} color={COLORS.blue} />
        <KpiCard label="Actual Cost to Date" value={inrCompact(ctc.actual_cost)} icon={Wallet} color={COLORS.indigo} />
        <KpiCard label="Committed Cost" value={inrCompact(ctc.committed_cost)} icon={FileSignature} color={COLORS.amber}
          note="Approved POs + SC Work Orders not yet billed" />
        <KpiCard label="Remaining Cost (ETC)" value={inrCompact(ctc.remaining_cost)} icon={Clock} color={COLORS.amber} />
        <KpiCard label="Estimated Final Cost (EAC)" value={inrCompact(ctc.estimated_final_cost)} icon={Target} color={NAVY} big />
        <KpiCard label="Projected Variance" value={inrCompact(ctc.projected_variance)} icon={isOverrun ? TrendingDown : TrendingUp}
          color={isOverrun ? COLORS.red : COLORS.emerald} big
          sub={isOverrun ? 'over budget' : 'under budget'} />
        <KpiCard label="Cost Completion" value={pct(ctc.cost_completion_pct)} icon={Gauge} color={COLORS.indigo} />
      </div>

      {/* Progress vs Cost */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-slate-900">Physical Progress vs Cost Progress</h3>
          {ctc.cpi != null && (
            <span className={clsx('text-xs font-semibold px-2.5 py-1 rounded-full',
              ctc.cpi >= 1 ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700')}>
              CPI {ctc.cpi.toFixed(2)} {ctc.cpi >= 1 ? '(cost-efficient)' : '(overrunning)'}
            </span>
          )}
        </div>
        <div className="grid grid-cols-2 gap-8">
          <ProgressBar label="Physical Progress" value={ctc.physical_progress_pct} color={COLORS.indigo} />
          <ProgressBar label="Cost Progress" value={ctc.cost_completion_pct} color={ctc.cost_completion_pct > ctc.physical_progress_pct + 5 ? COLORS.red : COLORS.emerald} />
        </div>
        {ctc.cost_completion_pct > ctc.physical_progress_pct + 5 && (
          <p className="text-xs text-red-600 mt-3 flex items-center gap-1.5">
            <AlertTriangle size={13} /> Spending is ahead of physical progress — cost completion is {(ctc.cost_completion_pct - ctc.physical_progress_pct).toFixed(1)} pts higher than work done.
          </p>
        )}
      </div>

      {/* Cost Breakdown + Remaining Cost by Category */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-2xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900">Cost Breakdown by Category</h3>
            <span title="Budget per category is a proportional share of Approved Budget, weighted by actual spend — Budget Control has the full ~20-cost-head detail." className="text-slate-300 cursor-help">
              <Info size={13} />
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  {['Cost Head', 'Budget', 'Actual', 'Committed', 'ETC', 'EAC', 'Variance'].map(h => (
                    <th key={h} className={clsx('px-3 py-2.5 text-[11px] font-medium text-slate-400 whitespace-nowrap', h === 'Cost Head' ? 'text-left' : 'text-right')}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {ctc.buckets.map(b => (
                  <tr key={b.name} className="hover:bg-slate-50">
                    <td className="px-3 py-2.5 font-medium text-slate-800">{b.name}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-xs text-slate-700">{inrCompact(b.budget)}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-xs text-slate-700">{inrCompact(b.actual)}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-xs text-slate-500">{b.committed > 0 ? inrCompact(b.committed) : '—'}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-xs text-amber-600">{inrCompact(b.etc)}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-xs font-semibold text-slate-900">{inrCompact(b.eac)}</td>
                    <td className={clsx('px-3 py-2.5 text-right font-mono text-xs font-semibold', b.variance < 0 ? 'text-red-600' : 'text-emerald-600')}>
                      {b.variance < 0 ? '-' : '+'}{inrCompact(Math.abs(b.variance))}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-slate-50 border-t-2 border-slate-200 font-semibold">
                  <td className="px-3 py-2.5 text-slate-900">Total</td>
                  <td className="px-3 py-2.5 text-right font-mono text-xs">{inrCompact(ctc.approved_budget)}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-xs">{inrCompact(ctc.actual_cost)}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-xs">{inrCompact(ctc.committed_cost)}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-xs text-amber-600">{inrCompact(ctc.remaining_cost)}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-xs">{inrCompact(ctc.estimated_final_cost)}</td>
                  <td className={clsx('px-3 py-2.5 text-right font-mono text-xs', ctc.projected_variance < 0 ? 'text-red-600' : 'text-emerald-600')}>
                    {ctc.projected_variance < 0 ? '-' : '+'}{inrCompact(Math.abs(ctc.projected_variance))}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-5">
          <h3 className="text-sm font-semibold text-slate-900 mb-4">Remaining Cost by Category</h3>
          <div className="space-y-3">
            {[...ctc.buckets].filter(b => b.etc > 0).sort((a, b) => b.etc - a.etc).map(b => {
              const maxEtc = Math.max(...ctc.buckets.map(x => x.etc), 1);
              return (
                <div key={b.name}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="font-medium text-slate-700">{b.name}</span>
                    <span className="font-mono text-slate-500">{inrCompact(b.etc)}</span>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${(b.etc / maxEtc) * 100}%`, background: COLORS.amber }} />
                  </div>
                </div>
              );
            })}
            {ctc.buckets.every(b => b.etc <= 0) && <p className="text-xs text-slate-400">No remaining cost projected.</p>}
          </div>
        </div>
      </div>

      {/* Monthly trend */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5">
        <h3 className="text-sm font-semibold text-slate-900 mb-1">Budget vs Actual vs Forecast</h3>
        <p className="text-[11px] text-slate-400 mb-4">Cumulative, in ₹ Lakhs. Forecast shown at the current EAC for the latest period — no time-phased forecast data exists yet.</p>
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={ctc.monthlyTrend}>
            <CartesianGrid strokeDasharray="3 3" stroke="#EEF2F7" />
            <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#94A3B8' }} />
            <YAxis tick={{ fontSize: 11, fill: '#94A3B8' }} tickFormatter={(v) => `${v}L`} />
            <Tooltip formatter={(v) => `₹${v} L`} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Line type="monotone" dataKey="budget" name="Budget" stroke={COLORS.slate} strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="actual" name="Actual" stroke={COLORS.indigo} strokeWidth={2.5} dot={false} />
            <Line type="monotone" dataKey="forecast" name="Forecast" stroke={COLORS.amber} strokeWidth={2} strokeDasharray="5 4" dot={{ r: 3 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Risk / Alerts */}
      {ctc.riskAlerts.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-100 flex items-center gap-2">
            <AlertTriangle size={15} className="text-amber-500" />
            <h3 className="text-sm font-semibold text-slate-900">Cost / Schedule Risks</h3>
          </div>
          <div className="divide-y divide-slate-100">
            {ctc.riskAlerts.map((r, i) => (
              <div key={i} className="px-5 py-3 flex items-center gap-3 hover:bg-slate-50 cursor-pointer"
                onClick={() => r.to && navigate(r.to)}>
                <span className={clsx('w-1.5 h-1.5 rounded-full flex-shrink-0',
                  r.severity === 'high' || r.severity === 'critical' ? 'bg-red-500'
                  : r.severity === 'medium' ? 'bg-amber-500' : 'bg-blue-500')} />
                <span className="text-sm text-slate-700 flex-1">{r.label}</span>
                {r.category && <span className="text-[10px] text-slate-400 uppercase">{r.category}</span>}
                {r.to && <ChevronRight size={14} className="text-slate-300" />}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-wrap gap-2">
        <ActionButton label="View BOQ" onClick={() => navigate(`/qs/boq-budget-breakdown?project_id=${projectId}`)} />
        <ActionButton label="Cost Details (Budget Control)" onClick={() => navigate(`/qs/boq-budget-breakdown?project_id=${projectId}`)} />
        <ActionButton label="Commitments (POs)" onClick={() => navigate(`/procurement/po`)} />
        <ActionButton label="View Variations" onClick={() => navigate(`/qs/variations`)} />
        <ActionButton label="Project 360" onClick={() => navigate(`/reports/360?project_id=${projectId}`)} />
      </div>
    </div>
  );
}

function Divider() {
  return <div className="w-px h-8 bg-slate-100 hidden sm:block" />;
}

function KpiCard({ label, value, icon: Icon, color, note, sub, big }) {
  return (
    <div className={clsx('bg-white border border-slate-200 rounded-2xl p-4', big && 'ring-1 ring-slate-200')}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wide">{label}</span>
        <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: `${color}15` }}>
          <Icon size={14} style={{ color }} />
        </div>
      </div>
      <div className={clsx('font-semibold text-slate-900', big ? 'text-xl' : 'text-lg')}>{value}</div>
      {sub && <div className="text-[10px] text-slate-400 mt-0.5">{sub}</div>}
      {note && <div className="text-[9px] text-slate-300 mt-1 leading-tight">{note}</div>}
    </div>
  );
}

function ProgressBar({ label, value, color }) {
  return (
    <div>
      <div className="flex items-center justify-between text-xs mb-1.5">
        <span className="font-medium text-slate-700">{label}</span>
        <span className="font-mono font-semibold" style={{ color }}>{pct(value)}</span>
      </div>
      <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(value, 100)}%`, background: color }} />
      </div>
    </div>
  );
}

function ActionButton({ label, onClick }) {
  return (
    <button onClick={onClick}
      className="px-3.5 py-2 text-xs font-medium bg-white border border-slate-200 rounded-lg text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition-colors">
      {label}
    </button>
  );
}
