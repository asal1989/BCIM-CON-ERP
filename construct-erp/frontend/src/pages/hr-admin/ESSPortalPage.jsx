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

  // Holiday dates set from hr_holidays (via summary API)
  const holidayDateSet = useMemo(() => new Set((summary?.attendance?.holiday_dates || [])), [summary]);

  // Monthly dot grid
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const monthlyDots = useMemo(() => {
    const yr = now.getFullYear(), mo = now.getMonth();
    const dim = new Date(yr, mo + 1, 0).getDate();
    const result = [];
    for (let d = 1; d <= dim; d++) {
      const ds = `${yr}-${String(mo+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      const wday = new Date(ds).getDay();
      const isWknd = wday===0||wday===6;
      const isHoliday = holidayDateSet.has(ds);
      const isPast = ds < todayStr;
      const code = statusMap[ds]?.code || (isHoliday ? 'H' : isWknd ? 'WO' : isPast ? 'A' : null);
      result.push({ d, ds, code, isWknd, isToday: ds===todayStr });
    }
    return result;
  }, [statusMap, todayStr, holidayDateSet]);

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

  /* ── design tokens (dashboard only) ── */
  const T = {
    bg:'#F8FAFC', card:'#FFFFFF', bdr:'#E5E7EB',
    t1:'#0F172A', t2:'#334155', t3:'#64748B', t4:'#94A3B8',
    pri:'#2563EB', purp:'#7C3AED', cyan:'#06B6D4',
    suc:'#22C55E', warn:'#F59E0B', dan:'#EF4444',
    sh:'0 1px 3px rgba(0,0,0,.06),0 1px 2px rgba(0,0,0,.04)',
    shm:'0 4px 16px rgba(0,0,0,.08),0 2px 6px rgba(0,0,0,.04)',
  };
  const Card = (extra={}) => ({
    background:T.card, borderRadius:20, border:`1px solid ${T.bdr}`,
    boxShadow:T.sh, ...extra,
  });

  return (
    <div style={{ display:'flex', flexDirection:'column', background:T.bg, minHeight:'100%' }}>

      {/* HERO BANNER */}
      <div style={{ background:'linear-gradient(145deg,#0A0F1E 0%,#0F172A 20%,#1E1B4B 55%,#1D4ED8 100%)', position:'relative', overflow:'hidden', padding:'28px 28px 48px' }}>
        {/* Aurora mesh overlay */}
        <div style={{ position:'absolute',inset:0,pointerEvents:'none',background:'radial-gradient(ellipse 70% 60% at 60% 0%,rgba(99,102,241,.22),transparent),radial-gradient(ellipse 50% 70% at 100% 60%,rgba(139,92,246,.16),transparent),radial-gradient(ellipse 60% 50% at 0% 80%,rgba(29,78,216,.18),transparent)' }} />
        {/* Dot grid */}
        <div style={{ position:'absolute',inset:0,pointerEvents:'none',backgroundImage:'radial-gradient(rgba(255,255,255,.055) 1px,transparent 1px)',backgroundSize:'24px 24px' }} />

        <div style={{ position:'relative',zIndex:1,display:'flex',alignItems:'center',gap:20,flexWrap:'wrap' }}>
          {/* Spinning avatar ring */}
          <div style={{ position:'relative',width:76,height:76,flexShrink:0 }}>
            <div style={{ position:'absolute',inset:-4,borderRadius:'50%',background:'conic-gradient(from 0deg,#7C3AED,#2563EB,#06B6D4,#7C3AED)',animation:'ess-spin 6s linear infinite' }} />
            <div style={{ position:'absolute',inset:2,borderRadius:'50%',background:'#0F172A' }} />
            {profile?.profile_photo_url
              ? <img src={profile.profile_photo_url} alt="" style={{ position:'absolute',inset:6,borderRadius:'50%',objectFit:'cover',width:'calc(100% - 12px)',height:'calc(100% - 12px)' }} />
              : <div style={{ position:'absolute',inset:6,borderRadius:'50%',background:'linear-gradient(135deg,#1E1B4B,#2563EB)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:22,fontWeight:900,color:'#fff' }}>{initials}</div>
            }
            <div style={{ position:'absolute',bottom:3,right:3,width:14,height:14,borderRadius:'50%',background:'#22C55E',border:'2.5px solid #0F172A',zIndex:2 }} />
          </div>

          {/* Name + meta */}
          <div style={{ flex:1,minWidth:200 }}>
            <div style={{ display:'flex',alignItems:'center',gap:7,marginBottom:6,flexWrap:'wrap' }}>
              <span style={{ fontSize:10.5,fontWeight:700,color:'rgba(255,255,255,.5)',textTransform:'uppercase',letterSpacing:'.08em' }}>{greeting}</span>
              <span style={{ background:'rgba(34,197,94,.18)',color:'#4ADE80',border:'1px solid rgba(34,197,94,.3)',fontSize:10.5,fontWeight:700,padding:'2px 9px',borderRadius:20 }}>Active</span>
              {profile?.employee_id && <span style={{ background:'rgba(255,255,255,.1)',color:'rgba(255,255,255,.7)',border:'1px solid rgba(255,255,255,.15)',fontSize:10.5,fontWeight:700,padding:'2px 9px',borderRadius:20,fontFamily:'ui-monospace,monospace' }}>{profile.employee_id}</span>}
            </div>
            <div style={{ fontSize:26,fontWeight:800,color:'#fff',letterSpacing:'-.03em',lineHeight:1.1,marginBottom:6 }}>{profile?.name||'Employee'}</div>
            <div style={{ display:'flex',flexWrap:'wrap',gap:'3px 14px',fontSize:12,color:'rgba(255,255,255,.55)' }}>
              {profile?.designation && <span>Role: {profile.designation}</span>}
              {profile?.department_name && <span>Dept: {profile.department_name}</span>}
              {profile?.work_location && <span>Location: {profile.work_location}</span>}
              <span>{now.toLocaleDateString('en-IN',{weekday:'long',day:'2-digit',month:'long',year:'numeric'})}</span>
            </div>
          </div>

          {/* Week strip */}
          <div style={{ display:'flex',alignItems:'center',gap:6,flexShrink:0 }}>
            {weekDays.map(({ name, ds, isToday, isWknd, rec }) => {
              const code = rec?.code;
              const inTime = rec?.inTime ? String(rec.inTime).slice(0,5) : null;
              const CM = { P:'#10B981',A:'#EF4444',HD:'#F59E0B',L:'#8B5CF6',H:'#6366F1',WO:'rgba(255,255,255,.15)' };
              const boxBg = code ? `${CM[code]}22` : isToday ? 'rgba(245,158,11,.15)' : 'rgba(255,255,255,.06)';
              const boxBdr = code ? `1px solid ${CM[code]}44` : isToday ? '1px solid rgba(245,158,11,.4)' : '1px solid rgba(255,255,255,.12)';
              const boxClr = code ? CM[code] : isToday ? '#F59E0B' : 'rgba(255,255,255,.35)';
              const label = code==='P'?'v':code==='A'?'x':code==='H'?'H':code==='L'?'L':code==='HD'?'h':isToday?'-':'';
              return (
                <div key={ds} style={{ display:'flex',flexDirection:'column',alignItems:'center',gap:4 }}>
                  <div style={{ fontSize:9,color:'rgba(255,255,255,.4)',textTransform:'uppercase',letterSpacing:'.04em' }}>{name}</div>
                  <div style={{ width:36,height:36,borderRadius:10,display:'flex',alignItems:'center',justifyContent:'center',fontSize:13,fontWeight:700,background:boxBg,border:boxBdr,color:boxClr }}>{label}</div>
                  <div style={{ fontSize:8.5,color:code==='P'?'#4ADE80':isToday?'#F59E0B':'rgba(255,255,255,.25)' }}>{inTime||(isToday?'Today':isWknd?'Off':'--')}</div>
                </div>
              );
            })}
          </div>

          {/* Hero CTAs */}
          <div style={{ display:'flex',flexDirection:'column',gap:8,flexShrink:0 }}>
            {!todayRec?.code && <div style={{ background:'rgba(245,158,11,.15)',border:'1px solid rgba(245,158,11,.3)',color:'#F59E0B',fontSize:11,fontWeight:600,padding:'4px 12px',borderRadius:20,textAlign:'center' }}>Not marked today</div>}
            <button onClick={() => setActive('attendance')}
              style={{ background:'linear-gradient(135deg,#7C3AED,#2563EB)',color:'#fff',fontSize:13,fontWeight:700,padding:'10px 20px',borderRadius:10,border:'none',cursor:'pointer',boxShadow:'0 4px 16px rgba(37,99,235,.4)',whiteSpace:'nowrap',transition:'.2s' }}
              onMouseEnter={e=>{e.currentTarget.style.transform='translateY(-1px)';e.currentTarget.style.boxShadow='0 6px 20px rgba(37,99,235,.5)';}}
              onMouseLeave={e=>{e.currentTarget.style.transform='';e.currentTarget.style.boxShadow='0 4px 16px rgba(37,99,235,.4)';}}>
              {todayRec?.code ? `Marked · ${todayInTime||todayStatusLabel[todayRec.code]||''} ->` : 'View Attendance ->'}
            </button>
            <button onClick={() => setActive('leave')}
              style={{ background:'rgba(255,255,255,.1)',color:'rgba(255,255,255,.8)',border:'1px solid rgba(255,255,255,.2)',fontSize:12,fontWeight:600,padding:'8px 18px',borderRadius:10,cursor:'pointer',whiteSpace:'nowrap',transition:'.15s' }}
              onMouseEnter={e=>{e.currentTarget.style.background='rgba(255,255,255,.18)';}}
              onMouseLeave={e=>{e.currentTarget.style.background='rgba(255,255,255,.1)';}}>
              Apply Leave
            </button>
          </div>
        </div>

        {/* Wave divider into page bg */}
        <svg style={{ position:'absolute',bottom:0,left:0,right:0,width:'100%',display:'block',pointerEvents:'none' }} viewBox="0 0 1440 36" preserveAspectRatio="none">
          <path d="M0,18L60,15C120,12,240,6,360,8C480,10,600,20,720,21C840,23,960,17,1080,13C1200,9,1320,8,1380,8L1440,7V36H0Z" fill="#F8FAFC"/>
        </svg>
      </div>

      {/* KPI STRIP */}
      <div style={{ padding:'0 24px', position:'relative', zIndex:10, marginTop:'-2px' }}>
        <div style={{ display:'grid',gridTemplateColumns:'repeat(6,1fr)',background:T.card,borderRadius:16,border:`1px solid ${T.bdr}`,boxShadow:'0 4px 20px rgba(0,0,0,.07),0 2px 6px rgba(0,0,0,.04)',overflow:'hidden' }}>
          {[
            { icon:'ID', label:'Employee ID',   val:profile?.employee_id||'--',  sub:'',                                                  mono:true,  clr:T.t1 },
            { icon:'%',  label:'Attendance',    val:`${attPct}%`,                 sub:`${presentDays}/${workDays} days`,                    mono:false, clr:'#059669' },
            { icon:'L',  label:'Leave Balance', val:`${Number(totalBalance).toFixed(1)}d`, sub:'Casual + Earned',                          mono:false, clr:'#7C3AED' },
            { icon:'Rs', label:'Net Pay',       val:payroll?.net_pay?`Rs.${Number(payroll.net_pay).toLocaleString('en-IN')}`:'--',          sub:payroll?.month?`${MONTH_NAMES[(payroll.month||1)-1]} ${payroll.year}`:'Not processed', mono:false, clr:'#D97706' },
            { icon:'!',  label:'Pending',       val:pendingTotal,                 sub:`${pendingLeave} leave · ${pendingCorr} reg.`,         mono:false, clr:pendingTotal>0?'#EF4444':'#059669' },
            { icon:'D',  label:'Work Days',     val:attendance.working_days??'--', sub:`${presentDays} present`,                            mono:false, clr:'#2563EB' },
          ].map(({ icon,label,val,sub,mono,clr },i) => (
            <div key={label} style={{ padding:'14px 16px',borderRight:i<5?`1px solid ${T.bdr}`:undefined,transition:'.15s',cursor:'default' }}
              onMouseEnter={e=>{e.currentTarget.style.background='rgba(37,99,235,.03)';}}
              onMouseLeave={e=>{e.currentTarget.style.background='';}}
            >
              <div style={{ fontSize:10.5,fontWeight:700,color:T.t4,textTransform:'uppercase',letterSpacing:'.07em',marginBottom:5 }}>{label}</div>
              <div style={{ fontSize:mono?13:20,fontWeight:800,color:clr,letterSpacing:'-.02em',fontVariantNumeric:'tabular-nums',fontFamily:mono?'ui-monospace,monospace':undefined,lineHeight:1 }}>{val}</div>
              {sub && <div style={{ fontSize:11,color:T.t3,marginTop:3 }}>{sub}</div>}
            </div>
          ))}
        </div>
      </div>

      {/* MAIN CONTENT GRID */}
      <div style={{ padding:'20px 24px 32px', display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:16 }}>

        {/* LEFT COLUMN */}
        <div style={{ display:'flex',flexDirection:'column',gap:16 }}>

          {/* Mini Calendar */}
          <div style={{ ...Card(), overflow:'hidden' }}>
            <div style={{ padding:'14px 18px',borderBottom:`1px solid ${T.bdr}`,display:'flex',justifyContent:'space-between',alignItems:'center' }}>
              <div>
                <div style={{ fontSize:14,fontWeight:700,color:T.t1 }}>Calendar</div>
                <div style={{ fontSize:11,color:T.t4,marginTop:1 }}>{MONTH_NAMES[calMonth]} {calYear}</div>
              </div>
              <div style={{ display:'flex',gap:4,alignItems:'center' }}>
                <button onClick={prevMonth} style={{ width:26,height:26,borderRadius:7,border:`1px solid ${T.bdr}`,background:T.card,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center' }}><ChevronLeft size={12} /></button>
                <button onClick={nextMonth} style={{ width:26,height:26,borderRadius:7,border:`1px solid ${T.bdr}`,background:T.card,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center' }}><ChevronRight size={12} /></button>
                <button onClick={() => { setCalMonth(now.getMonth()); setCalYear(now.getFullYear()); }} style={{ fontSize:10.5,fontWeight:600,color:T.pri,background:'none',border:'none',cursor:'pointer',padding:'0 4px' }}>Today</button>
              </div>
            </div>
            <div style={{ padding:'12px 14px' }}>
              <div style={{ display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:1,marginBottom:4 }}>
                {DAYS_OF_WEEK.map(d => <div key={d} style={{ fontSize:9.5,color:T.t4,textAlign:'center',fontWeight:700,textTransform:'uppercase',padding:'3px 0' }}>{d}</div>)}
              </div>
              <div style={{ display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:1 }}>
                {cells.map((day,idx) => {
                  if (!day) return <div key={`e-${idx}`} />;
                  const ds = fmtCell(day);
                  const code = statusMap[ds]?.code;
                  const isToday = ds === todayStr;
                  const isWknd = new Date(ds).getDay()===0||new Date(ds).getDay()===6;
                  const dotCal = { P:'#2563EB',A:'#EF4444',HD:'#F59E0B',L:'#8B5CF6',H:'#22C55E' };
                  return (
                    <div key={day} style={{ display:'flex',flexDirection:'column',alignItems:'center',padding:'2px 0' }}>
                      <div style={{ width:26,height:26,borderRadius:8,display:'flex',alignItems:'center',justifyContent:'center',fontSize:11.5,fontWeight:isToday?700:400,background:isToday?'linear-gradient(135deg,#7C3AED,#2563EB)':'transparent',color:isToday?'#fff':isWknd?'#D1D5DB':T.t2,boxShadow:isToday?'0 3px 10px rgba(37,99,235,.4)':undefined }}>
                        {day}
                      </div>
                      {code && !isWknd && <div style={{ width:3,height:3,borderRadius:'50%',background:dotCal[code]||T.t4,marginTop:1 }} />}
                    </div>
                  );
                })}
              </div>
              <div style={{ display:'flex',flexWrap:'wrap',gap:'5px 10px',marginTop:10 }}>
                {[['Present','#2563EB'],['Absent','#EF4444'],['Leave','#8B5CF6'],['Holiday','#22C55E']].map(([l,c]) => (
                  <div key={l} style={{ display:'flex',alignItems:'center',gap:4,fontSize:10,color:T.t3 }}>
                    <div style={{ width:6,height:6,borderRadius:'50%',background:c }} />{l}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Monthly attendance heat grid */}
          <div style={{ ...Card(), padding:'16px 18px' }}>
            <div style={{ fontSize:11,fontWeight:700,color:T.t4,textTransform:'uppercase',letterSpacing:'.07em',marginBottom:10 }}>{MONTH_NAMES[now.getMonth()]} {now.getFullYear()} Attendance</div>
            <div style={{ display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:6,marginBottom:10 }}>
              {[
                { label:'Present', val:attendance.present??0,   color:'#059669' },
                { label:'Absent',  val:attendance.absent??0,    color:'#DC2626' },
                { label:'Half Day',val:attendance.half_day??0,  color:'#D97706' },
                { label:'Holiday', val:attendance.holidays_in_month??0, color:'#4F46E5' },
              ].map(({ label,val,color }) => (
                <div key={label} style={{ textAlign:'center',padding:'8px 4px',background:T.bg,borderRadius:10,border:`1px solid ${T.bdr}` }}>
                  <div style={{ fontSize:18,fontWeight:800,color,lineHeight:1 }}>{val}</div>
                  <div style={{ fontSize:9.5,color:T.t4,marginTop:2 }}>{label}</div>
                </div>
              ))}
            </div>
            <div style={{ display:'grid',gridTemplateColumns:'repeat(11,1fr)',gap:3 }}>
              {monthlyDots.map(({ ds,code,isToday }) => {
                const BG = { P:'rgba(37,99,235,.15)',A:'rgba(239,68,68,.12)',L:'rgba(139,92,246,.12)',H:'rgba(34,197,94,.12)',HD:'rgba(245,158,11,.12)',WO:'rgba(0,0,0,.04)' };
                const BD = { P:'rgba(37,99,235,.35)',A:'rgba(239,68,68,.3)',L:'rgba(139,92,246,.3)',H:'rgba(34,197,94,.3)',HD:'rgba(245,158,11,.3)',WO:'rgba(0,0,0,.07)' };
                return <div key={ds} title={`${ds}: ${code||'--'}`} style={{ aspectRatio:'1',borderRadius:4,background:BG[code]||'rgba(0,0,0,.02)',border:`1px solid ${BD[code]||'rgba(0,0,0,.04)'}`,outline:isToday?`2px solid ${T.pri}`:undefined,outlineOffset:isToday?1:undefined }} />;
              })}
            </div>
          </div>

        </div>

        {/* CENTER COLUMN */}
        <div style={{ display:'flex',flexDirection:'column',gap:16 }}>

          {/* Quick Actions */}
          <div style={{ ...Card(), padding:'16px 18px' }}>
            <div style={{ fontSize:11,fontWeight:700,color:T.t4,textTransform:'uppercase',letterSpacing:'.07em',marginBottom:12 }}>Quick Actions</div>
            <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:8 }}>
              {quickActions.slice(0,6).map(({ label,Icon,tab,bg,fg }) => (
                <button key={label} onClick={() => tab && setActive(tab)}
                  style={{ display:'flex',alignItems:'center',gap:9,padding:'11px 12px',background:T.bg,border:`1px solid ${T.bdr}`,borderRadius:12,cursor:'pointer',textAlign:'left',transition:'.15s' }}
                  onMouseEnter={e=>{e.currentTarget.style.background='rgba(37,99,235,.04)';e.currentTarget.style.borderColor='rgba(37,99,235,.25)';e.currentTarget.style.transform='translateY(-1px)';e.currentTarget.style.boxShadow=T.shm;}}
                  onMouseLeave={e=>{e.currentTarget.style.background=T.bg;e.currentTarget.style.borderColor=T.bdr;e.currentTarget.style.transform='';e.currentTarget.style.boxShadow='';}}
                >
                  <div style={{ width:30,height:30,borderRadius:8,background:bg,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,border:`1px solid ${fg}28` }}>
                    <Icon size={14} style={{ color:fg }} />
                  </div>
                  <span style={{ fontSize:12,fontWeight:600,color:T.t2,lineHeight:1.2 }}>{label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Pending Actions */}
          {(!todayRec?.code || pendingCorr > 0 || pendingLeave > 0) && (
            <div style={{ ...Card(), padding:'16px 18px' }}>
              <div style={{ fontSize:11,fontWeight:700,color:T.t4,textTransform:'uppercase',letterSpacing:'.07em',marginBottom:10 }}>Pending Actions</div>
              <div style={{ display:'flex',flexDirection:'column',gap:8 }}>
                {!todayRec?.code && (
                  <div style={{ display:'flex',alignItems:'center',gap:10,padding:'10px 12px',borderRadius:12,border:'1px solid rgba(245,158,11,.25)',background:'rgba(245,158,11,.05)' }}>
                    <span style={{ fontSize:16 }}>!</span>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:12.5,fontWeight:600,color:T.t1 }}>Mark today&apos;s attendance</div>
                      <div style={{ fontSize:11,color:T.t4,marginTop:1 }}>Not yet checked in</div>
                    </div>
                    <button onClick={() => setActive('attendance')} style={{ fontSize:11,fontWeight:700,color:'#D97706',background:'none',border:'none',cursor:'pointer' }}>Mark</button>
                  </div>
                )}
                {pendingCorr > 0 && (
                  <div style={{ display:'flex',alignItems:'center',gap:10,padding:'10px 12px',borderRadius:12,border:`1px solid ${T.pri}22`,background:`${T.pri}06` }}>
                    <span style={{ fontSize:16 }}>R</span>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:12.5,fontWeight:600,color:T.t1 }}>{pendingCorr} regularization{pendingCorr>1?'s':''} pending</div>
                      <div style={{ fontSize:11,color:T.t4,marginTop:1 }}>Awaiting approval</div>
                    </div>
                    <button onClick={() => setActive('attendance')} style={{ fontSize:11,fontWeight:700,color:T.pri,background:'none',border:'none',cursor:'pointer' }}>View</button>
                  </div>
                )}
                {pendingLeave > 0 && (
                  <div style={{ display:'flex',alignItems:'center',gap:10,padding:'10px 12px',borderRadius:12,border:'1px solid rgba(139,92,246,.2)',background:'rgba(139,92,246,.04)' }}>
                    <span style={{ fontSize:16 }}>L</span>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:12.5,fontWeight:600,color:T.t1 }}>{pendingLeave} leave request{pendingLeave>1?'s':''} pending</div>
                      <div style={{ fontSize:11,color:T.t4,marginTop:1 }}>Awaiting manager approval</div>
                    </div>
                    <button onClick={() => setActive('leave')} style={{ fontSize:11,fontWeight:700,color:'#7C3AED',background:'none',border:'none',cursor:'pointer' }}>View</button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Leave Balance Radials */}
          <div style={{ ...Card(), padding:'16px 18px' }}>
            <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14 }}>
              <div style={{ fontSize:11,fontWeight:700,color:T.t4,textTransform:'uppercase',letterSpacing:'.07em' }}>Leave Balance</div>
              <button onClick={() => setActive('leave')} style={{ fontSize:11,fontWeight:600,color:T.pri,background:'none',border:'none',cursor:'pointer' }}>Apply Leave</button>
            </div>
            <div style={{ display:'flex',justifyContent:'space-around',flexWrap:'wrap',gap:8 }}>
              {(balances||[]).slice(0,4).map((b,i) => {
                const cols = [T.pri,'#06B6D4','#22C55E','#F59E0B'];
                const val = Number(b.closing_balance||0);
                const circ = 2*Math.PI*28;
                const fill = circ * Math.min(1, val / 20);
                const c = cols[i] || T.pri;
                return (
                  <div key={b.leave_type_name} style={{ display:'flex',flexDirection:'column',alignItems:'center',gap:4 }}>
                    <svg width="64" height="64" viewBox="0 0 64 64">
                      <circle cx="32" cy="32" r="28" fill="none" stroke={`${c}1A`} strokeWidth="6"/>
                      <circle cx="32" cy="32" r="28" fill="none" stroke={c} strokeWidth="6"
                        strokeDasharray={`${fill} ${circ}`} strokeLinecap="round" transform="rotate(-90 32 32)"/>
                      <text x="32" y="37" textAnchor="middle" fontSize="13" fontWeight="800" fill={c}>{Number(val).toFixed(0)}</text>
                    </svg>
                    <div style={{ fontSize:10,fontWeight:600,color:T.t3,textAlign:'center',maxWidth:56,lineHeight:1.2 }}>{(b.leave_type_name||'').replace('Leave','').trim()}</div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Recent Leave Requests */}
          <div style={{ ...Card(), padding:'16px 18px' }}>
            <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12 }}>
              <div style={{ fontSize:11,fontWeight:700,color:T.t4,textTransform:'uppercase',letterSpacing:'.07em' }}>Recent Leave Requests</div>
              <button onClick={() => setActive('leave')} style={{ fontSize:11,fontWeight:600,color:T.pri,background:'none',border:'none',cursor:'pointer' }}>View All</button>
            </div>
            <div style={{ display:'flex',flexDirection:'column',gap:7 }}>
              {(leavesQ.data||[]).slice(0,4).length ? (leavesQ.data||[]).slice(0,4).map((r,i) => (
                <div key={r.id||i} style={{ display:'flex',alignItems:'center',gap:10,padding:'10px 12px',background:T.bg,border:`1px solid ${T.bdr}`,borderRadius:12,transition:'.15s' }}
                  onMouseEnter={e=>{e.currentTarget.style.borderColor='rgba(37,99,235,.25)';e.currentTarget.style.background='rgba(37,99,235,.02)';}}
                  onMouseLeave={e=>{e.currentTarget.style.borderColor=T.bdr;e.currentTarget.style.background=T.bg;}}
                >
                  <div style={{ width:32,height:32,borderRadius:9,background:'#EAF1FF',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0 }}>
                    <CalendarOff size={14} style={{ color:T.pri }} />
                  </div>
                  <div style={{ flex:1,minWidth:0 }}>
                    <div style={{ fontSize:12.5,fontWeight:600,color:T.t1,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis' }}>{r.leave_type_name||'Leave'}</div>
                    <div style={{ fontSize:11,color:T.t4,marginTop:1 }}>{String(r.from_date||'').slice(0,10)} to {String(r.to_date||'').slice(0,10)}</div>
                  </div>
                  <StatusBadge value={r.status} />
                </div>
              )) : (
                <div style={{ textAlign:'center',padding:'16px 0',color:T.t4,fontSize:12 }}>No leave requests yet</div>
              )}
              {(serviceRequests||[]).slice(0,2).map((r,i) => (
                <div key={r.id||i} style={{ display:'flex',alignItems:'center',gap:10,padding:'10px 12px',background:T.bg,border:`1px solid ${T.bdr}`,borderRadius:12,marginTop:6 }}>
                  <div style={{ width:32,height:32,borderRadius:9,background:'#F3E8FF',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0 }}>
                    <FolderUp size={14} style={{ color:'#7C3AED' }} />
                  </div>
                  <div style={{ flex:1,minWidth:0 }}>
                    <div style={{ fontSize:12.5,fontWeight:600,color:T.t1,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis' }}>{r.subject||r.request_type||'Request'}</div>
                    <div style={{ fontSize:11,color:T.t4,marginTop:1 }}>{r.request_type||''}</div>
                  </div>
                  <StatusBadge value={r.status} />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN */}
        <div style={{ display:'flex',flexDirection:'column',gap:16 }}>

          {/* Upcoming Holiday */}
          <div style={{ background:'linear-gradient(135deg,#FEF3C7,#FDE68A)',borderRadius:20,border:'1px solid #FCD34D',padding:'16px 18px',boxShadow:T.sh }}>
            <div style={{ fontSize:10.5,fontWeight:700,textTransform:'uppercase',letterSpacing:'.08em',color:'#92400E',marginBottom:8 }}>Upcoming Holiday</div>
            {nextHoliday ? (
              <>
                <div style={{ fontSize:15,fontWeight:800,color:'#78350F',marginBottom:4 }}>{nextHoliday.name}</div>
                <div style={{ fontSize:12,color:'#92400E' }}>{new Date(nextHoliday.holiday_date).toLocaleDateString('en-IN',{weekday:'long',day:'2-digit',month:'long',year:'numeric'})}</div>
              </>
            ) : <div style={{ fontSize:12,color:'#B45309' }}>No upcoming holidays</div>}
          </div>

          {/* Birthdays Today */}
          {birthdaysToday.length > 0 && (
            <div style={{ ...Card(), padding:'16px 18px' }}>
              <div style={{ fontSize:11,fontWeight:700,color:T.t4,textTransform:'uppercase',letterSpacing:'.07em',marginBottom:10 }}>Birthdays Today</div>
              <div style={{ display:'flex',flexDirection:'column',gap:8 }}>
                {birthdaysToday.slice(0,3).map((p,i) => (
                  <div key={i} style={{ display:'flex',alignItems:'center',gap:10 }}>
                    <div style={{ width:36,height:36,borderRadius:'50%',background:'linear-gradient(135deg,#EC4899,#7C3AED)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:12,fontWeight:700,color:'#fff',flexShrink:0 }}>
                      {(p.name||'?').split(' ').map(w=>w[0]).slice(0,2).join('').toUpperCase()}
                    </div>
                    <div>
                      <div style={{ fontSize:13,fontWeight:600,color:T.t1 }}>{p.name}</div>
                      {p.designation && <div style={{ fontSize:11,color:T.t4 }}>{p.designation}</div>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Team on Leave (HR view only) */}
          {isHrView && onLeaveToday.length > 0 && (
            <div style={{ ...Card(), padding:'16px 18px' }}>
              <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10 }}>
                <div style={{ fontSize:11,fontWeight:700,color:T.t4,textTransform:'uppercase',letterSpacing:'.07em' }}>On Leave Today</div>
                <span style={{ background:'#EAF1FF',color:T.pri,fontSize:11,fontWeight:700,padding:'2px 8px',borderRadius:10 }}>{onLeaveToday.length}</span>
              </div>
              <div style={{ display:'flex',flexDirection:'column',gap:7 }}>
                {onLeaveToday.slice(0,4).map((p,i) => (
                  <div key={i} style={{ display:'flex',alignItems:'center',gap:9 }}>
                    <div style={{ width:30,height:30,borderRadius:'50%',background:`linear-gradient(135deg,${T.pri},${T.cyan})`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:10,fontWeight:700,color:'#fff',flexShrink:0 }}>
                      {(p.name||'?').split(' ').map(w=>w[0]).slice(0,2).join('').toUpperCase()}
                    </div>
                    <div style={{ flex:1,minWidth:0 }}>
                      <div style={{ fontSize:12.5,fontWeight:600,color:T.t1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>{p.name}</div>
                    </div>
                    <div style={{ fontSize:10.5,color:T.t4,flexShrink:0 }}>{p.leave_type||'Leave'}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Announcements */}
          <div style={{ ...Card(), padding:'16px 18px', flex:1 }}>
            <div style={{ fontSize:11,fontWeight:700,color:T.t4,textTransform:'uppercase',letterSpacing:'.07em',marginBottom:12 }}>Announcements</div>
            <div style={{ display:'flex',flexDirection:'column' }}>
              {announcements.length ? announcements.map((n,i) => (
                <div key={n.id||i} style={{ display:'flex',alignItems:'flex-start',gap:10,padding:'10px 0',borderBottom:i<announcements.length-1?`1px solid ${T.bg}`:undefined }}>
                  <div style={{ width:32,height:32,borderRadius:9,background:'#FEF3D6',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0 }}>
                    <Bell size={14} style={{ color:'#D97706' }} />
                  </div>
                  <div style={{ flex:1,minWidth:0 }}>
                    <div style={{ fontSize:12.5,fontWeight:600,color:T.t1,lineHeight:1.3 }}>{n.title||(n.message||'').slice(0,40)||'Notification'}</div>
                    <div style={{ fontSize:11,color:T.t4,marginTop:2,overflow:'hidden',display:'-webkit-box',WebkitLineClamp:2,WebkitBoxOrient:'vertical' }}>{n.message}</div>
                    <div style={{ fontSize:10,color:T.bdr,marginTop:3 }}>{n.created_at?new Date(n.created_at).toLocaleDateString('en-IN',{day:'2-digit',month:'short'}):''}</div>
                  </div>
                </div>
              )) : (
                <div style={{ textAlign:'center',padding:'24px 0',color:T.t4 }}>
                  <Bell size={24} style={{ color:T.bdr,display:'block',margin:'0 auto 6px' }} />
                  <div style={{ fontSize:12 }}>No announcements</div>
                </div>
              )}
            </div>
          </div>

          {/* Month Summary */}
          <div style={{ background:'linear-gradient(135deg,rgba(37,99,235,.06),rgba(6,182,212,.04))',borderRadius:20,border:'1px solid rgba(37,99,235,.12)',padding:'14px 16px',boxShadow:T.sh }}>
            <div style={{ fontSize:11,fontWeight:700,color:T.t4,textTransform:'uppercase',letterSpacing:'.07em',marginBottom:10 }}>Month Summary</div>
            <div style={{ display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:6 }}>
              {[
                { label:'Working', val:attendance.working_days??'--', color:T.t3 },
                { label:'Present', val:attendance.present??0,         color:'#059669' },
                { label:'Absent',  val:attendance.absent??0,          color:'#DC2626' },
              ].map(({ label,val,color }) => (
                <div key={label} style={{ textAlign:'center',padding:'10px 4px',background:'rgba(255,255,255,.75)',borderRadius:12,border:'1px solid rgba(255,255,255,.9)' }}>
                  <div style={{ fontSize:20,fontWeight:800,color,letterSpacing:'-.02em' }}>{val}</div>
                  <div style={{ fontSize:9.5,color:T.t4,marginTop:2 }}>{label}</div>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>

      <style>{`@keyframes ess-spin { to { transform: rotate(360deg); } }`}</style>
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
  const p = profile || {};
  const [activeTab, setActiveTab] = useState('overview');

  /* ── tokens ── */
  const T = {
    bg:'#F1F5F9', card:'#FFFFFF', bdr:'#E2E8F0',
    t1:'#0F172A', t2:'#334155', t3:'#64748B', t4:'#94A3B8',
    pri:'#2563EB', purp:'#7C3AED', cyan:'#06B6D4',
    suc:'#22C55E', warn:'#F59E0B', dan:'#EF4444',
    sh:'0 1px 3px rgba(0,0,0,.06),0 1px 2px rgba(0,0,0,.04)',
    shm:'0 4px 16px rgba(0,0,0,.08),0 2px 6px rgba(0,0,0,.04)',
  };
  const Cd = (ex={}) => ({ background:T.card, borderRadius:20, border:`1px solid ${T.bdr}`, boxShadow:T.sh, ...ex });

  const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN',{ day:'2-digit', month:'short', year:'numeric' }) : null;
  const capStr  = (s) => s ? String(s).replace(/_/g,' ').replace(/\b\w/g, c=>c.toUpperCase()) : null;

  /* profile completion */
  const completionFields = [
    ['Name',         p.name],
    ['Email',        p.email],
    ['Phone',        p.phone],
    ['DOB',          p.date_of_birth],
    ['Bank',         p.bank_name],
    ['PAN',          p.pan_number],
    ['Photo',        p.profile_photo_url],
    ['Address',      p.current_address],
  ];
  const filled    = completionFields.filter(([, v]) => v).length;
  const pct       = Math.round((filled / completionFields.length) * 100);
  const circ      = 2 * Math.PI * 38;
  const filledLen = circ * (pct / 100);

  const initials = (p.name || 'E').split(' ').map(w=>w[0]).slice(0,2).join('').toUpperCase();

  /* experience */
  const joined    = p.date_of_joining ? new Date(p.date_of_joining) : null;
  const now2      = new Date();
  const diffMs    = joined ? now2 - joined : 0;
  const expYears  = Math.floor(diffMs / (365.25 * 24 * 3600 * 1000));
  const expMonths = Math.floor((diffMs % (365.25 * 24 * 3600 * 1000)) / (30.44 * 24 * 3600 * 1000));
  const expStr    = joined ? (expYears > 0 ? `${expYears}y ${expMonths}m` : `${expMonths}m`) : '--';

  /* total leave balance */
  const totalLeave = (balances||[]).reduce((s,b)=>s+Number(b.closing_balance??0),0);

  const TABS = [
    { id:'overview',  label:'Overview'       },
    { id:'contact',   label:'Contact & Bank' },
    { id:'leave',     label:'Leave Balances' },
    { id:'statutory', label:'Statutory'      },
  ];

  /* ── InfoRow helper ── */
  const InfoRow = ({ label, value, mono=false, blur=false }) => {
    const [show, setShow] = useState(false);
    if (!value) return null;
    return (
      <div style={{ display:'flex', flexDirection:'column', gap:3 }}>
        <span style={{ fontSize:10,fontWeight:700,color:T.t4,textTransform:'uppercase',letterSpacing:'.07em' }}>{label}</span>
        <div style={{ display:'flex',alignItems:'center',gap:6 }}>
          <span style={{ fontSize:13,fontWeight:600,color:T.t1,fontFamily:mono?'ui-monospace,monospace':undefined,
            filter:blur&&!show?'blur(5px)':'none',userSelect:blur&&!show?'none':'auto',transition:'filter .2s' }}>
            {value}
          </span>
          {blur && <button onClick={()=>setShow(s=>!s)} style={{ fontSize:10.5,color:T.pri,background:'none',border:'none',cursor:'pointer',flexShrink:0,fontWeight:600 }}>{show?'Hide':'Show'}</button>}
        </div>
      </div>
    );
  };

  return (
    <div style={{ display:'flex', flexDirection:'column', background:T.bg, minHeight:'100%' }}>

      {/* HERO */}
      <div style={{ background:'linear-gradient(145deg,#020617 0%,#0F172A 25%,#1E1B4B 60%,#1D4ED8 100%)', position:'relative', overflow:'hidden', padding:'32px 28px 56px' }}>
        <div style={{ position:'absolute',inset:0,pointerEvents:'none',background:'radial-gradient(ellipse 70% 60% at 70% 0%,rgba(99,102,241,.22),transparent),radial-gradient(ellipse 50% 80% at 100% 70%,rgba(139,92,246,.15),transparent),radial-gradient(ellipse 60% 40% at 0% 90%,rgba(29,78,216,.18),transparent)' }} />
        <div style={{ position:'absolute',inset:0,pointerEvents:'none',backgroundImage:'radial-gradient(rgba(255,255,255,.05) 1px,transparent 1px)',backgroundSize:'24px 24px' }} />

        <div style={{ position:'relative',zIndex:1,display:'flex',alignItems:'flex-start',gap:24,flexWrap:'wrap' }}>

          {/* Spinning avatar ring */}
          <div style={{ position:'relative',width:96,height:96,flexShrink:0 }}>
            <div style={{ position:'absolute',inset:-5,borderRadius:'50%',background:'conic-gradient(from 0deg,#7C3AED,#2563EB,#06B6D4,#7C3AED)',animation:'ess-spin 6s linear infinite' }} />
            <div style={{ position:'absolute',inset:2,borderRadius:'50%',background:'#0F172A' }} />
            {p.profile_photo_url
              ? <img src={p.profile_photo_url} alt="" style={{ position:'absolute',inset:7,borderRadius:'50%',objectFit:'cover',width:'calc(100% - 14px)',height:'calc(100% - 14px)' }} />
              : <div style={{ position:'absolute',inset:7,borderRadius:'50%',background:'linear-gradient(135deg,#1E1B4B,#2563EB)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:26,fontWeight:900,color:'#fff' }}>{initials}</div>
            }
            <div style={{ position:'absolute',bottom:4,right:4,width:16,height:16,borderRadius:'50%',background:'#22C55E',border:'3px solid #0F172A',zIndex:2 }} />
          </div>

          {/* Name + meta */}
          <div style={{ flex:1,minWidth:220 }}>
            <div style={{ display:'flex',alignItems:'center',gap:7,marginBottom:8,flexWrap:'wrap' }}>
              {p.employee_code && <span style={{ background:'rgba(255,255,255,.1)',color:'rgba(255,255,255,.8)',border:'1px solid rgba(255,255,255,.2)',fontSize:10.5,fontWeight:700,padding:'2px 10px',borderRadius:20,fontFamily:'ui-monospace,monospace' }}>{p.employee_code}</span>}
              {p.employment_status && <span style={{ background:'rgba(34,197,94,.18)',color:'#4ADE80',border:'1px solid rgba(34,197,94,.3)',fontSize:10.5,fontWeight:700,padding:'2px 10px',borderRadius:20 }}>{capStr(p.employment_status)}</span>}
              {p.employment_type && <span style={{ background:'rgba(255,255,255,.08)',color:'rgba(255,255,255,.6)',border:'1px solid rgba(255,255,255,.12)',fontSize:10.5,fontWeight:600,padding:'2px 10px',borderRadius:20 }}>{capStr(p.employment_type)}</span>}
            </div>
            <div style={{ fontSize:28,fontWeight:800,color:'#fff',letterSpacing:'-.03em',lineHeight:1.1,marginBottom:6 }}>{p.name||'Employee'}</div>
            <div style={{ display:'flex',flexWrap:'wrap',gap:'3px 16px',fontSize:12.5,color:'rgba(255,255,255,.6)',marginBottom:10 }}>
              {p.designation_name && <span>{p.designation_name}</span>}
              {p.department_name  && <span>· {p.department_name}</span>}
              {p.work_location    && <span>· {p.work_location}</span>}
            </div>
            <div style={{ display:'flex',flexWrap:'wrap',gap:6 }}>
              {p.email && <span style={{ fontSize:11.5,color:'rgba(255,255,255,.5)' }}>{p.email}</span>}
              {p.phone && <span style={{ fontSize:11.5,color:'rgba(255,255,255,.4)' }}>· {p.phone}</span>}
            </div>
          </div>

          {/* Profile completion ring */}
          <div style={{ display:'flex',flexDirection:'column',alignItems:'center',gap:6,flexShrink:0 }}>
            <svg width="88" height="88" viewBox="0 0 88 88">
              <circle cx="44" cy="44" r="38" fill="none" stroke="rgba(255,255,255,.1)" strokeWidth="7"/>
              <circle cx="44" cy="44" r="38" fill="none" stroke="url(#pgrd)" strokeWidth="7"
                strokeDasharray={`${filledLen} ${circ}`} strokeLinecap="round" transform="rotate(-90 44 44)"/>
              <defs>
                <linearGradient id="pgrd" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#7C3AED"/>
                  <stop offset="100%" stopColor="#06B6D4"/>
                </linearGradient>
              </defs>
              <text x="44" y="48" textAnchor="middle" fontSize="16" fontWeight="800" fill="white">{pct}%</text>
            </svg>
            <span style={{ fontSize:10.5,color:'rgba(255,255,255,.5)',fontWeight:600 }}>Profile Complete</span>
            <div style={{ display:'flex',flexDirection:'column',gap:3,marginTop:2 }}>
              {completionFields.map(([label,val])=>(
                <div key={label} style={{ display:'flex',alignItems:'center',gap:5,fontSize:10,color:'rgba(255,255,255,.45)' }}>
                  <div style={{ width:7,height:7,borderRadius:'50%',background:val?'#22C55E':'rgba(255,255,255,.2)',flexShrink:0 }} />
                  {label}
                </div>
              ))}
            </div>
          </div>
        </div>

        <svg style={{ position:'absolute',bottom:0,left:0,right:0,width:'100%',display:'block',pointerEvents:'none' }} viewBox="0 0 1440 36" preserveAspectRatio="none">
          <path d="M0,18L60,15C120,12,240,6,360,8C480,10,600,20,720,21C840,23,960,17,1080,13C1200,9,1320,8,1380,8L1440,7V36H0Z" fill={T.bg}/>
        </svg>
      </div>

      {/* KPI STRIP */}
      <div style={{ padding:'0 24px', marginTop:'-2px', position:'relative', zIndex:10 }}>
        <div style={{ display:'grid',gridTemplateColumns:'repeat(6,1fr)',background:T.card,borderRadius:16,border:`1px solid ${T.bdr}`,boxShadow:T.shm,overflow:'hidden' }}>
          {[
            { label:'Employee ID',   val:p.employee_code||'--',                mono:true,  clr:T.t1  },
            { label:'Department',    val:p.department_name||'--',               mono:false, clr:T.t2  },
            { label:'Joined',        val:fmtDate(p.date_of_joining)||'--',      mono:false, clr:'#059669' },
            { label:'Experience',    val:expStr,                                mono:false, clr:T.pri },
            { label:'Leave Balance', val:`${totalLeave.toFixed(1)}d`,           mono:false, clr:'#7C3AED' },
            { label:'Status',        val:capStr(p.employment_status)||'--',     mono:false, clr:p.employment_status==='active'?'#059669':T.t3 },
          ].map(({ label,val,mono,clr },i)=>(
            <div key={label} style={{ padding:'14px 16px',borderRight:i<5?`1px solid ${T.bdr}`:undefined,transition:'.15s',cursor:'default' }}
              onMouseEnter={e=>{e.currentTarget.style.background='rgba(37,99,235,.03)';}}
              onMouseLeave={e=>{e.currentTarget.style.background='';}}
            >
              <div style={{ fontSize:10,fontWeight:700,color:T.t4,textTransform:'uppercase',letterSpacing:'.07em',marginBottom:5 }}>{label}</div>
              <div style={{ fontSize:mono?12:17,fontWeight:800,color:clr,fontFamily:mono?'ui-monospace,monospace':undefined,letterSpacing:'-.01em',lineHeight:1 }}>{val}</div>
            </div>
          ))}
        </div>
      </div>

      {/* TAB BAR */}
      <div style={{ padding:'16px 24px 0',display:'flex',gap:4 }}>
        {TABS.map(t=>(
          <button key={t.id} onClick={()=>setActiveTab(t.id)}
            style={{ padding:'9px 18px',borderRadius:12,border:'none',cursor:'pointer',fontSize:13,fontWeight:600,transition:'.15s',
              background:activeTab===t.id?T.pri:'transparent',
              color:activeTab===t.id?'#fff':T.t3,
              boxShadow:activeTab===t.id?'0 4px 12px rgba(37,99,235,.3)':undefined,
            }}
            onMouseEnter={e=>{if(activeTab!==t.id){e.currentTarget.style.background='rgba(37,99,235,.06)';e.currentTarget.style.color=T.t1;}}}
            onMouseLeave={e=>{if(activeTab!==t.id){e.currentTarget.style.background='transparent';e.currentTarget.style.color=T.t3;}}}
          >{t.label}</button>
        ))}
      </div>

      {/* TAB CONTENT */}
      <div style={{ padding:'16px 24px 32px',display:'flex',flexDirection:'column',gap:16 }}>

        {/* OVERVIEW TAB */}
        {activeTab==='overview' && (
          <>
            <div style={{ ...Cd(), padding:'20px 24px' }}>
              <div style={{ fontSize:11,fontWeight:700,color:T.t4,textTransform:'uppercase',letterSpacing:'.08em',marginBottom:16 }}>Personal Information</div>
              <div style={{ display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:'16px 28px' }}>
                <InfoRow label="Full Name"      value={p.name} />
                <InfoRow label="Date of Birth"  value={fmtDate(p.date_of_birth)} />
                <InfoRow label="Gender"         value={capStr(p.gender)} />
                <InfoRow label="Blood Group"    value={p.blood_group} />
                <InfoRow label="Marital Status" value={capStr(p.marital_status)} />
                <InfoRow label="Nationality"    value={p.nationality} />
                <InfoRow label="Father's Name"  value={p.father_name} />
              </div>
            </div>

            <div style={{ ...Cd(), padding:'20px 24px' }}>
              <div style={{ fontSize:11,fontWeight:700,color:T.t4,textTransform:'uppercase',letterSpacing:'.08em',marginBottom:16 }}>Employment Details</div>
              <div style={{ display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:'16px 28px' }}>
                <InfoRow label="Designation"         value={p.designation_name} />
                <InfoRow label="Department"          value={p.department_name} />
                <InfoRow label="Reporting Manager"   value={p.reporting_manager_name} />
                <InfoRow label="Work Location"       value={p.work_location} />
                <InfoRow label="Employee Category"   value={capStr(p.employee_category)} />
                <InfoRow label="Employment Type"     value={capStr(p.employment_type)} />
                <InfoRow label="Date of Joining"     value={fmtDate(p.date_of_joining)} />
                <InfoRow label="Date of Confirmation" value={fmtDate(p.date_of_confirmation)} />
                <InfoRow label="Employment Status"   value={capStr(p.employment_status)} />
              </div>
            </div>
          </>
        )}

        {/* CONTACT & BANK TAB */}
        {activeTab==='contact' && (
          <>
            <div style={{ ...Cd(), padding:'20px 24px' }}>
              <div style={{ fontSize:11,fontWeight:700,color:T.t4,textTransform:'uppercase',letterSpacing:'.08em',marginBottom:16 }}>Contact Details</div>
              <div style={{ display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:'16px 28px' }}>
                <InfoRow label="Work Email"    value={p.email} />
                <InfoRow label="Phone"         value={p.phone} />
                <InfoRow label="Current Address"   value={p.current_address} />
                <InfoRow label="Permanent Address" value={p.permanent_address} />
              </div>
            </div>
            {(p.emergency_contact_name||p.emergency_contact_phone) && (
              <div style={{ ...Cd(), padding:'20px 24px' }}>
                <div style={{ fontSize:11,fontWeight:700,color:T.t4,textTransform:'uppercase',letterSpacing:'.08em',marginBottom:16 }}>Emergency Contact</div>
                <div style={{ display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:'16px 28px' }}>
                  <InfoRow label="Name"  value={p.emergency_contact_name} />
                  <InfoRow label="Phone" value={p.emergency_contact_phone} />
                </div>
              </div>
            )}
            <div style={{ ...Cd(), padding:'20px 24px' }}>
              <div style={{ fontSize:11,fontWeight:700,color:T.t4,textTransform:'uppercase',letterSpacing:'.08em',marginBottom:4 }}>Bank Details</div>
              <p style={{ fontSize:11.5,color:T.t4,marginBottom:16 }}>Sensitive fields are blurred — click Show to reveal.</p>
              <div style={{ display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:'16px 28px' }}>
                <InfoRow label="Bank Name"   value={p.bank_name} />
                <InfoRow label="Account No." value={p.bank_account_last4?`•••• ${p.bank_account_last4}`:null} blur />
                <InfoRow label="IFSC Code"   value={p.bank_ifsc} mono />
              </div>
            </div>
          </>
        )}

        {/* LEAVE BALANCES TAB */}
        {activeTab==='leave' && (
          <>
            <div style={{ ...Cd(), padding:'20px 24px' }}>
              <div style={{ fontSize:11,fontWeight:700,color:T.t4,textTransform:'uppercase',letterSpacing:'.08em',marginBottom:16 }}>Leave Balance Summary</div>
              {(balances||[]).length ? (
                <div style={{ display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:12 }}>
                  {(balances||[]).map((b,i)=>{
                    const cols=[T.pri,'#06B6D4','#22C55E','#F59E0B','#7C3AED','#EF4444'];
                    const c=cols[i%cols.length];
                    const avail=Number(b.closing_balance??0);
                    const taken=Number(b.taken??0);
                    const accrued=Number(b.accrued??0);
                    const pct2=accrued>0?Math.min(100,Math.round((taken/accrued)*100)):0;
                    const circ2=2*Math.PI*30;
                    const fill2=circ2*(pct2/100);
                    return (
                      <div key={b.leave_type_id} style={{ ...Cd({border:`1px solid ${c}22`,background:`${c}05`}), padding:'18px 20px' }}>
                        <div style={{ display:'flex',alignItems:'center',gap:12 }}>
                          <svg width="64" height="64" viewBox="0 0 64 64" style={{ flexShrink:0 }}>
                            <circle cx="32" cy="32" r="30" fill="none" stroke={`${c}1A`} strokeWidth="5"/>
                            <circle cx="32" cy="32" r="30" fill="none" stroke={c} strokeWidth="5"
                              strokeDasharray={`${fill2} ${circ2}`} strokeLinecap="round" transform="rotate(-90 32 32)"/>
                            <text x="32" y="37" textAnchor="middle" fontSize="14" fontWeight="800" fill={c}>{avail.toFixed(0)}</text>
                          </svg>
                          <div>
                            <div style={{ fontSize:13,fontWeight:700,color:T.t1,lineHeight:1.3 }}>{b.leave_type_name}</div>
                            <div style={{ fontSize:11,color:T.t4,marginTop:4 }}>{avail.toFixed(1)} available</div>
                            <div style={{ fontSize:10.5,color:T.t4,marginTop:2 }}>{taken} taken · {accrued} accrued</div>
                          </div>
                        </div>
                        <div style={{ marginTop:12,height:4,background:T.bg,borderRadius:99 }}>
                          <div style={{ height:4,borderRadius:99,width:`${pct2}%`,background:c,transition:'width .6s ease' }} />
                        </div>
                        <div style={{ display:'flex',justifyContent:'space-between',marginTop:4 }}>
                          <span style={{ fontSize:10,color:T.t4 }}>{pct2}% utilised</span>
                          <span style={{ fontSize:10,color:c,fontWeight:700 }}>{avail.toFixed(1)}d left</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div style={{ textAlign:'center',padding:'32px 0',color:T.t4 }}>
                  <div style={{ fontSize:13 }}>No leave balance data available</div>
                </div>
              )}
            </div>
          </>
        )}

        {/* STATUTORY TAB */}
        {activeTab==='statutory' && (
          <div style={{ ...Cd(), padding:'20px 24px' }}>
            <div style={{ fontSize:11,fontWeight:700,color:T.t4,textTransform:'uppercase',letterSpacing:'.08em',marginBottom:4 }}>Statutory & Compliance</div>
            <p style={{ fontSize:11.5,color:T.t4,marginBottom:16 }}>Sensitive identifiers are blurred — click Show to reveal.</p>
            <div style={{ display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:'16px 28px' }}>
              <InfoRow label="PAN Number"    value={p.pan_number}        mono blur />
              <InfoRow label="UAN Number"    value={p.uan_number}        mono blur />
              <InfoRow label="PF Account"    value={p.pf_account_number} mono blur />
              <InfoRow label="ESI Number"    value={p.esi_number}        mono blur />
            </div>
          </div>
        )}

      </div>

      <style>{`@keyframes ess-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}


/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   ATTENDANCE TAB
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
function AttendanceTab({ leaveTypes }) {
  const qc  = useQueryClient();
  const now = new Date();
  const [calYear,  setCalYear]  = useState(now.getFullYear());
  const [calMonth, setCalMonth] = useState(now.getMonth());
  const [swipeDays, setSwipeDays] = useState(14);
  const [correction, setCorrection] = useState({
    attendance_date: today(), requested_status: 'present',
    requested_in_time: '09:30', requested_out_time: '18:00', reason: '',
  });

  /* ── queries ── */
  const attendance  = useQuery({ queryKey: ['ess-attendance'],  queryFn: () => essAPI.attendance().then(unwrap) });
  const corrections = useQuery({ queryKey: ['ess-corrections'], queryFn: () => essAPI.attendanceCorrections().then(unwrap) });
  const swipes      = useQuery({ queryKey: ['ess-swipes', swipeDays], queryFn: () => essAPI.swipes({ days: swipeDays }).then(unwrap) });
  const balQ        = useQuery({ queryKey: ['ess-leave-balances'], queryFn: () => essAPI.leaveBalances().then(unwrap) });

  const refresh = () => ['ess-attendance','ess-corrections','ess-summary','ess-attendance-dash'].forEach(k => qc.invalidateQueries({ queryKey: [k] }));
  const createCorrection = useMutation({
    mutationFn: essAPI.createCorrection,
    onSuccess: () => { toast.success('Correction requested'); setCorrection({ ...correction, reason: '' }); refresh(); },
    onError:   (e) => toast.error(e?.response?.data?.error || 'Failed to submit correction request'),
  });

  /* ── derived ── */
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

  const monthStats = useMemo(() => {
    const prefix = `${calYear}-${String(calMonth+1).padStart(2,'0')}-`;
    let P=0, A=0, HD=0, L=0, H=0;
    for (const [ds, rec] of Object.entries(statusMap)) {
      if (!ds.startsWith(prefix)) continue;
      const dow = new Date(ds).getDay();
      if (dow===0||dow===6) continue;
      if (rec.code==='P') P++; else if (rec.code==='A') A++;
      else if (rec.code==='HD') HD++; else if (rec.code==='L') L++;
      else if (rec.code==='H') H++;
    }
    // Infer absents: past working days with no biometric record
    const dim = new Date(calYear, calMonth+1, 0).getDate();
    for (let d = 1; d <= dim; d++) {
      const ds = `${calYear}-${String(calMonth+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      if (ds >= todayStr) break;
      const dow = new Date(ds).getDay();
      if (dow===0||dow===6) continue;
      if (!statusMap[ds]) A++;
    }
    const worked = P+A+HD+L;
    return { P, A, HD, L, H, worked, pct: worked>0 ? Math.round((P/worked)*100) : 0 };
  }, [statusMap, calYear, calMonth, todayStr]);

  /* ── design tokens ── */
  const T = {
    bg:'#F0FDF9', card:'#FFFFFF', bdr:'#D1FAE5',
    t1:'#064E3B', t2:'#065F46', t3:'#6B7280', t4:'#9CA3AF',
    pri:'#059669', purp:'#7C3AED', blue:'#2563EB',
    sh:'0 1px 3px rgba(0,0,0,.06),0 1px 2px rgba(0,0,0,.04)',
    shm:'0 4px 16px rgba(0,0,0,.07)',
  };
  const Cd = (ex={}) => ({ background:T.card, borderRadius:18, border:`1px solid ${T.bdr}`, boxShadow:T.sh, ...ex });

  const STATUS_STYLE = {
    P:  { bg:'rgba(16,185,129,.12)',  fg:'#059669', bdr:'rgba(16,185,129,.3)',   label:'Present'  },
    PL: { bg:'rgba(245,158,11,.13)',  fg:'#B45309', bdr:'rgba(245,158,11,.35)',  label:'Late'     },
    A:  { bg:'rgba(239,68,68,.13)',   fg:'#DC2626', bdr:'rgba(239,68,68,.3)',    label:'Absent'   },
    HD: { bg:'rgba(251,146,60,.13)',  fg:'#C2410C', bdr:'rgba(251,146,60,.3)',   label:'Half Day' },
    L:  { bg:'rgba(139,92,246,.1)',   fg:'#7C3AED', bdr:'rgba(139,92,246,.25)', label:'Leave'    },
    H:  { bg:'rgba(99,102,241,.1)',   fg:'#4338CA', bdr:'rgba(99,102,241,.25)', label:'Holiday'  },
    WO: { bg:'rgba(0,0,0,.03)',       fg:'#94A3B8', bdr:'rgba(0,0,0,.07)',      label:'Week Off' },
  };

  /* attendance% ring */
  const attPct  = monthStats.pct;
  const circR   = 36;
  const circLen = 2 * Math.PI * circR;
  const fillLen = circLen * (attPct / 100);

  return (
    <div style={{ display:'flex', flexDirection:'column', background:T.bg, minHeight:'100%' }}>

      {/* ── HERO BANNER ── */}
      <div style={{ background:'linear-gradient(145deg,#022C22 0%,#064E3B 25%,#065F46 60%,#059669 100%)', position:'relative', overflow:'hidden', padding:'28px 28px 52px' }}>
        <div style={{ position:'absolute',inset:0,pointerEvents:'none',background:'radial-gradient(ellipse 70% 60% at 70% 0%,rgba(16,185,129,.25),transparent),radial-gradient(ellipse 50% 80% at 100% 70%,rgba(52,211,153,.15),transparent)' }} />
        <div style={{ position:'absolute',inset:0,pointerEvents:'none',backgroundImage:'radial-gradient(rgba(255,255,255,.055) 1px,transparent 1px)',backgroundSize:'24px 24px' }} />

        <div style={{ position:'relative',zIndex:1,display:'flex',alignItems:'center',gap:24,flexWrap:'wrap' }}>
          {/* Attendance ring */}
          <div style={{ position:'relative',width:88,height:88,flexShrink:0 }}>
            <svg width="88" height="88" viewBox="0 0 88 88" style={{ position:'absolute',inset:0 }}>
              <circle cx="44" cy="44" r={circR} fill="none" stroke="rgba(255,255,255,.12)" strokeWidth="7"/>
              <circle cx="44" cy="44" r={circR} fill="none" stroke="url(#attgrd)" strokeWidth="7"
                strokeDasharray={`${fillLen} ${circLen}`} strokeLinecap="round" transform="rotate(-90 44 44)"/>
              <defs>
                <linearGradient id="attgrd" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#34D399"/>
                  <stop offset="100%" stopColor="#06B6D4"/>
                </linearGradient>
              </defs>
              <text x="44" y="47" textAnchor="middle" fontSize="14" fontWeight="900" fill="white">{attPct}%</text>
            </svg>
          </div>

          {/* Title + month */}
          <div style={{ flex:1,minWidth:200 }}>
            <div style={{ fontSize:10.5,fontWeight:700,color:'rgba(255,255,255,.55)',textTransform:'uppercase',letterSpacing:'.08em',marginBottom:6 }}>Attendance Summary</div>
            <div style={{ fontSize:26,fontWeight:800,color:'#fff',letterSpacing:'-.03em',lineHeight:1.1,marginBottom:8 }}>{MONTH_NAMES[calMonth]} {calYear}</div>
            <div style={{ display:'flex',flexWrap:'wrap',gap:'4px 18px',fontSize:12.5,color:'rgba(255,255,255,.6)' }}>
              <span>{monthStats.P} Present</span>
              <span>· {monthStats.A} Absent</span>
              <span>· {monthStats.HD} Half Day</span>
              <span>· {monthStats.L} On Leave</span>
            </div>
          </div>

          {/* Month nav */}
          <div style={{ display:'flex',alignItems:'center',gap:6,flexShrink:0 }}>
            <button onClick={prevMonth} style={{ width:32,height:32,borderRadius:9,background:'rgba(255,255,255,.15)',border:'1px solid rgba(255,255,255,.25)',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',color:'#fff' }}>
              <ChevronLeft size={15}/>
            </button>
            <button onClick={() => { setCalMonth(now.getMonth()); setCalYear(now.getFullYear()); }}
              style={{ fontSize:12,fontWeight:700,color:'rgba(255,255,255,.8)',background:'rgba(255,255,255,.12)',border:'1px solid rgba(255,255,255,.2)',borderRadius:9,padding:'5px 14px',cursor:'pointer' }}>
              Today
            </button>
            <button onClick={nextMonth} style={{ width:32,height:32,borderRadius:9,background:'rgba(255,255,255,.15)',border:'1px solid rgba(255,255,255,.25)',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',color:'#fff' }}>
              <ChevronRight size={15}/>
            </button>
          </div>
        </div>

        <svg style={{ position:'absolute',bottom:0,left:0,right:0,width:'100%',display:'block',pointerEvents:'none' }} viewBox="0 0 1440 36" preserveAspectRatio="none">
          <path d="M0,18L60,15C120,12,240,6,360,8C480,10,600,20,720,21C840,23,960,17,1080,13C1200,9,1320,8,1380,8L1440,7V36H0Z" fill={T.bg}/>
        </svg>
      </div>

      {/* ── KPI STRIP ── */}
      <div style={{ padding:'0 24px', marginTop:'-2px', position:'relative', zIndex:10 }}>
        <div style={{ display:'grid',gridTemplateColumns:'repeat(6,1fr)',background:T.card,borderRadius:16,border:`1px solid ${T.bdr}`,boxShadow:T.shm,overflow:'hidden' }}>
          {[
            { label:'Present',      val:monthStats.P,      clr:'#059669' },
            { label:'Absent',       val:monthStats.A,      clr:'#DC2626' },
            { label:'Half Day',     val:monthStats.HD,     clr:'#B45309' },
            { label:'On Leave',     val:monthStats.L,      clr:'#7C3AED' },
            { label:'Working Days', val:monthStats.worked, clr:T.blue    },
            { label:'Attendance %', val:`${attPct}%`,      clr:attPct>=90?'#059669':attPct>=75?'#B45309':'#DC2626' },
          ].map(({ label,val,clr },i)=>(
            <div key={label} style={{ padding:'14px 16px',borderRight:i<5?`1px solid ${T.bdr}`:undefined,transition:'.15s' }}
              onMouseEnter={e=>{e.currentTarget.style.background='rgba(5,150,105,.04)';}}
              onMouseLeave={e=>{e.currentTarget.style.background='';}}
            >
              <div style={{ fontSize:10,fontWeight:700,color:T.t4,textTransform:'uppercase',letterSpacing:'.07em',marginBottom:5 }}>{label}</div>
              <div style={{ fontSize:22,fontWeight:800,color:clr,letterSpacing:'-.02em',lineHeight:1 }}>{val}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── MAIN GRID: Calendar + Right Panel ── */}
      <div style={{ padding:'20px 24px', display:'grid', gridTemplateColumns:'1fr 300px', gap:18, alignItems:'start' }}>

        {/* CALENDAR */}
        <div style={{ ...Cd() }}>
          <div style={{ padding:'16px 18px', borderBottom:`1px solid ${T.bdr}`, display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:10 }}>
            <div style={{ fontSize:14,fontWeight:700,color:T.t1 }}>{MONTH_NAMES[calMonth]} {calYear} — Attendance</div>
            <div style={{ display:'flex',gap:'6px 12px',flexWrap:'wrap' }}>
              {[['P','Present','#059669'],['PL','Late','#B45309'],['A','Absent','#DC2626'],['HD','Half Day','#C2410C'],['L','Leave','#7C3AED'],['H','Holiday','#4338CA'],['WO','Week Off','#94A3B8']].map(([code,name,color])=>(
                <span key={code} style={{ display:'flex',alignItems:'center',gap:4,fontSize:10.5,color:'#64748B' }}>
                  <span style={{ width:8,height:8,borderRadius:2,background:color,display:'inline-block',flexShrink:0 }}/>{name}
                </span>
              ))}
            </div>
          </div>
          <div style={{ padding:'14px 16px' }}>
            <div style={{ display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:3,marginBottom:4 }}>
              {DAYS_OF_WEEK.map(d=>(
                <div key={d} style={{ textAlign:'center',fontSize:10,fontWeight:700,textTransform:'uppercase',letterSpacing:'.07em',color:T.t4,padding:'3px 0' }}>{d}</div>
              ))}
            </div>
            <div style={{ display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:3 }}>
              {cells.map((day,idx)=>{
                if (!day) return <div key={`e-${idx}`} />;
                const ds      = formatDay(day);
                const rec     = statusMap[ds];
                const rawCode = rec?.code;
                const isToday = ds === todayStr;
                const isPast  = ds < todayStr;
                const isWknd  = new Date(ds).getDay()===0||new Date(ds).getDay()===6;
                // Late present = amber cell
                const isLate  = rawCode === 'P' && (rec?.lateMin || 0) > 0;
                // Past working day with no biometric record = inferred absent
                const isNoPunch = !rawCode && !isWknd && isPast;
                const code    = isLate ? 'PL' : isNoPunch ? 'A' : rawCode;
                const ss      = isToday
                  ? { bg:'linear-gradient(135deg,#059669,#06B6D4)', fg:'#fff', bdr:'transparent' }
                  : code && STATUS_STYLE[code]
                  ? { bg:STATUS_STYLE[code].bg, fg:STATUS_STYLE[code].fg, bdr:STATUS_STYLE[code].bdr }
                  : isWknd
                  ? { bg:'rgba(0,0,0,.03)', fg:'#CBD5E1', bdr:'transparent' }
                  : { bg:'rgba(0,0,0,.01)', fg:'#94A3B8', bdr:'transparent' };
                const titleTxt = isNoPunch ? `${ds}: No punch recorded`
                  : rec ? `${rawCode}${rec.inTime?' – In: '+String(rec.inTime).slice(0,5):''}${rec.lateMin?' – Late: '+rec.lateMin+'m':''}` : undefined;
                return (
                  <div key={day} title={titleTxt}
                    style={{ borderRadius:10,padding:'6px 5px 7px',minHeight:58,display:'flex',flexDirection:'column',gap:2,background:ss.bg,border:`1px solid ${ss.bdr||'transparent'}`,cursor:'default',transition:'.1s' }}
                    onMouseEnter={e=>{e.currentTarget.style.boxShadow='0 2px 8px rgba(0,0,0,.1)';}}
                    onMouseLeave={e=>{e.currentTarget.style.boxShadow='';}}
                  >
                    <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between' }}>
                      <span style={{ fontSize:11.5,fontWeight:700,color:ss.fg,lineHeight:1 }}>{day}</span>
                      {isToday && <span style={{ fontSize:6.5,fontWeight:800,background:'rgba(255,255,255,.25)',color:'#fff',padding:'1px 4px',borderRadius:3,letterSpacing:'.04em' }}>NOW</span>}
                      {isLate && !isToday && <span style={{ fontSize:6,fontWeight:800,background:'rgba(180,83,9,.15)',color:'#B45309',padding:'1px 4px',borderRadius:3,letterSpacing:'.03em' }}>LATE</span>}
                    </div>
                    {code && <span style={{ fontSize:8.5,fontWeight:700,color:isToday?'rgba(255,255,255,.9)':ss.fg }}>{isLate?'P':code}</span>}
                    {rec?.inTime && (
                      <span style={{ fontSize:7.5,color:isToday?'rgba(255,255,255,.75)':ss.fg,opacity:isToday?1:.8,marginTop:'auto',fontVariantNumeric:'tabular-nums' }}>
                        {String(rec.inTime).slice(0,5)}
                      </span>
                    )}
                    {isLate && !isToday && (
                      <span style={{ fontSize:7,color:'#B45309',fontWeight:700 }}>+{rec.lateMin}m</span>
                    )}
                    {isNoPunch && (
                      <span style={{ fontSize:7,color:'#DC2626',fontWeight:600,marginTop:'auto',opacity:.75 }}>No punch</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* RIGHT PANEL */}
        <div style={{ display:'flex', flexDirection:'column', gap:14 }}>

          {/* Leave Balances */}
          <div style={{ ...Cd(), padding:'16px 18px' }}>
            <div style={{ fontSize:11,fontWeight:700,color:T.t4,textTransform:'uppercase',letterSpacing:'.08em',marginBottom:12 }}>Leave Balances</div>
            {!(balQ.data||[]).length ? (
              <div style={{ fontSize:12,color:T.t4,textAlign:'center',padding:'8px 0' }}>No balance data</div>
            ) : (
              <div style={{ display:'flex',flexDirection:'column',gap:10 }}>
                {(balQ.data||[]).map((b,i)=>{
                  const bal  = Number(b.closing_balance??0);
                  const max  = Number(b.total_entitlement||b.closing_balance||20)||1;
                  const pct  = Math.min(100,Math.round((bal/max)*100));
                  const cols = ['#059669','#2563EB','#7C3AED','#F59E0B','#EF4444'];
                  const col  = cols[i%cols.length];
                  return (
                    <div key={i}>
                      <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:4 }}>
                        <span style={{ fontSize:12,fontWeight:600,color:T.t1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',flex:1 }}>{b.leave_type_name}</span>
                        <span style={{ fontSize:13,fontWeight:800,color:col,flexShrink:0,marginLeft:8 }}>{bal.toFixed(1)}<span style={{ fontSize:9,fontWeight:600,color:T.t4 }}> days</span></span>
                      </div>
                      <div style={{ height:5,background:'rgba(0,0,0,.06)',borderRadius:99 }}>
                        <div style={{ height:5,borderRadius:99,width:`${pct}%`,background:col,transition:'width .5s ease' }} />
                      </div>
                      <div style={{ fontSize:9.5,color:T.t4,marginTop:2,textAlign:'right' }}>{Number(b.taken??0).toFixed(1)} taken · {Number(b.accrued??0).toFixed(1)} accrued</div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Correction Form */}
          <div style={{ ...Cd(), padding:'16px 18px' }}>
            <div style={{ fontSize:11,fontWeight:700,color:T.t4,textTransform:'uppercase',letterSpacing:'.08em',marginBottom:4 }}>Attendance Correction</div>
            <p style={{ fontSize:11.5,color:T.t3,marginBottom:12 }}>Missed punch or wrong status? Raise a correction.</p>
            <div style={{ display:'flex',flexDirection:'column',gap:9 }}>
              <div>
                <label style={{ fontSize:10.5,fontWeight:700,color:T.t4,display:'block',marginBottom:4 }}>Date</label>
                <input type="date" value={correction.attendance_date}
                  onChange={e=>setCorrection({...correction, attendance_date:e.target.value})}
                  style={{ width:'100%',borderRadius:10,border:`1px solid ${T.bdr}`,padding:'8px 12px',fontSize:13,color:T.t1,outline:'none',background:'#F0FDF9',boxSizing:'border-box' }}
                />
              </div>
              <div>
                <label style={{ fontSize:10.5,fontWeight:700,color:T.t4,display:'block',marginBottom:4 }}>Requested Status</label>
                <select value={correction.requested_status}
                  onChange={e=>setCorrection({...correction, requested_status:e.target.value})}
                  style={{ width:'100%',borderRadius:10,border:`1px solid ${T.bdr}`,padding:'8px 12px',fontSize:13,color:T.t1,outline:'none',background:'#F0FDF9',cursor:'pointer',boxSizing:'border-box' }}>
                  <option value="present">Present</option>
                  <option value="half_day">Half Day</option>
                  <option value="on_duty">On Duty</option>
                </select>
              </div>
              <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:8 }}>
                <div>
                  <label style={{ fontSize:10.5,fontWeight:700,color:T.t4,display:'block',marginBottom:4 }}>In Time</label>
                  <input type="time" value={correction.requested_in_time}
                    onChange={e=>setCorrection({...correction,requested_in_time:e.target.value})}
                    style={{ width:'100%',borderRadius:10,border:`1px solid ${T.bdr}`,padding:'8px 10px',fontSize:13,color:T.t1,outline:'none',background:'#F0FDF9',boxSizing:'border-box' }}/>
                </div>
                <div>
                  <label style={{ fontSize:10.5,fontWeight:700,color:T.t4,display:'block',marginBottom:4 }}>Out Time</label>
                  <input type="time" value={correction.requested_out_time}
                    onChange={e=>setCorrection({...correction,requested_out_time:e.target.value})}
                    style={{ width:'100%',borderRadius:10,border:`1px solid ${T.bdr}`,padding:'8px 10px',fontSize:13,color:T.t1,outline:'none',background:'#F0FDF9',boxSizing:'border-box' }}/>
                </div>
              </div>
              <div>
                <label style={{ fontSize:10.5,fontWeight:700,color:T.t4,display:'block',marginBottom:4 }}>Reason</label>
                <input value={correction.reason} placeholder="Brief reason for correction"
                  onChange={e=>setCorrection({...correction,reason:e.target.value})}
                  style={{ width:'100%',borderRadius:10,border:`1px solid ${T.bdr}`,padding:'8px 12px',fontSize:13,color:T.t1,outline:'none',background:'#F0FDF9',boxSizing:'border-box' }}/>
              </div>
              <button
                disabled={!correction.reason||createCorrection.isPending}
                onClick={()=>createCorrection.mutate(correction)}
                style={{ padding:'10px',borderRadius:11,border:'none',cursor:correction.reason?'pointer':'not-allowed',
                  background:correction.reason?'linear-gradient(135deg,#059669,#0D9488)':'rgba(0,0,0,.06)',
                  color:correction.reason?'#fff':'#94A3B8',fontSize:13,fontWeight:700,
                  boxShadow:correction.reason?'0 4px 14px rgba(5,150,105,.35)':undefined,transition:'.15s' }}>
                {createCorrection.isPending ? 'Submitting…' : 'Submit Correction Request'}
              </button>
            </div>
          </div>

        </div>
      </div>

      {/* ── CORRECTION HISTORY ── */}
      <div style={{ padding:'0 24px 16px' }}>
        <div style={{ ...Cd(), padding:'16px 20px' }}>
          <div style={{ fontSize:13,fontWeight:700,color:T.t1,marginBottom:14 }}>My Correction Requests</div>
          {!(corrections.data||[]).length ? (
            <div style={{ textAlign:'center',padding:'16px 0',color:T.t4,fontSize:12 }}>No correction requests yet</div>
          ) : (
            <div style={{ overflowX:'auto' }}>
              <table style={{ width:'100%',borderCollapse:'collapse',fontSize:12.5 }}>
                <thead>
                  <tr style={{ background:'#F0FDF9' }}>
                    {['Date','Requested Status','Reason','Approval'].map(h=>(
                      <th key={h} style={{ padding:'8px 12px',textAlign:'left',fontSize:10,fontWeight:700,color:T.t4,textTransform:'uppercase',letterSpacing:'.07em',borderBottom:`1px solid ${T.bdr}`,whiteSpace:'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(corrections.data||[]).map((r,i)=>(
                    <tr key={r.id||i} style={{ borderBottom:`1px solid ${T.bdr}` }}
                      onMouseEnter={e=>{e.currentTarget.style.background='rgba(5,150,105,.03)';}}
                      onMouseLeave={e=>{e.currentTarget.style.background='';}}
                    >
                      <td style={{ padding:'10px 12px',fontWeight:600,color:T.t1,fontVariantNumeric:'tabular-nums' }}>{String(r.attendance_date||'').slice(0,10)}</td>
                      <td style={{ padding:'10px 12px',color:T.t2 }}>{r.requested_status}</td>
                      <td style={{ padding:'10px 12px',color:T.t3,maxWidth:200,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>{r.reason}</td>
                      <td style={{ padding:'10px 12px' }}><StatusBadge value={r.status}/></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* ── BIOMETRIC SWIPE LOGS ── */}
      <div style={{ padding:'0 24px 32px' }}>
        <div style={{ ...Cd(), overflow:'hidden' }}>
          <div style={{ padding:'16px 20px', borderBottom:`1px solid ${T.bdr}`, display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:10 }}>
            <div>
              <div style={{ fontSize:13,fontWeight:700,color:T.t1 }}>Biometric Swipe Logs</div>
              <div style={{ fontSize:11.5,color:T.t4,marginTop:1 }}>All punches recorded by the ESSL device</div>
            </div>
            <div style={{ display:'flex',alignItems:'center',gap:6 }}>
              <span style={{ fontSize:10.5,color:T.t4,fontWeight:600 }}>Last</span>
              {[7,14,30,60].map(d=>(
                <button key={d} onClick={()=>setSwipeDays(d)}
                  style={{ fontSize:11.5,fontWeight:700,padding:'4px 12px',borderRadius:20,border:'1px solid',cursor:'pointer',transition:'.15s',
                    background:swipeDays===d?'linear-gradient(135deg,#059669,#0D9488)':'transparent',
                    color:swipeDays===d?'#fff':'#64748B',
                    borderColor:swipeDays===d?'#059669':'#D1D5DB',
                    boxShadow:swipeDays===d?'0 2px 8px rgba(5,150,105,.3)':undefined }}>
                  {d}d
                </button>
              ))}
            </div>
          </div>

          <div style={{ padding:'14px 20px' }}>
            {swipes.isLoading ? (
              <div style={{ textAlign:'center',padding:'24px 0',color:T.t4,fontSize:12 }}>Loading swipes…</div>
            ) : !(swipes.data||[]).length ? (
              <div style={{ textAlign:'center',padding:'24px 0' }}>
                <div style={{ fontSize:13,color:T.t4,fontWeight:600 }}>No swipe records for the last {swipeDays} days</div>
                <div style={{ fontSize:11,color:T.t4,marginTop:4 }}>Biometric data syncs automatically from the ESSL device</div>
              </div>
            ) : (
              <div style={{ display:'flex',flexDirection:'column',gap:10 }}>
                {groupByDate(swipes.data||[]).map(([date,daySwipes])=>{
                  const d        = new Date(date+'T00:00:00');
                  const dayLabel = d.toLocaleDateString('en-IN',{weekday:'short',day:'2-digit',month:'short',year:'numeric'});
                  const isIn     = s=>String(s.direction||'').toLowerCase().includes('in') ||s.direction==='0';
                  const isOut    = s=>String(s.direction||'').toLowerCase().includes('out')||s.direction==='1';
                  const firstIn  = daySwipes.find(isIn);
                  const lastOut  = [...daySwipes].reverse().find(isOut);
                  const isToday2 = date === todayStr;
                  return (
                    <div key={date} style={{ borderRadius:14,overflow:'hidden',border:`1px solid ${T.bdr}` }}>
                      <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',padding:'10px 16px',background:isToday2?'linear-gradient(135deg,#059669,#0D9488)':'linear-gradient(135deg,#022C22,#064E3B)' }}>
                        <span style={{ fontSize:12.5,fontWeight:700,color:'#fff' }}>{dayLabel}</span>
                        <div style={{ display:'flex',alignItems:'center',gap:12 }}>
                          {firstIn && (
                            <span style={{ fontSize:11,color:'rgba(255,255,255,.7)' }}>
                              In: <strong style={{ color:'#fff',fontVariantNumeric:'tabular-nums' }}>{(()=>{const t=esslTime(firstIn.swipe_time);return fmt12(t.h,t.m);})()}</strong>
                            </span>
                          )}
                          {lastOut && (
                            <span style={{ fontSize:11,color:'rgba(255,255,255,.7)' }}>
                              Out: <strong style={{ color:'#fff',fontVariantNumeric:'tabular-nums' }}>{(()=>{const t=esslTime(lastOut.swipe_time);return fmt12(t.h,t.m);})()}</strong>
                            </span>
                          )}
                          <span style={{ fontSize:10.5,background:'rgba(255,255,255,.18)',color:'#fff',borderRadius:10,padding:'2px 9px',fontWeight:700 }}>{daySwipes.length} punch{daySwipes.length!==1?'es':''}</span>
                        </div>
                      </div>
                      <div>
                        {daySwipes.map((s,i)=>{
                          const et=esslTime(s.swipe_time);
                          return (
                            <div key={i} style={{ display:'flex',alignItems:'center',gap:12,padding:'9px 16px',borderBottom:i<daySwipes.length-1?`1px solid ${T.bdr}`:undefined,background:i%2===0?'#fff':'#F9FEF9',transition:'.1s' }}
                              onMouseEnter={e=>{e.currentTarget.style.background='rgba(5,150,105,.05)';}}
                              onMouseLeave={e=>{e.currentTarget.style.background=i%2===0?'#fff':'#F9FEF9';}}
                            >
                              <span style={{ width:22,textAlign:'center',fontSize:10.5,fontWeight:700,color:T.t4 }}>{i+1}</span>
                              <SwipeDir direction={s.direction}/>
                              <span style={{ fontSize:13.5,fontWeight:700,color:T.t1,fontVariantNumeric:'tabular-nums' }}>{fmt12(et.h,et.m,et.s)}</span>
                              {s.source && <span style={{ marginLeft:'auto',fontSize:10,color:T.t4,textTransform:'uppercase',letterSpacing:'.06em' }}>{s.source}</span>}
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
  const [filter,    setFilter]    = useState('');
  const [mode,      setMode]      = useState('post');
  const [sideNav,   setSideNav]   = useState('feed');
  const [postBody,  setPostBody]  = useState('');
  const [postGroup, setPostGroup] = useState('General');
  const [kudosTo,   setKudosTo]   = useState('');
  const [kudosBadge,setKudosBadge]= useState('Great Work');
  const [kudosMsg,  setKudosMsg]  = useState('');

  /* ── queries ── */
  const feed       = useQuery({ queryKey: ['ess-engage', filter], queryFn: () => essAPI.engageFeed(filter ? { type: filter } : {}).then(unwrap) });
  const colleagues = useQuery({ queryKey: ['ess-colleagues'], queryFn: () => essAPI.colleagues().then(unwrap), enabled: mode === 'kudos' });
  const teamQ      = useQuery({ queryKey: ['ess-team-today'],  queryFn: () => essAPI.teamToday().then(r => r.data.data) });

  const birthdaysToday = teamQ.data?.birthdays_today || [];
  const nextHoliday    = teamQ.data?.next_holiday    || null;

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

  /* ── derived ── */
  const initials  = (profile?.name || 'E').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
  const hour      = new Date().getHours();
  const greeting  = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const feedArr   = feed.data || [];
  const pinnedArr = feedArr.filter(p => p.is_pinned);
  const kudosCnt  = feedArr.filter(p => p.type === 'kudos').length;

  /* ── design tokens ── */
  const T = {
    bg:'#EEF2FF', card:'#FFFFFF', bdr:'#E0E7FF',
    t1:'#1E1B4B', t2:'#3730A3', t3:'#6366F1', t4:'#A5B4FC',
    pri:'#2563EB', purp:'#7C3AED',
    sh:'0 1px 3px rgba(0,0,0,.06),0 1px 2px rgba(0,0,0,.04)',
    shm:'0 4px 16px rgba(0,0,0,.07),0 2px 6px rgba(0,0,0,.04)',
  };
  const Card = (ex={}) => ({ background:T.card, borderRadius:18, border:`1px solid ${T.bdr}`, boxShadow:T.sh, ...ex });

  const AVATAR_COLS = ['#6366F1','#8B5CF6','#EC4899','#F59E0B','#10B981','#2563EB','#EF4444','#06B6D4'];

  /* ── left sidebar nav items ── */
  const NAV = [
    { id:'feed',        label:'My Feed',      count:0         },
    { id:'announce',    label:'Announcements',count:feedArr.filter(p=>p.group_name==='Company News').length||0 },
    { id:'recognition', label:'Recognition',  count:kudosCnt  },
    { id:'events',      label:'Events',       count:0         },
    { id:'polls',       label:'Polls',        count:feedArr.filter(p=>p.type==='poll').length||0 },
  ];

  const filterForNav = { feed:'', announce:'post', recognition:'kudos', events:'post', polls:'post' };

  return (
    <div style={{ display:'flex', background:T.bg, minHeight:'100%', gap:0, position:'relative' }}>

      {/* LEFT SIDEBAR */}
      <div style={{ width:220, flexShrink:0, padding:'16px 0 16px 16px', display:'flex', flexDirection:'column', gap:12 }}>

        {/* Brand */}
        <div style={{ ...Card(), padding:'14px 16px', display:'flex', alignItems:'center', gap:10 }}>
          <div style={{ width:36, height:36, borderRadius:10, background:'linear-gradient(135deg,#4F46E5,#7C3AED)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
            <Users size={17} style={{ color:'#fff' }} />
          </div>
          <div>
            <div style={{ fontSize:13, fontWeight:800, color:T.t1, letterSpacing:'-.02em' }}>BCIM Connect</div>
            <div style={{ fontSize:10, color:T.t4, fontWeight:500 }}>Employee Hub</div>
          </div>
        </div>

        {/* Nav links */}
        <div style={{ ...Card(), padding:'8px 6px', display:'flex', flexDirection:'column', gap:1 }}>
          {NAV.map(n => {
            const active = sideNav === n.id;
            return (
              <button key={n.id} onClick={() => { setSideNav(n.id); setFilter(filterForNav[n.id]||''); }}
                style={{ display:'flex', alignItems:'center', gap:10, padding:'9px 12px', borderRadius:12, border:'none', cursor:'pointer', textAlign:'left', width:'100%', transition:'.15s',
                  background: active ? 'linear-gradient(135deg,rgba(79,70,229,.12),rgba(124,58,237,.08))' : 'transparent',
                  color: active ? T.t2 : '#64748B' }}
                onMouseEnter={e=>{if(!active){e.currentTarget.style.background='rgba(99,102,241,.06)';e.currentTarget.style.color=T.t2;}}}
                onMouseLeave={e=>{if(!active){e.currentTarget.style.background='transparent';e.currentTarget.style.color='#64748B';}}}
              >
                <span style={{ fontSize:13, fontWeight: active?700:500, flex:1 }}>{n.label}</span>
                {n.count>0 && <span style={{ fontSize:10, fontWeight:700, background:active?T.t2:'#E0E7FF', color:active?'#fff':T.t3, borderRadius:10, padding:'1px 7px', minWidth:18, textAlign:'center' }}>{n.count}</span>}
              </button>
            );
          })}
        </div>

        {/* Pinned */}
        {pinnedArr.length > 0 && (
          <div style={{ ...Card(), padding:'12px 14px' }}>
            <div style={{ fontSize:9.5, fontWeight:800, color:T.t4, textTransform:'uppercase', letterSpacing:'.1em', marginBottom:8 }}>Pinned</div>
            <div style={{ display:'flex', flexDirection:'column', gap:7 }}>
              {pinnedArr.slice(0, 3).map(p => (
                <div key={p.id} style={{ display:'flex', alignItems:'flex-start', gap:8 }}>
                  <div style={{ width:6, height:6, borderRadius:'50%', background:T.t3, flexShrink:0, marginTop:5 }} />
                  <div>
                    <div style={{ fontSize:12, fontWeight:600, color:T.t1, lineHeight:1.3 }}>{(p.body||'').slice(0,40)}{(p.body||'').length>40?'…':''}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Birthdays */}
        {birthdaysToday.length > 0 && (
          <div style={{ ...Card(), padding:'12px 14px' }}>
            <div style={{ fontSize:9.5, fontWeight:800, color:T.t4, textTransform:'uppercase', letterSpacing:'.1em', marginBottom:8 }}>Birthdays Today</div>
            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              {birthdaysToday.slice(0, 3).map((b, i) => (
                <div key={i} style={{ display:'flex', alignItems:'center', gap:8 }}>
                  <div style={{ width:30, height:30, borderRadius:'50%', background:AVATAR_COLS[i%AVATAR_COLS.length], display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:700, color:'#fff', flexShrink:0 }}>
                    {(b.name||'?').split(' ').map(w=>w[0]).slice(0,2).join('').toUpperCase()}
                  </div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:12, fontWeight:600, color:T.t1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{b.name}</div>
                  </div>
                  <button onClick={() => { setMode('kudos'); setKudosTo(b.id||''); setKudosBadge('Great Work'); setKudosMsg(`Happy Birthday, ${(b.name||'').split(' ')[0]}! 🎂`); }}
                    style={{ fontSize:10.5, fontWeight:700, color:T.purp, background:'rgba(124,58,237,.08)', border:'1px solid rgba(124,58,237,.18)', borderRadius:8, padding:'3px 8px', cursor:'pointer', flexShrink:0, whiteSpace:'nowrap' }}>
                    Wish
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Upcoming holiday */}
        {nextHoliday && (
          <div style={{ background:'linear-gradient(135deg,#FEF3C7,#FDE68A)', borderRadius:14, border:'1px solid #FCD34D', padding:'12px 14px', boxShadow:T.sh }}>
            <div style={{ fontSize:9.5, fontWeight:800, color:'#92400E', textTransform:'uppercase', letterSpacing:'.08em', marginBottom:4 }}>Next Holiday</div>
            <div style={{ fontSize:12.5, fontWeight:700, color:'#78350F' }}>{nextHoliday.name}</div>
            <div style={{ fontSize:10.5, color:'#B45309', marginTop:2 }}>{new Date(nextHoliday.holiday_date).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'})}</div>
          </div>
        )}
      </div>

      {/* CENTER */}
      <div style={{ flex:1, minWidth:0, padding:'16px 16px 32px', display:'flex', flexDirection:'column', gap:14 }}>

        {/* Hero banner */}
        <div style={{ background:'linear-gradient(135deg,#1E1B4B 0%,#4C1D95 30%,#2563EB 70%,#06B6D4 100%)', borderRadius:20, padding:'20px 24px', position:'relative', overflow:'hidden', boxShadow:'0 8px 24px rgba(79,70,229,.3)' }}>
          <div style={{ position:'absolute',inset:0,backgroundImage:'radial-gradient(rgba(255,255,255,.04) 1px,transparent 1px)',backgroundSize:'20px 20px',pointerEvents:'none' }} />
          <div style={{ position:'absolute',top:-60,right:-40,width:200,height:200,borderRadius:'50%',background:'rgba(124,58,237,.25)',filter:'blur(60px)',pointerEvents:'none' }} />
          <div style={{ position:'relative',zIndex:1,display:'flex',alignItems:'center',justifyContent:'space-between',gap:16,flexWrap:'wrap' }}>
            <div>
              <div style={{ fontSize:11,fontWeight:700,color:'rgba(255,255,255,.6)',textTransform:'uppercase',letterSpacing:'.08em',marginBottom:4 }}>{`${greeting} 👋`}</div>
              <div style={{ fontSize:22,fontWeight:800,color:'#fff',letterSpacing:'-.02em',lineHeight:1.2 }}>Hello, {(profile?.name||'Employee').split(' ')[0]}!</div>
              <div style={{ fontSize:12.5,color:'rgba(255,255,255,.6)',marginTop:6 }}>
                {kudosCnt > 0 ? `You have ${kudosCnt} kudos in your feed.` : 'Welcome to the employee hub.'}
              </div>
            </div>
            <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
              {[
                { icon:'👥', label:'Online now',  val:teamQ.data?.active_count||'--' },
                { icon:'🎂', label:'Birthdays',   val:birthdaysToday.length           },
                { icon:'⭐', label:'Kudos',       val:kudosCnt                        },
              ].map(({ icon,label,val })=>(
                <div key={label} style={{ background:'rgba(255,255,255,.12)', border:'1px solid rgba(255,255,255,.2)', borderRadius:14, padding:'10px 16px', textAlign:'center', backdropFilter:'blur(8px)' }}>
                  <div style={{ fontSize:15,fontWeight:800,color:'#fff',lineHeight:1 }}>{icon} {val}</div>
                  <div style={{ fontSize:10.5,color:'rgba(255,255,255,.6)',marginTop:3 }}>{label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Stories strip (colleagues) */}
        {(colleagues.data||[]).length > 0 && (
          <div style={{ ...Card(), padding:'14px 16px' }}>
            <div style={{ display:'flex', alignItems:'center', gap:12, overflowX:'auto', paddingBottom:2 }}>
              {/* Add story = self */}
              <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:5, flexShrink:0 }}>
                <div style={{ width:48,height:48,borderRadius:'50%',background:'linear-gradient(135deg,#EEF2FF,#E0E7FF)',border:'2px dashed #A5B4FC',display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer' }}>
                  <span style={{ fontSize:20, color:T.t3 }}>+</span>
                </div>
                <span style={{ fontSize:10,color:T.t4,fontWeight:600 }}>You</span>
              </div>
              {(colleagues.data||[]).slice(0,8).map((c,i)=>(
                <div key={c.id} style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:5, flexShrink:0 }}>
                  <div style={{ padding:2,borderRadius:'50%',background:`linear-gradient(135deg,${AVATAR_COLS[i%AVATAR_COLS.length]},${AVATAR_COLS[(i+2)%AVATAR_COLS.length]})` }}>
                    {c.profile_photo_url
                      ? <img src={c.profile_photo_url} alt="" style={{ width:44,height:44,borderRadius:'50%',objectFit:'cover',border:'2px solid #fff',display:'block' }} />
                      : <div style={{ width:44,height:44,borderRadius:'50%',background:AVATAR_COLS[i%AVATAR_COLS.length],border:'2px solid #fff',display:'flex',alignItems:'center',justifyContent:'center',fontSize:14,fontWeight:700,color:'#fff' }}>
                          {(c.name||'?').split(' ').map(w=>w[0]).slice(0,2).join('').toUpperCase()}
                        </div>
                    }
                  </div>
                  <span style={{ fontSize:10,color:T.t3,fontWeight:500,maxWidth:52,textAlign:'center',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>{(c.name||'').split(' ')[0]}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Create post card */}
        <div style={{ ...Card(), overflow:'hidden' }}>
          {/* Mode tabs */}
          <div style={{ display:'flex', gap:2, borderBottom:`1px solid ${T.bdr}`, padding:'10px 12px 0', background:'rgba(238,242,255,.4)' }}>
            {[['post','Post',Send],['kudos','Recognition',Award]].map(([m,label,Icon])=>(
              <button key={m} onClick={()=>setMode(m)}
                style={{ display:'flex',alignItems:'center',gap:7,padding:'8px 16px',borderRadius:'10px 10px 0 0',border:'none',cursor:'pointer',fontSize:12.5,fontWeight:600,transition:'.15s',
                  background:mode===m?T.card:'transparent',
                  color:mode===m?T.pri:'#64748B',
                  boxShadow:mode===m?`0 -2px 0 ${T.pri} inset`:undefined,
                }}>
                <Icon size={14}/>{label}
              </button>
            ))}
          </div>
          <div style={{ padding:'14px 16px' }}>
            <div style={{ display:'flex', gap:10 }}>
              {/* Self avatar */}
              {profile?.profile_photo_url
                ? <img src={profile.profile_photo_url} alt="" style={{ width:38,height:38,borderRadius:'50%',objectFit:'cover',flexShrink:0 }} />
                : <div style={{ width:38,height:38,borderRadius:'50%',background:'linear-gradient(135deg,#4F46E5,#7C3AED)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:13,fontWeight:700,color:'#fff',flexShrink:0 }}>{initials}</div>
              }
              <div style={{ flex:1, display:'flex', flexDirection:'column', gap:10 }}>
                {mode === 'post' ? (
                  <>
                    <textarea rows={3} value={postBody} placeholder={`What's on your mind, ${(profile?.name||'').split(' ')[0]||'you'}? 💬`}
                      onChange={e=>setPostBody(e.target.value)}
                      style={{ width:'100%',borderRadius:12,border:`1px solid ${T.bdr}`,background:'#F8FAFF',padding:'10px 14px',fontSize:13,color:'#1E293B',resize:'none',outline:'none',fontFamily:'inherit',boxSizing:'border-box',transition:'.15s' }}
                      onFocus={e=>{e.target.style.borderColor=T.pri;e.target.style.boxShadow=`0 0 0 3px rgba(37,99,235,.08)`;}}
                      onBlur={e=>{e.target.style.borderColor=T.bdr;e.target.style.boxShadow='';}}
                    />
                    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:10, flexWrap:'wrap' }}>
                      <select value={postGroup} onChange={e=>setPostGroup(e.target.value)}
                        style={{ fontSize:12,fontWeight:600,color:'#64748B',background:'#F1F5F9',border:`1px solid ${T.bdr}`,borderRadius:10,padding:'6px 12px',cursor:'pointer',outline:'none' }}>
                        {POST_GROUPS.map(g=><option key={g} value={g}>{g}</option>)}
                      </select>
                      <button disabled={!postBody.trim()||create.isPending} onClick={()=>create.mutate()}
                        style={{ display:'inline-flex',alignItems:'center',gap:7,background:postBody.trim()?`linear-gradient(135deg,${T.pri},${T.purp})`:'#E2E8F0',color:postBody.trim()?'#fff':'#94A3B8',border:'none',borderRadius:10,padding:'8px 20px',fontWeight:700,fontSize:13,cursor:postBody.trim()?'pointer':'not-allowed',boxShadow:postBody.trim()?'0 4px 14px rgba(37,99,235,.35)':undefined,transition:'.15s' }}>
                        <Send size={14}/> Post
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                      <div>
                        <label style={{ fontSize:10.5,fontWeight:700,color:'#64748B',display:'block',marginBottom:4 }}>Appreciate</label>
                        <select value={kudosTo} onChange={e=>setKudosTo(e.target.value)}
                          style={{ width:'100%',fontSize:12,background:'#F8FAFF',border:`1px solid ${T.bdr}`,borderRadius:10,padding:'8px 12px',cursor:'pointer',outline:'none',color:'#1E293B' }}>
                          <option value="">Select a colleague…</option>
                          {(colleagues.data||[]).map(c=><option key={c.id} value={c.id}>{c.name}{c.designation_name?` — ${c.designation_name}`:''}</option>)}
                        </select>
                      </div>
                      <div>
                        <label style={{ fontSize:10.5,fontWeight:700,color:'#64748B',display:'block',marginBottom:4 }}>Badge</label>
                        <select value={kudosBadge} onChange={e=>setKudosBadge(e.target.value)}
                          style={{ width:'100%',fontSize:12,background:'#F8FAFF',border:`1px solid ${T.bdr}`,borderRadius:10,padding:'8px 12px',cursor:'pointer',outline:'none',color:'#1E293B' }}>
                          {KUDOS_BADGES.map(b=><option key={b} value={b}>{b}</option>)}
                        </select>
                      </div>
                    </div>
                    <textarea rows={2} value={kudosMsg} placeholder="Add a personal message (optional)…"
                      onChange={e=>setKudosMsg(e.target.value)}
                      style={{ width:'100%',borderRadius:12,border:`1px solid ${T.bdr}`,background:'#F8FAFF',padding:'10px 14px',fontSize:13,color:'#1E293B',resize:'none',outline:'none',fontFamily:'inherit',boxSizing:'border-box' }}
                    />
                    <div style={{ display:'flex', justifyContent:'flex-end' }}>
                      <button disabled={!kudosTo||create.isPending} onClick={()=>create.mutate()}
                        style={{ display:'inline-flex',alignItems:'center',gap:7,background:kudosTo?'linear-gradient(135deg,#7C3AED,#EC4899)':'#E2E8F0',color:kudosTo?'#fff':'#94A3B8',border:'none',borderRadius:10,padding:'8px 20px',fontWeight:700,fontSize:13,cursor:kudosTo?'pointer':'not-allowed',boxShadow:kudosTo?'0 4px 14px rgba(124,58,237,.35)':undefined,transition:'.15s' }}>
                        <Award size={14}/> Give Kudos
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Filter pills */}
        <div style={{ display:'flex', gap:8, alignItems:'center' }}>
          {[['','All Activities'],['post','Posts'],['kudos','Kudos']].map(([v,label])=>(
            <button key={v} onClick={()=>setFilter(v)}
              style={{ padding:'6px 16px',borderRadius:20,fontSize:12.5,fontWeight:600,border:`1px solid ${filter===v?T.pri:T.bdr}`,cursor:'pointer',transition:'.15s',
                background:filter===v?T.pri:T.card,color:filter===v?'#fff':'#64748B' }}>
              {label}
            </button>
          ))}
        </div>

        {/* Feed */}
        {feed.isLoading ? (
          <div style={{ textAlign:'center',padding:'32px 0',color:'#94A3B8',fontSize:13 }}>Loading feed…</div>
        ) : !feedArr.length ? (
          <div style={{ ...Card(), padding:'32px',textAlign:'center' }}>
            <Users size={28} style={{ color:T.t4,display:'block',margin:'0 auto 8px' }} />
            <div style={{ fontSize:13,color:'#94A3B8' }}>No activity yet. Be the first to post or give kudos!</div>
          </div>
        ) : (
          <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
            {feedArr.map(p => <EngageCard key={p.id} post={p} />)}
          </div>
        )}
      </div>
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
