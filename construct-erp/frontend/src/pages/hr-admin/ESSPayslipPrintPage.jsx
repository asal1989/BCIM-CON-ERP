// src/pages/hr-admin/ESSPayslipPrintPage.jsx
// Self-service payslip print view. The "Print" button in the ESS Portal's
// Payslips tab used to navigate to /hr-admin/payroll/:id/payslip, which is
// gated by RequireModule("HR & Admin") and authorize('...','hr_admin',...) —
// routes ordinary employees never have. This page reuses the exact same
// print layout (PayslipContent) but is fetched via the self-scoped
// GET /ess/payslips/:id endpoint (WHERE user_id = the caller, always) and
// carries no HR-admin module/role gate, so any employee can print their own.
import React, { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Printer } from 'lucide-react';
import { essAPI } from '../../api/client';
import { PayslipContent, buildPayslipSections } from './PayslipPrintPage';

const MONTHS = ['','January','February','March','April','May','June','July','August','September','October','November','December'];

export default function ESSPayslipPrintPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const { data, isLoading } = useQuery({
    queryKey: ['ess-payslip-print', id],
    queryFn: () => essAPI.payslip(id).then(r => r.data),
  });

  const p = data?.data;

  useEffect(() => {
    if (p) {
      const timer = setTimeout(() => window.print(), 800);
      return () => clearTimeout(timer);
    }
  }, [p]);

  if (isLoading) return (
    <div className="min-h-screen flex items-center justify-center" style={{background:'#F8FAFC'}}>
      <div className="text-center space-y-3">
        <div className="w-10 h-10 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin mx-auto"/>
        <p className="text-gray-400 text-sm font-bold">Loading payslip…</p>
      </div>
    </div>
  );

  if (!p) return (
    <div className="min-h-screen flex items-center justify-center" style={{background:'#F8FAFC'}}>
      <div className="text-center space-y-3">
        <div className="w-12 h-12 bg-red-50 rounded-2xl flex items-center justify-center mx-auto">
          <span className="text-red-500 text-2xl">!</span>
        </div>
        <p className="text-red-500 font-bold">Payslip not found</p>
        <button onClick={()=>navigate(-1)} className="text-blue-600 text-sm font-bold hover:underline">← Go Back</button>
      </div>
    </div>
  );

  const { earnings, deductions, employerContribution } = buildPayslipSections(p);

  return (
    <>
      <style>{`
        @media print {
          body { background: white !important; color: black !important; }
          .no-print { display: none !important; }
          @page { size: A4; margin: 15mm; }
        }
        body { font-family: Arial, sans-serif; }
      `}</style>

      <div className="no-print sticky top-0 z-10 bg-white border-b border-gray-100 shadow-sm px-6 py-4 flex items-center gap-3"
        style={{boxShadow:'0 2px 12px rgba(10,31,92,0.06)'}}>
        <button onClick={()=>navigate(-1)}
          className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-sm font-bold transition-colors">
          <ArrowLeft className="w-4 h-4"/> Back
        </button>
        <button onClick={()=>window.print()}
          className="flex items-center gap-2 px-5 py-2 text-white rounded-xl text-sm font-black transition-colors"
          style={{background:'linear-gradient(135deg,#0A1F5C,#1e3a8a)'}}>
          <Printer className="w-4 h-4"/> Print / Download PDF
        </button>
        <span className="text-gray-400 text-sm ml-1">Payslip for {MONTHS[p.month]} {p.year}</span>
      </div>

      <div className="no-print min-h-screen py-8 px-4" style={{background:'#F8FAFC'}}>
        <div className="max-w-3xl mx-auto bg-white rounded-2xl shadow-xl overflow-hidden border border-gray-100">
          <PayslipContent p={p} earnings={earnings} deductions={deductions} employerContribution={employerContribution}/>
        </div>
      </div>

      <div className="hidden print:block">
        <PayslipContent p={p} earnings={earnings} deductions={deductions} employerContribution={employerContribution}/>
      </div>
    </>
  );
}
