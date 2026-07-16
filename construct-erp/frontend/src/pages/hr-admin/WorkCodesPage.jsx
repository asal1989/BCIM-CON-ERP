import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Code2, Plus, Edit2, Trash2, X, Save, Search } from 'lucide-react';
import toast from 'react-hot-toast';

const B = { navy:'#0A1F5C' };
const fade = (d=0) => ({ initial:{opacity:0,y:14}, animate:{opacity:1,y:0}, transition:{duration:0.35,delay:d} });
const inp = 'w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-900 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50 transition-all';
const lbl = 'text-xs font-black text-gray-600 uppercase tracking-wide block mb-1.5';

const CATEGORIES = ['Attendance','Leave','Payroll','Site','Overtime','Holiday'];

const INIT = [
  { id:1, code:'P',   description:'Present',                category:'Attendance', color:'#10b981', paid:true,  count_leave:false },
  { id:2, code:'A',   description:'Absent',                 category:'Attendance', color:'#ef4444', paid:false, count_leave:false },
  { id:3, code:'CL',  description:'Casual Leave',           category:'Leave',      color:'#3b82f6', paid:true,  count_leave:true  },
  { id:4, code:'SL',  description:'Sick Leave',             category:'Leave',      color:'#f97316', paid:true,  count_leave:true  },
  { id:5, code:'EL',  description:'Earned Leave',           category:'Leave',      color:'#8b5cf6', paid:true,  count_leave:true  },
  { id:6, code:'LOP', description:'Loss of Pay',            category:'Leave',      color:'#6b7280', paid:false, count_leave:false },
  { id:7, code:'HD',  description:'Half Day',               category:'Attendance', color:'#f59e0b', paid:true,  count_leave:false },
  { id:8, code:'WO',  description:'Week Off',               category:'Attendance', color:'#14b8a6', paid:true,  count_leave:false },
  { id:9, code:'PH',  description:'Public Holiday',         category:'Holiday',    color:'#ec4899', paid:true,  count_leave:false },
  { id:10,code:'OT',  description:'Overtime',               category:'Overtime',   color:'#0ea5e9', paid:true,  count_leave:false },
  { id:11,code:'CO',  description:'Comp Off',               category:'Leave',      color:'#06b6d4', paid:true,  count_leave:true  },
  { id:12,code:'OD',  description:'OutDoor / Field Duty',  category:'Site',       color:'#84cc16', paid:true,  count_leave:false },
];

const BLANK = { code:'', description:'', category:'Attendance', color:'#3b82f6', paid:true, count_leave:false };

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

function Check({ label, checked, onChange }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer">
      <input type="checkbox" checked={checked} onChange={e=>onChange(e.target.checked)} className="w-4 h-4 accent-blue-600"/>
      <span className="text-sm font-medium text-gray-700">{label}</span>
    </label>
  );
}

export default function WorkCodesPage() {
  const [codes,  setCodes]  = useState(INIT);
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState('All');
  const [modal,  setModal]  = useState(null);
  const [form,   setForm]   = useState(BLANK);

  const cats = ['All', ...CATEGORIES];
  const filtered = codes.filter(c=>
    (catFilter==='All'||c.category===catFilter) &&
    (c.code.toLowerCase().includes(search.toLowerCase())||c.description.toLowerCase().includes(search.toLowerCase()))
  );

  const set = (k,v) => setForm(p=>({...p,[k]:v}));
  const openAdd  = () => { setForm(BLANK); setModal('add'); };
  const openEdit = (c) => { setForm({...c}); setModal(c); };
  const close    = () => setModal(null);

  const save = () => {
    if(!form.code||!form.description){ toast.error('Code and description required'); return; }
    if(modal==='add'){
      setCodes(p=>[...p,{...form,id:Date.now()}]);
      toast.success('Work code created');
    } else {
      setCodes(p=>p.map(c=>c.id===modal.id?{...form,id:modal.id}:c));
      toast.success('Work code updated');
    }
    close();
  };

  const del = (id) => { setCodes(p=>p.filter(c=>c.id!==id)); toast.success('Deleted'); };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <motion.div {...fade(0)}>
        <div className="rounded-2xl mb-6 p-6 flex items-center justify-between"
          style={{background:`linear-gradient(135deg,${B.navy},#1e3a8a)`}}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center"><Code2 className="w-5 h-5 text-white"/></div>
            <div>
              <h1 className="text-lg font-black text-white">Manage Work Codes</h1>
              <p className="text-xs text-blue-200">{codes.length} codes configured</p>
            </div>
          </div>
          <button onClick={openAdd} className="flex items-center gap-2 px-4 py-2 bg-yellow-400 hover:bg-yellow-300 text-gray-900 text-sm font-black rounded-xl transition">
            <Plus className="w-4 h-4"/> New Code
          </button>
        </div>

        {/* Filter */}
        <div className="flex gap-2 mb-4 flex-wrap">
          {cats.map(c=>(
            <button key={c} onClick={()=>setCatFilter(c)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${catFilter===c?'bg-blue-600 text-white':'bg-white text-gray-600 border border-gray-200 hover:border-blue-300'}`}>
              {c}
            </button>
          ))}
          <div className="flex-1 min-w-[150px] relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"/>
            <input className="w-full pl-10 pr-4 py-2 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-blue-400"
              placeholder="Search codes..." value={search} onChange={e=>setSearch(e.target.value)}/>
          </div>
        </div>

        <motion.div {...fade(0.05)} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                {['Code','Description','Category','Paid','Count Leave',''].map(h=>(
                  <th key={h} className="text-left px-4 py-3 text-xs font-black text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((c,i)=>(
                <tr key={c.id} className={`border-b border-gray-50 hover:bg-blue-50/30 transition-colors ${i%2?'bg-gray-50/30':''}`}>
                  <td className="px-4 py-3">
                    <span className="font-black text-sm px-3 py-1 rounded-lg text-white" style={{background:c.color}}>{c.code}</span>
                  </td>
                  <td className="px-4 py-3 font-medium text-gray-800">{c.description}</td>
                  <td className="px-4 py-3"><span className="bg-gray-100 text-gray-600 text-xs font-bold px-2.5 py-1 rounded-full">{c.category}</span></td>
                  <td className="px-4 py-3"><span className={`text-xs font-bold px-2 py-0.5 rounded-full ${c.paid?'bg-green-50 text-green-700':'bg-red-50 text-red-500'}`}>{c.paid?'Yes':'No'}</span></td>
                  <td className="px-4 py-3"><span className={`text-xs font-bold px-2 py-0.5 rounded-full ${c.count_leave?'bg-blue-50 text-blue-700':'bg-gray-100 text-gray-400'}`}>{c.count_leave?'Yes':'No'}</span></td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1.5">
                      <button onClick={()=>openEdit(c)} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition"><Edit2 className="w-3.5 h-3.5"/></button>
                      <button onClick={()=>del(c.id)}   className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition"><Trash2 className="w-3.5 h-3.5"/></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </motion.div>
      </motion.div>

      {modal && (
        <Modal title={modal==='add'?'New Work Code':'Edit Work Code'} onClose={close}>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div><label className={lbl}>Code</label><input className={inp} value={form.code} onChange={e=>set('code',e.target.value.toUpperCase())} maxLength={6}/></div>
              <div><label className={lbl}>Color</label>
                <div className="flex gap-2 items-center">
                  <input type="color" value={form.color} onChange={e=>set('color',e.target.value)} className="w-10 h-10 rounded-lg border border-gray-200 cursor-pointer"/>
                  <span className="text-sm font-black px-3 py-1.5 rounded-lg text-white" style={{background:form.color}}>{form.code||'CODE'}</span>
                </div>
              </div>
            </div>
            <div><label className={lbl}>Description</label><input className={inp} value={form.description} onChange={e=>set('description',e.target.value)}/></div>
            <div><label className={lbl}>Category</label>
              <select className={inp} value={form.category} onChange={e=>set('category',e.target.value)}>
                {CATEGORIES.map(c=><option key={c}>{c}</option>)}
              </select>
            </div>
            <div className="flex gap-6">
              <Check label="Paid Day" checked={form.paid} onChange={v=>set('paid',v)}/>
              <Check label="Count as Leave" checked={form.count_leave} onChange={v=>set('count_leave',v)}/>
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
