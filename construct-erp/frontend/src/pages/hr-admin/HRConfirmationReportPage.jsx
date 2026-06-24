// Employee Confirmation Report — tracks probation-end dates and confirmation status
import React, { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  CheckCircle2, Clock, AlertTriangle, CalendarClock,
  Download, Search, Filter, Users, BadgeCheck, X, Check,
} from 'lucide-react';
import toast from 'react-hot-toast';
import * as XLSX from 'xlsx';
import { hrAdvancedAPI, hrComplianceAPI } from '../../api/client';

const fade = (d = 0) => ({
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.35, delay: d, ease: [0.16, 1, 0.3, 1] },
});

const STATUS_CONFIG = {
  overdue:   { label: 'Overdue',   color: '#DC2626', bg: '#FEE2E2', icon: AlertTriangle },
  due_soon:  { label: 'Due Soon',  color: '#D97706', bg: '#FEF3C7', icon: Clock },
  upcoming:  { label: 'Upcoming',  color: '#2563EB', bg: '#DBEAFE', icon: CalendarClock },
  confirmed: { label: 'Confirmed', color: '#059669', bg: '#D1FAE5', icon: CheckCircle2 },
};

function StatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.upcoming;
  const Icon = cfg.icon;
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold"
      style={{ background: cfg.bg, color: cfg.color }}>
      <Icon size={10} />{cfg.label}
    </span>
  );
}

function ddmmyyyy(d) {
  if (!d) return '—';
  const dt = new Date(d);
  return `${String(dt.getDate()).padStart(2,'0')}/${String(dt.getMonth()+1).padStart(2,'0')}/${dt.getFullYear()}`;
}

// ── Confirm Modal ─────────────────────────────────────────────────────────────
function ConfirmModal({ emp, onClose, onConfirm }) {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(10,31,92,0.45)' }} onClick={onClose}>
      <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center">
            <BadgeCheck size={20} className="text-emerald-600" />
          </div>
          <div>
            <p className="font-black text-gray-900">Confirm Employee</p>
            <p className="text-sm text-gray-500">{emp.name}</p>
          </div>
        </div>
        <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">
          Confirmation Date
        </label>
        <input type="date" value={date} onChange={e => setDate(e.target.value)}
          className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 mb-5" />
        <div className="flex gap-2">
          <button onClick={() => onConfirm(emp.id, date)}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700">
            <Check size={14} /> Mark Confirmed
          </button>
          <button onClick={onClose}
            className="w-10 flex items-center justify-center rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-500">
            <X size={15} />
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function HRConfirmationReportPage() {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState('');
  const [deptFilter, setDeptFilter] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [search, setSearch] = useState('');
  const [confirmEmp, setConfirmEmp] = useState(null);

  const { data, isLoading } = useQuery({
    queryKey: ['hr-confirmation-report', deptFilter, fromDate, toDate],
    queryFn: () => hrAdvancedAPI.confirmationReport({
      department_id: deptFilter || undefined,
      from_date: fromDate || undefined,
      to_date: toDate || undefined,
    }).then(r => r.data),
  });

  const { data: deptData } = useQuery({
    queryKey: ['hr-compliance-depts'],
    queryFn: () => hrComplianceAPI.departments().then(r => r.data?.data ?? []),
  });

  const confirmMut = useMutation({
    mutationFn: ({ id, date }) => hrAdvancedAPI.confirmEmployee(id, { date_of_confirmation: date }),
    onSuccess: () => {
      toast.success('Employee confirmed successfully');
      qc.invalidateQueries(['hr-confirmation-report']);
      setConfirmEmp(null);
    },
    onError: (e) => toast.error(e.response?.data?.error || 'Failed to confirm'),
  });

  const rows = data?.data || [];
  const summary = data?.summary || {};

  const filtered = useMemo(() => {
    let r = rows;
    if (statusFilter) r = r.filter(e => e.confirmation_status === statusFilter);
    if (search) {
      const q = search.toLowerCase();
      r = r.filter(e =>
        e.name?.toLowerCase().includes(q) ||
        e.employee_code?.toLowerCase().includes(q) ||
        e.department?.toLowerCase().includes(q) ||
        e.designation?.toLowerCase().includes(q)
      );
    }
    return r;
  }, [rows, statusFilter, search]);

  function exportExcel() {
    if (!filtered.length) { toast.error('No data to export'); return; }
    const ws = XLSX.utils.json_to_sheet(filtered.map(r => ({
      'Emp Code':           r.employee_code || '',
      'Employee Name':      r.name,
      'Department':         r.department || '',
      'Designation':        r.designation || '',
      'Date of Joining':    ddmmyyyy(r.date_of_joining),
      'Probation End Date': ddmmyyyy(r.probation_end_date),
      'Days Left':          r.days_left ?? '',
      'Confirmation Date':  ddmmyyyy(r.date_of_confirmation),
      'Status':             STATUS_CONFIG[r.confirmation_status]?.label || '',
      'Reporting Manager':  r.reporting_manager || '',
      'Work Location':      r.work_location || '',
    })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Confirmation Report');
    XLSX.writeFile(wb, `Employee_Confirmation_Report_${new Date().toISOString().slice(0,10)}.xlsx`);
    toast.success('Downloaded');
  }

  const statCards = [
    { label: 'Total on Probation', value: summary.total || 0,     color: '#2563EB', bg: '#EFF6FF', icon: Users },
    { label: 'Overdue',            value: summary.overdue || 0,   color: '#DC2626', bg: '#FEE2E2', icon: AlertTriangle },
    { label: 'Due This Month',     value: summary.due_soon || 0,  color: '#D97706', bg: '#FEF3C7', icon: Clock },
    { label: 'Upcoming',           value: summary.upcoming || 0,  color: '#2563EB', bg: '#DBEAFE', icon: CalendarClock },
    { label: 'Confirmed',          value: summary.confirmed || 0, color: '#059669', bg: '#D1FAE5', icon: CheckCircle2 },
  ];

  return (
    <div className="min-h-screen" style={{ background: '#F8FAFC' }}>

      {/* Header */}
      <motion.div {...fade(0)} className="relative overflow-hidden"
        style={{ background: 'linear-gradient(135deg,#0A1F5C,#1e3a8a)', boxShadow: '0 4px 20px rgba(10,31,92,0.2)' }}>
        <div className="absolute top-0 right-0 w-64 h-64 rounded-full opacity-[0.06]"
          style={{ background: 'radial-gradient(circle,#fff,transparent 70%)', transform: 'translate(25%,-25%)' }} />
        <div className="relative z-10 px-7 py-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <p className="text-white/60 text-sm font-semibold mb-1">HR & Admin · Employee Master Reports</p>
              <h1 className="text-2xl font-black text-white">Employee Confirmation Report</h1>
              <p className="text-white/55 text-sm mt-1">Track probation periods and confirmation status</p>
            </div>
            <button onClick={exportExcel}
              className="flex items-center gap-2 px-5 py-2.5 bg-white/15 hover:bg-white/25 border border-white/25 text-white text-sm font-bold rounded-xl transition-all flex-shrink-0">
              <Download size={14} /> Export Excel
            </button>
          </div>
        </div>
      </motion.div>

      <div className="px-7 py-6 space-y-6">

        {/* Stat Cards */}
        <motion.div {...fade(0.05)} className="grid grid-cols-2 sm:grid-cols-5 gap-4">
          {statCards.map((c, i) => {
            const Icon = c.icon;
            return (
              <motion.div key={c.label} {...fade(i * 0.05)}
                onClick={() => setStatusFilter(
                  statusFilter === (['','overdue','due_soon','upcoming','confirmed'][i]) ? '' : ['','overdue','due_soon','upcoming','confirmed'][i]
                )}
                className="bg-white rounded-2xl p-4 cursor-pointer hover:shadow-md transition-all border"
                style={{
                  borderColor: `${c.color}20`,
                  boxShadow: '0 2px 10px rgba(10,31,92,0.06)',
                  borderTop: `3px solid ${c.color}`,
                  outline: statusFilter === (['','overdue','due_soon','upcoming','confirmed'][i]) ? `2px solid ${c.color}` : 'none',
                }}>
                <div className="w-9 h-9 rounded-xl flex items-center justify-center mb-2"
                  style={{ background: c.bg }}>
                  <Icon size={16} style={{ color: c.color }} />
                </div>
                <p className="text-2xl font-black" style={{ color: c.color }}>{c.value}</p>
                <p className="text-xs text-gray-500 font-semibold mt-0.5">{c.label}</p>
              </motion.div>
            );
          })}
        </motion.div>

        {/* Filters */}
        <motion.div {...fade(0.1)} className="bg-white rounded-2xl p-4 border border-gray-100"
          style={{ boxShadow: '0 2px 10px rgba(10,31,92,0.06)' }}>
          <div className="flex flex-wrap gap-3 items-center">
            <Filter size={14} className="text-gray-400" />

            {/* Search */}
            <div className="relative">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Name, code, department…"
                className="pl-8 pr-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 w-52" />
            </div>

            {/* Status */}
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
              className="px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-400">
              <option value="">All Status</option>
              <option value="overdue">Overdue</option>
              <option value="due_soon">Due Soon (30 days)</option>
              <option value="upcoming">Upcoming</option>
              <option value="confirmed">Confirmed</option>
            </select>

            {/* Department */}
            <select value={deptFilter} onChange={e => setDeptFilter(e.target.value)}
              className="px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-400">
              <option value="">All Departments</option>
              {(deptData || []).map(d => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>

            {/* Probation End Date range */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400 font-semibold">Probation End:</span>
              <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)}
                className="px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
              <span className="text-gray-400 text-xs">to</span>
              <input type="date" value={toDate} onChange={e => setToDate(e.target.value)}
                className="px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
            </div>

            {(statusFilter || deptFilter || fromDate || toDate || search) && (
              <button onClick={() => { setStatusFilter(''); setDeptFilter(''); setFromDate(''); setToDate(''); setSearch(''); }}
                className="flex items-center gap-1 px-3 py-2 bg-red-50 text-red-600 text-sm font-semibold rounded-xl hover:bg-red-100">
                <X size={12} /> Clear
              </button>
            )}

            <span className="ml-auto text-xs text-gray-400 font-semibold">
              {filtered.length} employee{filtered.length !== 1 ? 's' : ''}
            </span>
          </div>
        </motion.div>

        {/* Table */}
        <motion.div {...fade(0.15)} className="bg-white rounded-2xl border border-gray-100 overflow-hidden"
          style={{ boxShadow: '0 2px 10px rgba(10,31,92,0.06)' }}>
          {isLoading ? (
            <div className="flex items-center justify-center h-48 text-gray-400 text-sm gap-2">
              <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              Loading…
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 gap-2 text-gray-400">
              <Users size={36} className="text-gray-200" />
              <p className="text-sm">No employees match the current filters</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ background: '#F8FAFC', borderBottom: '2px solid #E5E7EB' }}>
                    {['#', 'Emp Code', 'Employee Name', 'Department', 'Designation',
                      'Date of Joining', 'Probation End', 'Days Left', 'Confirmation Date', 'Status', 'Action'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-[11px] font-black text-gray-500 uppercase tracking-wider whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((emp, i) => {
                    const st = emp.confirmation_status;
                    const isOverdue = st === 'overdue';
                    const isDueSoon = st === 'due_soon';
                    return (
                      <tr key={emp.id}
                        className="border-b border-gray-50 hover:bg-gray-50 transition-colors"
                        style={{ background: isOverdue ? '#FFF8F8' : isDueSoon ? '#FFFBF0' : undefined }}>
                        <td className="px-4 py-3 text-gray-400 text-xs">{i + 1}</td>
                        <td className="px-4 py-3 font-mono text-xs text-gray-500">{emp.employee_code || '—'}</td>
                        <td className="px-4 py-3">
                          <p className="font-bold text-gray-900 whitespace-nowrap">{emp.name}</p>
                          <p className="text-[10px] text-gray-400">{emp.email}</p>
                        </td>
                        <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{emp.department || '—'}</td>
                        <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{emp.designation || '—'}</td>
                        <td className="px-4 py-3 text-gray-700 whitespace-nowrap font-mono text-[12px]">
                          {ddmmyyyy(emp.date_of_joining)}
                        </td>
                        <td className="px-4 py-3 font-mono text-[12px] whitespace-nowrap"
                          style={{ color: isOverdue ? '#DC2626' : isDueSoon ? '#D97706' : '#374151', fontWeight: (isOverdue || isDueSoon) ? 700 : 400 }}>
                          {ddmmyyyy(emp.probation_end_date)}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {emp.date_of_confirmation ? (
                            <span className="text-gray-400 text-xs">—</span>
                          ) : (
                            <span className={`text-[12px] font-black tabular-nums ${
                              emp.days_left < 0 ? 'text-red-600' :
                              emp.days_left <= 30 ? 'text-amber-600' : 'text-blue-600'
                            }`}>
                              {emp.days_left < 0 ? `${Math.abs(emp.days_left)}d overdue` : `${emp.days_left}d`}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 font-mono text-[12px] text-emerald-700 whitespace-nowrap">
                          {ddmmyyyy(emp.date_of_confirmation)}
                        </td>
                        <td className="px-4 py-3"><StatusBadge status={st} /></td>
                        <td className="px-4 py-3">
                          {st !== 'confirmed' && (
                            <button onClick={() => setConfirmEmp(emp)}
                              className="flex items-center gap-1 px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-xs font-bold rounded-lg transition-colors whitespace-nowrap">
                              <BadgeCheck size={11} /> Confirm
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </motion.div>

        {/* Legend */}
        <div className="flex flex-wrap gap-3">
          {Object.entries(STATUS_CONFIG).map(([key, cfg]) => {
            const Icon = cfg.icon;
            return (
              <div key={key} className="flex items-center gap-1.5 text-xs font-semibold"
                style={{ color: cfg.color }}>
                <Icon size={11} />{cfg.label}
                {key === 'overdue'  && <span className="text-gray-400 font-normal">— probation ended &gt;7 days ago, not yet confirmed</span>}
                {key === 'due_soon' && <span className="text-gray-400 font-normal">— probation ends within 30 days</span>}
                {key === 'upcoming' && <span className="text-gray-400 font-normal">— probation ends in &gt;30 days</span>}
                {key === 'confirmed'&& <span className="text-gray-400 font-normal">— confirmation date recorded</span>}
              </div>
            );
          })}
        </div>
      </div>

      {/* Confirm Modal */}
      {confirmEmp && (
        <ConfirmModal
          emp={confirmEmp}
          onClose={() => setConfirmEmp(null)}
          onConfirm={(id, date) => confirmMut.mutate({ id, date })}
        />
      )}
    </div>
  );
}
