// src/pages/stores/MRSVerificationPage.jsx
import React from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { 
  ShieldCheck, CheckCircle2, Clock, XCircle, 
  Building2, Calendar, FileText, ClipboardList
} from 'lucide-react';
import dayjs from 'dayjs';
import axios from 'axios';

const BASE_URL =
  import.meta.env?.VITE_API_URL ||
  (typeof process !== 'undefined' ? process.env?.REACT_APP_API_URL : '') ||
  '/api/v1';

// Public API call (bypasses auth interceptor if needed, or just use a raw axios call)
const fetchMRSVerification = async (id) => {
  const res = await axios.get(`${BASE_URL}/stores/mrs/public/verify/${id}`);
  return res.data?.data;
};

export default function MRSVerificationPage() {
  const { id } = useParams();

  const { data: mrs, isLoading, isError } = useQuery({
    queryKey: ['mrs-verify', id],
    queryFn: () => fetchMRSVerification(id),
    retry: false
  });

  if (isLoading) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 text-center">
      <div className="space-y-4">
        <div className="w-16 h-16 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mr-0 fill-none" />
        <p className="text-slate-900 font-medium uppercase tracking-widest text-sm">Authenticating Document...</p>
      </div>
    </div>
  );

  if (isError || !mrs) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 text-center">
      <div className="max-w-md space-y-4">
        <XCircle className="w-16 h-16 text-red-500 mx-auto" />
        <h1 className="text-2xl font-medium text-slate-900 uppercase">Verification Failed</h1>
        <p className="text-slate-900 font-medium leading-relaxed">This document could not be verified by the ConstructERP Security System. It may be forged or the link may be invalid.</p>
        <div className="pt-4">
          <Link to="/" className="text-emerald-600 font-medium underline">Go to ERP Home</Link>
        </div>
      </div>
    </div>
  );

  const STATUS_LABELS = {
    pending: 'Awaiting Action',
    stores_verified: 'Approved (Store Manager)',
    verified_tower: 'Approved (Store Manager)',
    approved_pm: 'Approved (Project Manager)',
    approved_srpm: 'Approved (Project Manager)',
    approved_mgmt: 'Approved (Project Director)',
    approved_md: 'Approved (Managing Director)',
    rejected: 'Invalid / Rejected'
  };

  const isFullyAuthorized = mrs.status === 'approved_md';

  return (
    <div className="min-h-screen bg-slate-100 py-10 px-4">
      <div className="max-w-lg mx-auto bg-white rounded-3xl shadow-2xl overflow-hidden border-t-8 border-emerald-500">
        
        {/* Header Section */}
        <div className="p-8 text-center space-y-4 bg-slate-50 border-b border-slate-100">
          <div className="flex justify-center mb-2">
            <img src="/bcim-logo.png" alt="BCIM" className="h-10 object-contain" />
          </div>
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-medium uppercase tracking-widest">
            <ShieldCheck className="w-3.5 h-3.5" />
            ConstructERP Secure Document
          </div>
          <h1 className="text-2xl font-medium text-slate-900 leading-tight">
            Document Verification Certificate
          </h1>
          <p className="text-sm text-slate-900 font-medium font-medium">Authenticity record for {mrs.serial_no_formatted}</p>
        </div>

        {/* Certificate Body */}
        <div className="p-8 space-y-8">
          
          {/* Main Status Stamp */}
          <div className="relative text-center p-6 rounded-2xl border-4 border-dashed border-emerald-500/30 bg-emerald-50/20 overflow-hidden">
             {isFullyAuthorized ? (
               <div className="absolute -right-4 -top-4 -rotate-12 opacity-10">
                 <ShieldCheck className="w-24 h-24 text-emerald-600" />
               </div>
             ) : null}
             <div className="text-[10px] uppercase font-medium text-slate-900 font-medium mb-1 tracking-widest">Current Status</div>
             <div className="text-3xl font-medium text-emerald-600 uppercase tracking-tighter italic">
               {STATUS_LABELS[mrs.status] || mrs.status}
             </div>
             {isFullyAuthorized && (
               <div className="mt-2 text-[9px] font-medium text-emerald-700 bg-emerald-100 inline-block px-3 py-1 rounded-md">
                 VALID FOR PROCUREMENT
               </div>
             )}
          </div>

          {/* Quick Info */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <div className="text-[10px] font-medium text-slate-900 font-medium uppercase">Project</div>
              <div className="text-sm font-medium text-slate-900 leading-tight">{mrs.project_name}</div>
            </div>
            <div className="space-y-1">
              <div className="text-[10px] font-medium text-slate-900 font-medium uppercase">Department</div>
              <div className="text-sm font-medium text-slate-900 leading-tight">{mrs.department}</div>
            </div>
            <div className="space-y-1">
              <div className="text-[10px] font-medium text-slate-900 font-medium uppercase">Created On</div>
              <div className="text-sm font-medium text-slate-900 leading-tight">{dayjs(mrs.created_at).format('DD-MM-YYYY')}</div>
            </div>
            <div className="space-y-1">
              <div className="text-[10px] font-medium text-slate-900 font-medium uppercase">Serial No</div>
              <div className="text-sm font-mono font-medium text-emerald-600 uppercase">{mrs.serial_no_formatted}</div>
            </div>
          </div>

          {/* Items Preview */}
          <div className="space-y-3">
             <div className="text-[10px] font-medium text-slate-900 font-medium uppercase border-b border-slate-100 pb-2">Material Specification</div>
             <div className="space-y-2">
                {mrs.items.map((it, idx) => (
                  <div key={idx} className="flex justify-between items-center text-xs py-1">
                    <span className="font-medium text-slate-700">{it.material_name}</span>
                    <span className="text-slate-900 font-medium">{it.quantity} {it.unit}</span>
                  </div>
                ))}
             </div>
          </div>

          {/* Signature Chain */}
          <div className="space-y-4 pt-4">
            <div className="text-[10px] font-medium text-slate-900 font-medium uppercase border-b border-slate-100 pb-2">Digital Signature Log</div>
            <div className="space-y-3">
               {[
                 { name: mrs.raised_by_name, role: 'Originator', sig: mrs.raised_by_sig, done: true },
                 { name: mrs.stores_verified_name || mrs.verified_tower_name, role: 'Store Manager', sig: mrs.stores_verified_sig || mrs.verified_tower_sig, done: !!(mrs.stores_verified_name || mrs.verified_tower_name) },
                 { name: mrs.approved_pm_name, role: 'Project Manager', sig: mrs.approved_pm_sig, done: !!mrs.approved_pm_name },
                 { name: mrs.approved_mgmt_name, role: 'Project Director', sig: mrs.approved_mgmt_sig, done: !!mrs.approved_mgmt_name },
                 { name: mrs.approved_md_name, role: 'Managing Director', sig: mrs.approved_md_sig, done: !!mrs.approved_md_name },
               ].map((step, idx) => (
                 <div key={idx} className={`flex items-start gap-3 p-3 rounded-xl border ${step.done ? 'bg-slate-50 border-slate-200 opacity-100' : 'bg-white border-slate-100 opacity-40'}`}>
                    <div className={`mt-1 w-2 h-2 rounded-full ${step.done ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300'}`} />
                    <div className="flex-1">
                       <div className="text-xs font-medium text-slate-900 uppercase tracking-tight">{step.role}</div>
                       <div className="text-[10px] text-slate-900 font-medium font-bold">{step.name || 'Awaiting Action...'}</div>
                    </div>
                    {step.sig && (
                       <img src={step.sig} alt="Signature" className="h-6 object-contain mix-blend-multiply" />
                    )}
                 </div>
               ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 bg-slate-800 text-center space-y-3">
           <div className="text-[#34d399] font-medium text-[10px] uppercase tracking-[0.2em]">BCIM Engineering ERP Security</div>
           <p className="text-slate-900 font-medium text-[9px] leading-relaxed">
             This certificate is generated dynamically from the primary database of BCIM Engineering Private Limited 
             If the information above matches the printed document, it is authentic.
           </p>
        </div>
      </div>
      
      <div className="mt-8 text-center text-[10px] text-slate-900 font-medium uppercase tracking-widest">
        &copy; {new Date().getFullYear()} BCIM Construct-ERP System
      </div>
    </div>
  );
}
