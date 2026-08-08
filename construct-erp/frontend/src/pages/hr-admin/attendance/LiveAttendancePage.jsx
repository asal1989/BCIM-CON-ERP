// src/pages/hr-admin/attendance/LiveAttendancePage.jsx
// Real-time "who's in / who's out right now" board for today.
import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { Activity, Search, UserCheck, UserX, Clock, RefreshCw } from 'lucide-react';
import { hrAttendanceAPI } from '../../../api/client';

const fade = (d = 0) => ({ initial: { opacity: 0, y: 14 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.35, delay: d, ease: [0.16, 1, 0.3, 1] } });

function fmtTime(t) {
  if (!t) return '—';
  const [h, m] = String(t).slice(0, 5).split(':');
  const hr = parseInt(h, 10);
  return `${hr > 12 ? hr - 12 : hr || 12}:${m} ${hr >= 12 ? 'PM' : 'AM'}`;
}

const STATUS_CFG = {
  checked_in:  { label: 'Checked In',  bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  complete:    { label: 'Checked Out', bg: 'bg-blue-50',    text: 'text-blue-700',    dot: 'bg-blue-400'    },
  leave:       { label: 'On Leave',    bg: 'bg-amber-50',   text: 'text-amber-700',   dot: 'bg-amber-400'   },
  absent:      { label: 'Absent',      bg: 'bg-red-50',     text: 'text-red-700',     dot: 'bg-red-500'     },
  missing_in:  { label: 'Missing In',  bg: 'bg-orange-50',  text: 'text-orange-700',  dot: 'bg-orange-500'  },
  no_record:   { label: 'Not Arrived', bg: 'bg-gray-100',   text: 'text-gray-500',    dot: 'bg-gray-400'    },
};

export default function LiveAttendancePage() {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('');
  const today = new Date().toLocaleDateString('en-CA');

  const { data, isLoading, dataUpdatedAt } = useQuery({
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
    no_record:  rows.filter(r => r.punch_status === 'no_record').length,
    leave:      rows.filter(r => r.punch_status === 'leave').length,
  };

  return (
    <div className="p-6 space-y-6 min-h-screen" style={{ background: '#F8FAFC' }}>
      <motion.div {...fade(0)} className="relative overflow-hidden rounded-2xl"
        style={{ background: `linear-gradient(135deg,#0A1F5C,#1e3a8a)`, boxShadow: '0 8px 32px rgba(10,31,92,0.2)' }}>
        <div className="absolute top-0 right-0 w-64 h-64 rounded-full opacity-[0.07]"
          style={{ background: 'radial-gradient(circle,#fff,transparent 70%)', transform: 'translate(25%,-25%)' }} />
        <div className="relative z-10 px-8 py-6 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center relative">
              <Activity className="w-5 h-5 text-white" />
              <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-white">Live Attendance</h1>
              <p className="text-white/55 text-sm mt-0.5">Who's in right now — {new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}, auto-refreshes every minute</p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-white/60">
            <RefreshCw className="w-3.5 h-3.5" />
            {dataUpdatedAt ? `Updated ${new Date(dataUpdatedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}` : ''}
          </div>
        </div>
      </motion.div>

      <motion.div {...fade(0.03)} className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { key: 'checked_in', label: 'Checked In',  value: counts.checked_in, icon: UserCheck, color: '#10B981' },
          { key: 'complete',   label: 'Checked Out',  value: counts.complete,   icon: Clock,     color: '#2563EB' },
          { key: 'no_record',  label: 'Not Arrived',  value: counts.no_record,  icon: UserX,     color: '#94A3B8' },
          { key: 'leave',      label: 'On Leave',      value: counts.leave,      icon: Clock,     color: '#F59E0B' },
        ].map(k => (
          <button key={k.key} onClick={() => setFilter(f => f === k.key ? '' : k.key)}
            className={`bg-white rounded-2xl border p-4 text-left transition ${filter === k.key ? 'border-blue-400 shadow-md' : 'border-gray-100 hover:shadow-sm'}`}>
            <div className="flex items-center gap-2 mb-1">
              <k.icon className="w-4 h-4" style={{ color: k.color }} />
              <span className="text-[10px] font-black text-gray-400 uppercase tracking-wide">{k.label}</span>
            </div>
            <p className="text-2xl font-black text-gray-900">{k.value}</p>
          </button>
        ))}
      </motion.div>

      <motion.div {...fade(0.06)} className="bg-white rounded-2xl border border-gray-100 overflow-hidden" style={{ boxShadow: '0 2px 12px rgba(10,31,92,0.06)' }}>
        <div className="p-4 border-b border-gray-100">
          <div className="relative max-w-sm">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search employee…"
              className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-900 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50 transition-all" />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[10px] font-black text-gray-400 uppercase tracking-wide border-b border-gray-100">
                <th className="px-5 py-3">Employee</th>
                <th className="px-5 py-3">Department</th>
                <th className="px-5 py-3">In</th>
                <th className="px-5 py-3">Out</th>
                <th className="px-5 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => {
                const cfg = STATUS_CFG[r.punch_status] || STATUS_CFG.no_record;
                return (
                  <tr key={r.user_id} className="border-b border-gray-50 hover:bg-gray-50/60 transition">
                    <td className="px-5 py-3">
                      <p className="font-bold text-gray-900">{r.name}</p>
                      <p className="text-xs text-gray-400">{r.employee_code} · {r.designation}</p>
                    </td>
                    <td className="px-5 py-3 text-gray-600">{r.department_name}</td>
                    <td className="px-5 py-3 font-semibold text-gray-700">{fmtTime(r.in_time)}</td>
                    <td className="px-5 py-3 font-semibold text-gray-700">{fmtTime(r.out_time)}</td>
                    <td className="px-5 py-3">
                      <span className={`inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full ${cfg.bg} ${cfg.text}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} /> {cfg.label}
                      </span>
                    </td>
                  </tr>
                );
              })}
              {!isLoading && filtered.length === 0 && (
                <tr><td colSpan={5} className="px-5 py-16 text-center text-gray-400">No employees match</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </motion.div>
    </div>
  );
}
