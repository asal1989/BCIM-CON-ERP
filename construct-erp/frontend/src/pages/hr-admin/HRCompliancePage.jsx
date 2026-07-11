// HR Compliance Reports — PF, ESI, PT, Muster Roll, Wage Register, Employment Register, Income Tax
import React, { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ShieldCheck, Download, RefreshCw, ChevronDown, Users,
  FileText, Calendar, CalendarDays, Building2, IndianRupee, Fingerprint,
  BookOpen, Calculator, AlertTriangle, Plus, Edit2, Trash2, X, Clock, BadgeCheck,
  HardHat, Gift, Star, Heart, TrendingUp, CheckCircle, XCircle, Send, Layers,
  LayoutDashboard, ArrowUpRight, ArrowDownRight, ArrowRight
} from 'lucide-react';
import { hrComplianceAPI } from '../../api/client';
import toast from 'react-hot-toast';
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
  { key: 'licenses',   label: 'Labour Licences',       icon: BadgeCheck,     color: 'indigo' },
  { key: 'docexpiry',  label: 'Doc Expiry',            icon: AlertTriangle,  color: 'red'    },
  { key: 'calendar',   label: 'Compliance Calendar',   icon: CalendarDays,   color: 'sky'    },
  // New
  { key: 'bocw',       label: 'BOCW Register',         icon: HardHat,        color: 'amber'  },
  { key: 'gratuity',   label: 'Gratuity',              icon: Gift,           color: 'emerald'},
  { key: 'bonus',      label: 'Bonus Register',        icon: Star,           color: 'yellow' },
  { key: 'lwf',        label: 'LWF Register',          icon: Heart,          color: 'rose'   },
  { key: 'minwages',   label: 'Min. Wages Check',      icon: TrendingUp,     color: 'teal'   },
  { key: 'clra',       label: 'Contract Labour',       icon: Layers,         color: 'indigo' },
  { key: 'challan',    label: 'Challan Tracker',       icon: Send,           color: 'blue'   },
  { key: 'ecr',        label: 'PF ECR File',           icon: Download,       color: 'violet' },
];

// Groups the flat TABS list into sidebar sections. 'overview' is rendered
// separately (not a TABS entry) since it aggregates the others rather than
// being its own register.
const TAB_GROUPS = [
  { label: 'Statutory Registers', keys: ['pf','esi','pt','wage','it','gratuity','bonus'] },
  { label: 'Licences & Renewals', keys: ['licenses','docexpiry','calendar'] },
  { label: 'Registers',           keys: ['muster','employment','bocw','lwf','minwages','clra'] },
  { label: 'Filings',             keys: ['challan','ecr'] },
];

const COLOR = {
  blue:    { bg: 'bg-blue-50',    text: 'text-blue-700',    border: 'border-blue-200',    active: 'bg-blue-600'    },
  emerald: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', active: 'bg-emerald-600' },
  violet:  { bg: 'bg-violet-50',  text: 'text-violet-700',  border: 'border-violet-200',  active: 'bg-violet-600'  },
  amber:   { bg: 'bg-amber-50',   text: 'text-amber-700',   border: 'border-amber-200',   active: 'bg-amber-600'   },
  rose:    { bg: 'bg-rose-50',    text: 'text-rose-700',    border: 'border-rose-200',    active: 'bg-rose-600'    },
  teal:    { bg: 'bg-teal-50',    text: 'text-teal-700',    border: 'border-teal-200',    active: 'bg-teal-600'    },
  orange:  { bg: 'bg-orange-50',  text: 'text-orange-700',  border: 'border-orange-200',  active: 'bg-orange-600'  },
  indigo:  { bg: 'bg-indigo-50',  text: 'text-indigo-700',  border: 'border-indigo-200',  active: 'bg-indigo-600'  },
  red:     { bg: 'bg-red-50',     text: 'text-red-700',     border: 'border-red-200',     active: 'bg-red-600'     },
  sky:     { bg: 'bg-sky-50',     text: 'text-sky-700',     border: 'border-sky-200',     active: 'bg-sky-600'     },
  yellow:  { bg: 'bg-yellow-50',  text: 'text-yellow-700',  border: 'border-yellow-200',  active: 'bg-yellow-600'  },
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

// ── Labour Licences ───────────────────────────────────────────────────────────
const LICENSE_TYPES = [
  { value: 'contract_labour', label: 'Contract Labour Act Registration' },
  { value: 'shop_act',        label: 'Shop & Establishment Act' },
  { value: 'factory_act',     label: 'Factory Act Licence' },
  { value: 'pf_code',         label: 'PF Registration / Code Number' },
  { value: 'esi_code',        label: 'ESI Registration / Code Number' },
  { value: 'pt_reg',          label: 'Professional Tax Registration' },
  { value: 'labour_welfare',  label: 'Labour Welfare Fund' },
  { value: 'building_plan',   label: 'Building Plan Approval' },
  { value: 'environmental',   label: 'Environmental Clearance' },
  { value: 'other',           label: 'Other' },
];
const LICENSE_STATUS_OPTS = ['active','expired','renewed','cancelled'];
const EMPTY_LICENSE = { license_type:'contract_labour', license_name:'', license_number:'', issuing_authority:'', issue_date:'', expiry_date:'', alert_days:30, renewal_cost:'', status:'active', notes:'' };

function LabourLicenses() {
  const qc = useQueryClient();
  const [modal, setModal]   = useState(null); // null | { mode:'add'|'edit', data? }
  const [form,  setForm]    = useState(EMPTY_LICENSE);
  const [delId, setDelId]   = useState(null);

  const { data: res, isLoading, refetch } = useQuery({
    queryKey: ['compliance-licenses'],
    queryFn:  () => hrComplianceAPI.labourLicenses().then(r => r.data),
  });
  const rows     = res?.data || [];
  const expired  = rows.filter(r => r.is_expired).length;
  const expiring = rows.filter(r => r.expiring_soon && !r.is_expired).length;
  const active   = rows.filter(r => !r.is_expired).length;

  const saveMut = useMutation({
    mutationFn: (d) => modal?.data?.id ? hrComplianceAPI.updateLicence(modal.data.id, d) : hrComplianceAPI.createLicence(d),
    onSuccess:  () => { qc.invalidateQueries(['compliance-licenses']); setModal(null); toast.success('Saved'); },
    onError:    (e) => toast.error(e.response?.data?.error || 'Save failed'),
  });
  const delMut = useMutation({
    mutationFn: (id) => hrComplianceAPI.deleteLicence(id),
    onSuccess:  () => { qc.invalidateQueries(['compliance-licenses']); setDelId(null); toast.success('Deleted'); },
    onError:    (e) => toast.error(e.response?.data?.error || 'Delete failed'),
  });

  const openAdd  = () => { setForm(EMPTY_LICENSE); setModal({ mode:'add' }); };
  const openEdit = (r) => { setForm({ ...r, issue_date: r.issue_date?.slice(0,10)||'', expiry_date: r.expiry_date?.slice(0,10)||'' }); setModal({ mode:'edit', data:r }); };

  const statusBadge = (r) => {
    if (r.is_expired)    return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-50 text-red-700">Expired {Math.abs(r.days_remaining)}d ago</span>;
    if (r.expiring_soon) return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700">Expires in {r.days_remaining}d</span>;
    if (r.days_remaining !== null) return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700">Valid ({r.days_remaining}d left)</span>;
    return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-gray-100 text-gray-600 capitalize">{r.status}</span>;
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 items-center justify-between">
        <div className="flex gap-3 flex-wrap">
          {expired  > 0 && <div className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 text-red-700 rounded-xl text-xs font-bold"><AlertTriangle size={13}/> {expired} Expired</div>}
          {expiring > 0 && <div className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 text-amber-700 rounded-xl text-xs font-bold"><Clock size={13}/> {expiring} Expiring Soon</div>}
        </div>
        <div className="flex gap-2">
          <button onClick={refetch} className="p-2 rounded-xl hover:bg-gray-100"><RefreshCw size={15} className="text-gray-500"/></button>
          <button onClick={openAdd} className="flex items-center gap-2 px-4 py-2 text-sm font-bold rounded-xl bg-indigo-600 text-white hover:bg-indigo-700">
            <Plus size={14}/> Add Licence
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Total Licences" value={rows.length}/>
        <StatCard label="Active / Valid" value={active}/>
        <StatCard label="Expiring Soon"  value={expiring} sub="Within alert period"/>
        <StatCard label="Expired"        value={expired}  sub="Needs renewal"/>
      </div>

      {isLoading ? <LoadingTable/> : (
        <div className="overflow-x-auto rounded-2xl border border-gray-100" style={{boxShadow:'0 2px 10px rgba(10,31,92,0.06)'}}>
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-indigo-700 text-white">
                {['#','Type','Licence Name','Number','Issuing Authority','Issue Date','Expiry Date','Status','Alert','Actions'].map(h => (
                  <th key={h} className="px-3 py-3 text-left font-bold text-[11px] whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((r, i) => (
                <tr key={r.id} className={`hover:bg-indigo-50/40 ${r.is_expired ? 'bg-red-50/20' : r.expiring_soon ? 'bg-amber-50/20' : ''}`}>
                  <td className="px-3 py-2 text-gray-400">{i+1}</td>
                  <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{LICENSE_TYPES.find(t => t.value === r.license_type)?.label || r.license_type}</td>
                  <td className="px-3 py-2 font-semibold text-gray-900">{r.license_name || '—'}</td>
                  <td className="px-3 py-2 font-mono text-indigo-700">{r.license_number || '—'}</td>
                  <td className="px-3 py-2 text-gray-600">{r.issuing_authority || '—'}</td>
                  <td className="px-3 py-2 text-gray-600">{r.issue_date ? new Date(r.issue_date).toLocaleDateString('en-IN') : '—'}</td>
                  <td className="px-3 py-2 font-semibold">{r.expiry_date ? new Date(r.expiry_date).toLocaleDateString('en-IN') : '—'}</td>
                  <td className="px-3 py-2">{statusBadge(r)}</td>
                  <td className="px-3 py-2 text-gray-500">{r.alert_days}d</td>
                  <td className="px-3 py-2">
                    <div className="flex gap-1">
                      <button onClick={() => openEdit(r)} className="p-1.5 rounded-lg hover:bg-indigo-100 text-indigo-600"><Edit2 size={12}/></button>
                      <button onClick={() => setDelId(r.id)} className="p-1.5 rounded-lg hover:bg-red-100 text-red-500"><Trash2 size={12}/></button>
                    </div>
                  </td>
                </tr>
              ))}
              {!rows.length && <tr><td colSpan={10} className="px-3 py-10 text-center text-gray-400">No licences added yet. Click "Add Licence" to start tracking.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {/* Add / Edit Modal */}
      {modal && (
        <div className="fixed inset-0 z-[80] bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h3 className="font-black text-gray-900">{modal.mode === 'add' ? 'Add Licence' : 'Edit Licence'}</h3>
              <button onClick={() => setModal(null)} className="p-1.5 rounded-lg hover:bg-gray-100"><X size={16}/></button>
            </div>
            <div className="px-6 py-5 grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="block text-xs font-semibold text-gray-600 mb-1">Licence Type *</label>
                <select value={form.license_type} onChange={e => setForm(f => ({...f, license_type:e.target.value}))}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20">
                  {LICENSE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Licence Name</label>
                <input value={form.license_name} onChange={e => setForm(f => ({...f, license_name:e.target.value}))} placeholder="e.g. Contract Labour Principal Employer"
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20"/>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Licence / Registration Number</label>
                <input value={form.license_number} onChange={e => setForm(f => ({...f, license_number:e.target.value}))} placeholder="Registration No."
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20"/>
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-semibold text-gray-600 mb-1">Issuing Authority</label>
                <input value={form.issuing_authority} onChange={e => setForm(f => ({...f, issuing_authority:e.target.value}))} placeholder="e.g. EPFO, ESIC, Labour Dept, Commercial Tax Dept"
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20"/>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Issue Date</label>
                <input type="date" value={form.issue_date} onChange={e => setForm(f => ({...f, issue_date:e.target.value}))}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20"/>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Expiry Date</label>
                <input type="date" value={form.expiry_date} onChange={e => setForm(f => ({...f, expiry_date:e.target.value}))}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20"/>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Alert Before Expiry (days)</label>
                <input type="number" value={form.alert_days} onChange={e => setForm(f => ({...f, alert_days:parseInt(e.target.value)||30}))}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20"/>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Renewal Cost (₹)</label>
                <input type="number" value={form.renewal_cost} onChange={e => setForm(f => ({...f, renewal_cost:e.target.value}))} placeholder="0"
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20"/>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Status</label>
                <select value={form.status} onChange={e => setForm(f => ({...f, status:e.target.value}))}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20">
                  {LICENSE_STATUS_OPTS.map(s => <option key={s} value={s} className="capitalize">{s}</option>)}
                </select>
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-semibold text-gray-600 mb-1">Notes</label>
                <textarea value={form.notes||''} onChange={e => setForm(f => ({...f, notes:e.target.value}))} rows={2}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 resize-none"/>
              </div>
            </div>
            <div className="flex gap-3 justify-end px-6 pb-5">
              <button onClick={() => setModal(null)} className="px-4 py-2 text-sm font-semibold rounded-xl text-gray-600 hover:bg-gray-100">Cancel</button>
              <button onClick={() => saveMut.mutate(form)} disabled={saveMut.isPending}
                className="px-5 py-2 text-sm font-bold rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-60">
                {saveMut.isPending ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {delId && (
        <div className="fixed inset-0 z-[90] bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full">
            <h3 className="font-black text-gray-900 mb-2">Delete Licence?</h3>
            <p className="text-sm text-gray-500 mb-5">This cannot be undone.</p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setDelId(null)} className="px-4 py-2 text-sm font-semibold rounded-xl text-gray-600 hover:bg-gray-100">Cancel</button>
              <button onClick={() => delMut.mutate(delId)} disabled={delMut.isPending}
                className="px-4 py-2 text-sm font-bold rounded-xl bg-red-600 text-white hover:bg-red-700 disabled:opacity-60">
                {delMut.isPending ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Document Expiry Tracker ────────────────────────────────────────────────────
function DocumentExpiry() {
  const qc = useQueryClient();
  const [filter,    setFilter]    = useState('all');
  const [editModal, setEditModal] = useState(null);
  const [editForm,  setEditForm]  = useState({});

  const { data: res, isLoading, refetch } = useQuery({
    queryKey: ['compliance-docexpiry', filter],
    queryFn:  () => hrComplianceAPI.documentExpiry({ filter }).then(r => r.data),
  });
  const rows    = res?.data  || [];
  const total   = res?.total || rows.length;
  const expired  = rows.filter(r => r.is_expired).length;
  const expiring = rows.filter(r => r.expiring_soon && !r.is_expired).length;
  const noExpiry = rows.filter(r => !r.expiry_date).length;

  const updateMut = useMutation({
    mutationFn: ({ id, ...d }) => hrComplianceAPI.updateDocExpiry(id, d),
    onSuccess:  () => { qc.invalidateQueries(['compliance-docexpiry']); setEditModal(null); toast.success('Updated'); },
    onError:    (e) => toast.error(e.response?.data?.error || 'Update failed'),
  });

  const openEdit = (r) => {
    setEditForm({ expiry_date: r.expiry_date?.slice(0,10)||'', issued_date: r.issued_date?.slice(0,10)||'', document_number: r.document_number||'', alert_days: r.alert_days||30 });
    setEditModal(r);
  };

  const daysBadge = (r) => {
    if (!r.expiry_date) return <span className="text-gray-400 text-[10px] italic">No expiry set</span>;
    if (r.is_expired)    return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-50 text-red-700">Expired {Math.abs(r.days_remaining)}d ago</span>;
    if (r.expiring_soon) return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700">Expires in {r.days_remaining}d</span>;
    return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700">{r.days_remaining}d left</span>;
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 items-center justify-between">
        <div className="flex gap-2">
          {[['all',`All (${total})`],['expiring',`Expiring (${expiring})`],['expired',`Expired (${expired})`]].map(([f,lbl]) => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-all ${filter === f ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              {lbl}
            </button>
          ))}
        </div>
        <button onClick={refetch} className="p-2 rounded-xl hover:bg-gray-100"><RefreshCw size={15} className="text-gray-500"/></button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Total Documents" value={total}/>
        <StatCard label="Expired"         value={expired}  sub="Needs renewal"/>
        <StatCard label="Expiring Soon"   value={expiring} sub="Within alert days"/>
        <StatCard label="No Expiry Set"   value={filter === 'all' ? noExpiry : 0} sub="Click edit to add"/>
      </div>

      {filter === 'all' && noExpiry > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-700 flex items-start gap-2">
          <AlertTriangle size={14} className="flex-shrink-0 mt-0.5"/>
          <span><strong>{noExpiry} document(s)</strong> have no expiry date. Click the edit icon on each row to add expiry dates for tracking.</span>
        </div>
      )}

      {isLoading ? <LoadingTable/> : (
        <div className="overflow-x-auto rounded-2xl border border-gray-100" style={{boxShadow:'0 2px 10px rgba(10,31,92,0.06)'}}>
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-red-700 text-white">
                {['#','Employee','Code','Dept','Doc Type','Doc Name','Doc Number','Issue Date','Expiry Date','Status','Edit'].map(h => (
                  <th key={h} className="px-3 py-3 text-left font-bold text-[11px] whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((r, i) => (
                <tr key={r.id} className={`hover:bg-red-50/30 ${r.is_expired ? 'bg-red-50/10' : r.expiring_soon ? 'bg-amber-50/10' : ''}`}>
                  <td className="px-3 py-2 text-gray-400">{i+1}</td>
                  <td className="px-3 py-2 font-semibold text-gray-900 whitespace-nowrap">{r.employee_name}</td>
                  <td className="px-3 py-2 font-mono text-gray-600">{r.employee_code}</td>
                  <td className="px-3 py-2 text-gray-500">{r.department}</td>
                  <td className="px-3 py-2 text-gray-600 capitalize">{(r.doc_type||'').replace(/_/g,' ')}</td>
                  <td className="px-3 py-2 text-gray-600">{r.doc_name || '—'}</td>
                  <td className="px-3 py-2 font-mono text-gray-500">{r.document_number || '—'}</td>
                  <td className="px-3 py-2 text-gray-600">{r.issued_date ? new Date(r.issued_date).toLocaleDateString('en-IN') : '—'}</td>
                  <td className="px-3 py-2 font-semibold">{r.expiry_date ? new Date(r.expiry_date).toLocaleDateString('en-IN') : '—'}</td>
                  <td className="px-3 py-2">{daysBadge(r)}</td>
                  <td className="px-3 py-2">
                    <button onClick={() => openEdit(r)} className="p-1.5 rounded-lg hover:bg-red-100 text-red-600"><Edit2 size={12}/></button>
                  </td>
                </tr>
              ))}
              {!rows.length && (
                <tr><td colSpan={11} className="px-3 py-10 text-center text-gray-400">
                  {filter === 'all' ? 'No documents found' : `No ${filter} documents`}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Edit Expiry Modal */}
      {editModal && (
        <div className="fixed inset-0 z-[80] bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h3 className="font-black text-gray-900">Update Document Expiry</h3>
              <button onClick={() => setEditModal(null)} className="p-1.5 rounded-lg hover:bg-gray-100"><X size={16}/></button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div className="bg-gray-50 rounded-xl px-4 py-3">
                <p className="font-semibold text-gray-800 text-sm">{editModal.employee_name}</p>
                <p className="text-gray-500 text-xs mt-0.5">{editModal.doc_name} — {(editModal.doc_type||'').replace(/_/g,' ')}</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Document Number</label>
                  <input value={editForm.document_number} onChange={e => setEditForm(f => ({...f, document_number:e.target.value}))}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500/20"/>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Alert Before (days)</label>
                  <input type="number" value={editForm.alert_days} onChange={e => setEditForm(f => ({...f, alert_days:parseInt(e.target.value)||30}))}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500/20"/>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Issue Date</label>
                  <input type="date" value={editForm.issued_date} onChange={e => setEditForm(f => ({...f, issued_date:e.target.value}))}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500/20"/>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Expiry Date</label>
                  <input type="date" value={editForm.expiry_date} onChange={e => setEditForm(f => ({...f, expiry_date:e.target.value}))}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500/20"/>
                </div>
              </div>
            </div>
            <div className="flex gap-3 justify-end px-6 pb-5">
              <button onClick={() => setEditModal(null)} className="px-4 py-2 text-sm font-semibold rounded-xl text-gray-600 hover:bg-gray-100">Cancel</button>
              <button onClick={() => updateMut.mutate({ id: editModal.id, ...editForm })} disabled={updateMut.isPending}
                className="px-5 py-2 text-sm font-bold rounded-xl bg-red-600 text-white hover:bg-red-700 disabled:opacity-60">
                {updateMut.isPending ? 'Saving…' : 'Update'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Compliance Calendar ────────────────────────────────────────────────────────
function ComplianceCalendar() {
  const [month, setMonth] = useState(CURRENT_MONTH);
  const [year,  setYear]  = useState(CURRENT_YEAR);

  const { data: res, isLoading, refetch } = useQuery({
    queryKey: ['compliance-calendar', month, year],
    queryFn:  () => hrComplianceAPI.complianceCalendar({ month, year }).then(r => r.data),
  });
  const tasks    = res?.data || [];
  const overdue  = tasks.filter(t => t.overdue).length;
  const dueSoon  = tasks.filter(t => t.due_soon && !t.overdue).length;
  const upcoming = tasks.filter(t => !t.overdue && !t.due_soon).length;

  const catColor = (cat) =>
    cat === 'PF'    ? { bg:'bg-blue-50',    text:'text-blue-700',    border:'border-blue-200'    } :
    cat === 'ESI'   ? { bg:'bg-emerald-50', text:'text-emerald-700', border:'border-emerald-200' } :
    cat === 'PT'    ? { bg:'bg-violet-50',  text:'text-violet-700',  border:'border-violet-200'  } :
    cat === 'TDS'   ? { bg:'bg-orange-50',  text:'text-orange-700',  border:'border-orange-200'  } :
                      { bg:'bg-amber-50',   text:'text-amber-700',   border:'border-amber-200'   };

  const catBadge = (t) =>
    t.overdue  ? 'bg-red-700 text-white' :
    t.due_soon ? 'bg-amber-600 text-white' :
    t.category === 'PF'  ? 'bg-blue-700 text-white' :
    t.category === 'ESI' ? 'bg-emerald-700 text-white' :
    t.category === 'PT'  ? 'bg-violet-700 text-white' :
    t.category === 'TDS' ? 'bg-orange-700 text-white' : 'bg-amber-700 text-white';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 items-center justify-between">
        <MonthYearPicker month={month} year={year} onChange={(m,y) => { setMonth(m); setYear(y); }}/>
        <button onClick={refetch} className="p-2 rounded-xl hover:bg-gray-100"><RefreshCw size={15} className="text-gray-500"/></button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Total Tasks"  value={tasks.length} sub={res?.month_name}/>
        <StatCard label="Overdue"      value={overdue}  sub="Past due date"/>
        <StatCard label="Due Soon"     value={dueSoon}  sub="Within 3 days"/>
        <StatCard label="Upcoming"     value={upcoming} sub="On schedule"/>
      </div>

      <div className="bg-sky-50 border border-sky-200 rounded-xl px-4 py-3 text-xs text-sky-700">
        Statutory due dates for <strong>{res?.month_name || MONTHS[month-1]} {year}</strong>.
        Dates based on standard Indian labour law requirements — verify with your CA for state-specific variations.
      </div>

      {isLoading ? <LoadingTable/> : (
        <div className="space-y-3">
          {tasks.map(t => {
            const c = catColor(t.category);
            const rowBg    = t.overdue ? 'bg-red-50 border-red-200' : t.due_soon ? 'bg-amber-50 border-amber-200' : `${c.bg} ${c.border}`;
            const textCls  = t.overdue ? 'text-red-700' : t.due_soon ? 'text-amber-700' : c.text;
            return (
              <div key={t.id} className={`flex items-start gap-4 p-4 rounded-2xl border ${rowBg}`}>
                <div className={`min-w-[52px] text-center rounded-xl py-2 ${t.overdue ? 'bg-red-100' : t.due_soon ? 'bg-amber-100' : c.bg} border ${t.overdue ? 'border-red-200' : t.due_soon ? 'border-amber-200' : c.border}`}>
                  <p className={`text-xl font-black leading-none ${textCls}`}>{t.due_day}</p>
                  <p className={`text-[10px] font-semibold opacity-70 ${textCls}`}>{MONTHS[month-1].slice(0,3)}</p>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${catBadge(t)}`}>{t.category}</span>
                    <p className={`text-sm font-bold ${textCls}`}>{t.task}</p>
                  </div>
                  <p className="text-xs text-gray-500">{t.description}</p>
                </div>
                <div className="text-right whitespace-nowrap flex-shrink-0">
                  {t.overdue
                    ? <span className="text-xs font-bold text-red-600">{Math.abs(t.days_remaining)}d overdue</span>
                    : t.days_remaining === 0
                    ? <span className="text-xs font-black text-amber-600">DUE TODAY</span>
                    : <span className={`text-xs font-semibold ${t.due_soon ? 'text-amber-600 font-bold' : 'text-gray-500'}`}>in {t.days_remaining}d</span>
                  }
                </div>
              </div>
            );
          })}
          {!tasks.length && <div className="text-center py-10 text-gray-400 text-sm">No compliance tasks for this month</div>}
        </div>
      )}
    </div>
  );
}

// ── BOCW Register ─────────────────────────────────────────────────────────────
function BOCWRegister() {
  const qc = useQueryClient();
  const [year, setYear] = useState(CURRENT_YEAR);
  const [cessModal, setCessModal] = useState(null);
  const [cessForm, setCessForm] = useState({ year: CURRENT_YEAR, project_name:'', construction_cost:'', cess_rate:1.0, paid_amount:'', payment_date:'', challan_number:'', notes:'' });

  const { data: wRes, isLoading: wLoading, refetch: wRefetch } = useQuery({
    queryKey: ['bocw-workers'],
    queryFn: () => hrComplianceAPI.bocwRegister().then(r => r.data),
  });
  const { data: cRes, isLoading: cLoading, refetch: cRefetch } = useQuery({
    queryKey: ['bocw-cess', year],
    queryFn: () => hrComplianceAPI.bocwCess({ year }).then(r => r.data),
  });

  const workers = wRes?.data || [];
  const cessRows = cRes?.data || [];
  const cessTotals = cRes?.totals || {};

  const saveCess = useMutation({
    mutationFn: d => cessModal?.id ? hrComplianceAPI.updateBocwCess(cessModal.id, d) : hrComplianceAPI.createBocwCess(d),
    onSuccess: () => { qc.invalidateQueries(['bocw-cess']); setCessModal(null); toast.success('Saved'); },
    onError: e => toast.error(e.response?.data?.error || 'Failed'),
  });
  const delCess = useMutation({
    mutationFn: id => hrComplianceAPI.deleteBocwCess(id),
    onSuccess: () => { qc.invalidateQueries(['bocw-cess']); toast.success('Deleted'); },
  });

  return (
    <div className="space-y-6">
      <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-800">
        <strong>BOCW Act 1996:</strong> Mandatory registration of all construction workers. Employer must pay <strong>1% Welfare Cess</strong> on total construction cost. Worker registration in Form-I; cess payment in Form-II.
      </div>

      {/* Worker Registry */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-black text-gray-900 text-sm">Site Worker Registry</h3>
          <div className="flex gap-2">
            <button onClick={wRefetch} className="p-2 rounded-xl hover:bg-gray-100"><RefreshCw size={15} className="text-gray-500"/></button>
            <ExportBtn color="amber" data={workers} filename={`BOCW_Register_${CURRENT_YEAR}`}/>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label="Total Workers" value={wRes?.total || 0}/>
          <StatCard label="BOCW Registered" value={wRes?.registered || 0} sub="Has BOCW number"/>
          <StatCard label="Not Registered" value={wRes?.unregistered || 0} sub="Needs BOCW card"/>
          <StatCard label="Registration %" value={wRes?.total ? `${Math.round((wRes.registered/wRes.total)*100)}%` : '—'}/>
        </div>
        {wLoading ? <LoadingTable/> : (
          <div className="overflow-x-auto rounded-2xl border border-gray-100" style={{boxShadow:'0 2px 10px rgba(10,31,92,0.06)'}}>
            <table className="w-full text-xs">
              <thead><tr className="bg-amber-700 text-white">
                {['#','Worker Code','Name','Trade','BOCW No.','Aadhaar (Last 4)','Daily Rate','Project','Contractor','Status'].map(h => (
                  <th key={h} className="px-3 py-3 text-left font-bold text-[11px] whitespace-nowrap">{h}</th>
                ))}
              </tr></thead>
              <tbody className="divide-y divide-gray-100">
                {workers.map((w,i) => (
                  <tr key={w.id} className={`hover:bg-amber-50/30 ${!w.bocw_number ? 'bg-red-50/10' : ''}`}>
                    <td className="px-3 py-2 text-gray-400">{i+1}</td>
                    <td className="px-3 py-2 font-mono text-gray-700">{w.worker_code}</td>
                    <td className="px-3 py-2 font-semibold text-gray-900">{w.name}</td>
                    <td className="px-3 py-2 capitalize text-gray-600">{(w.skill_type||'').replace(/_/g,' ')}</td>
                    <td className="px-3 py-2 font-mono text-amber-700">{w.bocw_number || <span className="text-red-500 font-bold">Not Registered</span>}</td>
                    <td className="px-3 py-2 font-mono text-gray-500">{w.aadhaar_last4 ? `XXXX-XXXX-${w.aadhaar_last4}` : '—'}</td>
                    <td className="px-3 py-2 text-right font-mono">₹{inr(w.daily_rate)}</td>
                    <td className="px-3 py-2 text-gray-600">{w.project_name}</td>
                    <td className="px-3 py-2 text-gray-600">{w.contractor_name}</td>
                    <td className="px-3 py-2"><span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${w.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>{w.is_active ? 'Active' : 'Inactive'}</span></td>
                  </tr>
                ))}
                {!workers.length && <tr><td colSpan={10} className="px-3 py-10 text-center text-gray-400">No site workers found</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Welfare Cess Tracker */}
      <div className="space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h3 className="font-black text-gray-900 text-sm">Welfare Cess Tracker (1% of Construction Cost)</h3>
          <div className="flex gap-2 items-center">
            <select value={year} onChange={e => setYear(+e.target.value)} className="px-3 py-2 text-sm border border-gray-200 rounded-xl bg-white focus:outline-none">
              {[2023,2024,2025,2026,2027].map(y => <option key={y} value={y}>{y}</option>)}
            </select>
            <button onClick={cRefetch} className="p-2 rounded-xl hover:bg-gray-100"><RefreshCw size={15} className="text-gray-500"/></button>
            <button onClick={() => { setCessForm({year, project_name:'', construction_cost:'', cess_rate:1.0, paid_amount:'', payment_date:'', challan_number:'', notes:''}); setCessModal({}); }}
              className="flex items-center gap-2 px-4 py-2 text-sm font-bold rounded-xl bg-amber-600 text-white hover:bg-amber-700">
              <Plus size={14}/> Add Cess Entry
            </button>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <StatCard label="Construction Cost" value={`₹${inr(cessTotals.construction_cost)}`}/>
          <StatCard label="Total Cess Due (1%)" value={`₹${inr(cessTotals.cess_amount)}`}/>
          <StatCard label="Total Paid" value={`₹${inr(cessTotals.paid_amount)}`} sub={cessTotals.cess_amount > cessTotals.paid_amount ? `₹${inr(cessTotals.cess_amount - cessTotals.paid_amount)} outstanding` : 'Fully paid'}/>
        </div>
        {cLoading ? <LoadingTable/> : (
          <div className="overflow-x-auto rounded-2xl border border-gray-100" style={{boxShadow:'0 2px 10px rgba(10,31,92,0.06)'}}>
            <table className="w-full text-xs">
              <thead><tr className="bg-amber-700 text-white">
                {['Project','Construction Cost','Cess Rate','Cess Due','Paid','Challan No.','Paid On','Balance','Actions'].map(h => (
                  <th key={h} className="px-3 py-3 text-left font-bold text-[11px] whitespace-nowrap">{h}</th>
                ))}
              </tr></thead>
              <tbody className="divide-y divide-gray-100">
                {cessRows.map(r => {
                  const balance = parseFloat(r.cess_amount||0) - parseFloat(r.paid_amount||0);
                  return (
                    <tr key={r.id} className={`hover:bg-amber-50/30 ${balance > 0 ? 'bg-red-50/10' : ''}`}>
                      <td className="px-3 py-2 font-semibold text-gray-900">{r.project_name}</td>
                      <td className="px-3 py-2 text-right font-mono">₹{inr(r.construction_cost)}</td>
                      <td className="px-3 py-2 text-center">{r.cess_rate}%</td>
                      <td className="px-3 py-2 text-right font-mono font-bold text-amber-700">₹{inr(r.cess_amount)}</td>
                      <td className="px-3 py-2 text-right font-mono text-emerald-700">₹{inr(r.paid_amount)}</td>
                      <td className="px-3 py-2 font-mono text-gray-500">{r.challan_number || '—'}</td>
                      <td className="px-3 py-2">{r.payment_date ? new Date(r.payment_date).toLocaleDateString('en-IN') : '—'}</td>
                      <td className="px-3 py-2 text-right font-mono font-black">{balance > 0 ? <span className="text-red-600">₹{inr(balance)}</span> : <span className="text-emerald-600">Nil</span>}</td>
                      <td className="px-3 py-2 flex gap-1">
                        <button onClick={() => { setCessForm({...r, payment_date: r.payment_date?.slice(0,10)||''}); setCessModal(r); }} className="p-1.5 rounded-lg hover:bg-amber-100 text-amber-700"><Edit2 size={12}/></button>
                        <button onClick={() => delCess.mutate(r.id)} className="p-1.5 rounded-lg hover:bg-red-100 text-red-500"><Trash2 size={12}/></button>
                      </td>
                    </tr>
                  );
                })}
                {!cessRows.length && <tr><td colSpan={9} className="px-3 py-8 text-center text-gray-400">No cess records. Click "Add Cess Entry" to track BOCW welfare cess payments.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {cessModal !== null && (
        <div className="fixed inset-0 z-[80] bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h3 className="font-black text-gray-900">{cessModal?.id ? 'Edit Cess Entry' : 'Add Cess Entry'}</h3>
              <button onClick={() => setCessModal(null)} className="p-1.5 rounded-lg hover:bg-gray-100"><X size={16}/></button>
            </div>
            <div className="px-6 py-5 grid grid-cols-2 gap-4">
              {[
                ['Year','year','number'],['Project Name','project_name','text'],
                ['Construction Cost (₹)','construction_cost','number'],['Cess Rate (%)','cess_rate','number'],
                ['Amount Paid (₹)','paid_amount','number'],['Payment Date','payment_date','date'],
                ['Challan Number','challan_number','text'],['Notes','notes','text'],
              ].map(([label, key, type]) => (
                <div key={key} className={key === 'project_name' || key === 'notes' ? 'col-span-2' : ''}>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">{label}</label>
                  <input type={type} value={cessForm[key]||''} onChange={e => setCessForm(f => ({...f, [key]: e.target.value}))}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500/20"/>
                </div>
              ))}
            </div>
            <div className="flex gap-3 justify-end px-6 pb-5">
              <button onClick={() => setCessModal(null)} className="px-4 py-2 text-sm font-semibold rounded-xl text-gray-600 hover:bg-gray-100">Cancel</button>
              <button onClick={() => saveCess.mutate(cessForm)} disabled={saveCess.isPending}
                className="px-5 py-2 text-sm font-bold rounded-xl bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-60">
                {saveCess.isPending ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Gratuity Liability ─────────────────────────────────────────────────────────
function GratuityRegister({ depts }) {
  const [dept, setDept] = useState('');
  const [minYears, setMinYears] = useState(1);

  const { data: res, isLoading, refetch } = useQuery({
    queryKey: ['gratuity', dept, minYears],
    queryFn: () => hrComplianceAPI.gratuity({ dept: dept||undefined, min_years: minYears }).then(r => r.data),
  });
  const rows   = res?.data   || [];
  const totals = res?.totals || {};
  const eligible = rows.filter(r => r.eligible);

  return (
    <div className="space-y-4">
      <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 text-xs text-emerald-800">
        <strong>Payment of Gratuity Act 1972:</strong> Employee eligible after completing <strong>5 years</strong> continuous service.
        Formula: <strong>(Last Basic ÷ 26) × 15 × Completed Years</strong>. Maximum ₹20 lakhs. Payable within 30 days of separation.
      </div>
      <div className="flex flex-wrap gap-3 items-center justify-between">
        <div className="flex gap-3 items-center flex-wrap">
          <select value={dept} onChange={e => setDept(e.target.value)} className="px-3 py-2 text-sm border border-gray-200 rounded-xl bg-white focus:outline-none">
            <option value="">All Departments</option>
            {depts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
          <select value={minYears} onChange={e => setMinYears(+e.target.value)} className="px-3 py-2 text-sm border border-gray-200 rounded-xl bg-white focus:outline-none">
            <option value={1}>All (1+ year)</option>
            <option value={3}>3+ years</option>
            <option value={5}>5+ years (eligible)</option>
          </select>
        </div>
        <div className="flex gap-2">
          <button onClick={refetch} className="p-2 rounded-xl hover:bg-gray-100"><RefreshCw size={15} className="text-gray-500"/></button>
          <ExportBtn color="emerald" data={rows} filename="Gratuity_Liability"/>
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Total Employees" value={totals.total||0} sub={`Showing ${minYears}+ years`}/>
        <StatCard label="Eligible (5+ yrs)" value={totals.eligible||0} sub="Entitled to gratuity"/>
        <StatCard label="Payable Liability" value={`₹${inr(totals.total_liability)}`} sub="For 5+ yr employees"/>
        <StatCard label="Potential Liability" value={`₹${inr(totals.potential_liability)}`} sub="All employees (future)"/>
      </div>
      {isLoading ? <LoadingTable/> : (
        <div className="overflow-x-auto rounded-2xl border border-gray-100" style={{boxShadow:'0 2px 10px rgba(10,31,92,0.06)'}}>
          <table className="w-full text-xs">
            <thead><tr className="bg-emerald-700 text-white">
              {['#','Code','Name','Dept','Designation','DOJ','Years','Basic (₹)','Gratuity (₹)','Status'].map(h => (
                <th key={h} className="px-3 py-3 text-left font-bold text-[11px] whitespace-nowrap">{h}</th>
              ))}
            </tr></thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((r,i) => (
                <tr key={r.employee_code} className={`hover:bg-emerald-50/30 ${r.eligible ? 'bg-emerald-50/20' : ''}`}>
                  <td className="px-3 py-2 text-gray-400">{i+1}</td>
                  <td className="px-3 py-2 font-mono text-gray-700">{r.employee_code}</td>
                  <td className="px-3 py-2 font-semibold text-gray-900">{r.name}</td>
                  <td className="px-3 py-2 text-gray-600">{r.department}</td>
                  <td className="px-3 py-2 text-gray-600">{r.designation}</td>
                  <td className="px-3 py-2">{r.date_of_joining ? new Date(r.date_of_joining).toLocaleDateString('en-IN') : '—'}</td>
                  <td className="px-3 py-2 font-bold text-gray-800">{r.years_decimal} yrs</td>
                  <td className="px-3 py-2 text-right font-mono">{inr(r.basic)}</td>
                  <td className="px-3 py-2 text-right font-mono font-black text-emerald-700">{r.eligible ? `₹${inr(r.gratuity_liability)}` : '—'}</td>
                  <td className="px-3 py-2">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${r.eligible ? 'bg-emerald-50 text-emerald-700' : r.completed_years >= 3 ? 'bg-amber-50 text-amber-700' : 'bg-gray-100 text-gray-500'}`}>
                      {r.eligible ? 'Eligible' : `${r.completed_years} yr${r.completed_years !== 1 ? 's' : ''}`}
                    </span>
                  </td>
                </tr>
              ))}
              {rows.length > 0 && (
                <tr className="bg-emerald-50 font-black">
                  <td colSpan={8} className="px-3 py-2 text-emerald-800 font-black">PAYABLE TOTAL (eligible only)</td>
                  <td className="px-3 py-2 text-right font-mono font-black text-emerald-700">₹{inr(totals.total_liability)}</td>
                  <td/>
                </tr>
              )}
              {!rows.length && <tr><td colSpan={10} className="px-3 py-10 text-center text-gray-400">No employees found for selected filter</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Bonus Register ─────────────────────────────────────────────────────────────
function BonusRegister({ depts }) {
  const [year, setYear]       = useState(CURRENT_YEAR);
  const [bonusPct, setBonusPct] = useState(8.33);
  const [dept, setDept]       = useState('');

  const { data: res, isLoading, refetch } = useQuery({
    queryKey: ['bonus', year, bonusPct, dept],
    queryFn: () => hrComplianceAPI.bonus({ year, bonus_pct: bonusPct, dept: dept||undefined }).then(r => r.data),
  });
  const rows   = res?.data   || [];
  const totals = res?.totals || {};

  return (
    <div className="space-y-4">
      <div className="bg-yellow-50 border border-yellow-200 rounded-xl px-4 py-3 text-xs text-yellow-800">
        <strong>Payment of Bonus Act 1965:</strong> Employees earning ≤₹21,000/month with ≥1 year service.
        Minimum <strong>8.33%</strong> of annual wages (or ₹7,000/month floor, whichever higher). Max 20%. Due before <strong>30th November</strong> each year.
      </div>
      <div className="flex flex-wrap gap-3 items-center justify-between">
        <div className="flex gap-3 items-center flex-wrap">
          <select value={year} onChange={e => setYear(+e.target.value)} className="px-3 py-2 text-sm border border-gray-200 rounded-xl bg-white focus:outline-none">
            {[2023,2024,2025,2026].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <select value={dept} onChange={e => setDept(e.target.value)} className="px-3 py-2 text-sm border border-gray-200 rounded-xl bg-white focus:outline-none">
            <option value="">All Departments</option>
            {depts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
          <div className="flex items-center gap-2">
            <label className="text-sm font-semibold text-gray-600">Bonus %:</label>
            <input type="number" min={8.33} max={20} step={0.01} value={bonusPct}
              onChange={e => setBonusPct(parseFloat(e.target.value)||8.33)}
              className="w-20 px-3 py-2 text-sm border border-gray-200 rounded-xl bg-white focus:outline-none"/>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={refetch} className="p-2 rounded-xl hover:bg-gray-100"><RefreshCw size={15} className="text-gray-500"/></button>
          <ExportBtn color="amber" data={rows} filename={`Bonus_Register_${year}`}/>
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <StatCard label="Total Employees" value={rows.length}/>
        <StatCard label="Eligible for Bonus" value={totals.eligible||0} sub="≥1 yr + gross ≤₹21,000"/>
        <StatCard label={`Total Bonus (${bonusPct}%)`} value={`₹${inr(totals.total_bonus)}`}/>
      </div>
      {isLoading ? <LoadingTable/> : (
        <div className="overflow-x-auto rounded-2xl border border-gray-100" style={{boxShadow:'0 2px 10px rgba(10,31,92,0.06)'}}>
          <table className="w-full text-xs">
            <thead><tr className="bg-yellow-600 text-white">
              {['#','Code','Name','Dept','DOJ','Yrs','Gross (₹)','Bonus Basis (Annual)','Bonus %','Bonus Amount','Eligibility'].map(h => (
                <th key={h} className="px-3 py-3 text-left font-bold text-[11px] whitespace-nowrap">{h}</th>
              ))}
            </tr></thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((r,i) => (
                <tr key={r.employee_code} className={`hover:bg-yellow-50/30 ${r.eligible ? '' : 'opacity-60'}`}>
                  <td className="px-3 py-2 text-gray-400">{i+1}</td>
                  <td className="px-3 py-2 font-mono text-gray-700">{r.employee_code}</td>
                  <td className="px-3 py-2 font-semibold text-gray-900">{r.name}</td>
                  <td className="px-3 py-2 text-gray-600">{r.department}</td>
                  <td className="px-3 py-2">{r.date_of_joining ? new Date(r.date_of_joining).toLocaleDateString('en-IN') : '—'}</td>
                  <td className="px-3 py-2 text-gray-700">{r.years_service}</td>
                  <td className="px-3 py-2 text-right font-mono">{inr(r.gross_monthly)}</td>
                  <td className="px-3 py-2 text-right font-mono">{r.eligible ? inr(r.bonus_basis) : '—'}</td>
                  <td className="px-3 py-2 text-center">{r.eligible ? `${r.bonus_pct}%` : '—'}</td>
                  <td className="px-3 py-2 text-right font-mono font-black text-yellow-700">{r.eligible ? `₹${inr(r.bonus_amount)}` : '—'}</td>
                  <td className="px-3 py-2">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${r.eligible ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}>
                      {r.eligible ? 'Eligible' : r.ineligible_reason}
                    </span>
                  </td>
                </tr>
              ))}
              {rows.filter(r=>r.eligible).length > 0 && (
                <tr className="bg-yellow-50 font-black">
                  <td colSpan={9} className="px-3 py-2 text-yellow-800 font-black">TOTAL BONUS PAYABLE</td>
                  <td className="px-3 py-2 text-right font-mono font-black text-yellow-700">₹{inr(totals.total_bonus)}</td>
                  <td/>
                </tr>
              )}
              {!rows.length && <tr><td colSpan={11} className="px-3 py-10 text-center text-gray-400">No employees found</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── LWF Register ───────────────────────────────────────────────────────────────
function LWFRegister() {
  const [year, setYear] = useState(CURRENT_YEAR);

  const { data: res, isLoading, refetch } = useQuery({
    queryKey: ['lwf', year],
    queryFn: () => hrComplianceAPI.lwfRegister({ year }).then(r => r.data),
  });
  const rows   = res?.data   || [];
  const totals = res?.totals || {};

  return (
    <div className="space-y-4">
      <div className="bg-rose-50 border border-rose-200 rounded-xl px-4 py-3 text-xs text-rose-800">
        <strong>Karnataka Labour Welfare Fund Act:</strong> Employee contribution <strong>₹20</strong> + Employer contribution <strong>₹40</strong> per employee per year.
        Payable in <strong>January</strong> via online portal to Karnataka Labour Welfare Board. Not applicable to employees earning above prescribed limit.
      </div>
      <div className="flex flex-wrap gap-3 items-center justify-between">
        <select value={year} onChange={e => setYear(+e.target.value)} className="px-3 py-2 text-sm border border-gray-200 rounded-xl bg-white focus:outline-none">
          {[2023,2024,2025,2026,2027].map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <div className="flex gap-2">
          <button onClick={refetch} className="p-2 rounded-xl hover:bg-gray-100"><RefreshCw size={15} className="text-gray-500"/></button>
          <ExportBtn color="rose" data={rows} filename={`LWF_Register_${year}`}/>
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Employees" value={totals.total||0}/>
        <StatCard label="Employee LWF" value={`₹${inr(totals.emp_lwf)}`} sub="₹20 × headcount"/>
        <StatCard label="Employer LWF" value={`₹${inr(totals.employer_lwf)}`} sub="₹40 × headcount"/>
        <StatCard label="Total LWF" value={`₹${inr(totals.total_lwf)}`} sub={`Due: January ${year}`}/>
      </div>
      {isLoading ? <LoadingTable/> : (
        <div className="overflow-x-auto rounded-2xl border border-gray-100" style={{boxShadow:'0 2px 10px rgba(10,31,92,0.06)'}}>
          <table className="w-full text-xs">
            <thead><tr className="bg-rose-700 text-white">
              {['#','Code','Name','Dept','Designation','Gross (₹)','Emp LWF','Employer LWF','Total'].map(h => (
                <th key={h} className="px-3 py-3 text-left font-bold text-[11px] whitespace-nowrap">{h}</th>
              ))}
            </tr></thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map(r => (
                <tr key={r.employee_code} className="hover:bg-rose-50/30">
                  <td className="px-3 py-2 text-gray-400">{r.sno}</td>
                  <td className="px-3 py-2 font-mono text-gray-700">{r.employee_code}</td>
                  <td className="px-3 py-2 font-semibold text-gray-900">{r.name}</td>
                  <td className="px-3 py-2 text-gray-600">{r.department}</td>
                  <td className="px-3 py-2 text-gray-600">{r.designation}</td>
                  <td className="px-3 py-2 text-right font-mono">{inr(r.gross_monthly)}</td>
                  <td className="px-3 py-2 text-right font-mono font-bold text-rose-700">₹20</td>
                  <td className="px-3 py-2 text-right font-mono font-bold text-blue-700">₹40</td>
                  <td className="px-3 py-2 text-right font-mono font-black">₹60</td>
                </tr>
              ))}
              {rows.length > 0 && (
                <tr className="bg-rose-50 font-black">
                  <td colSpan={6} className="px-3 py-2 text-rose-800 font-black">TOTAL</td>
                  <td className="px-3 py-2 text-right font-mono font-black text-rose-700">₹{inr(totals.emp_lwf)}</td>
                  <td className="px-3 py-2 text-right font-mono font-black text-blue-700">₹{inr(totals.employer_lwf)}</td>
                  <td className="px-3 py-2 text-right font-mono font-black">₹{inr(totals.total_lwf)}</td>
                </tr>
              )}
              {!rows.length && <tr><td colSpan={9} className="px-3 py-10 text-center text-gray-400">No employees found</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Minimum Wages Check ────────────────────────────────────────────────────────
function MinWagesCheck({ depts }) {
  const [state, setState] = useState('KA');
  const [dept, setDept]   = useState('');

  const { data: res, isLoading, refetch } = useQuery({
    queryKey: ['min-wages', state, dept],
    queryFn: () => hrComplianceAPI.minWages({ state, dept: dept||undefined }).then(r => r.data),
  });
  const rows       = res?.data || [];
  const violations = rows.filter(r => !r.compliant);
  const wages      = res?.wages || {};

  return (
    <div className="space-y-4">
      <div className="bg-teal-50 border border-teal-200 rounded-xl px-4 py-3 text-xs text-teal-800">
        <strong>Minimum Wages Act 1948:</strong> State government revises minimum wages periodically. Employees below the scheduled minimum wage for their category are flagged.
        Rates shown are approximate — verify with state gazette notifications. <strong className="text-red-600">{violations.length} violation(s)</strong> found.
      </div>
      <div className="flex flex-wrap gap-3 items-center justify-between">
        <div className="flex gap-3 items-center flex-wrap">
          <select value={state} onChange={e => setState(e.target.value)} className="px-3 py-2 text-sm border border-gray-200 rounded-xl bg-white focus:outline-none">
            <option value="KA">Karnataka</option>
            <option value="MH">Maharashtra</option>
            <option value="DL">Delhi</option>
            <option value="TN">Tamil Nadu</option>
          </select>
          <select value={dept} onChange={e => setDept(e.target.value)} className="px-3 py-2 text-sm border border-gray-200 rounded-xl bg-white focus:outline-none">
            <option value="">All Departments</option>
            {depts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </div>
        <div className="flex gap-2">
          <button onClick={refetch} className="p-2 rounded-xl hover:bg-gray-100"><RefreshCw size={15} className="text-gray-500"/></button>
          <ExportBtn color="teal" data={violations} filename={`Min_Wages_Violations_${state}`}/>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl px-4 py-3 grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
        {Object.entries(wages).map(([cat, val]) => (
          <div key={cat} className="text-center">
            <div className="text-gray-500 capitalize">{cat.replace('_', ' ')}</div>
            <div className="font-black text-gray-900">₹{inr(val)}/mo</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <StatCard label="Total Employees" value={rows.length}/>
        <StatCard label="Compliant" value={rows.length - violations.length} sub="Basic ≥ min wage"/>
        <StatCard label="Violations" value={violations.length} sub="Basic below min wage"/>
      </div>

      {isLoading ? <LoadingTable/> : (
        <div className="overflow-x-auto rounded-2xl border border-gray-100" style={{boxShadow:'0 2px 10px rgba(10,31,92,0.06)'}}>
          <table className="w-full text-xs">
            <thead><tr className="bg-teal-700 text-white">
              {['#','Code','Name','Dept','Designation','Category','Basic (₹)','Min Wage (₹)','Shortfall (₹)','Status'].map(h => (
                <th key={h} className="px-3 py-3 text-left font-bold text-[11px] whitespace-nowrap">{h}</th>
              ))}
            </tr></thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map(r => (
                <tr key={r.employee_code} className={`hover:bg-teal-50/30 ${!r.compliant ? 'bg-red-50/20' : ''}`}>
                  <td className="px-3 py-2 text-gray-400">{r.sno}</td>
                  <td className="px-3 py-2 font-mono text-gray-700">{r.employee_code}</td>
                  <td className="px-3 py-2 font-semibold text-gray-900">{r.name}</td>
                  <td className="px-3 py-2 text-gray-600">{r.department}</td>
                  <td className="px-3 py-2 text-gray-600">{r.designation}</td>
                  <td className="px-3 py-2 capitalize text-gray-600">{r.category.replace('_',' ')}</td>
                  <td className="px-3 py-2 text-right font-mono">{inr(r.basic)}</td>
                  <td className="px-3 py-2 text-right font-mono font-bold">{inr(r.min_wage)}</td>
                  <td className="px-3 py-2 text-right font-mono font-black text-red-600">{r.shortfall > 0 ? `₹${inr(r.shortfall)}` : '—'}</td>
                  <td className="px-3 py-2">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1 w-fit ${r.compliant ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                      {r.compliant ? <><CheckCircle size={10}/> OK</> : <><XCircle size={10}/> Below</>}
                    </span>
                  </td>
                </tr>
              ))}
              {!rows.length && <tr><td colSpan={10} className="px-3 py-10 text-center text-gray-400">No employees found</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Contract Labour (CLRA) Register ───────────────────────────────────────────
function CLRARegister() {
  const { data: res, isLoading, refetch } = useQuery({
    queryKey: ['clra'],
    queryFn: () => hrComplianceAPI.clraRegister().then(r => r.data),
  });
  const contractors = res?.contractors || [];
  const allWorkers  = res?.data || [];
  const [expanded, setExpanded] = useState({});

  return (
    <div className="space-y-4">
      <div className="bg-indigo-50 border border-indigo-200 rounded-xl px-4 py-3 text-xs text-indigo-800">
        <strong>Contract Labour (Regulation & Abolition) Act 1970:</strong> Every principal employer must maintain Form-XIII (Register of Contractors), Form-XIV (Employment Card), Form-XV (Service Certificate), Form-XVI (Muster Roll for Contract Labour). Mandatory if using 20+ contract workers.
      </div>
      <div className="flex items-center justify-between">
        <div className="flex gap-3">
          <StatCard label="Total Contract Workers" value={allWorkers.length}/>
          <StatCard label="Contractors" value={contractors.length}/>
        </div>
        <div className="flex gap-2">
          <button onClick={refetch} className="p-2 rounded-xl hover:bg-gray-100"><RefreshCw size={15} className="text-gray-500"/></button>
          <ExportBtn color="indigo" data={allWorkers} filename="CLRA_Register_Form_XIII"/>
        </div>
      </div>
      {isLoading ? <LoadingTable/> : (
        <div className="space-y-3">
          {contractors.map(c => (
            <div key={c.contractor_name} className="border border-indigo-100 rounded-2xl overflow-hidden" style={{boxShadow:'0 1px 6px rgba(10,31,92,0.05)'}}>
              <button
                onClick={() => setExpanded(p => ({...p, [c.contractor_name]: !p[c.contractor_name]}))}
                className="w-full flex items-center justify-between px-5 py-3 bg-indigo-50 hover:bg-indigo-100 transition-colors">
                <div className="flex items-center gap-3">
                  <Building2 size={16} className="text-indigo-600"/>
                  <span className="font-black text-indigo-900 text-sm">{c.contractor_name}</span>
                  <span className="px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded-full text-xs font-bold">{c.worker_count} workers</span>
                </div>
                <ChevronDown size={16} className={`text-indigo-500 transition-transform ${expanded[c.contractor_name] ? 'rotate-180' : ''}`}/>
              </button>
              {expanded[c.contractor_name] && (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead><tr className="bg-indigo-700/10 border-b border-indigo-100">
                      {['#','Worker Code','Name','Trade','BOCW No.','Aadhaar','Daily Rate','Project','Join Date'].map(h => (
                        <th key={h} className="px-3 py-2 text-left font-bold text-[11px] text-indigo-700 whitespace-nowrap">{h}</th>
                      ))}
                    </tr></thead>
                    <tbody className="divide-y divide-gray-50">
                      {c.workers.map((w,i) => (
                        <tr key={w.id} className="hover:bg-indigo-50/20">
                          <td className="px-3 py-2 text-gray-400">{i+1}</td>
                          <td className="px-3 py-2 font-mono text-gray-700">{w.worker_code}</td>
                          <td className="px-3 py-2 font-semibold text-gray-900">{w.name}</td>
                          <td className="px-3 py-2 capitalize text-gray-600">{(w.skill_type||'').replace(/_/g,' ')}</td>
                          <td className="px-3 py-2 font-mono text-indigo-700">{w.bocw_number || '—'}</td>
                          <td className="px-3 py-2 font-mono text-gray-500">{w.aadhaar_last4 ? `XXXX-${w.aadhaar_last4}` : '—'}</td>
                          <td className="px-3 py-2 text-right font-mono">₹{inr(w.daily_rate)}</td>
                          <td className="px-3 py-2 text-gray-600">{w.project_name}</td>
                          <td className="px-3 py-2">{w.joined_date ? new Date(w.joined_date).toLocaleDateString('en-IN') : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ))}
          {!contractors.length && <div className="text-center py-10 text-gray-400 text-sm">No contract workers found in the system</div>}
        </div>
      )}
    </div>
  );
}

// ── Challan Filing Tracker ─────────────────────────────────────────────────────
const CHALLAN_TYPES = ['PF ECR','ESI','PT','TDS','LWF','Bonus','BOCW Cess','Other'];

function ChallanTracker() {
  const qc = useQueryClient();
  const [year, setYear]   = useState(CURRENT_YEAR);
  const [modal, setModal] = useState(null);
  const [form,  setForm]  = useState({ challan_type:'PF ECR', period_month: CURRENT_MONTH, period_year: CURRENT_YEAR, amount:'', filed_on:'', reference_number:'', mode:'online', bank:'', notes:'' });

  const { data: res, isLoading, refetch } = useQuery({
    queryKey: ['challan-filings', year],
    queryFn: () => hrComplianceAPI.challanFilings({ year }).then(r => r.data),
  });
  const rows = res?.data || [];

  const saveMut = useMutation({
    mutationFn: d => modal?.id ? hrComplianceAPI.updateChallan(modal.id, d) : hrComplianceAPI.createChallan(d),
    onSuccess: () => { qc.invalidateQueries(['challan-filings']); setModal(null); toast.success('Saved'); },
    onError: e => toast.error(e.response?.data?.error || 'Failed'),
  });
  const delMut = useMutation({
    mutationFn: id => hrComplianceAPI.deleteChallan(id),
    onSuccess: () => { qc.invalidateQueries(['challan-filings']); toast.success('Deleted'); },
  });

  const openAdd  = () => { setForm({ challan_type:'PF ECR', period_month: CURRENT_MONTH, period_year: year, amount:'', filed_on: new Date().toISOString().slice(0,10), reference_number:'', mode:'online', bank:'', notes:'' }); setModal({}); };
  const openEdit = (r) => { setForm({...r, filed_on: r.filed_on?.slice(0,10)||''}); setModal(r); };

  const totalFiled = rows.reduce((s,r) => s + parseFloat(r.amount||0), 0);

  return (
    <div className="space-y-4">
      <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-xs text-blue-800">
        Track every challan filing — PF ECR, ESI, Professional Tax, TDS, BOCW Cess, LWF, Bonus. Record the reference number, bank, and payment date so you have a complete compliance audit trail.
      </div>
      <div className="flex flex-wrap gap-3 items-center justify-between">
        <div className="flex gap-3 items-center">
          <select value={year} onChange={e => setYear(+e.target.value)} className="px-3 py-2 text-sm border border-gray-200 rounded-xl bg-white focus:outline-none">
            {[2023,2024,2025,2026,2027].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <div className="flex gap-2">
          <button onClick={refetch} className="p-2 rounded-xl hover:bg-gray-100"><RefreshCw size={15} className="text-gray-500"/></button>
          <button onClick={openAdd} className="flex items-center gap-2 px-4 py-2 text-sm font-bold rounded-xl bg-blue-600 text-white hover:bg-blue-700">
            <Plus size={14}/> Mark Filed
          </button>
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <StatCard label="Filings This Year" value={rows.length}/>
        <StatCard label="Total Amount Paid" value={`₹${inr(totalFiled)}`}/>
        <StatCard label="Types Covered" value={[...new Set(rows.map(r=>r.challan_type))].length} sub="of 7 types"/>
      </div>

      {isLoading ? <LoadingTable/> : (
        <div className="overflow-x-auto rounded-2xl border border-gray-100" style={{boxShadow:'0 2px 10px rgba(10,31,92,0.06)'}}>
          <table className="w-full text-xs">
            <thead><tr className="bg-blue-700 text-white">
              {['#','Type','Period','Amount','Filed On','Reference No.','Mode','Bank','Filed By','Actions'].map(h => (
                <th key={h} className="px-3 py-3 text-left font-bold text-[11px] whitespace-nowrap">{h}</th>
              ))}
            </tr></thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((r,i) => (
                <tr key={r.id} className="hover:bg-blue-50/30">
                  <td className="px-3 py-2 text-gray-400">{i+1}</td>
                  <td className="px-3 py-2">
                    <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full text-[10px] font-black">{r.challan_type}</span>
                  </td>
                  <td className="px-3 py-2 font-medium text-gray-800">
                    {r.period_month ? `${MONTHS[r.period_month-1].slice(0,3)} ` : ''}{r.period_year}
                  </td>
                  <td className="px-3 py-2 text-right font-mono font-bold text-blue-700">₹{inr(r.amount)}</td>
                  <td className="px-3 py-2 text-gray-700">{r.filed_on ? new Date(r.filed_on).toLocaleDateString('en-IN') : '—'}</td>
                  <td className="px-3 py-2 font-mono text-gray-600">{r.reference_number || '—'}</td>
                  <td className="px-3 py-2 capitalize text-gray-500">{r.mode||'—'}</td>
                  <td className="px-3 py-2 text-gray-500">{r.bank||'—'}</td>
                  <td className="px-3 py-2 text-gray-500">{r.filed_by||'—'}</td>
                  <td className="px-3 py-2 flex gap-1">
                    <button onClick={() => openEdit(r)} className="p-1.5 rounded-lg hover:bg-blue-100 text-blue-600"><Edit2 size={12}/></button>
                    <button onClick={() => delMut.mutate(r.id)} className="p-1.5 rounded-lg hover:bg-red-100 text-red-500"><Trash2 size={12}/></button>
                  </td>
                </tr>
              ))}
              {!rows.length && <tr><td colSpan={10} className="px-3 py-10 text-center text-gray-400">No challan filings recorded. Click "Mark Filed" after each payment.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {modal !== null && (
        <div className="fixed inset-0 z-[80] bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h3 className="font-black text-gray-900">{modal?.id ? 'Edit Filing' : 'Mark Challan Filed'}</h3>
              <button onClick={() => setModal(null)} className="p-1.5 rounded-lg hover:bg-gray-100"><X size={16}/></button>
            </div>
            <div className="px-6 py-5 grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="block text-xs font-semibold text-gray-600 mb-1">Challan Type *</label>
                <select value={form.challan_type} onChange={e => setForm(f=>({...f, challan_type:e.target.value}))}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20">
                  {CHALLAN_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Period Month</label>
                <select value={form.period_month||''} onChange={e => setForm(f=>({...f, period_month:+e.target.value}))}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none">
                  {MONTHS.map((m,i) => <option key={m} value={i+1}>{m}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Period Year *</label>
                <input type="number" value={form.period_year} onChange={e => setForm(f=>({...f, period_year:+e.target.value}))}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none"/>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Amount Paid (₹)</label>
                <input type="number" value={form.amount} onChange={e => setForm(f=>({...f, amount:e.target.value}))}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none"/>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Filed On</label>
                <input type="date" value={form.filed_on} onChange={e => setForm(f=>({...f, filed_on:e.target.value}))}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none"/>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Reference / Challan No.</label>
                <input value={form.reference_number||''} onChange={e => setForm(f=>({...f, reference_number:e.target.value}))}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none"/>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Payment Mode</label>
                <select value={form.mode||'online'} onChange={e => setForm(f=>({...f, mode:e.target.value}))}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none">
                  {['online','NEFT','RTGS','Cheque','Cash','Portal'].map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Bank</label>
                <input value={form.bank||''} onChange={e => setForm(f=>({...f, bank:e.target.value}))} placeholder="e.g. SBI, HDFC"
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none"/>
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-semibold text-gray-600 mb-1">Notes</label>
                <textarea value={form.notes||''} onChange={e => setForm(f=>({...f, notes:e.target.value}))} rows={2}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none resize-none"/>
              </div>
            </div>
            <div className="flex gap-3 justify-end px-6 pb-5">
              <button onClick={() => setModal(null)} className="px-4 py-2 text-sm font-semibold rounded-xl text-gray-600 hover:bg-gray-100">Cancel</button>
              <button onClick={() => saveMut.mutate(form)} disabled={saveMut.isPending}
                className="px-5 py-2 text-sm font-bold rounded-xl bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60">
                {saveMut.isPending ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── PF ECR File Generator ─────────────────────────────────────────────────────
function ECRGenerator() {
  const [month, setMonth] = useState(CURRENT_MONTH);
  const [year,  setYear]  = useState(CURRENT_YEAR);
  const [loading, setLoading] = useState(false);

  const downloadECR = async () => {
    setLoading(true);
    try {
      const res = await hrComplianceAPI.ecrFile({ month, year });
      const blob = new Blob([res.data], { type: 'text/plain' });
      const url  = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ECR_${String(month).padStart(2,'0')}_${year}.txt`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('ECR file downloaded');
    } catch (e) {
      toast.error('Failed to generate ECR file');
    } finally { setLoading(false); }
  };

  return (
    <div className="space-y-6">
      <div className="bg-violet-50 border border-violet-200 rounded-xl px-4 py-3 text-xs text-violet-800">
        <strong>EPFO ECR v2 Format:</strong> The Electronic Challan-cum-Return (.txt) file is uploaded to the EPFO Unified Portal each month to file PF returns.
        Generated from your PF Register data. Upload at <strong>unifiedportal-emp.epfindia.gov.in</strong> → Payments → ECR Upload.
      </div>

      <div className="bg-white border border-gray-200 rounded-2xl p-8 flex flex-col items-center gap-6 text-center" style={{boxShadow:'0 2px 12px rgba(10,31,92,0.06)'}}>
        <div className="w-16 h-16 rounded-2xl bg-violet-100 flex items-center justify-center">
          <FileText className="w-8 h-8 text-violet-600"/>
        </div>
        <div>
          <h3 className="text-lg font-black text-gray-900">Generate PF ECR File</h3>
          <p className="text-gray-500 text-sm mt-1">Creates the .txt file in EPFO ECR v2 format with UAN, wages, and contribution details</p>
        </div>
        <div className="flex items-center gap-3">
          <select value={month} onChange={e => setMonth(+e.target.value)}
            className="px-4 py-2.5 text-sm border border-gray-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-violet-500/20">
            {MONTHS.map((m,i) => <option key={m} value={i+1}>{m}</option>)}
          </select>
          <select value={year} onChange={e => setYear(+e.target.value)}
            className="px-4 py-2.5 text-sm border border-gray-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-violet-500/20">
            {[2023,2024,2025,2026,2027].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <button onClick={downloadECR} disabled={loading}
          className="flex items-center gap-3 px-8 py-3 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white font-black rounded-2xl text-sm shadow-lg shadow-violet-600/25 transition-all">
          {loading ? <RefreshCw className="w-5 h-5 animate-spin"/> : <Download className="w-5 h-5"/>}
          Download ECR_{String(month).padStart(2,'0')}_{year}.txt
        </button>
        <div className="text-xs text-gray-400 space-y-1">
          <p>Format: <code className="bg-gray-100 px-1 rounded">UAN#~#Name#~#Gross#~#PF Wage#~#EPS Wage#~#EE Share#~#ER Share#~#NCP Days#~#Refund</code></p>
          <p>After download: Upload at EPFO portal → Payments → Upload ECR → Generate Challan → Pay</p>
        </div>
      </div>
    </div>
  );
}

// ── Overview Dashboard ────────────────────────────────────────────────────────
// Last 6 (month,year) pairs ending at the current month, oldest first.
function last6Months() {
  const out = [];
  let m = CURRENT_MONTH, y = CURRENT_YEAR;
  for (let i = 0; i < 6; i++) {
    out.unshift({ month: m, year: y });
    m -= 1;
    if (m === 0) { m = 12; y -= 1; }
  }
  return out;
}

function KpiCard({ icon: Icon, iconBg, iconColor, accentFrom, accentTo, label, value, trend, badge, spark, sparkColor, bars }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-4 relative overflow-hidden transition-all hover:shadow-lg hover:-translate-y-0.5"
      style={{ boxShadow: '0 1px 6px rgba(10,31,92,0.06)' }}>
      <div className="absolute top-0 left-0 right-0 h-[3px]" style={{ background: `linear-gradient(90deg,${accentFrom},${accentTo})` }}/>
      <div className="flex items-start justify-between">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: iconBg }}>
          <Icon className="w-[18px] h-[18px]" style={{ color: iconColor }}/>
        </div>
        {trend != null && (
          <span className={`flex items-center gap-0.5 text-[11px] font-bold px-1.5 py-0.5 rounded-full ${trend >= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
            {trend >= 0 ? <ArrowUpRight size={12}/> : <ArrowDownRight size={12}/>}{Math.abs(trend)}%
          </span>
        )}
        {badge && <span className="text-[11px] font-bold px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700">{badge}</span>}
      </div>
      <div className="text-[11px] font-bold text-gray-400 uppercase tracking-wide mt-3">{label}</div>
      <div className="text-2xl font-black text-gray-900 mt-0.5">{value}</div>
      {spark && (
        <svg viewBox="0 0 100 28" className="w-full mt-2" style={{ height: 28 }} preserveAspectRatio="none">
          <polyline points={spark} fill="none" stroke={sparkColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      )}
      {bars && (
        <div className="flex gap-[3px] mt-3" style={{ height: 6 }}>
          {bars.map((b,i) => <div key={i} className="rounded-sm" style={{ flex: b.v, background: b.c }}/>)}
        </div>
      )}
    </div>
  );
}

function ComplianceOverview({ depts, onNavigate }) {
  const months = useMemo(last6Months, []);

  const { data: pfRes } = useQuery({
    queryKey: ['compliance-pf', CURRENT_MONTH, CURRENT_YEAR, ''],
    queryFn:  () => hrComplianceAPI.pfRegister({ month: CURRENT_MONTH, year: CURRENT_YEAR }).then(r => r.data),
  });
  const { data: esiRes } = useQuery({
    queryKey: ['compliance-esi', CURRENT_MONTH, CURRENT_YEAR],
    queryFn:  () => hrComplianceAPI.esiRegister({ month: CURRENT_MONTH, year: CURRENT_YEAR }).then(r => r.data),
  });
  const { data: empRes } = useQuery({
    queryKey: ['compliance-employment', 'active'],
    queryFn:  () => hrComplianceAPI.employmentRegister({ status: 'active' }).then(r => r.data),
  });
  const { data: licRes } = useQuery({
    queryKey: ['compliance-licenses'],
    queryFn:  () => hrComplianceAPI.labourLicenses().then(r => r.data),
  });
  const { data: calRes } = useQuery({
    queryKey: ['compliance-calendar', CURRENT_MONTH, CURRENT_YEAR],
    queryFn:  () => hrComplianceAPI.complianceCalendar({ month: CURRENT_MONTH, year: CURRENT_YEAR }).then(r => r.data),
  });
  const { data: trend, isLoading: trendLoading } = useQuery({
    queryKey: ['compliance-overview-trend', months.map(m => `${m.month}-${m.year}`).join(',')],
    queryFn:  async () => {
      const results = await Promise.all(months.map(async ({ month, year }) => {
        const [pf, esi] = await Promise.all([
          hrComplianceAPI.pfRegister({ month, year }).then(r => r.data),
          hrComplianceAPI.esiRegister({ month, year }).then(r => r.data),
        ]);
        return {
          month, year,
          pf:  Number(pf?.totals?.total_monthly || 0),
          esi: Number(esi?.totals?.total_esi || 0),
        };
      }));
      return results;
    },
    staleTime: 5 * 60 * 1000,
  });

  const activeEmployees = empRes?.data?.length || 0;
  const pfTotal   = Number(pfRes?.totals?.total_monthly || 0);
  const esiTotal  = Number(esiRes?.totals?.total_esi || 0);
  const licences  = licRes?.data || [];
  const expired   = licences.filter(l => l.is_expired).length;
  const expiring  = licences.filter(l => l.expiring_soon && !l.is_expired).length;
  const activeLic = licences.length - expired - expiring;
  const tasks     = calRes?.data || [];
  const overdue   = tasks.filter(t => t.overdue);
  const dueSoon   = tasks.filter(t => t.due_soon && !t.overdue);
  const upcoming  = [...overdue, ...dueSoon, ...tasks.filter(t => !t.overdue && !t.due_soon)].slice(0, 4);
  const attention = licences.filter(l => l.is_expired || l.expiring_soon)
    .sort((a,b) => (a.days_remaining ?? 0) - (b.days_remaining ?? 0)).slice(0, 5);

  const fmtInr = (n) => `₹${Number(n||0).toLocaleString('en-IN')}`;
  const compactInr = (n) => {
    const v = Number(n||0);
    return v >= 100000 ? `₹${(v/100000).toFixed(2)}L` : fmtInr(v);
  };

  // Bar chart geometry
  const chartW = 380, chartH = 160, groupW = 62, barW = 10, plotBottom = 150, plotTop = 30;
  const maxVal = trend ? Math.max(1, ...trend.flatMap(t => [t.pf, t.esi])) : 1;
  const barH = (v) => Math.round((v / maxVal) * (plotBottom - plotTop));

  // Donut geometry (circumference for r=46 stroke-width=16)
  const total = licences.length || 1;
  const circ = 2 * Math.PI * 46;
  const activeLen  = (activeLic / total) * circ;
  const expiringLen = (expiring / total) * circ;
  const expiredLen  = (expired / total) * circ;

  return (
    <div className="space-y-4">

      {(expired > 0 || overdue.length > 0) && (
        <div className="bg-white rounded-2xl border border-red-200 p-3.5 flex items-center gap-3" style={{ boxShadow: '0 1px 6px rgba(10,31,92,0.06)' }}>
          <div className="w-9 h-9 rounded-xl bg-red-50 flex items-center justify-center flex-shrink-0">
            <AlertTriangle className="w-[17px] h-[17px] text-red-700"/>
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-bold text-red-900">
              {expired > 0 && `${expired} licence${expired>1?'s':''} expired`}
              {expired > 0 && overdue.length > 0 && ', '}
              {overdue.length > 0 && `${overdue.length} filing${overdue.length>1?'s':''} overdue`}
            </div>
            <div className="text-xs text-gray-400 truncate">
              {attention[0] ? `${attention[0].license_name || attention[0].license_type} needs renewal` : ''}
              {overdue[0] ? `${attention[0] ? ' · ' : ''}${overdue[0].task} is overdue` : ''}
            </div>
          </div>
          <button onClick={() => onNavigate('licenses')}
            className="px-3.5 py-1.5 bg-red-50 text-red-700 rounded-lg text-xs font-bold hover:bg-red-100 whitespace-nowrap">Review</button>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
        <KpiCard icon={Users} iconBg="#EEF0FE" iconColor="#4F46E5" accentFrom="#4F46E5" accentTo="#818CF8"
          label="Active Employees" value={activeEmployees} trend={4}
          spark="0,20 15,18 30,19 45,14 60,15 75,9 90,10 100,4" sparkColor="#818CF8"/>
        <KpiCard icon={ShieldCheck} iconBg="#ECFEFF" iconColor="#0891B2" accentFrom="#0891B2" accentTo="#67E8F9"
          label="PF This Month" value={compactInr(pfTotal)} trend={2}
          spark="0,16 15,17 30,12 45,14 60,10 75,11 90,7 100,8" sparkColor="#67E8F9"/>
        <KpiCard icon={Fingerprint} iconBg="#ECFDF5" iconColor="#059669" accentFrom="#059669" accentTo="#6EE7B7"
          label="ESI This Month" value={compactInr(esiTotal)} trend={-1}
          spark="0,8 15,10 30,9 45,13 60,12 75,15 90,14 100,17" sparkColor="#6EE7B7"/>
        <KpiCard icon={BadgeCheck} iconBg="#FFFBEB" iconColor="#D97706" accentFrom="#D97706" accentTo="#FCD34D"
          label="Licences Tracked" value={licences.length}
          badge={expired + expiring > 0 ? `${expired + expiring} due` : null}
          bars={[{v:Math.max(activeLic,0.2),c:'#059669'},{v:Math.max(expiring,0.2),c:'#D97706'},{v:Math.max(expired,0.2),c:'#DC2626'}]}/>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-3.5">

        <div className="bg-white rounded-2xl border border-gray-100 p-4" style={{ boxShadow: '0 1px 6px rgba(10,31,92,0.06)' }}>
          <div className="flex items-center justify-between mb-3.5">
            <div>
              <div className="text-sm font-bold text-gray-900">Statutory Contributions</div>
              <div className="text-[11px] text-gray-400">Last 6 months · PF vs ESI</div>
            </div>
            <div className="flex gap-3">
              <span className="flex items-center gap-1.5 text-[11px] text-gray-500"><span className="w-2 h-2 rounded-sm bg-indigo-600 inline-block"/>PF</span>
              <span className="flex items-center gap-1.5 text-[11px] text-gray-500"><span className="w-2 h-2 rounded-sm bg-cyan-600 inline-block"/>ESI</span>
            </div>
          </div>
          {trendLoading ? <LoadingTable/> : (
            <svg viewBox={`0 0 ${chartW} ${chartH}`} className="w-full" style={{ height: chartH }}>
              {[0,40,80,120].map(y => <line key={y} x1="0" y1={y} x2={chartW} y2={y} stroke="#F1F5F9" strokeWidth="1"/>)}
              <line x1="0" y1={plotBottom} x2={chartW} y2={plotBottom} stroke="#E2E8F0" strokeWidth="1"/>
              {(trend||[]).map((t,i) => {
                const gx = 10 + i * groupW;
                const pfH = barH(t.pf), esiH = barH(t.esi);
                return (
                  <g key={i}>
                    <rect x={gx}    y={plotBottom - pfH}  width={barW} height={pfH}  rx="2" fill="#4F46E5"/>
                    <rect x={gx+14} y={plotBottom - esiH} width={barW} height={esiH} rx="2" fill="#0891B2"/>
                    <text x={gx+12} y={chartH - 3} fontSize="9" fill="#94A3B8" textAnchor="middle">{MONTHS[t.month-1].slice(0,3)}</text>
                  </g>
                );
              })}
            </svg>
          )}
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 p-4" style={{ boxShadow: '0 1px 6px rgba(10,31,92,0.06)' }}>
          <div className="text-sm font-bold text-gray-900">Licence Status</div>
          <div className="text-[11px] text-gray-400 mb-1.5">{licences.length} licences tracked</div>
          <div className="flex items-center gap-4">
            <svg viewBox="0 0 120 120" style={{ width: 110, height: 110, flexShrink: 0 }}>
              <circle cx="60" cy="60" r="46" fill="none" stroke="#F1F5F9" strokeWidth="16"/>
              {activeLic > 0 && <circle cx="60" cy="60" r="46" fill="none" stroke="#059669" strokeWidth="16"
                strokeDasharray={`${activeLen} ${circ}`} strokeDashoffset="0" transform="rotate(-90 60 60)" strokeLinecap="round"/>}
              {expiring > 0 && <circle cx="60" cy="60" r="46" fill="none" stroke="#D97706" strokeWidth="16"
                strokeDasharray={`${expiringLen} ${circ}`} strokeDashoffset={-activeLen} transform="rotate(-90 60 60)"/>}
              {expired > 0 && <circle cx="60" cy="60" r="46" fill="none" stroke="#DC2626" strokeWidth="16"
                strokeDasharray={`${expiredLen} ${circ}`} strokeDashoffset={-(activeLen+expiringLen)} transform="rotate(-90 60 60)"/>}
              <text x="60" y="56" fontSize="22" fontWeight="700" fill="#0F172A" textAnchor="middle">{licences.length}</text>
              <text x="60" y="72" fontSize="9" fill="#94A3B8" textAnchor="middle">total</text>
            </svg>
            <div className="flex flex-col gap-2 flex-1">
              {[['Active','#059669',activeLic],['Expiring Soon','#D97706',expiring],['Expired','#DC2626',expired]].map(([l,c,v]) => (
                <div key={l} className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-xs text-gray-700"><span className="w-2 h-2 rounded-full inline-block" style={{background:c}}/>{l}</span>
                  <span className="text-xs font-black text-gray-900">{v}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5">

        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden" style={{ boxShadow: '0 1px 6px rgba(10,31,92,0.06)' }}>
          <div className="px-4 py-3 border-b border-gray-50 flex items-center justify-between">
            <div className="text-sm font-bold text-gray-900">Upcoming Filing Dates</div>
            <button onClick={() => onNavigate('calendar')} className="text-xs font-bold text-indigo-600 hover:text-indigo-700 flex items-center gap-1">View all <ArrowRight size={12}/></button>
          </div>
          <div className="py-1">
            {upcoming.length === 0 && <div className="text-center py-8 text-xs text-gray-400">No filing tasks this month</div>}
            {upcoming.map(t => (
              <div key={t.id} className="flex items-center gap-3 px-4 py-2.5">
                <div className={`w-9 h-9 rounded-xl flex flex-col items-center justify-center flex-shrink-0 ${t.overdue ? 'bg-red-50' : t.due_soon ? 'bg-amber-50' : 'bg-gray-50'}`}>
                  <div className={`text-[9px] font-bold leading-none ${t.overdue ? 'text-red-700' : t.due_soon ? 'text-amber-700' : 'text-gray-500'}`}>{MONTHS[CURRENT_MONTH-1].slice(0,3).toUpperCase()}</div>
                  <div className={`text-[13px] font-bold leading-tight ${t.overdue ? 'text-red-700' : t.due_soon ? 'text-amber-700' : 'text-gray-500'}`}>{t.due_day}</div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-bold text-gray-900 truncate">{t.task}</div>
                  <div className="text-[11px] text-gray-400 truncate">{t.category} · {t.description}</div>
                </div>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${t.overdue ? 'bg-red-50 text-red-700' : t.due_soon ? 'bg-amber-50 text-amber-700' : 'bg-gray-50 text-gray-500'}`}>
                  {t.overdue ? `${Math.abs(t.days_remaining)}d overdue` : `${t.days_remaining}d`}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden" style={{ boxShadow: '0 1px 6px rgba(10,31,92,0.06)' }}>
          <div className="px-4 py-3 border-b border-gray-50 flex items-center justify-between">
            <div className="text-sm font-bold text-gray-900">Licences Needing Action</div>
            <button onClick={() => onNavigate('licenses')} className="text-xs font-bold text-indigo-600 hover:text-indigo-700 flex items-center gap-1">View all <ArrowRight size={12}/></button>
          </div>
          <table className="w-full text-xs">
            <tbody>
              {attention.length === 0 && (
                <tr><td className="text-center py-8 text-gray-400" colSpan={3}>All licences are valid</td></tr>
              )}
              {attention.map(l => (
                <tr key={l.id} className="border-b border-gray-50 last:border-0">
                  <td className="px-4 py-2.5 font-bold text-gray-900 whitespace-nowrap">{l.license_name || LICENSE_TYPES.find(x=>x.value===l.license_type)?.label}</td>
                  <td className="px-4 py-2.5 text-gray-400 truncate">{l.issuing_authority || '—'}</td>
                  <td className="px-4 py-2.5 text-right whitespace-nowrap">
                    {l.is_expired
                      ? <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-50 text-red-700">Expired {Math.abs(l.days_remaining)}d ago</span>
                      : <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700">Expires in {l.days_remaining}d</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────
function NavItem({ active, onClick, icon: Icon, label, badge }) {
  return (
    <button onClick={onClick}
      className={`w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-xl text-[13px] font-semibold transition-colors mb-0.5 ${
        active ? 'bg-indigo-50 text-indigo-700' : 'text-gray-600 hover:bg-gray-50'
      }`}>
      <span className="flex items-center gap-2 truncate">
        <Icon size={15} className={active ? 'text-indigo-600' : 'text-gray-400'}/>
        <span className="truncate">{label}</span>
      </span>
      {!!badge && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-red-50 text-red-700 flex-shrink-0">{badge}</span>}
    </button>
  );
}

export default function HRCompliancePage({ embedded = false }) {
  const [activeTab, setActiveTab] = useState('overview');

  const { data: deptsRes } = useQuery({
    queryKey: ['compliance-depts'],
    queryFn:  () => hrComplianceAPI.departments().then(r => r.data?.data ?? []),
  });
  const depts = deptsRes || [];

  const { data: licRes } = useQuery({
    queryKey: ['compliance-licenses'],
    queryFn:  () => hrComplianceAPI.labourLicenses().then(r => r.data),
    staleTime: 60 * 1000,
  });
  const licenceAlerts = (licRes?.data || []).filter(l => l.is_expired || l.expiring_soon).length;

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
            <p className="text-white/55 text-sm mt-1">Statutory registers, licences and filing calendar in one place</p>
          </div>
        </motion.div>
      )}

      {/* Sidebar + Content */}
      <motion.div {...fade(0.06)} className="px-7 py-6 flex gap-4 items-start">

        <div className="w-56 flex-shrink-0 bg-white rounded-2xl border border-gray-100 p-2.5 sticky top-4"
          style={{ boxShadow: '0 1px 6px rgba(10,31,92,0.06)' }}>
          <div className="px-2.5 pt-1.5 pb-1 text-[10px] font-bold text-gray-400 uppercase tracking-wide">Overview</div>
          <NavItem active={activeTab === 'overview'} onClick={() => setActiveTab('overview')}
            icon={LayoutDashboard} label="Dashboard" badge={licenceAlerts > 0 ? licenceAlerts : null}/>

          {TAB_GROUPS.map(g => (
            <div key={g.label}>
              <div className="px-2.5 pt-3.5 pb-1 text-[10px] font-bold text-gray-400 uppercase tracking-wide">{g.label}</div>
              {g.keys.map(k => {
                const t = TABS.find(x => x.key === k);
                if (!t) return null;
                return (
                  <NavItem key={k} active={activeTab === k} onClick={() => setActiveTab(k)}
                    icon={t.icon} label={t.label}
                    badge={k === 'licenses' && licenceAlerts > 0 ? licenceAlerts : null}/>
                );
              })}
            </div>
          ))}
        </div>

        <div className="flex-1 min-w-0">
          {activeTab === 'overview'   && <ComplianceOverview depts={depts} onNavigate={setActiveTab}/>}
          {activeTab === 'pf'         && <PFRegister depts={depts}/>}
          {activeTab === 'esi'        && <ESIRegister depts={depts}/>}
          {activeTab === 'pt'         && <PTRegister/>}
          {activeTab === 'wage'       && <WageRegister depts={depts}/>}
          {activeTab === 'muster'     && <MusterRoll depts={depts}/>}
          {activeTab === 'employment' && <EmploymentRegister/>}
          {activeTab === 'it'         && <IncomeTaxRegister/>}
          {activeTab === 'licenses'   && <LabourLicenses/>}
          {activeTab === 'docexpiry'  && <DocumentExpiry/>}
          {activeTab === 'calendar'   && <ComplianceCalendar/>}
          {activeTab === 'bocw'       && <BOCWRegister/>}
          {activeTab === 'gratuity'   && <GratuityRegister depts={depts}/>}
          {activeTab === 'bonus'      && <BonusRegister depts={depts}/>}
          {activeTab === 'lwf'        && <LWFRegister/>}
          {activeTab === 'minwages'   && <MinWagesCheck depts={depts}/>}
          {activeTab === 'clra'       && <CLRARegister/>}
          {activeTab === 'challan'    && <ChallanTracker/>}
          {activeTab === 'ecr'        && <ECRGenerator/>}
        </div>
      </motion.div>
    </div>
  );
}
