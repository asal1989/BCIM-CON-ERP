// src/pages/hr/AttendancePage.jsx
import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Clock, Save, ChevronLeft, ChevronRight, Calendar as CalendarIcon, Users, Landmark, Zap, Fingerprint } from 'lucide-react';
import { clsx } from 'clsx';
import dayjs from 'dayjs';
import { attendanceAPI, workerAPI, projectAPI } from '../../api/client';
import toast from 'react-hot-toast';
import DataToolbar from '../../components/common/DataToolbar';

const STATUS = {
  present:  { label: 'P', full: 'Present',  bg: 'bg-emerald-50',  text: 'text-emerald-600', border: 'border-emerald-100', dot: 'bg-emerald-500' },
  absent:   { label: 'A', full: 'Absent',   bg: 'bg-red-50',      text: 'text-red-600',     border: 'border-red-100',     dot: 'bg-red-500' },
  half_day: { label: 'H', full: 'Half Day', bg: 'bg-amber-50',    text: 'text-amber-600',   border: 'border-amber-100',   dot: 'bg-amber-500' },
  leave:    { label: 'L', full: 'Leave',    bg: 'bg-blue-50',     text: 'text-blue-600',    border: 'border-blue-100',    dot: 'bg-blue-500' },
};

export default function AttendancePage() {
  const [projectId, setProjectId] = useState('');
  const [date, setDate] = useState(dayjs().format('YYYY-MM-DD'));
  const [records, setRecords] = useState({});
  const qc = useQueryClient();

  const { data: projects } = useQuery({ 
    queryKey: ['projects'], 
    queryFn: () => projectAPI.list().then(r => r.data?.data).catch(() => null) 
  });

  const { data: workers } = useQuery({ 
    queryKey: ['workers', projectId], 
    queryFn: () => projectId ? workerAPI.list({ project_id: projectId }).then(r => r.data?.data).catch(() => null) : Promise.resolve(null), 
    enabled: !!projectId 
  });

  useQuery({ 
    queryKey: ['attendance', projectId, date], 
    queryFn: () => attendanceAPI.list({ project_id: projectId, date }).then(r => r.data?.data).catch(() => null), 
    enabled: !!projectId,
    onSuccess: (data) => { 
      if (data?.length) { 
        const map = {}; 
        data.forEach(r => { map[r.worker_id] = { status: r.status, ot_hours: r.ot_hours || 0 } }); 
        setRecords(map); 
      } 
    } 
  });

  const markMutation = useMutation({
    mutationFn: (d) => attendanceAPI.bulkMark(d),
    onSuccess: (r) => { 
      toast.success(`Muster Roll Finalized for ${r.data.data?.length || 0} units`); 
      qc.invalidateQueries({ queryKey: ['attendance'] }); 
    },
    onError: (e) => toast.error(e?.response?.data?.error || 'Muster Submission Failed'),
  });

  const allWorkers = workers ?? [];
  const setStatus = (id, status) => setRecords(p => ({ ...p, [id]: { ...(p[id] || { ot_hours: 0 }), status } }));
  const setOT = (id, ot) => setRecords(p => ({ ...p, [id]: { ...(p[id] || { status: 'present' }), ot_hours: parseFloat(ot) || 0 } }));
  const markAll = (status) => { 
    const m = {}; 
    allWorkers.forEach(w => { m[w.id] = { status, ot_hours: 0 } }); 
    setRecords(m); 
  };

  const stats = Object.fromEntries(Object.keys(STATUS).map(k => [k, allWorkers.filter(w => records[w.id]?.status === k).length]));
  const wageEst = allWorkers.reduce((s, w) => { 
    const st = records[w.id]?.status; 
    return s + (w.daily_rate || 0) * (st === 'present' ? 1 : st === 'half_day' ? 0.5 : 0); 
  }, 0);

  return (
    <div className="p-8 space-y-8 bg-slate-50 min-h-screen">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
           <div className="w-12 h-12 rounded-2xl bg-teal-600 flex items-center justify-center text-white shadow-xl shadow-teal-600/20">
              <Fingerprint className="w-7 h-7" />
           </div>
           <div>
              <h1 className="text-2xl font-medium text-slate-900 uppercase tracking-tight italic">Daily Muster Roll</h1>
              <p className="text-[10px] text-slate-900 font-medium uppercase tracking-[0.2em]">Deployment Verification • Attendance Archival • OT Authorization</p>
           </div>
        </div>
        <div className="flex items-center gap-4">
          <DataToolbar data={allWorkers.map(w => ({ ...w, ...records[w.id] }))} fileName={`BCIM_Muster_${date}`} hideAdd />
          <button 
            onClick={() => { 
              if (!projectId) return toast.error('Selection Error: Project Segment Required'); 
              const recs = allWorkers.map(w => ({ worker_id: w.id, status: records[w.id]?.status || 'absent', ot_hours: records[w.id]?.ot_hours || 0 })); 
              markMutation.mutate({ project_id: projectId, date, records: recs }); 
            }}
            disabled={markMutation.isPending || !projectId} 
            className="flex items-center justify-center gap-3 px-8 py-4 bg-teal-600 hover:bg-teal-500 disabled:opacity-40 text-white text-[10px] font-medium uppercase tracking-widest rounded-[1.5rem] shadow-xl shadow-teal-600/20 italic transition-all"
          >
            <Save className="w-4 h-4" /> {markMutation.isPending ? 'Finalizing...' : 'Authorize Muster Roll'}
          </button>
        </div>
      </div>

      {/* Control Bar */}
      <div className="bg-white border border-slate-200 p-8 rounded-[3rem] shadow-sm flex flex-col lg:flex-row gap-8 items-center">
        <div className="w-full lg:w-96 space-y-2">
           <label className="text-[10px] font-medium text-slate-900 font-medium uppercase tracking-widest ml-1 leading-none italic">Target Operational Segment</label>
           <select className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl text-[11px] font-medium text-slate-900 uppercase italic outline-none focus:border-teal-500 transition-all shadow-inner" value={projectId} onChange={e => setProjectId(e.target.value)}>
             <option value="">Select Project Site Segment...</option>
             {(projects || []).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
           </select>
        </div>

        <div className="w-full lg:w-64 space-y-2">
           <label className="text-[10px] font-medium text-slate-900 font-medium uppercase tracking-widest ml-1 leading-none italic">Muster Date</label>
           <div className="flex items-center gap-2">
             <button onClick={() => setDate(dayjs(date).subtract(1, 'day').format('YYYY-MM-DD'))} className="w-12 h-12 flex items-center justify-center bg-white border border-slate-200 rounded-xl text-slate-900 font-medium hover:text-teal-600 transition-all shadow-sm"><ChevronLeft size={20} /></button>
             <input type="date" className="flex-1 p-3 bg-slate-50 border border-slate-200 rounded-xl text-[11px] font-medium text-slate-900 font-mono uppercase text-center shadow-inner" value={date} onChange={e => setDate(e.target.value)} />
             <button onClick={() => setDate(dayjs(date).add(1, 'day').format('YYYY-MM-DD'))} className="w-12 h-12 flex items-center justify-center bg-white border border-slate-200 rounded-xl text-slate-900 font-medium hover:text-teal-600 transition-all shadow-sm"><ChevronRight size={20} /></button>
           </div>
        </div>

        <div className="flex-1 space-y-2">
           <label className="text-[10px] font-medium text-slate-900 font-medium uppercase tracking-widest ml-1 leading-none italic">Batch Deployment Control</label>
           <div className="flex gap-2">
             {Object.entries(STATUS).map(([k, v]) => (
               <button 
                 key={k} 
                 onClick={() => markAll(k)} 
                 className={clsx('flex-1 py-3.5 px-4 rounded-2xl text-[9px] font-medium uppercase tracking-widest transition-all border shadow-sm italic', v.bg, v.text, v.border, 'hover:scale-105')}
               >
                 Mark All {v.label}
               </button>
             ))}
           </div>
        </div>
      </div>

      {/* Deployment Analytics */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-6">
        {Object.entries(STATUS).map(([k, v]) => (
          <div key={k} className="bg-white p-6 border border-slate-200 rounded-[2rem] shadow-sm relative overflow-hidden group">
            <div className={clsx("absolute top-0 right-0 w-16 h-16 opacity-[0.05] -translate-x-3 translate-y-3", v.text)}>
               <Users size={64} />
            </div>
            <div className="flex items-center gap-2 mb-2">
               <div className={clsx("w-2 h-2 rounded-full", v.dot)} />
               <span className="text-[9px] font-medium text-slate-900 font-medium uppercase tracking-widest italic">{v.full} Deployment</span>
            </div>
            <div className={clsx('text-3xl font-medium italic tracking-tighter leading-none font-mono', v.text)}>{stats[k] || 0}</div>
          </div>
        ))}
        <div className="bg-white p-6 border border-slate-200 rounded-[2rem] shadow-sm relative overflow-hidden bg-teal-50/10">
           <div className="text-[9px] font-medium text-teal-600 uppercase tracking-widest italic mb-2">Estimated Daily Payroll</div>
           <div className="text-3xl font-medium text-teal-600 italic tracking-tighter leading-none font-mono">₹{wageEst.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
           <Landmark className="absolute bottom-4 right-4 text-teal-500 opacity-20" size={24} />
        </div>
      </div>

      {/* Muster Roll Grid */}
      <div className="bg-white border border-slate-200 overflow-hidden rounded-[2.5rem] shadow-sm">
        <div className="p-8 border-b border-slate-100 bg-white flex items-center justify-between">
           <h3 className="text-xs font-medium text-slate-900 uppercase tracking-widest flex items-center gap-3 italic">
              <Zap size={16} className="text-teal-600" /> Units Deployment Ledger
           </h3>
           <div className="text-[10px] font-medium text-slate-900 font-medium uppercase tracking-[0.2em] italic">Real-Time Fiscal Projection</div>
        </div>
        <div className="p-0 overflow-x-auto">
          <table className="w-full text-sm text-left border-collapse min-w-[900px]">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="p-6 text-[10px] font-medium text-slate-900 font-medium uppercase tracking-widest">Technician / Unit Name</th>
                <th className="p-6 text-[10px] font-medium text-slate-900 font-medium uppercase tracking-widest">Skill Assignment</th>
                <th className="p-6 text-[10px] font-medium text-slate-900 font-medium uppercase tracking-widest">Muster Control</th>
                <th className="p-6 text-[10px] font-medium text-slate-900 font-medium uppercase tracking-widest">OT Hours</th>
                <th className="p-6 text-[10px] font-medium text-slate-900 font-medium uppercase tracking-widest text-right">Daily Fiscal Impact</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {allWorkers.map(w => {
                const rec = records[w.id]; 
                const st = rec?.status;
                const v = STATUS[st] || { label: '?', bg: 'bg-slate-50', text: 'text-slate-300', border: 'border-slate-100' };
                const wage = (w.daily_rate || 0) * (st === 'present' ? 1 : st === 'half_day' ? 0.5 : 0);
                
                return (
                  <tr key={w.id} className="hover:bg-slate-50 transition-all group">
                    <td className="p-6">
                      <div className="flex items-center gap-4">
                         <div className="w-10 h-10 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-center text-slate-900 font-medium group-hover:bg-teal-50 group-hover:text-teal-600 transition-all font-medium">
                            {w.name.charAt(0)}
                         </div>
                         <div>
                            <div className="text-slate-900 font-medium text-xs uppercase tracking-tight italic">{w.name}</div>
                            <div className="text-[9px] font-medium text-slate-900 font-medium uppercase tracking-widest mt-1 italic">{w.gang_name || 'Individual Unit'}</div>
                         </div>
                      </div>
                    </td>
                    <td className="p-6">
                       <span className="text-[10px] font-medium text-slate-900 font-medium uppercase tracking-widest bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-100 italic">
                          {w.skill_type?.replace('_', ' ')}
                       </span>
                    </td>
                    <td className="p-6">
                      <div className="flex items-center gap-1.5">
                        {Object.entries(STATUS).map(([k, val]) => (
                          <button 
                            key={k} 
                            onClick={() => setStatus(w.id, k)} 
                            className={clsx(
                              'w-9 h-9 flex items-center justify-center rounded-xl font-medium text-[10px] transition-all border shadow-sm italic',
                              st === k ? clsx(val.bg, val.text, val.border, 'scale-110 shadow-lg ring-1', val.ring) : 'bg-white text-slate-300 border-slate-100 hover:border-slate-300'
                            )}
                          >
                            {val.label}
                          </button>
                        ))}
                      </div>
                    </td>
                    <td className="p-6">
                       <div className="relative w-28">
                          <input 
                            type="number" 
                            min={0} 
                            max={12} 
                            step={0.5} 
                            className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-center text-slate-900 outline-none focus:border-teal-500 disabled:opacity-20 transition-all font-mono" 
                            value={rec?.ot_hours || ''} 
                            onChange={e => setOT(w.id, e.target.value)} 
                            disabled={st === 'absent' || st === 'leave'} 
                          />
                          <div className="absolute right-3 top-1/2 -translate-y-1/2 text-[8px] font-medium text-slate-900 font-medium uppercase italic pointer-events-none">hrs</div>
                       </div>
                    </td>
                    <td className="p-6 text-right">
                       <div className={clsx('text-xs font-medium italic tracking-tighter bg-slate-50 px-4 py-2 rounded-xl border border-slate-100 inline-block font-mono', wage > 0 ? 'text-teal-600 border-teal-100' : 'text-slate-400')}>
                          {wage > 0 ? `₹${wage.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}
                       </div>
                    </td>
                  </tr>
                );
              })}
              {allWorkers.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-24 text-center border-t border-slate-50">
                     <p className="text-slate-900 font-medium uppercase text-[10px] italic tracking-[0.3em]">Selection Error: Assign Project Segment to Load Muster Data</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
