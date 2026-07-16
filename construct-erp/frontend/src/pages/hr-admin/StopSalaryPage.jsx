import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Trash2, PlusCircle, X, Search, UserX, ShieldOff } from 'lucide-react';
import { hrStopSalaryAPI, hrEmployeesAPI } from '../../api/client';

const B = { navy: '#0A1F5C', blue: '#2563EB', yellow: '#F4C430' };
const fade = (d = 0) => ({ initial: { opacity: 0, y: 14 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.35, delay: d, ease: [0.16, 1, 0.3, 1] } });

const AVATAR_GRADS = [
  ['#6366F1', '#4F46E5'], ['#0EA5E9', '#0284C7'], ['#10B981', '#059669'],
  ['#F59E0B', '#D97706'], ['#EF4444', '#DC2626'], ['#8B5CF6', '#7C3AED'],
];
const avatarGrad = (n) => AVATAR_GRADS[(n?.charCodeAt(0) || 0) % AVATAR_GRADS.length];
const initials = (n) => (n || 'U').split(' ').map(x => x[0]).join('').slice(0, 2).toUpperCase();

// ─── Add Employee Modal ────────────────────────────────────────────────────────
function AddStopModal({ onClose, onSaved }) {
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null);
  const [remarks, setRemarks] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const { data: empData } = useQuery({
    queryKey: ['hr-emp-search-stop', search],
    queryFn: () => hrEmployeesAPI.list({ search, limit: 20 }),
    enabled: search.length >= 1,
    select: (r) => r.data?.data || [],
  });

  const employees = empData || [];

  const handleSave = async () => {
    if (!selected) { setError('Please select an employee.'); return; }
    setSaving(true);
    try {
      await hrStopSalaryAPI.save({ user_id: selected.user_id || selected.id, remarks });
      onSaved();
      onClose();
    } catch (e) {
      setError(e.response?.data?.error || 'Failed to save.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)' }}>
      <motion.div initial={{ scale: 0.95, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }}
        transition={{ duration: 0.22 }} className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100"
          style={{ background: `linear-gradient(135deg,${B.navy},#1e3a8a)` }}>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-white/15 flex items-center justify-center">
              <ShieldOff className="w-5 h-5 text-white" />
            </div>
            <p className="font-bold text-white">Add Stop Salary Processing</p>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-lg bg-white/10 flex items-center justify-center text-white hover:bg-white/20"><X className="w-4 h-4" /></button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {error && <p className="text-red-600 text-sm">{error}</p>}

          <div>
            <label className="text-xs font-black text-gray-600 uppercase tracking-wide block mb-1.5">Search Employee</label>
            <div className="relative">
              <Search size={16} className="absolute left-3 top-3 text-gray-400" />
              <input
                type="text"
                className="w-full pl-9 pr-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-900 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50 transition-all"
                placeholder="Name or employee code…"
                value={selected ? (selected.name || selected.employee_name) : search}
                onChange={(e) => { setSearch(e.target.value); setSelected(null); }}
              />
            </div>
            {!selected && employees.length > 0 && (
              <div className="border border-gray-200 rounded-xl mt-1.5 max-h-40 overflow-y-auto shadow-sm">
                {employees.map((emp) => (
                  <div
                    key={emp.user_id || emp.id}
                    className="px-3 py-2 hover:bg-blue-50 cursor-pointer text-sm flex items-center gap-2"
                    onClick={() => { setSelected(emp); setSearch(''); }}
                  >
                    <span className="font-bold text-gray-900">{emp.name || emp.employee_name}</span>
                    <span className="text-gray-400 text-xs">{emp.employee_code}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <label className="text-xs font-black text-gray-600 uppercase tracking-wide block mb-1.5">Remarks</label>
            <textarea
              className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-900 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50 transition-all"
              rows={3}
              placeholder="Reason for stopping salary…"
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
            />
          </div>
        </div>

        <div className="flex gap-3 px-6 pb-6">
          <button onClick={onClose} className="flex-1 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-sm font-bold transition-colors">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 py-2.5 text-white rounded-xl text-sm font-black disabled:opacity-50"
            style={{ background: `linear-gradient(135deg,${B.blue},${B.navy})` }}
          >
            {saving ? 'Saving…' : 'Add'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────
export default function StopSalaryPage() {
  const qc = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [filterText, setFilterText] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['hr-stop-salary'],
    queryFn: () => hrStopSalaryAPI.list(),
    select: (r) => r.data?.data || [],
  });

  const removeMut = useMutation({
    mutationFn: (id) => hrStopSalaryAPI.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['hr-stop-salary'] }),
  });

  const rows = (data || []).filter((r) => {
    if (!filterText) return true;
    const t = filterText.toLowerCase();
    return (
      (r.employee_name || '').toLowerCase().includes(t) ||
      (r.employee_code || '').toLowerCase().includes(t)
    );
  });

  return (
    <div className="p-6 space-y-6 min-h-screen" style={{ background: '#F8FAFC' }}>

      {/* Header */}
      <motion.div {...fade(0)} className="relative overflow-hidden rounded-2xl"
        style={{ background: `linear-gradient(135deg,${B.navy},#1e3a8a)`, boxShadow: '0 8px 32px rgba(10,31,92,0.2)' }}>
        <div className="absolute top-0 right-0 w-64 h-64 rounded-full opacity-[0.07]"
          style={{ background: 'radial-gradient(circle,#fff,transparent 70%)', transform: 'translate(25%,-25%)' }} />
        <div className="relative z-10 px-8 py-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <div className="w-8 h-8 rounded-xl bg-white/15 flex items-center justify-center">
                <ShieldOff className="w-4 h-4 text-white" />
              </div>
              <span className="text-white/60 text-sm font-semibold">HR & Admin</span>
            </div>
            <h1 className="text-2xl font-black text-white">Stop Salary Processing</h1>
            <p className="text-white/55 text-sm mt-1">Employees flagged here are excluded from the payroll run</p>
          </div>
          <button
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-black shadow-lg hover:opacity-90 self-start transition-opacity"
            style={{ background: B.yellow, color: B.navy }}
          >
            <PlusCircle className="w-4 h-4" />
            Add Stop Salary Processing
          </button>
        </div>
      </motion.div>

      {/* KPI */}
      <motion.div {...fade(0.06)} className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Employees Flagged', value: rows.length, icon: UserX, color: '#EF4444', bg: '#FEF2F2' },
        ].map(c => (
          <div key={c.label} className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-medium text-gray-500">{c.label}</p>
              <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: c.bg }}>
                <c.icon className="w-4 h-4" style={{ color: c.color }} />
              </div>
            </div>
            <p className="text-2xl font-medium text-gray-900">{c.value}</p>
          </div>
        ))}
      </motion.div>

      {/* Search */}
      <motion.div {...fade(0.1)} className="relative w-full sm:w-80">
        <Search size={16} className="absolute left-3.5 top-3 text-gray-400" />
        <input
          type="text"
          className="w-full pl-10 pr-3 py-2.5 bg-white border border-gray-200 rounded-xl text-sm text-gray-900 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50 shadow-sm transition-all"
          placeholder="Filter by name or code…"
          value={filterText}
          onChange={(e) => setFilterText(e.target.value)}
        />
      </motion.div>

      {/* List */}
      <motion.div {...fade(0.14)} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <div className="w-8 h-8 rounded-full border-2 border-blue-200 border-t-blue-600 animate-spin" />
            <p className="text-sm text-gray-400">Loading…</p>
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-4">
            <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center">
              <ShieldOff className="w-8 h-8 text-gray-300" />
            </div>
            <p className="text-gray-500 font-bold">
              {filterText ? 'No matching records' : 'No employees have been flagged for stop salary processing'}
            </p>
          </div>
        ) : (
          <>
            <div className="divide-y divide-gray-50">
              {rows.map(row => {
                const [g1, g2] = avatarGrad(row.employee_name);
                return (
                  <div key={row.id} className="flex items-center gap-3 px-5 py-3.5 hover:bg-gray-50 transition-colors">
                    <div className="w-10 h-10 rounded-[11px] flex-shrink-0 flex items-center justify-center text-white text-xs font-bold"
                      style={{ background: `linear-gradient(135deg,${g1},${g2})` }}>
                      {initials(row.employee_name)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13.5px] font-bold text-gray-900 truncate">{row.employee_name}</p>
                      <p className="text-[11.5px] text-gray-400 truncate">{row.employee_code || '—'} · {row.department_name || '—'}</p>
                    </div>
                    <div className="hidden md:block flex-1 min-w-0 max-w-xs">
                      <p className="text-xs text-gray-500 truncate" title={row.remarks}>{row.remarks || '—'}</p>
                    </div>
                    <div className="hidden sm:block text-right w-32 flex-shrink-0">
                      <p className="text-[10px] text-gray-400 font-semibold">STOPPED BY</p>
                      <p className="text-xs font-bold text-gray-700 truncate">{row.stopped_by_name || '—'}</p>
                    </div>
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-full bg-red-50 text-red-700 flex-shrink-0">
                      <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                      Stopped
                    </span>
                    <button
                      onClick={() => { if (window.confirm(`Remove stop flag for ${row.employee_name}?`)) removeMut.mutate(row.id); }}
                      title="Remove stop flag"
                      className="w-7 h-7 rounded-lg bg-red-50 hover:bg-red-100 text-red-500 flex items-center justify-center transition-colors flex-shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
            <div className="px-5 py-3 bg-gray-50 border-t border-gray-100">
              <p className="text-sm font-bold text-gray-700">{rows.length} employee{rows.length !== 1 ? 's' : ''} flagged</p>
            </div>
          </>
        )}
      </motion.div>

      {showAdd && (
        <AddStopModal
          onClose={() => setShowAdd(false)}
          onSaved={() => qc.invalidateQueries({ queryKey: ['hr-stop-salary'] })}
        />
      )}
    </div>
  );
}
