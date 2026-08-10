// src/pages/hr-admin/onboarding/ChecklistTrackerPage.jsx
// Shared thin view over the employee_lifecycle_checklist table (the same
// data that drives the Welcome Checklist stepper and Onboarding Dashboard
// task counts) — filtered to a specific stage_group/item_key set. Used by
// Orientation Schedule, Probation Tracking, Confirmation Process, and
// Compliance Forms: all of them are "which employees have this checklist
// item outstanding, let me set a date and mark it done" screens, so one
// component with different filters/copy covers all four rather than four
// near-duplicate pages.
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, CheckCircle2, Circle, Calendar } from 'lucide-react';
import toast from 'react-hot-toast';
import { hrOnboardingAPI, hrEmployeesAPI } from '../../../api/client';
import { B, fade, SectionHeader } from '../../../components/hr/DashboardKit';

export default function ChecklistTrackerPage({ title, description, icon: Icon, filterParams, backTo = '/hr-admin/onboarding' }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [showDone, setShowDone] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['ob-checklist', filterParams],
    queryFn: () => hrOnboardingAPI.checklist(filterParams).then(r => r.data),
  });
  const rows = data?.data || [];
  const visible = showDone ? rows : rows.filter(r => r.status !== 'done');
  const pendingCount = rows.filter(r => r.status !== 'done').length;

  const updateMut = useMutation({
    mutationFn: ({ userId, itemId, d }) => hrEmployeesAPI.updateLifecycle(userId, itemId, d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['ob-checklist'] }); },
    onError: (e) => toast.error(e.response?.data?.error || 'Failed to update'),
  });

  const markDone = (r) => {
    updateMut.mutate({ userId: r.user_id, itemId: r.id, d: { status: 'done' } });
    toast.success(`Marked "${r.title}" complete for ${r.name}`);
  };
  const setDueDate = (r, due_date) => {
    updateMut.mutate({ userId: r.user_id, itemId: r.id, d: { status: r.status, due_date } });
  };

  return (
    <div className="min-h-screen p-4 md:p-6" style={{ background: B.bg || '#F8FAFC' }}>
      <button onClick={() => navigate(backTo)} className="flex items-center gap-1.5 text-sm font-bold text-gray-500 hover:text-gray-700 mb-4">
        <ArrowLeft className="w-4 h-4" /> Back to Onboarding Dashboard
      </button>

      <motion.div {...fade(0)} className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-gray-900">{title}</h1>
          <p className="text-sm text-gray-500 mt-0.5">{description}</p>
        </div>
        <label className="flex items-center gap-2 text-xs font-bold text-gray-500">
          <input type="checkbox" checked={showDone} onChange={e => setShowDone(e.target.checked)} />
          Show completed
        </label>
      </motion.div>

      <motion.div {...fade(0.05)} className="bg-white rounded-2xl border border-gray-100 overflow-hidden" style={{ boxShadow: '0 2px 12px rgba(10,31,92,0.06)' }}>
        <div className="px-5 py-4 border-b border-gray-100">
          <SectionHeader title={title} sub={`${pendingCount} pending · ${rows.length} total`} icon={Icon || Calendar} iconColor={B.blue} />
        </div>
        <div className="overflow-x-auto">
          {isLoading ? (
            <p className="text-center text-gray-400 py-10 text-sm">Loading…</p>
          ) : visible.length === 0 ? (
            <p className="text-center text-gray-400 py-10 text-sm">{showDone ? 'No records found.' : 'Nothing pending — everyone is up to date.'}</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] font-bold text-gray-400 uppercase tracking-wide border-b border-gray-100 bg-gray-50">
                  <th className="py-2.5 px-4">Employee</th>
                  <th className="py-2.5 px-4">Department</th>
                  <th className="py-2.5 px-4">Task</th>
                  <th className="py-2.5 px-4">Owner</th>
                  <th className="py-2.5 px-4">Date</th>
                  <th className="py-2.5 px-4">Status</th>
                  <th className="py-2.5 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {visible.map(r => (
                  <tr key={r.id} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="py-2.5 px-4 font-semibold text-gray-800">{r.name} <span className="text-gray-400 font-normal">({r.employee_code || '—'})</span></td>
                    <td className="py-2.5 px-4 text-gray-600">{r.department_name || '—'}</td>
                    <td className="py-2.5 px-4 text-gray-700">{r.title}</td>
                    <td className="py-2.5 px-4 text-gray-500">{r.owner_department || '—'}</td>
                    <td className="py-2.5 px-4">
                      <input type="date" defaultValue={r.due_date ? r.due_date.slice(0, 10) : ''}
                        onBlur={e => e.target.value && setDueDate(r, e.target.value)}
                        className="border border-gray-200 rounded-lg text-xs px-2 py-1" disabled={r.status === 'done'} />
                    </td>
                    <td className="py-2.5 px-4">
                      {r.status === 'done'
                        ? <span className="inline-flex items-center gap-1 text-emerald-600 font-bold text-xs"><CheckCircle2 className="w-3.5 h-3.5" /> Done</span>
                        : <span className="inline-flex items-center gap-1 text-amber-600 font-bold text-xs"><Circle className="w-3.5 h-3.5" /> Pending</span>}
                    </td>
                    <td className="py-2.5 px-4 text-right">
                      {r.status !== 'done' && (
                        <button onClick={() => markDone(r)} disabled={updateMut.isPending}
                          className="text-xs font-bold px-3 py-1.5 rounded-lg text-white disabled:opacity-50" style={{ background: B.blue }}>
                          Mark Complete
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </motion.div>
    </div>
  );
}
