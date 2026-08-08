import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { MapPin, Plus, Search, Check, X as XIcon } from 'lucide-react';
import toast from 'react-hot-toast';
import { hrShiftsAPI } from '../../api/client';

const B = { navy:'#0A1F5C' };
const fade = (d=0) => ({ initial:{opacity:0,y:14}, animate:{opacity:1,y:0}, transition:{duration:0.35,delay:d} });
const inp = 'w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-900 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50 transition-all';
const lbl = 'text-xs font-black text-gray-600 uppercase tracking-wide block mb-1.5';

const STATUS_COLOR = { Pending:'bg-amber-50 text-amber-700', Approved:'bg-green-50 text-green-700', Rejected:'bg-red-50 text-red-600' };

const BLANK = { employee_id:'', entry_date:'', purpose:'', location:'', out_time:'', in_time:'' };

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
      <motion.div initial={{opacity:0,scale:0.97}} animate={{opacity:1,scale:1}} transition={{duration:0.2}}
        className="w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden">
        <div className="px-6 py-4 flex items-center justify-between" style={{background:'linear-gradient(135deg,#0A1F5C,#1e3a8a)'}}>
          <h2 className="text-sm font-black text-white">{title}</h2>
          <button onClick={onClose} className="p-1.5 text-white/60 hover:text-white hover:bg-white/10 rounded-lg transition"><XIcon className="w-4 h-4"/></button>
        </div>
        <div className="px-6 py-5">{children}</div>
      </motion.div>
    </div>
  );
}

export default function OutdoorEntriesPage() {
  const qc = useQueryClient();
  const [search,  setSearch]  = useState('');
  const [filter,  setFilter]  = useState('All');
  const [modal,   setModal]   = useState(false);
  const [form,    setForm]    = useState(BLANK);

  const { data, isLoading } = useQuery({
    queryKey: ['outdoor-entries'],
    queryFn: () => hrShiftsAPI.outdoorEntries().then(r => r.data?.data || []),
  });
  const { data: employees } = useQuery({
    queryKey: ['employee-shifts-current'],
    queryFn: () => hrShiftsAPI.currentShifts().then(r => r.data?.data || []),
  });

  const entries = (data||[]).map(e => ({
    id: e.id, emp_code: e.employee_code || '—', name: e.employee_name, dept: e.department_name || '—',
    date: e.entry_date?.slice(0,10), purpose: e.purpose, location: e.location || '—',
    out: e.out_time?.slice(0,5) || '—', in: e.in_time?.slice(0,5) || '—', status: e.status,
  }));

  const invalidate = () => qc.invalidateQueries({ queryKey: ['outdoor-entries'] });
  const createMut  = useMutation({ mutationFn: (d) => hrShiftsAPI.createOutdoorEntry(d), onSuccess: () => { invalidate(); toast.success('Entry added'); }, onError: (e) => toast.error(e.response?.data?.error || 'Failed to add entry') });
  const approveMut = useMutation({ mutationFn: (id) => hrShiftsAPI.approveOutdoorEntry(id), onSuccess: () => { invalidate(); toast.success('Approved'); }, onError: (e) => toast.error(e.response?.data?.error || 'Failed') });
  const rejectMut  = useMutation({ mutationFn: (id) => hrShiftsAPI.rejectOutdoorEntry(id), onSuccess: () => { invalidate(); toast.error('Rejected'); }, onError: (e) => toast.error(e.response?.data?.error || 'Failed') });

  const filtered = entries.filter(e=>
    (filter==='All'||e.status===filter) &&
    (e.name.toLowerCase().includes(search.toLowerCase())||e.purpose.toLowerCase().includes(search.toLowerCase()))
  );

  const set = (k,v) => setForm(p=>({...p,[k]:v}));

  const save = () => {
    if(!form.employee_id||!form.entry_date||!form.purpose){ toast.error('Fill required fields'); return; }
    createMut.mutate(form);
    setModal(false);
    setForm(BLANK);
  };

  const counts = { All:entries.length, Pending:entries.filter(e=>e.status==='Pending').length, Approved:entries.filter(e=>e.status==='Approved').length };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <motion.div {...fade(0)}>
        <div className="rounded-2xl mb-6 p-6 flex items-center justify-between"
          style={{background:`linear-gradient(135deg,${B.navy},#1e3a8a)`}}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center"><MapPin className="w-5 h-5 text-white"/></div>
            <div>
              <h1 className="text-lg font-black text-white">Employee OutDoor Entries</h1>
              <p className="text-xs text-blue-200">{counts.Pending} pending · {counts.Approved} approved</p>
            </div>
          </div>
          <button onClick={()=>{setForm(BLANK);setModal(true);}}
            className="flex items-center gap-2 px-4 py-2 bg-yellow-400 hover:bg-yellow-300 text-gray-900 text-sm font-black rounded-xl transition">
            <Plus className="w-4 h-4"/> Add Entry
          </button>
        </div>

        <div className="flex gap-2 mb-4">
          {['All','Pending','Approved','Rejected'].map(f=>(
            <button key={f} onClick={()=>setFilter(f)}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition ${filter===f?'bg-blue-600 text-white':'bg-white text-gray-600 border border-gray-200 hover:border-blue-300'}`}>
              {f}
            </button>
          ))}
          <div className="flex-1 relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"/>
            <input className="w-full pl-10 pr-4 py-2 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-blue-400"
              placeholder="Search..." value={search} onChange={e=>setSearch(e.target.value)}/>
          </div>
        </div>

        <motion.div {...fade(0.05)} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                {['Employee','Date','Purpose','Location','Out Time','In Time','Status','Action'].map(h=>(
                  <th key={h} className="text-left px-4 py-3 text-xs font-black text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading && <tr><td colSpan={8} className="text-center py-12 text-gray-400 text-sm">Loading…</td></tr>}
              {!isLoading && filtered.map((e,i)=>(
                <tr key={e.id} className={`border-b border-gray-50 hover:bg-blue-50/30 transition-colors ${i%2?'bg-gray-50/30':''}`}>
                  <td className="px-4 py-3">
                    <div className="font-semibold text-gray-800 text-xs">{e.name}</div>
                    <div className="text-gray-400 text-[11px]">{e.emp_code} · {e.dept}</div>
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{e.date}</td>
                  <td className="px-4 py-3 text-gray-700 text-xs max-w-[180px]">{e.purpose}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{e.location}</td>
                  <td className="px-4 py-3 font-medium text-gray-700 text-xs">{e.out}</td>
                  <td className="px-4 py-3 font-medium text-gray-700 text-xs">{e.in}</td>
                  <td className="px-4 py-3"><span className={`text-xs font-bold px-2.5 py-1 rounded-full ${STATUS_COLOR[e.status]}`}>{e.status}</span></td>
                  <td className="px-4 py-3">
                    {e.status==='Pending' && (
                      <div className="flex gap-1.5">
                        <button onClick={()=>approveMut.mutate(e.id)} className="p-1.5 bg-green-50 hover:bg-green-100 text-green-700 rounded-lg transition"><Check className="w-3.5 h-3.5"/></button>
                        <button onClick={()=>rejectMut.mutate(e.id)}  className="p-1.5 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg transition"><XIcon className="w-3.5 h-3.5"/></button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {!isLoading && !filtered.length && <tr><td colSpan={8} className="text-center py-12 text-gray-400 text-sm">No entries found</td></tr>}
            </tbody>
          </table>
        </motion.div>
      </motion.div>

      {modal && (
        <Modal title="New OutDoor Entry" onClose={()=>setModal(false)}>
          <div className="space-y-4">
            <div><label className={lbl}>Employee</label>
              <select className={inp} value={form.employee_id} onChange={e=>set('employee_id',e.target.value)}>
                <option value="">Select employee…</option>
                {(employees||[]).map(emp=><option key={emp.id} value={emp.id}>{emp.name} ({emp.emp_code})</option>)}
              </select>
            </div>
            <div><label className={lbl}>Date</label><input type="date" className={inp} value={form.entry_date} onChange={e=>set('entry_date',e.target.value)}/></div>
            <div><label className={lbl}>Purpose</label><input className={inp} value={form.purpose} onChange={e=>set('purpose',e.target.value)}/></div>
            <div><label className={lbl}>Location</label><input className={inp} value={form.location} onChange={e=>set('location',e.target.value)}/></div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className={lbl}>Out Time</label><input type="time" className={inp} value={form.out_time} onChange={e=>set('out_time',e.target.value)}/></div>
              <div><label className={lbl}>In Time</label><input type="time" className={inp} value={form.in_time} onChange={e=>set('in_time',e.target.value)}/></div>
            </div>
            <div className="flex gap-3 pt-2">
              <button onClick={()=>setModal(false)} className="flex-1 py-2.5 border border-gray-200 text-gray-600 font-semibold rounded-xl hover:bg-gray-50 transition text-sm">Cancel</button>
              <button onClick={save} className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-black rounded-xl transition text-sm">Save Entry</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
