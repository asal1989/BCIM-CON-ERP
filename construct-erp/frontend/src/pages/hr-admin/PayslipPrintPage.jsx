// src/pages/hr-admin/PayslipPrintPage.jsx — 2026 Premium UI
import React, { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Printer } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { hrPayrollAPI } from '../../api/client';

const getPublicAppOrigin = () => {
  const configured = import.meta.env?.VITE_PUBLIC_APP_URL || import.meta.env?.VITE_APP_URL || import.meta.env?.VITE_APP_ORIGIN;
  if (configured) return configured.replace(/\/$/, '');
  if (typeof window === 'undefined') return '';
  const host = window.location.hostname;
  if (host === 'localhost' || host === '127.0.0.1') return 'http://bcim.ddns.net:3000';
  return window.location.origin;
};

const MONTHS = ['','January','February','March','April','May','June','July','August','September','October','November','December'];
const fmt = (v) => `₹${parseFloat(v||0).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2})}`;

export default function PayslipPrintPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const { data, isLoading } = useQuery({
    queryKey: ['hr-payslip', id],
    queryFn: () => hrPayrollAPI.getPayslip(id).then(r => r.data),
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

  const earnings = [
    { label:'Basic Salary',      value:p.basic              },
    { label:'HRA',               value:p.hra                },
    { label:'Conveyance',        value:p.conveyance         },
    { label:'Medical Allowance', value:p.medical            },
    { label:'Special Allowance', value:p.special_allowance  },
    { label:'Other Earnings',    value:p.other_earnings     },
  ].filter(e=>parseFloat(e.value)>0);

  const deductions = [
    { label:'PF (Employee)',    value:p.pf_employee      },
    { label:'PF (Employer)',    value:p.pf_employer,   note:'CTC' },
    { label:'ESI (Employee)',   value:p.esi_employee     },
    { label:'ESI (Employer)',   value:p.esi_employer,  note:'CTC' },
    { label:'Professional Tax', value:p.pt               },
    { label:'TDS',              value:p.tds              },
    { label:'Loan Deduction',   value:p.loan_deduction   },
    { label:'Advance Recovery', value:p.advance_deduction },
    { label:'Other Deductions', value:p.other_deductions  },
  ].filter(d=>parseFloat(d.value)>0 && !d.note);

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

      {/* Action Bar — hidden on print */}
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

      {/* Payslip Document */}
      <div className="no-print min-h-screen py-8 px-4" style={{background:'#F8FAFC'}}>
        <div className="max-w-2xl mx-auto bg-white rounded-2xl shadow-xl overflow-hidden border border-gray-100">
          <PayslipContent p={p} earnings={earnings} deductions={deductions}/>
        </div>
      </div>

      {/* Pure print target (always in DOM, hidden on screen) */}
      <div className="hidden print:block">
        <PayslipContent p={p} earnings={earnings} deductions={deductions}/>
      </div>
    </>
  );
}

function PayslipContent({ p, earnings, deductions }) {
  return (
    <div className="bg-white text-slate-900 p-8 print:shadow-none print:max-w-none" style={{fontFamily:'Arial,sans-serif'}}>
      {/* Company Header */}
      <div className="border-b-2 border-gray-800 pb-4 mb-6" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ width: 48 }} />
        <div className="text-center" style={{ flex: 1 }}>
          <div className="text-2xl font-bold text-gray-900">{p.company_name||'Company Name'}</div>
          <div className="text-lg font-bold text-slate-900 mt-1 tracking-widest">SALARY SLIP</div>
          <div className="text-gray-600 mt-1">{MONTHS[p.month]} {p.year}</div>
        </div>
        <QRCodeSVG value={`${getPublicAppOrigin()}/verify/payslip/${p.id}`} size={48} />
      </div>

      {/* Employee Details */}
      <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm mb-6 bg-gray-50 p-4 rounded-lg">
        <div><span className="text-gray-500">Employee Name:</span> <strong>{p.employee_name}</strong></div>
        <div><span className="text-gray-500">Employee Code:</span> <strong>{p.employee_code}</strong></div>
        <div><span className="text-gray-500">Department:</span> <strong>{p.department_name}</strong></div>
        <div><span className="text-gray-500">Designation:</span> <strong>{p.designation_name}</strong></div>
        <div><span className="text-gray-500">PAN Number:</span> <strong>{p.pan_number||'—'}</strong></div>
        <div><span className="text-gray-500">UAN:</span> <strong>{p.uan_number||'—'}</strong></div>
        <div><span className="text-gray-500">Bank:</span> <strong>{p.bank_name||'—'}</strong></div>
        <div><span className="text-gray-500">Account No:</span> <strong>{p.bank_account_number||'—'}</strong></div>
        <div><span className="text-gray-500">Working Days:</span> <strong>{p.working_days}</strong></div>
        <div><span className="text-gray-500">Paid Days:</span> <strong>{parseFloat(p.paid_days).toFixed(1)}</strong></div>
        {parseFloat(p.lop_days)>0 && (
          <div><span className="text-gray-500">LOP Days:</span> <strong className="text-red-600">{parseFloat(p.lop_days).toFixed(1)}</strong></div>
        )}
        <div><span className="text-gray-500">Joining Date:</span> <strong>{p.date_of_joining?new Date(p.date_of_joining).toLocaleDateString('en-IN'):'—'}</strong></div>
      </div>

      {/* Earnings & Deductions Table */}
      <table className="w-full text-sm mb-6" style={{borderCollapse:'collapse'}}>
        <thead>
          <tr style={{background:'#1e293b',color:'white'}}>
            <th className="text-left px-4 py-2 w-1/2">Earnings</th>
            <th className="text-right px-4 py-2 w-1/4">Amount</th>
            <th className="text-left px-4 py-2 w-1/4" style={{borderLeft:'1px solid #475569'}}>Deductions</th>
            <th className="text-right px-4 py-2">Amount</th>
          </tr>
        </thead>
        <tbody>
          {Array.from({length:Math.max(earnings.length,deductions.length)},(_,i)=>(
            <tr key={i} style={{background:i%2===0?'#f9fafb':'white'}}>
              <td className="px-4 py-1.5">{earnings[i]?.label||''}</td>
              <td className="px-4 py-1.5 text-right">{earnings[i]?fmt(earnings[i].value):''}</td>
              <td className="px-4 py-1.5" style={{borderLeft:'1px solid #e5e7eb'}}>{deductions[i]?.label||''}</td>
              <td className="px-4 py-1.5 text-right text-red-600">{deductions[i]?fmt(deductions[i].value):''}</td>
            </tr>
          ))}
          <tr style={{background:'#1e293b',color:'white',fontWeight:'bold'}}>
            <td className="px-4 py-2">Gross Earnings</td>
            <td className="px-4 py-2 text-right">{fmt(p.gross_earnings)}</td>
            <td className="px-4 py-2" style={{borderLeft:'1px solid #475569'}}>Total Deductions</td>
            <td className="px-4 py-2 text-right">{fmt(p.total_deductions)}</td>
          </tr>
        </tbody>
      </table>

      {/* Net Pay */}
      <div className="text-center py-4 rounded-lg text-lg font-bold mb-6"
        style={{background:'#166534',color:'white'}}>
        NET PAY: {fmt(p.net_pay)}
      </div>

      {/* Employer Contributions */}
      <div className="text-xs text-slate-900 font-medium mb-6 border border-gray-200 rounded-lg p-3">
        <strong>Employer Contributions (not deducted from salary):</strong>{' '}
        PF Employer: {fmt(p.pf_employer)} | ESI Employer: {fmt(p.esi_employer)}
      </div>

      {/* Signatures */}
      <div className="flex justify-between mt-8 text-sm">
        <div className="text-center">
          <div style={{borderTop:'1px solid #9ca3af',marginTop:'48px',paddingTop:'8px',width:'160px'}}>
            Employee Signature
          </div>
        </div>
        <div className="text-center">
          <div style={{borderTop:'1px solid #9ca3af',marginTop:'48px',paddingTop:'8px',width:'160px'}}>
            HR / Accounts
          </div>
        </div>
      </div>
      <div className="text-center text-xs text-slate-900 font-medium mt-6">
        This is a computer-generated payslip. No signature required if digitally authorized.
      </div>
    </div>
  );
}
