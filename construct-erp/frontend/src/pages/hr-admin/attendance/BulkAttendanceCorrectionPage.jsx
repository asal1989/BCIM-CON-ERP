import React, { useState, useMemo } from 'react';
import { AlertTriangle, Users, Calendar, Search, CheckSquare, Square, ShieldAlert } from 'lucide-react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { hrEmployeesAPI, hrAttendanceAPI, projectAPI } from '../../../api/client';
import toast from 'react-hot-toast';

const STATUS_OPTIONS = [
  { value: 'present',  label: 'Present' },
  { value: 'half_day', label: 'Half Day' },
  { value: 'absent',   label: 'Absent' },
  { value: 'leave',    label: 'Leave' },
  { value: 'holiday',  label: 'Holiday' },
  { value: 'week_off', label: 'Week Off' },
];

// Direct HR bulk-write for genuine emergencies — biometric device down company-wide,
// a holiday mistakenly required attendance, a whole site's punches never synced, etc.
// This bypasses the employee-submits / manager-approves flow entirely and overwrites
// whatever attendance record already exists for the selected date, so it stays a
// separate screen from the normal Attendance Regularization queue rather than a
// shortcut bolted onto it.
export default function BulkAttendanceCorrectionPage() {
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [deptFilter, setDeptFilter] = useState('');
  const [projectFilter, setProjectFilter] = useState('');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState({});
  const [status, setStatus] = useState('present');
  const [inTime, setInTime] = useState('08:30');
  const [outTime, setOutTime] = useState('18:00');
  const [remarks, setRemarks] = useState('');
  const [confirming, setConfirming] = useState(false);

  const { data: employees = [], isLoading } = useQuery({
    queryKey: ['hr-bulk-corr-employees'],
    queryFn: () => hrEmployeesAPI.list().then(r => r.data?.data || []),
  });

  const { data: projects = [] } = useQuery({
    queryKey: ['hr-bulk-corr-projects'],
    queryFn: () => projectAPI.list().then(r => r.data?.data || []),
  });

  const active = useMemo(
    () => employees.filter(e => e.is_active && !['resigned', 'terminated', 'absconded'].includes(e.employment_status)),
    [employees]
  );

  const departments = useMemo(
    () => [...new Set(active.map(e => e.department_name).filter(Boolean))].sort(),
    [active]
  );

  // Project list scoped to only the projects that actually have employees
  // assigned, plus an explicit "Unassigned" bucket — a full project master
  // list would mostly show empty results here.
  const projectOptions = useMemo(() => {
    const idsWithStaff = new Set(active.map(e => e.project_id).filter(Boolean));
    const hasUnassigned = active.some(e => !e.project_id);
    const opts = projects.filter(p => idsWithStaff.has(p.id)).map(p => ({ id: p.id, label: p.name }));
    if (hasUnassigned) opts.push({ id: 'unassigned', label: 'Unassigned' });
    return opts;
  }, [projects, active]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return active.filter(e => {
      if (deptFilter && e.department_name !== deptFilter) return false;
      if (projectFilter === 'unassigned' && e.project_id) return false;
      if (projectFilter && projectFilter !== 'unassigned' && e.project_id !== projectFilter) return false;
      if (!q) return true;
      return [e.name, e.employee_code, e.email].some(v => String(v || '').toLowerCase().includes(q));
    });
  }, [active, deptFilter, projectFilter, search]);

  const selectedIds = Object.keys(selected).filter(id => selected[id]);
  const toggle = (id) => setSelected(prev => ({ ...prev, [id]: !prev[id] }));
  const toggleAllFiltered = () => {
    const allSelected = filtered.length > 0 && filtered.every(e => selected[e.id]);
    setSelected(prev => {
      const next = { ...prev };
      filtered.forEach(e => { next[e.id] = !allSelected; });
      return next;
    });
  };

  const bulkMut = useMutation({
    mutationFn: () => hrAttendanceAPI.bulk({
      attendance_date: date,
      records: selectedIds.map(id => ({
        user_id: id,
        status,
        in_time: ['present', 'half_day'].includes(status) ? inTime : null,
        out_time: ['present', 'half_day'].includes(status) ? outTime : null,
        remarks: remarks || `Bulk correction by HR — ${status}`,
      })),
    }),
    onSuccess: (r) => {
      toast.success(`Attendance updated for ${r.data?.count ?? selectedIds.length} employee(s)`);
      setSelected({});
      setConfirming(false);
    },
    onError: (e) => { toast.error(e?.response?.data?.error || 'Bulk update failed'); setConfirming(false); },
  });

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
          <ShieldAlert size={20} className="text-red-500" /> Bulk Attendance Correction
        </h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Directly set attendance for many employees at once — for critical situations only (biometric outage, mistaken holiday, etc.)
        </p>
      </div>

      <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl">
        <AlertTriangle size={18} className="text-amber-600 shrink-0 mt-0.5" />
        <div className="text-sm text-amber-800">
          <p className="font-semibold">This bypasses the normal request/approval flow.</p>
          <p className="mt-0.5 text-amber-700">
            It writes directly to each employee's attendance for the selected date and overwrites any existing
            record — no employee submission or manager approval is involved. Use it only when individual
            corrections aren't practical (e.g. an entire site's punches failed to sync).
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: shared settings */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4 h-fit">
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wide flex items-center gap-1.5 mb-1.5">
              <Calendar size={12} /> Date
            </label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-400" />
          </div>
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wide block mb-1.5">Status to Apply</label>
            <select value={status} onChange={e => setStatus(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-400">
              {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          {['present', 'half_day'].includes(status) && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wide block mb-1.5">In Time</label>
                <input type="time" value={inTime} onChange={e => setInTime(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-400" />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wide block mb-1.5">Out Time</label>
                <input type="time" value={outTime} onChange={e => setOutTime(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-400" />
              </div>
            </div>
          )}
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wide block mb-1.5">Remarks (recorded on every record)</label>
            <textarea rows={2} value={remarks} onChange={e => setRemarks(e.target.value)}
              placeholder="e.g. Biometric device offline 03 Aug — HR bulk correction"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-400 resize-none" />
          </div>

          <button
            disabled={selectedIds.length === 0 || bulkMut.isPending}
            onClick={() => setConfirming(true)}
            className="w-full py-2.5 rounded-lg font-semibold text-sm text-white bg-red-600 hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed transition"
          >
            Apply to {selectedIds.length} Employee{selectedIds.length === 1 ? '' : 's'}
          </button>
        </div>

        {/* Right: employee picker */}
        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center gap-3 mb-4 flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, code, email…"
                className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-200 text-sm outline-none focus:border-indigo-400" />
            </div>
            <select value={projectFilter} onChange={e => setProjectFilter(e.target.value)}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-400">
              <option value="">All Projects</option>
              {projectOptions.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
            <select value={deptFilter} onChange={e => setDeptFilter(e.target.value)}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-400">
              <option value="">All Departments</option>
              {departments.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
            <button onClick={toggleAllFiltered}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50">
              {filtered.length > 0 && filtered.every(e => selected[e.id]) ? <CheckSquare size={14} /> : <Square size={14} />}
              Select All ({filtered.length})
            </button>
          </div>

          {isLoading ? (
            <div className="py-16 text-center text-slate-400 text-sm">Loading employees…</div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center text-slate-400 text-sm">No employees match this filter</div>
          ) : (
            <div className="max-h-[520px] overflow-y-auto divide-y divide-slate-100 border border-slate-100 rounded-lg">
              {filtered.map(e => (
                <label key={e.id} className="flex items-center gap-3 px-3 py-2.5 hover:bg-slate-50 cursor-pointer">
                  <input type="checkbox" checked={!!selected[e.id]} onChange={() => toggle(e.id)} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800 truncate">{e.name}</p>
                    <p className="text-xs text-slate-400">{e.employee_code || '—'} · {e.department_name || 'No department'}{e.project_name ? ` · ${e.project_name}` : ''}</p>
                  </div>
                </label>
              ))}
            </div>
          )}
        </div>
      </div>

      {confirming && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setConfirming(false)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                <ShieldAlert size={18} className="text-red-600" />
              </div>
              <h3 className="text-base font-bold text-slate-800">Confirm Bulk Correction</h3>
            </div>
            <p className="text-sm text-slate-600">
              This will set attendance to <strong>{STATUS_OPTIONS.find(o => o.value === status)?.label}</strong> for{' '}
              <strong>{selectedIds.length}</strong> employee{selectedIds.length === 1 ? '' : 's'} on <strong>{date}</strong>,
              overwriting any existing record for that date. This cannot be undone from this screen.
            </p>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setConfirming(false)} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">Cancel</button>
              <button
                onClick={() => bulkMut.mutate()}
                disabled={bulkMut.isPending}
                className="px-5 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-sm font-semibold rounded-lg"
              >
                {bulkMut.isPending ? 'Applying…' : 'Yes, Apply to All Selected'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
