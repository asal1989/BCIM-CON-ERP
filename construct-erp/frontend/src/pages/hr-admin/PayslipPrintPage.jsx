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
const num = (v) => parseFloat(v||0).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2});

// ─── Amount to words (same pattern as POPrintTemplate.jsx) ──────────────────
const ONES = ['','One','Two','Three','Four','Five','Six','Seven','Eight','Nine','Ten','Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen','Seventeen','Eighteen','Nineteen'];
const TENS = ['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety'];
function numToWords(n) {
  n = Math.floor(n);
  if (n === 0) return 'Zero';
  if (n < 0) return 'Minus ' + numToWords(-n);
  let words = '';
  if (n >= 10000000) { words += numToWords(Math.floor(n / 10000000)) + ' Crore '; n %= 10000000; }
  if (n >= 100000)   { words += numToWords(Math.floor(n / 100000))   + ' Lakh ';  n %= 100000; }
  if (n >= 1000)     { words += numToWords(Math.floor(n / 1000))     + ' Thousand '; n %= 1000; }
  if (n >= 100)      { words += ONES[Math.floor(n / 100)]            + ' Hundred '; n %= 100; }
  if (n >= 20)       { words += TENS[Math.floor(n / 10)]; if (n % 10) words += '-' + ONES[n % 10]; }
  else if (n > 0)    { words += ONES[n]; }
  return words.trim();
}
const amountInWords = (amount) => {
  const rupees = Math.floor(parseFloat(amount) || 0);
  return `Rupees ${numToWords(rupees)} Only`;
};

// Shared with ESSPayslipPrintPage (the self-service view) so both render the
// exact same layout from the exact same field-mapping logic.
export function buildPayslipSections(p) {
  const earnings = [
    { label:'BASIC',                          master:p.m_basic,                     actual:p.basic },
    { label:'DA',                             master:p.m_da,                        actual:p.da },
    { label:'HRA',                            master:p.m_hra,                       actual:p.hra },
    { label:'CONVEYANCE',                     master:p.m_conveyance_allowance,       actual:p.conveyance_allowance },
    { label:'WASHING ALLOWANCE',              master:p.m_washing_allowance,          actual:p.washing_allowance },
    { label:'LEAVE TRAVEL ALLOWANCE',         master:p.m_lta,                        actual:p.lta },
    { label:'MEDICAL ALLOWANCE',              master:p.m_medical,                    actual:p.medical },
    { label:'MOBILE ALLOWANCE',               master:p.m_mobile_allowance,           actual:p.mobile_allowance },
    { label:'PROJECT OFFICE SPECIAL ALLOW',   master:p.m_project_allowance,          actual:p.project_allowance },
    { label:'CITY SPECIAL ALLOWANCE',         master:p.m_city_special_allowance,     actual:p.city_special_allowance },
    { label:'SPECIAL ALLOWANCE',              master:p.m_special_allowance,          actual:p.special_allowance },
    { label:'ACCOMMODATION ALLOWANCE',        master:p.m_accommodation_allowance,    actual:p.accommodation_allowance },
    { label:'FOOD ALLOWANCE',                 master:p.m_food_allowance,             actual:p.food_allowance },
    { label:'TRANSPORT ALLOWANCE',             master:p.m_transport_allowance,        actual:p.transport_allowance },
    { label:'INCENTIVE',                      master:p.m_incentive,                  actual:p.incentive },
    { label:'OTHER EARNINGS',                 master:0,                              actual:p.other_earnings },
  ].filter(e => parseFloat(e.master) > 0 || parseFloat(e.actual) > 0);

  const deductions = [
    { label:'PF',                value:p.pf_employee },
    { label:'PROF TAX',          value:p.pt },
    { label:'TDS',               value:p.tds },
    { label:'LOAN',              value:p.loan_deduction },
    { label:'SALARY ADVANCE',    value:p.advance_deduction },
    { label:'MESS DEDUCTION',    value:p.mess_deduction },
    { label:'ACCOMMODATION DEDUCTION', value:p.accommodation_deduction },
    { label:'OTHER DEDUCTIONS',  value:p.other_deductions },
  ].filter(d => parseFloat(d.value) > 0);

  const employerContribution = [
    { label:'Employer PF',  value:p.pf_employer },
    { label:'ESI Employer', value:p.esi_employer },
    { label:'Gratuity',     value:p.gratuity },
  ].filter(e => parseFloat(e.value) > 0);

  return { earnings, deductions, employerContribution };
}

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

  // Earnings: Master (entitled, unprorated — from hr_employee_salaries at the
  // time of this payroll month) vs Actual (pro-rated for attendance/LOP — from
  // hr_monthly_payroll itself). Mirrors the real BCIM payslip layout exactly.
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
        <div className="max-w-3xl mx-auto bg-white rounded-2xl shadow-xl overflow-hidden border border-gray-100">
          <PayslipContent p={p} earnings={earnings} deductions={deductions} employerContribution={employerContribution}/>
        </div>
      </div>

      {/* Pure print target (always in DOM, hidden on screen) */}
      <div className="hidden print:block">
        <PayslipContent p={p} earnings={earnings} deductions={deductions} employerContribution={employerContribution}/>
      </div>
    </>
  );
}

// Layout matches the company's real GreytHR-style payslip exactly: bordered
// two-column info block (Name/Designation/Department/Location/Effective Work
// Days/LOP on the left, Employee No/Bank/PAN/UAN on the right), then a single
// Master|Actual earnings table beside a right-hand deductions column, a totals
// row, Net Pay, and the amount in words.
export function PayslipContent({ p, earnings, deductions, employerContribution }) {
  const totalEarningsMaster = earnings.reduce((s, e) => s + (parseFloat(e.master) || 0), 0);
  const totalEarningsActual = earnings.reduce((s, e) => s + (parseFloat(e.actual) || 0), 0);
  const totalDeductions = deductions.reduce((s, d) => s + (parseFloat(d.value) || 0), 0);
  const rowCount = Math.max(earnings.length, deductions.length);

  return (
    <div className="bg-white text-black p-6 print:shadow-none print:max-w-none text-[13px]" style={{fontFamily:'Arial,sans-serif'}}>
      {/* Company Header */}
      <div className="flex items-center justify-between pb-2">
        <img src="/bcim-logo.png" alt="BCIM" style={{ width: 48, height: 48, objectFit: 'contain' }} />
        <div className="text-center flex-1">
          <div className="text-lg font-bold">{p.company_name || 'BCIM ENGINEERING PRIVATE LIMITED'}</div>
          <div className="text-xs mt-0.5">{p.company_address || '# 11, B Wing, Divyasree Chambers, "O" Shaugnessy Road, Bangalore – 560 025, Karnataka, INDIA'}</div>
          <div className="text-xs">Phone: {p.company_phone || '08022244455'}</div>
        </div>
        <QRCodeSVG value={`${getPublicAppOrigin()}/verify/payslip/${p.id}`} size={44}/>
      </div>
      <div className="text-center font-bold text-sm mb-3">Payslip for the month of {MONTHS[p.month]} {p.year}</div>

      {/* Employee Details — bordered two-column block, matching the real payslip */}
      <table className="w-full border-collapse mb-3" style={{border:'1px solid #333'}}>
        <tbody>
          {[
            ['Name:', p.employee_name, 'Employee No:', p.employee_code],
            ['Designation:', p.designation_name || '—', 'Bank Name:', p.bank_name || '—'],
            ['Department:', p.department_name || '—', 'Bank Account No.:', p.bank_account_number || '—'],
            ['Location:', p.work_location || '—', 'PAN No.:', p.pan_number || '—'],
            ['Effective Work Days:', parseFloat(p.paid_days || 0).toFixed(0), 'UAN No.:', p.uan_number || '—'],
            ['LOP:', parseFloat(p.lop_days || 0).toFixed(0), '', ''],
          ].map((row, i) => (
            <tr key={i}>
              <td className="px-2 py-0.5 font-bold" style={{borderTop:i>0?'1px solid #ccc':'none'}}>{row[0]}</td>
              <td className="px-2 py-0.5" style={{borderTop:i>0?'1px solid #ccc':'none'}}>{row[1]}</td>
              <td className="px-2 py-0.5 font-bold" style={{borderTop:i>0?'1px solid #ccc':'none', borderLeft:'1px solid #333'}}>{row[2]}</td>
              <td className="px-2 py-0.5" style={{borderTop:i>0?'1px solid #ccc':'none'}}>{row[3]}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Earnings (Master | Actual) beside Deductions */}
      <table className="w-full border-collapse mb-2" style={{border:'1px solid #333'}}>
        <thead>
          <tr style={{borderBottom:'1px solid #333'}}>
            <th className="text-left px-2 py-1 font-bold" style={{borderRight:'1px solid #333'}}>Earnings</th>
            <th className="text-right px-2 py-1 font-bold w-24" style={{borderRight:'1px solid #333'}}>Master</th>
            <th className="text-right px-2 py-1 font-bold w-24" style={{borderRight:'1px solid #333'}}>Actual</th>
            <th className="text-left px-2 py-1 font-bold" style={{borderRight:'1px solid #333'}}>Deductions</th>
            <th className="text-right px-2 py-1 font-bold w-24">Actual</th>
          </tr>
        </thead>
        <tbody>
          {Array.from({length: rowCount}, (_, i) => (
            <tr key={i}>
              <td className="px-2 py-0.5" style={{borderRight:'1px solid #333'}}>{earnings[i]?.label || ''}</td>
              <td className="px-2 py-0.5 text-right" style={{borderRight:'1px solid #333'}}>{earnings[i] ? num(earnings[i].master) : ''}</td>
              <td className="px-2 py-0.5 text-right" style={{borderRight:'1px solid #333'}}>{earnings[i] ? num(earnings[i].actual) : ''}</td>
              <td className="px-2 py-0.5" style={{borderRight:'1px solid #333'}}>{deductions[i]?.label || ''}</td>
              <td className="px-2 py-0.5 text-right">{deductions[i] ? num(deductions[i].value) : ''}</td>
            </tr>
          ))}
          <tr style={{borderTop:'1px solid #333', fontWeight:'bold'}}>
            <td className="px-2 py-1" style={{borderRight:'1px solid #333'}}>Total Earnings:INR.</td>
            <td className="px-2 py-1 text-right" style={{borderRight:'1px solid #333'}}>{num(totalEarningsMaster)}</td>
            <td className="px-2 py-1 text-right" style={{borderRight:'1px solid #333'}}>{num(totalEarningsActual)}</td>
            <td className="px-2 py-1" style={{borderRight:'1px solid #333'}}>Total Deductions:INR.</td>
            <td className="px-2 py-1 text-right">{num(totalDeductions)}</td>
          </tr>
        </tbody>
      </table>

      {/* Net Pay */}
      <div className="mb-1">
        <span className="font-bold">Net Pay for the month: </span>
        <span className="font-bold">{num(p.net_pay)}</span>
      </div>
      <div className="italic text-xs mb-4">({amountInWords(p.net_pay)})</div>

      {employerContribution.length > 0 && (
        <div className="text-xs border border-gray-300 rounded p-2 mb-4">
          <strong>Employer Contribution (not part of Net Pay — for reference):</strong>{' '}
          {employerContribution.map(e => `${e.label}: ${fmt(e.value)}`).join(' | ')}
        </div>
      )}

      <div className="text-center text-xs border-t border-gray-300 pt-2">
        This is a system generated payslip and does not require a signature
      </div>
    </div>
  );
}
