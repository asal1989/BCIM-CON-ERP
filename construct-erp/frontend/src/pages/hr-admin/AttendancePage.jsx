// src/pages/hr-admin/AttendancePage.jsx — 2026 Premium UI
import React, { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Calendar, Fingerprint, RefreshCw, CheckCircle, AlertTriangle, CalendarCheck } from 'lucide-react';
import { hrAttendanceAPI, hrMastersAPI, hrEmployeesAPI, hrEsslAPI } from '../../api/client';
import toast from 'react-hot-toast';

const B = { navy:'#0A1F5C', blue:'#2563EB', yellow:'#F4C430', success:'#10B981' };
const fade = (d=0) => ({ initial:{opacity:0,y:14}, animate:{opacity:1,y:0}, transition:{duration:0.35,delay:d,ease:[0.16,1,0.3,1]} });

const STATUS_CELL = {
  present:  { bg:'bg-emerald-100 hover:bg-emerald-200', text:'text-emerald-700', label:'P'  },
  absent:   { bg:'bg-red-100 hover:bg-red-200',         text:'text-red-700',     label:'A'  },
  half_day: { bg:'bg-amber-100 hover:bg-amber-200',     text:'text-amber-700',   label:'H'  },
  leave:    { bg:'bg-blue-100 hover:bg-blue-200',       text:'text-blue-700',    label:'L'  },
  holiday:  { bg:'bg-purple-100',                       text:'text-purple-700',  label:'HO' },
  week_off: { bg:'bg-gray-100',                         text:'text-gray-500',    label:'WO' },
};

const NEXT_STATUS = { present:'absent', absent:'half_day', half_day:'leave', leave:'present' };
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

export default function AttendancePage() {
  const qc  = useQueryClient();
  const now = new Date();
  const [month,     setMonth]     = useState(now.getMonth() + 1);
  const [year,      setYear]      = useState(now.getFullYear());
  const [deptFilter,setDeptFilter]= useState('');
  const [view,      setView]      = useState('summary');
  const [syncing,   setSyncing]   = useState(false);
  const [syncResult,setSyncResult]= useState(null);

  const daysInMonth = new Date(year, month, 0).getDate();
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  const { data: deptData } = useQuery({ queryKey:['hr-departments'], queryFn:()=>hrMastersAPI.listDepts().then(r=>r.data) });
  const { data: empData  } = useQuery({ queryKey:['hr-employees-active'], queryFn:()=>hrEmployeesAPI.list({employment_status:'active'}).then(r=>r.data) });

  const { data: attData, isLoading } = useQuery({
    queryKey:['hr-attendance-grid', month, year, deptFilter],
    queryFn:()=>hrAttendanceAPI.list({ month, year, department_id: deptFilter||undefined }).then(r=>r.data),
  });
  const { data: summaryData } = useQuery({
    queryKey:['hr-attendance-summary', month, year, deptFilter],
    queryFn:()=>hrAttendanceAPI.summary({ month, year, department_id: deptFilter||undefined }).then(r=>r.data),
  });

  const employees = useMemo(() => {
    const emps = empData?.data || [];
    if (!deptFilter) return emps;
    return emps.filter(e => e.department_id === deptFilter);
  }, [empData, deptFilter]);

  const attMap = useMemo(() => {
    const map = {};
    (attData?.data || []).forEach(a => {
      const d = new Date(a.attendance_date).getDate();
      if (!map[a.user_id]) map[a.user_id] = {};
      map[a.user_id][d] = a;
    });
    return map;
  }, [attData]);

  const upsertMut = useMutation({
    mutationFn:(data)=>hrAttendanceAPI.upsert(data),
    onSuccess:()=>{
      qc.invalidateQueries({ queryKey:['hr-attendance-grid'] });
      qc.invalidateQueries({ queryKey:['hr-attendance-summary'] });
    },
    onError:e=>toast.error(e.response?.data?.error||'Error'),
  });
  const baselineMut = useMutation({
    mutationFn:()=>hrAttendanceAPI.baseline({ month, year, department_id: deptFilter||undefined, overwrite:false }),
    onSuccess:(res)=>{
      toast.success(`Monthly baseline added: ${res.data?.count||0} records`);
      qc.invalidateQueries({ queryKey:['hr-attendance-grid'] });
      qc.invalidateQueries({ queryKey:['hr-attendance-summary'] });
    },
    onError:e=>toast.error(e.response?.data?.error||'Failed to mark baseline'),
  });

  const toggleStatus = (userId, day) => {
    const dateStr = `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    const current = attMap[userId]?.[day]?.status || null;
    const next    = current ? NEXT_STATUS[current]||'present' : 'present';
    upsertMut.mutate({ user_id:userId, attendance_date:dateStr, status:next });
  };

  const isWeekend = (day) => new Date(year, month-1, day).getDay() === 0;

  const handleEsslSync = async () => {
    const from    = `${year}-${String(month).padStart(2,'0')}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const to      = `${year}-${String(month).padStart(2,'0')}-${String(lastDay).padStart(2,'0')}`;
    setSyncing(true); setSyncResult(null);
    try {
      const r = await hrEsslAPI.sync(from, to);
      setSyncResult(r.data);
      toast.success(`ESSL sync done — ${r.data.synced} records updated`);
      qc.invalidateQueries({ queryKey:['hr-attendance-grid'] });
      qc.invalidateQueries({ queryKey:['hr-attendance-summary'] });
    } catch(e) {
      const msg = e.response?.data?.error||'Sync failed';
      setSyncResult({ error:msg }); toast.error(msg);
    } finally { setSyncing(false); }
  };

  const summary = summaryData?.data || [];

  return (
    <div className="p-6 space-y-6 min-h-screen" style={{background:'#F8FAFC'}}>

      {/* Header */}
      <motion.div {...fade(0)} className="relative overflow-hidden rounded-2xl"
        style={{background:`linear-gradient(135deg,${B.navy},#1e3a8a)`,boxShadow:'0 8px 32px rgba(10,31,92,0.2)'}}>
        <div className="absolute top-0 right-0 w-64 h-64 rounded-full opacity-[0.07]"
          style={{background:'radial-gradient(circle,#fff,transparent 70%)',transform:'translate(25%,-25%)'}}/>
        <div className="relative z-10 px-8 py-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <div className="w-8 h-8 rounded-xl bg-white/15 flex items-center justify-center">
                <Calendar className="w-4 h-4 text-white"/>
              </div>
              <span className="text-white/60 text-sm font-semibold">HR & Admin</span>
            </div>
            <h1 className="text-2xl font-black text-white">Attendance</h1>
            <p className="text-white/55 text-sm mt-1">Monthly attendance tracking for permanent employees</p>
          </div>
          <div className="flex flex-wrap items-center gap-2 self-start">
            <button onClick={()=>baselineMut.mutate()} disabled={baselineMut.isPending}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold disabled:opacity-50 hover:opacity-90"
              style={{background:'rgba(255,255,255,0.15)',color:'#fff',border:'1px solid rgba(255,255,255,0.2)'}}>
              {baselineMut.isPending ? <RefreshCw className="w-4 h-4 animate-spin"/> : <CalendarCheck className="w-4 h-4"/>}
              {baselineMut.isPending ? 'Marking…' : 'Mark Month Present'}
            </button>
            <button onClick={handleEsslSync} disabled={syncing}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-black disabled:opacity-50 hover:opacity-90"
              style={{background:B.yellow,color:B.navy}}>
              {syncing ? <RefreshCw className="w-4 h-4 animate-spin"/> : <Fingerprint className="w-4 h-4"/>}
              {syncing ? 'Syncing…' : 'Sync from ESSL'}
            </button>
          </div>
        </div>
      </motion.div>

      {/* ESSL Sync Result Banner */}
      {syncResult && !syncResult.error && (
        <motion.div {...fade(0)} className="bg-violet-50 border border-violet-200 rounded-2xl px-5 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <CheckCircle className="w-5 h-5 text-violet-500 shrink-0"/>
            <div className="text-sm">
              <span className="text-violet-900 font-bold">ESSL sync complete</span>
              <span className="text-violet-600 ml-2">{syncResult.synced} synced · {syncResult.skipped} skipped · {syncResult.raw_swipes} raw swipes</span>
            </div>
          </div>
          {syncResult.not_found?.length>0 && (
            <div className="flex items-center gap-1 text-amber-600 text-xs">
              <AlertTriangle className="w-4 h-4"/>{syncResult.not_found.length} unmatched: {syncResult.not_found.join(', ')}
            </div>
          )}
          <button onClick={()=>setSyncResult(null)} className="text-gray-400 hover:text-gray-600 text-sm ml-4">✕</button>
        </motion.div>
      )}
      {syncResult?.error && (
        <motion.div {...fade(0)} className="bg-red-50 border border-red-200 rounded-2xl px-5 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2 text-red-600 text-sm"><AlertTriangle className="w-4 h-4"/> {syncResult.error}</div>
          <button onClick={()=>setSyncResult(null)} className="text-gray-400 hover:text-gray-600 text-sm">✕</button>
        </motion.div>
      )}

      {/* Controls */}
      <motion.div {...fade(0.08)} className="bg-white rounded-2xl p-4 border border-gray-100 flex flex-wrap gap-3 items-center"
        style={{boxShadow:'0 2px 12px rgba(10,31,92,0.06)'}}>
        <select value={month} onChange={e=>setMonth(parseInt(e.target.value))}
          className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 text-sm focus:outline-none focus:border-blue-400">
          {MONTHS.map((m,i)=><option key={i+1} value={i+1}>{m}</option>)}
        </select>
        <select value={year} onChange={e=>setYear(parseInt(e.target.value))}
          className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 text-sm focus:outline-none focus:border-blue-400">
          {[2024,2025,2026,2027].map(y=><option key={y} value={y}>{y}</option>)}
        </select>
        <select value={deptFilter} onChange={e=>setDeptFilter(e.target.value)}
          className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 text-sm focus:outline-none focus:border-blue-400">
          <option value="">All Departments</option>
          {(deptData?.data||[]).map(d=><option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        <div className="flex gap-1 bg-gray-100 rounded-xl p-1 ml-auto">
          <button onClick={()=>setView('summary')} className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${view==='summary'?'bg-white text-blue-700 shadow-sm':'text-gray-500 hover:text-gray-700'}`}>Summary</button>
          <button onClick={()=>setView('grid')}    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${view==='grid'   ?'bg-white text-blue-700 shadow-sm':'text-gray-500 hover:text-gray-700'}`}>Grid</button>
        </div>
      </motion.div>

      {/* Legend (grid mode) */}
      {view==='grid' && (
        <motion.div {...fade(0.10)} className="flex gap-3 flex-wrap items-center text-xs">
          {Object.entries(STATUS_CELL).map(([k,v])=>(
            <div key={k} className="flex items-center gap-1.5">
              <div className={`w-6 h-6 rounded-lg flex items-center justify-center font-bold text-[10px] ${v.bg} ${v.text}`}>{v.label}</div>
              <span className="text-gray-600 font-medium capitalize">{k.replace('_',' ')}</span>
            </div>
          ))}
          <span className="text-gray-400 ml-2 text-[11px]">Click cell to cycle status</span>
        </motion.div>
      )}

      {/* Grid View */}
      {view==='grid' && (
        <motion.div {...fade(0.12)} className="bg-white rounded-2xl border border-gray-100 overflow-x-auto"
          style={{boxShadow:'0 2px 12px rgba(10,31,92,0.06)'}}>
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <div className="w-8 h-8 rounded-full border-2 border-blue-200 border-t-blue-600 animate-spin"/>
            </div>
          ) : (
            <table className="text-xs min-w-max">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-4 py-3 text-gray-500 font-black uppercase tracking-wide sticky left-0 bg-gray-50 min-w-48">Employee</th>
                  {days.map(d=>(
                    <th key={d} className={`w-8 py-3 text-center font-bold ${isWeekend(d)?'text-gray-300':'text-gray-500'}`}>
                      <div>{d}</div>
                      <div className="text-[9px] text-gray-400">{['Su','Mo','Tu','We','Th','Fr','Sa'][new Date(year,month-1,d).getDay()]}</div>
                    </th>
                  ))}
                  <th className="text-center px-2 py-3 text-emerald-600 font-black text-[11px]">P</th>
                  <th className="text-center px-2 py-3 text-red-500 font-black text-[11px]">A</th>
                  <th className="text-center px-2 py-3 text-amber-600 font-black text-[11px]">H</th>
                </tr>
              </thead>
              <tbody>
                {employees.map(emp=>{
                  const empAtt = attMap[emp.id]||{};
                  const pCount = Object.values(empAtt).filter(a=>a.status==='present').length;
                  const aCount = Object.values(empAtt).filter(a=>a.status==='absent').length;
                  const hCount = Object.values(empAtt).filter(a=>a.status==='half_day').length;
                  return (
                    <tr key={emp.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-2 sticky left-0 bg-white">
                        <div className="font-bold text-gray-900">{emp.name}</div>
                        <div className="text-gray-400 text-[10px]">{emp.employee_code}</div>
                      </td>
                      {days.map(d=>{
                        const att    = empAtt[d];
                        const style  = att ? STATUS_CELL[att.status] : null;
                        const isSun  = isWeekend(d);
                        return (
                          <td key={d} className="w-8 p-0.5">
                            <div
                              className={`w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-bold cursor-pointer transition-colors ${
                                isSun ? 'bg-gray-50 text-gray-300 cursor-default' :
                                style ? `${style.bg} ${style.text}` :
                                'hover:bg-gray-100 text-gray-300'
                              }`}
                              onClick={()=>!isSun && toggleStatus(emp.id, d)}
                              title={att?.status||'Not marked'}
                            >
                              {isSun ? '—' : (style?.label || '·')}
                            </div>
                          </td>
                        );
                      })}
                      <td className="text-center px-2 py-2 text-emerald-600 font-black">{pCount}</td>
                      <td className="text-center px-2 py-2 text-red-500 font-black">{aCount}</td>
                      <td className="text-center px-2 py-2 text-amber-600 font-black">{hCount}</td>
                    </tr>
                  );
                })}
                {employees.length===0 && (
                  <tr><td colSpan={daysInMonth+4} className="text-center py-10 text-gray-400">No employees found</td></tr>
                )}
              </tbody>
            </table>
          )}
        </motion.div>
      )}

      {/* Summary View */}
      {view==='summary' && (
        <motion.div {...fade(0.12)} className="bg-white rounded-2xl border border-gray-100 overflow-hidden"
          style={{boxShadow:'0 2px 12px rgba(10,31,92,0.06)'}}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  {['Employee','Department','Present','Absent','Half Day','Leave','Total Marked'].map(h=>(
                    <th key={h} className="text-left px-4 py-3 text-xs font-black text-gray-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {summary.map(s=>(
                  <tr key={s.user_id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="font-bold text-gray-900">{s.name}</div>
                      <div className="text-gray-400 text-xs">{s.employee_code}</div>
                    </td>
                    <td className="px-4 py-3 text-gray-500">{s.department_name||'—'}</td>
                    <td className="px-4 py-3 text-emerald-600 font-black">{s.present}</td>
                    <td className="px-4 py-3 text-red-500 font-black">{s.absent}</td>
                    <td className="px-4 py-3 text-amber-600 font-black">{s.half_day}</td>
                    <td className="px-4 py-3 text-blue-600 font-black">{s.on_leave}</td>
                    <td className="px-4 py-3 text-gray-700 font-bold">{s.total_marked}</td>
                  </tr>
                ))}
                {summary.length===0 && (
                  <tr>
                    <td colSpan={7} className="text-center py-14">
                      <div className="w-12 h-12 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-3">
                        <Calendar className="w-6 h-6 text-gray-300"/>
                      </div>
                      <p className="text-gray-500 font-bold">No attendance data</p>
                      <p className="text-gray-400 text-xs mt-1">{MONTHS[month-1]} {year}</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </motion.div>
      )}
    </div>
  );
}
