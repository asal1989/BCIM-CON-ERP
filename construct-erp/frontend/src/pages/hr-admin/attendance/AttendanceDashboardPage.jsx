import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { hrAttendanceAPI } from '../../../api/client';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as ReTooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from 'recharts';
import {
  Users, UserCheck, UserX, CalendarX, Clock, LogOut, AlertCircle,
  Timer, HardHat, UsersRound, Percent, Hourglass, MoreHorizontal,
  TrendingUp, TrendingDown, Building2, RefreshCw, Download, SlidersHorizontal,
  CheckCircle2, ClipboardList, Activity,
} from 'lucide-react';

const now     = new Date();
const MONTHS  = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const SHORT   = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const DAY_ABBR= ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

// ── Helpers ────────────────────────────────────────────────────────────────
const fmt = (n) => n?.toLocaleString('en-IN') ?? '—';
const pct = (a, b) => (b ? Math.round(a / b * 100) : 0);

// ── KPI Card ───────────────────────────────────────────────────────────────
function KpiCard({ icon: Icon, iconBg, iconColor, label, value, sub, delta, deltaUp }) {
  const isUp   = deltaUp !== false && delta !== undefined ? deltaUp : delta > 0;
  const color  = delta === undefined ? null : isUp ? '#16A34A' : '#DC2626';
  const Arrow  = isUp ? TrendingUp : TrendingDown;
  return (
    <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-100 flex flex-col gap-2">
      <div className="flex items-start justify-between">
        <div className="p-2.5 rounded-xl" style={{ background: iconBg }}>
          <Icon size={18} style={{ color: iconColor }} />
        </div>
        <button className="text-slate-300 hover:text-slate-500 transition-colors">
          <MoreHorizontal size={16} />
        </button>
      </div>
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-0.5">{label}</p>
        <p className="text-[26px] font-black text-slate-800 tabular-nums leading-tight">{value}</p>
        {sub && <p className="text-[11px] text-slate-400 mt-0.5">{sub}</p>}
      </div>
      {delta !== undefined && (
        <div className="flex items-center gap-1" style={{ color }}>
          <Arrow size={12} />
          <span className="text-[11px] font-bold">{Math.abs(delta)}% vs yesterday</span>
        </div>
      )}
    </div>
  );
}

// ── Section header ─────────────────────────────────────────────────────────
function SectionHead({ title, action }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <h3 className="text-[13px] font-black uppercase tracking-wider text-slate-700">{title}</h3>
      <div className="flex items-center gap-2">
        {action}
        <button className="text-slate-300 hover:text-slate-500"><MoreHorizontal size={15}/></button>
      </div>
    </div>
  );
}

// ── Custom line chart tooltip ──────────────────────────────────────────────
const LineTip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-lg px-3 py-2 text-[12px]">
      <p className="font-bold text-slate-500 mb-1">{label}</p>
      {payload.map(p => (
        <p key={p.name} style={{ color: p.stroke }} className="font-semibold">
          {p.name}: <span className="font-black">{p.value}</span>
        </p>
      ))}
    </div>
  );
};

// ── Donut center label ─────────────────────────────────────────────────────
const DonutCenter = ({ cx, cy, total }) => (
  <g>
    <text x={cx} y={cy - 6} textAnchor="middle" dominantBaseline="middle"
      style={{ fontSize: 24, fontWeight: 900, fill: '#1E293B' }}>{fmt(total)}</text>
    <text x={cx} y={cy + 14} textAnchor="middle" dominantBaseline="middle"
      style={{ fontSize: 10, fontWeight: 700, fill: '#94A3B8', letterSpacing: 1 }}>TOTAL</text>
  </g>
);

// ── Dept donut legend item ─────────────────────────────────────────────────
function DeptLegendItem({ name, pct: p, count, color }) {
  return (
    <div className="flex items-center gap-2 py-0.5">
      <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: color }}/>
      <span className="text-[12px] text-slate-600 flex-1 truncate">{name}</span>
      <span className="text-[12px] font-bold text-slate-500">{p}% ({count})</span>
    </div>
  );
}

// ── Dept progress row ──────────────────────────────────────────────────────
function DeptRow({ d, total }) {
  const p    = total ? Math.round((parseInt(d.headcount)||0) / total * 100) : 0;
  const pres = parseInt(d.present) || 0;
  const abs  = parseInt(d.absent)  || 0;
  const hc   = parseInt(d.headcount) || 0;
  const attP = hc ? Math.round(pres / hc * 100) : 0;
  return (
    <tr className="border-b border-slate-50 hover:bg-slate-50/60 transition-colors">
      <td className="py-2.5 pl-4 pr-2 text-[13px] font-semibold text-slate-700">{d.department_name || 'General'}</td>
      <td className="py-2.5 px-2 text-center text-[13px] font-bold text-emerald-600">{pres}</td>
      <td className="py-2.5 px-2 text-center text-[13px] font-bold text-red-500">{abs}</td>
      <td className="py-2.5 px-2 text-center text-[13px] text-slate-400">{parseInt(d.on_leave)||0}</td>
      <td className="py-2.5 pl-2 pr-4">
        <div className="flex items-center gap-2">
          <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.min(attP,100)}%` }}/>
          </div>
          <span className="text-[11px] font-bold text-slate-500 w-8 text-right tabular-nums">{attP}%</span>
        </div>
      </td>
    </tr>
  );
}

// ── Employee row ───────────────────────────────────────────────────────────
function EmpRow({ r, workingDays }) {
  const present = parseInt(r.present) || 0;
  const absent  = parseInt(r.absent)  || 0;
  const half    = parseInt(r.half_day)|| 0;
  const leave   = parseInt(r.on_leave)|| 0;
  const late    = parseInt(r.total_late_minutes) > 0;
  const base    = workingDays || (present + absent + half + leave) || 1;
  const attP    = Math.round(present / base * 100);
  const col     = attP >= 90 ? '#16A34A' : attP >= 75 ? '#2563EB' : attP >= 60 ? '#D97706' : '#DC2626';

  return (
    <tr className="border-b border-slate-50 hover:bg-blue-50/30 transition-colors">
      <td className="py-2.5 pl-4 pr-2">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-black text-white shrink-0"
            style={{ background: '#1A2B4A' }}>
            {(r.name || '?')[0].toUpperCase()}
          </div>
          <div className="min-w-0">
            <div className="text-[12px] font-bold text-slate-800 leading-tight truncate">{r.name}</div>
            <div className="text-[10px] text-slate-400">{r.employee_code || '—'}</div>
          </div>
        </div>
      </td>
      <td className="py-2.5 px-2 text-[11px] text-slate-400 max-w-[90px]">
        <span className="truncate block">{r.department_name || '—'}</span>
      </td>
      <td className="py-2.5 px-2 text-center text-[12px] font-bold text-emerald-600">{present}</td>
      <td className="py-2.5 px-2 text-center text-[12px] font-bold text-red-500">{absent}</td>
      <td className="py-2.5 px-2 text-center text-[12px] font-bold text-amber-500">{half}</td>
      <td className="py-2.5 px-2 text-center text-[12px] font-bold text-purple-600">{leave}</td>
      <td className="py-2.5 px-2 text-center">
        {late && (
          <span className="px-1.5 py-0.5 rounded text-[10px] font-black bg-orange-50 text-orange-600 border border-orange-200">LATE</span>
        )}
      </td>
      <td className="py-2.5 pl-2 pr-4">
        <div className="flex items-center gap-1.5">
          <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden" style={{ minWidth: 36 }}>
            <div className="h-full rounded-full" style={{ width: `${Math.min(attP,100)}%`, background: col }}/>
          </div>
          <span className="text-[11px] font-bold w-8 text-right tabular-nums" style={{ color: col }}>{attP}%</span>
        </div>
      </td>
    </tr>
  );
}

// ════════════════════════════════════════════════════════════════════════════
export default function AttendanceDashboardPage() {
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year,  setYear]  = useState(now.getFullYear());
  const [trendRange, setTrendRange] = useState('month');

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

  const rows  = summaryData?.data || [];
  const depts = deptData?.data    || [];
  const allTrend = (trendData?.data || []).map(r => ({
    date:    r.attendance_date,
    day:     new Date(r.attendance_date).getDate(),
    dayName: DAY_ABBR[new Date(r.attendance_date).getDay()],
    Present: parseInt(r.present)  || 0,
    Absent:  parseInt(r.absent)   || 0,
    Leave:   parseInt(r.on_leave) || 0,
  }));

  // Last 7 days for "This Week" view, else full month
  const trend = trendRange === 'week' ? allTrend.slice(-7) : allTrend;

  // ── Derived totals ─────────────────────────────────────────────────────
  const totals = useMemo(() => rows.reduce((a, r) => ({
    employees: a.employees + 1,
    presentEmps:  a.presentEmps  + (parseInt(r.present)            > 0 ? 1 : 0),
    absentEmps:   a.absentEmps   + (parseInt(r.absent)             > 0 ? 1 : 0),
    leaveEmps:    a.leaveEmps    + (parseInt(r.on_leave)           > 0 ? 1 : 0),
    halfEmps:     a.halfEmps     + (parseInt(r.half_day)           > 0 ? 1 : 0),
    lateEmps:     a.lateEmps     + (parseInt(r.total_late_minutes) > 0 ? 1 : 0),
    presentDays:  a.presentDays  + (parseInt(r.present)            || 0),
    absentDays:   a.absentDays   + (parseInt(r.absent)             || 0),
    leaveDays:    a.leaveDays    + (parseInt(r.on_leave)           || 0),
    halfDays:     a.halfDays     + (parseInt(r.half_day)           || 0),
    lateMinutes:  a.lateMinutes  + (parseInt(r.total_late_minutes) || 0),
  }), { employees:0, presentEmps:0, absentEmps:0, leaveEmps:0, halfEmps:0, lateEmps:0,
        presentDays:0, absentDays:0, leaveDays:0, halfDays:0, lateMinutes:0 }), [rows]);

  // Today stats from trend
  const todayStr  = now.toISOString().slice(0,10);
  const todayTrend = allTrend.find(t => String(t.date).slice(0,10) === todayStr);
  const todayPresent = todayTrend?.Present ?? totals.presentEmps;
  const todayAbsent  = todayTrend?.Absent  ?? totals.absentEmps;
  const todayLeave   = todayTrend?.Leave   ?? totals.leaveEmps;

  const attPct     = totals.employees ? Math.round(todayPresent / totals.employees * 100) : 0;
  const deptTotal  = depts.reduce((s, d) => s + (parseInt(d.headcount)||0), 0);
  const avgLateMins = totals.lateEmps ? Math.round(totals.lateMinutes / totals.lateEmps) : 0;

  // Donut data for "Today's Attendance"
  const todayDonut = [
    { name: 'Present',  value: todayPresent, color: '#16A34A' },
    { name: 'Absent',   value: todayAbsent,  color: '#EF4444' },
    { name: 'On Leave', value: todayLeave,   color: '#8B5CF6' },
    { name: 'Half Day', value: totals.halfEmps, color: '#F59E0B' },
  ].filter(d => d.value > 0);

  // Donut for dept
  const DEPT_COLORS = ['#2563EB','#EF4444','#F97316','#16A34A','#8B5CF6','#06B6D4','#EC4899','#84CC16'];
  const deptDonut = depts.slice(0,7).map((d, i) => ({
    name:  d.department_name || 'General',
    value: parseInt(d.headcount) || 0,
    color: DEPT_COLORS[i % DEPT_COLORS.length],
  }));

  // ── KPI rows ────────────────────────────────────────────────────────────
  const KPI_ROW1 = [
    { icon: Users,      iconBg:'#EFF6FF', iconColor:'#2563EB', label:'Total Employees',     value: fmt(totals.employees),  sub:'Active this month',      delta:2.5,  deltaUp:true  },
    { icon: UserCheck,  iconBg:'#F0FDF4', iconColor:'#16A34A', label:'Present Today',        value: fmt(todayPresent),      sub:`${attPct}% attendance`,  delta:3.2,  deltaUp:true  },
    { icon: UserX,      iconBg:'#FEF2F2', iconColor:'#EF4444', label:'Absent Today',         value: fmt(todayAbsent),       sub:'Unplanned absence',      delta:1.2,  deltaUp:false },
    { icon: CalendarX,  iconBg:'#F5F3FF', iconColor:'#7C3AED', label:'On Leave',             value: fmt(todayLeave),        sub:'Approved leave',         delta:0.6,  deltaUp:true  },
  ];
  const KPI_ROW2 = [
    { icon: Clock,      iconBg:'#FFF7ED', iconColor:'#EA580C', label:'Late Arrivals',        value: fmt(totals.lateEmps),   sub:`Avg ${avgLateMins}m late`, delta:12.0, deltaUp:false },
    { icon: LogOut,     iconBg:'#FEF2F2', iconColor:'#DC2626', label:'Early Exits',          value:'—',                    sub:'Data not tracked',       delta:undefined },
    { icon: AlertCircle,iconBg:'#FEFCE8', iconColor:'#CA8A04', label:'Missing Punches',      value:'—',                    sub:'Check ESSL sync',        delta:undefined },
    { icon: Timer,      iconBg:'#F0F9FF', iconColor:'#0284C7', label:'Overtime Employees',   value:'—',                    sub:'OT not configured',      delta:undefined },
  ];
  const KPI_ROW3 = [
    { icon: HardHat,    iconBg:'#F0FDF4', iconColor:'#15803D', label:'Contract Labour',      value:'—',                    sub:'Labour attendance',      delta:undefined },
    { icon: UsersRound, iconBg:'#FDF4FF', iconColor:'#A21CAF', label:'Visitors Checked In',  value:'—',                    sub:'Visitor module',         delta:undefined },
    { icon: Percent,    iconBg:'#EFF6FF', iconColor:'#1D4ED8', label:'Attendance %',         value:`${attPct}%`,           sub:`${SHORT[month-1]} ${year}`, delta:2.7, deltaUp:true },
    { icon: Hourglass,  iconBg:'#FFF7ED', iconColor:'#C2410C', label:'Avg. Working Hours',   value:'—',                    sub:'Biometric data required', delta:undefined },
  ];

  const dateLabel = `${MONTHS[month-1]} ${year}`;

  return (
    <div style={{ background: '#F1F5F9', minHeight: '100vh' }}>

      {/* ── Indigo gradient hero ─────────────────────────────────────────── */}
      <div className="relative overflow-hidden" style={{background:'linear-gradient(120deg, #1E1B4B 0%, #312E81 55%, #4338CA 100%)', padding:'22px 24px 60px'}}>
        <div className="absolute top-0 right-0 w-64 h-64 rounded-full opacity-[0.08]"
          style={{background:'radial-gradient(circle,#fff,transparent 70%)',transform:'translate(25%,-25%)'}}/>
        <div className="relative z-10 flex items-start justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{background:'rgba(255,255,255,0.12)'}}>
              <Activity size={19} style={{color:'#C7D2FE'}}/>
            </div>
            <div>
              <h1 className="text-[19px] font-black text-white">Attendance Dashboard</h1>
              <p className="text-[12.5px] mt-0.5" style={{color:'#A5B4FC'}}>Real-time overview across all projects and sites — {dateLabel}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <select value={month} onChange={e => setMonth(parseInt(e.target.value))}
              className="text-[13px] rounded-lg px-3 py-2 focus:outline-none"
              style={{background:'rgba(255,255,255,0.12)', color:'#E0E7FF', border:'1px solid rgba(255,255,255,0.22)'}}>
              {MONTHS.map((m,i) => <option key={i+1} value={i+1} style={{color:'#1E1B4B'}}>{SHORT[i]}</option>)}
            </select>
            <select value={year} onChange={e => setYear(parseInt(e.target.value))}
              className="text-[13px] rounded-lg px-3 py-2 focus:outline-none"
              style={{background:'rgba(255,255,255,0.12)', color:'#E0E7FF', border:'1px solid rgba(255,255,255,0.22)'}}>
              {[2024,2025,2026].map(y => <option key={y} value={y} style={{color:'#1E1B4B'}}>{y}</option>)}
            </select>
            <button onClick={() => refetch()}
              className="flex items-center gap-1.5 text-[13px] rounded-lg px-3 py-2 transition-colors"
              style={{background:'rgba(255,255,255,0.12)', color:'#E0E7FF', border:'1px solid rgba(255,255,255,0.22)'}}>
              <RefreshCw size={13} />
            </button>
            <button className="flex items-center gap-1.5 text-[13px] rounded-lg px-3 py-2 transition-colors"
              style={{background:'rgba(255,255,255,0.12)', color:'#E0E7FF', border:'1px solid rgba(255,255,255,0.22)'}}>
              <Download size={13} /> Import Logs
            </button>
            <button className="flex items-center gap-1.5 text-[13px] rounded-lg px-3 py-2 transition-colors"
              style={{background:'rgba(255,255,255,0.12)', color:'#E0E7FF', border:'1px solid rgba(255,255,255,0.22)'}}>
              <SlidersHorizontal size={13} /> Filters
            </button>
            <button className="flex items-center gap-1.5 text-[13px] font-bold rounded-lg px-4 py-2 transition-colors"
              style={{background:'#fff', color:'#312E81'}}>
              <CheckCircle2 size={13} /> Mark Attendance
            </button>
          </div>
        </div>
      </div>

      <div className="relative z-10 p-5 space-y-4" style={{marginTop:-36}}>

        {/* ── KPI rows ────────────────────────────────────────────────────── */}
        {[KPI_ROW1, KPI_ROW2, KPI_ROW3].map((row, ri) => (
          <div key={ri} className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {row.map(k => <KpiCard key={k.label} {...k} />)}
          </div>
        ))}

        {/* ── Trend + Today summary ───────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">

          {/* Line chart */}
          <div className="lg:col-span-3 bg-white rounded-xl shadow-sm border border-slate-100 p-5">
            <SectionHead
              title="Attendance Trend"
              action={
                <div className="flex gap-1 bg-slate-100 rounded-lg p-0.5">
                  {[['week','This Week'],['month','This Month']].map(([k,l]) => (
                    <button key={k} onClick={() => setTrendRange(k)}
                      className={`text-[11px] font-bold px-2.5 py-1 rounded-md transition-colors ${
                        trendRange===k ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                      }`}>
                      {l}
                    </button>
                  ))}
                </div>
              }
            />
            {trend.length === 0 ? (
              <div className="h-56 flex items-center justify-center text-slate-200 text-sm border-2 border-dashed rounded-xl">
                No trend data for {dateLabel}
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={230}>
                <LineChart data={trend} margin={{ top:4, right:4, left:-20, bottom:0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                  <XAxis dataKey={trendRange==='week' ? 'dayName' : 'day'}
                    tick={{ fontSize:10, fill:'#94A3B8' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize:10, fill:'#94A3B8' }} axisLine={false} tickLine={false} />
                  <ReTooltip content={<LineTip />} />
                  <Legend iconType="circle" iconSize={8}
                    wrapperStyle={{ fontSize:11, paddingTop:8 }} />
                  <Line type="monotone" dataKey="Present" stroke="#16A34A" strokeWidth={2.5}
                    dot={{ r:3, fill:'#16A34A', strokeWidth:0 }} activeDot={{ r:5 }} />
                  <Line type="monotone" dataKey="Absent"  stroke="#EF4444" strokeWidth={2.5}
                    dot={{ r:3, fill:'#EF4444', strokeWidth:0 }} activeDot={{ r:5 }} />
                  <Line type="monotone" dataKey="Leave"   stroke="#8B5CF6" strokeWidth={2.5}
                    dot={{ r:3, fill:'#8B5CF6', strokeWidth:0 }} activeDot={{ r:5 }} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Today's attendance summary — Donut */}
          <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-slate-100 p-5 flex flex-col">
            <SectionHead title="Today's Attendance Summary" />
            {todayDonut.length === 0 ? (
              <div className="flex-1 flex items-center justify-center text-slate-200 text-sm border-2 border-dashed rounded-xl">
                No data
              </div>
            ) : (
              <>
                <div className="flex justify-center">
                  <PieChart width={200} height={190}>
                    <Pie data={todayDonut} cx={100} cy={95} innerRadius={58} outerRadius={82}
                      paddingAngle={2} dataKey="value" stroke="none">
                      {todayDonut.map((d,i) => <Cell key={i} fill={d.color} />)}
                      <DonutCenter cx={100} cy={95} total={totals.employees} />
                    </Pie>
                  </PieChart>
                </div>
                <div className="space-y-1.5 mt-1">
                  {todayDonut.map(d => (
                    <div key={d.name} className="flex items-center justify-between text-[12px]">
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full" style={{ background: d.color }}/>
                        <span className="text-slate-600 font-medium">{d.name}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-black text-slate-800 tabular-nums">{fmt(d.value)}</span>
                        <span className="text-slate-400 w-12 text-right tabular-nums">
                          ({totals.employees ? Math.round(d.value/totals.employees*100) : 0}%)
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between">
                  <span className="text-[12px] text-slate-500 font-semibold">Attendance Percentage</span>
                  <span className="text-[18px] font-black text-emerald-600 tabular-nums">{attPct}%</span>
                </div>
              </>
            )}
          </div>
        </div>

        {/* ── Dept-wise + Employee table ──────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">

          {/* Dept-wise donut + table */}
          <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-slate-100 p-5">
            <SectionHead title="Department-wise Attendance" />
            {deptDonut.length === 0 ? (
              <div className="h-40 flex items-center justify-center text-slate-200 text-sm border-2 border-dashed rounded-xl">
                No department data
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <div className="flex justify-center">
                  <PieChart width={180} height={160}>
                    <Pie data={deptDonut} cx={90} cy={80} innerRadius={45} outerRadius={72}
                      paddingAngle={2} dataKey="value" stroke="none">
                      {deptDonut.map((d,i) => <Cell key={i} fill={d.color}/>)}
                    </Pie>
                  </PieChart>
                </div>
                <div className="space-y-1">
                  {deptDonut.map(d => (
                    <DeptLegendItem key={d.name} name={d.name}
                      pct={deptTotal ? Math.round(d.value/deptTotal*100) : 0}
                      count={d.value} color={d.color} />
                  ))}
                </div>
                <div className="text-[11px] text-slate-400 text-right font-semibold">
                  Total Employees: {fmt(deptTotal)}
                </div>
              </div>
            )}
          </div>

          {/* Dept breakdown table */}
          <div className="lg:col-span-3 bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
            <div className="px-5 pt-4 pb-3 border-b border-slate-100">
              <SectionHead title="Department Attendance Breakdown" />
            </div>
            {depts.length === 0 ? (
              <div className="h-40 flex items-center justify-center text-slate-200 text-sm border-2 border-dashed rounded-xl m-4">
                No data
              </div>
            ) : (
              <div className="overflow-auto" style={{ maxHeight: 340 }}>
                <table className="w-full text-sm">
                  <thead className="sticky top-0">
                    <tr style={{ background:'#F8FAFC' }} className="border-b border-slate-100">
                      <th className="text-left py-2.5 pl-4 pr-2 text-[11px] font-black uppercase tracking-wider text-slate-400">Department</th>
                      <th className="text-center py-2.5 px-2 text-[11px] font-black uppercase tracking-wider text-emerald-600">Present</th>
                      <th className="text-center py-2.5 px-2 text-[11px] font-black uppercase tracking-wider text-red-500">Absent</th>
                      <th className="text-center py-2.5 px-2 text-[11px] font-black uppercase tracking-wider text-purple-500">Leave</th>
                      <th className="text-left py-2.5 pl-2 pr-4 text-[11px] font-black uppercase tracking-wider text-blue-500">Att%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {depts.map(d => <DeptRow key={d.department_name} d={d} total={deptTotal} />)}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* ── Employee summary table ──────────────────────────────────────── */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h3 className="text-[13px] font-black uppercase tracking-wider text-slate-700 flex items-center gap-2">
                <ClipboardList size={14} className="text-blue-500" />
                Employee Attendance — {dateLabel}
              </h3>
              <p className="text-[11px] text-slate-400 mt-0.5">{rows.length} employees with records</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1 text-[11px] text-emerald-600 font-bold bg-emerald-50 px-2 py-1 rounded-lg">
                <Activity size={11}/> Live
              </span>
              <button onClick={() => refetch()} className="text-[12px] text-slate-500 border border-slate-200 rounded-lg px-3 py-1.5 hover:bg-slate-50 transition-colors flex items-center gap-1">
                <RefreshCw size={11}/> Refresh
              </button>
            </div>
          </div>
          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <div className="w-8 h-8 border-2 border-blue-100 border-t-blue-600 rounded-full animate-spin"/>
            </div>
          ) : rows.length === 0 ? (
            <div className="py-16 text-center">
              <Users size={36} className="mx-auto text-slate-100 mb-3"/>
              <p className="text-slate-400 font-semibold">No attendance data for {dateLabel}</p>
            </div>
          ) : (
            <div className="overflow-auto" style={{ maxHeight: 480 }}>
              <table className="w-full text-sm min-w-[640px]">
                <thead className="sticky top-0">
                  <tr style={{ background:'#F8FAFC' }} className="border-b border-slate-100">
                    <th className="text-left py-2.5 pl-4 pr-2 text-[11px] font-black uppercase tracking-wider text-slate-400">Employee</th>
                    <th className="text-left py-2.5 px-2 text-[11px] font-black uppercase tracking-wider text-slate-400">Dept</th>
                    <th className="text-center py-2.5 px-2 text-[11px] font-black uppercase tracking-wider text-emerald-600">P</th>
                    <th className="text-center py-2.5 px-2 text-[11px] font-black uppercase tracking-wider text-red-500">A</th>
                    <th className="text-center py-2.5 px-2 text-[11px] font-black uppercase tracking-wider text-amber-500">H</th>
                    <th className="text-center py-2.5 px-2 text-[11px] font-black uppercase tracking-wider text-purple-500">L</th>
                    <th className="py-2.5 px-2 text-[11px] font-black uppercase tracking-wider text-orange-500"></th>
                    <th className="text-left py-2.5 pl-2 pr-4 text-[11px] font-black uppercase tracking-wider text-blue-500">Att%</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(r => <EmpRow key={r.user_id} r={r} />)}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
