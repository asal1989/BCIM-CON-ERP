// src/pages/finance/CostToCompletionPage.jsx
import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  Target, TrendingUp, TrendingDown, Wallet, Clock, Gauge, AlertTriangle,
  FileText, ClipboardList, FileSignature, Download, ChevronRight, Info, X,
  Plus, RefreshCw, Edit3, CheckCircle2, XCircle, Loader2,
} from 'lucide-react';
import {
  ResponsiveContainer, LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip, Legend,
  PieChart, Pie, Cell,
} from 'recharts';
import { analyticsAPI, projectAPI, costForecastAPI } from '../../api/client';
import { clsx } from 'clsx';
import { useNavigate } from 'react-router-dom';
import FinanceActionBar from '../../components/finance/FinanceActionBar';
import useAuthStore from '../../store/authStore';

const NAVY = '#0B2E59';
const COLORS = { indigo: '#4F46E5', emerald: '#10B981', amber: '#F59E0B', red: '#EF4444', blue: '#3B82F6', slate: '#64748B', violet: '#8B5CF6' };
const DONUT_COLORS = [COLORS.indigo, COLORS.emerald, COLORS.amber, COLORS.blue, COLORS.violet, COLORS.slate, '#EC4899', '#0EA5E9'];

// Role gates — mirrors the ERP's existing role names (see other approval
// engines in this app, e.g. mrsApprovalStages / scBillApprovalStages).
const PM_ROLES        = ['project_manager', 'project_head', 'super_admin', 'admin'];
const DIRECTOR_ROLES  = ['project_head', 'managing_director', 'director', 'super_admin', 'admin'];
const RISK_EDIT_ROLES = ['project_manager', 'qs_engineer', 'project_head', 'managing_director', 'super_admin', 'admin'];
const FORECAST_ROLES  = ['project_manager', 'qs_engineer', 'project_head', 'super_admin', 'admin'];

const FORECAST_REASONS = [
  'Quantity Change', 'Rate Change', 'Productivity Change', 'Schedule Delay',
  'Material Price Increase', 'Subcontract Change', 'Design Change', 'Client Variation', 'Other',
];

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
const pct = (v) => (v == null ? '—' : `${num(v).toFixed(1)}%`);
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-IN') : '—');
const fmtDateTime = (d) => (d ? new Date(d).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '—');

export default function CostToCompletionPage() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [projectId, setProjectId] = useState('');
  const [drawer, setDrawer] = useState(null); // { type: 'actual'|'committed'|'costhead', costHead? }
  const [showForecastModal, setShowForecastModal] = useState(null); // cost_head or null
  const [showRiskModal, setShowRiskModal] = useState(null); // risk object (edit) or 'new' or null
  const qc = useQueryClient();
  const role = String(user?.role || '').toLowerCase();

  const { data: projects } = useQuery({
    queryKey: ['projects'],
    queryFn: () => projectAPI.list().then(r => r.data?.data ?? r.data ?? []).catch(() => []),
  });

  const { data: ctc, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['cost-to-completion', projectId],
    queryFn: () => analyticsAPI.costToCompletion(projectId).then(r => r.data?.data ?? null),
    enabled: !!projectId,
  });

  const { data: forecastItems, refetch: refetchForecast } = useQuery({
    queryKey: ['ctc-forecast', projectId],
    queryFn: () => costForecastAPI.listForecast(projectId).then(r => r.data?.data ?? []),
    enabled: !!projectId,
  });

  const { data: forecastHistory } = useQuery({
    queryKey: ['ctc-forecast-history', projectId],
    queryFn: () => costForecastAPI.forecastHistory(projectId).then(r => r.data?.data ?? []),
    enabled: !!projectId,
  });

  const { data: costRisks, refetch: refetchRisks } = useQuery({
    queryKey: ['ctc-risks', projectId],
    queryFn: () => costForecastAPI.listRisks(projectId).then(r => r.data?.data ?? []),
    enabled: !!projectId,
  });

  const refreshAll = () => { refetch(); refetchForecast(); refetchRisks(); qc.invalidateQueries({ queryKey: ['ctc-forecast-history', projectId] }); };

  const exportMutation = useMutation({
    mutationFn: () => costForecastAPI.exportExcel(projectId),
    onSuccess: (res) => {
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = `CTC_${ctc?.project?.project_code || projectId}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    },
    onError: () => toast.error('Export failed'),
  });

  const canEditForecast = FORECAST_ROLES.includes(role);
  const canEditRisk = RISK_EDIT_ROLES.includes(role);

  return (
    <div className="p-6 bg-slate-50 min-h-screen space-y-5 max-w-[1700px] mx-auto">
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
            <div className="flex items-center gap-2">
              <button onClick={() => refreshAll()} disabled={isFetching}
                className="inline-flex items-center gap-1.5 px-3 py-2.5 rounded-lg bg-white border border-slate-200 text-slate-700 font-medium text-xs shadow-sm hover:bg-slate-50 disabled:opacity-50">
                <RefreshCw size={13} className={isFetching ? 'animate-spin' : ''} /> Refresh
              </button>
              <button onClick={() => exportMutation.mutate()} disabled={exportMutation.isPending}
                className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-lg bg-white border border-slate-200 text-slate-700 font-medium text-xs shadow-sm hover:bg-slate-50 disabled:opacity-50">
                {exportMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />} Export Excel
              </button>
            </div>
          ) : null}
        />
      </div>

      {!projectId ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-16 text-center text-sm text-slate-400">
          Select a project to view its Cost to Completion statement.
        </div>
      ) : isError ? (
        <div className="bg-white border border-red-200 rounded-2xl p-16 text-center">
          <p className="text-sm text-red-600 mb-3">Couldn't load the Cost to Completion statement.</p>
          <button onClick={() => refetch()} className="px-4 py-2 text-xs font-medium bg-red-50 text-red-700 rounded-lg hover:bg-red-100">Retry</button>
        </div>
      ) : isLoading || !ctc ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[1, 2, 3, 4, 5, 6, 7, 8].map(i => <div key={i} className="h-28 bg-white rounded-2xl animate-pulse border border-slate-200" />)}
        </div>
      ) : (
        <CtcBody
          ctc={ctc} navigate={navigate} projectId={projectId}
          forecastItems={forecastItems || []} forecastHistory={forecastHistory || []}
          costRisks={costRisks || []}
          canEditForecast={canEditForecast} canEditRisk={canEditRisk}
          canReview={PM_ROLES.includes(role)} canApprove={DIRECTOR_ROLES.includes(role)}
          onDrill={setDrawer}
          onForecast={setShowForecastModal}
          onRisk={setShowRiskModal}
          refreshAll={refreshAll}
        />
      )}

      {drawer && (
        <DrilldownDrawer drawer={drawer} projectId={projectId} onClose={() => setDrawer(null)} />
      )}
      {showForecastModal && (
        <ForecastModal
          projectId={projectId} costHead={showForecastModal} ctc={ctc}
          onClose={() => setShowForecastModal(null)}
          onSaved={() => { setShowForecastModal(null); refreshAll(); }}
        />
      )}
      {showRiskModal && (
        <RiskModal
          projectId={projectId} risk={showRiskModal === 'new' ? null : showRiskModal}
          buckets={ctc?.buckets || []}
          onClose={() => setShowRiskModal(null)}
          onSaved={() => { setShowRiskModal(null); refetchRisks(); }}
        />
      )}
    </div>
  );
}

function CtcBody({
  ctc, navigate, projectId, forecastItems, forecastHistory, costRisks,
  canEditForecast, canEditRisk, canReview, canApprove, onDrill, onForecast, onRisk, refreshAll,
}) {
  const p = ctc.project || {};
  const isOverrun = ctc.projected_variance < 0;
  const actualPctOfBudget = ctc.approved_budget > 0 ? (ctc.actual_cost / ctc.approved_budget) * 100 : null;
  const committedPctOfBudget = ctc.approved_budget > 0 ? (ctc.committed_cost / ctc.approved_budget) * 100 : null;
  const variancePct = ctc.approved_budget > 0 ? (ctc.projected_variance / ctc.approved_budget) * 100 : null;

  const pendingReview = forecastItems.filter(f => f.status === 'submitted');
  const pendingApproval = forecastItems.filter(f => f.status === 'pm_reviewed');

  const reviewMutation = useReviewMutation(projectId, refreshAll);
  const approveMutation = useApproveMutation(projectId, refreshAll);

  const donutData = ctc.buckets.filter(b => b.etc > 0).map(b => ({ name: b.name, value: b.etc }));

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
          <div className="text-sm font-medium text-slate-700">{fmtDate(p.start_date)} – {fmtDate(p.end_date)}</div>
        </div>
        <Divider />
        <div>
          <div className="text-[10px] font-medium text-slate-400 uppercase tracking-wide">Reporting Period</div>
          <div className="text-sm font-medium text-slate-700">{ctc.reporting_period || '—'}</div>
        </div>
        <Divider />
        <div>
          <div className="text-[10px] font-medium text-slate-400 uppercase tracking-wide">Last Updated</div>
          <div className="text-sm font-medium text-slate-700">{fmtDateTime(ctc.updated_at)}</div>
        </div>
        <Divider />
        <div className="ml-auto">
          <span className={clsx('px-2.5 py-1 rounded-full text-[11px] font-semibold capitalize',
            p.status === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600')}>
            {p.status || 'unknown'}
          </span>
        </div>
      </div>

      {/* Pending approvals banner */}
      {(canReview && pendingReview.length > 0) || (canApprove && pendingApproval.length > 0) ? (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 space-y-2">
          <p className="text-xs font-semibold text-amber-800 flex items-center gap-1.5"><AlertTriangle size={13} /> Forecast revisions awaiting your action</p>
          {canReview && pendingReview.map(f => (
            <PendingForecastRow key={f.id} f={f} label="Awaiting PM Review" onApprove={(remarks) => reviewMutation.mutate({ id: f.id, action: 'approve', remarks })} onReject={(remarks) => reviewMutation.mutate({ id: f.id, action: 'reject', remarks })} />
          ))}
          {canApprove && pendingApproval.map(f => (
            <PendingForecastRow key={f.id} f={f} label="Awaiting Director Approval" onApprove={(remarks) => approveMutation.mutate({ id: f.id, action: 'approve', remarks })} onReject={(remarks) => approveMutation.mutate({ id: f.id, action: 'reject', remarks })} />
          ))}
        </div>
      ) : null}

      {/* Top KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard label="Contract Value" value={inrCompact(ctc.contract_value)} icon={FileText} color={COLORS.slate} />
        <KpiCard label="Approved Budget" value={inrCompact(ctc.approved_budget)} icon={ClipboardList} color={COLORS.blue} />
        <KpiCard label="Actual Cost to Date" value={inrCompact(ctc.actual_cost)} icon={Wallet} color={COLORS.indigo}
          sub={actualPctOfBudget != null ? `${actualPctOfBudget.toFixed(1)}% of budget` : null} clickable onClick={() => onDrill({ type: 'actual' })} />
        <KpiCard label="Committed Cost" value={inrCompact(ctc.committed_cost)} icon={FileSignature} color={COLORS.amber}
          sub={committedPctOfBudget != null ? `${committedPctOfBudget.toFixed(1)}% of budget` : null}
          note="Approved POs + SC Work Orders not yet billed" clickable onClick={() => onDrill({ type: 'committed' })} />
        <KpiCard label="Estimate to Complete (ETC)" value={inrCompact(ctc.remaining_cost)} icon={Clock} color={COLORS.amber} />
        <KpiCard label="Estimate at Completion (EAC)" value={inrCompact(ctc.estimated_final_cost)} icon={Target} color={NAVY} big />
        <KpiCard label="Projected Variance" value={inrCompact(ctc.projected_variance)} icon={isOverrun ? TrendingDown : TrendingUp}
          color={isOverrun ? COLORS.red : COLORS.emerald} big
          sub={variancePct != null ? `${Math.abs(variancePct).toFixed(2)}% ${isOverrun ? 'over' : 'under'} budget` : (isOverrun ? 'over budget' : 'under budget')} />
        <KpiCard label="Cost Completion" value={pct(ctc.cost_completion_pct)} icon={Gauge} color={COLORS.indigo} ring={ctc.cost_completion_pct} />
      </div>

      {/* Progress vs Cost + CPI/SPI */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-2xl p-5">
          <h3 className="text-sm font-semibold text-slate-900 mb-4">Physical Progress vs Cost Progress</h3>
          <div className="grid grid-cols-2 gap-8">
            <ProgressBar label="Physical Progress" value={ctc.physical_progress_pct} color={COLORS.indigo} />
            <ProgressBar label="Cost Progress" value={ctc.cost_completion_pct} color={ctc.cost_completion_pct > ctc.physical_progress_pct + 5 ? COLORS.red : COLORS.emerald} />
          </div>
          {ctc.planned_progress_pct != null && (
            <div className="mt-4"><ProgressBar label="Planned Progress" value={ctc.planned_progress_pct} color={COLORS.slate} thin /></div>
          )}
          {ctc.cost_completion_pct > ctc.physical_progress_pct + 5 ? (
            <p className="text-xs text-red-600 mt-3 flex items-center gap-1.5">
              <AlertTriangle size={13} /> Cost is ahead of physical progress — cost completion is {(ctc.cost_completion_pct - ctc.physical_progress_pct).toFixed(1)} pts higher than work done.
            </p>
          ) : ctc.physical_progress_pct > ctc.cost_completion_pct + 5 ? (
            <p className="text-xs text-emerald-600 mt-3 flex items-center gap-1.5">
              <CheckCircle2 size={13} /> Physical progress is ahead of cost — {(ctc.physical_progress_pct - ctc.cost_completion_pct).toFixed(1)} pts of work done isn't reflected in spend yet.
            </p>
          ) : null}
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
          <PerformanceIndex label="Cost Performance Index (CPI)" value={ctc.cpi} sub="Earned Value / Actual Cost" goodDirection="high" />
          <div className="h-px bg-slate-100" />
          <PerformanceIndex label="Schedule Performance Index (SPI)" value={ctc.spi} sub="Earned Value / Planned Value" goodDirection="high" />
        </div>
      </div>

      {/* Cost Breakdown + ETC Donut */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-2xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900">Cost Breakdown by Category</h3>
            <span title="Budget per category is a proportional share of Approved Budget, weighted by actual spend — Budget Control has the full ~20-cost-head detail. Click a row for transaction detail and to update its forecast." className="text-slate-300 cursor-help">
              <Info size={13} />
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  {['Cost Head', 'Budget', 'Actual', 'Committed', 'ETC', 'EAC', 'Variance', 'Var %', 'Progress', 'Status'].map(h => (
                    <th key={h} className={clsx('px-3 py-2.5 text-[11px] font-medium text-slate-400 whitespace-nowrap', h === 'Cost Head' ? 'text-left' : 'text-right')}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {ctc.buckets.map(b => {
                  const varPct = b.budget > 0 ? (b.variance / b.budget) * 100 : null;
                  const bProgress = b.budget > 0 ? (b.actual / b.budget) * 100 : null;
                  const status = b.variance < 0 ? (Math.abs(b.variance) > b.budget * 0.1 ? 'critical' : 'warning') : 'ok';
                  return (
                    <tr key={b.name} className="hover:bg-slate-50 cursor-pointer" onClick={() => onDrill({ type: 'costhead', costHead: b.name })}>
                      <td className="px-3 py-2.5 font-medium text-slate-800">
                        {b.name}
                        {b.forecast_method === 'manual' && <span title="Manually forecasted" className="ml-1.5 text-[9px] font-semibold text-violet-600 align-middle">●</span>}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono text-xs text-slate-700">{b.budget > 0 ? inrCompact(b.budget) : '—'}</td>
                      <td className="px-3 py-2.5 text-right font-mono text-xs text-slate-700">{inrCompact(b.actual)}</td>
                      <td className="px-3 py-2.5 text-right font-mono text-xs text-slate-500">{b.committed > 0 ? inrCompact(b.committed) : '—'}</td>
                      <td className="px-3 py-2.5 text-right font-mono text-xs text-amber-600">{inrCompact(b.etc)}</td>
                      <td className="px-3 py-2.5 text-right font-mono text-xs font-semibold text-slate-900">{inrCompact(b.eac)}</td>
                      <td className={clsx('px-3 py-2.5 text-right font-mono text-xs font-semibold', b.variance < 0 ? 'text-red-600' : 'text-emerald-600')}>
                        {b.variance < 0 ? '-' : '+'}{inrCompact(Math.abs(b.variance))}
                      </td>
                      <td className={clsx('px-3 py-2.5 text-right font-mono text-xs', varPct != null && varPct < 0 ? 'text-red-500' : 'text-slate-400')}>{varPct != null ? `${varPct.toFixed(1)}%` : '—'}</td>
                      <td className="px-3 py-2.5 text-right font-mono text-xs text-slate-400">{bProgress != null ? `${bProgress.toFixed(0)}%` : '—'}</td>
                      <td className="px-3 py-2.5 text-right">
                        <StatusChip status={status} />
                      </td>
                    </tr>
                  );
                })}
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
                  <td colSpan={3} />
                </tr>
              </tfoot>
            </table>
          </div>
          {canEditForecast && (
            <div className="px-5 py-3 border-t border-slate-100">
              <button onClick={() => onForecast(ctc.buckets[0]?.name)} className="text-xs font-medium text-indigo-600 hover:text-indigo-700 flex items-center gap-1">
                <Edit3 size={13} /> Update Forecast
              </button>
            </div>
          )}
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-5">
          <h3 className="text-sm font-semibold text-slate-900 mb-2">Remaining Cost (ETC) by Category</h3>
          {donutData.length > 0 ? (
            <div className="relative">
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={donutData} dataKey="value" nameKey="name" innerRadius={55} outerRadius={80} paddingAngle={2}
                    onClick={(d) => onDrill({ type: 'costhead', costHead: d.name })} cursor="pointer">
                    {donutData.map((d, i) => <Cell key={d.name} fill={DONUT_COLORS[i % DONUT_COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v) => inrCompact(v)} />
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none" style={{ top: -8 }}>
                <span className="text-[10px] text-slate-400 uppercase tracking-wide">Total ETC</span>
                <span className="text-base font-bold text-slate-900">{inrCompact(ctc.remaining_cost)}</span>
              </div>
            </div>
          ) : (
            <p className="text-xs text-slate-400 py-10 text-center">No remaining cost projected.</p>
          )}
          <div className="space-y-1.5 mt-2">
            {donutData.map((d, i) => (
              <div key={d.name} className="flex items-center justify-between text-xs cursor-pointer hover:bg-slate-50 rounded px-1.5 py-1" onClick={() => onDrill({ type: 'costhead', costHead: d.name })}>
                <span className="flex items-center gap-1.5 text-slate-600"><span className="w-2 h-2 rounded-full" style={{ background: DONUT_COLORS[i % DONUT_COLORS.length] }} />{d.name}</span>
                <span className="font-mono text-slate-500">{inrCompact(d.value)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Monthly trend */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5">
        <h3 className="text-sm font-semibold text-slate-900 mb-1">Budget vs Actual vs Forecast</h3>
        <p className="text-[11px] text-slate-400 mb-4">Cumulative, in ₹ Lakhs. Forecast is real reporting-period history — it fills in as this screen is used over successive periods.</p>
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={ctc.monthlyTrend}>
            <CartesianGrid strokeDasharray="3 3" stroke="#EEF2F7" />
            <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#94A3B8' }} />
            <YAxis tick={{ fontSize: 11, fill: '#94A3B8' }} tickFormatter={(v) => `${v}L`} />
            <Tooltip formatter={(v) => `₹${v} L`} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Line type="monotone" dataKey="budget" name="Budget" stroke={COLORS.slate} strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="actual" name="Actual" stroke={COLORS.indigo} strokeWidth={2.5} dot={false} />
            <Line type="monotone" dataKey="forecast" name="Forecast (EAC)" stroke={COLORS.amber} strokeWidth={2} strokeDasharray="5 4" dot={{ r: 3 }} connectNulls />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Risk / Alerts */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between">
          <span className="flex items-center gap-2">
            <AlertTriangle size={15} className="text-amber-500" />
            <h3 className="text-sm font-semibold text-slate-900">Cost / Schedule Risks</h3>
          </span>
          {canEditRisk && (
            <button onClick={() => onRisk('new')} className="text-xs font-medium text-indigo-600 hover:text-indigo-700 flex items-center gap-1">
              <Plus size={13} /> Create Risk
            </button>
          )}
        </div>
        <div className="divide-y divide-slate-100">
          {costRisks.map(r => (
            <div key={r.id} className="px-5 py-3 flex items-center gap-3 hover:bg-slate-50 group">
              <SeverityDot severity={r.severity} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-slate-800">{r.risk_title}</span>
                  <SeverityBadge severity={r.severity} />
                </div>
                {r.description && <p className="text-xs text-slate-500 mt-0.5">{r.description}</p>}
                <div className="flex items-center gap-3 mt-1 text-[10px] text-slate-400">
                  {r.cost_head && <span className="uppercase">{r.cost_head}</span>}
                  {r.impact > 0 && <span>Impact: {inrCompact(r.impact)}</span>}
                  {r.owner_name && <span>Owner: {r.owner_name}</span>}
                </div>
              </div>
              {canEditRisk && (
                <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 transition-opacity">
                  <button onClick={() => onRisk(r)} className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50" title="Edit"><Edit3 size={14} /></button>
                </div>
              )}
            </div>
          ))}
          {ctc.riskAlerts.filter(r => r.source !== 'cost_risk').map((r, i) => (
            <div key={`sys-${i}`} className="px-5 py-3 flex items-center gap-3 hover:bg-slate-50 cursor-pointer"
              onClick={() => r.to && navigate(r.to)}>
              <SeverityDot severity={r.severity} />
              <span className="text-sm text-slate-700 flex-1">{r.label}</span>
              {r.category && <span className="text-[10px] text-slate-400 uppercase">{r.category}</span>}
              <span className="text-[9px] text-slate-300 uppercase">{r.source === 'risk_register' ? 'Risk Register' : 'System'}</span>
              {r.to && <ChevronRight size={14} className="text-slate-300" />}
            </div>
          ))}
          {costRisks.length === 0 && ctc.riskAlerts.length === 0 && (
            <p className="px-5 py-8 text-center text-xs text-slate-400">No open risks or alerts.</p>
          )}
        </div>
      </div>

      {/* Forecast History */}
      {forecastHistory.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-100">
            <h3 className="text-sm font-semibold text-slate-900">Forecast History</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  {['Version', 'Date', 'Cost Head', 'Prepared By', 'Previous EAC', 'Revised EAC', 'Variance', 'Reason', 'Status'].map(h => (
                    <th key={h} className="px-3 py-2.5 text-[11px] font-medium text-slate-400 text-left whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {forecastHistory.map(h => (
                  <tr key={h.id} className="hover:bg-slate-50">
                    <td className="px-3 py-2.5 font-mono text-xs text-slate-500">v{h.version}</td>
                    <td className="px-3 py-2.5 text-xs text-slate-600 whitespace-nowrap">{fmtDate(h.created_at)}</td>
                    <td className="px-3 py-2.5 text-xs font-medium text-slate-800">{h.cost_head}</td>
                    <td className="px-3 py-2.5 text-xs text-slate-600">{h.prepared_by_name || '—'}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-xs text-slate-500">{inrCompact(h.previous_eac)}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-xs font-semibold text-slate-900">{inrCompact(h.revised_eac)}</td>
                    <td className={clsx('px-3 py-2.5 text-right font-mono text-xs', num(h.revised_eac) > num(h.previous_eac) ? 'text-red-600' : 'text-emerald-600')}>
                      {num(h.revised_eac) > num(h.previous_eac) ? '+' : ''}{inrCompact(num(h.revised_eac) - num(h.previous_eac))}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-slate-600">{h.forecast_reason || '—'}</td>
                    <td className="px-3 py-2.5"><ForecastStatusBadge status={h.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-wrap gap-2">
        {canEditForecast && <ActionButton primary label="Update Forecast" icon={Edit3} onClick={() => onForecast(ctc.buckets[0]?.name)} />}
        <ActionButton label="Cost Details (Budget Control)" onClick={() => navigate(`/qs/boq-budget-breakdown?project_id=${projectId}`)} />
        <ActionButton label="Commitments (POs)" onClick={() => navigate(`/procurement/po`)} />
        <ActionButton label="View BOQ" onClick={() => navigate(`/qs/boq-budget-breakdown?project_id=${projectId}`)} />
        <ActionButton label="View Variations" onClick={() => navigate(`/qs/variations`)} />
      </div>
    </div>
  );
}

function useReviewMutation(projectId, onDone) {
  return useMutation({
    mutationFn: ({ id, action, remarks }) => costForecastAPI.reviewForecast(projectId, id, { action, remarks }),
    onSuccess: () => { toast.success('Forecast reviewed'); onDone(); },
    onError: (e) => toast.error(e?.response?.data?.error || 'Failed'),
  });
}
function useApproveMutation(projectId, onDone) {
  return useMutation({
    mutationFn: ({ id, action, remarks }) => costForecastAPI.approveForecast(projectId, id, { action, remarks }),
    onSuccess: () => { toast.success('Forecast decision recorded'); onDone(); },
    onError: (e) => toast.error(e?.response?.data?.error || 'Failed'),
  });
}

function PendingForecastRow({ f, label, onApprove, onReject }) {
  const [remarks, setRemarks] = useState('');
  return (
    <div className="bg-white rounded-xl border border-amber-200 px-4 py-3 flex items-center gap-3">
      <div className="flex-1 min-w-0">
        <div className="text-xs font-semibold text-slate-800">{f.cost_head} <span className="font-normal text-slate-400">— {label}</span></div>
        <div className="text-[11px] text-slate-500 mt-0.5">{inrCompact(f.current_eac)} EAC · {f.forecast_reason}{f.remarks ? ` — ${f.remarks}` : ''}</div>
      </div>
      <input value={remarks} onChange={e => setRemarks(e.target.value)} placeholder="Remarks (optional)" className="text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 w-48" />
      <button onClick={() => onApprove(remarks)} className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium rounded-lg flex items-center gap-1"><CheckCircle2 size={13} /> Approve</button>
      <button onClick={() => onReject(remarks)} className="px-2.5 py-1.5 bg-red-50 hover:bg-red-100 text-red-700 text-xs font-medium rounded-lg flex items-center gap-1"><XCircle size={13} /> Reject</button>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Drill-down drawer — Actual / Committed / per-cost-head detail
// ═══════════════════════════════════════════════════════════════════════════
function DrilldownDrawer({ drawer, projectId, onClose }) {
  const isActual = drawer.type === 'actual' || drawer.type === 'costhead';
  const { data, isLoading } = useQuery({
    queryKey: ['ctc-drilldown', drawer.type, drawer.costHead, projectId],
    queryFn: () => {
      if (drawer.type === 'committed') return costForecastAPI.drilldownCommitted(projectId).then(r => r.data?.data ?? []);
      return costForecastAPI.drilldownActual(projectId, drawer.costHead ? { cost_head: drawer.costHead } : {}).then(r => r.data?.data ?? []);
    },
  });

  const title = drawer.type === 'committed' ? 'Commitment Details'
    : drawer.type === 'costhead' ? `${drawer.costHead} — Transaction Detail`
    : 'Actual Cost Details';

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative bg-white w-full max-w-2xl h-full shadow-2xl overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between z-10">
          <h3 className="text-base font-semibold text-slate-900">{title}</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100"><X size={18} /></button>
        </div>
        <div className="p-6">
          {isLoading ? (
            <div className="space-y-2">{[1, 2, 3, 4].map(i => <div key={i} className="h-10 bg-slate-100 rounded-lg animate-pulse" />)}</div>
          ) : !data || data.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-12">No transactions found.</p>
          ) : drawer.type === 'committed' ? (
            <table className="w-full text-xs">
              <thead className="border-b border-slate-200">
                <tr>{['Type', 'Ref No', 'Vendor', 'Order Value', 'Invoiced', 'Pending'].map(h => <th key={h} className="py-2 text-left font-medium text-slate-400">{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.map((r, i) => (
                  <tr key={i}>
                    <td className="py-2 text-slate-500">{r.type}</td>
                    <td className="py-2 font-mono text-indigo-600">{r.ref_no}</td>
                    <td className="py-2 text-slate-700">{r.vendor_name || '—'}</td>
                    <td className="py-2 text-right font-mono">{inr(r.order_value)}</td>
                    <td className="py-2 text-right font-mono text-slate-500">{inr(r.invoiced)}</td>
                    <td className="py-2 text-right font-mono font-semibold text-amber-600">{inr(r.pending)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <table className="w-full text-xs">
              <thead className="border-b border-slate-200">
                <tr>{['Date', 'Voucher', 'Type', 'Vendor', 'Cost Head', 'Amount'].map(h => <th key={h} className="py-2 text-left font-medium text-slate-400">{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.map((r, i) => (
                  <tr key={i}>
                    <td className="py-2 text-slate-500 whitespace-nowrap">{fmtDate(r.date)}</td>
                    <td className="py-2 font-mono text-indigo-600">{r.voucher_number}</td>
                    <td className="py-2 text-slate-500">{r.transaction_type}</td>
                    <td className="py-2 text-slate-700">{r.vendor || '—'}</td>
                    <td className="py-2 text-slate-500">{r.cost_head}</td>
                    <td className="py-2 text-right font-mono font-semibold">{inr(r.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Update Forecast modal
// ═══════════════════════════════════════════════════════════════════════════
function ForecastModal({ projectId, costHead, ctc, onClose, onSaved }) {
  const buckets = ctc?.buckets || [];
  const [selectedHead, setSelectedHead] = useState(costHead || buckets[0]?.name || '');
  const [customHead, setCustomHead] = useState('');
  const [isNewHead, setIsNewHead] = useState(false);
  const [revisedEtc, setRevisedEtc] = useState('');
  const [reason, setReason] = useState('');
  const [remarks, setRemarks] = useState('');

  const bucket = buckets.find(b => b.name === selectedHead);
  const activeHead = isNewHead ? customHead.trim() : selectedHead;
  const projectedEac = revisedEtc !== '' ? num(bucket?.actual) + num(revisedEtc) : null;
  const deltaPct = bucket && bucket.eac > 0 && projectedEac != null ? Math.abs((projectedEac - bucket.eac) / bucket.eac) * 100 : 0;
  const needsRemarks = deltaPct > 5;

  const mutation = useMutation({
    mutationFn: () => costForecastAPI.submitForecast(projectId, {
      cost_head: activeHead,
      revised_etc: num(revisedEtc),
      actual_cost: num(bucket?.actual) || 0,
      forecast_reason: reason,
      remarks: remarks || undefined,
    }),
    onSuccess: (res) => {
      const status = res.data?.data?.status;
      toast.success(status === 'submitted' ? 'Forecast submitted for PM review' : 'Forecast saved');
      onSaved();
    },
    onError: (e) => toast.error(e?.response?.data?.error || 'Failed to save forecast'),
  });

  const canSubmit = activeHead && revisedEtc !== '' && !isNaN(revisedEtc) && num(revisedEtc) >= 0 && reason && (!needsRemarks || remarks);

  return (
    <Modal title="Update Forecast" onClose={onClose} width="max-w-lg">
      <div className="space-y-4">
        <div>
          <label className="text-xs font-medium text-slate-600 block mb-1">Cost Head</label>
          {!isNewHead ? (
            <div className="flex gap-2">
              <select value={selectedHead} onChange={e => setSelectedHead(e.target.value)} className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm">
                {buckets.map(b => <option key={b.name} value={b.name}>{b.name}</option>)}
              </select>
              <button type="button" onClick={() => setIsNewHead(true)} className="text-xs text-indigo-600 hover:underline whitespace-nowrap px-2">+ Custom head</button>
            </div>
          ) : (
            <div className="flex gap-2">
              <input value={customHead} onChange={e => setCustomHead(e.target.value)} placeholder="e.g. Engineering, Temporary Works" className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm" />
              <button type="button" onClick={() => setIsNewHead(false)} className="text-xs text-slate-500 hover:underline whitespace-nowrap px-2">Use existing</button>
            </div>
          )}
        </div>

        {bucket && !isNewHead && (
          <div className="grid grid-cols-4 gap-2 text-center">
            <MiniStat label="Budget" value={inrCompact(bucket.budget)} />
            <MiniStat label="Actual" value={inrCompact(bucket.actual)} />
            <MiniStat label="Committed" value={inrCompact(bucket.committed)} />
            <MiniStat label="Current ETC" value={inrCompact(bucket.etc)} />
          </div>
        )}

        <div>
          <label className="text-xs font-medium text-slate-600 block mb-1">Revised ETC (₹)</label>
          <input type="number" min="0" value={revisedEtc} onChange={e => setRevisedEtc(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono" placeholder="0" />
          {projectedEac != null && (
            <p className={clsx('text-[11px] mt-1', needsRemarks ? 'text-amber-600 font-medium' : 'text-slate-400')}>
              Projected EAC: {inrCompact(projectedEac)} ({deltaPct.toFixed(1)}% change{needsRemarks ? ' — requires review' : ''})
            </p>
          )}
        </div>

        <div>
          <label className="text-xs font-medium text-slate-600 block mb-1">Forecast Reason</label>
          <select value={reason} onChange={e => setReason(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm">
            <option value="">Select reason...</option>
            {FORECAST_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>

        <div>
          <label className="text-xs font-medium text-slate-600 block mb-1">
            Remarks {needsRemarks && <span className="text-amber-600">(required — change exceeds 5%)</span>}
          </label>
          <textarea value={remarks} onChange={e => setRemarks(e.target.value)} rows={3} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" placeholder="Explain the basis for this revision..." />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="px-4 py-2 text-xs font-medium text-slate-600 hover:text-slate-800">Cancel</button>
          <button onClick={() => mutation.mutate()} disabled={!canSubmit || mutation.isPending}
            className="px-4 py-2 text-xs font-medium bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg disabled:opacity-50 flex items-center gap-1.5">
            {mutation.isPending && <Loader2 size={13} className="animate-spin" />} Save Forecast
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Risk create/edit modal
// ═══════════════════════════════════════════════════════════════════════════
function RiskModal({ projectId, risk, buckets, onClose, onSaved }) {
  const [form, setForm] = useState({
    risk_title: risk?.risk_title || '', description: risk?.description || '',
    severity: risk?.severity || 'medium', cost_head: risk?.cost_head || '',
    impact: risk?.impact || '', status: risk?.status || 'open',
  });

  const mutation = useMutation({
    mutationFn: () => risk
      ? costForecastAPI.updateRisk(projectId, risk.id, form)
      : costForecastAPI.createRisk(projectId, form),
    onSuccess: () => { toast.success(risk ? 'Risk updated' : 'Risk created'); onSaved(); },
    onError: (e) => toast.error(e?.response?.data?.error || 'Failed to save risk'),
  });

  return (
    <Modal title={risk ? 'Edit Risk' : 'Create Risk'} onClose={onClose} width="max-w-lg">
      <div className="space-y-4">
        <div>
          <label className="text-xs font-medium text-slate-600 block mb-1">Risk Title</label>
          <input value={form.risk_title} onChange={e => setForm(f => ({ ...f, risk_title: e.target.value }))} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" placeholder="e.g. Material Cost Overrun" />
        </div>
        <div>
          <label className="text-xs font-medium text-slate-600 block mb-1">Description</label>
          <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-slate-600 block mb-1">Severity</label>
            <select value={form.severity} onChange={e => setForm(f => ({ ...f, severity: e.target.value }))} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm">
              <option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600 block mb-1">Related Cost Head</label>
            <select value={form.cost_head} onChange={e => setForm(f => ({ ...f, cost_head: e.target.value }))} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm">
              <option value="">—</option>
              {buckets.map(b => <option key={b.name} value={b.name}>{b.name}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label className="text-xs font-medium text-slate-600 block mb-1">Impact (₹)</label>
          <input type="number" min="0" value={form.impact} onChange={e => setForm(f => ({ ...f, impact: e.target.value }))} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono" placeholder="0" />
        </div>
        {risk && (
          <div>
            <label className="text-xs font-medium text-slate-600 block mb-1">Status</label>
            <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm">
              <option value="open">Open</option><option value="closed">Closed</option>
            </select>
          </div>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="px-4 py-2 text-xs font-medium text-slate-600 hover:text-slate-800">Cancel</button>
          <button onClick={() => mutation.mutate()} disabled={!form.risk_title || mutation.isPending}
            className="px-4 py-2 text-xs font-medium bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg disabled:opacity-50 flex items-center gap-1.5">
            {mutation.isPending && <Loader2 size={13} className="animate-spin" />} {risk ? 'Save' : 'Create Risk'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function Modal({ title, onClose, width, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div className={clsx('bg-white rounded-2xl shadow-2xl w-full max-h-[90vh] overflow-y-auto', width || 'max-w-md')}>
        <div className="sticky top-0 bg-white border-b border-slate-100 px-5 py-4 flex items-center justify-between rounded-t-2xl">
          <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-slate-100"><X size={16} /></button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

function Divider() {
  return <div className="w-px h-8 bg-slate-100 hidden sm:block" />;
}

function KpiCard({ label, value, icon: Icon, color, note, sub, big, clickable, onClick, ring }) {
  return (
    <div onClick={onClick}
      className={clsx('bg-white border border-slate-200 rounded-2xl p-4 transition-shadow', big && 'ring-1 ring-slate-200', clickable && 'cursor-pointer hover:shadow-md hover:border-slate-300')}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wide">{label}</span>
        {ring != null ? (
          <MiniRing value={ring} color={color} />
        ) : (
          <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: `${color}15` }}>
            <Icon size={14} style={{ color }} />
          </div>
        )}
      </div>
      <div className={clsx('font-semibold text-slate-900', big ? 'text-xl' : 'text-lg')}>{value}</div>
      {sub && <div className="text-[10px] text-slate-400 mt-0.5">{sub}</div>}
      {note && <div className="text-[9px] text-slate-300 mt-1 leading-tight">{note}</div>}
    </div>
  );
}

function MiniRing({ value, color }) {
  const r = 12, c = 2 * Math.PI * r;
  const v = Math.min(Math.max(num(value), 0), 100);
  return (
    <svg width="30" height="30" viewBox="0 0 30 30" className="flex-shrink-0">
      <circle cx="15" cy="15" r={r} fill="none" stroke="#F1F5F9" strokeWidth="4" />
      <circle cx="15" cy="15" r={r} fill="none" stroke={color} strokeWidth="4" strokeDasharray={c} strokeDashoffset={c - (v / 100) * c}
        strokeLinecap="round" transform="rotate(-90 15 15)" />
    </svg>
  );
}

function ProgressBar({ label, value, color, thin }) {
  return (
    <div>
      <div className="flex items-center justify-between text-xs mb-1.5">
        <span className="font-medium text-slate-700">{label}</span>
        <span className="font-mono font-semibold" style={{ color }}>{pct(value)}</span>
      </div>
      <div className={clsx('bg-slate-100 rounded-full overflow-hidden', thin ? 'h-1.5' : 'h-2.5')}>
        <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(value || 0, 100)}%`, background: color }} />
      </div>
    </div>
  );
}

function PerformanceIndex({ label, value, sub, goodDirection }) {
  const hasValue = value != null;
  const isGood = hasValue && value >= 1.0;
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-medium text-slate-700">{label}</span>
        {hasValue && (
          <span className={clsx('text-[10px] font-semibold px-2 py-0.5 rounded-full', isGood ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700')}>
            {isGood ? (label.includes('Schedule') ? 'Ahead of schedule' : 'Under budget') : (label.includes('Schedule') ? 'Behind schedule' : 'Over budget')}
          </span>
        )}
      </div>
      <div className="flex items-baseline gap-2">
        <span className={clsx('text-2xl font-bold', hasValue ? (isGood ? 'text-emerald-600' : 'text-red-600') : 'text-slate-300')}>
          {hasValue ? value.toFixed(2) : '—'}
        </span>
        <span className="text-[10px] text-slate-400">{sub}</span>
      </div>
    </div>
  );
}

function StatusChip({ status }) {
  const map = {
    ok: { label: 'On Track', cls: 'bg-emerald-50 text-emerald-700' },
    warning: { label: 'Watch', cls: 'bg-amber-50 text-amber-700' },
    critical: { label: 'Overrun', cls: 'bg-red-50 text-red-700' },
  };
  const s = map[status] || map.ok;
  return <span className={clsx('text-[10px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap', s.cls)}>{s.label}</span>;
}

function SeverityDot({ severity }) {
  return <span className={clsx('w-1.5 h-1.5 rounded-full flex-shrink-0',
    severity === 'high' || severity === 'critical' ? 'bg-red-500' : severity === 'medium' ? 'bg-amber-500' : 'bg-blue-500')} />;
}
function SeverityBadge({ severity }) {
  const cls = severity === 'high' ? 'bg-red-50 text-red-700' : severity === 'medium' ? 'bg-amber-50 text-amber-700' : 'bg-blue-50 text-blue-700';
  return <span className={clsx('text-[9px] font-semibold px-1.5 py-0.5 rounded-full uppercase', cls)}>{severity}</span>;
}
function ForecastStatusBadge({ status }) {
  const map = {
    approved: 'bg-emerald-50 text-emerald-700', submitted: 'bg-amber-50 text-amber-700',
    pm_reviewed: 'bg-blue-50 text-blue-700', rejected: 'bg-red-50 text-red-700',
  };
  return <span className={clsx('text-[10px] font-semibold px-2 py-0.5 rounded-full capitalize', map[status] || 'bg-slate-100 text-slate-600')}>{(status || '').replace('_', ' ')}</span>;
}

function MiniStat({ label, value }) {
  return (
    <div className="bg-slate-50 rounded-lg py-2">
      <div className="text-[9px] text-slate-400 uppercase tracking-wide">{label}</div>
      <div className="text-xs font-semibold text-slate-800 mt-0.5">{value}</div>
    </div>
  );
}

function ActionButton({ label, onClick, icon: Icon, primary }) {
  return (
    <button onClick={onClick}
      className={clsx('px-3.5 py-2 text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5',
        primary ? 'bg-indigo-600 hover:bg-indigo-700 text-white' : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300')}>
      {Icon && <Icon size={13} />} {label}
    </button>
  );
}
