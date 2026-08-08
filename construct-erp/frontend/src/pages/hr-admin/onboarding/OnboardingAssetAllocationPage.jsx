// src/pages/hr-admin/onboarding/OnboardingAssetAllocationPage.jsx
// IT Asset Allocation — assign laptops/phones/access cards to new hires and
// track per-employee status. Reuses the existing Employee Assets feature
// (hrEmpAssetsAPI / hr_employee_assets) rather than a parallel asset system;
// assigning a laptop here auto-ticks the onboarding checklist's asset_issue
// item via existing backend logic (reconcileDerived), no extra write needed.
// Full return/edit/delete stays on the company-wide Employee Assets page.
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  Package, Search, ArrowLeft, ChevronDown, Laptop, Smartphone, Contact,
  PackagePlus, ArrowRight, CheckCircle2, Circle,
} from 'lucide-react';
import { hrOnboardingAPI, hrEmpAssetsAPI, hrMastersAPI } from '../../../api/client';
import { B, fade, avatarGrad, initials, KpiCard } from '../../../components/hr/DashboardKit';

const CATEGORIES = ['laptop', 'mobile', 'sim_card', 'vehicle', 'tools', 'uniform', 'safety_gear', 'access_card', 'other'];
const CONDITIONS = ['new', 'good', 'fair', 'poor'];
const CATEGORY_LABEL = { laptop: 'Laptop', mobile: 'Mobile', sim_card: 'SIM Card', vehicle: 'Vehicle', tools: 'Tools', uniform: 'Uniform', safety_gear: 'Safety Gear', access_card: 'Access Card', other: 'Other' };
const STATUS_META = {
  assigned: { label: 'Assigned', bg: 'bg-blue-50', text: 'text-blue-600' },
  returned: { label: 'Returned', bg: 'bg-emerald-50', text: 'text-emerald-600' },
  lost:     { label: 'Lost', bg: 'bg-red-50', text: 'text-red-500' },
  damaged:  { label: 'Damaged', bg: 'bg-amber-50', text: 'text-amber-600' },
};

function fmtDate(d) { return d ? new Date(d).toLocaleDateString('en-IN') : '—'; }

function AssignAssetModal({ employee, onClose, onAssigned }) {
  const [form, setForm] = useState({ asset_name: '', asset_code: '', category: 'laptop', serial_number: '', condition_at_issue: 'good', asset_value: '' });
  const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }));

  const mut = useMutation({
    mutationFn: () => hrEmpAssetsAPI.create({ employee_id: employee.id, ...form, asset_value: form.asset_value || 0 }),
    onSuccess: () => { toast.success('Asset assigned'); onAssigned(); onClose(); },
    onError: (e) => toast.error(e.response?.data?.error || 'Failed to assign asset'),
  });

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl max-w-md w-full p-6" onClick={e => e.stopPropagation()}>
        <h3 className="font-black text-gray-900 mb-1">Assign Asset</h3>
        <p className="text-xs text-gray-400 mb-4">{employee.name} · {employee.employee_code}</p>

        <div className="space-y-3">
          <select value={form.category} onChange={e => set('category', e.target.value)}
            className="w-full text-sm px-3 py-2 rounded-lg border border-gray-200 focus:outline-none">
            {CATEGORIES.map(c => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
          </select>
          <input placeholder="Asset name (e.g. Dell Latitude 5420)" value={form.asset_name}
            onChange={e => set('asset_name', e.target.value)}
            className="w-full text-sm px-3 py-2 rounded-lg border border-gray-200 focus:outline-none" />
          <div className="flex gap-2">
            <input placeholder="Asset code" value={form.asset_code} onChange={e => set('asset_code', e.target.value)}
              className="flex-1 text-sm px-3 py-2 rounded-lg border border-gray-200 focus:outline-none" />
            <input placeholder="Serial number" value={form.serial_number} onChange={e => set('serial_number', e.target.value)}
              className="flex-1 text-sm px-3 py-2 rounded-lg border border-gray-200 focus:outline-none" />
          </div>
          <div className="flex gap-2">
            <select value={form.condition_at_issue} onChange={e => set('condition_at_issue', e.target.value)}
              className="flex-1 text-sm px-3 py-2 rounded-lg border border-gray-200 focus:outline-none">
              {CONDITIONS.map(c => <option key={c} value={c}>{c[0].toUpperCase() + c.slice(1)}</option>)}
            </select>
            <input type="number" placeholder="Value (₹)" value={form.asset_value} onChange={e => set('asset_value', e.target.value)}
              className="flex-1 text-sm px-3 py-2 rounded-lg border border-gray-200 focus:outline-none" />
          </div>
        </div>

        <div className="flex gap-2 mt-4">
          <button disabled={!form.asset_name || mut.isPending} onClick={() => mut.mutate()}
            className="flex-1 text-sm font-bold py-2.5 rounded-xl text-white disabled:opacity-50"
            style={{ background: `linear-gradient(135deg,${B.blue},${B.navy})` }}>
            Assign
          </button>
          <button onClick={onClose} className="px-4 py-2.5 rounded-xl text-sm font-bold bg-gray-100 text-gray-500">Cancel</button>
        </div>
      </div>
    </div>
  );
}

function EmployeePanel({ employee }) {
  const [assigning, setAssigning] = useState(false);
  const { data: assets, refetch, isLoading } = useQuery({
    queryKey: ['emp-assets', employee.id],
    queryFn: () => hrEmpAssetsAPI.byEmp(employee.id).then(r => r.data.data),
  });

  const hasLaptop = (assets || []).some(a => a.category === 'laptop' && a.status === 'assigned');

  return (
    <div className="px-4 py-4 space-y-4">
      <div className="flex items-center gap-3 p-3 rounded-xl bg-gray-50">
        {hasLaptop
          ? <CheckCircle2 className="w-5 h-5 flex-shrink-0" style={{ color: B.success }} />
          : <Circle className="w-5 h-5 flex-shrink-0 text-gray-300" />}
        <span className="text-sm font-bold text-gray-700 flex-1">Laptop Issued (auto-ticks onboarding checklist)</span>
      </div>

      <button onClick={() => setAssigning(true)}
        className="w-full text-xs font-bold px-3 py-2.5 rounded-xl border border-gray-200 flex items-center justify-center gap-1.5 hover:bg-gray-50">
        <PackagePlus className="w-3.5 h-3.5" style={{ color: B.blue }} /> Assign Asset
      </button>

      <div>
        <p className="text-[11px] font-black text-gray-500 uppercase tracking-wide mb-2">Assigned Assets</p>
        {isLoading && <p className="text-xs text-gray-400">Loading...</p>}
        {!isLoading && (assets || []).length === 0 && <p className="text-xs text-gray-400">No assets assigned yet.</p>}
        <div className="space-y-1.5">
          {(assets || []).map(a => {
            const meta = STATUS_META[a.status] || STATUS_META.assigned;
            return (
              <div key={a.id} className="flex items-center gap-2.5 p-2 rounded-lg bg-gray-50">
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 flex-shrink-0">{CATEGORY_LABEL[a.category] || a.category}</span>
                <span className="text-sm font-semibold text-gray-700 flex-1 truncate">{a.asset_name}</span>
                <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${meta.bg} ${meta.text}`}>{meta.label}</span>
                <span className="text-[11px] text-gray-400 flex-shrink-0">{fmtDate(a.assigned_on)}</span>
              </div>
            );
          })}
        </div>
      </div>

      {assigning && <AssignAssetModal employee={employee} onClose={() => setAssigning(false)} onAssigned={refetch} />}
    </div>
  );
}

export default function OnboardingAssetAllocationPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [openId, setOpenId] = useState(null);

  const { data, isLoading } = useQuery({
    queryKey: ['onboarding-employees-assets', search, departmentId],
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

      <motion.div {...fade(0)} className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: `${B.blue}18` }}>
            <Package className="w-5 h-5" style={{ color: B.blue }} />
          </div>
          <div>
            <h1 className="text-xl font-black text-gray-900">IT Asset Allocation</h1>
            <p className="text-xs text-gray-400">Assign laptops, phones and other assets to new hires</p>
          </div>
        </div>
        <button onClick={() => navigate('/hr-admin/emp-assets')}
          className="text-xs font-bold flex items-center gap-1 px-3 py-2 rounded-lg hover:bg-gray-50" style={{ color: B.blue }}>
          Manage All Assets (returns/edits) <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </motion.div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <KpiCard label="Laptop Assigned" value={it.laptop_assigned} icon={Laptop} color={B.success} bg="#10B98118" delay={0.02} />
        <KpiCard label="Laptop Pending" value={it.laptop_pending} icon={Laptop} color={B.warning} bg="#F59E0B18" delay={0.04} />
        <KpiCard label="Mobile Assigned" value={it.mobile_assigned} icon={Smartphone} color={B.blue} bg={`${B.blue}18`} delay={0.06} />
        <KpiCard label="Access Card Assigned" value={it.access_card_assigned} icon={Contact} color={B.navy} bg={`${B.navy}18`} delay={0.08} />
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
      </motion.div>

      <div className="space-y-3">
        {isLoading && <p className="text-sm text-gray-400 text-center py-10">Loading...</p>}
        {!isLoading && employees.length === 0 && <p className="text-sm text-gray-400 text-center py-10">No employees match this filter.</p>}
        {employees.map((emp, i) => {
          const [c1, c2] = avatarGrad(emp.name);
          const isOpen = openId === emp.id;
          return (
            <motion.div key={emp.id} {...fade(0.12 + i * 0.02)} className="bg-white rounded-2xl border border-gray-100 overflow-hidden" style={{ boxShadow: '0 2px 8px rgba(10,31,92,0.05)' }}>
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
