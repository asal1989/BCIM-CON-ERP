// src/pages/quality/QualityPrintTemplate.jsx
import React, { forwardRef } from 'react';
import dayjs from 'dayjs';
import { 
  ShieldCheck, MapPin, Calendar, 
  User, CheckSquare, Layers, 
  AlertCircle, PenTool
} from 'lucide-react';

export const QualityPrintTemplate = forwardRef(({ data, type = 'rfi' }, ref) => {
  if (!data) return null;

  return (
    <div ref={ref} className="p-16 bg-white text-slate-900 min-h-screen font-sans border-[12px] border-slate-900 sticky top-0">
      {/* Branded Header */}
      <div className="flex justify-between items-start border-b-4 border-slate-900 pb-8 mb-10">
        <div className="space-y-2">
           <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-slate-900 flex items-center justify-center text-white rounded">
                 <ShieldCheck size={32} />
              </div>
              <h1 className="text-4xl font-medium uppercase italic tracking-tighter">BCIM CONSTRUCT<span className="text-slate-500">ERP</span></h1>
           </div>
           <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest pl-1">Quality Assurance & Forensic Compliance Division</p>
        </div>
        <div className="text-right">
           <div className="text-2xl font-medium uppercase tracking-tight italic bg-slate-900 text-white px-4 py-1 inline-block">
             {type === 'rfi' ? 'INSPECTION CERTIFICATE' : 'NON-CONFORMANCE REPORT'}
           </div>
           <div className="text-sm font-bold text-slate-500 mt-2 tracking-widest uppercase">{data.rfi_number || data.ncr_number}</div>
        </div>
      </div>

      {/* Primary Context */}
      <div className="grid grid-cols-2 gap-12 mb-12">
        <div className="space-y-6">
           <div className="space-y-1">
              <label className="text-[8px] font-medium text-slate-400 uppercase tracking-widest">Project / Contract</label>
              <div className="text-lg font-bold uppercase">{data.project_name}</div>
           </div>
           <div className="space-y-1">
              <label className="text-[8px] font-medium text-slate-400 uppercase tracking-widest">Inspection Activity / Scope</label>
              <div className="text-sm font-bold uppercase border-l-4 border-slate-900 pl-4">{data.activity_name || data.description}</div>
           </div>
           <div className="space-y-1">
              <label className="text-[8px] font-medium text-slate-400 uppercase tracking-widest">Site Location / Zone</label>
              <div className="text-sm font-bold uppercase flex items-center gap-2">
                 <MapPin size={14} className="text-slate-400" /> {data.location}
              </div>
           </div>
        </div>
        <div className="space-y-6">
           <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                 <label className="text-[8px] font-medium text-slate-400 uppercase tracking-widest">Scheduled Date</label>
                 <div className="text-xs font-bold uppercase flex items-center gap-2">
                    <Calendar size={14} className="text-slate-400" /> {dayjs(data.scheduled_at || data.created_at).format('DD MMM YYYY • HH:mm')}
                 </div>
              </div>
              <div className="space-y-1">
                 <label className="text-[8px] font-medium text-slate-400 uppercase tracking-widest">Authorized By</label>
                 <div className="text-xs font-bold uppercase flex items-center gap-2">
                    <User size={14} className="text-slate-400" /> {data.raised_by_name}
                 </div>
              </div>
           </div>
           <div className="space-y-1">
              <label className="text-[8px] font-medium text-slate-400 uppercase tracking-widest">Reference Drawing (GFC)</label>
              <div className="text-xs font-medium uppercase text-slate-600 bg-slate-100 p-3 rounded border border-slate-200 flex items-center gap-2 tracking-tighter">
                 <Layers size={14} /> {data.drawing_number || 'N/A'} — {data.drawing_title || 'General Compliance'}
              </div>
           </div>
        </div>
      </div>

      {type === 'rfi' ? (
        <div className="space-y-8 mb-12">
           <h3 className="text-[10px] font-medium text-white bg-slate-900 p-2 uppercase tracking-[0.2em] italic inline-block rounded-sm">ITP Inspection Protocol Results</h3>
           <div className="border border-slate-200 rounded overflow-hidden">
              <table className="w-full text-left border-collapse">
                 <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                       <th className="p-4 text-[8px] font-medium uppercase text-slate-400 "># Checkpoint Description</th>
                       <th className="p-4 text-[8px] font-medium uppercase text-slate-400 text-center">Verdict</th>
                    </tr>
                 </thead>
                 <tbody className="divide-y divide-slate-100 italic">
                    {[1,2,3,4,5].map(i => (
                       <tr key={i}>
                          <td className="p-4 text-xs font-bold uppercase">Technical Checkpoint Requirement #{i} Matches GFC Standard</td>
                          <td className="p-4 text-center text-[10px] font-medium text-emerald-600 uppercase">PASSED</td>
                       </tr>
                    ))}
                 </tbody>
              </table>
           </div>
        </div>
      ) : (
        <div className="space-y-8 mb-12">
           <h3 className="text-[10px] font-medium text-white bg-red-600 p-2 uppercase tracking-[0.2em] italic inline-block rounded-sm">Forensic Root-Cause Analysis (RCA)</h3>
           <div className="grid grid-cols-1 gap-4">
              {[1,2,3,4,5].map(i => (
                 <div key={i} className="flex gap-4 items-start p-4 bg-slate-50 border-l-4 border-red-500 rounded-r">
                    <div className="text-[10px] font-medium text-slate-300">WHY {i}</div>
                    <div className="text-xs font-bold italic uppercase">{data.rca_details?.[`why${i}`] || 'Forensic investigation step not detailed.'}</div>
                 </div>
              ))}
           </div>
        </div>
      )}

      {/* Photo Evidence Section */}
      <div className="space-y-6 mb-16">
         <h3 className="text-[10px] font-medium text-slate-400 uppercase tracking-widest border-b border-slate-200 pb-2">Technical Evidence & Site Imagery</h3>
         <div className="grid grid-cols-2 gap-8">
            <div className="aspect-video bg-slate-100 rounded border border-slate-200 flex items-center justify-center relative overflow-hidden">
               <span className="text-[8px] font-medium text-slate-400 uppercase">GFC Source Context Image</span>
               <div className="absolute top-4 right-4 bg-slate-900 text-white text-[8px] font-medium px-2 py-1 uppercase rounded italic">Original</div>
            </div>
            <div className="aspect-video bg-slate-100 rounded border border-slate-200 flex items-center justify-center relative overflow-hidden">
               <span className="text-[8px] font-medium text-slate-400 uppercase italic">Forensic Annotated Evidence</span>
               <div className="absolute top-4 right-4 bg-red-600 text-white text-[8px] font-medium px-2 py-1 uppercase rounded italic">Annotated</div>
            </div>
         </div>
      </div>

      {/* Signatories - THE MOST IMPORTANT PART */}
      <div className="mt-auto border-t-2 border-slate-200 pt-12">
         <div className="grid grid-cols-3 gap-12 text-center">
            {['INTERNAL ENG', 'QC HEAD', 'CLIENT AUTHORITY'].map((role, i) => (
               <div key={i} className="space-y-4">
                  <div className="h-24 border-b border-slate-300 flex items-center justify-center italic text-lg font-medium text-slate-300 opacity-20">
                     [DIGITAL AUTHENTICATION]
                  </div>
                  <div>
                     <p className="text-[10px] font-medium uppercase text-slate-900 tracking-widest">{role}</p>
                     <p className="text-[8px] font-bold uppercase text-slate-400 mt-1 italic italic">VERIFIED BY BCIM ERP CORE</p>
                  </div>
               </div>
            ))}
         </div>
      </div>

      {/* Footer Audit Trail */}
      <div className="fixed bottom-12 left-16 right-16 flex justify-between items-center text-[7px] font-medium text-slate-400 uppercase tracking-widest border-t border-slate-100 pt-4">
         <div>REPORT GENERATED: {dayjs().format('YYYY-MM-DD HH:mm:ss')} • SYSTEM ID: BCIM-FORENSIC-V2</div>
         <div>Page 1 of 1 • Strictly Confidential • BCIM CONSTRUCT ERP CORE</div>
      </div>
    </div>
  );
});
