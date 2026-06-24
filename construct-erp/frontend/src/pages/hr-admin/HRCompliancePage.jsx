// HR Compliance Reports — PF, ESI, PT, Muster Roll, Wage Register, Employment Register, Income Tax
import React, { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import {
  ShieldCheck, Download, RefreshCw, ChevronDown, Users,
  FileText, Calendar, Building2, IndianRupee, Fingerprint, BookOpen, Calculator
} from 'lucide-react';
import { hrComplianceAPI } from '../../api/client';
import * as XLSX from 'xlsx';

const fade = (d = 0) => ({ initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.3, delay: d } });
const inr = (n) => Number(n || 0).toLocaleString('en-IN');

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const CURRENT_MONTH = new Date().getMonth() + 1;
const CURRENT_YEAR  = new Date().getFullYear();

const TABS = [
  { key: 'pf',         label: 'PF Register',          icon: ShieldCheck,    color: 'blue'   },
  { key: 'esi',        label: 'ESI Register',          icon: Fingerprint,    color: 'emerald'},
  { key: 'pt',         label: 'Prof. Tax',             icon: Calculator,     color: 'violet' },
  { key: 'wage',       label: 'Wage Register',         icon: IndianRupee,    color: 'amber'  },
  { key: 'muster',     label: 'Muster Roll',           icon: Calendar,       color: 'rose'   },
  { key: 'employment', label: 'Employment Register',   icon: Users,          color: 'teal'   },
  { key: 'it',         label: 'Income Tax',            icon: FileText,       color: 'orange' },
];

const COLOR = {
  blue:    { bg: 'bg-blue-50',    text: 'text-blue-700',    border: 'border-blue-200',    active: 'bg-blue-600'    },
  emerald: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', active: 'bg-emerald-600' },
  violet:  { bg: 'bg-violet-50',  text: 'text-violet-700',  border: 'border-violet-200',  active: 'bg-violet-600'  },
  amber:   { bg: 'bg-amber-50',   text: 'text-amber-700',   border: 'border-amber-200',   active: 'bg-amber-600'   },
  rose:    { bg: 'bg-rose-50',    text: 'text-rose-700',    border: 'border-rose-200',     active: 'bg-rose-600'    },
  teal:    { bg: 'bg-teal-50',    text: 'text-teal-700',    border: 'border-teal-200',    active: 'bg-teal-600'    },
  orange:  { bg: 'bg-orange-50',  text: 'text-orange-700',  border: 'border-orange-200',  active: 'bg-orange-600'  },
};

// ── Shared Controls ────────────────────────────────────────────────────────────
function MonthYearPicker({ month, year, onChange }) {
  return (
    <div className="flex items-center gap-2">
      <select value={month} onChange={e => onChange(parseInt(e.target.value), year)}
        className="px-3 py-2 text-sm border border-gray-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20">
        {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
      </select>
      <select value={year} onChange={e => onChange(month, parseInt(e.target.value))}
        className="px-3 py-2 text-sm border border-gray-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20">
        {[2022,2023,2024,2025,2026,2027].map(y => <option key={y} value={y}>{y}</option>)}
      </select>
    </div>
  );
}

function ExportBtn({ data, filename, headers, color = 'blue' }) {
  const c = COLOR[color];
  const exportXlsx = () => {
    const ws = XLSX.utils.json_to_sheet(data);
    if (headers) XLSX.utils.sheet_add_aoa(ws, [headers], { origin: 'A1' });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Report');
    XLSX.writeFile(wb, `${filename}.xlsx`);
  };
  return (
    <button onClick={exportXlsx}
      className={`flex items-center gap-2 px-4 py-2 text-sm font-bold rounded-xl ${c.bg} ${c.text} hover:opacity-80 transition-opacity`}>
      <Download size={14}/> Export Excel
    </button>
  );
}

function StatCard({ label, value, sub }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 px-5 py-4" style={{boxShadow:'0 1px 6px rgba(10,31,92,0.06)'}}>
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{label}</p>
      <p className="text-xl font-black text-gray-900 mt-1">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}

function LoadingTable() {
  return (
    <div className="flex items-center justify-center h-40 text-sm text-gray-400">
      <RefreshCw size={18} className="animate-spin mr-2"/> Loading…
    </div>
  );
}

// ── PF Register ────────────────────────────────────────────────────────────────
function PFRegister({ depts }) {
  const [month, setMonth] = useState(CURRENT_MONTH);
  const [year,  setYear]  = useState(CURRENT_YEAR);
  const [dept,  setDept]  = useState('');

  const { data: res, isLoading, refetch } = useQuery({
    queryKey: ['compliance-pf', month, year, dept],
    queryFn:  () => hrComplianceAPI.pfRegister({ month, year, dept: dept || undefined }).then(r => r.data),
  });

  const rows    = res?.data    || [];
  const totals  = res?.totals  || {};

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 items-center justify-between">
        <div className="flex gap-3 items-center flex-wrap">
          <MonthYearPicker month={month} year={year} onChange={(m,y) => { setMonth(m); setYear(y); }}/>
          <select value={dept} onChange={e => setDept(e.target.value)}
            className="px-3 py-2 text-sm border border-gray-200 rounded-xl bg-white focus:outline-none">
            <option value="">All Departments</option>
            {depts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </div>
        <div className="flex gap-2">
          <button onClick={refetch} className="p-2 rounded-xl hover:bg-gray-100"><RefreshCw size={15} className="text-gray-500"/></button>
          <ExportBtn color="blue" data={rows} filename={`PF_Register_${MONTHS[month-1]}_${year}`}/>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Employees" value={rows.length} sub="PF applicable"/>
        <StatCard label="Total PF Wage" value={`₹${inr(totals.pf_wage)}`}/>
        <StatCard label="Employee PF (12%)" value={`₹${inr(totals.emp_pf)}`}/>
        <StatCard label="Employer Contrib." value={`₹${inr(totals.total_employer)}`} sub="EPF + EPS + Admin"/>
      </div>

      {isLoading ? <LoadingTable/> : (
        <div className="overflow-x-auto rounded-2xl border border-gray-100" style={{boxShadow:'0 2px 10px rgba(10,31,92,0.06)'}}>
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-blue-700 text-white">
                {['#','Emp Code','Name','Father Name','UAN','PF A/C No.','Dept','Basic','PF Wage','Emp PF 12%','EPS 8.33%','EPF 3.67%','Admin 0.5%','Employer Total','Grand Total'].map(h => (
                  <th key={h} className="px-3 py-3 text-left font-bold text-[11px] whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map(r => (
                <tr key={r.sno} className="hover:bg-blue-50/40 transition-colors">
                  <td className="px-3 py-2 text-gray-400">{r.sno}</td>
                  <td className="px-3 py-2 font-mono font-bold text-gray-800">{r.employee_code}</td>
                  <td className="px-3 py-2 font-semibold text-gray-900 whitespace-nowrap">{r.name}</td>
                  <td className="px-3 py-2 text-gray-600">{r.father_name || '—'}</td>
                  <td className="px-3 py-2 font-mono text-blue-700">{r.uan_number || '—'}</td>
                  <td className="px-3 py-2 font-mono text-gray-600">{r.pf_account_number || '—'}</td>
                  <td className="px-3 py-2 text-gray-600">{r.department}</td>
                  <td className="px-3 py-2 text-right font-mono">{inr(r.basic)}</td>
                  <td className="px-3 py-2 text-right font-mono">{inr(r.pf_wage)}</td>
                  <td className="px-3 py-2 text-right font-mono font-bold text-blue-700">{inr(r.emp_pf)}</td>
                  <td className="px-3 py-2 text-right font-mono text-emerald-700">{inr(r.eps)}</td>
                  <td className="px-3 py-2 text-right font-mono">{inr(r.epf_employer)}</td>
                  <td className="px-3 py-2 text-right font-mono text-gray-500">{inr(r.admin_charges)}</td>
                  <td className="px-3 py-2 text-right font-mono font-bold text-emerald-700">{inr(r.total_employer)}</td>
                  <td className="px-3 py-2 text-right font-mono font-black text-gray-900">{inr(r.total_monthly)}</td>
                </tr>
              ))}
              {rows.length > 0 && (
                <tr className="bg-blue-50 font-black">
                  <td colSpan={7} className="px-3 py-2 text-blue-800 font-black">TOTAL</td>
                  <td className="px-3 py-2 text-right font-mono font-black">{inr(totals.basic)}</td>
                  <td className="px-3 py-2 text-right font-mono font-black">{inr(totals.pf_wage)}</td>
                  <td className="px-3 py-2 text-right font-mono font-black text-blue-700">{inr(totals.emp_pf)}</td>
                  <td className="px-3 py-2 text-right font-mono font-black text-emerald-700">{inr(totals.eps)}</td>
                  <td className="px-3 py-2 text-right font-mono font-black">{inr(totals.epf_employer)}</td>
                  <td className="px-3 py-2 text-right font-mono font-black text-gray-500">{inr(totals.admin_charges)}</td>
                  <td className="px-3 py-2 text-right font-mono font-black text-emerald-700">{inr(totals.total_employer)}</td>
                  <td className="px-3 py-2 text-right font-mono font-black">{inr(totals.total_monthly)}</td>
                </tr>
              )}
              {!rows.length && <tr><td colSpan={15} className="px-3 py-10 text-center text-gray-400">No PF applicable employees</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── ESI Register ───────────────────────────────────────────────────────────────
function ESIRegister({ depts }) {
  const [month, setMonth] = useState(CURRENT_MONTH);
  const [year,  setYear]  = useState(CURRENT_YEAR);

  const { data: res, isLoading, refetch } = useQuery({
    queryKey: ['compliance-esi', month, year],
    queryFn:  () => hrComplianceAPI.esiRegister({ month, year }).then(r => r.data),
  });
  const rows   = res?.data   || [];
  const totals = res?.totals || {};

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 items-center justify-between">
        <MonthYearPicker month={month} year={year} onChange={(m,y) => { setMonth(m); setYear(y); }}/>
        <div className="flex gap-2">
          <button onClick={refetch} className="p-2 rounded-xl hover:bg-gray-100"><RefreshCw size={15} className="text-gray-500"/></button>
          <ExportBtn color="emerald" data={rows} filename={`ESI_Register_${MONTHS[month-1]}_${year}`}/>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="ESI Employees" value={rows.length} sub="Gross ≤ ₹21,000"/>
        <StatCard label="Total Gross" value={`₹${inr(totals.gross_monthly)}`}/>
        <StatCard label="Employee ESI (0.75%)" value={`₹${inr(totals.emp_esi)}`}/>
        <StatCard label="Employer ESI (3.25%)" value={`₹${inr(totals.employer_esi)}`}/>
      </div>

      {isLoading ? <LoadingTable/> : (
        <div className="overflow-x-auto rounded-2xl border border-gray-100" style={{boxShadow:'0 2px 10px rgba(10,31,92,0.06)'}}>
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-emerald-700 text-white">
                {['#','Emp Code','Name','ESI No.','Aadhaar','Dept','Designation','Gross','Emp ESI 0.75%','Employer 3.25%','Total ESI'].map(h => (
                  <th key={h} className="px-3 py-3 text-left font-bold text-[11px] whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map(r => (
                <tr key={r.sno} className="hover:bg-emerald-50/40">
                  <td className="px-3 py-2 text-gray-400">{r.sno}</td>
                  <td className="px-3 py-2 font-mono font-bold text-gray-800">{r.employee_code}</td>
                  <td className="px-3 py-2 font-semibold text-gray-900 whitespace-nowrap">{r.name}</td>
                  <td className="px-3 py-2 font-mono text-emerald-700">{r.esi_number || '—'}</td>
                  <td className="px-3 py-2 font-mono text-gray-500">{r.aadhaar_number || '—'}</td>
                  <td className="px-3 py-2 text-gray-600">{r.department}</td>
                  <td className="px-3 py-2 text-gray-600">{r.designation}</td>
                  <td className="px-3 py-2 text-right font-mono">{inr(r.gross_monthly)}</td>
                  <td className="px-3 py-2 text-right font-mono font-bold text-emerald-700">{inr(r.emp_esi)}</td>
                  <td className="px-3 py-2 text-right font-mono font-bold text-blue-700">{inr(r.employer_esi)}</td>
                  <td className="px-3 py-2 text-right font-mono font-black text-gray-900">{inr(r.total_esi)}</td>
                </tr>
              ))}
              {rows.length > 0 && (
                <tr className="bg-emerald-50 font-black">
                  <td colSpan={7} className="px-3 py-2 text-emerald-800 font-black">TOTAL</td>
                  <td className="px-3 py-2 text-right font-mono font-black">{inr(totals.gross_monthly)}</td>
                  <td className="px-3 py-2 text-right font-mono font-black text-emerald-700">{inr(totals.emp_esi)}</td>
                  <td className="px-3 py-2 text-right font-mono font-black text-blue-700">{inr(totals.employer_esi)}</td>
                  <td className="px-3 py-2 text-right font-mono font-black">{inr(totals.total_esi)}</td>
                </tr>
              )}
              {!rows.length && <tr><td colSpan={11} className="px-3 py-10 text-center text-gray-400">No ESI applicable employees (gross ≤ ₹21,000)</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── PT Register ────────────────────────────────────────────────────────────────
function PTRegister() {
  const [month, setMonth] = useState(CURRENT_MONTH);
  const [year,  setYear]  = useState(CURRENT_YEAR);
  const [state, setState] = useState('KA');

  const { data: res, isLoading, refetch } = useQuery({
    queryKey: ['compliance-pt', month, year, state],
    queryFn:  () => hrComplianceAPI.ptRegister({ month, year, state }).then(r => r.data),
  });
  const rows   = res?.data   || [];
  const totals = res?.totals || {};

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 items-center justify-between">
        <div className="flex gap-3 items-center flex-wrap">
          <MonthYearPicker month={month} year={year} onChange={(m,y) => { setMonth(m); setYear(y); }}/>
          <select value={state} onChange={e => setState(e.target.value)}
            className="px-3 py-2 text-sm border border-gray-200 rounded-xl bg-white focus:outline-none">
            <option value="KA">Karnataka</option>
            <option value="MH">Maharashtra</option>
          </select>
        </div>
        <div className="flex gap-2">
          <button onClick={refetch} className="p-2 rounded-xl hover:bg-gray-100"><RefreshCw size={15} className="text-gray-500"/></button>
          <ExportBtn color="violet" data={rows} filename={`PT_Register_${MONTHS[month-1]}_${year}`}/>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <StatCard label="PT Employees" value={rows.length}/>
        <StatCard label="Total Gross" value={`₹${inr(totals.gross_monthly)}`}/>
        <StatCard label="Total PT" value={`₹${inr(totals.pt_amount)}`}/>
      </div>

      <div className="bg-violet-50 border border-violet-200 rounded-xl px-4 py-3 text-xs text-violet-700">
        <strong>Karnataka Slab:</strong> ≤₹15,000 → ₹0 | ₹15,001–₹20,000 → ₹150 | &gt;₹20,000 → ₹200/month &nbsp;|&nbsp;
        <strong>Maharashtra Slab:</strong> ≤₹7,500 → ₹0 | ₹7,501–₹10,000 → ₹175 | &gt;₹10,000 → ₹200/month
      </div>

      {isLoading ? <LoadingTable/> : (
        <div className="overflow-x-auto rounded-2xl border border-gray-100" style={{boxShadow:'0 2px 10px rgba(10,31,92,0.06)'}}>
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-violet-700 text-white">
                {['#','Emp Code','Name','PAN','Dept','Designation','Gross Monthly','PT Amount'].map(h => (
                  <th key={h} className="px-3 py-3 text-left font-bold text-[11px] whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map(r => (
                <tr key={r.sno} className="hover:bg-violet-50/40">
                  <td className="px-3 py-2 text-gray-400">{r.sno}</td>
                  <td className="px-3 py-2 font-mono font-bold text-gray-800">{r.employee_code}</td>
                  <td className="px-3 py-2 font-semibold text-gray-900 whitespace-nowrap">{r.name}</td>
                  <td className="px-3 py-2 font-mono text-gray-500">{r.pan_number || '—'}</td>
                  <td className="px-3 py-2 text-gray-600">{r.department}</td>
                  <td className="px-3 py-2 text-gray-600">{r.designation}</td>
                  <td className="px-3 py-2 text-right font-mono">{inr(r.gross_monthly)}</td>
                  <td className="px-3 py-2 text-right font-mono font-black text-violet-700">₹{inr(r.pt_amount)}</td>
                </tr>
              ))}
              {rows.length > 0 && (
                <tr className="bg-violet-50 font-black">
                  <td colSpan={6} className="px-3 py-2 text-violet-800 font-black">TOTAL</td>
                  <td className="px-3 py-2 text-right font-mono font-black">{inr(totals.gross_monthly)}</td>
                  <td className="px-3 py-2 text-right font-mono font-black text-violet-700">₹{inr(totals.pt_amount)}</td>
                </tr>
              )}
              {!rows.length && <tr><td colSpan={8} className="px-3 py-10 text-center text-gray-400">No PT applicable employees above slab threshold</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Wage Register ──────────────────────────────────────────────────────────────
function WageRegister({ depts }) {
  const [month, setMonth] = useState(CURRENT_MONTH);
  const [year,  setYear]  = useState(CURRENT_YEAR);
  const [dept,  setDept]  = useState('');

  const { data: res, isLoading, refetch } = useQuery({
    queryKey: ['compliance-wage', month, year, dept],
    queryFn:  () => hrComplianceAPI.wageRegister({ month, year, dept: dept || undefined }).then(r => r.data),
  });
  const rows   = res?.data   || [];
  const totals = res?.totals || {};

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 items-center justify-between">
        <div className="flex gap-3 items-center flex-wrap">
          <MonthYearPicker month={month} year={year} onChange={(m,y) => { setMonth(m); setYear(y); }}/>
          <select value={dept} onChange={e => setDept(e.target.value)}
            className="px-3 py-2 text-sm border border-gray-200 rounded-xl bg-white focus:outline-none">
            <option value="">All Departments</option>
            {depts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </div>
        <div className="flex gap-2">
          <button onClick={refetch} className="p-2 rounded-xl hover:bg-gray-100"><RefreshCw size={15} className="text-gray-500"/></button>
          <ExportBtn color="amber" data={rows} filename={`Wage_Register_${MONTHS[month-1]}_${year}`}/>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Employees" value={rows.length}/>
        <StatCard label="Total Gross" value={`₹${inr(totals.gross)}`}/>
        <StatCard label="Total Deductions" value={`₹${inr(totals.total_deductions)}`}/>
        <StatCard label="Net Pay" value={`₹${inr(totals.net_pay)}`}/>
      </div>

      {isLoading ? <LoadingTable/> : (
        <div className="overflow-x-auto rounded-2xl border border-gray-100" style={{boxShadow:'0 2px 10px rgba(10,31,92,0.06)'}}>
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-amber-700 text-white">
                {['#','Emp Code','Name','Dept','Bank A/C','IFSC','Basic','HRA','Conv','Medical','Special','Other','Gross','PF','ESI','PT','Deductions','Net Pay'].map(h => (
                  <th key={h} className="px-3 py-3 text-left font-bold text-[11px] whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map(r => (
                <tr key={r.sno} className="hover:bg-amber-50/40">
                  <td className="px-3 py-2 text-gray-400">{r.sno}</td>
                  <td className="px-3 py-2 font-mono font-bold text-gray-800">{r.employee_code}</td>
                  <td className="px-3 py-2 font-semibold text-gray-900 whitespace-nowrap">{r.name}</td>
                  <td className="px-3 py-2 text-gray-600">{r.department}</td>
                  <td className="px-3 py-2 font-mono text-gray-500 text-[10px]">{r.bank_account || '—'}</td>
                  <td className="px-3 py-2 font-mono text-gray-500 text-[10px]">{r.bank_ifsc || '—'}</td>
                  <td className="px-3 py-2 text-right font-mono">{inr(r.basic)}</td>
                  <td className="px-3 py-2 text-right font-mono">{inr(r.hra)}</td>
                  <td className="px-3 py-2 text-right font-mono">{inr(r.conveyance)}</td>
                  <td className="px-3 py-2 text-right font-mono">{inr(r.medical)}</td>
                  <td className="px-3 py-2 text-right font-mono">{inr(r.special_allowance)}</td>
                  <td className="px-3 py-2 text-right font-mono">{inr(r.other_allowance)}</td>
                  <td className="px-3 py-2 text-right font-mono font-bold">{inr(r.gross)}</td>
                  <td className="px-3 py-2 text-right font-mono text-blue-700">{inr(r.pf_deduction)}</td>
                  <td className="px-3 py-2 text-right font-mono text-emerald-700">{inr(r.esi_deduction)}</td>
                  <td className="px-3 py-2 text-right font-mono text-violet-700">{inr(r.pt_deduction)}</td>
                  <td className="px-3 py-2 text-right font-mono font-bold text-red-600">{inr(r.total_deductions)}</td>
                  <td className="px-3 py-2 text-right font-mono font-black text-emerald-700">{inr(r.net_pay)}</td>
                </tr>
              ))}
              {rows.length > 0 && (
                <tr className="bg-amber-50 font-black text-xs">
                  <td colSpan={6} className="px-3 py-2 text-amber-800 font-black">TOTAL</td>
                  <td className="px-3 py-2 text-right font-mono font-black">{inr(totals.basic)}</td>
                  <td colSpan={5}/>
                  <td className="px-3 py-2 text-right font-mono font-black">{inr(totals.gross)}</td>
                  <td className="px-3 py-2 text-right font-mono font-black text-blue-700">{inr(totals.pf_deduction)}</td>
                  <td className="px-3 py-2 text-right font-mono font-black text-emerald-700">{inr(totals.esi_deduction)}</td>
                  <td className="px-3 py-2 text-right font-mono font-black text-violet-700">{inr(totals.pt_deduction)}</td>
                  <td className="px-3 py-2 text-right font-mono font-black text-red-600">{inr(totals.total_deductions)}</td>
                  <td className="px-3 py-2 text-right font-mono font-black text-emerald-700">{inr(totals.net_pay)}</td>
                </tr>
              )}
              {!rows.length && <tr><td colSpan={18} className="px-3 py-10 text-center text-gray-400">No salary data found</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Muster Roll ────────────────────────────────────────────────────────────────
function MusterRoll({ depts }) {
  const [month, setMonth] = useState(CURRENT_MONTH);
  const [year,  setYear]  = useState(CURRENT_YEAR);
  const [dept,  setDept]  = useState('');

  const { data: res, isLoading, refetch } = useQuery({
    queryKey: ['compliance-muster', month, year, dept],
    queryFn:  () => hrComplianceAPI.musterRoll({ month, year, dept: dept || undefined }).then(r => r.data),
  });
  const rows   = res?.data || [];
  const days   = res?.days || [];

  const STATUS_COLOR = { P:'text-emerald-700 font-bold', A:'text-red-500', HD:'text-amber-600', L:'text-blue-600', WO:'text-gray-300' };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 items-center justify-between">
        <div className="flex gap-3 items-center flex-wrap">
          <MonthYearPicker month={month} year={year} onChange={(m,y) => { setMonth(m); setYear(y); }}/>
          <select value={dept} onChange={e => setDept(e.target.value)}
            className="px-3 py-2 text-sm border border-gray-200 rounded-xl bg-white focus:outline-none">
            <option value="">All Departments</option>
            {depts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </div>
        <div className="flex gap-2">
          <button onClick={refetch} className="p-2 rounded-xl hover:bg-gray-100"><RefreshCw size={15} className="text-gray-500"/></button>
        </div>
      </div>

      <div className="bg-rose-50 border border-rose-200 rounded-xl px-4 py-2 text-xs text-rose-700 flex gap-5">
        <span><strong className="text-emerald-700">P</strong> = Present</span>
        <span><strong className="text-red-500">A</strong> = Absent</span>
        <span><strong className="text-amber-600">HD</strong> = Half Day</span>
        <span><strong className="text-blue-600">L</strong> = Leave</span>
        <span><strong className="text-gray-400">WO</strong> = Week Off</span>
      </div>

      {isLoading ? <LoadingTable/> : (
        <div className="overflow-x-auto rounded-2xl border border-gray-100" style={{boxShadow:'0 2px 10px rgba(10,31,92,0.06)'}}>
          <table className="w-full text-[10px]">
            <thead>
              <tr className="bg-rose-700 text-white">
                <th className="px-3 py-3 text-left font-bold sticky left-0 bg-rose-700">#</th>
                <th className="px-3 py-3 text-left font-bold sticky left-6 bg-rose-700 min-w-[120px]">Name</th>
                <th className="px-3 py-3 text-left font-bold">Dept</th>
                {days.map(d => (
                  <th key={d.day} className={`px-1.5 py-3 text-center font-bold w-8 ${d.is_sunday ? 'text-red-200' : ''}`}>{d.day}</th>
                ))}
                <th className="px-3 py-3 text-center font-bold">P</th>
                <th className="px-3 py-3 text-center font-bold">A</th>
                <th className="px-3 py-3 text-center font-bold">HD</th>
                <th className="px-3 py-3 text-center font-bold">L</th>
                <th className="px-3 py-3 text-center font-bold">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map(r => (
                <tr key={r.sno} className="hover:bg-rose-50/30">
                  <td className="px-3 py-2 text-gray-400 sticky left-0 bg-white">{r.sno}</td>
                  <td className="px-3 py-2 font-semibold text-gray-900 whitespace-nowrap sticky left-6 bg-white">{r.name}</td>
                  <td className="px-3 py-2 text-gray-500">{r.department}</td>
                  {r.days.map((s, i) => (
                    <td key={i} className={`px-1 py-2 text-center ${STATUS_COLOR[s] || 'text-gray-600'}`}>{s}</td>
                  ))}
                  <td className="px-2 py-2 text-center font-bold text-emerald-700">{r.present}</td>
                  <td className="px-2 py-2 text-center font-bold text-red-500">{r.absent}</td>
                  <td className="px-2 py-2 text-center font-bold text-amber-600">{r.half_day}</td>
                  <td className="px-2 py-2 text-center font-bold text-blue-600">{r.leave}</td>
                  <td className="px-2 py-2 text-center font-black text-gray-900">{r.total_working}</td>
                </tr>
              ))}
              {!rows.length && <tr><td colSpan={50} className="px-3 py-10 text-center text-gray-400">No attendance data for selected period</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Employment Register ────────────────────────────────────────────────────────
function EmploymentRegister() {
  const [status, setStatus] = useState('active');

  const { data: res, isLoading, refetch } = useQuery({
    queryKey: ['compliance-employment', status],
    queryFn:  () => hrComplianceAPI.employmentRegister({ status }).then(r => r.data),
  });
  const rows = res?.data || [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 items-center justify-between">
        <select value={status} onChange={e => setStatus(e.target.value)}
          className="px-3 py-2 text-sm border border-gray-200 rounded-xl bg-white focus:outline-none">
          <option value="active">Active Employees</option>
          <option value="resigned">Resigned</option>
          <option value="terminated">Terminated</option>
          <option value="all">All</option>
        </select>
        <div className="flex gap-2">
          <button onClick={refetch} className="p-2 rounded-xl hover:bg-gray-100"><RefreshCw size={15} className="text-gray-500"/></button>
          <ExportBtn color="teal" data={rows} filename="Employment_Register"/>
        </div>
      </div>

      <StatCard label="Total Employees" value={rows.length} sub={`Status: ${status}`}/>

      {isLoading ? <LoadingTable/> : (
        <div className="overflow-x-auto rounded-2xl border border-gray-100" style={{boxShadow:'0 2px 10px rgba(10,31,92,0.06)'}}>
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-teal-700 text-white">
                {['#','Emp Code','Name','Gender','Father Name','DOJ','DOB','Dept','Designation','Type','Location','UAN','PF A/C','ESI No.','PAN','Aadhaar','Bank A/C','IFSC','Status'].map(h => (
                  <th key={h} className="px-3 py-3 text-left font-bold text-[11px] whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map(r => (
                <tr key={r.sno} className="hover:bg-teal-50/40">
                  <td className="px-3 py-2 text-gray-400">{r.sno}</td>
                  <td className="px-3 py-2 font-mono font-bold text-gray-800">{r.employee_code}</td>
                  <td className="px-3 py-2 font-semibold text-gray-900 whitespace-nowrap">{r.name}</td>
                  <td className="px-3 py-2 text-gray-600 capitalize">{r.gender || '—'}</td>
                  <td className="px-3 py-2 text-gray-600">{r.father_name || '—'}</td>
                  <td className="px-3 py-2 text-gray-700">{r.date_of_joining ? new Date(r.date_of_joining).toLocaleDateString('en-IN') : '—'}</td>
                  <td className="px-3 py-2 text-gray-700">{r.date_of_birth ? new Date(r.date_of_birth).toLocaleDateString('en-IN') : '—'}</td>
                  <td className="px-3 py-2 text-gray-600">{r.department}</td>
                  <td className="px-3 py-2 text-gray-600">{r.designation}</td>
                  <td className="px-3 py-2 text-gray-600 capitalize">{(r.employment_type || '').replace(/_/g,' ')}</td>
                  <td className="px-3 py-2 text-gray-600">{r.work_location || '—'}</td>
                  <td className="px-3 py-2 font-mono text-blue-700 text-[10px]">{r.uan_number || '—'}</td>
                  <td className="px-3 py-2 font-mono text-gray-500 text-[10px]">{r.pf_account_number || '—'}</td>
                  <td className="px-3 py-2 font-mono text-emerald-700 text-[10px]">{r.esi_number || '—'}</td>
                  <td className="px-3 py-2 font-mono text-gray-500 text-[10px]">{r.pan_number || '—'}</td>
                  <td className="px-3 py-2 font-mono text-gray-400 text-[10px]">{r.aadhaar_number || '—'}</td>
                  <td className="px-3 py-2 font-mono text-gray-500 text-[10px]">{r.bank_account_number || '—'}</td>
                  <td className="px-3 py-2 font-mono text-gray-500 text-[10px]">{r.bank_ifsc || '—'}</td>
                  <td className="px-3 py-2">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold capitalize ${
                      r.employment_status === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'
                    }`}>{r.employment_status}</span>
                  </td>
                </tr>
              ))}
              {!rows.length && <tr><td colSpan={19} className="px-3 py-10 text-center text-gray-400">No employees found</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Income Tax Register ────────────────────────────────────────────────────────
function IncomeTaxRegister() {
  const [year, setYear] = useState(CURRENT_YEAR);

  const { data: res, isLoading, refetch } = useQuery({
    queryKey: ['compliance-it', year],
    queryFn:  () => hrComplianceAPI.incomeTaxRegister({ year }).then(r => r.data),
  });
  const rows   = res?.data   || [];
  const totals = res?.totals || {};

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 items-center justify-between">
        <div className="flex items-center gap-2">
          <label className="text-sm font-semibold text-gray-600">Financial Year:</label>
          <select value={year} onChange={e => setYear(parseInt(e.target.value))}
            className="px-3 py-2 text-sm border border-gray-200 rounded-xl bg-white focus:outline-none">
            {[2024,2025,2026,2027].map(y => <option key={y} value={y}>FY {y-1}–{y}</option>)}
          </select>
        </div>
        <div className="flex gap-2">
          <button onClick={refetch} className="p-2 rounded-xl hover:bg-gray-100"><RefreshCw size={15} className="text-gray-500"/></button>
          <ExportBtn color="orange" data={rows} filename={`Income_Tax_Register_FY${year-1}-${year}`}/>
        </div>
      </div>

      <div className="bg-orange-50 border border-orange-200 rounded-xl px-4 py-3 text-xs text-orange-700">
        <strong>New Tax Regime (FY {year-1}–{year}):</strong> 0% up to ₹3L | 5% ₹3L–₹6L | 10% ₹6L–₹9L | 15% ₹9L–₹12L | 20% ₹12L–₹15L | 30% above ₹15L.
        Rebate u/s 87A: No tax if taxable income ≤ ₹7L. Standard deduction ₹50,000.
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Employees" value={rows.length}/>
        <StatCard label="Total Annual Gross" value={`₹${inr(totals.annual_gross)}`}/>
        <StatCard label="Total Taxable Income" value={`₹${inr(totals.taxable_income)}`}/>
        <StatCard label="Total Annual TDS" value={`₹${inr(totals.estimated_annual_tax)}`}/>
      </div>

      {isLoading ? <LoadingTable/> : (
        <div className="overflow-x-auto rounded-2xl border border-gray-100" style={{boxShadow:'0 2px 10px rgba(10,31,92,0.06)'}}>
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-orange-700 text-white">
                {['#','Emp Code','Name','PAN','Dept','Monthly Gross','Annual Gross','PF (Annual)','Std. Deduction','Taxable Income','Est. Annual Tax','Monthly TDS'].map(h => (
                  <th key={h} className="px-3 py-3 text-left font-bold text-[11px] whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map(r => (
                <tr key={r.sno} className="hover:bg-orange-50/40">
                  <td className="px-3 py-2 text-gray-400">{r.sno}</td>
                  <td className="px-3 py-2 font-mono font-bold text-gray-800">{r.employee_code}</td>
                  <td className="px-3 py-2 font-semibold text-gray-900 whitespace-nowrap">{r.name}</td>
                  <td className="px-3 py-2 font-mono text-gray-500">{r.pan_number || '—'}</td>
                  <td className="px-3 py-2 text-gray-600">{r.department}</td>
                  <td className="px-3 py-2 text-right font-mono">{inr(r.gross_monthly)}</td>
                  <td className="px-3 py-2 text-right font-mono font-bold">{inr(r.annual_gross)}</td>
                  <td className="px-3 py-2 text-right font-mono text-blue-600">{inr(r.annual_pf)}</td>
                  <td className="px-3 py-2 text-right font-mono text-gray-500">{inr(r.std_deduction)}</td>
                  <td className="px-3 py-2 text-right font-mono font-bold text-orange-700">{inr(r.taxable_income)}</td>
                  <td className="px-3 py-2 text-right font-mono font-bold text-red-600">{inr(r.estimated_annual_tax)}</td>
                  <td className="px-3 py-2 text-right font-mono font-black text-gray-900">{inr(r.monthly_tds)}</td>
                </tr>
              ))}
              {rows.length > 0 && (
                <tr className="bg-orange-50 font-black">
                  <td colSpan={5} className="px-3 py-2 text-orange-800 font-black">TOTAL</td>
                  <td colSpan={2} className="px-3 py-2 text-right font-mono font-black">{inr(totals.annual_gross)}</td>
                  <td colSpan={2}/>
                  <td className="px-3 py-2 text-right font-mono font-black text-orange-700">{inr(totals.taxable_income)}</td>
                  <td className="px-3 py-2 text-right font-mono font-black text-red-600">{inr(totals.estimated_annual_tax)}</td>
                  <td className="px-3 py-2 text-right font-mono font-black">{inr(totals.monthly_tds)}</td>
                </tr>
              )}
              {!rows.length && <tr><td colSpan={12} className="px-3 py-10 text-center text-gray-400">No employees found</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────
export default function HRCompliancePage({ embedded = false }) {
  const [activeTab, setActiveTab] = useState('pf');

  const { data: deptsRes } = useQuery({
    queryKey: ['compliance-depts'],
    queryFn:  () => hrComplianceAPI.departments().then(r => r.data?.data ?? []),
  });
  const depts = deptsRes || [];

  const tab = TABS.find(t => t.key === activeTab);
  const c   = COLOR[tab?.color || 'blue'];

  return (
    <div className={embedded ? '' : 'min-h-screen'} style={embedded ? {} : { background: '#F8FAFC' }}>
      {/* Header — hidden when embedded inside HRReportsPage */}
      {!embedded && (
        <motion.div {...fade(0)} className="relative overflow-hidden"
          style={{ background: 'linear-gradient(135deg,#0A1F5C,#1e3a8a)', boxShadow: '0 4px 20px rgba(10,31,92,0.2)' }}>
          <div className="absolute top-0 right-0 w-64 h-64 rounded-full opacity-[0.07]"
            style={{ background: 'radial-gradient(circle,#fff,transparent 70%)', transform: 'translate(25%,-25%)' }}/>
          <div className="relative z-10 px-7 py-6">
            <div className="flex items-center gap-3 mb-1">
              <div className="w-9 h-9 rounded-xl bg-white/15 flex items-center justify-center">
                <ShieldCheck className="w-5 h-5 text-white"/>
              </div>
              <span className="text-white/60 text-sm font-semibold">HR & Admin</span>
            </div>
            <h1 className="text-2xl font-black text-white">Compliance Reports</h1>
            <p className="text-white/55 text-sm mt-1">PF · ESI · Professional Tax · Wage Register · Muster Roll · Income Tax</p>
          </div>
        </motion.div>
      )}

      {/* Tab Bar */}
      <motion.div {...fade(0.06)} className="bg-white border-b border-gray-100 px-7">
        <div className="flex gap-1 overflow-x-auto py-1 no-scrollbar">
          {TABS.map(t => {
            const tc = COLOR[t.color];
            const active = activeTab === t.key;
            return (
              <button key={t.key} onClick={() => setActiveTab(t.key)}
                className={`flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-bold whitespace-nowrap transition-all ${
                  active ? `${tc.bg} ${tc.text}` : 'text-gray-500 hover:bg-gray-50'
                }`}>
                <t.icon size={14}/>
                {t.label}
              </button>
            );
          })}
        </div>
      </motion.div>

      {/* Content */}
      <motion.div {...fade(0.1)} className="px-7 py-6">
        {activeTab === 'pf'         && <PFRegister depts={depts}/>}
        {activeTab === 'esi'        && <ESIRegister depts={depts}/>}
        {activeTab === 'pt'         && <PTRegister/>}
        {activeTab === 'wage'       && <WageRegister depts={depts}/>}
        {activeTab === 'muster'     && <MusterRoll depts={depts}/>}
        {activeTab === 'employment' && <EmploymentRegister/>}
        {activeTab === 'it'         && <IncomeTaxRegister/>}
      </motion.div>
    </div>
  );
}
