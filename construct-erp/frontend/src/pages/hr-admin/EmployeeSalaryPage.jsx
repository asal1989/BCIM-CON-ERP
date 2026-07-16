// src/pages/hr-admin/EmployeeSalaryPage.jsx — 2026 Premium UI
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Calculator, CheckCircle2, ChevronLeft, ChevronRight, ChevronDown, Download, Edit2,
  Eye, IndianRupee, MoreVertical, Plus, RotateCcw, Search, TrendingUp, Upload, Users, Utensils, Wallet, X,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { hrEmployeesAPI, hrSalaryAPI } from '../../api/client';

const B = { navy:'#0A1F5C', blue:'#2563EB', yellow:'#F4C430' };
const fade = (d=0) => ({ initial:{opacity:0,y:14}, animate:{opacity:1,y:0}, transition:{duration:0.35,delay:d,ease:[0.16,1,0.3,1]} });
const inp = "w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-900 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50 transition-all";
const lbl = "text-xs font-bold text-gray-600 uppercase tracking-wide block mb-1.5";

const fmt = (n) => Number(n||0).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2});
const today = () => new Date().toISOString().slice(0,10);

function SalaryModal({ employees, structures, onClose, onSave, saving, calculateBreakup, calculating, editSalary }) {
  const isEdit = !!editSalary;
  const [form, setForm] = useState(() => isEdit ? {
    user_id: editSalary.user_id,
    structure_id: editSalary.structure_id || structures[0]?.id || '',
    ctc_monthly: editSalary.ctc_annual ? String(Math.round(Number(editSalary.ctc_annual) / 12)) : '',
    mess_deduction: editSalary.mess_deduction || '',
    basic_reversal: editSalary.basic_reversal || '',
    pf_applicable: editSalary.pf_applicable ?? true,
    esi_applicable: editSalary.esi_applicable ?? false,
    pt_applicable: editSalary.pt_applicable ?? true,
    effective_from: (editSalary.effective_from || today()).slice(0, 10),
  } : {
    user_id:'', structure_id:structures[0]?.id||'',
    ctc_monthly:'', mess_deduction:'', basic_reversal:'', pf_applicable:true, esi_applicable:false, pt_applicable:true,
    effective_from:today(),
  });
  const [breakup, setBreakup] = useState(null);
  const update = (k,v) => setForm(p=>({...p,[k]:v}));

  const messDeduction = Number(form.mess_deduction||0);
  const basicReversal = Number(form.basic_reversal||0);
  const netPayAfterMess = breakup ? breakup.net_pay_monthly - messDeduction + basicReversal : 0;

  const runCalculate = async () => {
    if (!form.ctc_monthly || Number(form.ctc_monthly) <= 0) return toast.error('Enter a monthly CTC to calculate');
    try {
      const res = await calculateBreakup({ ctc_monthly: Number(form.ctc_monthly) });
      setBreakup(res.data?.data || null);
    } catch (e) {
      toast.error(e.response?.data?.error || 'Failed to calculate breakup');
    }
  };

  // When editing, auto-calculate the breakup on open so the form is ready to save.
  useEffect(() => {
    if (isEdit && form.ctc_monthly && Number(form.ctc_monthly) > 0) runCalculate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = () => {
    if(!form.user_id) return toast.error('Select employee');
    if(!form.effective_from) return toast.error('Effective date is required');
    if(!breakup) return toast.error('Calculate the CTC breakup first');
    onSave({
      id: isEdit ? editSalary.id : undefined,
      user_id:form.user_id, structure_id:form.structure_id||null,
      ctc_annual:breakup.ctc_annual, basic:breakup.basic, hra:breakup.hra,
      special_allowance:breakup.special_allowance, other_allowance:0,
      gross_monthly:breakup.gross_monthly, pf_applicable:form.pf_applicable,
      esi_applicable:form.esi_applicable, pt_applicable:form.pt_applicable,
      effective_from:form.effective_from,
      vda:breakup.vda, lta:breakup.lta,
      education_allowance:breakup.education_allowance, washing_allowance:breakup.washing_allowance,
      mobile_allowance:breakup.mobile_allowance, project_allowance:breakup.project_allowance,
      accommodation_allowance:breakup.accommodation_allowance, food_allowance:breakup.food_allowance,
      transport_allowance:breakup.transport_allowance,
      employer_pf:breakup.employer_pf, employee_pf:breakup.employee_pf,
      gratuity:breakup.gratuity, pt_deduction:breakup.pt_deduction,
      incentive:breakup.incentive, edli:breakup.edli, epf_admin:breakup.epf_admin,
      mess_deduction:messDeduction, basic_reversal:basicReversal, net_pay_monthly:netPayAfterMess,
    });
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
      <motion.div initial={{opacity:0,scale:0.97}} animate={{opacity:1,scale:1}} transition={{duration:0.2}}
        className="w-full max-w-4xl bg-white rounded-2xl shadow-2xl overflow-hidden border border-gray-100">

        {/* Modal Header */}
        <div className="relative px-6 py-5 flex items-center justify-between"
          style={{background:`linear-gradient(135deg,#0A1F5C,#1e3a8a)`}}>
          <div className="absolute top-0 right-0 w-48 h-48 rounded-full opacity-[0.07]"
            style={{background:'radial-gradient(circle,#fff,transparent 70%)',transform:'translate(25%,-25%)'}}/>
          <div className="relative z-10">
            <h2 className="text-lg font-black text-white">{isEdit ? 'Edit Employee Salary' : 'Assign Employee Salary'}</h2>
            <p className="text-white/55 text-sm mt-0.5">{isEdit
              ? 'Updates this salary record in place — no new/duplicate rows are created.'
              : 'Use approved monthly salary. Existing active salary closes automatically.'}</p>
          </div>
          <button onClick={onClose} className="relative z-10 w-8 h-8 rounded-lg bg-white/15 hover:bg-white/25 flex items-center justify-center transition-colors">
            <X className="w-4 h-4 text-white"/>
          </button>
        </div>

        <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[65vh] overflow-y-auto">
          <div>
            <label className={lbl}>Employee</label>
            <select value={form.user_id} onChange={e=>update('user_id',e.target.value)} className={inp}
              disabled={isEdit} style={isEdit ? {opacity:0.7, cursor:'not-allowed'} : undefined}>
              <option value="">Select employee…</option>
              {employees.map(e=><option key={e.id} value={e.id}>{e.name} — {e.employee_code||e.email}</option>)}
            </select>
          </div>
          <div>
            <label className={lbl}>Salary Structure</label>
            <select value={form.structure_id} onChange={e=>update('structure_id',e.target.value)} className={inp}>
              <option value="">No structure</option>
              {structures.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label className={lbl}>Monthly CTC</label>
            <div className="flex gap-2">
              <input type="number" value={form.ctc_monthly} onChange={e=>{update('ctc_monthly',e.target.value); setBreakup(null);}}
                className={inp} placeholder="e.g. 45000"/>
              <button onClick={runCalculate} type="button" disabled={calculating}
                className="px-4 py-2.5 rounded-xl text-sm font-black text-white whitespace-nowrap disabled:opacity-50"
                style={{background:`linear-gradient(135deg,${B.blue},${B.navy})`}}>
                {calculating?'Calculating…':'Calculate Breakup'}
              </button>
            </div>
          </div>
          <div>
            <label className={lbl}>Effective From</label>
            <input type="date" value={form.effective_from} onChange={e=>update('effective_from',e.target.value)} className={inp}/>
          </div>

          {breakup && (
            <div className="md:col-span-2 rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-4 py-2 bg-gray-100 text-xs font-black text-gray-600 uppercase tracking-wide">Part A — Earnings (Monthly)</div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-px bg-gray-100">
                {[
                  ['Basic', breakup.basic], ['HRA', breakup.hra],
                  ['Project/Office Spl. Allow.', breakup.project_allowance],
                  ['Accommodation Allowance', breakup.accommodation_allowance],
                  ['Food Allowance', breakup.food_allowance],
                  ['Transport Allowance', breakup.transport_allowance],
                  ['LTA', breakup.lta], ['Medical Allowance', breakup.medical_allowance],
                  ['Mobile Allowance', breakup.mobile_allowance],
                  ['Incentive', breakup.incentive],
                  ['Washing Allowance', breakup.washing_allowance],
                  ['Special Allowance', breakup.special_allowance],
                ].map(([l,v])=>(
                  <div key={l} className="bg-white px-3 py-2">
                    <div className="text-[10px] font-bold text-gray-400 uppercase">{l}</div>
                    <div className="text-sm font-black text-gray-900">₹{fmt(v)}</div>
                  </div>
                ))}
                <div className="bg-white px-3 py-2">
                  <div className="text-[10px] font-bold text-gray-400 uppercase">Basic Reversal</div>
                  <input type="number" value={form.basic_reversal} onChange={e=>update('basic_reversal',e.target.value)}
                    className="w-full text-sm font-black text-gray-900 border border-gray-200 rounded-lg px-2 py-1 mt-0.5 focus:outline-none focus:border-blue-400"
                    placeholder="0"/>
                </div>
              </div>
              <div className="px-4 py-2 bg-gray-100 text-xs font-black text-gray-600 uppercase tracking-wide">Part B — Employer Contribution</div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-px bg-gray-100">
                {[['Employer PF (12%)', breakup.employer_pf], ['EDLI', breakup.edli], ['EPF Admin', breakup.epf_admin], ['Gratuity', breakup.gratuity]].map(([l,v])=>(
                  <div key={l} className="bg-white px-3 py-2">
                    <div className="text-[10px] font-bold text-gray-400 uppercase">{l}</div>
                    <div className="text-sm font-black text-gray-900">₹{fmt(v)}</div>
                  </div>
                ))}
              </div>
              <div className="px-4 py-2 bg-gray-100 text-xs font-black text-gray-600 uppercase tracking-wide">Part C — Deductions</div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-px bg-gray-100">
                {[['Employee PF', breakup.employee_pf], ['PT Deduction', breakup.pt_deduction]].map(([l,v])=>(
                  <div key={l} className="bg-white px-3 py-2">
                    <div className="text-[10px] font-bold text-gray-400 uppercase">{l}</div>
                    <div className="text-sm font-black text-gray-900">₹{fmt(v)}</div>
                  </div>
                ))}
                <div className="bg-white px-3 py-2">
                  <div className="text-[10px] font-bold text-gray-400 uppercase">Mess Deduction</div>
                  <input type="number" value={form.mess_deduction} onChange={e=>update('mess_deduction',e.target.value)}
                    className="w-full text-sm font-black text-gray-900 border border-gray-200 rounded-lg px-2 py-1 mt-0.5 focus:outline-none focus:border-blue-400"
                    placeholder="0"/>
                </div>
              </div>
            </div>
          )}

          <div className="md:col-span-2 grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[['pf_applicable','PF Applicable'],['esi_applicable','ESI Applicable'],['pt_applicable','PT Applicable']].map(([k,l])=>(
              <label key={k} className="flex items-center gap-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-bold text-gray-800 cursor-pointer hover:bg-blue-50 transition-colors">
                <input type="checkbox" checked={form[k]} onChange={e=>update(k,e.target.checked)} className="h-4 w-4 accent-blue-600"/>
                {l}
              </label>
            ))}
          </div>
        </div>

        <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm">
            <span className="text-gray-500">Gross Monthly: </span>
            <strong className="text-gray-900">₹{fmt(breakup?.gross_monthly)}</strong>
            <span className="mx-3 text-gray-200">|</span>
            <span className="text-gray-500">Net Pay Monthly: </span>
            <strong className="text-gray-900">₹{fmt(netPayAfterMess)}</strong>
            {messDeduction>0 && <span className="text-gray-400 text-xs ml-1">(after ₹{fmt(messDeduction)} mess)</span>}
            {basicReversal>0 && <span className="text-gray-400 text-xs ml-1">(plus ₹{fmt(basicReversal)} reversal)</span>}
            <span className="mx-3 text-gray-200">|</span>
            <span className="text-gray-500">Annual CTC: </span>
            <strong className="text-gray-900">₹{fmt(breakup?.ctc_annual)}</strong>
          </div>
          <button onClick={submit} disabled={saving||!breakup}
            className="px-6 py-2.5 rounded-xl text-sm font-black text-white disabled:opacity-50"
            style={{background:`linear-gradient(135deg,${B.blue},${B.navy})`}}>
            {saving?'Saving…':(isEdit?'Update Salary':'Save Salary')}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

function MessEditModal({ employee, salary, onClose, onSave, saving }) {
  const [amount, setAmount] = useState(String(salary?.mess_deduction ?? 0));
  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
      <motion.div initial={{opacity:0,scale:0.97}} animate={{opacity:1,scale:1}} transition={{duration:0.2}}
        className="w-full max-w-sm bg-white rounded-2xl shadow-2xl overflow-hidden border border-gray-100">
        <div className="px-6 py-4 flex items-center justify-between"
          style={{background:`linear-gradient(135deg,#0A1F5C,#1e3a8a)`}}>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-white/15 flex items-center justify-center">
              <Utensils className="w-4 h-4 text-white"/>
            </div>
            <div>
              <p className="font-black text-white text-sm">Mess Deduction</p>
              <p className="text-white/55 text-xs">{employee.name}</p>
            </div>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-lg bg-white/15 hover:bg-white/25 flex items-center justify-center">
            <X className="w-4 h-4 text-white"/>
          </button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="text-xs font-black text-gray-600 uppercase tracking-wide block mb-1.5">
              Deduction Amount (₹) — this month
            </label>
            <input type="number" value={amount} onChange={e=>setAmount(e.target.value)}
              min="0" autoFocus
              className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-2xl font-black text-gray-900 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50 transition-all"
              placeholder="0"/>
            <p className="text-xs text-gray-400 mt-1.5">
              Previous: ₹{fmt(salary?.mess_deduction || 0)} &nbsp;|&nbsp;
              Net Pay after this change: ₹{fmt((Number(salary?.gross_monthly)||0) - (Number(salary?.employee_pf)||0) - (Number(salary?.pt_deduction)||0) - (Number(amount)||0) + (Number(salary?.basic_reversal)||0))}
            </p>
          </div>
          <div className="flex gap-3 pt-1">
            <button onClick={onClose}
              className="flex-1 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-sm font-bold transition-colors">
              Cancel
            </button>
            <button onClick={()=>onSave(Number(amount)||0)} disabled={saving}
              className="flex-1 py-2.5 text-white rounded-xl text-sm font-black disabled:opacity-50 transition-opacity"
              style={{background:`linear-gradient(135deg,#2563EB,#0A1F5C)`}}>
              {saving?'Saving…':'Save'}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

function BasicReversalEditModal({ employee, salary, onClose, onSave, saving }) {
  const [amount, setAmount] = useState(String(salary?.basic_reversal ?? 0));
  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
      <motion.div initial={{opacity:0,scale:0.97}} animate={{opacity:1,scale:1}} transition={{duration:0.2}}
        className="w-full max-w-sm bg-white rounded-2xl shadow-2xl overflow-hidden border border-gray-100">
        <div className="px-6 py-4 flex items-center justify-between"
          style={{background:`linear-gradient(135deg,#0A1F5C,#1e3a8a)`}}>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-white/15 flex items-center justify-center">
              <RotateCcw className="w-4 h-4 text-white"/>
            </div>
            <div>
              <p className="font-black text-white text-sm">Basic Reversal</p>
              <p className="text-white/55 text-xs">{employee.name}</p>
            </div>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-lg bg-white/15 hover:bg-white/25 flex items-center justify-center">
            <X className="w-4 h-4 text-white"/>
          </button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="text-xs font-black text-gray-600 uppercase tracking-wide block mb-1.5">
              Reversal Amount (₹) — this month
            </label>
            <input type="number" value={amount} onChange={e=>setAmount(e.target.value)}
              min="0" autoFocus
              className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-2xl font-black text-gray-900 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50 transition-all"
              placeholder="0"/>
            <p className="text-xs text-gray-400 mt-1.5">
              Previous: ₹{fmt(salary?.basic_reversal || 0)} &nbsp;|&nbsp;
              Net Pay after this change: ₹{fmt((Number(salary?.gross_monthly)||0) - (Number(salary?.employee_pf)||0) - (Number(salary?.pt_deduction)||0) - (Number(salary?.mess_deduction)||0) + (Number(amount)||0))}
            </p>
          </div>
          <div className="flex gap-3 pt-1">
            <button onClick={onClose}
              className="flex-1 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-sm font-bold transition-colors">
              Cancel
            </button>
            <button onClick={()=>onSave(Number(amount)||0)} disabled={saving}
              className="flex-1 py-2.5 text-white rounded-xl text-sm font-black disabled:opacity-50 transition-opacity"
              style={{background:`linear-gradient(135deg,#2563EB,#0A1F5C)`}}>
              {saving?'Saving…':'Save'}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

function RowActionsMenu({ sal, emp, onView, onMess, onReversal }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);
  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen(o => !o)}
        className="w-8 h-8 rounded-lg border border-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-50 transition-colors">
        <MoreVertical className="w-4 h-4" />
      </button>
      {open && sal && (
        <div className="absolute right-0 mt-1 w-48 bg-white rounded-xl border border-gray-100 shadow-lg z-20 py-1.5 overflow-hidden">
          <button onClick={() => { onMess(); setOpen(false); }}
            className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm font-bold text-gray-700 hover:bg-blue-50 transition-colors">
            <Utensils className="w-3.5 h-3.5 text-gray-400" /> Edit Mess Deduction
          </button>
          <button onClick={() => { onReversal(); setOpen(false); }}
            className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm font-bold text-gray-700 hover:bg-blue-50 transition-colors">
            <RotateCcw className="w-3.5 h-3.5 text-gray-400" /> Edit Basic Reversal
          </button>
        </div>
      )}
    </div>
  );
}

const PAGE_SIZES = [10, 25, 50];

function ImportResultModal({ result, onClose }) {
  const { total = 0, imported = 0, skipped = [] } = result;
  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
      <motion.div initial={{opacity:0,scale:0.97}} animate={{opacity:1,scale:1}} transition={{duration:0.2}}
        className="w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden border border-gray-100 max-h-[85vh] flex flex-col">
        <div className="relative px-6 py-5 flex items-center justify-between flex-shrink-0"
          style={{background:`linear-gradient(135deg,#0A1F5C,#1e3a8a)`}}>
          <div>
            <h2 className="text-lg font-black text-white">Import Results</h2>
            <p className="text-white/55 text-sm mt-0.5">{imported} of {total} row{total!==1?'s':''} imported</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg bg-white/15 hover:bg-white/25 flex items-center justify-center transition-colors">
            <X className="w-4 h-4 text-white"/>
          </button>
        </div>

        <div className="p-6 overflow-y-auto flex-1">
          <div className="grid grid-cols-3 gap-3 mb-5">
            <div className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-3 text-center">
              <div className="text-xl font-black text-gray-900">{total}</div>
              <div className="text-[10px] font-bold text-gray-400 uppercase mt-0.5">Total Rows</div>
            </div>
            <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-3 text-center">
              <div className="text-xl font-black text-emerald-700">{imported}</div>
              <div className="text-[10px] font-bold text-emerald-500 uppercase mt-0.5">Imported</div>
            </div>
            <div className="rounded-xl border border-red-100 bg-red-50 px-3 py-3 text-center">
              <div className="text-xl font-black text-red-700">{skipped.length}</div>
              <div className="text-[10px] font-bold text-red-400 uppercase mt-0.5">Skipped</div>
            </div>
          </div>

          {skipped.length > 0 && (
            <div>
              <p className={lbl}>Skipped Rows</p>
              <div className="rounded-xl border border-gray-200 overflow-hidden">
                {skipped.map((s,i)=>(
                  <div key={i} className={`flex items-center gap-3 px-3 py-2 text-xs ${i%2?'bg-white':'bg-gray-50'}`}>
                    <span className="font-bold text-gray-500 flex-shrink-0">Row {s.row}</span>
                    <span className="text-red-600 truncate">{s.reason}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex-shrink-0">
          <button onClick={onClose}
            className="w-full py-2.5 rounded-xl text-white text-sm font-black"
            style={{background:`linear-gradient(135deg,${B.blue},${B.navy})`}}>
            Done
          </button>
        </div>
      </motion.div>
    </div>
  );
}

export default function EmployeeSalaryPage() {
  const qc = useQueryClient();
  const [search,    setSearch]    = useState('');
  const [deptFilter, setDeptFilter] = useState('');
  const [desigFilter, setDesigFilter] = useState('');
  const [page,      setPage]      = useState(1);
  const [pageSize,  setPageSize]  = useState(10);
  const [showModal, setShowModal] = useState(false);
  const [editSalary, setEditSalary] = useState(null); // salary row being edited
  const [messEdit,  setMessEdit]  = useState(null); // { employee, salary }
  const [reversalEdit, setReversalEdit] = useState(null); // { employee, salary }
  const [importResult, setImportResult] = useState(null); // { total, imported, skipped }
  const importInputRef = useRef(null);

  const { data:empData,     isLoading:empLoading     } = useQuery({
    queryKey:['hr-employees-active'],
    queryFn:()=>hrEmployeesAPI.list({employment_status:'active'}).then(r=>r.data),
  });
  const { data:structureData } = useQuery({
    queryKey:['hr-salary-structures'],
    queryFn:()=>hrSalaryAPI.listStructures().then(r=>r.data),
  });
  const { data:salaryData,  isLoading:salaryLoading  } = useQuery({
    queryKey:['hr-employee-salaries'],
    queryFn:()=>hrSalaryAPI.listEmpSalaries().then(r=>r.data),
  });

  const employees  = empData?.data     || [];
  const structures = structureData?.data || [];
  const salaryRows = salaryData?.data   || [];

  const latestByUser = useMemo(()=>{
    const map = new Map();
    salaryRows.forEach(row=>{ if(!map.has(row.user_id)) map.set(row.user_id,row); });
    return map;
  },[salaryRows]);

  const departments = useMemo(() =>
    [...new Set(employees.map(e => e.department_name).filter(Boolean))].sort(),
  [employees]);
  const designations = useMemo(() =>
    [...new Set(employees.map(e => e.designation_name || e.designation).filter(Boolean))].sort(),
  [employees]);

  const filtered = useMemo(()=>{
    const n = search.trim().toLowerCase();
    return employees.filter(e=>{
      if (deptFilter && e.department_name !== deptFilter) return false;
      if (desigFilter && (e.designation_name || e.designation) !== desigFilter) return false;
      if(!n) return true;
      return [e.name,e.employee_code,e.email,e.department_name,e.designation_name]
        .some(v=>String(v||'').toLowerCase().includes(n));
    });
  },[employees,search,deptFilter,desigFilter]);

  // Reset to page 1 whenever the filtered set changes shape
  useEffect(() => { setPage(1); }, [search, deptFilter, desigFilter, pageSize]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageRows = useMemo(() =>
    filtered.slice((page - 1) * pageSize, (page - 1) * pageSize + pageSize),
  [filtered, page, pageSize]);

  const configured  = employees.filter(e=>latestByUser.has(e.id)).length;

  const configuredSalaries = employees
    .map(e => latestByUser.get(e.id))
    .filter(Boolean);
  const totalPayroll = configuredSalaries.reduce((s, sal) => s + Number(sal.net_pay_monthly || 0), 0);
  const avgSalary = configuredSalaries.length ? totalPayroll / configuredSalaries.length : 0;

  const saveMut = useMutation({
    mutationFn:(payload)=>hrSalaryAPI.assignSalary(payload),
    onSuccess:()=>{ toast.success('Employee salary saved'); setShowModal(false); qc.invalidateQueries({queryKey:['hr-employee-salaries']}); },
    onError:(e)=>toast.error(e.response?.data?.error||'Failed to save salary'),
  });

  const updateMut = useMutation({
    mutationFn:({id, ...payload})=>hrSalaryAPI.updateEmpSalary(id, payload),
    onSuccess:()=>{ toast.success('Salary updated'); setEditSalary(null); qc.invalidateQueries({queryKey:['hr-employee-salaries']}); },
    onError:(e)=>toast.error(e.response?.data?.error||'Failed to update salary'),
  });

  const handleSave = (payload) => {
    if (payload.id) updateMut.mutate(payload);
    else saveMut.mutate(payload);
  };

  const breakupMut = useMutation({ mutationFn:(payload)=>hrSalaryAPI.calculateBreakup(payload) });

  const messMut = useMutation({
    mutationFn:({id, mess_deduction})=>hrSalaryAPI.updateMess(id, { mess_deduction }),
    onSuccess:()=>{ toast.success('Mess deduction updated'); setMessEdit(null); qc.invalidateQueries({queryKey:['hr-employee-salaries']}); },
    onError:(e)=>toast.error(e.response?.data?.error||'Failed to update mess deduction'),
  });

  const reversalMut = useMutation({
    mutationFn:({id, basic_reversal})=>hrSalaryAPI.updateBasicReversal(id, { basic_reversal }),
    onSuccess:()=>{ toast.success('Basic reversal updated'); setReversalEdit(null); qc.invalidateQueries({queryKey:['hr-employee-salaries']}); },
    onError:(e)=>toast.error(e.response?.data?.error||'Failed to update basic reversal'),
  });

  const importMut = useMutation({
    mutationFn:(file)=>hrSalaryAPI.importSalaries(file),
    onSuccess:(res)=>{
      const d = res.data?.data || {};
      setImportResult(d);
      if (d.imported > 0) qc.invalidateQueries({queryKey:['hr-employee-salaries']});
      if (d.imported > 0) toast.success(`Imported ${d.imported} of ${d.total} salaries`);
      else toast.error('No rows were imported — see details');
    },
    onError:(e)=>toast.error(e.response?.data?.error||'Import failed'),
  });

  const handleImportFile = (e) => {
    const file = e.target.files?.[0];
    if (file) importMut.mutate(file);
    e.target.value = '';
  };

  const kpis = [
    { label:'Total Employees',  value:employees.length,                icon:Users,      bg:'bg-blue-50',    text:'text-blue-700',    fmtCurrency:false },
    { label:'Total Payroll',    value:totalPayroll,                    icon:Wallet,     bg:'bg-emerald-50', text:'text-emerald-700', fmtCurrency:true  },
    { label:'Average Salary',   value:avgSalary,                       icon:TrendingUp, bg:'bg-amber-50',   text:'text-amber-700',   fmtCurrency:true  },
    { label:'Salary Configured', value:`${configured}/${employees.length}`, icon:CheckCircle2, bg:'bg-indigo-50', text:'text-indigo-700', fmtCurrency:false },
  ];

  const exportCsv = () => {
    const header = ['Employee','Employee ID','Department','Designation','Basic Salary','Allowances','Deductions','Net Salary'];
    const lines = filtered.map(emp => {
      const sal = latestByUser.get(emp.id);
      const basic = Number(sal?.basic || 0);
      const allowances = sal ? Number(sal.gross_monthly || 0) - basic : 0;
      const deductions = sal ? Math.max(0, Number(sal.employee_pf||0) + Number(sal.pt_deduction||0) + Number(sal.mess_deduction||0) - Number(sal.basic_reversal||0)) : 0;
      return [
        emp.name, emp.employee_code||'', emp.department_name||'', emp.designation_name||emp.designation||'',
        basic.toFixed(2), allowances.toFixed(2), deductions.toFixed(2), Number(sal?.net_pay_monthly||0).toFixed(2),
      ].map(v => `"${String(v).replace(/"/g,'""')}"`).join(',');
    });
    const blob = new Blob([[header.join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `employee-salaries-${today()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-6 space-y-6 min-h-screen" style={{background:'#F8FAFC'}}>

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-xs font-bold text-gray-400 mb-1">HR &amp; Payroll <span className="mx-1">›</span> <span className="text-gray-600">Employee Salaries</span></p>
          <h1 className="text-2xl font-black text-gray-900">Employee Salaries</h1>
          <p className="text-sm text-gray-500 mt-0.5">View and manage employee salary details</p>
        </div>
        <div className="flex items-center gap-2.5">
          <input ref={importInputRef} type="file" accept=".csv,.xlsx" className="hidden" onChange={handleImportFile}/>
          <button onClick={()=>importInputRef.current?.click()} disabled={importMut.isPending}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50">
            {importMut.isPending ? <RotateCcw className="w-4 h-4 animate-spin"/> : <Upload className="w-4 h-4"/>}
            {importMut.isPending ? 'Importing…' : 'Import Salaries'}
          </button>
          <button onClick={exportCsv}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 transition-colors">
            <Download className="w-4 h-4"/> Export Salaries
          </button>
          <button onClick={()=>{ setEditSalary(null); setShowModal(true); }}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-black text-sm text-white"
            style={{background:`linear-gradient(135deg,${B.blue},${B.navy})`}}>
            <Plus className="w-4 h-4"/> Add Salary Record
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((k,i)=>(
          <motion.div key={k.label} {...fade(0.06+i*0.05)}
            className="bg-white rounded-2xl border border-gray-100 p-5"
            style={{boxShadow:'0 2px 12px rgba(10,31,92,0.06)'}}>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-black text-gray-500 uppercase tracking-wide">{k.label}</span>
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${k.bg}`}>
                <k.icon className={`w-4 h-4 ${k.text}`}/>
              </div>
            </div>
            <div className="text-2xl font-black text-gray-900">{k.fmtCurrency ? `₹${fmt(k.value)}` : k.value}</div>
          </motion.div>
        ))}
      </div>

      {/* Table Card */}
      <motion.div {...fade(0.18)} className="bg-white rounded-2xl border border-gray-100 overflow-hidden"
        style={{boxShadow:'0 2px 12px rgba(10,31,92,0.06)'}}>

        {/* Filter Bar */}
        <div className="px-5 py-4 border-b border-gray-100 flex flex-col lg:flex-row gap-3 lg:items-center lg:justify-between">
          <div className="flex flex-col sm:flex-row gap-3 flex-1">
            <select value={deptFilter} onChange={e=>setDeptFilter(e.target.value)}
              className="px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold text-gray-700 focus:outline-none focus:border-blue-400 min-w-[170px]">
              <option value="">All Departments</option>
              {departments.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
            <select value={desigFilter} onChange={e=>setDesigFilter(e.target.value)}
              className="px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold text-gray-700 focus:outline-none focus:border-blue-400 min-w-[170px]">
              <option value="">All Designations</option>
              {designations.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"/>
              <input value={search} onChange={e=>setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-900 focus:outline-none focus:border-blue-400"
                placeholder="Search employee…"/>
            </div>
          </div>
          <span className="text-sm font-bold text-gray-500 whitespace-nowrap">{filtered.length} employee(s)</span>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b-2 border-indigo-500">
                {['Employee','Employee ID','Department','Designation','Basic Salary','Allowances','Deductions','Net Salary','Status','Actions'].map(h=>(
                  <th key={h} className="px-4 py-3.5 text-left text-[10.5px] font-bold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {(empLoading||salaryLoading) && (
                <tr><td colSpan={10} className="px-4 py-12 text-center text-gray-400 text-sm">Loading salary data…</td></tr>
              )}
              {!empLoading && !salaryLoading && pageRows.map(emp=>{
                const sal = latestByUser.get(emp.id);
                const basic = sal ? Number(sal.basic || 0) : 0;
                const allowances = sal ? Number(sal.gross_monthly || 0) - basic : 0;
                const deductions = sal ? Math.max(0, Number(sal.employee_pf||0) + Number(sal.pt_deduction||0) + Number(sal.mess_deduction||0) - Number(sal.basic_reversal||0)) : 0;
                return (
                  <tr key={emp.id} className="hover:bg-blue-50/30 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl flex items-center justify-center text-white text-xs font-black flex-shrink-0"
                          style={{background:`linear-gradient(135deg,${B.blue},${B.navy})`}}>
                          {(emp.name||'?').split(' ').map(w=>w[0]).slice(0,2).join('').toUpperCase()}
                        </div>
                        <div>
                          <div className="font-black text-gray-900">{emp.name}</div>
                          <div className="text-xs text-gray-400">{emp.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 font-bold text-gray-700">{emp.employee_code||'—'}</td>
                    <td className="px-4 py-3 font-bold text-gray-700">{emp.department_name||'—'}</td>
                    <td className="px-4 py-3 font-bold text-gray-700">{emp.designation_name||emp.designation||'—'}</td>
                    <td className="px-4 py-3 font-black text-gray-900">{sal?`₹${fmt(basic)}`:'—'}</td>
                    <td className="px-4 py-3 font-bold text-emerald-600">{sal?`₹${fmt(allowances)}`:'—'}</td>
                    <td className="px-4 py-3 font-bold text-rose-600">{sal?`₹${fmt(deductions)}`:'—'}</td>
                    <td className="px-4 py-3 font-black text-gray-900">{sal?`₹${fmt(sal.net_pay_monthly)}`:'—'}</td>
                    <td className="px-4 py-3">
                      {sal ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-black">
                          <IndianRupee className="w-3 h-3"/> Configured
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 text-xs font-black">
                          <Calculator className="w-3 h-3"/> Pending
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        {sal ? (
                          <button onClick={()=>setEditSalary(sal)} title="View / edit salary breakup"
                            className="w-8 h-8 rounded-lg border border-gray-200 flex items-center justify-center text-blue-600 hover:bg-blue-50 transition-colors">
                            <Eye className="w-4 h-4"/>
                          </button>
                        ) : (
                          <button onClick={()=>{ setEditSalary(null); setShowModal(true); }}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-50 text-amber-700 text-xs font-black hover:bg-amber-100 transition-colors">
                            <Plus className="w-3.5 h-3.5"/> Assign
                          </button>
                        )}
                        <RowActionsMenu
                          sal={sal} emp={emp}
                          onMess={()=>setMessEdit({employee:emp,salary:sal})}
                          onReversal={()=>setReversalEdit({employee:emp,salary:sal})}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!empLoading && !salaryLoading && filtered.length===0 && (
                <tr><td colSpan={10} className="px-4 py-12 text-center text-gray-400 text-sm">No employees found</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {!empLoading && !salaryLoading && filtered.length > 0 && (
          <div className="px-5 py-3.5 border-t border-gray-100 flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
            <span className="text-xs font-bold text-gray-500">
              Showing {(page-1)*pageSize+1} to {Math.min(page*pageSize, filtered.length)} of {filtered.length} entries
            </span>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1">
                <button onClick={()=>setPage(p=>Math.max(1,p-1))} disabled={page===1}
                  className="w-8 h-8 rounded-lg border border-gray-200 flex items-center justify-center text-gray-500 disabled:opacity-40 hover:bg-gray-50 transition-colors">
                  <ChevronLeft className="w-4 h-4"/>
                </button>
                {Array.from({length: totalPages}, (_,i)=>i+1)
                  .filter(p => p===1 || p===totalPages || Math.abs(p-page)<=1)
                  .reduce((acc,p,i,arr)=>{ if(i>0 && p-arr[i-1]>1) acc.push('…'); acc.push(p); return acc; }, [])
                  .map((p,i) => p==='…' ? (
                    <span key={`gap-${i}`} className="w-8 h-8 flex items-center justify-center text-gray-300 text-sm">…</span>
                  ) : (
                    <button key={p} onClick={()=>setPage(p)}
                      className={`w-8 h-8 rounded-lg text-sm font-bold transition-colors ${p===page ? 'text-white' : 'text-gray-600 hover:bg-gray-50 border border-gray-200'}`}
                      style={p===page ? {background:`linear-gradient(135deg,${B.blue},${B.navy})`} : undefined}>
                      {p}
                    </button>
                  ))}
                <button onClick={()=>setPage(p=>Math.min(totalPages,p+1))} disabled={page===totalPages}
                  className="w-8 h-8 rounded-lg border border-gray-200 flex items-center justify-center text-gray-500 disabled:opacity-40 hover:bg-gray-50 transition-colors">
                  <ChevronRight className="w-4 h-4"/>
                </button>
              </div>
              <div className="relative">
                <select value={pageSize} onChange={e=>setPageSize(Number(e.target.value))}
                  className="appearance-none pl-3 pr-8 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs font-bold text-gray-700 focus:outline-none focus:border-blue-400">
                  {PAGE_SIZES.map(s => <option key={s} value={s}>{s} / page</option>)}
                </select>
                <ChevronDown className="w-3.5 h-3.5 text-gray-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none"/>
              </div>
            </div>
          </div>
        )}
      </motion.div>

      {messEdit && (
        <MessEditModal
          employee={messEdit.employee}
          salary={messEdit.salary}
          saving={messMut.isPending}
          onClose={()=>setMessEdit(null)}
          onSave={(amount)=>messMut.mutate({id:messEdit.salary.id, mess_deduction:amount})}
        />
      )}

      {reversalEdit && (
        <BasicReversalEditModal
          employee={reversalEdit.employee}
          salary={reversalEdit.salary}
          saving={reversalMut.isPending}
          onClose={()=>setReversalEdit(null)}
          onSave={(amount)=>reversalMut.mutate({id:reversalEdit.salary.id, basic_reversal:amount})}
        />
      )}

      {importResult && (
        <ImportResultModal result={importResult} onClose={()=>setImportResult(null)}/>
      )}

      {(showModal || editSalary) && (
        <SalaryModal
          key={editSalary?.id || 'new'}
          employees={employees}
          structures={structures}
          editSalary={editSalary}
          saving={saveMut.isPending || updateMut.isPending}
          calculating={breakupMut.isPending}
          calculateBreakup={payload=>breakupMut.mutateAsync(payload)}
          onClose={()=>{ setShowModal(false); setEditSalary(null); }}
          onSave={handleSave}
        />
      )}
    </div>
  );
}
