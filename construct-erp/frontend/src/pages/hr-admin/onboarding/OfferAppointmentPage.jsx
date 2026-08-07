// src/pages/hr-admin/onboarding/OfferAppointmentPage.jsx
// Offer & Appointment — generate/track offer and appointment letters per
// new hire, and toggle the "offer_acceptance" onboarding checklist item.
// Reuses the existing Letter Generation feature (hrLettersAPI) rather than
// building a parallel letter system — this page is a focused onboarding
// view over it, scoped to letter_type in ('offer','appointment').
import React, { useState } from 'react';
import DOMPurify from 'dompurify';
import { motion, AnimatePresence } from 'framer-motion';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  FileSignature, Search, ArrowLeft, ChevronDown, CheckCircle2, Circle,
  FilePlus2, Eye, Printer, X,
} from 'lucide-react';
import { hrOnboardingAPI, hrEmployeesAPI, hrLettersAPI, hrMastersAPI } from '../../../api/client';
import { B, fade, avatarGrad, initials } from '../../../components/hr/DashboardKit';

function fmtDate(d) { return d ? new Date(d).toLocaleDateString('en-IN') : '—'; }

const EXTRA_FIELDS = {
  offer:       [{ key: 'ctc_annual',   label: 'CTC (Annual ₹)' }],
  appointment: [{ key: 'basic_salary', label: 'Basic Salary (Monthly ₹)' }],
};

function LetterPreviewModal({ letter, onClose }) {
  const handlePrint = () => {
    const win = window.open('', '_blank');
    win.document.write(`<html><head><title>${letter.subject || 'Letter'}</title><style>
      body{font-family:'Times New Roman',serif;margin:25mm 20mm;line-height:1.6;}
    </style></head><body>${DOMPurify.sanitize(letter.content_html)}</body></html>`);
    win.document.close();
    setTimeout(() => win.print(), 300);
  };
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[85vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4 gap-3">
          <h3 className="font-black text-gray-900 text-sm flex-1">{letter.subject}</h3>
          <button onClick={handlePrint} className="text-xs font-bold px-3 py-1.5 rounded-lg text-white flex items-center gap-1.5 flex-shrink-0" style={{ background: B.blue }}>
            <Printer className="w-3.5 h-3.5" /> Print
          </button>
          <button onClick={onClose} className="flex-shrink-0"><X className="w-5 h-5 text-gray-400" /></button>
        </div>
        <div className="text-sm text-gray-800" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(letter.content_html) }} />
      </div>
    </div>
  );
}

function GenerateLetterModal({ employee, letterType, templates, onClose, onGenerated }) {
  const typeTemplates = templates.filter(t => t.type === letterType);
  const [templateId, setTemplateId] = useState(typeTemplates[0]?.id || '');
  const [extra, setExtra] = useState({});
  const fields = EXTRA_FIELDS[letterType] || [];

  const mut = useMutation({
    mutationFn: () => hrLettersAPI.generate({ employee_id: employee.id, template_id: templateId, extra_data: extra }),
    onSuccess: (r) => { toast.success('Letter generated'); onGenerated(r.data.data); onClose(); },
    onError: (e) => toast.error(e.response?.data?.error || 'Failed to generate'),
  });

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl max-w-md w-full p-6" onClick={e => e.stopPropagation()}>
        <h3 className="font-black text-gray-900 mb-1">Generate {letterType === 'offer' ? 'Offer' : 'Appointment'} Letter</h3>
        <p className="text-xs text-gray-400 mb-4">{employee.name} · {employee.employee_code}</p>

        {typeTemplates.length === 0 && (
          <p className="text-xs text-red-500 mb-4">No {letterType} template found. Add one under Letter Generation first.</p>
        )}
        {typeTemplates.length > 1 && (
          <select value={templateId} onChange={e => setTemplateId(e.target.value)}
            className="w-full text-sm px-3 py-2 rounded-lg border border-gray-200 mb-3 focus:outline-none">
            {typeTemplates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        )}
        {fields.map(f => (
          <input key={f.key} type="number" placeholder={f.label} value={extra[f.key] || ''}
            onChange={e => setExtra(prev => ({ ...prev, [f.key]: e.target.value }))}
            className="w-full text-sm px-3 py-2 rounded-lg border border-gray-200 mb-3 focus:outline-none" />
        ))}
        <div className="flex gap-2 mt-2">
          <button disabled={!templateId || mut.isPending} onClick={() => mut.mutate()}
            className="flex-1 text-sm font-bold py-2.5 rounded-xl text-white disabled:opacity-50"
            style={{ background: `linear-gradient(135deg,${B.blue},${B.navy})` }}>
            Generate
          </button>
          <button onClick={onClose} className="px-4 py-2.5 rounded-xl text-sm font-bold bg-gray-100 text-gray-500">Cancel</button>
        </div>
      </div>
    </div>
  );
}

function EmployeePanel({ employee, templates }) {
  const qc = useQueryClient();
  const [genType, setGenType] = useState(null); // 'offer' | 'appointment' | null
  const [previewLetter, setPreviewLetter] = useState(null);

  const { data: detail } = useQuery({
    queryKey: ['employee-detail', employee.id],
    queryFn: () => hrEmployeesAPI.get(employee.id).then(r => r.data.data),
  });
  const { data: letters, refetch: refetchLetters } = useQuery({
    queryKey: ['offer-letters', employee.id],
    queryFn: () => hrLettersAPI.generated({ employee_id: employee.id }).then(r => r.data.data),
  });

  const acceptance = detail?.lifecycle_checklist?.find(i => i.item_key === 'offer_acceptance');
  const acceptMut = useMutation({
    mutationFn: (status) => hrEmployeesAPI.updateLifecycle(employee.id, acceptance.id, { status }),
    onSuccess: () => { toast.success('Updated'); qc.invalidateQueries({ queryKey: ['employee-detail', employee.id] }); },
    onError: (e) => toast.error(e.response?.data?.error || 'Update failed'),
  });

  const relevantLetters = (letters || []).filter(l => l.letter_type === 'offer' || l.letter_type === 'appointment');

  return (
    <div className="px-4 py-4 space-y-4">
      {acceptance && (
        <div className="flex items-center gap-3 p-3 rounded-xl bg-gray-50">
          {acceptance.status === 'done'
            ? <CheckCircle2 className="w-5 h-5 flex-shrink-0" style={{ color: B.success }} />
            : <Circle className="w-5 h-5 flex-shrink-0 text-gray-300" />}
          <span className="text-sm font-bold text-gray-700 flex-1">Offer / Appointment Accepted</span>
          <button disabled={acceptMut.isPending} onClick={() => acceptMut.mutate(acceptance.status === 'done' ? 'pending' : 'done')}
            className="text-xs font-bold px-3 py-1.5 rounded-lg disabled:opacity-50"
            style={acceptance.status === 'done' ? { background: '#F1F5F9', color: '#64748B' } : { background: B.success, color: '#fff' }}>
            {acceptance.status === 'done' ? 'Mark Pending' : 'Mark Accepted'}
          </button>
        </div>
      )}

      <div className="flex gap-2">
        <button onClick={() => setGenType('offer')}
          className="flex-1 text-xs font-bold px-3 py-2.5 rounded-xl border border-gray-200 flex items-center justify-center gap-1.5 hover:bg-gray-50">
          <FilePlus2 className="w-3.5 h-3.5" style={{ color: B.blue }} /> Generate Offer Letter
        </button>
        <button onClick={() => setGenType('appointment')}
          className="flex-1 text-xs font-bold px-3 py-2.5 rounded-xl border border-gray-200 flex items-center justify-center gap-1.5 hover:bg-gray-50">
          <FilePlus2 className="w-3.5 h-3.5" style={{ color: B.blue }} /> Generate Appointment Letter
        </button>
      </div>

      <div>
        <p className="text-[11px] font-black text-gray-500 uppercase tracking-wide mb-2">Generated Letters</p>
        {relevantLetters.length === 0 && <p className="text-xs text-gray-400">No offer/appointment letters generated yet.</p>}
        <div className="space-y-1.5">
          {relevantLetters.map(l => (
            <div key={l.id} className="flex items-center gap-2.5 p-2 rounded-lg bg-gray-50">
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-blue-50 flex-shrink-0" style={{ color: B.blue }}>
                {l.letter_type === 'offer' ? 'Offer' : 'Appointment'}
              </span>
              <span className="text-sm font-semibold text-gray-700 flex-1 truncate">{l.reference_no}</span>
              <span className="text-[11px] text-gray-400 flex-shrink-0">{fmtDate(l.generated_on)}</span>
              <button onClick={() => setPreviewLetter(l)} className="flex-shrink-0"><Eye className="w-4 h-4 text-gray-400 hover:text-blue-500" /></button>
            </div>
          ))}
        </div>
      </div>

      {genType && (
        <GenerateLetterModal employee={employee} letterType={genType} templates={templates}
          onClose={() => setGenType(null)} onGenerated={() => refetchLetters()} />
      )}
      {previewLetter && <LetterPreviewModal letter={previewLetter} onClose={() => setPreviewLetter(null)} />}
    </div>
  );
}

export default function OfferAppointmentPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [openId, setOpenId] = useState(null);

  const { data, isLoading } = useQuery({
    queryKey: ['onboarding-employees-offer', search, departmentId],
    queryFn: () => hrOnboardingAPI.employees({ search: search || undefined, department_id: departmentId || undefined, limit: 100 }).then(r => r.data.data),
  });
  const { data: templates } = useQuery({
    queryKey: ['letter-templates'],
    queryFn: () => hrLettersAPI.templates().then(r => r.data.data),
  });
  const { data: departments } = useQuery({
    queryKey: ['hr-departments'],
    queryFn: () => hrMastersAPI.listDepts().then(r => r.data),
  });

  const employees = data || [];

  return (
    <div className="min-h-screen p-4 md:p-6" style={{ background: B.bg }}>
      <button onClick={() => navigate('/hr-admin/onboarding')} className="flex items-center gap-1.5 text-sm font-bold text-gray-500 hover:text-gray-700 mb-4">
        <ArrowLeft className="w-4 h-4" /> Back to Onboarding Dashboard
      </button>

      <motion.div {...fade(0)} className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: `${B.blue}18` }}>
          <FileSignature className="w-5 h-5" style={{ color: B.blue }} />
        </div>
        <div>
          <h1 className="text-xl font-black text-gray-900">Offer &amp; Appointment</h1>
          <p className="text-xs text-gray-400">Generate offer/appointment letters and track acceptance, per new hire</p>
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
                    <EmployeePanel employee={emp} templates={templates || []} />
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
