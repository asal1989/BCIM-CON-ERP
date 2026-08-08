import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Clock, Search, Edit2, Save, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { hrShiftsAPI } from '../../api/client';

const B = { navy:'#0A1F5C' };
const fade = (d=0) => ({ initial:{opacity:0,y:14}, animate:{opacity:1,y:0}, transition:{duration:0.35,delay:d} });
const inp = 'w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-900 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50 transition-all';
const lbl = 'text-xs font-black text-gray-600 uppercase tracking-wide block mb-1.5';

const SHIFT_COLORS = ['bg-blue-50 text-blue-700 border-blue-200','bg-emerald-50 text-emerald-700 border-emerald-200','bg-amber-50 text-amber-700 border-amber-200','bg-violet-50 text-violet-700 border-violet-200','bg-rose-50 text-rose-700 border-rose-200'];
const shiftColor = (id) => id ? SHIFT_COLORS[[...String(id)].reduce((s,ch)=>s+ch.charCodeAt(0),0) % SHIFT_COLORS.length] : 'bg-gray-50 text-gray-500 border-gray-200';

function Modal({ emp, shifts, onClose, onSave, saving }) {
  const [shiftId, setShiftId] = useState(emp.shift_id || '');
  const [date,    setDate]    = useState(new Date().toISOString().split('T')[0]);
  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
      <motion.div initial={{opacity:0,scale:0.97}} animate={{opacity:1,scale:1}} transition={{duration:0.2}}
        className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden">
        <div className="px-6 py-4 flex items-center justify-between" style={{background:'linear-gradient(135deg,#0A1F5C,#1e3a8a)'}}>
          <div>
            <h2 className="text-sm font-black text-white">Change Shift — {emp.name}</h2>
            <p className="text-xs text-blue-200">{emp.emp_code} · {emp.dept}</p>
          </div>
          <button onClick={onClose} className="p-1.5 text-white/60 hover:text-white hover:bg-white/10 rounded-lg transition"><X className="w-4 h-4"/></button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div>
            <label className={lbl}>Current Shift</label>
            <div className="px-4 py-2.5 bg-blue-50 border border-blue-100 rounded-xl text-sm text-blue-800 font-medium">
              {emp.shift_name ? `${emp.shift_name} (${emp.start_time?.slice(0,5)}–${emp.end_time?.slice(0,5)})` : 'Unassigned'}
            </div>
          </div>
          <div>
            <label className={lbl}>New Shift</label>
            <select className={inp} value={shiftId} onChange={e=>setShiftId(e.target.value)}>
              <option value="">Select shift…</option>
              {shifts.map(s=><option key={s.id} value={s.id}>{s.name} ({s.start_time?.slice(0,5)}–{s.end_time?.slice(0,5)})</option>)}
            </select>
          </div>
          <div>
            <label className={lbl}>Effective From</label>
            <input type="date" className={inp} value={date} onChange={e=>setDate(e.target.value)}/>
          </div>
          <div className="flex gap-3 pt-2">
            <button onClick={onClose} className="flex-1 py-2.5 border border-gray-200 text-gray-600 font-semibold rounded-xl hover:bg-gray-50 transition text-sm">Cancel</button>
            <button disabled={saving || !shiftId} onClick={()=>onSave(emp.id,shiftId,date)}
              className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-black rounded-xl transition text-sm flex items-center justify-center gap-2 disabled:opacity-50">
              <Save className="w-4 h-4"/> Update Shift
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

export default function EmployeeShiftsPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState(null);

  const { data: emps, isLoading } = useQuery({
    queryKey: ['employee-shifts-current'],
    queryFn: () => hrShiftsAPI.currentShifts().then(r => r.data?.data || []),
  });
  const { data: shifts } = useQuery({
    queryKey: ['hr-shifts'],
    queryFn: () => hrShiftsAPI.shifts().then(r => r.data?.data || []),
  });

  const assignMut = useMutation({
    mutationFn: ({ employee_id, shift_id, effective_from }) => hrShiftsAPI.assignShift({ employee_id, shift_id, effective_from }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['employee-shifts-current'] }); toast.success('Shift updated successfully'); setEditing(null); },
    onError: (e) => toast.error(e.response?.data?.error || 'Failed to update shift'),
  });

  const filtered = (emps||[]).filter(e =>
    e.name.toLowerCase().includes(search.toLowerCase()) ||
    (e.emp_code||'').toLowerCase().includes(search.toLowerCase()) ||
    (e.dept||'').toLowerCase().includes(search.toLowerCase())
  );

  const save = (id, shiftId, date) => assignMut.mutate({ employee_id: id, shift_id: shiftId, effective_from: date });

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <motion.div {...fade(0)}>
        <div className="rounded-2xl mb-6 p-6 flex items-center justify-between"
          style={{background:`linear-gradient(135deg,${B.navy},#1e3a8a)`}}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center"><Clock className="w-5 h-5 text-white"/></div>
            <div>
              <h1 className="text-lg font-black text-white">Employees Shifts</h1>
              <p className="text-xs text-blue-200">Manage individual shift assignments</p>
            </div>
          </div>
        </div>

        <div className="relative mb-4">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"/>
          <input className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-blue-400"
            placeholder="Search employees..." value={search} onChange={e=>setSearch(e.target.value)}/>
        </div>

        <motion.div {...fade(0.05)} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                {['Emp Code','Name','Department','Current Shift','Effective From',''].map(h=>(
                  <th key={h} className="text-left px-4 py-3 text-xs font-black text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading && <tr><td colSpan={6} className="text-center py-12 text-gray-400 text-sm">Loading…</td></tr>}
              {!isLoading && filtered.map((e,i)=>(
                <tr key={e.id} className={`border-b border-gray-50 hover:bg-blue-50/30 transition-colors ${i%2?'bg-gray-50/30':''}`}>
                  <td className="px-4 py-3 font-black text-xs text-blue-700">{e.emp_code}</td>
                  <td className="px-4 py-3 font-semibold text-gray-800">{e.name}</td>
                  <td className="px-4 py-3 text-gray-600">{e.dept || '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${shiftColor(e.shift_id)}`}>
                      {e.shift_name ? `${e.shift_name} (${e.start_time?.slice(0,5)}–${e.end_time?.slice(0,5)})` : 'Unassigned'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{e.effective || '—'}</td>
                  <td className="px-4 py-3">
                    <button onClick={()=>setEditing(e)} className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-bold rounded-lg transition">
                      <Edit2 className="w-3 h-3"/> Change
                    </button>
                  </td>
                </tr>
              ))}
              {!isLoading && !filtered.length && <tr><td colSpan={6} className="text-center py-12 text-gray-400 text-sm">No employees found</td></tr>}
            </tbody>
          </table>
        </motion.div>
      </motion.div>

      {editing && <Modal emp={editing} shifts={shifts||[]} onClose={()=>setEditing(null)} onSave={save} saving={assignMut.isPending}/>}
    </div>
  );
}
