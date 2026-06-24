// src/pages/hr-admin/EmployeeDetailPage.jsx — 2026 Premium UI
import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, User, Calendar, CreditCard, TrendingUp, FileText, Briefcase,
  Phone, Mail, MapPin, Shield, Building2, Edit2, Upload, Trash2, Download, Plus, Clock,
  FileSignature, Printer, ClipboardCheck, CheckCircle2, Circle, Ban, X, Send
} from 'lucide-react';
import { hrEmployeesAPI, hrLeaveAPI, hrPayrollAPI, hrLoansAPI, hrAppraisalsAPI, mailAPI } from '../../api/client';
import toast from 'react-hot-toast';

const B = { navy:'#0A1F5C', blue:'#2563EB', yellow:'#F4C430', success:'#10B981' };
const fade = (d=0) => ({ initial:{opacity:0,y:14}, animate:{opacity:1,y:0}, transition:{duration:0.35,delay:d,ease:[0.16,1,0.3,1]} });

const TABS = [
  { id:'profile',    label:'Profile',        icon:User          },
  { id:'leaves',     label:'Leaves',         icon:Calendar      },
  { id:'payroll',    label:'Payroll',         icon:CreditCard    },
  { id:'loans',      label:'Loans',           icon:Briefcase     },
  { id:'appraisals', label:'Appraisals',      icon:TrendingUp    },
  { id:'documents',  label:'Documents',       icon:FileText      },
  { id:'letters',    label:'Letters & Forms', icon:FileSignature },
  { id:'lifecycle',  label:'Lifecycle',       icon:ClipboardCheck},
  { id:'timeline',   label:'Timeline',        icon:Clock         },
];

const DOC_TYPES = ['offer_letter','joining_letter','id_proof','address_proof','degree','pf_form','esic_form','other'];

const LETTER_TEMPLATES = [
  { id:'offer_letter',       title:'Offer Letter',           category:'Joining'    },
  { id:'appointment_letter', title:'Appointment Letter',     category:'Joining'    },
  { id:'id_card',            title:'Employee ID Card',       category:'Identity'   },
  { id:'salary_revision',    title:'Salary Revision Letter', category:'Payroll'    },
  { id:'warning_memo',       title:'Warning / Memo Letter',  category:'Discipline' },
  { id:'asset_handover',     title:'Asset Handover Form',    category:'Admin'      },
  { id:'resignation_exit',   title:'Exit / Resignation Record', category:'Exit'   },
  { id:'relieving_letter',   title:'Relieving Letter',       category:'Exit'       },
  { id:'experience_letter',  title:'Experience Letter',      category:'Exit'       },
];

const todayISO = () => new Date().toISOString().slice(0,10);
const fmtDate  = (d) => d ? new Date(d).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'}) : '-';
const fmtMoney = (v) => { const n=Number(v||0); if(!n) return '-'; return `Rs ${n.toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2})}`; };

// ─── Info Row ────────────────────────────────────────────────────────────────
function InfoRow({ label, value }) {
  if (!value) return null;
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-gray-500 font-bold uppercase tracking-wide">{label}</span>
      <span className="text-gray-800 text-sm font-medium">{value}</span>
    </div>
  );
}

// ─── Section Card ────────────────────────────────────────────────────────────
function Section({ title, children }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5 mb-4"
      style={{boxShadow:'0 2px 8px rgba(10,31,92,0.05)'}}>
      <h3 className="text-xs font-black text-gray-500 uppercase tracking-wide mb-4">{title}</h3>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-3">{children}</div>
    </div>
  );
}

// ─── Status pill helper ──────────────────────────────────────────────────────
const STATUS_PILL_CFG = {
  pending:   { bg:'bg-amber-50',  text:'text-amber-700',  dot:'bg-amber-400'  },
  approved:  { bg:'bg-blue-50',   text:'text-blue-700',   dot:'bg-blue-500'   },
  rejected:  { bg:'bg-red-50',    text:'text-red-700',    dot:'bg-red-500'    },
  cancelled: { bg:'bg-gray-100',  text:'text-gray-500',   dot:'bg-gray-400'   },
  draft:     { bg:'bg-gray-100',  text:'text-gray-600',   dot:'bg-gray-400'   },
  paid:      { bg:'bg-emerald-50',text:'text-emerald-700',dot:'bg-emerald-500' },
  closed:    { bg:'bg-gray-100',  text:'text-gray-500',   dot:'bg-gray-400'   },
};
function StatusPill({ status }) {
  const cfg = STATUS_PILL_CFG[status]||STATUS_PILL_CFG.draft;
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full ${cfg.bg} ${cfg.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`}/>{status}
    </span>
  );
}

// ─── Profile Tab ─────────────────────────────────────────────────────────────
function ProfileTab({ emp, refetch }) {
  const navigate = useNavigate();
  return (
    <div>
      <div className="flex justify-end mb-4">
        <button onClick={()=>navigate(`/hr-admin/employees/${emp.id}/edit`)}
          className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-sm font-bold transition-colors">
          <Edit2 className="w-4 h-4"/> Edit Profile
        </button>
      </div>
      <Section title="Personal Information">
        <InfoRow label="Date of Birth"   value={emp.date_of_birth ? new Date(emp.date_of_birth).toLocaleDateString('en-IN') : null}/>
        <InfoRow label="Gender"          value={emp.gender}/>
        <InfoRow label="Father's Name"   value={emp.father_name}/>
        <InfoRow label="Mother's Name"   value={emp.mother_name}/>
        <InfoRow label="Marital Status"  value={emp.marital_status}/>
        <InfoRow label="Blood Group"     value={emp.blood_group}/>
        <InfoRow label="Nationality"     value={emp.nationality}/>
      </Section>
      <Section title="Employment Details">
        <InfoRow label="Employee Code"      value={emp.employee_code}/>
        <InfoRow label="Department"         value={emp.department_name}/>
        <InfoRow label="Designation"        value={emp.designation_name}/>
        <InfoRow label="Grade"              value={emp.grade}/>
        <InfoRow label="Employment Type"    value={emp.employment_type}/>
        <InfoRow label="Reporting Manager"  value={emp.reporting_manager_name}/>
        <InfoRow label="Work Location"      value={emp.work_location}/>
        <InfoRow label="Date of Joining"    value={emp.date_of_joining ? new Date(emp.date_of_joining).toLocaleDateString('en-IN') : null}/>
        <InfoRow label="Notice Period"      value={emp.notice_period_days ? `${emp.notice_period_days} days` : null}/>
        <InfoRow label="Email"              value={emp.email}/>
        <InfoRow label="Phone"              value={emp.phone}/>
      </Section>
      <Section title="Statutory / Compliance">
        <InfoRow label="PAN Number"     value={emp.pan_number}/>
        <InfoRow label="Aadhaar Number" value={emp.aadhaar_number}/>
        <InfoRow label="UAN (PF)"       value={emp.uan_number}/>
        <InfoRow label="PF Account No." value={emp.pf_account_number}/>
        <InfoRow label="ESI Number"     value={emp.esi_number}/>
      </Section>
      <Section title="Bank Details">
        <InfoRow label="Bank Name"       value={emp.bank_name}/>
        <InfoRow label="Account Number"  value={emp.bank_account_number}/>
        <InfoRow label="IFSC Code"       value={emp.bank_ifsc}/>
      </Section>
      <Section title="Address">
        <div className="col-span-2"><InfoRow label="Permanent Address"  value={emp.permanent_address}/></div>
        <div className="col-span-2"><InfoRow label="Current Address"    value={emp.current_address}/></div>
        <InfoRow label="Emergency Contact" value={emp.emergency_contact_name}/>
        <InfoRow label="Emergency Phone"   value={emp.emergency_contact_phone}/>
      </Section>
    </div>
  );
}

// ─── Timeline Tab ─────────────────────────────────────────────────────────────
function TimelineTab({ emp }) {
  const timeline = emp.timeline || [];
  const COLOR = { joining:'bg-emerald-500', profile_update:'bg-blue-500', status_change:'bg-amber-500', document:'bg-violet-500' };
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5" style={{boxShadow:'0 2px 8px rgba(10,31,92,0.05)'}}>
      <h3 className="text-xs font-black text-gray-500 uppercase tracking-wide mb-4">Employee Service Timeline</h3>
      <div className="space-y-4">
        {timeline.map(item=>(
          <div key={item.id} className="flex gap-3">
            <div className="flex flex-col items-center">
              <span className={`w-3 h-3 rounded-full mt-1 flex-shrink-0 ${COLOR[item.event_type]||'bg-gray-400'}`}/>
              <span className="w-px flex-1 bg-gray-200 mt-2"/>
            </div>
            <div className="pb-4">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-gray-900 font-bold">{item.title}</p>
                <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 capitalize">{item.event_type?.replace(/_/g,' ')}</span>
              </div>
              <p className="text-xs text-gray-400 mt-1">
                {item.event_date ? new Date(item.event_date).toLocaleDateString('en-IN') : '-'}
                {item.created_by_name ? ` by ${item.created_by_name}` : ''}
              </p>
              {item.description && <p className="text-sm text-gray-600 mt-2">{item.description}</p>}
            </div>
          </div>
        ))}
        {timeline.length===0 && (
          <div className="text-center py-10 text-gray-400">
            <Clock className="w-8 h-8 mx-auto mb-2 opacity-30"/>
            No timeline entries yet
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Letter Body ──────────────────────────────────────────────────────────────
function LetterBody({ emp, selectedTemplate, form }) {
  const name          = emp.name||'Employee';
  const designation   = emp.designation_name||emp.designation||'Employee';
  const department    = emp.department_name||emp.department||'-';
  const employeeCode  = emp.employee_code||'-';
  const joiningDate   = fmtDate(emp.date_of_joining||form.effective_date);
  const effectiveDate = fmtDate(form.effective_date);
  const refNo         = form.reference_no||`BCIM/HR/${employeeCode}/${new Date().getFullYear()}`;
  const company       = 'BCIM ENGINEERING PVT LTD';

  if (selectedTemplate==='id_card') {
    return (
      <div className="mx-auto w-[340px] rounded-xl border-2 border-[#173a73] overflow-hidden bg-white text-slate-900 shadow-sm">
        <div className="bg-[#173a73] text-white px-4 py-3 flex items-center justify-between">
          <div>
            <div className="font-black text-sm tracking-wide">{company}</div>
            <div className="text-[10px] font-semibold opacity-80">EMPLOYEE IDENTITY CARD</div>
          </div>
          <div className="w-10 h-10 rounded-full bg-white text-[#173a73] flex items-center justify-center font-black text-xs">BCIM</div>
        </div>
        <div className="p-5 text-center">
          <div className="mx-auto w-20 h-20 rounded-full bg-slate-100 border border-slate-300 flex items-center justify-center text-2xl font-black text-[#173a73] mb-3">
            {name.split(' ').map(n=>n[0]).join('').slice(0,2).toUpperCase()}
          </div>
          <div className="text-lg font-black">{name}</div>
          <div className="text-xs font-bold text-slate-500 uppercase">{designation}</div>
          <div className="mt-4 grid grid-cols-2 gap-2 text-left text-xs">
            <div className="font-bold text-slate-500">EMP ID</div><div className="font-bold">{employeeCode}</div>
            <div className="font-bold text-slate-500">DEPT</div><div className="font-bold">{department}</div>
            <div className="font-bold text-slate-500">DOJ</div><div className="font-bold">{joiningDate}</div>
            <div className="font-bold text-slate-500">PHONE</div><div className="font-bold">{emp.phone||'-'}</div>
          </div>
        </div>
        <div className="bg-slate-100 px-4 py-2 text-[10px] font-semibold text-center text-slate-600">
          This card is property of BCIM Engineering Pvt Ltd
        </div>
      </div>
    );
  }
  if (selectedTemplate==='asset_handover') {
    const assets = (form.asset_list||'').split('\n').filter(Boolean);
    return (
      <>
        <p>This is to confirm that the following company assets have been handed over to <strong>{name}</strong>, Employee Code <strong>{employeeCode}</strong>, for official use.</p>
        <table className="w-full border-collapse my-5 text-sm">
          <thead>
            <tr>
              {['Sl No','Asset / Item Details','Condition','Remarks'].map(h=><th key={h} className="border border-slate-400 p-2 text-left">{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {(assets.length?assets:['Laptop / Desktop','ID Card','Access Card / Other']).map((item,idx)=>(
              <tr key={idx}>
                <td className="border border-slate-400 p-2">{idx+1}</td>
                <td className="border border-slate-400 p-2">{item}</td>
                <td className="border border-slate-400 p-2">Good</td>
                <td className="border border-slate-400 p-2"></td>
              </tr>
            ))}
          </tbody>
        </table>
        <p>The employee is responsible for safe custody and proper use of the above assets.</p>
      </>
    );
  }
  if (selectedTemplate==='salary_revision') {
    return (
      <>
        <p>We are pleased to inform you that your compensation has been revised with effect from <strong>{effectiveDate}</strong>.</p>
        <table className="w-full border-collapse my-5 text-sm">
          <tbody>
            <tr><td className="border border-slate-400 p-2 font-bold">Employee Name</td><td className="border border-slate-400 p-2">{name}</td></tr>
            <tr><td className="border border-slate-400 p-2 font-bold">Employee Code</td><td className="border border-slate-400 p-2">{employeeCode}</td></tr>
            <tr><td className="border border-slate-400 p-2 font-bold">Designation</td><td className="border border-slate-400 p-2">{designation}</td></tr>
            <tr><td className="border border-slate-400 p-2 font-bold">Revised CTC / Salary</td><td className="border border-slate-400 p-2">{fmtMoney(form.salary_amount)}</td></tr>
          </tbody>
        </table>
        <p>All other terms and conditions of your employment remain unchanged.</p>
      </>
    );
  }
  if (selectedTemplate==='warning_memo') {
    return (
      <>
        <p>This memo is issued regarding the following matter:</p>
        <div className="border border-slate-400 p-3 my-4 min-h-24">{form.notes||'Details of warning / memo to be entered here.'}</div>
        <p>You are advised to take this matter seriously and ensure that such instances do not repeat.</p>
      </>
    );
  }
  if (selectedTemplate==='resignation_exit') {
    return (
      <>
        <p>This is to record the exit / resignation details of the below employee.</p>
        <table className="w-full border-collapse my-5 text-sm">
          <tbody>
            <tr><td className="border border-slate-400 p-2 font-bold">Employee</td><td className="border border-slate-400 p-2">{name}</td></tr>
            <tr><td className="border border-slate-400 p-2 font-bold">Employee Code</td><td className="border border-slate-400 p-2">{employeeCode}</td></tr>
            <tr><td className="border border-slate-400 p-2 font-bold">Department</td><td className="border border-slate-400 p-2">{department}</td></tr>
            <tr><td className="border border-slate-400 p-2 font-bold">Date of Joining</td><td className="border border-slate-400 p-2">{joiningDate}</td></tr>
            <tr><td className="border border-slate-400 p-2 font-bold">Last Working Date</td><td className="border border-slate-400 p-2">{effectiveDate}</td></tr>
            <tr><td className="border border-slate-400 p-2 font-bold">Remarks</td><td className="border border-slate-400 p-2">{form.notes||'-'}</td></tr>
          </tbody>
        </table>
      </>
    );
  }
  if (selectedTemplate==='relieving_letter') {
    return (
      <>
        <p>This is to certify that <strong>{name}</strong>, Employee Code <strong>{employeeCode}</strong>, was employed with {company} as <strong>{designation}</strong> in the <strong>{department}</strong> department.</p>
        <p>The employee has been relieved from duties at the close of business on <strong>{effectiveDate}</strong>.</p>
        <p>We wish {name} all the best for future assignments.</p>
      </>
    );
  }
  if (selectedTemplate==='experience_letter') {
    return (
      <>
        <p>This is to certify that <strong>{name}</strong>, Employee Code <strong>{employeeCode}</strong>, worked with {company} from <strong>{joiningDate}</strong> to <strong>{effectiveDate}</strong>.</p>
        <p>During this period, the employee served as <strong>{designation}</strong> in the <strong>{department}</strong> department.</p>
        <p>To the best of our knowledge, conduct and performance were satisfactory.</p>
      </>
    );
  }
  if (selectedTemplate==='appointment_letter') {
    return (
      <>
        <p>We are pleased to appoint you as <strong>{designation}</strong> in the <strong>{department}</strong> department of {company}, effective from <strong>{effectiveDate}</strong>.</p>
        <p>Your employee code will be <strong>{employeeCode}</strong>. Your place of work will be <strong>{emp.work_location||'as assigned by the company'}</strong>.</p>
        <p>You shall comply with all company policies, safety rules, confidentiality requirements, attendance discipline, and reporting procedures.</p>
        {form.salary_amount && <p>Your agreed compensation is <strong>{fmtMoney(form.salary_amount)}</strong>, subject to statutory deductions.</p>}
      </>
    );
  }
  return (
    <>
      <p>We are pleased to offer you employment with <strong>{company}</strong> for the position of <strong>{designation}</strong> in the <strong>{department}</strong> department.</p>
      <p>Your proposed date of joining is <strong>{effectiveDate}</strong>. Your reporting manager will be <strong>{emp.reporting_manager_name||'as assigned by management'}</strong>.</p>
      {form.salary_amount && <p>Your proposed compensation is <strong>{fmtMoney(form.salary_amount)}</strong>, subject to statutory deductions.</p>}
      <p>Please confirm your acceptance and submit all required joining documents before the joining date.</p>
    </>
  );
}

// ─── Letters Tab ──────────────────────────────────────────────────────────────
function LettersTab({ emp }) {
  const [selectedTemplate, setSelectedTemplate] = useState('offer_letter');
  const [form, setForm] = useState({ reference_no:'', effective_date:todayISO(), salary_amount:'', notes:'', asset_list:'' });
  const template = LETTER_TEMPLATES.find(t=>t.id===selectedTemplate)||LETTER_TEMPLATES[0];
  const update   = (k,v) => setForm(prev=>({...prev,[k]:v}));
  const inp = "w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-900 focus:outline-none focus:border-blue-400 transition-all";

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[320px_1fr] gap-5">
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          .hr-letter-print-area, .hr-letter-print-area * { visibility: visible !important; }
          .hr-letter-print-area {
            position: fixed !important; inset: 0 !important;
            width: 210mm !important; min-height: 297mm !important;
            background: white !important; color: #0f172a !important;
            padding: 18mm !important; margin: 0 !important;
            box-shadow: none !important; overflow: visible !important;
          }
          .hr-letter-no-print { display: none !important; }
        }
      `}</style>

      <div className="hr-letter-no-print space-y-4">
        <div className="bg-white rounded-2xl border border-gray-100 p-4" style={{boxShadow:'0 2px 8px rgba(10,31,92,0.05)'}}>
          <h3 className="text-xs font-black text-gray-500 uppercase tracking-wide mb-3">Templates</h3>
          <div className="space-y-1.5">
            {LETTER_TEMPLATES.map(item=>(
              <button key={item.id} onClick={()=>setSelectedTemplate(item.id)}
                className={`w-full text-left px-3 py-2.5 rounded-xl border transition-all ${
                  selectedTemplate===item.id
                    ? 'border-blue-500 bg-blue-50 text-blue-700'
                    : 'border-gray-200 text-gray-700 hover:border-gray-300 hover:bg-gray-50'
                }`}>
                <div className="font-bold text-sm">{item.title}</div>
                <div className="text-[11px] opacity-60 mt-0.5">{item.category}</div>
              </button>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-3" style={{boxShadow:'0 2px 8px rgba(10,31,92,0.05)'}}>
          <h3 className="text-xs font-black text-gray-500 uppercase tracking-wide">Letter Inputs</h3>
          <div>
            <label className="text-xs font-bold text-gray-500 block mb-1">Reference No.</label>
            <input value={form.reference_no} onChange={e=>update('reference_no',e.target.value)}
              placeholder={`BCIM/HR/${emp.employee_code||'EMP'}/${new Date().getFullYear()}`} className={inp}/>
          </div>
          <div>
            <label className="text-xs font-bold text-gray-500 block mb-1">Effective / Letter Date</label>
            <input type="date" value={form.effective_date} onChange={e=>update('effective_date',e.target.value)} className={inp}/>
          </div>
          <div>
            <label className="text-xs font-bold text-gray-500 block mb-1">Salary / CTC Amount</label>
            <input type="number" value={form.salary_amount} onChange={e=>update('salary_amount',e.target.value)} placeholder="Optional" className={inp}/>
          </div>
          <div>
            <label className="text-xs font-bold text-gray-500 block mb-1">Notes / Remarks</label>
            <textarea value={form.notes} onChange={e=>update('notes',e.target.value)}
              rows={3} placeholder="Optional text" className={inp}/>
          </div>
          <div>
            <label className="text-xs font-bold text-gray-500 block mb-1">Asset List</label>
            <textarea value={form.asset_list} onChange={e=>update('asset_list',e.target.value)}
              rows={3} placeholder="One asset per line" className={inp}/>
          </div>
          <button onClick={()=>window.print()}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-white rounded-xl text-sm font-black"
            style={{background:`linear-gradient(135deg,${B.blue},${B.navy})`}}>
            <Printer className="w-4 h-4"/> Print / Save as PDF
          </button>
        </div>
      </div>

      <div className="hr-letter-print-area bg-white text-slate-900 rounded-2xl shadow-xl border border-gray-100 p-8 min-h-[860px]">
        <div className="border-b-4 border-[#173a73] pb-4 mb-6 flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-14 h-14 rounded-lg bg-[#173a73] text-white flex items-center justify-center font-black">BCIM</div>
            <div>
              <div className="text-xl font-black tracking-wide">BCIM ENGINEERING PVT LTD</div>
              <div className="text-xs font-bold uppercase text-slate-500">HR & Administration Department</div>
            </div>
          </div>
          <div className="text-right text-xs font-semibold text-slate-600">
            <div>Ref: {form.reference_no||`BCIM/HR/${emp.employee_code||'EMP'}/${new Date().getFullYear()}`}</div>
            <div>Date: {fmtDate(form.effective_date)}</div>
          </div>
        </div>
        <div className="text-center mb-7">
          <h2 className="text-lg font-black uppercase underline decoration-[#173a73] underline-offset-4">{template.title}</h2>
        </div>
        <div className="text-sm leading-7 mb-6">
          <p>To,</p>
          <p className="font-bold">{emp.name}</p>
          <p>{emp.current_address||emp.permanent_address||emp.email||''}</p>
        </div>
        <div className="text-sm leading-7 space-y-4">
          <p>Dear {emp.name?.split(' ')[0]||'Employee'},</p>
          <LetterBody emp={emp} selectedTemplate={selectedTemplate} form={form}/>
          {form.notes && !['warning_memo','resignation_exit'].includes(selectedTemplate) && <p>{form.notes}</p>}
        </div>
        <div className="grid grid-cols-2 gap-12 mt-16 text-sm">
          <div>
            <div className="border-t border-slate-400 pt-2 font-bold">Employee Signature</div>
            <div className="text-xs text-slate-500 mt-1">Name: {emp.name}</div>
          </div>
          <div>
            <div className="border-t border-slate-400 pt-2 font-bold">For BCIM Engineering Pvt Ltd</div>
            <div className="text-xs text-slate-500 mt-1">Authorized Signatory</div>
          </div>
        </div>
        <div className="mt-10 border-t border-slate-200 pt-3 text-[10px] text-slate-400 flex justify-between">
          <span>Generated from BCIM ERP HR/Admin</span>
          <span>{emp.employee_code||'-'} | {emp.department_name||'-'}</span>
        </div>
      </div>
    </div>
  );
}

// ─── Lifecycle Tab ────────────────────────────────────────────────────────────
function LifecycleTab({ emp, refetch }) {
  const [editing, setEditing] = useState(null);
  const [remarks, setRemarks] = useState('');
  const [dueDate, setDueDate] = useState('');
  const items   = emp.lifecycle_checklist || [];
  const grouped = { onboarding: items.filter(i=>i.stage==='onboarding'), exit: items.filter(i=>i.stage==='exit') };

  const updateMut = useMutation({
    mutationFn:({ item, status, remarks:r, due_date })=>hrEmployeesAPI.updateLifecycle(emp.id, item.id, { status, remarks:r, due_date }),
    onSuccess:()=>{ toast.success('Updated'); setEditing(null); setRemarks(''); setDueDate(''); refetch(); },
    onError:e=>toast.error(e.response?.data?.error||'Update failed'),
  });

  const doneCount       = items.filter(i=>i.status==='done').length;
  const applicableCount = items.filter(i=>i.status!=='not_applicable').length;
  const progress        = applicableCount ? Math.round((doneCount/applicableCount)*100) : 0;

  const statusMeta = {
    done:           { label:'Done',           icon:CheckCircle2, bg:'bg-emerald-50', text:'text-emerald-700' },
    pending:        { label:'Pending',         icon:Circle,       bg:'bg-amber-50',   text:'text-amber-700'   },
    not_applicable: { label:'N/A',             icon:Ban,          bg:'bg-gray-100',   text:'text-gray-500'    },
  };

  const renderGroup = (title, stageItems) => (
    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden" style={{boxShadow:'0 2px 8px rgba(10,31,92,0.05)'}}>
      <div className="px-5 py-3 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
        <h3 className="text-xs font-black text-gray-700 uppercase tracking-wide">{title}</h3>
        <span className="text-xs text-gray-400">{stageItems.filter(i=>i.status==='done').length}/{stageItems.filter(i=>i.status!=='not_applicable').length} done</span>
      </div>
      <div className="divide-y divide-gray-50">
        {stageItems.map(item=>{
          const meta    = statusMeta[item.status]||statusMeta.pending;
          const Icon    = meta.icon;
          const isEditing = editing===item.id;
          return (
            <div key={item.id} className="p-4">
              <div className="flex items-start gap-3">
                <span className={`mt-0.5 px-2 py-1 rounded-full flex items-center gap-1 text-xs font-bold ${meta.bg} ${meta.text}`}>
                  <Icon className="w-3 h-3"/> {meta.label}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-gray-900 font-bold">{item.title}</p>
                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">{item.owner_department||'HR'}</span>
                    {item.due_date && <span className="text-[11px] text-gray-400">Due: {fmtDate(item.due_date)}</span>}
                  </div>
                  {item.remarks && <p className="text-sm text-gray-600 mt-1">{item.remarks}</p>}
                  {item.completed_at && <p className="text-xs text-emerald-600 mt-1">Completed {fmtDate(item.completed_at)}{item.completed_by_name ? ` by ${item.completed_by_name}` : ''}</p>}
                </div>
                <button onClick={()=>{ setEditing(item.id); setRemarks(item.remarks||''); setDueDate(item.due_date?.split('T')[0]||''); }}
                  className="px-3 py-1.5 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-bold transition-colors">Update</button>
              </div>
              {isEditing && (
                <div className="mt-3 ml-0 md:ml-28 bg-gray-50 border border-gray-200 rounded-xl p-3">
                  <div className="grid grid-cols-1 md:grid-cols-[160px_1fr] gap-2">
                    <input type="date" value={dueDate} onChange={e=>setDueDate(e.target.value)}
                      className="px-3 py-2 bg-white border border-gray-200 rounded-lg text-gray-900 text-sm focus:outline-none focus:border-blue-400"/>
                    <input value={remarks} onChange={e=>setRemarks(e.target.value)} placeholder="Remarks / clearance note"
                      className="px-3 py-2 bg-white border border-gray-200 rounded-lg text-gray-900 text-sm focus:outline-none focus:border-blue-400"/>
                  </div>
                  <div className="flex flex-wrap gap-2 mt-2">
                    <button onClick={()=>updateMut.mutate({item,status:'done',remarks,due_date:dueDate})}
                      className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold">Mark Done</button>
                    <button onClick={()=>updateMut.mutate({item,status:'pending',remarks,due_date:dueDate})}
                      className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-white text-xs font-bold">Pending</button>
                    <button onClick={()=>updateMut.mutate({item,status:'not_applicable',remarks,due_date:dueDate})}
                      className="px-3 py-1.5 rounded-lg bg-gray-400 hover:bg-gray-500 text-white text-xs font-bold">N/A</button>
                    <button onClick={()=>setEditing(null)}
                      className="px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-600 text-xs font-bold">Cancel</button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );

  return (
    <div className="space-y-5">
      <div className="bg-white rounded-2xl border border-gray-100 p-5" style={{boxShadow:'0 2px 8px rgba(10,31,92,0.05)'}}>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-gray-900 font-black">Employee Lifecycle Control</h3>
            <p className="text-sm text-gray-500 mt-0.5">Onboarding, access, asset issue, exit clearance and settlement tracking.</p>
          </div>
          <div className="text-right">
            <div className="text-2xl font-black text-blue-600">{progress}%</div>
            <div className="text-xs text-gray-400">completed</div>
          </div>
        </div>
        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
          <div className="h-full bg-blue-500 rounded-full transition-all" style={{width:`${progress}%`}}/>
        </div>
      </div>
      {renderGroup('Onboarding Checklist', grouped.onboarding)}
      {renderGroup('Exit Clearance Checklist', grouped.exit)}
    </div>
  );
}

// ─── Leaves Tab ───────────────────────────────────────────────────────────────
function LeavesTab({ empId }) {
  const year = new Date().getFullYear();
  const { data:balData } = useQuery({ queryKey:['hr-leave-balances',empId,year], queryFn:()=>hrLeaveAPI.getBalances({user_id:empId,year}).then(r=>r.data) });
  const { data:reqData } = useQuery({ queryKey:['hr-leave-requests',empId],      queryFn:()=>hrLeaveAPI.listRequests({user_id:empId}).then(r=>r.data) });
  const balances = balData?.data||[];
  const requests = reqData?.data||[];

  return (
    <div>
      <h3 className="text-xs font-black text-gray-500 uppercase tracking-wide mb-3">Leave Balances — {year}</h3>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 mb-6">
        {balances.map(b=>(
          <div key={b.id} className="bg-white rounded-2xl border border-gray-100 p-4" style={{boxShadow:'0 2px 8px rgba(10,31,92,0.05)'}}>
            <div className="flex items-center justify-between mb-2">
              <span className="font-bold text-gray-900 text-sm">{b.leave_type_name}</span>
              <span className="text-xs text-gray-400">{b.code}</span>
            </div>
            <div className="text-2xl font-black text-blue-600">{parseFloat(b.closing_balance).toFixed(1)}</div>
            <div className="text-xs text-gray-400 mt-1">Available</div>
            <div className="mt-2 flex gap-3 text-xs text-gray-500">
              <span>Taken: {parseFloat(b.taken).toFixed(1)}</span>
              <span>Accrued: {parseFloat(b.accrued).toFixed(1)}</span>
            </div>
          </div>
        ))}
      </div>

      <h3 className="text-xs font-black text-gray-500 uppercase tracking-wide mb-3">Leave History</h3>
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden" style={{boxShadow:'0 2px 8px rgba(10,31,92,0.05)'}}>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              {['Type','From','To','Days','Reason','Status'].map(h=>(
                <th key={h} className="text-left px-4 py-3 text-xs font-black text-gray-500 uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {requests.map(r=>(
              <tr key={r.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 text-gray-700 font-medium">{r.leave_type_name}</td>
                <td className="px-4 py-3 text-gray-600">{new Date(r.from_date).toLocaleDateString('en-IN')}</td>
                <td className="px-4 py-3 text-gray-600">{new Date(r.to_date).toLocaleDateString('en-IN')}</td>
                <td className="px-4 py-3 text-gray-900 font-bold">{r.days}</td>
                <td className="px-4 py-3 text-gray-500 max-w-xs truncate">{r.reason||'—'}</td>
                <td className="px-4 py-3"><StatusPill status={r.status}/></td>
              </tr>
            ))}
            {requests.length===0 && <tr><td colSpan={6} className="text-center py-10 text-gray-400">No leave history</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Payroll Tab ──────────────────────────────────────────────────────────────
function PayrollTab({ empId }) {
  const navigate = useNavigate();
  const { data } = useQuery({ queryKey:['hr-payroll-emp',empId], queryFn:()=>hrPayrollAPI.list({user_id:empId}).then(r=>r.data) });
  const records  = data?.data||[];
  const MONTHS   = ['','Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  return (
    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden" style={{boxShadow:'0 2px 8px rgba(10,31,92,0.05)'}}>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100 bg-gray-50">
            {['Period','Gross','Deductions','Net Pay','Status','Action'].map(h=>(
              <th key={h} className="text-left px-4 py-3 text-xs font-black text-gray-500 uppercase tracking-wide">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {records.map(r=>(
            <tr key={r.id} className="hover:bg-gray-50">
              <td className="px-4 py-3 text-gray-700 font-bold">{MONTHS[r.month]} {r.year}</td>
              <td className="px-4 py-3 text-gray-900 font-medium">₹{parseFloat(r.gross_earnings).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2})}</td>
              <td className="px-4 py-3 text-red-600">₹{parseFloat(r.total_deductions).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2})}</td>
              <td className="px-4 py-3 text-emerald-600 font-black">₹{parseFloat(r.net_pay).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2})}</td>
              <td className="px-4 py-3"><StatusPill status={r.status}/></td>
              <td className="px-4 py-3">
                <button onClick={()=>navigate(`/hr-admin/payroll/${r.id}/payslip`)}
                  className="flex items-center gap-1 text-xs font-bold text-blue-600 hover:text-blue-800">
                  <Download className="w-3 h-3"/> Payslip
                </button>
              </td>
            </tr>
          ))}
          {records.length===0 && <tr><td colSpan={6} className="text-center py-10 text-gray-400">No payroll records</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

// ─── Loans Tab ────────────────────────────────────────────────────────────────
function LoansTab({ empId }) {
  const { data } = useQuery({ queryKey:['hr-loans-emp',empId], queryFn:()=>hrLoansAPI.list({user_id:empId}).then(r=>r.data) });
  const loans = data?.data||[];

  return (
    <div className="space-y-3">
      {loans.map(l=>(
        <div key={l.id} className="bg-white rounded-2xl border border-gray-100 p-5"
          style={{boxShadow:'0 2px 8px rgba(10,31,92,0.05)'}}>
          <div className="flex items-center justify-between mb-3">
            <div>
              <span className="font-black text-gray-900 capitalize">{l.loan_type}</span>
              <span className="text-gray-500 text-sm ml-2">— {l.reason}</span>
            </div>
            <StatusPill status={l.status}/>
          </div>
          <div className="grid grid-cols-4 gap-4 text-sm">
            <div><div className="text-gray-400 text-xs font-bold uppercase tracking-wide mb-0.5">Amount</div><div className="text-gray-900 font-black">₹{parseFloat(l.amount).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2})}</div></div>
            <div><div className="text-gray-400 text-xs font-bold uppercase tracking-wide mb-0.5">Repaid</div><div className="text-emerald-600 font-bold">₹{parseFloat(l.repaid_amount||0).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2})}</div></div>
            <div><div className="text-gray-400 text-xs font-bold uppercase tracking-wide mb-0.5">Balance</div><div className="text-amber-600 font-bold">₹{parseFloat(l.balance_amount||l.amount).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2})}</div></div>
            <div><div className="text-gray-400 text-xs font-bold uppercase tracking-wide mb-0.5">EMI</div><div className="text-gray-700">{l.emi_amount ? `₹${parseFloat(l.emi_amount).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2})}/mo` : '—'}</div></div>
          </div>
          {l.status==='approved' && (
            <div className="mt-3">
              <div className="flex justify-between text-xs text-gray-500 mb-1">
                <span>Repayment Progress</span>
                <span className="font-bold">{l.amount>0?Math.round((l.repaid_amount/l.amount)*100):0}%</span>
              </div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full bg-emerald-500 rounded-full" style={{width:`${Math.min(100,l.amount>0?(l.repaid_amount/l.amount)*100:0)}%`}}/>
              </div>
            </div>
          )}
        </div>
      ))}
      {loans.length===0 && <div className="text-center py-10 text-gray-400 bg-white rounded-2xl border border-gray-100">No loans or advances</div>}
    </div>
  );
}

// ─── Appraisals Tab ───────────────────────────────────────────────────────────
function AppraisalsTab({ empId }) {
  const { data } = useQuery({ queryKey:['hr-appraisals-emp',empId], queryFn:()=>hrAppraisalsAPI.list({user_id:empId}).then(r=>r.data) });
  const appraisals = data?.data||[];
  const RATING_COLOR = { Excellent:'text-emerald-600', Good:'text-blue-600', Average:'text-amber-600', Poor:'text-red-600' };

  return (
    <div className="space-y-3">
      {appraisals.map(a=>(
        <div key={a.id} className="bg-white rounded-2xl border border-gray-100 p-5"
          style={{boxShadow:'0 2px 8px rgba(10,31,92,0.05)'}}>
          <div className="flex items-center justify-between mb-4">
            <div>
              <span className="font-black text-gray-900 text-lg">{a.review_period||a.appraisal_year}</span>
              <span className="text-gray-400 text-sm ml-2">{a.review_date ? new Date(a.review_date).toLocaleDateString('en-IN') : ''}</span>
            </div>
            <span className={`text-xl font-black ${RATING_COLOR[a.overall_rating]||'text-gray-500'}`}>
              {a.overall_rating||'Pending'}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div><div className="text-gray-400 text-xs font-bold uppercase tracking-wide mb-0.5">KRA Score</div><div className="text-gray-900 font-black text-lg">{a.kra_score||'—'}/100</div></div>
            <div><div className="text-gray-400 text-xs font-bold uppercase tracking-wide mb-0.5">Increment</div><div className="text-emerald-600 font-black">{a.increment_pct||0}%</div></div>
            <div><div className="text-gray-400 text-xs font-bold uppercase tracking-wide mb-0.5">New CTC</div><div className="text-gray-900">{a.new_ctc ? `₹${parseFloat(a.new_ctc).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2})}` : '—'}</div></div>
          </div>
          {a.comments && <div className="mt-3 text-gray-500 text-sm italic">"{a.comments}"</div>}
          <div className="mt-3 text-xs text-gray-400">Reviewed by: {a.reviewer_name} · Status: {a.status}</div>
        </div>
      ))}
      {appraisals.length===0 && <div className="text-center py-10 text-gray-400 bg-white rounded-2xl border border-gray-100">No appraisal records</div>}
    </div>
  );
}

// ─── Documents Tab ────────────────────────────────────────────────────────────
function DocumentsTab({ emp, refetch }) {
  const qc      = useQueryClient();
  const docs    = emp.documents||[];
  const fileRef = React.useRef();
  const [docType, setDocType] = useState('id_proof');
  const [docName, setDocName] = useState('');

  const uploadMut = useMutation({
    mutationFn:({ file, type, name })=>{
      const fd = new FormData();
      fd.append('file', file); fd.append('doc_type', type); fd.append('doc_name', name||file.name);
      return hrEmployeesAPI.uploadDocument(emp.id, fd);
    },
    onSuccess:()=>{ toast.success('Document uploaded'); refetch(); },
    onError:e=>toast.error(e.response?.data?.error||'Upload failed'),
  });
  const deleteMut = useMutation({
    mutationFn:(docId)=>hrEmployeesAPI.deleteDocument(emp.id, docId),
    onSuccess:()=>{ toast.success('Document deleted'); refetch(); },
    onError:e=>toast.error(e.response?.data?.error||'Delete failed'),
  });

  return (
    <div>
      <div className="bg-white rounded-2xl border-2 border-dashed border-gray-200 p-5 mb-4" style={{boxShadow:'0 2px 8px rgba(10,31,92,0.05)'}}>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="text-xs font-bold text-gray-500 block mb-1.5">Document Type</label>
            <select value={docType} onChange={e=>setDocType(e.target.value)}
              className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 text-sm focus:outline-none focus:border-blue-400">
              {DOC_TYPES.map(t=><option key={t} value={t}>{t.replace(/_/g,' ')}</option>)}
            </select>
          </div>
          <div className="flex-1 min-w-40">
            <label className="text-xs font-bold text-gray-500 block mb-1.5">Document Name</label>
            <input value={docName} onChange={e=>setDocName(e.target.value)} placeholder="e.g. Aadhaar Card"
              className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 text-sm focus:outline-none focus:border-blue-400"/>
          </div>
          <input ref={fileRef} type="file" className="hidden" onChange={e=>{
            if(e.target.files[0]) uploadMut.mutate({ file:e.target.files[0], type:docType, name:docName });
          }}/>
          <button onClick={()=>fileRef.current.click()} disabled={uploadMut.isPending}
            className="flex items-center gap-2 px-4 py-2 text-white rounded-xl text-sm font-bold disabled:opacity-50"
            style={{background:`linear-gradient(135deg,${B.blue},${B.navy})`}}>
            <Upload className="w-4 h-4"/> {uploadMut.isPending?'Uploading…':'Upload File'}
          </button>
        </div>
      </div>

      <div className="space-y-2">
        {docs.map(doc=>(
          <div key={doc.id} className="flex items-center justify-between bg-white rounded-2xl border border-gray-100 px-4 py-3"
            style={{boxShadow:'0 2px 8px rgba(10,31,92,0.05)'}}>
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center">
                <FileText className="w-4 h-4 text-blue-600"/>
              </div>
              <div>
                <div className="text-gray-900 text-sm font-bold">{doc.doc_name}</div>
                <div className="text-gray-400 text-xs capitalize">{doc.doc_type?.replace(/_/g,' ')} · {new Date(doc.uploaded_at).toLocaleDateString('en-IN')}</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <a href={doc.file_url} target="_blank" rel="noreferrer"
                className="p-2 text-gray-400 hover:text-blue-600 rounded-lg hover:bg-blue-50 transition-colors">
                <Download className="w-4 h-4"/>
              </a>
              <button onClick={()=>{ if(window.confirm('Delete this document?')) deleteMut.mutate(doc.id); }}
                className="p-2 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50 transition-colors">
                <Trash2 className="w-4 h-4"/>
              </button>
            </div>
          </div>
        ))}
        {docs.length===0 && <div className="text-center py-10 text-gray-400">No documents uploaded</div>}
      </div>
    </div>
  );
}

// ─── Avatar helpers ───────────────────────────────────────────────────────────
const AVATAR_COLORS = [['#6366F1','#4F46E5'],['#0EA5E9','#0284C7'],['#10B981','#059669'],['#F59E0B','#D97706'],['#EF4444','#DC2626']];
const avatarGrad = (n) => AVATAR_COLORS[(n?.charCodeAt(0)||0)%AVATAR_COLORS.length];

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function EmployeeDetailPage() {
  const { id }     = useParams();
  const navigate   = useNavigate();
  const [activeTab,setActiveTab] = useState('profile');

  const { data, isLoading, refetch } = useQuery({
    queryKey:['hr-employee-detail',id],
    queryFn:()=>hrEmployeesAPI.get(id).then(r=>r.data),
  });
  const emp = data?.data;

  const welcomeMut = useMutation({
    mutationFn: (to) => mailAPI.resendWelcome(to).then(r => r.data),
    onMutate:   () => { toast.loading('Sending welcome email…', { id:'welcome-mail' }); },
    onSuccess:  (res) => {
      if (res?.sent) toast.success(`Welcome email sent to ${emp?.email}`, { id:'welcome-mail' });
      else toast.error(res?.reason || 'Email not sent — check mail settings', { id:'welcome-mail' });
    },
    onError:    (e) => toast.error(e.response?.data?.error || 'Failed to send welcome email', { id:'welcome-mail' }),
  });

  if (isLoading) return (
    <div className="flex items-center justify-center py-24" style={{background:'#F8FAFC',minHeight:'100vh'}}>
      <div className="w-8 h-8 rounded-full border-2 border-blue-200 border-t-blue-600 animate-spin"/>
    </div>
  );
  if (!emp) return <div className="text-center py-24 text-red-500 font-bold">Employee not found</div>;

  const initials   = emp.name?.split(' ').map(n=>n[0]).join('').toUpperCase().slice(0,2)||'?';
  const [g1,g2]    = avatarGrad(emp.name);
  const isActive   = emp.employment_status==='active';

  return (
    <div className="p-6 space-y-5 min-h-screen" style={{background:'#F8FAFC'}}>

      {/* Employee Header Card */}
      <motion.div {...fade(0)} className="relative overflow-hidden rounded-2xl"
        style={{background:`linear-gradient(135deg,${B.navy},#1e3a8a)`,boxShadow:'0 8px 32px rgba(10,31,92,0.2)'}}>
        <div className="absolute top-0 right-0 w-64 h-64 rounded-full opacity-[0.07]"
          style={{background:'radial-gradient(circle,#fff,transparent 70%)',transform:'translate(25%,-25%)'}}/>
        <div className="relative z-10 px-8 py-6 flex items-start gap-5">
          <button onClick={()=>navigate('/hr-admin/employees')}
            className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center text-white hover:bg-white/20 flex-shrink-0 mt-1">
            <ArrowLeft className="w-5 h-5"/>
          </button>
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-white text-xl font-black flex-shrink-0"
            style={{background:`linear-gradient(135deg,${g1},${g2})`}}>
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-black text-white">{emp.name}</h1>
              <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${isActive?'bg-emerald-400/20 text-emerald-300':'bg-red-400/20 text-red-300'}`}>
                {emp.employment_status||'active'}
              </span>
            </div>
            <div className="flex items-center gap-3 text-white/60 text-sm mt-1 flex-wrap">
              <span className="text-white/80 font-bold">{emp.employee_code}</span>
              {emp.designation_name && <><span>·</span><span>{emp.designation_name}</span></>}
              {emp.department_name  && <><span>·</span><span className="flex items-center gap-1"><Building2 className="w-3 h-3"/>{emp.department_name}</span></>}
            </div>
            <div className="flex items-center gap-4 mt-2 flex-wrap">
              {emp.email && <span className="flex items-center gap-1 text-white/50 text-xs"><Mail className="w-3 h-3"/>{emp.email}</span>}
              {emp.phone && <span className="flex items-center gap-1 text-white/50 text-xs"><Phone className="w-3 h-3"/>{emp.phone}</span>}
            </div>
          </div>
          {/* Resend Welcome Email */}
          <button
            onClick={() => {
              if (!emp.email) { toast.error('This employee has no email address'); return; }
              welcomeMut.mutate(emp.email);
            }}
            disabled={welcomeMut.isLoading || !emp.email}
            title={emp.email ? `Send login-access welcome email to ${emp.email}` : 'No email on file'}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/15 hover:bg-white/25 border border-white/25 text-white text-sm font-bold transition-all flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed mt-1">
            <Send className="w-4 h-4"/>
            {welcomeMut.isLoading ? 'Sending…' : 'Resend Welcome'}
          </button>
        </div>
      </motion.div>

      {/* Tab Bar */}
      <motion.div {...fade(0.06)} className="bg-white rounded-2xl border border-gray-100 overflow-x-auto"
        style={{boxShadow:'0 2px 12px rgba(10,31,92,0.06)'}}>
        <div className="flex gap-1 p-1.5 min-w-max">
          {TABS.map(tab=>(
            <button key={tab.id} onClick={()=>setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold whitespace-nowrap transition-all ${
                activeTab===tab.id
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
              }`}>
              <tab.icon className="w-4 h-4"/>{tab.label}
            </button>
          ))}
        </div>
      </motion.div>

      {/* Tab Content */}
      <motion.div {...fade(0.10)}>
        {activeTab==='profile'    && <ProfileTab    emp={emp}   refetch={refetch}/>}
        {activeTab==='leaves'     && <LeavesTab     empId={id}/>}
        {activeTab==='payroll'    && <PayrollTab    empId={id}/>}
        {activeTab==='loans'      && <LoansTab      empId={id}/>}
        {activeTab==='appraisals' && <AppraisalsTab empId={id}/>}
        {activeTab==='documents'  && <DocumentsTab  emp={emp}   refetch={refetch}/>}
        {activeTab==='letters'    && <LettersTab    emp={emp}/>}
        {activeTab==='lifecycle'  && <LifecycleTab  emp={emp}   refetch={refetch}/>}
        {activeTab==='timeline'   && <TimelineTab   emp={emp}/>}
      </motion.div>
    </div>
  );
}
