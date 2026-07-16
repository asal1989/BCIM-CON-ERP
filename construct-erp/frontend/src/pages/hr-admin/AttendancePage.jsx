// src/pages/hr-admin/AttendancePage.jsx
import React, { useState, useMemo, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Calendar, Fingerprint, RefreshCw, CheckCircle, AlertTriangle,
  CalendarCheck, Clock, Mail, Send, Search, Users, UserCheck,
  UserX, Clock3, Palmtree, ChevronRight,
} from 'lucide-react';
import { hrAttendanceAPI, hrMastersAPI, hrEsslAPI, projectAPI } from '../../api/client';
import toast from 'react-hot-toast';

// ── Constants ─────────────────────────────────────────────────────────────────
const STATUS_CELL = {
  present:  { bg:'#DCFCE7', text:'#15803D', label:'P'  },
  absent:   { bg:'#FEE2E2', text:'#B91C1C', label:'A'  },
  half_day: { bg:'#DBEAFE', text:'#1D4ED8', label:'H'  },
  leave:    { bg:'#FEF3C7', text:'#B45309', label:'L'  },
  holiday:  { bg:'#EDE9FE', text:'#6D28D9', label:'HO' },
  week_off: { bg:'#F1F5F9', text:'#94A3B8', label:'WO' },
};
const STATUS_META = {
  present:  { bg:'#DCFCE7', color:'#15803D', dot:'#22C55E', label:'Present'  },
  absent:   { bg:'#FEE2E2', color:'#B91C1C', dot:'#EF4444', label:'Absent'   },
  half_day: { bg:'#DBEAFE', color:'#1D4ED8', dot:'#3B82F6', label:'Half day' },
  leave:    { bg:'#FEF3C7', color:'#B45309', dot:'#F59E0B', label:'Leave'    },
  holiday:  { bg:'#EDE9FE', color:'#6D28D9', dot:'#8B5CF6', label:'Holiday'  },
  week_off: { bg:'#F1F5F9', color:'#475569', dot:'#94A3B8', label:'Week off' },
};
const NEXT_STATUS = { present:'absent', absent:'half_day', half_day:'leave', leave:'present' };
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAYS   = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const toMins = (t) => { if (!t) return null; const [h,m]=t.split(':').map(Number); return h*60+(m||0); };
const fmtHrs = (mins) => { if (!mins || mins<=0) return '—'; const h=Math.floor(mins/60),m=mins%60; return m?`${h}h ${m}m`:`${h}h`; };

// ── Shared components ─────────────────────────────────────────────────────────
function StatusPill({ status }) {
  const m = STATUS_META[status];
  if (!m) return <span style={{ color:'#CBD5E1', fontSize:11 }}>—</span>;
  return (
    <span style={{ background:m.bg, color:m.color, borderRadius:999, padding:'2px 10px 2px 7px',
      fontWeight:700, fontSize:10.5, display:'inline-flex', alignItems:'center', gap:5, whiteSpace:'nowrap' }}>
      <span style={{ width:6, height:6, borderRadius:'50%', background:m.dot, flexShrink:0 }}/>
      {m.label}
    </span>
  );
}
function Avatar({ name }) {
  const initials = (name||'?').split(' ').map(w=>w[0]).filter(Boolean).slice(0,2).join('').toUpperCase();
  let hash = 0;
  for (const ch of (name||'')) hash = (hash*31+ch.charCodeAt(0))%360;
  return (
    <span style={{ width:30, height:30, borderRadius:'50%', flexShrink:0,
      background:`hsl(${hash},48%,90%)`, color:`hsl(${hash},48%,32%)`,
      display:'inline-flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:700 }}>
      {initials}
    </span>
  );
}

// Segmented attendance bar (Greyt-style)
function AttBar({ p=0, a=0, h=0, l=0 }) {
  const total = (p+a+h+l) || 1;
  const pp = p/total*100, ap = a/total*100, hp = h/total*100, lp = l/total*100;
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
      <div style={{ height:6, borderRadius:3, overflow:'hidden', display:'flex', background:'#F1F5F9', width:120 }}>
        <div style={{ width:`${pp}%`, background:'#057A55' }}/>
        <div style={{ width:`${ap}%`, background:'#DC2626' }}/>
        <div style={{ width:`${hp}%`, background:'#D97706' }}/>
        <div style={{ width:`${lp}%`, background:'#2563EB' }}/>
      </div>
      <div style={{ display:'flex', gap:8, fontSize:11, fontVariantNumeric:'tabular-nums' }}>
        {p>0 && <span style={{ color:'#057A55', fontWeight:700 }}>{p}P</span>}
        {a>0 && <span style={{ color:'#DC2626', fontWeight:700 }}>{a}A</span>}
        {h>0 && <span style={{ color:'#D97706', fontWeight:700 }}>{h}H</span>}
        {l>0 && <span style={{ color:'#2563EB', fontWeight:700 }}>{l}L</span>}
      </div>
    </div>
  );
}

// SVG donut ring (Zoho-style)
function DonutRing({ pct }) {
  const r = 38, cx = 48, cy = 48;
  const circ = 2 * Math.PI * r;
  const filled = (pct / 100) * circ;
  const color = pct >= 85 ? '#057A55' : pct >= 60 ? '#D97706' : '#DC2626';
  return (
    <svg width={96} height={96} viewBox="0 0 96 96" aria-label={`${pct}% attendance rate`}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#E5E7EB" strokeWidth={9}/>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth={9}
        strokeDasharray={`${filled} ${circ}`} strokeLinecap="round"
        transform={`rotate(-90 ${cx} ${cy})`}/>
      <text x={cx} y={cy-4} textAnchor="middle" fontSize={18} fontWeight={700}
        fill="#111827" fontFamily="inherit">{pct}%</text>
      <text x={cx} y={cy+12} textAnchor="middle" fontSize={10}
        fill="#9CA3AF" fontFamily="inherit">rate</text>
    </svg>
  );
}

// ── Inline time editor ────────────────────────────────────────────────────────
function TimeCell({ value, onSave, disabled }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(value||'');
  const commit = () => { setEditing(false); if ((val||'')!==(value||'')) onSave(val||null); };
  if (disabled) return <span style={{ color:'#CBD5E1', fontSize:11 }}>—</span>;
  if (editing) return (
    <input type="time" value={val} autoFocus style={{ width:80, border:'1px solid #818CF8', borderRadius:6, padding:'2px 6px', fontSize:12, outline:'none' }}
      onChange={e=>setVal(e.target.value)} onBlur={commit}
      onKeyDown={e=>{ if(e.key==='Enter') commit(); if(e.key==='Escape') setEditing(false); }}/>
  );
  return (
    <button onClick={()=>{ setVal(value||''); setEditing(true); }}
      style={{ fontSize:12, fontFamily:'monospace', padding:'2px 8px', borderRadius:6, border:'1px solid transparent',
        background:'transparent', cursor:'pointer', minWidth:56, textAlign:'left', color: value?'#374151':'#CBD5E1' }}
      onMouseEnter={e=>{e.target.style.borderColor='#C7D2FE';e.target.style.background='#EEF2FF'}}
      onMouseLeave={e=>{e.target.style.borderColor='transparent';e.target.style.background='transparent'}}>
      {value||'--:--'}
    </button>
  );
}

// ── Per-employee timesheet ────────────────────────────────────────────────────
function TimesheetView({ month, year, allEmployees, qc }) {
  const [empId, setEmpId] = useState('');
  const daysInMonth = new Date(year, month, 0).getDate();
  const { data: attData, isLoading } = useQuery({
    queryKey:['hr-timesheet', month, year, empId],
    queryFn:()=>hrAttendanceAPI.list({ month, year, user_id:empId }).then(r=>r.data),
    enabled:!!empId,
  });
  const recMap = useMemo(()=>{ const m={}; (attData?.data||[]).forEach(a=>{ m[new Date(a.attendance_date).getDate()]=a; }); return m; }, [attData]);
  const upsertMut = useMutation({ mutationFn:(d)=>hrAttendanceAPI.upsert(d), onSuccess:()=>qc.invalidateQueries({queryKey:['hr-timesheet',month,year,empId]}), onError:e=>toast.error(e.response?.data?.error||'Failed') });
  const updateMut = useMutation({ mutationFn:({id,...d})=>hrAttendanceAPI.update(id,d), onSuccess:()=>qc.invalidateQueries({queryKey:['hr-timesheet',month,year,empId]}), onError:e=>toast.error(e.response?.data?.error||'Failed') });
  const saveField = (day, field, value) => {
    const dateStr=`${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    const rec=recMap[day];
    if (rec?.id) updateMut.mutate({ id:rec.id, status:rec.status, in_time:rec.in_time, out_time:rec.out_time, late_minutes:rec.late_minutes, remarks:rec.remarks, [field]:value });
    else upsertMut.mutate({ user_id:empId, attendance_date:dateStr, status:'present', [field]:value });
  };
  const toggleStatus = (day) => {
    const dateStr=`${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    const rec=recMap[day];
    const next=rec?(NEXT_STATUS[rec.status]||'present'):'present';
    if (rec?.id) updateMut.mutate({ id:rec.id, status:next, in_time:rec.in_time, out_time:rec.out_time, late_minutes:rec.late_minutes, remarks:rec.remarks });
    else upsertMut.mutate({ user_id:empId, attendance_date:dateStr, status:next });
  };
  const totals = useMemo(()=>{
    let present=0,absent=0,halfDay=0,leave=0,totalMins=0,lateDays=0,otMins=0;
    for (let d=1;d<=daysInMonth;d++) {
      const r=recMap[d]; if (!r) continue;
      if (r.status==='present') present++; else if (r.status==='absent') absent++;
      else if (r.status==='half_day') halfDay++; else if (r.status==='leave') leave++;
      const inM=toMins(r.in_time),outM=toMins(r.out_time);
      if (inM!=null&&outM!=null&&outM>inM) { const w=outM-inM; totalMins+=w; if(w>480) otMins+=w-480; }
      if (r.late_minutes>0) lateDays++;
    }
    return { present,absent,halfDay,leave,totalMins,lateDays,otMins };
  }, [recMap, daysInMonth]);

  const S = {
    card: { background:'#fff', border:'0.5px solid #E5E7EB', borderRadius:12, padding:'12px 16px' },
    th: { fontSize:11, fontWeight:700, color:'#6B7280', textAlign:'left', padding:'10px 12px', background:'#F9FAFB', borderBottom:'0.5px solid #E5E7EB', textTransform:'uppercase', letterSpacing:'.04em' },
    td: { padding:'9px 12px', fontSize:13, borderBottom:'0.5px solid #F1F5F9', verticalAlign:'middle' },
  };

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
      <div style={S.card}>
        <div style={{ display:'flex', alignItems:'center', gap:10, flexWrap:'wrap' }}>
          <Clock size={15} color="#6366F1"/>
          <span style={{ fontSize:13, fontWeight:700, color:'#374151' }}>Employee timesheet</span>
          <select value={empId} onChange={e=>setEmpId(e.target.value)}
            style={{ padding:'6px 10px', border:'0.5px solid #D1D5DB', borderRadius:8, fontSize:13, background:'#F9FAFB', color:'#111827', minWidth:220 }}>
            <option value="">— Select employee —</option>
            {allEmployees.map(e=><option key={e.id} value={e.id}>{e.name}{e.employee_code?` (${e.employee_code})`:''}</option>)}
          </select>
          {empId && <span style={{ fontSize:11, color:'#9CA3AF' }}>{MONTHS[month-1]} {year} · click In/Out to edit</span>}
        </div>
      </div>

      {!empId && (
        <div style={{ ...S.card, textAlign:'center', padding:'56px 16px' }}>
          <Clock size={32} color="#E5E7EB" style={{ margin:'0 auto 10px' }}/>
          <p style={{ color:'#6B7280', fontWeight:600, fontSize:14 }}>Select an employee to view their timesheet</p>
        </div>
      )}

      {empId && isLoading && (
        <div style={{ ...S.card, display:'flex', justifyContent:'center', padding:'48px 16px' }}>
          <div style={{ width:28, height:28, borderRadius:'50%', border:'2px solid #C7D2FE', borderTopColor:'#6366F1', animation:'spin 0.8s linear infinite' }}/>
        </div>
      )}

      {empId && !isLoading && (
        <>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:10 }}>
            {[
              { label:'Present',     val:totals.present,           color:'#057A55', bg:'#F0FDF4', border:'#057A55' },
              { label:'Absent',      val:totals.absent,            color:'#DC2626', bg:'#FEF2F2', border:'#DC2626' },
              { label:'Half day',    val:totals.halfDay,           color:'#D97706', bg:'#FFFBEB', border:'#D97706' },
              { label:'Total hours', val:fmtHrs(totals.totalMins), color:'#4F46E5', bg:'#EEF2FF', border:'#4F46E5' },
              { label:'Overtime',    val:fmtHrs(totals.otMins),    color:'#7C3AED', bg:'#F5F3FF', border:'#7C3AED' },
            ].map(c=>(
              <div key={c.label} style={{ background:c.bg, border:`0.5px solid ${c.border}30`, borderLeft:`3px solid ${c.border}`, borderRadius:10, padding:'12px 14px' }}>
                <div style={{ fontSize:22, fontWeight:800, color:c.color, fontVariantNumeric:'tabular-nums' }}>{c.val}</div>
                <div style={{ fontSize:11, color:'#6B7280', fontWeight:600, marginTop:3 }}>{c.label}</div>
              </div>
            ))}
          </div>

          <div style={{ background:'#fff', border:'0.5px solid #E5E7EB', borderRadius:12, overflow:'hidden' }}>
            <div style={{ overflowX:'auto' }}>
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
                <thead>
                  <tr>
                    {['Date','Day','Status','In time','Out time','Hours','Late (min)','Remarks'].map(h=>(
                      <th key={h} style={{ ...S.th, textAlign: h==='Hours'||h==='Late (min)'?'right':'left' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length:daysInMonth },(_,i)=>i+1).map(d=>{
                    const date=new Date(year,month-1,d);
                    const dayName=DAYS[date.getDay()];
                    const isSun=date.getDay()===0;
                    const rec=recMap[d];
                    const sc=rec?STATUS_CELL[rec.status]:null;
                    const inM=toMins(rec?.in_time),outM=toMins(rec?.out_time);
                    const workedMins=(inM!=null&&outM!=null&&outM>inM)?outM-inM:null;
                    const isOT=workedMins!=null&&workedMins>480;
                    const dateStr=`${year}-${String(month).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
                    return (
                      <tr key={d} style={{ background: isSun?'#F9FAFB':'transparent' }}
                        onMouseEnter={e=>e.currentTarget.style.background='#F8FAFC'}
                        onMouseLeave={e=>e.currentTarget.style.background=isSun?'#F9FAFB':'transparent'}>
                        <td style={{ ...S.td, fontFamily:'monospace', fontSize:12, fontWeight:700, color:'#374151' }}>{dateStr}</td>
                        <td style={{ ...S.td, fontSize:12, fontWeight:600, color: isSun?'#F87171':'#6B7280' }}>{dayName}</td>
                        <td style={{ ...S.td, textAlign:'center' }}>
                          {isSun
                            ? <span style={{ fontSize:10, fontWeight:700, background:'#F1F5F9', color:'#94A3B8', padding:'2px 8px', borderRadius:999 }}>WO</span>
                            : <button onClick={()=>toggleStatus(d)}
                                style={{ fontSize:10, fontWeight:700, padding:'2px 10px', borderRadius:999, border:'none', cursor:'pointer',
                                  background: sc?sc.bg:'#F1F5F9', color: sc?sc.text:'#94A3B8' }}>
                                {sc?.label||'·'}
                              </button>
                          }
                        </td>
                        <td style={{ ...S.td, textAlign:'center' }}>
                          <TimeCell value={rec?.in_time} disabled={isSun||rec?.status==='absent'||rec?.status==='week_off'} onSave={v=>saveField(d,'in_time',v)}/>
                        </td>
                        <td style={{ ...S.td, textAlign:'center' }}>
                          <TimeCell value={rec?.out_time} disabled={isSun||rec?.status==='absent'||rec?.status==='week_off'} onSave={v=>saveField(d,'out_time',v)}/>
                        </td>
                        <td style={{ ...S.td, textAlign:'right', fontWeight:700, color: isOT?'#7C3AED':'#374151' }}>
                          {fmtHrs(workedMins)}
                          {isOT&&<span style={{ marginLeft:4, fontSize:9, background:'#EDE9FE', color:'#7C3AED', padding:'1px 5px', borderRadius:4 }}>OT</span>}
                        </td>
                        <td style={{ ...S.td, textAlign:'right', color: rec?.late_minutes>0?'#F87171':'#CBD5E1', fontWeight: rec?.late_minutes>0?700:400 }}>
                          {rec?.late_minutes>0?rec.late_minutes:'—'}
                        </td>
                        <td style={{ ...S.td, color:'#9CA3AF', maxWidth:160, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                          {rec?.remarks||''}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr style={{ background:'#1E293B' }}>
                    <td colSpan={2} style={{ ...S.td, color:'#94A3B8', fontWeight:700, fontSize:12 }}>Monthly total</td>
                    <td style={{ ...S.td, textAlign:'center', color:'#fff', fontWeight:700 }}>{totals.present}P / {totals.absent}A</td>
                    <td colSpan={2}/>
                    <td style={{ ...S.td, textAlign:'right', color:'#A5B4FC', fontWeight:700 }}>{fmtHrs(totals.totalMins)}</td>
                    <td style={{ ...S.td, textAlign:'right', color:'#FCA5A5', fontWeight:700 }}>{totals.lateDays} late</td>
                    <td/>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function AttendancePage() {
  const qc  = useQueryClient();
  const now = new Date();
  const [month,        setMonth]        = useState(now.getMonth()+1);
  const [year,         setYear]         = useState(now.getFullYear());
  const [deptFilter,   setDeptFilter]   = useState('');
  const [projectFilter,setProjectFilter]= useState('');
  const [view,         setView]         = useState('summary');
  const [syncing,      setSyncing]      = useState(false);
  const [syncResult,   setSyncResult]   = useState(null);
  const [dailyDate,    setDailyDate]    = useState(now.toISOString().split('T')[0]);
  const [empSearch,    setEmpSearch]    = useState('');
  const [alertResult,  setAlertResult]  = useState(null);

  const daysInMonth = new Date(year,month,0).getDate();
  const days = Array.from({ length:daysInMonth },(_,i)=>i+1);

  const { data:deptData }     = useQuery({ queryKey:['hr-departments'],  queryFn:()=>hrMastersAPI.listDepts().then(r=>r.data) });
  const { data:projectsData } = useQuery({ queryKey:['projects-active'], queryFn:()=>projectAPI.list({ is_active:true }).then(r=>r.data) });
  const { data:attData, isLoading } = useQuery({
    queryKey:['hr-attendance-grid', month, year, deptFilter, projectFilter],
    queryFn:()=>hrAttendanceAPI.list({ month, year, department_id:deptFilter||undefined, project_id:projectFilter||undefined }).then(r=>r.data),
  });
  const { data:summaryData } = useQuery({
    queryKey:['hr-attendance-summary', month, year, deptFilter, projectFilter],
    queryFn:()=>hrAttendanceAPI.summary({ month, year, department_id:deptFilter||undefined, project_id:projectFilter||undefined }).then(r=>r.data),
  });
  const { data:dailyData, isLoading:dailyLoading } = useQuery({
    queryKey:['hr-attendance-daily', dailyDate, deptFilter, projectFilter],
    queryFn:()=>hrAttendanceAPI.list({ date:dailyDate, department_id:deptFilter||undefined, project_id:projectFilter||undefined }).then(r=>r.data),
    enabled: view==='daily',
  });

  const allEmployees = useMemo(()=>(summaryData?.data||[]).map(s=>({ id:s.user_id, name:s.name, employee_code:s.employee_code, department_id:s.department_id, department_name:s.department_name })), [summaryData]);
  const employees = useMemo(()=>{ const e=allEmployees; if (!deptFilter) return e; return e.filter(x=>x.department_id===deptFilter); }, [allEmployees, deptFilter]);

  const attMap = useMemo(()=>{
    const map={}; (attData?.data||[]).forEach(a=>{ const d=new Date(a.attendance_date).getDate(); if (!map[a.user_id]) map[a.user_id]={}; map[a.user_id][d]=a; }); return map;
  }, [attData]);

  const upsertMut = useMutation({
    mutationFn:(d)=>hrAttendanceAPI.upsert(d),
    onSuccess:()=>{ qc.invalidateQueries({queryKey:['hr-attendance-grid']}); qc.invalidateQueries({queryKey:['hr-attendance-summary']}); },
    onError:e=>toast.error(e.response?.data?.error||'Error'),
  });
  const baselineMut = useMutation({
    mutationFn:()=>hrAttendanceAPI.baseline({ month, year, department_id:deptFilter||undefined, project_id:projectFilter||undefined, overwrite:false }),
    onSuccess:(res)=>{ toast.success(`Monthly baseline added: ${res.data?.count||0} records`); qc.invalidateQueries({queryKey:['hr-attendance-grid']}); qc.invalidateQueries({queryKey:['hr-attendance-summary']}); },
    onError:e=>toast.error(e.response?.data?.error||'Failed'),
  });
  const testMailMut = useMutation({
    mutationFn:()=>hrAttendanceAPI.testLateAlert(),
    onSuccess:(res)=>{ const d=res.data||{}; toast.success(d.usedRealRecord?`Test email sent to ${d.sentTo}`:`Test email sent to ${d.sentTo} (sample data)`, { duration:6000 }); },
    onError:e=>toast.error(e.response?.data?.error||'Failed'),
  });
  const runAlertsMut = useMutation({
    mutationFn:()=>hrAttendanceAPI.runLateAlerts({ date:new Date().toISOString().slice(0,10), minLateMinutes:5 }),
    onSuccess:(res)=>{ const d=res.data||{}; const total=(d.results||[]).reduce((s,x)=>s+(x.sent||0),0); const names=(d.results||[]).flatMap(x=>(x.employees||[]).map(e=>e.employee)); setAlertResult({ total, names, date:d.date }); toast.success(`Late alerts sent to ${total} employee(s)`, { duration:6000 }); },
    onError:e=>toast.error(e.response?.data?.error||'Failed'),
  });

  const toggleStatus = (userId, day) => {
    const dateStr=`${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    const current=attMap[userId]?.[day]?.status||null;
    upsertMut.mutate({ user_id:userId, attendance_date:dateStr, status:current?(NEXT_STATUS[current]||'present'):'present' });
  };
  const isWeekend = (day) => new Date(year,month-1,day).getDay()===0;

  const handleEsslSync = async () => {
    const from=`${year}-${String(month).padStart(2,'0')}-01`;
    const to=`${year}-${String(month).padStart(2,'0')}-${String(new Date(year,month,0).getDate()).padStart(2,'0')}`;
    setSyncing(true); setSyncResult(null);
    try {
      const r=await hrEsslAPI.sync(from,to);
      setSyncResult(r.data); toast.success(`ESSL sync done — ${r.data.synced} records updated`);
      qc.invalidateQueries({queryKey:['hr-attendance-grid']}); qc.invalidateQueries({queryKey:['hr-attendance-summary']});
    } catch(e) { const msg=e.response?.data?.error||'Sync failed'; setSyncResult({error:msg}); toast.error(msg); }
    finally { setSyncing(false); }
  };

  const summary = summaryData?.data||[];
  const totalPresent = summary.reduce((s,r)=>s+(parseInt(r.present)||0),0);
  const totalAbsent  = summary.reduce((s,r)=>s+(parseInt(r.absent)||0),0);
  const totalHalf    = summary.reduce((s,r)=>s+(parseInt(r.half_day)||0),0);
  const totalLeave   = summary.reduce((s,r)=>s+(parseInt(r.on_leave)||0),0);
  const totalMarked  = summary.reduce((s,r)=>s+(parseInt(r.total_marked)||0),0);
  const presentPct   = totalMarked>0 ? Math.round(((totalPresent+totalHalf*0.5)/totalMarked)*100) : 0;

  // ── Styles ─────────────────────────────────────────────────────────────────
  const S = {
    page:    { background:'#F0F4F8', minHeight:'100vh' },
    topbar:  { background:'#fff', borderBottom:'0.5px solid #E5E7EB', padding:'12px 24px', display:'flex', alignItems:'center', justifyContent:'space-between', gap:12 },
    content: { padding:'16px 24px', display:'flex', flexDirection:'column', gap:14 },
    card:    { background:'#fff', border:'0.5px solid #E5E7EB', borderRadius:12 },
    btn: (primary) => ({
      display:'inline-flex', alignItems:'center', gap:6, padding:'7px 13px',
      borderRadius:8, fontSize:12, fontWeight:600, cursor:'pointer', whiteSpace:'nowrap',
      border: primary ? 'none' : '0.5px solid #D1D5DB',
      background: primary ? '#1A56DB' : '#fff',
      color: primary ? '#fff' : '#374151',
    }),
    select: {
      padding:'7px 28px 7px 10px', border:'0.5px solid #D1D5DB', borderRadius:8,
      fontSize:13, background:'#F9FAFB', color:'#111827', appearance:'none', cursor:'pointer',
      backgroundImage:`url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%23888' stroke-width='1.5' fill='none' stroke-linecap='round'/%3E%3C/svg%3E")`,
      backgroundRepeat:'no-repeat', backgroundPosition:'right 8px center',
    },
    th: { fontSize:11, fontWeight:700, color:'#6B7280', textAlign:'left', padding:'10px 14px', background:'#F9FAFB', borderBottom:'0.5px solid #E5E7EB', textTransform:'uppercase', letterSpacing:'.04em' },
    td: { padding:'10px 14px', fontSize:13, borderBottom:'0.5px solid #F1F5F9', verticalAlign:'middle' },
  };

  const TABS = [
    { key:'summary',   label:'Summary'     },
    { key:'grid',      label:'Grid'        },
    { key:'timesheet', label:'Timesheet'   },
    { key:'daily',     label:'Daily punch' },
  ];

  const kpiCards = [
    { label:'Total employees', val:summary.length||0, Icon:Users,     accent:'#1A56DB', bg:'#EBF5FF' },
    { label:'Present days',    val:totalPresent,       Icon:UserCheck, accent:'#057A55', bg:'#F0FDF4' },
    { label:'Half days',       val:totalHalf,          Icon:Clock3,    accent:'#D97706', bg:'#FFFBEB' },
    { label:'Absent days',     val:totalAbsent,        Icon:UserX,     accent:'#DC2626', bg:'#FEF2F2' },
    { label:'On leave',        val:totalLeave,         Icon:Palmtree,  accent:'#7C3AED', bg:'#F5F3FF' },
  ];

  const dailyRows = allEmployees
    .filter(e=>!deptFilter||e.department_id===deptFilter)
    .filter(e=>!empSearch.trim()||`${e.name} ${e.employee_code||''}`.toLowerCase().includes(empSearch.trim().toLowerCase()));

  return (
    <div style={S.page}>

      {/* ── Top header bar ─────────────────────────────────────────────────── */}
      <div style={S.topbar}>
        <div>
          <div style={{ display:'flex', alignItems:'center', gap:5, fontSize:11, color:'#9CA3AF', marginBottom:3 }}>
            <Calendar size={11}/>
            <span>HR admin</span>
            <ChevronRight size={11}/>
            <span style={{ color:'#6B7280' }}>Attendance</span>
          </div>
          <h1 style={{ fontSize:16, fontWeight:700, color:'#111827', lineHeight:1.2 }}>Attendance</h1>
          <p style={{ fontSize:12, color:'#9CA3AF', marginTop:2 }}>{MONTHS[month-1]} {year} · monthly attendance tracking</p>
        </div>
        <div style={{ display:'flex', gap:8, alignItems:'center', flexShrink:0 }}>
          <button onClick={()=>baselineMut.mutate()} disabled={baselineMut.isPending} style={S.btn(false)}>
            {baselineMut.isPending?<RefreshCw size={13} style={{animation:'spin .8s linear infinite'}}/>:<CalendarCheck size={13}/>}
            {baselineMut.isPending?'Marking…':'Mark month present'}
          </button>
          <button onClick={()=>runAlertsMut.mutate()} disabled={runAlertsMut.isPending} style={{ ...S.btn(false), color:'#DC2626', borderColor:'#FECACA' }}>
            {runAlertsMut.isPending?<RefreshCw size={13} style={{animation:'spin .8s linear infinite'}}/>:<Send size={13}/>}
            {runAlertsMut.isPending?'Sending…':'Send late alerts'}
          </button>
          <button onClick={()=>testMailMut.mutate()} disabled={testMailMut.isPending} style={S.btn(false)}>
            {testMailMut.isPending?<RefreshCw size={13} style={{animation:'spin .8s linear infinite'}}/>:<Mail size={13}/>}
            {testMailMut.isPending?'Sending…':'Test email'}
          </button>
          <button onClick={handleEsslSync} disabled={syncing} style={S.btn(true)}>
            {syncing?<RefreshCw size={13} style={{animation:'spin .8s linear infinite'}}/>:<Fingerprint size={13}/>}
            {syncing?'Syncing…':'Sync from ESSL'}
          </button>
        </div>
      </div>

      <div style={S.content}>

        {/* ── KPI strip + donut ring ──────────────────────────────────────── */}
        <div style={{ display:'grid', gridTemplateColumns:'1fr auto', gap:12, alignItems:'start' }}>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:10 }}>
            {kpiCards.map(({ label, val, Icon, accent, bg })=>(
              <div key={label} style={{ ...S.card, padding:'14px 16px', borderLeft:`3px solid ${accent}` }}>
                <div style={{ width:32, height:32, borderRadius:8, background:bg, display:'flex', alignItems:'center', justifyContent:'center', marginBottom:10 }}>
                  <Icon size={16} color={accent}/>
                </div>
                <div style={{ fontSize:24, fontWeight:800, color:'#111827', lineHeight:1, fontVariantNumeric:'tabular-nums' }}>{val}</div>
                <div style={{ fontSize:11, color:'#9CA3AF', fontWeight:600, marginTop:4 }}>{label}</div>
              </div>
            ))}
          </div>
          <div style={{ ...S.card, padding:'16px 20px', display:'flex', flexDirection:'column', alignItems:'center', minWidth:148 }}>
            <div style={{ fontSize:11, color:'#9CA3AF', fontWeight:600, marginBottom:10 }}>Attendance rate</div>
            <DonutRing pct={presentPct}/>
            <div style={{ display:'flex', gap:10, marginTop:8, flexWrap:'wrap', justifyContent:'center' }}>
              {[['#057A55','Present'],['#DC2626','Absent'],['#D97706','Half']].map(([c,l])=>(
                <div key={l} style={{ display:'flex', alignItems:'center', gap:4, fontSize:10, color:'#6B7280' }}>
                  <div style={{ width:7, height:7, borderRadius:'50%', background:c, flexShrink:0 }}/>
                  {l}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Banners ──────────────────────────────────────────────────────── */}
        {syncResult && !syncResult.error && (
          <div style={{ background:'#F5F3FF', border:'0.5px solid #DDD6FE', borderRadius:10, padding:'10px 16px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <div style={{ display:'flex', alignItems:'center', gap:10 }}>
              <CheckCircle size={16} color="#7C3AED"/>
              <span style={{ fontSize:13, color:'#5B21B6', fontWeight:700 }}>ESSL sync complete</span>
              <span style={{ fontSize:13, color:'#7C3AED' }}>{syncResult.synced} synced · {syncResult.skipped} skipped · {syncResult.raw_swipes} raw swipes</span>
            </div>
            {syncResult.not_found?.length>0 && <span style={{ fontSize:12, color:'#D97706', display:'flex', alignItems:'center', gap:4 }}><AlertTriangle size={13}/>{syncResult.not_found.length} unmatched</span>}
            <button onClick={()=>setSyncResult(null)} style={{ background:'none', border:'none', color:'#9CA3AF', cursor:'pointer', fontSize:16 }}>✕</button>
          </div>
        )}
        {syncResult?.error && (
          <div style={{ background:'#FEF2F2', border:'0.5px solid #FECACA', borderRadius:10, padding:'10px 16px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <div style={{ display:'flex', alignItems:'center', gap:8, color:'#DC2626', fontSize:13 }}><AlertTriangle size={14}/>{syncResult.error}</div>
            <button onClick={()=>setSyncResult(null)} style={{ background:'none', border:'none', color:'#9CA3AF', cursor:'pointer', fontSize:16 }}>✕</button>
          </div>
        )}
        {alertResult && (
          <div style={{ background:'#FEF2F2', border:'0.5px solid #FECACA', borderRadius:10, padding:'10px 16px', display:'flex', alignItems:'start', justifyContent:'space-between', gap:12 }}>
            <div style={{ display:'flex', alignItems:'start', gap:10 }}>
              <Send size={15} color="#DC2626" style={{ marginTop:1, flexShrink:0 }}/>
              <div>
                <span style={{ fontSize:13, color:'#991B1B', fontWeight:700 }}>Late alerts sent — {alertResult.date}</span>
                {alertResult.total===0
                  ? <span style={{ fontSize:13, color:'#DC2626', marginLeft:8 }}>No latecomers found</span>
                  : <><span style={{ fontSize:13, color:'#DC2626', marginLeft:8 }}>{alertResult.total} employee(s) notified</span>
                    {alertResult.names.length>0 && <div style={{ marginTop:4, fontSize:12, color:'#B91C1C', fontWeight:600 }}>{alertResult.names.join(' · ')}</div>}</>
                }
              </div>
            </div>
            <button onClick={()=>setAlertResult(null)} style={{ background:'none', border:'none', color:'#9CA3AF', cursor:'pointer', fontSize:16, flexShrink:0 }}>✕</button>
          </div>
        )}

        {/* ── Controls + tabs bar ───────────────────────────────────────────── */}
        <div style={{ ...S.card, padding:'10px 14px', display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
          <select value={month} onChange={e=>setMonth(parseInt(e.target.value))} style={S.select} aria-label="Month">
            {MONTHS.map((m,i)=><option key={i+1} value={i+1}>{m}</option>)}
          </select>
          <select value={year} onChange={e=>setYear(parseInt(e.target.value))} style={S.select} aria-label="Year">
            {[2024,2025,2026,2027].map(y=><option key={y} value={y}>{y}</option>)}
          </select>
          <select value={deptFilter} onChange={e=>setDeptFilter(e.target.value)} style={S.select} aria-label="Department">
            <option value="">All departments</option>
            {(deptData?.data||[]).map(d=><option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
          <select value={projectFilter} onChange={e=>setProjectFilter(e.target.value)} style={S.select} aria-label="Project">
            <option value="">All projects</option>
            {(projectsData?.data||[]).map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
          </select>

          {/* Underline tabs */}
          <div style={{ marginLeft:'auto', display:'flex', borderBottom:'2px solid #E5E7EB' }}>
            {TABS.map(t=>(
              <button key={t.key} onClick={()=>setView(t.key)}
                style={{ padding:'7px 14px', fontSize:12, fontWeight:600, cursor:'pointer', background:'none', border:'none',
                  borderBottom:`2px solid ${view===t.key?'#1A56DB':'transparent'}`, marginBottom:-2,
                  color: view===t.key?'#1A56DB':'#6B7280', whiteSpace:'nowrap' }}>
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* ── Grid legend ───────────────────────────────────────────────────── */}
        {view==='grid' && (
          <div style={{ display:'flex', gap:12, flexWrap:'wrap', alignItems:'center' }}>
            {Object.entries(STATUS_CELL).map(([k,v])=>(
              <div key={k} style={{ display:'flex', alignItems:'center', gap:6 }}>
                <div style={{ width:24, height:24, borderRadius:6, background:v.bg, color:v.text, display:'flex', alignItems:'center', justifyContent:'center', fontSize:10, fontWeight:800 }}>{v.label}</div>
                <span style={{ fontSize:11, color:'#6B7280', fontWeight:500 }}>{k.replace('_',' ')}</span>
              </div>
            ))}
            <span style={{ fontSize:11, color:'#9CA3AF', marginLeft:4 }}>Click cell to cycle status</span>
          </div>
        )}

        {/* ── Grid view ─────────────────────────────────────────────────────── */}
        {view==='grid' && (
          <div style={{ ...S.card, overflowX:'auto' }}>
            {isLoading
              ? <div style={{ display:'flex', justifyContent:'center', padding:'48px 0' }}><div style={{ width:28, height:28, borderRadius:'50%', border:'2px solid #BFDBFE', borderTopColor:'#2563EB', animation:'spin .8s linear infinite' }}/></div>
              : (
                <table style={{ borderCollapse:'collapse', fontSize:12, minWidth:'max-content', width:'100%' }}>
                  <thead>
                    <tr style={{ background:'#F9FAFB', borderBottom:'0.5px solid #E5E7EB' }}>
                      <th style={{ ...S.th, position:'sticky', left:0, background:'#F9FAFB', minWidth:180 }}>Employee</th>
                      {days.map(d=>(
                        <th key={d} style={{ ...S.th, width:32, textAlign:'center', padding:'8px 2px', color:isWeekend(d)?'#D1D5DB':'#6B7280' }}>
                          <div>{d}</div>
                          <div style={{ fontSize:9, color:'#CBD5E1' }}>
                            {['Su','Mo','Tu','We','Th','Fr','Sa'][new Date(year,month-1,d).getDay()]}
                          </div>
                        </th>
                      ))}
                      <th style={{ ...S.th, textAlign:'center', color:'#057A55', width:36 }}>P</th>
                      <th style={{ ...S.th, textAlign:'center', color:'#DC2626', width:36 }}>A</th>
                      <th style={{ ...S.th, textAlign:'center', color:'#D97706', width:36 }}>H</th>
                    </tr>
                  </thead>
                  <tbody>
                    {employees.map(emp=>{
                      const ea=attMap[emp.id]||{};
                      const pC=Object.values(ea).filter(a=>a.status==='present').length;
                      const aC=Object.values(ea).filter(a=>a.status==='absent').length;
                      const hC=Object.values(ea).filter(a=>a.status==='half_day').length;
                      return (
                        <tr key={emp.id} style={{ borderBottom:'0.5px solid #F1F5F9' }}
                          onMouseEnter={e=>e.currentTarget.style.background='#F9FAFB'}
                          onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                          <td style={{ ...S.td, position:'sticky', left:0, background:'#fff' }}>
                            <div style={{ fontWeight:700, color:'#111827' }}>{emp.name}</div>
                            <div style={{ fontSize:10, color:'#9CA3AF' }}>{emp.employee_code}</div>
                          </td>
                          {days.map(d=>{
                            const att=ea[d];
                            const sc=att?STATUS_CELL[att.status]:null;
                            const isSun=isWeekend(d);
                            return (
                              <td key={d} style={{ padding:'3px 2px', textAlign:'center' }}>
                                <div onClick={()=>!isSun&&toggleStatus(emp.id,d)}
                                  title={att?.status||'Not marked'}
                                  style={{ width:28, height:28, borderRadius:6, display:'flex', alignItems:'center', justifyContent:'center',
                                    fontSize:10, fontWeight:800, cursor:isSun?'default':'pointer',
                                    background: isSun?'#F9FAFB' : sc?sc.bg:'transparent',
                                    color: isSun?'#D1D5DB' : sc?sc.text:'#CBD5E1',
                                  }}>
                                  {isSun?'—':sc?.label||'·'}
                                </div>
                              </td>
                            );
                          })}
                          <td style={{ ...S.td, textAlign:'center', color:'#057A55', fontWeight:800 }}>{pC}</td>
                          <td style={{ ...S.td, textAlign:'center', color:'#DC2626', fontWeight:800 }}>{aC}</td>
                          <td style={{ ...S.td, textAlign:'center', color:'#D97706', fontWeight:800 }}>{hC}</td>
                        </tr>
                      );
                    })}
                    {employees.length===0&&<tr><td colSpan={daysInMonth+4} style={{ textAlign:'center', padding:'48px 0', color:'#9CA3AF' }}>No employees found</td></tr>}
                  </tbody>
                </table>
              )
            }
          </div>
        )}

        {/* ── Timesheet view ────────────────────────────────────────────────── */}
        {view==='timesheet' && <TimesheetView month={month} year={year} allEmployees={allEmployees} qc={qc}/>}

        {/* ── Daily punch view ──────────────────────────────────────────────── */}
        {view==='daily' && (
          <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
            <div style={{ ...S.card, padding:'10px 14px', display:'flex', alignItems:'center', gap:10, flexWrap:'wrap' }}>
              <Clock size={14} color="#6366F1"/>
              <span style={{ fontSize:13, fontWeight:700, color:'#374151' }}>Punch report for</span>
              <input type="date" value={dailyDate} onChange={e=>setDailyDate(e.target.value)}
                style={{ ...S.select, paddingRight:10, backgroundImage:'none' }}/>
              <span style={{ fontSize:12, color:'#9CA3AF' }}>{dailyData?.data?.length||0} of {allEmployees.length} employees have records</span>
              <div style={{ display:'flex', alignItems:'center', gap:6, marginLeft:'auto', padding:'6px 12px', border:'0.5px solid #E5E7EB', borderRadius:8, background:'#F9FAFB', minWidth:220 }}>
                <Search size={13} color="#9CA3AF"/>
                <input value={empSearch} onChange={e=>setEmpSearch(e.target.value)} placeholder="Search name or ID…"
                  style={{ border:'none', outline:'none', fontSize:13, background:'transparent', color:'#111827', flex:1 }}/>
                {empSearch&&<button onClick={()=>setEmpSearch('')} style={{ background:'none', border:'none', color:'#9CA3AF', cursor:'pointer', fontSize:14 }}>✕</button>}
              </div>
            </div>

            <div style={{ ...S.card, overflow:'hidden' }}>
              {dailyLoading
                ? <div style={{ display:'flex', justifyContent:'center', padding:'48px 0' }}><div style={{ width:28, height:28, borderRadius:'50%', border:'2px solid #C7D2FE', borderTopColor:'#6366F1', animation:'spin .8s linear infinite' }}/></div>
                : (
                  <div style={{ overflowX:'auto', maxHeight:'62vh', overflowY:'auto' }}>
                    <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
                      <thead style={{ position:'sticky', top:0, zIndex:1 }}>
                        <tr style={{ background:'#1E293B' }}>
                          {['#','Employee','Department','Status','IN time','OUT time','Hours','Late'].map(h=>(
                            <th key={h} style={{ ...S.th, background:'#1E293B', color:'#94A3B8', textAlign: ['IN time','OUT time','Hours','Late'].includes(h)?'center':'left' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {dailyRows.map((emp,i)=>{
                          const rec=(dailyData?.data||[]).find(r=>r.user_id===emp.id);
                          const inM=toMins(rec?.in_time),outM=toMins(rec?.out_time);
                          const hrs=(inM!=null&&outM!=null&&outM>inM)?fmtHrs(outM-inM):'—';
                          return (
                            <tr key={emp.id} style={{ borderBottom:'0.5px solid #F1F5F9' }}
                              onMouseEnter={e=>e.currentTarget.style.background='#EEF2FF'}
                              onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                              <td style={{ ...S.td, color:'#9CA3AF', width:40 }}>{i+1}</td>
                              <td style={S.td}>
                                <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                                  <Avatar name={emp.name}/>
                                  <div>
                                    <div style={{ fontWeight:600, color:'#111827' }}>{emp.name}</div>
                                    {emp.employee_code&&<div style={{ fontSize:11, color:'#9CA3AF', fontFamily:'monospace' }}>{emp.employee_code}</div>}
                                  </div>
                                </div>
                              </td>
                              <td style={{ ...S.td, color:'#6B7280' }}>{emp.department_name||'—'}</td>
                              <td style={{ ...S.td, textAlign:'center' }}><StatusPill status={rec?.status}/></td>
                              <td style={{ ...S.td, textAlign:'center', fontFamily:'monospace', fontWeight:700, color:'#374151' }}>
                                {rec?.in_time ? rec.in_time.slice(0,5) : <span style={{ color:'#D1D5DB' }}>—</span>}
                              </td>
                              <td style={{ ...S.td, textAlign:'center', fontFamily:'monospace', fontWeight:700, color:'#374151' }}>
                                {rec?.out_time ? rec.out_time.slice(0,5) : <span style={{ color:'#D1D5DB' }}>—</span>}
                              </td>
                              <td style={{ ...S.td, textAlign:'center', color:'#374151', fontWeight:600 }}>{hrs}</td>
                              <td style={{ ...S.td, textAlign:'center' }}>
                                {rec?.late_minutes>0
                                  ? <span style={{ background:'#FEF2F2', color:'#DC2626', fontWeight:700, fontSize:11, padding:'2px 8px', borderRadius:999 }}>{rec.late_minutes}m</span>
                                  : <span style={{ color:'#D1D5DB' }}>—</span>}
                              </td>
                            </tr>
                          );
                        })}
                        {dailyRows.length===0&&<tr><td colSpan={8} style={{ textAlign:'center', padding:'48px 0', color:'#9CA3AF' }}>
                          {empSearch?`No employees match "${empSearch}"`:'No employees found'}
                        </td></tr>}
                      </tbody>
                    </table>
                  </div>
                )
              }
            </div>
          </div>
        )}

        {/* ── Summary view ──────────────────────────────────────────────────── */}
        {view==='summary' && (
          <div style={{ ...S.card, overflow:'hidden' }}>
            <div style={{ overflowX:'auto' }}>
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
                <thead>
                  <tr>
                    <th style={{ ...S.th, minWidth:200 }}>Employee</th>
                    <th style={S.th}>Department</th>
                    <th style={{ ...S.th, minWidth:160 }}>Attendance</th>
                    <th style={{ ...S.th, textAlign:'right' }}>Present</th>
                    <th style={{ ...S.th, textAlign:'right' }}>Absent</th>
                    <th style={{ ...S.th, textAlign:'right' }}>Half</th>
                    <th style={{ ...S.th, textAlign:'right' }}>Leave</th>
                    <th style={{ ...S.th, textAlign:'right' }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.map(s=>(
                    <tr key={s.user_id} style={{ borderBottom:'0.5px solid #F1F5F9' }}
                      onMouseEnter={e=>e.currentTarget.style.background='#F9FAFB'}
                      onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                      <td style={S.td}>
                        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                          <Avatar name={s.name}/>
                          <div>
                            <div style={{ fontWeight:600, color:'#111827' }}>{s.name}</div>
                            <div style={{ fontSize:11, color:'#9CA3AF' }}>{s.employee_code}</div>
                          </div>
                        </div>
                      </td>
                      <td style={S.td}>
                        <span style={{ background:'#F1F5F9', color:'#374151', fontSize:11, padding:'3px 8px', borderRadius:6, fontWeight:500 }}>
                          {s.department_name||'—'}
                        </span>
                      </td>
                      <td style={S.td}>
                        <AttBar p={parseInt(s.present)||0} a={parseInt(s.absent)||0} h={parseInt(s.half_day)||0} l={parseInt(s.on_leave)||0}/>
                      </td>
                      <td style={{ ...S.td, textAlign:'right', color:'#057A55', fontWeight:700, fontVariantNumeric:'tabular-nums' }}>{s.present}</td>
                      <td style={{ ...S.td, textAlign:'right', color: parseInt(s.absent)>0?'#DC2626':'#D1D5DB', fontWeight:700, fontVariantNumeric:'tabular-nums' }}>{s.absent}</td>
                      <td style={{ ...S.td, textAlign:'right', color: parseInt(s.half_day)>0?'#D97706':'#D1D5DB', fontWeight:700, fontVariantNumeric:'tabular-nums' }}>{s.half_day}</td>
                      <td style={{ ...S.td, textAlign:'right', color: parseInt(s.on_leave)>0?'#2563EB':'#D1D5DB', fontWeight:700, fontVariantNumeric:'tabular-nums' }}>{s.on_leave}</td>
                      <td style={{ ...S.td, textAlign:'right', color:'#374151', fontWeight:700, fontVariantNumeric:'tabular-nums' }}>{s.total_marked}</td>
                    </tr>
                  ))}
                  {summary.length===0&&(
                    <tr><td colSpan={8} style={{ textAlign:'center', padding:'56px 0' }}>
                      <Calendar size={32} color="#E5E7EB" style={{ margin:'0 auto 10px' }}/>
                      <p style={{ color:'#6B7280', fontWeight:600 }}>No attendance data</p>
                      <p style={{ color:'#9CA3AF', fontSize:12, marginTop:4 }}>{MONTHS[month-1]} {year}</p>
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
