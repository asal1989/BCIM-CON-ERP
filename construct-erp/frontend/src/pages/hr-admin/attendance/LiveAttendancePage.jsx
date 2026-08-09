// src/pages/hr-admin/attendance/LiveAttendancePage.jsx
// Real-time "who's in / who's out right now" board for today.
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { Activity, Search, UserCheck, UserX, Clock, RefreshCw, CalendarOff, Users, Download, ChevronDown } from 'lucide-react';
import { hrAttendanceAPI } from '../../../api/client';

const fade = (d = 0) => ({ initial: { opacity: 0, y: 14 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.35, delay: d, ease: [0.16, 1, 0.3, 1] } });

function fmtTime(t) {
  if (!t) return '—';
  const [h, m] = String(t).slice(0, 5).split(':');
  const hr = parseInt(h, 10);
  return `${hr > 12 ? hr - 12 : hr || 12}:${m} ${hr >= 12 ? 'PM' : 'AM'}`;
}

function initials(name) {
  return (name || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
}

const AVATAR_HUES = ['#2563EB', '#7C3AED', '#0891B2', '#059669', '#D97706', '#DB2777', '#4F46E5'];
const avatarHue = (name) => AVATAR_HUES[[...String(name || '')].reduce((s, c) => s + c.charCodeAt(0), 0) % AVATAR_HUES.length];

const STATUS_CFG = {
  checked_in:  { label: 'Checked In',  bg: 'bg-emerald-50', text: 'text-emerald-700', ring: 'ring-emerald-100', dot: 'bg-emerald-500' },
  complete:    { label: 'Checked Out', bg: 'bg-blue-50',    text: 'text-blue-700',    ring: 'ring-blue-100',    dot: 'bg-blue-500'    },
  leave:       { label: 'On Leave',    bg: 'bg-amber-50',   text: 'text-amber-700',   ring: 'ring-amber-100',   dot: 'bg-amber-500'   },
  absent:      { label: 'Absent',      bg: 'bg-red-50',     text: 'text-red-700',     ring: 'ring-red-100',     dot: 'bg-red-500'     },
  missing_in:  { label: 'Missing In',  bg: 'bg-orange-50',  text: 'text-orange-700',  ring: 'ring-orange-100',  dot: 'bg-orange-500'  },
  no_record:   { label: 'Not Arrived', bg: 'bg-slate-100',  text: 'text-slate-500',   ring: 'ring-slate-200',   dot: 'bg-slate-400'   },
};

// KPI card visual language — gradient chip + tinted card wash, status color
// carries the icon/number, never the only signal (label always sits beside it).
const KPI_CFG = {
  checked_in: { grad: 'from-emerald-500 to-teal-500', wash: 'from-emerald-50/80 to-white', ring: 'ring-emerald-100', text: 'text-emerald-700', bar: 'bg-emerald-500' },
  complete:   { grad: 'from-blue-500 to-indigo-500',  wash: 'from-blue-50/80 to-white',    ring: 'ring-blue-100',    text: 'text-blue-700',    bar: 'bg-blue-500'    },
  leave:      { grad: 'from-amber-500 to-orange-500', wash: 'from-amber-50/80 to-white',   ring: 'ring-amber-100',   text: 'text-amber-700',   bar: 'bg-amber-500'   },
  absent:     { grad: 'from-rose-500 to-red-500',     wash: 'from-rose-50/80 to-white',    ring: 'ring-rose-100',    text: 'text-rose-700',    bar: 'bg-rose-500'    },
  no_record:  { grad: 'from-slate-400 to-slate-500',  wash: 'from-slate-50 to-white',      ring: 'ring-slate-200',   text: 'text-slate-600',   bar: 'bg-slate-400'   },
};

function SkeletonRows() {
  return [...Array(6)].map((_, i) => (
    <tr key={i} className="border-b border-gray-50">
      {[...Array(5)].map((_, c) => (
        <td key={c} className="px-5 py-4"><div className="h-3.5 rounded-full bg-gray-100 animate-pulse" style={{ width: `${40 + ((i + c) % 4) * 15}%` }} /></td>
      ))}
    </tr>
  ));
}

export default function LiveAttendancePage() {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('');
  const today = new Date().toLocaleDateString('en-CA');

  const { data, isLoading, isFetching, dataUpdatedAt } = useQuery({
    queryKey: ['hr-live-attendance'],
    queryFn: () => hrAttendanceAPI.liveStatus({ date: today }).then(r => r.data),
    refetchInterval: 60000,
  });
  const rows = data?.data || [];

  const filtered = rows.filter(r =>
    (r.name?.toLowerCase().includes(search.toLowerCase()) || r.employee_code?.toLowerCase().includes(search.toLowerCase())) &&
    (!filter || r.punch_status === filter)
  );

  const counts = {
    checked_in: rows.filter(r => r.punch_status === 'checked_in').length,
    complete:   rows.filter(r => r.punch_status === 'complete').length,
    leave:      rows.filter(r => r.punch_status === 'leave').length,
    absent:     rows.filter(r => r.punch_status === 'absent' || r.punch_status === 'missing_in').length,
    no_record:  rows.filter(r => r.punch_status === 'no_record').length,
  };
  const total = rows.length;
  const present = counts.checked_in + counts.complete;
  const attendanceRate = total ? Math.round((present / total) * 100) : 0;

  const kpis = [
    { key: 'checked_in', label: 'Checked in now',  value: counts.checked_in, icon: UserCheck, sub: 'currently on site' },
    { key: 'complete',   label: 'Checked out',      value: counts.complete,   icon: Clock,     sub: 'completed shift'  },
    { key: 'leave',      label: 'On leave',         value: counts.leave,      icon: CalendarOff, sub: 'approved leave' },
    { key: 'absent',     label: 'Absent today',     value: counts.absent,     icon: UserX,     sub: 'no punch recorded' },
    { key: 'no_record',  label: 'Not arrived',      value: counts.no_record,  icon: Users,     sub: 'awaiting first punch' },
  ];

  const exportCsv = () => {
    const header = ['Employee', 'Code', 'Department', 'Designation', 'In Time', 'Out Time', 'Status'];
    const lines = filtered.map(r => [r.name, r.employee_code, r.department_name, r.designation, fmtTime(r.in_time), fmtTime(r.out_time), (STATUS_CFG[r.punch_status] || STATUS_CFG.no_record).label]
      .map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','));
    const blob = new Blob([[header.join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `live-attendance-${today}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-6 space-y-5 min-h-screen" style={{ background: 'linear-gradient(180deg,#F8FAFC 0%,#F1F5F9 100%)' }}>
      {/* ── Hero header ── */}
      <motion.div {...fade(0)} className="relative overflow-hidden rounded-2xl"
        style={{ background: 'linear-gradient(120deg,#0A1F5C 0%,#15308A 55%,#1e3a8a 100%)', boxShadow: '0 10px 36px rgba(10,31,92,0.28)' }}>
        <div className="absolute top-0 right-0 w-80 h-80 rounded-full opacity-[0.08]"
          style={{ background: 'radial-gradient(circle,#60A5FA,transparent 70%)', transform: 'translate(20%,-30%)' }} />
        <div className="absolute bottom-0 left-1/3 w-64 h-64 rounded-full opacity-[0.06]"
          style={{ background: 'radial-gradient(circle,#34D399,transparent 70%)', transform: 'translate(-10%,30%)' }} />

        <div className="relative z-10 px-8 py-6 flex items-center justify-between gap-6 flex-wrap">
          <div className="flex items-center gap-4">
            <div className="w-11 h-11 rounded-xl bg-white/15 backdrop-blur flex items-center justify-center relative flex-shrink-0">
              <Activity className="w-5 h-5 text-white" />
              <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse ring-2 ring-[#0A1F5C]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-black text-white tracking-tight">Live Attendance</h1>
                <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-emerald-300 bg-emerald-400/10 border border-emerald-400/25 rounded-full px-2 py-0.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> Live
                </span>
              </div>
              <p className="text-white/55 text-sm mt-0.5">
                {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: '2-digit', month: 'short', year: 'numeric' })} &middot; auto-refreshes every minute
              </p>
            </div>
          </div>

          <div className="flex items-center gap-5">
            <div className="text-right">
              <p className="text-[10px] font-bold uppercase tracking-wider text-white/45">Attendance rate</p>
              <p className="text-3xl font-black text-white leading-none mt-1">{attendanceRate}<span className="text-lg text-white/50">%</span></p>
            </div>
            <div className="hidden sm:block w-28">
              <div className="h-1.5 rounded-full bg-white/15 overflow-hidden">
                <motion.div className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-teal-300"
                  initial={{ width: 0 }} animate={{ width: `${attendanceRate}%` }} transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }} />
              </div>
              <p className="text-[11px] text-white/45 mt-1.5">{present} of {total} employees present</p>
            </div>
            <div className="flex items-center gap-2 text-xs text-white/55 border-l border-white/10 pl-5">
              <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? 'animate-spin' : ''}`} />
              {dataUpdatedAt ? new Date(dataUpdatedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '—'}
            </div>
          </div>
        </div>
      </motion.div>

      {/* ── KPI cards ── */}
      <motion.div {...fade(0.04)} className="grid grid-cols-2 lg:grid-cols-5 gap-3.5">
        {kpis.map((k, i) => {
          const cfg = KPI_CFG[k.key];
          const active = filter === k.key;
          const pct = total ? Math.round((k.value / total) * 100) : 0;
          return (
            <motion.button
              key={k.key}
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.05 + i * 0.04 }}
              onClick={() => setFilter(f => f === k.key ? '' : k.key)}
              className={`relative overflow-hidden text-left rounded-2xl bg-gradient-to-b ${cfg.wash} border transition-all duration-150
                ${active ? `ring-2 ${cfg.ring} border-transparent shadow-lg -translate-y-0.5` : 'border-gray-100 hover:shadow-md hover:-translate-y-0.5'}`}
              style={{ boxShadow: active ? undefined : '0 1px 2px rgba(15,23,42,0.04)' }}
            >
              <div className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${cfg.grad} flex items-center justify-center shadow-sm`}>
                    <k.icon className="w-4.5 h-4.5 text-white" />
                  </div>
                  {total > 0 && (
                    <span className={`text-[10px] font-bold ${cfg.text} bg-white/70 rounded-full px-2 py-0.5`}>{pct}%</span>
                  )}
                </div>
                <p className="text-[27px] leading-none font-black text-gray-900 tabular-nums">{k.value}</p>
                <p className="text-xs font-bold text-gray-700 mt-2">{k.label}</p>
                <p className="text-[11px] text-gray-400 mt-0.5">{k.sub}</p>
              </div>
              <div className={`h-1 w-full ${cfg.bar} opacity-90`} />
            </motion.button>
          );
        })}
      </motion.div>

      {/* ── Table ── */}
      <motion.div {...fade(0.1)} className="bg-white rounded-2xl border border-gray-100 overflow-hidden" style={{ boxShadow: '0 2px 16px rgba(10,31,92,0.06)' }}>
        <div className="p-4 border-b border-gray-100 flex items-center gap-3 flex-wrap justify-between">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative w-64">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search employee or code…"
                className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-900 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50 transition-all" />
            </div>
            {filter && (
              <button onClick={() => setFilter('')}
                className={`inline-flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl ${STATUS_CFG[filter]?.bg} ${STATUS_CFG[filter]?.text}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${STATUS_CFG[filter]?.dot}`} />
                {STATUS_CFG[filter]?.label || 'Filtered'}
                <span className="opacity-50 ml-1">&times;</span>
              </button>
            )}
            <span className="text-xs text-gray-400 font-medium">{filtered.length} of {total} employees</span>
          </div>
          <button onClick={exportCsv}
            className="inline-flex items-center gap-2 text-xs font-bold text-gray-600 border border-gray-200 rounded-xl px-3.5 py-2.5 hover:bg-gray-50 transition-colors">
            <Download className="w-3.5 h-3.5" /> Export CSV
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[10px] font-black text-gray-400 uppercase tracking-wide border-b border-gray-100 bg-gray-50/60">
                <th className="px-5 py-3">Employee</th>
                <th className="px-5 py-3">Department</th>
                <th className="px-5 py-3">In</th>
                <th className="px-5 py-3">Out</th>
                <th className="px-5 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && <SkeletonRows />}
              <AnimatePresence initial={false}>
                {!isLoading && filtered.map((r, i) => {
                  const cfg = STATUS_CFG[r.punch_status] || STATUS_CFG.no_record;
                  const hue = avatarHue(r.name);
                  return (
                    <motion.tr key={r.user_id}
                      initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2, delay: Math.min(i * 0.015, 0.3) }}
                      className="border-b border-gray-50 hover:bg-blue-50/30 transition-colors">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-black text-white flex-shrink-0"
                            style={{ background: hue }}>
                            {initials(r.name)}
                          </div>
                          <div className="min-w-0">
                            <p className="font-bold text-gray-900 truncate">{r.name}</p>
                            <p className="text-xs text-gray-400 truncate">{r.employee_code} &middot; {r.designation || '—'}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3 text-gray-600">{r.department_name || '—'}</td>
                      <td className="px-5 py-3 font-semibold text-gray-700 tabular-nums">{fmtTime(r.in_time)}</td>
                      <td className="px-5 py-3 font-semibold text-gray-700 tabular-nums">{fmtTime(r.out_time)}</td>
                      <td className="px-5 py-3">
                        <span className={`inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full ring-1 ${cfg.bg} ${cfg.text} ${cfg.ring}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} /> {cfg.label}
                        </span>
                      </td>
                    </motion.tr>
                  );
                })}
              </AnimatePresence>
              {!isLoading && filtered.length === 0 && (
                <tr><td colSpan={5} className="px-5 py-16 text-center">
                  <div className="flex flex-col items-center gap-2">
                    <div className="w-12 h-12 rounded-2xl bg-gray-50 flex items-center justify-center">
                      <Users className="w-5 h-5 text-gray-300" />
                    </div>
                    <p className="text-gray-400 text-sm font-medium">No employees match your search</p>
                  </div>
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </motion.div>
    </div>
  );
}
