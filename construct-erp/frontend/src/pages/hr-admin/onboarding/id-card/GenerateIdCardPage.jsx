// src/pages/hr-admin/onboarding/id-card/GenerateIdCardPage.jsx
// Generate ID Card — single employee (inline) or bulk (department/project/
// new joiners). "Multiple Employees" hands off to Employee Selection, which
// has the full filterable picker + bulk-generate action already.
import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { UserPlus, ArrowLeft, Search, Users2, Sparkles } from 'lucide-react';
import { hrIdCardAPI, hrEmployeesAPI, hrMastersAPI } from '../../../../api/client';
import { B, fade, avatarGrad, initials } from '../../../../components/hr/DashboardKit';

const TARGETS = [
  { key: 'single', label: 'Single Employee' },
  { key: 'multiple', label: 'Multiple Employees' },
  { key: 'department', label: 'Entire Department' },
  { key: 'project', label: 'Entire Project' },
  { key: 'new_joiners', label: 'New Joiners' },
];

export default function GenerateIdCardPage() {
  const navigate = useNavigate();
  const [target, setTarget] = useState('single');
  const [empSearch, setEmpSearch] = useState('');
  const [employee, setEmployee] = useState(null);
  const [departmentId, setDepartmentId] = useState('');
  const [days, setDays] = useState(30);
  const [templateId, setTemplateId] = useState('');

  const { data: templates } = useQuery({ queryKey: ['idcard-templates'], queryFn: () => hrIdCardAPI.templates().then(r => r.data.data) });
  const { data: departments } = useQuery({ queryKey: ['hr-departments'], queryFn: () => hrMastersAPI.listDepts().then(r => r.data?.data || []) });
  const { data: empResults } = useQuery({
    queryKey: ['emp-search', empSearch],
    queryFn: () => hrEmployeesAPI.list({ search: empSearch }).then(r => r.data.data),
    enabled: target === 'single' && empSearch.length >= 2 && !employee,
  });

  const genMut = useMutation({
    mutationFn: () => hrIdCardAPI.generate({ employee_id: employee.id, template_id: templateId || undefined }),
    onSuccess: () => { toast.success('ID card generated'); navigate('/hr-admin/onboarding/id-card/print-queue'); },
    onError: (e) => toast.error(e.response?.data?.error || 'Failed to generate'),
  });
  const bulkMut = useMutation({
    mutationFn: () => hrIdCardAPI.bulkGenerate({
      department_id: target === 'department' ? departmentId : undefined,
      new_joiners_days: target === 'new_joiners' ? days : undefined,
      template_id: templateId || undefined,
    }),
    onSuccess: (r) => { toast.success(`Generated ${r.data.data.generated} card(s), ${r.data.data.failed} failed`); navigate('/hr-admin/onboarding/id-card/print-queue'); },
    onError: (e) => toast.error(e.response?.data?.error || 'Failed to generate'),
  });

  return (
    <div className="min-h-screen p-4 md:p-6" style={{ background: B.bg }}>
      <button onClick={() => navigate('/hr-admin/onboarding/id-card')} className="flex items-center gap-1.5 text-sm font-bold text-gray-500 hover:text-gray-700 mb-4">
        <ArrowLeft className="w-4 h-4" /> Back to ID Card Dashboard
      </button>
      <motion.div {...fade(0)} className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: `${B.blue}18` }}><UserPlus className="w-5 h-5" style={{ color: B.blue }} /></div>
        <div><h1 className="text-xl font-black text-gray-900">Generate ID Card</h1><p className="text-xs text-gray-400">Employee number, card number and QR code are auto-generated</p></div>
      </motion.div>

      <motion.div {...fade(0.05)} className="bg-white rounded-2xl p-5 border border-gray-100 space-y-4" style={{ boxShadow: '0 2px 12px rgba(10,31,92,0.06)' }}>
        <div className="flex flex-wrap gap-2">
          {TARGETS.map(t => (
            <button key={t.key} onClick={() => { setTarget(t.key); setEmployee(null); }}
              className="text-xs font-bold px-3 py-2 rounded-lg border"
              style={target === t.key ? { background: B.blue, color: '#fff', borderColor: B.blue } : { background: '#fff', color: '#64748B', borderColor: '#E2E8F0' }}>
              {t.label}
            </button>
          ))}
        </div>

        {templates?.length > 0 && (
          <select value={templateId} onChange={e => setTemplateId(e.target.value)} className="w-full max-w-xs text-sm px-3 py-2 rounded-lg border border-gray-200 focus:outline-none">
            <option value="">Default Template</option>
            {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        )}

        {target === 'single' && (
          !employee ? (
            <div>
              <div className="relative max-w-md">
                <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input value={empSearch} onChange={e => setEmpSearch(e.target.value)} placeholder="Search employee by name or code..."
                  className="w-full text-sm pl-9 pr-3 py-2.5 rounded-lg border border-gray-200 focus:outline-none focus:border-blue-300" />
              </div>
              <div className="space-y-1.5 max-w-md mt-2">
                {(empResults || []).map(emp => {
                  const [c1, c2] = avatarGrad(emp.name);
                  return (
                    <button key={emp.id} onClick={() => setEmployee(emp)} className="w-full flex items-center gap-3 p-2.5 rounded-lg hover:bg-gray-50 text-left">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0" style={{ background: `linear-gradient(135deg, ${c1}, ${c2})` }}>{initials(emp.name)}</div>
                      <div className="min-w-0"><p className="text-sm font-bold text-gray-800 truncate">{emp.name}</p><p className="text-xs text-gray-400">{emp.employee_code}</p></div>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 max-w-md">
              <div className="flex-1"><p className="text-sm font-bold text-gray-800">{employee.name}</p><p className="text-xs text-gray-400">{employee.employee_code}</p></div>
              <button onClick={() => setEmployee(null)} className="text-xs font-bold px-3 py-1.5 rounded-lg bg-gray-100 text-gray-500">Change</button>
              <button disabled={genMut.isPending} onClick={() => genMut.mutate()} className="text-xs font-bold px-4 py-2 rounded-lg text-white disabled:opacity-50 flex items-center gap-1.5" style={{ background: B.blue }}>
                <Sparkles className="w-3.5 h-3.5" /> Generate
              </button>
            </div>
          )
        )}

        {target === 'multiple' && (
          <button onClick={() => navigate('/hr-admin/onboarding/id-card/employees')} className="text-sm font-bold px-4 py-2.5 rounded-xl text-white flex items-center gap-2" style={{ background: `linear-gradient(135deg,${B.blue},${B.navy})` }}>
            <Users2 className="w-4 h-4" /> Go to Employee Selection
          </button>
        )}

        {target === 'department' && (
          <div className="flex flex-wrap items-center gap-3">
            <select value={departmentId} onChange={e => setDepartmentId(e.target.value)} className="text-sm px-3 py-2 rounded-lg border border-gray-200 focus:outline-none">
              <option value="">Select Department</option>
              {(departments || []).map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
            <button disabled={!departmentId || bulkMut.isPending} onClick={() => bulkMut.mutate()} className="text-xs font-bold px-4 py-2 rounded-lg text-white disabled:opacity-50" style={{ background: B.blue }}>Generate for Department</button>
          </div>
        )}

        {target === 'project' && <p className="text-xs text-gray-400">Use Employee Selection and filter by Project, then generate for the selected group.</p>}

        {target === 'new_joiners' && (
          <div className="flex flex-wrap items-center gap-3">
            <label className="text-sm text-gray-600">Joined in the last</label>
            <input type="number" value={days} onChange={e => setDays(e.target.value)} className="w-20 text-sm px-3 py-2 rounded-lg border border-gray-200 focus:outline-none" />
            <span className="text-sm text-gray-600">days</span>
            <button disabled={bulkMut.isPending} onClick={() => bulkMut.mutate()} className="text-xs font-bold px-4 py-2 rounded-lg text-white disabled:opacity-50" style={{ background: B.blue }}>Generate for New Joiners</button>
          </div>
        )}
      </motion.div>
    </div>
  );
}
