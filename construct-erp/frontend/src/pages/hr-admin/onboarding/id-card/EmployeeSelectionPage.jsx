// src/pages/hr-admin/onboarding/id-card/EmployeeSelectionPage.jsx
import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Users, ArrowLeft, Search, CheckSquare, Square, Sparkles } from 'lucide-react';
import { hrIdCardAPI, hrMastersAPI } from '../../../../api/client';
import { B, fade, avatarGrad, initials } from '../../../../components/hr/DashboardKit';

export default function EmployeeSelectionPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [status, setStatus] = useState('');
  const [selected, setSelected] = useState(new Set());

  const { data, isLoading } = useQuery({
    queryKey: ['idcard-employees', search, departmentId, status],
    queryFn: () => hrIdCardAPI.employees({ search: search || undefined, department_id: departmentId || undefined, status: status || undefined }).then(r => r.data.data),
  });
  const { data: departments } = useQuery({ queryKey: ['hr-departments'], queryFn: () => hrMastersAPI.listDepts().then(r => r.data?.data || []) });

  const bulkMut = useMutation({
    mutationFn: () => hrIdCardAPI.bulkGenerate({ employee_ids: Array.from(selected) }),
    onSuccess: (r) => { toast.success(`Generated ${r.data.data.generated} card(s), ${r.data.data.failed} failed`); setSelected(new Set()); qc.invalidateQueries({ queryKey: ['idcard-employees'] }); },
    onError: (e) => toast.error(e.response?.data?.error || 'Failed to generate'),
  });

  const employees = data || [];
  const toggle = (id) => setSelected(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  const toggleAll = () => setSelected(prev => prev.size === employees.length ? new Set() : new Set(employees.map(e => e.id)));

  return (
    <div className="min-h-screen p-4 md:p-6" style={{ background: B.bg }}>
      <button onClick={() => navigate('/hr-admin/onboarding/id-card')} className="flex items-center gap-1.5 text-sm font-bold text-gray-500 hover:text-gray-700 mb-4">
        <ArrowLeft className="w-4 h-4" /> Back to ID Card Dashboard
      </button>
      <motion.div {...fade(0)} className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: `${B.blue}18` }}><Users className="w-5 h-5" style={{ color: B.blue }} /></div>
          <div><h1 className="text-xl font-black text-gray-900">Employee Selection</h1><p className="text-xs text-gray-400">{selected.size} selected</p></div>
        </div>
        {selected.size > 0 && (
          <button disabled={bulkMut.isPending} onClick={() => bulkMut.mutate()} className="text-sm font-bold px-4 py-2.5 rounded-xl text-white flex items-center gap-2 disabled:opacity-50" style={{ background: `linear-gradient(135deg,${B.blue},${B.navy})` }}>
            <Sparkles className="w-4 h-4" /> Generate for {selected.size} Selected
          </button>
        )}
      </motion.div>

      <motion.div {...fade(0.05)} className="bg-white rounded-2xl p-3 mb-4 border border-gray-100 flex flex-wrap items-center gap-3" style={{ boxShadow: '0 2px 12px rgba(10,31,92,0.06)' }}>
        <div className="flex-1 min-w-[200px] relative">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name, code, mobile or email..."
            className="w-full text-sm pl-9 pr-3 py-2 rounded-lg border border-gray-200 focus:outline-none focus:border-blue-300" />
        </div>
        <select value={departmentId} onChange={e => setDepartmentId(e.target.value)} className="text-sm px-3 py-2 rounded-lg border border-gray-200 focus:outline-none">
          <option value="">All Departments</option>
          {(departments || []).map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        <select value={status} onChange={e => setStatus(e.target.value)} className="text-sm px-3 py-2 rounded-lg border border-gray-200 focus:outline-none">
          <option value="">Card Status: All</option>
          <option value="with_card">Has Active Card</option>
          <option value="without_card">No Active Card</option>
        </select>
      </motion.div>

      <motion.div {...fade(0.08)} className="bg-white rounded-2xl border border-gray-100 overflow-hidden" style={{ boxShadow: '0 2px 12px rgba(10,31,92,0.06)' }}>
        <button onClick={toggleAll} className="w-full flex items-center gap-2 p-3 border-b border-gray-50 text-xs font-bold text-gray-500">
          {selected.size === employees.length && employees.length > 0 ? <CheckSquare className="w-4 h-4" style={{ color: B.blue }} /> : <Square className="w-4 h-4" />} Select All
        </button>
        {isLoading && <p className="text-sm text-gray-400 text-center py-10">Loading...</p>}
        {!isLoading && employees.length === 0 && <p className="text-sm text-gray-400 text-center py-10">No employees match this filter.</p>}
        {employees.map(emp => {
          const [c1, c2] = avatarGrad(emp.name);
          const isSel = selected.has(emp.id);
          return (
            <button key={emp.id} onClick={() => toggle(emp.id)} className="w-full flex items-center gap-3 p-3 border-b border-gray-50 last:border-0 hover:bg-gray-50 text-left">
              {isSel ? <CheckSquare className="w-4 h-4 flex-shrink-0" style={{ color: B.blue }} /> : <Square className="w-4 h-4 flex-shrink-0 text-gray-300" />}
              <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0" style={{ background: `linear-gradient(135deg, ${c1}, ${c2})` }}>{initials(emp.name)}</div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-gray-800 truncate">{emp.name}</p>
                <p className="text-xs text-gray-400">{emp.employee_code} · {emp.department_name || '—'} · {emp.project_name || 'No project'}</p>
              </div>
              {emp.card_number
                ? <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600 flex-shrink-0">{emp.card_number}</span>
                : <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-400 flex-shrink-0">No Card</span>}
            </button>
          );
        })}
      </motion.div>
    </div>
  );
}
