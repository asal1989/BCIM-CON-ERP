// src/pages/procurement/GRNVerificationPage.jsx
import React from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ShieldCheck, CheckCircle2, Clock,
  Truck, Calendar, Building2, MapPin,
  Box, UserCheck, Check, Landmark
} from 'lucide-react';
import dayjs from 'dayjs';
import axios from 'axios';
import clsx from 'clsx';

const BASE_URL = import.meta.env.VITE_API_URL || '/api/v1';

export default function GRNVerificationPage() {
  const { id } = useParams();

  const { data: grn, isLoading, error } = useQuery({
    queryKey: ['grn-public-verify', id],
    queryFn: () => axios.get(`${BASE_URL}/grn/public/verify/${id}`).then(r => r.data?.data ?? r.data ?? []).catch(() => []),
  });

  if (isLoading) return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6">
      <div className="w-16 h-16 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin mb-4"></div>
      <p className="text-slate-900 font-medium uppercase tracking-widest text-[10px]">Verifying Material Receipt Chain...</p>
    </div>
  );

  if (error || !grn) return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6">
      <div className="w-20 h-20 bg-red-500/10 rounded-full flex items-center justify-center mb-6 border border-red-500/20">
        <ShieldCheck className="w-10 h-10 text-red-500" />
      </div>
      <h1 className="text-2xl font-medium text-slate-100 uppercase tracking-tight">Access Denied</h1>
      <p className="text-slate-900 font-medium mt-2 text-center max-w-xs font-medium">This GRN reference could not be authenticated against the global logistics database.</p>
      <Link to="/" className="mt-8 px-8 py-3 bg-slate-100 text-slate-900 font-medium rounded-xl text-xs uppercase tracking-widest">Return to Safety</Link>
    </div>
  );

  const isApproved = grn.quality_status === 'approved';

  return (
    <div className="min-h-screen bg-slate-950 py-12 px-4 selection:bg-blue-500 selection:text-white">
      <div className="max-w-xl mx-auto">
        
        {/* Logistics Authentication Badge */}
        <div className="flex flex-col items-center text-center mb-10">
          <div className="w-24 h-24 bg-blue-500/10 rounded-full flex items-center justify-center mb-6 border-2 border-blue-500/30 shadow-[0_0_40px_rgba(59,130,246,0.1)] relative">
            <Truck className="w-12 h-12 text-blue-500" strokeWidth={2.5} />
            <div className={isApproved ? "absolute -right-1 -bottom-1 w-8 h-8 bg-emerald-500 rounded-full border-4 border-slate-950 flex items-center justify-center shadow-lg" : "absolute -right-1 -bottom-1 w-8 h-8 bg-amber-500 rounded-full border-4 border-slate-950 flex items-center justify-center shadow-lg"}>
               {isApproved ? <Check className="w-4 h-4 text-white" strokeWidth={4} /> : <Clock className="w-4 h-4 text-white" strokeWidth={3} />}
            </div>
          </div>
          <h1 className="text-3xl font-medium text-slate-100 uppercase tracking-tight leading-none mb-2 italic">Receipt Validated</h1>
          <p className="text-blue-500 font-medium uppercase tracking-[0.25em] text-[10px]">Official Materials Inward Certificate</p>
        </div>

        {/* Certificate Card */}
        <div className="bg-slate-900/50 border border-slate-800 rounded-[2.5rem] overflow-hidden backdrop-blur-md shadow-2xl relative">
          
          <div className={isApproved ? "bg-emerald-600 p-4 text-center" : "bg-amber-600 p-4 text-center"}>
             <span className="text-white font-medium uppercase tracking-[0.3em] text-[11px] leading-none">
               {isApproved ? 'QUALITY CLEARANCE GRANTED' : 'PENDING QC AUTHORIZATION'}
             </span>
          </div>

          <div className="p-8 space-y-8">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-[10px] font-medium text-slate-900 font-medium uppercase tracking-widest mb-1">Inward Serial</p>
                <h2 className="text-2xl font-medium text-slate-100 font-mono tracking-tighter uppercase leading-none">{grn.serial_no_formatted || grn.grn_number}</h2>
              </div>
              <div className="text-right">
                <p className="text-[10px] font-medium text-slate-900 font-medium uppercase tracking-widest mb-1">Receipt Date</p>
                <div className="text-slate-200 font-medium uppercase">{dayjs(grn.grn_date).format('DD MMM YYYY')}</div>
              </div>
            </div>

            {/* Inwarding Entities */}
            <div className="grid grid-cols-2 gap-4">
               <div className="p-4 bg-slate-950/50 border border-slate-800 rounded-2xl">
                  <div className="flex items-center gap-2 mb-2">
                     <Building2 className="w-3 h-3 text-blue-400" />
                     <span className="text-[9px] font-medium text-slate-900 font-medium uppercase tracking-widest">Project Site</span>
                  </div>
                  <p className="text-sm font-medium text-slate-100 uppercase tracking-tighter leading-tight">{grn.project_name}</p>
                  <p className="text-[9px] text-slate-900 font-medium mt-1.5 flex items-center gap-1 uppercase tracking-widest"><MapPin className="w-2.5 h-2.5" /> {grn.site_location || 'Main Store'}</p>
               </div>
               <div className="p-4 bg-slate-950/50 border border-slate-800 rounded-2xl">
                  <div className="flex items-center gap-2 mb-2">
                     <Landmark className="w-3 h-3 text-emerald-500" />
                     <span className="text-[9px] font-medium text-slate-900 font-medium uppercase tracking-widest">Supply Source</span>
                  </div>
                  <p className="text-sm font-medium text-slate-100 uppercase tracking-tighter leading-tight">{grn.vendor_name || 'Direct Procurement'}</p>
               </div>
            </div>

            {/* Logistics Breakdown */}
            <div className="grid grid-cols-2 gap-3 text-[10px] border-y border-slate-800/50 py-4">
                <div className="flex justify-between p-2">
                   <span className="text-slate-900 font-medium uppercase tracking-widest">Vehicle Number</span>
                   <span className="text-slate-100 font-medium">{grn.vehicle_number || '---'}</span>
                </div>
                <div className="flex justify-between p-2 border-l border-slate-800">
                   <span className="text-slate-900 font-medium uppercase tracking-widest">Gate Pass</span>
                   <span className="text-slate-100 font-medium">{grn.gate_pass_no || '---'}</span>
                </div>
                <div className="flex justify-between p-2">
                   <span className="text-slate-900 font-medium uppercase tracking-widest">Driver Name</span>
                   <span className="text-slate-100 font-medium uppercase">{grn.driver_name || '---'}</span>
                </div>
                <div className="flex justify-between p-2 border-l border-slate-800">
                   <span className="text-slate-900 font-medium uppercase tracking-widest">WB Slip No</span>
                   <span className="text-slate-100 font-medium">{grn.wb_slip_no || '---'}</span>
                </div>
            </div>

            {/* Material Manifest */}
            <div className="space-y-3">
               <h3 className="text-[10px] font-medium text-slate-900 font-medium uppercase tracking-widest border-b border-slate-800 pb-2 flex items-center gap-2">
                 <Box className="w-3 h-3 text-blue-500" /> Manifest & Itemization
               </h3>
               <div className="space-y-3">
                  {(grn.items || []).map((it, i) => (
                    <div key={i} className="flex justify-between items-center py-2 border-b border-slate-800/50 last:border-0">
                       <div>
                          <p className="text-xs font-medium text-slate-100 uppercase tracking-tight leading-none mb-1.5">{it.material_name}</p>
                          {it.quality_remarks && <p className="text-[9px] text-slate-900 font-medium italic font-medium">Note: {it.quality_remarks}</p>}
                       </div>
                       <div className="text-right">
                          <p className="text-base font-medium text-blue-500 font-mono leading-none tracking-tighter">{parseFloat(it.quantity_received).toLocaleString()}</p>
                          <p className="text-[8px] font-medium text-slate-900 uppercase tracking-widest mt-1">{it.unit}</p>
                       </div>
                    </div>
                  ))}
               </div>
            </div>

            {/* Auth Signatures */}
            <div className="space-y-4">
               <h3 className="text-[10px] font-medium text-slate-900 font-medium uppercase tracking-widest border-b border-slate-800 pb-2 flex items-center gap-2">
                 <UserCheck className="w-3 h-3 text-amber-500" /> Inward Authentication Chain
               </h3>
               <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 border border-slate-800 rounded-2xl bg-slate-950/30 flex items-center justify-between group overflow-hidden">
                     <div>
                        <span className="text-[10px] font-medium text-slate-900 font-medium uppercase tracking-widest block">Storekeeper</span>
                        <span className="text-[9px] font-medium text-slate-900 font-medium truncate">{grn.verified_stores_name || 'Awaiting Sign-off'}</span>
                     </div>
                     {grn.verified_stores_sig && <CheckCircle2 className="w-5 h-5 text-emerald-500 opacity-50 transition-opacity group-hover:opacity-100" />}
                  </div>
                  <div className={clsx('p-3 border rounded-2xl transition-all flex items-center justify-between group overflow-hidden', 
                    grn.approved_qc_by ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-slate-800 bg-slate-950/30'
                  )}>
                     <div>
                        <span className="text-[10px] font-medium text-slate-900 font-medium uppercase tracking-widest block">QC / Engineering</span>
                        <span className="text-[9px] font-medium text-slate-900 font-medium truncate">{grn.approved_qc_name || 'Awaiting Approval'}</span>
                     </div>
                     {grn.approved_qc_sig && <ShieldCheck className="w-5 h-5 text-emerald-500" />}
                  </div>
               </div>
            </div>

            {/* Forensic Trace Footnote */}
            <div className="text-center pt-4 border-t border-slate-800 flex flex-col items-center">
               <ShieldCheck className="w-6 h-6 text-slate-900 mb-2 opacity-30" />
               <p className="text-[8px] text-slate-900 font-medium uppercase tracking-widest leading-relaxed max-w-xs">
                 This certificate provides one-way forensic proof of material receipt against the ConstructERP global ledger.
               </p>
            </div>
          </div>
        </div>

        <div className="mt-8 text-center">
           <p className="text-slate-900 text-[9px] font-medium uppercase tracking-[0.2em] opacity-50">Logistics Audit Portal • BCIM Construction Suite</p>
        </div>

      </div>
    </div>
  );
}
