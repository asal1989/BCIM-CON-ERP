import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { BookOpen, Plus, Search, Check, X as XIcon, Eye } from 'lucide-react';
import toast from 'react-hot-toast';

const B = { navy:'#0A1F5C' };
const fade = (d=0) => ({ initial:{opacity:0,y:14}, animate:{opacity:1,y:0}, transition:{duration:0.35,delay:d} });

const STATUS_COLOR = {
  Pending:  'bg-amber-50 text-amber-700 border-amber-200',
  Approved: 'bg-green-50 text-green-700 border-green-200',
  Rejected: 'bg-red-50 text-red-600 border-red-200',
};

const TYPE_COLOR = {
  'Casual Leave':  'bg-blue-50 text-blue-700',
  'Earned Leave':  'bg-violet-50 text-violet-700',
  'Sick Leave':    'bg-rose-50 text-rose-700',
  'LOP':           'bg-gray-100 text-gray-600',
  'Comp Off':      'bg-teal-50 text-teal-700',
};

const INIT = [
  { id:1, emp_code:'EMP003', name:'Mohammed Ali',  dept:'Site Operations', type:'Casual Leave', from:'2026-07-10', to:'2026-07-11', days:2, reason:'Personal work',     status:'Approved', applied:'2026-07-08' },
  { id:2, emp_code:'EMP004', name:'Deepa Menon',   dept:'Accounts',        type:'Sick Leave',   from:'2026-07-12', to:'2026-07-12', days:1, reason:'Not feeling well', status:'Approved', applied:'2026-07-12' },
  { id:3, emp_code:'EMP001', name:'Rahul Sharma',  dept:'Administration',  type:'Earned Leave', from:'2026-07-18', to:'2026-07-20', days:3, reason:'Family function',   status:'Pending',  applied:'2026-07-14' },
  { id:4, emp_code:'EMP007', name:'Vikram Singh',  dept:'Administration',  type:'Casual Leave', from:'2026-07-15', to:'2026-07-15', days:1, reason:'Bank work',         status:'Pending',  applied:'2026-07-13' },
  { id:5, emp_code:'EMP005', name:'Suresh Babu',   dept:'Site Operations', type:'LOP',          from:'2026-07-09', to:'2026-07-09', days:1, reason:'Absent',            status:'Rejected', applied:'2026-07-10' },
];

export default function LeaveEntriesPage() {
  const [entries, setEntries] = useState(INIT);
  const [search,  setSearch]  = useState('');
  const [filter,  setFilter]  = useState('All');

  const filtered = entries.filter(e =>
    (filter==='All'||e.status===filter) &&
    (e.name.toLowerCase().includes(search.toLowerCase())||e.emp_code.toLowerCase().includes(search.toLowerCase()))
  );

  const approve = (id) => { setEntries(p=>p.map(e=>e.id===id?{...e,status:'Approved'}:e)); toast.success('Leave approved'); };
  const reject  = (id) => { setEntries(p=>p.map(e=>e.id===id?{...e,status:'Rejected'}:e)); toast.error('Leave rejected'); };

  const counts = { All:entries.length, Pending:entries.filter(e=>e.status==='Pending').length, Approved:entries.filter(e=>e.status==='Approved').length, Rejected:entries.filter(e=>e.status==='Rejected').length };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <motion.div {...fade(0)}>
        <div className="rounded-2xl mb-6 p-6 flex items-center justify-between"
          style={{background:`linear-gradient(135deg,${B.navy},#1e3a8a)`}}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center"><BookOpen className="w-5 h-5 text-white"/></div>
            <div>
              <h1 className="text-lg font-black text-white">Employees Leave Entries</h1>
              <p className="text-xs text-blue-200">{counts.Pending} pending approval</p>
            </div>
          </div>
          <button onClick={()=>toast('Use Leave Management to add new leave')}
            className="flex items-center gap-2 px-4 py-2 bg-yellow-400 hover:bg-yellow-300 text-gray-900 text-sm font-black rounded-xl transition">
            <Plus className="w-4 h-4"/> Add Entry
          </button>
        </div>

        {/* Filter tabs */}
        <div className="flex gap-2 mb-4">
          {['All','Pending','Approved','Rejected'].map(f=>(
            <button key={f} onClick={()=>setFilter(f)}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition ${filter===f?'bg-blue-600 text-white':'bg-white text-gray-600 border border-gray-200 hover:border-blue-300'}`}>
              {f} ({counts[f]})
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
                {['Employee','Department','Leave Type','From','To','Days','Applied On','Status','Action'].map(h=>(
                  <th key={h} className="text-left px-4 py-3 text-xs font-black text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((e,i)=>(
                <tr key={e.id} className={`border-b border-gray-50 hover:bg-blue-50/30 transition-colors ${i%2?'bg-gray-50/30':''}`}>
                  <td className="px-4 py-3">
                    <div className="font-semibold text-gray-800 text-xs">{e.name}</div>
                    <div className="text-gray-400 text-[11px]">{e.emp_code}</div>
                  </td>
                  <td className="px-4 py-3 text-gray-600 text-xs">{e.dept}</td>
                  <td className="px-4 py-3"><span className={`text-xs font-bold px-2.5 py-1 rounded-full ${TYPE_COLOR[e.type]||'bg-gray-50 text-gray-600'}`}>{e.type}</span></td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{e.from}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{e.to}</td>
                  <td className="px-4 py-3"><span className="font-black text-gray-800">{e.days}</span></td>
                  <td className="px-4 py-3 text-gray-400 text-xs">{e.applied}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${STATUS_COLOR[e.status]}`}>{e.status}</span>
                  </td>
                  <td className="px-4 py-3">
                    {e.status==='Pending' && (
                      <div className="flex gap-1.5">
                        <button onClick={()=>approve(e.id)} className="p-1.5 bg-green-50 hover:bg-green-100 text-green-700 rounded-lg transition"><Check className="w-3.5 h-3.5"/></button>
                        <button onClick={()=>reject(e.id)}  className="p-1.5 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg transition"><XIcon className="w-3.5 h-3.5"/></button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {!filtered.length && <tr><td colSpan={9} className="text-center py-12 text-gray-400 text-sm">No entries found</td></tr>}
            </tbody>
          </table>
        </motion.div>
      </motion.div>
    </div>
  );
}
