// src/pages/hr-admin/EmployeeSalaryPage.jsx — 2026 Premium UI
import React, { useEffect, useMemo, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { motion } from 'framer-motion';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Calculator, CheckCircle2, ChevronLeft, ChevronRight, ChevronDown, Download, Edit2,
  Eye, Home, IndianRupee, MoreVertical, Plus, RotateCcw, Search, TrendingUp, Upload, Users, Utensils, Wallet, X,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { hrEmployeesAPI, hrSalaryAPI } from '../../api/client';

const B = { navy:'#0A1F5C', blue:'#2563EB', yellow:'#F4C430' };
const fade = (d=0) => ({ initial:{opacity:0,y:14}, animate:{opacity:1,y:0}, transition:{duration:0.35,delay:d,ease:[0.16,1,0.3,1]} });
const inp = "w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-900 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50 transition-all";
const lbl = "text-xs font-bold text-gray-600 uppercase tracking-wide block mb-1.5";

const fmt = (n) => Number(n||0).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2});
const today = () => new Date().toISOString().slice(0,10);

// Builds a "breakup"-shaped object straight from a stored hr_employee_salaries
// row, so opening Edit shows what's actually saved. Previously this modal
// re-ran calculateCTCBreakup() on open, silently replacing real (often
// individually negotiated / imported) figures with generic formula guesses —
// HRA, accommodation, food, transport, washing and special allowance don't
// reliably follow any formula (verified against the real CTC master: HRA
// alone lands anywhere from 20% to 40% of Basic with no derivable rule), so
// recalculating on every edit was silently corrupting real data the moment
// someone clicked "Update Salary" without noticing the numbers had changed.
function salaryToBreakup(s) {
  return {
    ctc_monthly: s.ctc_annual ? Math.round(Number(s.ctc_annual) / 12) : 0,
    ctc_annual: Number(s.ctc_annual || 0),
    basic: Number(s.basic || 0), vda: Number(s.vda || 0), hra: Number(s.hra || 0),
    project_allowance: Number(s.project_allowance || 0),
    accommodation_allowance: Number(s.accommodation_allowance || 0),
    food_allowance: Number(s.food_allowance || 0),
    transport_allowance: Number(s.transport_allowance || 0),
    lta: Number(s.lta || 0), medical_allowance: Number(s.medical || 0),
    mobile_allowance: Number(s.mobile_allowance || 0),
    incentive: Number(s.incentive || 0), washing_allowance: Number(s.washing_allowance || 0),
    education_allowance: Number(s.education_allowance || 0), special_allowance: Number(s.special_allowance || 0),
    conveyance_allowance: Number(s.conveyance_allowance || 0), city_special_allowance: Number(s.city_special_allowance || 0),
    outstation_allowance: Number(s.outstation_allowance || 0), fixed_site_allowance: Number(s.fixed_site_allowance || 0),
    variable_site_allowance: Number(s.variable_site_allowance || 0), value_of_food_concession: Number(s.value_of_food_concession || 0),
    gross_monthly: Number(s.gross_monthly || 0),
    employer_pf: Number(s.employer_pf || 0), edli: Number(s.edli || 0), epf_admin: Number(s.epf_admin || 0),
    gratuity: Number(s.gratuity || 0), employer_esic: Number(s.employer_esi || 0), employer_lwf: 0,
    employee_pf: Number(s.employee_pf || 0), pt_deduction: Number(s.pt_deduction || 0),
    employee_esic: 0, employee_lwf: 0,
    basic_reversal: Number(s.basic_reversal || 0),
    net_pay_monthly: Number(s.net_pay_monthly || 0),
  };
}

function SalaryModal({ employees, structures, onClose, onSave, saving, calculateBreakup, calculating, editSalary }) {
  const isEdit = !!editSalary;
  const [form, setForm] = useState(() => isEdit ? {
    user_id: editSalary.user_id,
    structure_id: editSalary.structure_id || structures[0]?.id || '',
    ctc_monthly: editSalary.ctc_annual ? String(Math.round(Number(editSalary.ctc_annual) / 12)) : '',
    mess_deduction: editSalary.mess_deduction || '',
    accommodation_deduction: editSalary.accommodation_deduction || '',
    basic_reversal: editSalary.basic_reversal || '',
    pf_applicable: editSalary.pf_applicable ?? true,
    esi_applicable: editSalary.esi_applicable ?? false,
    pt_applicable: editSalary.pt_applicable ?? true,
    effective_from: (editSalary.effective_from || today()).slice(0, 10),
  } : {
    user_id:'', structure_id:structures[0]?.id||'',
    ctc_monthly:'', mess_deduction:'', accommodation_deduction:'', basic_reversal:'',
    pf_applicable:true, esi_applicable:false, pt_applicable:true,
    effective_from:today(),
  });
  // Editing an existing record: show what's actually saved, not a fresh
  // formula guess. recalculated=true only once the admin explicitly clicks
  // "Recalculate from CTC" — see the warning banner below.
  const [breakup, setBreakup] = useState(() => isEdit ? salaryToBreakup(editSalary) : null);
  const [recalculated, setRecalculated] = useState(false);
  const update = (k,v) => setForm(p=>({...p,[k]:v}));

  const messDeduction = Number(form.mess_deduction||0);
  const accommodationDeduction = Number(form.accommodation_deduction||0);
  const basicReversal = Number(form.basic_reversal||0);
  const netPayAfterMess = breakup ? breakup.net_pay_monthly - messDeduction - accommodationDeduction + basicReversal : 0;

  const runCalculate = async () => {
    if (!form.ctc_monthly || Number(form.ctc_monthly) <= 0) return toast.error('Enter a monthly CTC to calculate');
    // Hard gate, not just a passive banner: on an existing record this
    // replaces real, often individually negotiated or imported figures with
    // a generic formula guess. Require an explicit, named confirmation
    // before it's allowed to run at all — no accidental click should be able
    // to trigger this.
    if (isEdit) {
      const ok = window.confirm(
        `This will REPLACE ${editSalary.employee_name || 'this employee'}'s real saved salary figures ` +
        `(HRA, accommodation, food, transport, washing, special allowance, etc.) with a generic formula ` +
        `estimate from the CTC. These fields are individually negotiated per employee and do not follow ` +
        `a formula — recalculating is very likely to make this record wrong.\n\n` +
        `Only continue if you specifically intend to overwrite this employee's real salary breakup.\n\n` +
        `Type OK to proceed, or Cancel to keep their real saved values.`
      );
      if (!ok) return;
    }
    try {
      const res = await calculateBreakup({ ctc_monthly: Number(form.ctc_monthly) });
      setBreakup(res.data?.data || null);
      setRecalculated(true);
    } catch (e) {
      toast.error(e.response?.data?.error || 'Failed to calculate breakup');
    }
  };

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
      city_special_allowance:breakup.city_special_allowance, conveyance_allowance:breakup.conveyance_allowance,
      outstation_allowance:breakup.outstation_allowance, fixed_site_allowance:breakup.fixed_site_allowance,
      variable_site_allowance:breakup.variable_site_allowance, value_of_food_concession:breakup.value_of_food_concession,
      mess_deduction:messDeduction, accommodation_deduction:accommodationDeduction,
      basic_reversal:basicReversal, net_pay_monthly:netPayAfterMess,
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
                style={{background: isEdit ? 'linear-gradient(135deg,#D97706,#92400E)' : `linear-gradient(135deg,${B.blue},${B.navy})`}}>
                {calculating ? 'Calculating…' : isEdit ? 'Recalculate from CTC (overwrites real data)' : 'Calculate Breakup'}
              </button>
            </div>
          </div>
          <div>
            <label className={lbl}>Effective From</label>
            <input type="date" value={form.effective_from} onChange={e=>update('effective_from',e.target.value)} className={inp}/>
          </div>

          {isEdit && recalculated && (
            <div className="md:col-span-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-xs text-amber-800 font-bold">
              ⚠ These figures are a fresh formula estimate from the CTC, not the employee's saved values —
              HRA/accommodation/food/transport/washing/special allowance are individually negotiated per
              employee and don't follow a formula. Saving now will overwrite their real numbers with this estimate.
            </div>
          )}

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
                  ['City Special Allowance', breakup.city_special_allowance],
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
                <div className="bg-white px-3 py-2">
                  <div className="text-[10px] font-bold text-gray-400 uppercase">Accommodation Deduction</div>
                  <input type="number" value={form.accommodation_deduction} onChange={e=>update('accommodation_deduction',e.target.value)}
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
            {accommodationDeduction>0 && <span className="text-gray-400 text-xs ml-1">(after ₹{fmt(accommodationDeduction)} accommodation)</span>}
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
              Net Pay after this change: ₹{fmt((Number(salary?.gross_monthly)||0) - (Number(salary?.employee_pf)||0) - (Number(salary?.pt_deduction)||0) - (Number(amount)||0) - (Number(salary?.accommodation_deduction)||0) + (Number(salary?.basic_reversal)||0))}
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

function AccommodationDeductionEditModal({ employee, salary, onClose, onSave, saving }) {
  const [amount, setAmount] = useState(String(salary?.accommodation_deduction ?? 0));
  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
      <motion.div initial={{opacity:0,scale:0.97}} animate={{opacity:1,scale:1}} transition={{duration:0.2}}
        className="w-full max-w-sm bg-white rounded-2xl shadow-2xl overflow-hidden border border-gray-100">
        <div className="px-6 py-4 flex items-center justify-between"
          style={{background:`linear-gradient(135deg,#0A1F5C,#1e3a8a)`}}>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-white/15 flex items-center justify-center">
              <Home className="w-4 h-4 text-white"/>
            </div>
            <div>
              <p className="font-black text-white text-sm">Accommodation Deduction</p>
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
              Previous: ₹{fmt(salary?.accommodation_deduction || 0)} &nbsp;|&nbsp;
              Net Pay after this change: ₹{fmt((Number(salary?.gross_monthly)||0) - (Number(salary?.employee_pf)||0) - (Number(salary?.pt_deduction)||0) - (Number(salary?.mess_deduction)||0) - (Number(amount)||0) + (Number(salary?.basic_reversal)||0))}
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
              Net Pay after this change: ₹{fmt((Number(salary?.gross_monthly)||0) - (Number(salary?.employee_pf)||0) - (Number(salary?.pt_deduction)||0) - (Number(salary?.mess_deduction)||0) - (Number(salary?.accommodation_deduction)||0) + (Number(amount)||0) + (Number(salary?.incentive)||0))}
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

function IncentiveEditModal({ employee, salary, onClose, onSave, saving }) {
  const [amount, setAmount] = useState(String(salary?.incentive ?? 0));
  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
      <motion.div initial={{opacity:0,scale:0.97}} animate={{opacity:1,scale:1}} transition={{duration:0.2}}
        className="w-full max-w-sm bg-white rounded-2xl shadow-2xl overflow-hidden border border-gray-100">
        <div className="px-6 py-4 flex items-center justify-between"
          style={{background:`linear-gradient(135deg,#0A1F5C,#1e3a8a)`}}>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-white/15 flex items-center justify-center">
              <TrendingUp className="w-4 h-4 text-white"/>
            </div>
            <div>
              <p className="font-black text-white text-sm">Incentive</p>
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
              Incentive Amount (₹) — this month
            </label>
            <input type="number" value={amount} onChange={e=>setAmount(e.target.value)}
              min="0" autoFocus
              className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-2xl font-black text-gray-900 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50 transition-all"
              placeholder="0"/>
            <p className="text-xs text-gray-400 mt-1.5">
              Previous: ₹{fmt(salary?.incentive || 0)} &nbsp;|&nbsp;
              Net Pay after this change: ₹{fmt((Number(salary?.gross_monthly)||0) - (Number(salary?.employee_pf)||0) - (Number(salary?.pt_deduction)||0) - (Number(salary?.mess_deduction)||0) - (Number(salary?.accommodation_deduction)||0) + (Number(salary?.basic_reversal)||0) + (Number(amount)||0))}
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

function AccommodationAllowanceEditModal({ employee, salary, onClose, onSave, saving }) {
  const [amount, setAmount] = useState(String(salary?.accommodation_allowance ?? 0));
  const newGross = (Number(salary?.gross_monthly)||0) - (Number(salary?.accommodation_allowance)||0) + (Number(amount)||0);
  const newNet = newGross - (Number(salary?.employee_pf)||0) - (Number(salary?.pt_deduction)||0)
    - (Number(salary?.mess_deduction)||0) - (Number(salary?.accommodation_deduction)||0)
    + (Number(salary?.basic_reversal)||0) + (Number(salary?.incentive)||0);
  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
      <motion.div initial={{opacity:0,scale:0.97}} animate={{opacity:1,scale:1}} transition={{duration:0.2}}
        className="w-full max-w-sm bg-white rounded-2xl shadow-2xl overflow-hidden border border-gray-100">
        <div className="px-6 py-4 flex items-center justify-between"
          style={{background:`linear-gradient(135deg,#0A1F5C,#1e3a8a)`}}>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-white/15 flex items-center justify-center">
              <Home className="w-4 h-4 text-white"/>
            </div>
            <div>
              <p className="font-black text-white text-sm">Accommodation Allowance</p>
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
              Accommodation Allowance (₹) — monthly earning
            </label>
            <input type="number" value={amount} onChange={e=>setAmount(e.target.value)}
              min="0" autoFocus
              className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-2xl font-black text-gray-900 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50 transition-all"
              placeholder="0"/>
            <p className="text-xs text-gray-400 mt-1.5">
              Previous: ₹{fmt(salary?.accommodation_allowance || 0)} &nbsp;|&nbsp;
              Gross Monthly after this change: ₹{fmt(newGross)} &nbsp;|&nbsp;
              Net Pay after this change: ₹{fmt(newNet)}
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

// Portal-rendered dropdown, positioned by the trigger button's actual screen
// rect. Previously this rendered `absolute` inside the table's `overflow-x-
// auto` wrapper, which clips or mis-positions any dropdown taller than the
// visible scroll area — exactly what happened once this menu grew past two
// items. Fixed positioning + a portal to document.body sidesteps that
// entirely, matching the pattern already used elsewhere (BillTrackerBillsPage,
// AssetPage, ITAssetPage).
function RowActionsMenu({ sal, emp, onView, onMess, onReversal, onAccommodation, onIncentive, onAccommodationAllowance }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const btnRef = useRef(null);
  const menuRef = useRef(null);

  const toggle = () => {
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      const MENU_W = 232, MENU_H = 260;
      // Flip left/up if the menu would overflow the viewport — the table's
      // rightmost/bottommost rows are exactly where the old absolute
      // positioning broke down.
      const left = Math.min(r.right - MENU_W, window.innerWidth - MENU_W - 8);
      const top  = (r.bottom + MENU_H > window.innerHeight) ? r.top - MENU_H - 4 : r.bottom + 4;
      setPos({ top, left: Math.max(8, left) });
    }
    setOpen(o => !o);
  };

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => {
      if (btnRef.current?.contains(e.target)) return;
      if (menuRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    const onScroll = () => setOpen(false);
    document.addEventListener('mousedown', onDoc);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
    };
  }, [open]);

  const items = [
    { icon: Utensils,   label: 'Edit Mess Deduction',            onClick: onMess },
    { icon: Home,       label: 'Edit Accommodation Allowance',   onClick: onAccommodationAllowance },
    { icon: Home,       label: 'Edit Accommodation Deduction',   onClick: onAccommodation },
    { icon: TrendingUp, label: 'Edit Incentive',                 onClick: onIncentive },
    { icon: RotateCcw,  label: 'Edit Basic Reversal',            onClick: onReversal },
  ];

  return (
    <>
      <button ref={btnRef} onClick={toggle}
        className="w-8 h-8 rounded-lg border border-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-50 transition-colors">
        <MoreVertical className="w-4 h-4" />
      </button>
      {open && sal && pos && ReactDOM.createPortal(
        <div ref={menuRef} style={{ position: 'fixed', top: pos.top, left: pos.left, width: 232, zIndex: 9999 }}
          className="bg-white rounded-xl border border-gray-100 shadow-xl py-1.5 overflow-hidden">
          {items.map(({ icon: Icon, label, onClick }) => (
            <button key={label} onClick={() => { onClick(); setOpen(false); }}
              className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm font-bold text-gray-700 hover:bg-blue-50 transition-colors text-left">
              <Icon className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" /> {label}
            </button>
          ))}
        </div>,
        document.body
      )}
    </>
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
  const [accommodationEdit, setAccommodationEdit] = useState(null); // { employee, salary }
  const [incentiveEdit, setIncentiveEdit] = useState(null); // { employee, salary }
  const [accommodationAllowanceEdit, setAccommodationAllowanceEdit] = useState(null); // { employee, salary }
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

  const accommodationMut = useMutation({
    mutationFn:({id, accommodation_deduction})=>hrSalaryAPI.updateAccommodationDeduction(id, { accommodation_deduction }),
    onSuccess:()=>{ toast.success('Accommodation deduction updated'); setAccommodationEdit(null); qc.invalidateQueries({queryKey:['hr-employee-salaries']}); },
    onError:(e)=>toast.error(e.response?.data?.error||'Failed to update accommodation deduction'),
  });

  const incentiveMut = useMutation({
    mutationFn:({id, incentive})=>hrSalaryAPI.updateIncentive(id, { incentive }),
    onSuccess:()=>{ toast.success('Incentive updated'); setIncentiveEdit(null); qc.invalidateQueries({queryKey:['hr-employee-salaries']}); },
    onError:(e)=>toast.error(e.response?.data?.error||'Failed to update incentive'),
  });

  const accommodationAllowanceMut = useMutation({
    mutationFn:({id, accommodation_allowance})=>hrSalaryAPI.updateAccommodationAllowance(id, { accommodation_allowance }),
    onSuccess:()=>{ toast.success('Accommodation allowance updated'); setAccommodationAllowanceEdit(null); qc.invalidateQueries({queryKey:['hr-employee-salaries']}); },
    onError:(e)=>toast.error(e.response?.data?.error||'Failed to update accommodation allowance'),
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
      const allowances = sal ? Number(sal.gross_monthly || 0) - basic + Number(sal.incentive||0) : 0;
      const deductions = sal ? Math.max(0, Number(sal.employee_pf||0) + Number(sal.pt_deduction||0) + Number(sal.mess_deduction||0) + Number(sal.accommodation_deduction||0) - Number(sal.basic_reversal||0)) : 0;
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
                const allowances = sal ? Number(sal.gross_monthly || 0) - basic + Number(sal.incentive||0) : 0;
                const deductions = sal ? Math.max(0, Number(sal.employee_pf||0) + Number(sal.pt_deduction||0) + Number(sal.mess_deduction||0) + Number(sal.accommodation_deduction||0) - Number(sal.basic_reversal||0)) : 0;
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
                          onAccommodation={()=>setAccommodationEdit({employee:emp,salary:sal})}
                          onIncentive={()=>setIncentiveEdit({employee:emp,salary:sal})}
                          onAccommodationAllowance={()=>setAccommodationAllowanceEdit({employee:emp,salary:sal})}
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

      {accommodationEdit && (
        <AccommodationDeductionEditModal
          employee={accommodationEdit.employee}
          salary={accommodationEdit.salary}
          saving={accommodationMut.isPending}
          onClose={()=>setAccommodationEdit(null)}
          onSave={(amount)=>accommodationMut.mutate({id:accommodationEdit.salary.id, accommodation_deduction:amount})}
        />
      )}

      {incentiveEdit && (
        <IncentiveEditModal
          employee={incentiveEdit.employee}
          salary={incentiveEdit.salary}
          saving={incentiveMut.isPending}
          onClose={()=>setIncentiveEdit(null)}
          onSave={(amount)=>incentiveMut.mutate({id:incentiveEdit.salary.id, incentive:amount})}
        />
      )}

      {accommodationAllowanceEdit && (
        <AccommodationAllowanceEditModal
          employee={accommodationAllowanceEdit.employee}
          salary={accommodationAllowanceEdit.salary}
          saving={accommodationAllowanceMut.isPending}
          onClose={()=>setAccommodationAllowanceEdit(null)}
          onSave={(amount)=>accommodationAllowanceMut.mutate({id:accommodationAllowanceEdit.salary.id, accommodation_allowance:amount})}
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
