// src/pages/hr-admin/EmployeeFormPage.jsx — 2026 Premium UI
import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Save, User, Briefcase, Shield, X, Check } from 'lucide-react';
import { hrEmployeesAPI, hrMastersAPI } from '../../api/client';
import toast from 'react-hot-toast';

const B = { navy:'#0A1F5C', blue:'#2563EB', yellow:'#F4C430' };
const fade = (d=0) => ({ initial:{opacity:0,y:14}, animate:{opacity:1,y:0}, transition:{duration:0.35,delay:d,ease:[0.16,1,0.3,1]} });
const inp = "w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-900 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50 transition-all";
const lbl = "block text-xs font-bold text-gray-600 uppercase tracking-wide mb-1.5";

const SECTIONS = [
  { label:'Personal', icon:User    },
  { label:'Job',      icon:Briefcase },
  { label:'Statutory',icon:Shield  },
];

function Field({ label, required, children }) {
  return (
    <div>
      <label className={lbl}>{label}{required && <span className="text-red-500 ml-0.5">*</span>}</label>
      {children}
    </div>
  );
}

// Dropdown that lets the user add a brand-new option inline instead of
// having to leave the form and visit the Masters page first.
function SelectWithAdd({ value, onChange, options, placeholder, adding, onStartAdd, onCancelAdd, newValue, onNewValueChange, onConfirmAdd, saving }) {
  if (adding) {
    return (
      <div className="flex gap-1.5">
        <input
          className={inp} autoFocus value={newValue} placeholder={placeholder}
          onChange={e=>onNewValueChange(e.target.value)}
          onKeyDown={e=>{ if(e.key==='Enter'){ e.preventDefault(); onConfirmAdd(); } if(e.key==='Escape') onCancelAdd(); }}
        />
        <button type="button" onClick={onConfirmAdd} disabled={saving || !newValue.trim()}
          className="px-2.5 rounded-xl bg-emerald-600 text-white disabled:opacity-50 hover:bg-emerald-700">
          <Check className="w-4 h-4"/>
        </button>
        <button type="button" onClick={onCancelAdd} className="px-2.5 rounded-xl bg-gray-100 text-gray-500 hover:bg-gray-200">
          <X className="w-4 h-4"/>
        </button>
      </div>
    );
  }
  return (
    <select className={inp} value={value} onChange={e=>{
      if (e.target.value === '__add_new__') onStartAdd();
      else onChange(e.target.value);
    }}>
      <option value="">{placeholder}</option>
      {options.map(o=><option key={o.id} value={o.id}>{o.name}</option>)}
      <option value="__add_new__">+ Add New…</option>
    </select>
  );
}

export default function EmployeeFormPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const isEdit = Boolean(id);
  const [step, setStep] = useState(0);

  const [form, setForm] = useState({
    name:'', email:'', phone:'', role:'viewer', employee_code:'',
    department_id:'', designation_id:'', employment_type:'permanent',
    date_of_joining:'', probation_end_date:'', notice_period_days:30,
    reporting_manager_id:'', work_location:'',
    date_of_birth:'', gender:'', father_name:'', mother_name:'',
    marital_status:'', blood_group:'', nationality:'Indian',
    permanent_address:'', current_address:'',
    emergency_contact_name:'', emergency_contact_phone:'',
    pan_number:'', aadhaar_number:'', uan_number:'', pf_account_number:'', esi_number:'',
    bank_name:'', bank_account_number:'', bank_ifsc:'',
  });

  const { data:deptData  } = useQuery({ queryKey:['hr-departments'],  queryFn:()=>hrMastersAPI.listDepts().then(r=>r.data) });
  const { data:desigData } = useQuery({ queryKey:['hr-designations',form.department_id], queryFn:()=>hrMastersAPI.listDesigs({ department_id:form.department_id||undefined }).then(r=>r.data) });
  const { data:managerData } = useQuery({ queryKey:['hr-employees-managers'], queryFn:()=>hrEmployeesAPI.list({employment_status:'active'}).then(r=>r.data) });

  const departments  = deptData?.data  || [];
  const designations = desigData?.data || [];
  const managers = (managerData?.data||[]).filter(e=>e.id!==id);

  const { data:empData } = useQuery({
    queryKey:['hr-employee-detail',id],
    queryFn:()=>hrEmployeesAPI.get(id).then(r=>r.data),
    enabled:isEdit,
  });

  useEffect(()=>{
    if(empData?.data) {
      const e = empData.data;
      setForm(prev=>({ ...prev,
        name:e.name||'', email:e.email||'', phone:e.phone||'', role:e.role||'viewer',
        employee_code:e.employee_code||'', department_id:e.department_id||'', designation_id:e.designation_id||'',
        employment_type:e.employment_type||'permanent', reporting_manager_id:e.reporting_manager_id||'',
        work_location:e.work_location||'', date_of_joining:e.date_of_joining?.split('T')[0]||'',
        probation_end_date:e.probation_end_date?.split('T')[0]||'', notice_period_days:e.notice_period_days||30,
        date_of_birth:e.date_of_birth?.split('T')[0]||'', gender:e.gender||'',
        father_name:e.father_name||'', mother_name:e.mother_name||'', marital_status:e.marital_status||'',
        blood_group:e.blood_group||'', nationality:e.nationality||'Indian',
        permanent_address:e.permanent_address||'', current_address:e.current_address||'',
        emergency_contact_name:e.emergency_contact_name||'', emergency_contact_phone:e.emergency_contact_phone||'',
        pan_number:e.pan_number||'', aadhaar_number:e.aadhaar_number||'',
        uan_number:e.uan_number||'', pf_account_number:e.pf_account_number||'',
        esi_number:e.esi_number||'', bank_name:e.bank_name||'',
        bank_account_number:e.bank_account_number||'', bank_ifsc:e.bank_ifsc||'',
      }));
    }
  },[empData]);

  const set = (k,v) => setForm(prev=>({...prev,[k]:v}));

  // Inline "+ Add New" for Department / Designation dropdowns
  const [addingDept, setAddingDept] = useState(false);
  const [newDeptName, setNewDeptName] = useState('');
  const [addingDesig, setAddingDesig] = useState(false);
  const [newDesigName, setNewDesigName] = useState('');

  const createDeptMut = useMutation({
    mutationFn:(name)=>hrMastersAPI.createDept({ name }),
    onSuccess:(res)=>{
      qc.invalidateQueries({ queryKey:['hr-departments'] });
      set('department_id', res.data?.data?.id || '');
      set('designation_id', '');
      setAddingDept(false); setNewDeptName('');
      toast.success('Department added');
    },
    onError:e=>toast.error(e.response?.data?.error||'Could not add department'),
  });
  const createDesigMut = useMutation({
    mutationFn:(name)=>hrMastersAPI.createDesig({ name, department_id: form.department_id || null }),
    onSuccess:(res)=>{
      qc.invalidateQueries({ queryKey:['hr-designations', form.department_id] });
      set('designation_id', res.data?.data?.id || '');
      setAddingDesig(false); setNewDesigName('');
      toast.success('Designation added');
    },
    onError:e=>toast.error(e.response?.data?.error||'Could not add designation'),
  });

  const saveMut = useMutation({
    mutationFn:(data)=>isEdit ? hrEmployeesAPI.update(id,data) : hrEmployeesAPI.create(data),
    onSuccess:(res)=>{
      toast.success(isEdit?'Employee updated':'Employee created');
      qc.invalidateQueries({ queryKey:['hr-employees'] });
      const empId = isEdit ? id : res.data?.data?.id;
      navigate(empId ? `/hr-admin/employees/${empId}` : '/hr-admin/employees');
    },
    onError:e=>toast.error(e.response?.data?.error||'Save failed'),
  });

  const handleSubmit = () => {
    if(!form.name||!form.email) { toast.error('Name and email are required'); setStep(0); return; }
    saveMut.mutate(form);
  };

  return (
    <div className="p-6 min-h-screen" style={{background:'#F8FAFC'}}>
      <div className="max-w-3xl mx-auto space-y-6">

        {/* Header */}
        <motion.div {...fade(0)} className="relative overflow-hidden rounded-2xl"
          style={{background:`linear-gradient(135deg,${B.navy},#1e3a8a)`,boxShadow:'0 8px 32px rgba(10,31,92,0.2)'}}>
          <div className="absolute top-0 right-0 w-48 h-48 rounded-full opacity-[0.07]"
            style={{background:'radial-gradient(circle,#fff,transparent 70%)',transform:'translate(25%,-25%)'}}/>
          <div className="relative z-10 px-8 py-5 flex items-center gap-4">
            <button onClick={()=>navigate(-1)}
              className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center text-white hover:bg-white/20">
              <ArrowLeft className="w-5 h-5"/>
            </button>
            <div className="w-9 h-9 rounded-xl bg-white/15 flex items-center justify-center">
              <User className="w-5 h-5 text-white"/>
            </div>
            <div>
              <h1 className="text-xl font-black text-white">{isEdit?'Edit Employee':'Add New Employee'}</h1>
              <p className="text-white/55 text-xs mt-0.5">BCIM Engineering Pvt. Ltd.</p>
            </div>
          </div>
        </motion.div>

        {/* Step Indicators */}
        <motion.div {...fade(0.06)} className="flex gap-2">
          {SECTIONS.map((s,i)=>(
            <button key={s.label} onClick={()=>setStep(i)}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-sm font-bold border transition-all ${
                step===i
                  ? 'border-blue-500 bg-blue-600 text-white shadow-sm'
                  : step>i
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                  : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300'
              }`}>
              <s.icon className="w-4 h-4"/>
              {i+1}. {s.label}
            </button>
          ))}
        </motion.div>

        {/* Step 0: Personal */}
        {step===0 && (
          <motion.div {...fade(0.10)} className="bg-white rounded-2xl border border-gray-100 p-6 space-y-5"
            style={{boxShadow:'0 2px 12px rgba(10,31,92,0.06)'}}>
            <h2 className="font-black text-gray-900">Personal Information</h2>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Full Name" required><input className={inp} value={form.name} onChange={e=>set('name',e.target.value)} placeholder="Full name"/></Field>
              <Field label="Employee Code"><input className={inp} value={form.employee_code} onChange={e=>set('employee_code',e.target.value)} placeholder="Auto-generated if empty"/></Field>
              <Field label="Email Address" required><input className={inp} type="email" value={form.email} onChange={e=>set('email',e.target.value)} placeholder="employee@company.com"/></Field>
              <Field label="Phone"><input className={inp} value={form.phone} onChange={e=>set('phone',e.target.value)} placeholder="Mobile number"/></Field>
              <Field label="Date of Birth"><input className={inp} type="date" value={form.date_of_birth} onChange={e=>set('date_of_birth',e.target.value)}/></Field>
              <Field label="Gender">
                <select className={inp} value={form.gender} onChange={e=>set('gender',e.target.value)}>
                  <option value="">Select</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="other">Other</option>
                </select>
              </Field>
              <Field label="Father's Name"><input className={inp} value={form.father_name} onChange={e=>set('father_name',e.target.value)}/></Field>
              <Field label="Mother's Name"><input className={inp} value={form.mother_name} onChange={e=>set('mother_name',e.target.value)}/></Field>
              <Field label="Marital Status">
                <select className={inp} value={form.marital_status} onChange={e=>set('marital_status',e.target.value)}>
                  <option value="">Select</option>
                  <option value="single">Single</option>
                  <option value="married">Married</option>
                </select>
              </Field>
              <Field label="Blood Group"><input className={inp} value={form.blood_group} onChange={e=>set('blood_group',e.target.value)} placeholder="e.g. O+"/></Field>
              <div className="col-span-2"><Field label="Permanent Address"><textarea className={inp} rows={2} value={form.permanent_address} onChange={e=>set('permanent_address',e.target.value)}/></Field></div>
              <div className="col-span-2"><Field label="Current Address"><textarea className={inp} rows={2} value={form.current_address} onChange={e=>set('current_address',e.target.value)}/></Field></div>
              <Field label="Emergency Contact Name"><input className={inp} value={form.emergency_contact_name} onChange={e=>set('emergency_contact_name',e.target.value)}/></Field>
              <Field label="Emergency Contact Phone"><input className={inp} value={form.emergency_contact_phone} onChange={e=>set('emergency_contact_phone',e.target.value)}/></Field>
            </div>
          </motion.div>
        )}

        {/* Step 1: Job Details */}
        {step===1 && (
          <motion.div {...fade(0.10)} className="bg-white rounded-2xl border border-gray-100 p-6 space-y-5"
            style={{boxShadow:'0 2px 12px rgba(10,31,92,0.06)'}}>
            <h2 className="font-black text-gray-900">Job Details</h2>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Department">
                <SelectWithAdd
                  value={form.department_id} options={departments} placeholder="Select Department"
                  onChange={v=>{ set('department_id',v); set('designation_id',''); }}
                  adding={addingDept} onStartAdd={()=>setAddingDept(true)}
                  onCancelAdd={()=>{ setAddingDept(false); setNewDeptName(''); }}
                  newValue={newDeptName} onNewValueChange={setNewDeptName}
                  onConfirmAdd={()=>createDeptMut.mutate(newDeptName.trim())}
                  saving={createDeptMut.isPending}
                />
              </Field>
              <Field label="Designation">
                <SelectWithAdd
                  value={form.designation_id} options={designations} placeholder="Select Designation"
                  onChange={v=>set('designation_id',v)}
                  adding={addingDesig} onStartAdd={()=>setAddingDesig(true)}
                  onCancelAdd={()=>{ setAddingDesig(false); setNewDesigName(''); }}
                  newValue={newDesigName} onNewValueChange={setNewDesigName}
                  onConfirmAdd={()=>createDesigMut.mutate(newDesigName.trim())}
                  saving={createDesigMut.isPending}
                />
              </Field>
              <Field label="Employment Type">
                <select className={inp} value={form.employment_type} onChange={e=>set('employment_type',e.target.value)}>
                  <option value="permanent">Permanent</option>
                  <option value="probation">Probation</option>
                  <option value="contract">Contract</option>
                  <option value="intern">Intern</option>
                </select>
              </Field>
              <Field label="Reporting Manager">
                <select className={inp} value={form.reporting_manager_id} onChange={e=>set('reporting_manager_id',e.target.value)}>
                  <option value="">Select Manager</option>
                  {managers.map(m=><option key={m.id} value={m.id}>{m.name} - {m.designation_name||'Employee'}</option>)}
                </select>
              </Field>
              <Field label="Work Location / Site"><input className={inp} value={form.work_location} onChange={e=>set('work_location',e.target.value)} placeholder="e.g. HO, Lancho LH10"/></Field>
              <Field label="System Role">
                <select className={inp} value={form.role} onChange={e=>set('role',e.target.value)}>
                  <option value="viewer">Viewer</option>
                  <option value="employee">Employee</option>
                  <option value="manager">Manager</option>
                  <option value="accounts">Accounts</option>
                  <option value="admin">Admin</option>
                </select>
              </Field>
              <Field label="Date of Joining"><input className={inp} type="date" value={form.date_of_joining} onChange={e=>set('date_of_joining',e.target.value)}/></Field>
              <Field label="Probation End Date"><input className={inp} type="date" value={form.probation_end_date} onChange={e=>set('probation_end_date',e.target.value)}/></Field>
              <Field label="Notice Period (Days)"><input className={inp} type="number" value={form.notice_period_days} onChange={e=>set('notice_period_days',e.target.value)}/></Field>
            </div>
          </motion.div>
        )}

        {/* Step 2: Bank & Statutory */}
        {step===2 && (
          <motion.div {...fade(0.10)} className="bg-white rounded-2xl border border-gray-100 p-6 space-y-5"
            style={{boxShadow:'0 2px 12px rgba(10,31,92,0.06)'}}>
            <h2 className="font-black text-gray-900">Bank Details</h2>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Bank Name"><input className={inp} value={form.bank_name} onChange={e=>set('bank_name',e.target.value)}/></Field>
              <Field label="IFSC Code"><input className={inp} value={form.bank_ifsc} onChange={e=>set('bank_ifsc',e.target.value)}/></Field>
              <div className="col-span-2"><Field label="Account Number"><input className={inp} value={form.bank_account_number} onChange={e=>set('bank_account_number',e.target.value)}/></Field></div>
            </div>
            <div className="border-t border-gray-100 pt-5">
              <h2 className="font-black text-gray-900 mb-4">Statutory Details</h2>
              <div className="grid grid-cols-2 gap-4">
                <Field label="PAN Number"><input className={inp} value={form.pan_number} onChange={e=>set('pan_number',e.target.value.toUpperCase())} maxLength={10} placeholder="ABCDE1234F"/></Field>
                <Field label="Aadhaar Number"><input className={inp} value={form.aadhaar_number} onChange={e=>set('aadhaar_number',e.target.value)} maxLength={12} placeholder="12 digit"/></Field>
                <Field label="UAN Number (PF)"><input className={inp} value={form.uan_number} onChange={e=>set('uan_number',e.target.value)} placeholder="Universal Account Number"/></Field>
                <Field label="PF Account Number"><input className={inp} value={form.pf_account_number} onChange={e=>set('pf_account_number',e.target.value)}/></Field>
                <Field label="ESI Number"><input className={inp} value={form.esi_number} onChange={e=>set('esi_number',e.target.value)}/></Field>
              </div>
            </div>
          </motion.div>
        )}

        {/* Navigation */}
        <motion.div {...fade(0.14)} className="flex justify-between">
          <button onClick={()=>setStep(s=>Math.max(0,s-1))} disabled={step===0}
            className="px-5 py-2.5 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 rounded-xl text-sm font-bold disabled:opacity-30 transition-colors">
            ← Previous
          </button>
          <div className="flex gap-3">
            {step<SECTIONS.length-1 ? (
              <button onClick={()=>setStep(s=>s+1)}
                className="px-6 py-2.5 text-white rounded-xl text-sm font-black transition-colors"
                style={{background:`linear-gradient(135deg,${B.blue},${B.navy})`}}>
                Next →
              </button>
            ) : (
              <button onClick={handleSubmit} disabled={saveMut.isPending}
                className="flex items-center gap-2 px-6 py-2.5 text-white rounded-xl text-sm font-black disabled:opacity-50"
                style={{background:`linear-gradient(135deg,${B.success},#059669)`}}>
                <Save className="w-4 h-4"/>
                {saveMut.isPending?'Saving…':(isEdit?'Update Employee':'Add Employee')}
              </button>
            )}
          </div>
        </motion.div>
      </div>
    </div>
  );
}
