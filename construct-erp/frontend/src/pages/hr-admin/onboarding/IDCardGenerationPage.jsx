// src/pages/hr-admin/onboarding/IDCardGenerationPage.jsx
// ID Card Generation — printable employee ID card (standard 85.6mm x 54mm
// PVC card layout) + the onboarding checklist's manual 'id_card' toggle.
// No existing "ID card" feature elsewhere to reuse — built fresh here,
// but reuses company branding (companySettingsAPI) and the employee
// profile photo already on file rather than asking HR to re-upload anything.
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  IdCard, Search, ArrowLeft, ChevronDown, CheckCircle2, Circle, Printer, X,
} from 'lucide-react';
import { hrOnboardingAPI, hrEmployeesAPI, companySettingsAPI, hrMastersAPI } from '../../../api/client';
import { B, fade, avatarGrad, initials } from '../../../components/hr/DashboardKit';

function fmtDate(d) { return d ? new Date(d).toLocaleDateString('en-IN') : '—'; }

function IDCardPreview({ employee, company, onClose }) {
  const [c1, c2] = avatarGrad(employee.name);

  const cardHtml = (photoUrl) => `
    <div style="width:85.6mm;height:54mm;border-radius:3mm;overflow:hidden;font-family:Arial,sans-serif;
      box-shadow:0 2px 8px rgba(0,0,0,0.15);position:relative;background:#fff;border:1px solid #E2E8F0;">
      <div style="background:linear-gradient(135deg,${B.navy},${B.blue});height:16mm;display:flex;align-items:center;padding:0 4mm;color:#fff;">
        ${company?.logo_url ? `<img src="${company.logo_url}" style="height:9mm;margin-right:2mm;" />` : ''}
        <div style="font-size:9pt;font-weight:800;line-height:1.1;">${company?.name || 'Company'}</div>
      </div>
      <div style="display:flex;padding:3mm 4mm;gap:3mm;align-items:flex-start;">
        <div style="width:18mm;height:20mm;border-radius:2mm;overflow:hidden;flex-shrink:0;background:linear-gradient(135deg,${c1},${c2});display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;font-size:14pt;">
          ${photoUrl ? `<img src="${photoUrl}" style="width:100%;height:100%;object-fit:cover;" />` : initials(employee.name)}
        </div>
        <div style="flex:1;min-width:0;">
          <div style="font-size:10pt;font-weight:800;color:#0F172A;line-height:1.2;">${employee.name}</div>
          <div style="font-size:7.5pt;color:#64748B;margin-top:0.5mm;">${employee.designation_name || employee.designation || ''}</div>
          <div style="font-size:7.5pt;color:#64748B;">${employee.department_name || employee.department || ''}</div>
          <div style="font-size:8pt;font-weight:700;color:${B.blue};margin-top:1.5mm;">ID: ${employee.employee_code}</div>
          ${employee.date_of_joining ? `<div style="font-size:6.5pt;color:#94A3B8;margin-top:0.5mm;">Joined: ${fmtDate(employee.date_of_joining)}</div>` : ''}
        </div>
      </div>
    </div>`;

  const handlePrint = () => {
    const win = window.open('', '_blank');
    win.document.write(`<html><head><title>ID Card - ${employee.name}</title><style>
      @page { size: 90mm 60mm; margin: 0; }
      body { margin: 0; padding: 3mm; display:flex; justify-content:center; }
    </style></head><body>${cardHtml(employee.profile_photo_url)}</body></html>`);
    win.document.close();
    setTimeout(() => win.print(), 300);
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl max-w-md w-full p-6" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-black text-gray-900 text-sm">ID Card Preview</h3>
          <button onClick={onClose}><X className="w-5 h-5 text-gray-400" /></button>
        </div>
        <div className="flex justify-center mb-4" dangerouslySetInnerHTML={{ __html: cardHtml(employee.profile_photo_url) }} />
        <button onClick={handlePrint}
          className="w-full text-sm font-bold py-2.5 rounded-xl text-white flex items-center justify-center gap-2"
          style={{ background: `linear-gradient(135deg,${B.blue},${B.navy})` }}>
          <Printer className="w-4 h-4" /> Print ID Card
        </button>
      </div>
    </div>
  );
}

function EmployeePanel({ employee, company }) {
  const qc = useQueryClient();
  const [showCard, setShowCard] = useState(false);

  const { data: detail } = useQuery({
    queryKey: ['employee-detail', employee.id],
    queryFn: () => hrEmployeesAPI.get(employee.id).then(r => r.data.data),
  });

  const idCardItem = detail?.lifecycle_checklist?.find(i => i.item_key === 'id_card');
  const issueMut = useMutation({
    mutationFn: (status) => hrEmployeesAPI.updateLifecycle(employee.id, idCardItem.id, { status }),
    onSuccess: () => { toast.success('Updated'); qc.invalidateQueries({ queryKey: ['employee-detail', employee.id] }); },
    onError: (e) => toast.error(e.response?.data?.error || 'Update failed'),
  });

  return (
    <div className="px-4 py-4 space-y-4">
      {idCardItem && (
        <div className="flex items-center gap-3 p-3 rounded-xl bg-gray-50">
          {idCardItem.status === 'done'
            ? <CheckCircle2 className="w-5 h-5 flex-shrink-0" style={{ color: B.success }} />
            : <Circle className="w-5 h-5 flex-shrink-0 text-gray-300" />}
          <span className="text-sm font-bold text-gray-700 flex-1">ID Card Issued</span>
          <button disabled={issueMut.isPending} onClick={() => issueMut.mutate(idCardItem.status === 'done' ? 'pending' : 'done')}
            className="text-xs font-bold px-3 py-1.5 rounded-lg disabled:opacity-50"
            style={idCardItem.status === 'done' ? { background: '#F1F5F9', color: '#64748B' } : { background: B.success, color: '#fff' }}>
            {idCardItem.status === 'done' ? 'Mark Pending' : 'Mark Issued'}
          </button>
        </div>
      )}
      <button onClick={() => setShowCard(true)}
        className="w-full text-xs font-bold px-3 py-2.5 rounded-xl border border-gray-200 flex items-center justify-center gap-1.5 hover:bg-gray-50">
        <IdCard className="w-3.5 h-3.5" style={{ color: B.blue }} /> Generate / Print ID Card
      </button>
      {showCard && <IDCardPreview employee={{ ...employee, ...detail }} company={company} onClose={() => setShowCard(false)} />}
    </div>
  );
}

export default function IDCardGenerationPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [openId, setOpenId] = useState(null);

  const { data, isLoading } = useQuery({
    queryKey: ['onboarding-employees-idcard', search, departmentId],
    queryFn: () => hrOnboardingAPI.employees({ search: search || undefined, department_id: departmentId || undefined, limit: 100 }).then(r => r.data.data),
  });
  const { data: company } = useQuery({
    queryKey: ['company-settings'],
    queryFn: () => companySettingsAPI.get().then(r => r.data.data),
  });
  const { data: departments } = useQuery({
    queryKey: ['hr-departments'],
    queryFn: () => hrMastersAPI.listDepts().then(r => r.data?.data || []),
  });

  const employees = data || [];

  return (
    <div className="min-h-screen p-4 md:p-6" style={{ background: B.bg }}>
      <button onClick={() => navigate('/hr-admin/onboarding')} className="flex items-center gap-1.5 text-sm font-bold text-gray-500 hover:text-gray-700 mb-4">
        <ArrowLeft className="w-4 h-4" /> Back to Onboarding Dashboard
      </button>

      <motion.div {...fade(0)} className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: `${B.blue}18` }}>
          <IdCard className="w-5 h-5" style={{ color: B.blue }} />
        </div>
        <div>
          <h1 className="text-xl font-black text-gray-900">ID Card Generation</h1>
          <p className="text-xs text-gray-400">Generate and print employee ID cards</p>
        </div>
      </motion.div>

      <motion.div {...fade(0.05)} className="bg-white rounded-2xl p-3 mb-4 border border-gray-100 flex flex-wrap items-center gap-3" style={{ boxShadow: '0 2px 12px rgba(10,31,92,0.06)' }}>
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
                    <EmployeePanel employee={emp} company={company} />
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
