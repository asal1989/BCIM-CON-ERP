import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Clock, Save, ChevronLeft, ChevronRight, Users, Wallet, CheckCircle, XCircle, MinusCircle, Umbrella } from 'lucide-react';
import dayjs from 'dayjs';
import { attendanceAPI, workerAPI, projectAPI } from '../../api/client';
import toast from 'react-hot-toast';
import DataToolbar from '../../components/common/DataToolbar';

const STATUS = {
  present:  { label: 'P', full: 'Present',  bg: 'bg-emerald-100', text: 'text-emerald-700', activeBg: 'bg-emerald-600', activeText: 'text-white', dot: 'bg-emerald-500' },
  absent:   { label: 'A', full: 'Absent',   bg: 'bg-red-100',     text: 'text-red-700',     activeBg: 'bg-red-600',     activeText: 'text-white', dot: 'bg-red-500' },
  half_day: { label: 'H', full: 'Half Day', bg: 'bg-amber-100',   text: 'text-amber-700',   activeBg: 'bg-amber-500',   activeText: 'text-white', dot: 'bg-amber-500' },
  leave:    { label: 'L', full: 'Leave',    bg: 'bg-blue-100',    text: 'text-blue-700',    activeBg: 'bg-blue-600',    activeText: 'text-white', dot: 'bg-blue-500' },
};

const STATUS_ICONS = { present: CheckCircle, absent: XCircle, half_day: MinusCircle, leave: Umbrella };

export default function AttendancePage() {
  const [projectId, setProjectId] = useState('');
  const [date, setDate] = useState(dayjs().format('YYYY-MM-DD'));
  const [records, setRecords] = useState({});
  const qc = useQueryClient();

  const { data: projects } = useQuery({
    queryKey: ['projects'],
    queryFn: () => projectAPI.list().then(r => r.data?.data).catch(() => null),
  });

  const { data: workers } = useQuery({
    queryKey: ['workers', projectId],
    queryFn: () => projectId ? workerAPI.list({ project_id: projectId }).then(r => r.data?.data).catch(() => null) : Promise.resolve(null),
    enabled: !!projectId,
  });

  useQuery({
    queryKey: ['attendance', projectId, date],
    queryFn: () => attendanceAPI.list({ project_id: projectId, date }).then(r => r.data?.data).catch(() => null),
    enabled: !!projectId,
    onSuccess: data => {
      if (data?.length) {
        const map = {};
        data.forEach(r => { map[r.worker_id] = { status: r.status, ot_hours: r.ot_hours || 0 }; });
        setRecords(map);
      }
    },
  });

  const markMutation = useMutation({
    mutationFn: d => attendanceAPI.bulkMark(d),
    onSuccess: r => {
      toast.success(`Attendance saved for ${r.data.data?.length || 0} workers`);
      qc.invalidateQueries({ queryKey: ['attendance'] });
    },
    onError: e => toast.error(e?.response?.data?.error || 'Failed to save attendance'),
  });

  const allWorkers = workers ?? [];
  const setStatus  = (id, status) => setRecords(p => ({ ...p, [id]: { ...(p[id] || { ot_hours: 0 }), status } }));
  const setOT      = (id, ot) => setRecords(p => ({ ...p, [id]: { ...(p[id] || { status: 'present' }), ot_hours: parseFloat(ot) || 0 } }));
  const markAll    = status => {
    const m = {};
    allWorkers.forEach(w => { m[w.id] = { status, ot_hours: 0 }; });
    setRecords(m);
  };

  const stats = Object.fromEntries(Object.keys(STATUS).map(k => [k, allWorkers.filter(w => records[w.id]?.status === k).length]));
  const wageEst = allWorkers.reduce((s, w) => {
    const st = records[w.id]?.status;
    return s + w.daily_rate * (st === 'present' ? 1 : st === 'half_day' ? 0.5 : 0);
  }, 0);
  const marked = allWorkers.filter(w => records[w.id]?.status).length;

  return (
    <div className="p-6 space-y-6 bg-slate-50 min-h-screen">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-teal-600 flex items-center justify-center text-white shadow-lg shadow-teal-600/25">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Worker Attendance</h1>
            <p className="text-xs text-slate-500">Daily attendance · Overtime · Wage tracking</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <DataToolbar data={allWorkers.map(w => ({ ...w, ...records[w.id] }))} fileName={`Attendance_${date}`} hideAdd />
          <button
            onClick={() => {
              if (!projectId) return toast.error('Select a project first');
              const recs = allWorkers.map(w => ({
                worker_id: w.id,
                status: records[w.id]?.status || 'absent',
                ot_hours: records[w.id]?.ot_hours || 0,
              }));
              markMutation.mutate({ project_id: projectId, date, records: recs });
            }}
            disabled={markMutation.isPending || !projectId}
            className="flex items-center gap-2 px-5 py-2.5 bg-teal-600 hover:bg-teal-700 disabled:opacity-40 text-white text-sm font-semibold rounded-lg shadow-sm transition-all"
          >
            <Save className="w-4 h-4" />
            {markMutation.isPending ? 'Saving...' : 'Save Attendance'}
          </button>
        </div>
      </div>

      {/* Controls */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col lg:flex-row gap-5 items-start lg:items-end shadow-sm">
        {/* Project */}
        <div className="w-full lg:w-80 space-y-1.5">
          <label className="block text-xs font-semibold text-slate-600">Project</label>
          <select
            className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700 outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-400 transition-all"
            value={projectId}
            onChange={e => setProjectId(e.target.value)}
          >
            <option value="">Select project...</option>
            {(projects || []).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>

        {/* Date */}
        <div className="space-y-1.5">
          <label className="block text-xs font-semibold text-slate-600">Date</label>
          <div className="flex items-center gap-2">
            <button onClick={() => setDate(dayjs(date).subtract(1, 'day').format('YYYY-MM-DD'))} className="w-9 h-9 flex items-center justify-center border border-slate-200 rounded-lg text-slate-500 hover:text-teal-600 hover:border-teal-300 transition-all">
              <ChevronLeft size={16} />
            </button>
            <input type="date" className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700 font-mono outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-400 transition-all" value={date} onChange={e => setDate(e.target.value)} />
            <button onClick={() => setDate(dayjs(date).add(1, 'day').format('YYYY-MM-DD'))} className="w-9 h-9 flex items-center justify-center border border-slate-200 rounded-lg text-slate-500 hover:text-teal-600 hover:border-teal-300 transition-all">
              <ChevronRight size={16} />
            </button>
          </div>
        </div>

        {/* Mark All */}
        <div className="space-y-1.5 flex-1">
          <label className="block text-xs font-semibold text-slate-600">Mark All</label>
          <div className="flex gap-2">
            {Object.entries(STATUS).map(([k, v]) => (
              <button
                key={k}
                onClick={() => markAll(k)}
                className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all border ${v.bg} ${v.text} border-transparent hover:opacity-80`}
              >
                All {v.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {Object.entries(STATUS).map(([k, v]) => {
          const Icon = STATUS_ICONS[k];
          return (
            <div key={k} className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-1">
                <span className={`w-2 h-2 rounded-full ${v.dot}`} />
                <span className="text-xs text-slate-500 font-medium">{v.full}</span>
              </div>
              <div className={`text-2xl font-bold ${v.text}`}>{stats[k] || 0}</div>
            </div>
          );
        })}
        <div className="bg-teal-50 border border-teal-200 rounded-xl p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-1">
            <Wallet className="w-3.5 h-3.5 text-teal-600" />
            <span className="text-xs text-teal-700 font-medium">Est. Wages</span>
          </div>
          <div className="text-lg font-bold text-teal-700">₹{wageEst.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</div>
        </div>
      </div>

      {/* Attendance Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
        <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between">
          <span className="text-sm font-semibold text-slate-700">Attendance Sheet</span>
          <span className="text-xs text-slate-400">{marked} / {allWorkers.length} marked</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[700px]">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Worker</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Trade</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">OT Hours</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Daily Wage</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {allWorkers.map(w => {
                const rec  = records[w.id];
                const st   = rec?.status;
                const v    = STATUS[st];
                const wage = w.daily_rate * (st === 'present' ? 1 : st === 'half_day' ? 0.5 : 0);

                return (
                  <tr key={w.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-semibold text-sm ${
                          v ? `${v.bg} ${v.text}` : 'bg-slate-100 text-slate-500'
                        }`}>
                          {w.name.charAt(0)}
                        </div>
                        <div>
                          <div className="font-medium text-slate-800">{w.name}</div>
                          <div className="text-xs text-slate-400">{w.gang_name || 'No gang'}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500 capitalize">{w.skill_type?.replace('_', ' ')}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        {Object.entries(STATUS).map(([k, val]) => (
                          <button
                            key={k}
                            onClick={() => setStatus(w.id, k)}
                            className={`w-8 h-8 flex items-center justify-center rounded-lg text-xs font-bold transition-all border ${
                              st === k
                                ? `${val.activeBg} ${val.activeText} border-transparent shadow-sm`
                                : 'bg-white text-slate-400 border-slate-200 hover:border-slate-300 hover:text-slate-600'
                            }`}
                          >
                            {val.label}
                          </button>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="relative w-24">
                        <input
                          type="number"
                          min={0}
                          max={12}
                          step={0.5}
                          className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-center font-mono text-slate-700 outline-none focus:border-teal-400 disabled:opacity-30 transition-all"
                          value={rec?.ot_hours || ''}
                          onChange={e => setOT(w.id, e.target.value)}
                          disabled={st === 'absent' || st === 'leave'}
                        />
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={`text-sm font-semibold ${wage > 0 ? 'text-teal-700' : 'text-slate-300'}`}>
                        {wage > 0 ? `₹${wage.toLocaleString('en-IN', { maximumFractionDigits: 0 })}` : '—'}
                      </span>
                    </td>
                  </tr>
                );
              })}
              {allWorkers.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-16 text-center text-sm text-slate-400">
                    {projectId ? 'No workers assigned to this project' : 'Select a project to load workers'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
