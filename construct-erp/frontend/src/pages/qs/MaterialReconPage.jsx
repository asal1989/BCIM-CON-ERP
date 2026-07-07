// src/pages/qs/MaterialReconPage.jsx
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle, PackageSearch, Filter,
  CheckCircle2, Building2, Activity, Zap, Info,
  BarChart3, ShieldCheck, ArrowRight, ShieldAlert,
  Download, RefreshCw
} from 'lucide-react';
import { projectAPI, materialReconAPI } from '../../api/client';
import { clsx } from 'clsx';
import toast from 'react-hot-toast';

const inr = v => `₹${Number(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

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
    <div className="space-y-6 animate-in fade-in duration-500 text-left">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-medium text-slate-50 tracking-tight flex items-center gap-3">
            <BarChart3 className="text-blue-500" />
            Material Recon Auditor
          </h1>
          <p className="text-slate-900 font-medium mt-1 uppercase text-[10px] font-medium tracking-[0.2em]">Theoretical vs Actual Consumption Intelligence</p>
        </div>
        
        <div className="flex items-center gap-3">
          <select 
            value={activeProject} 
            onChange={e => setActiveProject(e.target.value)} 
            className="bg-slate-800 border border-slate-700 text-slate-200 rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-blue-500/20 min-w-[280px]"
          >
            <option value="">Select Project for Audit...</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          
          <button 
            onClick={() => refetch()}
            disabled={!activeProject || isRefetching}
            className="p-2.5 bg-slate-800 border border-slate-700 text-slate-900 font-medium hover:text-white rounded-xl transition-all disabled:opacity-50"
          >
            <RefreshCw className={clsx("w-5 h-5", isRefetching && "animate-spin")} />
          </button>
        </div>
      </div>

      {!activeProject ? (
        <div className="py-32 bg-slate-900/40 border border-dashed border-slate-800 rounded-[2.5rem] flex flex-col items-center justify-center">
            <PackageSearch className="w-16 h-16 text-slate-900 mb-4" />
            <h3 className="text-xl font-medium text-slate-900 font-medium italic">Project Stream Selection Required</h3>
            <p className="text-slate-900 font-medium mt-2">Choose a project above to run the automated engineering audit.</p>
        </div>
      ) : isLoading ? (
        <div className="space-y-6 animate-pulse">
          <div className="grid grid-cols-4 gap-6 h-32 bg-slate-800/20 rounded-3xl" />
          <div className="h-[400px] bg-slate-800/20 rounded-3xl" />
        </div>
      ) : (
        <>
          {/* Dashboard Summary */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <SummaryCard label="Total Audited" value={records.length} icon={<Activity />} color="text-slate-100" />
            <SummaryCard label="OK Status" value={statusCounts.ok || 0} icon={<ShieldCheck />} color="text-emerald-500" />
            <SummaryCard label="Warnings" value={statusCounts.warning || 0} icon={<AlertTriangle />} color="text-amber-500" />
            <SummaryCard label="Critical" value={statusCounts.critical || 0} icon={<ShieldAlert />} color="text-rose-500" />
          </div>

          {criticalItems.length > 0 && (
            <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-2xl flex items-center gap-4 animate-in slide-in-from-top-4 duration-500">
               <ShieldAlert className="text-rose-500" />
               <p className="text-xs font-medium uppercase tracking-widest text-rose-200">
                 Critical Variance Detected in {criticalItems.length} materials. Excess consumption exceeds 1.5x allowable limits.
               </p>
            </div>
          )}

          {/* Recovery Summary — the actual $ figure this audit exists to produce */}
          {summary && (
            <div className="p-6 bg-slate-900/60 border border-slate-800 rounded-3xl">
              <div className="flex items-center gap-3 text-blue-500 uppercase text-[10px] font-medium tracking-widest mb-4">
                <ShieldCheck size={18} /> Recovery Summary
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                  <p className="text-[10px] font-medium text-slate-900 uppercase tracking-widest mb-1">Total Suggested Recovery</p>
                  <p className="text-2xl font-medium text-slate-100">{inr(summary.total_suggested_recovery)}</p>
                </div>
                <div>
                  <p className="text-[10px] font-medium text-slate-900 uppercase tracking-widest mb-1">Previously Recovered</p>
                  <p className="text-2xl font-medium text-slate-400">{inr(summary.previously_recovered)}</p>
                </div>
                <div>
                  <p className="text-[10px] font-medium text-slate-900 uppercase tracking-widest mb-1">Net Recovery Due</p>
                  <p className={clsx("text-2xl font-medium", summary.net_recovery_due > 0 ? "text-rose-500" : "text-emerald-500")}>{inr(summary.net_recovery_due)}</p>
                </div>
              </div>
              {summary.reason && (
                <p className="text-xs text-slate-400 mt-4 italic">{summary.reason}</p>
              )}
            </div>
          )}

          {/* Audit Table */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-[2.5rem] overflow-hidden shadow-2xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-800/40 text-[10px] font-medium uppercase tracking-[0.25em] text-slate-900 font-medium border-b border-slate-800">
                  <tr>
                    <th className="px-8 py-5">Material Domain</th>
                    <th className="px-6 py-5 text-right">Theoretical Qty</th>
                    <th className="px-6 py-5 text-right">Actual Issues</th>
                    <th className="px-6 py-5 text-right">Variance %</th>
                    <th className="px-6 py-5 text-right">Excess Loss</th>
                    <th className="px-8 py-5 text-center">Audit Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {records.map((r, i) => (
                    <tr key={i} className="hover:bg-slate-800/30 transition-colors group">
                      <td className="px-8 py-5">
                        <div className="font-medium text-slate-100">{r.material_name}</div>
                        <div className="text-[10px] text-slate-900 font-medium uppercase tracking-widest mt-0.5">{r.unit} · Norm Factor Active</div>
                      </td>
                      <td className="px-6 py-5 text-right font-mono text-slate-400">
                        {r.theoretical_qty.toFixed(2)}
                      </td>
                      <td className="px-6 py-5 text-right font-mono text-slate-200">
                        {r.actual_issued_qty.toFixed(2)}
                      </td>
                      <td className={clsx("px-6 py-5 text-right font-medium font-mono", r.status === 'ok' ? 'text-emerald-500' : 'text-rose-500')}>
                        {r.variance_pct.toFixed(2)}%
                      </td>
                      <td className="px-6 py-5 text-right">
                        <div className={clsx("font-bold", r.excess_wastage > 0 ? "text-rose-500" : "text-slate-500")}>
                          {r.excess_wastage.toFixed(2)} {r.unit}
                        </div>
                        <div className="text-[9px] font-medium text-slate-900 uppercase">Above {r.allowed_wastage_pct}% Allowable</div>
                      </td>
                      <td className="px-8 py-5 text-center">
                        <span className={clsx(
                          "px-3 py-1 rounded-full text-[10px] font-medium uppercase tracking-widest border",
                          r.status === 'ok' ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" : 
                          r.status === 'warning' ? "bg-amber-500/10 text-amber-500 border-amber-500/20" :
                          "bg-rose-500/10 text-rose-500 border-rose-500/20"
                        )}>
                          {r.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {records.length === 0 && (
                    <tr>
                      <td colSpan="6" className="py-24 text-center">
                        <Info className="w-12 h-12 mx-auto text-slate-900 mb-3" />
                        <h3 className="text-slate-900 font-medium uppercase tracking-widest text-xs">No issue notes or norms found for this project</h3>
                        <p className="text-slate-900 text-[10px] mt-1 font-medium italic">Please verify if Consumption Norms are mapped in the Library.</p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Directives Section */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="p-8 bg-slate-900/60 border border-slate-800 rounded-3xl space-y-4">
              <div className="flex items-center gap-3 text-blue-500 uppercase text-[10px] font-medium tracking-widest">
                <ShieldCheck size={18} /> Financial Directive
              </div>
              <p className="text-sm font-medium text-slate-300 leading-relaxed">
                Automated auditing suggests a total recovery check for {criticalItems.length} materials. 
                Suggested action: Link excess wastage to the next RA Bill for deduction at standard purchase rates.
              </p>
              <button
                onClick={() => navigate('/qs/ra-bills/new')}
                className="flex items-center gap-2 text-blue-400 font-medium text-xs uppercase tracking-widest group"
              >
                Review Recovery Protocol <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform" />
              </button>
            </div>

            <div className="p-8 bg-slate-900/60 border border-slate-800 rounded-3xl space-y-4">
              <div className="flex items-center gap-3 text-amber-500 uppercase text-[10px] font-medium tracking-widest">
                <Zap size={18} /> Site Level Analysis
              </div>
              <p className="text-sm font-medium text-slate-300 leading-relaxed">
                Variance anomaly detected in high-bulk materials. Recommend immediate physical verification
                of on-site inventory against current Issue Notes to pinpoint handling losses.
              </p>
              <button
                onClick={() => refetch()}
                disabled={isRefetching}
                className="flex items-center gap-2 text-amber-500 font-medium text-xs uppercase tracking-widest group disabled:opacity-50"
              >
                {isRefetching ? 'Re-running…' : 'Re-run Audit'} <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform" />
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function SummaryCard({ label, value, icon, color }) {
  return (
    <div className="bg-slate-900 border border-slate-800 p-6 rounded-3xl hover:border-slate-700 transition-colors group">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-medium text-slate-900 font-medium uppercase tracking-widest">{label}</span>
        <div className={clsx("w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center transition-colors", color.replace('text', 'bg-').replace('500', '500/10'), color)}>
          {icon}
        </div>
      </div>
      <div className={clsx("text-4xl font-medium tracking-tighter", color)}>{value}</div>
    </div>
  );
}
