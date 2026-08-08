// src/pages/hr-admin/attendance/MissingPunchPage.jsx
// Employees with no punch, or an incomplete in/out pair, for a given date.
import React, { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Search, ArrowRight } from 'lucide-react';
import { hrAttendanceAPI } from '../../../api/client';

const fade = (d = 0) => ({ initial: { opacity: 0, y: 14 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.35, delay: d, ease: [0.16, 1, 0.3, 1] } });

function yesterday() {
  const d = new Date(); d.setDate(d.getDate() - 1);
  return d.toLocaleDateString('en-CA');
}
function fmtTime(t) {
  if (!t) return '—';
  const [h, m] = String(t).slice(0, 5).split(':');
  const hr = parseInt(h, 10);
  return `${hr > 12 ? hr - 12 : hr || 12}:${m} ${hr >= 12 ? 'PM' : 'AM'}`;
}

const GAP_CFG = {
  no_record:  { label: 'No Punch At All', bg: 'bg-red-50',    text: 'text-red-700'    },
  missing_in: { label: 'Missing In',       bg: 'bg-orange-50', text: 'text-orange-700' },
  missing_out:{ label: 'Missing Out',      bg: 'bg-amber-50',  text: 'text-amber-700'  },
};

export default function MissingPunchPage() {
  const navigate = useNavigate();
  const [date, setDate] = useState(yesterday());
  const [search, setSearch] = useState('');
  const today = new Date().toLocaleDateString('en-CA');

  const { data, isLoading } = useQuery({
    queryKey: ['hr-missing-punch', date],
    queryFn: () => hrAttendanceAPI.liveStatus({ date }).then(r => r.data),
  });
  const rows = data?.data || [];

  const gaps = useMemo(() => {
    const isPastDate = date < today;
    return rows
      .map(r => {
        let gap = null;
        if (r.punch_status === 'no_record') gap = 'no_record';
        else if (r.punch_status === 'missing_in') gap = 'missing_in';
        else if (r.punch_status === 'checked_in' && isPastDate) gap = 'missing_out';
        return gap ? { ...r, gap } : null;
      })
      .filter(Boolean);
  }, [rows, date, today]);

  const filtered = gaps.filter(r => r.name?.toLowerCase().includes(search.toLowerCase()) || r.employee_code?.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="p-6 space-y-6 min-h-screen" style={{ background: '#F8FAFC' }}>
      <motion.div {...fade(0)} className="relative overflow-hidden rounded-2xl"
        style={{ background: `linear-gradient(135deg,#0A1F5C,#1e3a8a)`, boxShadow: '0 8px 32px rgba(10,31,92,0.2)' }}>
        <div className="absolute top-0 right-0 w-64 h-64 rounded-full opacity-[0.07]"
          style={{ background: 'radial-gradient(circle,#fff,transparent 70%)', transform: 'translate(25%,-25%)' }} />
        <div className="relative z-10 px-8 py-6 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-white">Missing Punch</h1>
              <p className="text-white/55 text-sm mt-0.5">Employees with no punch or an incomplete in/out pair</p>
            </div>
          </div>
          <div className="flex items-center gap-2.5 bg-white/10 border border-white/20 rounded-xl px-4 py-2.5">
            <span className="text-lg font-black text-white leading-none">{gaps.length}</span>
            <span className="text-xs text-white/50 font-bold">Gaps found</span>
          </div>
        </div>
      </motion.div>

      <motion.div {...fade(0.05)} className="bg-white rounded-2xl border border-gray-100 overflow-hidden" style={{ boxShadow: '0 2px 12px rgba(10,31,92,0.06)' }}>
        <div className="p-4 border-b border-gray-100 flex flex-wrap items-center gap-3">
          <div>
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-wide block mb-1">Date</label>
            <input type="date" value={date} max={today} onChange={e => setDate(e.target.value)}
              className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-900 focus:outline-none focus:border-blue-400" />
          </div>
          <div className="relative max-w-sm flex-1 min-w-[200px]">
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-wide block mb-1">Search</label>
            <Search className="absolute left-3.5 top-1/2 translate-y-[2px] w-4 h-4 text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Employee name or code…"
              className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-900 focus:outline-none focus:border-blue-400" />
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
                <th className="px-5 py-3">Gap</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => {
                const cfg = GAP_CFG[r.gap];
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
                      <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${cfg.bg} ${cfg.text}`}>{cfg.label}</span>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <button onClick={() => navigate('/hr-admin/attendance/regularization')}
                        className="inline-flex items-center gap-1 text-xs font-bold text-blue-600 hover:text-blue-700">
                        Correct <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
              {!isLoading && filtered.length === 0 && (
                <tr><td colSpan={6} className="px-5 py-16 text-center text-gray-400">No punch gaps found for this date</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </motion.div>
    </div>
  );
}
