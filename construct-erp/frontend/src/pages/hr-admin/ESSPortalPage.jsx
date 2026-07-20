import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BadgeIndianRupee, Bell, CalendarCheck, CalendarOff, CheckCircle2,
  FileText, FolderUp, Headphones, Monitor, ShieldCheck, UserRound, Printer,
  ChevronLeft, ChevronRight, Upload, Camera, Trash2,
  LayoutDashboard, Clock, Users, Award, BookOpen,
  Radio, Heart, MessageSquare, Send, Wallet, Receipt, Sparkles,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { essAPI, hrAdvancedAPI } from '../../api/client';
import { useNavigate } from 'react-router-dom';

/* â”€â”€â”€ helpers â”€â”€â”€ */
const unwrap = (res) => res?.data?.data || [];
const today  = () => new Date().toISOString().slice(0, 10);

const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];

/* â”€â”€â”€ design tokens — light HR-SaaS palette (Zoho People / GreytHR style),
   matching the ESS login page's blue/teal theme instead of the ERP's navy/gold â”€â”€â”€ */
const ACCENT = '#2F6FED';   // primary accent — buttons, links, positive stats, progress bars
const TEAL   = '#14B8A6';   // secondary accent — used sparingly for variety
const DARK   = '#0F172A';   // dark text/highlight (was solid navy fills)
const BG     = '#F4F6FB';

/* â”€â”€â”€ primitives â”€â”€â”€ */
const inputCls = 'w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-[#2F6FED] focus:ring-2 focus:ring-blue-100 transition';
const labelCls = 'mb-1 block text-xs font-semibold text-gray-600 uppercase tracking-wide';

function Field({ title, children }) {
  return <div><label className={labelCls}>{title}</label>{children}</div>;
}

function Table({ columns, rows, empty = 'No records found' }) {
  return (
    <div className="overflow-auto rounded-lg border border-gray-200">
      <table className="min-w-full divide-y divide-gray-200 text-sm">
        <thead className="bg-slate-50">
          <tr>
            {columns.map((c) => (
              <th key={c.key} className="px-3 py-2.5 text-left text-[11px] font-bold uppercase tracking-wide text-slate-500 whitespace-nowrap">
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 bg-white">
          {!rows.length && (
            <tr><td colSpan={columns.length} className="px-3 py-8 text-center text-sm text-gray-400">{empty}</td></tr>
          )}
          {rows.map((row, idx) => (
            <tr key={row.id || idx} className="hover:bg-gray-50 transition-colors">
              {columns.map((c) => (
                <td key={c.key} className="px-3 py-2.5 text-gray-800">
                  {c.render ? c.render(row) : row[c.key] ?? '-'}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StatusBadge({ value }) {
  const map = {
    paid:        'bg-green-50 text-green-700 border-green-200',
    approved:    'bg-blue-50 text-blue-700 border-blue-200',
    pending:     'bg-amber-50 text-amber-700 border-amber-200',
    draft:       'bg-gray-100 text-gray-600 border-gray-200',
    rejected:    'bg-red-50 text-red-600 border-red-200',
    cancelled:   'bg-gray-100 text-gray-500 border-gray-200',
    open:        'bg-blue-50 text-blue-700 border-blue-200',
    in_progress: 'bg-purple-50 text-purple-700 border-purple-200',
    closed:      'bg-gray-100 text-gray-500 border-gray-200',
  };
  const cls = map[value] || 'bg-gray-100 text-gray-600 border-gray-200';
  return (
    <span className={`inline-block rounded-full border px-2.5 py-0.5 text-[11px] font-semibold capitalize ${cls}`}>
      {(value || '-').replace(/_/g, ' ')}
    </span>
  );
}

function GreenBtn({ children, disabled, onClick, className = '' }) {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:opacity-90 disabled:opacity-50 disabled:hover:opacity-50 ${className}`}
      style={{ backgroundColor: disabled ? '#9ca3af' : ACCENT }}
    >
      {children}
    </button>
  );
}

function SectionCard({ title, subtitle, children, noPad, action }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
      {(title || subtitle) && (
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <div>
            {title && <h3 className="text-sm font-bold text-gray-900">{title}</h3>}
            {subtitle && <p className="mt-0.5 text-xs text-gray-500">{subtitle}</p>}
          </div>
          {action}
        </div>
      )}
      <div className={noPad ? '' : 'p-5'}>{children}</div>
    </div>
  );
}

/* â”€â”€â”€ attendance status â”€â”€â”€ */
const STATUS_STYLE = {
  P:  { bg: 'bg-green-100',  text: 'text-green-700',  label: 'P'  },
  A:  { bg: 'bg-red-100',    text: 'text-red-700',    label: 'A'  },
  L:  { bg: 'bg-blue-100',   text: 'text-blue-700',   label: 'L'  },
  HD: { bg: 'bg-amber-100',  text: 'text-amber-700',  label: 'HD' },
  WO: { bg: 'bg-gray-100',   text: 'text-gray-500',   label: 'WO' },
  H:  { bg: 'bg-purple-100', text: 'text-purple-700', label: 'H'  },
};

function normaliseStatus(raw) {
  if (!raw) return null;
  const u = raw.toUpperCase();
  if (u === 'PRESENT')                   return 'P';
  if (u === 'ABSENT')                    return 'A';
  if (u === 'LEAVE')                     return 'L';
  if (u === 'HALF_DAY' || u === 'HD')    return 'HD';
  if (u === 'WEEK_OFF' || u === 'WO' || u === 'WEEKOFF') return 'WO';
  if (u === 'HOLIDAY'  || u === 'H')     return 'H';
  return u.slice(0, 2);
}

function SwipeDir({ direction }) {
  const isIn  = String(direction||'').toLowerCase().includes('in')  || direction === '0';
  const isOut = String(direction||'').toLowerCase().includes('out') || direction === '1';
  if (isIn)  return <span style={{ display:'inline-block', padding:'1px 8px', borderRadius:20, fontSize:11, fontWeight:700, background:'#dcfce7', color:'#15803d' }}>IN</span>;
  if (isOut) return <span style={{ display:'inline-block', padding:'1px 8px', borderRadius:20, fontSize:11, fontWeight:700, background:'#fee2e2', color:'#b91c1c' }}>OUT</span>;
  return       <span style={{ display:'inline-block', padding:'1px 8px', borderRadius:20, fontSize:11, fontWeight:700, background:'#f1f5f9', color:'#64748b' }}>—</span>;
}

// ESSL stores IST device-local time as if it were UTC — read UTC components
// to recover the actual punch time the device recorded.
function esslTime(ts) {
  if (!ts) return null;
  const d = new Date(ts);
  return { h: d.getUTCHours(), m: d.getUTCMinutes(), s: d.getUTCSeconds(), dateStr: d.toISOString().slice(0, 10) };
}
function fmt12(h, m, s = 0) {
  const period = h >= 12 ? 'pm' : 'am';
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${String(h12).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')} ${period}`;
}
function fmtSwipeTime(ts) {
  if (!ts) return '—';
  const t = esslTime(ts);
  return `${t.dateStr} ${fmt12(t.h, t.m)}`;
}

/* â”€â”€â”€ group swipes by device IST date, sorted chronologically within each day â”€â”€â”€ */
function groupByDate(swipes) {
  const groups = {};
  for (const s of swipes) {
    // ESSL stores IST device-local time as if it were UTC — read UTC date
    // components to recover the actual calendar date the device recorded.
    const dayKey = new Date(s.swipe_time).toISOString().slice(0, 10);
    if (!groups[dayKey]) groups[dayKey] = [];
    groups[dayKey].push(s);
  }
  for (const day of Object.keys(groups)) {
    groups[day].sort((a, b) => new Date(a.swipe_time) - new Date(b.swipe_time));
  }
  return Object.entries(groups).sort((a, b) => b[0].localeCompare(a[0]));
}

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   HORIZONTAL TAB NAV (replaces the standalone sidebar)
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
const TAB_ITEMS = [
  { id: 'dashboard',     label: 'Dashboard',      Icon: LayoutDashboard },
  { id: 'engage',        label: 'Engage',         Icon: Radio           },
  { id: 'profile',       label: 'Profile',        Icon: UserRound       },
  { id: 'attendance',    label: 'My Attendance',  Icon: CalendarCheck   },
  { id: 'leave',         label: 'Leave',          Icon: CalendarOff     },
  { id: 'payslips',      label: 'Payroll',        Icon: BadgeIndianRupee},
  { id: 'reimbursement', label: 'Reimbursements', Icon: Receipt         },
  { id: 'loans',         label: 'Loans & Advances', Icon: Wallet        },
  { id: 'documents',     label: 'My Documents',   Icon: FileText        },
  { id: 'hr-requests',   label: 'My Requests',    Icon: FolderUp        },
  { id: 'manager',       label: 'Manager Desk',   Icon: CheckCircle2    },
  { id: 'timesheet',     label: 'Timesheet',      Icon: Clock           },
  { id: 'training',      label: 'Training',       Icon: Award           },
  { id: 'assets',        label: 'Assets',         Icon: Monitor         },
  { id: 'helpdesk',      label: 'Helpdesk',       Icon: Headphones      },
  { id: 'knowledge',     label: 'Knowledge Base', Icon: BookOpen        },
];

// Mobile-only horizontal tab bar (the desktop nav is ESSSidebar below)
function ESSTabNav({ active, setActive }) {
  return (
    <div className="border-b border-gray-200 bg-white px-4 shrink-0 sm:px-5 lg:hidden">
      <div
        className="flex items-center gap-1 overflow-x-auto py-2.5"
        style={{ scrollbarWidth: 'none' }}
      >
        {TAB_ITEMS.map(({ id, label, Icon }) => {
          const isActive = active === id;
          return (
            <button
              key={id}
              onClick={() => setActive(id)}
              className="flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-semibold transition-all whitespace-nowrap"
              style={{
                color:      isActive ? '#fff' : '#475569',
                background: isActive ? ACCENT : 'transparent',
              }}
            >
              <Icon size={14} className="shrink-0" />
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// Desktop vertical sidebar — the primary ESS Portal navigation for individual
// staff logins (Zoho People / GreytHR style left nav instead of a top bar).
function ESSSidebar({ active, setActive }) {
  return (
    <aside className="hidden lg:flex w-60 shrink-0 flex-col border-r border-gray-100 bg-white">
      <div className="flex items-center gap-2.5 border-b border-gray-100 px-5 py-4">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl" style={{ background: '#EAF1FF' }}>
          <img src="/bcim-logo.png" alt="BCIM" className="h-5 w-5 object-contain" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-gray-900">ESS Portal</p>
          <p className="truncate text-[10px] font-semibold uppercase tracking-wide text-gray-400">Self Service</p>
        </div>
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        {TAB_ITEMS.map(({ id, label, Icon }) => {
          const isActive = active === id;
          return (
            <button
              key={id}
              onClick={() => setActive(id)}
              className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-[13px] font-semibold transition-all"
              style={{
                color:      isActive ? '#fff' : '#475569',
                background: isActive ? ACCENT : 'transparent',
              }}
              onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = '#F4F6FB'; }}
              onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
            >
              <Icon size={16} className="shrink-0" />
              <span className="truncate">{label}</span>
            </button>
          );
        })}
      </nav>
    </aside>
  );
}

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   DASHBOARD TAB
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
const QUOTES = [
  { text: 'The only way to do great work is to love what you do.', author: 'Steve Jobs' },
  { text: 'Success usually comes to those who are too busy to be looking for it.', author: 'Henry David Thoreau' },
  { text: 'The future depends on what you do today.', author: 'Mahatma Gandhi' },
  { text: 'Opportunities don\'t happen. You create them.', author: 'Chris Grosser' },
  { text: 'Don\'t watch the clock; do what it does. Keep going.', author: 'Sam Levenson' },
];

const DAYS_OF_WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function DashboardTab({ summary, balances, serviceRequests, notifications, profile, setActive }) {
  const navigate   = useNavigate();
  const attendance = summary?.attendance || {};
  const payroll    = summary?.payroll    || {};
  const leave      = summary?.leave      || {};
  const now        = new Date();
  const todayStr   = today();
  const quote      = QUOTES[now.getDate() % QUOTES.length];

  /* attendance data for calendar + today's status */
  const attQ = useQuery({
    queryKey: ['ess-attendance-dash'],
    queryFn:  () => essAPI.attendance().then(unwrap),
  });

  /* team-today: on-leave / birthdays (HR-only) + next holiday (everyone) */
  const teamQ = useQuery({
    queryKey: ['ess-team-today'],
    queryFn:  () => essAPI.teamToday().then(r => r.data.data),
  });
  const team          = teamQ.data || {};
  const isHrView      = !!team.is_hr_view;
  const onLeaveToday  = team.on_leave_today || [];
  const birthdaysToday= team.birthdays_today || [];
  const nextHoliday   = team.next_holiday || null;
  const statusMap = useMemo(() => {
    const m = {};
    for (const row of (attQ.data || [])) {
      const d = String(row.attendance_date || '').slice(0, 10);
      if (d) m[d] = { code: normaliseStatus(row.status), inTime: row.in_time };
    }
    return m;
  }, [attQ.data]);

  /* recent leave requests */
  const leavesQ = useQuery({
    queryKey: ['ess-leave-requests-dash'],
    queryFn:  () => essAPI.leaveRequests().then(unwrap),
  });

  /* calendar state */
  const [calYear,  setCalYear]  = useState(now.getFullYear());
  const [calMonth, setCalMonth] = useState(now.getMonth());
  const prevMonth = () => { if (calMonth === 0) { setCalMonth(11); setCalYear(y => y - 1); } else setCalMonth(m => m - 1); };
  const nextMonth = () => { if (calMonth === 11) { setCalMonth(0); setCalYear(y => y + 1); } else setCalMonth(m => m + 1); };
  const firstDay    = new Date(calYear, calMonth, 1).getDay();
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  const fmtCell = (d) => `${calYear}-${String(calMonth + 1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;

  /* derived values */
  const todayRec     = statusMap[todayStr];
  const todayInTime  = todayRec?.inTime ? String(todayRec.inTime).slice(0, 5) : null;
  const totalBalance = (balances || []).reduce((s, b) => s + Number(b.closing_balance ?? 0), 0);
  const casualBal    = (balances || []).find(b => /casual/i.test(b.leave_type_name))?.closing_balance ?? 0;
  const earnedBal    = (balances || []).find(b => /earned|privilege/i.test(b.leave_type_name))?.closing_balance ?? 0;
  const pendingLeave = leave.pending ?? 0;
  const pendingCorr  = attendance.pending_corrections ?? 0;
  const pendingTotal = pendingLeave + pendingCorr;
  const workDays     = (attendance.present||0) + (attendance.absent||0) + (attendance.half_day||0) + (attendance.on_leave||0);
  const presentDays  = attendance.present || 0;
  const attPct       = workDays > 0 ? Math.round((presentDays / workDays) * 100) : 0;
  const announcements = (notifications || []).slice(0, 6);

  const todayStatusColor = { P: ACCENT, A: '#ef4444', L: '#8b5cf6', H: '#3b82f6', HD: '#f59e0b' };
  const todayStatusLabel = { P: 'Present', A: 'Absent', L: 'On Leave', H: 'Holiday', HD: 'Half Day' };

  const calDotColor = (code) => ({ P: ACCENT, A: '#ef4444', HD: '#f59e0b', L: '#8b5cf6', H: '#3b82f6', WO: '#d1d5db' }[code] || null);

  const quickActions = [
    { label: 'Apply Leave',        Icon: CalendarOff,      tab: 'leave',       bg: '#EAF1FF', fg: '#2F6FED' },
    { label: 'Attendance Reg.',    Icon: CalendarCheck,    tab: 'attendance',  bg: '#E3F5F1', fg: '#0D9488' },
    { label: 'View Payslip',       Icon: BadgeIndianRupee, tab: 'payslips',    bg: '#FEF3D6', fg: '#B45309' },
    { label: 'View Attendance',    Icon: CheckCircle2,     tab: 'attendance',  bg: '#EAF1FF', fg: '#2F6FED' },
    { label: 'My Documents',       Icon: FileText,         tab: 'documents',   bg: '#F3E8FF', fg: '#7C3AED' },
    { label: 'Company Directory',  Icon: Users,            tab: null,          bg: '#FCE7F3', fg: '#DB2777' },
    { label: 'Raise Request',      Icon: FolderUp,         tab: 'hr-requests', bg: '#FFE4E0', fg: '#DC2626' },
    { label: 'Helpdesk',           Icon: Headphones,       tab: 'hr-requests', bg: '#E3F5F1', fg: '#0D9488' },
  ];

  const initials = (profile?.name || 'E').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
  const hour = now.getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  // Glass card base style
  const GC = { background:'rgba(255,255,255,0.88)', border:'1px solid rgba(255,255,255,0.95)', borderRadius:16, boxShadow:'0 2px 16px rgba(0,0,0,.055),0 1px 3px rgba(0,0,0,.04)' };
  const ST = { fontSize:10.5, color:'#94A3B8', textTransform:'uppercase', letterSpacing:'0.1em', fontWeight:600, marginBottom:10, display:'block' };
  const dotColorMap  = { P:'#10B981', A:'#EF4444', L:'#8B5CF6', H:'#6366F1', HD:'#F59E0B', WO:'rgba(0,0,0,0.06)' };
  const dotBorderMap = { P:'rgba(16,185,129,.35)', A:'rgba(239,68,68,.3)', L:'rgba(139,92,246,.3)', H:'rgba(99,102,241,.25)', HD:'rgba(245,158,11,.3)', WO:'rgba(0,0,0,0.08)' };

  // Current week Monâ€“Sat
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const weekDays = useMemo(() => {
    const mon = new Date(now);
    const dow = now.getDay();
    mon.setDate(now.getDate() - (dow === 0 ? 6 : dow - 1));
    return ['Mon','Tue','Wed','Thu','Fri','Sat'].map((name, i) => {
      const d = new Date(mon); d.setDate(mon.getDate() + i);
      const ds = d.toISOString().slice(0, 10);
      return { name, ds, isToday: ds === todayStr, isWknd: i >= 5, rec: statusMap[ds] };
    });
  }, [statusMap, todayStr]);

  // Monthly dot grid
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const monthlyDots = useMemo(() => {
    const yr = now.getFullYear(), mo = now.getMonth();
    const dim = new Date(yr, mo + 1, 0).getDate();
    const result = [];
    for (let d = 1; d <= dim; d++) {
      const ds = `${yr}-${String(mo+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      const wday = new Date(ds).getDay();
      result.push({ d, ds, code: statusMap[ds]?.code, isWknd: wday===0||wday===6, isToday: ds===todayStr });
    }
    return result;
  }, [statusMap, todayStr]);

  const statCards = [
    {
      label: 'Today\'s Attendance', bg: '#EAF1FF', fg: '#2F6FED', Icon: CalendarCheck,
      body: todayRec?.code
        ? <p style={{ fontSize:20, fontWeight:700, color: todayStatusColor[todayRec.code]||'#374151', lineHeight:1 }}>{todayInTime||todayStatusLabel[todayRec.code]||todayRec.code}</p>
        : <span style={{ display:'inline-block', background:'#F1F5F9', color:'#64748B', fontSize:11, fontWeight:700, padding:'3px 10px', borderRadius:20 }}>Not Marked</span>,
      sub: todayRec?.code ? (todayStatusLabel[todayRec.code]||todayRec.code) : (profile?.work_location||''),
      cta: { label: 'View Attendance', onClick: () => setActive('attendance') },
    },
    {
      label: 'Leave Balance', bg: '#E3F5F1', fg: '#0D9488', Icon: CalendarOff,
      body: <p style={{ fontSize:24, fontWeight:700, color:'#0F172A', lineHeight:1 }}>{Number(totalBalance).toFixed(1)}</p>,
      sub: [casualBal>0&&`Casual ${Number(casualBal).toFixed(1)}`, earnedBal>0&&`Earned ${Number(earnedBal).toFixed(1)}`].filter(Boolean).join(' · ') || 'days available',
      cta: { label: 'View Leave', onClick: () => setActive('leave') },
    },
    {
      label: 'Latest Payslip', bg: '#FEF3D6', fg: '#B45309', Icon: BadgeIndianRupee,
      body: payroll?.month
        ? <p style={{ fontSize:20, fontWeight:700, color:'#0F172A', lineHeight:1 }}>₹{Number(payroll.net_pay||0).toLocaleString('en-IN')}</p>
        : <p style={{ fontSize:12, color:'#94A3B8', marginTop:4 }}>No payslip yet</p>,
      sub: payroll?.month ? `${MONTH_NAMES[(payroll.month||1)-1]} ${payroll.year} · Net pay` : 'Not processed',
      cta: payroll?.month ? { label: 'View Payslip', onClick: () => payroll.id && navigate(`/hr-admin/payroll/${payroll.id}/payslip`) } : null,
    },
    {
      label: 'My Requests', bg: '#FCE7F3', fg: '#DB2777', Icon: FolderUp,
      body: <p style={{ fontSize:24, fontWeight:700, color:'#0F172A', lineHeight:1 }}>{pendingTotal}</p>,
      sub: `Leave ${pendingLeave} · Reg. ${pendingCorr} pending`,
      cta: { label: 'View Requests', onClick: () => setActive('hr-requests') },
    },
  ];

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:12 }}>

      {/* â”€â”€ Row 1: Hero + Leave Donut â”€â”€ */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 220px', gap:12 }}>

        {/* Hero */}
        <div style={{ ...GC, padding:'20px 26px', display:'flex', justifyContent:'space-between', alignItems:'center', gap:16,
          borderTop:'2px solid transparent',
          backgroundImage:'linear-gradient(white,white),linear-gradient(90deg,#4F46E5,#06B6D4)',
          backgroundOrigin:'border-box', backgroundClip:'padding-box,border-box' }}>
          <div style={{ display:'flex', alignItems:'center', gap:14 }}>
            {profile?.profile_photo_url
              ? <img src={profile.profile_photo_url} alt={profile?.name||''} style={{ width:50,height:50,borderRadius:'50%',objectFit:'cover',boxShadow:'0 0 0 3px rgba(79,70,229,.15)',flexShrink:0 }} />
              : <div style={{ width:50,height:50,borderRadius:'50%',background:'linear-gradient(135deg,#4F46E5,#06B6D4)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:19,fontWeight:700,color:'#fff',boxShadow:'0 0 0 3px rgba(79,70,229,.15),0 4px 14px rgba(79,70,229,.2)',flexShrink:0 }}>{initials}</div>
            }
            <div>
              <div style={{ fontSize:10.5,color:'#94A3B8',letterSpacing:'0.08em',textTransform:'uppercase',marginBottom:2 }}>{greeting}</div>
              <div style={{ fontSize:20,fontWeight:600,letterSpacing:'-0.02em',color:'#0F172A' }}>{profile?.name?.split(' ')[0]||'Employee'} </div>
              <div style={{ fontSize:11.5,color:'#94A3B8',marginTop:3,display:'flex',alignItems:'center',gap:5 }}>
                <div style={{ width:6,height:6,borderRadius:'50%',background:'#10B981',flexShrink:0 }} />
                {profile?.work_location||'Head Office'} · {now.toLocaleDateString('en-IN',{weekday:'short',day:'2-digit',month:'short'})}
              </div>
            </div>
          </div>

          {/* Week strip */}
          <div style={{ display:'flex', alignItems:'center', gap:6 }}>
            {weekDays.map(({ name, ds, isToday, isWknd, rec }) => {
              const code = rec?.code;
              const inTime = rec?.inTime ? String(rec.inTime).slice(0,5) : null;
              const boxBg  = code ? `${dotColorMap[code]}18` : isToday ? 'rgba(245,158,11,0.1)' : 'rgba(0,0,0,0.03)';
              const boxBdr = code ? `1px solid ${dotBorderMap[code]}` : isToday ? '1px solid rgba(245,158,11,0.3)' : '1px solid rgba(0,0,0,0.07)';
              const boxClr = code ? dotColorMap[code] : isToday ? '#D97706' : '#CBD5E1';
              const label  = code==='P'?'✓':code==='A'?'✗':code==='H'?'H':code==='L'?'L':code==='HD'?'½':isToday?'—':'';
              return (
                <div key={ds} style={{ display:'flex',flexDirection:'column',alignItems:'center',gap:4 }}>
                  <div style={{ fontSize:8.5,color:'#94A3B8',textTransform:'uppercase',letterSpacing:'0.05em' }}>{name}</div>
                  <div style={{ width:34,height:34,borderRadius:9,display:'flex',alignItems:'center',justifyContent:'center',fontSize:12,fontWeight:600,background:boxBg,border:boxBdr,color:boxClr }}>{label}</div>
                  <div style={{ fontSize:8.5,color:code==='P'?'#10B981':isToday?'#F59E0B':'#CBD5E1' }}>{inTime||(isToday?'Today':isWknd?'Off':'—')}</div>
                </div>
              );
            })}
          </div>

          {/* CTA */}
          <div style={{ display:'flex',flexDirection:'column',alignItems:'flex-end',gap:8,flexShrink:0 }}>
            {!todayRec?.code && <div style={{ background:'rgba(245,158,11,0.1)',border:'1px solid rgba(245,158,11,0.2)',color:'#B45309',fontSize:11,padding:'4px 11px',borderRadius:20 }}>⚠ Not marked today</div>}
            <button onClick={() => setActive('attendance')} style={{ background:'linear-gradient(135deg,#4F46E5,#06B6D4)',color:'#fff',fontSize:12.5,fontWeight:700,padding:'9px 18px',borderRadius:9,border:'none',cursor:'pointer',boxShadow:'0 4px 14px rgba(79,70,229,.3)',whiteSpace:'nowrap' }}>
              {todayRec?.code ? `Marked · ${todayInTime||todayStatusLabel[todayRec.code]||''} ↗` : 'Mark Attendance →'}
            </button>
          </div>
        </div>

        {/* Leave Donut */}
        <div style={{ ...GC, padding:'18px 16px', display:'flex', flexDirection:'column', gap:14 }}>
          <span style={ST}>Leave Balance</span>
          <div style={{ display:'flex',flexDirection:'column',alignItems:'center',position:'relative' }}>
            <svg width="120" height="120" viewBox="0 0 120 120">
              <defs>
                <linearGradient id="lgd" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#4F46E5"/><stop offset="100%" stopColor="#06B6D4"/>
                </linearGradient>
              </defs>
              <circle cx="60" cy="60" r="46" fill="none" stroke="rgba(0,0,0,0.07)" strokeWidth="10"/>
              <circle cx="60" cy="60" r="46" fill="none" stroke="url(#lgd)" strokeWidth="10"
                strokeDasharray={2*Math.PI*46}
                strokeDashoffset={2*Math.PI*46*(1-Math.min(1,totalBalance/25))}
                strokeLinecap="round" transform="rotate(-90 60 60)"/>
            </svg>
            <div style={{ position:'absolute',top:'50%',left:'50%',transform:'translate(-50%,-50%)',textAlign:'center' }}>
              <div style={{ fontSize:24,fontWeight:700,letterSpacing:'-0.03em',color:'#0F172A' }}>{Number(totalBalance).toFixed(1)}</div>
              <div style={{ fontSize:9.5,color:'#94A3B8' }}>of 25 days</div>
            </div>
          </div>
          <div style={{ display:'flex',flexDirection:'column',gap:7 }}>
            {[casualBal>0&&['#4F46E5','Casual',casualBal],earnedBal>0&&['#06B6D4','Earned',earnedBal]].filter(Boolean).map(([clr,lbl,val]) => (
              <div key={lbl} style={{ display:'flex',justifyContent:'space-between',alignItems:'center',fontSize:12 }}>
                <div style={{ color:'#64748B',display:'flex',alignItems:'center',gap:6 }}><div style={{ width:7,height:7,borderRadius:'50%',background:clr }} />{lbl}</div>
                <div style={{ fontWeight:600,color:'#0F172A' }}>{Number(val).toFixed(1)}</div>
              </div>
            ))}
          </div>
          <button onClick={() => setActive('leave')} style={{ fontSize:11.5,fontWeight:600,color:ACCENT,background:'none',border:'none',cursor:'pointer',textAlign:'left',padding:0 }}>View Leave Balance →</button>
        </div>
      </div>

      {/* â”€â”€ Row 2: 4 Stat cards â”€â”€ */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12 }}>
        {statCards.map((c) => (
          <div key={c.label} style={{ ...GC, padding:'16px 18px', display:'flex', alignItems:'center', gap:13 }}>
            <div style={{ width:42,height:42,borderRadius:11,background:c.bg,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,border:`1px solid ${c.fg}28` }}>
              <c.Icon size={18} style={{ color:c.fg }} />
            </div>
            <div style={{ minWidth:0 }}>
              {c.body}
              <div style={{ fontSize:11,color:'#64748B',marginTop:3 }}>{c.label}</div>
              {c.sub && <div style={{ fontSize:10.5,color:'#94A3B8',marginTop:1,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis' }}>{c.sub}</div>}
              {c.cta && <button onClick={c.cta.onClick} style={{ fontSize:10.5,fontWeight:600,color:ACCENT,background:'none',border:'none',cursor:'pointer',marginTop:4,padding:0 }}>{c.cta.label} →</button>}
            </div>
          </div>
        ))}
      </div>

      {/* â”€â”€ Row 3: Monthly dots | Recent Leave | Quick Actions + Pending â”€â”€ */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:12 }}>

        {/* Monthly attendance dot grid */}
        <div style={{ ...GC, padding:'18px 20px' }}>
          <span style={ST}>{MONTH_NAMES[now.getMonth()]} {now.getFullYear()} — Attendance</span>
          <div style={{ display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:6,marginBottom:12 }}>
            {[
              { label:'Present', val:attendance.present??0,   color:'#059669' },
              { label:'Absent',  val:attendance.absent??0,    color:'#DC2626' },
              { label:'Half Day',val:attendance.half_day??0,  color:'#D97706' },
              { label:'Holiday', val:(attQ.data||[]).filter(r=>normaliseStatus(r.status)==='H').length, color:'#4F46E5' },
            ].map(({ label,val,color }) => (
              <div key={label} style={{ textAlign:'center',padding:'8px 4px',background:'rgba(0,0,0,0.03)',borderRadius:9,border:'1px solid rgba(0,0,0,0.06)' }}>
                <div style={{ fontSize:16,fontWeight:700,color,lineHeight:1 }}>{val}</div>
                <div style={{ fontSize:9,color:'#94A3B8',marginTop:2 }}>{label}</div>
              </div>
            ))}
          </div>
          <div style={{ display:'grid',gridTemplateColumns:'repeat(11,1fr)',gap:4,marginBottom:10 }}>
            {monthlyDots.map(({ ds,code,isWknd,isToday }) => {
              const bg  = code ? `${dotColorMap[code]}22` : 'rgba(0,0,0,0.04)';
              const bdr = code ? `1px solid ${dotBorderMap[code]}` : '1px solid rgba(0,0,0,0.07)';
              return <div key={ds} title={`${ds}: ${code||(isWknd?'WO':'—')}`} style={{ aspectRatio:'1',borderRadius:4,background:bg,border:bdr,outline:isToday?`2px solid ${ACCENT}`:undefined,outlineOffset:isToday?1:undefined }} />;
            })}
          </div>
          <div style={{ display:'flex',gap:10,flexWrap:'wrap' }}>
            {[['Present','#10B981'],['Absent','#EF4444'],['Leave','#8B5CF6'],['Holiday','#6366F1'],['Half Day','#F59E0B']].map(([l,c]) => (
              <div key={l} style={{ display:'flex',alignItems:'center',gap:4,fontSize:10,color:'#64748B' }}>
                <div style={{ width:8,height:8,borderRadius:3,background:c }} />{l}
              </div>
            ))}
          </div>
        </div>

        {/* Recent Requests */}
        <div style={{ ...GC, padding:'18px 20px' }}>
          <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12 }}>
            <span style={{ ...ST, marginBottom:0 }}>Recent Leave Requests</span>
            <button onClick={() => setActive('leave')} style={{ fontSize:10.5,fontWeight:600,color:ACCENT,background:'none',border:'none',cursor:'pointer' }}>View All →</button>
          </div>
          <div style={{ display:'flex',flexDirection:'column',gap:6 }}>
            {(leavesQ.data||[]).slice(0,4).length ? (leavesQ.data||[]).slice(0,4).map((r,i) => (
              <div key={r.id||i} style={{ display:'flex',alignItems:'center',gap:10,padding:'9px 11px',background:'rgba(0,0,0,0.025)',border:'1px solid rgba(0,0,0,0.06)',borderRadius:10 }}>
                <div style={{ width:30,height:30,borderRadius:8,background:'#EAF1FF',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0 }}>
                  <CalendarOff size={13} style={{ color:ACCENT }} />
                </div>
                <div style={{ flex:1,minWidth:0 }}>
                  <div style={{ fontSize:12,fontWeight:500,color:'#1E293B',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis' }}>{r.leave_type_name||'Leave'}</div>
                  <div style={{ fontSize:10.5,color:'#94A3B8',marginTop:1 }}>{String(r.from_date||'').slice(0,10)} → {String(r.to_date||'').slice(0,10)}</div>
                </div>
                <StatusBadge value={r.status} />
              </div>
            )) : (
              <div style={{ textAlign:'center',padding:'20px 0',color:'#94A3B8',fontSize:12 }}>No leave requests</div>
            )}
          </div>
          {(serviceRequests||[]).slice(0,2).map((r,i) => (
            <div key={r.id||i} style={{ display:'flex',alignItems:'center',gap:10,padding:'9px 11px',background:'rgba(0,0,0,0.025)',border:'1px solid rgba(0,0,0,0.06)',borderRadius:10,marginTop:6 }}>
              <div style={{ width:30,height:30,borderRadius:8,background:'#F3E8FF',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0 }}>
                <FolderUp size={13} style={{ color:'#7C3AED' }} />
              </div>
              <div style={{ flex:1,minWidth:0 }}>
                <div style={{ fontSize:12,fontWeight:500,color:'#1E293B',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis' }}>{r.subject||r.request_type||'Request'}</div>
                <div style={{ fontSize:10.5,color:'#94A3B8',marginTop:1 }}>{r.request_type||''}</div>
              </div>
              <StatusBadge value={r.status} />
            </div>
          ))}
        </div>

        {/* Quick Actions + Pending Actions */}
        <div style={{ ...GC, padding:'18px 20px', display:'flex', flexDirection:'column', gap:14 }}>
          <span style={ST}>Quick Actions</span>
          <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:6 }}>
            {quickActions.slice(0,6).map(({ label,Icon,tab,bg,fg }) => (
              <button key={label} onClick={() => tab && setActive(tab)}
                style={{ display:'flex',alignItems:'center',gap:8,padding:'9px 10px',background:'rgba(0,0,0,0.03)',border:'1px solid rgba(0,0,0,0.06)',borderRadius:10,cursor:'pointer',textAlign:'left' }}>
                <div style={{ width:26,height:26,borderRadius:7,background:bg,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0 }}>
                  <Icon size={13} style={{ color:fg }} />
                </div>
                <span style={{ fontSize:11.5,color:'#334155',lineHeight:1.2 }}>{label}</span>
              </button>
            ))}
          </div>
          <div style={{ borderTop:'1px solid rgba(0,0,0,0.06)',paddingTop:12 }}>
            <span style={{ ...ST, marginBottom:8 }}>Pending Actions</span>
            <div style={{ display:'flex',flexDirection:'column',gap:6 }}>
              {!todayRec?.code && (
                <div style={{ display:'flex',alignItems:'center',gap:9,padding:'9px 12px',borderRadius:10,border:'1px solid rgba(245,158,11,0.2)',background:'rgba(245,158,11,0.05)' }}>
                  <span>⚠ï¸</span>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:11.5,fontWeight:500,color:'#1E293B' }}>Mark today's attendance</div>
                    <div style={{ fontSize:10,color:'#94A3B8',marginTop:1 }}>Not yet checked in</div>
                  </div>
                  <button onClick={() => setActive('attendance')} style={{ fontSize:10.5,fontWeight:600,color:'#D97706',background:'none',border:'none',cursor:'pointer' }}>Mark →</button>
                </div>
              )}
              {pendingCorr > 0 && (
                <div style={{ display:'flex',alignItems:'center',gap:9,padding:'9px 12px',borderRadius:10,border:`1px solid ${ACCENT}22`,background:`${ACCENT}08` }}>
                  <span>ðŸ“</span>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:11.5,fontWeight:500,color:'#1E293B' }}>{pendingCorr} regularization{pendingCorr>1?'s':''} pending</div>
                    <div style={{ fontSize:10,color:'#94A3B8',marginTop:1 }}>Awaiting approval</div>
                  </div>
                  <button onClick={() => setActive('attendance')} style={{ fontSize:10.5,fontWeight:600,color:ACCENT,background:'none',border:'none',cursor:'pointer' }}>View →</button>
                </div>
              )}
              {pendingLeave > 0 && (
                <div style={{ display:'flex',alignItems:'center',gap:9,padding:'9px 12px',borderRadius:10,border:'1px solid rgba(139,92,246,0.2)',background:'rgba(139,92,246,0.05)' }}>
                  <span>ðŸ–</span>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:11.5,fontWeight:500,color:'#1E293B' }}>{pendingLeave} leave request{pendingLeave>1?'s':''} pending</div>
                    <div style={{ fontSize:10,color:'#94A3B8',marginTop:1 }}>Awaiting manager approval</div>
                  </div>
                  <button onClick={() => setActive('leave')} style={{ fontSize:10.5,fontWeight:600,color:'#7C3AED',background:'none',border:'none',cursor:'pointer' }}>View →</button>
                </div>
              )}
              {todayRec?.code && pendingCorr===0 && pendingLeave===0 && (
                <div style={{ textAlign:'center',padding:'12px 0',color:'#94A3B8',fontSize:11.5 }}>All clear — no pending actions ✓</div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* â”€â”€ Row 4: Calendar | Announcements | Team + Holiday â”€â”€ */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:12 }}>

        {/* Calendar */}
        <div style={{ ...GC, padding:'18px 20px' }}>
          <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14 }}>
            <div>
              <div style={{ fontSize:13.5,fontWeight:600,color:'#0F172A' }}>My Calendar</div>
              <div style={{ fontSize:10.5,color:'#94A3B8',marginTop:1 }}>{MONTH_NAMES[calMonth]} {calYear}</div>
            </div>
            <div style={{ display:'flex',gap:4,alignItems:'center' }}>
              <button onClick={prevMonth} style={{ width:26,height:26,borderRadius:7,background:'#fff',border:'1px solid rgba(0,0,0,0.09)',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center' }}><ChevronLeft size={13} /></button>
              <button onClick={nextMonth} style={{ width:26,height:26,borderRadius:7,background:'#fff',border:'1px solid rgba(0,0,0,0.09)',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center' }}><ChevronRight size={13} /></button>
              <button onClick={() => { setCalMonth(now.getMonth()); setCalYear(now.getFullYear()); }} style={{ fontSize:10.5,fontWeight:600,color:ACCENT,background:'none',border:'none',cursor:'pointer' }}>Today</button>
            </div>
          </div>
          <div style={{ display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:2,marginBottom:4 }}>
            {DAYS_OF_WEEK.map(d => <div key={d} style={{ fontSize:9.5,color:'#94A3B8',textAlign:'center',padding:'3px 0',fontWeight:600,textTransform:'uppercase' }}>{d}</div>)}
          </div>
          <div style={{ display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:2 }}>
            {cells.map((day,idx) => {
              if (!day) return <div key={`e-${idx}`} />;
              const ds = fmtCell(day);
              const rec = statusMap[ds];
              const code = rec?.code;
              const isToday = ds === todayStr;
              const isWknd = new Date(ds).getDay()===0||new Date(ds).getDay()===6;
              const dotColor = code ? calDotColor(code) : (isWknd ? '#d1d5db' : null);
              return (
                <div key={day} style={{ display:'flex',flexDirection:'column',alignItems:'center',padding:'3px 2px' }}>
                  <div style={{ width:24,height:24,borderRadius:7,display:'flex',alignItems:'center',justifyContent:'center',fontSize:11.5,fontWeight:isToday?700:400,background:isToday?`linear-gradient(135deg,${ACCENT},#06B6D4)`:'transparent',color:isToday?'#fff':isWknd?'#9ca3af':'#475569',boxShadow:isToday?`0 3px 10px ${ACCENT}50`:undefined }}>
                    {day}
                  </div>
                  {dotColor && <div style={{ width:3,height:3,borderRadius:'50%',background:dotColor,marginTop:2 }} />}
                </div>
              );
            })}
          </div>
          <div style={{ marginTop:10,display:'flex',flexWrap:'wrap',gap:'8px 12px' }}>
            {[['Present',ACCENT],['Leave','#8b5cf6'],['Holiday','#22c55e'],['Weekend','#d1d5db']].map(([l,c]) => (
              <div key={l} style={{ display:'flex',alignItems:'center',gap:4,fontSize:10,color:'#64748B' }}>
                <div style={{ width:6,height:6,borderRadius:'50%',background:c }} />{l}
              </div>
            ))}
          </div>
        </div>

        {/* Announcements */}
        <div style={{ ...GC, padding:'18px 20px', display:'flex', flexDirection:'column' }}>
          <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12 }}>
            <span style={{ ...ST,marginBottom:0 }}>Announcements</span>
            <button style={{ fontSize:10.5,fontWeight:600,color:ACCENT,background:'none',border:'none',cursor:'pointer' }}>View All</button>
          </div>
          <div style={{ flex:1,display:'flex',flexDirection:'column',gap:0,overflowY:'auto' }}>
            {announcements.length ? announcements.map((n,i) => (
              <div key={n.id||i} style={{ display:'flex',alignItems:'flex-start',gap:9,paddingBottom:10,marginBottom:10,borderBottom:i<announcements.length-1?'1px solid rgba(0,0,0,0.05)':undefined }}>
                <div style={{ width:30,height:30,borderRadius:8,background:'#FEF3D6',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0 }}>
                  <Bell size={13} style={{ color:'#B45309' }} />
                </div>
                <div style={{ flex:1,minWidth:0 }}>
                  <div style={{ fontSize:12,fontWeight:500,color:'#1E293B' }}>{n.title||(n.message||'').slice(0,40)||'Notification'}</div>
                  <div style={{ fontSize:10.5,color:'#94A3B8',marginTop:2,overflow:'hidden',display:'-webkit-box',WebkitLineClamp:2,WebkitBoxOrient:'vertical' }}>{n.message}</div>
                  <div style={{ fontSize:10,color:'#CBD5E1',marginTop:3 }}>{n.created_at?new Date(n.created_at).toLocaleDateString('en-IN',{day:'2-digit',month:'short'}):''}</div>
                </div>
              </div>
            )) : (
              <div style={{ flex:1,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:8,padding:'24px 0',color:'#94A3B8' }}>
                <Bell size={24} style={{ color:'#D1D5DB' }} />
                <div style={{ fontSize:12 }}>No announcements</div>
              </div>
            )}
          </div>
        </div>

        {/* Holiday + Team */}
        <div style={{ ...GC, padding:'18px 20px', display:'flex', flexDirection:'column', gap:14 }}>
          {/* Next holiday */}
          <div style={{ padding:'14px 16px',borderRadius:12,background:'#FAEEDA',border:'1px solid #FAC775' }}>
            <div style={{ fontSize:10,fontWeight:700,textTransform:'uppercase',letterSpacing:'0.08em',color:'#854F0B',marginBottom:6 }}>Upcoming Holiday</div>
            {nextHoliday ? (
              <>
                <div style={{ fontSize:14,fontWeight:700,color:'#663905' }}>{nextHoliday.name}</div>
                <div style={{ fontSize:11,color:'#854F0B',marginTop:3 }}>{new Date(nextHoliday.holiday_date).toLocaleDateString('en-IN',{weekday:'long',day:'2-digit',month:'long'})}</div>
              </>
            ) : <div style={{ fontSize:12,color:'#B45309' }}>No upcoming holidays</div>}
          </div>

          {birthdaysToday.length > 0 && (
            <div>
              <span style={ST}>Birthdays Today ðŸŽ‚</span>
              {birthdaysToday.slice(0,3).map((p,i) => (
                <div key={i} style={{ display:'flex',alignItems:'center',gap:9,padding:'7px 0',borderBottom:i<birthdaysToday.length-1?'1px solid rgba(0,0,0,0.05)':undefined }}>
                  <div style={{ width:30,height:30,borderRadius:'50%',background:`linear-gradient(135deg,${ACCENT},${TEAL})`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,fontWeight:700,color:'#fff',flexShrink:0 }}>
                    {(p.name||'?').split(' ').map(w=>w[0]).slice(0,2).join('').toUpperCase()}
                  </div>
                  <span style={{ fontSize:12.5,color:'#1E293B' }}>{p.name}</span>
                </div>
              ))}
            </div>
          )}

          {isHrView && onLeaveToday.length > 0 && (
            <div>
              <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8 }}>
                <span style={{ ...ST,marginBottom:0 }}>On Leave Today</span>
                <span style={{ background:'#EAF1FF',color:ACCENT,fontSize:10,padding:'1px 7px',borderRadius:10,fontWeight:700 }}>{onLeaveToday.length}</span>
              </div>
              {onLeaveToday.slice(0,4).map((p,i) => (
                <div key={i} style={{ display:'flex',alignItems:'center',gap:9,padding:'6px 0',borderBottom:i<Math.min(3,onLeaveToday.length-1)?'1px solid rgba(0,0,0,0.05)':undefined }}>
                  <div style={{ width:28,height:28,borderRadius:'50%',background:`linear-gradient(135deg,${ACCENT},${TEAL})`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:10,fontWeight:700,color:'#fff',flexShrink:0 }}>
                    {(p.name||'?').split(' ').map(w=>w[0]).slice(0,2).join('').toUpperCase()}
                  </div>
                  <span style={{ fontSize:12,color:'#1E293B',flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>{p.name}</span>
                  <span style={{ fontSize:10.5,color:'#94A3B8',flexShrink:0 }}>{p.leave_type||'Leave'}</span>
                </div>
              ))}
            </div>
          )}

          <div style={{ borderTop:'1px solid rgba(0,0,0,0.06)',paddingTop:12 }}>
            <span style={ST}>Month Summary</span>
            <div style={{ display:'flex',gap:6 }}>
              {[
                { label:'Working',val:attendance.working_days??'—',color:'#64748B' },
                { label:'Present', val:attendance.present??0,     color:'#059669' },
                { label:'Absent',  val:attendance.absent??0,      color:'#DC2626' },
              ].map(({ label,val,color }) => (
                <div key={label} style={{ flex:1,textAlign:'center',padding:'8px 4px',background:'rgba(0,0,0,0.03)',borderRadius:9,border:'1px solid rgba(0,0,0,0.06)' }}>
                  <div style={{ fontSize:16,fontWeight:700,color }}>{val}</div>
                  <div style={{ fontSize:9,color:'#94A3B8',marginTop:2 }}>{label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}

function fileToAvatarDataUri(file, size = 256) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = size; canvas.height = size;
        const ctx = canvas.getContext('2d');
        const min = Math.min(img.width, img.height);
        const sx = (img.width - min) / 2;
        const sy = (img.height - min) / 2;
        ctx.drawImage(img, sx, sy, min, min, 0, 0, size, size);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.onerror = reject;
      img.src = reader.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function ProfilePhotoAvatar({ profile, size = 80, editable = false }) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const name     = profile?.name || 'Employee';
  const initials = name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
  const photo    = profile?.profile_photo_url;

  const refresh = () => qc.invalidateQueries({ queryKey: ['ess-summary'] });

  const onPick = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!/^image\//.test(file.type)) return toast.error('Please choose an image file.');
    setBusy(true);
    try {
      const dataUri = await fileToAvatarDataUri(file);
      await essAPI.uploadProfilePhoto(dataUri);
      toast.success('Profile photo updated');
      refresh();
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not update photo');
    } finally {
      setBusy(false);
    }
  };

  const onRemove = async () => {
    setBusy(true);
    try {
      await essAPI.removeProfilePhoto();
      toast.success('Profile photo removed');
      refresh();
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not remove photo');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ position:'relative', flexShrink:0, width:size, height:size }}>
      {photo ? (
        <img src={photo} alt={name} style={{ width:size, height:size, borderRadius:'50%', objectFit:'cover', boxShadow:'0 0 0 3px #fff,0 2px 8px rgba(0,0,0,0.18)' }} />
      ) : (
        <div style={{ width:size, height:size, borderRadius:'50%', background:`linear-gradient(135deg,${ACCENT},${TEAL})`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:size*0.3, fontWeight:700, color:'#fff', boxShadow:'0 0 0 3px #fff,0 2px 8px rgba(0,0,0,0.18)' }}>
          {initials}
        </div>
      )}
      {editable && (
        <>
          <label style={{ position:'absolute', bottom:-4, right:-4, width:30, height:30, borderRadius:'50%', background:'#fff', border:'2px solid #fff', boxShadow:'0 1px 6px rgba(0,0,0,0.18)', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', color:ACCENT }}>
            {busy
              ? <span style={{ width:14, height:14, borderRadius:'50%', border:`2px solid #e5e7eb`, borderTopColor:ACCENT, display:'inline-block' }} />
              : <Camera size={14} />}
            <input type="file" accept="image/*" style={{ display:'none' }} onChange={onPick} disabled={busy} />
          </label>
          {photo && !busy && (
            <button onClick={onRemove} title="Remove photo" style={{ position:'absolute', top:-4, right:-4, width:22, height:22, borderRadius:'50%', background:'#fff', border:'2px solid #fff', boxShadow:'0 1px 6px rgba(0,0,0,0.18)', display:'flex', alignItems:'center', justifyContent:'center', color:'#EF4444', cursor:'pointer' }}>
              <Trash2 size={11} />
            </button>
          )}
        </>
      )}
    </div>
  );
}

function ProfileTab({ profile, balances }) {
  const name = profile?.name || 'Employee';
  const p = profile || {};
  const GCA = { background:'rgba(255,255,255,0.88)', border:'1px solid rgba(255,255,255,0.95)', borderRadius:16, boxShadow:'0 2px 16px rgba(0,0,0,.055),0 1px 3px rgba(0,0,0,.04)' };
  const STA = { fontSize:10.5, color:'#94A3B8', textTransform:'uppercase', letterSpacing:'0.1em', fontWeight:600, marginBottom:8, display:'block' };

  const fmtDate = (d) => d
    ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
    : null;
  const cap = (s) => s ? String(s).replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : null;

  const InfoGrid = ({ fields }) => {
    const rows = fields.filter(([, v]) => v !== null && v !== undefined && v !== '');
    if (!rows.length) return <p style={{ fontSize:13, color:'#94A3B8' }}>Not yet on file. Contact HR to update.</p>;
    return (
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:'14px 24px' }}>
        {rows.map(([lbl, val]) => (
          <div key={lbl}>
            <p style={{ fontSize:10, textTransform:'uppercase', letterSpacing:'0.07em', color:'#94A3B8', fontWeight:600 }}>{lbl}</p>
            <p style={{ marginTop:3, fontSize:13, fontWeight:600, color:'#1E293B', wordBreak:'break-words' }}>{val}</p>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
      {/* Header card */}
      <div style={{ ...GCA, overflow:'hidden' }}>
        <div style={{ height:80, background:`linear-gradient(120deg, ${ACCENT}, ${TEAL})` }} />
        <div style={{ padding:'0 24px 24px' }}>
          <div style={{ marginTop:-40, display:'flex', flexWrap:'wrap', gap:16, alignItems:'flex-end', justifyContent:'space-between' }}>
            <div style={{ display:'flex', alignItems:'flex-end', gap:16 }}>
              <div style={{ background:'#fff', padding:4, borderRadius:'50%', boxShadow:'0 2px 8px rgba(0,0,0,0.14)' }}>
                <ProfilePhotoAvatar profile={profile} size={84} editable />
              </div>
              <div style={{ paddingBottom:4 }}>
                <p style={{ fontSize:20, fontWeight:800, color:'#0F172A', margin:0 }}>{name}</p>
                <p style={{ fontSize:13, color:'#64748B', margin:0 }}>{p.designation_name || cap(p.role) || '—'}</p>
              </div>
            </div>
            <div style={{ display:'flex', flexWrap:'wrap', gap:8, paddingBottom:4 }}>
              {p.employee_code && <span style={{ background:'#EAF1FF', color:ACCENT, borderRadius:99, padding:'3px 12px', fontSize:11, fontWeight:700 }}>{p.employee_code}</span>}
              {p.department_name && <span style={{ background:'#F1F5F9', color:'#475569', borderRadius:99, padding:'3px 12px', fontSize:11, fontWeight:600 }}>{p.department_name}</span>}
              {p.employment_status && <span style={{ background:'#E1F5EE', color:'#0F6E56', borderRadius:99, padding:'3px 12px', fontSize:11, fontWeight:600 }}>{cap(p.employment_status)}</span>}
            </div>
          </div>
        </div>
      </div>

      <div style={{ ...GCA, padding:20 }}>
        <span style={STA}>Personal Information</span>
        <InfoGrid fields={[['Full Name',name],['Date of Birth',fmtDate(p.date_of_birth)],['Gender',cap(p.gender)],['Blood Group',p.blood_group],['Marital Status',cap(p.marital_status)],['Nationality',p.nationality],[`Father's Name`,p.father_name]]} />
      </div>

      <div style={{ ...GCA, padding:20 }}>
        <span style={STA}>Contact Details</span>
        <InfoGrid fields={[['Email',p.email],['Phone',p.phone],['Current Address',p.current_address],['Permanent Address',p.permanent_address],['Emergency Contact',p.emergency_contact_name],['Emergency Phone',p.emergency_contact_phone]]} />
      </div>

      <div style={{ ...GCA, padding:20 }}>
        <span style={STA}>Employment</span>
        <InfoGrid fields={[['Designation',p.designation_name],['Department',p.department_name],['Reporting Manager',p.reporting_manager_name],['Work Location',p.work_location],['Employee Category',cap(p.employee_category)],['Employment Type',cap(p.employment_type)],['Date of Joining',fmtDate(p.date_of_joining)],['Date of Confirmation',fmtDate(p.date_of_confirmation)]]} />
      </div>

      <div style={{ ...GCA, padding:20 }}>
        <span style={STA}>Bank & Statutory</span>
        <p style={{ fontSize:11.5, color:'#64748B', marginBottom:12 }}>Sensitive details are partially masked</p>
        <InfoGrid fields={[['Bank',p.bank_name],['Account No.',p.bank_account_last4?`â€¢â€¢â€¢â€¢ ${p.bank_account_last4}`:null],['IFSC',p.bank_ifsc],['PAN',p.pan_number],['UAN',p.uan_number],['PF Account',p.pf_account_number],['ESI No.',p.esi_number]]} />
      </div>

      {(balances || []).length > 0 && (
        <div style={{ ...GCA, padding:20 }}>
          <span style={STA}>Leave Balances</span>
          <div style={{ display:'flex', flexWrap:'wrap', gap:12 }}>
            {(balances || []).map((b) => {
              const taken = Number(b.taken??0), accrued = Number(b.accrued??0), avail = Number(b.closing_balance??0);
              const pct = accrued > 0 ? Math.min(100, Math.round((taken/accrued)*100)) : 0;
              return (
                <div key={b.leave_type_id} style={{ minWidth:150, background:'rgba(47,111,237,0.04)', border:'1px solid rgba(47,111,237,0.12)', borderRadius:12, padding:16 }}>
                  <p style={{ fontSize:11.5, fontWeight:600, color:'#64748B', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{b.leave_type_name}</p>
                  <p style={{ marginTop:8, fontSize:28, fontWeight:800, color:ACCENT, lineHeight:1 }}>{avail.toFixed(1)}</p>
                  <p style={{ fontSize:10.5, color:'#94A3B8' }}>Available</p>
                  <div style={{ marginTop:8, height:4, background:'rgba(0,0,0,0.06)', borderRadius:99 }}>
                    <div style={{ height:4, borderRadius:99, width:`${pct}%`, background:ACCENT }} />
                  </div>
                  <p style={{ marginTop:4, fontSize:10, color:'#94A3B8' }}>{taken} taken / {accrued} accrued</p>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   ATTENDANCE TAB
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
function AttendanceTab({ leaveTypes }) {
  const qc = useQueryClient();
  const now = new Date();
  const [calYear,  setCalYear]  = useState(now.getFullYear());
  const [calMonth, setCalMonth] = useState(now.getMonth());
  const [swipeDays, setSwipeDays] = useState(14);

  const attendance  = useQuery({ queryKey: ['ess-attendance'],  queryFn: () => essAPI.attendance().then(unwrap) });
  const corrections = useQuery({ queryKey: ['ess-corrections'], queryFn: () => essAPI.attendanceCorrections().then(unwrap) });
  const swipes      = useQuery({ queryKey: ['ess-swipes', swipeDays], queryFn: () => essAPI.swipes({ days: swipeDays }).then(unwrap) });

  const [correction, setCorrection] = useState({
    attendance_date: today(), requested_status: 'present',
    requested_in_time: '09:30', requested_out_time: '18:00', reason: '',
  });

  const refresh = () => ['ess-attendance','ess-corrections','ess-summary','ess-attendance-dash'].forEach(k => qc.invalidateQueries({ queryKey: [k] }));
  const createCorrection = useMutation({
    mutationFn: essAPI.createCorrection,
    onSuccess: () => { toast.success('Correction requested'); setCorrection({ ...correction, reason: '' }); refresh(); },
    onError:   (e) => toast.error(e?.response?.data?.error || 'Failed to submit correction request'),
  });

  const statusMap = useMemo(() => {
    const m = {};
    for (const row of (attendance.data || [])) {
      const d = String(row.attendance_date || '').slice(0, 10);
      if (d) m[d] = { code: normaliseStatus(row.status), leaveType: row.leave_type_name || null, inTime: row.in_time, lateMin: row.late_minutes };
    }
    return m;
  }, [attendance.data]);

  const firstDay    = new Date(calYear, calMonth, 1).getDay();
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const prevMonth = () => { if (calMonth === 0) { setCalMonth(11); setCalYear(y => y-1); } else setCalMonth(m => m-1); };
  const nextMonth = () => { if (calMonth === 11) { setCalMonth(0); setCalYear(y => y+1); } else setCalMonth(m => m+1); };
  const formatDay = (day) => `${calYear}-${String(calMonth+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
  const todayStr  = today();

  const balQ = useQuery({ queryKey: ['ess-leave-balances'], queryFn: () => essAPI.leaveBalances().then(unwrap) });

  const C = {
    P:  { bg:'rgba(16,185,129,.1)', fg:'#059669' },
    A:  { bg:'rgba(239,68,68,.1)',  fg:'#DC2626' },
    L:  { bg:'rgba(139,92,246,.1)',fg:'#7C3AED' },
    HD: { bg:'rgba(245,158,11,.1)', fg:'#B45309' },
    H:  { bg:'rgba(99,102,241,.1)',fg:'#4338CA' },
    WO: { bg:'rgba(0,0,0,.03)',    fg:'#94A3B8' },
  };
  const GCA = { background:'rgba(255,255,255,0.88)', border:'1px solid rgba(255,255,255,0.95)', borderRadius:16, boxShadow:'0 2px 16px rgba(0,0,0,.055),0 1px 3px rgba(0,0,0,.04)' };
  const STA = { fontSize:10.5, color:'#94A3B8', textTransform:'uppercase', letterSpacing:'0.1em', fontWeight:600, marginBottom:8, display:'block' };

  const monthStats = useMemo(() => {
    const prefix = `${calYear}-${String(calMonth+1).padStart(2,'0')}-`;
    let P=0, A=0, HD=0, L=0;
    for (const [ds, rec] of Object.entries(statusMap)) {
      if (!ds.startsWith(prefix)) continue;
      const dow = new Date(ds).getDay();
      if (dow===0||dow===6) continue;
      if (rec.code==='P') P++; else if (rec.code==='A') A++;
      else if (rec.code==='HD') HD++; else if (rec.code==='L') L++;
    }
    const worked = P+A+HD+L;
    return { P, A, HD, L, worked, pct: worked>0 ? Math.round((P/worked)*100) : 0 };
  }, [statusMap, calYear, calMonth]);

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:16 }}>

      {/* Stat chips */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:10 }}>
        {[
          { label:'Present',      val:monthStats.P,      fg:'#059669', border:'#059669', sub:`${monthStats.pct}% attendance` },
          { label:'Absent',       val:monthStats.A,      fg:'#DC2626', border:'#EF4444', sub: monthStats.A>0 ? `${monthStats.A} day${monthStats.A>1?'s':''} this month` : 'None this month' },
          { label:'Half Day',     val:monthStats.HD,     fg:'#B45309', border:'#F59E0B', sub: monthStats.HD>0 ? `${monthStats.HD} day${monthStats.HD>1?'s':''} this month` : 'None this month' },
          { label:'On Leave',     val:monthStats.L,      fg:'#7C3AED', border:'#8B5CF6', sub: monthStats.L>0 ? `${monthStats.L} day${monthStats.L>1?'s':''} this month` : 'None this month' },
          { label:'Working Days', val:monthStats.worked, fg:ACCENT,    border:ACCENT,    sub:`${MONTH_NAMES[calMonth].slice(0,3)} ${calYear}` },
        ].map(({ label, val, fg, border, sub }) => (
          <div key={label} style={{ ...GCA, padding:'14px 16px', borderBottom:`3px solid ${border}` }}>
            <span style={STA}>{label}</span>
            <span style={{ fontSize:22, fontWeight:700, color:fg, lineHeight:1, display:'block' }}>{val}</span>
            <span style={{ fontSize:10.5, color:'#94A3B8', marginTop:4, display:'block' }}>{sub}</span>
          </div>
        ))}
      </div>

      {/* Two-column: Calendar | Side panel */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 300px', gap:16, alignItems:'start' }}>

        {/* Calendar */}
        <div style={{ ...GCA, padding:20 }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14 }}>
            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
              <button onClick={prevMonth} style={{ background:'rgba(0,0,0,0.04)', border:'1px solid rgba(0,0,0,0.07)', borderRadius:8, padding:'4px 8px', cursor:'pointer', display:'flex', alignItems:'center' }}>
                <ChevronLeft size={15} color="#64748B" />
              </button>
              <span style={{ fontSize:15, fontWeight:700, color:'#1E293B', minWidth:140, textAlign:'center' }}>{MONTH_NAMES[calMonth]} {calYear}</span>
              <button onClick={nextMonth} style={{ background:'rgba(0,0,0,0.04)', border:'1px solid rgba(0,0,0,0.07)', borderRadius:8, padding:'4px 8px', cursor:'pointer', display:'flex', alignItems:'center' }}>
                <ChevronRight size={15} color="#64748B" />
              </button>
              <button onClick={() => { setCalMonth(now.getMonth()); setCalYear(now.getFullYear()); }}
                style={{ fontSize:11, fontWeight:600, color:ACCENT, background:'none', border:'none', cursor:'pointer', marginLeft:4 }}>
                Today
              </button>
            </div>
            <div style={{ display:'flex', gap:10 }}>
              {[['P','Present','#10B981'],['A','Absent','#EF4444'],['HD','Half Day','#F59E0B'],['L','Leave','#8B5CF6'],['H','Holiday','#6366F1']].map(([code,name,color]) => (
                <span key={code} style={{ display:'flex', alignItems:'center', gap:3, fontSize:10.5, color:'#94A3B8' }}>
                  <span style={{ width:8, height:8, borderRadius:2, background:color, display:'inline-block' }} />{name}
                </span>
              ))}
            </div>
          </div>

          <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:3, marginBottom:3 }}>
            {DAYS_OF_WEEK.map(d => (
              <div key={d} style={{ textAlign:'center', fontSize:10, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.07em', color:'#94A3B8', padding:'3px 0' }}>{d}</div>
            ))}
          </div>

          <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:3 }}>
            {cells.map((day, idx) => {
              if (!day) return <div key={`e-${idx}`} />;
              const ds      = formatDay(day);
              const rec     = statusMap[ds];
              const code    = rec?.code;
              const isToday = ds === todayStr;
              const isWknd  = new Date(ds).getDay()===0 || new Date(ds).getDay()===6;
              const cs      = isToday ? { bg:ACCENT, fg:'#fff' } :
                              code && C[code] ? { bg:C[code].bg, fg:C[code].fg } :
                              isWknd ? { bg:'rgba(0,0,0,0.03)', fg:'#CBD5E1' } :
                              { bg:'rgba(0,0,0,0.01)', fg:'#94A3B8' };
              return (
                <div key={day}
                  title={rec ? `${code}${rec.inTime ? ' – In: '+String(rec.inTime).slice(0,5) : ''}${rec.lateMin ? ' – Late: '+rec.lateMin+'m' : ''}` : undefined}
                  style={{ borderRadius:8, padding:'5px 5px 6px', minHeight:60, display:'flex', flexDirection:'column', gap:2, background:cs.bg }}
                >
                  <div style={{ display:'flex', alignItems:'center', justifyContent: isToday ? 'space-between' : 'flex-start' }}>
                    <span style={{ fontSize:11, fontWeight:700, color:cs.fg, lineHeight:1 }}>{day}</span>
                    {isToday && <span style={{ fontSize:7.5, fontWeight:800, background:'rgba(255,255,255,0.25)', color:'#fff', padding:'1px 4px', borderRadius:3, letterSpacing:'0.04em' }}>TODAY</span>}
                  </div>
                  {code && <span style={{ fontSize:8.5, fontWeight:700, color: isToday ? 'rgba(255,255,255,0.9)' : cs.fg }}>{code}</span>}
                  {rec?.inTime && (
                    <span style={{ fontSize:8, color: isToday ? 'rgba(255,255,255,0.75)' : cs.fg, opacity: isToday?1:0.7, marginTop:'auto', fontVariantNumeric:'tabular-nums' }}>
                      {String(rec.inTime).slice(0,5)}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Right side panel */}
        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>

          {/* Leave Balance */}
          <div style={{ ...GCA, padding:16 }}>
            <span style={STA}>Leave Balance</span>
            {!(balQ.data||[]).length ? (
              <p style={{ fontSize:12, color:'#94A3B8' }}>No balance data</p>
            ) : (
              <div style={{ display:'flex', flexDirection:'column', gap:9 }}>
                {(balQ.data||[]).map((b,i) => {
                  const bal  = Number(b.closing_balance??0);
                  const max  = Number(b.total_entitlement||b.closing_balance||20);
                  const pct  = max>0 ? Math.min(100,Math.round((bal/max)*100)) : 0;
                  const cols = ['#8B5CF6','#2F6FED','#10B981','#F59E0B','#EF4444'];
                  const col  = cols[i%cols.length];
                  return (
                    <div key={i} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:8 }}>
                      <span style={{ fontSize:11.5, color:'#475569', flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{b.leave_type_name}</span>
                      <div style={{ display:'flex', alignItems:'center', gap:7 }}>
                        <div style={{ width:56, height:3, background:'rgba(0,0,0,0.07)', borderRadius:99, overflow:'hidden' }}>
                          <div style={{ width:`${pct}%`, height:'100%', background:col, borderRadius:99 }} />
                        </div>
                        <span style={{ fontSize:12, fontWeight:700, color:'#1E293B', fontVariantNumeric:'tabular-nums', minWidth:24, textAlign:'right' }}>{bal.toFixed(1)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Correction Form */}
          <div style={{ ...GCA, padding:16 }}>
            <span style={STA}>Attendance Correction</span>
            <p style={{ fontSize:11.5, color:'#64748B', marginBottom:12 }}>Missed punch or wrong status — raise a correction request.</p>
            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              <div>
                <label style={{ fontSize:10.5, color:'#94A3B8', fontWeight:600, display:'block', marginBottom:4 }}>Date</label>
                <input type="date" className={inputCls} value={correction.attendance_date}
                  onChange={e => setCorrection({ ...correction, attendance_date: e.target.value })} style={{ width:'100%' }} />
              </div>
              <div>
                <label style={{ fontSize:10.5, color:'#94A3B8', fontWeight:600, display:'block', marginBottom:4 }}>Status</label>
                <select className={inputCls} value={correction.requested_status}
                  onChange={e => setCorrection({ ...correction, requested_status: e.target.value })} style={{ width:'100%' }}>
                  <option value="present">Present</option>
                  <option value="half_day">Half Day</option>
                  <option value="on_duty">On Duty</option>
                </select>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                <div>
                  <label style={{ fontSize:10.5, color:'#94A3B8', fontWeight:600, display:'block', marginBottom:4 }}>In Time</label>
                  <input type="time" className={inputCls} value={correction.requested_in_time}
                    onChange={e => setCorrection({ ...correction, requested_in_time: e.target.value })} style={{ width:'100%' }} />
                </div>
                <div>
                  <label style={{ fontSize:10.5, color:'#94A3B8', fontWeight:600, display:'block', marginBottom:4 }}>Out Time</label>
                  <input type="time" className={inputCls} value={correction.requested_out_time}
                    onChange={e => setCorrection({ ...correction, requested_out_time: e.target.value })} style={{ width:'100%' }} />
                </div>
              </div>
              <div>
                <label style={{ fontSize:10.5, color:'#94A3B8', fontWeight:600, display:'block', marginBottom:4 }}>Reason</label>
                <input className={inputCls} value={correction.reason} placeholder="Reason for correction"
                  onChange={e => setCorrection({ ...correction, reason: e.target.value })} style={{ width:'100%' }} />
              </div>
              <button
                disabled={!correction.reason || createCorrection.isPending}
                onClick={() => createCorrection.mutate(correction)}
                style={{ marginTop:4, width:'100%', padding:'9px', borderRadius:10, border:'none', cursor: correction.reason ? 'pointer' : 'not-allowed', background: correction.reason ? ACCENT : 'rgba(0,0,0,0.06)', color: correction.reason ? '#fff' : '#94A3B8', fontSize:12.5, fontWeight:700 }}
              >
                {createCorrection.isPending ? 'Submitting…' : 'Submit Correction'}
              </button>
            </div>
          </div>

        </div>
      </div>

      {/* Correction History */}
      <div style={{ ...GCA, padding:20 }}>
        <span style={{ fontSize:14, fontWeight:700, color:'#1E293B', marginBottom:14, display:'block' }}>My Correction Requests</span>
        <Table
          columns={[
            { key: 'attendance_date',  label: 'Date',    render: r => String(r.attendance_date||'').slice(0,10) },
            { key: 'requested_status', label: 'Status'  },
            { key: 'reason',           label: 'Reason'  },
            { key: 'status',           label: 'Approval', render: r => <StatusBadge value={r.status} /> },
          ]}
          rows={corrections.data || []}
        />
      </div>

      {/* Biometric Swipe Logs */}
      <div style={{ ...GCA, padding:20 }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14 }}>
          <div>
            <span style={{ fontSize:14, fontWeight:700, color:'#1E293B' }}>Biometric Swipe Logs</span>
            <p style={{ fontSize:11.5, color:'#94A3B8', marginTop:2 }}>All punches recorded by the ESSL device for your card</p>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:6 }}>
            <span style={{ fontSize:10.5, color:'#94A3B8', fontWeight:600 }}>Show last</span>
            {[7,14,30,60].map(d => (
              <button key={d} onClick={() => setSwipeDays(d)}
                style={{ fontSize:11, fontWeight:700, padding:'3px 10px', borderRadius:20, border:'1px solid', cursor:'pointer',
                  background: swipeDays===d ? ACCENT : 'transparent',
                  color:      swipeDays===d ? '#fff'  : '#64748B',
                  borderColor:swipeDays===d ? ACCENT  : '#d1d5db' }}
              >{d}d</button>
            ))}
          </div>
        </div>

        {swipes.isLoading ? (
          <p style={{ fontSize:12, color:'#94A3B8', textAlign:'center', padding:'20px 0' }}>Loading swipes…</p>
        ) : !(swipes.data||[]).length ? (
          <div style={{ padding:'24px 0', textAlign:'center' }}>
            <p style={{ fontSize:13, color:'#94A3B8', fontWeight:600 }}>No swipe records for the last {swipeDays} days</p>
            <p style={{ fontSize:11, color:'#CBD5E1', marginTop:4 }}>Biometric data syncs automatically from the ESSL device</p>
          </div>
        ) : (
          <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
            {groupByDate(swipes.data||[]).map(([date, daySwipes]) => {
              const d        = new Date(date+'T00:00:00');
              const dayLabel = d.toLocaleDateString('en-IN', { weekday:'short', day:'2-digit', month:'short', year:'numeric' });
              const isIn     = s => String(s.direction||'').toLowerCase().includes('in')  || s.direction==='0';
              const isOut    = s => String(s.direction||'').toLowerCase().includes('out') || s.direction==='1';
              const firstIn  = daySwipes.find(isIn);
              const lastOut  = [...daySwipes].reverse().find(isOut);
              return (
                <div key={date} style={{ borderRadius:12, overflow:'hidden', border:'1px solid rgba(0,0,0,0.07)' }}>
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'8px 14px', background:DARK }}>
                    <span style={{ fontSize:12, fontWeight:700, color:'#fff' }}>{dayLabel}</span>
                    <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                      {firstIn && <span style={{ fontSize:11, color:'rgba(255,255,255,0.65)' }}>In: <strong style={{ color:'#fff' }}>{(() => { const t=esslTime(firstIn.swipe_time); return fmt12(t.h,t.m); })()}</strong></span>}
                      {lastOut && <span style={{ fontSize:11, color:'rgba(255,255,255,0.65)' }}>Out: <strong style={{ color:'#fff' }}>{(() => { const t=esslTime(lastOut.swipe_time); return fmt12(t.h,t.m); })()}</strong></span>}
                      <span style={{ fontSize:10.5, background:'rgba(255,255,255,0.2)', color:'#fff', borderRadius:10, padding:'1px 8px', fontWeight:700 }}>{daySwipes.length} punch{daySwipes.length!==1?'es':''}</span>
                    </div>
                  </div>
                  <div style={{ background:'rgba(255,255,255,0.6)' }}>
                    {daySwipes.map((s,i) => {
                      const et = esslTime(s.swipe_time);
                      return (
                        <div key={i} style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 14px', borderBottom: i<daySwipes.length-1?'1px solid rgba(0,0,0,0.05)':undefined }}>
                          <span style={{ width:24, textAlign:'center', fontSize:10.5, fontWeight:700, color:'#CBD5E1' }}>{i+1}</span>
                          <SwipeDir direction={s.direction} />
                          <span style={{ fontSize:13, fontWeight:700, color:'#1E293B', fontVariantNumeric:'tabular-nums' }}>{fmt12(et.h,et.m,et.s)}</span>
                          {s.source && <span style={{ marginLeft:'auto', fontSize:10, color:'#CBD5E1', textTransform:'uppercase', letterSpacing:'0.06em' }}>{s.source}</span>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

    </div>
  );
}

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   LEAVE TAB
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
function LeaveTab({ leaveTypes }) {
  const qc      = useQueryClient();
  const balances = useQuery({ queryKey: ['ess-leave-balances'],  queryFn: () => essAPI.leaveBalances().then(unwrap) });
  const requests = useQuery({ queryKey: ['ess-leave-requests'],  queryFn: () => essAPI.leaveRequests().then(unwrap) });
  const [leave, setLeave] = useState({ leave_type_id: '', from_date: today(), to_date: today(), reason: '' });
  const GCA = { background:'rgba(255,255,255,0.88)', border:'1px solid rgba(255,255,255,0.95)', borderRadius:16, boxShadow:'0 2px 16px rgba(0,0,0,.055),0 1px 3px rgba(0,0,0,.04)' };
  const STA = { fontSize:10.5, color:'#94A3B8', textTransform:'uppercase', letterSpacing:'0.1em', fontWeight:600, marginBottom:8, display:'block' };
  const refresh = () => ['ess-leave-balances','ess-leave-requests','ess-summary','ess-leave-requests-dash'].forEach(k => qc.invalidateQueries({ queryKey: [k] }));
  const createLeave = useMutation({
    mutationFn: essAPI.createLeaveRequest,
    onSuccess: () => { toast.success('Leave requested'); setLeave({ ...leave, reason: '' }); refresh(); },
  });
  const cancelLeave = useMutation({ mutationFn: essAPI.cancelLeaveRequest, onSuccess: refresh, onError: (e) => toast.error(e?.response?.data?.error || 'Failed to cancel leave') });

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
      {/* Balance chips */}
      <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
        {(balances.data || []).map((b) => {
          const taken = Number(b.taken??0), accrued = Number(b.accrued??0), avail = Number(b.closing_balance??0);
          const pct = accrued > 0 ? Math.min(100, Math.round((taken/accrued)*100)) : 0;
          return (
            <div key={b.leave_type_id} style={{ minWidth:150, ...GCA, padding:16, flexShrink:0 }}>
              <p style={{ fontSize:11.5, fontWeight:600, color:'#64748B', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{b.leave_type_name}</p>
              <p style={{ marginTop:8, fontSize:28, fontWeight:800, color:ACCENT, lineHeight:1 }}>{avail.toFixed(1)}</p>
              <p style={{ fontSize:10.5, color:'#94A3B8' }}>Available</p>
              <div style={{ marginTop:8, height:3, background:'rgba(0,0,0,0.06)', borderRadius:99 }}>
                <div style={{ height:3, borderRadius:99, width:`${pct}%`, background:ACCENT }} />
              </div>
              <p style={{ marginTop:4, fontSize:10, color:'#94A3B8' }}>{taken} taken / {accrued} accrued</p>
            </div>
          );
        })}
      </div>

      <div style={{ ...GCA, padding:20 }}>
        <span style={STA}>Apply Leave</span>
        <p style={{ fontSize:11.5, color:'#64748B', marginBottom:12 }}>Submit a new leave request</p>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12 }}>
          <div>
            <label style={{ fontSize:10.5, color:'#94A3B8', fontWeight:600, display:'block', marginBottom:4 }}>Leave Type</label>
            <select className={inputCls} value={leave.leave_type_id} onChange={e => setLeave({ ...leave, leave_type_id: e.target.value })}>
              <option value="">Select leave type</option>
              {leaveTypes.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize:10.5, color:'#94A3B8', fontWeight:600, display:'block', marginBottom:4 }}>From Date</label>
            <input type="date" className={inputCls} value={leave.from_date} onChange={e => setLeave({ ...leave, from_date: e.target.value })} />
          </div>
          <div>
            <label style={{ fontSize:10.5, color:'#94A3B8', fontWeight:600, display:'block', marginBottom:4 }}>To Date</label>
            <input type="date" className={inputCls} value={leave.to_date} onChange={e => setLeave({ ...leave, to_date: e.target.value })} />
          </div>
          <div>
            <label style={{ fontSize:10.5, color:'#94A3B8', fontWeight:600, display:'block', marginBottom:4 }}>Reason</label>
            <input className={inputCls} value={leave.reason} placeholder="Reason for leave" onChange={e => setLeave({ ...leave, reason: e.target.value })} />
          </div>
        </div>
        <div style={{ marginTop:16 }}>
          <button disabled={!leave.leave_type_id || createLeave.isPending} onClick={() => createLeave.mutate(leave)}
            style={{ background:leave.leave_type_id?ACCENT:'rgba(0,0,0,0.08)', color:leave.leave_type_id?'#fff':'#94A3B8', borderRadius:10, border:'none', padding:'9px 20px', fontWeight:700, fontSize:12.5, cursor:leave.leave_type_id?'pointer':'not-allowed' }}>
            Apply Leave
          </button>
        </div>
      </div>

      <div style={{ ...GCA, padding:20 }}>
        <span style={STA}>Leave Request History</span>
        <Table
          columns={[
            { key: 'leave_type_name', label: 'Type'   },
            { key: 'from_date', label: 'From', render: r => String(r.from_date||'').slice(0,10) },
            { key: 'to_date',   label: 'To',   render: r => String(r.to_date  ||'').slice(0,10) },
            { key: 'days',      label: 'Days'  },
            { key: 'status',    label: 'Status', render: r => <StatusBadge value={r.status} /> },
            { key: 'actions',   label: 'Action', render: r => r.status === 'pending'
                ? <button onClick={() => cancelLeave.mutate(r.id)}
                    style={{ background:'rgba(239,68,68,0.07)', border:'1px solid rgba(239,68,68,0.2)', borderRadius:6, padding:'3px 10px', fontSize:11.5, fontWeight:600, color:'#DC2626', cursor:'pointer' }}>
                    Cancel
                  </button>
                : '-'
            },
          ]}
          rows={requests.data || []}
        />
      </div>
    </div>
  );
}

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   PAYSLIPS TAB
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
function PayslipsTab() {
  const navigate = useNavigate();
  const now = new Date();
  const [ytdYear, setYtdYear] = useState(now.getFullYear());
  const GCA = { background:'rgba(255,255,255,0.88)', border:'1px solid rgba(255,255,255,0.95)', borderRadius:16, boxShadow:'0 2px 16px rgba(0,0,0,.055),0 1px 3px rgba(0,0,0,.04)' };
  const STA = { fontSize:10.5, color:'#94A3B8', textTransform:'uppercase', letterSpacing:'0.1em', fontWeight:600, marginBottom:8, display:'block' };
  const payslips = useQuery({ queryKey: ['ess-payslips'], queryFn: () => essAPI.payslips().then(unwrap) });
  const ytd = useQuery({ queryKey: ['ess-ytd', ytdYear], queryFn: () => essAPI.payrollYtd({ year: ytdYear }).then(r => r.data.data) });
  const t = ytd.data?.totals || { gross: 0, deductions: 0, net: 0 };
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
      <div style={{ ...GCA, padding:20 }}>
        <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:16 }}>
          <div>
            <span style={STA}>YTD Summary</span>
            <p style={{ fontSize:11.5, color:'#64748B' }}>Year-to-date earnings, deductions and net pay</p>
          </div>
          <select className={inputCls} style={{ maxWidth:110 }} value={ytdYear} onChange={e => setYtdYear(Number(e.target.value))}>
            {[now.getFullYear(), now.getFullYear() - 1, now.getFullYear() - 2].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12 }}>
          {[
            { label:'Gross Earnings',    val:`₹${t.gross.toLocaleString('en-IN')}`,       color:'#1E293B' },
            { label:'Total Deductions',  val:`₹${t.deductions.toLocaleString('en-IN')}`,  color:'#EF4444' },
            { label:'Net Paid',          val:`₹${t.net.toLocaleString('en-IN')}`,         color:ACCENT    },
          ].map(({ label, val, color }) => (
            <div key={label} style={{ background:'rgba(47,111,237,0.04)', border:'1px solid rgba(47,111,237,0.08)', borderRadius:12, padding:16 }}>
              <p style={{ fontSize:10.5, fontWeight:600, textTransform:'uppercase', letterSpacing:'0.08em', color:'#94A3B8' }}>{label}</p>
              <p style={{ marginTop:6, fontSize:20, fontWeight:800, color, fontVariantNumeric:'tabular-nums' }}>{val}</p>
            </div>
          ))}
        </div>
        {!(ytd.data?.months || []).length && !ytd.isLoading && (
          <p style={{ marginTop:12, textAlign:'center', fontSize:11.5, color:'#94A3B8' }}>No payroll records for {ytdYear}</p>
        )}
      </div>

      <div style={{ ...GCA, padding:20 }}>
        <span style={STA}>Payslips</span>
        <p style={{ fontSize:11.5, color:'#64748B', marginBottom:14 }}>Approved and paid payslips</p>
        <Table
          columns={[
            { key: 'month',            label: 'Month' },
            { key: 'year',             label: 'Year'  },
            { key: 'gross_earnings',   label: 'Gross',      render: r => `₹${Number(r.gross_earnings  ||0).toLocaleString('en-IN')}` },
            { key: 'total_deductions', label: 'Deductions', render: r => `₹${Number(r.total_deductions||0).toLocaleString('en-IN')}` },
            { key: 'net_pay', label: 'Net Pay', render: r => (
              <span style={{ fontWeight:700, color:ACCENT }}>₹{Number(r.net_pay||0).toLocaleString('en-IN')}</span>
            )},
            { key: 'status', label: 'Status', render: r => <StatusBadge value={r.status} /> },
            { key: 'actions', label: 'Payslip', render: r => (
              <button onClick={() => navigate(`/hr-admin/payroll/${r.id}/payslip`)}
                style={{ display:'inline-flex', alignItems:'center', gap:4, borderRadius:8, padding:'5px 12px', fontSize:11.5, fontWeight:600, color:'#fff', background:ACCENT, border:'none', cursor:'pointer' }}>
                <Printer size={12} /> Print
              </button>
            )},
          ]}
          rows={payslips.data || []}
        />
      </div>
    </div>
  );
}

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   DOCUMENTS TAB
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
function DocumentsTab({ policies, userId }) {
  const qc = useQueryClient();
  const [doc, setDoc] = useState({ file: null, doc_type: 'employee_document', doc_name: '' });
  const GCA = { background:'rgba(255,255,255,0.88)', border:'1px solid rgba(255,255,255,0.95)', borderRadius:16, boxShadow:'0 2px 16px rgba(0,0,0,.055),0 1px 3px rgba(0,0,0,.04)' };
  const STA = { fontSize:10.5, color:'#94A3B8', textTransform:'uppercase', letterSpacing:'0.1em', fontWeight:600, marginBottom:8, display:'block' };
  const documents = useQuery({ queryKey: ['ess-documents'], queryFn: () => essAPI.documents().then(unwrap) });
  const acks = useQuery({ queryKey: ['ess-policy-acks', userId], queryFn: () => hrAdvancedAPI.listPolicyAcks({ user_id: userId }).then(unwrap), enabled: Boolean(userId) });
  const upload = useMutation({
    mutationFn: () => essAPI.uploadDocument(doc.file, { doc_type: doc.doc_type, doc_name: doc.doc_name }),
    onSuccess: () => { toast.success('Document uploaded'); setDoc({ file: null, doc_type: 'employee_document', doc_name: '' }); qc.invalidateQueries({ queryKey: ['ess-documents'] }); },
  });
  const acknowledge = useMutation({
    mutationFn: (id) => hrAdvancedAPI.acknowledgePolicy(id, {}),
    onSuccess:  () => { toast.success('Policy acknowledged'); qc.invalidateQueries({ queryKey: ['ess-policy-acks'] }); },
  });
  const acked = new Set((acks.data || []).map(a => a.policy_id));

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
      <div style={{ ...GCA, padding:20 }}>
        <span style={STA}>Upload Document</span>
        <p style={{ fontSize:11.5, color:'#64748B', marginBottom:12 }}>Upload profile and HR documents</p>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12 }}>
          <div>
            <label style={{ fontSize:10.5, color:'#94A3B8', fontWeight:600, display:'block', marginBottom:4 }}>Document Type</label>
            <select className={inputCls} value={doc.doc_type} onChange={e => setDoc({ ...doc, doc_type: e.target.value })}>
              <option value="employee_document">Employee Document</option>
              <option value="id_proof">ID Proof</option>
              <option value="address_proof">Address Proof</option>
              <option value="certificate">Certificate</option>
            </select>
          </div>
          <div>
            <label style={{ fontSize:10.5, color:'#94A3B8', fontWeight:600, display:'block', marginBottom:4 }}>Document Name</label>
            <input className={inputCls} value={doc.doc_name} onChange={e => setDoc({ ...doc, doc_name: e.target.value })} />
          </div>
          <div>
            <label style={{ fontSize:10.5, color:'#94A3B8', fontWeight:600, display:'block', marginBottom:4 }}>File</label>
            <input type="file" className={inputCls} onChange={e => setDoc({ ...doc, file: e.target.files?.[0] || null })} />
          </div>
        </div>
        <div style={{ marginTop:16 }}>
          <button disabled={!doc.file} onClick={() => upload.mutate()}
            style={{ display:'inline-flex', alignItems:'center', gap:6, background:doc.file?ACCENT:'rgba(0,0,0,0.08)', color:doc.file?'#fff':'#94A3B8', borderRadius:10, border:'none', padding:'9px 20px', fontWeight:700, fontSize:12.5, cursor:doc.file?'pointer':'not-allowed' }}>
            <Upload size={15} /> Upload Document
          </button>
        </div>
      </div>

      <div style={{ ...GCA, padding:20 }}>
        <span style={STA}>My Documents</span>
        <Table
          columns={[
            { key: 'doc_type',    label: 'Type' },
            { key: 'doc_name',    label: 'Name' },
            { key: 'uploaded_at', label: 'Uploaded', render: r => String(r.uploaded_at||'').slice(0,10) },
          ]}
          rows={documents.data || []}
        />
      </div>

      <div style={{ ...GCA, padding:20 }}>
        <span style={STA}>Policy Acknowledgement</span>
        <p style={{ fontSize:11.5, color:'#64748B', marginBottom:14 }}>Read and acknowledge published company policies</p>
        <Table
          columns={[
            { key: 'title',          label: 'Policy'   },
            { key: 'category',       label: 'Category' },
            { key: 'version',        label: 'Version'  },
            { key: 'effective_date', label: 'Effective', render: r => String(r.effective_date||'').slice(0,10) },
            { key: 'actions', label: 'Status', render: r => acked.has(r.id)
                ? <span style={{ display:'inline-block', padding:'2px 10px', borderRadius:99, fontSize:11, fontWeight:600, background:'rgba(16,185,129,0.08)', border:'1px solid rgba(16,185,129,0.2)', color:'#059669' }}>Acknowledged</span>
                : <button style={{ display:'inline-block', padding:'2px 10px', borderRadius:99, fontSize:11, fontWeight:600, background:'rgba(47,111,237,0.06)', border:'1px solid rgba(47,111,237,0.15)', color:ACCENT, cursor:'pointer' }} onClick={() => acknowledge.mutate(r.id)}>Acknowledge</button>
            },
          ]}
          rows={policies}
        />
      </div>
    </div>
  );
}

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   HR REQUESTS TAB
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
function HRRequestsTab({ serviceRequests }) {
  const qc = useQueryClient();
  const [reqForm, setReqForm] = useState({ request_type: 'certificate', priority: 'normal', subject: '', description: '' });
  const GCA = { background:'rgba(255,255,255,0.88)', border:'1px solid rgba(255,255,255,0.95)', borderRadius:16, boxShadow:'0 2px 16px rgba(0,0,0,.055),0 1px 3px rgba(0,0,0,.04)' };
  const STA = { fontSize:10.5, color:'#94A3B8', textTransform:'uppercase', letterSpacing:'0.1em', fontWeight:600, marginBottom:8, display:'block' };
  const createRequest = useMutation({
    mutationFn: () => hrAdvancedAPI.createServiceRequest(reqForm),
    onSuccess:  () => { toast.success('HR request created'); setReqForm({ request_type: 'certificate', priority: 'normal', subject: '', description: '' }); qc.invalidateQueries({ queryKey: ['ess-hr-requests'] }); },
  });
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
      <div style={{ ...GCA, padding:20 }}>
        <span style={STA}>Raise HR Request</span>
        <p style={{ fontSize:11.5, color:'#64748B', marginBottom:12 }}>Certificates, payroll queries, corrections, document support</p>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
          <div>
            <label style={{ fontSize:10.5, color:'#94A3B8', fontWeight:600, display:'block', marginBottom:4 }}>Request Type</label>
            <select className={inputCls} value={reqForm.request_type} onChange={e => setReqForm({ ...reqForm, request_type: e.target.value })}>
              <option value="certificate">Certificate / Letter</option>
              <option value="payroll">Payroll Query</option>
              <option value="attendance">Attendance Issue</option>
              <option value="leave">Leave Query</option>
              <option value="documents">Document Correction</option>
              <option value="general">General</option>
            </select>
          </div>
          <div>
            <label style={{ fontSize:10.5, color:'#94A3B8', fontWeight:600, display:'block', marginBottom:4 }}>Priority</label>
            <select className={inputCls} value={reqForm.priority} onChange={e => setReqForm({ ...reqForm, priority: e.target.value })}>
              <option value="low">Low</option>
              <option value="normal">Normal</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
          </div>
          <div>
            <label style={{ fontSize:10.5, color:'#94A3B8', fontWeight:600, display:'block', marginBottom:4 }}>Subject</label>
            <input className={inputCls} value={reqForm.subject} placeholder="Brief subject" onChange={e => setReqForm({ ...reqForm, subject: e.target.value })} />
          </div>
          <div>
            <label style={{ fontSize:10.5, color:'#94A3B8', fontWeight:600, display:'block', marginBottom:4 }}>Description</label>
            <input className={inputCls} value={reqForm.description} placeholder="Details" onChange={e => setReqForm({ ...reqForm, description: e.target.value })} />
          </div>
        </div>
        <div style={{ marginTop:16 }}>
          <button disabled={!reqForm.subject} onClick={() => createRequest.mutate()}
            style={{ background:reqForm.subject?ACCENT:'rgba(0,0,0,0.08)', color:reqForm.subject?'#fff':'#94A3B8', borderRadius:10, border:'none', padding:'9px 20px', fontWeight:700, fontSize:12.5, cursor:reqForm.subject?'pointer':'not-allowed' }}>
            Create Request
          </button>
        </div>
      </div>
      <div style={{ ...GCA, padding:20 }}>
        <span style={STA}>My HR Requests</span>
        <Table
          columns={[
            { key: 'request_no',   label: 'Req No.'  },
            { key: 'request_type', label: 'Type'     },
            { key: 'subject',      label: 'Subject'  },
            { key: 'priority',     label: 'Priority' },
            { key: 'status',       label: 'Status',  render: r => <StatusBadge value={r.status} /> },
          ]}
          rows={serviceRequests}
        />
      </div>
    </div>
  );
}

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   MANAGER DESK TAB
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
function ManagerDeskTab() {
  const qc          = useQueryClient();
  const leaves      = useQuery({ queryKey: ['ess-manager-leaves'],      queryFn: () => essAPI.managerLeaveRequests({ status: 'pending' }).then(unwrap), retry: false });
  const corrections = useQuery({ queryKey: ['ess-manager-corrections'], queryFn: () => essAPI.managerCorrections({ status: 'pending' }).then(unwrap), retry: false });
  const GCA = { background:'rgba(255,255,255,0.88)', border:'1px solid rgba(255,255,255,0.95)', borderRadius:16, boxShadow:'0 2px 16px rgba(0,0,0,.055),0 1px 3px rgba(0,0,0,.04)' };
  const STA = { fontSize:10.5, color:'#94A3B8', textTransform:'uppercase', letterSpacing:'0.1em', fontWeight:600, marginBottom:8, display:'block' };
  const refresh     = () => { qc.invalidateQueries({ queryKey: ['ess-manager-leaves'] }); qc.invalidateQueries({ queryKey: ['ess-manager-corrections'] }); };
  const leaveAction      = useMutation({ mutationFn: ({ id, action, rejection_reason }) => essAPI.managerLeaveAction(id, action, rejection_reason ? { rejection_reason } : {}),      onSuccess: refresh, onError: (e) => toast.error(e?.response?.data?.error || 'Action failed') });
  const correctionAction = useMutation({ mutationFn: ({ id, action, rejection_reason }) => essAPI.managerCorrectionAction(id, action, rejection_reason ? { rejection_reason } : {}), onSuccess: refresh, onError: (e) => toast.error(e?.response?.data?.error || 'Action failed') });

  const [rejectModal, setRejectModal] = useState({ open: false, type: null, id: null });
  const [rejectReason, setRejectReason] = useState('');

  const openReject   = (type, id) => { setRejectReason(''); setRejectModal({ open: true, type, id }); };
  const closeReject  = () => setRejectModal({ open: false, type: null, id: null });
  const submitReject = () => {
    const { type, id } = rejectModal;
    if (type === 'leave')      leaveAction.mutate({ id, action: 'reject', rejection_reason: rejectReason });
    if (type === 'correction') correctionAction.mutate({ id, action: 'reject', rejection_reason: rejectReason });
    closeReject();
  };

  if (leaves.error?.response?.status === 403 && corrections.error?.response?.status === 403) {
    return (
      <div style={{ ...GCA, padding:20 }}>
        <span style={STA}>Manager Desk</span>
        <p style={{ fontSize:13, color:'#64748B' }}>No manager approvals are available for this login.</p>
      </div>
    );
  }

  const ActionButtons = ({ onApprove, onReject }) => (
    <div style={{ display:'flex', gap:6 }}>
      <button onClick={onApprove} style={{ background:'rgba(16,185,129,0.08)', border:'1px solid rgba(16,185,129,0.2)', borderRadius:6, padding:'3px 10px', fontSize:11.5, fontWeight:600, color:'#059669', cursor:'pointer' }}>Approve</button>
      <button onClick={onReject}  style={{ background:'rgba(239,68,68,0.06)', border:'1px solid rgba(239,68,68,0.2)', borderRadius:6, padding:'3px 10px', fontSize:11.5, fontWeight:600, color:'#DC2626', cursor:'pointer' }}>Reject</button>
    </div>
  );

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
      {rejectModal.open && (
        <div style={{ position:'fixed', inset:0, zIndex:50, display:'flex', alignItems:'center', justifyContent:'center', background:'rgba(0,0,0,0.4)' }} onClick={closeReject}>
          <div style={{ ...GCA, padding:24, width:'100%', maxWidth:360, margin:'0 16px' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ fontSize:14, fontWeight:700, color:'#1E293B', marginBottom:12 }}>Reason for Rejection</h3>
            <textarea style={{ width:'100%', borderRadius:8, border:'1px solid rgba(0,0,0,0.12)', padding:10, fontSize:13, resize:'none', outline:'none', fontFamily:'inherit', boxSizing:'border-box' }}
              rows={3} placeholder="Enter reason (optional)" value={rejectReason} onChange={e => setRejectReason(e.target.value)} />
            <div style={{ marginTop:14, display:'flex', justifyContent:'flex-end', gap:8 }}>
              <button onClick={closeReject} style={{ borderRadius:8, border:'1px solid rgba(0,0,0,0.1)', padding:'7px 16px', fontSize:12.5, fontWeight:600, color:'#64748B', background:'transparent', cursor:'pointer' }}>Cancel</button>
              <button onClick={submitReject} style={{ borderRadius:8, border:'none', padding:'7px 16px', fontSize:12.5, fontWeight:700, color:'#fff', background:'#DC2626', cursor:'pointer' }}>Reject</button>
            </div>
          </div>
        </div>
      )}

      <div style={{ ...GCA, padding:20 }}>
        <span style={STA}>Leave Approvals</span>
        <p style={{ fontSize:11.5, color:'#64748B', marginBottom:14 }}>Pending team leave requests</p>
        <Table
          columns={[
            { key: 'employee_name',   label: 'Employee' },
            { key: 'leave_type_name', label: 'Type'     },
            { key: 'from_date', label: 'From', render: r => String(r.from_date||'').slice(0,10) },
            { key: 'to_date',   label: 'To',   render: r => String(r.to_date  ||'').slice(0,10) },
            { key: 'days',            label: 'Days'     },
            { key: 'actions', label: 'Action', render: r => (
              <ActionButtons onApprove={() => leaveAction.mutate({ id: r.id, action: 'approve' })} onReject={() => openReject('leave', r.id)} />
            )},
          ]}
          rows={leaves.data || []}
        />
      </div>

      <div style={{ ...GCA, padding:20 }}>
        <span style={STA}>Attendance Corrections</span>
        <p style={{ fontSize:11.5, color:'#64748B', marginBottom:14 }}>Pending attendance corrections from your team</p>
        <Table
          columns={[
            { key: 'employee_name',    label: 'Employee' },
            { key: 'attendance_date',  label: 'Date',    render: r => String(r.attendance_date||'').slice(0,10) },
            { key: 'requested_status', label: 'Status'   },
            { key: 'reason',           label: 'Reason'   },
            { key: 'actions', label: 'Action', render: r => (
              <ActionButtons onApprove={() => correctionAction.mutate({ id: r.id, action: 'approve' })} onReject={() => openReject('correction', r.id)} />
            )},
          ]}
          rows={corrections.data || []}
        />
      </div>
    </div>
  );
}

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   TRAINING TAB
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
const TRAINING_CATEGORIES = [
  'Safety & HSE',
  'Technical Skills',
  'Quality Assurance',
  'Housekeeping & 5S',
  'Soft Skills / Leadership',
  'Induction / Onboarding',
  'Compliance & Statutory',
  'Equipment Operation',
  'First Aid / Emergency',
  'Other',
];

const STATUS_COLORS = {
  pending:   { bg: 'bg-amber-50',   text: 'text-amber-700',   label: 'Pending'   },
  approved:  { bg: 'bg-green-50',   text: 'text-green-700',   label: 'Approved'  },
  rejected:  { bg: 'bg-red-50',     text: 'text-red-700',     label: 'Rejected'  },
  completed: { bg: 'bg-blue-50',    text: 'text-blue-700',    label: 'Completed' },
};

function TrainingTab() {
  const qc = useQueryClient();
  const GCA = { background:'rgba(255,255,255,0.88)', border:'1px solid rgba(255,255,255,0.95)', borderRadius:16, boxShadow:'0 2px 16px rgba(0,0,0,.055),0 1px 3px rgba(0,0,0,.04)' };
  const STA = { fontSize:10.5, color:'#94A3B8', textTransform:'uppercase', letterSpacing:'0.1em', fontWeight:600, marginBottom:8, display:'block' };

  const requirements = useQuery({ queryKey: ['ess-training-requirements'], queryFn: () => essAPI.trainingRequirements().then(unwrap) });
  const requests     = useQuery({ queryKey: ['ess-training-requests'],     queryFn: () => essAPI.trainingRequests().then(unwrap) });

  const [form, setForm] = useState({ training_name: '', category: '', reason: '', preferred_date: '' });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const submit = useMutation({
    mutationFn: () => essAPI.createTrainingRequest(form),
    onSuccess: () => { toast.success('Training request submitted'); setForm({ training_name: '', category: '', reason: '', preferred_date: '' }); qc.invalidateQueries({ queryKey: ['ess-training-requests'] }); },
    onError: (e) => toast.error(e?.response?.data?.error || 'Failed to submit'),
  });

  const reqs = requirements.data || [];
  const myRequests = requests.data || [];

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:16, maxWidth:900, margin:'0 auto' }}>

      {/* Header */}
      <div style={{ borderRadius:16, padding:24, color:'#fff', background:`linear-gradient(135deg, ${DARK}, #1e5a8a)` }}>
        <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:4 }}>
          <Award size={20} style={{ opacity:0.85 }} />
          <h2 style={{ fontSize:18, fontWeight:800, margin:0 }}>Training & Development</h2>
        </div>
        <p style={{ fontSize:13, color:'rgba(255,255,255,0.6)', margin:0 }}>View your training requirements and request new training programs</p>
      </div>

      {/* Requirements from perf review */}
      {reqs.length > 0 && (
        <div style={{ ...GCA, padding:20 }}>
          <span style={STA}>Training Required (from Performance Review)</span>
          <p style={{ fontSize:11.5, color:'#64748B', marginBottom:12 }}>Training needs identified by your reporting manager</p>
          <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
            {reqs.map(r => (
              <div key={r.id} style={{ display:'flex', gap:14, padding:14, borderRadius:12, background:'rgba(245,158,11,0.06)', border:'1px solid rgba(245,158,11,0.15)' }}>
                <div style={{ flexShrink:0, width:38, height:38, borderRadius:'50%', background:'rgba(245,158,11,0.15)', display:'flex', alignItems:'center', justifyContent:'center' }}>
                  <Award size={17} style={{ color:'#B45309' }} />
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap', marginBottom:4 }}>
                    <span style={{ fontSize:10.5, fontWeight:700, color:'#92400E', textTransform:'uppercase', letterSpacing:'0.06em' }}>
                      {r.eval_period} {String.fromCharCode(0xB7)} {r.review_type === 'quarterly' ? 'Quarterly' : 'Monthly'} Review
                    </span>
                    {r.overall_rating && <span style={{ padding:'1px 8px', borderRadius:99, fontSize:10, fontWeight:600, background:'#fff', border:'1px solid rgba(245,158,11,0.3)', color:'#B45309' }}>{r.overall_rating}</span>}
                    {r.eval_date && <span style={{ fontSize:10, color:'#F59E0B' }}>{String(r.eval_date).slice(0,10)}</span>}
                  </div>
                  <p style={{ fontSize:13, color:'#374151', whiteSpace:'pre-wrap' }}>{r.training_required}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Request Training Form */}
      <div style={{ ...GCA, padding:20 }}>
        <span style={STA}>Request Training</span>
        <p style={{ fontSize:11.5, color:'#64748B', marginBottom:16 }}>Submit a request for a training program you need</p>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
          <div style={{ gridColumn:'1 / -1' }}>
            <label style={{ fontSize:10.5, color:'#94A3B8', fontWeight:600, display:'block', marginBottom:4 }}>Training / Course Name *</label>
            <input className={inputCls} value={form.training_name} onChange={e => set('training_name', e.target.value)} placeholder="e.g. Fire Safety, Crane Operation, First Aid..." />
          </div>
          <div>
            <label style={{ fontSize:10.5, color:'#94A3B8', fontWeight:600, display:'block', marginBottom:4 }}>Category</label>
            <select className={inputCls} value={form.category} onChange={e => set('category', e.target.value)}>
              <option value="">Select category...</option>
              {TRAINING_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize:10.5, color:'#94A3B8', fontWeight:600, display:'block', marginBottom:4 }}>Preferred Date</label>
            <input type="date" className={inputCls} value={form.preferred_date} onChange={e => set('preferred_date', e.target.value)} />
          </div>
          <div style={{ gridColumn:'1 / -1' }}>
            <label style={{ fontSize:10.5, color:'#94A3B8', fontWeight:600, display:'block', marginBottom:4 }}>Reason / Justification</label>
            <textarea rows={3} className={inputCls} value={form.reason} onChange={e => set('reason', e.target.value)} placeholder="Why do you need this training?" />
          </div>
        </div>
        <div style={{ marginTop:16, display:'flex', justifyContent:'flex-end' }}>
          <button disabled={!form.training_name || submit.isPending} onClick={() => submit.mutate()}
            style={{ background:form.training_name?ACCENT:'rgba(0,0,0,0.08)', color:form.training_name?'#fff':'#94A3B8', borderRadius:10, border:'none', padding:'9px 24px', fontWeight:700, fontSize:12.5, cursor:form.training_name?'pointer':'not-allowed' }}>
            {submit.isPending ? 'Submitting...' : 'Submit Request'}
          </button>
        </div>
      </div>

      {/* My Requests */}
      <div style={{ ...GCA, padding:20 }}>
        <span style={STA}>My Training Requests</span>
        <p style={{ fontSize:11.5, color:'#64748B', marginBottom:16 }}>Track the status of your submitted training requests</p>
        {requests.isLoading ? (
          <p style={{ padding:'24px 0', textAlign:'center', fontSize:13, color:'#94A3B8' }}>Loading...</p>
        ) : myRequests.length === 0 ? (
          <div style={{ padding:'32px 0', textAlign:'center' }}>
            <Award size={32} style={{ color:'#CBD5E1', margin:'0 auto 8px' }} />
            <p style={{ fontSize:13, color:'#94A3B8' }}>No training requests submitted yet</p>
          </div>
        ) : (
          <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%', fontSize:13, borderCollapse:'collapse' }}>
              <thead>
                <tr style={{ borderBottom:'1px solid rgba(0,0,0,0.06)' }}>
                  {['Training','Category','Preferred Date','Status','Actioned By'].map(h => (
                    <th key={h} style={{ textAlign:'left', padding:'8px 12px', fontSize:10.5, fontWeight:600, textTransform:'uppercase', letterSpacing:'0.07em', color:'#94A3B8' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {myRequests.map(r => {
                  const sc = STATUS_COLORS[r.status] || STATUS_COLORS.pending;
                  return (
                    <tr key={r.id} style={{ borderBottom:'1px solid rgba(0,0,0,0.04)' }}>
                      <td style={{ padding:'10px 12px' }}>
                        <p style={{ fontWeight:600, color:'#1E293B' }}>{r.training_name}</p>
                        {r.reason && <p style={{ fontSize:11, color:'#94A3B8', marginTop:2, maxWidth:220, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{r.reason}</p>}
                      </td>
                      <td style={{ padding:'10px 12px', fontSize:12, color:'#64748B' }}>{r.category || String.fromCharCode(0x2014)}</td>
                      <td style={{ padding:'10px 12px', fontSize:12, color:'#64748B' }}>{r.preferred_date ? String(r.preferred_date).slice(0,10) : String.fromCharCode(0x2014)}</td>
                      <td style={{ padding:'10px 12px' }}>
                        <span style={{ display:'inline-block', padding:'2px 10px', borderRadius:99, fontSize:11, fontWeight:600 }} className={`${sc.bg} ${sc.text}`}>{sc.label}</span>
                        {r.rejection_reason && <p style={{ fontSize:10, color:'#EF4444', marginTop:2 }}>{r.rejection_reason}</p>}
                      </td>
                      <td style={{ padding:'10px 12px', fontSize:12, color:'#94A3B8' }}>{r.actioned_by_name || String.fromCharCode(0x2014)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Categories */}
      <div style={{ ...GCA, padding:20 }}>
        <span style={STA}>Training Categories Available</span>
        <p style={{ fontSize:11.5, color:'#64748B', marginBottom:16 }}>Types of training programs offered at BCIM</p>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:10 }}>
          {[
            { label:'Safety & HSE',         bg:'rgba(239,68,68,0.06)',   border:'rgba(239,68,68,0.15)',   color:'#B91C1C' },
            { label:'Technical Skills',     bg:'rgba(59,130,246,0.06)',  border:'rgba(59,130,246,0.15)',  color:'#1D4ED8' },
            { label:'Quality Assurance',    bg:'rgba(16,185,129,0.06)',  border:'rgba(16,185,129,0.15)',  color:'#065F46' },
            { label:'Housekeeping & 5S',    bg:'rgba(234,179,8,0.06)',   border:'rgba(234,179,8,0.15)',   color:'#92400E' },
            { label:'Soft Skills',          bg:'rgba(139,92,246,0.06)',  border:'rgba(139,92,246,0.15)',  color:'#5B21B6' },
            { label:'Induction',            bg:'rgba(99,102,241,0.06)',  border:'rgba(99,102,241,0.15)',  color:'#3730A3' },
            { label:'Compliance',           bg:'rgba(100,116,139,0.06)', border:'rgba(100,116,139,0.15)', color:'#334155' },
            { label:'Equipment Operation',  bg:'rgba(249,115,22,0.06)',  border:'rgba(249,115,22,0.15)',  color:'#9A3412' },
            { label:'First Aid / Emergency',bg:'rgba(236,72,153,0.06)',  border:'rgba(236,72,153,0.15)',  color:'#9D174D' },
            { label:'Other',                bg:'rgba(20,184,166,0.06)',  border:'rgba(20,184,166,0.15)',  color:'#0F766E' },
          ].map(({ label, bg, border, color }) => (
            <div key={label} style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:6, padding:12, borderRadius:12, border:`1px solid ${border}`, background:bg, textAlign:'center', cursor:'pointer' }}
              onClick={() => { set('category', label); window.scrollTo({ top:0, behavior:'smooth' }); }}>
              <span style={{ fontSize:11, fontWeight:700, color }}>{label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   ASSETS TAB — company assets allocated to the employee (read-only)
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
const ASSET_ICONS = {
  laptop: 'ðŸ’»', mobile: 'ðŸ“±', sim_card: 'ðŸ“¶', vehicle: 'ðŸš—',
  tools: 'ðŸ› ï¸', uniform: 'ðŸ‘•', safety_gear: 'ðŸ¦º', access_card: 'ðŸªª', other: 'ðŸ“¦',
};
function AssetsTab() {
  const assets = useQuery({ queryKey: ['ess-my-assets'], queryFn: () => essAPI.myAssets().then(unwrap) });
  const rows = assets.data || [];
  const active = rows.filter(r => r.status === 'assigned');
  const GCA = { background:'rgba(255,255,255,0.88)', border:'1px solid rgba(255,255,255,0.95)', borderRadius:16, boxShadow:'0 2px 16px rgba(0,0,0,.055),0 1px 3px rgba(0,0,0,.04)' };
  const STA = { fontSize:10.5, color:'#94A3B8', textTransform:'uppercase', letterSpacing:'0.1em', fontWeight:600, marginBottom:8, display:'block' };
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
      <div style={{ ...GCA, padding:20 }}>
        <span style={STA}>My Assets</span>
        <p style={{ fontSize:11.5, color:'#64748B', marginBottom:16 }}>Company equipment currently allocated to you</p>
        {assets.isLoading ? (
          <p style={{ padding:'24px 0', textAlign:'center', fontSize:13, color:'#94A3B8' }}>Loading assets…</p>
        ) : !active.length ? (
          <p style={{ padding:'32px 0', textAlign:'center', fontSize:13, color:'#94A3B8' }}>No assets are currently allocated to you.</p>
        ) : (
          <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12 }}>
            {active.map(a => (
              <div key={a.id} style={{ background:'rgba(255,255,255,0.7)', border:'1px solid rgba(0,0,0,0.07)', borderRadius:14, padding:16 }}>
                <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:8 }}>
                  <span style={{ fontSize:28 }}>{ASSET_ICONS[a.category] || 'ðŸ”¦'}</span>
                  <StatusBadge value={a.status === 'assigned' ? 'approved' : a.status} />
                </div>
                <p style={{ fontSize:13.5, fontWeight:700, color:'#1E293B' }}>{a.asset_name}</p>
                <p style={{ fontSize:11.5, color:'#64748B', textTransform:'capitalize' }}>{String(a.category||'').replace(/_/g,' ')}</p>
                <dl style={{ marginTop:12, display:'flex', flexDirection:'column', gap:4 }}>
                  {a.asset_code && <div style={{ display:'flex', justifyContent:'space-between' }}><dt style={{ fontSize:11, color:'#94A3B8' }}>Code</dt><dd style={{ fontSize:11, fontWeight:600, color:'#475569' }}>{a.asset_code}</dd></div>}
                  {a.serial_number && <div style={{ display:'flex', justifyContent:'space-between' }}><dt style={{ fontSize:11, color:'#94A3B8' }}>Serial</dt><dd style={{ fontSize:11, fontWeight:600, color:'#475569' }}>{a.serial_number}</dd></div>}
                  {a.assigned_on && <div style={{ display:'flex', justifyContent:'space-between' }}><dt style={{ fontSize:11, color:'#94A3B8' }}>Assigned</dt><dd style={{ fontSize:11, fontWeight:600, color:'#475569' }}>{String(a.assigned_on).slice(0,10)}</dd></div>}
                  {a.assigned_by_name && <div style={{ display:'flex', justifyContent:'space-between' }}><dt style={{ fontSize:11, color:'#94A3B8' }}>By</dt><dd style={{ fontSize:11, fontWeight:600, color:'#475569' }}>{a.assigned_by_name}</dd></div>}
                </dl>
              </div>
            ))}
          </div>
        )}
      </div>

      {rows.some(r => r.status !== 'assigned') && (
        <div style={{ ...GCA, padding:20 }}>
          <span style={STA}>Returned / Past Assets</span>
          <Table
            columns={[
              { key: 'asset_name', label: 'Asset' },
              { key: 'category',   label: 'Category', render: r => <span className="capitalize">{String(r.category||'').replace(/_/g,' ')}</span> },
              { key: 'serial_number', label: 'Serial' },
              { key: 'assigned_on', label: 'Assigned', render: r => String(r.assigned_on||'').slice(0,10) },
              { key: 'returned_on', label: 'Returned', render: r => String(r.returned_on||'').slice(0,10) || '-' },
              { key: 'status', label: 'Status', render: r => <StatusBadge value={r.status} /> },
            ]}
            rows={rows.filter(r => r.status !== 'assigned')}
          />
        </div>
      )}
    </div>
  );
}

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   HELPDESK TAB — raise & track own IT tickets
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
function HelpdeskTab() {
  const qc = useQueryClient();
  const tickets = useQuery({ queryKey: ['ess-helpdesk'], queryFn: () => essAPI.helpdeskTickets().then(unwrap) });
  const [form, setForm] = useState({ category: 'hardware', priority: 'medium', subject: '', description: '' });
  const GCA = { background:'rgba(255,255,255,0.88)', border:'1px solid rgba(255,255,255,0.95)', borderRadius:16, boxShadow:'0 2px 16px rgba(0,0,0,.055),0 1px 3px rgba(0,0,0,.04)' };
  const STA = { fontSize:10.5, color:'#94A3B8', textTransform:'uppercase', letterSpacing:'0.1em', fontWeight:600, marginBottom:8, display:'block' };
  const create = useMutation({
    mutationFn: () => essAPI.createHelpdeskTicket(form),
    onSuccess:  () => { toast.success('Ticket raised'); setForm({ category: 'hardware', priority: 'medium', subject: '', description: '' }); qc.invalidateQueries({ queryKey: ['ess-helpdesk'] }); },
    onError:    (e) => toast.error(e?.response?.data?.error || 'Failed to raise ticket'),
  });
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
      <div style={{ ...GCA, padding:20 }}>
        <span style={STA}>Raise a Helpdesk Ticket</span>
        <p style={{ fontSize:11.5, color:'#64748B', marginBottom:12 }}>Report IT / equipment issues to the support team</p>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
          <div>
            <label style={{ fontSize:10.5, color:'#94A3B8', fontWeight:600, display:'block', marginBottom:4 }}>Category</label>
            <select className={inputCls} value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>
              <option value="hardware">Hardware</option>
              <option value="software">Software</option>
              <option value="network">Network / Internet</option>
              <option value="email">Email / Login</option>
              <option value="printer">Printer</option>
              <option value="access">Access Request</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div>
            <label style={{ fontSize:10.5, color:'#94A3B8', fontWeight:600, display:'block', marginBottom:4 }}>Priority</label>
            <select className={inputCls} value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value })}>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>
          </div>
          <div>
            <label style={{ fontSize:10.5, color:'#94A3B8', fontWeight:600, display:'block', marginBottom:4 }}>Subject</label>
            <input className={inputCls} value={form.subject} placeholder="Brief summary of the issue" onChange={e => setForm({ ...form, subject: e.target.value })} />
          </div>
          <div>
            <label style={{ fontSize:10.5, color:'#94A3B8', fontWeight:600, display:'block', marginBottom:4 }}>Description</label>
            <input className={inputCls} value={form.description} placeholder="What went wrong? Any error messages?" onChange={e => setForm({ ...form, description: e.target.value })} />
          </div>
        </div>
        <div style={{ marginTop:16 }}>
          <button disabled={!form.subject || create.isPending} onClick={() => create.mutate()}
            style={{ display:'inline-flex', alignItems:'center', gap:6, background:form.subject?ACCENT:'rgba(0,0,0,0.08)', color:form.subject?'#fff':'#94A3B8', borderRadius:10, border:'none', padding:'9px 20px', fontWeight:700, fontSize:12.5, cursor:form.subject?'pointer':'not-allowed' }}>
            <Headphones size={15} /> Raise Ticket
          </button>
        </div>
      </div>
      <div style={{ ...GCA, padding:20 }}>
        <span style={STA}>My Tickets</span>
        {tickets.isLoading ? (
          <p style={{ padding:'24px 0', textAlign:'center', fontSize:13, color:'#94A3B8' }}>Loading tickets…</p>
        ) : (
          <Table
            columns={[
              { key: 'ticket_number', label: 'Ticket #' },
              { key: 'subject',  label: 'Subject' },
              { key: 'category', label: 'Category', render: r => <span className="capitalize">{r.category}</span> },
              { key: 'priority', label: 'Priority', render: r => <span className="capitalize">{r.priority}</span> },
              { key: 'created_at', label: 'Raised', render: r => String(r.created_at||'').slice(0,10) },
              { key: 'status', label: 'Status', render: r => <StatusBadge value={r.status} /> },
            ]}
            rows={tickets.data || []}
            empty="You haven't raised any tickets yet"
          />
        )}
      </div>
    </div>
  );
}

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   TIMESHEET TAB — monthly hours from attendance
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
function hoursBetween(inT, outT) {
  if (!inT || !outT) return 0;
  const [ih, im] = String(inT).split(':').map(Number);
  const [oh, om] = String(outT).split(':').map(Number);
  if ([ih, im, oh, om].some(Number.isNaN)) return 0;
  let mins = (oh * 60 + om) - (ih * 60 + im);
  if (mins < 0) mins += 24 * 60; // overnight shift
  return Math.round((mins / 60) * 100) / 100;
}
function TimesheetTab() {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year,  setYear]  = useState(now.getFullYear());
  const GCA = { background:'rgba(255,255,255,0.88)', border:'1px solid rgba(255,255,255,0.95)', borderRadius:16, boxShadow:'0 2px 16px rgba(0,0,0,.055),0 1px 3px rgba(0,0,0,.04)' };
  const STA = { fontSize:10.5, color:'#94A3B8', textTransform:'uppercase', letterSpacing:'0.1em', fontWeight:600, marginBottom:8, display:'block' };
  const att = useQuery({
    queryKey: ['ess-timesheet', month, year],
    queryFn:  () => essAPI.attendance({ month, year }).then(unwrap),
  });
  const rows = useMemo(() => {
    return (att.data || [])
      .map(r => ({ ...r, hours: hoursBetween(r.in_time, r.out_time) }))
      .sort((a, b) => String(a.attendance_date).localeCompare(String(b.attendance_date)));
  }, [att.data]);
  const totalHours  = useMemo(() => Math.round(rows.reduce((s, r) => s + r.hours, 0) * 100) / 100, [rows]);
  const presentDays = rows.filter(r => normaliseStatus(r.status) === 'P').length;
  const shiftMonth = (delta) => {
    let m = month + delta, y = year;
    if (m < 1)  { m = 12; y--; }
    if (m > 12) { m = 1;  y++; }
    setMonth(m); setYear(y);
  };
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
      <div style={{ ...GCA, padding:20 }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
          <div>
            <span style={STA}>My Timesheet</span>
            <p style={{ fontSize:11.5, color:'#64748B' }}>Daily hours derived from your attendance punches</p>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <button onClick={() => shiftMonth(-1)} style={{ background:'rgba(0,0,0,0.04)', border:'1px solid rgba(0,0,0,0.07)', borderRadius:8, padding:'5px 8px', cursor:'pointer', display:'flex', alignItems:'center' }}>
              <ChevronLeft size={15} color="#64748B" />
            </button>
            <span style={{ minWidth:120, textAlign:'center', fontSize:13, fontWeight:700, color:'#1E293B' }}>{MONTH_NAMES[month-1]} {year}</span>
            <button onClick={() => shiftMonth(1)} style={{ background:'rgba(0,0,0,0.04)', border:'1px solid rgba(0,0,0,0.07)', borderRadius:8, padding:'5px 8px', cursor:'pointer', display:'flex', alignItems:'center' }}>
              <ChevronRight size={15} color="#64748B" />
            </button>
          </div>
        </div>

        <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10, marginBottom:16 }}>
          {[
            { label:'Total Hours',   val:totalHours,  color:ACCENT },
            { label:'Present Days',  val:presentDays, color:TEAL },
            { label:'Avg Hours/Day', val:presentDays ? Math.round((totalHours/presentDays)*10)/10 : 0, color:'#1E293B' },
          ].map(({ label, val, color }) => (
            <div key={label} style={{ background:'rgba(47,111,237,0.04)', border:'1px solid rgba(47,111,237,0.08)', borderRadius:12, padding:16 }}>
              <p style={{ fontSize:10.5, fontWeight:600, textTransform:'uppercase', letterSpacing:'0.08em', color:'#94A3B8' }}>{label}</p>
              <p style={{ marginTop:4, fontSize:24, fontWeight:800, color, lineHeight:1, fontVariantNumeric:'tabular-nums' }}>{val}</p>
            </div>
          ))}
        </div>

        {att.isLoading ? (
          <p style={{ padding:'24px 0', textAlign:'center', fontSize:13, color:'#94A3B8' }}>Loading timesheet…</p>
        ) : (
          <Table
            columns={[
              { key: 'attendance_date', label: 'Date', render: r => String(r.attendance_date||'').slice(0,10) },
              { key: 'status', label: 'Status', render: r => <StatusBadge value={r.status} /> },
              { key: 'in_time',  label: 'In',  render: r => r.in_time  ? String(r.in_time).slice(0,5)  : '-' },
              { key: 'out_time', label: 'Out', render: r => r.out_time ? String(r.out_time).slice(0,5) : '-' },
              { key: 'hours', label: 'Hours', render: r => r.hours ? r.hours.toFixed(2) : '-' },
            ]}
            rows={rows}
            empty="No attendance records for this month"
          />
        )}
      </div>
    </div>
  );
}

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   KNOWLEDGE BASE TAB — published company policies
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
function KnowledgeTab() {
  const kb = useQuery({ queryKey: ['ess-knowledge'], queryFn: () => essAPI.knowledge().then(unwrap) });
  const [openId, setOpenId] = useState(null);
  const [search, setSearch] = useState('');
  const GCA = { background:'rgba(255,255,255,0.88)', border:'1px solid rgba(255,255,255,0.95)', borderRadius:16, boxShadow:'0 2px 16px rgba(0,0,0,.055),0 1px 3px rgba(0,0,0,.04)' };
  const STA = { fontSize:10.5, color:'#94A3B8', textTransform:'uppercase', letterSpacing:'0.1em', fontWeight:600, marginBottom:8, display:'block' };
  const docs = kb.data || [];
  const filtered = docs.filter(d => {
    const q = search.toLowerCase();
    return !q || d.title.toLowerCase().includes(q) || String(d.category||'').toLowerCase().includes(q);
  });
  const grouped = useMemo(() => {
    const g = {};
    filtered.forEach(d => { const c = d.category || 'General'; (g[c] = g[c] || []).push(d); });
    return Object.entries(g).sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtered]);
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
      <div style={{ ...GCA, padding:20 }}>
        <span style={STA}>Knowledge Base</span>
        <p style={{ fontSize:11.5, color:'#64748B', marginBottom:12 }}>Company policies, guidelines and procedures</p>
        <div style={{ marginBottom:16, maxWidth:320 }}>
          <input className={inputCls} value={search} onChange={e => setSearch(e.target.value)} placeholder="Search policies…" />
        </div>
        {kb.isLoading ? (
          <p style={{ padding:'24px 0', textAlign:'center', fontSize:13, color:'#94A3B8' }}>Loading…</p>
        ) : !filtered.length ? (
          <p style={{ padding:'32px 0', textAlign:'center', fontSize:13, color:'#94A3B8' }}>No published policies available.</p>
        ) : (
          <div style={{ display:'flex', flexDirection:'column', gap:20 }}>
            {grouped.map(([cat, items]) => (
              <div key={cat}>
                <p style={{ marginBottom:8, fontSize:10.5, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.1em', color:'#94A3B8' }}>{cat}</p>
                <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                  {items.map(d => {
                    const open = openId === d.id;
                    return (
                      <div key={d.id} style={{ borderRadius:12, border:'1px solid rgba(0,0,0,0.07)', background:'rgba(255,255,255,0.7)', overflow:'hidden' }}>
                        <button onClick={() => setOpenId(open ? null : d.id)}
                          style={{ display:'flex', width:'100%', alignItems:'center', justifyContent:'space-between', gap:12, padding:'12px 16px', textAlign:'left', background:'transparent', border:'none', cursor:'pointer' }}>
                          <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                            <BookOpen size={17} style={{ color:ACCENT, flexShrink:0 }} />
                            <div>
                              <p style={{ fontSize:13, fontWeight:600, color:'#1E293B' }}>{d.title}</p>
                              <p style={{ fontSize:11, color:'#94A3B8', marginTop:1 }}>
                                {d.policy_code ? `${d.policy_code} · ` : ''}v{d.version}
                                {d.effective_date ? ` · ${String(d.effective_date).slice(0,10)}` : ''}
                              </p>
                            </div>
                          </div>
                          <ChevronRight size={15} style={{ color:'#94A3B8', transform:open?'rotate(90deg)':'none', transition:'transform 0.2s', flexShrink:0 }} />
                        </button>
                        {open && (
                          <div style={{ borderTop:'1px solid rgba(0,0,0,0.06)', padding:'12px 16px', fontSize:13, lineHeight:1.6, color:'#475569', whiteSpace:'pre-wrap' }}>
                            {d.body}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   ENGAGE TAB — social feed (posts + kudos)
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
function timeAgo(ts) {
  if (!ts) return '';
  const diff = Date.now() - new Date(ts).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(ts).toLocaleDateString();
}
const KUDOS_BADGES = ['Great Work', 'Team Player', 'Innovation', 'Above & Beyond', 'Customer Hero', 'Helping Hand'];
const POST_GROUPS  = ['General', 'Company News', 'Events', 'Appreciations', 'Buy/Sell/Rent'];

function Avatar({ name, photo, size = 40 }) {
  const initials = (name || '?').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
  if (photo) return <img src={photo} alt={name} className="rounded-full object-cover" style={{ width: size, height: size }} />;
  return (
    <div className="flex items-center justify-center rounded-full font-bold text-white"
      style={{ width: size, height: size, fontSize: size * 0.38, background: ACCENT }}>
      {initials}
    </div>
  );
}

function EngageComments({ postId }) {
  const qc = useQueryClient();
  const comments = useQuery({ queryKey: ['ess-engage-comments', postId], queryFn: () => essAPI.engageComments(postId).then(unwrap) });
  const [text, setText] = useState('');
  const add = useMutation({
    mutationFn: () => essAPI.addEngageComment(postId, text),
    onSuccess:  () => { setText(''); qc.invalidateQueries({ queryKey: ['ess-engage-comments', postId] }); qc.invalidateQueries({ queryKey: ['ess-engage'] }); },
  });
  return (
    <div className="mt-3 border-t border-gray-100 pt-3">
      <div className="space-y-3">
        {(comments.data || []).map(c => (
          <div key={c.id} className="flex gap-2">
            <Avatar name={c.author_name} photo={c.author_photo} size={28} />
            <div className="flex-1 rounded-lg bg-gray-50 px-3 py-2">
              <p className="text-xs font-semibold text-gray-800">{c.author_name} <span className="ml-1 font-normal text-gray-400">{timeAgo(c.created_at)}</span></p>
              <p className="text-sm text-gray-700">{c.body}</p>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-2 flex items-center gap-2">
        <input className={inputCls} value={text} placeholder="Write a comment…"
          onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && text.trim()) add.mutate(); }} />
        <button onClick={() => text.trim() && add.mutate()} disabled={add.isPending}
          className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg text-white disabled:opacity-50" style={{ background: ACCENT }}>
          <Send size={15} />
        </button>
      </div>
    </div>
  );
}

function EngageCard({ post }) {
  const qc = useQueryClient();
  const [showComments, setShowComments] = useState(false);
  const react = useMutation({
    mutationFn: () => essAPI.reactEngage(post.id, 'â¤ï¸'),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['ess-engage'] }),
  });
  const liked = Boolean(post.my_reaction);
  const isKudos = post.type === 'kudos';
  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="p-4">
        <div className="flex items-center gap-3">
          <Avatar name={post.author_name} photo={post.author_photo} />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-gray-900">{post.author_name}</p>
            <p className="text-xs text-gray-400">
              {post.group_name ? `${post.group_name} · ` : ''}{timeAgo(post.created_at)}
            </p>
          </div>
          {isKudos && (
            <span className="flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-bold text-amber-700">
              <Sparkles size={12} /> {post.kudos_badge || 'Kudos'}
            </span>
          )}
        </div>

        {isKudos ? (
          <div className="mt-3 rounded-xl border border-blue-100 bg-gradient-to-br from-blue-50 to-teal-50 p-4 text-center">
            <p className="text-sm text-gray-600">
              <span className="font-semibold text-gray-900">{post.author_name}</span> appreciated{' '}
              <span className="font-semibold" style={{ color: ACCENT }}>{post.kudos_to_name}</span>
            </p>
            {post.body && <p className="mt-2 text-sm italic text-gray-700">“{post.body}â€</p>}
          </div>
        ) : (
          <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-gray-800">{post.body}</p>
        )}
      </div>

      <div className="flex items-center gap-4 border-t border-gray-100 px-4 py-2">
        <button onClick={() => react.mutate()} className="flex items-center gap-1.5 text-sm font-medium transition"
          style={{ color: liked ? '#e11d48' : '#64748b' }}>
          <Heart size={16} fill={liked ? '#e11d48' : 'none'} /> {Number(post.reaction_count) || 0}
        </button>
        <button onClick={() => setShowComments(s => !s)} className="flex items-center gap-1.5 text-sm font-medium text-slate-500">
          <MessageSquare size={16} /> {Number(post.comment_count) || 0}
        </button>
      </div>

      {showComments && <div className="px-4 pb-4"><EngageComments postId={post.id} /></div>}
    </div>
  );
}

function EngageTab({ profile }) {
  const qc = useQueryClient();
  const [filter, setFilter] = useState('');
  const [mode, setMode]     = useState('post');
  const [postBody, setPostBody]   = useState('');
  const [postGroup, setPostGroup] = useState('General');
  const [kudosTo, setKudosTo]     = useState('');
  const [kudosBadge, setKudosBadge] = useState('Great Work');
  const [kudosMsg, setKudosMsg]   = useState('');
  const GCA = { background:'rgba(255,255,255,0.88)', border:'1px solid rgba(255,255,255,0.95)', borderRadius:16, boxShadow:'0 2px 16px rgba(0,0,0,.055),0 1px 3px rgba(0,0,0,.04)' };
  const STA = { fontSize:10.5, color:'#94A3B8', textTransform:'uppercase', letterSpacing:'0.1em', fontWeight:600, marginBottom:8, display:'block' };

  const feed       = useQuery({ queryKey: ['ess-engage', filter], queryFn: () => essAPI.engageFeed(filter ? { type: filter } : {}).then(unwrap) });
  const colleagues = useQuery({ queryKey: ['ess-colleagues'], queryFn: () => essAPI.colleagues().then(unwrap), enabled: mode === 'kudos' });

  const create = useMutation({
    mutationFn: () => mode === 'kudos'
      ? essAPI.createEngagePost({ type: 'kudos', kudos_to: kudosTo, kudos_badge: kudosBadge, body: kudosMsg })
      : essAPI.createEngagePost({ type: 'post', body: postBody, group_name: postGroup }),
    onSuccess: () => {
      toast.success(mode === 'kudos' ? 'Kudos given!' : 'Posted!');
      setPostBody(''); setKudosMsg(''); setKudosTo('');
      qc.invalidateQueries({ queryKey: ['ess-engage'] });
    },
    onError: (e) => toast.error(e?.response?.data?.error || 'Failed'),
  });

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
      {/* Composer */}
      <div style={{ ...GCA, overflow:'hidden' }}>
        <div style={{ display:'flex', gap:4, borderBottom:'1px solid rgba(0,0,0,0.06)', padding:8 }}>
          {[['post', 'Write Post', Radio], ['kudos', 'Give Kudos', Award]].map(([m, label, Icon]) => (
            <button key={m} onClick={() => setMode(m)}
              style={{ display:'flex', alignItems:'center', gap:8, borderRadius:8, padding:'6px 16px', fontSize:13, fontWeight:600, border:'none', cursor:'pointer', background:mode===m?ACCENT:'transparent', color:mode===m?'#fff':'#64748B', transition:'all 0.15s' }}>
              <Icon size={15} /> {label}
            </button>
          ))}
        </div>
        <div style={{ padding:16 }}>
          <div style={{ display:'flex', gap:12 }}>
            <Avatar name={profile?.name} photo={profile?.profile_photo_url} />
            <div style={{ flex:1, display:'flex', flexDirection:'column', gap:10 }}>
              {mode === 'post' ? (
                <>
                  <textarea className={inputCls} rows={3} value={postBody} placeholder="Share something with your team…" onChange={e => setPostBody(e.target.value)} />
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:8 }}>
                    <select className={inputCls} style={{ maxWidth:180 }} value={postGroup} onChange={e => setPostGroup(e.target.value)}>
                      {POST_GROUPS.map(g => <option key={g} value={g}>{g}</option>)}
                    </select>
                    <button disabled={!postBody.trim() || create.isPending} onClick={() => create.mutate()}
                      style={{ display:'inline-flex', alignItems:'center', gap:6, background:postBody.trim()?ACCENT:'rgba(0,0,0,0.08)', color:postBody.trim()?'#fff':'#94A3B8', borderRadius:10, border:'none', padding:'8px 18px', fontWeight:700, fontSize:12.5, cursor:postBody.trim()?'pointer':'not-allowed' }}>
                      <Send size={14} /> Post
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                    <div>
                      <label style={{ fontSize:10.5, color:'#94A3B8', fontWeight:600, display:'block', marginBottom:4 }}>Appreciate</label>
                      <select className={inputCls} value={kudosTo} onChange={e => setKudosTo(e.target.value)}>
                        <option value="">Select a colleague…</option>
                        {(colleagues.data || []).map(c => <option key={c.id} value={c.id}>{c.name}{c.designation_name ? ` — ${c.designation_name}` : ''}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={{ fontSize:10.5, color:'#94A3B8', fontWeight:600, display:'block', marginBottom:4 }}>Badge</label>
                      <select className={inputCls} value={kudosBadge} onChange={e => setKudosBadge(e.target.value)}>
                        {KUDOS_BADGES.map(b => <option key={b} value={b}>{b}</option>)}
                      </select>
                    </div>
                  </div>
                  <textarea className={inputCls} rows={2} value={kudosMsg} placeholder="Add a message (optional)…" onChange={e => setKudosMsg(e.target.value)} />
                  <div style={{ display:'flex', justifyContent:'flex-end' }}>
                    <button disabled={!kudosTo || create.isPending} onClick={() => create.mutate()}
                      style={{ display:'inline-flex', alignItems:'center', gap:6, background:kudosTo?ACCENT:'rgba(0,0,0,0.08)', color:kudosTo?'#fff':'#94A3B8', borderRadius:10, border:'none', padding:'8px 18px', fontWeight:700, fontSize:12.5, cursor:kudosTo?'pointer':'not-allowed' }}>
                      <Award size={14} /> Give Kudos
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Filter pills */}
      <div style={{ display:'flex', gap:8 }}>
        {[['', 'All Activities'], ['post', 'Posts'], ['kudos', 'Kudos']].map(([v, label]) => (
          <button key={v} onClick={() => setFilter(v)}
            style={{ borderRadius:99, padding:'5px 16px', fontSize:13, fontWeight:600, border:'1px solid', cursor:'pointer', transition:'all 0.15s', background:filter===v?ACCENT:'rgba(255,255,255,0.88)', color:filter===v?'#fff':'#64748B', borderColor:filter===v?ACCENT:'rgba(0,0,0,0.1)' }}>
            {label}
          </button>
        ))}
      </div>

      {/* Feed */}
      {feed.isLoading ? (
        <p style={{ padding:'32px 0', textAlign:'center', fontSize:13, color:'#94A3B8' }}>Loading feed…</p>
      ) : !(feed.data || []).length ? (
        <div style={{ ...GCA, padding:32, textAlign:'center' }}>
          <p style={{ fontSize:13, color:'#94A3B8' }}>No activity yet. Be the first to post or give kudos!</p>
        </div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
          {(feed.data || []).map(p => <EngageCard key={p.id} post={p} />)}
        </div>
      )}
    </div>
  );
}

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   REIMBURSEMENTS TAB
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
function ReimbursementsTab() {
  const qc = useQueryClient();
  const claims = useQuery({ queryKey: ['ess-reimbursements'], queryFn: () => essAPI.reimbursements().then(unwrap) });
  const [form, setForm] = useState({ expense_type: 'travel', amount: '', description: '' });
  const GCA = { background:'rgba(255,255,255,0.88)', border:'1px solid rgba(255,255,255,0.95)', borderRadius:16, boxShadow:'0 2px 16px rgba(0,0,0,.055),0 1px 3px rgba(0,0,0,.04)' };
  const STA = { fontSize:10.5, color:'#94A3B8', textTransform:'uppercase', letterSpacing:'0.1em', fontWeight:600, marginBottom:8, display:'block' };
  const submit = useMutation({
    mutationFn: () => essAPI.createReimbursement(form),
    onSuccess:  () => { toast.success('Claim submitted'); setForm({ expense_type: 'travel', amount: '', description: '' }); qc.invalidateQueries({ queryKey: ['ess-reimbursements'] }); },
    onError:    (e) => toast.error(e?.response?.data?.error || 'Failed'),
  });
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
      <div style={{ ...GCA, padding:20 }}>
        <span style={STA}>Submit a Reimbursement Claim</span>
        <p style={{ fontSize:11.5, color:'#64748B', marginBottom:12 }}>Travel, food, supplies and other work expenses</p>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12 }}>
          <div>
            <label style={{ fontSize:10.5, color:'#94A3B8', fontWeight:600, display:'block', marginBottom:4 }}>Expense Type</label>
            <select className={inputCls} value={form.expense_type} onChange={e => setForm({ ...form, expense_type: e.target.value })}>
              <option value="travel">Travel</option>
              <option value="food">Food</option>
              <option value="accommodation">Accommodation</option>
              <option value="supplies">Supplies</option>
              <option value="fuel">Fuel</option>
              <option value="general">General</option>
            </select>
          </div>
          <div>
            <label style={{ fontSize:10.5, color:'#94A3B8', fontWeight:600, display:'block', marginBottom:4 }}>Amount (₹)</label>
            <input type="number" className={inputCls} value={form.amount} placeholder="0.00" onChange={e => setForm({ ...form, amount: e.target.value })} />
          </div>
          <div>
            <label style={{ fontSize:10.5, color:'#94A3B8', fontWeight:600, display:'block', marginBottom:4 }}>Description</label>
            <input className={inputCls} value={form.description} placeholder="What was it for?" onChange={e => setForm({ ...form, description: e.target.value })} />
          </div>
        </div>
        <div style={{ marginTop:16 }}>
          <button disabled={!form.amount || submit.isPending} onClick={() => submit.mutate()}
            style={{ display:'inline-flex', alignItems:'center', gap:6, background:form.amount?ACCENT:'rgba(0,0,0,0.08)', color:form.amount?'#fff':'#94A3B8', borderRadius:10, border:'none', padding:'9px 20px', fontWeight:700, fontSize:12.5, cursor:form.amount?'pointer':'not-allowed' }}>
            <Receipt size={16} /> Submit Claim
          </button>
        </div>
      </div>
      <div style={{ ...GCA, padding:20 }}>
        <span style={STA}>My Claims</span>
        <Table
          columns={[
            { key: 'claim_date',   label: 'Date', render: r => String(r.claim_date||'').slice(0,10) },
            { key: 'expense_type', label: 'Type', render: r => <span className="capitalize">{r.expense_type}</span> },
            { key: 'description',  label: 'Description' },
            { key: 'amount',       label: 'Amount', render: r => `₹${Number(r.amount||0).toLocaleString('en-IN')}` },
            { key: 'status',       label: 'Status', render: r => <StatusBadge value={r.status} /> },
          ]}
          rows={claims.data || []}
          empty="No reimbursement claims yet"
        />
      </div>
    </div>
  );
}

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   LOANS & ADVANCES TAB
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
function LoansTab() {
  const qc = useQueryClient();
  const loans = useQuery({ queryKey: ['ess-loans'], queryFn: () => essAPI.loans().then(unwrap) });
  const [form, setForm] = useState({ loan_type: 'advance', amount: '', reason: '' });
  const GCA = { background:'rgba(255,255,255,0.88)', border:'1px solid rgba(255,255,255,0.95)', borderRadius:16, boxShadow:'0 2px 16px rgba(0,0,0,.055),0 1px 3px rgba(0,0,0,.04)' };
  const STA = { fontSize:10.5, color:'#94A3B8', textTransform:'uppercase', letterSpacing:'0.1em', fontWeight:600, marginBottom:8, display:'block' };
  const submit = useMutation({
    mutationFn: () => essAPI.requestLoan(form),
    onSuccess:  () => { toast.success('Request submitted'); setForm({ loan_type: 'advance', amount: '', reason: '' }); qc.invalidateQueries({ queryKey: ['ess-loans'] }); },
    onError:    (e) => toast.error(e?.response?.data?.error || 'Failed'),
  });
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
      <div style={{ ...GCA, padding:20 }}>
        <span style={STA}>Request a Loan / Advance</span>
        <p style={{ fontSize:11.5, color:'#64748B', marginBottom:12 }}>Salary advances and staff loans (subject to HR approval)</p>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12 }}>
          <div>
            <label style={{ fontSize:10.5, color:'#94A3B8', fontWeight:600, display:'block', marginBottom:4 }}>Type</label>
            <select className={inputCls} value={form.loan_type} onChange={e => setForm({ ...form, loan_type: e.target.value })}>
              <option value="advance">Salary Advance</option>
              <option value="personal">Personal Loan</option>
              <option value="emergency">Emergency Loan</option>
            </select>
          </div>
          <div>
            <label style={{ fontSize:10.5, color:'#94A3B8', fontWeight:600, display:'block', marginBottom:4 }}>Amount (₹)</label>
            <input type="number" className={inputCls} value={form.amount} placeholder="0.00" onChange={e => setForm({ ...form, amount: e.target.value })} />
          </div>
          <div>
            <label style={{ fontSize:10.5, color:'#94A3B8', fontWeight:600, display:'block', marginBottom:4 }}>Reason</label>
            <input className={inputCls} value={form.reason} placeholder="Purpose of the request" onChange={e => setForm({ ...form, reason: e.target.value })} />
          </div>
        </div>
        <div style={{ marginTop:16 }}>
          <button disabled={!form.amount || submit.isPending} onClick={() => submit.mutate()}
            style={{ display:'inline-flex', alignItems:'center', gap:6, background:form.amount?ACCENT:'rgba(0,0,0,0.08)', color:form.amount?'#fff':'#94A3B8', borderRadius:10, border:'none', padding:'9px 20px', fontWeight:700, fontSize:12.5, cursor:form.amount?'pointer':'not-allowed' }}>
            <Wallet size={16} /> Submit Request
          </button>
        </div>
      </div>
      <div style={{ ...GCA, padding:20 }}>
        <span style={STA}>My Loans & Advances</span>
        <Table
          columns={[
            { key: 'requested_date', label: 'Requested', render: r => String(r.requested_date||'').slice(0,10) },
            { key: 'loan_type',   label: 'Type', render: r => <span className="capitalize">{r.loan_type}</span> },
            { key: 'amount',      label: 'Amount', render: r => `₹${Number(r.amount||0).toLocaleString('en-IN')}` },
            { key: 'balance_amount', label: 'Balance', render: r => r.status === 'disbursed' || Number(r.balance_amount) ? `₹${Number(r.balance_amount||0).toLocaleString('en-IN')}` : '-' },
            { key: 'status',      label: 'Status', render: r => <StatusBadge value={r.status} /> },
          ]}
          rows={loans.data || []}
          empty="No loan or advance requests yet"
        />
      </div>
    </div>
  );
}

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   COMING SOON PLACEHOLDER
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
function ComingSoon({ label }) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gray-100">
          <Clock size={28} className="text-gray-400" />
        </div>
        <p className="text-lg font-bold text-gray-400">{label}</p>
        <p className="mt-1 text-sm text-gray-300">This section is under development</p>
      </div>
    </div>
  );
}

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   ROOT PAGE
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
const FUNCTIONAL_TABS = new Set(['dashboard','engage','profile','attendance','leave','payslips','reimbursement','loans','documents','hr-requests','manager','training','timesheet','assets','helpdesk','knowledge']);

export default function ESSPortalPage() {
  const now     = new Date();
  const [active, setActive] = useState('dashboard');

  const summary = useQuery({
    queryKey: ['ess-summary'],
    queryFn:  () => essAPI.summary({ month: now.getMonth() + 1, year: now.getFullYear() }).then(r => r.data.data),
  });
  const userId = summary.data?.profile?.id;

  const notifications = useQuery({ queryKey: ['ess-notifications'], queryFn: () => essAPI.notifications().then(unwrap) });

  const serviceRequests = useQuery({
    queryKey: ['ess-hr-requests', userId],
    queryFn:  () => hrAdvancedAPI.listServiceRequests({ user_id: userId }).then(unwrap),
    enabled:  Boolean(userId),
  });

  const policies = useQuery({
    queryKey: ['ess-policies'],
    queryFn:  () => hrAdvancedAPI.listPolicies({ status: 'published' }).then(unwrap),
  });

  const balances = useQuery({
    queryKey: ['ess-leave-balances-bootstrap'],
    queryFn:  () => essAPI.leaveBalances().then(unwrap),
  });

  const derivedLeaveTypes = useMemo(
    () => (balances.data || []).map(b => ({ id: b.leave_type_id, name: b.leave_type_name })),
    [balances.data],
  );

  const profile = summary.data?.profile || {};

  const navLabel = TAB_ITEMS.find(i => i.id === active)?.label || active;

  return (
    <div className="flex min-h-screen" style={{ backgroundColor: BG, fontFamily: "'Geist Variable', system-ui, sans-serif" }}>
      {/* Desktop vertical sidebar */}
      <ESSSidebar active={active} setActive={setActive} />

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile horizontal tab bar (hidden on desktop — sidebar covers it) */}
        <ESSTabNav active={active} setActive={setActive} />

        {/* Page content */}
        <div className="flex-1 p-5">
          {active === 'dashboard' && (
            <DashboardTab
              summary={summary.data || {}}
              balances={balances.data || []}
              serviceRequests={serviceRequests.data || []}
              notifications={notifications.data || []}
              profile={profile}
              setActive={setActive}
            />
          )}
          {active === 'profile'     && <ProfileTab profile={profile} balances={balances.data || []} />}
          {active === 'attendance'  && <AttendanceTab leaveTypes={derivedLeaveTypes} />}
          {active === 'leave'       && <LeaveTab leaveTypes={derivedLeaveTypes} />}
          {active === 'payslips'    && <PayslipsTab />}
          {active === 'documents'   && <DocumentsTab policies={policies.data || []} userId={userId} />}
          {active === 'hr-requests' && <HRRequestsTab serviceRequests={serviceRequests.data || []} />}
          {active === 'manager'     && <ManagerDeskTab />}
          {active === 'training'    && <TrainingTab />}
          {active === 'timesheet'   && <TimesheetTab />}
          {active === 'assets'      && <AssetsTab />}
          {active === 'helpdesk'    && <HelpdeskTab />}
          {active === 'knowledge'   && <KnowledgeTab />}
          {active === 'engage'      && <EngageTab profile={profile} />}
          {active === 'reimbursement' && <ReimbursementsTab />}
          {active === 'loans'       && <LoansTab />}
          {!FUNCTIONAL_TABS.has(active) && <ComingSoon label={navLabel} />}
        </div>
      </div>
    </div>
  );
}
