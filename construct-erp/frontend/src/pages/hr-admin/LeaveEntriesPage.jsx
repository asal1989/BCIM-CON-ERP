import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { BookOpen, Search, Check, X as XIcon } from 'lucide-react';
import toast from 'react-hot-toast';
import { hrLeaveAPI } from '../../api/client';

const B = { navy:'#0A1F5C' };
const fade = (d=0) => ({ initial:{opacity:0,y:14}, animate:{opacity:1,y:0}, transition:{duration:0.35,delay:d} });

const STATUS_LABEL = { pending:'Pending', approved:'Approved', rejected:'Rejected', cancelled:'Cancelled' };
const STATUS_COLOR = {
  Pending:  'bg-amber-50 text-amber-700 border-amber-200',
  Approved: 'bg-green-50 text-green-700 border-green-200',
  Rejected: 'bg-red-50 text-red-600 border-red-200',
  Cancelled:'bg-gray-100 text-gray-500 border-gray-200',
};

const TYPE_COLORS = ['bg-blue-50 text-blue-700','bg-violet-50 text-violet-700','bg-rose-50 text-rose-700','bg-teal-50 text-teal-700','bg-gray-100 text-gray-600'];
const typeColor = (name) => TYPE_COLORS[[...String(name)].reduce((s,ch)=>s+ch.charCodeAt(0),0) % TYPE_COLORS.length];

export default function LeaveEntriesPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('All');

  const { data, isLoading } = useQuery({
    queryKey: ['leave-entries'],
    queryFn: () => hrLeaveAPI.listRequests().then(r => r.data?.data || []),
  });
  const entries = (data || []).map(r => ({
    id: r.id, emp_code: r.employee_code || '—', name: r.employee_name,
    dept: r.department_name || '—', type: r.leave_type_name,
    from: r.from_date, to: r.to_date, days: r.days, reason: r.reason || '—',
    status: STATUS_LABEL[r.status] || r.status, applied: r.applied_at,
  }));

  const approveMut = useMutation({
    mutationFn: (id) => hrLeaveAPI.approve(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['leave-entries'] }); toast.success('Leave approved'); },
    onError: (e) => toast.error(e.response?.data?.error || 'Failed to approve'),
  });
  const rejectMut = useMutation({
    mutationFn: (id) => hrLeaveAPI.reject(id, {}),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['leave-entries'] }); toast.error('Leave rejected'); },
    onError: (e) => toast.error(e.response?.data?.error || 'Failed to reject'),
  });

  const filtered = entries.filter(e =>
    (filter==='All'||e.status===filter) &&
    (e.name.toLowerCase().includes(search.toLowerCase())||e.emp_code.toLowerCase().includes(search.toLowerCase()))
  );

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
          <button onClick={()=>toast('Use Leave Management to submit a new leave request')}
            className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 text-white text-sm font-bold rounded-xl transition">
            Go to Leave Management
          </button>
        </div>

        {/* Filter tabs */}
        <div className="flex gap-2 mb-4 flex-wrap">
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
              {isLoading && (
                <tr><td colSpan={9} className="text-center py-12 text-gray-400 text-sm">Loading…</td></tr>
              )}
              {!isLoading && filtered.map((e,i)=>(
                <tr key={e.id} className={`border-b border-gray-50 hover:bg-blue-50/30 transition-colors ${i%2?'bg-gray-50/30':''}`}>
                  <td className="px-4 py-3">
                    <div className="font-semibold text-gray-800 text-xs">{e.name}</div>
                    <div className="text-gray-400 text-[11px]">{e.emp_code}</div>
                  </td>
                  <td className="px-4 py-3 text-gray-600 text-xs">{e.dept}</td>
                  <td className="px-4 py-3"><span className={`text-xs font-bold px-2.5 py-1 rounded-full ${typeColor(e.type)}`}>{e.type}</span></td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{e.from}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{e.to}</td>
                  <td className="px-4 py-3"><span className="font-black text-gray-800">{e.days}</span></td>
                  <td className="px-4 py-3 text-gray-400 text-xs">{e.applied ? String(e.applied).slice(0,10) : '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${STATUS_COLOR[e.status]||'bg-gray-50 text-gray-600 border-gray-200'}`}>{e.status}</span>
                  </td>
                  <td className="px-4 py-3">
                    {e.status==='Pending' && (
                      <div className="flex gap-1.5">
                        <button disabled={approveMut.isPending} onClick={()=>approveMut.mutate(e.id)} className="p-1.5 bg-green-50 hover:bg-green-100 text-green-700 rounded-lg transition disabled:opacity-50"><Check className="w-3.5 h-3.5"/></button>
                        <button disabled={rejectMut.isPending} onClick={()=>rejectMut.mutate(e.id)}  className="p-1.5 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg transition disabled:opacity-50"><XIcon className="w-3.5 h-3.5"/></button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {!isLoading && !filtered.length && <tr><td colSpan={9} className="text-center py-12 text-gray-400 text-sm">No entries found</td></tr>}
            </tbody>
          </table>
        </motion.div>
      </motion.div>
    </div>
  );
}
