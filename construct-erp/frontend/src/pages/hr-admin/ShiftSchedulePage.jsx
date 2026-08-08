import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { CalendarCheck, Plus, Search, Edit2, Trash2, X, Save } from 'lucide-react';
import toast from 'react-hot-toast';
import { hrShiftsAPI, hrMastersAPI } from '../../api/client';

const B = { navy:'#0A1F5C' };
const fade = (d=0) => ({ initial:{opacity:0,y:14}, animate:{opacity:1,y:0}, transition:{duration:0.35,delay:d} });
const inp = 'w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-900 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50 transition-all';
const lbl = 'text-xs font-black text-gray-600 uppercase tracking-wide block mb-1.5';

const BLANK = { schedule_name:'', shift_id:'', department_id:'', from_date:'', to_date:'' };

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
      <motion.div initial={{opacity:0,scale:0.97}} animate={{opacity:1,scale:1}} transition={{duration:0.2}}
        className="w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden">
        <div className="px-6 py-4 flex items-center justify-between" style={{background:'linear-gradient(135deg,#0A1F5C,#1e3a8a)'}}>
          <h2 className="text-sm font-black text-white">{title}</h2>
          <button onClick={onClose} className="p-1.5 text-white/60 hover:text-white hover:bg-white/10 rounded-lg transition"><X className="w-4 h-4"/></button>
        </div>
        <div className="px-6 py-5">{children}</div>
      </motion.div>
    </div>
  );
}

const STATUS_COLOR = { Active:'bg-green-50 text-green-700', Upcoming:'bg-amber-50 text-amber-700', Expired:'bg-gray-100 text-gray-500' };

export default function ShiftSchedulePage() {
  const qc = useQueryClient();
  const [search, setSearch]       = useState('');
  const [modal, setModal]         = useState(null);
  const [form, setForm]           = useState(BLANK);

  const { data: schedules, isLoading } = useQuery({
    queryKey: ['shift-schedules'],
    queryFn: () => hrShiftsAPI.shiftSchedules().then(r => r.data?.data || []),
  });
  const { data: shifts } = useQuery({ queryKey: ['hr-shifts'], queryFn: () => hrShiftsAPI.shifts().then(r => r.data?.data || []) });
  const { data: depts }  = useQuery({ queryKey: ['hr-departments'], queryFn: () => hrMastersAPI.listDepts().then(r => r.data?.data || []) });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['shift-schedules'] });
  const createMut = useMutation({ mutationFn: (d) => hrShiftsAPI.createShiftSchedule(d), onSuccess: () => { invalidate(); toast.success('Schedule created'); }, onError: (e) => toast.error(e.response?.data?.error || 'Failed to create schedule') });
  const updateMut = useMutation({ mutationFn: ({id,d}) => hrShiftsAPI.updateShiftSchedule(id,d), onSuccess: () => { invalidate(); toast.success('Schedule updated'); }, onError: (e) => toast.error(e.response?.data?.error || 'Failed to update schedule') });
  const deleteMut = useMutation({ mutationFn: (id) => hrShiftsAPI.deleteShiftSchedule(id), onSuccess: () => { invalidate(); toast.success('Deleted'); }, onError: (e) => toast.error(e.response?.data?.error || 'Failed to delete') });

  const list = schedules || [];
  const filtered = list.filter(s=>s.schedule_name.toLowerCase().includes(search.toLowerCase())||(s.department_name||'').toLowerCase().includes(search.toLowerCase()));
  const set = (k,v) => setForm(p=>({...p,[k]:v}));
  const openAdd  = () => { setForm(BLANK); setModal('add'); };
  const openEdit = (s) => { setForm({ schedule_name:s.schedule_name, shift_id:s.shift_id||'', department_id:s.department_id||'', from_date:s.from_date?.slice(0,10), to_date:s.to_date?.slice(0,10) }); setModal(s); };
  const close    = () => setModal(null);

  const save = () => {
    if(!form.schedule_name||!form.shift_id||!form.from_date||!form.to_date){ toast.error('All fields required'); return; }
    if(modal==='add') createMut.mutate(form);
    else updateMut.mutate({ id: modal.id, d: form });
    close();
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <motion.div {...fade(0)}>
        <div className="rounded-2xl mb-6 p-6 flex items-center justify-between"
          style={{background:`linear-gradient(135deg,${B.navy},#1e3a8a)`}}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center"><CalendarCheck className="w-5 h-5 text-white"/></div>
            <div>
              <h1 className="text-lg font-black text-white">Employees Shift Schedule</h1>
              <p className="text-xs text-blue-200">Period-based shift assignments</p>
            </div>
          </div>
          <button onClick={openAdd} className="flex items-center gap-2 px-4 py-2 bg-yellow-400 hover:bg-yellow-300 text-gray-900 text-sm font-black rounded-xl transition">
            <Plus className="w-4 h-4"/> New Schedule
          </button>
        </div>

        <div className="relative mb-4">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"/>
          <input className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-blue-400"
            placeholder="Search schedules..." value={search} onChange={e=>setSearch(e.target.value)}/>
        </div>

        <motion.div {...fade(0.05)} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                {['Schedule','Department','Shift','From','To','Employees','Status',''].map(h=>(
                  <th key={h} className="text-left px-4 py-3 text-xs font-black text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading && <tr><td colSpan={8} className="text-center py-12 text-gray-400 text-sm">Loading…</td></tr>}
              {!isLoading && filtered.map((s,i)=>(
                <tr key={s.id} className={`border-b border-gray-50 hover:bg-blue-50/30 transition-colors ${i%2?'bg-gray-50/30':''}`}>
                  <td className="px-4 py-3 font-semibold text-gray-800">{s.schedule_name}</td>
                  <td className="px-4 py-3 text-gray-600">{s.department_name || 'All Departments'}</td>
                  <td className="px-4 py-3 text-gray-600 text-xs">{s.shift_name || '—'}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{s.from_date?.slice(0,10)}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{s.to_date?.slice(0,10)}</td>
                  <td className="px-4 py-3"><span className="bg-blue-50 text-blue-700 text-xs font-bold px-2.5 py-1 rounded-full">{s.employees}</span></td>
                  <td className="px-4 py-3"><span className={`text-xs font-bold px-2.5 py-1 rounded-full ${STATUS_COLOR[s.status]||'bg-gray-100 text-gray-500'}`}>{s.status}</span></td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1.5">
                      <button onClick={()=>openEdit(s)} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition"><Edit2 className="w-3.5 h-3.5"/></button>
                      <button onClick={()=>deleteMut.mutate(s.id)}   className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition"><Trash2 className="w-3.5 h-3.5"/></button>
                    </div>
                  </td>
                </tr>
              ))}
              {!isLoading && !filtered.length && <tr><td colSpan={8} className="text-center py-12 text-gray-400 text-sm">No schedules found</td></tr>}
            </tbody>
          </table>
        </motion.div>
      </motion.div>

      {modal && (
        <Modal title={modal==='add'?'New Schedule':'Edit Schedule'} onClose={close}>
          <div className="space-y-4">
            <div><label className={lbl}>Schedule Name</label><input className={inp} value={form.schedule_name} onChange={e=>set('schedule_name',e.target.value)}/></div>
            <div><label className={lbl}>Department</label>
              <select className={inp} value={form.department_id} onChange={e=>set('department_id',e.target.value)}>
                <option value="">All Departments</option>
                {(depts||[]).map(d=><option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
            <div><label className={lbl}>Shift</label>
              <select className={inp} value={form.shift_id} onChange={e=>set('shift_id',e.target.value)}>
                <option value="">Select…</option>
                {(shifts||[]).map(s=><option key={s.id} value={s.id}>{s.name} ({s.start_time?.slice(0,5)}–{s.end_time?.slice(0,5)})</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className={lbl}>From</label><input type="date" className={inp} value={form.from_date} onChange={e=>set('from_date',e.target.value)}/></div>
              <div><label className={lbl}>To</label><input type="date" className={inp} value={form.to_date} onChange={e=>set('to_date',e.target.value)}/></div>
            </div>
            <div className="flex gap-3 pt-2">
              <button onClick={close} className="flex-1 py-2.5 border border-gray-200 text-gray-600 font-semibold rounded-xl hover:bg-gray-50 transition text-sm">Cancel</button>
              <button onClick={save} className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-black rounded-xl transition text-sm flex items-center justify-center gap-2">
                <Save className="w-4 h-4"/> Save
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
