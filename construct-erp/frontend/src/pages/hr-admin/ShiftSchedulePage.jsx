import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { CalendarCheck, Plus, Search, Edit2, Trash2, X, Save } from 'lucide-react';
import toast from 'react-hot-toast';

const B = { navy:'#0A1F5C' };
const fade = (d=0) => ({ initial:{opacity:0,y:14}, animate:{opacity:1,y:0}, transition:{duration:0.35,delay:d} });
const inp = 'w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-900 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50 transition-all';
const lbl = 'text-xs font-black text-gray-600 uppercase tracking-wide block mb-1.5';

const INIT = [
  { id:1, schedule:'Q1 2026 – Site A', dept:'Site Operations', shift:'Morning (06:00–14:00)', from:'2026-01-01', to:'2026-03-31', employees:18, status:'Active'   },
  { id:2, schedule:'Q1 2026 – Admin',  dept:'Administration',  shift:'General (09:00–18:00)', from:'2026-01-01', to:'2026-03-31', employees:12, status:'Active'   },
  { id:3, schedule:'Q2 2026 – Site A', dept:'Site Operations', shift:'Morning (06:00–14:00)', from:'2026-04-01', to:'2026-06-30', employees:20, status:'Upcoming' },
  { id:4, schedule:'Q2 2026 – Site B', dept:'Site B Team',     shift:'Evening (14:00–22:00)', from:'2026-04-01', to:'2026-06-30', employees:14, status:'Upcoming' },
];

const BLANK = { schedule:'', dept:'', shift:'General (09:00–18:00)', from:'', to:'', employees:'', status:'Active' };
const SHIFTS = ['General (09:00–18:00)','Morning (06:00–14:00)','Evening (14:00–22:00)','Night (22:00–06:00)'];

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
  const [schedules, setSchedules] = useState(INIT);
  const [search, setSearch]       = useState('');
  const [modal, setModal]         = useState(null);
  const [form, setForm]           = useState(BLANK);

  const filtered = schedules.filter(s=>s.schedule.toLowerCase().includes(search.toLowerCase())||s.dept.toLowerCase().includes(search.toLowerCase()));
  const set = (k,v) => setForm(p=>({...p,[k]:v}));
  const openAdd  = () => { setForm(BLANK); setModal('add'); };
  const openEdit = (s) => { setForm({...s}); setModal(s); };
  const close    = () => setModal(null);

  const save = () => {
    if(!form.schedule||!form.dept||!form.from||!form.to){ toast.error('All fields required'); return; }
    if(modal==='add'){
      setSchedules(p=>[...p,{...form,id:Date.now(),employees:parseInt(form.employees)||0}]);
      toast.success('Schedule created');
    } else {
      setSchedules(p=>p.map(s=>s.id===modal.id?{...form,id:modal.id,employees:parseInt(form.employees)||0}:s));
      toast.success('Schedule updated');
    }
    close();
  };

  const del = (id) => { setSchedules(p=>p.filter(s=>s.id!==id)); toast.success('Deleted'); };

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
              {filtered.map((s,i)=>(
                <tr key={s.id} className={`border-b border-gray-50 hover:bg-blue-50/30 transition-colors ${i%2?'bg-gray-50/30':''}`}>
                  <td className="px-4 py-3 font-semibold text-gray-800">{s.schedule}</td>
                  <td className="px-4 py-3 text-gray-600">{s.dept}</td>
                  <td className="px-4 py-3 text-gray-600 text-xs">{s.shift}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{s.from}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{s.to}</td>
                  <td className="px-4 py-3"><span className="bg-blue-50 text-blue-700 text-xs font-bold px-2.5 py-1 rounded-full">{s.employees}</span></td>
                  <td className="px-4 py-3"><span className={`text-xs font-bold px-2.5 py-1 rounded-full ${STATUS_COLOR[s.status]||'bg-gray-100 text-gray-500'}`}>{s.status}</span></td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1.5">
                      <button onClick={()=>openEdit(s)} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition"><Edit2 className="w-3.5 h-3.5"/></button>
                      <button onClick={()=>del(s.id)}   className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition"><Trash2 className="w-3.5 h-3.5"/></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </motion.div>
      </motion.div>

      {modal && (
        <Modal title={modal==='add'?'New Schedule':'Edit Schedule'} onClose={close}>
          <div className="space-y-4">
            <div><label className={lbl}>Schedule Name</label><input className={inp} value={form.schedule} onChange={e=>set('schedule',e.target.value)}/></div>
            <div><label className={lbl}>Department</label><input className={inp} value={form.dept} onChange={e=>set('dept',e.target.value)}/></div>
            <div><label className={lbl}>Shift</label>
              <select className={inp} value={form.shift} onChange={e=>set('shift',e.target.value)}>
                {SHIFTS.map(s=><option key={s}>{s}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className={lbl}>From</label><input type="date" className={inp} value={form.from} onChange={e=>set('from',e.target.value)}/></div>
              <div><label className={lbl}>To</label><input type="date" className={inp} value={form.to} onChange={e=>set('to',e.target.value)}/></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className={lbl}>No. of Employees</label><input type="number" className={inp} value={form.employees} onChange={e=>set('employees',e.target.value)}/></div>
              <div><label className={lbl}>Status</label>
                <select className={inp} value={form.status} onChange={e=>set('status',e.target.value)}>
                  <option>Active</option><option>Upcoming</option><option>Expired</option>
                </select>
              </div>
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
