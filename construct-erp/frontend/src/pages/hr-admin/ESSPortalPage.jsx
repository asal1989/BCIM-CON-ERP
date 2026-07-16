import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BadgeIndianRupee, Bell, Briefcase, CalendarCheck, CalendarOff, CheckCircle2,
  FileText, FolderUp, Headphones, Monitor, ShieldCheck, UserRound, Printer, ExternalLink,
  ChevronLeft, ChevronRight, Upload,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { essAPI, hrAdvancedAPI } from '../../api/client';
import { useNavigate } from 'react-router-dom';

/* ─── helpers ─── */
const unwrap = (res) => res?.data?.data || [];
const today = () => new Date().toISOString().slice(0, 10);

const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];

/* ─── design tokens ─── */
const GREEN = '#16a34a';
const NAVY  = '#1e3a5f';
const BG    = '#F0F2F5';

/* ─── tiny primitives ─── */
const inputCls = 'w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-green-600 focus:ring-2 focus:ring-green-100 transition';
const labelCls = 'mb-1 block text-xs font-semibold text-gray-600 uppercase tracking-wide';

function Field({ title, children }) {
  return <div><label className={labelCls}>{title}</label>{children}</div>;
}

/* ─── reusable Table ─── */
function Table({ columns, rows, empty = 'No records found' }) {
  return (
    <div className="overflow-auto rounded-lg border border-gray-200">
      <table className="min-w-full divide-y divide-gray-200 text-sm">
        <thead style={{ backgroundColor: NAVY }}>
          <tr>
            {columns.map((c) => (
              <th key={c.key} className="px-3 py-2.5 text-left text-[11px] font-bold uppercase tracking-wide text-white whitespace-nowrap">
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

/* ─── status badge ─── */
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

/* ─── green primary button ─── */
function GreenBtn({ children, disabled, onClick, className = '' }) {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-semibold text-white transition disabled:opacity-50 ${className}`}
      style={{ backgroundColor: disabled ? '#9ca3af' : GREEN }}
    >
      {children}
    </button>
  );
}

/* ─── section card ─── */
function SectionCard({ title, subtitle, children, noPad }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
      {(title || subtitle) && (
        <div className="border-b border-gray-100 px-5 py-4">
          {title && <h3 className="text-base font-bold text-gray-900">{title}</h3>}
          {subtitle && <p className="mt-0.5 text-xs text-gray-500">{subtitle}</p>}
        </div>
      )}
      <div className={noPad ? '' : 'p-5'}>{children}</div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   SIDEBAR
═══════════════════════════════════════════════════════════════ */
function Sidebar({ profile, balances }) {
  const name = profile?.name || 'Employee';
  const initials = name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  return (
    <aside className="w-64 shrink-0">
      <div className="sticky top-6 rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        {/* avatar band */}
        <div className="flex flex-col items-center px-5 py-6" style={{ background: `linear-gradient(135deg, ${NAVY} 0%, #2d6a9f 100%)` }}>
          <div
            className="flex h-20 w-20 items-center justify-center rounded-full text-2xl font-bold text-white shadow-lg"
            style={{ background: 'linear-gradient(135deg, #16a34a 0%, #059669 100%)' }}
          >
            {initials}
          </div>
          <p className="mt-3 text-center text-base font-bold text-white leading-tight">{profile?.name || '-'}</p>
          <p className="mt-1 text-xs text-blue-200">{profile?.employee_code || '-'}</p>
        </div>

        {/* details */}
        <div className="px-4 py-4 space-y-2">
          {[
            ['Designation', profile?.designation_name],
            ['Department', profile?.department_name],
            ['Joining', String(profile?.date_of_joining || '').slice(0, 10)],
            ['Location', profile?.work_location],
          ].map(([k, v]) => (
            <div key={k} className="flex justify-between gap-2 text-xs">
              <span className="text-gray-500 shrink-0">{k}</span>
              <span className="font-semibold text-gray-800 text-right">{v || '-'}</span>
            </div>
          ))}
        </div>

        {/* leave balance mini-list */}
        {(balances || []).length > 0 && (
          <>
            <div className="mx-4 border-t border-gray-100" />
            <div className="px-4 py-4">
              <p className="mb-3 text-[11px] font-bold uppercase tracking-wide text-gray-500">Leave Balances</p>
              <div className="space-y-2">
                {(balances || []).map((b) => (
                  <div key={b.leave_type_id} className="flex items-center justify-between gap-2">
                    <span className="text-xs text-gray-700 truncate">{b.leave_type_name}</span>
                    <span
                      className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold text-white"
                      style={{ backgroundColor: GREEN }}
                    >
                      {Number(b.closing_balance ?? 0).toFixed(1)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </aside>
  );
}

/* ═══════════════════════════════════════════════════════════════
   DASHBOARD TAB
═══════════════════════════════════════════════════════════════ */
function DashboardTab({ summary, balances, serviceRequests }) {
  const attendance = summary?.attendance || {};
  const payroll    = summary?.payroll   || {};
  const leave      = summary?.leave     || {};
  const navigate   = useNavigate();

  const nowDate  = new Date();
  const monthLabel = MONTH_NAMES[nowDate.getMonth()];

  /* latest payslip query comes via summary.payroll */
  return (
    <div className="space-y-5">
      {/* 1 ── Attendance summary bar */}
      <div className="rounded-xl border border-gray-200 bg-white px-6 py-4 shadow-sm">
        <p className="mb-4 text-xs font-bold uppercase tracking-wide text-gray-500">{monthLabel} — Attendance Summary</p>
        <div className="flex flex-wrap gap-0">
          {[
            ['Working Days', attendance.working_days ?? '-'],
            ['Present',      attendance.present      ?? 0],
            ['Absent',       attendance.absent       ?? 0],
            ['Late',         attendance.late         ?? 0],
            ['On Leave',     attendance.on_leave     ?? 0],
          ].map(([label, val], i, arr) => (
            <div key={label} className={`flex flex-col items-center px-8 py-2 ${i < arr.length - 1 ? 'border-r border-gray-200' : ''}`}>
              <span className="text-2xl font-extrabold text-gray-900">{val}</span>
              <span className="mt-1 text-xs text-gray-500">{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* 2 ── Leave balance cards */}
      <div>
        <p className="mb-3 text-sm font-bold text-gray-700">Leave Balances</p>
        <div className="flex gap-4 overflow-x-auto pb-1">
          {(balances || []).map((b) => {
            const taken    = Number(b.taken   ?? 0);
            const accrued  = Number(b.accrued ?? 0);
            const avail    = Number(b.closing_balance ?? 0);
            const pct      = accrued > 0 ? Math.min(100, Math.round((taken / accrued) * 100)) : 0;
            return (
              <div key={b.leave_type_id} className="min-w-[150px] rounded-xl border border-gray-200 bg-white p-4 shadow-sm shrink-0">
                <p className="text-xs font-semibold text-gray-500 truncate">{b.leave_type_name}</p>
                <p className="mt-2 text-3xl font-extrabold" style={{ color: GREEN }}>{avail.toFixed(1)}</p>
                <p className="text-[11px] text-gray-400">Available</p>
                <div className="mt-3 h-1.5 w-full rounded-full bg-gray-100">
                  <div className="h-1.5 rounded-full" style={{ width: `${pct}%`, backgroundColor: GREEN }} />
                </div>
                <p className="mt-1 text-[10px] text-gray-400">{taken} taken / {accrued} accrued</p>
              </div>
            );
          })}
          {!(balances || []).length && (
            <p className="text-sm text-gray-400">No leave balances found.</p>
          )}
        </div>
      </div>

      {/* 3 ── Bottom row: Latest Payslip + Pending Actions */}
      <div className="grid gap-5 md:grid-cols-2">
        {/* Latest Payslip */}
        <SectionCard title="Latest Payslip">
          {payroll?.month ? (
            <div className="space-y-3">
              <p className="text-xs text-gray-500">{MONTH_NAMES[(payroll.month || 1) - 1]} {payroll.year}</p>
              <div className="grid grid-cols-3 gap-3 text-center">
                {[
                  ['Gross',       `₹${Number(payroll.gross  || 0).toLocaleString('en-IN')}`],
                  ['Deductions',  `₹${Number(payroll.deductions || 0).toLocaleString('en-IN')}`],
                  ['Net Pay',     `₹${Number(payroll.net_pay || 0).toLocaleString('en-IN')}`, true],
                ].map(([lbl, val, highlight]) => (
                  <div key={lbl} className="rounded-lg bg-gray-50 p-3">
                    <p className="text-[11px] text-gray-500">{lbl}</p>
                    <p className={`mt-1 text-base font-bold ${highlight ? '' : 'text-gray-900'}`} style={highlight ? { color: GREEN } : {}}>{val}</p>
                  </div>
                ))}
              </div>
              <GreenBtn
                onClick={() => payroll.id && navigate(`/hr-admin/payroll/${payroll.id}/payslip`)}
                className="mt-1"
              >
                <Printer className="h-4 w-4" /> Print Payslip
              </GreenBtn>
            </div>
          ) : (
            <p className="text-sm text-gray-400">No payslip available yet.</p>
          )}
        </SectionCard>

        {/* Pending Actions */}
        <SectionCard title="Pending Actions">
          <div className="space-y-3">
            {[
              ['Pending Leave Requests', leave.pending ?? 0, 'leave'],
              ['Pending Corrections',    attendance.pending_corrections ?? 0, 'attendance'],
              ['Open HR Requests',       (serviceRequests || []).filter((r) => ['open','in_progress'].includes(r.status)).length, 'service'],
            ].map(([label, count, tab]) => (
              <div key={label} className="flex items-center justify-between rounded-lg border border-gray-100 px-4 py-3">
                <div>
                  <p className="text-sm font-semibold text-gray-800">{label}</p>
                  <p className="text-xs text-gray-400">{count} item{count !== 1 ? 's' : ''}</p>
                </div>
                <span
                  className="rounded-full px-2.5 py-1 text-sm font-bold text-white"
                  style={{ backgroundColor: count > 0 ? '#dc2626' : '#9ca3af' }}
                >
                  {count}
                </span>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   ATTENDANCE TAB
═══════════════════════════════════════════════════════════════ */
const STATUS_STYLE = {
  P:   { bg: 'bg-green-100',  text: 'text-green-700',  label: 'P'  },
  A:   { bg: 'bg-red-100',    text: 'text-red-700',    label: 'A'  },
  L:   { bg: 'bg-blue-100',   text: 'text-blue-700',   label: 'L'  },
  HD:  { bg: 'bg-amber-100',  text: 'text-amber-700',  label: 'HD' },
  WO:  { bg: 'bg-gray-100',   text: 'text-gray-500',   label: 'WO' },
  H:   { bg: 'bg-purple-100', text: 'text-purple-700', label: 'H'  },
};

function normaliseStatus(raw) {
  if (!raw) return null;
  const u = raw.toUpperCase();
  if (u === 'PRESENT')   return 'P';
  if (u === 'ABSENT')    return 'A';
  if (u === 'LEAVE')     return 'L';
  if (u === 'HALF_DAY' || u === 'HD') return 'HD';
  if (u === 'WEEK_OFF' || u === 'WO' || u === 'WEEKOFF') return 'WO';
  if (u === 'HOLIDAY' || u === 'H')  return 'H';
  return u.slice(0, 2);
}

function AttendanceTab({ leaveTypes }) {
  const qc = useQueryClient();
  const now = new Date();
  const [calYear,  setCalYear]  = useState(now.getFullYear());
  const [calMonth, setCalMonth] = useState(now.getMonth()); // 0-indexed

  const attendance  = useQuery({ queryKey: ['ess-attendance'],   queryFn: () => essAPI.attendance().then(unwrap) });
  const corrections = useQuery({ queryKey: ['ess-corrections'],  queryFn: () => essAPI.attendanceCorrections().then(unwrap) });

  const [correction, setCorrection] = useState({
    attendance_date: today(), requested_status: 'present',
    requested_in_time: '09:30', requested_out_time: '18:00', reason: '',
  });

  const refresh = () => ['ess-attendance','ess-corrections','ess-summary'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
  const createCorrection = useMutation({
    mutationFn: essAPI.createCorrection,
    onSuccess: () => { toast.success('Correction requested'); setCorrection({ ...correction, reason: '' }); refresh(); },
    onError: (e) => toast.error(e?.response?.data?.error || 'Failed to submit correction request'),
  });

  /* build day→status map */
  const statusMap = useMemo(() => {
    const m = {};
    for (const row of (attendance.data || [])) {
      const d = String(row.attendance_date || '').slice(0, 10);
      if (d) m[d] = normaliseStatus(row.status);
    }
    return m;
  }, [attendance.data]);

  /* calendar grid */
  const firstDay = new Date(calYear, calMonth, 1).getDay(); // 0=Sun
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const prevMonth = () => { if (calMonth === 0) { setCalMonth(11); setCalYear(y => y-1); } else setCalMonth(m => m-1); };
  const nextMonth = () => { if (calMonth === 11) { setCalMonth(0); setCalYear(y => y+1); } else setCalMonth(m => m+1); };

  const formatDay = (day) => {
    const mm = String(calMonth + 1).padStart(2,'0');
    const dd = String(day).padStart(2,'0');
    return `${calYear}-${mm}-${dd}`;
  };

  const DAYS_OF_WEEK = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

  return (
    <div className="space-y-5">
      {/* Calendar */}
      <SectionCard>
        {/* Month nav */}
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <button onClick={prevMonth} className="rounded-lg border border-gray-200 p-1.5 hover:bg-gray-50 transition">
            <ChevronLeft className="h-4 w-4 text-gray-600" />
          </button>
          <h3 className="text-base font-bold text-gray-900">{MONTH_NAMES[calMonth]} {calYear}</h3>
          <button onClick={nextMonth} className="rounded-lg border border-gray-200 p-1.5 hover:bg-gray-50 transition">
            <ChevronRight className="h-4 w-4 text-gray-600" />
          </button>
        </div>
        <div className="p-4">
          {/* Day headers */}
          <div className="grid grid-cols-7 mb-2">
            {DAYS_OF_WEEK.map((d) => (
              <div key={d} className="py-1 text-center text-[11px] font-bold uppercase text-gray-400">{d}</div>
            ))}
          </div>
          {/* Day cells */}
          <div className="grid grid-cols-7 gap-1">
            {cells.map((day, idx) => {
              if (!day) return <div key={`empty-${idx}`} />;
              const dateStr = formatDay(day);
              const status  = statusMap[dateStr];
              const style   = status ? STATUS_STYLE[status] : null;
              const isToday = dateStr === today();
              return (
                <div
                  key={dateStr}
                  className={`flex flex-col items-center rounded-lg py-2 border ${isToday ? 'border-green-400' : 'border-transparent'}`}
                >
                  <span className={`text-xs font-semibold ${isToday ? 'text-green-700' : 'text-gray-700'}`}>{day}</span>
                  {style ? (
                    <span className={`mt-0.5 rounded px-1 text-[10px] font-bold ${style.bg} ${style.text}`}>{style.label}</span>
                  ) : (
                    <span className="mt-0.5 text-[10px] text-transparent">-</span>
                  )}
                </div>
              );
            })}
          </div>
          {/* Legend */}
          <div className="mt-4 flex flex-wrap gap-3">
            {Object.entries(STATUS_STYLE).map(([code, s]) => (
              <div key={code} className="flex items-center gap-1">
                <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${s.bg} ${s.text}`}>{s.label}</span>
                <span className="text-[10px] text-gray-500">
                  {code === 'P' ? 'Present' : code === 'A' ? 'Absent' : code === 'L' ? 'Leave' : code === 'HD' ? 'Half Day' : code === 'WO' ? 'Week Off' : 'Holiday'}
                </span>
              </div>
            ))}
          </div>
        </div>
      </SectionCard>

      {/* Correction form */}
      <SectionCard title="Attendance Correction" subtitle="Missed punch or wrong status — raise a correction request">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field title="Date">
            <input type="date" className={inputCls} value={correction.attendance_date}
              onChange={(e) => setCorrection({ ...correction, attendance_date: e.target.value })} />
          </Field>
          <Field title="Status">
            <select className={inputCls} value={correction.requested_status}
              onChange={(e) => setCorrection({ ...correction, requested_status: e.target.value })}>
              <option value="present">Present</option>
              <option value="half_day">Half Day</option>
              <option value="leave">Leave</option>
              <option value="absent">Absent</option>
            </select>
          </Field>
          <Field title="In Time">
            <input type="time" className={inputCls} value={correction.requested_in_time}
              onChange={(e) => setCorrection({ ...correction, requested_in_time: e.target.value })} />
          </Field>
          <Field title="Out Time">
            <input type="time" className={inputCls} value={correction.requested_out_time}
              onChange={(e) => setCorrection({ ...correction, requested_out_time: e.target.value })} />
          </Field>
          <div className="sm:col-span-2 lg:col-span-4">
            <Field title="Reason">
              <input className={inputCls} value={correction.reason}
                placeholder="Brief reason for correction"
                onChange={(e) => setCorrection({ ...correction, reason: e.target.value })} />
            </Field>
          </div>
        </div>
        <div className="mt-4">
          <GreenBtn disabled={!correction.reason} onClick={() => createCorrection.mutate(correction)}>
            Submit Correction
          </GreenBtn>
        </div>
      </SectionCard>

      {/* Correction history */}
      <SectionCard title="Correction Requests" subtitle="My correction history">
        <Table
          columns={[
            { key: 'attendance_date', label: 'Date',      render: (r) => String(r.attendance_date || '').slice(0,10) },
            { key: 'requested_status', label: 'Requested' },
            { key: 'reason',           label: 'Reason'    },
            { key: 'status',           label: 'Status',   render: (r) => <StatusBadge value={r.status} /> },
          ]}
          rows={corrections.data || []}
        />
      </SectionCard>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   LEAVE TAB
═══════════════════════════════════════════════════════════════ */
function LeaveTab({ leaveTypes }) {
  const qc = useQueryClient();
  const balances = useQuery({ queryKey: ['ess-leave-balances'], queryFn: () => essAPI.leaveBalances().then(unwrap) });
  const requests = useQuery({ queryKey: ['ess-leave-requests'], queryFn: () => essAPI.leaveRequests().then(unwrap) });
  const [leave, setLeave] = useState({ leave_type_id: '', from_date: today(), to_date: today(), reason: '' });
  const refresh = () => ['ess-leave-balances','ess-leave-requests','ess-summary'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
  const createLeave = useMutation({
    mutationFn: essAPI.createLeaveRequest,
    onSuccess: () => { toast.success('Leave requested'); setLeave({ ...leave, reason: '' }); refresh(); },
  });
  const cancelLeave = useMutation({ mutationFn: essAPI.cancelLeaveRequest, onSuccess: refresh });

  return (
    <div className="space-y-5">
      {/* Balance cards */}
      <div className="flex gap-4 overflow-x-auto pb-1">
        {(balances.data || []).map((b) => {
          const taken   = Number(b.taken   ?? 0);
          const accrued = Number(b.accrued ?? 0);
          const avail   = Number(b.closing_balance ?? 0);
          const pct     = accrued > 0 ? Math.min(100, Math.round((taken / accrued) * 100)) : 0;
          return (
            <div key={b.leave_type_id} className="min-w-[150px] rounded-xl border border-gray-200 bg-white p-4 shadow-sm shrink-0">
              <p className="text-xs font-semibold text-gray-500 truncate">{b.leave_type_name}</p>
              <p className="mt-2 text-3xl font-extrabold" style={{ color: GREEN }}>{avail.toFixed(1)}</p>
              <p className="text-[11px] text-gray-400">Available</p>
              <div className="mt-3 h-1.5 w-full rounded-full bg-gray-100">
                <div className="h-1.5 rounded-full" style={{ width: `${pct}%`, backgroundColor: GREEN }} />
              </div>
              <p className="mt-1 text-[10px] text-gray-400">{taken} taken / {accrued} accrued</p>
            </div>
          );
        })}
      </div>

      {/* Apply form */}
      <SectionCard title="Apply Leave" subtitle="Submit a new leave request">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field title="Leave Type">
            <select className={inputCls} value={leave.leave_type_id}
              onChange={(e) => setLeave({ ...leave, leave_type_id: e.target.value })}>
              <option value="">Select leave type</option>
              {leaveTypes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </Field>
          <Field title="From Date">
            <input type="date" className={inputCls} value={leave.from_date}
              onChange={(e) => setLeave({ ...leave, from_date: e.target.value })} />
          </Field>
          <Field title="To Date">
            <input type="date" className={inputCls} value={leave.to_date}
              onChange={(e) => setLeave({ ...leave, to_date: e.target.value })} />
          </Field>
          <Field title="Reason">
            <input className={inputCls} value={leave.reason} placeholder="Reason for leave"
              onChange={(e) => setLeave({ ...leave, reason: e.target.value })} />
          </Field>
        </div>
        <div className="mt-4">
          <GreenBtn disabled={!leave.leave_type_id} onClick={() => createLeave.mutate(leave)}>
            Apply Leave
          </GreenBtn>
        </div>
      </SectionCard>

      {/* Request history */}
      <SectionCard title="Leave Request History">
        <Table
          columns={[
            { key: 'leave_type_name', label: 'Type'   },
            { key: 'from_date', label: 'From', render: (r) => String(r.from_date||'').slice(0,10) },
            { key: 'to_date',   label: 'To',   render: (r) => String(r.to_date  ||'').slice(0,10) },
            { key: 'days',      label: 'Days'  },
            { key: 'status',    label: 'Status', render: (r) => <StatusBadge value={r.status} /> },
            { key: 'actions',   label: 'Action', render: (r) => r.status === 'pending'
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
          { key: 'gross_earnings',   label: 'Gross',       render: (r) => `₹${Number(r.gross_earnings  ||0).toLocaleString('en-IN')}` },
          { key: 'total_deductions', label: 'Deductions',  render: (r) => `₹${Number(r.total_deductions||0).toLocaleString('en-IN')}` },
          { key: 'net_pay',          label: 'Net Pay',     render: (r) => (
            <span className="font-bold" style={{ color: GREEN }}>₹{Number(r.net_pay||0).toLocaleString('en-IN')}</span>
          )},
          { key: 'status', label: 'Status', render: (r) => <StatusBadge value={r.status} /> },
          { key: 'actions', label: 'Payslip', render: (r) => (
            <button
              onClick={() => navigate(`/hr-admin/payroll/${r.id}/payslip`)}
              className="inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-semibold text-white transition hover:opacity-90"
              style={{ backgroundColor: GREEN }}
            >
              <Printer className="h-3 w-3" /> Print
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
  const acked = new Set((acks.data || []).map((a) => a.policy_id));

  return (
    <div className="space-y-5">
      {/* Upload */}
      <SectionCard title="Upload Document" subtitle="Upload profile and HR documents">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field title="Document Type">
            <select className={inputCls} value={doc.doc_type} onChange={(e) => setDoc({ ...doc, doc_type: e.target.value })}>
              <option value="employee_document">Employee Document</option>
              <option value="id_proof">ID Proof</option>
              <option value="address_proof">Address Proof</option>
              <option value="certificate">Certificate</option>
            </select>
          </Field>
          <Field title="Document Name">
            <input className={inputCls} value={doc.doc_name} onChange={(e) => setDoc({ ...doc, doc_name: e.target.value })} />
          </Field>
          <Field title="File">
            <input type="file" className={inputCls} onChange={(e) => setDoc({ ...doc, file: e.target.files?.[0] || null })} />
          </Field>
        </div>
        <div className="mt-4">
          <GreenBtn disabled={!doc.file} onClick={() => upload.mutate()}>
            <Upload className="h-4 w-4" /> Upload Document
          </GreenBtn>
        </div>
      </SectionCard>

      {/* My documents */}
      <SectionCard title="My Documents">
        <Table
          columns={[
            { key: 'doc_type',    label: 'Type' },
            { key: 'doc_name',    label: 'Name' },
            { key: 'uploaded_at', label: 'Uploaded', render: (r) => String(r.uploaded_at||'').slice(0,10) },
          ]}
          rows={documents.data || []}
        />
      </SectionCard>

      {/* Policy Acknowledgement */}
      <SectionCard title="Policy Acknowledgement" subtitle="Read and acknowledge published company policies">
        <Table
          columns={[
            { key: 'title',          label: 'Policy'   },
            { key: 'category',       label: 'Category' },
            { key: 'version',        label: 'Version'  },
            { key: 'effective_date', label: 'Effective', render: (r) => String(r.effective_date||'').slice(0,10) },
            { key: 'actions',        label: 'Status',   render: (r) => acked.has(r.id)
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
    onSuccess: () => { toast.success('HR request created'); setReqForm({ request_type: 'certificate', priority: 'normal', subject: '', description: '' }); qc.invalidateQueries({ queryKey: ['ess-hr-requests'] }); },
  });
  return (
    <div className="space-y-5">
      <SectionCard title="Raise HR Request" subtitle="Certificates, payroll queries, corrections, document support">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field title="Request Type">
            <select className={inputCls} value={reqForm.request_type} onChange={(e) => setReqForm({ ...reqForm, request_type: e.target.value })}>
              <option value="certificate">Certificate / Letter</option>
              <option value="payroll">Payroll Query</option>
              <option value="attendance">Attendance Issue</option>
              <option value="leave">Leave Query</option>
              <option value="documents">Document Correction</option>
              <option value="general">General</option>
            </select>
          </Field>
          <Field title="Priority">
            <select className={inputCls} value={reqForm.priority} onChange={(e) => setReqForm({ ...reqForm, priority: e.target.value })}>
              <option value="low">Low</option>
              <option value="normal">Normal</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
          </Field>
          <Field title="Subject">
            <input className={inputCls} value={reqForm.subject} placeholder="Brief subject"
              onChange={(e) => setReqForm({ ...reqForm, subject: e.target.value })} />
          </Field>
          <Field title="Description">
            <input className={inputCls} value={reqForm.description} placeholder="Details"
              onChange={(e) => setReqForm({ ...reqForm, description: e.target.value })} />
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
            { key: 'status',       label: 'Status',  render: (r) => <StatusBadge value={r.status} /> },
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
  const qc = useQueryClient();
  const leaves      = useQuery({ queryKey: ['ess-manager-leaves'],      queryFn: () => essAPI.managerLeaveRequests({ status: 'pending' }).then(unwrap), retry: false });
  const corrections = useQuery({ queryKey: ['ess-manager-corrections'], queryFn: () => essAPI.managerCorrections({ status: 'pending' }).then(unwrap), retry: false });
  const refresh = () => { qc.invalidateQueries({ queryKey: ['ess-manager-leaves'] }); qc.invalidateQueries({ queryKey: ['ess-manager-corrections'] }); };
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
      <button onClick={onReject}  className="rounded-md border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-600 hover:bg-red-100 transition">Reject</button>
    </div>
  );

  return (
    <div className="space-y-5">
      <SectionCard title="Leave Approvals" subtitle="Pending team leave requests">
        <Table
          columns={[
            { key: 'employee_name',    label: 'Employee' },
            { key: 'leave_type_name',  label: 'Type'     },
            { key: 'from_date', label: 'From', render: (r) => String(r.from_date||'').slice(0,10) },
            { key: 'to_date',   label: 'To',   render: (r) => String(r.to_date  ||'').slice(0,10) },
            { key: 'days',             label: 'Days'     },
            { key: 'actions', label: 'Action', render: (r) => (
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
            { key: 'attendance_date',  label: 'Date',      render: (r) => String(r.attendance_date||'').slice(0,10) },
            { key: 'requested_status', label: 'Status'    },
            { key: 'reason',           label: 'Reason'    },
            { key: 'actions', label: 'Action', render: (r) => (
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
   ROOT PAGE
═══════════════════════════════════════════════════════════════ */
const TABS = [
  { id: 'dashboard',   label: 'Dashboard'    },
  { id: 'attendance',  label: 'Attendance'   },
  { id: 'leave',       label: 'Leave'        },
  { id: 'payslips',    label: 'Payslips'     },
  { id: 'documents',   label: 'Documents'    },
  { id: 'hr-requests', label: 'HR Requests'  },
  { id: 'manager',     label: 'Manager Desk' },
];

export default function ESSPortalPage() {
  const now = new Date();
  const [active, setActive] = useState('dashboard');

  /* ── queries (keep all existing keys) ── */
  const summary = useQuery({
    queryKey: ['ess-summary'],
    queryFn:  () => essAPI.summary({ month: now.getMonth() + 1, year: now.getFullYear() }).then((r) => r.data.data),
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

  /* bootstrap leave balances for sidebar + derived leave types */
  const balances = useQuery({
    queryKey: ['ess-leave-balances-bootstrap'],
    queryFn:  () => essAPI.leaveBalances().then(unwrap),
  });

  const derivedLeaveTypes = useMemo(
    () => (balances.data || []).map((b) => ({ id: b.leave_type_id, name: b.leave_type_name })),
    [balances.data],
  );

  const profile = summary.data?.profile || {};

  return (
    <div className="min-h-screen" style={{ backgroundColor: BG }}>
      {/* ── top header bar ── */}
      <div className="px-6 py-4 text-white" style={{ backgroundColor: NAVY }}>
        <p className="text-[11px] font-semibold uppercase tracking-widest text-blue-300">Employee Self Service</p>
        <h1 className="mt-0.5 text-xl font-bold">ESS Portal</h1>
      </div>

      <div className="flex gap-5 px-6 py-5">
        {/* ── Sidebar ── */}
        <Sidebar profile={profile} balances={balances.data || []} />

        {/* ── Main area ── */}
        <div className="min-w-0 flex-1">
          {/* Tab bar */}
          <div className="mb-5 rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="flex overflow-x-auto">
              {TABS.map((t) => {
                const isActive = active === t.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => setActive(t.id)}
                    className={`relative shrink-0 px-5 py-3.5 text-sm font-semibold transition whitespace-nowrap ${
                      isActive
                        ? 'text-green-700'
                        : 'text-gray-500 hover:text-gray-800'
                    }`}
                    style={isActive ? { color: GREEN } : {}}
                  >
                    {t.label}
                    {isActive && (
                      <span
                        className="absolute bottom-0 left-0 right-0 h-0.5 rounded-t"
                        style={{ backgroundColor: GREEN }}
                      />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Tab content */}
          {active === 'dashboard' && (
            <DashboardTab
              summary={summary.data || {}}
              balances={balances.data || []}
              serviceRequests={serviceRequests.data || []}
            />
          )}
          {active === 'attendance' && (
            <AttendanceTab leaveTypes={derivedLeaveTypes} />
          )}
          {active === 'leave' && (
            <LeaveTab leaveTypes={derivedLeaveTypes} />
          )}
          {active === 'payslips' && <PayslipsTab />}
          {active === 'documents' && (
            <DocumentsTab policies={policies.data || []} userId={userId} />
          )}
          {active === 'hr-requests' && (
            <HRRequestsTab serviceRequests={serviceRequests.data || []} />
          )}
          {active === 'manager' && <ManagerDeskTab />}
        </div>
      </div>
    </div>
  );
}
