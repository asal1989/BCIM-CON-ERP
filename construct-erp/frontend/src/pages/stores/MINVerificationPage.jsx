// src/pages/stores/MINVerificationPage.jsx
import React from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { 
  ShieldCheck, CheckCircle2, Clock, 
  MapPin, Calendar, HardHat, FileText,
  Box, UserCheck, Check, Send
} from 'lucide-react';
import dayjs from 'dayjs';
import axios from 'axios';
import { clsx } from 'clsx';

const BASE_URL = process.env.REACT_APP_API_URL || '/api/v1';

export default function MINVerificationPage() {
  const { id } = useParams();

  const { data: min, isLoading, error } = useQuery({
    queryKey: ['min-public-verify', id],
    queryFn: () => axios.get(`${BASE_URL}/stores/min/${id}`).then(r => r.data?.data ?? r.data ?? []).catch(() => []),
  });

  if (isLoading) return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-slate-900">
      <div className="w-16 h-16 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin mb-4"></div>
      <p className="text-slate-900 font-medium uppercase tracking-widest text-[10px]">Validating Forensic Consumption Chain...</p>
    </div>
  );

  if (error || !min) return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-slate-900">
      <div className="w-20 h-20 bg-red-500/10 rounded-full flex items-center justify-center mb-6 border border-red-500/20">
        <ShieldCheck className="w-10 h-10 text-red-500" />
      </div>
      <h1 className="text-2xl font-medium text-slate-900 uppercase tracking-tight">Access Denied</h1>
      <p className="text-slate-900 font-medium mt-2 text-center max-w-xs font-medium">This MIN reference could not be authenticated against the global stock ledger.</p>
      <Link to="/" className="mt-8 px-8 py-3 bg-slate-100 text-slate-900 font-medium rounded-xl text-xs uppercase tracking-widest">Return to Safety</Link>
    </div>
  );

  const isFinalized = min.status === 'issued';

  return (
    <div className="min-h-screen bg-slate-50 py-12 px-4 selection:bg-blue-500 selection:text-white">
      <div className="max-w-xl mx-auto">
        
        {/* Outward Authentication Badge */}
        <div className="flex flex-col items-center text-center mb-10">
          <div className="w-24 h-24 bg-emerald-500/10 rounded-full flex items-center justify-center mb-6 border-2 border-emerald-500/30 shadow-[0_0_40px_rgba(16,185,129,0.1)] relative">
            <Send className="w-12 h-12 text-emerald-500" strokeWidth={2.5} />
            <div className={isFinalized ? "absolute -right-1 -bottom-1 w-8 h-8 bg-emerald-500 rounded-full border-4 border-slate-950 flex items-center justify-center shadow-lg" : "absolute -right-1 -bottom-1 w-8 h-8 bg-amber-500 rounded-full border-4 border-slate-950 flex items-center justify-center shadow-lg"}>
               {isFinalized ? <Check className="w-4 h-4 text-white" strokeWidth={4} /> : <Clock className="w-4 h-4 text-white" strokeWidth={3} />}
            </div>
          </div>
          <h1 className="text-3xl font-medium text-slate-900 uppercase tracking-tight leading-none mb-2 italic tracking-tighter">Consumption Validated</h1>
          <p className="text-emerald-500 font-medium uppercase tracking-[0.25em] text-[10px]">Official Materials Outward Certificate</p>
        </div>

        {/* Certificate Card */}
        <div className="bg-white border border-slate-200 rounded-[2.5rem] overflow-hidden shadow-2xl relative">
          
          <div className={isFinalized ? "bg-emerald-600 p-4 text-center" : "bg-amber-600 p-4 text-center"}>
             <span className="text-white font-medium uppercase tracking-[0.3em] text-[11px] leading-none">
               {isFinalized ? 'MATERIAL DEPOSITED ON SITE' : 'OUTWARD CONSIGNMENT PENDING'}
             </span>
          </div>

          <div className="p-8 space-y-8">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-[10px] font-medium text-slate-900 font-medium uppercase tracking-widest mb-1">Issue Serial</p>
                <h2 className="text-2xl font-medium text-slate-900 font-mono tracking-tighter uppercase leading-none">{min.min_number}</h2>
              </div>
              <div className="text-right">
                <p className="text-[10px] font-medium text-slate-900 font-medium uppercase tracking-widest mb-1">Issue Date</p>
                <div className="text-slate-900 font-medium uppercase">{dayjs(min.issue_date).format('DD-MM-YYYY')}</div>
              </div>
            </div>

            {/* Consumption Logic */}
            <div className="grid grid-cols-2 gap-4">
               <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl">
                  <div className="flex items-center gap-2 mb-2">
                     <MapPin className="w-3 h-3 text-blue-400" />
                     <span className="text-[9px] font-medium text-slate-900 font-medium uppercase tracking-widest">Cost Center (Site)</span>
                  </div>
                  <p className="text-sm font-medium text-slate-900 uppercase tracking-tighter leading-tight">{min.project_name}</p>
                  <p className="text-[9px] text-slate-900 font-medium mt-1.5 flex items-center gap-1 uppercase tracking-widest italic">{min.activity_name || 'General Inventory Ops'}</p>
               </div>
               <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl">
                  <div className="flex items-center gap-2 mb-2">
                     <HardHat className="w-3 h-3 text-emerald-500" />
                     <span className="text-[9px] font-medium text-slate-900 font-medium uppercase tracking-widest">Issued To / Receiver</span>
                  </div>
                  <p className="text-sm font-medium text-slate-900 uppercase tracking-tighter leading-tight truncate">{min.issued_to || 'Site Team'}</p>
                  <p className="text-[9px] text-slate-900 font-medium mt-1.5 uppercase tracking-widest leading-none">{min.contractor_name || 'Local / internal work'}</p>
               </div>
            </div>

            {/* Itemized Manifest */}
            <div className="space-y-3">
               <h3 className="text-[10px] font-medium text-slate-900 font-medium uppercase tracking-widest border-b border-slate-100 pb-2 flex items-center gap-2">
                 <Box className="w-3 h-3 text-emerald-500" /> Forensic Outward Manifest
               </h3>
               <div className="divide-y divide-slate-100">
                  {(min.items || []).map((it, i) => (
                    <div key={i} className="flex justify-between items-center py-3">
                       <div className="min-w-0 flex-1 pr-4">
                          <p className="text-[11px] font-medium text-slate-900 uppercase tracking-tight leading-none mb-1.5 truncate">{it.material_name}</p>
                          <p className="text-[9px] text-slate-900 font-medium uppercase tracking-widest">Allocation: {it.purpose || 'Unspecified Work'}</p>
                       </div>
                       <div className="text-right flex-shrink-0">
                          <p className="text-sm font-medium text-emerald-500 font-mono leading-none tracking-tighter">{it.quantity_issued}</p>
                          <p className="text-[8px] font-medium text-slate-900 uppercase tracking-widest mt-1">{it.unit}</p>
                       </div>
                    </div>
                  ))}
               </div>
            </div>

            {/* Auth Signatures */}
            <div className="space-y-4">
               <h3 className="text-[10px] font-medium text-slate-900 font-medium uppercase tracking-widest border-b border-slate-800 pb-2 flex items-center gap-2">
                 <UserCheck className="w-3 h-3 text-amber-500" /> Accountability Chain
               </h3>
               <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 border border-slate-200 rounded-2xl bg-white flex items-center justify-between group overflow-hidden">
                     <div className="min-w-0 flex-1">
                        <span className="text-[9px] font-medium text-slate-900 uppercase tracking-widest block">Issuing Officer</span>
                        <span className="text-[10px] font-medium text-slate-900 truncate block">{min.issued_by_name || 'System Auto'}</span>
                     </div>
                     <CheckCircle2 className="w-5 h-5 text-emerald-500 opacity-50 flex-shrink-0" />
                  </div>
                  <div className={clsx('p-3 border rounded-2xl transition-all flex items-center justify-between group overflow-hidden', 
                    min.verified_receiver_by ? 'border-blue-500/30 bg-blue-50/5' : 'border-slate-200 bg-white'
                  )}>
                     <div className="min-w-0 flex-1">
                        <span className="text-[9px] font-medium text-slate-900 uppercase tracking-widest block">Acknowledged By</span>
                        <span className="text-[10px] font-medium text-slate-900 truncate block">{min.receiver_name || 'Awaiting Receipt'}</span>
                     </div>
                     {min.verified_receiver_sig && <ShieldCheck className="w-5 h-5 text-blue-500 flex-shrink-0" />}
                  </div>
               </div>
            </div>

            {/* Forensic Footnote */}
            <div className="text-center pt-4 border-t border-slate-100 flex flex-col items-center">
               <FileText className="w-6 h-6 text-slate-900 mb-2 opacity-30" />
               <p className="text-[8px] text-slate-900 font-medium uppercase tracking-widest leading-relaxed max-w-xs px-4">
                 This certificate provides one-way forensic proof of material consumption against the BCIM Global Ledger. 
                 Stock was deducted on {dayjs(min.issue_date).format('DD-MM-YYYY')}.
               </p>
            </div>
          </div>
        </div>

        <div className="mt-8 text-center">
           <p className="text-slate-900 text-[9px] font-medium uppercase tracking-[0.2em] opacity-50">Site Logistics Portal • Construct-ERP Suite</p>
        </div>

      </div>
    </div>
  );
}
