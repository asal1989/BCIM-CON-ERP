// src/pages/hr-admin/onboarding/WelcomeChecklistPage.jsx
// Welcome Checklist — first-week setup tasks auto-generated for every new
// hire from employee_lifecycle_checklist (shared with the full Onboarding
// Tracker). Real data only: each item's "Auto" badge means it was ticked
// from a live source (profile/documents/bank/etc.), not fabricated.
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  ClipboardCheck, Search, ChevronDown, CheckCircle2, Circle,
  Users, Clock, AlertCircle, ArrowRight,
} from 'lucide-react';
import { hrOnboardingAPI, hrEmployeesAPI, hrMastersAPI } from '../../../api/client';
import { B, fade, avatarGrad, initials, KpiCard } from '../../../components/hr/DashboardKit';

const STATUS_META = {
  completed:   { label: 'Completed',   color: B.success, bg: 'bg-emerald-50', text: 'text-emerald-700' },
  in_progress: { label: 'In Progress', color: B.warning, bg: 'bg-amber-50',   text: 'text-amber-700' },
  pending:     { label: 'Pending',     color: '#94A3B8',  bg: 'bg-gray-100',  text: 'text-gray-500' },
};

function fmtDate(d) { return d ? new Date(d).toLocaleDateString('en-IN') : '—'; }

function ChecklistRow({ item, employeeId, onSaved }) {
  const mut = useMutation({
    mutationFn: (nextStatus) => hrEmployeesAPI.updateLifecycle(employeeId, item.id, {
      status: nextStatus, remarks: item.remarks, due_date: item.due_date,
    }),
    onSuccess: () => onSaved(),
    onError: (e) => toast.error(e.response?.data?.error || 'Update failed'),
  });

  const done = item.status === 'done';

  return (
    <button
      type="button"
      disabled={!item.id || mut.isPending}
      onClick={() => mut.mutate(done ? 'pending' : 'done')}
      className="w-full flex items-center gap-3 py-2.5 px-1 text-left hover:bg-gray-50 rounded-lg transition-colors disabled:opacity-50"
    >
      {done
        ? <CheckCircle2 className="w-5 h-5 flex-shrink-0" style={{ color: B.success }} />
        : <Circle className="w-5 h-5 flex-shrink-0 text-gray-300" />}
      <span className={`flex-1 text-sm font-semibold ${done ? 'text-gray-400 line-through' : 'text-gray-800'}`}>
        {item.label}
      </span>
      {item.auto_source && (
        <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-50 font-bold" style={{ color: B.blue }}>Auto</span>
      )}
      {done && item.completed_at && (
        <span className="text-[11px] text-gray-400 whitespace-nowrap">{fmtDate(item.completed_at)}</span>
      )}
    </button>
  );
}

function EmployeeCard({ emp, delay, isOpen, onToggle, onSaved }) {
  const [c1, c2] = avatarGrad(emp.name);
  const meta = STATUS_META[emp.overall_status] || STATUS_META.pending;
  const pct = emp.total_items ? Math.round((emp.done_items / emp.total_items) * 100) : 0;

  return (
    <motion.div {...fade(delay)} className="bg-white rounded-2xl border border-gray-100 overflow-hidden" style={{ boxShadow: '0 2px 12px rgba(10,31,92,0.06)' }}>
      <button onClick={onToggle} className="w-full p-4 flex items-center gap-4 text-left">
        <div className="w-11 h-11 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0"
          style={{ background: `linear-gradient(135deg, ${c1}, ${c2})` }}>
          {initials(emp.name)}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-gray-900 truncate">{emp.name}</p>
          <p className="text-xs text-gray-400">{emp.employee_code} · {emp.department_name || 'No department'} · Joined {fmtDate(emp.date_of_joining)}</p>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${meta.bg} ${meta.text}`}>{meta.label}</span>
          <span className="text-xs font-bold text-gray-400 hidden sm:inline">{emp.done_items}/{emp.total_items}</span>
          <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </div>
      </button>
      <div className="px-4">
        <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden mb-2">
          <div className="h-full rounded-full" style={{ width: `${pct}%`, background: meta.color }} />
        </div>
      </div>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }} className="overflow-hidden border-t border-gray-50"
          >
            <div className="px-4 py-2">
              {emp.checklist.map(item => (
                <ChecklistRow key={item.item_key} item={item} employeeId={emp.id} onSaved={onSaved} />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export default function WelcomeChecklistPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [openId, setOpenId] = useState(null);

  const { data, isLoading } = useQuery({
    queryKey: ['welcome-checklist', search, departmentId, statusFilter],
    queryFn: () => hrOnboardingAPI.welcomeChecklist({
      search: search || undefined,
      department_id: departmentId || undefined,
      status: statusFilter || undefined,
    }).then(r => r.data.data),
  });
  const { data: departments } = useQuery({
    queryKey: ['hr-departments'],
    queryFn: () => hrMastersAPI.listDepts().then(r => r.data),
  });

  const employees = data || [];
  const total = employees.length;
  const completed = employees.filter(e => e.overall_status === 'completed').length;
  const inProgress = employees.filter(e => e.overall_status === 'in_progress').length;
  const pending = employees.filter(e => e.overall_status === 'pending').length;

  const refetch = () => qc.invalidateQueries({ queryKey: ['welcome-checklist'] });

  return (
    <div className="min-h-screen p-4 md:p-6" style={{ background: B.bg }}>
      <motion.div {...fade(0)} className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: `${B.blue}18` }}>
            <ClipboardCheck className="w-5 h-5" style={{ color: B.blue }} />
          </div>
          <div>
            <h1 className="text-xl font-black text-gray-900">Welcome Checklist</h1>
            <p className="text-xs text-gray-400">First-week setup tasks, auto-generated for every new hire</p>
          </div>
        </div>
        <button onClick={() => navigate('/hr-admin/onboarding')}
          className="text-xs font-bold flex items-center gap-1 px-3 py-2 rounded-lg hover:bg-gray-50" style={{ color: B.blue }}>
          Onboarding Dashboard <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </motion.div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <KpiCard label="New Hires" value={total} icon={Users} color={B.blue} bg={`${B.blue}18`} delay={0.02} />
        <KpiCard label="Completed" value={completed} icon={CheckCircle2} color={B.success} bg="#10B98118" delay={0.04}
          onClick={() => setStatusFilter(statusFilter === 'completed' ? '' : 'completed')} />
        <KpiCard label="In Progress" value={inProgress} icon={Clock} color={B.warning} bg="#F59E0B18" delay={0.06}
          onClick={() => setStatusFilter(statusFilter === 'in_progress' ? '' : 'in_progress')} />
        <KpiCard label="Pending" value={pending} icon={AlertCircle} color="#94A3B8" bg="#94A3B818" delay={0.08}
          onClick={() => setStatusFilter(statusFilter === 'pending' ? '' : 'pending')} />
      </div>

      <motion.div {...fade(0.1)} className="bg-white rounded-2xl p-3 mb-4 border border-gray-100 flex flex-wrap items-center gap-3" style={{ boxShadow: '0 2px 12px rgba(10,31,92,0.06)' }}>
        <div className="flex-1 min-w-[200px] relative">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name or employee code..."
            className="w-full text-sm pl-9 pr-3 py-2 rounded-lg border border-gray-200 focus:outline-none focus:border-blue-300" />
        </div>
        <select value={departmentId} onChange={e => setDepartmentId(e.target.value)}
          className="text-sm px-3 py-2 rounded-lg border border-gray-200 focus:outline-none">
          <option value="">All Departments</option>
          {(departments || []).map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        {statusFilter && (
          <button onClick={() => setStatusFilter('')} className="text-xs font-bold px-3 py-2 rounded-lg bg-gray-100 text-gray-500">
            Clear status filter
          </button>
        )}
      </motion.div>

      <div className="space-y-3">
        {isLoading && <p className="text-sm text-gray-400 text-center py-10">Loading checklist...</p>}
        {!isLoading && employees.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-10">No new hires match this filter.</p>
        )}
        {employees.map((emp, i) => (
          <EmployeeCard
            key={emp.id}
            emp={emp}
            delay={0.12 + i * 0.02}
            isOpen={openId === emp.id}
            onToggle={() => setOpenId(openId === emp.id ? null : emp.id)}
            onSaved={refetch}
          />
        ))}
      </div>
    </div>
  );
}
