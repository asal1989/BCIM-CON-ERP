// src/pages/qs/MaterialReconPage.jsx
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle, PackageSearch, Activity, ShieldCheck, ArrowRight, ShieldAlert,
  RefreshCw, Info,
} from 'lucide-react';
import { projectAPI, materialReconAPI } from '../../api/client';
import { PageHeader, KpiCard as ThemeKpiCard, Theme } from '../../theme';
import { clsx } from 'clsx';

const inr = v => `₹${Number(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function SectionTitle({ icon: Icon, title, subtitle }) {
  return (
    <div className="flex items-center gap-2.5 mb-4">
      <div className="w-8 h-8 rounded-xl bg-emerald-50 flex items-center justify-center">
        <Icon className="w-4 h-4 text-emerald-600" />
      </div>
      <div>
        <h2 className="text-sm font-bold text-black leading-tight">{title}</h2>
        {subtitle && <p className="text-[10px] text-slate-400 uppercase tracking-wider">{subtitle}</p>}
      </div>
    </div>
  );
}

export default function MaterialReconPage() {
  const [activeProject, setActiveProject] = useState('');
  const navigate = useNavigate();

  const { data: auditRes, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['material-audit', activeProject],
    queryFn: () => materialReconAPI.audit(activeProject).then(r => ({ records: r.data?.data ?? [], summary: r.data?.summary ?? null })).catch(() => ({ records: [], summary: null })),
    enabled: !!activeProject,
  });

  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: () => projectAPI.list().then(r => r.data?.data ?? r.data ?? []).catch(() => [])
  });

  const records = auditRes?.records || [];
  const summary = auditRes?.summary || null;
  const statusCounts = records.reduce((acc, r) => {
    acc[r.status] = (acc[r.status] || 0) + 1;
    return acc;
  }, {});

  const criticalItems = records.filter(r => r.status === 'critical');

  return (
    <div style={{ background: Theme.pageBg, minHeight: '100vh' }}>
      <PageHeader
        title="Material Recon Auditor"
        subtitle="Theoretical vs actual consumption — flags excess wastage for RA bill recovery"
        breadcrumbs={[{ label: 'QS & Billing' }, { label: 'Material Recon' }]}
        actions={
          <>
            <select
              value={activeProject}
              onChange={e => setActiveProject(e.target.value)}
              className="border-none rounded-lg px-3 py-2 text-xs font-medium min-w-[240px] outline-none"
              style={{ background: 'rgba(255,255,255,0.12)', color: '#fff' }}
            >
              <option value="" style={{ color: '#0f172a' }}>Select project for audit...</option>
              {projects.map(p => <option key={p.id} value={p.id} style={{ color: '#0f172a' }}>{p.name}</option>)}
            </select>
            <button
              onClick={() => refetch()}
              disabled={!activeProject || isRefetching}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-lg transition disabled:opacity-40"
              style={{ background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.25)', color: '#fff' }}
            >
              <RefreshCw className={clsx('w-3.5 h-3.5', isRefetching && 'animate-spin')} /> Refresh
            </button>
          </>
        }
      />

      <div className="p-5 md:p-6 max-w-[1400px] mx-auto space-y-5">

        {!activeProject ? (
          <div className="bg-white rounded-2xl border border-slate-200 py-20 text-center shadow-sm">
            <PackageSearch className="w-12 h-12 text-slate-200 mx-auto mb-4" />
            <p className="text-slate-500 font-semibold">Select a project to run the consumption audit</p>
          </div>
        ) : isLoading ? (
          <div className="space-y-5">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[1, 2, 3, 4].map(n => <div key={n} className="h-28 bg-white rounded-xl animate-pulse border border-slate-200" />)}
            </div>
            <div className="h-64 bg-white rounded-xl animate-pulse border border-slate-200" />
          </div>
        ) : (
          <>
            {/* KPI Row */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <ThemeKpiCard icon={Activity}     label="Total Audited" value={records.length}          color="blue"    sub="Materials checked" />
              <ThemeKpiCard icon={ShieldCheck}  label="OK Status"     value={statusCounts.ok || 0}     color="emerald" sub="Within allowed wastage" />
              <ThemeKpiCard icon={AlertTriangle} label="Warnings"     value={statusCounts.warning || 0} color="amber"  sub="Above allowed wastage" />
              <ThemeKpiCard icon={ShieldAlert}  label="Critical"      value={statusCounts.critical || 0} color="red"   sub="Exceeds 1.5x allowable" />
            </div>

            {criticalItems.length > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex items-center gap-3">
                <ShieldAlert size={15} className="text-red-600 flex-shrink-0" />
                <span className="text-sm font-medium text-red-800">
                  Critical variance detected in {criticalItems.length} material{criticalItems.length !== 1 ? 's' : ''} — excess consumption exceeds 1.5x allowable limits.
                </span>
              </div>
            )}

            {/* Recovery Summary — the actual ₹ figure this audit exists to produce */}
            {summary && (
              <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
                <SectionTitle icon={ShieldCheck} title="Recovery Summary" subtitle="Amount recoverable from the contractor's next RA bill" />
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">Total Suggested Recovery</p>
                    <p className="text-2xl font-bold text-black">{inr(summary.total_suggested_recovery)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">Previously Recovered</p>
                    <p className="text-2xl font-bold text-slate-500">{inr(summary.previously_recovered)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">Net Recovery Due</p>
                    <p className={clsx('text-2xl font-bold', summary.net_recovery_due > 0 ? 'text-red-600' : 'text-emerald-600')}>{inr(summary.net_recovery_due)}</p>
                  </div>
                </div>
                {summary.reason && (
                  <p className="text-xs text-slate-500 mt-4 italic flex items-center gap-1.5">
                    <Info size={12} className="flex-shrink-0" /> {summary.reason}
                  </p>
                )}
              </div>
            )}

            {/* Audit Table */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-5 pb-0">
                <SectionTitle icon={Activity} title="Material Consumption Audit" subtitle={`${records.length} materials tracked`} />
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-y border-slate-100">
                      {['Material', 'Theoretical Qty', 'Actual Issued', 'Variance %', 'Excess Wastage', 'Status'].map((h, i) => (
                        <th key={h} className={clsx('px-4 py-2.5 text-[10px] font-bold uppercase tracking-widest text-slate-400', i === 0 ? 'text-left' : i === 5 ? 'text-center' : 'text-right')}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {records.map((r, i) => (
                      <tr key={i} className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-3">
                          <div className="text-sm font-semibold text-black">{r.material_name}</div>
                          <div className="text-[10px] text-slate-400 uppercase tracking-wide">{r.unit}</div>
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-xs text-slate-500">{r.theoretical_qty.toFixed(2)}</td>
                        <td className="px-4 py-3 text-right font-mono text-xs text-slate-700">{r.actual_issued_qty.toFixed(2)}</td>
                        <td className={clsx('px-4 py-3 text-right font-mono text-xs font-semibold', r.status === 'ok' ? 'text-emerald-600' : 'text-red-600')}>
                          {r.variance_pct.toFixed(2)}%
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className={clsx('text-xs font-bold', r.excess_wastage > 0 ? 'text-red-600' : 'text-slate-400')}>
                            {r.excess_wastage.toFixed(2)} {r.unit}
                          </div>
                          <div className="text-[9px] text-slate-400 uppercase">Above {r.allowed_wastage_pct}% allowable</div>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={clsx(
                            'inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide',
                            r.status === 'ok' ? 'bg-emerald-50 text-emerald-700' :
                            r.status === 'warning' ? 'bg-amber-50 text-amber-700' :
                            'bg-red-50 text-red-700'
                          )}>
                            {r.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                    {records.length === 0 && (
                      <tr>
                        <td colSpan={6} className="py-16 text-center">
                          <Info className="w-10 h-10 mx-auto text-slate-200 mb-2" />
                          <p className="text-xs font-semibold text-slate-500">No issue notes or norms found for this project</p>
                          <p className="text-[11px] text-slate-400 mt-1">Verify Consumption Norms are mapped for this project's BOQ items.</p>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Directives */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-3">
                <SectionTitle icon={ShieldCheck} title="Financial Directive" />
                <p className="text-sm text-slate-600 leading-relaxed">
                  Automated auditing suggests a recovery check for {criticalItems.length} critical material{criticalItems.length !== 1 ? 's' : ''}.
                  Link excess wastage to the next RA bill for deduction at standard purchase rates.
                </p>
                <button
                  onClick={() => navigate('/qs/ra-bills/new')}
                  className="flex items-center gap-1.5 text-xs font-bold text-emerald-600 hover:text-emerald-700 uppercase tracking-wide group"
                >
                  Review Recovery Protocol <ArrowRight size={13} className="group-hover:translate-x-1 transition-transform" />
                </button>
              </div>

              <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-3">
                <SectionTitle icon={AlertTriangle} title="Site Level Analysis" />
                <p className="text-sm text-slate-600 leading-relaxed">
                  Variance anomaly detected in high-bulk materials. Recommend physical verification of
                  on-site inventory against current Issue Notes to pinpoint handling losses.
                </p>
                <button
                  onClick={() => refetch()}
                  disabled={isRefetching}
                  className="flex items-center gap-1.5 text-xs font-bold text-amber-600 hover:text-amber-700 uppercase tracking-wide group disabled:opacity-50"
                >
                  {isRefetching ? 'Re-running…' : 'Re-run Audit'} <ArrowRight size={13} className="group-hover:translate-x-1 transition-transform" />
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
