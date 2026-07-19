import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BadgeIndianRupee, Bell, CalendarCheck, CalendarOff, CheckCircle2,
  FileText, FolderUp, Headphones, Monitor, ShieldCheck, UserRound, Printer,
  ChevronLeft, ChevronRight, Upload, Camera, Trash2,
  LayoutDashboard, Clock, Users, Award, BookOpen,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { essAPI, hrAdvancedAPI } from '../../api/client';
import { useNavigate } from 'react-router-dom';

/* ─── helpers ─── */
const unwrap = (res) => res?.data?.data || [];
const today  = () => new Date().toISOString().slice(0, 10);

const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];

/* ─── design tokens — light HR-SaaS palette (Zoho People / GreytHR style),
   matching the ESS login page's blue/teal theme instead of the ERP's navy/gold ─── */
const ACCENT = '#2F6FED';   // primary accent — buttons, links, positive stats, progress bars
const TEAL   = '#14B8A6';   // secondary accent — used sparingly for variety
const DARK   = '#0F172A';   // dark text/highlight (was solid navy fills)
const BG     = '#F4F6FB';

/* ─── primitives ─── */
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

/* ─── attendance status ─── */
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

/* ─── group swipes by device IST date, sorted chronologically within each day ─── */
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

/* ═══════════════════════════════════════════════════════════════
   HORIZONTAL TAB NAV (replaces the standalone sidebar)
═══════════════════════════════════════════════════════════════ */
const TAB_ITEMS = [
  { id: 'dashboard',   label: 'Dashboard',     Icon: LayoutDashboard },
  { id: 'profile',     label: 'Profile',        Icon: UserRound       },
  { id: 'attendance',  label: 'My Attendance',  Icon: CalendarCheck   },
  { id: 'leave',       label: 'Leave',          Icon: CalendarOff     },
  { id: 'payslips',    label: 'Payroll',        Icon: BadgeIndianRupee},
  { id: 'documents',   label: 'My Documents',   Icon: FileText        },
  { id: 'hr-requests', label: 'My Requests',    Icon: FolderUp        },
  { id: 'manager',     label: 'Manager Desk',   Icon: CheckCircle2    },
  { id: 'timesheet',   label: 'Timesheet',      Icon: Clock           },
  { id: 'training',    label: 'Training',       Icon: Award           },
  { id: 'assets',      label: 'Assets',         Icon: Monitor         },
  { id: 'helpdesk',    label: 'Helpdesk',       Icon: Headphones      },
  { id: 'knowledge',   label: 'Knowledge Base', Icon: BookOpen        },
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

/* ═══════════════════════════════════════════════════════════════
   DASHBOARD TAB
═══════════════════════════════════════════════════════════════ */
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
  const workDays     = attendance.working_days || 0;
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

  const statCards = [
    {
      label: 'Today\'s Attendance', bg: '#EAF1FF', fg: '#2F6FED', Icon: CalendarCheck,
      body: todayRec?.code ? (
        <>
          <span className="inline-block rounded-full px-2.5 py-0.5 text-[11px] font-bold text-white mb-1.5"
            style={{ backgroundColor: todayStatusColor[todayRec.code] || '#9ca3af' }}>
            {todayStatusLabel[todayRec.code] || todayRec.code}
          </span>
          {todayInTime
            ? <p className="text-xl font-extrabold text-gray-900">{todayInTime} <span className="text-sm font-medium text-gray-400">In</span></p>
            : <p className="text-xs text-gray-400 mt-1">No check-in recorded</p>}
        </>
      ) : (
        <span className="inline-block rounded-full px-2.5 py-0.5 text-[11px] font-bold bg-gray-100 text-gray-500 mb-1">Not Marked</span>
      ),
      footer: profile?.work_location ? { label: 'Location', value: profile.work_location } : null,
      cta: { label: 'View Details', onClick: () => setActive('attendance') },
    },
    {
      label: 'Leave Balance', bg: '#E3F5F1', fg: '#0D9488', Icon: CalendarOff,
      body: (
        <>
          <p className="text-2xl font-extrabold text-gray-900">{Number(totalBalance).toFixed(1)}</p>
          <p className="text-xs text-gray-400">Days available</p>
        </>
      ),
      footer: (casualBal > 0 || earnedBal > 0) ? {
        split: [
          casualBal > 0 && { label: 'Casual', value: Number(casualBal).toFixed(1) },
          earnedBal > 0 && { label: 'Earned', value: Number(earnedBal).toFixed(1) },
        ].filter(Boolean),
      } : null,
      cta: { label: 'View Leave Balance', onClick: () => setActive('leave') },
    },
    {
      label: 'Latest Payslip', bg: '#FEF3D6', fg: '#B45309', Icon: BadgeIndianRupee,
      body: payroll?.month ? (
        <>
          <p className="text-[11px] text-gray-400">{MONTH_NAMES[(payroll.month || 1) - 1]} {payroll.year}</p>
          <p className="text-2xl font-extrabold text-gray-900">₹{Number(payroll.net_pay || 0).toLocaleString('en-IN')}</p>
          <p className="text-xs text-gray-400">Net salary</p>
        </>
      ) : <p className="text-sm text-gray-400 mt-2">No payslip available yet.</p>,
      cta: payroll?.month ? { label: 'View Payslip', onClick: () => payroll.id && navigate(`/hr-admin/payroll/${payroll.id}/payslip`) } : null,
    },
    {
      label: 'My Requests', bg: '#FCE7F3', fg: '#DB2777', Icon: FolderUp,
      body: (
        <>
          <p className="text-2xl font-extrabold text-gray-900">{pendingTotal}</p>
          <p className="text-xs text-gray-400">Pending requests</p>
        </>
      ),
      footer: { split: [{ label: 'Leave', value: pendingLeave }, { label: 'Reg.', value: pendingCorr }] },
      cta: { label: 'View All Requests', onClick: () => setActive('hr-requests') },
    },
  ];

  return (
    <div className="space-y-5">

      {/* ── Hero banner ── */}
      <div
        className="relative overflow-hidden rounded-2xl p-6 sm:p-7"
        style={{ background: 'linear-gradient(120deg, #2F6FED 0%, #2557C7 55%, #0F9E8E 140%)' }}
      >
        <div className="pointer-events-none absolute -right-8 -top-16 h-56 w-56 rounded-full bg-white/10" />
        <div className="pointer-events-none absolute right-24 bottom-[-48px] h-32 w-32 rounded-full bg-white/10" />
        <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            {profile?.profile_photo_url ? (
              <img
                src={profile.profile_photo_url}
                alt={profile?.name || 'Employee'}
                className="h-14 w-14 shrink-0 rounded-2xl object-cover ring-1 ring-white/40"
              />
            ) : (
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/15 text-lg font-bold text-white ring-1 ring-white/25">
                {initials}
              </div>
            )}
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-white/70">{greeting}</p>
              <h2 className="text-xl font-bold text-white sm:text-2xl">{profile?.name?.split(' ')[0] || 'Employee'} 👋</h2>
              <p className="mt-0.5 text-sm text-white/80">{profile?.designation_name || "Here's what's happening today."}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 self-start rounded-xl bg-white/12 px-4 py-3 ring-1 ring-white/20 sm:self-auto">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/15">
              <CalendarCheck size={17} className="text-white" />
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-white/60">Today</p>
              <p className="text-sm font-bold text-white">
                {todayRec?.code ? (todayStatusLabel[todayRec.code] || todayRec.code) : 'Not marked'}
                {todayInTime && <span className="ml-1.5 font-medium text-white/70">· In {todayInTime}</span>}
              </p>
            </div>
          </div>
        </div>
        <p className="relative mt-5 max-w-xl border-t border-white/15 pt-4 text-xs italic leading-relaxed text-white/75">
          "{quote.text}" <span className="not-italic font-semibold text-white">— {quote.author}</span>
        </p>
      </div>

      {/* ── 4 Stat cards ── */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {statCards.map((c) => (
          <div key={c.label} className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold text-gray-500">{c.label}</p>
              <div className="flex h-9 w-9 items-center justify-center rounded-full" style={{ background: c.bg }}>
                <c.Icon size={16} style={{ color: c.fg }} />
              </div>
            </div>
            {c.body}
            {c.footer && (
              <div className="mt-3 pt-3 border-t border-gray-100">
                {c.footer.split ? (
                  <div className="flex gap-5">
                    {c.footer.split.map(f => (
                      <div key={f.label}>
                        <p className="text-[10px] uppercase tracking-wide text-gray-400">{f.label}</p>
                        <p className="text-sm font-bold text-gray-700">{f.value}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <>
                    <p className="text-[10px] uppercase tracking-wide text-gray-400">{c.footer.label}</p>
                    <p className="text-xs font-semibold text-gray-700">{c.footer.value}</p>
                  </>
                )}
              </div>
            )}
            {c.cta && (
              <button onClick={c.cta.onClick} className="mt-3 text-xs font-semibold hover:underline" style={{ color: ACCENT }}>
                {c.cta.label} →
              </button>
            )}
          </div>
        ))}
      </div>

      {/* ── Middle row: Quick Actions | Calendar | Announcements ── */}
      <div className="grid gap-5 lg:grid-cols-3">

        {/* Quick Actions */}
        <div className="rounded-2xl border border-gray-100 bg-white shadow-sm">
          <div className="border-b border-gray-100 px-5 py-4">
            <h3 className="text-sm font-bold text-gray-900">Quick Actions</h3>
          </div>
          <div className="p-4 grid grid-cols-4 gap-y-4">
            {quickActions.map(({ label, Icon, tab, bg, fg }) => (
              <button
                key={label}
                onClick={() => tab && setActive(tab)}
                className="flex flex-col items-center gap-1.5 rounded-xl p-2 transition hover:bg-gray-50"
              >
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl transition group-hover:scale-105" style={{ background: bg }}>
                  <Icon size={18} style={{ color: fg }} />
                </div>
                <span className="text-[10px] font-medium text-gray-600 leading-tight text-center">{label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* My Calendar */}
        <div className="rounded-2xl border border-gray-100 bg-white shadow-sm">
          <div className="flex items-center gap-2 border-b border-gray-100 px-5 py-3.5">
            <h3 className="text-sm font-bold text-gray-900 flex-1">My Calendar</h3>
            <button onClick={prevMonth} className="rounded-lg border border-gray-200 p-1 hover:bg-gray-50 transition">
              <ChevronLeft size={13} className="text-gray-500" />
            </button>
            <span className="text-xs font-semibold text-gray-700 px-1">{MONTH_NAMES[calMonth].slice(0,3)} {calYear}</span>
            <button onClick={nextMonth} className="rounded-lg border border-gray-200 p-1 hover:bg-gray-50 transition">
              <ChevronRight size={13} className="text-gray-500" />
            </button>
            <button onClick={() => { setCalMonth(now.getMonth()); setCalYear(now.getFullYear()); }}
              className="text-xs font-semibold hover:underline ml-1" style={{ color: ACCENT }}>Today</button>
          </div>
          <div className="p-3">
            <div className="grid grid-cols-7 mb-1">
              {DAYS_OF_WEEK.map(d => (
                <div key={d} className="py-1 text-center text-[10px] font-bold uppercase text-gray-400">{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-y-0.5">
              {cells.map((day, idx) => {
                if (!day) return <div key={`e-${idx}`} />;
                const ds       = fmtCell(day);
                const rec      = statusMap[ds];
                const code     = rec?.code;
                const isToday  = ds === todayStr;
                const isWknd   = new Date(ds).getDay() === 0 || new Date(ds).getDay() === 6;
                const dotColor = code ? calDotColor(code) : (isWknd ? '#d1d5db' : null);
                return (
                  <div key={day} className="flex flex-col items-center py-0.5">
                    <div
                      className="flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-semibold"
                      style={{
                        backgroundColor: isToday ? ACCENT : 'transparent',
                        color:           isToday ? '#fff' : isWknd ? '#9ca3af' : '#374151',
                      }}
                    >
                      {day}
                    </div>
                    {dotColor && <div className="h-1.5 w-1.5 rounded-full mt-0.5" style={{ backgroundColor: dotColor }} />}
                  </div>
                );
              })}
            </div>
            <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 border-t border-gray-100 pt-2.5">
              {[['Leave','#8b5cf6'],['Holiday','#22c55e'],['Event','#f59e0b'],['Weekend','#d1d5db']].map(([l,c]) => (
                <div key={l} className="flex items-center gap-1">
                  <div className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: c }} />
                  <span className="text-[10px] text-gray-500">{l}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Announcements */}
        <div className="rounded-2xl border border-gray-100 bg-white shadow-sm flex flex-col">
          <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
            <h3 className="text-sm font-bold text-gray-900">Announcements</h3>
            <button className="text-xs font-semibold hover:underline" style={{ color: ACCENT }}>View All</button>
          </div>
          <div className="flex-1 divide-y divide-gray-50 overflow-y-auto">
            {announcements.length ? announcements.map((n, i) => (
              <div key={n.id || i} className="relative flex items-start gap-3 px-4 py-3.5">
                {!n.is_read && <span className="absolute left-0 top-3.5 bottom-3.5 w-[3px] rounded-full" style={{ background: ACCENT }} />}
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full" style={{ background: '#FEF3D6' }}>
                  <Bell size={13} style={{ color: '#B45309' }} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-gray-800 truncate">{n.title || (n.message || '').slice(0,40) || 'Notification'}</p>
                  <p className="mt-0.5 text-[11px] text-gray-500 line-clamp-2">{n.message}</p>
                  <p className="mt-1 text-[10px] text-gray-400">
                    {n.created_at ? new Date(n.created_at).toLocaleDateString('en-IN', { day:'2-digit', month:'short' }) : ''}
                  </p>
                </div>
              </div>
            )) : (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <Bell size={24} className="text-gray-300 mb-2" />
                <p className="text-sm text-gray-400">No announcements</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Attendance Summary + Upcoming Events ── */}
      <div className="grid gap-5 lg:grid-cols-3">

        {/* Attendance Summary */}
        <div className="lg:col-span-2 rounded-2xl border border-gray-100 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
            <h3 className="text-sm font-bold text-gray-900">My Attendance Summary</h3>
            <span className="rounded-lg border border-gray-200 px-3 py-1 text-xs font-semibold text-gray-600">
              {MONTH_NAMES[now.getMonth()]} {now.getFullYear()}
            </span>
          </div>
          <div className="p-5 flex flex-col sm:flex-row sm:items-center gap-5">
            {/* Circular progress ring */}
            <div className="relative mx-auto h-28 w-28 shrink-0 sm:mx-0">
              <svg viewBox="0 0 100 100" className="h-28 w-28 -rotate-90">
                <circle cx="50" cy="50" r="42" fill="none" stroke="#EEF2F9" strokeWidth="10" />
                <circle
                  cx="50" cy="50" r="42" fill="none" stroke={ACCENT} strokeWidth="10" strokeLinecap="round"
                  strokeDasharray={`${2 * Math.PI * 42}`}
                  strokeDashoffset={`${2 * Math.PI * 42 * (1 - attPct / 100)}`}
                  style={{ transition: 'stroke-dashoffset 0.6s ease' }}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-xl font-extrabold text-gray-900">{attPct}%</span>
                <span className="text-[10px] text-gray-400">Present</span>
              </div>
            </div>
            <div className="grid flex-1 grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: 'Total Days', val: attendance.working_days ?? '-', color: '#64748b' },
                { label: 'Present',    val: attendance.present      ?? 0,   color: ACCENT     },
                { label: 'Absent',     val: attendance.absent       ?? 0,   color: '#ef4444' },
                { label: 'Half Day',   val: attendance.half_day     ?? 0,   color: '#f59e0b' },
              ].map(({ label, val, color }) => (
                <div key={label} className="rounded-xl border border-gray-100 p-3 text-center">
                  <p className="text-2xl font-extrabold" style={{ color }}>{val}</p>
                  <p className="mt-1 text-[11px] text-gray-500">{label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Upcoming Events */}
        <div className="rounded-2xl border border-gray-100 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
            <h3 className="text-sm font-bold text-gray-900">Upcoming Events</h3>
            <button className="text-xs font-semibold hover:underline" style={{ color: ACCENT }}>View Full Calendar</button>
          </div>
          <div className="divide-y divide-gray-50">
            {announcements.slice(0, 4).map((n, i) => {
              const d = n.created_at ? new Date(n.created_at) : null;
              return (
                <div key={n.id || i} className="flex items-start gap-3 px-4 py-3.5">
                  {d && (
                    <div className="w-10 shrink-0 rounded-lg text-center py-2" style={{ background: '#EAF1FF' }}>
                      <p className="text-[9px] font-bold uppercase leading-tight" style={{ color: '#93B4F7' }}>
                        {d.toLocaleDateString('en-IN', { month: 'short' })}
                      </p>
                      <p className="text-lg font-extrabold leading-tight" style={{ color: ACCENT }}>{d.getDate()}</p>
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-gray-800">{n.title || 'Event'}</p>
                    <p className="text-[11px] text-gray-500 mt-0.5 line-clamp-2">{n.message}</p>
                  </div>
                </div>
              );
            })}
            {!announcements.length && (
              <div className="px-4 py-8 text-center text-sm text-gray-400">No upcoming events</div>
            )}
          </div>
        </div>
      </div>

      {/* ── Leave History + Recent Requests ── */}
      <div className="grid gap-5 lg:grid-cols-2">
        <SectionCard
          title="Leave History"
          action={<button onClick={() => setActive('leave')} className="text-xs font-semibold hover:underline" style={{ color: ACCENT }}>View All</button>}
        >
          <Table
            columns={[
              { key: 'leave_type_name', label: 'Type' },
              { key: 'from_date', label: 'From', render: r => String(r.from_date||'').slice(0,10) },
              { key: 'to_date',   label: 'To',   render: r => String(r.to_date  ||'').slice(0,10) },
              { key: 'status', label: 'Status', render: r => <StatusBadge value={r.status} /> },
            ]}
            rows={(leavesQ.data || []).slice(0, 5)}
          />
        </SectionCard>

        <SectionCard
          title="Recent Requests"
          action={<button onClick={() => setActive('hr-requests')} className="text-xs font-semibold hover:underline" style={{ color: ACCENT }}>View All</button>}
        >
          <Table
            columns={[
              { key: 'request_type', label: 'Type' },
              { key: 'subject',      label: 'Subject' },
              { key: 'status', label: 'Status', render: r => <StatusBadge value={r.status} /> },
            ]}
            rows={(serviceRequests || []).slice(0, 5)}
          />
        </SectionCard>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   PROFILE TAB
═══════════════════════════════════════════════════════════════ */
// Downscale + re-encode an image File to a small square JPEG data URI so the
// stored avatar stays tiny (a few KB) regardless of the original photo size.
function fileToAvatarDataUri(file, size = 256) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = size; canvas.height = size;
        const ctx = canvas.getContext('2d');
        // Center-crop to a square, then draw scaled into the canvas.
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

// Circular avatar showing the profile photo when present, else initials.
// When `editable`, overlays a camera button to upload and (if a photo exists)
// a small remove button.
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
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      {photo ? (
        <img
          src={photo}
          alt={name}
          className="h-full w-full rounded-full object-cover shadow ring-2 ring-white"
          style={{ width: size, height: size }}
        />
      ) : (
        <div
          className="flex h-full w-full items-center justify-center rounded-full font-bold text-white shadow"
          style={{ width: size, height: size, fontSize: size * 0.3, background: `linear-gradient(135deg, ${ACCENT} 0%, ${TEAL} 100%)` }}
        >
          {initials}
        </div>
      )}
      {editable && (
        <>
          <label
            className="absolute -bottom-1 -right-1 flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border-2 border-white bg-white shadow"
            title="Change photo"
            style={{ color: ACCENT }}
          >
            {busy
              ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300" style={{ borderTopColor: ACCENT }} />
              : <Camera size={15} />}
            <input type="file" accept="image/*" className="hidden" onChange={onPick} disabled={busy} />
          </label>
          {photo && !busy && (
            <button
              onClick={onRemove}
              title="Remove photo"
              className="absolute -top-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-white text-red-500 shadow"
            >
              <Trash2 size={12} />
            </button>
          )}
        </>
      )}
    </div>
  );
}

function ProfileTab({ profile, balances }) {
  const name = profile?.name || 'Employee';

  return (
    <div className="space-y-5">
      <SectionCard>
        <div className="flex items-start gap-6 p-2">
          <ProfilePhotoAvatar profile={profile} size={80} editable />
          <div>
            <p className="text-xl font-bold text-gray-900">{name}</p>
            <p className="text-sm text-gray-500">{profile?.designation_name || '—'}</p>
            <p className="mt-1 text-xs font-semibold text-gray-400">{profile?.employee_code}</p>
          </div>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-4 border-t border-gray-100 pt-5">
          {[
            ['Department',    profile?.department_name],
            ['Date of Joining', String(profile?.date_of_joining||'').slice(0,10)],
            ['Work Location', profile?.work_location],
            ['Email',         profile?.email],
          ].map(([lbl, val]) => val && (
            <div key={lbl}>
              <p className="text-[10px] uppercase tracking-wide text-gray-400">{lbl}</p>
              <p className="text-sm font-semibold text-gray-800 mt-0.5">{val || '—'}</p>
            </div>
          ))}
        </div>
      </SectionCard>

      {/* Leave balances */}
      {(balances || []).length > 0 && (
        <SectionCard title="Leave Balances">
          <div className="flex flex-wrap gap-4">
            {(balances || []).map((b) => {
              const taken   = Number(b.taken   ?? 0);
              const accrued = Number(b.accrued ?? 0);
              const avail   = Number(b.closing_balance ?? 0);
              const pct     = accrued > 0 ? Math.min(100, Math.round((taken / accrued) * 100)) : 0;
              return (
                <div key={b.leave_type_id} className="min-w-[150px] rounded-xl border border-gray-200 p-4 bg-gray-50">
                  <p className="text-xs font-semibold text-gray-500 truncate">{b.leave_type_name}</p>
                  <p className="mt-2 text-3xl font-extrabold" style={{ color: ACCENT }}>{avail.toFixed(1)}</p>
                  <p className="text-[11px] text-gray-400">Available</p>
                  <div className="mt-2 h-1.5 w-full rounded-full bg-gray-200">
                    <div className="h-1.5 rounded-full" style={{ width: `${pct}%`, backgroundColor: ACCENT }} />
                  </div>
                  <p className="mt-1 text-[10px] text-gray-400">{taken} taken / {accrued} accrued</p>
                </div>
              );
            })}
          </div>
        </SectionCard>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   ATTENDANCE TAB
═══════════════════════════════════════════════════════════════ */
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

  return (
    <div className="space-y-5">
      {/* Calendar */}
      <SectionCard>
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <button onClick={prevMonth} className="rounded-lg border border-gray-200 p-1.5 hover:bg-gray-50 transition">
            <ChevronLeft size={16} className="text-gray-600" />
          </button>
          <h3 className="text-base font-bold text-gray-900">{MONTH_NAMES[calMonth]} {calYear}</h3>
          <button onClick={nextMonth} className="rounded-lg border border-gray-200 p-1.5 hover:bg-gray-50 transition">
            <ChevronRight size={16} className="text-gray-600" />
          </button>
        </div>
        <div className="p-4">
          <div className="grid grid-cols-7 mb-2">
            {DAYS_OF_WEEK.map(d => (
              <div key={d} className="py-1 text-center text-[11px] font-bold uppercase text-gray-400">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {cells.map((day, idx) => {
              if (!day) return <div key={`e-${idx}`} />;
              const ds      = formatDay(day);
              const rec     = statusMap[ds];
              const st      = rec?.code ? (STATUS_STYLE[rec.code] || STATUS_STYLE.P) : null;
              const isToday = ds === todayStr;
              return (
                <div
                  key={day}
                  title={rec ? `${rec.code}${rec.inTime ? ' — In: ' + String(rec.inTime).slice(0,5) : ''}${rec.lateMin ? ' — Late: ' + rec.lateMin + 'm' : ''}` : undefined}
                  className={`relative flex h-9 w-full flex-col items-center justify-center rounded-lg text-xs font-semibold transition ${
                    st ? `${st.bg} ${st.text}` : isToday ? 'ring-2 text-gray-700' : 'text-gray-600 hover:bg-gray-100'
                  }`}
                  style={isToday ? { ringColor: ACCENT } : {}}
                >
                  {isToday && !st && (
                    <span className="absolute inset-0 rounded-lg ring-2 pointer-events-none" style={{ ringColor: ACCENT, outlineColor: ACCENT, outline: `2px solid ${ACCENT}` }} />
                  )}
                  {day}
                  {st && <span className="text-[9px] font-bold leading-none">{st.label}</span>}
                </div>
              );
            })}
          </div>
          {/* Legend */}
          <div className="mt-4 flex flex-wrap gap-4 border-t border-gray-100 pt-3">
            {Object.entries(STATUS_STYLE).map(([k, v]) => (
              <div key={k} className="flex items-center gap-1.5">
                <span className={`inline-flex h-5 w-8 items-center justify-center rounded text-[10px] font-bold ${v.bg} ${v.text}`}>{v.label}</span>
                <span className="text-xs text-gray-500">{{ P:'Present',A:'Absent',L:'Leave',HD:'Half Day',WO:'Week Off',H:'Holiday' }[k]}</span>
              </div>
            ))}
          </div>
        </div>
      </SectionCard>

      {/* Correction form */}
      <SectionCard title="Attendance Correction" subtitle="Missed punch or wrong status — raise a correction request">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field title="Date">
            <input type="date" className={inputCls} value={correction.attendance_date}
              onChange={e => setCorrection({ ...correction, attendance_date: e.target.value })} />
          </Field>
          <Field title="Requested Status">
            <select className={inputCls} value={correction.requested_status}
              onChange={e => setCorrection({ ...correction, requested_status: e.target.value })}>
              <option value="present">Present</option>
              <option value="half_day">Half Day</option>
              <option value="on_duty">On Duty</option>
            </select>
          </Field>
          <Field title="In Time">
            <input type="time" className={inputCls} value={correction.requested_in_time}
              onChange={e => setCorrection({ ...correction, requested_in_time: e.target.value })} />
          </Field>
          <Field title="Out Time">
            <input type="time" className={inputCls} value={correction.requested_out_time}
              onChange={e => setCorrection({ ...correction, requested_out_time: e.target.value })} />
          </Field>
          <Field title="Reason">
            <input className={inputCls} value={correction.reason} placeholder="Reason for correction"
              onChange={e => setCorrection({ ...correction, reason: e.target.value })} />
          </Field>
        </div>
        <div className="mt-4">
          <GreenBtn disabled={!correction.reason} onClick={() => createCorrection.mutate(correction)}>
            Submit Correction
          </GreenBtn>
        </div>
      </SectionCard>

      {/* Correction history */}
      <SectionCard title="My Correction Requests">
        <Table
          columns={[
            { key: 'attendance_date',  label: 'Date',    render: r => String(r.attendance_date||'').slice(0,10) },
            { key: 'requested_status', label: 'Status'  },
            { key: 'reason',           label: 'Reason'  },
            { key: 'status',           label: 'Approval', render: r => <StatusBadge value={r.status} /> },
          ]}
          rows={corrections.data || []}
        />
      </SectionCard>

      {/* Biometric Swipe Logs */}
      <SectionCard
        title="Biometric Swipe Logs"
        subtitle="All punches recorded by the ESSL device for your card"
      >
        <div className="mb-4 flex items-center gap-2 flex-wrap">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Show last</span>
          {[7, 14, 30, 60].map(d => (
            <button
              key={d}
              onClick={() => setSwipeDays(d)}
              className="text-xs font-bold px-3 py-1 rounded-full border transition"
              style={{
                background:  swipeDays === d ? DARK : '#fff',
                color:       swipeDays === d ? '#fff' : '#64748b',
                borderColor: swipeDays === d ? DARK : '#d1d5db',
              }}
            >
              {d} days
            </button>
          ))}
        </div>

        {swipes.isLoading ? (
          <p className="text-sm text-gray-400 py-4 text-center">Loading swipes…</p>
        ) : !(swipes.data || []).length ? (
          <div className="py-8 text-center">
            <p className="text-sm font-semibold text-gray-400">No swipe records found for the last {swipeDays} days</p>
            <p className="text-xs text-gray-300 mt-1">Biometric data syncs automatically from the ESSL device</p>
          </div>
        ) : (
          <div className="space-y-4">
            {groupByDate(swipes.data || []).map(([date, daySwipes]) => {
              const d        = new Date(date + 'T00:00:00');
              const dayLabel = d.toLocaleDateString('en-IN', { weekday:'short', day:'2-digit', month:'short', year:'numeric' });
              const isIn     = s => String(s.direction||'').toLowerCase().includes('in')  || s.direction === '0';
              const isOut    = s => String(s.direction||'').toLowerCase().includes('out') || s.direction === '1';
              const firstIn  = daySwipes.find(isIn);
              const lastOut  = [...daySwipes].reverse().find(isOut);
              const totalPunches = daySwipes.length;

              return (
                <div key={date} className="rounded-xl border border-gray-100 overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-2.5" style={{ background: DARK }}>
                    <span className="text-xs font-bold text-white">{dayLabel}</span>
                    <div className="flex items-center gap-3">
                      {firstIn && (
                        <span className="text-[11px] text-blue-200">
                          First In: <span className="font-bold text-white">{(() => { const t = esslTime(firstIn.swipe_time); return fmt12(t.h, t.m); })()}</span>
                        </span>
                      )}
                      {lastOut && (
                        <span className="text-[11px] text-blue-200">
                          Last Out: <span className="font-bold text-white">{(() => { const t = esslTime(lastOut.swipe_time); return fmt12(t.h, t.m); })()}</span>
                        </span>
                      )}
                      <span className="text-[11px] bg-white/20 text-white rounded-full px-2 py-0.5 font-bold">{totalPunches} punch{totalPunches !== 1 ? 'es' : ''}</span>
                    </div>
                  </div>
                  <div className="divide-y divide-gray-50 bg-white">
                    {daySwipes.map((s, i) => {
                      const et      = esslTime(s.swipe_time);
                      const timeStr = fmt12(et.h, et.m, et.s);
                      return (
                        <div key={i} className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 transition-colors">
                          <div className="w-8 text-center text-xs font-black text-gray-400 tabular-nums">{i + 1}</div>
                          <SwipeDir direction={s.direction} />
                          <span className="text-sm font-bold text-gray-800 tabular-nums">{timeStr}</span>
                          {s.source && (
                            <span className="ml-auto text-[10px] text-gray-300 uppercase tracking-wide">{s.source}</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </SectionCard>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   LEAVE TAB
═══════════════════════════════════════════════════════════════ */
function LeaveTab({ leaveTypes }) {
  const qc      = useQueryClient();
  const balances = useQuery({ queryKey: ['ess-leave-balances'],  queryFn: () => essAPI.leaveBalances().then(unwrap) });
  const requests = useQuery({ queryKey: ['ess-leave-requests'],  queryFn: () => essAPI.leaveRequests().then(unwrap) });
  const [leave, setLeave] = useState({ leave_type_id: '', from_date: today(), to_date: today(), reason: '' });
  const refresh = () => ['ess-leave-balances','ess-leave-requests','ess-summary','ess-leave-requests-dash'].forEach(k => qc.invalidateQueries({ queryKey: [k] }));
  const createLeave = useMutation({
    mutationFn: essAPI.createLeaveRequest,
    onSuccess: () => { toast.success('Leave requested'); setLeave({ ...leave, reason: '' }); refresh(); },
  });
  const cancelLeave = useMutation({ mutationFn: essAPI.cancelLeaveRequest, onSuccess: refresh });

  return (
    <div className="space-y-5">
      <div className="flex gap-4 overflow-x-auto pb-1">
        {(balances.data || []).map((b) => {
          const taken   = Number(b.taken   ?? 0);
          const accrued = Number(b.accrued ?? 0);
          const avail   = Number(b.closing_balance ?? 0);
          const pct     = accrued > 0 ? Math.min(100, Math.round((taken / accrued) * 100)) : 0;
          return (
            <div key={b.leave_type_id} className="min-w-[150px] rounded-xl border border-gray-200 bg-white p-4 shadow-sm shrink-0">
              <p className="text-xs font-semibold text-gray-500 truncate">{b.leave_type_name}</p>
              <p className="mt-2 text-3xl font-extrabold" style={{ color: ACCENT }}>{avail.toFixed(1)}</p>
              <p className="text-[11px] text-gray-400">Available</p>
              <div className="mt-3 h-1.5 w-full rounded-full bg-gray-100">
                <div className="h-1.5 rounded-full" style={{ width: `${pct}%`, backgroundColor: ACCENT }} />
              </div>
              <p className="mt-1 text-[10px] text-gray-400">{taken} taken / {accrued} accrued</p>
            </div>
          );
        })}
      </div>

      <SectionCard title="Apply Leave" subtitle="Submit a new leave request">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field title="Leave Type">
            <select className={inputCls} value={leave.leave_type_id}
              onChange={e => setLeave({ ...leave, leave_type_id: e.target.value })}>
              <option value="">Select leave type</option>
              {leaveTypes.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </Field>
          <Field title="From Date">
            <input type="date" className={inputCls} value={leave.from_date}
              onChange={e => setLeave({ ...leave, from_date: e.target.value })} />
          </Field>
          <Field title="To Date">
            <input type="date" className={inputCls} value={leave.to_date}
              onChange={e => setLeave({ ...leave, to_date: e.target.value })} />
          </Field>
          <Field title="Reason">
            <input className={inputCls} value={leave.reason} placeholder="Reason for leave"
              onChange={e => setLeave({ ...leave, reason: e.target.value })} />
          </Field>
        </div>
        <div className="mt-4">
          <GreenBtn disabled={!leave.leave_type_id} onClick={() => createLeave.mutate(leave)}>
            Apply Leave
          </GreenBtn>
        </div>
      </SectionCard>

      <SectionCard title="Leave Request History">
        <Table
          columns={[
            { key: 'leave_type_name', label: 'Type'   },
            { key: 'from_date', label: 'From', render: r => String(r.from_date||'').slice(0,10) },
            { key: 'to_date',   label: 'To',   render: r => String(r.to_date  ||'').slice(0,10) },
            { key: 'days',      label: 'Days'  },
            { key: 'status',    label: 'Status', render: r => <StatusBadge value={r.status} /> },
            { key: 'actions',   label: 'Action', render: r => r.status === 'pending'
                ? <button onClick={() => cancelLeave.mutate(r.id)}
                    className="rounded-md border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-600 hover:bg-red-100 transition">
                    Cancel
                  </button>
                : '-'
            },
          ]}
          rows={requests.data || []}
        />
      </SectionCard>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   PAYSLIPS TAB
═══════════════════════════════════════════════════════════════ */
function PayslipsTab() {
  const navigate = useNavigate();
  const payslips = useQuery({ queryKey: ['ess-payslips'], queryFn: () => essAPI.payslips().then(unwrap) });
  return (
    <SectionCard title="Payslips" subtitle="Approved and paid payslips">
      <Table
        columns={[
          { key: 'month',            label: 'Month' },
          { key: 'year',             label: 'Year'  },
          { key: 'gross_earnings',   label: 'Gross',      render: r => `₹${Number(r.gross_earnings  ||0).toLocaleString('en-IN')}` },
          { key: 'total_deductions', label: 'Deductions', render: r => `₹${Number(r.total_deductions||0).toLocaleString('en-IN')}` },
          { key: 'net_pay',          label: 'Net Pay',    render: r => (
            <span className="font-bold" style={{ color: ACCENT }}>₹{Number(r.net_pay||0).toLocaleString('en-IN')}</span>
          )},
          { key: 'status', label: 'Status', render: r => <StatusBadge value={r.status} /> },
          { key: 'actions', label: 'Payslip', render: r => (
            <button
              onClick={() => navigate(`/hr-admin/payroll/${r.id}/payslip`)}
              className="inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-semibold text-white transition hover:opacity-90"
              style={{ backgroundColor: ACCENT }}
            >
              <Printer size={12} /> Print
            </button>
          )},
        ]}
        rows={payslips.data || []}
      />
    </SectionCard>
  );
}

/* ═══════════════════════════════════════════════════════════════
   DOCUMENTS TAB
═══════════════════════════════════════════════════════════════ */
function DocumentsTab({ policies, userId }) {
  const qc = useQueryClient();
  const [doc, setDoc] = useState({ file: null, doc_type: 'employee_document', doc_name: '' });
  const documents = useQuery({ queryKey: ['ess-documents'], queryFn: () => essAPI.documents().then(unwrap) });
  const acks = useQuery({
    queryKey: ['ess-policy-acks', userId],
    queryFn:  () => hrAdvancedAPI.listPolicyAcks({ user_id: userId }).then(unwrap),
    enabled:  Boolean(userId),
  });
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
    <div className="space-y-5">
      <SectionCard title="Upload Document" subtitle="Upload profile and HR documents">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field title="Document Type">
            <select className={inputCls} value={doc.doc_type} onChange={e => setDoc({ ...doc, doc_type: e.target.value })}>
              <option value="employee_document">Employee Document</option>
              <option value="id_proof">ID Proof</option>
              <option value="address_proof">Address Proof</option>
              <option value="certificate">Certificate</option>
            </select>
          </Field>
          <Field title="Document Name">
            <input className={inputCls} value={doc.doc_name} onChange={e => setDoc({ ...doc, doc_name: e.target.value })} />
          </Field>
          <Field title="File">
            <input type="file" className={inputCls} onChange={e => setDoc({ ...doc, file: e.target.files?.[0] || null })} />
          </Field>
        </div>
        <div className="mt-4">
          <GreenBtn disabled={!doc.file} onClick={() => upload.mutate()}>
            <Upload size={16} /> Upload Document
          </GreenBtn>
        </div>
      </SectionCard>

      <SectionCard title="My Documents">
        <Table
          columns={[
            { key: 'doc_type',    label: 'Type' },
            { key: 'doc_name',    label: 'Name' },
            { key: 'uploaded_at', label: 'Uploaded', render: r => String(r.uploaded_at||'').slice(0,10) },
          ]}
          rows={documents.data || []}
        />
      </SectionCard>

      <SectionCard title="Policy Acknowledgement" subtitle="Read and acknowledge published company policies">
        <Table
          columns={[
            { key: 'title',          label: 'Policy'   },
            { key: 'category',       label: 'Category' },
            { key: 'version',        label: 'Version'  },
            { key: 'effective_date', label: 'Effective', render: r => String(r.effective_date||'').slice(0,10) },
            { key: 'actions', label: 'Status', render: r => acked.has(r.id)
                ? <span className="rounded-full border border-green-200 bg-green-50 px-2.5 py-0.5 text-[11px] font-semibold text-green-700">Acknowledged</span>
                : <button className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-0.5 text-[11px] font-semibold text-blue-700 hover:bg-blue-100 transition"
                    onClick={() => acknowledge.mutate(r.id)}>Acknowledge</button>
            },
          ]}
          rows={policies}
        />
      </SectionCard>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   HR REQUESTS TAB
═══════════════════════════════════════════════════════════════ */
function HRRequestsTab({ serviceRequests }) {
  const qc = useQueryClient();
  const [reqForm, setReqForm] = useState({ request_type: 'certificate', priority: 'normal', subject: '', description: '' });
  const createRequest = useMutation({
    mutationFn: () => hrAdvancedAPI.createServiceRequest(reqForm),
    onSuccess:  () => { toast.success('HR request created'); setReqForm({ request_type: 'certificate', priority: 'normal', subject: '', description: '' }); qc.invalidateQueries({ queryKey: ['ess-hr-requests'] }); },
  });
  return (
    <div className="space-y-5">
      <SectionCard title="Raise HR Request" subtitle="Certificates, payroll queries, corrections, document support">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field title="Request Type">
            <select className={inputCls} value={reqForm.request_type} onChange={e => setReqForm({ ...reqForm, request_type: e.target.value })}>
              <option value="certificate">Certificate / Letter</option>
              <option value="payroll">Payroll Query</option>
              <option value="attendance">Attendance Issue</option>
              <option value="leave">Leave Query</option>
              <option value="documents">Document Correction</option>
              <option value="general">General</option>
            </select>
          </Field>
          <Field title="Priority">
            <select className={inputCls} value={reqForm.priority} onChange={e => setReqForm({ ...reqForm, priority: e.target.value })}>
              <option value="low">Low</option>
              <option value="normal">Normal</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
          </Field>
          <Field title="Subject">
            <input className={inputCls} value={reqForm.subject} placeholder="Brief subject"
              onChange={e => setReqForm({ ...reqForm, subject: e.target.value })} />
          </Field>
          <Field title="Description">
            <input className={inputCls} value={reqForm.description} placeholder="Details"
              onChange={e => setReqForm({ ...reqForm, description: e.target.value })} />
          </Field>
        </div>
        <div className="mt-4">
          <GreenBtn disabled={!reqForm.subject} onClick={() => createRequest.mutate()}>
            Create Request
          </GreenBtn>
        </div>
      </SectionCard>

      <SectionCard title="My HR Requests">
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
      </SectionCard>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   MANAGER DESK TAB
═══════════════════════════════════════════════════════════════ */
function ManagerDeskTab() {
  const qc          = useQueryClient();
  const leaves      = useQuery({ queryKey: ['ess-manager-leaves'],      queryFn: () => essAPI.managerLeaveRequests({ status: 'pending' }).then(unwrap), retry: false });
  const corrections = useQuery({ queryKey: ['ess-manager-corrections'], queryFn: () => essAPI.managerCorrections({ status: 'pending' }).then(unwrap), retry: false });
  const refresh     = () => { qc.invalidateQueries({ queryKey: ['ess-manager-leaves'] }); qc.invalidateQueries({ queryKey: ['ess-manager-corrections'] }); };
  const leaveAction      = useMutation({ mutationFn: ({ id, action }) => essAPI.managerLeaveAction(id, action),      onSuccess: refresh });
  const correctionAction = useMutation({ mutationFn: ({ id, action }) => essAPI.managerCorrectionAction(id, action), onSuccess: refresh });

  if (leaves.error?.response?.status === 403 && corrections.error?.response?.status === 403) {
    return (
      <SectionCard title="Manager Desk">
        <p className="text-sm text-gray-500">No manager approvals are available for this login.</p>
      </SectionCard>
    );
  }

  const ActionButtons = ({ onApprove, onReject }) => (
    <div className="flex gap-2">
      <button onClick={onApprove} className="rounded-md border border-green-200 bg-green-50 px-2.5 py-1 text-xs font-semibold text-green-700 hover:bg-green-100 transition">Approve</button>
      <button onClick={onReject}  className="rounded-md border border-red-200   bg-red-50   px-2.5 py-1 text-xs font-semibold text-red-600   hover:bg-red-100   transition">Reject</button>
    </div>
  );

  return (
    <div className="space-y-5">
      <SectionCard title="Leave Approvals" subtitle="Pending team leave requests">
        <Table
          columns={[
            { key: 'employee_name',   label: 'Employee' },
            { key: 'leave_type_name', label: 'Type'     },
            { key: 'from_date', label: 'From', render: r => String(r.from_date||'').slice(0,10) },
            { key: 'to_date',   label: 'To',   render: r => String(r.to_date  ||'').slice(0,10) },
            { key: 'days',            label: 'Days'     },
            { key: 'actions', label: 'Action', render: r => (
              <ActionButtons
                onApprove={() => leaveAction.mutate({ id: r.id, action: 'approve' })}
                onReject={()  => leaveAction.mutate({ id: r.id, action: 'reject'  })}
              />
            )},
          ]}
          rows={leaves.data || []}
        />
      </SectionCard>

      <SectionCard title="Attendance Corrections" subtitle="Pending attendance corrections from your team">
        <Table
          columns={[
            { key: 'employee_name',    label: 'Employee' },
            { key: 'attendance_date',  label: 'Date',    render: r => String(r.attendance_date||'').slice(0,10) },
            { key: 'requested_status', label: 'Status'   },
            { key: 'reason',           label: 'Reason'   },
            { key: 'actions', label: 'Action', render: r => (
              <ActionButtons
                onApprove={() => correctionAction.mutate({ id: r.id, action: 'approve' })}
                onReject={()  => correctionAction.mutate({ id: r.id, action: 'reject'  })}
              />
            )},
          ]}
          rows={corrections.data || []}
        />
      </SectionCard>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   TRAINING TAB
═══════════════════════════════════════════════════════════════ */
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

  const requirements = useQuery({
    queryKey: ['ess-training-requirements'],
    queryFn:  () => essAPI.trainingRequirements().then(unwrap),
  });
  const requests = useQuery({
    queryKey: ['ess-training-requests'],
    queryFn:  () => essAPI.trainingRequests().then(unwrap),
  });

  const [form, setForm] = useState({ training_name: '', category: '', reason: '', preferred_date: '' });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const submit = useMutation({
    mutationFn: () => essAPI.createTrainingRequest(form),
    onSuccess: () => {
      toast.success('Training request submitted');
      setForm({ training_name: '', category: '', reason: '', preferred_date: '' });
      qc.invalidateQueries({ queryKey: ['ess-training-requests'] });
    },
    onError: (e) => toast.error(e?.response?.data?.error || 'Failed to submit'),
  });

  const reqs = requirements.data || [];
  const myRequests = requests.data || [];

  return (
    <div className="space-y-5 max-w-5xl mx-auto">

      {/* Header */}
      <div className="rounded-2xl p-6 text-white" style={{ background: `linear-gradient(135deg, ${DARK}, #1e5a8a)` }}>
        <div className="flex items-center gap-3 mb-1">
          <Award size={22} className="text-white/80" />
          <h2 className="text-xl font-bold">Training & Development</h2>
        </div>
        <p className="text-white/60 text-sm">View your training requirements and request new training programs</p>
      </div>

      {/* Training requirements from performance evaluation */}
      {reqs.length > 0 && (
        <SectionCard
          title="Training Required (from Performance Review)"
          subtitle="Training needs identified by your reporting manager"
        >
          <div className="space-y-3">
            {reqs.map(r => (
              <div key={r.id} className="flex gap-4 p-4 rounded-xl bg-amber-50 border border-amber-100">
                <div className="flex-shrink-0 w-10 h-10 rounded-full bg-amber-200 flex items-center justify-center">
                  <Award size={18} className="text-amber-700" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="text-xs font-bold text-amber-800 uppercase tracking-wide">
                      {r.eval_period} · {r.review_type === 'quarterly' ? 'Quarterly' : 'Monthly'} Review
                    </span>
                    {r.overall_rating && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-white border border-amber-200 text-amber-700">
                        {r.overall_rating}
                      </span>
                    )}
                    {r.eval_date && (
                      <span className="text-[10px] text-amber-500">
                        {String(r.eval_date).slice(0, 10)}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-800 whitespace-pre-wrap">{r.training_required}</p>
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      {/* Request Training Form */}
      <SectionCard title="Request Training" subtitle="Submit a request for a training program you need">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <label className={labelCls}>Training / Course Name *</label>
            <input className={inputCls} value={form.training_name}
              onChange={e => set('training_name', e.target.value)}
              placeholder="e.g. Fire Safety, Crane Operation, First Aid…" />
          </div>
          <div>
            <label className={labelCls}>Category</label>
            <select className={inputCls} value={form.category} onChange={e => set('category', e.target.value)}>
              <option value="">Select category…</option>
              {TRAINING_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Preferred Date</label>
            <input type="date" className={inputCls} value={form.preferred_date}
              onChange={e => set('preferred_date', e.target.value)} />
          </div>
          <div className="md:col-span-2">
            <label className={labelCls}>Reason / Justification</label>
            <textarea rows={3} className={inputCls} value={form.reason}
              onChange={e => set('reason', e.target.value)}
              placeholder="Why do you need this training?" />
          </div>
        </div>
        <div className="mt-4 flex justify-end">
          <button
            disabled={!form.training_name || submit.isPending}
            onClick={() => submit.mutate()}
            className="px-6 py-2 rounded-lg text-white text-sm font-semibold disabled:opacity-50"
            style={{ background: ACCENT }}
          >
            {submit.isPending ? 'Submitting…' : 'Submit Request'}
          </button>
        </div>
      </SectionCard>

      {/* My Training Requests */}
      <SectionCard title="My Training Requests" subtitle="Track the status of your submitted training requests">
        {requests.isLoading ? (
          <p className="text-sm text-gray-400 py-4 text-center">Loading…</p>
        ) : myRequests.length === 0 ? (
          <div className="text-center py-8 text-gray-400">
            <Award size={32} className="mx-auto mb-2 opacity-30" />
            <p className="text-sm">No training requests submitted yet</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left py-2.5 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Training</th>
                  <th className="text-left py-2.5 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Category</th>
                  <th className="text-left py-2.5 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Preferred Date</th>
                  <th className="text-left py-2.5 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                  <th className="text-left py-2.5 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Actioned By</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {myRequests.map(r => {
                  const sc = STATUS_COLORS[r.status] || STATUS_COLORS.pending;
                  return (
                    <tr key={r.id} className="hover:bg-gray-50">
                      <td className="py-3 px-3">
                        <p className="font-medium text-gray-800">{r.training_name}</p>
                        {r.reason && <p className="text-xs text-gray-400 mt-0.5 truncate max-w-[220px]">{r.reason}</p>}
                      </td>
                      <td className="py-3 px-3 text-gray-600 text-xs">{r.category || '—'}</td>
                      <td className="py-3 px-3 text-gray-600 text-xs">
                        {r.preferred_date ? String(r.preferred_date).slice(0, 10) : '—'}
                      </td>
                      <td className="py-3 px-3">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${sc.bg} ${sc.text}`}>
                          {sc.label}
                        </span>
                        {r.rejection_reason && (
                          <p className="text-[10px] text-red-400 mt-0.5">{r.rejection_reason}</p>
                        )}
                      </td>
                      <td className="py-3 px-3 text-gray-500 text-xs">{r.actioned_by_name || '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      {/* Training categories reference */}
      <SectionCard title="Training Categories Available" subtitle="Types of training programs offered at BCIM">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[
            { label: 'Safety & HSE',          icon: '🦺', color: 'bg-red-50 border-red-100 text-red-700'      },
            { label: 'Technical Skills',       icon: '⚙️', color: 'bg-blue-50 border-blue-100 text-blue-700'   },
            { label: 'Quality Assurance',      icon: '✅', color: 'bg-green-50 border-green-100 text-green-700'},
            { label: 'Housekeeping & 5S',      icon: '🧹', color: 'bg-yellow-50 border-yellow-100 text-yellow-700'},
            { label: 'Soft Skills',            icon: '🤝', color: 'bg-purple-50 border-purple-100 text-purple-700'},
            { label: 'Induction',              icon: '📋', color: 'bg-indigo-50 border-indigo-100 text-indigo-700'},
            { label: 'Compliance',             icon: '⚖️', color: 'bg-gray-50 border-gray-200 text-gray-700'   },
            { label: 'Equipment Operation',    icon: '🏗️', color: 'bg-orange-50 border-orange-100 text-orange-700'},
            { label: 'First Aid / Emergency',  icon: '🩺', color: 'bg-pink-50 border-pink-100 text-pink-700'   },
            { label: 'Other',                  icon: '📚', color: 'bg-teal-50 border-teal-100 text-teal-700'   },
          ].map(({ label, icon, color }) => (
            <div key={label} className={`flex flex-col items-center gap-2 p-3 rounded-xl border text-center cursor-pointer ${color}`}
              onClick={() => { set('category', label); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>
              <span className="text-2xl">{icon}</span>
              <span className="text-xs font-semibold leading-tight">{label}</span>
            </div>
          ))}
        </div>
        <p className="text-xs text-gray-400 mt-3 text-center">Click a category to pre-fill your training request above</p>
      </SectionCard>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   COMING SOON PLACEHOLDER
═══════════════════════════════════════════════════════════════ */
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

/* ═══════════════════════════════════════════════════════════════
   ROOT PAGE
═══════════════════════════════════════════════════════════════ */
const FUNCTIONAL_TABS = new Set(['dashboard','profile','attendance','leave','payslips','documents','hr-requests','manager','training']);

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
    <div className="flex min-h-screen" style={{ backgroundColor: BG, fontFamily: "'Inter', system-ui, sans-serif" }}>
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
          {!FUNCTIONAL_TABS.has(active) && <ComingSoon label={navLabel} />}
        </div>
      </div>
    </div>
  );
}
