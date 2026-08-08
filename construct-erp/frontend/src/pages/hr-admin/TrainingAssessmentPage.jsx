// src/pages/hr-admin/TrainingAssessmentPage.jsx
import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { ClipboardCheck, Search, Download } from 'lucide-react';
import { hrTrainingAPI } from '../../api/client';
import dayjs from 'dayjs';

const fade = (d = 0) => ({ initial: { opacity: 0, y: 14 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.35, delay: d, ease: [0.16, 1, 0.3, 1] } });

function scoreColor(score) {
  const n = Number(score);
  if (n >= 80) return { bg: 'bg-emerald-50', text: 'text-emerald-700' };
  if (n >= 50) return { bg: 'bg-amber-50', text: 'text-amber-700' };
  return { bg: 'bg-red-50', text: 'text-red-700' };
}

export default function TrainingAssessmentPage() {
  const [search, setSearch] = useState('');
  const { data, isLoading } = useQuery({ queryKey: ['hr-training-assessments'], queryFn: () => hrTrainingAPI.assessments().then(r => r.data) });
  const rows = data?.data || [];
  const filtered = rows.filter(r => r.employee_name?.toLowerCase().includes(search.toLowerCase()) || r.program_title?.toLowerCase().includes(search.toLowerCase()));

  const exportCSV = () => {
    const header = ['Employee', 'Emp ID', 'Program', 'Type', 'Date', 'Attended', 'Score', 'Feedback'];
    const csvRows = filtered.map(r => [r.employee_name, r.employee_code, r.program_title, r.program_type, r.end_date ? dayjs(r.end_date).format('DD-MM-YYYY') : '', r.attended ? 'Yes' : 'No', r.score ?? '', r.feedback || '']);
    const csv = [header, ...csvRows].map(r => r.join(',')).join('\n');
    const a = document.createElement('a');
    a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
    a.download = 'training-assessments.csv';
    a.click();
  };

  return (
    <div className="p-6 space-y-6 min-h-screen" style={{ background: '#F8FAFC' }}>
      <motion.div {...fade(0)} className="relative overflow-hidden rounded-2xl"
        style={{ background: `linear-gradient(135deg,#0A1F5C,#1e3a8a)`, boxShadow: '0 8px 32px rgba(10,31,92,0.2)' }}>
        <div className="absolute top-0 right-0 w-64 h-64 rounded-full opacity-[0.07]"
          style={{ background: 'radial-gradient(circle,#fff,transparent 70%)', transform: 'translate(25%,-25%)' }} />
        <div className="relative z-10 px-8 py-6 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center">
              <ClipboardCheck className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-white">Assessment</h1>
              <p className="text-white/55 text-sm mt-0.5">Training participant scores across all programs</p>
            </div>
          </div>
          <button onClick={exportCSV} className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-black bg-white/10 hover:bg-white/20 border border-white/20 text-white transition">
            <Download className="w-4 h-4" /> Export CSV
          </button>
        </div>
      </motion.div>

      <motion.div {...fade(0.05)} className="bg-white rounded-2xl border border-gray-100 overflow-hidden" style={{ boxShadow: '0 2px 12px rgba(10,31,92,0.06)' }}>
        <div className="p-4 border-b border-gray-100">
          <div className="relative max-w-sm">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search employee or program…"
              className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-900 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50 transition-all" />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[10px] font-black text-gray-400 uppercase tracking-wide border-b border-gray-100">
                <th className="px-5 py-3">Employee</th>
                <th className="px-5 py-3">Program</th>
                <th className="px-5 py-3">Date</th>
                <th className="px-5 py-3">Attended</th>
                <th className="px-5 py-3">Score</th>
                <th className="px-5 py-3">Feedback</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => {
                const sc = scoreColor(r.score);
                return (
                  <tr key={r.id} className="border-b border-gray-50 hover:bg-gray-50/60 transition">
                    <td className="px-5 py-3">
                      <p className="font-bold text-gray-900">{r.employee_name}</p>
                      <p className="text-xs text-gray-400">{r.employee_code}</p>
                    </td>
                    <td className="px-5 py-3 text-gray-700">{r.program_title}</td>
                    <td className="px-5 py-3 text-gray-500">{r.end_date ? dayjs(r.end_date).format('DD-MM-YYYY') : '—'}</td>
                    <td className="px-5 py-3">{r.attended ? <span className="text-emerald-600 font-bold text-xs">Yes</span> : <span className="text-gray-400 text-xs">No</span>}</td>
                    <td className="px-5 py-3">
                      <span className={`text-xs font-black px-2.5 py-1 rounded-full ${sc.bg} ${sc.text}`}>{r.score}</span>
                    </td>
                    <td className="px-5 py-3 text-gray-500 text-xs max-w-xs truncate">{r.feedback || '—'}</td>
                  </tr>
                );
              })}
              {!isLoading && filtered.length === 0 && (
                <tr><td colSpan={6} className="px-5 py-16 text-center text-gray-400">No assessment scores recorded yet</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </motion.div>
    </div>
  );
}
