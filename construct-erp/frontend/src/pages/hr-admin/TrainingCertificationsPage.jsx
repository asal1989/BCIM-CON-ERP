// src/pages/hr-admin/TrainingCertificationsPage.jsx
import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { Award, Search, Download } from 'lucide-react';
import { hrTrainingAPI } from '../../api/client';
import dayjs from 'dayjs';

const fade = (d = 0) => ({ initial: { opacity: 0, y: 14 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.35, delay: d, ease: [0.16, 1, 0.3, 1] } });

export default function TrainingCertificationsPage() {
  const [search, setSearch] = useState('');
  const { data, isLoading } = useQuery({ queryKey: ['hr-training-certifications'], queryFn: () => hrTrainingAPI.certifications().then(r => r.data) });
  const rows = data?.data || [];
  const filtered = rows.filter(r => r.employee_name?.toLowerCase().includes(search.toLowerCase()) || r.program_title?.toLowerCase().includes(search.toLowerCase()));

  const exportCSV = () => {
    const header = ['Employee', 'Emp ID', 'Program', 'Type', 'Completed', 'Score', 'Certificate URL'];
    const csvRows = filtered.map(r => [r.employee_name, r.employee_code, r.program_title, r.program_type, r.end_date ? dayjs(r.end_date).format('DD-MM-YYYY') : '', r.score ?? '', r.certificate_url || '']);
    const csv = [header, ...csvRows].map(r => r.join(',')).join('\n');
    const a = document.createElement('a');
    a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
    a.download = 'training-certifications.csv';
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
              <Award className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-white">Certifications</h1>
              <p className="text-white/55 text-sm mt-0.5">Every certificate issued across training programs</p>
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
                <th className="px-5 py-3">Type</th>
                <th className="px-5 py-3">Completed</th>
                <th className="px-5 py-3">Score</th>
                <th className="px-5 py-3">Certificate</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => (
                <tr key={r.id} className="border-b border-gray-50 hover:bg-gray-50/60 transition">
                  <td className="px-5 py-3">
                    <p className="font-bold text-gray-900">{r.employee_name}</p>
                    <p className="text-xs text-gray-400">{r.employee_code}</p>
                  </td>
                  <td className="px-5 py-3 text-gray-700">{r.program_title}</td>
                  <td className="px-5 py-3 text-gray-500 capitalize">{r.program_type?.replace(/_/g, ' ')}</td>
                  <td className="px-5 py-3 text-gray-500">{r.end_date ? dayjs(r.end_date).format('DD-MM-YYYY') : '—'}</td>
                  <td className="px-5 py-3 text-gray-700 font-bold">{r.score ?? '—'}</td>
                  <td className="px-5 py-3">
                    {r.certificate_url
                      ? <a href={r.certificate_url} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline text-xs font-bold">View</a>
                      : <span className="text-xs text-emerald-600 font-bold">Issued</span>}
                  </td>
                </tr>
              ))}
              {!isLoading && filtered.length === 0 && (
                <tr><td colSpan={6} className="px-5 py-16 text-center text-gray-400">No certificates issued yet</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </motion.div>
    </div>
  );
}
