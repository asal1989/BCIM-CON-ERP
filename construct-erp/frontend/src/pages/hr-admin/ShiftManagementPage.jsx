// ShiftManagementPage.jsx — Shift Master, Employee Shift Assignment, OT, Comp-off
import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, X, Pencil, Trash2, Clock, Users, CheckCircle2, XCircle } from 'lucide-react';
import { clsx } from 'clsx';
import dayjs from 'dayjs';
import toast from 'react-hot-toast';
import { hrShiftsAPI, hrEmployeesAPI } from '../../api/client';
import { PageHeader } from '../../theme';
import { FIELD_HL } from '../../constants/fieldStyles';

const INP = `w-full h-9 rounded-lg px-3 text-xs font-medium outline-none transition-all border ${FIELD_HL}`;
const TABS = ['Shifts','Employee Assignment','Overtime','Comp-off'];
const OT_STATUS = { pending:'yellow', approved:'green', rejected:'red', paid:'blue' };

function ShiftForm({ shift, onClose, onSaved }) {
  const isEdit = !!shift;
  const [f, setF] = useState(shift || { name:'', code:'', start_time:'09:00', end_time:'18:00', break_minutes:60, is_night_shift:false, grace_minutes:10, ot_after_minutes:0 });
  const set = (k,v) => setF(p=>({...p,[k]:v}));
  const mut = useMutation({
    mutationFn: d => isEdit ? hrShiftsAPI.updateShift(shift.id, d) : hrShiftsAPI.createShift(d),
    onSuccess: () => { toast.success(isEdit?'Shift updated':'Shift created'); onSaved(); onClose(); },
    onError: e => toast.error(e?.response?.data?.error||'Failed'),
  });
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h3 className="text-sm font-semibold">{isEdit?'Edit Shift':'New Shift'}</h3>
          <button onClick={onClose}><X size={16} /></button>
        </div>
        <div className="p-5 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-[11px] text-slate-500 mb-1">Shift Name *</label>
              <input value={f.name} onChange={e=>set('name',e.target.value)} className={INP} /></div>
            <div><label className="block text-[11px] text-slate-500 mb-1">Code</label>
              <input value={f.code||''} onChange={e=>set('code',e.target.value)} placeholder="GEN/A/B" className={INP} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-[11px] text-slate-500 mb-1">Start Time *</label>
              <input type="time" value={f.start_time} onChange={e=>set('start_time',e.target.value)} className={INP} /></div>
            <div><label className="block text-[11px] text-slate-500 mb-1">End Time *</label>
              <input type="time" value={f.end_time} onChange={e=>set('end_time',e.target.value)} className={INP} /></div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div><label className="block text-[11px] text-slate-500 mb-1">Break (mins)</label>
              <input type="number" value={f.break_minutes} onChange={e=>set('break_minutes',e.target.value)} className={INP} /></div>
            <div><label className="block text-[11px] text-slate-500 mb-1">Grace (mins)</label>
              <input type="number" value={f.grace_minutes} onChange={e=>set('grace_minutes',e.target.value)} className={INP} /></div>
            <div><label className="block text-[11px] text-slate-500 mb-1">OT after (mins)</label>
              <input type="number" value={f.ot_after_minutes} onChange={e=>set('ot_after_minutes',e.target.value)} className={INP} /></div>
          </div>
          <label className="flex items-center gap-2 text-xs cursor-pointer">
            <input type="checkbox" checked={f.is_night_shift} onChange={e=>set('is_night_shift',e.target.checked)} className="w-4 h-4 rounded" />
            Night Shift
          </label>
        </div>
        <div className="flex justify-end gap-2 px-5 py-3 border-t">
          <button onClick={onClose} className="h-9 px-4 rounded-xl border text-xs">Cancel</button>
          <button onClick={()=>mut.mutate(f)} disabled={mut.isPending} className="h-9 px-5 rounded-xl bg-blue-600 text-white text-xs font-semibold disabled:opacity-50">
            {mut.isPending?'Saving…':isEdit?'Update':'Create'}
          </button>
        </div>
      </div>
    </div>
  );
}

function AssignShiftForm({ shifts, employees, onClose, onSaved }) {
  const [f, setF] = useState({ employee_id:'', shift_id:'', effective_from: dayjs().format('YYYY-MM-DD'), effective_to:'' });
  const set = (k,v) => setF(p=>({...p,[k]:v}));
  const mut = useMutation({
    mutationFn: d => hrShiftsAPI.assignShift(d),
    onSuccess: () => { toast.success('Shift assigned'); onSaved(); onClose(); },
    onError: e => toast.error(e?.response?.data?.error || 'Failed'),
  });
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h3 className="text-sm font-semibold">Assign Shift to Employee</h3>
          <button onClick={onClose}><X size={16}/></button>
        </div>
        <div className="p-5 space-y-3">
          <div>
            <label className="block text-[11px] text-slate-500 mb-1">Employee *</label>
            <select value={f.employee_id} onChange={e=>set('employee_id',e.target.value)} className={INP}>
              <option value="">Select employee…</option>
              {employees.map(e=><option key={e.id} value={e.id}>{e.full_name||e.name} ({e.employee_code||e.emp_code})</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[11px] text-slate-500 mb-1">Shift *</label>
            <select value={f.shift_id} onChange={e=>set('shift_id',e.target.value)} className={INP}>
              <option value="">Select shift…</option>
              {shifts.map(s=><option key={s.id} value={s.id}>{s.name} {s.code ? `(${s.code})` : ''} · {s.start_time}–{s.end_time}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] text-slate-500 mb-1">Effective From *</label>
              <input type="date" value={f.effective_from} onChange={e=>set('effective_from',e.target.value)} className={INP} />
            </div>
            <div>
              <label className="block text-[11px] text-slate-500 mb-1">Effective To (optional)</label>
              <input type="date" value={f.effective_to} onChange={e=>set('effective_to',e.target.value)} className={INP} />
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 px-5 py-3 border-t">
          <button onClick={onClose} className="h-9 px-4 rounded-xl border text-xs">Cancel</button>
          <button onClick={()=>mut.mutate(f)} disabled={mut.isPending||!f.employee_id||!f.shift_id}
            className="h-9 px-5 rounded-xl bg-blue-600 text-white text-xs font-semibold disabled:opacity-50">
            {mut.isPending ? 'Assigning…' : 'Assign Shift'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ShiftManagementPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState('Shifts');
  const [showForm, setShowForm] = useState(false);
  const [showAssign, setShowAssign] = useState(false);
  const [editItem, setEditItem] = useState(null);

  const { data: shifts=[] } = useQuery({ queryKey:['hr-shifts'], queryFn:()=>hrShiftsAPI.shifts().then(r=>r.data?.data||[]) });
  const { data: employees=[] } = useQuery({ queryKey:['hr-employees-active'], queryFn:()=>hrEmployeesAPI.list({ is_active:true, limit:500 }).then(r=>r.data?.data||[]) });
  const { data: overtime=[] } = useQuery({ queryKey:['hr-ot'], queryFn:()=>hrShiftsAPI.overtime().then(r=>r.data?.data||[]) });
  const { data: compoff=[] } = useQuery({ queryKey:['hr-compoff'], queryFn:()=>hrShiftsAPI.compOff().then(r=>r.data?.data||[]) });
  const { data: empShifts=[] } = useQuery({ queryKey:['hr-emp-shifts'], queryFn:()=>hrShiftsAPI.empShifts().then(r=>r.data?.data||[]) });

  const err = e => toast.error(e?.response?.data?.error||'Action failed');
  const deleteMut = useMutation({
    mutationFn: id => hrShiftsAPI.deleteShift(id),
    onSuccess: ()=>{ toast.success('Deleted'); qc.invalidateQueries({queryKey:['hr-shifts']}); },
    onError: err,
  });
  const approveOT  = useMutation({ mutationFn:id=>hrShiftsAPI.approveOT(id),      onSuccess:()=>{ toast.success('OT Approved');         qc.invalidateQueries({queryKey:['hr-ot']}); },       onError:err });
  const rejectOT   = useMutation({ mutationFn:id=>hrShiftsAPI.rejectOT(id),        onSuccess:()=>{ toast.success('OT Rejected');          qc.invalidateQueries({queryKey:['hr-ot']}); },       onError:err });
  const approveComp   = useMutation({ mutationFn:id=>hrShiftsAPI.approveCompOff(id), onSuccess:()=>{ toast.success('Comp-off Approved'); qc.invalidateQueries({queryKey:['hr-compoff']}); }, onError:err });
  const removeShiftMut = useMutation({ mutationFn:id=>hrShiftsAPI.removeShift(id),  onSuccess:()=>{ toast.success('Assignment removed'); qc.invalidateQueries({queryKey:['hr-emp-shifts']}); }, onError:err });

  const refresh = () => { qc.invalidateQueries({queryKey:['hr-shifts']}); };

  return (
    <div className="h-full flex flex-col overflow-hidden bg-[#f5f6fa]">
      <PageHeader title="Shift Management" subtitle="Shifts · Overtime · Comp-off"
        breadcrumbs={[{label:'HR & Admin'},{label:'Shift Management'}]}
        actions={
          tab==='Shifts' ? (
            <button onClick={()=>{setEditItem(null);setShowForm(true);}} className="h-9 px-4 rounded-xl bg-blue-600 text-white text-xs font-semibold flex items-center gap-2">
              <Plus size={14}/> New Shift
            </button>
          ) : tab==='Employee Assignment' ? (
            <button onClick={()=>setShowAssign(true)} className="h-9 px-4 rounded-xl bg-blue-600 text-white text-xs font-semibold flex items-center gap-2">
              <Plus size={14}/> Assign Shift
            </button>
          ) : null
        }
      />

      <div className="flex gap-1 px-5 pt-3 bg-white border-b flex-shrink-0">
        {TABS.map(t=>(
          <button key={t} onClick={()=>setTab(t)}
            className={clsx('px-4 py-2 text-xs font-medium rounded-t-lg border-b-2 -mb-px',
              tab===t?'border-blue-600 text-blue-700':'border-transparent text-slate-500 hover:text-slate-700')}>
            {t}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-auto p-5">

        {/* SHIFTS TAB */}
        {tab==='Shifts' && (
          <div className="grid grid-cols-1 gap-3 max-w-4xl">
            {shifts.map(s=>(
              <div key={s.id} className="bg-white rounded-xl border border-slate-200 px-5 py-4 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
                    <Clock size={18} className="text-blue-600" />
                  </div>
                  <div>
                    <div className="font-semibold text-sm text-slate-800">{s.name} {s.code && <span className="text-slate-400 font-normal">({s.code})</span>}</div>
                    <div className="text-xs text-slate-500">{s.start_time} – {s.end_time} · Break {s.break_minutes}m · Grace {s.grace_minutes}m {s.is_night_shift&&'· Night'}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={clsx('px-2 py-0.5 rounded-full text-[10px] font-semibold', s.active?'bg-green-100 text-green-700':'bg-slate-100 text-slate-500')}>
                    {s.active?'Active':'Inactive'}
                  </span>
                  <button onClick={()=>{setEditItem(s);setShowForm(true);}} className="w-7 h-7 rounded-lg hover:bg-slate-100 flex items-center justify-center">
                    <Pencil size={13} className="text-slate-500" />
                  </button>
                  <button onClick={()=>{if(window.confirm('Delete shift?'))deleteMut.mutate(s.id);}} className="w-7 h-7 rounded-lg hover:bg-red-50 flex items-center justify-center">
                    <Trash2 size={13} className="text-red-400" />
                  </button>
                </div>
              </div>
            ))}
            {shifts.length===0 && <div className="text-center py-16 text-slate-400 text-sm">No shifts created yet</div>}
          </div>
        )}

        {/* EMPLOYEE ASSIGNMENT TAB */}
        {tab==='Employee Assignment' && (
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden max-w-5xl">
            <table className="w-full text-xs">
              <thead className="bg-slate-50"><tr>
                {['Employee','Shift','Start Time','End Time','Effective From','Effective To',''].map(h=>(
                  <th key={h} className="px-4 py-3 text-left font-semibold text-slate-500">{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {empShifts.map(es=>(
                  <tr key={es.id} className="border-t border-slate-100">
                    <td className="px-4 py-3 font-medium text-slate-800">{es.employee_name} <span className="text-slate-400">({es.emp_code})</span></td>
                    <td className="px-4 py-3">{es.shift_name}</td>
                    <td className="px-4 py-3 font-mono">{es.start_time}</td>
                    <td className="px-4 py-3 font-mono">{es.end_time}</td>
                    <td className="px-4 py-3">{dayjs(es.effective_from).format('DD-MM-YYYY')}</td>
                    <td className="px-4 py-3">{es.effective_to ? dayjs(es.effective_to).format('DD-MM-YYYY') : '—'}</td>
                    <td className="px-4 py-3">
                      <button onClick={()=>{if(window.confirm('Remove this shift assignment?'))removeShiftMut.mutate(es.id);}}
                        className="w-6 h-6 rounded hover:bg-red-100 flex items-center justify-center">
                        <Trash2 size={12} className="text-red-400"/>
                      </button>
                    </td>
                  </tr>
                ))}
                {empShifts.length===0 && <tr><td colSpan={7} className="px-4 py-12 text-center text-slate-400">No shift assignments yet. Click "Assign Shift" to assign a shift to an employee.</td></tr>}
              </tbody>
            </table>
          </div>
        )}

        {/* OVERTIME TAB */}
        {tab==='Overtime' && (
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden max-w-5xl">
            <table className="w-full text-xs">
              <thead className="bg-slate-50"><tr>
                {['Employee','Date','OT Hours','Multiplier','Amount','Status','Actions'].map(h=>(
                  <th key={h} className="px-4 py-3 text-left font-semibold text-slate-500">{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {overtime.map(o=>(
                  <tr key={o.id} className="border-t border-slate-100">
                    <td className="px-4 py-3 font-medium">{o.full_name} <span className="text-slate-400">({o.emp_code})</span></td>
                    <td className="px-4 py-3">{dayjs(o.ot_date).format('DD-MM-YYYY')}</td>
                    <td className="px-4 py-3 font-mono font-semibold">{o.ot_hours}h</td>
                    <td className="px-4 py-3">{o.ot_rate_multiplier}×</td>
                    <td className="px-4 py-3">₹{Math.round(o.ot_amount).toLocaleString('en-IN')}</td>
                    <td className="px-4 py-3">
                      <span className={clsx('px-2 py-0.5 rounded-full text-[10px] font-semibold capitalize',
                        o.status==='approved'?'bg-green-100 text-green-700':o.status==='rejected'?'bg-red-100 text-red-700':o.status==='paid'?'bg-blue-100 text-blue-700':'bg-yellow-100 text-yellow-700')}>
                        {o.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {o.status==='pending' && (
                        <div className="flex gap-1">
                          <button onClick={()=>approveOT.mutate(o.id)} className="w-6 h-6 rounded hover:bg-green-100 flex items-center justify-center">
                            <CheckCircle2 size={13} className="text-green-600" />
                          </button>
                          <button onClick={()=>rejectOT.mutate(o.id)} className="w-6 h-6 rounded hover:bg-red-100 flex items-center justify-center">
                            <XCircle size={13} className="text-red-500" />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
                {overtime.length===0 && <tr><td colSpan={7} className="px-4 py-12 text-center text-slate-400">No overtime records</td></tr>}
              </tbody>
            </table>
          </div>
        )}

        {/* COMP-OFF TAB */}
        {tab==='Comp-off' && (
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden max-w-5xl">
            <table className="w-full text-xs">
              <thead className="bg-slate-50"><tr>
                {['Employee','Worked On','Reason','Expiry','Status','Actions'].map(h=>(
                  <th key={h} className="px-4 py-3 text-left font-semibold text-slate-500">{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {compoff.map(c=>(
                  <tr key={c.id} className="border-t border-slate-100">
                    <td className="px-4 py-3 font-medium">{c.full_name}</td>
                    <td className="px-4 py-3">{dayjs(c.worked_on).format('DD-MM-YYYY')}</td>
                    <td className="px-4 py-3 text-slate-600">{c.reason||'—'}</td>
                    <td className="px-4 py-3">{c.expiry_date?dayjs(c.expiry_date).format('DD-MM-YYYY'):'—'}</td>
                    <td className="px-4 py-3">
                      <span className={clsx('px-2 py-0.5 rounded-full text-[10px] font-semibold capitalize',
                        c.status==='available'?'bg-green-100 text-green-700':c.status==='used'?'bg-blue-100 text-blue-700':c.status==='expired'?'bg-slate-100 text-slate-500':'bg-yellow-100 text-yellow-700')}>
                        {c.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {c.status==='pending' && (
                        <button onClick={()=>approveComp.mutate(c.id)} className="text-[10px] px-2 py-0.5 bg-green-100 text-green-700 rounded font-semibold">Approve</button>
                      )}
                    </td>
                  </tr>
                ))}
                {compoff.length===0 && <tr><td colSpan={6} className="px-4 py-12 text-center text-slate-400">No comp-off records</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showForm && (
        <ShiftForm shift={editItem} onClose={()=>{setShowForm(false);setEditItem(null);}} onSaved={refresh} />
      )}
      {showAssign && (
        <AssignShiftForm shifts={shifts} employees={employees} onClose={()=>setShowAssign(false)} onSaved={()=>qc.invalidateQueries({queryKey:['hr-emp-shifts']})} />
      )}
    </div>
  );
}
