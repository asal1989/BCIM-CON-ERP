// src/pages/hr-admin/AttendancePage.jsx — 2026 Premium UI
import React, { useState, useMemo, useRef } from 'react';
import { motion } from 'framer-motion';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Calendar, Fingerprint, RefreshCw, CheckCircle, AlertTriangle, CalendarCheck, Clock, Download } from 'lucide-react';
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
const DAYS   = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

// hh:mm string → total minutes
const toMins = (t) => { if (!t) return null; const [h,m] = t.split(':').map(Number); return h*60+(m||0); };
// minutes → "Xh Ym"
const fmtHrs = (mins) => { if (mins == null || mins <= 0) return '—'; const h=Math.floor(mins/60),m=mins%60; return m ? `${h}h ${m}m` : `${h}h`; };

// ── Inline editable time cell ─────────────────────────────────────────────────
function TimeCell({ value, onSave, disabled }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(value || '');
  const ref = useRef();

  const commit = () => {
    setEditing(false);
    if ((val || '') !== (value || '')) onSave(val || null);
  };

  if (disabled) return <span className="text-slate-300 text-xs">—</span>;

  if (editing) return (
    <input ref={ref} type="time" value={val} autoFocus
      onChange={e => setVal(e.target.value)}
      onBlur={commit}
      onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false); }}
      className="w-20 border border-indigo-400 rounded-lg px-1.5 py-0.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-200"
    />
  );
  return (
    <button onClick={() => { setVal(value || ''); setEditing(true); }}
      className="text-xs font-mono px-2 py-0.5 rounded hover:bg-indigo-50 border border-transparent hover:border-indigo-200 transition min-w-[56px] text-left">
      {value || <span className="text-slate-300">--:--</span>}
    </button>
  );
}

// ── Per-employee monthly timesheet ─────────────────────────────────────────────
function TimesheetView({ month, year, allEmployees, qc }) {
  const [empId, setEmpId] = useState('');
  const daysInMonth = new Date(year, month, 0).getDate();

  const { data: attData, isLoading } = useQuery({
    queryKey: ['hr-timesheet', month, year, empId],
    queryFn: () => hrAttendanceAPI.list({ month, year, user_id: empId }).then(r => r.data),
    enabled: !!empId,
  });

  // Build a map: day → attendance record
  const recMap = useMemo(() => {
    const m = {};
    (attData?.data || []).forEach(a => {
      const d = new Date(a.attendance_date).getDate();
      m[d] = a;
    });
    return m;
  }, [attData]);

  const upsertMut = useMutation({
    mutationFn: (data) => hrAttendanceAPI.upsert(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['hr-timesheet', month, year, empId] }),
    onError: e => toast.error(e.response?.data?.error || 'Failed to save'),
  });
  const updateMut = useMutation({
    mutationFn: ({ id, ...data }) => hrAttendanceAPI.update(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['hr-timesheet', month, year, empId] }),
    onError: e => toast.error(e.response?.data?.error || 'Failed to save'),
  });

  const saveField = (day, field, value) => {
    const dateStr = `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    const rec = recMap[day];
    if (rec?.id) {
      updateMut.mutate({ id: rec.id, [field]: value,
        status: rec.status, in_time: rec.in_time, out_time: rec.out_time,
        late_minutes: rec.late_minutes, remarks: rec.remarks,
        // override with the new field value
        ...{ [field]: value },
      });
    } else {
      upsertMut.mutate({ user_id: empId, attendance_date: dateStr, status: 'present', [field]: value });
    }
  };

  const toggleStatus = (day) => {
    const dateStr = `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    const rec = recMap[day];
    const next = rec ? (NEXT_STATUS[rec.status] || 'present') : 'present';
    if (rec?.id) {
      updateMut.mutate({ id: rec.id, status: next, in_time: rec.in_time, out_time: rec.out_time, late_minutes: rec.late_minutes, remarks: rec.remarks });
    } else {
      upsertMut.mutate({ user_id: empId, attendance_date: dateStr, status: next });
    }
  };

  // Monthly totals
  const totals = useMemo(() => {
    let present=0, absent=0, halfDay=0, leave=0, totalMins=0, lateDays=0, otMins=0;
    for (let d=1; d<=daysInMonth; d++) {
      const rec = recMap[d];
      if (!rec) continue;
      if (rec.status === 'present') present++;
      else if (rec.status === 'absent') absent++;
      else if (rec.status === 'half_day') halfDay++;
      else if (rec.status === 'leave') leave++;
      const inM = toMins(rec.in_time), outM = toMins(rec.out_time);
      if (inM != null && outM != null && outM > inM) {
        const worked = outM - inM;
        totalMins += worked;
        if (worked > 480) otMins += worked - 480; // > 8h is OT
      }
      if (rec.late_minutes > 0) lateDays++;
    }
    return { present, absent, halfDay, leave, totalMins, lateDays, otMins };
  }, [recMap, daysInMonth]);

  const selectedEmp = allEmployees.find(e => e.id === empId);

  return (
    <div className="space-y-4">
      {/* Employee selector + export hint */}
      <div className="bg-white rounded-2xl border border-gray-100 p-4 flex flex-wrap items-center gap-3"
        style={{ boxShadow: '0 2px 12px rgba(10,31,92,0.06)' }}>
        <Clock className="w-4 h-4 text-indigo-500 shrink-0" />
        <span className="text-sm font-semibold text-slate-600">Employee Timesheet</span>
        <select value={empId} onChange={e => setEmpId(e.target.value)}
          className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 text-sm focus:outline-none focus:border-indigo-400 min-w-52">
          <option value="">— Select Employee —</option>
          {allEmployees.map(e => (
            <option key={e.id} value={e.id}>{e.name}{e.employee_code ? ` (${e.employee_code})` : ''}</option>
          ))}
        </select>
        {selectedEmp && (
          <span className="text-xs text-slate-400 ml-1">
            {MONTHS[month-1]} {year} · click any In/Out cell to edit
          </span>
        )}
      </div>

      {!empId && (
        <div className="bg-white rounded-2xl border border-gray-100 py-20 text-center">
          <Clock className="w-10 h-10 text-slate-200 mx-auto mb-3" />
          <p className="text-slate-500 font-semibold">Select an employee to view their timesheet</p>
        </div>
      )}

      {empId && isLoading && (
        <div className="bg-white rounded-2xl border border-gray-100 flex items-center justify-center py-16">
          <div className="w-8 h-8 rounded-full border-2 border-indigo-200 border-t-indigo-600 animate-spin" />
        </div>
      )}

      {empId && !isLoading && (
        <>
          {/* KPI summary */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {[
              { label: 'Present',       value: totals.present,           color: 'text-emerald-600', bg: 'bg-emerald-50 border-emerald-200' },
              { label: 'Absent',        value: totals.absent,            color: 'text-red-600',     bg: 'bg-red-50 border-red-200' },
              { label: 'Half Day',      value: totals.halfDay,           color: 'text-amber-600',   bg: 'bg-amber-50 border-amber-200' },
              { label: 'Total Hours',   value: fmtHrs(totals.totalMins), color: 'text-indigo-700',  bg: 'bg-indigo-50 border-indigo-200' },
              { label: 'Overtime',      value: fmtHrs(totals.otMins),    color: 'text-purple-600',  bg: 'bg-purple-50 border-purple-200' },
            ].map(c => (
              <div key={c.label} className={`rounded-xl border p-3 text-center ${c.bg}`}>
                <div className={`text-2xl font-black ${c.color}`}>{c.value}</div>
                <div className="text-[11px] text-slate-500 font-semibold mt-0.5">{c.label}</div>
              </div>
            ))}
          </div>

          {/* Day-by-day table */}
          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden"
            style={{ boxShadow: '0 2px 12px rgba(10,31,92,0.06)' }}>
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100 text-[11px] uppercase tracking-wide text-slate-500 font-bold">
                  <th className="text-left px-4 py-3">Date</th>
                  <th className="text-left px-4 py-3">Day</th>
                  <th className="text-center px-4 py-3">Status</th>
                  <th className="text-center px-4 py-3">In Time</th>
                  <th className="text-center px-4 py-3">Out Time</th>
                  <th className="text-right px-4 py-3">Hours</th>
                  <th className="text-right px-4 py-3">Late (min)</th>
                  <th className="text-left px-4 py-3">Remarks</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(d => {
                  const date    = new Date(year, month-1, d);
                  const dayName = DAYS[date.getDay()];
                  const isSun   = date.getDay() === 0;
                  const rec     = recMap[d];
                  const st      = rec ? STATUS_CELL[rec.status] : null;
                  const inM     = toMins(rec?.in_time);
                  const outM    = toMins(rec?.out_time);
                  const workedMins = (inM != null && outM != null && outM > inM) ? outM - inM : null;
                  const isOT    = workedMins != null && workedMins > 480;
                  const dateStr = `${year}-${String(month).padStart(2,'0')}-${String(d).padStart(2,'0')}`;

                  return (
                    <tr key={d} className={`transition-colors hover:bg-slate-50 ${isSun ? 'bg-gray-50/60' : ''}`}>
                      <td className="px-4 py-2.5">
                        <span className="font-mono text-xs font-semibold text-slate-700">
                          {dateStr}
                        </span>
                      </td>
                      <td className={`px-4 py-2.5 text-xs font-semibold ${isSun ? 'text-rose-400' : 'text-slate-500'}`}>
                        {dayName}
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        {isSun ? (
                          <span className="text-[10px] font-bold bg-gray-100 text-gray-400 px-2 py-0.5 rounded-full">WO</span>
                        ) : (
                          <button onClick={() => toggleStatus(d)}
                            className={`text-[10px] font-bold px-2 py-0.5 rounded-full border transition hover:opacity-80 ${st ? `${st.bg.split(' ')[0]} ${st.text}` : 'bg-slate-100 text-slate-400 border-slate-200'}`}>
                            {st?.label || '·'}
                          </button>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <TimeCell
                          value={rec?.in_time}
                          disabled={isSun || rec?.status === 'absent' || rec?.status === 'week_off'}
                          onSave={v => saveField(d, 'in_time', v)}
                        />
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <TimeCell
                          value={rec?.out_time}
                          disabled={isSun || rec?.status === 'absent' || rec?.status === 'week_off'}
                          onSave={v => saveField(d, 'out_time', v)}
                        />
                      </td>
                      <td className={`px-4 py-2.5 text-right text-xs font-bold ${isOT ? 'text-purple-600' : 'text-slate-600'}`}>
                        {fmtHrs(workedMins)}
                        {isOT && <span className="ml-1 text-[9px] bg-purple-100 text-purple-600 px-1 rounded">OT</span>}
                      </td>
                      <td className={`px-4 py-2.5 text-right text-xs ${rec?.late_minutes > 0 ? 'text-rose-500 font-bold' : 'text-slate-300'}`}>
                        {rec?.late_minutes > 0 ? rec.late_minutes : '—'}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-slate-400 max-w-[160px] truncate">
                        {rec?.remarks || ''}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              {/* Footer totals */}
              <tfoot>
                <tr className="bg-slate-800 text-xs font-bold">
                  <td className="px-4 py-3 text-slate-300 col-span-2" colSpan={2}>Monthly Total</td>
                  <td className="px-4 py-3 text-center text-white">{totals.present}P / {totals.absent}A</td>
                  <td colSpan={2} />
                  <td className="px-4 py-3 text-right text-indigo-300">{fmtHrs(totals.totalMins)}</td>
                  <td className="px-4 py-3 text-right text-rose-300">{totals.lateDays} late</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

export default function AttendancePage() {
  const qc  = useQueryClient();
  const now = new Date();
  const [month,     setMonth]     = useState(now.getMonth() + 1);
  const [year,      setYear]      = useState(now.getFullYear());
  const [deptFilter,setDeptFilter]= useState('');
  const [view,      setView]      = useState('summary');
  const [syncing,   setSyncing]   = useState(false);
  const [syncResult,setSyncResult]= useState(null);
  const allEmployees = useMemo(() => empData?.data || [], [empData]);

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
          <button onClick={()=>setView('summary')}   className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${view==='summary'  ?'bg-white text-blue-700 shadow-sm':'text-gray-500 hover:text-gray-700'}`}>Summary</button>
          <button onClick={()=>setView('grid')}      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${view==='grid'     ?'bg-white text-blue-700 shadow-sm':'text-gray-500 hover:text-gray-700'}`}>Grid</button>
          <button onClick={()=>setView('timesheet')} className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${view==='timesheet'?'bg-white text-indigo-700 shadow-sm':'text-gray-500 hover:text-gray-700'}`}>Timesheet</button>
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

      {/* Timesheet View */}
      {view==='timesheet' && (
        <motion.div {...fade(0.12)}>
          <TimesheetView month={month} year={year} allEmployees={allEmployees} qc={qc} />
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
