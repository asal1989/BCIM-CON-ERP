// src/pages/reports/Project360Page.jsx
import React, { useState, useMemo, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  TrendingUp, TrendingDown, Activity, ShieldAlert, ShieldCheck,
  Layers, Package, Truck, HardHat, Printer, Globe, Zap,
  ChevronRight, Users, Wallet, Gauge, AlertTriangle, CheckCircle2,
  PieChart as PieChartIcon, Receipt, Clock,
} from 'lucide-react';
import {
  ResponsiveContainer, LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip,
  PieChart, Pie, Cell, BarChart, Bar, Legend,
} from 'recharts';
import { analyticsAPI, projectAPI } from '../../api/client';
import { clsx } from 'clsx';
import { useNavigate, Link } from 'react-router-dom';
import { useReactToPrint } from 'react-to-print';
import { ReportPrintTemplate } from './ReportPrintTemplate';
import AIInsightPanel from './AIInsightPanel';
import FinanceActionBar from '../../components/finance/FinanceActionBar';

const NAVY = '#1E1B8F';
const COLORS = {
  indigo: '#4F46E5', emerald: '#10B981', amber: '#F59E0B', red: '#EF4444',
  blue: '#3B82F6', slate: '#64748B', purple: '#8B5CF6',
};
const DONUT_COLORS = [COLORS.emerald, COLORS.amber, COLORS.blue, COLORS.indigo, COLORS.slate];
const SEVERITY_COLOR = { critical: COLORS.red, high: COLORS.red, medium: COLORS.amber, low: COLORS.blue };

const num = (v) => parseFloat(v) || 0;
const inr = (v) => `₹${Math.round(num(v)).toLocaleString('en-IN')}`;
const inrCompact = (v) => {
  const n = num(v);
  const abs = Math.abs(n);
  if (abs >= 1e7) return `₹${(n / 1e7).toFixed(2)} Cr`;
  if (abs >= 1e5) return `₹${(n / 1e5).toFixed(2)} L`;
  return `₹${Math.round(n).toLocaleString('en-IN')}`;
};
const pctFmt = (v) => `${num(v).toFixed(1)}%`;

export default function Project360Page() {
  const navigate = useNavigate();
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [printData, setPrintData] = useState(null);
  const printRef = useRef();

  const handlePrint = useReactToPrint({
    contentRef: printRef,
    onAfterPrint: () => setPrintData(null),
  });

  const { data: projects } = useQuery({
    queryKey: ['projects'],
    queryFn: () => projectAPI.list().then(r => r.data?.data ?? r.data ?? []).catch(() => []),
  });

  const { data: stats, isLoading } = useQuery({
    queryKey: ['project-360', selectedProjectId, dateFrom, dateTo],
    queryFn: () => analyticsAPI
      .project360(selectedProjectId, { date_from: dateFrom || undefined, date_to: dateTo || undefined })
      .then(r => r.data?.data ?? r.data ?? null),
    enabled: !!selectedProjectId,
  });

  const { data: globalStats, isLoading: isLoadingGlobal } = useQuery({
    queryKey: ['global-analytics'],
    queryFn: () => analyticsAPI.global().then(r => r.data?.data ?? r.data ?? null),
    enabled: !selectedProjectId,
  });

  return (
    <div className="p-6 bg-slate-50 min-h-screen space-y-8">
      <div style={{ display: 'none' }}>
        <ReportPrintTemplate ref={printRef} data={printData} title="PROJECT 360 AUDIT" />
      </div>

      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-indigo-500/10 flex items-center justify-center border border-indigo-500/20 shadow-xl shadow-indigo-500/10">
            <Activity className="w-8 h-8 text-indigo-500" />
          </div>
          <div>
            <h1 className="text-3xl font-medium text-slate-900 uppercase tracking-tighter italic">Strategic Command Hub</h1>
            <p className="text-[10px] text-slate-500 font-medium uppercase tracking-[0.3em] flex items-center gap-2 italic">
              <Globe size={12} className="text-indigo-600" /> Project 360 · Real-time Intelligence
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <FinanceActionBar
            compact
            showSearch={false}
            projectId={selectedProjectId || 'all'}
            onProjectChange={(v) => setSelectedProjectId(v === 'all' ? '' : v)}
            projectOptions={projects || []}
            projectLabel="Select Command Target..."
            showDateRange={!!selectedProjectId}
            startDate={dateFrom}
            onStartDateChange={setDateFrom}
            endDate={dateTo}
            onEndDateChange={setDateTo}
            data={[]}
            extraControls={selectedProjectId ? (
              <button
                onClick={() => { setPrintData(stats); setTimeout(handlePrint, 100); }}
                className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-white border border-slate-200 text-slate-700 font-medium text-[9px] uppercase tracking-widest shadow-sm"
              >
                <Printer size={14} /> Export Audit PDF
              </button>
            ) : null}
          />
        </div>
      </div>

      {!selectedProjectId ? (
        <PortfolioView projects={projects} globalStats={globalStats} isLoading={isLoadingGlobal} />
      ) : isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[1, 2, 3, 4].map(i => <div key={i} className="h-40 bg-white rounded-[2.5rem] animate-pulse border border-slate-200" />)}
        </div>
      ) : stats ? (
        <ProjectView stats={stats} projectId={selectedProjectId} navigate={navigate} />
      ) : (
        <div className="bg-white border border-slate-200 rounded-[3rem] p-12 text-center text-sm text-slate-500">
          Couldn't load data for this project.
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
 * Portfolio view (no project selected) — unchanged structurally, light
 * cleanup only per the plan's scope (this page's deep rework is the
 * single-project view).
 * ═══════════════════════════════════════════════════════════════════════ */
function PortfolioView({ projects, globalStats, isLoading }) {
  const g = globalStats?.global || {};
  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-6 duration-1000">
      <div className="bg-white border border-slate-200 rounded-[3rem] p-10 flex items-center justify-between shadow-sm">
        <div className="space-y-2">
          <h2 className="text-3xl font-medium text-slate-900 italic tracking-tighter uppercase leading-none">Global Corporate Pulse</h2>
          <p className="text-[10px] font-medium text-slate-500 uppercase tracking-[0.4em]">Aggregating Data from all Active Sites</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <p className="text-[9px] font-medium text-slate-500 uppercase tracking-widest leading-none mb-1">Total Active Portfolio</p>
            <p className="text-2xl font-medium text-indigo-600 italic">
              {isLoading ? '...' : (g.project_count || projects?.length || 0)} Projects
            </p>
          </div>
          <div className="w-14 h-14 rounded-2xl bg-indigo-500/10 flex items-center justify-center border border-indigo-500/20 shadow-xl shadow-indigo-500/10">
            <Globe size={32} className="text-indigo-500 animate-[pulse_3s_infinite]" />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatTile label="Aggregate Revenue" value={isLoading ? '...' : inr(g.revenue)} sub="Global Billed Volume" color="text-indigo-600" />
        <StatTile label="Group Margin" value={isLoading ? '...' : pctFmt(g.margin)} sub="Portfolio Gross Profit" color="text-emerald-600" icon={TrendingUp} />
        <StatTile label="HSE Compliance" value={isLoading ? '...' : pctFmt(g.safety_score)} sub="Safety Score" color="text-blue-600" icon={ShieldCheck} />
        <StatTile label="Quality Pass Rate" value={isLoading ? '...' : pctFmt(g.quality_score)} sub="QA/QC Score" color="text-amber-600" icon={ShieldCheck} />
      </div>

      <div className="bg-white border border-slate-200 rounded-[3rem] p-12 text-center space-y-6 shadow-sm">
        <div className="max-w-xl mx-auto space-y-2">
          <h3 className="text-xl font-medium text-slate-900 uppercase italic">Interactive Site Drill-down</h3>
          <p className="text-[10px] font-medium text-slate-500 uppercase tracking-widest leading-relaxed">
            Select a project from above to open its full 360° command view — financials, schedule, safety, quality, manpower, and risk in one place.
          </p>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
 * Single-project view
 * ═══════════════════════════════════════════════════════════════════════ */
function ProjectView({ stats, projectId, navigate }) {
  const { financials, progress, costBreakdown, topVariance, sCurve, evm, safety, quality, manpower, cashFlow, riskAlerts, schedule } = stats;

  const healthScore = useMemo(() => computeHealthScore({ progress, safety, quality, financials, schedule }), [progress, safety, quality, financials, schedule]);

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-6 duration-1000">
      <AIInsightPanel projectId={projectId} />

      {/* Top KPI strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-6">
        <StatTile label="Contract Value" value={inrCompact(financials.contract_value)} sub="Original + Variations" color="text-slate-700" />
        <StatTile label="Certified Amount" value={inrCompact(financials.billing.total_billed)} sub={pctFmt((financials.billing.total_billed / (financials.contract_value || 1)) * 100) + ' of Contract'} color="text-indigo-600" />
        <StatTile label="Retention Held" value={inrCompact(financials.billing.retention_held)} sub="Client Retention" color="text-amber-600" />
        <StatTile label="Total Cost" value={inrCompact(financials.costs.total)} sub={pctFmt((financials.costs.total / (financials.contract_value || 1)) * 100) + ' of Contract'} color="text-red-500" />
        <div className="hidden xl:block">
          <HealthScoreTile score={healthScore} />
        </div>
      </div>
      <div className="xl:hidden"><HealthScoreTile score={healthScore} /></div>

      {/* Financial Overview + Physical Progress */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-[2.5rem] p-8 shadow-sm space-y-6">
          <h3 className="text-[10px] font-medium text-slate-500 uppercase tracking-[0.3em] italic">Financial Overview</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-y-5 gap-x-4 text-sm">
            <FinRow label="Budget (Original)" value={inr(financials.contract_value)} />
            <FinRow label="Approved Variations" value={inr(financials.approved_variations)} accent={financials.approved_variations !== 0} />
            <FinRow label="Revised Contract Value" value={inr(financials.revised_contract_value)} bold />
            <FinRow label="Total Billed" value={inr(financials.billing.total_billed)} color="text-indigo-600" />
            <FinRow label="Total Received" value={inr(financials.billing.total_received)} color="text-emerald-600" />
            <FinRow label="Retention Held" value={inr(financials.billing.retention_held)} color="text-amber-600" />
            <FinRow label="Balance Receivable" value={inr(financials.billing.balance_receivable)} color="text-red-500" bold />
            <FinRow label="Gross Profit" value={inr(financials.gross_profit)} color={financials.gross_profit >= 0 ? 'text-emerald-600' : 'text-red-500'} bold />
            <FinRow label="Gross Margin" value={pctFmt(financials.gross_margin_pct)} bold />
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-[2.5rem] p-8 shadow-sm flex flex-col items-center">
          <h3 className="text-[10px] font-medium text-slate-500 uppercase tracking-[0.3em] italic self-start mb-2">Physical Progress</h3>
          <RadialGauge value={progress.pct} color={COLORS.indigo} />
          {schedule?.time_elapsed_pct != null && (
            <p className="text-[10px] text-slate-500 uppercase tracking-widest mt-2">
              vs {pctFmt(schedule.time_elapsed_pct)} time elapsed
            </p>
          )}
        </div>
      </div>

      {/* S-Curve */}
      <div className="bg-white border border-slate-200 rounded-[2.5rem] p-8 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-[10px] font-medium text-slate-500 uppercase tracking-[0.3em] italic">S-Curve — Planned vs Actual{sCurve?.some(p => p.forecast != null) ? ' vs Forecast' : ''}</h3>
          <span className="text-[9px] text-slate-400 uppercase tracking-widest">₹ in Crore</span>
        </div>
        <SCurveChart data={sCurve} />
      </div>

      {/* Stat card row: Safety / Quality / SPI / CPI / Cash Flow / Manpower */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-5">
        <MiniStat icon={ShieldAlert} label="Safety Score" value={pctFmt(safety.safety_score)} sub={`${safety.incident_count} Incidents · ${safety.lti_count} LTI`} color={safety.major_accidents > 0 ? 'text-red-600' : 'text-blue-600'} />
        <MiniStat icon={ShieldCheck} label="Quality Score" value={pctFmt(quality.quality_score)} sub={`${quality.inspection_count} Inspections · ${quality.open_ncr_count} Open NCR`} color="text-amber-600" />
        <EvmMiniStat label="Schedule (SPI)" value={evm?.spi} status={evm?.schedule_status} to={`/planning/p6-dashboard?project_id=${stats.project?.id}`} />
        <EvmMiniStat label="Cost (CPI)" value={evm?.cpi} status={evm?.cost_status} to={`/planning/p6-dashboard?project_id=${stats.project?.id}`} />
        <MiniStat icon={Wallet} label="Cash Flow" value={inrCompact(cashFlow.net)} sub={`In ${inrCompact(cashFlow.inflow)} · Out ${inrCompact(cashFlow.outflow)}`} color={cashFlow.net >= 0 ? 'text-emerald-600' : 'text-red-500'} />
        <MiniStat icon={Users} label="Manpower Today" value={manpower.total} sub={`${manpower.present} Present · ${manpower.absent} Absent`} color="text-indigo-600" />
      </div>

      {/* Cost Breakdown + Top Variance */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-white border border-slate-200 rounded-[2.5rem] p-8 shadow-sm">
          <h3 className="text-[10px] font-medium text-slate-500 uppercase tracking-[0.3em] italic mb-4">Cost Breakdown</h3>
          <CostBreakdownDonut data={costBreakdown} />
        </div>
        <div className="bg-white border border-slate-200 rounded-[2.5rem] p-8 shadow-sm">
          <h3 className="text-[10px] font-medium text-slate-500 uppercase tracking-[0.3em] italic mb-4">Top Variance (Budget vs Actual)</h3>
          <TopVarianceBars data={topVariance} />
        </div>
      </div>

      {/* Risk & Alerts */}
      <div className="bg-white border border-slate-200 rounded-[2.5rem] p-8 shadow-sm">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-[10px] font-medium text-slate-500 uppercase tracking-[0.3em] italic">Risk & Alerts</h3>
          <Link to="/planning/risks" className="text-[9px] font-medium text-indigo-500 uppercase tracking-widest hover:text-indigo-600 flex items-center gap-1">
            View All <ChevronRight size={12} />
          </Link>
        </div>
        {riskAlerts?.length ? (
          <div className="space-y-2.5">
            {riskAlerts.map((a, i) => <RiskAlertRow key={i} alert={a} />)}
          </div>
        ) : (
          <div className="py-8 text-center text-[10px] text-slate-400 uppercase tracking-widest flex flex-col items-center gap-2">
            <CheckCircle2 className="text-emerald-400" size={22} />
            No open risks or exceptions on this project.
          </div>
        )}
      </div>

      {/* Quick Strategic Junctions */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
        <ActionCard icon={Layers} label="BOQ Tracking" to="/qs/boq" color="indigo" />
        <ActionCard icon={Receipt} label="RA Bills" to="/qs/ra-bills" color="emerald" />
        <ActionCard icon={PieChartIcon} label="Budget Control" to="/finance/budget-control" color="amber" />
        <ActionCard icon={AlertTriangle} label="Risk Register" to="/planning/risks" color="red" />
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
 * Project Health Score — a documented, weighted composite. Not returned by
 * the backend (no formal definition exists in the ERP) so it's computed
 * client-side from data the page already has:
 *   30% schedule adherence (progress% vs time-elapsed%, capped at 100)
 *   30% cost adherence (progress% vs spend% of budget, capped at 100)
 *   20% safety score, 20% quality score
 * ───────────────────────────────────────────────────────────────────── */
function computeHealthScore({ progress, safety, quality, financials, schedule }) {
  const progressPct = num(progress?.pct);
  const elapsedPct = schedule?.time_elapsed_pct;
  const scheduleAdherence = elapsedPct != null && elapsedPct > 0
    ? Math.min(100, (progressPct / elapsedPct) * 100)
    : 100;
  const budget = num(financials?.total_budget);
  const spentPct = budget > 0 ? (num(financials?.costs?.total) / budget) * 100 : 0;
  const costAdherence = spentPct > 0 && progressPct > 0
    ? Math.min(100, (progressPct / spentPct) * 100)
    : 100;
  const score = (scheduleAdherence * 0.3) + (costAdherence * 0.3) + (num(safety?.safety_score) * 0.2) + (num(quality?.quality_score) * 0.2);
  return Math.round(Math.max(0, Math.min(100, score)));
}

/* ─────────────────────────────────────────────────────────────────────────
 * Small building blocks
 * ───────────────────────────────────────────────────────────────────── */
function StatTile({ label, value, sub, color, icon: Icon }) {
  return (
    <div className="bg-white border border-slate-200 rounded-[2.5rem] hover:border-indigo-500/30 transition-all group overflow-hidden relative p-8 shadow-sm">
      <div className="flex justify-between items-start mb-6 relative z-10">
        <span className="text-[10px] font-medium text-slate-500 uppercase tracking-widest block">{label}</span>
        {Icon && <Icon className={clsx('w-6 h-6', color)} />}
      </div>
      <div className={clsx('text-3xl font-medium italic tracking-tighter text-slate-900 mb-2 relative z-10', color)}>{value}</div>
      <div className="text-[10px] text-slate-400 font-medium uppercase tracking-[0.2em] relative z-10 italic">{sub}</div>
    </div>
  );
}

function HealthScoreTile({ score }) {
  const color = score >= 75 ? COLORS.emerald : score >= 50 ? COLORS.amber : COLORS.red;
  const label = score >= 75 ? 'Good' : score >= 50 ? 'Watch' : 'At Risk';
  return (
    <div className="bg-white border border-slate-200 rounded-[2.5rem] p-8 shadow-sm flex items-center gap-5">
      <div className="relative w-16 h-16 shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={[{ v: score }, { v: 100 - score }]} dataKey="v" cx="50%" cy="50%" innerRadius={22} outerRadius={30} startAngle={90} endAngle={-270} stroke="none">
              <Cell fill={color} />
              <Cell fill="#F1F5F9" />
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex items-center justify-center text-sm font-bold" style={{ color }}>{score}</div>
      </div>
      <div>
        <div className="text-[9px] font-medium text-slate-500 uppercase tracking-widest">Project Health</div>
        <div className="text-lg font-medium italic" style={{ color }}>{label}</div>
      </div>
    </div>
  );
}

function FinRow({ label, value, color, bold, accent }) {
  return (
    <div>
      <div className="text-[9px] font-medium text-slate-400 uppercase tracking-widest mb-1">{label}</div>
      <div className={clsx('font-mono text-sm', color || 'text-black', bold && 'font-bold text-base', accent && (parseFloat(String(value).replace(/[^\d.-]/g, '')) < 0 ? 'text-red-500' : 'text-emerald-600'))}>
        {value}
      </div>
    </div>
  );
}

function RadialGauge({ value, color }) {
  const v = Math.max(0, Math.min(100, num(value)));
  const data = [{ v }, { v: 100 - v }];
  return (
    <div className="relative w-40 h-40">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={data} dataKey="v" cx="50%" cy="50%" innerRadius={58} outerRadius={76} startAngle={90} endAngle={-270} stroke="none" isAnimationActive animationDuration={1000}>
            <Cell fill={color} />
            <Cell fill="#F1F5F9" />
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-medium italic text-slate-900">{v.toFixed(1)}%</span>
        <span className="text-[8px] text-slate-400 uppercase tracking-widest">Certified</span>
      </div>
    </div>
  );
}

function SCurveChart({ data }) {
  if (!data?.length) return <div className="h-[220px] flex items-center justify-center text-xs text-slate-400">No billing history yet.</div>;
  const hasForecast = data.some(p => p.forecast != null);
  return (
    <ResponsiveContainer width="100%" height={240}>
      <LineChart data={data} margin={{ top: 6, right: 10, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
        <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#64748B' }} axisLine={{ stroke: '#E5E7EB' }} tickLine={false} />
        <YAxis tickFormatter={(v) => `₹${v}Cr`} tick={{ fontSize: 10, fill: '#64748B' }} axisLine={false} tickLine={false} width={50} />
        <Tooltip formatter={(v, n) => [`₹${v} Cr`, n]} contentStyle={{ borderRadius: 10, fontSize: 12, border: '1px solid #E5E7EB' }} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        <Line name="Planned" type="monotone" dataKey="planned" stroke={COLORS.indigo} strokeWidth={2.25} dot={{ r: 2.5 }} />
        <Line name="Actual" type="monotone" dataKey="actual" stroke={COLORS.emerald} strokeWidth={2.25} dot={{ r: 2.5 }} />
        {hasForecast && <Line name="Forecast" type="monotone" dataKey="forecast" stroke={COLORS.amber} strokeWidth={2} strokeDasharray="5 4" dot={false} />}
      </LineChart>
    </ResponsiveContainer>
  );
}

function CostBreakdownDonut({ data }) {
  if (!data?.length) return <div className="h-[220px] flex items-center justify-center text-xs text-slate-400">No spend recorded yet.</div>;
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <div className="flex flex-col items-center">
      <ResponsiveContainer width="100%" height={220}>
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={58} outerRadius={90} paddingAngle={2} startAngle={90} endAngle={-270}>
            {data.map((d, i) => <Cell key={d.name} fill={DONUT_COLORS[i % DONUT_COLORS.length]} />)}
          </Pie>
          <Tooltip formatter={(v, n) => [inr(v), n]} contentStyle={{ borderRadius: 10, fontSize: 12, border: '1px solid #E5E7EB' }} />
        </PieChart>
      </ResponsiveContainer>
      <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 w-full mt-2">
        {data.map((d, i) => (
          <div key={d.name} className="flex items-center gap-1.5 min-w-0 text-[10px]">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: DONUT_COLORS[i % DONUT_COLORS.length] }} />
            <span className="text-slate-600 truncate">{d.name}</span>
            <span className="text-slate-400 ml-auto shrink-0">{((d.value / total) * 100).toFixed(0)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function TopVarianceBars({ data }) {
  if (!data?.length) return <div className="h-[220px] flex items-center justify-center text-xs text-slate-400">No variance data yet.</div>;
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} layout="vertical" margin={{ top: 6, right: 20, left: 10, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" horizontal={false} />
        <XAxis type="number" tickFormatter={(v) => inrCompact(v)} tick={{ fontSize: 10, fill: '#64748B' }} axisLine={false} tickLine={false} />
        <YAxis type="category" dataKey="name" width={90} tick={{ fontSize: 11, fill: '#334155' }} axisLine={false} tickLine={false} />
        <Tooltip formatter={(v) => inr(v)} contentStyle={{ borderRadius: 10, fontSize: 12, border: '1px solid #E5E7EB' }} />
        <Bar dataKey="variance" radius={[0, 6, 6, 0]}>
          {data.map((d, i) => <Cell key={i} fill={d.variance >= 0 ? COLORS.emerald : COLORS.red} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

function MiniStat({ icon: Icon, label, value, sub, color }) {
  return (
    <div className="bg-white border border-slate-200 rounded-[2rem] p-5 shadow-sm">
      <div className="flex items-center gap-2 mb-2">
        <Icon size={14} className={color} />
        <span className="text-[9px] font-medium text-slate-500 uppercase tracking-widest">{label}</span>
      </div>
      <div className={clsx('text-lg font-medium italic', color)}>{value}</div>
      <div className="text-[9px] text-slate-400 mt-0.5 truncate">{sub}</div>
    </div>
  );
}

// SPI/CPI — real Earned Value engine, but only meaningful once activities
// carry planned/earned/actual values. Most projects have none entered yet,
// so this shows an honest "Not tracked yet" state instead of a fake number.
function EvmMiniStat({ label, value, status, to }) {
  const tracked = value !== null && value !== undefined;
  const color = !tracked ? 'text-slate-400'
    : value >= 1.0 ? 'text-emerald-600' : value >= 0.85 ? 'text-amber-600' : 'text-red-500';
  return (
    <Link to={to} className="bg-white border border-slate-200 rounded-[2rem] p-5 shadow-sm hover:border-indigo-300 transition-colors">
      <div className="flex items-center gap-2 mb-2">
        <Gauge size={14} className={color} />
        <span className="text-[9px] font-medium text-slate-500 uppercase tracking-widest">{label}</span>
      </div>
      {tracked ? (
        <>
          <div className={clsx('text-lg font-medium italic', color)}>{value.toFixed(2)}</div>
          <div className="text-[9px] text-slate-400 mt-0.5 capitalize">{String(status || '').replace(/_/g, ' ')}</div>
        </>
      ) : (
        <>
          <div className="text-sm font-medium italic text-slate-400">Not tracked yet</div>
          <div className="text-[9px] text-indigo-400 mt-0.5 flex items-center gap-1">Enter EVM data <ChevronRight size={10} /></div>
        </>
      )}
    </Link>
  );
}

function RiskAlertRow({ alert }) {
  const color = SEVERITY_COLOR[alert.severity] || COLORS.slate;
  const content = (
    <div className="flex items-center gap-3 p-3.5 rounded-2xl bg-slate-50 border border-slate-100 hover:bg-slate-100/70 transition-colors">
      <AlertTriangle size={15} style={{ color }} className="shrink-0" />
      <span className="text-[11px] text-slate-700 flex-1">{alert.label}</span>
      {alert.due_date && (
        <span className="text-[9px] text-slate-400 flex items-center gap-1 shrink-0">
          <Clock size={10} /> {new Date(alert.due_date).toLocaleDateString('en-IN')}
        </span>
      )}
      <span className="text-[8px] font-medium uppercase tracking-widest px-2 py-0.5 rounded-full shrink-0" style={{ color, background: `${color}1A` }}>
        {alert.severity}
      </span>
    </div>
  );
  return alert.to ? <Link to={alert.to}>{content}</Link> : content;
}

function ActionCard({ icon: Icon, label, to, color }) {
  const colors = {
    indigo: 'hover:border-indigo-500/30 hover:bg-indigo-50 text-indigo-600',
    emerald: 'hover:border-emerald-500/30 hover:bg-emerald-50 text-emerald-600',
    amber: 'hover:border-amber-500/30 hover:bg-amber-50 text-amber-600',
    red: 'hover:border-red-500/30 hover:bg-red-50 text-red-600',
  };
  return (
    <Link to={to} className={clsx('bg-white border border-slate-200 rounded-[2rem] flex flex-col items-center justify-center gap-4 p-8 transition-all group shadow-sm', colors[color])}>
      <div className="w-12 h-12 rounded-2xl bg-slate-50 flex items-center justify-center border border-slate-100 group-hover:scale-110 transition-transform">
        <Icon size={24} />
      </div>
      <span className="text-[9px] font-medium uppercase tracking-[0.2em] text-slate-600 group-hover:text-slate-900 transition-colors italic">{label}</span>
    </Link>
  );
}
