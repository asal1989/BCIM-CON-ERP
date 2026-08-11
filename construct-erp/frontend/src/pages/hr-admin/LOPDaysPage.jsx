import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { MinusCircle, Plus, Trash2, Search, Download } from 'lucide-react';
import { hrLopAPI, hrEmployeesAPI } from '../../api/client';
import toast from 'react-hot-toast';

const MONTHS = ['','January','February','March','April','May','June','July','August','September','October','November','December'];
const now = new Date();
const YEARS = Array.from({ length: 5 }, (_, i) => now.getFullYear() - 2 + i);

const TABS = [
  { id: 'lop',           label: 'LOP',              desc: 'Loss of Pay is when salary is reduced for unpaid days.' },
  { id: 'reversal',      label: 'LOP Reversal',      desc: 'Reverse a previously entered LOP entry for an employee.' },
  { id: 'retrospective', label: 'Retrospective LOP', desc: 'Enter LOP for a past payroll period.' },
];

const fade = (d = 0) => ({ initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.32, delay: d } });

function downloadCSV(rows, month, year, type) {
  const header = 'Employee No,Name,Department,LOP Days,Reason';
  const lines = rows.map(r =>
    [r.employee_code || '', r.employee_name || '', r.department_name || '', r.lop_days || 0, r.reason || ''].join(',')
  );
  const blob = new Blob([[header, ...lines].join('\n')], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `lop-${type}-${MONTHS[month]}-${year}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function AddLopModal({ onClose, employees, month, year, type, existingIds, onSaved }) {
  const [empSearch, setEmpSearch] = useState('');
  const [selected, setSelected] = useState(null);
  const [lopDays, setLopDays] = useState('');
  const [reason, setReason]   = useState('');
  const qc = useQueryClient();

  const mutation = useMutation({
    mutationFn: (data) => hrLopAPI.save(data),
    onSuccess: () => {
      toast.success('LOP entry saved');
      qc.invalidateQueries(['lop', month, year, type]);
      onSaved?.();
      onClose();
    },
    onError: (e) => toast.error(e.response?.data?.error || 'Save failed'),
  });

  const filtered = (employees || []).filter(e =>
    !existingIds.includes(e.id) &&
    (`${e.name} ${e.employee_code}`).toLowerCase().includes(empSearch.toLowerCase())
  ).slice(0, 8);

  const handleSave = () => {
    if (!selected) return toast.error('Select an employee');
    const d = parseFloat(lopDays);
    if (isNaN(d) || d < 0) return toast.error('Enter valid LOP days');
    mutation.mutate({ user_id: selected.id, month, year, lop_days: d, type, reason });
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
        <h3 className="text-lg font-bold text-black mb-4">Add LOP Entry</h3>

        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Search Employee</label>
        <div className="relative mb-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            value={empSearch} onChange={e => { setEmpSearch(e.target.value); setSelected(null); }}
            placeholder="Name or employee code…"
            className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-blue-400"
          />
        </div>
        {!selected && empSearch && (
          <div className="border border-slate-200 rounded-xl overflow-hidden mb-3 max-h-44 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="p-3 text-sm text-slate-400">No employees found</p>
            ) : filtered.map(e => (
              <button key={e.id} onClick={() => { setSelected(e); setEmpSearch(e.name); }}
                className="w-full text-left px-4 py-2 hover:bg-blue-50 text-sm text-slate-700 flex items-center gap-2">
                <span className="font-semibold text-slate-900">{e.name}</span>
                <span className="text-slate-400 text-xs">{e.employee_code}</span>
              </button>
            ))}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 mt-3">
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">LOP Days</label>
            <input
              type="number" min="0" max="31" step="0.5"
              value={lopDays} onChange={e => setLopDays(e.target.value)}
              placeholder="e.g. 2.5"
              className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-blue-400"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Reason</label>
            <input
              value={reason} onChange={e => setReason(e.target.value)}
              placeholder="Optional"
              className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-blue-400"
            />
          </div>
        </div>

        <div className="flex gap-3 mt-5">
          <button onClick={onClose}
            className="flex-1 py-2 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition">
            Cancel
          </button>
          <button onClick={handleSave} disabled={mutation.isPending}
            className="flex-1 py-2 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition disabled:opacity-60">
            {mutation.isPending ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function LOPDaysPage() {
  const [tab, setTab]       = useState('lop');
  const [month, setMonth]   = useState(now.getMonth() + 1);
  const [year, setYear]     = useState(now.getFullYear());
  const [showAdd, setShowAdd] = useState(false);
  const [editRow, setEditRow] = useState(null);  // { id, lop_days, reason }
  const qc = useQueryClient();

  const { data: lopData, isLoading } = useQuery({
    queryKey: ['lop', month, year, tab],
    queryFn: () => hrLopAPI.list({ month, year, type: tab }).then(r => r.data.data || []),
  });

  const { data: empData } = useQuery({
    queryKey: ['employees-list'],
    queryFn: () => hrEmployeesAPI.list().then(r => r.data.data || []),
  });

  const deleteMut = useMutation({
    mutationFn: (id) => hrLopAPI.remove(id),
    onSuccess: () => { toast.success('Entry removed'); qc.invalidateQueries(['lop', month, year, tab]); },
    onError:   (e) => toast.error(e.response?.data?.error || 'Delete failed'),
  });

  const updateMut = useMutation({
    mutationFn: (d) => hrLopAPI.save(d),
    onSuccess: () => { toast.success('Updated'); setEditRow(null); qc.invalidateQueries(['lop', month, year, tab]); },
    onError:   (e) => toast.error(e.response?.data?.error || 'Update failed'),
  });

  const rows = lopData || [];
  const existingIds = rows.map(r => r.user_id);
  const currentTab = TABS.find(t => t.id === tab);

  const sel = 'h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-black focus:outline-none focus:border-blue-400 transition';

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <motion.div {...fade(0)} className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-2xl flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg,#0A1F5C,#1e3a8a)' }}>
            <MinusCircle className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-slate-900">Employee LOP Days</h1>
            <p className="text-sm text-slate-500">Manage Loss of Pay entries before payroll processing</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <select value={month} onChange={e => setMonth(Number(e.target.value))} className={sel}>
            {MONTHS.slice(1).map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
          </select>
          <select value={year} onChange={e => setYear(Number(e.target.value))} className={sel}>
            {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </motion.div>

      {/* Info banner */}
      <motion.div {...fade(0.05)} className="bg-blue-50 border border-blue-100 rounded-2xl px-5 py-3 text-sm text-blue-700">
        <strong>Note:</strong> {currentTab?.desc} LOP reduces net pay proportionally. Entries must be added before running payroll for {MONTHS[month]} {year}.
      </motion.div>

      {/* Tabs */}
      <motion.div {...fade(0.08)} className="flex gap-1 bg-slate-100 rounded-2xl p-1 w-fit">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-5 py-2 rounded-xl text-sm font-bold transition ${
              tab === t.id ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}>
            {t.label}
          </button>
        ))}
      </motion.div>

      {/* Actions bar */}
      <motion.div {...fade(0.1)} className="flex items-center justify-between">
        <p className="text-sm text-slate-500">
          {rows.length} {rows.length === 1 ? 'entry' : 'entries'} for {MONTHS[month]} {year}
        </p>
        <div className="flex gap-2">
          {rows.length > 0 && (
            <button onClick={() => downloadCSV(rows, month, year, tab)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition">
              <Download className="h-4 w-4" /> Export CSV
            </button>
          )}
          <button onClick={() => setShowAdd(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-white text-sm font-bold transition"
            style={{ background: 'linear-gradient(135deg,#0A1F5C,#1e3a8a)' }}>
            <Plus className="h-4 w-4" /> Add Entry
          </button>
        </div>
      </motion.div>

      {/* Table */}
      <motion.div {...fade(0.12)} className="bg-white rounded-2xl border border-slate-100 overflow-hidden"
        style={{ boxShadow: '0 4px 24px rgba(10,31,92,0.07)' }}>
        {isLoading ? (
          <div className="p-12 text-center text-slate-400 text-sm">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="p-16 text-center">
            <MinusCircle className="h-10 w-10 text-slate-200 mx-auto mb-3" />
            <p className="text-slate-500 font-semibold">No LOP entries for {MONTHS[month]} {year}</p>
            <p className="text-slate-400 text-sm mt-1">Click "Add Entry" to add a Loss of Pay entry.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50 text-xs font-black uppercase tracking-wide text-slate-500">
                <th className="px-5 py-3 text-left">#</th>
                <th className="px-5 py-3 text-left">Emp No</th>
                <th className="px-5 py-3 text-left">Name</th>
                <th className="px-5 py-3 text-left">Department</th>
                <th className="px-5 py-3 text-right">LOP Days</th>
                <th className="px-5 py-3 text-left">Reason</th>
                <th className="px-5 py-3 text-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={row.id} className="border-b border-slate-50 hover:bg-slate-50/60 transition">
                  <td className="px-5 py-3 text-slate-400">{i + 1}</td>
                  <td className="px-5 py-3 font-mono text-slate-500 text-xs">{row.employee_code || '—'}</td>
                  <td className="px-5 py-3 font-bold text-black">{row.employee_name}</td>
                  <td className="px-5 py-3 text-slate-500">{row.department_name || '—'}</td>
                  <td className="px-5 py-3 text-right">
                    {editRow?.id === row.id ? (
                      <input
                        type="number" min="0" max="31" step="0.5"
                        value={editRow.lop_days}
                        onChange={e => setEditRow(r => ({ ...r, lop_days: e.target.value }))}
                        className="w-20 text-right border border-blue-300 rounded-lg px-2 py-1 text-sm focus:outline-none"
                        autoFocus
                      />
                    ) : (
                      <span className="font-bold text-red-600 bg-red-50 px-2 py-0.5 rounded-lg">{row.lop_days}</span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-slate-500">
                    {editRow?.id === row.id ? (
                      <input
                        value={editRow.reason}
                        onChange={e => setEditRow(r => ({ ...r, reason: e.target.value }))}
                        className="border border-blue-300 rounded-lg px-2 py-1 text-sm focus:outline-none w-36"
                      />
                    ) : (
                      row.reason || <span className="text-slate-300">—</span>
                    )}
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center justify-center gap-2">
                      {editRow?.id === row.id ? (
                        <>
                          <button onClick={() => updateMut.mutate({ user_id: row.user_id, month, year, type: tab, lop_days: editRow.lop_days, reason: editRow.reason })}
                            className="px-3 py-1 rounded-lg bg-blue-600 text-white text-xs font-bold hover:bg-blue-700 transition">
                            Save
                          </button>
                          <button onClick={() => setEditRow(null)}
                            className="px-3 py-1 rounded-lg border border-slate-200 text-xs font-bold text-slate-500 hover:bg-slate-50 transition">
                            Cancel
                          </button>
                        </>
                      ) : (
                        <>
                          <button onClick={() => setEditRow({ id: row.id, lop_days: row.lop_days, reason: row.reason || '' })}
                            className="p-1.5 rounded-lg hover:bg-blue-50 text-blue-500 transition text-xs font-bold">
                            Edit
                          </button>
                          <button onClick={() => { if (window.confirm('Remove this LOP entry?')) deleteMut.mutate(row.id); }}
                            className="p-1.5 rounded-lg hover:bg-red-50 text-red-400 transition">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-slate-200 bg-slate-50">
                <td colSpan={4} className="px-5 py-3 text-xs font-black uppercase text-slate-500">Total LOP Days</td>
                <td className="px-5 py-3 text-right font-black text-red-600">
                  {rows.reduce((s, r) => s + parseFloat(r.lop_days || 0), 0).toFixed(1)}
                </td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          </table>
        )}
      </motion.div>

      {/* Add modal */}
      {showAdd && (
        <AddLopModal
          onClose={() => setShowAdd(false)}
          employees={empData}
          month={month} year={year} type={tab}
          existingIds={existingIds}
          onSaved={() => {}}
        />
      )}
    </div>
  );
}
