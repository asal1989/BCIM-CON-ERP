// FnFSettlementPage.jsx — Full & Final Settlement
import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, X, Eye, CheckCircle2, IndianRupee } from 'lucide-react';
import { clsx } from 'clsx';
import dayjs from 'dayjs';
import toast from 'react-hot-toast';
import { hrFnfAPI, hrEmployeesAPI } from '../../api/client';
import { PageHeader } from '../../theme';
import { FIELD_HL } from '../../constants/fieldStyles';

const INP = `w-full h-9 rounded-lg px-3 text-xs font-medium outline-none transition-all border ${FIELD_HL}`;
const n2 = v => parseFloat(v||0).toFixed(2);
const inr = v => Math.round(parseFloat(v||0)).toLocaleString('en-IN');

const EXIT_REASONS = ['resignation','termination','retirement','absconding','end_of_contract','death'];
const STATUS_COLORS = { draft:'slate', approved:'green', paid:'blue', cancelled:'red' };

function FnFForm({ onClose, onSaved, employees=[] }) {
  const [f, setF] = useState({
    employee_id:'', last_working_day:'', exit_reason:'resignation',
    notice_period_days:0, notice_served_days:0, notice_recovery_days:0, notice_recovery_amount:0,
    days_payable:0, basic_for_days:0, earned_leave_days:0, earned_leave_amount:0,
    gratuity_eligible:false, gratuity_amount:0, bonus_amount:0, arrears:0,
    pf_employee_deduction:0, esi_employee_deduction:0, pt_deduction:0, tds_deduction:0,
    loan_recovery:0, advance_recovery:0, other_deductions:0, other_deduction_remarks:'', remarks:'',
  });
  const [gratuityCalc, setGratuityCalc] = useState(null);
  const set = (k,v) => setF(p=>({...p,[k]:v}));

  const calcGratuity = useQuery({
    queryKey: ['fnf-gratuity', f.employee_id, f.last_working_day],
    queryFn: () => hrFnfAPI.gratuity({ employee_id: f.employee_id, last_working_day: f.last_working_day })
      .then(r => { setGratuityCalc(r.data?.data); return r.data?.data; }),
    enabled: !!f.employee_id && !!f.last_working_day,
  });

  const grossEarnings = [f.basic_for_days,f.earned_leave_amount,f.gratuity_amount,f.bonus_amount,f.arrears].reduce((s,v)=>s+parseFloat(v||0),0);
  const totalDeductions = [f.notice_recovery_amount,f.pf_employee_deduction,f.esi_employee_deduction,f.pt_deduction,f.tds_deduction,f.loan_recovery,f.advance_recovery,f.other_deductions].reduce((s,v)=>s+parseFloat(v||0),0);
  const netPayable = grossEarnings - totalDeductions;

  const mut = useMutation({
    mutationFn: d => hrFnfAPI.create(d),
    onSuccess: () => { toast.success('FnF created'); onSaved(); onClose(); },
    onError: e => toast.error(e?.response?.data?.error||'Failed'),
  });

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h3 className="text-sm font-semibold">New Full & Final Settlement</h3>
          <button onClick={onClose}><X size={16}/></button>
        </div>
        <div className="overflow-y-auto flex-1 p-5 space-y-4">
          {/* Employee + exit info */}
          <div className="grid grid-cols-3 gap-3">
            <div><label className="block text-[11px] text-slate-500 mb-1">Employee *</label>
              <select value={f.employee_id} onChange={e=>set('employee_id',e.target.value)} className={INP}>
                <option value="">Select…</option>
                {employees.map(e=><option key={e.id} value={e.id}>{e.full_name||e.name} ({e.employee_code||e.emp_code})</option>)}
              </select>
            </div>
            <div><label className="block text-[11px] text-slate-500 mb-1">Last Working Day *</label>
              <input type="date" value={f.last_working_day} onChange={e=>set('last_working_day',e.target.value)} className={INP} />
            </div>
            <div><label className="block text-[11px] text-slate-500 mb-1">Exit Reason</label>
              <select value={f.exit_reason} onChange={e=>set('exit_reason',e.target.value)} className={INP}>
                {EXIT_REASONS.map(r=><option key={r} value={r} className="capitalize">{r.replace(/_/g,' ')}</option>)}
              </select>
            </div>
          </div>

          {/* Gratuity hint */}
          {gratuityCalc && (
            <div className={clsx('rounded-xl px-4 py-3 text-[11px]', gratuityCalc.eligible?'bg-green-50 border border-green-100':'bg-slate-50 border border-slate-100')}>
              Years of service: <strong>{gratuityCalc.years_of_service}</strong> ·
              Gratuity: <strong>₹{inr(gratuityCalc.gratuity_amount)}</strong> ·
              {gratuityCalc.eligible ? <span className="text-green-700"> Eligible</span> : <span className="text-slate-500"> Not eligible (&lt;5 years)</span>}
              {gratuityCalc.eligible && (
                <button onClick={()=>{set('gratuity_eligible',true);set('gratuity_amount',gratuityCalc.gratuity_amount);}}
                  className="ml-2 underline text-blue-600">Apply</button>
              )}
            </div>
          )}

          {/* Notice */}
          <div className="grid grid-cols-4 gap-3">
            {[['Notice Period (days)','notice_period_days'],['Served (days)','notice_served_days'],['Recovery (days)','notice_recovery_days'],['Recovery Amt','notice_recovery_amount']].map(([l,k])=>(
              <div key={k}><label className="block text-[11px] text-slate-500 mb-1">{l}</label>
                <input type="number" value={f[k]} onChange={e=>set(k,e.target.value)} className={INP} /></div>
            ))}
          </div>

          {/* Earnings */}
          <div className="bg-green-50/50 rounded-xl p-3">
            <div className="text-[11px] font-semibold text-green-800 mb-2">Earnings</div>
            <div className="grid grid-cols-4 gap-3">
              {[['Days Payable','days_payable'],['Basic for Days','basic_for_days'],['EL Days','earned_leave_days'],['EL Amount','earned_leave_amount']].map(([l,k])=>(
                <div key={k}><label className="block text-[11px] text-slate-500 mb-1">{l}</label>
                  <input type="number" step="0.01" value={f[k]} onChange={e=>set(k,e.target.value)} className={INP} /></div>
              ))}
              <div className="flex items-center gap-2 col-span-2">
                <label className="flex items-center gap-2 text-xs cursor-pointer">
                  <input type="checkbox" checked={f.gratuity_eligible} onChange={e=>set('gratuity_eligible',e.target.checked)} className="w-4 h-4 rounded" />
                  Gratuity Eligible
                </label>
                <div className="flex-1"><input type="number" step="0.01" value={f.gratuity_amount} onChange={e=>set('gratuity_amount',e.target.value)} placeholder="Gratuity Amt" className={INP} /></div>
              </div>
              {[['Bonus','bonus_amount'],['Arrears','arrears']].map(([l,k])=>(
                <div key={k}><label className="block text-[11px] text-slate-500 mb-1">{l}</label>
                  <input type="number" step="0.01" value={f[k]} onChange={e=>set(k,e.target.value)} className={INP} /></div>
              ))}
            </div>
            <div className="text-right text-xs mt-2 font-semibold text-green-700">Gross Earnings: ₹{inr(grossEarnings)}</div>
          </div>

          {/* Deductions */}
          <div className="bg-red-50/50 rounded-xl p-3">
            <div className="text-[11px] font-semibold text-red-800 mb-2">Deductions</div>
            <div className="grid grid-cols-4 gap-3">
              {[['PF (Employee)','pf_employee_deduction'],['ESI (Employee)','esi_employee_deduction'],['Prof Tax','pt_deduction'],['TDS','tds_deduction'],['Loan Recovery','loan_recovery'],['Advance Recovery','advance_recovery'],['Other Deductions','other_deductions']].map(([l,k])=>(
                <div key={k}><label className="block text-[11px] text-slate-500 mb-1">{l}</label>
                  <input type="number" step="0.01" value={f[k]} onChange={e=>set(k,e.target.value)} className={INP} /></div>
              ))}
              <div className="col-span-4"><label className="block text-[11px] text-slate-500 mb-1">Other Deduction Remarks</label>
                <input value={f.other_deduction_remarks} onChange={e=>set('other_deduction_remarks',e.target.value)} className={INP} /></div>
            </div>
            <div className="text-right text-xs mt-2 font-semibold text-red-700">Total Deductions: ₹{inr(totalDeductions)}</div>
          </div>

          {/* Net */}
          <div className={clsx('rounded-xl px-5 py-4 text-center', netPayable>=0?'bg-blue-50 border border-blue-100':'bg-orange-50 border border-orange-100')}>
            <div className="text-xs text-slate-500">Net Payable to Employee</div>
            <div className={clsx('text-2xl font-bold mt-1', netPayable>=0?'text-blue-700':'text-orange-600')}>
              ₹{inr(netPayable)}
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 px-5 py-3 border-t">
          <button onClick={onClose} className="h-9 px-4 rounded-xl border text-xs">Cancel</button>
          <button onClick={()=>mut.mutate(f)} disabled={mut.isPending||!f.employee_id} className="h-9 px-5 rounded-xl bg-blue-600 text-white text-xs font-semibold disabled:opacity-50">
            {mut.isPending?'Saving…':'Create FnF'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function FnFSettlementPage() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);

  const { data: list=[] } = useQuery({ queryKey:['hr-fnf'], queryFn:()=>hrFnfAPI.list().then(r=>r.data?.data||[]) });
  const { data: employees=[] } = useQuery({ queryKey:['hr-employees-active'], queryFn:()=>hrEmployeesAPI.list({ is_active:true, limit:500 }).then(r=>r.data?.data||[]) });

  const approve = useMutation({ mutationFn:id=>hrFnfAPI.approve(id), onSuccess:()=>{ toast.success('Approved'); qc.invalidateQueries({queryKey:['hr-fnf']}); } });

  return (
    <div className="h-full flex flex-col overflow-hidden bg-[#f5f6fa]">
      <PageHeader title="Full & Final Settlement" subtitle="Exit payroll — gratuity, leave encashment, notice recovery"
        breadcrumbs={[{label:'HR & Admin'},{label:'Full & Final'}]}
        actions={<button onClick={()=>setShowForm(true)} className="h-9 px-4 rounded-xl bg-blue-600 text-white text-xs font-semibold flex items-center gap-2"><Plus size={14}/> New Settlement</button>}
      />
      <div className="flex-1 overflow-auto p-5">
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden max-w-6xl">
          <table className="w-full text-xs">
            <thead className="bg-slate-50">
              <tr>{['Employee','Last Day','Exit Reason','Gross Earnings','Total Deductions','Net Payable','Status','Actions'].map(h=>(
                <th key={h} className="px-4 py-3 text-left font-semibold text-slate-500">{h}</th>
              ))}</tr>
            </thead>
            <tbody>
              {list.map(r=>{
                const color = STATUS_COLORS[r.status]||'slate';
                return (
                  <tr key={r.id} className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-black">{r.full_name} <span className="text-slate-400">({r.emp_code})</span></td>
                    <td className="px-4 py-3">{dayjs(r.last_working_day).format('DD-MM-YYYY')}</td>
                    <td className="px-4 py-3 capitalize">{r.exit_reason?.replace(/_/g,' ')}</td>
                    <td className="px-4 py-3 text-green-700 font-medium">₹{inr(r.gross_earnings)}</td>
                    <td className="px-4 py-3 text-red-600">₹{inr(r.total_deductions)}</td>
                    <td className="px-4 py-3 font-bold text-blue-700">₹{inr(r.net_payable)}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold bg-${color}-100 text-${color}-700 capitalize`}>{r.status}</span>
                    </td>
                    <td className="px-4 py-3">
                      {r.status==='draft' && (
                        <button onClick={()=>approve.mutate(r.id)} className="text-[10px] px-2 py-0.5 bg-green-100 text-green-700 rounded font-semibold">Approve</button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {list.length===0 && <tr><td colSpan={8} className="py-12 text-center text-slate-400">No settlements yet</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
      {showForm && <FnFForm onClose={()=>setShowForm(false)} onSaved={()=>qc.invalidateQueries({queryKey:['hr-fnf']})} employees={employees} />}
    </div>
  );
}
