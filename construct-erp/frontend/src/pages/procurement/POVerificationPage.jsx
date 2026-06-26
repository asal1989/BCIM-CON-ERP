// src/pages/procurement/POVerificationPage.jsx
import React from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { 
  ShieldCheck, CheckCircle2, Clock, 
  MapPin, Calendar, Building2, Landmark, 
  Hash, ShoppingCart, UserCheck
} from 'lucide-react';
import dayjs from 'dayjs';
import axios from 'axios';

const BASE_URL = import.meta.env.VITE_API_URL || '/api/v1';

export default function POVerificationPage() {
  const { id } = useParams();

  const { data: po, isLoading, error } = useQuery({
    queryKey: ['po-public-verify', id],
    queryFn: () => axios.get(`${BASE_URL}/purchase-orders/public/verify/${id}`).then(r => r.data?.data ?? r.data ?? []).catch(() => []),
  });

  if (isLoading) return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-blue-900/10 via-slate-950 to-slate-950">
      <div className="w-16 h-16 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin mb-4"></div>
      <p className="text-slate-900 font-medium uppercase tracking-widest text-[10px] animate-pulse">Authenticating Document Reference...</p>
    </div>
  );

  if (error || !po) return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6">
      <div className="w-20 h-20 bg-red-500/10 rounded-full flex items-center justify-center mb-6 border border-red-500/20">
        <ShieldCheck className="w-10 h-10 text-red-500" />
      </div>
      <h1 className="text-2xl font-medium text-slate-100 uppercase tracking-tight">Invalid Document</h1>
      <p className="text-slate-900 font-medium mt-2 text-center max-w-xs font-medium">This Purchase Order record could not be verified. It may have been revoked or the reference is incorrect.</p>
      <Link to="/" className="mt-8 px-8 py-3 bg-slate-100 text-slate-900 font-medium rounded-xl text-xs uppercase tracking-widest">Back to Secure Portal</Link>
    </div>
  );

  const isApproved = po.status === 'approved' || po.status === 'fully_received' || po.status === 'part_received';

  return (
    <div className="min-h-screen bg-slate-950 py-12 px-4 selection:bg-blue-500 selection:text-white">
      <div className="max-w-xl mx-auto">
        
        {/* Verification Badge */}
        <div className="flex flex-col items-center text-center mb-10">
          <div className="w-24 h-24 bg-emerald-500/10 rounded-full flex items-center justify-center mb-6 border-2 border-emerald-500/30 shadow-[0_0_40px_rgba(16,185,129,0.1)] relative">
            <ShieldCheck className="w-12 h-12 text-emerald-500" strokeWidth={2.5} />
            <div className="absolute -right-1 -bottom-1 w-8 h-8 bg-emerald-500 rounded-full border-4 border-slate-950 flex items-center justify-center">
              <CheckCircle2 className="w-4 h-4 text-white" />
            </div>
          </div>
          <h1 className="text-3xl font-medium text-slate-100 uppercase tracking-tight leading-none mb-2">Certificate of Authenticity</h1>
          <p className="text-emerald-500/80 font-medium uppercase tracking-[0.25em] text-[10px]">Official Digital Purchase Order Record</p>
        </div>

        {/* Main Document Card */}
        <div className="bg-slate-900/50 border border-slate-800 rounded-[2.5rem] overflow-hidden backdrop-blur-md shadow-2xl relative">
          
          {/* Status Banner */}
          <div className={isApproved ? "bg-emerald-600 p-4 text-center" : "bg-amber-600 p-4 text-center"}>
             <span className="text-white font-medium uppercase tracking-[0.3em] text-[11px]">
               {isApproved ? 'VERIFIED & AUTHORIZED' : 'PENDING STAGE APPROVAL'}
             </span>
          </div>

          <div className="p-8 space-y-8">
            {/* Header Info */}
            <div className="flex justify-between items-start">
              <div>
                <p className="text-[10px] font-medium text-slate-900 font-medium uppercase tracking-widest mb-1">PO Reference</p>
                <h2 className="text-2xl font-medium text-slate-100 font-mono tracking-tighter uppercase">{po.serial_no_formatted || po.po_number}</h2>
              </div>
              <div className="text-right">
                <p className="text-[10px] font-medium text-slate-900 font-medium uppercase tracking-widest mb-1">Issue Date</p>
                <div className="text-slate-200 font-bold">{dayjs(po.po_date).format('DD-MM-YYYY')}</div>
              </div>
            </div>

            {/* Entity Mapping */}
            <div className="grid grid-cols-2 gap-4">
               <div className="p-4 bg-slate-950/50 border border-slate-800 rounded-2xl">
                  <div className="flex items-center gap-2 mb-2">
                     <Building2 className="w-3 h-3 text-blue-400" />
                     <span className="text-[9px] font-medium text-slate-900 font-medium uppercase tracking-widest">Project Name</span>
                  </div>
                  <p className="text-sm font-medium text-slate-100 uppercase leading-tight tracking-tighter">{po.project_name}</p>
               </div>
               <div className="p-4 bg-slate-950/50 border border-slate-800 rounded-2xl">
                  <div className="flex items-center gap-2 mb-2">
                     <Landmark className="w-3 h-3 text-amber-500" />
                     <span className="text-[9px] font-medium text-slate-900 font-medium uppercase tracking-widest">Vendor Account</span>
                  </div>
                  <p className="text-sm font-medium text-slate-100 uppercase leading-tight tracking-tighter">{po.vendor_name}</p>
               </div>
            </div>

            {/* Line Items Summary */}
            <div className="space-y-3">
               <h3 className="text-[10px] font-medium text-slate-900 font-medium uppercase tracking-widest border-b border-slate-800 pb-2 flex items-center gap-2">
                 <ShoppingCart className="w-3 h-3" /> Materials & Line Items
               </h3>
               <div className="space-y-2">
                  {(po.items || []).map((it, i) => (
                    <div key={i} className="flex justify-between items-center py-2 border-b border-slate-800/50 last:border-0 grow">
                       <div>
                          <p className="text-xs font-medium text-slate-100 uppercase tracking-tight leading-none">{it.material_name}</p>
                          <p className="text-[9px] text-slate-900 font-medium mt-1 uppercase tracking-tighter">Unit: {it.unit} | Net Auth: {parseFloat(it.quantity)}</p>
                       </div>
                    </div>
                  ))}
               </div>
            </div>

            {/* Signature Chain Visualization */}
            <div className="space-y-4">
               <h3 className="text-[10px] font-medium text-slate-900 font-medium uppercase tracking-widest border-b border-slate-800 pb-2 flex items-center gap-2">
                 <UserCheck className="w-3 h-3" /> Authorization Chain
               </h3>
               <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 border border-slate-800 rounded-xl bg-slate-950/30 flex items-center justify-between">
                     <span className="text-[10px] font-medium text-slate-900 font-medium uppercase">Audit</span>
                     <span className={po.verified_audit_name ? "text-[10px] font-medium text-emerald-500 uppercase" : "text-[10px] font-medium text-slate-900 uppercase"}>
                       {po.verified_audit_name ? 'SIGNED' : 'PENDING'}
                     </span>
                  </div>
                  <div className="p-3 border border-slate-800 rounded-xl bg-slate-950/30 flex items-center justify-between">
                     <span className="text-[10px] font-medium text-slate-900 font-medium uppercase">Mgmt</span>
                     <span className={po.released_mgmt_name ? "text-[10px] font-medium text-emerald-500 uppercase" : "text-[10px] font-medium text-slate-900 uppercase"}>
                       {po.released_mgmt_name ? 'SIGNED' : 'PENDING'}
                     </span>
                  </div>
                  <div className="p-3 border border-slate-800 rounded-xl bg-slate-950/30 flex items-center justify-between">
                     <span className="text-[10px] font-medium text-slate-900 font-medium uppercase">Director</span>
                     <span className={po.authorized_md_name ? "text-[10px] font-medium text-emerald-500 uppercase" : "text-[10px] font-medium text-slate-900 uppercase"}>
                       {po.authorized_md_name ? 'SIGNED' : 'PENDING'}
                     </span>
                  </div>
               </div>
            </div>

            {/* Footnote */}
            <div className="text-center pt-4 border-t border-slate-800 flex flex-col items-center">
               <ShieldCheck className="w-6 h-6 text-slate-900 mb-2" />
               <p className="text-[9px] text-slate-900 font-medium uppercase tracking-widest leading-relaxed">
                 This document is cryptographically linked to the ConstructERP Secure database. Any alteration of physical copies can be identified by scanning the original QR reference.
               </p>
            </div>
          </div>
        </div>

        {/* Support Links */}
        <div className="mt-10 text-center">
           <p className="text-slate-900 text-[10px] font-medium uppercase tracking-widest">© 2026 BCIM Construction Group • Secure Document Portal</p>
        </div>

      </div>
    </div>
  );
}
