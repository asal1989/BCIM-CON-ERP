// src/pages/reports/Project360Page.jsx
import React, { useState, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { 
  BarChart3, TrendingUp, TrendingDown, 
  Activity, ShieldAlert, DollarSign, 
  Target, Layers, Package, Truck, 
  HardHat, Info, Download, ArrowLeft,
  ChevronRight, Calendar, Building2, Printer,
  Globe, ShieldCheck, Zap, AlertCircle
} from 'lucide-react';
import { analyticsAPI, projectAPI } from '../../api/client';
import { clsx } from 'clsx';
import { useNavigate, Link } from 'react-router-dom';
import dayjs from 'dayjs';
import { useReactToPrint } from 'react-to-print';
import { ReportPrintTemplate } from './ReportPrintTemplate';
import AIInsightPanel from './AIInsightPanel';

export default function Project360Page() {
  const navigate = useNavigate();
  const [selectedProjectId, setSelectedProjectId] = useState('');
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
    queryKey: ['project-360', selectedProjectId],
    queryFn: () => analyticsAPI.project360(selectedProjectId).then(r => r.data?.data ?? r.data ?? []).catch(() => []),
    enabled: !!selectedProjectId
  });

  const { data: globalStats, isLoading: isLoadingGlobal } = useQuery({
    queryKey: ['global-analytics'],
    queryFn: () => analyticsAPI.global().then(r => r.data?.data ?? r.data ?? []).catch(() => []),
    enabled: !selectedProjectId
  });

  const f = (v) => {
    const val = parseFloat(v || 0);
    return `₹${val.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  return (
    <div className="p-6 bg-slate-50 min-h-screen space-y-8">
      {/* Off-screen Print Template */}
      <div style={{ display: 'none' }}>
        <ReportPrintTemplate ref={printRef} data={printData} title="PROJECT 360 AUDIT" />
      </div>

      {/* Header & Selector */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div className="flex items-center gap-4">
           <div className="w-14 h-14 rounded-2xl bg-indigo-500/10 flex items-center justify-center border border-indigo-500/20 shadow-xl shadow-indigo-500/10">
              <Activity className="w-8 h-8 text-indigo-500" />
           </div>
           <div>
              <h1 className="text-3xl font-medium text-slate-900 uppercase tracking-tighter italic">Strategic Command Hub</h1>
              <p className="text-[10px] text-slate-900 font-medium uppercase tracking-[0.3em] flex items-center gap-2 italic">
                 <Globe size={12} className="text-indigo-600" /> 360° Real-time Forensic Intelligence
              </p>
           </div>
        </div>

        <div className="flex items-center gap-3 bg-white p-2 rounded-[2rem] border border-slate-200 shadow-sm">
           <select 
             className="bg-transparent text-[10px] font-medium text-slate-900 uppercase tracking-widest outline-none px-6 py-2 min-w-[250px]"
             value={selectedProjectId}
             onChange={e => setSelectedProjectId(e.target.value)}
           >
              <option value="">Select Command Target...</option>
              {projects?.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
           </select>
           {selectedProjectId && (
             <button 
               onClick={() => { setPrintData(stats); setTimeout(handlePrint, 100); }}
               className="px-6 py-2.5 bg-white hover:bg-slate-50 text-slate-900 text-[10px] font-medium uppercase tracking-widest rounded-full transition-all border border-slate-200 flex items-center gap-2 shadow-sm"
             >
                <Printer size={14} /> Export Audit PDF
             </button>
           )}
        </div>
      </div>

      {!selectedProjectId ? (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-6 duration-1000">
           {/* Global Corporate Narrative Layer */}
           <div className="bg-white border border-slate-200 rounded-[3rem] p-10 flex items-center justify-between shadow-sm">
              <div className="space-y-2">
                 <h2 className="text-3xl font-medium text-slate-900 italic tracking-tighter uppercase leading-none">Global Corporate Pulse</h2>
                 <p className="text-[10px] font-medium text-slate-900 font-medium uppercase tracking-[0.4em]">Aggregating Forensic Data from all Active Sites</p>
              </div>
              <div className="flex items-center gap-4">
                 <div className="text-right">
                    <p className="text-[9px] font-medium text-slate-900 uppercase tracking-widest leading-none mb-1">Total Active Portfolio</p>
                    <p className="text-2xl font-medium text-indigo-600 italic">
                       {isLoadingGlobal ? '...' : (globalStats?.global.project_count || projects?.length || 0)} Units
                    </p>
                 </div>
                 <div className="w-14 h-14 rounded-2xl bg-indigo-500/10 flex items-center justify-center border border-indigo-500/20 shadow-xl shadow-indigo-500/10">
                    <Globe size={32} className="text-indigo-500 animate-[pulse_3s_infinite]" />
                 </div>
              </div>
           </div>

           {/* Global Stats Grid */}
           <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <CommandStat 
                label="Aggregate Revenue" 
                value={isLoadingGlobal ? '...' : f(globalStats?.global.revenue)} 
                sub="Global Billed Volume"
                trend={+8.4}
                color="text-indigo-600"
              />
              <CommandStat 
                 label="Group Margin" 
                 value={isLoadingGlobal ? '...' : `${(globalStats?.global.margin || 0).toFixed(1)}%`} 
                 sub="Portfolio Gross Profit"
                 color="text-emerald-600"
                 icon={TrendingUp}
              />
              <CommandStat 
                 label="HSE Compliance" 
                 value={isLoadingGlobal ? '...' : `${(globalStats?.global.safety_score || 0).toFixed(1)}%`} 
                 sub="Safety Audit Integrity"
                 color="text-blue-600"
                 icon={ShieldCheck}
              />
              <CommandStat 
                 label="Quality Pass Rate" 
                 value={isLoadingGlobal ? '...' : `${(globalStats?.global.quality_score || 0).toFixed(1)}%`} 
                 sub="ITP Verification Score"
                 color="text-amber-600"
                 icon={ShieldCheck}
              />
           </div>

           {/* Call to Action */}
           <div className="bg-white border border-slate-200 rounded-[3rem] p-12 text-center space-y-6 shadow-sm">
              <div className="max-w-xl mx-auto space-y-2">
                 <h3 className="text-xl font-medium text-slate-900 uppercase italic">Interactive Site Drill-down</h3>
                 <p className="text-[10px] font-medium text-slate-900 font-medium uppercase tracking-widest leading-relaxed">
                    Select a specific project target from the dropdown above to engage the deep-dive forensic audit layer for site-specific production alignment and cost dispersion.
                 </p>
              </div>
              <div className="flex justify-center gap-3">
                 <div className="w-1.5 h-1.5 rounded-full bg-slate-200" />
                 <div className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-pulse" />
                 <div className="w-1.5 h-1.5 rounded-full bg-slate-200" />
              </div>
           </div>
        </div>
      ) : isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
           {[1,2,3,4].map(i => <div key={i} className="h-40 bg-white rounded-[2.5rem] animate-pulse border border-slate-200" />)}
        </div>
      ) : (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-6 duration-1000">
           
           {/* AI Insight Layer */}
           <AIInsightPanel data={stats} />

           {/* Top Stats: The Command Pulse */}
           <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <CommandStat 
                label="Certified Revenue" 
                value={f(stats.financials.revenue.total_revenue_booked)} 
                sub={`Total Inflow Certification`}
                trend={+12.5}
                color="text-indigo-600"
              />
              <CommandStat 
                label="Realized Margin" 
                value={`${((stats.financials.revenue.total_revenue_booked - stats.financials.costs.total) / (stats.financials.revenue.total_revenue_booked || 1) * 100).toFixed(1)}%`} 
                sub="Actual Project Gross Profit"
                color="text-emerald-600"
                icon={TrendingUp}
              />
              <CommandStat 
                label="Total Capex/Opex" 
                value={f(stats.financials.costs.total)} 
                sub="Cumulative Project Expenditure"
                color="text-slate-600"
              />
              <CommandStat 
                label="Safety Rating" 
                value={stats.safety.major_accidents > 0 ? 'CRITICAL' : 'ZERO INCIDENT'} 
                sub={`${stats.safety.incident_count} Incidents (Last 30d)`}
                color={stats.safety.major_accidents > 0 ? 'text-red-600' : 'text-blue-600'}
                icon={ShieldAlert}
              />
           </div>

           <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* Progress & Production Alignment */}
              <div className="lg:col-span-2 bg-white border border-slate-200 rounded-[3rem] p-10 space-y-10 overflow-hidden relative shadow-sm">
                 <div className="absolute top-0 right-0 p-12 opacity-5 pointer-events-none">
                    <Activity size={200} />
                 </div>
                 
                 <div className="flex items-center justify-between relative z-10">
                    <div className="space-y-1">
                       <h3 className="text-[10px] font-medium text-slate-900 font-medium uppercase tracking-[0.4em] italic mb-1">Production Alignment</h3>
                       <p className="text-2xl font-medium text-slate-900 italic uppercase tracking-tighter">Physical vs. Financial Progress</p>
                    </div>
                    <div className="text-right">
                       <span className="text-[9px] bg-emerald-50 text-emerald-600 border border-emerald-200 px-4 py-1.5 rounded-full font-medium uppercase tracking-widest italic flex items-center gap-2">
                          <CheckCircle2 size={12} /> Sync Status: Optimized
                       </span>
                    </div>
                 </div>

                 <div className="grid grid-cols-2 gap-16 relative z-10">
                    <div className="space-y-5">
                       <div className="flex justify-between items-end pb-2 border-b border-slate-100">
                          <span className="text-[10px] font-medium text-slate-900 font-medium uppercase tracking-widest">Physical Completion</span>
                          <span className="text-xl font-medium text-indigo-600 italic">{stats.progress.pct.toFixed(1)}%</span>
                       </div>
                       <ProgressGauge pct={stats.progress.pct} color="indigo" />
                    </div>
                    <div className="space-y-5">
                       <div className="flex justify-between items-end pb-2 border-b border-slate-100">
                          <span className="text-[10px] font-medium text-slate-900 font-medium uppercase tracking-widest">Revenue Realization</span>
                          <span className="text-xl font-medium text-emerald-600 italic">{((stats.financials.revenue.total_certified_amount / (stats.progress.total_boq_value || 1)) * 100).toFixed(1)}%</span>
                       </div>
                       <ProgressGauge pct={(stats.financials.revenue.total_certified_amount / (stats.progress.total_boq_value || 1)) * 100} color="emerald" />
                    </div>
                 </div>

                 {/* Detailed Breakdown Grid */}
                 <div className="pt-10 border-t border-slate-100 relative z-10">
                    <div className="grid grid-cols-4 gap-8 text-center text-xs">
                       <div className="space-y-1">
                          <div className="text-[8px] font-medium text-slate-900 uppercase tracking-widest font-mono">Contract Value</div>
                          <div className="text-lg font-medium text-slate-900 font-medium font-mono italic">{f(stats.progress.total_boq_value)}</div>
                       </div>
                       <div className="space-y-1 border-l border-slate-100">
                          <div className="text-[8px] font-medium text-slate-900 uppercase tracking-widest font-mono">Billed (RA)</div>
                          <div className="text-lg font-medium text-indigo-600 font-mono italic">{f(stats.financials.revenue.total_revenue_booked)}</div>
                       </div>
                       <div className="space-y-1 border-l border-slate-100">
                          <div className="text-[8px] font-medium text-slate-900 uppercase tracking-widest font-mono">Retention</div>
                          <div className="text-lg font-medium text-amber-500 font-mono italic">{f(stats.financials.revenue.total_retention_held)}</div>
                       </div>
                       <div className="space-y-1 border-l border-slate-100">
                          <div className="text-[8px] font-medium text-slate-900 uppercase tracking-widest font-mono">Expenditure</div>
                          <div className="text-lg font-medium text-red-500 font-mono italic">{f(stats.financials.costs.total)}</div>
                       </div>
                    </div>
                 </div>
              </div>

              {/* Resource Cost Dispersion */}
              <div className="bg-white border border-slate-200 rounded-[3rem] p-10 flex flex-col relative overflow-hidden shadow-sm">
                 <div className="absolute top-0 right-0 p-8 opacity-5">
                    <PieChart size={120} />
                 </div>
                 <h3 className="text-[10px] font-medium text-slate-900 font-medium uppercase tracking-[0.4em] mb-10 italic relative z-10">Resource Cost Dispersion</h3>
                 
                 <div className="space-y-8 flex-1 relative z-10">
                    <DispersionBlock label="Material & Procurement" value={stats.financials.costs.materials} total={stats.financials.costs.total} icon={Package} color="bg-emerald-500 shadow-emerald-500/10" />
                    <DispersionBlock label="Plant & Machinery" value={stats.financials.costs.assets} total={stats.financials.costs.total} icon={Truck} color="bg-indigo-500 shadow-indigo-500/10" />
                    <DispersionBlock label="Forensic Labor Pool" value={stats.financials.costs.labor} total={stats.financials.costs.total} icon={HardHat} color="bg-amber-500 shadow-amber-500/10" />
                 </div>

                 <div className="mt-10 pt-10 border-t border-slate-100 relative z-10">
                    <div className="text-[9px] font-medium text-slate-900 uppercase tracking-[0.2em] mb-6 flex items-center gap-3 font-mono italic">
                       <Zap size={14} className="text-amber-500" /> Insight: Operations are Material-intensive ({( (stats.financials.costs.materials / stats.financials.costs.total) * 100 ).toFixed(0)}%)
                    </div>
                    <button 
                      onClick={() => navigate('/qs/material-recon')}
                      className="w-full py-4 bg-slate-50 border border-slate-200 text-[10px] font-medium uppercase text-slate-900 hover:bg-slate-100 transition-all rounded-2xl tracking-[0.2em] flex items-center justify-center gap-2 italic uppercase shadow-sm"
                    >
                       Analyze Material Reconciliation <ChevronRight size={14} />
                    </button>
                 </div>
              </div>
           </div>

           {/* Quick Strategic Junctions */}
           <div className="grid grid-cols-2 lg:grid-cols-5 gap-6">
              <ActionCard icon={Layers} label="BOQ Tracking" to="/qs/boq" color="indigo" />
              <ActionCard icon={Receipt} label="RA Bills" to="/qs/ra-bills" color="emerald" />
              <CommandStat Mini label="Pending Stocks" value="04" sub="Open MINs" color="text-amber-500" />
              <CommandStat Mini label="Supply Chain" value="12" sub="Open POs" color="text-indigo-600" />
              <CommandStat Mini label="Attendance" value="86%" sub="Labor Flow" color="text-emerald-500" />
           </div>
        </div>
      )}
    </div>
  );
}

function CommandStat({ label, value, sub, trend, color, icon: Icon, Mini }) {
  if (Mini) {
    return (
      <div className="bg-white border border-slate-200 rounded-[2rem] flex items-center gap-4 p-6 hover:border-indigo-500/20 transition-all shadow-sm">
         <div className={clsx("w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center border border-slate-100", color)}>
            <div className="text-xl font-medium italic">{value}</div>
         </div>
         <div>
            <div className="text-[8px] font-medium text-slate-900 font-medium uppercase tracking-widest leading-none mb-1">{label}</div>
            <div className="text-[10px] font-medium text-slate-900 uppercase tracking-tighter">{sub}</div>
         </div>
      </div>
    );
  }

  return (
    <div className="bg-white border border-slate-200 rounded-[2.5rem] hover:border-indigo-500/30 transition-all group overflow-hidden relative p-8 shadow-sm">
       <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-indigo-500/0 via-indigo-500/50 to-indigo-500/0 opacity-0 group-hover:opacity-100 transition-opacity" />
       
       <div className="flex justify-between items-start mb-6 relative z-10">
          <span className="text-[10px] font-medium text-slate-900 font-medium uppercase tracking-widest block">{label}</span>
          {Icon ? <Icon className={clsx("w-6 h-6", color)} /> : (trend && <span className={clsx("text-xs font-medium italic", trend > 0 ? "text-emerald-600" : "text-red-600")}>{trend > 0 ? '↑' : '↓'} {Math.abs(trend)}%</span>)}
       </div>
       <div className={clsx('text-4xl font-medium italic tracking-tighter text-slate-900 mb-2 relative z-10', color)}>
          {value}
       </div>
       <div className="text-[10px] text-slate-900 font-medium uppercase tracking-[0.2em] relative z-10 italic">{sub}</div>
    </div>
  );
}

function ProgressGauge({ pct, color }) {
  const colors = {
    indigo: 'from-indigo-600 to-blue-500 shadow-indigo-500/20',
    emerald: 'from-emerald-600 to-teal-500 shadow-emerald-500/20'
  }
  return (
    <div className="relative h-6 bg-slate-100 rounded-full border border-slate-200 overflow-hidden shadow-inner flex items-center pr-4">
       <div 
         className={clsx("absolute left-0 top-0 h-full bg-gradient-to-r transition-all duration-1000 ease-out shadow-lg", colors[color])}
         style={{ width: `${Math.min(pct, 100)}%` }}
       >
          <div className="absolute inset-0 bg-[linear-gradient(45deg,rgba(255,255,255,0.15)_25%,transparent_25%,transparent_50%,rgba(255,255,255,0.15)_50%,rgba(255,255,255,0.15)_75%,transparent_75%,transparent)] bg-[length:24px_24px] animate-[progress-bar-stripes_1s_linear_infinite]" />
       </div>
       <div className="ml-auto relative z-10 text-[10px] font-medium text-slate-900 font-medium tracking-tighter italic">LIVE FEED</div>
    </div>
  );
}

function DispersionBlock({ label, value, total, icon: Icon, color }) {
  const pct = total > 0 ? (value / total) * 100 : 0;
  return (
    <div className="space-y-4">
       <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
             <div className={clsx("w-10 h-10 rounded-xl flex items-center justify-center border border-slate-100 shadow-sm bg-slate-50", color.replace('bg-', 'text-'))}>
                <Icon size={20} />
             </div>
             <div className="space-y-0.5">
                <div className="text-[10px] font-medium text-slate-900 uppercase tracking-tight italic">{label}</div>
                <div className="text-[9px] text-slate-900 font-medium font-mono">₹{parseFloat(value).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
             </div>
          </div>
          <div className="text-right">
             <div className="text-sm font-medium text-slate-900 font-mono italic tracking-tighter">{pct.toFixed(1)}%</div>
          </div>
       </div>
       <div className="h-2 bg-slate-100 rounded-full overflow-hidden border border-slate-200">
          <div className={clsx("h-full transition-all duration-1000 rounded-full", color)} style={{ width: `${pct}%` }} />
       </div>
    </div>
  );
}

function ActionCard({ icon: Icon, label, to, color }) {
  const colors = {
    indigo: 'hover:border-indigo-500/30 hover:bg-indigo-50 text-indigo-600',
    emerald: 'hover:border-emerald-500/30 hover:bg-emerald-50 text-emerald-600'
  }
  return (
    <Link to={to} className={clsx("bg-white border border-slate-200 rounded-[2rem] flex flex-col items-center justify-center gap-4 p-8 transition-all group shadow-sm", colors[color])}>
       <div className="w-12 h-12 rounded-2xl bg-slate-50 flex items-center justify-center border border-slate-100 group-hover:scale-110 transition-transform">
          <Icon size={24} />
       </div>
       <span className="text-[9px] font-medium uppercase tracking-[0.2em] text-slate-900 font-medium group-hover:text-slate-900 transition-colors italic">{label}</span>
    </Link>
  );
}

function CheckCircle2(props) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
     Griffin
    >
      <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  )
}

function Receipt(props) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z" />
      <path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8" />
      <path d="M12 17.5V19" />
      <path d="M12 5v1.5" />
    </svg>
  )
}

function PieChart(props) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21.21 15.89A10 10 0 1 1 8 2.83" />
      <path d="M22 12A10 10 0 0 0 12 2v10z" />
    </svg>
  )
}
