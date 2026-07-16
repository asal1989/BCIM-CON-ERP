import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Radio, Plus, Edit2, Trash2, X, Save, Search, ToggleLeft, ToggleRight } from 'lucide-react';
import toast from 'react-hot-toast';

const B = { navy:'#0A1F5C' };
const fade = (d=0) => ({ initial:{opacity:0,y:14}, animate:{opacity:1,y:0}, transition:{duration:0.35,delay:d} });
const inp = 'w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-900 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50 transition-all';
const lbl = 'text-xs font-black text-gray-600 uppercase tracking-wide block mb-1.5';

const INIT = [
  { id:1, name:'Head Office',    address:'Plot 12, MIDC, Mumbai',        lat:'19.0760', lng:'72.8777', radius:100, active:true,  employees:42 },
  { id:2, name:'Site A – Thane',  address:'Ghodbunder Rd, Thane',         lat:'19.2183', lng:'72.9781', radius:200, active:true,  employees:28 },
  { id:3, name:'Site B – Pune',   address:'Hinjewadi Phase 2, Pune',      lat:'18.5913', lng:'73.7389', radius:150, active:true,  employees:20 },
  { id:4, name:'Warehouse',       address:'Bhiwandi Logistics Park',      lat:'19.2813', lng:'73.0593', radius:75,  active:false, employees: 6 },
];

const BLANK = { name:'', address:'', lat:'', lng:'', radius:100, active:true, employees:0 };

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

export default function GeofencesPage() {
  const [zones,  setZones]  = useState(INIT);
  const [search, setSearch] = useState('');
  const [modal,  setModal]  = useState(null);
  const [form,   setForm]   = useState(BLANK);

  const filtered = zones.filter(z=>z.name.toLowerCase().includes(search.toLowerCase())||z.address.toLowerCase().includes(search.toLowerCase()));
  const set = (k,v) => setForm(p=>({...p,[k]:v}));

  const openAdd  = () => { setForm(BLANK); setModal('add'); };
  const openEdit = (z) => { setForm({...z}); setModal(z); };
  const close    = () => setModal(null);

  const save = () => {
    if(!form.name||!form.lat||!form.lng){ toast.error('Name and coordinates required'); return; }
    if(modal==='add'){
      setZones(p=>[...p,{...form,id:Date.now(),employees:0,radius:parseInt(form.radius)||100}]);
      toast.success('Geofence created');
    } else {
      setZones(p=>p.map(z=>z.id===modal.id?{...form,id:modal.id,radius:parseInt(form.radius)||100}:z));
      toast.success('Geofence updated');
    }
    close();
  };

  const del = (id) => { setZones(p=>p.filter(z=>z.id!==id)); toast.success('Geofence removed'); };
  const toggle = (id) => setZones(p=>p.map(z=>z.id===id?{...z,active:!z.active}:z));

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <motion.div {...fade(0)}>
        <div className="rounded-2xl mb-6 p-6 flex items-center justify-between"
          style={{background:`linear-gradient(135deg,${B.navy},#1e3a8a)`}}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center"><Radio className="w-5 h-5 text-white"/></div>
            <div>
              <h1 className="text-lg font-black text-white">Geofences</h1>
              <p className="text-xs text-blue-200">{zones.filter(z=>z.active).length} active zones · {zones.reduce((s,z)=>s+z.employees,0)} employees covered</p>
            </div>
          </div>
          <button onClick={openAdd} className="flex items-center gap-2 px-4 py-2 bg-yellow-400 hover:bg-yellow-300 text-gray-900 text-sm font-black rounded-xl transition">
            <Plus className="w-4 h-4"/> Add Zone
          </button>
        </div>

        <div className="relative mb-4">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"/>
          <input className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-blue-400"
            placeholder="Search zones..." value={search} onChange={e=>setSearch(e.target.value)}/>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map((z,i)=>(
            <motion.div key={z.id} {...fade(0.05*i)}
              className={`bg-white rounded-2xl border shadow-sm p-5 transition-all ${z.active?'border-gray-100':'border-gray-200 opacity-60'}`}>
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className={`w-2.5 h-2.5 rounded-full ${z.active?'bg-green-500':'bg-gray-400'}`}/>
                    <h3 className="font-black text-gray-800 text-sm">{z.name}</h3>
                  </div>
                  <p className="text-xs text-gray-500 ml-4.5">{z.address}</p>
                </div>
                <div className="flex gap-1.5">
                  <button onClick={()=>openEdit(z)} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition"><Edit2 className="w-3.5 h-3.5"/></button>
                  <button onClick={()=>del(z.id)}   className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition"><Trash2 className="w-3.5 h-3.5"/></button>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3 mb-3">
                <div className="bg-gray-50 rounded-xl p-2.5 text-center">
                  <div className="text-[10px] text-gray-400 uppercase font-black">Lat</div>
                  <div className="text-xs font-bold text-gray-700 mt-0.5">{z.lat}°</div>
                </div>
                <div className="bg-gray-50 rounded-xl p-2.5 text-center">
                  <div className="text-[10px] text-gray-400 uppercase font-black">Lng</div>
                  <div className="text-xs font-bold text-gray-700 mt-0.5">{z.lng}°</div>
                </div>
                <div className="bg-blue-50 rounded-xl p-2.5 text-center">
                  <div className="text-[10px] text-blue-400 uppercase font-black">Radius</div>
                  <div className="text-xs font-bold text-blue-700 mt-0.5">{z.radius}m</div>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500">{z.employees} employees assigned</span>
                <button onClick={()=>toggle(z.id)}>
                  {z.active
                    ? <ToggleRight className="w-7 h-7 text-blue-600"/>
                    : <ToggleLeft  className="w-7 h-7 text-gray-300"/>}
                </button>
              </div>
            </motion.div>
          ))}
        </div>
      </motion.div>

      {modal && (
        <Modal title={modal==='add'?'New Geofence Zone':'Edit Geofence'} onClose={close}>
          <div className="space-y-4">
            <div><label className={lbl}>Zone Name</label><input className={inp} value={form.name} onChange={e=>set('name',e.target.value)}/></div>
            <div><label className={lbl}>Address</label><input className={inp} value={form.address} onChange={e=>set('address',e.target.value)}/></div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className={lbl}>Latitude</label><input className={inp} placeholder="e.g. 19.0760" value={form.lat} onChange={e=>set('lat',e.target.value)}/></div>
              <div><label className={lbl}>Longitude</label><input className={inp} placeholder="e.g. 72.8777" value={form.lng} onChange={e=>set('lng',e.target.value)}/></div>
            </div>
            <div><label className={lbl}>Radius (metres)</label><input type="number" className={inp} value={form.radius} onChange={e=>set('radius',e.target.value)}/></div>
            <div className="flex gap-3 pt-2">
              <button onClick={close} className="flex-1 py-2.5 border border-gray-200 text-gray-600 font-semibold rounded-xl hover:bg-gray-50 transition text-sm">Cancel</button>
              <button onClick={save} className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-black rounded-xl transition text-sm flex items-center justify-center gap-2">
                <Save className="w-4 h-4"/> Save Zone
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
