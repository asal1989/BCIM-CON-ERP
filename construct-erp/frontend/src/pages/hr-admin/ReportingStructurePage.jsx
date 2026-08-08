// src/pages/hr-admin/ReportingStructurePage.jsx
import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Network, Search, User } from 'lucide-react';
import { hrMastersAPI } from '../../api/client';
import toast from 'react-hot-toast';

const fade = (d = 0) => ({ initial: { opacity: 0, y: 14 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.35, delay: d, ease: [0.16, 1, 0.3, 1] } });

export default function ReportingStructurePage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['hr-reporting-structure'],
    queryFn: () => hrMastersAPI.listReportingStructure().then(r => r.data),
  });
  const employees = data?.data || [];

  const saveMut = useMutation({
    mutationFn: ({ userId, reporting_manager_id }) => hrMastersAPI.updateReportingManager(userId, { reporting_manager_id }),
    onSuccess: () => { toast.success('Reporting manager updated'); qc.invalidateQueries({ queryKey: ['hr-reporting-structure'] }); },
    onError: (e) => toast.error(e.response?.data?.error || 'Error'),
  });

  const filtered = employees.filter(e =>
    e.name?.toLowerCase().includes(search.toLowerCase()) ||
    e.department_name?.toLowerCase().includes(search.toLowerCase()) ||
    e.designation_name?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-6 space-y-6 min-h-screen" style={{ background: '#F8FAFC' }}>
      <motion.div {...fade(0)} className="relative overflow-hidden rounded-2xl"
        style={{ background: `linear-gradient(135deg,#0A1F5C,#1e3a8a)`, boxShadow: '0 8px 32px rgba(10,31,92,0.2)' }}>
        <div className="absolute top-0 right-0 w-64 h-64 rounded-full opacity-[0.07]"
          style={{ background: 'radial-gradient(circle,#fff,transparent 70%)', transform: 'translate(25%,-25%)' }} />
        <div className="relative z-10 px-8 py-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center">
              <Network className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-white">Reporting Structure</h1>
              <p className="text-white/55 text-sm mt-0.5">Assign each employee's reporting manager</p>
            </div>
          </div>
          <div className="flex items-center gap-2.5 bg-white/10 border border-white/20 rounded-xl px-4 py-2.5">
            <User className="w-4 h-4 text-white/70" />
            <span className="text-lg font-black text-white leading-none">{employees.length}</span>
            <span className="text-xs text-white/50 font-bold">Employees</span>
          </div>
        </div>
      </motion.div>

      <motion.div {...fade(0.08)} className="bg-white rounded-2xl border border-gray-100 overflow-hidden"
        style={{ boxShadow: '0 2px 12px rgba(10,31,92,0.06)' }}>
        <div className="p-4 border-b border-gray-100">
          <div className="relative max-w-sm">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search employee, department, designation…"
              className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-900 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50 transition-all" />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[10px] font-black text-gray-400 uppercase tracking-wide border-b border-gray-100">
                <th className="px-5 py-3">Employee</th>
                <th className="px-5 py-3">Department</th>
                <th className="px-5 py-3">Designation</th>
                <th className="px-5 py-3">Reports To</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(emp => (
                <tr key={emp.user_id} className="border-b border-gray-50 hover:bg-gray-50/60 transition">
                  <td className="px-5 py-3">
                    <p className="font-bold text-gray-900">{emp.name}</p>
                    <p className="text-xs text-gray-400">{emp.email}</p>
                  </td>
                  <td className="px-5 py-3 text-gray-600">{emp.department_name || '—'}</td>
                  <td className="px-5 py-3 text-gray-600">{emp.designation_name || '—'}</td>
                  <td className="px-5 py-3">
                    <select
                      className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50 transition-all min-w-[180px]"
                      value={emp.reporting_manager_id || ''}
                      onChange={e => saveMut.mutate({ userId: emp.user_id, reporting_manager_id: e.target.value || null })}
                    >
                      <option value="">— No manager —</option>
                      {employees.filter(m => m.user_id !== emp.user_id).map(m => (
                        <option key={m.user_id} value={m.user_id}>{m.name}</option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
              {!isLoading && filtered.length === 0 && (
                <tr><td colSpan={4} className="px-5 py-16 text-center text-gray-400">
                  {search ? 'No employees match' : 'No active employees found'}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </motion.div>
    </div>
  );
}
