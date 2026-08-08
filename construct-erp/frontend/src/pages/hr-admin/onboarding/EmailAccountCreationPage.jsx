// src/pages/hr-admin/onboarding/EmailAccountCreationPage.jsx
// Email & Account Creation — tracks the 'email_setup' and 'erp_login'
// onboarding checklist items (both manual toggles, auto_source is null for
// both per LIFECYCLE_ITEMS). Access Permissions is a separate item/page —
// intentionally not duplicated here.
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Mail, Search, ArrowLeft, ChevronDown, CheckCircle2, Circle } from 'lucide-react';
import { hrOnboardingAPI, hrEmployeesAPI, hrMastersAPI } from '../../../api/client';
import { B, fade, avatarGrad, initials, KpiCard } from '../../../components/hr/DashboardKit';

function fmtDate(d) { return d ? new Date(d).toLocaleDateString('en-IN') : '—'; }

function ToggleRow({ item, employeeId, label, onDone }) {
  const mut = useMutation({
    mutationFn: (status) => hrEmployeesAPI.updateLifecycle(employeeId, item.id, { status }),
    onSuccess: () => { toast.success('Updated'); onDone(); },
    onError: (e) => toast.error(e.response?.data?.error || 'Update failed'),
  });
  return (
    <div className="flex items-center gap-3 p-3 rounded-xl bg-gray-50">
      {item.status === 'done'
        ? <CheckCircle2 className="w-5 h-5 flex-shrink-0" style={{ color: B.success }} />
        : <Circle className="w-5 h-5 flex-shrink-0 text-gray-300" />}
      <span className="text-sm font-bold text-gray-700 flex-1">{label}</span>
      <button disabled={mut.isPending} onClick={() => mut.mutate(item.status === 'done' ? 'pending' : 'done')}
        className="text-xs font-bold px-3 py-1.5 rounded-lg disabled:opacity-50"
        style={item.status === 'done' ? { background: '#F1F5F9', color: '#64748B' } : { background: B.success, color: '#fff' }}>
        {item.status === 'done' ? 'Mark Pending' : 'Mark Done'}
      </button>
    </div>
  );
}

function EmployeePanel({ employee }) {
  const qc = useQueryClient();
  const { data: detail } = useQuery({
    queryKey: ['employee-detail', employee.id],
    queryFn: () => hrEmployeesAPI.get(employee.id).then(r => r.data.data),
  });
  const emailItem = detail?.lifecycle_checklist?.find(i => i.item_key === 'email_setup');
  const erpItem = detail?.lifecycle_checklist?.find(i => i.item_key === 'erp_login');
  const refetch = () => qc.invalidateQueries({ queryKey: ['employee-detail', employee.id] });

  return (
    <div className="px-4 py-4 space-y-2">
      {emailItem && <ToggleRow item={emailItem} employeeId={employee.id} label="Official Email Account Created" onDone={refetch} />}
      {erpItem && <ToggleRow item={erpItem} employeeId={employee.id} label="ERP Login Account Created" onDone={refetch} />}
      {!emailItem && !erpItem && <p className="text-xs text-gray-400">No checklist items found for this employee.</p>}
    </div>
  );
}

export default function EmailAccountCreationPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [openId, setOpenId] = useState(null);

  const { data, isLoading } = useQuery({
    queryKey: ['onboarding-employees-email', search, departmentId],
    queryFn: () => hrOnboardingAPI.employees({ search: search || undefined, department_id: departmentId || undefined, limit: 100 }).then(r => r.data.data),
  });
  const { data: summary } = useQuery({
    queryKey: ['onboarding-summary'],
    queryFn: () => hrOnboardingAPI.summary().then(r => r.data.data),
  });
  const { data: departments } = useQuery({
    queryKey: ['hr-departments'],
    queryFn: () => hrMastersAPI.listDepts().then(r => r.data?.data || []),
  });

  const employees = data || [];
  const it = summary?.kpis?.it || {};

  return (
    <div className="min-h-screen p-4 md:p-6" style={{ background: B.bg }}>
      <button onClick={() => navigate('/hr-admin/onboarding')} className="flex items-center gap-1.5 text-sm font-bold text-gray-500 hover:text-gray-700 mb-4">
        <ArrowLeft className="w-4 h-4" /> Back to Onboarding Dashboard
      </button>

      <motion.div {...fade(0)} className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: `${B.blue}18` }}>
          <Mail className="w-5 h-5" style={{ color: B.blue }} />
        </div>
        <div>
          <h1 className="text-xl font-black text-gray-900">Email &amp; Account Creation</h1>
          <p className="text-xs text-gray-400">Track email and ERP account setup for new hires</p>
        </div>
      </motion.div>

      <div className="grid grid-cols-2 gap-4 mb-6">
        <KpiCard label="Email Pending" value={it.email_pending} icon={Mail} color={B.warning} bg="#F59E0B18" delay={0.02} />
        <KpiCard label="ERP Login Pending" value={it.erp_login_pending} icon={Mail} color={B.warning} bg="#F59E0B18" delay={0.04} />
      </div>

      <motion.div {...fade(0.06)} className="bg-white rounded-2xl p-3 mb-4 border border-gray-100 flex flex-wrap items-center gap-3" style={{ boxShadow: '0 2px 12px rgba(10,31,92,0.06)' }}>
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
      </motion.div>

      <div className="space-y-3">
        {isLoading && <p className="text-sm text-gray-400 text-center py-10">Loading...</p>}
        {!isLoading && employees.length === 0 && <p className="text-sm text-gray-400 text-center py-10">No employees match this filter.</p>}
        {employees.map((emp, i) => {
          const [c1, c2] = avatarGrad(emp.name);
          const isOpen = openId === emp.id;
          return (
            <motion.div key={emp.id} {...fade(0.08 + i * 0.02)} className="bg-white rounded-2xl border border-gray-100 overflow-hidden" style={{ boxShadow: '0 2px 8px rgba(10,31,92,0.05)' }}>
              <button onClick={() => setOpenId(isOpen ? null : emp.id)} className="w-full p-4 flex items-center gap-4 text-left">
                <div className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0"
                  style={{ background: `linear-gradient(135deg, ${c1}, ${c2})` }}>
                  {initials(emp.name)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-gray-900 truncate">{emp.name}</p>
                  <p className="text-xs text-gray-400">{emp.employee_code} · {emp.department_name || 'No department'} · Joined {fmtDate(emp.date_of_joining)}</p>
                </div>
                <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform flex-shrink-0 ${isOpen ? 'rotate-180' : ''}`} />
              </button>
              <AnimatePresence>
                {isOpen && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.25 }} className="overflow-hidden border-t border-gray-50">
                    <EmployeePanel employee={emp} />
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
