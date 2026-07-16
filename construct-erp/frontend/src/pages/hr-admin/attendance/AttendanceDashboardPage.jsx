import React, { useState, useMemo, useRef, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { hrAttendanceAPI, hrAdvancedAPI } from '../../../api/client';
import toast from 'react-hot-toast';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as ReTooltip,
  ResponsiveContainer, AreaChart, Area,
} from 'recharts';
import {
  Users, UserCheck, UserX, CalendarX, Clock, RefreshCw, ChevronRight,
  TrendingUp, TrendingDown, Activity, ClipboardEdit, X, CheckCircle2,
  AlertTriangle, Building2, ArrowRight, Timer, BarChart2, Printer,
} from 'lucide-react';

// ── Constants ─────────────────────────────────────────────────────────────────
const MONTHS   = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const SHORT    = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const DAY_ABBR = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const DEPT_COLORS = ['#2563EB','#EF4444','#F97316','#16A34A','#8B5CF6','#06B6D4','#EC4899','#84CC16'];

function todayStr()   { return new Date().toLocaleDateString('en-CA'); }
function fmtLate(m)   { const h=Math.floor(m/60),mn=m%60; return h>0?`${h}h ${mn}m`:`${mn}m`; }
function fmtTime(t)   { if (!t) return '—'; const [h,m]=String(t).slice(0,5).split(':'); const hr=parseInt(h); return `${hr>12?hr-12:hr||12}:${m} ${hr>=12?'PM':'AM'}`; }

// ── Avatar ────────────────────────────────────────────────────────────────────
function Avatar({ name, size = 32 }) {
  const colors = ['#3B82F6','#10B981','#F59E0B','#EF4444','#8B5CF6','#EC4899','#06B6D4'];
  const i = (name||'').split('').reduce((a,c)=>a+c.charCodeAt(0),0) % colors.length;
  const initials = (name||'?').split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();
  return (
    <span style={{ display:'inline-flex',alignItems:'center',justifyContent:'center',
      width:size,height:size,borderRadius:'50%',background:colors[i],
      color:'#fff',fontSize:size*0.35,fontWeight:700,flexShrink:0,letterSpacing:0.5 }}>
      {initials}
    </span>
  );
}

// ── KPI Card ──────────────────────────────────────────────────────────────────
function KpiCard({ icon: Icon, iconColor, bg, label, value, sub, delta, deltaUp, accent, onClick }) {
  return (
    <div onClick={onClick} className={`bg-white rounded-2xl p-5 border border-slate-100 shadow-sm flex flex-col gap-3 ${onClick?'cursor-pointer hover:shadow-md transition-shadow':''}`}
      style={{ borderLeft: `4px solid ${accent}` }}>
      <div className="flex items-start justify-between">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: bg }}>
          <Icon size={18} style={{ color: iconColor }} />
        </div>
        {delta !== undefined && (
          <div className={`flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full ${deltaUp ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-500'}`}>
            {deltaUp ? <TrendingUp size={10}/> : <TrendingDown size={10}/>}
            {Math.abs(delta)}%
          </div>
        )}
      </div>
      <div>
        <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-1">{label}</p>
        <p className="text-[28px] font-black text-slate-800 leading-none tabular-nums">{value ?? '—'}</p>
        {sub && <p className="text-[11px] text-slate-400 mt-1.5">{sub}</p>}
      </div>
    </div>
  );
}

// ── Section header ────────────────────────────────────────────────────────────
function SectionHead({ icon: Icon, title, sub, right }) {
  return (
    <div className="flex items-center justify-between mb-4">
      <div className="flex items-center gap-2.5">
        {Icon && <div className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center"><Icon size={14} className="text-blue-600"/></div>}
        <div>
          <h3 className="text-[13px] font-black uppercase tracking-wider text-slate-700">{title}</h3>
          {sub && <p className="text-[11px] text-slate-400">{sub}</p>}
        </div>
      </div>
      {right}
    </div>
  );
}

// ── Regularize Modal ──────────────────────────────────────────────────────────
function RegularizeModal({ rec, onClose, onDone }) {
  const [newTime, setNewTime]   = useState(rec.in_time ? String(rec.in_time).slice(0,5) : '09:00');
  const [reason,  setReason]    = useState('Late arrival regularized by HR Admin');
  const [newStatus, setNewStatus] = useState('present');
  const qc = useQueryClient();

  const mut = useMutation({
    mutationFn: () => hrAttendanceAPI.update(rec.id, {
      in_time: newTime,
      status:  newStatus,
      late_minutes: 0,
      remarks: reason,
    }),
    onSuccess: () => {
      toast.success(`Attendance regularized for ${rec.employee_name}`);
      qc.invalidateQueries({ queryKey: ['att-today-list'] });
      qc.invalidateQueries({ queryKey: ['att-dashboard-summary'] });
      onDone?.();
      onClose();
    },
    onError: e => toast.error(e.response?.data?.error || 'Update failed'),
  });

  const late = parseInt(rec.late_minutes) || 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background:'rgba(15,23,42,0.55)' }}
      onClick={e => e.target===e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden animate-in">

        {/* Header */}
        <div className="px-6 py-4 flex items-center justify-between border-b border-slate-100"
          style={{ background:'linear-gradient(135deg,#1e3a8a 0%,#2563eb 100%)' }}>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-white/20 rounded-xl flex items-center justify-center">
              <ClipboardEdit size={16} className="text-white"/>
            </div>
            <div>
              <p className="text-[13px] font-black text-white">Regularize Attendance</p>
              <p className="text-[11px] text-blue-200">Admin correction — applied immediately</p>
            </div>
          </div>
          <button onClick={onClose} className="text-white/60 hover:text-white transition-colors">
            <X size={18}/>
          </button>
        </div>

        {/* Employee info */}
        <div className="px-6 py-4 bg-slate-50 border-b border-slate-100 flex items-center gap-3">
          <Avatar name={rec.employee_name} size={40}/>
          <div>
            <p className="text-[13px] font-bold text-slate-800">{rec.employee_name}</p>
            <p className="text-[11px] text-slate-500">{rec.employee_code || '—'} · {rec.department_name || '—'}</p>
          </div>
          <div className="ml-auto text-right">
            <p className="text-[11px] text-slate-400">Date</p>
            <p className="text-[12px] font-bold text-slate-700">{String(rec.attendance_date).slice(0,10)}</p>
          </div>
        </div>

        {/* Current status banner */}
        <div className="mx-6 mt-4 rounded-xl p-3 flex items-center gap-3 bg-red-50 border border-red-100">
          <AlertTriangle size={15} className="text-red-500 shrink-0"/>
          <div>
            <p className="text-[12px] font-bold text-red-700">
              Current Check-in: {fmtTime(rec.in_time)} &nbsp;·&nbsp; Late by {fmtLate(late)}
            </p>
            <p className="text-[11px] text-red-500">This will be overwritten with the corrected time below</p>
          </div>
        </div>

        {/* Form */}
        <div className="px-6 py-4 space-y-4">
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">Corrected In-Time</label>
            <input type="time" value={newTime} onChange={e => setNewTime(e.target.value)}
              className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-[14px] font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-400"/>
          </div>
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">Status</label>
            <select value={newStatus} onChange={e => setNewStatus(e.target.value)}
              className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-[13px] text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-400">
              <option value="present">Present</option>
              <option value="half_day">Half Day</option>
              <option value="leave">Leave</option>
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">Reason / Remarks</label>
            <textarea rows={2} value={reason} onChange={e => setReason(e.target.value)}
              className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-[13px] text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none"
              placeholder="Reason for correction…"/>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 pb-5 flex gap-3">
          <button onClick={onClose}
            className="flex-1 border border-slate-200 text-slate-600 text-[13px] font-semibold rounded-xl py-2.5 hover:bg-slate-50 transition-colors">
            Cancel
          </button>
          <button onClick={() => mut.mutate()} disabled={mut.isPending}
            className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-[13px] font-bold rounded-xl py-2.5 transition-colors flex items-center justify-center gap-2">
            <CheckCircle2 size={14}/>
            {mut.isPending ? 'Saving…' : 'Apply Regularization'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Dept row ──────────────────────────────────────────────────────────────────
function DeptRow({ d, idx }) {
  const pres = parseInt(d.present)  || 0;
  const abs  = parseInt(d.absent)   || 0;
  const hc   = parseInt(d.headcount)|| 0;
  const attP = hc ? Math.round(pres / hc * 100) : 0;
  const col  = DEPT_COLORS[idx % DEPT_COLORS.length];
  return (
    <tr className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
      <td className="py-3 pl-4 pr-2">
        <div className="flex items-center gap-2.5">
          <span className="w-2 h-2 rounded-full shrink-0" style={{ background: col }}/>
          <span className="text-[12px] font-semibold text-slate-700 truncate">{d.department_name || 'General'}</span>
        </div>
      </td>
      <td className="py-3 px-2 text-center text-[12px] font-bold text-emerald-600">{pres}</td>
      <td className="py-3 px-2 text-center text-[12px] font-bold text-red-500">{abs}</td>
      <td className="py-3 px-2 text-center text-[12px] text-slate-400">{parseInt(d.on_leave)||0}</td>
      <td className="py-3 pl-2 pr-4" style={{ minWidth: 120 }}>
        <div className="flex items-center gap-2">
          <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div className="h-full rounded-full transition-all" style={{ width:`${Math.min(attP,100)}%`, background: col }}/>
          </div>
          <span className="text-[11px] font-black w-7 text-right tabular-nums" style={{ color: col }}>{attP}%</span>
        </div>
      </td>
    </tr>
  );
}

// ── Line chart tooltip ─────────────────────────────────────────────────────────
const LineTip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-xl px-3.5 py-2.5 text-[12px]">
      <p className="font-bold text-slate-400 mb-1.5 text-[10px] uppercase tracking-wider">{label}</p>
      {payload.map(p => (
        <p key={p.name} style={{ color: p.stroke }} className="font-semibold mb-0.5">
          {p.name}: <span className="font-black">{p.value}</span>
        </p>
      ))}
    </div>
  );
};

// ════════════════════════════════════════════════════════════════════════════════
export default function AttendanceDashboardPage() {
  const now   = new Date();
  const [month, setMonth]      = useState(now.getMonth() + 1);
  const [year,  setYear]       = useState(now.getFullYear());
  const [trendRange, setRange] = useState('month');
  const [regRec, setRegRec]    = useState(null);   // record being regularized
  const [minLate, setMinLate]  = useState(10);     // minimum late minutes to show
  const lateRef = useRef(null);
  const qc = useQueryClient();

  const today = todayStr();
  const isCurrentMonth = month === (now.getMonth()+1) && year === now.getFullYear();

  // ── Data queries ──────────────────────────────────────────────────────────
  const { data: summaryData, isLoading, refetch } = useQuery({
    queryKey: ['att-dashboard-summary', month, year],
    queryFn:  () => hrAttendanceAPI.summary({ month, year }).then(r => r.data),
  });
  const { data: trendData } = useQuery({
    queryKey: ['att-dashboard-trend', month, year],
    queryFn:  () => hrAttendanceAPI.dailyTrend({ month, year }).then(r => r.data),
  });
  const { data: deptData } = useQuery({
    queryKey: ['att-dashboard-dept', month, year],
    queryFn:  () => hrAttendanceAPI.deptSummary({ month, year }).then(r => r.data),
  });
  // Today's individual attendance records (for late arrivals)
  const { data: todayData, refetch: refetchToday } = useQuery({
    queryKey: ['att-today-list', today],
    queryFn:  () => hrAttendanceAPI.list({ date: today }).then(r => r.data?.data || []),
    enabled: isCurrentMonth,
    staleTime: 60_000,
  });

  const summaryRows = summaryData?.data || [];
  const depts       = deptData?.data    || [];
  const todayRows   = Array.isArray(todayData) ? todayData : [];

  // Late arrivals today — only those >= minLate threshold
  const lateToday = useMemo(() =>
    todayRows.filter(r => (parseInt(r.late_minutes)||0) >= minLate)
             .sort((a,b) => (parseInt(b.late_minutes)||0) - (parseInt(a.late_minutes)||0)),
  [todayRows, minLate]);

  // Total late count (all > 0, for the raw stat chip)
  const lateTotalRaw = useMemo(() =>
    todayRows.filter(r => (parseInt(r.late_minutes)||0) > 0).length,
  [todayRows]);

  // Monthly trend
  const allTrend = useMemo(() =>
    (trendData?.data || []).map(r => ({
      date:    r.attendance_date,
      day:     new Date(r.attendance_date).getDate(),
      dayName: DAY_ABBR[new Date(r.attendance_date).getDay()],
      Present: parseInt(r.present)  || 0,
      Absent:  parseInt(r.absent)   || 0,
      Leave:   parseInt(r.on_leave) || 0,
    })), [trendData]);
  const trend = trendRange === 'week' ? allTrend.slice(-7) : allTrend;

  // Derived totals from monthly summary
  const totals = useMemo(() => summaryRows.reduce((a, r) => ({
    employees:   a.employees + 1,
    presentEmps: a.presentEmps + (parseInt(r.present)   > 0 ? 1 : 0),
    absentEmps:  a.absentEmps  + (parseInt(r.absent)    > 0 ? 1 : 0),
    leaveEmps:   a.leaveEmps   + (parseInt(r.on_leave)  > 0 ? 1 : 0),
    halfEmps:    a.halfEmps    + (parseInt(r.half_day)  > 0 ? 1 : 0),
  }), { employees:0, presentEmps:0, absentEmps:0, leaveEmps:0, halfEmps:0 }), [summaryRows]);

  // Today's values from trend data
  const todayTrend   = allTrend.find(t => String(t.date).slice(0,10) === today);
  const todayPresent = isCurrentMonth ? (todayRows.filter(r=>r.status==='present'||r.status==='half_day').length || todayTrend?.Present || 0) : totals.presentEmps;
  const todayAbsent  = isCurrentMonth ? (todayRows.filter(r=>r.status==='absent').length  || todayTrend?.Absent  || 0) : totals.absentEmps;
  const todayLeave   = isCurrentMonth ? (todayRows.filter(r=>r.status==='leave').length   || todayTrend?.Leave   || 0) : totals.leaveEmps;
  const attPct       = totals.employees ? Math.round(todayPresent / totals.employees * 100) : 0;

  const dateLabel   = `${MONTHS[month-1]} ${year}`;
  const todayFmt    = now.toLocaleDateString('en-IN', { weekday:'long', day:'2-digit', month:'long', year:'numeric' });

  const scrollToLate = useCallback(() => lateRef.current?.scrollIntoView({ behavior:'smooth', block:'start' }), []);

  return (
    <div style={{ background:'#F1F5F9', minHeight:'100vh' }}>

      {/* ── HEADER ────────────────────────────────────────────────────────── */}
      <div style={{ background:'linear-gradient(135deg,#0f172a 0%,#1e3a8a 60%,#2563eb 100%)', padding:'20px 24px 56px', position:'relative', overflow:'hidden' }}>
        {/* decorative circles */}
        <div style={{ position:'absolute', top:-40, right:-40, width:200, height:200, borderRadius:'50%', background:'rgba(255,255,255,0.04)' }}/>
        <div style={{ position:'absolute', bottom:-60, right:120, width:280, height:280, borderRadius:'50%', background:'rgba(255,255,255,0.03)' }}/>

        <div style={{ position:'relative', zIndex:1 }}>
          <div className="flex items-start justify-between flex-wrap gap-4">
            {/* Title */}
            <div className="flex items-center gap-3">
              <div style={{ background:'rgba(255,255,255,0.12)', width:42, height:42, borderRadius:12, display:'flex', alignItems:'center', justifyContent:'center' }}>
                <Activity size={20} style={{ color:'#93C5FD' }}/>
              </div>
              <div>
                <h1 style={{ color:'#fff', fontSize:20, fontWeight:900, margin:0, letterSpacing:'-0.3px' }}>Attendance Dashboard</h1>
                <p style={{ color:'#93C5FD', fontSize:12, margin:'3px 0 0' }}>{todayFmt}</p>
              </div>
            </div>

            {/* Controls */}
            <div className="flex items-center gap-2 flex-wrap">
              <select value={month} onChange={e => setMonth(parseInt(e.target.value))}
                style={{ background:'rgba(255,255,255,0.12)', color:'#E0E7FF', border:'1px solid rgba(255,255,255,0.2)', borderRadius:10, padding:'7px 12px', fontSize:12 }}>
                {MONTHS.map((m,i) => <option key={i+1} value={i+1} style={{ color:'#1e3a8a' }}>{m}</option>)}
              </select>
              <select value={year} onChange={e => setYear(parseInt(e.target.value))}
                style={{ background:'rgba(255,255,255,0.12)', color:'#E0E7FF', border:'1px solid rgba(255,255,255,0.2)', borderRadius:10, padding:'7px 12px', fontSize:12 }}>
                {[2024,2025,2026].map(y => <option key={y} value={y} style={{ color:'#1e3a8a' }}>{y}</option>)}
              </select>
              <button onClick={() => { refetch(); refetchToday(); }}
                style={{ background:'rgba(255,255,255,0.12)', color:'#E0E7FF', border:'1px solid rgba(255,255,255,0.2)', borderRadius:10, padding:'7px 10px', cursor:'pointer', display:'flex', alignItems:'center', gap:6, fontSize:12 }}>
                <RefreshCw size={13}/> Refresh
              </button>
              {isCurrentMonth && lateToday.length > 0 && (
                <button onClick={scrollToLate}
                  style={{ background:'#ef4444', color:'#fff', border:'none', borderRadius:10, padding:'7px 14px', cursor:'pointer', display:'flex', alignItems:'center', gap:6, fontSize:12, fontWeight:700 }}>
                  <Clock size={13}/> {lateToday.length} Late Today
                  <ArrowRight size={12}/>
                </button>
              )}
            </div>
          </div>

          {/* Inline stat chips */}
          <div className="flex gap-3 flex-wrap mt-4">
            {[
              { label:'Present', val: todayPresent, color:'#10b981' },
              { label:'Absent',  val: todayAbsent,  color:'#ef4444' },
              { label:'On Leave',val: todayLeave,   color:'#8b5cf6' },
              { label:'Late',    val: isCurrentMonth ? lateTotalRaw : '—', color:'#f59e0b' },
              { label:'Att%',    val: `${attPct}%`, color:'#38bdf8' },
            ].map(s => (
              <div key={s.label} style={{ background:'rgba(255,255,255,0.1)', backdropFilter:'blur(4px)', borderRadius:8, padding:'4px 12px', display:'flex', alignItems:'center', gap:8 }}>
                <span style={{ width:6, height:6, borderRadius:'50%', background:s.color, flexShrink:0 }}/>
                <span style={{ color:'rgba(255,255,255,0.65)', fontSize:11 }}>{s.label}</span>
                <span style={{ color:'#fff', fontSize:13, fontWeight:900 }}>{s.val}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── BODY ─────────────────────────────────────────────────────────── */}
      <div style={{ marginTop:-36, padding:'0 16px 24px', position:'relative', zIndex:1 }}>

        {/* KPI CARDS */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <KpiCard icon={Users}     iconColor="#2563EB" bg="#EFF6FF" accent="#2563EB"
            label="Total Employees" value={totals.employees}
            sub={`Active in ${SHORT[month-1]} ${year}`} delta={2.5} deltaUp={true}/>
          <KpiCard icon={UserCheck} iconColor="#16A34A" bg="#F0FDF4" accent="#16A34A"
            label="Present Today"  value={todayPresent}
            sub={`${attPct}% attendance rate`} delta={3.2} deltaUp={true}/>
          <KpiCard icon={UserX}     iconColor="#EF4444" bg="#FEF2F2" accent="#EF4444"
            label="Absent Today"   value={todayAbsent}
            sub="Unplanned absences" delta={1.2} deltaUp={false}/>
          <KpiCard icon={Clock}     iconColor="#F59E0B" bg="#FFFBEB" accent="#F59E0B"
            label="Late Arrivals Today" value={isCurrentMonth ? lateTotalRaw : '—'}
            sub={isCurrentMonth
              ? lateTotalRaw > 0
                ? `${lateToday.length} significant (≥${minLate}m) · click to review`
                : 'All on time today'
              : 'Current month only'}
            onClick={isCurrentMonth && lateTotalRaw > 0 ? scrollToLate : undefined}/>
        </div>

        {/* ── TODAY'S LATE ARRIVALS ───────────────────────────────────────── */}
        {isCurrentMonth && (
          <div ref={lateRef} className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden mb-4">
            {/* panel header */}
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between"
              style={{ background: lateToday.length > 0 ? 'linear-gradient(90deg,#fff7ed,#fff)' : 'linear-gradient(90deg,#f0fdf4,#fff)' }}>
              <div className="flex items-center gap-3">
                <div style={{ width:36,height:36,borderRadius:10,background:lateToday.length>0?'#fef3c7':'#dcfce7',display:'flex',alignItems:'center',justifyContent:'center' }}>
                  {lateToday.length > 0
                    ? <AlertTriangle size={16} style={{ color:'#d97706' }}/>
                    : <CheckCircle2  size={16} style={{ color:'#16a34a' }}/>}
                </div>
                <div>
                  <p className="text-[13px] font-black text-slate-800">
                    {lateToday.length > 0
                      ? `${lateToday.length} Late Arrival${lateToday.length>1?'s':''} Today`
                      : lateTotalRaw > 0
                        ? `No significant late arrivals (${lateTotalRaw} under ${minLate}m threshold)`
                        : 'All Employees On Time Today'}
                  </p>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    {lateToday.length > 0
                      ? `${today} · Showing employees late by ≥ ${minLate} min · Admin can regularize directly`
                      : `${today} · Shift grace threshold: ${minLate} minutes`}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {/* Threshold selector */}
                <div className="flex items-center gap-1.5 bg-slate-100 rounded-lg px-2 py-1">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Late by ≥</span>
                  {[5, 10, 15, 30].map(m => (
                    <button key={m} onClick={() => setMinLate(m)}
                      className="text-[11px] font-bold px-2 py-0.5 rounded-md transition-colors"
                      style={{
                        background: minLate === m ? '#1e3a8a' : 'transparent',
                        color: minLate === m ? '#fff' : '#64748b',
                      }}>
                      {m}m
                    </button>
                  ))}
                </div>
                <button onClick={refetchToday}
                  className="flex items-center gap-1.5 text-[12px] text-slate-500 border border-slate-200 rounded-lg px-3 py-1.5 hover:bg-slate-50 transition-colors">
                  <RefreshCw size={11}/> Refresh
                </button>
              </div>
            </div>

            {/* Late table */}
            {lateToday.length === 0 ? (
              <div className="py-10 text-center">
                <CheckCircle2 size={36} className="mx-auto mb-3 text-emerald-200"/>
                <p className="text-slate-400 font-semibold text-[13px]">No late arrivals recorded for today</p>
              </div>
            ) : (
              <div style={{ overflowX:'auto' }}>
                <table className="w-full" style={{ minWidth:680 }}>
                  <thead>
                    <tr style={{ background:'#F8FAFC', borderBottom:'1px solid #F1F5F9' }}>
                      <th className="text-left py-2.5 pl-5 pr-3 text-[11px] font-black uppercase tracking-wider text-slate-400">Employee</th>
                      <th className="text-left py-2.5 px-3 text-[11px] font-black uppercase tracking-wider text-slate-400">Department</th>
                      <th className="text-center py-2.5 px-3 text-[11px] font-black uppercase tracking-wider text-slate-400">Check-in</th>
                      <th className="text-center py-2.5 px-3 text-[11px] font-black uppercase tracking-wider text-red-400">Late By</th>
                      <th className="text-center py-2.5 px-3 text-[11px] font-black uppercase tracking-wider text-slate-400">Status</th>
                      <th className="py-2.5 pl-3 pr-5 text-right text-[11px] font-black uppercase tracking-wider text-slate-400">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lateToday.map((r, i) => {
                      const late = parseInt(r.late_minutes) || 0;
                      const severity = late > 60 ? 'high' : late > 30 ? 'mid' : 'low';
                      const lateBg   = severity==='high' ? '#fef2f2' : severity==='mid' ? '#fff7ed' : '#fffbeb';
                      const lateCol  = severity==='high' ? '#dc2626' : severity==='mid' ? '#d97706' : '#ca8a04';
                      return (
                        <tr key={r.id} style={{ borderBottom:'1px solid #F8FAFC' }}
                          className="hover:bg-amber-50/30 transition-colors">
                          <td className="py-3 pl-5 pr-3">
                            <div className="flex items-center gap-2.5">
                              <Avatar name={r.employee_name} size={30}/>
                              <div>
                                <p className="text-[12px] font-bold text-slate-800">{r.employee_name}</p>
                                <p className="text-[10px] text-slate-400">{r.employee_code || '—'}</p>
                              </div>
                            </div>
                          </td>
                          <td className="py-3 px-3 text-[12px] text-slate-500">{r.department_name || '—'}</td>
                          <td className="py-3 px-3 text-center">
                            <span className="text-[12px] font-bold text-slate-700">{fmtTime(r.in_time)}</span>
                          </td>
                          <td className="py-3 px-3 text-center">
                            <span style={{ background:lateBg, color:lateCol, borderRadius:20, padding:'3px 10px', fontSize:11, fontWeight:800 }}>
                              +{fmtLate(late)}
                            </span>
                          </td>
                          <td className="py-3 px-3 text-center">
                            <span style={{ background:'#fef3c7', color:'#92400e', borderRadius:6, padding:'2px 8px', fontSize:10, fontWeight:700, textTransform:'uppercase', letterSpacing:0.5 }}>
                              Late
                            </span>
                          </td>
                          <td className="py-3 pl-3 pr-5 text-right">
                            <button onClick={() => setRegRec(r)}
                              className="flex items-center gap-1.5 text-[11px] font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg px-3 py-1.5 transition-colors ml-auto">
                              <ClipboardEdit size={11}/>
                              Regularize
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── TREND CHART + QUICK STATS ─────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">

          {/* Trend chart */}
          <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
            <SectionHead icon={BarChart2} title="Attendance Trend" sub={dateLabel}
              right={
                <div className="flex gap-1 bg-slate-100 rounded-lg p-0.5">
                  {[['week','Week'],['month','Month']].map(([k,l]) => (
                    <button key={k} onClick={() => setRange(k)}
                      className={`text-[11px] font-bold px-2.5 py-1 rounded-md transition-colors ${trendRange===k?'bg-white text-blue-700 shadow-sm':'text-slate-400 hover:text-slate-600'}`}>
                      {l}
                    </button>
                  ))}
                </div>
              }
            />
            {trend.length === 0 ? (
              <div className="h-52 flex items-center justify-center text-slate-200 text-sm border-2 border-dashed border-slate-100 rounded-xl">
                No trend data
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={trend} margin={{ top:4, right:4, left:-20, bottom:0 }}>
                  <defs>
                    <linearGradient id="gPresent" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#10b981" stopOpacity={0.15}/>
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="gAbsent" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#ef4444" stopOpacity={0.12}/>
                      <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false}/>
                  <XAxis dataKey={trendRange==='week' ? 'dayName' : 'day'}
                    tick={{ fontSize:10, fill:'#94A3B8' }} axisLine={false} tickLine={false}/>
                  <YAxis tick={{ fontSize:10, fill:'#94A3B8' }} axisLine={false} tickLine={false}/>
                  <ReTooltip content={<LineTip/>}/>
                  <Area type="monotone" dataKey="Present" stroke="#10b981" strokeWidth={2.5}
                    fill="url(#gPresent)" dot={{ r:3, fill:'#10b981', strokeWidth:0 }} activeDot={{ r:5 }}/>
                  <Area type="monotone" dataKey="Absent"  stroke="#ef4444" strokeWidth={2.5}
                    fill="url(#gAbsent)"  dot={{ r:3, fill:'#ef4444', strokeWidth:0 }} activeDot={{ r:5 }}/>
                  <Area type="monotone" dataKey="Leave"   stroke="#8b5cf6" strokeWidth={2}
                    fill="none" dot={{ r:3, fill:'#8b5cf6', strokeWidth:0 }} activeDot={{ r:5 }}/>
                </AreaChart>
              </ResponsiveContainer>
            )}
            <div className="flex items-center gap-4 mt-2 justify-center">
              {[['Present','#10b981'],['Absent','#ef4444'],['Leave','#8b5cf6']].map(([l,c]) => (
                <div key={l} className="flex items-center gap-1.5">
                  <span className="w-3 h-1.5 rounded-full" style={{ background:c }}/>
                  <span className="text-[11px] text-slate-400 font-semibold">{l}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Month stats panel */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5 flex flex-col">
            <SectionHead icon={Activity} title="Monthly Overview" sub={dateLabel}/>
            <div className="flex flex-col gap-3 flex-1">
              {[
                { label:'Total Employees', val:totals.employees,    color:'#2563eb', bg:'#eff6ff', icon:Users },
                { label:'With Presence',   val:totals.presentEmps,  color:'#16a34a', bg:'#f0fdf4', icon:UserCheck },
                { label:'Had Absences',    val:totals.absentEmps,   color:'#ef4444', bg:'#fef2f2', icon:UserX },
                { label:'On Leave',        val:totals.leaveEmps,    color:'#7c3aed', bg:'#f5f3ff', icon:CalendarX },
                { label:'Half Days',       val:totals.halfEmps,     color:'#d97706', bg:'#fffbeb', icon:Timer },
              ].map(s => (
                <div key={s.label} className="flex items-center gap-3 p-2.5 rounded-xl" style={{ background:s.bg }}>
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background:'rgba(255,255,255,0.7)' }}>
                    <s.icon size={13} style={{ color:s.color }}/>
                  </div>
                  <span className="text-[12px] text-slate-600 flex-1 font-medium">{s.label}</span>
                  <span className="text-[15px] font-black tabular-nums" style={{ color:s.color }}>{s.val}</span>
                </div>
              ))}
            </div>
            <div className="mt-4 pt-3 border-t border-slate-100 text-center">
              <p className="text-[11px] text-slate-400 font-semibold">MONTH ATTENDANCE RATE</p>
              <p className="text-[26px] font-black text-emerald-600 tabular-nums">{attPct}%</p>
            </div>
          </div>
        </div>

        {/* ── DEPARTMENT BREAKDOWN ────────────────────────────────────────── */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="px-5 pt-4 pb-3 border-b border-slate-100">
            <SectionHead icon={Building2} title="Department-wise Attendance" sub={dateLabel}
              right={
                <span className="text-[11px] text-slate-400 font-semibold">
                  {depts.length} dept{depts.length!==1?'s':''}
                </span>
              }
            />
          </div>
          {depts.length === 0 ? (
            <div className="py-12 text-center">
              <Building2 size={32} className="mx-auto mb-2 text-slate-100"/>
              <p className="text-slate-400 text-sm">No department data</p>
            </div>
          ) : (
            <div style={{ overflowX:'auto', maxHeight:360, overflowY:'auto' }}>
              <table className="w-full" style={{ minWidth:520 }}>
                <thead className="sticky top-0" style={{ background:'#F8FAFC' }}>
                  <tr style={{ borderBottom:'1px solid #F1F5F9' }}>
                    <th className="text-left py-2.5 pl-5 pr-3 text-[11px] font-black uppercase tracking-wider text-slate-400">Department</th>
                    <th className="text-center py-2.5 px-3 text-[11px] font-black uppercase tracking-wider text-emerald-600">Present</th>
                    <th className="text-center py-2.5 px-3 text-[11px] font-black uppercase tracking-wider text-red-500">Absent</th>
                    <th className="text-center py-2.5 px-3 text-[11px] font-black uppercase tracking-wider text-purple-500">Leave</th>
                    <th className="text-left py-2.5 pl-3 pr-5 text-[11px] font-black uppercase tracking-wider text-blue-500">Att%</th>
                  </tr>
                </thead>
                <tbody>
                  {depts.map((d, i) => <DeptRow key={d.department_name||i} d={d} idx={i}/>)}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>

      {/* ── REGULARIZE MODAL ─────────────────────────────────────────────── */}
      {regRec && <RegularizeModal rec={regRec} onClose={() => setRegRec(null)} onDone={() => {}} />}

    </div>
  );
}
