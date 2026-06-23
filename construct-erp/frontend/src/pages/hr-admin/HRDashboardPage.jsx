// src/pages/hr-admin/HRDashboardPage.jsx  — BCIM HRMS 2026 Premium Dashboard
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer,
} from 'recharts';
import {
  Users, Calendar, CreditCard, TrendingUp, Building2,
  UserCheck, ChevronRight, ArrowUpRight, ArrowDownRight,
  Fingerprint, FileBarChart, Upload, Award, ShieldCheck,
  Download, FileText, Zap, Bot, Send,
  Bell, Link2,
  AlertCircle, CheckCircle2, Briefcase,
  Rocket, HardHat,
  MessageSquare, Search, Banknote,
  ClipboardList, UserPlus, X, Clock,
} from 'lucide-react';
import {
  hrEmployeesAPI, hrPayrollAPI, hrLeaveAPI,
  hrMastersAPI, hrAttendanceAPI, hrAdvancedAPI,
} from '../../api/client';

// ── Brand palette ─────────────────────────────────────────────────────────────
const B = {
  navy:    '#0A1F5C',
  blue:    '#2563EB',
  yellow:  '#F4C430',
  success: '#10B981',
  warning: '#F59E0B',
  danger:  '#EF4444',
  bg:      '#F8FAFC',
};

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmt = (v) =>
  `₹${parseFloat(v||0).toLocaleString('en-IN',{minimumFractionDigits:0,maximumFractionDigits:0})}`;
const pct = (a,b) => (b>0 ? Math.round((a/b)*100) : 0);
const fade = (d=0) => ({
  initial:{opacity:0,y:18}, animate:{opacity:1,y:0},
  transition:{duration:0.42,delay:d,ease:[0.16,1,0.3,1]},
});
const AVATAR_COLORS = [
  ['#6366F1','#4F46E5'],['#0EA5E9','#0284C7'],['#10B981','#059669'],
  ['#F59E0B','#D97706'],['#EF4444','#DC2626'],['#8B5CF6','#7C3AED'],
  ['#EC4899','#DB2777'],['#14B8A6','#0D9488'],
];
const avatarGrad = (n) => AVATAR_COLORS[(n?.charCodeAt(0)||0) % AVATAR_COLORS.length];
const initials   = (n) => (n||'U').split(' ').map(x=>x[0]).join('').slice(0,2).toUpperCase();
const DEPT_COLORS = ['#2563EB','#10B981','#F59E0B','#EF4444','#8B5CF6','#14B8A6','#F97316','#EC4899'];
const MONTHS_FULL = ['','January','February','March','April','May','June','July','August','September','October','November','December'];

const AI_SUGGESTIONS = [
  "Show today's attendance",
  "Generate payroll report",
  "Employees due for appraisal",
  "Predict attrition risk",
  "Upcoming birthdays",
  "Leave trend analysis",
];
const AI_RESPONSES = {
  attendance: "Today's attendance summary is being pulled from the biometric system. Check the Attendance module for real-time data.",
  payroll:    "Payroll data is available in the Payroll module. Use 'Open Payroll' to view detailed breakdowns and process salary.",
  appraisal:  "Appraisal tracking is available in the Appraisals module. Navigate there to see pending reviews and KRA scores.",
  attrition:  "Attrition analysis requires historical data. Head to HR Reports for full workforce analytics.",
  birthday:   "Birthday and work anniversary tracking will be available in an upcoming update.",
  leave:      "Leave trends are available in the Leave Management module. Pending approvals are shown on this dashboard.",
};

// ── Custom Tooltip ─────────────────────────────────────────────────────────────
function ChartTip({ active, payload, label, suffix='' }) {
  if (!active||!payload?.length) return null;
  return (
    <div className="bg-white border border-gray-100 rounded-xl shadow-lg px-4 py-3 text-xs">
      <p className="font-semibold text-gray-700 mb-1">{label}</p>
      {payload.map((p,i)=>(
        <p key={i} style={{color:p.color||B.blue}} className="font-medium">
          {p.name}: {typeof p.value==='number'?p.value.toLocaleString('en-IN'):p.value}{suffix}
        </p>
      ))}
    </div>
  );
}

// ── KPI Card ──────────────────────────────────────────────────────────────────
function KpiCard({ label, value, sub, icon:Icon, color, bg, trend, delay=0, onClick }) {
  const isUp = (trend||0) >= 0;
  return (
    <motion.div {...fade(delay)} onClick={onClick}
      whileHover={{y:-4,boxShadow:'0 20px 40px rgba(10,31,92,0.12)'}}
      className="bg-white rounded-2xl p-5 relative overflow-hidden border border-gray-100 cursor-pointer"
      style={{boxShadow:'0 2px 12px rgba(10,31,92,0.06)'}}>
      <div className="absolute -right-5 -top-5 w-20 h-20 rounded-full opacity-[0.06]" style={{background:color}}/>
      <div className="flex items-start justify-between mb-4">
        <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0" style={{background:bg}}>
          <Icon className="w-5 h-5" style={{color}}/>
        </div>
        {trend !== undefined && (
          <div className={`flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-full ${isUp?'bg-emerald-50 text-emerald-600':'bg-red-50 text-red-500'}`}>
            {isUp?<ArrowUpRight className="w-3 h-3"/>:<ArrowDownRight className="w-3 h-3"/>}
            {Math.abs(trend)}%
          </div>
        )}
      </div>
      <p className="text-3xl font-black text-gray-900 leading-none mb-1">{value??'—'}</p>
      <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">{label}</p>
      {sub && <p className="text-[11px] text-gray-400 mt-1">{sub}</p>}
    </motion.div>
  );
}

// ── Section Header ────────────────────────────────────────────────────────────
function SectionHeader({ title, sub, action, onAction, icon:Icon, iconColor }) {
  return (
    <div className="flex items-center justify-between mb-5">
      <div className="flex items-center gap-3">
        {Icon && (
          <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{background:`${iconColor}18`}}>
            <Icon className="w-4 h-4" style={{color:iconColor}}/>
          </div>
        )}
        <div>
          <h2 className="text-base font-bold text-gray-900">{title}</h2>
          {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
        </div>
      </div>
      {action && (
        <button onClick={onAction}
          className="text-xs font-bold flex items-center gap-1 px-3 py-1.5 rounded-lg hover:bg-gray-50 transition-all"
          style={{color:B.blue}}>
          {action}<ChevronRight className="w-3.5 h-3.5"/>
        </button>
      )}
    </div>
  );
}

// ── AI Chat ───────────────────────────────────────────────────────────────────
function AIAssistantPanel() {
  const [messages, setMessages] = useState([
    { role:'ai', text:"Hello! I'm your AI HR Assistant.\n\nAsk me anything about HR, attendance, payroll, or workforce analytics." }
  ]);
  const [input,  setInput]  = useState('');
  const [typing, setTyping] = useState(false);
  const bottomRef = useRef(null);

  const sendMessage = (text) => {
    const msg = (text||input).trim();
    if (!msg) return;
    setInput('');
    setMessages(p=>[...p,{role:'user',text:msg}]);
    setTyping(true);
    setTimeout(()=>{
      const key = Object.keys(AI_RESPONSES).find(k=>msg.toLowerCase().includes(k));
      const reply = AI_RESPONSES[key]||"I'm here to help! Navigate to the relevant module for detailed information, or try: attendance, payroll, appraisal, attrition, birthday, or leave.";
      setMessages(p=>[...p,{role:'ai',text:reply}]);
      setTyping(false);
    }, 1100);
  };

  useEffect(()=>{ bottomRef.current?.scrollIntoView({behavior:'smooth'}); },[messages,typing]);

  return (
    <div className="flex flex-col h-full bg-white rounded-2xl border border-gray-100 overflow-hidden"
      style={{boxShadow:'0 4px 24px rgba(10,31,92,0.08)'}}>
      {/* Header */}
      <div className="px-5 py-4 flex items-center gap-3 border-b border-white/10 flex-shrink-0"
        style={{background:`linear-gradient(135deg,${B.navy},#1e3a8a)`}}>
        <div className="w-9 h-9 rounded-xl bg-white/15 flex items-center justify-center">
          <Bot className="w-5 h-5 text-white"/>
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-white text-sm">HR Quick Help</p>
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"/>
            <span className="text-white/55 text-[11px]">Module Navigator</span>
          </div>
        </div>
        <Zap className="w-4 h-4 flex-shrink-0" style={{color:B.yellow}}/>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0" style={{background:'#F8FAFC'}}>
        {messages.map((m,i)=>(
          <div key={i} className={`flex ${m.role==='user'?'justify-end':''}`}>
            {m.role==='ai' && (
              <div className="w-7 h-7 rounded-xl flex-shrink-0 flex items-center justify-center mr-2 mt-0.5"
                style={{background:`linear-gradient(135deg,${B.navy},${B.blue})`}}>
                <Bot className="w-3.5 h-3.5 text-white"/>
              </div>
            )}
            <div className={`max-w-[82%] px-3.5 py-2.5 rounded-2xl text-xs leading-relaxed whitespace-pre-line ${
              m.role==='user'?'rounded-br-sm text-white':'bg-white border border-gray-100 text-gray-700 rounded-bl-sm shadow-sm'
            }`} style={m.role==='user'?{background:`linear-gradient(135deg,${B.blue},${B.navy})`}:{}}>
              {m.text}
            </div>
          </div>
        ))}
        {typing && (
          <div className="flex">
            <div className="w-7 h-7 rounded-xl flex-shrink-0 flex items-center justify-center mr-2"
              style={{background:`linear-gradient(135deg,${B.navy},${B.blue})`}}>
              <Bot className="w-3.5 h-3.5 text-white"/>
            </div>
            <div className="bg-white border border-gray-100 shadow-sm rounded-2xl rounded-bl-sm px-4 py-3">
              <div className="flex gap-1 items-center">
                {[0,1,2].map(i=>(
                  <motion.div key={i} className="w-1.5 h-1.5 rounded-full bg-blue-400"
                    animate={{y:[0,-4,0]}} transition={{repeat:Infinity,delay:i*0.15,duration:0.6}}/>
                ))}
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef}/>
      </div>

      {/* Suggestions */}
      <div className="px-4 py-3 border-t border-gray-100 flex-shrink-0">
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-2">Suggested Questions</p>
        <div className="flex flex-wrap gap-1.5">
          {AI_SUGGESTIONS.map((s,i)=>(
            <button key={i} onClick={()=>sendMessage(s)}
              className="text-[11px] font-semibold px-2.5 py-1 rounded-full border border-blue-100 text-blue-600 bg-blue-50 hover:bg-blue-100 transition-colors">
              {s.length>22?s.slice(0,21)+'…':s}
            </button>
          ))}
        </div>
      </div>

      {/* Input */}
      <div className="px-4 pb-4 flex-shrink-0">
        <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-50 transition-all">
          <input value={input} onChange={e=>setInput(e.target.value)}
            onKeyDown={e=>e.key==='Enter'&&sendMessage()}
            placeholder="Ask anything about HR…"
            className="flex-1 bg-transparent text-sm text-gray-700 placeholder-gray-400 focus:outline-none"/>
          <button onClick={()=>sendMessage()} disabled={!input.trim()}
            className="w-7 h-7 rounded-lg flex items-center justify-center transition-all disabled:opacity-40"
            style={{background:`linear-gradient(135deg,${B.blue},${B.navy})`}}>
            <Send className="w-3.5 h-3.5 text-white"/>
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Quick Action Button ───────────────────────────────────────────────────────
function QuickAction({ label, icon:Icon, color, bg, onClick }) {
  return (
    <motion.button onClick={onClick}
      whileHover={{y:-3,boxShadow:'0 8px 24px rgba(0,0,0,0.10)'}}
      whileTap={{scale:0.96}}
      className="flex flex-col items-center gap-2.5 p-4 bg-white rounded-2xl border border-gray-100 cursor-pointer transition-all"
      style={{boxShadow:'0 2px 8px rgba(10,31,92,0.05)'}}>
      <div className="w-11 h-11 rounded-xl flex items-center justify-center" style={{background:bg}}>
        <Icon className="w-5 h-5" style={{color}}/>
      </div>
      <span className="text-[11px] font-bold text-gray-700 leading-tight text-center">{label}</span>
    </motion.button>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
//  MAIN DASHBOARD
// ══════════════════════════════════════════════════════════════════════════════
export default function HRDashboardPage() {
  const navigate = useNavigate();
  const now   = new Date();
  const [month] = useState(now.getMonth()+1);
  const [year]  = useState(now.getFullYear());
  const [aiOpen, setAiOpen] = useState(false);

  // ── API queries ────────────────────────────────────────────────────────────
  const { data: empData }    = useQuery({
    queryKey:['hr-employees','','','active'],
    queryFn:()=>hrEmployeesAPI.list({employment_status:'active'}).then(r=>r.data),
  });
  const { data: allEmpData } = useQuery({
    queryKey:['hr-employees-all'],
    queryFn:()=>hrEmployeesAPI.list({}).then(r=>r.data),
  });
  const { data: noProfileData } = useQuery({
    queryKey:['hr-employees-no-profile'],
    queryFn:()=>hrEmployeesAPI.list({no_profile:'true'}).then(r=>r.data),
  });
  const { data: leaveData }  = useQuery({
    queryKey:['hr-leave-requests','pending'],
    queryFn:()=>hrLeaveAPI.listRequests({status:'pending'}).then(r=>r.data),
  });
  const { data: payrollData } = useQuery({
    queryKey:['hr-payroll',month,year],
    queryFn:()=>hrPayrollAPI.list({month,year}).then(r=>r.data),
  });
  const { data: deptData }    = useQuery({
    queryKey:['hr-departments'],
    queryFn:()=>hrMastersAPI.listDepts().then(r=>r.data),
  });
  const { data: complianceData } = useQuery({
    queryKey:['hr-compliance-alerts'],
    queryFn:()=>hrEmployeesAPI.compliance().then(r=>r.data),
  });
  const { data: attSummaryData } = useQuery({
    queryKey:['hr-attendance-summary',month,year],
    queryFn:()=>hrAttendanceAPI.summary({month,year}).then(r=>r.data),
  });
  const { data: advancedData } = useQuery({
    queryKey:['hr-advanced-analytics-summary'],
    queryFn:()=>hrAdvancedAPI.analyticsSummary().then(r=>r.data),
  });

  // ── Derived values ─────────────────────────────────────────────────────────
  const employees    = empData?.data  || [];
  const allEmployees = allEmpData?.data || [];
  const noProfileCount = (noProfileData?.data || []).length;
  const leaves       = leaveData?.data || [];
  const payroll      = payrollData?.data || [];
  const totals       = payrollData?.totals || {};
  const depts        = deptData?.data || [];
  const compliance   = complianceData?.data || {};
  const complianceTotals = complianceData?.totals || {};
  const attSummary   = attSummaryData?.data || [];
  const advanced     = advancedData?.data || {};

  const totalActive  = employees.length;
  const permanent    = employees.filter(e=>e.employment_type==='permanent').length;
  const probation    = employees.filter(e=>e.employment_type==='probation').length;
  const contract     = employees.filter(e=>e.employment_type==='contract').length;
  const pendingLeaves= leaves.length;
  const payrollPaid  = payroll.filter(r=>r.status==='paid').length;
  const payrollDraft = payroll.filter(r=>r.status==='draft').length;
  const compCount    = Object.values(complianceTotals).reduce((s,n)=>s+parseInt(n||0),0);
  const advancedNeeds = [
    advanced.recruitment?.open_jobs,
    advanced.attendanceCorrections?.pending,
    advanced.training?.planned,
    advanced.cases?.open_cases,
    advanced.exits?.active_exits,
  ].reduce((s,n)=>s+parseInt(n||0),0);

  // Attendance aggregates for this month (from real data)
  const attTotals = useMemo(()=>{
    let present=0, absent=0, halfDay=0, onLeave=0;
    attSummary.forEach(s=>{
      present  += parseInt(s.present  ||0);
      absent   += parseInt(s.absent   ||0);
      halfDay  += parseInt(s.half_day ||0);
      onLeave  += parseInt(s.on_leave ||0);
    });
    const total = present+absent+halfDay;
    return { present, absent, halfDay, onLeave, total, rate: pct(present,total) };
  },[attSummary]);

  // Attendance by department (for chart)
  const attByDept = useMemo(()=>{
    const map = {};
    attSummary.forEach(s=>{
      const dept = s.department_name||'Other';
      if (!map[dept]) map[dept]={dept,present:0,absent:0};
      map[dept].present += parseInt(s.present||0);
      map[dept].absent  += parseInt(s.absent ||0);
    });
    return Object.values(map).sort((a,b)=>(b.present+b.absent)-(a.present+a.absent)).slice(0,7);
  },[attSummary]);

  // Dept distribution for donut
  const deptDist = useMemo(()=>
    depts.map((d,i)=>({
      name:  d.name,
      value: allEmployees.filter(e=>e.department_name===d.name||e.department_id===d.id).length,
      fill:  DEPT_COLORS[i%DEPT_COLORS.length],
    })).filter(d=>d.value>0).slice(0,8),
    [depts,allEmployees]
  );

  // Recent joiners
  const recentJoiners = useMemo(()=>
    [...employees].sort((a,b)=>new Date(b.date_of_joining||0)-new Date(a.date_of_joining||0)).slice(0,6),
    [employees]
  );

  const today = now.toLocaleDateString('en-IN',{weekday:'long',day:'numeric',month:'long',year:'numeric'});

  return (
    <div className="min-h-screen" style={{background:B.bg}}>
      <div className="max-w-[1440px] mx-auto p-6 space-y-6">

        {/* ── TOP BAR ────────────────────────────────────────────────────────── */}
        <motion.div {...fade(0)} className="flex items-center justify-between gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"/>
            <input placeholder="Search employees, reports, modules…"
              className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm text-gray-700 placeholder-gray-400 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50 shadow-sm transition-all"/>
          </div>
          <div className="flex items-center gap-3">
            <motion.button whileHover={{scale:1.04}} whileTap={{scale:0.97}}
              onClick={()=>setAiOpen(p=>!p)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-white shadow-md"
              style={{background:`linear-gradient(135deg,${B.navy},${B.blue})`}}>
              <Zap className="w-4 h-4" style={{color:B.yellow}}/>
              HR Quick Help
            </motion.button>
            <button className="relative w-10 h-10 bg-white border border-gray-200 rounded-xl flex items-center justify-center shadow-sm hover:bg-gray-50 transition-colors">
              <Bell className="w-[18px] h-[18px] text-gray-500"/>
              {compCount>0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center">{Math.min(compCount,9)}</span>
              )}
            </button>
            <button className="relative w-10 h-10 bg-white border border-gray-200 rounded-xl flex items-center justify-center shadow-sm hover:bg-gray-50 transition-colors">
              <MessageSquare className="w-[18px] h-[18px] text-gray-500"/>
              {pendingLeaves>0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-blue-500 text-white text-[9px] font-bold flex items-center justify-center">{Math.min(pendingLeaves,9)}</span>
              )}
            </button>
          </div>
        </motion.div>

        {/* ── WELCOME BANNER ─────────────────────────────────────────────────── */}
        <motion.div {...fade(0.04)} className="relative overflow-hidden rounded-2xl"
          style={{
            background:`linear-gradient(135deg,${B.navy} 0%,#1e3a8a 45%,#1d4ed8 100%)`,
            boxShadow:'0 8px 40px rgba(10,31,92,0.25)',
          }}>
          <div className="absolute top-0 right-0 w-80 h-80 rounded-full opacity-[0.07]"
            style={{background:'radial-gradient(circle,#fff,transparent 70%)',transform:'translate(25%,-25%)'}}/>
          <div className="absolute bottom-0 left-1/4 w-56 h-56 rounded-full opacity-[0.07]"
            style={{background:`radial-gradient(circle,${B.yellow},transparent 70%)`}}/>
          <div className="absolute inset-0 opacity-[0.025]"
            style={{backgroundImage:'linear-gradient(rgba(255,255,255,0.5) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.5) 1px,transparent 1px)',backgroundSize:'40px 40px'}}/>

          <div className="relative z-10 px-8 py-7 flex flex-col md:flex-row md:items-center md:justify-between gap-6">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <div className="w-6 h-6 rounded-full flex items-center justify-center" style={{background:B.yellow}}>
                  <HardHat className="w-3.5 h-3.5" style={{color:B.navy}}/>
                </div>
                <span className="text-white/60 text-sm font-semibold">BCIM Engineering Pvt. Ltd.</span>
              </div>
              <h1 className="text-3xl md:text-4xl font-black text-white leading-tight">
                Welcome Back, <span style={{color:B.yellow}}>HR Manager</span> 👋
              </h1>
              <p className="text-white/55 text-sm mt-2">{today}</p>
              <div className="flex flex-wrap items-center gap-3 mt-5">
                <button onClick={()=>navigate('/hr-admin/employees/new')}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-black shadow-lg hover:opacity-90 active:scale-95 transition-all"
                  style={{background:B.yellow,color:B.navy}}>
                  <UserPlus className="w-4 h-4"/> Add Employee
                </button>
                <button onClick={()=>navigate('/hr-admin/attendance')}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white border border-white/20 hover:bg-white/10 transition-all">
                  <Fingerprint className="w-4 h-4"/> Attendance
                </button>
                <button onClick={()=>navigate('/hr-admin/payroll')}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white border border-white/20 hover:bg-white/10 transition-all">
                  <CreditCard className="w-4 h-4"/> Payroll
                </button>
              </div>
            </div>

            {/* Live KPI chips */}
            <div className="flex flex-wrap gap-3">
              {[
                { label:'Total Employees', value: totalActive||'—',     icon:Users,       dot:'#60a5fa' },
                { label:'Pending Leaves',  value: pendingLeaves||'0',   icon:Calendar,    dot:'#fbbf24' },
                { label:`${MONTHS_FULL[month]} Payroll`, value: payroll.length>0?`${payrollPaid}/${payroll.length} paid`:'Not run', icon:CreditCard, dot:'#34d399' },
                { label:'Compliance Alerts', value: compCount||'0',     icon:ShieldCheck, dot:'#f87171' },
              ].map((s,i)=>(
                <div key={i} className="flex items-center gap-3 bg-white/10 backdrop-blur-sm border border-white/15 rounded-xl px-4 py-3 min-w-[140px]">
                  <s.icon className="w-4 h-4 flex-shrink-0" style={{color:s.dot}}/>
                  <div>
                    <div className="text-white/50 text-[10px] uppercase tracking-wide font-semibold">{s.label}</div>
                    <div className="text-white font-black text-xl leading-none mt-0.5">{s.value}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </motion.div>

        {/* ── MAIN LAYOUT ────────────────────────────────────────────────────── */}
        <div className={`grid gap-6 ${aiOpen?'xl:grid-cols-[1fr_340px]':'grid-cols-1'}`}>
          <div className="space-y-6 min-w-0">

            {/* ── KPI ROW ──────────────────────────────────────────────────── */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-4">
              <KpiCard delay={0.07} label="Total Employees" value={totalActive||'—'} icon={Users}
                color={B.blue}    bg="#EFF6FF" sub="All active staff"         onClick={()=>navigate('/hr-admin/employees')}/>
              <KpiCard delay={0.10} label="Permanent"       value={permanent||'—'}  icon={UserCheck}
                color={B.success} bg="#ECFDF5" sub="Full-time employees"      onClick={()=>navigate('/hr-admin/employees')}/>
              <KpiCard delay={0.13} label="On Probation"    value={probation||'—'}  icon={Clock}
                color="#F59E0B"   bg="#FFFBEB" sub="Under review"             onClick={()=>navigate('/hr-admin/employees')}/>
              <KpiCard delay={0.16} label="Contract"        value={contract||'—'}   icon={Briefcase}
                color="#8B5CF6"   bg="#F5F3FF" sub="Fixed-term staff"         onClick={()=>navigate('/hr-admin/employees')}/>
              <KpiCard delay={0.19} label="Pending Leaves"  value={pendingLeaves}   icon={Calendar}
                color="#F97316"   bg="#FFF7ED" sub="Awaiting approval"        onClick={()=>navigate('/hr-admin/leaves')}/>
              <KpiCard delay={0.22} label="HR Alerts"       value={compCount||'0'}  icon={ClipboardList}
                color={B.danger}  bg="#FEF2F2" sub="Compliance issues"        onClick={()=>navigate('/hr-admin/employees')}/>
              <KpiCard delay={0.25} label="Not Linked"      value={noProfileCount||'0'} icon={Link2}
                color="#D97706"   bg="#FFFBEB" sub="No HR profile yet"        onClick={()=>navigate('/users')}/>
            </div>

            {/* ── UNLINKED STAFF ALERT ─────────────────────────────────── */}
            {noProfileCount > 0 && (
              <motion.div {...fade(0.26)} className="flex items-center justify-between gap-4 px-5 py-3.5 bg-amber-50 border border-amber-200 rounded-xl">
                <div className="flex items-center gap-3">
                  <Link2 className="w-5 h-5 text-amber-600 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-bold text-amber-800">
                      {noProfileCount} team member{noProfileCount !== 1 ? 's' : ''} without HR profile
                    </p>
                    <p className="text-xs text-amber-600 mt-0.5">
                      These staff have login accounts but no HR records (no joining date, department, designation, etc.)
                    </p>
                  </div>
                </div>
                <button onClick={() => navigate('/users')}
                  className="flex-shrink-0 px-4 py-2 rounded-xl bg-amber-500 text-white text-xs font-bold hover:bg-amber-600 transition-colors">
                  Link Now
                </button>
              </motion.div>
            )}

            {/* ── DEPT DONUT + ATTENDANCE CHART ──────────────────────────── */}
            <div className="grid lg:grid-cols-5 gap-6">

              {/* Dept Headcount Donut */}
              <motion.div {...fade(0.25)} className="lg:col-span-2 bg-white rounded-2xl p-6 border border-gray-100"
                style={{boxShadow:'0 2px 12px rgba(10,31,92,0.06)'}}>
                <SectionHeader title="Department Headcount" sub="Live employee distribution"
                  icon={Building2} iconColor="#8B5CF6"
                  action="View Depts" onAction={()=>navigate('/hr-admin/departments')}/>
                {deptDist.length>0 ? (
                  <>
                    <ResponsiveContainer width="100%" height={150}>
                      <PieChart>
                        <Pie data={deptDist} cx="50%" cy="50%" innerRadius={40} outerRadius={68}
                          paddingAngle={3} dataKey="value">
                          {deptDist.map((d,i)=><Cell key={i} fill={d.fill}/>)}
                        </Pie>
                        <Tooltip content={<ChartTip suffix=" employees"/>}/>
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="space-y-2 mt-3">
                      {deptDist.slice(0,5).map((d,i)=>(
                        <div key={i} className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full flex-shrink-0" style={{background:d.fill}}/>
                            <span className="text-xs text-gray-600 font-semibold truncate max-w-[130px]">{d.name}</span>
                          </div>
                          <span className="text-xs font-black text-gray-800">{d.value}</span>
                        </div>
                      ))}
                      {deptDist.length>5 && (
                        <p className="text-[11px] text-gray-400 text-center pt-1">+{deptDist.length-5} more departments</p>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="flex flex-col items-center justify-center h-52 text-gray-300">
                    <Building2 className="w-10 h-10 mb-2"/>
                    <p className="text-sm">No department data</p>
                    <button onClick={()=>navigate('/hr-admin/departments')}
                      className="mt-3 text-xs font-bold text-blue-500 hover:text-blue-600">
                      Set up departments →
                    </button>
                  </div>
                )}
              </motion.div>

              {/* Attendance by Dept (real data) */}
              <motion.div {...fade(0.28)} className="lg:col-span-3 bg-white rounded-2xl p-6 border border-gray-100"
                style={{boxShadow:'0 2px 12px rgba(10,31,92,0.06)'}}>
                <SectionHeader title="Attendance — This Month"
                  sub={`${MONTHS_FULL[month]} ${year} · Department summary`}
                  icon={Fingerprint} iconColor={B.success}
                  action="Full Report" onAction={()=>navigate('/hr-admin/attendance')}/>

                {attByDept.length>0 ? (
                  <>
                    <ResponsiveContainer width="100%" height={180}>
                      <BarChart data={attByDept} margin={{top:0,right:4,left:-24,bottom:0}} barSize={14} barGap={2}>
                        <XAxis dataKey="dept" tick={{fontSize:10,fill:'#94a3b8'}} axisLine={false} tickLine={false}
                          tickFormatter={v=>v.length>8?v.slice(0,7)+'…':v}/>
                        <YAxis tick={{fontSize:10,fill:'#94a3b8'}} axisLine={false} tickLine={false}/>
                        <Tooltip content={<ChartTip suffix=" days"/>}/>
                        <Bar dataKey="present" name="Present" fill={B.success} radius={[3,3,0,0]}/>
                        <Bar dataKey="absent"  name="Absent"  fill="#FCA5A5"   radius={[3,3,0,0]}/>
                      </BarChart>
                    </ResponsiveContainer>
                    {/* Monthly totals */}
                    <div className="flex flex-wrap items-center gap-4 mt-3 pt-3 border-t border-gray-100">
                      {[
                        {l:'Present',  v:attTotals.present,  c:B.success},
                        {l:'Absent',   v:attTotals.absent,   c:B.danger},
                        {l:'Half Day', v:attTotals.halfDay,  c:'#F59E0B'},
                        {l:'On Leave', v:attTotals.onLeave,  c:B.blue},
                        {l:'Att. Rate',v:`${attTotals.rate}%`,c:B.navy},
                      ].map(x=>(
                        <div key={x.l}>
                          <p className="text-[10px] text-gray-400 uppercase tracking-wide">{x.l}</p>
                          <p className="text-sm font-black" style={{color:x.c}}>{x.v}</p>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="flex flex-col items-center justify-center h-52 text-gray-300">
                    <Fingerprint className="w-10 h-10 mb-2"/>
                    <p className="text-sm">No attendance data for {MONTHS_FULL[month]}</p>
                    <button onClick={()=>navigate('/hr-admin/attendance')}
                      className="mt-3 text-xs font-bold text-blue-500 hover:text-blue-600">
                      Mark attendance →
                    </button>
                  </div>
                )}
              </motion.div>
            </div>

            {/* ── PAYROLL SUMMARY ────────────────────────────────────────── */}
            {payroll.length>0 && (
              <motion.div {...fade(0.31)} className="bg-white rounded-2xl p-6 border border-gray-100"
                style={{boxShadow:'0 2px 12px rgba(10,31,92,0.06)'}}>
                <SectionHeader title={`Payroll — ${MONTHS_FULL[month]} ${year}`}
                  sub={`${payroll.length} employees processed`}
                  icon={CreditCard} iconColor="#8B5CF6"
                  action="Open Payroll" onAction={()=>navigate('/hr-admin/payroll')}/>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
                  {[
                    {l:'Gross Earnings',  v:fmt(totals.gross_earnings),   c:B.blue,    bg:'#EFF6FF'},
                    {l:'Total Deductions',v:fmt(totals.total_deductions), c:B.danger,  bg:'#FEF2F2'},
                    {l:'Net Payable',     v:fmt(totals.net_pay),          c:B.success, bg:'#ECFDF5'},
                    {l:'Draft',   v:payrollDraft,   c:'#6B7280', bg:'#F9FAFB'},
                    {l:'Paid',    v:payrollPaid,    c:B.success,  bg:'#ECFDF5'},
                  ].map(x=>(
                    <div key={x.l} className="rounded-2xl p-4" style={{background:x.bg}}>
                      <p className="text-[10px] text-gray-500 uppercase tracking-wide font-bold mb-1">{x.l}</p>
                      <p className="text-lg font-black" style={{color:x.c}}>{x.v}</p>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}

            <motion.div {...fade(0.32)} className="bg-white rounded-2xl p-6 border border-gray-100"
              style={{boxShadow:'0 2px 12px rgba(10,31,92,0.06)'}}>
              <SectionHeader title="Advanced HR Controls"
                sub={`${advancedNeeds} open / pending items across recruitment, training, cases and exits`}
                icon={Briefcase} iconColor={B.blue}
                action="Open Advanced HR" onAction={()=>navigate('/hr-admin/advanced')}/>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
                {[
                  {l:'Open Jobs', v:advanced.recruitment?.open_jobs || 0, c:B.blue, bg:'#EFF6FF'},
                  {l:'Corrections', v:advanced.attendanceCorrections?.pending || 0, c:'#F59E0B', bg:'#FFFBEB'},
                  {l:'Training', v:advanced.training?.planned || 0, c:B.success, bg:'#ECFDF5'},
                  {l:'Open Cases', v:advanced.cases?.open_cases || 0, c:B.danger, bg:'#FEF2F2'},
                  {l:'Active Exits', v:advanced.exits?.active_exits || 0, c:'#8B5CF6', bg:'#F5F3FF'},
                  {l:'Avg Rating', v:advanced.goals?.avg_rating || 0, c:B.navy, bg:'#EFF6FF'},
                ].map(x=>(
                  <div key={x.l} className="rounded-2xl p-4" style={{background:x.bg}}>
                    <p className="text-[10px] text-gray-500 uppercase tracking-wide font-bold mb-1">{x.l}</p>
                    <p className="text-lg font-black" style={{color:x.c}}>{x.v}</p>
                  </div>
                ))}
              </div>
            </motion.div>

            {/* ── QUICK ACTIONS ─────────────────────────────────────────── */}
            <motion.div {...fade(0.34)} className="bg-white rounded-2xl p-6 border border-gray-100"
              style={{boxShadow:'0 2px 12px rgba(10,31,92,0.06)'}}>
              <SectionHeader title="Quick Actions" sub="Most-used shortcuts" icon={Zap} iconColor={B.yellow}/>
              <div className="grid grid-cols-5 sm:grid-cols-10 gap-3">
                {[
                  {label:'Add Employee',   icon:UserPlus,    color:B.blue,    bg:'#EFF6FF', to:'/hr-admin/employees/new'},
                  {label:'Apply Leave',    icon:Calendar,    color:B.success, bg:'#ECFDF5', to:'/hr-admin/leaves'},
                  {label:'Attendance',     icon:Fingerprint, color:'#0EA5E9', bg:'#E0F2FE', to:'/hr-admin/attendance'},
                  {label:'Payslip',        icon:Download,    color:'#8B5CF6', bg:'#F5F3FF', to:'/hr-admin/payroll'},
                  {label:'HR Reports',     icon:FileBarChart,color:'#F59E0B', bg:'#FFFBEB', to:'/hr-admin/reports'},
                  {label:'Advanced HR',    icon:Briefcase,   color:B.danger, bg:'#FEF2F2', to:'/hr-admin/advanced'},
                  {label:'Departments',    icon:Building2,   color:'#14B8A6', bg:'#F0FDFA', to:'/hr-admin/departments'},
                  {label:'Appraisals',     icon:Award,       color:'#F97316', bg:'#FFF7ED', to:'/hr-admin/appraisals'},
                  {label:'Upload Docs',    icon:Upload,      color:'#6366F1', bg:'#EEF2FF', to:'/hr-admin/import'},
                  {label:'Loans',          icon:Banknote,    color:B.navy,    bg:'#EFF6FF', to:'/hr-admin/loans'},
                ].map(a=>(
                  <QuickAction key={a.label} label={a.label} icon={a.icon} color={a.color} bg={a.bg}
                    onClick={()=>a.to&&navigate(a.to)}/>
                ))}
              </div>
            </motion.div>

            {/* ── PEOPLE LISTS ──────────────────────────────────────────── */}
            <div className="grid lg:grid-cols-2 gap-6">

              {/* Recent Joiners */}
              <motion.div {...fade(0.37)} className="bg-white rounded-2xl border border-gray-100 overflow-hidden"
                style={{boxShadow:'0 2px 12px rgba(10,31,92,0.06)'}}>
                <div className="px-5 pt-5 pb-4">
                  <SectionHeader title="Recent Joiners" sub="Latest onboarded employees"
                    icon={UserPlus} iconColor={B.success}
                    action="View All" onAction={()=>navigate('/hr-admin/employees')}/>
                </div>
                {recentJoiners.length>0 ? (
                  <div className="divide-y divide-gray-50">
                    {recentJoiners.map(emp=>{
                      const [g1,g2]=avatarGrad(emp.name);
                      return (
                        <div key={emp.id} onClick={()=>navigate(`/hr-admin/employees/${emp.id}`)}
                          className="flex items-center gap-3 px-5 py-3.5 hover:bg-gray-50 cursor-pointer transition-colors">
                          <div className="w-9 h-9 rounded-xl flex-shrink-0 flex items-center justify-center text-white text-xs font-black"
                            style={{background:`linear-gradient(135deg,${g1},${g2})`}}>
                            {initials(emp.name)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold text-gray-900 truncate">{emp.name}</p>
                            <p className="text-xs text-gray-400 truncate">
                              {emp.employee_code} · {emp.designation_name||emp.designation||'—'}
                            </p>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <p className="text-[10px] text-gray-400">
                              {emp.date_of_joining
                                ? new Date(emp.date_of_joining).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'})
                                : '—'}
                            </p>
                            <p className="text-[10px] text-gray-400 truncate">{emp.department_name||'—'}</p>
                          </div>
                          <ChevronRight className="w-4 h-4 text-gray-300 flex-shrink-0"/>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="py-10 text-center text-gray-400 text-sm">No employees yet</div>
                )}
                <div className="px-5 pb-5 pt-3">
                  <button onClick={()=>navigate('/hr-admin/employees/new')}
                    className="w-full py-2.5 rounded-xl text-sm font-black text-white hover:opacity-90 active:scale-95 transition-all"
                    style={{background:`linear-gradient(135deg,${B.blue},${B.navy})`}}>
                    + Add New Employee
                  </button>
                </div>
              </motion.div>

              {/* Pending Leaves */}
              <motion.div {...fade(0.40)} className="bg-white rounded-2xl border border-gray-100 overflow-hidden"
                style={{boxShadow:'0 2px 12px rgba(10,31,92,0.06)'}}>
                <div className="px-5 pt-5 pb-4">
                  <SectionHeader title="Pending Leave Requests" sub="Awaiting your approval"
                    icon={Calendar} iconColor="#F59E0B"
                    action={leaves.length>0?`Review All (${leaves.length})`:undefined}
                    onAction={()=>navigate('/hr-admin/leaves')}/>
                </div>
                {leaves.length===0 ? (
                  <div className="py-12 text-center">
                    <CheckCircle2 className="w-10 h-10 text-emerald-300 mx-auto mb-2"/>
                    <p className="text-sm font-bold text-gray-500">All caught up!</p>
                    <p className="text-xs text-gray-400 mt-1">No pending leave requests</p>
                  </div>
                ) : (
                  <div className="divide-y divide-gray-50">
                    {leaves.map(req=>{
                      const [g1,g2]=avatarGrad(req.employee_name);
                      return (
                        <div key={req.id} className="flex items-center gap-3 px-5 py-3.5 hover:bg-gray-50 transition-colors">
                          <div className="w-9 h-9 rounded-full flex-shrink-0 flex items-center justify-center text-white text-xs font-black"
                            style={{background:`linear-gradient(135deg,${g1},${g2})`}}>
                            {initials(req.employee_name)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold text-gray-900 truncate">{req.employee_name}</p>
                            <p className="text-xs text-gray-400">
                              {req.leave_type_name||'Leave'} · {req.total_days||req.days||'?'} day(s)
                              {req.from_date ? ` · ${new Date(req.from_date).toLocaleDateString('en-IN',{day:'2-digit',month:'short'})}` : ''}
                            </p>
                          </div>
                          <span className="flex-shrink-0 text-[10px] font-black px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                            Pending
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
                {leaves.length>0 && (
                  <div className="px-5 pb-5 pt-3">
                    <button onClick={()=>navigate('/hr-admin/leaves')}
                      className="w-full py-2.5 rounded-xl text-sm font-black text-amber-700 bg-amber-50 hover:bg-amber-100 transition-all border border-amber-200">
                      Open Leave Management
                    </button>
                  </div>
                )}
              </motion.div>
            </div>

            {/* ── COMPLIANCE ALERTS ─────────────────────────────────────── */}
            {compCount>0 && (
              <motion.div {...fade(0.43)} className="bg-white rounded-2xl p-6 border border-gray-100"
                style={{boxShadow:'0 2px 12px rgba(10,31,92,0.06)'}}>
                <SectionHeader title="HR Compliance Alerts"
                  sub="Employees requiring action"
                  icon={ShieldCheck} iconColor={B.danger}
                  action="View Employees" onAction={()=>navigate('/hr-admin/employees')}/>
                <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  {[
                    {key:'probation_due',      label:'Probation Due',       color:'#F59E0B', bg:'#FFFBEB', icon:Clock},
                    {key:'missing_statutory',  label:'Statutory Missing',   color:B.danger,  bg:'#FEF2F2', icon:AlertCircle},
                    {key:'missing_documents',  label:'Documents Missing',   color:B.blue,    bg:'#EFF6FF', icon:FileText},
                    {key:'exit_pending',       label:'Exit Clearance',      color:'#8B5CF6', bg:'#F5F3FF', icon:CheckCircle2},
                  ].filter(g=>parseInt(complianceTotals[g.key]||0)>0).map(g=>{
                    const rows = (compliance[g.key]||[]).slice(0,3);
                    return (
                      <div key={g.key} className="rounded-2xl border overflow-hidden" style={{borderColor:`${g.color}30`}}>
                        <div className="px-4 py-3 flex items-center justify-between border-b" style={{background:`${g.bg}`,borderColor:`${g.color}20`}}>
                          <div className="flex items-center gap-2">
                            <g.icon className="w-4 h-4" style={{color:g.color}}/>
                            <span className="text-xs font-bold" style={{color:g.color}}>{g.label}</span>
                          </div>
                          <span className="text-sm font-black" style={{color:g.color}}>{complianceTotals[g.key]}</span>
                        </div>
                        <div className="divide-y divide-gray-50">
                          {rows.map(r=>(
                            <div key={r.id} onClick={()=>navigate(`/hr-admin/employees/${r.id}`)}
                              className="flex items-center gap-2 px-4 py-2.5 hover:bg-gray-50 cursor-pointer transition-colors">
                              <div className="w-6 h-6 rounded-lg flex-shrink-0 flex items-center justify-center text-white text-[10px] font-black"
                                style={{background:`linear-gradient(135deg,${avatarGrad(r.name)[0]},${avatarGrad(r.name)[1]})`}}>
                                {initials(r.name)}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-bold text-gray-800 truncate">{r.name}</p>
                                <p className="text-[10px] text-gray-400 truncate">{r.employee_code||'—'}</p>
                              </div>
                              <ChevronRight className="w-3 h-3 text-gray-300"/>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </motion.div>
            )}

            {/* ── ERP MODULES STRIP ─────────────────────────────────────── */}
            <motion.div {...fade(0.46)} className="bg-white rounded-2xl p-6 border border-gray-100"
              style={{boxShadow:'0 2px 12px rgba(10,31,92,0.06)'}}>
              <SectionHeader title="Construction ERP Modules"
                sub="Integrated platform — click to navigate" icon={Rocket} iconColor={B.navy}/>
              <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-10 gap-3">
                {[
                  {l:'Project BOQ',    icon:Rocket,       c:B.navy,    bg:'#EFF6FF'},
                  {l:'RA Bills',       icon:FileText,     c:B.blue,    bg:'#EFF6FF'},
                  {l:'Procurement',    icon:ShieldCheck,  c:B.success, bg:'#ECFDF5'},
                  {l:'HR & Payroll',   icon:UserCheck,    c:'#8B5CF6', bg:'#F5F3FF'},
                  {l:'Site Execution', icon:HardHat,      c:'#F97316', bg:'#FFF7ED'},
                  {l:'Asset Mgmt',     icon:Briefcase,    c:'#F59E0B', bg:'#FFFBEB'},
                  {l:'Equipment',      icon:TrendingUp,   c:'#14B8A6', bg:'#F0FDFA'},
                  {l:'Contractor',     icon:CreditCard,   c:B.danger,  bg:'#FEF2F2'},
                  {l:'Tenders',        icon:ClipboardList,c:'#6366F1', bg:'#EEF2FF'},
                  {l:'Documents',      icon:Upload,       c:'#EC4899', bg:'#FDF2F8'},
                ].map(m=>(
                  <div key={m.l}
                    className="flex flex-col items-center gap-2 p-3 rounded-2xl border border-gray-100 hover:border-gray-200 hover:shadow-sm cursor-pointer transition-all text-center"
                    style={{background:'#FAFBFF'}}>
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{background:m.bg}}>
                      <m.icon className="w-4 h-4" style={{color:m.c}}/>
                    </div>
                    <span className="text-[10px] font-bold text-gray-600 leading-tight">{m.l}</span>
                  </div>
                ))}
              </div>
            </motion.div>

          </div>

          {/* ── AI PANEL ─────────────────────────────────────────────────────── */}
          <AnimatePresence>
            {aiOpen && (
              <motion.div
                initial={{opacity:0,x:40}} animate={{opacity:1,x:0}} exit={{opacity:0,x:40}}
                transition={{duration:0.3,ease:[0.16,1,0.3,1]}}
                className="hidden xl:flex xl:flex-col"
                style={{width:340,alignSelf:'flex-start',position:'sticky',top:24}}>
                <div className="flex items-center justify-end mb-3">
                  <button onClick={()=>setAiOpen(false)}
                    className="flex items-center gap-1 text-xs font-semibold text-gray-400 hover:text-gray-600 transition-colors">
                    <X className="w-3.5 h-3.5"/> Hide
                  </button>
                </div>
                <div style={{height:'calc(100vh - 120px)',maxHeight:900}}>
                  <AIAssistantPanel/>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* ── FOOTER ─────────────────────────────────────────────────────────── */}
        <motion.div {...fade(0.5)}
          className="flex items-center justify-between pt-4 border-t border-gray-200">
          <p className="text-xs text-gray-400 font-medium">
            BCIM Engineering Pvt. Ltd. · HRMS v2026 · Integrated Workforce Platform
          </p>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-400"/>
            <p className="text-xs text-gray-400">All systems operational</p>
          </div>
        </motion.div>

      </div>
    </div>
  );
}
