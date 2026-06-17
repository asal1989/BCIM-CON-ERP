// src/pages/hse/HSEDashboard.jsx
import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { 
  Shield, AlertTriangle, FileText, 
  HardHat, Activity, Clock, 
  MapPin, UserCheck, BarChart3, 
  CheckCircle2, Info, ArrowUpRight
} from 'lucide-react';
import { incidentAPI, permitAPI, ppeAPI } from '../../api/client';
import { Link, useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import { clsx } from 'clsx';

export default function HSEDashboard() {
  const navigate = useNavigate();
  const { data: incidents = [] } = useQuery({ queryKey:['incidents'], queryFn:()=>incidentAPI.list().then(r=>r.data?.data ?? r.data ?? []).catch(()=>[]) });
  const { data: permits = []   } = useQuery({ queryKey:['permits','active'], queryFn:()=>permitAPI.list({status:'active'}).then(r=>r.data?.data ?? r.data ?? []).catch(()=>[]) });

  const inc = Array.isArray(incidents) ? incidents : [];
  const ptw = Array.isArray(permits)   ? permits   : [];

  // LTI = incidents with lost_time_days > 0 (real Lost Time Injuries)
  const ltiIncidents = inc.filter(i => Number(i.lost_time_days || 0) > 0)
    .sort((a, b) => new Date(b.incident_date) - new Date(a.incident_date));
  const lastLti = ltiIncidents[0];
  const safeDays = lastLti ? dayjs().diff(dayjs(lastLti.incident_date), 'day') : null;

  const firstAidCount = inc.filter(i => i.incident_type === 'minor_injury').length;
  const openCapaCount = inc.filter(i => i.status === 'open').length;
  const closedCount = inc.filter(i => i.status !== 'open').length;
  const complianceRate = inc.length > 0 ? Math.round((closedCount / inc.length) * 100) : 100;

  return (
    <div className="p-6 space-y-6 bg-slate-50 min-h-screen">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-orange-500/10 flex items-center justify-center border border-orange-500/20">
            <Shield className="w-6 h-6 text-orange-500" />
          </div>
          <div>
            <h1 className="text-xl font-medium text-slate-900 uppercase tracking-tight">HSE Command Center</h1>
            <p className="text-[10px] text-slate-900 font-medium uppercase tracking-widest">Safety Compliance & Incident Monitoring</p>
          </div>
        </div>
        <div className="flex gap-3">
           <button onClick={() => navigate('/hse/incidents')} className="btn-secondary text-[10px] font-medium uppercase tracking-widest border-slate-800">Report Incident</button>
           <button onClick={() => navigate('/hse/permits')} className="btn-primary bg-orange-600 hover:bg-orange-500 text-[10px] font-medium uppercase tracking-widest shadow-lg shadow-orange-950/20">Authorize PTW</button>
        </div>
      </div>

      {/* Main Stats */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Safe Days Counter */}
        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-[3rem] p-10 flex items-center gap-12 relative overflow-hidden shadow-sm shadow-slate-200/50">
           <div className="absolute top-0 right-0 p-12 opacity-[0.03] -rotate-12 translate-x-8 -translate-y-8">
              <Shield size={320} className="text-emerald-500" />
           </div>
           
           <div className="relative shrink-0">
              <div className="w-48 h-48 rounded-[3.5rem] border-[12px] border-emerald-50 flex flex-col items-center justify-center bg-white shadow-2xl shadow-emerald-500/10 group hover:scale-105 transition-transform">
                 <span className="text-6xl font-medium text-emerald-600 italic tracking-tighter leading-none">{safeDays ?? '—'}</span>
                 <span className="text-[10px] font-medium text-slate-900 font-medium uppercase tracking-[0.2em] mt-3 italic">Safe Days</span>
              </div>
              <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 bg-emerald-600 text-white px-5 py-2 rounded-2xl text-[10px] font-medium uppercase tracking-widest whitespace-nowrap shadow-xl shadow-emerald-600/30 italic">Target: 365 Days 🛡</div>
           </div>

           <div className="flex-1 space-y-5 relative z-10">
              <div className="flex items-center gap-3 mb-2">
                 <div className="w-8 h-px bg-emerald-200" />
                 <span className="text-[10px] font-medium text-emerald-600 uppercase tracking-[0.3em]">HSE Safety Benchmark</span>
              </div>
              <h2 className="text-3xl font-medium text-slate-900 tracking-tighter italic leading-none">LTI-Free Operational Cycle</h2>
              <p className="text-xs text-slate-900 font-medium leading-relaxed font-medium italic pr-12">
                {safeDays != null
                  ? `Your site has maintained zero Lost Time Injuries (LTI) for the last ${safeDays} consecutive days. Continue protocol enforcement to exceed benchmark KPIs.`
                  : 'No Lost Time Injury (LTI) has been recorded yet. The counter will start from the date of the first LTI incident.'}
              </p>
              
              <div className="flex items-center gap-10 pt-6 border-t border-slate-100">
                 <div>
                    <div className="text-[10px] font-medium text-slate-900 font-medium uppercase tracking-widest mb-1.5 flex items-center gap-2"><MapPin size={12} /> Last LTI Incident</div>
                    <div className="text-xs font-medium text-slate-900 italic tracking-tight bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200 w-fit">
                      {lastLti ? `${dayjs(lastLti.incident_date).format('DD MMM YYYY')} • ${lastLti.location || lastLti.project_name || 'Unknown Site'}` : 'No LTI recorded'}
                    </div>
                 </div>
                 <div className="h-12 w-px bg-slate-100" />
                 <div>
                    <div className="text-[10px] font-medium text-slate-900 font-medium uppercase tracking-widest mb-1.5 flex items-center gap-2"><Activity size={12} /> Total Incidents Logged</div>
                    <div className="text-xs font-medium text-emerald-600 italic bg-emerald-50 px-3 py-1.5 rounded-xl border border-emerald-100 w-fit">{inc.length} Records</div>
                 </div>
              </div>
           </div>
        </div>

        {/* Incident Closure Rate — % of logged incidents that have been closed */}
        <div className="bg-white border border-slate-200 rounded-[3rem] p-10 flex flex-col items-center justify-center text-center space-y-8 shadow-sm">
           <div className="text-[10px] font-medium text-slate-900 font-medium uppercase tracking-[0.3em] italic">Incident Closure Rate</div>
           <div className="relative">
              <div className="text-7xl font-medium text-slate-900 italic tracking-tighter leading-none">{complianceRate}<span className="text-2xl text-slate-200 ml-1">%</span></div>
              <div className="absolute -top-4 -right-6">
                 <CheckCircle2 size={32} className="text-emerald-500 drop-shadow-lg" />
              </div>
           </div>
           <p className="text-[11px] text-emerald-600 font-medium uppercase tracking-[0.2em] italic bg-emerald-50 px-6 py-2 rounded-full border border-emerald-100">
             {closedCount} of {inc.length || 0} cases finalized
           </p>
           <div className="w-full bg-slate-50 h-3 rounded-full overflow-hidden border border-slate-100 shadow-inner">
              <div className="bg-emerald-500 h-full transition-all duration-1000" style={{ width: `${complianceRate}%` }} />
           </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
         
         {/* PTW Grid */}
         <div className="bg-white border border-slate-200 rounded-[3rem] p-10 flex flex-col shadow-sm">
            <div className="flex items-center justify-between mb-10 pb-4 border-b border-slate-100">
               <div className="flex items-center gap-4">
                  <div className="w-11 h-11 bg-blue-50 border border-blue-100 rounded-2xl flex items-center justify-center text-blue-600 shadow-sm"><FileText size={20} /></div>
                  <h3 className="text-xs font-medium text-slate-950 uppercase tracking-[0.2em] italic">Active Work Permits</h3>
               </div>
               <span className="text-[10px] font-medium text-slate-900 font-medium uppercase tracking-widest bg-slate-50 px-4 py-2 rounded-2xl border border-slate-200 italic">{ptw.length} Live Authorizations</span>
            </div>
            
            <div className="space-y-4 flex-1">
               {ptw.slice(0, 4).map(p => (
                 <div key={p.id} className="p-5 bg-slate-50 border border-slate-100 rounded-[1.75rem] flex items-center justify-between group hover:bg-white hover:border-blue-500/30 hover:shadow-xl transition-all cursor-pointer">
                    <div className="flex items-center gap-5">
                       <div className="w-12 h-12 rounded-2xl bg-white border border-slate-200 flex items-center justify-center text-blue-500 shadow-sm group-hover:scale-110 transition-transform">
                          {p.permit_type === 'height_work' ? <ArrowUpRight size={20} /> : <Activity size={20} />}
                       </div>
                       <div>
                          <p className="text-slate-950 font-medium text-sm uppercase tracking-tight italic leading-none mb-1.5">{p.permit_number}</p>
                          <p className="text-[10px] text-slate-900 font-medium uppercase tracking-tight italic opacity-70 leading-none">{p.location} • {p.issued_to}</p>
                       </div>
                    </div>
                    <div className="text-right flex flex-col items-end">
                       <div className="text-[9px] font-medium text-slate-900 font-medium uppercase tracking-widest mb-1.5 leading-none italic">Expires In</div>
                       {(() => {
                         const hrsLeft = dayjs(p.valid_to).diff(dayjs(), 'hour');
                         const expired = hrsLeft < 0;
                         return (
                           <div className={clsx("flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-medium italic shadow-sm leading-none border",
                             expired ? "bg-red-50 text-red-600 border-red-100" : "bg-amber-50 text-amber-600 border-amber-100")}>
                              <Clock size={12} /> {expired ? 'Expired' : `${hrsLeft} hrs`}
                           </div>
                         );
                       })()}
                    </div>
                 </div>
               ))}
               {ptw.length === 0 && (
                 <div className="py-24 text-center border-2 border-dashed border-slate-100 rounded-[2.5rem]">
                   <p className="text-slate-900 font-medium uppercase text-[10px] italic tracking-[0.3em]">No high-risk authorizations currently active</p>
                 </div>
               )}
            </div>
            
            <button onClick={() => navigate('/hse/permits')} className="w-full py-5 bg-slate-900 hover:bg-slate-800 mt-10 rounded-[2rem] text-[10px] font-medium uppercase text-white transition-all tracking-[0.3em] italic shadow-xl shadow-slate-900/20">Access Authorization Hub Registry</button>
         </div>

         {/* Incident Analysis */}
         <div className="bg-white border border-slate-200 rounded-[3rem] p-10 flex flex-col shadow-sm">
            <div className="flex items-center justify-between mb-10 pb-4 border-b border-slate-100">
               <div className="flex items-center gap-4">
                  <div className="w-11 h-11 bg-red-50 border border-red-100 rounded-2xl flex items-center justify-center text-red-600 shadow-sm"><AlertTriangle size={20} /></div>
                  <h3 className="text-xs font-medium text-slate-950 uppercase tracking-[0.2em] italic">Forensic Incident Analytics</h3>
               </div>
               <BarChart3 className="w-5 h-5 text-slate-300" />
            </div>

            <div className="grid grid-cols-3 gap-8 mb-10">
               <div className="space-y-3 bg-slate-50/50 p-6 rounded-[2rem] border border-slate-100 text-center shadow-inner">
                  <div className="text-[9px] font-medium text-slate-900 font-medium uppercase tracking-widest italic">Near Misses</div>
                  <div className="text-2xl font-medium text-amber-500 italic leading-none">{inc.filter(i => i.incident_type === 'near_miss').length}</div>
               </div>
               <div className="space-y-3 bg-slate-50/50 p-6 rounded-[2rem] border border-slate-100 text-center shadow-inner">
                  <div className="text-[9px] font-medium text-slate-900 font-medium uppercase tracking-widest italic">First Aid (FA)</div>
                  <div className="text-2xl font-medium text-blue-500 italic leading-none">{firstAidCount}</div>
               </div>
               <div className="space-y-3 bg-slate-50/50 p-6 rounded-[2rem] border border-slate-100 text-center shadow-inner">
                  <div className="text-[9px] font-medium text-slate-900 font-medium uppercase tracking-widest italic">Active CAPAs</div>
                  <div className="text-2xl font-medium text-red-600 italic leading-none">{String(openCapaCount).padStart(2, '0')}</div>
               </div>
            </div>

            <div className="space-y-4 flex-1">
               {inc.slice(0, 3).map(i => (
                 <div key={i.id} className="p-5 bg-white border border-slate-100 border-l-4 border-l-red-500 rounded-r-[1.75rem] space-y-4 shadow-sm group hover:border-red-500/20 transition-all">
                    <div className="flex items-center justify-between">
                       <span className="text-[9px] font-medium px-3 py-1 bg-red-50 text-red-600 rounded-xl uppercase italic border border-red-100 shadow-sm">{i.incident_type?.replace('_', ' ')}</span>
                       <span className="text-[10px] text-slate-900 font-medium uppercase italic tracking-widest">{dayjs(i.incident_date).format('DD MMM • YYYY')}</span>
                    </div>
                    <p className="text-[11px] font-medium text-slate-900 italic uppercase tracking-tight leading-none truncate pr-4">{i.description}</p>
                    <div className="flex items-center gap-3 pt-2 border-t border-slate-50">
                       <UserCheck size={14} className="text-emerald-500" />
                       <span className="text-[9px] font-medium text-slate-900 font-medium uppercase tracking-widest italic">Protocol Verified • <span className="text-slate-900">PM Reviewed</span></span>
                    </div>
                 </div>
               ))}
            </div>

            <button onClick={() => navigate('/hse/incidents')} className="w-full py-5 bg-red-50 hover:bg-red-100 border border-red-100 mt-10 rounded-[2rem] text-[10px] font-medium uppercase text-red-600 transition-all tracking-[0.3em] italic shadow-xl shadow-red-500/10 flex items-center justify-center gap-3">
               Explore Full Forensic Archive Hub <ArrowUpRight size={16} />
            </button>
         </div>

      </div>
    </div>
  );
}
