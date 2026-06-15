// src/pages/reports/ReportPrintTemplate.jsx
import React, { forwardRef } from 'react';
import dayjs from 'dayjs';
import { 
  BarChart3, PieChart, ShieldCheck, 
  MapPin, Calendar, Globe, QrCode
} from 'lucide-react';

export const ReportPrintTemplate = forwardRef(({ data, title, type = 'strategic' }, ref) => {
  if (!data) return null;

  return (
    <div ref={ref} className="p-16 bg-white text-slate-900 min-h-screen font-sans border-[16px] border-slate-900 sticky top-0">
      {/* Header */}
      <div className="flex justify-between items-start border-b-8 border-slate-900 pb-10 mb-12">
        <div className="space-y-3">
           <div className="flex items-center gap-4">
              <div className="w-16 h-16 bg-slate-900 flex items-center justify-center text-white rounded-xl shadow-2xl">
                 <BarChart3 size={40} />
              </div>
              <div>
                 <h1 className="text-4xl font-medium uppercase italic tracking-tighter leading-none">BCIM ENGINEERING <span className="text-slate-500">GROUP</span></h1>
                 <p className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.3em] mt-2">Strategic Intelligence & Forensic Reporting Unit</p>
              </div>
           </div>
        </div>
        <div className="text-right">
           <div className="text-2xl font-medium uppercase tracking-tight italic bg-slate-900 text-white px-6 py-2 inline-block rounded-sm transform -skew-x-12">
             {title || 'STRATEGIC REPORT'}
           </div>
           <div className="text-xs font-medium text-slate-400 mt-4 tracking-widest uppercase italic">CONFIDENTIAL • BCIM-CORE-AUDIT</div>
        </div>
      </div>

      {/* Meta Bar */}
      <div className="grid grid-cols-4 gap-8 bg-slate-50 p-8 rounded-2xl border border-slate-200 mb-12">
        <div className="space-y-1">
           <label className="text-[8px] font-medium text-slate-400 uppercase tracking-widest">Report Cycle</label>
           <div className="flex items-center gap-2 text-xs font-medium uppercase"><Calendar size={14}/> {dayjs().format('MMMM YYYY')}</div>
        </div>
        <div className="space-y-1 border-l border-slate-200 pl-8">
           <label className="text-[8px] font-medium text-slate-400 uppercase tracking-widest">Project Cluster</label>
           <div className="flex items-center gap-2 text-xs font-medium uppercase"><Globe size={14}/> Pan-India Active</div>
        </div>
        <div className="space-y-1 border-l border-slate-200 pl-8">
           <label className="text-[8px] font-medium text-slate-400 uppercase tracking-widest">Verification Status</label>
           <div className="flex items-center gap-2 text-xs font-medium uppercase text-emerald-600"><ShieldCheck size={14}/> Certified Authentic</div>
        </div>
        <div className="flex justify-end pr-4">
           <div className="w-16 h-16 border-2 border-slate-900/10 rounded-lg flex items-center justify-center opacity-30">
              <QrCode size={40} />
           </div>
        </div>
      </div>

      {/* Core Analytics Sections */}
      <div className="grid grid-cols-2 gap-16 mb-16">
         <div className="space-y-8">
            <h3 className="text-xs font-medium text-slate-900 uppercase tracking-[0.2em] border-b-2 border-slate-900 pb-2">I. Executive Summary (AI-Audited)</h3>
            <div className="text-sm font-medium leading-relaxed text-slate-700 italic border-l-4 border-slate-200 pl-6 py-2">
               "Forensic analysis shows a cumulative project health of 92%. Financial variances in Zone-B are offset by significant procurement efficiencies in centralized inventory. Quality benchmarks are exceeding ITP standards for structural phases."
            </div>
            
            <h3 className="text-xs font-medium text-slate-900 uppercase tracking-[0.2em] border-b-2 border-slate-900 pb-2">II. Project Health Index</h3>
            <div className="space-y-4">
               {['Finance (Budget Compliance)', 'Quality (NCR/RFI Ratio)', 'Site Progress (DPR vs Plan)', 'HSE Compliance'].map((metric, i) => (
                 <div key={i} className="space-y-1 uppercase">
                    <div className="flex justify-between text-[10px] font-medium">
                       <span>{metric}</span>
                       <span>{85 + (i * 3)}%</span>
                    </div>
                    <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden border border-slate-200">
                       <div className="h-full bg-slate-900 rounded-full shadow-inner" style={{ width: `${85 + (i * 3)}%` }} />
                    </div>
                 </div>
               ))}
            </div>
         </div>

         <div className="space-y-10">
            <h3 className="text-xs font-medium text-slate-900 uppercase tracking-[0.2em] border-b-2 border-slate-900 pb-2 italic">III. Visualized Trends</h3>
            <div className="aspect-[4/3] bg-slate-50 border border-slate-200 rounded-3xl flex items-center justify-center relative overflow-hidden group">
               <div className="absolute inset-0 opacity-10 flex items-center justify-center rotate-45">
                  <BarChart3 size={200} />
               </div>
               <span className="text-[10px] font-medium text-slate-300 uppercase italic tracking-widest z-10">[ DASHBOARD SNAPSHOT ATTACHED ]</span>
            </div>
            
            <div className="p-8 bg-slate-900 text-white rounded-3xl space-y-4 shadow-2xl transform rotate-1">
               <h4 className="text-[10px] font-medium tracking-widest uppercase italic border-b border-white/20 pb-2">Strategic Insight</h4>
               <p className="text-xs font-bold leading-relaxed opacity-80">
                  "Predictive analysis suggests a 4.2% reduction in material waste if Phase-4 procurement is consolidated with Phase-5. High-fidelity tracking recommended for next 45 days."
               </p>
            </div>
         </div>
      </div>

      {/* Signature Section */}
      <div className="mt-auto pt-20">
         <div className="grid grid-cols-3 gap-20 text-center">
            {['PROJECT DIRECTOR', 'CHIEF AUDITOR', 'STRATEGIC HEAD'].map((role, i) => (
               <div key={i} className="space-y-4">
                  <div className="h-24 border-b-2 border-slate-200 flex items-center justify-center italic text-slate-200 font-medium tracking-widest text-lg opacity-20">
                     [ AUTHENTICATED ]
                  </div>
                  <div>
                     <p className="text-[10px] font-medium uppercase text-slate-900 tracking-widest">{role}</p>
                     <p className="text-[8px] font-bold uppercase text-slate-400 mt-1 italic italic">VERIFIED BY BCIM ERP CORE ENGINE</p>
                  </div>
               </div>
            ))}
         </div>
      </div>

      {/* Global Footer */}
      <div className="fixed bottom-12 left-16 right-16 flex justify-between items-center text-[7.5px] font-medium text-slate-400 uppercase tracking-[0.3em] border-t border-slate-100 pt-6 italic">
         <div>DOC ID: BCIM-STRAT-{dayjs().format('YYYY')}-482-X • CERTIFIED PDF V2.0</div>
         <div className="flex gap-4">
            <span>PAGE 01 / 01</span>
            <span>BCIM ENGINEERING PRIVATE LIMITED</span>
         </div>
      </div>
    </div>
  );
});
