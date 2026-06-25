import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Trash2, PlusCircle, X, Search } from 'lucide-react';
import { hrStopSalaryAPI, hrEmployeesAPI } from '../../api/client';

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
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-semibold text-gray-800">Add Stop Salary Processing</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>

        {error && <p className="text-red-600 text-sm mb-3">{error}</p>}

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Search Employee</label>
            <div className="relative">
              <Search size={16} className="absolute left-3 top-2.5 text-gray-400" />
              <input
                type="text"
                className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Name or employee code…"
                value={selected ? (selected.name || selected.employee_name) : search}
                onChange={(e) => { setSearch(e.target.value); setSelected(null); }}
              />
            </div>
            {!selected && employees.length > 0 && (
              <div className="border border-gray-200 rounded-lg mt-1 max-h-40 overflow-y-auto shadow-sm">
                {employees.map((emp) => (
                  <div
                    key={emp.user_id || emp.id}
                    className="px-3 py-2 hover:bg-blue-50 cursor-pointer text-sm"
                    onClick={() => { setSelected(emp); setSearch(''); }}
                  >
                    <span className="font-medium">{emp.name || emp.employee_name}</span>
                    <span className="text-gray-500 ml-2 text-xs">{emp.employee_code}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Remarks</label>
            <textarea
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              rows={3}
              placeholder="Reason for stopping salary…"
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
            />
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-6">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Add'}
          </button>
        </div>
      </div>
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
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="p-6 max-w-5xl mx-auto"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Stop Salary Processing</h1>
          <p className="text-sm text-gray-500 mt-0.5">Employees flagged here will be excluded from the payroll run.</p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700"
        >
          <PlusCircle size={16} />
          Add Stop Salary Processing
        </button>
      </div>

      {/* Filter */}
      <div className="mb-4">
        <div className="relative w-72">
          <Search size={15} className="absolute left-3 top-2.5 text-gray-400" />
          <input
            type="text"
            className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Filter by name or code…"
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Employee No</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Employee Name</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Department</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Remarks</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Stopped By</th>
              <th className="px-4 py-3 text-center font-medium text-gray-600">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {isLoading ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-gray-400">Loading…</td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-gray-400">
                  {filterText ? 'No matching records.' : 'No employees have been flagged for stop salary processing.'}
                </td>
              </tr>
            ) : rows.map((row) => (
              <tr key={row.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 text-gray-700 font-mono text-xs">{row.employee_code || '—'}</td>
                <td className="px-4 py-3 font-medium text-gray-900">{row.employee_name}</td>
                <td className="px-4 py-3 text-gray-600">{row.department_name || '—'}</td>
                <td className="px-4 py-3 text-gray-600 max-w-xs truncate" title={row.remarks}>{row.remarks || '—'}</td>
                <td className="px-4 py-3 text-gray-600">{row.stopped_by_name || '—'}</td>
                <td className="px-4 py-3 text-center">
                  <button
                    onClick={() => {
                      if (window.confirm(`Remove stop flag for ${row.employee_name}?`)) {
                        removeMut.mutate(row.id);
                      }
                    }}
                    className="text-red-500 hover:text-red-700 p-1 rounded"
                    title="Remove stop flag"
                  >
                    <Trash2 size={16} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {rows.length > 0 && (
          <div className="px-4 py-2 bg-gray-50 border-t border-gray-200 text-xs text-gray-500">
            {rows.length} employee{rows.length !== 1 ? 's' : ''} flagged
          </div>
        )}
      </div>

      {showAdd && (
        <AddStopModal
          onClose={() => setShowAdd(false)}
          onSaved={() => qc.invalidateQueries({ queryKey: ['hr-stop-salary'] })}
        />
      )}
    </motion.div>
  );
}
